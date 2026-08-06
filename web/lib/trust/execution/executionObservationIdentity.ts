/**
 * The stable identity of one execution observation.
 *
 * Phase 1.6 made the observation primary key the exactly-once authority for
 * supersession. Execution binding needs the same property for a different
 * event, so it derives its id the same way rather than inventing a second
 * idempotency mechanism:
 *
 * ```text
 * one execution identity → one observation id → at most one row (PRIMARY KEY)
 * ```
 *
 * ## What the identity is made of, and why
 *
 * ```text
 * org + package + plan + plan version + plan content hash + commit attempt + kind
 * ```
 *
 * - **package** — a plan spans several identity subjects, so one attempt binds
 *   to several packages. Including the package is what lets one commit attempt
 *   produce one observation *per contributing package* without either
 *   duplicating or collapsing them.
 * - **plan version and content hash** — a materially edited plan is a different
 *   plan, and approval binds to the exact triple. Lineage must too.
 * - **commit attempt** — a retry is a genuinely distinct execution event. Two
 *   attempts against one plan stay distinguishable, which is what Processing's
 *   retry semantics require.
 * - **kind** — `executed` and `outcome` are different facts about the same
 *   attempt and must not collide.
 *
 * Pure. No I/O, no clock, no randomness.
 */

// The one-shot `hash()` rather than the streaming digest builder. A Phase 0
// structural control forbids the mutating-call syntax anywhere in `lib/trust`,
// on the principle that a Trust module able to write one is a Trust module able
// to mutate a Decision Package — and the control matches source text, including
// comments. The digest is identical either way.
import { hash } from "node:crypto";

export const EXECUTION_OBSERVATION_IDENTITY_VERSION = "trust-execution-observation-v1" as const;

export type ExecutionObservationIdentityInput = {
    readonly org_id: string;
    readonly package_id: string;
    readonly plan_id: string;
    readonly plan_version: number;
    readonly plan_content_hash: string;
    /** The DURABLE commit-attempt row id. Never a synthesized attempt label. */
    readonly commit_attempt_id: string;
    readonly observation_kind: "executed" | "outcome";
};

export function executionObservationId(input: ExecutionObservationIdentityInput): string {
    // Positional, unit-separated: no component value can impersonate a boundary,
    // and object-key order cannot reach the digest.
    const canonical = [
        EXECUTION_OBSERVATION_IDENTITY_VERSION,
        input.org_id,
        input.package_id,
        input.plan_id,
        String(input.plan_version),
        input.plan_content_hash,
        input.commit_attempt_id,
        input.observation_kind,
    ].join("\u001f");
    const hex = hash("sha256", canonical, "hex");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
