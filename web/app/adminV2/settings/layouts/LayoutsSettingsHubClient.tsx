"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import SettingsEntityTabBar from "@/components/adminV2/settings/SettingsEntityTabBar";
import LayoutIntegrityReportPanel from "@/components/adminV2/settings/LayoutIntegrityReportPanel";
import RecordDrawerCompositionWorkspace from "@/components/adminV2/settings/RecordDrawerCompositionWorkspace";
import { useEntityLabels } from "@/contexts/EntityLabelsContext";
import { adminFieldEntitySingularLabel } from "@/lib/admin/adminFieldEntityDisplayLabel";
import {
    LAYOUT_SETTINGS_ENTITY_ORDER,
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

    return (
        <div className="w-full min-w-0 space-y-3">
            <SettingsEntityTabBar
                tabs={entityTabs}
                activeKey={entity}
                onSelect={onEntityChange}
                aria-label="Record type for layouts"
            />

            <RecordDrawerCompositionWorkspace entity={entity} entityLabel={entityLabel} />

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
