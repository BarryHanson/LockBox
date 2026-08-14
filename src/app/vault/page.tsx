"use client";

import { motion } from "framer-motion";
import { User, Key, CreditCard, Shield, Plus, Edit2, Trash2, Eye, EyeOff, Copy, Check, StickyNote, Pin, ShieldAlert, LogOut, ShieldCheck, File, Share2 } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { signOut, useSession } from 'next-auth/react';
import { useState, useEffect, useCallback, useMemo } from 'react';
import Fuse from 'fuse.js';
import DOMPurify from 'dompurify';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Transactions } from '@/components/Transactions';
import { CardForm } from "@/components/card-form";
import { PasswordForm } from '@/components/password-form';
import { NoteForm } from '@/components/note-form';
import { FileForm } from '@/components/file-form';
import { FileList } from '@/components/file-list';
import { PrivacyScanner } from '@/components/PrivacyScanner';
import { AccountDiscovery } from '@/components/AccountDiscovery';
import { DecryptedField } from '@/components/DecryptedField';
import { retrieveEncryptionKey, storeEncryptionKey, clearEncryptionKey, encryptObject, decryptObject, ensureEncryptionKeyAvailable as cryptoEnsureKeyAvailable, debugStorageState, decrypt, deriveKeyFromPassword, exportCryptoKey, base64ToArrayBuffer, arrayBufferToBase64, encrypt } from '@/lib/clientCrypto';
import { VaultPasswordPrompt } from "@/components/VaultPasswordPrompt";
import { useVault } from '@/components/providers/VaultProvider';
import { useUser } from '@/hooks/useUser';
import { ThemeToggle } from '@/components/theme-toggle';

// Helper functions for password strength
const calculatePasswordStrength = (password: string): number => {
  if (!password) return 0;
  
  let strength = 0;
  const length = password.length;
  
  // Length contributes up to 50 points
  strength += Math.min(50, (length * 50) / 20); // Max 50 points for 20+ chars
  
  // Character variety
  const hasLowercase = /[a-z]/.test(password);
  const hasUppercase = /[A-Z]/.test(password);
  const hasNumbers = /[0-9]/.test(password);
  const hasSpecial = /[^a-zA-Z0-9]/.test(password);
  
  // Variety contributes up to 30 points
  const varietyCount = [hasLowercase, hasUppercase, hasNumbers, hasSpecial]
    .filter(Boolean).length;
  strength += (varietyCount * 30) / 4;
  
  // Deductions for common patterns
  if (length < 8) strength -= 20;
  if (password === password.toLowerCase() || password === password.toUpperCase()) {
    strength -= 15;
  }
  if (/^[a-zA-Z]+$/.test(password)) strength -= 10;
  if (/^[0-9]+$/.test(password)) strength -= 20;
  
  // Ensure strength is between 0-100
  return Math.max(0, Math.min(100, Math.round(strength)));
};

const getStrengthLabel = (strength: number): string => {
  if (strength < 20) return 'Very Weak';
  if (strength < 40) return 'Weak';
  if (strength < 60) return 'Moderate';
  if (strength < 80) return 'Strong';
  return 'Very Strong';
};

const getStrengthColor = (strength: number): string => {
  if (strength < 20) return 'bg-red-600';
  if (strength < 40) return 'bg-orange-600';
  if (strength < 60) return 'bg-yellow-500';
  if (strength < 80) return 'bg-emerald-500';
  return 'bg-emerald-400';
};

interface EncryptionMetadata {
  [key: string]: { iv: string; salt: string };
}

interface Password {
  id: string;
  title: string;
  username: string;
  password: string;
  url?: string;
  notes?: string;
  strength?: number;
  createdAt: string;
  encryptionData?: EncryptionMetadata;
}

interface Tag {
  id: string;
  name: string;
  // userId?: string; // Optional, as frontend might not always need it directly on tag object
  // createdAt?: string;
  // updatedAt?: string;
}

interface Note {
  id: string;
  userId: string;
  encryptedTitle: string;
  encryptedContent: string;
  encryptionMetadata: Record<string, any>; 
  lastModified: string; // Added lastModified field
  isPinned: boolean; // For pinning notes
  tags?: Tag[]; // For associated tags
  // Decrypted fields, optional as they are added client-side
  title?: string;
  content?: string;
}

interface Card {
  id: string;
  name: string;
  cardNumber: string;
  expiryMonth: number;
  expiryYear: number;
  cvv: string;
  billingAddress?: string;
  tags: string[];
  createdAt: string;
  encryptionData?: EncryptionMetadata;
}

interface SecureFile {
  id: string;
  fileName: string;
  encryptedName?: string | null;
  storageKey?: string | null;
  fileSize: number;
  mimeType: string;
  iv?: string | null;
  authTag?: string | null;
  encryptionMetadata?: any;
  createdAt: string;
  updatedAt: string;
}

type ShareDuration = 'one_time' | 'forever' | 'one_day' | 'one_month';
type ShareItemType = 'PASSWORD' | 'CARD' | 'NOTE' | 'FILE';

type ShareablePayload =
  | { type: 'PASSWORD'; title: string; username: string; password: string; url?: string; notes?: string }
  | { type: 'CARD'; name: string; cardNumber: string; expiryMonth: number; expiryYear: number; cvv: string; billingAddress?: string; tags?: string[] }
  | { type: 'NOTE'; title: string; content: string }
  | { type: 'FILE'; fileName: string; mimeType: string; fileSize: number; dataIv: string; dataKey: string };

export default function AppPage() {
  const router = useRouter();

  // State variables
  const [passwords, setPasswords] = useState<Password[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [files, setFiles] = useState<SecureFile[]>([]);
  const [noteFuse, setNoteFuse] = useState<Fuse<Note> | null>(null);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedStates, setCopiedStates] = useState<Record<string, boolean>>({});
  const [selectedItem, setSelectedItem] = useState<Password | Card | Note | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('passwords');
  const [showVaultPrompt, setShowVaultPrompt] = useState(false); // Local UI control for the prompt
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmittingDialog, setIsSubmittingDialog] = useState(false);
  const [currentSortOption, setCurrentSortOption] = useState<string>('lastModified_desc');
  const [noteSortOrder, setNoteSortOrder] = useState<string>('newest');
  const [showPrivacyScanner, setShowPrivacyScanner] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showShareItemDialog, setShowShareItemDialog] = useState(false);
  const [shareDuration, setShareDuration] = useState<ShareDuration>('one_time');
  const [generatedShareLink, setGeneratedShareLink] = useState('');
  const [shareItemError, setShareItemError] = useState('');
  const [isGeneratingShareLink, setIsGeneratingShareLink] = useState(false);
  const [shareItemType, setShareItemType] = useState<ShareItemType | null>(null);
  const [shareItemId, setShareItemId] = useState<string | null>(null);
  const [shareItemLabel, setShareItemLabel] = useState('');
  const [shareItemSnapshot, setShareItemSnapshot] = useState<any>(null);

  // Hooks
  const { data: session, status: sessionStatus } = useSession();
  const { user, loading: userLoading, error: userError, logout: userLogout, refetch: refetchUser } = useUser();

  // --- ADDED: authoritative DB user (includes UserSubscription) ---
  const [dbUser, setDbUser] = useState<any | null>(null);

  const fetchDbUser = useCallback(async () => {
    try {
      const res = await fetch('/api/user/me', {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setDbUser(data);
      } else {
        setDbUser(null);
      }
    } catch (err) {
      setDbUser(null);
    }
  }, []);

  useEffect(() => {
    // Check if we just logged in (important for mobile where timing can be inconsistent)
    const justLoggedIn = localStorage.getItem('justLoggedIn');
    if (justLoggedIn) {
      localStorage.removeItem('justLoggedIn');
      // Trigger a refetch of user data to ensure we have latest info after login
      if (refetchUser) {
        refetchUser();
      }
    }
  }, [refetchUser]);

  useEffect(() => {
    // Try to fetch DB user whenever auth/session state changes and user is authenticated.
    // Use sessionStatus === 'authenticated' as the primary trigger (falls back to user).
    if (sessionStatus === 'authenticated' || !!user) {
      fetchDbUser();
    } else {
      setDbUser(null);
    }
  }, [user, fetchDbUser]);
  // --- END ADDED ---
  
  // Subscription-derived helpers
  // Prefer the DB-fetched userSubscription, fall back to useUser hook data, then default to FREE
  const plan = (
    (dbUser?.userSubscription?.plan) ??
    ((user as any)?.userSubscription?.plan) ??
    ((user as any)?.subscription?.plan) ??
    'FREE'
  ) as string;
  const planDisplay = plan === 'PRO' ? 'Pro' : plan === 'TEAM' ? 'Team' : 'Free';

  // Normalized feature flags/limits derived from the plan.
  // Use these both for client-side UX gating and (critically) enforce same checks on server APIs.
  const features = {
    canUsePrivacyScanner: plan !== 'FREE',
    maxPasswords: plan === 'PRO' || plan === 'TEAM' ? Infinity : 50,
    canUseTeamSharing: plan === 'TEAM',
    canUsePrioritySupport: plan === 'PRO' || plan === 'TEAM',
    // expose team/admin flags from DB userSubscription if present
    isTeamAdmin: !!(dbUser?.userSubscription?.isAdmin ?? (user as any)?.userSubscription?.isAdmin),
    teamId: dbUser?.userSubscription?.teamId ?? (user as any)?.userSubscription?.teamId ?? null,
  };
  const canShareItems = plan === 'PRO' || plan === 'TEAM';
  
  // Helpful debug output while developing to confirm the app sees the DB value
  useEffect(() => {
  }, [plan]);

  const isAuthenticated = !!user; // Infer isAuthenticated
  const { 
    isVaultUnlocked, 
    doesVaultNeedSetup, 
    isCheckingVaultStatus, 
    checkVaultStatusNow,
    markVaultAsLocked
  } = useVault();

  useEffect(() => {
    const fetchTags = async () => {
      try {
        const response = await fetch('/api/tags', {
          credentials: 'include',
        });
        if (!response.ok) {
          if (response.status === 401) router.push('/login');
          throw new Error('Failed to fetch tags');
        }
        const fetchedTags: Tag[] = await response.json();
        setAllTags(fetchedTags);
      } catch (error) {
        console.error("Error fetching tags:", error);
        // Potentially show an error to the user
      }
    };

    fetchTags();
  }, [router]);

  // Filter passwords based on search query
  const filteredPasswords = passwords.filter(password => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      password.title.toLowerCase().includes(query) ||
      password.username.toLowerCase().includes(query) ||
      (password.url?.toLowerCase().includes(query) || false) ||
      (password.notes?.toLowerCase().includes(query) || false)
    );
  });
  
  const filteredCards = cards.filter(card => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      card.name.toLowerCase().includes(query) ||
      (card.billingAddress?.toLowerCase().includes(query) || false)
    );
  });

  useEffect(() => {
    if (notes && notes.length > 0) {
      // Filter for notes that have been decrypted and have content
      const notesToIndex = notes.filter(note => typeof note.title === 'string' && typeof note.content === 'string');
      if (notesToIndex.length > 0) {
        const fuse = new Fuse(notesToIndex, {
          keys: ['title', 'content'], // Search in title and content
          includeScore: true,        // Include score in results for ranking (optional)
          threshold: 0.4,            // Adjust sensitivity (0.0 = exact, 1.0 = match anything)
          // ignoreLocation: true,   // Useful if search term location doesn't matter
        });
        setNoteFuse(fuse);
      } else {
        setNoteFuse(null); // No notes with content to index
      }
    } else {
      setNoteFuse(null); // No notes at all
    }
  }, [notes]); // Re-run when the main 'notes' array changes

  const filteredNotes = useMemo(() => {
    // Helper function to sort notes: pinned first, then by lastModified descending
    const sortNotesLogic = (notesToSort: Note[]): Note[] => {
      const getTitle = (note: Note) => (note.title || "Untitled Note").toLowerCase();

      return [...notesToSort].sort((a, b) => {
        // Pinned notes come first
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;

        // If both are pinned or both are unpinned, sort by selected order
        const dateA = a.lastModified ? new Date(a.lastModified).getTime() : 0;
        const dateB = b.lastModified ? new Date(b.lastModified).getTime() : 0;

        switch (noteSortOrder) {
          case 'oldest':
            return dateA - dateB;
          case 'title_asc':
            return getTitle(a).localeCompare(getTitle(b));
          case 'title_desc':
            return getTitle(b).localeCompare(getTitle(a));
          case 'newest':
          default:
            return dateB - dateA;
        }
      });
    };

    const trimmedQuery = searchQuery.trim().toLowerCase();

    if (!trimmedQuery) {
      // If no search query, return all notes, sorted
      return sortNotesLogic(notes);
    }

    let currentNotesToShow: Note[];
    if (noteFuse) {
      // If Fuse.js is available, use it for searching
      const results = noteFuse.search(trimmedQuery);
      currentNotesToShow = results.map(result => result.item);
    } else {
      // Fallback to simple text filter if Fuse.js is not initialized
      currentNotesToShow = notes.filter(note => 
        (note.title?.toLowerCase().includes(trimmedQuery) ||
         note.content?.toLowerCase().includes(trimmedQuery))
      );
    }
    
    // Sort the filtered/searched notes
    return sortNotesLogic(currentNotesToShow);
  }, [notes, searchQuery, noteFuse]);

  // Handle user logout
  async function handleLogout() {
    try {
      // Clear encryption keys from local storage
      clearEncryptionKey();
      
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include'
      });
      
      // Clear vault state
      markVaultAsLocked();
      
      // Redirect to login without showing NextAuth page
      window.location.href = '/login';
    } catch (error) {
      console.error('Error during logout:', error);
      // Still redirect to login even on error
      window.location.href = '/login';
    }
  }

  const handleCloseDialog = () => {
    setIsEditDialogOpen(false);
    setSelectedItem(null);
  };

  const fetchPasswords = useCallback(async () => {
    try {
      const response = await fetch('/api/passwords', {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        
        const processedData = await Promise.all(data.map(async (password: Password) => {
          try {
            if (!password.encryptionData) {
              return {
                ...password,
                strength: calculatePasswordStrength(password.password)
              };
            }
            
            const encryptionKey = await retrieveEncryptionKey();
            
            if (!encryptionKey) {
              return password;
            }
            
            const decrypted = await decryptObject(
              password,
              encryptionKey,
              ['password', 'username'] as const,
              password.encryptionData
            );
            
            return {
              ...decrypted,
              strength: calculatePasswordStrength(decrypted.password),
              id: password.id,
              title: password.title,
              url: password.url,
              notes: password.notes,
              createdAt: password.createdAt,
              encryptionData: password.encryptionData
            };
          } catch (error) {
            console.error('Error decrypting password:', error);
            return password;
          }
        }));
        
        setPasswords(processedData);
      }
    } catch (error) {
      console.error('Failed to fetch passwords:', error);
    }
  }, []);

  const fetchCards = useCallback(async () => {
    try {
      const response = await fetch('/api/cards', {
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        const processedData = await Promise.all(data.map(async (card: Card) => {
          try {
            if (!card.encryptionData) {
              return card;
            }
            
            const encryptionKey = await retrieveEncryptionKey();
            
            if (!encryptionKey) {
              return card;
            }
            
            return await decryptObject(
              card,
              encryptionKey,
              ['cardNumber', 'cvv'] as const,
              card.encryptionData
            );
          } catch (error) {
            console.error('Error decrypting card:', error);
            return card;
          }
        }));
        
        setCards(processedData);
      }
    } catch (error) {
      console.error('Failed to fetch cards:', error);
    }
  }, []);

  const fetchNotes = useCallback(async () => {
    const key = await cryptoEnsureKeyAvailable();
    if (!key) {
      return;
    }
    
    try {
      const response = await fetch('/api/notes', {
        credentials: 'include',
      });
      if (!response.ok) {
        if (response.status === 401) router.push('/login');
        throw new Error('Failed to fetch notes');
      }
      const data = await response.json();
      const processedData = await Promise.all(data.map(async (note: Note) => {
        let title = note.title; 
        let content = note.content;

        try {
          const key = await retrieveEncryptionKey();
          if (key && note.encryptionMetadata) {
            const exportedKeyString = await exportCryptoKey(key);

            if (note.encryptedTitle && note.encryptionMetadata.title?.iv && note.encryptionMetadata.title?.salt) {
              const ivArrayTitle = base64ToArrayBuffer(note.encryptionMetadata.title.iv);
              const saltArrayTitle = base64ToArrayBuffer(note.encryptionMetadata.title.salt);
              const { key: derivedKeyTitle } = await deriveKeyFromPassword(exportedKeyString, new Uint8Array(saltArrayTitle));
              title = await decrypt(note.encryptedTitle, derivedKeyTitle, new Uint8Array(ivArrayTitle));
            }

            if (note.encryptedContent && note.encryptionMetadata.content?.iv && note.encryptionMetadata.content?.salt) {
              const ivArrayContent = base64ToArrayBuffer(note.encryptionMetadata.content.iv);
              const saltArrayContent = base64ToArrayBuffer(note.encryptionMetadata.content.salt);
              const { key: derivedKeyContent } = await deriveKeyFromPassword(exportedKeyString, new Uint8Array(saltArrayContent));
              content = await decrypt(note.encryptedContent, derivedKeyContent, new Uint8Array(ivArrayContent));
            }
          }
        } catch (error) {
          console.error('Error decrypting note:', error, note.id);
        }
        return { ...note, title, content };
      }));
      
      setNotes(processedData);
    } catch (error) {
      console.error('Error fetching notes:', error);
      // Potentially clear notes or show an error message to the user
      setNotes([]);
    }
  }, []);

  const fetchFiles = useCallback(async () => {
    if (plan !== 'PRO' && plan !== 'TEAM') return;

    try {
      const response = await fetch('/api/files', {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setFiles(data);
      }
    } catch (error) {
      console.error('Failed to fetch files:', error);
    }
  }, [plan]);

  const handleTogglePin = async (noteId: string, currentIsPinned: boolean) => {
    const newIsPinned = !currentIsPinned;

    // Optimistic update: Store the original notes for potential rollback
    const originalNotes = notes.map(n => ({...n})); // Create a shallow copy of notes array and objects
    
    setNotes(prevNotes => 
      prevNotes.map(note => 
        note.id === noteId ? { ...note, isPinned: newIsPinned } : note
      )
    );

    try {
      const noteToUpdate = originalNotes.find(n => n.id === noteId);

      if (!noteToUpdate) {
        setNotes(originalNotes); // Revert optimistic update
        return;
      }

      const response = await fetch(`/api/notes/${noteId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          encryptedTitle: noteToUpdate.encryptedTitle, // Must send existing encrypted fields
          encryptedContent: noteToUpdate.encryptedContent,
          encryptionMetadata: noteToUpdate.encryptionMetadata,
          lastModified: noteToUpdate.lastModified, // Preserve lastModified unless intentionally changing
          isPinned: newIsPinned 
        }),
      });

      if (!response.ok) {
        let errorDetails = await response.text();
        try { errorDetails = JSON.parse(errorDetails); } catch(e) { /* Keep as text if not JSON */ }
        console.error('Failed to update pin status on server:', response.status, errorDetails);
        throw new Error(`Server error: ${response.status}`);
      }
      
      // On successful API call, re-fetch notes to ensure consistency and proper sorting
      await fetchNotes(); 

    } catch (error) {
      console.error('Error toggling pin status:', error);
      // Revert optimistic update on error
      setNotes(originalNotes);
      // Consider showing a user-facing error message here
    }
  };

  const loadKeyAndFetchData = useCallback(async () => {
    // Key availability is now ensured by the main useEffect reacting to useVault context.
    // This function is called only when vault is confirmed to be unlocked.
    try {
      // setShowVaultPrompt(false); // Prompt should already be closed by the time this is called or handled by main useEffect
      await Promise.allSettled([
        fetchPasswords(), 
        fetchCards(), 
        fetchNotes(),
        fetchFiles()
      ]).then(results => {
        results.forEach((result, index) => {
          if (result.status === 'rejected') {
          }
        });
      });
    } catch (error) {
      // The vault prompt should not be shown here as the issue is likely not vault lock status if we reached here.
    }
  }, [fetchPasswords, fetchCards, fetchNotes, fetchFiles]);

  // --- ADDED: try to restore encryption key from storage to avoid prompting on refresh ---
  useEffect(() => {
    const tryRestoreKey = async () => {
      // Only attempt when the auth session indicates the user is signed in
      if (sessionStatus !== 'authenticated' && !user) return;

      try {
        const key = await retrieveEncryptionKey(); // should return CryptoKey if stored in session/localStorage
        if (key) {
          setShowVaultPrompt(false);
          // If vault provider already thinks vault is unlocked it will call load; ensure we still load data
          await loadKeyAndFetchData();
        }
      } catch (err) {
        // fallback to normal behavior (VaultPasswordPrompt)
      }
    };

    tryRestoreKey();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionStatus, user]); // run when auth state changes
  // --- END ADDED ---

  useEffect(() => {
    // Step 1: Wait for primary loading states (session and user)
    if (sessionStatus === 'loading' || userLoading) {
      return;
    }

    // Step 2: Handle unauthenticated state
    // FIXED: Use isAuthenticated from useUser hook instead of session check
    if (!isAuthenticated) {
      setPasswords([]); 
      setCards([]); 
      setNotes([]); 
      setShowVaultPrompt(false);
      return;
    }

    // At this point, session is authenticated and user is loaded.
    // Step 3: Wait for vault status check to complete.
    if (isCheckingVaultStatus) {
      return;
    }

    // Step 4: All initial checks complete (session authenticated, user loaded, vault status checked).
    // Proceed with vault logic.

    if (isVaultUnlocked) {
      setShowVaultPrompt(false);
      loadKeyAndFetchData();
    } else { // Vault is locked or needs setup
      if (doesVaultNeedSetup === true) {
        setShowVaultPrompt(true);
      } else if (doesVaultNeedSetup === false) {
        setShowVaultPrompt(true);
      } else { // doesVaultNeedSetup is null
        // This state should ideally not be reached if isCheckingVaultStatus is false and VaultProvider correctly sets doesVaultNeedSetup.
        // Force the prompt to show even if doesVaultNeedSetup is null
        setShowVaultPrompt(true);
      }
    }

  }, [session, sessionStatus, userLoading, isCheckingVaultStatus, isVaultUnlocked, doesVaultNeedSetup, loadKeyAndFetchData, setShowVaultPrompt, setPasswords, setCards, setNotes, isAuthenticated]);

  const handleEdit = (item: Password | Card | Note | null) => {
    setSelectedItem(item);
    setIsEditDialogOpen(true);
  };

  const handleItemSelect = (item: Password | Card | Note | null, type: 'password' | 'card' | 'note' | null) => {   setIsEditDialogOpen(true);
  };

  const handleDelete = async (type: 'password' | 'card' | 'note', id: string) => {
    try {
      const response = await fetch(`/api/${type}s?id=${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (response.ok) {
        if (type === 'password') {
          setPasswords(prev => prev.filter(p => p.id !== id));
        } else if (type === 'card') {
          setCards(prev => prev.filter(c => c.id !== id));
        } else if (type === 'note') {
          setNotes(prev => prev.filter(n => n.id !== id));
        }
      }
    } catch (error) {
      console.error(`Failed to delete ${type}:`, error);
    }
  };

  const generateRandomBase64Url = (size: number) => {
    const bytes = new Uint8Array(size);
    globalThis.crypto.getRandomValues(bytes);
    return arrayBufferToBase64(bytes.buffer)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  };

  const sha256Hex = async (value: string) => {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  };

  const openShareItemDialog = (type: ShareItemType, itemId: string, label: string, snapshot: any) => {
    setShareItemError('');
    setGeneratedShareLink('');
    setShareItemType(type);
    setShareItemId(itemId);
    setShareItemLabel(label);
    setShareItemSnapshot(snapshot);
    setShowShareItemDialog(true);
  };

  const buildSharePayload = async (): Promise<ShareablePayload> => {
    if (!shareItemType || !shareItemSnapshot) {
      throw new Error('No item selected to share');
    }

    const encryptionKey = await retrieveEncryptionKey();
    if (!encryptionKey) {
      throw new Error('Vault is locked. Unlock your vault before sharing.');
    }

    if (shareItemType === 'PASSWORD') {
      const decrypted = shareItemSnapshot.encryptionData
        ? await decryptObject(
            shareItemSnapshot,
            encryptionKey,
            ['username', 'password', 'notes'] as const,
            shareItemSnapshot.encryptionData
          )
        : shareItemSnapshot;

      return {
        type: 'PASSWORD',
        title: shareItemSnapshot.title,
        username: decrypted.username,
        password: decrypted.password,
        url: shareItemSnapshot.url,
        notes: decrypted.notes || '',
      };
    }

    if (shareItemType === 'CARD') {
      const decrypted = shareItemSnapshot.encryptionData
        ? await decryptObject(
            shareItemSnapshot,
            encryptionKey,
            ['cardNumber', 'cvv', 'billingAddress'] as const,
            shareItemSnapshot.encryptionData
          )
        : shareItemSnapshot;

      return {
        type: 'CARD',
        name: shareItemSnapshot.name,
        cardNumber: decrypted.cardNumber,
        expiryMonth: shareItemSnapshot.expiryMonth,
        expiryYear: shareItemSnapshot.expiryYear,
        cvv: decrypted.cvv,
        billingAddress: decrypted.billingAddress || '',
        tags: shareItemSnapshot.tags || [],
      };
    }

    if (shareItemType === 'NOTE') {
      return {
        type: 'NOTE',
        title: shareItemSnapshot.title || 'Untitled Note',
        content: shareItemSnapshot.content || '',
      };
    }

    const dataSalt = shareItemSnapshot?.encryptionMetadata?.data?.salt;
    const dataIv = shareItemSnapshot?.encryptionMetadata?.data?.iv;
    if (!dataSalt || !dataIv) {
      throw new Error('This file format cannot be shared. Re-upload the file to use the latest encryption format.');
    }

    const exportedMasterKey = await exportCryptoKey(encryptionKey);
    const dataSaltBytes = new Uint8Array(base64ToArrayBuffer(dataSalt));
    const { key: dataKey } = await deriveKeyFromPassword(exportedMasterKey, dataSaltBytes);
    const exportedDataKey = await exportCryptoKey(dataKey);

    return {
      type: 'FILE',
      fileName: shareItemSnapshot.fileName,
      mimeType: shareItemSnapshot.mimeType,
      fileSize: shareItemSnapshot.fileSize,
      dataIv,
      dataKey: exportedDataKey,
    };
  };

  const handleGenerateShareLink = async () => {
    setShareItemError('');
    setGeneratedShareLink('');
    setIsGeneratingShareLink(true);

    try {
      if (!shareItemType || !shareItemId) {
        throw new Error('Please select an item to share.');
      }

      const payload = await buildSharePayload();
      const shareSecret = generateRandomBase64Url(32);
      const publicId = generateRandomBase64Url(12);
      const tokenHash = await sha256Hex(shareSecret);
      const shareSalt = globalThis.crypto.getRandomValues(new Uint8Array(16));
      const { key: shareKey } = await deriveKeyFromPassword(shareSecret, shareSalt);
      const { encrypted: payloadCipher, iv } = await encrypt(JSON.stringify(payload), shareKey);

      const response = await fetch('/api/share-items', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          publicId,
          tokenHash,
          itemType: shareItemType,
          itemId: shareItemId,
          payloadCipher,
          payloadIv: arrayBufferToBase64(iv.buffer),
          payloadSalt: arrayBufferToBase64(shareSalt.buffer),
          duration: shareDuration,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Could not generate share link.');
      }

      setGeneratedShareLink(`${window.location.origin}/share/${publicId}#k=${shareSecret}`);
    } catch (error) {
      setShareItemError(error instanceof Error ? error.message : 'Could not generate share link. Please try again.');
    } finally {
      setIsGeneratingShareLink(false);
    }
  };

  const handleCopyShareLink = async () => {
    if (!generatedShareLink) return;
    try {
      await navigator.clipboard.writeText(generatedShareLink);
    } catch {
      setShareItemError('Copy failed. Please copy the link manually.');
    }
  };

  return (
    <main className="min-h-screen bg-background">
      {/* Top Navigation Bar */}
      <div className="bg-background/80 backdrop-blur-xl border-b border-border/50 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 h-14 flex justify-between items-center">
          <div className="flex items-center gap-2.5">
            <div className="bg-gradient-to-br from-primary/20 to-primary/5 p-1.5 rounded-xl border border-primary/20">
              <Image
                src="/orange_logo_no_text.png"
                alt="ByteLock Logo"
                width={28}
                height={28}
                className="rounded-lg"
              />
            </div>
            <h1 className="text-lg font-bold tracking-tight">
              ByteLock
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link
              href="/vault/account"
              className="px-3 py-1.5 rounded-lg hover:bg-accent transition-colors flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            >
              <User className="w-4 h-4" />
              <span className="hidden sm:inline">Account</span>
            </Link>
            <button
              onClick={() => setShowLogoutConfirm(true)}
              className="px-3 py-1.5 text-sm rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors flex items-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="max-w-6xl mx-auto px-6 py-6"
      >
        {/* Stats Bar */}
        <div className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-card p-4 rounded-xl border border-border/50">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Key className="w-4 h-4 text-primary" />
              </div>
              <p className="text-sm text-muted-foreground">Passwords</p>
            </div>
            <p className="text-2xl font-bold">{passwords.length}</p>
          </div>
          <div className="bg-card p-4 rounded-xl border border-border/50">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <CreditCard className="w-4 h-4 text-primary" />
              </div>
              <p className="text-sm text-muted-foreground">Cards</p>
            </div>
            <p className="text-2xl font-bold">{cards.length}</p>
          </div>

          {/* Data Breach Scanner */}
          {features.canUsePrivacyScanner ? (
            <div
              className="bg-card p-4 rounded-xl border border-border/50 hover:border-primary/20 cursor-pointer transition-all flex flex-col justify-center"
              onClick={() => setShowPrivacyScanner(true)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && setShowPrivacyScanner(true)}
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <ShieldAlert className="w-4 h-4 text-primary" />
                </div>
                <p className="text-sm text-muted-foreground">Breach Scanner</p>
              </div>
              <p className="text-sm font-medium text-primary">Check now</p>
            </div>
          ) : (
            <div className="bg-card p-4 rounded-xl border border-border/50 flex flex-col justify-center">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                  <ShieldAlert className="w-4 h-4 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">Breach Scanner</p>
              </div>
              <Link href="/vault/account/upgrade" className="text-xs text-primary hover:underline font-medium">Upgrade to Pro</Link>
            </div>
          )}

          {/* Subscription */}
          <div className="bg-card p-4 rounded-xl border border-border/50">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Shield className="w-4 h-4 text-primary" />
              </div>
              <p className="text-sm text-muted-foreground">Plan</p>
            </div>
            <p className="text-lg font-bold">{planDisplay}</p>
            <Link href="/vault/account" className="text-xs text-primary hover:underline">Manage</Link>
          </div>
        </div>

        {/* Conditional rendering for Privacy Scanner or Tabs */}
        {showPrivacyScanner ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="space-y-6"
          >
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-semibold flex items-center gap-2">
                    <ShieldAlert className="w-5 h-5 text-primary"/> Data Breach Scanner
                  </h2>
                  <p className="text-sm text-muted-foreground">Check if your accounts have been compromised in known data breaches.</p>
                </div>
                <Button variant="outline" onClick={() => setShowPrivacyScanner(false)}>Back to Vault</Button>
              </div>
              <div className="bg-card rounded-xl border border-border/50 p-6">
                <PrivacyScanner />
              </div>
            </div>
          </motion.div>
        ) : (
          <Tabs value={activeTab} onValueChange={(value) => { setActiveTab(value); setShowPrivacyScanner(false); }} className="space-y-6">
            <TabsList className={`grid w-full h-auto p-1 gap-1 bg-muted/50 rounded-xl border border-border/50 ${(plan === 'PRO' || plan === 'TEAM') ? 'grid-cols-4' : 'grid-cols-3'}`}>
              <TabsTrigger value="passwords" className="flex items-center gap-2 py-2.5 text-sm rounded-lg data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:border data-[state=active]:border-border/50">
                <Key className="w-4 h-4" />
                <span className="hidden sm:inline">Passwords</span>
              </TabsTrigger>
              <TabsTrigger value="cards" className="flex items-center gap-2 py-2.5 text-sm rounded-lg data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:border data-[state=active]:border-border/50">
                <CreditCard className="w-4 h-4" />
                <span className="hidden sm:inline">Cards</span>
              </TabsTrigger>
              <TabsTrigger value="notes" className="flex items-center gap-2 py-2.5 text-sm rounded-lg data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:border data-[state=active]:border-border/50">
                <StickyNote className="w-4 h-4" />
                <span className="hidden sm:inline">Notes</span>
              </TabsTrigger>
              {(plan === 'PRO' || plan === 'TEAM') && (
                <TabsTrigger value="files" className="flex items-center gap-2 py-2.5 text-sm rounded-lg data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:border data-[state=active]:border-border/50">
                  <File className="w-4 h-4" />
                  <span className="hidden sm:inline">Files</span>
                </TabsTrigger>
              )}
            </TabsList>
            <TabsContent value="passwords" className="flex-1 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">Passwords</h2>
                  <p className="text-sm text-muted-foreground">End-to-end encrypted</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search..."
                      className="w-48 sm:w-64 px-3 py-2 pl-9 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-all"
                    />
                    <svg
                      className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                      />
                    </svg>
                  </div>
                  <Button
                    onClick={() => {
                      setActiveTab("passwords");
                      handleEdit(null);
                    }}
                    className="flex items-center gap-2 shrink-0"
                    size="sm"
                  >
                    <Plus className="w-4 h-4" />
                    <span className="hidden sm:inline">Add Password</span>
                    <span className="sm:hidden">Add</span>
                  </Button>
                </div>
              </div>
              {filteredPasswords.length === 0 ? (
                <div className="bg-card rounded-xl border border-border/50 p-8 text-center">
                  <div className="bg-primary/10 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Key className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="text-lg font-medium mb-2">No passwords yet</h3>
                  <p className="text-muted-foreground mb-4">Add your first password to get started</p>
                  <Button
                    onClick={() => handleEdit(null)}
                    variant="outline"
                    className="mx-auto"
                  >
                    Add Your First Password
                  </Button>
                </div>
              ) : (
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredPasswords.map((password) => (
                    <div
                      key={password.id}
                      className="bg-card rounded-xl p-5 border border-border/50 hover:shadow-md hover:border-primary/40 transition-all duration-300"
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-2">
                          <div className="bg-primary/10 p-1.5 rounded-md">
                            <Key className="w-3.5 h-3.5 text-primary" />
                          </div>
                          <h3 className="font-medium truncate">{password.title}</h3>
                        </div>
                        <div className="flex items-center gap-1">
                          {canShareItems && (
                            <button
                              onClick={() => openShareItemDialog('PASSWORD', password.id, password.title, password)}
                              className="p-1.5 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors"
                              title="Share password"
                            >
                              <Share2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => handleEdit(password)}
                            className="p-1.5 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors"
                            title="Edit password"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete('password', password.id)}
                            className="p-1.5 rounded-md hover:bg-destructive/10 hover:text-destructive transition-colors"
                            title="Delete password"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="flex flex-col gap-1">
                          <span className="text-xs text-muted-foreground">Username</span>
                          <div className="bg-background rounded-md p-2 border border-border/50">
                            <DecryptedField
                              value={password.username}
                              encryptionData={password.encryptionData}
                              fieldName="username"
                              className="text-sm font-medium"
                              masked={true}
                              showDecrypted={false}
                            />
                          </div>
                        </div>

                        <div className="flex flex-col gap-1">
                          <span className="text-xs text-muted-foreground">Password</span>
                          <div className="bg-background rounded-md p-2 border border-border/50">
                            <DecryptedField
                              value={password.password}
                              encryptionData={password.encryptionData}
                              fieldName="password"
                              className="text-sm font-medium font-mono"
                              masked={true}
                              showDecrypted={false}
                            />
                          </div>
                        </div>

                        {password.url && (
                          <div className="flex items-center gap-2 mt-3">
                            <div className="bg-accent/50 p-1 rounded">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z" clipRule="evenodd" />
                              </svg>
                            </div>
                            <a
                              href={password.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-primary hover:underline truncate"
                            >
                              {new URL(password.url).hostname}
                            </a>
                          </div>
                        )}
                        {plan === 'PRO' && (
                        <div className="mt-3 pt-3 border-t border-border/30">
                          <div className="flex justify-between items-center mb-1">
                            <p className="text-xs text-muted-foreground">
                                  Strength: {password.strength !== undefined ? getStrengthLabel(password.strength) : 'Calculating...'}
                            </p>
                          </div>
                          <div className="w-full bg-accent/30 h-1.5 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${password.strength !== undefined ? getStrengthColor(password.strength) : 'bg-gray-500'}`}
                              style={{
                                width: password.strength !== undefined
                                  ? password.strength >= 80
                                    ? '100%' // Very Strong
                                    : password.strength < 20
                                      ? '5%'  // Very Weak
                                      : `${password.strength}%`
                                  : '100%'
                              }}
                            />
                          </div>
                        </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="cards" className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">Cards</h2>
                  <p className="text-sm text-muted-foreground">End-to-end encrypted</p>
                </div>
                <Button
                  onClick={() => {
                    setActiveTab("cards");
                    handleEdit(null);
                  }}
                  className="flex items-center gap-2 shrink-0"
                  size="sm"
                >
                  <Plus className="w-4 h-4" />
                  Add Card
                </Button>
              </div>

              {cards.length === 0 ? (
                <div className="bg-card rounded-xl border border-border/50 p-8 text-center">
                  <div className="bg-primary/10 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4">
                    <CreditCard className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="text-lg font-medium mb-2">No payment cards yet</h3>
                  <p className="text-muted-foreground mb-4">Add your first card to get started</p>
                  <Button
                    onClick={() => handleEdit(null)}
                    variant="outline"
                    className="mx-auto"
                  >
                    Add Your First Card
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredCards.map((card) => (
                    <div
                      key={card.id}
                      className="bg-card rounded-xl p-5 border border-border/50 hover:shadow-md hover:border-primary/40 transition-all duration-300"
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-2">
                          <div className="bg-primary/10 p-1.5 rounded-md">
                            <CreditCard className="w-3.5 h-3.5 text-primary" />
                          </div>
                          <h3 className="font-medium truncate">{card.name}</h3>
                        </div>
                        <div className="flex items-center gap-1">
                          {canShareItems && (
                            <button
                              onClick={() => openShareItemDialog('CARD', card.id, card.name, card)}
                              className="p-1.5 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors"
                              title="Share card"
                            >
                              <Share2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => handleEdit(card)}
                            className="p-1.5 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors"
                            title="Edit card"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete('card', card.id)}
                            className="p-1.5 rounded-md hover:bg-destructive/10 hover:text-destructive transition-colors"
                            title="Delete card"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="flex flex-col gap-1">
                          <span className="text-xs text-muted-foreground">Card Number</span>
                          <div className="bg-background rounded-md p-2 border border-border/50">
                            <DecryptedField
                              value={card.cardNumber}
                              encryptionData={card.encryptionData}
                              fieldName="cardNumber"
                              className="text-sm font-medium font-mono"
                              masked={true}
                              showDecrypted={false}
                            />
                          </div>
                        </div>

                        <div className="flex flex-col gap-1">
                          <span className="text-xs text-muted-foreground">Expiry Date</span>
                          <div className="bg-background rounded-md p-2 border border-border/50">
                            <p className="text-sm font-medium">
                              {card.expiryMonth.toString().padStart(2, '0')}/{card.expiryYear}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-col gap-1">
                          <span className="text-xs text-muted-foreground">CVV</span>
                          <div className="bg-background rounded-md p-2 border border-border/50">
                            <DecryptedField
                              value={card.cvv}
                              encryptionData={card.encryptionData}
                              fieldName="cvv"
                              className="text-sm font-medium font-mono"
                              masked={true}
                              showDecrypted={false}
                            />
                          </div>
                        </div>

                        {card.billingAddress && (
                          <div className="flex flex-col gap-1">
                            <span className="text-xs text-muted-foreground">Billing Address</span>
                            <div className="bg-background rounded-md p-2 border border-border/50">
                              <DecryptedField
                                value={card.billingAddress}
                                encryptionData={card.encryptionData}
                                fieldName="billingAddress"
                                className="text-sm"
                                masked={false}
                              />
                            </div>
                          </div>
                        )}

                        {card.tags.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-border/30">
                            <span className="text-xs text-muted-foreground block mb-2">Tags</span>
                            <div className="flex flex-wrap gap-1.5">
                              {card.tags.map((tag) => (
                                <span
                                  key={tag}
                                  className="px-2 py-1 text-xs rounded-full bg-primary/10 text-primary"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="notes" className="space-y-4">
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold">Notes</h2>
                    <p className="text-sm text-muted-foreground">End-to-end encrypted</p>
                  </div>
                  <Button size="sm" onClick={() => { setActiveTab('notes'); setSelectedItem(null); setIsEditDialogOpen(true); }}><Plus size={16} className="mr-1.5" />Add Note</Button>
                </div>
                <div className="flex gap-3 items-center">
                  <div className="relative flex-grow">
                    <Input
                      type="search"
                      placeholder="Search notes..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 text-sm"
                    />
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-4 w-4 text-muted-foreground"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                        />
                      </svg>
                    </div>
                  </div>
                  <Select value={noteSortOrder} onValueChange={setNoteSortOrder}>
                    <SelectTrigger className="w-[160px] text-sm">
                      <SelectValue placeholder="Sort by..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="newest">Newest</SelectItem>
                      <SelectItem value="oldest">Oldest</SelectItem>
                      <SelectItem value="title_asc">Title (A-Z)</SelectItem>
                      <SelectItem value="title_desc">Title (Z-A)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {/* Notes display will go here - e.g., a grid of cards */}
                {(userLoading || isCheckingVaultStatus) && <p>Loading notes...</p>}
                {!(userLoading || isCheckingVaultStatus) && notes.length === 0 && <p>No notes yet. Click 'Add Note' to create one.</p>}
                {!(userLoading || isCheckingVaultStatus) && notes.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredNotes.map(note => (
                      <div key={note.id} className="bg-card rounded-xl border border-border/50 p-4 space-y-2 flex flex-col justify-between relative">
                        {/* Pin Icon */}
                        <button 
                          onClick={() => handleTogglePin(note.id, note.isPinned)}
                          className={`absolute top-2 right-2 p-1 rounded-full transition-colors 
                                      ${note.isPinned ? 'bg-primary/20 text-primary' : 'hover:bg-muted'}`}
                          title={note.isPinned ? "Unpin note" : "Pin note"}
                        >
                          <Pin size={16} className={`${note.isPinned ? 'fill-primary' : ''}`} />
                        </button>
                        <div>
                          <h3 className="font-semibold break-all pr-8">{note.title || "Untitled Note"}</h3> {/* Added pr-8 for spacing from pin icon */}
                          <div
                            className="prose prose-sm dark:prose-invert max-h-24 overflow-hidden text-sm [&_pre]:bg-transparent dark:[&_pre]:bg-transparent [&_pre_code_span]:text-inherit dark:[&_pre_code_span]:text-inherit"
                            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(note.content || "") }}
                          />
                          {note.lastModified && (
                            <p className="text-xs text-muted-foreground mt-2">
                              Last modified: {new Date(note.lastModified).toLocaleDateString()} {new Date(note.lastModified).toLocaleTimeString()}
                            </p>
                          )}
                        </div>
                        <div className="flex justify-end space-x-2 pt-2">
                          {canShareItems && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openShareItemDialog('NOTE', note.id, note.title || 'Untitled Note', note)}
                            >
                              <Share2 size={16} />
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" onClick={() => { setActiveTab('notes'); handleEdit(note); }}><Edit2 size={16} /></Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDelete('note', note.id)}><Trash2 size={16} /></Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>
            {(plan === 'PRO' || plan === 'TEAM') && (
              <TabsContent value="files" className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold">Files</h2>
                    <p className="text-sm text-muted-foreground">End-to-end encrypted</p>
                  </div>
                  <FileForm onFileUploaded={fetchFiles} />
                </div>
                <FileList
                  files={files}
                  onFileDeleted={fetchFiles}
                  onShareFile={canShareItems ? (file) => openShareItemDialog('FILE', file.id, file.fileName, file) : undefined}
                />
              </TabsContent>
            )}
          </Tabs>
        )}

        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {selectedItem ? 'Edit ' : 'Add '}
                {activeTab === 'passwords' ? 'Password' : activeTab === 'cards' ? 'Card' : 'Note'}
              </DialogTitle>
              <DialogDescription>
                {activeTab === 'passwords'
                  ? 'Manage your login credentials securely.'
                  : activeTab === 'cards' 
                  ? 'Keep your payment information safe.'
                  : 'Create or edit your secure note.'}
              </DialogDescription>
            </DialogHeader>
            {activeTab === 'passwords' ? (
              <PasswordForm
                initialData={selectedItem as Password}
                onSubmit={async (data) => {
                  try {
                    const strength = calculatePasswordStrength(data.password);
                    const response = await fetch('/api/passwords' + (data.id ? `?id=${data.id}` : ''), {
                      method: data.id ? 'PUT' : 'POST',
                      headers: {
                        'Content-Type': 'application/json'
                      },
                      credentials: 'include',
                      body: JSON.stringify({ ...data, strength }),
                    });

                    if (response.ok) {
                      const result = await response.json();
                      setPasswords(prev =>
                        data.id
                          ? prev.map(p => (p.id === data.id ? result : p))
                          : [...prev, result]
                      );
                      setIsEditDialogOpen(false);
                    }
                  } catch (error) {
                    console.error('Failed to save password:', error);
                  }
                }}
                onCancel={() => { setIsEditDialogOpen(false); setSelectedItem(null); }}
              />
            ) : activeTab === 'notes' ? (
              <NoteForm
                initialData={selectedItem as Note}
                allTags={allTags}
                isSubmitting={isSubmittingDialog}
                onSubmit={async (data) => {
                  setIsSubmittingDialog(true);
                  try {
                    const response = await fetch(`/api/notes${data.id ? `/${data.id}` : ''}`, {
                      method: data.id ? 'PUT' : 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                       },
                      credentials: 'include',
                      body: JSON.stringify(data),
                    });
                    if (response.ok) {
                      await fetchNotes(); // Re-fetch notes to update the list
                      handleCloseDialog();
                    } else {
                      const errorData = await response.json();
                      console.error('Failed to save note:', errorData.message || errorData.error);
                      alert(`Error: ${errorData.message || errorData.error || 'Failed to save note'}`);
                    }
                  } catch (error) {
                    console.error('Failed to save note:', error);
                    alert('An unexpected error occurred while saving the note.');
                  } finally {
                    setIsSubmittingDialog(false);
                  }
                }}
                onCancel={handleCloseDialog} // handleCloseDialog already clears selectedItem
              />
            ) : activeTab === 'cards' ? (
              <CardForm
                initialData={selectedItem as Card}
                onSubmit={async (data) => {
                  try {
                    const response = await fetch('/api/cards' + (data.id ? `?id=${data.id}` : ''), {
                      method: data.id ? 'PUT' : 'POST',
                      headers: {
                        'Content-Type': 'application/json'
                      },
                      credentials: 'include',
                      body: JSON.stringify(data),
                    });

                    if (response.ok) {
                      const result = await response.json();
                      setCards(prev =>
                        data.id
                          ? prev.map(c => (c.id === data.id ? result : c))
                          : [...prev, result]
                      );
                      setIsEditDialogOpen(false);
                    }
                  } catch (error) {
                    console.error('Failed to save card:', error);
                  }
                }}
                onCancel={() => setIsEditDialogOpen(false)}
              />
            ) : (
              <div className="text-center p-4">NoteForm component will be implemented next.</div>
            )}
          </DialogContent>
        </Dialog>

        <VaultPasswordPrompt
          isOpen={showVaultPrompt || (!isVaultUnlocked && !isCheckingVaultStatus)} // Force open if vault is locked and not checking
          onClose={() => setShowVaultPrompt(false)}
          isSetup={doesVaultNeedSetup === true} // Pass the actual setup status from context
          onSuccess={async () => {
            await checkVaultStatusNow();
          }}
        />

        {/* Logout Confirmation Dialog */}
        <Dialog open={showLogoutConfirm} onOpenChange={setShowLogoutConfirm}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Sign Out</DialogTitle>
              <DialogDescription>
                Are you sure you want to sign out? Your vault will be locked and you'll need to enter your vault password again when you return.
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-3 mt-4">
              <Button variant="outline" onClick={() => setShowLogoutConfirm(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={() => {
                setShowLogoutConfirm(false);
                handleLogout();
              }}>
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={showShareItemDialog} onOpenChange={setShowShareItemDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Share Item</DialogTitle>
              <DialogDescription>
                Create a temporary link for this {shareItemType ? shareItemType.toLowerCase() : 'item'}: {shareItemLabel || 'Selected Item'}.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Link duration</label>
                <Select value={shareDuration} onValueChange={(value: ShareDuration) => setShareDuration(value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select duration" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="one_time">One-time use</SelectItem>
                    <SelectItem value="one_day">1 day</SelectItem>
                    <SelectItem value="one_month">1 month</SelectItem>
                    <SelectItem value="forever">Forever</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {shareItemError && (
                <p className="text-sm text-red-500">{shareItemError}</p>
              )}

              {generatedShareLink && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Generated link</label>
                  <Input readOnly value={generatedShareLink} />
                </div>
              )}

              <div className="flex justify-end gap-2">
                {generatedShareLink && (
                  <Button variant="outline" onClick={handleCopyShareLink}>
                    Copy Link
                  </Button>
                )}
                <Button onClick={handleGenerateShareLink} disabled={isGeneratingShareLink || !shareItemType || !shareItemId}>
                  {isGeneratingShareLink ? 'Generating...' : 'Generate Link'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </motion.div>
    </main>
  );
}