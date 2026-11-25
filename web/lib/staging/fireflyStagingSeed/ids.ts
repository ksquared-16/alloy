/**
 * Firefly staging seed — fixed identifiers (ALY-14 E2).
 *
 * Every row the seed writes carries an id in its own namespace, `f17e0000-0000-4000-8000-…`, so a
 * seeded row is recognisable by id alone — inside the Firefly org, next to the tenant's own rows —
 * and can never collide with a row the platform minted
 * (`gen_random_uuid()` cannot produce eight leading `f17e0000` hex digits followed by `-0000-4000`
 * by anything but chance on the order of 2^-48). Tests and the verification census rely on these.
 *
 * Bulk id scheme: `f17e0000-0000-4000-8000-` + <tag hex> + <11 hex digits of n>.
 */

export const SEED_ID_PREFIX = "f17e0000-0000-4000-8000-" as const;

/**
 * The seed's one organization: the existing Firefly Early Learning tenant, the only staging school.
 * The seed never creates, renames or updates an org — it refuses a database where this org is absent
 * — and it never updates or deletes a row it did not write (the fence in renderSql.ts proves both).
 */
export const FIREFLY_ORG_ID = "93667019-bd28-49b5-a688-acc9bb1e0a19" as const;

/**
 * The id the first version of this seed gave the separate "Firefly Early Learning (Staging)" org it
 * created. That org must not exist anywhere (no additional tenants): the preflight refuses a database
 * that holds it, so a leftover from a local run is reported rather than silently seeded beside.
 */
export const RETIRED_SEPARATE_ORG_ID = "f17e0000-0000-4000-8000-000000000001" as const;

/** Marker written on every seeded row that has a free-form source column. */
export const SEED_SOURCE = "firefly_staging_seed" as const;

export const SEED_DEPARTMENT_ID = "f17e0000-0000-4000-8000-000000000020" as const;
export const SEED_PROCESS_ID = "f17e0000-0000-4000-8000-000000000021" as const;

export const SEED_WORK_UNIT_IDS = Object.freeze({
    new_leads: "f17e0000-0000-4000-8000-000000000030",
    enrollment_pipeline: "f17e0000-0000-4000-8000-000000000031",
    tours: "f17e0000-0000-4000-8000-000000000032",
} as const);

/**
 * Tags for bulk rows. One hex digit each, never reused across tables, and never `0` — the fixed ids
 * above live in the `0` range. Sites and rooms are both `locations` rows and share tag `b`: sites
 * are n = 1…255, rooms n ≥ 0x100.
 */
export const SEED_ID_TAG = Object.freeze({
    location: "b",
    program_category: "d",
    program_offering: "e",
    offering_variant: "f",
    tuition_rate: "a",
    charge_template: "9",
    role_type: "8",
    customer: "1",
    person: "2",
    child: "3",
    opportunity: "4",
    customer_person: "5",
    opportunity_person: "6",
    opportunity_child: "7",
    child_relationship: "c",
} as const);

export type SeedIdTag = keyof typeof SEED_ID_TAG;

/** Deterministic id for row `n` (1-based) of a bulk table. */
export function seedId(tag: SeedIdTag, n: number): string {
    if (!Number.isInteger(n) || n < 1 || n > 0xffffffffff) throw new Error(`seedId: bad index ${n}`);
    return `${SEED_ID_PREFIX}${SEED_ID_TAG[tag]}${n.toString(16).padStart(11, "0")}`;
}

/** Stage ids inside the lifecycle builder document (template stage ids are random; these are not). */
export function seedStageId(index: number): string {
    return `${SEED_ID_PREFIX}${(0x230 + index).toString(16).padStart(12, "0")}`;
}

export function isSeedId(id: string): boolean {
    return id.toLowerCase().startsWith(SEED_ID_PREFIX);
}
