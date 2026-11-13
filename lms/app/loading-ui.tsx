export function LoadingSpinner({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={`loading-spinner ${className}`} />;
}

export function PortalLoading({ label = "Loading portal…" }: { label?: string }) {
  return (
    <main className="grid min-h-screen place-items-center bg-paper p-6">
      <div role="status" aria-live="polite" className="flex items-center gap-3 text-sm font-semibold text-gray-600">
        <LoadingSpinner className="size-5 text-brand-600" />
        {label}
      </div>
    </main>
  );
}

export function PageLoading() {
  return (
    <section role="status" aria-label="Loading page" className="space-y-6" aria-busy="true">
      <div className="flex items-center gap-2 text-sm font-semibold text-gray-600">
        <LoadingSpinner className="text-brand-600" />
        Loading page…
      </div>
      <div aria-hidden="true" className="space-y-4">
        <div className="loading-skeleton h-8 w-48 rounded-lg" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="loading-skeleton h-28 rounded-[14px]" />
          <div className="loading-skeleton h-28 rounded-[14px]" />
          <div className="loading-skeleton h-28 rounded-[14px]" />
        </div>
        <div className="loading-skeleton h-52 rounded-[14px]" />
      </div>
    </section>
  );
}
