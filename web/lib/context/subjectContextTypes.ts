/**
 * SUBJECT BUSINESS CONTEXT — the platform's ONE answer to
 * "what meaningful business contexts apply to this durable subject?"
 *
 * ── WHY THIS LEFT `lib/search` ──
 *
 * These types were born inside Search, because Search was the first surface that needed to say
 * "Lennon is in Enrollment, at Waitlist, in the All and Tours cohorts". They were never
 * search-specific: a durable record host asks the identical question, and the moment a second
 * consumer resolved it independently the platform would hold two answers about who is in what — with
 * no error, because both would be internally consistent.
 *
 * So the projection is neutral and `lib/search` is its FIRST consumer, not its owner.
 * `searchContracts.ts` re-exports these under their historical names, so every existing consumer is
 * unchanged and there is exactly one definition.
 *
 * ── WHAT A CONTEXT IS, AND IS NOT ──
 *
 * A context is a BUSINESS RELATIONSHIP the subject stands in, discovered from canonical truth. It is
 * never a table, never a UI tab, and never a stage. A child in three processes has three contexts and
 * remains one subject.
 *
 * A context kind exists here only when a canonical PRODUCER exists. Billing is deliberately absent:
 * `OperationalBillingSignal` is a read-only flag on the case with no assignment write path, so a
 * "Billing context" would be a label over nothing. Adding a kind before its producer is how a
 * selector comes to offer a destination that cannot compose.
 */

/**
 * Why a context exists — used for ranking and for deciding what to show first.
 *
 * `process` contexts are discovered dynamically from process participation and are labelled from
 * tenant configuration. There is no per-tenant branching.
 *
 * `employment` is person-grain and carries no Work View: employment is a standing, not a queue.
 */
export type SubjectContextKind =
    | "process"
    | "schedule"
    | "relationship"
    | "placement"
    | "employment";

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
export type SubjectOperationalMembershipRef = {
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

export type SubjectContext = {
    kind: SubjectContextKind;
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
     * ── DEMOTED (see `operational_memberships`) ──
     * This is a RANKING and compatibility signal, not proof of eligibility. Stage alignment says
     * where a participant is in the Process; it does not establish which cohorts contain them, and
     * binding through `compat_queue_key` cannot express a booking-predicated or catch-all lens at
     * all. Eligibility comes from evaluated membership.
     */
    destination_work_view_id?: string | null;
    /**
     * THE PARTICIPANT'S OWN STAGE in this process — the axis a configured surface variant resolves
     * against, alongside the process key.
     *
     * Carried explicitly because the durable contextual host needs `(businessProcessKey, stageKey)`
     * to request the SAME published Focus Panel composition the native operational panel resolves,
     * and `detail` above is an operator-facing SENTENCE that a tenant renames. A label can never be
     * an addressing key.
     */
    stage_key?: string | null;
    /**
     * The participation's own lifecycle state (`process_instances.state`), when known.
     * Diagnostic and ranking input; never an addressing key on its own.
     */
    state?: string | null;
    /**
     * Every configured Work View this subject truthfully belongs to and can compose in — the
     * operational destinations that may be offered. Empty means none could be PROVEN, which is a
     * complete answer: the subject still exposes its entity contexts.
     */
    operational_memberships?: SubjectOperationalMembershipRef[] | null;
};
