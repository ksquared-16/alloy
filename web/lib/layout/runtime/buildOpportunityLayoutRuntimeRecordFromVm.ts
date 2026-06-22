/**
 * C1b — map opportunity VM paint record → layout runtime proof record shape.
 *
 * Operators see handles and labels only — never raw UUIDs, OCM ids, or table names.
 */

import {
    opportunityDisplayLocationFromRecord,
    resolveOpportunityLeadLocationFields,
} from "@/lib/opportunities/resolveOpportunityDisplayLocation";
import type { OpportunityDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/types";
import type { LayoutDoc } from "../layoutV2";
import { normalizeRefKeyOnRead } from "../layoutRefKeyAliases";
import { OPPORTUNITY_COMPUTE_KEYS } from "./opportunityRelationRegistry";
import { isOpaqueIdValue, type ProofRuntimeRecord } from "./proofRecordContext";
import { resolveHouseholdAddressFieldValues } from "./resolveHouseholdAddressFieldValues";
import { resolveOpportunityLayoutRuntimeChildrenRows } from "./mapLayoutRuntimeChildrenRows";
import { overlayPrimaryChildScalarsOnRecord } from "./overlayPrimaryChildScalarsOnRecord";
import { collectLayoutItems } from "./classifyLayoutItemBinding";
import {
    buildPrimaryContactPersonRelation,
    resolveOpportunityPrimaryContactPerson,
} from "./resolveOpportunityPrimaryContactPerson";
import {
    buildBillingContactPersonRelation,
    buildEmergencyContactPersonRelation,
    buildSecondaryContactPersonRelation,
    resolveOpportunityBillingContactPerson,
    resolveOpportunityEmergencyContactPerson,
    resolveOpportunitySecondaryContactPerson,
} from "./resolveOpportunityRoleContactPerson";

/**
 * Top-level field refKeys a LayoutDoc binds against the drawer record. Excludes
 * related_list collection columns (those bind per-row) and widget keys. Used to
 * guarantee every configured field is present on the runtime record so it renders
 * a label + value-or-placeholder rather than being silently absent.
 */
export function collectLayoutDocFieldRefKeys(doc: LayoutDoc): string[] {
    const seen = new Set<string>();
    for (const item of collectLayoutItems(doc)) {
        if (item.kind === "field" && item.refKey && item.refKey !== "_template") seen.add(item.refKey);
    }
    return [...seen];
}

function asDisplayValue(raw: unknown): string | null {
    if (raw == null) return null;
    const text = String(raw).trim();
    if (!text || isOpaqueIdValue(text)) return null;
    return text;
}

function pickDisplay(...values: unknown[]): string | null {
    for (const value of values) {
        if (value == null) continue;
        const text = String(value).trim();
        if (!text || isOpaqueIdValue(text)) continue;
        return text;
    }
    return null;
}

/** Preserve stored ids (e.g. location_id UUID) for editable select bindings. */
function pickStoredId(...values: unknown[]): string {
    for (const value of values) {
        if (value == null) continue;
        const text = String(value).trim();
        if (text) return text;
    }
    return "";
}

/**
 * Map one configured field refKey to a value from the VM record. Tries: the exact
 * key, the alias-on-read key, then namespace heuristics (opportunity.* ↔ bare key,
 * person.* from the already-resolved contact keys). Returns "" when no source
 * exists so the field still renders a label + blank placeholder ("—").
 */
function mapFieldRefKeyValue(refKey: string, vmRecord: Record<string, unknown>, record: Record<string, unknown>): string {
    if (refKey === "opportunity.location_id") {
        return pickStoredId(record["opportunity.location_id"], vmRecord.location_id, vmRecord._location_id);
    }
    if (refKey === "opportunity.location") {
        const label = pickDisplay(record["opportunity.location"], vmRecord._location_label, vmRecord._location_name);
        if (label) return label;
    }

    if (refKey === "customer.name" || refKey === "customer.household_name") {
        const label = pickDisplay(
            record[refKey],
            record._customer_name,
            record.name,
            record.title,
            vmRecord._customer_name,
            vmRecord.name,
            vmRecord.title,
        );
        if (label) return label;
    }

    const direct = asDisplayValue(vmRecord[refKey]);
    if (direct != null) return direct;

    const alias = normalizeRefKeyOnRead(refKey);
    if (alias !== refKey) {
        const aliased = asDisplayValue(vmRecord[alias] ?? record[alias]);
        if (aliased != null) return aliased;
    }

    const dot = refKey.indexOf(".");
    const entity = dot === -1 ? "opportunity" : refKey.slice(0, dot);
    const fieldKey = dot === -1 ? refKey : refKey.slice(dot + 1);

    if (entity === "opportunity") {
        const v = asDisplayValue(vmRecord[fieldKey] ?? vmRecord[`opportunity.${fieldKey}`]);
        if (v != null) return v;
    }
    if (entity === "person") {
        const v = asDisplayValue(record[`person.${fieldKey}`] ?? vmRecord[`person.${fieldKey}`]);
        if (v != null) return v;
        // Never fall back to generic person.phone / person.email for role-scoped fields.
        if (fieldKey.startsWith("secondary_") || fieldKey.startsWith("emergency_") || fieldKey.startsWith("billing_")) {
            return "";
        }
    }
    return "";
}

/** Evidence payload: which doc refKeys exist on the runtime record after mapping. */
export type LayoutRuntimeRecordBindingEvidence = {
    layoutItemRefKeys: string[];
    runtimeRecordKeys: string[];
    /** Field refKeys still absent on the record (should be empty after ensure). */
    missingRefKeys: string[];
};

export function buildLayoutRuntimeRecordBindingEvidence(
    doc: LayoutDoc,
    record: ProofRuntimeRecord,
): LayoutRuntimeRecordBindingEvidence {
    const layoutItemRefKeys = collectLayoutDocFieldRefKeys(doc);
    const recordKeys = new Set(Object.keys(record));
    return {
        layoutItemRefKeys,
        runtimeRecordKeys: [...recordKeys],
        missingRefKeys: layoutItemRefKeys.filter((rk) => !recordKeys.has(rk)),
    };
}

function resolveHouseholdNameFromVm(vmRecord: Record<string, unknown>): string | null {
    const ident = vmRecord._identity as Record<string, unknown> | null | undefined;
    const householdFromIdentity =
        ident?.household && typeof ident.household === "object"
            ? pickDisplay((ident.household as { label?: unknown }).label)
            : null;
    return pickDisplay(
        vmRecord.name,
        vmRecord.title,
        vmRecord._customer_name,
        householdFromIdentity,
        vmRecord["customer.name"],
        vmRecord["customer.household_name"],
        vmRecord.customer_name,
        vmRecord.household_name,
        vmRecord._household_name,
    );
}

function parseHouseholdLastName(name: string | null | undefined): string {
    const source = (name ?? "").trim();
    if (!source) return "";
    const withoutSuffix = source.replace(/\s+(household|family)$/i, "").trim();
    const parts = withoutSuffix.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "";
    if (/family|household/i.test(source) && parts.length >= 1) return parts[0] ?? "";
    if (source.includes(",")) return source.split(",")[0]?.trim() ?? parts[0] ?? "";
    return parts[parts.length - 1] ?? parts[0] ?? "";
}

export type BuildOpportunityLayoutRuntimeRecordInput = {
    vmRecord: Record<string, unknown>;
    opportunityId: string;
    statusDisplay?: string | null;
    summaries?: OpportunityDrawerViewModel["summaries"];
    /**
     * The effective/published LayoutDoc. When provided, every configured field
     * refKey is guaranteed present on the record (mapped from the VM or set to
     * "") so configured fields resolve and render rather than being absent.
     */
    doc?: LayoutDoc | null;
};

/** Build operator-safe layout runtime record from settled VM payload. */
export function buildOpportunityLayoutRuntimeRecordFromVm(
    input: BuildOpportunityLayoutRuntimeRecordInput,
): ProofRuntimeRecord {
    const { vmRecord, opportunityId, statusDisplay, summaries, doc } = input;

    const householdName = resolveHouseholdNameFromVm(vmRecord);
    const lastName = parseHouseholdLastName(householdName);

    const primaryContact = resolveOpportunityPrimaryContactPerson(vmRecord);
    const primaryName = primaryContact.displayName;
    const primaryPhone = primaryContact.phone;
    const primaryEmail = primaryContact.email;
    const primaryPersonId = primaryContact.personId;

    const secondaryContact = resolveOpportunitySecondaryContactPerson(vmRecord);
    const secondaryName = secondaryContact.displayName;
    const secondaryPhone = secondaryContact.phone;
    const secondaryEmail = secondaryContact.email;

    const emergencyContact = resolveOpportunityEmergencyContactPerson(vmRecord);
    const billingContact = resolveOpportunityBillingContactPerson(vmRecord);

    const firstName = pickDisplay(
        vmRecord["person.first_name"],
        vmRecord._primary_person_first_name,
        vmRecord.first_name,
    );
    const lastNameField = pickDisplay(
        vmRecord["person.last_name"],
        vmRecord._primary_person_last_name,
        vmRecord.last_name,
    );

    const location = opportunityDisplayLocationFromRecord(vmRecord);
    const leadLocation = resolveOpportunityLeadLocationFields(vmRecord);
    const opportunityLocationId = pickStoredId(
        vmRecord.location_id,
        vmRecord._location_id,
        leadLocation.locationId,
    );
    const leadLocationLabel =
        leadLocation.locationLabel
        || pickDisplay(vmRecord._location_label, vmRecord._location_name, vmRecord["opportunity.location"])
        || "";
    const siteLabel =
        location.kind === "single" ? location.label
        : location.kind === "multiple" ? location.label
        : leadLocationLabel || null;

    const householdAddressFields = resolveHouseholdAddressFieldValues(vmRecord);
    const householdAddress = householdAddressFields["location.household_address"]
        ?? pickDisplay(
            vmRecord["location.formatted_address"],
            vmRecord._household_address,
            vmRecord._formatted_address,
        );

    const programCategory = pickDisplay(
        vmRecord["enrollment.program_category"],
        vmRecord._program_category,
        vmRecord.desired_program_type,
    );

    const placementPriority = pickDisplay(
        vmRecord["enrollment.placement_priority"],
        vmRecord._placement_priority_display,
    );

    const statusKey = pickDisplay(vmRecord.status_key, vmRecord["opportunity.status_key"]);
    const statusLabel = pickDisplay(statusDisplay, vmRecord._status_display, statusKey);

    const tourDate = pickDisplay(
        vmRecord["opportunity.tour_date"],
        vmRecord.tour_date,
        vmRecord.tour_scheduled_at,
        vmRecord._tour_date_display,
    );
    const tourStatus = pickDisplay(vmRecord["opportunity.tour_status"], vmRecord.tour_status, vmRecord._tour_status);

    const source = pickDisplay(vmRecord["opportunity.source"], vmRecord.source);
    const channel = pickDisplay(vmRecord["opportunity.channel"], vmRecord.channel);
    const campaign = pickDisplay(vmRecord["opportunity.campaign"], vmRecord.campaign);

    const attention = pickDisplay(
        vmRecord._attention,
        vmRecord["opportunity.attention_reason"],
        vmRecord.attention_reason,
    );

    const layoutChildren = resolveOpportunityLayoutRuntimeChildrenRows(vmRecord);
    const hydratedChildren = applyOpportunityLocationFallbackToChildRows(layoutChildren, {
        locationId: opportunityLocationId,
        locationLabel: leadLocationLabel || siteLabel || "",
    });

    const taskPayload =
        summaries?.tasks ??
        (vmRecord._inquiry_summary_tasks && typeof vmRecord._inquiry_summary_tasks === "object"
            ? vmRecord._inquiry_summary_tasks
            : null);
    const workIntentRuntime =
        vmRecord._work_intent_runtime && typeof vmRecord._work_intent_runtime === "object"
            ? vmRecord._work_intent_runtime
            : null;
    const stageWorkRuntime =
        vmRecord._stage_work_runtime && typeof vmRecord._stage_work_runtime === "object"
            ? vmRecord._stage_work_runtime
            : null;
    const overviewData: Record<string, unknown> = {
        ...vmRecord,
        ...(taskPayload ? { _inquiry_summary_tasks: taskPayload } : {}),
        ...(workIntentRuntime ? { _work_intent_runtime: workIntentRuntime } : {}),
        ...(stageWorkRuntime ? { _stage_work_runtime: stageWorkRuntime } : {}),
    };

    const record: ProofRuntimeRecord = {
        ...vmRecord,
        id: opportunityId,
        name: householdName ?? "Opportunity",
        last_name: lastName,
        _customer_name: householdName ?? "",
        "customer.name": householdName ?? "",
        "customer.household_name": householdName ?? "",
        status_key: statusKey ?? "",
        _status_display: statusLabel ?? statusKey ?? "",
        "opportunity.status_key": statusKey ?? "",
        location_id: opportunityLocationId || null,
        _location_id: opportunityLocationId || null,
        "opportunity.location": leadLocationLabel || siteLabel || "",
        "opportunity.location_id": opportunityLocationId,
        "opportunity.tour_date": tourDate ?? "",
        "opportunity.tour_status": tourStatus ?? "",
        "opportunity.source": source ?? "",
        "opportunity.channel": channel ?? "",
        "opportunity.campaign": campaign ?? "",
        "opportunity.attention_reason": attention ?? "",
        "person.primary_contact_name": primaryName ?? "",
        "person.secondary_contact_name": secondaryName ?? "",
        "person.secondary_phone": secondaryPhone ?? "",
        "person.secondary_email": secondaryEmail ?? "",
        "person.emergency_contact_name": emergencyContact.displayName ?? "",
        "person.emergency_contact_phone": emergencyContact.phone ?? "",
        "person.emergency_contact_email": emergencyContact.email ?? "",
        "person.billing_contact_name": billingContact.displayName ?? "",
        "person.billing_contact_phone": billingContact.phone ?? "",
        "person.billing_contact_email": billingContact.email ?? "",
        "person.primary_phone": primaryPhone ?? "",
        "person.primary_email": primaryEmail ?? "",
        "person.phone": primaryPhone ?? "",
        "person.email": primaryEmail ?? "",
        "person.first_name": firstName ?? "",
        "person.last_name": lastNameField ?? "",
        "opportunity.primary_person_id": primaryPersonId ?? "",
        ...householdAddressFields,
        _overview_data: overviewData,
        _attention: attention ?? "",
        ...(taskPayload ? { _inquiry_summary_tasks: taskPayload } : {}),
        ...(workIntentRuntime ? { _work_intent_runtime: workIntentRuntime } : {}),
        ...(stageWorkRuntime ? { _stage_work_runtime: stageWorkRuntime } : {}),
        enrollment_children: hydratedChildren,
        children: hydratedChildren,
        tasks: Array.isArray(vmRecord._tasks_preview) ? vmRecord._tasks_preview : [],
        reminders: summaries?.reminders?.scheduled_sends ?? [],
        _relations: {
            ...(buildPrimaryContactPersonRelation(primaryContact) ?
                { primary_contact: buildPrimaryContactPersonRelation(primaryContact)! }
            :   {}),
            ...(buildSecondaryContactPersonRelation(secondaryContact) ?
                { secondary_contact: buildSecondaryContactPersonRelation(secondaryContact)! }
            :   {}),
            ...(buildEmergencyContactPersonRelation(emergencyContact) ?
                { emergency_contact: buildEmergencyContactPersonRelation(emergencyContact)! }
            :   {}),
            ...(buildBillingContactPersonRelation(billingContact) ?
                { billing_contact: buildBillingContactPersonRelation(billingContact)! }
            :   {}),
            ...(siteLabel ?
                {
                    enrollment_site_location: {
                        handle: siteLabel,
                        entityType: "location",
                        fields: { label: siteLabel },
                    },
                }
            :   {}),
            ...(householdAddress ?
                {
                    household_address: {
                        handle: householdAddress,
                        entityType: "location",
                        fields: { formatted_address: householdAddress },
                    },
                }
            :   {}),
        },
        _computed: {
            ...(programCategory ? { [OPPORTUNITY_COMPUTE_KEYS.program_category]: programCategory } : {}),
            ...(placementPriority ? { [OPPORTUNITY_COMPUTE_KEYS.placement_priority]: placementPriority } : {}),
        },
    };

    // Doc-driven completeness: every configured field refKey must exist on the
    // record (mapped from the VM where possible, else "") so production renders a
    // label + value-or-placeholder instead of an absent/blank field.
    if (doc) {
        const mutable = record as Record<string, unknown>;
        for (const refKey of collectLayoutDocFieldRefKeys(doc)) {
            if (mutable[refKey] !== undefined) continue;
            mutable[refKey] = mapFieldRefKeyValue(refKey, vmRecord, mutable);
        }
    }

    return overlayPrimaryChildScalarsOnRecord(record, hydratedChildren);
}

function applyOpportunityLocationFallbackToChildRows(
    rows: ProofRuntimeRecord[],
    opportunityLocation: { locationId: string; locationLabel: string },
): ProofRuntimeRecord[] {
    if (!opportunityLocation.locationId && !opportunityLocation.locationLabel) return rows;
    return rows.map((row) => {
        const hasChildLocation =
            pickDisplay(row["child.location"])
            || pickDisplay(row["inquiry_child.location_id"], row.location_id);
        if (hasChildLocation) return row;
        return {
            ...row,
            ...(opportunityLocation.locationLabel ? { "child.location": opportunityLocation.locationLabel } : {}),
            ...(opportunityLocation.locationId ?
                {
                    "inquiry_child.location_id": opportunityLocation.locationId,
                    location_id: opportunityLocation.locationId,
                }
            :   {}),
        };
    });
}
