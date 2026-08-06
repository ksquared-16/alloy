"use client";

/**
 * Governed family close — the operator surface.
 *
 * Three states, and the operator is never in two of them at once:
 *
 *   idle       one button, nothing else
 *   preview    exactly who will be affected, the reason picker, cancel / confirm
 *   blocked    why it cannot happen, and no confirm button at all
 *
 * BLOCKED SHOWS NO CONFIRM. Not a disabled one — none. A disabled primary invites the operator to
 * hunt for the state that would enable it, and for an enrolled child there is no such state on this
 * surface. The message says where the operation actually lives instead.
 *
 * Three things fixed here that the per-child review found in `ParticipantDecisionsPanel`:
 *  - the input error renders AT the field it belongs to, not at the top of the panel
 *  - a valid selection clears the error immediately, rather than on next submit
 *  - the destructive action is styled as destructive, not identically to everything else
 */

import { useCallback, useEffect, useState } from "react";
import {
    oppInqEyebrow,
    oppInqInnerCardCompact,
    oppInqLeadSummaryShellClassName,
} from "@/components/admin/drawer/opportunityInquiryDrawerTypography";
import {
    executeFamilyClose,
    fetchFamilyClosePreview,
    type FamilyCloseScope,
} from "@/lib/lifecycle/familyCloseClient";
import type {
    FamilyCloseAffectedChild,
    FamilyCloseBlock,
} from "@/lib/lifecycle/planGovernedFamilyClose";
import type { StageParticipantDecisionInputV1 } from "@/lib/lifecycle/stageOperatingPlanV1";

type Props = {
    scope: FamilyCloseScope;
    canMutate: boolean;
    onClosed: (affected: { opportunityId: string }) => void;
};

export default function FamilyClosePanel({ scope, canMutate, onClosed }: Props) {
    const [configured, setConfigured] = useState(false);
    const [label, setLabel] = useState("Close Family");
    const [outcomeLabel, setOutcomeLabel] = useState("closed");
    const [inputs, setInputs] = useState<StageParticipantDecisionInputV1[]>([]);
    const [closing, setClosing] = useState<FamilyCloseAffectedChild[]>([]);
    const [skipped, setSkipped] = useState<FamilyCloseAffectedChild[]>([]);
    const [blocks, setBlocks] = useState<FamilyCloseBlock[]>([]);
    const [allowed, setAllowed] = useState(false);
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [values, setValues] = useState<Record<string, string>>({});
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [error, setError] = useState<string | null>(null);
    const [done, setDone] = useState<FamilyCloseAffectedChild[] | null>(null);

    const { opportunityId, departmentId, stageKey, templateKey } = scope;

    const load = useCallback(async () => {
        const res = await fetchFamilyClosePreview({ opportunityId, departmentId, stageKey, templateKey });
        setConfigured(res.configured);
        if (!res.configured) return;
        setLabel(res.label ?? "Close Family");
        setOutcomeLabel(res.child_outcome_label ?? "closed");
        setInputs(res.required_inputs ?? []);
        setClosing(res.closing ?? []);
        setSkipped(res.skipped ?? []);
        setBlocks(res.blocks ?? []);
        setAllowed(res.allowed === true);
    }, [opportunityId, departmentId, stageKey, templateKey]);

    useEffect(() => {
        let cancelled = false;
        void load().catch((e: unknown) => {
            if (!cancelled) setError(e instanceof Error ? e.message : "Could not load close preview");
        });
        return () => {
            cancelled = true;
        };
    }, [load]);

    const confirm = useCallback(async () => {
        setBusy(true);
        setError(null);
        setFieldErrors({});
        try {
            const result = await executeFamilyClose(
                { opportunityId, departmentId, stageKey, templateKey },
                values,
            );
            if (!result.ok) {
                // Input problems belong to their field; everything else is a panel-level message.
                if (result.input_issues?.length) {
                    setFieldErrors(
                        Object.fromEntries(result.input_issues.map((i) => [i.input_key, i.message])),
                    );
                } else {
                    setError(result.error);
                }
                if (result.blocks?.length) {
                    setBlocks(result.blocks);
                    setAllowed(false);
                }
                return;
            }
            setDone(result.closed_children);
            setOpen(false);
            onClosed({ opportunityId });
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Could not close this family");
        } finally {
            setBusy(false);
        }
    }, [departmentId, onClosed, opportunityId, stageKey, templateKey, values]);

    if (!configured) return null;

    if (done) {
        return (
            <div className={oppInqLeadSummaryShellClassName} data-family-close-panel="done">
                <div className="border-b border-alloy-stone/12 pb-1">
                    <span className={oppInqEyebrow}>Lead closed</span>
                </div>
                <p className={`${oppInqInnerCardCompact} mt-1 text-[12px] text-alloy-midnight/70`}>
                    {done.length === 0 ?
                        "This lead is closed."
                    :   `This lead is closed. ${done.map((c) => c.label).join(", ")} ${
                            done.length === 1 ? "was" : "were"
                        } marked ${outcomeLabel}.`}
                </p>
            </div>
        );
    }

    return (
        <div className={oppInqLeadSummaryShellClassName} data-family-close-panel={open ? "preview" : "idle"}>
            <div className="flex flex-wrap items-end justify-between gap-1.5 border-b border-alloy-stone/12 pb-1">
                <span className={oppInqEyebrow}>Close this lead</span>
            </div>

            <div className={`${oppInqInnerCardCompact} mt-1 space-y-2`}>
                {/* BLOCKED — stated before anything else, and no confirm exists below it. */}
                {blocks.length ?
                    <div className="space-y-1.5" data-family-close-blocked="true">
                        {blocks.map((block) => (
                            <p
                                key={block.code}
                                className="rounded-md border border-red-200 bg-red-50/70 px-2.5 py-2 text-[12px] leading-relaxed text-red-900"
                                role="alert"
                            >
                                {block.message}
                            </p>
                        ))}
                    </div>
                :   null}

                {error ?
                    <p className="text-[12px] font-medium text-red-800/90" role="alert">
                        {error}
                    </p>
                :   null}

                {!open ?
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            className="rounded-lg border border-red-300/70 bg-white px-3 py-1.5 text-[12px] font-semibold text-red-800 hover:bg-red-50 disabled:opacity-50"
                            disabled={!canMutate || !allowed}
                            data-family-close-open="true"
                            onClick={() => {
                                setError(null);
                                setFieldErrors({});
                                setValues({});
                                void load();
                                setOpen(true);
                            }}
                        >
                            {label}
                        </button>
                        {!allowed && !blocks.length ?
                            <span className="text-[11px] text-alloy-midnight/50">
                                Checking this lead&apos;s children…
                            </span>
                        :   null}
                    </div>
                :   <div className="space-y-2" data-family-close-preview="true">
                        {closing.length ?
                            <>
                                <p className="text-[12px] text-alloy-midnight/70">
                                    {closing.length === 1 ?
                                        `The following child will be marked ${outcomeLabel}.`
                                    :   `The following children will be marked ${outcomeLabel}.`}
                                </p>
                                <ul className="space-y-0.5">
                                    {closing.map((c) => (
                                        <li
                                            key={c.process_instance_id}
                                            className="text-[12px] font-semibold text-alloy-midnight/90"
                                            data-family-close-affected={c.process_instance_id}
                                        >
                                            {c.label}
                                        </li>
                                    ))}
                                </ul>
                            </>
                        :   <p className="text-[12px] text-alloy-midnight/70">
                                No children are still open on this lead, so only the lead itself will
                                be closed.
                            </p>
                        }

                        {skipped.length ?
                            <p className="text-[11px] text-alloy-midnight/50">
                                Already closed, and left as {skipped.length === 1 ? "it is" : "they are"}:{" "}
                                {skipped.map((c) => c.label).join(", ")}.
                            </p>
                        :   null}

                        {inputs.map((spec) => (
                            <label key={spec.key} className="block space-y-1">
                                <span className="text-[11px] font-medium text-alloy-midnight/70">
                                    {spec.label}
                                    {spec.required ? " *" : ""}
                                </span>
                                {spec.type === "select" ?
                                    <select
                                        className="w-full rounded-lg border border-alloy-stone/20 bg-white px-2 py-1.5 text-[12px] text-alloy-midnight/90"
                                        value={values[spec.key] ?? ""}
                                        disabled={busy}
                                        aria-label={spec.label}
                                        data-family-close-input={spec.key}
                                        onChange={(e) => {
                                            setValues((v) => ({ ...v, [spec.key]: e.target.value }));
                                            // Clears on a valid choice, not on the next submit.
                                            if (e.target.value) {
                                                setFieldErrors((f) => {
                                                    const next = { ...f };
                                                    delete next[spec.key];
                                                    return next;
                                                });
                                            }
                                        }}
                                    >
                                        <option value="">Select…</option>
                                        {(spec.options ?? []).map((o) => (
                                            <option key={o.value} value={o.value}>
                                                {o.label}
                                            </option>
                                        ))}
                                    </select>
                                :   <input
                                        className="w-full rounded-lg border border-alloy-stone/20 bg-white px-2 py-1.5 text-[12px] text-alloy-midnight/90"
                                        value={values[spec.key] ?? ""}
                                        disabled={busy}
                                        aria-label={spec.label}
                                        data-family-close-input={spec.key}
                                        onChange={(e) => {
                                            setValues((v) => ({ ...v, [spec.key]: e.target.value }));
                                            if (e.target.value) {
                                                setFieldErrors((f) => {
                                                    const next = { ...f };
                                                    delete next[spec.key];
                                                    return next;
                                                });
                                            }
                                        }}
                                    />
                                }
                                {/* AT the field, not at the top of the panel. */}
                                {fieldErrors[spec.key] ?
                                    <span
                                        className="block text-[11px] font-medium text-red-700"
                                        role="alert"
                                        data-family-close-field-error={spec.key}
                                    >
                                        {fieldErrors[spec.key]}
                                    </span>
                                :   null}
                            </label>
                        ))}

                        <div className="flex flex-wrap items-center gap-2 pt-0.5">
                            <button
                                type="button"
                                className="rounded-lg border border-alloy-stone/20 px-3 py-1.5 text-[12px] text-alloy-midnight/70"
                                disabled={busy}
                                onClick={() => {
                                    setOpen(false);
                                    setFieldErrors({});
                                    setError(null);
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="rounded-lg bg-red-700 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-red-800 disabled:opacity-60"
                                disabled={busy}
                                data-family-close-confirm="true"
                                onClick={() => void confirm()}
                            >
                                {busy ? "Closing…" : label}
                            </button>
                        </div>
                    </div>
                }
            </div>
        </div>
    );
}
