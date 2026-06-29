/** Skeleton shown while the Operational Intelligence surface re-resolves (filter changes / navigation). */
export default function OperationalIntelligenceLoading() {
    return (
        <div className="p-5" data-testid="operational-intelligence-loading" aria-busy="true">
            <div className="h-6 w-48 animate-pulse rounded-md bg-alloy-forge/10" />
            <div className="mt-2 h-4 w-80 max-w-full animate-pulse rounded bg-alloy-forge/8" />
            <div className="mt-5 h-12 w-full animate-pulse rounded-xl bg-alloy-forge/8" />
            <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
                {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-24 animate-pulse rounded-xl bg-alloy-forge/8" />
                ))}
            </div>
            <div className="mt-5 grid gap-4 lg:grid-cols-[3fr_2fr]">
                <div className="h-56 animate-pulse rounded-xl bg-alloy-forge/8" />
                <div className="h-56 animate-pulse rounded-xl bg-alloy-forge/8" />
            </div>
        </div>
    );
}
