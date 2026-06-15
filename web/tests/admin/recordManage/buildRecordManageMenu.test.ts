import { describe, expect, it } from "vitest";

import { buildRecordManageMenuForEntity } from "@/lib/admin/recordManage/buildRecordManageMenu";
import { RECORD_DRAWER_MANAGE_MENU_LABEL } from "@/lib/admin/recordManage/types";

describe("buildRecordManageMenuForEntity", () => {
    it("builds Lead manage menu V1 with delete enabled", () => {
        const menu = buildRecordManageMenuForEntity("lead", "Lead");
        const labels = menu
            .filter((item) => item.kind === "action")
            .map((item) => item.label);
        expect(labels).toEqual([
            "Duplicate Lead",
            "Merge Lead",
            "Transfer Lead",
            "Export",
            "Archive Lead",
            "Delete Lead",
        ]);
        const deleteItem = menu.find(
            (item): item is Extract<(typeof menu)[number], { kind: "action" }> =>
                item.kind === "action" && item.key === "delete_lead"
        );
        expect(deleteItem?.enabled).toBe(true);
        expect(menu.some((item) => item.kind === "separator")).toBe(true);
    });

    it("uses entity singular in labels", () => {
        const menu = buildRecordManageMenuForEntity("person", "Guardian");
        const labels = menu
            .filter((item) => item.kind === "action")
            .map((item) => item.label);
        expect(labels[0]).toBe("Merge Guardian");
        expect(labels[labels.length - 1]).toBe("Delete Guardian");
    });

    it("exposes platform Manage label constant", () => {
        expect(RECORD_DRAWER_MANAGE_MENU_LABEL).toBe("Manage");
    });
});
