/** Test-only export for rollup value computation. */
export function rollupValues(type: string, values: number[], weights?: number[]): number | null {
    const finite = values.filter((v) => Number.isFinite(v));
    if (!finite.length) return null;

    switch (type) {
        case "sum":
            return finite.reduce((a, b) => a + b, 0);
        case "avg":
            return finite.reduce((a, b) => a + b, 0) / finite.length;
        case "weighted_avg": {
            if (!weights || weights.length !== finite.length) return null;
            const totalWeight = weights.reduce((a, b) => a + b, 0);
            if (totalWeight === 0) return null;
            return finite.reduce((acc, v, i) => acc + v * (weights[i] ?? 0), 0) / totalWeight;
        }
        case "best":
            return Math.max(...finite);
        case "worst":
            return Math.min(...finite);
        case "composite_score":
            return finite.reduce((a, b) => a + b, 0) / finite.length;
        case "health_score": {
            const healthy = finite.filter((v) => v >= 0.8).length;
            return healthy / finite.length;
        }
        default:
            return null;
    }
}
