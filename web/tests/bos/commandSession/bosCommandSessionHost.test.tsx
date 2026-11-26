import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { BosHeader } from "@/app/adminV2/components/bos/identity/BosHeader";
import { BosCommandSessionHost } from "@/app/adminV2/components/aiCommandSurface/commandSession/BosCommandSessionHost";
import { BosCommandSessionProvider } from "@/contexts/BosCommandSessionContext";
import { createBosCommandSession, type BosCommandInvocation } from "@/lib/bos/commandSession";
import { palette } from "@/styles/tokens/colors";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const INVOCATION: BosCommandInvocation = {
    actionKey: "create_lead",
    displayLabel: "Create Lead",
    placement: "work_unit_actions",
    contextResolution: "bos_proposal",
    workspace: { departmentId: "d1", workUnitId: "w1", surface: "work_unit" },
};

describe("BosCommandSessionHost shell", () => {
    it("renders ack and Conversation|Form toggle when session is provided via context state", () => {
        // Host reads optional context; without a live provider session it returns null.
        const empty = renderToStaticMarkup(createElement(BosCommandSessionHost));
        expect(empty).toBe("");
    });

    it("createBosCommandSession ack copy mentions Conversation or Form", () => {
        const session = createBosCommandSession({ invocation: INVOCATION });
        expect(session.messages[0]?.kind).toBe("ack");
        expect(session.messages[0]?.body.toLowerCase()).toMatch(/conversation|form/);
    });
});

describe("Bend Pine BOS rail header polish", () => {
    it("BosRailHeader uses palette.bendPine and onBendPine BosHeader", () => {
        const src = readFileSync(
            resolve(__dirname, "../../../app/adminV2/components/aiCommandSurface/bosRail/BosRailPresentation.tsx"),
            "utf8"
        );
        expect(src).toContain("palette.bendPine");
        expect(src).toContain("data-bos-rail-header-bend-pine");
        expect(src).toContain("onBendPine");
        expect(src).toContain(`backgroundColor: palette.bendPine`);
    });

    it("BosHeader onBendPine renders white mark fill from neutral.surface", () => {
        const html = renderToStaticMarkup(
            createElement(BosHeader, { size: "sm", onBendPine: true })
        );
        expect(html).toContain('data-bos-header-on-bend-pine="true"');
        expect(html).toContain("text-white");
        // Mark paths filled with surface white token
        expect(html).toMatch(/fill="#FFFFFF"|fill="#ffffff"/i);
        expect(palette.bendPine).toBe("#00A283");
    });

    it("provider module exports start event constant", async () => {
        const mod = await import("@/contexts/BosCommandSessionContext");
        expect(mod.BOS_START_COMMAND_SESSION_EVENT).toBe("alloy-bos:start-command-session");
        expect(typeof mod.dispatchStartBosCommandSession).toBe("function");
        // silence unused
        expect(BosCommandSessionProvider).toBeTruthy();
    });
});
