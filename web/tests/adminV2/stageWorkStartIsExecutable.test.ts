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
        expect(canonicalActionDefinition(KEY)!.interactionHost).toBe("header_delegate");
    });

    it("resolves to the header host, where a registry action is invoked", () => {
        expect(resolveCurrentWorkActionSurface(configuredAction())).toBe("header_delegate");
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
