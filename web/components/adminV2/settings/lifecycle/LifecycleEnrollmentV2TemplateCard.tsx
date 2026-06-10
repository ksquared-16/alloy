"use client";

import { useCallback, useState } from "react";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import {
    ENROLLMENT_FAMILY_STAGE_SPECS,
    ENROLLMENT_CHILD_STAGE_SPECS,
} from "@/lib/businessProcessTemplates/enrollmentProcessTemplate";

type Props = {
    departmentId: string;
    processId: string;
    onApplied: () => void | Promise<void>;
};

/** Operator-initiated Enrollment V2 structure — metadata only, no status seeding. */
export default function LifecycleEnrollmentV2TemplateCard({
    departmentId,
    processId,
    onApplied,
}: Props) {
    const [applying, setApplying] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const applyTemplate = useCallback(async () => {
        const dept = departmentId.trim();
        const pid = processId.trim();
        if (!dept || !pid) return;
        setApplying(true);
        setError(null);
        try {
            const res = await fetch(
                `/api/admin/departments/${encodeURIComponent(dept)}/lifecycle-builder`,
                {
                    ...workspaceDataFetchInit(),
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        action: "apply_enrollment_v2_template",
                        process_id: pid,
                    }),
                },
            );
            const j = (await res.json().catch(() => ({}))) as { error?: string };
            if (!res.ok) throw new Error(j.error ?? "Failed to apply template");
            await onApplied();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to apply template");
        } finally {
            setApplying(false);
        }
    }, [departmentId, onApplied, processId]);

    return (
        <div
            className="rounded-lg border border-alloy-forge/15 bg-white p-4 shadow-sm"
            data-testid="lifecycle-enrollment-v2-template-card"
        >
            <h3 className="text-sm font-semibold text-alloy-midnight">Enrollment Process V2</h3>
            <p className="mt-1 text-xs text-alloy-midnight/65">
                Apply the Family and Child track structure with rollup stages. You assign statuses,
                queue membership, and work outcomes in each stage — nothing is seeded automatically.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="rounded-md bg-alloy-stone/8 px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/50">
                        Family Track
                    </p>
                    <ul className="mt-1 list-inside list-disc text-xs text-alloy-midnight/75">
                        {ENROLLMENT_FAMILY_STAGE_SPECS.map((s) => (
                            <li key={s.key}>{s.label}</li>
                        ))}
                    </ul>
                </div>
                <div className="rounded-md bg-alloy-stone/8 px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/50">
                        Child Track
                    </p>
                    <ul className="mt-1 list-inside list-disc text-xs text-alloy-midnight/75">
                        {ENROLLMENT_CHILD_STAGE_SPECS.map((s) => (
                            <li key={s.key}>{s.label}</li>
                        ))}
                    </ul>
                    <p className="mt-2 text-[10px] text-alloy-midnight/55">
                        Splits from Decision — choose each child&apos;s path.
                    </p>
                </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    className="rounded-md bg-alloy-pine px-3 py-1.5 text-xs font-semibold text-white hover:bg-alloy-pine/90 disabled:opacity-50"
                    disabled={applying}
                    onClick={() => void applyTemplate()}
                    data-testid="lifecycle-apply-enrollment-v2-template"
                >
                    {applying ? "Applying…" : "Apply Enrollment V2 template"}
                </button>
                <span className="text-[10px] text-alloy-midnight/50">
                    Or add custom stages manually below.
                </span>
            </div>
            {error ?
                <p className="mt-2 text-xs text-red-700" role="alert">
                    {error}
                </p>
            :   null}
        </div>
    );
}
