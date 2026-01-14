/**
 * Firebase Auth Helper for API Routes
 * Gets the current user's ID token for API authentication
 */

import { auth } from './config';
import { User } from 'firebase/auth';

/**
 * Get the current user's ID token
 * Returns null if user is not authenticated
 * Forces token refresh to ensure it's valid
 */
export async function getIdToken(user: User | null, forceRefresh: boolean = true): Promise<string | null> {
  if (!user) {
    return null;
  }

  try {
    // Force refresh to ensure token is valid and not expired
    const token = await user.getIdToken(forceRefresh);
    return token;
  } catch (error) {
    console.error('Error getting ID token:', error);
    return null;
  }
}
