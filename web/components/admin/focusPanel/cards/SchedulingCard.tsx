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
type Pattern = { id: string; label: string; weekdays: number[]; scheduleTypeKey: string };
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
    const children: SchedChild[] = evidence.children.map((c) => ({
        id: c.customerMemberId ?? c.id,
        name: c.name,
        program: c.program,
        room: c.room,
        schedule: c.schedule,
        startDate: c.startDate,
    }));

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
                    <ScheduleWorkSurface child={activeChild} onDone={() => setActiveChildId(null)} />
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
function ScheduleWorkSurface({ child, onDone }: { child: SchedChild; onDone: () => void }) {
    const [sites, setSites] = useState<Site[]>([]);
    const [siteId, setSiteId] = useState("");
    const [patterns, setPatterns] = useState<Pattern[]>([]);
    const [patternId, setPatternId] = useState("");
    const [days, setDays] = useState<number[]>([]);
    const [options, setOptions] = useState<PlacementOption[] | null>(null);
    const [roomId, setRoomId] = useState("");
    const [showAllRooms, setShowAllRooms] = useState(false);
    const [effStart, setEffStart] = useState("");
    const [effEnd, setEffEnd] = useState("");
    const [openEnded, setOpenEnded] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [done, setDone] = useState<string | null>(null);
    const [billing, setBilling] = useState<BillingProjection | null>(null);
    const [billingLoading, setBillingLoading] = useState(false);

    // Load sites, then patterns for the chosen site.
    useEffect(() => {
        (async () => {
            try {
                const s = await schedApi("?view=sites");
                setSites(s.sites ?? []);
                if ((s.sites ?? []).length) setSiteId(s.sites[0].id);
            } catch (e) {
                setError((e as Error).message);
            }
        })();
    }, []);
    useEffect(() => {
        if (!siteId) return;
        (async () => {
            try {
                const o = await schedApi(`?view=overview&site_location_id=${encodeURIComponent(siteId)}`);
                setPatterns(o.patterns ?? []);
                if ((o.patterns ?? []).length && !patternId) {
                    setPatternId(o.patterns[0].id);
                    setDays(o.patterns[0].weekdays ?? []);
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
        if (p) setDays(p.weekdays);
    }
    function toggleDay(i: number) {
        setDays((d) => (d.includes(i) ? d.filter((x) => x !== i) : [...d, i].sort((a, b) => a - b)));
    }

    // Recommended room: option generator evaluates all; UI leads with the pick.
    useEffect(() => {
        if (!siteId || !patternId) return;
        (async () => {
            try {
                const qs = `?view=options&site_location_id=${encodeURIComponent(siteId)}&pattern_id=${encodeURIComponent(patternId)}&child_agreement_id=${encodeURIComponent(child.id)}${effStart ? `&start_date=${effStart}` : ""}`;
                const o = await schedApi(qs).catch(() => ({ options: [] }));
                const opts: PlacementOption[] = o.options ?? [];
                setOptions(opts);
                const rec = opts.find((x) => x.classification === "recommended");
                if (rec) setRoomId(rec.roomId);
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
                    schedule_pattern_id: patternId,
                    room_location_id: roomId || null,
                    start_date: effStart || null,
                    end_date: openEnded ? null : effEnd || null,
                    site_location_id: siteId,
                    child_name: child.name,
                    room_label: chosen?.roomName ?? "",
                    pattern_label: patterns.find((p) => p.id === patternId)?.label ?? "",
                }),
            });
            void res;
            setDone(`Schedule saved for ${child.name.split(/\s+/)[0]}.`);
            setTimeout(onDone, 1300);
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

            {/* 1 · Weekly pattern (template) */}
            <section>
                {sectionLabel("Weekly pattern")}
                <select value={patternId} onChange={(e) => choosePattern(e.target.value)} style={selStyle}>
                    {patterns.map((p) => (
                        <option key={p.id} value={p.id}>{p.label}</option>
                    ))}
                </select>
            </section>

            {/* 2 · Days (define the real schedule) */}
            <section>
                {sectionLabel("Days")}
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

            {/* 3 · Site */}
            <section>
                {sectionLabel("Site")}
                <select value={siteId} onChange={(e) => setSiteId(e.target.value)} style={selStyle}>
                    {sites.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                </select>
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
                        <input type="checkbox" checked={openEnded} onChange={(e) => setOpenEnded(e.target.checked)} />
                        Open-ended
                    </label>
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
                <span style={{ color: "#98a2b3", marginLeft: 8, fontSize: 11.5 }}>{option.reason}</span>
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
