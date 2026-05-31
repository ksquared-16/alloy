import { customerPersonRowIsHouseholdPrimaryContact } from "@/lib/admin/person/householdPrimaryContact";
import {
    normPersonDrawerHouseholdRole,
    PERSON_DRAWER_HOUSEHOLD_PARENT_GUARDIAN_ROLES,
} from "@/lib/admin/person/personDrawerHouseholdRoles";
import { evaluateHouseholdCompletionRequirements } from "@/lib/completion/evaluateHouseholdCompletionRequirements";
import { evaluateOpportunityCompletionRequirements } from "@/lib/completion/evaluateOpportunityCompletionRequirements";
import { evaluatePersonCompletionRequirements } from "@/lib/completion/evaluatePersonCompletionRequirements";
import { mergeRequirementValidationResults } from "@/lib/completion/requirementValidationResult";
import type {
    CompletionEvaluationContext,
    CompletionEntityType,
    RequirementValidationResult,
} from "@/lib/completion/requirementValidationTypes";

export { formatRequirementValidationSummary } from "@/lib/completion/requirementValidationResult";

/**
 * Completion Guardrails Foundation — primary evaluator (Sprint B).
 *
 * Bootstrap code rules only; not admin-configured. See docs/sprints/05_2026/required_fields_completion_guardrails_policy.md.
 */
export function evaluateCompletionRequirements(
    ctx: CompletionEvaluationContext
): RequirementValidationResult {
    switch (ctx.entity_type) {
        case "person": {
            const person = evaluatePersonCompletionRequirements(ctx);
            const household =
                ctx.related?.customer_id != null
                    ? evaluateHouseholdCompletionRequirements(ctx)
                    : { ok: true, blocking: [], warnings: [], recommendations: [] };
            return mergeRequirementValidationResults(person, household);
        }
        case "opportunity":
            return evaluateOpportunityCompletionRequirements(ctx);
        case "customer":
            return evaluateHouseholdCompletionRequirements(ctx);
        default:
            return { ok: true, blocking: [], warnings: [], recommendations: [] };
    }
}

/** Whether save-phase enforcement should reject the PATCH (hard blocks only). */
export function completionBlocksSave(result: RequirementValidationResult): boolean {
    return result.blocking.length > 0;
}

export function buildCompletionContextFromRecord(input: {
    entity_type: CompletionEntityType;
    entity_id: string;
    phase: CompletionEvaluationContext["phase"];
    record: Record<string, unknown>;
    surface?: string;
    layout_variant_key?: string | null;
    status_from?: string | null;
    status_to?: string | null;
    action_key?: string | null;
}): CompletionEvaluationContext {
    const related = extractRelatedFromRecord(input.record);
    return {
        phase: input.phase,
        entity_type: input.entity_type,
        entity_id: input.entity_id,
        surface: input.surface,
        layout_variant_key: input.layout_variant_key?.trim() || undefined,
        status_from: input.status_from,
        status_to: input.status_to,
        action_key: input.action_key,
        values: { ...input.record },
        related,
    };
}

function extractRelatedFromRecord(record: Record<string, unknown>) {
    const inquiryRaw = record._inquiry_children;
    const inquiry_children = Array.isArray(inquiryRaw)
        ? inquiryRaw
              .filter((x): x is Record<string, unknown> => x != null && typeof x === "object" && !Array.isArray(x))
              .map((row) => ({
                  id: typeof row.id === "string" ? row.id : undefined,
                  person_id: typeof row.person_id === "string" ? row.person_id : null,
                  first_name: typeof row.first_name === "string" ? row.first_name : null,
                  last_name: typeof row.last_name === "string" ? row.last_name : null,
                  location_id: typeof row.location_id === "string" ? row.location_id : null,
                  desired_program_type:
                      typeof row.desired_program_type === "string" ? row.desired_program_type : null,
                  program_room_cohort_key:
                      typeof row.program_room_cohort_key === "string" ? row.program_room_cohort_key : null,
                  desired_schedule_type:
                      typeof row.desired_schedule_type === "string" ? row.desired_schedule_type : null,
                  desired_start_date:
                      typeof row.desired_start_date === "string" ? row.desired_start_date : null,
                  outcome_status_key:
                      typeof row.outcome_status_key === "string" ? row.outcome_status_key : null,
              }))
        : undefined;

    const customerPersonsRaw = record._customer_persons;
    const customer_persons = Array.isArray(customerPersonsRaw)
        ? (customerPersonsRaw as Array<{
              role_type?: string | null;
              is_primary?: boolean | null;
              customer_id?: string | null;
          }>)
        : undefined;

    const customerMembersRaw = record._compatibility_members ?? record._customer_members;
    const customer_members = Array.isArray(customerMembersRaw)
        ? (customerMembersRaw as Array<{ relationship?: string | null }>)
        : undefined;

    const relRaw = record._person_relationships;
    const person_relationships = Array.isArray(relRaw)
        ? (relRaw as Array<{
              from_person_id: string;
              to_person_id: string;
              relationship_type?: string | null;
          }>)
        : undefined;

    const oppRolesRaw = record._opportunity_person_roles;
    const opportunity_person_roles = Array.isArray(oppRolesRaw)
        ? (oppRolesRaw as Array<{ role_type?: string | null }>)
        : undefined;

    const householdMembersRaw = record._household_members;
    let household_guardian_count: number | undefined;
    let household_has_primary_contact: boolean | undefined;
    if (Array.isArray(householdMembersRaw)) {
        household_guardian_count = householdMembersRaw.length;
        household_has_primary_contact = householdMembersRaw.some(
            (m) =>
                m != null &&
                typeof m === "object" &&
                (m as { is_household_primary_contact?: boolean }).is_household_primary_contact === true
        );
    }

    const adultLinksRaw = record._household_adult_links;
    if (Array.isArray(adultLinksRaw) && adultLinksRaw.length > 0) {
        const guardians = adultLinksRaw.filter((link) => {
            if (link == null || typeof link !== "object") return false;
            const role = normPersonDrawerHouseholdRole(
                (link as { role_type?: string | null }).role_type
            );
            return PERSON_DRAWER_HOUSEHOLD_PARENT_GUARDIAN_ROLES.has(role);
        });
        if (household_guardian_count == null) {
            household_guardian_count = guardians.length;
        }
        if (household_has_primary_contact == null) {
            household_has_primary_contact = adultLinksRaw.some((link) => {
                if (link == null || typeof link !== "object") return false;
                const row = link as {
                    is_household_primary_contact?: boolean;
                    is_primary?: boolean;
                    role_type?: string | null;
                };
                if (row.is_household_primary_contact === true) return true;
                return customerPersonRowIsHouseholdPrimaryContact(row);
            });
        }
    }

    if (household_has_primary_contact == null && customer_persons?.length) {
        household_has_primary_contact = customer_persons.some((row) =>
            customerPersonRowIsHouseholdPrimaryContact(row)
        );
        if (household_guardian_count == null) {
            household_guardian_count = customer_persons.filter((row) => {
                const role = normPersonDrawerHouseholdRole(row.role_type);
                return PERSON_DRAWER_HOUSEHOLD_PARENT_GUARDIAN_ROLES.has(role);
            }).length;
        }
    }

    const householdContextRaw = record._household_context;
    const customer_id_from_household =
        Array.isArray(householdContextRaw) &&
        householdContextRaw[0] != null &&
        typeof householdContextRaw[0] === "object"
            ? String((householdContextRaw[0] as { customer_id?: string }).customer_id ?? "").trim() ||
              null
            : null;

    const customer_id =
        (typeof record.customer_id === "string" ? record.customer_id : null) ??
        (typeof record._customer_id === "string" ? record._customer_id : null) ??
        customer_id_from_household ??
        (Array.isArray(adultLinksRaw) && adultLinksRaw[0] != null && typeof adultLinksRaw[0] === "object"
            ? String((adultLinksRaw[0] as { customer_id?: string }).customer_id ?? "").trim() || null
            : null);

    return {
        customer_id,
        inquiry_children,
        customer_persons,
        customer_members,
        person_relationships,
        opportunity_person_roles,
        household_guardian_count,
        household_has_primary_contact,
    };
}

export function evaluateCompletionRequirementsFromRecord(input: {
    entity_type: CompletionEntityType;
    entity_id: string;
    phase: CompletionEvaluationContext["phase"];
    record: Record<string, unknown>;
    surface?: string;
    layout_variant_key?: string | null;
    status_from?: string | null;
    status_to?: string | null;
    action_key?: string | null;
}): RequirementValidationResult {
    return evaluateCompletionRequirements(buildCompletionContextFromRecord(input));
}
