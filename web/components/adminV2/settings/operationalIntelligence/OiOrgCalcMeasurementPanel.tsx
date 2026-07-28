"use client";

/**
 * Organization-backed measurement detail — Overview / History / Settings.
 * Exact-version behavior preserved; advanced library is one click deeper.
 */

import Link from "next/link";
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
import { organizationCalculationLibraryHref } from "@/lib/admin/canonicalAdminRoutes";
import { capacityRecipeFromProductTypeLabel } from "@/lib/adminV2/settings/operationalIntelligence/oiCapacityRecipeCopy";
import type { OiOrgCalcHealth, OiOrgCalcMeasurement, OiOrgCalcObservation } from "@/lib/metrics/oiOrgCalcMeasurements";

type RoomOption = { id: string; label: string; siteLabel: string };
type Tab = "overview" | "history" | "settings";

const TABS: Array<{ key: Tab; label: string }> = [
    { key: "overview", label: "Overview" },
    { key: "history", label: "History" },
    { key: "settings", label: "Settings" },
];

function healthLabel(h: OiOrgCalcHealth): string {
    if (h === "on_goal") return "On goal";
    if (h === "below_goal") return "Below goal";
    if (h === "no_target") return "No goal";
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
    const [showAdvanced, setShowAdvanced] = useState(false);
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
            if (!res.ok) throw new Error(friendlyError(json.error ?? "Check failed"));
            setObservation(json.observation ?? null);
            setHealth(json.health ?? "not_available");
            await reload();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Check failed");
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
            if (!res.ok) throw new Error(json.error ?? "Could not save goal");
            await reload();
            if (observation) {
                setHealth(
                    observation.availability === "resolved" && observation.value != null ?
                        !targetDraft.trim() ? "no_target"
                        : observation.value >= Number(targetDraft) ? "on_goal"
                        : "below_goal"
                    :   "not_available",
                );
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not save goal");
        } finally {
            setBusy(false);
        }
    };

    const useNewerVersion = async (versionId: string) => {
        setBusy(true);
        setError(null);
        try {
            const res = await fetch(`/api/admin/metrics/oi-org-calc-measurements/${measurementId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ calculation_version_id: versionId }),
            });
            const json = (await res.json()) as { error?: string };
            if (!res.ok) throw new Error(json.error ?? "Could not use the newer definition");
            setObservation(null);
            await reload();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not use the newer definition");
        } finally {
            setBusy(false);
        }
    };

    if (!measurement) {
        return <p className="config-typo-sublabel">Loading measurement…</p>;
    }

    const recipe = capacityRecipeFromProductTypeLabel(
        measurement.description ?? measurement.source.calculation_name,
    );
    const calcHref = organizationCalculationLibraryHref({
        calculationId: measurement.source.calculation_id,
    });

    return (
        <div className="min-w-0 space-y-3" data-testid="oi-org-calc-measurement">
            <div className="process-config-setup-card p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/40">
                    Future Room Capacity
                </p>
                <h2 className="config-typo-workspace-title mt-1 text-xl" data-testid="oi-org-calc-selected-name">
                    {measurement.name}
                </h2>
                <p className="config-typo-sublabel mt-1" data-testid="oi-org-calc-recipe-sentence">
                    {recipe.recipeSentence}
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
                <div className="space-y-3" data-testid="oi-org-calc-overview">
                    <ConfigWorkspaceCard testId="oi-org-calc-observe">
                        <ConfigEditorSection
                            title="Current answer"
                            description="Choose a room and date to see how many seats are expected."
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
                                    <span className="config-typo-field-label">Date</span>
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
                                    {busy ? "Checking…" : "Get answer"}
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
                                        {healthLabel(health)}
                                        {measurement.target ?
                                            ` · Warn below ${measurement.target.value} seats`
                                        :   ""}
                                        {" · "}
                                        {observation.effective_at}
                                    </p>
                                    {observation.unavailable_reason ?
                                        <p className="text-sm text-amber-900" data-testid="oi-org-calc-unavailable">
                                            {observation.unavailable_reason}
                                        </p>
                                    :   null}
                                    {observation.explanation_summary.length > 0 ?
                                        <details className="text-xs text-alloy-midnight/70">
                                            <summary className="cursor-pointer font-medium text-[#007d68]">
                                                How we got this number
                                            </summary>
                                            <ol className="mt-2 list-decimal space-y-1 pl-4">
                                                {observation.explanation_summary.map((line) => (
                                                    <li key={line}>{line}</li>
                                                ))}
                                            </ol>
                                        </details>
                                    :   null}
                                </div>
                            :   null}
                        </ConfigEditorSection>
                    </ConfigWorkspaceCard>

                    <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-lg border border-alloy-stone/15 bg-white p-3">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                                Status
                            </p>
                            <p className="mt-1 text-sm font-semibold capitalize">
                                {measurement.status === "active" ? "Measuring" : measurement.status}
                            </p>
                        </div>
                        <div className="rounded-lg border border-alloy-stone/15 bg-white p-3">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                                Goal
                            </p>
                            <p className="mt-1 text-sm font-semibold">
                                {measurement.target ?
                                    `Warn below ${measurement.target.value} seats`
                                :   "None"}
                            </p>
                        </div>
                        <div className="rounded-lg border border-alloy-stone/15 bg-white p-3">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                                Health
                            </p>
                            <p className="mt-1 text-sm font-semibold">{healthLabel(health)}</p>
                        </div>
                    </div>
                </div>
            : null}

            {tab === "history" ?
                <ConfigWorkspaceCard testId="oi-org-calc-history">
                    <ConfigEditorSection
                        title="History"
                        description="Prior answers for rooms and dates you’ve checked."
                    >
                        {history.length === 0 ?
                            <p className="config-typo-sublabel">
                                No history yet. Get an answer on Overview to begin.
                            </p>
                        :   <div className="overflow-x-auto">
                                <table className="min-w-full text-left text-xs">
                                    <thead className="text-alloy-midnight/45">
                                        <tr>
                                            <th className="py-1 pr-3 font-semibold">Room</th>
                                            <th className="py-1 pr-3 font-semibold">Date</th>
                                            <th className="py-1 pr-3 font-semibold">Answer</th>
                                            <th className="py-1 pr-3 font-semibold">Status</th>
                                            <th className="py-1 font-semibold">Checked</th>
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

            {tab === "settings" ?
                <div className="space-y-3" data-testid="oi-org-calc-settings">
                    <ConfigWorkspaceCard testId="oi-org-calc-target-panel">
                        <ConfigEditorSection
                            title="Goal"
                            description="Warn when expected capacity drops below this number of seats."
                        >
                            <label className="block max-w-xs space-y-1">
                                <span className="config-typo-field-label">Warn me when capacity is below</span>
                                <div className="flex items-center gap-2">
                                    <input
                                        className="config-runtime-input"
                                        value={targetDraft}
                                        onChange={(e) => setTargetDraft(e.target.value)}
                                        data-testid="oi-org-calc-target-input"
                                    />
                                    <span className="text-sm text-alloy-midnight/60">seats</span>
                                </div>
                            </label>
                            <div className="mt-3">
                                <ConfigurationPrimaryButton
                                    className="config-primary-btn--sm"
                                    disabled={busy}
                                    onClick={() => void saveTarget()}
                                    data-testid="oi-org-calc-save-target"
                                >
                                    Save goal
                                </ConfigurationPrimaryButton>
                            </div>
                        </ConfigEditorSection>
                    </ConfigWorkspaceCard>

                    <ConfigWorkspaceCard testId="oi-org-calc-source">
                        <ConfigEditorSection
                            title="How this is measured"
                            description="Future updates won’t change this measurement until you choose to use a newer definition."
                        >
                                    <p className="text-sm text-alloy-midnight" data-testid="oi-org-calc-source-line">
                                        {recipe.recipeSentence}
                                    </p>
                                    <p className="mt-3">
                                        <Link
                                            href={calcHref}
                                            className="text-sm font-semibold text-[#007d68] hover:underline"
                                            data-testid="oi-org-calc-open-definition"
                                        >
                                            View definition
                                        </Link>
                                    </p>
                                    {newerVersions.length > 0 ?
                                        <div className="mt-3 space-y-2">
                                            <p className="text-xs text-alloy-midnight/60">
                                                A newer definition is available.
                                            </p>
                                            {newerVersions.map((v) => (
                                                <ConfigurationSecondaryButton
                                                    key={v.id}
                                                    disabled={busy}
                                                    onClick={() => void useNewerVersion(v.id)}
                                                    data-testid={`oi-org-calc-rebind-v${v.version_number}`}
                                                >
                                                    Use the newer definition
                                                </ConfigurationSecondaryButton>
                                            ))}
                                        </div>
                                    :   null}

                                    <button
                                        type="button"
                                        className="mt-3 text-xs font-semibold text-[#007d68] hover:underline"
                                        onClick={() => setShowAdvanced((v) => !v)}
                                        data-testid="oi-org-calc-toggle-advanced"
                                    >
                                        {showAdvanced ? "Hide advanced" : "Advanced"}
                                    </button>
                                    {showAdvanced ?
                                        <div className="mt-2 space-y-2 text-sm" data-testid="oi-org-calc-version-panel">
                                            <p className="config-typo-sublabel" data-testid="oi-org-calc-bound-version">
                                                Using definition version {measurement.source.version_number}
                                            </p>
                                            <p className="text-xs text-alloy-midnight/50">
                                                Opens Calculation Library for versions and where used.
                                            </p>
                                        </div>
                                    :   null}
                        </ConfigEditorSection>
                    </ConfigWorkspaceCard>
                </div>
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
