/**
 * Hook to check if current user is an admin
 * Now uses AdminContext to prevent redundant Firestore calls
 */
export { useAdmin } from '@/contexts/AdminContext';
