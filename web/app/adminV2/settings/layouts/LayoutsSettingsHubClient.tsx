"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import SettingsEntityTabBar from "@/components/adminV2/settings/SettingsEntityTabBar";
import EffectiveDrawerLayoutPreviewPanel from "@/components/adminV2/settings/EffectiveDrawerLayoutPreviewPanel";
import LayoutIntegrityReportPanel from "@/components/adminV2/settings/LayoutIntegrityReportPanel";
import OpportunityWorkflowV1DrawerOrderEditor from "@/components/adminV2/settings/OpportunityWorkflowV1DrawerOrderEditor";
import { useEntityLabels } from "@/contexts/EntityLabelsContext";
import { adminFieldEntitySingularLabel } from "@/lib/admin/adminFieldEntityDisplayLabel";
import {
    LAYOUT_SETTINGS_ENTITY_ORDER,
    layoutSettingsAddSectionUnavailableCopy,
    layoutSettingsSupportsAddSection,
    layoutSettingsSupportsSectionOrder,
    normalizeLayoutSettingsEntity,
    type LayoutSettingsEntityKey,
} from "@/lib/adminV2/layoutsSettingsEntities";

function layoutsBasePath(pathname: string): string {
    if (pathname.startsWith("/admin/v2/settings")) return "/admin/v2/settings/layouts";
    if (pathname.startsWith("/adminv2/settings")) return "/adminv2/settings/layouts";
    return "/adminV2/settings/layouts";
}

export default function LayoutsSettingsHubClient({ initialEntity }: { initialEntity?: string }) {
    const router = useRouter();
    const pathname = usePathname();
    const { labels } = useEntityLabels();
    const entity = useMemo(() => normalizeLayoutSettingsEntity(initialEntity), [initialEntity]);
    const [previewRefresh, setPreviewRefresh] = useState(0);
    const [integrityOpen, setIntegrityOpen] = useState(false);

    const entityTabs = useMemo(
        () =>
            LAYOUT_SETTINGS_ENTITY_ORDER.map((key) => ({
                key,
                label: adminFieldEntitySingularLabel(labels, key),
            })),
        [labels]
    );

    const onEntityChange = useCallback(
        (next: LayoutSettingsEntityKey) => {
            router.replace(`${layoutsBasePath(pathname)}?entity=${encodeURIComponent(next)}`);
        },
        [router, pathname]
    );

    const entityLabel = adminFieldEntitySingularLabel(labels, entity);
    const canReorder = layoutSettingsSupportsSectionOrder(entity);
    const canAddSection = layoutSettingsSupportsAddSection(entity);

    return (
        <div className="w-full max-w-6xl space-y-5">
            <SettingsEntityTabBar
                tabs={entityTabs}
                activeKey={entity}
                onSelect={onEntityChange}
                aria-label="Record type for layouts"
            />

            <p className="text-xs leading-relaxed text-alloy-midnight/55">
                Configure drawer sections for <span className="font-medium text-alloy-midnight/75">{entityLabel}</span> records.
                Field labels and required rules are on{" "}
                <Link href="/adminV2/settings/fields" className="font-medium text-alloy-pine hover:underline">
                    Fields
                </Link>
                .
            </p>

            <div className="flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    disabled
                    title={layoutSettingsAddSectionUnavailableCopy()}
                    className="cursor-not-allowed rounded-lg border border-dashed border-alloy-forge/25 bg-alloy-stone/[0.04] px-3 py-1.5 text-xs font-medium text-alloy-midnight/40"
                >
                    Add section
                </button>
                {!canAddSection && (
                    <span className="max-w-md text-[11px] leading-snug text-alloy-midnight/50">
                        {layoutSettingsAddSectionUnavailableCopy()}
                    </span>
                )}
            </div>

            {canReorder ? (
                <OpportunityWorkflowV1DrawerOrderEditor onSaved={() => setPreviewRefresh((n) => n + 1)} />
            ) : (
                <div className="rounded-lg border border-alloy-forge/12 bg-alloy-stone/[0.04] px-3 py-2.5 text-xs text-alloy-midnight/60">
                    Section order editing is available for inquiries (opportunity workflow). For {entityLabel}, review the
                    resolved sections below — runtime may add pricing or system blocks in the drawer.
                </div>
            )}

            <EffectiveDrawerLayoutPreviewPanel entityType={entity} refreshToken={previewRefresh} hideEntitySelect />

            <details
                className="rounded-xl border border-dashed border-alloy-forge/20 bg-alloy-stone/[0.03]"
                open={integrityOpen}
                onToggle={(e) => setIntegrityOpen((e.target as HTMLDetailsElement).open)}
            >
                <summary className="cursor-pointer px-4 py-3 text-xs font-medium text-alloy-midnight/65">
                    Layout integrity check (optional)
                </summary>
                <div className="border-t border-alloy-forge/10 px-1 pb-2">
                    <LayoutIntegrityReportPanel />
                </div>
            </details>
        </div>
    );
}
