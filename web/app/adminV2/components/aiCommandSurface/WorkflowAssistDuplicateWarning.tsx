"use client";

import { useState } from "react";

import { CommandSurfaceCardLink } from "@/app/adminV2/components/aiCommandSurface/CommandSurfaceCardLink";
import { WORKFLOW_ASSIST_AUTOMATIONS_HREF } from "@/lib/adminV2/aiCommandSurface/commandSurfaceRouter";
import type { WorkflowAssistDuplicateCheckV1 } from "@/lib/agent/workflowAssist/workflowAssistDuplicateDetectionV1";
import { brand, derived, semantic } from "@/styles/tokens/colors";

const CMD = {
    textBody: "rgba(39, 63, 82, 0.92)",
    textSupporting: "rgba(39, 63, 82, 0.78)",
    textLabel: "rgba(39, 63, 82, 0.52)",
} as const;

export function WorkflowAssistDuplicateWarning({
    duplicate,
    dismissed,
    onDismiss,
    onProposeEdit,
}: {
    duplicate: WorkflowAssistDuplicateCheckV1;
    dismissed: boolean;
    onDismiss: () => void;
    onProposeEdit: (workflowId: string) => void;
}) {
    const [expandedId, setExpandedId] = useState<string | null>(duplicate.matches[0]?.workflow_id ?? null);

    if (dismissed || !duplicate.has_likely_duplicate) return null;

    return (
        <section
            className="space-y-2 rounded-md border px-2.5 py-2"
            style={{ borderColor: "rgba(220, 38, 38, 0.25)", backgroundColor: "rgba(220, 38, 38, 0.04)" }}
            data-command-surface-workflow-assist-duplicate-warning="true"
        >
            <p className="text-[11px] font-semibold" style={{ color: semantic.warning }}>
                Similar workflow already exists
            </p>
            <p className="text-[10px]" style={{ color: CMD.textSupporting }}>
                Review the existing automation before creating another disabled draft.
            </p>
            <ul className="space-y-2">
                {duplicate.matches.map((m) => {
                    const open = expandedId === m.workflow_id;
                    return (
                        <li
                            key={m.workflow_id}
                            className="rounded-md border px-2 py-1.5"
                            style={{ borderColor: derived.border, backgroundColor: "white" }}
                            data-command-surface-workflow-assist-duplicate-row={m.workflow_id}
                        >
                            <button
                                type="button"
                                className="flex w-full items-start justify-between gap-2 text-left"
                                onClick={() => setExpandedId(open ? null : m.workflow_id)}
                            >
                                <span className="text-[11px] font-semibold" style={{ color: CMD.textBody }}>
                                    {m.name}
                                    <span className="ml-1.5 font-normal" style={{ color: CMD.textLabel }}>
                                        · {m.enabled === false ? "Disabled" : "Enabled"} · {m.scope_label}
                                    </span>
                                </span>
                                <span className="text-[10px]" style={{ color: CMD.textLabel }}>
                                    {open ? "−" : "+"}
                                </span>
                            </button>
                            {open ?
                                <div className="mt-1.5 space-y-1 text-[10px]" style={{ color: CMD.textSupporting }}>
                                    <p>
                                        <span className="font-semibold">Trigger:</span>{" "}
                                        <span className="font-mono">{m.event_type ?? "—"}</span> ·{" "}
                                        <span className="font-mono">{m.entity_type ?? "—"}</span>
                                    </p>
                                    <p>
                                        <span className="font-semibold">Matched because:</span>{" "}
                                        {m.match_reasons.join(" · ")}
                                    </p>
                                    <div className="flex flex-wrap gap-2 pt-1">
                                        <CommandSurfaceCardLink
                                            href={`${WORKFLOW_ASSIST_AUTOMATIONS_HREF}?workflow=${encodeURIComponent(m.workflow_id)}`}
                                            className="text-[10px] font-semibold underline"
                                            style={{ color: brand.secondary }}
                                            data-command-surface-workflow-assist-open-existing-workflow="true"
                                        >
                                            Open existing workflow
                                        </CommandSurfaceCardLink>
                                        <button
                                            type="button"
                                            className="text-[10px] font-semibold underline"
                                            style={{ color: brand.secondary }}
                                            data-command-surface-workflow-assist-propose-edit-existing="true"
                                            onClick={() => onProposeEdit(m.workflow_id)}
                                        >
                                            Propose edit
                                        </button>
                                    </div>
                                </div>
                            : null}
                        </li>
                    );
                })}
            </ul>
            <button
                type="button"
                className="text-[10px] font-semibold underline-offset-2 hover:underline"
                style={{ color: CMD.textBody }}
                data-command-surface-workflow-assist-create-draft-anyway="true"
                onClick={onDismiss}
            >
                Create another draft anyway
            </button>
        </section>
    );
}
