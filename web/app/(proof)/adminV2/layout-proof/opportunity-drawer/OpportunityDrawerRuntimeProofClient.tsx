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

import { isLayoutV2PreviewEnabledClient, isLayoutRuntimeEnabledClient, isLayoutRuntimeShadowEnabledClient } from "@/lib/layout/featureFlag";
import {
    buildLayoutRuntimePlan,
    buildOpportunityDrawerRelationshipProofLayout,
    appendOpportunityFutureTabPlaceholders,
} from "@/lib/layout/runtime";
import { buildProofOpportunityRecord } from "@/lib/layout/runtime/buildProofOpportunityRecord";
import LayoutRuntimePlanView from "@/components/layout/LayoutRuntimePlanView";
import type { RealRecordShadowValidationReport } from "@/lib/layout/runtime";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

const TEXT = "#273F52";
const MUTED = "rgba(39,63,82,0.65)";

export default function OpportunityDrawerRuntimeProofClient() {
    const previewOn = isLayoutV2PreviewEnabledClient();
    const runtimeFlagOn = isLayoutRuntimeEnabledClient();
    const shadowFlagOn = isLayoutRuntimeShadowEnabledClient();
    const searchParams = useSearchParams();
    const opportunityId = searchParams.get("opportunityId")?.trim() ?? "";
    const [shadowReport, setShadowReport] = useState<RealRecordShadowValidationReport | null>(null);

    const doc = useMemo(
        () => appendOpportunityFutureTabPlaceholders(buildOpportunityDrawerRelationshipProofLayout()),
        [],
    );
    const plan = useMemo(() => buildLayoutRuntimePlan(doc), [doc]);
    const record = useMemo(() => buildProofOpportunityRecord(), []);

    useEffect(() => {
        if (!previewOn) return;
        const qs = opportunityId ? `?opportunityId=${encodeURIComponent(opportunityId)}` : "";
        fetch(`/api/admin/layout-proof/opportunity-drawer-shadow${qs}`)
            .then((r) => (r.ok ? r.json() : null))
            .then((json) => {
                if (json?.report) setShadowReport(json.report as RealRecordShadowValidationReport);
            })
            .catch(() => {});
    }, [previewOn, opportunityId]);

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
                <span>Shadow flag: {shadowFlagOn ? "on" : "off (default)"}</span>
                <span>Plan template: {plan.layoutKey ?? "—"}</span>
            </div>

            {shadowReport ? (
                <div className="mb-4 rounded-md border border-[rgba(39,63,82,0.14)] bg-white p-3 text-sm" style={{ color: TEXT }}>
                    <strong>Phase {opportunityId ? "4 real-record" : "3 fixture"} shadow parity.</strong>{" "}
                    {opportunityId ? `Opportunity ${opportunityId.slice(0, 8)}… · ` : ""}
                    Score: {shadowReport.parityScore}% · Fields: {shadowReport.coverage.fields.percent}% · Readiness:{" "}
                    {shadowReport.readiness.level}
                    <div className="mt-1 text-xs" style={{ color: MUTED }}>
                        {shadowReport.summary}
                    </div>
                    {shadowReport.topGaps.length > 0 ? (
                        <ul className="mt-2 max-h-40 overflow-y-auto text-xs" style={{ color: MUTED }}>
                            {shadowReport.topGaps.slice(0, 6).map((g, i) => (
                                <li key={i}>
                                    [{g.impact}] {g.key}: {g.detail}
                                </li>
                            ))}
                        </ul>
                    ) : null}
                </div>
            ) : null}

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
