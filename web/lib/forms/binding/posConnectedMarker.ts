/**
 * POS-FP0 — POS-connected surface marker.
 *
 * A form definition / version / public link is "POS-connected" when its existing
 * JSONB `metadata` declares it so. No new column or migration: the marker rides
 * metadata that already exists on these rows.
 *
 * Canonical shape: `metadata.pos_connected === true`.
 * Also accepted: `metadata.pos.connected === true` (namespaced variant).
 *
 * Legacy forms never set this marker, so binding enforcement never runs for them.
 */

export const POS_CONNECTED_METADATA_KEY = "pos_connected";

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** True when a single metadata object marks the surface POS-connected. */
export function isPosConnectedMetadata(metadata: unknown): boolean {
    if (!isPlainObject(metadata)) return false;
    if (metadata[POS_CONNECTED_METADATA_KEY] === true) return true;
    const pos = metadata["pos"];
    if (isPlainObject(pos) && pos["connected"] === true) return true;
    return false;
}

/**
 * True when any of the relevant metadata sources marks the surface POS-connected.
 * The form definition is the canonical home; version/link metadata are accepted too.
 */
export function isPosConnectedSurface(args: {
    definitionMetadata?: unknown;
    versionMetadata?: unknown;
    linkMetadata?: unknown;
}): boolean {
    return (
        isPosConnectedMetadata(args.definitionMetadata) ||
        isPosConnectedMetadata(args.versionMetadata) ||
        isPosConnectedMetadata(args.linkMetadata)
    );
}
