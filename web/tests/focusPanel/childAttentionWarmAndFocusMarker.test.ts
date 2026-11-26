import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { resolveFocusPanelMutationOpportunityId } from "@/lib/adminV2/runtime/focusPanel/focusPanelMutation";

/**
 * R-017 — the two defects the child-with-family composition exposed.
 *
 * 1. Every capability host warmed from What's Next is keyed by the FAMILY opportunity: recipients,
 *    tour bookings, form delivery, eligible children. Under child attention the subject is the
 *    child / process-instance, so passing it straight through produced
 *      GET communications/drawer-recipients?entity_type=opportunities&entity_id=<participation>
 *      GET tours/opportunities/<participation>/bookings
 *    which 404 on every child selection. Only the composer branch resolved correctly; the other
 *    three reached for `context.subject.id`.
 *
 * 2. Children stayed family Settlement chrome with no way to see WHICH child the panel was about.
 */

const WEB = process.cwd();
const src = (rel: string) =>
    readFileSync(join(WEB, rel), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");

const WARM = src("lib/adminV2/runtime/focusPanel/currentWork/warmCurrentWorkCapabilities.ts");
const CHILDREN = src("components/admin/focusPanel/cards/ChildrenCard.tsx");

describe("family-scoped warm requests use the family opportunity id", () => {
    it("resolves the family opportunity under child attention, not the participation", () => {
        const familyId = "opp-family-1";
        const resolved = resolveFocusPanelMutationOpportunityId({
            subjectId: "participation-93722453",
            grain: "child",
            truth: {
                "child.family_opportunity_id": familyId,
                "child.process_instance_id": "participation-93722453",
            },
        });
        expect(resolved).toBe(familyId);
        expect(resolved).not.toBe("participation-93722453");
    });

    it("leaves a case subject on its own id", () => {
        expect(
            resolveFocusPanelMutationOpportunityId({
                subjectId: "opp-1",
                grain: "case",
                truth: { id: "opp-1" },
            }),
        ).toBe("opp-1");
    });

    it("routes EVERY warm branch through the shared resolver, not the raw subject", () => {
        // The regression was three branches reaching for `context.subject.id` while only the
        // composer resolved. One seam, not a fix per capability.
        const dispatcher = WARM.slice(WARM.indexOf("export function warmCurrentWorkCapabilityOnIntent"));
        expect(dispatcher).not.toContain("context.subject.id");
        for (const prefetch of [
            "prefetchTourSchedule(resolveWarmOpportunityId(context)",
            "prefetchFormDelivery(resolveWarmOpportunityId(context))",
            "prefetchEligibleEnrollmentChildren(resolveWarmOpportunityId(context))",
        ]) {
            expect(dispatcher).toContain(prefetch);
        }
        expect(dispatcher).toContain("const opportunityId = resolveWarmOpportunityId(context)");
    });

    it("keeps the resolver itself bound to the canonical ownership rule", () => {
        expect(WARM).toContain("resolveFocusPanelMutationOpportunityId({");
        expect(WARM).toContain("subjectId: context.subject.id");
    });
});

describe("the Children card marks the child under attention", () => {
    it("derives the focused member from the identity the lens already carries", () => {
        expect(CHILDREN).toContain('context.truth?.["child.customer_member_id"]');
        expect(CHILDREN).toContain("focusedMemberId={childAttentionMemberId || null}");
    });

    it("marks only the row whose member id matches", () => {
        expect(CHILDREN).toMatch(
            /focusedMemberId && child\.customerMemberId && child\.customerMemberId === focusedMemberId/,
        );
    });

    it("exposes the marker in the DOM and to assistive tech", () => {
        expect(CHILDREN).toContain('data-children-focused-child={isFocusedChild ? "true" : undefined}');
        expect(CHILDREN).toContain('aria-current={isFocusedChild ? "true" : undefined}');
        expect(CHILDREN).toContain('isFocusedChild && "alloy-os-children__summary-row--focused"');
    });

    it("keeps siblings rendered — the roster is not filtered to the focused child", () => {
        // Children remains family Settlement chrome; focusing one child must not hide the others.
        expect(CHILDREN).toContain("evidence.children.map((child) => (");
        expect(CHILDREN).not.toMatch(/evidence\.children\s*\.filter\([^)]*focusedMemberId/);
    });

    it("does not elevate the card or mutate the family selection", () => {
        // The card deliberately does not auto-elevate under Child Attention; marking is presentation
        // only, and must not become a second child-selection system.
        const marker = CHILDREN.slice(CHILDREN.indexOf("const isFocusedChild"));
        expect(marker.slice(0, 600)).not.toMatch(/setState|onActivate\(|selectIdentity|enterContext/);
    });
});

describe("the focused marker has a style to render", () => {
    const CSS = readFileSync(join(WEB, "app/adminV2/components/alloyOsRuntime.css"), "utf8");
    it("defines the focused modifier", () => {
        expect(CSS).toContain(".alloy-os-children__summary-row--focused");
    });
});
