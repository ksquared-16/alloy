import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { emptyResolvedActionsBySlot, type ResolvedActionForClient } from "@/lib/admin/actions/types";
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
        const act = (key: string, label: string): ResolvedActionForClient => ({
            key,
            label,
            description: null,
            action_type: "ui_intent",
            icon: null,
            style: null,
            display_style: "button",
            payload: {},
            workflow_id: null,
        });
        const actions = {
            ...emptyResolvedActionsBySlot(),
            primary: [act("schedule_tour", "Schedule tour")],
        };
        putOpportunityDrawerHeaderActionsCache("opp-1", actions, "/api/admin/actions?x=1");
        const cached = peekOpportunityDrawerHeaderActionsCache("opp-1");
        expect(cached?.actions.primary).toHaveLength(1);
        expect(cached?.resolvedSig).toContain("/api/admin/actions");
    });
});

describe("opportunity header actions restore wiring", () => {

    it("header actions cache module supports restore by opportunity id", () => {
        const cache = readSrc("lib/admin/drawer/opportunityDrawerHeaderActionsCache.ts");
        expect(cache).toContain("putOpportunityDrawerHeaderActionsCache");
        expect(cache).toContain("peekOpportunityDrawerHeaderActionsCache");
        expect(cache).toContain("TTL_MS");
    });

    it("inquiry workflow header actions are tab-independent in composer policy", () => {
        expect(adminV2DrawerHeaderActionsTabIndependent({ inquiryWorkflow: true })).toBe(true);
        // BOS right column now requires fullHydrateReady (full record surface) before revealing —
        // use a full-surface record to ensure the section doesn't block the test assertion about
        // tab-independence (which is orthogonal to BOS readiness).
        const plan = composeAdminV2DrawerRuntime({
            entityType: "opportunities",
            surface: "opportunity",
            drawerId: "opp-1",
            activeTab: "communications",
            record: {
                id: "opp-1",
                _record_surface: "full",
                metadata: { tour_date: "2026-06-01" },
                _customer_name: "Test",
                next_follow_up_at: "2026-06-15T10:00:00Z",
                _inquiry_children: [{ person_id: "c1", display_name: "Child", desired_program_label: "Toddler" }],
            },
            error: null,
            typedSnapshot: false,
            bodyHydrated: true,
            fullHydrateReady: true,
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

    it("BOS panel is hidden (not blocking) when full record not yet arrived — header actions can reveal", () => {
        // opportunity_bos_right_column uses fallbackMode "hidden" so it does NOT block
        // canRevealDrawerFrame/canRevealHeaderActions. The body is held by the composed
        // payload evaluation (opportunityComposedPreparing) separately — not the frame gate.
        const plan = composeAdminV2DrawerRuntime({
            entityType: "opportunities",
            surface: "opportunity",
            drawerId: "opp-2",
            activeTab: "overview",
            record: {
                id: "opp-2",
                _record_surface: "drawer_primary",
                _customer_name: "Test",
                next_follow_up_at: "2026-07-01T10:00:00Z",
                _inquiry_children: [],
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
        // BOS uses "hidden" — does not block header actions. The composed payload evaluation
        // is what holds the body in "Preparing" until fullHydrateReady.
        expect(plan.canRevealHeaderActions).toBe(true);
        expect(plan.sectionsBlocking).not.toContain("opportunity_bos_right_column");
    });
});

describe("communications tab split layout", () => {
    it("renders thread on the left and composer on the right (legacy drawer path)", () => {
        const comms = readSrc("components/admin/communications/CommunicationsDrawerSection.tsx");
        expect(comms).toContain('data-comms-drawer-layout="split-workspace"');
        expect(comms).toContain('data-comms-thread-pane="true"');
        expect(comms).toContain('data-comms-drawer-composer-column="true"');
        expect(comms).toContain("COMMS_DRAWER_SPLIT_LAYOUT_CLASS");
        expect(comms).toContain("COMMS_DRAWER_BODY_HEIGHT_CLASS");
        expect(comms).toContain("{channelFilterTabs}");
        expect(comms).toContain("{drawerComposerNode");
        expect(comms).toContain("CommunicationsDrawerSectionLegacy");
    });
});
