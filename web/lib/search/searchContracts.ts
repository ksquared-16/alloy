/**
 * Alloy Search Platform V2 — the one platform-owned search result contract.
 *
 * Governing model: **Search finds subjects and exposes their relevant Alloy contexts.**
 *
 * A result is four operator-facing layers over ONE canonical subject:
 *   1. `subject`      — canonical identity (never a storage row, never a participation record)
 *   2. `recognition`  — permission-safe disambiguation ("is this the thing I meant?")
 *   3. `contexts`     — relevant operational meaning ("what is going on with this subject?")
 *   4. `destinations` — authoritative Alloy surfaces ("where can I go from here?")
 *   plus `ranking`    — deterministic score + explanation, so ordering is testable
 *
 * Ownership boundaries this file exists to enforce:
 *   - Retrieval owns subject matching. It does NOT own destinations.
 *   - Enrichment owns context. It reads canonical truth; it never writes.
 *   - Destination resolution owns navigation. It does NOT own identity matching.
 *   - Nothing here is authoritative truth. A SearchResult is a PREVIEW/SELECTION.
 *     It must never be used as the input to a mutation. See `SEARCH_RESULT_DOCTRINE`.
 */

/**
 * Canonical subject kinds Search can anchor on.
 *
 * These are *identity* kinds, not table names and not process names. Process
 * participation is NEVER a subject kind — a child in three processes is one
 * `child` subject with three contexts, not three subjects.
 */
export type SearchSubjectKind = "person" | "child" | "household" | "location";

/**
 * The canonical identity of a result.
 *
 * `id` is the id of the canonical record for `kind`:
 *   person    → persons.id
 *   child     → customer_members.id   (durable child profile truth)
 *   household → customers.id
 *   location  → locations.id
 *
 * `person_id` is carried separately for `child` because a child's canonical
 * human identity is a person row when one exists — the child profile is the
 * durable operational grain, the person is the identity.
 */
export type SearchSubject = {
    kind: SearchSubjectKind;
    id: string;
    /** Operator-facing name. Never a raw key, never an id fragment. */
    display_name: string;
    /** Canonical human identity when this subject has one. */
    person_id?: string | null;
    /** Owning household when this subject belongs to one. */
    household_id?: string | null;
};

/**
 * Permission-safe recognition context — the minimum needed to tell two similar
 * subjects apart. Every field here has already passed the access boundary; a
 * value that the operator may not know about is `null`, never a placeholder.
 */
export type SearchRecognition = {
    /** Configured/operator-facing role or type, e.g. "Child", "Parent / Guardian", "Campus". */
    type_label: string;
    /** e.g. "Smith Household" */
    household_name?: string | null;
    /** e.g. "Bend Campus" */
    location_label?: string | null;
    /** e.g. "Preschool" — configured program/cohort, not a table value. */
    program_label?: string | null;
    /** Compact age for child rows, e.g. "4y 2mo". */
    age_label?: string | null;
    /** e.g. "Primary contact" */
    role_note?: string | null;
    /** e.g. "2 related children" — a COUNT of accessible relations only. */
    relation_summary?: string | null;
    /** Named accessible relations, e.g. ["Joe Smith", "Emma Smith"]. Access-filtered. */
    related_names?: string[];
};

/**
 * Why a context exists — used for ranking and for deciding what to show first.
 * `process` contexts are discovered dynamically from process participation and
 * are labelled from tenant configuration. There is no per-tenant branching.
 */
export type SearchContextKind = "process" | "schedule" | "relationship" | "placement";

export type SearchContext = {
    kind: SearchContextKind;
    /**
     * Stable machine key for this context.
     * For `process` this is the configured `process_key` — NOT a hardcoded name.
     */
    key: string;
    /** Operator-facing label, resolved from tenant configuration. e.g. "Annual Registration". */
    label: string;
    /** Concise operational state, e.g. "Enrolling", "Needs documents", "Mon / Wed / Fri". */
    detail?: string | null;
    /** Optional supporting line, e.g. "Review due Aug 22". */
    secondary?: string | null;
    /**
     * The canonical entity that owns this context's authoritative surface, when one
     * exists. Destination resolution reads these; it never invents a route.
     *
     * A context with no owning surface (today: `schedule`) still ranks and displays —
     * it simply produces no destination rather than a fabricated link.
     */
    destination_entity_type?: string | null;
    destination_entity_id?: string | null;
};

/**
 * Where an operator can go. Destinations point at AUTHORITATIVE Alloy surfaces.
 *
 * `open_drawer` targets the canonical Focus Panel for an entity; `route` targets
 * a canonical Alloy route. A destination NEVER carries mutation intent and never
 * carries a hand-built URL string assembled inside a component.
 */
export type SearchDestinationTargetKind = "open_drawer" | "route";

export type SearchDestination = {
    /** Stable key for tests/telemetry, e.g. "subject", "process:enrollment", "schedule". */
    key: string;
    /** Operator-facing label. Configured where the destination is configured. */
    label: string;
    target: SearchDestinationTargetKind;
    /** Drawer entity type when `target === "open_drawer"`. */
    entity_type?: string | null;
    entity_id?: string | null;
    /** Canonical route when `target === "route"`. */
    href?: string | null;
    /**
     * True for the destination opened by clicking the subject itself.
     * Exactly one destination per result is primary.
     */
    primary?: boolean;
};

/**
 * Deterministic ranking. `score` orders results; `reasons` makes the order
 * explainable and testable rather than an opaque number.
 */
export type SearchRankingReason =
    | "exact_name"
    | "prefix_name"
    | "token_name"
    | "related_name"
    | "household_name"
    | "identifier"
    | "context_term"
    | "subject_kind_bias";

export type SearchRanking = {
    score: number;
    reasons: SearchRankingReason[];
    /** Context keys promoted by query intent terms, in promotion order. */
    promoted_context_keys?: string[];
};

export type SearchResult = {
    subject: SearchSubject;
    recognition: SearchRecognition;
    contexts: SearchContext[];
    destinations: SearchDestination[];
    ranking: SearchRanking;
};

export type SearchResponse = {
    ok: true;
    q: string;
    /** How the query was understood — exposed so intent is testable and debuggable. */
    intent: {
        subject_terms: string[];
        context_terms: string[];
    };
    results: SearchResult[];
};

/**
 * Doctrine marker. Search output is a preview/selection surface.
 *
 * Any code that accepts a `SearchResult` as the authority for a write is wrong:
 * re-read canonical truth from the owning system first. This constant exists so
 * the rule is greppable and can be asserted in tests.
 */
export const SEARCH_RESULT_DOCTRINE =
    "Search results are previews and selections, never authoritative truth and never mutation input." as const;

/** Bounded result counts — Search is an interactive control, not a report. */
export const SEARCH_DEFAULT_LIMIT = 20;
export const SEARCH_MAX_LIMIT = 40;
export const SEARCH_MIN_Q_LEN = 2;
/** Per-subject-kind retrieval cap, applied at query time. */
export const SEARCH_PER_KIND_CANDIDATE_CAP = 24;
/** Most destinations shown inline before a restrained `More` affordance. */
export const SEARCH_INLINE_DESTINATION_CAP = 4;
