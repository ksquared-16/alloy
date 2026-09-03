/**
 * D-103 — entry INTENT to stage, owned by Business Process configuration.
 *
 * ## The scalar this replaces
 *
 * B1a added `entry_stage_key`: one stage per process. That was wrong for a reason B1's own
 * investigation had already surfaced and the model then collapsed — the same Enrollment process has
 * two legitimate initiations:
 *
 * ```
 *   Create Lead        an acquisition episode begins   → lead
 *   Start Enrollment   a durable child begins paperwork → enrolling
 * ```
 *
 * A process-global scalar forces those into one answer, and whichever is chosen is wrong for the
 * other. So configuration maps INTENTS to stages, and the initiating product action supplies an
 * intent.
 *
 * The split of authority is the point. The action may say **why** a process is being initiated; it
 * may not say **where** the journey starts. The published revision owns that, immutably.
 *
 * ## The intent vocabulary already existed
 *
 * These are not new names. `process_instances.metadata.source` has recorded exactly these values
 * since long before this decision — `buildEnrollmentProcessInstanceInsert` writes `create_lead` by
 * default and Start Enrollment passes `enrollment_start`. So the runtime reads the intent a journey
 * was created with rather than being told one, no column is added, and journeys created before D-103
 * are already labelled.
 *
 * `enrollment_start` is this repository's name for what the decision called `start_enrollment`. Same
 * semantic, existing literal, no duplicate vocabulary.
 *
 * ## Why a map keyed by intent
 *
 * `by_intent` is an object, so two definitions of one intent are structurally impossible — a JSON
 * object cannot carry the same key twice, and the ambiguity never needs a tie-break rule. An array of
 * `{intent, stage_key}` rows would have needed one. It also matches the `by_rule_id` / `by_stage_key`
 * shape the builder's other versioned sub-configs already use.
 *
 * ## Fails closed, in both directions
 *
 * An intent that configuration does not map resolves to nothing, and the caller refuses. An intent
 * the platform does not know is rejected at publish, so an authored typo cannot become an entry point
 * that silently never matches.
 */

export const PROCESS_ENTRY_INTENTS = ["create_lead", "enrollment_start"] as const;

export type ProcessEntryIntentV1 = (typeof PROCESS_ENTRY_INTENTS)[number];

/**
 * Beginning a child's Enrollment execution, whichever door it came through.
 *
 * Named because it is written into `process_instances.metadata.source` and read back by
 * `resolveEffectiveStageKey` -- two spellings of this string in two code paths is precisely how one
 * of them ends up governed by a stage the tenant never configured.
 */
export const ENROLLMENT_START_ENTRY_INTENT: ProcessEntryIntentV1 = "enrollment_start";

/** The intent recorded when no creator named one — the default `buildEnrollmentProcessInstanceInsert` writes. */
export const DEFAULT_PROCESS_ENTRY_INTENT: ProcessEntryIntentV1 = "create_lead";

export type ProcessEntryPointsV1 = {
    readonly version: 1;
    /** intent → stage key. Object-keyed, so one intent cannot be defined twice. */
    readonly by_intent: Readonly<Partial<Record<ProcessEntryIntentV1, string>>>;
};

export function isProcessEntryIntent(value: unknown): value is ProcessEntryIntentV1 {
    return typeof value === "string" && (PROCESS_ENTRY_INTENTS as readonly string[]).includes(value);
}

/**
 * Read the intent a journey was created with.
 *
 * Unknown or absent values fall to the default rather than throwing: `metadata.source` is a
 * provenance field older than this decision and other writers may put other things in it. Falling to
 * `create_lead` matches what the insert helper itself defaults to, so a journey created without an
 * explicit source resolves the same way whichever end you read it from.
 */
export function entryIntentFromProcessInstanceMetadata(metadata: unknown): ProcessEntryIntentV1 {
    if (metadata == null || typeof metadata !== "object" || Array.isArray(metadata)) {
        return DEFAULT_PROCESS_ENTRY_INTENT;
    }
    const source = (metadata as Record<string, unknown>).source;
    return isProcessEntryIntent(source) ? source : DEFAULT_PROCESS_ENTRY_INTENT;
}

/**
 * Parse the authored section.
 *
 * Returns `null` for absent or unreadable — unauthored, which consumers must refuse on rather than
 * default. Unknown intent keys are DROPPED here and reported as blocking findings by publish
 * validation, which reads the raw payload: dropping alone would turn an authored typo into "not
 * configured", a quieter failure than the operator deserves.
 */
export function parseProcessEntryPointsV1(raw: unknown): ProcessEntryPointsV1 | null {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
    const o = raw as Record<string, unknown>;
    if (o.version !== 1) return null;
    const byIntentRaw = o.by_intent;
    if (byIntentRaw == null || typeof byIntentRaw !== "object" || Array.isArray(byIntentRaw)) return null;

    const by_intent: Partial<Record<ProcessEntryIntentV1, string>> = {};
    for (const [key, value] of Object.entries(byIntentRaw as Record<string, unknown>)) {
        if (!isProcessEntryIntent(key)) continue;
        const stageKey = typeof value === "string" ? value.trim() : "";
        if (stageKey) by_intent[key] = stageKey;
    }
    return { version: 1, by_intent };
}

export function serializeProcessEntryPointsV1(config: ProcessEntryPointsV1): Record<string, unknown> {
    return { version: 1, by_intent: { ...config.by_intent } };
}
