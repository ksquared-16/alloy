/**
 * Participation config (V1) — the PERSISTED, operator-authored participation definition for a
 * Business Process, stored on the process record in lifecycle_builder_v1 (`participation_v1`). The
 * Process Builder writes this; the engine reads a ProcessParticipationContract derived from it.
 *
 * This is the config/binding layer ABOVE the generic engine: it may reference presentation view
 * keys, but the engine still only ever sees the four-field contract. Nothing here is hardcoded to
 * Enrollment — the Enrollment Definition provides the DEFAULT config; other processes provide their
 * own. Persisting a different definition changes the contract the engine reads, with no engine edit.
 */

import type { ProcessParticipationContract } from "@/lib/process/engine";
import { captureUnknownFields, withUnknownFields } from "@/lib/config/preserveUnknownFields";

/** Presentation view capabilities a process may offer Work Views (not an engine concept). */
export const PARTICIPATION_VIEW_KEYS = ["family", "child", "candidate"] as const;
export type ParticipationViewKey = (typeof PARTICIPATION_VIEW_KEYS)[number];

/** How participants come into being (documented; only "one_per_child_member" ships in V1). */
export type ParticipantCreationRuleV1 = "one_per_child_member" | "one_per_context";

export type ParticipationConfigV1 = {
    version: 1;
    /** Locked in V1 — what a participant IS (documents the process). */
    subject_type: string;
    /** Locked in V1 — what it runs WITHIN. */
    context_type: string;
    /** Editable — inherit the context (family) stage until a participant branches. */
    inherits_context_stage: boolean;
    /** Locked in V1 — how participants are created. */
    participant_creation: ParticipantCreationRuleV1;
    /** Editable — the presentation views Work Views may use for this process. */
    available_views: ParticipationViewKey[];
    /** Editable — operator label overrides for operational states (logic stays platform-managed). */
    operational_state_labels?: Record<string, string>;
};

function trimmed(v: unknown): string | null {
    return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Coerce a persisted value into a valid config (null when unparseable → caller uses its default). */
export function parseParticipationConfigV1(raw: unknown): ParticipationConfigV1 | null {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
    const o = raw as Record<string, unknown>;
    if (o.version !== 1) return null;
    const subject = trimmed(o.subject_type);
    const context = trimmed(o.context_type);
    if (!subject || !context) return null;

    const views = Array.isArray(o.available_views)
        ? (o.available_views.filter(
              (v): v is ParticipationViewKey =>
                  typeof v === "string" && (PARTICIPATION_VIEW_KEYS as readonly string[]).includes(v),
          ) as ParticipationViewKey[])
        : [];

    const labels: Record<string, string> = {};
    if (o.operational_state_labels && typeof o.operational_state_labels === "object" && !Array.isArray(o.operational_state_labels)) {
        for (const [k, v] of Object.entries(o.operational_state_labels as Record<string, unknown>)) {
            const label = trimmed(v);
            if (k.trim() && label) labels[k.trim()] = label;
        }
    }

    const parsed: ParticipationConfigV1 = {
        version: 1,
        subject_type: subject,
        context_type: context,
        inherits_context_stage: o.inherits_context_stage !== false,
        participant_creation:
            o.participant_creation === "one_per_context" ? "one_per_context" : "one_per_child_member",
        available_views: views,
        ...(Object.keys(labels).length ? { operational_state_labels: labels } : {}),
    };

    // Law 7. This parser is an allowlist reconstruction, so anything it cannot name was being
    // DELETED on every save — a branch that had never heard of a field destroyed it by editing
    // something else entirely. Certification caught it: a field planted in `participation_v1`
    // came back `(GONE)`. The carrier is an enumerable symbol, so object spread copies it while
    // `JSON.stringify` ignores it, and unknown data survives without ever being re-persisted as
    // something this branch pretends to understand.
    return withUnknownFields(parsed, captureUnknownFields(o, PARTICIPATION_OWNED_KEYS));
}

/** Every key this branch understands. Anything else rides the unknown-field carrier. */
const PARTICIPATION_OWNED_KEYS = [
    "version",
    "subject_type",
    "context_type",
    "inherits_context_stage",
    "participant_creation",
    "available_views",
    "operational_state_labels",
] as const;

/**
 * The engine contract derived from a participation config — the ONLY four fields the engine reads.
 * View keys + state labels + creation rule stay in the config layer / presentation; the engine never
 * sees them. This is the seam that makes the Process Builder the engine's source of truth.
 */
export function participationContractFromConfig(
    processKey: string,
    config: ParticipationConfigV1,
): ProcessParticipationContract {
    return {
        processKey,
        subjectType: config.subject_type,
        contextType: config.context_type,
        inheritsContextStage: config.inherits_context_stage,
    };
}
