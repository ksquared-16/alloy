/**
 * Configured Stage Referential Integrity — authenticated certification (live).
 *
 * Non-destructive. Proves against the running Firefly tenant that the platform can no longer
 * expose or write a stage that is not in the configured Business Process:
 *
 *   1. bootstrap for `qualification` (not configured) → 400 stage_not_configured  (was 200)
 *   2. bootstrap for `decision` (configured) → 200                                (still works)
 *   3. publish of the still-dangling config → 422 dangling_stage_reference        (Fix 3)
 *   4. an invalid stage move on Wenc (Reached/Qualified → qualification) → 400, and Wenc's
 *      canonical truth is byte-identical before and after (no write, no activity, no next work)
 *
 * The invalid move is non-destructive precisely because the guard aborts it and the transaction
 * rolls back — which is the property being certified.
 *
 * Run:
 *   cd web && PLAYWRIGHT_BASE_URL=http://127.0.0.1:3011 \
 *     PLAYWRIGHT_STORAGE_STATE=~/.local/state/alloy-dev/auth/slot1/storage-state.json \
 *     npx playwright test playwright/tests/configured-stage-integrity-cert.spec.ts --workers=1
 */
import * as fs from "fs";
import * as path from "path";
import { test, expect, type Page } from "@playwright/test";

const OUT = path.join(__dirname, "../../../docs/sprints/active/assets/configured-stage-integrity");
const DEPT = "3933ac47-077a-4de8-aaac-8aed48d80413";
const OPP = "b13ecce9-74d4-442d-9891-7c88f587bc23"; // Wenc Family (lead)
const WORK = "130064f9-6f73-4b3e-aaa1-9faec2fdf3b0"; // Wenc contact_family work

test.beforeAll(() => fs.mkdirSync(OUT, { recursive: true }));

async function wencCanonicalTruth(page: Page) {
    const stageWork = await page.request
        .get(`/api/admin/view-models/drawer/opportunity/${OPP}/stage-work?stage_key=lead&department_id=${DEPT}&stage_label=Lead`)
        .then((r) => r.json())
        .catch(() => null);
    const activity = await page.request
        .get(`/api/admin/activity?entity_type=opportunities&entity_id=${OPP}&limit=50`)
        .then((r) => (r.ok() ? r.json() : null))
        .catch(() => null);
    const opp = await page.request
        .get(`/api/admin/opportunities/${OPP}`)
        .then(async (r) => (r.ok() ? r.json() : null))
        .catch(() => null);
    const primary = (stageWork as { stage_work_runtime?: { primary?: Record<string, unknown> } } | null)
        ?.stage_work_runtime?.primary;
    return {
        work_state: primary?.state ?? null,
        attempt_count: primary?.attempt_count ?? null,
        last_outcome: primary?.last_outcome ?? null,
        due_at: primary?.due_at ?? null,
        activity_count: Array.isArray((activity as { events?: unknown[] } | null)?.events)
            ? (activity as { events: unknown[] }).events.length
            : null,
        opp_stage_key:
            (opp as { opportunity?: { stage_key?: unknown } } | null)?.opportunity?.stage_key ??
            (opp as { stage_key?: unknown } | null)?.stage_key ??
            null,
    };
}

test("qualification is no longer served by bootstrap; decision still is", async ({ page }) => {
    await page.goto("/adminV2/workspace", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});

    const qual = await page.request.get(
        `/api/admin/lifecycle-builder/stage-bootstrap?department_id=${DEPT}&stage_key=qualification&primary_record_label=Lead`,
    );
    const qualBody = await qual.json().catch(() => ({}));

    const decision = await page.request.get(
        `/api/admin/lifecycle-builder/stage-bootstrap?department_id=${DEPT}&stage_key=decision&primary_record_label=Lead`,
    );

    fs.writeFileSync(
        path.join(OUT, "bootstrap-validity.json"),
        JSON.stringify({ qualification: { status: qual.status(), body: qualBody }, decision_status: decision.status() }, null, 2),
    );

    expect(qual.status()).toBe(400);
    expect((qualBody as { code?: string }).code).toBe("stage_not_configured");
    expect(decision.status()).toBe(200);
});

test("publish is rejected while the config still contains dangling references", async ({ page }) => {
    await page.goto("/adminV2/workspace", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});

    // Read the active process id, then trigger a no-op description save. The stored config still
    // has dangling refs (lead→qualification etc.), so publish-time validation must reject it.
    const builder = await page.request.get(`/api/admin/departments/${DEPT}/lifecycle-builder`).then((r) => r.json());
    const proc = (builder as { active_process?: { id?: string; description?: string } }).active_process;
    expect(proc?.id, "active process present").toBeTruthy();

    const res = await page.request.patch(`/api/admin/departments/${DEPT}/lifecycle-builder`, {
        headers: { "content-type": "application/json" },
        data: { action: "update_process_description", process_id: proc!.id, description: proc!.description ?? "Enrollment" },
    });
    const body = await res.json().catch(() => ({}));
    fs.writeFileSync(path.join(OUT, "publish-rejection.json"), JSON.stringify({ status: res.status(), body }, null, 2));

    expect(res.status()).toBe(422);
    expect((body as { code?: string }).code).toBe("dangling_stage_reference");
    // The violations name the dangling targets.
    const targets = ((body as { violations?: Array<{ invalid_target: string }> }).violations ?? []).map(
        (v) => v.invalid_target,
    );
    expect(targets).toContain("qualification");
});

test("an invalid stage move on Wenc changes nothing (guard + rollback)", async ({ page }) => {
    await page.goto("/adminV2/workspace", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});

    const before = await wencCanonicalTruth(page);

    // Reached/Qualified routes to move_to_stage: qualification, which is not configured. The guard
    // aborts the transaction; the work close is compensated.
    const correlationId = `cert-invalid-move-${Date.now()}`;
    const res = await page.request.post("/api/admin/lifecycle-builder/complete-stage-work", {
        headers: { "x-correlation-id": correlationId, "content-type": "application/json" },
        data: {
            department_id: DEPT,
            stage_key: "lead",
            work_id: WORK,
            outcome_key: "reached_qualified",
            subject: { journey_segment: "family", opportunity_id: OPP },
        },
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;

    // Let any (incorrect) downstream settle before re-reading.
    await page.waitForTimeout(4000);
    const after = await wencCanonicalTruth(page);

    fs.writeFileSync(
        path.join(OUT, "invalid-move-nothing-changed.json"),
        JSON.stringify({ correlation_id: correlationId, http_status: res.status(), response: body, before, after }, null, 2),
    );

    // Rejected as a configuration error; explicitly reports no change.
    expect(res.status()).toBe(400);
    expect(String(body.error ?? "")).toContain("not part of the configured Business Process");
    expect(body.changed).toBe(false);
    // Canonical truth is identical before and after — proven, not asserted from the response.
    expect(after).toEqual(before);
    expect(after.opp_stage_key).toBe(before.opp_stage_key);
    expect(after.activity_count).toBe(before.activity_count);
});

test("Qualification never appears in Wenc's What's Next / focused surface", async ({ page }) => {
    await page.goto("/adminV2/workspace", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
    const entry = await page.$('a[href*="/work-unit/"]');
    if (entry) await entry.click({ timeout: 15_000 }).catch(() => {});
    const card = page.locator('[data-work-card="true"]').first();
    await card.waitFor({ state: "visible", timeout: 30_000 });
    await page.waitForTimeout(3500);

    // Summary card.
    const summaryText = (await card.innerText().catch(() => "")) as string;
    await page.screenshot({ path: path.join(OUT, "whats-next-summary.png") });

    // Focused surface + any stage-transition / outcome controls.
    await card.locator('[data-work-action="open-focused"]').first().click({ timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(3000);
    const focusedText = (await page.locator('[data-work-focused-surface="true"], [data-current-work-surface="true"]').first().innerText().catch(() => "")) as string;
    // Also open the outcome picker (where a move-to-stage would surface a destination label).
    await page.locator('[data-work-action="record-outcome"]').first().click({ timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const outcomeText = (await page.locator('[data-work-focused-surface="true"], [data-current-work-surface="true"]').first().innerText().catch(() => "")) as string;
    await page.screenshot({ path: path.join(OUT, "whats-next-focused.png"), fullPage: true });

    const combined = `${summaryText}\n${focusedText}\n${outcomeText}`;
    fs.writeFileSync(path.join(OUT, "whats-next-text.json"), JSON.stringify({ summaryText, focusedText, outcomeText }, null, 2));

    // The operator-facing surface must not show the word "Qualification" (case-insensitive),
    // because it is not a stage in the configured process.
    expect(/qualification/i.test(combined)).toBe(false);
});
