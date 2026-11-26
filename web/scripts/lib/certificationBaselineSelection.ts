/**
 * Certification baseline — anchors A2 and A3.
 *
 * @see docs/handoffs/firefly-certification-deletion-contract.md
 *
 * The opportunity-anchored reset can only delete what an opportunity points at. On a tenant with 8
 * opportunities and 59 customers that leaves most of the operational population in place while
 * verification reports success — a baseline believed clean that is not.
 *
 * This module adds the two anchors that close the gap, and it is deliberately PURE: it takes rows
 * and returns a classification with reasons. The dangerous decisions here are "may this identity be
 * deleted" and "is this shape one we actually model", and both must be testable without a database.
 */

/** A person or customer, classified. Every identity gets exactly one of these. */
export type IdentityClass = "target" | "protected" | "ambiguous";

export type IdentityVerdict = {
    id: string;
    class: IdentityClass;
    /** Why — recorded for every class, because a delete list without reasons is not reviewable. */
    reason: string;
};

export type CustomerRow = {
    id: string;
    org_id?: string | null;
    name?: string | null;
};

export type PersonRow = {
    id: string;
    org_id?: string | null;
    full_name?: string | null;
    is_employee?: boolean | null;
};

export type CertificationClassificationInput = {
    orgId: string;
    /** Customers in the org. */
    customers: CustomerRow[];
    /** Persons in the org. */
    persons: PersonRow[];
    /** Opportunities in the org, with their identity FKs. */
    opportunities: Array<{ id: string; customer_id?: string | null; primary_person_id?: string | null }>;
    /** Opportunity ids selected for deletion by anchor A1. */
    targetOpportunityIds: string[];
    /** opportunity_persons join rows. */
    opportunityPersonRefs: Array<{ opportunity_id: string; person_id: string }>;
    /** customer_persons + customer_members links (person ↔ customer). */
    personCustomerLinks: Array<{ customer_id: string; person_id: string }>;
    /** contacts rows that tie a person to a customer. */
    contactRefs?: Array<{ customer_id?: string | null; person_id?: string | null }>;
    /** Customers protected for an external reason (golden path), never targets. */
    protectedCustomerIds?: string[];
    /** Persons protected for an external reason, never targets. */
    protectedPersonIds?: string[];
};

export type CertificationClassification = {
    customers: IdentityVerdict[];
    persons: IdentityVerdict[];
    targetCustomerIds: string[];
    targetPersonIds: string[];
    protectedCustomerIds: string[];
    protectedPersonIds: string[];
    /** Non-empty means the run must refuse. */
    ambiguous: IdentityVerdict[];
};

function assertOrg(rows: Array<{ id: string; org_id?: string | null }>, orgId: string, label: string): void {
    for (const r of rows) {
        if (r.org_id != null && r.org_id !== orgId) {
            throw new Error(`[certification ${label}] refusing out-of-org row ${r.id} (org_id=${r.org_id}, expected ${orgId})`);
        }
    }
}

/**
 * Classify every operational identity in the org.
 *
 * Preserved opportunities — those NOT selected by A1 — are what make an identity protected. That is
 * the same rule the opportunity-anchored guard already uses; widening the candidate set does not
 * change what "shared" means, only how many identities get asked the question.
 */
export function classifyCertificationIdentities(
    input: CertificationClassificationInput,
): CertificationClassification {
    assertOrg(input.customers, input.orgId, "customers");
    assertOrg(input.persons, input.orgId, "persons");

    const targetOpps = new Set(input.targetOpportunityIds);
    const preservedOpps = input.opportunities.filter((o) => !targetOpps.has(o.id));
    const externallyProtectedCustomers = new Set(input.protectedCustomerIds ?? []);
    const externallyProtectedPersons = new Set(input.protectedPersonIds ?? []);

    // --- customers -------------------------------------------------------------------------
    const preservedOppCustomerIds = new Set(
        preservedOpps.map((o) => o.customer_id).filter((v): v is string => Boolean(v)),
    );

    const customerVerdicts: IdentityVerdict[] = input.customers.map((cust) => {
        if (externallyProtectedCustomers.has(cust.id)) {
            return { id: cust.id, class: "protected", reason: "referenced by a golden-path protected record" };
        }
        if (preservedOppCustomerIds.has(cust.id)) {
            return { id: cust.id, class: "protected", reason: "referenced by an opportunity outside the deletion scope" };
        }
        return { id: cust.id, class: "target", reason: "operational household referenced by no preserved record" };
    });

    const targetCustomerIds = new Set(
        customerVerdicts.filter((v) => v.class === "target").map((v) => v.id),
    );

    // --- persons ---------------------------------------------------------------------------
    const preservedOppPersonIds = new Set(
        preservedOpps.map((o) => o.primary_person_id).filter((v): v is string => Boolean(v)),
    );
    for (const ref of input.opportunityPersonRefs) {
        if (!targetOpps.has(ref.opportunity_id)) preservedOppPersonIds.add(ref.person_id);
    }

    // A person linked to any customer we are NOT deleting is shared and stays.
    const personsOnPreservedCustomer = new Set<string>();
    const personsOnTargetCustomer = new Set<string>();
    for (const link of input.personCustomerLinks) {
        if (targetCustomerIds.has(link.customer_id)) personsOnTargetCustomer.add(link.person_id);
        else personsOnPreservedCustomer.add(link.person_id);
    }
    for (const ref of input.contactRefs ?? []) {
        if (ref.person_id && ref.customer_id && !targetCustomerIds.has(ref.customer_id)) {
            personsOnPreservedCustomer.add(ref.person_id);
        }
    }

    // Referenced by an opportunity we are deleting — a target, not an unmodelled shape.
    const personsOnTargetOpportunity = new Set<string>();
    for (const ref of input.opportunityPersonRefs) {
        if (targetOpps.has(ref.opportunity_id)) personsOnTargetOpportunity.add(ref.person_id);
    }
    for (const o of input.opportunities) {
        if (targetOpps.has(o.id) && o.primary_person_id) personsOnTargetOpportunity.add(o.primary_person_id);
    }

    const anyPersonReference = new Set<string>([
        ...input.personCustomerLinks.map((l) => l.person_id),
        ...input.opportunityPersonRefs.map((r) => r.person_id),
        ...input.opportunities.map((o) => o.primary_person_id).filter((v): v is string => Boolean(v)),
        ...(input.contactRefs ?? []).map((r) => r.person_id).filter((v): v is string => Boolean(v)),
    ]);

    const personVerdicts: IdentityVerdict[] = input.persons.map((p) => {
        if (p.is_employee === true) {
            return { id: p.id, class: "protected", reason: "staff identity (is_employee)" };
        }
        if (externallyProtectedPersons.has(p.id)) {
            return { id: p.id, class: "protected", reason: "referenced by a golden-path protected record" };
        }
        if (preservedOppPersonIds.has(p.id)) {
            return { id: p.id, class: "protected", reason: "referenced by an opportunity outside the deletion scope" };
        }
        if (personsOnPreservedCustomer.has(p.id)) {
            return { id: p.id, class: "protected", reason: "linked to a household outside the deletion scope" };
        }
        if (personsOnTargetCustomer.has(p.id)) {
            return { id: p.id, class: "target", reason: "member of an operational household being removed" };
        }
        if (personsOnTargetOpportunity.has(p.id)) {
            return { id: p.id, class: "target", reason: "participant on an opportunity being removed" };
        }
        if (!anyPersonReference.has(p.id)) {
            // Nothing points at this person. In an org whose person population is operational this
            // is a target, but it is reported under its own reason so the breadth stays visible.
            return { id: p.id, class: "target", reason: "operational person referenced by nothing" };
        }
        // Referenced by something the contract does not model. Do NOT guess.
        return { id: p.id, class: "ambiguous", reason: "referenced by a relationship this contract does not model" };
    });

    const ambiguous = [...customerVerdicts, ...personVerdicts].filter((v) => v.class === "ambiguous");

    return {
        customers: customerVerdicts,
        persons: personVerdicts,
        targetCustomerIds: [...targetCustomerIds],
        targetPersonIds: personVerdicts.filter((v) => v.class === "target").map((v) => v.id),
        protectedCustomerIds: customerVerdicts.filter((v) => v.class === "protected").map((v) => v.id),
        protectedPersonIds: personVerdicts.filter((v) => v.class === "protected").map((v) => v.id),
        ambiguous,
    };
}

/** FK-safe delete order for the Processing operational graph (anchor A3). */
export const PROCESSING_CLEANUP_TABLE_ORDER = [
    "processing_plan_operations",
    "processing_commit_attempts",
    "processing_approvals",
    "processing_exceptions",
    "processing_resolutions",
    "processing_facts",
    "processing_case_sources",
    "processing_commit_plans",
    "processing_cases",
] as const;

export type ProcessingCleanupTable = (typeof PROCESSING_CLEANUP_TABLE_ORDER)[number];

/**
 * How each Processing table hangs off the graph.
 *
 * Stated explicitly rather than assumed, because the column is NOT uniform: `processing_case_sources`
 * uses `processing_case_id` while every other case-linked table uses `case_id`, and
 * `processing_plan_operations` hangs off the plan instead. A run that assumed `case_id` everywhere
 * failed on the first hosted attempt — which is the good outcome, but only because the count was
 * checked. Encoding it removes the guess.
 */
export const PROCESSING_LINK_COLUMN: Record<ProcessingCleanupTable, "case_id" | "processing_case_id" | "plan_id" | "id"> = {
    processing_plan_operations: "plan_id",
    processing_commit_attempts: "case_id",
    processing_approvals: "case_id",
    processing_exceptions: "case_id",
    processing_resolutions: "case_id",
    processing_facts: "case_id",
    processing_case_sources: "processing_case_id",
    processing_commit_plans: "case_id",
    processing_cases: "id",
};

/**
 * Which processing cases anchor A3 selects.
 *
 * A case anchored to a PRESERVED opportunity or customer stays — it is evidence about a record we
 * are keeping. Everything else in the org is uncommitted intake for records that are going away, or
 * for no record at all.
 */
export function selectProcessingCaseIds(input: {
    cases: Array<{ id: string; primary_opportunity_id?: string | null; primary_customer_id?: string | null }>;
    targetOpportunityIds: string[];
    targetCustomerIds: string[];
    allOpportunityIds: string[];
    allCustomerIds: string[];
}): { targetCaseIds: string[]; preserved: Array<{ id: string; reason: string }> } {
    const targetOpps = new Set(input.targetOpportunityIds);
    const targetCusts = new Set(input.targetCustomerIds);
    const allOpps = new Set(input.allOpportunityIds);
    const allCusts = new Set(input.allCustomerIds);

    const targetCaseIds: string[] = [];
    const preserved: Array<{ id: string; reason: string }> = [];

    for (const k of input.cases) {
        const opp = k.primary_opportunity_id ?? null;
        const cust = k.primary_customer_id ?? null;
        if (opp && allOpps.has(opp) && !targetOpps.has(opp)) {
            preserved.push({ id: k.id, reason: `anchored to preserved opportunity ${opp}` });
            continue;
        }
        if (cust && allCusts.has(cust) && !targetCusts.has(cust)) {
            preserved.push({ id: k.id, reason: `anchored to preserved customer ${cust}` });
            continue;
        }
        targetCaseIds.push(k.id);
    }

    return { targetCaseIds, preserved };
}
