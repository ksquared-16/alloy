import { describe, expect, it } from "vitest";

import {
    relatedRecordDrawerA11yCopy,
    relatedRecordDrawerDefaultTestId,
    RELATED_RECORD_DRAWER_KIND_ICONS,
    resolveRelatedRecordDrawerIcon,
} from "@/lib/admin/drawer/relatedRecordDrawerIconKinds";

describe("relatedRecordDrawerIconKinds", () => {
    it("maps person and child to distinct icon components", () => {
        const personIcon = resolveRelatedRecordDrawerIcon("person");
        const childIcon = resolveRelatedRecordDrawerIcon("child");
        expect(personIcon).not.toBe(childIcon);
        expect(personIcon).toBe(RELATED_RECORD_DRAWER_KIND_ICONS.person);
        expect(childIcon).toBe(RELATED_RECORD_DRAWER_KIND_ICONS.child);
    });

    it("reserves distinct glyphs for future record kinds", () => {
        const kinds = ["opportunity", "customer", "associate", "agent"] as const;
        const icons = kinds.map((kind) => resolveRelatedRecordDrawerIcon(kind));
        expect(new Set(icons).size).toBe(icons.length);
    });

    it("uses record-kind-specific test ids and a11y copy", () => {
        expect(relatedRecordDrawerDefaultTestId("person")).toBe("view-person-drawer-open");
        expect(relatedRecordDrawerDefaultTestId("child")).toBe("view-child-drawer-open");
        expect(relatedRecordDrawerA11yCopy("child", "Sam Lee").ariaLabel).toBe("View child Sam Lee");
        expect(relatedRecordDrawerA11yCopy("person", "Sam Lee").ariaLabel).toBe("View person for Sam Lee");
    });
});
