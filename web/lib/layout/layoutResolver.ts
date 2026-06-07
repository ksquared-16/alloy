/**
 * Layout runtime — extended resolution (Phase 0).
 *
 * Extends the pure resolver with queue variant matching and builtin curated
 * fallbacks. Does NOT wire into live drawer/queue renderers — callers opt in
 * when LAYOUT_RUNTIME_ENABLED is on (see featureFlag.ts).
 */

import type { EntityPresentationType } from "@/lib/entityPresentation";
import { resolveBuiltinQueueLayoutVariant } from "./defaultQueueLayoutVariants";
import { layoutDocFromRegistry } from "./migrateFromRegistry";
import { resolveQueueLayoutVariantFromRecords } from "./resolveQueueLayoutVariant";
import type {
    EntityLayoutRecord,
    LayoutResolution,
    LayoutSurface,
} from "./layoutV2";
import type { QueueLayoutContextRequest } from "./queueLayoutContext";
import { isQueueLayoutContextEmpty } from "./queueLayoutContext";

export type ExtendedLayoutResolution = LayoutResolution & {
    layoutKey?: string;
    matchedQueueContext?: QueueLayoutContextRequest;
    matchTier?: string;
};

export interface ResolveLayoutInput {
    entityType: string;
    surface: LayoutSurface;
    /** Candidate org-scoped records for this (entity_type, surface). */
    orgRecords?: EntityLayoutRecord[];
    /** Candidate default records (org_id NULL or is_system_default). */
    defaultRecords?: EntityLayoutRecord[];
    /** Queue surface only: lane/work-unit discriminators for variant selection. */
    queueContext?: QueueLayoutContextRequest;
}

function latestPublished(
    records: EntityLayoutRecord[] | undefined,
    surface: LayoutSurface,
): EntityLayoutRecord | null {
    if (!records?.length) return null;
    const published = records
        .filter((r) => r.status === "published" && r.surface === surface)
        .sort((a, b) => b.version - a.version);
    return published[0] ?? null;
}

/**
 * Resolve the effective layout for an (entity_type, surface).
 *
 * Drawer: org → default → registry (Layer 0 — unchanged parity).
 * Queue: DB variant match → builtin variant (when context provided) → registry.
 */
export function resolveLayout(input: ResolveLayoutInput): ExtendedLayoutResolution {
    const { entityType, surface, orgRecords, defaultRecords, queueContext } = input;

    if (surface === "queue") {
        const variantMatch = resolveQueueLayoutVariantFromRecords(orgRecords, defaultRecords, queueContext);
        if (variantMatch) {
            return {
                doc: variantMatch.record.doc,
                source: variantMatch.record.orgId ? "org" : "default",
                record: variantMatch.record,
                layoutKey: variantMatch.record.layoutKey,
                matchedQueueContext: queueContext,
                matchTier: variantMatch.tier,
            };
        }

        if (queueContext && !isQueueLayoutContextEmpty(queueContext)) {
            const builtin = resolveBuiltinQueueLayoutVariant(entityType, queueContext);
            if (builtin) {
                return {
                    doc: builtin.doc,
                    source: "builtin",
                    layoutKey: builtin.variant.layoutKey,
                    matchedQueueContext: queueContext,
                    matchTier: "builtin",
                };
            }
        }
    } else {
        const orgRecord = latestPublished(orgRecords, surface);
        if (orgRecord) {
            return { doc: orgRecord.doc, source: "org", record: orgRecord, layoutKey: orgRecord.layoutKey };
        }

        const defaultRecord = latestPublished(defaultRecords, surface);
        if (defaultRecord) {
            return {
                doc: defaultRecord.doc,
                source: "default",
                record: defaultRecord,
                layoutKey: defaultRecord.layoutKey,
            };
        }
    }

    const doc = layoutDocFromRegistry(entityType as EntityPresentationType, surface);
    return { doc, source: "registry" };
}

/** Convenience: resolve straight from the registry, bypassing the DB entirely. */
export function resolveFromRegistry(entityType: string, surface: LayoutSurface): ExtendedLayoutResolution {
    return {
        doc: layoutDocFromRegistry(entityType as EntityPresentationType, surface),
        source: "registry",
    };
}
