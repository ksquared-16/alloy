"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, FolderPlus, RotateCcw } from "lucide-react";
import ProcessingAlloyDialog from "./ProcessingAlloyDialog";
import { useProcessingFolders } from "@/lib/pos/useProcessingFolders";
import type { ProcessingFolderDefinition } from "@/lib/pos/processingFolderModel";

export default function ProcessingManageFoldersDialog({
    open,
    onClose,
}: {
    open: boolean;
    onClose: () => void;
}) {
    const { folders, addFolder, updateFolder, reorderFolder, hideFolder, resetFolders } = useProcessingFolders();
    const [label, setLabel] = useState("");
    const [description, setDescription] = useState("");
    const [err, setErr] = useState<string | null>(null);

    const editable = folders.filter((f) => !f.isSystem || f.scopes.includes("category"));

    function handleAdd() {
        setErr(null);
        try {
            if (!label.trim()) {
                setErr("Folder name is required.");
                return;
            }
            addFolder({ label, description, scopes: ["form", "work", "category"] });
            setLabel("");
            setDescription("");
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Could not add folder");
        }
    }

    return (
        <ProcessingAlloyDialog
            open={open}
            onClose={onClose}
            title="Manage folders"
            subtitle="Organize forms and work categories. Saved locally for V1 — tenant config will replace localStorage."
            testId="processing-manage-folders-dialog"
            footer={
                <>
                    <button
                        type="button"
                        onClick={() => resetFolders()}
                        className="mr-auto inline-flex items-center gap-1 rounded-lg border border-alloy-stone/20 px-3 py-2 text-[11px] font-semibold text-alloy-midnight/55 hover:bg-alloy-stone/[0.06]"
                    >
                        <RotateCcw className="h-3 w-3" aria-hidden /> Reset defaults
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg border border-alloy-stone/20 bg-white px-4 py-2 text-[12px] font-semibold text-alloy-midnight/70 hover:bg-alloy-stone/[0.06]"
                    >
                        Done
                    </button>
                </>
            }
        >
            <div className="space-y-4">
                <div className="rounded-xl border border-alloy-stone/15 bg-alloy-stone/[0.04] p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/40">Add folder</p>
                    <div className="mt-2 space-y-2">
                        <input
                            type="text"
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                            placeholder="Folder name"
                            className="w-full rounded-lg border border-alloy-stone/20 px-3 py-2 text-[13px]"
                            data-testid="manage-folders-name"
                        />
                        <input
                            type="text"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Description (optional)"
                            className="w-full rounded-lg border border-alloy-stone/20 px-3 py-2 text-[13px]"
                        />
                        {err ? <p className="text-[11px] text-rose-700">{err}</p> : null}
                        <button
                            type="button"
                            onClick={handleAdd}
                            className="inline-flex items-center gap-1 rounded-lg bg-alloy-bend-pine px-3 py-2 text-[12px] font-semibold text-white hover:bg-alloy-bend-pine/90"
                        >
                            <FolderPlus className="h-3.5 w-3.5" aria-hidden /> Add folder
                        </button>
                    </div>
                </div>

                <ul className="max-h-[320px] space-y-2 overflow-y-auto">
                    {editable.map((folder) => (
                        <FolderRow
                            key={folder.id}
                            folder={folder}
                            onRename={(next) => updateFolder(folder.id, { label: next })}
                            onHide={() => hideFolder(folder.id)}
                            onMove={(dir) => reorderFolder(folder.id, dir)}
                        />
                    ))}
                </ul>
            </div>
        </ProcessingAlloyDialog>
    );
}

function FolderRow({
    folder,
    onRename,
    onHide,
    onMove,
}: {
    folder: ProcessingFolderDefinition;
    onRename: (label: string) => void;
    onHide: () => void;
    onMove: (dir: "up" | "down") => void;
}) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(folder.label);

    return (
        <li className="flex items-start gap-2 rounded-xl border border-alloy-stone/15 bg-white p-3 shadow-sm">
            <div className="min-w-0 flex-1">
                {editing && !folder.isSystem ? (
                    <input
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={() => {
                            onRename(draft);
                            setEditing(false);
                        }}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                onRename(draft);
                                setEditing(false);
                            }
                        }}
                        className="w-full rounded-md border border-alloy-stone/20 px-2 py-1 text-[13px] font-semibold"
                        autoFocus
                    />
                ) : (
                    <button
                        type="button"
                        disabled={folder.isSystem}
                        onClick={() => setEditing(true)}
                        className="text-left text-[13px] font-semibold text-alloy-midnight disabled:cursor-default"
                    >
                        {folder.label}
                        {folder.isSystem ? (
                            <span className="ml-2 rounded bg-alloy-stone/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-alloy-midnight/40">
                                System
                            </span>
                        ) : null}
                    </button>
                )}
                {folder.description ? <p className="mt-0.5 text-[11px] text-alloy-midnight/45">{folder.description}</p> : null}
            </div>
            <div className="flex shrink-0 flex-col gap-1">
                <button type="button" onClick={() => onMove("up")} className="rounded border border-alloy-stone/15 p-1 text-alloy-midnight/40 hover:bg-alloy-stone/[0.06]" aria-label="Move up">
                    <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => onMove("down")} className="rounded border border-alloy-stone/15 p-1 text-alloy-midnight/40 hover:bg-alloy-stone/[0.06]" aria-label="Move down">
                    <ChevronDown className="h-3.5 w-3.5" />
                </button>
                {!folder.isSystem ? (
                    <button type="button" onClick={onHide} className="rounded border border-rose-200 px-1 py-0.5 text-[9px] font-semibold text-rose-700 hover:bg-rose-50">
                        Hide
                    </button>
                ) : null}
            </div>
        </li>
    );
}
