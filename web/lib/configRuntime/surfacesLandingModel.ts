/**
 * Surfaces landing — category launch tiles (Financials-style).
 *
 * Canonical routes:
 *   `/organization/surfaces` — landing (no section)
 *   `/organization/surfaces?section=<category>` — collection + selected Surface workspace
 */

import {
    CANONICAL_ORGANIZATION_SURFACES_HREF,
} from "@/lib/admin/canonicalAdminRoutes";
import type { OrganizationDomainLandingModel } from "@/lib/configRuntime/organizationDomainLandingModel";
import type { SurfaceConfigSectionKey } from "@/components/adminV2/settings/surfaces/useSurfacesConfigurationSettings";
import { sectionLabel, sectionSubtitle } from "@/lib/adminV2/settings/surfaces/surfacesNavigationModel";

export const SURFACES_LANDING_HREF = CANONICAL_ORGANIZATION_SURFACES_HREF;

export const SURFACES_LANDING_SECTIONS = [
    "focus-panels",
    "queue-rows",
    "workspaces",
    "work-units",
    "operational-intelligence",
] as const satisfies readonly SurfaceConfigSectionKey[];

const SECTION_CAPABILITIES: Record<SurfaceConfigSectionKey, readonly string[]> = {
    "focus-panels": ["Focus Panel composition", "Modes and cards", "Published panel layouts"],
    "queue-rows": ["Queue row presentation", "Fields and widgets", "Process-bound rows"],
    workspaces: ["Workspace header", "Process summaries", "Org-level KPIs"],
    "work-units": ["Work Unit header", "Header metrics", "Attention placement"],
    "operational-intelligence": ["Indicators and playbooks", "Metric placement", "OI surface builder"],
};

export function surfacesSectionHref(section: SurfaceConfigSectionKey | null | undefined): string {
    if (!section) return SURFACES_LANDING_HREF;
    return `${SURFACES_LANDING_HREF}?section=${encodeURIComponent(section)}`;
}

export type SurfacesLandingSectionTile = {
    id: SurfaceConfigSectionKey;
    label: string;
    summary: string;
    capabilities: readonly string[];
    kind: "configuration";
    postureLabel: string;
    href: string;
};

export function buildSurfacesLandingSections(): SurfacesLandingSectionTile[] {
    return SURFACES_LANDING_SECTIONS.map((id) => ({
        id,
        label: sectionLabel(id),
        summary: sectionSubtitle(id),
        capabilities: SECTION_CAPABILITIES[id],
        kind: "configuration" as const,
        postureLabel: "Organization definition",
        href: surfacesSectionHref(id),
    }));
}

/**
 * Surfaces landing model — tiles drive the Financials-style launch grid.
 * Summary/conceptual KPI cards stay empty (same compact landing doctrine).
 */
export function buildSurfacesLandingModel(): OrganizationDomainLandingModel {
    const tiles = buildSurfacesLandingSections();
    return {
        domainKey: "surfaces",
        title: "Surfaces",
        purpose: "Configure the presentation operators use across Alloy.",
        ownershipNote:
            "Organization-owned surfaces with Location/process assignment where the Surfaces workspace already supports it. Location override is not fabricated.",
        summaryCards: [],
        tiles: tiles.map((tile) => ({
            id: tile.id,
            label: tile.label,
            summary: tile.summary,
            capabilities: [...tile.capabilities],
            kind: tile.kind,
            postureLabel: tile.postureLabel,
            href: tile.href,
        })),
    };
}
