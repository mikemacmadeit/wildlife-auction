export default function DashboardLoading() {
  return (
    <div className="min-h-[400px] flex items-center justify-center p-6">
      <div className="text-center space-y-3">
        <div className="h-10 w-10 border-4 border-primary/70 border-t-transparent rounded-full animate-spin mx-auto" />
        <div className="text-sm font-semibold">Loading dashboard...</div>
        <div className="text-xs text-muted-foreground">Please wait.</div>
      </div>
    </div>
  );
}
