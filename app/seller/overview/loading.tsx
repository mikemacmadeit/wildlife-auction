export default function Loading() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="text-center space-y-3">
        <div className="h-10 w-10 border-4 border-primary/70 border-t-transparent rounded-full animate-spin mx-auto" />
        <div className="text-sm font-semibold">Loading overview...</div>
        <div className="text-xs text-muted-foreground">Getting your dashboard ready.</div>
      </div>
    </div>
  );
}
