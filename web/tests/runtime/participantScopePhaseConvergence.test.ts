/**
 * UPSTREAM SLICE 5 — the settled frame must not lose the child the commit frame named.
 *
 * ── THE DEFECT THESE LOCK ──
 *
 * Measured on deployed staging (`ec8cdaa605d`): Attendance and Health rendered a MEANINGFUL card at
 * 13,551 ms — "This child has no active enrolment, so attendance cannot be recorded for them", and
 * four Missing health requirements — then at 20,113 ms both became "not available for this child"
 * with `data-*-empty="unavailable"`.
 *
 * Both frames run the SAME producer (`projectFocusPanelCardProducers`) and both Attendance and Health
 * are gated on exactly one input, `context.participantScope?.customerMemberId`. The commit frame
 * STATES it from the answer's `child.*` bindings. The settled frame is composed for the FAMILY
 * opportunity, whose truth carries no `child.*` keys, and fell back to matching the attention id — a
 * `process_instances.id` — against `_inquiry_children` candidates keyed by inquiry-child id and a
 * best-effort `customer_member_id`. Different id spaces, so the match answered `not_found` for EVERY
 * child rather than only a foreign one, and the producer truthfully reported `unavailable` about a
 * context that had lost its subject.
 *
 * The doctrine is explicit that this is the wrong verdict for a known child
 * (`focusPanelOperationalProjectionContract.ts`): "`unavailable` and `error` are different facts: NO
 * SUBJECT TO READ FOR is ordinary" — the definition names the SUBJECT, never the data. The producer's
 * own gloss agrees: "a family row with no scoped child has no attendance to show".
 *
 * These tests cross the real phase boundary: commit context → settled context, same subject.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildCommitCriticalOperationalContext } from "@/lib/adminV2/runtime/focusPanel/focusPanelWorkModeModelFromProvisioningAnswer";
import { buildOperationalContext } from "@/lib/adminV2/runtime/operationalContext/buildOperationalContext";
import type { StageWorkRuntimeProjection } from "@/lib/lifecycle/stageWorkRuntimeTypes";

const MEMBER = "cm-ava-0001";
const PARTICIPATION = "pi-ava-0001";
const FAMILY_OPP = "opp-wenc-0001";

const stageWork = {
    stage_key: "waitlist", stage_label: "Waitlist", purpose: null, journey_segment: "child",
    template_keys: [], primary: null, additional: [],
    execution: { blockers: [], capabilities: [], outcomes: [] },
} as unknown as StageWorkRuntimeProjection;

/**
 * A production-SHAPED family drawer VM — every field `buildOperationalContext` actually reads.
 *
 * Enumerated from the builder rather than guessed: a thinner fixture threw on
 * `subjectVm.activity.communicationsPreviewVm` and proved nothing. A fixture that cannot reach the
 * code under test is the green-by-absence this programme keeps finding.
 */
const familyVm = () =>
    ({
        entity: { id: FAMILY_OPP, type: "opportunity" },
        above_fold: { record: {} },
        activity: { communicationsPreviewVm: null },
        workspace: {
            stage_work_runtime: null,
            stage_work: null,
            operational_projection: null,
            lifecycle_rail: null,
            published_stage_inputs: null,
            stage_context: null,
        },
        actions: { record_header: null, header_menu: [] },
        header: { status_can_mutate: true },
        summaries: {
            attention: null,
            tasks: null,
            reminders: null,
            active_tour_bookings: null,
            operator_relevant_tour_booking: null,
        },
    }) as never;

/** The COMMIT frame, exactly as the child-grain provisioning answer states it. */
const commitContext = () =>
    buildCommitCriticalOperationalContext({
        mode: "summary", subjectId: MEMBER, title: "Ava Wenc", statusLabel: "Waitlist",
        statusKey: "waitlisted", canMutate: true, perspective: null, stageWorkRuntime: stageWork,
        publishedStageInputs: null,
        situation: { stageKey: "waitlist", stageLabel: "Waitlist", purpose: null },
        primaryAction: null,
        subjectIdentityTruth: {
            "child.customer_member_id": MEMBER,
            "child.process_instance_id": PARTICIPATION,
        },
    });

/**
 * The SETTLED frame, family-shaped — production-shaped in the way that matters: `_inquiry_children`
 * is intake metadata whose ids are NOT participation ids, which is the whole defect.
 */
const settledContext = (over: { resolvedParticipant?: { participationId: string; customerMemberId: string } | null } = {}) =>
    buildOperationalContext({
        subjectId: FAMILY_OPP,
        title: "Wenc Family",
        subjectVm: familyVm(),
        truth: {
            id: FAMILY_OPP,
            _inquiry_children: [
                { id: "inq-child-1", customer_member_id: MEMBER, display_name: "Ava Wenc" },
                { id: "inq-child-2", customer_member_id: "cm-other-0002", display_name: "Bo Wenc" },
            ],
        },
        perspective: null, statusLabel: "Waitlist", canMutate: true,
        selectedParticipationId: PARTICIPATION,
        ...over,
    });

describe("the commit frame names the child", () => {
    it("states the scope from the answer's child bindings", () => {
        expect(commitContext().participantScope?.customerMemberId).toBe(MEMBER);
    });
});

describe("THE DEFECT: the settled frame could not re-discover the child", () => {
    it("the attention id is a participation id, and no candidate is in that id space", () => {
        const truthIds = ["inq-child-1", "inq-child-2", MEMBER, "cm-other-0002"];
        expect(truthIds).not.toContain(PARTICIPATION);
    });

    it("without a resolved participation the candidate scan still finds nothing", () => {
        // The pre-repair behaviour, preserved exactly: this is what produced `unavailable`.
        expect(settledContext({ resolvedParticipant: null }).participantScope).toBeNull();
    });
});

describe("THE REPAIR: the resolved participation carries the subject across the phase boundary", () => {
    const settled = settledContext({
        resolvedParticipant: { participationId: PARTICIPATION, customerMemberId: MEMBER },
    });

    it("THE GATE: the settled scope names the SAME member the commit frame did", () => {
        expect(settled.participantScope?.customerMemberId).toBe(MEMBER);
        expect(settled.participantScope?.customerMemberId).toBe(commitContext().participantScope?.customerMemberId);
    });

    it("carries the participation identity too, not only the member", () => {
        expect(settled.participantScope?.participationId).toBe(PARTICIPATION);
    });

    it("borrows presentation from the candidate row that names the same member", () => {
        expect(settled.participantScope?.displayName).toBe("Ava Wenc");
    });

    it("identity does NOT depend on a candidate existing — that set is what failed", () => {
        const noCandidates = buildOperationalContext({
            subjectId: FAMILY_OPP, title: "Wenc Family",
            subjectVm: familyVm(),
            truth: { id: FAMILY_OPP },
            perspective: null, statusLabel: null, canMutate: true,
            selectedParticipationId: PARTICIPATION,
            resolvedParticipant: { participationId: PARTICIPATION, customerMemberId: MEMBER },
        });
        expect(noCandidates.participantScope?.customerMemberId).toBe(MEMBER);
        expect(noCandidates.participantScope?.displayName).toBeNull();
    });
});

describe("the producers' verdict follows the scope — the semantic contract", () => {
    /*
     * The producer is `server-only`, so it is not imported here. What is asserted is the input it
     * reads, which the trace proved is the ONLY route to `unavailable`:
     *   `const customerMemberId = context.participantScope?.customerMemberId ?? null;`
     * and both Attendance and Health short-circuit to `Promise.resolve(null)` when it is falsy.
     */
    it("pre-repair the producers would have seen no member — hence `unavailable`", () => {
        expect(settledContext({ resolvedParticipant: null }).participantScope?.customerMemberId ?? null).toBeNull();
    });

    it("post-repair they see the same member both frames agree on — hence `ready`", () => {
        const member = settledContext({
            resolvedParticipant: { participationId: PARTICIPATION, customerMemberId: MEMBER },
        }).participantScope?.customerMemberId ?? null;
        expect(member).toBe(MEMBER);
        expect(member).toBe(commitContext().participantScope?.customerMemberId);
    });

    it("the producer gate is still the single input this repair targets", () => {
        const src = readFileSync(
            join(process.cwd(), "lib/adminV2/runtime/focusPanel/focusPanelCardProducers.ts"), "utf8",
        );
        expect(src).toContain("context.participantScope?.customerMemberId");
    });
});

describe("authority and grain are preserved", () => {
    it("a frame carrying child.* truth is never overridden by a resolved participation", () => {
        // `childSubjectScope` wins: that frame was TOLD its subject and needs no resolution.
        const both = buildOperationalContext({
            subjectId: FAMILY_OPP, title: "Wenc Family",
            subjectVm: familyVm(),
            truth: {
                id: FAMILY_OPP,
                "child.customer_member_id": "cm-told-directly",
                "child.process_instance_id": "pi-told-directly",
            },
            perspective: null, statusLabel: null, canMutate: true,
            resolvedParticipant: { participationId: PARTICIPATION, customerMemberId: MEMBER },
        });
        expect(both.participantScope?.customerMemberId).toBe("cm-told-directly");
    });

    it("the resolver is RESOLVED-not-trusted: it is scoped to org AND this opportunity", () => {
        const src = readFileSync(
            join(process.cwd(), "lib/adminV2/runtime/operationalContext/resolveParticipationSubjectForOpportunity.ts"),
            "utf8",
        );
        expect(src).toContain('.eq("org_id", orgId)');
        expect(src).toContain('.eq("context_id", opportunityId)');
        expect(src).toContain('.eq("id", participationId)');
    });

    it("it reads subject_type 'child' — the value the canonical enrollment resolver filters on", () => {
        const src = readFileSync(
            join(process.cwd(), "lib/adminV2/runtime/operationalContext/resolveParticipationSubjectForOpportunity.ts"),
            "utf8",
        );
        expect(src).toContain('subjectType !== "child"');
        const canonical = readFileSync(join(process.cwd(), "lib/records/enrollmentContextResolver.ts"), "utf8");
        expect(canonical).toContain('.eq("subject_type", "child")');
    });

    /*
     * THE BUILD CAUGHT THIS ONE, AND NOTHING ELSE WOULD HAVE.
     *
     * The first wiring resolved inside `composeOpportunityDrawerViewModel`. That module is reachable
     * from a CLIENT component (`ChildDrawerRuntimeProofClient` → the `lib/layout/runtime` barrel →
     * `evaluateOpportunityLayoutRuntimeBody` → the composer), so importing a `server-only` resolver
     * there put it in the client graph: "Invalid import — 'server-only' cannot be imported from a
     * Client Component module". Typecheck was rc=0 throughout; only `next build` saw it. The
     * composer's own comment already warned about this exact edge for the producers, and the warning
     * applies unchanged to any database owner. The resolution belongs in the ROUTE, beside them.
     */
    it("the resolver is imported by the ROUTE, never by the client-reachable composer", () => {
        const composer = readFileSync(
            join(process.cwd(), "lib/adminV2/viewModel/drawer/opportunity/composeOpportunityDrawerViewModel.ts"),
            "utf8",
        );
        expect(composer).not.toContain("resolveParticipationSubjectForOpportunity");
        const route = readFileSync(
            join(process.cwd(), "app/api/admin/view-models/drawer/opportunity/[id]/route.ts"),
            "utf8",
        );
        expect(route).toContain("resolveParticipationSubjectForOpportunity");
    });

    it("the resolver stays server-only — the guard that made the bad edge fail loudly", () => {
        const src = readFileSync(
            join(process.cwd(), "lib/adminV2/runtime/operationalContext/resolveParticipationSubjectForOpportunity.ts"),
            "utf8",
        );
        expect(src).toContain('import "server-only"');
    });

    it("adds no cache, no readiness system, and only the one lookup", () => {
        const src = readFileSync(
            join(process.cwd(), "lib/adminV2/runtime/operationalContext/resolveParticipationSubjectForOpportunity.ts"),
            "utf8",
        );
        /*
         * ONE LOOKUP PER RESOLUTION, asserted per resolver rather than per file.
         *
         * This counted `.from(` across the module, which said "one lookup" only while the module
         * held one resolver. It now holds two — the drawer asks "which member is THIS named
         * participation?" and the document asks "does this opportunity have exactly ONE member?" —
         * and exactly one of them runs on any given request. A file-level count would either fail
         * this legitimate addition or, if bumped to 2, stop noticing a resolver that grew a second
         * read. So the invariant is checked where it actually lives.
         */
        const bodies = src
            .split(/export async function /)
            .slice(1)
            .map((b) => b.match(/\.from\(/g)?.length ?? 0);
        expect(bodies.length).toBeGreaterThan(0);
        for (const n of bodies) expect(n).toBe(1);
        for (const forbidden of ["useState", "useEffect", "Cache", "setTimeout", "localStorage"]) {
            expect(src).not.toContain(forbidden);
        }
    });
});
