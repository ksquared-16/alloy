/**
 * THE LAST HOP — a configured action that renders as a control instead of vanishing.
 *
 * `stage_work.start` was a production capability, a registered adminV2 action, process-selected in
 * the tenant's command set, and configured against the Waitlist stage with its work template bound.
 * It still could not appear, and the platform's own diagnostic said why:
 *
 *   configured_command_not_registered — "stage_work.start" did not resolve to a registered action
 *   for this stage.
 *
 * The chain ends here. `resolveCurrentWorkActionSurface` asks `canonicalActionDefinition(key)`, and
 * canonical definitions are DERIVED from `ACTION_BUTTON_LIBRARY`. With no entry there the lookup
 * returned null, no `resolved` handler was attached to a config-ref action either, and the resolver
 * correctly refused to guess: it returns `unsupported`, which the surface treats as a configuration
 * error and drops. That refusal is deliberate no-op prevention — an action with no resolvable
 * capability must never present as executable — so the fix is to make the capability resolvable,
 * never to weaken the guard.
 *
 * `header_delegate` is declared as METADATA rather than inferred from the key, which is what that
 * field exists for. The operator supplies nothing: the work template comes from configuration and
 * travels in the invocation payload.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { canonicalActionDefinition } from "@/lib/admin/actions/canonicalActionRegistry";
import { resolveCurrentWorkActionSurface } from "@/lib/adminV2/runtime/focusPanel/currentWork/resolveCurrentWorkActionSurface";
import {
    isCurrentWorkActionExecutable,
    resolveCurrentWorkActionExecution,
} from "@/lib/adminV2/runtime/focusPanel/currentWork/executeCurrentWorkAction";
import type { CurrentWorkActionVM } from "@/lib/adminV2/runtime/focusPanel/currentWork/currentWorkSurfaceTypes";

const KEY = "stage_work.start";

/** The action exactly as a configured stage ref produces it — `resolved` is null on that path. */
function configuredAction(over: Partial<CurrentWorkActionVM> = {}): CurrentWorkActionVM {
    return {
        key: KEY,
        label: "Start stage work",
        category: "supporting",
        placement: "current_work_supporting",
        handlerKey: KEY,
        actionRef: KEY,
        resolved: null,
        workTemplateKey: "offer_spot",
        ...over,
    } as CurrentWorkActionVM;
}

describe("stage_work.start resolves as an executable control", () => {
    it("has a canonical definition, derived from the action library", () => {
        const def = canonicalActionDefinition(KEY);
        expect(def, "without this the surface classifies the action unsupported").not.toBeNull();
        expect(def!.runtimeWired).toBe(true);
    });

    it("declares its interaction host as metadata, not by name", () => {
        /*
         * CONTRACT CHANGED DELIBERATELY. This first declared `header_delegate`, which made the
         * action resolvable and therefore visible — the fix that closed the fifth layer. Driving it
         * live then showed the host was wrong: the drawer header is opportunity-scoped and carries
         * no child-subject command, so pressing the control produced "use drawer header actions"
         * for an action the header does not have.
         *
         * `command_surface` is the host for a command whose subject and inputs are already
         * resolved. Metadata either way; the value is what changed, not how it is declared.
         */
        expect(canonicalActionDefinition(KEY)!.interactionHost).toBe("command_surface");
    });

    it("resolves to the command surface, where a resolved command runs", () => {
        expect(resolveCurrentWorkActionSurface(configuredAction())).toBe("command_surface");
    });

    it("is EXECUTABLE — the property that was false and made it invisible", () => {
        const action = configuredAction();
        expect(resolveCurrentWorkActionExecution(action).status).toBe("executable");
        expect(isCurrentWorkActionExecutable(action)).toBe(true);
    });

    it("still refuses to present when configuration blocked it", () => {
        // Executability must come from the capability resolving, never from ignoring a blocker.
        const blocked = configuredAction({ disabled: true, disabledReason: "Not available here." });
        expect(isCurrentWorkActionExecutable(blocked)).toBe(false);
    });

    it("the no-op guard is intact — an unresolvable action is still unsupported", () => {
        /*
         * The fix must not have widened the fallback. An action with no canonical definition and no
         * resolved handler must still refuse, or every misspelt config ref becomes a dead button.
         */
        const unknown = configuredAction({ key: "not_a_real_capability", handlerKey: "not_a_real_capability", actionRef: "not_a_real_capability" });
        expect(resolveCurrentWorkActionSurface(unknown)).toBe("unsupported");
        expect(isCurrentWorkActionExecutable(unknown)).toBe(false);
    });

    it("is not offered as a layout library button, where it would have no work to start", () => {
        // It is authored per stage against that stage's own work, not placed from the library.
        expect(canonicalActionDefinition(KEY)!.settingsConfigurable).toBe(false);
    });
});

/**
 * A BUTTON SAYS WHAT IT STARTS.
 *
 * The capability's own label is "Start stage work" — the right name for the generic thing it does,
 * and the wrong name on a control. A stage may configure several startable templates, and they would
 * all render identically: two or three buttons reading "Start stage work", with nothing to say which
 * starts the offer and which starts the packet.
 *
 * The label is taken from the stage's own plan rather than authored a second time, so renaming a
 * work template renames its control and the two cannot drift apart.
 */
describe("a configured start action is labelled by the work it starts", () => {
    const src = () =>
        readFileSync(
            resolve(__dirname, "../..", "lib/adminV2/runtime/focusPanel/currentWork/resolveCurrentWorkTemplateFromPublishedPlan.ts"),
            "utf8",
        );

    it("derives the label from the bound work template", () => {
        expect(src()).toContain("workLabelByKey");
        expect(src()).toContain("operatingPlan?.work_templates");
    });

    it("lets an explicit override win, and falls back to the capability label", () => {
        // Precedence stated once: authored override, then the bound work's name, then nothing —
        // at which point the capability's own generic label still applies downstream.
        expect(src()).toContain("row.override_label?.trim() || boundLabel || undefined");
    });

    it("names no work key — the mapping is built from configuration", () => {
        const code = src()
            .split("\n")
            .filter((l) => !l.trim().startsWith("*") && !l.trim().startsWith("//") && !l.includes("/*"))
            .join("\n");
        for (const forbidden of ["offer_spot", "review_waitlist_position"]) {
            expect(code, `must not name "${forbidden}"`).not.toContain(forbidden);
        }
    });
});
