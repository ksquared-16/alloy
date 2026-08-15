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
 * ── AN OPTION SAYS WHETHER IT CAN RESOLVE A CONFIGURED SURFACE ──
 *
 * `resolvesConfiguredSurface` is false for a context with no business process — Schedule/Assignment
 * and Employment today. That is not a defect to paper over: those contexts have no published
 * composition to resolve, so the host falls back to identity information and SAYS SO. Inventing a
 * card for them would be the "approximate a Child card" failure the architecture forbids.
 */

import type { SubjectContext, SubjectContextKind } from "@/lib/context/subjectContextTypes";

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
     * Whether a published contextual composition can be resolved for this option.
     *
     * False is an honest answer, not a gap to fill locally: the host renders the record's identity
     * and states that this context has no configured surface.
     */
    resolvesConfiguredSurface: boolean;
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
                // No business process ⇒ nothing to resolve a published composition against.
                businessProcessKey: null,
                workViewId: null,
                stageKey: null,
                statusKey: null,
                hostEntityId: context.destination_entity_id ?? null,
                resolvesConfiguredSurface: false,
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
                    resolvesConfiguredSurface: true,
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
            resolvesConfiguredSurface: true,
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
