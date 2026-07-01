"use client";

import type { ReactNode } from "react";
import {
    resolveLayoutEditorWidgetToneHeaderWashClass,
    resolveLayoutEditorWidgetToneIconClass,
    resolveLayoutEditorWidgetToneRailClass,
    resolveLayoutEditorWidgetToneTitleClass,
    type LayoutEditorWidgetRuntimeTone,
} from "@/lib/layout/layoutEditorWidgetStyle";

type Props = {
    title?: string | null;
    tone?: LayoutEditorWidgetRuntimeTone;
    icon?: ReactNode;
    headerActions?: ReactNode;
    bodyClassName?: string;
    children: ReactNode;
    /** When true, omit outer border/rail (section shell already provides chrome). */
    embedded?: boolean;
};

/** Shared tone header wash + left rail for field cards, related lists, text blocks, and widgets. */
export default function LayoutRuntimeTonedPanelShell({
    title,
    tone,
    icon,
    headerActions,
    bodyClassName = "px-2.5 py-2",
    children,
    embedded = false,
}: Props) {
    if (!tone) {
        return <div className={bodyClassName}>{children}</div>;
    }

    const rail = resolveLayoutEditorWidgetToneRailClass(tone);
    const iconBadge = resolveLayoutEditorWidgetToneIconClass(tone);
    const titleClass = resolveLayoutEditorWidgetToneTitleClass(tone);
    const headerWash = resolveLayoutEditorWidgetToneHeaderWashClass(tone);
    const surfaceClass = embedded ?
        "flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-alloy-stone/10 bg-white"
    :   `flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-alloy-stone/12 border-l-[3px] ${rail} bg-white shadow-[0_1px_4px_rgba(24,39,58,0.04)]`;
    const hoverGroupClass = headerActions ? "group/block" : "";

    return (
        <div className={`${surfaceClass} ${hoverGroupClass}`.trim()} data-layout-runtime-widget-tone={tone}>
            {title || headerActions ?
                <header className={`flex items-center justify-between gap-2 border-b border-alloy-stone/8 px-2.5 py-1.5 ${headerWash}`}>
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                        {icon ?
                            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${iconBadge}`} aria-hidden>
                                {icon}
                            </span>
                        :   null}
                        {title ?
                            <span className={`truncate text-[10px] font-semibold uppercase tracking-[0.07em] ${titleClass}`}>
                                {title}
                            </span>
                        :   null}
                    </div>
                    {headerActions ?
                        <div className="shrink-0">{headerActions}</div>
                    :   null}
                </header>
            :   null}
            <div className={bodyClassName}>{children}</div>
        </div>
    );
}
