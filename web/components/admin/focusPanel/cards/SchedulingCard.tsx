"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";

import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import { buildChildrenCardEvidence } from "@/lib/adminV2/runtime/focusPanel/children/buildChildrenCardEvidence";
import type { FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { FocusPanelCoordination } from "@/lib/adminV2/runtime/focusPanel/focusPanelCoordinationModel";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

type Props = {
    model: FocusPanelCardModel;
    context: OperationalContext;
    receded?: boolean;
    coordination?: FocusPanelCoordination;
    composerPreview?: { perspective?: "expanded" };
};

type Site = { id: string; name: string };
type Pattern = { id: string; label: string; weekdays: number[] };
type PlacementOption = {
    roomId: string;
    roomName: string | null;
    classification: "recommended" | "eligible" | "blocked";
    reason: string;
    afterPeakOccupancy: number;
    blockers: string[];
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

/**
 * Scheduling card (case-grain) — the platform-owned operational schedule surface.
 * Resembles the frozen mockup: per child, a Schedule block (status · room·program ·
 * weekly pattern · effective dates) with a Create/Change action that opens an
 * inline builder (weekly pattern + room + start date) and commits through the
 * scheduling API. Children compose by navigation with the Children card.
 */
export default function SchedulingCard({ model, context, receded = false }: Props) {
    const evidence = useMemo(() => buildChildrenCardEvidence(context), [context]);
    const children = evidence.children;
    const count = children.length;

    const insight =
        count === 0
            ? "No children to schedule"
            : count === 1
              ? "1 child"
              : `${count} children`;

    return (
        <UniversalCard
            title={model.title}
            insight={insight}
            supportingInsight={count > 0 ? "Room · weekly pattern · effective dates" : null}
            iconName={model.iconName}
            tier={model.tier}
            archetype={model.archetype}
            statusChip={model.statusChip}
            statusTone={model.statusTone}
            density={model.density ?? "compact"}
            gridSpan={model.span}
            data-universal-card-key={model.key}
            receded={receded}
        >
            <div className="alloy-os-scheduling" data-scheduling-card="true">
                {count === 0 ? (
                    <p style={{ fontSize: 12.5, color: "var(--muted, #667085)" }}>
                        Link children to schedule them.
                    </p>
                ) : (
                    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
                        {children.map((child) => (
                            <SchedulingChildRow
                                key={child.id}
                                childId={child.customerMemberId ?? child.id}
                                name={child.name}
                                program={child.program}
                                room={child.room}
                                schedule={child.schedule}
                                startDate={child.startDate}
                                needsRoom={child.needsAttention || !child.room}
                            />
                        ))}
                    </ul>
                )}
            </div>
        </UniversalCard>
    );
}

function SchedulingChildRow(props: {
    childId: string;
    name: string;
    program: string | null;
    room: string | null;
    schedule: string | null;
    startDate: string | null;
    needsRoom: boolean;
}) {
    const [building, setBuilding] = useState(false);
    const firstName = props.name.split(/\s+/)[0] ?? props.name;
    const status = props.needsRoom ? "Needs a room" : "Scheduled";
    const roomLine = props.room
        ? `${props.room}${props.program ? ` · ${props.program}` : ""}`
        : props.program
          ? `${props.program} · full week`
          : "Not set";

    return (
        <li
            style={{
                border: "1px solid var(--border, #e4e7ec)",
                borderRadius: 10,
                padding: "10px 12px",
                background: props.needsRoom ? "rgba(234,179,8,.05)" : "#fff",
            }}
            data-scheduling-child={props.childId}
        >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "#98a2b3" }}>
                    Schedule
                </span>
                <span
                    style={{
                        fontSize: 10.5,
                        fontWeight: 600,
                        color: props.needsRoom ? "#b45309" : "#00a283",
                    }}
                >
                    {status}
                </span>
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#1d2939", marginTop: 2 }}>{props.name}</div>
            <div style={{ fontSize: 12.5, color: "#475467" }}>{roomLine}</div>
            <div style={{ fontSize: 12, color: "#475467" }}>{props.schedule ?? "Monday–Friday"}</div>
            <div style={{ fontSize: 11, color: "#98a2b3", marginTop: 1 }}>
                {props.startDate ? `Starts ${props.startDate}` : "Start date not set"}
            </div>
            <div style={{ marginTop: 8 }}>
                <button
                    type="button"
                    onClick={() => setBuilding((b) => !b)}
                    data-scheduling-action={props.needsRoom ? "place" : "change"}
                    style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#fff",
                        background: "#00a283",
                        border: "none",
                        borderRadius: 7,
                        padding: "5px 12px",
                        cursor: "pointer",
                    }}
                >
                    {building ? "Cancel" : props.needsRoom ? `Place ${firstName}` : "Change schedule"}
                </button>
            </div>
            {building && <ScheduleBuilder childId={props.childId} childName={props.name} onDone={() => setBuilding(false)} />}
        </li>
    );
}

function ScheduleBuilder({ childId, childName, onDone }: { childId: string; childName: string; onDone: () => void }) {
    const [sites, setSites] = useState<Site[]>([]);
    const [siteId, setSiteId] = useState("");
    const [patterns, setPatterns] = useState<Pattern[]>([]);
    const [patternId, setPatternId] = useState("");
    const [options, setOptions] = useState<PlacementOption[] | null>(null);
    const [roomId, setRoomId] = useState("");
    const [startDate, setStartDate] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [done, setDone] = useState<string | null>(null);

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
                if ((o.patterns ?? []).length) setPatternId((p) => p || o.patterns[0].id);
            } catch (e) {
                setError((e as Error).message);
            }
        })();
    }, [siteId]);

    const selectedWeekdays = patterns.find((p) => p.id === patternId)?.weekdays ?? [];

    async function commit() {
        setBusy(true);
        setError(null);
        try {
            const body = {
                customer_member_id: childId,
                schedule_pattern_id: patternId,
                room_location_id: roomId || null,
                start_date: startDate || null,
                site_location_id: siteId,
                child_name: childName,
                room_label: options?.find((o) => o.roomId === roomId)?.roomName ?? "",
                pattern_label: patterns.find((p) => p.id === patternId)?.label ?? "",
            };
            const res = await schedApi("", { method: "POST", body: JSON.stringify(body) });
            setDone(`Scheduled ${childName.split(/\s+/)[0]}.`);
            void res;
            setTimeout(onDone, 1200);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(false);
        }
    }

    const label = (s: string) => (
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "#98a2b3", marginBottom: 3 }}>{s}</div>
    );

    return (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px dashed #e4e7ec", display: "grid", gap: 10 }} data-schedule-builder="true">
            {error && <div style={{ fontSize: 11.5, color: "#b42318" }}>{error}</div>}
            {done ? (
                <div style={{ fontSize: 12.5, color: "#067647", fontWeight: 600 }}>{done}</div>
            ) : (
                <>
                    <div>
                        {label("Site")}
                        <select value={siteId} onChange={(e) => setSiteId(e.target.value)} style={selStyle}>
                            {sites.map((s) => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        {label("Weekly pattern")}
                        <select value={patternId} onChange={(e) => setPatternId(e.target.value)} style={selStyle}>
                            {patterns.map((p) => (
                                <option key={p.id} value={p.id}>{p.label}</option>
                            ))}
                        </select>
                        <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                            {WEEKDAYS.map((d, idx) => {
                                const on = selectedWeekdays.includes(d.i);
                                return (
                                    <span key={idx} style={{
                                        width: 22, height: 22, borderRadius: 6, display: "grid", placeItems: "center",
                                        fontSize: 11, fontWeight: 600,
                                        background: on ? "rgba(0,162,131,.12)" : "#f2f4f7",
                                        color: on ? "#00a283" : "#98a2b3",
                                        border: on ? "1px solid rgba(0,162,131,.4)" : "1px solid transparent",
                                    }}>{d.l}</span>
                                );
                            })}
                        </div>
                    </div>
                    <div>
                        {label("Room")}
                        <RoomPicker
                            siteId={siteId}
                            patternId={patternId}
                            childId={childId}
                            startDate={startDate}
                            value={roomId}
                            onChange={setRoomId}
                            onOptions={setOptions}
                        />
                    </div>
                    <div>
                        {label("Effective start")}
                        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={selStyle} />
                    </div>
                    <div style={{ fontSize: 11.5, color: "#667085" }}>Recurring tuition — pending Billing determination</div>
                    <button
                        type="button"
                        disabled={busy || !patternId || !roomId || !startDate}
                        onClick={commit}
                        data-schedule-commit="true"
                        style={{
                            fontSize: 12.5, fontWeight: 600, color: "#fff",
                            background: busy || !roomId || !startDate ? "#98a2b3" : "#00a283",
                            border: "none", borderRadius: 8, padding: "7px 14px",
                            cursor: busy ? "default" : "pointer", justifySelf: "start",
                        }}
                    >
                        {busy ? "Creating…" : "Create schedule"}
                    </button>
                </>
            )}
        </div>
    );
}

function RoomPicker(props: {
    siteId: string;
    patternId: string;
    childId: string;
    startDate: string;
    value: string;
    onChange: (v: string) => void;
    onOptions: (o: PlacementOption[]) => void;
}) {
    const [options, setOptions] = useState<PlacementOption[] | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!props.siteId || !props.patternId) return;
        setLoading(true);
        (async () => {
            try {
                // Options need an enrollment agreement; when absent (pre-enrolled), the
                // API returns an empty set and the operator picks a room directly.
                const qs = `?view=options&site_location_id=${encodeURIComponent(props.siteId)}&pattern_id=${encodeURIComponent(props.patternId)}&child_agreement_id=${encodeURIComponent(props.childId)}${props.startDate ? `&start_date=${props.startDate}` : ""}`;
                const o = await schedApi(qs).catch(() => ({ options: [] }));
                const opts: PlacementOption[] = o.options ?? [];
                setOptions(opts);
                props.onOptions(opts);
                const rec = opts.find((x) => x.classification === "recommended");
                if (rec) props.onChange(rec.roomId);
            } finally {
                setLoading(false);
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.siteId, props.patternId, props.startDate]);

    if (loading) return <div style={{ fontSize: 12, color: "#98a2b3" }}>Computing rooms…</div>;
    if (!options || options.length === 0) {
        return <div style={{ fontSize: 12, color: "#667085" }}>Rooms resolve once enrollment is created.</div>;
    }
    return (
        <div style={{ display: "grid", gap: 5 }}>
            {options.map((o) => {
                const disabled = o.classification === "blocked";
                const sel = props.value === o.roomId;
                return (
                    <button
                        key={o.roomId}
                        type="button"
                        disabled={disabled}
                        onClick={() => props.onChange(o.roomId)}
                        style={{
                            textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center",
                            border: sel ? "1px solid #00a283" : "1px solid #e4e7ec",
                            background: disabled ? "#f9fafb" : sel ? "rgba(0,162,131,.06)" : "#fff",
                            color: disabled ? "#98a2b3" : "#1d2939",
                            borderRadius: 8, padding: "6px 10px", cursor: disabled ? "not-allowed" : "pointer", fontSize: 12.5,
                        }}
                    >
                        <span>{o.roomName ?? o.roomId}<span style={{ color: "#98a2b3", marginLeft: 6, fontSize: 11 }}>{o.reason}</span></span>
                        <span style={{ fontSize: 10.5, fontWeight: 600, color: o.classification === "recommended" ? "#00a283" : "#98a2b3" }}>{o.classification}</span>
                    </button>
                );
            })}
        </div>
    );
}

const selStyle: CSSProperties = {
    width: "100%",
    fontSize: 12.5,
    padding: "5px 8px",
    borderRadius: 7,
    border: "1px solid #e4e7ec",
    background: "#fff",
    color: "#1d2939",
};
