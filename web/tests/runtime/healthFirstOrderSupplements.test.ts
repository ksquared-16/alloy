import { describe, expect, it } from "vitest";

import { readHealthFirstOrderSupplements } from "@/lib/runtime/firstOrder/readHealthFirstOrderSupplements";
import { DOCUMENT_BACKED_REQUIREMENTS } from "@/lib/adminV2/runtime/focusPanel/healthSafety/buildHealthSafetyCardVM";

/**
 * THE READER'S OWN GATES.
 *
 * The composer suite mocks this module wholesale, so nothing there exercises what the reader does
 * when a query fails. A plant that made it return `{ requirementsSatisfied: 0 }` on a failed
 * `documents` read stayed green across the entire composer battery: the mock answered for it.
 * A module that is stubbed everywhere it is used needs gates where it is defined.
 */

type Result = { data: unknown[] | null; error: { message: string } | null };

function fakeSupabase(byTable: Record<string, Result>) {
    const seen: Array<{ table: string; filters: Record<string, unknown> }> = [];
    const client = {
        from(table: string) {
            const filters: Record<string, unknown> = {};
            seen.push({ table, filters });
            const chain = {
                select: () => chain,
                eq: (col: string, val: unknown) => { filters[col] = val; return chain; },
                // Awaited at the end of the chain, exactly as the reader awaits it.
                then: (resolve: (v: Result) => unknown) =>
                    Promise.resolve(byTable[table] ?? { data: [], error: null }).then(resolve),
            };
            return chain;
        },
    };
    return { client: client as never, seen };
}

const MEMBER = "cm-1";

describe("readHealthFirstOrderSupplements", () => {
    it("counts a requirement as satisfied only when a document of its type exists", async () => {
        const { client } = fakeSupabase({
            documents: { data: [{ doc_type: "physical" }, { doc_type: "immunization_record" }], error: null },
            person_child_relationships: { data: [{ person_id: "p1" }, { person_id: "p2" }], error: null },
        });
        const out = await readHealthFirstOrderSupplements({ supabase: client, orgId: "o", customerMemberId: MEMBER });
        expect(out.requirementsSatisfied).toBe(2);
        expect(out.requirementsTotal).toBe(DOCUMENT_BACKED_REQUIREMENTS.length);
        expect(out.emergencyContactCount).toBe(2);
    });

    it("an UNRELATED document type satisfies nothing", async () => {
        const { client } = fakeSupabase({
            documents: { data: [{ doc_type: "enrollment_agreement" }], error: null },
            person_child_relationships: { data: [], error: null },
        });
        const out = await readHealthFirstOrderSupplements({ supabase: client, orgId: "o", customerMemberId: MEMBER });
        expect(out.requirementsSatisfied).toBe(0);
        expect(out.emergencyContactCount).toBe(0);
    });

    it("A FAILED DOCUMENTS READ THROWS — it never reports zero requirements satisfied", async () => {
        /*
         * The plant this exists for. Returning zero here tells an operator this child has no
         * immunization record on file because a query timed out, and the composer — which turns a
         * throw into UNAVAILABLE — would publish that zero as KNOWN.
         */
        const { client } = fakeSupabase({
            documents: { data: null, error: { message: "timeout" } },
            person_child_relationships: { data: [], error: null },
        });
        await expect(
            readHealthFirstOrderSupplements({ supabase: client, orgId: "o", customerMemberId: MEMBER }),
        ).rejects.toThrow(/health documents read failed/);
    });

    it("A FAILED CONTACTS READ THROWS — it never reports zero emergency contacts", async () => {
        const { client } = fakeSupabase({
            documents: { data: [], error: null },
            person_child_relationships: { data: null, error: { message: "timeout" } },
        });
        await expect(
            readHealthFirstOrderSupplements({ supabase: client, orgId: "o", customerMemberId: MEMBER }),
        ).rejects.toThrow(/emergency contacts read failed/);
    });

    it("a child with nothing on file is a real ZERO, not a failure", async () => {
        const { client } = fakeSupabase({
            documents: { data: [], error: null },
            person_child_relationships: { data: [], error: null },
        });
        const out = await readHealthFirstOrderSupplements({ supabase: client, orgId: "o", customerMemberId: MEMBER });
        expect(out).toEqual({ requirementsSatisfied: 0, requirementsTotal: DOCUMENT_BACKED_REQUIREMENTS.length, emergencyContactCount: 0 });
    });

    it("both reads are scoped to the org AND to this child, and there are exactly two", async () => {
        const { client, seen } = fakeSupabase({
            documents: { data: [], error: null },
            person_child_relationships: { data: [], error: null },
        });
        await readHealthFirstOrderSupplements({ supabase: client, orgId: "org-7", customerMemberId: MEMBER });
        expect(seen.map((s) => s.table).sort()).toEqual(["documents", "person_child_relationships"]);
        for (const s of seen) expect(s.filters.org_id).toBe("org-7");
        expect(seen.find((s) => s.table === "documents")!.filters.entity_id).toBe(MEMBER);
        expect(seen.find((s) => s.table === "person_child_relationships")!.filters.customer_member_id).toBe(MEMBER);
    });

    it("THE CONTACT NAMES ARE NOT FETCHED — the count is complete at one hop", () => {
        /*
         * `buildHealthSafetyCardVM` resolves names with a second hop into `persons`. The
         * first-order face states a COUNT, and buying a name with a dependent round trip on the
         * critical path is not a first-order trade.
         */
        const src = require("node:fs").readFileSync(
            require("node:path").resolve(process.cwd(), "lib/runtime/firstOrder/readHealthFirstOrderSupplements.ts"),
            "utf8",
        ).replace(/\/\*[\s\S]*?\*\//g, "");
        expect(src).not.toContain('from("persons")');
    });

    it("the requirement set is IMPORTED from its owner, never redeclared here", () => {
        const src = require("node:fs").readFileSync(
            require("node:path").resolve(process.cwd(), "lib/runtime/firstOrder/readHealthFirstOrderSupplements.ts"),
            "utf8",
        );
        expect(src).toContain("import { DOCUMENT_BACKED_REQUIREMENTS }");
        // A second literal list would let the card and the first-order face disagree about what a
        // requirement IS, with both honest about their own list.
        expect(src.replace(/import[^;]*;/g, "")).not.toMatch(/docType\s*:/);
    });
});
