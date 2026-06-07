"use client";

/**
 * Opportunity drawer — runtime plan proof (Phase 2).
 *
 * /adminV2/layout-proof/opportunity-drawer
 *
 * Proves: Resolved LayoutDoc → LayoutRuntimePlan → proof renderer.
 * Uses the Phase 1 relationship proof layout + sample record.
 * NOT connected to AdminEntityDrawer, VM, or production queues.
 */

import { useMemo } from "react";
import Link from "next/link";
import { isLayoutV2PreviewEnabledClient, isLayoutRuntimeEnabledClient } from "@/lib/layout/featureFlag";
import {
    buildLayoutRuntimePlan,
    buildOpportunityDrawerRelationshipProofLayout,
} from "@/lib/layout/runtime";
import { buildProofOpportunityRecord } from "@/lib/layout/runtime/buildProofOpportunityRecord";
import LayoutRuntimePlanView from "@/components/layout/LayoutRuntimePlanView";

const TEXT = "#273F52";
const MUTED = "rgba(39,63,82,0.65)";

export default function OpportunityDrawerRuntimeProofClient() {
    const previewOn = isLayoutV2PreviewEnabledClient();
    const runtimeFlagOn = isLayoutRuntimeEnabledClient();

    const doc = useMemo(() => buildOpportunityDrawerRelationshipProofLayout(), []);
    const plan = useMemo(() => buildLayoutRuntimePlan(doc), [doc]);
    const record = useMemo(() => buildProofOpportunityRecord(), []);

    if (!previewOn) {
        return (
            <Shell>
                <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                    Layout V2 preview is disabled. Set{" "}
                    <code className="font-mono text-xs">NEXT_PUBLIC_LAYOUT_V2_PREVIEW_ENABLED=1</code> to view this proof.
                </div>
            </Shell>
        );
    }

    return (
        <Shell>
            <div className="mb-4 flex flex-wrap items-center gap-3 text-xs" style={{ color: MUTED }}>
                <Link href="/adminV2/layout-proof" className="text-[#00458C] underline">
                    ← Lead layout proof
                </Link>
                <span>Runtime flag: {runtimeFlagOn ? "on" : "off (default)"}</span>
                <span>Plan template: {plan.layoutKey ?? "—"}</span>
            </div>

            <div className="mb-4 rounded-md border border-[#dbe7ff] bg-[#f5f8ff] p-3 text-sm" style={{ color: TEXT }}>
                <strong>Phase 2 proof integration.</strong> This drawer body is rendered from{" "}
                <code className="text-xs">LayoutRuntimePlan</code> with binding-aware resolution. Relationship fields show
                person handles; locations are role-disambiguated; program category is computed read-only; enrollment
                children render inside repeater context only.
            </div>

            <div className="overflow-hidden rounded-xl border border-[rgba(39,63,82,0.14)] bg-white shadow-sm">
                <div className="border-b border-[rgba(39,63,82,0.12)] bg-[#F6F8FC] px-4 py-3">
                    <h2 className="text-sm font-semibold" style={{ color: TEXT }}>
                        {String(record.name)} · Opportunity drawer (runtime plan)
                    </h2>
                    <p className="mt-0.5 text-xs" style={{ color: MUTED }}>
                        Status: {String(record._status_display ?? record.status_key ?? "—")} · Sample proof record
                    </p>
                </div>
                <div className="p-4">
                    <LayoutRuntimePlanView doc={doc} plan={plan} record={record} />
                </div>
            </div>
        </Shell>
    );
}

function Shell({ children }: { children: React.ReactNode }) {
    return (
        <div className="mx-auto max-w-[1100px] px-6 py-6">
            <header className="mb-5">
                <h1 className="text-2xl font-bold tracking-tight" style={{ color: TEXT }}>
                    Opportunity drawer — runtime plan proof
                </h1>
                <p className="mt-1 text-sm" style={{ color: MUTED }}>
                    First proof integration: resolved layout → runtime plan → binding-aware renderer. No live cutover.
                </p>
            </header>
            {children}
        </div>
    );
}
