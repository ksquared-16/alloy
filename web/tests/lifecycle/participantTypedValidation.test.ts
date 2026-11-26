/**
 * Typed input validation and intelligent clarification — the certification matrix.
 *
 * The product claim under test: **Participant Runtime cannot blindly accept a malformed or
 * implausible value and multiply it across every document.** The pipeline is
 *
 *   authored type → normalize → Forms' OWN validator → plausibility → accept | clarify | refuse
 *
 * and every arm of it is asserted here, including the two negatives that matter most: a suspicious
 * value never reaches `shared_values`, and a provider emitting a syntactically perfect but
 * impossible date changes nothing.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

import {
    disposeParticipantCandidate,
    validateCandidateValue,
} from "@/lib/enrollment/participantRuntime/validateParticipantCandidate";
import { normalizeParticipantValue } from "@/lib/enrollment/participantRuntime/normalizeParticipantValue";
import { assessDateOfBirthPlausibility } from "@/lib/enrollment/participantRuntime/participantValuePlausibility";
import {
    readPendingClarification,
    withPendingClarification,
    withoutPendingClarification,
} from "@/lib/enrollment/participantRuntime/pendingClarification";
import type { EnrollmentInformationNeed } from "@/lib/enrollment/informationNeeds/enrollmentInformationNeedsTypes";
import type { FormField } from "@/lib/forms/schema";
import type { ParticipantTurn } from "@/lib/enrollment/participantRuntime/participantTurnTypes";

const NOW = "2026-08-21T12:00:00.000Z";
const YEAR = 2026;

function need(over: Partial<EnrollmentInformationNeed> = {}, occ: Record<string, unknown> = {}): EnrollmentInformationNeed {
    return {
        identity: { key: "child:1:child_date_of_birth", shared_value_key: "child_date_of_birth", canonical_key: "child_date_of_birth", field_key: "child_dob", scope: "child", subject_id: "1", artifact_specific: false },
        scope: "child",
        subject_id: "1",
        state: "missing",
        occurrence_count: 1,
        occurrences: [{ requirement_id: "r", form_definition_id: "f", form_definition_version_id: "v", session_item_id: "s", form_field_id: "f_dob", label: "Child date of birth", required: true, field_type: "date", options: [], ...occ }],
        requirement_ids: ["r"],
        has_value: false,
        current_value: null,
        value_source: "none",
        requires_participant_action: true,
        ...over,
    } as unknown as EnrollmentInformationNeed;
}

const dateField = { id: "f_dob", type: "date", label: "Child date of birth" } as unknown as FormField;
const ctx = { nowIso: NOW };

const turn = (over: Partial<ParticipantTurn> = {}): ParticipantTurn =>
    ({ kind: "collect_missing_value", need: need(), proposed_value: null, prompt: "", resolves_occurrences: 1, ...over } as unknown as ParticipantTurn);

// ---------------------------------------------------------------------------
// DATE
// ---------------------------------------------------------------------------

describe("date", () => {
    it("accepts what the date picker submits", () => {
        expect(validateCandidateValue(need(), dateField, "2021-08-08", ctx)).toEqual({ ok: true, value: "2021-08-08" });
    });

    it("normalizes the way a parent actually types a date", () => {
        for (const spoken of ["Aug 8, 2021", "August 8, 2021", "8/8/2021", "08/08/2021"]) {
            expect(validateCandidateValue(need(), dateField, spoken, ctx), spoken).toEqual({ ok: true, value: "2021-08-08" });
        }
    });

    it("normalizes a two-digit year to the century a person means", () => {
        expect(validateCandidateValue(need(), dateField, "8/8/21", ctx)).toEqual({ ok: true, value: "2021-08-08" });
    });

    it("does NOT persist a suspicious year — it asks, and refuses to guess the correction", () => {
        const v = validateCandidateValue(need(), dateField, "8/8/20201", ctx);
        expect(v.ok).toBe(false);
        expect(v.ok === false && v.clarify).toBe(true);
        if (v.ok !== false || v.clarify !== true) throw new Error("expected a clarification");
        /**
         * Deliberately NO suggested correction.
         *
         * `20201` reads equally well as `2021` with a stray `0` or `2020` with a stray `1`. Offering
         * one would be inventing a date of birth on a coin flip, so the parent is asked to check.
         * "Do not invent corrections when confidence is low" outranks the nicer "did you mean…?".
         */
        expect(v.likely).toBeUndefined();
    });

    it("REFUSES an impossible calendar date rather than guessing at it", () => {
        for (const impossible of ["2021-02-29", "2021-02-31", "13/40/2021"]) {
            const v = validateCandidateValue(need(), dateField, impossible, ctx);
            expect(v.ok, impossible).toBe(false);
            // Nothing to clarify: no such day exists, and any correction would be invention.
            expect(v.ok === false && v.clarify, impossible).not.toBe(true);
        }
    });

    it("refuses a date of birth that has not happened yet", () => {
        const v = validateCandidateValue(need(), dateField, "2035-03-14", ctx);
        expect(v.ok).toBe(false);
        expect(v.ok === false && v.reason).toContain("future");
    });

    it("never invents a year the parent did not say", () => {
        // "August 21" is a day and a month. Supplying the current year would fabricate a birth date.
        const v = validateCandidateValue(need(), dateField, "August 21", ctx);
        expect(v.ok).toBe(false);
    });

    it("applies no age rule when the caller resolved no programme", () => {
        // A 40-year-old is not this module's business without a programme that says so.
        expect(assessDateOfBirthPlausibility({ iso: "1986-01-01", nowIso: NOW })).toEqual({ kind: "plausible" });
    });

    it("uses the PROGRAMME's own age range when one is supplied, and only clarifies", () => {
        const range = { minimum: { value: 2, unit: "years" as const }, maximum: { value: 5, unit: "years" as const } };
        const tooOld = assessDateOfBirthPlausibility({ iso: "1990-01-01", nowIso: NOW, ageRange: range });
        expect(tooOld.kind).toBe("clarify");
        expect(assessDateOfBirthPlausibility({ iso: "2022-01-01", nowIso: NOW, ageRange: range })).toEqual({ kind: "plausible" });
    });
});

// ---------------------------------------------------------------------------
// EMAIL · PHONE · NUMBER · ENUM
// ---------------------------------------------------------------------------

describe("other authored types", () => {
    const emailNeed = need({ identity: { key: "k", shared_value_key: "guardian_email", canonical_key: "guardian_email", field_key: "guardian_email", scope: "child", subject_id: "1", artifact_specific: false } } as never, { field_type: "text", form_field_id: "f_email" });
    const emailField = { id: "f_email", type: "text", label: "Email", validate: { pattern: "^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$" } } as unknown as FormField;

    it("accepts a valid email and refuses a malformed one", () => {
        expect(validateCandidateValue(emailNeed, emailField, "Parent@Example.com ", ctx)).toEqual({ ok: true, value: "parent@example.com" });
        const bad = validateCandidateValue(emailNeed, emailField, "parent@@example", ctx);
        expect(bad.ok).toBe(false);
    });

    const phoneNeed = need({ identity: { key: "k", shared_value_key: "guardian_phone", canonical_key: "guardian_phone", field_key: "guardian_phone", scope: "child", subject_id: "1", artifact_specific: false } } as never, { field_type: "text", form_field_id: "f_phone" });
    const phoneField = { id: "f_phone", type: "text", label: "Phone", validate: { pattern: "^\\d{10}$" } } as unknown as FormField;

    it("normalizes a phone number a parent formatted, and refuses one that cannot be", () => {
        expect(validateCandidateValue(phoneNeed, phoneField, "(415) 555-0134", ctx)).toEqual({ ok: true, value: "4155550134" });
        expect(validateCandidateValue(phoneNeed, phoneField, "12", ctx).ok).toBe(false);
    });

    const numberNeed = need({}, { field_type: "number", form_field_id: "f_n" });
    const numberField = { id: "f_n", type: "number", label: "Siblings", validate: { min: 0, max: 10 } } as unknown as FormField;

    it("canonicalizes a number and honours the AUTHORED min/max", () => {
        expect(validateCandidateValue(numberNeed, numberField, " 3 ", ctx)).toEqual({ ok: true, value: 3 });
        // The bound is the Form's, enforced by the Form's validator — not restated here.
        expect(validateCandidateValue(numberNeed, numberField, "99", ctx).ok).toBe(false);
        expect(validateCandidateValue(numberNeed, numberField, "-1", ctx).ok).toBe(false);
    });

    const enumNeed = need({}, { field_type: "select", form_field_id: "f_s", options: ["Morning", "Afternoon"] });
    const enumField = { id: "f_s", type: "select", label: "Session", static_options: [{ value: "Morning" }, { value: "Afternoon" }] } as unknown as FormField;

    it("persists ONLY an authored option, however the parent phrased it", () => {
        // Casing and spacing are forgiven; the stored value is always the authored one.
        expect(validateCandidateValue(enumNeed, enumField, "morning", ctx)).toEqual({ ok: true, value: "Morning" });
        // A synonym the provider might return is still not an authored option.
        expect(validateCandidateValue(enumNeed, enumField, "AM", ctx).ok).toBe(false);
    });

    it("leaves optional free text alone", () => {
        const textNeed = need({}, { field_type: "text", form_field_id: "f_a", label: "Allergies" });
        const textField = { id: "f_a", type: "text", label: "Allergies" } as unknown as FormField;
        expect(validateCandidateValue(textNeed, textField, "No known allergies", ctx)).toEqual({ ok: true, value: "No known allergies" });
    });
});

// ---------------------------------------------------------------------------
// AI BOUNDARY · CONFLICT · NON-PERSISTENCE
// ---------------------------------------------------------------------------

describe("the provider may produce a candidate; it may not decide validity", () => {
    it("a syntactically perfect but IMPOSSIBLE date from the provider changes nothing", () => {
        /**
         * The required negative. Trust may have executed successfully and returned a well-formed
         * `corrected_value`; Participant Runtime still refuses, and nothing is written.
         */
        const d = disposeParticipantCandidate({
            turn: turn(),
            candidate: { kind: "corrected_value", value: "2035-03-14" },
            field: dateField,
            context: ctx,
        });
        expect(d.action).toBe("refused");
        expect(d.action === "refused" && d.reason).toContain("future");
    });

    it("a suspicious provider value becomes a QUESTION, never a write", () => {
        const d = disposeParticipantCandidate({
            turn: turn(),
            candidate: { kind: "corrected_value", value: "8/8/20201" },
            field: dateField,
            context: ctx,
        });
        expect(d.action).toBe("clarify");
        expect(d.action === "clarify" && d.question).toContain("check it");
        // No fabricated correction, and no database string quoted back at a parent.
        expect(d.action === "clarify" && d.question).not.toContain("Did you mean");
        expect(d.action === "clarify" && d.question).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    });

    it("a casual value that disagrees with the record ASKS instead of overwriting", () => {
        const confirmTurn = turn({ kind: "confirm_known_value", proposed_value: "2021-08-08" } as never);
        const d = disposeParticipantCandidate({
            turn: confirmTurn,
            candidate: { kind: "corrected_value", value: "2011-08-08" },
            field: dateField,
            context: ctx,
            correctionFlow: false,
        });
        expect(d.action).toBe("clarify");
        expect(d.action === "clarify" && d.question).toContain("Aug 8, 2021");
        expect(d.action === "clarify" && d.question).toContain("Aug 8, 2011");
    });

    it("but an EXPLICIT correction through the authored control writes", () => {
        const confirmTurn = turn({ kind: "confirm_known_value", proposed_value: "2021-08-08" } as never);
        const d = disposeParticipantCandidate({
            turn: confirmTurn,
            candidate: { kind: "corrected_value", value: "2011-08-08" },
            field: dateField,
            context: ctx,
            correctionFlow: true,
        });
        expect(d.action).toBe("write_shared_value");
    });
});

describe("a question is durable, and is never the value", () => {
    it("records the pending value in METADATA and returns it only to the server", () => {
        const meta = withPendingClarification({ metadata: {}, needKey: "n", value: "2021-08-08", question: "Did you mean…?", askedAtIso: NOW });
        expect(readPendingClarification(meta, "n")?.value).toBe("2021-08-08");
        // Not a shared value, and not under any key a document renders from.
        expect(Object.keys(meta)).toEqual(["enrollment_pending_clarification_v1"]);
    });

    it("is bounded to its own need and is retired on resolution", () => {
        const meta = withPendingClarification({ metadata: {}, needKey: "n", value: "x", question: "q", askedAtIso: NOW });
        expect(readPendingClarification(meta, "other")).toBeNull();
        expect(readPendingClarification(withoutPendingClarification(meta, "n"), "n")).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// DOCUMENT SAFETY · REUSE
// ---------------------------------------------------------------------------

describe("bad data cannot reach the paperwork", () => {
    const source = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

    it("the write path excludes clarify explicitly", () => {
        // A suspicious value must not touch `shared_values`, which is what every document renders
        // from. This is the one guard that makes "no PDF change" true.
        const apply = source("lib/enrollment/participantRuntime/applyParticipantTurnResponse.ts");
        expect(apply).toContain('disposition.action !== "clarify"');
    });

    it("delegates structure to Forms' own validator rather than restating it", () => {
        const v = source("lib/enrollment/participantRuntime/validateParticipantCandidate.ts");
        expect(v).toContain("validateScalarValue");
        // The authored rules stay in one place.
        expect(v).not.toContain("min_length !==");
        expect(v).not.toContain("new RegExp(");
    });

    it("borrows the platform date parser instead of adding another", () => {
        const n = source("lib/enrollment/participantRuntime/normalizeParticipantValue.ts");
        expect(n).toContain("parsePresentationDateInput");
    });

    it("takes programme age rules from their owner, and hardcodes no age band", () => {
        const p = source("lib/enrollment/participantRuntime/participantValuePlausibility.ts");
        expect(p).toContain("programAgeRange");
        for (const term of ["preschool", "toddler", "infant"]) {
            expect(p.toLowerCase()).not.toContain(term);
        }
    });

    it("speaks like a specialist, never like a schema", () => {
        const v = validateCandidateValue(need(), dateField, "2021-02-31", ctx);
        expect(v.ok).toBe(false);
        const reason = v.ok === false ? v.reason : "";
        expect(reason).not.toMatch(/INVALID|_[A-Z]|Expected |ZodError/);
        expect(reason).toMatch(/date/i);
    });
});

// ---------------------------------------------------------------------------
// NORMALIZATION IS NOT INVENTION
// ---------------------------------------------------------------------------

describe("normalization re-shapes; it never invents", () => {
    it("leaves a value it cannot read exactly as given", () => {
        const n = normalizeParticipantValue({ controlType: "date", raw: "sometime last spring", referenceYear: YEAR });
        expect(n).toEqual({ kind: "unchanged", value: "sometime last spring" });
    });

    it("does not quietly round a five-digit year into a plausible one", () => {
        const n = normalizeParticipantValue({ controlType: "date", raw: "8/8/20201", referenceYear: YEAR });
        expect(n.kind).toBe("suspicious");
    });

    it("cannot turn an unauthored word into an authored option", () => {
        const n = normalizeParticipantValue({ controlType: "select", raw: "AM", allowedOptions: ["Morning"], referenceYear: YEAR });
        expect(n).toEqual({ kind: "unchanged", value: "AM" });
    });
});
