/**
 * Config alignment (Phase 5).
 *
 * Configured actions (action_definitions / placements / record_actions) may only
 * reference *known* action keys. Unknown keys are a configuration error:
 *  - In dev/test: fail loudly (throw) so broken config never ships.
 *  - In production: warn and treat as disabled so menus never render broken actions.
 *
 * Config controls presentation + constraints. It cannot introduce executable behavior
 * for an unregistered key.
 */

import { isKnownActionKey, resolveActionKey } from "@/lib/adminV2/actions/actionRegistry";

export type ConfiguredActionValidation = {
    actionKey: string;
    ok: boolean;
    /** "registered" = executable handler; "known_metadata_only" = catalog stub; "unknown" = invalid config. */
    resolution: "registered" | "known_metadata_only" | "unknown";
    reason?: string;
};

function isStrictEnv(): boolean {
    const env = process.env.NODE_ENV;
    return env !== "production";
}

/** Validate a single configured action key. */
export function validateConfiguredActionKey(actionKey: string): ConfiguredActionValidation {
    const resolution = resolveActionKey(actionKey);
    if (resolution.status === "unknown") {
        return {
            actionKey,
            ok: false,
            resolution: "unknown",
            reason: `Configured action references unknown key "${actionKey}".`,
        };
    }
    return { actionKey, ok: true, resolution: resolution.status };
}

/**
 * Assert that a configured key is known. Throws in dev/test; warns in production.
 * Use when loading/seeding config to fail fast on broken references.
 */
export function assertConfiguredActionKeyRegistered(actionKey: string): void {
    if (isKnownActionKey(actionKey)) return;
    const message = `Configured action references unknown key "${actionKey}". ` +
        `Register a handler in web/lib/adminV2/actions/ or add it to the canonical catalog before configuring it.`;
    if (isStrictEnv()) {
        throw new Error(message);
    }
    console.warn(`[actions/config] ${message}`);
}

/**
 * Validate a list of configured keys. Returns only the invalid ones. In dev/test,
 * throws if any are unknown (aggregated message).
 */
export function assertConfiguredActionKeys(actionKeys: readonly string[]): ConfiguredActionValidation[] {
    const invalid = actionKeys.map(validateConfiguredActionKey).filter((v) => !v.ok);
    if (invalid.length > 0 && isStrictEnv()) {
        throw new Error(
            `Configured actions reference unknown keys: ${invalid.map((v) => v.actionKey).join(", ")}.`
        );
    }
    if (invalid.length > 0) {
        console.warn(`[actions/config] ${invalid.length} configured action(s) reference unknown keys.`);
    }
    return invalid;
}

/**
 * UI gating helper: partition configured keys into renderable vs disabled. Unknown keys
 * should be hidden or shown disabled — never rendered as working actions.
 */
export function partitionConfiguredActionKeys(actionKeys: readonly string[]): {
    renderable: string[];
    disabled: string[];
} {
    const renderable: string[] = [];
    const disabled: string[] = [];
    for (const key of actionKeys) {
        if (isKnownActionKey(key)) renderable.push(key);
        else disabled.push(key);
    }
    return { renderable, disabled };
}
