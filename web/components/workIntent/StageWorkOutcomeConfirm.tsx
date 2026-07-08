"use client";

type Props = {
    outcomeLabel: string;
    effectLines: string[];
    busy?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
};

/** Confirmation step before applying a configured stage-work outcome. */
export default function StageWorkOutcomeConfirm({
    outcomeLabel,
    effectLines,
    busy = false,
    onConfirm,
    onCancel,
}: Props) {
    return (
        <div className="alloy-os-outcome-confirm" data-testid="stage-work-outcome-confirm">
            <p className="alloy-os-outcome-picker__eyebrow">Confirm result</p>
            <p className="alloy-os-outcome-picker__title">{outcomeLabel}</p>
            {effectLines.length > 0 ?
                <div className="alloy-os-outcome-confirm__effects">
                    <p className="alloy-os-outcome-confirm__effects-title">Will</p>
                    <ul className="alloy-os-outcome-confirm__list">
                        {effectLines.map((line) => (
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
                    {busy ? "Working…" : "Confirm"}
                </button>
            </div>
        </div>
    );
}
