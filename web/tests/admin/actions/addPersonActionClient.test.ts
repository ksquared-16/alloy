import { describe, expect, it } from "vitest";
import {
    isAddPersonActionKey,
    isAddPersonFormKey,
    narrowedAddPersonOpportunityId,
    resolveAddPersonActionKey,
} from "@/lib/admin/actions/addPersonActionClient";

describe("addPersonActionClient", () => {
    it("recognizes person action and form keys", () => {
        expect(isAddPersonActionKey("add_family_member")).toBe(true);
        expect(isAddPersonActionKey("add_related_person")).toBe(true);
        expect(isAddPersonActionKey("add_child")).toBe(false);
        expect(isAddPersonFormKey("add_family_member")).toBe(true);
        expect(isAddPersonFormKey("add_person")).toBe(true);
    });

    it("resolves registry action key from form", () => {
        expect(resolveAddPersonActionKey({ formKey: "add_related_person" })).toBe("add_related_person");
        expect(resolveAddPersonActionKey({ actionKey: "add_family_member" })).toBe("add_family_member");
    });

    it("narrows optional add-person opportunity id for drawer guards", () => {
        expect(narrowedAddPersonOpportunityId({ opportunity_id: "  opp-1  " })).toBe("opp-1");
        expect(narrowedAddPersonOpportunityId({ opportunity_id: null })).toBe("");
        expect(narrowedAddPersonOpportunityId({ customer_id: "cust-1" })).toBe("");
    });
});
