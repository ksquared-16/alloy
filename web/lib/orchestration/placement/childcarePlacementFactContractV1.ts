/**
 * Fact-key contract for childcare enrollment placement V1 (Card 4).
 * Future opportunity → {@link FactBag} adapter should populate these keys.
 *
 * Preset rules reference: {@link CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V1}.
 */

/** ISO 8601 instant string — primary FIFO tie-breaker within tier. */
export const CHILDCARE_PLACEMENT_FACT_WAIT_SINCE = "wait_since" as const;

/** Desired enrollment start (ISO 8601 date or instant). Optional tie-breaker. */
export const CHILDCARE_PLACEMENT_FACT_START_DATE = "start_date" as const;

/** Employee household policy flag. */
export const CHILDCARE_PLACEMENT_FACT_FLAG_EMPLOYEE_HOUSEHOLD = "flag_employee_household" as const;

/** Staff household policy flag (distinct employer channel). */
export const CHILDCARE_PLACEMENT_FACT_FLAG_STAFF_HOUSEHOLD = "flag_staff_household" as const;

/** Community / scholarship / partnership priority programs. */
export const CHILDCARE_PLACEMENT_FACT_FLAG_COMMUNITY_PRIORITY = "flag_community_priority" as const;

/** Child has sibling enrolled at center — adapter may source from inquiry/outcomes. */
export const CHILDCARE_PLACEMENT_FACT_FLAG_SIBLING_ENROLLED = "flag_sibling_enrolled" as const;

/**
 * Sister center / transfer priority — preset predicate key is {@link CHILDCARE_PLACEMENT_FACT_FLAG_SISTER_CENTER}.
 * Domain term “transfer” maps here at adapter boundary.
 */
export const CHILDCARE_PLACEMENT_FACT_FLAG_SISTER_CENTER = "flag_sister_center" as const;

/** Optional deterministic cohort grouping for ordering / display (room/program/age band label). */
export const CHILDCARE_PLACEMENT_FACT_PROGRAM_ROOM_GROUP = "program_room_group" as const;

/** Facts the preset predicates depend on — presence unknown/absent disables matching rules safely. */
export const CHILDCARE_PLACEMENT_V1_PREDICATE_FACT_KEYS = [
    CHILDCARE_PLACEMENT_FACT_FLAG_EMPLOYEE_HOUSEHOLD,
    CHILDCARE_PLACEMENT_FACT_FLAG_STAFF_HOUSEHOLD,
    CHILDCARE_PLACEMENT_FACT_FLAG_COMMUNITY_PRIORITY,
    CHILDCARE_PLACEMENT_FACT_FLAG_SIBLING_ENROLLED,
    CHILDCARE_PLACEMENT_FACT_FLAG_SISTER_CENTER,
] as const;

/** Tie-break facts used by preset `tie_breakers`. */
export const CHILDCARE_PLACEMENT_V1_TIEBREAK_FACT_KEYS = [
    CHILDCARE_PLACEMENT_FACT_WAIT_SINCE,
    CHILDCARE_PLACEMENT_FACT_START_DATE,
] as const;

/**
 * Required vs optional for **fair ordering** (product policy):
 * - Strongly recommended present: `wait_since` (or adapter maps inquiry start → `wait_since`).
 * - Optional for tier rules: all `flag_*` — unknown yields conservative tier / warnings per preset.
 */
export const CHILDCARE_PLACEMENT_V1_REQUIRED_FOR_FIFO = [CHILDCARE_PLACEMENT_FACT_WAIT_SINCE] as const;
