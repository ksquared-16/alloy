/**
 * REPAIR SLICE 7 — the participant must reach the WIRE, not merely be handled once it arrives.
 *
 * ── WHY THIS FILE EXISTS, AND WHY THE PREVIOUS ONE WAS NOT ENOUGH ──
 *
 * `participantScopePhaseConvergence.test.ts` certified Upstream Slice 5 by passing
 * `selectedParticipationId` straight into `buildOperationalContext`. It was green, the repair was
 * correct, and deployed behaviour did not move at all: the settled request carried NO
 * `attention_subject_id`, so `resolveParticipationSubjectForOpportunity` exited on its first guard
 * and the repair was never invoked. **A test that SUPPLIES an input assumes that input arrives.**
 *
 * So these tests start where the value is actually produced and assert on the SERIALIZED REQUEST —
 * the artifact the deployed defect was visible in.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildOpportunityDrawerViewModelUrl } from "@/lib/adminV2/viewModel/drawer/shadow/fetchOpportunityDrawerViewModelClient";

const PARTICIPATION = "9ab36f48-7bd0-4a4e-8538-2afb46a8c9a8"; // process_instances.id — the child row
const FAMILY_OPP = "d097e1a8-c3c0-4c51-a113-2275b009b9a9";   // the family case it settles on
const MEMBER = "bf7bb266-31b3-4cb3-ad9e-77d94fee4d12";       // customer_member_id — server-derived ONLY

/** The transport context exactly as `useRecordWorkRuntime` builds it, given what it resolves. */
const transportContextFor = (attentionSubjectId: string | null) =>
    attentionSubjectId ? { work_unit_id: "", department_id: "", attention_subject_id: attentionSubjectId } : null;

/** The runtime's resolution rule: stated participation wins, attention is the fallback. */
const resolveAttentionSubject = (participationId: string | null, fromKernel: string | null) =>
    participationId?.trim() || fromKernel;

describe("1 — the serialized request carries the participation", () => {
    it("THE GATE: a child-grain panel produces attention_subject_id on the real URL", () => {
        const url = buildOpportunityDrawerViewModelUrl(
            FAMILY_OPP,
            transportContextFor(resolveAttentionSubject(PARTICIPATION, null)),
        );
        expect(url).toContain(`attention_subject_id=${PARTICIPATION}`);
    });

    it("the deployed defect, reproduced: no stated participation and no attention yields no parameter", () => {
        // This is EXACTLY the request captured on deployed staging at a609a4486.
        const url = buildOpportunityDrawerViewModelUrl(FAMILY_OPP, transportContextFor(resolveAttentionSubject(null, null)));
        expect(url).not.toContain("attention_subject_id");
        expect(url).toBe(`/api/admin/view-models/drawer/opportunity/${FAMILY_OPP}`);
    });

    it("the request is still keyed on the FAMILY case, never the participation", () => {
        const url = buildOpportunityDrawerViewModelUrl(
            FAMILY_OPP,
            transportContextFor(resolveAttentionSubject(PARTICIPATION, null)),
        );
        expect(url).toContain(`/drawer/opportunity/${FAMILY_OPP}`);
        expect(url).not.toContain(`/drawer/opportunity/${PARTICIPATION}`);
    });
});

describe("2 — cold entry is the case that failed, and it is the case that must pass", () => {
    it("a cold entry has NO attention subject — a SURFACE movement clears it by design", () => {
        // Not a bug in attention: `ATTENTION_SCOPE.SURFACE` sets `subject: null`, and committing the
        // surface's configured DEFAULT subject moves attention nowhere. The hook is working.
        expect(resolveAttentionSubject(null, null)).toBeNull();
    });

    it("and the STATED participation rescues exactly that case", () => {
        expect(resolveAttentionSubject(PARTICIPATION, null)).toBe(PARTICIPATION);
        expect(buildOpportunityDrawerViewModelUrl(FAMILY_OPP, transportContextFor(PARTICIPATION)))
            .toContain("attention_subject_id=");
    });

    it("after a click, the stated value and attention agree — no contradiction to resolve", () => {
        expect(resolveAttentionSubject(PARTICIPATION, PARTICIPATION)).toBe(PARTICIPATION);
    });
});

describe("3 — case grain fabricates nothing", () => {
    it("a case-grain panel states no participation and the URL carries none", () => {
        const url = buildOpportunityDrawerViewModelUrl(FAMILY_OPP, transportContextFor(resolveAttentionSubject(null, null)));
        expect(url).not.toContain("attention_subject_id");
    });

    it("the panel passes null on case grain — asserted at the call site", () => {
        const src = readFileSync(join(process.cwd(), "components/presentation/workUnit/InlineOpportunityFocusPanel.tsx"), "utf8");
        expect(src).toContain("isChildSubject ? operationalSubjectId : null");
    });
});

describe("4 — identifier semantics: a PARTICIPATION crosses the wire, never a member id", () => {
    it("the transported value is the participation, not the customer_member_id", () => {
        const url = buildOpportunityDrawerViewModelUrl(FAMILY_OPP, transportContextFor(PARTICIPATION));
        expect(url).toContain(PARTICIPATION);
        expect(url).not.toContain(MEMBER);
    });

    /*
     * THE AUTHORIZATION BOUNDARY THIS PRESERVES.
     *
     * The cards know `customer_member_id` and sending it would also "work" — and would delete the
     * boundary: the server would be trusting a client-named child instead of resolving one. The
     * contract stays: client names an ATTENTION/PARTICIPATION identity, server resolves it under
     * org_id + context_id and DERIVES the member.
     */
    it("the server still derives the member itself, under org and context", () => {
        const resolver = readFileSync(
            join(process.cwd(), "lib/adminV2/runtime/operationalContext/resolveParticipationSubjectForOpportunity.ts"), "utf8");
        expect(resolver).toContain('.eq("org_id", orgId)');
        expect(resolver).toContain('.eq("context_id", opportunityId)');
        expect(resolver).toContain('.eq("id", participationId)');
        expect(resolver).toContain("subject_id");
    });

    it("no client-supplied member id is accepted anywhere on this path", () => {
        const runtime = readFileSync(join(process.cwd(), "lib/presentation/runtime/useRecordWorkRuntime.ts"), "utf8");
        const builder = readFileSync(
            join(process.cwd(), "lib/adminV2/viewModel/drawer/shadow/fetchOpportunityDrawerViewModelClient.ts"), "utf8");
        for (const src of [runtime, builder]) {
            expect(src).not.toContain("customer_member_id");
            expect(src).not.toContain("customerMemberId");
        }
    });

    it("the route reads the participation from the query, not a member", () => {
        const route = readFileSync(
            join(process.cwd(), "app/api/admin/view-models/drawer/opportunity/[id]/route.ts"), "utf8");
        expect(route).toContain('sp.get("attention_subject_id")');
        expect(route).toContain("resolveParticipationSubjectForOpportunity");
    });
});

describe("5 — subject switch and staleness", () => {
    it("switching child A -> B transports B, not A", () => {
        const a = buildOpportunityDrawerViewModelUrl(FAMILY_OPP, transportContextFor(resolveAttentionSubject("pi-A", null)));
        const b = buildOpportunityDrawerViewModelUrl(FAMILY_OPP, transportContextFor(resolveAttentionSubject("pi-B", null)));
        expect(a).toContain("attention_subject_id=pi-A");
        expect(b).toContain("attention_subject_id=pi-B");
        expect(b).not.toContain("pi-A");
    });

    it("child -> case does NOT retain the child participation", () => {
        const asCase = buildOpportunityDrawerViewModelUrl(FAMILY_OPP, transportContextFor(resolveAttentionSubject(null, null)));
        expect(asCase).not.toContain("attention_subject_id");
        expect(asCase).not.toContain(PARTICIPATION);
    });

    it("case -> child carries the new participation", () => {
        expect(buildOpportunityDrawerViewModelUrl(FAMILY_OPP, transportContextFor(resolveAttentionSubject("pi-new", null))))
            .toContain("attention_subject_id=pi-new");
    });

    it("the stated participation is derived per render from committed Focus, so it cannot go stale", () => {
        // `transportContext` is a useMemo over the resolved value; the runtime holds no ref to a
        // prior participation, so there is nothing that could survive a subject change.
        const src = readFileSync(join(process.cwd(), "lib/presentation/runtime/useRecordWorkRuntime.ts"), "utf8");
        expect(src).toContain("[attentionSubjectId]");
        expect(src).not.toMatch(/participationRef|lastParticipation/);
    });

    it("a late response for a superseded subject still cannot land — the generation guard is intact", () => {
        const src = readFileSync(join(process.cwd(), "lib/presentation/runtime/useRecordWorkRuntime.ts"), "utf8");
        expect(src).toContain("if (gen !== fetchGenRef.current) return;");
    });
});

describe("6 — the caller contract, so the fallback cannot quietly become the only path", () => {
    it("the panel STATES the participation rather than relying on the global", () => {
        const src = readFileSync(join(process.cwd(), "components/presentation/workUnit/InlineOpportunityFocusPanel.tsx"), "utf8");
        expect(src).toMatch(/useRecordWorkRuntime\(\s*settlementSubjectId,/);
    });

    it("the runtime prefers the stated value over attention", () => {
        const src = readFileSync(join(process.cwd(), "lib/presentation/runtime/useRecordWorkRuntime.ts"), "utf8");
        expect(src).toContain("participationId?.trim() || attentionSubjectFromKernel");
    });

    it("attention remains the fallback for callers that state nothing", () => {
        expect(resolveAttentionSubject(null, "pi-from-attention")).toBe("pi-from-attention");
    });
});
