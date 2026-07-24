"use client";

/**
 * Queue folder association — which Work-queue folder this form's submissions land in.
 *
 * Persists `metadata.admin_category` on the form definition. The folder model treats that as
 * authoritative and keyword matching as the fallback ("Fallback keyword match when
 * metadata.admin_category is unset"), so setting it here routes intake deterministically instead
 * of relying on the form's name happening to contain the folder keyword.
 *
 * The value is copied onto each Processing case at intake, so the queue rail can group without
 * re-reading the form.
 */

import clsx from "clsx";
import { useCallback, useMemo, useState } from "react";
import { useProcessingFolders } from "@/lib/pos/useProcessingFolders";
import { opMutedMeta } from "@/lib/operational/ui/operationalVisualTokens";

const NO_FOLDER = "";

type Props = {
    formId: string;
    formMetadata: Record<string, unknown> | null | undefined;
    canMutate?: boolean;
    onFormMetadataUpdated?: (metadata: Record<string, unknown>) => void;
};

function readCategory(metadata: Record<string, unknown> | null | undefined): string {
    const raw = metadata?.admin_category;
    return typeof raw === "string" && raw.trim() ? raw.trim().toLowerCase() : NO_FOLDER;
}

export function FormQueueFolderPanel({ formId, formMetadata, canMutate = false, onFormMetadataUpdated }: Props) {
    const { categoryFolders } = useProcessingFolders();
    const stored = useMemo(() => readCategory(formMetadata), [formMetadata]);
    const [value, setValue] = useState(stored);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const save = useCallback(
        async (next: string) => {
            setSaving(true);
            setError(null);
            const previous = value;
            setValue(next);
            try {
                const base = { ...((formMetadata ?? {}) as Record<string, unknown>) };
                if (next) base.admin_category = next;
                else delete base.admin_category;

                const res = await fetch(`/api/admin/forms/${encodeURIComponent(formId)}`, {
                    method: "PATCH",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ metadata: base }),
                });
                const json = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error((json as { error?: string }).error ?? "Could not save queue folder");
                const saved = (json as { data?: { metadata?: Record<string, unknown> } }).data?.metadata;
                if (saved) onFormMetadataUpdated?.(saved);
            } catch (e) {
                setValue(previous);
                setError(e instanceof Error ? e.message : "Could not save queue folder");
            } finally {
                setSaving(false);
            }
        },
        [formId, formMetadata, onFormMetadataUpdated, value]
    );

    const selectedLabel = categoryFolders.find((f) => f.id === value)?.label ?? null;

    return (
        <div
            className="mt-3 rounded-lg bg-white/95 px-3 py-2.5 ring-1 ring-alloy-midnight/[0.07]"
            data-testid="form-queue-folder-panel"
        >
            <p className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/65">Queue folder</p>
            <p className={clsx("mt-0.5 max-w-xl", opMutedMeta)}>
                Where submissions from this form land in the Work queue.
            </p>

            <label className="mt-3 block space-y-1">
                <span className="text-xs font-medium text-alloy-midnight">Folder</span>
                <select
                    className="w-full rounded-lg border border-alloy-midnight/10 bg-white px-2.5 py-1.5 text-sm shadow-sm disabled:opacity-60"
                    value={value}
                    disabled={!canMutate || saving}
                    data-testid="form-queue-folder-select"
                    onChange={(e) => void save(e.target.value)}
                >
                    <option value={NO_FOLDER}>No folder — match by keyword</option>
                    {categoryFolders.map((folder) => (
                        <option key={folder.id} value={folder.id}>
                            {folder.label}
                        </option>
                    ))}
                </select>
            </label>

            {error ? (
                <p className="mt-2 text-sm text-alloy-ember" role="alert">
                    {error}
                </p>
            ) : (
                <p className={clsx("mt-2", opMutedMeta)} data-testid="form-queue-folder-summary">
                    {saving
                        ? "Saving…"
                        : selectedLabel
                          ? `New submissions appear under ${selectedLabel}.`
                          : "Without a folder, submissions route by keyword and usually land in Incoming."}
                </p>
            )}
        </div>
    );
}

export default FormQueueFolderPanel;
