"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import LayoutsSettingsPageClient from "@/app/adminV2/settings/layouts/LayoutsSettingsPageClient";
import EffectiveLayoutInspectorClient from "@/components/adminV2/settings/EffectiveLayoutInspectorClient";
import SettingsPageHeader from "@/components/adminV2/settings/SettingsPageHeader";
import { SETTINGS_PAGE_SHELL_COMPACT_CLASS } from "@/lib/adminV2/settingsPageLayout";
import { isExperienceBuilderStudioActive } from "@/lib/layout/experienceBuilderStudioMode";
import { LAYOUTS_HUB_REGISTRY_TRUST_NOTE } from "@/lib/fields/fieldSettingsOperatorUi";
import { usePathname } from "next/navigation";

type Props = {
    initialEntityType?: string;
};

function LayoutsSettingsPageShellInner({ initialEntityType }: Props) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const studioMode = isExperienceBuilderStudioActive(pathname, searchParams);

    if (studioMode) {
        return (
            <div
                className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
                data-testid="experience-builder-studio-root"
            >
                <Suspense
                    fallback={
                        <div className="flex flex-1 items-center justify-center text-sm text-alloy-midnight/55">
                            Loading experience builder…
                        </div>
                    }
                >
                    <LayoutsSettingsPageClient />
                </Suspense>
            </div>
        );
    }

    return (
        <div className={SETTINGS_PAGE_SHELL_COMPACT_CLASS} data-testid="settings-layouts-page">
            <SettingsPageHeader
                variant="hero"
                title="Surfaces"
                subtitle="Design Surfaces. Configure how operational surfaces appear in the product — drawers, queue rows, and workspaces."
            />
            <p
                className="-mt-2 rounded-lg border border-alloy-forge/10 bg-alloy-pine/[0.04] px-3 py-2 text-xs leading-relaxed text-alloy-midnight/65"
                data-testid="layouts-hub-registry-trust-note"
            >
                {LAYOUTS_HUB_REGISTRY_TRUST_NOTE}{" "}
                <Link href="/settings/fields" className="font-medium text-alloy-pine hover:underline">
                    Open Fields
                </Link>
                .
            </p>

            <Suspense
                fallback={
                    <div className="rounded-xl border border-alloy-forge/12 bg-white/90 px-5 py-8 text-sm text-alloy-midnight/55">
                        Loading surface gallery…
                    </div>
                }
            >
                <LayoutsSettingsPageClient />
            </Suspense>

            <details className="rounded-lg border border-alloy-stone/30 bg-white/70 px-3 py-2">
                <summary className="cursor-pointer text-xs font-medium text-alloy-midnight/60">
                    Effective surface inspector (read-only resolution debug)
                </summary>
                <div className="mt-3 space-y-2">
                    <EffectiveLayoutInspectorClient
                        initialEntityType={initialEntityType ?? "opportunities"}
                        initialSurface="drawer"
                    />
                    <p className="text-xs text-alloy-midnight/55">
                        <Link href="/settings/surfaces/effective" className="text-alloy-pine underline">
                            Full-screen effective surface inspector
                        </Link>
                    </p>
                </div>
            </details>
        </div>
    );
}

export default function LayoutsSettingsPageShell(props: Props) {
    return (
        <Suspense fallback={<div className="px-4 py-8 text-sm text-alloy-midnight/55">Loading surfaces…</div>}>
            <LayoutsSettingsPageShellInner {...props} />
        </Suspense>
    );
}
