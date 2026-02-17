"use client";

/** Minimal Alloy wordmark + mark for admin sidebar/header. No asset required. */
export default function AlloyLogo({ compact = false }: { compact?: boolean }) {
    return (
        <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#31394d] text-[#DBC078] font-bold text-sm">
                A
            </div>
            {!compact && <span className="font-semibold text-[#31394d] tracking-tight">Alloy</span>}
        </div>
    );
}
