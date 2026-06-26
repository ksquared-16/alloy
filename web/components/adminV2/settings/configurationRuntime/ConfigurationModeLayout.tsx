"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

/** Context bar — title, subtitle, and actions above the configuration shell. */
export function ConfigurationContext({
    title,
    subtitle,
    actions,
    testId = "configuration-context",
    children,
}: {
    title: string;
    subtitle?: string;
    actions?: ReactNode;
    testId?: string;
    children?: ReactNode;
}) {
    return (
        <header className="process-config-context-bar space-y-2" data-testid={testId}>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <h1 className="config-typo-page-title process-config-context-title">{title}</h1>
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
                <aside className="process-config-list-column" data-testid={queueColumnTestId}>
                    {queueColumn}
                </aside>
            :   null}
            {listColumn ?
                <aside
                    className="process-config-list-column process-config-object-queue"
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
        <div className="process-config-setup-workspace flex min-h-0 flex-col" data-testid={testId}>
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
    trailing,
    onClick,
    testId,
}: {
    active: boolean;
    title: string;
    subtitle?: string;
    trailing?: ReactNode;
    onClick: () => void;
    testId?: string;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`process-config-work-view-list-card ${active ? "process-config-work-view-list-card--active" : ""}`}
            data-testid={testId}
            aria-current={active ? "true" : undefined}
        >
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 text-left">
                    <p className="config-typo-queue-item-title truncate">{title}</p>
                    {subtitle ?
                        <p className="config-typo-sublabel mt-0.5 truncate">{subtitle}</p>
                    :   null}
                </div>
                {trailing}
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
        <button type="button" className={`config-primary-btn ${className}`.trim()} {...props}>
            {children}
        </button>
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
