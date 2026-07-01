import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(__dirname, "../../..");

type AttentionPerf = {
    rules_ms?: number;
    query_ms?: number;
    membership_filter_ms?: number;
    resolver_ms?: number;
    bucket_merge_ms?: number;
    candidate_count?: number;
};

/** Mirrors loadDeptOperationalBootstrap attention phase stamping (post-fix). */
function stampAttentionPhases(
    out: { source?: string },
    attentionPerf: AttentionPerf
): Record<string, unknown> {
    const phases: Record<string, unknown> = {};
    phases.attention_source = out.source ?? "unknown";
    if (out.source === "work_unit_needs_attention_lane") {
        phases.attention_rules_ms = attentionPerf.rules_ms;
        phases.attention_query_ms = attentionPerf.query_ms;
        phases.attention_candidate_fetch_ms = attentionPerf.query_ms;
        phases.attention_candidate_count = attentionPerf.candidate_count;
        phases.attention_membership_filter_ms = attentionPerf.membership_filter_ms;
        phases.attention_resolver_ms = attentionPerf.resolver_ms;
        phases.attention_bucket_merge_ms = attentionPerf.bucket_merge_ms;
    }
    return phases;
}

describe("dept attention bootstrap perf wiring", () => {
    it("loader only stamps subtimings for work_unit_needs_attention_lane", () => {
        const loaderPath = path.join(repoRoot, "web/lib/workspace/loadDeptOperationalBootstrap.ts");
        const src = fs.readFileSync(loaderPath, "utf8");
        expect(src).toContain('out.source === "work_unit_needs_attention_lane"');
        expect(src).toContain("attention_source");
    });

    it("optimized path copies measured subtimings", () => {
        const phases = stampAttentionPhases(
            { source: "work_unit_needs_attention_lane" },
            {
                rules_ms: 0,
                query_ms: 412,
                membership_filter_ms: 3,
                resolver_ms: 186,
                bucket_merge_ms: 6,
                candidate_count: 1184,
            }
        );
        expect(phases.attention_source).toBe("work_unit_needs_attention_lane");
        expect(phases.attention_query_ms).toBe(412);
        expect(phases.attention_resolver_ms).toBe(186);
        expect(phases.attention_candidate_count).toBe(1184);
        expect(phases.attention_bucket_merge_ms).toBe(6);
    });

    it("fallback path omits subtimings (avoids undefined keys in logs)", () => {
        const phases = stampAttentionPhases(
            { source: "department_attention_preview" },
            { query_ms: 999, resolver_ms: 999, candidate_count: 999 }
        );
        expect(phases.attention_source).toBe("department_attention_preview");
        expect(phases.attention_query_ms).toBeUndefined();
        expect(phases.attention_resolver_ms).toBeUndefined();
        expect(phases.attention_candidate_count).toBeUndefined();
    });

    it("bucket builder wires loadOpportunityNeedsAttentionRows perf and skipPostFilterSort", () => {
        const src = fs.readFileSync(
            path.join(repoRoot, "web/lib/workspace/buildWorkUnitScopedNeedsAttentionLaneBuckets.ts"),
            "utf8"
        );
        expect(src).toContain("skipPostFilterSort: true");
        expect(src).toContain("collectNeedsAttentionResolverMatches");
        expect(src).toContain("params.perf.query_ms = loadPerf.query_ms");
    });
});
