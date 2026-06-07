"use client";

/**
 * Child drawer — runtime plan proof.
 *
 * /adminV2/layout-proof/child-drawer
 *
 * Proves: Child LayoutDoc → LayoutRuntimePlan → binding-aware proof renderer.
 * Parents, locations, and household use relationships — not flat child fields.
 * NOT connected to AdminEntityDrawer, VM, or production queues.
 */

import { isLayoutV2PreviewEnabledClient, isLayoutRuntimeEnabledClient } from "@/lib/layout/featureFlag";
import {
    buildLayoutRuntimePlan,
    buildChildDrawerRelationshipProofLayout,
} from "@/lib/layout/runtime";
import { buildProofChildRecord } from "@/lib/layout/runtime/buildProofChildRecord";
import LayoutRuntimePlanView from "@/components/layout/LayoutRuntimePlanView";
import { useMemo } from "react";
import Link from "next/link";

const TEXT = "#273F52";
const MUTED = "rgba(39,63,82,0.65)";

export default function ChildDrawerRuntimeProofClient() {
    const previewOn = isLayoutV2PreviewEnabledClient();
    const runtimeFlagOn = isLayoutRuntimeEnabledClient();

    const doc = useMemo(() => buildChildDrawerRelationshipProofLayout(), []);
    const plan = useMemo(() => buildLayoutRuntimePlan(doc), [doc]);
    const record = useMemo(() => buildProofChildRecord(), []);

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

    const childName = String(record["child.name"] ?? "Child");

    return (
        <Shell>
            <div className="mb-4 flex flex-wrap items-center gap-3 text-xs" style={{ color: MUTED }}>
                <Link href="/adminV2/layout-proof" className="text-[#00458C] underline">
                    ← Layout proof hub
                </Link>
                <span>Runtime flag: {runtimeFlagOn ? "on" : "off (default)"}</span>
                <span>Plan template: {plan.layoutKey ?? "—"}</span>
            </div>

            <div className="mb-4 rounded-md border border-[#dbe7ff] bg-[#f5f8ff] p-3 text-sm" style={{ color: TEXT }}>
                <strong>Child drawer foundation.</strong> Operator-facing label: Child. Classroom, site, and room use
                location roles; parents use Person relationships. Schedule, attendance, and billing are future placeholders
                only.
            </div>

            <div className="overflow-hidden rounded-xl border border-[rgba(39,63,82,0.14)] bg-white shadow-sm">
                <div className="border-b border-[rgba(39,63,82,0.12)] bg-[#F6F8FC] px-4 py-3">
                    <h2 className="text-sm font-semibold" style={{ color: TEXT }}>
                        {childName} · Child drawer (runtime plan)
                    </h2>
                    <p className="mt-0.5 text-xs" style={{ color: MUTED }}>
                        Sample proof record · entity: customer_members (Child)
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
                    Child drawer — runtime plan proof
                </h1>
                <p className="mt-1 text-sm" style={{ color: MUTED }}>
                    Layout runtime foundation for Child drawer. No live cutover.
                </p>
            </header>
            {children}
        </div>
    );
}
