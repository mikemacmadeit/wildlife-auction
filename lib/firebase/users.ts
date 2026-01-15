import { User as FirebaseUser } from 'firebase/auth';
import { getDocument, setDocument, updateDocument } from './firestore';
import { UserProfile } from '@/lib/types';

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
  const existingUser = await getDocument<UserProfile>('users', user.uid);
  
  if (!existingUser) {
    const { displayName, email, photoURL, phoneNumber, emailVerified } = user;

    // Build user document data, omitting undefined values
    const userData: any = {
      userId: user.uid,
      email: email || '',
      emailVerified,
      // Exposure Plans default
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
    } catch (error) {
      console.error('Error creating user document:', error);
      throw error;
    }
  }
};

/**
 * Get user profile from Firestore
 */
export const getUserProfile = async (userId: string): Promise<UserProfile | null> => {
  try {
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
