"use client";

/**
 * The Decision work item — ONE card.
 *
 * Replaces two sibling drawer cards (`ParticipantDecisionsPanel`, `FamilyClosePanel`) that sat
 * outside the work they belonged to. Three cards each said part of the same thing, in three
 * different voices, and the operator had to assemble the step themselves. Everything the Decision
 * step asks of an operator now lives under one heading:
 *
 *   the work           "Review each child's path"
 *   progress           "1 of 3 children decided"
 *   each child         one current path, and the choices available to them
 *   completion cue     "All children have a path. You can now complete this step."
 *   closing the lead   secondary, destructive, beneath the work — but INSIDE it
 *
 * Nothing about execution changed: the same two endpoints, the same explicit child identity, the
 * same guards. This is a presentation convergence.
 *
 * OPERATOR VOCABULARY. "decided", "path", "Close family". Never "resolved", "participant",
 * "process instance" or "disposition" — those are the platform's words for its own machinery and
 * they read as jargon to a director. Identity is carried in data attributes and request bodies,
 * never in copy.
 */

import { useCallback, useEffect, useState } from "react";
import {
    oppInqEyebrow,
    oppInqLeadSummaryShellClassName,
} from "@/components/admin/drawer/opportunityInquiryDrawerTypography";
import {
    executeParticipantDecision,
    fetchParticipantDecisionSurface,
    type ParticipantDecisionScope,
} from "@/lib/lifecycle/participantDecisionClient";
import {
    executeFamilyClose,
    fetchFamilyClosePreview,
} from "@/lib/lifecycle/familyCloseClient";
import type {
    ParticipantDecisionProgress,
    ParticipantDecisionRowVM,
} from "@/lib/lifecycle/projectParticipantDecisionRows";
import type {
    FamilyCloseAffectedChild,
    FamilyCloseBlock,
} from "@/lib/lifecycle/planGovernedFamilyClose";
import type { StageParticipantDecisionInputV1 } from "@/lib/lifecycle/stageOperatingPlanV1";

type Props = {
    scope: ParticipantDecisionScope;
    /** Optional override. Absent, the work names itself from its configured label. */
    workLabel?: string;
    workStatusLine?: string | null;
    canMutate: boolean;
    /** Called with the family and (when a child changed) that child, so callers refresh both. */
    onChanged: (affected: { opportunityId: string; customerMemberId?: string }) => void;
};

/** A decision awaiting either required inputs or an explicit change-of-path confirmation. */
type PendingDecision = {
    rowKey: string;
    decisionKey: string;
    decisionLabel: string;
    participantLabel: string;
    customerMemberId: string;
    processInstanceId: string;
    inputs: StageParticipantDecisionInputV1[];
    /** Set when the child already has a different active path — needs an explicit yes. */
    changingFrom?: string;
};

function InputControl({
    spec,
    value,
    disabled,
    invalid,
    onChange,
}: {
    spec: StageParticipantDecisionInputV1;
    value: string;
    disabled: boolean;
    invalid: boolean;
    onChange: (v: string) => void;
}) {
    const base =
        "w-full rounded-lg border bg-white px-2 py-1.5 text-[12px] text-alloy-midnight/90 "
        + (invalid ? "border-red-400" : "border-alloy-stone/20");
    if (spec.type === "select") {
        return (
            <select
                className={base}
                value={value}
                disabled={disabled}
                aria-label={spec.label}
                aria-invalid={invalid}
                data-decision-input={spec.key}
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
                className={base}
                rows={2}
                value={value}
                disabled={disabled}
                aria-label={spec.label}
                aria-invalid={invalid}
                data-decision-input={spec.key}
                onChange={(e) => onChange(e.target.value)}
            />
        );
    }
    return (
        <input
            className={base}
            type={spec.type === "date" ? "date" : "text"}
            value={value}
            disabled={disabled}
            aria-label={spec.label}
            aria-invalid={invalid}
            data-decision-input={spec.key}
            onChange={(e) => onChange(e.target.value)}
        />
    );
}

export default function DecisionCurrentWorkCard({
    scope,
    workLabel,
    workStatusLine,
    canMutate,
    onChanged,
}: Props) {
    const { opportunityId, departmentId, stageKey, templateKey } = scope;

    const [workLabelFromConfig, setWorkLabelFromConfig] = useState("");
    const [configured, setConfigured] = useState(false);
    const [rows, setRows] = useState<ParticipantDecisionRowVM[]>([]);
    const [progress, setProgress] = useState<ParticipantDecisionProgress | null>(null);
    const [loading, setLoading] = useState(true);

    const [pending, setPending] = useState<PendingDecision | null>(null);
    const [inputValues, setInputValues] = useState<Record<string, string>>({});
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [rowError, setRowError] = useState<{ rowKey: string; message: string } | null>(null);
    const [busyKey, setBusyKey] = useState<string | null>(null);

    // ── close family ────────────────────────────────────────────────────────
    const [closeConfigured, setCloseConfigured] = useState(false);
    const [closeLabel, setCloseLabel] = useState("Close family");
    const [closeOutcomeLabel, setCloseOutcomeLabel] = useState("closed");
    const [closeInputs, setCloseInputs] = useState<StageParticipantDecisionInputV1[]>([]);
    const [closeClosing, setCloseClosing] = useState<FamilyCloseAffectedChild[]>([]);
    const [closeSkipped, setCloseSkipped] = useState<FamilyCloseAffectedChild[]>([]);
    const [closeBlocks, setCloseBlocks] = useState<FamilyCloseBlock[]>([]);
    const [closeAllowed, setCloseAllowed] = useState(false);
    const [closeOpen, setCloseOpen] = useState(false);
    const [closeValues, setCloseValues] = useState<Record<string, string>>({});
    const [closeFieldErrors, setCloseFieldErrors] = useState<Record<string, string>>({});
    const [closeError, setCloseError] = useState<string | null>(null);
    const [closeBusy, setCloseBusy] = useState(false);
    const [closedSummary, setClosedSummary] = useState<FamilyCloseAffectedChild[] | null>(null);

    const loadDecisions = useCallback(async () => {
        const res = await fetchParticipantDecisionSurface({
            opportunityId,
            departmentId,
            stageKey,
            templateKey,
        });
        setConfigured(res.configured);
        setWorkLabelFromConfig(res.work_label ?? "");
        setRows(res.rows ?? []);
        setProgress(res.progress ?? null);
    }, [opportunityId, departmentId, stageKey, templateKey]);

    const loadClose = useCallback(async () => {
        const res = await fetchFamilyClosePreview({ opportunityId, departmentId, stageKey, templateKey });
        setCloseConfigured(res.configured);
        if (!res.configured) return;
        setCloseLabel(res.label?.trim() || "Close family");
        setCloseOutcomeLabel(res.child_outcome_label ?? "closed");
        setCloseInputs(res.required_inputs ?? []);
        setCloseClosing(res.closing ?? []);
        setCloseSkipped(res.skipped ?? []);
        setCloseBlocks(res.blocks ?? []);
        setCloseAllowed(res.allowed === true);
    }, [opportunityId, departmentId, stageKey, templateKey]);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        void Promise.allSettled([loadDecisions(), loadClose()]).finally(() => {
            if (!cancelled) setLoading(false);
        });
        return () => {
            cancelled = true;
        };
    }, [loadDecisions, loadClose]);

    const clearPending = useCallback(() => {
        setPending(null);
        setInputValues({});
        setFieldErrors({});
        setRowError(null);
    }, []);

    const runDecision = useCallback(
        async (p: {
            rowKey: string;
            decisionKey: string;
            customerMemberId: string;
            processInstanceId: string;
            participantLabel: string;
            values?: Record<string, string>;
        }) => {
            setBusyKey(`${p.rowKey}:${p.decisionKey}`);
            setRowError(null);
            setFieldErrors({});
            try {
                const result = await executeParticipantDecision(
                    { opportunityId, departmentId, stageKey, templateKey },
                    {
                        decisionKey: p.decisionKey,
                        customerMemberId: p.customerMemberId,
                        processInstanceId: p.processInstanceId,
                        participantLabel: p.participantLabel,
                        inputValues: p.values ?? {},
                    },
                );
                if (!result.ok) {
                    // Input problems belong to their field; everything else to the child's row.
                    if (result.input_issues?.length) {
                        setFieldErrors(
                            Object.fromEntries(result.input_issues.map((i) => [i.input_key, i.message])),
                        );
                    } else {
                        setRowError({ rowKey: p.rowKey, message: result.error });
                    }
                    return;
                }
                if (result.rows) setRows(result.rows);
                if (result.progress) setProgress(result.progress);
                clearPending();
                // Closing the lead depends on what the children are now.
                void loadClose();
                onChanged({
                    opportunityId: result.affected.opportunity_id,
                    customerMemberId: result.affected.customer_member_id,
                });
            } catch (e: unknown) {
                setRowError({
                    rowKey: p.rowKey,
                    message: e instanceof Error ? e.message : "Could not record this choice",
                });
            } finally {
                setBusyKey(null);
            }
        },
        [clearPending, departmentId, loadClose, onChanged, opportunityId, stageKey, templateKey],
    );

    const confirmClose = useCallback(async () => {
        setCloseBusy(true);
        setCloseError(null);
        setCloseFieldErrors({});
        try {
            const result = await executeFamilyClose(
                { opportunityId, departmentId, stageKey, templateKey },
                closeValues,
            );
            if (!result.ok) {
                if (result.input_issues?.length) {
                    setCloseFieldErrors(
                        Object.fromEntries(result.input_issues.map((i) => [i.input_key, i.message])),
                    );
                } else {
                    setCloseError(result.error);
                }
                if (result.blocks?.length) {
                    setCloseBlocks(result.blocks);
                    setCloseAllowed(false);
                }
                return;
            }
            setClosedSummary(result.closed_children);
            setCloseOpen(false);
            onChanged({ opportunityId });
        } catch (e: unknown) {
            setCloseError(e instanceof Error ? e.message : "Could not close this lead");
        } finally {
            setCloseBusy(false);
        }
    }, [closeValues, departmentId, onChanged, opportunityId, stageKey, templateKey]);

    if (loading || (!configured && !closeConfigured)) return null;

    const allDecided = progress?.all_resolved === true;

    return (
        <div className={oppInqLeadSummaryShellClassName} data-decision-current-work="true">
            {/* ── the work ───────────────────────────────────────────────── */}
            <div className="flex flex-wrap items-end justify-between gap-1.5 border-b border-alloy-stone/12 pb-1">
                <div className="min-w-0">
                    <span className={oppInqEyebrow}>Current work</span>
                    <h3 className="text-[14px] font-semibold text-alloy-midnight">
                        {workLabel?.trim() || workLabelFromConfig || "Current work"}
                    </h3>
                </div>
                {progress?.summary ?
                    <span
                        className="text-[11px] font-medium text-alloy-midnight/55"
                        data-decision-progress="true"
                    >
                        {progress.summary}
                    </span>
                :   null}
            </div>

            {workStatusLine ?
                <p className="mt-1 px-0.5 text-[11px] text-alloy-midnight/45">{workStatusLine}</p>
            :   null}

            {/* ── each child ─────────────────────────────────────────────── */}
            {configured && rows.length ?
                <div className="mt-2 space-y-1.5">
                    {rows.map((row) => {
                        const rowKey = row.process_instance_id;
                        const isPending = pending?.rowKey === rowKey;
                        const rowBusy = busyKey?.startsWith(`${rowKey}:`) === true;
                        return (
                            <div
                                key={rowKey}
                                className="rounded-md border border-alloy-stone/12 bg-white/70 px-2.5 py-2"
                                data-decision-child-row={rowKey}
                            >
                                <div className="flex flex-wrap items-baseline justify-between gap-2">
                                    <span className="text-[12px] font-semibold text-alloy-midnight/90">
                                        {row.label}
                                    </span>
                                    {/* ONE statement of the current path — never repeated below. */}
                                    <span
                                        className={
                                            row.resolved ?
                                                "text-[11px] font-medium text-alloy-pine"
                                            :   "text-[11px] text-alloy-midnight/45"
                                        }
                                        data-decision-child-state="true"
                                    >
                                        {row.state_label}
                                    </span>
                                </div>

                                {canMutate ?
                                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                                        {row.decisions.map((decision) => {
                                            const chosen = row.resolved_decision_label === decision.label;
                                            const key = `${rowKey}:${decision.decision_key}`;
                                            const busy = busyKey === key;
                                            return (
                                                <button
                                                    key={decision.decision_key}
                                                    type="button"
                                                    aria-pressed={chosen}
                                                    className={
                                                        chosen ?
                                                            // SELECTED — filled, unmistakable.
                                                            "rounded-lg border border-alloy-pine bg-alloy-pine px-2.5 py-1 text-[12px] font-semibold text-white"
                                                        :   // De-emphasised alternatives.
                                                            "rounded-lg border border-alloy-stone/20 bg-white px-2.5 py-1 text-[12px] font-medium text-alloy-midnight/60 hover:border-alloy-pine/35 hover:text-alloy-midnight disabled:opacity-40"
                                                    }
                                                    disabled={!decision.enabled || chosen || rowBusy || busyKey != null}
                                                    title={decision.disabled_reason}
                                                    data-decision-action={decision.decision_key}
                                                    data-decision-selected={chosen ? "true" : "false"}
                                                    onClick={() => {
                                                        setRowError(null);
                                                        setFieldErrors({});
                                                        setInputValues({});
                                                        const needsInputs = (decision.required_inputs ?? []).length > 0;
                                                        // An explicit yes before moving a child OFF an
                                                        // active path they are already on.
                                                        const changingFrom =
                                                            row.resolved && row.resolved_decision_label ?
                                                                row.resolved_decision_label
                                                            :   undefined;
                                                        if (needsInputs || changingFrom) {
                                                            setPending({
                                                                rowKey,
                                                                decisionKey: decision.decision_key,
                                                                decisionLabel: decision.label,
                                                                participantLabel: row.label,
                                                                customerMemberId: row.customer_member_id,
                                                                processInstanceId: row.process_instance_id,
                                                                inputs: decision.required_inputs ?? [],
                                                                ...(changingFrom ? { changingFrom } : {}),
                                                            });
                                                            return;
                                                        }
                                                        void runDecision({
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

                                {/* Everything this child's choice needs stays in this child's row. */}
                                {isPending && pending ?
                                    <div
                                        className="mt-2 space-y-2 border-t border-alloy-stone/12 pt-2"
                                        data-decision-row-pending={pending.decisionKey}
                                    >
                                        {pending.changingFrom ?
                                            <p className="text-[11px] text-alloy-midnight/70">
                                                {pending.participantLabel} is currently on{" "}
                                                <strong>{pending.changingFrom}</strong>. Change to{" "}
                                                <strong>{pending.decisionLabel}</strong>?
                                            </p>
                                        :   null}

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
                                                    invalid={Boolean(fieldErrors[spec.key])}
                                                    onChange={(v) => {
                                                        setInputValues((prev) => ({ ...prev, [spec.key]: v }));
                                                        // Cleared on a valid correction, not on next submit.
                                                        if (v) {
                                                            setFieldErrors((f) => {
                                                                const next = { ...f };
                                                                delete next[spec.key];
                                                                return next;
                                                            });
                                                        }
                                                    }}
                                                />
                                                {fieldErrors[spec.key] ?
                                                    <span
                                                        className="block text-[11px] font-medium text-red-700"
                                                        role="alert"
                                                        data-decision-field-error={spec.key}
                                                    >
                                                        {fieldErrors[spec.key]}
                                                    </span>
                                                :   null}
                                            </label>
                                        ))}

                                        <div className="flex flex-wrap gap-2">
                                            <button
                                                type="button"
                                                className="rounded-lg bg-alloy-midnight px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-60"
                                                disabled={busyKey != null}
                                                data-decision-confirm="true"
                                                onClick={() =>
                                                    void runDecision({
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
                                                onClick={clearPending}
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                :   null}

                                {rowError?.rowKey === rowKey ?
                                    <p
                                        className="mt-1.5 text-[11px] font-medium text-red-700"
                                        role="alert"
                                        data-decision-row-error="true"
                                    >
                                        {rowError.message}
                                    </p>
                                :   null}
                            </div>
                        );
                    })}
                </div>
            :   null}

            {/* ── completion cue ─────────────────────────────────────────── */}
            {allDecided && progress ?
                <p
                    className="mt-2 rounded-md border border-alloy-pine/25 bg-alloy-pine/[0.06] px-2.5 py-2 text-[12px] text-alloy-pine"
                    data-decision-completion-hint="true"
                >
                    {progress.summary}. {progress.completion_hint}
                </p>
            :   null}

            {/* ── closing the lead — secondary, destructive, still inside ── */}
            {closeConfigured ?
                <div className="mt-2 border-t border-alloy-stone/12 pt-2" data-decision-close-section="true">
                    {closedSummary ?
                        <p className="text-[12px] text-alloy-midnight/70" data-decision-closed="true">
                            {closedSummary.length === 0 ?
                                "This lead is closed."
                            :   `This lead is closed. ${closedSummary
                                    .map((c) => c.label)
                                    .join(", ")} ${closedSummary.length === 1 ? "was" : "were"} marked ${closeOutcomeLabel}.`}
                        </p>
                    : closeOpen ?
                        <div className="space-y-2" data-decision-close-preview="true">
                            <p className="text-[12px] font-semibold text-alloy-midnight/90">{closeLabel}</p>

                            {closeClosing.length ?
                                <>
                                    <p className="text-[12px] text-alloy-midnight/70">
                                        {closeClosing.length === 1 ?
                                            `This child will be marked ${closeOutcomeLabel}.`
                                        :   `These children will be marked ${closeOutcomeLabel}.`}
                                    </p>
                                    <ul className="space-y-0.5">
                                        {closeClosing.map((c) => (
                                            <li
                                                key={c.process_instance_id}
                                                className="text-[12px] font-semibold text-alloy-midnight/90"
                                                data-decision-close-affected={c.process_instance_id}
                                            >
                                                {c.label}
                                            </li>
                                        ))}
                                    </ul>
                                </>
                            :   <p className="text-[12px] text-alloy-midnight/70">
                                    No children are still open on this lead, so only the lead itself will be
                                    closed.
                                </p>
                            }

                            {closeSkipped.length ?
                                <p className="text-[11px] text-alloy-midnight/50">
                                    Already closed, and left as {closeSkipped.length === 1 ? "it is" : "they are"}
                                    : {closeSkipped.map((c) => c.label).join(", ")}.
                                </p>
                            :   null}

                            {closeInputs.map((spec) => (
                                <label key={spec.key} className="block space-y-1">
                                    <span className="text-[11px] font-medium text-alloy-midnight/70">
                                        {spec.label}
                                        {spec.required ? " *" : ""}
                                    </span>
                                    <InputControl
                                        spec={spec}
                                        value={closeValues[spec.key] ?? ""}
                                        disabled={closeBusy}
                                        invalid={Boolean(closeFieldErrors[spec.key])}
                                        onChange={(v) => {
                                            setCloseValues((prev) => ({ ...prev, [spec.key]: v }));
                                            if (v) {
                                                setCloseFieldErrors((f) => {
                                                    const next = { ...f };
                                                    delete next[spec.key];
                                                    return next;
                                                });
                                            }
                                        }}
                                    />
                                    {closeFieldErrors[spec.key] ?
                                        <span
                                            className="block text-[11px] font-medium text-red-700"
                                            role="alert"
                                            data-decision-close-field-error={spec.key}
                                        >
                                            {closeFieldErrors[spec.key]}
                                        </span>
                                    :   null}
                                </label>
                            ))}

                            {closeError ?
                                <p className="text-[11px] font-medium text-red-700" role="alert">
                                    {closeError}
                                </p>
                            :   null}

                            <div className="flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    className="rounded-lg border border-alloy-stone/20 px-3 py-1.5 text-[12px] text-alloy-midnight/70"
                                    disabled={closeBusy}
                                    onClick={() => {
                                        setCloseOpen(false);
                                        setCloseError(null);
                                        setCloseFieldErrors({});
                                    }}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    className="rounded-lg bg-red-700 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-red-800 disabled:opacity-60"
                                    disabled={closeBusy}
                                    data-decision-close-confirm="true"
                                    onClick={() => void confirmClose()}
                                >
                                    {closeBusy ? "Closing…" : closeLabel}
                                </button>
                            </div>
                        </div>
                    : closeBlocks.length ?
                        // PERMANENTLY BLOCKED — the reason, and NO confirm control at all. A
                        // disabled primary would invite hunting for the state that enables it.
                        <div className="space-y-1.5" data-decision-close-blocked="true">
                            {closeBlocks.map((block) => (
                                <p
                                    key={block.code}
                                    className="rounded-md border border-red-200 bg-red-50/70 px-2.5 py-2 text-[12px] leading-relaxed text-red-900"
                                    role="alert"
                                >
                                    {block.message}
                                </p>
                            ))}
                        </div>
                    :   <button
                            type="button"
                            className="text-[12px] font-semibold text-red-800 underline decoration-red-300 underline-offset-4 hover:text-red-900 disabled:opacity-50"
                            disabled={!canMutate || !closeAllowed}
                            data-decision-close-open="true"
                            onClick={() => {
                                setCloseError(null);
                                setCloseFieldErrors({});
                                setCloseValues({});
                                void loadClose();
                                setCloseOpen(true);
                            }}
                        >
                            {closeLabel}
                        </button>
                    }
                </div>
            :   null}
        </div>
    );
}
