"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

import { BOS_DEFAULT_BUTTON_LABEL } from "@/lib/bos/bosIdentityTokens";

import { BosMark } from "@/app/adminV2/components/bos/identity/BosMark";

type Props = {
    variant?: "primary" | "secondary";
    size?: "sm" | "md";
    label?: string;
    leadingIcon?: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>;

/**
 * Work with BOS — primary entry CTA. Secondary variant shows mark + horizon lockup.
 */
export function BosButton({
    variant = "primary",
    size = "md",
    label = BOS_DEFAULT_BUTTON_LABEL,
    leadingIcon,
    className = "",
    type = "button",
    ...buttonProps
}: Props) {
    const sizeClass =
        size === "sm" ? "gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px]"
        : "gap-2 rounded-xl px-4 py-2 text-sm";

    const variantClass =
        variant === "primary" ?
            "bg-alloy-juniper font-semibold text-white shadow-[0_1px_0_rgba(255,255,255,0.12)_inset,0_3px_10px_rgba(0,162,131,0.22)] hover:bg-[#009676]"
        :   "border border-alloy-juniper/25 bg-white font-semibold text-[#007A63] hover:bg-[#00A283]/[0.06]";

    const markSize = size === "sm" ? "sm" : "md";
    const defaultIcon =
        variant === "secondary" ?
            <BosMark size={markSize} horizon />
        :   <BosMark size={markSize} color="#ffffff" />;

    return (
        <button
            type={type}
            className={`inline-flex items-center ${sizeClass} ${variantClass} transition-colors disabled:opacity-50 ${className}`.trim()}
            data-bos-button={variant}
            data-testid="bos-button"
            {...buttonProps}
        >
            {leadingIcon ?? defaultIcon}
            {label}
        </button>
    );
}
