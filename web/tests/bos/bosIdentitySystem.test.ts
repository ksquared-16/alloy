import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
    BosButton,
    BosHeader,
    BosHorizon,
    BosMark,
    BosNotification,
    BosSmoke,
    BosWorkingState,
    BosWorkspaceShell,
    ALLOY_BRANDMARK_PATHS,
} from "@/app/adminV2/components/bos/identity";
import { BosGenieLampIcon } from "@/app/adminV2/components/bos/BosGenieLampIcon";

const webRoot = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(webRoot, rel), "utf8");
}

/** Walk production component paths; skip dev, tests, deprecated wrapper. */
function productionTsxFiles(): string[] {
    const roots = ["components", "app/adminV2/components"];
    const skip = ["/dev/", "/tests/", "BosGenieLampIcon.tsx"];
    const out: string[] = [];
    for (const root of roots) {
        const walk = (dir: string) => {
            for (const name of readdirSync(dir)) {
                const p = join(dir, name);
                if (statSync(p).isDirectory()) walk(p);
                else if (p.endsWith(".tsx") && !skip.some((s) => p.includes(s))) out.push(p.slice(webRoot.length + 1));
            }
        };
        walk(resolve(webRoot, root));
    }
    return out;
}

describe("BOS identity system — Sprint 01 primitives", () => {
    it("exports all canonical identity components", () => {
        expect(BosMark).toBeTypeOf("function");
        expect(BosHorizon).toBeTypeOf("function");
        expect(BosSmoke).toBeTypeOf("function");
        expect(BosWorkingState).toBeTypeOf("function");
        expect(BosButton).toBeTypeOf("function");
        expect(BosHeader).toBeTypeOf("function");
        expect(BosNotification).toBeTypeOf("function");
        expect(BosWorkspaceShell).toBeTypeOf("function");
    });

    it("BosMark uses Alloy brandmark paths in pine without gradients", () => {
        const src = read("app/adminV2/components/bos/identity/BosMark.tsx");
        expect(src).toContain("ALLOY_BRANDMARK_PATHS");
        expect(src).not.toContain("gradient");
    });

    it("BosHorizon is separate from mark and uses a thin curve", () => {
        const src = read("app/adminV2/components/bos/identity/BosHorizon.tsx");
        expect(src).toContain('data-bos-horizon="true"');
        expect(src).not.toContain("ALLOY_BRANDMARK");
    });

    it("BosSmoke supports thinking and converging states without originating from mark", () => {
        const src = read("app/adminV2/components/bos/identity/BosSmoke.tsx");
        expect(src).not.toContain("BosMark");
    });

    it("BosWorkingState composes smoke, mark, and message without spinners", () => {
        const html = renderToStaticMarkup(
            createElement(BosWorkingState, { message: "Drafting communication…", state: "thinking" }),
        );
        expect(html).not.toContain("animate-spin");
    });
});

describe("BOS identity system — Sprint 02 migration", () => {
    it("BosMark paths match official Alloy brandmark SVG geometry", () => {
        const svg = read("public/brand/alloy-brandmark-blue.svg");
        for (const path of ALLOY_BRANDMARK_PATHS) {
            expect(svg).toContain(path);
        }
        expect(ALLOY_BRANDMARK_PATHS).toHaveLength(5);
    });

    it("deprecated BosGenieLampIcon delegates to BosMark", () => {
        const html = renderToStaticMarkup(createElement(BosGenieLampIcon, { size: "md" }));
        expect(html).toContain("687.46 669.06");
        expect(html).toContain("#00A283");
        const wrapper = read("app/adminV2/components/bos/BosGenieLampIcon.tsx");
        expect(wrapper).toContain("BosMark");
        expect(wrapper).toContain("@deprecated");
    });

    it("production surfaces do not import BosGenieLampIcon directly", () => {
        const offenders = productionTsxFiles().filter((f) => read(f).includes("BosGenieLampIcon"));
        expect(offenders).toEqual([]);
    });

    it("BOS entry points use BosMark", () => {
        expect(read("components/admin/drawer/BosDrawerAssistCta.tsx")).toContain("BosMark");
        expect(read("components/layout/QueueRowActionsMenu.tsx")).toContain("BosMark");
        expect(read("components/adminV2/messaging/ComposerReplyActionCluster.tsx")).toContain("BosMark");
        expect(read("app/adminV2/components/aiCommandSurface/bosRail/BosRailPresentation.tsx")).toContain("BosMark");
    });

    it("BOS headers use BosHeader", () => {
        expect(read("components/admin/actions/ActionWorkspaceBosShell.tsx")).toContain("BosHeader");
        expect(read("components/admin/actions/ActionWorkspaceBosCloudShell.tsx")).toContain("BosHeader");
        expect(read("app/adminV2/components/aiCommandSurface/bosRail/BosRailPresentation.tsx")).toContain("BosHeader");
        expect(read("components/adminV2/messaging/ComposerBosEnhanceModal.tsx")).toContain("BosHeader");
        expect(read("components/forms/review/BosReviewSummaryPlaceholder.tsx")).toContain("BosHeader");
    });

    it("BOS workspaces use BosWorkspaceShell perimeter", () => {
        expect(read("components/admin/actions/ActionWorkspaceBosShell.tsx")).toContain("bos-workspace-shell");
        expect(read("components/adminV2/messaging/ComposerBosEnhanceModal.tsx")).toContain("BosWorkspaceShell");
    });

    it("smoke appears only in BosWorkingState and BosSmoke modules", () => {
        const smokeFiles = ["components/admin/actions/ActionWorkspacePasteCanvas.tsx", "components/admin/opportunity/actions/ActionIntakePastePanel.tsx", "components/forms/review/BosReviewSummaryPlaceholder.tsx"];
        for (const f of smokeFiles) {
            expect(read(f)).toContain("BosWorkingState");
            expect(read(f)).not.toContain("BosSmoke");
        }
        expect(read("components/admin/OpportunityDrawerOpeningOverlay.tsx")).not.toContain("BosSmoke");
        expect(read("components/admin/workspace/AdminV2RouteLoadingState.tsx")).not.toContain("BosSmoke");
    });

    it("identity gallery exists for screenshot capture", () => {
        expect(read("app/dev/bos-identity-system/BosIdentitySystemGallery.tsx")).toContain("data-bos-identity-gallery");
        expect(read("playwright/tests/bos-identity-system.spec.ts")).toContain("bos-identity-system");
    });
});
