/**
 * CP-1 — `scheduling` is knowable at commit, and must stay byte-identical across phases.
 *
 * The whole justification for promoting it is that the enriched drawer VM contributes NOTHING to
 * this card: its builder reads one field that the provisioning answer already carries. If that ever
 * stops being true, the card would render one thing at commit and a different thing at settlement —
 * a visible content swap, which is exactly what "loads-as-one" forbids. These tests pin that.
 */

import { describe, expect, it } from "vitest";

import { COMMIT_CRITICAL_CARD_SPECS } from "@/lib/adminV2/runtime/focusPanel/focusPanelCommitCriticalCards";
import { buildSchedulingCardModel } from "@/lib/adminV2/runtime/focusPanel/deriveOpportunityFocusPanelCards";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

const schedulingSpec = COMMIT_CRITICAL_CARD_SPECS.find((spec) => spec.key === "scheduling");

function contextWithChildren(children: unknown): OperationalContext {
    return {
        truth: children === undefined ? {} : { _inquiry_children: children },
        signals: { attention: {}, work: {} },
    } as unknown as OperationalContext;
}

describe("scheduling is commit-critical", () => {
    it("is registered in the commit-critical specs", () => {
        expect(schedulingSpec).toBeDefined();
    });

    it("is knowable exactly when the answer carried the children truth", () => {
        expect(schedulingSpec!.isKnowable(contextWithChildren([{ display_name: "Billie Champan" }]))).toBe(true);
        expect(schedulingSpec!.isKnowable(contextWithChildren([]))).toBe(true);
        // Absent truth is NOT knowable — it must stay reserved rather than assert "No children to
        // assign", which would be a business conclusion drawn from data we simply do not have.
        expect(schedulingSpec!.isKnowable(contextWithChildren(undefined))).toBe(false);
    });

    it("builds a model byte-identical to the shared builder the enriched producer uses", () => {
        for (const children of [
            [{ display_name: "Billie Champan" }],
            [{ display_name: "A One" }, { display_name: "B Two" }],
            [],
        ]) {
            const context = contextWithChildren(children);
            expect(schedulingSpec!.build(context)).toEqual(buildSchedulingCardModel(context.truth));
        }
    });

    it("does not read anything beyond the children truth", () => {
        // Same children, wildly different surrounding context ⇒ identical model. If the builder ever
        // starts consuming enriched-only data, this fails and the promotion must be revisited.
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
});
