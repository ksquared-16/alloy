/**
 * Organization Commands catalog projection (P7).
 *
 * Read-only view of Platform Capability Registry for `/organization/commands`.
 * Does not invent Commands. Availability/enable overlays remain on existing
 * action_definitions storage (P7/P8 product completion).
 */

import {
    listPlatformCapabilities,
} from "@/lib/platform/commands/capabilityRegistry";
import type {
    CapabilityCatalogVisibility,
    CapabilityFamily,
    CapabilityMaturity,
    PlatformCapabilityDefinition,
} from "@/lib/platform/commands/capabilityTypes";

export type OrganizationCommandCatalogEntry = {
    capabilityKey: string;
    canonicalCommandKey: string;
    operatorLabel: string;
    family: CapabilityFamily;
    maturity: CapabilityMaturity;
    catalogVisibility: CapabilityCatalogVisibility;
    /** Honest operator-facing status — not executor jargon. */
    statusLabel: "Available" | "Limited" | "Unavailable" | "Internal" | "Hidden";
    aliases: readonly string[];
    reason?: string;
};

function statusLabelFor(cap: PlatformCapabilityDefinition): OrganizationCommandCatalogEntry["statusLabel"] {
    if (cap.catalogVisibility === "hidden") return "Hidden";
    if (cap.catalogVisibility === "internal_only") return "Internal";
    if (cap.maturity === "unavailable" || cap.maturity === "placeholder") return "Unavailable";
    if (
        cap.maturity === "legacy" ||
        cap.maturity === "navigation_only" ||
        cap.implementationStatus === "partial" ||
        cap.implementationStatus === "legacy" ||
        cap.implementationStatus === "missing"
    ) {
        return "Limited";
    }
    if (cap.maturity === "executable" || cap.maturity === "adapted") return "Available";
    return "Unavailable";
}

/**
 * Catalog for the Commands product. Prefer organization_command_catalog entries.
 * Also surfaces unavailable/placeholder identities so operators see honest repair states.
 */
export function listOrganizationCommandCatalog(opts?: {
    includeInternal?: boolean;
    includeHidden?: boolean;
}): OrganizationCommandCatalogEntry[] {
    const includeInternal = opts?.includeInternal === true;
    const includeHidden = opts?.includeHidden === true;

    const rows: OrganizationCommandCatalogEntry[] = [];
    const seen = new Set<string>();

    for (const cap of listPlatformCapabilities()) {
        if (cap.catalogVisibility === "hidden" && !includeHidden) continue;
        if (
            cap.maturity === "processing_only" ||
            cap.maturity === "workflow_only" ||
            cap.maturity === "configuration_maintenance"
        ) {
            continue;
        }

        const orgFacing = cap.catalogVisibility === "organization_command_catalog";
        const honestUnavailable =
            (cap.maturity === "unavailable" || cap.maturity === "placeholder") &&
            (orgFacing || cap.catalogVisibility === "hidden" || includeInternal);
        const internal = cap.catalogVisibility === "internal_only";

        if (!orgFacing && !honestUnavailable && !(includeInternal && internal)) continue;

        const key = cap.canonicalCommandKey;
        if (seen.has(key)) continue;
        seen.add(key);

        rows.push({
            capabilityKey: cap.capabilityKey,
            canonicalCommandKey: cap.canonicalCommandKey,
            operatorLabel: cap.operatorLabel,
            family: cap.family,
            maturity: cap.maturity,
            catalogVisibility: cap.catalogVisibility,
            statusLabel: statusLabelFor(cap),
            aliases: cap.compatibilityAliases ?? [],
            ...(cap.reason ? { reason: cap.reason } : {}),
        });
    }

    rows.sort((a, b) => {
        const fam = a.family.localeCompare(b.family);
        if (fam !== 0) return fam;
        return a.operatorLabel.localeCompare(b.operatorLabel);
    });
    return rows;
}

export function getOrganizationCommandCatalogEntry(
    key: string
): OrganizationCommandCatalogEntry | null {
    const want = key.trim();
    if (!want) return null;
    return (
        listOrganizationCommandCatalog({ includeInternal: true, includeHidden: true }).find(
            (row) =>
                row.capabilityKey === want ||
                row.canonicalCommandKey === want ||
                row.aliases.includes(want)
        ) ?? null
    );
}
