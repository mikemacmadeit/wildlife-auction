import { User as FirebaseUser } from 'firebase/auth';
import { auth } from './config';
import { getDocument, setDocument, updateDocument } from './firestore';
import { UserProfile } from '@/lib/types';

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

  const out: PublicProfileDoc = {
    userId,
    displayName: userDoc?.displayName || profile.fullName || undefined,
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
  }
};

/**
 * Get user profile from Firestore
 */
export const getUserProfile = async (userId: string): Promise<UserProfile | null> => {
  try {
    const currentUid = auth.currentUser?.uid || null;

    // If you are not the owner, do NOT try to read `/users/{uid}` first.
    // That will correctly be blocked by rules, but it creates noisy console errors and can cause
    // downstream UI to incorrectly assume "seller not ready" based on a failed fetch.
    if (currentUid && currentUid !== userId) {
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
