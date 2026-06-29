"use client";

import type { EditorExtraForm } from "@/components/adminV2/settings/configurationRuntime/EffectiveDatedConfigurationEditor";
import {
    ConfigNumberInput,
    ConfigPrimaryButton,
    ConfigSecondaryButton,
} from "@/components/adminV2/settings/configurationRuntime/ConfigEditorPrimitives";

/**
 * Structured sub-form for ratio rule tiers (Operational Configuration V1, Phase
 * 3). Tiers have no own effective dates — they version WITH the parent ratio
 * rule — so they live inside the shared editor's `extraForm` slot and are saved
 * as part of the new ratio version. A tier = "N staff cover up to M children".
 */

export type TierDraft = { maxChildren: string; requiredStaff: string };

export function readTierDrafts(state: Record<string, unknown>): TierDraft[] {
    const raw = state.tiers;
    if (!Array.isArray(raw)) return [];
    return raw.map((t) => {
        const o = (t ?? {}) as Record<string, unknown>;
        return { maxChildren: String(o.maxChildren ?? ""), requiredStaff: String(o.requiredStaff ?? "") };
    });
}

/** Parse drafts into the API tier payload, throwing a user-facing error if invalid. */
export function tierDraftsToPayload(state: Record<string, unknown>): { max_children: number; required_staff: number }[] {
    const drafts = readTierDrafts(state);
    const tiers = drafts
        .filter((d) => d.maxChildren.trim() !== "" || d.requiredStaff.trim() !== "")
        .map((d) => ({ max_children: Number(d.maxChildren), required_staff: Number(d.requiredStaff) }));
    if (tiers.length === 0) throw new Error("Add at least one staffing tier");
    for (const t of tiers) {
        if (!Number.isInteger(t.max_children) || t.max_children <= 0) throw new Error("Tier max children must be a positive integer");
        if (!Number.isInteger(t.required_staff) || t.required_staff <= 0) throw new Error("Tier required staff must be a positive integer");
    }
    return tiers;
}

export function buildRatioTierExtraForm(initialTiers: TierDraft[]): EditorExtraForm {
    return {
        initial: () => ({
            tiers: initialTiers.length > 0 ? initialTiers : [{ maxChildren: "", requiredStaff: "" }],
        }),
        render: (state, setState, busy) => (
            <RatioTierFields
                tiers={readTierDrafts(state)}
                busy={busy}
                onChange={(tiers) => setState({ ...state, tiers })}
            />
        ),
    };
}

function RatioTierFields({
    tiers,
    busy,
    onChange,
}: {
    tiers: TierDraft[];
    busy: boolean;
    onChange: (tiers: TierDraft[]) => void;
}) {
    function update(i: number, patch: Partial<TierDraft>) {
        onChange(tiers.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
    }
    return (
        <div className="space-y-2" data-testid="ratio-tier-fields">
            <p className="config-typo-sublabel text-alloy-forge/60">Staffing tiers (1 staff per N children)</p>
            {tiers.map((tier, i) => (
                <div key={i} className="flex items-end gap-2" data-testid={`ratio-tier-row-${i}`}>
                    <label className="block text-xs">
                        <span className="mb-0.5 block font-medium text-alloy-midnight/70">Up to children</span>
                        <ConfigNumberInput
                            value={tier.maxChildren}
                            onChange={(v) => update(i, { maxChildren: v })}
                            min="1"
                            step="1"
                            disabled={busy}
                            testId={`ratio-tier-${i}-max`}
                        />
                    </label>
                    <label className="block text-xs">
                        <span className="mb-0.5 block font-medium text-alloy-midnight/70">Required staff</span>
                        <ConfigNumberInput
                            value={tier.requiredStaff}
                            onChange={(v) => update(i, { requiredStaff: v })}
                            min="1"
                            step="1"
                            disabled={busy}
                            testId={`ratio-tier-${i}-staff`}
                        />
                    </label>
                    {tiers.length > 1 ? (
                        <ConfigSecondaryButton
                            onClick={() => onChange(tiers.filter((_, idx) => idx !== i))}
                            disabled={busy}
                            testId={`ratio-tier-${i}-remove`}
                        >
                            Remove
                        </ConfigSecondaryButton>
                    ) : null}
                </div>
            ))}
            <ConfigPrimaryButton
                onClick={() => onChange([...tiers, { maxChildren: "", requiredStaff: "" }])}
                disabled={busy}
                testId="ratio-tier-add"
            >
                Add tier
            </ConfigPrimaryButton>
        </div>
    );
}
