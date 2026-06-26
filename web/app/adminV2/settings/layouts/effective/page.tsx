import EffectiveLayoutInspectorClient from "@/components/adminV2/settings/EffectiveLayoutInspectorClient";
import Link from "next/link";

export const dynamic = "force-dynamic";

type PageProps = {
    searchParams?: Promise<{
        entity_type?: string;
        surface?: string;
        opportunity_id?: string;
    }>;
};

/** Read-only effective layout resolution for C1b/C4 cutover validation. */
export default async function EffectiveLayoutInspectorPage({ searchParams }: PageProps) {
    const sp = searchParams ? await searchParams : {};
    const surface = sp.surface === "queue" ? "queue" : "drawer";

    return (
        <div className="mx-auto max-w-4xl space-y-4 px-4 py-6">
            <header className="space-y-1">
                <Link href="/admin/settings/layouts" className="text-xs text-alloy-pine underline">
                    ← Settings → Layouts
                </Link>
                <h1 className="text-lg font-semibold text-alloy-midnight">Effective layout inspector</h1>
                <p className="text-xs text-alloy-midnight/60">
                    Read-only source-of-truth check for drawer and queue layouts. Requires layout runtime or preview flag.
                </p>
            </header>
            <EffectiveLayoutInspectorClient
                initialEntityType={sp.entity_type?.trim() || "opportunities"}
                initialSurface={surface}
                initialOpportunityId={sp.opportunity_id?.trim()}
            />
        </div>
    );
}
