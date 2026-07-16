/**
 * M1 (Ledger Foundation) demonstration — resolver half.
 *
 * The frozen M1 Demo (Engineering Realization §4) requires that we "revise it
 * (re-plans) and correct it (unwinds)". Re-plan and unwind are DERIVED on read by
 * the Effective Expectation Resolver — they are never stored — so the demo has two
 * halves:
 *
 *   - DB half:       supabase/tests/operational_expectations/m1_demo.sql — the real
 *                    authoring acts, the rejections, the typed transitions, the
 *                    lineage, append-only preservation.
 *   - resolver half: this test — the re-plan / unwind / two-axis behavior, folded
 *                    from the REAL rows that script produced.
 *
 * `m1DemoLineage.fixture.json` is not hand-written: it is the verbatim capture of
 * the three rows the live-Postgres demo authored through the shipped
 * `author_operational_expectation` RPC (create → revision → correction on
 * room-infant-1). Folding the actual database output — rather than a hand-built
 * fixture — is what makes this M1 evidence rather than a restatement of the
 * Wave D unit tests: it proves the resolver's row contract still matches what the
 * shipped DDL and RPC actually emit.
 *
 * The lineage:
 *   create     valid_from 2026-08-01, max_children_per_staff 4   (authored first)
 *   revision   valid_from 2026-09-01, max_children_per_staff 3   (authored second)
 *   correction valid_from 2026-09-01, max_children_per_staff 5   (authored third)
 *
 * Adds no gate. This is evidence for the already-green G-Revision and the
 * authoring half of G-Correction.
 */
import { describe, expect, it } from "vitest";

import {
    resolveEffectiveExpectation,
    resolveEffectiveExpectations,
} from "@/lib/operationalExpectations/resolver/resolveEffectiveExpectation";
import type { ExpectationLedgerRow } from "@/lib/operationalExpectations/resolver/effectiveExpectationTypes";

import fixture from "./m1DemoLineage.fixture.json";

const ROWS = fixture as unknown as ExpectationLedgerRow[];

const CREATE = ROWS.find((r) => r.verb === "create")!;
const REVISION = ROWS.find((r) => r.transition_type === "revision")!;
const CORRECTION = ROWS.find((r) => r.transition_type === "correction")!;

const ORG = CREATE.org_id;
const ROOT = CREATE.lineage_root_id!;

function resolveAt(validTime: string, knownAt?: string | null) {
    return resolveEffectiveExpectation(ROWS, {
        orgId: ORG,
        lineageRootId: ROOT,
        asOf: { validTime, knownAt },
    });
}

/** The effective row id at a coordinate, or a non-resolved marker. */
function effectiveIdAt(validTime: string, knownAt?: string | null): string {
    const r = resolveAt(validTime, knownAt);
    return r.kind === "resolved" ? r.effective.effectiveExpectationId : r.kind;
}

describe("M1 demo — the captured live lineage", () => {
    it("is the real DB output: 3 acts, one root, distinct recorded times", () => {
        expect(ROWS).toHaveLength(3);
        expect(new Set(ROWS.map((r) => r.lineage_root_id))).toEqual(new Set([ROOT]));
        expect(CREATE.lineage_root_id).toBe(CREATE.id); // a create roots itself
        expect(REVISION.supersedes_expectation_id).toBe(CREATE.id);
        expect(CORRECTION.supersedes_expectation_id).toBe(REVISION.id);

        // Recorded time strictly advances — this is what makes as-known-at-T real.
        const times = ROWS.map((r) => Date.parse(r.authored_at));
        expect(new Set(times).size).toBe(3);
        expect(Date.parse(CREATE.authored_at)).toBeLessThan(Date.parse(REVISION.authored_at));
        expect(Date.parse(REVISION.authored_at)).toBeLessThan(Date.parse(CORRECTION.authored_at));
    });

    it("carries the frozen tuple facets the demo authored", () => {
        expect(CREATE.modality).toBe("required");
        expect(CREATE.subject_kind).toBe("room");
        expect(CREATE.authority_key).toBe("licensing:staffing-ratio");
        // G-Standing (authoring): the held-authority holder self-ratified.
        expect(CREATE.standing).toBe("binding");
    });
});

describe("M1 demo — revision RE-PLANS forward (G-Revision)", () => {
    it("the valid past is preserved: August still resolves to the original", () => {
        expect(effectiveIdAt("2026-08-15T00:00:00Z")).toBe(CREATE.id);
    });

    it("resolving before the revision's valid_from is start-exclusive", () => {
        // One millisecond before September the create is still effective.
        expect(effectiveIdAt("2026-08-31T23:59:59.999Z")).toBe(CREATE.id);
    });

    it("the predecessor's effective window is DERIVED, truncated at the revision", () => {
        const r = resolveAt("2026-08-15T00:00:00Z");
        expect(r.kind).toBe("resolved");
        if (r.kind !== "resolved") return;
        expect(r.effective.effectiveFrom).toBe(CREATE.valid_from);
        // Truncation is derived on read — the stored row was never reshaped.
        expect(r.effective.effectiveTo).toBe(REVISION.valid_from);
        expect(CREATE.valid_to).toBeNull(); // the STORED row is untouched
    });

    it("as known BEFORE the correction, September re-plans to the revision", () => {
        // knownAt between the revision and the correction: the re-plan stands.
        expect(effectiveIdAt("2026-09-15T00:00:00Z", REVISION.authored_at)).toBe(REVISION.id);
    });
});

describe("M1 demo — correction UNWINDS (authoring half of G-Correction)", () => {
    it("as of now, September resolves to the correction, not the revision", () => {
        expect(effectiveIdAt("2026-09-15T00:00:00Z")).toBe(CORRECTION.id);
    });

    it("the corrected row is treated as NEVER valid on the current-knowledge axis", () => {
        // The revision is effective at NO valid-time once the correction is known.
        for (const t of ["2026-09-01T00:00:00Z", "2026-09-15T00:00:00Z", "2027-01-01T00:00:00Z"]) {
            expect(effectiveIdAt(t)).not.toBe(REVISION.id);
        }
    });

    it("as-known-at-T reconstructs history: the revision still resolves (audit)", () => {
        // A reader positioned before the correction was authored must still see the
        // revision. A correction authored after T does not change an as-of-T answer.
        expect(effectiveIdAt("2026-09-15T00:00:00Z", REVISION.authored_at)).toBe(REVISION.id);
        expect(effectiveIdAt("2026-09-15T00:00:00Z", CORRECTION.authored_at)).toBe(CORRECTION.id);
    });

    it("correction does NOT re-plan: it does not truncate the create's past", () => {
        // Unwind is not re-plan — August is still the create either way, but the
        // September answer differs by transition type. This is the observable
        // Revision != Correction distinction on one real lineage.
        expect(effectiveIdAt("2026-08-15T00:00:00Z")).toBe(CREATE.id);
        expect(effectiveIdAt("2026-09-15T00:00:00Z", REVISION.authored_at)).toBe(REVISION.id);
        expect(effectiveIdAt("2026-09-15T00:00:00Z")).toBe(CORRECTION.id);
    });
});

describe("M1 demo — determinism and purity over the real rows", () => {
    it("is order-independent: shuffled input yields the same answer", () => {
        const shuffled = [ROWS[2], ROWS[0], ROWS[1]];
        const a = resolveEffectiveExpectation(ROWS, {
            orgId: ORG,
            lineageRootId: ROOT,
            asOf: { validTime: "2026-09-15T00:00:00Z" },
        });
        const b = resolveEffectiveExpectation(shuffled, {
            orgId: ORG,
            lineageRootId: ROOT,
            asOf: { validTime: "2026-09-15T00:00:00Z" },
        });
        expect(b).toEqual(a);
    });

    it("is idempotent: repeat evaluation is identical", () => {
        expect(resolveAt("2026-09-15T00:00:00Z")).toEqual(resolveAt("2026-09-15T00:00:00Z"));
    });

    it("isolates by org: a foreign org sees nothing", () => {
        const r = resolveEffectiveExpectation(ROWS, {
            orgId: "00000000-0000-0000-0000-000000000000",
            lineageRootId: ROOT,
            asOf: { validTime: "2026-09-15T00:00:00Z" },
        });
        expect(r.kind).toBe("none");
    });

    it("resolves the same lineage set-level (keyed by lineage root)", () => {
        const set = resolveEffectiveExpectations(ROWS, {
            orgId: ORG,
            asOf: { validTime: "2026-09-15T00:00:00Z" },
        });
        expect(set.size).toBe(1);
        const resolution = set.get(ROOT);
        expect(resolution?.kind).toBe("resolved");
        if (resolution?.kind !== "resolved") return;
        expect(resolution.effective.effectiveExpectationId).toBe(CORRECTION.id);
        expect(resolution.effective.lineagePath).toEqual([CREATE.id, REVISION.id, CORRECTION.id]);
    });
});
