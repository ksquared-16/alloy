"use client";

import { useEffect, useState } from "react";
import {
    ConfigurationPrimaryButton,
    ConfigurationSecondaryButton,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import { CONFIG_OBJECT_CELL, ConfigEditorSection } from "@/components/adminV2/settings/configurationRuntime/workspace";
import {
    formatRatioTiers,
    ratioNeedsReview,
    readObjectRatioTiers,
    resolveObjectRatioStanding,
    validateRatioTiers,
    type RatioTierValue,
} from "@/lib/locations/objectRatio";
import type {
    ChildcareRatioRuleRow,
    ChildcareRatioRuleTierRow,
} from "@/lib/childcareOperational/config/configRuleTypes";
import type { LocationHierarchyRow } from "@/lib/adminV2/locationsHierarchyTablePresentation";

/**
 * Staffing ratio on the operational space.
 *
 * Read state is one line in the director's own grammar — `1:5 · 2:11`. Edit
 * state is a list of steps, because the tiers are not one ratio repeated: two
 * staff covering eleven children is deliberately not two covering ten, and a
 * single ratio field would throw that away on the first save.
 *
 * WHEN THE TWO RECORDS DISAGREE, THIS SURFACE ASKS RATHER THAN DECIDES.
 * Infant A carries a legacy `1:5,2:11` beside a canonical `1:4 · 2:8 · 3:12`.
 * Which is true is a claim about staffing law, so both are shown, the edit form
 * opens pre-filled with neither, and nothing is written until a person chooses.
 */
export default function SpaceRatioSection({
    room,
    ratioRules,
    ratioTiers,
    todayYmd,
    canMutate,
    onSaved,
}: {
    room: LocationHierarchyRow;
    ratioRules: readonly ChildcareRatioRuleRow[];
    ratioTiers: readonly ChildcareRatioRuleTierRow[];
    todayYmd: string;
    canMutate: boolean;
    onSaved: () => Promise<void> | void;
}) {
    const legacyRaw = ((room.metadata ?? {}) as Record<string, unknown>).student_teacher_ratio;
    const standing = resolveObjectRatioStanding({
        rules: ratioRules,
        tierRows: ratioTiers,
        roomLocationId: room.id,
        legacyRaw,
        todayYmd,
    });
    const canonical = readObjectRatioTiers(standing);
    const needsReview = ratioNeedsReview(standing);

    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState<{ staff: string; children: string }[]>([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setEditing(false);
        setError(null);
    }, [room.id]);

    const beginEdit = (seed: RatioTierValue[] | null) => {
        setDraft(
            (seed ?? canonical ?? []).map((t) => ({
                staff: String(t.requiredStaff),
                children: String(t.maxChildren),
            })),
        );
        setError(null);
        setEditing(true);
    };

    const save = async () => {
        setBusy(true);
        setError(null);
        try {
            const tiers: RatioTierValue[] = draft
                // A wholly blank row is how an operator deletes a step, so it is
                // dropped rather than refused.
                .filter((d) => d.staff.trim() !== "" || d.children.trim() !== "")
                .map((d) => ({ requiredStaff: Number(d.staff), maxChildren: Number(d.children) }));
            const check = validateRatioTiers(tiers);
            if (!check.ok) throw new Error(check.message);
            const res = await fetch("/api/admin/operational-config/ratio-rules", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "set_object_ratio",
                    room_location_id: room.id,
                    tiers: check.tiers,
                }),
            });
            if (!res.ok) {
                const json = (await res.json().catch(() => ({}))) as { error?: string };
                throw new Error(json.error ?? `Could not save the ratio (${res.status})`);
            }
            await onSaved();
            setEditing(false);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not save the ratio.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <ConfigEditorSection title="Staffing ratio" testId="locations-space-ratio">
            {!editing ?
                <div className="space-y-2">
                    {canonical && canonical.length > 0 ?
                        <div className={CONFIG_OBJECT_CELL} data-testid="locations-space-ratio-read">
                            <p className="text-base font-semibold leading-tight text-alloy-midnight">
                                {formatRatioTiers(canonical)}
                            </p>
                            <p className="config-typo-sublabel mt-0.5">
                                {canonical
                                    .map((t) => `${t.requiredStaff} staff for up to ${t.maxChildren} children`)
                                    .join(" · ")}
                            </p>
                        </div>
                    :   <p className="config-typo-sublabel" data-testid="locations-space-ratio-empty">
                            No staffing ratio set for this space.
                        </p>
                    }

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
                                        These disagree. Only you can say which is right for this room.
                                    </p>
                                </>
                            : standing.state === "legacy_only" ?
                                <p className="mt-1">
                                    Recorded earlier as <strong>{formatRatioTiers(standing.legacy)}</strong>, before
                                    ratios were configured here. Confirm it to make it this space&rsquo;s ratio.
                                </p>
                            : standing.state === "legacy_unreadable" ?
                                <p className="mt-1">
                                    Recorded earlier as &ldquo;{standing.legacyRaw}&rdquo;, which we cannot read as a
                                    staffing ratio. Set the ratio here to replace it.
                                </p>
                            :   null}
                            {canMutate ?
                                <div className="mt-2 flex flex-wrap gap-2">
                                    <ConfigurationSecondaryButton
                                        className="config-primary-btn--sm"
                                        onClick={() =>
                                            beginEdit(
                                                // A conflict opens on NEITHER record: seeding one
                                                // would make a staffing-law decision by default.
                                                standing.state === "legacy_only" ? standing.legacy : null,
                                            )
                                        }
                                        data-testid="locations-space-ratio-review-action"
                                    >
                                        Review ratio
                                    </ConfigurationSecondaryButton>
                                </div>
                            :   null}
                        </div>
                    :   null}

                    {canMutate && !needsReview ?
                        <ConfigurationSecondaryButton
                            className="config-primary-btn--sm"
                            onClick={() => beginEdit(null)}
                            data-testid="locations-space-ratio-edit"
                        >
                            {canonical && canonical.length > 0 ? "Edit ratio" : "Set ratio"}
                        </ConfigurationSecondaryButton>
                    :   null}
                </div>
            :   <div className="space-y-2" data-testid="locations-space-ratio-editor">
                    <p className="config-typo-sublabel">
                        Add a step for each staffing threshold. Two staff for up to 11 children is a different
                        promise from two for up to 10, so each step is kept as you enter it.
                    </p>
                    <div className="space-y-1.5">
                        {draft.map((d, i) => (
                            <div key={i} className="flex flex-wrap items-center gap-2" data-testid={`locations-space-ratio-tier-${i}`}>
                                <input
                                    type="number"
                                    min={1}
                                    value={d.staff}
                                    onChange={(e) =>
                                        setDraft((cur) => cur.map((x, j) => (j === i ? { ...x, staff: e.target.value } : x)))
                                    }
                                    className="config-runtime-input w-20"
                                    aria-label={`Staff for step ${i + 1}`}
                                    data-testid={`locations-space-ratio-staff-${i}`}
                                />
                                <span className="text-[12px] text-alloy-midnight/60">staff for up to</span>
                                <input
                                    type="number"
                                    min={1}
                                    value={d.children}
                                    onChange={(e) =>
                                        setDraft((cur) => cur.map((x, j) => (j === i ? { ...x, children: e.target.value } : x)))
                                    }
                                    className="config-runtime-input w-20"
                                    aria-label={`Children for step ${i + 1}`}
                                    data-testid={`locations-space-ratio-children-${i}`}
                                />
                                <span className="text-[12px] text-alloy-midnight/60">children</span>
                                <button
                                    type="button"
                                    onClick={() => setDraft((cur) => cur.filter((_, j) => j !== i))}
                                    className="text-[11px] text-alloy-midnight/45 underline hover:text-alloy-ember"
                                    data-testid={`locations-space-ratio-remove-${i}`}
                                >
                                    Remove
                                </button>
                            </div>
                        ))}
                    </div>
                    <ConfigurationSecondaryButton
                        className="config-primary-btn--sm"
                        onClick={() => setDraft((cur) => [...cur, { staff: "", children: "" }])}
                        data-testid="locations-space-ratio-add-tier"
                    >
                        Add a step
                    </ConfigurationSecondaryButton>

                    {error ?
                        <p className="text-sm text-red-800" role="alert" data-testid="locations-space-ratio-error">
                            {error}
                        </p>
                    :   null}

                    <div className="flex flex-wrap gap-2 pt-1">
                        <ConfigurationPrimaryButton
                            className="config-primary-btn--sm"
                            disabled={busy}
                            onClick={() => void save()}
                            data-testid="locations-space-ratio-save"
                        >
                            {busy ? "Saving…" : "Save ratio"}
                        </ConfigurationPrimaryButton>
                        <ConfigurationSecondaryButton
                            onClick={() => {
                                setEditing(false);
                                setError(null);
                            }}
                            disabled={busy}
                            data-testid="locations-space-ratio-cancel"
                        >
                            Cancel
                        </ConfigurationSecondaryButton>
                    </div>
                </div>
            }
        </ConfigEditorSection>
    );
}
