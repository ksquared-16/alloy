/**
 * D1 proof 13 — server composition within the RATIFIED budget.
 *
 * Budget (docs/platform/runtime/runtime-implementation-authorization.md, Part 8):
 *   cold Operational Commit ≤ 800 ms p75 / ≤ 1200 ms p95
 *     — of which SERVER COMPOSITION ≤ 400 ms (p75)
 *
 * D1's ratified stop condition (Authorization :529): "Server composition merely relocates the
 * waterfall — D1 measures it before D3/D4 depend on it. If composition exceeds its budget, the
 * mission stops at D1 — it does not proceed and hope."
 *
 * Live-only: measures the real answer against the running local Postgres/Supabase on a production
 * build. Skipped unless D1_LIVE=1 so CI never depends on a local stack.
 *
 *   D1_LIVE=1 \
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:56321 \
 *   SUPABASE_SERVICE_ROLE_KEY=<local key> \
 *   npx vitest run tests/runtime/d1ProvisioningBudget.live.test.ts
 */
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { composeWorkUnitProvisioningAnswer } from "@/lib/runtime/provisioning/workUnitProvisioningAnswer";

const LIVE = process.env.D1_LIVE === "1";
const ORG = process.env.DEV_QUEUE_ORG_ID || "00000000-0000-4000-8000-000000000001";
const SAMPLES = Number(process.env.D1_SAMPLES || 30);
const SERVER_COMPOSITION_P75_MS = 400;

function pct(values: number[], p: number): number {
    const s = [...values].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
}

describe.skipIf(!LIVE)("D1 — server composition budget (live, representative local environment)", () => {
    it(`composes within ≤${SERVER_COMPOSITION_P75_MS} ms p75 over ${SAMPLES} samples`, async () => {
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
            { auth: { persistSession: false } },
        );

        const totals: number[] = [];
        const deps: Record<string, number[]> = {
            work_unit_ms: [], configuration_ms: [], records_ms: [], projection_ms: [], composition_ms: [],
        };

        for (let i = 0; i < SAMPLES; i++) {
            const a = await composeWorkUnitProvisioningAnswer({
                supabase,
                orgId: ORG,
                workUnitSlug: "new_leads",
                requestedWorkViewId: "new_leads",
            });
            expect(a.terminal).toBe("operational");
            totals.push(a.timings.total_ms);
            for (const k of Object.keys(deps)) deps[k].push((a.timings as Record<string, number>)[k]);
        }

        const p50 = pct(totals, 50);
        const p75 = pct(totals, 75);
        const p95 = pct(totals, 95);

        // Durable evidence — D1 must CAPTURE the dependency trace, not just assert a pass.
        const sample = await composeWorkUnitProvisioningAnswer({
            supabase, orgId: ORG, workUnitSlug: "new_leads", requestedWorkViewId: "new_leads",
        });
        const evidence = {
            samples: SAMPLES,
            budget_p75_ms: SERVER_COMPOSITION_P75_MS,
            server_composition_ms: { p50, p75, p95 },
            within_budget: p75 <= SERVER_COMPOSITION_P75_MS,
            dependency_chain_ms: Object.fromEntries(
                Object.entries(deps).map(([k, v]) => [k, { p50: pct(v, 50), p75: pct(v, 75), p95: pct(v, 95) }]),
            ),
            payload_bytes: Buffer.byteLength(JSON.stringify(sample), "utf8"),
            payload_shape: Object.keys(sample).sort(),
            rows_returned: sample.terminal === "operational" ? sample.rows.length : 0,
            terminal: sample.terminal,
        };
        const dir = process.env.RC_EVIDENCE_DIR;
        if (dir) {
            const { writeFileSync, mkdirSync } = await import("fs");
            mkdirSync(dir, { recursive: true });
            writeFileSync(`${dir}/d1-composition-budget.json`, JSON.stringify(evidence, null, 2));
        }
        process.stdout.write(`\n[D1 SERVER COMPOSITION]\n${JSON.stringify(evidence, null, 2)}\n`);

        expect(p75).toBeLessThanOrEqual(SERVER_COMPOSITION_P75_MS);
    }, 120_000);
});
