"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";

export const PLATFORM_BUILDER_SHELL =
    "rounded-xl border border-alloy-stone/20 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)]";

export const PLATFORM_BUILDER_LABEL = "text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/55";

export const PLATFORM_BUILDER_INPUT =
    "mt-1 w-full rounded-lg border border-alloy-stone/35 bg-white px-3 py-2 text-sm text-alloy-midnight shadow-[inset_0_1px_2px_rgba(15,23,42,0.04)] transition-colors hover:border-alloy-stone/50 focus:border-alloy-juniper focus:outline-none focus:ring-2 focus:ring-alloy-juniper/20 disabled:cursor-not-allowed disabled:bg-alloy-stone/8 disabled:text-alloy-midnight/45";

export const PLATFORM_BUILDER_SELECT = PLATFORM_BUILDER_INPUT;

export const PLATFORM_BUILDER_TEXTAREA = `${PLATFORM_BUILDER_INPUT} min-h-[88px] resize-y`;

export const PLATFORM_BUILDER_BTN =
    "inline-flex items-center justify-center gap-1.5 rounded-lg border border-alloy-stone/30 bg-white px-3 py-1.5 text-xs font-semibold text-alloy-midnight shadow-sm transition-all hover:border-alloy-stone/45 hover:bg-alloy-stone/8 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50";

export const PLATFORM_BUILDER_BTN_PRIMARY =
    "inline-flex items-center justify-center gap-1.5 rounded-lg border border-alloy-juniper/35 bg-alloy-juniper px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-alloy-juniper/90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50";

export const PLATFORM_BUILDER_BTN_DANGER =
    "inline-flex items-center justify-center gap-1.5 rounded-lg border border-alloy-ember/30 bg-alloy-ember/10 px-3 py-1.5 text-xs font-semibold text-alloy-ember transition-all hover:bg-alloy-ember/15 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50";

export function PlatformBuilderField({
    label,
    children,
    hint,
}: {
    label: string;
    children: ReactNode;
    hint?: string;
}) {
    return (
        <label className="block">
            <span className={PLATFORM_BUILDER_LABEL}>{label}</span>
            {children}
            {hint ?
                <p className="mt-1 text-[11px] leading-snug text-alloy-midnight/50">{hint}</p>
            :   null}
        </label>
    );
}

export function PlatformBuilderSection({
    title,
    children,
    hint,
    compact = false,
}: {
    title: string;
    children: ReactNode;
    hint?: string;
    compact?: boolean;
}) {
    return (
        <section className={`rounded-lg border border-alloy-stone/15 bg-alloy-stone/[0.03] ${compact ? "space-y-2 p-2.5" : "space-y-3 p-3"}`}>
            <div>
                <h4 className={`font-semibold text-alloy-midnight ${compact ? "text-xs" : "text-sm"}`}>{title}</h4>
                {hint ?
                    <p className={`text-alloy-midnight/50 ${compact ? "mt-0.5 text-[11px] leading-snug" : "mt-0.5 text-xs"}`}>{hint}</p>
                :   null}
            </div>
            <div className={`grid sm:grid-cols-2 ${compact ? "gap-2" : "gap-3"}`}>{children}</div>
        </section>
    );
}

export function PlatformBuilderModal({
    open,
    title,
    subtitle,
    onClose,
    children,
    footer,
}: {
    open: boolean;
    title: string;
    subtitle?: string;
    onClose: () => void;
    children: ReactNode;
    footer?: ReactNode;
}) {
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-[120] flex items-center justify-center bg-alloy-midnight/40 px-4 py-8"
            role="dialog"
            aria-modal="true"
            aria-label={title}
            onClick={onClose}
        >
            <div
                className="max-h-[min(88vh,820px)] w-full max-w-2xl overflow-hidden rounded-xl border border-alloy-stone/20 bg-white shadow-xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="border-b border-alloy-stone/15 px-5 py-4">
                    <h3 className="text-base font-semibold text-alloy-midnight">{title}</h3>
                    {subtitle ?
                        <p className="mt-1 text-sm text-alloy-midnight/55">{subtitle}</p>
                    :   null}
                </div>
                <div className="max-h-[calc(min(88vh,820px)-8rem)] overflow-y-auto px-5 py-4">{children}</div>
                {footer ?
                    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-alloy-stone/15 bg-alloy-stone/[0.03] px-5 py-3">
                        {footer}
                    </div>
                :   null}
            </div>
        </div>
    );
}

export function PlatformBuilderButton({
    variant = "default",
    loading = false,
    loadingLabel,
    children,
    className = "",
    ...props
}: {
    variant?: "default" | "primary" | "danger";
    loading?: boolean;
    loadingLabel?: string;
    children: ReactNode;
    className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
    const base =
        variant === "primary" ? PLATFORM_BUILDER_BTN_PRIMARY
        : variant === "danger" ? PLATFORM_BUILDER_BTN_DANGER
        : PLATFORM_BUILDER_BTN;
    return (
        <button type="button" className={`${base} ${className}`} disabled={loading || props.disabled} {...props}>
            {loading ?
                <>
                    <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-r-transparent" />
                    {loadingLabel ?? "Working…"}
                </>
            :   children}
        </button>
    );
}

export function PlatformBuilderListPanel({
    title,
    hint,
    emptyTitle,
    emptyHint,
    loading,
    itemCount,
    children,
}: {
    title: string;
    hint: string;
    emptyTitle: string;
    emptyHint: string;
    loading?: boolean;
    itemCount: number;
    children: ReactNode;
}) {
    return (
        <div className="rounded-lg border border-alloy-stone/20 bg-alloy-stone/[0.02] p-2">
            <div className="mb-2 px-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/55">{title}</p>
                <p className="text-[11px] text-alloy-midnight/45">{hint}</p>
            </div>
            {loading ?
                <p className="p-2 text-sm text-alloy-midnight/45">Loading…</p>
            : itemCount === 0 ?
                <div className="rounded-lg border border-dashed border-alloy-stone/25 px-3 py-4 text-center">
                    <p className="text-sm font-medium text-alloy-midnight/70">{emptyTitle}</p>
                    <p className="mt-1 text-xs text-alloy-midnight/45">{emptyHint}</p>
                </div>
            :   <ul className="max-h-[480px] space-y-1 overflow-y-auto">{children}</ul>}
        </div>
    );
}

export function PlatformBuilderListItem({
    selected,
    onClick,
    title,
    meta,
    badges,
}: {
    selected: boolean;
    onClick: () => void;
    title: string;
    meta?: string;
    badges?: ReactNode;
}) {
    return (
        <li>
            <button
                type="button"
                onClick={onClick}
                className={`w-full rounded-lg border px-2.5 py-2 text-left transition-colors ${
                    selected
                        ? "border-alloy-juniper/35 bg-alloy-juniper/10 shadow-sm"
                        : "border-transparent hover:border-alloy-stone/25 hover:bg-white"
                }`}
            >
                <span className={`block text-sm ${selected ? "font-semibold text-alloy-midnight" : "text-alloy-midnight/85"}`}>
                    {title}
                </span>
                {meta ?
                    <span className="mt-0.5 block text-[10px] text-alloy-midnight/45">{meta}</span>
                :   null}
                {badges ?
                    <div className="mt-1.5 flex flex-wrap gap-1">{badges}</div>
                :   null}
            </button>
        </li>
    );
}

export function PlatformBuilderStatusBadge({
    label,
    tone = "neutral",
}: {
    label: string;
    tone?: "neutral" | "success" | "warning" | "muted" | "template";
}) {
    const cls =
        tone === "success" ? "bg-alloy-juniper/12 text-alloy-juniper"
        : tone === "warning" ? "bg-amber-500/12 text-amber-800"
        : tone === "template" ? "bg-alloy-pine/10 text-alloy-pine"
        : tone === "muted" ? "bg-alloy-stone/15 text-alloy-midnight/45"
        : "bg-alloy-stone/12 text-alloy-midnight/55";
    return <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls}`}>{label}</span>;
}

export function PlatformBuilderEmptyState({
    title,
    body,
    action,
}: {
    title: string;
    body: string;
    action?: ReactNode;
}) {
    return (
        <div className="flex min-h-[240px] flex-col items-center justify-center rounded-xl border border-dashed border-alloy-stone/25 bg-alloy-stone/[0.02] px-6 py-10 text-center">
            <p className="text-sm font-semibold text-alloy-midnight">{title}</p>
            <p className="mt-2 max-w-md text-sm text-alloy-midnight/55">{body}</p>
            {action ?
                <div className="mt-4">{action}</div>
            :   null}
        </div>
    );
}

export function PlatformBuilderCallout({ tone = "info", children }: { tone?: "info" | "success" | "warning"; children: ReactNode }) {
    const cls =
        tone === "success" ? "border-alloy-juniper/25 bg-alloy-juniper/8 text-alloy-juniper"
        : tone === "warning" ? "border-amber-500/25 bg-amber-500/8 text-amber-900"
        : "border-alloy-pine/20 bg-alloy-pine/5 text-alloy-midnight/70";
    return <div className={`rounded-lg border px-3 py-2 text-xs leading-relaxed ${cls}`}>{children}</div>;
}
