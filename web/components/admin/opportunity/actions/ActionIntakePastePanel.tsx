"use client";

import { Sparkles } from "lucide-react";

type Props = {
    pasteText: string;
    onPasteTextChange: (value: string) => void;
    onParse: () => void;
    parsing?: boolean;
    disabled?: boolean;
    parseSummary?: string | null;
    parseError?: string | null;
    compact?: boolean;
};

const TEXTAREA =
    "w-full resize-y rounded-xl border border-alloy-stone/20 bg-alloy-stone/5 px-3 py-3 text-sm text-alloy-midnight placeholder:text-alloy-midnight/40 focus:border-alloy-blue/45 focus:outline-none focus:ring-2 focus:ring-alloy-blue/15 disabled:opacity-60";

/** Paste-assisted intake panel — BOS assists, operator approves mapped fields. */
export function ActionIntakePastePanel({
    pasteText,
    onPasteTextChange,
    onParse,
    parsing = false,
    disabled = false,
    parseSummary = null,
    parseError = null,
    compact = false,
}: Props) {
    return (
        <section
            className={
                compact ?
                    "space-y-2 rounded-xl border border-alloy-stone/15 bg-white p-3"
                :   "space-y-3 rounded-2xl border border-alloy-blue/15 bg-gradient-to-b from-alloy-blue/[0.04] to-white p-4"
            }
            data-testid="action-intake-paste-panel"
        >
            {!compact ?
                <div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-alloy-midnight">
                        <Sparkles className="h-4 w-4 text-alloy-blue" strokeWidth={2.2} aria-hidden />
                        Paste lead details
                    </div>
                    <p className="mt-1 text-[12px] leading-relaxed text-alloy-midnight/60">
                        Drop an email, call note, or web inquiry. BOS will draft fields for your review —
                        nothing is created until you confirm.
                    </p>
                </div>
            :   <p className="text-[12px] font-medium text-alloy-midnight/70">Paste more details</p>}

            <textarea
                value={pasteText}
                onChange={(e) => onPasteTextChange(e.target.value)}
                disabled={disabled || parsing}
                rows={compact ? 4 : 6}
                placeholder={
                    "Example:\nParent: Jordan Lee\nEmail: jordan@example.com\nPhone: (555) 123-4567\nChild: Riley Lee\nProgram: Toddler Room\nSource: Website inquiry"
                }
                className={TEXTAREA}
                data-testid="action-intake-paste-textarea"
            />

            <div className="flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    disabled={disabled || parsing || !pasteText.trim()}
                    onClick={onParse}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-alloy-blue/30 bg-alloy-blue px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                    data-testid="action-intake-parse-button"
                >
                    <Sparkles className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />
                    {parsing ? "Parsing…" : "Parse with BOS"}
                </button>
                <span className="text-[11px] text-alloy-midnight/50">
                    Maps into fields below for your review
                </span>
            </div>

            {parseSummary ?
                <p
                    className="rounded-lg border border-alloy-pine/20 bg-alloy-pine/5 px-3 py-2 text-[12px] text-alloy-pine"
                    data-testid="action-intake-parse-summary"
                >
                    {parseSummary}
                </p>
            :   null}
            {parseError ?
                <p
                    className="rounded-lg border border-alloy-ember/25 bg-alloy-ember/5 px-3 py-2 text-[12px] text-alloy-ember"
                    role="alert"
                    data-testid="action-intake-parse-error"
                >
                    {parseError}
                </p>
            :   null}
        </section>
    );
}
