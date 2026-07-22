import type { ConfigOwner } from "@/lib/configRuntime/scope";

type Props = {
    owner: ConfigOwner;
    className?: string;
};

/**
 * Configuration Runtime — displays whether a config value is org-managed or location-managed.
 * Used on configuration cards and grid cells to communicate inheritance.
 */
export default function OwnershipBadge({ owner, className = "" }: Props) {
    if (owner === "org") {
        return (
            <span
                className={`inline-flex items-center gap-1 rounded-full border border-alloy-midnight/12 bg-alloy-stone/20 px-2 py-0.5 text-[10px] font-medium text-alloy-midnight/50 ${className}`}
            >
                <span className="h-1.5 w-1.5 rounded-full bg-alloy-midnight/30" />
                Organization default
            </span>
        );
    }
    return (
        <span
            className={`inline-flex items-center gap-1 rounded-full border border-alloy-pine/20 bg-alloy-pine/8 px-2 py-0.5 text-[10px] font-medium text-alloy-pine/70 ${className}`}
        >
            <span className="h-1.5 w-1.5 rounded-full bg-alloy-pine/60" />
            Location override
        </span>
    );
}
