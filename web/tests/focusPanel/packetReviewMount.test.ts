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
