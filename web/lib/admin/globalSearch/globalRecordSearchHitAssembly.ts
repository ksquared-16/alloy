import { resolveGlobalSearchChildDrawerTarget, isGlobalSearchAdminV2DrawerEntityType } from "@/lib/admin/globalSearch/globalRecordSearchDrawerTarget";
import {
    globalSearchLeadPrimaryName,
    globalSearchLeadShortLabel,
} from "@/lib/admin/globalSearch/globalRecordSearchResultPresentation";
import { humanizeGlobalSearchStatusLabel } from "@/lib/admin/globalSearch/globalRecordSearchStatusLabel";
import type {
    GlobalRecordSearchGroupKey,
    GlobalRecordSearchHit,
    GlobalRecordSearchResultEntityType,
} from "@/lib/admin/globalSearch/globalRecordSearchTypes";
import type { GlobalSearchAdminV2DrawerEntityType } from "@/lib/admin/globalSearch/globalRecordSearchDrawerTarget";

type AssembleArgs = {
    entity_type: GlobalRecordSearchResultEntityType;
    entity_id: string;
    group: GlobalRecordSearchGroupKey;
    name: string;
    type_label: string;
    household_name?: string | null;
    opportunity_name?: string | null;
    status_key?: string | null;
    status_labels?: Map<string, string>;
    fallback_status_label?: string | null;
    location_label?: string | null;
    person_id?: string | null;
    customer_id?: string | null;
    opportunity_id?: string | null;
    age_label?: string | null;
};

export function assembleGlobalSearchHit(args: AssembleArgs): GlobalRecordSearchHit {
    const household = args.household_name?.trim() || null;
    const oppRaw = args.opportunity_name?.trim() || null;
    const leadShort = globalSearchLeadShortLabel(oppRaw, household);
    const displayName =
        args.group === "leads"
            ? globalSearchLeadPrimaryName({
                  name: args.name,
                  lead_short_label: leadShort,
                  household_name: household,
                  opportunity_name: oppRaw,
              })
            : args.name;
    const statusKey = args.status_key?.trim() || null;
    const status =
        (statusKey && args.status_labels ? humanizeGlobalSearchStatusLabel(statusKey, args.status_labels) : null) ??
        (args.fallback_status_label ? humanizeGlobalSearchStatusLabel(args.fallback_status_label, {}) : null) ??
        args.fallback_status_label ??
        null;

    const customerId = args.customer_id?.trim() || null;
    const oppId = args.opportunity_id?.trim() || null;
    const personId = args.person_id?.trim() || null;
    const clusterKey = customerId && oppId ? `${customerId}:${oppId}` : customerId;

    let open_entity_type: GlobalSearchAdminV2DrawerEntityType | null = null;
    let open_entity_id: string | null = null;
    if (args.group === "children") {
        const target = resolveGlobalSearchChildDrawerTarget({
            person_id: personId,
            customer_id: customerId,
            opportunity_id: oppId,
        });
        if (target) {
            open_entity_type = target.entity_type;
            open_entity_id = target.entity_id;
        }
    } else if (isGlobalSearchAdminV2DrawerEntityType(args.entity_type)) {
        open_entity_type = args.entity_type;
        open_entity_id = args.entity_id;
    }

    return {
        entity_type: args.entity_type,
        entity_id: args.entity_id,
        group: args.group,
        name: displayName,
        type_label: args.type_label,
        household_name: household,
        opportunity_name: oppRaw,
        lead_short_label: leadShort,
        status_label: status,
        location_label: args.location_label?.trim() || null,
        person_id: personId,
        customer_id: customerId,
        opportunity_id: oppId,
        cluster_key: clusterKey,
        age_label: args.age_label?.trim() || null,
        open_entity_type,
        open_entity_id,
    };
}
