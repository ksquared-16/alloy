"use client";

import { CONFIG_OBJECT_CELL } from "@/components/adminV2/settings/configurationRuntime/workspace";
import { ConfigurationSecondaryButton } from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import {
    formatRatioTiers,
    ratioNeedsReview,
    readObjectRatioTiers,
    type ObjectRatioStanding,
} from "@/lib/locations/objectRatio";

/**
 * Staffing ratio, in two halves.
 *
 * `SpaceRatioRead` is what the detail shows. `SpaceRatioTierFields` is a compact
 * grid that lives INSIDE the ordinary Space edit form, beside name, capacity and
 * programs — a staffing ratio is an operating fact of the group, not a separate
 * configuration errand, so it is saved by the same button as everything else.
 *
 * The grid labels Staff and Children once, at the top, rather than repeating the
 * words around every input. The earlier shape restated "staff / staff for up to
 * / children / Remove" per tier, which made a two-step ratio taller than the
 * rest of the form put together.
 *
 * WHAT MUST NOT CHANGE: the tiers stay exactly as entered. `1 / 5` and `2 / 11`
 * are two separate thresholds, and `2:11` is deliberately not the doubling of
 * `1:5`. Nothing here derives one tier from another.
 */

export function SpaceRatioRead({ standing }: { standing: ObjectRatioStanding }) {
    const tiers = readObjectRatioTiers(standing);
    const needsReview = ratioNeedsReview(standing);

    return (
        <div className="space-y-2" data-testid="locations-space-ratio">
            {tiers && tiers.length > 0 ?
                <div className={CONFIG_OBJECT_CELL} data-testid="locations-space-ratio-read">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/40">
                        Staffing ratio
                    </p>
                    <p className="mt-0.5 text-base font-semibold leading-tight text-alloy-midnight">
                        {formatRatioTiers(tiers)}
                    </p>
                </div>
            : !needsReview ?
                <div className={CONFIG_OBJECT_CELL} data-testid="locations-space-ratio-empty">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/40">
                        Staffing ratio
                    </p>
                    <p className="mt-0.5 text-base font-semibold leading-tight text-alloy-midnight">Not set</p>
                </div>
            :   null}

            {needsReview ?
                <div
                    className="rounded-lg border border-alloy-gold/40 bg-alloy-gold/10 px-3 py-2 text-[12px] text-alloy-midnight"
                    data-testid="locations-space-ratio-review"
                >
                    <p className="font-semibold">Ratio needs review</p>
                    {standing.state === "conflict" ?
                        <>
                            <p className="mt-1">
                                Recorded earlier: <strong>{formatRatioTiers(standing.legacy)}</strong>
                            </p>
                            <p>
                                Configured now: <strong>{formatRatioTiers(standing.tiers)}</strong>
                            </p>
                            <p className="mt-1 text-alloy-midnight/70">
                                These disagree. Only you can say which is right for this space.
                            </p>
                        </>
                    : standing.state === "legacy_only" ?
                        <p className="mt-1">
                            Recorded earlier as <strong>{formatRatioTiers(standing.legacy)}</strong>, before ratios
                            were configured here. Edit the space to confirm it.
                        </p>
                    : standing.state === "legacy_unreadable" ?
                        <p className="mt-1">
                            Recorded earlier as &ldquo;{standing.legacyRaw}&rdquo;, which we cannot read as a staffing
                            ratio. Edit the space to set one.
                        </p>
                    :   null}
                </div>
            :   null}
        </div>
    );
}

export type RatioDraftRow = { staff: string; children: string };

export function SpaceRatioTierFields({
    draft,
    disabled,
    onChange,
}: {
    draft: RatioDraftRow[];
    disabled: boolean;
    onChange: (next: RatioDraftRow[]) => void;
}) {
    const set = (i: number, patch: Partial<RatioDraftRow>) =>
        onChange(draft.map((row, j) => (j === i ? { ...row, ...patch } : row)));

    return (
        <div className="space-y-1.5" data-testid="locations-space-ratio-editor">
            {draft.length > 0 ?
                <div className="max-w-sm space-y-1">
                    {/* Labelled once. The columns carry the meaning from here down. */}
                    <div className="grid grid-cols-[5rem_5rem_auto] items-center gap-2">
                        <span className="config-typo-field-label">Staff</span>
                        <span className="config-typo-field-label">Children</span>
                        <span className="sr-only">Actions</span>
                    </div>
                    {draft.map((row, i) => (
                        <div
                            key={i}
                            className="grid grid-cols-[5rem_5rem_auto] items-center gap-2"
                            data-testid={`locations-space-ratio-tier-${i}`}
                        >
                            <input
                                type="number"
                                min={1}
                                value={row.staff}
                                disabled={disabled}
                                onChange={(e) => set(i, { staff: e.target.value })}
                                className="config-runtime-input"
                                aria-label={`Staff for step ${i + 1}`}
                                data-testid={`locations-space-ratio-staff-${i}`}
                            />
                            <input
                                type="number"
                                min={1}
                                value={row.children}
                                disabled={disabled}
                                onChange={(e) => set(i, { children: e.target.value })}
                                className="config-runtime-input"
                                aria-label={`Children for step ${i + 1}`}
                                data-testid={`locations-space-ratio-children-${i}`}
                            />
                            <button
                                type="button"
                                disabled={disabled}
                                onClick={() => onChange(draft.filter((_, j) => j !== i))}
                                className="justify-self-start text-[11px] text-alloy-midnight/45 underline hover:text-alloy-ember"
                                data-testid={`locations-space-ratio-remove-${i}`}
                            >
                                Remove
                            </button>
                        </div>
                    ))}
                </div>
            :   <p className="config-typo-sublabel" data-testid="locations-space-ratio-none">
                    No staffing ratio set for this space.
                </p>
            }
            <ConfigurationSecondaryButton
                className="config-primary-btn--sm"
                disabled={disabled}
                onClick={() => onChange([...draft, { staff: "", children: "" }])}
                data-testid="locations-space-ratio-add-tier"
            >
                + Add tier
            </ConfigurationSecondaryButton>
        </div>
    );
}
