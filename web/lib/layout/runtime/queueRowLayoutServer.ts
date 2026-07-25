/**
 * The ONE server-side owner of published queue-row layout resolution.
 *
 * Extracted from app/api/admin/queue-row-layout/[surfaceId]/route.ts, where this chain was
 * route-local. It is now consumed by BOTH:
 *   - that route (the builder persistence endpoint), and
 *   - the D1 Provisioning Answer (U-P7 operational presentation composition).
 *
 * WHY IT MOVED. U-P7 requires "operational presentation composition required to render U-O1…U-O5 in
 * final layout … server, from Configuration". D1 previously returned a layout *identifier*, which IS
 * the round-trip U-P7 exists to remove: the client had to fetch to resolve it, so presentation either
 * gated the commit or the surface re-laid itself out afterwards. Resolving here, server-side, into the
 * one answer, removes the question. Duplicating the route's logic inside D1 would have created a
 * second resolver and let builder and runtime drift — so the resolution moved, rather than being copied.
 *
 * The canonical chain, unchanged:
 *   resolveQueueRowSurfaceSpec → listOrgLayouts + listDefaultLayouts → resolveLayout
 *   → envelopeFromResolution → (caller) mapQueueRowSurfaceToCompactConfig
 *
 * ON THE FEATURE GATE. `isLayoutV2ConfigEnabledServer()` may only downgrade the result from
 * `published` to the canonical builtin default — never to "unavailable". Published configuration is
 * honoured whenever it resolves; the fallback is canonical, not a silent discard. A flag therefore
 * cannot leave D1 unable to satisfy U-P7.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { isLayoutV2ConfigEnabledServer } from "@/lib/layout/featureFlag";
import { listDefaultLayouts, listOrgLayouts } from "@/lib/layout/entityLayoutsRepo";
import { resolveSurfaceVariant, type SurfaceVariantCandidate } from "@/lib/layout/resolveSurfaceVariant";
import { resolveQueueRecordLayoutConfig } from "@/lib/layout/runtime/resolveQueueRecordLayoutConfig";
import {
    defaultWaitlistQueueLayoutV3,
    type QueueRecordLayoutConfigV3,
} from "@/lib/layout/queueRecordLayoutV3";
import { defaultEnrollmentQueueRowLayoutWithVariantsV1 } from "@/lib/layout/queueRecordLayoutDefaults";
import type { LayoutDoc, LayoutSurface, EntityLayoutRecord } from "@/lib/layout/layoutV2";
import { WAITLIST_CANDIDATE_ENTITY_TYPE } from "@/lib/layout/waitlist/waitlistCandidateCardVm";
import { resolveLayout } from "@/lib/layout/layoutResolver";
import {
    LEGACY_PIPELINE_QUEUE_ROW_SURFACE_ID,
    LEGACY_WAITLIST_QUEUE_ROW_SURFACE_ID,
    catalogIdFromQueueRowSurfaceId,
    queueRowLayoutKeyForProcessKey,
} from "@/lib/adminV2/settings/surfaces/queueRowProcessCatalog";
import {
    buildDefaultQueueRowSurfaceEnvelope,
    readQueueRowSurfaceFromDocMetadata,
    type QueueRowSurfaceEnvelope,
} from "@/lib/presentation/runtime/queueRowSurfaceMetadata";

export type QueueRowSurfaceSpec = {
    entityType: string;
    isWaitlist: boolean;
    layoutKey: string;
    queueType: string;
    defaultEnvelope: () => QueueRowSurfaceEnvelope;
};

function legacyPipelineSpec(): QueueRowSurfaceSpec {
    return {
        entityType: "opportunities",
        isWaitlist: false,
        layoutKey: "pipeline_queue_row",
        queueType: "pipeline",
        defaultEnvelope: () =>
            buildDefaultQueueRowSurfaceEnvelope({ catalogId: "", processKey: "enrollment", processName: "Enrollment" }),
    };
}

export function resolveQueueRowSurfaceSpec(
    surfaceId: string,
    processKeyHint?: string | null,
): QueueRowSurfaceSpec | null {
    // Legacy pipeline id + a process key → resolve the process Surface Builder layout
    // (`queue_row_${processKey}`). Otherwise live Work Units that still carry
    // `pipeline-queue-row` provenance never read the published Enrollment surface.
    if (surfaceId === LEGACY_PIPELINE_QUEUE_ROW_SURFACE_ID) {
        const processKey = processKeyHint?.trim();
        if (processKey) {
            return {
                entityType: "opportunities",
                isWaitlist: false,
                layoutKey: queueRowLayoutKeyForProcessKey(processKey),
                queueType: "pipeline",
                defaultEnvelope: () =>
                    buildDefaultQueueRowSurfaceEnvelope({
                        catalogId: "",
                        processKey,
                        processName: "Enrollment",
                    }),
            };
        }
        return legacyPipelineSpec();
    }
    if (surfaceId === LEGACY_WAITLIST_QUEUE_ROW_SURFACE_ID) {
        return {
            entityType: WAITLIST_CANDIDATE_ENTITY_TYPE,
            isWaitlist: true,
            layoutKey: "waitlist_queue_row",
            queueType: "waitlist",
            defaultEnvelope: () => ({
                name: "Waitlist Queue Row",
                catalogId: "",
                processKey: "enrollment",
                layout: defaultWaitlistQueueLayoutV3(),
            }),
        };
    }
    const catalogId = catalogIdFromQueueRowSurfaceId(surfaceId);
    if (!catalogId) return null;
    const processKey = processKeyHint?.trim() || "enrollment";
    return {
        entityType: "opportunities",
        isWaitlist: false,
        layoutKey: queueRowLayoutKeyForProcessKey(processKey),
        queueType: "pipeline",
        defaultEnvelope: () =>
            buildDefaultQueueRowSurfaceEnvelope({ catalogId, processKey, processName: "Enrollment" }),
    };
}

export function envelopeFromResolution(
    spec: QueueRowSurfaceSpec,
    doc: LayoutDoc | null | undefined,
    catalogId: string,
    processKey: string,
): QueueRowSurfaceEnvelope {
    const fromMeta = readQueueRowSurfaceFromDocMetadata((doc?.metadata ?? {}) as Record<string, unknown>);
    if (fromMeta?.layout) {
        return {
            ...fromMeta,
            catalogId: fromMeta.catalogId || catalogId,
            processKey: fromMeta.processKey || processKey,
        };
    }
    const layout = resolveQueueRecordLayoutConfig(doc) ?? defaultEnrollmentQueueRowLayoutWithVariantsV1();
    return {
        name: spec.isWaitlist ? "Waitlist Queue Row" : "Enrollment Queue Row",
        catalogId,
        processKey,
        layout,
    };
}

export type QueueRowLayoutResolution = {
    envelope: QueueRowSurfaceEnvelope;
    config: QueueRecordLayoutConfigV3 | null;
    placementOverrideEnabled: boolean;
    /** `published` | a resolver source | `builtin_default`. Provenance, never a gate. */
    source: string;
};

/**
 * Resolve the published queue-row layout for an org+surface, server-side.
 * Returns `null` only when the surface id itself is unknown — never for a missing publication.
 */
/**
 * Map a published queue-row `entity_layouts` row to a surface-variant candidate. Business-Process /
 * Work-View / stage / status scoping is read from the layout's `metadata` when authored; org-global
 * rows declare all-null constraints (wildcards) so the resolver returns the highest published version.
 */
function queueRecordToVariantCandidate(
    r: EntityLayoutRecord,
    entityType: string,
    surface: LayoutSurface,
): SurfaceVariantCandidate {
    const m = r.metadata ?? {};
    const constraint = (k: string) => (typeof m[k] === "string" ? (m[k] as string) : null);
    return {
        layoutId: r.id,
        layoutKey: r.layoutKey,
        entityType,
        surface,
        status: r.status,
        version: r.version,
        businessProcessKey: constraint("businessProcessKey"),
        workViewId: constraint("workViewId"),
        stageKey: constraint("stageKey"),
        statusKey: constraint("statusKey"),
    };
}

export async function resolveQueueRowLayoutServer(args: {
    supabase: SupabaseClient;
    orgId: string;
    surfaceId: string;
    processKeyHint?: string | null;
    /** Active Work View — the applicability axis for the shared surface-variant resolver (P2). */
    workViewId?: string | null;
}): Promise<QueueRowLayoutResolution | null> {
    const spec = resolveQueueRowSurfaceSpec(args.surfaceId, args.processKeyHint);
    if (!spec) return null;

    const catalogId = catalogIdFromQueueRowSurfaceId(args.surfaceId) ?? "";
    const processKey = args.processKeyHint?.trim() || "enrollment";
    const surface: LayoutSurface = "queue";

    if (isLayoutV2ConfigEnabledServer()) {
        const [orgRecords, defaultRecords] = await Promise.all([
            listOrgLayouts(args.supabase, args.orgId, spec.entityType, surface),
            listDefaultLayouts(args.supabase, spec.entityType, surface),
        ]);
        const resolution = resolveLayout({ entityType: spec.entityType, surface, orgRecords, defaultRecords });
        // One owner: `resolveSurfaceVariant` selects the published queue-row variant (published-only,
        // deterministic, Work-View/Business-Process aware). The exact surface `layoutKey` outranks the
        // legacy `pipeline_queue_row` fallback — so candidates are the exact-key rows when any is
        // published, else the legacy pipeline rows for `queue_row_*` surfaces; the resolver then picks
        // the most applicable published version within that set. The former filter+sort is deleted.
        const exactRecords = orgRecords.filter((r) => r.layoutKey === spec.layoutKey);
        const publishedExact = exactRecords.filter((r) => r.status === "published");
        /**
         * Process queue-row surfaces (`queue_row_*`) are authored as ONE Surface Builder document.
         * Work View / stage applicability lives in **in-doc variants** (`appliesWhen`), not as
         * separate `entity_layouts` rows with metadata.workViewId. Legacy work-view-scoped
         * published rows must not defeat a newer Builder publish when D1 passes workViewId.
         */
        let published: EntityLayoutRecord | null = null;
        if (publishedExact.length > 0 && spec.layoutKey.startsWith("queue_row_")) {
            published = [...publishedExact].sort(
                (a, b) => b.version - a.version || a.id.localeCompare(b.id),
            )[0] ?? null;
        } else {
            const candidateRecords =
                publishedExact.length > 0
                    ? exactRecords
                    : spec.layoutKey.startsWith("queue_row_")
                      ? orgRecords.filter((r) => r.layoutKey === "pipeline_queue_row")
                      : [];
            const variant = resolveSurfaceVariant(
                {
                    businessProcessKey: processKey,
                    workViewId: args.workViewId ?? null,
                    entityType: spec.entityType,
                    surface,
                },
                candidateRecords.map((r) => queueRecordToVariantCandidate(r, spec.entityType, surface)),
            );
            published = variant
                ? candidateRecords.find((r) => r.id === variant.candidate.layoutId) ?? null
                : null;
        }
        const doc = published?.doc ?? resolution.doc;
        const envelope = published ? envelopeFromResolution(spec, doc, catalogId, processKey) : spec.defaultEnvelope();
        const queueCtx = (doc?.metadata as Record<string, unknown> | undefined)?.queue_context as
            | { placement_override_enabled?: boolean }
            | undefined;
        return {
            envelope,
            config: envelope.layout,
            placementOverrideEnabled: queueCtx?.placement_override_enabled ?? false,
            source: published ? "published" : resolution.source,
        };
    }

    const fallback = spec.defaultEnvelope();
    return {
        envelope: fallback,
        config: fallback.layout,
        placementOverrideEnabled: false,
        source: "builtin_default",
    };
}
