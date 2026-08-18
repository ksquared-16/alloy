"use client";

/**
 * Records → Children.
 *
 * The durable child population. A child is here because the household record exists — not because an
 * enrollment is running — so this is emphatically NOT an Enrollment queue. Participation state is
 * shown when the platform holds it and is simply absent when it does not.
 *
 * ── THE ROW IS KEYED BY THE MEMBER ──
 *
 * `customer_members.id`, never `person_id`. `person_id` is nullable, and in the certification tenant
 * every child has a null person — a surface keyed on the person would show an empty Children section
 * while 1500 children existed.
 *
 * ── COHORT MEMBERSHIP IS THE SERVER'S ANSWER ──
 *
 * Switching cohort issues a REQUEST; it never filters whatever page happens to be loaded. V1 did the
 * latter and an Enrolled child beyond the first page silently vanished from the Enrolled cohort —
 * the surface said "nobody is enrolled" when the truth was "we only looked at 500 of them". The
 * count on each tab is the cohort's true total for the same reason.
 *
 * ── ADD CHILD IS THE `child.add` COMMAND, NOT A BESPOKE MUTATION ──
 *
 * Phase 0 held this affordance back because the existing child-create path resolved ambiguous
 * identity SILENTLY (an org-wide name match with no operator gate), where Add Staff refuses to
 * guess. Phase 2 shipped the gate, so the affordance is here — routed through the registered
 * `child.add` capability, which establishes the Child record and NOTHING else. It is still not
 * wired to Create Lead, which answers a different question.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import AddChildModal from "@/components/adminV2/records/AddChildModal";
import { broadcastWorkspaceMutation } from "@/lib/adminV2/workspaceRefreshBroadcast";
import DirectEnrollModal from "@/components/adminV2/records/DirectEnrollModal";
import { ENROLLMENT_START_ACTION_KEY } from "@/lib/adminV2/actions/definitions/enrollmentActions";
import { childNextActions } from "@/lib/adminV2/records/childNextActions";
import RecordsCohortBar from "@/components/adminV2/records/RecordsCohortBar";
import {
    CHILD_RECORD_STATE_LABEL,
    type ChildRecordState,
} from "@/lib/adminV2/records/childEnrollmentState";
import { buildChildCohorts } from "@/lib/adminV2/records/recordCohorts";
import { useOperatorRecordFocus } from "@/lib/runtime/focus/useOperatorRecordFocus";
import {
    DURABLE_RECORD_CLOSED_EVENT,
    type DurableRecordClosedDetail,
} from "@/lib/runtime/focus/DurableRecordHostContext";
import { WS_ACTION_PRIMARY, WS_ACTION_SECONDARY } from "@/components/workspace/workspaceTokens";

export type ChildEntry = {
    customerMemberId: string;
    personId: string | null;
    displayName: string;
    dateOfBirth: string | null;
    householdId: string | null;
    householdName: string | null;
    isActive: boolean;
    /**
     * Imported, never redeclared. A local copy of this union silently discarded a state the route
     * was already serialising once before — the row rendered the raw key while the surface looked
     * fine. @see web/lib/adminV2/records/childEnrollmentState.ts
     */
    participationState: ChildRecordState;
    participationStageKey: string | null;
    siteLocationId: string | null;
    siteLocationLabel: string | null;
};

/** The child identity card key — the aspect a child gesture names. */
const CHILD_IDENTITY_CARD = "child_identity";

function ageLabel(dob: string | null, todayYmd: string): string | null {
    if (!dob) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob);
    const t = /^(\d{4})-(\d{2})-(\d{2})$/.exec(todayYmd);
    if (!m || !t) return null;
    let months = (Number(t[1]) - Number(m[1])) * 12 + (Number(t[2]) - Number(m[2]));
    if (Number(t[3]) < Number(m[3])) months -= 1;
    if (months < 0) return null;
    if (months < 24) return `${months} mo`;
    const years = Math.floor(months / 12);
    const rem = months % 12;
    return rem === 0 ? `${years} yr` : `${years} yr ${rem} mo`;
}

export default function RecordsChildrenSection({
    todayYmd,
    siteLocationId = null,
    onClose,
}: {
    todayYmd: string;
    /**
     * Selected site, or null for All sites. Composes WITH the cohort SERVER-SIDE — Records V1 ships
     * no site picker in its chrome, so this is null today; the parameter exists because site scope
     * must never be a client-side narrowing of an already-paged result.
     */
    siteLocationId?: string | null;
    onClose?: () => void;
}) {
    const [children, setChildren] = useState<ChildEntry[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [cohortKey, setCohortKey] = useState("all");
    const [filter, setFilter] = useState("");
    /** The cohort's TRUE total, from the server. Never the page length. */
    const [total, setTotal] = useState(0);
    const [nextOffset, setNextOffset] = useState<number | null>(null);
    const [loadingMore, setLoadingMore] = useState(false);
    const [addOpen, setAddOpen] = useState(false);
    const [flash, setFlash] = useState<string | null>(null);
    /**
     * The parent link Start Enrollment produced, when it produced one.
     *
     * Held separately from the flash sentence because it is a THING the operator acts on, not prose:
     * it has to be selectable and copyable. Null whenever the journey started without realizing a
     * participant packet, which is a legitimate outcome and is said plainly rather than hidden.
     */
    const [participantLink, setParticipantLink] = useState<string | null>(null);
    /** Bumped after a write so the cohort is re-asked rather than spliced client-side. */
    const [reloadToken, setReloadToken] = useState(0);
    /** The child a direct enrollment is being collected for, if any. */
    const [directEnroll, setDirectEnroll] = useState<{ id: string; name: string } | null>(null);
    /** The child Add Child just created, so the follow-on paths can name them. */
    const [lastAdded, setLastAdded] = useState<{ id: string; name: string } | null>(null);

    const focusRecord = useOperatorRecordFocus();
    const cohorts = useMemo(() => buildChildCohorts(), []);

    /** Debounced so typing does not issue a request per keystroke — search is server-side. */
    const [debouncedFilter, setDebouncedFilter] = useState("");
    useEffect(() => {
        const t = setTimeout(() => setDebouncedFilter(filter.trim()), 250);
        return () => clearTimeout(t);
    }, [filter]);

    const buildUrl = useCallback(
        (offset: number) => {
            const p = new URLSearchParams({ cohort: cohortKey, offset: String(offset) });
            if (debouncedFilter) p.set("q", debouncedFilter);
            if (siteLocationId) p.set("site_location_id", siteLocationId);
            return `/api/admin/records/children?${p.toString()}`;
        },
        [cohortKey, debouncedFilter, siteLocationId],
    );

    // Cohort / site / search change → a new server request. Not a re-filter. A write bumps
    // `reloadToken` for the same reason: cohort membership is DERIVED, so the authoritative
    // projection decides which cohorts a newly added child belongs to.
    useEffect(() => {
        let alive = true;
        setChildren(null);
        setError(null);
        void (async () => {
            try {
                const res = await fetch(buildUrl(0), { credentials: "include" });
                const json = (await res.json()) as {
                    ok?: boolean;
                    children?: ChildEntry[];
                    total?: number;
                    nextOffset?: number | null;
                    message?: string;
                };
                if (!alive) return;
                if (!res.ok || !json.ok) throw new Error(json.message ?? "Could not load children");
                setChildren(json.children ?? []);
                setTotal(json.total ?? 0);
                setNextOffset(json.nextOffset ?? null);
            } catch (e) {
                if (!alive) return;
                setError(e instanceof Error ? e.message : "Could not load children");
                setChildren([]);
                setTotal(0);
                setNextOffset(null);
            }
        })();
        return () => {
            alive = false;
        };
    }, [buildUrl, reloadToken]);

    /**
     * A record that was EDITED refreshes its row; one that was only read does not.
     *
     * The host reports which, so this listener does not have to infer it from the fact that a record
     * closed. Re-querying the cohort every time a record is dismissed would make browsing the list
     * cost a round trip per glance, and never re-querying would leave an edited name stale in the
     * row the operator just came back to.
     */
    useEffect(() => {
        const onClosed = (event: Event) => {
            const detail = (event as CustomEvent<DurableRecordClosedDetail>).detail;
            if (!detail?.changed || detail.subjectType !== "child") return;
            setReloadToken((n) => n + 1);
        };
        window.addEventListener(DURABLE_RECORD_CLOSED_EVENT, onClosed);
        return () => window.removeEventListener(DURABLE_RECORD_CLOSED_EVENT, onClosed);
    }, []);

    const loadMore = useCallback(async () => {
        if (nextOffset == null || loadingMore) return;
        setLoadingMore(true);
        try {
            const res = await fetch(buildUrl(nextOffset), { credentials: "include" });
            const json = (await res.json()) as {
                ok?: boolean;
                children?: ChildEntry[];
                total?: number;
                nextOffset?: number | null;
            };
            if (res.ok && json.ok) {
                setChildren((prev) => [...(prev ?? []), ...(json.children ?? [])]);
                setTotal(json.total ?? 0);
                setNextOffset(json.nextOffset ?? null);
            }
        } finally {
            setLoadingMore(false);
        }
    }, [buildUrl, nextOffset, loadingMore]);

    /**
     * Start the governed journey. No extra input: the COMMAND resolves its own context — Records
     * states intent and reads back the outcome, exactly as it does for every record gesture.
     */
    const startEnrollment = useCallback(
        async (customerMemberId: string, childName: string) => {
            setFlash(null);
            setParticipantLink(null);
            setError(null);
            try {
                const res = await fetch("/api/admin/actions/execute", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                        action_key: ENROLLMENT_START_ACTION_KEY,
                        entity_type: "child",
                        entity_id: customerMemberId,
                        mode: "execute",
                        confirmation: { confirmed: true },
                        payload: {},
                    }),
                });
                const json = (await res.json()) as {
                    ok?: boolean;
                    data?: { execution_result?: Record<string, unknown> };
                    error?: { message?: string };
                };
                if (!res.ok || json.ok === false) {
                    throw new Error(json.error?.message ?? "Could not start enrollment");
                }
                const detail = json.data?.execution_result ?? {};
                // Records states the OUTCOME the server reported and never names the acquisition
                // record itself: this surface does not think in those terms, and a guard test
                // holds that boundary. "On its own" is the operator-meaningful half anyway.
                const context =
                    detail.context_outcome === "joined_live_episode"
                        ? `Enrollment started for ${childName}, inside the family's current enrolment.`
                        : `Enrollment started for ${childName}, on its own.`;

                // What Start Enrollment now realizes is a PARENT PACKET, so saying "nothing else was
                // created" stopped being true the moment the launch landed. The two outcomes are
                // reported as themselves: a link the operator can send, or a plain statement that
                // the journey started with nothing to send yet — which happens whenever the
                // governing configuration asks the participant for no Forms.
                const launch = detail.participant_launch as
                    | { realized?: boolean; participant_path?: string | null; outcome?: string }
                    | undefined;
                const path = typeof launch?.participant_path === "string" ? launch.participant_path : null;
                setParticipantLink(path);
                setFlash(
                    launch?.realized
                        ? `${context} ${
                              launch.outcome === "resumed"
                                  ? "Their parent packet was already open — same link."
                                  : "Their parent packet is ready to send."
                          }`
                        : `${context} There is nothing for the parent to complete yet.`,
                );
                setReloadToken((n) => n + 1);
                // This list is not the only surface derived from what just changed. Metric tiles,
                // process counts and work-unit queues are mounted elsewhere and were reading stale
                // numbers until the operator refreshed the browser. The shared refresh bus already
                // exists for exactly this; a child mutation has no Opportunity subject, so it
                // broadcasts, and `enrollment.start` is registered as membership-changing so
                // listeners refetch counts rather than patching a row that may not be on screen.
                broadcastWorkspaceMutation(ENROLLMENT_START_ACTION_KEY);
            } catch (e) {
                setError(e instanceof Error ? e.message : "Could not start enrollment");
            }
        },
        [],
    );

    const visible = children ?? [];
    /**
     * "No children yet" is only true of the WHOLE population. This page is a cohort answer, so
     * an empty Enrolled tab must not claim the tenant has no children — the previous copy read
     * a `rows` binding that did not exist in this component at all.
     */
    const isDefaultView = cohortKey === "all" && !debouncedFilter;

    /** The record gesture — the member id, durable intent, and the child identity aspect. */
    const openChild = useCallback(
        (customerMemberId: string) => {
            void focusRecord({
                entity_type: "customer_members",
                entity_id: customerMemberId,
                intent: "durable_record",
                card_focus: { card_key: CHILD_IDENTITY_CARD },
            }).then((moved) => {
                if (moved !== false) onClose?.();
            });
        },
        [focusRecord, onClose],
    );

    return (
        <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col xl:max-w-[80rem]" data-records-children="true">
            <RecordsCohortBar
                cohorts={cohorts}
                activeCohortKey={cohortKey}
                onCohortChange={setCohortKey}
                filter={filter}
                onFilterChange={setFilter}
                filterPlaceholder="Filter children"
                // Only the ACTIVE cohort's total is known — the server answered for that one. A count
                // beside the others would be the page length wearing a total's clothes, which is the
                // defect this slice removed. @see RecordsCohortBar
                activeCohortTotal={total}
                trailing={
                    <button
                        type="button"
                        className={`shrink-0 ${WS_ACTION_PRIMARY}`}
                        onClick={() => setAddOpen(true)}
                        data-child-add-open="true"
                    >
                        Add child
                    </button>
                }
            />

            {flash ? (
                <p
                    className="mx-1 mb-2 rounded border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-[12px] text-emerald-800"
                    data-child-flash="true"
                >
                    {flash}
                    {participantLink ? (
                        <>
                            {" "}
                            <a
                                href={participantLink}
                                target="_blank"
                                rel="noreferrer"
                                className="font-medium underline underline-offset-2"
                                data-child-participant-link="true"
                            >
                                Open the parent link
                            </a>
                        </>
                    ) : null}
                </p>
            ) : null}
            {error ? (
                <p className="mx-1 mb-2 rounded border border-red-200 bg-red-50 px-2.5 py-2 text-[12px] text-red-700">
                    {error}
                </p>
            ) : null}

            <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-3">
                {children == null ? (
                    <p className="px-2 py-6 text-[12px] text-alloy-midnight/50">Loading…</p>
                ) : visible.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-alloy-stone/30 px-4 py-8 text-center">
                        <p className="text-[13px] font-medium text-alloy-midnight/75">
                            {isDefaultView ? "No children yet" : "No children in this view"}
                        </p>
                        <p className="mt-1 mx-auto max-w-[54ch] text-[12px] text-alloy-midnight/55">
                            {isDefaultView
                                ? "Add a child to a household. Alloy reuses an existing record when one already matches, and adding a child starts no enrollment."
                                : "This is a real answer for the cohort, not a filter problem."}
                        </p>
                        {/*
                         * The empty state REPEATS the command, and only when the population itself is
                         * empty. On a filtered no-match the honest next move is to change the filter,
                         * and a second button there would compete with the canonical one still in the
                         * bar above. Text treatment rather than a second primary: one obvious primary
                         * action, restated where someone is most likely to be looking for it.
                         */}
                        {isDefaultView ? (
                            <button
                                type="button"
                                className="mt-3 text-[12px] font-semibold text-alloy-bend-pine"
                                onClick={() => setAddOpen(true)}
                                data-child-add-open-empty="true"
                            >
                                Add child
                            </button>
                        ) : null}
                    </div>
                ) : (
                    <ul
                        className="divide-y divide-alloy-stone/15 overflow-hidden rounded-lg border border-alloy-stone/22 bg-white"
                        data-children-list="true"
                    >
                        {visible.map((c) => {
                            const age = ageLabel(c.dateOfBirth, todayYmd);
                            // Offered from the child's OWN state, so a row never invites an action
                            // the command would then refuse. @see childNextActions.ts
                            const next = childNextActions(c.participationState);
                            return (
                                <li key={c.customerMemberId}>
                                    <button
                                        type="button"
                                        className="flex w-full items-center justify-between gap-4 px-3 py-2.5 text-left hover:bg-alloy-stone/[0.06]"
                                        onClick={() => openChild(c.customerMemberId)}
                                        data-child-member={c.customerMemberId}
                                        data-child-row="true"
                                    >
                                        <span className="min-w-0">
                                            <span className="block truncate text-[13px] font-medium text-alloy-midnight">
                                                {c.displayName}
                                            </span>
                                            <span className="block truncate text-[11px] text-alloy-midnight/55">
                                                {[age, c.householdName, c.siteLocationLabel]
                                                    .filter(Boolean)
                                                    .join(" · ") || "No household on record"}
                                            </span>
                                        </span>
                                        <span className="shrink-0 text-right">
                                            <span
                                                className="rounded-full bg-alloy-midnight/5 px-2 py-0.5 text-[10px] font-medium text-alloy-midnight/60"
                                                data-child-state={c.participationState ?? "none"}
                                            >
                                                {c.participationState
                                                    ? CHILD_RECORD_STATE_LABEL[c.participationState]
                                                    : c.isActive
                                                      ? "On record"
                                                      : "Inactive"}
                                            </span>
                                        </span>
                                    </button>
                                    {next.actions.length > 0 ? (
                                        <div
                                            className="flex flex-wrap gap-2 px-3 pb-2.5"
                                            data-child-next-actions={c.customerMemberId}
                                        >
                                            {next.actions.includes("start_enrollment") ? (
                                                <button
                                                    type="button"
                                                    className="rounded border border-alloy-stone/25 px-2 py-0.5 text-[11px] font-medium text-alloy-midnight/70 hover:bg-alloy-stone/10"
                                                    onClick={() =>
                                                        void startEnrollment(c.customerMemberId, c.displayName)
                                                    }
                                                    data-child-start-enrollment={c.customerMemberId}
                                                >
                                                    Start enrollment
                                                </button>
                                            ) : null}
                                            {next.actions.includes("enroll_directly") ? (
                                                <button
                                                    type="button"
                                                    className="rounded border border-alloy-stone/25 px-2 py-0.5 text-[11px] font-medium text-alloy-midnight/70 hover:bg-alloy-stone/10"
                                                    onClick={() =>
                                                        setDirectEnroll({
                                                            id: c.customerMemberId,
                                                            name: c.displayName,
                                                        })
                                                    }
                                                    data-child-enroll-directly={c.customerMemberId}
                                                >
                                                    Enroll directly
                                                </button>
                                            ) : null}
                                        </div>
                                    ) : null}
                                </li>
                            );
                        })}
                    </ul>
                )}

                {nextOffset != null ? (
                    <div className="mt-2 flex items-center justify-between px-1">
                        <p className="text-[11px] text-alloy-midnight/50" data-children-page-status="true">
                            Showing {visible.length} of {total}
                        </p>
                        <button
                            type="button"
                            className={WS_ACTION_SECONDARY}
                            onClick={() => void loadMore()}
                            disabled={loadingMore}
                            data-children-load-more="true"
                        >
                            {loadingMore ? "Loading…" : "Load more"}
                        </button>
                    </div>
                ) : null}
            </div>

            <AddChildModal
                open={addOpen}
                onClose={() => setAddOpen(false)}
                onCreated={(r) => {
                    setFlash(
                        r.identityOutcome === "already_in_household"
                            ? `${r.displayName} was already on that household — nothing was duplicated.`
                            : r.identityOutcome === "linked_existing_person"
                              ? `${r.displayName} was linked from an existing person — no duplicate identity.`
                              : `${r.displayName} was added. No enrollment was started.`
                    );
                    setLastAdded({ id: r.customerMemberId, name: r.displayName });
                    setReloadToken((n) => n + 1);
                    broadcastWorkspaceMutation("child.add");
                }}
                onOpenRecord={(customerMemberId) => {
                    setAddOpen(false);
                    openChild(customerMemberId);
                }}
                onStartEnrollment={(customerMemberId) => {
                    setAddOpen(false);
                    void startEnrollment(customerMemberId, lastAdded?.name ?? "This child");
                }}
                onEnrollDirectly={(customerMemberId) => {
                    setAddOpen(false);
                    setDirectEnroll({ id: customerMemberId, name: lastAdded?.name ?? "this child" });
                }}
            />

            <DirectEnrollModal
                open={directEnroll != null}
                customerMemberId={directEnroll?.id ?? ""}
                childName={directEnroll?.name ?? "this child"}
                todayYmd={todayYmd}
                onClose={() => setDirectEnroll(null)}
                onEnrolled={({ childName }) => {
                    setDirectEnroll(null);
                    setFlash(`${childName} is enrolled. No enrollment process was created.`);
                    setReloadToken((n) => n + 1);
                }}
            />
        </div>
    );
}
