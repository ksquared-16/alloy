"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CompletionGuardrailsSettingsPanel from "@/components/adminV2/settings/CompletionGuardrailsSettingsPanel";
import EffectiveDrawerLayoutPreviewPanel from "@/components/adminV2/settings/EffectiveDrawerLayoutPreviewPanel";
import LayoutCatalogSectionsPanel from "@/components/adminV2/settings/LayoutCatalogSectionsPanel";
import LayoutSectionFieldsPanel, {
    type LayoutSectionDetail,
} from "@/components/adminV2/settings/LayoutSectionFieldsPanel";
import OpportunityWorkflowV1SectionsEditor, {
    type LayoutPreviewBundle,
} from "@/components/adminV2/settings/OpportunityWorkflowV1SectionsEditor";
import PersonRuntimeV1LayoutPreviewPanel from "@/components/adminV2/settings/PersonRuntimeV1LayoutPreviewPanel";
import { resolveLayoutCompositionCapabilities } from "@/lib/adminV2/layouts/layoutCompositionCapabilities";
import type { LayoutSettingsEntityKey } from "@/lib/adminV2/layoutsSettingsEntities";
import { layoutSettingsSupportsSectionConfig } from "@/lib/adminV2/layoutsSettingsEntities";
import {
    LAYOUT_DRAWER_HEADER_SECTION_KEY,
    withDrawerHeaderEditorSection,
} from "@/lib/adminV2/layouts/layoutSectionOperatorUi";
import type { PersonRuntimeLayoutSettingsPreview } from "@/lib/recordChrome/personDrawerLayoutSettingsPreview";

type PersonLayoutPreviewBundle = {
    entity_type: string;
    preview_fidelity?: string;
    layout_resolution?: {
        source?: "org_drawer_override" | "global_template" | "presentation_template";
        record_drawer_layout_id?: string | null;
        layout_key?: string;
    };
    person_runtime?: PersonRuntimeLayoutSettingsPreview;
    error?: string;
};

export default function RecordDrawerCompositionWorkspace({
    entity,
}: {
    entity: LayoutSettingsEntityKey;
    entityLabel?: string;
}) {
    const [previewRefresh, setPreviewRefresh] = useState(0);
    const [bundleLoading, setBundleLoading] = useState(false);
    const [previewBundle, setPreviewBundle] = useState<LayoutPreviewBundle | null>(null);
    const [personPreviewBundle, setPersonPreviewBundle] = useState<PersonLayoutPreviewBundle | null>(null);
    const [personPreviewError, setPersonPreviewError] = useState<string | null>(null);
    const bundleReadyRef = useRef(false);
    const [workflowV1Configured, setWorkflowV1Configured] = useState(false);
    const [personRuntimeV1Active, setPersonRuntimeV1Active] = useState(false);
    const [selectedSectionKey, setSelectedSectionKey] = useState<string | null>(null);
    const [editorSections, setEditorSections] = useState<LayoutPreviewBundle["editor_sections"]>([]);
    const [previewSections, setPreviewSections] = useState<LayoutPreviewBundle["sections"]>([]);

    const loadPreviewMeta = useCallback(async (options?: { silent?: boolean }) => {
        if (entity === "person") {
            const silent = options?.silent === true && bundleReadyRef.current;
            if (!silent) {
                bundleReadyRef.current = false;
                setBundleLoading(true);
            }
            setPreviewBundle(null);
            setWorkflowV1Configured(false);
            setEditorSections([]);
            setPreviewSections([]);
            setPersonPreviewError(null);
            try {
                const res = await fetch("/api/admin/record-layouts/effective-preview?entity_type=person");
                const json = (await res.json().catch(() => ({}))) as PersonLayoutPreviewBundle;
                if (!res.ok) {
                    setPersonPreviewError(json.error ?? "Failed to load person layout preview");
                    setPersonPreviewBundle(null);
                    setPersonRuntimeV1Active(false);
                    return;
                }
                setPersonPreviewBundle(json);
                bundleReadyRef.current = true;
                setPersonRuntimeV1Active(json.person_runtime?.runtime_v1_active === true);
            } catch {
                setPersonPreviewError("Failed to load person layout preview");
                setPersonPreviewBundle(null);
                setPersonRuntimeV1Active(false);
            } finally {
                setBundleLoading(false);
            }
            return;
        }

        setPersonPreviewBundle(null);
        setPersonPreviewError(null);
        setPersonRuntimeV1Active(false);

        if (entity !== "opportunity") {
            bundleReadyRef.current = false;
            setWorkflowV1Configured(false);
            setPreviewBundle(null);
            setEditorSections([]);
            setPreviewSections([]);
            return;
        }
        const silent = options?.silent === true && bundleReadyRef.current;
        if (!silent) setBundleLoading(true);
        try {
            const res = await fetch("/api/admin/record-layouts/effective-preview?entity_type=opportunity");
            const json = (await res.json().catch(() => ({}))) as LayoutPreviewBundle & { error?: string };
            if (!res.ok) return;
            setPreviewBundle(json);
            bundleReadyRef.current = true;
            setWorkflowV1Configured(json.workflow?.workflow_v1_configured === true);
            const editorWithHeader = withDrawerHeaderEditorSection(json.editor_sections ?? []);
            setEditorSections(editorWithHeader);
            setPreviewSections(json.sections ?? []);
            setSelectedSectionKey((prev) => {
                if (prev && editorWithHeader.some((s) => s.section_key === prev)) {
                    return prev;
                }
                return editorWithHeader[0]?.section_key ?? null;
            });
        } catch {
            if (!silent) {
                setWorkflowV1Configured(false);
            }
        } finally {
            setBundleLoading(false);
        }
    }, [entity]);

    useEffect(() => {
        bundleReadyRef.current = false;
        void loadPreviewMeta();
    }, [entity, loadPreviewMeta]);

    useEffect(() => {
        if (previewRefresh > 0) {
            void loadPreviewMeta({ silent: true });
        }
    }, [previewRefresh, loadPreviewMeta]);

    const capabilities = useMemo(
        () =>
            resolveLayoutCompositionCapabilities({
                entity,
                workflowV1Configured: entity === "opportunity" ? workflowV1Configured : false,
                personRuntimeV1Active: entity === "person" ? personRuntimeV1Active : false,
            }),
        [entity, workflowV1Configured, personRuntimeV1Active]
    );

    const selectedSection: LayoutSectionDetail | null = useMemo(() => {
        if (!selectedSectionKey) return null;
        const editor = (editorSections ?? []).find((s) => s.section_key === selectedSectionKey);
        const preview = (previewSections ?? []).find((s) => s.section_key === selectedSectionKey);
        const headerFieldKeys =
            selectedSectionKey === LAYOUT_DRAWER_HEADER_SECTION_KEY ? undefined : preview?.field_keys;
        return {
            section_key: selectedSectionKey,
            title: editor?.title ?? preview?.title ?? selectedSectionKey.replace(/_/g, " "),
            kind: editor?.kind ?? preview?.kind ?? "field_section_ref",
            field_keys: headerFieldKeys ?? preview?.field_keys,
        };
    }, [selectedSectionKey, editorSections, previewSections]);

    const showOpportunityEditor = entity === "opportunity" && layoutSettingsSupportsSectionConfig(entity);

    const handleSectionsSaved = useCallback(() => {
        setPreviewRefresh((n) => n + 1);
    }, []);

    const handleSelectSection = useCallback((sectionKey: string) => {
        setSelectedSectionKey(sectionKey);
    }, []);

    return (
        <div className="space-y-3" data-testid="record-drawer-composition-workspace">
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
                        <h2 className="text-sm font-semibold text-alloy-midnight">Drawer sections</h2>
                        <OpportunityWorkflowV1SectionsEditor
                            embedded
                            selectedSectionKey={selectedSectionKey}
                            onSelectSection={handleSelectSection}
                            onSaved={handleSectionsSaved}
                            previewBundle={previewBundle}
                            bundleLoading={bundleLoading && (editorSections?.length ?? 0) === 0}
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
                        layoutPlacements={previewBundle?.field_placements_v1}
                        onSaved={handleSectionsSaved}
                    />
                </div>
            ) : null}

            {entity === "person" ? (
                <div className="space-y-4">
                    <PersonRuntimeV1LayoutPreviewPanel
                        personRuntime={personPreviewBundle?.person_runtime}
                        layoutResolution={personPreviewBundle?.layout_resolution}
                        previewFidelity={personPreviewBundle?.preview_fidelity}
                        loading={bundleLoading && !personPreviewBundle}
                        error={personPreviewError}
                    />
                    <CompletionGuardrailsSettingsPanel />
                </div>
            ) : null}

            <details className="rounded-lg border border-dashed border-alloy-forge/18 bg-alloy-stone/[0.02] text-xs">
                <summary className="cursor-pointer px-3 py-2 font-medium text-alloy-midnight/55">
                    Developer details
                </summary>
                <div className="border-t border-alloy-forge/10 px-1 pb-2">
                    <EffectiveDrawerLayoutPreviewPanel
                        entityType={entity}
                        hideEntitySelect
                        developerMode
                        refreshToken={previewRefresh}
                    />
                </div>
            </details>
        </div>
    );
}
