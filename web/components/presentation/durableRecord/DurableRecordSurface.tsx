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
import DurableRecordContextualCard from "@/components/presentation/durableRecord/DurableRecordContextualCard";
import {
    resolveInitialContextOption,
    type DurableRecordContextOption,
} from "@/lib/context/durableRecordContextOptions";
import type { DurableChildSubject } from "@/lib/adminV2/runtime/focusPanel/durableSubject/durableChildSubjectModel";
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
          /** The child, when this record is one — the contextual card composes against it. */
          childSubject: DurableChildSubject | null;
          /** The person, when this record is one. Carries only identity; commitments ride below. */
          personSubject: { personId: string; label: string } | null;
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
}: {
    subjectType: DurableSubjectType;
    subjectId: string;
    /** See {@link WorkspaceDurableRecordHost}'s `presentation`. */
    presentation?: "full" | "contextual";
    cardKey?: string | null;
    contextKey?: string | null;
    onRecordChanged?: () => void;
}) {
    const [state, setState] = useState<LoadState>({ status: "loading" });
    const [selectedContextKey, setSelectedContextKey] = useState<string | null>(null);
    /** Whether the initial context has been chosen for THIS record. See `load` below. */
    const selectionInitializedRef = useRef(false);

    const load = useCallback(async () => {
        setState({ status: "loading" });
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
                      childSubject?: DurableChildSubject | null;
                      personSubject?: { personId?: string; label?: string } | null;
                      schedulingProjection?: SchedulingProjectionFirstPaint | null;
                      message?: string;
                  }
                | null;
            if (!res.ok || !json?.ok || !json.model) {
                setState({ status: "error", message: json?.message ?? "Could not open this record." });
                return;
            }
            const contexts = (json.contexts ?? []) as DurableRecordContextOption[];
            const person = json.personSubject ?? null;
            setState({
                status: "ready",
                model: decodeDurableRecordModel(json.model),
                contexts,
                childSubject: (json.childSubject ?? null) as DurableChildSubject | null,
                personSubject:
                    person?.personId
                        ? { personId: person.personId, label: person.label?.trim() || "Staff member" }
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
            const preferred = resolveInitialContextOption(contexts, contextKey);
            setSelectedContextKey(
                presentation === "full"
                    ? preferred?.key ?? null
                    : contextKey
                      ? preferred?.key ?? null
                      : contexts.length === 1
                        ? contexts[0]!.key
                        : null,
            );
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

    return (
        <div
            className="flex min-h-0 flex-1 flex-col"
            data-durable-record="ready"
            data-durable-record-subject-type={state.model.subject.type}
            data-durable-record-subject-id={state.model.subject.id}
            data-durable-record-context-count={state.contexts.length}
        >
            {/* Only when there is a CHOICE. One context is not a decision. */}
            {presentation === "full" || selectedContextKey ? (
                <DurableRecordContextStrip
                    options={state.contexts}
                    selectedKey={selectedContextKey}
                    onSelect={setSelectedContextKey}
                />
            ) : null}

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                {/*
                  * THE CHOOSER — "what do you want to see about Lennon?"
                  *
                  * Business language only. Every line is an option the subject ACTUALLY holds, from
                  * the same producer Search reads; nothing here is synthesized and nothing is
                  * hardcoded, so a child with no household simply has no Household line rather than
                  * a line that opens nothing.
                  *
                  * No ids, no process keys, no context-type names. An operator choosing between
                  * "Enrollment · Waitlist" and "Household" is making a business decision, and the
                  * machinery that resolves it is not part of the question.
                  */}
                {presentation === "contextual" && !selectedContextKey ? (
                    <div data-record-context-chooser="true">
                        <p className="px-1 text-[13px] font-semibold text-alloy-midnight">
                            {state.model.subject.label ?? "Record"}
                        </p>
                        {state.contexts.length === 0 ? (
                            <p className="mt-2 px-1 text-[12px] text-alloy-midnight/55">
                                There is nothing recorded about this record yet.
                            </p>
                        ) : (
                            <ul className="mt-2 grid gap-1.5">
                                {state.contexts.map((option) => (
                                    <li key={option.key}>
                                        <button
                                            type="button"
                                            onClick={() => setSelectedContextKey(option.key)}
                                            data-record-context-choice={option.key}
                                            data-record-context-kind={option.kind}
                                            className="flex w-full items-center justify-between gap-3 rounded-lg border border-alloy-stone/22 bg-white px-3 py-2.5 text-left hover:border-alloy-bend-pine/40 hover:bg-alloy-bend-pine/[0.04]"
                                        >
                                            <span className="min-w-0">
                                                <span className="block truncate text-[13px] font-semibold text-alloy-midnight">
                                                    {option.label}
                                                </span>
                                                {option.detail ? (
                                                    <span className="mt-0.5 block truncate text-[11.5px] text-alloy-midnight/55">
                                                        {option.detail}
                                                    </span>
                                                ) : null}
                                            </span>
                                            <ChevronRight
                                                className="h-4 w-4 shrink-0 text-alloy-midnight/35"
                                                aria-hidden
                                                strokeWidth={1.9}
                                            />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                ) : null}

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
                                    : {
                                          kind: "staff",
                                          personId: state.personSubject!.personId,
                                          label: state.personSubject!.label,
                                      }
                            }
                            schedulingProjection={state.schedulingProjection}
                            onSaved={onRecordChanged}
                        />
                    </div>
                ) : null}
            </div>
        </div>
    );
}
