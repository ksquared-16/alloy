/**
 * Communications Focus handoff wiring — Current Work checklist → Communications.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import CommunicationsCard from "@/components/admin/focusPanel/cards/CommunicationsCard";
import type { FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

const MODEL: FocusPanelCardModel = {
    key: "communications",
    title: "Communications",
    insight: "—",
    tier: "context",
    span: 1,
    density: "compact",
    visible: true,
    archetype: "status",
};

function context(): OperationalContext {
    return {
        grain: "case",
        subject: { type: "opportunity", id: "opp-1", label: "Digan Family" },
        businessProcess: { key: "enrollment", label: "Enrollment", stageKey: "lead" },
        perspective: null,
        truth: { id: "opp-1" },
        signals: {
            work: {
                primary: null,
                items: [],
                openCount: 0,
                overdueCount: 0,
                nextActionLabel: null,
            },
            attention: { needsAttention: false, primaryReason: null, reasonCount: 0 },
            tour: { scheduled: false, startAt: null, statusLabel: null, statusKey: null, bookingId: null },
            communications: {
                scheduledSendCount: 0,
                nextFollowUpAt: null,
                hasOutreach: false,
                nextScheduledSendId: null,
            },
            billing: {
                billingConfigured: false,
                billingContactName: null,
                billingContactEmail: null,
                tuitionRateLabel: null,
                feeBalanceCents: null,
            },
        },
        capabilities: { canMutate: true, maskedChannels: false },
        status: "ready",
    };
}

describe("CommunicationsCard handoff wiring", () => {
    it("accepts coordination and reports perspective / dismiss / request hooks", () => {
        const src = readFileSync(
            path.join(process.cwd(), "components/admin/focusPanel/cards/CommunicationsCard.tsx"),
            "utf8",
        );
        expect(src).toContain("coordination?: FocusPanelCoordination");
        expect(src).toContain("useReportPerspective");
        expect(src).toContain("useDismissSignal");
        expect(src).toContain('request?.card === "communications"');
        expect(src).toContain("useLayoutEffect");
        expect(src).toContain("setFocused(true)");
    });

    it("mode grid publishes focusTargets and communications handoff coordination", () => {
        const src = readFileSync(
            path.join(process.cwd(), "components/admin/focusPanel/OpportunityFocusPanelModeGrid.tsx"),
            "utf8",
        );
        expect(src).toContain("focusTargets");
        expect(src).toContain("openFocusPanelMode");
        expect(src).toContain("resolveCommunicationsComposerAction");
    });

    it("outcome picker supports compact focus variant", () => {
        const src = readFileSync(
            path.join(process.cwd(), "components/admin/StageWorkOutcomePicker.tsx"),
            "utf8",
        );
        expect(src).toContain('"focus"');
        expect(src).toContain("alloy-os-outcome-picker--focus");
    });

    it("renderer passes coordination into CommunicationsCard", () => {
        const src = readFileSync(
            path.join(process.cwd(), "components/admin/focusPanel/FocusPanelCardRenderer.tsx"),
            "utf8",
        );
        expect(src).toContain("coordination={coordination}");
        expect(src).toMatch(/model\.key === "communications"[\s\S]*coordination=\{coordination\}/);
    });

    it("renders Summary with open-focus affordance", () => {
        const html = renderToStaticMarkup(<CommunicationsCard model={MODEL} context={context()} />);
        expect(html).toContain('data-communications-card="true"');
        expect(html).toContain('data-communications-action="open-focus"');
        expect(html).toContain("alloy-os-communications");
    });
});
