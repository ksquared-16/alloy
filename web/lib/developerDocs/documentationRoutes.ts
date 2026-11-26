/**
 * Where Developer Documentation lives, and what each destination is called.
 *
 * Separate from `documentationSources` on purpose: that module carries the embedded Markdown, and
 * anything that imports it pulls sixty kilobytes of governed documents along. The breadcrumb is a
 * client component and needs only the names, so the names live here — one definition, imported by
 * both, and no way for a rail label and a breadcrumb label to disagree.
 */

export const DOCUMENTATION_BASE_PATH = "/organization/integrations/documentation";
export const INTEGRATIONS_PATH = "/organization/integrations";

/** The rendered reference. Its own route rather than a link straight at raw JSON. */
export const API_REFERENCE_SLUG = "api-reference";
export const API_REFERENCE_PATH = `${DOCUMENTATION_BASE_PATH}/${API_REFERENCE_SLUG}`;

/** The governed specification itself, still one click away for anyone who wants the document. */
export const RAW_OPENAPI_PATH = "/api/admin/integrations/openapi";

/** What Developer Documentation is called in product language, not route language. */
export const DOCUMENTATION_LABEL = "Developer documentation";

/** Every destination's title, keyed by slug. */
export const DOCUMENTATION_TITLES: Readonly<Record<string, string>> = Object.freeze({
    "getting-started": "Getting started",
    locations: "Locations",
    conventions: "Conventions",
    integrating: "Integrating with Alloy",
    specification: "Full specification",
    [API_REFERENCE_SLUG]: "API Reference",
});

/** A readable title for a slug, falling back to the slug made legible rather than shown raw. */
export function documentationTitle(slug: string): string {
    return (
        DOCUMENTATION_TITLES[slug]
        ?? slug.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase())
    );
}
