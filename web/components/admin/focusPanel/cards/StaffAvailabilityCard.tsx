"use client";

import { useCallback, useEffect, useState } from "react";

import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import type { FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { FocusPanelCoordination } from "@/lib/adminV2/runtime/focusPanel/focusPanelCoordinationModel";
import {
    useDismissSignal,
    useReportPerspective,
} from "@/lib/adminV2/runtime/focusPanel/useFocusPanelCoordination";
import {
    NULL_EMPLOYMENT_SIGNAL,
    type OperationalContext,
} from "@/lib/adminV2/runtime/operationalContext/types";

type Props = {
    model: FocusPanelCardModel;
    context: OperationalContext;
    receded?: boolean;
    coordination?: FocusPanelCoordination;
};

type ExceptionRow = {
    id: string;
    exception_date: string;
    exception_kind: "unavailable" | "available";
    start_time: string | null;
    end_time: string | null;
    reason: string | null;
    is_active: boolean;
};

type CardState = {
    as_of: string;
    resolved: {
        date: string;
        weekday: number;
        available: boolean;
        windows: { start_time: string; end_time: string; source: "recurring" | "exception"; sourceId: string }[];
        provenance: {
            kind: "recurring" | "exception_unavailable" | "exception_available" | "no_pattern";
            exceptionId: string | null;
            reason: string | null;
            supersededRecurringIds: string[];
        };
    };
    recurring: {
        weekday: number;
        windows: { id: string; start_time: string; end_time: string; effective_start: string; effective_end: string | null }[];
    }[];
    upcoming_exceptions: ExceptionRow[];
    exceptions_all: ExceptionRow[];
};

const DAY_LABEL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** `07:30:00` → `7:30 AM`. Operator language, not a stored value. */
function clock(t: string): string {
    const m = /^(\d{2}):(\d{2})/.exec(t);
    if (!m) return t;
    const h = Number(m[1]);
    const suffix = h < 12 ? "AM" : "PM";
    const hour = h % 12 === 0 ? 12 : h % 12;
    return `${hour}:${m[2]} ${suffix}`;
}

function ymd(d: string): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
    if (!m) return d;
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${months[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
}

/**
 * Staff Availability card — "when can this Staff member work?"
 *
 * ── WHAT IT IS NOT ──
 *
 * Not a schedule. What the organization decided someone WILL work is a different
 * authority with a different card, and nothing here creates, changes or reads one.
 * Not presence either: "unavailable every Friday" is availability; "absent today"
 * is a fact about what happened.
 *
 * ── THE CONFLICT CASE IS NAMED, NOT SWALLOWED ──
 *
 * The resolver fails CLOSED when a date carries both an unavailable and an
 * available exception. Rendering that as ordinary unavailability would hide a
 * disagreement between two operators behind a word that looks routine, so the card
 * says the state is conflicting and shows both records. It introduces no workflow
 * for resolving it — cancelling one of the exceptions is the existing answer.
 */
export default function StaffAvailabilityCard({ model, context, receded = false, coordination }: Props) {
    const [expanded, setExpanded] = useState(false);
    const [state, setState] = useState<CardState | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [running, setRunning] = useState(false);
    const [adding, setAdding] = useState(false);
    const [form, setForm] = useState({ date: "", kind: "unavailable" as "unavailable" | "available", start: "", end: "", reason: "" });

    useReportPerspective(coordination, "staff_availability", expanded ? "focused" : "base");
    useDismissSignal(coordination, "staff_availability", () => setExpanded(false));

    const signal = context.employment ?? NULL_EMPLOYMENT_SIGNAL;
    const person = signal.primary ?? signal.people[0] ?? null;
    // The OPEN period. Availability hangs off an employment, and an ended one is
    // history: recording when someone can work against it would be a live intent on
    // a closed relationship.
    const employmentId = person?.employment.current?.id ?? null;

    const load = useCallback(async () => {
        if (!employmentId) { setState(null); return; }
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(
                `/api/admin/staff-availability?employment_id=${encodeURIComponent(employmentId)}`,
                { credentials: "include" },
            );
            const json = (await res.json()) as Partial<CardState> & { error?: string };
            if (!res.ok) {
                setError(json?.error || "Availability could not be read.");
                setState(null);
                return;
            }
            setState(json as CardState);
        } catch {
            setError("Availability could not be read.");
            setState(null);
        } finally {
            setLoading(false);
        }
    }, [employmentId]);

    useEffect(() => {
        // Clear FIRST: one person's availability must not linger over another's.
        setState(null);
        void load();
    }, [load]);

    const runCommand = useCallback(
        async (actionKey: string, payload: Record<string, unknown>) => {
            if (!person || running) return false;
            setRunning(true);
            setError(null);
            try {
                const res = await fetch("/api/admin/actions/execute", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({
                        action_key: actionKey,
                        entity_type: "person",
                        entity_id: person.personId,
                        mode: "execute",
                        confirmation: { confirmed: true },
                        payload,
                    }),
                });
                const json = (await res.json()) as { ok?: boolean; error?: string | { message?: string } };
                if (!json?.ok) {
                    // A refusal is the domain speaking. Surfaced verbatim.
                    setError((typeof json?.error === "string" ? json.error : json?.error?.message)
                        || "That availability change could not be completed.");
                    return false;
                }
                // Re-read rather than splicing: the pattern and the resolved answer
                // only agree if both come from the same read.
                await load();
                return true;
            } catch {
                setError("That availability change could not be completed.");
                return false;
            } finally {
                setRunning(false);
            }
        },
        [person, running, load],
    );

    if (!model.visible || !person || !employmentId) return null;

    const resolved = state?.resolved;
    const conflicting = Boolean(
        resolved
        && resolved.provenance.kind === "exception_unavailable"
        && state!.exceptions_all.some(
            (e) => e.is_active && e.exception_date === resolved.date && e.exception_kind === "available",
        ),
    );

    const insight = !state
        ? (loading ? "Reading availability…" : (error ?? "Availability unavailable"))
        : conflicting
          ? "Conflicting exceptions — treated as unavailable"
          : resolved?.available
            ? `Available today ${resolved.windows.map((w) => `${clock(w.start_time)}–${clock(w.end_time)}`).join(", ")}`
            : resolved?.provenance.kind === "exception_unavailable"
              ? "Unavailable today — exception"
              : state.recurring.length === 0
                ? "No availability pattern set"
                : "Not available today";

    const statusChip = state
        ? conflicting ? "Conflict" : (resolved?.available ? "Available" : "Unavailable")
        : null;
    const statusTone = conflicting ? "at-risk" : resolved?.available ? "ready" : "neutral";

    return (
        <div
            className="alloy-os-staff-availability"
            data-staff-availability-card="true"
            data-staff-availability-as-of={state?.as_of ?? ""}
            data-staff-availability-conflicting={conflicting ? "true" : "false"}
        >
            <UniversalCard
                title={model.title}
                insight={insight}
                supportingInsight={expanded ? null : (state ? `${state.recurring.length} day${state.recurring.length === 1 ? "" : "s"} in the weekly pattern` : null)}
                iconName={model.iconName}
                tier={model.tier}
                archetype={model.archetype}
                statusChip={statusChip}
                statusTone={statusTone}
                density={expanded ? "expanded" : (model.density ?? "compact")}
                gridSpan={model.span}
                data-universal-card-key={model.key}
                receded={receded}
                footerAction={
                    <button
                        type="button"
                        className="alloy-os-ucard__action alloy-os-ucard__action--system5"
                        onClick={() => setExpanded((v) => !v)}
                        data-staff-availability-action={expanded ? "collapse" : "expand"}
                    >
                        {expanded ? "← Back to panel" : "View availability"}
                    </button>
                }
            >
                {expanded && state ? (
                    <div className="alloy-os-staff-availability__expanded" data-staff-availability-expanded="true">
                        {error ? <p data-staff-availability-error="true">{error}</p> : null}

                        {conflicting ? (
                            <p data-staff-availability-conflict="true">
                                Two exceptions disagree about this date. Availability is treated as
                                unavailable until one of them is cancelled.
                            </p>
                        ) : null}

                        <section data-staff-availability-section="today">
                            <h4>Today</h4>
                            <p data-staff-availability-provenance={resolved?.provenance.kind}>
                                {resolved?.provenance.kind === "recurring" ? "From the weekly pattern"
                                    : resolved?.provenance.kind === "exception_available" ? "From a dated exception"
                                    : resolved?.provenance.kind === "exception_unavailable"
                                        ? `Unavailable by exception${resolved.provenance.reason ? ` — ${resolved.provenance.reason}` : ""}`
                                        : "No pattern in force"}
                            </p>
                        </section>

                        <section data-staff-availability-section="recurring">
                            <h4>Usual week</h4>
                            {state.recurring.length === 0 ? (
                                <p data-staff-availability-empty="recurring">No recurring availability set.</p>
                            ) : (
                                <ul>
                                    {state.recurring.map((d) => (
                                        <li key={d.weekday} data-staff-availability-weekday={d.weekday}>
                                            <span data-staff-availability-day-label="true">{DAY_LABEL[d.weekday]}</span>
                                            {/* Several windows on one day is a split, shown as one line per window. */}
                                            <span data-staff-availability-windows={d.windows.length}>
                                                {d.windows.map((w) => `${clock(w.start_time)}–${clock(w.end_time)}`).join(", ")}
                                            </span>
                                            <span data-staff-availability-effective="true">
                                                From {ymd(d.windows[0]!.effective_start)}
                                                {d.windows[0]!.effective_end ? ` until ${ymd(d.windows[0]!.effective_end!)}` : ""}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>

                        <section data-staff-availability-section="exceptions">
                            <h4>Exceptions</h4>
                            <button
                                type="button"
                                disabled={running}
                                data-staff-availability-command="open-exception"
                                onClick={() => { setAdding(true); setForm({ date: "", kind: "unavailable", start: "", end: "", reason: "" }); }}
                            >
                                Add exception
                            </button>
                            {adding ? (
                                <form
                                    data-staff-availability-form="exception"
                                    onSubmit={async (e) => {
                                        e.preventDefault();
                                        const ok = await runCommand("staff_availability.add_exception", {
                                            employment_id: employmentId,
                                            exception_date: form.date,
                                            exception_kind: form.kind,
                                            // An unavailable exception carries no times: sending them
                                            // would store something the resolver ignores.
                                            start_time: form.kind === "available" ? form.start : null,
                                            end_time: form.kind === "available" ? form.end : null,
                                            reason: form.reason || null,
                                        });
                                        if (ok) setAdding(false);
                                    }}
                                >
                                    <input type="date" data-staff-availability-field="exception_date"
                                        value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
                                    <select data-staff-availability-field="exception_kind" value={form.kind}
                                        onChange={(e) => setForm({ ...form, kind: e.target.value as "unavailable" | "available" })}>
                                        <option value="unavailable">Unavailable all day</option>
                                        <option value="available">Available these hours</option>
                                    </select>
                                    {form.kind === "available" ? (
                                        <>
                                            <input type="time" data-staff-availability-field="start_time"
                                                value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} required />
                                            <input type="time" data-staff-availability-field="end_time"
                                                value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} required />
                                        </>
                                    ) : null}
                                    <input data-staff-availability-field="reason" placeholder="Reason (optional)"
                                        value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
                                    <button type="submit" disabled={running} data-staff-availability-form-action="save">Save</button>
                                    <button type="button" data-staff-availability-form-action="cancel" onClick={() => setAdding(false)}>Cancel</button>
                                </form>
                            ) : null}

                            {state.upcoming_exceptions.length === 0 ? (
                                <p data-staff-availability-empty="exceptions">No upcoming exceptions.</p>
                            ) : (
                                <ul>
                                    {state.upcoming_exceptions.map((e) => (
                                        <li key={e.id} data-staff-availability-exception-id={e.id}
                                            data-staff-availability-exception-kind={e.exception_kind}>
                                            <span data-staff-availability-exception-date="true">{ymd(e.exception_date)}</span>
                                            <span data-staff-availability-exception-label="true">
                                                {e.exception_kind === "unavailable"
                                                    ? "Unavailable"
                                                    : `Available ${clock(e.start_time!)}–${clock(e.end_time!)}`}
                                            </span>
                                            {e.reason ? <span data-staff-availability-exception-reason="true">{e.reason}</span> : null}
                                            <button
                                                type="button"
                                                disabled={running}
                                                data-staff-availability-command="cancel-exception"
                                                onClick={() => void runCommand("staff_availability.cancel_exception", {
                                                    employment_id: employmentId, exception_id: e.id,
                                                })}
                                            >
                                                Cancel
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>
                    </div>
                ) : null}
            </UniversalCard>
        </div>
    );
}
