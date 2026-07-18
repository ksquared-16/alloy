import { expect, test } from "@playwright/test";
import { config as loadEnv } from "dotenv";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ensureAdminPlaywrightSession } from "../helpers/adminSessionAuth";
import {
    programPayloadChecksum,
    type ProgramDraft,
} from "@/lib/programs/publication/programPublicationModel";

loadEnv({ path: resolve(__dirname, "../../.env.local") });

const storageState = process.env.PLAYWRIGHT_STORAGE_STATE?.trim();
if (storageState) test.use({ storageState });

const EVIDENCE_DIR = resolve(
    process.env.CONFIGURATION_EVIDENCE_DIR?.trim()
        ?? resolve(__dirname, "../../../docs/audits/evidence/configuration-runtime-completion"),
);

test("Programs publication operator journey", async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    mkdirSync(EVIDENCE_DIR, { recursive: true });

    const consoleErrors: string[] = [];
    const failedRequests: string[] = [];
    const programResponseStatuses: number[] = [];
    const actions: Array<Record<string, unknown>> = [];
    const now = "2026-07-17T20:00:00.000Z";
    let status: "draft" | "validated" = "draft";
    let published = false;
    let phase: "none" | "partial" | "retried" = "none";
    let loadMode: "not_initialized" | "ready" = "not_initialized";
    let label = "Preschool";
    let description: string | null = null;

    async function shot(name: string) {
        const file = `${name}.png`;
        const image = await page.screenshot({
            fullPage: true,
            animations: "disabled",
        });
        const evidencePath = resolve(EVIDENCE_DIR, file);
        writeFileSync(evidencePath, image);
        writeFileSync(testInfo.outputPath(file), image);
        expect(existsSync(evidencePath)).toBe(true);
    }

    const program = () => {
        const draft: ProgramDraft = {
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
        };
        const checksum = programPayloadChecksum(draft);
        const publication = {
            id: "publication-1",
            orgId: "org-1",
            domainKey: "programs",
            subjectId: "program-1",
            revision: { id: "revision-1", number: 1, checksum },
            publishedAt: now,
        };
        return {
        id: "program-1",
        key: "preschool",
        lifecycleStatus: "active",
        draft,
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
                  payloadChecksum: checksum,
                  publishedAt: now,
              }]
            : [],
        publications: published ? [publication] : [],
        latestPublication: published ? publication : null,
    };
    };

    const snapshot = () => ({
        capabilities: { canManage: true },
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
        attempts:
            phase === "none"
                ? []
                : [
                      {
                          id: "attempt-1-success",
                          runId: "run-1",
                          targetId: "target-1",
                          locationId: "location-1",
                          attemptNumber: 1,
                          status: "delivered",
                          errorCode: null,
                          errorMessage: null,
                          attemptedAt: now,
                      },
                      {
                          id: "attempt-1-failure",
                          runId: "run-1",
                          targetId: "target-2",
                          locationId: "location-2",
                          attemptNumber: 1,
                          status: "failed",
                          errorCode: "program_delivery_failed",
                          errorMessage: "This Location is no longer eligible.",
                          attemptedAt: now,
                      },
                      ...(phase === "retried" ? [{
                      id: "attempt-2",
                      runId: "run-1",
                      targetId: "target-2",
                      locationId: "location-2",
                      attemptNumber: 2,
                      status: "delivered",
                      errorCode: null,
                      errorMessage: null,
                      attemptedAt: now,
                  }] : []),
                  ],
        assignments:
            phase === "none"
                ? []
                : [
                      {
                          id: "assignment-1",
                          programId: "program-1",
                          locationId: "location-1",
                          locationLabel: "Downtown",
                          publicationId: "publication-1",
                          revisionId: "revision-1",
                          revisionNumber: 1,
                          consumedAt: now,
                          deliveredByRunId: "run-1",
                      },
                      ...(phase === "retried"
                          ? [{
                                id: "assignment-2",
                                programId: "program-1",
                                locationId: "location-2",
                                locationLabel: "North Campus",
                                publicationId: "publication-1",
                                revisionId: "revision-1",
                                revisionNumber: 1,
                                consumedAt: now,
                                deliveredByRunId: "run-1",
                            }]
                          : []),
                  ],
    });

    page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("requestfailed", (request) => failedRequests.push(request.url()));
    page.on("response", (response) => {
        if (response.url().includes("/api/admin/configuration/programs")) {
            programResponseStatuses.push(response.status());
        }
    });

    await page.route("**/api/admin/configuration/programs", async (route) => {
        const request = route.request();
        if (request.method() === "GET") {
            if (loadMode === "not_initialized") {
                await route.fulfill({
                    status: 503,
                    contentType: "application/json",
                    body: JSON.stringify({
                        error: {
                            code: "not_initialized",
                            title: "Programs setup is not complete",
                            message: "This Configuration area has not been initialized in this environment.",
                            nextStep: "An administrator needs to complete platform setup before this configuration can be used.",
                            reference: "cfg-browser",
                        },
                    }),
                });
                return;
            }
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
    if (!storageState) await ensureAdminPlaywrightSession(page);

    await page.goto("/organization", { waitUntil: "domcontentloaded", timeout: 120_000 });
    await expect(page.getByTestId("organization-configuration-page")).toBeVisible({ timeout: 60_000 });
    await shot("00-organization-landing");

    await page.goto("/organization/programs", { waitUntil: "domcontentloaded", timeout: 120_000 });
    await expect(page.getByTestId("programs-publication-runtime")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("programs-empty-state-issue")).toContainText("Programs setup is not complete");
    await expect(page.getByTestId("programs-publication-runtime")).not.toContainText(/schema cache|public\.programs/i);
    await shot("01a-programs-not-initialized");

    loadMode = "ready";
    await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
    await expect(page.getByTestId("programs-publication-runtime")).toBeVisible({ timeout: 60_000 });
    await expect(page).toHaveURL(/\/organization\/programs/);
    await expect(page.getByTestId("programs-publication-runtime")).toContainText("Organization");
    await expect(page.getByTestId("programs-publication-runtime")).not.toContainText("Commercial");
    await expect(page.getByTestId("programs-publication-runtime")).not.toContainText("Settings");
    await shot("01-programs-landing");

    await page.goto("/settings/commercial/programs", { waitUntil: "domcontentloaded", timeout: 120_000 });
    await expect(page).toHaveURL(/\/organization\/programs/);
    await expect(page.getByTestId("programs-publication-runtime")).toBeVisible({ timeout: 60_000 });
    await shot("01b-legacy-redirect");

    await page.getByTestId("programs-collection-add").click();
    await page.getByTestId("program-create-name").fill("Preschool");
    await page.getByTestId("program-create-key").fill("preschool");
    await page.getByTestId("program-create-submit").click();
    await expect(page.getByTestId("program-object-header")).toContainText("Preschool");
    await expect(page.getByTestId("program-draft-runtime")).toBeVisible();
    await expect(page.getByText("Working draft", { exact: true }).first()).toBeVisible();
    await shot("02-program-detail-draft");

    await page.getByTestId("program-draft-label").fill("Preschool Program");
    await page.getByLabel("Description · Location may override").fill("Organization-owned description");
    await page.getByTestId("program-save-draft").click();
    await page.getByTestId("program-validate-draft").click();
    await expect(page.getByTestId("program-publish")).toBeEnabled();
    await page.getByTestId("program-publish").click();
    await expect(page.getByText("Revision 1", { exact: true })).toBeVisible();
    await expect(page.getByTestId("program-overview")).toBeVisible();
    await expect(
        page.getByTestId("programs-publication-runtime").getByText(/\bApply\b/i),
    ).toHaveCount(0);
    await shot("03-published-revision");

    await page.getByTestId("program-detail-runtime-tab-assignment").click();
    await expect(page.getByTestId("program-assignment-runtime")).toBeVisible();
    await page.getByLabel("Downtown").check();
    await page.getByLabel("North Campus").check();
    await shot("04-location-assignment-selection");

    await page.getByTestId("program-preview-delivery").click();
    await expect(page.getByTestId("program-delivery-preview")).toContainText(
        "Location availability remains protected.",
    );
    await shot("05-impact-preview");

    await page.getByTestId("program-assign-delivery").click();
    await expect(page.getByTestId("program-overview")).toBeVisible();
    await expect(page.getByTestId("program-overview")).toContainText(/failed assignment/i);
    await shot("06-attention-overview");
    await page.getByTestId("program-detail-runtime-tab-distribution").click();
    await expect(page.getByText("partial failure")).toBeVisible();
    await expect(page.getByText("1 succeeded · 1 failed")).toBeVisible();
    await expect(page.getByText("North Campus: This Location is no longer eligible.")).toBeVisible();
    await shot("06-partial-failure");

    await page.getByRole("button", { name: "Retry failed" }).click();
    await expect(page.getByText("completed")).toBeVisible();
    await expect(page.getByText("2 succeeded · 0 failed")).toBeVisible();
    await shot("07-retry-success");
    await page.getByTestId("program-detail-runtime-tab-history").click();
    await expect(page.getByTestId("program-history-runtime")).toBeVisible();
    await expect(page.getByTestId("program-history-runtime")).toContainText("Assignment attempt failed");
    await expect(page.getByTestId("program-history-runtime")).toContainText("Assignment retry completed");
    await shot("08-history-audit");

    await page.getByTestId("program-detail-runtime-tab-overview").click();
    await page.setViewportSize({ width: 1024, height: 768 });
    await expect(page.getByTestId("programs-collection-mobile")).toBeVisible();
    await shot("09-responsive-laptop");
    await page.setViewportSize({ width: 768, height: 900 });
    await expect(page.getByTestId("programs-collection-mobile")).toBeVisible();
    expect(
        await page.getByTestId("programs-publication-runtime").evaluate(
            (element) => element.scrollWidth <= element.clientWidth + 1,
        ),
    ).toBe(true);
    await shot("10-responsive-narrow");

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
    const unexpectedConsoleErrors = consoleErrors.filter(
        (message) =>
            !message.includes("A tree hydrated but some attributes of the server rendered HTML didn't match")
            && !message.includes("Failed to load resource: the server responded with a status of 503")
            && !(message.includes("TypeError: Failed to fetch") && message.includes("supabase_auth-js")),
    );
    expect(unexpectedConsoleErrors).toEqual([]);
    // Shell chrome and aborted RSC navigations are ambient; only Programs API failures count.
    expect(
        failedRequests.filter((url) => url.includes("/api/admin/configuration/programs")),
    ).toEqual([]);
    expect(programResponseStatuses).toContain(503);
    expect(programResponseStatuses.filter((statusCode) => statusCode >= 400 && statusCode !== 503)).toEqual([]);
});

test("Live Programs load presents operator-safe availability", async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    if (!storageState) await ensureAdminPlaywrightSession(page);

    await page.goto("/organization/programs", { waitUntil: "domcontentloaded", timeout: 120_000 });
    await expect(page.getByTestId("programs-publication-runtime")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("programs-publication-runtime")).not.toContainText(
        /schema cache|public\.programs|PGRST|commercial_programs|commercial_offerings/i,
    );
    const issue = page.getByTestId("programs-empty-state-issue");
    if (await issue.isVisible()) {
        await expect(issue).toContainText(/setup is not complete|needs a platform update|temporarily unavailable/i);
    }

    const image = await page.screenshot({ fullPage: true, animations: "disabled" });
    writeFileSync(resolve(EVIDENCE_DIR, "01c-live-programs-load.png"), image);
    writeFileSync(testInfo.outputPath("01c-live-programs-load.png"), image);
});
