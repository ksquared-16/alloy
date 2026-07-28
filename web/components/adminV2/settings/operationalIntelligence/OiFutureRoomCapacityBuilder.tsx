"use client";

/**
 * Inline Future Room Capacity builder — configure an answer, not a calculation.
 * Uses the same configure contract as BOS (`/api/admin/operational-questions/configure`).
 */

import { useEffect, useState } from "react";
import {
    ConfigurationPrimaryButton,
    ConfigurationSecondaryButton,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import {
    CAPACITY_RECIPES,
    capacityRecipeById,
    type CapacityRecipeCopy,
} from "@/lib/adminV2/settings/operationalIntelligence/oiCapacityRecipeCopy";
import type { OrgCalcProductTypeId } from "@/lib/organizationCalculations/productCatalog";

type RoomOption = { id: string; label: string; siteLabel: string };

type BuilderProps = {
    busy?: boolean;
    onClose: () => void;
    onCreated: (measurementId: string) => void;
};

export default function OiFutureRoomCapacityBuilder({ busy = false, onClose, onCreated }: BuilderProps) {
    const [name, setName] = useState("Future Room Capacity");
    const [showName, setShowName] = useState(false);
    const [recipeId, setRecipeId] = useState<OrgCalcProductTypeId>("capacity_lowest_physical_licensed");
    const [targetMin, setTargetMin] = useState("18");
    const [skipGoal, setSkipGoal] = useState(false);
    const [rooms, setRooms] = useState<RoomOption[]>([]);
    const [roomId, setRoomId] = useState("");
    const [effectiveAt, setEffectiveAt] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() + 30);
        return d.toISOString().slice(0, 10);
    });
    const [tryResult, setTryResult] = useState<{
        value: number | null;
        unavailable: string | null;
        onGoal: boolean | null;
    } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [reuseNote, setReuseNote] = useState<string | null>(null);

    const recipe: CapacityRecipeCopy = capacityRecipeById(recipeId) ?? CAPACITY_RECIPES[0]!;

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

    /** Ensure a published definition exists for try-it only (reuses when possible). */
    const ensurePublishedForTry = async (): Promise<{ calculationId: string; versionId: string; reused: boolean }> => {
        const listRes = await fetch("/api/admin/organization-calculations");
        const listJson = (await listRes.json()) as {
            calculations?: Array<{
                id: string;
                lifecycle: string;
                type_id?: string | null;
                published_version_id?: string | null;
            }>;
        };
        const match = (listJson.calculations ?? []).find(
            (c) => c.lifecycle === "published" && c.type_id === recipeId && c.published_version_id,
        );
        if (match?.published_version_id) {
            return { calculationId: match.id, versionId: match.published_version_id, reused: true };
        }
        const created = await fetch("/api/admin/organization-calculations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name: `${name.trim() || "Future Room Capacity"} — ${recipe.title}`,
                description: recipe.summary,
                product_type_id: recipeId,
            }),
        });
        const createdJson = (await created.json()) as {
            calculation?: { id: string };
            error?: string;
        };
        if (!created.ok || !createdJson.calculation) {
            throw new Error(createdJson.error ?? "Could not set up how capacity is determined");
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
            setReuseNote(
                source.reused ? "Using an existing organization definition." : null,
            );
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
                    warnings?: Array<{ message?: string }>;
                };
                error?: string;
            };
            if (!res.ok) throw new Error(json.error ?? "Could not try this room");
            const value = json.evaluation?.value ?? null;
            const status = json.evaluation?.status;
            const warn = json.evaluation?.warnings?.[0]?.message ?? null;
            if (status === "resolved" && value != null) {
                const goal = skipGoal || !targetMin.trim() ? null : Number(targetMin);
                setTryResult({
                    value,
                    unavailable: null,
                    onGoal: goal != null && Number.isFinite(goal) ? value >= goal : null,
                });
            } else {
                setTryResult({
                    value: null,
                    unavailable:
                        warn?.trim()
                        || "Required capacity information isn’t configured for this room.",
                    onGoal: null,
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
            const res = await fetch("/api/admin/operational-questions/configure", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    question_key: "future_room_capacity",
                    product_type_id: recipeId,
                    name: name.trim() || "Future Room Capacity",
                    target_min_seats: skipGoal || !targetMin.trim() ? null : Number(targetMin),
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
            data-testid="oi-frc-inline-builder"
            data-oi-builder="future_room_capacity"
        >
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/40">
                        Start measuring
                    </p>
                    <h2 className="mt-1 text-xl font-semibold text-alloy-midnight">Future Room Capacity</h2>
                    <p className="mt-1 text-sm text-alloy-midnight/65">
                        How many seats will this room have on a future date?
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
                <p className="text-sm font-medium text-alloy-midnight">Room</p>

                <label className="mt-3 block space-y-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                        How should Alloy determine capacity?
                    </span>
                    <select
                        className="config-runtime-input mt-1"
                        value={recipeId}
                        onChange={(e) => {
                            setRecipeId(e.target.value as OrgCalcProductTypeId);
                            setTryResult(null);
                        }}
                        data-testid="oi-builder-recipe"
                    >
                        {CAPACITY_RECIPES.map((r) => (
                            <option key={r.id} value={r.id}>
                                {r.title}
                            </option>
                        ))}
                    </select>
                    <p className="text-xs text-alloy-midnight/60" data-testid="oi-builder-recipe-sentence">
                        {recipe.recipeSentence}
                    </p>
                </label>

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
                        <span className="font-medium text-alloy-midnight">Goal</span>
                    </label>
                    {!skipGoal ?
                        <label className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                            <span className="text-alloy-midnight/70">Warn me when capacity is below</span>
                            <input
                                className="config-runtime-input w-20"
                                value={targetMin}
                                onChange={(e) => setTargetMin(e.target.value)}
                                data-testid="oi-builder-goal-input"
                            />
                            <span className="text-alloy-midnight/60">seats</span>
                        </label>
                    :   <p className="mt-1 text-xs text-alloy-midnight/55">No warning goal for now.</p>}
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
                            {tryResult.value == null ? "Not available" : `${tryResult.value} seats`}
                        </p>
                        {tryResult.unavailable ?
                            <p className="mt-1 text-sm text-amber-900">{tryResult.unavailable}</p>
                        : tryResult.onGoal === true ?
                            <p className="mt-1 text-sm text-alloy-midnight/70">On goal</p>
                        : tryResult.onGoal === false ?
                            <p className="mt-1 text-sm text-amber-900">Below goal</p>
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
                    Alloy will reuse an existing definition when one already matches, or create one for you.
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
