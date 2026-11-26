"use client";

/**
 * THE ADVISORY CHIP — one component, so two surfaces cannot drift apart.
 *
 * Records → Staff and the Assignment chooser both ask the same operator question
 * ("is there anything I should know about this person?") and must answer it in
 * the same words. A second chip would eventually disagree about tone or copy, and
 * an operator would learn to trust whichever one they saw last.
 *
 * ── IT IS A STATEMENT, NOT A GATE ──
 *
 * There is no onClick that swallows a selection, no disabled prop it can drive,
 * and no confirmation it can demand. It renders a fact from the canonical
 * projection and gets out of the way. Everything an operator could do before this
 * chip existed, they can still do while it is on screen — that is the V1 product
 * rule, and keeping the chip incapable of interfering is how the rule survives
 * contact with later edits.
 *
 * A READY signal renders NOTHING. A badge that says "fine" on every row teaches
 * operators to stop reading badges, and the one that matters then disappears into
 * the noise.
 */

import type { StaffReadinessSignal } from "@/lib/staffReadiness/staffReadinessSignals";

const TONE_CLASS: Record<StaffReadinessSignal["tone"], string> = {
    ready: "",
    attention: "text-amber-700 dark:text-amber-400",
    expired: "text-rose-700 dark:text-rose-400",
};

export default function StaffReadinessSignalChip({
    signal,
    className = "",
}: {
    signal: StaffReadinessSignal | null | undefined;
    className?: string;
}) {
    // Absent means "not asked for", and a clean bill of health is not the same
    // thing as an unasked question. Both render nothing; neither claims readiness.
    if (!signal || signal.tone === "ready" || !signal.summary) return null;

    return (
        <span
            data-staff-readiness-signal={signal.tone}
            data-staff-readiness-signal-count={signal.concern_count}
            title={signal.summary}
            className={`inline-flex items-center gap-1 text-xs font-medium ${TONE_CLASS[signal.tone]} ${className}`}
        >
            <span aria-hidden="true">⚠</span>
            <span data-staff-readiness-signal-text="true">{signal.summary}</span>
        </span>
    );
}
