"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { CalendarDays, Clock, DoorOpen, CalendarRange, Wallet } from "lucide-react";

import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import CardAvatar from "@/components/admin/focusPanel/CardAvatar";
import { buildChildrenCardEvidence } from "@/lib/adminV2/runtime/focusPanel/children/buildChildrenCardEvidence";
import type { FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { FocusPanelCoordination } from "@/lib/adminV2/runtime/focusPanel/focusPanelCoordinationModel";
import {
    useDismissSignal,
    useReportPerspective,
} from "@/lib/adminV2/runtime/focusPanel/useFocusPanelCoordination";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";
import { allowedPatternWeekdays } from "@/lib/locations/locationSchedulingConfig";
import { resolveVisibleDayPills } from "@/lib/scheduling/dayPills";

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
type ProjAssignment = {
    room: ProjRoom;
    weekdays: number[];
    arriveTime: string | null;
    departTime: string | null;
    effectiveFrom: string;
    effectiveTo: string | null;
    openEnded: boolean;
};
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
    current: ProjView | null;
    proposed: ProjView | null;
};

type SchedTypeOpt = { key: string; label: string; behavior: "continuous" | "rotating" };
/** The site's configured scheduling constraints + preloaded patterns, from first-paint. */
type SchedConfig = { operatingDays: number[]; scheduleTypes: SchedTypeOpt[]; patterns: Pattern[] };
type PlacementOption = { roomId: string; roomName: string | null; classification: "recommended" | "eligible" | "blocked"; reason: string };
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

function formatDays(weekdays: number[]): string {
    if (!weekdays.length) return "—";
    const s = [...weekdays].sort((a, b) => a - b);
    if (s.join(",") === "1,2,3,4,5") return "Monday–Friday";
    return s.map((d) => WEEKDAY_NAMES[d]).join(", ");
}
function formatDate(iso: string | null): string {
    if (!iso) return "";
    const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
    if (!y || !m || !d) return iso;
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}
function fmtTime(t: string | null): string {
    if (!t) return "";
    const [hh, mm] = t.split(":").map(Number);
    if (Number.isNaN(hh)) return t;
    const ap = hh < 12 ? "AM" : "PM";
    const h12 = hh % 12 === 0 ? 12 : hh % 12;
    return `${h12}:${String(mm).padStart(2, "0")} ${ap}`;
}

async function schedApi(path: string, init?: RequestInit): Promise<any> {
    const res = await fetch(`/api/admin/scheduling${path}`, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`);
    return body;
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
            return { label: "Proposed", tone: "blue", sub: p.proposed?.effectiveFrom ? `Starts ${formatDate(p.proposed.effectiveFrom)}` : "Planning — active at enrollment" };
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
    if (p.status === "proposed" && p.proposed?.effectiveFrom) return { label: `Starts ${formatDate(p.proposed.effectiveFrom)}`, color: TONE_COLOR[s.tone] };
    return { label: s.label, color: TONE_COLOR[s.tone] };
}
function existingView(p: ChildProj | null): ProjView | null {
    return p?.current ?? p?.proposed ?? null;
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
            | { operatingDays?: unknown; scheduleTypes?: unknown; patterns?: unknown }
            | undefined;
        const operatingDays = Array.isArray(bag?.operatingDays)
            ? (bag!.operatingDays as unknown[]).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
            : [];
        const scheduleTypes = Array.isArray(bag?.scheduleTypes) ? (bag!.scheduleTypes as SchedTypeOpt[]) : [];
        const patterns = Array.isArray(bag?.patterns) ? (bag!.patterns as Pattern[]) : [];
        return { operatingDays, scheduleTypes, patterns };
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

    const activeChild = children.find((c) => c.id === activeChildId) ?? null;
    useReportPerspective(coordination, "scheduling", activeChild ? "focused" : "base");
    useDismissSignal(coordination, "scheduling", () => setActiveChildId(null));

    const insight = children.length === 0 ? "No children to schedule" : children.length === 1 ? "1 child" : `${children.length} children`;

    return (
        <UniversalCard
            title={model.title}
            // When a child is active the work surface leads with its own avatar identity
            // header, so the redundant "Schedule · <name>" heading is suppressed.
            insight={activeChild ? "" : insight}
            supportingInsight={activeChild ? null : children.length > 0 ? "Room · weekly pattern · effective dates" : null}
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
            <div data-scheduling-card="true">
                {activeChild ? (
                    <ScheduleWorkSurface
                        child={activeChild}
                        opportunityId={opportunityId}
                        projection={projById[activeChild.id] ?? null}
                        config={schedConfig}
                        reloadChild={() => reloadChild(activeChild.id, activeChild.name)}
                        onClose={() => setActiveChildId(null)}
                    />
                ) : children.length === 0 ? (
                    <p style={{ fontSize: 12.5, color: T.muted }}>Link children to schedule them.</p>
                ) : (
                    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
                        {children.map((child) => {
                            const proj = projById[child.id];
                            const view = existingView(proj ?? null);
                            const a = view?.assignments[0] ?? null;
                            const chrome = proj ? summaryStatus(proj) : { label: "…", color: T.muted };
                            const roomProgram = a?.room.name ? (a.room.program ? `${a.room.name} · ${a.room.program}` : a.room.name) : null;
                            const detail = view
                                ? [roomProgram, formatDays(a?.weekdays ?? []), view.effectiveFrom ? `from ${formatDate(view.effectiveFrom)}${view.openEnded ? " · open-ended" : ""}` : null].filter(Boolean).join(" · ")
                                : "No schedule yet";
                            return (
                                <li key={child.id} data-scheduling-child={child.id}>
                                    <button type="button" onClick={() => setActiveChildId(child.id)} data-scheduling-open={child.id} style={rowBtnStyle}>
                                        <CardAvatar name={child.name} imageUrl={child.imageUrl} size={30} recordId={child.id} />
                                        <span style={{ display: "grid", gap: 2, minWidth: 0, flex: 1 }}>
                                            <span style={{ fontSize: 13.5, fontWeight: 600, color: T.forge }}>{child.name}</span>
                                            <span style={{ fontSize: 11.5, color: T.slate, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{detail}</span>
                                        </span>
                                        <span style={{ display: "flex", alignItems: "center", gap: 8, flex: "0 0 auto" }}>
                                            <span data-scheduling-status={proj?.status} style={{ fontSize: 10.5, fontWeight: 700, color: chrome.color }}>{chrome.label}</span>
                                            <span style={{ color: "#98a2b3" }}>›</span>
                                        </span>
                                    </button>
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
type SurfaceMode = "detail" | "edit" | "create";

function ScheduleWorkSurface({
    child,
    opportunityId,
    projection,
    config,
    reloadChild,
    onClose,
}: {
    child: SchedChild;
    opportunityId: string | null;
    projection: ChildProj | null;
    config: SchedConfig;
    reloadChild: () => Promise<ChildProj | null>;
    onClose: () => void;
}) {
    const [proj, setProj] = useState<ChildProj | null>(projection);
    const existing = existingView(proj);
    // Existing schedule → open Detail INSTANTLY from the prebuilt projection (no fetch).
    // No schedule → the create editor (which also renders instantly; deps load lazily).
    const [mode, setMode] = useState<SurfaceMode>(existing ? "detail" : "create");
    const [detailBilling, setDetailBilling] = useState<BillingProjection | null>(null);

    // Detail billing — enriches the tuition line in the background; never gates Detail.
    useEffect(() => {
        if (mode !== "detail" || !existing?.scheduleType) return;
        let cancelled = false;
        (async () => {
            const siteId = proj?.child.siteId || "";
            if (!siteId) return;
            const bill = await schedApi(
                `?view=billing&site_location_id=${encodeURIComponent(siteId)}&customer_member_id=${encodeURIComponent(child.id)}&schedule_type=${encodeURIComponent(existing.scheduleType!)}${existing.effectiveFrom ? `&start_date=${existing.effectiveFrom}` : ""}`
            ).catch(() => null);
            if (!cancelled) setDetailBilling(bill?.projection ?? null);
        })();
        return () => {
            cancelled = true;
        };
    }, [mode, existing?.scheduleType, existing?.effectiveFrom, proj?.child.siteId, child.id]);

    const header = (
        <div style={{ display: "flex", alignItems: "center", marginBottom: 2 }}>
            <button type="button" onClick={onClose} aria-label="Close" data-schedule-close="true" style={{ all: "unset", marginLeft: "auto", cursor: "pointer", color: T.mid40, fontSize: 15, lineHeight: 1, padding: 2 }}>
                ✕
            </button>
        </div>
    );

    const onSaved = async () => {
        const fresh = await reloadChild();
        setProj(fresh);
        setDetailBilling(null);
        setMode("detail");
    };

    if (mode === "detail") {
        return (
            <div data-schedule-surface="true" data-schedule-ready="true">
                {header}
                <ScheduleDetail child={child} proj={proj} billing={detailBilling} operatingDays={config.operatingDays} onEdit={() => setMode("edit")} onCreate={() => setMode("create")} />
            </div>
        );
    }

    return (
        <div data-schedule-surface="true" data-schedule-ready="true">
            {header}
            <ScheduleEditor
                child={child}
                opportunityId={opportunityId}
                proj={proj}
                config={config}
                existing={mode === "edit" ? existing : null}
                mode={mode}
                onCancel={() => setMode(existing ? "detail" : "detail")}
                onSaved={onSaved}
            />
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
        <div style={{ background: "#f9fafb", border: `1px solid ${T.border}`, borderRadius: 10, padding: "9px 12px", display: "grid", gap: 5 }} data-schedule-billing="true">
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
        <div style={{ display: "grid", gap: 13, paddingTop: 2 }} {...(surface === "detail" ? { "data-schedule-detail": "true" } : { "data-schedule-editor": "true" })}>
            <IdentityHeader child={child} state={state} />
            {state.sub ? <div style={{ marginTop: -8, fontSize: 11, color: T.muted, paddingLeft: 48 }}>{state.sub}</div> : null}
            <Region icon={CalendarDays} label="Days">{days}</Region>
            <Region icon={Clock} label="Daily hours">{hours}</Region>
            <Region icon={DoorOpen} label="Site & room">{siteRoom}</Region>
            <Region icon={CalendarRange} label="Effective">{effective}</Region>
            <BillingConsequence billing={billing} />
            <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 12 }}>{footer}</div>
        </div>
    );
}

// ── Read-only Schedule Detail (the completed state) ──────────────────────────
function ScheduleDetail({
    child,
    proj,
    billing,
    operatingDays,
    onEdit,
    onCreate,
}: {
    child: SchedChild;
    proj: ChildProj | null;
    billing: BillingProjection | null;
    /** The site's operating days — non-operating weekdays are hidden in the Days region. */
    operatingDays: number[];
    onEdit: () => void;
    onCreate: () => void;
}) {
    const view = existingView(proj);
    const a = view?.assignments[0] ?? null;
    const state = deriveScheduleState(proj);
    const hours = a?.arriveTime && a?.departTime ? `${fmtTime(a.arriveTime)} – ${fmtTime(a.departTime)}` : null;
    const roomText = a?.room.name ? (a.room.program ? `${a.room.name} · ${a.room.program}` : a.room.name) : null;
    // Detail Days mirror the editor: show only the site's operating days (closed days
    // hidden), with unselected operating days grayed. A selected day outside operating
    // days still shows (so the schedule reads truthfully).
    const allowedDays = allowedPatternWeekdays(operatingDays);

    return (
        <ScheduleRegions
            surface="detail"
            child={child}
            state={state}
            billing={billing}
            days={a?.weekdays.length ? <DayPills days={a.weekdays} interactive={false} allowed={allowedDays} /> : <Empty>No days set</Empty>}
            hours={hours ? <Value>{hours}</Value> : <Empty>Not set</Empty>}
            siteRoom={
                <div style={{ display: "grid", gap: 2 }}>
                    <Value>{proj?.child.siteName ?? "—"}</Value>
                    {roomText ? <span style={{ fontSize: 12.5, color: T.slate }}>{roomText}</span> : <Empty>Room pending</Empty>}
                </div>
            }
            effective={
                <Value>
                    {view?.effectiveFrom ? `from ${formatDate(view.effectiveFrom)}` : "—"}
                    <span style={{ color: T.muted, fontWeight: 500 }}>{view?.openEnded ? " · open-ended" : view?.effectiveTo ? ` · until ${formatDate(view.effectiveTo)}` : ""}</span>
                </Value>
            }
            footer={
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <button type="button" onClick={onEdit} data-schedule-edit="true" style={primaryBtn(false)}>
                        Edit schedule
                    </button>
                    <button type="button" onClick={onCreate} data-schedule-create-new="true" style={{ all: "unset", cursor: "pointer", fontSize: 12, fontWeight: 600, color: T.pine }}>
                        Create new schedule →
                    </button>
                </div>
            }
        />
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
    onCancel,
    onSaved,
}: {
    child: SchedChild;
    opportunityId: string | null;
    proj: ChildProj | null;
    config: SchedConfig;
    existing: ProjView | null;
    mode: SurfaceMode;
    onCancel: () => void;
    onSaved: () => Promise<void>;
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
    const editState: ScheduleState = mode === "create" && !existing ? { label: "New schedule", tone: "blue", sub: null } : { ...state, sub: null };
    const canSave = days.length > 0 && !!start && !!roomId && (!arrive || !depart || depart > arrive);

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
                onPick={(id, name, recommended) => {
                    setRoomId(id);
                    setRoomName(name);
                    setRoomFromRec(recommended);
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
                            Use a schedule pattern →
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
                    <div style={{ display: "grid", gap: 6 }}>
                        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                            <input type="time" value={arrive} onChange={(e) => setArrive(e.target.value)} data-arrive="true" className="alloy-os-sched-input" style={{ width: 118 }} />
                            <span style={{ color: T.mid40 }}>–</span>
                            <input type="time" value={depart} onChange={(e) => setDepart(e.target.value)} data-depart="true" className="alloy-os-sched-input" style={{ width: 118 }} />
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
                                            <input type="time" value={row.arrive} onChange={(e) => setRow({ arrive: e.target.value })} className="alloy-os-sched-input" style={{ width: 118 }} />
                                            <span style={{ color: T.mid40, fontSize: 11 }}>–</span>
                                            <input type="time" value={row.depart} onChange={(e) => setRow({ depart: e.target.value })} className="alloy-os-sched-input" style={{ width: 118 }} />
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                }
                siteRoom={
                    <div style={{ display: "grid", gap: 6 }}>
                        <div data-schedule-site-context="true" style={{ fontSize: 13, fontWeight: 600, color: T.forge }}>{siteName}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            {roomName ? (
                                <span data-room-value="true" style={{ fontSize: 12.5, fontWeight: 600, color: T.slate }}>{roomName}</span>
                            ) : null}
                            {roomName && roomFromRec ? <RecTag /> : null}
                            <button
                                type="button"
                                onClick={() => {
                                    // The room decision needs a pattern (schedule) to evaluate fit —
                                    // load it as part of invoking Change, then open the picker.
                                    void ensurePatterns();
                                    setRoomPicking(true);
                                }}
                                data-room-change="true"
                                style={{ all: "unset", cursor: "pointer", fontSize: 11.5, fontWeight: 600, color: T.pine }}
                            >
                                {roomName ? "Change →" : "Select a room →"}
                            </button>
                        </div>
                    </div>
                }
                effective={
                    <div style={{ display: "grid", gap: 6 }}>
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
                            <label style={{ display: "grid", gap: 3 }}>
                                <span style={{ fontSize: 10, color: T.mid40 }}>Start</span>
                                <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="alloy-os-sched-input" style={{ width: 156 }} />
                            </label>
                            <label style={{ display: "grid", gap: 3 }}>
                                <span style={{ fontSize: 10, color: T.mid40 }}>End</span>
                                <input type="date" value={end} disabled={openEnded} onChange={(e) => setEnd(e.target.value)} className="alloy-os-sched-input" style={{ width: 156 }} />
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
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 10.5, color: T.muted }}>{mode === "create" ? "New schedule — configure the minimum." : "Editing the current schedule."}</span>
                        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
                            <button type="button" onClick={onCancel} style={{ all: "unset", cursor: "pointer", fontSize: 12, fontWeight: 600, color: T.slate }}>
                                Cancel
                            </button>
                            <button type="button" disabled={busy || !canSave} onClick={save} data-schedule-commit="true" style={primaryBtn(busy || !canSave)}>
                                {busy ? "Saving…" : mode === "create" ? "Save schedule" : "Save changes"}
                            </button>
                        </div>
                    </div>
                }
            />
        </>
    );
}

// ── Room picker (invokes the placement resolver; ranking stays owned there) ──
function RoomPicker({
    siteId,
    childId,
    patternId,
    start,
    selectedRoomId,
    onPick,
    onCancel,
}: {
    siteId: string;
    childId: string;
    patternId: string | null;
    start: string;
    selectedRoomId: string | null;
    onPick: (id: string, name: string | null, recommended: boolean) => void;
    onCancel: () => void;
}) {
    const [options, setOptions] = useState<PlacementOption[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    useEffect(() => {
        // The fit resolver evaluates against a schedule (pattern) — wait for it to
        // resolve (loaded as part of invoking Change) rather than fire a request the
        // resolver would reject.
        if (!patternId) return;
        let cancelled = false;
        setError(null);
        (async () => {
            try {
                const o = await schedApi(
                    `?view=options&site_location_id=${encodeURIComponent(siteId)}&pattern_id=${encodeURIComponent(patternId)}&child_agreement_id=${encodeURIComponent(childId)}${start ? `&start_date=${start}` : ""}`
                );
                if (!cancelled) setOptions(o.options ?? []);
            } catch (e) {
                if (!cancelled) setError((e as Error).message);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [siteId, patternId, childId, start]);

    return (
        <div style={{ display: "grid", gap: 10, paddingTop: 4 }} data-room-picker="true">
            {label("Choose a room")}
            {error && <ErrorNote message={error} />}
            {!options ? (
                <Thinking label="Evaluating rooms…" />
            ) : (
                <div style={{ display: "grid", gap: 6 }}>
                    {options.map((o) => {
                        const blocked = o.classification === "blocked";
                        const selected = o.roomId === selectedRoomId;
                        return (
                            <button key={o.roomId} type="button" disabled={blocked} onClick={() => onPick(o.roomId, o.roomName, o.classification === "recommended")} data-room-option={o.roomId}
                                style={{ all: "unset", cursor: blocked ? "not-allowed" : "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", border: selected ? `1px solid ${T.pine}` : `1px solid ${T.border}`, background: blocked ? "#f9fafb" : selected ? "rgba(0,162,131,.06)" : "#fff", borderRadius: 8, padding: "8px 12px", opacity: blocked ? 0.7 : 1 }}>
                                <span style={{ color: blocked ? T.muted : T.forge, minWidth: 0 }}>
                                    <span style={{ fontWeight: 600 }}>{o.roomName ?? "Room"}</span>
                                    <span style={{ color: T.muted, marginLeft: 8, fontSize: 11.5 }}>{o.reason}</span>
                                </span>
                                <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", color: o.classification === "recommended" ? T.pine : blocked ? T.ember : T.muted, flex: "0 0 auto" }}>
                                    {o.classification === "recommended" ? "Recommended" : o.classification === "blocked" ? "Ineligible" : "Eligible"}
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}
            <div style={{ display: "flex", borderTop: `1px solid ${T.border}`, paddingTop: 10 }}>
                <button type="button" onClick={onCancel} style={{ all: "unset", marginLeft: "auto", cursor: "pointer", fontSize: 12, fontWeight: 600, color: T.slate }}>
                    Cancel
                </button>
            </div>
        </div>
    );
}

// ── Small presentational pieces ──────────────────────────────────────────────
function Value({ children }: { children: ReactNode }) {
    return <span style={{ fontSize: 13, fontWeight: 600, color: T.forge }}>{children}</span>;
}
function Empty({ children }: { children: ReactNode }) {
    return <span style={{ fontSize: 12.5, color: T.muted, fontStyle: "italic" }}>{children}</span>;
}
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
    return { fontSize: 12.5, fontWeight: 600, color: "#fff", background: disabled ? "#98a2b3" : T.pine, border: "none", borderRadius: 7, padding: "8px 16px", cursor: disabled ? "default" : "pointer" };
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
    background: "#fff",
};
const patternChip: CSSProperties = { all: "unset", cursor: "pointer", fontSize: 11.5, fontWeight: 600, color: T.slate, background: T.stone, border: `1px solid ${T.border}`, borderRadius: 999, padding: "6px 11px" };
