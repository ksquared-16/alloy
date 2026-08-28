"use client";

import { useState } from "react";

import { Action, ActionRow, SectionHead } from "@/components/cardLab/CardLabKit";
import UniversalCard from "@/components/admin/focusPanel/UniversalCard";

/**
 * ADD A HEALTH FACT — the thin operator form over the registered action.
 *
 * ── WHY THIS EXISTS AS ITS OWN COMMAND CARD ──
 *
 * The Health detail's "Add allergy" / "Add condition" / "Add medication" affordances were
 * clickable and did nothing. Each one is a real mutation with a real owner, so each opens a real
 * command in the same centered, scrimmed Focus Card host the details use.
 *
 * ── WHAT THIS DOES NOT DO ──
 *
 * It never touches `healthFactService` — it posts `health_fact.add` to the registered action path,
 * which is the only way health truth is allowed to change. That action resolves the actor's grants
 * from the client it already holds, sets provenance to `operator` (an operator asserting a fact IS
 * the provenance, never inferred), and writes append-only: an edit supersedes, an end ends, and
 * nothing is deleted in place.
 *
 * Severity is deliberately optional and never defaulted. On an allergy it is the single most
 * dangerous value this form could produce, and a silent default of "mild" on a life-threatening
 * allergy is the kind of wrong that hurts a child.
 */

export type HealthFactKindOption = "allergy" | "condition" | "medication";

const SEVERITIES = ["life_threatening", "severe", "moderate", "mild"] as const;
const SEVERITY_LABEL: Record<string, string> = {
    life_threatening: "Life-threatening",
    severe: "Severe",
    moderate: "Moderate",
    mild: "Mild",
};

const TITLE: Record<HealthFactKindOption, string> = {
    allergy: "Add allergy",
    condition: "Add condition",
    medication: "Add medication",
};

export default function HealthFactCommand({
    kind,
    childLabel,
    /** Facts a medication may be attached to — allergies and conditions already on the record. */
    relatable,
    running,
    error,
    onSubmit,
    onCancel,
}: {
    kind: HealthFactKindOption;
    childLabel: string;
    relatable: Array<{ id: string; label: string }>;
    running: boolean;
    error: string | null;
    onSubmit: (input: { payload: Record<string, unknown>; relatedFactId: string | null }) => void;
    onCancel: () => void;
}) {
    const [name, setName] = useState("");
    const [severity, setSeverity] = useState("");
    const [effect, setEffect] = useState("");
    const [care, setCare] = useState("");
    const [dosage, setDosage] = useState("");
    const [frequency, setFrequency] = useState("");
    const [asNeeded, setAsNeeded] = useState(false);
    const [storage, setStorage] = useState("");
    const [relatedFactId, setRelatedFactId] = useState("");

    const nameLabel =
        kind === "allergy" ? "Allergen"
        : kind === "condition" ? "Condition"
        : "Medication";

    const submit = () => {
        const payload: Record<string, unknown> =
            kind === "allergy" ?
                {
                    allergen: name,
                    severity: severity || null,
                    reaction: effect || null,
                    care_instructions: care || null,
                }
            : kind === "condition" ?
                {
                    condition: name,
                    severity: severity || null,
                    restrictions: effect || null,
                    care_instructions: care || null,
                }
            :   {
                    medication: name,
                    dosage: dosage || null,
                    frequency: asNeeded ? null : frequency || null,
                    as_needed: asNeeded,
                    administration_instructions: care || null,
                    storage_location: storage || null,
                };
        onSubmit({ payload, relatedFactId: relatedFactId || null });
    };

    return (
        <div className="alloy-os-addcharge-host">
            <UniversalCard
                title={TITLE[kind]}
                insight={childLabel}
                iconName="HeartPulse"
                tier="work"
                archetype="status"
                modalClass="command"
                density="expanded"
                gridSpan="row"
                data-universal-card-key="health_fact_command"
                footerAction={null}
            >
                <div className="alloy-os-addcharge">
                    <SectionHead ruled={false}>Fact</SectionHead>
                    <Field label={nameLabel} required>
                        <input
                            className="alloy-os-addcharge__input"
                            data-healthfact-name
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder={kind === "medication" ? "e.g. Albuterol inhaler" : "Required"}
                        />
                    </Field>

                    {kind === "medication" ? (
                        <>
                            <Field label="Dosage">
                                <input
                                    className="alloy-os-addcharge__input"
                                    data-healthfact-dosage
                                    value={dosage}
                                    onChange={(e) => setDosage(e.target.value)}
                                />
                            </Field>
                            <Field label="Frequency">
                                <input
                                    className="alloy-os-addcharge__input"
                                    data-healthfact-frequency
                                    value={asNeeded ? "" : frequency}
                                    disabled={asNeeded}
                                    onChange={(e) => setFrequency(e.target.value)}
                                    placeholder={asNeeded ? "Given as needed" : ""}
                                />
                            </Field>
                            <Field label="As needed">
                                <input
                                    type="checkbox"
                                    data-healthfact-asneeded
                                    checked={asNeeded}
                                    onChange={(e) => setAsNeeded(e.target.checked)}
                                />
                            </Field>
                            <Field label="Storage">
                                <input
                                    className="alloy-os-addcharge__input"
                                    data-healthfact-storage
                                    value={storage}
                                    onChange={(e) => setStorage(e.target.value)}
                                    placeholder="Where staff find it"
                                />
                            </Field>
                            {relatable.length ? (
                                <Field label="Treats">
                                    {/* The canonical join, so the summary can nest this medication
                                        under the need it supports instead of guessing. */}
                                    <select
                                        className="alloy-os-addcharge__select"
                                        data-healthfact-treats
                                        value={relatedFactId}
                                        onChange={(e) => setRelatedFactId(e.target.value)}
                                    >
                                        <option value="">Not linked</option>
                                        {relatable.map((r) => (
                                            <option key={r.id} value={r.id}>
                                                {r.label}
                                            </option>
                                        ))}
                                    </select>
                                </Field>
                            ) : null}
                        </>
                    ) : (
                        <>
                            <Field label="Severity">
                                {/* NEVER DEFAULTED. An unset severity is "not graded"; a silent
                                    default of mild on a life-threatening allergy is the kind of
                                    wrong that hurts a child. */}
                                <select
                                    className="alloy-os-addcharge__select"
                                    data-healthfact-severity
                                    value={severity}
                                    onChange={(e) => setSeverity(e.target.value)}
                                >
                                    <option value="">Not graded</option>
                                    {SEVERITIES.map((sv) => (
                                        <option key={sv} value={sv}>
                                            {SEVERITY_LABEL[sv]}
                                        </option>
                                    ))}
                                </select>
                            </Field>
                            <Field label={kind === "allergy" ? "Reaction" : "Restrictions"}>
                                <input
                                    className="alloy-os-addcharge__input"
                                    data-healthfact-effect
                                    value={effect}
                                    onChange={(e) => setEffect(e.target.value)}
                                />
                            </Field>
                        </>
                    )}

                    <Field label="What staff do">
                        <input
                            className="alloy-os-addcharge__input"
                            data-healthfact-care
                            value={care}
                            onChange={(e) => setCare(e.target.value)}
                            placeholder="The line an operator acts on"
                        />
                    </Field>

                    <p className="alloy-os-addcharge__draftnote">
                        Recorded as operator-asserted. Later corrections supersede this entry rather
                        than overwriting it.
                    </p>

                    {error ? (
                        <p className="alloy-os-addcharge__error" role="alert" data-healthfact-error>
                            {error}
                        </p>
                    ) : null}

                    <ActionRow>
                        <Action primary onClick={name.trim() && !running ? submit : undefined}>
                            {running ? "Saving…" : TITLE[kind]}
                        </Action>
                        <Action onClick={onCancel}>Cancel</Action>
                    </ActionRow>
                </div>
            </UniversalCard>
        </div>
    );
}

function Field({
    label,
    required,
    children,
}: {
    label: string;
    required?: boolean;
    children: React.ReactNode;
}) {
    return (
        <p className="alloy-os-addcharge__field">
            <span className="alloy-os-addcharge__field-label">
                {label}
                {required ? <span className="alloy-os-addcharge__req">required</span> : null}
            </span>
            <span className="alloy-os-addcharge__field-value">{children}</span>
        </p>
    );
}
