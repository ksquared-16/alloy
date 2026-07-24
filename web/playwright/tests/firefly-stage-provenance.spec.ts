/**
 * Firefly stage provenance — read-only capture of the RAW published stage list.
 *
 * Answers the one question the code cannot answer alone: are `qualification` / `decision`
 * actually in the tenant's published Business Process, or do they only pass runtime validity
 * because of a hardcoded built-in list?
 *
 * Non-invasive: only reads. Dumps the raw builder pipeline + per-stage bootstrap status.
 */
import * as fs from "fs";
import * as path from "path";
import { test, expect } from "@playwright/test";

const OUT = path.join(__dirname, "../../../docs/sprints/active/assets/firefly-config");
const DEPT = "3933ac47-077a-4de8-aaac-8aed48d80413";

test.beforeAll(() => fs.mkdirSync(OUT, { recursive: true }));

test("provenance — raw published stages + validity of qualification/decision", async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto("/adminV2/workspace", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});

    // The lead-stage bootstrap carries `pipeline` — the resolved list of configured stages
    // for the department — plus `statuses`. Capture the full untrimmed payload.
    const leadBootstrap = await page.request
        .get(
            `/api/admin/lifecycle-builder/stage-bootstrap?department_id=${DEPT}&stage_key=lead&primary_record_label=Lead`,
        )
        .then((r) => r.json())
        .catch(() => null);

    // Per-stage validity: does the runtime accept the identifier at all?
    const probe: Record<string, { status: number; operator_stage: unknown; has_plan: boolean }> = {};
    for (const stageKey of ["qualification", "decision", "tour", "waitlist"]) {
        const res = await page.request
            .get(
                `/api/admin/lifecycle-builder/stage-bootstrap?department_id=${DEPT}&stage_key=${stageKey}&primary_record_label=Lead`,
            )
            .catch(() => null);
        if (!res) {
            probe[stageKey] = { status: -1, operator_stage: null, has_plan: false };
            continue;
        }
        const status = res.status();
        const body = status === 200 ? await res.json().catch(() => null) : null;
        probe[stageKey] = {
            status,
            operator_stage: (body as { operator_stage?: unknown } | null)?.operator_stage ?? null,
            has_plan: !!(body as { stage_operating_plan?: unknown } | null)?.stage_operating_plan,
        };
    }

    const pipeline = (leadBootstrap as { pipeline?: unknown } | null)?.pipeline ?? null;
    const statuses = (leadBootstrap as { statuses?: unknown } | null)?.statuses ?? null;

    fs.writeFileSync(
        path.join(OUT, "provenance.json"),
        JSON.stringify(
            {
                department_id: DEPT,
                // The resolved configured-stage pipeline, verbatim.
                pipeline,
                statuses,
                stage_validity_probe: probe,
            },
            null,
            2,
        ),
    );

    expect(probe.qualification.status).toBeGreaterThan(0);
});
