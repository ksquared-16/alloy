"use client";

import { useCallback, useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import LayoutGalleryClient from "@/components/adminV2/settings/LayoutGalleryClient";
import OpportunityDrawerLayoutVisualEditor from "@/components/adminV2/settings/OpportunityDrawerLayoutVisualEditor";
import LayoutConfigClient from "@/components/layout/LayoutConfigClient";

function layoutsBasePath(pathname: string): string {
    if (pathname.startsWith("/admin/v2/settings")) return "/admin/v2/settings/layouts";
    if (pathname.startsWith("/adminv2/settings")) return "/adminv2/settings/layouts";
    return "/admin/settings/layouts";
}

export default function LayoutsSettingsPageClient() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const base = useMemo(() => layoutsBasePath(pathname), [pathname]);

    const editorMode = searchParams.get("editor") === "1";
    const layoutId = searchParams.get("layout")?.trim() || null;
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
                        ← Back to layout gallery
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
                <OpportunityDrawerLayoutVisualEditor
                    layoutId={layoutId}
                    basePath={base}
                    onBack={backToGallery}
                    onLayoutIdChange={(id) => openEditor(id)}
                />
            </div>
        );
    }

    return (
        <div className="space-y-4" data-testid="layouts-gallery-shell">
            <LayoutGalleryClient onOpenEditor={openEditor} />

            <details className="rounded-lg border border-dashed border-alloy-forge/20 bg-alloy-stone/[0.03] px-3 py-2">
                <summary className="cursor-pointer text-xs font-medium text-alloy-midnight/55">
                    Advanced layout builder (internal fallback)
                </summary>
                <div className="mt-3 space-y-2">
                    {!showLegacyBuilder ?
                        <p className="text-xs text-alloy-midnight/50">
                            Opens the full section/row builder used during Layout V2 foundation.{" "}
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
