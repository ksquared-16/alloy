import type { SupabaseClient } from "@supabase/supabase-js";
import type { IntakeHouseholdCandidate } from "@/lib/intake/types";
import { parentContactFromCandidate } from "@/lib/intake/resolve/matchIdentity";
import {
    findCustomerDisplayName,
    findCustomerIdForPerson,
    findExistingLeadForIntake,
} from "@/lib/intake/resolve/queryMatches";
import { makeMatchCandidateId } from "@/lib/intake/resolve/buildProposals";
import type { HouseholdGraphContext, IdentityCandidate } from "./candidateTypes";
import { IDENTITY_RESOLVER_VERSION } from "./constants";
import { isEligibleOrgScopedRecord, generateChildCandidates, generatePersonCandidates } from "./generateCandidates";
import { sortCandidatesByBand } from "./confidenceBand";

function guardiansFromHousehold(household: IntakeHouseholdCandidate) {
    return household.parents_guardians?.length ? household.parents_guardians : household.parents;
}

/**
 * Canonical household graph candidate generation (B1b).
 * Pure orchestration over person/child generators — no persistence.
 */
export async function generateHouseholdGraphCandidates(
    supabase: SupabaseClient,
    input: {
        orgId: string;
        household: IntakeHouseholdCandidate;
        locationId?: string | null;
    },
): Promise<{
    parents: IdentityCandidate[];
    children: IdentityCandidate[];
    household: IdentityCandidate[];
    leads: IdentityCandidate[];
    graph: HouseholdGraphContext;
}> {
    const orgId = input.orgId;
    const household = input.household;
    const guardians = guardiansFromHousehold(household);
    const parentCandidates: IdentityCandidate[] = [];
    const parentPersonByRef: Record<string, string> = {};
    let resolvedCustomerId: string | null = null;

    for (const parent of guardians) {
        const contact = parentContactFromCandidate(parent);
        const candidates = await generatePersonCandidates(supabase, orgId, {
            subjectRef: parent.candidate_id,
            firstName: contact.firstName,
            lastName: contact.lastName,
            emailNorm: contact.emailNorm,
            phoneNorm: contact.phoneNorm,
            role: parent.role === "guardian" ? "guardian" : "parent",
            factRefs: parent.source_fact_ids,
        });
        parentCandidates.push(...candidates);
        const top = candidates[0];
        if (top && top.confidenceBand !== "conflicted" && top.confidenceBand !== "excluded") {
            parentPersonByRef[parent.candidate_id] = top.recordId;
            if (!resolvedCustomerId) {
                resolvedCustomerId = await findCustomerIdForPerson(supabase, orgId, top.recordId);
            }
        }
    }

    const primaryParent = guardians[0];
    const primaryParentPersonId =
        primaryParent ? parentPersonByRef[primaryParent.candidate_id] ?? null : null;

    if (!resolvedCustomerId && primaryParentPersonId) {
        resolvedCustomerId = await findCustomerIdForPerson(supabase, orgId, primaryParentPersonId);
    }

    const childCandidates: IdentityCandidate[] = [];
    for (const child of household.children) {
        const rows = await generateChildCandidates(
            supabase,
            orgId,
            {
                subjectRef: child.candidate_id,
                firstName: (child.first_name ?? "").trim(),
                lastName: (child.last_name ?? "").trim(),
                dob: (child.dob ?? "").trim().slice(0, 10) || null,
                factRefs: child.source_fact_ids,
                guardianPersonId: primaryParentPersonId,
            },
            { householdCustomerId: resolvedCustomerId, matchedParentPersonId: primaryParentPersonId },
        );
        childCandidates.push(...rows);
    }

    const householdCandidates: IdentityCandidate[] = [];
    if (resolvedCustomerId) {
        const displayName =
            (await findCustomerDisplayName(supabase, resolvedCustomerId)) ?? "Existing household";
        householdCandidates.push({
            subjectRef: household.household_id,
            entityType: "household",
            recordId: resolvedCustomerId,
            matchedEntityType: "customer",
            confidenceBand: "confirmed",
            signals: [
                {
                    key: "household_link",
                    kind: "supporting",
                    strength: "strong",
                    subjectFactRefs: [],
                    recordFieldRefs: ["customers.id"],
                    reasonCode: "matched_parent_household",
                    explanation: "Matched parent or child linked to existing household.",
                },
            ],
            blockingConflicts: [],
            explanation: "Existing household from matched member.",
            resolverVersion: IDENTITY_RESOLVER_VERSION,
            displayName,
        });
    }

    const leadCandidates: IdentityCandidate[] = [];
    if (primaryParentPersonId) {
        const leadLookup = await findExistingLeadForIntake(supabase, {
            orgId,
            personId: primaryParentPersonId,
            locationId: input.locationId ?? household.location?.resolved_value ?? null,
            childFirst: null,
            childLast: null,
        });

        if (leadLookup.ambiguous) {
            leadCandidates.push({
                subjectRef: `${household.household_id}:lead`,
                entityType: "lead",
                recordId: "ambiguous",
                matchedEntityType: "opportunity",
                confidenceBand: "conflicted",
                signals: [],
                blockingConflicts: [
                    {
                        key: "multiple_open_leads",
                        kind: "contradicting",
                        strength: "strong",
                        subjectFactRefs: [],
                        recordFieldRefs: ["opportunities.id"],
                        reasonCode: "multiple_open_leads",
                        explanation: "Multiple open leads match this household and location.",
                    },
                ],
                explanation: "Multiple open leads — null-org opportunities excluded from pool.",
                resolverVersion: IDENTITY_RESOLVER_VERSION,
            });
        } else if (leadLookup.opportunityId) {
            leadCandidates.push({
                subjectRef: `${household.household_id}:lead`,
                entityType: "lead",
                recordId: leadLookup.opportunityId,
                matchedEntityType: "opportunity",
                confidenceBand: "strong",
                signals: [
                    {
                        key: "open_lead",
                        kind: "supporting",
                        strength: "strong",
                        subjectFactRefs: [],
                        recordFieldRefs: ["opportunities.id"],
                        reasonCode: "existing_open_lead",
                        explanation: "Open lead exists for household at location.",
                    },
                ],
                blockingConflicts: [],
                explanation: makeMatchCandidateId("opportunity", leadLookup.opportunityId),
                resolverVersion: IDENTITY_RESOLVER_VERSION,
            });
        }
    }

    return {
        parents: sortCandidatesByBand(parentCandidates),
        children: sortCandidatesByBand(childCandidates),
        household: householdCandidates,
        leads: leadCandidates,
        graph: {
            orgId,
            householdRef: household.household_id,
            parentCandidates,
            childCandidates,
            householdCustomerId: resolvedCustomerId,
        },
    };
}

/** Diagnostic helper when an opportunity row lacks org ownership. */
export function opportunityOrgIntegrityDiagnostic(orgId: string | null | undefined): string | null {
    if (orgId == null || orgId === "") {
        return "opportunity_missing_org_id";
    }
    return isEligibleOrgScopedRecord(orgId, orgId) ? null : "opportunity_org_mismatch";
}
