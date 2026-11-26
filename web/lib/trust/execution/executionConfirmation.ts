/**
 * Execution confirmation — proof that an operator reviewed THIS package and
 * THIS proposed command.
 *
 * A confirmation is constructed from an already-resolved server actor. There is
 * no path that accepts an actor identity from a request body: the constructor
 * takes the server context, and the evaluator additionally re-checks the
 * confirmation's actor against the server actor it is handed. A client may
 * supply a fingerprint, but it is only ever compared against one recomputed
 * from the authoritative package — it can never stand in for it.
 *
 * No UI. This slice ships the contract and its verification; the surface that
 * collects a confirmation is Phase 3's.
 *
 * @see docs/platform/planning/trust-adoption/TRUST-PLATFORM-ADOPTION-ASSESSMENT.md — Slice 0.5
 */

import { fingerprintsMatch } from "@/lib/trust/execution/decisionPackageFingerprint";
import type { TrustBindingVersion } from "@/lib/trust/execution/proposedCommandBinding";
import { TRUST_BINDING_VERSION } from "@/lib/trust/execution/proposedCommandBinding";

/** Actor identity, resolved server-side. Never read from a request body. */
export type TrustServerActor = {
    readonly actor_type: "operator" | "system" | "automation";
    readonly actor_id: string | null;
    readonly org_id: string;
};

export type TrustExecutionConfirmation = {
    readonly package_id: string;
    /** The fingerprint the operator's review was bound to. */
    readonly package_fingerprint: string;
    readonly command_key: string;
    readonly binding_version: TrustBindingVersion;
    readonly actor: TrustServerActor;
    readonly confirmed_at_iso: string;
    /**
     * Optional correlation with an existing preview token
     * (`destructivePreviewToken`). Carried, never minted here — Trust issues no
     * tokens and verifies none.
     */
    readonly preview_token: string | null;
};

/**
 * Builds a confirmation from a server-resolved actor.
 *
 * The actor parameter is the only source of identity, so a caller physically
 * cannot construct a confirmation from client-supplied identity through this
 * function.
 */
export function createExecutionConfirmation(input: {
    readonly actor: TrustServerActor;
    readonly package_id: string;
    readonly package_fingerprint: string;
    readonly command_key: string;
    readonly confirmed_at_iso: string;
    readonly preview_token?: string | null;
}): TrustExecutionConfirmation {
    return Object.freeze({
        package_id: input.package_id,
        package_fingerprint: input.package_fingerprint,
        command_key: input.command_key,
        binding_version: TRUST_BINDING_VERSION,
        actor: input.actor,
        confirmed_at_iso: input.confirmed_at_iso,
        preview_token: input.preview_token ?? null,
    });
}

export const CONFIRMATION_MISMATCH_REASONS = [
    "package_id",
    "package_fingerprint",
    "command_key",
    "binding_version",
    "actor",
    "org",
] as const;
export type ConfirmationMismatchReason = (typeof CONFIRMATION_MISMATCH_REASONS)[number];

export type ConfirmationCheck =
    | { readonly ok: true }
    | { readonly ok: false; readonly reason: ConfirmationMismatchReason; readonly detail: string };

/**
 * Verifies a confirmation against the authoritative facts.
 *
 * `authoritativeFingerprint` must be recomputed from the stored package by the
 * caller — never taken from the confirmation, and never from a request body.
 */
export function verifyExecutionConfirmation(input: {
    readonly confirmation: TrustExecutionConfirmation;
    readonly package_id: string;
    readonly authoritativeFingerprint: string;
    readonly command_key: string;
    readonly serverActor: TrustServerActor;
}): ConfirmationCheck {
    const c = input.confirmation;

    if (c.package_id !== input.package_id) {
        return {
            ok: false,
            reason: "package_id",
            detail: `The confirmation names package ${c.package_id}, not ${input.package_id}. A confirmation cannot be reused for another package.`,
        };
    }
    if (c.command_key !== input.command_key) {
        return {
            ok: false,
            reason: "command_key",
            detail: `The confirmation names command "${c.command_key}", not "${input.command_key}". A confirmation cannot be reused for another command.`,
        };
    }
    if (c.binding_version !== TRUST_BINDING_VERSION) {
        return {
            ok: false,
            reason: "binding_version",
            detail: `The confirmation was made against binding version ${c.binding_version}; this runtime speaks ${TRUST_BINDING_VERSION}.`,
        };
    }
    if (!fingerprintsMatch(c.package_fingerprint, input.authoritativeFingerprint)) {
        return {
            ok: false,
            reason: "package_fingerprint",
            detail:
                "The confirmation was made against different package content than the one now stored. The operator did not review this package.",
        };
    }
    // The confirmation's actor must be the actor the server resolved for THIS
    // request. Identity is never taken from the confirmation alone.
    if (
        c.actor.actor_type !== input.serverActor.actor_type ||
        (c.actor.actor_id ?? null) !== (input.serverActor.actor_id ?? null)
    ) {
        return {
            ok: false,
            reason: "actor",
            detail: "The confirmation's actor does not match the server-resolved actor for this request.",
        };
    }
    if (c.actor.org_id !== input.serverActor.org_id) {
        return {
            ok: false,
            reason: "org",
            detail: "The confirmation was made in a different organization than the one making this request.",
        };
    }
    return { ok: true };
}
