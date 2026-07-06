"use client";

import type { QueueRowVariant } from "@/lib/layout/queueRecordLayoutV3";
import {
    subjectFocusFromUi,
    subjectFocusToUi,
    type QueueRowSubjectFocusUi,
} from "@/lib/adminV2/settings/surfaces/queueRowSubjectFocus";
import QueueRowVariantStagePicker, {
    type ProcessStageOption,
} from "@/components/adminV2/settings/surfaces/QueueRowVariantStagePicker";

export type QueueRowVariantInspectorProps = {
    variant: QueueRowVariant;
    processStages: readonly ProcessStageOption[];
    stagesLoading?: boolean;
    onPatch: (patch: Partial<QueueRowVariant>) => void;
    onClose?: () => void;
};

export default function QueueRowVariantInspector({
    variant,
    processStages,
    stagesLoading = false,
    onPatch,
    onClose,
}: QueueRowVariantInspectorProps) {
    const stageKeys = variant.appliesWhen?.stage_key ?? [];
    const subjectUi = subjectFocusToUi(variant.subjectFocus);

    return (
        <section className="rounded-xl border border-alloy-stone/14 bg-white p-4 shadow-sm" data-testid="queue-row-variant-inspector">
            <header className="mb-3 flex items-start justify-between gap-2">
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-alloy-midnight/40">Applies when</p>
                    <p className="text-sm font-semibold text-alloy-midnight">{variant.label || "Untitled variant"}</p>
                    <p className="mt-1 text-[11px] text-alloy-midnight/50">Use this variant for selected stages.</p>
                </div>
                {onClose ? (
                    <button type="button" onClick={onClose} className="rounded p-1 text-alloy-midnight/35 hover:bg-alloy-stone/10" aria-label="Close variant inspector">✕</button>
                ) : null}
            </header>
            <div className="flex flex-col gap-3">
                <label className="flex flex-col gap-1">
                    <span className="text-[12px] font-medium text-alloy-midnight/75">Variant name</span>
                    <input type="text" value={variant.label} onChange={(e) => onPatch({ label: e.target.value })} className="rounded-md border border-alloy-stone/20 px-2.5 py-1.5 text-sm" data-testid="queue-row-variant-name" />
                </label>
                <div className="flex flex-col gap-1">
                    <span className="text-[12px] font-medium text-alloy-midnight/75">Match stages</span>
                    <QueueRowVariantStagePicker
                        stages={processStages}
                        loading={stagesLoading}
                        selectedStageKeys={stageKeys}
                        onChange={(keys) => onPatch({ appliesWhen: { ...variant.appliesWhen, stage_key: keys } })}
                    />
                </div>
                <label className="flex flex-col gap-1">
                    <span className="text-[12px] font-medium text-alloy-midnight/75">Row focus</span>
                    <p className="text-[11px] text-alloy-midnight/50">
                        Prioritizes library suggestions. Does not control which slot fields appear in.
                    </p>
                    <select value={subjectUi} onChange={(e) => onPatch({ subjectFocus: subjectFocusFromUi(e.target.value as QueueRowSubjectFocusUi, stageKeys) })} className="rounded-md border border-alloy-stone/20 px-2.5 py-1.5 text-sm" data-testid="queue-row-variant-row-focus">
                        <option value="family">Family</option>
                        <option value="child">Child</option>
                    </select>
                </label>
                <label className="flex flex-col gap-1">
                    <span className="text-[12px] font-medium text-alloy-midnight/75">Priority (lower wins first)</span>
                    <input type="number" value={variant.priority} onChange={(e) => onPatch({ priority: Number.parseInt(e.target.value, 10) || 0 })} className="rounded-md border border-alloy-stone/20 px-2.5 py-1.5 text-sm" />
                </label>
            </div>
        </section>
    );
}
