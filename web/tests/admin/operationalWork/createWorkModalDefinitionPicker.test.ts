import { describe, expect, it } from "vitest";

import {
    buildCreateWorkModalDefinitionOptions,
    CREATE_WORK_AD_HOC_OPTION_KEY,
    resolveCreateWorkModalDefinitionPrefill,
} from "@/lib/admin/operationalWork/createWorkModalDefinitionPicker";

const userId = "22222222-2222-4222-8222-222222222222";
const ownerId = "55555555-5555-5555-8555-555555555555";

describe("createWorkModalDefinitionPicker", () => {
    it("shows ad hoc as the first option", () => {
        const options = buildCreateWorkModalDefinitionOptions({});
        expect(options[0]?.key).toBe(CREATE_WORK_AD_HOC_OPTION_KEY);
        expect(options[0]?.label).toBe("Ad hoc");
    });

    it("shows enabled catalog definitions", () => {
        const options = buildCreateWorkModalDefinitionOptions({});
        const keys = options.map((option) => option.key);
        expect(keys).toContain("contact_family");
        expect(keys).toContain("follow_up_after_tour");
        expect(keys).not.toContain("resolve_outstanding_balance");
    });

    it("filters definitions by lifecycle stage", () => {
        const tourOptions = buildCreateWorkModalDefinitionOptions({ resolveParams: { stageKey: "tour" } });
        const tourKeys = tourOptions.map((option) => option.key);
        expect(tourKeys).toContain("record_tour_outcome");
        expect(tourKeys).toContain("follow_up_after_tour");

        const intakeOptions = buildCreateWorkModalDefinitionOptions({ resolveParams: { stageKey: "intake" } });
        const intakeKeys = intakeOptions.map((option) => option.key);
        expect(intakeKeys).toContain("contact_family");
        expect(intakeKeys).not.toContain("record_tour_outcome");
    });

    it("always includes ad hoc even when stage filters catalog definitions", () => {
        const options = buildCreateWorkModalDefinitionOptions({ resolveParams: { stageKey: "enrollment" } });
        expect(options.some((option) => option.key === CREATE_WORK_AD_HOC_OPTION_KEY)).toBe(true);
    });

    it("prefills title, due, and assignee from selected definition", () => {
        const prefill = resolveCreateWorkModalDefinitionPrefill({
            workDefinitionKey: "contact_family",
            userId,
            recordOwnerUserId: ownerId,
            now: new Date("2027-01-01T12:00:00.000Z"),
        });
        expect(prefill.title).toBe("Contact family");
        expect(prefill.dueLocal).toMatch(/^2027-01-02T/);
        expect(prefill.assignedToUserId).toBe(ownerId);
    });

    it("uses ad hoc defaults when ad hoc is selected", () => {
        const prefill = resolveCreateWorkModalDefinitionPrefill({
            workDefinitionKey: CREATE_WORK_AD_HOC_OPTION_KEY,
            userId,
        });
        expect(prefill.title).toBe("");
        expect(prefill.assignedToUserId).toBe(userId);
    });

    it("operator override path uses request fields on submit (prefill is starting point only)", () => {
        const prefill = resolveCreateWorkModalDefinitionPrefill({
            workDefinitionKey: "contact_family",
            userId,
            recordOwnerUserId: ownerId,
        });
        const operatorTitle = "Custom outreach";
        const operatorDue = "2027-06-15T09:00";
        const operatorAssignee = "44444444-4444-4444-8444-444444444444";
        expect(operatorTitle).not.toBe(prefill.title);
        expect(operatorDue).not.toBe(prefill.dueLocal);
        expect(operatorAssignee).not.toBe(prefill.assignedToUserId);
    });
});

describe("buildOperationalTaskBody definition path", () => {
    it("includes work_definition_key for definition-backed creates", async () => {
        const { buildOperationalTaskBody } = await import("@/lib/agent/taskAssist/taskAssistV11OpportunityApi");
        const body = buildOperationalTaskBody({
            entityId: "33333333-3333-4333-8333-333333333333",
            title: "Contact family",
            dueAtIso: "2027-01-02T12:00:00.000Z",
            source: "manual",
            workDefinitionKey: "contact_family",
        });
        expect(body.work_definition_key).toBe("contact_family");
    });

    it("omits work_definition_key for ad hoc creates", async () => {
        const { buildOperationalTaskBody } = await import("@/lib/agent/taskAssist/taskAssistV11OpportunityApi");
        const body = buildOperationalTaskBody({
            entityId: "33333333-3333-4333-8333-333333333333",
            title: "Custom follow-up",
            dueAtIso: "2027-01-02T12:00:00.000Z",
            source: "manual",
        });
        expect(body.work_definition_key).toBeUndefined();
    });
});
