import type { SupabaseClient } from "@supabase/supabase-js";
import type { IntakeHouseholdCandidate, IntakePersonCandidate } from "@/lib/intake/types";
import { assembleResolutionResult, defaultActionForConfidence, makeMatchCandidateId } from "@/lib/intake/resolve/buildProposals";
import {
    evaluateChildPersonMatch,
    evaluateParentPersonMatch,
    parentContactFromCandidate,
    personDisplayNameFromRecord,
} from "@/lib/intake/resolve/matchIdentity";
import {
    findCustomerDisplayName,
    findCustomerIdForPerson,
    findExistingLeadForIntake,
    findPersonRecordById,
    listHouseholdChildMembers,
    listOrgChildPersonMatches,
    listPersonsByEmail,
    listPersonsByExactName,
    listPersonsByPhone,
} from "@/lib/intake/resolve/queryMatches";
import type {
    IntakeRecordResolutionCandidate,
    IntakeRecordResolutionProposal,
    ResolveIntakeRecordResolutionInput,
} from "@/lib/intake/resolve/types";

function trim(v: unknown): string {
    return v != null ? String(v).trim() : "";
}

function guardiansFromHousehold(household: IntakeHouseholdCandidate): IntakePersonCandidate[] {
    return household.parents_guardians?.length ? household.parents_guardians : household.parents;
}

function proposalFromEvaluation(input: {
    intakeCandidateId: string;
    confidence: import("@/lib/intake/resolve/types").IntakeRecordMatchConfidence;
    reasons: string[];
    selectedMatchId?: string;
    actionOverride?: import("@/lib/intake/resolve/types").IntakeRecordResolutionAction;
}): IntakeRecordResolutionProposal {
    const action = input.actionOverride ?? defaultActionForConfidence(input.confidence);
    return {
        intake_candidate_id: input.intakeCandidateId,
        action,
        selected_match_id: input.selectedMatchId,
        confidence: input.confidence,
        reasons: input.reasons,
    };
}

/**
 * Canonical intake record resolution — source-agnostic; callable without Create Lead UI.
 */
export async function resolveIntakeRecordResolution(
    supabase: SupabaseClient,
    input: ResolveIntakeRecordResolutionInput,
): Promise<import("@/lib/intake/resolve/types").IntakeRecordResolutionResult> {
    const candidates: IntakeRecordResolutionCandidate[] = [];
    const proposals: IntakeRecordResolutionProposal[] = [];
    const orgId = input.orgId;
    const household = input.household;
    const guardians = guardiansFromHousehold(household);
    const children = household.children;

    const parentPersonByCandidate: Record<string, string> = {};
    const parentCustomerByCandidate: Record<string, string> = {};

    for (const parent of guardians) {
        const contact = parentContactFromCandidate(parent);
        const emailMatches =
            contact.emailNorm ? await listPersonsByEmail(supabase, orgId, contact.emailNorm) : [];
        const phoneMatches =
            contact.phoneNorm ? await listPersonsByPhone(supabase, orgId, contact.phoneNorm) : [];
        const nameMatches =
            contact.firstName && contact.lastName ?
                await listPersonsByExactName(supabase, orgId, contact.firstName, contact.lastName)
            :   [];

        const evaluation = evaluateParentPersonMatch({
            firstName: contact.firstName,
            lastName: contact.lastName,
            emailNorm: contact.emailNorm,
            phoneNorm: contact.phoneNorm,
            emailMatches,
            phoneMatches,
            nameMatches,
        });

        if (evaluation.personId) {
            const person =
                emailMatches.find((p) => p.id === evaluation.personId) ??
                phoneMatches.find((p) => p.id === evaluation.personId) ??
                nameMatches.find((p) => p.id === evaluation.personId) ??
                (await findPersonRecordById(supabase, evaluation.personId));
            const displayName = person ? personDisplayNameFromRecord(person) : evaluation.personId;
            candidates.push({
                candidate_id: makeMatchCandidateId("person", evaluation.personId),
                intake_candidate_id: parent.candidate_id,
                intake_entity_role: parent.role === "guardian" ? "guardian" : "parent",
                matched_entity_type: "person",
                matched_entity_id: evaluation.personId,
                confidence: evaluation.confidence,
                reasons: evaluation.reasons,
                blocking_conflicts: evaluation.blocking_conflicts,
                match_display_name: displayName,
            });
            proposals.push(
                proposalFromEvaluation({
                    intakeCandidateId: parent.candidate_id,
                    confidence: evaluation.confidence,
                    reasons: evaluation.reasons,
                    selectedMatchId:
                        evaluation.confidence !== "no_match" ?
                            makeMatchCandidateId("person", evaluation.personId)
                        :   undefined,
                }),
            );
            if (evaluation.confidence !== "no_match" && evaluation.confidence !== "conflict") {
                parentPersonByCandidate[parent.candidate_id] = evaluation.personId;
            }
            if (evaluation.confidence === "exact_match" || evaluation.confidence === "probable_match") {
                parentPersonByCandidate[parent.candidate_id] = evaluation.personId;
                const customerId = await findCustomerIdForPerson(supabase, orgId, evaluation.personId);
                if (customerId) parentCustomerByCandidate[parent.candidate_id] = customerId;
            }
        } else {
            proposals.push(
                proposalFromEvaluation({
                    intakeCandidateId: parent.candidate_id,
                    confidence: evaluation.confidence,
                    reasons: evaluation.reasons,
                }),
            );
        }
    }

    const primaryParent = guardians[0];
    const primaryParentPersonId =
        primaryParent ? parentPersonByCandidate[primaryParent.candidate_id] ?? null : null;
    const resolvedCustomerId =
        primaryParent ? parentCustomerByCandidate[primaryParent.candidate_id] ?? null : null;

    let householdCustomerId = resolvedCustomerId;
    if (!householdCustomerId && primaryParentPersonId) {
        householdCustomerId = await findCustomerIdForPerson(supabase, orgId, primaryParentPersonId);
    }

    for (const child of children) {
        const firstName = trim(child.first_name);
        const lastName = trim(child.last_name);
        const dob = trim(child.dob).slice(0, 10) || null;

        const householdMembers =
            householdCustomerId ?
                await listHouseholdChildMembers(supabase, orgId, householdCustomerId)
            :   [];
        const orgMatches = await listOrgChildPersonMatches(supabase, orgId, firstName, lastName, dob);

        const evaluation = evaluateChildPersonMatch({
            firstName,
            lastName,
            dob,
            householdMembers,
            orgPersonMatches: orgMatches,
            matchedParentPersonId: primaryParentPersonId,
        });

        if (evaluation.personId) {
            const person = orgMatches.find((p) => p.id === evaluation.personId);
            candidates.push({
                candidate_id: makeMatchCandidateId("person", evaluation.personId),
                intake_candidate_id: child.candidate_id,
                intake_entity_role: "child",
                matched_entity_type: "person",
                matched_entity_id: evaluation.personId,
                confidence: evaluation.confidence,
                reasons: evaluation.reasons,
                blocking_conflicts: evaluation.blocking_conflicts,
                match_display_name: person ? personDisplayNameFromRecord(person) : evaluation.personId,
            });
            if (evaluation.customerMemberId) {
                candidates.push({
                    candidate_id: makeMatchCandidateId("customer_member", evaluation.customerMemberId),
                    intake_candidate_id: child.candidate_id,
                    intake_entity_role: "child",
                    matched_entity_type: "customer_member",
                    matched_entity_id: evaluation.customerMemberId,
                    confidence: evaluation.confidence,
                    reasons: ["Existing household child member."],
                    match_display_name: person ? personDisplayNameFromRecord(person) : undefined,
                });
            }
        }

        proposals.push(
            proposalFromEvaluation({
                intakeCandidateId: child.candidate_id,
                confidence: evaluation.confidence,
                reasons: evaluation.reasons,
                selectedMatchId:
                    evaluation.personId ?
                        makeMatchCandidateId("person", evaluation.personId)
                    :   undefined,
            }),
        );
    }

    if (householdCustomerId) {
        const displayName = (await findCustomerDisplayName(supabase, householdCustomerId)) ?? "Existing household";
        candidates.push({
            candidate_id: makeMatchCandidateId("customer", householdCustomerId),
            intake_candidate_id: household.household_id,
            intake_entity_role: "household",
            matched_entity_type: "customer",
            matched_entity_id: householdCustomerId,
            confidence: "exact_match",
            reasons: ["Matched parent or child is already linked to a household."],
            match_display_name: displayName,
        });
        proposals.push({
            intake_candidate_id: household.household_id,
            action: "link_existing",
            selected_match_id: makeMatchCandidateId("customer", householdCustomerId),
            confidence: "exact_match",
            reasons: ["Link to existing household from matched member."],
        });
    } else {
        proposals.push({
            intake_candidate_id: household.household_id,
            action: "create_new",
            confidence: "no_match",
            reasons: ["No existing household match — create new customer."],
        });
    }

    if (primaryParentPersonId) {
        const leadLookup = await findExistingLeadForIntake(supabase, {
            orgId,
            personId: primaryParentPersonId,
            locationId: input.location_id ?? household.location?.resolved_value ?? null,
            // Household-level open lead warning — child OCM linkage is optional on existing leads.
            childFirst: null,
            childLast: null,
        });

        if (leadLookup.ambiguous) {
            candidates.push({
                candidate_id: "match:opportunity:ambiguous",
                intake_candidate_id: household.household_id,
                intake_entity_role: "lead",
                matched_entity_type: "opportunity",
                matched_entity_id: "ambiguous",
                confidence: "conflict",
                reasons: ["Multiple open leads match this household and location."],
                blocking_conflicts: ["multiple_open_leads"],
            });
            proposals.push({
                intake_candidate_id: `${household.household_id}:lead`,
                action: "review_required",
                confidence: "conflict",
                reasons: ["Multiple open leads found — review before creating another lead."],
            });
        } else if (leadLookup.opportunityId) {
            candidates.push({
                candidate_id: makeMatchCandidateId("opportunity", leadLookup.opportunityId),
                intake_candidate_id: household.household_id,
                intake_entity_role: "lead",
                matched_entity_type: "opportunity",
                matched_entity_id: leadLookup.opportunityId,
                confidence: "probable_match",
                reasons: ["Open lead exists for this household at the same location."],
            });
            proposals.push({
                intake_candidate_id: `${household.household_id}:lead`,
                action: "review_required",
                selected_match_id: makeMatchCandidateId("opportunity", leadLookup.opportunityId),
                confidence: "probable_match",
                reasons: ["Existing open lead — confirm before creating a duplicate lead."],
            });
        } else {
            proposals.push({
                intake_candidate_id: `${household.household_id}:lead`,
                action: "create_new",
                confidence: "no_match",
                reasons: ["No open lead conflict detected."],
            });
        }
    }

    return assembleResolutionResult({
        source_kind: input.source_kind,
        source_id: input.source_id,
        candidates,
        proposals,
    });
}
