import type { AdminDrawerEntityType } from "@/contexts/AdminDrawerContext";
import type { GlobalSearchAdminV2DrawerEntityType } from "@/lib/admin/globalSearch/globalRecordSearchDrawerTarget";

/** Search result grain (may differ from drawer open target for children). */
export type GlobalRecordSearchResultEntityType = Extract<
    AdminDrawerEntityType,
    "customer_members" | "persons" | "customers" | "opportunities" | "locations"
>;

export type GlobalRecordSearchGroupKey = "children" | "parents" | "leads" | "locations";

export type GlobalRecordSearchHit = {
    /** Result grain for grouping/display. */
    entity_type: GlobalRecordSearchResultEntityType;
    entity_id: string;
    group: GlobalRecordSearchGroupKey;
    name: string;
    type_label: string;
    household_name: string | null;
    opportunity_name: string | null;
    /** Short token for meta pills — e.g. Chen */
    lead_short_label: string | null;
    status_label: string | null;
    location_label: string | null;
    person_id?: string | null;
    customer_id?: string | null;
    opportunity_id?: string | null;
    cluster_key?: string | null;
    /** AdminV2 drawer open target — never customer_members/contacts. */
    open_entity_type?: GlobalSearchAdminV2DrawerEntityType | null;
    open_entity_id?: string | null;
};

export type GlobalRecordSearchGroup = {
    key: GlobalRecordSearchGroupKey;
    label: string;
    hits: GlobalRecordSearchHit[];
};

/** Household-centric cluster for scannable family results. */
export type GlobalRecordSearchCluster = {
    key: string;
    household_name: string | null;
    lead_short_label: string | null;
    location_label: string | null;
    status_label: string | null;
    anchors: GlobalRecordSearchHit[];
    children: GlobalRecordSearchHit[];
    parents: GlobalRecordSearchHit[];
    locations?: GlobalRecordSearchHit[];
    /** Hidden child rows beyond per-cluster display cap. */
    children_overflow?: number;
};

export type GlobalRecordSearchResponse = {
    ok: true;
    q: string;
    groups: GlobalRecordSearchGroup[];
    clusters: GlobalRecordSearchCluster[];
    results: GlobalRecordSearchHit[];
};

export const GLOBAL_RECORD_SEARCH_GROUP_ORDER: GlobalRecordSearchGroupKey[] = [
    "children",
    "parents",
    "leads",
    "locations",
];

export const GLOBAL_RECORD_SEARCH_GROUP_LABELS: Record<GlobalRecordSearchGroupKey, string> = {
    children: "Children",
    parents: "Parents & guardians",
    leads: "Leads",
    locations: "Campuses",
};

export const GLOBAL_RECORD_SEARCH_DEFAULT_LIMIT = 48;
export const GLOBAL_RECORD_SEARCH_PER_GROUP_CAP = 12;
/** Fetch cap for child member rows before household expansion merge. */
export const GLOBAL_SEARCH_CHILD_MEMBER_FETCH_CAP = 48;
/** Max children shown per family cluster before "+ X more". */
export const GLOBAL_RECORD_SEARCH_CHILDREN_PER_CLUSTER_MAX = 12;
export const GLOBAL_RECORD_SEARCH_MIN_Q_LEN = 2;
