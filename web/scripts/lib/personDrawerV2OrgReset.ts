/**
 * Dev/staging-only helper to publish a new org `entity_layouts` version for
 * person/drawer/default using the builtin `person_drawer_v2` preset.
 *
 * Does not change resolver precedence — org published layouts still win.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildPersonDrawerDefaultDoc } from "@/lib/layout/defaultPersonLayouts";
import { listOrgLayouts, rowToRecord } from "@/lib/layout/entityLayoutsRepo";
import type { EntityLayoutRecord, LayoutDoc } from "@/lib/layout/layoutV2";
import { parseLayoutDoc } from "@/lib/layout/layoutV2Schema";

export const DEFAULT_PERSON_DRAWER_RESET_ORG_ID = "93667019-bd28-49b5-a688-acc9bb1e0a19";
export const PERSON_DRAWER_V2_RESET_CONFIRM = "PERSON_DRAWER_V2_RESET";
export const PERSON_DRAWER_V2_RESET_REASON = "drawer_operating_model_validation";
export const PERSON_DRAWER_V2_RESET_SEEDED_FROM = "person_drawer_v2_reset";

export const PERSON_DRAWER_V2_ENTITY_TYPE = "person";
export const PERSON_DRAWER_V2_SURFACE = "drawer" as const;
export const PERSON_DRAWER_V2_LAYOUT_KEY = "default";

export const PERSON_DRAWER_V2_EXPECTED_SECTION_KEYS = [
    "person_summary",
    "household_relationships",
    "connected_children",
    "contact_information",
    "notes_communication",
    "recent_activity",
    "documents",
] as const;

export type PersonDrawerLayoutSummary = {
    found: boolean;
    layoutRecordId: string | null;
    version: number | null;
    status: string | null;
    layoutKey: string | null;
    rowSeededFrom: string | null;
    docTemplate: string | null;
    sectionKeys: string[];
    isResetTarget: boolean;
};

export type PublishPersonDrawerV2ResetResult = {
    action: "dry_run" | "skipped" | "published";
    orgId: string;
    previousPublished: PersonDrawerLayoutSummary;
    nextVersion: number | null;
    published: PersonDrawerLayoutSummary | null;
    message: string;
};

function docTemplate(record: EntityLayoutRecord | null): string | null {
    if (!record) return null;
    const template = (record.doc as LayoutDoc | undefined)?.metadata?.template;
    return typeof template === "string" ? template : null;
}

function sectionKeys(record: EntityLayoutRecord | null): string[] {
    if (!record) return [];
    const sections = (record.doc as LayoutDoc | undefined)?.sections;
    return Array.isArray(sections) ? sections.map((s) => s.key) : [];
}

export function summarizePersonDrawerLayout(record: EntityLayoutRecord | null): PersonDrawerLayoutSummary {
    if (!record) {
        return {
            found: false,
            layoutRecordId: null,
            version: null,
            status: null,
            layoutKey: null,
            rowSeededFrom: null,
            docTemplate: null,
            sectionKeys: [],
            isResetTarget: false,
        };
    }
    const rowSeededFrom =
        typeof record.metadata?.seededFrom === "string" ? (record.metadata.seededFrom as string) : null;
    const summary: PersonDrawerLayoutSummary = {
        found: true,
        layoutRecordId: record.id,
        version: record.version,
        status: record.status,
        layoutKey: record.layoutKey,
        rowSeededFrom,
        docTemplate: docTemplate(record),
        sectionKeys: sectionKeys(record),
        isResetTarget: false,
    };
    summary.isResetTarget = isPersonDrawerV2ResetAlreadyPublished(record);
    return summary;
}

export function findLatestPublishedOrgDrawerLayout(
    records: EntityLayoutRecord[],
    layoutKey = PERSON_DRAWER_V2_LAYOUT_KEY,
): EntityLayoutRecord | null {
    const published = records
        .filter((r) => r.layoutKey === layoutKey && r.status === "published" && r.surface === PERSON_DRAWER_V2_SURFACE)
        .sort((a, b) => b.version - a.version);
    return published[0] ?? null;
}

export function buildPersonDrawerV2ResetRowMetadata(previousVersion: number | null): Record<string, unknown> {
    return {
        seededFrom: PERSON_DRAWER_V2_RESET_SEEDED_FROM,
        ...(previousVersion != null ? { previousVersion } : {}),
        resetReason: PERSON_DRAWER_V2_RESET_REASON,
    };
}

/** Idempotent target: latest published reset row already points at person_drawer_v2. */
export function isPersonDrawerV2ResetAlreadyPublished(record: EntityLayoutRecord | null): boolean {
    if (!record || record.status !== "published") return false;
    if (record.metadata?.seededFrom !== PERSON_DRAWER_V2_RESET_SEEDED_FROM) return false;
    return docTemplate(record) === "person_drawer_v2";
}

export function assertPersonDrawerV2ResetAllowed(options?: { allowProduction?: boolean }): void {
    if (options?.allowProduction) return;
    if (process.env.VERCEL_ENV === "production") {
        throw new Error("Refusing to run: VERCEL_ENV=production (pass --allow-production to override)");
    }
    if (process.env.NEXT_PUBLIC_APP_ENV === "production" || process.env.APP_ENV === "production") {
        throw new Error(
            "Refusing to run: APP_ENV/NEXT_PUBLIC_APP_ENV=production (pass --allow-production to override)",
        );
    }
}

export async function loadLatestPublishedPersonDrawerLayout(
    supabase: SupabaseClient,
    orgId: string,
): Promise<EntityLayoutRecord | null> {
    const rows = await listOrgLayouts(supabase, orgId, PERSON_DRAWER_V2_ENTITY_TYPE, PERSON_DRAWER_V2_SURFACE);
    return findLatestPublishedOrgDrawerLayout(rows, PERSON_DRAWER_V2_LAYOUT_KEY);
}

export async function publishPersonDrawerV2ResetForOrg(
    supabase: SupabaseClient,
    orgId: string,
    options?: { dryRun?: boolean; force?: boolean },
): Promise<PublishPersonDrawerV2ResetResult> {
    const dryRun = options?.dryRun ?? false;
    const force = options?.force ?? false;
    const previousPublishedRecord = await loadLatestPublishedPersonDrawerLayout(supabase, orgId);
    const previousPublished = summarizePersonDrawerLayout(previousPublishedRecord);

    if (!force && isPersonDrawerV2ResetAlreadyPublished(previousPublishedRecord)) {
        return {
            action: "skipped",
            orgId,
            previousPublished,
            nextVersion: null,
            published: previousPublished,
            message: "Latest published org drawer layout is already person_drawer_v2 reset target.",
        };
    }

    const sameKeyRows = (await listOrgLayouts(supabase, orgId, PERSON_DRAWER_V2_ENTITY_TYPE, PERSON_DRAWER_V2_SURFACE)).filter(
        (r) => r.layoutKey === PERSON_DRAWER_V2_LAYOUT_KEY,
    );
    const nextVersion = sameKeyRows.reduce((max, r) => Math.max(max, r.version), 0) + 1;
    const doc = buildPersonDrawerDefaultDoc();
    const parsed = parseLayoutDoc(doc);
    if (!parsed.ok) {
        throw new Error(`buildPersonDrawerDefaultDoc() is invalid: ${parsed.errors.join("; ")}`);
    }

    if (dryRun) {
        return {
            action: "dry_run",
            orgId,
            previousPublished,
            nextVersion,
            published: summarizePersonDrawerLayout({
                id: "(dry-run)",
                orgId,
                industryKey: null,
                entityType: PERSON_DRAWER_V2_ENTITY_TYPE,
                surface: PERSON_DRAWER_V2_SURFACE,
                layoutKey: PERSON_DRAWER_V2_LAYOUT_KEY,
                name: "Person drawer default (operating model v2 reset)",
                version: nextVersion,
                status: "published",
                isSystemDefault: false,
                doc,
                metadata: buildPersonDrawerV2ResetRowMetadata(previousPublished.version),
                createdBy: null,
                createdAt: new Date(0).toISOString(),
                updatedAt: null,
                publishedAt: null,
            }),
            message: "Dry run — no row inserted.",
        };
    }

    const now = new Date().toISOString();
    const { data, error } = await supabase
        .from("entity_layouts")
        .insert({
            org_id: orgId,
            entity_type: PERSON_DRAWER_V2_ENTITY_TYPE,
            surface: PERSON_DRAWER_V2_SURFACE,
            layout_key: PERSON_DRAWER_V2_LAYOUT_KEY,
            name: "Person drawer default (operating model v2 reset)",
            version: nextVersion,
            status: "published",
            doc,
            metadata: buildPersonDrawerV2ResetRowMetadata(previousPublished.version),
            published_at: now,
            updated_at: now,
        })
        .select(
            "id, org_id, industry_key, entity_type, surface, layout_key, name, version, status, is_system_default, doc, metadata, created_by, created_at, updated_at, published_at",
        )
        .single();
    if (error) throw new Error(error.message);

    const publishedRecord = rowToRecord(data as Parameters<typeof rowToRecord>[0]);

    return {
        action: "published",
        orgId,
        previousPublished,
        nextVersion,
        published: summarizePersonDrawerLayout(publishedRecord),
        message: `Published entity_layouts v${nextVersion} for org person drawer default.`,
    };
}
