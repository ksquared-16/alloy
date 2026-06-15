// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
    BOS_ACTION_WORKSPACE_OPEN_ATTR,
    measureActionWorkspacePanelLayout,
    setActionWorkspaceOpenDocumentFlag,
} from "@/lib/bos/bosRailPresentationFlags";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("bosRailPresentationFlags", () => {
    beforeEach(() => {
        if (typeof document === "undefined") return;
        document.documentElement.removeAttribute(BOS_ACTION_WORKSPACE_OPEN_ATTR);
        document.body.innerHTML = "";
    });

    afterEach(() => {
        if (typeof document === "undefined") return;
        document.documentElement.removeAttribute(BOS_ACTION_WORKSPACE_OPEN_ATTR);
        document.body.innerHTML = "";
    });

    it("setActionWorkspaceOpenDocumentFlag toggles action workspace attribute", () => {
        if (typeof document === "undefined") return;
        setActionWorkspaceOpenDocumentFlag(true);
        expect(document.documentElement.getAttribute(BOS_ACTION_WORKSPACE_OPEN_ATTR)).toBe("true");
        setActionWorkspaceOpenDocumentFlag(false);
        expect(document.documentElement.getAttribute(BOS_ACTION_WORKSPACE_OPEN_ATTR)).toBeNull();
    });

    it("measureActionWorkspacePanelLayout uses sidebar band without BOS reserve", () => {
        if (typeof document === "undefined") return;
        const sidebar = document.createElement("aside");
        sidebar.setAttribute("data-adminv2-sidebar", "true");
        sidebar.getBoundingClientRect = () =>
            ({
                left: 0,
                right: 280,
                top: 0,
                bottom: 64,
                width: 280,
                height: 64,
                x: 0,
                y: 0,
                toJSON: () => ({}),
            }) as DOMRect;
        document.body.appendChild(sidebar);

        const layout = measureActionWorkspacePanelLayout(1600);
        expect(layout.availableLeft).toBe(296);
        expect(layout.availableRight).toBe(1584);
        expect(layout.width).toBeLessThanOrEqual(1200);
        expect(layout.width).toBeGreaterThan(900);
    });
});

describe("bosRailPresentation CSS guards", () => {
    it("adminV2.css suppresses rail for action workspace only", () => {
        const css = read("app/adminV2/adminV2.css");
        expect(css).toContain("data-adminv2-action-workspace-open");
        expect(css).not.toContain("data-adminv2-bos-rail-minimized");
    });

    it("ActionWorkspaceBosShell wires action workspace document flag hook", () => {
        const shell = read("components/admin/actions/ActionWorkspaceBosShell.tsx");
        expect(shell).toContain("useActionWorkspaceOpenDocumentFlag");
        expect(shell).toContain("measureActionWorkspacePanelLayout");
    });

    it("does not auto-minimize BOS on record drawer", () => {
        const flagHook = read("lib/bos/useBosRailOverlayDrawerDocumentFlag.ts");
        expect(flagHook).not.toContain("bos-rail-minimized");
        expect(flagHook).toContain("data-adminv2-drawer");
    });
});
