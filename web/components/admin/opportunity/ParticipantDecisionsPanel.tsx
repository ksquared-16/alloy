"use client";

/**
 * Per-child decisions inside the family's Decision work.
 *
 * Presentation is inherited from `OpportunityDecisionSplitPanel`, which this replaces — the shell,
 * the row layout and the typography are the same so the surface does not visibly churn. Everything
 * behind it is different:
 *
 *   was                                     now
 *   ───────────────────────────────────     ──────────────────────────────────────────────
 *   rendered when stage_key === "decision"  rendered when the work template configures decisions
 *   options from `tracks.split_rules`       options from `participant_decisions`
 *   one batch "Apply child paths"           one decision, one child, executed on click
 *   wrote OCM lifecycle status              writes `process_instances` through the target executor
 *
 * The batch-apply control is deliberately gone. It submitted a selection for every child at once,
 * including the ones the operator never touched, which is precisely the fan-out shape this
 * capability must not have. Each button now names one child and one decision.
 *
 * Nothing here renders an id, a stage key, or a raw status key.
 */

import { useCallback, useEffect, useState } from "react";
import {
    oppInqEyebrow,
    oppInqInnerCardCompact,
    oppInqLeadSummaryShellClassName,
} from "@/components/admin/drawer/opportunityInquiryDrawerTypography";
import {
    executeParticipantDecision,
    fetchParticipantDecisionSurface,
    type ParticipantDecisionScope,
} from "@/lib/lifecycle/participantDecisionClient";
import type {
    ParticipantDecisionProgress,
    ParticipantDecisionRowVM,
} from "@/lib/lifecycle/projectParticipantDecisionRows";
import type { StageParticipantDecisionInputV1 } from "@/lib/lifecycle/stageOperatingPlanV1";

type Props = {
    scope: ParticipantDecisionScope;
    canMutate: boolean;
    /** Called with the family and the child that changed, so callers refresh both. */
    onApplied: (affected: { opportunityId: string; customerMemberId: string }) => void;
};

type PendingInputs = {
    rowKey: string;
    decisionKey: string;
    decisionLabel: string;
    participantLabel: string;
    customerMemberId: string;
    processInstanceId: string;
    inputs: StageParticipantDecisionInputV1[];
};

function InputControl({
    spec,
    value,
    disabled,
    onChange,
}: {
    spec: StageParticipantDecisionInputV1;
    value: string;
    disabled: boolean;
    onChange: (v: string) => void;
}) {
    const common =
        "w-full rounded-lg border border-alloy-stone/20 bg-white px-2 py-1.5 text-[12px] text-alloy-midnight/90";
    if (spec.type === "select") {
        return (
            <select
                className={common}
                value={value}
                disabled={disabled}
                aria-label={spec.label}
                onChange={(e) => onChange(e.target.value)}
            >
                <option value="">Select…</option>
                {(spec.options ?? []).map((o) => (
                    <option key={o.value} value={o.value}>
                        {o.label}
                    </option>
                ))}
            </select>
        );
    }
    if (spec.type === "textarea") {
        return (
            <textarea
                className={common}
                rows={2}
                value={value}
                disabled={disabled}
                aria-label={spec.label}
                onChange={(e) => onChange(e.target.value)}
            />
        );
    }
    return (
        <input
            className={common}
            type={spec.type === "date" ? "date" : "text"}
            value={value}
            disabled={disabled}
            aria-label={spec.label}
            onChange={(e) => onChange(e.target.value)}
        />
    );
}

export default function ParticipantDecisionsPanel({ scope, canMutate, onApplied }: Props) {
    const [rows, setRows] = useState<ParticipantDecisionRowVM[]>([]);
    const [progress, setProgress] = useState<ParticipantDecisionProgress | null>(null);
    const [configured, setConfigured] = useState(false);
    const [loading, setLoading] = useState(true);
    const [busyKey, setBusyKey] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [pending, setPending] = useState<PendingInputs | null>(null);
    const [inputValues, setInputValues] = useState<Record<string, string>>({});

    const { opportunityId, departmentId, stageKey, templateKey } = scope;

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        void fetchParticipantDecisionSurface({ opportunityId, departmentId, stageKey, templateKey })
            .then((res) => {
                if (cancelled) return;
                setConfigured(res.configured);
                setRows(res.rows ?? []);
                setProgress(res.progress ?? null);
            })
            .catch((e: unknown) => {
                if (cancelled) return;
                setError(e instanceof Error ? e.message : "Could not load child paths");
                setConfigured(false);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [opportunityId, departmentId, stageKey, templateKey]);

    const run = useCallback(
        async (params: {
            rowKey: string;
            decisionKey: string;
            customerMemberId: string;
            processInstanceId: string;
            participantLabel: string;
            values?: Record<string, string>;
        }) => {
            setBusyKey(`${params.rowKey}:${params.decisionKey}`);
            setError(null);
            try {
                const result = await executeParticipantDecision(
                    { opportunityId, departmentId, stageKey, templateKey },
                    {
                        decisionKey: params.decisionKey,
                        customerMemberId: params.customerMemberId,
                        processInstanceId: params.processInstanceId,
                        participantLabel: params.participantLabel,
                        inputValues: params.values ?? {},
                    },
                );
                if (!result.ok) {
                    setError(result.error);
                    return;
                }
                // The response carries the recomputed surface, so the rows the operator is looking
                // at come from the same read that just confirmed the write.
                if (result.rows) setRows(result.rows);
                if (result.progress) setProgress(result.progress);
                setPending(null);
                setInputValues({});
                onApplied({
                    opportunityId: result.affected.opportunity_id,
                    customerMemberId: result.affected.customer_member_id,
                });
            } catch (e: unknown) {
                setError(e instanceof Error ? e.message : "Could not record this decision");
            } finally {
                setBusyKey(null);
            }
        },
        [departmentId, onApplied, opportunityId, stageKey, templateKey],
    );

    if (loading || !configured || !rows.length) return null;

    return (
        <div className={oppInqLeadSummaryShellClassName} data-participant-decisions-panel="true">
            <div className="flex flex-wrap items-end justify-between gap-1.5 border-b border-alloy-stone/12 pb-1">
                <span className={oppInqEyebrow}>Choose each child&apos;s path</span>
                {progress?.summary ?
                    <span
                        className="text-[11px] font-medium text-alloy-midnight/55"
                        data-participant-decisions-progress="true"
                    >
                        {progress.summary}
                    </span>
                :   null}
            </div>

            <div className={`${oppInqInnerCardCompact} mt-1 space-y-2`}>
                <p className="text-[11px] leading-snug text-alloy-midnight/55">
                    Siblings can take different paths. Each choice applies to that child only.
                </p>

                {error ?
                    <p className="text-[11px] font-medium text-red-700/90" role="alert">
                        {error}
                    </p>
                :   null}

                <div className="space-y-2">
                    {rows.map((row) => {
                        const rowKey = row.process_instance_id;
                        const isPending = pending?.rowKey === rowKey;
                        return (
                            <div
                                key={rowKey}
                                className="rounded-md border border-alloy-stone/12 bg-white/70 px-2.5 py-2"
                                data-participant-decision-row={rowKey}
                            >
                                <div className="flex flex-wrap items-baseline justify-between gap-2">
                                    <span className="truncate text-[12px] font-semibold text-alloy-midnight/90">
                                        {row.label}
                                    </span>
                                    <span
                                        className="text-[10px] text-alloy-midnight/45"
                                        data-participant-decision-state="true"
                                    >
                                        {row.state_label}
                                    </span>
                                </div>

                                {row.resolved ?
                                    <p className="mt-1 text-[11px] text-alloy-midnight/55">
                                        Path chosen{row.resolved_decision_label ? ` · ${row.resolved_decision_label}` : ""}
                                    </p>
                                :   null}

                                {canMutate ?
                                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                                        {row.decisions.map((decision) => {
                                            const key = `${rowKey}:${decision.decision_key}`;
                                            const busy = busyKey === key;
                                            const needsInputs = (decision.required_inputs ?? []).length > 0;
                                            return (
                                                <button
                                                    key={decision.decision_key}
                                                    type="button"
                                                    className="rounded-lg border border-alloy-pine/25 bg-alloy-pine/[0.06] px-2.5 py-1 text-[12px] font-semibold text-alloy-pine hover:border-alloy-pine/35 hover:bg-alloy-pine/[0.1] disabled:opacity-50"
                                                    disabled={!decision.enabled || busy || busyKey != null}
                                                    title={decision.disabled_reason}
                                                    data-participant-decision-action={decision.decision_key}
                                                    onClick={() => {
                                                        setError(null);
                                                        if (needsInputs) {
                                                            setInputValues({});
                                                            setPending({
                                                                rowKey,
                                                                decisionKey: decision.decision_key,
                                                                decisionLabel: decision.label,
                                                                participantLabel: row.label,
                                                                customerMemberId: row.customer_member_id,
                                                                processInstanceId: row.process_instance_id,
                                                                inputs: decision.required_inputs ?? [],
                                                            });
                                                            return;
                                                        }
                                                        void run({
                                                            rowKey,
                                                            decisionKey: decision.decision_key,
                                                            customerMemberId: row.customer_member_id,
                                                            processInstanceId: row.process_instance_id,
                                                            participantLabel: row.label,
                                                        });
                                                    }}
                                                >
                                                    {busy ? "Saving…" : decision.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                :   <p className="mt-1 text-[11px] text-alloy-midnight/50">Read only</p>}

                                {isPending && pending ?
                                    <div
                                        className="mt-2 space-y-2 border-t border-alloy-stone/12 pt-2"
                                        data-participant-decision-inputs={pending.decisionKey}
                                    >
                                        {pending.inputs.map((spec) => (
                                            <label key={spec.key} className="block space-y-1">
                                                <span className="text-[11px] font-medium text-alloy-midnight/70">
                                                    {spec.label}
                                                    {spec.required ? " *" : ""}
                                                </span>
                                                <InputControl
                                                    spec={spec}
                                                    value={inputValues[spec.key] ?? ""}
                                                    disabled={busyKey != null}
                                                    onChange={(v) =>
                                                        setInputValues((prev) => ({ ...prev, [spec.key]: v }))
                                                    }
                                                />
                                                {spec.hint ?
                                                    <span className="text-[10px] text-alloy-midnight/45">{spec.hint}</span>
                                                :   null}
                                            </label>
                                        ))}
                                        <div className="flex flex-wrap gap-2">
                                            <button
                                                type="button"
                                                className="rounded-lg bg-alloy-midnight px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-60"
                                                disabled={busyKey != null}
                                                data-participant-decision-confirm="true"
                                                onClick={() =>
                                                    void run({
                                                        rowKey: pending.rowKey,
                                                        decisionKey: pending.decisionKey,
                                                        customerMemberId: pending.customerMemberId,
                                                        processInstanceId: pending.processInstanceId,
                                                        participantLabel: pending.participantLabel,
                                                        values: inputValues,
                                                    })
                                                }
                                            >
                                                {busyKey != null ? "Saving…" : `Confirm ${pending.decisionLabel}`}
                                            </button>
                                            <button
                                                type="button"
                                                className="rounded-lg border border-alloy-stone/20 px-3 py-1.5 text-[12px] text-alloy-midnight/70"
                                                disabled={busyKey != null}
                                                onClick={() => {
                                                    setPending(null);
                                                    setInputValues({});
                                                }}
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                :   null}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
