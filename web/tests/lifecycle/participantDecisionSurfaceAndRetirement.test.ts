/**
 * The operator surface, and proof that the legacy Decision Split path is gone.
 *
 * ONE per-child Decision implementation is a property of the repository, not of a code path, so
 * the retirement half asserts against the source tree itself: the old endpoint, its executor and
 * its OCM writer must not exist, and the drawer must not gate the surface on a stage key.
 */

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { projectParticipantDecisionRows } from "@/lib/lifecycle/projectParticipantDecisionRows";
import { parseStageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";

const WEB = path.resolve(__dirname, "../..");
const read = (rel: string) => readFileSync(path.join(WEB, rel), "utf8");

/**
 * Source with comments removed.
 *
 * These assertions are about what the code DOES, and the files deliberately explain in prose what
 * they no longer do. Matching raw text made a comment describing the removed stage check read as
 * the stage check itself — the assertion would have been satisfied only by deleting the
 * explanation, which is the opposite of what it should encourage.
 */
const readCode = (rel: string) =>
    read(rel)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");

const ORG = "11111111-1111-4111-8111-111111111111";
const LEAD = "33333333-3333-4333-8333-333333333333";
const EMMA = "aaaaaaaa-0000-4000-8000-00000000000a";
const LIAM = "aaaaaaaa-0000-4000-8000-00000000000b";

const PLAN = parseStageOperatingPlanV1({
    version: 1,
    lifecycle_key: "enrollment",
    stage_key: "decision",
    journey_segment: "family",
    work_templates: [
        {
            template_key: "review_child_paths",
            label: "Review each child's path",
            required: true,
            due_policy: { kind: "offset_days", days: 2 },
            owner_strategy: "record_owner",
            participant_decisions: [
                {
                    decision_key: "child_waitlist",
                    action_ref: "waitlist_child",
                    label: "Waitlist",
                    subject_grain: "child",
                    targets: [
                        { kind: "update_child_enrollment_status", disposition_key: "waitlisted" },
                        { kind: "move_to_stage", stage_key: "waitlist" },
                    ],
                },
                {
                    decision_key: "child_begin_enrolling",
                    action_ref: "enroll_child",
                    label: "Begin Enrolling",
                    subject_grain: "child",
                    targets: [
                        { kind: "update_child_enrollment_status", disposition_key: "enrolling" },
                        { kind: "move_to_stage", stage_key: "enrolling" },
                    ],
                },
            ],
        },
    ],
    outcomes: [{ outcome_key: "paths_chosen", label: "Child paths chosen", completes_work: true }],
    outcome_rules: [],
    attention_rules: [],
})!;

function makeSupabase(instances: Array<{ id: string; subject_id: string; state: string | null }>) {
    return {
        from(table: string) {
            const builder: Record<string, unknown> = {};
            builder.select = () => builder;
            builder.eq = () => builder;
            builder.in = () => builder;
            builder.then = (resolve: (r: { data: unknown; error: unknown }) => void) => {
                if (table === "process_instances") {
                    resolve({
                        data: instances.map((i) => ({
                            ...i,
                            org_id: ORG,
                            process_key: "enrollment",
                            context_id: LEAD,
                            stage_key: "decision",
                        })),
                        error: null,
                    });
                    return;
                }
                if (table === "customer_members") {
                    resolve({
                        data: [
                            { id: EMMA, first_name: "Emma", last_name: "Rivera" },
                            { id: LIAM, first_name: "Liam", last_name: "Rivera" },
                        ],
                        error: null,
                    });
                    return;
                }
                resolve({ data: [], error: null });
            };
            return builder;
        },
    } as never;
}

const project = (instances: Array<{ id: string; subject_id: string; state: string | null }>) =>
    projectParticipantDecisionRows({
        supabase: makeSupabase(instances),
        orgId: ORG,
        opportunityId: LEAD,
        plan: PLAN,
        templateKey: "review_child_paths",
        resolveDecisionLabel: (d) => d.label ?? d.decision_key,
    });

describe("participant decision surface", () => {
    it("presents one row per child with their own decisions", async () => {
        const surface = await project([
            { id: "pi-emma", subject_id: EMMA, state: null },
            { id: "pi-liam", subject_id: LIAM, state: null },
        ]);

        expect(surface?.rows.map((r) => r.label)).toEqual(["Emma Rivera", "Liam Rivera"]);
        expect(surface?.rows[0]?.decisions.map((d) => d.label)).toEqual(["Waitlist", "Begin Enrolling"]);
        expect(surface?.progress.summary).toBe("0 of 2 children decided");
    });

    it("shows a chosen path per child without exposing keys or ids", async () => {
        const surface = await project([
            { id: "pi-emma", subject_id: EMMA, state: "waitlisted" },
            { id: "pi-liam", subject_id: LIAM, state: null },
        ]);

        const emma = surface!.rows[0]!;
        expect(emma.resolved).toBe(true);
        expect(emma.resolved_decision_label).toBe("Waitlist");
        expect(emma.state_label).toBe("Waitlist");
        // Operator-facing strings never carry the vocabulary.
        expect(emma.state_label).not.toContain("waitlisted");
        expect(surface!.rows[1]!.state_label).toBe("No path chosen yet");
        expect(surface!.progress.summary).toBe("1 of 2 children decided");
    });

    it("disables a decision that would regress an enrolled child, with a reason", async () => {
        const surface = await project([{ id: "pi-emma", subject_id: EMMA, state: "enrolled" }]);
        const decisions = surface!.rows[0]!.decisions;

        expect(decisions.every((d) => !d.enabled)).toBe(true);
        expect(decisions[0]?.disabled_reason).toContain("already enrolled");
        expect(decisions[0]?.disabled_reason).toContain("Emma");
    });

    it("carries each row's identity for execution without rendering it", async () => {
        const surface = await project([{ id: "pi-emma", subject_id: EMMA, state: null }]);
        const row = surface!.rows[0]!;
        expect(row.customer_member_id).toBe(EMMA);
        expect(row.process_instance_id).toBe("pi-emma");
        expect(row.label).toBe("Emma Rivera");
    });

    it("renders nothing when the work template configures no per-child decisions", async () => {
        const bare = parseStageOperatingPlanV1({
            version: 1,
            lifecycle_key: "enrollment",
            stage_key: "decision",
            journey_segment: "family",
            work_templates: [
                {
                    template_key: "review_child_paths",
                    label: "Review each child's path",
                    required: true,
                    due_policy: { kind: "same_day" },
                    owner_strategy: "record_owner",
                },
            ],
            outcomes: [],
            outcome_rules: [],
            attention_rules: [],
        })!;

        const surface = await projectParticipantDecisionRows({
            supabase: makeSupabase([{ id: "pi-emma", subject_id: EMMA, state: null }]),
            orgId: ORG,
            opportunityId: LEAD,
            plan: bare,
            templateKey: "review_child_paths",
        });
        expect(surface).toBeNull();
    });
});

describe("legacy Decision Split is retired — one implementation only", () => {
    it("removes the legacy endpoint, executor, status resolver and panel", () => {
        for (const rel of [
            "app/api/admin/opportunities/[id]/decision-split/route.ts",
            "lib/opportunities/applyEnrollmentDecisionSplit.ts",
            "lib/businessProcesses/resolveDecisionSplitOutcomeStatusKey.ts",
            "components/admin/opportunity/OpportunityDecisionSplitPanel.tsx",
        ]) {
            expect(existsSync(path.join(WEB, rel)), `${rel} should be deleted`).toBe(false);
        }
    });

    it("stops gating the per-child surface on a hardcoded stage key", () => {
        const overview = readCode("components/admin/vmDrawer/OpportunityDrawerInquiryWorkflowOverview.tsx");
        expect(overview).not.toContain('current_stage_key === "decision"');
        expect(overview).not.toContain("OpportunityDecisionSplitPanel");
        expect(overview).toContain("DecisionCurrentWorkCard");
    });

    it("presents ONE Decision work card, not sibling panels beside it", () => {
        const overview = readCode("components/admin/vmDrawer/OpportunityDrawerInquiryWorkflowOverview.tsx");
        // The two panels that used to sit outside the work item are gone from the tree entirely.
        expect(existsSync(path.join(WEB, "components/admin/opportunity/ParticipantDecisionsPanel.tsx"))).toBe(false);
        expect(existsSync(path.join(WEB, "components/admin/opportunity/FamilyClosePanel.tsx"))).toBe(false);
        expect(overview).not.toContain("ParticipantDecisionsPanel");
        expect(overview).not.toContain("FamilyClosePanel");
        // Exactly one render site.
        expect(overview.split("<DecisionCurrentWorkCard").length - 1).toBe(1);
    });

    it("keeps closing the lead INSIDE the work card, beneath the child paths", () => {
        const card = readCode("components/admin/opportunity/DecisionCurrentWorkCard.tsx");
        const childRows = card.indexOf("data-decision-child-row");
        const closeSection = card.indexOf("data-decision-close-section");
        expect(childRows).toBeGreaterThan(-1);
        expect(closeSection).toBeGreaterThan(childRows);
    });

    it("speaks operator language and never the platform's own vocabulary", () => {
        const card = readCode("components/admin/opportunity/DecisionCurrentWorkCard.tsx");
        /**
         * Only JSX TEXT NODES are operator copy.
         *
         * An earlier version of this check scanned the whole file and failed on `row.resolved` and
         * `all_resolved` — field names the operator never sees. Banning a word from identifiers as
         * well as from copy would force the runtime to be renamed to satisfy a test about wording,
         * which is the tail wagging the dog. So this reads what actually renders.
         */
        const textNodes = [...card.matchAll(/>([^<>{}]+)</g)]
            .map((m) => m[1]!.trim())
            .filter((t) => /[a-z]{3}/.test(t))
            .join(" | ")
            .toLowerCase();

        for (const banned of ["resolved", "participant", "process instance", "disposition"]) {
            expect(textNodes, `"${banned}" must not reach operator copy`).not.toContain(banned);
        }
        // The progress wording itself is the projection's, not the card's — the card renders it.
        // Its exact phrasing is owned by participantDecisionProgress.test.ts.
        expect(card).toContain("{progress.summary}");
    });

    it("keeps the replacement free of OCM lifecycle writes and stage-key branching", () => {
        const seam = readCode("lib/lifecycle/executeParticipantDecisionForChild.ts");
        const panel = readCode("components/admin/opportunity/DecisionCurrentWorkCard.tsx");
        const route = readCode("app/api/admin/lifecycle-builder/participant-decisions/route.ts");

        for (const [name, source] of [
            ["seam", seam],
            ["panel", panel],
            ["route", route],
        ] as const) {
            // No OCM lifecycle status writer anywhere on the new path.
            expect(source, `${name} must not write OCM lifecycle status`).not.toContain(
                "updateOpportunityCustomerMemberLifecycleStatus",
            );
            expect(source, `${name} must not read split rules`).not.toContain("splitRuleForStage");
        }

        // No enrollment vocabulary hardcoded in the runtime: the states and stages arrive from
        // configuration. Checked against the seam, which is the only writer.
        for (const literal of ['"waitlisted"', '"waitlist"', '"enrolling"', '"closed_withdrawn"']) {
            expect(seam, `seam must not hardcode ${literal}`).not.toContain(literal);
        }
        expect(seam).not.toContain('=== "decision"');
    });

    it("keeps the panel free of raw identifiers in operator-visible text", () => {
        const panel = readCode("components/admin/opportunity/DecisionCurrentWorkCard.tsx");
        // Identity is carried — as React keys, data attributes and request fields — but never
        // INTERPOLATED INTO COPY. That distinction is what this asserts: a `{row.x}` sitting in JSX
        // text position, rather than any mention of the field.
        for (const field of ["customer_member_id", "process_instance_id"]) {
            // Constrained to ONE line. `[^}]` matches newlines, so the first version of this
            // pattern ran from an unrelated JSX `>` many lines above down to a prop assignment
            // below and reported a render that does not exist.
            expect(panel, `${field} must not be rendered as text`).not.toMatch(
                new RegExp(`>[^\\n}]*\\{[^\\n}]*${field}[^\\n}]*\\}`),
            );
        }
        // Operator-facing strings come from `label`, `state_label` and configured decision labels.
        expect(panel).toContain("{row.label}");
        expect(panel).toContain("{row.state_label}");
    });
});
