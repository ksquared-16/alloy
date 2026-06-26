"use client";

/**
 * Canonical Work / Studio (or any small mode set) selector, shared across operator
 * product areas so Processing and Communications read as siblings. Visual matches the
 * Focus Panel mode switch: individual bordered pills, Bend Pine active border + inset
 * underline.
 *
 * Generic over the mode key so each surface keeps its own vocabulary; this component
 * owns only the interaction + look.
 */

export interface AlloyModeOption<K extends string> {
    key: K;
    label: string;
}

export default function AlloyModeSwitch<K extends string>({
    modes,
    active,
    onChange,
    ariaLabel = "Mode",
    fill = false,
    className = "",
}: {
    modes: ReadonlyArray<AlloyModeOption<K>>;
    active: K;
    onChange: (key: K) => void;
    ariaLabel?: string;
    /** Stretch pills to fill the container width (narrow rails). */
    fill?: boolean;
    className?: string;
}) {
    return (
        <div role="tablist" aria-label={ariaLabel} className={`flex gap-1 ${className}`} data-alloy-mode-switch="true">
            {modes.map((m) => {
                const isActive = m.key === active;
                return (
                    <button
                        key={m.key}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        data-alloy-mode={m.key}
                        onClick={() => {
                            if (!isActive) onChange(m.key);
                        }}
                        className={`${fill ? "flex-1" : ""} rounded-md border px-3 py-1 text-[11px] font-semibold transition-colors ${
                            isActive
                                ? "border-alloy-juniper bg-white text-alloy-juniper shadow-[inset_0_-2px_0_#00A283]"
                                : "border-alloy-stone/25 bg-white text-alloy-midnight/70 hover:border-alloy-juniper/45 hover:text-alloy-midnight"
                        }`}
                    >
                        {m.label}
                    </button>
                );
            })}
        </div>
    );
}
