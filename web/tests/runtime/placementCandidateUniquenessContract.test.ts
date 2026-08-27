/**
 * PLACEMENT CANDIDATE UNIQUENESS — one active canonical candidate per semantic subject.
 *
 * The defect these guard: every creation path deduped on `seed_key`, and the seed key embeds the
 * cohort (`pc_v1_pi:{opp}:{member}:{cohort}`). A cohort key change therefore produced a key the check
 * had never seen, so the path inserted a SECOND active candidate for the same child. Certified on
 * Firefly: Wrigley, PassA and Lennon each had two, differing only by cohort — 20 candidates, 17 rows.
 *
 * Only one of a pair projects, so the duplicate is invisible until something attaches to it. PassA's
 * operator pin landed on the candidate that does NOT project, which is why that pin could never have
 * had an effect no matter how the ranking was written.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
    loadActiveCandidatesBySubject,
    placementCandidateSubjectKey,
    retireDuplicateActiveCandidates,
} from "@/lib/orchestration/placement/placementCandidateSubjectUniqueness";

type Row = Record<string, unknown>;

/** Minimal chainable stub over the two tables these helpers touch. */
function stubSupabase(tables: { candidates: Row[]; overrides: Row[] }) {
    const writes: Array<{ table: string; patch: Row; ids: string[] }> = [];
    const api = {
        writes,
        from(table: string) {
            const rows = table === "placement_candidates" ? tables.candidates : tables.overrides;
            let filtered = [...rows];
            let patch: Row | null = null;
            const chain: Record<string, unknown> = {
                select() { return chain; },
                update(p: Row) { patch = p; return chain; },
                eq(col: string, val: unknown) {
                    if (patch && col === "id") { filtered = filtered.filter((r) => r.id === val); return chain; }
                    filtered = filtered.filter((r) => r[col] === val);
                    return chain;
                },
                in(col: string, vals: unknown[]) {
                    filtered = filtered.filter((r) => vals.includes(r[col] as never));
                    return chain;
                },
                then(resolve: (v: { data: Row[]; error: null }) => unknown) {
                    if (patch) {
                        const ids = filtered.map((r) => String(r.id));
                        writes.push({ table, patch, ids });
                        for (const r of filtered) Object.assign(r, patch);
                    }
                    return Promise.resolve({ data: filtered, error: null }).then(resolve);
                },
            };
            return chain;
        },
    };
    return api as unknown as Parameters<typeof loadActiveCandidatesBySubject>[0] & { writes: typeof writes };
}

const OPP = "opp-1";
const MEMBER = "member-1";
const SUBJECT = placementCandidateSubjectKey({ opportunityId: OPP, customerMemberId: MEMBER });

function candidate(id: string, cohort: string, createdAt: string): Row {
    return {
        id, org_id: "org", opportunity_id: OPP, customer_member_id: MEMBER,
        program_room_cohort_key: cohort, created_at: createdAt, metadata: {},
        is_synthetic_fallback: false, status: "active",
    };
}

describe("subject uniqueness", () => {
    it("finds an existing active candidate regardless of its cohort key", async () => {
        // This is the lookup that a seed-key-only check could never perform.
        const db = stubSupabase({ candidates: [candidate("c1", "infant", "2026-08-07")], overrides: [] });
        const map = await loadActiveCandidatesBySubject(db, { orgId: "org", opportunityIds: [OPP] });
        expect(map.get(SUBJECT)?.id).toBe("c1");
    });

    it("ignores synthetic fallback candidates — they have no member subject", async () => {
        const synth = { ...candidate("s1", "infant", "2026-08-07"), is_synthetic_fallback: true, customer_member_id: null };
        const db = stubSupabase({ candidates: [synth], overrides: [] });
        const map = await loadActiveCandidatesBySubject(db, { orgId: "org", opportunityIds: [OPP] });
        expect(map.size).toBe(0);
    });
});

describe("duplicate repair", () => {
    it("keeps the candidate matching the CURRENTLY derived cohort and retires the rival", async () => {
        const candidates = [
            candidate("stale", "infant", "2026-08-07"),
            candidate("live", "infant_0_18_months", "2026-08-08"),
        ];
        const db = stubSupabase({ candidates, overrides: [] });
        const out = await retireDuplicateActiveCandidates(db, {
            orgId: "org",
            opportunityIds: [OPP],
            survivorBySubject: new Map([[SUBJECT, "live"]]),
        });
        expect(out.duplicates_found).toBe(1);
        expect(out.retired).toBe(1);
        expect(candidates.find((c) => c.id === "live")!.status).toBe("active");
        const retired = candidates.find((c) => c.id === "stale")!;
        expect(retired.status).toBe("withdrawn");
        expect((retired.metadata as Row).superseded_by_placement_candidate_id).toBe("live");
    });

    it("migrates an active override off the retired candidate — a pin is a decision, not debris", async () => {
        // PassA's real shape: the pin sat on the candidate that never projected.
        const candidates = [
            candidate("keep", "infant", "2026-08-07"),
            candidate("drop", "infant_0_18_months", "2026-08-08"),
        ];
        const overrides = [{ id: "ov1", org_id: "org", placement_candidate_id: "drop", is_active: true }];
        const db = stubSupabase({ candidates, overrides });
        const out = await retireDuplicateActiveCandidates(db, {
            orgId: "org",
            opportunityIds: [OPP],
            survivorBySubject: new Map([[SUBJECT, "keep"]]),
        });
        expect(out.overrides_migrated).toBe(1);
        expect(overrides[0]!.placement_candidate_id).toBe("keep");
        expect(candidates.find((c) => c.id === "drop")!.status).toBe("withdrawn");
    });

    it("REFUSES to guess when no survivor is named — an implicit default is the contested rule", async () => {
        /*
         * The original version fell back to "earliest" here. That default retired the candidate the
         * projection was actually resolving, and the next pass reinstated it and retired the other —
         * the oscillation that damaged a live tenant. There is no default any more.
         */
        const candidates = [
            candidate("older", "toddler", "2026-08-01"),
            candidate("newer", "toddler_2_3_years", "2026-08-09"),
        ];
        const db = stubSupabase({ candidates, overrides: [] });
        const out = await retireDuplicateActiveCandidates(db, { orgId: "org", opportunityIds: [OPP] });
        expect(out.skipped_no_survivor_decision).toBe(1);
        expect(out.retired).toBe(0);
        expect(candidates.every((c) => c.status === "active")).toBe(true);
    });

    it("a subject with one candidate is untouched — repair is idempotent", async () => {
        const candidates = [candidate("only", "infant", "2026-08-07")];
        const db = stubSupabase({ candidates, overrides: [] });
        const out = await retireDuplicateActiveCandidates(db, { orgId: "org", opportunityIds: [OPP] });
        expect(out.duplicates_found).toBe(0);
        expect(out.retired).toBe(0);
        expect(candidates[0]!.status).toBe("active");
    });
});

describe("the creation paths consult the subject, not only the seed key", () => {
    it("all three ensure paths reconcile a cohort transition instead of inserting", () => {
        const src = readFileSync(resolve(__dirname, "../../lib/orchestration/placement/placementCandidateLifecycleHook.ts"), "utf8");
        // One reconcile per creation path; a new path that only checks seed_key reintroduces the bug.
        expect(src.match(/cohort_transition_reconciled/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
        expect(src).toContain("loadActiveCandidatesBySubject");
        expect(src).toContain("retireDuplicateActiveCandidates");
        // A failed move must not fall through to the insert it exists to prevent.
        expect(src).toContain("cohort_transition_move_failed");
    });
});
