"use client";

import { useState } from "react";

import type { ActionWorkspaceBosSuggestion, ActionWorkspaceGatherField } from "@/lib/admin/actions/actionWorkspaceTypes";
import {
    buildCreateLeadLiveFindings,
    buildCreateLeadMaterialCard,
} from "@/lib/admin/actions/createLeadOperationalIntakeModel";
import { CreateLeadDraftLeadColumn } from "@/components/admin/actions/CreateLeadDraftLeadColumn";
import { CreateLeadMaterialStackColumn } from "@/components/admin/actions/CreateLeadMaterialStackColumn";

type Props = {
    pasteText: string;
    onPasteTextChange: (value: string) => void;
    suggestions: ActionWorkspaceBosSuggestion[];
    values: Record<string, string>;
    sections: Array<{ key: string; label: string; fields: ActionWorkspaceGatherField[] }>;
    platformRequiredKeys: readonly string[];
    onFieldChange: (payloadKey: string, value: string) => void;
    onToggleSuggestion: (id: string) => void;
    onApplySuggestions: () => void;
    onSuggestionValueChange: (id: string, value: string) => void;
    onAnalyze: () => void;
    analyzing: boolean;
    analyzeError: string | null;
    disabled?: boolean;
    manualMode: boolean;
    onEnterManually: () => void;
    onClearMaterial: () => void;
    materialAnalyzed: boolean;
    validationIssues: string[];
};

export function CreateLeadOperationalIntake({
    pasteText,
    onPasteTextChange,
    suggestions,
    values,
    sections,
    platformRequiredKeys,
    onFieldChange,
    onToggleSuggestion,
    onApplySuggestions,
    onSuggestionValueChange,
    onAnalyze,
    analyzing,
    analyzeError,
    disabled = false,
    manualMode,
    onEnterManually,
    onClearMaterial,
    materialAnalyzed,
    validationIssues,
}: Props) {
    const [composerOpen, setComposerOpen] = useState(false);

    const material = buildCreateLeadMaterialCard({
        pasteText,
        analyzing,
        analyzed: materialAnalyzed,
    });
    const draftFindings = buildCreateLeadLiveFindings({
        suggestions,
        values,
        analyzing,
        manualMode,
    });
    const selectedSuggestionCount = suggestions.filter((s) => s.selected).length;

    const handleClearMaterial = () => {
        setComposerOpen(false);
        onClearMaterial();
    };

    return (
        <div
            className="grid min-h-0 flex-1 grid-cols-[minmax(280px,38%)_minmax(420px,1fr)]"
            data-testid="create-lead-operational-intake"
        >
            <CreateLeadMaterialStackColumn
                material={material}
                pasteDraft={pasteText}
                onPasteDraftChange={onPasteTextChange}
                onCommitPaste={() => setComposerOpen(false)}
                onRemoveMaterial={handleClearMaterial}
                onAnalyze={onAnalyze}
                analyzing={analyzing}
                disabled={disabled}
                analyzeError={null}
                composerOpen={composerOpen}
                onComposerOpenChange={setComposerOpen}
                manualMode={manualMode}
                onEnterManually={onEnterManually}
                onClearMaterial={handleClearMaterial}
                onAddSource={() => setComposerOpen(true)}
                hasMaterial={Boolean(material)}
            />
            <CreateLeadDraftLeadColumn
                findings={draftFindings}
                suggestions={suggestions}
                analyzing={analyzing}
                manualMode={manualMode}
                sections={sections}
                values={values}
                platformRequiredKeys={platformRequiredKeys}
                onFieldChange={onFieldChange}
                onSuggestionValueChange={onSuggestionValueChange}
                onToggleSuggestion={onToggleSuggestion}
                onApplySuggestions={onApplySuggestions}
                selectedSuggestionCount={selectedSuggestionCount}
                analyzeError={analyzeError}
                validationIssues={manualMode ? validationIssues : []}
            />
        </div>
    );
}
