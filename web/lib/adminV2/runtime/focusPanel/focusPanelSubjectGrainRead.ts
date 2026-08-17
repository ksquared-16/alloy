/**
 * Reading a subject grain off the platform contract.
 *
 * `OperationalSubjectRef.type` is a plain `string` on purpose — the platform contract stays open so a
 * domain producer can name its own subject without a platform-layer edit. Anything that SELECTS on
 * that string therefore needs one narrowing point, or each consumer invents its own and they drift.
 *
 * ── THE DEFAULT IS `opportunity`, AND IT IS A COMPATIBILITY DEFAULT, NOT A GUESS ──
 *
 * Every producer that predates durable subjects supplies `"opportunity"`, and the surface has always
 * been the enrollment case surface. Narrowing an unrecognized value to `opportunity` therefore
 * reproduces existing behaviour exactly rather than inventing one — which is what keeps the case
 * regression byte-identical.
 *
 * It is a real trade: a typo'd subject type renders the enrollment composition instead of failing.
 * That is the correct failure direction for a RENDERER (never blank the operator's surface), and it
 * is contained because the honest refusals live upstream where they can be acted on —
 * `resolveAttentionTarget` returns null for an unknown entity type, and `cardAppliesToGrain` returns
 * false for an unregistered card.
 */

import type { OperationalSubjectType } from "@/lib/adminV2/runtime/operationalContext/subjectGrain";

const KNOWN_GRAINS: readonly OperationalSubjectType[] = [
    "opportunity",
    "child",
    "person",
    // The durable FAMILY. It must be listed here or it narrows to `opportunity` by the compatibility
    // default above — and a household read as a case would silently offer the case's cards on a
    // surface that has no process, which is the failure this list exists to prevent.
    "household",
];

/** Narrow a contract-open subject type to a known grain; unrecognized values read as the case grain. */
export function asFocusPanelSubjectGrain(raw: string | null | undefined): OperationalSubjectType {
    const value = (raw ?? "").trim().toLowerCase();
    return (KNOWN_GRAINS as readonly string[]).includes(value)
        ? (value as OperationalSubjectType)
        : "opportunity";
}
