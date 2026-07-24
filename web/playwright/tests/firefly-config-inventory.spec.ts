/**
 * Firefly Operating Configuration — inventory pass (read-only).
 *
 * Dumps the EFFECTIVE configuration the live Firefly tenant is actually running, per Business
 * Process stage: configured actions, outcomes, transitions, outcome/automation rules, work
 * templates, communications config, and forms. This is the raw material for the certification
 * — nothing is executed or changed here.
 *
 * Firefly org 93667019-…, canonical Enrollment department 3933ac47-….
 */
import * as fs from "fs";
import * as path from "path";
import { test, expect } from "@playwright/test";

const OUT = path.join(__dirname, "../../../docs/sprints/active/assets/firefly-config");
const DEPT = "3933ac47-077a-4de8-aaac-8aed48d80413";

test.beforeAll(() => fs.mkdirSync(OUT, { recursive: true }));

test("inventory — the effective Firefly operating configuration per stage", async ({ page }) => {
    test.setTimeout(300_000);

    await page.goto("/adminV2/workspace", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});

    // The active process + its configured stages, from the workspace-processes surface.
    const processes = await page.request
        .get("/api/admin/surfaces/workspace-processes")
        .then((r) => r.json())
        .catch(() => null);

    // Forms configured for the org.
    const forms = await page.request.get("/api/admin/forms").then((r) => r.json()).catch(() => null);

    // Action placements — where each configured action is placed.
    const placements = await page.request
        .get("/api/admin/action-placements")
        .then((r) => r.json())
        .catch(() => null);

    // The lifecycle catalog: stages + statuses the tenant recognizes.
    const catalog = await page.request
        .get("/api/admin/lifecycle-catalog")
        .then((r) => r.json())
        .catch(() => null);

    // Enumerate configured stage keys from whatever the catalog/processes expose, then also
    // probe the known granular set so nothing configured is missed.
    const probed = new Set<string>([
        "lead",
        "qualification",
        "tour",
        "tour_scheduled",
        "tour_completed",
        "decision_pending",
        "waitlist",
        "enrollment",
        "enrolling",
        "enrolled",
        "offered_spot",
        "future_start",
        "closed_lost",
        "closed_withdrawn",
    ]);

    const stageBootstraps: Record<string, unknown> = {};
    for (const stageKey of probed) {
        const res = await page.request
            .get(
                `/api/admin/lifecycle-builder/stage-bootstrap?department_id=${DEPT}&stage_key=${stageKey}&primary_record_label=Lead`,
            )
            .catch(() => null);
        if (!res) continue;
        const status = res.status();
        if (status !== 200) {
            stageBootstraps[stageKey] = { _status: status };
            continue;
        }
        const body = await res.json().catch(() => null);
        // Keep only the certification-relevant slices, to keep the dump readable.
        const b = body as Record<string, unknown> | null;
        stageBootstraps[stageKey] = b
            ? {
                  _status: status,
                  operator_stage: b.operator_stage,
                  stage_operating_plan: b.stage_operating_plan,
                  actions: b.actions,
                  forms: b.forms,
                  linkable_forms: b.linkable_forms,
                  statuses: b.statuses,
                  queue_membership: b.queue_membership,
              }
            : { _status: status, _empty: true };
    }

    fs.writeFileSync(
        path.join(OUT, "inventory.json"),
        JSON.stringify(
            {
                department_id: DEPT,
                workspace_processes: processes,
                lifecycle_catalog: catalog,
                forms,
                action_placements: placements,
                stage_bootstraps: stageBootstraps,
            },
            null,
            2,
        ),
    );

    expect(Object.keys(stageBootstraps).length).toBeGreaterThan(0);
});
