"use client";

/**
 * THE DURABLE RECORD SURFACE — attention on a record that no queue holds.
 *
 * It renders `OpportunityFocusPanelModeGrid`: the SAME grid the Work Unit's inline panel renders,
 * with the same card renderers and the same published-composition machinery. There is no second
 * Focus Panel implementation here, no drawer, no Records panel, and no synthetic Work Unit — the
 * grid is source-agnostic by contract, so a model produced by the durable composer renders exactly
 * as one produced by the queue.
 *
 * ── WHY THIS IS NOT `InlineOpportunityFocusPanel` ──
 *
 * That component's 600 lines are selection state, payload reveal, hold-prior-payload swap
 * continuity, save coordination and action registry — machinery for a surface where the operator
 * moves between queue rows. A durable record has none of that: the model is fully composed before
 * it arrives (`phase: "settled"`), there is no row to swap to, and nothing settles later. Reusing
 * that component would have meant giving it a mode where most of it is inert.
 *
 * What IS shared is the part that matters: the grid, the cards, the composition.
 *
 * ── LOADING AND FAILURE ARE STATES, NOT BLANKS ──
 *
 * A record that cannot be composed says so. `not_found` covers both "no such record" and "not
 * reachable by this operator" deliberately — the resolver's contract is that those are
 * indistinguishable, and telling them apart here would leak the record's existence.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";

import OpportunityFocusPanelModeGrid from "@/components/admin/focusPanel/OpportunityFocusPanelModeGrid";
import DurableRecordContextStrip from "@/components/presentation/durableRecord/DurableRecordContextStrip";
import { dispatchAdminV2CloseWorkspaceModals } from "@/lib/adminV2/workspaceModalEvents";
import { dispatchOperatorFocusSelection } from "@/lib/runtime/focus/operatorFocusSelection";
import type { SearchDestination } from "@/lib/search/searchContracts";
import DurableRecordContextualCard from "@/components/presentation/durableRecord/DurableRecordContextualCard";
import {
    resolveInitialContextOption,
    type DurableRecordContextOption,
} from "@/lib/context/durableRecordContextOptions";
import type { DurableChildSubject } from "@/lib/adminV2/runtime/focusPanel/durableSubject/durableChildSubjectModel";
import type { DurablePersonSubject } from "@/lib/adminV2/runtime/focusPanel/durableSubject/durablePersonSubjectModel";
import type { SchedulingProjectionFirstPaint } from "@/lib/adminV2/viewModel/drawer/opportunity/loadSchedulingProjectionsForFirstPaint";
import {
    decodeDurableRecordModel,
    type DurableRecordModelWire,
} from "@/lib/adminV2/runtime/focusPanel/durableSubject/durableRecordModelWire";
import type { FocusPanelWorkModeModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelWorkModeModel";
import type { DurableSubjectType } from "@/lib/runtime/focus/durableRecordRoute";

type LoadState =
    | { status: "loading" }
    | {
          status: "ready";
          model: FocusPanelWorkModeModel;
          /** Selectable business contexts. Empty is ordinary — a record can stand on its own. */
          contexts: DurableRecordContextOption[];
          /**
           * `Go to` entries — operational destinations resolved by Search's own resolver over the
           * same contexts. Related WORK, never a record view: selecting one navigates.
           */
          relatedWork: SearchDestination[];
          /** The child, when this record is one — the contextual card composes against it. */
          childSubject: DurableChildSubject | null;
          /** The person, when this record is one. Carries only identity; commitments ride below. */
          /**
           * The composed person, WHOLE — not narrowed to id + label.
           *
           * The Employment card composes from the person's own employment signal and truth bag, so
           * a host that kept only an id would have to re-fetch or re-derive what the composer
           * already produced. It is the same object the model was built from, which is what keeps
           * the card beside the panel from disagreeing with it.
           */
          personSubject: DurablePersonSubject | null;
          /**
           * Canonical assignment facts for a `canonical_operational` context, composed with the
           * record so the Schedule card reveals WITH the panel rather than opening its own gate.
           */
          schedulingProjection: SchedulingProjectionFirstPaint | null;
      }
    | { status: "not_found" }
    | { status: "error"; message: string };

export default function DurableRecordSurface({
    subjectType,
    subjectId,
    presentation = "full",
    /** The card the gesture asked to land on (ASPECT). Absent = the grain's default composition. */
    cardKey,
    /**
     * The business context the ENTRY would prefer to open on — a preference, never a requirement.
     * Honoured only when the record actually holds it; absent, the first context wins.
     */
    contextKey,
    /** Called after a successful write, so the list underneath can refresh exactly that row. */
    onRecordChanged,
    /**
     * Ask the host to close this record. `Go to` calls it before dispatching the movement — leaving
     * for related work is a dismissal, and the host owns what a dismissal tells the list beneath.
     */
    onRequestClose,
}: {
    subjectType: DurableSubjectType;
    subjectId: string;
    /** See {@link WorkspaceDurableRecordHost}'s `presentation`. */
    presentation?: "full" | "contextual";
    cardKey?: string | null;
    contextKey?: string | null;
    onRecordChanged?: () => void;
    onRequestClose?: () => void;
}) {
    const [state, setState] = useState<LoadState>({ status: "loading" });
    const [selectedContextKey, setSelectedContextKey] = useState<string | null>(null);
    /** Whether the initial context has been chosen for THIS record. See `load` below. */
    const selectionInitializedRef = useRef(false);

    /**
     * Reload the composed record.
     *
     * `quiet` keeps the current model on screen while the refetch runs. A save is not a navigation:
     * dropping to the loading state would close the card the operator just edited and return them to
     * the chooser, which reads as the edit having thrown them out.
     */
    const load = useCallback(async (quiet = false) => {
        if (!quiet) setState({ status: "loading" });
        try {
            const res = await fetch(
                `/api/admin/durable-record?subject_type=${encodeURIComponent(subjectType)}&subject_id=${encodeURIComponent(subjectId)}`,
                { credentials: "include" },
            );
            if (res.status === 404) {
                setState({ status: "not_found" });
                return;
            }
            const json = (await res.json().catch(() => null)) as
                | {
                      ok?: boolean;
                      model?: DurableRecordModelWire;
                      contexts?: DurableRecordContextOption[];
                      relatedWork?: SearchDestination[];
                      childSubject?: DurableChildSubject | null;
                      personSubject?: DurablePersonSubject | null;
                      schedulingProjection?: SchedulingProjectionFirstPaint | null;
                      message?: string;
                  }
                | null;
            if (!res.ok || !json?.ok || !json.model) {
                setState({ status: "error", message: json?.message ?? "Could not open this record." });
                return;
            }
            const contexts = (json.contexts ?? []) as DurableRecordContextOption[];
            const person = (json.personSubject ?? null) as DurablePersonSubject | null;
            setState({
                status: "ready",
                model: decodeDurableRecordModel(json.model),
                contexts,
                relatedWork: (json.relatedWork ?? []) as SearchDestination[],
                childSubject: (json.childSubject ?? null) as DurableChildSubject | null,
                personSubject: person?.personId
                    ? { ...person, label: person.label?.trim() || "Staff member" }
                    : null,
                schedulingProjection:
                    (json.schedulingProjection ?? null) as SchedulingProjectionFirstPaint | null,
            });
            /*
             * WHICH CONTEXT OPENS FIRST.
             *
             * `full` keeps its existing behaviour: something is always selected, because that
             * presentation shows the whole record anyway and an unselected strip would read as a
             * missing card.
             *
             * `contextual` starts UNSELECTED and shows the chooser, because the chooser IS the
             * product there — the question "what do you want to see about Lennon?" is the thing the
             * operator arrived to answer. Two exceptions, both honest: an ENTRY that named a context
             * already answered it, and a subject with exactly ONE option has no decision to make.
             * Adding chooser furniture in front of a single option is the kind of ceremony this
             * convergence is removing.
             */
            /*
             * INITIALIZE ONCE PER RECORD — never re-apply.
             *
             * `load` runs again whenever its identity changes, and re-applying the initial selection
             * from inside it silently DISCARDS the operator's choice. That is what made exactly the
             * two fetching contexts fail: Enrollment resolves a published doc and Household composes
             * the family, both of which re-render this subtree, and the re-applied initial selection
             * reset the key to null — so the card unmounted and the chooser reappeared. Child and
             * Schedule render straight from props, never re-ran it, and looked fine.
             *
             * A choice the operator has already made is not an initial condition, so it is guarded
             * by a ref rather than by the effect's dependencies — dependencies say WHEN to reload
             * data, and this is not data.
             */
            if (selectionInitializedRef.current) return;
            selectionInitializedRef.current = true;
            /*
             * RECORD-FIRST. The operator clicked Lennon, so Lennon is the default object of
             * attention: the record card opens immediately, with no chooser in front of it.
             *
             * The record contexts are the `canonical_record` options — the child's own identity,
             * their family, a person's employment — and the default is the subject's OWN identity
             * (`identity` for a child, `employment` for a person), which is always first among them
             * in the projection's order. An entry's preference is honoured only when it names a
             * record context: a preferred OPERATIONAL context is related work, and related work
             * never replaces the record card inside Operations — the `Go to` entries carry it.
             *
             * `full` keeps its existing behaviour: something is always selected there.
             */
            if (presentation === "full") {
                setSelectedContextKey(resolveInitialContextOption(contexts, contextKey)?.key ?? null);
            } else {
                /*
                 * An entry's preference is a DECLARED INTENT, and two kinds are honoured in place:
                 *
                 *   – a record context ("open Lennon on Household") switches which record view
                 *     shows first;
                 *   – an OPERATIONAL context ("Create assignment → choose Lennon" arrives with
                 *     `schedule`) opens the platform's operational card directly. The operator
                 *     already said what they came to do; landing them on the record card and making
                 *     them find Schedule again would replace their command with a detour.
                 *
                 * A PROCESS preference is the one kind that is not selected in place: a process is
                 * related WORK, its home is the Work View, and the `Go to` entries are how the
                 * overlay offers it. The record card stays the default there.
                 */
                const recordOptions = contexts.filter((o) => o.surface === "canonical_record");
                const preferred = contextKey
                    ? resolveInitialContextOption(
                          contexts.filter(
                              (o) =>
                                  o.surface === "canonical_record"
                                  || o.surface === "canonical_operational",
                          ),
                          contextKey,
                      )
                    : null;
                setSelectedContextKey(
                    preferred?.key
                        ?? recordOptions[0]?.key
                        // A record with no record context at all (no identity card resolves) still
                        // opens on SOMETHING it holds rather than on a chooser.
                        ?? contexts[0]?.key
                        ?? null,
                );
            }
        } catch (e) {
            setState({
                status: "error",
                message: e instanceof Error ? e.message : "Could not open this record.",
            });
        }
    }, [subjectType, subjectId, contextKey, presentation]);

    useEffect(() => {
        // A different subject is a different record, and its initial context must be chosen afresh.
        selectionInitializedRef.current = false;
        void load();
    }, [load]);

    if (state.status === "loading") {
        return (
            <div className="px-6 py-10 text-[13px] text-alloy-midnight/55" data-durable-record="loading">
                Opening record…
            </div>
        );
    }

    if (state.status === "not_found") {
        return (
            <div className="px-6 py-10" data-durable-record="not-found">
                <p className="text-[14px] font-medium text-alloy-midnight/80">Record not available</p>
                <p className="mt-1 max-w-[54ch] text-[12.5px] text-alloy-midnight/55">
                    This record either does not exist or is outside your access.
                </p>
            </div>
        );
    }

    if (state.status === "error") {
        return (
            <div className="px-6 py-10" data-durable-record="error">
                <p className="text-[14px] font-medium text-alloy-midnight/80">Could not open this record</p>
                <p className="mt-1 max-w-[54ch] text-[12.5px] text-alloy-midnight/55">{state.message}</p>
                <button
                    type="button"
                    className="mt-3 rounded border border-admin-border px-3 py-1.5 text-[12px] font-medium"
                    onClick={() => void load()}
                    data-durable-record-retry="true"
                >
                    Try again
                </button>
            </div>
        );
    }

    const selectedContext =
        state.contexts.find((option) => option.key === selectedContextKey) ?? null;

    /*
     * ── THE RECORD, AND THE WORK, KEPT APART ──
     *
     * Record contexts (`canonical_record`) switch the centered card IN PLACE: Child ↔ Household on
     * a child, Employment on a person. They are views of who this record IS.
     *
     * Related work is everything the operator can LEAVE for:
     *   – `Go to` destinations, resolved by Search's own resolver over the same contexts. Selecting
     *     one closes Operations and commits the exact selection a Search click would have.
     *   – in-place operational contexts (a staff member's Schedule) that have no Work View to go
     *     to. The platform's own card is the only realization of that relationship, so it renders
     *     here — and it is listed as work, not as a record view, because that is what it is.
     *
     * A destination that covers an in-place operational context supersedes it: one relationship
     * must not appear twice, once as navigation and once as a card.
     */
    const recordOptions =
        presentation === "contextual"
            ? state.contexts.filter((option) => option.surface === "canonical_record")
            : [];
    const inPlaceOperational =
        presentation === "contextual"
            ? state.contexts.filter(
                  (option) =>
                      option.surface === "canonical_operational"
                      && !state.relatedWork.some(
                          (destination) =>
                              destination.key === "assignment"
                              || destination.context_key === option.key,
                      ),
              )
            : [];
    const hasRelatedWork = state.relatedWork.length > 0 || inPlaceOperational.length > 0;

    /** Commit one `Go to`. The payload mapping is the SAME one GlobalSearchBox performs. */
    const goTo = (destination: SearchDestination) => {
        const hostType = (destination.host_entity_type ?? "").trim();
        const hostId = (destination.host_entity_id ?? "").trim();
        if (destination.target !== "focus_panel" || !destination.card_key || !hostType || !hostId) return;
        // Leave FIRST — the record overlay and the Operations workspace both close before the
        // movement commits, so the operator's click is acknowledged immediately and the kernel's
        // listener lands attention on an unobstructed surface.
        onRequestClose?.();
        dispatchAdminV2CloseWorkspaceModals();
        dispatchOperatorFocusSelection({
            entity_type: hostType,
            entity_id: hostId,
            host_work_unit_key: (destination.host_work_unit_key ?? "").trim() || null,
            host_work_view_id: (destination.host_work_view_id ?? "").trim() || null,
            operational_member_id: (destination.operational_member_id ?? "").trim() || null,
            card_focus: {
                card_key: destination.card_key,
                item_id: destination.item_id ?? null,
                context_key: destination.context_key ?? null,
            },
        });
    };

    return (
        <div
            className="flex min-h-0 flex-1 flex-col"
            data-durable-record="ready"
            data-durable-record-subject-type={state.model.subject.type}
            data-durable-record-subject-id={state.model.subject.id}
            data-durable-record-context-count={state.contexts.length}
        >
            {presentation === "full" ? (
                <DurableRecordContextStrip
                    options={state.contexts}
                    selectedKey={selectedContextKey}
                    onSelect={setSelectedContextKey}
                />
            ) : (
                /*
                 * MINIMAL CHROME — the canonical card below is the primary object, and this row is
                 * only what the card cannot carry for itself: whose record this is, and which
                 * record view is showing. Rendered flat (no box) so the card's own border and
                 * elevation are the only frame on screen.
                 */
                <div
                    className="flex flex-wrap items-center justify-between gap-2 px-1 pb-2"
                    data-record-overlay-header="true"
                >
                    <p className="text-[13px] font-semibold text-alloy-midnight">
                        {state.model.subject.label ?? "Record"}
                    </p>
                    {recordOptions.length > 1 ? (
                        <div
                            className="flex items-center gap-1"
                            role="tablist"
                            aria-label="Record views"
                            data-record-nav="true"
                        >
                            {recordOptions.map((option) => {
                                const active = option.key === selectedContextKey;
                                return (
                                    <button
                                        key={option.key}
                                        type="button"
                                        role="tab"
                                        aria-selected={active}
                                        onClick={() => setSelectedContextKey(option.key)}
                                        data-record-context-choice={option.key}
                                        data-record-context-kind={option.kind}
                                        data-durable-record-context={option.key}
                                        data-durable-record-context-active={active ? "true" : "false"}
                                        className={[
                                            "rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors",
                                            active
                                                ? "bg-alloy-juniper/[0.12] text-alloy-juniper"
                                                : "text-alloy-midnight/60 hover:bg-alloy-stone/[0.08] hover:text-alloy-midnight",
                                        ].join(" ")}
                                    >
                                        {option.label}
                                    </button>
                                );
                            })}
                        </div>
                    ) : null}
                </div>
            )}

            <div
                className={
                    presentation === "contextual"
                        ? "min-h-0 flex-1 overflow-y-auto"
                        : "min-h-0 flex-1 overflow-y-auto px-4 py-4"
                }
            >
                {/*
                  * THE FULL COMPOSITION — every card the grain declares.
                  *
                  * Deliberately NOT rendered in `contextual` presentation. Operations realizes a
                  * record as "choose one thing, see that thing", and rendering the grid there would
                  * put the giant record page back underneath the chooser — the exact surface this
                  * convergence removed. The grid stays available for record-first runtimes where the
                  * record genuinely IS the destination.
                  */}
                {presentation === "full" ? (
                    <OpportunityFocusPanelModeGrid
                        model={state.model}
                        // Drill tabs belong to the queue-hosted panel's drawer-era cards; a durable
                        // record composes none of them, so there is nothing to select.
                        onSelectTab={() => {}}
                        requestedCardFocus={
                            cardKey ? { card_key: cardKey, subject_key: state.model.subject.id } : null
                        }
                    />
                ) : null}

                {/*
                  * The contextual card for the selected context, when the record is a child.
                  *
                  * It renders one of three things, and the OPTION says which: the tenant's PUBLISHED
                  * composition for a process context (the same document the native operational panel
                  * resolves), the platform's CANONICAL card for a durable operational relationship
                  * such as Schedule, or an honest statement that this context has neither yet.
                  */}
                {selectedContext && (state.childSubject || state.personSubject) ? (
                    <div className="mt-3">
                        <DurableRecordContextualCard
                            option={selectedContext}
                            // The record is one subject or the other, decided by which the composer
                            // returned. Child is checked first only because it is the older path;
                            // the route never returns both.
                            subject={
                                state.childSubject
                                    ? { kind: "child", child: state.childSubject }
                                    : { kind: "staff", person: state.personSubject! }
                            }
                            schedulingProjection={state.schedulingProjection}
                            /*
                             * A SAVE REFRESHES THIS RECORD, not only the list underneath it.
                             *
                             * The card shows the value it just wrote from its own session state, so
                             * the surface LOOKED right while the composed truth behind it stayed at
                             * the value it had on open. Re-entering Edit then seeded the stale fact
                             * and offered to save it back — the operator's own change silently
                             * proposed as an undo.
                             *
                             * Quietly, so the card the operator is holding stays on screen.
                             */
                            onSaved={() => {
                                void load(true);
                                onRecordChanged?.();
                            }}
                        />
                    </div>
                ) : null}

                {/*
                  * ── RELATED WORK — where this record is being worked, offered as NAVIGATION ──
                  *
                  * Never a record view. A `Go to` closes Operations and commits the same selection
                  * a Search click would have (one resolver, one executor); an in-place operational
                  * entry switches the centered card because no Work View exists to go to.
                  */}
                {presentation === "contextual" && hasRelatedWork ? (
                    <div className="mt-3 px-1" data-record-related-work="true">
                        <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/40">
                            Related work
                        </p>
                        <ul className="mt-1.5 grid gap-1">
                            {state.relatedWork.map((destination) => (
                                <li key={destination.key}>
                                    <button
                                        type="button"
                                        onClick={() => goTo(destination)}
                                        data-record-related-work-goto={destination.key}
                                        data-record-related-work-view={destination.host_work_view_id ?? ""}
                                        className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left hover:bg-alloy-stone/[0.08]"
                                    >
                                        <span className="truncate text-[12.5px] font-medium text-alloy-midnight/80">
                                            {destination.label}
                                        </span>
                                        <span className="shrink-0 text-[12px] font-semibold text-alloy-bend-pine">
                                            Go to →
                                        </span>
                                    </button>
                                </li>
                            ))}
                            {inPlaceOperational.map((option) => {
                                const active = option.key === selectedContextKey;
                                return (
                                    <li key={option.key}>
                                        <button
                                            type="button"
                                            onClick={() => setSelectedContextKey(option.key)}
                                            data-record-context-choice={option.key}
                                            data-record-context-kind={option.kind}
                                            data-durable-record-context={option.key}
                                            data-durable-record-context-active={active ? "true" : "false"}
                                            className={[
                                                "flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left",
                                                active
                                                    ? "bg-alloy-juniper/[0.10] text-alloy-juniper"
                                                    : "hover:bg-alloy-stone/[0.08]",
                                            ].join(" ")}
                                        >
                                            <span className="truncate text-[12.5px] font-medium text-alloy-midnight/80">
                                                {option.label}
                                            </span>
                                            <span className="shrink-0 text-[12px] text-alloy-midnight/45">
                                                {active ? "Showing" : "View"}
                                            </span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                ) : null}
            </div>
        </div>
    );
}
