"use client";

import { AlloyCanonicalLoadingSurface } from "@/lib/adminV2/runtime/alloyCanonicalLoadingSurface";

/** Canonical BOS loading gate — drawer modal does not mount until VM + body are ready. */
export default function OpportunityDrawerOpeningOverlay(props: {
    onCancel: () => void;
    errorMessage?: string | null;
    recordLabel?: string;
}) {
    const { onCancel, errorMessage, recordLabel = "record" } = props;

    return (
        <div
            className="adminv2-drawer-workspace-loading-overlay adminv2-drawer-shell-inset fixed z-[55] flex items-center justify-center px-4"
            style={{
                left: "var(--adminv2-drawer-backdrop-left, 0px)",
                right: "calc(100vw - var(--adminv2-drawer-backdrop-right, var(--adminv2-drawer-available-right, 100vw)))",
            }}
            role="status"
            aria-live="polite"
            aria-busy={errorMessage ? undefined : true}
            data-opportunity-drawer-opening-overlay="true"
        >
            <div className="flex max-w-sm flex-col items-center gap-3 rounded-xl border border-alloy-stone/20 bg-white px-5 py-4 shadow-lg">
                {errorMessage ?
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
                :   <AlloyCanonicalLoadingSurface
                        message={`Preparing ${recordLabel}…`}
                        data-testid="opportunity-drawer-opening-loader"
                    />
                }
            </div>
        </div>
    );
}
