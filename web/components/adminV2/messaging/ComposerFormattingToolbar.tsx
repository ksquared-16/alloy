"use client";

type ComposerFormattingToolbarProps = {
    compact?: boolean;
    className?: string;
};

/** Sprint B formatting placeholders — toolbar row only. */
export default function ComposerFormattingToolbar({ compact = false, className = "" }: ComposerFormattingToolbarProps) {
    const btnClass = compact
        ? "rounded border border-alloy-stone/16 bg-white px-1.5 py-0.5 text-[9px] font-semibold text-alloy-midnight/45"
        : "rounded-md border border-alloy-stone/16 bg-white px-2 py-1 text-[10px] font-semibold text-alloy-midnight/45";

    return (
        <div className={`flex flex-wrap items-center gap-1 ${className}`} aria-label="Formatting (coming in Sprint B)">
            <button type="button" disabled title="Bold — coming soon" className={`${btnClass} cursor-not-allowed opacity-60`}>
                Bold
            </button>
            <button type="button" disabled title="Italic — coming soon" className={`${btnClass} cursor-not-allowed opacity-60`}>
                Italic
            </button>
            <button type="button" disabled title="Insert link — coming soon" className={`${btnClass} cursor-not-allowed opacity-60`}>
                Link
            </button>
            <button type="button" disabled title="Insert image — coming soon" className={`${btnClass} cursor-not-allowed opacity-60`}>
                Image
            </button>
        </div>
    );
}
