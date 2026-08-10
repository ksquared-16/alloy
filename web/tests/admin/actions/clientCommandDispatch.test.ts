/**
 * The client resolves a command's host from its declaration, never from its name.
 *
 * Registered actions are provisioned as `ui_intent` with the key in `payload.intent`,
 * so before this seam existed each one needed a hardcoded `if (actionKey === …)` branch
 * in the client before an operator could invoke it at all. `send_tour_invitation` was
 * registered in code and provisioned in the database and still unreachable, because
 * nobody wrote the branch.
 *
 * What is asserted here is the resolution rule, not a list of keys: a declared host
 * wins, an undeclared registered action goes to the Actions Runtime, and anything the
 * platform cannot classify resolves to `undeclared` so the caller refuses out loud.
 */
import { describe, expect, it } from "vitest";
import { resolveClientCommandDispatch } from "@/lib/admin/actions/clientCommandDispatch";
import {
    REGISTERED_ACTION_CAPABILITY_KEYS,
    getPlatformCapability,
} from "@/lib/platform/commands/capabilityRegistry";

describe("resolveClientCommandDispatch", () => {
    it("sends a registered action with no declared host to the Actions Runtime", () => {
        expect(resolveClientCommandDispatch("confirm_tour")).toEqual({
            kind: "actions_runtime",
            actionKey: "confirm_tour",
        });
    });

    it("lets a declared interaction host win over direct execution", () => {
        // send_tour_invitation is equally a registered action; the declaration is what
        // decides where the operator goes, so the two must not resolve the same way.
        expect(resolveClientCommandDispatch("send_tour_invitation")).toEqual({
            kind: "communications_composer",
            actionKey: "send_tour_invitation",
            defaultChannel: "email",
        });
    });

    it("reaches every registered action without naming any of them", () => {
        // The point of the seam: adding a registered action must not require a client
        // change. If a key here resolves to `undeclared`, it is unreachable by operators.
        const unreachable = REGISTERED_ACTION_CAPABILITY_KEYS.filter(
            (key) => resolveClientCommandDispatch(key).kind === "undeclared"
        );
        expect(unreachable).toEqual([]);
    });

    it("carries the registered action key, not the placement key", () => {
        for (const key of REGISTERED_ACTION_CAPABILITY_KEYS) {
            const dispatch = resolveClientCommandDispatch(key);
            if (dispatch.kind === "undeclared") continue;
            expect(dispatch.actionKey).toBe(getPlatformCapability(key)?.registeredActionKey);
        }
    });

    it.each([
        ["an operator-invented key", "operator_invented_key"],
        ["a key that only exists in config", "some_future_command"],
        ["an empty key", ""],
        ["whitespace", "   "],
    ])("resolves %s to undeclared instead of throwing", (_label, key) => {
        // The capability registry throws on unknown keys outside production. Going
        // through the non-throwing resolver is what keeps an unknown key a refusal
        // rather than a crashed menu click.
        expect(() => resolveClientCommandDispatch(key)).not.toThrow();
        expect(resolveClientCommandDispatch(key).kind).toBe("undeclared");
    });

    it("does not claim hosts the client has not wired", () => {
        // inline_form / form_delivery / header_delegate are resolved by their surfaces
        // before generic dispatch. Treating them as runnable here would fire a command
        // the operator has not filled in yet.
        expect(resolveClientCommandDispatch("schedule_tour").kind).toBe("undeclared");
    });
});
