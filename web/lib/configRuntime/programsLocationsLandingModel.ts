/**
 * Programs & Locations landing — relationship entry for two operational collections.
 * Does not merge Programs and Locations workspaces.
 */

import {
    CANONICAL_ORGANIZATION_PROGRAMS_HREF,
    CANONICAL_ORGANIZATION_PROGRAMS_LOCATIONS_HREF,
} from "@/lib/admin/canonicalAdminRoutes";
import { ORGANIZATION_LOCATIONS_PATH } from "@/lib/admin/canonicalLocationSettingsRoutes";

export const PROGRAMS_LOCATIONS_LANDING_HREF = CANONICAL_ORGANIZATION_PROGRAMS_LOCATIONS_HREF;

export const PROGRAMS_LOCATIONS_LANDING_SUBTITLE =
    "Programs define what the Organization provides. Locations define where and how those services are delivered.";

export type ProgramsLocationsLandingTile = {
    id: "programs" | "locations";
    label: string;
    summary: string;
    capabilities: readonly string[];
    postureLabel: string;
    href: string;
};

export function buildProgramsLocationsLandingTiles(): readonly ProgramsLocationsLandingTile[] {
    return [
        {
            id: "programs",
            label: "Programs",
            summary: "Reusable Organization service definitions — authored once, consumed by Locations.",
            capabilities: [
                "Program identity and definition",
                "Delivery Options",
                "Organization defaults",
                "Location assignment",
            ],
            postureLabel: "Organization collection",
            href: CANONICAL_ORGANIZATION_PROGRAMS_HREF,
        },
        {
            id: "locations",
            label: "Locations",
            summary: "Physical places that deliver Programs — local offering, rooms, schedule, and readiness.",
            capabilities: [
                "Local Program offering",
                "Rooms and capacity",
                "Schedules and hours",
                "Tours, placement, and access",
            ],
            postureLabel: "Location collection",
            href: ORGANIZATION_LOCATIONS_PATH,
        },
    ];
}
