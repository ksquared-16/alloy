/**
 * Opportunity queue row → layout runtime record adapter.
 *
 * Maps a queue row VM (`QueueItemVm.semanticCrmCompact` slots) to the refKeys the
 * configured queue LayoutDoc reads (see buildLeadQueueDefaultDoc): header title,
 * status, attention, location; body contact (Person) + children (enrollment-child
 * rows) + tour. VALUES only — structure/zones come from the resolved queue doc.
 * Missing optional values are emitted blank so the card renders them empty.
 */

import type { CrmCompactRowSemanticSlots, QueueItemVm } from "@/lib/ui-v2/workspace-types";

function clean(...values: (string | null | undefined)[]): string {
    for (const value of values) {
        if (value == null) continue;
        const text = String(value).trim();
        if (text && text !== "—") return text;
    }
    return "";
}

/** "Nguyen Household" / "Nguyen" → "Nguyen" so the `{last_name} Household` title isn't doubled. */
function householdLastName(primaryIdentity: string | null | undefined): string {
    const id = clean(primaryIdentity);
    if (!id) return "";
    return id.replace(/\s+household$/i, "").trim() || id;
}

type QueueChildRow = Record<string, string>;

function mapChildren(slots: CrmCompactRowSemanticSlots): QueueChildRow[] {
    const lines = Array.isArray(slots.childrenLines) ? slots.childrenLines : [];
    if (lines.length > 0) {
        return lines.map((line, index) => ({
            id: clean(line.personId) || `child-${index}`,
            "child.id": clean(line.personId),
            "child.name": clean(line.primary) || "—",
            "child.age_band": clean(line.secondary),
            "child.program": clean(line.programInline),
            "child.status": "",
        }));
    }
    const single = clean(slots.childName);
    if (!single) return [];
    return [
        {
            id: clean(slots.childPersonId) || "child-0",
            "child.id": clean(slots.childPersonId),
            "child.name": single,
            "child.age_band": clean(slots.ageBandContext, slots.ageContext),
            "child.program": clean(slots.programContext),
            "child.status": "",
        },
    ];
}

/** Build the operator-safe queue card record from a queue row VM. */
export function buildOpportunityQueueLayoutRuntimeRecordFromVm(item: QueueItemVm): Record<string, unknown> {
    const slots = item.semanticCrmCompact;
    if (!slots) {
        // No semantic slots — fall back to the bare title so the card still identifies the row.
        return {
            id: item.opportunityId ?? item.id,
            last_name: clean(item.title),
            _status_display: clean(item.subtitle),
            "opportunity.status_key": clean(item.subtitle),
            children: [],
        };
    }

    const statusLabel = clean(slots.statusLabel, item.subtitle);

    return {
        id: item.opportunityId ?? item.id,
        last_name: householdLastName(slots.primaryIdentity) || clean(item.title),
        _status_display: statusLabel,
        "opportunity.status_key": statusLabel,
        _attention: clean(slots.attentionReason),
        "opportunity.location": clean(slots.locationContext),
        "person.primary_contact_name": clean(slots.contactDisplayName, slots.contactSnippet),
        "person.primary_phone": clean(slots.contactPhoneDisplay),
        "person.primary_email": clean(slots.contactEmail),
        "opportunity.tour_date": clean(slots.tourContext, slots.crmCompactTimingValueLine),
        "opportunity.desired_start_date": clean(slots.desiredStartDateDisplay),
        children: mapChildren(slots),
    };
}
