"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import EffectiveDrawerLayoutPreviewPanel from "@/components/adminV2/settings/EffectiveDrawerLayoutPreviewPanel";
import LayoutCatalogSectionsPanel from "@/components/adminV2/settings/LayoutCatalogSectionsPanel";
import LayoutSectionFieldsPanel, {
    type LayoutSectionDetail,
} from "@/components/adminV2/settings/LayoutSectionFieldsPanel";
import OpportunityWorkflowV1SectionsEditor from "@/components/adminV2/settings/OpportunityWorkflowV1SectionsEditor";
import {
    LAYOUT_COMPOSITION_PRIMARY_BOS_CAPABILITY,
    resolveLayoutCompositionCapabilities,
} from "@/lib/adminV2/layouts/layoutCompositionCapabilities";
import type { LayoutSettingsEntityKey } from "@/lib/adminV2/layoutsSettingsEntities";
import { layoutSettingsSupportsSectionConfig } from "@/lib/adminV2/layoutsSettingsEntities";

type PreviewPayload = {
    workflow?: { workflow_v1_configured?: boolean };
    editor_sections?: Array<{
        section_key: string;
        title: string;
        kind: string;
        visible: boolean;
    }>;
    sections?: Array<{ section_key: string; title: string; kind: string; field_keys?: string[] }>;
};

export default function RecordDrawerCompositionWorkspace({
    entity,
}: {
    entity: LayoutSettingsEntityKey;
}) {
    const [previewRefresh, setPreviewRefresh] = useState(0);
    const [workflowV1Configured, setWorkflowV1Configured] = useState(false);
    const [selectedSectionKey, setSelectedSectionKey] = useState<string | null>(null);
    const [editorSections, setEditorSections] = useState<PreviewPayload["editor_sections"]>([]);
    const [previewSections, setPreviewSections] = useState<PreviewPayload["sections"]>([]);

    const bumpPreview = useCallback(() => {
        setPreviewRefresh((n) => n + 1);
    }, []);

    const loadPreviewMeta = useCallback(async () => {
        if (entity !== "opportunity") {
            setWorkflowV1Configured(false);
            setEditorSections([]);
            setPreviewSections([]);
            return;
        }
        try {
            const res = await fetch("/api/admin/record-layouts/effective-preview?entity_type=opportunity");
            const json = (await res.json().catch(() => ({}))) as PreviewPayload & { error?: string };
            if (!res.ok) return;
            setWorkflowV1Configured(json.workflow?.workflow_v1_configured === true);
            setEditorSections(json.editor_sections ?? []);
            setPreviewSections(json.sections ?? []);
            setSelectedSectionKey((prev) => {
                if (prev && (json.editor_sections ?? []).some((s) => s.section_key === prev)) {
                    return prev;
                }
                return json.editor_sections?.[0]?.section_key ?? null;
            });
        } catch {
            setWorkflowV1Configured(false);
        }
    }, [entity]);

    useEffect(() => {
        void loadPreviewMeta();
    }, [loadPreviewMeta, previewRefresh]);

    const capabilities = useMemo(
        () =>
            resolveLayoutCompositionCapabilities({
                entity,
                workflowV1Configured: entity === "opportunity" ? workflowV1Configured : false,
            }),
        [entity, workflowV1Configured]
    );

    const selectedSection: LayoutSectionDetail | null = useMemo(() => {
        if (!selectedSectionKey) return null;
        const editor = (editorSections ?? []).find((s) => s.section_key === selectedSectionKey);
        const preview = (previewSections ?? []).find((s) => s.section_key === selectedSectionKey);
        return {
            section_key: selectedSectionKey,
            title: editor?.title ?? preview?.title ?? selectedSectionKey.replace(/_/g, " "),
            kind: editor?.kind ?? preview?.kind ?? "field_section_ref",
            field_keys: preview?.field_keys,
        };
    }, [selectedSectionKey, editorSections, previewSections]);

    const showOpportunityEditor = entity === "opportunity" && layoutSettingsSupportsSectionConfig(entity);

    const handleSectionsSaved = useCallback(() => {
        bumpPreview();
        void loadPreviewMeta();
    }, [bumpPreview, loadPreviewMeta]);

    return (
        <div className="space-y-4" data-testid="record-drawer-composition-workspace">
            <div className="rounded-lg border border-alloy-forge/12 bg-alloy-stone/[0.04] px-3 py-2.5 text-xs leading-relaxed text-alloy-midnight/65">
                <p>
                    Choose which sections appear in the drawer and which fields belong in each section. Use{" "}
                    <Link href="/adminV2/settings/fields" className="font-medium text-alloy-pine hover:underline">
                        Fields
                    </Link>{" "}
                    to create fields or edit field rules; use{" "}
                    <Link href="/adminV2/settings/actions" className="font-medium text-alloy-pine hover:underline">
                        Actions
                    </Link>{" "}
                    for buttons.
                </p>
            </div>

            {capabilities.isReadOnly && capabilities.readOnlyReason ? (
                <div
                    className="rounded-lg border border-amber-200/80 bg-amber-50/80 px-3 py-2 text-xs text-amber-950"
                    data-testid="layout-composition-read-only-banner"
                >
                    {capabilities.readOnlyReason}
                </div>
            ) : null}

            {showOpportunityEditor && capabilities.canManageSections ? (
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                    <div className="space-y-3 rounded-xl border border-alloy-pine/20 bg-white/85 p-4 shadow-sm">
                        <h2 className="text-sm font-semibold text-alloy-midnight">Sections</h2>
                        <OpportunityWorkflowV1SectionsEditor
                            embedded
                            selectedSectionKey={selectedSectionKey}
                            onSelectSection={setSelectedSectionKey}
                            onSaved={handleSectionsSaved}
                        />
                        <LayoutCatalogSectionsPanel
                            entityType={entity}
                            capabilities={capabilities}
                            onChanged={handleSectionsSaved}
                            advancedOnly
                        />
                    </div>
                    <LayoutSectionFieldsPanel
                        entityType={entity}
                        section={selectedSection}
                        capabilities={capabilities}
                        workflowV1Configured={workflowV1Configured}
                        onSaved={handleSectionsSaved}
                    />
                </div>
            ) : null}

            <EffectiveDrawerLayoutPreviewPanel entityType={entity} hideEntitySelect refreshToken={previewRefresh} />
        </div>
    );
}
