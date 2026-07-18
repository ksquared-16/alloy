/**
 * U-P7 — OPERATIONAL PRESENTATION COMPOSITION.
 *
 * Governing (landed, in-branch): docs/platform/runtime/runtime-implementation-authorization.md
 *   U-P7 (:145) "Operational presentation composition required to render U-O1…U-O5 **in final
 *   layout** — row layout/variants, header composition, Focus Panel operational composition |
 *   server, from Configuration"
 *   Rationale (:150-154): "the Constitution forbids reflow after commit (Art 1.2, 4.4). Row layout
 *   arriving *after* rows would re-lay them out. In the single answer it can neither gate (no extra
 *   round-trip) nor reflow (it arrives with the rows). **The old defect — presentation gating truth —
 *   disappears not by demoting layout, but by removing the round-trip that made the question exist.**"
 *
 * WHY THIS EXISTS. D1 previously returned layout *identifiers* (`queueLayoutId`,
 * `focusPanelLayoutId`, `rowVariant`). An identifier IS the round-trip: the client had to fetch to
 * resolve it, so presentation either gated the commit or the surface re-laid itself out afterwards.
 * Both are prohibited. This module resolves the composition server-side, into the one answer.
 *
 * ── THE SETTLEMENT BOUNDARY, ENFORCED BY THE TYPE ────────────────────────────────────────────────
 * The live runtime's header model (`WorkspaceHeaderPresentationModel`) mixes two different things:
 *
 *     { title, subtitle, identityIcon, identityAccent,   ← U-P7 operational composition
 *       kpis: [{ …, formattedValue, status }] }          ← U-S5 SETTLEMENT VALUES
 *
 * and today `useWorkUnitSurfaceRuntime.ts:701` returns `null` until `headerMetricsSettled` — so KPI
 * VALUES currently gate Operational Commit, which is exactly what C-24 forbids ("metrics cannot gate
 * a commit"). Importing that model wholesale would drag Settlement across D1's hard boundary.
 *
 * So U-P7 carries **KPI GEOMETRY, never KPI VALUES**: slot, label, icon, accent, sourceKey — enough
 * to lay the header out in its final geometry at first sight, with the values arriving later into
 * *already reserved* space (D5). `OperationalKpiSlot` has no `formattedValue` field, so a value
 * cannot be smuggled in: the boundary is a compile error, not a convention.
 *
 * ── THE FEATURE GATE IS NOT IN THIS PATH ─────────────────────────────────────────────────────────
 * `isLayoutRuntimeOpportunityQueueBodyEnabledServer()` gates the queue *body* layout runtime
 * (`/api/admin/layout-runtime/opportunity-queue-layout`), NOT the queue *row* config this needs.
 * More importantly, `mapQueueRowSurfaceToCompactConfig(null)` returns the canonical generic-context
 * fallback, so row composition is ALWAYS resolvable: published config when present, canonical
 * fallback otherwise — never a fetch, never unavailable. A flag therefore cannot leave D1 unable to
 * satisfy U-P7.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LayoutDoc, EntityLayoutRecord } from "@/lib/layout/layoutV2";
import { listOrgLayouts } from "@/lib/layout/entityLayoutsRepo";
import { resolveSurfaceVariant, type SurfaceVariantCandidate } from "@/lib/layout/resolveSurfaceVariant";
import {
    DEFAULT_WORK_UNIT_HEADER_SURFACE_CONFIG,
    WORK_UNIT_HEADER_LAYOUT_KEY,
    normalizeWorkUnitHeaderSurfaceConfig,
    type WorkUnitHeaderSurfaceConfig,
} from "@/lib/presentation/runtime/workUnitHeaderSurfaceConfig";
import {
    mapQueueRowSurfaceToCompactConfig,
    type CompactRowSlots,
} from "@/lib/presentation/runtime/queueRowSurfaceConfig";
import type { QueueRecordLayoutConfigV3 } from "@/lib/layout/queueRecordLayoutV3";

/** Where the work-unit header surface config is published. Mirrors the canonical route's constants. */
const WORKSPACE_SURFACE = "workspace" as const;
const WORKSPACE_ENTITY_TYPE = "workspace";

/**
 * Map a published header `entity_layouts` row to a surface-variant candidate. Business-Process /
 * Work-View / stage / status scoping is read from the layout's `metadata` when authored; an
 * org-global header declares all-null constraints (a wildcard that applies to any context), so the
 * shared resolver returns the highest-version published row — the former ad-hoc behaviour — until a
 * scoped variant is published.
 */
function headerRecordToVariantCandidate(r: EntityLayoutRecord): SurfaceVariantCandidate {
    const m = r.metadata ?? {};
    const constraint = (k: string) => (typeof m[k] === "string" ? (m[k] as string) : null);
    return {
        layoutId: r.id,
        layoutKey: r.layoutKey,
        entityType: WORKSPACE_ENTITY_TYPE,
        surface: WORKSPACE_SURFACE,
        status: r.status,
        version: r.version,
        businessProcessKey: constraint("businessProcessKey"),
        workViewId: constraint("workViewId"),
        stageKey: constraint("stageKey"),
        statusKey: constraint("statusKey"),
    };
}

/**
 * The canonical decode of a published header layout doc → config.
 *
 * Extracted verbatim from app/api/admin/surfaces/work-unit-header/route.ts so BOTH the route and the
 * Provisioning Answer read published configuration through ONE owner. Builder and runtime therefore
 * cannot drift — the same doc yields the same config on both paths.
 */
export function workUnitHeaderConfigFromLayoutDoc(
    doc: LayoutDoc | null | undefined,
): WorkUnitHeaderSurfaceConfig {
    const metadata = (doc?.metadata ?? {}) as { workUnitHeaderSurface?: unknown };
    return normalizeWorkUnitHeaderSurfaceConfig(metadata.workUnitHeaderSurface);
}

/**
 * Reserved KPI geometry. **Deliberately has no value field.**
 * U-S5 fills these slots after commit; the space is already laid out, so nothing reflows.
 */
export type OperationalKpiSlot = {
    slot: number;
    label: string;
    icon: string | null;
    accent: string | null;
    /** Which metric will settle into this slot. An identifier for D5 — never a value. */
    sourceKey: string | null;
};

/** U-O1 orientation, in final layout. */
export type OperationalHeaderComposition = {
    title: string;
    subtitle: string | null;
    identityIcon: string | null;
    identityAccent: string | null;
    /** Geometry only. Values are Settlement (U-S5). */
    kpiSlots: OperationalKpiSlot[];
};

/** U-O2 queue truth, in final layout. */
export type OperationalQueueComposition = {
    /** The compact row anatomy variant the queue renders in. */
    rowVariant: string;
    /** Resolved per-slot row composition — published config, or the canonical fallback. */
    rowSlots: CompactRowSlots;
    /** Slots that fell back to generic context (no published field mapped). Provenance for D6. */
    fallbackSlots: (keyof CompactRowSlots)[];
    /** True when a published queue-row surface drove the slots (vs the canonical fallback). */
    published: boolean;
};

/**
 * U-O4/U-O5 Focus Panel operational composition — the frozen screen grammar's operational half:
 * `Situation → Decision → Action`. Detail and History settle (they are not here).
 */
export type OperationalFocusPanelComposition = {
    /** Situation: the subject's identity and its current business state are present. */
    situation: { subjectPlacement: "panel_header"; businessStatePlacement: "panel_header" };
    /** Decision: what the stage is for. */
    decision: { purposePlacement: "panel_body" };
    /** Action: the truthful primary action's placement. */
    action: { primaryActionPlacement: "panel_header" };
    /** Context Frame identity — the lens the operator entered from. */
    contextFramePlacement: "panel_header";
    /** FocusPanelScopeState is projected here, always — including `in_scope`. */
    scopeStatePlacement: "panel_boundary";
};

/** Provenance — identifiers are retained as evidence, never as the only renderable output. */
export type OperationalPresentationProvenance = {
    queueLayoutId: string | null;
    focusPanelLayoutId: string | null;
    headerSource: "published" | "builtin_default";
    queueRowSource: "published" | "canonical_fallback";
};

export type OperationalPresentation = {
    header: OperationalHeaderComposition;
    queue: OperationalQueueComposition;
    focusPanel: OperationalFocusPanelComposition;
    provenance: OperationalPresentationProvenance;
};

/** The Focus Panel's operational regions are structural — one composition, not per-tenant config. */
const FOCUS_PANEL_OPERATIONAL_COMPOSITION: OperationalFocusPanelComposition = {
    situation: { subjectPlacement: "panel_header", businessStatePlacement: "panel_header" },
    decision: { purposePlacement: "panel_body" },
    action: { primaryActionPlacement: "panel_header" },
    contextFramePlacement: "panel_header",
    scopeStatePlacement: "panel_boundary",
};

/**
 * Resolve the operational presentation composition, server-side, from published Configuration.
 *
 * Never fetches over HTTP: it reads the same tables the canonical routes read. Never returns an
 * identifier as the only renderable output. Never returns a Settlement value.
 */
export async function resolveOperationalPresentation(args: {
    supabase: SupabaseClient;
    orgId: string;
    /** Fallback header title when no published config names one. */
    fallbackTitle: string;
    /** The active lens's authored layout ids — provenance only. */
    queueLayoutId: string | null;
    focusPanelLayoutId: string | null;
    /** The host Work Unit's queue_definition — supplies the compact row variant. */
    queueDefinition: unknown;
    /** Published queue-row layout config, when the org has one. */
    queueRowLayoutConfig: QueueRecordLayoutConfigV3 | null;
    /** Applicability axes for the shared surface-variant resolver (P1: Header). */
    businessProcessKey?: string | null;
    workViewId?: string | null;
}): Promise<OperationalPresentation> {
    const { supabase, orgId, fallbackTitle } = args;

    // ── HEADER: the ONE applicability resolver selects the published variant. Never a fetch. ──
    let headerConfig: WorkUnitHeaderSurfaceConfig = DEFAULT_WORK_UNIT_HEADER_SURFACE_CONFIG;
    let headerSource: "published" | "builtin_default" = "builtin_default";
    try {
        const records = await listOrgLayouts(supabase, orgId, WORKSPACE_ENTITY_TYPE, WORKSPACE_SURFACE);
        const headerRecords = records.filter((r) => r.layoutKey === WORK_UNIT_HEADER_LAYOUT_KEY);
        // One owner: `resolveSurfaceVariant` (published-only, deterministic, Work-View/Business-Process
        // aware). For an org-global header every candidate is a wildcard, so it returns the highest
        // published version — identical to the former filter+sort — while making authored BP/Work-View
        // variants apply automatically. The former ad-hoc org-global lookup is deleted.
        const resolution = resolveSurfaceVariant(
            {
                businessProcessKey: args.businessProcessKey ?? "",
                workViewId: args.workViewId ?? null,
                entityType: WORKSPACE_ENTITY_TYPE,
                surface: WORKSPACE_SURFACE,
            },
            headerRecords.map(headerRecordToVariantCandidate),
        );
        const winner = resolution ? headerRecords.find((r) => r.id === resolution.candidate.layoutId) : null;
        if (winner) {
            headerConfig = workUnitHeaderConfigFromLayoutDoc(winner.doc);
            headerSource = "published";
        }
    } catch {
        // Configuration unavailable is NOT an operational error: the canonical default composes a
        // complete, correct header. U-P7 must never be the reason a Work Unit cannot commit.
    }

    // Geometry only — the KPI *values* are U-S5 and are deliberately unrepresentable here.
    const kpiSlots: OperationalKpiSlot[] = (headerConfig.kpis ?? [])
        .filter((k) => k.enabled !== false)
        .map((k) => ({
            slot: k.slot,
            label: (k as { label?: string | null }).label?.trim() || "",
            icon: ((k as { icon?: unknown }).icon as string | null) ?? null,
            accent: ((k as { accent?: unknown }).accent as string | null) ?? null,
            sourceKey: ((k as { sourceKey?: unknown }).sourceKey as string | null) ?? null,
        }));

    const header: OperationalHeaderComposition = {
        title: headerConfig.title?.trim() || fallbackTitle,
        subtitle: headerConfig.subtitle?.trim() || null,
        identityIcon: (headerConfig.icon as string | null) ?? null,
        identityAccent: (headerConfig.accent as string | null) ?? null,
        kpiSlots,
    };

    // ── QUEUE ROWS: published config → compact slots; null → the CANONICAL fallback. ──
    // This is why no feature gate can make U-P7 unavailable: the fallback is itself canonical.
    const compact = mapQueueRowSurfaceToCompactConfig(args.queueRowLayoutConfig);
    const queue: OperationalQueueComposition = {
        rowVariant: rowVariantFromQueueDefinition(args.queueDefinition),
        rowSlots: compact.slots,
        fallbackSlots: compact.fallbackSlots,
        published: args.queueRowLayoutConfig != null,
    };

    return {
        header,
        queue,
        focusPanel: FOCUS_PANEL_OPERATIONAL_COMPOSITION,
        provenance: {
            queueLayoutId: args.queueLayoutId,
            focusPanelLayoutId: args.focusPanelLayoutId,
            headerSource,
            queueRowSource: args.queueRowLayoutConfig ? "published" : "canonical_fallback",
        },
    };
}

/** The row variant the queue must render in at first sight (never a post-commit reflow). */
export function rowVariantFromQueueDefinition(queueDefinition: unknown): string {
    const ui = (queueDefinition as { ui?: { row_preview?: { variant?: unknown } } } | null)?.ui;
    const v = ui?.row_preview?.variant;
    return typeof v === "string" ? v : "basic";
}
