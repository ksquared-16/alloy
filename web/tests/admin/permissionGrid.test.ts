import { describe, expect, it } from "vitest";
import {
    PERMISSION_GRID_ROWS,
    applyGridRowSelection,
    levelFromGrantedKeys,
} from "@/lib/admin/permissionGrid";

describe("permissionGrid", () => {
    it("derives level from granted keys", () => {
        const row = PERMISSION_GRID_ROWS.find((r) => r.id === "users_roles")!;
        expect(levelFromGrantedKeys(row, new Set())).toBe("none");
        expect(levelFromGrantedKeys(row, new Set(["settings.users_roles.read"]))).toBe("read");
        expect(levelFromGrantedKeys(row, new Set(["settings.users_roles"]))).toBe("write");
    });

    it("applies selection without touching unknown keys", () => {
        const row = PERMISSION_GRID_ROWS.find((r) => r.id === "opportunities")!;
        const initial = new Set(["some.other.permission", "crm.opportunities.read"]);
        const next = applyGridRowSelection({ row, level: "none", granted: initial });
        expect(next.has("some.other.permission")).toBe(true);
        expect(next.has("crm.opportunities.read")).toBe(false);
    });
});

