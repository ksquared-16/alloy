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

    // Child — from submitted values (the person-spine recommendation does not match children,
    // so this is honestly presented as a new record, not a fabricated match).
    const childName = joinName(
        findValue(input.submitted, "child", "first"),
        findValue(input.submitted, "child", "last")
    );
    const childDob = formatDob(findValue(input.submitted, "child", "birth") ?? findValue(input.submitted, "child", "dob"));
    if (childName || childDob) {
        cards.push({
            role: "child",
            title: "Child",
            name: childName,
            details: [childDob].filter(Boolean) as string[],
            basis: "New child record",
            basisTone: "new",
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
