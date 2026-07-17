import { expect, test } from "@playwright/test";

const storageState = process.env.PLAYWRIGHT_STORAGE_STATE?.trim();
if (storageState) test.use({ storageState });

test("Programs publication operator journey", async ({ page }) => {
    test.setTimeout(180_000);

    const consoleErrors: string[] = [];
    const failedRequests: string[] = [];
    const actions: Array<Record<string, unknown>> = [];
    const now = "2026-07-17T20:00:00.000Z";
    let status: "draft" | "validated" = "draft";
    let published = false;
    let assigned = false;
    let label = "Preschool";
    let description: string | null = null;

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
        locations: [{ id: "location-1", label: "Downtown" }],
        runs: assigned
            ? [{
                  id: "run-1",
                  publicationId: "publication-1",
                  status: "completed",
                  idempotencyKey: "programs:publication-1:location-1",
                  createdAt: now,
                  completedAt: now,
                  targets: [{
                      id: "target-1",
                      locationId: "location-1",
                      status: "delivered",
                      attemptCount: 1,
                      errorCode: null,
                      errorMessage: null,
                      result: { protectedLocalFields: ["is_active", "metadata"] },
                  }],
              }]
            : [],
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
        if (body.action === "assign") assigned = true;

        const response =
            body.action === "create_draft" ? { programId: "program-1" }
            : body.action === "preview" ? {
                  preview: [{
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
                  }],
              }
            : {};
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(response) });
    });

    await page.goto("/settings/commercial/programs", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("programs-publication-runtime")).toBeVisible();

    await page.getByRole("button", { name: "New Program" }).click();
    await page.getByTestId("program-create-name").fill("Preschool");
    await page.getByTestId("program-create-key").fill("preschool");
    await page.getByTestId("program-create-submit").click();
    await expect(page.getByTestId("program-object-header")).toContainText("Preschool");

    await page.getByTestId("program-draft-label").fill("Preschool Program");
    await page.getByLabel("Description · Location may override").fill("Organization-owned description");
    await page.getByTestId("program-save-draft").click();
    await page.getByTestId("program-validate-draft").click();
    await expect(page.getByTestId("program-publish")).toBeEnabled();
    await page.getByTestId("program-publish").click();
    await expect(page.getByText("Revision 1", { exact: true })).toBeVisible();

    await page.getByLabel("Downtown").check();
    await page.getByTestId("program-preview-delivery").click();
    await expect(page.getByTestId("program-delivery-preview")).toContainText(
        "Location availability remains protected.",
    );
    await page.getByTestId("program-assign-delivery").click();
    await expect(page.getByText("1 succeeded · 0 failed")).toBeVisible();

    expect(actions.map((action) => action.action)).toEqual([
        "create_draft",
        "update_draft",
        "validate_draft",
        "publish",
        "preview",
        "assign",
    ]);
    expect((actions.at(-1)?.targetIds as string[]) ?? []).toEqual(["location-1"]);
    expect(consoleErrors).toEqual([]);
    expect(failedRequests).toEqual([]);
});
