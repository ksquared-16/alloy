import LayoutConfigClient from "@/components/layout/LayoutConfigClient";
import EffectiveLayoutInspectorClient from "@/components/adminV2/settings/EffectiveLayoutInspectorClient";
import Link from "next/link";

export const dynamic = "force-dynamic";

type PageProps = { searchParams?: Promise<{ entity?: string }> };

/**
 * AdminV2 Settings → Layouts.
 *
 * Primary surface: Layout V2 builder (entity_layouts). When layout runtime is
 * enabled on staging, published docs here drive drawer and queue rendering.
 */
export default async function AdminV2SettingsLayoutsPage({ searchParams }: PageProps) {
    const sp = searchParams ? await searchParams : {};
    return (
        <div className="w-full min-w-0 space-y-4 pb-4" data-testid="settings-layouts-page">
            <header className="space-y-0.5">
                <h1 className="text-lg font-semibold tracking-tight text-alloy-midnight">Layouts</h1>
                <p className="max-w-2xl text-xs text-alloy-midnight/55">
                    Configure drawer and queue presentation for Opportunities, Person, Child, and queue variants.
                    Publish LayoutDocs here — staging runtime renders from these configs when layout runtime flags are on.
                </p>
            </header>

            <LayoutConfigClient adminV2Chrome />

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
