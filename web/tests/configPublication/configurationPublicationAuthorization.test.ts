import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

    it("projects Location scope and mutation capability into the read model", () => {
        const route = readFileSync(
            resolve(__dirname, "../../app/api/admin/configuration/programs/route.ts"),
            "utf8",
        );
        const service = readFileSync(
            resolve(__dirname, "../../lib/programs/publication/programPublicationService.ts"),
            "utf8",
        );
        const evidence = readFileSync(
            resolve(__dirname, "../../lib/configPublication/evidenceService.ts"),
            "utf8",
        );
        expect(route).toContain("allowedSiteLocationIds: context.allowedSiteLocationIds");
        expect(route).toContain("canManage: canManageProgramPublication(context)");
        expect(service).toContain("allowedSiteLocationIds");
        expect(evidence).toContain('.in("location_id", allowedLocationIds)');
    });

    it("rejects publication when the working draft matches the active revision", () => {
        const service = readFileSync(
            resolve(__dirname, "../../lib/programs/publication/programPublicationService.ts"),
            "utf8",
        );
        expect(service).toContain("The working draft matches the active revision.");
        expect(service).toContain("payload_checksum");
    });
});
