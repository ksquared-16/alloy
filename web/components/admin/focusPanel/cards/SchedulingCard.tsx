"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";

import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import { buildChildrenCardEvidence } from "@/lib/adminV2/runtime/focusPanel/children/buildChildrenCardEvidence";
import type { FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { FocusPanelCoordination } from "@/lib/adminV2/runtime/focusPanel/focusPanelCoordinationModel";
import {
    useDismissSignal,
    useReportPerspective,
} from "@/lib/adminV2/runtime/focusPanel/useFocusPanelCoordination";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

type Props = {
    model: FocusPanelCardModel;
    context: OperationalContext;
    receded?: boolean;
    coordination?: FocusPanelCoordination;
    composerPreview?: { perspective?: "expanded" };
};

type Site = { id: string; name: string };
type DailyHours = { arrive: string; depart: string };
type Pattern = { id: string; label: string; weekdays: number[]; scheduleTypeKey: string; defaultHours: DailyHours | null; defaultOpenEnded: boolean };
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
type PlacementOption = {
    roomId: string;
    roomName: string | null;
    classification: "recommended" | "eligible" | "blocked";
    reason: string;
    afterPeakOccupancy: number;
    blockers: string[];
};

type SchedChild = {
    id: string;
    ocmId: string | null;
    personId: string | null;
    name: string;
    program: string | null;
    room: string | null;
    schedule: string | null;
    startDate: string | null;
};

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

async function schedApi(path: string, init?: RequestInit): Promise<any> {
    const res = await fetch(`/api/admin/scheduling${path}`, {
        ...init,
        headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`);
    return body;
}

/** Durable status word (identity) — the room is one attribute of the schedule. */
function statusFor(child: SchedChild): string {
    if (child.room && child.schedule) return "Scheduled";
    if (child.schedule) return "Proposed schedule";
    return "Needs schedule";
}

/**
 * Scheduling card — the "what is true?" identity surface. Per child, a durable
 * schedule status + facts; clicking a child opens the Scheduling WORK surface in
 * the center (the Household/Children/Billing expand pattern) where the operator
 * builds the schedule. The card never edits inline.
 */
export default function SchedulingCard({ model, context, receded = false, coordination, composerPreview }: Props) {
    const evidence = useMemo(() => buildChildrenCardEvidence(context), [context]);
    // Raw inquiry-child blocks carry the writable enrollment record id (`ocm_id`),
    // which the evidence child does not surface. Align by index (same source order).
    const rawInquiry = Array.isArray((context.truth as Record<string, unknown>)?._inquiry_children)
        ? ((context.truth as Record<string, unknown>)._inquiry_children as Record<string, unknown>[])
        : [];
    const children: SchedChild[] = evidence.children.map((c, i) => {
        const raw = rawInquiry[i] ?? {};
        const ocmId =
            (raw.ocm_id != null ? String(raw.ocm_id) : null) ?? (raw.id != null ? String(raw.id) : null);
        return {
            id: c.customerMemberId ?? c.id,
            ocmId,
            personId: c.personId ?? null,
            name: c.name,
            program: c.program,
            room: c.room,
            schedule: c.schedule,
            startDate: c.startDate,
        };
    });

    const [activeChildId, setActiveChildId] = useState<string | null>(null);
    useEffect(() => {
        if (composerPreview?.perspective === "expanded" && children[0]) setActiveChildId(children[0].id);
    }, [composerPreview, children]);

    const activeChild = children.find((c) => c.id === activeChildId) ?? null;
    useReportPerspective(coordination, "scheduling", activeChild ? "focused" : "base");
    useDismissSignal(coordination, "scheduling", () => setActiveChildId(null));

    const insight = children.length === 0 ? "No children to schedule" : children.length === 1 ? "1 child" : `${children.length} children`;

    const footerAction = activeChild ? (
        <button type="button" className="alloy-os-ucard__action alloy-os-ucard__action--system5" onClick={() => setActiveChildId(null)}>
            ← Back to panel
        </button>
    ) : null;

    return (
        <UniversalCard
            title={model.title}
            insight={activeChild ? `Schedule · ${activeChild.name}` : insight}
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
            footerAction={footerAction}
        >
            <div data-scheduling-card="true">
                {activeChild ? (
                    <ScheduleWorkSurface
                        child={activeChild}
                        opportunityId={context.subject.type === "opportunity" ? context.subject.id : null}
                        onDone={() => setActiveChildId(null)}
                    />
                ) : children.length === 0 ? (
                    <p style={{ fontSize: 12.5, color: "#667085" }}>Link children to schedule them.</p>
                ) : (
                    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
                        {children.map((child) => (
                            <li key={child.id} data-scheduling-child={child.id}>
                                <button
                                    type="button"
                                    onClick={() => setActiveChildId(child.id)}
                                    data-scheduling-open={child.id}
                                    style={rowBtnStyle}
                                >
                                    <span style={{ display: "grid", gap: 1 }}>
                                        <span style={{ fontSize: 13.5, fontWeight: 600, color: "#1d2939" }}>{child.name}</span>
                                        <span style={{ fontSize: 11.5, color: "#475467" }}>
                                            {child.room ? `${child.room} · ` : ""}
                                            {child.schedule ?? "Monday–Friday"}
                                            {child.startDate ? ` · from ${child.startDate}` : ""}
                                        </span>
                                    </span>
                                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                        <span style={{ fontSize: 10.5, fontWeight: 600, color: statusFor(child) === "Scheduled" ? "#00a283" : "#667085" }}>
                                            {statusFor(child)}
                                        </span>
                                        <span style={{ color: "#98a2b3" }}>›</span>
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </UniversalCard>
    );
}

/**
 * The Scheduling work surface (opens in the center on child click). Flow:
 * Weekly Pattern → Days → Site → Recommended Room → Effective Dates →
 * Financial Preview → Save. Neutral styling — a work surface, not a form.
 */
function ScheduleWorkSurface({ child, opportunityId, onDone }: { child: SchedChild; opportunityId: string | null; onDone: () => void }) {
    const [sites, setSites] = useState<Site[]>([]);
    const [siteId, setSiteId] = useState("");
    // The site is "context-established" when the operational subject resolved one
    // (or only one site exists) — we then present it as a fact, not a choice.
    const [siteFromContext, setSiteFromContext] = useState(false);
    const [patterns, setPatterns] = useState<Pattern[]>([]);
    const [patternId, setPatternId] = useState("");
    const [days, setDays] = useState<number[]>([]);
    const [options, setOptions] = useState<PlacementOption[] | null>(null);
    const [roomId, setRoomId] = useState("");
    const [showAllRooms, setShowAllRooms] = useState(false);
    const [effStart, setEffStart] = useState("");
    const [effEnd, setEffEnd] = useState("");
    const [openEnded, setOpenEnded] = useState(true);
    // Daily time ranges — part of the schedule definition. A schedule-wide default
    // (seeded from the pattern's configured hours when present) plus optional per-day
    // overrides. Empty until set — never synthesized.
    const [arrive, setArrive] = useState("");
    const [depart, setDepart] = useState("");
    const [perDayOpen, setPerDayOpen] = useState(false);
    const [perDay, setPerDay] = useState<Record<number, DailyHours>>({});
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [done, setDone] = useState<string | null>(null);
    const [billing, setBilling] = useState<BillingProjection | null>(null);
    const [billingLoading, setBillingLoading] = useState(false);

    // Load sites, then patterns for the chosen site. The site is resolved from the
    // operational subject when possible (the lead's established site), so the operator
    // isn't asked to choose one that context already fixes.
    useEffect(() => {
        (async () => {
            try {
                const s = await schedApi(`?view=sites${opportunityId ? `&opportunity_id=${encodeURIComponent(opportunityId)}` : ""}`);
                const siteList: Site[] = s.sites ?? [];
                setSites(siteList);
                const resolved: string | null = s.resolvedSiteId ?? null;
                if (resolved) {
                    setSiteId(resolved);
                    setSiteFromContext(true);
                } else if (siteList.length === 1) {
                    setSiteId(siteList[0].id);
                    setSiteFromContext(true);
                } else if (siteList.length) {
                    // Genuinely ambiguous — default to the first but let the operator choose.
                    setSiteId(siteList[0].id);
                    setSiteFromContext(false);
                }
            } catch (e) {
                setError((e as Error).message);
            }
        })();
    }, [opportunityId]);
    useEffect(() => {
        if (!siteId) return;
        (async () => {
            try {
                const o = await schedApi(`?view=overview&site_location_id=${encodeURIComponent(siteId)}`);
                setPatterns(o.patterns ?? []);
                if ((o.patterns ?? []).length && !patternId) {
                    const first = o.patterns[0] as Pattern;
                    setPatternId(first.id);
                    setDays(first.weekdays ?? []);
                    if (first.defaultHours) {
                        setArrive((a) => a || first.defaultHours!.arrive);
                        setDepart((d) => d || first.defaultHours!.depart);
                    }
                    setOpenEnded(first.defaultOpenEnded);
                }
            } catch (e) {
                setError((e as Error).message);
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [siteId]);

    // Pattern initializes the day selection; days then define the schedule.
    function choosePattern(id: string) {
        setPatternId(id);
        const p = patterns.find((x) => x.id === id);
        if (p) {
            setDays(p.weekdays);
            // Seed the schedule's daily hours from the pattern's configured default,
            // but never overwrite hours the operator already entered.
            if (p.defaultHours) {
                setArrive((a) => a || p.defaultHours!.arrive);
                setDepart((d) => d || p.defaultHours!.depart);
            }
            // Open-ended follows the pattern's configured policy (config-driven default).
            setOpenEnded(p.defaultOpenEnded);
        }
    }

    // The schedule-definition times payload sent on save. A default range (both ends
    // valid + ordered) and per-day overrides restricted to the selected days.
    const validRange = (r: DailyHours | undefined | null): r is DailyHours =>
        !!r && !!r.arrive && !!r.depart && r.depart > r.arrive;
    function buildTimesPayload(): { default: DailyHours | null; perDay: Record<string, DailyHours> } | null {
        const def = validRange({ arrive, depart }) ? { arrive, depart } : null;
        const pd: Record<string, DailyHours> = {};
        if (perDayOpen) {
            for (const [k, v] of Object.entries(perDay)) {
                if (days.includes(Number(k)) && validRange(v)) pd[k] = v;
            }
        }
        return def || Object.keys(pd).length ? { default: def, perDay: pd } : null;
    }
    function toggleDay(i: number) {
        setDays((d) => (d.includes(i) ? d.filter((x) => x !== i) : [...d, i].sort((a, b) => a - b)));
    }

    // The day pills are the source of truth. The pattern is a starting template;
    // once the operator edits the days away from it, the schedule is "Custom".
    const selectedPattern = patterns.find((p) => p.id === patternId) ?? null;
    const daysKey = [...days].sort((a, b) => a - b).join(",");
    const isCustom =
        days.length > 0 &&
        !!selectedPattern &&
        daysKey !== [...(selectedPattern.weekdays ?? [])].sort((a, b) => a - b).join(",");

    // Recommended room: option generator evaluates all; UI leads with the pick.
    useEffect(() => {
        if (!siteId || !patternId) return;
        (async () => {
            try {
                const qs = `?view=options&site_location_id=${encodeURIComponent(siteId)}&pattern_id=${encodeURIComponent(patternId)}&child_agreement_id=${encodeURIComponent(child.id)}${effStart ? `&start_date=${effStart}` : ""}`;
                const o = await schedApi(qs).catch(() => ({ options: [] }));
                const opts: PlacementOption[] = o.options ?? [];
                setOptions(opts);
                // Preselect the recommended room, but never clobber an existing choice
                // (e.g. when the date changes and options refetch).
                const rec = opts.find((x) => x.classification === "recommended");
                setRoomId((prev) => prev || rec?.roomId || "");
            } catch { /* non-fatal */ }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [siteId, patternId, effStart]);

    const recommended = options?.find((o) => o.classification === "recommended") ?? null;
    const chosen = options?.find((o) => o.roomId === roomId) ?? recommended;

    // Financial preview — Billing projection for the schedule (updates as it changes).
    useEffect(() => {
        if (!siteId || !patternId) return;
        const pat = patterns.find((p) => p.id === patternId);
        const scheduleType = pat?.scheduleTypeKey ?? "";
        setBillingLoading(true);
        (async () => {
            try {
                const qs = `?view=billing&site_location_id=${encodeURIComponent(siteId)}&customer_member_id=${encodeURIComponent(child.id)}&schedule_type=${encodeURIComponent(scheduleType)}${effStart ? `&start_date=${effStart}` : ""}`;
                const b = await schedApi(qs);
                setBilling(b.projection ?? null);
            } catch {
                setBilling(null);
            } finally {
                setBillingLoading(false);
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [siteId, patternId, effStart, patterns.length]);

    async function save() {
        setBusy(true);
        setError(null);
        try {
            const res = await schedApi("", {
                method: "POST",
                body: JSON.stringify({
                    customer_member_id: child.id,
                    opportunity_customer_member_id: child.ocmId,
                    person_id: child.personId,
                    opportunity_id: opportunityId,
                    schedule_pattern_id: patternId,
                    room_location_id: roomId || null,
                    start_date: effStart || null,
                    end_date: openEnded ? null : effEnd || null,
                    times: buildTimesPayload(),
                    site_location_id: siteId,
                    child_name: child.name,
                    room_label: chosen?.roomName ?? "",
                    pattern_label: patterns.find((p) => p.id === patternId)?.label ?? "",
                }),
            });
            setDone(res?.message ?? `Schedule saved for ${child.name.split(/\s+/)[0]}.`);
            setTimeout(onDone, 1600);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(false);
        }
    }

    if (done) return <div style={{ fontSize: 13, color: "#067647", fontWeight: 600, padding: "8px 0" }}>{done}</div>;

    return (
        <div style={{ display: "grid", gap: 14, paddingTop: 4 }} data-schedule-surface="true">
            {error && (
                <div style={{ fontSize: 12, color: "#b42318", background: "#fef3f2", border: "1px solid #fecdca", borderRadius: 8, padding: "8px 10px" }}>
                    {error}
                </div>
            )}

            {/* 1 · Weekly pattern — a compact starting template; the day pills are the schedule */}
            <section>
                {sectionLabel("Start from a pattern")}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }} data-pattern-selector="true">
                    {patterns.map((p) => {
                        const on = !isCustom && p.id === patternId;
                        return (
                            <button
                                key={p.id}
                                type="button"
                                onClick={() => choosePattern(p.id)}
                                data-pattern={p.id}
                                aria-pressed={on}
                                style={patternChipStyle(on)}
                            >
                                {p.label}
                            </button>
                        );
                    })}
                    {isCustom && (
                        <span data-pattern-custom="true" style={patternChipStyle(true, true)}>
                            Custom
                        </span>
                    )}
                </div>
            </section>

            {/* 2 · Days (define the real schedule — the source of truth) */}
            <section>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 5 }}>
                    <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "#98a2b3" }}>
                        Days
                    </div>
                    {isCustom && selectedPattern && (
                        <button type="button" onClick={() => choosePattern(patternId)} style={{ ...linkBtnStyle, fontSize: 10.5 }}>
                            Reset to {selectedPattern.label} →
                        </button>
                    )}
                </div>
                <div style={{ display: "flex", gap: 5 }}>
                    {WEEKDAYS.map((d, idx) => {
                        const on = days.includes(d.i);
                        return (
                            <button
                                key={idx}
                                type="button"
                                onClick={() => toggleDay(d.i)}
                                data-day={d.i}
                                aria-pressed={on}
                                style={{
                                    width: 30, height: 30, borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                                    background: on ? "rgba(0,162,131,.12)" : "#f2f4f7",
                                    color: on ? "#00a283" : "#98a2b3",
                                    border: on ? "1px solid rgba(0,162,131,.45)" : "1px solid transparent",
                                }}
                            >
                                {d.l}
                            </button>
                        );
                    })}
                </div>
            </section>

            {/* 2b · Daily hours — part of the schedule definition (default + per-day) */}
            <section data-daily-hours="true">
                {sectionLabel("Daily hours")}
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <label style={fieldLabelStyle}>
                        <span style={{ fontSize: 10.5, color: "#98a2b3" }}>Arrive</span>
                        <input type="time" value={arrive} onChange={(e) => setArrive(e.target.value)} data-arrive="true" style={{ ...selStyle, width: 130 }} />
                    </label>
                    <label style={fieldLabelStyle}>
                        <span style={{ fontSize: 10.5, color: "#98a2b3" }}>Depart</span>
                        <input type="time" value={depart} onChange={(e) => setDepart(e.target.value)} data-depart="true" style={{ ...selStyle, width: 130 }} />
                    </label>
                    {days.length > 1 && (
                        <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#475467", marginTop: 14 }}>
                            <input type="checkbox" checked={perDayOpen} onChange={(e) => setPerDayOpen(e.target.checked)} data-perday-toggle="true" />
                            Different times per day
                        </label>
                    )}
                </div>
                {arrive && depart && depart <= arrive && (
                    <div style={{ fontSize: 11, color: "#b42318", marginTop: 4 }}>Depart must be after arrive.</div>
                )}
                {perDayOpen && (
                    <div style={{ display: "grid", gap: 5, marginTop: 8 }} data-perday-grid="true">
                        {WEEKDAYS.filter((d) => days.includes(d.i)).map((d) => {
                            const row = perDay[d.i] ?? { arrive: "", depart: "" };
                            const setRow = (patch: Partial<DailyHours>) =>
                                setPerDay((prev) => ({ ...prev, [d.i]: { ...row, ...patch } }));
                            return (
                                <div key={d.i} style={{ display: "flex", gap: 8, alignItems: "center" }} data-perday-row={d.i}>
                                    <span style={{ width: 26, fontSize: 11.5, fontWeight: 600, color: "#475467" }}>{WEEKDAY_LABEL[d.i]}</span>
                                    <input type="time" value={row.arrive} onChange={(e) => setRow({ arrive: e.target.value })} placeholder={arrive} style={{ ...selStyle, width: 120 }} />
                                    <span style={{ color: "#98a2b3", fontSize: 11 }}>→</span>
                                    <input type="time" value={row.depart} onChange={(e) => setRow({ depart: e.target.value })} placeholder={depart} style={{ ...selStyle, width: 120 }} />
                                </div>
                            );
                        })}
                        <span style={{ fontSize: 10.5, color: "#98a2b3" }}>Blank rows use the default hours above.</span>
                    </div>
                )}
            </section>

            {/* 3 · Site — a fact when context establishes it; a choice only when ambiguous */}
            <section>
                {sectionLabel("Site")}
                {siteFromContext ? (
                    <div data-schedule-site-context="true" style={{ fontSize: 13, fontWeight: 600, color: "#1d2939", display: "flex", alignItems: "center", gap: 6 }}>
                        {sites.find((s) => s.id === siteId)?.name ?? "Site"}
                        {sites.length > 1 && (
                            <button type="button" onClick={() => setSiteFromContext(false)} style={linkBtnStyle}>
                                Change →
                            </button>
                        )}
                    </div>
                ) : (
                    <select value={siteId} onChange={(e) => setSiteId(e.target.value)} style={selStyle} data-schedule-site-select="true">
                        {sites.map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                    </select>
                )}
            </section>

            {/* 4 · Recommended room (alternatives collapsed) */}
            <section>
                {sectionLabel("Room")}
                {!options ? (
                    <div style={{ fontSize: 12, color: "#98a2b3" }}>Evaluating rooms…</div>
                ) : options.length === 0 ? (
                    <div style={{ fontSize: 12, color: "#667085" }}>Rooms resolve once enrollment is created.</div>
                ) : !showAllRooms && recommended ? (
                    <div style={{ display: "grid", gap: 6 }}>
                        <RoomRow option={chosen ?? recommended} selected recommended />
                        <button type="button" onClick={() => setShowAllRooms(true)} style={linkBtnStyle}>
                            Change room →
                        </button>
                    </div>
                ) : (
                    <div style={{ display: "grid", gap: 5 }}>
                        {options.map((o) => (
                            <button
                                key={o.roomId}
                                type="button"
                                disabled={o.classification === "blocked"}
                                onClick={() => setRoomId(o.roomId)}
                                style={{ all: "unset", cursor: o.classification === "blocked" ? "not-allowed" : "pointer", display: "block" }}
                            >
                                <RoomRow option={o} selected={o.roomId === roomId} recommended={o.classification === "recommended"} />
                            </button>
                        ))}
                        {recommended && (
                            <button type="button" onClick={() => setShowAllRooms(false)} style={linkBtnStyle}>
                                ← Use recommended
                            </button>
                        )}
                    </div>
                )}
            </section>

            {/* 5 · Effective dates (start + optional end / open-ended) */}
            <section>
                {sectionLabel("Effective dates")}
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <label style={fieldLabelStyle}>
                        <span style={{ fontSize: 10.5, color: "#98a2b3" }}>Start</span>
                        <input type="date" value={effStart} onChange={(e) => setEffStart(e.target.value)} style={{ ...selStyle, width: 150 }} />
                    </label>
                    <label style={fieldLabelStyle}>
                        <span style={{ fontSize: 10.5, color: "#98a2b3" }}>End</span>
                        <input
                            type="date"
                            value={effEnd}
                            disabled={openEnded}
                            onChange={(e) => setEffEnd(e.target.value)}
                            style={{ ...selStyle, width: 150, opacity: openEnded ? 0.5 : 1 }}
                        />
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#475467", marginTop: 14 }}>
                        <input type="checkbox" checked={openEnded} onChange={(e) => setOpenEnded(e.target.checked)} data-open-ended={openEnded ? "true" : "false"} />
                        Open-ended
                    </label>
                </div>
                <div style={{ fontSize: 10.5, color: "#98a2b3", marginTop: 4 }} data-open-ended-caption="true">
                    {openEnded ? "Ongoing — no end date; ends later via a change." : "Bounded — ends on the date above."}
                </div>
            </section>

            {/* 6 · Financial preview (Billing owns the amounts; Scheduling displays) */}
            <section style={{ background: "#f9fafb", border: "1px solid #eaecf0", borderRadius: 10, padding: "10px 12px" }}>
                {sectionLabel("Recurring tuition")}
                {billingLoading ? (
                    <div style={{ fontSize: 12.5, color: "#98a2b3" }}>Calculating…</div>
                ) : !billing || billing.status === "unconfigured" || !billing.totals ? (
                    <div style={{ fontSize: 12.5, color: "#667085" }}>
                        Pending — Billing not yet configured for this schedule.
                    </div>
                ) : (
                    <div style={{ display: "grid", gap: 4 }}>
                        <FinRow label={billing.recommendedRate?.name ?? "Base tuition"} value={money(billing.totals.baseRecurringTuition, billing.totals.recurringFrequency)} />
                        {billing.discounts.map((d, i) => (
                            <FinRow key={i} label={d.name} value={`− ${money(d.amount)}`} muted />
                        ))}
                        {billing.funding.map((f, i) => (
                            <FinRow key={i} label={f.name} value={`− ${money(f.projectedAmount)}`} muted />
                        ))}
                        <div style={{ borderTop: "1px solid #eaecf0", marginTop: 3, paddingTop: 5 }}>
                            <FinRow label="Family responsibility" value={money(billing.totals.familyResponsibility, billing.totals.recurringFrequency)} strong />
                        </div>
                    </div>
                )}
            </section>

            {/* 7 · Save */}
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <button
                    type="button"
                    disabled={busy || !patternId || !roomId || !effStart || days.length === 0}
                    onClick={save}
                    data-schedule-commit="true"
                    style={{
                        fontSize: 13, fontWeight: 600, color: "#fff",
                        background: busy || !roomId || !effStart || days.length === 0 ? "#98a2b3" : "#00a283",
                        border: "none", borderRadius: 8, padding: "8px 16px", cursor: busy ? "default" : "pointer",
                    }}
                >
                    {busy ? "Saving…" : "Save schedule"}
                </button>
                <button type="button" onClick={onDone} style={linkBtnStyle}>Cancel</button>
            </div>
        </div>
    );
}

function RoomRow({ option, selected, recommended }: { option: PlacementOption; selected?: boolean; recommended?: boolean }) {
    const blocked = option.classification === "blocked";
    return (
        <div
            style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                border: selected ? "1px solid #00a283" : "1px solid #e4e7ec",
                background: blocked ? "#f9fafb" : selected ? "rgba(0,162,131,.06)" : "#fff",
                color: blocked ? "#98a2b3" : "#1d2939",
                borderRadius: 8, padding: "8px 12px", fontSize: 13,
            }}
        >
            <span>
                <span style={{ fontWeight: 600 }}>{option.roomName ?? option.roomId}</span>
                <span data-room-reason={recommended ? "recommended" : undefined} style={{ color: "#98a2b3", marginLeft: 8, fontSize: 11.5 }}>{option.reason}</span>
            </span>
            <span style={{ fontSize: 10.5, fontWeight: 600, color: recommended ? "#00a283" : "#98a2b3" }}>
                {recommended ? "Recommended" : option.classification}
            </span>
        </div>
    );
}

function FinRow({ label, value, muted, strong }: { label: string; value: string; muted?: boolean; strong?: boolean }) {
    return (
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: strong ? 13 : 12.5, fontWeight: strong ? 700 : 500, color: muted ? "#667085" : "#1d2939" }}>
            <span>{label}</span>
            <span>{value}</span>
        </div>
    );
}

function sectionLabel(s: string) {
    return (
        <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "#98a2b3", marginBottom: 5 }}>
            {s}
        </div>
    );
}

const rowBtnStyle: CSSProperties = {
    all: "unset",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    boxSizing: "border-box",
    cursor: "pointer",
    border: "1px solid #e4e7ec",
    borderRadius: 10,
    padding: "9px 12px",
    background: "#fff",
};
const selStyle: CSSProperties = {
    width: "100%",
    fontSize: 13,
    padding: "6px 9px",
    borderRadius: 8,
    border: "1px solid #e4e7ec",
    background: "#fff",
    color: "#1d2939",
    boxSizing: "border-box",
};
const linkBtnStyle: CSSProperties = {
    all: "unset",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 600,
    color: "#00a283",
};
const fieldLabelStyle: CSSProperties = { display: "grid", gap: 3 };
function patternChipStyle(on: boolean, custom = false): CSSProperties {
    return {
        all: "unset",
        cursor: custom ? "default" : "pointer",
        fontSize: 12,
        fontWeight: 600,
        lineHeight: 1,
        padding: "7px 11px",
        borderRadius: 999,
        boxSizing: "border-box",
        background: on ? "rgba(0,162,131,.12)" : "#f2f4f7",
        color: on ? "#00a283" : "#667085",
        border: on ? "1px solid rgba(0,162,131,.45)" : "1px solid transparent",
    };
}
