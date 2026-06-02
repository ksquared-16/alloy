import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
    lifecycleActivationBaseActionByKey,
    lifecycleActivationBaseActions,
    lifecycleBaseActionByKey,
    type LifecycleBaseActionKey,
} from "@/lib/lifecycle/lifecycleStageBaseActions";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

const EXPECTED_DEFINITION_KEYS: Record<LifecycleBaseActionKey, string> = {
    create_record: "create_lead",
    add_person: "add_family_member",
    add_child: "add_child",
    send_form: "send_form",
    schedule_tour: "schedule_tour",
    change_status: "update_status_add_note",
    create_task: "create_task",
    quick_message: "quick_message",
};

describe("lifecycle action save and forms removal", () => {
    it("every builder dropdown base action resolves to a platform definition key", () => {
        const options = lifecycleActivationBaseActions("Lead");
        expect(options.length).toBeGreaterThan(0);
        for (const opt of options) {
            const resolved = lifecycleActivationBaseActionByKey(opt.key, "Lead");
            expect(resolved, `missing resolver for ${opt.key}`).not.toBeNull();
            expect(resolved!.definition_key).toBe(EXPECTED_DEFINITION_KEYS[opt.key]);
        }
    });

    it("create_record resolves for activation but not curated-only lookup", () => {
        expect(lifecycleActivationBaseActionByKey("create_record")?.definition_key).toBe("create_lead");
        expect(lifecycleBaseActionByKey("create_record")).toBeNull();
    });

    it("ensureOrgLifecycleActionDefinition uses activation base action resolver", () => {
        const ensure = read("lib/lifecycle/ensureOrgLifecycleActionDefinition.ts");
        expect(ensure).toContain("lifecycleActivationBaseActionByKey");
        expect(ensure).not.toContain("lifecycleBaseActionByKey");
    });

    it("stage-actions POST validates with activation resolver before ensure", () => {
        const route = read("app/api/admin/enrollment-process/stage-actions/route.ts");
        expect(route).toContain("lifecycleActivationBaseActionByKey");
        expect(route).toContain("ensureOrgLifecycleActionDefinition");
    });

    it("Save Action succeeds for Create Lead and Update Status base keys", () => {
        expect(lifecycleActivationBaseActionByKey("create_record")?.definition_key).toBe("create_lead");
        expect(lifecycleActivationBaseActionByKey("change_status")?.definition_key).toBe(
            "update_status_add_note"
        );
    });

    it("dropdown options are only activation base actions from bootstrap", () => {
        const bootstrap = read("lib/lifecycle/buildLifecycleStageBootstrap.ts");
        expect(bootstrap).toContain("lifecycleActivationBaseActions");
        const card = read("components/adminV2/settings/lifecycle/LifecycleBuilderActionsCard.tsx");
        expect(card).toContain("baseActions.map");
        expect(card).not.toContain("LIFECYCLE_BASE_ACTIONS");
    });

    it("shows success message and resets form after save in activation board", () => {
        const activation = read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx");
        expect(activation).toContain('setActionFeedback("Action added")');
        expect(activation).toContain('setBaseActionKey("")');
        expect(activation).toContain("refreshStageBootstrap");
        const card = read("components/adminV2/settings/lifecycle/LifecycleBuilderActionsCard.tsx");
        expect(card).toContain("lifecycle-action-save-success");
        expect(card).toContain("saveSuccess");
    });

    it("configured actions list refreshes from bootstrap after save", () => {
        const activation = read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx");
        expect(activation).toContain("setConfiguredActions(payload.actions)");
        expect(activation).toContain("refreshStageBootstrap");
    });

    it("Save Action button is in guided card footer not scrollable body", () => {
        const guided = read("components/adminV2/settings/lifecycle/LifecycleStageGuidedBoard.tsx");
        expect(guided).toContain('primaryLabel="Save Action"');
        expect(guided).not.toMatch(/stepId="actions"[\s\S]*hideFooter/);
        expect(guided).toContain("lifecycle-guided-save-${stepId}");
        const card = read("components/adminV2/settings/lifecycle/LifecycleBuilderActionsCard.tsx");
        expect(card).not.toContain("lifecycle-add-action-submit");
    });

    it("Forms card is not rendered on main Lifecycle Builder guided board", () => {
        const guided = read("components/adminV2/settings/lifecycle/LifecycleStageGuidedBoard.tsx");
        expect(guided).not.toContain('stepId="forms"');
        expect(guided).not.toContain("EnrollmentProcessFormsCoverageCard");
        expect(guided).not.toContain("Form Coverage");
    });

    it("actions card summary copy is on guided board", () => {
        const guided = read("components/adminV2/settings/lifecycle/LifecycleStageGuidedBoard.tsx");
        expect(guided).toContain("Actions operators can use from workspace surfaces.");
    });

    it("multiple actions can be added without advancing away from actions card", () => {
        const guided = read("components/adminV2/settings/lifecycle/LifecycleStageGuidedBoard.tsx");
        expect(guided).not.toContain("nextStepAfter(\"actions\")");
        const card = read("components/adminV2/settings/lifecycle/LifecycleBuilderActionsCard.tsx");
        expect(card).toContain("lifecycle-configured-actions");
    });
});
