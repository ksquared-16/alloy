"use client";

/**
 * Measurement-first wizard — Future Room Capacity.
 * Operator never needs to understand Calculations to finish.
 * Advanced library is optional when no matching definition exists.
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
    ConfigurationPrimaryButton,
    ConfigurationSecondaryButton,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import { ConfigEditorSection, ConfigWorkspaceCard } from "@/components/adminV2/settings/configurationRuntime/workspace";
import { CANONICAL_ORGANIZATION_CALCULATIONS_HREF } from "@/lib/admin/canonicalAdminRoutes";
import {
    CAPACITY_RECIPES,
    capacityRecipeById,
    capacityRecipeFromProductTypeLabel,
    type CapacityRecipeCopy,
} from "@/lib/adminV2/settings/operationalIntelligence/oiCapacityRecipeCopy";
import type { OrgCalcProductTypeId } from "@/lib/organizationCalculations/productCatalog";

type PublishedCalc = {
    id: string;
    name: string;
    description: string | null;
    lifecycle: string;
    published_version_id: string | null;
    type_label?: string | null;
    type_id?: string | null;
};

type VersionRow = {
    id: string;
    version_number: number;
    immutable: boolean;
    published_at: string | null;
};

type RoomOption = { id: string; label: string; siteLabel: string };

type WizardProps = {
    busy: boolean;
    onClose: () => void;
    onCreated: (measurementId: string) => void;
    initialStep?: Step;
};

type Step = 1 | 2 | 3 | 4 | 5 | 6;

export default function OiOrgCalcAddWizard({ busy, onClose, onCreated, initialStep = 1 }: WizardProps) {
    const [step, setStep] = useState<Step>(initialStep);
    const [name, setName] = useState("Future Room Capacity");
    const [recipeId, setRecipeId] = useState<OrgCalcProductTypeId>("capacity_lowest_physical_licensed");
    const [sourceMode, setSourceMode] = useState<"existing" | "setup">("existing");
    const [calcs, setCalcs] = useState<PublishedCalc[]>([]);
    const [calculationId, setCalculationId] = useState("");
    const [versionId, setVersionId] = useState("");
    const [versions, setVersions] = useState<VersionRow[]>([]);
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
    } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [ensuring, setEnsuring] = useState(false);

    const recipe = capacityRecipeById(recipeId) ?? CAPACITY_RECIPES[0]!;

    const matchingCalcs = useMemo(() => {
        return calcs.filter((c) => {
            if (c.lifecycle !== "published") return false;
            if (c.type_id === recipeId) return true;
            const inferred = capacityRecipeFromProductTypeLabel(c.type_label);
            return inferred.id === recipeId;
        });
    }, [calcs, recipeId]);

    useEffect(() => {
        void (async () => {
            try {
                const res = await fetch("/api/admin/organization-calculations");
                const json = (await res.json()) as { calculations?: PublishedCalc[] };
                if (!res.ok) return;
                setCalcs((json.calculations ?? []).filter((c) => c.lifecycle === "published"));
            } catch {
                /* optional */
            }
        })();
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

    useEffect(() => {
        if (matchingCalcs.length > 0) {
            setSourceMode("existing");
            if (!matchingCalcs.some((c) => c.id === calculationId)) {
                setCalculationId(matchingCalcs[0]!.id);
            }
        } else {
            setSourceMode("setup");
            setCalculationId("");
            setVersionId("");
            setVersions([]);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [recipeId, matchingCalcs.length]);

    useEffect(() => {
        if (!calculationId) {
            setVersions([]);
            setVersionId("");
            return;
        }
        void (async () => {
            const res = await fetch(`/api/admin/organization-calculations/${calculationId}`);
            const json = (await res.json()) as { versions?: VersionRow[] };
            if (!res.ok) return;
            const published = (json.versions ?? []).filter((v) => v.immutable);
            setVersions(published);
            const preferred =
                published.find((v) => v.id === calcs.find((c) => c.id === calculationId)?.published_version_id)
                ?? published[published.length - 1];
            setVersionId(preferred?.id ?? "");
        })();
    }, [calculationId, calcs]);

    const stepLabel = (s: Step): string => {
        if (s === 1) return "What do you want to measure?";
        if (s === 2) return "Name this measurement";
        if (s === 3) return "How should capacity be determined?";
        if (s === 4) return "When should Alloy get your attention?";
        if (s === 5) return "Let's make sure this gives the answer you expect";
        return "Future Room Capacity is ready";
    };

    /** Ensure a published calculation + version exist for the chosen recipe. */
    const ensurePublishedSource = async (): Promise<{ calculationId: string; versionId: string }> => {
        if (sourceMode === "existing" && calculationId && versionId) {
            return { calculationId, versionId };
        }
        setEnsuring(true);
        try {
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
                throw new Error(createdJson.error ?? "Could not set up how this is calculated");
            }
            const pub = await fetch(
                `/api/admin/organization-calculations/${createdJson.calculation.id}/publish`,
                { method: "POST" },
            );
            const pubJson = (await pub.json()) as {
                calculation?: { id: string; published_version_id?: string | null };
                version?: { id: string };
                publishedVersion?: { id: string };
                error?: string;
            };
            if (!pub.ok) throw new Error(pubJson.error ?? "Could not make the definition available");
            const detail = await fetch(
                `/api/admin/organization-calculations/${createdJson.calculation.id}`,
            );
            const detailJson = (await detail.json()) as {
                calculation?: { published_version_id?: string | null };
                versions?: VersionRow[];
                publishedVersion?: { id: string };
            };
            const vid =
                pubJson.version?.id
                ?? pubJson.publishedVersion?.id
                ?? detailJson.publishedVersion?.id
                ?? detailJson.calculation?.published_version_id
                ?? (detailJson.versions ?? []).filter((v) => v.immutable).slice(-1)[0]?.id;
            if (!vid) throw new Error("No available version after setup");
            setCalculationId(createdJson.calculation.id);
            setVersionId(vid);
            const list = await fetch("/api/admin/organization-calculations");
            const listJson = (await list.json()) as { calculations?: PublishedCalc[] };
            if (list.ok) setCalcs((listJson.calculations ?? []).filter((c) => c.lifecycle === "published"));
            return { calculationId: createdJson.calculation.id, versionId: vid };
        } finally {
            setEnsuring(false);
        }
    };

    const runTry = async () => {
        setSaving(true);
        setError(null);
        setTryResult(null);
        try {
            const source = await ensurePublishedSource();
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
            if (!res.ok) throw new Error(json.error ?? "Could not check this room");
            const value = json.evaluation?.value ?? null;
            const status = json.evaluation?.status;
            const warn = json.evaluation?.warnings?.[0]?.message ?? null;
            if (status === "resolved" && value != null) {
                setTryResult({ value, unavailable: null });
            } else {
                setTryResult({
                    value: null,
                    unavailable:
                        warn?.trim()
                        || "Required capacity information isn’t configured for this room.",
                });
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not check this room");
        } finally {
            setSaving(false);
        }
    };

    const activate = async () => {
        setSaving(true);
        setError(null);
        try {
            const source = await ensurePublishedSource();
            const res = await fetch("/api/admin/metrics/oi-org-calc-measurements", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: name.trim(),
                    description: `Measure how many seats a room is expected to have on a future date. ${recipe.summary}`,
                    calculation_id: source.calculationId,
                    calculation_version_id: source.versionId,
                    target_min_seats: skipGoal || !targetMin.trim() ? null : Number(targetMin),
                }),
            });
            const json = (await res.json()) as { measurement?: { id: string }; error?: string };
            if (!res.ok) throw new Error(json.error ?? `Could not start measuring (${res.status})`);
            if (!json.measurement) throw new Error("Missing measurement");
            onCreated(json.measurement.id);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not start measuring");
        } finally {
            setSaving(false);
        }
    };

    const canContinue = (): boolean => {
        if (step === 1) return true;
        if (step === 2) return Boolean(name.trim());
        if (step === 3) {
            if (sourceMode === "existing") return Boolean(calculationId && versionId);
            return true; // setup on try/activate
        }
        if (step === 4) return skipGoal || Boolean(targetMin.trim());
        if (step === 5) return Boolean(roomId && effectiveAt);
        return true;
    };

    return (
        <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/30 p-4"
            role="dialog"
            aria-modal="true"
            data-testid="oi-org-calc-add-wizard"
            data-wizard-step={step}
        >
            <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-xl">
                <div className="border-b border-alloy-stone/15 px-4 py-3">
                    <h2 className="text-sm font-semibold text-alloy-midnight">Add measurement</h2>
                    <p className="mt-0.5 text-xs text-alloy-midnight/55">
                        Step {step} of 6 — {stepLabel(step)}
                    </p>
                </div>

                <div className="space-y-3 px-4 py-4">
                    {step === 1 ?
                        <ConfigWorkspaceCard testId="oi-wizard-question">
                            <ConfigEditorSection
                                title="What do you want to measure?"
                                description="Only measurements that work today are listed."
                            >
                                <label className="flex cursor-pointer gap-3 rounded-md border border-[#00a283]/50 bg-[#00a283]/5 px-3 py-3">
                                    <input type="radio" checked readOnly data-testid="oi-template-future-room-capacity" />
                                    <span>
                                        <span className="block text-sm font-semibold text-alloy-midnight">
                                            Future Room Capacity
                                        </span>
                                        <span className="config-typo-sublabel mt-0.5 block">
                                            Measure how many seats a room is expected to have on a future date.
                                        </span>
                                    </span>
                                </label>
                            </ConfigEditorSection>
                        </ConfigWorkspaceCard>
                    : null}

                    {step === 2 ?
                        <ConfigWorkspaceCard testId="oi-wizard-name">
                            <ConfigEditorSection title="Name this measurement">
                                <label className="block space-y-1">
                                    <span className="config-typo-field-label">Name</span>
                                    <input
                                        className="config-runtime-input"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        data-testid="oi-org-calc-name"
                                    />
                                </label>
                                <p className="config-typo-sublabel mt-3">
                                    Shown in Operational Intelligence for your team.
                                </p>
                            </ConfigEditorSection>
                        </ConfigWorkspaceCard>
                    : null}

                    {step === 3 ?
                        <ConfigWorkspaceCard testId="oi-wizard-recipe">
                            <ConfigEditorSection
                                title="How should capacity be determined?"
                                description="Choose what “capacity” means for this measurement."
                            >
                                <div className="space-y-2">
                                    {CAPACITY_RECIPES.map((r) => (
                                        <RecipeOption
                                            key={r.id}
                                            recipe={r}
                                            selected={recipeId === r.id}
                                            onSelect={() => setRecipeId(r.id)}
                                        />
                                    ))}
                                </div>

                                <div className="mt-4 space-y-2 border-t border-alloy-stone/15 pt-3">
                                    {matchingCalcs.length > 0 ?
                                        <>
                                            <p className="text-xs font-semibold text-alloy-midnight">
                                                Use existing definition
                                            </p>
                                            <div className="space-y-2">
                                                {matchingCalcs.map((c) => (
                                                    <label
                                                        key={c.id}
                                                        className={`flex cursor-pointer gap-3 rounded-md border px-3 py-2 ${
                                                            sourceMode === "existing" && calculationId === c.id ?
                                                                "border-[#00a283]/50 bg-[#00a283]/5"
                                                            :   "border-alloy-stone/25"
                                                        }`}
                                                    >
                                                        <input
                                                            type="radio"
                                                            name="source"
                                                            checked={sourceMode === "existing" && calculationId === c.id}
                                                            onChange={() => {
                                                                setSourceMode("existing");
                                                                setCalculationId(c.id);
                                                            }}
                                                            data-testid={`oi-org-calc-pick-${c.id}`}
                                                        />
                                                        <span className="text-sm font-medium">{c.name}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        </>
                                    :   null}
                                    <label
                                        className={`flex cursor-pointer gap-3 rounded-md border px-3 py-2 ${
                                            sourceMode === "setup" ?
                                                "border-[#00a283]/50 bg-[#00a283]/5"
                                            :   "border-alloy-stone/25"
                                        }`}
                                    >
                                        <input
                                            type="radio"
                                            name="source"
                                            checked={sourceMode === "setup"}
                                            onChange={() => setSourceMode("setup")}
                                            data-testid="oi-setup-calculation"
                                        />
                                        <span>
                                            <span className="block text-sm font-semibold">
                                                Set up how this measurement is calculated
                                            </span>
                                            <span className="config-typo-sublabel mt-0.5 block">
                                                Alloy will create the definition from your choice above. You can open
                                                the advanced library anytime afterward.
                                            </span>
                                        </span>
                                    </label>
                                    <p className="config-typo-sublabel">
                                        Advanced:{" "}
                                        <Link
                                            href={CANONICAL_ORGANIZATION_CALCULATIONS_HREF}
                                            className="font-medium text-[#007d68] hover:underline"
                                            data-testid="oi-wizard-open-calc-library"
                                        >
                                            open calculation library
                                        </Link>
                                    </p>
                                </div>
                            </ConfigEditorSection>
                        </ConfigWorkspaceCard>
                    : null}

                    {step === 4 ?
                        <ConfigWorkspaceCard testId="oi-wizard-goal">
                            <ConfigEditorSection
                                title="When should Alloy get your attention?"
                                description="Optional. Skip if you only want the answer without a goal."
                            >
                                <label className="flex items-center gap-2 text-sm">
                                    <input
                                        type="checkbox"
                                        checked={skipGoal}
                                        onChange={(e) => setSkipGoal(e.target.checked)}
                                        data-testid="oi-skip-goal"
                                    />
                                    Skip for now
                                </label>
                                {!skipGoal ?
                                    <label className="mt-3 block max-w-xs space-y-1">
                                        <span className="config-typo-field-label">
                                            Warn me when capacity is below
                                        </span>
                                        <div className="flex items-center gap-2">
                                            <input
                                                className="config-runtime-input"
                                                value={targetMin}
                                                onChange={(e) => setTargetMin(e.target.value)}
                                                inputMode="numeric"
                                                data-testid="oi-org-calc-target"
                                            />
                                            <span className="text-sm text-alloy-midnight/60">seats</span>
                                        </div>
                                    </label>
                                :   null}
                            </ConfigEditorSection>
                        </ConfigWorkspaceCard>
                    : null}

                    {step === 5 ?
                        <ConfigWorkspaceCard testId="oi-wizard-try">
                            <ConfigEditorSection
                                title="Let's make sure this gives the answer you expect"
                                description="Pick a room and a future date, then check the result."
                            >
                                <div className="grid gap-2 sm:grid-cols-2">
                                    <label className="block space-y-1">
                                        <span className="config-typo-field-label">Room</span>
                                        <select
                                            className="config-runtime-input"
                                            value={roomId}
                                            onChange={(e) => setRoomId(e.target.value)}
                                            data-testid="oi-wizard-try-room"
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
                                            data-testid="oi-wizard-try-date"
                                        />
                                    </label>
                                </div>
                                <div className="mt-3">
                                    <ConfigurationPrimaryButton
                                        className="config-primary-btn--sm"
                                        disabled={saving || ensuring || !roomId}
                                        onClick={() => void runTry()}
                                        data-testid="oi-wizard-try-run"
                                    >
                                        {saving || ensuring ? "Checking…" : "Check"}
                                    </ConfigurationPrimaryButton>
                                </div>
                                {tryResult ?
                                    <div
                                        className="mt-4 rounded-md border border-alloy-stone/25 bg-white/70 p-3"
                                        data-testid="oi-wizard-try-result"
                                    >
                                        <p className="text-lg font-semibold text-alloy-midnight">
                                            {tryResult.value == null ?
                                                "Not available"
                                            :   `${tryResult.value} seats`}
                                        </p>
                                        {tryResult.unavailable ?
                                            <p className="mt-1 text-sm text-amber-900">{tryResult.unavailable}</p>
                                        :   <p className="config-typo-sublabel mt-1">
                                                Calculated using: {recipe.sourceLine}
                                            </p>
                                        }
                                    </div>
                                :   null}
                            </ConfigEditorSection>
                        </ConfigWorkspaceCard>
                    : null}

                    {step === 6 ?
                        <ConfigWorkspaceCard testId="oi-wizard-ready">
                            <ConfigEditorSection title="Future Room Capacity is ready">
                                <p className="text-sm text-alloy-midnight">
                                    <strong>{name.trim()}</strong> will measure seats for each room on the dates you
                                    check. Future updates to how capacity is calculated won’t change this measurement
                                    until you choose to use a newer version.
                                </p>
                                <dl className="mt-3 space-y-2 text-sm">
                                    <div>
                                        <dt className="config-typo-field-label">Calculated using</dt>
                                        <dd>{recipe.sourceLine}</dd>
                                    </div>
                                    <div>
                                        <dt className="config-typo-field-label">Goal</dt>
                                        <dd>
                                            {skipGoal || !targetMin.trim() ?
                                                "None"
                                            :   `Warn below ${targetMin.trim()} seats`}
                                        </dd>
                                    </div>
                                </dl>
                            </ConfigEditorSection>
                        </ConfigWorkspaceCard>
                    : null}

                    {error ?
                        <p className="text-sm text-red-800" role="alert" data-testid="oi-org-calc-wizard-error">
                            {error}
                        </p>
                    :   null}
                </div>

                <div className="flex flex-wrap justify-end gap-2 border-t border-alloy-stone/15 px-4 py-3">
                    <ConfigurationSecondaryButton onClick={onClose} disabled={busy || saving || ensuring}>
                        Cancel
                    </ConfigurationSecondaryButton>
                    {step > 1 ?
                        <ConfigurationSecondaryButton
                            onClick={() => setStep((s) => (Math.max(1, s - 1) as Step))}
                            disabled={saving || ensuring}
                        >
                            Back
                        </ConfigurationSecondaryButton>
                    :   null}
                    {step < 6 ?
                        <ConfigurationPrimaryButton
                            className="config-primary-btn--sm"
                            disabled={saving || ensuring || !canContinue()}
                            onClick={() => {
                                setStep((s) => {
                                    const next = Math.min(6, s + 1) as Step;
                                    return next;
                                });
                            }}
                            data-testid="oi-org-calc-wizard-next"
                        >
                            Continue
                        </ConfigurationPrimaryButton>
                    :   <>
                            <ConfigurationSecondaryButton
                                onClick={() =>
                                    window.open(CANONICAL_ORGANIZATION_CALCULATIONS_HREF, "_blank", "noopener")
                                }
                                data-testid="oi-wizard-advanced"
                            >
                                Advanced
                            </ConfigurationSecondaryButton>
                            <ConfigurationPrimaryButton
                                className="config-primary-btn--sm"
                                disabled={saving || ensuring || !name.trim()}
                                onClick={() => void activate()}
                                data-testid="oi-org-calc-wizard-activate"
                            >
                                {saving || ensuring ? "Starting…" : "Start measuring"}
                            </ConfigurationPrimaryButton>
                        </>
                    }
                </div>
            </div>
        </div>
    );
}

function RecipeOption({
    recipe,
    selected,
    onSelect,
}: {
    recipe: CapacityRecipeCopy;
    selected: boolean;
    onSelect: () => void;
}) {
    return (
        <label
            className={`flex cursor-pointer gap-3 rounded-md border px-3 py-3 ${
                selected ? "border-[#00a283]/50 bg-[#00a283]/5" : "border-alloy-stone/25"
            }`}
            data-testid={`oi-recipe-${recipe.id}`}
        >
            <input type="radio" name="recipe" checked={selected} onChange={onSelect} />
            <span>
                <span className="block text-sm font-semibold text-alloy-midnight">{recipe.title}</span>
                <span className="config-typo-sublabel mt-0.5 block">{recipe.summary}</span>
            </span>
        </label>
    );
}
