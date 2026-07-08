"use client";

import { ChevronDown, ChevronUp, FolderOpen, Pencil, EyeOff } from "lucide-react";
import { useState } from "react";
import type { ProcessingFolderDefinition } from "@/lib/pos/processingFolderModel";
import { useProcessingFolders } from "@/lib/pos/useProcessingFolders";

export default function ProcessingFolderDetailPanel({
    folder,
    formCount,
    onManageFolders,
}: {
    folder: ProcessingFolderDefinition | null;
    formCount: number;
    onManageFolders: () => void;
}) {
    const { updateFolder, reorderFolder, hideFolder } = useProcessingFolders();
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(folder?.label ?? "");

    if (!folder) {
        return (
            <aside className="hidden w-56 shrink-0 border-l border-alloy-stone/12 bg-white p-4 xl:block">
                <p className="text-[12px] text-alloy-midnight/40">Select a folder to see actions and details.</p>
            </aside>
        );
    }

    return (
        <aside className="hidden w-56 shrink-0 overflow-y-auto border-l border-alloy-stone/12 bg-white p-4 xl:block" data-testid="processing-folder-detail-panel">
            <section className="mb-5">
                <h3 className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/35">Folder actions</h3>
                <ul className="mt-2 space-y-1">
                    <li>
                        <button
                            type="button"
                            disabled={folder.isSystem}
                            onClick={() => {
                                setDraft(folder.label);
                                setEditing(true);
                            }}
                            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] font-medium text-alloy-midnight/70 hover:bg-alloy-stone/[0.06] disabled:opacity-40"
                        >
                            <Pencil className="h-3.5 w-3.5 text-alloy-midnight/40" aria-hidden />
                            Rename folder
                        </button>
                    </li>
                    <li>
                        <button
                            type="button"
                            onClick={onManageFolders}
                            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] font-medium text-alloy-midnight/70 hover:bg-alloy-stone/[0.06]"
                        >
                            <FolderOpen className="h-3.5 w-3.5 text-alloy-midnight/40" aria-hidden />
                            Add folder
                        </button>
                    </li>
                    <li className="flex gap-1">
                        <button
                            type="button"
                            onClick={() => reorderFolder(folder.id, "up")}
                            className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-alloy-stone/15 px-2 py-1.5 text-[11px] font-medium text-alloy-midnight/60 hover:bg-alloy-stone/[0.06]"
                        >
                            <ChevronUp className="h-3.5 w-3.5" /> Up
                        </button>
                        <button
                            type="button"
                            onClick={() => reorderFolder(folder.id, "down")}
                            className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-alloy-stone/15 px-2 py-1.5 text-[11px] font-medium text-alloy-midnight/60 hover:bg-alloy-stone/[0.06]"
                        >
                            <ChevronDown className="h-3.5 w-3.5" /> Down
                        </button>
                    </li>
                    {!folder.isSystem ? (
                        <li>
                            <button
                                type="button"
                                onClick={() => hideFolder(folder.id)}
                                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] font-medium text-rose-700 hover:bg-rose-50"
                            >
                                <EyeOff className="h-3.5 w-3.5" aria-hidden />
                                Hide folder
                            </button>
                        </li>
                    ) : null}
                </ul>
            </section>

            <section className="rounded-xl border border-alloy-stone/15 bg-alloy-stone/[0.03] p-3">
                <h3 className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/35">Folder details</h3>
                {editing && !folder.isSystem ? (
                    <input
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={() => {
                            updateFolder(folder.id, { label: draft });
                            setEditing(false);
                        }}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                updateFolder(folder.id, { label: draft });
                                setEditing(false);
                            }
                        }}
                        className="mt-2 w-full rounded-md border border-alloy-stone/20 px-2 py-1 text-[13px] font-semibold"
                        autoFocus
                    />
                ) : (
                    <p className="mt-2 text-[14px] font-semibold text-alloy-midnight">{folder.label}</p>
                )}
                {folder.description ? (
                    <p className="mt-1 text-[11px] leading-snug text-alloy-midnight/45">{folder.description}</p>
                ) : (
                    <p className="mt-1 text-[11px] text-alloy-midnight/35">Organize reusable forms in this folder.</p>
                )}
                <p className="mt-3 text-[22px] font-bold tabular-nums text-alloy-bend-pine">{formCount}</p>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/35">Forms</p>
            </section>
        </aside>
    );
}
