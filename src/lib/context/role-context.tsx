"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useSession } from 'next-auth/react';
import { UserRole, ROLE_FEATURES, FeatureAccess, hasFeatureAccess, getFeatureLimit } from '../roles';

interface RoleContextType {
  userRole: UserRole;
  features: FeatureAccess;
  hasAccess: (feature: keyof FeatureAccess) => boolean;
  getLimit: (feature: keyof Pick<FeatureAccess, 'passwordLimit' | 'fileStorageLimit'>) => number;
  isLoading: boolean;
}

// Default to free tier
const defaultRole: UserRole = 'free';

const RoleContext = createContext<RoleContextType>({
  userRole: defaultRole,
  features: ROLE_FEATURES[defaultRole],
  hasAccess: () => false,
  getLimit: () => 0,
  isLoading: true,
});

export function RoleProvider({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  const [userRole, setUserRole] = useState<UserRole>(defaultRole);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    async function fetchUserRole() {
      if (status === 'authenticated' && session?.user?.email) {
        try {
          // Fetch user subscription details from your API
          const response = await fetch('/api/users/role', {
            credentials: 'include'
          });
          if (response.ok) {
            const data = await response.json();
            setUserRole(data.role as UserRole);
          } else {
            // If there's an error, default to free tier
            setUserRole('free');
            console.error('Failed to fetch user role');
          }
        } catch (error) {
          console.error('Error fetching user role:', error);
          setUserRole('free');
        } finally {
          setIsLoading(false);
        }
      } else if (status === 'unauthenticated') {
        setUserRole('free');
        setIsLoading(false);
      }
    }

    fetchUserRole();
  }, [session, status]);

  const features = ROLE_FEATURES[userRole];

  const value = {
    userRole,
    features,
    hasAccess: (feature: keyof FeatureAccess) => hasFeatureAccess(userRole, feature),
    getLimit: (feature: keyof Pick<FeatureAccess, 'passwordLimit' | 'fileStorageLimit'>) => getFeatureLimit(userRole, feature),
    isLoading,
  };

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export const useRole = () => useContext(RoleContext);
