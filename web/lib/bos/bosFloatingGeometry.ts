/**
 * Floating BOS window geometry — Adaptive Workspace System.
 * Preferred geometry persists; temporary viewport clamping does not overwrite preference
 * unless the operator moves/resizes again.
 */

export const BOS_FLOATING_GEOMETRY_KEY = "alloy:v1:admV2:shell:bosFloatingGeometry";
/** @deprecated Offset-only key from earlier pass; migrated into full geometry. */
export const BOS_FLOATING_POSITION_KEY = "alloy:v1:admV2:shell:bosFloatingPosition";
export const BOS_STARTERS_EXPANDED_KEY = "alloy:v1:admV2:shell:bosStartersExpanded";

export const BOS_FLOAT_DEFAULT_WIDTH_PX = 400;
export const BOS_FLOAT_DEFAULT_HEIGHT_PX = 620;
export const BOS_FLOAT_MIN_WIDTH_PX = 320;
export const BOS_FLOAT_MIN_HEIGHT_PX = 420;
export const BOS_FLOAT_MARGIN_PX = 24;
/** Keep clear of persistent shell header. */
export const BOS_FLOAT_TOP_SAFE_PX = 56;
export const BOS_FLOAT_BOTTOM_SAFE_PX = 24;

export type BosFloatingGeometry = {
    x: number;
    y: number;
    width: number;
    height: number;
};

export type BosCanvasBounds = {
    width: number;
    height: number;
};

export function maxBosFloatingWidthPx(canvasWidth: number): number {
    const usable = Math.max(0, canvasWidth - BOS_FLOAT_MARGIN_PX * 2);
    return Math.max(BOS_FLOAT_MIN_WIDTH_PX, Math.floor(usable * 0.6));
}

export function maxBosFloatingHeightPx(canvasHeight: number): number {
    const usable =
        Math.max(0, canvasHeight - BOS_FLOAT_TOP_SAFE_PX - BOS_FLOAT_BOTTOM_SAFE_PX - BOS_FLOAT_MARGIN_PX);
    return Math.max(BOS_FLOAT_MIN_HEIGHT_PX, usable);
}

export function defaultBosFloatingGeometry(canvas: BosCanvasBounds): BosFloatingGeometry {
    const width = Math.min(BOS_FLOAT_DEFAULT_WIDTH_PX, maxBosFloatingWidthPx(canvas.width));
    const height = Math.min(BOS_FLOAT_DEFAULT_HEIGHT_PX, maxBosFloatingHeightPx(canvas.height));
    const x = Math.max(
        BOS_FLOAT_MARGIN_PX,
        Math.round(canvas.width - width - BOS_FLOAT_MARGIN_PX),
    );
    const y = Math.max(
        BOS_FLOAT_TOP_SAFE_PX + BOS_FLOAT_MARGIN_PX,
        Math.round(canvas.height - height - BOS_FLOAT_BOTTOM_SAFE_PX - BOS_FLOAT_MARGIN_PX),
    );
    return clampBosFloatingGeometry({ x, y, width, height }, canvas);
}

/**
 * Clamp into the usable application canvas. Does not mutate preference storage.
 */
export function clampBosFloatingGeometry(
    geo: BosFloatingGeometry,
    canvas: BosCanvasBounds,
): BosFloatingGeometry {
    const maxW = maxBosFloatingWidthPx(canvas.width);
    const maxH = maxBosFloatingHeightPx(canvas.height);
    const width = Math.min(maxW, Math.max(BOS_FLOAT_MIN_WIDTH_PX, Math.round(geo.width)));
    const height = Math.min(maxH, Math.max(BOS_FLOAT_MIN_HEIGHT_PX, Math.round(geo.height)));
    const minX = BOS_FLOAT_MARGIN_PX;
    const minY = BOS_FLOAT_TOP_SAFE_PX + BOS_FLOAT_MARGIN_PX;
    const maxX = Math.max(minX, Math.round(canvas.width - width - BOS_FLOAT_MARGIN_PX));
    const maxY = Math.max(
        minY,
        Math.round(canvas.height - height - BOS_FLOAT_BOTTOM_SAFE_PX - BOS_FLOAT_MARGIN_PX),
    );
    const x = Math.min(maxX, Math.max(minX, Math.round(geo.x)));
    const y = Math.min(maxY, Math.max(minY, Math.round(geo.y)));
    return { x, y, width, height };
}

function readLegacyOffsetAsGeometry(canvas: BosCanvasBounds): BosFloatingGeometry | null {
    if (typeof window === "undefined") return null;
    try {
        const raw = sessionStorage.getItem(BOS_FLOATING_POSITION_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as { left?: number; top?: number };
        if (!Number.isFinite(parsed?.left) || !Number.isFinite(parsed?.top)) return null;
        const base = defaultBosFloatingGeometry(canvas);
        return clampBosFloatingGeometry(
            {
                x: base.x + (parsed.left as number),
                y: base.y + (parsed.top as number),
                width: base.width,
                height: base.height,
            },
            canvas,
        );
    } catch {
        return null;
    }
}

export function readBosFloatingGeometry(canvas: BosCanvasBounds): BosFloatingGeometry {
    if (typeof window === "undefined") return defaultBosFloatingGeometry(canvas);
    try {
        const raw = sessionStorage.getItem(BOS_FLOATING_GEOMETRY_KEY);
        if (raw) {
            const parsed = JSON.parse(raw) as BosFloatingGeometry;
            if (
                Number.isFinite(parsed?.x) &&
                Number.isFinite(parsed?.y) &&
                Number.isFinite(parsed?.width) &&
                Number.isFinite(parsed?.height)
            ) {
                return clampBosFloatingGeometry(parsed, canvas);
            }
        }
        const legacy = readLegacyOffsetAsGeometry(canvas);
        if (legacy) {
            writeBosFloatingGeometry(legacy);
            return legacy;
        }
    } catch {
        /* fall through */
    }
    return defaultBosFloatingGeometry(canvas);
}

export function writeBosFloatingGeometry(geo: BosFloatingGeometry): void {
    if (typeof window === "undefined") return;
    try {
        sessionStorage.setItem(BOS_FLOATING_GEOMETRY_KEY, JSON.stringify(geo));
    } catch {
        /* ignore */
    }
}

export function geometriesEqual(a: BosFloatingGeometry, b: BosFloatingGeometry): boolean {
    return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

export function readBosStartersExpanded(): boolean {
    if (typeof window === "undefined") return true;
    try {
        const raw = sessionStorage.getItem(BOS_STARTERS_EXPANDED_KEY);
        if (raw === null) return true;
        return raw !== "0" && raw !== "false";
    } catch {
        return true;
    }
}

export function writeBosStartersExpanded(expanded: boolean): void {
    if (typeof window === "undefined") return;
    try {
        sessionStorage.setItem(BOS_STARTERS_EXPANDED_KEY, expanded ? "1" : "0");
    } catch {
        /* ignore */
    }
}

