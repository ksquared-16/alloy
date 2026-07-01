"use client";

type Props = {
    label: string;
    points: number[];
    loading?: boolean;
    compact?: boolean;
};

export function MetricSparkline({ label, points, loading = false, compact = false }: Props) {
    const width = compact ? 80 : 120;
    const height = compact ? 16 : 32;
    const finite = points.filter((p) => Number.isFinite(p));
    const min = finite.length ? Math.min(...finite) : 0;
    const max = finite.length ? Math.max(...finite) : 1;
    const range = max - min || 1;

    const path = finite
        .map((v, i) => {
            const x = finite.length <= 1 ? width / 2 : (i / (finite.length - 1)) * width;
            const y = height - ((v - min) / range) * (height - 4) - 2;
            return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(" ");

    return (
        <div data-metric-visual="sparkline" className={compact ? "" : "mt-1"}>
            {label ?
                <p className="mb-1 text-[10px] font-medium text-alloy-midnight/50">{label}</p>
            :   null}
            {loading || !finite.length ?
                <div className={`${compact ? "h-4" : "h-6"} w-20 animate-pulse rounded bg-alloy-stone/10`} />
            :   <svg width={width} height={height} aria-hidden="true" className="text-alloy-juniper">
                    <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
            }
        </div>
    );
}
