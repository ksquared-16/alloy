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
    /**
     * The household's operational CASE — the opportunity whose Focus Panel the household and its
     * adults are worked in, plus the Work Unit that holds it.
     *
     * A child reaches its case through process participation. A parent or a household has none: only
     * children participate in Enrollment. Without this a person/household destination resolved a host
     * RECORD (`customers`) but no host Work Unit, so Search had nowhere to send the operator and
     * refused to navigate — correct, but useless. Resolving the household's own case makes a parent
     * land in exactly the panel their children land in, which is where that work actually happens.
     *
     * Null when the household has no case; the destination then carries no work unit and Search does
     * not navigate, which stays honest.
     */
    household_case_entity_id?: string | null;
    household_case_work_unit_key?: string | null;
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
    /**
     * The Work Unit that actually holds `destination_entity_id` in its queues —
     * `work_units.key`, read from the host record's own `work_unit_id`.
     *
     * This is NOT the process key, and the distinction is load-bearing. A process
     * (`enrollment`) and a Work Unit (`enrollment_pipeline`) are different objects
     * in different namespaces: `/workspace/work-unit/:slug` resolves work-unit keys
     * and Work View slugs, so routing to a process key answers `work_unit_not_found`
     * and no Focus Panel ever composes.
     *
     * Null when the host record belongs to no Work Unit. That is honest — no Work
     * View's evaluated page contains it, so nothing can host its Focus Panel, and a
     * destination naming a unit anyway would be a fabricated route.
     */
    destination_work_unit_key?: string | null;
};

/**
 * Where an operator can go. Destinations point at AUTHORITATIVE Alloy surfaces.
 *
 * `focus_panel` — commit a subject and focus a CARD in the existing Focus Panel.
 * `route`       — a canonical Alloy route (campus settings, a configured Work View).
 *
 * `open_drawer` is deliberately gone. It addressed a record but never a card, so
 * "open Lennon" and "open Lennon's enrollment" resolved to the same address and
 * one was always dropped as a duplicate — that is why a child often showed only
 * Household. It also opened the generic drawer overlay on top of the workspace,
 * which is not an Alloy operator destination.
 *
 * A destination NEVER carries mutation intent and never carries a hand-built URL
 * assembled inside a component.
 */
export type SearchDestinationTargetKind = "focus_panel" | "route";

export type SearchDestination = {
    /**
     * Stable OPERATOR-CONTEXT identity, e.g. "subject", "process:enrollment",
     * "assignment". Deduplication keys on THIS, never on the underlying record —
     * two different operator intents can legitimately share one payload.
     */
    key: string;
    /** Operator-facing label. Configured where the destination is configured. */
    label: string;
    target: SearchDestinationTargetKind;
    /** Which card to focus when `target === "focus_panel"`. */
    card_key?: string | null;
    /** Which row inside a collection card (child id, person id, …). */
    item_id?: string | null;
    /** Configured operational context within the card, e.g. a `process_key`. */
    context_key?: string | null;
    /**
     * The record whose Focus Panel hosts this subject. A child's world is
     * rendered by the case it participates in; the subject remains the child.
     * Flat record consumers (POS picker, Experience Builder preview) read this
     * through `searchSelectionFromResult`.
     */
    host_entity_type?: string | null;
    host_entity_id?: string | null;
    /**
     * The configured work-unit / Work View that should HOST this subject.
     *
     * Search resolves it from the subject's configured process participation, so
     * a tenant that renames or adds a process needs no code change — there is no
     * hardcoded route here. Clicking navigates to this host so the INLINE Focus
     * Panel owns rendering; without it the modal branch mounts on /workspace,
     * which is the overlay this work exists to remove.
     */
    host_work_unit_key?: string | null;
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
