import { adminSettingsSubpathHref } from "@/lib/admin/canonicalAdminRoutes";
import type { OrganizationDomainLandingModel } from "@/lib/configRuntime/organizationDomainLandingModel";

const SURFACES_BASE = adminSettingsSubpathHref("surfaces");

/** Surfaces landing — Organization definition + assignment; overrides only if proven. */
export function buildSurfacesLandingModel(): OrganizationDomainLandingModel {
    return {
        domainKey: "surfaces",
        title: "Surfaces",
        purpose:
            "Organization presentation definitions — Focus Panels, queue rows, workspaces, and work unit chrome. Publication and assignment remain on existing contracts.",
        ownershipNote:
            "Organization-owned surfaces with Location/process assignment where the Surfaces workspace already supports it. Location override is not fabricated.",
        summaryCards: [
            {
                id: "ownership",
                label: "Ownership",
                value: "Organization",
                detail: "Surface definitions are authored centrally.",
            },
            {
                id: "assignment",
                label: "Assignment",
                value: "Process / workspace binding",
                detail: "Where current Surfaces workspace already binds presentation.",
            },
            {
                id: "entry",
                label: "How to start",
                value: "Choose a category",
                detail: "Tiles open the existing Surfaces workspace — no Surface Builder redesign.",
            },
        ],
        tiles: [
            {
                id: "focus-panels",
                label: "Focus Panels",
                summary: "Focus Panel composition and summary surfaces.",
                capabilities: ["Focus Panel editor", "Published panel layouts"],
                kind: "configuration",
                postureLabel: "Organization definition",
                href: `${SURFACES_BASE}?section=focus-panels`,
            },
            {
                id: "queue-rows",
                label: "Queue Rows",
                summary: "Queue row presentation for process catalogs.",
                capabilities: ["Queue row builder", "Process-bound rows"],
                kind: "configuration",
                postureLabel: "Organization definition",
                href: `${SURFACES_BASE}?section=queue-rows`,
            },
            {
                id: "workspaces",
                label: "Workspaces",
                summary: "Workspace header and process summary surfaces.",
                capabilities: ["Workspace header", "Process summaries"],
                kind: "configuration",
                postureLabel: "Organization definition",
                href: `${SURFACES_BASE}?section=workspaces`,
            },
            {
                id: "work-units",
                label: "Work Units",
                summary: "Work unit header presentation.",
                capabilities: ["Work unit header"],
                kind: "configuration",
                postureLabel: "Organization definition",
                href: `${SURFACES_BASE}?section=work-units`,
            },
            {
                id: "operational-intelligence",
                label: "Operational Intelligence",
                summary: "Operational intelligence surface composition.",
                capabilities: ["OI surface builder"],
                kind: "configuration",
                postureLabel: "Organization definition",
                href: `${SURFACES_BASE}?section=operational-intelligence`,
            },
        ],
    };
}
