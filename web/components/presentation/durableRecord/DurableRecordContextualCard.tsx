"use client";

/**
 * THE CONFIGURED CONTEXTUAL CARD, rendered on a durable host.
 *
 * It resolves the tenant's published Focus Panel composition for the SELECTED context's addressing
 * tuple — the same `entity_layouts` row, through the same endpoint and the same
 * `resolveSurfaceVariant`, that the native operational Focus Panel resolves — and renders the Child
 * card's configured fields from it.
 *
 * Flatter than the native card, and deliberately so: a record host is a denser surface than a work
 * surface. What it may NOT do is change which fields exist, what they are called, what order they
 * are in, or which may be edited — none of which is decided here. `resolveContextualChildCard`
 * decides, from configuration, for both hosts.
 *
 * ── WHY THE DOC ID AND VERSION ARE IN THE DOM ──
 *
 * The invariant is an equality between two hosts, and equality claims that cannot be observed tend
 * to become aspirations. The resolved layout id, its version and a fingerprint of the effective
 * configuration are published as data attributes so a browser certification can assert the SAME
 * values it reads on the native panel — rather than asserting that both surfaces "show child
 * information", which is exactly the proof the architecture brief refuses.
 *
 * ── AN UNCONFIGURABLE CONTEXT SAYS SO ──
 *
 * Assignment and Employment have no business process, so there is no published composition to
 * resolve for them. The card states that plainly instead of approximating one. Inventing a card for
 * a context that has none is the failure mode this whole slice exists to avoid.
 *
 * ── EDITING GOES THROUGH THE DOMAIN'S OWN AUTHORITY ──
 *
 * A field is editable here when the CONFIGURATION says it is editable AND the value's canonical home
 * is the child record. Enrollment projections satisfy the first and not the second: they live on a
 * participation row, and a durable host writing one would create participation as a side effect of
 * an edit. They render, configured and in order, without an edit affordance — a truthful card, not
 * a degraded one.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import SchedulingCard from "@/components/admin/focusPanel/cards/SchedulingCard";
import FocusPanelCardRenderer from "@/components/admin/focusPanel/FocusPanelCardRenderer";
import { deriveChildIdentityCard } from "@/lib/adminV2/runtime/focusPanel/durableSubject/deriveChildFocusPanelCards";
import { derivePersonEmploymentCard } from "@/lib/adminV2/runtime/focusPanel/durableSubject/derivePersonFocusPanelCards";
import type { DurablePersonSubject } from "@/lib/adminV2/runtime/focusPanel/durableSubject/durablePersonSubjectModel";
import { buildDurablePersonOperationalContext } from "@/lib/adminV2/runtime/focusPanel/durableSubject/focusPanelWorkModeModelFromDurableSubject";
import DurableHouseholdContextCard from "@/components/presentation/durableRecord/DurableHouseholdContextCard";
import { cardAppliesToGrain } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardRegistry";
import { DURABLE_CHILD_ROWS_KEY } from "@/lib/adminV2/runtime/focusPanel/collections/focusPanelCollectionPresentation";
import { DURABLE_STAFF_SUBJECT_KEY } from "@/lib/adminV2/runtime/focusPanel/durableSubject/durableStaffSchedulingSubject";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";
import { deriveSchedulingCardModel } from "@/lib/adminV2/runtime/focusPanel/durableSubject/deriveSchedulingCardModel";
import { buildDurableChildOperationalContext } from "@/lib/adminV2/runtime/focusPanel/durableSubject/focusPanelWorkModeModelFromDurableSubject";
import type { SchedulingProjectionFirstPaint } from "@/lib/adminV2/viewModel/drawer/opportunity/loadSchedulingProjectionsForFirstPaint";
import type { DurableRecordContextOption } from "@/lib/context/durableRecordContextOptions";
import {
    contextualCardConfigurationFingerprint,
    resolveContextualChildCard,
} from "@/lib/adminV2/runtime/focusPanel/contextualCard/resolveContextualChildCard";
import type { DurableChildSubject } from "@/lib/adminV2/runtime/focusPanel/durableSubject/durableChildSubjectModel";
import {
    saveContextualChildField,
    writeTargetForField,
} from "@/lib/adminV2/runtime/focusPanel/contextualCard/saveContextualChildField";
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
        const res = await fetch(
            `/api/admin/entity-layouts/focus-panel-summary${qs ? `?${qs}` : ""}`,
            { credentials: "include" },
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
    hostSiteLocationId,
    onSaved,
}: {
    option: DurableRecordContextOption;
    subject: DurableContextualSubject;
    /**
     * Canonical assignment facts for a `canonical_operational` context, composed server-side. Null
     * when the subject holds no commitment — which is a state, not a failure.
     */
    schedulingProjection?: SchedulingProjectionFirstPaint | null;
    /**
     * The site the HOST workspace is operating in, when there is one.
     *
     * Passed through to the card's truth envelope beside `_scheduling_projection`, because this
     * answers "where am I operating" — a question the record itself cannot answer and should not
     * try to. Record-only hosts supply nothing and the card falls back to the subject's own truth.
     */
    hostSiteLocationId?: string | null;
    /** Fired after a successful write so the list underneath can refresh this row. */
    onSaved?: () => void;
}) {
    const [resolved, setResolved] = useState<Resolved | null>(null);
    /** Values written in this session, so the card shows the saved fact without a re-fetch. */
    const [overrides, setOverrides] = useState<Record<string, string | null>>({});
    const [editing, setEditing] = useState<string | null>(null);
    const [draft, setDraft] = useState("");
    const [saveError, setSaveError] = useState<string | null>(null);

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
     * `_scheduling_projection` is attached here rather than in the composer because it belongs to
     * the SELECTED CONTEXT, not to the subject's identity: a record with no Schedule context
     * selected has no business carrying assignment facts in its truth.
     *
     * `canMutate` is true because this card's whole purpose is invoking canonical assignment
     * actions; each of those re-authorizes on execution, as it does from the case panel.
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
                    _host_site_location_id: hostSiteLocationId ?? null,
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
                ...childSubject.truth,
                _scheduling_projection: schedulingProjection ?? null,
                _host_site_location_id: hostSiteLocationId ?? null,
                /*
                 * THE SUBJECT, AS THE COLLECTION'S ONE MEMBER.
                 *
                 * The card iterates a child collection because on a case it renders a family's
                 * roster. Here the roster has exactly one member and it is the record itself — the
                 * same degenerate-case reasoning `personEmploymentSignal` already uses for a durable
                 * person's Employment.
                 *
                 * Under `_durable_child_rows`, never `_inquiry_children`: there is no inquiry, and
                 * borrowing the case's key would tell the next reader that there is one.
                 */
                [DURABLE_CHILD_ROWS_KEY]: [
                    {
                        id: childSubject.memberId,
                        customer_member_id: childSubject.memberId,
                        person_id: childSubject.personId,
                        display_name: childSubject.label,
                        dob: childSubject.dateOfBirth,
                    },
                ],
            },
        };
    }, [subject, childSubject, schedulingProjection]);

    const commit = useCallback(
        async (fieldKey: string, value: string) => {
            setEditing(null);
            setSaveError(null);
            // Only reachable from the configured-field branch, which renders for a child only. The
            // guard makes that a type fact rather than a reading of the control flow above.
            if (!childSubject) return;
            const result = await saveContextualChildField({ subject: childSubject, fieldKey, value });
            if (!result.ok) {
                setSaveError(result.error);
                return;
            }
            setOverrides((prev) => ({ ...prev, [fieldKey]: value.trim() || null }));
            onSaved?.();
        },
        [childSubject, onSaved],
    );

    useEffect(() => {
        if (option.surface !== "published_composition") {
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
    ]);

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
     * Not a published composition and not a commitment: the child's own details, or their family.
     * Both cards already exist and are already canonical — `child_identity` from the durable child
     * composition, `household` from `composeDurableHouseholdSubject`. Neither is configured here and
     * neither is re-derived; this branch only decides WHERE they appear.
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
                    className="rounded-lg border border-alloy-stone/22 bg-white"
                    data-contextual-card="record"
                    data-contextual-card-context={option.key}
                    data-contextual-card-canonical-card="employment"
                >
                    <FocusPanelCardRenderer
                        model={derivePersonEmploymentCard(subject.person.employment)}
                        context={buildDurablePersonOperationalContext(subject.person, false, null)}
                        focusPanelMode="summary"
                    />
                </div>
            );
        }
        if (option.kind === "identity" && childSubject) {
            if (!cardAppliesToGrain("child_identity", "child")) return null;
            return (
                <div
                    className="rounded-lg border border-alloy-stone/22 bg-white"
                    data-contextual-card="record"
                    data-contextual-card-context={option.key}
                    data-contextual-card-canonical-card="child_identity"
                >
                    <FocusPanelCardRenderer
                        model={deriveChildIdentityCard(childSubject, new Date())}
                        context={operationalContext}
                        focusPanelMode="summary"
                    />
                </div>
            );
        }
        return null;
    }

    if (option.surface === "canonical_operational") {
        const grain = subject.kind === "child" ? "child" : "person";
        if (!cardAppliesToGrain("scheduling", grain)) return null;
        return (
            <div
                className="rounded-lg border border-alloy-stone/22 bg-white"
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

    const card = resolveContextualChildCard(resolved.doc, childSubject, {
        fromPublishedDoc: resolved.doc != null,
    });
    const fingerprint = contextualCardConfigurationFingerprint(card.rows);

    return (
        <div
            className="rounded-lg border border-alloy-stone/22 bg-white"
            data-contextual-card="child"
            data-contextual-card-context={option.key}
            // ── THE EQUALITY EVIDENCE ──
            data-contextual-card-layout-id={resolved.layoutId ?? ""}
            data-contextual-card-layout-version={resolved.version ?? ""}
            data-contextual-card-nested-surface={card.nestedSurfaceId}
            data-contextual-card-from-published={card.fromPublishedDoc ? "true" : "false"}
            data-contextual-card-fingerprint={fingerprint}
            data-contextual-card-business-process={option.businessProcessKey ?? ""}
            data-contextual-card-stage={option.stageKey ?? ""}
            data-contextual-card-work-view={option.workViewId ?? ""}
        >
            <div className="flex items-baseline justify-between gap-2 border-b border-alloy-stone/15 px-3 py-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.07em] text-alloy-bend-pine">
                    Child
                </span>
                <span className="text-[11px] text-alloy-midnight/45">{option.label}</span>
            </div>

            {saveError ? (
                <p
                    className="mx-3 mt-2 rounded border border-red-200 bg-red-50 px-2 py-1.5 text-[11.5px] text-red-700"
                    data-contextual-card-save-error="true"
                >
                    {saveError}
                </p>
            ) : null}

            {card.rows.length === 0 ? (
                <p className="px-3 py-4 text-[12px] text-alloy-midnight/50">
                    No fields are configured on the Child card for this context.
                </p>
            ) : (
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 px-3 py-3">
                    {card.rows.map((row) => {
                        const value =
                            row.fieldKey in overrides ? overrides[row.fieldKey] ?? null : row.value;
                        // Configured as editable AND canonically owned by the child record.
                        const canEditHere =
                            row.editable && writeTargetForField(row.fieldKey) === "child_record";
                        const isEditing = editing === row.fieldKey;

                        return (
                            <div
                                key={row.fieldKey}
                                className={row.layoutWidth === "full" ? "col-span-2" : undefined}
                                data-contextual-card-field={row.fieldKey}
                                data-contextual-card-field-editable={row.editable ? "true" : "false"}
                                data-contextual-card-field-writable={canEditHere ? "true" : "false"}
                            >
                                <dt className="text-[10px] font-medium uppercase tracking-[0.08em] text-alloy-midnight/40">
                                    {row.label}
                                </dt>
                                <dd className="text-[12.5px] text-alloy-midnight">
                                    {isEditing ? (
                                        <input
                                            autoFocus
                                            value={draft}
                                            onChange={(e) => setDraft(e.target.value)}
                                            onBlur={() => void commit(row.fieldKey, draft)}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") void commit(row.fieldKey, draft);
                                                if (e.key === "Escape") setEditing(null);
                                            }}
                                            aria-label={row.label}
                                            data-contextual-card-input={row.fieldKey}
                                            className="w-full rounded border border-alloy-juniper/50 bg-white px-1.5 py-0.5 text-[12.5px] text-alloy-midnight outline-none"
                                        />
                                    ) : canEditHere ? (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setDraft(value ?? "");
                                                setEditing(row.fieldKey);
                                            }}
                                            data-contextual-card-edit={row.fieldKey}
                                            className="w-full rounded px-1 py-0.5 text-left hover:bg-alloy-stone/[0.08]"
                                        >
                                            {value ?? <span className="text-alloy-midnight/35">Not set</span>}
                                        </button>
                                    ) : (
                                        <span className="px-1">
                                            {value ?? <span className="text-alloy-midnight/35">Not set</span>}
                                        </span>
                                    )}
                                </dd>
                            </div>
                        );
                    })}
                </dl>
            )}
        </div>
    );
}
