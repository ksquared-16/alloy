"use client";

import { invalidateFinancialConfig, loadFinancialConfig } from "@/lib/adminV2/runtime/focusPanel/financialConfig/financialConfigResource";
import { REDUCTION_REASON_LABEL as REDUCTION_REASON_LABELS } from "@/lib/financials/reductions/reductionReasonLabels";
import { executeFinancialsAction } from "@/lib/financials/executeFinancialsAction";
import type { AssignmentTuitionView } from "@/lib/enrollment/pricing/buildAssignmentTuitionView";
import { acceptedTermBillingPeriods } from "@/lib/financials/billingPeriod";
import FinancialsResponsibilityPanel from "@/app/adminV2/financials/FinancialsResponsibilityPanel";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { CalendarDays, Clock, DoorOpen, CalendarRange, Wallet } from "lucide-react";

import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import CardAvatar from "@/components/admin/focusPanel/CardAvatar";
import { buildChildrenCardEvidence } from "@/lib/adminV2/runtime/focusPanel/children/buildChildrenCardEvidence";
import { buildAssignmentCardModelForChild } from "@/lib/enrollment/buildAssignmentCardModelFromTruth";
import type { FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import {
    focusPanelCardBackLabel,
    type FocusPanelCoordination,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCoordinationModel";
import {
    createEmptyFocusPanelCardLinkNavState,
    navigateCardLinkWithHistory,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCardLinkNavigation";
import {
    useDismissSignal,
    useReportPerspective,
} from "@/lib/adminV2/runtime/focusPanel/useFocusPanelCoordination";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";
import { allowedPatternWeekdays } from "@/lib/locations/locationSchedulingConfig";
import { resolveVisibleDayPills } from "@/lib/scheduling/dayPills";
import { projectCompactScheduleForIdentity } from "@/lib/scheduling/projection/projectCompactScheduleForIdentity";
import type { Assignment as ProjectionAssignment, ChildScheduling } from "@/lib/scheduling/projection/schedulingProjectionTypes";
import {
    AssignmentDetailView,
    AssignmentSummaryList,
    type AssignmentListActions,
} from "@/components/adminV2/scheduling/AssignmentSummaryDetail";
import {
    scopeRoomsForAssignmentPicker,
    type AssignmentTypeBehavior,
} from "@/lib/operationalAssignments/assignmentTypeBehavior";
import type { SiteOperationalRoom } from "@/lib/operationalAssignments/loadSiteOperationalRooms";
import {
    programCategoryIdForRoom,
    resolveProgramOnRoomChange,
} from "@/lib/operationalAssignments/assignmentProgramRoomResolution";
import {
    assignmentActionBinding,
    assignmentAnchorPayload,
    assignmentSubjectApplicability,
} from "@/lib/operationalAssignments/assignmentSubjectBinding";
import type { OperationalAssignmentSubject } from "@/lib/operationalAssignments/operationalAssignmentService";
import { readDurableStaffSchedulingSubject } from "@/lib/adminV2/runtime/focusPanel/durableSubject/durableStaffSchedulingSubject";
import { AdminDeleteConfirmModal } from "@/components/admin/AdminDeleteConfirmModal";
import { dispatchOpportunityDrawerRecordPatch } from "@/lib/admin/opportunityDrawerTargetedRefresh";
import { dispatchDrawerLayoutRuntimeBodyRecordPatch } from "@/lib/layout/runtime/drawerLayoutRuntimeBodyRecordPatch";
import { AlloyTimeInput } from "@/components/workspace/AlloyTimeInput";
import type { FinancialConfigApiResponse } from "@/lib/adminV2/runtime/focusPanel/financialConfig/financialConfigTypes";
import { resolveFocusPanelMutationOpportunityId } from "@/lib/adminV2/runtime/focusPanel/focusPanelMutation";

type Props = {
    model: FocusPanelCardModel;
    context: OperationalContext;
    receded?: boolean;
    coordination?: FocusPanelCoordination;
    composerPreview?: { perspective?: "expanded" };
    /**
     * Fired after a canonical assignment mutation has succeeded AND this card has re-read its own
     * data. It means "authoritative assignment truth changed" — nothing scheduling-specific, and
     * deliberately NOT a payload: a host that needs to know WHAT changed should re-read, not trust a
     * diff this card assembled.
     *
     * Optional because the case panel does not need it — its own settlement already recomposes. The
     * durable record host does: it wires this to the generic `onSaved` contract, which marks the
     * record changed so the surface underneath reloads on close.
     */
    onMutated?: () => void;
};

// ── Alloy design tokens (Midnight / Slate / Pine / Gold / Ember) ─────────────
const T = {
    pine: "#00A283",
    forge: "#273F52",
    ink: "#18273A",
    slate: "#4b5563",
    muted: "#59678b",
    stone: "#F4F6F9",
    gold: "#d0ad50",
    ember: "#b4532a",
    blue: "#00458C",
    border: "#e5e9ef",
    mid40: "rgba(39,63,82,.40)",
};

type DailyHours = { arrive: string; depart: string };
type Money = { amountCents: number; currency: string };
type BillingProjection = {
    status: "resolved" | "pending" | "unconfigured" | "stale";
    recommendedRate: { name: string; baseAmount: Money; recurringFrequency: string } | null;
    discounts: { name: string; amount: Money }[];
    funding: { name: string; projectedAmount: Money | null }[];
    totals: {
        baseRecurringTuition: Money;
        totalDiscounts: Money;
        totalFunding: Money;
        familyResponsibility: Money;
        recurringFrequency: string;
    } | null;
    warnings: string[];
};
function money(m: Money | null | undefined, freq?: string): string {
    if (!m) return "—";
    const dollars = (m.amountCents / 100).toLocaleString("en-US", { style: "currency", currency: m.currency || "USD" });
    return freq ? `${dollars} / ${freq}` : dollars;
}

// ── Projection shapes (from ?view=projection) ────────────────────────────────
type ProjRoom = { id: string | null; name: string | null; program: string | null };
type ProjAssignment = ProjectionAssignment;
type ProjView = {
    effectiveFrom: string;
    effectiveTo: string | null;
    openEnded: boolean;
    scheduleType?: string | null;
    scheduleTypeLabel?: string | null;
    assignments: ProjAssignment[];
};
type ChildStatus = "scheduled" | "proposed" | "needs-placement" | "upcoming-only" | "ended";
type SubjectProj = {
    child: { id: string; name: string; program: string | null; siteId: string | null; siteName: string | null };
    status: ChildStatus;
    enrollmentAgreementId?: string | null;
    current: ProjView | null;
    proposed: ProjView | null;
    history?: { effectiveFrom: string; effectiveTo: string | null; summary: string }[];
};

type SchedTypeOpt = { key: string; label: string; behavior: "continuous" | "rotating" };
type AssignmentTypeOpt = {
    id: string;
    key: string | null;
    label: string;
    visualTone?: string | null;
    behavior?: AssignmentTypeBehavior;
};
/** The site's configured scheduling constraints + preloaded patterns, from first-paint. */
type SchedConfig = {
    operatingDays: number[];
    scheduleTypes: SchedTypeOpt[];
    patterns: Pattern[];
    assignmentTypes: AssignmentTypeOpt[];
    /** Instant operational room list (Category/Program filter client-side). */
    operationalRooms: SiteOperationalRoom[];
};
type PlacementOption = {
    roomId: string;
    roomName: string | null;
    classification: "recommended" | "eligible" | "blocked";
    reason: string;
    programCategoryId?: string | null;
};
type Pattern = { id: string; label: string; weekdays: number[]; scheduleTypeKey: string; defaultHours: DailyHours | null; defaultOpenEnded: boolean };
/**
 * ONE SUBJECT this card can render and act on.
 *
 * `kind` is carried explicitly rather than inferred from which id is populated. A child WITH a
 * linked person populates both, so inferring would produce a plausible wrong answer instead of an
 * error — the same reason `loadSubjectContexts` and `listScheduleAssignments` carry `subject_type`.
 *
 * `id` is the subject's identity of record and the ONE id used to key the projection, address the
 * action and label the DOM: `customer_members.id` for a child, `persons.id` for staff.
 *
 * `dobAge` is child enrichment. It is null for staff — not because staff have no age, but because a
 * staff member's age is not an operational fact this card is entitled to state.
 */
type SchedSubject = {
    kind: "child" | "staff";
    id: string;
    personId: string | null;
    name: string;
    imageUrl: string | null;
    dobAge: string | null;
};

/*
 * The domain's eligibility reasons now live in `reductionReasonLabels`, shared with the family
 * Discount surface so the same canonical reason reads the same way at both grains. Re-exported
 * under the local name so every call site below is unchanged — this moved the vocabulary, not
 * the words.
 */
const REDUCTION_REASON_LABEL = REDUCTION_REASON_LABELS;

const WEEKDAYS = [
    { i: 1, l: "M" },
    { i: 2, l: "T" },
    { i: 3, l: "W" },
    { i: 4, l: "T" },
    { i: 5, l: "F" },
    { i: 6, l: "S" },
    { i: 0, l: "S" },
];
const WEEKDAY_LABEL: Record<number, string> = { 0: "Sun", 1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat" };
const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatDate(iso: string | null): string {
    if (!iso) return "";
    const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
    if (!y || !m || !d) return iso;
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}
async function schedApi(path: string, init?: RequestInit): Promise<any> {
    const res = await fetch(`/api/admin/scheduling${path}`, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`);
    return body;
}

/*
 * The governed-action transport now lives in `executeFinancialsAction`, so the family Discount
 * surface invokes the SAME certified exception actions through the same error handling rather
 * than carrying a second copy of it. The local name is kept so every call site below reads
 * unchanged — this moved the implementation, not the behaviour.
 */
const executeAssignmentAction = executeFinancialsAction;

/**
 * After an assignment mutation, push the reloaded child projection into Focus Panel
 * truth so Children / Household / Schedule cards recompose together.
 */
function publishScheduleProjectionToFocusPanel(args: {
    opportunityId: string | null;
    memberId: string;
    fresh: SubjectProj | null;
    truth: Record<string, unknown>;
    clearInquiryScheduleDraft: boolean;
}): void {
    const opportunityId = args.opportunityId?.trim() || "";
    const memberId = args.memberId.trim();
    if (!opportunityId || !memberId) return;

    const prevBag =
        args.truth._scheduling_projection && typeof args.truth._scheduling_projection === "object"
            ? ({ ...(args.truth._scheduling_projection as Record<string, unknown>) } as Record<string, unknown>)
            : {};
    const prevBy =
        prevBag.byMemberId && typeof prevBag.byMemberId === "object" && !Array.isArray(prevBag.byMemberId)
            ? { ...(prevBag.byMemberId as Record<string, unknown>) }
            : {};
    if (args.fresh) {
        prevBy[memberId] = args.fresh;
    } else {
        delete prevBy[memberId];
    }

    const patch: Record<string, unknown> = {
        ...args.truth,
        _scheduling_projection: { ...prevBag, byMemberId: prevBy },
    };

    if (args.clearInquiryScheduleDraft && Array.isArray(args.truth._inquiry_children)) {
        patch._inquiry_children = (args.truth._inquiry_children as unknown[]).map((raw) => {
            if (!raw || typeof raw !== "object") return raw;
            const row = raw as Record<string, unknown>;
            const id = String(row.id ?? "").trim();
            const cm = String(row.customer_member_id ?? "").trim();
            if (id !== memberId && cm !== memberId) return raw;
            return {
                ...row,
                schedule_type: null,
                program_room_cohort_key: null,
                program_room_cohort_label: null,
                desired_schedule_label: null,
                start_date: null,
            };
        });
    }

    dispatchOpportunityDrawerRecordPatch(opportunityId, patch);
    dispatchDrawerLayoutRuntimeBodyRecordPatch({
        entityType: "opportunities",
        entityId: opportunityId,
        record: patch,
    });
}

/**
 * THE CANONICAL SUBJECT this card is currently acting on.
 *
 * Derived, never stored: the subject's identity comes from the collection row and its commitment
 * facts come from the projection, so there is no third place where "who is this about" could drift
 * from what the card is rendering.
 *
 * A child resolves to an agreement when it has one (committed) and to member+site when it does not
 * (proposed). A staff member resolves to person+site and nothing else — there is no agreement to
 * carry, and `resolveSubjectSite` returns `commitmentKind: "committed"` for them regardless.
 */
function operationalSubjectFor(
    subject: SchedSubject,
    proj: SubjectProj | null
): OperationalAssignmentSubject {
    const siteId = (proj?.child.siteId ?? "").trim() || null;
    if (subject.kind === "staff") {
        return { type: "staff", personId: subject.id, siteLocationId: siteId ?? "" };
    }
    return {
        type: "child",
        enrollmentAgreementId: (proj?.enrollmentAgreementId ?? "").trim() || null,
        customerMemberId: subject.id,
        siteLocationId: siteId,
    };
}

/**
 * Shared create payload — the canonical anchor for whichever subject, plus the caller's fields.
 *
 * This replaced nine inlined `subject_type: "child"` literals. The child output is pinned
 * byte-for-byte by `assignmentSubjectBinding.test.ts`, because the risk in generalizing was never
 * that staff would fail loudly — it was that child would change quietly.
 */
function assignmentCreatePayload(
    subject: OperationalAssignmentSubject,
    extra: Record<string, unknown>
): Record<string, unknown> {
    return { ...assignmentAnchorPayload(subject), ...extra };
}

// ── Derived schedule state (business meaning leads) ──────────────────────────
type StateTone = "pine" | "gold" | "blue" | "muted";
type ScheduleState = { label: string; tone: StateTone; sub: string | null };
const TONE_COLOR: Record<StateTone, string> = { pine: T.pine, gold: T.gold, blue: T.blue, muted: T.muted };
const TONE_BG: Record<StateTone, string> = {
    pine: "rgba(0,162,131,.10)",
    gold: "rgba(208,173,80,.14)",
    blue: "rgba(0,69,140,.10)",
    muted: "rgba(89,103,139,.10)",
};

/** State treatment from the projection's already-resolved status — never recomputed here. */
function deriveScheduleState(p: SubjectProj | null): ScheduleState {
    if (!p) return { label: "—", tone: "muted", sub: null };
    switch (p.status) {
        case "scheduled":
            return { label: "Active", tone: "pine", sub: null };
        case "proposed":
            // A child WITH a (planned) schedule reads distinctly from one that still
            // needs a room — blue "has a schedule" vs gold "needs a room".
            return { label: "Proposed", tone: "blue", sub: p.proposed?.effectiveFrom ? `Starts ${formatDate(p.proposed.effectiveFrom)}` : "Proposed — active at enrollment" };
        case "upcoming-only":
            return { label: "Future", tone: "blue", sub: p.current?.effectiveFrom ? `Starts ${formatDate(p.current.effectiveFrom)}` : null };
        case "ended":
            return { label: "Ended", tone: "muted", sub: null };
        default:
            return { label: "Needs a room", tone: "gold", sub: null };
    }
}

/** Compact status for the summary rows. */
function summaryStatus(p: SubjectProj): { label: string; color: string } {
    const s = deriveScheduleState(p);
    if (p.status === "proposed" && p.proposed?.effectiveFrom) return { label: "Proposed", color: TONE_COLOR[s.tone] };
    return { label: s.label, color: TONE_COLOR[s.tone] };
}
function existingView(p: SubjectProj | null): ProjView | null {
    return p?.current ?? p?.proposed ?? null;
}

/**
 * Plural list: committed + proposed planning rows (proposed never replaces committed).
 *
 * The rows are filtered to the SUBJECT'S OWN KIND. That filter used to be the constant
 * `subjectType !== "staff"` — correct while every subject was a child, and the exact line that made
 * a staff member's assignments invisible on a card that was otherwise ready to render them. It is
 * still a filter and not a removal, because `schedule_assignments` is shared: a projection that ever
 * carried both kinds must not show one subject the other's commitments.
 */
function listAssignments(p: SubjectProj | null, kind: "child" | "staff"): ProjAssignment[] {
    const mine = (a: ProjAssignment) => (a.subjectType ?? "child") === kind;
    const committed = (p?.current?.assignments ?? []).filter(mine);
    const proposed = (p?.proposed?.assignments ?? []).filter(mine);
    if (committed.length === 0) return proposed;
    if (proposed.length === 0) return committed;
    const seen = new Set(committed.map((a) => a.id));
    return [...committed, ...proposed.filter((a) => !seen.has(a.id))];
}

/**
 * Scheduling card — the "what is true?" identity surface, driven by the canonical
 * SchedulingProjection. Clicking a child opens the Scheduling work surface in the
 * center, which lands on a read-only Schedule Detail (existing truth) and only enters
 * the editor via Edit / Create new. Detail and Edit share ONE region composition
 * (ScheduleRegions): Detail renders values, Edit transforms the same regions into
 * controls in place. The card never edits inline.
 */
export default function SchedulingCard({ model, context, receded = false, coordination, composerPreview, onMutated }: Props) {
    const evidence = useMemo(() => buildChildrenCardEvidence(context), [context]);
    /*
     * THE SUBJECTS THIS CARD IS ABOUT — a family's children, or one staff member.
     *
     * A host declares which by writing ONE of the two truth keys, so there is no precedence to get
     * wrong and no state in which both apply. Staff is checked first only because it is the
     * narrower claim; a host that holds a staff member never writes child rows.
     *
     * Jane is NOT mapped through the child evidence with her enrollment fields nulled. That would
     * render identically today and would tell every later reader — a roster count, an age policy, a
     * tuition projection — that a staff member is a child.
     */
    const subjects: SchedSubject[] = useMemo(() => {
        const staff = readDurableStaffSchedulingSubject(context.truth as Record<string, unknown>);
        if (staff) {
            return [
                {
                    kind: "staff" as const,
                    id: staff.personId,
                    personId: staff.personId,
                    name: staff.name,
                    imageUrl: staff.imageUrl,
                    // Not "unknown" — inapplicable. A staff member's age is not an operational fact
                    // this card is entitled to state.
                    dobAge: null,
                },
            ];
        }
        return evidence.children.map((c) => ({
            kind: "child" as const,
            id: c.customerMemberId ?? c.id,
            personId: c.personId ?? null,
            name: c.name,
            imageUrl: c.imageUrl ?? null,
            dobAge: c.dobAge ?? null,
        }));
    }, [evidence, context.truth]);
    const subjectKind: "child" | "staff" = subjects[0]?.kind ?? "child";
    /*
     * THE CASE THIS CARD IS ACTING INSIDE, or none.
     *
     * A staff member has none, and the resolver cannot say so: it ends
     * `return subjectId`, so asking it about a person grain hands back Jane's `persons.id` AS an
     * opportunity id. Nothing rejects that — it is a well-formed uuid — and the consequences are all
     * silent and all child-shaped: a tuition selector rendered on a staff assignment, a rate-options
     * fetch issued against a non-existent opportunity, a quote persisted onto one.
     *
     * The resolver is not wrong; it was written for grains that always have a case. The question
     * simply does not apply to a staff subject, so it is not asked.
     */
    const opportunityId =
        subjectKind === "staff"
            ? null
            : resolveFocusPanelMutationOpportunityId({
                  subjectId: context.subject.id,
                  grain: context.grain,
                  truth: context.truth as Record<string, unknown>,
              });

    // Prebuilt projection: composed server-side into context.truth by the Focus Panel
    // first-paint runtime (like Household), so the card reveals WITH the panel and opens
    // a child's Detail instantly — no per-child fetch, no self-managed loading gate.
    const prebuilt = useMemo(() => {
        const bag = (context.truth as Record<string, unknown>)?._scheduling_projection;
        const byMember = (bag && typeof bag === "object" ? (bag as { byMemberId?: Record<string, SubjectProj> }).byMemberId : null) ?? {};
        return byMember;
    }, [context.truth]);

    // The site's configured scheduling constraints (operating days + schedule types),
    // resolved once per opportunity in first-paint — so the editor limits day pills and
    // offers schedule types with no per-open fetch.
    const schedConfig: SchedConfig = useMemo(() => {
        const bag = (context.truth as Record<string, unknown>)?._scheduling_projection as
            | {
                  operatingDays?: unknown;
                  scheduleTypes?: unknown;
                  patterns?: unknown;
                  assignmentTypes?: unknown;
                  operationalRooms?: unknown;
              }
            | undefined;
        const operatingDays = Array.isArray(bag?.operatingDays)
            ? (bag!.operatingDays as unknown[]).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
            : [];
        const scheduleTypes = Array.isArray(bag?.scheduleTypes) ? (bag!.scheduleTypes as SchedTypeOpt[]) : [];
        const patterns = Array.isArray(bag?.patterns) ? (bag!.patterns as Pattern[]) : [];
        const assignmentTypes = Array.isArray(bag?.assignmentTypes)
            ? (bag!.assignmentTypes as AssignmentTypeOpt[]).filter((t) => t?.id && t?.label)
            : [];
        const operationalRooms = Array.isArray(bag?.operationalRooms)
            ? (bag!.operationalRooms as SiteOperationalRoom[]).filter((r) => r?.roomId)
            : [];
        return { operatingDays, scheduleTypes, patterns, assignmentTypes, operationalRooms };
    }, [context.truth]);

    // Local overrides after a save (the prebuilt context does not re-compose on its own).
    const [overrides, setOverrides] = useState<Record<string, SubjectProj>>({});
    const projById = useMemo(() => ({ ...prebuilt, ...overrides }), [prebuilt, overrides]);

    /**
     * Re-read ONE subject's canonical commitment facts after a write.
     *
     * The identifier column is the subject's own — `customer_member_id` for a child,
     * `subject_person_id` for staff — and the site is sent explicitly for staff because a staff
     * member has no opportunity for the route to resolve one from. The response shape is the same
     * projection either way, so the override map and every consumer below stay subject-agnostic.
     */
    const reloadSubject = useCallback(
        async (subject: SchedSubject, siteLocationId: string | null): Promise<SubjectProj | null> => {
            const params = new URLSearchParams({ view: "projection", subject_name: subject.name });
            if (subject.kind === "staff") {
                params.set("subject_type", "staff");
                params.set("subject_person_id", subject.id);
                if (siteLocationId) params.set("site_location_id", siteLocationId);
            } else {
                params.set("customer_member_id", subject.id);
                if (opportunityId) params.set("opportunity_id", opportunityId);
            }
            const r = await schedApi(`?${params.toString()}`);
            const p = (r.projection?.children?.[0] as SubjectProj | undefined) ?? null;
            if (p) setOverrides((prev) => ({ ...prev, [subject.id]: p }));
            return p;
        },
        [opportunityId]
    );

    const [activeChildId, setActiveChildId] = useState<string | null>(null);
    useEffect(() => {
        if (composerPreview?.perspective === "expanded" && subjects[0]) setActiveChildId(subjects[0].id);
    }, [composerPreview, subjects]);

    /*
     * A SINGLE SUBJECT OPENS DIRECTLY.
     *
     * A family roster is a list to choose from; one staff member is not a choice. Landing an
     * operator on a one-row list they must then click is a step that exists only because the card
     * once always had a family. Applied by COUNT, not by kind, so a single-child durable record
     * behaves the same way — the rule is "one subject is not a decision", the same rule the context
     * strip already follows.
     */
    useEffect(() => {
        if (subjects.length === 1) setActiveChildId((prev) => prev ?? subjects[0]!.id);
    }, [subjects]);

    // Card Link / Linked field handoff — open this subject's Schedule Detail.
    const request = coordination?.request;
    const requestNonce = request?.card === "scheduling" ? request.nonce : null;
    useEffect(() => {
        if (request?.card !== "scheduling") return;
        const focus = request.focus?.trim() || null;
        if (!focus) {
            setActiveChildId(null);
            return;
        }
        const match =
            subjects.find((c) => c.id === focus)
            ?? subjects.find((c) => c.personId === focus)
            ?? null;
        setActiveChildId(match?.id ?? focus);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- nonce gates re-apply
    }, [requestNonce, subjects]);

    const activeChild = subjects.find((c) => c.id === activeChildId) ?? null;
    // While the Linked host elevates Scheduling, keep reporting focused even before
    // the request effect resolves activeChildId (avoids a mount-time "base" flash).
    const hostElevated = coordination?.activeDepth?.card === "scheduling";
    useReportPerspective(
        coordination,
        "scheduling",
        activeChild || hostElevated ? "focused" : "base",
    );
    useDismissSignal(coordination, "scheduling", () => setActiveChildId(null));

    /*
     * The card's own sentence about its subjects. Staff phrasing is not "1 child" with a different
     * noun bolted on: a staff card never reaches the plural branch, because a person is one person.
     */
    const insight =
        subjectKind === "staff"
            ? subjects.length === 0
                ? "No staff member to assign"
                : "Staff assignments"
            : subjects.length === 0
              ? "No children to assign"
              : subjects.length === 1
                ? "1 child"
                : `${subjects.length} children`;

    return (
        <UniversalCard
            title={model.title}
            // When a child is active the work surface leads with its own avatar identity
            // header, so the redundant "Schedule · <name>" heading is suppressed.
            insight={activeChild ? "" : insight}
            supportingInsight={activeChild ? null : subjects.length > 0 ? "Room · Days · Effective · Time" : null}
            iconName={model.iconName}
            tier={model.tier}
            archetype={model.archetype}
            statusChip={activeChild ? null : model.statusChip}
            statusTone={model.statusTone}
            modalClass="record"
            density={activeChild ? "expanded" : model.density ?? "compact"}
            gridSpan={model.span}
            data-universal-card-key={model.key}
            receded={receded}
        >
            {/*
              Assignment work surface — create/edit schedule + embedded tuition.
              Requirements checklist and separate Generate Quote chrome were removed:
              tuition/$ lives on the assignment itself (quote on the opportunity during enrollment).
            */}
            <div
                data-scheduling-card="true"
                data-assignments-card="true"
                data-scheduling-subject-kind={subjectKind}
            >
                {activeChild ? (
                    <ScheduleWorkSurface
                        child={activeChild}
                        opportunityId={opportunityId}
                        projection={projById[activeChild.id] ?? null}
                        config={schedConfig}
                        truth={context.truth as Record<string, unknown>}
                        reloadChild={() =>
                            reloadSubject(activeChild, projById[activeChild.id]?.child.siteId ?? null)
                        }
                        coordination={coordination}
                        onBack={() => {
                            setActiveChildId(null);
                            coordination?.back?.();
                        }}
                        onMutated={onMutated}
                    />
                ) : subjects.length === 0 ? (
                    <p style={{ fontSize: 12.5, color: T.muted }}>
                        {subjectKind === "staff"
                            ? "This staff member has no schedule context."
                            : "Link children to add assignments."}
                    </p>
                ) : (
                    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
                        {subjects.map((child) => {
                            const proj = projById[child.id];
                            const chrome = proj ? summaryStatus(proj) : { label: "…", color: T.muted };
                            const assignmentModel = buildAssignmentCardModelForChild({
                                truth: context.truth as Record<string, unknown>,
                                customerMemberId: child.id,
                                projection: (proj as never) ?? null,
                            });
                            const detail =
                                assignmentModel.summaryLine
                                || projectCompactScheduleForIdentity(proj as ChildScheduling | null | undefined, {
                                    emptyLabel: "No schedule yet",
                                }).compactLine
                                || "No schedule yet";
                            return (
                                <li key={child.id} data-scheduling-child={child.id} data-assignment-child-row={child.id}>
                                    <div style={{ ...rowBtnStyle, padding: 0, gap: 0 }}>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const result = navigateCardLinkWithHistory({
                                                    coordination,
                                                    link: {
                                                        id: "default:scheduling:child_identity",
                                                        fromCard: "scheduling",
                                                        toCard: "children",
                                                        fromFieldKey: "child.identity",
                                                        label: "Children",
                                                    },
                                                    destinationFocus: child.id,
                                                    sourceFocus: child.id,
                                                    nav: createEmptyFocusPanelCardLinkNavState(),
                                                });
                                                if (!result.ok) {
                                                    // Quiet fallback — keep operator on Assignments.
                                                    setActiveChildId(child.id);
                                                }
                                            }}
                                            aria-label={`View ${child.name} in Children`}
                                            data-scheduling-focus-children={child.id}
                                            title="View in Children"
                                            style={{
                                                appearance: "none",
                                                border: 0,
                                                background: "transparent",
                                                padding: "8px 4px 8px 10px",
                                                cursor: "pointer",
                                                display: "flex",
                                                alignItems: "center",
                                            }}
                                        >
                                            <CardAvatar name={child.name} imageUrl={child.imageUrl} size={30} recordId={child.id} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setActiveChildId(child.id)}
                                            data-scheduling-open={child.id}
                                            style={{
                                                ...rowBtnStyle,
                                                flex: 1,
                                                border: 0,
                                                background: "transparent",
                                                padding: "8px 10px 8px 4px",
                                            }}
                                        >
                                            <span style={{ display: "grid", gap: 2, minWidth: 0, flex: 1 }}>
                                                <span style={{ fontSize: 13.5, fontWeight: 600, color: T.forge }}>{child.name}</span>
                                                <span
                                                    style={{ fontSize: 11.5, color: T.slate, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                                                    data-scheduling-summary={child.id}
                                                    data-assignment-summary={child.id}
                                                >
                                                    {detail}
                                                </span>
                                            </span>
                                            <span
                                                style={{
                                                    fontSize: 11,
                                                    fontWeight: 650,
                                                    color: chrome.color,
                                                    whiteSpace: "nowrap",
                                                    padding: "2px 8px",
                                                    borderRadius: 999,
                                                    background: "rgba(0,0,0,0.04)",
                                                }}
                                            >
                                                {chrome.label}
                                            </span>
                                        </button>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </UniversalCard>
    );
}

// ── The work surface: Detail (read-only) ⇄ Editor (edit | create) ────────────
// Both render the SAME ScheduleRegions composition. Detail passes value nodes;
// Editor passes control nodes into the same regions.
type SurfaceMode = "detail" | "edit" | "create" | "assignment" | "pick-type";

function ScheduleWorkSurface({
    child,
    opportunityId,
    projection,
    config,
    truth,
    reloadChild,
    coordination,
    onBack,
    onMutated,
}: {
    child: SchedSubject;
    opportunityId: string | null;
    projection: SubjectProj | null;
    config: SchedConfig;
    truth: Record<string, unknown>;
    reloadChild: () => Promise<SubjectProj | null>;
    coordination?: FocusPanelCoordination;
    onBack: () => void;
    /** See {@link Props.onMutated}. */
    onMutated?: () => void;
}) {
    const [proj, setProj] = useState<SubjectProj | null>(projection);
    const existing = existingView(proj);
    const [mode, setMode] = useState<SurfaceMode>(existing ? "detail" : "create");
    const [activeAssignmentId, setActiveAssignmentId] = useState<string | null>(null);
    const [editingAssignmentId, setEditingAssignmentId] = useState<string | null>(null);
    const [pendingTypeId, setPendingTypeId] = useState<string | null>(null);
    const [actionBusy, setActionBusy] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    /** Persist Assignments day filter across singular detail drill-in. */
    const [listDayFilter, setListDayFilter] = useState<number | null>(null);

    const currentAssignments: ProjAssignment[] = useMemo(
        () => listAssignments(proj, child.kind),
        [proj, child.kind]
    );

    /*
     * THE ONE PLACE THIS SURFACE DECIDES WHO IT IS ACTING ON.
     *
     * Every action dispatch below reads `subject`, `binding` and `applicability` — never
     * `child.kind` directly, and never a `subject_type` literal. That is the whole generalization:
     * the surface asks "who, and what may they do", and the answer arrives already reconciled with
     * what the write service will accept.
     */
    const subject = useMemo(() => operationalSubjectFor(child, proj), [child, proj]);
    const binding = useMemo(() => assignmentActionBinding(subject), [subject]);
    const applicability = useMemo(() => assignmentSubjectApplicability(subject), [subject]);

    const activeAssignment =
        currentAssignments.find((a) => a.id === activeAssignmentId) ?? null;

    const previousFocus = coordination?.previousFocus ?? null;

    /**
     * Depth chrome matches Household/Children: ← Back in the body (not a modal ✕),
     * form abandon via footer Cancel, dismiss elevation via scrim / ESC.
     * Edit/create/pick-type do NOT put Cancel in the header (footer owns that).
     */
    const cancelToDetail = () => {
        setPendingTypeId(null);
        setEditingAssignmentId(null);
        setActiveAssignmentId(null);
        setMode("detail");
    };
    const headerBack: { label: string; onClick: () => void } | null =
        mode === "assignment"
            ? {
                  label: "Assignments",
                  onClick: () => {
                      setActiveAssignmentId(null);
                      setMode("detail");
                  },
              }
            : mode === "edit" || mode === "create" || mode === "pick-type"
              ? null
              : previousFocus
                ? { label: focusPanelCardBackLabel(previousFocus.card), onClick: onBack }
                : null;

    const header = headerBack ? (
        <div
            style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}
            data-schedule-nav="true"
        >
            <button
                type="button"
                onClick={headerBack.onClick}
                aria-label={`Back to ${headerBack.label}`}
                data-schedule-back="true"
                data-schedule-back-target={headerBack.label}
                className="alloy-os-ucard__action alloy-os-ucard__action--system5"
                style={{ padding: "2px 0" }}
            >
                ← {headerBack.label}
            </button>
        </div>
    ) : null;

    const onSaved = async (opts?: { clearInquiryScheduleDraft?: boolean }) => {
        const fresh = await reloadChild();
        setProj(fresh);
        /*
         * Republish into the CASE's Focus Panel truth — child only, and not by exclusion.
         *
         * This bag is keyed by member id and sits beside `_inquiry_children`; both are facts about
         * an opportunity's family roster. A staff member has neither, so the call is skipped rather
         * than made with a person id that no reader of that bag could interpret. The function
         * already no-ops without an opportunity, but relying on that would make the skip incidental
         * instead of stated.
         */
        if (child.kind === "child") {
            publishScheduleProjectionToFocusPanel({
                opportunityId,
                memberId: child.id,
                fresh,
                truth,
                clearInquiryScheduleDraft: Boolean(opts?.clearInquiryScheduleDraft),
            });
        }
        setMode("detail");
        setActiveAssignmentId(null);
        setEditingAssignmentId(null);
        setPendingTypeId(null);
        /*
         * CANONICAL TRUTH CHANGED — tell whoever is hosting this card.
         *
         * Everything above re-reads the card's OWN data, which is why an assignment edit looked
         * correct here while the surface underneath went on showing the old commitment: the card
         * healed itself and told nobody. Announced LAST, after the reload, so a host that re-reads
         * on this signal cannot observe a state the card has not caught up to yet.
         */
        onMutated?.();
    };

    const beginCreateAssignment = () => {
        setActionError(null);
        setEditingAssignmentId(null);
        setPendingTypeId(null);
        /*
         * The FIRST commitment used the schedule-create path unconditionally, because that path
         * establishes a child's primary operational home. It is not subject-general: the route
         * behind it (`POST /api/admin/scheduling`) reads `customer_member_id` and refuses without
         * one, and `createOperationalAssignment` refuses `is_primary` for any non-child subject.
         *
         * So staff always goes through the type picker into `assignment.create` — the registered
         * action that already accepts a staff subject — including for their first assignment. That
         * is not a lesser path; it is the canonical one for a subject with no primary-home concept.
         */
        if (currentAssignments.length === 0 && applicability.canUseChildSchedulePath) {
            setMode("create");
            return;
        }
        // Type picker — empty state deep-links to Studio Types (no seed/migrate dead end).
        setMode("pick-type");
    };

    const runAction = async (
        body: {
            action_key: string;
            entity_type: string;
            entity_id: string;
            payload: Record<string, unknown>;
        },
        opts?: { clearInquiryScheduleDraft?: boolean },
    ): Promise<boolean> => {
        setActionBusy(true);
        setActionError(null);
        try {
            await executeAssignmentAction(body);
            await onSaved(opts);
            return true;
        } catch (e) {
            setActionError(e instanceof Error ? e.message : "Action failed");
            return false;
        } finally {
            setActionBusy(false);
        }
    };

    if (mode === "assignment" && activeAssignment) {
        return (
            <div data-schedule-surface="true" data-schedule-ready="true" data-assignment-surface="detail">
                {header}
                {actionError ? (
                    <p style={{ color: T.ember, fontSize: 12, margin: "0 0 8px" }}>{actionError}</p>
                ) : null}
                <AssignmentDetailView
                    assignment={activeAssignment}
                    siblings={currentAssignments}
                    history={proj?.history ?? []}
                    busy={actionBusy}
                    onEdit={() => {
                        if (activeAssignment.isPrimary) {
                            setActiveAssignmentId(null);
                            setEditingAssignmentId(null);
                            setMode("edit");
                            return;
                        }
                        setEditingAssignmentId(activeAssignment.id);
                        setActiveAssignmentId(null);
                        if (activeAssignment.assignmentType.id) {
                            setPendingTypeId(activeAssignment.assignmentType.id);
                            setMode("create");
                            return;
                        }
                        if (config.assignmentTypes.length === 0) {
                            setActionError("No Assignment Categories are configured for this organization.");
                            setMode("detail");
                            return;
                        }
                        setPendingTypeId(null);
                        setMode("pick-type");
                    }}
                    onSetPrimary={
                        // Valid for BOTH subjects: `setPrimaryOperationalAssignment` resolves a staff
                        // subject explicitly and refuses a promote target belonging to another person.
                        activeAssignment.isPrimary || !applicability.canSetPrimary
                            ? undefined
                            : () =>
                                  runAction({
                                      action_key: "assignment.set_primary",
                                      ...binding,
                                      payload: {
                                          ...assignmentAnchorPayload(subject),
                                          // Kept as `?? ""` — an EMPTY STRING, not undefined — because
                                          // that is what the child path has always sent and the action
                                          // distinguishes them. Omitted entirely for staff, who have
                                          // no agreement to name.
                                          ...(applicability.hasEnrollmentAgreement
                                              ? { enrollment_agreement_id: proj?.enrollmentAgreementId ?? "" }
                                              : {}),
                                          effective_date: activeAssignment.effectiveFrom,
                                          promote_assignment_id: activeAssignment.id,
                                          subject_label: child.name,
                                      },
                                  })
                    }
                    onDuplicate={
                        activeAssignment.assignmentType.id
                            ? () =>
                                  runAction({
                                      action_key: "assignment.create",
                                      ...binding,
                                      payload: assignmentCreatePayload(subject, {
                                          schedule_pattern_id: activeAssignment.patternId,
                                          start_date: activeAssignment.effectiveFrom,
                                          room_location_id: activeAssignment.room.id,
                                          assignment_type_id: activeAssignment.assignmentType.id,
                                          duplicate_of: activeAssignment.id,
                                          assignment_type_label: activeAssignment.assignmentType.label,
                                          is_primary: false,
                                      }),
                                  })
                            : undefined
                    }
                    onArchive={
                        activeAssignment.isPrimary
                            ? undefined
                            : () =>
                                  runAction({
                                      action_key: "assignment.archive",
                                      ...binding,
                                      payload: { assignment_id: activeAssignment.id },
                                  })
                    }
                    archiveBlockedReason={
                        activeAssignment.isPrimary
                            ? "Make another assignment primary before archiving this one."
                            : null
                    }
                    onDelete={
                        activeAssignment.commitmentKind === "proposed"
                            ? () => setDeleteConfirmOpen(true)
                            : undefined
                    }
                    onPromote={
                        // CHILD ONLY, and doubly so: `assignment.promote_proposed` declares
                        // `supportedEntityTypes: ["child"]`, and a staff assignment is never proposed
                        // in the first place — `resolveSubjectSite` commits every staff subject. The
                        // `commitmentKind` test below is therefore already false for staff; the
                        // applicability gate states the rule rather than relying on that coincidence.
                        applicability.canPromoteProposed &&
                        activeAssignment.commitmentKind === "proposed" &&
                        (proj?.enrollmentAgreementId ?? "").trim()
                            ? () =>
                                  runAction({
                                      action_key: "assignment.promote_proposed",
                                      ...binding,
                                      payload: {
                                          assignment_id: activeAssignment.id,
                                          enrollment_agreement_id: proj?.enrollmentAgreementId ?? "",
                                      },
                                  })
                            : undefined
                    }
                    promoteBlockedReason={
                        applicability.canPromoteProposed &&
                        activeAssignment.commitmentKind === "proposed" &&
                        !(proj?.enrollmentAgreementId ?? "").trim()
                            ? "This Assignment can only become active after enrollment is completed."
                            : null
                    }
                />
                <AdminDeleteConfirmModal
                    isOpen={deleteConfirmOpen}
                    onClose={() => setDeleteConfirmOpen(false)}
                    isLoading={actionBusy}
                    entityTypeLabel="proposed assignment"
                    recordLabel={
                        [
                            activeAssignment.assignmentType.label,
                            activeAssignment.room.name || activeAssignment.room.program,
                        ]
                            .filter(Boolean)
                            .join(" · ") || child.name
                    }
                    onConfirm={async () => {
                        const ok = await runAction(
                            {
                                action_key: "assignment.delete_proposed",
                                ...binding,
                                payload: { assignment_id: activeAssignment.id },
                            },
                            { clearInquiryScheduleDraft: true },
                        );
                        if (ok) {
                            setDeleteConfirmOpen(false);
                            setActiveAssignmentId(null);
                            setMode("detail");
                        }
                    }}
                />
            </div>
        );
    }

    if (mode === "detail" || mode === "assignment") {
        return (
            <div data-schedule-surface="true" data-schedule-ready="true" data-assignment-list-surface="true">
                {header}
                <AssignmentListSurface
                    child={child}
                    proj={proj}
                    assignments={currentAssignments}
                    dayFilter={listDayFilter}
                    onDayFilterChange={setListDayFilter}
                    onCreate={beginCreateAssignment}
                    onOpenAssignment={(id) => {
                        setActiveAssignmentId(id);
                        setMode("assignment");
                    }}
                    listActions={{
                        busy: actionBusy,
                        onEdit: (id) => {
                            const a = currentAssignments.find((row) => row.id === id);
                            if (!a) return;
                            setActiveAssignmentId(id);
                            setMode("assignment");
                            // Detail owns the edit entry; open detail then operator hits Edit,
                            // or jump straight into editor for primary.
                            if (a.isPrimary) {
                                setActiveAssignmentId(null);
                                setEditingAssignmentId(null);
                                setMode("edit");
                                return;
                            }
                            setEditingAssignmentId(a.id);
                            setActiveAssignmentId(null);
                            if (a.assignmentType.id) {
                                setPendingTypeId(a.assignmentType.id);
                                setMode("create");
                                return;
                            }
                            setPendingTypeId(null);
                            setMode("pick-type");
                        },
                        onSetPrimary: (id) => {
                            const a = currentAssignments.find((row) => row.id === id);
                            if (!a || a.isPrimary || !applicability.canSetPrimary) return;
                            void runAction({
                                action_key: "assignment.set_primary",
                                ...binding,
                                payload: {
                                    ...assignmentAnchorPayload(subject),
                                    ...(applicability.hasEnrollmentAgreement
                                        ? { enrollment_agreement_id: proj?.enrollmentAgreementId ?? "" }
                                        : {}),
                                    effective_date: a.effectiveFrom,
                                    promote_assignment_id: a.id,
                                    subject_label: child.name,
                                },
                            });
                        },
                        onDuplicate: (id) => {
                            const a = currentAssignments.find((row) => row.id === id);
                            if (!a?.assignmentType.id) return;
                            void runAction({
                                action_key: "assignment.create",
                                ...binding,
                                payload: assignmentCreatePayload(subject, {
                                    schedule_pattern_id: a.patternId,
                                    start_date: a.effectiveFrom,
                                    room_location_id: a.room.id,
                                    assignment_type_id: a.assignmentType.id,
                                    duplicate_of: a.id,
                                    assignment_type_label: a.assignmentType.label,
                                    is_primary: false,
                                }),
                            });
                        },
                        onArchive: (id) => {
                            const a = currentAssignments.find((row) => row.id === id);
                            if (!a || a.isPrimary) return;
                            void runAction({
                                action_key: "assignment.archive",
                                ...binding,
                                payload: { assignment_id: a.id },
                            });
                        },
                        archiveBlockedReasonFor: (a) =>
                            a.isPrimary ? "Make another assignment primary before archiving this one." : null,
                    }}
                />
            </div>
        );
    }

    if (mode === "pick-type") {
        return (
            <div data-schedule-surface="true" data-schedule-ready="true" data-assignment-type-picker="true">
                {header}
                {actionError ? (
                    <p style={{ color: T.ember, fontSize: 12, margin: "0 0 8px" }}>{actionError}</p>
                ) : null}
                <AssignmentTypePicker
                    types={config.assignmentTypes}
                    onCancel={cancelToDetail}
                    onPick={(typeId) => {
                        setPendingTypeId(typeId);
                        setMode("create");
                    }}
                    onConfigureTypes={() => {
                        /*
                         * Configuration lives in OPERATIONS → STUDIO → Assignment Categories.
                         *
                         * This opened the Assignments workspace, which is no longer a destination.
                         * It is the one handoff that legitimately LEAVES the record — authoring
                         * categories is configuration, not the operator's current work — and it now
                         * lands in the same workspace their operating day is already in.
                         */
                        void import("@/lib/adminV2/workspaceModalEvents").then(
                            ({ dispatchAdminV2OpenOperationsModal }) => {
                                dispatchAdminV2OpenOperationsModal({ studioSection: "types" });
                            },
                        );
                    }}
                />
            </div>
        );
    }

    const editingAssignment =
        editingAssignmentId != null
            ? currentAssignments.find((a) => a.id === editingAssignmentId) ?? null
            : null;
    const createAsSecondary = Boolean(pendingTypeId) || Boolean(editingAssignment);
    const selectedType =
        config.assignmentTypes.find((t) => t.id === pendingTypeId) ??
        (editingAssignment?.assignmentType.id
            ? config.assignmentTypes.find((t) => t.id === editingAssignment.assignmentType.id) ?? {
                  id: editingAssignment.assignmentType.id,
                  key: editingAssignment.assignmentType.key,
                  label: editingAssignment.assignmentType.label ?? "Assignment",
              }
            : null);

    return (
        <div data-schedule-surface="true" data-schedule-ready="true">
            {header}
            {actionError ? (
                <p style={{ color: T.ember, fontSize: 12, margin: "0 0 8px" }}>{actionError}</p>
            ) : null}
            <ScheduleEditor
                child={child}
                opportunityId={opportunityId}
                proj={proj}
                config={config}
                truth={truth}
                existing={mode === "edit" ? existing : editingAssignment ? {
                    effectiveFrom: editingAssignment.effectiveFrom,
                    effectiveTo: editingAssignment.effectiveTo,
                    openEnded: editingAssignment.openEnded,
                    scheduleType: existing?.scheduleType,
                    scheduleTypeLabel: existing?.scheduleTypeLabel,
                    assignments: [editingAssignment],
                } : null}
                mode={mode === "edit" ? "edit" : "create"}
                createAsSecondary={createAsSecondary}
                assignmentTypeLabel={selectedType?.label ?? null}
                assignmentTypeBehavior={selectedType?.behavior}
                // Real program from assignment/child context — never a hardcoded null. When
                // editing an existing assignment, its room already implies a canonical
                // program (if any); ScheduleEditor keeps this current as the room changes.
                programCategoryId={programCategoryIdForRoom(
                    config.operationalRooms,
                    (mode === "edit" ? existing?.assignments[0]?.room.id : editingAssignment?.room.id) ?? null
                )}
                onCancel={cancelToDetail}
                onSaved={onSaved}
                onCreateSecondary={async (payload) => {
                    if (!selectedType?.id) {
                        throw new Error("Choose an Assignment Category before creating.");
                    }
                    await executeAssignmentAction({
                        action_key: "assignment.create",
                        ...binding,
                        payload: assignmentCreatePayload(subject, {
                            schedule_pattern_id: payload.schedule_pattern_id,
                            start_date: payload.start_date,
                            room_location_id: payload.room_location_id,
                            assignment_type_id: selectedType.id,
                            assignment_type_label: selectedType.label,
                            is_primary: false,
                            supersedes_assignment_id: editingAssignmentId,
                        }),
                    });
                    // onSaved is owned by ScheduleEditor.save so tuition quote can persist first.
                }}
            />
        </div>
    );
}

function AssignmentTypePicker({
    types,
    onPick,
    onCancel,
    onConfigureTypes,
}: {
    types: AssignmentTypeOpt[];
    onPick: (typeId: string) => void;
    onCancel: () => void;
    onConfigureTypes?: () => void;
}) {
    if (types.length === 0) {
        return (
            <div style={{ display: "grid", gap: 12, paddingTop: 4 }} data-assignment-type-picker-empty="true">
                <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: T.forge }}>Assignment Categories needed</div>
                    <p style={{ margin: "4px 0 0", fontSize: 12, color: T.muted, lineHeight: 1.4 }}>
                        Configure Assignment Categories (Primary Classroom, Before Care, Enrichment, and similar)
                        before creating additional assignments. You can return here afterward.
                    </p>
                </div>
                {onConfigureTypes ? (
                    <button
                        type="button"
                        data-configure-assignment-types="true"
                        onClick={onConfigureTypes}
                        style={{
                            all: "unset",
                            cursor: "pointer",
                            background: T.pine,
                            color: "#fff",
                            fontSize: 12.5,
                            fontWeight: 700,
                            padding: "8px 14px",
                            borderRadius: 10,
                            width: "fit-content",
                        }}
                    >
                        Configure Assignment Categories
                    </button>
                ) : null}
                <button type="button" onClick={onCancel} style={{ all: "unset", cursor: "pointer", fontSize: 12, fontWeight: 600, color: T.slate }}>
                    Cancel
                </button>
            </div>
        );
    }

    return (
        <div style={{ display: "grid", gap: 12, paddingTop: 4 }}>
            <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: T.forge }}>What category of assignment is this?</div>
                <p style={{ margin: "4px 0 0", fontSize: 12, color: T.muted, lineHeight: 1.4 }}>
                    Choose an Assignment Category — Primary Classroom, Before Care, Enrichment, and similar.
                </p>
            </div>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
                {types.map((t) => (
                    <li key={t.id}>
                        <button
                            type="button"
                            data-assignment-type-option={t.key ?? t.id}
                            onClick={() => onPick(t.id)}
                            style={{
                                all: "unset",
                                display: "block",
                                width: "100%",
                                boxSizing: "border-box",
                                padding: "10px 12px",
                                borderRadius: 10,
                                border: `1px solid ${T.border}`,
                                background: "var(--alloy-os-fp-card-surface, var(--alloy-os-surface, #fff))",
                                cursor: "pointer",
                                fontSize: 13,
                                fontWeight: 600,
                                color: T.forge,
                            }}
                        >
                            {t.label}
                        </button>
                    </li>
                ))}
            </ul>
            <button type="button" onClick={onCancel} style={{ all: "unset", cursor: "pointer", fontSize: 12, fontWeight: 600, color: T.slate }}>
                Cancel
            </button>
        </div>
    );
}

// ── Shared region composition (identity · state · days · hours · site+room ·
//    effective · billing). ONE layout; Detail and Edit fill the same slots. ────
function IdentityHeader({ child, state }: { child: SchedSubject; state: ScheduleState }) {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <CardAvatar name={child.name} imageUrl={child.imageUrl} size={38} recordId={child.id} />
            <div style={{ display: "grid", gap: 1, minWidth: 0, flex: 1 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: T.forge, lineHeight: 1.15 }}>{child.name}</span>
                {child.dobAge ? <span style={{ fontSize: 11, color: T.muted }}>{child.dobAge}</span> : null}
            </div>
            <StatePill state={state} />
        </div>
    );
}
function StatePill({ state }: { state: ScheduleState }) {
    return (
        <span
            data-schedule-state={state.label}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, background: TONE_BG[state.tone], color: TONE_COLOR[state.tone], fontSize: 10.5, fontWeight: 700, letterSpacing: ".02em", padding: "3px 9px", borderRadius: 999 }}
        >
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: TONE_COLOR[state.tone] }} />
            {state.label}
        </span>
    );
}

/** A calm labeled region — the shared grouping used by every slot. */
function Region({ icon: Icon, label, children }: { icon: typeof CalendarDays; label: string; children: ReactNode }) {
    return (
        <section style={{ display: "grid", gap: 6 }} data-schedule-region={label}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: T.mid40 }}>
                <Icon size={12.5} strokeWidth={2} />
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase" }}>{label}</span>
            </div>
            {children}
        </section>
    );
}

/**
 * Day cells — the schedule itself. Interactive in Edit, static in Detail (same visual).
 * `allowed` (the site's operating days) HIDES non-operating weekdays entirely — closed
 * days are never shown. A day that is already selected but now outside operating days
 * still shows (so it stays removable).
 */
function DayPills({ days, interactive, allowed, onToggle }: { days: number[]; interactive: boolean; allowed?: number[]; onToggle?: (i: number) => void }) {
    // Shared pure logic (unit-tested in tests/scheduling/dayPills.test.ts): operating
    // days only, non-operating hidden, unselected grayed. Detail and Editor render the
    // same set — the operating-days behavior lives in one place, not the component.
    const pills = resolveVisibleDayPills(allowed, days);
    return (
        <div style={{ display: "flex", gap: 5 }}>
            {pills.map((d) => {
                const on = d.selected;
                const style: CSSProperties = {
                    width: 32, height: 32, borderRadius: 9, display: "grid", placeItems: "center",
                    fontSize: 10.5, fontWeight: 600,
                    background: on ? "rgba(0,162,131,.10)" : T.stone,
                    color: on ? T.pine : "#98a2b3",
                    border: on ? "1px solid rgba(0,162,131,.35)" : `1px solid ${T.border}`,
                };
                if (!interactive) {
                    return (
                        <span key={d.weekday} data-day={d.weekday} aria-pressed={on} style={{ ...style, opacity: on ? 1 : 0.55 }}>
                            {d.label}
                        </span>
                    );
                }
                return (
                    <button key={d.weekday} type="button" onClick={() => onToggle?.(d.weekday)} data-day={d.weekday} aria-pressed={on} style={{ ...style, cursor: "pointer" }}>
                        {d.label}
                    </button>
                );
            })}
        </div>
    );
}

/** The billing consequence box — identical treatment in Detail and Edit. */
function BillingConsequence({
    billing,
    tuitionSelect,
}: {
    billing: BillingProjection | null;
    /** Editor-only: embed tuition/$ selection on the assignment (quote lives on the opportunity). */
    tuitionSelect?: ReactNode;
}) {
    const family = billing?.totals ? money(billing.totals.familyResponsibility, billing.totals.recurringFrequency) : null;
    return (
        <div
            style={{
                background: "var(--alloy-os-surface-muted, #f6f8fa)",
                border: `1px solid ${T.border}`,
                borderRadius: 10,
                padding: "9px 12px",
                display: "grid",
                gap: 5,
            }}
            data-schedule-billing="true"
        >
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: T.mid40 }}>
                <Wallet size={12.5} strokeWidth={2} />
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase" }}>
                    {tuitionSelect ? "Tuition" : "Recurring tuition"}
                </span>
            </div>
            {/*
              * ONE MARKER, ONE NODE. This wrapper carried `data-assignment-tuition-embed` as well
              * as the <select> inside it, so a probe reaching for "the embed" got whichever the
              * DOM offered first — a div — and `s.options` was undefined. The region is named for
              * what it is; the control keeps the marker that identifies the control.
              */}
            {tuitionSelect ? <div data-assignment-tuition-region="true">{tuitionSelect}</div> : null}
            {family ? (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700, color: T.forge }}>
                    <span>Family responsibility</span>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>{family}</span>
                </div>
            ) : tuitionSelect ? null : (
                <div style={{ fontSize: 12, color: T.muted, fontStyle: "italic" }}>Pending — becomes final when Billing is configured for this schedule.</div>
            )}
        </div>
    );
}

/**
 * The shared spine. `identity` + the five ordered region slots + a footer. Detail
 * and Edit both render THROUGH this — the regions never diverge structurally.
 */
function ScheduleRegions({
    child,
    state,
    days,
    hours,
    siteRoom,
    effective,
    billing,
    footer,
    surface,
    tuitionSelect,
}: {
    child: SchedSubject;
    state: ScheduleState;
    days: ReactNode;
    hours: ReactNode;
    siteRoom: ReactNode;
    effective: ReactNode;
    billing: BillingProjection | null;
    footer: ReactNode;
    surface: "detail" | "editor";
    tuitionSelect?: ReactNode;
}) {
    return (
        <div
            className="alloy-os-sched-surface"
            style={{ display: "flex", flexDirection: "column", gap: 0, paddingTop: 2, minWidth: 0, minHeight: 0, flex: "1 1 auto" }}
            {...(surface === "detail" ? { "data-schedule-detail": "true" } : { "data-schedule-editor": "true" })}
        >
            <div
                data-schedule-scroll="true"
                className="alloy-os-sched-scroll"
                style={{ display: "grid", gap: 13, minWidth: 0, minHeight: 0, flex: "1 1 auto", paddingBottom: 8 }}
            >
                <IdentityHeader child={child} state={state} />
                {state.sub ? <div style={{ marginTop: -8, fontSize: 11, color: T.muted, paddingLeft: 48 }}>{state.sub}</div> : null}
                <div
                    data-schedule-days-hours-band="true"
                    className="alloy-os-sched-days-hours-band"
                >
                    <Region icon={CalendarDays} label="Days">{days}</Region>
                    <Region icon={Clock} label="Daily hours">{hours}</Region>
                </div>
                <Region icon={DoorOpen} label="Room">{siteRoom}</Region>
                <Region icon={CalendarRange} label="Effective">{effective}</Region>
                <BillingConsequence billing={billing} tuitionSelect={tuitionSelect} />
            </div>
            <div
                data-schedule-footer="true"
                className="alloy-os-sched-footer"
                style={{
                    borderTop: `1px solid ${T.border}`,
                    paddingTop: 12,
                    paddingBottom: 2,
                    background: "var(--alloy-os-fp-card-surface, var(--alloy-os-surface, #fff))",
                }}
            >
                {footer}
            </div>
        </div>
    );
}

// ── Assignment list surface — the list IS the summary (no schedule regions) ─
function AssignmentListSurface({
    child,
    proj,
    assignments,
    onCreate,
    onOpenAssignment,
    listActions,
    dayFilter,
    onDayFilterChange,
}: {
    child: SchedSubject;
    proj: SubjectProj | null;
    assignments: ProjAssignment[];
    onCreate: () => void;
    onOpenAssignment: (id: string) => void;
    listActions?: AssignmentListActions;
    dayFilter?: number | null;
    onDayFilterChange?: (day: number | null) => void;
}) {
    const state = deriveScheduleState(proj);

    return (
        <div data-assignment-list="true" style={{ display: "grid", gap: 12, paddingTop: 2 }}>
            <IdentityHeader child={child} state={state} />
            {state.sub ? (
                <div style={{ marginTop: -8, fontSize: 11, color: T.muted, paddingLeft: 48 }}>{state.sub}</div>
            ) : null}
            <AssignmentSummaryList
                assignments={assignments}
                onOpenAssignment={onOpenAssignment}
                onCreate={onCreate}
                listActions={listActions}
                dayFilter={dayFilter}
                onDayFilterChange={onDayFilterChange}
            />
        </div>
    );
}

// ── The editor — same regions, transformed into controls in place ────────────
function tuitionPlanIdFromTruth(truth: Record<string, unknown> | null | undefined, memberId: string): string {
    if (!truth) return "";
    const bag = truth._enrollment_participation_by_member;
    if (bag && typeof bag === "object" && !Array.isArray(bag)) {
        const row = (bag as Record<string, unknown>)[memberId];
        if (row && typeof row === "object" && !Array.isArray(row)) {
            const id = (row as Record<string, unknown>).tuition_plan_id;
            if (typeof id === "string" && id.trim()) return id.trim();
        }
    }
    return "";
}

function ScheduleEditor({
    child,
    opportunityId,
    proj,
    config,
    truth = null,
    existing,
    mode,
    createAsSecondary = false,
    assignmentTypeLabel = null,
    assignmentTypeBehavior,
    programCategoryId: initialProgramCategoryId = null,
    onCancel,
    onSaved,
    onCreateSecondary,
}: {
    child: SchedSubject;
    opportunityId: string | null;
    proj: SubjectProj | null;
    config: SchedConfig;
    truth?: Record<string, unknown> | null;
    existing: ProjView | null;
    mode: "edit" | "create";
    /** When true, create an independent secondary assignment (not a schedule successor). */
    createAsSecondary?: boolean;
    assignmentTypeLabel?: string | null;
    assignmentTypeBehavior?: AssignmentTypeBehavior;
    /** Real program from assignment/child context (never a hardcoded null) — the room's canonical program overrides this once a room is picked. */
    programCategoryId?: string | null;
    onCancel: () => void;
    onSaved: () => Promise<void>;
    onCreateSecondary?: (payload: {
        schedule_pattern_id: string | null;
        start_date: string;
        room_location_id: string | null;
        assignment_type_label: string;
    }) => Promise<void>;
}) {
    const ex = existing?.assignments[0] ?? null;
    // Site is known from the projection — NO sites fetch, NO editor gate.
    const siteId = proj?.child.siteId ?? "";
    const siteName = proj?.child.siteName ?? "Site";
    // Operating days constrain which weekday pills can be selected (empty ⇒ all seven).
    const allowedDays = allowedPatternWeekdays(config.operatingDays);

    // Edit model initialized SYNCHRONOUSLY from the prebuilt projection.
    const [days, setDays] = useState<number[]>(mode === "edit" && ex?.weekdays.length ? [...ex.weekdays] : []);
    const [arrive, setArrive] = useState(ex?.arriveTime || "");
    const [depart, setDepart] = useState(ex?.departTime || "");
    const [perDayOpen, setPerDayOpen] = useState(false);
    const [perDay, setPerDay] = useState<Record<number, DailyHours>>({});
    const [start, setStart] = useState(mode === "edit" ? existing?.effectiveFrom || "" : "");
    const [end, setEnd] = useState(existing?.effectiveTo || "");
    const [openEnded, setOpenEnded] = useState(existing ? existing.openEnded : true);
    const [scheduleType, setScheduleType] = useState<string | null>(existing?.scheduleType || null);

    const [roomId, setRoomId] = useState<string | null>(ex?.room.id ?? null);
    const [roomName, setRoomName] = useState<string | null>(ex?.room.name ?? null);
    const [roomFromRec, setRoomFromRec] = useState<boolean>(false);
    // Program resolution (pure helpers in assignmentProgramRoomResolution.ts): a room
    // with a canonical program locks the program and shows it read-only; a room with
    // none leaves whatever program was already resolved from context untouched.
    const [programCategoryId, setProgramCategoryId] = useState<string | null>(initialProgramCategoryId);
    const [programFromRoom, setProgramFromRoom] = useState<boolean>(
        programCategoryIdForRoom(config.operationalRooms, roomId) === initialProgramCategoryId
            && initialProgramCategoryId != null
    );
    const [roomPicking, setRoomPicking] = useState(false);
    const [patternPicking, setPatternPicking] = useState(false);

    // Patterns are PRELOADED via first-paint (config.patterns), so the shortcut opens
    // instantly with no "Loading patterns…". A per-site fetch is only a fallback when
    // first-paint carried none. Billing patches in once a schedule type is known.
    const [patterns, setPatterns] = useState<Pattern[] | null>(config.patterns.length ? config.patterns : null);
    const patternsReqRef = useRef<Promise<Pattern[]> | null>(config.patterns.length ? Promise.resolve(config.patterns) : null);
    const [billing, setBilling] = useState<BillingProjection | null>(null);

    // Tuition/$ embedded on the assignment — quote snapshot lives on the opportunity
    // enrollment process (no separate Generate Quote chrome).
    const [offeringId, setOfferingId] = useState(() => tuitionPlanIdFromTruth(truth, child.id));
    const [rateOptions, setRateOptions] = useState<Array<{ id: string; label: string }>>([]);
    /*
     * ── THE CANONICAL VIEW, NOT JUST ITS LABELS ───────────────────────────────────────────────
     *
     * The options were rendered from `assignments[]` and the rest of it thrown away. Accepting a
     * term needs what that view already carries and nothing else can supply: the assignment's own
     * `opportunityCustomerMemberId` (the action's subject) and the `resolutionKey` the operator
     * was actually shown — the service refuses a commit whose resolution has moved on, and that
     * refusal only works if the key travels with the choice.
     *
     * It also carries `accepted`, which is how the surface renders PERSISTED truth rather than
     * the dropdown's own value.
     */
    const [pricingView, setPricingView] = useState<AssignmentTuitionView | null>(null);
    /** Required by the override authority, and never defaulted to something plausible. */
    const [overrideReason, setOverrideReason] = useState("");
    /** The disclosure. Closed by default: the recommendation is the answer most of the time. */
    const [optionsExpanded, setOptionsExpanded] = useState(false);
    /*
     * ── WHAT DISCOUNTS ARE EXPECTED ON THIS RELATIONSHIP ──────────────────────────────────────
     *
     * A projection, not a decision: the route runs the SAME eligibility authority the application
     * path runs, over the accepted tuition for the current period, and writes nothing. Loaded
     * after the accepted term is known — an assignment with no agreed price has no gross to
     * forecast against, and guessing one would answer a question nobody asked.
     */
    const [forecast, setForecast] = useState<{
        grossCents: number; currencyCode: string; periodKey: string; totalCents: number; netCents: number;
        outcomes: Array<Record<string, unknown>>;
    } | null>(null);
    /*
     * ── WHAT SOMEBODY DECIDED DOES NOT APPLY HERE ─────────────────────────────────────────────
     *
     * Read beside the forecast, from the same route, in the same breath. An operator looking at a
     * discount that is not applying needs the decision and its reason, or the surface has told
     * them a policy is missing when in fact a person excluded it.
     */
    type AssignmentException = {
        id: string; policyId: string; policyLabel: string; effectiveStart: string;
        effectiveEnd: string | null; reason: string;
        /** Did this govern the PERIOD the forecast evaluated? A statement about that period. */
        appliesNow: boolean;
        /** Is this still the current record, and still endable, TODAY? A statement about now. */
        isLiveNow: boolean;
        /** Its window has closed. Still readable, still history, no longer a live decision. */
        ended: boolean;
        superseded: boolean;
    };
    const [exceptions, setExceptions] = useState<AssignmentException[]>([]);
    /** Bumped after an exception is authored, so the forecast is re-read rather than guessed at. */
    const [forecastNonce, setForecastNonce] = useState(0);

    useEffect(() => {
        const ocm = pricingView?.opportunityCustomerMemberId;
        if (!ocm || !pricingView?.accepted) { setForecast(null); setExceptions([]); return; }
        let cancelled = false;
        void fetch(`/api/admin/financials/reduction-forecast?opportunity_customer_member_id=${encodeURIComponent(ocm)}`, {
            credentials: "include",
        })
            .then((r) => (r.ok ? r.json() : null))
            .then((b: { forecast?: typeof forecast; exceptions?: AssignmentException[] } | null) => {
                if (cancelled) return;
                setForecast(b?.forecast ?? null);
                setExceptions(b?.exceptions ?? []);
            })
            .catch(() => {
                /* The section states the price without claiming anything about discounts. */
                if (!cancelled) { setForecast(null); setExceptions([]); }
            });
        return () => { cancelled = true; };
    }, [pricingView, forecastNonce]);

    /*
     * ── AUTHORING AN EXCEPTION ────────────────────────────────────────────────────────────────
     *
     * Deliberately not a toggle. The draft exists so the operator states a reason and sees what
     * the decision will MEAN before it is recorded; there is no switch to flip, and no amount to
     * type, because the consequence belongs to eligibility when an obligation is evaluated.
     */
    const [exceptionDraft, setExceptionDraft] = useState<{ policyId: string; policyLabel: string; reason: string } | null>(null);
    const [exceptionBusy, setExceptionBusy] = useState(false);
    const [exceptionError, setExceptionError] = useState<string | null>(null);

    async function commitException(op: "create" | "end", payload: Record<string, unknown>): Promise<void> {
        const ocm = pricingView?.opportunityCustomerMemberId;
        if (!ocm) return;
        setExceptionBusy(true);
        setExceptionError(null);
        try {
            await executeAssignmentAction({
                action_key: op === "create" ? "billing.except_commercial_policy" : "billing.end_commercial_policy_exception",
                entity_type: "opportunity_customer_member",
                entity_id: ocm,
                mode: "execute",
                confirmation: { confirmed: true },
                payload,
            });
            setExceptionDraft(null);
            /* Re-read rather than patch local state: the forecast is the authority on the effect. */
            setForecastNonce((n) => n + 1);
        } catch (e) {
            setExceptionError((e as Error).message);
        } finally {
            setExceptionBusy(false);
        }
    }

    /** Derived from the persisted term, through the authority generation uses. */
    const acceptedPeriods = useMemo(
        () =>
            pricingView?.accepted
                ? acceptedTermBillingPeriods(
                      {
                          cadenceKey: pricingView.accepted.cadenceKey,
                          effectiveStart: pricingView.accepted.effectiveStart,
                          effectiveEnd: pricingView.accepted.effectiveEnd,
                      },
                      new Date().toISOString().slice(0, 10),
                  )
                : null,
        [pricingView],
    );
    /*
     * The recommendation is the default CHOICE, not a default price: the operator accepts it by
     * saving, and the canonical action still decides. Only when nothing has been chosen — an
     * existing accepted selection is never overwritten by a resolver answer.
     */
    useEffect(() => {
        if (!pricingView?.recommended || offeringId.trim()) return;
        setOfferingId(pricingView.recommended.sourceId);
    }, [pricingView, offeringId]);

    /** Everything applicable that is not the recommendation — the disclosure's whole content. */
    const otherOptions = useMemo(() => {
        if (!pricingView) return [];
        const recId = pricingView.recommended?.sourceId ?? null;
        return pricingView.applicable.filter((o) => o.sourceId !== recId);
    }, [pricingView]);

    /*
     * Tuition can be settled on its own when there is something to settle: a selection that is
     * not already the accepted term, or a term whose resolution has moved. Saving the schedule
     * still settles it too — this is the path for an assignment that already exists.
     */
    const canSettleTuitionAlone =
        child.kind === "child" &&
        Boolean(pricingView) &&
        Boolean(offeringId.trim()) &&
        (pricingView?.acceptedIsStale === true || offeringId.trim() !== (pricingView?.accepted?.source?.id ?? ""));

    /* An override is a selection that differs from the resolver's recommendation — never a price. */
    const isOverridingSelection =
        Boolean(offeringId.trim()) &&
        pricingView?.recommended != null &&
        offeringId.trim() !== pricingView.recommended.sourceId;
    /** What the canonical write said. Never optimistic: absent until an action answered. */
    const [tuitionOutcome, setTuitionOutcome] = useState<
        { kind: "accepted" | "overridden"; label: string } | { kind: "needs_attention"; detail: string } | null
    >(null);
    /*
     * ── RESPONSIBILITY, THE SAME AUTHORITY FINANCIALS USES ────────────────────────────────────
     *
     * Assignment is where a commercial relationship is set up, so it is where an operator expects
     * to say who will owe for it. That must not become a second responsibility record: this mounts
     * the SAME panel Financials Details mounts, over the same
     * `billing.configure_responsibility` action, and the assignment stores nothing of its own.
     *
     * Assignment holds a child and no household id, so the scopes read resolves the household from
     * the member — one place that knows how, not two.
     */
    const [responsibilityOpen, setResponsibilityOpen] = useState(false);
    const [household, setHousehold] = useState<{
        customerId: string | null;
        members: { customerMemberId: string; label: string }[];
    } | null>(null);

    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    /*
     * ── THE OPTIONS BELONG TO THIS ASSIGNMENT, NOT TO THE HOUSEHOLD ────────────────────────────
     *
     * MEASURED on the mounted product: editing Certa's assignment offered
     *
     *     Best match — Certa Certhouse: $185.00/weekly
     *     Certb Certhouse: $1,450.00/monthly
     *
     * while Certa's own `applicable` list contained exactly ONE option. The list was built from
     * `enrollments`, which is one row per assignment across the whole OPPORTUNITY, ranked so the
     * matching child floated to the top — every sibling's price stayed selectable underneath, and
     * the ranking was done by substring-matching the child's display name.
     *
     * Choosing the sibling's rate was worse than confusing. `POST /assignment-quote` resolves
     * `view.applicable.find(o => o.sourceId === selected) ?? view.recommended`, so a rate that is
     * not applicable to THIS assignment silently becomes the recommendation — the operator's
     * explicit choice discarded without a word, on a control that sets a family's price.
     *
     * The canonical per-assignment view already answers this: `assignments[]` carries
     * `customerMemberId`, the recommendation and every applicable option. Match the child exactly,
     * and offer that assignment's options labelled by the OPTION rather than by a child's name —
     * the operator is pricing one child and does not need to be told which one in every row.
     *
     * No fallback to the legacy shape. `FinancialConfigEnrollment` carries no member id, so the
     * only way to guess is the name match that caused this; offering nothing is better than
     * offering a price that belongs to somebody else.
     */
    useEffect(() => {
        if (!opportunityId) return;
        let cancelled = false;
        loadFinancialConfig(opportunityId)
            .then((payload) => {
                if (cancelled) return;
                const view = (payload?.assignments ?? []).find((v) => v.customerMemberId === child.id);
                if (!view) return;
                setPricingView(view);
                const recommendedId = view.recommended?.sourceId ?? null;
                const opts = [...view.applicable]
                    // The recommendation first; the rest keep the resolver's own order.
                    .sort((a, b) =>
                        (a.sourceId === recommendedId ? 0 : 1) - (b.sourceId === recommendedId ? 0 : 1),
                    )
                    .map((o) => {
                        /*
                         * The variant names the commitment ("Full time"), and an option can have
                         * none — measured: the sole applicable option here carried an empty
                         * `variantLabel`, which rendered "Recommended — : $185.00/weekly". The
                         * money is the part that is always there, so the name qualifies it only
                         * when there is a name.
                         */
                        const variant = (o.variantLabel ?? "").trim();
                        const what = variant ? `${variant}: ${o.amountLabel}` : o.amountLabel;
                        return {
                            id: o.sourceId,
                            label: o.sourceId === recommendedId ? `Recommended — ${what}` : what,
                        };
                    });
                if (opts.length) setRateOptions(opts);
            })
            .catch(() => {
                /* optional — operator still selects an explicit plan before lock-in */
            });
        return () => {
            cancelled = true;
        };
    }, [opportunityId, child.id]);

    useEffect(() => {
        /*
         * OPENING IS NOT AUTHORING. This reads who the household is and what is already in force;
         * nothing is written because a panel was opened. The operator confirms, or nothing changed.
         */
        if (!responsibilityOpen || household || child.kind !== "child") return;
        let cancelled = false;
        void fetch(
            `/api/admin/financials/responsibility-scopes?customer_member_id=${encodeURIComponent(child.id)}`,
            { credentials: "include" },
        )
            .then((r) => (r.ok ? r.json() : null))
            .then((b: { customerId?: string | null; members?: { customerMemberId: string; label: string }[] } | null) => {
                if (cancelled || !b) return;
                setHousehold({ customerId: b.customerId ?? null, members: b.members ?? [] });
            })
            .catch(() => {
                /* The card says it could not look, rather than offering an empty household. */
                if (!cancelled) setHousehold({ customerId: null, members: [] });
            });
        return () => {
            cancelled = true;
        };
    }, [responsibilityOpen, household, child.kind, child.id]);

    /** Resolve site patterns once (preloaded if first-paint carried them). */
    const ensurePatterns = useCallback((): Promise<Pattern[]> => {
        if (patternsReqRef.current) return patternsReqRef.current;
        const p = (async () => {
            if (!siteId) return [];
            const overview = await schedApi(`?view=overview&site_location_id=${encodeURIComponent(siteId)}`).catch(() => null);
            const ps = (overview?.patterns as Pattern[]) ?? [];
            setPatterns(ps);
            return ps;
        })();
        patternsReqRef.current = p;
        return p;
    }, [siteId]);

    function openPatternPicker() {
        setPatternPicking((v) => !v);
        void ensurePatterns();
    }

    /*
     * Background: billing preview once a schedule type is known (patches the tuition line).
     *
     * CHILD ONLY, and this is the clearest case of child-only ENRICHMENT staying child-only. Tuition
     * is what a family pays for a child's place; a staff member's assignment has no tuition, and the
     * route's parameter is literally `customer_member_id`. Asking for a staff member would either
     * fail or — worse — resolve against some other member and show an operator a number.
     */
    useEffect(() => {
        if (!siteId || !scheduleType || child.kind !== "child") return;
        let cancelled = false;
        (async () => {
            const bill = await schedApi(
                `?view=billing&site_location_id=${encodeURIComponent(siteId)}&customer_member_id=${encodeURIComponent(child.id)}&schedule_type=${encodeURIComponent(scheduleType)}${start ? `&start_date=${start}` : ""}`
            ).catch(() => null);
            if (!cancelled) setBilling(bill?.projection ?? null);
        })();
        return () => {
            cancelled = true;
        };
    }, [siteId, scheduleType, start, child.id, child.kind]);

    function toggleDay(i: number) {
        // Cannot add a day the site is not open (operating days); removal is always allowed.
        setDays((d) => (d.includes(i) ? d.filter((x) => x !== i) : allowedDays.includes(i) ? [...d, i].sort((a, b) => a - b) : d));
    }
    function applyPattern(p: Pattern) {
        // A pattern sets the whole schedule, but never onto a day the site is closed.
        setDays(p.weekdays.filter((d) => allowedDays.includes(d)));
        if (p.defaultHours) {
            setArrive(p.defaultHours.arrive);
            setDepart(p.defaultHours.depart);
        }
        setScheduleType(p.scheduleTypeKey);
        setPatternPicking(false);
    }

    function resolvePatternId(): string | null {
        if (!patterns) return null;
        return patterns.find((p) => p.scheduleTypeKey === scheduleType)?.id ?? patterns[0]?.id ?? null;
    }
    const patternId = resolvePatternId();
    const state = deriveScheduleState(proj) ;
    const editState: ScheduleState =
        mode === "create" && createAsSecondary
            ? {
                  label: assignmentTypeLabel ? `New · ${assignmentTypeLabel}` : "New assignment",
                  tone: "blue",
                  sub: "Independent commitment",
              }
            : mode === "create" && !existing
              ? { label: "New schedule", tone: "blue", sub: null }
              : { ...state, sub: null };
    const roomReq =
        assignmentTypeBehavior?.roomRequirement ??
        (assignmentTypeBehavior?.requiresRoom ? "required" : "optional");
    // Schedules that use operational space always require a room. Category
    // "optional" still presents a required pick here; only `not_used` skips Room.
    const roomRequired = roomReq !== "not_used";
    const programReq =
        assignmentTypeBehavior?.programRequirement ??
        (assignmentTypeBehavior?.requiresProgram ? "required" : "optional");
    const programUsed = programReq !== "not_used";
    // Room prominence remains, but Category may not require space (Transportation, some Enrichment).
    const canSave =
        days.length > 0 &&
        !!start &&
        (!arrive || !depart || depart > arrive) &&
        (!createAsSecondary || Boolean(assignmentTypeLabel)) &&
        (!roomRequired || Boolean(roomId));

    /**
     * ── THE CANONICAL COMMERCIAL TERM ─────────────────────────────────────────────────────────
     *
     * This is what the snapshot below is NOT. `POST /assignment-quote` records an ESTIMATE on the
     * process instance and drives workflow projection; it writes no `enrollment_pricing_terms`
     * row and never did. What a family has agreed is an effective-dated term, and the only two
     * writers of one are `enrollment.pricing.accept` and `.override`.
     *
     * So the Assignment surface asks the same registered action the AssignmentTuitionCard asks.
     * There is no second writer, no assignment-owned price column, and no amount in this payload:
     * the service re-reads the assignment from its owners and takes the money from the catalog.
     * A browser-authored figure has nowhere to go here, deliberately.
     *
     * `resolutionKey` travels with the choice because the service refuses a commit whose
     * resolution has moved since the operator looked — the whole point of which is lost if the
     * caller sends a fresh one.
     */
    async function acceptAssignmentTuition(): Promise<
        { ok: true; state: string; label: string } | { ok: false; detail: string }
    > {
        const view = pricingView;
        const selected = offeringId.trim();
        if (!view || !selected) return { ok: false, detail: "No tuition option was selected." };
        const option = view.applicable.find((o) => o.sourceId === selected);
        /*
         * AN UNKNOWN SELECTION IS A REFUSAL, NOT A FALLBACK. The snapshot route resolves an
         * unmatched id to the recommendation, which silently discards what the operator chose;
         * the canonical path must never do that.
         */
        if (!option) return { ok: false, detail: "That tuition option no longer applies to this assignment." };
        const isOverride = view.recommended != null && option.sourceId !== view.recommended.sourceId;

        const res = await fetch("/api/admin/actions/execute", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                action_key: isOverride ? "enrollment.pricing.override" : "enrollment.pricing.accept",
                entity_type: "opportunity_customer_member",
                entity_id: view.opportunityCustomerMemberId,
                mode: "execute",
                confirmation: { confirmed: true },
                payload: {
                    opportunity_customer_member_id: view.opportunityCustomerMemberId,
                    resolution_key: view.resolutionKey,
                    selected_source_id: option.sourceId,
                    /*
                     * NO CADENCE FILTER. `assignmentResolutionKey` hashes `cad:${facts.cadenceKey}`,
                     * and the view this choice came from resolved with NO cadence constraint —
                     * `facts.cadenceKey` was null. Sending the chosen option's cadence made the
                     * service re-resolve against different facts, producing a different key, and
                     * every accept and override answered `stale_resolution`: "This assignment has
                     * changed since the tuition was resolved", about an assignment that had not
                     * changed. The commit must re-resolve the way the view did, or the key it is
                     * checking against is meaningless.
                     *
                     * The cadence is not lost: it comes from the selected option's own rate, which
                     * is where the term takes it from anyway.
                     */
                    /* Override requires its own reason; the action refuses without one. */
                    ...(isOverride ? { override_reason: overrideReason.trim() } : {}),
                    /*
                     * SUPERSEDE, WHEN THERE IS SOMETHING TO SUPERSEDE.
                     *
                     * A live term on the same effective date makes the service refuse with
                     * `term_already_accepted` unless the caller says it means to replace it — and
                     * that refusal is right: re-accepting the identical decision is idempotent,
                     * but a DIFFERENT decision silently overwriting a standing agreement would
                     * not be. Resolving a review is exactly the deliberate case, so the intent is
                     * stated. The service supersedes by succession, closing the old term rather
                     * than editing it, so history survives.
                     */
                    supersede: Boolean(view.accepted),
                },
            }),
        });
        const json = (await res.json().catch(() => ({}))) as {
            error?: unknown;
            message?: unknown;
            blockers?: Array<{ message?: string }>;
            result?: { term?: { state?: string; amount_cents?: number; cadence_key?: string } };
        };
        if (!res.ok) {
            /*
             * THE REFUSAL HAS TO BE READABLE. `error` is a structured object on this runtime, so
             * rendering it straight put "[object Object]" where the reason belonged — the
             * operator was told tuition needed attention and not one word about why.
             */
            const say = (v: unknown): string | null => {
                if (typeof v === "string" && v.trim()) return v.trim();
                if (v && typeof v === "object") {
                    const o = v as { message?: unknown; detail?: unknown; code?: unknown };
                    return (
                        (typeof o.message === "string" && o.message)
                        || (typeof o.detail === "string" && o.detail)
                        || (typeof o.code === "string" && o.code)
                        || null
                    );
                }
                return null;
            };
            const detail =
                say(json.error)
                ?? say(json.message)
                ?? json.blockers?.map((b) => b.message).filter(Boolean).join("; ")
                ?? `Refused (${res.status}).`;
            return { ok: false, detail: detail || `Refused (${res.status}).` };
        }
        const term = json.result?.term;
        return {
            ok: true,
            state: term?.state ?? (isOverride ? "overridden" : "accepted"),
            label: term?.amount_cents != null ? `${(term.amount_cents / 100).toFixed(2)} ${term.cadence_key ?? ""}`.trim() : option.amountLabel,
        };
    }

    /**
     * ── TWO CANONICAL ACTS, REPORTED SEPARATELY ───────────────────────────────────────────────
     *
     * The assignment exists by the time this runs, and it stays existing. Tuition acceptance is
     * its own act against its own authority and can refuse for reasons that say nothing about the
     * schedule — a resolution that moved, an option withdrawn, a cadence the platform cannot
     * bill. Rolling the assignment back to keep the pair atomic would destroy real work to
     * preserve a tidiness the domain never claimed.
     *
     * So a failure here is REPORTED, not raised: the operator is told the assignment was created
     * and tuition needs attention, and the missing step is the only thing to retry. Retrying
     * converges through the service's own idempotency — a live term for the same assignment on
     * the same effective date is recognised rather than duplicated — so no workflow-level
     * idempotency authority is invented here.
     */
    async function settleTuition(): Promise<void> {
        if (!offeringId.trim() || child.kind !== "child") return;
        try {
            const outcome = await acceptAssignmentTuition();
            if (outcome.ok) {
                setTuitionOutcome({
                    kind: outcome.state === "overridden" ? "overridden" : "accepted",
                    label: outcome.label,
                });
                /* Persisted truth is re-read; the dropdown's value is not the answer. */
                await refreshPricingView();
            } else {
                setTuitionOutcome({ kind: "needs_attention", detail: outcome.detail });
            }
        } catch (e) {
            setTuitionOutcome({
                kind: "needs_attention",
                detail: e instanceof Error ? e.message : "Tuition could not be accepted.",
            });
        }
    }

    /**
     * Re-read the canonical view, so what is shown is what was persisted.
     *
     * ── THROUGH THE SEAM, NOT AROUND IT ──────────────────────────────────────────────────────
     *
     * This read its own `fetch` with `cache: "no-store"`, which got the freshness it needed by
     * leaving the one-request-per-opportunity loader every other consumer shares. Two readers of
     * one endpoint is how a panel comes to show two answers for the same family, and the extra
     * request lands on every accept and override.
     *
     * Retiring the entry and loading through the loader gets the same freshness with one reader:
     * the invalidation is exactly what a mutation is supposed to do to a cached configuration.
     */
    async function refreshPricingView(): Promise<void> {
        if (!opportunityId) return;
        try {
            invalidateFinancialConfig(opportunityId);
            const body = await loadFinancialConfig(opportunityId);
            const view = ((body.assignments ?? []) as AssignmentTuitionView[]).find((v) => v.customerMemberId === child.id);
            if (view) setPricingView(view);
        } catch {
            /* The card keeps the last canonical answer rather than inventing a fresher one. */
        }
    }

    async function persistAssignmentQuote(): Promise<void> {
        // Child enrichment, on a case. A tuition quote is a commercial fact about a family's
        // enrollment; a staff assignment produces none, and there is no opportunity to hang one on.
        if (!opportunityId || child.kind !== "child") return;
        const lockedOfferingId = offeringId.trim();
        // Require an explicit lock-in — never persist via silent auto-match.
        if (!lockedOfferingId) return;
        const res = await fetch("/api/admin/enrollment/assignment-quote", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                customer_member_id: child.id,
                opportunity_id: opportunityId,
                offering_id: lockedOfferingId,
            }),
        });
        if (!res.ok) {
            const json = (await res.json().catch(() => ({}))) as { error?: string };
            // Schedule already saved — surface quote failure without rolling back.
            throw new Error(json.error ?? "Tuition quote could not be saved on the opportunity.");
        }
    }

    async function save() {
        setBusy(true);
        setError(null);
        try {
            let pid = patternId;
            if (!pid) {
                // Patterns weren't opened — resolve the id lazily now (single shared load).
                const ps = await ensurePatterns();
                pid = ps.find((p) => p.scheduleTypeKey === scheduleType)?.id ?? ps[0]?.id ?? null;
            }
            if (createAsSecondary && onCreateSecondary) {
                if (!pid) {
                    setError("Choose a schedule pattern before saving this assignment.");
                    setBusy(false);
                    return;
                }
                await onCreateSecondary({
                    schedule_pattern_id: pid,
                    start_date: start,
                    room_location_id: roomId || null,
                    assignment_type_label: assignmentTypeLabel || "Assignment",
                });
                await persistAssignmentQuote().catch(() => {
                    /* schedule write succeeded — quote is opportunistic on opportunity */
                });
                await settleTuition();
                await onSaved();
                return;
            }
            /*
             * THE CHILD PRIMARY-HOME PATH.
             *
             * Reached only when `createAsSecondary` is false, which `beginCreateAssignment` now
             * allows solely for a child (`canUseChildSchedulePath`). The guard is restated here
             * rather than trusted from a caller two functions away, because the failure it prevents
             * is silent: this route reads `customer_member_id`, and a staff subject would send its
             * PERSON id in that field — an id the route would accept the shape of.
             */
            if (child.kind !== "child") {
                setError("A staff assignment is created from an Assignment Category, not the primary schedule.");
                return;
            }
            const times = {
                default: arrive && depart && depart > arrive ? { arrive, depart } : null,
                perDay: perDayOpen
                    ? Object.fromEntries(Object.entries(perDay).filter(([k, v]) => days.includes(Number(k)) && v.arrive && v.depart && v.depart > v.arrive))
                    : {},
            };
            await schedApi("", {
                method: "POST",
                body: JSON.stringify({
                    customer_member_id: child.id,
                    person_id: child.personId,
                    opportunity_id: opportunityId,
                    schedule_pattern_id: pid,
                    room_location_id: roomId,
                    start_date: start || null,
                    end_date: openEnded ? null : end || null,
                    weekdays: days,
                    times,
                    site_location_id: siteId,
                    // Effective-dated intent: Create makes the next schedule; Edit changes the current.
                    change_kind: mode === "create" && existing ? "successor" : "current",
                }),
            });
            await persistAssignmentQuote().catch(() => {
                /* schedule write succeeded — quote is opportunistic on opportunity */
            });
            await settleTuition();
            await onSaved();
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(false);
        }
    }

    if (roomPicking) {
        return (
            <RoomPicker
                siteId={siteId}
                childId={child.id}
                patternId={patternId}
                start={start}
                selectedRoomId={roomId}
                seedRooms={config.operationalRooms}
                purposeBehavior={assignmentTypeBehavior}
                programCategoryId={programCategoryId}
                onProgramResolved={(resolvedProgramCategoryId) => {
                    setProgramCategoryId(resolvedProgramCategoryId);
                    setProgramFromRoom(false);
                }}
                onPick={(id, name, recommended) => {
                    setRoomId(id);
                    setRoomName(name);
                    setRoomFromRec(recommended);
                    const resolved = resolveProgramOnRoomChange({
                        rooms: config.operationalRooms,
                        roomId: id,
                        priorProgramCategoryId: programCategoryId,
                    });
                    setProgramCategoryId(resolved.programCategoryId);
                    setProgramFromRoom(resolved.programFromRoom);
                    setRoomPicking(false);
                }}
                onCancel={() => setRoomPicking(false)}
            />
        );
    }

    return (
        <>
            {error && <div style={{ marginBottom: 10 }}><ErrorNote message={error} /></div>}
            <ScheduleRegions
                surface="editor"
                child={child}
                state={editState}
                billing={billing}
                tuitionSelect={
                    opportunityId ? (
                        <div style={{ display: "grid", gap: 4 }}>
                            <label
                                htmlFor={`assignment-tuition-embed-${child.id}`}
                                style={{ fontSize: 11, fontWeight: 650, color: T.slate }}
                            >
                                Tuition — {child.name}
                            </label>
                            {/*
                              * ── RECOMMENDED FIRST; THE REST BEHIND A DISCLOSURE ─────────────
                              *
                              * The resolver names one option or declines to. When it names one,
                              * that is what the operator sees and what saving accepts — the other
                              * legitimate options are a click away rather than a list to read.
                              * When it declines, there is no "Recommended" heading to manufacture:
                              * equally-configured options are the operator's choice to settle, and
                              * the tied set is named here rather than deferred to another card.
                              *
                              * The disclosure is absent when there is nothing behind it.
                              */}
                            {pricingView?.recommended && !optionsExpanded ? (
                                <div data-assignment-tuition-recommended={pricingView.recommended.sourceId}
                                     style={{ fontSize: 12, color: T.forge, fontWeight: 600 }}>
                                    Recommended · {pricingView.recommended.amountLabel}
                                </div>
                            ) : null}
                            {pricingView && pricingView.state === "ambiguous" ? (
                                <div data-assignment-tuition-ambiguous="true" style={{ fontSize: 11, color: T.ember }}>
                                    {pricingView.tied.length} configured options apply equally — choose one.
                                    {pricingView.tied.length > 0 ? (
                                        <span data-assignment-tuition-tied="true" style={{ display: "block", color: T.slate, fontWeight: 400 }}>
                                            {pricingView.tied.map((o) => o.amountLabel).join(" · ")}
                                        </span>
                                    ) : null}
                                </div>
                            ) : null}

                            {/*
                              * ── WHY NOTHING APPLIES ──────────────────────────────────────────
                              *
                              * An assignment with no priceable option is the state an operator is
                              * most likely to misread as a broken screen. The resolution already
                              * carries its own reason, and this states it — a surface that renders
                              * an empty option list and says nothing has told the operator that
                              * tuition is missing, which is a different and wrong claim.
                              */}
                            {pricingView && pricingView.state === "no_match" ? (
                                <div data-assignment-tuition-no-match={pricingView.noMatchReason ?? "unknown"}
                                     style={{ fontSize: 11, color: T.ember }}>
                                    No authored tuition applies to this assignment
                                    {pricingView.noMatchReason ? ` — ${pricingView.noMatchReason.replace(/_/g, " ")}` : ""}.
                                </div>
                            ) : null}

                            {/*
                              * ── WHAT WAS CONSIDERED AND REJECTED, AND WHY ────────────────────
                              *
                              * The diagnostic that used to live on the standalone card. It answers
                              * the question an operator asks next — "there IS a rate for this
                              * program, why isn't it here?" — with the resolution's own reason for
                              * each option it set aside. Quiet and closed by default: it matters
                              * when the answer is surprising, and not before.
                              */}
                            {pricingView && pricingView.rejected.length > 0 ? (
                                <details data-assignment-tuition-rejected={String(pricingView.rejected.length)}
                                         style={{ fontSize: 11, color: T.mid40 }}>
                                    <summary style={{ cursor: "pointer" }}>
                                        {pricingView.rejected.length} option{pricingView.rejected.length === 1 ? "" : "s"} did not apply
                                    </summary>
                                    <ul style={{ margin: "4px 0 0", paddingLeft: 16 }}>
                                        {pricingView.rejected.map((r) => (
                                            <li key={r.sourceId} data-assignment-tuition-rejected-reason={r.reason}>
                                                {r.detail || r.reason.replace(/_/g, " ")}
                                            </li>
                                        ))}
                                    </ul>
                                </details>
                            ) : null}
                            {pricingView?.recommended && !optionsExpanded && otherOptions.length > 0 ? (
                                <button
                                    type="button"
                                    onClick={() => setOptionsExpanded(true)}
                                    data-assignment-tuition-expand="true"
                                    style={{ all: "unset", cursor: "pointer", fontSize: 11, fontWeight: 600, color: T.pine, width: "fit-content" }}
                                >
                                    Expand options ({otherOptions.length} other)
                                </button>
                            ) : null}
                            <select
                                hidden={Boolean(pricingView?.recommended) && !optionsExpanded}
                                id={`assignment-tuition-embed-${child.id}`}
                                value={offeringId}
                                data-assignment-tuition-plan={child.id}
                                data-assignment-tuition-embed="true"
                                onChange={(e) => setOfferingId(e.target.value)}
                                style={{
                                    padding: "6px 8px",
                                    fontSize: 13,
                                    borderRadius: 6,
                                    border: `1px solid ${T.border}`,
                                    color: T.forge,
                                    background: "#fff",
                                    width: "100%",
                                    maxWidth: "100%",
                                }}
                            >
                                <option value="">Select a plan to lock in…</option>
                                {/*
                                 * The label already says which option is the recommendation, because
                                 * only the resolver knows — an index prefix asserted it from list
                                 * position, which is true only while a recommendation exists.
                                 */}
                                {rateOptions.map((r) => (
                                    <option key={r.id} value={r.id}>
                                        {r.label}
                                    </option>
                                ))}
                            </select>
                            <div style={{ fontSize: 10.5, color: T.mid40 }}>
                                The recommendation uses room, program, and schedule. Every option
                                here applies to this assignment; selecting one locks it onto the
                                enrollment opportunity.
                            </div>

                            {/*
                              * ── WHAT IS ACTUALLY AGREED, FROM THE PERSISTED TERM ────────────
                              *
                              * Not the dropdown's value, which is a selection and not an
                              * agreement. This reads `accepted` off the canonical view, which is
                              * the same row recurring generation bills from — so if the two ever
                              * disagreed, this line would be the one that changed.
                              */}
                            {pricingView?.accepted ? (
                                <div
                                    style={{ fontSize: 11, color: T.slate, marginTop: 2 }}
                                    data-assignment-accepted-term={pricingView.accepted.state}
                                    data-assignment-accepted-cadence={pricingView.accepted.cadenceKey}
                                >
                                    <strong style={{ fontWeight: 650 }}>
                                        {pricingView.accepted.state === "overridden" ? "Overridden" : "Accepted"}
                                    </strong>{" "}
                                    {(pricingView.accepted.amountCents / 100).toLocaleString(undefined, {
                                        style: "currency",
                                        currency: pricingView.accepted.currencyCode || "USD",
                                    })}
                                    {" / "}
                                    {pricingView.accepted.cadenceKey}
                                    {" · from "}
                                    {pricingView.accepted.effectiveStart}
                                    {pricingView.accepted.overrideReason ? ` · ${pricingView.accepted.overrideReason}` : ""}
                                </div>
                            ) : null}

                            {/*
                              * ── THE ASSIGNMENT SAYS WHICH PERIODS IT WILL BE BILLED IN ──────
                              *
                              * Derived, never stored and never configured: the accepted cadence
                              * and the agreement anchor decide it, through the one authority that
                              * decides it for generation too. No accepted term means no period —
                              * an invented one would be a promise about money nobody has agreed.
                              */}
                            {acceptedPeriods ? (
                                <div
                                    style={{ fontSize: 11, color: T.mid40, marginTop: 2 }}
                                    data-assignment-billing-frequency={pricingView?.accepted?.cadenceKey ?? ""}
                                    data-assignment-billing-period={acceptedPeriods.current.key}
                                    data-assignment-next-billing-period={acceptedPeriods.next.key}
                                >
                                    Billing frequency {pricingView?.accepted?.cadenceKey} · current period{" "}
                                    {acceptedPeriods.current.label} · next {acceptedPeriods.next.label}
                                </div>
                            ) : null}

                            {/*
                              * ── WHAT IS EXPECTED TO REDUCE IT ───────────────────────────────
                              *
                              * Compact, and only about policies that have something to say for
                              * THIS relationship: a configuration list would tell the operator
                              * about discounts other families get. The reasons are the domain's
                              * own — `not_enough_siblings`, `category_not_discountable` — because
                              * a second vocabulary invented in the surface would disagree with
                              * the ledger the first time the two were compared.
                              *
                              * Read-only. This writes no reduction and no charge; the ledger is
                              * still where a discount becomes real.
                              */}
                            {forecast && (forecast.outcomes.length > 0 || exceptions.length > 0) ? (
                                <div style={{ marginTop: 4 }} data-assignment-discount-forecast="true">
                                    <div style={{ fontSize: 10, fontWeight: 650, letterSpacing: "0.04em", color: T.mid40 }}>
                                        DISCOUNTS
                                    </div>
                                    {forecast.outcomes.map((o, i) => {
                                        const kind = String(o.kind);
                                        if (kind === "expected") {
                                            const cents = Number(o.amountCents ?? 0);
                                            const policyId = String(o.policyId ?? "");
                                            const label = String(o.label ?? "Discount");
                                            return (
                                                <div key={i} style={{ fontSize: 11, color: T.slate, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "baseline" }}
                                                     data-forecast-outcome="expected" data-forecast-policy={policyId}>
                                                    <span>
                                                        {label} ·{" "}
                                                        {(Math.abs(cents) / 100).toLocaleString(undefined, {
                                                            style: "currency",
                                                            currency: forecast.currencyCode || "USD",
                                                        })}{" "}
                                                        expected to apply
                                                    </span>
                                                    {/*
                                                      * THE EXCEPTIONAL ACTION, KEPT QUIET. It sits beside the
                                                      * policy it acts on rather than in a picker, so the operator
                                                      * never has to identify the policy a second time — and it is
                                                      * a link, not a toggle, because excepting a family from
                                                      * commercial policy is a decision someone makes, not a
                                                      * setting this assignment owns.
                                                      */}
                                                    {policyId && !exceptionDraft ? (
                                                        <button type="button" data-add-policy-exception={policyId}
                                                                onClick={() => { setExceptionError(null); setExceptionDraft({ policyId, policyLabel: label, reason: "" }); }}
                                                                style={{ background: "none", border: "none", padding: 0, fontSize: 11, color: T.blue, textDecoration: "underline", cursor: "pointer" }}>
                                                            Add exception
                                                        </button>
                                                    ) : null}
                                                </div>
                                            );
                                        }
                                        const reason = String(o.reason ?? "");
                                        return (
                                            <div key={i} style={{ fontSize: 11, color: T.mid40 }} data-forecast-outcome={kind}
                                                 data-forecast-reason={reason}>
                                                {REDUCTION_REASON_LABEL[reason] ?? reason.replace(/_/g, " ")}
                                            </div>
                                        );
                                    })}

                                    {/*
                                      * ── WHAT IS EXCLUDED, AND WHY ───────────────────────────
                                      *
                                      * The decision is shown with the reason its author gave. An
                                      * exception that has not started yet, or has ended, is still
                                      * listed — as history, dated — because the question an
                                      * operator asks here is "what did we agree", and hiding the
                                      * ones not in force today answers a narrower one.
                                      */}
                                    {exceptions.filter((e) => !e.superseded).map((e) => (
                                        <div key={e.id} style={{ fontSize: 11, color: e.appliesNow ? T.slate : T.mid40, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "baseline" }}
                                             data-policy-exception={e.policyId}
                                             data-exception-applies={String(e.appliesNow)}
                                             data-exception-live={String(e.isLiveNow)}>
                                            <span>
                                                {e.policyLabel} ·{" "}
                                                {e.ended
                                                    ? `ended ${e.effectiveEnd}`
                                                    : e.appliesNow
                                                      ? "excluded for this assignment"
                                                      : `excluded from ${e.effectiveStart}`}
                                                {!e.ended && e.effectiveEnd ? ` until ${e.effectiveEnd}` : ""} — {e.reason}
                                            </span>
                                            {/*
                                              * ── ENDABLE IS ABOUT NOW, NOT ABOUT THE PERIOD ───
                                              *
                                              * This asked `appliesNow`, which answers "did it
                                              * govern the period the forecast evaluated". An
                                              * exception ended today, whose window began on the
                                              * 1st, answers yes to that and is not endable — so
                                              * the card offered to end something already ended.
                                              * The lifecycle question is `isLiveNow`, and the
                                              * server answers it; nothing about it is computed
                                              * here.
                                              */}
                                            {e.isLiveNow ? (
                                                <button type="button" data-end-policy-exception={e.id} disabled={exceptionBusy}
                                                        onClick={() => void commitException("end", { exception_id: e.id })}
                                                        style={{ background: "none", border: "none", padding: 0, fontSize: 11, color: T.blue, textDecoration: "underline", cursor: "pointer" }}>
                                                    End exception
                                                </button>
                                            ) : (
                                                <span data-exception-ended="true" style={{ color: T.mid40 }}>Ended</span>
                                            )}
                                        </div>
                                    ))}

                                    {/*
                                      * ── THE DRAFT: SAY WHY, THEN SEE WHAT IT MEANS ──────────
                                      *
                                      * Reason first and required — the action refuses without one,
                                      * so the surface must not pretend otherwise. What follows the
                                      * reason is a statement about APPLICABILITY and deliberately
                                      * quotes no figure: what the exclusion is worth is decided by
                                      * eligibility when a real obligation is evaluated, and a
                                      * number promised here is the one the operator would
                                      * remember.
                                      */}
                                    {exceptionDraft ? (
                                        <div style={{ marginTop: 6, padding: 8, background: T.stone, borderRadius: 6 }} data-policy-exception-draft={exceptionDraft.policyId}>
                                            <div style={{ fontSize: 11, color: T.ink, fontWeight: 600 }}>
                                                Exclude {exceptionDraft.policyLabel} from this assignment
                                            </div>
                                            <label style={{ display: "block", fontSize: 10, color: T.mid40, marginTop: 6 }} htmlFor="policy-exception-reason">
                                                WHY (REQUIRED)
                                            </label>
                                            <input id="policy-exception-reason" data-policy-exception-reason="true" value={exceptionDraft.reason}
                                                   onChange={(ev) => setExceptionDraft({ ...exceptionDraft, reason: ev.target.value })}
                                                   placeholder="The decision, and who made it"
                                                   style={{ width: "100%", fontSize: 11, padding: "4px 6px", border: `1px solid ${T.border}`, borderRadius: 4 }} />
                                            <div style={{ fontSize: 11, color: T.slate, marginTop: 6 }} data-policy-exception-preview="true">
                                                This policy will not apply to obligations for this assignment from today onward.
                                                Anything already posted keeps the terms it was posted under.
                                            </div>
                                            {exceptionError ? (
                                                <div style={{ fontSize: 11, color: T.ember, marginTop: 6 }} data-policy-exception-error="true">{exceptionError}</div>
                                            ) : null}
                                            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                                                <button type="button" data-policy-exception-confirm="true"
                                                        disabled={exceptionBusy || exceptionDraft.reason.trim().length === 0}
                                                        onClick={() => void commitException("create", {
                                                            policy_id: exceptionDraft.policyId,
                                                            reason: exceptionDraft.reason.trim(),
                                                            effective_start: new Date().toISOString().slice(0, 10),
                                                        })}
                                                        style={{ fontSize: 11, padding: "4px 10px", borderRadius: 4, border: "none", background: T.forge, color: "#fff",
                                                                 cursor: exceptionBusy || !exceptionDraft.reason.trim() ? "not-allowed" : "pointer",
                                                                 opacity: exceptionBusy || !exceptionDraft.reason.trim() ? 0.5 : 1 }}>
                                                    {exceptionBusy ? "Recording…" : "Record exception"}
                                                </button>
                                                <button type="button" data-policy-exception-cancel="true" disabled={exceptionBusy}
                                                        onClick={() => { setExceptionDraft(null); setExceptionError(null); }}
                                                        style={{ fontSize: 11, padding: "4px 10px", borderRadius: 4, border: `1px solid ${T.border}`, background: "#fff", color: T.slate, cursor: "pointer" }}>
                                                    Cancel
                                                </button>
                                            </div>
                                        </div>
                                    ) : null}
                                </div>
                            ) : null}

                            {/*
                              * ── THE STALE-TERM REVIEW STATE ─────────────────────────────────
                              *
                              * The accepted term records the resolution it was agreed under. When
                              * the assignment has moved since, the surface says so and changes
                              * nothing: repricing silently would replace a commercial agreement
                              * with an inference. The operator accepts or overrides explicitly.
                              */}
                            {pricingView?.acceptedIsStale ? (
                                <div style={{ fontSize: 11, color: T.ember, marginTop: 2 }} data-assignment-tuition-review="true">
                                    Tuition needs review — this assignment has changed since the price was agreed.
                                    Choose the recommendation, another option, or override.
                                </div>
                            ) : null}

                            {/* The canonical write's own answer, success or refusal. */}
                            {tuitionOutcome ? (
                                <div
                                    style={{ fontSize: 11, marginTop: 2, color: tuitionOutcome.kind === "needs_attention" ? T.ember : T.pine }}
                                    data-assignment-tuition-outcome={tuitionOutcome.kind}
                                >
                                    {tuitionOutcome.kind === "needs_attention"
                                        ? `Assignment saved · tuition needs attention — ${tuitionOutcome.detail}`
                                        : `Tuition ${tuitionOutcome.kind} · ${tuitionOutcome.label}`}
                                </div>
                            ) : null}

                            {/*
                              * ── TUITION IS ITS OWN ACT, AND NEEDS ITS OWN COMMIT ────────────
                              *
                              * MEASURED: the only commit on this surface saves the SCHEDULE, and
                              * it is disabled until a new schedule is complete — days, a start, a
                              * room. So an assignment already saved, whose term had gone stale,
                              * showed "Tuition needs review · choose the recommendation, another
                              * option, or override" and offered no way to choose anything. The
                              * review was an instruction the surface could not carry out.
                              *
                              * Pricing acceptance was already a separate canonical act from the
                              * schedule write; this gives it the separate control that follows
                              * from that. It settles tuition alone and touches no schedule field.
                              */}
                            {canSettleTuitionAlone ? (
                                <button
                                    type="button"
                                    disabled={busy || (isOverridingSelection && !overrideReason.trim())}
                                    onClick={() => void settleTuition()}
                                    data-assignment-tuition-commit={isOverridingSelection ? "override" : "accept"}
                                    style={{
                                        all: "unset", marginTop: 4, cursor: busy ? "default" : "pointer",
                                        fontSize: 11, fontWeight: 650, color: T.pine, width: "fit-content",
                                        opacity: busy || (isOverridingSelection && !overrideReason.trim()) ? 0.45 : 1,
                                    }}
                                >
                                    {isOverridingSelection ? "Override tuition" : "Accept tuition"}
                                </button>
                            ) : null}

                            {/*
                              * OVERRIDE IS GOVERNED SELECTION, NOT FREE-FORM MONEY. The reason is
                              * required by the authority, so it is asked for here rather than
                              * defaulted to something plausible — and only when the operator has
                              * actually chosen something other than the recommendation.
                              */}
                            {isOverridingSelection ? (
                                <label style={{ fontSize: 10.5, color: T.slate, marginTop: 2, display: "block" }}>
                                    Why this rather than the recommendation
                                    <input
                                        value={overrideReason}
                                        onChange={(e) => setOverrideReason(e.target.value)}
                                        data-assignment-override-reason="true"
                                        placeholder="Required to override"
                                        style={{
                                            marginTop: 2, padding: "5px 7px", fontSize: 12, width: "100%",
                                            borderRadius: 6, border: `1px solid ${T.border}`, color: T.forge, background: "#fff",
                                        }}
                                    />
                                </label>
                            ) : null}

                            {/*
                              * ── WHO WILL OWE IT ─────────────────────────────────────────────
                              *
                              * Beneath the price, because the price is what responsibility is
                              * about, and behind a quiet disclosure because most assignments do
                              * not change it — the household arrangement already applies.
                              *
                              * It defaults to THIS CHILD, which is the scope an operator opening
                              * an assignment means. It writes nothing until they confirm: the
                              * panel previews and executes through the registered action, and an
                              * assignment that is merely open has authored nothing.
                              */}
                            {child.kind === "child" ? (
                                <div style={{ marginTop: 6 }} data-assignment-responsibility="section">
                                    {!responsibilityOpen ? (
                                        <button
                                            type="button"
                                            onClick={() => setResponsibilityOpen(true)}
                                            data-assignment-responsibility="open"
                                            style={{ all: "unset", cursor: "pointer", fontSize: 11, fontWeight: 600, color: T.pine }}
                                        >
                                            Who owes this — set responsibility
                                        </button>
                                    ) : household?.customerId ? (
                                        <FinancialsResponsibilityPanel
                                            customerId={household.customerId}
                                            customerMemberId={child.id}
                                            subjectLabel={child.name}
                                            parties={[]}
                                            memberOptions={household.members}
                                            defaultScopeMemberId={child.id}
                                            hostedOpen
                                            onHostedClose={() => setResponsibilityOpen(false)}
                                            onCommitted={() => setResponsibilityOpen(false)}
                                        />
                                    ) : (
                                        <span style={{ fontSize: 11, color: T.muted }} data-assignment-responsibility="pending">
                                            {household ? "This child is not on a household account." : "Reading the household…"}
                                        </span>
                                    )}
                                </div>
                            ) : null}
                        </div>
                    ) : undefined
                }
                days={
                    <div style={{ display: "grid", gap: 8 }}>
                        <DayPills days={days} interactive allowed={allowedDays} onToggle={toggleDay} />
                        <button type="button" onClick={openPatternPicker} data-pattern-shortcut="true" style={{ all: "unset", cursor: "pointer", fontSize: 11, fontWeight: 600, color: T.pine, width: "fit-content" }}>
                            Use a schedule pattern
                        </button>
                        {patternPicking &&
                            (patterns == null ? (
                                // Loading is NOT the list — the picker only exists once patterns resolve.
                                <span style={{ fontSize: 11, color: T.muted }}>Loading patterns…</span>
                            ) : (
                                <div data-pattern-list="true" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                    {patterns.map((p) => (
                                        <button key={p.id} type="button" onClick={() => applyPattern(p)} data-pattern-option={p.id} style={patternChip}>
                                            {p.label}
                                        </button>
                                    ))}
                                    {patterns.length === 0 ? <span style={{ fontSize: 11, color: T.muted }}>No patterns configured.</span> : null}
                                </div>
                            ))}
                    </div>
                }
                hours={
                    <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
                        <div
                            className="alloy-os-sched-hours-row"
                            style={{ display: "flex", flexWrap: "wrap", gap: "8px 10px", alignItems: "center", minWidth: 0 }}
                        >
                            <div data-arrive="true" style={{ minWidth: 0, flex: "0 1 auto" }}>
                                <AlloyTimeInput
                                    value={arrive}
                                    onChange={setArrive}
                                    aria-label="Arrive"
                                    testId="schedule-arrive"
                                    className="alloy-time-input--sched"
                                />
                            </div>
                            <span style={{ color: T.mid40, flex: "0 0 auto" }}>–</span>
                            <div data-depart="true" style={{ minWidth: 0, flex: "0 1 auto" }}>
                                <AlloyTimeInput
                                    value={depart}
                                    onChange={setDepart}
                                    aria-label="Depart"
                                    testId="schedule-depart"
                                    className="alloy-time-input--sched"
                                />
                            </div>
                        </div>
                        {arrive && depart && depart <= arrive && <div style={{ fontSize: 11, color: T.ember }}>Depart must be after arrive.</div>}
                        {days.length > 1 && (
                            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: T.slate, cursor: "pointer" }}>
                                <AlloyCheck checked={perDayOpen} onChange={setPerDayOpen} data-perday-toggle="true" />
                                Different times per day
                            </label>
                        )}
                        {perDayOpen && (
                            <div style={{ display: "grid", gap: 5, marginTop: 2 }} data-perday-grid="true">
                                {WEEKDAYS.filter((d) => days.includes(d.i)).map((d) => {
                                    const row = perDay[d.i] ?? { arrive: "", depart: "" };
                                    const setRow = (patch: Partial<DailyHours>) => setPerDay((prev) => ({ ...prev, [d.i]: { ...row, ...patch } }));
                                    return (
                                        <div key={d.i} style={{ display: "flex", gap: 8, alignItems: "center" }} data-perday-row={d.i}>
                                            <span style={{ width: 30, fontSize: 11.5, fontWeight: 600, color: T.slate }}>{WEEKDAY_LABEL[d.i]}</span>
                                            <AlloyTimeInput
                                                value={row.arrive}
                                                onChange={(next) => setRow({ arrive: next })}
                                                aria-label={`${WEEKDAY_LABEL[d.i]} arrive`}
                                                className="alloy-time-input--sched"
                                            />
                                            <span style={{ color: T.mid40, fontSize: 11 }}>–</span>
                                            <AlloyTimeInput
                                                value={row.depart}
                                                onChange={(next) => setRow({ depart: next })}
                                                aria-label={`${WEEKDAY_LABEL[d.i]} depart`}
                                                className="alloy-time-input--sched"
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                }
                siteRoom={
                    roomReq === "not_used" ? (
                        <div
                            data-room-not-used="true"
                            data-assignment-program-resolved={programCategoryId ? "true" : "false"}
                            style={{ fontSize: 12.5, color: T.muted }}
                        >
                            Operational space not used for this Category
                            <div data-schedule-site-context="true" style={{ marginTop: 4, fontSize: 11.5, fontWeight: 500 }}>
                                Site · {siteName}
                            </div>
                        </div>
                    ) : (
                        <div
                            style={{ display: "grid", gap: 6 }}
                            data-assignment-program-resolved={programCategoryId ? "true" : "false"}
                        >
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                {roomName ? (
                                    <span data-room-value="true" style={{ fontSize: 15, fontWeight: 700, color: T.forge }}>
                                        {roomName}
                                    </span>
                                ) : (
                                    <span data-room-value="pending" style={{ fontSize: 13, fontWeight: 600, color: T.muted }}>
                                        Select a room
                                    </span>
                                )}
                                {roomName && roomFromRec ? <RecTag /> : null}
                                <button
                                    type="button"
                                    onClick={() => {
                                        void ensurePatterns();
                                        setRoomPicking(true);
                                    }}
                                    data-room-change="true"
                                    style={{ all: "unset", cursor: "pointer", fontSize: 11.5, fontWeight: 600, color: T.pine }}
                                >
                                    {roomName ? "Change" : "Select"}
                                </button>
                            </div>
                            <div data-schedule-site-context="true" style={{ fontSize: 11.5, fontWeight: 500, color: T.muted }}>
                                Site · {siteName}
                            </div>
                            {programUsed && programFromRoom ? (
                                <div
                                    data-program-from-room="true"
                                    style={{ fontSize: 11, fontWeight: 600, color: T.pine }}
                                >
                                    Program set by this room — read-only here (change the room to change it).
                                </div>
                            ) : programUsed && programCategoryId ? (
                                <div style={{ fontSize: 11, color: T.muted }}>
                                    Program resolved from the child&rsquo;s enrollment.
                                </div>
                            ) : null}
                        </div>
                    )
                }
                effective={
                    <div style={{ display: "grid", gap: 6 }}>
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
                            <label style={{ display: "grid", gap: 3 }}>
                                <span style={{ fontSize: 10, color: T.mid40 }}>Start</span>
                                <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="alloy-os-sched-input" style={{ width: "min(156px, 100%)", maxWidth: "100%" }} />
                            </label>
                            <label style={{ display: "grid", gap: 3 }}>
                                <span style={{ fontSize: 10, color: T.mid40 }}>End</span>
                                <input type="date" value={end} disabled={openEnded} onChange={(e) => setEnd(e.target.value)} className="alloy-os-sched-input" style={{ width: "min(156px, 100%)", maxWidth: "100%" }} />
                            </label>
                            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: T.slate, cursor: "pointer", paddingBottom: 7 }}>
                                <AlloyCheck checked={openEnded} onChange={setOpenEnded} data-open-ended={openEnded ? "true" : "false"} />
                                Open-ended
                            </label>
                        </div>
                        <div style={{ fontSize: 10.5, color: T.mid40 }}>{openEnded ? "Ongoing — no end date; ends later via a change." : "Bounded — ends on the date above."}</div>
                    </div>
                }
                footer={
                    <div
                        className="alloy-os-sched-footer-row"
                        style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px 12px", minWidth: 0 }}
                    >
                        <span style={{ fontSize: 10.5, color: T.muted, flex: "1 1 140px", minWidth: 0 }}>
                            {createAsSecondary
                                ? assignmentTypeLabel
                                    ? `${assignmentTypeLabel} — independent of the primary.`
                                    : "New assignment — independent of the primary."
                                : mode === "create"
                                  ? "Create Assignment — configure the minimum."
                                  : "Editing this Assignment."}
                        </span>
                        <div style={{ marginLeft: "auto", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, flex: "0 0 auto" }}>
                            <button type="button" onClick={onCancel} style={{ all: "unset", cursor: "pointer", fontSize: 12, fontWeight: 600, color: T.slate }}>
                                Cancel
                            </button>
                            <button type="button" disabled={busy || !canSave} onClick={save} data-schedule-commit="true" style={primaryBtn(busy || !canSave)}>
                                {busy
                                    ? "Saving…"
                                    : createAsSecondary
                                      ? "Save assignment"
                                      : mode === "create"
                                        ? "Create Assignment"
                                        : "Save Assignment"}
                            </button>
                        </div>
                    </div>
                }
            />
        </>
    );
}

// ── Room picker — seed + scored fit; ineligible rooms stay visible for override ──
function RoomPicker({
    siteId,
    childId,
    patternId,
    start,
    selectedRoomId,
    seedRooms,
    purposeBehavior,
    programCategoryId,
    onProgramResolved,
    onPick,
    onCancel,
}: {
    siteId: string;
    childId: string;
    patternId: string | null;
    start: string;
    selectedRoomId: string | null;
    seedRooms: SiteOperationalRoom[];
    purposeBehavior?: AssignmentTypeBehavior;
    programCategoryId?: string | null;
    /** Server-resolved Program from child/assignment context (`?view=options`), adopted
     *  only when no Program is already known client-side — never overrides a Program
     *  a Room selection already implied. */
    onProgramResolved?: (programCategoryId: string) => void;
    onPick: (id: string, name: string | null, recommended: boolean) => void;
    onCancel: () => void;
}) {
    const seedOptions = useMemo((): PlacementOption[] => {
        const active = seedRooms.filter((r) => r.active !== false);
        const scoped = scopeRoomsForAssignmentPicker(active, purposeBehavior ?? {});
        return scoped.map((r) => ({
            roomId: r.roomId,
            roomName: r.roomName,
            // Pending — never flash "Eligible" before scored fit returns.
            classification: "eligible" as const,
            reason: "Checking eligibility…",
            programCategoryId: r.programCategoryId,
        }));
    }, [seedRooms, purposeBehavior]);

    const [scored, setScored] = useState<PlacementOption[] | null>(null);
    const [fitContext, setFitContext] = useState<{
        dateOfBirth: string | null;
        childAgeMonths: number | null;
        asOf: string;
        dobSource: string;
    } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [overridePending, setOverridePending] = useState<PlacementOption | null>(null);
    const eligibilityReady = scored != null;

    useEffect(() => {
        if (!patternId) return;
        let cancelled = false;
        setError(null);
        setScored(null);
        setFitContext(null);
        (async () => {
            try {
                const o = await schedApi(
                    `?view=options&site_location_id=${encodeURIComponent(siteId)}&pattern_id=${encodeURIComponent(patternId)}&child_agreement_id=${encodeURIComponent(childId)}${start ? `&start_date=${start}` : ""}${programCategoryId ? `&program_category_id=${encodeURIComponent(programCategoryId)}` : ""}`
                );
                if (cancelled) return;
                const raw = (o.options ?? []) as PlacementOption[];
                // Keep Category allow-list / not_used scoping — do not drop program mismatches.
                const scoped = scopeRoomsForAssignmentPicker(
                    raw.map((r) => ({
                        ...r,
                        programCategoryId: r.programCategoryId ?? null,
                    })),
                    purposeBehavior ?? {},
                );
                setScored(scoped);
                if (o.fitContext && typeof o.fitContext === "object") {
                    setFitContext(o.fitContext as {
                        dateOfBirth: string | null;
                        childAgeMonths: number | null;
                        asOf: string;
                        dobSource: string;
                    });
                }
                if (!programCategoryId && typeof o.programCategoryId === "string" && o.programCategoryId) {
                    onProgramResolved?.(o.programCategoryId);
                }
            } catch (e) {
                if (!cancelled) setError((e as Error).message);
            }
        })();
        return () => {
            cancelled = true;
        };
        // `onProgramResolved` intentionally omitted — an inline callback from the parent;
        // depending on it would refetch every render without changing behavior.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [siteId, patternId, childId, start, purposeBehavior, programCategoryId]);

    const options = useMemo(() => {
        const list = scored ?? seedOptions;
        if (!scored) return list;
        const rank = (c: PlacementOption["classification"]) =>
            c === "recommended" ? 0 : c === "eligible" ? 1 : 2;
        return [...list].sort((a, b) => rank(a.classification) - rank(b.classification));
    }, [scored, seedOptions]);

    function choose(option: PlacementOption) {
        if (!eligibilityReady) return;
        if (option.classification === "blocked") {
            setOverridePending(option);
            return;
        }
        setOverridePending(null);
        onPick(option.roomId, option.roomName, option.classification === "recommended");
    }

    const ageHint = (() => {
        if (!fitContext) return null;
        if (fitContext.childAgeMonths == null || !fitContext.dateOfBirth) {
            return `Age as of ${fitContext.asOf}: unknown (no DOB on person/member)`;
        }
        return `Age as of ${fitContext.asOf}: ${fitContext.childAgeMonths} mo (DOB ${fitContext.dateOfBirth})`;
    })();

    return (
        <div style={{ display: "grid", gap: 10, paddingTop: 4, minHeight: 0 }} data-room-picker="true">
            <div
                style={{ display: "flex", alignItems: "center", gap: 8 }}
                data-schedule-nav="true"
            >
                <button
                    type="button"
                    onClick={onCancel}
                    aria-label="Back to assignment"
                    data-schedule-back="true"
                    data-schedule-back-target="Assignment"
                    data-room-picker-back="true"
                    className="alloy-os-ucard__action alloy-os-ucard__action--system5"
                    style={{ padding: "2px 0" }}
                >
                    ← Back
                </button>
            </div>
            {label("Choose a room")}
            <p style={{ margin: 0, fontSize: 11.5, color: T.muted, lineHeight: 1.4 }}>
                Eligible rooms match this child&rsquo;s age and program as of the start date. Ineligible rooms stay
                listed — you can override when needed.
            </p>
            {ageHint ? (
                <p style={{ margin: 0, fontSize: 11, color: T.muted }} data-room-fit-age-hint="true">
                    {ageHint}
                </p>
            ) : !eligibilityReady && patternId ? (
                <p style={{ margin: 0, fontSize: 11, color: T.muted }}>Checking eligibility…</p>
            ) : null}
            {error && <ErrorNote message={error} />}
            {options.length === 0 ? (
                <span style={{ fontSize: 12, color: T.muted }}>
                    No operational spaces configured for this site
                    {programCategoryId ? " and Category" : ""}.
                </span>
            ) : (
                <div
                    style={{ display: "grid", gap: 6, maxHeight: "min(42vh, 320px)", overflowY: "auto" }}
                    data-room-options-ready={scored ? "scored" : "pending"}
                >
                    {options.map((o) => {
                        const blocked = eligibilityReady && o.classification === "blocked";
                        const selected = o.roomId === selectedRoomId;
                        const pending = overridePending?.roomId === o.roomId;
                        const badge = !eligibilityReady
                            ? "Checking"
                            : o.classification === "recommended"
                              ? "Recommended"
                              : o.classification === "blocked"
                                ? "Ineligible"
                                : "Eligible";
                        return (
                            <button
                                key={o.roomId}
                                type="button"
                                onClick={() => choose(o)}
                                data-room-option={o.roomId}
                                data-room-classification={eligibilityReady ? o.classification : "pending"}
                                data-room-override-pending={pending ? "true" : undefined}
                                disabled={!eligibilityReady}
                                style={{
                                    all: "unset",
                                    cursor: eligibilityReady ? "pointer" : "wait",
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    border: pending
                                        ? `1px solid ${T.ember}`
                                        : selected
                                          ? `1px solid ${T.pine}`
                                          : `1px solid ${T.border}`,
                                    background: blocked
                                        ? pending
                                            ? "rgba(180,83,42,.06)"
                                            : "#f9fafb"
                                        : selected
                                          ? "rgba(0,162,131,.06)"
                                          : "#fff",
                                    borderRadius: 8,
                                    padding: "8px 12px",
                                    opacity: eligibilityReady ? 1 : 0.85,
                                }}
                            >
                                <span style={{ color: blocked ? T.muted : T.forge, minWidth: 0 }}>
                                    <span style={{ fontWeight: 600 }}>{o.roomName ?? "Room"}</span>
                                    <span style={{ color: T.muted, marginLeft: 8, fontSize: 11.5 }}>
                                        {eligibilityReady ? o.reason : "Checking eligibility…"}
                                    </span>
                                </span>
                                <span
                                    style={{
                                        fontSize: 9,
                                        fontWeight: 700,
                                        textTransform: "uppercase",
                                        letterSpacing: ".04em",
                                        color:
                                            !eligibilityReady
                                                ? T.muted
                                                : o.classification === "recommended"
                                                  ? T.pine
                                                  : blocked
                                                    ? T.ember
                                                    : T.muted,
                                        flex: "0 0 auto",
                                    }}
                                >
                                    {badge}
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}
            {overridePending ? (
                <div
                    data-room-override-confirm="true"
                    style={{
                        display: "grid",
                        gap: 8,
                        border: `1px solid ${T.ember}`,
                        background: "#fffaf7",
                        borderRadius: 8,
                        padding: "10px 12px",
                    }}
                >
                    <div style={{ fontSize: 12, color: T.forge, lineHeight: 1.4 }}>
                        <strong>{overridePending.roomName ?? "This room"}</strong> is ineligible
                        {overridePending.reason ? ` — ${overridePending.reason}` : ""}. Use it anyway?
                    </div>
                    <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                        <button
                            type="button"
                            onClick={() => setOverridePending(null)}
                            style={{ all: "unset", cursor: "pointer", fontSize: 12, fontWeight: 600, color: T.slate }}
                        >
                            Keep browsing
                        </button>
                        <button
                            type="button"
                            data-room-override-confirm-use="true"
                            onClick={() => {
                                const next = overridePending;
                                setOverridePending(null);
                                onPick(next.roomId, next.roomName, false);
                            }}
                            style={{
                                all: "unset",
                                cursor: "pointer",
                                fontSize: 12,
                                fontWeight: 600,
                                color: "#fff",
                                background: "var(--alloy-os-bend-pine, #00A283)",
                                borderRadius: 7,
                                padding: "7px 12px",
                            }}
                        >
                            Use anyway
                        </button>
                    </div>
                </div>
            ) : null}
            <div style={{ display: "flex", borderTop: `1px solid ${T.border}`, paddingTop: 10 }}>
                <button type="button" onClick={onCancel} style={{ all: "unset", marginLeft: "auto", cursor: "pointer", fontSize: 12, fontWeight: 600, color: T.slate }}>
                    Cancel
                </button>
            </div>
        </div>
    );
}

// ── Small presentational pieces ──────────────────────────────────────────────
function RecTag() {
    return <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", color: T.pine }}>Recommended</span>;
}
function Thinking({ label }: { label: string }) {
    return (
        <div data-scheduling-thinking="true" style={{ display: "flex", alignItems: "center", gap: 8, padding: "18px 0", color: T.muted, fontSize: 12.5 }}>
            <span style={{ width: 13, height: 13, borderRadius: "50%", border: `2px solid ${T.border}`, borderTopColor: T.pine, display: "inline-block", animation: "alloy-spin 0.7s linear infinite" }} />
            <style>{"@keyframes alloy-spin{to{transform:rotate(360deg)}}"}</style>
            {label}
        </div>
    );
}
function ErrorNote({ message }: { message: string }) {
    // Addressable so a failing save reports WHY. Without it a certification that cannot find the
    // list surface afterwards times out blind, and "the button did nothing" is the least useful
    // description of a refused write that the operator will also be reading.
    return <div data-schedule-error="true" style={{ fontSize: 12, color: "#b42318", background: "#fef3f2", border: "1px solid #fecdca", borderRadius: 8, padding: "8px 10px" }}>{message}</div>;
}
function AlloyCheck({ checked, onChange, ...rest }: { checked: boolean; onChange: (v: boolean) => void } & Record<string, unknown>) {
    return (
        <span role="checkbox" aria-checked={checked} tabIndex={0} onClick={() => onChange(!checked)}
            onKeyDown={(e) => {
                if (e.key === " " || e.key === "Enter") {
                    e.preventDefault();
                    onChange(!checked);
                }
            }}
            {...rest}
            style={{ width: 15, height: 15, borderRadius: 4, border: checked ? `1px solid ${T.pine}` : `2px solid ${T.mid40}`, background: checked ? T.pine : "#fff", display: "inline-grid", placeItems: "center", cursor: "pointer", flex: "0 0 auto" }}>
            {checked && (
                <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
                    <path d="M2.5 6.2 5 8.5 9.5 3.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            )}
        </span>
    );
}
function label(s: string) {
    return <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: T.mid40, marginBottom: 7 }}>{s}</div>;
}
function primaryBtn(disabled: boolean): CSSProperties {
    return {
        fontSize: 12.5,
        fontWeight: 600,
        color: "#fff",
        background: disabled ? "#98a2b3" : "var(--alloy-os-bend-pine, #00A283)",
        border: "none",
        borderRadius: 7,
        padding: "8px 16px",
        cursor: disabled ? "default" : "pointer",
    };
}

const rowBtnStyle: CSSProperties = {
    all: "unset",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    width: "100%",
    boxSizing: "border-box",
    cursor: "pointer",
    border: `1px solid ${T.border}`,
    borderRadius: 10,
    padding: "8px 12px",
    background: "var(--alloy-os-fp-card-surface, var(--alloy-os-surface, #fff))",
};
const patternChip: CSSProperties = { all: "unset", cursor: "pointer", fontSize: 11.5, fontWeight: 600, color: T.slate, background: T.stone, border: `1px solid ${T.border}`, borderRadius: 999, padding: "6px 11px" };
