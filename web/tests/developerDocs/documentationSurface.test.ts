/**
 * The external documentation boundary.
 *
 * Three questions decide whether this surface can be shown to a partner engineer: can they reach a
 * document Alloy did not publish, can they see governance metadata, and can the page advertise an
 * endpoint that does not exist. Each is asserted against the real registry and the real governed
 * files rather than against a fixture.
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
    API_REFERENCE_PATH,
    DOCUMENTATION_SECTIONS,
    documentationSection,
    loadDocument,
    publicOperations,
    resolveDocumentationLink,
} from "@/lib/developerDocs/documentationSources";

const REPO = resolve(__dirname, "../../..");
const readWeb = (relative: string) => readFileSync(resolve(__dirname, "../..", relative), "utf8");

describe("the registry is closed", () => {
    it("every published section resolves to a governed file that exists", () => {
        for (const section of DOCUMENTATION_SECTIONS) {
            const loaded = loadDocument(section.slug);
            expect(loaded, `${section.slug} → ${section.file}`).not.toBeNull();
            expect(loaded!.document.blocks.length).toBeGreaterThan(0);
        }
    });

    it("an unknown slug resolves to nothing", () => {
        expect(documentationSection("product/06-gaps-and-slice-b")).toBeNull();
        expect(loadDocument("../../../.env")).toBeNull();
        expect(loadDocument("06-gaps-and-slice-b")).toBeNull();
    });

    it("no internal planning document is published", () => {
        /*
         * `docs/api/developer-platform/product/**` is Alloy's own implementation planning — slice
         * sequencing, open gaps, what is blocked. Publishing one would hand a partner Alloy's
         * internal state, and the registry is the thing that prevents it.
         */
        const internal = readdirSync(resolve(REPO, "docs/api/developer-platform/product"))
            .map((name) => `docs/api/developer-platform/product/${name}`);
        expect(internal.length).toBeGreaterThan(0);
        for (const file of internal) {
            expect(DOCUMENTATION_SECTIONS.map((s) => s.file), file).not.toContain(file);
        }
    });

    it("the partner packets are not published either — they are sent, not browsed", () => {
        const published = DOCUMENTATION_SECTIONS.map((s) => s.file);
        expect(published).not.toContain(
            "docs/api/developer-platform/partners/classroom-coach-integration-readiness.md",
        );
        expect(published).not.toContain(
            "docs/api/developer-platform/partners/classroom-coach-technical-discovery-request.md",
        );
    });
});

describe("governance metadata is reported, never rendered", () => {
    it("the external specification's own classification is available to the product", () => {
        const loaded = loadDocument("specification");
        expect(loaded?.classification).toBe("PARTNER_READY");
    });

    it("no published document leaks frontmatter into its rendered blocks", () => {
        for (const section of DOCUMENTATION_SECTIONS) {
            const { document } = loadDocument(section.slug)!;
            expect(Object.keys(document.frontmatter).length, `${section.slug} has frontmatter`).toBeGreaterThan(0);
            const serialized = JSON.stringify(document.blocks);
            for (const key of ["owner:", "last_reviewed:", "supersedes:", "classification:", "audience:"]) {
                expect(serialized, `${section.slug} renders ${key}`).not.toContain(key);
            }
        }
    });
});

describe("links never send a reader somewhere they cannot go", () => {
    const from = "docs/api/developer-platform/guide/README.md";

    it("a link to a published document becomes its product route", () => {
        expect(resolveDocumentationLink("./conventions.md", from))
            .toBe("/organization/integrations/documentation/conventions");
        expect(resolveDocumentationLink("locations.md", from))
            .toBe("/organization/integrations/documentation/locations");
    });

    it("a link to an internal document becomes plain text", () => {
        expect(resolveDocumentationLink("../product/08-slice-b2-external-boundary.md", from)).toBeNull();
        expect(resolveDocumentationLink("../../../CLAUDE.md", from)).toBeNull();
    });

    it("the governed OpenAPI document resolves to the API reference", () => {
        expect(resolveDocumentationLink("../../openapi/alloy-public-api.v1.json", from)).toBe(API_REFERENCE_PATH);
    });

    it("an anchor stays an anchor and an external URL stays itself", () => {
        expect(resolveDocumentationLink("#rate-limits", from)).toBe("#rate-limits");
        expect(resolveDocumentationLink("https://example.com/x", from)).toBe("https://example.com/x");
    });

    it("a scheme an author chose is refused", () => {
        // Authored content is content. It does not get to pick `javascript:` or `data:`.
        expect(resolveDocumentationLink("javascript:alert(1)", from)).toBeNull();
        expect(resolveDocumentationLink("data:text/html,<script>", from)).toBeNull();
        expect(resolveDocumentationLink("file:///etc/passwd", from)).toBeNull();
    });
});

describe("the advertised surface is the implemented surface", () => {
    it("the operations shown are read from the governed OpenAPI document", () => {
        const operations = publicOperations();
        expect(operations).toHaveLength(5);
        expect(operations.map((o) => `${o.method} ${o.path}`).sort()).toEqual([
            "GET /api/v1/attendance-events",
            "GET /api/v1/context",
            "GET /api/v1/locations",
            "POST /api/v1/attendance-events",
            "POST /api/v1/oauth/token",
        ]);
        for (const operation of operations) {
            expect(operation.summary.length, `${operation.path} has a summary`).toBeGreaterThan(0);
        }
    });

    it("attendance is advertised as a read and a submission, never an edit", () => {
        /*
         * The landing lists what a credential can actually do. Since slice 7.4 that includes
         * authoring attendance facts — and must never include changing or deleting one, because the
         * ledger's correction and reversal semantics are the only honest way to fix a mistake.
         */
        const attendance = publicOperations().filter((o) => /attendance/i.test(o.path));
        expect(attendance.map((o) => o.method).sort()).toEqual(["GET", "POST"]);
    });

    it("the landing derives the list rather than hard-coding it", () => {
        /*
         * A page that lists the three operations in JSX is correct exactly until the fourth ships.
         * This is the assertion that keeps the derivation, which is what makes the list trustworthy.
         */
        const landing = readWeb("app/adminV2/settings/organization/integrations/documentation/page.tsx");
        expect(landing).toContain("publicOperations()");
        expect(landing).not.toContain("/api/v1/locations");
        expect(landing).not.toContain("/api/v1/oauth/token");
        expect(landing).not.toContain("/api/v1/attendance-events");
    });

    it("the landing names the scope-versus-endpoint distinction", () => {
        // DP-QA-24 is a hard gate: a reader must not conclude a public attendance mutation exists
        // because a capability by that name can be granted.
        const landing = readWeb("app/adminV2/settings/organization/integrations/documentation/page.tsx");
        expect(landing).toMatch(/not endpoints it publishes/i);
    });
});

describe("the rendered documentation is text, not markup", () => {
    it("nothing in the documentation path injects HTML", () => {
        for (const file of [
            "components/developerDocs/DocumentationRenderer.tsx",
            "components/developerDocs/CodeBlock.tsx",
            "app/adminV2/settings/organization/integrations/documentation/page.tsx",
            "app/adminV2/settings/organization/integrations/documentation/[section]/page.tsx",
        ]) {
            // The ATTRIBUTE, not the word: the renderer's own comment names it to explain why it
            // is absent, and an assertion that forbids saying so would push the reasoning out of
            // the file that needs it.
            expect(readWeb(file), file).not.toMatch(/dangerouslySetInnerHTML\s*=/);
        }
    });
});
