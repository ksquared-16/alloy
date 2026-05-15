"use client";

import { useCallback, useState } from "react";

import type { WorkflowAssistSuggestionV1 } from "@/lib/agent/workflowAssist/workflowAssistProposalV1";
import { brand, derived, neutral, semantic } from "@/styles/tokens/colors";

const CMD = {
    textBody: neutral.textPrimary,
    textSupporting: "rgba(39, 63, 82, 0.78)",
    textLabel: "rgba(39, 63, 82, 0.52)",
} as const;

type ApplyJson =
    | {
          ok: true;
          suggestion_id: string;
          proposal_kind: string;
          workflow_id: string;
          workflow: Record<string, unknown>;
          audit?: { source: string };
      }
    | { ok: false; error?: string; message?: string | null; validation_errors?: string[] | null };

export function WorkflowAssistProposalActionCard({ suggestion }: { suggestion: WorkflowAssistSuggestionV1 }) {
    const [busy, setBusy] = useState(false);
    const [done, setDone] = useState<ApplyJson | null>(null);

    const apply = useCallback(async () => {
        setBusy(true);
        setDone(null);
        try {
            const res = await fetch("/api/admin/ai/workflow-assist/apply", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json", Accept: "application/json" },
                body: JSON.stringify({
                    version: 1,
                    suggestion_id: suggestion.suggestion_id,
                    proposal: suggestion,
                    confirm: true,
                }),
            });
            const j = (await res.json()) as ApplyJson;
            if (!res.ok) {
                setDone({ ok: false, error: (j as { error?: string }).error, message: (j as { message?: string }).message });
                return;
            }
            setDone(j);
        } catch (e) {
            setDone({
                ok: false,
                error: "FETCH_FAILED",
                message: e instanceof Error ? e.message : "Apply request failed.",
            });
        } finally {
            setBusy(false);
        }
    }, [suggestion]);

    return (
        <div className="space-y-2" data-command-surface-workflow-assist-proposal-card="true">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: CMD.textLabel }}>
                    Workflow Assist · proposal
                </div>
                <span
                    className="rounded-full px-2 py-0.5 text-[9px] font-semibold"
                    style={{ backgroundColor: "rgba(220, 38, 38, 0.12)", color: semantic.warning }}
                >
                    Admin approval required
                </span>
            </div>
            <p className="text-[11px] font-semibold" style={{ color: CMD.textBody }}>
                {suggestion.proposal_kind === "create_workflow" ?
                    `Create workflow (disabled): ${suggestion.draft_row?.name ?? "—"}`
                : suggestion.proposal_kind === "pause_workflow" ?
                    `Disable workflow ${suggestion.target_workflow_id ?? ""}`
                :   `Edit workflow ${suggestion.target_workflow_id ?? ""}`}
            </p>
            <p className="text-[10px]" style={{ color: CMD.textSupporting }}>
                {suggestion.reasoning.summary}
            </p>
            {suggestion.reasoning.warnings.length ?
                <ul className="list-disc pl-4 text-[10px]" style={{ color: semantic.warning }}>
                    {suggestion.reasoning.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                    ))}
                </ul>
            : null}
            <div className="rounded-md border border-dashed px-2 py-1.5 text-[10px]" style={{ borderColor: derived.border, color: CMD.textLabel }}>
                Read-only summary cards above do not change workflows. This action writes through the same admin paths
                as Automations after you confirm.
            </div>
            <button
                type="button"
                disabled={busy || done?.ok === true}
                className="rounded-md bg-alloy-midnight/90 px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
                data-command-surface-workflow-assist-apply="true"
                onClick={() => void apply()}
            >
                {busy ? "Applying…" : done?.ok ? "Applied" : "Apply as admin"}
            </button>
            {done && !done.ok ?
                <p className="text-[11px]" style={{ color: semantic.warning }} data-command-surface-workflow-assist-apply-error>
                    {(done as { error?: string }).error}: {(done as { message?: string }).message ?? "Apply failed"}
                </p>
            : null}
            {done?.ok ?
                <p className="text-[11px]" style={{ color: brand.secondary }} data-command-surface-workflow-assist-apply-success>
                    Applied · workflow id {(done as { workflow_id?: string }).workflow_id}
                </p>
            : null}
        </div>
    );
}
