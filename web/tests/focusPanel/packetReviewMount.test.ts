import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { resolvePendingPacketReviewSession } from "@/lib/adminV2/runtime/focusPanel/packetReview/resolvePendingPacketReviewSession";

/**
 * PACKET REVIEW — the action, its eligibility gate and its modal all existed; the listener did not.
 *
 * `review_enrollment_packet` is server-gated to appear ONLY when a completed session awaits operator
 * review, so it reaches the operator at exactly the moment it matters. It dispatches
 * `ADMINV2_OPEN_ENROLLMENT_PACKET_REVIEW`, whose only listener lived in the legacy overview body —
 * and the success toast is deliberately suppressed for this key, on the assumption a modal owns the
 * feedback. So the operator clicked it and got nothing at all, not even an error.
 */

const WEB = process.cwd();
const code = (rel: string) =>
    readFileSync(join(WEB, rel), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");

const session = (over: Record<string, unknown> = {}) => ({
    id: "sess-1",
    admin_packet_review_path: "/admin/packets/sess-1",
    status: "completed",
    // `needs_review` — the real pending vocabulary. `null` counts too; "pending" does not.
    operator_review_status: "needs_review",
    ...over,
});

describe("which packet session the review action opens", () => {
    it("picks the first session awaiting operator review", () => {
        const picked = resolvePendingPacketReviewSession([session({ id: "sess-a" }), session({ id: "sess-b" })]);
        expect(picked?.id).toBe("sess-a");
    });

    it("skips a session with no review path rather than opening onto a load error", () => {
        // The modal loads its rollup from `admin_packet_review_path`. A session without one is not
        // a session with a small gap — it is one the operator cannot review at all.
        const picked = resolvePendingPacketReviewSession([
            session({ id: "sess-a", admin_packet_review_path: "" }),
            session({ id: "sess-b" }),
        ]);
        expect(picked?.id).toBe("sess-b");
    });

    it("answers null when nothing awaits review", () => {
        expect(resolvePendingPacketReviewSession([])).toBeNull();
        expect(resolvePendingPacketReviewSession(null)).toBeNull();
        expect(
            resolvePendingPacketReviewSession([session({ operator_review_status: "approved" })]),
        ).toBeNull();
    });
});

describe("the review modal is mounted on the canonical action-modal registry", () => {
    it("the Focus Panel registry listens for the open event and renders the modal", () => {
        const registry = code("lib/adminV2/viewModel/drawer/vmRuntime/useOpportunityDrawerVmRegistryModals.tsx");
        expect(registry).toContain("ADMINV2_OPEN_ENROLLMENT_PACKET_REVIEW");
        expect(registry).toContain("<OpportunityPacketReviewModal");
        // Transient action chrome, like every other modal here — never a record surface.
        expect(registry).toContain("resolvePendingPacketReviewSession");
    });

    it("the registry is reached from the inline Focus Panel, which is the one record surface", () => {
        const panel = code("components/presentation/workUnit/InlineOpportunityFocusPanel.tsx");
        expect(panel).toContain("useOpportunityDrawerVmRegistryModals");
        expect(panel).toContain("VmDrawerActionModalsPortal");
    });

    it("the action still dispatches the event the registry now hears", () => {
        const client = code("lib/admin/actions/applyRegistryResolvedActionClient.ts");
        expect(client).toContain("dispatchOpenEnrollmentPacketReview");
    });
});

describe("the newly mounted capabilities are ASPECT-addressable", () => {
    it("every card an operator gesture can name is a real Focus Panel card", async () => {
        const { OPERATOR_FOCUS_CARDS } = await import("@/lib/runtime/focus/operatorFocusCards");
        const { FOCUS_PANEL_CARD_KEYS } = await import(
            "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel"
        );
        for (const key of Object.values(OPERATOR_FOCUS_CARDS)) {
            expect(FOCUS_PANEL_CARD_KEYS as readonly string[]).toContain(key);
        }
        // The capabilities this sprint mounted are addressable by name.
        expect(OPERATOR_FOCUS_CARDS.currentWork).toBe("current_work"); // Decision + Close family
        expect(OPERATOR_FOCUS_CARDS.tour).toBe("tour_summary");
        expect(OPERATOR_FOCUS_CARDS.documents).toBe("documents");
    });

    it("Search and the client focus adapter share ONE card vocabulary", async () => {
        // Two lists that must stay identical are one rename away from disagreeing, and the failure
        // is silent: the grid ignores an unknown key, so the panel composes and does not elevate.
        const search = await import("@/lib/search/searchDestinations");
        const { OPERATOR_FOCUS_CARDS } = await import("@/lib/runtime/focus/operatorFocusCards");
        expect(search.SEARCH_CARD_KEYS).toBe(OPERATOR_FOCUS_CARDS);
    });

    it("a card focus round-trips through the aspect encoding", async () => {
        const { formatCardFocusAspect, parseCardFocusAspect } = await import(
            "@/lib/runtime/kernel/attentionCardFocus"
        );
        const aspect = formatCardFocusAspect({ card_key: "current_work", item_id: "work-9" });
        expect(aspect).toBe("card:current_work|item:work-9");
        expect(parseCardFocusAspect(aspect)).toEqual({
            card_key: "current_work",
            item_id: "work-9",
            context_key: null,
        });
    });
});
