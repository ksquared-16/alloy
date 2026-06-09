/**
 * C1b — map opportunity VM paint record → layout runtime proof record shape.
 *
 * Operators see handles and labels only — never raw UUIDs, OCM ids, or table names.
 */

import { opportunityDisplayLocationFromRecord } from "@/lib/opportunities/resolveOpportunityDisplayLocation";
import type { OpportunityDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/types";
import type { LayoutDoc } from "../layoutV2";
import { normalizeRefKeyOnRead } from "../layoutRefKeyAliases";
import { OPPORTUNITY_COMPUTE_KEYS } from "./opportunityRelationRegistry";
import { isOpaqueIdValue, type ProofRuntimeRecord } from "./proofRecordContext";
import { resolveOpportunityLayoutRuntimeChildrenRows } from "./mapLayoutRuntimeChildrenRows";
import { overlayPrimaryChildScalarsOnRecord } from "./overlayPrimaryChildScalarsOnRecord";
import { collectLayoutItems } from "./classifyLayoutItemBinding";
import {
    buildPrimaryContactPersonRelation,
    resolveOpportunityPrimaryContactPerson,
} from "./resolveOpportunityPrimaryContactPerson";

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

/**
 * Map one configured field refKey to a value from the VM record. Tries: the exact
 * key, the alias-on-read key, then namespace heuristics (opportunity.* ↔ bare key,
 * person.* from the already-resolved contact keys). Returns "" when no source
 * exists so the field still renders a label + blank placeholder ("—").
 */
function mapFieldRefKeyValue(refKey: string, vmRecord: Record<string, unknown>, record: Record<string, unknown>): string {
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
        // contact = Person record; reuse the keys the contact resolver already set.
        const v = asDisplayValue(record[`person.${fieldKey}`] ?? vmRecord[`person.${fieldKey}`]);
        if (v != null) return v;
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

function pickDisplay(...values: unknown[]): string | null {
    for (const value of values) {
        if (value == null) continue;
        const text = String(value).trim();
        if (!text || isOpaqueIdValue(text)) continue;
        return text;
    }
    return null;
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

    const householdName = pickDisplay(vmRecord.name, vmRecord.title, vmRecord._customer_name);
    const lastName = parseHouseholdLastName(householdName);

    const primaryContact = resolveOpportunityPrimaryContactPerson(vmRecord);
    const primaryName = primaryContact.displayName;
    const primaryPhone = primaryContact.phone;
    const primaryEmail = primaryContact.email;
    const primaryPersonId = primaryContact.personId;

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

    const secondaryName = pickDisplay(
        vmRecord["person.secondary_contact_name"],
        vmRecord._secondary_contact_name,
    );

    const location = opportunityDisplayLocationFromRecord(vmRecord);
    const siteLabel =
        location.kind === "single" ? location.label
        : location.kind === "multiple" ? location.label
        : pickDisplay(vmRecord._location_label, vmRecord._location_name, vmRecord["opportunity.location"]);

    const householdAddress = pickDisplay(
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

    const taskPayload =
        summaries?.tasks ??
        (vmRecord._inquiry_summary_tasks && typeof vmRecord._inquiry_summary_tasks === "object"
            ? vmRecord._inquiry_summary_tasks
            : null);
    const overviewData: Record<string, unknown> = {
        ...vmRecord,
        ...(taskPayload ? { _inquiry_summary_tasks: taskPayload } : {}),
    };

    const record: ProofRuntimeRecord = {
        ...vmRecord,
        id: opportunityId,
        name: householdName ?? "Opportunity",
        last_name: lastName,
        status_key: statusKey ?? "",
        _status_display: statusLabel ?? statusKey ?? "",
        "opportunity.status_key": statusKey ?? "",
        "opportunity.location": siteLabel ?? "",
        "opportunity.tour_date": tourDate ?? "",
        "opportunity.tour_status": tourStatus ?? "",
        "opportunity.source": source ?? "",
        "opportunity.channel": channel ?? "",
        "opportunity.campaign": campaign ?? "",
        "opportunity.attention_reason": attention ?? "",
        "person.primary_contact_name": primaryName ?? "",
        "person.secondary_contact_name": secondaryName ?? "",
        "person.primary_phone": primaryPhone ?? "",
        "person.primary_email": primaryEmail ?? "",
        "person.phone": primaryPhone ?? "",
        "person.email": primaryEmail ?? "",
        "person.first_name": firstName ?? "",
        "person.last_name": lastNameField ?? "",
        "opportunity.primary_person_id": primaryPersonId ?? "",
        _overview_data: overviewData,
        _attention: attention ?? "",
        ...(taskPayload ? { _inquiry_summary_tasks: taskPayload } : {}),
        enrollment_children: layoutChildren,
        children: layoutChildren,
        tasks: Array.isArray(vmRecord._tasks_preview) ? vmRecord._tasks_preview : [],
        reminders: summaries?.reminders?.scheduled_sends ?? [],
        _relations: {
            ...(buildPrimaryContactPersonRelation(primaryContact) ?
                { primary_contact: buildPrimaryContactPersonRelation(primaryContact)! }
            :   {}),
            ...(secondaryName ?
                {
                    secondary_contact: {
                        handle: secondaryName,
                        entityType: "person",
                        fields: { secondary_contact_name: secondaryName },
                    },
                }
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

    return overlayPrimaryChildScalarsOnRecord(record, layoutChildren);
}
