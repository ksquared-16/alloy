/**
 * Runtime resolver for configurable header summary lines.
 *
 * Registry-backed renderers format themselves; runtime owns join, truncation, typography.
 * Focus Panel, Drawer, Workspace, and future header surfaces share this resolver.
 */

import { mapRawInquiryChildrenToDrawerRows } from "@/lib/admin/drawer/inquiryChildrenDrawerRows";
import { evaluateLayoutCondition } from "@/lib/layout/runtime/evaluateLayoutCondition";
import {
    defaultSurfaceHeaderSummaryConfig,
    hasExplicitSurfaceHeaderSummaryMetadata,
    readSurfaceHeaderSummaryConfig,
    type SurfaceHeaderRendererKey,
    type SurfaceHeaderRendererPlacement,
    type SurfaceHeaderSummaryConfig,
    type SurfaceHeaderSummarySegment,
} from "@/lib/adminV2/settings/surfaces/surfaceHeaderSummaryModel";
import {
    formatFocusPanelDisplayLabel,
    resolveFocusPanelLocationChip,
    resolveFocusPanelProcessLabel,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelDisplayLabels";
import type { LayoutDoc } from "@/lib/layout/layoutV2";

const MAX_VISIBLE_CHILDREN = 2;
const MAX_SUMMARY_CHARS = 120;

export type SurfaceHeaderSummaryContext = {
    record: Record<string, unknown>;
    statusLabel?: string | null;
    processLabel?: string | null;
    locationLabel?: string | null;
};

function trimOrNull(value: unknown): string | null {
    if (value == null) return null;
    const text = String(value).trim();
    return text.length > 0 ? text : null;
}

function formatChildAgeShort(row: { age?: string | null; dob?: string | null }): string | null {
    const age = trimOrNull(row.age);
    if (age) {
        const compact = age.replace(/\s+/g, "").replace(/years?/i, "y").replace(/months?/i, "m");
        return compact.includes("y") || compact.includes("m") ? compact : age;
    }
    return null;
}

function resolvePrimaryContactNames(record: Record<string, unknown>): string | null {
    const ident = (record._identity as Record<string, unknown> | null | undefined) ?? null;
    const primaryPerson =
        ident?.primary_person && typeof ident.primary_person === "object"
            ? (ident.primary_person as { label?: unknown })
            : null;
    const primary = trimOrNull(record["person.primary_contact_name"]) ?? trimOrNull(primaryPerson?.label);
    const secondary = trimOrNull(record["person.secondary_contact_name"]);
    if (primary && secondary) return `${primary} & ${secondary.split(/\s+/).pop() ?? secondary}`;
    return primary ?? secondary;
}

function resolveChildrenSummary(record: Record<string, unknown>): string | null {
    const rows = mapRawInquiryChildrenToDrawerRows((record._inquiry_children as unknown[]) ?? []);
    if (rows.length === 0) return null;
    const parts = rows.slice(0, MAX_VISIBLE_CHILDREN).map((row) => {
        const firstName = (row.display_name ?? "Child").split(/\s+/)[0] ?? "Child";
        const age = formatChildAgeShort(row);
        return age ? `${firstName} (${age})` : firstName;
    });
    const overflow = rows.length - MAX_VISIBLE_CHILDREN;
    if (overflow > 0) parts.push(`+${overflow} more`);
    return parts.join(", ");
}

function resolveRendererText(
    key: SurfaceHeaderRendererKey,
    record: Record<string, unknown>,
    input: Pick<SurfaceHeaderSummaryContext, "statusLabel" | "processLabel" | "locationLabel">,
): string | null {
    switch (key) {
        case "primary_contact_summary":
        case "parent_summary":
            return resolvePrimaryContactNames(record);
        case "children_summary":
            return resolveChildrenSummary(record);
        case "relationship_summary":
            return trimOrNull(record["person.relationship_summary"]);
        case "employee_summary":
            return trimOrNull(record["person.display_name"]) ?? trimOrNull(record["employee.display_name"]);
        case "manager_summary":
            return trimOrNull(record["employee.manager_name"]);
        case "vendor_summary":
            return trimOrNull(record["vendor.primary_contact_name"]);
        case "location_summary":
            return input.locationLabel ?? resolveFocusPanelLocationChip(record);
        case "status_summary":
            return formatFocusPanelDisplayLabel(input.statusLabel);
        case "process_summary":
            return input.processLabel ?? resolveFocusPanelProcessLabel(record);
        case "custom_field":
            return null;
        default:
            return null;
    }
}

function placementVisible(
    placement: SurfaceHeaderRendererPlacement,
    record: Record<string, unknown>,
    text: string | null,
): boolean {
    if (placement.visibleWhen) {
        return evaluateLayoutCondition(record, placement.visibleWhen);
    }
    const mode = placement.visibility ?? "hide_when_empty";
    if (mode === "always") return true;
    return Boolean(text?.trim());
}

function formatSegment(placement: SurfaceHeaderRendererPlacement, text: string): string {
    const prefix = placement.labelPrefix?.trim();
    if (prefix) return `${prefix} ${text}`;
    if (placement.rendererKey === "children_summary" && !prefix) {
        return `Children: ${text}`;
    }
    return text;
}

export function resolveSurfaceHeaderSummaryFromConfig(
    config: SurfaceHeaderSummaryConfig,
    context: SurfaceHeaderSummaryContext,
): SurfaceHeaderSummarySegment[] {
    const segments: SurfaceHeaderSummarySegment[] = [];
    for (const placement of config.renderers) {
        const raw = resolveRendererText(placement.rendererKey, context.record, context);
        if (!placementVisible(placement, context.record, raw)) continue;
        if (!raw?.trim()) continue;
        segments.push({
            id: placement.id,
            text: formatSegment(placement, raw),
            tone: placement.rendererKey === "status_summary" ? "status" : "neutral",
        });
    }
    return segments;
}

export function resolveSurfaceHeaderSummarySegments(input: {
    publishedDoc?: LayoutDoc | null;
} & SurfaceHeaderSummaryContext): SurfaceHeaderSummarySegment[] {
    const explicit = hasExplicitSurfaceHeaderSummaryMetadata(input.publishedDoc);
    const config =
        explicit
            ? (readSurfaceHeaderSummaryConfig(input.publishedDoc) ?? { renderers: [] })
            : (readSurfaceHeaderSummaryConfig(input.publishedDoc) ?? defaultSurfaceHeaderSummaryConfig());
    return resolveSurfaceHeaderSummaryFromConfig(config, input);
}

/** Join segments into one compact line with intelligent truncation. */
export function formatSurfaceHeaderSummaryLine(segments: readonly SurfaceHeaderSummarySegment[]): string | null {
    if (segments.length === 0) return null;
    const joined = segments.map((s) => s.text).join(" · ");
    if (joined.length <= MAX_SUMMARY_CHARS) return joined;
    return `${joined.slice(0, MAX_SUMMARY_CHARS - 1).trim()}…`;
}
