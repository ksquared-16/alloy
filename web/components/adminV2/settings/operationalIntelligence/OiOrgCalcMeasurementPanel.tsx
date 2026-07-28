"use client";

/**
 * Selected Future Room Capacity measurement workspace.
 * Observe · Target · History · Source (exact-version rebind).
 */

import { useCallback, useEffect, useState } from "react";
import {
    ConfigurationPrimaryButton,
    ConfigurationSecondaryButton,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import {
    ConfigEditorSection,
    ConfigWorkspaceCard,
    ConfigWorkspaceTabBar,
} from "@/components/adminV2/settings/configurationRuntime/workspace";
import type { OiOrgCalcHealth, OiOrgCalcMeasurement, OiOrgCalcObservation } from "@/lib/metrics/oiOrgCalcMeasurements";

type RoomOption = { id: string; label: string; siteLabel: string };
type Tab = "overview" | "observe" | "target" | "history" | "source";

const TABS: Array<{ key: Tab; label: string }> = [
    { key: "overview", label: "Overview" },
    { key: "observe", label: "Observe" },
    { key: "target", label: "Target" },
    { key: "history", label: "History" },
    { key: "source", label: "Source" },
];

function healthLabel(h: OiOrgCalcHealth): string {
    if (h === "on_goal") return "On goal";
    if (h === "below_goal") return "Below goal";
    if (h === "no_target") return "No target";
    return "Not available";
}

export default function OiOrgCalcMeasurementPanel({
    measurementId,
}: {
    measurementId: string;
}) {
    const [tab, setTab] = useState<Tab>("overview");
    const [measurement, setMeasurement] = useState<OiOrgCalcMeasurement | null>(null);
    const [history, setHistory] = useState<OiOrgCalcObservation[]>([]);
    const [rooms, setRooms] = useState<RoomOption[]>([]);
    const [roomId, setRoomId] = useState("");
    const [effectiveAt, setEffectiveAt] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() + 30);
        return d.toISOString().slice(0, 10);
    });
    const [observation, setObservation] = useState<OiOrgCalcObservation | null>(null);
    const [health, setHealth] = useState<OiOrgCalcHealth>("not_available");
    const [targetDraft, setTargetDraft] = useState("");
    const [newerVersions, setNewerVersions] = useState<Array<{ id: string; version_number: number }>>([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const reload = useCallback(async () => {
        const res = await fetch(`/api/admin/metrics/oi-org-calc-measurements/${measurementId}`);
        const json = (await res.json()) as {
            measurement?: OiOrgCalcMeasurement;
            history?: OiOrgCalcObservation[];
            error?: string;
        };
        if (!res.ok) throw new Error(json.error ?? "Load failed");
        setMeasurement(json.measurement ?? null);
        setHistory(json.history ?? []);
        setTargetDraft(
            json.measurement?.target?.value != null ? String(json.measurement.target.value) : "",
        );
    }, [measurementId]);

    useEffect(() => {
        void reload().catch((e) => setError(e instanceof Error ? e.message : "Load failed"));
        void (async () => {
            const res = await fetch("/api/admin/locations?hierarchy=1");
            const json = (await res.json()) as {
                locations?: Array<{
                    id: string;
                    label?: string | null;
                    location_type?: string | null;
                    parent_location_id?: string | null;
                }>;
            };
            if (!res.ok) return;
            const locs = json.locations ?? [];
            const byId = new Map(locs.map((l) => [l.id, l]));
            const opts = locs
                .filter((l) => String(l.location_type ?? "").toLowerCase() === "unit")
                .map((l) => ({
                    id: l.id,
                    label: String(l.label ?? "").trim() || "Untitled room",
                    siteLabel: String(byId.get(l.parent_location_id ?? "")?.label ?? "").trim() || "Site",
                }));
            setRooms(opts);
            if (opts[0]) setRoomId(opts[0].id);
        })();
    }, [reload]);

    useEffect(() => {
        if (!measurement) return;
        void (async () => {
            const res = await fetch(
                `/api/admin/organization-calculations/${measurement.source.calculation_id}`,
            );
            const json = (await res.json()) as {
                versions?: Array<{ id: string; version_number: number; immutable: boolean }>;
            };
            if (!res.ok) return;
            setNewerVersions(
                (json.versions ?? []).filter(
                    (v) =>
                        v.immutable
                        && v.id !== measurement.source.calculation_version_id
                        && v.version_number > measurement.source.version_number,
                ),
            );
        })();
    }, [measurement]);

    const observe = async () => {
        if (!roomId) {
            setError("Choose a room.");
            return;
        }
        setBusy(true);
        setError(null);
        try {
            const room = rooms.find((r) => r.id === roomId);
            const res = await fetch(`/api/admin/metrics/oi-org-calc-measurements/${measurementId}/observe`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    roomId,
                    effectiveAt,
                    roomLabel: room ? `${room.siteLabel} / ${room.label}` : null,
                }),
            });
            const json = (await res.json()) as {
                observation?: OiOrgCalcObservation;
                health?: OiOrgCalcHealth;
                error?: string;
            };
            if (!res.ok) throw new Error(friendlyError(json.error ?? "Observe failed"));
            setObservation(json.observation ?? null);
            setHealth(json.health ?? "not_available");
            await reload();
            setTab("observe");
        } catch (e) {
            setError(e instanceof Error ? e.message : "Observe failed");
        } finally {
            setBusy(false);
        }
    };

    const saveTarget = async () => {
        setBusy(true);
        setError(null);
        try {
            const res = await fetch(`/api/admin/metrics/oi-org-calc-measurements/${measurementId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    target_min_seats: targetDraft.trim() ? Number(targetDraft) : null,
                }),
            });
            const json = (await res.json()) as { error?: string };
            if (!res.ok) throw new Error(json.error ?? "Could not save target");
            await reload();
            if (observation) {
                // Refresh health against new target without new evaluate
                setHealth(
                    observation.availability === "resolved" && observation.value != null ?
                        !targetDraft.trim() ? "no_target"
                        : observation.value >= Number(targetDraft) ? "on_goal"
                        : "below_goal"
                    :   "not_available",
                );
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not save target");
        } finally {
            setBusy(false);
        }
    };

    const rebind = async (versionId: string) => {
        setBusy(true);
        setError(null);
        try {
            const res = await fetch(`/api/admin/metrics/oi-org-calc-measurements/${measurementId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ calculation_version_id: versionId }),
            });
            const json = (await res.json()) as { error?: string };
            if (!res.ok) throw new Error(json.error ?? "Could not rebind");
            setObservation(null);
            await reload();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not rebind");
        } finally {
            setBusy(false);
        }
    };

    if (!measurement) {
        return <p className="config-typo-sublabel">Loading measurement…</p>;
    }

    return (
        <div className="min-w-0 space-y-3" data-testid="oi-org-calc-measurement">
            <div className="process-config-setup-card p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/40">
                    Organization calculation
                </p>
                <h2 className="config-typo-workspace-title mt-1 text-xl" data-testid="oi-org-calc-selected-name">
                    {measurement.name}
                </h2>
                <p className="config-typo-sublabel mt-1">
                    {measurement.source.calculation_name} · Version {measurement.source.version_number} ·{" "}
                    {measurement.unit}
                </p>
                <ConfigWorkspaceTabBar
                    tabs={TABS}
                    activeSection={tab}
                    onSectionChange={setTab}
                    ariaLabel="Measurement sections"
                    testId="oi-org-calc-tabs"
                    testIdPrefix="oi-org-calc-tab"
                />
            </div>

            {tab === "overview" ?
                <div className="grid gap-3 lg:grid-cols-2" data-testid="oi-org-calc-overview">
                    <ConfigWorkspaceCard>
                        <p className="config-typo-queue-section-label">What it measures</p>
                        <p className="mt-2 text-sm text-alloy-midnight">
                            {measurement.description
                                ?? "Future room capacity from a published organization calculation."}
                        </p>
                        <p className="config-typo-sublabel mt-3">
                            Room + effective date · seats · exact published version
                        </p>
                    </ConfigWorkspaceCard>
                    <ConfigWorkspaceCard>
                        <p className="config-typo-queue-section-label">Status</p>
                        <dl className="mt-2 space-y-2 text-sm">
                            <div className="flex justify-between gap-2">
                                <dt className="text-alloy-midnight/50">Lifecycle</dt>
                                <dd className="font-medium capitalize">{measurement.status}</dd>
                            </div>
                            <div className="flex justify-between gap-2">
                                <dt className="text-alloy-midnight/50">Bound version</dt>
                                <dd className="font-medium">v{measurement.source.version_number}</dd>
                            </div>
                            <div className="flex justify-between gap-2">
                                <dt className="text-alloy-midnight/50">Target</dt>
                                <dd className="font-medium">
                                    {measurement.target ?
                                        `Minimum ${measurement.target.value} seats`
                                    :   "None"}
                                </dd>
                            </div>
                            <div className="flex justify-between gap-2">
                                <dt className="text-alloy-midnight/50">Latest health</dt>
                                <dd className="font-medium">{healthLabel(health)}</dd>
                            </div>
                        </dl>
                    </ConfigWorkspaceCard>
                </div>
            : null}

            {tab === "observe" ?
                <ConfigWorkspaceCard testId="oi-org-calc-observe">
                    <ConfigEditorSection
                        title="Observe"
                        description="Evaluate future room capacity for a room and date. Missing capacity is never treated as zero."
                    >
                        <div className="grid gap-2 sm:grid-cols-2">
                            <label className="block space-y-1">
                                <span className="config-typo-field-label">Room</span>
                                <select
                                    className="config-runtime-input"
                                    value={roomId}
                                    onChange={(e) => setRoomId(e.target.value)}
                                    data-testid="oi-org-calc-room"
                                >
                                    {rooms.map((r) => (
                                        <option key={r.id} value={r.id}>
                                            {r.siteLabel} / {r.label}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label className="block space-y-1">
                                <span className="config-typo-field-label">Effective date</span>
                                <input
                                    type="date"
                                    className="config-runtime-input"
                                    value={effectiveAt}
                                    onChange={(e) => setEffectiveAt(e.target.value)}
                                    data-testid="oi-org-calc-effective-at"
                                />
                            </label>
                        </div>
                        <div className="mt-3">
                            <ConfigurationPrimaryButton
                                className="config-primary-btn--sm"
                                disabled={busy}
                                onClick={() => void observe()}
                                data-testid="oi-org-calc-run-observe"
                            >
                                {busy ? "Evaluating…" : "Run observation"}
                            </ConfigurationPrimaryButton>
                        </div>
                        {observation ?
                            <div
                                className="mt-4 space-y-2 rounded-md border border-alloy-stone/25 bg-white/70 p-3"
                                data-testid="oi-org-calc-observation"
                            >
                                <p className="text-lg font-semibold text-alloy-midnight">
                                    {observation.value == null ?
                                        "Not available"
                                    :   `${observation.value} seats`}
                                </p>
                                <p className="config-typo-sublabel">
                                    {healthLabel(health)} · version {observation.version_number} ·{" "}
                                    {observation.effective_at}
                                </p>
                                {observation.unavailable_reason ?
                                    <p className="text-sm text-amber-900" data-testid="oi-org-calc-unavailable">
                                        {observation.unavailable_reason}
                                    </p>
                                :   null}
                                {observation.explanation_summary.length > 0 ?
                                    <ol className="list-decimal space-y-1 pl-4 text-xs text-alloy-midnight/70">
                                        {observation.explanation_summary.map((line) => (
                                            <li key={line}>{line}</li>
                                        ))}
                                    </ol>
                                :   null}
                            </div>
                        :   null}
                    </ConfigEditorSection>
                </ConfigWorkspaceCard>
            : null}

            {tab === "target" ?
                <ConfigWorkspaceCard testId="oi-org-calc-target-panel">
                    <ConfigEditorSection title="Target" description="Minimum future room capacity.">
                        <label className="block max-w-xs space-y-1">
                            <span className="config-typo-field-label">Minimum seats</span>
                            <input
                                className="config-runtime-input"
                                value={targetDraft}
                                onChange={(e) => setTargetDraft(e.target.value)}
                                data-testid="oi-org-calc-target-input"
                            />
                        </label>
                        <div className="mt-3">
                            <ConfigurationPrimaryButton
                                className="config-primary-btn--sm"
                                disabled={busy}
                                onClick={() => void saveTarget()}
                                data-testid="oi-org-calc-save-target"
                            >
                                Save target
                            </ConfigurationPrimaryButton>
                        </div>
                    </ConfigEditorSection>
                </ConfigWorkspaceCard>
            : null}

            {tab === "history" ?
                <ConfigWorkspaceCard testId="oi-org-calc-history">
                    <ConfigEditorSection
                        title="History"
                        description="Stored observations from prior runs. No decorative charts from thin data."
                    >
                        {history.length === 0 ?
                            <p className="config-typo-sublabel">No observations yet. Run an observation to begin history.</p>
                        :   <div className="overflow-x-auto">
                                <table className="min-w-full text-left text-xs">
                                    <thead className="text-alloy-midnight/45">
                                        <tr>
                                            <th className="py-1 pr-3 font-semibold">Room</th>
                                            <th className="py-1 pr-3 font-semibold">Effective</th>
                                            <th className="py-1 pr-3 font-semibold">Value</th>
                                            <th className="py-1 pr-3 font-semibold">Availability</th>
                                            <th className="py-1 pr-3 font-semibold">Version</th>
                                            <th className="py-1 font-semibold">Evaluated</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {history.map((row) => (
                                            <tr key={row.id} className="border-t border-alloy-stone/15">
                                                <td className="py-1.5 pr-3">{row.room_label ?? "Room"}</td>
                                                <td className="py-1.5 pr-3">{row.effective_at}</td>
                                                <td className="py-1.5 pr-3">
                                                    {row.value == null ? "—" : `${row.value} seats`}
                                                </td>
                                                <td className="py-1.5 pr-3">
                                                    {row.availability === "resolved" ?
                                                        "Ready"
                                                    :   row.unavailable_reason ?? "Not available"}
                                                </td>
                                                <td className="py-1.5 pr-3">v{row.version_number}</td>
                                                <td className="py-1.5">
                                                    {new Date(row.evaluated_at).toLocaleString()}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        }
                    </ConfigEditorSection>
                </ConfigWorkspaceCard>
            : null}

            {tab === "source" ?
                <ConfigWorkspaceCard testId="oi-org-calc-source">
                    <ConfigEditorSection
                        title="Source binding"
                        description="This measurement stays on the bound published version until you explicitly use a newer one."
                    >
                        <dl className="space-y-2 text-sm">
                            <div>
                                <dt className="config-typo-field-label">Calculation</dt>
                                <dd>{measurement.source.calculation_name}</dd>
                            </div>
                            <div>
                                <dt className="config-typo-field-label">Bound version</dt>
                                <dd data-testid="oi-org-calc-bound-version">
                                    Version {measurement.source.version_number}
                                </dd>
                            </div>
                        </dl>
                        {newerVersions.length > 0 ?
                            <div className="mt-3 flex flex-wrap gap-2">
                                {newerVersions.map((v) => (
                                    <ConfigurationSecondaryButton
                                        key={v.id}
                                        disabled={busy}
                                        onClick={() => void rebind(v.id)}
                                        data-testid={`oi-org-calc-rebind-v${v.version_number}`}
                                    >
                                        Use newer version ({v.version_number})
                                    </ConfigurationSecondaryButton>
                                ))}
                            </div>
                        :   <p className="config-typo-sublabel mt-3">No newer published versions available.</p>}
                    </ConfigEditorSection>
                </ConfigWorkspaceCard>
            : null}

            {error ?
                <p className="text-sm text-red-800" role="alert" data-testid="oi-org-calc-error">
                    {error}
                </p>
            :   null}
        </div>
    );
}

function friendlyError(message: string): string {
    const m = message.toLowerCase();
    if (m.includes("room not found") || m.includes("cross-org") || m.includes("inaccessible")) {
        return "That room isn’t available in this organization.";
    }
    return message;
}
