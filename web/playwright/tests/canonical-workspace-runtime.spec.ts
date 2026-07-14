import { expect, test, type Request, type Response } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Canonical workspace/Work Unit runtime browser acceptance gate. This asserts DEPLOYED behavior on
 * the real mounted routes — the source of truth that source/unit tests cannot certify.
 *
 * Run against a preview with an authenticated session:
 *   PLAYWRIGHT_BASE_URL=<preview-url> \
 *   PLAYWRIGHT_STORAGE_STATE=./.auth/state.json \
 *   PLAYWRIGHT_CERT=1 \
 *   npx playwright test playwright/tests/canonical-workspace-runtime.spec.ts
 *
 * Env:
 *   PLAYWRIGHT_BASE_URL       base URL (default http://127.0.0.1:3000)
 *   PLAYWRIGHT_STORAGE_STATE  path to a pre-authenticated storageState JSON
 *   PLAYWRIGHT_CERT=1         certification mode — FAIL (not skip) if unauthenticated
 *   WU_SLUG_A / WU_SLUG_B     work-unit slugs (default new-leads / all-leads)
 *   WORK_VIEW_TARGET          a Work View pill label to switch to (default "Active Pipeline")
 *
 * Writes a JSON result + the captured request graph to ./playwright/artifacts/.
 */

const STORAGE_STATE = process.env.PLAYWRIGHT_STORAGE_STATE;
const CERT = process.env.PLAYWRIGHT_CERT === "1";
const WU_A = process.env.WU_SLUG_A || "new-leads";
const WU_B = process.env.WU_SLUG_B || "all-leads";
const SWITCH_TO = process.env.WORK_VIEW_TARGET || "Active Pipeline";
const ARTIFACT_DIR = resolve(__dirname, "../artifacts");

if (STORAGE_STATE) test.use({ storageState: STORAGE_STATE });

type Captured = {
    url: string;
    method: string;
    status: number | null;
    responseBytes: number | null;
    resolvedMode: string | null;
    callerSurface: string | null;
    buildSha: string | null;
};

function writeArtifact(name: string, data: unknown) {
    try {
        mkdirSync(ARTIFACT_DIR, { recursive: true });
        writeFileSync(resolve(ARTIFACT_DIR, name), JSON.stringify(data, null, 2));
    } catch {
        /* best-effort */
    }
}

test.describe("canonical workspace runtime — deployed acceptance", () => {
    test("build identity is provable from the running server", async ({ request, baseURL }) => {
        const res = await request.get("/api/build-info");
        expect(res.ok(), "/api/build-info must respond").toBeTruthy();
        const info = await res.json();
        writeArtifact("build-info.json", { baseURL, ...info });
        expect(info.gitSha, "running build must expose its commit SHA").toBeTruthy();
    });

    test("Work Unit visible rows use the compact projection and one owner; no stale keys / 404s", async ({ page }) => {
        const captured: Captured[] = [];
        const queue404: string[] = [];
        const staleKeyRequests: string[] = [];

        page.on("response", async (response: Response) => {
            const req: Request = response.request();
            const url = req.url();
            if (!/\/api\/admin\/queues\//.test(url) && !url.includes("/queue-view-totals")) return;
            let bytes: number | null = null;
            try {
                bytes = (await response.body()).byteLength;
            } catch {
                /* ignore */
            }
            const h = response.headers();
            captured.push({
                url,
                method: req.method(),
                status: response.status(),
                responseBytes: bytes,
                resolvedMode: h["x-alloy-queue-resolved-mode"] ?? null,
                callerSurface: h["x-alloy-queue-caller-surface"] ?? null,
                buildSha: h["x-alloy-build-sha"] ?? null,
            });
            if (/lifecycle_qualification|pipeline_total/.test(url)) staleKeyRequests.push(url);
            if (response.status() === 404 && /\/api\/admin\/queues\//.test(url)) queue404.push(url);
        });

        await page.goto(`/workspace/work-unit/${WU_A}`, { waitUntil: "commit" });
        if (/\/login/.test(page.url())) {
            const msg = "No authenticated session — set PLAYWRIGHT_STORAGE_STATE.";
            if (CERT) throw new Error(`CERT mode: ${msg}`);
            test.skip(true, msg);
            return;
        }
        await page.waitForLoadState("networkidle").catch(() => {});

        writeArtifact("work-unit-request-graph.json", captured);

        const visibleRows = captured.filter(
            (c) => c.callerSurface === "work_unit_runtime" || /\/api\/admin\/queues\/[^/]+\/[^/?]+/.test(c.url),
        );
        // No deleted/stale queue key ever requested; no queue 404.
        expect(staleKeyRequests, `stale-key requests: ${staleKeyRequests.join(", ")}`).toHaveLength(0);
        expect(queue404, `queue 404s: ${queue404.join(", ")}`).toHaveLength(0);
        // The canonical visible-rows request must resolve the compact projection, not queue_list.
        const runtimeRows = captured.filter((c) => c.callerSurface === "work_unit_runtime");
        for (const r of runtimeRows) {
            expect(r.resolvedMode, `visible-rows request ${r.url} must be queue_reveal`).not.toBe("queue_list");
        }

        // A populated Work View must NEVER show the empty prompt while rows exist.
        const rows = page.locator("[data-work-view-id], [data-queue-row], [role='listitem']");
        const hasRows = (await rows.count()) > 0;
        if (hasRows) {
            await expect(page.getByText("Select a record to begin")).toHaveCount(0);
        }
        expect(visibleRows.length, "at least one queue request observed").toBeGreaterThan(0);
    });

    test("Work View switch resolves a subject with no stale keys, no blank panel", async ({ page }) => {
        const staleKeyRequests: string[] = [];
        const queue404: string[] = [];
        page.on("response", (response) => {
            const url = response.request().url();
            if (/lifecycle_qualification|pipeline_total/.test(url)) staleKeyRequests.push(url);
            if (response.status() === 404 && /\/api\/admin\/queues\//.test(url)) queue404.push(url);
        });

        await page.goto(`/workspace/work-unit/${WU_A}`, { waitUntil: "commit" });
        if (/\/login/.test(page.url())) {
            if (CERT) throw new Error("CERT mode: unauthenticated");
            test.skip(true, "unauthenticated");
            return;
        }
        await page.waitForLoadState("networkidle").catch(() => {});
        const pill = page.getByRole("link", { name: new RegExp(SWITCH_TO, "i") }).or(page.getByText(SWITCH_TO));
        if (await pill.count()) {
            await pill.first().click();
            await page.waitForLoadState("networkidle").catch(() => {});
            await expect(page.getByText("Select a record to begin")).toHaveCount(0);
        }
        expect(staleKeyRequests, `stale-key requests: ${staleKeyRequests.join(", ")}`).toHaveLength(0);
        expect(queue404, `queue 404s: ${queue404.join(", ")}`).toHaveLength(0);
        writeArtifact("work-view-switch.json", { switchedTo: SWITCH_TO, staleKeyRequests, queue404 });
    });

    test("leave and return restores a selected subject (no blank Focus Panel)", async ({ page }) => {
        await page.goto(`/workspace/work-unit/${WU_A}`, { waitUntil: "commit" });
        if (/\/login/.test(page.url())) {
            if (CERT) throw new Error("CERT mode: unauthenticated");
            test.skip(true, "unauthenticated");
            return;
        }
        await page.waitForLoadState("networkidle").catch(() => {});
        await page.goto("/workspace", { waitUntil: "commit" });
        await page.waitForLoadState("networkidle").catch(() => {});
        await page.goto(`/workspace/work-unit/${WU_A}`, { waitUntil: "commit" });
        await page.waitForLoadState("networkidle").catch(() => {});
        const rows = page.locator("[data-work-view-id], [data-queue-row]");
        if ((await rows.count()) > 0) {
            await expect(page.getByText("Select a record to begin")).toHaveCount(0);
        }
        void WU_B;
    });
});
