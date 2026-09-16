import { describe, expect, it, beforeEach, afterEach } from "vitest";

import {
    assertPermissionsForOperationKinds,
    hasConfigLayoutAssistPermission,
} from "@/lib/agent/configLayoutAssist/configurationProposalAccess";

describe("configurationProposalAccess", () => {
    const prev = process.env.CONFIG_LAYOUT_ASSIST_LEGACY_ROLE_FALLBACK;

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

    it("denies the admin role key when the grant is absent", () => {
        expect(
            hasConfigLayoutAssistPermission({ permissionKeys: [], roleKeys: ["admin"] }, "config_assist.apply")
        ).toBe(false);
    });

    /*
     * THE ANSWER MAY NOT DEPEND ON THE ENVIRONMENT.
     *
     * This suite used to assert the opposite of itself depending on a flag: with
     * `CONFIG_LAYOUT_ASSIST_LEGACY_ROLE_FALLBACK` unset — its state in every
     * deployed environment, since it was set in tests and nowhere else — the
     * bare `admin` role key satisfied `config_assist.generate`, `fields.manage`
     * and `layouts.manage` whether granted or not, and one case asserted exactly
     * that ("allows org admin via legacy fallback by default").
     *
     * So the capability was decorative where it mattered and real only under a
     * flag nobody set. The replacement asserts the property that makes an
     * authorization model one: the same principal gets the same answer in every
     * environment.
     */
    it("gives the same answer whatever the retired fallback flag says", () => {
        const ungranted = { permissionKeys: [], roleKeys: ["admin"] };
        const granted = { permissionKeys: ["config_assist.generate"], roleKeys: [] };
        for (const v of [undefined, "true", "false", "1", "yes"]) {
            if (v === undefined) delete process.env.CONFIG_LAYOUT_ASSIST_LEGACY_ROLE_FALLBACK;
            else process.env.CONFIG_LAYOUT_ASSIST_LEGACY_ROLE_FALLBACK = v;
            expect(hasConfigLayoutAssistPermission(ungranted, "config_assist.generate")).toBe(false);
            expect(hasConfigLayoutAssistPermission(granted, "config_assist.generate")).toBe(true);
        }
    });

    it("admits a custom role that holds the key and is not an admin", () => {
        expect(
            hasConfigLayoutAssistPermission(
                { permissionKeys: ["fields.manage"], roleKeys: ["field_manager"] },
                "fields.manage"
            )
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
