/**
 * D9.1 hosted-proof subject fixture — static safety locks. The SQL is prepared for the hosted QA plan (handoff H2) and
 * is NOT validated against a database here; these locks pin what must hold before anyone runs it.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (f: string) => readFileSync(`../certification/fixtures/${f}`, "utf8");
const ensure = read("qa-d9-external-fixture-ensure.sql");
const reset = read("qa-d9-external-fixture-reset.sql");
const QA_SHARED = "4acc9386-c485-486f-aa1f-05d83499d142";
const QA_SECONDARY = "ad53fee2-2570-460f-9300-f0e106c473b6";
const code = (s: string) => s.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

describe("D9 external fixture", () => {
    it("is bound to QA Shared / QA Secondary only, with an explicit org and (ensure) a QA run id", () => {
        for (const s of [ensure, reset]) {
            expect(s).toContain("\\if :{?org}");
            expect(s).toContain(QA_SHARED);
            expect(s).toContain(QA_SECONDARY);
        }
        expect(ensure).toContain("\\if :{?qa_run_id}");
    });

    it("every delete is scoped to the org AND the d9000000- namespace", () => {
        for (const s of [code(ensure), code(reset)]) {
            const deletes = s.match(/delete from public\.[a-z_]+ where [^;)]*/gi) ?? [];
            expect(deletes.length).toBeGreaterThan(0);
            for (const d of deletes) {
                expect(d).toContain("org_id = :'org'::uuid");
                expect(d).toMatch(/::text like 'd9000000-%'/);
            }
        }
    });

    it("writes no documents, updates nothing, and every literal id it writes is namespaced", () => {
        for (const s of [code(ensure), code(reset)]) {
            expect(s).not.toMatch(/insert into public\.documents\b/i);
            expect(s).not.toMatch(/delete from public\.documents\b/i);
            expect(s).not.toMatch(/\bupdate public\./i);
        }
        const ids = [...code(ensure).matchAll(/'([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})'/g)].map((m) => m[1]);
        const allowed = new Set([QA_SHARED, QA_SECONDARY, "21c9be10-f6e9-4048-ab4c-939ddbe0f0b7", "cfb73302-3bbe-49db-b173-876fda776a6d"]);
        for (const id of ids) expect(id.startsWith("d9000000-") || allowed.has(id), id).toBe(true);
    });

    it("refuses while tagged documents remain on fixture subjects, and the guardian / emergency-contact split is seeded", () => {
        for (const s of [ensure, reset]) expect(s).toContain("subject_documents_remaining");
        expect(ensure).toMatch(/'guardian', 'active'/);
        expect(ensure).toMatch(/'emergency_contact', 'active'/);
        expect(reset).toContain("reset namespace=qa-d9-external removed=");
    });
});
