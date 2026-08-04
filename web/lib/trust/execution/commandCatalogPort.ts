/**
 * Command catalog port — the narrowest question Trust may ask about a command.
 *
 * Trust must not own, duplicate or import the Operational Command Registry. It
 * needs four facts to decide whether a proposed binding is even coherent, and
 * this port exposes exactly those four and nothing else. Everything else —
 * permissions, eligibility, inputs, preview, execution — stays with the command
 * runtime and is evaluated AFTER the Trust binding gate.
 *
 * The port is injected. `lib/trust` ships no production implementation; the
 * adapter lives with the registry it adapts, at
 * `lib/platform/commands/trust/trustCommandCatalogAdapter.ts`, and depends
 * inward on both sides without creating a cycle.
 *
 * @see docs/platform/planning/trust-adoption/TRUST-PLATFORM-ADOPTION-ASSESSMENT.md — Slice 0.5
 */

/**
 * What the catalog tells Trust about one command.
 *
 * Deliberately absent: input schemas, permission keys, eligibility rules,
 * handlers, routes, execution owners' internals. Trust has no use for them and
 * holding them would make it a second registry.
 */
export type TrustCommandDescription = {
    /** Canonical key after alias resolution. May differ from the key asked for. */
    readonly canonical_command_key: string;
    /** Entity types this command can act on. Empty means the command takes no subject. */
    readonly supported_subject_types: readonly string[];
    /** Whether the command runtime requires an explicit operator confirmation. */
    readonly confirmation_required: boolean;
    /**
     * Whether this command may be proposed by a Decision Package at all.
     *
     * A command being executable is not the same as it being safe to originate
     * from reasoning. The catalog owner decides; Trust only reads the answer.
     */
    readonly accepts_trust_proposals: boolean;
    /** Optional version or schema fingerprint, for auditability. */
    readonly catalog_version: string | null;
};

/**
 * The injected port.
 *
 * One method, synchronous, total: an unknown key returns `null` rather than
 * throwing, because "this command does not exist" is a refusal the evaluator
 * must report, not an exception.
 */
export type TrustCommandCatalogPort = {
    readonly key: string;
    describe(commandKey: string): TrustCommandDescription | null;
};

/**
 * A catalog that knows nothing.
 *
 * Not a stub standing in for a missing capability — it is the correct port for
 * a caller that has no catalog, and it makes every binding refuse with
 * `command_unknown`. Failing closed is the only safe default.
 */
export function createEmptyTrustCommandCatalog(): TrustCommandCatalogPort {
    return {
        key: "empty_v1",
        describe: () => null,
    };
}
