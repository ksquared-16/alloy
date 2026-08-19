"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { ADMINV2_WORKSPACE_BOS_NESTED_OVERLAY_Z } from "@/components/admin/Drawer";
import {
    COMMS_INPUT_CLASS,
    COMMS_PRIMARY_BTN_CLASS,
    COMMS_SECONDARY_BTN_CLASS,
} from "@/app/adminV2/communications/commsWorkspaceUi";
import {
    canRemoveTemplateCategory,
    countTemplatesInCategory,
    normalizeTemplateCategoryLabel,
} from "@/lib/communications/v2/templateCategoryOptions";

type TemplateCategoryCarrier = { category?: string | null };

type Props = {
    open: boolean;
    onClose: () => void;
    categories: string[];
    templates: TemplateCategoryCarrier[];
    onRename: (from: string, to: string) => void | Promise<void>;
    onRemove: (category: string) => void;
};

export default function TemplateCategoriesManageModal({
    open,
    onClose,
    categories,
    templates,
    onRename,
    onRemove,
}: Props) {
    const [editing, setEditing] = useState<string | null>(null);
    const [editDraft, setEditDraft] = useState("");
    const [busy, setBusy] = useState(false);
    const [localError, setLocalError] = useState<string | null>(null);
    const [portalReady, setPortalReady] = useState(false);

    useEffect(() => {
        setPortalReady(true);
    }, []);

    useEffect(() => {
        if (!open) {
            setEditing(null);
            setEditDraft("");
            setLocalError(null);
            setBusy(false);
        }
    }, [open]);

    const rows = useMemo(
        () =>
            categories.map((name) => ({
                name,
                usage: countTemplatesInCategory(templates, name),
                removeCheck: canRemoveTemplateCategory(templates, name),
            })),
        [categories, templates]
    );

    if (!open || !portalReady) return null;

    const startEdit = (name: string) => {
        setEditing(name);
        setEditDraft(name);
        setLocalError(null);
    };

    const cancelEdit = () => {
        setEditing(null);
        setEditDraft("");
        setLocalError(null);
    };

    const saveEdit = async () => {
        if (!editing) return;
        const next = normalizeTemplateCategoryLabel(editDraft);
        if (!next) {
            setLocalError("Category name cannot be empty.");
            return;
        }
        if (next === editing) {
            cancelEdit();
            return;
        }
        if (categories.some((c) => c !== editing && c.toLowerCase() === next.toLowerCase())) {
            setLocalError("A category with that name already exists.");
            return;
        }
        setBusy(true);
        setLocalError(null);
        try {
            await onRename(editing, next);
            cancelEdit();
        } catch (e) {
            setLocalError(e instanceof Error ? e.message : "Failed to rename category");
        } finally {
            setBusy(false);
        }
    };

    /*
     * Launched from inside the Communications workspace, so it portals to
     * `document.body` at the platform's nested-overlay constant. A raw `z-[120]`
     * on an in-context element cannot beat a body-portaled layer, and it carries
     * none of the ordering guarantees the rest of adminV2 depends on.
     */
    return createPortal(
        <div
            className="fixed inset-0 flex items-center justify-center bg-alloy-midnight/40 px-4 py-8"
            style={{ zIndex: ADMINV2_WORKSPACE_BOS_NESTED_OVERLAY_Z }}
            data-template-categories-manage-modal="true"
            role="dialog"
            aria-modal="true"
            aria-labelledby="template-categories-manage-title"
        >
            <button type="button" className="absolute inset-0 cursor-default" aria-label="Close" onClick={onClose} />
            <div
                className="relative w-full max-w-md rounded-2xl border border-alloy-stone/20 bg-white p-4 shadow-xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="mb-3 flex items-start justify-between gap-2">
                    <div>
                        <h2 id="template-categories-manage-title" className="text-sm font-semibold text-alloy-midnight">
                            Manage Categories
                        </h2>
                        <p className="mt-0.5 text-[11px] text-alloy-midnight/55">
                            Categories come from saved templates and in-session additions.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className={`${COMMS_SECONDARY_BTN_CLASS} !px-2 !py-1 text-[11px]`}
                    >
                        Close
                    </button>
                </div>

                {localError ? (
                    <p className="mb-2 rounded-md bg-red-50 px-2 py-1 text-[11px] text-red-700">{localError}</p>
                ) : null}

                {rows.length === 0 ? (
                    <p className="text-[12px] text-alloy-midnight/50">No categories yet. Create one from the template editor.</p>
                ) : (
                    <ul className="max-h-[min(50vh,20rem)] space-y-2 overflow-y-auto" data-template-categories-list="true">
                        {rows.map((row) => (
                            <li
                                key={row.name}
                                className="rounded-lg border border-alloy-stone/18 bg-white px-2.5 py-2"
                                data-template-category-row={row.name}
                            >
                                {editing === row.name ? (
                                    <div className="flex flex-col gap-2">
                                        <input
                                            data-template-category-rename-input="true"
                                            value={editDraft}
                                            onChange={(e) => setEditDraft(e.target.value)}
                                            className={COMMS_INPUT_CLASS}
                                            autoFocus
                                            disabled={busy}
                                        />
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                data-template-category-rename-save="true"
                                                className={`${COMMS_PRIMARY_BTN_CLASS} !px-2 !py-1 text-[10px]`}
                                                onClick={() => void saveEdit()}
                                                disabled={busy}
                                            >
                                                Save
                                            </button>
                                            <button
                                                type="button"
                                                className={`${COMMS_SECONDARY_BTN_CLASS} !px-2 !py-1 text-[10px]`}
                                                onClick={cancelEdit}
                                                disabled={busy}
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="min-w-0">
                                            <div className="truncate text-[12px] font-medium text-alloy-midnight/90">
                                                {row.name}
                                            </div>
                                            <div className="text-[10px] text-alloy-midnight/45">
                                                {row.usage === 0
                                                    ? "Not used on saved templates yet"
                                                    : `${row.usage} template${row.usage === 1 ? "" : "s"}`}
                                            </div>
                                        </div>
                                        <div className="flex shrink-0 gap-1.5">
                                            <button
                                                type="button"
                                                data-template-category-rename="true"
                                                className={`${COMMS_SECONDARY_BTN_CLASS} !px-2 !py-1 text-[10px]`}
                                                onClick={() => startEdit(row.name)}
                                            >
                                                Edit
                                            </button>
                                            <button
                                                type="button"
                                                data-template-category-remove="true"
                                                className={`${COMMS_SECONDARY_BTN_CLASS} !px-2 !py-1 text-[10px] disabled:opacity-40`}
                                                onClick={() => onRemove(row.name)}
                                                disabled={!row.removeCheck.ok}
                                                title={row.removeCheck.ok ? "Remove category" : row.removeCheck.reason}
                                            >
                                                Remove
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>,
        document.body,
    );
}
