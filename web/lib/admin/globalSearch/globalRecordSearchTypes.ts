import type { AdminDrawerEntityType } from "@/contexts/AdminDrawerContext";

/** Phase 1 entity kinds surfaced in global record search. */
export type GlobalRecordSearchEntityType = Extract<
    AdminDrawerEntityType,
    "persons" | "opportunities" | "customers" | "locations"
>;

export type GlobalRecordSearchHit = {
    entity_type: GlobalRecordSearchEntityType;
    entity_id: string;
    /** Primary display name (person name, opportunity title, household name, location label). */
    name: string;
    /** Role or record class label — e.g. Child, Guardian, Lead, Household, Campus. */
    type_label: string;
    /** Secondary context — site, household, customer, address fragment. */
    secondary_context: string | null;
    /** Human-readable status when available. */
    status_label: string | null;
};

export type GlobalRecordSearchResponse = {
    ok: true;
    q: string;
    results: GlobalRecordSearchHit[];
};

export const GLOBAL_RECORD_SEARCH_ENTITY_ORDER: GlobalRecordSearchEntityType[] = [
    "persons",
    "opportunities",
    "customers",
    "locations",
];

export const GLOBAL_RECORD_SEARCH_DEFAULT_LIMIT = 20;
export const GLOBAL_RECORD_SEARCH_PER_TYPE_CAP = 8;
export const GLOBAL_RECORD_SEARCH_MIN_Q_LEN = 2;
