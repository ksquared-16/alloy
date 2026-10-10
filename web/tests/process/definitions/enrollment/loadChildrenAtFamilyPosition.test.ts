/**
 * E2E-12 — a child linked to the lead with no open Enrollment track sits at the family's position.
 */
import { describe, expect, it, vi } from "vitest";

import {
    childrenAtFamilyPositionForMission,
    loadChildrenAtFamilyPosition,
} from "@/lib/process/definitions/enrollment/loadChildrenAtFamilyPosition";

const OPP = "opp-1";
const LINKS = [
    { id: "ocm-alpha", customer_member_id: "cm-alpha" },
    { id: "ocm-bravo", customer_member_id: "cm-bravo" },
];

function fakeSupabase(tracks: Array<{ subject_id: string; context_id: string }>) {
    const calls: Array<{ table: string; filters: Record<string, unknown> }> = [];
    return {
        calls,
        client: {
            from(table: string) {
                const filters: Record<string, unknown> = {};
                const chain: Record<string, unknown> = {
                    select: () => chain,
                    eq: (c: string, v: unknown) => ((filters[c] = v), chain),
                    in: (c: string, v: unknown) => ((filters[`in:${c}`] = v), chain),
                    is: (c: string, v: unknown) => ((filters[`is:${c}`] = v), chain),
                    then: (resolve: (r: unknown) => void) => {
                        calls.push({ table, filters });
                        resolve({ data: table === "opportunity_customer_members" ? LINKS : tracks, error: null });
                    },
                };
                return chain;
            },
        } as never,
    };
}

describe("loadChildrenAtFamilyPosition", () => {
    it("counts linked children with no open Enrollment track", async () => {
        const f = fakeSupabase([{ subject_id: "cm-alpha", context_id: "ocm-alpha" }]);
        expect(await loadChildrenAtFamilyPosition({ supabase: f.client, orgId: "org", opportunityId: OPP })).toBe(1);
        const pi = f.calls.find((c) => c.table === "process_instances")!;
        expect(pi.filters["subject_type"]).toBe("child");
        expect(pi.filters["is:close_reason_key"]).toBeNull();
        expect(pi.filters["in:context_id"]).toEqual([OPP, "ocm-alpha", "ocm-bravo"]);
    });

    it("is zero when every linked child has crossed onto its own track", async () => {
        const f = fakeSupabase([
            { subject_id: "cm-alpha", context_id: "ocm-alpha" },
            { subject_id: "cm-bravo", context_id: "ocm-bravo" },
        ]);
        expect(await loadChildrenAtFamilyPosition({ supabase: f.client, orgId: "org", opportunityId: OPP })).toBe(0);
    });
});

describe("childrenAtFamilyPositionForMission — reads only in the ambiguous case", () => {
    const ask = (tracked: string[], f = fakeSupabase([])) =>
        childrenAtFamilyPositionForMission({ supabase: f.client, orgId: "org", opportunityId: OPP, contextStageKey: "lead", trackedParticipantStageKeys: tracked }).then((n) => ({ n, f }));

    it("no tracks → context stage already wins; no read", async () => {
        const { n, f } = await ask([]);
        expect(n).toBe(0);
        expect(f.calls).toHaveLength(0);
    });
    it("a track still at the family stage → nothing to decide; no read", async () => {
        const { n, f } = await ask(["lead", "waitlist"]);
        expect(n).toBe(0);
        expect(f.calls).toHaveLength(0);
    });
    it("every track has left the family stage → reads, and finds the untracked sibling", async () => {
        const { n, f } = await ask(["waitlist"], fakeSupabase([{ subject_id: "cm-alpha", context_id: "ocm-alpha" }]));
        expect(n).toBe(1);
        expect(f.calls.map((c) => c.table)).toEqual(["opportunity_customer_members", "process_instances"]);
    });
    it("a failed read falls back to the tracked participants alone", async () => {
        const broken = { from: () => { throw new Error("down"); } } as never;
        vi.spyOn(console, "warn").mockImplementation(() => {});
        expect(await childrenAtFamilyPositionForMission({ supabase: broken, orgId: "org", opportunityId: OPP, contextStageKey: "lead", trackedParticipantStageKeys: ["waitlist"] })).toBe(0);
    });
});

describe("both Mission callers ask the same question with the family's real stage", () => {
    it("settled drawer reads the context ROW's stage_key (the composed record is layout-filtered) and the shared helper", async () => {
        const { readFileSync } = await import("node:fs");
        const src = readFileSync(`${process.cwd()}/lib/adminV2/viewModel/drawer/opportunity/sharedCanonicalDeps.ts`, "utf8");
        // Measured on deployed 55b4688f: commit Mission "lead", settled "waitlist" — the settled
        // Mission had a null context stage because it read the composed record.
        expect(src).toMatch(/missionContextStageKey =\s*trimOrNull\(\(oppRow as Record<string, unknown> \| null\)\?\.stage_key\)/);
        expect(src).toContain("participantsAtContextPosition: await childrenAtFamilyPositionForMission({");
        const prov = readFileSync(`${process.cwd()}/lib/runtime/provisioning/workUnitProvisioningAnswer.ts`, "utf8");
        expect(prov).toContain("participantsAtContextPosition: await childrenAtFamilyPositionForMission({");
    });
});
