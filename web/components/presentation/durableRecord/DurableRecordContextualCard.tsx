"use client";

/**
 * THE CANONICAL CARD, rendered on a durable host.
 *
 * Operations does not have record cards. It has a PLACE to put them: a centered surface over the
 * browse list, holding the same card the Work Unit's Focus Panel and a Search destination render.
 * This component decides which canonical card the SELECTED CONTEXT calls for and mounts it. It
 * composes no fields, names no labels and owns no layout, because a host that decides any of those
 * has stopped hosting a card and started being one.
 *
 * ── THE INVARIANT ──
 *
 *     same subject + same selected context ⇒ the same card, the same actions, the same editability,
 *     whichever host renders it.
 *
 * It holds structurally rather than by resemblance. `FocusPanelCardRenderer` is the renderer both
 * hosts use; the card models come from the platform's own producers; and the CONFIGURATION is
 * resolved by `FocusPanelSummaryDocProvider` against the option's addressing tuple —
 * `(businessProcessKey, workViewId, stageKey, statusKey)` — the same tuple, the same endpoint and
 * the same `resolveSurfaceVariant` the native operational panel commits. There is no Operations
 * layout, nothing is re-published, and no configuration is copied.
 *
 * That is also why the Child and Enrollment contexts are ONE branch and not two. They differ by the
 * tuple they resolve, not by the card they get: Child addresses no process and resolves the org's
 * Children Surface, Enrollment addresses the enrollment cohort and resolves whatever that cohort's
 * variant publishes. A second branch for "the plain child card" is how a host acquires a second
 * opinion about a child.
 *
 * ── EDITING IS PART OF THE CARD, NOT A HOST FEATURE ──
 *
 * A canonical card that renders its fields and refuses to change them is a different card wearing
 * the right labels. `buildDurableChildFocusPanelMutation` supplies the same write authorities the
 * case host injects, without the case-scoped orchestration around them, so Edit → Save lands on
 * canonical child truth from here exactly as it does from a Work Unit.
 *
 * ── AN UNCONFIGURABLE CONTEXT SAYS SO ──
 *
 * Some contexts have no business process and never should. Schedule is a commitment, not a stage, so
 * it renders the platform's `scheduling` card from assignment truth rather than resolving a
 * composition that would require inventing a process for it. Anything with neither a process nor a
 * canonical card states that plainly instead of approximating one — inventing a card for a context
 * that has none is the failure this whole surface exists to avoid.
 */

import { useEffect, useMemo, useState } from "react";

import SchedulingCard from "@/components/admin/focusPanel/cards/SchedulingCard";
import FocusPanelCardRenderer from "@/components/admin/focusPanel/FocusPanelCardRenderer";
import { FocusPanelSummaryDocProvider } from "@/lib/adminV2/runtime/focusPanel/usePublishedFocusPanelSummaryDoc";
import { dedupeAdminFetchWithTtl } from "@/lib/workspace/workspaceAdminFetchDedupe";
import { buildChildrenCardModel } from "@/lib/adminV2/runtime/focusPanel/deriveOpportunityFocusPanelCards";
import { buildDurableChildFocusPanelMutation } from "@/lib/adminV2/runtime/focusPanel/durableSubject/buildDurableChildFocusPanelMutation";
import { derivePersonEmploymentCard } from "@/lib/adminV2/runtime/focusPanel/durableSubject/derivePersonFocusPanelCards";
import type { DurablePersonSubject } from "@/lib/adminV2/runtime/focusPanel/durableSubject/durablePersonSubjectModel";
import { buildDurablePersonOperationalContext } from "@/lib/adminV2/runtime/focusPanel/durableSubject/focusPanelWorkModeModelFromDurableSubject";
import DurableHouseholdContextCard from "@/components/presentation/durableRecord/DurableHouseholdContextCard";
import { cardAppliesToGrain } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardRegistry";
import { DURABLE_STAFF_SUBJECT_KEY } from "@/lib/adminV2/runtime/focusPanel/durableSubject/durableStaffSchedulingSubject";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";
import { deriveSchedulingCardModel } from "@/lib/adminV2/runtime/focusPanel/durableSubject/deriveSchedulingCardModel";
import { buildDurableChildOperationalContext } from "@/lib/adminV2/runtime/focusPanel/durableSubject/focusPanelWorkModeModelFromDurableSubject";
import type { SchedulingProjectionFirstPaint } from "@/lib/adminV2/viewModel/drawer/opportunity/loadSchedulingProjectionsForFirstPaint";
import type { DurableRecordContextOption } from "@/lib/context/durableRecordContextOptions";
import type { DurableChildSubject } from "@/lib/adminV2/runtime/focusPanel/durableSubject/durableChildSubjectModel";
import type { LayoutDoc } from "@/lib/layout/layoutV2";

type Resolved = {
    doc: LayoutDoc | null;
    layoutId: string | null;
    version: number | null;
};

/** The published composition for one addressing tuple. Null doc = nothing published applies. */
async function fetchPublishedComposition(option: DurableRecordContextOption): Promise<Resolved> {
    const params = new URLSearchParams();
    if (option.businessProcessKey) params.set("businessProcessKey", option.businessProcessKey);
    if (option.workViewId) params.set("workViewId", option.workViewId);
    if (option.stageKey) params.set("stageKey", option.stageKey);
    if (option.statusKey) params.set("statusKey", option.statusKey);
    const qs = params.toString();

    try {
        // Deduped: the FocusPanelSummaryDocProvider fetches this same document for the card, and
        // the equality evidence must not cost a second flight for it.
        const res = await dedupeAdminFetchWithTtl(
            `/api/admin/entity-layouts/focus-panel-summary${qs ? `?${qs}` : ""}`,
            { credentials: "include" },
            15_000,
        );
        if (!res.ok) return { doc: null, layoutId: null, version: null };
        const json = (await res.json().catch(() => null)) as
            | { published?: { id?: string; version?: number; doc?: LayoutDoc } | null }
            | null;
        const published = json?.published ?? null;
        return {
            doc: published?.doc ?? null,
            layoutId: published?.id ?? null,
            version: published?.version ?? null,
        };
    } catch {
        // A failed publication read must not cost the operator the card: the platform default is a
        // correct composition, and `fromPublishedDoc` below reports which one is in force.
        return { doc: null, layoutId: null, version: null };
    }
}

/**
 * The record this card is about.
 *
 * A discriminated union, not an optional-field bag, because the two subjects genuinely differ in
 * what can be said about them. A child has configured fields, a household, a date of birth and an
 * enrollment; a staff member has an assignment and an employment. Modelling staff as "a child with
 * nulls" would let the configured-field branch run against a person and render an empty card that
 * asserts a composition applies when none does.
 */
export type DurableContextualSubject =
    | { kind: "child"; child: DurableChildSubject }
    /**
     * The composed person, whole. The Employment card reads its employment signal and truth bag, so
     * narrowing this to an id would force a re-fetch of what the composer already produced.
     */
    | { kind: "staff"; person: DurablePersonSubject };

export default function DurableRecordContextualCard({
    option,
    subject,
    schedulingProjection,
    onSaved,
}: {
    option: DurableRecordContextOption;
    subject: DurableContextualSubject;
    /**
     * Canonical assignment facts for a `canonical_operational` context, composed server-side. Null
     * when the subject holds no commitment — which is a state, not a failure.
     */
    schedulingProjection?: SchedulingProjectionFirstPaint | null;
    /** Fired after a successful write so the list underneath can refresh this row. */
    onSaved?: () => void;
}) {
    const [resolved, setResolved] = useState<Resolved | null>(null);

    const childSubject = subject.kind === "child" ? subject.child : null;
    /*
     * The subject's identity of record — member id for a child, person id for staff.
     *
     * This read `subject.personId` while the staff variant was `{ personId, label }`. Widening that
     * variant to carry the whole composed person left the expression reading `undefined`, so the
     * scheduling projection lookup below missed and Jane's Schedule card reported ZERO commitments
     * against a row that plainly existed. Nothing objected: the property simply stopped being there,
     * and `undefined` is a legal index into a record.
     */
    const subjectId =
        subject.kind === "child" ? subject.child.memberId : subject.person.personId;

    /** This subject's canonical commitment facts, keyed as the card expects to find them. */
    const projection = useMemo(
        () => schedulingProjection?.byMemberId?.[subjectId] ?? null,
        [schedulingProjection, subjectId],
    );

    /*
     * The context the canonical card reads, built by the SAME producer the durable panel uses — so
     * the card sees one subject, one grain and one truth bag, exactly as it would on a case.
     *
     * `canMutate` is true because these cards' whole purpose is invoking canonical actions; each of
     * those re-authorizes on execution, as it does from the case panel.
     */
    const operationalContext = useMemo(() => {
        if (!childSubject) {
            /*
             * A STAFF SUBJECT, STATED AS ONE.
             *
             * Jane is not written into `_durable_child_rows` with her enrollment fields nulled. That
             * would render identically today and would tell every later reader — a roster count, an
             * age policy, a tuition projection — that a staff member is a child. She goes under her
             * own key, and the card reads `kind: "staff"` from it.
             *
             * The context grain is `person`, which is what the registry declares `scheduling` for.
             */
            const staff = (subject as Extract<DurableContextualSubject, { kind: "staff" }>).person;
            return {
                grain: "person" as const,
                subject: { type: "person" as const, id: staff.personId, label: staff.label },
                canMutate: true,
                truth: {
                    _person_name: staff.label,
                    _scheduling_projection: schedulingProjection ?? null,
                    [DURABLE_STAFF_SUBJECT_KEY]: {
                        personId: staff.personId,
                        name: staff.label,
                        imageUrl: null,
                    },
                },
            } as unknown as OperationalContext;
        }
        const base = buildDurableChildOperationalContext(childSubject, true, null);
        return {
            ...base,
            truth: {
                /*
                 * The composed truth, UNCHANGED but for the selected context's own facts.
                 *
                 * The child's collection row (`_durable_child_rows`) arrives already composed —
                 * `composeDurableChildSubject` writes it, so every host is handed the same subject
                 * rather than each assembling one. `_scheduling_projection` is attached here rather
                 * than in the composer because it belongs to the SELECTED CONTEXT, not to the
                 * child's identity: a record with no Schedule context selected has no business
                 * carrying assignment facts in its truth.
                 */
                ...childSubject.truth,
                _scheduling_projection: schedulingProjection ?? null,
            },
        };
    }, [subject, childSubject, schedulingProjection]);

    /*
     * THE CARD'S ACTIONS, on a host that has no case.
     *
     * Built here rather than inside the branch so the identity of the object is stable across
     * renders — a mutation seam rebuilt every render would re-arm the card's save handlers on every
     * keystroke.
     */
    const childMutation = useMemo(
        () =>
            childSubject
                ? buildDurableChildFocusPanelMutation({
                      subject: childSubject,
                      canMutate: true,
                      onSaved,
                  })
                : null,
        [childSubject, onSaved],
    );

    /** The canonical Children card model, composed from the same truth the card will read. */
    const childCardModel = useMemo(
        () => (childSubject ? buildChildrenCardModel(operationalContext.truth) : null),
        [childSubject, operationalContext],
    );

    /*
     * The published composition's IDENTITY, for the equality evidence only.
     *
     * The card itself reads its configuration through `FocusPanelSummaryDocProvider` below, exactly
     * as the native panel does. This second read exists so the resolved layout id and version can be
     * published as data attributes and compared across hosts — an equality claim that cannot be
     * observed becomes an aspiration.
     *
     * It runs for the CHILD context too, whose tuple is simply empty. That is not the absence of a
     * composition; it is the org-wide one, and a host that skipped the read there could not show
     * that both surfaces resolved the same document.
     */
    useEffect(() => {
        if (!childSubject || option.surface === "canonical_operational" || option.surface === "none") {
            setResolved({ doc: null, layoutId: null, version: null });
            return;
        }
        let alive = true;
        setResolved(null);
        void fetchPublishedComposition(option).then((next) => {
            if (alive) setResolved(next);
        });
        return () => {
            alive = false;
        };
        // The ADDRESSING TUPLE is the dependency, not the option object — re-selecting a context
        // that addresses the same composition must not re-fetch it.
    }, [
        option,
        option.businessProcessKey,
        option.workViewId,
        option.stageKey,
        option.statusKey,
        option.surface,
        childSubject,
    ]);

    /*
     * ── THE CANONICAL CHILD CARD, FOR WHICHEVER CONTEXT ASKED FOR IT ──
     *
     * One renderer for the Child context and the Enrollment context, because they are the same card.
     * What differs is the ADDRESSING TUPLE the configuration is resolved against, and that is
     * carried by the option: Child addresses no process and resolves the org's Children Surface;
     * Enrollment addresses its cohort and resolves whatever that cohort's variant publishes.
     *
     * `FocusPanelSummaryDocProvider` is the same provider the native Focus Panel host mounts, so the
     * card inside reads its fields, labels, order, visibility and editability from the same document
     * through the same reader. Nothing about the card is decided here — this function decides only
     * that it is centered, and publishes the evidence for asserting the rest.
     */
    const renderCanonicalChildCard = () => {
        if (!childSubject || !childCardModel || !childMutation) return null;
        // The registry is the gate, as everywhere: the card reaches the child grain because someone
        // declared that it can, not because this component wanted to render it.
        if (!cardAppliesToGrain("children", "child")) return null;

        return (
            <div
                data-contextual-card="child"
                data-contextual-card-context={option.key}
                data-contextual-card-canonical-card="children"
                // ── THE EQUALITY EVIDENCE ──
                //
                // The effective-configuration FINGERPRINT is published by the card itself
                // (`data-children-card-fingerprint`), which is what makes it evidence rather than a
                // second opinion: it is emitted from the rows the card actually rendered.
                data-contextual-card-layout-id={resolved?.layoutId ?? ""}
                data-contextual-card-layout-version={resolved?.version ?? ""}
                data-contextual-card-from-published={resolved?.doc != null ? "true" : "false"}
                data-contextual-card-business-process={option.businessProcessKey ?? ""}
                data-contextual-card-stage={option.stageKey ?? ""}
                data-contextual-card-work-view={option.workViewId ?? ""}
            >
                <FocusPanelSummaryDocProvider
                    enabled
                    businessProcessKey={option.businessProcessKey}
                    workViewId={option.workViewId}
                    stageKey={option.stageKey}
                    statusKey={option.statusKey}
                >
                    <FocusPanelCardRenderer
                        model={childCardModel}
                        context={operationalContext}
                        focusPanelMode="summary"
                        mutation={childMutation}
                        // Tab-pane drill navigation, which a contextual card has no tabs for. The
                        // renderer requires it; pure cards ignore it.
                        compat={{ onSelectTab: () => {} }}
                    />
                </FocusPanelSummaryDocProvider>
            </div>
        );
    };

    /*
     * ── A DURABLE OPERATIONAL RELATIONSHIP RENDERS THE PLATFORM'S OWN CARD ──
     *
     * Not a published composition — there is no business process behind a commitment, and inventing
     * one so a card could resolve is exactly what this branch exists to avoid. The `scheduling` card
     * is the platform's canonical surface for assignments: it already renders committed and proposed
     * rows with their effective dating, and it already executes all six canonical assignment
     * capabilities. It is mounted UNCHANGED here, against the same `context.truth` contract the case
     * panel gives it, so the two hosts cannot drift into two assignment experiences.
     *
     * The registry is the gate (`cardAppliesToGrain`), not this component: a card reaches a grain
     * because someone declared that it can. The grain asked about is the SUBJECT'S — a staff member
     * is a `person`, and if that declaration were ever withdrawn this branch would go quiet rather
     * than render a card the registry does not admit.
     */
    /*
     * ── A CANONICAL CARD ABOUT THE RECORD ITSELF ──
     *
     * Not a commitment: the child's own details, their family, or a person's employment. Every card
     * here already exists and is already canonical; none is configured or re-derived in this file,
     * which decides only WHERE they appear.
     *
     * Household in particular is composed from the household's own record. It does not route through
     * a Work Unit to obtain the card, because a family is a record and not a queue position — and
     * fabricating a case to render one was the specific thing the convergence forbids.
     */
    if (option.surface === "canonical_record") {
        if (option.kind === "relationship" && option.hostEntityId) {
            return (
                <DurableHouseholdContextCard
                    householdId={option.hostEntityId}
                    contextKey={option.key}
                />
            );
        }
        if (option.kind === "employment" && subject.kind === "staff") {
            /*
             * The EXISTING Employment card, centered — read-only exactly as it is on the native
             * panel. `derivePersonEmploymentCard` decides nothing about employment: `is_staff`,
             * `current` and `state_label` arrive already decided by `lib/employment` and are carried
             * through. Making it editable here would be a second execution path for a capability
             * that lives elsewhere, and this slice is not that slice.
             */
            if (!cardAppliesToGrain("employment", "person")) return null;
            return (
                <div
                                        data-contextual-card="record"
                    data-contextual-card-context={option.key}
                    data-contextual-card-canonical-card="employment"
                >
                    <FocusPanelCardRenderer
                        model={derivePersonEmploymentCard(subject.person.employment)}
                        context={buildDurablePersonOperationalContext(subject.person, false, null)}
                        focusPanelMode="summary"
                    // Tab-pane drill navigation, which a contextual card has no tabs for. The
                    // renderer requires it; pure cards ignore it.
                    compat={{ onSelectTab: () => {} }}
                    />
                </div>
            );
        }
        /*
         * THE CHILD CONTEXT — the same canonical card the Enrollment context resolves.
         *
         * It used to render `child_identity`: four hardcoded facts, no photo, no medical rows, and
         * no way to change any of them. That was the platform holding two answers to "who is this
         * child", and an operator who reached Lennon from Operations got the smaller one.
         *
         * The tuple is empty here, which is the point — it addresses no process, so the org's own
         * Children Surface is what resolves. Not a fallback: the configured card for a child
         * considered as themselves rather than as a participant in something.
         */
        if (option.kind === "identity" && childSubject) {
            return renderCanonicalChildCard();
        }
        return null;
    }

    if (option.surface === "canonical_operational") {
        const grain = subject.kind === "child" ? "child" : "person";
        if (!cardAppliesToGrain("scheduling", grain)) return null;
        return (
            <div
                                data-contextual-card="operational"
                data-contextual-card-context={option.key}
                data-contextual-card-kind={option.kind}
                data-contextual-card-canonical-card="scheduling"
                data-contextual-card-subject-kind={subject.kind}
                data-contextual-card-site={option.siteLocationId ?? ""}
                // Committed and proposed counted SEPARATELY. A child whose only assignment is
                // proposed has zero commitments and is not unassigned, and one number could not say
                // both — which is the distinction `commitmentKind` exists to preserve.
                data-contextual-card-commitments={String(projection?.current?.assignments?.length ?? 0)}
                data-contextual-card-proposed={String(projection?.proposed?.assignments?.length ?? 0)}
            >
                <SchedulingCard
                    model={deriveSchedulingCardModel()}
                    context={operationalContext}
                    // The SAME generic contract a configured-field edit uses. An assignment write and
                    // a name edit are both "this record's canonical truth changed", and the host has
                    // one way of hearing that — so the surface underneath reloads on close either way,
                    // with no scheduling-specific channel.
                    onMutated={onSaved}
                />
            </div>
        );
    }

    if (option.surface === "none") {
        return (
            <div
                className="rounded-lg border border-alloy-stone/22 bg-white p-3"
                data-contextual-card="unconfigured"
                data-contextual-card-context={option.key}
            >
                <p className="text-[12.5px] font-medium text-alloy-midnight/75">{option.label}</p>
                <p className="mt-1 max-w-[60ch] text-[12px] text-alloy-midnight/55">
                    {option.detail ?? "No detail recorded."}
                </p>
                <p className="mt-2 max-w-[60ch] text-[11.5px] text-alloy-midnight/45">
                    This context has no card yet. It is not part of a business process, so there is
                    no published composition to show, and the platform has no canonical card for it —
                    the record&rsquo;s own information is above.
                </p>
            </div>
        );
    }

    if (!resolved) {
        return (
            <div
                className="rounded-lg border border-alloy-stone/22 bg-white p-3 text-[12px] text-alloy-midnight/50"
                data-contextual-card="loading"
            >
                Resolving configured card…
            </div>
        );
    }

    /*
     * The remaining branch is the CHILD card of a published composition, and it needs a child.
     *
     * A staff member reaching here means the context resolved to a published composition that
     * addresses the Child card — a real configuration state, not an error, and one this component
     * must not answer by rendering a Child card full of blanks about a person.
     */
    if (!childSubject) {
        return (
            <div
                className="rounded-lg border border-alloy-stone/22 bg-white p-3"
                data-contextual-card="unsupported-subject"
                data-contextual-card-context={option.key}
                data-contextual-card-subject-kind={subject.kind}
            >
                <p className="text-[12.5px] font-medium text-alloy-midnight/75">{option.label}</p>
                <p className="mt-1 max-w-[60ch] text-[12px] text-alloy-midnight/55">
                    This context&rsquo;s configured card describes a child. It has nothing to say
                    about a staff member, so it is not shown here.
                </p>
            </div>
        );
    }

    return renderCanonicalChildCard();
}
