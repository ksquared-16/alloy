import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { emptyResolvedActionsBySlot } from "@/lib/admin/actions/types";
import {
    __clearOpportunityDrawerHeaderActionsCacheForTests,
    peekOpportunityDrawerHeaderActionsCache,
    putOpportunityDrawerHeaderActionsCache,
} from "@/lib/admin/drawer/opportunityDrawerHeaderActionsCache";
import { composeAdminV2DrawerRuntime } from "@/lib/adminV2/runtime/contract/drawerComposerPolicy";
import { adminV2DrawerHeaderActionsTabIndependent } from "@/lib/adminV2/runtime/contract/drawerTabsContract";

const webRoot = resolve(__dirname, "../../..");

function readSrc(rel: string): string {
    return readFileSync(resolve(webRoot, rel), "utf8");
}

describe("opportunity drawer header actions cache", () => {
    it("stores and restores header actions by opportunity id", () => {
        __clearOpportunityDrawerHeaderActionsCacheForTests();
        const actions = {
            ...emptyResolvedActionsBySlot(),
            primary: [{ key: "schedule_tour", label: "Schedule tour", kind: "action" as const }],
        };
        putOpportunityDrawerHeaderActionsCache("opp-1", actions, "/api/admin/actions?x=1");
        const cached = peekOpportunityDrawerHeaderActionsCache("opp-1");
        expect(cached?.actions.primary).toHaveLength(1);
        expect(cached?.resolvedSig).toContain("/api/admin/actions");
    });
});

describe("opportunity header actions restore wiring", () => {
    it("caches header actions when leaving opportunity for person", () => {
        const drawer = readSrc("components/admin/AdminEntityDrawer.tsx");
        expect(drawer).toContain("putOpportunityDrawerHeaderActionsCache");
        expect(drawer).toContain("peekOpportunityDrawerHeaderActionsCache");
        expect(drawer).toMatch(
            /prev\.type === "opportunities"[\s\S]*?next\.type === "persons"[\s\S]*?putOpportunityDrawerHeaderActionsCache/
        );
    });

    it("restores cached header actions when returning from person to opportunity", () => {
        const drawer = readSrc("components/admin/AdminEntityDrawer.tsx");
        expect(drawer).toMatch(
            /next\.type === "opportunities"[\s\S]*?prev\.type === "persons"[\s\S]*?peekOpportunityDrawerHeaderActionsCache/
        );
        expect(drawer).toContain("setOpportunityResolvedHeaderActions(headerActionsCache.actions)");
    });

    it("title rail can stabilize from resolved header actions without waiting for overview reveal", () => {
        const drawer = readSrc("components/admin/AdminEntityDrawer.tsx");
        expect(drawer).toContain("opportunityRegistryHeaderReady");
        expect(drawer).toMatch(
            /opportunityHeaderTitleRailStable[\s\S]*opportunityRegistryHeaderReady/
        );
    });

    it("inquiry workflow header actions are tab-independent in composer policy", () => {
        expect(adminV2DrawerHeaderActionsTabIndependent({ inquiryWorkflow: true })).toBe(true);
        const plan = composeAdminV2DrawerRuntime({
            entityType: "opportunities",
            surface: "opportunity",
            drawerId: "opp-1",
            activeTab: "communications",
            record: {
                id: "opp-1",
                _record_surface: "drawer_primary",
                metadata: { tour_date: "2026-06-01" },
                _customer_name: "Test",
            },
            error: null,
            typedSnapshot: false,
            bodyHydrated: true,
            fullHydrateReady: false,
            frameReady: true,
            headerActionsResolved: true,
            headerActionsLoading: false,
            headerActionsExpectRegistry: true,
            inquiryWorkflow: true,
            belowFoldRevealed: false,
            presentationReady: true,
            primaryContractReady: true,
            needsBackgroundHydrate: false,
        });
        expect(plan.canRevealHeaderActions).toBe(true);
    });
});

describe("communications tab split layout", () => {
    it("renders thread on the left and composer on the right", () => {
        const comms = readSrc("components/admin/communications/CommunicationsDrawerSection.tsx");
        expect(comms).toContain('data-comms-split-layout="thread-left-composer-right"');
        expect(comms).toContain("lg:grid-cols-[minmax(22rem,0.4fr)_minmax(32rem,0.6fr)]");
        expect(comms).toMatch(
            /useWideComposerSplit[\s\S]*channelFilterTabs[\s\S]*composerSplitLeft[\s\S]*conversationPaneBody[\s\S]*composerSplitRight/
        );
    });
});
