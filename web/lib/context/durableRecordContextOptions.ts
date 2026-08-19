/**
 * SELECTABLE CONTEXTS for a durable record — the shape the operator actually chooses between.
 *
 * A `SubjectContext` answers "what is going on with this subject". A durable host needs one step
 * more: which of those can be SELECTED, and what does selecting one address? The two are not the
 * same, and the difference is a cohort.
 *
 * A child in Enrollment at `waitlist` may sit in All Children AND Waitlist at once. "Enrollment" is
 * one context but two things an operator can mean, and the configured surface can differ between
 * them — `resolveSurfaceVariant` ranks Work View above stage. So one process context can produce
 * several options, and each option carries the FULL addressing tuple the published composition is
 * resolved against:
 *
 *     businessProcessKey + workViewId + stageKey + statusKey
 *
 * That tuple is the entire reason this module exists. It is the same tuple the native Focus Panel
 * host passes to `FocusPanelSummaryDocProvider`, which is what makes "same subject + same context ⇒
 * same effective configured card" a mechanical consequence rather than an aspiration.
 *
 * ── AN OPTION SAYS WHICH KIND OF SURFACE IT RESOLVES, AND THERE ARE THREE ──
 *
 * This was a boolean, and the boolean was hiding a real distinction. It asked "can this option
 * resolve a PUBLISHED composition?", so everything that could not — Schedule/Assignment, Employment
 * — collapsed into one answer: nothing to show. Those are not the same kind of nothing.
 *
 *   published_composition  a business process context. The tenant's published Focus Panel doc,
 *                          resolved against the addressing tuple. The configured Child card.
 *   canonical_operational  a DURABLE OPERATIONAL RELATIONSHIP — schedule / placement. There is no
 *                          business process and there must not be one: an assignment is a
 *                          commitment, not a stage in a lifecycle. The platform already owns a
 *                          canonical card for it (`scheduling`), so the surface IS that card,
 *                          composed from canonical assignment truth.
 *   none                   genuinely nothing to render yet. Employment sits here until it has a card.
 *
 * The middle value is the point of this change. Making Schedule resolve a published composition
 * would have meant inventing a `schedule` business process key — a process in the ledger that no
 * runtime ever advances, existing purely so a card could resolve. That is the "approximate a Child
 * card" failure wearing a new costume. A durable operational relationship gets the card the platform
 * already has for it, or it gets nothing.
 */

import type { SubjectContext, SubjectContextKind } from "@/lib/context/subjectContextTypes";

/**
 * What kind of surface an option resolves. See the module docblock — these are not degrees of one
 * thing, they are different questions with different owners.
 */
export type DurableContextSurface =
    | "published_composition"
    | "canonical_operational"
    /**
     * A canonical platform card about the RECORD ITSELF — the child's own details, or their family.
     *
     * Distinct from `canonical_operational`, which is a durable operational RELATIONSHIP (a
     * commitment). "Lennon's date of birth" and "Lennon is committed to Toddler A on Mon/Wed/Fri"
     * are not degrees of one thing: the first is who he is, the second is what has been promised
     * about him. Collapsing them would have put identity behind a surface named for commitments.
     *
     * Like `canonical_operational`, it resolves NO published composition and invents no business
     * process. The platform already owns `child_identity` and `household`; the surface IS that card.
     */
    | "canonical_record"
    /**
     * No surface resolves. A truthful answer, not a gap: the context is real but nothing in the
     * platform renders it, and the option must say so rather than borrow a surface that would.
     */
    | "none";

/**
 * The context kinds that are DURABLE OPERATIONAL RELATIONSHIPS with a canonical platform card.
 *
 * `schedule` and `placement` are one relationship read two ways — the child's live commitment — and
 * the `scheduling` card renders both. Declared as data rather than as a condition so that adding a
 * relationship is a list entry, and so the whole set is stated in one place.
 *
 * `employment` is deliberately ABSENT from THIS list. It is equally durable and equally operational,
 * but it has no card that composes it AS A COMMITMENT — the Employment card is a person-grain
 * identity card. It is therefore a `canonical_record` kind (see below), which is the category that
 * actually describes it.
 */
const CANONICAL_OPERATIONAL_KINDS: readonly SubjectContextKind[] = ["schedule", "placement"];

/**
 * The context kinds answered by a canonical card ABOUT THE RECORD, not about a commitment.
 *
 * Declared as data for the same reason the operational set above is: adding one should be a list
 * entry, and the whole set should be readable in one place.
 */
const CANONICAL_RECORD_KINDS: readonly SubjectContextKind[] = [
    "identity",
    "relationship",
    /*
     * `employment` belongs HERE, not with the operational relationships above, and the note beside
     * that list already said why before this category existed: the Employment card is a person-grain
     * IDENTITY card, and there is no card that composes employment as a COMMITMENT.
     *
     * That was written as a reason to give it `none`. It is really a reason to call it what it is —
     * a canonical card about the record. Whether Jane works here is of the same kind as Lennon's
     * date of birth: something true about the person, not something promised about their week.
     */
    "employment",
];

export type DurableRecordContextOption = {
    /** Stable selection key. Unique within a subject; safe in a URL. */
    key: string;
    kind: SubjectContextKind;
    /** Operator-facing, e.g. "Enrollment · Waitlist". Configured labels only. */
    label: string;
    /** Supporting line, e.g. the configured stage sentence. */
    detail: string | null;
    /**
     * THE ADDRESSING TUPLE. Identical in meaning to the one the native operational host commits.
     * All four may be null; `businessProcessKey` being null is what makes an option unable to
     * resolve a configured surface.
     */
    businessProcessKey: string | null;
    workViewId: string | null;
    stageKey: string | null;
    statusKey: string | null;
    /** The case whose record the configured composition is about, when there is one. */
    hostEntityId: string | null;
    /**
     * The site a `canonical_operational` option is scoped to. Null for every other surface — a
     * published composition is addressed by process, not by site.
     */
    siteLocationId: string | null;
    /**
     * WHICH KIND of surface this option resolves. See {@link DurableContextSurface}.
     *
     * `none` is an honest answer, not a gap to fill locally: the host renders the record's identity
     * and states that this context has no surface yet.
     */
    surface: DurableContextSurface;
};

/**
 * Expand a subject's contexts into the options an operator may select.
 *
 * Order is the projection's own order, and the projection is process-first. Nothing here re-ranks by
 * domain: a childcare-specific precedence encoded at this layer would apply to every product built
 * on the platform.
 */
export function durableRecordContextOptions(
    contexts: readonly SubjectContext[],
): DurableRecordContextOption[] {
    const options: DurableRecordContextOption[] = [];

    for (const context of contexts) {
        if (context.kind !== "process") {
            options.push({
                key: context.key,
                kind: context.kind,
                label: context.label,
                detail: context.detail ?? null,
                /*
                 * NO BUSINESS PROCESS, AND NONE IS INVENTED. The addressing tuple stays null for a
                 * durable operational relationship — that is what it MEANS for the relationship to
                 * be durable. A canonical card composes it from assignment truth instead; nothing
                 * is resolved against a published doc, so there is no tuple to carry.
                 */
                businessProcessKey: null,
                workViewId: null,
                stageKey: null,
                statusKey: null,
                hostEntityId: context.destination_entity_id ?? null,
                siteLocationId: context.site_location_id ?? null,
                surface: CANONICAL_OPERATIONAL_KINDS.includes(context.kind)
                    ? "canonical_operational"
                    : CANONICAL_RECORD_KINDS.includes(context.kind)
                      ? "canonical_record"
                      : "none",
            });
            continue;
        }

        const memberships = context.operational_memberships ?? [];
        if (memberships.length > 0) {
            // One option per COHORT. Two cohorts of one process are two operator intents, and the
            // configured surface may legitimately differ between them.
            for (const membership of memberships) {
                options.push({
                    key: `${context.key}:${membership.work_view_id}`,
                    kind: "process",
                    label: `${context.label} · ${membership.label}`,
                    detail: context.detail ?? null,
                    businessProcessKey: context.key,
                    workViewId: membership.work_view_id,
                    stageKey: context.stage_key ?? null,
                    statusKey: null,
                    hostEntityId: membership.host_entity_id ?? context.destination_entity_id ?? null,
                    siteLocationId: null,
                    surface: "published_composition",
                });
            }
            continue;
        }

        // No cohort could be PROVEN. The process is still a real context — the subject participates
        // in it — so it stays selectable, addressed by its stage alone. The stage-bound view is used
        // when configuration supplies one; it is a ranking signal, so it may be null without
        // costing the option its configured surface.
        options.push({
            key: context.key,
            kind: "process",
            label: context.label,
            detail: context.detail ?? null,
            businessProcessKey: context.key,
            workViewId: context.destination_work_view_id ?? null,
            stageKey: context.stage_key ?? null,
            statusKey: null,
            hostEntityId: context.destination_entity_id ?? null,
            siteLocationId: null,
            surface: "published_composition",
        });
    }

    return options;
}

/**
 * The option a host should open on.
 *
 * `preferredKey` is the ENTRY's preference — Search carries what the query named, Roster names the
 * context its own product is about. It is honoured only when the subject actually holds it, because
 * a preference the record cannot satisfy must not leave the host on nothing.
 *
 * Matching accepts either the full option key (`enrollment:view-waitlist`) or the bare context key
 * (`enrollment`), so a caller that knows only "which process" need not know which cohort.
 *
 * With no usable preference the first option wins — the projection's own order, not a domain
 * precedence invented here.
 */
export function resolveInitialContextOption(
    options: readonly DurableRecordContextOption[],
    preferredKey?: string | null,
): DurableRecordContextOption | null {
    if (options.length === 0) return null;
    const wanted = (preferredKey ?? "").trim();
    if (wanted) {
        const exact = options.find((o) => o.key === wanted);
        if (exact) return exact;
        const byContext = options.find((o) => o.key === wanted || o.key.startsWith(`${wanted}:`));
        if (byContext) return byContext;
    }
    return options[0] ?? null;
}
