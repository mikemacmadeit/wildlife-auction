'use client';

import { SavedSearchesPanel } from '@/components/saved-searches/SavedSearchesPanel';

export default function SavedSearchesPage() {
  return (
    <div className="min-h-screen bg-background pb-20 md:pb-6 w-full">
      <div className="container mx-auto px-4 py-6 md:py-8 max-w-7xl space-y-6 md:space-y-8">
        <SavedSearchesPanel variant="page" />
      </div>
    </div>
  );
}

