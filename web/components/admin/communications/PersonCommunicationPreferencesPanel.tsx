"use client";

/**
 * "Communication preferences" for one person — on the Household card's contact edit.
 *
 * Reads and writes `/api/admin/persons/[id]/communication-preferences` (the canonical consent store,
 * the one every send path enforces). Shows:
 *   - Preferred channel (advisory: how staff choose to reach out);
 *   - Text messages and Email: Allowed / Opted out, with who changed it last;
 *   - what cannot be changed here and why (a STOP or unsubscribe is the person's own; marketing needs
 *     the person's own opt-in; essential messages are always allowed).
 */
import { useCallback, useEffect, useState } from "react";

type Row = {
    key: string;
    label: string;
    description: string;
    channel: "email" | "sms";
    control: "always_allowed" | "opt_out" | "opt_in";
    state: "opted_in" | "opted_out" | "unset";
    allowedChanges: Array<"Allowed" | "Blocked">;
    lockedReason: string | null;
    lastChange: { source: string | null; at: string } | null;
};
type View = {
    personId: string;
    preferredChannel: string | null;
    preferredChannelOptions: Array<{ value: string; label: string }>;
    preferences: Row[];
};

const SOURCE_LABEL: Record<string, string> = {
    sms_keyword: "texted STOP/START",
    recipient_unsubscribe: "unsubscribe link",
    operator_person_record: "staff",
    admin_command_center: "staff",
};

function stateLabel(row: Row): string {
    if (row.control === "always_allowed") return row.state === "opted_out" ? "Opted out" : "Always allowed";
    if (row.state === "opted_out") return "Opted out";
    if (row.control === "opt_in") return row.state === "opted_in" ? "Opted in" : "Not opted in";
    return "Allowed";
}

export default function PersonCommunicationPreferencesPanel({ personId }: { personId: string }) {
    const [view, setView] = useState<View | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState<string | null>(null);

    useEffect(() => {
        let live = true;
        void fetch(`/api/admin/persons/${encodeURIComponent(personId)}/communication-preferences`, { credentials: "include" })
            .then(async (r) => ({ ok: r.ok, status: r.status, json: (await r.json().catch(() => ({}))) as { data?: View; error?: string } }))
            .then(({ ok, status, json }) => {
                if (!live) return;
                if (status === 403) setError("You can view or change preferences with Communications access.");
                else if (!ok || !json.data) setError(json.error ?? "Preferences could not be read.");
                else setView(json.data);
            })
            .catch(() => live && setError("Preferences could not be read."));
        return () => {
            live = false;
        };
    }, [personId]);

    const patch = useCallback(
        async (key: string, body: Record<string, unknown>) => {
            setBusy(key);
            setError(null);
            try {
                const res = await fetch(`/api/admin/persons/${encodeURIComponent(personId)}/communication-preferences`, {
                    method: "PATCH",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                });
                const json = (await res.json().catch(() => ({}))) as { data?: View; error?: string };
                if (!res.ok || !json.data) throw new Error(json.error ?? "The preference could not be saved.");
                setView(json.data);
            } catch (e) {
                setError((e as Error).message);
            } finally {
                setBusy(null);
            }
        },
        [personId],
    );

    // The operator's two everyday switches: routine texts and routine email.
    const routine = (view?.preferences ?? []).filter((p) => p.control === "opt_out");
    const others = (view?.preferences ?? []).filter((p) => p.control !== "opt_out");
    return (
        <section className="mt-3 rounded-lg border border-alloy-midnight/10 bg-white p-3" data-person-communication-preferences="panel">
            <h4 className="text-[12px] font-semibold text-alloy-midnight">Communication preferences</h4>
            {error ? (
                <p className="mt-1 text-[11.5px] text-alloy-ember" role="alert">
                    {error}
                </p>
            ) : null}
            {view ? (
                <div className="mt-2 space-y-2 text-[12px]">
                    <label className="flex items-center justify-between gap-2">
                        <span className="text-alloy-midnight/70">Preferred</span>
                        <select
                            value={view.preferredChannel ?? ""}
                            disabled={busy !== null}
                            onChange={(e) => void patch("preferred", { preferred_channel: e.target.value || null })}
                            className="rounded border border-alloy-midnight/15 px-1.5 py-1 text-[12px]"
                            data-person-communication-preferences="preferred"
                        >
                            <option value="">No preference</option>
                            {view.preferredChannelOptions.map((o) => (
                                <option key={o.value} value={o.value}>
                                    {o.label}
                                </option>
                            ))}
                        </select>
                    </label>
                    {routine.map((row) => (
                        <div key={row.key} className="flex items-center justify-between gap-2" data-person-communication-preferences={row.key}>
                            <span className="text-alloy-midnight/70">{row.channel === "sms" ? "Text messages" : "Email"}</span>
                            {row.allowedChanges.length ? (
                                <select
                                    value={row.state === "opted_out" ? "Blocked" : "Allowed"}
                                    disabled={busy !== null}
                                    onChange={(e) => void patch(row.key, { field: row.key, status: e.target.value })}
                                    className="rounded border border-alloy-midnight/15 px-1.5 py-1 text-[12px]"
                                >
                                    <option value="Allowed">Allowed</option>
                                    <option value="Blocked">Opted out</option>
                                </select>
                            ) : (
                                <span className="text-right text-alloy-midnight" title={row.lockedReason ?? undefined}>
                                    {stateLabel(row)}
                                    {row.lockedReason ? <span className="block text-[10.5px] text-alloy-midnight/50">{row.lockedReason}</span> : null}
                                </span>
                            )}
                        </div>
                    ))}
                    <details className="text-[11px] text-alloy-midnight/60">
                        <summary className="cursor-pointer">Essential and marketing messages</summary>
                        <ul className="mt-1 space-y-1">
                            {others.map((row) => (
                                <li key={row.key} className="flex items-start justify-between gap-2">
                                    <span>{row.label}</span>
                                    <span className="text-right text-alloy-midnight">
                                        {stateLabel(row)}
                                        {row.allowedChanges.includes("Blocked") ? (
                                            <button
                                                type="button"
                                                disabled={busy !== null}
                                                onClick={() => void patch(row.key, { field: row.key, status: "Blocked" })}
                                                className="ml-2 underline"
                                            >
                                                Opt out
                                            </button>
                                        ) : null}
                                        {row.lockedReason ? <span className="block text-[10.5px] text-alloy-midnight/50">{row.lockedReason}</span> : null}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </details>
                    {routine.concat(others).some((r) => r.lastChange) ? (
                        <p className="text-[10.5px] text-alloy-midnight/45">
                            Last change:{" "}
                            {(() => {
                                const last = routine
                                    .concat(others)
                                    .filter((r) => r.lastChange)
                                    .sort((a, b) => (b.lastChange!.at > a.lastChange!.at ? 1 : -1))[0]!;
                                return `${last.label} · ${SOURCE_LABEL[last.lastChange!.source ?? ""] ?? last.lastChange!.source ?? "unknown"} · ${new Date(last.lastChange!.at).toLocaleDateString()}`;
                            })()}
                        </p>
                    ) : null}
                </div>
            ) : !error ? (
                <p className="mt-1 text-[11.5px] text-alloy-midnight/50">Loading…</p>
            ) : null}
        </section>
    );
}
