import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildCreateLeadSuccess } from "@/lib/platform/commands/createLead/createLeadSuccess";
import type { ActionResultOk } from "@/lib/adminV2/actions/actionTypes";

const webRoot = resolve(__dirname, "../../../..");

function okResult(detail: Record<string, unknown>): ActionResultOk {
    return {
        ok: true,
        correlationId: "corr-1",
        result: {
            actionKey: "create_lead",
            entityType: "opportunity",
            entityId: "opp-created-1",
            affectedId: "opp-created-1",
            detail,
        },
    } as ActionResultOk;
}

describe("Create Lead Open Lead handoff descriptor", () => {
    it("includes created opportunity id and Work Unit target for Focus Panel routing", () => {
        const success = buildCreateLeadSuccess({
            result: okResult({
                opportunity_id: "opp-created-1",
                work_unit_id: "wu-lead-id",
                work_unit_key: "lifecycle_wu_lead",
                status_key: "new",
                stage_key: "lead",
            }),
            knownInputs: { first_name: "Ada", last_name: "Lovelace" },
        });

        expect(success.createdRecordId).toBe("opp-created-1");
        expect(success.workUnitId).toBe("wu-lead-id");
        expect(success.workUnitKey).toBe("lifecycle_wu_lead");
        // Canonical Focus Panel deep link: Work Unit slug + subject_id (path :recordId is retired).
        expect(success.focusPanelHref).toBe(
            "/workspace/work-unit/lifecycle-wu-lead?subject_id=opp-created-1",
        );
        expect(success.focusPanelHref).toContain("subject_id=opp-created-1");
        expect(success.focusPanelHref).not.toMatch(/drawer/i);
    });

    it("BOS Open Lead closes the session then routes via the success focusPanelHref", () => {
        const host = readFileSync(
            resolve(
                webRoot,
                "app/adminV2/components/aiCommandSurface/commandSession/BosCommandSessionHost.tsx",
            ),
            "utf8",
        );
        expect(host).toContain("data-bos-command-session-open-lead");
        expect(host).toContain("onOpenLead");
        expect(host).toContain("discardSession");
        expect(host).toContain("router.push");
        expect(host).toContain("resolveCreatedRecordProcessContextHref");
        expect(host).toContain('type="button"');
        expect(host).toContain("data-bos-command-session-open-lead");
        expect(host.indexOf("data-bos-command-session-open-lead")).toBeGreaterThan(
            host.indexOf('type="button"'),
        );
    });

    it("create_lead action detail carries work_unit_key into the success seam", () => {
        const execute = readFileSync(resolve(webRoot, "lib/admin/actions/executeAdminAction.ts"), "utf8");
        expect(execute).toContain("work_unit_key: created.work_unit_key");
        const entry = readFileSync(resolve(webRoot, "lib/admin/actions/entryLifecycleActions.ts"), "utf8");
        expect(entry).toContain("work_unit_key: workUnitKey");
        const handlers = readFileSync(
            resolve(webRoot, "lib/pos/processingIdentity/commands/handlers.ts"),
            "utf8",
        );
        expect(handlers).toContain("ensureStageEntryWorkForCreatedLead");
    });
});
