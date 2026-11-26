"use client";

import { useState } from "react";

import { useProcessingFolders } from "@/lib/pos/useProcessingFolders";
import { AlloyFieldLabel, AlloySecondaryButton, AlloySelect, AlloyTextInput } from "./ProcessingAlloyControls";

/**
 * WHERE THE FORM IS FILED, chosen at Save to Forms.
 *
 * The same folders — and the same assignment (`metadata.admin_category`) — a hand-built form uses in its
 * folder control. A new folder can be created right here: it is saved to the organisation first and then
 * selected, so the operator never leaves the form they are finishing.
 */
export default function ProcessingSaveToFormsFolder({
    value,
    onChange,
    disabled,
}: {
    value: string;
    onChange: (folderId: string) => void;
    disabled?: boolean;
}) {
    const { categoryFolders, createFolder } = useProcessingFolders();
    const [creating, setCreating] = useState(false);
    const [name, setName] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const create = async () => {
        const label = name.trim();
        if (!label) {
            setError("Enter a folder name.");
            return;
        }
        setBusy(true);
        setError(null);
        try {
            const folder = await createFolder({ label, scopes: ["form", "work", "category"] });
            onChange(folder.id);
            setCreating(false);
            setName("");
        } catch (e) {
            setError(e instanceof Error ? e.message : "Couldn't create the folder.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div data-testid="processing-save-to-forms-folder">
            <AlloyFieldLabel>Folder</AlloyFieldLabel>
            <AlloySelect
                value={value}
                onChange={onChange}
                disabled={disabled || busy}
                placeholder="No folder"
                options={categoryFolders.map((f) => ({ value: f.id, label: f.label }))}
                testId="processing-save-to-forms-folder-select"
            />
            {creating ? (
                <div className="mt-2 flex items-end gap-2" data-testid="processing-save-to-forms-new-folder">
                    <div className="min-w-0 flex-1">
                        <AlloyTextInput
                            value={name}
                            onChange={setName}
                            placeholder="e.g. 2026–2027 Enrollment"
                            testId="processing-save-to-forms-new-folder-name"
                        />
                    </div>
                    <AlloySecondaryButton onClick={() => void create()} testId="processing-save-to-forms-new-folder-create">
                        {busy ? "Creating…" : "Create"}
                    </AlloySecondaryButton>
                    <button
                        type="button"
                        className="pb-2 text-[11px] text-alloy-midnight/55 underline"
                        onClick={() => {
                            setCreating(false);
                            setError(null);
                        }}
                    >
                        Cancel
                    </button>
                </div>
            ) : (
                <button
                    type="button"
                    disabled={disabled}
                    className="mt-1.5 text-[11px] font-semibold text-alloy-bend-pine hover:underline"
                    onClick={() => setCreating(true)}
                    data-testid="processing-save-to-forms-create-folder"
                >
                    + Create new folder
                </button>
            )}
            {error ? <p className="mt-1 text-[11px] text-alloy-ember">{error}</p> : null}
        </div>
    );
}
