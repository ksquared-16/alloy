"use client";

import { BosExecutionLoader } from "@/components/admin/actions/BosExecutionLoader";

const PHASES = ["Creating form", "Applying mappings", "Building layout", "Opening editor"] as const;

export default function ProcessingNativeFormCreatingState({
    phaseIndex = 0,
    error = null,
    onRetry,
}: {
    phaseIndex?: number;
    error?: string | null;
    onRetry?: () => void;
}) {
    const safePhase = Math.min(Math.max(phaseIndex, 0), PHASES.length - 1);

    return (
        <div
            className="flex min-h-0 flex-1 flex-col items-center justify-center bg-white px-6 py-10"
            data-testid="processing-native-form-creating-state"
            aria-busy={!error}
            aria-live="polite"
        >
            {error ? (
                <div className="max-w-md text-center">
                    <p className="text-[14px] font-semibold text-alloy-midnight">Couldn&apos;t create your native form</p>
                    <p className="mt-2 text-[12px] text-alloy-midnight/60">{error}</p>
                    {onRetry ? (
                        <button type="button" onClick={onRetry} className="mt-4 rounded-lg bg-alloy-bend-pine px-4 py-2 text-[12px] font-semibold text-white">
                            Try again
                        </button>
                    ) : null}
                </div>
            ) : (
                <div className="w-full max-w-lg">
                    <BosExecutionLoader
                        variant="panel"
                        title="Creating your native form"
                        subtitle="Applying reviewed questions, mappings, and layout…"
                    />
                    <ol className="mx-auto mt-6 flex max-w-md flex-wrap justify-center gap-2">
                        {PHASES.map((label, idx) => (
                            <li
                                key={label}
                                className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                                    idx <= safePhase
                                        ? "bg-alloy-bend-pine/10 text-alloy-bend-pine"
                                        : "bg-alloy-stone/10 text-alloy-midnight/40"
                                }`}
                            >
                                {label}
                            </li>
                        ))}
                    </ol>
                </div>
            )}
        </div>
    );
}
