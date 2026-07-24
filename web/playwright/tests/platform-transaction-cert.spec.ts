/**
 * Platform Transaction Contract — LIVE runtime certification against the running app.
 *
 * Certifies the ending the Product Owner doubts most: when the platform says an action failed,
 * did it really change nothing? This drives the real authenticated route with a real record and
 * captures the transaction envelope — correlation id, per-step stage/status/timing — rather
 * than a screenshot.
 *
 * The abort path is exercised on purpose because it is NON-DESTRUCTIVE: an unknown outcome key
 * fails validation, so nothing is written and the certified record is left exactly as found.
 *
 * Run directly (the toolkit's focused-spec does not inject env):
 *   cd web && PLAYWRIGHT_BASE_URL=http://127.0.0.1:3011 \
 *     PLAYWRIGHT_STORAGE_STATE=~/.local/state/alloy-dev/auth/slot1/storage-state.json \
 *     npx playwright test playwright/tests/platform-transaction-cert.spec.ts --workers=1
 */
import * as fs from "fs";
import * as path from "path";
import { test, expect } from "@playwright/test";

const OUT = path.join(__dirname, "../../../docs/sprints/active/assets/platform-transaction-cert");

type WorkSubject = {
    department_id: string;
    stage_key: string;
    work_id: string;
    opportunity_id: string;
};

test.beforeAll(() => fs.mkdirSync(OUT, { recursive: true }));

/**
 * The stage-work view model the drawer already loads carries the whole subject: the URL holds
 * the stage and department, the body holds the open work item and its CONFIGURED outcomes.
 * Harvesting from it means the certification runs against whatever the tenant really has —
 * no fixtures, no seeded data.
 */
const STAGE_WORK_URL = /\/api\/admin\/view-models\/drawer\/opportunity\/([^/]+)\/stage-work\?(.*)$/;

function harvestSubject(url: string, body: string): (WorkSubject & { outcomes: string[] }) | null {
    const match = STAGE_WORK_URL.exec(url);
    if (!match) return null;
    const params = new URLSearchParams(match[2]);
    const stageKey = params.get("stage_key");
    const departmentId = params.get("department_id");
    if (!stageKey || !departmentId) return null;

    let parsed: Record<string, unknown>;
    try {
        parsed = JSON.parse(body) as Record<string, unknown>;
    } catch {
        return null;
    }
    const runtime = parsed.stage_work_runtime as Record<string, unknown> | undefined;
    const primary = runtime?.primary as Record<string, unknown> | undefined;
    const workId = typeof primary?.work_id === "string" ? primary.work_id : null;
    if (!workId) return null;

    const outcomes = Array.isArray(primary?.outcomes)
        ? (primary.outcomes as Array<Record<string, unknown>>)
              .map((o) => (typeof o.outcome_key === "string" ? o.outcome_key : ""))
              .filter(Boolean)
        : [];

    return {
        opportunity_id: decodeURIComponent(match[1]),
        stage_key: stageKey,
        department_id: departmentId,
        work_id: workId,
        outcomes,
    };
}

test("platform transaction — a rejected action changes nothing and says so, with evidence", async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1440, height: 1000 });

    // Harvest a real work subject from the app's own payloads — no fixtures, no seeded data.
    const subjects: Array<WorkSubject & { outcomes: string[] }> = [];
    page.on("response", async (res) => {
        if (!STAGE_WORK_URL.test(res.url())) return;
        const body = await res.text().catch(() => "");
        const found = harvestSubject(res.url(), body);
        if (found) subjects.push(found);
    });

    await page.goto("/adminV2/workspace", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
    const entry = await page.$('a[href*="/work-unit/"]');
    if (entry) await entry.click({ timeout: 15_000 }).catch(() => {});
    await page.locator('[data-work-card="true"]').first().waitFor({ state: "visible", timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(3000);

    const subject = subjects[0];
    expect(subject, "no live stage-work subject found in app payloads").toBeTruthy();

    const correlationId = `cert-${Date.now()}`;
    const started = Date.now();
    const response = await page.request.post("/api/admin/lifecycle-builder/complete-stage-work", {
        headers: { "x-correlation-id": correlationId, "content-type": "application/json" },
        data: {
            department_id: subject.department_id,
            stage_key: subject.stage_key,
            work_id: subject.work_id,
            // Deliberately not a configured outcome: validation must abort BEFORE any write.
            outcome_key: "__certification_not_a_configured_outcome__",
            subject: { journey_segment: "family", opportunity_id: subject.opportunity_id },
        },
    });
    const wallMs = Date.now() - started;
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    const evidence = {
        request_correlation_id: correlationId,
        http_status: response.status(),
        response_correlation_header: response.headers()["x-correlation-id"] ?? null,
        wall_ms: wallMs,
        subject,
        body,
    };
    fs.writeFileSync(path.join(OUT, "abort-path.json"), JSON.stringify(evidence, null, 2));

    // ── the certified claims ────────────────────────────────────────────────────────────
    // A rejected action is a client error, not an integrity breach.
    expect(response.status()).toBe(400);
    // The correlation id the click carried is the one the platform answers with.
    expect(body.correlation_id).toBe(correlationId);
    expect(response.headers()["x-correlation-id"]).toBe(correlationId);
    // The operator's actual question, answered explicitly.
    expect(body.changed).toBe(false);
    expect(body.integrity_breach).toBeUndefined();

    const transaction = body.transaction as
        | { outcome: string; steps: Array<{ name: string; stage: string; status: string; duration_ms: number }> }
        | undefined;
    expect(transaction?.outcome).toBe("aborted");

    const steps = transaction?.steps ?? [];
    expect(steps[0]).toMatchObject({ name: "validate", stage: "validate", status: "failed" });
    // Nothing after validation so much as ran.
    expect(steps.slice(1).every((s) => s.status === "skipped")).toBe(true);
    // Timing is present on every step — this is the instrumented pipeline, not a guess.
    expect(steps.every((s) => typeof s.duration_ms === "number")).toBe(true);
});

test("platform transaction — a failure PAST validation compensates and reports nothing changed", async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1440, height: 1000 });

    const subjects: Array<WorkSubject & { outcomes: string[] }> = [];
    page.on("response", async (res) => {
        if (!STAGE_WORK_URL.test(res.url())) return;
        const body = await res.text().catch(() => "");
        const found = harvestSubject(res.url(), body);
        if (found) subjects.push(found);
    });

    await page.goto("/adminV2/workspace", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
    const entry = await page.$('a[href*="/work-unit/"]');
    if (entry) await entry.click({ timeout: 15_000 }).catch(() => {});
    await page.locator('[data-work-card="true"]').first().waitFor({ state: "visible", timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(3000);

    const subject = subjects.find((s) => s.outcomes.length > 0);
    expect(subject, "no live stage-work subject with configured outcomes").toBeTruthy();

    const correlationId = `cert-persist-${Date.now()}`;
    const response = await page.request.post("/api/admin/lifecycle-builder/complete-stage-work", {
        headers: { "x-correlation-id": correlationId, "content-type": "application/json" },
        data: {
            department_id: subject!.department_id,
            stage_key: subject!.stage_key,
            // A CONFIGURED outcome, so validation passes and the pipeline actually starts...
            outcome_key: subject!.outcomes[0],
            // ...against a work item that does not exist, so the persist step fails. Nothing
            // real is mutated, and the compensation pass is exercised end to end.
            work_id: "00000000-0000-4000-8000-000000000000",
            subject: { journey_segment: "family", opportunity_id: subject!.opportunity_id },
        },
    });
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    fs.writeFileSync(
        path.join(OUT, "persist-failure-path.json"),
        JSON.stringify({ request_correlation_id: correlationId, http_status: response.status(), subject, body }, null, 2),
    );

    const transaction = body.transaction as
        | { outcome: string; steps: Array<{ name: string; stage: string; status: string; duration_ms: number }> }
        | undefined;

    expect(response.status()).toBe(400);
    expect(body.changed).toBe(false);
    expect(body.integrity_breach).toBeUndefined();
    expect(transaction?.outcome).toBe("aborted");

    const byName = Object.fromEntries((transaction?.steps ?? []).map((s) => [s.name, s]));
    // The pipeline got past configuration and into persistence...
    expect(byName.validate?.status).toBe("ok");
    expect(byName.work_state?.status).toBe("failed");
    // ...and stopped there. The Business Process never ran, so nothing to advance or undo.
    expect(byName.apply_outcome_rules?.status).toBe("skipped");
});
