/** Processing Identity Resolution — canonical resolver constants (B1b). */

export const IDENTITY_RESOLVER_VERSION = "proc-identity-v1-b1b";

/** Max person candidates returned per subject query (deterministic order by record id). */
export const PERSON_CANDIDATE_CAP = 10;

/** Max child person/member candidates per subject. */
export const CHILD_CANDIDATE_CAP = 15;

/** Max household expansion rows when resolving child context. */
export const HOUSEHOLD_MEMBER_CAP = 25;
