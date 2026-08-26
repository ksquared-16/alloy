"use client";

/**
 * Author the Form requirements of one stage, and the journey entry point that starts in it.
 *
 * These two values had no writer. Fourteen library modules read, resolved, normalized, published and
 * consumed `requirements_v1`, the runtime derived a participant packet from it, and publication
 * validated it — but no operator surface could set it, and `entry_points_v1` was the same. Alloy
 * declared Form requirements authorable and then had no way to author one.
 *
 * This is the narrow control that closes that. It composes the two canonical actions on the existing
 * lifecycle-builder route and owns nothing: no second store, no second validator, no local rules.
 * The route refuses an unauthorable kind, an unknown stage, an inactive entry stage and an unreadable
 * row, and whatever it says is what the operator reads here.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardList, Flag, Loader2, Plus, X } from "lucide-react";
import type { LifecycleBuilderProcessRecord, LifecycleBuilderStageRecord } from "@/lib/lifecycle/lifecycleBuilderConfig";
import type { PersistedRequirementLevel } from "@/lib/lifecycle/lifecycleStageRequirementLevels";
import type { RequirementEnforcement } from "@/lib/lifecycle/requirementTimingTypes";

type FormOption = { id: string; name: string; key: string; has_published_version?: boolean };

/** One authored row, in the shape the canonical action accepts. */
type FormRequirementRow = {
    requirement_id: string;
    kind: "form";
    form_definition_id: string;
    level: PersistedRequirementLevel;
    scope: "record";
    timing: "stage_exit";
    enforcement: RequirementEnforcement;
};

const LEVELS: PersistedRequirementLevel[] = ["recommended", "required", "enforced"];
const ENFORCEMENTS: RequirementEnforcement[] = ["informational", "attention", "blocking"];

/**
 * A stable id derived from the form it references.
 *
 * Identity has to survive a reload, because the section is REPLACED on every save: a random id would
 * make an unchanged requirement look like a different one each time it was written.
 */
function requirementIdFor(formDefinitionId: string): string {
    return `form_${formDefinitionId.replace(/-/g, "")}`;
}

function rowsFromStage(stage: LifecycleBuilderStageRecord | null | undefined): FormRequirementRow[] {
    const authored = stage?.requirements_v1?.requirements ?? [];
    return authored.flatMap((r) =>
        r.ref.kind === "form"
            ? [{
                  requirement_id: r.requirement_id,
                  kind: "form" as const,
                  form_definition_id: r.ref.form_definition_id,
                  level: r.level,
                  scope: "record" as const,
                  timing: "stage_exit" as const,
                  enforcement: (r.enforcement ?? "blocking") as RequirementEnforcement,
              }]
            : [],
    );
}

export default function StageFormRequirementsEditor({
    departmentId,
    stageKey,
    stageLabel,
    stageRecord,
    process,
    onSaved,
}: {
    departmentId: string;
    stageKey: string;
    stageLabel: string;
    stageRecord?: LifecycleBuilderStageRecord | null;
    process?: LifecycleBuilderProcessRecord | null;
    /** Reload configuration so the editor reflects what was stored, not what was typed. */
    onSaved?: () => void | Promise<void>;
}) {
    const [rows, setRows] = useState<FormRequirementRow[]>(() => rowsFromStage(stageRecord));
    const [forms, setForms] = useState<FormOption[]>([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    // Authored state is the server's, never the last thing typed: re-seed whenever the stage changes.
    useEffect(() => {
        setRows(rowsFromStage(stageRecord));
        setError(null);
        setNotice(null);
    }, [stageRecord, stageKey]);

    useEffect(() => {
        let live = true;
        void fetch("/api/admin/forms", { credentials: "include" })
            .then((r) => r.json().catch(() => ({})))
            .then((j) => { if (live) setForms(((j as { data?: FormOption[] }).data ?? []).filter((f) => f.has_published_version)); })
            .catch(() => { if (live) setForms([]); });
        return () => { live = false; };
    }, []);

    const authored = stageRecord?.requirements_v1 !== undefined;
    const taken = useMemo(() => new Set(rows.map((r) => r.form_definition_id)), [rows]);
    const addable = useMemo(() => forms.filter((f) => !taken.has(f.id)), [forms, taken]);
    const nameOf = useCallback(
        (id: string) => forms.find((f) => f.id === id)?.name ?? id,
        [forms],
    );

    const entryIntentStage = process?.entry_points_v1?.by_intent?.enrollment_start ?? null;
    const isEntryStage = entryIntentStage === stageKey;

    const patch = useCallback(
        async (body: Record<string, unknown>) => {
            const res = await fetch(`/api/admin/departments/${encodeURIComponent(departmentId)}/lifecycle-builder`, {
                method: "PATCH",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const json = (await res.json().catch(() => ({}))) as { error?: string; reason?: string };
            // The route's refusal is the message. Restating it here in friendlier words would put a
            // second explanation of the same rule in a second place.
            if (!res.ok) throw new Error([json.error, json.reason].filter(Boolean).join(" ") || "The change was refused.");
        },
        [departmentId],
    );

    const run = useCallback(
        async (body: Record<string, unknown>, done: string) => {
            setBusy(true);
            setError(null);
            setNotice(null);
            try {
                await patch(body);
                setNotice(done);
                await onSaved?.();
            } catch (e) {
                setError((e as Error).message);
            } finally {
                setBusy(false);
            }
        },
        [patch, onSaved],
    );

    const saveRequirements = useCallback(
        () => run(
            { action: "set_stage_requirements", process_id: process?.id, stage_key: stageKey, requirements: rows },
            rows.length ? `Saved ${rows.length} form requirement${rows.length === 1 ? "" : "s"}. Publish to make it live.` : "Saved — this stage now requires no forms. Publish to make it live.",
        ),
        [run, process?.id, stageKey, rows],
    );

    const setEntryPoint = useCallback(
        () => run(
            { action: "set_process_entry_point", process_id: process?.id, intent: "enrollment_start", stage_key: stageKey },
            `New enrollments now begin in ${stageLabel}. Publish to make it live.`,
        ),
        [run, process?.id, stageKey, stageLabel],
    );

    if (!process?.id) {
        return <p className="stage-field__hint">Select a business process to configure form requirements.</p>;
    }

    return (
        <div data-testid="stage-form-requirements" className="mt-4 border-t border-alloy-midnight/8 pt-4">
            <div className="mb-2 flex items-center gap-1.5">
                <ClipboardList size={13} className="text-alloy-midnight/45" />
                <h4 className="text-[0.8125rem] font-semibold text-alloy-midnight">Advanced · individual requirements</h4>
            </div>
            <p className="stage-field__hint mb-3">
                The rows behind “Enrollment paperwork”. Edit here to set a level or enforcement per form; most
                directors should choose a packet above instead.
            </p>

            {rows.length === 0 ? (
                <p className="mb-3 rounded-lg bg-alloy-midnight/[0.03] px-3 py-2 text-[0.75rem] text-alloy-midnight/55">
                    {authored
                        ? "This stage requires no forms. That is an authored decision, not a gap."
                        : "No forms required yet."}
                </p>
            ) : (
                <ol className="mb-3 space-y-2">
                    {rows.map((row, i) => (
                        <li key={row.requirement_id} className="rounded-lg border border-alloy-midnight/10 bg-white px-3 py-2">
                            <div className="flex items-center gap-2">
                                <span className="text-[0.6875rem] font-semibold text-alloy-midnight/35 tabular-nums">{i + 1}</span>
                                <span className="flex-1 truncate text-[0.8125rem] text-alloy-midnight">{nameOf(row.form_definition_id)}</span>
                                <button
                                    type="button"
                                    aria-label={`Remove ${nameOf(row.form_definition_id)}`}
                                    className="rounded p-1 text-alloy-midnight/40 hover:bg-alloy-ember/10 hover:text-alloy-ember"
                                    onClick={() => setRows((prev) => prev.filter((r) => r.requirement_id !== row.requirement_id))}
                                >
                                    <X size={12} />
                                </button>
                            </div>
                            <div className="mt-1.5 flex flex-wrap items-center gap-2 pl-6">
                                <label className="flex items-center gap-1 text-[0.6875rem] text-alloy-midnight/55">
                                    Level
                                    <select
                                        className="rounded border border-alloy-forge/20 bg-white px-1.5 py-0.5 text-[0.6875rem]"
                                        value={row.level}
                                        onChange={(e) =>
                                            setRows((prev) => prev.map((r) => (r.requirement_id === row.requirement_id ? { ...r, level: e.target.value as PersistedRequirementLevel } : r)))
                                        }
                                    >
                                        {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                                    </select>
                                </label>
                                <label className="flex items-center gap-1 text-[0.6875rem] text-alloy-midnight/55">
                                    Enforcement
                                    <select
                                        className="rounded border border-alloy-forge/20 bg-white px-1.5 py-0.5 text-[0.6875rem]"
                                        value={row.enforcement}
                                        onChange={(e) =>
                                            setRows((prev) => prev.map((r) => (r.requirement_id === row.requirement_id ? { ...r, enforcement: e.target.value as RequirementEnforcement } : r)))
                                        }
                                    >
                                        {ENFORCEMENTS.map((x) => <option key={x} value={x}>{x}</option>)}
                                    </select>
                                </label>
                                {/* Fixed, and said out loud rather than hidden: `record` is the only scope
                                    the readiness evaluators implement today, and these forms are the work
                                    of this stage. */}
                                <span className="text-[0.6875rem] text-alloy-midnight/35">on this record · due before leaving the stage</span>
                            </div>
                        </li>
                    ))}
                </ol>
            )}

            <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1.5 text-[0.75rem] text-alloy-midnight/60">
                    <Plus size={12} />
                    <select
                        data-testid="stage-form-requirements-add"
                        className="rounded-lg border border-alloy-forge/20 bg-white px-2 py-1 text-[0.75rem]"
                        value=""
                        disabled={busy || addable.length === 0}
                        onChange={(e) => {
                            const id = e.target.value;
                            if (!id) return;
                            setRows((prev) => [
                                ...prev,
                                { requirement_id: requirementIdFor(id), kind: "form", form_definition_id: id, level: "required", scope: "record", timing: "stage_exit", enforcement: "blocking" },
                            ]);
                        }}
                    >
                        <option value="">{addable.length ? "Add a published form…" : "No further published forms"}</option>
                        {addable.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                </label>
                <button
                    type="button"
                    data-testid="stage-form-requirements-save"
                    className="config-primary-btn config-primary-btn--sm gap-1.5"
                    disabled={busy}
                    onClick={() => void saveRequirements()}
                >
                    {busy ? <Loader2 size={12} className="animate-spin" /> : null}
                    Save requirements
                </button>
            </div>

            <div className="mt-4 border-t border-alloy-midnight/8 pt-3">
                <div className="mb-1.5 flex items-center gap-1.5">
                    <Flag size={13} className="text-alloy-midnight/45" />
                    <h4 className="text-[0.8125rem] font-semibold text-alloy-midnight">Where a new enrollment begins</h4>
                </div>
                <p className="stage-field__hint mb-2">
                    {isEntryStage
                        ? `Start Enrollment begins a journey in ${stageLabel}.`
                        : entryIntentStage
                          ? `Start Enrollment currently begins in “${entryIntentStage}”.`
                          : "No stage is set, so Start Enrollment has nowhere to begin and will refuse."}
                </p>
                <button
                    type="button"
                    data-testid="stage-entry-point-set"
                    className="config-secondary-btn config-secondary-btn--sm"
                    disabled={busy || isEntryStage}
                    onClick={() => void setEntryPoint()}
                >
                    {isEntryStage ? "This is the entry stage" : `Begin new enrollments in ${stageLabel}`}
                </button>
            </div>

            {error ? <p className="mt-2 text-[0.75rem] text-alloy-ember" role="alert">{error}</p> : null}
            {notice ? <p className="mt-2 text-[0.75rem] text-alloy-juniper" role="status">{notice}</p> : null}
        </div>
    );
}
