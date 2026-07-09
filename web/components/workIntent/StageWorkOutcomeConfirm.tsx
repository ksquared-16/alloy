"use client";

type Props = {
    outcomeLabel: string;
    effectLines: string[];
    workTitle?: string | null;
    busy?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
};

/** Confirmation step before applying a configured stage-work outcome. */
export default function StageWorkOutcomeConfirm({
    outcomeLabel,
    effectLines,
    workTitle,
    busy = false,
    onConfirm,
    onCancel,
}: Props) {
    const uniqueEffects = [...new Set(effectLines.map((line) => line.trim()).filter(Boolean))];

    return (
        <div className="alloy-os-outcome-confirm" data-testid="stage-work-outcome-confirm">
            <p className="alloy-os-outcome-picker__eyebrow">Review outcome</p>
            {workTitle ?
                <p className="alloy-os-outcome-picker__hint">{workTitle}</p>
            :   null}
            <p className="alloy-os-outcome-picker__title">{outcomeLabel}</p>
            {uniqueEffects.length > 0 ?
                <div className="alloy-os-outcome-confirm__effects">
                    <p className="alloy-os-outcome-confirm__effects-title">What changes</p>
                    <ul className="alloy-os-outcome-confirm__list">
                        {uniqueEffects.map((line) => (
                            <li key={line}>{line}</li>
                        ))}
                    </ul>
                </div>
            :   null}
            <div className="alloy-os-card-nav" data-outcome-confirm-actions>
                <button
                    type="button"
                    disabled={busy}
                    className="alloy-os-ucard__action alloy-os-ucard__action--system5"
                    data-testid="stage-work-outcome-confirm-cancel"
                    onClick={onCancel}
                >
                    ← Back
                </button>
                <button
                    type="button"
                    disabled={busy}
                    className="alloy-os-ucard__action alloy-os-ucard__action--system5 alloy-os-ucard__action--cta"
                    data-testid="stage-work-outcome-confirm-submit"
                    onClick={onConfirm}
                >
                    {busy ? "Applying outcome…" : "Record outcome"}
                </button>
            </div>
        </div>
    );
}
