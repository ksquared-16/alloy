"use client";

/**
 * The caller's own sidebar workspaces (Access V3, S5): hide a workspace your roles show, or reset to
 * your role defaults. Own user only — there is no target-user input, and the route refuses any other
 * principal. A workspace your roles do not show has no control: an override can only hide.
 *
 * Until the override store exists (held migration) the controls are disabled and say so; nothing is
 * shown as saved unless the server answered `saved: true`.
 */

import { useEffect, useMemo, useState } from "react";

import type { WorkspaceSurfaceKey } from "@/lib/access/workspaceVisibility";
import { ownWorkspaceControlRows, toggleDraftHidden } from "@/lib/access/workspaceVisibilityOverrides";
import type { OverrideSaveOutcome } from "@/lib/access/workspaceVisibilityOverrideLoader";
import { useOwnWorkspaceVisibility, workspaceVisibilityOverrideLoader } from "@/lib/access/useWorkspaceVisibilityOverride";

type NotSaved = Exclude<OverrideSaveOutcome, { saved: true }>;

const NOT_SAVED: Record<NotSaved["reason"], string> = {
    store_unavailable: "Not saved — personal workspace choices can't be stored yet.",
    refused: "Not saved — the change was refused.",
    failed: "Not saved — something went wrong. Try again.",
    superseded: "Not saved — a newer change replaced it.",
};

export default function AdminV2WorkspaceVisibilityControls() {
    // Role defaults alone: the controls describe what the roles show, then the draft hides from that.
    const { principal, entry, roleDefaults } = useOwnWorkspaceVisibility();
    const savedHidden = useMemo(() => [...(entry?.override?.hiddenSurfaceKeys ?? [])], [entry?.override]);
    const [draft, setDraft] = useState<string[]>(savedHidden);
    useEffect(() => setDraft(savedHidden), [savedHidden]);
    // A superseded save never reaches the entry (a newer operation owns it), so it is kept here.
    const [superseded, setSuperseded] = useState<NotSaved | null>(null);
    // Opening the panel retries a load that failed.
    useEffect(() => {
        if (principal) workspaceVisibilityOverrideLoader.ensure(principal);
    }, [principal]);

    if (!principal) return null;
    const rows = ownWorkspaceControlRows(roleDefaults, draft);
    const available = entry?.status === "loaded";
    const busy = !entry || entry.status === "loading" || entry.saving;
    const dirty = draft.join(",") !== savedHidden.join(",");
    const lastSave = superseded ?? entry?.lastSave;
    const run = (op: Promise<OverrideSaveOutcome>) => {
        setSuperseded(null);
        void op.then((o) => {
            if (!o.saved && o.reason === "superseded") setSuperseded(o);
        });
    };

    return (
        <div className="px-3 py-2.5 text-sm" data-adminv2-workspace-visibility-controls="" data-store={entry?.status ?? "unknown"}>
            <div className="font-semibold text-alloy-midnight">Workspaces in my sidebar</div>
            <p className="mt-0.5 text-xs text-alloy-midnight/60">
                Hiding a workspace only tidies your sidebar. It does not change what you can open or do.
            </p>
            <ul className="mt-2 space-y-1">
                {rows.map((row) => (
                    <li key={row.key} className="flex items-center justify-between gap-2">
                        <span className={row.hideable ? "" : "text-alloy-midnight/50"}>{row.label}</span>
                        {row.hideable ?
                            <label className="inline-flex items-center gap-1 text-xs">
                                <input
                                    type="checkbox"
                                    checked={!row.hidden}
                                    disabled={!available || busy}
                                    onChange={() => setDraft(toggleDraftHidden(rows, draft, row.key as WorkspaceSurfaceKey))}
                                    data-workspace-visibility-toggle={row.key}
                                />
                                Show
                            </label>
                        :   <span className="text-xs text-alloy-midnight/50" data-workspace-visibility-note={row.note ?? ""}>
                                {row.note === "not_in_roles" ? "Not in your roles" : "Not known yet"}
                            </span>
                        }
                    </li>
                ))}
            </ul>
            {entry?.status === "unavailable" ?
                <p className="mt-2 text-xs text-alloy-midnight/60" data-workspace-visibility-unavailable="">
                    Personal workspace choices can't be saved yet. Your sidebar follows your role defaults.
                </p>
            : entry?.status === "error" ?
                <p className="mt-2 text-xs text-alloy-midnight/60">
                    Your workspace choices couldn't be loaded. Your role defaults apply.{" "}
                    <button type="button" className="underline" onClick={() => void workspaceVisibilityOverrideLoader.load(principal)}>
                        Try again
                    </button>
                </p>
            :   null}
            {lastSave && !lastSave.saved ?
                <p className="mt-1 text-xs" role="status" data-workspace-visibility-unsaved="">
                    {NOT_SAVED[lastSave.reason]}
                </p>
            :   null}
            <div className="mt-2 flex gap-2">
                <button
                    type="button"
                    className="rounded border px-2 py-1 text-xs disabled:opacity-50"
                    disabled={!available || busy || !dirty}
                    onClick={() => run(workspaceVisibilityOverrideLoader.save(principal, draft as WorkspaceSurfaceKey[]))}
                >
                    Save
                </button>
                <button
                    type="button"
                    className="rounded border px-2 py-1 text-xs disabled:opacity-50"
                    disabled={!available || busy || savedHidden.length === 0}
                    onClick={() => run(workspaceVisibilityOverrideLoader.reset(principal))}
                >
                    Reset to role defaults
                </button>
            </div>
        </div>
    );
}
