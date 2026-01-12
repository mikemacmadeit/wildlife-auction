/**
 * Firebase Auth Helper for API Routes
 * Gets the current user's ID token for API authentication
 */

import { auth } from './config';
import { User } from 'firebase/auth';

/**
 * Get the current user's ID token
 * Returns null if user is not authenticated
 */
export async function getIdToken(user: User | null): Promise<string | null> {
  if (!user) {
    return null;
  }

  try {
    const token = await user.getIdToken();
    return token;
  } catch (error) {
    console.error('Error getting ID token:', error);
    return null;
  }
}
