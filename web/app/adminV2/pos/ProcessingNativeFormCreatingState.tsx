"use client";

import { useEffect, useState } from "react";

import { AlloyIdentityLoader } from "@/app/adminV2/components/bos/identity/AlloyIdentityLoader";

const CREATE_PHASES = ["Creating form", "Applying mappings", "Building layout", "Opening editor"] as const;

function formatElapsed(totalSeconds: number): string {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/**
 * Centered, stacked loading state for the two long Processing operations:
 *  - `detecting` — the initial OCR / question-detection pass (a single long server
 *    call with no progress events). We show an honest elapsed timer + a moving
 *    indeterminate bar so a large document never looks frozen.
 *  - `creating`  — the stepped save → create → open flow, which has real phases,
 *    so we show a determinate percentage + step checklist.
 */
export default function ProcessingNativeFormCreatingState({
    mode = "creating",
    phaseIndex = 0,
    error = null,
    onRetry,
}: {
    mode?: "detecting" | "creating";
    phaseIndex?: number;
    error?: string | null;
    onRetry?: () => void;
}) {
    const detecting = mode === "detecting";
    const safePhase = Math.min(Math.max(phaseIndex, 0), CREATE_PHASES.length - 1);
    const percent = Math.round(((safePhase + 1) / CREATE_PHASES.length) * 100);

    // The detect pass has no server progress; an elapsed counter keeps it honest.
    const [elapsed, setElapsed] = useState(0);
    useEffect(() => {
        if (error) return;
        setElapsed(0);
        const timer = window.setInterval(() => setElapsed((s) => s + 1), 1000);
        return () => window.clearInterval(timer);
    }, [error, mode]);

    const title = detecting ? "Reading your document" : "Creating your native form";
    const subtitle = detecting
        ? "Detecting questions, fields, and layout — large documents can take a minute or two."
        : "Applying your reviewed questions, mappings, and layout.";

    return (
        <div
            className="flex min-h-0 flex-1 flex-col items-center justify-center bg-white px-6 py-8"
            data-testid="processing-native-form-creating-state"
            aria-busy={!error}
            aria-live="polite"
        >
            {error ? (
                <div className="max-w-sm text-center">
                    <p className="text-[14px] font-semibold text-alloy-midnight">
                        Couldn&apos;t {detecting ? "read your document" : "create your native form"}
                    </p>
                    <p className="mt-2 text-[12px] text-alloy-midnight/60">{error}</p>
                    {onRetry ? (
                        <button
                            type="button"
                            onClick={onRetry}
                            className="mt-4 rounded-lg bg-alloy-bend-pine px-4 py-2 text-[12px] font-semibold text-white"
                        >
                            Try again
                        </button>
                    ) : null}
                </div>
            ) : (
                <div className="flex w-full max-w-sm flex-col items-center text-center">
                    <AlloyIdentityLoader markSize="md" showMessage={false} />

                    <p className="mt-3 text-[15px] font-semibold text-alloy-midnight">{title}</p>
                    <p className="mt-1 text-[12px] leading-snug text-alloy-midnight/55">{subtitle}</p>

                    <div className="mt-5 w-full">
                        <div className="flex items-center justify-between text-[10px] font-medium text-alloy-midnight/50">
                            <span>{detecting ? "Working…" : CREATE_PHASES[safePhase]}</span>
                            <span className="tabular-nums" data-testid="processing-native-form-progress">
                                {detecting ? formatElapsed(elapsed) : `${percent}%`}
                            </span>
                        </div>
                        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-alloy-stone/15">
                            {detecting ? (
                                <div
                                    className="h-full w-1/3 rounded-full bg-alloy-bend-pine"
                                    style={{ animation: "processing-indeterminate 1.4s ease-in-out infinite" }}
                                />
                            ) : (
                                <div
                                    className="h-full rounded-full bg-alloy-bend-pine transition-all duration-500 ease-out"
                                    style={{ width: `${percent}%` }}
                                />
                            )}
                        </div>
                    </div>

                    {detecting ? null : (
                        <ol className="mt-4 flex flex-wrap justify-center gap-1.5">
                            {CREATE_PHASES.map((label, idx) => (
                                <li
                                    key={label}
                                    className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                                        idx < safePhase
                                            ? "bg-alloy-bend-pine/10 text-alloy-bend-pine"
                                            : idx === safePhase
                                              ? "bg-alloy-bend-pine/15 text-alloy-bend-pine"
                                              : "bg-alloy-stone/10 text-alloy-midnight/40"
                                    }`}
                                >
                                    {idx < safePhase ? "✓ " : ""}
                                    {label}
                                </li>
                            ))}
                        </ol>
                    )}
                </div>
            )}
        </div>
    );
}
