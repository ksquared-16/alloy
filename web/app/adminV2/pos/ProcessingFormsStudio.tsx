"use client";

import { useCallback, useEffect, useState } from "react";
import ProcessingCreateFormDialog from "./ProcessingCreateFormDialog";
import ProcessingFormsAssetLibrary, { type FormAssetFilter } from "./ProcessingFormsAssetLibrary";
import ProcessingFormBuilder from "./ProcessingFormBuilder";
import PosPacketsPanel from "./PosPacketsPanel";
import ProcessingStudioShell, { ProcessingStudioPlaceholder, type ProcessingStudioTab } from "./ProcessingStudioShell";
import { useProcessingFormApi } from "./useProcessingFormApi";

export default function ProcessingFormsStudio({
    selectedFormId,
    initialFormName = null,
    onSelectedFormIdChange,
    initialTab = "forms",
    onTabChange,
}: {
    selectedFormId: string | null;
    initialFormName?: string | null;
    onSelectedFormIdChange: (formId: string | null) => void;
    initialTab?: ProcessingStudioTab;
    onTabChange?: (tab: ProcessingStudioTab) => void;
}) {
    const { forms, listErr, listLoaded, loadForms, createBlankForm, archiveForm, deleteForm } = useProcessingFormApi();
    const studioTab = initialTab;
    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState<FormAssetFilter>("all");
    const [createOpen, setCreateOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const [focusFolderId, setFocusFolderId] = useState<string | null>(null);

    useEffect(() => {
        if (!listLoaded) void loadForms();
    }, [listLoaded, loadForms]);

    const openForm = useCallback(
        (formId: string) => {
            onSelectedFormIdChange(formId);
        },
        [onSelectedFormIdChange]
    );

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
                    openForm(formId);
                }
            } finally {
                setCreating(false);
            }
        },
        [createBlankForm, creating, openForm]
    );

    const handleBackFromBuilder = useCallback(() => {
        onSelectedFormIdChange(null);
        void loadForms();
    }, [loadForms, onSelectedFormIdChange]);

    if (selectedFormId) {
        const formMeta = forms.find((f) => f.id === selectedFormId) ?? null;
        return (
            <ProcessingFormBuilder
                formId={selectedFormId}
                formMeta={formMeta}
                initialFormName={initialFormName}
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
                        onSelectForm={openForm}
                        onCreateBlank={() => setCreateOpen(true)}
                        onArchiveForm={archiveForm}
                        onDeleteForm={deleteForm}
                        listLoaded={listLoaded}
                        listErr={listErr}
                        onRetry={() => void loadForms()}
                        focusFolderId={focusFolderId}
                    />
                ) : studioTab === "packets" ? (
                    <PosPacketsPanel embedded />
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
