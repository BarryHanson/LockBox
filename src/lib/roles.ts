// Role-based access control system
export type UserRole = 'free' | 'pro' | 'admin' | 'team_member';

export interface FeatureAccess {
  passwordLimit: number;
  advancedPasswordGenerator: boolean;
  secureNotes: boolean;
  mobileAccess: boolean;
  secureFileStorage: boolean; // If true, user has access to secure file storage
  fileStorageLimit: number; // In MB
  subscriptionTracking: boolean;
  prioritySupport: boolean;
  privacyMonitoring: boolean;
  teamPasswordSharing: boolean;
  adminDashboard: boolean;
  usageAnalytics: boolean;
}

export const ROLE_FEATURES: Record<UserRole, FeatureAccess> = {
  free: {
    passwordLimit: 50,
    advancedPasswordGenerator: false,
    secureNotes: true,
    mobileAccess: true,
    secureFileStorage: false,
    fileStorageLimit: 0,
    subscriptionTracking: true, // Now part of the free plan
    prioritySupport: false,
    privacyMonitoring: false,
    teamPasswordSharing: false,
    adminDashboard: false,
    usageAnalytics: false
  },
  pro: {
    passwordLimit: Infinity,
    advancedPasswordGenerator: true,
    secureNotes: true,
    mobileAccess: true,
    secureFileStorage: true,
    fileStorageLimit: 1024, // 1GB in MB
    subscriptionTracking: true,
    prioritySupport: true,
    privacyMonitoring: true,
    teamPasswordSharing: false,
    adminDashboard: false,
    usageAnalytics: false
  },
  admin: {
    passwordLimit: Infinity,
    advancedPasswordGenerator: true,
    secureNotes: true,
    mobileAccess: true,
    secureFileStorage: true,
    fileStorageLimit: 2048, // 2GB in MB
    subscriptionTracking: true,
    prioritySupport: true,
    privacyMonitoring: true,
    teamPasswordSharing: true,
    adminDashboard: true,
    usageAnalytics: true
  },
  team_member: {
    passwordLimit: Infinity,
    advancedPasswordGenerator: true,
    secureNotes: true,
    mobileAccess: true,
    secureFileStorage: true,
    fileStorageLimit: 1024, // 1GB in MB
    subscriptionTracking: true,
    prioritySupport: true,
    privacyMonitoring: true,
    teamPasswordSharing: true,
    adminDashboard: false,
    usageAnalytics: false
  }
};

/**
 * Checks if a user with the given role has access to a specific feature
 */
export function hasFeatureAccess(role: UserRole, feature: keyof FeatureAccess): boolean {
  return ROLE_FEATURES[role][feature] === true;
}

/**
 * Gets the limit for a specific numerical feature (like storage or password limit)
 */
export function getFeatureLimit(role: UserRole, feature: keyof Pick<FeatureAccess, 'passwordLimit' | 'fileStorageLimit'>): number {
  return ROLE_FEATURES[role][feature] as number;
}
