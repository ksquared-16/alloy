import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildTourCardEvidence } from "@/lib/adminV2/runtime/focusPanel/tour/buildTourCardEvidence";
import {
    formatTourStartLabel,
    formatTourStatusLabel,
    isTourTerminalStatus,
} from "@/lib/adminV2/runtime/focusPanel/tour/tourPresentation";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

/**
 * TOUR LIFECYCLE — the card owns state; Current Work already owned the outcome commands.
 *
 * The deleted lifecycle bar was NOT remounted. `groupTourPresentationActions` already groups
 * `complete_tour` / `no_show_tour` / `record_tour_outcome` into Current Work, so remounting would
 * have created a second execution path for one capability. What the bar genuinely had over the card
 * was vocabulary: a status label map, and a start label that was a real date.
 */

const WEB = process.cwd();
const code = (rel: string) =>
    readFileSync(join(WEB, rel), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");

const context = (tour: Partial<OperationalContext["signals"]["tour"]>) =>
    ({
        signals: { tour: { scheduled: false, startAt: null, statusLabel: null, statusKey: null, bookingId: null, ...tour } },
    }) as OperationalContext;

describe("the tour card stops showing raw keys", () => {
    it("humanizes the booking status the signal carries verbatim", () => {
        // `OperationalTourSignal.statusLabel` is `trimOrNull(nextBooking.status_key)` — the RAW key.
        // Title-cased by the platform's generic humanizer — no tour-specific map to drift.
        expect(formatTourStatusLabel("pending_approval")).toBe("Pending Approval");
        expect(formatTourStatusLabel("no_show")).toBe("No Show");
        expect(formatTourStatusLabel(null)).toBeNull();

        const evidence = buildTourCardEvidence(
            context({ scheduled: true, startAt: "2026-06-30T17:00:00.000Z", statusLabel: "pending_approval" }),
            "UTC",
        );
        expect(evidence.statusChip).toBe("Pending Approval");
        expect(evidence.statusLabel).toBe("Pending Approval");
    });

    it("renders a real date and time, not an ISO fragment", () => {
        // The old formatter was `iso.slice(0, 16).replace("T", " · ")` while documenting itself as
        // producing "Jun 30 · 10:00 AM" — the operator saw `2026-06-30 · 17:00`.
        const label = formatTourStartLabel("2026-06-30T17:00:00.000Z", "UTC");
        expect(label).toContain("Jun");
        expect(label).toContain("30");
        expect(label).toMatch(/\d{1,2}:\d{2}\s?(AM|PM)/);
        // No ISO shape survives — "Tue" legitimately contains a T, so assert the SHAPE.
        expect(label).not.toMatch(/\d{4}-\d{2}-\d{2}/);
        expect(label).not.toMatch(/\dT\d/);
    });

    it("honours the viewer's zone", () => {
        const utc = formatTourStartLabel("2026-06-30T02:00:00.000Z", "UTC");
        const la = formatTourStartLabel("2026-06-30T02:00:00.000Z", "America/Los_Angeles");
        expect(utc).not.toBe(la);
    });

    it("never says 'Tour null' when the instant cannot be formatted", () => {
        const evidence = buildTourCardEvidence(
            context({ scheduled: true, startAt: "not-a-date", statusLabel: "confirmed" }),
            "UTC",
        );
        expect(evidence.startLabel).toBeNull();
        expect(evidence.answerLine).toBe("Tour scheduled");
    });
});

describe("a finished tour is not offered scheduling actions", () => {
    it("classifies terminal booking states", () => {
        expect(isTourTerminalStatus("completed")).toBe(true);
        expect(isTourTerminalStatus("no_show")).toBe(true);
        expect(isTourTerminalStatus("canceled")).toBe(true);
        expect(isTourTerminalStatus("confirmed")).toBe(false);
        expect(isTourTerminalStatus("pending_approval")).toBe(false);
    });

    it("the card withholds its footer actions on a terminal tour", () => {
        const evidence = buildTourCardEvidence(
            context({ scheduled: true, startAt: "2026-06-30T17:00:00.000Z", statusLabel: "completed" }),
            "UTC",
        );
        expect(evidence.terminal).toBe(true);
        // Neutral, not "due": a completed tour is not outstanding work.
        expect(evidence.statusTone).toBe("neutral");

        const card = code("components/admin/focusPanel/cards/TourCard.tsx");
        expect(card).toContain("!evidence.terminal");
    });
});

describe("the lifecycle bar is retired, not remounted", () => {
    it("its modules are gone", () => {
        for (const gone of [
            "components/admin/opportunity/tours/OpportunityTourBookingLifecycleBar.tsx",
            "components/admin/opportunity/tours/OpportunityInquiryTourDateBlock.tsx",
            "components/admin/opportunity/OpportunityInquirySummaryActivity.tsx",
            "components/admin/opportunity/OpportunityPacketReviewOverview.tsx",
        ]) {
            expect(existsSync(join(WEB, gone)), `${gone} must not exist`).toBe(false);
        }
    });

    it("Current Work already owns the tour outcome commands it carried", () => {
        const grouping = code("lib/adminV2/runtime/focusPanel/currentWork/groupTourPresentationActions.ts");
        for (const key of ["complete_tour", "no_show_tour", "record_tour_outcome", "confirm_tour", "cancel_tour"]) {
            expect(grouping).toContain(key);
        }
    });

    it("there is ONE tour start formatter, shared by the card and What's Next", () => {
        const whatsNext = code("lib/adminV2/runtime/focusPanel/currentWork/buildWhatsNextCardPresentation.ts");
        expect(whatsNext).toContain('from "@/lib/adminV2/runtime/focusPanel/tour/tourPresentation"');
        expect(whatsNext).not.toContain("function formatTourStartLabel");

        const evidenceSrc = code("lib/adminV2/runtime/focusPanel/tour/buildTourCardEvidence.ts");
        expect(evidenceSrc).toContain("formatTourStartLabel");
        expect(evidenceSrc).not.toContain("function formatStartLabel");
    });
});
