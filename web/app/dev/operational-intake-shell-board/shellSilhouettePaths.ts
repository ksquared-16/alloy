/** Fixed shell canvas — identical for every study; interior position never moves. */
export const SHELL_CANVAS_W = 1360;
export const SHELL_CANVAS_H = 624;
export const SHELL_INTERIOR_X = 80;
export const SHELL_INTERIOR_Y = 32;

export type SilhouetteSpec = {
    path: string;
    /** Optional atmospheric layer rendered outside the geometric path only. */
    aura?: "cloud-core";
};

function stadiumCapsule(w: number, h: number, rx: number, ry: number): string {
    const flatLeft = rx;
    const flatRight = w - rx;
    return [
        `M ${flatLeft} 0`,
        `L ${flatRight} 0`,
        `A ${rx} ${ry} 0 0 1 ${flatRight} ${h}`,
        `L ${flatLeft} ${h}`,
        `A ${rx} ${ry} 0 0 1 ${flatLeft} 0`,
        "Z",
    ].join(" ");
}

function superellipsePath(w: number, h: number, n = 4, segments = 72): string {
    const cx = w / 2;
    const cy = h / 2;
    const a = w / 2;
    const b = h / 2;
    const parts: string[] = [];

    for (let i = 0; i <= segments; i++) {
        const t = (i / segments) * Math.PI * 2;
        const cos = Math.cos(t);
        const sin = Math.sin(t);
        const x = cx + a * Math.sign(cos) * Math.pow(Math.abs(cos), 2 / n);
        const y = cy + b * Math.sign(sin) * Math.pow(Math.abs(sin), 2 / n);
        parts.push(`${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`);
    }

    return `${parts.join(" ")} Z`;
}

function roundedPolygonPath(points: [number, number][], radius: number): string {
    const n = points.length;
    if (n < 3) return "";

    const corners: { start: [number, number]; arc: [number, number]; end: [number, number] }[] = [];

    for (let i = 0; i < n; i++) {
        const prev = points[(i + n - 1) % n];
        const curr = points[i];
        const next = points[(i + 1) % n];

        const v1x = prev[0] - curr[0];
        const v1y = prev[1] - curr[1];
        const v2x = next[0] - curr[0];
        const v2y = next[1] - curr[1];
        const len1 = Math.hypot(v1x, v1y);
        const len2 = Math.hypot(v2x, v2y);
        const r = Math.min(radius, len1 / 2, len2 / 2);

        const start: [number, number] = [curr[0] + (v1x / len1) * r, curr[1] + (v1y / len1) * r];
        const end: [number, number] = [curr[0] + (v2x / len2) * r, curr[1] + (v2y / len2) * r];
        corners.push({ start, arc: curr, end });
    }

    let d = `M ${corners[0].start[0].toFixed(2)} ${corners[0].start[1].toFixed(2)}`;
    for (let i = 0; i < n; i++) {
        const { arc, end } = corners[i];
        d += ` Q ${arc[0].toFixed(2)} ${arc[1].toFixed(2)} ${end[0].toFixed(2)} ${end[1].toFixed(2)}`;
    }
    return `${d} Z`;
}

function wingedStadiumPath(w: number, h: number, wing: number): string {
    const ry = h / 2;
    const rx = ry;
    const flatLeft = rx;
    const flatRight = w - rx;
    const wingY1 = h * 0.33;
    const wingY2 = h * 0.67;

    return [
        `M ${flatLeft} 0`,
        `L ${flatRight} 0`,
        `A ${rx} ${ry} 0 0 1 ${flatRight} ${wingY1}`,
        `Q ${flatRight + wing} ${h * 0.5} ${flatRight} ${wingY2}`,
        `A ${rx} ${ry} 0 0 1 ${flatRight} ${h}`,
        `L ${flatLeft} ${h}`,
        `A ${rx} ${ry} 0 0 1 ${flatLeft} ${wingY2}`,
        `Q ${flatLeft - wing} ${h * 0.5} ${flatLeft} ${wingY1}`,
        `A ${rx} ${ry} 0 0 1 ${flatLeft} 0`,
        "Z",
    ].join(" ");
}

function shieldPath(w: number, h: number): string {
    const topInset = w * 0.04;
    const bottomInset = w * 0.11;
    const shoulderY = h * 0.22;
    const waistY = h * 0.58;
    const r = 22;

    return [
        `M ${topInset + r} 0`,
        `L ${w - topInset - r} 0`,
        `Q ${w - topInset} 0 ${w - topInset * 0.35} ${shoulderY}`,
        `Q ${w - bottomInset} ${waistY} ${w / 2 + r} ${h - r}`,
        `Q ${w / 2} ${h} ${w / 2 - r} ${h - r}`,
        `Q ${bottomInset} ${waistY} ${topInset * 0.35} ${shoulderY}`,
        `Q ${topInset} 0 ${topInset + r} 0`,
        "Z",
    ].join(" ");
}

const W = SHELL_CANVAS_W;
const H = SHELL_CANVAS_H;

/** True perimeter paths — geometry defines identity, not border-radius on rectangles. */
export const SILHOUETTE_SPECS: Record<string, SilhouetteSpec> = {
    "horizontal-capsule": {
        path: stadiumCapsule(W, H, H / 2, H / 2),
    },
    "stadium-object": {
        path: stadiumCapsule(W, H, H / 2 + 36, H / 2),
    },
    superellipse: {
        path: superellipsePath(W, H, 4),
    },
    "rounded-hexagon": {
        path: roundedPolygonPath(
            [
                [W * 0.14, H * 0.1],
                [W * 0.86, H * 0.1],
                [W * 0.97, H * 0.5],
                [W * 0.86, H * 0.9],
                [W * 0.14, H * 0.9],
                [W * 0.03, H * 0.5],
            ],
            36,
        ),
    },
    "rounded-octagon": {
        path: roundedPolygonPath(
            [
                [W * 0.18, H * 0.06],
                [W * 0.82, H * 0.06],
                [W * 0.96, H * 0.28],
                [W * 0.96, H * 0.72],
                [W * 0.82, H * 0.94],
                [W * 0.18, H * 0.94],
                [W * 0.04, H * 0.72],
                [W * 0.04, H * 0.28],
            ],
            28,
        ),
    },
    "winged-stadium": {
        path: wingedStadiumPath(W, H, 28),
    },
    shield: {
        path: shieldPath(W, H),
    },
    "cloud-core": {
        path: superellipsePath(W, H, 4),
        aura: "cloud-core",
    },
};
