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


/**
 * Where a floating assistant PARKS itself so it does not settle on top of the
 * controls an operator came to use.
 *
 * The problem this solves, and the two wrong answers it avoids:
 *
 *   - Reserving layout for a floating window turns it into a pinned side panel.
 *     That was tried and reverted: the page narrowed and the mode distinction
 *     disappeared.
 *   - "The operator can move or close it" is not steady-state product behaviour.
 *     A default placement that hides primary actions is a defect even when a
 *     remedy exists.
 *
 * So the window stays a true overlay — it never affects layout — but its
 * AUTOMATIC placement is collision-aware. It is parked at whichever candidate
 * corner obstructs the fewest actionable controls.
 *
 * Shared, not page-specific: obstacles are supplied by the caller as plain rects
 * measured from the live DOM, so nothing here knows about Communications or any
 * other surface, and no page contributes an offset.
 *
 * An operator's OWN placement is never overridden — the caller applies this only
 * when there is no stored preference.
 */

export type ObstacleRect = { x: number; y: number; width: number; height: number };

/** True when the operator has placed the window themselves. Their choice wins. */
export function hasStoredBosFloatingGeometry(): boolean {
    if (typeof window === "undefined") return false;
    try {
        return Boolean(sessionStorage.getItem(BOS_FLOATING_GEOMETRY_KEY));
    } catch {
        return false;
    }
}

/** Area shared by two rects. Zero when they do not touch. */
export function rectOverlapArea(a: ObstacleRect, b: ObstacleRect): number {
    const dx = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
    const dy = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
    if (dx <= 0 || dy <= 0) return 0;
    return dx * dy;
}

/**
 * Candidate parking spots, in preference order.
 *
 * Bottom-right first because it is the conventional resting place for an
 * assistant and where the existing default puts it — collision awareness only
 * moves it when that corner is genuinely obstructive, so the familiar position
 * is kept whenever it is harmless.
 */
export function bosParkingCandidates(
    size: { width: number; height: number },
    canvas: BosCanvasBounds,
): BosFloatingGeometry[] {
    const right = Math.max(BOS_FLOAT_MARGIN_PX, Math.round(canvas.width - size.width - BOS_FLOAT_MARGIN_PX));
    const left = BOS_FLOAT_MARGIN_PX;
    const bottom = Math.max(
        BOS_FLOAT_TOP_SAFE_PX + BOS_FLOAT_MARGIN_PX,
        Math.round(canvas.height - size.height - BOS_FLOAT_BOTTOM_SAFE_PX - BOS_FLOAT_MARGIN_PX),
    );
    const top = BOS_FLOAT_TOP_SAFE_PX + BOS_FLOAT_MARGIN_PX;

    const corners = [
        { x: right, y: bottom, ...size },
        { x: right, y: top, ...size },
        { x: left, y: bottom, ...size },
        { x: left, y: top, ...size },
    ];

    // A coarse grid after the corners. Dense pages — landing surfaces with tiles
    // in every corner — can obstruct all four, and settling for "least bad" when
    // a genuinely clear spot exists is not good enough: the requirement is that
    // the assistant does not settle over actionable content at all.
    //
    // Corners stay FIRST so the familiar resting place still wins whenever it is
    // harmless, and the grid is only reached when it is not.
    const grid: BosFloatingGeometry[] = [];
    const stepX = Math.max(80, Math.round((right - left) / 6) || 80);
    const stepY = Math.max(80, Math.round((bottom - top) / 4) || 80);
    for (let y = bottom; y >= top; y -= stepY) {
        for (let x = right; x >= left; x -= stepX) {
            grid.push({ x, y, ...size });
        }
    }

    return [...corners, ...grid].map((g) => clampBosFloatingGeometry(g, canvas));
}

/**
 * Pick the parking spot that obstructs the fewest actionable controls.
 *
 * Ties keep the earlier candidate, so an unobstructed bottom-right always wins
 * and placement stays predictable. Returns the first candidate unchanged when
 * there are no obstacles — with nothing to avoid, nothing should move.
 */
export function chooseBosParkingGeometry(params: {
    size: { width: number; height: number };
    canvas: BosCanvasBounds;
    obstacles: ObstacleRect[];
}): { geometry: BosFloatingGeometry; obstructed: number } {
    const candidates = bosParkingCandidates(params.size, params.canvas);
    const obstacles = params.obstacles ?? [];
    if (obstacles.length === 0) return { geometry: candidates[0]!, obstructed: 0 };

    let best = candidates[0]!;
    let bestCount = Number.POSITIVE_INFINITY;
    let bestArea = Number.POSITIVE_INFINITY;

    for (const candidate of candidates) {
        let count = 0;
        let area = 0;
        for (const o of obstacles) {
            const overlap = rectOverlapArea(candidate, o);
            if (overlap > 0) {
                count += 1;
                area += overlap;
            }
        }
        // Count first: hiding three controls a little is worse than clipping one
        // a lot. Area breaks ties so a near-miss beats a heavy overlap.
        if (count < bestCount || (count === bestCount && area < bestArea)) {
            best = candidate;
            bestCount = count;
            bestArea = area;
        }
        if (count === 0) break;
    }

    return { geometry: best, obstructed: bestCount === Number.POSITIVE_INFINITY ? 0 : bestCount };
}
