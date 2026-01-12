'use client';

import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { LogIn, UserPlus, X } from 'lucide-react';

interface AuthPromptModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAuthSuccess?: () => void;
  title?: string;
  description?: string;
}

export function AuthPromptModal({
  open,
  onOpenChange,
  onAuthSuccess,
  title = 'Sign in to continue',
  description = 'You need to be signed in to publish your listing. Sign in or create an account to continue.',
}: AuthPromptModalProps) {
  const router = useRouter();

  const handleSignIn = () => {
    // Store the current path to redirect back after login
    const currentPath = window.location.pathname;
    sessionStorage.setItem('redirectAfterLogin', currentPath);
    router.push('/login');
    onOpenChange(false);
  };

  const handleSignUp = () => {
    // Store the current path to redirect back after registration
    const currentPath = window.location.pathname;
    sessionStorage.setItem('redirectAfterLogin', currentPath);
    router.push('/register');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">{title}</DialogTitle>
          <DialogDescription className="text-base pt-2">
            {description}
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4 space-y-3">
          <Button
            onClick={handleSignIn}
            className="w-full min-h-[52px] text-base font-semibold"
            size="lg"
          >
            <LogIn className="mr-2 h-5 w-5" />
            Sign In
          </Button>
          
          <Button
            onClick={handleSignUp}
            variant="outline"
            className="w-full min-h-[52px] text-base font-semibold border-2"
            size="lg"
          >
            <UserPlus className="mr-2 h-5 w-5" />
            Create Account
          </Button>
        </div>

        <DialogFooter className="sm:justify-start">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="text-sm text-muted-foreground"
          >
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
