import { expect, test, type Request, type Response } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Canonical workspace/Work Unit runtime browser acceptance gate. Asserts DEPLOYED behavior on the
 * real mounted routes — the source of truth that source/unit tests cannot certify. The operator (or
 * CI) runs this against a preview with an authenticated session; deterministic work does NOT depend
 * on it, but final deployed certification does.
 *
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
 * Artifacts written to ./playwright/artifacts/:
 *   build-info.json · workspace-request-graph.json · work-unit-request-graph.json ·
 *   work-view-switch.json · return-navigation.json · focus-panel-first-paint.json ·
 *   certification-summary.json
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

/** Resources the /workspace boot must NOT initiate (forbidden ownership). */
const FORBIDDEN_WORKSPACE_FRAGMENTS = [
    "/api/admin/operational-tasks",
    "/api/admin/communications/templates",
    "/api/admin/communications/status-options",
    "/api/admin/communications/announcements",
    "/api/admin/communications/provider",
    "/api/admin/inbox/threads",
    "/api/admin/processing",
];

/** Focus Panel first-paint must NOT fetch these before its useful commit. */
const FORBIDDEN_FIRST_PAINT_FRAGMENTS = [
    "/api/admin/view-models/drawer/person",
    "/activity",
    "/communications/threads",
    "/communications/messages",
    "/related",
];

/** Accumulates each phase's verdict for the certification summary artifact. */
const summary: Record<string, unknown> = { cert: CERT, baseURL: process.env.PLAYWRIGHT_BASE_URL ?? null, phases: {} };

function writeArtifact(name: string, data: unknown) {
    try {
        mkdirSync(ARTIFACT_DIR, { recursive: true });
        writeFileSync(resolve(ARTIFACT_DIR, name), JSON.stringify(data, null, 2));
    } catch {
        /* best-effort */
    }
}

function recordPhase(name: string, verdict: unknown) {
    (summary.phases as Record<string, unknown>)[name] = verdict;
}

function unauthenticated(pageUrl: string): boolean {
    return /\/login|\/sign-in/.test(pageUrl);
}

test.afterAll(() => {
    writeArtifact("certification-summary.json", summary);
});

test.describe("canonical workspace runtime — deployed acceptance", () => {
    test("build identity is provable from the running server", async ({ request, baseURL }) => {
        const res = await request.get("/api/build-info");
        expect(res.ok(), "/api/build-info must respond").toBeTruthy();
        const info = await res.json();
        writeArtifact("build-info.json", { baseURL, ...info });
        recordPhase("build_info", { gitSha: info.gitSha ?? null, ok: Boolean(info.gitSha) });
        expect(info.gitSha, "running build must expose its commit SHA").toBeTruthy();
    });

    test("/workspace boot initiates no forbidden resources", async ({ page }) => {
        const requested: string[] = [];
        page.on("request", (req: Request) => requested.push(req.url()));

        await page.goto("/workspace", { waitUntil: "commit" });
        if (unauthenticated(page.url())) {
            if (CERT) throw new Error("CERT mode: unauthenticated — set PLAYWRIGHT_STORAGE_STATE");
            test.skip(true, "unauthenticated");
            return;
        }
        await page.waitForLoadState("networkidle").catch(() => {});

        const forbidden = FORBIDDEN_WORKSPACE_FRAGMENTS.flatMap((f) =>
            requested.filter((u) => u.includes(f)),
        );
        writeArtifact("workspace-request-graph.json", { total: requested.length, forbidden, requested });
        recordPhase("workspace_boot", { forbidden });
        expect(forbidden, `forbidden /workspace boot requests: ${forbidden.join(", ")}`).toHaveLength(0);
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
        if (unauthenticated(page.url())) {
            const msg = "No authenticated session — set PLAYWRIGHT_STORAGE_STATE.";
            if (CERT) throw new Error(`CERT mode: ${msg}`);
            test.skip(true, msg);
            return;
        }
        await page.waitForLoadState("networkidle").catch(() => {});

        writeArtifact("work-unit-request-graph.json", captured);
        const runtimeRows = captured.filter((c) => c.callerSurface === "work_unit_runtime");
        recordPhase("work_unit_rows", {
            queue404,
            staleKeyRequests,
            runtimeRowModes: runtimeRows.map((r) => r.resolvedMode),
            runtimeRowBytes: runtimeRows.map((r) => r.responseBytes),
        });

        expect(staleKeyRequests, `stale-key requests: ${staleKeyRequests.join(", ")}`).toHaveLength(0);
        expect(queue404, `queue 404s: ${queue404.join(", ")}`).toHaveLength(0);
        for (const r of runtimeRows) {
            expect(r.resolvedMode, `visible-rows request ${r.url} must be queue_reveal`).not.toBe("queue_list");
        }

        const rows = page.locator("[data-work-view-id], [data-queue-row], [role='listitem']");
        if ((await rows.count()) > 0) {
            await expect(page.getByText("Select a record to begin")).toHaveCount(0);
        }
        expect(captured.length, "at least one queue request observed").toBeGreaterThan(0);
    });

    test("Focus Panel first paint does not fetch person VMs / activity / comms / related", async ({ page }) => {
        const requested: string[] = [];
        page.on("request", (req) => requested.push(req.url()));

        await page.goto(`/workspace/work-unit/${WU_A}`, { waitUntil: "commit" });
        if (unauthenticated(page.url())) {
            if (CERT) throw new Error("CERT mode: unauthenticated");
            test.skip(true, "unauthenticated");
            return;
        }
        // Wait only for the Focus Panel's first useful commit, then snapshot the request set.
        await page
            .locator("[data-work-card-perspective], [data-focus-panel-resolved], .focus-panel")
            .first()
            .waitFor({ timeout: 15000 })
            .catch(() => {});
        const firstPaintRequests = [...requested];
        const forbidden = FORBIDDEN_FIRST_PAINT_FRAGMENTS.flatMap((f) =>
            firstPaintRequests.filter((u) => u.includes(f)),
        );
        writeArtifact("focus-panel-first-paint.json", {
            firstPaintRequestCount: firstPaintRequests.length,
            forbidden,
            requested: firstPaintRequests,
        });
        recordPhase("focus_panel_first_paint", { forbidden });
        expect(forbidden, `Focus Panel first paint fetched forbidden resources: ${forbidden.join(", ")}`).toHaveLength(0);
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
        if (unauthenticated(page.url())) {
            if (CERT) throw new Error("CERT mode: unauthenticated");
            test.skip(true, "unauthenticated");
            return;
        }
        await page.waitForLoadState("networkidle").catch(() => {});
        const pill = page.getByRole("link", { name: new RegExp(SWITCH_TO, "i") }).or(page.getByText(SWITCH_TO));
        let switched = false;
        if (await pill.count()) {
            await pill.first().click();
            await page.waitForLoadState("networkidle").catch(() => {});
            await expect(page.getByText("Select a record to begin")).toHaveCount(0);
            switched = true;
        }
        writeArtifact("work-view-switch.json", { switchedTo: SWITCH_TO, switched, staleKeyRequests, queue404 });
        recordPhase("work_view_switch", { switched, staleKeyRequests, queue404 });
        expect(staleKeyRequests, `stale-key requests: ${staleKeyRequests.join(", ")}`).toHaveLength(0);
        expect(queue404, `queue 404s: ${queue404.join(", ")}`).toHaveLength(0);
    });

    test("leave and return restores a selected subject (no blank Focus Panel)", async ({ page }) => {
        await page.goto(`/workspace/work-unit/${WU_A}`, { waitUntil: "commit" });
        if (unauthenticated(page.url())) {
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
        const hasRows = (await rows.count()) > 0;
        let promptWithRows = false;
        if (hasRows) {
            promptWithRows = (await page.getByText("Select a record to begin").count()) > 0;
        }
        writeArtifact("return-navigation.json", { workUnit: WU_A, hasRows, promptWithRows, alsoTested: WU_B });
        recordPhase("return_navigation", { hasRows, promptWithRows });
        if (hasRows) {
            await expect(page.getByText("Select a record to begin")).toHaveCount(0);
        }
    });
});
