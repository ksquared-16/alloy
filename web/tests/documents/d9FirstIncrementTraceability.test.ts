/**
 * D9 / D10 first-increment proposal — traceability of certification/documents-v1/D9-D10-FIRST-INCREMENT-PROPOSAL.md.
 *
 * Every REPO-tagged fact the proposal builds on is pinned here, so a reviewer can trust the proposal's evidence column
 * and the proposal fails CI when the tree moves under it (logical filing, the subject model, the 10-minute audited
 * download link, the declared sensitivity vocabulary, the v1 paging keys, the enrollment visibility rule, and the absent
 * documents operations). Expected to fail — with the proposal — when D9.1 lands. Read-only; no database.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { DOCUMENT_SUBJECT_TYPES } from "@/lib/documents/documentSubjects";
import { DECLARED_DOCUMENT_SENSITIVITIES } from "@/lib/documents/documentSensitivity";
import { signedUrlExpirySeconds } from "@/lib/documents/assertDocumentAccess";

const ROOT = resolve(__dirname, "../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const DOC = read("certification/documents-v1/D9-D10-FIRST-INCREMENT-PROPOSAL.md");

describe("REPO facts the proposal relies on", () => {
    it("filing is logical, never storage folders; categories are hierarchical", () => {
        expect(read("docs/platform/modules/documents-and-forms.md").replace(/\s+/g, " ")).toContain("Filing is logical — subjects and types — never storage folders");
        const d3 = read("supabase/migrations/20261209090100_documents_d3_studio_configuration.sql");
        expect(d3).toMatch(/CREATE TABLE IF NOT EXISTS public\.document_categories/);
        expect(d3).toMatch(/parent_id uuid REFERENCES public\.document_categories/);
        expect(d3).toMatch(/CREATE TABLE IF NOT EXISTS public\.document_types/);
    });

    it("children, parents (persons) and households can own a document; access follows the primary owner", () => {
        for (const t of ["household", "person", "child"]) expect(DOCUMENT_SUBJECT_TYPES).toContain(t);
        expect(read("web/lib/documents/documentSubjects.ts")).toContain("ACCESS IS DECIDED BY THE PRIMARY OWNER ALONE");
    });

    it("downloads are 10-minute links recorded before they are minted", () => {
        expect(signedUrlExpirySeconds("download")).toBe(600);
        const route = read("web/app/api/admin/documents/[id]/signed-url/route.ts");
        expect(route).toContain("issuance is recorded (`document_link_issued`) BEFORE the link is minted");
        expect(DOC).toContain("**10 minutes**");
    });

    it("the declared sensitivity vocabulary is exactly the one the decision table uses", () => {
        expect([...DECLARED_DOCUMENT_SENSITIVITIES]).toEqual(["standard", "personal_identity", "medical", "custody_safeguarding", "restricted"]);
        for (const s of DECLARED_DOCUMENT_SENSITIVITIES) expect(DOC).toContain(`\`${s}\``);
    });

    it("the v1 collection route already pages with limit / cursor / since_token", () => {
        const c = read("web/lib/platform/external/collectionRoute.ts");
        for (const k of ['search.get("limit")', 'search.get("cursor")', 'search.get("since_token")']) expect(c).toContain(k);
    });

    it("external child visibility is enrollment at an in-boundary site, not organization membership", () => {
        expect(read("web/app/api/v1/children/route.ts")).toContain("ENROLLMENT IS WHAT MAKES A CHILD VISIBLE");
    });
});

describe("what increment 1 would add is still absent", () => {
    it("no documents scope or operation in the public catalog", () => {
        const catalog = read("web/lib/platform/external/scopeCatalog.ts");
        expect(catalog).not.toMatch(/["']documents\.read["']/);
        expect(catalog).not.toMatch(/listDocuments|getDocument|createDocumentDownloadLink|listDocumentCategories/);
    });
});

describe("the proposal keeps its provenance tiers explicit", () => {
    it("names the user requirement, the unratified assistant proposal, repository evidence and inference separately", () => {
        for (const tag of ["**USER**", "**ASSISTANT**", "**REPO**", "**INFERENCE**"]) expect(DOC).toContain(tag);
        expect(DOC).toContain("Not independently verified as ratified by the user");
        expect(DOC).toContain("is **not proven undefined** there");
        expect(DOC).toContain("65eb16f0-1fae-4bd7-bac6-49be022b0b7b");
        expect(DOC).toContain("14d28f8e-15f5-4b80-9dc2-c6c35eda3a7d");
        expect(DOC).toContain("50f481fc-1898-4008-bf34-9431ea8236cd");
    });
});
