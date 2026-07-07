/** @vitest-environment node */

import { describe, expect, it } from "vitest";
import {
    formatQueueRowNameDisplay,
    isQueueRowNameFieldKey,
} from "@/lib/presentation/formatQueueRowNameDisplay";

describe("formatQueueRowNameDisplay", () => {
    it("returns full name by default", () => {
        expect(formatQueueRowNameDisplay("Lennon Kurzman", undefined, "child.name")).toBe("Lennon Kurzman");
        expect(formatQueueRowNameDisplay("Kelly Kurzman", "full_name", "person.primary_contact_name")).toBe(
            "Kelly Kurzman",
        );
    });

    it("returns first name for single-name fields", () => {
        expect(formatQueueRowNameDisplay("Lennon Kurzman", "first_name", "child.name")).toBe("Lennon");
        expect(formatQueueRowNameDisplay("Kelly Kurzman", "first_name", "person.primary_contact_name")).toBe("Kelly");
    });

    it("returns first names for comma-separated list fields", () => {
        expect(
            formatQueueRowNameDisplay("Lennon Kurzman, Wrigley Kurzman", "first_name", "children.names"),
        ).toBe("Lennon, Wrigley");
    });

    it("identifies queue row name field keys", () => {
        expect(isQueueRowNameFieldKey("child.name")).toBe(true);
        expect(isQueueRowNameFieldKey("child.gender")).toBe(false);
    });
});
