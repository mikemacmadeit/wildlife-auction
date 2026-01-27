import { User as FirebaseUser } from 'firebase/auth';
import { collection, doc } from 'firebase/firestore';
import { auth, db } from './config';
import { getDocument, setDocument, updateDocument } from './firestore';
import { PublicSellerTrust, UserProfile } from '@/lib/types';

type PublicProfileDoc = {
  userId: string;
  displayName?: string;
  photoURL?: string;
  profile?: {
    fullName?: string;
    businessName?: string;
    location?: {
      city?: string;
      state?: string;
    };
  };
  updatedAt: Date;
  createdAt?: Date;
};

function buildPublicProfileFromUserDoc(userId: string, userDoc: Partial<UserProfile>): PublicProfileDoc {
  const profile: PublicProfileDoc['profile'] = {
    fullName: userDoc?.profile?.fullName || userDoc?.displayName || '',
    businessName: userDoc?.profile?.businessName || '',
    location: {
      city: userDoc?.profile?.location?.city || '',
      state: userDoc?.profile?.location?.state || '',
    },
  };

  // Determine display name based on preference
  const displayNamePreference = userDoc?.profile?.preferences?.displayNamePreference || 'personal';
  let displayName: string | undefined;
  if (displayNamePreference === 'business' && profile.businessName?.trim()) {
    displayName = profile.businessName.trim();
  } else {
    displayName = userDoc?.displayName || profile.fullName || undefined;
  }

  const out: PublicProfileDoc = {
    userId,
    displayName,
    photoURL: userDoc?.photoURL || undefined,
    profile,
    updatedAt: new Date(),
  };

  return out;
}

async function upsertPublicProfile(userId: string, userDoc: Partial<UserProfile>) {
  // Never include email / phone / stripe ids here.
  const publicDoc = buildPublicProfileFromUserDoc(userId, userDoc);
  await setDocument<PublicProfileDoc>('publicProfiles', userId, publicDoc as any, true);
}

/**
 * Create a user document in Firestore after Firebase Auth registration
 */
export const createUserDocument = async (
  user: FirebaseUser,
  additionalData?: {
    fullName?: string;
    businessName?: string;
    phone?: string;
    location?: {
      city: string;
      state: string;
      zip: string;
    };
  }
): Promise<void> => {
  // Check if user document already exists
  let existingUser: UserProfile | null = null;
  try {
    existingUser = await getDocument<UserProfile>('users', user.uid);
  } catch (error: any) {
    const code = String(error?.code || '');
    const msg = String(error?.message || '');
    const isPermissionDenied =
      code === 'permission-denied' ||
      msg.toLowerCase().includes('missing or insufficient permissions') ||
      msg.toLowerCase().includes('permission denied');
    if (!isPermissionDenied) throw error;
    // If rules are out of sync, treat as non-existent and attempt to create;
    // if creation is also blocked, we throw an actionable error below.
    existingUser = null;
  }
  
  if (!existingUser) {
    const { displayName, email, photoURL, phoneNumber, emailVerified } = user;

    // Build user document data, omitting undefined values
    const userData: any = {
      userId: user.uid,
      email: email || '',
      emailVerified,
      // Seller Tiers default
      subscriptionTier: 'standard',
      profile: {
        fullName: additionalData?.fullName || displayName || '',
        location: additionalData?.location || {
          city: '',
          state: '',
          zip: '',
        },
        preferences: {
          verification: true,
          transport: true,
        },
        notifications: {
          email: true,
          sms: false,
          bids: true,
          messages: true,
          promotions: false,
        },
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Only add optional fields if they have values
    if (displayName) {
      userData.displayName = displayName;
    }
    if (photoURL) {
      userData.photoURL = photoURL;
    }
    if (phoneNumber || additionalData?.phone) {
      userData.phoneNumber = phoneNumber || additionalData?.phone;
    }
    if (additionalData?.businessName) {
      userData.profile.businessName = additionalData.businessName;
    }

    try {
      await setDocument<UserProfile>('users', user.uid, userData);
      
      // Initialize canonical notification preferences with all notifications enabled
      const { getDefaultNotificationPreferences } = await import('@/lib/notifications/preferences');
      const { setDoc } = await import('firebase/firestore');
      const defaultPrefs = getDefaultNotificationPreferences();
      const prefsRef = doc(db, 'users', user.uid, 'notificationPreferences', 'default');
      await setDoc(prefsRef, defaultPrefs);
      // Mirror a safe subset for public profile reads.
      await upsertPublicProfile(user.uid, userData);
    } catch (error) {
      const code = String((error as any)?.code || '');
      const msg = String((error as any)?.message || '');
      const isPermissionDenied =
        code === 'permission-denied' ||
        msg.toLowerCase().includes('missing or insufficient permissions') ||
        msg.toLowerCase().includes('permission denied');
      console.error('Error creating user document:', error);
      if (isPermissionDenied) {
        throw new Error(
          'Firestore permission denied while creating your user profile. ' +
            'This typically means deployed Firestore rules are out of sync. ' +
            'Deploy project/firestore.rules (or point local dev at the emulator) and retry.'
        );
      }
      throw error;
    }
  } else if (additionalData) {
    // User doc already exists (e.g. bootstrap-user ran first). Merge registration
    // additionalData so phone, location, businessName are not lost.
    const existingProfile = (existingUser.profile || {}) as any;
    const updates: Partial<UserProfile> = {
      updatedAt: new Date(),
      displayName: additionalData.fullName ?? existingUser.displayName ?? user.displayName ?? '',
      phoneNumber: additionalData.phone ?? existingUser.phoneNumber ?? undefined,
      profile: {
        ...existingProfile,
        fullName: additionalData.fullName ?? existingProfile?.fullName ?? '',
        location: additionalData.location ?? existingProfile?.location ?? {
          city: '',
          state: '',
          zip: '',
        },
        preferences: existingProfile?.preferences ?? { verification: true, transport: true },
        notifications: existingProfile?.notifications ?? {
          email: true,
          sms: false,
          bids: true,
          messages: true,
          promotions: false,
        },
        ...(additionalData.businessName ? { businessName: additionalData.businessName } : {}),
      },
    };

    try {
      await updateDocument<UserProfile>('users', user.uid, updates as Partial<UserProfile>);
      const latest = await getDocument<UserProfile>('users', user.uid).catch(() => null);
      if (latest) await upsertPublicProfile(user.uid, latest);
      else await upsertPublicProfile(user.uid, { ...existingUser, ...updates } as any);
    } catch (error) {
      const code = String((error as any)?.code || '');
      const msg = String((error as any)?.message || '');
      const isPermissionDenied =
        code === 'permission-denied' ||
        msg.toLowerCase().includes('missing or insufficient permissions') ||
        msg.toLowerCase().includes('permission denied');
      console.error('Error merging registration data into user document:', error);
      if (isPermissionDenied) {
        throw new Error(
          'Firestore permission denied while updating your user profile. ' +
            'Deploy project/firestore.rules and retry.'
        );
      }
      throw error;
    }
  }
};

/**
 * Get user profile from Firestore
 */
export const getUserProfile = async (userId: string): Promise<UserProfile | null> => {
  try {
    const currentUid = auth.currentUser?.uid || null;

    // If you are not the owner (or signed out), do NOT try to read `/users/{uid}` first.
    // That will be blocked by rules on public pages and creates noisy console errors.
    // Use the public profile mirror instead.
    if (!currentUid || currentUid !== userId) {
      const pub = await getDocument<PublicProfileDoc>('publicProfiles', userId).catch(() => null);
      if (!pub) return null;

      // Best-effort shape compatibility for callers that expect `UserProfile`.
      return {
        userId: pub.userId,
        displayName: pub.displayName,
        photoURL: pub.photoURL,
        profile: {
          fullName: pub.profile?.fullName || '',
          businessName: pub.profile?.businessName || undefined,
          location: {
            city: pub.profile?.location?.city || '',
            state: pub.profile?.location?.state || '',
            zip: '',
          },
        },
        email: '',
        emailVerified: false,
        createdAt: pub.createdAt || new Date(0),
        updatedAt: pub.updatedAt || new Date(),
      } as any;
    }

    // Owner path: full profile is readable.
    return await getDocument<UserProfile>('users', userId);
  } catch (error) {
    console.error('Error fetching user profile:', error);
    throw error;
  }
};

/**
 * Public seller trust doc (server-authored, public-read).
 * Safe to fetch for any viewer (including logged-out).
 */
export const getPublicSellerTrust = async (userId: string): Promise<PublicSellerTrust | null> => {
  try {
    const doc = await getDocument<PublicSellerTrust>('publicSellerTrust', userId).catch(() => null);
    if (!doc) return null;
    // Normalize date-ish fields (getDocument already converts top-level timestamps in many paths,
    // but keep this defensive since this doc may be written by Admin SDK).
    const out: any = { ...doc };
    if (out.updatedAt && typeof out.updatedAt?.toDate === 'function') out.updatedAt = out.updatedAt.toDate();
    if (out?.tpwdBreederPermit?.expiresAt && typeof out.tpwdBreederPermit.expiresAt?.toDate === 'function') {
      out.tpwdBreederPermit.expiresAt = out.tpwdBreederPermit.expiresAt.toDate();
    }
    if (out?.tpwdBreederPermit?.verifiedAt && typeof out.tpwdBreederPermit.verifiedAt?.toDate === 'function') {
      out.tpwdBreederPermit.verifiedAt = out.tpwdBreederPermit.verifiedAt.toDate();
    }
    if (out?.stripe?.updatedAt && typeof out.stripe.updatedAt?.toDate === 'function') out.stripe.updatedAt = out.stripe.updatedAt.toDate();
    return out as PublicSellerTrust;
  } catch {
    return null;
  }
};

/**
 * Update user profile in Firestore
 */
export const updateUserProfile = async (
  userId: string,
  updates: Partial<UserProfile>
): Promise<void> => {
  try {
    await updateDocument<UserProfile>('users', userId, {
      ...updates,
      updatedAt: new Date(),
    });

    // Mirror safe subset to public profile. If the caller updated only a subset,
    // fetch the current user doc (if permitted) to build the public snapshot.
    const currentUid = auth.currentUser?.uid;
    if (currentUid === userId) {
      const latest = await getDocument<UserProfile>('users', userId).catch(() => null);
      if (latest) await upsertPublicProfile(userId, latest);
      else await upsertPublicProfile(userId, updates);
    } else {
      // If the caller is updating someone else (shouldn't happen client-side), do nothing here.
    }
  } catch (error) {
    console.error('Error updating user profile:', error);
    throw error;
  }
};

/**
 * Check if user profile is complete (has all required fields)
 */
export const isProfileComplete = (profile: UserProfile | null): boolean => {
  if (!profile) return false;
  
  // Check if profileComplete flag is set
  if (profile.profileComplete === false) return false;
  
  // Check if profile data exists and has required fields
  if (!profile.profile) return false;
  
  const { fullName, location } = profile.profile;
  
  // Check if required fields are present
  if (!fullName || !fullName.trim()) return false;
  if (!location || !location.city || !location.state || !location.zip) return false;
  if (!profile.phoneNumber || !profile.phoneNumber.trim()) return false;
  
  return true;
};
