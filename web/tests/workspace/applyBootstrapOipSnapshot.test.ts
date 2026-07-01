import { describe, expect, it } from "vitest";

import { bootstrapOipSnapshotToClientState } from "@/lib/workspace/applyBootstrapOipSnapshot";
import type { MetricResolveApiItem } from "@/app/api/admin/metrics/resolve/route";

describe("applyBootstrapOipSnapshot", () => {
    it("maps bootstrap metrics to client resolved + strip values", () => {
        const metrics: MetricResolveApiItem[] = [
            {
                metric_key: "ops.needs_attention_count",
                label: "Needs Attention",
                format: "count",
                value: 3,
                formatted_value: "3",
                window: "rolling_30d",
                window_start: "2026-01-01T00:00:00.000Z",
                window_end: "2026-01-01T00:00:00.000Z",
                computed_at: "2026-01-01T00:00:00.000Z",
                resolve_mode: "snapshot",
                sources: [],
                source_metadata: {} as MetricResolveApiItem["source_metadata"],
            },
        ];
        const { resolved, stripValues } = bootstrapOipSnapshotToClientState(metrics);
        expect(resolved["ops.needs_attention_count"]?.formatted_value).toBe("3");
        expect(stripValues["ops.needs_attention_count"]).toBe("3");
    });
});
