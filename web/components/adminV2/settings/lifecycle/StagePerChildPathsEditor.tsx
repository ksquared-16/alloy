"use client";

/**
 * Per-child paths out of a family-grain stage.
 *
 * A family decision does not move the family — it moves each child, and it can move them
 * differently: one child to Enrolling, a sibling to Waitlist, on the same decision. The platform has
 * always modelled that (`participant_decisions` is parsed, validated, projected and executed) and has
 * never let anyone author it, which is why six legitimate family→child paths in the certification
 * tenant were configured as stage transitions the grain rule correctly refuses.
 *
 * "Per-child paths" rather than "participant decisions": the raw term is runtime vocabulary and does
 * not appear in operator-facing copy anywhere else.
 *
 * This control owns nothing. It composes one canonical action on the existing lifecycle-builder
 * route, and the route delegates to the same parser the runtime reads with.
 */

import { useCallback, useMemo, useState } from "react";
import { GitBranch, Loader2, X } from "lucide-react";
import type { LifecycleBuilderProcessRecord, LifecycleBuilderStageRecord } from "@/lib/lifecycle/lifecycleBuilderConfig";
import type { StageWorkParticipantDecisionV1 } from "@/lib/lifecycle/stageOperatingPlanV1";

type ChildStageOption = { key: string; label: string };
export type ChildStatusOption = { status_key: string; status_label: string };

/**
 * The canonical targets for one child's path.
 *
 * A decision must carry EXACTLY ONE `update_child_enrollment_status` — the parser refuses otherwise,
 * and the reason is in its own comment: a participant decision IS the child's path, so it names the
 * state that path lands in, once. Zero would leave the regression guard nothing to compare against
 * and no way to tell "already resolved" from "never decided"; two would make the decision ambiguous.
 * So the operator picks the destination AND the resulting status — the second is not inferable.
 */
function childPathTargets(stageKey: string, statusKey: string) {
    return [
        { kind: "update_child_enrollment_status" as const, status_key: statusKey },
        { kind: "move_to_stage" as const, stage_key: stageKey, transition_ref: `move_to_stage:${stageKey}` },
    ];
}

const decisionKeyFor = (stageKey: string) => `move_child_to_${stageKey}`;

export default function StagePerChildPathsEditor({
    departmentId,
    stageKey,
    stageLabel,
    templateKey,
    templateLabel,
    decisions,
    process,
    childStages,
    childStatuses,
    onSaved,
}: {
    departmentId: string;
    stageKey: string;
    stageLabel: string;
    templateKey: string;
    templateLabel: string;
    decisions: readonly StageWorkParticipantDecisionV1[];
    process?: LifecycleBuilderProcessRecord | null;
    /** Child-grain stages of this process — the only destinations a per-child path may target. */
    childStages: readonly ChildStageOption[];
    /** Configured child statuses. Never invented here — status vocabulary is owned by Status & State. */
    childStatuses: readonly ChildStatusOption[];
    onSaved?: () => void | Promise<void>;
}) {
    const [rows, setRows] = useState<StageWorkParticipantDecisionV1[]>(() => [...decisions]);
    const [pendingStage, setPendingStage] = useState("");
    const [pendingStatus, setPendingStatus] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    const taken = useMemo(
        () => new Set(rows.flatMap((r) => r.targets.map((t) => t.stage_key).filter(Boolean) as string[])),
        [rows],
    );
    const addable = useMemo(() => childStages.filter((s) => !taken.has(s.key)), [childStages, taken]);
    const labelFor = useCallback(
        (key: string | null | undefined) => childStages.find((s) => s.key === key)?.label ?? key ?? "—",
        [childStages],
    );

    const save = useCallback(async () => {
        setBusy(true);
        setError(null);
        setNotice(null);
        try {
            const res = await fetch(`/api/admin/departments/${encodeURIComponent(departmentId)}/lifecycle-builder`, {
                method: "PATCH",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "set_work_template_participant_decisions",
                    process_id: process?.id,
                    stage_key: stageKey,
                    template_key: templateKey,
                    decisions: rows,
                }),
            });
            const json = (await res.json().catch(() => ({}))) as { error?: string };
            if (!res.ok) throw new Error(json.error ?? "The change was refused.");
            setNotice(
                rows.length
                    ? `Saved ${rows.length} per-child path${rows.length === 1 ? "" : "s"}. Publish to make it live.`
                    : "Saved — no per-child paths on this work. Publish to make it live.",
            );
            await onSaved?.();
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(false);
        }
    }, [departmentId, process?.id, stageKey, templateKey, rows, onSaved]);

    if (!process?.id) return null;

    return (
        <div className="mt-3 border-t border-alloy-forge/10 pt-3" data-testid="stage-per-child-paths">
            <div className="mb-1 flex items-center gap-1.5">
                <GitBranch size={13} className="text-alloy-midnight/45" />
                <h5 className="text-[0.8125rem] font-semibold text-alloy-midnight">Per-child paths</h5>
            </div>
            <p className="stage-field__hint mb-2.5">
                {stageLabel} holds the family. These paths move <span className="font-medium">one child at a time</span> onto
                their own track — so one child can go to Enrolling while a sibling goes to Waitlist, and the family stays
                where it is.
            </p>

            {rows.length === 0 ? (
                <p className="mb-2 rounded-lg bg-alloy-forge/[0.04] px-3 py-2 text-[0.75rem] text-alloy-midnight/55">
                    No per-child paths on “{templateLabel}”. Children stay with the family until one is added.
                </p>
            ) : (
                <ul className="mb-2 space-y-1.5">
                    {rows.map((row) => (
                        <li
                            key={row.decision_key}
                            className="flex items-center gap-2 rounded-lg border border-alloy-forge/15 bg-white px-3 py-1.5"
                        >
                            <span className="flex-1 text-[0.8125rem] text-alloy-midnight">
                                {row.label ?? `Move child to ${labelFor(row.targets.find((t) => t.stage_key)?.stage_key)}`}
                                <span className="ml-1 text-alloy-midnight/45">
                                    → {labelFor(row.targets.find((t) => t.stage_key)?.stage_key)}
                                </span>
                            </span>
                            <button
                                type="button"
                                aria-label={`Remove ${row.decision_key}`}
                                className="rounded p-1 text-alloy-midnight/40 hover:bg-alloy-ember/10 hover:text-alloy-ember"
                                onClick={() => setRows((prev) => prev.filter((r) => r.decision_key !== row.decision_key))}
                            >
                                <X size={12} />
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            {childStatuses.length === 0 ? (
                // Say why rather than render a control that cannot produce a valid path.
                <p className="rounded-lg bg-alloy-forge/[0.04] px-3 py-2 text-[0.75rem] text-alloy-midnight/55">
                    No child statuses are configured yet, so a per-child path has no state to land in.
                    Configure child statuses in Status &amp; State first.
                </p>
            ) : (
                <div className="flex flex-wrap items-end gap-2">
                    <label className="text-[0.6875rem] text-alloy-midnight/55">
                        Move child to
                        <select
                            data-testid="stage-per-child-paths-stage"
                            className="ml-1 rounded-lg border border-alloy-forge/20 bg-white px-2 py-1 text-[0.75rem]"
                            value={pendingStage}
                            disabled={busy || addable.length === 0}
                            onChange={(e) => setPendingStage(e.target.value)}
                        >
                            <option value="">{addable.length ? "Choose a stage…" : "Every child stage has a path"}</option>
                            {addable.map((st) => <option key={st.key} value={st.key}>{st.label}</option>)}
                        </select>
                    </label>
                    <label className="text-[0.6875rem] text-alloy-midnight/55">
                        and set the child to
                        <select
                            data-testid="stage-per-child-paths-status"
                            className="ml-1 rounded-lg border border-alloy-forge/20 bg-white px-2 py-1 text-[0.75rem]"
                            value={pendingStatus}
                            disabled={busy}
                            onChange={(e) => setPendingStatus(e.target.value)}
                        >
                            <option value="">Choose a status…</option>
                            {childStatuses.map((st) => <option key={st.status_key} value={st.status_key}>{st.status_label}</option>)}
                        </select>
                    </label>
                    <button
                        type="button"
                        data-testid="stage-per-child-paths-add"
                        className="config-secondary-btn config-secondary-btn--sm"
                        disabled={busy || !pendingStage || !pendingStatus}
                        onClick={() => {
                            const dest = childStages.find((st) => st.key === pendingStage);
                            if (!dest || !pendingStatus) return;
                            setRows((prev) => [
                                ...prev,
                                {
                                    decision_key: decisionKeyFor(dest.key),
                                    // The action the operator takes for that child. The route and the
                                    // validator enforce that it is process-selected; this control
                                    // does not restate the rule.
                                    action_ref: "update_enrollment_status",
                                    label: `Move child to ${dest.label}`,
                                    subject_grain: "child",
                                    targets: childPathTargets(dest.key, pendingStatus),
                                },
                            ]);
                            setPendingStage("");
                            setPendingStatus("");
                        }}
                    >
                        Add path
                    </button>
                    <button
                        type="button"
                        data-testid="stage-per-child-paths-save"
                        className="config-primary-btn config-primary-btn--sm gap-1.5"
                        disabled={busy}
                        onClick={() => void save()}
                    >
                        {busy ? <Loader2 size={12} className="animate-spin" /> : null}
                        Save per-child paths
                    </button>
                </div>
            )}

            {error ? <p className="mt-2 text-[0.75rem] text-alloy-ember" role="alert">{error}</p> : null}
            {notice ? <p className="mt-2 text-[0.75rem] text-alloy-bend-pine" role="status">{notice}</p> : null}
        </div>
    );
}
