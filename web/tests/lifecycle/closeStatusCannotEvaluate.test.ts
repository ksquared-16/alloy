/**
 * "Cannot evaluate" is not "invalid".
 *
 * The transition close check used to fire whenever its guard was skipped — which includes the case
 * where a status IS named but the caller could not supply the status catalog. Publish validation
 * never supplies it, deliberately, and says so two hundred lines above the family-close branch that
 * honours the rule: "`undefined` means 'cannot evaluate', so status-domain checks are skipped rather
 * than guessed from an empty list."
 *
 * The consequence was total: EVERY closing transition in EVERY tenant failed publication, whatever
 * status it named, and no configuration change could clear it. The certification tenant's three
 * "Close as Lost" paths were unfixable for that reason, not because `lost` was wrong.
 *
 * Closing with NO status stays an error — that one is decidable without the catalog, because there
 * is nothing to look up.
 */

import { describe, expect, it } from "vitest";
import { validateStageOperatingPlanOperatingContract } from "@/lib/lifecycle/validateStageOperatingPlanOperatingContract";
import type { StageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";

const CLOSE_ISSUE = "transition_close_status_invalid";

function plan(transition: Record<string, unknown>): StageOperatingPlanV1 {
    return {
        version: 1,
        stage_key: "tour",
        outcomes: [],
        outcome_rules: [],
        attention_rules: [],
        work_templates: [],
        outgoing_transitions: [
            { transition_ref: "tour_to_closed", source_stage_key: "tour", target_stage_key: "closed", label: "Close as Lost", available: true, ...transition },
        ],
    } as unknown as StageOperatingPlanV1;
}

const issues = (p: StageOperatingPlanV1, configuredStatuses?: never[]) =>
    validateStageOperatingPlanOperatingContract({
        plan: p,
        processStageKeys: ["tour", "closed"],
        ...(configuredStatuses !== undefined ? { configuredStatuses } : {}),
    }).filter((i) => i.code === CLOSE_ISSUE);

describe("a named status with no catalog is unevaluated, not invalid", () => {
    it("does not report a closing transition that names a status", () => {
        expect(issues(plan({ closes_record: true, status_key: "lost" }))).toHaveLength(0);
    });

    it("reports a closing transition that names none", () => {
        // Decidable without the catalog: there is nothing to look up.
        expect(issues(plan({ closes_record: true }))).toHaveLength(1);
    });

    it("leaves a non-closing transition alone either way", () => {
        expect(issues(plan({ status_key: "open" }))).toHaveLength(0);
        expect(issues(plan({}))).toHaveLength(0);
    });
});

describe("with a catalog, the real check still runs", () => {
    it("reports a closing status the catalog does not have as closed", () => {
        // An empty catalog is a real answer — "there are none" — unlike undefined.
        const withEmptyCatalog = validateStageOperatingPlanOperatingContract({
            plan: plan({ closes_record: true, status_key: "lost" }),
            processStageKeys: ["tour", "closed"],
            configuredStatuses: [],
        }).filter((i) => i.code === CLOSE_ISSUE || i.code === "transition_status_noncanonical");
        expect(withEmptyCatalog.length).toBeGreaterThan(0);
    });
});
