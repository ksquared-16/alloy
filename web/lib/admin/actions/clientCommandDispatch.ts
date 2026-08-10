/**
 * How a work surface hosts a command on the client — resolved from declarations only.
 *
 * ## Why this exists
 *
 * A registered action is provisioned in `action_definitions` with
 * `action_type: 'ui_intent'` and `payload.intent = <key>` — the intent carries the UI
 * hop while the handler lives in the Actions Runtime. The client therefore had to grow
 * a hardcoded `if (actionKey === "…")` branch for every registered action before an
 * operator could invoke it. `send_tour_invitation` was registered in code, provisioned
 * in the database, and still unreachable for the life of the feature because that branch
 * did not exist.
 *
 * A command's client behavior is a property of the command, not of a chain of key
 * comparisons. This module reads that property:
 *
 *   1. The capability declares an `interactionHost` → the operator goes there first.
 *   2. No host, but the Actions Runtime owns execution → call the runtime directly.
 *   3. Neither → nothing is declared, so nothing can run.
 *
 * Case 3 is not a fallback. It returns `undeclared` so the caller refuses out loud;
 * a command that cannot run must never report success.
 *
 * ## Client safety
 *
 * `lib/adminV2/actions/actionRegistry` imports every server-side handler, so the client
 * cannot ask it whether a handler exists. The Platform Capability Registry is pure data
 * and already reaches the client through `canonicalActionRegistry`; its
 * `REGISTERED_ACTION_CAPABILITY_KEYS` is held in sync with `REGISTERED_ACTION_LIST` by
 * `tests/platform/commands/capabilityRegistry.test.ts`. That is the client-safe source.
 */

import { tryResolvePlatformCapability } from "@/lib/platform/commands/capabilityRegistry";
import type { CapabilityComposerChannel } from "@/lib/platform/commands/capabilityTypes";

export type ClientCommandDispatch =
    /** POST the canonical Actions Runtime; success comes from the server envelope. */
    | { kind: "actions_runtime"; actionKey: string }
    /** Open Communications compose — the operator writes and sends. */
    | { kind: "communications_composer"; actionKey: string; defaultChannel: CapabilityComposerChannel }
    /** A host the client has not wired yet, or no declaration at all. */
    | { kind: "undeclared" };

/**
 * Resolve the client host for a command key.
 *
 * Never throws. `resolvePlatformCapability` throws on unknown keys outside production,
 * which would turn an operator-invented or not-yet-classified key into a crash instead
 * of a refusal — so this uses the non-throwing resolver deliberately.
 */
export function resolveClientCommandDispatch(actionKey: string): ClientCommandDispatch {
    const key = (actionKey ?? "").trim();
    if (!key) return { kind: "undeclared" };

    const resolved = tryResolvePlatformCapability(key);
    if (resolved.status !== "known") return { kind: "undeclared" };
    const capability = resolved.capability;

    // A declared host wins over the execution owner: the operator goes to the host,
    // which owns whether and when the runtime is ultimately called.
    if (capability.interactionHost === "communications_composer") {
        return {
            kind: "communications_composer",
            actionKey: capability.registeredActionKey ?? capability.canonicalCommandKey,
            defaultChannel: capability.composerDefaultChannel ?? "email",
        };
    }
    if (capability.interactionHost) {
        // inline_form / header_delegate / form_delivery are hosted by surfaces that
        // resolve them before reaching generic dispatch. Claiming them here would
        // route a command to the runtime that the operator has not filled in yet.
        return { kind: "undeclared" };
    }

    if (
        capability.executionOwner === "registered_action" &&
        capability.maturity === "executable" &&
        capability.registeredActionKey
    ) {
        return { kind: "actions_runtime", actionKey: capability.registeredActionKey };
    }

    return { kind: "undeclared" };
}
