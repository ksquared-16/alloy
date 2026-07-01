"use client";

import type { ReactNode } from "react";
import { Home, User } from "lucide-react";
import { resolvePersonDrawerCommandHeaderMeta } from "@/lib/layout/runtime/resolvePersonDrawerHeaderContext";

const HEADER_BORDER = "rgba(39,63,82,0.14)";
const HEADER_TEXT = "#273F52";
const TAB_ACTIVE = "#273F52";

export type PersonDrawerCommandHeaderTab = {
    key: string;
    label: string;
};

export type PersonDrawerCommandHeaderProps = {
    title: ReactNode;
    record: Record<string, unknown>;
    tabs: readonly PersonDrawerCommandHeaderTab[];
    activeTab: string;
    onTabSelect: (tab: string) => void;
    actionsControl: ReactNode;
    closeButton: ReactNode;
    backLink?: { label: string; onClick: () => void } | null;
};

function MetaSegment({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
    return (
        <span className={muted ? "text-alloy-midnight/45" : "font-medium text-alloy-midnight/72"}>
            {children}
        </span>
    );
}

/** Person relationship drawer command header — no lifecycle rail by default. */
export default function PersonDrawerCommandHeader({
    title,
    record,
    tabs,
    activeTab,
    onTabSelect,
    actionsControl,
    closeButton,
    backLink,
}: PersonDrawerCommandHeaderProps) {
    const meta = resolvePersonDrawerCommandHeaderMeta(record);

    return (
        <div
            className="shrink-0 border-b border-solid bg-white"
            style={{ borderColor: HEADER_BORDER }}
            data-person-drawer-command-header-root="true"
            data-proof-layout-header="true"
            data-proof-layout-header-variant="person-drawer-command"
        >
            <div
                className="flex items-start justify-between gap-5 px-6 pb-2.5 pt-4"
                data-proof-layout-header-row="title-actions"
            >
                <div
                    className="flex min-w-0 flex-1 items-start gap-4 rounded-2xl border border-alloy-stone/14 bg-gradient-to-br from-white via-white to-[#0d9488]/[0.04] px-4 py-3.5 shadow-[0_3px_12px_rgba(24,39,58,0.06)] ring-1 ring-[#0d9488]/[0.08]"
                    data-person-drawer-command-header="true"
                >
                    <div
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#0d9488]/25 bg-gradient-to-br from-[#0d9488]/[0.14] to-white text-[#0d9488] shadow-[0_1px_4px_rgba(13,148,136,0.12)]"
                        data-person-drawer-command-avatar="true"
                    >
                        <User className="h-5 w-5" aria-hidden />
                    </div>
                    <div className="min-w-0 flex-1">
                        {backLink ?
                            <button
                                type="button"
                                onClick={backLink.onClick}
                                className="mb-1 text-[11px] font-medium text-[#0d9488]/70 hover:text-[#0d9488] hover:underline"
                                data-person-drawer-command-back-link="true"
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
                        {(meta.relationshipLabel || meta.householdName) ?
                            <p
                                className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] leading-snug"
                                data-person-drawer-header-meta-row="true"
                            >
                                {meta.relationshipLabel ?
                                    <MetaSegment>{meta.relationshipLabel}</MetaSegment>
                                :   null}
                                {meta.relationshipLabel && meta.householdName ?
                                    <span className="text-alloy-midnight/25" aria-hidden>
                                        ·
                                    </span>
                                :   null}
                                {meta.householdName ?
                                    <span
                                        className="inline-flex items-center gap-1 rounded-full border border-[#0d9488]/20 bg-[#0d9488]/[0.06] px-2 py-0.5 text-[11px] font-medium text-[#0d9488]"
                                        data-person-drawer-header-household-chip="true"
                                    >
                                        <Home className="h-3 w-3" aria-hidden />
                                        {meta.householdName}
                                    </span>
                                :   null}
                            </p>
                        :   null}
                        {meta.contactRow ?
                            <p
                                className="mt-1 text-[11px] leading-snug text-alloy-midnight/42 md:block"
                                data-person-drawer-header-contact-row="true"
                            >
                                {meta.contactRow}
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
                                className={`rounded-t-md px-3.5 py-1.5 text-xs font-medium leading-snug transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0d9488]/40 ${active ? "border-b-2 border-[#0d9488] text-alloy-midnight" : "text-alloy-midnight/55 hover:bg-alloy-stone/[0.04] hover:text-alloy-midnight/80"}`}
                                style={active ? { color: TAB_ACTIVE } : undefined}
                                data-person-drawer-tab={t.key}
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
