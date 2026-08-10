import { test, expect } from "@playwright/test";

/**
 * Search Platform V2 — tenant discovery.
 *
 * Reports the SHAPE of what the live tenant can certify (kinds, context kinds,
 * destination keys, counts) and the minimum identifying text needed to drive the
 * UI certification afterwards. It does not dump records.
 */

const PROBES = ["ma", "ku", "le", "ro", "sa", "br", "ca", "ha", "li", "mi", "na", "ri", "ta", "be"];

test("discover certifiable subjects in the live tenant", async ({ request }) => {
    test.setTimeout(240_000);
    const summary: string[] = [];
    const timings: number[] = [];

    for (const probe of PROBES) {
        const t0 = Date.now();
        const res = await request.get(`/api/admin/global-search?q=${encodeURIComponent(probe)}&limit=20`);
        timings.push(Date.now() - t0);
        if (res.status() !== 200) {
            summary.push(`q="${probe}" -> HTTP ${res.status()}`);
            continue;
        }
        const body = await res.json();
        const results = (body.results ?? []) as Array<{
            subject: { kind: string; display_name: string };
            recognition: Record<string, unknown>;
            contexts: Array<{ kind: string; key: string; label: string; detail?: string | null }>;
            destinations: Array<{ key: string }>;
            ranking: { score: number };
        }>;

        summary.push(
            `q="${probe}" -> ${results.length} results; kinds=${JSON.stringify(
                results.reduce<Record<string, number>>((acc, r) => {
                    acc[r.subject.kind] = (acc[r.subject.kind] ?? 0) + 1;
                    return acc;
                }, {})
            )}`
        );

        const withProcess = results.filter((r) => r.contexts.some((c) => c.kind === "process"));
        const withSchedule = results.filter((r) => r.contexts.some((c) => c.kind === "schedule"));
        summary.push(`   with process contexts: ${withProcess.length}; with schedule: ${withSchedule.length}`);

        if (withProcess.length) {
            const sample = withProcess[0];
            summary.push(
                `   SAMPLE name="${sample.subject.display_name}" kind=${sample.subject.kind} ` +
                    `processes=${JSON.stringify(sample.contexts.filter((c) => c.kind === "process").map((c) => `${c.label}:${c.detail ?? ""}`))} ` +
                    `destinations=${JSON.stringify(sample.destinations.map((d) => d.key))}`
            );
        }
        // A multi-process subject is the Case 4 fixture.
        const multi = results.find((r) => r.contexts.filter((c) => c.kind === "process").length >= 2);
        if (multi) {
            summary.push(
                `   MULTI-PROCESS name="${multi.subject.display_name}" count=${multi.contexts.filter((c) => c.kind === "process").length}`
            );
        }
        // Duplicate display names are the disambiguation fixture.
        const names = results.map((r) => r.subject.display_name);
        const dupes = names.filter((n, i) => names.indexOf(n) !== i);
        if (dupes.length) summary.push(`   DUPLICATE NAMES: ${JSON.stringify([...new Set(dupes)])}`);
    }

    const sorted = [...timings].sort((a, b) => a - b);
    summary.push(
        `TIMING n=${timings.length} min=${sorted[0]}ms p50=${sorted[Math.floor(sorted.length / 2)]}ms ` +
            `p95=${sorted[Math.floor(sorted.length * 0.95)]}ms max=${sorted[sorted.length - 1]}ms`
    );

    console.log("\n===== SEARCH V2 TENANT DISCOVERY =====\n" + summary.join("\n") + "\n=====\n");
    expect(summary.length).toBeGreaterThan(0);
});
