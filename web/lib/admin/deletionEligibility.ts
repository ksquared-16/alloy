/**
 * Record lifecycle / deletion eligibility framework (V1).
 * Evaluates whether a record is: hard deletable, archive/deactivate preferred, or blocked.
 * Structured so future accounting-period checks can be added without changing the shape.
 */

import { createAdminClient } from "@/lib/supabaseAdmin";

export type RecommendedAction =
    | "delete"
    | "archive"
    | "deactivate"
    | "cancel"
    | "reverse"
    | "blocked";

export interface DeletionEligibilityResult {
    /** If true, hard delete is allowed. */
    allowed: boolean;
    /** Human-readable reason (e.g. why blocked or confirmation). */
    reason: string;
    recommended_action: RecommendedAction;
}

/** Entity types we can evaluate. Includes config, operational, and financial. */
export type DeletionEligibilityEntityType =
    | "pricing_modes"
    | "pricing_dimensions"
    | "pricing_dimension_values"
    | "service_offerings"
    | "service_plan_templates"
    | "addons"
    | "discounts"
    | "entity_labels"
    | "customers"
    | "vendors"
    | "locations"
    | "opportunities"
    | "jobs"
    | "schedules"
    | "contacts"
    | "customer_members"
    | "payments"
    | "ledger_transactions"
    | "gl_journal_entries"
    | "gl_journal_lines";

type Evaluator = (
    id: string,
    options: { orgId: string | null }
) => Promise<DeletionEligibilityResult>;

/**
 * Check for existing references (count). Returns 0 or positive.
 */
async function countRef(
    table: string,
    column: string,
    value: string,
    orgColumn?: string,
    orgId?: string | null
): Promise<number> {
    const supabase = createAdminClient();
    let q = supabase.from(table).select("id", { count: "exact", head: true }).eq(column, value);
    if (orgColumn && orgId) q = q.eq(orgColumn, orgId);
    const { count, error } = await q;
    if (error) return 0;
    return count ?? 0;
}

// ---- A. Hard delete when safe (config) ----

const evalPricingModes: Evaluator = async (id, { orgId: _orgId }) => {
    const n = await countRef("pricing_matrix", "pricing_mode_id", id);
    if (n > 0)
        return {
            allowed: false,
            reason: "Cannot delete: referenced by pricing matrix or pricing rules.",
            recommended_action: "blocked",
        };
    return { allowed: true, reason: "Not referenced; safe to delete.", recommended_action: "delete" };
};

const evalPricingDimensions: Evaluator = async (id) => {
    const n = await countRef("pricing_dimension_values", "dimension_id", id);
    if (n > 0)
        return {
            allowed: false,
            reason: "Cannot delete: dimension has values. Remove or reassign values first.",
            recommended_action: "blocked",
        };
    return { allowed: true, reason: "Not referenced; safe to delete.", recommended_action: "delete" };
};

const evalPricingDimensionValues: Evaluator = async (id) => {
    const matrix = await countRef("pricing_matrix", "pricing_dimension_value_id", id);
    if (matrix > 0)
        return {
            allowed: false,
            reason: "Cannot delete: referenced by pricing matrix or pricing rules.",
            recommended_action: "blocked",
        };
    return { allowed: true, reason: "Not referenced; safe to delete.", recommended_action: "delete" };
};

const evalServiceOfferings: Evaluator = async (id, { orgId }) => {
    const matrix = await countRef("pricing_matrix", "service_offering_id", id);
    if (matrix > 0)
        return {
            allowed: false,
            reason: "Cannot delete: referenced by pricing matrix.",
            recommended_action: "blocked",
        };
    const services = await countRef("pricing_services", "service_offering_id", id);
    if (services > 0)
        return {
            allowed: false,
            reason: "Cannot delete: referenced by pricing services.",
            recommended_action: "blocked",
        };
    return { allowed: true, reason: "Not referenced; safe to delete.", recommended_action: "delete" };
};

const evalServicePlanTemplates: Evaluator = async (id, { orgId: _orgId }) => {
    const matrix = await countRef("pricing_matrix", "service_plan_template_id", id);
    if (matrix > 0)
        return {
            allowed: false,
            reason: "Cannot delete: referenced by pricing matrix.",
            recommended_action: "blocked",
        };
    const freq = await countRef("pricing_frequencies", "service_plan_template_id", id);
    if (freq > 0)
        return {
            allowed: false,
            reason: "Cannot delete: referenced by pricing frequencies.",
            recommended_action: "blocked",
        };
    return { allowed: true, reason: "Not referenced; safe to delete.", recommended_action: "delete" };
};

const evalAddons: Evaluator = async (id) => {
    // pricing_addons may be referenced by job addons or similar; if no FK in schema, allow
    return { allowed: true, reason: "Add-on delete allowed when not in use.", recommended_action: "delete" };
};

const evalDiscounts: Evaluator = async (id) => {
    const supabase = createAdminClient();
    const { data: program } = await supabase
        .from("discount_programs")
        .select("id, legacy_discount_code_id")
        .eq("id", id)
        .maybeSingle();

    if (!program) {
        return {
            allowed: false,
            reason: "Discount program not found (admin deletes use discount program id).",
            recommended_action: "blocked",
        };
    }

    const legacyId = (program as { legacy_discount_code_id?: string | null }).legacy_discount_code_id ?? null;
    const codeIdForRefs = legacyId;

    if (codeIdForRefs) {
        const redemptions = await countRef("discount_redemptions", "discount_code_id", codeIdForRefs);
        if (redemptions > 0)
            return {
                allowed: false,
                reason: "Cannot delete: linked legacy code has redemptions. Deactivate the program instead.",
                recommended_action: "deactivate",
            };
        const jobs = await countRef("jobs", "discount_code_id", codeIdForRefs);
        if (jobs > 0)
            return {
                allowed: false,
                reason: "Cannot delete: linked legacy code is referenced by jobs. Deactivate the program instead.",
                recommended_action: "deactivate",
            };
    }

    return { allowed: true, reason: "Not referenced by legacy job/redemption FKs; safe to delete program row.", recommended_action: "delete" };
};

const evalEntityLabels: Evaluator = async () => {
    return { allowed: true, reason: "Entity label override can be removed.", recommended_action: "delete" };
};

// ---- B. Archive / deactivate preferred (operational) ----

const evalCustomers: Evaluator = async (id) => {
    const jobs = await countRef("jobs", "customer_id", id);
    const opportunities = await countRef("opportunities", "customer_id", id);
    const contacts = await countRef("contacts", "customer_id", id);
    if (jobs > 0 || opportunities > 0 || contacts > 0)
        return {
            allowed: false,
            reason: "Customer has jobs, opportunities, or contacts. Use archive instead of delete.",
            recommended_action: "archive",
        };
    return {
        allowed: false,
        reason: "Operational records should be archived or deactivated, not hard-deleted.",
        recommended_action: "archive",
    };
};

const evalVendors: Evaluator = async (id) => {
    const jobs = await countRef("jobs", "assigned_vendor_id", id);
    if (jobs > 0)
        return {
            allowed: false,
            reason: "Vendor is assigned to jobs. Use archive instead of delete.",
            recommended_action: "archive",
        };
    return {
        allowed: false,
        reason: "Operational records should be archived or deactivated, not hard-deleted.",
        recommended_action: "archive",
    };
};

const evalLocations: Evaluator = async (id) => {
    const jobs = await countRef("jobs", "location_id", id);
    const schedules = await countRef("schedules", "location_id", id);
    if (jobs > 0 || schedules > 0)
        return {
            allowed: false,
            reason: "Location is used by jobs or schedules. Use archive instead of delete.",
            recommended_action: "archive",
        };
    return {
        allowed: false,
        reason: "Operational records should be archived or deactivated, not hard-deleted.",
        recommended_action: "archive",
    };
};

const evalOpportunities: Evaluator = async (id) => {
    const jobs = await countRef("jobs", "opportunity_id", id);
    if (jobs > 0)
        return {
            allowed: false,
            reason: "Opportunity has linked jobs. Use archive or cancel instead of delete.",
            recommended_action: "archive",
        };
    return {
        allowed: false,
        reason: "Operational records should be archived or deactivated, not hard-deleted.",
        recommended_action: "archive",
    };
};

const evalJobs: Evaluator = async (id) => {
    const schedules = await countRef("schedules", "job_id", id);
    if (schedules > 0)
        return {
            allowed: false,
            reason: "Job has schedules or visit history. Use archive or cancel instead of delete.",
            recommended_action: "archive",
        };
    return {
        allowed: false,
        reason: "Operational records should be archived or deactivated, not hard-deleted.",
        recommended_action: "archive",
    };
};

const evalSchedules: Evaluator = async () => {
    return {
        allowed: false,
        reason: "Schedules have operational and financial history. Use cancel, not delete.",
        recommended_action: "cancel",
    };
};

const evalContacts: Evaluator = async (id) => {
    const memberLinks = await countRef("customer_member_contacts", "contact_id", id);
    if (memberLinks > 0)
        return {
            allowed: false,
            reason: "Contact is linked to customer members. Use archive instead of delete.",
            recommended_action: "archive",
        };
    return {
        allowed: false,
        reason: "Operational records should be archived or deactivated, not hard-deleted.",
        recommended_action: "archive",
    };
};

const evalCustomerMembers: Evaluator = async (id) => {
    const links = await countRef("customer_member_contacts", "customer_member_id", id);
    if (links > 0)
        return {
            allowed: false,
            reason: "Member has linked contacts. Use archive instead of delete.",
            recommended_action: "archive",
        };
    return {
        allowed: false,
        reason: "Operational records should be archived or deactivated, not hard-deleted.",
        recommended_action: "archive",
    };
};

// ---- C. Never hard delete (financial) ----

const evalPayments: Evaluator = async () => ({
    allowed: false,
    reason: "Payments are financial records and cannot be deleted. Use reversal or adjustment.",
    recommended_action: "reverse",
});

const evalLedgerTransactions: Evaluator = async () => ({
    allowed: false,
    reason: "Ledger transactions are financial history and cannot be deleted.",
    recommended_action: "blocked",
});

const evalGlJournalEntries: Evaluator = async () => ({
    allowed: false,
    reason: "Journal entries are financial history and cannot be deleted.",
    recommended_action: "blocked",
});

const evalGlJournalLines: Evaluator = async () => ({
    allowed: false,
    reason: "Journal lines are financial history and cannot be deleted.",
    recommended_action: "blocked",
});

// ---- Evaluator map ----

const EVALUATORS: Record<DeletionEligibilityEntityType, Evaluator> = {
    pricing_modes: evalPricingModes,
    pricing_dimensions: evalPricingDimensions,
    pricing_dimension_values: evalPricingDimensionValues,
    service_offerings: evalServiceOfferings,
    service_plan_templates: evalServicePlanTemplates,
    addons: evalAddons,
    discounts: evalDiscounts,
    entity_labels: evalEntityLabels,
    customers: evalCustomers,
    vendors: evalVendors,
    locations: evalLocations,
    opportunities: evalOpportunities,
    jobs: evalJobs,
    schedules: evalSchedules,
    contacts: evalContacts,
    customer_members: evalCustomerMembers,
    payments: evalPayments,
    ledger_transactions: evalLedgerTransactions,
    gl_journal_entries: evalGlJournalEntries,
    gl_journal_lines: evalGlJournalLines,
};

/**
 * Evaluate deletion eligibility for a record.
 * Use from API routes or server code only (uses createAdminClient).
 * Future: add optional accountingPeriodCheck(result, id, orgId) that can set allowed=false and reason.
 */
export async function evaluateDeletionEligibility(
    entityType: DeletionEligibilityEntityType,
    id: string,
    options: { orgId?: string | null } = {}
): Promise<DeletionEligibilityResult> {
    const evaluator = EVALUATORS[entityType];
    if (!evaluator) {
        return {
            allowed: false,
            reason: "Deletion eligibility is not defined for this record type.",
            recommended_action: "blocked",
        };
    }
    const result = await evaluator(id, { orgId: options.orgId ?? null });
    // Future: if (options.accountingPeriodCheck) { const block = await options.accountingPeriodCheck(entityType, id, options.orgId); if (block) return block; }
    return result;
}

/** Entity types that have an evaluator (for API validation). */
export function isDeletionEligibilityEntityType(
    type: string
): type is DeletionEligibilityEntityType {
    return type in EVALUATORS;
}
