/** @vitest-environment node */

import { describe, expect, it } from "vitest";
import {
    buildCopyPrimaryContactDetailsPatch,
    summarizeCopyablePrimaryContactDetailKeys,
} from "@/lib/adminV2/runtime/focusPanel/household/copyPrimaryContactDetails";
import type { PersonContactValues } from "@/lib/adminV2/runtime/focusPanel/focusPanelMutation";

const empty: PersonContactValues = {
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
};

describe("buildCopyPrimaryContactDetailsPatch", () => {
    it("copies email, phone, and address — never name", () => {
        const primary: PersonContactValues = {
            first_name: "Kelly",
            last_name: "Kurzman",
            email: "kelly@example.com",
            phone: "555-111-2222",
            address_line1: "12 Pine St",
            city: "Bend",
            state: "OR",
            postal_code: "97701",
        };
        const target: PersonContactValues = {
            first_name: "Kristi",
            last_name: "Kurzman",
            email: "old@example.com",
            phone: "",
        };
        const { patch, copiedKeys } = buildCopyPrimaryContactDetailsPatch(primary, target);
        expect(patch.first_name).toBeUndefined();
        expect(patch.last_name).toBeUndefined();
        expect(patch.email).toBe("kelly@example.com");
        expect(patch.phone).toBe("555-111-2222");
        expect(patch.address_line1).toBe("12 Pine St");
        expect(patch.city).toBe("Bend");
        expect(copiedKeys).toEqual(
            expect.arrayContaining(["email", "phone", "address_line1", "city", "state", "postal_code"]),
        );
    });

    it("skips empty primary values so secondary blanks are not wiped", () => {
        const primary: PersonContactValues = {
            first_name: "Kelly",
            last_name: "Kurzman",
            email: "kelly@example.com",
            phone: "",
            address_line1: "  ",
        };
        const { patch, copiedKeys } = buildCopyPrimaryContactDetailsPatch(primary, empty);
        expect(patch).toEqual({ email: "kelly@example.com" });
        expect(copiedKeys).toEqual(["email"]);
    });

    it("summarizes copied keys for confirm copy", () => {
        expect(summarizeCopyablePrimaryContactDetailKeys(["email", "phone", "address_line1"])).toBe(
            "email, phone, and address",
        );
        expect(summarizeCopyablePrimaryContactDetailKeys(["email"])).toBe("email");
    });
});
