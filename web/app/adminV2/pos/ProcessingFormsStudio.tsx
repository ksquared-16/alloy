"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ProcessingCreateFormDialog from "./ProcessingCreateFormDialog";
import ProcessingFormsAssetLibrary, { type FormAssetFilter } from "./ProcessingFormsAssetLibrary";
import ProcessingFormBuilder from "./ProcessingFormBuilder";
import ProcessingStudioShell, { ProcessingStudioPlaceholder, type ProcessingStudioTab } from "./ProcessingStudioShell";
import { useProcessingFormApi } from "./useProcessingFormApi";

export default function ProcessingFormsStudio({
    initialFormId,
    initialTab = "forms",
    onTabChange,
    onBuilderOpenChange,
}: {
    initialFormId?: string | null;
    initialTab?: ProcessingStudioTab;
    onTabChange?: (tab: ProcessingStudioTab) => void;
    onBuilderOpenChange?: (open: boolean) => void;
}) {
    const { forms, listErr, listLoaded, loadForms, createBlankForm, archiveForm, deleteForm } = useProcessingFormApi();
    const [selectedFormId, setSelectedFormId] = useState<string | null>(initialFormId ?? null);
    const studioTab = initialTab;
    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState<FormAssetFilter>("all");
    const [createOpen, setCreateOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const [focusFolderId, setFocusFolderId] = useState<string | null>(null);
    const initialFormApplied = useRef(false);

    useEffect(() => {
        if (!listLoaded) void loadForms();
    }, [listLoaded, loadForms]);

    useEffect(() => {
        if (initialFormId && !initialFormApplied.current) {
            initialFormApplied.current = true;
            setSelectedFormId(initialFormId);
        }
    }, [initialFormId]);

    useEffect(() => {
        onBuilderOpenChange?.(!!selectedFormId);
    }, [selectedFormId, onBuilderOpenChange]);

    const handleCreateContinue = useCallback(
        async (payload: {
            name: string;
            description: string;
            brand_name: string;
            accent_color: string;
            origin: "blank" | "document" | "packet";
        }) => {
            if (creating) return;
            setCreating(true);
            try {
                const formId = await createBlankForm(payload);
                if (formId) {
                    setCreateOpen(false);
                    setFilter("all");
                    setFocusFolderId("manual");
                    setSelectedFormId(formId);
                }
            } finally {
                setCreating(false);
            }
        },
        [createBlankForm, creating]
    );

    const handleBackFromBuilder = useCallback(() => {
        setSelectedFormId(null);
        void loadForms();
    }, [loadForms]);

    if (selectedFormId) {
        const formMeta = forms.find((f) => f.id === selectedFormId) ?? null;
        return (
            <ProcessingFormBuilder
                formId={selectedFormId}
                formMeta={formMeta}
                onBack={handleBackFromBuilder}
            />
        );
    }

    return (
        <>
            <ProcessingStudioShell>
                {studioTab === "forms" ? (
                    <ProcessingFormsAssetLibrary
                        forms={forms}
                        search={search}
                        filter={filter}
                        onSearchChange={setSearch}
                        onFilterChange={setFilter}
                        onSelectForm={setSelectedFormId}
                        onCreateBlank={() => setCreateOpen(true)}
                        onArchiveForm={archiveForm}
                        onDeleteForm={deleteForm}
                        listLoaded={listLoaded}
                        listErr={listErr}
                        onRetry={() => void loadForms()}
                        focusFolderId={focusFolderId}
                    />
                ) : studioTab === "packets" ? (
                    <ProcessingStudioPlaceholder
                        title="Packets"
                        body="Packets are a first-class Studio capability, but Packet Composer is intentionally deferred. Existing form assets and builder workflows remain available in Forms."
                    />
                ) : studioTab === "fields" ? (
                    <ProcessingStudioPlaceholder
                        title="Fields"
                        body="Alloy field library integration for Studio is coming next. Form Builder already exposes the full field library when editing a form."
                    />
                ) : (
                    <ProcessingStudioPlaceholder
                        title="Branding"
                        body="Org-wide branding defaults live in Form Builder today. A dedicated Studio branding surface will centralize logos, colors, and document headers."
                    />
                )}
            </ProcessingStudioShell>
            <ProcessingCreateFormDialog
                open={createOpen}
                onClose={() => setCreateOpen(false)}
                onContinue={handleCreateContinue}
                submitting={creating}
                error={listErr}
            />
        </>
    );
}
