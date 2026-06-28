"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
    PLATFORM_BUILDER_SHELL,
    PlatformBuilderButton,
    PlatformBuilderCallout,
    PlatformBuilderEmptyState,
    PlatformBuilderListItem,
    PlatformBuilderListPanel,
    PlatformBuilderModal,
    PlatformBuilderStatusBadge,
} from "@/app/adminV2/settings/analytics/platformBuilderUi";
import { MetricFormFields } from "@/app/adminV2/settings/analytics/MetricFormFields";
import {
    METRIC_STATUS_LABELS,
    slugifyMetricKey,
} from "@/app/adminV2/settings/analytics/platformBuilderLabels";
import {
    EMPTY_METRIC_FORM as EMPTY_FORM,
    formToPayload,
    rowToForm,
    type MetricForm,
} from "@/app/adminV2/settings/analytics/metricFormModel";
import { fetchMetricDefinitions, previewMetricDefinition } from "@/lib/metrics/platform/fetchMetricPlatform";
import { copyMetricToOrg, runMetricSnapshots } from "@/lib/metrics/platform/fetchMetricRender";
import {
    deriveMetricCategoryFromSource,
    metricCategoryLabel,
} from "@/lib/metrics/platform/metricCategory";
import { resolveWriteTarget } from "@/lib/metrics/platform/metricWritePlan";
import type { MetricDefinitionRow, MetricEvaluationResult } from "@/lib/metrics/platform/types";
import type { MetricSourceAdapter } from "@/lib/metrics/platform/metricSourceRegistry";

type Props = { canEdit: boolean };

function PreviewPanel({
    preview,
    previewLoading,
    previewError,
    form,
    adapters,
}: {
    preview: MetricEvaluationResult | null;
    previewLoading: boolean;
    previewError: string | null;
    form: MetricForm;
    adapters: MetricSourceAdapter[];
}) {
    const sourceLabel = adapters.find((a) => a.key === form.source_key)?.label ?? form.source_key;
    const noData = preview && preview.value == null;

    if (previewLoading) return <p className="text-sm text-alloy-midnight/55">Running live preview…</p>;
    if (previewError) return <PlatformBuilderCallout tone="warning">{previewError}</PlatformBuilderCallout>;
    if (!preview) return null;

    return (
        <div className="rounded-lg border border-alloy-juniper/25 bg-alloy-juniper/5 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-alloy-juniper">Preview</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-alloy-midnight">{noData ? "No data" : preview.formattedValue}</p>
            <p className="text-xs text-alloy-midnight/60">
                Health: {preview.healthState === "unknown" && noData ? "Not enough data" : preview.healthState}
            </p>
            {noData ?
                <p className="mt-1 text-[11px] text-alloy-midnight/55">No matching records for the last {form.period_days} days.</p>
            :   null}
            <p className="mt-2 text-[10px] text-alloy-midnight/45">{sourceLabel} · Rolling {form.period_days} days · Live preview</p>
        </div>
    );
}

export default function MetricBuilderPanel({ canEdit }: Props) {
    const [items, setItems] = useState<MetricDefinitionRow[]>([]);
    const [adapters, setAdapters] = useState<MetricSourceAdapter[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [form, setForm] = useState<MetricForm>(EMPTY_FORM);
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [workingId, setWorkingId] = useState<string | null>(null);
    const [draftSaved, setDraftSaved] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [preview, setPreview] = useState<MetricEvaluationResult | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewError, setPreviewError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [action, setAction] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const selected = useMemo(() => items.find((i) => i.id === selectedId) ?? null, [items, selectedId]);
    const isGlobal = selected?.org_id == null;
    const fieldsDisabled = !canEdit || (!isEditing && !createModalOpen) || (isGlobal && !isEditing);

    const load = useCallback(async () => {
        setLoading(true);
        const data = await fetchMetricDefinitions();
        setItems((data.items ?? []) as MetricDefinitionRow[]);
        setAdapters((data.adapters ?? []) as MetricSourceAdapter[]);
        setLoading(false);
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    useEffect(() => {
        if (!selected) return;
        setForm(rowToForm(selected));
        setIsEditing(selected.status === "draft");
        setPreview(null);
        setPreviewError(null);
    }, [selected?.id]);

    const patchField = <K extends keyof MetricForm>(key: K, value: MetricForm[K]) => {
        setForm((f) => {
            const next = { ...f, [key]: value };
            if (createModalOpen && key === "label" && !showAdvanced) next.key = slugifyMetricKey(String(value));
            if (key === "source_key") next.category = deriveMetricCategoryFromSource(String(value));
            return next;
        });
    };

    const ensureOrgCopy = async (): Promise<MetricDefinitionRow | null> => {
        if (!selected || selected.org_id != null) return selected;
        const copied = await copyMetricToOrg(selected.id);
        if (!copied?.item) {
            setError("Could not copy template metric to your organization.");
            return null;
        }
        await load();
        const item = copied.item as MetricDefinitionRow;
        setSelectedId(item.id);
        return item;
    };

    const persist = async (status: string, fromModal = false) => {
        if (!canEdit || saving) return;
        setSaving(true);
        setAction(status === "active" ? "publish" : status === "archived" ? "archive" : "save");
        setError(null);
        try {
            // Establish the org-owned id we are writing to. Once known, every save
            // PATCHes it — Save draft then Publish (or a double click) never duplicates.
            let targetId = createModalOpen ? workingId : selectedId;
            if (isGlobal && selected && !createModalOpen) {
                const orgCopy = await ensureOrgCopy();
                if (!orgCopy) return;
                targetId = orgCopy.id;
            }

            const target = resolveWriteTarget(targetId);
            const payload = formToPayload(form, status);
            const res =
                target.method === "POST"
                    ? await fetch("/api/admin/analytics/metrics", {
                          method: "POST",
                          credentials: "include",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify(payload),
                      })
                    : await fetch(`/api/admin/analytics/metrics/${target.id}`, {
                          method: "PATCH",
                          credentials: "include",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify(payload),
                      });

            // API response contract: { ok, data: { item }, correlation_id } / { ok:false, error: { message } }.
            const json = (await res.json().catch(() => null)) as {
                ok?: boolean;
                data?: { item?: MetricDefinitionRow };
                error?: { message?: string };
            } | null;
            if (!res.ok || json?.ok === false) {
                setError(json?.error?.message ?? "Save failed");
                return;
            }
            const item = json?.data?.item;
            if (!item) {
                setError("Save failed");
                return;
            }
            setSelectedId(item.id);
            setWorkingId(item.id);
            setIsEditing(item.status === "draft");
            await load();
            if (status === "active") await runMetricSnapshots({ metric_definition_ids: [item.id] });
            if (fromModal) {
                // Keep the modal open after Save draft so a follow-up Publish updates the
                // same record; close it once published.
                if (status === "active") {
                    setCreateModalOpen(false);
                    setPreview(null);
                } else {
                    setDraftSaved(true);
                }
            } else {
                setCreateModalOpen(false);
            }
        } finally {
            setSaving(false);
            setAction(null);
        }
    };

    const saveChanges = () => void persist(selected?.status ?? "draft");
    const publish = () => void persist("active");
    const unpublish = () => void persist("draft");
    const archive = () => void persist("archived");

    const startEdit = async () => {
        if (isGlobal && selected) {
            const copy = await ensureOrgCopy();
            if (!copy) return;
        }
        setIsEditing(true);
    };

    const cancelEdit = () => {
        if (selected) setForm(rowToForm(selected));
        setIsEditing(false);
        setError(null);
    };

    const runPreview = async () => {
        setPreviewLoading(true);
        setPreviewError(null);
        setPreview(null);
        try {
            let id = selectedId;
            if (isGlobal && selected) {
                const orgCopy = await ensureOrgCopy();
                if (!orgCopy) return;
                id = orgCopy.id;
            }
            if (!id) {
                setPreviewError("Save this calculation first, then preview.");
                return;
            }
            const result = await previewMetricDefinition(id);
            if (!result) {
                setPreviewError("Preview could not run.");
                return;
            }
            setPreview(result);
        } finally {
            setPreviewLoading(false);
        }
    };

    const openCreateModal = () => {
        setForm({ ...EMPTY_FORM, category: deriveMetricCategoryFromSource(EMPTY_FORM.source_key) });
        setPreview(null);
        setPreviewError(null);
        setWorkingId(null);
        setDraftSaved(false);
        setCreateModalOpen(true);
        setSelectedId(null);
        setIsEditing(true);
    };

    const duplicate = () => {
        if (!selected || !canEdit) return;
        setForm({ ...rowToForm(selected), key: `${selected.key}_copy`, label: `${selected.label} (copy)` });
        setWorkingId(null);
        setDraftSaved(false);
        setCreateModalOpen(true);
        setSelectedId(null);
        setIsEditing(true);
    };

    return (
        <div data-metric-builder="true" className={`${PLATFORM_BUILDER_SHELL} p-4`}>
            <div className="mb-3">
                <h3 className="text-sm font-semibold text-alloy-midnight">Calculations</h3>
                <p className="text-xs text-alloy-midnight/55">Define what is measured. Use <strong>+ New metric</strong> above for the full guided flow, or add a calculation here to define just the measurement.</p>
            </div>

            {error ? <PlatformBuilderCallout tone="warning">{error}</PlatformBuilderCallout> : null}

            <div className="grid gap-3 lg:grid-cols-[220px_1fr]">
                <PlatformBuilderListPanel
                    title="Saved metrics"
                    hint="Select to view or edit."
                    emptyTitle="No calculations yet"
                    emptyHint="Create your first metric."
                    loading={loading}
                    itemCount={items.length}
                >
                    {items.map((item) => {
                        const status = METRIC_STATUS_LABELS[item.status] ?? { label: item.status, tone: "neutral" as const };
                        return (
                            <PlatformBuilderListItem
                                key={item.id}
                                selected={selectedId === item.id}
                                onClick={() => setSelectedId(item.id)}
                                title={item.label}
                                meta={metricCategoryLabel(item.category)}
                                badges={
                                    <>
                                        <PlatformBuilderStatusBadge label={status.label} tone={status.tone} />
                                        {item.org_id == null ? <PlatformBuilderStatusBadge label="Template" tone="template" /> : null}
                                    </>
                                }
                            />
                        );
                    })}
                </PlatformBuilderListPanel>

                {selected ?
                    <div className="space-y-3">
                        {isGlobal && !isEditing ?
                            <PlatformBuilderCallout>Template — click Edit to create your org copy.</PlatformBuilderCallout>
                        :   null}

                        <div className="flex flex-wrap items-center gap-2">
                            {!isEditing && canEdit ?
                                <PlatformBuilderButton variant="primary" disabled={saving} onClick={() => void startEdit()}>Edit</PlatformBuilderButton>
                            :   null}
                            {isEditing && canEdit ?
                                <>
                                    <PlatformBuilderButton variant="primary" loading={saving && action === "save"} disabled={saving} onClick={saveChanges}>Save changes</PlatformBuilderButton>
                                    <PlatformBuilderButton disabled={saving} onClick={cancelEdit}>Cancel</PlatformBuilderButton>
                                </>
                            :   null}
                            {canEdit && !isEditing ?
                                <>
                                    <PlatformBuilderButton disabled={saving} onClick={duplicate}>Duplicate</PlatformBuilderButton>
                                    {!isGlobal ?
                                        <PlatformBuilderButton variant="danger" loading={saving && action === "archive"} disabled={saving} onClick={archive}>Archive</PlatformBuilderButton>
                                    :   null}
                                    {selected.status === "draft" ?
                                        <PlatformBuilderButton loading={saving && action === "publish"} disabled={saving} onClick={publish}>Publish</PlatformBuilderButton>
                                    :   selected.status === "active" ?
                                        <PlatformBuilderButton disabled={saving} onClick={unpublish}>Unpublish</PlatformBuilderButton>
                                    :   null}
                                </>
                            :   null}
                            {isEditing && canEdit && selected.status === "draft" ?
                                <PlatformBuilderButton loading={saving && action === "publish"} disabled={saving} onClick={publish}>Publish</PlatformBuilderButton>
                            :   isEditing && canEdit && selected.status === "active" ?
                                <PlatformBuilderButton disabled={saving} onClick={unpublish}>Unpublish</PlatformBuilderButton>
                            :   null}
                            <PlatformBuilderButton loading={previewLoading} loadingLabel="Previewing…" disabled={saving} onClick={() => void runPreview()}>Preview live</PlatformBuilderButton>
                            <button type="button" className="text-[11px] font-semibold text-alloy-juniper" onClick={() => setShowAdvanced((v) => !v)}>
                                {showAdvanced ? "Hide advanced" : "Advanced"}
                            </button>
                        </div>

                        <div className="grid gap-3 xl:grid-cols-[1fr_240px]">
                            <MetricFormFields form={form} patchField={patchField} adapters={adapters} disabled={fieldsDisabled} showAdvanced={showAdvanced} />
                            <PreviewPanel preview={preview} previewLoading={previewLoading} previewError={previewError} form={form} adapters={adapters} />
                        </div>
                    </div>
                : !loading ?
                    <PlatformBuilderEmptyState title="Select a calculation" body="Pick a saved metric or create a new one." action={canEdit ? <PlatformBuilderButton variant="primary" onClick={openCreateModal}>+ New calculation</PlatformBuilderButton> : null} />
                :   null}
            </div>

            <PlatformBuilderModal
                open={createModalOpen}
                title="New calculation"
                subtitle="Name, source, and targets — display style comes next."
                onClose={() => setCreateModalOpen(false)}
                footer={
                    <>
                        {draftSaved ? <span className="mr-auto text-[11px] font-medium text-alloy-juniper">Saved as draft</span> : null}
                        <PlatformBuilderButton disabled={saving} onClick={() => setCreateModalOpen(false)}>Cancel</PlatformBuilderButton>
                        <PlatformBuilderButton loading={saving && action === "save"} disabled={saving} onClick={() => void persist("draft", true)}>Save draft</PlatformBuilderButton>
                        <PlatformBuilderButton variant="primary" loading={saving && action === "publish"} disabled={saving} onClick={() => void persist("active", true)}>Publish</PlatformBuilderButton>
                    </>
                }
            >
                <MetricFormFields form={form} patchField={patchField} adapters={adapters} disabled={false} showAdvanced={showAdvanced} />
            </PlatformBuilderModal>
        </div>
    );
}
