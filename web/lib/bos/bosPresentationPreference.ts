/**
 * BOS presentation preference — Adaptive Workspace System.
 * Three states only: closed | floating | pinned.
 * Preferred state is never overwritten by temporary canvas constraints.
 */

export type BosPresentationState = "closed" | "floating" | "pinned";

export const BOS_PRESENTATION_STATE_KEY = "alloy:v1:admV2:shell:bosPresentationState";
export const BOS_PRESENTATION_WIDTH_KEY = "alloy:v1:admV2:shell:bosDockedWidthPx";
export {
    BOS_FLOATING_GEOMETRY_KEY,
    BOS_FLOATING_POSITION_KEY,
    BOS_STARTERS_EXPANDED_KEY,
    type BosFloatingGeometry,
    clampBosFloatingGeometry,
    defaultBosFloatingGeometry,
    readBosFloatingGeometry,
    readBosStartersExpanded,
    writeBosFloatingGeometry,
    writeBosStartersExpanded,
} from "@/lib/bos/bosFloatingGeometry";

/** Pinned rail bounds (px). */
export const BOS_PINNED_MIN_PX = 320;
export const BOS_PINNED_MAX_PX = 560;
export const BOS_PINNED_DEFAULT_PX = 400;

const VALID_STATES: ReadonlySet<string> = new Set(["closed", "floating", "pinned"]);

/** Migrate prior corrective-pass tokens to the locked three-state model. */
function migrateLegacyState(raw: string | null): BosPresentationState | null {
    if (!raw) return null;
    if (VALID_STATES.has(raw)) return raw as BosPresentationState;
    if (raw === "hidden") return "closed";
    if (raw === "docked" || raw === "compact-docked") return "pinned";
    return null;
}

export function isBosPresentationState(value: string | null | undefined): value is BosPresentationState {
    return value != null && VALID_STATES.has(value);
}

export function readBosPresentationPreference(): BosPresentationState | null {
    if (typeof window === "undefined") return null;
    try {
        return migrateLegacyState(sessionStorage.getItem(BOS_PRESENTATION_STATE_KEY));
    } catch {
        return null;
    }
}

export function writeBosPresentationPreference(state: BosPresentationState): void {
    if (typeof window === "undefined") return;
    try {
        sessionStorage.setItem(BOS_PRESENTATION_STATE_KEY, state);
    } catch {
        /* ignore */
    }
}

export function clampBosPinnedWidthPx(px: number): number {
    return Math.min(BOS_PINNED_MAX_PX, Math.max(BOS_PINNED_MIN_PX, Math.round(px)));
}

export function defaultBosPinnedWidthPx(): number {
    return BOS_PINNED_DEFAULT_PX;
}

export function readBosPinnedWidthPx(): number {
    if (typeof window === "undefined") return defaultBosPinnedWidthPx();
    try {
        const raw = sessionStorage.getItem(BOS_PRESENTATION_WIDTH_KEY);
        if (!raw) return defaultBosPinnedWidthPx();
        const parsed = Number.parseInt(raw, 10);
        if (!Number.isFinite(parsed)) return defaultBosPinnedWidthPx();
        return clampBosPinnedWidthPx(parsed);
    } catch {
        return defaultBosPinnedWidthPx();
    }
}

export function writeBosPinnedWidthPx(px: number): void {
    if (typeof window === "undefined") return;
    try {
        sessionStorage.setItem(BOS_PRESENTATION_WIDTH_KEY, String(clampBosPinnedWidthPx(px)));
    } catch {
        /* ignore */
    }
}

/** @deprecated Use clampBosPinnedWidthPx */
export function clampBosDockedWidthPx(px: number): number {
    return clampBosPinnedWidthPx(px);
}

/** @deprecated Use defaultBosPinnedWidthPx */
export function defaultBosDockedWidthPx(): number {
    return defaultBosPinnedWidthPx();
}

/** @deprecated Use readBosPinnedWidthPx */
export function readBosDockedWidthPx(): number {
    return readBosPinnedWidthPx();
}

/** @deprecated Use writeBosPinnedWidthPx */
export function writeBosDockedWidthPx(px: number): void {
    writeBosPinnedWidthPx(px);
}

/** @deprecated Use BosFloatingGeometry */
export type BosFloatingPosition = { left: number; top: number };

/** @deprecated Use readBosFloatingGeometry */
export function readBosFloatingPosition(): BosFloatingPosition | null {
    return null;
}

/** @deprecated Use writeBosFloatingGeometry */
export function writeBosFloatingPosition(_pos: BosFloatingPosition): void {
    /* no-op — use writeBosFloatingGeometry */
}
