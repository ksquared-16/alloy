"use client";

import type { ReactNode } from "react";
import "@/app/adminV2/components/workspace/workspace.css";
import { CrmCompactQueuePreview } from "@/app/adminV2/components/workspace/blocks/QueueBlock";
import OperationalAttentionDrawerPanel from "@/components/admin/drawer/OperationalAttentionDrawerPanel";
import * as F from "./fixtures";

function SurfaceShell({ children }: { children: ReactNode }) {
    return (
        <div data-ws-surface="work_unit" className="adminv2-ws-work-unit adminv2-ws-wu-v2">
            {children}
        </div>
    );
}

function QueueCard({
    reviewId,
    title,
    slots,
    tier = "warning",
}: {
    reviewId: string;
    title: string;
    slots: import("@/lib/ui-v2/workspace-types").CrmCompactRowSemanticSlots;
    tier?: "critical" | "warning" | "standard";
}) {
    return (
        <section
            data-p1c-review={reviewId}
            className="mb-12 scroll-mt-6 rounded-xl border border-alloy-stone/25 bg-white p-4 shadow-sm"
        >
            <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.06em] text-alloy-midnight/55">
                {title}
            </h2>
            <SurfaceShell>
                <div
                    className={`adminv2-ws-wu-queue-card adminv2-ws-wu-queue-card--compact adminv2-ws-wu-queue-card--tier-${tier} max-w-2xl`}
                >
                    <div className="adminv2-ws-enrollment-crm-row adminv2-ws-enrollment-crm-row--split">
                        <div className="adminv2-ws-enrollment-crm-row__content">
                            <CrmCompactQueuePreview slots={slots} urgencyTier={tier} />
                        </div>
                    </div>
                </div>
            </SurfaceShell>
        </section>
    );
}

function DrawerShell({
    reviewId,
    title,
    children,
    narrow,
}: {
    reviewId: string;
    title: string;
    children: ReactNode;
    narrow?: boolean;
}) {
    return (
        <section
            data-p1c-review={reviewId}
            className={`mb-12 scroll-mt-6 rounded-xl border border-alloy-stone/25 bg-white p-4 shadow-sm ${narrow ? "max-w-[320px]" : ""}`}
        >
            <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.06em] text-alloy-midnight/55">
                {title}
            </h2>
            <div className="rounded-xl border border-admin-border bg-white/90 px-2.5 py-2.5 shadow-sm">
                {children}
            </div>
        </section>
    );
}

export default function P1cReviewGallery() {
    return (
        <div className="min-h-screen bg-alloy-stone/10 px-4 py-8 text-alloy-midnight">
            <div className="mx-auto max-w-4xl">
                <header className="mb-10 border-b border-alloy-stone/20 pb-6">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-700/90">
                        Dev-only · not shipped in production
                    </p>
                    <h1 className="mt-2 text-2xl font-semibold text-alloy-midnight">
                        P1-C operational attention — fixture gallery
                    </h1>
                    <p className="mt-2 max-w-2xl text-sm text-alloy-midnight/65">
                        Resolver-shaped payloads and CRM-compact slots modeled after enrollment demo families (Patel,
                        Nguyen, Chen, Rivera). Used for Playwright screenshots and human UX review.
                    </p>
                    <p className="mt-2 font-mono text-xs text-alloy-midnight/50">/dev/p1c-operational-attention-review</p>
                </header>

                <QueueCard reviewId="queue-single" title="Queue · one attention reason" slots={F.queueSingleReason} />
                <QueueCard
                    reviewId="queue-multi-factors"
                    title="Queue · +N factors + muted activity stale"
                    slots={F.queueMultiFactors}
                />
                <QueueCard reviewId="queue-wait-token" title="Queue · waiting token (family)" slots={F.queueWaitToken} />
                <QueueCard reviewId="queue-next-line" title="Queue · Next: operational hint" slots={F.queueNextLine} />

                <DrawerShell reviewId="drawer-no-attention" title="Drawer · no operational attention">
                    <OperationalAttentionDrawerPanel payload={F.drawerNoAttention} />
                </DrawerShell>

                <DrawerShell reviewId="drawer-single-reason" title="Drawer · single reason">
                    <OperationalAttentionDrawerPanel payload={F.drawerSingleReason} />
                </DrawerShell>

                <DrawerShell reviewId="drawer-multi-reason" title="Drawer · multi-reason (collapsed factors)">
                    <OperationalAttentionDrawerPanel payload={F.drawerMultiReason} />
                </DrawerShell>

                <DrawerShell reviewId="drawer-expanded-factors" title="Drawer · factors expanded">
                    <OperationalAttentionDrawerPanel payload={F.drawerMultiReason} defaultReasonsExpanded />
                </DrawerShell>

                <DrawerShell reviewId="drawer-advanced-breakdown" title="Drawer · advanced score breakdown">
                    <OperationalAttentionDrawerPanel
                        payload={F.drawerMultiReason}
                        defaultReasonsExpanded
                        defaultAdvancedExpanded
                    />
                </DrawerShell>

                <DrawerShell reviewId="drawer-narrow-wrap" title="Drawer · narrow width (320px)" narrow>
                    <OperationalAttentionDrawerPanel payload={F.drawerMultiReason} />
                </DrawerShell>
            </div>
        </div>
    );
}
