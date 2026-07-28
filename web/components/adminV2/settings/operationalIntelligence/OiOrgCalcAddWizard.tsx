"use client";

/**
 * Add measurement — Organization calculation source wizard (Future Room Capacity proving slice).
 */

import { useEffect, useMemo, useState } from "react";
import {
    ConfigurationPrimaryButton,
    ConfigurationSecondaryButton,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import { ConfigEditorSection, ConfigWorkspaceCard } from "@/components/adminV2/settings/configurationRuntime/workspace";

type PublishedCalc = {
    id: string;
    name: string;
    description: string | null;
    lifecycle: string;
    published_version_id: string | null;
};

type VersionRow = {
    id: string;
    version_number: number;
    immutable: boolean;
    published_at: string | null;
};

type WizardProps = {
    busy: boolean;
    onClose: () => void;
    onCreated: (measurementId: string) => void;
};

export default function OiOrgCalcAddWizard({ busy, onClose, onCreated }: WizardProps) {
    const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
    const [calcs, setCalcs] = useState<PublishedCalc[]>([]);
    const [versions, setVersions] = useState<VersionRow[]>([]);
    const [calculationId, setCalculationId] = useState("");
    const [versionId, setVersionId] = useState("");
    const [name, setName] = useState("Future Room Capacity");
    const [description, setDescription] = useState(
        "Capacity from a published organization calculation for a room on a future date.",
    );
    const [targetMin, setTargetMin] = useState("18");
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        void (async () => {
            try {
                const res = await fetch("/api/admin/organization-calculations");
                const json = (await res.json()) as { calculations?: PublishedCalc[] };
                if (!res.ok) return;
                const published = (json.calculations ?? []).filter((c) => c.lifecycle === "published");
                setCalcs(published);
                if (published[0]) setCalculationId(published[0].id);
            } catch {
                /* optional */
            }
        })();
    }, []);

    useEffect(() => {
        if (!calculationId) {
            setVersions([]);
            setVersionId("");
            return;
        }
        void (async () => {
            const res = await fetch(`/api/admin/organization-calculations/${calculationId}`);
            const json = (await res.json()) as { versions?: VersionRow[]; calculation?: { name: string } };
            if (!res.ok) return;
            const published = (json.versions ?? []).filter((v) => v.immutable);
            setVersions(published);
            const preferred =
                published.find((v) => v.id === calcs.find((c) => c.id === calculationId)?.published_version_id)
                ?? published[published.length - 1];
            setVersionId(preferred?.id ?? "");
            if (json.calculation?.name && name === "Future Room Capacity") {
                setName(`Future Room Capacity — ${json.calculation.name}`);
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [calculationId]);

    const selectedCalc = useMemo(() => calcs.find((c) => c.id === calculationId) ?? null, [calcs, calculationId]);
    const selectedVersion = useMemo(() => versions.find((v) => v.id === versionId) ?? null, [versions, versionId]);

    const save = async () => {
        setSaving(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/metrics/oi-org-calc-measurements", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: name.trim(),
                    description: description.trim(),
                    calculation_id: calculationId,
                    calculation_version_id: versionId,
                    target_min_seats: targetMin.trim() ? Number(targetMin) : null,
                }),
            });
            const json = (await res.json()) as { measurement?: { id: string }; error?: string };
            if (!res.ok) throw new Error(json.error ?? `Create failed (${res.status})`);
            if (!json.measurement) throw new Error("Missing measurement");
            onCreated(json.measurement.id);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not create measurement");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
            role="dialog"
            aria-modal="true"
            data-testid="oi-org-calc-add-wizard"
        >
            <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-xl">
                <div className="border-b border-alloy-stone/15 px-4 py-3">
                    <h2 className="text-sm font-semibold text-alloy-midnight">Add measurement</h2>
                    <p className="mt-0.5 text-xs text-alloy-midnight/55">
                        Step {step} of 5 — bind a published organization calculation as Future Room Capacity.
                    </p>
                </div>

                <div className="space-y-3 px-4 py-4">
                    {step === 1 ?
                        <ConfigWorkspaceCard testId="oi-org-calc-wizard-source">
                            <ConfigEditorSection title="Choose source" description="Only sources that work today are listed.">
                                <label className="flex cursor-pointer gap-3 rounded-md border border-[#00a283]/50 bg-[#00a283]/5 px-3 py-3">
                                    <input type="radio" checked readOnly data-testid="oi-org-calc-source-org-calc" />
                                    <span>
                                        <span className="block text-sm font-semibold text-alloy-midnight">
                                            Organization calculation
                                        </span>
                                        <span className="config-typo-sublabel mt-0.5 block">
                                            Effective-dated capacity from a published calculation version.
                                        </span>
                                    </span>
                                </label>
                            </ConfigEditorSection>
                        </ConfigWorkspaceCard>
                    : null}

                    {step === 2 ?
                        <ConfigWorkspaceCard testId="oi-org-calc-wizard-calc">
                            <ConfigEditorSection
                                title="Select published calculation"
                                description="The measurement will stay on the version you choose until you explicitly use a newer version."
                            >
                                {calcs.length === 0 ?
                                    <p className="text-sm text-alloy-midnight/60">
                                        No published organization calculations yet. Publish one under Organization →
                                        Calculations first.
                                    </p>
                                :   <div className="space-y-2">
                                        {calcs.map((c) => (
                                            <label
                                                key={c.id}
                                                className={`flex cursor-pointer gap-3 rounded-md border px-3 py-2 ${
                                                    calculationId === c.id ?
                                                        "border-[#00a283]/50 bg-[#00a283]/5"
                                                    :   "border-alloy-stone/25"
                                                }`}
                                            >
                                                <input
                                                    type="radio"
                                                    name="calc"
                                                    checked={calculationId === c.id}
                                                    onChange={() => setCalculationId(c.id)}
                                                    data-testid={`oi-org-calc-pick-${c.id}`}
                                                />
                                                <span>
                                                    <span className="block text-sm font-semibold">{c.name}</span>
                                                    <span className="config-typo-sublabel">
                                                        {c.description?.trim() || "Published calculation"}
                                                    </span>
                                                </span>
                                            </label>
                                        ))}
                                    </div>
                                }
                                {versions.length > 0 ?
                                    <label className="mt-3 block space-y-1">
                                        <span className="config-typo-field-label">Published version</span>
                                        <select
                                            className="config-runtime-input"
                                            value={versionId}
                                            onChange={(e) => setVersionId(e.target.value)}
                                            data-testid="oi-org-calc-version"
                                        >
                                            {versions.map((v) => (
                                                <option key={v.id} value={v.id}>
                                                    Version {v.version_number}
                                                    {v.published_at ?
                                                        ` · published ${new Date(v.published_at).toLocaleDateString()}`
                                                    :   ""}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                :   null}
                            </ConfigEditorSection>
                        </ConfigWorkspaceCard>
                    : null}

                    {step === 3 ?
                        <ConfigWorkspaceCard testId="oi-org-calc-wizard-name">
                            <ConfigEditorSection title="Name the measurement">
                                <label className="block space-y-1">
                                    <span className="config-typo-field-label">Name</span>
                                    <input
                                        className="config-runtime-input"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        data-testid="oi-org-calc-name"
                                    />
                                </label>
                                <label className="mt-3 block space-y-1">
                                    <span className="config-typo-field-label">Description</span>
                                    <textarea
                                        className="config-runtime-input min-h-[4rem]"
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        data-testid="oi-org-calc-description"
                                    />
                                </label>
                                <p className="config-typo-sublabel mt-3">
                                    Measures room capacity · Unit: seats · Grain: room + effective date
                                </p>
                            </ConfigEditorSection>
                        </ConfigWorkspaceCard>
                    : null}

                    {step === 4 ?
                        <ConfigWorkspaceCard testId="oi-org-calc-wizard-target">
                            <ConfigEditorSection
                                title="Optional target"
                                description="Minimum future room capacity. Leave blank to activate without a goal."
                            >
                                <label className="block max-w-xs space-y-1">
                                    <span className="config-typo-field-label">Minimum seats</span>
                                    <input
                                        className="config-runtime-input"
                                        value={targetMin}
                                        onChange={(e) => setTargetMin(e.target.value)}
                                        inputMode="numeric"
                                        data-testid="oi-org-calc-target"
                                    />
                                </label>
                            </ConfigEditorSection>
                        </ConfigWorkspaceCard>
                    : null}

                    {step === 5 ?
                        <ConfigWorkspaceCard testId="oi-org-calc-wizard-preview">
                            <ConfigEditorSection title="Preview" description="Confirm before activating.">
                                <dl className="space-y-2 text-sm">
                                    <div>
                                        <dt className="config-typo-field-label">Measurement</dt>
                                        <dd>{name.trim() || "—"}</dd>
                                    </div>
                                    <div>
                                        <dt className="config-typo-field-label">Source</dt>
                                        <dd>{selectedCalc?.name ?? "—"}</dd>
                                    </div>
                                    <div>
                                        <dt className="config-typo-field-label">Published version</dt>
                                        <dd>
                                            {selectedVersion ?
                                                `Version ${selectedVersion.version_number}`
                                            :   "—"}
                                        </dd>
                                    </div>
                                    <div>
                                        <dt className="config-typo-field-label">Measures</dt>
                                        <dd>Room capacity · seats</dd>
                                    </div>
                                    <div>
                                        <dt className="config-typo-field-label">Target</dt>
                                        <dd>
                                            {targetMin.trim() ?
                                                `Minimum ${targetMin.trim()} seats`
                                            :   "No target"}
                                        </dd>
                                    </div>
                                </dl>
                                <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                                    Publishing a newer calculation version will not change this measurement. Use
                                    “Use newer version” on the measurement to rebind explicitly.
                                </p>
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
                    <ConfigurationSecondaryButton onClick={onClose} disabled={busy || saving}>
                        Cancel
                    </ConfigurationSecondaryButton>
                    {step > 1 ?
                        <ConfigurationSecondaryButton
                            onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3 | 4 | 5)}
                            disabled={saving}
                        >
                            Back
                        </ConfigurationSecondaryButton>
                    :   null}
                    {step < 5 ?
                        <ConfigurationPrimaryButton
                            className="config-primary-btn--sm"
                            disabled={
                                saving
                                || (step === 2 && (!calculationId || !versionId))
                                || (step === 3 && !name.trim())
                            }
                            onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3 | 4 | 5)}
                            data-testid="oi-org-calc-wizard-next"
                        >
                            Continue
                        </ConfigurationPrimaryButton>
                    :   <ConfigurationPrimaryButton
                            className="config-primary-btn--sm"
                            disabled={saving || !name.trim() || !versionId}
                            onClick={() => void save()}
                            data-testid="oi-org-calc-wizard-activate"
                        >
                            {saving ? "Activating…" : "Activate"}
                        </ConfigurationPrimaryButton>
                    }
                </div>
            </div>
        </div>
    );
}
