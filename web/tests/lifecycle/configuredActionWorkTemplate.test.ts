/**
 * A CONFIGURED ACTION MAY NAME THE WORK IT STARTS — the argument that had nowhere to travel.
 *
 * `stage_work.start` is a production capability, deliberately generic: it takes the work template as
 * an INPUT so it needs no `offer_spot` button of its own, and it refuses correctly against
 * configuration. What it required was a `template_key`, and nothing in the configuration vocabulary
 * could carry one — not `StageCandidateAction`, not the work-template action ref, not the action view
 * model, and the invoke path hardcoded `payload: {}`.
 *
 * So on the staging tenant `offer_spot` sat fully configured — its own outcomes, its own rules, its
 * own transition to Enrolling — with nothing anywhere that could start it. The offer flow read as
 * working right up until someone looked for the control, and the Enrolling lane was honestly empty
 * because no child could ever get there.
 *
 * These tests pin the slot end to end: configuration carries the key, the runtime carries it to the
 * control, and the invoke path sends it. Each hop is asserted separately, because the argument was
 * lost at a different hop than the one anybody suspected.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
    parseStageActionCatalogV1,
    validateCandidateActionWorkTemplates,
    type StageCandidateAction,
} from "@/lib/lifecycle/stageActionCatalogV1";
import { actionsFromConfigRefs } from "@/lib/adminV2/runtime/focusPanel/currentWork/classifyCurrentWorkActions";

const root = resolve(__dirname, "../..");
const read = (rel: string) => readFileSync(resolve(root, rel), "utf8");

describe("configured action → work template", () => {
    it("parses the work template a configured action operates on", () => {
        const parsed = parseStageActionCatalogV1({
            version: 1,
            candidate_actions: [
                { action_key: "stage_work.start", recommendation: "ready", work_template_key: " offer_spot " },
            ],
        });
        expect(parsed?.candidate_actions[0]).toEqual({
            action_key: "stage_work.start",
            recommendation: "ready",
            work_template_key: "offer_spot",
        });
    });

    it("omits the key rather than storing an empty one", () => {
        // Absent and "present but blank" must not be the same stored value: a blank key would reach
        // the action as a missing argument and refuse, which is the failure this slot removes.
        const parsed = parseStageActionCatalogV1({
            version: 1,
            candidate_actions: [{ action_key: "a", recommendation: "ready", work_template_key: "   " }],
        });
        expect(parsed?.candidate_actions[0]).not.toHaveProperty("work_template_key");
    });

    it("leaves actions that take no work template untouched", () => {
        const parsed = parseStageActionCatalogV1({
            version: 1,
            candidate_actions: [{ action_key: "send_form", recommendation: "recommended" }],
        });
        expect(parsed?.candidate_actions[0]).toEqual({ action_key: "send_form", recommendation: "recommended" });
    });

    /* ------------------------------------------------------------ authoring refusal */

    it("refuses an action pointing at work this stage does not produce", () => {
        const actions: StageCandidateAction[] = [
            { action_key: "stage_work.start", recommendation: "ready", work_template_key: "offer_spot" },
        ];
        const refusals = validateCandidateActionWorkTemplates(actions, ["review_waitlist_position"]);

        expect(refusals).toHaveLength(1);
        expect(refusals[0]!.code).toBe("unknown_work_template");
        // Operator-meaningful: it says what this stage DOES produce.
        expect(refusals[0]!.detail).toContain("review_waitlist_position");
    });

    it("accepts work the stage produces, and ignores actions with no template", () => {
        const actions: StageCandidateAction[] = [
            { action_key: "stage_work.start", recommendation: "ready", work_template_key: "offer_spot" },
            { action_key: "send_form", recommendation: "ready" },
        ];
        expect(validateCandidateActionWorkTemplates(actions, ["offer_spot", "review_waitlist_position"])).toEqual([]);
    });

    it("says so plainly when the stage has no work at all", () => {
        const actions: StageCandidateAction[] = [
            { action_key: "stage_work.start", recommendation: "ready", work_template_key: "offer_spot" },
        ];
        expect(validateCandidateActionWorkTemplates(actions, [])[0]!.detail).toContain("no work configured");
    });

    /* ------------------------------------------------------------ the hops */

    it("carries the key onto the action the operator sees", () => {
        const lookup = new Map([["stage_work.start", { key: "stage_work.start", label: "Start stage work" }]]);
        const actions = actionsFromConfigRefs(
            [{ action_ref: "stage_work.start", work_template_key: "offer_spot" }],
            lookup,
            "supporting",
            "current_work_supporting",
        );

        expect(actions).toHaveLength(1);
        expect(actions[0]!.workTemplateKey).toBe("offer_spot");
    });

    it("leaves the key absent when configuration named none", () => {
        const lookup = new Map([["send_form", { key: "send_form", label: "Send Form" }]]);
        const actions = actionsFromConfigRefs(
            [{ action_ref: "send_form" }],
            lookup,
            "supporting",
            "current_work_supporting",
        );
        expect(actions[0]!.workTemplateKey).toBeUndefined();
    });

    it("THE INVOKE PATH SENDS IT — payload is no longer hardcoded empty", () => {
        /*
         * The last hop, and the one that made every earlier hop pointless. This was `payload: {}`,
         * so an action whose contract requires an input could be configured, resolved, rendered and
         * pressed — and would then refuse, because the one thing it needed never travelled.
         */
        const src = read("components/admin/focusPanel/cards/CurrentWorkCard.tsx");
        expect(src).toContain("action.workTemplateKey ? { template_key: action.workTemplateKey } : {}");
        expect(src).not.toMatch(/payload: \{\},\n\s*workflow_id/);
    });

    it("the plan ref can hold the key, so it survives the journey", () => {
        const src = read("lib/adminV2/runtime/focusPanel/currentWork/resolveCurrentWorkTemplateFromPublishedPlan.ts");
        expect(src).toContain("candidate.work_template_key");
    });

    /* ------------------------------------------------------------ authoring surface */

    it("Settings can author it, from the stage's own work", () => {
        const editor = read("components/adminV2/settings/lifecycle/StageStartableWorkEditor.tsx");
        expect(editor).toContain("workTemplates");
        expect(editor).toContain("work_template_key: templateKey");
        // The primary work is excluded: entry already opens it, so a control to start it could only
        // ever report "already running".
        expect(editor).toContain("t.primary !== true");
    });

    it("the editor names no tenant key — only the platform's own action", () => {
        const editor = read("components/adminV2/settings/lifecycle/StageStartableWorkEditor.tsx");
        const code = editor
            .split("\n")
            .filter((l) => !l.trim().startsWith("*") && !l.trim().startsWith("//") && !l.includes("/*"))
            .join("\n");
        for (const forbidden of ["offer_spot", "waitlist", "review_waitlist_position", "enrolling"]) {
            expect(code, `the editor must not name "${forbidden}"`).not.toContain(forbidden);
        }
        // `stage_work.start` is the platform naming its OWN capability, which is allowed.
        expect(code).toContain("stage_work.start");
    });

    it("the editor is mounted in the stage editor", () => {
        expect(read("components/adminV2/settings/lifecycle/StageEditorV2.tsx")).toContain("StageStartableWorkEditor");
    });
});

/**
 * A CONFIGURATION SURFACE THAT CANNOT BE SAVED IS WORSE THAN ONE THAT IS MISSING.
 *
 * Candidate actions were written on every save but never compared against the committed baseline,
 * so changing only them left `isDirty` false and Save disabled. The section rendered, the checkbox
 * moved, and the one control that could persist it stayed greyed out — a surface that looks finished
 * and silently does nothing. Found by driving the real editor on staging, not by reading the code.
 */
describe("the stage editor can save a configured action", () => {
    const editor = () => read("components/adminV2/settings/lifecycle/StageEditorV2.tsx");

    it("counts candidate actions as an edit", () => {
        expect(editor()).toContain("candidateActionsFingerprint(candidateActions) !== savedV2.candidateActions");
    });

    it("moves the committed baseline with the record and with a successful save", () => {
        const src = editor();
        // Three places must agree, or Save is either dead or permanently lit: the initial baseline,
        // the stage-switch reset, and the post-save commit.
        expect(src.match(/candidateActions: candidateActionsFingerprint\(/g) ?? []).toHaveLength(3);
    });

    it("fingerprints order-insensitively", () => {
        // Ticking two work items in the other order is the same configuration; treating it as
        // different would leave Save lit with nothing to save.
        expect(editor()).toContain(".sort()");
    });
});
