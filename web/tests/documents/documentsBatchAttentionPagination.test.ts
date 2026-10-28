/**
 * D7 batch B3 — document attention reads the WHOLE population, in bounded pages, never silently capped.
 *
 * Before: the newest 1,000 tracked documents — a cap that also counted documents the reader could not see — behind one
 * `truncated` flag. Now: keyset pages over every tracked document, at most `limit` rows per response, an opaque cursor
 * for the rest, and `complete` once nothing remains.
 */
import { describe, expect, it } from "vitest";

import { InMemorySupabase } from "../harness/inMemorySupabase";
import {
    DOCUMENT_ATTENTION_MAX_LIMIT,
    decodeDocumentAttentionCursor,
    encodeDocumentAttentionCursor,
    listDocumentAttention,
} from "@/lib/documents/validity/documentAttention";
import type { RequirementTypeCatalog } from "@/lib/documents/requirements/documentRequirementService";

const ORG = "0a000000-0000-4000-8000-0000000000b3";
const P1 = "9e000000-0000-4000-8000-0000000000b3";
const C1 = "cb000000-0000-4000-8000-0000000000b3";
const clock = { today: "2026-10-27", timeZone: "UTC" };
const hex = (n: number) => n.toString(16).padStart(12, "0");
const docId = (prefix: string, n: number) => `${prefix}000000-0000-4000-8000-${hex(n)}`;

const policy = (key: string, label: string, sensitivity: string, subject: string) => ({
    type_id: `t-${key}`, version_id: `v-${key}`, key, label, category_id: null, category_label: null, subject_types: [subject],
    allowed_formats: ["pdf"], default_sensitivity: sensitivity, review_required: true, replacement_policy: "new_version",
    validity_policy: { kind: "explicit_date" },
});
const types = new Map([
    ["drivers_license", policy("drivers_license", "Driver's license", "standard", "person")],
    ["immunization_record", policy("immunization_record", "Immunization record", "medical", "child")],
]) as unknown as RequirementTypeCatalog;

/** `n` accepted documents with no recorded date — each needs attention (date missing). */
function seed(db: InMemorySupabase, prefix: string, n: number, docType: string, subject: { type: string; id: string }, sensitivity = "standard") {
    const docs = [], versions = [], owners = [];
    for (let i = 0; i < n; i++) {
        const id = docId(prefix, i);
        docs.push({ id, org_id: ORG, doc_type: docType, title: `Doc ${i}`, status: "uploaded", sensitivity, entity_type: subject.type === "child" ? "customer_member" : "person", entity_id: subject.id, current_version_id: `v-${id}`, created_at: "2026-10-01T00:00:00Z" });
        versions.push({ id: `v-${id}`, org_id: ORG, document_id: id, version_number: 1, review_status: "accepted", reviewed_at: "2026-10-02T00:00:00Z", effective_on: null, expires_on: null, created_at: "2026-10-01T00:00:00Z" });
        owners.push({ org_id: ORG, document_id: id, subject_type: subject.type, subject_id: subject.id, association: "owner", is_primary: true, ended_at: null });
    }
    db.seed("documents", docs).seed("document_versions", versions).seed("document_subjects", owners);
}
function baseDb() {
    const db = new InMemorySupabase();
    db.seed("persons", [{ id: P1, org_id: ORG, first_name: "Ana", last_name: "Rivera" }]);
    db.seed("customer_members", [{ id: C1, org_id: ORG, first_name: "Mia", last_name: "Rivera" }]);
    (db as unknown as { rpc: unknown }).rpc = async () => ({ data: false, error: null });
    return db;
}
const actor = (permissionKeys: string[]) => ({
    orgId: ORG, roleKeys: ["admin"], permissionKeys,
    scope: { departmentScope: "all", allowedDepartmentIds: null, siteScope: "all", allowedSiteLocationIds: null } as never,
});

async function drain(db: InMemorySupabase, perms: string[], limit?: number) {
    const ids: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    for (;;) {
        const r = await listDocumentAttention(db as never, actor(perms), { types, clock, cursor, limit });
        if (!r.ok) throw new Error(r.code);
        pages++;
        ids.push(...r.rows.map((x) => x.document_id));
        if (limit) expect(r.rows.length).toBeLessThanOrEqual(limit);
        if (r.complete) {
            expect(r.next_cursor).toBeNull();
            break;
        }
        expect(r.next_cursor).toBeTruthy();
        cursor = r.next_cursor;
        if (pages > 50) throw new Error("no progress");
    }
    return { ids, pages };
}

describe("B3 — complete, bounded document attention", () => {
    it("1,203 documents needing attention: every one is reachable, none twice, in pages of at most the limit", async () => {
        const db = baseDb();
        seed(db, "d3", 1203, "drivers_license", { type: "person", id: P1 });
        const { ids, pages } = await drain(db, ["documents.read"], 500);
        expect(ids).toHaveLength(1203);
        expect(new Set(ids).size).toBe(1203);
        expect(pages).toBe(3);
    });

    it("the default page is bounded (200) and says it is not complete", async () => {
        const db = baseDb();
        seed(db, "d3", 450, "drivers_license", { type: "person", id: P1 });
        const r = await listDocumentAttention(db as never, actor(["documents.read"]), { types, clock });
        expect(r.ok && r.rows.length).toBe(200);
        expect(r.ok && r.complete).toBe(false);
        const all = await drain(db, ["documents.read"]);
        expect(all.ids).toHaveLength(450);
    });

    it("documents the reader cannot see no longer consume the population: 1,100 medical rows ahead of 5 visible ones", async () => {
        const db = baseDb();
        seed(db, "a1", 1100, "immunization_record", { type: "child", id: C1 }, "medical");
        seed(db, "f9", 5, "drivers_license", { type: "person", id: P1 });
        const { ids } = await drain(db, ["documents.read"]);
        expect(ids).toHaveLength(5);
        expect(ids.every((id) => id.startsWith("f9"))).toBe(true);
        // A Medical-authorized reader gets all 1,105.
        expect((await drain(db, ["documents.read", "health.view"], DOCUMENT_ATTENTION_MAX_LIMIT)).ids).toHaveLength(1105);
    });

    it("a limit above the maximum is clamped; a forged cursor is refused", async () => {
        const db = baseDb();
        seed(db, "d3", 700, "drivers_license", { type: "person", id: P1 });
        const r = await listDocumentAttention(db as never, actor(["documents.read"]), { types, clock, limit: 10_000 });
        expect(r.ok && r.rows.length).toBe(DOCUMENT_ATTENTION_MAX_LIMIT);
        const bad = await listDocumentAttention(db as never, actor(["documents.read"]), { types, clock, cursor: "not-a-cursor" });
        expect(bad).toEqual({ ok: false, code: "INVALID_CURSOR" });
        expect(decodeDocumentAttentionCursor(encodeDocumentAttentionCursor({ after_id: docId("d3", 7), offset: 3 }))).toEqual({ after_id: docId("d3", 7), offset: 3 });
    });

    it("an empty organization is complete with no rows", async () => {
        const r = await listDocumentAttention(baseDb() as never, actor(["documents.read"]), { types, clock });
        expect(r).toMatchObject({ ok: true, rows: [], complete: true, next_cursor: null });
    });
});
