"use client";

import type { ReactNode } from "react";
import Link from "next/link";

export function ConfigRuntimeHero({
    title,
    subtitle,
    children,
    testId,
}: {
    title: string;
    subtitle?: string;
    children?: ReactNode;
    testId?: string;
}) {
    return (
        <header className="config-runtime-hero px-6 py-5" data-testid={testId}>
            <h1 className="text-2xl font-semibold tracking-tight text-alloy-midnight">{title}</h1>
            {subtitle ?
                <p className="mt-2 max-w-3xl text-sm leading-relaxed text-alloy-midnight/65">{subtitle}</p>
            :   null}
            {children}
        </header>
    );
}

export function ConfigRuntimeSectionHeader({ children }: { children: ReactNode }) {
    return <p className="config-runtime-section-header">{children}</p>;
}

export function ConfigRuntimeOperationalCard({
    selected = false,
    children,
    testId,
    className = "",
}: {
    selected?: boolean;
    children: ReactNode;
    testId?: string;
    className?: string;
}) {
    return (
        <article
            className={`config-runtime-operational-card ${selected ? "config-runtime-operational-card--selected" : ""} ${className}`}
            data-testid={testId}
        >
            {children}
        </article>
    );
}

export function ConfigRuntimeIconTile({ children, ariaHidden = true }: { children: ReactNode; ariaHidden?: boolean }) {
    return (
        <div className="config-runtime-icon-tile" aria-hidden={ariaHidden}>
            {children}
        </div>
    );
}

export function ConfigRuntimePrimaryTile({
    href,
    title,
    description,
    icon,
    testId,
}: {
    href: string;
    title: string;
    description: string;
    icon: ReactNode;
    testId?: string;
}) {
    return (
        <Link href={href} className="config-runtime-primary-tile group" data-testid={testId}>
            <div className="flex items-start gap-3">
                <div className="config-runtime-icon-tile">{icon}</div>
                <div className="min-w-0">
                    <p className="text-base font-semibold text-alloy-midnight group-hover:text-alloy-pine">{title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-alloy-midnight/60">{description}</p>
                </div>
            </div>
            <span className="mt-4 inline-flex text-xs font-semibold text-alloy-pine">Open →</span>
        </Link>
    );
}

export function ConfigRuntimeLensRow({
    label,
    children,
    className = "",
}: {
    label: string;
    children: ReactNode;
    className?: string;
}) {
    return (
        <div className={`config-runtime-lens-row ${className}`}>
            <ConfigRuntimeSectionHeader>{label}</ConfigRuntimeSectionHeader>
            <div className="min-w-0">{children}</div>
        </div>
    );
}

export function ConfigRuntimeMutedDetail({ children }: { children: ReactNode }) {
    return <p className="config-runtime-muted">{children}</p>;
}

export function ConfigRuntimeNavCard({
    active,
    title,
    description,
    onClick,
    testId,
}: {
    active: boolean;
    title: string;
    description: string;
    onClick: () => void;
    testId?: string;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`config-runtime-nav-card ${active ? "config-runtime-nav-card--active" : ""}`}
            data-testid={testId}
            aria-current={active ? "page" : undefined}
        >
            <p className={`text-sm font-semibold ${active ? "text-alloy-pine" : "text-alloy-midnight"}`}>{title}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-alloy-midnight/55">{description}</p>
        </button>
    );
}
