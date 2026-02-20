"use client";

/** Alloy brandmark for admin sidebar/header. Clickable parent (Link) is in AdminLayout. */
export default function AlloyLogo({ compact = false }: { compact?: boolean }) {
    const size = 28;
    return (
        <div className="flex items-center gap-2">
            <img
                src="/brand/alloy-brandmark-gradient.svg"
                alt="Alloy"
                width={size}
                height={size}
                className="shrink-0"
            />
            {!compact && <span className="font-semibold text-[#31394d] tracking-tight">Alloy</span>}
        </div>
    );
}
