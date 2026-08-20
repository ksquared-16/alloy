"use client";

/**
 * The paperwork Alloy filled out, presented as something to READ.
 *
 * One renderer of {@link CompiledArtifact} — not the artifact model, and not a second Forms
 * authority. Validation, acknowledgment semantics, signature meaning and submission all stay where
 * they are; this decides only how a compiled artifact LOOKS to the parent who is reviewing it.
 *
 * A resolved fact reads as a fact with an Edit beside it. An input appears only where the
 * participant genuinely still has something to do, or where they have asked to change something.
 * That is the whole difference between "here is your completed paperwork" and "here is a form".
 */

import { useState } from "react";

import type { CompiledArtifact, CompiledArtifactControl } from "@/lib/enrollment/participantRuntime/compileParticipantArtifact";
import { displayValue, naturalFieldLabel } from "@/lib/enrollment/participantRuntime/participantTurnPresentation";

function Fact({
    control,
    onEdit,
}: {
    control: CompiledArtifactControl;
    onEdit: (() => void) | null;
}) {
    return (
        <div className="flex items-baseline justify-between gap-4 border-b border-alloy-midnight/[0.06] py-3">
            <div className="min-w-0">
                <div className="text-[13px] text-alloy-midnight/50">{naturalFieldLabel(control.label)}</div>
                <div className="text-[15px] text-alloy-midnight">{displayValue(control.value) || "—"}</div>
            </div>
            {onEdit ? (
                <button
                    type="button"
                    onClick={onEdit}
                    className="shrink-0 text-[13px] text-alloy-midnight/55 underline underline-offset-2"
                    data-artifact-edit={control.field_id}
                >
                    Edit
                </button>
            ) : null}
        </div>
    );
}

export function CompiledArtifactReview({
    artifact,
    onEditValue,
    renderInput,
}: {
    artifact: CompiledArtifact;
    /** Editing writes through the shared-value mechanism; the host owns that call. */
    onEditValue: (control: CompiledArtifactControl, value: unknown) => void;
    /** Artifact-specific controls stay with the Forms renderer — this yields to it. */
    renderInput: (control: CompiledArtifactControl) => React.ReactNode;
}) {
    const [editing, setEditing] = useState<string | null>(null);
    const [draft, setDraft] = useState("");

    return (
        <div className="flex flex-col gap-6" data-compiled-artifact="true">
            {artifact.sections.map((section, i) => (
                <div key={i} className="flex flex-col">
                    {section.title ? (
                        <h3 className="pb-2 text-[15px] font-medium text-alloy-midnight">{section.title}</h3>
                    ) : null}

                    {section.controls.map((control) => {
                        if (control.kind === "display_content") {
                            // The document's own prose, kept as prose.
                            return control.content ? (
                                <p key={control.field_id} className="py-3 text-[14px] leading-relaxed text-alloy-midnight/70">
                                    {control.content}
                                </p>
                            ) : null;
                        }

                        // Acknowledgment and signature belong to the phase after review.
                        if (control.kind === "acknowledgment" || control.kind === "signature") return null;

                        if (control.kind === "resolved_shared_value") {
                            if (editing !== control.field_id) {
                                return (
                                    <Fact
                                        key={control.field_id}
                                        control={control}
                                        onEdit={() => {
                                            setEditing(control.field_id);
                                            setDraft(control.value == null ? "" : String(control.value));
                                        }}
                                    />
                                );
                            }
                            return (
                                <div key={control.field_id} className="flex flex-col gap-2 border-b border-alloy-midnight/[0.06] py-3">
                                    <label className="text-[13px] text-alloy-midnight/50" htmlFor={`edit-${control.field_id}`}>
                                        {naturalFieldLabel(control.label)}
                                    </label>
                                    {/* The SAME semantic control the Form authored — a date stays a date. */}
                                    <input
                                        id={`edit-${control.field_id}`}
                                        type={control.input_type === "date" ? "date" : "text"}
                                        value={draft}
                                        onChange={(e) => setDraft(e.target.value)}
                                        className="rounded-xl border border-alloy-midnight/15 px-3 py-2.5 text-[14px]"
                                    />
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                onEditValue(control, draft);
                                                setEditing(null);
                                            }}
                                            className="rounded-xl bg-alloy-midnight px-3.5 py-2 text-[14px] font-medium text-white"
                                        >
                                            Update
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setEditing(null)}
                                            className="text-[13px] text-alloy-midnight/55 underline underline-offset-2"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            );
                        }

                        // Still the participant's to do — the Forms renderer owns it.
                        return <div key={control.field_id} className="py-3">{renderInput(control)}</div>;
                    })}
                </div>
            ))}
        </div>
    );
}
