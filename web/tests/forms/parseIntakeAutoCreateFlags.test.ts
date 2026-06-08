import { describe, expect, it } from "vitest";
import { parseIntakeAutoCreateFlags } from "@/lib/forms/intake/parseIntakeAutoCreateFlags";

describe("parseIntakeAutoCreateFlags", () => {
    it("defaults all flags to false when metadata missing or empty", () => {
        expect(parseIntakeAutoCreateFlags(undefined)).toEqual({
            auto_create_person: false,
            auto_create_customer: false,
            auto_create_customer_member: false,
            auto_create_opportunity: false,
        });
        expect(parseIntakeAutoCreateFlags({})).toEqual({
            auto_create_person: false,
            auto_create_customer: false,
            auto_create_customer_member: false,
            auto_create_opportunity: false,
        });
    });

    it("reads explicit booleans only", () => {
        expect(
            parseIntakeAutoCreateFlags({
                auto_create_person: true,
                auto_create_customer: "true",
                auto_create_customer_member: false,
                auto_create_opportunity: 1,
            })
        ).toEqual({
            auto_create_person: true,
            auto_create_customer: false,
            auto_create_customer_member: false,
            auto_create_opportunity: false,
        });
    });

    it("demo-style all true", () => {
        const m = {
            auto_create_person: true,
            auto_create_customer: true,
            auto_create_customer_member: true,
            auto_create_opportunity: true,
        };
        expect(parseIntakeAutoCreateFlags(m)).toEqual(m);
    });
});
