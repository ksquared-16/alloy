/**
 * Communications V2 — template token core (Phase 1, Batch B0).
 *
 * Standardizes communication templates on the `{{dot.path}}` token syntax and
 * reuses the canonical, already-tested render engine in `@/lib/workflowTemplate`
 * (`renderTemplate` / `getByPath`). This module adds only the comms-specific
 * pieces: the available-token catalog and authoring-time parse / validate /
 * segment helpers (modeled on the Forms inline-token resolver pattern in
 * `@/lib/forms/inlineFieldTokens`).
 *
 * Pure logic ONLY — no schema, no UI, no provider code, no announcement code.
 * Consumed later by the Templates editor picker, the validator, and the
 * preview API (B2/B3).
 */

import { getByPath, renderTemplate } from "@/lib/workflowTemplate";

/**
 * `{{ dot.path }}` — a leading letter, then letters/digits/underscore/dot.
 * Surrounding whitespace inside the braces is tolerated and trimmed.
 * A fresh RegExp is built per use (global regexes carry `lastIndex` state).
 */
export const COMMUNICATION_TOKEN_PATTERN_SOURCE = "\\{\\{\\s*([a-zA-Z][a-zA-Z0-9_.]*)\\s*\\}\\}";

function makeTokenRegex(): RegExp {
    return new RegExp(COMMUNICATION_TOKEN_PATTERN_SOURCE, "g");
}

export const COMMUNICATION_TOKEN_GROUPS = [
    "family",
    "child",
    "contact",
    "location",
    "program",
    "tour",
    "org",
] as const;
export type CommunicationTokenGroup = (typeof COMMUNICATION_TOKEN_GROUPS)[number];

export type CommunicationTokenDef = {
    /** Dot-path resolved against the render context, e.g. "person.first_name". */
    path: string;
    /** Human label for the editor picker. */
    label: string;
    group: CommunicationTokenGroup;
    /** Sample value used by previews when no real record is bound. */
    sample: string;
};

/**
 * Initial communication token catalog (Phase 1 plan §D.4).
 *
 * Seeded from the documented workflow merge paths
 * (`WORKFLOW_DOCUMENTED_MERGE_PATHS`) and extended with the comms-specific
 * fields the Templates editor needs. This is the single source of truth for
 * "what tokens may I use?" — the picker, the validator, and the preview all
 * read it. Membership here is what makes a referenced path `known` vs
 * `unknown`; whether a known path actually resolves depends on the context the
 * caller supplies at render time (a missing value renders as empty string,
 * matching `renderTemplate`).
 */
export const COMMUNICATION_TOKEN_CATALOG: readonly CommunicationTokenDef[] = [
    // family
    { path: "customer.id", label: "Family ID", group: "family", sample: "fam_1042" },
    { path: "customer.name", label: "Family name", group: "family", sample: "The Rivera Family" },
    // child
    { path: "person.first_name", label: "Child first name", group: "child", sample: "Mateo" },
    { path: "person.name", label: "Child full name", group: "child", sample: "Mateo Rivera" },
    { path: "person.id", label: "Child ID", group: "child", sample: "per_5567" },
    // contact
    { path: "contact.email", label: "Contact email", group: "contact", sample: "rivera@example.com" },
    { path: "contact.phone", label: "Contact phone", group: "contact", sample: "(555) 010-2048" },
    // location
    { path: "location.name", label: "Location name", group: "location", sample: "North Campus" },
    // program
    { path: "opportunity.program", label: "Program", group: "program", sample: "Toddlers" },
    // tour
    {
        path: "opportunity.metadata.tour_date",
        label: "Tour date",
        group: "tour",
        sample: "July 14, 2026",
    },
    {
        path: "opportunity.metadata.tour_time",
        label: "Tour time",
        group: "tour",
        sample: "10:00 AM",
    },
    // org
    { path: "org.name", label: "Organization name", group: "org", sample: "Bright Beginnings" },
] as const;

const TOKEN_BY_PATH: ReadonlyMap<string, CommunicationTokenDef> = new Map(
    COMMUNICATION_TOKEN_CATALOG.map((d) => [d.path, d])
);

/** Catalog membership test. */
export function isKnownCommunicationTokenPath(path: string): boolean {
    return TOKEN_BY_PATH.has(path);
}

/** Look up a catalog entry by path (null if not in catalog). */
export function getCommunicationTokenDef(path: string): CommunicationTokenDef | null {
    return TOKEN_BY_PATH.get(path) ?? null;
}

/** Catalog grouped for the editor picker (stable group order). */
export function listCommunicationTokensByGroup(): Array<{
    group: CommunicationTokenGroup;
    tokens: CommunicationTokenDef[];
}> {
    return COMMUNICATION_TOKEN_GROUPS.map((group) => ({
        group,
        tokens: COMMUNICATION_TOKEN_CATALOG.filter((t) => t.group === group),
    })).filter((g) => g.tokens.length > 0);
}

/** Extract unique `{{dot.path}}` references from text, in first-seen order. */
export function parseCommunicationTokenPaths(text: string): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    if (typeof text !== "string" || text.length === 0) return out;
    const re = makeTokenRegex();
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
        const path = m[1].trim();
        if (!path || seen.has(path)) continue;
        seen.add(path);
        out.push(path);
    }
    return out;
}

/** Split referenced paths into catalog-known vs unknown (preserves order). */
export function validateCommunicationTokenPaths(text: string): {
    knownPaths: string[];
    unknownPaths: string[];
} {
    const knownPaths: string[] = [];
    const unknownPaths: string[] = [];
    for (const path of parseCommunicationTokenPaths(text)) {
        if (TOKEN_BY_PATH.has(path)) knownPaths.push(path);
        else unknownPaths.push(path);
    }
    return { knownPaths, unknownPaths };
}

export type CommunicationTokenStatus = "resolved" | "missing" | "unknown";

export type CommunicationTokenSegment =
    | { kind: "text"; text: string }
    | {
          kind: "token";
          path: string;
          /** Catalog label, or null when the path is unknown. */
          label: string | null;
          status: CommunicationTokenStatus;
          /** Resolved display value when `status === "resolved"`, else null. */
          value: string | null;
      };

export type CommunicationTokenResolution = {
    segments: CommunicationTokenSegment[];
    /** Referenced paths not present in the catalog. */
    unknownPaths: string[];
    /** Catalog paths with no value in the supplied context. */
    missingPaths: string[];
    /** Fully rendered text (missing/unknown tokens collapse to empty string). */
    plainText: string;
};

/**
 * Decompose template text into text/token segments with per-token status,
 * mirroring the Forms `resolveInlineFieldTokens` shape but for `{{dot.path}}`.
 *
 * - `unknown`  — path is not in the catalog.
 * - `missing`  — path is in the catalog but the context has no value (or no
 *                context was supplied).
 * - `resolved` — path is in the catalog and the context yields a value.
 *
 * `plainText` is produced by the canonical `renderTemplate`, so the rendered
 * output is always consistent with the rest of the platform.
 */
export function segmentCommunicationTemplate(
    text: string,
    context?: Record<string, unknown>
): CommunicationTokenResolution {
    if (typeof text !== "string" || text.length === 0) {
        return { segments: [], unknownPaths: [], missingPaths: [], plainText: "" };
    }

    const segments: CommunicationTokenSegment[] = [];
    const unknownSet = new Set<string>();
    const missingSet = new Set<string>();
    const re = makeTokenRegex();
    let lastIndex = 0;
    let m: RegExpExecArray | null;

    while ((m = re.exec(text)) !== null) {
        if (m.index > lastIndex) {
            segments.push({ kind: "text", text: text.slice(lastIndex, m.index) });
        }
        const path = m[1].trim();
        const def = TOKEN_BY_PATH.get(path) ?? null;
        let status: CommunicationTokenStatus;
        let value: string | null = null;

        if (!def) {
            status = "unknown";
            unknownSet.add(path);
        } else {
            const raw = context ? getByPath(context, path) : undefined;
            if (raw == null || raw === "") {
                status = "missing";
                missingSet.add(path);
            } else {
                status = "resolved";
                value = String(raw);
            }
        }

        segments.push({ kind: "token", path, label: def?.label ?? null, status, value });
        lastIndex = m.index + m[0].length;
    }

    if (lastIndex < text.length) {
        segments.push({ kind: "text", text: text.slice(lastIndex) });
    }

    return {
        segments,
        unknownPaths: [...unknownSet],
        missingPaths: [...missingSet],
        plainText: renderCommunicationTemplate(text, context ?? {}),
    };
}

/**
 * Render template text against a context. Thin pass-through to the canonical
 * `renderTemplate` so all communication rendering shares one engine and the
 * `{{dot.path}}` / missing-value-as-empty-string semantics.
 */
export function renderCommunicationTemplate(
    text: string,
    context: Record<string, unknown>
): string {
    return renderTemplate(text, context);
}
