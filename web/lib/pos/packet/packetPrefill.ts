/**
 * POS Packet — existing-record prefill classification (Sprint 2).
 *
 * Given a deduped canonical field plan (`buildPacketFieldPlan`) and a snapshot of what
 * Alloy already knows about the linked record(s) (lead / household / child / person),
 * classify each canonical datum as:
 *   - "known"   → Alloy already has it; the parent only CONFIRMS it.
 *   - "missing" → Alloy lacks it; the parent must PROVIDE it.
 *
 * This is the planning-layer companion to the runtime prefill in
 * `lib/forms/prefill/resolveFormPrefillValues.ts` (which maps field id → value at fill
 * time). Here we reason about canonical COVERAGE so the operator and the parent UI can
 * show "known vs needed" before a session exists. Pure, deterministic, no I/O.
 *
 * Doctrine: the parent should mostly confirm known information and provide only what is
 * missing; we never ask a parent to retype data Alloy already holds.
 */

import type { PacketFieldPlan, PacketFieldPlanEntry } from "./packetFieldPlan";

/**
 * Known values keyed by canonical key. A datum may be addressed either by its canonical
 * key (`entity_type:field_key`) or by an explicit `shared_value_key` alias; both are
 * accepted so callers can build the snapshot from whichever they have.
 */
export interface PacketRecordSnapshot {
    /** Map of canonical_key OR shared_value_key → currently-known value. */
    values: Record<string, unknown>;
    /** Optional provenance: which record/entity supplied each key (display only). */
    sources?: Record<string, string>;
}

export type PacketFieldPrefillStatus = "known" | "missing";

export interface PacketPrefillEntry {
    entry: PacketFieldPlanEntry;
    status: PacketFieldPrefillStatus;
    /** The known value when status === "known". */
    prefilled_value?: unknown;
    /** Which entity/record supplied the value (display only). */
    source?: string;
    /** True when required && missing — i.e. the parent MUST supply this. */
    required_input: boolean;
}

export interface PacketPrefillResult {
    entries: PacketPrefillEntry[];
    known_count: number;
    missing_count: number;
    /** Missing AND required — the minimum the parent must complete. */
    required_missing_count: number;
}

/** A value counts as "present" unless it is null/undefined, an empty/whitespace string, or an empty array. */
function isPresent(value: unknown): boolean {
    if (value === null || value === undefined) return false;
    if (typeof value === "string") return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    return true;
}

function lookup(snapshot: PacketRecordSnapshot, entry: PacketFieldPlanEntry): { value: unknown; key: string } | null {
    // Prefer the explicit shared alias, then the canonical key.
    const keys = [entry.shared_value_key, entry.canonical_key].filter((k): k is string => Boolean(k));
    for (const key of keys) {
        if (Object.prototype.hasOwnProperty.call(snapshot.values, key)) {
            return { value: snapshot.values[key], key };
        }
    }
    return null;
}

/**
 * Classify every plan entry against the known-record snapshot.
 *
 * Unbound fields (no canonical key) are always "missing" — Alloy has nowhere to have
 * stored them, so the parent provides them.
 */
export function resolvePacketPrefill(plan: PacketFieldPlan, snapshot: PacketRecordSnapshot): PacketPrefillResult {
    const entries: PacketPrefillEntry[] = plan.entries.map((entry) => {
        const hit = entry.basis === "unbound" ? null : lookup(snapshot, entry);
        const known = hit !== null && isPresent(hit.value);

        if (known) {
            const source = hit ? snapshot.sources?.[hit.key] : undefined;
            return {
                entry,
                status: "known",
                prefilled_value: hit!.value,
                ...(source ? { source } : {}),
                required_input: false,
            };
        }
        return {
            entry,
            status: "missing",
            required_input: entry.required,
        };
    });

    const known_count = entries.filter((e) => e.status === "known").length;
    const missing_count = entries.length - known_count;
    const required_missing_count = entries.filter((e) => e.status === "missing" && e.entry.required).length;

    return { entries, known_count, missing_count, required_missing_count };
}
