"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { LifecycleOperatorStage } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import type {
    EnrollmentProcessFormCoverageRow,
    FormFieldRuleCoverageRow,
    FormFieldRulesCoverageSummary,
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

function fieldRulesSummaryLabel(summary: FormFieldRulesCoverageSummary): string {
    switch (summary) {
        case "complete":
            return "Coverage complete";
        case "partial":
            return "Partial coverage";
        case "unknown":
            return "Coverage unknown";
    }
}

function fieldRulesSummaryClass(summary: FormFieldRulesCoverageSummary): string {
    switch (summary) {
        case "complete":
            return "text-alloy-pine";
        case "partial":
            return "text-amber-900/85";
        default:
            return "text-alloy-midnight/50";
    }
}

function FieldRuleRow({ row }: { row: FormFieldRuleCoverageRow }) {
    return (
        <li className="flex justify-between gap-2 text-[11px]">
            <span className="text-alloy-midnight/75">
                {row.entity_label} · {row.field_label}
                {row.kind === "recommended" ? (
                    <span className="text-alloy-midnight/45"> (recommended)</span>
                ) : null}
            </span>
            <span className={stateClass(row.state)}>{stateLabel(row.state)}</span>
        </li>
    );
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
    linkFormsEnabled = false,
    initialForms,
    initialLinkableForms,
    skipInitialFetch = false,
    onCoverageUpdated,
}: {
    departmentId: string;
    activeStage: LifecycleOperatorStage;
    linkFormsEnabled?: boolean;
    initialForms?: EnrollmentProcessFormCoverageRow[];
    initialLinkableForms?: { id: string; name: string }[];
    /** When true and initialForms provided, skip mount fetch (stage bootstrap). */
    skipInitialFetch?: boolean;
    onCoverageUpdated?: () => void | Promise<void>;
}) {
    const [forms, setForms] = useState<EnrollmentProcessFormCoverageRow[]>(initialForms ?? []);
    const [allForms, setAllForms] = useState<{ id: string; name: string }[]>(initialLinkableForms ?? []);
    const [linkFormId, setLinkFormId] = useState("");
    const [linking, setLinking] = useState(false);
    const [linkFeedback, setLinkFeedback] = useState<string | null>(null);
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
        if (skipInitialFetch && initialForms) {
            setForms(initialForms);
            return;
        }
        void load();
    }, [load, skipInitialFetch, initialForms]);

    useEffect(() => {
        if (initialLinkableForms?.length) {
            setAllForms(initialLinkableForms);
            return;
        }
        if (!linkFormsEnabled) return;
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch("/api/admin/forms", workspaceDataFetchInit());
                const j = (await res.json().catch(() => ({}))) as {
                    data?: { id: string; name: string; is_active?: boolean }[];
                };
                if (!res.ok || cancelled) return;
                setAllForms(
                    (j.data ?? [])
                        .filter((f) => f.is_active !== false)
                        .map((f) => ({ id: f.id, name: f.name }))
                );
            } catch {
                /* optional */
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [linkFormsEnabled, initialLinkableForms]);

    useEffect(() => {
        if (initialForms) setForms(initialForms);
    }, [initialForms]);

    const linkFormToStage = useCallback(async () => {
        if (!linkFormId) return;
        setLinking(true);
        setLinkFeedback(null);
        try {
            const getRes = await fetch(`/api/admin/forms/${encodeURIComponent(linkFormId)}`, workspaceDataFetchInit());
            const existing = (await getRes.json().catch(() => ({}))) as {
                data?: { metadata?: Record<string, unknown> };
                error?: string;
            };
            if (!getRes.ok) throw new Error(existing.error ?? "Failed to load form");
            const prevMeta =
                existing.data?.metadata && typeof existing.data.metadata === "object"
                    ? existing.data.metadata
                    : {};
            const stages = new Set<string>(
                Array.isArray(prevMeta.enrollment_operator_stages)
                    ? (prevMeta.enrollment_operator_stages as unknown[]).map(String)
                    : []
            );
            stages.add(activeStage);
            const res = await fetch(`/api/admin/forms/${encodeURIComponent(linkFormId)}`, {
                ...workspaceDataFetchInit(),
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    metadata: { ...prevMeta, enrollment_operator_stages: [...stages] },
                }),
            });
            const j = (await res.json().catch(() => ({}))) as { error?: string };
            if (!res.ok) throw new Error(j.error ?? "Failed to link form");
            setLinkFeedback("Form linked to this stage.");
            setLinkFormId("");
            await load();
            await onCoverageUpdated?.();
        } catch (e) {
            setLinkFeedback(e instanceof Error ? e.message : "Failed to link form");
        } finally {
            setLinking(false);
        }
    }, [linkFormId, activeStage, load, onCoverageUpdated]);

    const unlinkFormFromStage = useCallback(
        async (formId: string) => {
            setLinking(true);
            setLinkFeedback(null);
            try {
                const getRes = await fetch(`/api/admin/forms/${encodeURIComponent(formId)}`, workspaceDataFetchInit());
                const existing = (await getRes.json().catch(() => ({}))) as {
                    data?: { metadata?: Record<string, unknown> };
                    error?: string;
                };
                if (!getRes.ok) throw new Error(existing.error ?? "Failed to load form");
                const prevMeta =
                    existing.data?.metadata && typeof existing.data.metadata === "object"
                        ? existing.data.metadata
                        : {};
                const stages = (
                    Array.isArray(prevMeta.enrollment_operator_stages)
                        ? (prevMeta.enrollment_operator_stages as unknown[]).map(String)
                        : []
                ).filter((s) => s !== activeStage);
                const res = await fetch(`/api/admin/forms/${encodeURIComponent(formId)}`, {
                    ...workspaceDataFetchInit(),
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        metadata: { ...prevMeta, enrollment_operator_stages: stages },
                    }),
                });
                const j = (await res.json().catch(() => ({}))) as { error?: string };
                if (!res.ok) throw new Error(j.error ?? "Failed to unlink form");
                setLinkFeedback("Form unlinked from this stage.");
                await load();
            } catch (e) {
                setLinkFeedback(e instanceof Error ? e.message : "Failed to unlink form");
            } finally {
                setLinking(false);
            }
        },
        [activeStage, load]
    );

    const linkedFormIds = useMemo(() => new Set(forms.map((f) => f.form_id)), [forms]);
    const linkableForms = allForms.filter((f) => !linkedFormIds.has(f.id));

    if (loading && !forms.length) {
        return <p className="text-xs text-alloy-midnight/50" data-testid="lifecycle-forms-loading">
            Loading forms…
        </p>;
    }
    if (error) {
        return (
            <p className="text-xs text-red-700" role="alert">
                {error}
            </p>
        );
    }

    if (!forms.length && !linkFormsEnabled) {
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
        <div className="space-y-3" data-testid="lifecycle-forms-coverage-card">
            {linkFormsEnabled ? (
                <div className="rounded-md border border-alloy-forge/10 bg-alloy-stone/[0.03] p-2" data-testid="lifecycle-link-form">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/50">
                        Link form to stage
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                        <select
                            className="min-w-[10rem] flex-1 rounded-md border border-alloy-forge/20 bg-white px-2 py-1.5 text-xs"
                            value={linkFormId}
                            onChange={(e) => setLinkFormId(e.target.value)}
                            data-testid="lifecycle-link-form-select"
                        >
                            <option value="">Choose a form…</option>
                            {linkableForms.map((f) => (
                                <option key={f.id} value={f.id}>
                                    {f.name}
                                </option>
                            ))}
                        </select>
                        <button
                            type="button"
                            className="rounded-md bg-alloy-pine px-2 py-1 text-[11px] font-medium text-white hover:bg-alloy-pine/90 disabled:opacity-50"
                            disabled={linking || !linkFormId}
                            onClick={() => void linkFormToStage()}
                            data-testid="lifecycle-link-form-submit"
                        >
                            {linking ? "Linking…" : "Link"}
                        </button>
                    </div>
                    {linkFeedback ? (
                        <p className="mt-1 text-[11px] text-alloy-midnight/60">{linkFeedback}</p>
                    ) : null}
                </div>
            ) : null}
            {!forms.length ? (
                <p className="text-xs text-alloy-midnight/55">No forms linked to this stage yet.</p>
            ) : null}
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
                        <div className="flex flex-col items-end gap-1">
                            <span className="text-[10px] text-alloy-midnight/45">{form.intake_type_label}</span>
                            {linkFormsEnabled ? (
                                <button
                                    type="button"
                                    className="text-[10px] font-medium text-alloy-midnight/50 hover:text-red-800 disabled:opacity-50"
                                    disabled={linking}
                                    onClick={() => void unlinkFormFromStage(form.form_id)}
                                    data-testid={`lifecycle-unlink-form-${form.form_id}`}
                                >
                                    Unlink
                                </button>
                            ) : null}
                        </div>
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
                    {form.field_rule_rows.length ? (
                        <div className="mt-2">
                            <p className={`text-[11px] font-medium ${fieldRulesSummaryClass(form.field_rules_summary)}`}>
                                {fieldRulesSummaryLabel(form.field_rules_summary)}
                            </p>
                            <ul className="mt-1 space-y-0.5" data-testid="enrollment-process-form-field-rules">
                                {form.field_rule_rows.map((row) => (
                                    <FieldRuleRow
                                        key={`${row.entity_label}:${row.field_label}:${row.kind}`}
                                        row={row}
                                    />
                                ))}
                            </ul>
                        </div>
                    ) : form.requirement_rows.length ? (
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
