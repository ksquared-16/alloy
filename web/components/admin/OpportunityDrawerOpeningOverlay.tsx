"use client";

/** External first-paint gate — drawer modal does not mount until bootstrap + primary are ready. */
export default function OpportunityDrawerOpeningOverlay(props: {
    onCancel: () => void;
    errorMessage?: string | null;
}) {
    const { onCancel, errorMessage } = props;

    return (
        <div
            className="fixed inset-0 z-[55] flex items-center justify-center bg-alloy-midnight/20 px-4"
            role="status"
            aria-live="polite"
            aria-busy={errorMessage ? undefined : true}
            data-opportunity-drawer-opening-overlay="true"
        >
            <div className="flex max-w-sm flex-col items-center gap-3 rounded-xl border border-alloy-stone/20 bg-white px-5 py-4 shadow-lg">
                {errorMessage ? (
                    <>
                        <p className="text-center text-sm font-medium text-alloy-ember">{errorMessage}</p>
                        <button
                            type="button"
                            onClick={onCancel}
                            className="rounded-md border border-alloy-stone/30 px-3 py-1.5 text-xs font-semibold text-alloy-midnight/80 hover:bg-alloy-stone/10"
                        >
                            Dismiss
                        </button>
                    </>
                ) : (
                    <>
                        <div
                            className="h-5 w-5 animate-spin rounded-full border-2 border-alloy-stone/25 border-t-alloy-pine"
                            aria-hidden
                        />
                        <p className="text-center text-sm font-medium text-alloy-midnight/85">Opening record…</p>
                    </>
                )}
            </div>
        </div>
    );
}
