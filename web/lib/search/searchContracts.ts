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
 * Business context — RE-EXPORTED, not defined here.
 *
 * These types moved to `@/lib/context/subjectContextTypes` when Roster's durable record host became
 * a second consumer of the same question ("what business contexts apply to this subject?"). They are
 * re-exported under their historical Search names so every existing consumer is untouched and there
 * is exactly ONE definition — a copy would be the second context model the doctrine forbids.
 *
 * @see lib/context/subjectContextTypes.ts — the definitions and their reasoning
 * @see lib/context/buildSubjectContexts.ts — the one assembly authority both consumers call
 */
export type {
    SubjectContextKind as SearchContextKind,
    SubjectOperationalMembershipRef as SearchOperationalMembershipRef,
    SubjectContext as SearchContext,
} from "@/lib/context/subjectContextTypes";

/**
 * Where an operator can go. Destinations point at AUTHORITATIVE Alloy surfaces.
 *
 * `durable_record` — OPEN THIS RECORD. The subject itself, attended on its own terms, with no
 *                    queue required and no Work View chosen on the operator's behalf.
 * `focus_panel`   — commit a subject and focus a CARD in the existing Focus Panel. This is
 *                    OPERATIONAL WORK: a lens, a host case, and a row inside it.
 * `route`         — a canonical Alloy route (campus settings, a configured Work View).
 *
 * ── WHY `durable_record` HAD TO EXIST ──
 *
 * "Show me Lennon" and "Take me to Lennon's Waitlist work" are different operator intents, and until
 * this target they were the same shape: the subject destination was stamped with
 * `host_work_unit_key` + `host_work_view_id` resolved from the subject's FIRST truthful membership,
 * so clicking a person's name silently committed a lens nobody asked for. The card differed; the
 * operation did not.
 *
 * The distinction cannot live in `card_key`, and it cannot be inferred downstream: a record intent
 * and an operational intent legitimately share a payload, which is exactly why the deduplication key
 * is the operator context. It has to be DECLARED.
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
export type SearchDestinationTargetKind = "durable_record" | "focus_panel" | "route";

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
    /**
     * The configured Work View that holds this participant's own stage. OUTRANKS
     * `host_work_unit_key` when present, because that field answers at case grain and a child in the
     * same case can sit in a different stage. Both occupy the same slug position on
     * `/workspace/work-unit/:slug`, which resolves work-unit keys AND Work View slugs.
     */
    host_work_view_id?: string | null;
    /**
     * The Work View ROW to select — `subjectRows[].entityId` in the runtime's own vocabulary.
     *
     * Distinct from `host_entity_id` (what the Focus Panel composes against) and from `item_id` (the
     * durable child focused as an ASPECT). For a child-grain lens all three are different objects:
     * a participation, a case, and a child.
     *
     * Null for destinations that name no Work View row — the subject destination and route
     * destinations. Present, the runtime selects this row and its membership guard validates it; the
     * guard stays fail-closed, and an id that names no row is still refused.
     */
    operational_member_id?: string | null;
    /** Canonical route when `target === "route"`. */
    href?: string | null;
    /**
     * The durable subject to open, when `target === "durable_record"`.
     *
     * `subject_type` is the record GRAIN (`durableSubjectTypeFor`'s vocabulary), and `subject_id` is
     * that grain's canonical id — `customer_members.id` for a child, `persons.id` for a person.
     * NEVER a host, never a participation: a durable destination names the record itself, which is
     * the whole reason it needs no work unit to be reachable.
     */
    subject_type?: string | null;
    subject_id?: string | null;
    /**
     * A context the operator's QUERY named, carried as a preference rather than a commitment.
     *
     * "Lennon assignment" says which context to land on; it does not make the gesture operational.
     * The durable host may honour it when selecting an initial context and must remain correct when
     * it is absent — a record opened with no preference resolves its own default.
     */
    preferred_context_key?: string | null;
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
