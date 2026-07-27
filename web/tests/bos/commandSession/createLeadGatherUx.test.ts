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
        expect(host).toContain("data-bos-command-session-composer");
        expect(host).toContain("data-bos-command-session-analyze");
        expect(host).toContain("ActionWorkspaceGatherFields");
        expect(host).toContain('data-bos-command-session-mode-body="form"');
        expect(host).toContain("From your note");
        expect(host).toContain("Suggested");
    });

    it("controller uses parse + form edits over shared draft", () => {
        const ctrl = readFileSync(
            resolve(
                __dirname,
                "../../../app/adminV2/components/aiCommandSurface/commandSession/useCreateLeadBosSessionController.ts"
            ),
            "utf8"
        );
        expect(ctrl).toContain("applyParseResult");
        expect(ctrl).toContain("applyOperatorFieldEdit");
        expect(ctrl).toContain("revalidateCreateLeadDraft");
        expect(ctrl).toContain("useInquiryChildPlacementCascade");
    });
});
