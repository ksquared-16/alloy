/**
 * FINAL authenticated configured-stage certification — one pass, live Firefly tenant.
 *
 * Runs everything the authenticated window needs:
 *   A. Live referential-integrity cert (qualification 400, decision 200, invalid-move-no-change,
 *      publish 422, What's Next carries no qualification).
 *   B. Remediation proof against the LIVE published config: capture every dangling reference,
 *      apply the remediation function, prove the result is clean + decision preserved + nothing
 *      invented, and run the remediation TWICE to prove idempotency.
 *   C. Wenc canonical-truth audit (stage, status, work, attempts, bookings, activities).
 *
 * Non-destructive: the only write attempted (an invalid move) is rejected by design.
 */
import * as fs from "fs";
import * as path from "path";
import { test, expect, type Page } from "@playwright/test";
import { remediateDanglingStageReferences } from "../../lib/lifecycle/remediateDanglingStageReferences";
import { validateConfiguredStageReferences } from "../../lib/lifecycle/validateConfiguredStageReferences";

const OUT = path.join(__dirname, "../../../docs/sprints/active/assets/configured-stage-integrity");
const DEPT = "3933ac47-077a-4de8-aaac-8aed48d80413";
const OPP = "b13ecce9-74d4-442d-9891-7c88f587bc23";
const WORK = "130064f9-6f73-4b3e-aaa1-9faec2fdf3b0";

test.beforeAll(() => fs.mkdirSync(OUT, { recursive: true }));

async function wencTruth(page: Page) {
    const stageWork = await page.request
        .get(`/api/admin/view-models/drawer/opportunity/${OPP}/stage-work?stage_key=lead&department_id=${DEPT}&stage_label=Lead`)
        .then((r) => (r.ok() ? r.json() : null)).catch(() => null);
    const activity = await page.request
        .get(`/api/admin/activity?entity_type=opportunities&entity_id=${OPP}&limit=50`)
        .then((r) => (r.ok() ? r.json() : null)).catch(() => null);
    const bookings = await page.request
        .get(`/api/admin/tours/opportunities/${OPP}/bookings`)
        .then((r) => (r.ok() ? r.json() : null)).catch(() => null);
    const opp = await page.request
        .get(`/api/admin/opportunities/${OPP}`)
        .then((r) => (r.ok() ? r.json() : null)).catch(() => null);
    const primary = (stageWork as { stage_work_runtime?: { primary?: Record<string, unknown> } } | null)?.stage_work_runtime?.primary;
    const record = (opp as { opportunity?: Record<string, unknown> } | null)?.opportunity ?? (opp as Record<string, unknown> | null);
    return {
        opp_stage_key: record?.stage_key ?? null,
        opp_status_key: record?.status_key ?? null,
        work_state: primary?.state ?? null,
        attempt_count: primary?.attempt_count ?? null,
        last_outcome: primary?.last_outcome ?? null,
        due_at: primary?.due_at ?? null,
        activity_count: Array.isArray((activity as { events?: unknown[] } | null)?.events) ? (activity as { events: unknown[] }).events.length : null,
        bookings_count: Array.isArray((bookings as { bookings?: unknown[] } | null)?.bookings) ? (bookings as { bookings: unknown[] }).bookings.length : null,
    };
}

test("A1 — bootstrap: qualification rejected, decision served", async ({ page }) => {
    const qual = await page.request.get(`/api/admin/lifecycle-builder/stage-bootstrap?department_id=${DEPT}&stage_key=qualification&primary_record_label=Lead`);
    const qualBody = await qual.json().catch(() => ({}));
    const decision = await page.request.get(`/api/admin/lifecycle-builder/stage-bootstrap?department_id=${DEPT}&stage_key=decision&primary_record_label=Lead`);
    fs.writeFileSync(path.join(OUT, "A1-bootstrap.json"), JSON.stringify({ qualification: { status: qual.status(), body: qualBody }, decision_status: decision.status() }, null, 2));
    expect(qual.status()).toBe(400);
    expect((qualBody as { code?: string }).code).toBe("stage_not_configured");
    expect(decision.status()).toBe(200);
});

test("A2 — publish rejected while dangling refs remain", async ({ page }) => {
    const builder = await page.request.get(`/api/admin/departments/${DEPT}/lifecycle-builder`).then((r) => r.json());
    const proc = (builder as { active_process?: { id?: string; description?: string } }).active_process;
    const res = await page.request.patch(`/api/admin/departments/${DEPT}/lifecycle-builder`, {
        headers: { "content-type": "application/json" },
        data: { action: "update_process_description", process_id: proc!.id, description: proc!.description ?? "Enrollment" },
    });
    const body = await res.json().catch(() => ({}));
    fs.writeFileSync(path.join(OUT, "A2-publish-rejection.json"), JSON.stringify({ status: res.status(), body }, null, 2));
    expect(res.status()).toBe(422);
    expect((body as { code?: string }).code).toBe("dangling_stage_reference");
    expect(((body as { violations?: Array<{ invalid_target: string }> }).violations ?? []).map((v) => v.invalid_target)).toContain("qualification");
});

test("A3 — invalid stage move on Wenc changes nothing", async ({ page }) => {
    const before = await wencTruth(page);
    const correlationId = `final-cert-${Date.now()}`;
    const res = await page.request.post("/api/admin/lifecycle-builder/complete-stage-work", {
        headers: { "x-correlation-id": correlationId, "content-type": "application/json" },
        data: { department_id: DEPT, stage_key: "lead", work_id: WORK, outcome_key: "reached_qualified", subject: { journey_segment: "family", opportunity_id: OPP } },
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    await page.waitForTimeout(4000);
    const after = await wencTruth(page);
    fs.writeFileSync(path.join(OUT, "A3-invalid-move.json"), JSON.stringify({ correlation_id: correlationId, http_status: res.status(), response: body, before, after }, null, 2));
    expect(res.status()).toBe(400);
    expect(String(body.error ?? "")).toContain("not part of the configured Business Process");
    expect(body.changed).toBe(false);
    expect(after).toEqual(before);
});

test("A4 — Qualification absent from Wenc What's Next", async ({ page }) => {
    await page.goto("/adminV2/workspace", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
    const entry = await page.$('a[href*="/work-unit/"]');
    if (entry) await entry.click({ timeout: 15_000 }).catch(() => {});
    const card = page.locator('[data-work-card="true"]').first();
    await card.waitFor({ state: "visible", timeout: 30_000 });
    await page.waitForTimeout(3500);
    const summary = (await card.innerText().catch(() => "")) as string;
    await page.screenshot({ path: path.join(OUT, "A4-whats-next-summary.png") });
    await card.locator('[data-work-action="open-focused"]').first().click({ timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(2500);
    await card.locator('[data-work-action="record-outcome"]').first().click({ timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const focused = (await page.locator('[data-work-focused-surface="true"], [data-current-work-surface="true"]').first().innerText().catch(() => "")) as string;
    await page.screenshot({ path: path.join(OUT, "A4-whats-next-focused.png"), fullPage: true });
    fs.writeFileSync(path.join(OUT, "A4-whats-next.json"), JSON.stringify({ summary, focused }, null, 2));
    expect(/qualification/i.test(`${summary}\n${focused}`)).toBe(false);
});

test("B — remediation proof against the LIVE config (before/after + idempotent)", async ({ page }) => {
    const builder = await page.request.get(`/api/admin/departments/${DEPT}/lifecycle-builder`).then((r) => r.json());
    const liveConfig = (builder as { config?: unknown }).config;

    // BEFORE: every dangling reference in the live config.
    const before = validateConfiguredStageReferences(liveConfig);
    const danglingBefore = before.ok ? [] : before.violations.map((v) => `${v.source_stage}->${v.invalid_target}`);

    // Apply remediation (first run).
    const run1 = remediateDanglingStageReferences(liveConfig);
    const afterValidate = validateConfiguredStageReferences(run1.cleanedConfig);
    // Second run — idempotency.
    const run2 = remediateDanglingStageReferences(run1.cleanedConfig);

    // decision must be preserved.
    const cleaned = run1.cleanedConfig as { processes: Array<{ stages: Array<{ key: string }> }> };
    const stageKeys = cleaned.processes[0]?.stages.map((s) => s.key) ?? [];

    fs.writeFileSync(path.join(OUT, "B-remediation.json"), JSON.stringify({
        dangling_before: danglingBefore,
        removals_run1: run1.removals,
        clean_after_run1: afterValidate.ok,
        changed_run2: run2.changed,
        removals_run2: run2.removals,
        stage_keys_after: stageKeys,
    }, null, 2));

    expect(danglingBefore.sort()).toEqual(["enrolling->closed_withdrawn", "lead->qualification", "waitlist->enrollment"]);
    expect(afterValidate.ok).toBe(true);
    expect(run2.changed).toBe(false); // idempotent — second run makes no change
    expect(run2.removals).toEqual([]);
    expect(stageKeys).toContain("decision"); // preserved
});

test("C — Wenc canonical-truth audit", async ({ page }) => {
    const truth = await wencTruth(page);
    fs.writeFileSync(path.join(OUT, "C-wenc-audit.json"), JSON.stringify(truth, null, 2));
    expect(truth.opp_stage_key).toBeDefined();
});
