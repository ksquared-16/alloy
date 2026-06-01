"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { LifecycleOperatorStage } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import type {
    EnrollmentProcessFormCoverageRow,
    FormRequirementCoverageState,
} from "@/lib/lifecycle/enrollmentProcessFormCoverage";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";

function stateLabel(state: FormRequirementCoverageState): string {
    switch (state) {
        case "satisfies":
            return "Satisfies";
        case "partial":
            return "Partial";
        case "missing":
            return "Missing";
        case "unknown":
            return "Coverage unknown";
    }
}

function stateClass(state: FormRequirementCoverageState): string {
    switch (state) {
        case "satisfies":
            return "text-alloy-pine";
        case "partial":
            return "text-amber-900/85";
        case "missing":
            return "text-red-800/85";
        default:
            return "text-alloy-midnight/50";
    }
}

export default function EnrollmentProcessFormsCoverageCard({
    departmentId,
    activeStage,
}: {
    departmentId: string;
    activeStage: LifecycleOperatorStage;
}) {
    const [forms, setForms] = useState<EnrollmentProcessFormCoverageRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!departmentId) return;
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(
                `/api/admin/enrollment-process/form-coverage?department_id=${encodeURIComponent(departmentId)}&stage=${encodeURIComponent(activeStage)}`,
                workspaceDataFetchInit()
            );
            const j = (await res.json().catch(() => ({}))) as {
                forms?: EnrollmentProcessFormCoverageRow[];
                error?: string;
            };
            if (!res.ok) throw new Error(j.error ?? "Failed to load forms");
            setForms(j.forms ?? []);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load");
            setForms([]);
        } finally {
            setLoading(false);
        }
    }, [departmentId, activeStage]);

    useEffect(() => {
        void load();
    }, [load]);

    if (loading) return <p className="text-xs text-alloy-midnight/50">Loading forms…</p>;
    if (error) {
        return (
            <p className="text-xs text-red-700" role="alert">
                {error}
            </p>
        );
    }

    if (!forms.length) {
        return (
            <div className="space-y-2" data-testid="enrollment-process-forms-coverage">
                <p className="text-xs text-alloy-midnight/55">No connected forms for this stage yet.</p>
                <Link href="/adminV2/forms" className="text-xs font-medium text-alloy-pine hover:underline">
                    Open Forms &amp; Packets
                </Link>
            </div>
        );
    }

    return (
        <div className="space-y-3" data-testid="enrollment-process-forms-coverage">
            {forms.map((form) => (
                <div
                    key={form.form_id}
                    className="rounded-md border border-alloy-forge/10 bg-alloy-stone/[0.03] p-2.5"
                    data-testid={`enrollment-process-form-row-${form.form_id}`}
                >
                    <div className="flex items-start justify-between gap-2">
                        <Link href={form.href} className="text-xs font-semibold text-alloy-pine hover:underline">
                            {form.form_name}
                        </Link>
                        <span className="text-[10px] text-alloy-midnight/45">{form.intake_type_label}</span>
                    </div>
                    {!form.has_published_version ? (
                        <p className="mt-1 text-[11px] text-amber-900/80">No published version — coverage unknown.</p>
                    ) : form.captures.length ? (
                        <p className="mt-1 text-[11px] text-alloy-midnight/60">
                            <span className="font-medium text-alloy-midnight/50">Captures: </span>
                            {form.captures.join(" · ")}
                        </p>
                    ) : (
                        <p className="mt-1 text-[11px] text-alloy-midnight/50">No fields on published form.</p>
                    )}
                    {form.requirement_rows.length ? (
                        <ul className="mt-2 space-y-0.5">
                            {form.requirement_rows.map((row) => (
                                <li key={row.requirement_label} className="flex justify-between gap-2 text-[11px]">
                                    <span className="text-alloy-midnight/75">{row.requirement_label}</span>
                                    <span className={stateClass(row.state)}>{stateLabel(row.state)}</span>
                                </li>
                            ))}
                        </ul>
                    ) : null}
                </div>
            ))}
            <Link href="/adminV2/forms" className="inline-block text-xs font-medium text-alloy-pine hover:underline">
                Open Forms &amp; Packets
            </Link>
        </div>
    );
}
