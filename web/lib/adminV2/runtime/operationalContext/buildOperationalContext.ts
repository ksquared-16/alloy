/**
 * Operational Context adapter.
 *
 * The ONLY sanctioned bridge from the existing composed subject payload to the
 * forward-facing `OperationalContext` boundary. This is a thin seam, not a
 * refactor: the composed `OperationalSubjectViewModel` (internally still the
 * opportunity drawer VM during migration) stays as-is; this adapter projects the
 * fields cards are allowed to depend on.
 *
 *   Existing composed VM payload
 *     → buildOperationalContext (this file)
 *       → Focus Panel
 *         → Cards
 *
 * New card code must consume `OperationalContext`, never the drawer VM directly.
 *
 * @see docs/platform/operator/operational-context-boundary.md
 */

import { resolveFinancialSubjectIdFromTruth } from "@/lib/adminV2/runtime/focusPanel/financialSubjectIdentity";
import {
    participantScopeFromChildSubjectTruth,
    resolveParticipantScope,
    type ParticipantScopeCandidate,
} from "@/lib/adminV2/runtime/operationalContext/resolveParticipantScope";
import type {
    FocusPanelCardProducerResults,
    FocusPanelOperationalProjection,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelOperationalProjectionContract";
import type { OperationalSubjectViewModel } from "@/lib/adminV2/viewModel/drawer/types";
import { buildOpportunityVmLifecycleRailModel } from "@/lib/adminV2/viewModel/drawer/vmRuntime/buildOpportunityVmLifecycleRailModel";
import type { StageWorkItemProjection } from "@/lib/lifecycle/stageWorkRuntimeTypes";
import type { RuntimePerspective } from "@/lib/adminV2/runtime/perspective/deriveRuntimePerspective";
import {
    NULL_EMPLOYMENT_SIGNAL,
    type OperationalBillingSignal,
    type OperationalCommunicationsSignal,
    type OperationalContext,
    type OperationalContextSignals,
    type OperationalContextStatus,
    type OperationalEmploymentPerson,
    type OperationalParticipantScope,
    type OperationalEmploymentSignal,
    type OperationalWorkItem,
    type OperationalWorkUrgency,
} from "@/lib/adminV2/runtime/operationalContext/types";
import type { TourBookingRow, TourBookingStatusKey } from "@/lib/tours/bookings/types";
import {
    attendanceStatusLabel,
    readAttendanceConfirmation,
} from "@/lib/tours/bookings/tourBookingAttendance";

export type BuildOperationalContextInput = {
    /**
     * WHO OWNS FIRST-ORDER PRODUCER TRUTH for this navigation.
     *
     * State the document's producer cards here and the settled context stops substituting its own
     * recomputed copy. Omit it entirely (the default) and every prior path is unchanged — this is
     * `undefined`-sensitive on purpose, so "no opinion" and "explicitly none" stay distinguishable.
     */
    firstOrderProducerCards?: FocusPanelCardProducerResults | null;
    subjectId: string;
    /** Operator-facing subject label (record/household title). */
    title: string;
    /** Composed subject ViewModel (internal payload; not exposed to cards). */
    subjectVm: OperationalSubjectViewModel;
    /** Composed, observed subject truth (above-fold record). */
    truth: Record<string, unknown>;
    perspective: RuntimePerspective | null;
    statusLabel: string | null;
    canMutate: boolean;
    /**
     * The participation the runtime has explicitly selected, travelling from navigation. A stable
     * id, never a label. Absent means no participant is scoped — which is ordinary, and is a real
     * answer rather than an instruction to resolve one.
     */
    selectedParticipationId?: string | null;
    /**
     * The participation the composer RESOLVED to its authoritative member, scoped to this record.
     *
     * Stated, not re-discovered. The candidate scan below matches against `truth._inquiry_children`,
     * which on a family-shaped settled record is intake metadata in a DIFFERENT id space from the
     * child-lens attention id (`process_instances.id`) — so it answered `not_found` for every child,
     * `participantScope` settled null, and the Attendance/Health producers, both keyed on that scope,
     * reported `unavailable` for a subject the commit frame had already described. Absent means the
     * composer had nothing to resolve, and every prior path behaves exactly as before.
     */
    resolvedParticipant?: { participationId: string; customerMemberId: string } | null;
    /** Optional overrides; default `ready` (cards mount only when ready). */
    status?: OperationalContextStatus;
    maskedChannels?: boolean;
};

const MS_PER_DAY = 86_400_000;

function trimOrNull(value: unknown): string | null {
    if (value == null) return null;
    const text = String(value).trim();
    return text.length > 0 ? text : null;
}

/** Days from start of today to the due date (negative = overdue). */
function dueDeltaDays(dueAt: string, now: Date): number | null {
    const due = new Date(dueAt);
    if (Number.isNaN(due.getTime())) return null;
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfDue = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
    return Math.round((startOfDue - startOfToday) / MS_PER_DAY);
}

function dueLabelAndUrgency(
    dueAt: string | null,
    now: Date,
): { dueLabel: string | null; urgency: OperationalWorkUrgency } {
    if (!dueAt) return { dueLabel: null, urgency: null };
    const delta = dueDeltaDays(dueAt, now);
    if (delta == null) return { dueLabel: null, urgency: null };
    if (delta < 0) {
        const days = Math.abs(delta);
        return { dueLabel: `Overdue ${days} day${days === 1 ? "" : "s"}`, urgency: "overdue" };
    }
    if (delta === 0) return { dueLabel: "Due today", urgency: "today" };
    if (delta === 1) return { dueLabel: "Due tomorrow", urgency: "upcoming" };
    return { dueLabel: `Due ${dueAt.slice(0, 10)}`, urgency: "upcoming" };
}

function stageWorkItem(
    item: StageWorkItemProjection,
    now: Date,
): OperationalWorkItem {
    const { dueLabel, urgency } = dueLabelAndUrgency(item.due_at, now);
    const state =
        item.state === "completed" ? "completed" : item.state === "open" ? "open" : "planned";
    return {
        id: item.work_id ?? item.template_key,
        label: trimOrNull(item.label) ?? trimOrNull(item.template_key) ?? "Work",
        state,
        dueLabel,
        dueAt: item.due_at,
        urgency,
        source: "Stage work",
        kind: "stage_work",
    };
}

const WORK_URGENCY_RANK: Record<NonNullable<OperationalWorkUrgency>, number> = {
    overdue: 0,
    today: 1,
    upcoming: 2,
};

function rankWorkItem(item: OperationalWorkItem): number {
    return item.urgency ? WORK_URGENCY_RANK[item.urgency] : 3;
}

/**
 * Project billing configuration facts from the composed truth record.
 * Reads flat truth keys set by the billing configuration runtime.
 * Read-only — no billing mutation path exists yet (deferred, see §7 of grain doctrine).
 */
function buildBillingSignal(truth: Record<string, unknown>): OperationalBillingSignal {
    return {
        billingConfigured: Boolean(truth["billing_configured"]),
        billingContactName:
            trimOrNull(truth["billing_contact_name"]) ?? trimOrNull(truth["person.billing_contact_name"]),
        billingContactEmail: trimOrNull(truth["billing_contact_email"]),
        tuitionRateLabel: trimOrNull(truth["tuition_rate_label"]),
        feeBalanceCents: typeof truth["fee_balance_cents"] === "number" ? truth["fee_balance_cents"] : null,
    };
}

/**
 * Project the employment of the case's linked contacts from the composed truth record.
 *
 * Reads `_case_employment`, written by the opportunity payload's enrichment pass. This is a
 * TRANSPORT step only — every field it forwards was decided by `lib/employment`, and an absent
 * or malformed projection answers "no employment", never a guess. The composition is passed
 * through by reference rather than reshaped, so there is no second place where an employment
 * fact could drift from the person-owned one.
 */
function buildEmploymentSignal(truth: Record<string, unknown>): OperationalEmploymentSignal | null {
    // Key absent → enrichment has not run for this record yet. That is NOT "nobody is staff";
    // returning null keeps the card reserved instead of asserting an answer it does not have.
    if (!("_case_employment" in truth)) return null;

    const raw = truth["_case_employment"];
    if (!raw || typeof raw !== "object") return NULL_EMPLOYMENT_SIGNAL;

    const rawPeople = (raw as { people?: unknown }).people;
    if (!Array.isArray(rawPeople) || rawPeople.length === 0) return NULL_EMPLOYMENT_SIGNAL;

    const people: OperationalEmploymentPerson[] = [];
    for (const entry of rawPeople) {
        if (!entry || typeof entry !== "object") continue;
        const row = entry as { person_id?: unknown; person_label?: unknown; employment?: unknown };
        const personId = trimOrNull(row.person_id);
        if (!personId || !row.employment || typeof row.employment !== "object") continue;
        people.push({
            personId,
            personLabel: trimOrNull(row.person_label),
            employment: row.employment as OperationalEmploymentPerson["employment"],
        });
    }
    if (people.length === 0) return NULL_EMPLOYMENT_SIGNAL;

    const primaryId = trimOrNull((raw as { primary?: { person_id?: unknown } | null }).primary?.person_id);
    return {
        primary: primaryId ? (people.find((p) => p.personId === primaryId) ?? null) : null,
        people,
        hasEmployment: true,
    };
}

/**
 * Project work / attention / tour / billing / employment signals from the composed subject VM.
 * The bridge — cards never read these VM shapes directly; they observe
 * `context.signals`. Read-once; no I/O.
 */
function buildOperationalContextSignals(
    subjectVm: OperationalSubjectViewModel,
    truth: Record<string, unknown>,
    now: Date,
): OperationalContextSignals {
    const stageRuntime = subjectVm.workspace.stage_work_runtime;
    const tasks = subjectVm.summaries.tasks;
    const attention = subjectVm.summaries.attention;
    const tourBookings = subjectVm.summaries.active_tour_bookings ?? [];
    const headerAction = subjectVm.actions.header_menu[0] ?? null;

    const items: OperationalWorkItem[] = [];

    // Configured stage work (primary + additional) that is still actionable.
    if (stageRuntime?.primary && stageRuntime.primary.state !== "completed") {
        items.push(stageWorkItem(stageRuntime.primary, now));
    }
    for (const additional of stageRuntime?.additional ?? []) {
        if (additional.state !== "completed") items.push(stageWorkItem(additional, now));
    }

    // Open operational tasks (shell-owned preview).
    for (const task of tasks?.open_tasks ?? []) {
        const { dueLabel, urgency } = dueLabelAndUrgency(task.due_at ?? null, now);
        items.push({
            id: trimOrNull(task.id) ?? trimOrNull(task.title) ?? "task",
            label: trimOrNull(task.title) ?? "Task",
            state: "open",
            dueLabel,
            dueAt: task.due_at ?? null,
            urgency,
            source: trimOrNull(task.source),
            kind: "task",
        });
    }

    items.sort((a, b) => rankWorkItem(a) - rankWorkItem(b));

    const openCount = items.filter((i) => i.state === "open").length;
    const overdueCount = items.filter((i) => i.urgency === "overdue").length;

    /*
     * TWO QUESTIONS, TWO ANSWERS.
     *
     * `scheduled` has always meant "an appointment still stands", and its readers depend on
     * that — `alignTourSupportingActionsForBookingState` hides Schedule Tour on it. So it keeps
     * reading the ACTIVE list.
     *
     * The STATE, though, must survive a tour ending. `active_tour_bookings` excludes
     * `canceled` / `completed` / `no_show`, so a finished tour used to arrive here as "no tour"
     * and the card offered Schedule Tour as though nothing had happened. `operator_relevant_tour_booking`
     * is the booking the Tour concept speaks for, terminal states included, chosen by
     * `resolveOperatorRelevantTourBooking` — a standing appointment outranks history, and a
     * superseded pre-reschedule row never wins.
     */
    const relevantBooking =
        (subjectVm.summaries.operator_relevant_tour_booking as TourBookingRow | null | undefined) ?? null;
    const nextBooking = (tourBookings[0] as TourBookingRow | undefined) ?? relevantBooking ?? undefined;
    const attendance = nextBooking ? readAttendanceConfirmation(nextBooking.metadata) : null;
    const confirmedBy = attendance?.confirmed_by_person_id
        ? truthScalarName(truth)
        : null;
    const parentConfirmationLabel = nextBooking
        ? attendance?.status === "confirmed_by_parent"
            ? confirmedBy
                ? `Confirmed by ${confirmedBy}`
                : "Confirmed by parent"
            : attendanceStatusLabel(attendance?.status ?? "awaiting_response")
        : null;

    return {
        work: {
            primary: items[0] ?? null,
            items,
            openCount,
            overdueCount,
            nextActionLabel: trimOrNull(headerAction?.label),
        },
        attention: {
            needsAttention: Boolean(attention?.needs_attention),
            primaryReason: trimOrNull(attention?.primary_reason),
            reasonCount: attention?.reason_count ?? 0,
        },
        tour: {
            scheduled: tourBookings.length > 0,
            startAt: trimOrNull(nextBooking?.start_at),
            // Keep raw booking status_key for command/eligibility seams — What's Next must not
            // render this under Primary contact (see buildWhatsNextContextFacts).
            statusLabel: trimOrNull(nextBooking?.status_key),
            // The same value, under a name that says what it is. Command presentation and
            // eligibility read `statusKey`; `statusLabel` stays for its existing readers.
            // From the operator-relevant booking, so a concluded tour still states what it was.
            statusKey:
                (trimOrNull(relevantBooking?.status_key ?? nextBooking?.status_key) as TourBookingStatusKey | null)
                ?? null,
            bookingId: trimOrNull(nextBooking?.id),
            parentConfirmationLabel,
        },
        communications: buildCommunicationsSignal(subjectVm),
        billing: buildBillingSignal(truth),
    };
}

function truthScalarName(truth: Record<string, unknown>): string | null {
    const candidates = [
        truth["primary_contact.name"],
        truth["primary_person.full_name"],
        truth["_primary_contact_name"],
        truth["contact.full_name"],
    ];
    for (const c of candidates) {
        if (typeof c === "string" && c.trim()) return c.trim();
    }
    return null;
}

function buildCommunicationsSignal(
    subjectVm: OperationalSubjectViewModel,
): OperationalCommunicationsSignal {
    const reminders = subjectVm.summaries.reminders;
    const scheduledSendCount = reminders?.scheduled_send_count ?? 0;
    const nextFollowUpAt = reminders?.next_follow_up_iso ?? null;
    const pendingSends = (reminders?.scheduled_sends ?? []).filter((s) => s.status === "pending");
    return {
        scheduledSendCount,
        nextFollowUpAt: trimOrNull(nextFollowUpAt),
        hasOutreach: scheduledSendCount > 0 || nextFollowUpAt != null,
        nextScheduledSendId: trimOrNull(pendingSends[0]?.id),
    };
}

/**
 * Project the composed subject payload into an `OperationalContext`. Pure; safe
 * inside `useMemo`. Performs no I/O — `truth` is already composed upstream.
 */
/**
 * Participation candidates, read from the case's own children rows. Identity only — this decides
 * nothing about a child beyond "is this who the selection names".
 */
function participantCandidatesFromTruth(truth: Record<string, unknown>): ParticipantScopeCandidate[] {
    const rows = Array.isArray((truth as { _inquiry_children?: unknown })._inquiry_children)
        ? ((truth as { _inquiry_children: unknown[] })._inquiry_children as Array<Record<string, unknown>>)
        : [];
    return rows
        .map((r) => {
            const id = typeof r.id === "string" ? r.id.trim() : "";
            if (!id) return null;
            const str = (v: unknown): string | null => {
                const s = v != null ? String(v).trim() : "";
                return s || null;
            };
            return {
                id,
                customerMemberId: str(r.customer_member_id),
                personId: str(r.person_id),
                name: str(r.child_name) ?? str(r.display_name) ?? str(r.name),
                /*
                 * `resolved_photo_url` FIRST — it is the signed, authorized URL, and the only one
                 * that renders.
                 *
                 * `photo_url` is the stored reference and is null on every child in the tenant, so
                 * reading it first meant the scope carried no image and EVERY avatar fell back to
                 * initials — including for children who genuinely have a photo. The resolved field
                 * is minted per actor per request by the same document path the cards already use
                 * (R-019); preferring it here is what makes one avatar model produce one answer.
                 */
                imageUrl: str(r.resolved_photo_url) ?? str(r.photo_url) ?? str(r.image_url),
                stageKey: str(r.stage_key),
                stageLabel: str(r.outcome_status_label),
            } as ParticipantScopeCandidate;
        })
        .filter((c): c is NonNullable<typeof c> => c !== null);
}

/**
 * THE ONE PLACE THAT DECIDES WHICH PARTICIPANT THIS PANEL IS ABOUT.
 *
 * Extracted so it can be asked TWICE in one request without becoming two authorities: the drawer
 * route now starts the Attendance/Health/Financials producers as soon as the composer's children
 * shell has settled, rather than after the whole view model is built, and both that early call and
 * the final `buildOperationalContext` must reach the identical verdict. Two hand-written copies of
 * a three-way precedence is precisely how the settled and commit frames would drift apart again.
 *
 * The precedence itself is unchanged: a stated child subject wins, then the route's resolved
 * participation, then the candidate scan — which refuses to guess rather than taking the first row.
 */
export function canonicalParticipantScopeFromTruth(input: {
    truth: Record<string, unknown>;
    selectedParticipationId: string | null;
    resolvedParticipant: { participationId: string; customerMemberId: string } | null;
}): OperationalParticipantScope | null {
    return (
        participantScopeFromChildSubjectTruth(input.truth)
        ?? scopeFromResolvedParticipant(input.resolvedParticipant, input.truth)
        ?? resolveParticipantScope({
            selectedParticipationId: input.selectedParticipationId,
            participants: participantCandidatesFromTruth(input.truth),
        }).scope
    );
}

/**
 * WHAT THE CARD PRODUCERS ACTUALLY NEED — and deliberately nothing else.
 *
 * `projectFocusPanelCardProducers` reads exactly two fields of the operational context, both off
 * `participantScope`. Handing it the whole scope early would hand it `imageUrl`, which is NOT
 * settled at that point: the children shell's photo projection writes `resolved_photo_url`
 * afterwards, and the candidate mapper prefers it precisely because it is the only URL that
 * renders. So the early contract carries the two stable fields and is frozen — the settled scope
 * is still built exactly as before, at the end, and remains the one the avatar reads.
 */
export type ParticipantCardProducerContract = {
    readonly customerMemberId: string | null;
    readonly displayName: string | null;
    /** Whose money the Financials producer reads — resolved from truth, never from a live context. */
    readonly financialSubjectId: string | null;
};

export function participantCardProducerContract(
    scope: OperationalParticipantScope | null,
    truth: Record<string, unknown>,
): ParticipantCardProducerContract {
    return Object.freeze({
        customerMemberId: scope?.customerMemberId ?? null,
        displayName: scope?.displayName ?? null,
        /*
         * ONE CARD, NEVER THE PANEL.
         *
         * The key scan used to sit behind a try/catch inside the producers, where a malformed
         * truth cost the operator Financials and nothing else. Resolving it here moved that risk
         * ONTO THE COMPOSE PATH, where the same throw would cost the whole drawer — strictly worse
         * than the behaviour it replaced. The guard travels with the derivation.
         */
        financialSubjectId: (() => {
            try {
                return resolveFinancialSubjectIdFromTruth(truth);
            } catch {
                return null;
            }
        })(),
    });
}

/**
 * The resolved participation as a scope — identity from the resolver, presentation from truth.
 *
 * The member id is the authority here; a candidate row is consulted ONLY to borrow the child's name
 * and photo so the settled scope looks the same as the commit one. No candidate is required, because
 * the whole reason this input exists is that the candidate set could not name this child.
 */
function scopeFromResolvedParticipant(
    resolved: { participationId: string; customerMemberId: string } | null,
    truth: Record<string, unknown>,
): OperationalParticipantScope | null {
    if (!resolved) return null;
    const presentation =
        participantCandidatesFromTruth(truth).find(
            (c) => (c.customerMemberId ?? null) === resolved.customerMemberId,
        ) ?? null;
    return {
        participationId: resolved.participationId,
        customerMemberId: resolved.customerMemberId,
        personId: presentation?.personId ?? null,
        displayName: presentation?.name ?? null,
        imageUrl: presentation?.imageUrl ?? null,
        stageKey: presentation?.stageKey ?? null,
        stageLabel: presentation?.stageLabel ?? null,
    };
}

/**
 * Apply the stated first-order producer-card owner to a projection.
 *
 * `undefined` means the caller states no owner — every prior path is untouched. A stated owner
 * replaces `cards` outright; it never merges card-by-card, because a half-owned producer set
 * cannot say whether a missing card was "not rerun" or "legitimately gone".
 */
function firstOrderProducerCardsOwned(
    projection: FocusPanelOperationalProjection | null,
    owned: FocusPanelCardProducerResults | null | undefined,
): FocusPanelOperationalProjection | null {
    if (owned === undefined) return projection;
    if (!projection) return projection;
    return { ...projection, cards: owned };
}

export function buildOperationalContext(input: BuildOperationalContextInput): OperationalContext {
    const { subjectVm, truth, perspective, statusLabel, canMutate } = input;

    const stageContext = subjectVm.workspace.stage_context;
    const lifecycleRail = subjectVm.workspace.lifecycle_rail;

    /*
     * ── WHOSE STAGE IS THIS? ──
     *
     * Everything on this VM — the lifecycle rail, the stage context — describes the CASE that was
     * loaded. When the subject of attention is that case, those are its own answers and the rail is
     * the authority.
     *
     * When the subject is a CHILD, they are a different record's answers. A child's position is
     * owned by the child's process instance and by nothing else: `moveEnrollmentInstanceStageByScope`
     * is its only writer, and the effective-stage rule the queues coalesce on has already been
     * applied by the provider. The family's rail cannot speak for the child, and the work unit the
     * operator arrived through is not a position at all.
     *
     * The stated child subject is recognised here by the identity the runtime already publishes —
     * the same resolver `participantScope` uses below, which refuses unless the child is fully
     * identified. So this changes the answer for exactly one kind of subject and leaves case-grain
     * resolution untouched.
     */
    const childSubjectScope = participantScopeFromChildSubjectTruth(truth);
    const railStages = Array.isArray(lifecycleRail?.stages) ? lifecycleRail.stages : [];
    const stageLabelFromRail = (key: string | null): string | null =>
        key ? railStages.find((s) => s.key === key)?.label ?? null : null;

    /*
     * NO `??` TO THE CASE. A child whose stage is unresolved has an unresolved stage.
     *
     * Falling through to the rail here would reintroduce the defect in a subtler form: the card
     * would state a stage, it would look entirely ordinary, and it would be the household's. The
     * canonical fallback for a child (its context's stage when it rides the family track) is
     * applied UPSTREAM by the provider, so a child that reaches here with no stage has genuinely
     * been resolved to none — and null is the honest way to say so.
     */
    const businessProcess =
        childSubjectScope ?
            {
                key: childSubjectScope.stageKey,
                label:
                    childSubjectScope.stageLabel
                    ?? stageLabelFromRail(childSubjectScope.stageKey)
                    ?? null,
                name: lifecycleRail?.process_name ?? null,
                stageKey: childSubjectScope.stageKey,
                stages: railStages,
            }
        :   {
                key: stageContext?.stage_key ?? null,
                label: stageContext?.stage_label ?? statusLabel ?? null,
                // The process, not the stage. Only the rail knows it; nothing else on the VM does.
                name: lifecycleRail?.process_name ?? null,
                stageKey: lifecycleRail?.current_stage_key ?? stageContext?.stage_key ?? null,
                // The rail already resolved the configured order; publishing it here keeps ONE answer
                // to "what are this process's stages" rather than a second derivation in the card.
                stages: railStages,
            };

    return {
        subject: {
            type: subjectVm.entity.type,
            id: input.subjectId,
            label: input.title,
        },
        businessProcess,
        perspective: perspective
            ? { missionLabel: perspective.defaultMission ?? perspective.label ?? null }
            : null,
        truth,
        grain: "case",
        signals: buildOperationalContextSignals(subjectVm, truth, new Date()),
        /*
         * THE SCOPED PARTICIPANT, resolved once here rather than by each card.
         *
         * The selection is a stable id travelling from navigation; this only decides whether it
         * names somebody on THIS case. It never changes grain — the subject above is still the case
         * — and `resolveParticipantScope` refuses to guess, so an id from the case the operator just
         * left resolves to nobody instead of to whoever happens to be first here.
         */
        /*
         * A stated child subject wins over a selection lookup, because it is not a lookup: a
         * child-grain answer carries no `_inquiry_children` collection to search, and the child it
         * is ABOUT is named directly in truth. Consulting the candidate list first found nothing and
         * resolved to nobody, so the Attendance card asked the operator to select a child while
         * showing that child's own record.
         */
        participantScope: canonicalParticipantScopeFromTruth({
            truth,
            selectedParticipationId: input.selectedParticipationId ?? null,
            resolvedParticipant: input.resolvedParticipant ?? null,
        }),
        stageWorkRuntime: subjectVm.workspace.stage_work_runtime ?? null,
        stageWorkPending: subjectVm.workspace.stage_work?.status === "pending",
        recordHeaderActions: subjectVm.actions.record_header ?? null,
        publishedStageInputs: subjectVm.workspace.published_stage_inputs ?? null,
        // The settled frame's projection, produced by the same server chokepoint as the commit
        // frame's. Switching transport must not switch authority.
        /*
         * ONE OWNER FOR FIRST-ORDER PRODUCER TRUTH, chosen per field rather than per frame.
         *
         * `businessProcess` and `currentWork` are PURE PROJECTIONS of whichever context builds
         * them, and the settled context is genuinely richer — it has the full record and the view
         * model, so its process evidence and current-work model are legitimate enrichment and the
         * drawer rightly owns them.
         *
         * `cards` is not a projection. It is the OUTPUT OF THE PRODUCERS, run with the same
         * authority against the same subject in whichever frame ran them. Two frames running them
         * produce the same first-order answer, so the second run owns nothing new — measured, the
         * drawer's Financials arrives as an identical rerender. When the caller states the
         * document's producer cards here, they own this navigation's first-order answer and the
         * settled frame stops substituting its own copy.
         *
         * This is a field-level ownership statement, not a merge: nothing is combined, nothing
         * prefers non-null, and a caller that states nothing leaves every prior path unchanged.
         */
        operationalProjection: firstOrderProducerCardsOwned(
            subjectVm.workspace.operational_projection ?? null,
            input.firstOrderProducerCards,
        ),
        // SETTLEMENT projections for the drill/enrichment cards — built HERE (the adapter is the one
        // sanctioned place that reads the drawer VM), so those cards read the context, not the VM.
        lifecycleRail: buildOpportunityVmLifecycleRailModel({ displayVm: subjectVm, drawerId: input.subjectId }),
        communicationsPreview: subjectVm.activity.communicationsPreviewVm ?? null,
        employment: buildEmploymentSignal(truth),
        capabilities: {
            canMutate,
            maskedChannels: input.maskedChannels ?? false,
        },
        status: input.status ?? "ready",
    };
}
