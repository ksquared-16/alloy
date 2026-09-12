/**
 * STAGE ACTIONS AND WORK ACTIONS COMPOSE — neither scope may erase the other.
 *
 * Explicit Work Template `helpful_actions` used to REPLACE the stage's configured actions. Worse,
 * `helpful_actions_explicit` was set on BOTH branches of the producer, so "the template said
 * nothing" and "the template said these four" were treated identically: in both cases the stage's
 * actions vanished. The stage's own list was computed and never even carried onto the overlay.
 *
 * That silently erased valid configuration. On the staging tenant the Waitlist stage configured
 * `stage_work.start(offer_spot)` — validated, persisted, published, revision 30 — and it never
 * appeared, because `review_waitlist_position` happened to declare four helpful actions of its own.
 * An operator had authored a control that the runtime discarded without a word.
 *
 * The two scopes answer different questions. A STAGE action is useful because of where the subject
 * IS; a WORK action is useful because of what is being DONE right now. Neither refines the other.
 *
 * The subtle half is identity. An action that takes an INPUT is not one operator intent but a family
 * of them: `stage_work.start(offer_spot)` and `stage_work.start(send_packet)` are different things
 * to do. Deduping by capability key alone would delete one of them, so identity is the platform's
 * own intent key PLUS the binding — and never a stringify of the row, because a label is
 * presentation and must not decide whether two configurations are the same action.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
    configuredActionIdentity,
    resolvedHelpfulActionRefs,
    type CurrentWorkTemplateActionRefConfig,
    type CurrentWorkTemplateConfigOverlay,
} from "@/lib/adminV2/runtime/focusPanel/currentWork/currentWorkTemplateConfig";

const read = (rel: string) => readFileSync(resolve(__dirname, "../..", rel), "utf8");

/** The staging tenant's shape: four work actions, one stage action bound to its own work. */
function overlay(over: Partial<CurrentWorkTemplateConfigOverlay> = {}): CurrentWorkTemplateConfigOverlay {
    return {
        helpful_actions: [
            { action_ref: "send_tour_invitation" },
            { action_ref: "schedule_tour" },
            { action_ref: "add_family_member" },
            { action_ref: "send_form" },
        ],
        helpful_actions_explicit: true,
        stage_actions: [{ action_ref: "stage_work.start", work_template_key: "offer_spot" }],
        ...over,
    } as CurrentWorkTemplateConfigOverlay;
}

const refs = (r: CurrentWorkTemplateActionRefConfig[] | undefined) => (r ?? []).map((x) => x.action_ref);

describe("stage + work action composition", () => {
    it("1. a stage action survives explicit work-template helpful actions", () => {
        const composed = resolvedHelpfulActionRefs(overlay()) ?? [];
        expect(composed.map(configuredActionIdentity)).toContain("stage_work.start::offer_spot");
    });

    it("2. the work-template actions survive too", () => {
        expect(refs(resolvedHelpfulActionRefs(overlay()))).toEqual([
            "send_tour_invitation",
            "schedule_tour",
            "add_family_member",
            "send_form",
            "stage_work.start",
        ]);
    });

    it("3. an exact duplicate binding appears once", () => {
        const composed = resolvedHelpfulActionRefs(
            overlay({
                helpful_actions: [{ action_ref: "stage_work.start", work_template_key: "offer_spot" }],
                stage_actions: [{ action_ref: "stage_work.start", work_template_key: "offer_spot" }],
            }),
        );
        expect(composed).toHaveLength(1);
    });

    it("4. the work-template binding wins an exact collision", () => {
        // More specific: authored against this particular work, and may carry different input.
        const composed = resolvedHelpfulActionRefs(
            overlay({
                helpful_actions: [
                    { action_ref: "stage_work.start", work_template_key: "offer_spot", override_label: "From work" },
                ],
                stage_actions: [
                    { action_ref: "stage_work.start", work_template_key: "offer_spot", override_label: "From stage" },
                ],
            }),
        );
        expect(composed?.[0]?.override_label).toBe("From work");
    });

    it("5. the same capability bound to DIFFERENT work stays two actions", () => {
        /*
         * The identity trap. Deduping by capability key alone would collapse these into one, and an
         * operator who configured two startable work items would silently lose one of them.
         */
        const composed = resolvedHelpfulActionRefs(
            overlay({
                helpful_actions: [{ action_ref: "stage_work.start", work_template_key: "send_packet" }],
                stage_actions: [{ action_ref: "stage_work.start", work_template_key: "offer_spot" }],
            }),
        );
        expect(composed?.map(configuredActionIdentity)).toEqual([
            "stage_work.start::send_packet",
            "stage_work.start::offer_spot",
        ]);
    });

    it("6. order is configured order — work first, then stage, never sorted", () => {
        const composed = refs(
            resolvedHelpfulActionRefs(
                overlay({
                    helpful_actions: [{ action_ref: "zeta_action" }, { action_ref: "alpha_action" }],
                    stage_actions: [{ action_ref: "middle_action" }],
                }),
            ),
        );
        // Alphabetising would give alpha, middle, zeta — configuration order is an authored fact.
        expect(composed).toEqual(["zeta_action", "alpha_action", "middle_action"]);
    });

    it("collapses an alias onto its canonical intent, using the platform's own identity", () => {
        // `waitlist_child` is an alias of the `move_to_waitlist` intent. Composition must not offer
        // the operator the same intent twice under two spellings.
        const composed = resolvedHelpfulActionRefs(
            overlay({
                helpful_actions: [{ action_ref: "move_to_waitlist" }],
                stage_actions: [{ action_ref: "waitlist_child" }],
            }),
        );
        expect(composed).toHaveLength(1);
        expect(composed?.[0]?.action_ref).toBe("move_to_waitlist");
    });

    it("keeps absent and empty distinguishable", () => {
        // An absent list is not an empty one; callers branch on `undefined`.
        expect(resolvedHelpfulActionRefs(null)).toBeUndefined();
        expect(resolvedHelpfulActionRefs({} as CurrentWorkTemplateConfigOverlay)).toBeUndefined();
        expect(
            resolvedHelpfulActionRefs({
                helpful_actions: [],
                helpful_actions_explicit: true,
            } as unknown as CurrentWorkTemplateConfigOverlay),
        ).toEqual([]);
    });

    it("ignores a ref with no action key when composing, rather than emitting a blank control", () => {
        // Only on the composition path. With no stage actions the work list is returned exactly as
        // configuration named it, which is the pre-existing contract and not this rule's business.
        const composed = resolvedHelpfulActionRefs(
            overlay({
                helpful_actions: [{ action_ref: "  " }, { action_ref: "send_form" }],
                stage_actions: [{ action_ref: "stage_work.start", work_template_key: "offer_spot" }],
            }),
        );
        expect(refs(composed)).toEqual(["send_form", "stage_work.start"]);
    });

    /* ------------------------------------------------------------ the carry, and genericity */

    it("the producer carries the stage's actions onto the overlay at all", () => {
        // Computed all along and never assigned — which is why a published stage action could not
        // reach an operator no matter what the composition rule said.
        const src = read("lib/adminV2/runtime/focusPanel/currentWork/resolveCurrentWorkTemplateFromPublishedPlan.ts");
        expect(src).toContain("templateConfig.stage_actions = catalogActions.supporting");
        expect(src).toContain("row.work_template_key");
    });

    it("7. the generic resolver names no process, stage or work", () => {
        const src = read("lib/adminV2/runtime/focusPanel/currentWork/currentWorkTemplateConfig.ts");
        const code = src
            .split("\n")
            .filter((l) => !l.trim().startsWith("*") && !l.trim().startsWith("//") && !l.includes("/*"))
            .join("\n");
        for (const forbidden of ["offer_spot", "waitlist", "enrollment", "review_waitlist_position", "tour"]) {
            expect(code.toLowerCase(), `the resolver must not name "${forbidden}"`).not.toContain(forbidden);
        }
    });

    it("identity is the platform's intent key plus the binding, not a stringify", () => {
        const src = read("lib/adminV2/runtime/focusPanel/currentWork/currentWorkTemplateConfig.ts");
        expect(src).toContain("normalizeActionRefToIntentKey");
        expect(src).not.toContain("JSON.stringify");
        // A label must never decide whether two configurations are the same action.
        expect(
            configuredActionIdentity({ action_ref: "a", work_template_key: "w", override_label: "One" }),
        ).toBe(configuredActionIdentity({ action_ref: "a", work_template_key: "w", override_label: "Two" }));
    });

    it("8. the bound input reaches execution", () => {
        // Proven end to end by `configuredActionWorkTemplate`; asserted here so the composition
        // rule cannot be changed in a way that drops the binding on its way through.
        const src = read("components/admin/focusPanel/cards/CurrentWorkCard.tsx");
        expect(src).toContain("action.workTemplateKey ? { template_key: action.workTemplateKey } : {}");
    });
});
