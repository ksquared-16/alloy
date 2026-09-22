import { describe, expect, it } from "vitest";

/**
 * STAGE-2 MONOTONICITY — CONTRACT CANDIDATE (P0-7.6 first-order architecture, Part 13).
 *
 * NOT YET A BINDING PRODUCT GATE. The First-Order Work Unit Projection does not exist; this
 * specifies the rule its implementation must satisfy, and the checker is written here so the rule
 * is executable rather than prose. When the projection lands, this checker moves beside it and the
 * fixtures below are replaced by the real Stage-1/Stage-2 pair.
 *
 * THE RULE: Stage 2 may ADD detail. It may not CORRECT Stage 1.
 *
 * The distinction that makes this worth gating is the one the product contract already states:
 * UNKNOWN is not ZERO, not EMPTY, not SEEN. A Stage 1 that renders `0 emergency contacts` because
 * it has not looked is not "later corrected by enrichment" — it was false when it was shown, and
 * the operator may have acted on it. So a Stage-1 field is either an authoritative value or an
 * explicit UNKNOWN, and Stage 2 may only fill UNKNOWNs and add fields Stage 1 never claimed.
 */

type Unknown = { readonly state: "unknown" };
type Value = { readonly state: "value"; readonly value: unknown };
type Unavailable = { readonly state: "unavailable" };
type Forbidden = { readonly state: "forbidden" };
type Field = Unknown | Value | Unavailable | Forbidden;

const UNKNOWN: Unknown = { state: "unknown" };
const v = (value: unknown): Value => ({ state: "value", value });

type Violation = { field: string; reason: string };

/**
 * Returns the violations of Stage-2 monotonicity, empty when Stage 2 only added detail.
 *
 * Deliberately NOT a boolean: "it changed" is not actionable, and a repair needs to know which
 * field and which transition.
 */
export function stageTwoViolations(
    stage1: Readonly<Record<string, Field>>,
    stage2: Readonly<Record<string, Field>>,
): Violation[] {
    const out: Violation[] = [];
    for (const [field, before] of Object.entries(stage1)) {
        const after = stage2[field];
        if (after === undefined) {
            out.push({ field, reason: "Stage 2 dropped a field Stage 1 asserted" });
            continue;
        }
        if (before.state === "unknown") continue;            // filling an UNKNOWN is the point
        if (before.state === "value" && after.state === "value") {
            if (JSON.stringify(before.value) !== JSON.stringify(after.value)) {
                out.push({ field, reason: `Stage 2 corrected an authoritative value: ${JSON.stringify(before.value)} -> ${JSON.stringify(after.value)}` });
            }
            continue;
        }
        if (before.state !== after.state) {
            // unavailable -> value is a correction too: Stage 1 told the operator it could not
            // answer, and the frame was complete on that basis.
            out.push({ field, reason: `Stage 2 changed an asserted state: ${before.state} -> ${after.state}` });
        }
    }
    return out;
}

describe("Stage 2 adds detail; it does not correct Stage 1", () => {
    it("ADDING a field Stage 1 never claimed is allowed", () => {
        expect(stageTwoViolations({ due: v(0) }, { due: v(0), recentActivity: v(2) })).toEqual([]);
    });

    it("FILLING an explicit UNKNOWN is allowed — that is what UNKNOWN is for", () => {
        expect(stageTwoViolations({ emergencyContacts: UNKNOWN }, { emergencyContacts: v(3) })).toEqual([]);
    });

    it("CORRECTING an authoritative value is a violation", () => {
        const out = stageTwoViolations({ emergencyContacts: v(0) }, { emergencyContacts: v(3) });
        expect(out).toHaveLength(1);
        expect(out[0].reason).toContain("corrected an authoritative value");
    });

    it("THE SPECIFIC DEFECT THIS EXISTS TO PREVENT: rendering 0 for not-yet-looked", () => {
        // A Stage 1 that guesses 0 and a Stage 1 that says UNKNOWN look identical in a screenshot
        // and are opposite in contract. Only the second may be filled later.
        expect(stageTwoViolations({ emergencyContacts: v(0) }, { emergencyContacts: v(0) })).toEqual([]);
        expect(stageTwoViolations({ emergencyContacts: v(0) }, { emergencyContacts: v(1) })).toHaveLength(1);
        expect(stageTwoViolations({ emergencyContacts: UNKNOWN }, { emergencyContacts: v(0) })).toEqual([]);
    });

    it("UNAVAILABLE is an assertion too — Stage 2 may not quietly answer it", () => {
        const out = stageTwoViolations({ balance: { state: "unavailable" } }, { balance: v(100) });
        expect(out).toHaveLength(1);
        expect(out[0].reason).toContain("unavailable -> value");
    });

    it("FORBIDDEN may never become a value — that would leak past authorization", () => {
        const out = stageTwoViolations({ allergies: { state: "forbidden" } }, { allergies: v(["peanut"]) });
        expect(out).toHaveLength(1);
    });

    it("DROPPING an asserted field is a violation, not a simplification", () => {
        expect(stageTwoViolations({ due: v(0) }, {})).toHaveLength(1);
    });

    it("unchanged values and untouched unknowns are clean", () => {
        expect(stageTwoViolations(
            { a: v(1), b: UNKNOWN, c: { state: "unavailable" } },
            { a: v(1), b: UNKNOWN, c: { state: "unavailable" }, d: v("new") },
        )).toEqual([]);
    });
});
