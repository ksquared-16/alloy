"use client";

import { Suspense, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import LayoutGalleryClient from "@/components/adminV2/settings/LayoutGalleryClient";
import LayoutVisualEditorRouter from "@/components/adminV2/settings/LayoutVisualEditorRouter";
import LeadSummaryCardBlueprintEditor from "@/components/adminV2/settings/layouts/LeadSummaryCardBlueprintEditor";
import LayoutConfigClient from "@/components/layout/LayoutConfigClient";
import { LAYOUTS_SETTINGS_HREF } from "@/lib/admin/canonicalAdminRoutes";
import { ADMIN_V2_SETTINGS_PROCESSES_PATH } from "@/lib/adminV2/settings/lifecycleSettingsPaths";

export default function LayoutsSettingsPageClient() {
    return (
        <Suspense
            fallback={
                <div className="rounded-xl border border-alloy-forge/12 bg-white/90 px-5 py-8 text-sm text-alloy-midnight/55">
                    Loading surface editor…
                </div>
            }
        >
            <LayoutsSettingsPageClientInner />
        </Suspense>
    );
}

function LayoutsSettingsPageClientInner() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const base = LAYOUTS_SETTINGS_HREF;

    const editorMode = searchParams.get("editor") === "1";
    const layoutId = searchParams.get("layout")?.trim() || null;
    const blueprint = searchParams.get("blueprint")?.trim() || null;
    const showLegacyBuilder = searchParams.get("legacy") === "1";
    const showAdvancedBuilder = searchParams.get("advanced") === "1";

    const openEditor = useCallback(
        (id: string) => {
            router.push(`${base}?editor=1&layout=${encodeURIComponent(id)}`);
        },
        [router, base],
    );

    const backToGallery = useCallback(() => {
        router.push(base);
    }, [router, base]);

    const openBlueprintEditor = useCallback(
        (layoutIdForBlueprint?: string | null) => {
            const params = new URLSearchParams({ blueprint: "lead_summary" });
            if (layoutIdForBlueprint) params.set("layout", layoutIdForBlueprint);
            router.push(`${base}?${params.toString()}`);
        },
        [router, base],
    );

    if (blueprint === "lead_summary") {
        return (
            <LeadSummaryCardBlueprintEditor
                layoutId={layoutId}
                onLayoutIdChange={(id) => openBlueprintEditor(id)}
                onBack={backToGallery}
            />
        );
    }

    if (editorMode && layoutId) {
        if (showAdvancedBuilder) {
            return (
                <div className="space-y-3" data-testid="layouts-editor-shell-advanced">
                    <button
                        type="button"
                        onClick={backToGallery}
                        className="inline-flex items-center gap-1 text-xs font-medium text-alloy-pine hover:underline"
                        data-testid="layouts-back-to-gallery"
                    >
                        ← Back to surface gallery
                    </button>
                    <div className="rounded-xl border border-alloy-forge/12 bg-white/90 p-1 shadow-sm">
                        <LayoutConfigClient adminV2Chrome hideLayoutCatalog initialSelectedId={layoutId} />
                    </div>
                    <p className="text-xs text-alloy-midnight/50">
                        <Link
                            href={`${base}?editor=1&layout=${encodeURIComponent(layoutId)}`}
                            className="font-medium text-alloy-pine hover:underline"
                            data-testid="visual-editor-return-to-visual"
                        >
                            Return to visual editor
                        </Link>
                    </p>
                </div>
            );
        }

        return (
            <div className="flex h-full min-h-0 flex-1 flex-col" data-testid="layouts-editor-shell-visual">
                <LayoutVisualEditorRouter
                    layoutId={layoutId}
                    basePath={base}
                    onBack={backToGallery}
                    onLayoutIdChange={(id) => openEditor(id)}
                />
            </div>
        );
    }

    return (
        <div className="space-y-6" data-testid="layouts-gallery-shell">
            <section className="space-y-3">
                <div>
                    <h2 className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/50">
                        Card blueprint library
                    </h2>
                    <p className="mt-0.5 text-xs text-alloy-midnight/45">
                        Configure card archetypes, then publish and assign from{" "}
                        <Link href={ADMIN_V2_SETTINGS_PROCESSES_PATH} className="font-medium text-alloy-pine hover:underline">
                            Processes
                        </Link>
                        .
                    </p>
                </div>
                <article
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-l-4 border-l-alloy-pine border-alloy-forge/12 bg-white/90 p-5 shadow-sm"
                    data-testid="layout-blueprint-lead-summary"
                >
                    <div>
                        <h3 className="text-base font-semibold text-alloy-midnight">Lead Summary</h3>
                        <p className="mt-1 text-xs text-alloy-midnight/55">
                            Attention · Current Work · Tour · Children — compact card slots for Focus Panel summary strip.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => openBlueprintEditor()}
                        className="rounded-xl bg-alloy-pine px-4 py-2 text-sm font-semibold text-white hover:bg-alloy-pine/90"
                        data-testid="layout-blueprint-lead-summary-open"
                    >
                        Edit blueprint
                    </button>
                </article>
            </section>

            <section className="space-y-3">
                <div>
                    <h2 className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/50">
                        Surface gallery
                    </h2>
                    <p className="mt-0.5 text-xs text-alloy-midnight/45">
                        Create, duplicate, edit, and publish surfaces. Assign published surfaces to process stages
                        from{" "}
                        <Link href={ADMIN_V2_SETTINGS_PROCESSES_PATH} className="font-medium text-alloy-pine hover:underline">
                            Configuration → Processes
                        </Link>
                        .
                    </p>
                </div>
                <LayoutGalleryClient onOpenEditor={openEditor} />
            </section>

            <details className="rounded-lg border border-dashed border-alloy-forge/20 bg-alloy-stone/[0.03] px-3 py-2">
                <summary className="cursor-pointer text-xs font-medium text-alloy-midnight/55">
                    Advanced surface builder (internal fallback)
                </summary>
                <div className="mt-3 space-y-2">
                    {!showLegacyBuilder ?
                        <p className="text-xs text-alloy-midnight/50">
                            Opens the full section/row builder used during the Surfaces foundation.{" "}
                            <Link href={`${base}?legacy=1`} className="font-medium text-alloy-pine hover:underline">
                                Open legacy builder
                            </Link>
                        </p>
                    :   (
                        <div className="rounded-xl border border-alloy-forge/12 bg-white/90 p-1 shadow-sm">
                            <LayoutConfigClient adminV2Chrome />
                        </div>
                    )}
                </div>
            </details>
        </div>
    );
}
