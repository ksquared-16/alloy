/**
 * Canonical child grain mapping — fieldRegistryReferenceMatrix Phase 1 guards.
 */

import { describe, expect, it } from "vitest";
import {
    layoutRefKeyToCanonicalRef,
    ruleIdToCanonicalRef,
    systemFieldIdToCanonicalRef,
} from "@/lib/fields/fieldRegistryReferenceMatrix";

describe("fieldRegistryReferenceMatrix child grain (Phase 1)", () => {
    it("maps child profile layout refKeys to customer_member grain", () => {
        expect(layoutRefKeyToCanonicalRef("child.gender")).toEqual({
            entity_type: "customer_member",
            field_key: "gender",
        });
        expect(layoutRefKeyToCanonicalRef("child.allergies")).toEqual({
            entity_type: "customer_member",
            field_key: "allergies",
        });
        expect(layoutRefKeyToCanonicalRef("child.first_name")).toEqual({
            entity_type: "customer_member",
            field_key: "first_name",
        });
        expect(layoutRefKeyToCanonicalRef("child.date_of_birth")).toEqual({
            entity_type: "customer_member",
            field_key: "dob",
        });
        expect(layoutRefKeyToCanonicalRef("child.medical_notes")).toEqual({
            entity_type: "customer_member",
            field_key: "medical_notes",
        });
    });

    it("maps inquiry_child enrollment refKeys to inquiry_child grain", () => {
        expect(layoutRefKeyToCanonicalRef("inquiry_child.start_date")).toEqual({
            entity_type: "inquiry_child",
            field_key: "start_date",
        });
        expect(layoutRefKeyToCanonicalRef("inquiry_child.location_id")).toEqual({
            entity_type: "inquiry_child",
            field_key: "location_id",
        });
    });

    it("does not map computed child layout refKeys to inquiry_child", () => {
        expect(layoutRefKeyToCanonicalRef("child.full_name")).toBeNull();
        expect(layoutRefKeyToCanonicalRef("child.age")).toBeNull();
    });

    it("maps lifecycle child profile rule_ids to customer_member", () => {
        expect(ruleIdToCanonicalRef("child:first_name")).toEqual({
            entity_type: "customer_member",
            field_key: "first_name",
        });
        expect(ruleIdToCanonicalRef("child:last_name")).toEqual({
            entity_type: "customer_member",
            field_key: "last_name",
        });
        expect(ruleIdToCanonicalRef("child:date_of_birth")).toEqual({
            entity_type: "customer_member",
            field_key: "dob",
        });
    });

    it("maps lifecycle child enrollment rule_ids to inquiry_child", () => {
        expect(ruleIdToCanonicalRef("child:program_interest")).toEqual({
            entity_type: "inquiry_child",
            field_key: "program_category_id",
        });
        expect(ruleIdToCanonicalRef("child:start_date")).toEqual({
            entity_type: "inquiry_child",
            field_key: "start_date",
        });
    });

    it("maps Forms child identity fields to customer_member", () => {
        expect(systemFieldIdToCanonicalRef("child_first_name")).toEqual({
            entity_type: "customer_member",
            field_key: "first_name",
        });
        expect(systemFieldIdToCanonicalRef("child_date_of_birth")).toEqual({
            entity_type: "customer_member",
            field_key: "dob",
        });
    });
});
