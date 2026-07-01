"use client";

import { useEffect, useMemo, useState } from "react";
import type {
    PriorStageOpenWorkItem,
    StageTransitionAttentionResolution,
    StageTransitionReconciliationPreflight,
    StageTransitionWorkResolution,
} from "@/lib/lifecycle/stageTransitionReconciliationTypes";

type Props = {
    open: boolean;
    preflight: StageTransitionReconciliationPreflight;
    saving?: boolean;
    onCancel: () => void;
    onContinue: (payload: {
        work: Array<{ work_id: string; resolution: StageTransitionWorkResolution }>;
        attention?: StageTransitionAttentionResolution;
    }) => void;
};

function WorkResolutionRow({
    item,
    resolution,
    onChange,
}: {
    item: PriorStageOpenWorkItem;
    resolution: StageTransitionWorkResolution;
    onChange: (next: StageTransitionWorkResolution) => void;
}) {
    const name = `work-resolution-${item.work_id}`;
    return (
        <li className="rounded-lg border border-alloy-stone/15 bg-alloy-stone/[0.03] px-3 py-2.5">
            <div className="text-[13px] font-medium text-alloy-midnight">{item.title}</div>
            {item.stage_label ?
                <div className="mt-0.5 text-[11px] text-alloy-midnight/55">From {item.stage_label}</div>
            :   null}
            <fieldset className="mt-2 space-y-1.5">
                <legend className="sr-only">Resolution for {item.title}</legend>
                {(
                    [
                        ["completed", "Mark completed"],
                        ["skipped", "Mark skipped / cancelled"],
                        ["carry_forward", "Carry forward as follow-up"],
                    ] as const
                ).map(([value, label]) => (
                    <label key={value} className="flex cursor-pointer items-center gap-2 text-[12px] text-alloy-midnight/85">
                        <input
                            type="radio"
                            name={name}
                            value={value}
                            checked={resolution === value}
                            onChange={() => onChange(value)}
                            className="h-3.5 w-3.5 border-alloy-stone/40 text-alloy-juniper focus:ring-alloy-juniper/30"
                        />
                        {label}
                    </label>
                ))}
            </fieldset>
        </li>
    );
}

/** Reconciliation dialog when a stage skip would leave prior-stage open work unresolved. */
export function StageTransitionReconciliationDialog({ open, preflight, saving, onCancel, onContinue }: Props) {
    const [workResolutions, setWorkResolutions] = useState<Record<string, StageTransitionWorkResolution>>({});
    const [attentionResolution, setAttentionResolution] = useState<StageTransitionAttentionResolution>("cleared");

    useEffect(() => {
        if (!open) return;
        const next: Record<string, StageTransitionWorkResolution> = {};
        for (const item of preflight.open_work) {
            next[item.work_id] = "skipped";
        }
        setWorkResolutions(next);
        setAttentionResolution("cleared");
    }, [open, preflight]);

    const stageLabel = preflight.next_stage_label ?? preflight.next_builder_stage_key ?? preflight.next_status_key;

    const payload = useMemo(
        () => ({
            work: preflight.open_work.map((item) => ({
                work_id: item.work_id,
                resolution: workResolutions[item.work_id] ?? "skipped",
            })),
            ...(preflight.has_attention ? { attention: attentionResolution } : {}),
        }),
        [attentionResolution, preflight.has_attention, preflight.open_work, workResolutions],
    );

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-alloy-midnight/35 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="stage-reconciliation-title"
        >
            <div className="w-full max-w-md rounded-2xl border border-alloy-stone/15 bg-white p-5 shadow-xl">
                <h2 id="stage-reconciliation-title" className="text-[15px] font-semibold text-alloy-midnight">
                    Reconcile active work
                </h2>
                <p className="mt-2 text-[13px] leading-relaxed text-alloy-midnight/75">
                    You are moving this family to <span className="font-semibold">{stageLabel}</span>.
                    {preflight.open_work.length ?
                        " The following active work exists from a prior stage:"
                    :   " Active needs-attention should be resolved before continuing."}
                </p>

                {preflight.open_work.length ?
                    <ul className="mt-3 space-y-2">
                        {preflight.open_work.map((item) => (
                            <WorkResolutionRow
                                key={item.work_id}
                                item={item}
                                resolution={workResolutions[item.work_id] ?? "skipped"}
                                onChange={(next) =>
                                    setWorkResolutions((prev) => ({ ...prev, [item.work_id]: next }))
                                }
                            />
                        ))}
                    </ul>
                :   null}

                {preflight.has_attention ?
                    <div className="mt-4 rounded-lg border border-alloy-ember/20 bg-alloy-ember/[0.04] px-3 py-2.5">
                        <div className="text-[12px] font-semibold text-alloy-midnight">Needs attention</div>
                        <div className="mt-1 text-[12px] text-alloy-midnight/75">
                            {preflight.attention_reason ?? "Active attention on this record"}
                        </div>
                        <fieldset className="mt-2 space-y-1.5">
                            <legend className="sr-only">Attention resolution</legend>
                            {(
                                [
                                    ["cleared", "Clear attention"],
                                    ["carry_forward", "Carry forward"],
                                ] as const
                            ).map(([value, label]) => (
                                <label
                                    key={value}
                                    className="flex cursor-pointer items-center gap-2 text-[12px] text-alloy-midnight/85"
                                >
                                    <input
                                        type="radio"
                                        name="attention-resolution"
                                        checked={attentionResolution === value}
                                        onChange={() => setAttentionResolution(value)}
                                        className="h-3.5 w-3.5 border-alloy-stone/40 text-alloy-juniper focus:ring-alloy-juniper/30"
                                    />
                                    {label}
                                </label>
                            ))}
                        </fieldset>
                    </div>
                :   null}

                <div className="mt-5 flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={saving}
                        className="rounded-lg border border-alloy-stone/25 px-3 py-1.5 text-[12px] font-medium text-alloy-midnight/80 hover:bg-alloy-stone/10 disabled:opacity-60"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={() => onContinue(payload)}
                        disabled={saving}
                        className="rounded-lg bg-alloy-juniper px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-alloy-juniper/90 disabled:opacity-60"
                    >
                        {saving ? "Continuing…" : "Continue"}
                    </button>
                </div>
            </div>
        </div>
    );
}
