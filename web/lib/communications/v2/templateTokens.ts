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
    "contact",
    "child",
    "location",
    "program",
    "enrollment",
    "schedule",
    "org",
] as const;
export type CommunicationTokenGroup = (typeof COMMUNICATION_TOKEN_GROUPS)[number];

/** Operator-facing group headings for the token picker. */
export const COMMUNICATION_TOKEN_GROUP_LABELS: Record<CommunicationTokenGroup, string> = {
    family: "Family",
    contact: "Parent / Person",
    child: "Child",
    location: "Location",
    program: "Program",
    enrollment: "Enrollment / opportunity",
    schedule: "Schedule / tour",
    org: "Organization",
};

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
    // family / customer
    { path: "customer.id", label: "Family ID", group: "family", sample: "fam_1042" },
    { path: "customer.name", label: "Family name", group: "family", sample: "The Rivera Family" },
    // child
    { path: "person.first_name", label: "Child first name", group: "child", sample: "Mateo" },
    { path: "person.name", label: "Child full name", group: "child", sample: "Mateo Rivera" },
    { path: "person.id", label: "Child / person ID", group: "child", sample: "per_5567" },
    // contact / guardian (documented workflow merge paths + platform person fields)
    { path: "contact.id", label: "Parent / contact ID", group: "contact", sample: "con_8821" },
    { path: "contact.first_name", label: "Parent first name", group: "contact", sample: "Maria" },
    { path: "contact.last_name", label: "Parent last name", group: "contact", sample: "Rivera" },
    { path: "contact.email", label: "Parent email", group: "contact", sample: "rivera@example.com" },
    { path: "contact.phone", label: "Parent phone", group: "contact", sample: "(555) 010-2048" },
    { path: "person.last_name", label: "Person last name", group: "contact", sample: "Rivera" },
    { path: "person.email", label: "Person email", group: "contact", sample: "rivera@example.com" },
    { path: "person.phone", label: "Person phone", group: "contact", sample: "(555) 010-2048" },
    // location
    { path: "location.name", label: "Location name", group: "location", sample: "North Campus" },
    // program
    { path: "opportunity.program", label: "Program name", group: "program", sample: "Toddlers" },
    // enrollment / opportunity
    { path: "opportunity.id", label: "Opportunity ID", group: "enrollment", sample: "opp_3301" },
    { path: "opportunity.name", label: "Opportunity / child inquiry name", group: "enrollment", sample: "Mateo Rivera inquiry" },
    // schedule / tour / job (documented workflow merge paths)
    {
        path: "opportunity.metadata.tour_date",
        label: "Tour date",
        group: "schedule",
        sample: "July 14, 2026",
    },
    {
        path: "opportunity.metadata.tour_time",
        label: "Tour time",
        group: "schedule",
        sample: "10:00 AM",
    },
    {
        path: "schedule.start_at",
        label: "Scheduled start",
        group: "schedule",
        sample: "July 14, 2026 at 10:00 AM",
    },
    { path: "job.id", label: "Job ID", group: "schedule", sample: "job_9012" },
    { path: "job.title", label: "Job title", group: "schedule", sample: "North Campus tour" },
    // Tour system templates (snake_case merge fields used by Tour lifecycle copy)
    {
        path: "invitation_action_url",
        label: "Choose-tour-time link",
        group: "schedule",
        sample: "https://example.com/a/tour",
    },
    {
        path: "add_to_calendar_url",
        label: "Calendar link",
        group: "schedule",
        sample: "https://calendar.google.com/calendar/render?action=TEMPLATE",
    },
    {
        path: "reschedule_url",
        label: "Reschedule-tour link",
        group: "schedule",
        sample: "https://example.com/tour-booking/reschedule",
    },
    {
        path: "confirm_attendance_url",
        label: "Confirm-attendance link",
        group: "schedule",
        sample: "https://example.com/tour-booking/confirm-coming",
    },
    {
        path: "confirm_reply_instruction",
        label: "SMS confirm-reply instruction",
        group: "schedule",
        sample: " Reply 1 to confirm you're coming.",
    },
    {
        path: "cancel_url",
        label: "Manage-tour link",
        group: "schedule",
        sample: "https://example.com/tour-booking/manage",
    },
    {
        path: "public_booking_url",
        label: "Public booking link",
        group: "schedule",
        sample: "https://example.com/tour-booking/book",
    },
    {
        path: "tour_display_label",
        label: "Tour date and time",
        group: "schedule",
        sample: "Monday, August 10 at 10:00 AM",
    },
    {
        path: "tour_date_label",
        label: "Tour date",
        group: "schedule",
        sample: "Monday, August 10",
    },
    {
        path: "tour_time_label",
        label: "Tour time",
        group: "schedule",
        sample: "10:00 AM",
    },
    {
        path: "parent_name",
        label: "Contact first name",
        group: "contact",
        sample: "Kelly",
    },
    {
        path: "location_name",
        label: "Location",
        group: "location",
        sample: "North Campus",
    },
    {
        path: "location_address",
        label: "Location address",
        group: "location",
        sample: "123 Main St",
    },
    {
        path: "org_name",
        label: "Organization name",
        group: "org",
        sample: "Bright Beginnings",
    },
    {
        path: "organization_name",
        label: "Organization name (alias)",
        group: "org",
        sample: "Bright Beginnings",
    },
    {
        path: "site_line",
        label: "Site line",
        group: "location",
        sample: "North Campus · 123 Main St",
    },
    // org
    { path: "org.name", label: "Organization name (dot path)", group: "org", sample: "Bright Beginnings" },
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

/** Filter catalog entries by label/path query; returns grouped matches for the picker. */
export function filterCommunicationTokens(query: string): Array<{
    group: CommunicationTokenGroup;
    tokens: CommunicationTokenDef[];
}> {
    const q = query.trim().toLowerCase();
    if (!q) return listCommunicationTokensByGroup();
    const matches = COMMUNICATION_TOKEN_CATALOG.filter(
        (t) => t.label.toLowerCase().includes(q) || t.path.toLowerCase().includes(q) || t.group.includes(q)
    );
    return COMMUNICATION_TOKEN_GROUPS.map((group) => ({
        group,
        tokens: matches.filter((t) => t.group === group),
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
