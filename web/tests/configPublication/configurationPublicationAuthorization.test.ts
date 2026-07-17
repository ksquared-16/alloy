import { describe, expect, it } from "vitest";
import {
    canManageProgramPublication,
    canReadProgramPublication,
} from "@/app/api/admin/configuration/programs/route";

describe("Programs publication authorization", () => {
    it("allows settings.read to inspect without granting mutation", () => {
        const context = { roleKeys: ["manager"], permissionKeys: ["settings.read"] };
        expect(canReadProgramPublication(context)).toBe(true);
        expect(canManageProgramPublication(context)).toBe(false);
    });

    it("allows settings.manage and owner/admin/ops compatibility roles", () => {
        expect(
            canManageProgramPublication({
                roleKeys: [],
                permissionKeys: ["settings.manage"],
            }),
        ).toBe(true);
        for (const role of ["owner", "admin", "ops"]) {
            expect(
                canManageProgramPublication({ roleKeys: [role], permissionKeys: [] }),
            ).toBe(true);
        }
    });

    it("rejects an unrelated role with no Settings grant", () => {
        const context = { roleKeys: ["staff"], permissionKeys: [] };
        expect(canReadProgramPublication(context)).toBe(false);
        expect(canManageProgramPublication(context)).toBe(false);
    });
});
