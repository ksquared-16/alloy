import { describe, expect, it, vi } from "vitest";

import {
    ensureCertificationHealthTruth,
    restoreCertificationHealthTruth,
} from "@/lib/certification/operationalCardsHealthFixture";

const MANAGER = { permissionKeys: ["health.view", "health.manage"] };
const VIEWER = { permissionKeys: ["health.view"] };
const CHILDREN = { Certa: "child-a", Certb: "child-b" };

/**
 * A stub that behaves like the real table for the two things under test: lookup by `source_ref`,
 * and insert. It records every write so ordering and idempotence are observable.
 */
function stubClient(seedBySourceRef: Record<string, { id: string; status: string }> = {}) {
    const inserts: Array<Record<string, unknown>> = [];
    const updates: Array<Record<string, unknown>> = [];
    const store = { ...seedBySourceRef };
    let seq = 0;
    const client = {
        from() {
            const q: Record<string, unknown> = {};
            const api: Record<string, unknown> = {
                select() {
                    return api;
                },
                eq(col: string, val: unknown) {
                    q[col] = val;
                    return api;
                },
                limit() {
                    return api;
                },
                insert(payload: Record<string, unknown>) {
                    q._insert = payload;
                    return api;
                },
                update(payload: Record<string, unknown>) {
                    q._update = payload;
                    return api;
                },
                single() {
                    const payload = q._insert as Record<string, unknown>;
                    inserts.push(payload);
                    seq += 1;
                    const row = { ...payload, id: `fact-${seq}` };
                    store[String(payload.source_ref)] = { id: row.id as string, status: "active" };
                    return Promise.resolve({ data: row, error: null });
                },
                maybeSingle() {
                    if (q._update) {
                        updates.push({ id: q.id, ...(q._update as object) });
                        return Promise.resolve({
                            data: { id: q.id, ...(q._update as object) },
                            error: null,
                        });
                    }
                    // Lookup by source_ref (the fixture's idempotence key) OR by id (how the
                    // service loads a fact before ending it). Supporting only one of them made the
                    // restore path look broken when it was the stub that was.
                    const ref = q.source_ref ? String(q.source_ref) : null;
                    if (ref) {
                        const hit = store[ref];
                        return Promise.resolve({
                            data: hit ? { ...hit, source_ref: ref, metadata: {} } : null,
                            error: null,
                        });
                    }
                    const id = q.id ? String(q.id) : null;
                    const byId = Object.entries(store).find(([, v]) => v.id === id);
                    return Promise.resolve({
                        data: byId
                            ? { ...byId[1], source_ref: byId[0], metadata: {} }
                            : null,
                        error: null,
                    });
                },
            };
            return api;
        },
    } as never;
    return { client, inserts, updates, store };
}

describe("certification health truth — through H4, never inserted", () => {
    it("creates the contrasting specimens and links the medication to what it treats", async () => {
        const { client, inserts } = stubClient();
        const out = await ensureCertificationHealthTruth(client, "org-1", CHILDREN, MANAGER, null);
        expect(out.ok).toBe(true);
        expect(out.created.map((c) => `${c.child}/${c.kind}`)).toEqual([
            "Certa/allergy",
            "Certa/medication",
            "Certb/condition",
        ]);
        // Written in dependency order so `related_fact_id` points at a real row. Patching it
        // afterwards would be an in-place edit of what a fact says, which the trigger refuses.
        const medication = inserts.find((i) => i.fact_kind === "medication")!;
        const allergy = inserts.find((i) => i.fact_kind === "allergy")!;
        expect(medication.related_fact_id).toBe("fact-1");
        expect(allergy.related_fact_id).toBeNull();
    });

    it("carries canonical payload vocabulary, not fixture shortcuts", async () => {
        const { client, inserts } = stubClient();
        await ensureCertificationHealthTruth(client, "org-1", CHILDREN, MANAGER, null);
        const allergy = inserts.find((i) => i.fact_kind === "allergy")!;
        const payload = allergy.payload as Record<string, unknown>;
        expect(payload.allergen).toBe("Peanut");
        expect(payload.severity).toBe("severe");
        expect(payload.reaction).toBe("Anaphylaxis");
        // The line an operator acts on has to be present, or the critical region says nothing useful.
        expect(String(payload.treatment)).toMatch(/EpiPen/);
        // Provenance is required and truthful: an operator asserted it, not a form.
        expect(allergy.source_kind).toBe("operator");
        expect(String(allergy.source_ref)).toMatch(/^operational-cards-cert:certa:allergy/);
    });

    it("the two children CONTRAST — switching participants must prove something", async () => {
        const { client, inserts } = stubClient();
        await ensureCertificationHealthTruth(client, "org-1", CHILDREN, MANAGER, null);
        const certa = inserts.filter((i) => i.subject_entity_id === "child-a");
        const certb = inserts.filter((i) => i.subject_entity_id === "child-b");
        expect(certa.map((i) => i.fact_kind).sort()).toEqual(["allergy", "medication"]);
        expect(certb.map((i) => i.fact_kind)).toEqual(["condition"]);
        // If both rendered the same shape, participant switching would look correct and prove nothing.
        expect((certa[0]!.payload as Record<string, unknown>).severity).toBe("severe");
        expect((certb[0]!.payload as Record<string, unknown>).severity).toBe("mild");
    });

    it("is idempotent — a repeated ensure reuses rather than stacking duplicate allergies", async () => {
        const { client, inserts } = stubClient();
        await ensureCertificationHealthTruth(client, "org-1", CHILDREN, MANAGER, null);
        const afterFirst = inserts.length;
        const second = await ensureCertificationHealthTruth(client, "org-1", CHILDREN, MANAGER, null);
        // Two active peanut allergies on a health card read as two separate allergies.
        expect(inserts.length).toBe(afterFirst);
        expect(second.created).toEqual([]);
        expect(second.reused).toHaveLength(3);
    });

    it("restore ENDS facts and never deletes", async () => {
        const { client, updates } = stubClient();
        await ensureCertificationHealthTruth(client, "org-1", CHILDREN, MANAGER, null);
        const out = await restoreCertificationHealthTruth(client, "org-1", CHILDREN, MANAGER, null);
        expect(out.ended).toHaveLength(3);
        for (const u of updates) {
            expect(u.status).toBe("ended");
            expect(u.effective_to).toBeTruthy();
        }
    });

    it("refuses entirely without health.manage — the fixture meets the same boundary an operator does", async () => {
        const { client, inserts } = stubClient();
        const out = await ensureCertificationHealthTruth(client, "org-1", CHILDREN, VIEWER, null);
        expect(out.ok).toBe(false);
        expect(inserts).toEqual([]);
        expect(out.refusals.join(" ")).toMatch(/permission/i);
    });

    it("fails closed when a certification child cannot be resolved", async () => {
        const { client, inserts } = stubClient();
        const out = await ensureCertificationHealthTruth(client, "org-1", { Certa: "child-a" }, MANAGER, null);
        expect(out.refusals.join(" ")).toMatch(/Certb/);
        expect(inserts.some((i) => i.subject_entity_id === "child-b")).toBe(false);
    });
});
