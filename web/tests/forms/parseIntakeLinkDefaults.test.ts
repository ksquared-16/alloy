import { describe, expect, it } from "vitest";
import {
    parseIntakeLinkDefaults,
    resolveIntakeOpportunitySource,
} from "@/lib/forms/intake/parseIntakeLinkDefaults";

const LOC = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const WU = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const DEPT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

describe("parseIntakeLinkDefaults Runtime Test 1A", () => {
    it("parses location, work unit, department, and status defaults", () => {
        expect(
            parseIntakeLinkDefaults({
                default_vertical_id: LOC,
                default_location_id: LOC,
                default_work_unit_id: WU,
                default_department_id: DEPT,
                default_opportunity_status_key: "new_inquiry",
            })
        ).toEqual({
            default_vertical_id: LOC,
            default_location_id: LOC,
            default_work_unit_id: WU,
            default_department_id: DEPT,
            default_opportunity_status_key: "new_inquiry",
        });
    });

    it("normalizes legacy new status key to new_inquiry", () => {
        expect(parseIntakeLinkDefaults({ default_opportunity_status_key: "new" }).default_opportunity_status_key).toBe(
            "new_inquiry"
        );
    });

    it("ignores invalid UUIDs", () => {
        expect(parseIntakeLinkDefaults({ default_location_id: "not-a-uuid" }).default_location_id).toBeNull();
    });
});

describe("resolveIntakeOpportunitySource", () => {
    it("prefers explicit intake_opportunity_source", () => {
        expect(resolveIntakeOpportunitySource({ intake_opportunity_source: "embed" })).toBe("embed");
        expect(resolveIntakeOpportunitySource({ intake_opportunity_source: "public_form", embed_mode: true })).toBe(
            "public_form"
        );
    });

    it("uses embed_mode when no explicit override", () => {
        expect(resolveIntakeOpportunitySource({ embed_mode: true })).toBe("embed");
        expect(resolveIntakeOpportunitySource({})).toBe("public_form");
    });
});
