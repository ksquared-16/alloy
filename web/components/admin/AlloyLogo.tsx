"use client";

/** Alloy brandmark for admin. Use variant="white" on Alloy Blue top bar; variant="default" on light backgrounds. */
export default function AlloyLogo({ compact = false, variant = "default" }: { compact?: boolean; variant?: "default" | "light" | "white" }) {
    const size = 28;
    const isLight = variant === "light" || variant === "white";
    const textClass = isLight ? "font-semibold text-white tracking-tight" : "font-semibold text-[#31394d] tracking-tight";
    const logoSrc = variant === "white" ? "/brand/alloy-brandmark-white.svg" : variant === "light" ? "/brand/alloy-brandmark-blue.svg" : "/brand/alloy-brandmark-gradient.svg";
    return (
        <div className="flex items-center gap-2">
            <img
                src={logoSrc}
                alt="Alloy"
                width={size}
                height={size}
                className="shrink-0"
            />
            {!compact && <span className={textClass}>Alloy</span>}
        </div>
    );
}
