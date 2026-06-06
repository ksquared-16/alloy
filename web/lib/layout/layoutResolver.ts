/**
 * Layout V2 — resolver (Deliverable A).
 *
 * Resolution order (per design doc):
 *
 *     Org Layout (published)
 *         ↓
 *     Default Layout (published, org_id NULL / industry default)
 *         ↓
 *     entityPresentation.ts  ← Layer 0, must always remain intact
 *
 * The resolver is a PURE function: callers fetch candidate `entity_layouts`
 * records (org + default) however they like, and pass them in. When neither a
 * published org layout nor a published default exists, the resolver converts
 * the legacy registry on the fly via the migration utility — so an org with no
 * Layout V2 rows behaves exactly as today (zero runtime impact / full backward
 * compatibility). Nothing here touches the live drawer/queue runtime.
 */

import type { EntityPresentationType } from "@/lib/entityPresentation";
import { layoutDocFromRegistry } from "./migrateFromRegistry";
import { buildLeadDefaultDoc } from "./defaultLeadLayouts";
import type {
    EntityLayoutRecord,
    LayoutResolution,
    LayoutSurface,
} from "./layoutV2";

export interface ResolveLayoutInput {
    entityType: string;
    surface: LayoutSurface;
    /** Candidate org-scoped records for this (entity_type, surface). */
    orgRecords?: EntityLayoutRecord[];
    /** Candidate default records (org_id NULL or is_system_default). */
    defaultRecords?: EntityLayoutRecord[];
}

/** Pick the highest published version from a candidate list (or null). */
function latestPublished(records: EntityLayoutRecord[] | undefined, surface: LayoutSurface): EntityLayoutRecord | null {
    if (!records || records.length === 0) return null;
    const published = records
        .filter((r) => r.status === "published" && r.surface === surface)
        .sort((a, b) => b.version - a.version);
    return published[0] ?? null;
}

/**
 * Resolve the effective layout for an (entity_type, surface).
 *
 * Falls back to the legacy registry conversion when no published org/default
 * record is supplied. The registry fallback is total: it always yields a doc.
 */
export function resolveLayout(input: ResolveLayoutInput): LayoutResolution {
    const orgRecord = latestPublished(input.orgRecords, input.surface);
    if (orgRecord) {
        return { doc: orgRecord.doc, source: "org", record: orgRecord };
    }

    const defaultRecord = latestPublished(input.defaultRecords, input.surface);
    if (defaultRecord) {
        return { doc: defaultRecord.doc, source: "default", record: defaultRecord };
    }

    // Curated default — for entities with a hand-built Lead default (opportunities),
    // prefer it over the raw registry conversion so an un-configured org still gets
    // the correct household queue card / Lead drawer (not the generic table columns,
    // which surface the opportunity name/title and a raw location column).
    const curated = buildLeadDefaultDoc(input.entityType, input.surface);
    if (curated) {
        return { doc: curated, source: "default" };
    }

    // Layer 0 fallback — convert entityPresentation.ts. Unknown entity types
    // resolve to the registry's safe empty config (see getEntityPresentation).
    const doc = layoutDocFromRegistry(input.entityType as EntityPresentationType, input.surface);
    return { doc, source: "registry" };
}

/**
 * Convenience for the preview path: resolve straight from the registry,
 * bypassing the DB entirely. Used by the config UI's "import from registry".
 */
export function resolveFromRegistry(entityType: string, surface: LayoutSurface): LayoutResolution {
    return {
        doc: layoutDocFromRegistry(entityType as EntityPresentationType, surface),
        source: "registry",
    };
}
