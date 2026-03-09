"use client";

/** Alloy brandmark for admin sidebar/header. Clickable parent (Link) is in AdminLayout. Use variant="light" on dark shells (Bend Pine). */
export default function AlloyLogo({ compact = false, variant = "default" }: { compact?: boolean; variant?: "default" | "light" }) {
    const size = 28;
    const textClass = variant === "light" ? "font-semibold text-white tracking-tight" : "font-semibold text-[#31394d] tracking-tight";
    return (
        <div className="flex items-center gap-2">
            <img
                src={variant === "light" ? "/brand/alloy-brandmark-blue.svg" : "/brand/alloy-brandmark-gradient.svg"}
                alt="Alloy"
                width={size}
                height={size}
                className="shrink-0"
            />
            {!compact && <span className={textClass}>Alloy</span>}
        </div>
    );
}
