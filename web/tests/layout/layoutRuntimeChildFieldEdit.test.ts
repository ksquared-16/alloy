import { describe, expect, it } from "vitest";
import {
    isLayoutRuntimeChildEditableRefKey,
    layoutRuntimeChildRowSaveContext,
} from "@/lib/layout/runtime/layoutRuntimeChildFieldEdit";

describe("layoutRuntimeChildFieldEdit", () => {
    it("supports durable child identity and inquiry OCM refKeys", () => {
        expect(isLayoutRuntimeChildEditableRefKey("child.first_name")).toBe(true);
        expect(isLayoutRuntimeChildEditableRefKey("child.date_of_birth")).toBe(true);
        expect(isLayoutRuntimeChildEditableRefKey("inquiry_child.desired_schedule_type")).toBe(true);
        expect(isLayoutRuntimeChildEditableRefKey("child.full_name")).toBe(false);
    });

    it("extracts save context from repeater row", () => {
        expect(
            layoutRuntimeChildRowSaveContext({
                id: "ocm-1",
                ocm_id: "ocm-1",
                customer_member_id: "cm-1",
                person_id: "person-1",
                "child.id": "person-1",
            }),
        ).toEqual({
            customerMemberId: "cm-1",
            personId: "person-1",
            ocmId: "ocm-1",
        });
    });
});
