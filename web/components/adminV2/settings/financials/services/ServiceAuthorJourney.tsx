"use client";

import { useMemo, useState } from "react";
import {
    ConfigButtonRow,
    ConfigPrimaryButton,
    ConfigSecondaryButton,
    ConfigTextInput,
} from "@/components/adminV2/settings/configurationRuntime/ConfigEditorPrimitives";
import ServiceSwitchboard from "@/components/adminV2/settings/financials/services/ServiceSwitchboard";
import {
    defaultCapabilities,
    rhythmOf,
    SERVICE_RHYTHM_LABEL,
    type ServiceCapability,
    type ServiceCapabilityMap,
} from "@/lib/financials/services/serviceCapabilities";
import type { FinancialServiceType } from "@/lib/financials/services/financialServicesStore";

/**
 * Question-first authoring (Alloy Services V1 blueprint §V1.3). The operator
 * answers operational questions, not a form; the answers compose the Service.
 * The answers compose directly into the same object the Operate canvas reads —
 * there is no separate "graduated" UI.
 */

type Rhythm = "recurring" | "one_time" | "usage";
const RHYTHM_TO_TYPE: Record<Rhythm, FinancialServiceType> = {
    recurring: "recurring",
    one_time: "one_time",
    usage: "usage",
};
const RHYTHM_HELP: Record<Rhythm, string> = {
    recurring: "A regular tuition — children attend on a schedule and you bill it each cycle.",
    one_time: "A single charge — like registration or a one-off fee.",
    usage: "Charged by what's used or attended — like meals or consumables.",
};

export type ServiceDraftInput = {
    label: string;
    description: string | null;
    service_type: FinancialServiceType;
    unit: string | null;
    capabilities: ServiceCapabilityMap;
    programs: string[];
};

const UNIT_OPTIONS: Record<Rhythm, string> = { recurring: "week", one_time: "", usage: "day" };

export default function ServiceAuthorJourney({
    canMutate,
    busy,
    onCreate,
    onCancel,
}: {
    canMutate: boolean;
    busy: boolean;
    onCreate: (input: ServiceDraftInput) => void;
    onCancel: () => void;
}) {
    const [step, setStep] = useState(0);
    const [label, setLabel] = useState("");
    const [sentence, setSentence] = useState("");
    const [rhythm, setRhythm] = useState<Rhythm | null>(null);
    const [caps, setCaps] = useState<ServiceCapabilityMap | null>(null);
    const [programs, setPrograms] = useState<string[]>([]);
    const [programDraft, setProgramDraft] = useState("");

    const serviceType: FinancialServiceType | null = rhythm ? RHYTHM_TO_TYPE[rhythm] : null;
    const effectiveCaps = useMemo<ServiceCapabilityMap | null>(() => {
        if (!serviceType) return null;
        return caps ?? defaultCapabilities(serviceType);
    }, [caps, serviceType]);

    function finish() {
        if (!label.trim() || !serviceType || !effectiveCaps) return;
        onCreate({
            label: label.trim(),
            description: sentence.trim() || null,
            service_type: serviceType,
            unit: UNIT_OPTIONS[rhythm!] || null,
            capabilities: effectiveCaps,
            programs,
        });
    }

    const trail: { q: string; a: string }[] = [];
    if (step > 0 && label) trail.push({ q: "What are you setting up?", a: label });
    if (step > 1 && rhythm) trail.push({ q: "How is it billed?", a: SERVICE_RHYTHM_LABEL[rhythmOf(serviceType!)] });
    if (step > 2 && effectiveCaps) {
        const on = (Object.keys(effectiveCaps) as ServiceCapability[]).filter((c) => effectiveCaps[c]).length;
        trail.push({ q: "What does it switch on?", a: `${on} of 6 on` });
    }

    return (
        <div className="mx-auto max-w-[640px]" data-testid="service-author-journey">
            {/* Answered trail */}
            {trail.length > 0 ? (
                <div className="mb-4 space-y-1">
                    {trail.map((t) => (
                        <div key={t.q} className="flex items-baseline gap-2 config-typo-meta">
                            <span className="text-[#00a283]">✓</span>
                            <span className="text-alloy-forge/55">{t.q}</span>
                            <span className="text-alloy-forge">{t.a}</span>
                        </div>
                    ))}
                </div>
            ) : null}

            {/* Step 0 — identity */}
            {step === 0 ? (
                <div data-testid="author-step-identity">
                    <h3 className="config-typo-workspace-title">What are you setting up?</h3>
                    <p className="config-typo-sublabel mb-3">Name it the way families would recognize it.</p>
                    <div className="space-y-2">
                        <ConfigTextInput value={label} onChange={setLabel} placeholder="e.g. Full-Time Care" disabled={busy} testId="author-name" />
                        <ConfigTextInput value={sentence} onChange={setSentence} placeholder="In one sentence (optional) — e.g. Full-day care, five days a week." disabled={busy} testId="author-sentence" />
                    </div>
                    <div className="mt-4">
                        <ConfigButtonRow>
                            <ConfigSecondaryButton onClick={onCancel} disabled={busy}>Cancel</ConfigSecondaryButton>
                            <ConfigPrimaryButton onClick={() => setStep(1)} disabled={busy || !label.trim()} testId="author-continue-0">Continue</ConfigPrimaryButton>
                        </ConfigButtonRow>
                    </div>
                </div>
            ) : null}

            {/* Step 1 — billing rhythm */}
            {step === 1 ? (
                <div data-testid="author-step-rhythm">
                    <h3 className="config-typo-workspace-title">How is it billed?</h3>
                    <p className="config-typo-sublabel mb-3">This sets what the service switches on next.</p>
                    <div className="space-y-2">
                        {(["recurring", "one_time", "usage"] as Rhythm[]).map((r) => (
                            <button
                                key={r}
                                type="button"
                                disabled={busy}
                                onClick={() => { setRhythm(r); setCaps(null); }}
                                data-testid={`author-rhythm-${r}`}
                                className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${
                                    rhythm === r ? "border-[#00a283] bg-[#00a283]/[0.06]" : "border-alloy-stone hover:border-[#00a283]/40"
                                }`}
                            >
                                <p className="config-typo-field-label normal-case text-alloy-forge">{SERVICE_RHYTHM_LABEL[r]}</p>
                                <p className="config-typo-meta">{RHYTHM_HELP[r]}</p>
                            </button>
                        ))}
                    </div>
                    <div className="mt-4">
                        <ConfigButtonRow>
                            <ConfigSecondaryButton onClick={() => setStep(0)} disabled={busy}>Back</ConfigSecondaryButton>
                            <ConfigPrimaryButton onClick={() => setStep(2)} disabled={busy || !rhythm} testId="author-continue-1">Continue</ConfigPrimaryButton>
                        </ConfigButtonRow>
                    </div>
                </div>
            ) : null}

            {/* Step 2 — switchboard */}
            {step === 2 && effectiveCaps ? (
                <div data-testid="author-step-switchboard">
                    <h3 className="config-typo-workspace-title">What does it switch on?</h3>
                    <p className="config-typo-sublabel mb-3">We&apos;ve set the usual defaults for {SERVICE_RHYTHM_LABEL[rhythmOf(serviceType!)].toLowerCase()} — confirm or adjust.</p>
                    <ServiceSwitchboard
                        capabilities={effectiveCaps}
                        canMutate={canMutate}
                        busy={busy}
                        confirmHighConsequence={false}
                        onToggle={(cap, value) => setCaps({ ...effectiveCaps, [cap]: value })}
                    />
                    <div className="mt-4">
                        <ConfigButtonRow>
                            <ConfigSecondaryButton onClick={() => setStep(1)} disabled={busy}>Back</ConfigSecondaryButton>
                            <ConfigPrimaryButton onClick={() => setStep(3)} disabled={busy} testId="author-continue-2">Continue</ConfigPrimaryButton>
                        </ConfigButtonRow>
                    </div>
                </div>
            ) : null}

            {/* Step 3 — programs + finish */}
            {step === 3 ? (
                <div data-testid="author-step-programs">
                    <h3 className="config-typo-workspace-title">Which programs deliver it?</h3>
                    <p className="config-typo-sublabel mb-3">Optional — associate the programs this service is offered through.</p>
                    <div className="flex flex-wrap gap-1.5">
                        {programs.map((p) => (
                            <span key={p} className="inline-flex items-center gap-1 rounded-full border border-alloy-stone bg-alloy-stone/30 px-2.5 py-0.5 config-typo-meta">
                                {p}
                                <button type="button" aria-label={`Remove ${p}`} className="text-alloy-forge/40" onClick={() => setPrograms(programs.filter((x) => x !== p))}>×</button>
                            </span>
                        ))}
                    </div>
                    <div className="mt-2 flex gap-2">
                        <ConfigTextInput value={programDraft} onChange={setProgramDraft} placeholder="e.g. Toddler" disabled={busy} testId="author-program" />
                        <ConfigSecondaryButton
                            onClick={() => { const v = programDraft.trim(); if (v && !programs.includes(v)) setPrograms([...programs, v]); setProgramDraft(""); }}
                            disabled={busy || !programDraft.trim()}
                        >
                            Add
                        </ConfigSecondaryButton>
                    </div>
                    <div className="mt-4">
                        <ConfigButtonRow>
                            <ConfigSecondaryButton onClick={() => setStep(2)} disabled={busy}>Back</ConfigSecondaryButton>
                            <ConfigPrimaryButton onClick={finish} disabled={busy || !label.trim()} testId="author-finish">Create service</ConfigPrimaryButton>
                        </ConfigButtonRow>
                    </div>
                </div>
            ) : null}

            {/* Upcoming questions (dimmed) */}
            {step < 3 ? (
                <div className="mt-5 space-y-1 border-t border-alloy-stone/40 pt-3">
                    {step < 1 ? <p className="config-typo-meta text-alloy-forge/35">◌ How is it billed?</p> : null}
                    {step < 2 ? <p className="config-typo-meta text-alloy-forge/35">◌ What does it switch on?</p> : null}
                    {step < 3 ? <p className="config-typo-meta text-alloy-forge/35">◌ Which programs deliver it?</p> : null}
                </div>
            ) : null}
        </div>
    );
}
