/**
 * Surface Header Summary — generic configurable header line for any runtime surface.
 *
 * Every runtime surface with a header (Focus Panel, Drawer, Workspace, Queue Row, …)
 * can compose its compact summary line from registry-backed renderers. The header
 * CHROME (title, actions, mode tabs) stays platform-owned; configuration owns which
 * summary renderers appear, their order, and visibility.
 *
 * Focus Panel was the first consumer; metadata is surface-agnostic.
 */

import type { LayoutCondition, LayoutDoc } from "@/lib/layout/layoutV2";

/** Primary metadata key — use for all new publishes. */
export const SURFACE_HEADER_SUMMARY_METADATA_KEY = "surfaceHeaderSummary" as const;

/** Legacy Focus Panel key — read for backward compatibility only. */
export const LEGACY_FOCUS_PANEL_IDENTITY_SUMMARY_METADATA_KEY = "focusPanelIdentitySummary" as const;

/** Registry-backed header summary renderer keys — each owns its own formatting. */
export const SURFACE_HEADER_RENDERER_KEYS = [
    "primary_contact_summary",
    "parent_summary",
    "children_summary",
    "relationship_summary",
    "employee_summary",
    "manager_summary",
    "vendor_summary",
    "location_summary",
    "status_summary",
    "process_summary",
    "custom_field",
] as const;

export type SurfaceHeaderRendererKey = (typeof SURFACE_HEADER_RENDERER_KEYS)[number];

export const SURFACE_HEADER_RENDERER_LABELS: Record<SurfaceHeaderRendererKey, string> = {
    primary_contact_summary: "Primary Contact",
    parent_summary: "Parent Summary",
    children_summary: "Children Summary",
    relationship_summary: "Relationship Summary",
    employee_summary: "Employee Summary",
    manager_summary: "Manager Summary",
    vendor_summary: "Vendor Summary",
    location_summary: "Location Summary",
    status_summary: "Status Summary",
    process_summary: "Process Summary",
    custom_field: "Custom Field",
};

export type SurfaceHeaderVisibilityMode = "always" | "hide_when_empty" | "show_when_exists";

export type SurfaceHeaderRendererPlacement = {
    id: string;
    rendererKey: SurfaceHeaderRendererKey;
    labelPrefix?: string | null;
    visibility?: SurfaceHeaderVisibilityMode;
    visibleWhen?: LayoutCondition | null;
};

export type SurfaceHeaderSummaryConfig = {
    renderers: SurfaceHeaderRendererPlacement[];
};

export type SurfaceHeaderSummarySegment = {
    id: string;
    text: string;
    tone?: "status" | "neutral";
};

export function defaultSurfaceHeaderSummaryConfig(): SurfaceHeaderSummaryConfig {
    return {
        renderers: [
            { id: "header-primary", rendererKey: "primary_contact_summary", visibility: "hide_when_empty" },
            { id: "header-children", rendererKey: "children_summary", labelPrefix: "Children:", visibility: "hide_when_empty" },
        ],
    };
}

function parseHeaderSummaryConfig(raw: unknown): SurfaceHeaderSummaryConfig | null {
    if (!raw || typeof raw !== "object") return null;
    const config = raw as SurfaceHeaderSummaryConfig;
    if (!Array.isArray(config.renderers)) return null;
    const renderers = config.renderers.filter(
        (r): r is SurfaceHeaderRendererPlacement =>
            r != null &&
            typeof r === "object" &&
            typeof r.id === "string" &&
            typeof r.rendererKey === "string" &&
            (SURFACE_HEADER_RENDERER_KEYS as readonly string[]).includes(r.rendererKey),
    );
    // Explicit empty config ({ renderers: [] }) is valid — distinct from absent metadata.
    return { renderers };
}

/** True when the doc carries an explicit surfaceHeaderSummary publish (even if empty). */
export function hasExplicitSurfaceHeaderSummaryMetadata(doc: LayoutDoc | null | undefined): boolean {
    return doc?.metadata?.[SURFACE_HEADER_SUMMARY_METADATA_KEY] !== undefined;
}

/** Read header summary config from a layout doc (supports legacy Focus Panel key). */
export function readSurfaceHeaderSummaryConfig(doc: LayoutDoc | null | undefined): SurfaceHeaderSummaryConfig | null {
    if (hasExplicitSurfaceHeaderSummaryMetadata(doc)) {
        return parseHeaderSummaryConfig(doc?.metadata?.[SURFACE_HEADER_SUMMARY_METADATA_KEY]);
    }
    return parseHeaderSummaryConfig(doc?.metadata?.[LEGACY_FOCUS_PANEL_IDENTITY_SUMMARY_METADATA_KEY]);
}

export function withSurfaceHeaderSummaryMetadata(
    metadata: LayoutDoc["metadata"] | undefined,
    config: SurfaceHeaderSummaryConfig,
): LayoutDoc["metadata"] {
    const next = { ...metadata, [SURFACE_HEADER_SUMMARY_METADATA_KEY]: config };
    delete (next as Record<string, unknown>)[LEGACY_FOCUS_PANEL_IDENTITY_SUMMARY_METADATA_KEY];
    return next;
}

export function moveSurfaceHeaderRenderer(
    config: SurfaceHeaderSummaryConfig,
    id: string,
    direction: "earlier" | "later",
): SurfaceHeaderSummaryConfig {
    const idx = config.renderers.findIndex((r) => r.id === id);
    if (idx < 0) return config;
    const target = direction === "earlier" ? idx - 1 : idx + 1;
    if (target < 0 || target >= config.renderers.length) return config;
    const next = [...config.renderers];
    [next[idx], next[target]] = [next[target]!, next[idx]!];
    return { renderers: next };
}

export function removeSurfaceHeaderRenderer(
    config: SurfaceHeaderSummaryConfig,
    id: string,
): SurfaceHeaderSummaryConfig {
    return { renderers: config.renderers.filter((r) => r.id !== id) };
}

export function addSurfaceHeaderRenderer(
    config: SurfaceHeaderSummaryConfig,
    rendererKey: SurfaceHeaderRendererKey,
): SurfaceHeaderSummaryConfig {
    const id = `header-${rendererKey}-${Date.now()}`;
    return {
        renderers: [...config.renderers, { id, rendererKey, visibility: "hide_when_empty" }],
    };
}

export function updateSurfaceHeaderRenderer(
    config: SurfaceHeaderSummaryConfig,
    id: string,
    patch: Partial<Omit<SurfaceHeaderRendererPlacement, "id">>,
): SurfaceHeaderSummaryConfig {
    return {
        renderers: config.renderers.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    };
}
