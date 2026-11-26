/**
 * The documentation routing model, and the defect that made every destination 404.
 *
 * ── WHAT ACTUALLY BROKE ──
 *
 * Nothing was wrong with the links. `loadDocument` read its Markdown with
 * `readFileSync(path.join(process.cwd(), "..", file))`, and the API reference route read the
 * governed OpenAPI the same way. Both paths are built at runtime, so Next's file tracer cannot see
 * them, and both resolve OUTSIDE `outputFileTracingRoot` — which is `web/` — so they could not be
 * traced even if they could be seen. In development the whole repository is on disk and every page
 * works. In a deployed serverless runtime the files are absent: the read throws, the page calls
 * `notFound()`, and every documentation destination and the API Reference answer 404.
 *
 * One cause, every destination. These assertions hold the repair in place: the governed bytes are
 * embedded at build time, and nothing in the documentation path touches the filesystem at request
 * time at all.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { implementedOperations } from "../support/publicSurfaceInventory";

import {
    API_REFERENCE_PATH,
    DOCUMENTATION_BASE_PATH,
    DOCUMENTATION_NAV,
    DOCUMENTATION_SECTIONS,
    INTEGRATIONS_PATH,
    RAW_OPENAPI_PATH,
    loadDocument,
    publicOperations,
} from "@/lib/developerDocs/documentationSources";
import { GOVERNED_DOCUMENT_SOURCES, GOVERNED_OPENAPI_DOCUMENT } from "@/lib/developerDocs/governedDocuments.generated";

const WEB = resolve(__dirname, "../..");
const read = (relative: string) => readFileSync(resolve(WEB, relative), "utf8");

/**
 * Source with comments removed.
 *
 * What must be absent is the CALL. Both repaired files explain in prose why the read is gone —
 * naming `readFileSync` and `process.cwd()` to do it — and an assertion that forbids saying so
 * would push the reasoning out of the files that most need it.
 */
const code = (relative: string) =>
    read(relative)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");

const APP_DOCS = "app/adminV2/settings/organization/integrations/documentation";

describe("no destination depends on a file the deployed runtime does not have", () => {
    it("the documentation source module reads no file at request time", () => {
        const source = code("lib/developerDocs/documentationSources.ts");
        // The only survivor is the comment explaining why the read is gone.
        expect(source).not.toMatch(/^\s*import .*from "node:fs"/m);
        expect(source).not.toMatch(/readFileSync\(/);
        expect(source).not.toMatch(/process\.cwd\(\)/);
    });

    it("the API reference route serves the embedded document rather than reading the repository", () => {
        const route = code("app/api/admin/integrations/openapi/route.ts");
        expect(route).not.toMatch(/readFileSync\(/);
        expect(route).not.toMatch(/process\.cwd\(\)/);
        expect(route).toContain("GOVERNED_OPENAPI_DOCUMENT");
    });

    it("every published document is present in the embedded artifact", () => {
        for (const section of DOCUMENTATION_SECTIONS) {
            expect(GOVERNED_DOCUMENT_SOURCES[section.file], section.file).toBeTypeOf("string");
            expect(GOVERNED_DOCUMENT_SOURCES[section.file].length).toBeGreaterThan(200);
            expect(loadDocument(section.slug), section.slug).not.toBeNull();
        }
    });

    it("the embedded OpenAPI document is the governed one and still parses", () => {
        const spec = JSON.parse(GOVERNED_OPENAPI_DOCUMENT) as { openapi?: string; paths?: object };
        expect(spec.openapi).toMatch(/^3\./);
        expect(Object.keys(spec.paths ?? {}).length).toBeGreaterThan(0);
        // Derived from the implemented route files, so a new operation cannot pass unpublished.
        expect(publicOperations().length).toBe(implementedOperations().length);
    });
});

describe("every visible destination has a route behind it", () => {
    it("each navigation entry resolves to a page file", () => {
        for (const entry of DOCUMENTATION_NAV) {
            const isReference = entry.href === API_REFERENCE_PATH;
            const file = isReference
                ? `${APP_DOCS}/api-reference/page.tsx`
                : `${APP_DOCS}/[section]/page.tsx`;
            expect(existsSync(resolve(WEB, file)), `${entry.href} → ${file}`).toBe(true);
            expect(entry.href.startsWith(DOCUMENTATION_BASE_PATH), entry.href).toBe(true);
        }
    });

    it("the API Reference is a rendered route, not a link at raw JSON", () => {
        /*
         * It used to point straight at `/api/admin/integrations/openapi`, so "API Reference" handed
         * a developer a JSON download — and, once the read failed in the deployed runtime, a 404.
         * The document is still one click away from the rendered page.
         */
        expect(API_REFERENCE_PATH).toBe(`${DOCUMENTATION_BASE_PATH}/api-reference`);
        expect(RAW_OPENAPI_PATH).toBe("/api/admin/integrations/openapi");
        expect(read(`${APP_DOCS}/api-reference/page.tsx`)).toContain("RAW_OPENAPI_PATH");
    });

    it("a navigation slug never resolves to a Markdown document it does not have", () => {
        // The reference is navigation without a registry entry. If the two lists were one, the
        // dynamic `[section]` route would try to load a document called "api-reference".
        expect(loadDocument("api-reference")).toBeNull();
        expect(DOCUMENTATION_SECTIONS.map((s) => s.slug)).not.toContain("api-reference");
    });

    it("the way back out of the documentation tab exists and points at Integrations", () => {
        expect(INTEGRATIONS_PATH).toBe("/organization/integrations");
        const shell = read(`${APP_DOCS}/DocumentationShell.tsx`);
        expect(shell).toContain("documentation-back-to-integrations");
        expect(shell).toContain("INTEGRATIONS_PATH");
    });
});

describe("the breadcrumb says where the reader is, not which route they are on", () => {
    const breadcrumb = read("app/adminV2/settings/SettingsHierarchyBreadcrumb.tsx");

    it("integrations and its documentation have real labels", () => {
        expect(breadcrumb).toContain('tail.startsWith("/integrations/")');
        expect(breadcrumb).toContain("DOCUMENTATION_LABEL");
        expect(breadcrumb).toContain("documentationTitle");
    });

    it("the breadcrumb does not import the embedded documents into the client bundle", () => {
        // It is a client component. Importing `documentationSources` would ship every governed
        // document to the browser to render four words.
        expect(breadcrumb).toContain("@/lib/developerDocs/documentationRoutes");
        expect(breadcrumb).not.toContain("documentationSources");
    });
});
