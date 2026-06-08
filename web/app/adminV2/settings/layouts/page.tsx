import LayoutsSettingsHubClient from "./LayoutsSettingsHubClient";
import LayoutConfigClient from "@/components/layout/LayoutConfigClient";
import EffectiveLayoutInspectorClient from "@/components/adminV2/settings/EffectiveLayoutInspectorClient";
import Link from "next/link";

export const dynamic = "force-dynamic";

type PageProps = { searchParams?: Promise<{ entity?: string }> };

/**
 * AdminV2 Settings → Layouts. Primary surface is the Layout V2 builder
 * (proof/config — does not affect live drawers yet). The previous record-drawer
 * composition hub (which edits the runtime record_drawer_layouts) is preserved
 * below, collapsed, so production config stays reachable during convergence.
 */
export default async function AdminV2SettingsLayoutsPage({ searchParams }: PageProps) {
    const sp = searchParams ? await searchParams : {};
    return (
        <div className="w-full min-w-0 space-y-4 pb-4" data-testid="settings-layouts-page">
            <header className="space-y-0.5">
                <h1 className="text-lg font-semibold tracking-tight text-alloy-midnight">Layouts</h1>
                <p className="max-w-2xl text-xs text-alloy-midnight/55">
                    Configure how Lead records are presented in drawers and queues. Drafts and published versions are
                    editable here; changes affect the layout proof, not live drawers.
                </p>
            </header>

            <LayoutConfigClient adminV2Chrome />

            <EffectiveLayoutInspectorClient initialEntityType={sp.entity ?? "opportunities"} initialSurface="drawer" />

            <p className="text-xs text-alloy-midnight/55">
                <Link href="/adminV2/settings/layouts/effective" className="text-alloy-blue underline">
                    Full-screen effective layout inspector
                </Link>
                {" "}· also linked from C1b drawer debug panel when runtime flags are on.
            </p>

            <details className="rounded-lg border border-alloy-stone/30 bg-white/70 px-3 py-2">
                <summary className="cursor-pointer text-xs font-medium text-alloy-midnight/60">
                    Legacy record-drawer composition (current runtime config) — pending migration to Layout V2
                </summary>
                <div className="mt-3">
                    <LayoutsSettingsHubClient initialEntity={sp.entity} />
                </div>
            </details>
        </div>
    );
}
