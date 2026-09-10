/**
 * Matched Records presentation (§4).
 *
 * Turns the recommendation + submitted values into the human-language records the operator
 * actually cares about — Parent / Child / the configured business object — instead of the
 * taxonomy/system chips ("CRM · Person · child"). Honest by construction: it only states a match
 * basis the engine actually produced; children (which the person-spine recommendation does not
 * match on) are presented as new records, never a fabricated "possible match".
 */

import type { IntakeRecommendation } from "@/lib/forms/intake/resolveIntakeIdentity";
import type { OperationalIntentKey } from "@/lib/forms/operationalIntentTemplates";
import { decisionNounForIntent } from "@/lib/pos/decisionPresentation";
import { formatDisplayDate } from "@/lib/presentation/presentationDateFormat";

export type MatchedRecordTone = "match" | "new" | "review";

export interface MatchedRecordCard {
    role: "parent" | "child" | "business_object";
    /** Operator-facing record kind, e.g. "Parent", "Child", "Enrollment lead". */
    title: string;
    /** Primary name line, when known. */
    name: string | null;
    /** Supporting detail lines (email, phone, DOB …). */
    details: string[];
    /** One line stating the match/creation basis. */
    basis: string;
    basisTone: MatchedRecordTone;
}

export interface SubmittedValue {
    label: string;
    value: string | null;
}

function joinName(first: string | null | undefined, last: string | null | undefined): string | null {
    const n = [first, last].filter(Boolean).join(" ").trim();
    return n || null;
}

function findValue(values: SubmittedValue[], ...needles: string[]): string | null {
    for (const v of values) {
        const l = v.label.toLowerCase();
        if (needles.every((n) => l.includes(n)) && v.value != null && String(v.value).trim()) {
            return String(v.value).trim();
        }
    }
    return null;
}

function formatDob(raw: string | null): string | null {
    if (!raw) return null;
    // Canonical display date (doctrine: typography-and-presentation-doctrine.md) — "Born May 10, 2022",
    // never ISO. The formatter parses a bare YYYY-MM-DD as a UTC calendar date (no day-shift).
    const display = formatDisplayDate(raw.trim());
    return display ? `Born ${display}` : raw;
}

function parentBasis(rec: IntakeRecommendation): { basis: string; tone: MatchedRecordTone } {
    if (rec.decision === "link") {
        if (rec.matchedOn.includes("email")) return { basis: "Matched by exact email", tone: "match" };
        if (rec.matchedOn.includes("phone")) return { basis: "Matched by exact phone number", tone: "match" };
        return { basis: "Matched to an existing record", tone: "match" };
    }
    if (rec.decision === "route") return { basis: "Needs review before linking", tone: "review" };
    return { basis: "New parent record", tone: "new" };
}

export function buildMatchedRecords(input: {
    recommendation: IntakeRecommendation;
    intent: OperationalIntentKey | null | undefined;
    submitted: SubmittedValue[];
    /** The child this paperwork was sent for, when the session named one. */
    authoritativeSubject?: { displayName: string | null; dob: string | null } | null;
}): MatchedRecordCard[] {
    const cards: MatchedRecordCard[] = [];
    const rec = input.recommendation;

    // Parent — from the resolved person spine.
    const p = rec.proposed.person;
    const parentName = joinName(p.firstName, p.lastName);
    if (parentName || p.email || p.phone) {
        const { basis, tone } = parentBasis(rec);
        cards.push({
            role: "parent",
            title: "Parent",
            name: parentName,
            details: [p.email, p.phone].filter(Boolean) as string[],
            basis,
            basisTone: tone,
        });
    }

    /*
     * Child.
     *
     * The person-spine recommendation does not match children, so when nothing else is known this
     * is honestly presented as a NEW record rather than a fabricated match.
     *
     * But "nothing else is known" stopped being true. A session launched deliberately against an
     * existing child carries that child on the submission itself, and presenting it as a new record
     * anyway told the operator that approving would CREATE a second Pathb Certopp. That is not a
     * presentation nicety — it is the duplicate the operator would have made. When the subject is
     * authoritative, the card states the existing record, and its name comes from the RECORD rather
     * than from the answers, so a returned answer can never rename the child it matched.
     */
    const subject = input.authoritativeSubject ?? null;
    const childName = subject
        ? subject.displayName
        : joinName(findValue(input.submitted, "child", "first"), findValue(input.submitted, "child", "last"));
    const childDob = subject
        ? formatDob(subject.dob)
        : formatDob(findValue(input.submitted, "child", "birth") ?? findValue(input.submitted, "child", "dob"));
    if (childName || childDob) {
        cards.push({
            role: "child",
            title: "Child",
            name: childName,
            details: [childDob].filter(Boolean) as string[],
            basis: subject ? "Existing child record — this paperwork was sent for them" : "New child record",
            basisTone: subject ? "match" : "new",
        });
    }

    // The configured business object (enrollment lead / waitlist opportunity …).
    const noun = decisionNounForIntent(input.intent);
    const nounTitle = noun.replace(/^\w/, (c) => c.toUpperCase());
    const willBe =
        rec.decision === "link"
            ? `Will be linked after approval`
            : rec.decision === "route"
              ? `Held for review`
              : `Will be created after approval`;
    cards.push({
        role: "business_object",
        title: nounTitle,
        name: null,
        details: ["Lead stage"],
        basis: willBe,
        basisTone: rec.decision === "route" ? "review" : "new",
    });

    return cards;
}
