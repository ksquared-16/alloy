/**
 * LAW 39 — AN IDENTITY MIGRATION MAY NOT MUTATE NON-IDENTITY BUSINESS FACTS.
 *
 * ── WHY THIS SUITE EXISTS, AND WHY IT IS MULTI-ROW ──
 *
 * Removing the cohort from the candidate key made every existing row miss on seed key AT ONCE. The
 * migration move wrote the cohort as well as the key, so one Work View read rewrote 15 candidates'
 * `program_room_cohort_key` — mostly to `unknown_program_room` — and re-sectioned a live waitlist
 * from 12/1/2/1/1 to 2/14/1.
 *
 * A single-row test would have passed the whole way through: the move looks correct on one candidate
 * whose derived cohort happens to match. **A key-format migration affects every matching row
 * simultaneously, so certification has to run a heterogeneous SET** — different cohorts, an
 * unresolved cohort, a pinned row, an overridden row — and assert that nothing but identity moved.
 */
import { describe, expect, it } from "vitest";

import { movePlacementCandidateToDerivedCohort } from "@/lib/orchestration/placement/placementCandidateSubjectUniqueness";

type Row = Record<string, unknown>;

/** Heterogeneous fixture — the shapes a real tenant holds at migration time. */
function fixture(): Row[] {
    const mk = (id: string, cohort: string, label: string, extra: Row = {}): Row => ({
        id,
        org_id: "org",
        opportunity_id: "opp-1",
        customer_member_id: `member-${id}`,
        program_room_cohort_key: cohort,
        program_room_group_label: label,
        wait_since: "2026-08-07T20:05:50.730Z",
        seed_key: `pc_v1_pi:opp-1:member-${id}:${cohort}`,
        status: "active",
        metadata: { cohort_resolution: { program_room_cohort_key: cohort, program_room_group_label: label }, history: ["seeded"] },
        ...extra,
    });
    return [
        mk("infant", "infant_0_18_months", "Infant — 0–18 months"),
        mk("toddler", "toddler_2_3_years", "Toddler — 2–3 years"),
        mk("prek", "pre_k_4_5_years", "Pre-K — 4–5 years"),
        mk("preschool", "preschool_3_4_years", "Preschool — 3–4 years"),
        mk("schoolage", "school_age_5_years", "School Age — 5+ years"),
        mk("unknown", "unknown_program_room", "Program / room not specified"),
        mk("pinned", "infant_0_18_months", "Infant — 0–18 months", { pin: { pin_ordinal: 1 } }),
        mk("overridden", "toddler_2_3_years", "Toddler — 2–3 years", { override: { kind: "tier_boost" } }),
    ];
}

function stubSupabase(rows: Row[]) {
    return {
        from() {
            let filtered = [...rows];
            let patch: Row | null = null;
            const chain: Record<string, unknown> = {
                select() { return chain; },
                update(p: Row) { patch = p; return chain; },
                eq(col: string, val: unknown) { filtered = filtered.filter((r) => r[col] === val); return chain; },
                in(col: string, vals: unknown[]) { filtered = filtered.filter((r) => vals.includes(r[col] as never)); return chain; },
                then(resolve: (v: { data: Row[]; error: null }) => unknown) {
                    if (patch) for (const r of filtered) Object.assign(r, patch);
                    return Promise.resolve({ data: filtered, error: null }).then(resolve);
                },
            };
            return chain;
        },
    } as unknown as Parameters<typeof movePlacementCandidateToDerivedCohort>[0];
}

const NON_IDENTITY = [
    "program_room_cohort_key",
    "program_room_group_label",
    "wait_since",
    "status",
    "metadata",
    "pin",
    "override",
    "opportunity_id",
    "customer_member_id",
] as const;

describe("identity migration — old cohort-bearing key to stable subject key", () => {
    it("migrates EVERY row's key and mutates no business fact on any of them", async () => {
        const rows = fixture();
        const before = structuredClone(rows);
        const db = stubSupabase(rows);

        // The real migration shape: one move per row, all in one pass.
        for (const r of rows) {
            const stableKey = `pc_v2_subject:opp-1:${String(r.customer_member_id)}`;
            const ok = await movePlacementCandidateToDerivedCohort(db, {
                orgId: "org",
                candidateId: String(r.id),
                seedKey: stableKey,
                // Deliberately passed a DIFFERENT cohort than the row holds — this is exactly what the
                // ensure pass computed during the regression. The move must ignore it entirely.
                programRoomCohortKey: "unknown_program_room",
                programRoomGroupLabel: "Program / room not specified",
            });
            expect(ok).toBe(true);
        }

        for (let i = 0; i < rows.length; i += 1) {
            const a = rows[i]!;
            const b = before[i]!;
            // The one permitted identity change.
            expect(a.seed_key).toBe(`pc_v2_subject:opp-1:${String(b.customer_member_id)}`);
            expect(a.seed_key).not.toBe(b.seed_key);
            expect(a.id).toBe(b.id);
            // Everything else byte-identical.
            for (const field of NON_IDENTITY) {
                expect(
                    JSON.stringify(a[field]),
                    `${String(b.id)}: ${field} changed during identity migration`,
                ).toBe(JSON.stringify(b[field]));
            }
        }
    });

    it("a pinned row keeps its pin and its cohort", async () => {
        const rows = fixture();
        const pinned = rows.find((r) => r.id === "pinned")!;
        const db = stubSupabase(rows);
        await movePlacementCandidateToDerivedCohort(db, {
            orgId: "org", candidateId: "pinned", seedKey: "pc_v2_subject:opp-1:member-pinned",
            programRoomCohortKey: "unknown_program_room", programRoomGroupLabel: "wrong",
        });
        expect(pinned.pin).toEqual({ pin_ordinal: 1 });
        expect(pinned.program_room_cohort_key).toBe("infant_0_18_months");
        expect(pinned.program_room_group_label).toBe("Infant — 0–18 months");
    });

    it("an already-unresolved cohort is not 'repaired' by the migration either", async () => {
        // The migration must be inert on business facts even when they look wrong.
        const rows = fixture();
        const unknown = rows.find((r) => r.id === "unknown")!;
        const db = stubSupabase(rows);
        await movePlacementCandidateToDerivedCohort(db, {
            orgId: "org", candidateId: "unknown", seedKey: "pc_v2_subject:opp-1:member-unknown",
            programRoomCohortKey: "infant_0_18_months", programRoomGroupLabel: "Infant — 0–18 months",
        });
        expect(unknown.program_room_cohort_key).toBe("unknown_program_room");
    });
});

describe("no business-fact repair reachable from a read path", () => {
    it("the Work View ensure path does not call duplicate repair or its rollback", async () => {
        const { readFileSync } = await import("node:fs");
        const { resolve } = await import("node:path");
        const src = readFileSync(
            resolve(__dirname, "../../lib/orchestration/placement/placementCandidateLifecycleHook.ts"),
            "utf8",
        );
        // Referenced in prose only; never invoked from this module.
        expect(src).not.toMatch(/await\s+retireDuplicateActiveCandidates\(/);
        expect(src).not.toMatch(/await\s+revertDuplicateRepair\(/);
    });
});
