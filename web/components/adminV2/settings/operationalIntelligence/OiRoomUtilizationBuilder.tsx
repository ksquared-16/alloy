"use client";

/**
 * Inline Room Utilization builder — configure healthy range + try, then start measuring.
 * Uses the same configure contract as BOS (`/api/admin/operational-questions/configure`).
 */

import { useEffect, useState } from "react";
import {
    ConfigurationPrimaryButton,
    ConfigurationSecondaryButton,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";

type RoomOption = { id: string; label: string; siteLabel: string };

type BuilderProps = {
    busy?: boolean;
    onClose: () => void;
    onCreated: (measurementId: string) => void;
};

export default function OiRoomUtilizationBuilder({ busy = false, onClose, onCreated }: BuilderProps) {
    const [name, setName] = useState("Room Utilization");
    const [showName, setShowName] = useState(false);
    const [countingMode, setCountingMode] = useState<"headcount" | "fte">("headcount");
    const [rangeMin, setRangeMin] = useState("75");
    const [rangeMax, setRangeMax] = useState("95");
    const [skipGoal, setSkipGoal] = useState(false);
    const [rooms, setRooms] = useState<RoomOption[]>([]);
    const [roomId, setRoomId] = useState("");
    const [effectiveAt, setEffectiveAt] = useState(() => new Date().toISOString().slice(0, 10));
    const [tryResult, setTryResult] = useState<{
        value: number | null;
        unavailable: string | null;
        health: "below" | "on" | "above" | null;
    } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [reuseNote, setReuseNote] = useState<string | null>(null);

    useEffect(() => {
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
    }, []);

    const ensurePublishedForTry = async (): Promise<{
        calculationId: string;
        versionId: string;
        reused: boolean;
    }> => {
        const listRes = await fetch("/api/admin/organization-calculations");
        const listJson = (await listRes.json()) as {
            calculations?: Array<{
                id: string;
                lifecycle: string;
                type_id?: string | null;
                published_version_id?: string | null;
            }>;
        };
        const wantedType =
            countingMode === "fte" ? "room_utilization_fte_pct" : "room_utilization_pct";
        const match = (listJson.calculations ?? []).find(
            (c) => c.lifecycle === "published" && c.type_id === wantedType && c.published_version_id,
        );
        if (match?.published_version_id) {
            return { calculationId: match.id, versionId: match.published_version_id, reused: true };
        }
        if (countingMode === "fte") {
            const [popRes, wgtRes] = await Promise.all([
                fetch("/api/admin/organization-populations"),
                fetch("/api/admin/organization-weightings"),
            ]);
            const popJson = (await popRes.json()) as {
                populations?: Array<{
                    lifecycle: string;
                    published_version_id: string | null;
                }>;
            };
            const wgtJson = (await wgtRes.json()) as {
                weightings?: Array<{
                    name: string;
                    lifecycle: string;
                    published_version_id: string | null;
                }>;
            };
            const popVersion =
                (popJson.populations ?? []).find((p) => p.lifecycle !== "archived" && p.published_version_id)
                    ?.published_version_id ?? null;
            const fteWeight =
                (wgtJson.weightings ?? []).find(
                    (w) =>
                        w.lifecycle !== "archived"
                        && w.published_version_id
                        && /full-time|fte|equivalent|days/i.test(w.name),
                ) ?? (wgtJson.weightings ?? []).find((w) => w.lifecycle !== "archived" && w.published_version_id);
            if (!popVersion || !fteWeight?.published_version_id) {
                throw new Error(
                    "Publish a population and days-per-week weighting first (Calculation Library → suggested FTE setup).",
                );
            }
            const { compilePivotBuilderDraft, roomUtilizationFtePivotDraft } = await import(
                "@/lib/organizationCalculations/pivotBuilder"
            );
            const draft = roomUtilizationFtePivotDraft({
                name: name.trim() || "Room Utilization",
                populationVersionId: popVersion,
                weightingVersionId: fteWeight.published_version_id,
            });
            const expressionAst = compilePivotBuilderDraft(draft);
            const created = await fetch("/api/admin/organization-calculations", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: name.trim() || "Room Utilization",
                    description: "Full-time equivalent children ÷ effective capacity × 100",
                    product_type_id: "room_utilization_fte_pct",
                    expression_ast: expressionAst,
                }),
            });
            const createdJson = (await created.json()) as {
                calculation?: { id: string };
                error?: string;
            };
            if (!created.ok || !createdJson.calculation) {
                throw new Error(createdJson.error ?? "Could not set up FTE definition");
            }
            const pub = await fetch(
                `/api/admin/organization-calculations/${createdJson.calculation.id}/publish`,
                { method: "POST" },
            );
            const pubJson = (await pub.json()) as {
                version?: { id: string };
                publishedVersion?: { id: string };
                calculation?: { published_version_id?: string | null };
                error?: string;
            };
            if (!pub.ok) throw new Error(pubJson.error ?? "Could not publish FTE definition");
            const versionId =
                pubJson.version?.id
                ?? pubJson.publishedVersion?.id
                ?? pubJson.calculation?.published_version_id;
            if (!versionId) throw new Error("No available FTE definition after setup");
            return { calculationId: createdJson.calculation.id, versionId, reused: false };
        }
        const created = await fetch("/api/admin/organization-calculations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name: name.trim() || "Room Utilization",
                description: "Active enrolled children divided by effective capacity, shown as a percentage.",
                product_type_id: "room_utilization_pct",
            }),
        });
        const createdJson = (await created.json()) as {
            calculation?: { id: string };
            error?: string;
        };
        if (!created.ok || !createdJson.calculation) {
            throw new Error(createdJson.error ?? "Could not set up utilization definition");
        }
        const pub = await fetch(
            `/api/admin/organization-calculations/${createdJson.calculation.id}/publish`,
            { method: "POST" },
        );
        const pubJson = (await pub.json()) as {
            version?: { id: string };
            publishedVersion?: { id: string };
            calculation?: { published_version_id?: string | null };
            error?: string;
        };
        if (!pub.ok) throw new Error(pubJson.error ?? "Could not make the definition available");
        const versionId =
            pubJson.version?.id
            ?? pubJson.publishedVersion?.id
            ?? pubJson.calculation?.published_version_id;
        if (!versionId) throw new Error("No available definition after setup");
        return { calculationId: createdJson.calculation.id, versionId, reused: false };
    };

    const rangeHealth = (value: number): "below" | "on" | "above" | null => {
        if (skipGoal) return null;
        const min = Number(rangeMin);
        const max = Number(rangeMax);
        if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
        if (value < min) return "below";
        if (value > max) return "above";
        return "on";
    };

    const runTry = async () => {
        if (!roomId || !effectiveAt) {
            setError("Choose a room and date to try.");
            return;
        }
        setSaving(true);
        setError(null);
        setTryResult(null);
        try {
            const source = await ensurePublishedForTry();
            setReuseNote(source.reused ? "Using an existing organization definition." : null);
            const res = await fetch(`/api/admin/organization-calculations/${source.calculationId}/evaluate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    roomId,
                    effectiveAt,
                    version: source.versionId,
                }),
            });
            const json = (await res.json()) as {
                evaluation?: {
                    status?: string;
                    value?: number | null;
                    warnings?: Array<{ message?: string; code?: string }>;
                };
                error?: string;
            };
            if (!res.ok) throw new Error(json.error ?? "Could not try this room");
            const value = json.evaluation?.value ?? null;
            const status = json.evaluation?.status;
            const warn = json.evaluation?.warnings?.[0]?.message ?? null;
            if (status === "resolved" && value != null) {
                setTryResult({
                    value,
                    unavailable: null,
                    health: rangeHealth(value),
                });
            } else {
                setTryResult({
                    value: null,
                    unavailable:
                        warn?.trim()
                        || "Utilization is not available (missing capacity, zero capacity, or occupancy source).",
                    health: null,
                });
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not try this room");
        } finally {
            setSaving(false);
        }
    };

    const activate = async () => {
        setSaving(true);
        setError(null);
        try {
            const min = Number(rangeMin);
            const max = Number(rangeMax);
            if (!skipGoal && (Number.isNaN(min) || Number.isNaN(max) || min > max)) {
                throw new Error("Enter a valid healthy range (minimum ≤ maximum).");
            }
            const res = await fetch("/api/admin/operational-questions/configure", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    question_key: "room_utilization",
                    counting_mode: countingMode,
                    name: name.trim() || "Room Utilization",
                    target_min_pct: skipGoal ? null : min,
                    target_max_pct: skipGoal ? null : max,
                    entry_point: "ui",
                    reuse_existing: true,
                }),
            });
            const json = (await res.json()) as {
                measurement?: { id: string };
                error?: string;
            };
            if (!res.ok) throw new Error(json.error ?? `Could not start measuring (${res.status})`);
            if (!json.measurement?.id) throw new Error("Missing measurement");
            onCreated(json.measurement.id);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not start measuring");
        } finally {
            setSaving(false);
        }
    };

    const disabled = busy || saving;

    return (
        <div
            className="process-config-setup-card space-y-5 p-5"
            data-testid="oi-room-utilization-inline-builder"
            data-oi-builder="room_utilization"
        >
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/40">
                        Start measuring
                    </p>
                    <h2 className="mt-1 text-xl font-semibold text-alloy-midnight">Room Utilization</h2>
                    <p className="mt-1 text-sm text-alloy-midnight/65">
                        How full is this room compared with the seats it can use?
                    </p>
                </div>
                <ConfigurationSecondaryButton onClick={onClose} disabled={disabled} data-testid="oi-builder-cancel">
                    Cancel
                </ConfigurationSecondaryButton>
            </div>

            <section className="space-y-2" data-testid="oi-builder-define">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                    Measure for
                </p>
                <p className="text-sm font-medium text-alloy-midnight">Each room</p>

                <div className="mt-3 space-y-2" data-testid="oi-builder-counting-mode">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                        How should children count?
                    </p>
                    <label className="flex cursor-pointer gap-2 rounded-md border border-alloy-stone/20 bg-white/70 px-3 py-2 text-sm">
                        <input
                            type="radio"
                            name="counting-mode"
                            checked={countingMode === "headcount"}
                            onChange={() => {
                                setCountingMode("headcount");
                                setTryResult(null);
                            }}
                            data-testid="oi-builder-count-headcount"
                        />
                        <span>
                            <span className="font-medium text-alloy-midnight">Every child counts equally</span>
                            <span className="mt-0.5 block text-xs text-alloy-midnight/55">
                                Each enrolled child counts as 1
                            </span>
                        </span>
                    </label>
                    <label className="flex cursor-pointer gap-2 rounded-md border border-alloy-stone/20 bg-white/70 px-3 py-2 text-sm">
                        <input
                            type="radio"
                            name="counting-mode"
                            checked={countingMode === "fte"}
                            onChange={() => {
                                setCountingMode("fte");
                                setTryResult(null);
                            }}
                            data-testid="oi-builder-count-fte"
                        />
                        <span>
                            <span className="font-medium text-alloy-midnight">Full-time equivalents</span>
                            <span className="mt-0.5 block text-xs text-alloy-midnight/55">
                                Convert schedules using your equivalency definition
                            </span>
                        </span>
                    </label>
                </div>

                <div className="mt-3 rounded-lg border border-alloy-stone/15 bg-white/60 p-3 text-sm text-alloy-midnight/80">
                    <p className="font-medium text-alloy-midnight">Definition</p>
                    <p className="mt-1">
                        {countingMode === "fte" ?
                            "Room utilization is calculated by converting active children into full-time equivalents, dividing by effective capacity, and displaying the result as a percentage."
                        :   "Room utilization is calculated by counting active children equally, dividing by effective capacity, and displaying the result as a percentage."}
                    </p>
                    <p className="mt-2 text-xs text-alloy-midnight/55">
                        Not available when capacity is missing or zero. Never divides by zero.
                    </p>
                </div>

                <div className="pt-1">
                    {showName ?
                        <label className="block max-w-md space-y-1">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                                Name
                            </span>
                            <input
                                className="config-runtime-input"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                data-testid="oi-builder-name"
                            />
                        </label>
                    :   <button
                            type="button"
                            className="text-xs font-semibold text-[#007d68] hover:underline"
                            onClick={() => setShowName(true)}
                            data-testid="oi-builder-show-name"
                        >
                            Optional: name this measurement
                        </button>
                    }
                </div>

                <div className="rounded-lg border border-alloy-stone/15 bg-white/60 p-3" data-testid="oi-builder-goal">
                    <label className="flex items-center gap-2 text-sm">
                        <input
                            type="checkbox"
                            checked={!skipGoal}
                            onChange={(e) => setSkipGoal(!e.target.checked)}
                            data-testid="oi-builder-goal-toggle"
                        />
                        <span className="font-medium text-alloy-midnight">Healthy range</span>
                    </label>
                    {!skipGoal ?
                        <label className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                            <span className="text-alloy-midnight/70">Healthy between</span>
                            <input
                                className="config-runtime-input w-16"
                                value={rangeMin}
                                onChange={(e) => setRangeMin(e.target.value)}
                                data-testid="oi-builder-goal-min"
                            />
                            <span className="text-alloy-midnight/60">%</span>
                            <span className="text-alloy-midnight/70">and</span>
                            <input
                                className="config-runtime-input w-16"
                                value={rangeMax}
                                onChange={(e) => setRangeMax(e.target.value)}
                                data-testid="oi-builder-goal-max"
                            />
                            <span className="text-alloy-midnight/60">%</span>
                        </label>
                    :   <p className="mt-1 text-xs text-alloy-midnight/55">No healthy range for now.</p>}
                </div>
            </section>

            <section className="space-y-3 border-t border-alloy-stone/15 pt-4" data-testid="oi-builder-try">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">Try it</p>
                <div className="grid gap-2 sm:grid-cols-2">
                    <label className="block space-y-1">
                        <span className="config-typo-field-label">Room</span>
                        <select
                            className="config-runtime-input"
                            value={roomId}
                            onChange={(e) => setRoomId(e.target.value)}
                            data-testid="oi-builder-room"
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
                            data-testid="oi-builder-date"
                        />
                    </label>
                </div>
                <ConfigurationSecondaryButton
                    disabled={disabled || !roomId}
                    onClick={() => void runTry()}
                    data-testid="oi-builder-run-try"
                >
                    {saving ? "Checking…" : "Try it"}
                </ConfigurationSecondaryButton>

                {tryResult ?
                    <div
                        className="rounded-md border border-alloy-stone/25 bg-white p-3"
                        data-testid="oi-builder-try-result"
                    >
                        <p className="text-lg font-semibold text-alloy-midnight">
                            {tryResult.value == null ?
                                "Not available"
                            :   `${Math.round(tryResult.value * 10) / 10}%`}
                        </p>
                        {tryResult.unavailable ?
                            <p className="mt-1 text-sm text-amber-900">{tryResult.unavailable}</p>
                        : tryResult.health === "on" ?
                            <p className="mt-1 text-sm text-alloy-midnight/70">On goal</p>
                        : tryResult.health === "below" ?
                            <p className="mt-1 text-sm text-amber-900">Below range</p>
                        : tryResult.health === "above" ?
                            <p className="mt-1 text-sm text-amber-900">Above range</p>
                        :   null}
                        {reuseNote ?
                            <p className="mt-2 text-[11px] text-alloy-midnight/45" data-testid="oi-builder-reuse-note">
                                {reuseNote}
                            </p>
                        :   null}
                    </div>
                :   null}
            </section>

            <div className="flex flex-wrap items-center gap-2 border-t border-alloy-stone/15 pt-4">
                <ConfigurationPrimaryButton
                    disabled={disabled}
                    onClick={() => void activate()}
                    data-testid="oi-builder-start-measuring"
                >
                    {saving ? "Starting…" : "Start measuring"}
                </ConfigurationPrimaryButton>
                <p className="text-xs text-alloy-midnight/50">
                    Alloy will reuse an existing utilization definition when one already matches.
                </p>
            </div>

            {error ?
                <p className="text-sm text-red-800" role="alert" data-testid="oi-builder-error">
                    {error}
                </p>
            :   null}
        </div>
    );
}
