import ConfigLayoutProposalsClient from "./ConfigLayoutProposalsClient";

export const dynamic = "force-dynamic";

export default async function ConfigLayoutProposalsPage({
    searchParams,
}: {
    searchParams: Promise<{ id?: string }>;
}) {
    const sp = await searchParams;
    const initialId = typeof sp.id === "string" ? sp.id : undefined;
    return (
        <div className="w-full max-w-5xl space-y-4 pb-4">
            <header>
                <h1 className="text-xl font-semibold tracking-tight text-alloy-midnight">
                    Configuration proposals
                </h1>
                <p className="mt-1 max-w-2xl text-xs leading-snug text-alloy-midnight/60">
                    Review, approve, and apply Configuration / Layout Assist proposals. Applies use authoritative
                    admin services only — no autonomous AI mutation.
                </p>
            </header>
            <ConfigLayoutProposalsClient initialId={initialId} />
        </div>
    );
}
