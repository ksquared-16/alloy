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

/**
 * One configured Work View this subject ACTUALLY belongs to, and can actually compose in.
 *
 * A Work View is an overlapping operational COHORT, not a stage. A subject routinely belongs to
 * several at once — the live case is a family at stage `waitlist` sitting in both `All` and `Tours`,
 * the latter because Tours publishes `has_active_tour` with deliberately NO stage predicate.
 *
 * Every entry has already passed all four gates in `resolveOperationalMemberships`: correct grain,
 * fully-supported predicate evaluation, operator access, and operational availability. Nothing
 * downstream re-decides eligibility — ranking may reorder these, never extend them.
 */
export type SearchOperationalMembershipRef = {
    /** Configured Work View id — identity, never the label, which tenants rename. */
    work_view_id: string;
    /** Configured operator-facing label. */
    label: string;
    /**
     * The grain the lens ROWS at, which is the subject the destination actually selects. A child is
     * never offered a `family` lens: the row there is the case, and selecting it would present a
     * family row as though it were the child.
     */
    row_grain: "child" | "family";
    /** The Work Unit hosting this view's surface — `work_units.key`, never a process key. */
    host_work_unit_key: string | null;
    /** The record whose Focus Panel hosts the subject inside that view. */
    host_entity_id: string | null;
    /**
     * THE WORK VIEW ROW IDENTITY — what the runtime selects on, and what its membership guard matches.
     *
     *   child grain    `process_instances.id`   the PARTICIPATION
     *   family grain   `opportunities.id`       the case
     *
     * SEPARATE from `host_entity_id`, and the separation is the point. For a family-grain lens the two
     * coincide; for a child-grain lens they never do — the evaluated rows are participations while the
     * Focus Panel still composes against the family case. Collapsing them is what made a truthful
     * Waitlist destination answer "That record isn't in this Work View": the case was sent as the
     * subject, and no child row could match it.
     */
    operational_member_id: string;
};

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
    /**
     * The configured Work View that holds THIS PARTICIPANT's current stage.
     *
     * `destination_work_unit_key` above answers "which unit holds the host RECORD" — and for a case
     * that is family grain. A child in the same case can sit in a different stage entirely, so the
     * family answer is wrong for them: a waitlisted child sent to the family's Lead unit lands in a
     * queue that does not contain them, and nothing composes.
     *
     * Resolved by CONFIGURED BINDING (`compat_queue_key` === `primaryQueueKeyForLifecycleStage`),
     * never by label, so renamed or reordered views cannot move the answer.
     *
     * Null when this participation's stage has no stage-bound view. The caller then falls back to
     * the host record's unit — the family answer is a fallback, never an override.
     *
     * ── DEMOTED (see `operational_memberships`) ──
     * This is a RANKING and compatibility signal, not proof of eligibility. Stage alignment says
     * where a participant is in the Process; it does not establish which cohorts contain them, and
     * binding through `compat_queue_key` cannot express a booking-predicated or catch-all lens at
     * all. The runtime authority declines to read that key as identity for exactly this reason
     * ("a lane binding assigned by array position"). Eligibility comes from evaluated membership.
     */
    destination_work_view_id?: string | null;
    /**
     * Every configured Work View this subject truthfully belongs to and can compose in — the
     * operational destinations Search may offer. Empty means none could be PROVEN, which is a
     * complete answer: the subject still exposes its entity contexts.
     */
    operational_memberships?: SearchOperationalMembershipRef[] | null;
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
