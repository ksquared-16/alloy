/**
 * ACTIONS WHOSE SUBJECT IS NOT A RECORD.
 *
 * `RegisteredAction.requiredContext.requiresEntityId` already says whether an action needs a
 * subject. `billing.generate_tuition` sets it to `false` and says why: "The subject is the
 * PERIOD, not a record." The execute transport nonetheless required a non-empty `entity_id` for
 * everything except `create_lead`, which had been given its own hard-coded sentinel — so a
 * declaration the action registry makes was contradicted by the door the action is invoked
 * through, and the only way to call such an action was to lie about its subject.
 *
 * ── AND LYING ABOUT IT IS NOT HARMLESS ──
 *
 * `billing.generate_tuition` reads `invocation.entityId` as a SCOPE: an id present there narrows
 * the run to that assignment. A caller that passed "some record, any record" to satisfy the
 * transport would have billed one child while believing it had billed the period — a partial
 * month indistinguishable from a complete one. This sentinel exists so "no subject" can be
 * transmitted as no subject.
 */

/** Sentinel `entity_id` for an action that declares it needs no subject. */
export const SUBJECTLESS_ACTION_ENTITY_ID = "__no_subject__";

/**
 * True when an entity id is the "no subject" sentinel or absent.
 *
 * Scope resolvers MUST call this before treating an entity id as a filter. Ignoring it would
 * narrow a subjectless run to a record that does not exist, which produces zero results and
 * looks exactly like a period with nothing to bill.
 */
export function isSubjectlessEntityId(entityId: string | null | undefined): boolean {
    const id = (entityId ?? "").trim();
    return id === "" || id === SUBJECTLESS_ACTION_ENTITY_ID;
}
