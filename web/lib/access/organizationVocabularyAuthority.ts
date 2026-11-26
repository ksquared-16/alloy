/**
 * THE WORDS AN ORGANIZATION CHOOSES, AND WHO MAY CHANGE THEM.
 *
 * The contract: create and manage organization-defined vocabulary used to classify, relate, label or
 * assign records and operational objects. It defines the WORDS available; it confers no authority to
 * change the records those words describe.
 *
 * Five families were considered and FOUR are here. What they share is that each defines a term the
 * organization invents and nothing else: what a thing is called (`entity_labels`), how a person
 * relates to a household (`customer_person_role_types`), how people relate to each other
 * (`person_relationship_type_settings`), and which kinds of assignment exist
 * (`operational_assignment_types`).
 *
 * STATUS DEFINITIONS ARE DELIBERATELY ABSENT, and the reason is load-bearing.
 * `normalizeStatusDefinitionMetadata` PERSISTS the process-stage key, and
 * `parseProcessStageKeyFromStatusMetadata` reads it to decide which lifecycle stage a status belongs
 * to — so editing a status definition can rebind a status to a different stage, the same effect
 * `enrollment-process/status-stages` already gates on `business_process.configure`, with queue
 * synchronisation hanging off it. Folding that in here would hand lifecycle rebinding to whoever may
 * rename a label, and would open a second door to an operation Business Process already owns. Status
 * definitions take `business_process.configure` instead.
 *
 * ASSIGNMENT TYPES ARE CONFIGURATION, NOT ASSIGNMENT. Assignments Authority Model V1 established
 * that assignment authority belongs to each business surface — Communications owns conversation
 * assignment, Jobs owns vendor assignment. Defining the TYPES that exist is a different act from
 * assigning anything, and the routes agree: they write `operational_assignment_types` and read
 * `schedule_assignments` only to REFUSE archiving a type still in use. This key confers no ability
 * to assign a conversation, a vendor, a staff member, work, or a role.
 *
 * AND IT IS NOT THE REST OF CONFIGURATION. `fields.manage`, `option_sets.manage`, `layouts.manage`
 * and `sections.manage` have established, narrower meanings — configuring field definitions, option
 * sets, layouts, sections. None of them means "may define organization-wide operational vocabulary",
 * which is why this key exists rather than borrowing one of theirs.
 */
import { NextResponse } from "next/server";

/** Manage the organization's reusable labels, types and relationship vocabulary. */
export const CONFIGURATION_VOCABULARY_MANAGE = "configuration.vocabulary.manage" as const;

export type OrganizationVocabularyCapability = typeof CONFIGURATION_VOCABULARY_MANAGE;

/** Pure: does this resolved context carry the capability? */
export function hasOrganizationVocabularyCapability(
    ctx: { permissionKeys?: readonly string[] | null },
): boolean {
    return (ctx.permissionKeys ?? []).includes(CONFIGURATION_VOCABULARY_MANAGE);
}

/**
 * Refuse unless the caller may manage organization vocabulary, naming the key so a denial is
 * debuggable rather than merely forbidden.
 *
 * Takes an already-resolved context rather than resolving one, matching
 * `requireCrmPeopleCapability` and `requireSchedulingJobsCapability`: these routes have all
 * established who is calling before they reach this point.
 */
export function requireOrganizationVocabularyCapability(
    ctx: { permissionKeys?: readonly string[] | null },
): NextResponse | null {
    if (hasOrganizationVocabularyCapability(ctx)) return null;
    return NextResponse.json(
        { error: "Forbidden", required_permission: CONFIGURATION_VOCABULARY_MANAGE },
        { status: 403 },
    );
}
