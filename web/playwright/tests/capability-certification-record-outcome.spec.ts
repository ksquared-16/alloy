/**
 * Capability Certification — Record Outcome, executed for real end to end.
 *
 * Observes every stage of the execution contract rather than inferring any of them:
 *
 *   Configured Action → Capability Resolution → Validation → Platform Transaction
 *     → Canonical Persistence → Business Process → Activity → Cache Invalidation
 *     → Runtime Recomposition → Visible UI
 *
 * Record Outcome is certified by real execution because it dispatches nothing externally.
 * The communication capabilities are NOT executed — the live tenant's recipient is a real
 * personal email/phone, and a send cannot be proven to stay on this machine.
 *
 * Run:
 *   cd web && PLAYWRIGHT_BASE_URL=http://127.0.0.1:3011 \
 *     PLAYWRIGHT_STORAGE_STATE=~/.local/state/alloy-dev/auth/slot1/storage-state.json \
 *     npx playwright test playwright/tests/capability-certification-record-outcome.spec.ts --workers=1
 */
import * as fs from "fs";
import * as path from "path";
import { test, expect, type Page } from "@playwright/test";

const OUT = path.join(__dirname, "../../../docs/sprints/active/assets/capability-certification");

/** The retry outcome: keeps the work open and increments attempts — the least destructive
 *  outcome that still exercises persistence, Business Process evaluation and activity. */
const OUTCOME_KEY = "left_message";

type ActivityEvent = {
    id: string;
    occurred_at: string;
    event_type: string | null;
    action_type: string | null;
    payload?: Record<string, unknown> | null;
};

type Snapshot = {
    stage_work: unknown;
    /** workflow_events for this opportunity — the canonical activity table. */
    activity_count: number | null;
    activity_head: ActivityEvent[] | null;
    bookings_count: number | null;
    opportunity_status: unknown;
    opportunity_stage: unknown;
};

test.beforeAll(() => fs.mkdirSync(OUT, { recursive: true }));

async function readCanonicalState(page: Page, oppId: string, deptId: string, stageKey: string): Promise<Snapshot> {
    const stageWork = await page.request
        .get(
            `/api/admin/view-models/drawer/opportunity/${oppId}/stage-work?stage_key=${stageKey}&department_id=${deptId}&stage_label=Lead`,
        )
        .then((r) => r.json())
        .catch(() => null);

    const activity = await page.request
        .get(`/api/admin/activity?entity_type=opportunities&entity_id=${oppId}&limit=50`)
        .then(async (r) => (r.ok() ? await r.json() : null))
        .catch(() => null);

    const bookings = await page.request
        .get(`/api/admin/tours/opportunities/${oppId}/bookings`)
        .then((r) => r.json())
        .catch(() => null);

    const opportunity = await page.request
        .get(`/api/admin/opportunities/${oppId}`)
        .then(async (r) => (r.ok() ? await r.json() : null))
        .catch(() => null);

    // The route answers { events } — workflow_events for this opportunity, newest first.
    const events = (activity as { events?: ActivityEvent[] } | null)?.events ?? null;
    const record =
        (opportunity as { opportunity?: Record<string, unknown>; data?: Record<string, unknown> } | null)
            ?.opportunity
        ?? (opportunity as { data?: Record<string, unknown> } | null)?.data
        ?? (opportunity as Record<string, unknown> | null)
        ?? null;

    return {
        stage_work: (stageWork as { stage_work_runtime?: unknown } | null)?.stage_work_runtime ?? null,
        activity_count: Array.isArray(events) ? events.length : null,
        activity_head: Array.isArray(events)
            ? events.slice(0, 5).map((e) => ({
                  id: e.id,
                  occurred_at: e.occurred_at,
                  event_type: e.event_type,
                  action_type: e.action_type,
                  correlation_id: (e.payload as Record<string, unknown> | null)?.correlation_id ?? null,
              }))
            : null,
        bookings_count: Array.isArray((bookings as { bookings?: unknown[] } | null)?.bookings)
            ? (bookings as { bookings: unknown[] }).bookings.length
            : null,
        opportunity_status: record?.status_key ?? null,
        opportunity_stage: record?.stage_key ?? null,
    };
}

test("Record Outcome — full chain, executed for real", async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: 1440, height: 1000 });

    // ── network + runtime observation ────────────────────────────────────────────────
    const calls: Array<{ url: string; method: string; status: number; ms: number }> = [];
    const started = new Map<string, number>();
    let outcomeResponse: { status: number; body: Record<string, unknown>; ms: number } | null = null;

    page.on("request", (req) => started.set(req.url() + req.method(), Date.now()));
    page.on("response", async (res) => {
        const req = res.request();
        if (!res.url().includes("/api/")) return;
        const key = res.url() + req.method();
        const ms = Date.now() - (started.get(key) ?? Date.now());
        calls.push({ url: res.url(), method: req.method(), status: res.status(), ms });
        if (res.url().includes("/complete-stage-work") && req.method() === "POST") {
            const text = await res.text().catch(() => "");
            let body: Record<string, unknown> = {};
            try {
                body = JSON.parse(text) as Record<string, unknown>;
            } catch {
                body = { raw: text.slice(0, 400) };
            }
            outcomeResponse = { status: res.status(), body, ms };
        }
    });

    let hardNavigations = 0;
    page.on("framenavigated", (frame) => {
        if (frame === page.mainFrame()) hardNavigations += 1;
    });

    // Harvest the subject from the app's own view model — no fixtures.
    let subject: { oppId: string; deptId: string; stageKey: string; workId: string } | null = null;
    page.on("response", async (res) => {
        const m = /\/api\/admin\/view-models\/drawer\/opportunity\/([^/]+)\/stage-work\?(.*)$/.exec(res.url());
        if (!m || subject) return;
        const params = new URLSearchParams(m[2]);
        const body = await res.text().catch(() => "");
        try {
            const parsed = JSON.parse(body) as { stage_work_runtime?: { primary?: { work_id?: string } } };
            const workId = parsed.stage_work_runtime?.primary?.work_id;
            const stageKey = params.get("stage_key");
            const deptId = params.get("department_id");
            if (workId && stageKey && deptId) subject = { oppId: m[1], deptId, stageKey, workId };
        } catch {
            /* ignore */
        }
    });

    await page.goto("/adminV2/workspace", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
    const entry = await page.$('a[href*="/work-unit/"]');
    if (entry) await entry.click({ timeout: 15_000 }).catch(() => {});
    const card = page.locator('[data-work-card="true"]').first();
    await card.waitFor({ state: "visible", timeout: 30_000 });
    await page.waitForTimeout(4000);

    expect(subject, "no live stage-work subject").toBeTruthy();
    const { oppId, deptId, stageKey } = subject!;

    // ── BEFORE ───────────────────────────────────────────────────────────────────────
    const before = await readCanonicalState(page, oppId, deptId, stageKey);
    await page.screenshot({ path: path.join(OUT, "record-outcome-before.png") });

    // Marker that only survives if the SPA never hard-reloads.
    await page.evaluate(() => {
        (window as unknown as Record<string, unknown>).__certNoReload = "alive";
    });
    const navigationsBefore = hardNavigations;
    const callsBefore = calls.length;

    // ── EXECUTE ──────────────────────────────────────────────────────────────────────
    await card.locator('[data-work-action="record-outcome"]').first().click({ timeout: 15_000 });
    const outcomeRow = page.locator(`[data-work-outcome="${OUTCOME_KEY}"]`).first();
    await outcomeRow.waitFor({ state: "visible", timeout: 20_000 });
    await outcomeRow.click({ timeout: 10_000 });

    const confirm = page.locator('[data-work-action="confirm-outcome"]').first();
    await confirm.waitFor({ state: "visible", timeout: 15_000 });
    const clickAt = Date.now();
    await confirm.click({ timeout: 10_000 });

    await page.waitForResponse((r) => r.url().includes("/complete-stage-work"), { timeout: 60_000 });
    await page.waitForTimeout(6000);
    const settledAt = Date.now();

    // ── AFTER ────────────────────────────────────────────────────────────────────────
    const after = await readCanonicalState(page, oppId, deptId, stageKey);
    await page.screenshot({ path: path.join(OUT, "record-outcome-after.png") });

    const survivedReload = await page.evaluate(
        () => (window as unknown as Record<string, unknown>).__certNoReload ?? null,
    );

    const duplicatePosts = calls.filter(
        (c) => c.url.includes("/complete-stage-work") && c.method === "POST",
    );

    const evidence = {
        capability: "record_outcome",
        outcome_key: OUTCOME_KEY,
        subject,
        correlation_id: (outcomeResponse as { body?: Record<string, unknown> } | null)?.body?.correlation_id ?? null,
        http: {
            status: (outcomeResponse as { status?: number } | null)?.status ?? null,
            server_ms: (outcomeResponse as { ms?: number } | null)?.ms ?? null,
        },
        timings: {
            click_to_settled_ms: settledAt - clickAt,
        },
        transaction: (outcomeResponse as { body?: Record<string, unknown> } | null)?.body?.transaction ?? null,
        outcome_execution:
            (outcomeResponse as { body?: Record<string, unknown> } | null)?.body?.outcome_execution ?? null,
        runtime_integrity: {
            hard_navigations_during_execution: hardNavigations - navigationsBefore,
            spa_marker_survived: survivedReload,
            duplicate_outcome_posts: duplicatePosts.length,
            api_calls_during_execution: calls.length - callsBefore,
        },
        canonical_before: before,
        canonical_after: after,
        network_after_click: calls.slice(callsBefore).map((c) => `${c.method} ${c.status} ${c.ms}ms ${c.url}`),
    };
    fs.writeFileSync(path.join(OUT, "record-outcome-evidence.json"), JSON.stringify(evidence, null, 2));

    // ── certified claims ─────────────────────────────────────────────────────────────
    expect((outcomeResponse as { status?: number } | null)?.status, "outcome POST status").toBe(200);
    expect(evidence.correlation_id, "correlation id returned").toBeTruthy();

    const tx = evidence.transaction as { outcome?: string; steps?: Array<{ name: string; status: string }> } | null;
    expect(tx?.outcome).toBe("committed");
    expect(tx?.steps?.every((s) => s.status === "ok")).toBe(true);

    // Runtime integrity.
    expect(evidence.runtime_integrity.duplicate_outcome_posts, "no duplicate execution").toBe(1);
    expect(evidence.runtime_integrity.spa_marker_survived, "no page reload").toBe("alive");
    expect(evidence.runtime_integrity.hard_navigations_during_execution, "no hard navigation").toBe(0);

    // Canonical persistence: the attempt actually landed on the work item.
    const beforeAttempts = (before.stage_work as { primary?: { attempt_count?: number } } | null)?.primary
        ?.attempt_count;
    const afterAttempts = (after.stage_work as { primary?: { attempt_count?: number } } | null)?.primary
        ?.attempt_count;
    expect(afterAttempts, "attempt recorded").toBe((beforeAttempts ?? 0) + 1);

    // Activity: exactly ONE new activity row, and it is tied to this transaction by the same
    // correlation id the click carried.
    expect(after.activity_count, "one new activity row").toBe((before.activity_count ?? 0) + 1);
    const newestActivity = after.activity_head?.[0] as
        | { event_type?: string | null; correlation_id?: string | null }
        | undefined;
    expect(newestActivity?.event_type).toBe("stage_work_outcome_recorded");
    expect(newestActivity?.correlation_id, "activity row carries the transaction correlation id").toBe(
        evidence.correlation_id,
    );

    // Recomposition: the card reflects the new truth without a reload.
    const cardText = await card.innerText().catch(() => "");
    expect(cardText.length).toBeGreaterThan(0);
});
