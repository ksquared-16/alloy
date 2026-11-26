import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("BOS Create Lead conversation + form gather (WP-07/08)", () => {
    it("host wires conversation composer and form gather fields", () => {
        const host = readFileSync(
            resolve(
                __dirname,
                "../../../app/adminV2/components/aiCommandSurface/commandSession/BosCommandSessionHost.tsx"
            ),
            "utf8"
        );
        const progressive = readFileSync(
            resolve(
                __dirname,
                "../../../app/adminV2/components/aiCommandSurface/commandSession/CreateLeadProgressiveForm.tsx"
            ),
            "utf8"
        );
        expect(host).toContain("data-bos-command-session-composer");
        expect(host).toContain("data-bos-command-session-send");
        expect(host).toContain("CreateLeadProgressiveForm");
        expect(progressive).toContain('data-bos-command-session-mode-body="form"');
        expect(host).toContain("mode_switch");
        expect(host).toContain('message.kind !== "mode_switch"');
    });

    it("controller uses conversation intake adapter over effective gather fields", () => {
        const ctrl = readFileSync(
            resolve(
                __dirname,
                "../../../app/adminV2/components/aiCommandSurface/commandSession/useCreateLeadBosSessionController.ts"
            ),
            "utf8"
        );
        expect(ctrl).toContain("createLeadConversationIntakeAdapter");
        expect(ctrl).toContain("projectCreateLeadFormSections");
        expect(ctrl).toContain("applyOperatorFieldEdit");
        expect(ctrl).toContain("useInquiryChildPlacementCascade");
        expect(ctrl).toContain("resolveCreateLeadDefaultLocation");
        expect(ctrl).toContain("applyImpliedWorkspaceLocationToDraft");
        expect(ctrl).not.toContain("impliedLocationSeededRef");
        expect(ctrl).not.toContain("CREATE_LEAD_GATHER_FIELDS");
        expect(ctrl).not.toContain("gatherSectionsFromFields");
    });

    it("TopNav site filter uses AlloySelect white + Bend Pine (not native gray menu)", () => {
        const nav = readFileSync(
            resolve(__dirname, "../../../app/adminV2/components/TopNavBar.tsx"),
            "utf8"
        );
        expect(nav).toContain("AlloySelect");
        expect(nav).toContain('data-adminv2-site-filter="true"');
        expect(nav).toContain('placeholder="All locations"');
        expect(nav).toContain("bg-white");
        expect(nav).toContain("text-alloy-bend-pine");
        expect(nav).not.toMatch(
            /adminv2-workspace-site-filter[\s\S]{0,400}searchBgOnPrimary/
        );
        const css = readFileSync(
            resolve(__dirname, "../../../app/adminV2/components/alloyOsRuntime.css"),
            "utf8"
        );
        expect(css).toContain("[data-adminv2-site-filter]");
        expect(css).toMatch(/data-adminv2-site-filter[\s\S]{0,200}bend-pine/);
    });
});
