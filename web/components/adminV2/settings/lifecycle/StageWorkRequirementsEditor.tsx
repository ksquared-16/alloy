"use client";

/**
 * Author which of a stage's WORK must be resolved before leaving it, and on which ways out.
 *
 * A stage could already require a field or a form before exit, with timing, enforcement and
 * per-transition scoping. It could not require work. So Tour's `conduct_tour` could be marked
 * required and primary and an operator could still move the record on without ever resolving it —
 * the work was real, the requirement model simply had no way to point at it.
 *
 * ── NO TOUR-SPECIFIC UI ──
 *
 * Nothing here knows about Tour. The selectable work is whatever the STAGE's operating plan
 * configures, and the selectable exits are the stage's own configured transitions. Point this at a
 * Billing stage with two work templates and it authors those instead, with no code change — which
 * is the only way "required work blocks stage exit" can be a platform capability rather than one
 * process's feature.
 *
 * ── WHY THE TRANSITION PICKER IS NOT OPTIONAL DECORATION ──
 *
 * "All required work blocks every exit" is the obvious rule and it is wrong: Lead → Waitlist is a
 * legitimate move while Lead's own Contact Family work is required and unfinished. Leaving the
 * selection empty means every exit, which is a real choice; choosing specific exits is how an
 * operator says "this work gates progression but not abandonment". The control exists because the
 * distinction is the product's, not because the model needed a field.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Wrench } from "lucide-react";

import type {
    LifecycleBuilderProcessRecord,
    LifecycleBuilderStageRecord,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import type { PersistedRequirementLevel } from "@/lib/lifecycle/lifecycleStageRequirementLevels";
import type { RequirementEnforcement } from "@/lib/lifecycle/requirementTimingTypes";
import { requirementsOfOtherKinds } from "@/lib/lifecycle/stageRequirementsV1";

type WorkRequirementRow = {
    requirement_id: string;
    kind: "work";
    work_template_key: string;
    level: PersistedRequirementLevel;
    timing: "stage_exit";
    enforcement: RequirementEnforcement;
    applies_to_transition_keys?: string[];
};

const ENFORCEMENTS: RequirementEnforcement[] = ["informational", "attention", "blocking"];

/**
 * Identity derived from the work it references, so it survives a reload.
 *
 * The section is replaced on every save; a random id would make an unchanged requirement look like
 * a different one each time it was written.
 */
function requirementIdFor(templateKey: string): string {
    return `work_${templateKey}`;
}

function rowsFromStage(stage: LifecycleBuilderStageRecord | null | undefined): WorkRequirementRow[] {
    const authored = stage?.requirements_v1?.requirements ?? [];
    return authored.flatMap((r) =>
        r.ref.kind === "work" ?
            [
                {
                    requirement_id: r.requirement_id,
                    kind: "work" as const,
                    work_template_key: r.ref.work_template_key,
                    level: r.level,
                    timing: "stage_exit" as const,
                    enforcement: (r.enforcement ?? "blocking") as RequirementEnforcement,
                    ...(r.applies_to_transition_keys?.length ?
                        { applies_to_transition_keys: [...r.applies_to_transition_keys] }
                    :   {}),
                },
            ]
        :   [],
    );
}

export default function StageWorkRequirementsEditor({
    departmentId,
    stageKey,
    stageRecord,
    process,
    onSaved,
}: {
    departmentId: string;
    stageKey: string;
    stageRecord?: LifecycleBuilderStageRecord | null;
    process?: LifecycleBuilderProcessRecord | null;
    onSaved?: () => void | Promise<void>;
}) {
    const [rows, setRows] = useState<WorkRequirementRow[]>(() => rowsFromStage(stageRecord));
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    // Authored state is the server's, never the last thing typed.
    useEffect(() => {
        setRows(rowsFromStage(stageRecord));
        setError(null);
        setNotice(null);
    }, [stageRecord, stageKey]);

    /** The work THIS stage produces — the only work a requirement here could ever be satisfied by. */
    const workTemplates = useMemo(
        () => stageRecord?.stage_operating_plan_v1?.work_templates ?? [],
        [stageRecord],
    );

    /** The stage's own configured ways out. Empty means the process has authored none yet. */
    const exits = useMemo(
        () =>
            (stageRecord?.stage_operating_plan_v1?.outgoing_transitions ?? [])
                .filter((t) => t.available !== false)
                .map((t) => ({ key: t.transition_ref, label: t.label || t.target_stage_key }))
                .filter((t) => Boolean(t.key)),
        [stageRecord],
    );

    const byKey = useMemo(() => new Map(rows.map((r) => [r.work_template_key, r])), [rows]);

    const toggle = useCallback((templateKey: string) => {
        setRows((prev) =>
            prev.some((r) => r.work_template_key === templateKey) ?
                prev.filter((r) => r.work_template_key !== templateKey)
            :   [
                    ...prev,
                    {
                        requirement_id: requirementIdFor(templateKey),
                        kind: "work" as const,
                        work_template_key: templateKey,
                        level: "required" as PersistedRequirementLevel,
                        timing: "stage_exit" as const,
                        enforcement: "blocking" as RequirementEnforcement,
                    },
                ],
        );
    }, []);

    const update = useCallback((templateKey: string, patch: Partial<WorkRequirementRow>) => {
        setRows((prev) =>
            prev.map((r) => (r.work_template_key === templateKey ? { ...r, ...patch } : r)),
        );
    }, []);

    const toggleExit = useCallback((templateKey: string, transitionKey: string) => {
        setRows((prev) =>
            prev.map((r) => {
                if (r.work_template_key !== templateKey) return r;
                const current = r.applies_to_transition_keys ?? [];
                const next =
                    current.includes(transitionKey) ?
                        current.filter((k) => k !== transitionKey)
                    :   [...current, transitionKey];
                // An empty list is removed rather than stored: "no filter" and "filtered to nothing"
                // must not be the same stored value, and the model reads absent as "every exit".
                const { applies_to_transition_keys: _drop, ...rest } = r;
                return next.length ? { ...rest, applies_to_transition_keys: next } : rest;
            }),
        );
    }, []);

    const save = useCallback(async () => {
        setBusy(true);
        setError(null);
        setNotice(null);
        try {
            const res = await fetch(
                `/api/admin/departments/${encodeURIComponent(departmentId)}/lifecycle-builder`,
                {
                    method: "PATCH",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        action: "set_stage_requirements",
                        process_id: process?.id,
                        stage_key: stageKey,
                        // Carry the kinds this editor does not edit; the action replaces the section.
                        requirements: [
                            ...rows,
                            ...requirementsOfOtherKinds(stageRecord?.requirements_v1, "work"),
                        ],
                    }),
                },
            );
            const json = (await res.json().catch(() => ({}))) as { error?: string; reason?: string };
            // The route's refusal IS the message — restating it here would put a second explanation
            // of the same rule in a second place.
            if (!res.ok) {
                throw new Error(
                    [json.error, json.reason].filter(Boolean).join(" ") || "The change was refused.",
                );
            }
            setNotice(
                rows.length ?
                    `Saved ${rows.length} work requirement${rows.length === 1 ? "" : "s"}. Publish to make it live.`
                :   "Saved — leaving this stage no longer requires any work. Publish to make it live.",
            );
            await onSaved?.();
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(false);
        }
    }, [departmentId, process?.id, stageKey, rows, stageRecord?.requirements_v1, onSaved]);

    if (!process?.id) {
        return <p className="stage-field__hint">Select a business process to configure work requirements.</p>;
    }

    return (
        <div data-testid="stage-work-requirements" className="mt-4 border-t border-alloy-midnight/8 pt-4">
            <div className="mb-2 flex items-center gap-1.5">
                <Wrench size={13} className="text-alloy-midnight/45" />
                <h4 className="text-[0.8125rem] font-semibold text-alloy-midnight">Work required to leave this stage</h4>
            </div>
            <p className="stage-field__hint mb-3">
                Unresolved work stops the record moving on. Leave the exits unselected to require it on
                every way out, or pick the ones it should gate.
            </p>

            {workTemplates.length === 0 ?
                <p className="mb-3 rounded-lg bg-alloy-midnight/[0.03] px-3 py-2 text-[0.75rem] text-alloy-midnight/55">
                    This stage has no work configured, so there is nothing that could be required.
                </p>
            :   <ul className="mb-3 space-y-2">
                    {workTemplates.map((template) => {
                        const row = byKey.get(template.template_key);
                        return (
                            <li
                                key={template.template_key}
                                className="rounded-lg border border-alloy-midnight/10 bg-white px-3 py-2"
                                data-testid={`stage-work-requirement-${template.template_key}`}
                            >
                                <label className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={Boolean(row)}
                                        onChange={() => toggle(template.template_key)}
                                        aria-label={`Require ${template.label} before leaving`}
                                    />
                                    <span className="flex-1 truncate text-[0.8125rem] text-alloy-midnight">
                                        {template.label}
                                    </span>
                                </label>

                                {row ?
                                    <div className="mt-2 space-y-2 pl-6">
                                        <label className="flex items-center gap-2 text-[0.75rem] text-alloy-midnight/70">
                                            Enforcement
                                            <select
                                                className="rounded border border-alloy-midnight/15 px-1.5 py-0.5 text-[0.75rem]"
                                                value={row.enforcement}
                                                onChange={(e) =>
                                                    update(template.template_key, {
                                                        enforcement: e.target.value as RequirementEnforcement,
                                                    })
                                                }
                                                aria-label={`Enforcement for ${template.label}`}
                                            >
                                                {ENFORCEMENTS.map((v) => (
                                                    <option key={v} value={v}>
                                                        {v}
                                                    </option>
                                                ))}
                                            </select>
                                        </label>

                                        {exits.length ?
                                            <fieldset>
                                                <legend className="text-[0.6875rem] uppercase tracking-wide text-alloy-midnight/45">
                                                    Applies to exits
                                                </legend>
                                                <div className="mt-1 flex flex-wrap gap-2">
                                                    {exits.map((exit) => (
                                                        <label
                                                            key={exit.key}
                                                            className="flex items-center gap-1 text-[0.75rem] text-alloy-midnight/70"
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                checked={
                                                                    row.applies_to_transition_keys?.includes(exit.key) ??
                                                                    false
                                                                }
                                                                onChange={() => toggleExit(template.template_key, exit.key)}
                                                            />
                                                            {exit.label}
                                                        </label>
                                                    ))}
                                                </div>
                                                {!row.applies_to_transition_keys?.length ?
                                                    <p className="mt-1 text-[0.6875rem] text-alloy-midnight/45">
                                                        Required on every exit from this stage.
                                                    </p>
                                                :   null}
                                            </fieldset>
                                        :   <p className="text-[0.6875rem] text-alloy-midnight/45">
                                                This stage has no configured exits yet, so the requirement will
                                                apply to every way out.
                                            </p>
                                        }
                                    </div>
                                :   null}
                            </li>
                        );
                    })}
                </ul>
            }

            <button
                type="button"
                className="rounded-md bg-alloy-pine px-3 py-1.5 text-[0.8125rem] font-semibold text-white disabled:opacity-40"
                onClick={save}
                disabled={busy}
                data-testid="stage-work-requirements-save"
            >
                {busy ?
                    <span className="flex items-center gap-1.5">
                        <Loader2 size={12} className="animate-spin" /> Saving…
                    </span>
                :   "Save work requirements"}
            </button>

            {error ?
                <p className="mt-2 text-[0.75rem] text-alloy-ember" data-testid="stage-work-requirements-error">
                    {error}
                </p>
            :   null}
            {notice ?
                <p className="mt-2 text-[0.75rem] text-alloy-pine" data-testid="stage-work-requirements-notice">
                    {notice}
                </p>
            :   null}
        </div>
    );
}
