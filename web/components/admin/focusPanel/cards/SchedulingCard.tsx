"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { CalendarDays, Clock, DoorOpen, CalendarRange, Wallet } from "lucide-react";

import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import CardAvatar from "@/components/admin/focusPanel/CardAvatar";
import AssignmentCardSections from "@/components/admin/focusPanel/cards/AssignmentCardSections";
import AssignmentProposalControls from "@/components/admin/focusPanel/cards/AssignmentProposalControls";
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
import { AdminDeleteConfirmModal } from "@/components/admin/AdminDeleteConfirmModal";
import { dispatchOpportunityDrawerRecordPatch } from "@/lib/admin/opportunityDrawerTargetedRefresh";
import { dispatchDrawerLayoutRuntimeBodyRecordPatch } from "@/lib/layout/runtime/drawerLayoutRuntimeBodyRecordPatch";
import { AlloyTimeInput } from "@/components/workspace/AlloyTimeInput";

type Props = {
    model: FocusPanelCardModel;
    context: OperationalContext;
    receded?: boolean;
    coordination?: FocusPanelCoordination;
    composerPreview?: { perspective?: "expanded" };
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
type ChildProj = {
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
type SchedChild = { id: string; personId: string | null; name: string; imageUrl: string | null; dobAge: string | null };

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

async function executeAssignmentAction(body: Record<string, unknown>): Promise<void> {
    const { operatorFacingAssignmentError } = await import(
        "@/lib/operationalAssignments/operatorAssignmentErrors"
    );
    const res = await fetch("/api/admin/actions/execute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.ok === false) {
        const err = json?.error;
        const message =
            typeof err === "string"
                ? err
                : err && typeof err === "object" && typeof err.message === "string"
                  ? err.message
                  : `Action failed (${res.status})`;
        throw new Error(operatorFacingAssignmentError(message));
    }
}

/**
 * After an assignment mutation, push the reloaded child projection into Focus Panel
 * truth so Children / Household / Schedule cards recompose together.
 */
function publishScheduleProjectionToFocusPanel(args: {
    opportunityId: string | null;
    memberId: string;
    fresh: ChildProj | null;
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

/** Shared create payload — proposed when no agreement, committed when agreement exists. */
function childAssignmentCreatePayload(
    child: SchedChild,
    proj: ChildProj | null,
    extra: Record<string, unknown>
): Record<string, unknown> {
    const agreementId = (proj?.enrollmentAgreementId ?? "").trim();
    const siteId = (proj?.child.siteId ?? "").trim();
    return {
        subject_type: "child",
        enrollment_agreement_id: agreementId || undefined,
        customer_member_id: child.id,
        site_location_id: siteId || undefined,
        ...extra,
    };
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
function deriveScheduleState(p: ChildProj | null): ScheduleState {
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
function summaryStatus(p: ChildProj): { label: string; color: string } {
    const s = deriveScheduleState(p);
    if (p.status === "proposed" && p.proposed?.effectiveFrom) return { label: "Proposed", color: TONE_COLOR[s.tone] };
    return { label: s.label, color: TONE_COLOR[s.tone] };
}
function existingView(p: ChildProj | null): ProjView | null {
    return p?.current ?? p?.proposed ?? null;
}

/** Plural list: committed + proposed planning rows (proposed never replaces committed). */
function listAssignments(p: ChildProj | null): ProjAssignment[] {
    const committed = p?.current?.assignments ?? [];
    const proposed = p?.proposed?.assignments ?? [];
    if (committed.length === 0) return proposed.filter((a) => a.subjectType !== "staff");
    if (proposed.length === 0) return committed.filter((a) => a.subjectType !== "staff");
    const seen = new Set(committed.map((a) => a.id));
    return [
        ...committed.filter((a) => a.subjectType !== "staff"),
        ...proposed.filter((a) => a.subjectType !== "staff" && !seen.has(a.id)),
    ];
}

/**
 * Scheduling card — the "what is true?" identity surface, driven by the canonical
 * SchedulingProjection. Clicking a child opens the Scheduling work surface in the
 * center, which lands on a read-only Schedule Detail (existing truth) and only enters
 * the editor via Edit / Create new. Detail and Edit share ONE region composition
 * (ScheduleRegions): Detail renders values, Edit transforms the same regions into
 * controls in place. The card never edits inline.
 */
export default function SchedulingCard({ model, context, receded = false, coordination, composerPreview }: Props) {
    const evidence = useMemo(() => buildChildrenCardEvidence(context), [context]);
    const children: SchedChild[] = useMemo(
        () =>
            evidence.children.map((c) => ({
                id: c.customerMemberId ?? c.id,
                personId: c.personId ?? null,
                name: c.name,
                imageUrl: c.imageUrl ?? null,
                dobAge: c.dobAge ?? null,
            })),
        [evidence]
    );
    const opportunityId = context.subject.type === "opportunity" ? context.subject.id : null;

    // Prebuilt projection: composed server-side into context.truth by the Focus Panel
    // first-paint runtime (like Household), so the card reveals WITH the panel and opens
    // a child's Detail instantly — no per-child fetch, no self-managed loading gate.
    const prebuilt = useMemo(() => {
        const bag = (context.truth as Record<string, unknown>)?._scheduling_projection;
        const byMember = (bag && typeof bag === "object" ? (bag as { byMemberId?: Record<string, ChildProj> }).byMemberId : null) ?? {};
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
    const [overrides, setOverrides] = useState<Record<string, ChildProj>>({});
    const projById = useMemo(() => ({ ...prebuilt, ...overrides }), [prebuilt, overrides]);

    const reloadChild = useCallback(
        async (id: string, name: string): Promise<ChildProj | null> => {
            const r = await schedApi(
                `?view=projection&customer_member_id=${encodeURIComponent(id)}&subject_name=${encodeURIComponent(name)}${opportunityId ? `&opportunity_id=${encodeURIComponent(opportunityId)}` : ""}`
            );
            const p = (r.projection?.children?.[0] as ChildProj | undefined) ?? null;
            if (p) setOverrides((prev) => ({ ...prev, [id]: p }));
            return p;
        },
        [opportunityId]
    );

    const [activeChildId, setActiveChildId] = useState<string | null>(null);
    useEffect(() => {
        if (composerPreview?.perspective === "expanded" && children[0]) setActiveChildId(children[0].id);
    }, [composerPreview, children]);

    // Card Link / Linked field handoff — open this child's Schedule Detail.
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
            children.find((c) => c.id === focus)
            ?? children.find((c) => c.personId === focus)
            ?? null;
        setActiveChildId(match?.id ?? focus);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- nonce gates re-apply
    }, [requestNonce, children]);

    const activeChild = children.find((c) => c.id === activeChildId) ?? null;
    const activeOfferModel = activeChild
        ? buildAssignmentCardModelForChild({
              truth: context.truth as Record<string, unknown>,
              customerMemberId: activeChild.id,
              projection: (projById[activeChild.id] as never) ?? null,
              requiredRuleIds: Array.isArray(
                  (context.truth as Record<string, unknown>)._assignment_requirement_rule_ids,
              )
                  ? ((context.truth as Record<string, unknown>)
                        ._assignment_requirement_rule_ids as string[])
                  : ["child:start_date", "child:desired_schedule", "child:program_interest"],
          })
        : null;
    // While the Linked host elevates Scheduling, keep reporting focused even before
    // the request effect resolves activeChildId (avoids a mount-time "base" flash).
    const hostElevated = coordination?.activeDepth?.card === "scheduling";
    useReportPerspective(
        coordination,
        "scheduling",
        activeChild || hostElevated ? "focused" : "base",
    );
    useDismissSignal(coordination, "scheduling", () => setActiveChildId(null));

    const insight =
        children.length === 0
            ? "No children to assign"
            : children.length === 1
              ? "1 child"
              : `${children.length} children`;

    return (
        <UniversalCard
            title={model.title}
            // When a child is active the work surface leads with its own avatar identity
            // header, so the redundant "Schedule · <name>" heading is suppressed.
            insight={activeChild ? "" : insight}
            supportingInsight={activeChild ? null : children.length > 0 ? "Room · Days · Effective · Time" : null}
            iconName={model.iconName}
            tier={model.tier}
            archetype={model.archetype}
            statusChip={activeChild ? null : model.statusChip}
            statusTone={model.statusTone}
            density={activeChild ? "expanded" : model.density ?? "compact"}
            gridSpan={model.span}
            data-universal-card-key={model.key}
            receded={receded}
        >
            {/*
              Assignment offer — site/program/room/schedule/start/tuition/quote with
              compact readiness. Family-request fields belong on Children when configured.
            */}
            <div data-scheduling-card="true" data-assignments-card="true">
                {activeChild && activeOfferModel ? (
                    <>
                        <AssignmentCardSections
                            model={activeOfferModel}
                            childId={activeChild.id}
                            childName={activeChild.name}
                            style={{ marginBottom: 12 }}
                        />
                        <AssignmentProposalControls
                            customerMemberId={activeChild.id}
                            opportunityId={opportunityId}
                            participationMetadata={
                                ((context.truth as Record<string, unknown>)
                                    ._enrollment_participation_by_member as
                                    | Record<string, Record<string, unknown>>
                                    | undefined)?.[activeChild.id] ?? null
                            }
                            canCommit={activeOfferModel.readinessReady}
                            commitBlockedReason={
                                activeOfferModel.readinessReady
                                    ? null
                                    : `Cannot commit yet — ${activeOfferModel.readinessSummary.toLowerCase()}.`
                            }
                            style={{ marginBottom: 12 }}
                        />
                        <ScheduleWorkSurface
                        child={activeChild}
                        opportunityId={opportunityId}
                        projection={projById[activeChild.id] ?? null}
                        config={schedConfig}
                        truth={context.truth as Record<string, unknown>}
                        reloadChild={() => reloadChild(activeChild.id, activeChild.name)}
                        coordination={coordination}
                        onBack={() => {
                            setActiveChildId(null);
                            coordination?.back?.();
                        }}
                    />
                    </>
                ) : children.length === 0 ? (
                    <p style={{ fontSize: 12.5, color: T.muted }}>Link children to add assignments.</p>
                ) : (
                    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
                        {children.map((child) => {
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
}: {
    child: SchedChild;
    opportunityId: string | null;
    projection: ChildProj | null;
    config: SchedConfig;
    truth: Record<string, unknown>;
    reloadChild: () => Promise<ChildProj | null>;
    coordination?: FocusPanelCoordination;
    onBack: () => void;
}) {
    const [proj, setProj] = useState<ChildProj | null>(projection);
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

    const currentAssignments: ProjAssignment[] = useMemo(() => listAssignments(proj), [proj]);

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
        publishScheduleProjectionToFocusPanel({
            opportunityId,
            memberId: child.id,
            fresh,
            truth,
            clearInquiryScheduleDraft: Boolean(opts?.clearInquiryScheduleDraft),
        });
        setMode("detail");
        setActiveAssignmentId(null);
        setEditingAssignmentId(null);
        setPendingTypeId(null);
    };

    const beginCreateAssignment = () => {
        setActionError(null);
        setEditingAssignmentId(null);
        if (currentAssignments.length === 0) {
            // First commitment uses the schedule create path (primary home).
            setPendingTypeId(null);
            setMode("create");
            return;
        }
        // Always open the type picker — empty state deep-links to Studio Types (no seed/migrate dead end).
        setPendingTypeId(null);
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
                        activeAssignment.isPrimary
                            ? undefined
                            : () =>
                                  runAction({
                                      action_key: "assignment.set_primary",
                                      entity_type: "child",
                                      entity_id: child.id,
                                      payload: {
                                          subject_type: "child",
                                          ...childAssignmentCreatePayload(child, proj, {}),
                                          enrollment_agreement_id: proj?.enrollmentAgreementId ?? "",
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
                                      entity_type: "child",
                                      entity_id: child.id,
                                      payload: childAssignmentCreatePayload(child, proj, {
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
                                      entity_type: "child",
                                      entity_id: child.id,
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
                        activeAssignment.commitmentKind === "proposed" &&
                        (proj?.enrollmentAgreementId ?? "").trim()
                            ? () =>
                                  runAction({
                                      action_key: "assignment.promote_proposed",
                                      entity_type: "child",
                                      entity_id: child.id,
                                      payload: {
                                          assignment_id: activeAssignment.id,
                                          enrollment_agreement_id: proj?.enrollmentAgreementId ?? "",
                                      },
                                  })
                            : undefined
                    }
                    promoteBlockedReason={
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
                                entity_type: "child",
                                entity_id: child.id,
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
                            if (!a || a.isPrimary) return;
                            void runAction({
                                action_key: "assignment.set_primary",
                                entity_type: "child",
                                entity_id: child.id,
                                payload: {
                                    ...childAssignmentCreatePayload(child, proj, {}),
                                    subject_type: "child",
                                    enrollment_agreement_id: proj?.enrollmentAgreementId ?? "",
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
                                entity_type: "child",
                                entity_id: child.id,
                                payload: childAssignmentCreatePayload(child, proj, {
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
                                entity_type: "child",
                                entity_id: child.id,
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
                        void import("@/lib/adminV2/workspaceModalEvents").then(({ dispatchAdminV2OpenSchedulingModal }) => {
                            dispatchAdminV2OpenSchedulingModal({ mode: "studio", studioView: "types" });
                        });
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
                        entity_type: "child",
                        entity_id: child.id,
                        payload: childAssignmentCreatePayload(child, proj, {
                            schedule_pattern_id: payload.schedule_pattern_id,
                            start_date: payload.start_date,
                            room_location_id: payload.room_location_id,
                            assignment_type_id: selectedType.id,
                            assignment_type_label: selectedType.label,
                            is_primary: false,
                            supersedes_assignment_id: editingAssignmentId,
                        }),
                    });
                    await onSaved();
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
function IdentityHeader({ child, state }: { child: SchedChild; state: ScheduleState }) {
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
function BillingConsequence({ billing }: { billing: BillingProjection | null }) {
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
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase" }}>Recurring tuition</span>
            </div>
            {family ? (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700, color: T.forge }}>
                    <span>Family responsibility</span>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>{family}</span>
                </div>
            ) : (
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
}: {
    child: SchedChild;
    state: ScheduleState;
    days: ReactNode;
    hours: ReactNode;
    siteRoom: ReactNode;
    effective: ReactNode;
    billing: BillingProjection | null;
    footer: ReactNode;
    surface: "detail" | "editor";
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
                <BillingConsequence billing={billing} />
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
    child: SchedChild;
    proj: ChildProj | null;
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
function ScheduleEditor({
    child,
    opportunityId,
    proj,
    config,
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
    child: SchedChild;
    opportunityId: string | null;
    proj: ChildProj | null;
    config: SchedConfig;
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

    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

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

    // Background: billing preview once a schedule type is known (patches the tuition line).
    useEffect(() => {
        if (!siteId || !scheduleType) return;
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
    }, [siteId, scheduleType, start, child.id]);

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
            classification: "eligible" as const,
            reason: "Operational space",
            programCategoryId: r.programCategoryId,
        }));
    }, [seedRooms, purposeBehavior]);

    const [scored, setScored] = useState<PlacementOption[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [overridePending, setOverridePending] = useState<PlacementOption | null>(null);

    useEffect(() => {
        if (!patternId) return;
        let cancelled = false;
        setError(null);
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
        const rank = (c: PlacementOption["classification"]) =>
            c === "recommended" ? 0 : c === "eligible" ? 1 : 2;
        return [...list].sort((a, b) => rank(a.classification) - rank(b.classification));
    }, [scored, seedOptions]);

    function choose(option: PlacementOption) {
        if (option.classification === "blocked") {
            setOverridePending(option);
            return;
        }
        setOverridePending(null);
        onPick(option.roomId, option.roomName, option.classification === "recommended");
    }

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
            {error && <ErrorNote message={error} />}
            {options.length === 0 ? (
                <span style={{ fontSize: 12, color: T.muted }}>
                    No operational spaces configured for this site
                    {programCategoryId ? " and Category" : ""}.
                </span>
            ) : (
                <div
                    style={{ display: "grid", gap: 6, maxHeight: "min(42vh, 320px)", overflowY: "auto" }}
                    data-room-options-ready={scored ? "scored" : "seed"}
                >
                    {options.map((o) => {
                        const blocked = o.classification === "blocked";
                        const selected = o.roomId === selectedRoomId;
                        const pending = overridePending?.roomId === o.roomId;
                        return (
                            <button
                                key={o.roomId}
                                type="button"
                                onClick={() => choose(o)}
                                data-room-option={o.roomId}
                                data-room-classification={o.classification}
                                data-room-override-pending={pending ? "true" : undefined}
                                style={{
                                    all: "unset",
                                    cursor: "pointer",
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
                                }}
                            >
                                <span style={{ color: blocked ? T.muted : T.forge, minWidth: 0 }}>
                                    <span style={{ fontWeight: 600 }}>{o.roomName ?? "Room"}</span>
                                    <span style={{ color: T.muted, marginLeft: 8, fontSize: 11.5 }}>{o.reason}</span>
                                </span>
                                <span
                                    style={{
                                        fontSize: 9,
                                        fontWeight: 700,
                                        textTransform: "uppercase",
                                        letterSpacing: ".04em",
                                        color:
                                            o.classification === "recommended"
                                                ? T.pine
                                                : blocked
                                                  ? T.ember
                                                  : T.muted,
                                        flex: "0 0 auto",
                                    }}
                                >
                                    {o.classification === "recommended"
                                        ? "Recommended"
                                        : o.classification === "blocked"
                                          ? "Ineligible"
                                          : "Eligible"}
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
    return <div style={{ fontSize: 12, color: "#b42318", background: "#fef3f2", border: "1px solid #fecdca", borderRadius: 8, padding: "8px 10px" }}>{message}</div>;
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
