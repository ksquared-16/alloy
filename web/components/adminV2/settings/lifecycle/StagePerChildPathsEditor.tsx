"use client";

/**
 * Per-child paths out of a family-grain stage.
 *
 * A family decision does not move the family — it moves each child, and it can move them
 * differently: one child to Enrolling, a sibling to Waitlist, on the same decision. The platform has
 * always modelled that (`participant_decisions` is parsed, validated, projected and executed); this is
 * where it is authored, completely:
 *   - the label the operator clicks ("Offer spot") and how the child's path READS once chosen
 *     ("Offer pending");
 *   - the destination stage and the child status it lands in (written as `disposition_key`, the field
 *     the per-child runtime reads);
 *   - what the path asks first (required inputs: a choice listed here, the location's programs, or the
 *     close reason it records; text; a date);
 *   - whether operators are offered it, and in what order.
 * Two paths may share a destination (Waitlist and Offer spot both keep the child on its waitlist track).
 *
 * "Per-child paths" rather than "participant decisions": the raw term is runtime vocabulary and does
 * not appear in operator-facing copy anywhere else.
 *
 * This control owns nothing. It composes one canonical action on the existing lifecycle-builder
 * route, and the route delegates to the same parser the runtime reads with.
 */

import { useCallback, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, GitBranch, Loader2, Plus, X } from "lucide-react";
import type { LifecycleBuilderProcessRecord } from "@/lib/lifecycle/lifecycleBuilderConfig";
import type { StageParticipantDecisionInputV1, StageWorkParticipantDecisionV1 } from "@/lib/lifecycle/stageOperatingPlanV1";

type ChildStageOption = { key: string; label: string };
export type ChildStatusOption = { status_key: string; status_label: string };
type Target = StageWorkParticipantDecisionV1["targets"][number];

const INPUT_TYPES: Array<{ value: StageParticipantDecisionInputV1["type"]; label: string }> = [
    { value: "select", label: "Choice" },
    { value: "text", label: "Text" },
    { value: "textarea", label: "Long text" },
    { value: "date", label: "Date" },
];

const moveTarget = (stageKey: string): Target => ({ kind: "move_to_stage", stage_key: stageKey, transition_ref: `move_to_stage:${stageKey}` });

/**
 * The canonical targets for one child's path.
 *
 * A decision must carry EXACTLY ONE `update_child_enrollment_status` — the parser refuses otherwise:
 * a participant decision IS the child's path, so it names the state that path lands in, once. So the
 * author picks the destination AND the resulting status — the second is not inferable. Written as
 * `disposition_key`, the field the per-child runtime reads.
 */
export function childPathTargets(stageKey: string, statusKey: string): Target[] {
    return [{ kind: "update_child_enrollment_status", disposition_key: statusKey }, ...(stageKey ? [moveTarget(stageKey)] : [])];
}

const slug = (label: string) =>
    label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 40) || "path";

/** A stable key for a new path, from its label. Existing keys are never rewritten (audit identity). */
export function uniqueDecisionKey(label: string, taken: ReadonlySet<string>): string {
    const base = `child_${slug(label)}`;
    if (!taken.has(base)) return base;
    for (let i = 2; ; i += 1) if (!taken.has(`${base}_${i}`)) return `${base}_${i}`;
}

export const destinationOf = (row: StageWorkParticipantDecisionV1) => row.targets.find((t) => t.kind === "move_to_stage")?.stage_key ?? "";
export const statusOf = (row: StageWorkParticipantDecisionV1) => {
    const t = row.targets.find((x) => x.kind === "update_child_enrollment_status");
    return (t?.disposition_key ?? t?.status_key ?? "").trim();
};

/** Replace destination and status; every other target (a bound close reason, …) is kept as authored. */
export function withRoute(row: StageWorkParticipantDecisionV1, stageKey: string, statusKey: string): StageWorkParticipantDecisionV1 {
    const others = row.targets.filter((t) => t.kind !== "update_child_enrollment_status" && t.kind !== "move_to_stage");
    const prior = row.targets.find((t) => t.kind === "update_child_enrollment_status");
    const { status_key: _legacy, ...priorRest } = (prior ?? { kind: "update_child_enrollment_status" }) as Target;
    const status: Target = { ...priorRest, kind: "update_child_enrollment_status", disposition_key: statusKey };
    return { ...row, targets: [status, ...(stageKey ? [moveTarget(stageKey)] : []), ...others] };
}

const optionsToText = (options: StageParticipantDecisionInputV1["options"]) => (options ?? []).map((o) => o.label).join("\n");
const textToOptions = (text: string, prior: StageParticipantDecisionInputV1["options"]) =>
    text
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((label) => prior?.find((o) => o.label === label) ?? { value: slug(label), label });

const field = "rounded-lg border border-alloy-forge/20 bg-white px-2 py-1 text-[0.75rem]";

function InputEditor({
    input,
    onChange,
    onRemove,
}: {
    input: StageParticipantDecisionInputV1;
    onChange: (next: StageParticipantDecisionInputV1) => void;
    onRemove: () => void;
}) {
    const source = input.options_source ? "programs" : input.binds_to_target_field === "close_reason_key" ? "close_reason" : "listed";
    return (
        <div className="space-y-1.5 rounded-lg border border-alloy-forge/10 bg-alloy-forge/[0.02] p-2" data-testid="stage-per-child-paths-input">
            <div className="flex flex-wrap items-center gap-1.5">
                <input
                    className={`${field} flex-1`}
                    value={input.label}
                    placeholder="What to ask, e.g. Program offered"
                    aria-label="Question"
                    onChange={(e) => onChange({ ...input, label: e.target.value })}
                />
                <select className={field} value={input.type} aria-label="Answer type" onChange={(e) => onChange({ ...input, type: e.target.value as StageParticipantDecisionInputV1["type"] })}>
                    {INPUT_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                            {t.label}
                        </option>
                    ))}
                </select>
                <label className="flex items-center gap-1 text-[0.6875rem] text-alloy-midnight/60">
                    <input type="checkbox" checked={input.required} onChange={(e) => onChange({ ...input, required: e.target.checked })} />
                    Required
                </label>
                <button type="button" aria-label="Remove question" className="rounded p-1 text-alloy-midnight/40 hover:text-alloy-ember" onClick={onRemove}>
                    <X size={11} />
                </button>
            </div>
            {input.type === "select" ? (
                <div className="space-y-1">
                    <select
                        className={field}
                        value={source}
                        aria-label="Choices come from"
                        onChange={(e) => {
                            const { options_source: _s, binds_to_target_field: _b, ...rest } = input;
                            if (e.target.value === "programs") onChange({ ...rest, options: undefined, options_source: "location_program_categories" });
                            else if (e.target.value === "close_reason") onChange({ ...rest, options: input.options ?? [], binds_to_target_field: "close_reason_key" });
                            else onChange({ ...rest, options: input.options ?? [] });
                        }}
                    >
                        <option value="listed">Choices listed here</option>
                        <option value="programs">The child&apos;s location&apos;s programs</option>
                        <option value="close_reason">Close reasons (recorded on the child)</option>
                    </select>
                    {source === "programs" ? (
                        <p className="text-[0.6875rem] text-alloy-midnight/50">Offered from each child&apos;s location; the program is recorded.</p>
                    ) : (
                        <textarea
                            className={`${field} block w-full`}
                            rows={3}
                            placeholder="One choice per line"
                            aria-label="Choices"
                            value={optionsToText(input.options)}
                            onChange={(e) => onChange({ ...input, options: textToOptions(e.target.value, input.options) })}
                        />
                    )}
                </div>
            ) : null}
        </div>
    );
}

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
    const [open, setOpen] = useState<string | null>(null);
    const [pendingLabel, setPendingLabel] = useState("");
    const [pendingStage, setPendingStage] = useState("");
    const [pendingStatus, setPendingStatus] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    const stageLabelFor = useCallback((key: string) => childStages.find((s) => s.key === key)?.label ?? (key || "stays where it is"), [childStages]);
    const update = (key: string, fn: (r: StageWorkParticipantDecisionV1) => StageWorkParticipantDecisionV1) =>
        setRows((prev) => prev.map((r) => (r.decision_key === key ? fn(r) : r)));
    const move = (index: number, by: number) =>
        setRows((prev) => {
            const to = index + by;
            if (to < 0 || to >= prev.length) return prev;
            const next = [...prev];
            [next[index], next[to]] = [next[to]!, next[index]!];
            return next;
        });
    const setInputs = (key: string, fn: (inputs: StageParticipantDecisionInputV1[]) => StageParticipantDecisionInputV1[]) =>
        update(key, (r) => {
            const next = fn([...(r.required_inputs ?? [])]);
            const { required_inputs: _drop, ...rest } = r;
            return next.length ? { ...rest, required_inputs: next } : rest;
        });

    const save = useCallback(async () => {
        setBusy(true);
        setError(null);
        setNotice(null);
        try {
            // Input keys are derived from their question when the author did not set one.
            const payload = rows.map((r) => ({
                ...r,
                ...(r.required_inputs
                    ? { required_inputs: r.required_inputs.map((inp, i) => ({ ...inp, key: inp.key?.trim() || slug(inp.label) || `input_${i + 1}` })) }
                    : {}),
            }));
            const res = await fetch(`/api/admin/departments/${encodeURIComponent(departmentId)}/lifecycle-builder`, {
                method: "PATCH",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "set_work_template_participant_decisions",
                    process_id: process?.id,
                    stage_key: stageKey,
                    template_key: templateKey,
                    decisions: payload,
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
                    {rows.map((row, index) => {
                        const expanded = open === row.decision_key;
                        const dest = destinationOf(row);
                        const status = statusOf(row);
                        return (
                            <li key={row.decision_key} className="rounded-lg border border-alloy-forge/15 bg-white" data-testid="stage-per-child-paths-row" data-path-key={row.decision_key}>
                                <div className="flex items-center gap-2 px-3 py-1.5">
                                    <button
                                        type="button"
                                        aria-label={expanded ? "Collapse path" : "Edit path"}
                                        aria-expanded={expanded}
                                        className="text-alloy-midnight/45"
                                        data-testid="stage-per-child-paths-edit"
                                        onClick={() => setOpen(expanded ? null : row.decision_key)}
                                    >
                                        {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                                    </button>
                                    <span className="flex-1 text-[0.8125rem] text-alloy-midnight">
                                        {row.label ?? `Move child to ${stageLabelFor(dest)}`}
                                        <span className="ml-1 text-alloy-midnight/45">→ {stageLabelFor(dest)}</span>
                                        {row.state_label ? <span className="ml-1 text-alloy-midnight/45">· reads “{row.state_label}”</span> : null}
                                        {row.required_inputs?.length ? <span className="ml-1 text-alloy-midnight/45">· asks {row.required_inputs.length}</span> : null}
                                        {row.available === false ? <span className="ml-1 text-alloy-ember">· hidden</span> : null}
                                    </span>
                                    <button type="button" aria-label="Move up" className="rounded p-1 text-alloy-midnight/40 disabled:opacity-30" disabled={index === 0} onClick={() => move(index, -1)}>
                                        <ArrowUp size={12} />
                                    </button>
                                    <button
                                        type="button"
                                        aria-label="Move down"
                                        className="rounded p-1 text-alloy-midnight/40 disabled:opacity-30"
                                        disabled={index === rows.length - 1}
                                        onClick={() => move(index, 1)}
                                    >
                                        <ArrowDown size={12} />
                                    </button>
                                    <button
                                        type="button"
                                        aria-label={`Remove ${row.label ?? row.decision_key}`}
                                        className="rounded p-1 text-alloy-midnight/40 hover:bg-alloy-ember/10 hover:text-alloy-ember"
                                        onClick={() => setRows((prev) => prev.filter((r) => r.decision_key !== row.decision_key))}
                                    >
                                        <X size={12} />
                                    </button>
                                </div>
                                {expanded ? (
                                    <div className="space-y-2 border-t border-alloy-forge/10 px-3 py-2 text-[0.6875rem] text-alloy-midnight/60">
                                        <div className="grid grid-cols-2 gap-2">
                                            <label>
                                                Label
                                                <input
                                                    className={`${field} block w-full`}
                                                    value={row.label ?? ""}
                                                    data-testid="stage-per-child-paths-label"
                                                    onChange={(e) => update(row.decision_key, (r) => ({ ...r, label: e.target.value }))}
                                                />
                                            </label>
                                            <label>
                                                Reads once chosen
                                                <input
                                                    className={`${field} block w-full`}
                                                    value={row.state_label ?? ""}
                                                    placeholder={row.label ?? ""}
                                                    data-testid="stage-per-child-paths-state-label"
                                                    onChange={(e) =>
                                                        update(row.decision_key, (r) => {
                                                            const { state_label: _old, ...rest } = r;
                                                            return e.target.value ? { ...rest, state_label: e.target.value } : rest;
                                                        })
                                                    }
                                                />
                                            </label>
                                            <label>
                                                Moves the child to
                                                <select
                                                    className={`${field} block w-full`}
                                                    value={dest}
                                                    data-testid="stage-per-child-paths-row-stage"
                                                    onChange={(e) => update(row.decision_key, (r) => withRoute(r, e.target.value, statusOf(r)))}
                                                >
                                                    <option value="">Stays where it is</option>
                                                    {childStages.map((st) => (
                                                        <option key={st.key} value={st.key}>
                                                            {st.label}
                                                        </option>
                                                    ))}
                                                </select>
                                            </label>
                                            <label>
                                                and sets the child to
                                                <select
                                                    className={`${field} block w-full`}
                                                    value={status}
                                                    data-testid="stage-per-child-paths-row-status"
                                                    onChange={(e) => update(row.decision_key, (r) => withRoute(r, destinationOf(r), e.target.value))}
                                                >
                                                    {status && !childStatuses.some((s) => s.status_key === status) ? <option value={status}>{status}</option> : null}
                                                    {childStatuses.map((st) => (
                                                        <option key={st.status_key} value={st.status_key}>
                                                            {st.status_label}
                                                        </option>
                                                    ))}
                                                </select>
                                            </label>
                                        </div>
                                        <label className="flex items-center gap-1.5">
                                            <input
                                                type="checkbox"
                                                checked={row.available !== false}
                                                data-testid="stage-per-child-paths-available"
                                                onChange={(e) =>
                                                    update(row.decision_key, (r) => {
                                                        const { available: _a, ...rest } = r;
                                                        return e.target.checked ? rest : { ...rest, available: false };
                                                    })
                                                }
                                            />
                                            Offered to operators
                                        </label>
                                        <div className="space-y-1.5">
                                            <p className="font-medium text-alloy-midnight/70">Asks first</p>
                                            {(row.required_inputs ?? []).map((inp, i) => (
                                                <InputEditor
                                                    key={i}
                                                    input={inp}
                                                    onChange={(next) => setInputs(row.decision_key, (all) => all.map((x, j) => (j === i ? next : x)))}
                                                    onRemove={() => setInputs(row.decision_key, (all) => all.filter((_, j) => j !== i))}
                                                />
                                            ))}
                                            <button
                                                type="button"
                                                className="config-secondary-btn config-secondary-btn--sm gap-1"
                                                data-testid="stage-per-child-paths-add-input"
                                                onClick={() => setInputs(row.decision_key, (all) => [...all, { key: "", label: "", type: "select", required: true, options: [] }])}
                                            >
                                                <Plus size={11} /> Add a question
                                            </button>
                                        </div>
                                    </div>
                                ) : null}
                            </li>
                        );
                    })}
                </ul>
            )}

            {childStatuses.length === 0 ? (
                // Say why rather than render a control that cannot produce a valid path.
                <p className="rounded-lg bg-alloy-forge/[0.04] px-3 py-2 text-[0.75rem] text-alloy-midnight/55">
                    No child statuses are configured yet, so a per-child path has no state to land in. Configure child statuses in
                    Status &amp; State first.
                </p>
            ) : (
                <div className="flex flex-wrap items-end gap-2">
                    <label className="text-[0.6875rem] text-alloy-midnight/55">
                        Label
                        <input
                            className={`ml-1 ${field}`}
                            value={pendingLabel}
                            placeholder="e.g. Offer spot"
                            disabled={busy}
                            data-testid="stage-per-child-paths-new-label"
                            onChange={(e) => setPendingLabel(e.target.value)}
                        />
                    </label>
                    <label className="text-[0.6875rem] text-alloy-midnight/55">
                        Move child to
                        <select data-testid="stage-per-child-paths-stage" className={`ml-1 ${field}`} value={pendingStage} disabled={busy} onChange={(e) => setPendingStage(e.target.value)}>
                            <option value="">Choose a stage…</option>
                            {childStages.map((st) => (
                                <option key={st.key} value={st.key}>
                                    {st.label}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="text-[0.6875rem] text-alloy-midnight/55">
                        and set the child to
                        <select data-testid="stage-per-child-paths-status" className={`ml-1 ${field}`} value={pendingStatus} disabled={busy} onChange={(e) => setPendingStatus(e.target.value)}>
                            <option value="">Choose a status…</option>
                            {childStatuses.map((st) => (
                                <option key={st.status_key} value={st.status_key}>
                                    {st.status_label}
                                </option>
                            ))}
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
                            const label = pendingLabel.trim() || `Move child to ${dest.label}`;
                            setRows((prev) => {
                                const decision_key = uniqueDecisionKey(label, new Set(prev.map((r) => r.decision_key)));
                                setOpen(decision_key);
                                return [
                                    ...prev,
                                    {
                                        decision_key,
                                        // The action the operator takes for that child. The route and the
                                        // validator enforce that it is process-selected; this control
                                        // does not restate the rule.
                                        action_ref: "update_enrollment_status",
                                        label,
                                        subject_grain: "child",
                                        targets: childPathTargets(dest.key, pendingStatus),
                                    },
                                ];
                            });
                            setPendingLabel("");
                            setPendingStage("");
                            setPendingStatus("");
                        }}
                    >
                        Add path
                    </button>
                    <button type="button" data-testid="stage-per-child-paths-save" className="config-primary-btn config-primary-btn--sm gap-1.5" disabled={busy} onClick={() => void save()}>
                        {busy ? <Loader2 size={12} className="animate-spin" /> : null}
                        Save per-child paths
                    </button>
                </div>
            )}

            {error ? (
                <p className="mt-2 text-[0.75rem] text-alloy-ember" role="alert">
                    {error}
                </p>
            ) : null}
            {notice ? (
                <p className="mt-2 text-[0.75rem] text-alloy-bend-pine" role="status">
                    {notice}
                </p>
            ) : null}
        </div>
    );
}
