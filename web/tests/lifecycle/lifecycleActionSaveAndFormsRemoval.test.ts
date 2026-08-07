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
    send_tour_invitation: "send_tour_invitation",
    waitlist_child: "waitlist_child",
    enroll_child: "enroll_child",
    close_lead: "close_lead",
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

    it("Save Action succeeds for Create Lead and domain-verb base keys", () => {
        expect(lifecycleActivationBaseActionByKey("create_record")?.definition_key).toBe("create_lead");
        expect(lifecycleActivationBaseActionByKey("waitlist_child")?.definition_key).toBe("waitlist_child");
        expect(lifecycleActivationBaseActionByKey("enroll_child")?.definition_key).toBe("enroll_child");
        expect(lifecycleActivationBaseActionByKey("close_lead")?.definition_key).toBe("close_lead");
    });

    it("dropdown options are only activation base actions from bootstrap", () => {
        const bootstrap = read("lib/lifecycle/buildLifecycleStageBootstrap.ts");
        expect(bootstrap).toContain("lifecycleActivationBaseActions");
        const card = read("components/adminV2/settings/lifecycle/LifecycleBuilderActionsCard.tsx");
        expect(card).toContain("baseActions.map");
        expect(card).not.toContain("LIFECYCLE_BASE_ACTIONS");
    });

    it("shows success message and resets form after save on actions card", () => {
        const card = read("components/adminV2/settings/lifecycle/LifecycleBuilderActionsCard.tsx");
        expect(card).toContain("lifecycle-action-save-success");
        expect(card).toContain("saveSuccess");
        expect(card).toContain("lifecycle-configured-actions");
    });

    it("configured actions list refreshes from bootstrap after save", () => {
        const card = read("components/adminV2/settings/lifecycle/LifecycleBuilderActionsCard.tsx");
        expect(card).toContain("lifecycle-configured-actions");
        expect(card).toContain("configuredActions");
        const activation = read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx");
        expect(activation).toContain("refreshStageBootstrap");
    });

    it("Save Action lives on activation board / actions card (not guided board body)", () => {
        const guided = read("components/adminV2/settings/lifecycle/LifecycleStageGuidedBoard.tsx");
        expect(guided).not.toContain('stepId="actions"');
        expect(guided).not.toContain('primaryLabel="Save Action"');
        const card = read("components/adminV2/settings/lifecycle/LifecycleBuilderActionsCard.tsx");
        expect(card).not.toContain("lifecycle-add-action-submit");
        expect(card).toContain("lifecycle-configured-actions");
    });

    it("Forms card is not rendered on main Lifecycle Builder guided board", () => {
        const guided = read("components/adminV2/settings/lifecycle/LifecycleStageGuidedBoard.tsx");
        expect(guided).not.toContain('stepId="forms"');
        expect(guided).not.toContain("EnrollmentProcessFormsCoverageCard");
        expect(guided).not.toContain("Form Coverage");
    });

    it("actions configuration remains on dedicated actions card", () => {
        const card = read("components/adminV2/settings/lifecycle/LifecycleBuilderActionsCard.tsx");
        expect(card).toContain("lifecycle-configured-actions");
        const guided = read("components/adminV2/settings/lifecycle/LifecycleStageGuidedBoard.tsx");
        expect(guided).not.toContain('stepId="actions"');
    });

    it("multiple actions can be added without advancing away from actions card", () => {
        const guided = read("components/adminV2/settings/lifecycle/LifecycleStageGuidedBoard.tsx");
        expect(guided).not.toContain("nextStepAfter(\"actions\")");
        const card = read("components/adminV2/settings/lifecycle/LifecycleBuilderActionsCard.tsx");
        expect(card).toContain("lifecycle-configured-actions");
    });
});
