"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import {
    QUEUE_ROW_CARD_IDLE_BORDER_CLASS,
    QUEUE_ROW_CARD_SELECTED_BORDER_CLASS,
    QUEUE_ROW_CARD_SHELL_CLASS,
    QUEUE_ROW_SELECTED_RAIL_CLASS,
} from "@/lib/presentation/runtime/queueRowCardShell";

/** Frozen Configuration Runtime V1 shell geometry — see docs/system/configuration-runtime-v1.md */
export const CONFIGURATION_SHELL_SECTION_QUEUE_WIDTH_PX = 260;
export const CONFIGURATION_SHELL_OBJECT_QUEUE_WIDTH_PX = 320;

/** Context bar — title, subtitle, and actions above the configuration shell. */
export function ConfigurationContext({
    eyebrow,
    title,
    subtitle,
    titleIcon,
    actions,
    testId = "configuration-context",
    children,
}: {
    eyebrow?: string;
    title: string;
    subtitle?: string;
    /** Optional product icon beside the page title (e.g. Locations MapPin). */
    titleIcon?: ReactNode;
    actions?: ReactNode;
    testId?: string;
    children?: ReactNode;
}) {
    return (
        <header className="process-config-context-bar space-y-2" data-testid={testId}>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    {eyebrow ?
                        <p className="config-platform-hub-eyebrow" data-testid={`${testId}-eyebrow`}>
                            {eyebrow}
                        </p>
                    :   null}
                    <div className="flex items-center gap-2">
                        {titleIcon ?
                            <span
                                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-alloy-bend-pine/[0.10] text-[#007d68]"
                                data-testid={`${testId}-title-icon`}
                                aria-hidden
                            >
                                {titleIcon}
                            </span>
                        :   null}
                        <h1 className="config-typo-page-title process-config-context-title">{title}</h1>
                    </div>
                    {subtitle ?
                        <p className="config-typo-sublabel process-config-context-summary mt-1 max-w-3xl">{subtitle}</p>
                    :   null}
                </div>
                {actions ?
                    <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
                :   null}
            </div>
            {children}
        </header>
    );
}

/** Three-column shell: optional section nav · queue/list · workspace. */
export function ConfigurationShell({
    navColumn,
    queueColumn,
    listColumn,
    children,
    testId = "configuration-shell",
    queueColumnTestId = "configuration-queue-column",
    listColumnTestId = "configuration-object-queue",
    workspaceTestId = "configuration-workspace",
}: {
    navColumn?: ReactNode;
    queueColumn?: ReactNode;
    listColumn?: ReactNode;
    children: ReactNode;
    testId?: string;
    queueColumnTestId?: string;
    listColumnTestId?: string;
    workspaceTestId?: string;
}) {
    return (
        <div className="process-config-shell min-h-0 flex-1" data-testid={testId}>
            {navColumn}
            {queueColumn ?
                <aside
                    className="configuration-section-queue process-config-list-column"
                    data-testid={queueColumnTestId}
                >
                    {queueColumn}
                </aside>
            :   null}
            {listColumn ?
                <aside
                    className="configuration-object-queue process-config-list-column process-config-object-queue"
                    data-testid={listColumnTestId}
                >
                    {listColumn}
                </aside>
            :   null}
            <ConfigurationWorkspace testId={workspaceTestId}>{children}</ConfigurationWorkspace>
        </div>
    );
}

export function ConfigurationQueue({
    title,
    summary,
    actions,
    children,
    testId = "configuration-queue",
}: {
    title?: string;
    summary?: string;
    actions?: ReactNode;
    children: ReactNode;
    testId?: string;
}) {
    return (
        <div className="space-y-3" data-testid={testId}>
            {title || actions ?
                <div className="flex items-start justify-between gap-2">
                    {title ?
                        <div>
                            <p className="config-typo-queue-section-label">{title}</p>
                            {summary ?
                                <p className="config-typo-sublabel mt-0.5">{summary}</p>
                            :   null}
                        </div>
                    :   <div />}
                    {actions}
                </div>
            :   null}
            <div className="space-y-2">{children}</div>
        </div>
    );
}

export function ConfigurationWorkspace({
    header,
    children,
    testId = "configuration-workspace",
}: {
    header?: ReactNode;
    children: ReactNode;
    testId?: string;
}) {
    return (
        <div className="configuration-workspace process-config-setup-workspace flex min-h-0 flex-col" data-testid={testId}>
            {header ?
                <div className="process-config-workspace-header mb-3 shrink-0">{header}</div>
            :   null}
            <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </div>
    );
}

export function ConfigurationQueueItem({
    active,
    title,
    subtitle,
    leading,
    trailing,
    onClick,
    testId,
    wrapTitle = false,
    /** Muted / subordinate row (e.g. Inactive objects). */
    muted = false,
    /** When true, exposes listbox option semantics (use inside role="listbox"). */
    listboxOption = false,
    /** `rail` = Processing-like nav row. `card` = legacy floating tile. */
    variant = "card",
}: {
    active: boolean;
    title: string;
    subtitle?: string | null;
    leading?: ReactNode;
    trailing?: ReactNode;
    onClick: () => void;
    testId?: string;
    wrapTitle?: boolean;
    muted?: boolean;
    listboxOption?: boolean;
    variant?: "card" | "rail";
}) {
    const className =
        variant === "rail" ?
            `${QUEUE_ROW_CARD_SHELL_CLASS} min-h-[3.6rem] shadow-none focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-alloy-bend-pine ${
                active ? QUEUE_ROW_CARD_SELECTED_BORDER_CLASS : QUEUE_ROW_CARD_IDLE_BORDER_CLASS
            } ${muted && !active ? "opacity-60" : ""}`
        :   `process-config-work-view-list-card ${active ? "process-config-work-view-list-card--active" : ""}`;

    return (
        <button
            type="button"
            role={listboxOption ? "option" : undefined}
            onClick={onClick}
            className={className}
            data-testid={testId}
            aria-current={active ? "true" : undefined}
            aria-selected={listboxOption ? active : undefined}
        >
            {variant === "rail" && active ?
                <span aria-hidden className={QUEUE_ROW_SELECTED_RAIL_CLASS} />
            :   null}
            <div className="flex min-w-0 w-full items-start gap-2.5">
                {leading ?
                    <span className="shrink-0" aria-hidden>
                        {leading}
                    </span>
                :   null}
                <div className="min-w-0 flex-1 text-left">
                    <p
                        className={`${variant === "rail" ? "text-[13px] font-semibold leading-4 text-alloy-midnight" : "config-typo-queue-item-title"} ${
                            wrapTitle ? "whitespace-normal" : "truncate"
                        }`}
                    >
                        {title}
                    </p>
                    {subtitle ?
                        <p
                            className={`${variant === "rail" ? "mt-0.5 text-[11px] leading-4 text-alloy-midnight/60" : "config-typo-sublabel mt-0.5"} ${
                                wrapTitle ? "whitespace-pre-line" : "truncate"
                            }`}
                        >
                            {subtitle}
                        </p>
                    :   null}
                </div>
                {trailing ?
                    <span className="shrink-0">{trailing}</span>
                :   null}
            </div>
        </button>
    );
}

export function ConfigurationPrimaryButton({
    className = "",
    children,
    ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
    return (
        <button
            type="button"
            className={`inline-flex items-center justify-center rounded-md border border-alloy-bend-pine bg-alloy-bend-pine px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-alloy-bend-pine/85 focus:outline-none focus-visible:ring-2 focus-visible:ring-alloy-bend-pine/40 focus-visible:ring-offset-1 active:bg-alloy-bend-pine/90 disabled:cursor-not-allowed disabled:opacity-50 ${className}`.trim()}
            {...props}
        >
            {children}
        </button>
    );
}

export function ConfigurationSecondaryButton({
    className = "",
    children,
    ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
    return (
        <button
            type="button"
            className={`inline-flex items-center justify-center rounded border border-alloy-bend-pine/30 bg-alloy-bend-pine/[0.08] px-3 py-1.5 text-xs font-medium text-alloy-bend-pine transition-colors hover:bg-alloy-bend-pine/[0.12] focus:outline-none focus-visible:ring-2 focus-visible:ring-alloy-bend-pine/40 focus-visible:ring-offset-1 active:bg-alloy-bend-pine/[0.16] disabled:cursor-not-allowed disabled:opacity-50 ${className}`.trim()}
            {...props}
        >
            {children}
        </button>
    );
}

export function ConfigurationInlineButton({
    className = "",
    children,
    ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
    return (
        <button
            type="button"
            className={`inline-flex items-center rounded text-xs font-semibold text-alloy-bend-pine transition-colors hover:text-alloy-bend-pine/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-alloy-bend-pine/40 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 ${className}`.trim()}
            {...props}
        >
            {children}
        </button>
    );
}

export function ConfigurationEmptyState({
    title,
    description,
    actions,
    testId = "configuration-empty-state",
}: {
    title: string;
    description: string;
    actions?: ReactNode;
    testId?: string;
}) {
    return (
        <ConfigurationDetailCard testId={testId}>
            <div className="px-2 py-8 text-center">
                <p className="config-typo-workspace-title">{title}</p>
                <p className="config-typo-sublabel mx-auto mt-2 max-w-md">{description}</p>
                {actions ?
                    <div className="mt-4 flex justify-center">{actions}</div>
                :   null}
            </div>
        </ConfigurationDetailCard>
    );
}

export function ConfigurationDetailCard({
    children,
    testId,
    title,
}: {
    children: ReactNode;
    testId?: string;
    title?: string;
}) {
    return (
        <article className="process-config-setup-card overflow-hidden" data-testid={testId}>
            {title ?
                <header className="border-b border-alloy-stone/30 px-4 py-2.5">
                    <h2 className="config-typo-workspace-title">{title}</h2>
                </header>
            :   null}
            <div className="p-4">{children}</div>
        </article>
    );
}
