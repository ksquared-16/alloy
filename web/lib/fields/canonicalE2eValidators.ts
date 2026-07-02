/**
 * Phase 7 E2E validators — pure assertions for canonical write/read roundtrips.
 */

import { buildCreateLeadOcmInsertRow } from "@/lib/admin/actions/createLeadChildOcmPersistence";
import { NEW_LEAD_STATUS_KEY } from "@/lib/admin/actions/createLeadActionConstants";
import { INQUIRY_CHILD_NATIVE_OCM_FIELD_KEYS } from "@/lib/fields/inquiryChildFieldRegistry";
import { CUSTOMER_MEMBER_PROFILE_FIELD_KEYS } from "@/lib/fields/canonicalFieldOwnership";
import { rejectLegacyTextStatusPatch } from "@/lib/fields/canonicalLegacyStatusWrite";
import { resolveChildProfileFieldValue } from "@/lib/fields/childProfileFieldResolution";
import { resolveCanonicalStatusKey } from "@/lib/fields/canonicalStatusRead";
import { migrateLayoutConfigRefKeys } from "@/lib/layout/migrateStoredLayoutRefKeys";

export type CanonicalValidationIssue = { code: string; message: string };

/** Opportunity insert/update must not carry legacy text status. */
export function validateOpportunityWritePayload(payload: Record<string, unknown>): CanonicalValidationIssue[] {
    const issues: CanonicalValidationIssue[] = [];
    const legacy = rejectLegacyTextStatusPatch(payload);
    if (legacy) issues.push({ code: "legacy_status_write", message: legacy });
    if (!payload.status_key && Object.keys(payload).some((k) => k === "status_key")) {
        issues.push({ code: "empty_status_key", message: "status_key must not be empty string when set" });
    }
    return issues;
}

/** OCM row must not contain profile native columns. */
export function validateOcmRowGrain(row: Record<string, unknown>): CanonicalValidationIssue[] {
    const issues: CanonicalValidationIssue[] = [];
    for (const key of CUSTOMER_MEMBER_PROFILE_FIELD_KEYS) {
        if (row[key] !== undefined && row[key] !== null) {
            issues.push({ code: "profile_on_ocm", message: `OCM must not store profile field ${key}` });
        }
    }
    if (!row.outcome_status_key && row.outcome_status_key !== null) {
        // outcome_status_key may be null during partial create — only flag wrong column name
    }
    if ("status" in row && row.status != null) {
        issues.push({ code: "legacy_ocm_status", message: "OCM must use outcome_status_key not status" });
    }
    return issues;
}

/** Customer member row should hold profile facts, not enrollment. */
export function validateCustomerMemberRowGrain(row: Record<string, unknown>): CanonicalValidationIssue[] {
    const issues: CanonicalValidationIssue[] = [];
    for (const key of INQUIRY_CHILD_NATIVE_OCM_FIELD_KEYS) {
        if (row[key] !== undefined && row[key] !== null) {
            issues.push({ code: "enrollment_on_profile", message: `customer_member must not store ${key}` });
        }
    }
    return issues;
}

export function validateCreateLeadOcmInsertRow(row: Record<string, unknown>): CanonicalValidationIssue[] {
    return [
        ...validateOcmRowGrain(row),
        ...(row.outcome_status_key !== NEW_LEAD_STATUS_KEY
            ? [{ code: "ocm_outcome", message: `expected outcome_status_key ${NEW_LEAD_STATUS_KEY}` }]
            : []),
        ...(row.customer_member_id ? [] : [{ code: "missing_cm_link", message: "customer_member_id required" }]),
    ];
}

/** Simulated profile PATCH + lifecycle read roundtrip. */
export function simulateChildProfileReadAfterPatch(input: {
    before: Record<string, unknown>;
    patch: Record<string, unknown>;
}): Record<string, unknown> {
    const merged = { ...input.before, ...input.patch };
    return {
        first_name: resolveChildProfileFieldValue(merged, "first_name"),
        last_name: resolveChildProfileFieldValue(merged, "last_name"),
        dob: resolveChildProfileFieldValue(merged, "dob"),
        gender: resolveChildProfileFieldValue(merged, "gender"),
        allergies: resolveChildProfileFieldValue(merged, "allergies"),
        medical_notes: resolveChildProfileFieldValue(merged, "medical_notes"),
    };
}

export function validateRuntimeStatusDisplayInput(row: Record<string, unknown>): CanonicalValidationIssue[] {
    const issues: CanonicalValidationIssue[] = [];
    if ("status" in row && row.status != null && !row.status_key) {
        issues.push({ code: "legacy_status_display", message: "Runtime must not rely on legacy status without status_key" });
    }
    const key = resolveCanonicalStatusKey(row);
    if (row.status_key && !key) {
        issues.push({ code: "invalid_status_key", message: "status_key present but unresolved" });
    }
    return issues;
}

export function validateLayoutAliasMigration(config: unknown): CanonicalValidationIssue[] {
    const clone =
        typeof config === "object" && config != null ? structuredClone(config as Record<string, unknown>) : config;
    const result = migrateLayoutConfigRefKeys(clone);
    if (!result.changed) return [];
    return result.refKeysRewritten.map((r) => ({ code: "layout_alias_migrated", message: r }));
}

/** Build expected OCM insert for tests / seed script parity. */
export function expectedCreateLeadOcmRow(args: {
    orgId: string;
    opportunityId: string;
    customerMemberId: string;
}): Record<string, unknown> {
    return buildCreateLeadOcmInsertRow({
        orgId: args.orgId,
        opportunityId: args.opportunityId,
        customerMemberId: args.customerMemberId,
        ocm: {
            location_id: null,
            program_category_id: null,
            schedule_type: null,
            start_date: null,
            program_room_cohort_key: null,
            notes: null,
        },
    });
}
