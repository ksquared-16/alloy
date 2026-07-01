"use client";

type Props = {
    outcomeLabel: string;
    effectLines: string[];
    busy?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
};

/** BOS-aligned confirmation step before applying a stage-work outcome. */
export default function StageWorkOutcomeConfirm({
    outcomeLabel,
    effectLines,
    busy = false,
    onConfirm,
    onCancel,
}: Props) {
    return (
        <div className="space-y-3" data-testid="stage-work-outcome-confirm">
            <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                    Result preview
                </p>
                <p className="mt-1 text-[15px] font-semibold text-alloy-midnight">{outcomeLabel}</p>
            </div>
            {effectLines.length > 0 ?
                <div>
                    <p className="text-[11px] font-medium text-alloy-midnight/60">Will:</p>
                    <ul className="mt-1.5 space-y-1">
                        {effectLines.map((line) => (
                            <li key={line} className="flex gap-2 text-[12px] text-alloy-midnight/75">
                                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-alloy-pine/70" aria-hidden />
                                <span>{line}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            :   null}
            <p className="text-[11px] text-alloy-midnight/50">Confirm?</p>
            <div className="flex flex-wrap gap-2">
                <button
                    type="button"
                    disabled={busy}
                    className="rounded-lg border border-alloy-pine/30 bg-alloy-pine px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-alloy-pine/90 disabled:opacity-50"
                    data-testid="stage-work-outcome-confirm-submit"
                    onClick={onConfirm}
                >
                    Confirm
                </button>
                <button
                    type="button"
                    disabled={busy}
                    className="rounded-lg border border-alloy-stone/25 bg-white px-3 py-1.5 text-[12px] font-medium text-alloy-midnight/70 hover:bg-alloy-stone/10 disabled:opacity-50"
                    data-testid="stage-work-outcome-confirm-cancel"
                    onClick={onCancel}
                >
                    Cancel
                </button>
            </div>
        </div>
    );
}
