"use client";

/**
 * Lead drawer command header — dedicated runtime header (not ProofRecordModalHeaderShell).
 *
 * Used when Lead overview composition is active. Proof shell remains for layout preview
 * and non-lead opportunity paths.
 */

import type { ReactNode } from "react";
import { MapPin, Users } from "lucide-react";
import { resolveLeadDrawerCommandHeaderMeta } from "@/lib/layout/runtime/resolveLeadDrawerHeaderContext";

const HEADER_BORDER = "rgba(39,63,82,0.14)";
const HEADER_TEXT = "#273F52";
const TAB_ACTIVE = "#273F52";

export type LeadDrawerCommandHeaderTab = {
    key: string;
    label: string;
};

export type LeadDrawerCommandHeaderProps = {
    title: ReactNode;
    record: Record<string, unknown>;
    locationLabel?: string | null;
    tabs: readonly LeadDrawerCommandHeaderTab[];
    activeTab: string;
    onTabSelect: (tab: string) => void;
    lifecycleRail?: ReactNode | null;
    /** Queue prev/next — nested under header controls, same row band as title. */
    queueNavigation?: ReactNode | null;
    actionsControl: ReactNode;
    closeButton: ReactNode;
};

function MetaSegment({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
    return (
        <span className={muted ? "text-alloy-midnight/45" : "font-medium text-alloy-midnight/72"}>
            {children}
        </span>
    );
}

export default function LeadDrawerCommandHeader({
    title,
    record,
    locationLabel,
    tabs,
    activeTab,
    onTabSelect,
    lifecycleRail,
    queueNavigation,
    actionsControl,
    closeButton,
}: LeadDrawerCommandHeaderProps) {
    const meta = resolveLeadDrawerCommandHeaderMeta(record, { locationLabel });
    const ctx = meta.metaRow ? meta.metaRow.split(" · ") : [];

    return (
        <div
            className="shrink-0 border-b border-solid bg-white"
            style={{ borderColor: HEADER_BORDER }}
            data-lead-drawer-command-header-root="true"
            data-proof-layout-header="true"
            data-proof-layout-header-variant="lead-drawer-command"
        >
            <div
                className="flex items-start justify-between gap-5 px-6 pb-2.5 pt-4"
                data-proof-layout-header-row="title-actions"
            >
                <div
                    className="flex min-w-0 flex-1 items-start gap-4 rounded-2xl border border-alloy-stone/14 bg-gradient-to-br from-white via-white to-alloy-juniper/[0.04] px-4 py-3.5 shadow-[0_3px_12px_rgba(24,39,58,0.06)] ring-1 ring-alloy-juniper/[0.08]"
                    data-lead-drawer-command-header="true"
                >
                    <div
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-alloy-juniper/25 bg-gradient-to-br from-alloy-juniper/[0.14] to-white text-alloy-juniper shadow-[0_1px_4px_rgba(0,162,131,0.12)]"
                        data-lead-drawer-command-avatar="true"
                    >
                        <Users className="h-5 w-5" aria-hidden />
                    </div>
                    <div className="min-w-0 flex-1">
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
                        {ctx.length > 0 ?
                            <p
                                className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] leading-snug"
                                data-lead-drawer-header-meta-row="true"
                            >
                                {ctx.map((part, index) => {
                                    const isCampus = locationLabel && part.trim() === locationLabel.trim();
                                    return (
                                        <span key={`${part}-${index}`} className="inline-flex items-center gap-1.5">
                                            {index > 0 ?
                                                <span className="text-alloy-midnight/25" aria-hidden>
                                                    ·
                                                </span>
                                            :   null}
                                            {isCampus ?
                                                <span
                                                    className="inline-flex items-center gap-1 rounded-full border border-alloy-juniper/20 bg-alloy-juniper/[0.06] px-2 py-0.5 text-[11px] font-medium text-alloy-juniper"
                                                    data-lead-drawer-header-campus-chip="true"
                                                >
                                                    <MapPin className="h-3 w-3" aria-hidden />
                                                    {part}
                                                </span>
                                            :   <MetaSegment muted={index > 0}>{part}</MetaSegment>}
                                        </span>
                                    );
                                })}
                            </p>
                        :   null}
                        {meta.contactRow ?
                            <p
                                className="mt-1 text-[11px] leading-snug text-alloy-midnight/42 md:block"
                                data-lead-drawer-header-contact-row="true"
                            >
                                {meta.contactRow}
                            </p>
                        :   null}
                    </div>
                </div>

                <div
                    className="flex shrink-0 flex-col items-end gap-1 self-start pt-1"
                    data-proof-layout-header-controls="true"
                >
                    <div className="flex items-center gap-2">
                        {actionsControl}
                        {closeButton}
                    </div>
                    {queueNavigation ?
                        <div data-proof-layout-header-queue-navigation="true">
                            {queueNavigation}
                        </div>
                    :   null}
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
                                className={`rounded-t-md px-3.5 py-1.5 text-xs font-medium leading-snug transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-alloy-juniper/40 ${active ? "border-b-2 border-alloy-juniper text-alloy-midnight" : "text-alloy-midnight/55 hover:bg-alloy-stone/[0.04] hover:text-alloy-midnight/80"}`}
                                style={active ? { color: TAB_ACTIVE } : undefined}
                                data-opportunity-drawer-tab={t.key}
                            >
                                {t.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {lifecycleRail ?
                <div className="px-6 pb-2 pt-1" data-proof-layout-header-row="lifecycle">
                    {lifecycleRail}
                </div>
            :   null}
        </div>
    );
}
