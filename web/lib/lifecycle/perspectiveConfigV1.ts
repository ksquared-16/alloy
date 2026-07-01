/**
 * Business Process perspective metadata (Configuration Runtime).
 * Stored on builder stage save as `perspectives_v1` — metadata over synced queue lanes.
 */

export type PerspectiveConfigV1Stored = {
    queue_key: string;
    label?: string;
    mission?: string;
    visible_in_rail?: boolean;
    display_order?: number;
};

/** Full editor/runtime row after merging lane defaults with stored overrides. */
export type PerspectiveConfigV1 = {
    queue_key: string;
    label: string;
    mission: string;
    visible_in_rail: boolean;
    display_order: number;
};

export type PerspectivesV1Metadata = {
    version: 1;
    perspectives: PerspectiveConfigV1[];
};

export const PERSPECTIVES_V1_METADATA_KEY = "perspectives_v1" as const;

const QUEUE_KEY_REGEX = /^[a-z][a-z0-9_]{0,63}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
    return value != null && typeof value === "object" && !Array.isArray(value);
}

function parseStoredRow(raw: unknown): PerspectiveConfigV1Stored | null {
    if (!isRecord(raw)) return null;
    const queue_key = typeof raw.queue_key === "string" ? raw.queue_key.trim() : "";
    if (!queue_key || !QUEUE_KEY_REGEX.test(queue_key)) return null;

    const stored: PerspectiveConfigV1Stored = { queue_key };
    if (typeof raw.label === "string" && raw.label.trim()) stored.label = raw.label.trim();
    if (typeof raw.mission === "string" && raw.mission.trim()) stored.mission = raw.mission.trim();
    if (typeof raw.visible_in_rail === "boolean") stored.visible_in_rail = raw.visible_in_rail;
    if (typeof raw.display_order === "number" && Number.isFinite(raw.display_order)) {
        stored.display_order = Math.max(1, Math.floor(raw.display_order));
    }
    return stored;
}

/** Parse stage metadata `perspectives_v1` (array or legacy `{ version, perspectives }`). */
export function parsePerspectivesV1(raw: unknown): PerspectiveConfigV1Stored[] | null {
    let rows: unknown[] | null = null;
    if (Array.isArray(raw)) {
        rows = raw;
    } else if (isRecord(raw) && Array.isArray(raw.perspectives)) {
        rows = raw.perspectives;
    }
    if (!rows) return null;

    const out: PerspectiveConfigV1Stored[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
        const parsed = parseStoredRow(row);
        if (!parsed || seen.has(parsed.queue_key)) continue;
        seen.add(parsed.queue_key);
        out.push(parsed);
    }
    return out;
}

/** Drop stale perspective rows whose queue_key no longer exists on synced lanes. */
export function coercePerspectivesV1ForLanes(
    saved: readonly PerspectiveConfigV1Stored[] | null | undefined,
    laneKeys: readonly string[],
): PerspectiveConfigV1Stored[] {
    if (!saved?.length || !laneKeys.length) return [];
    const valid = new Set(laneKeys.map((k) => k.trim()).filter(Boolean));
    return saved.filter((row) => valid.has(row.queue_key));
}

export function resolvePerspectivesForStage(stageRecord: {
    perspectives_v1?: unknown;
}): PerspectiveConfigV1Stored[] | null {
    return parsePerspectivesV1(stageRecord.perspectives_v1);
}

export function normalizePerspectivesV1ForPersist(
    rows: readonly PerspectiveConfigV1[],
    laneKeys: readonly string[],
): PerspectiveConfigV1Stored[] {
    const valid = new Set(laneKeys.map((k) => k.trim()).filter(Boolean));
    return rows
        .filter((row) => valid.has(row.queue_key))
        .map((row) => ({
            queue_key: row.queue_key,
            label: row.label.trim(),
            mission: row.mission.trim(),
            visible_in_rail: row.visible_in_rail,
            display_order: Math.max(1, Math.floor(row.display_order)),
        }));
}

export function perspectivesV1Equal(
    a: readonly PerspectiveConfigV1Stored[] | null | undefined,
    b: readonly PerspectiveConfigV1Stored[] | null | undefined,
): boolean {
    const left = a ?? [];
    const right = b ?? [];
    if (left.length !== right.length) return false;
    return JSON.stringify(left) === JSON.stringify(right);
}
