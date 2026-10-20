/**
 * Processing Reject and Edit.
 *  - Reject closes an OPEN case as completed + disposition rejected, creates nothing, needs a reason,
 *    is idempotent and never re-closes a case approved in the meantime.
 *  - Edit corrects the PROPOSAL (never the submission): values are validated and normalized, stored as
 *    corrections with what they replaced, and applied when the plan is built — including the names
 *    derived from them.
 */
import { describe, expect, it } from "vitest";

import { rejectProcessingCase } from "@/lib/pos/processingCase/rejectProcessingCase";
import {
    applyOperatorValueEdits,
    EDITABLE_FIELDS,
    mergeOperatorValueEdits,
    normalizeEditValue,
} from "@/lib/pos/processingIdentity/operator/operatorValueEdits";

type Row = Record<string, unknown>;
function db(cases: Row[]) {
    const writes: Array<{ table: string; patch: Row }> = [];
    return {
        writes,
        from(table: string) {
            const filters: Array<(r: Row) => boolean> = [];
            let patch: Row | null = null;
            const rows = () => (table === "processing_cases" ? cases : []).filter((r) => filters.every((f) => f(r)));
            const api: Record<string, unknown> = {
                select: () => {
                    if (patch) {
                        const hit = rows();
                        for (const r of hit) Object.assign(r, patch);
                        writes.push({ table, patch });
                        return Promise.resolve({ data: hit.map((r) => ({ id: r.id })), error: null });
                    }
                    return api;
                },
                eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return api; },
                in: (c: string, v: unknown[]) => { filters.push((r) => v.includes(r[c])); return api; },
                update: (p: Row) => { patch = p; return api; },
                insert: () => { throw new Error("no inserts expected"); },
                maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
            };
            return api;
        },
    };
}
const ORG = "org-1";
const now = new Date("2026-10-20T15:00:00Z");

describe("rejectProcessingCase", () => {
    it("closes an open case as rejected, with its reason, and writes nothing else", async () => {
        const cases = [{ id: "c1", org_id: ORG, status: "received", metadata: { payload_snapshot: { a: 1 } } }];
        const client = db(cases);
        const events: unknown[] = [];
        const r = await rejectProcessingCase(client as never, { orgId: ORG, caseId: "c1", reasonCode: "spam_or_test", actorId: "op-1", now, emit: async (e) => events.push(e) });
        expect(r).toMatchObject({ ok: true, alreadyRejected: false, disposition: { outcome: "rejected", reason_code: "spam_or_test", reason_label: "Spam or test submission" } });
        expect(cases[0]).toMatchObject({ status: "completed", metadata: { payload_snapshot: { a: 1 }, disposition: { outcome: "rejected" }, operational_result: { kind: "rejected" } } });
        expect(client.writes.map((w) => w.table)).toEqual(["processing_cases"]);
        expect(events).toHaveLength(1);
    });

    it("requires a known reason, and a note for Other", async () => {
        const cases = [{ id: "c1", org_id: ORG, status: "received", metadata: {} }];
        expect(await rejectProcessingCase(db(cases) as never, { orgId: ORG, caseId: "c1", reasonCode: "", actorId: null })).toMatchObject({ ok: false, code: "reason_required" });
        expect(await rejectProcessingCase(db(cases) as never, { orgId: ORG, caseId: "c1", reasonCode: "other", actorId: null })).toMatchObject({ ok: false, code: "note_required" });
        expect(cases[0]!.status).toBe("received");
    });

    it("is idempotent, and never re-closes an approved case", async () => {
        const cases = [{ id: "c1", org_id: ORG, status: "received", metadata: {} }, { id: "c2", org_id: ORG, status: "completed", metadata: { operational_result: { kind: "lead" } } }];
        await rejectProcessingCase(db(cases) as never, { orgId: ORG, caseId: "c1", reasonCode: "not_a_fit", actorId: null, now });
        const again = await rejectProcessingCase(db(cases) as never, { orgId: ORG, caseId: "c1", reasonCode: "spam_or_test", actorId: null, now });
        expect(again).toMatchObject({ ok: true, alreadyRejected: true, disposition: { reason_code: "not_a_fit" } });
        const approved = await rejectProcessingCase(db(cases) as never, { orgId: ORG, caseId: "c2", reasonCode: "not_a_fit", actorId: null, now });
        expect(approved).toMatchObject({ ok: false, code: "case_closed" });
        expect((cases[1]!.metadata as Row).disposition).toBeUndefined();
    });
});

describe("operator value edits", () => {
    const parent = EDITABLE_FIELDS.parent!;
    const field = (role: string, key: string) => EDITABLE_FIELDS[role]!.find((f) => f.key === key)!;

    it("normalizes phone to E.164, email to lower case, and refuses invalid values", () => {
        expect(normalizeEditValue(field("parent", "phone"), "(555) 888-9965")).toEqual({ ok: true, value: "+15558889965" });
        expect(normalizeEditValue(field("parent", "phone"), "555-12")).toMatchObject({ ok: false });
        expect(normalizeEditValue(field("parent", "email"), " Pat@Example.COM ")).toEqual({ ok: true, value: "pat@example.com" });
        expect(normalizeEditValue(field("parent", "email"), "nope")).toMatchObject({ ok: false });
        expect(normalizeEditValue(field("child", "dob"), "2022-13-40")).toMatchObject({ ok: false });
        expect(normalizeEditValue(parent[0]!, "")).toMatchObject({ ok: false });
        expect(normalizeEditValue(field("lead", "location_id"), "loc-x", new Set(["loc-a"]))).toMatchObject({ ok: false });
    });

    it("records what each correction replaced; setting it back to the submitted value clears it", () => {
        let edits = mergeOperatorValueEdits({ existing: {}, subjectRef: "parent:0", role: "parent", field: "phone", value: "+15558889966", submitted: "5558889965", actorId: "op", at: "t" });
        expect(edits["parent:0"]!.values.phone).toEqual({ value: "+15558889966", from: "5558889965", actor_id: "op", at: "t" });
        edits = mergeOperatorValueEdits({ existing: edits, subjectRef: "parent:0", role: "parent", field: "phone", value: "5558889965", submitted: "5558889965", actorId: "op", at: "t2" });
        expect(edits).toEqual({});
    });

    it("the plan carries corrected values, and names derived from them follow", () => {
        const set = {
            subjects: [
                { ref: "household:0", role: "household" as const, decision: "create" as const, values: { household_name: "Smiht Family" } },
                { ref: "parent:0", role: "parent" as const, decision: "create" as const, values: { first_name: "Pat", last_name: "Smiht", phone: "5558889965" } },
                { ref: "child:0", role: "child" as const, decision: "create" as const, values: { first_name: "Ava", last_name: "Smiht", display_name: "Ava Smiht" } },
                { ref: "lead:0", role: "lead" as const, decision: "create" as const, values: { name: "Smiht Family" } },
            ],
        };
        const at = "2026-10-20T00:00:00Z";
        const edits = {
            "parent:0": { role: "parent", values: { last_name: { value: "Smith", from: "Smiht", actor_id: "op", at }, phone: { value: "+15558889966", from: "5558889965", actor_id: "op", at } } },
            "child:0": { role: "child", values: { last_name: { value: "Smith", from: "Smiht", actor_id: "op", at } } },
            "lead:0": { role: "lead", values: { location_id: { value: "loc-north", from: null, actor_id: "op", at } } },
        };
        const out = applyOperatorValueEdits(set, edits);
        const by = (ref: string) => out.subjects.find((s) => s.ref === ref)!.values!;
        expect(by("parent:0")).toMatchObject({ last_name: "Smith", phone: "+15558889966" });
        expect(by("child:0")).toMatchObject({ last_name: "Smith", display_name: "Ava Smith" });
        expect(by("household:0").household_name).not.toContain("Smiht");
        expect(by("lead:0")).toMatchObject({ location_id: "loc-north" });
        expect(by("lead:0").name).toBe(by("household:0").household_name);
        // The input set (the resolutions) is not mutated.
        expect(set.subjects[1]!.values.last_name).toBe("Smiht");
    });
});
