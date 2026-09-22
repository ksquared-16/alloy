/**
 * Which governed documents an external developer may read, and what the product does to them.
 *
 * ONE AUTHORITY. Every word rendered under `/organization/integrations/documentation` is read from
 * the canonical Markdown in `docs/api/developer-platform/**` at request time. Nothing is copied into
 * JSX, nothing is summarised into a second source of truth, and a correction to a governed file is
 * live the moment it lands.
 *
 * THE EXTERNAL BOUNDARY, in three rules:
 *
 *  1. The registry below is closed. A reader can reach these documents and no others — there is no
 *     slug that resolves to an arbitrary path, so `docs/api/developer-platform/product/**`, which is
 *     internal implementation planning, is unreachable by construction rather than by filtering.
 *  2. Frontmatter is governance metadata about a document, not part of it. It is split off before a
 *     single block is parsed and is used here only to report a document's own declared
 *     `classification` — never rendered into the page.
 *  3. A relative link to a document that is NOT in the registry is not a link. It degrades to plain
 *     text, because an external reader following `../product/08-slice-b2-external-boundary.md`
 *     either lands nowhere or lands somewhere they should not be. Both are worse than prose.
 */

import path from "node:path";

import {
    API_REFERENCE_PATH as REFERENCE_PATH,
    API_REFERENCE_SLUG as REFERENCE_SLUG,
    DOCUMENTATION_BASE_PATH as BASE_PATH,
} from "@/lib/developerDocs/documentationRoutes";
import {
    GOVERNED_DOCUMENT_SOURCES,
    GOVERNED_OPENAPI_DOCUMENT,
} from "@/lib/developerDocs/governedDocuments.generated";
import { parseMarkdownDocument, type MarkdownDocument } from "@/lib/developerDocs/markdown";

export type DocumentationSection = {
    slug: string;
    title: string;
    /** One line of operator/developer language — what this document answers. */
    blurb: string;
    /** Path relative to the repository root. Governed, canonical, and the only source. */
    file: string;
};

/**
 * The reading order a developer actually needs: what this is, how to authenticate, what access
 * means, what they can read today, how requests behave, and then the full specification.
 */
export const DOCUMENTATION_SECTIONS: readonly DocumentationSection[] = [
    {
        slug: "getting-started",
        title: "Getting started",
        blurb: "The model in four words, the first call, and what is callable today.",
        file: "docs/api/developer-platform/guide/README.md",
    },
    {
        slug: "locations",
        title: "Locations",
        blurb: "The first canonical resource — fields, paging, and incremental reads.",
        file: "docs/api/developer-platform/guide/locations.md",
    },
    {
        slug: "conventions",
        title: "Conventions",
        blurb: "Collections, errors, rate limits, and request correlation.",
        file: "docs/api/developer-platform/guide/conventions.md",
    },
    {
        slug: "integrating",
        title: "Integrating with Alloy",
        blurb: "The whole integration in one read: identity, authority, the resource graph, sync, submission and limits.",
        file: "docs/api/developer-platform/guide/integrating.md",
    },
    {
        slug: "specification",
        title: "Full specification",
        blurb: "Authentication, scopes, boundaries, every field and limit — read from the implementation.",
        file: "docs/api/developer-platform/external/alloy-developer-platform-specification.md",
    },
] as const;

export {
    API_REFERENCE_PATH,
    API_REFERENCE_SLUG,
    DOCUMENTATION_BASE_PATH,
    DOCUMENTATION_LABEL,
    INTEGRATIONS_PATH,
    RAW_OPENAPI_PATH,
} from "@/lib/developerDocs/documentationRoutes";

export function documentationSection(slug: string): DocumentationSection | null {
    return DOCUMENTATION_SECTIONS.find((s) => s.slug === slug) ?? null;
}

/**
 * Everything the documentation rail offers, in reading order.
 *
 * The reference is a rendered route rather than a governed Markdown file, so it is a navigation
 * entry without a registry entry — and keeping the two lists separate is what stops a slug that
 * has no document behind it from resolving to one.
 */
export const DOCUMENTATION_NAV: readonly { slug: string; title: string; href: string }[] = [
    ...DOCUMENTATION_SECTIONS.map((section) => ({
        slug: section.slug,
        title: section.title,
        href: `${BASE_PATH}/${section.slug}`,
    })),
    { slug: REFERENCE_SLUG, title: "API Reference", href: REFERENCE_PATH },
];

export type LoadedDocument = {
    section: DocumentationSection;
    document: MarkdownDocument;
    /** The document's own declared classification, if it makes one. Reported, never rendered as body. */
    classification: string | null;
};

/**
 * Read and parse one governed source.
 *
 * A missing file returns null rather than an empty page: a section that renders blank reads as
 * "Alloy has nothing to say about authentication", which is a worse lie than an honest absence.
 */
export function loadDocument(slug: string): LoadedDocument | null {
    const section = documentationSection(slug);
    if (!section) return null;
    /*
     * Read from the embedded artifact, not from disk.
     *
     * This used to be `readFileSync(path.join(process.cwd(), "..", section.file))`. That path is
     * built at runtime and resolves outside `outputFileTracingRoot`, so a deployed serverless
     * runtime had none of these files: every lookup failed, every page called `notFound()`, and
     * every documentation destination answered 404 while working perfectly in development.
     */
    const source = GOVERNED_DOCUMENT_SOURCES[section.file];
    if (source === undefined) return null;
    const document = parseMarkdownDocument(source);
    return { section, document, classification: document.frontmatter.classification ?? null };
}

/**
 * Where a link in a governed document should point in the product.
 *
 * Repository-relative paths are resolved against the registry: a target that is published becomes
 * its documentation route, and everything else becomes `null`, which the renderer draws as plain
 * text. External `http(s)` links are left alone. Anything else — `javascript:`, `data:`, a protocol
 * nobody expected — is refused, because an authored document is content and content does not get to
 * choose a scheme.
 */
export function resolveDocumentationLink(href: string, fromFile: string): string | null {
    const trimmed = href.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("#")) return trimmed;
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return null;

    const [pathPart, hash] = trimmed.split("#");
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), pathPart));
    const target = DOCUMENTATION_SECTIONS.find((s) => s.file === resolved);
    if (target) return `${BASE_PATH}/${target.slug}${hash ? `#${hash}` : ""}`;

    // The governed OpenAPI document has a product home of its own.
    if (resolved === "docs/api/openapi/alloy-public-api.v1.json") return REFERENCE_PATH;
    return null;
}

export type PublicOperation = { method: string; path: string; summary: string };

/**
 * What a developer can call today, read from the governed OpenAPI document.
 *
 * Derived rather than listed. A hand-kept list of "currently three operations" is a sentence that
 * goes stale silently; this one cannot disagree with the specification the drift guard enforces
 * against the running routes.
 */
export function publicOperations(): PublicOperation[] {
    try {
        const spec = JSON.parse(GOVERNED_OPENAPI_DOCUMENT) as {
            paths?: Record<string, Record<string, { summary?: string }>>;
        };
        const methods = new Set(["get", "post", "put", "patch", "delete"]);
        return Object.entries(spec.paths ?? {}).flatMap(([route, operations]) =>
            Object.entries(operations)
                .filter(([method]) => methods.has(method))
                .map(([method, operation]) => ({
                    method: method.toUpperCase(),
                    path: route,
                    summary: String(operation.summary ?? ""),
                })),
        );
    } catch {
        return [];
    }
}
