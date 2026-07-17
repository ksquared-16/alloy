import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const storageState = process.env.PLAYWRIGHT_STORAGE_STATE?.trim();
if (storageState) test.use({ storageState });

const EVIDENCE_DIR = resolve(
    process.env.HOME ?? "",
    ".local/state/alloy-dev/evidence/wt2-configuration-publication-distribution-v1/screenshots",
);

test("Programs publication operator journey", async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    mkdirSync(EVIDENCE_DIR, { recursive: true });

    const consoleErrors: string[] = [];
    const failedRequests: string[] = [];
    const actions: Array<Record<string, unknown>> = [];
    const now = "2026-07-17T20:00:00.000Z";
    let status: "draft" | "validated" = "draft";
    let published = false;
    let phase: "none" | "partial" | "retried" = "none";
    let label = "Preschool";
    let description: string | null = null;

    async function shot(name: string) {
        const file = `${name}.png`;
        await page.screenshot({
            path: resolve(EVIDENCE_DIR, file),
            fullPage: true,
            animations: "disabled",
        });
        await page.screenshot({
            path: testInfo.outputPath(file),
            fullPage: true,
            animations: "disabled",
        });
    }

    const program = () => ({
        id: "program-1",
        key: "preschool",
        lifecycleStatus: "active",
        draft: {
            id: "draft-1",
            programId: "program-1",
            programKey: "preschool",
            label,
            description,
            category: "Early learning",
            eligibility: {},
            audience: {},
            requiredResourceType: "Classroom",
            qualificationRequirements: [],
            defaultPolicyRefs: {},
            defaultCommercialPosture: {},
            status,
            baseRevisionId: published ? "revision-1" : null,
            validationErrors: [],
            updatedAt: now,
        },
        revisions: published
            ? [{
                  id: "revision-1",
                  programId: "program-1",
                  programKey: "preschool",
                  label,
                  description,
                  category: "Early learning",
                  eligibility: {},
                  audience: {},
                  requiredResourceType: "Classroom",
                  qualificationRequirements: [],
                  defaultPolicyRefs: {},
                  defaultCommercialPosture: {},
                  revisionNumber: 1,
                  payloadChecksum: "checksum-1",
                  publishedAt: now,
              }]
            : [],
        latestPublication: published
            ? {
                  id: "publication-1",
                  orgId: "org-1",
                  domainKey: "programs",
                  subjectId: "program-1",
                  revision: { id: "revision-1", number: 1, checksum: "checksum-1" },
                  publishedAt: now,
              }
            : null,
    });

    const snapshot = () => ({
        programs: actions.some((action) => action.action === "create_draft") ? [program()] : [],
        locations: [
            { id: "location-1", label: "Downtown" },
            { id: "location-2", label: "North Campus" },
        ],
        runs:
            phase === "none" ? []
            : phase === "partial" ? [{
                  id: "run-1",
                  publicationId: "publication-1",
                  status: "partial_failure",
                  idempotencyKey: "programs:publication-1:locations",
                  createdAt: now,
                  completedAt: now,
                  targets: [
                      {
                          id: "target-1",
                          locationId: "location-1",
                          status: "delivered",
                          attemptCount: 1,
                          errorCode: null,
                          errorMessage: null,
                          result: { protectedLocalFields: ["is_active", "metadata"] },
                      },
                      {
                          id: "target-2",
                          locationId: "location-2",
                          status: "failed",
                          attemptCount: 1,
                          errorCode: "program_delivery_failed",
                          errorMessage: "This Location is no longer eligible.",
                          result: {},
                      },
                  ],
              }]
            : [{
                  id: "run-1",
                  publicationId: "publication-1",
                  status: "completed",
                  idempotencyKey: "programs:publication-1:locations",
                  createdAt: now,
                  completedAt: now,
                  targets: [
                      {
                          id: "target-1",
                          locationId: "location-1",
                          status: "delivered",
                          attemptCount: 1,
                          errorCode: null,
                          errorMessage: null,
                          result: { protectedLocalFields: ["is_active", "metadata"] },
                      },
                      {
                          id: "target-2",
                          locationId: "location-2",
                          status: "delivered",
                          attemptCount: 2,
                          errorCode: null,
                          errorMessage: null,
                          result: { protectedLocalFields: ["is_active", "metadata"] },
                      },
                  ],
              }],
    });

    page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("requestfailed", (request) => failedRequests.push(request.url()));

    await page.route("**/api/admin/configuration/programs", async (route) => {
        const request = route.request();
        if (request.method() === "GET") {
            await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(snapshot()) });
            return;
        }

        const body = request.postDataJSON() as Record<string, unknown>;
        actions.push(body);
        if (body.action === "update_draft") {
            const patch = body.patch as Record<string, unknown>;
            label = String(patch.label);
            description = String(patch.description);
        }
        if (body.action === "validate_draft") status = "validated";
        if (body.action === "publish") published = true;
        if (body.action === "assign") phase = "partial";
        if (body.action === "retry") phase = "retried";

        const response =
            body.action === "create_draft" ? { programId: "program-1" }
            : body.action === "preview" ? {
                  preview: [
                      {
                          locationId: "location-1",
                          locationLabel: "Downtown",
                          eligible: true,
                          currentRevisionId: null,
                          nextRevisionId: "revision-1",
                          impacts: [{
                              fieldKey: "description",
                              kind: "create",
                              source: "organization",
                              message: "Inherit Organization description; Location availability remains protected.",
                          }],
                          conflicts: [],
                          requiredInputs: [],
                      },
                      {
                          locationId: "location-2",
                          locationLabel: "North Campus",
                          eligible: true,
                          currentRevisionId: null,
                          nextRevisionId: "revision-1",
                          impacts: [{
                              fieldKey: "label",
                              kind: "create",
                              source: "organization",
                              message: "Assign published Program identity; local offer state remains Location-owned.",
                          }],
                          conflicts: [],
                          requiredInputs: [],
                      },
                  ],
              }
            : {};
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(response) });
    });

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/settings/commercial/programs", { waitUntil: "domcontentloaded", timeout: 120_000 });
    await expect(page.getByTestId("programs-publication-runtime")).toBeVisible({ timeout: 60_000 });
    await shot("01-programs-landing");

    await page.getByRole("button", { name: "New Program" }).click();
    await page.getByTestId("program-create-name").fill("Preschool");
    await page.getByTestId("program-create-key").fill("preschool");
    await page.getByTestId("program-create-submit").click();
    await expect(page.getByTestId("program-object-header")).toContainText("Preschool");
    await expect(page.getByText("Organization draft")).toBeVisible();
    await shot("02-program-detail-draft");

    await page.getByTestId("program-draft-label").fill("Preschool Program");
    await page.getByLabel("Description · Location may override").fill("Organization-owned description");
    await page.getByTestId("program-save-draft").click();
    await page.getByTestId("program-validate-draft").click();
    await expect(page.getByTestId("program-publish")).toBeEnabled();
    await page.getByTestId("program-publish").click();
    await expect(page.getByText("Revision 1", { exact: true })).toBeVisible();
    await expect(page.getByText("Assign to Locations")).toBeVisible();
    await expect(
        page.getByTestId("programs-publication-runtime").getByText(/\bApply\b/i),
    ).toHaveCount(0);
    await shot("03-published-revision");

    await page.getByLabel("Downtown").check();
    await page.getByLabel("North Campus").check();
    await shot("04-location-assignment-selection");

    await page.getByTestId("program-preview-delivery").click();
    await expect(page.getByTestId("program-delivery-preview")).toContainText(
        "Location availability remains protected.",
    );
    await shot("05-impact-preview");

    await page.getByTestId("program-assign-delivery").click();
    await expect(page.getByText("partial failure")).toBeVisible();
    await expect(page.getByText("1 succeeded · 1 failed")).toBeVisible();
    await expect(page.getByText("North Campus: This Location is no longer eligible.")).toBeVisible();
    await shot("06-partial-failure");

    await page.getByRole("button", { name: "Retry failed" }).click();
    await expect(page.getByText("completed")).toBeVisible();
    await expect(page.getByText("2 succeeded · 0 failed")).toBeVisible();
    await shot("07-retry-success");
    await shot("08-history-audit");

    expect(actions.map((action) => action.action)).toEqual([
        "create_draft",
        "update_draft",
        "validate_draft",
        "publish",
        "preview",
        "assign",
        "retry",
    ]);
    expect((actions.find((action) => action.action === "assign")?.targetIds as string[]) ?? []).toEqual([
        "location-1",
        "location-2",
    ]);
    expect(consoleErrors).toEqual([]);
    expect(failedRequests).toEqual([]);
});
