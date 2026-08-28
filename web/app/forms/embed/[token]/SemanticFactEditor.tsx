"use client";

/**
 * "Make a change" — the participant edits FACTS, not document destinations.
 *
 * The compiled artifact legitimately carries one control per document location (DOB appears three
 * times because the paperwork asks three times). The parent's mental model holds one date of
 * birth. This surface dedupes resolved controls by their binding identity, so each fact appears
 * ONCE; an edit goes through the host's shared-value command and lands on every destination —
 * ask-once, shown once, corrected once.
 *
 * Destination counts, PDF field names and coordinates never render here. Controls without a shared
 * identity (the artifact's own) keep their per-control rows, because for them the control IS the
 * fact.
 */

import { useState } from "react";

import type {
    CompiledArtifact,
    CompiledArtifactControl,
} from "@/lib/enrollment/participantRuntime/compileParticipantArtifact";
import { displayValue, naturalFieldLabel } from "@/lib/enrollment/participantRuntime/participantTurnPresentation";

/**
 * What this control is called, when Alloy is entitled to call it anything.
 *
 * `participant_label` is null when the label is the source PDF's own widget name, and the fallback
 * is deliberately NOT the raw label — that is the leak this seam exists to close.
 */
function captionFor(control: CompiledArtifactControl): string {
    const words = naturalFieldLabel(control.participant_label, control.shared_key);
    if (words && words !== "this") return words;
    return "Marked on your document";
}

/** One row per FACT: resolved controls collapsed by shared identity, unbound ones by field. */
export function uniqueResolvedFacts(artifact: CompiledArtifact): CompiledArtifactControl[] {
    const seen = new Set<string>();
    const out: CompiledArtifactControl[] = [];
    for (const control of artifact.resolved) {
        const identity = control.shared_key ?? `field:${control.field_id}`;
        if (seen.has(identity)) continue;
        seen.add(identity);
        out.push(control);
    }
    return out;
}

export function SemanticFactEditor({
    artifact,
    onEditValue,
    renderInput,
    onBack,
}: {
    artifact: CompiledArtifact;
    /** Editing writes through the shared-value mechanism; the host owns that call. */
    onEditValue: (control: CompiledArtifactControl, value: unknown) => void;
    /** Artifact-specific controls stay with the Forms renderer — this yields to it. */
    renderInput: (control: CompiledArtifactControl) => React.ReactNode;
    onBack: () => void;
}) {
    const [editing, setEditing] = useState<string | null>(null);
    const [draft, setDraft] = useState("");
    const facts = uniqueResolvedFacts(artifact);

    return (
        <div className="flex flex-col" data-semantic-fact-editor="true">
            {facts.map((control) => {
                if (editing !== control.field_id) {
                    return (
                        <div
                            key={control.field_id}
                            className="flex items-baseline justify-between gap-4 border-b border-alloy-midnight/[0.06] py-3.5"
                        >
                            <div className="min-w-0">
                                <div className="text-[13px] text-alloy-midnight/50">
                                    {captionFor(control)}
                                </div>
                                <div className="text-[16px] text-alloy-midnight">
                                    {displayValue(control.value) || "—"}
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    setEditing(control.field_id);
                                    setDraft(control.value == null ? "" : String(control.value));
                                }}
                                className="shrink-0 text-[14px] text-alloy-midnight/55 underline underline-offset-2"
                                data-artifact-edit={control.field_id}
                            >
                                Edit
                            </button>
                        </div>
                    );
                }
                return (
                    <div
                        key={control.field_id}
                        className="flex flex-col gap-2 border-b border-alloy-midnight/[0.06] py-3.5"
                    >
                        <label className="text-[13px] text-alloy-midnight/50" htmlFor={`edit-${control.field_id}`}>
                            {captionFor(control)}
                        </label>
                        {/* The SAME semantic control the Form authored — a date stays a date. */}
                        <input
                            id={`edit-${control.field_id}`}
                            type={control.input_type === "date" ? "date" : "text"}
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            className="rounded-xl border border-alloy-midnight/15 px-3 py-2.5 text-[15px]"
                        />
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    onEditValue(control, draft);
                                    setEditing(null);
                                    onBack();
                                }}
                                className="rounded-xl bg-alloy-midnight px-4 py-2 text-[14px] font-medium text-white"
                            >
                                Update
                            </button>
                            <button
                                type="button"
                                onClick={() => setEditing(null)}
                                className="text-[14px] text-alloy-midnight/55 underline underline-offset-2"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                );
            })}

            {/* Still the participant's to do — the Forms renderer owns these controls. */}
            {artifact.outstanding.map((control) => (
                <div key={control.field_id} className="py-3.5">
                    {renderInput(control)}
                </div>
            ))}

            <div className="pt-5">
                <button
                    type="button"
                    onClick={onBack}
                    className="rounded-xl border border-alloy-midnight/15 px-4 py-2.5 text-[15px] font-medium text-alloy-midnight"
                    data-back-to-paperwork="true"
                >
                    Back to paperwork
                </button>
            </div>
        </div>
    );
}
