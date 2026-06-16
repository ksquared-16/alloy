import LayoutsSettingsPageClient from "@/app/adminV2/settings/layouts/LayoutsSettingsPageClient";
import EffectiveLayoutInspectorClient from "@/components/adminV2/settings/EffectiveLayoutInspectorClient";
import SettingsPageHeader from "@/components/adminV2/settings/SettingsPageHeader";
import Link from "next/link";
import { SETTINGS_PAGE_SHELL_COMPACT_CLASS } from "@/lib/adminV2/settingsPageLayout";
import { LAYOUTS_HUB_REGISTRY_TRUST_NOTE } from "@/lib/fields/fieldSettingsOperatorUi";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

type PageProps = { searchParams?: Promise<{ entity?: string }> };

/**
 * AdminV2 Settings → Layouts.
 *
 * Primary surface: Layout Gallery (surface registry + entity_layouts).
 * Section/row builder remains available as an internal fallback.
 */
export default async function AdminV2SettingsLayoutsPage({ searchParams }: PageProps) {
    const sp = searchParams ? await searchParams : {};
    return (
        <div className={SETTINGS_PAGE_SHELL_COMPACT_CLASS} data-testid="settings-layouts-page">
            <SettingsPageHeader
                variant="hero"
                title="Layouts"
                subtitle="Experience → Record Experience. Configure how operational surfaces appear in the product — drawers, queue rows, and workspaces."
            />
            <p
                className="-mt-2 rounded-lg border border-alloy-forge/10 bg-alloy-pine/[0.04] px-3 py-2 text-xs leading-relaxed text-alloy-midnight/65"
                data-testid="layouts-hub-registry-trust-note"
            >
                {LAYOUTS_HUB_REGISTRY_TRUST_NOTE}{" "}
                <Link href="/admin/settings/fields" className="font-medium text-alloy-pine hover:underline">
                    Open Fields
                </Link>
                .
            </p>

            <Suspense
                fallback={
                    <div className="rounded-xl border border-alloy-forge/12 bg-white/90 px-5 py-8 text-sm text-alloy-midnight/55">
                        Loading layout gallery…
                    </div>
                }
            >
                <LayoutsSettingsPageClient />
            </Suspense>

            <details className="rounded-lg border border-alloy-stone/30 bg-white/70 px-3 py-2">
                <summary className="cursor-pointer text-xs font-medium text-alloy-midnight/60">
                    Effective layout inspector (read-only resolution debug)
                </summary>
                <div className="mt-3 space-y-2">
                    <EffectiveLayoutInspectorClient
                        initialEntityType={sp.entity ?? "opportunities"}
                        initialSurface="drawer"
                    />
                    <p className="text-xs text-alloy-midnight/55">
                        <Link href="/admin/settings/layouts/effective" className="text-alloy-blue underline">
                            Full-screen effective layout inspector
                        </Link>
                    </p>
                </div>
            </details>
        </div>
    );
}
