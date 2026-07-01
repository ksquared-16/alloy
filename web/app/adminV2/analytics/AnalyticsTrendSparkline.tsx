"use client";

export type AnalyticsTrendSparklineProps = {
    /** Server-normalized Y values (0–1), oldest → newest. */
    points: number[];
    direction?: "up" | "down" | "flat";
};

/** Dumb SVG renderer — no client-side metric math. */
export function AnalyticsTrendSparkline({ points, direction = "flat" }: AnalyticsTrendSparklineProps) {
    if (!points.length) return null;

    const width = 56;
    const height = 20;
    const pad = 2;
    const step = points.length > 1 ? (width - pad * 2) / (points.length - 1) : 0;

    const coords = points.map((y, i) => {
        const x = pad + i * step;
        const clamped = Math.max(0, Math.min(1, y));
        const py = pad + (1 - clamped) * (height - pad * 2);
        return `${x},${py}`;
    });

    const stroke =
        direction === "up" ? "#2f5d4a"
        : direction === "down" ? "#c45c26"
        : "#6b7280";

    return (
        <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            className="shrink-0 opacity-80"
            aria-hidden
            data-analytics-sparkline="true"
        >
            <polyline
                fill="none"
                stroke={stroke}
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={coords.join(" ")}
            />
        </svg>
    );
}
