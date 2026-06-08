import { describe, expect, it, beforeEach, afterEach } from "vitest";

import {
    assertPermissionsForOperationKinds,
    hasConfigLayoutAssistPermission,
} from "@/lib/agent/configLayoutAssist/configurationProposalAccess";

describe("configurationProposalAccess", () => {
    const prev = process.env.CONFIG_LAYOUT_ASSIST_LEGACY_ROLE_FALLBACK;

    beforeEach(() => {
        process.env.CONFIG_LAYOUT_ASSIST_LEGACY_ROLE_FALLBACK = "false";
    });

    afterEach(() => {
        if (prev === undefined) delete process.env.CONFIG_LAYOUT_ASSIST_LEGACY_ROLE_FALLBACK;
        else process.env.CONFIG_LAYOUT_ASSIST_LEGACY_ROLE_FALLBACK = prev;
    });

    it("grants when permission key present", () => {
        expect(
            hasConfigLayoutAssistPermission(
                { permissionKeys: ["config_assist.generate"], roleKeys: [] },
                "config_assist.generate"
            )
        ).toBe(true);
    });

    it("denies without permission or legacy fallback when explicitly disabled", () => {
        expect(
            hasConfigLayoutAssistPermission({ permissionKeys: [], roleKeys: ["admin"] }, "config_assist.apply")
        ).toBe(false);
    });

    it("allows org admin via legacy fallback by default", () => {
        delete process.env.CONFIG_LAYOUT_ASSIST_LEGACY_ROLE_FALLBACK;
        expect(
            hasConfigLayoutAssistPermission({ permissionKeys: [], roleKeys: ["admin"] }, "config_assist.generate")
        ).toBe(true);
    });

    it("maps operation kinds to field permissions", () => {
        const r = assertPermissionsForOperationKinds(
            { permissionKeys: ["fields.manage", "layouts.manage"], roleKeys: [] },
            ["expose_field_on_layout"]
        );
        expect(r.ok).toBe(true);
    });
});
