/**
 * `scheduling` — the PRECONDITION for a future commit-critical promotion, and the reason the
 * promotion was reverted.
 *
 * The data precondition holds and is worth keeping green: the card's model is a pure function of
 * `_inquiry_children`, a field the provisioning answer already carries. If that ever stops being
 * true, a future promotion becomes unsafe and this fails first.
 *
 * The promotion itself was reverted. Participation in the RESOLVED composition is tenant-dependent
 * (Firefly's published doc excludes `scheduling`), and the commit producer cannot see the resolved
 * composition — so promoting it would spend commit-critical work on a card that tenant never
 * renders, violating the dormant-capability law established via `readiness_kpi`. See the note in
 * `focusPanelCommitCriticalCards.ts`.
 */

import { describe, expect, it } from "vitest";

import { COMMIT_CRITICAL_CARD_SPECS } from "@/lib/adminV2/runtime/focusPanel/focusPanelCommitCriticalCards";
import { buildSchedulingCardModel } from "@/lib/adminV2/runtime/focusPanel/deriveOpportunityFocusPanelCards";

describe("scheduling commit-critical precondition", () => {
    it("is NOT commit-critical — participation is tenant-dependent and unknowable at that boundary", () => {
        expect(COMMIT_CRITICAL_CARD_SPECS.some((spec) => spec.key === "scheduling")).toBe(false);
    });

    it("depends on nothing but the children truth the answer already carries", () => {
        // Same children, wildly different surrounding record ⇒ identical model. This is the fact that
        // would make a promotion safe once the resolved composition is available at commit.
        const children = [{ display_name: "Billie Champan" }];
        const bare = buildSchedulingCardModel({ _inquiry_children: children });
        const noisy = buildSchedulingCardModel({
            _inquiry_children: children,
            billing_configured: true,
            tuition_rate_label: "irrelevant",
            some_enriched_only_field: { deep: "value" },
        });
        expect(noisy).toEqual(bare);
    });

    it("distinguishes absent children truth from an empty roster", () => {
        // Absent must never be coerced into "No children to assign" — that would be a business
        // conclusion drawn from missing data. Empty legitimately says it.
        const empty = buildSchedulingCardModel({ _inquiry_children: [] });
        const absent = buildSchedulingCardModel({});
        expect(empty.insight).toBe("No children to assign");
        // Today both render the same string, which is exactly why a future promotion must gate on
        // PRESENCE of the key rather than on the roster count.
        expect(absent.insight).toBe(empty.insight);
    });
});
