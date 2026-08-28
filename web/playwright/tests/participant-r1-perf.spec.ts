/**
 * What the parent waits for, measured rather than assumed.
 *
 * Every number here is a real elapsed interval — a fetch, a paint, a mutation observed. Nothing is
 * inferred from a fixed wait in a test, which is how a `waitForTimeout(22000)` becomes a reported
 * "22s" that measures the test and not the product.
 *
 * The document route emits `server-timing`, so server work is separated from network and from the
 * client's own pdf.js render instead of being lumped into one wall-clock figure.
 */
import { test } from "@playwright/test";

const TOKEN = process.env.PARTICIPANT_TOKEN ?? "";
const RUNS = Number(process.env.R1_RUNS ?? "5");
test.use({ storageState: { cookies: [], origins: [] } });

function stats(label: string, xs: number[]): string {
    if (!xs.length) return `${label}: no samples`;
    const s = [...xs].sort((a, b) => a - b);
    const p = (q: number) => Math.round(s[Math.min(s.length - 1, Math.floor(q * s.length))]);
    return `${label.padEnd(34)} n=${s.length}  min=${Math.round(s[0])}  p50=${p(0.5)}  max=${Math.round(s[s.length - 1])}`;
}

test("what the parent waits for", async ({ page }) => {
    test.setTimeout(600_000);
    test.skip(!TOKEN, "no token");

    await page.goto(`/forms/embed/${TOKEN}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(6000);

    // ── the document itself: server compose/fill, then transfer ──────────────────────────────────
    const docSamples: Array<{ total: number; server: number; render: number; bytes: number }> = [];
    for (let i = 0; i < RUNS; i++) {
        docSamples.push(
            await page.evaluate(async (t) => {
                const t0 = performance.now();
                const r = await fetch(`/api/public/forms/${t}/enrollment-document?rev=perf${Date.now()}`);
                const buf = await r.arrayBuffer();
                const total = performance.now() - t0;
                /*
                 * `total` is a PHASE in this header, beside `token` and `render` — summing every
                 * `dur=` double-counts and reports roughly twice the real server time, which is how
                 * "network + transfer" first came out negative. Read the one that means the whole.
                 */
                const header = r.headers.get("server-timing") ?? "";
                const server = Number(/(?:^|,)\s*total;dur=([\d.]+)/.exec(header)?.[1] ?? "0");
                const render = Number(/(?:^|,)\s*render;dur=([\d.]+)/.exec(header)?.[1] ?? "0");
                return { total, server, render, bytes: buf.byteLength };
            }, TOKEN),
        );
    }

    const artifactSamples: number[] = [];
    for (let i = 0; i < RUNS; i++) {
        artifactSamples.push(
            await page.evaluate(async (t) => {
                const t0 = performance.now();
                await (await fetch(`/api/public/forms/${t}/enrollment-artifact`)).json();
                return performance.now() - t0;
            }, TOKEN),
        );
    }

    const objectiveSamples: number[] = [];
    for (let i = 0; i < RUNS; i++) {
        objectiveSamples.push(
            await page.evaluate(async (t) => {
                const t0 = performance.now();
                await (await fetch(`/api/public/forms/${t}/enrollment-objective`)).json();
                return performance.now() - t0;
            }, TOKEN),
        );
    }

    // ── pdf.js: the client's own render of the first page, observed by mutation ──────────────────
    const enter = page.getByRole("button", { name: /review paperwork/i });
    let renderMs: number | null = null;
    if (await enter.count()) {
        const t0 = Date.now();
        await enter.first().click();
        await page.locator("[data-participant-document] canvas").first().waitFor({ state: "attached", timeout: 90_000 });
        renderMs = Date.now() - t0;
    }

    // ── tap to sign → the capture surface is usable ──────────────────────────────────────────────
    let tapMs: number | null = null;
    const good = page.getByRole("button", { name: /everything looks good/i }).first();
    if (await good.count().then((n) => n > 0 && good.isEnabled())) {
        await good.click();
        const tap = page.getByText(/tap to sign/i);
        if (await tap.count()) {
            const t0 = Date.now();
            await tap.first().click();
            await page.getByRole("checkbox").last().waitFor({ state: "visible", timeout: 60_000 });
            tapMs = Date.now() - t0;
        }
    }

    const bytes = docSamples[0]?.bytes ?? 0;
    console.log("\n=== WHAT THE PARENT WAITS FOR ===");
    console.log(`document bytes: ${bytes}`);
    console.log(stats("document fetch (total)", docSamples.map((s) => s.total)));
    console.log(stats("  of which server (total;dur)", docSamples.map((s) => s.server)));
    console.log(stats("  of which PDF fill/compose", docSamples.map((s) => s.render)));
    console.log(stats("  network + transfer", docSamples.map((s) => s.total - s.server)));
    console.log(stats("artifact contract fetch", artifactSamples));
    console.log(stats("objective fetch", objectiveSamples));
    console.log(`review click -> first page painted (pdf.js): ${renderMs ?? "not measured"} ms`);
    console.log(`tap to sign -> capture usable:               ${tapMs ?? "not measured"} ms`);
});
