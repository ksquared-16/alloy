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
import { buildWaitlistDefaultDoc } from "./defaultWaitlistLayouts";
import { buildRecordDrawerDefaultDoc } from "./defaultRecordDrawers";
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
    /** When set, prefer published rows for this layout_key (Experience Builder uses "default"). */
    layoutKey?: string;
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
    layoutKey?: string,
): EntityLayoutRecord | null {
    if (!records?.length) return null;
    let published = records.filter((r) => r.status === "published" && r.surface === surface);
    if (layoutKey) {
        const keyed = published.filter((r) => r.layoutKey === layoutKey);
        if (keyed.length > 0) published = keyed;
    }
    published.sort((a, b) => b.version - a.version);
    return published[0] ?? null;
}

function resolveDrawerLayoutKey(entityType: string, layoutKey?: string): string | undefined {
    if (layoutKey) return layoutKey;
    if (entityType === "opportunities") return "default";
    return undefined;
}

/**
 * Resolve the effective layout for an (entity_type, surface).
 *
 * Drawer: org → default → registry (Layer 0 — unchanged parity).
 * Queue: DB variant match → builtin variant (when context provided) → registry.
 */
export function resolveLayout(input: ResolveLayoutInput): ExtendedLayoutResolution {
    const { entityType, surface, orgRecords, defaultRecords, queueContext, layoutKey } = input;

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
        const drawerLayoutKey = surface === "drawer" ? resolveDrawerLayoutKey(entityType, layoutKey) : layoutKey;
        const orgRecord = latestPublished(orgRecords, surface, drawerLayoutKey);
        if (orgRecord) {
            return { doc: orgRecord.doc, source: "org", record: orgRecord, layoutKey: orgRecord.layoutKey };
        }

        const defaultRecord = latestPublished(defaultRecords, surface, drawerLayoutKey);
        if (defaultRecord) {
            return {
                doc: defaultRecord.doc,
                source: "default",
                record: defaultRecord,
                layoutKey: defaultRecord.layoutKey,
            };
        }
    }

    // Curated default ONLY for entities with no entityPresentation registry entry
    // (placement_candidate — the candidate-grain card surface). Opportunities keep
    // strict registry parity here (Layer 0); their curated lead/waitlist cards come
    // from the builtin queue-variant path above (keyed by queue_context), preserving
    // the runtime-adoption parity guardrail (runtimeParity.test.ts).
    const curatedNoRegistry = buildWaitlistDefaultDoc(entityType, surface) ?? buildRecordDrawerDefaultDoc(entityType, surface);
    if (curatedNoRegistry) {
        const layoutKey = (curatedNoRegistry.metadata as { layoutKey?: string } | undefined)?.layoutKey;
        return { doc: curatedNoRegistry, source: "default", layoutKey };
    }

    // Layer 0 fallback — convert entityPresentation.ts. Unknown entity types
    // resolve to the registry's safe empty config (see getEntityPresentation).
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
