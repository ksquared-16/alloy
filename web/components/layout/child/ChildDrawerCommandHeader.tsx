"use client";

import type { ReactNode } from "react";
import { Baby, Home } from "lucide-react";
import { resolveChildDrawerCommandHeaderMeta } from "@/lib/layout/runtime/resolveChildDrawerHeaderContext";

const HEADER_BORDER = "rgba(39,63,82,0.14)";
const HEADER_TEXT = "#273F52";
const TAB_ACTIVE = "#273F52";

export type ChildDrawerCommandHeaderTab = {
    key: string;
    label: string;
};

export type ChildDrawerCommandHeaderProps = {
    title: ReactNode;
    record: Record<string, unknown>;
    tabs: readonly ChildDrawerCommandHeaderTab[];
    activeTab: string;
    onTabSelect: (tab: string) => void;
    actionsControl: ReactNode;
    closeButton: ReactNode;
    backLink?: { label: string; onClick: () => void } | null;
};

/** Child enrollment/care drawer command header — no lifecycle rail by default. */
export default function ChildDrawerCommandHeader({
    title,
    record,
    tabs,
    activeTab,
    onTabSelect,
    actionsControl,
    closeButton,
    backLink,
}: ChildDrawerCommandHeaderProps) {
    const meta = resolveChildDrawerCommandHeaderMeta(record);

    return (
        <div
            className="shrink-0 border-b border-solid bg-white"
            style={{ borderColor: HEADER_BORDER }}
            data-child-drawer-command-header-root="true"
            data-proof-layout-header="true"
            data-proof-layout-header-variant="child-drawer-command"
        >
            <div
                className="flex items-start justify-between gap-5 px-6 pb-2.5 pt-4"
                data-proof-layout-header-row="title-actions"
            >
                <div
                    className="flex min-w-0 flex-1 items-start gap-4 rounded-2xl border border-alloy-stone/14 bg-gradient-to-br from-white via-white to-[#0d9488]/[0.04] px-4 py-3.5 shadow-[0_3px_12px_rgba(24,39,58,0.06)] ring-1 ring-[#0d9488]/[0.08]"
                    data-child-drawer-command-header="true"
                >
                    <div
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#0d9488]/25 bg-gradient-to-br from-[#0d9488]/[0.14] to-white text-[#0d9488] shadow-[0_1px_4px_rgba(13,148,136,0.12)]"
                        data-child-drawer-command-avatar="true"
                    >
                        <Baby className="h-5 w-5" aria-hidden />
                    </div>
                    <div className="min-w-0 flex-1">
                        {backLink ?
                            <button
                                type="button"
                                onClick={backLink.onClick}
                                className="mb-1 text-[11px] font-medium text-[#0d9488]/70 hover:text-[#0d9488] hover:underline"
                                data-child-drawer-command-back-link="true"
                            >
                                ← {backLink.label}
                            </button>
                        :   null}
                        {typeof title === "string" ?
                            <h2
                                id="admin-drawer-title"
                                className="break-words text-[1.4rem] font-semibold leading-[1.06] tracking-tight text-alloy-midnight sm:text-[1.5rem]"
                                style={{ color: HEADER_TEXT }}
                            >
                                {title}
                            </h2>
                        :   <div
                                id="admin-drawer-title"
                                className="break-words text-[1.4rem] font-semibold leading-[1.06] tracking-tight sm:text-[1.5rem]"
                                style={{ color: HEADER_TEXT }}
                            >
                                {title}
                            </div>
                        }
                        {(meta.ageDobRow || meta.householdName || meta.programRow) ?
                            <p
                                className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] leading-snug text-alloy-midnight/72"
                                data-child-drawer-header-meta-row="true"
                            >
                                {meta.ageDobRow ?
                                    <span className="font-medium">{meta.ageDobRow}</span>
                                :   null}
                                {meta.ageDobRow && meta.householdName ?
                                    <span className="text-alloy-midnight/25" aria-hidden>
                                        ·
                                    </span>
                                :   null}
                                {meta.householdName ?
                                    <span
                                        className="inline-flex items-center gap-1 rounded-full border border-alloy-blue/20 bg-alloy-blue/[0.06] px-2 py-0.5 text-[11px] font-medium text-alloy-blue"
                                        data-child-drawer-header-household-chip="true"
                                    >
                                        <Home className="h-3 w-3" aria-hidden />
                                        {meta.householdName}
                                    </span>
                                :   null}
                                {(meta.ageDobRow || meta.householdName) && meta.programRow ?
                                    <span className="text-alloy-midnight/25" aria-hidden>
                                        ·
                                    </span>
                                :   null}
                                {meta.programRow ?
                                    <span className="text-alloy-midnight/55">{meta.programRow}</span>
                                :   null}
                            </p>
                        :   null}
                    </div>
                </div>

                <div
                    className="flex shrink-0 items-center gap-2 self-start pt-1"
                    data-proof-layout-header-controls="true"
                >
                    {actionsControl}
                    {closeButton}
                </div>
            </div>

            <div className="border-b border-alloy-stone/10 px-6 pb-0.5 pt-0" data-proof-layout-header-row="tabs">
                <div className="flex min-h-0 flex-wrap gap-1">
                    {tabs.map((t) => {
                        const active = activeTab === t.key;
                        return (
                            <button
                                key={t.key}
                                type="button"
                                onClick={() => onTabSelect(t.key)}
                                className={`rounded-t-md px-3.5 py-1.5 text-xs font-medium leading-snug transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-alloy-blue/40 ${active ? "border-b-2 border-alloy-blue text-alloy-midnight" : "text-alloy-midnight/55 hover:bg-alloy-stone/[0.04] hover:text-alloy-midnight/80"}`}
                                style={active ? { color: TAB_ACTIVE } : undefined}
                                data-child-drawer-tab={t.key}
                            >
                                {t.label}
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
