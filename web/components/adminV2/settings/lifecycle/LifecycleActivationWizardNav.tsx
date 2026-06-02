"use client";

export default function LifecycleActivationWizardNav({
    showBack,
    onBack,
    confirmLabel,
    onConfirm,
    confirmDisabled,
    confirmTestId,
    busy,
}: {
    showBack?: boolean;
    onBack?: () => void;
    confirmLabel: string;
    onConfirm: () => void;
    confirmDisabled?: boolean;
    confirmTestId: string;
    busy?: boolean;
}) {
    return (
        <div className="mt-3 flex flex-wrap gap-2" data-testid="lifecycle-activation-wizard-nav">
            {showBack && onBack ? (
                <button
                    type="button"
                    className="rounded-md border border-alloy-forge/20 bg-white px-3 py-1.5 text-xs font-medium text-alloy-midnight/80 hover:bg-alloy-stone/10"
                    onClick={onBack}
                    data-testid="lifecycle-activation-back"
                >
                    Back
                </button>
            ) : null}
            <button
                type="button"
                className="rounded-md bg-alloy-pine px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                disabled={confirmDisabled || busy}
                onClick={onConfirm}
                data-testid={confirmTestId}
            >
                {busy ? "Saving…" : confirmLabel}
            </button>
        </div>
    );
}
