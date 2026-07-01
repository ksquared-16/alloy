"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import SectionCard from "@/components/admin/SectionCard";
import { getQueueDefinitionStoredVersion } from "@/lib/rrs/queue/queueDefinitionV1";
import { getOverviewLayoutConfigStoredVersion } from "@/lib/rrs/overview/overviewLayoutConfigStrict";
import { getFieldDefinitionLockTimestamp } from "@/lib/agent/v2/fieldVisibilityConfigV0";
import { buildFieldVisibilityStructuredOverrideParts } from "@/lib/admin/agentLab/buildAssistantStructuredOverride";
import AgentLabAssistantPanel from "@/components/admin/agentLab/AgentLabAssistantPanel";

type Tab = "queue" | "layout" | "field";

type WorkUnitRow = {
    id: string;
    name?: string | null;
    key?: string | null;
    queue_definition?: unknown;
};

function newRequestIds(): { request_id: string; correlation_id: string } {
    return { request_id: crypto.randomUUID(), correlation_id: crypto.randomUUID() };
}

const DEFAULT_QUEUE_DEFINITION = {
    version: 1,
    entity_type: "job" as const,
    sort: { by: "updated_at" as const, direction: "desc" as const },
    limit: 25,
};

const DEFAULT_OVERVIEW_CONFIG = {
    version: 1,
    header_keys: ["title"],
    bands: [
        {
            band_key: "summary",
            enabled: true,
            items: [{ kind: "system_field", key: "title" }],
        },
    ],
};

function buildQueueStructuredOverride(
    workUnitId: string,
    queueDefinition: unknown,
    expectedVersion: number
): Record<string, unknown> {
    return {
        intent_id: crypto.randomUUID(),
        intent_version: 1,
        intent_type: "update_queue_definition",
        slots: {
            work_unit_id: workUnitId,
            queue_definition: queueDefinition ?? DEFAULT_QUEUE_DEFINITION,
            expected_queue_definition_version: expectedVersion,
        },
    };
}

function buildLayoutStructuredOverride(config: unknown, expectedVersion: number): Record<string, unknown> {
    return {
        intent_id: crypto.randomUUID(),
        intent_version: 1,
        intent_type: "update_record_layout",
        slots: {
            target_kind: "record_overview_layout",
            entity_type: "job",
            surface: "overview",
            config: config ?? DEFAULT_OVERVIEW_CONFIG,
            expected_config_version: expectedVersion,
        },
    };
}

function safeStringify(v: unknown): string {
    try {
        return JSON.stringify(v, null, 2);
    } catch {
        return String(v);
    }
}

export default function AgentConfigLabClient() {
    const [tab, setTab] = useState<Tab>("queue");

    const [ids, setIds] = useState(() => newRequestIds());
    const [message, setMessage] = useState("Agent Config Lab");

    const [workUnits, setWorkUnits] = useState<WorkUnitRow[]>([]);
    const [wuLoading, setWuLoading] = useState(false);
    const [wuError, setWuError] = useState<string | null>(null);
    const [selectedWuId, setSelectedWuId] = useState("");

    const [loadedWu, setLoadedWu] = useState<WorkUnitRow | null>(null);
    const [wuLoadError, setWuLoadError] = useState<string | null>(null);

    const [queueOverrideJson, setQueueOverrideJson] = useState("");

    const [layoutOverrideJson, setLayoutOverrideJson] = useState(() =>
        safeStringify(buildLayoutStructuredOverride(DEFAULT_OVERVIEW_CONFIG, 0))
    );

    const [loadedLayout, setLoadedLayout] = useState<Record<string, unknown> | null>(null);
    const [layoutLoadStatus, setLayoutLoadStatus] = useState<number | null>(null);
    const [layoutLoadError, setLayoutLoadError] = useState<string | null>(null);

    const [fieldEntityType, setFieldEntityType] = useState("job");
    const [fieldDefs, setFieldDefs] = useState<{ id: string; field_key?: string; label?: string | null }[]>([]);
    const [fieldDefsLoading, setFieldDefsLoading] = useState(false);
    const [fieldDefsError, setFieldDefsError] = useState<string | null>(null);
    const [selectedFieldId, setSelectedFieldId] = useState("");
    const [loadedField, setLoadedField] = useState<Record<string, unknown> | null>(null);
    const [fieldLoadError, setFieldLoadError] = useState<string | null>(null);
    const [fieldOverrideJson, setFieldOverrideJson] = useState("");

    const [submitting, setSubmitting] = useState(false);
    const [httpStatus, setHttpStatus] = useState<number | null>(null);
    const [responseBody, setResponseBody] = useState<unknown>(null);
    const [responseError, setResponseError] = useState<string | null>(null);

    const storedQueueVersion = useMemo(
        () => (loadedWu ? getQueueDefinitionStoredVersion(loadedWu.queue_definition) : null),
        [loadedWu]
    );

    const storedLayoutVersion = useMemo(() => {
        if (!loadedLayout) return null;
        const cfg = loadedLayout.config;
        return getOverviewLayoutConfigStoredVersion(cfg);
    }, [loadedLayout]);

    const fieldLockTimestamp = useMemo(() => {
        if (!loadedField) return null;
        return getFieldDefinitionLockTimestamp(loadedField);
    }, [loadedField]);

    const fetchFieldDefinitions = useCallback(async () => {
        setFieldDefsLoading(true);
        setFieldDefsError(null);
        try {
            const res = await fetch(
                `/api/admin/field-definitions?entity_type=${encodeURIComponent(fieldEntityType)}`,
                { credentials: "include" }
            );
            const data = (await res.json()) as { field_definitions?: { id: string; field_key?: string; label?: string | null }[]; error?: string };
            if (!res.ok) {
                setFieldDefsError(data.error ?? `HTTP ${res.status}`);
                setFieldDefs([]);
                return;
            }
            setFieldDefs(Array.isArray(data.field_definitions) ? data.field_definitions : []);
        } catch (e) {
            setFieldDefsError(e instanceof Error ? e.message : "Failed to load field definitions");
            setFieldDefs([]);
        } finally {
            setFieldDefsLoading(false);
        }
    }, [fieldEntityType]);

    const fetchWorkUnits = useCallback(async () => {
        setWuLoading(true);
        setWuError(null);
        try {
            const res = await fetch("/api/admin/work-units", { credentials: "include" });
            const data = (await res.json()) as { items?: WorkUnitRow[]; error?: string };
            if (!res.ok) {
                setWuError(data.error ?? `HTTP ${res.status}`);
                setWorkUnits([]);
                return;
            }
            setWorkUnits(Array.isArray(data.items) ? data.items : []);
        } catch (e) {
            setWuError(e instanceof Error ? e.message : "Failed to load work units");
            setWorkUnits([]);
        } finally {
            setWuLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchWorkUnits();
    }, [fetchWorkUnits]);

    const loadWorkUnitDetail = useCallback(async () => {
        if (!selectedWuId) {
            setLoadedWu(null);
            setWuLoadError("Select a work unit");
            return;
        }
        setWuLoadError(null);
        try {
            const res = await fetch(`/api/admin/work-units/${selectedWuId}`, { credentials: "include" });
            const data = (await res.json()) as WorkUnitRow & { error?: string };
            if (!res.ok) {
                setLoadedWu(null);
                setWuLoadError(data.error ?? `HTTP ${res.status}`);
                return;
            }
            setLoadedWu(data);
        } catch (e) {
            setLoadedWu(null);
            setWuLoadError(e instanceof Error ? e.message : "Load failed");
        }
    }, [selectedWuId]);

    const fillQueueTemplateFromLoaded = useCallback(() => {
        if (!selectedWuId.trim()) {
            setWuLoadError("Select a work unit first");
            return;
        }
        if (!loadedWu || loadedWu.id !== selectedWuId) {
            setWuLoadError("Click “Load selected” after choosing the work unit so the template uses that row.");
            return;
        }
        const qd = loadedWu.queue_definition;
        const v = getQueueDefinitionStoredVersion(qd);
        setQueueOverrideJson(
            safeStringify(buildQueueStructuredOverride(loadedWu.id, qd ?? DEFAULT_QUEUE_DEFINITION, v))
        );
        setIds(newRequestIds());
        setWuLoadError(null);
    }, [selectedWuId, loadedWu]);

    const loadRecordOverviewLayout = useCallback(async () => {
        setLayoutLoadError(null);
        setLoadedLayout(null);
        setLayoutLoadStatus(null);
        try {
            const res = await fetch(
                "/api/admin/record-overview-layouts?entity_type=job&surface=overview",
                { credentials: "include" }
            );
            setLayoutLoadStatus(res.status);
            const data = (await res.json()) as { layout?: Record<string, unknown>; error?: string; message?: string };
            if (!res.ok) {
                setLayoutLoadError(data.error ?? data.message ?? `HTTP ${res.status}`);
                return;
            }
            setLoadedLayout((data.layout as Record<string, unknown>) ?? null);
        } catch (e) {
            setLayoutLoadError(e instanceof Error ? e.message : "Load failed");
        }
    }, []);

    const fillLayoutTemplateFromLoaded = useCallback(() => {
        if (layoutLoadStatus === 404 || !loadedLayout) {
            setLayoutOverrideJson(safeStringify(buildLayoutStructuredOverride(DEFAULT_OVERVIEW_CONFIG, 0)));
        } else {
            const cfg = loadedLayout.config;
            const v = getOverviewLayoutConfigStoredVersion(cfg);
            setLayoutOverrideJson(safeStringify(buildLayoutStructuredOverride(cfg ?? DEFAULT_OVERVIEW_CONFIG, v)));
        }
        setIds(newRequestIds());
    }, [loadedLayout, layoutLoadStatus]);

    useEffect(() => {
        void loadRecordOverviewLayout();
    }, [loadRecordOverviewLayout]);

    useEffect(() => {
        if (tab === "field") {
            void fetchFieldDefinitions();
        }
    }, [tab, fetchFieldDefinitions]);

    const loadFieldDetail = useCallback(async () => {
        if (!selectedFieldId) {
            setLoadedField(null);
            setFieldLoadError("Select a field");
            return;
        }
        setFieldLoadError(null);
        try {
            const res = await fetch(`/api/admin/field-definitions/${selectedFieldId}`, { credentials: "include" });
            const data = (await res.json()) as Record<string, unknown> & { error?: string };
            if (!res.ok) {
                setLoadedField(null);
                setFieldLoadError(data.error ?? `HTTP ${res.status}`);
                return;
            }
            setLoadedField(data);
        } catch (e) {
            setLoadedField(null);
            setFieldLoadError(e instanceof Error ? e.message : "Load failed");
        }
    }, [selectedFieldId]);

    const fillFieldTemplateFromLoaded = useCallback(() => {
        if (!selectedFieldId.trim()) {
            setFieldLoadError("Select a field first");
            return;
        }
        if (!loadedField || String(loadedField.id) !== selectedFieldId) {
            setFieldLoadError("Click “Load selected” after choosing the field so the template uses that row’s id and lock timestamp.");
            return;
        }
        const lock = getFieldDefinitionLockTimestamp(loadedField);
        if (!lock) {
            setFieldLoadError("Load the field first — need updated_at (or created_at) for lock");
            return;
        }
        setFieldOverrideJson(
            safeStringify(
                buildFieldVisibilityStructuredOverrideParts(String(loadedField.id), lock, {
                    is_visible_in_table: true,
                })
            )
        );
        setIds(newRequestIds());
        setFieldLoadError(null);
    }, [selectedFieldId, loadedField]);

    const submitQueue = async () => {
        if (!queueOverrideJson.trim()) {
            setResponseError("Paste JSON or click Prefill template first.");
            setHttpStatus(null);
            setResponseBody(null);
            return;
        }
        let structured_override: unknown;
        try {
            structured_override = JSON.parse(queueOverrideJson) as unknown;
        } catch (e) {
            setResponseError(`structured_override JSON: ${e instanceof Error ? e.message : "parse error"}`);
            setHttpStatus(null);
            setResponseBody(null);
            return;
        }
        setSubmitting(true);
        setResponseError(null);
        setHttpStatus(null);
        setResponseBody(null);
        try {
            const res = await fetch("/api/admin/agent/v0/queue-definition", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    request_id: ids.request_id,
                    correlation_id: ids.correlation_id,
                    message,
                    structured_override,
                }),
            });
            setHttpStatus(res.status);
            const json = (await res.json()) as unknown;
            setResponseBody(json);
        } catch (e) {
            setResponseError(e instanceof Error ? e.message : "Request failed");
        } finally {
            setSubmitting(false);
        }
    };

    const submitLayout = async () => {
        if (!layoutOverrideJson.trim()) {
            setResponseError("Paste JSON or click Prefill template first.");
            setHttpStatus(null);
            setResponseBody(null);
            return;
        }
        let structured_override: unknown;
        try {
            structured_override = JSON.parse(layoutOverrideJson) as unknown;
        } catch (e) {
            setResponseError(`structured_override JSON: ${e instanceof Error ? e.message : "parse error"}`);
            setHttpStatus(null);
            setResponseBody(null);
            return;
        }
        setSubmitting(true);
        setResponseError(null);
        setHttpStatus(null);
        setResponseBody(null);
        try {
            const res = await fetch("/api/admin/agent/v1/record-overview-layout", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    request_id: ids.request_id,
                    correlation_id: ids.correlation_id,
                    message,
                    structured_override,
                }),
            });
            setHttpStatus(res.status);
            const json = (await res.json()) as unknown;
            setResponseBody(json);
        } catch (e) {
            setResponseError(e instanceof Error ? e.message : "Request failed");
        } finally {
            setSubmitting(false);
        }
    };

    const submitFieldVisibility = async () => {
        if (!fieldOverrideJson.trim()) {
            setResponseError("Paste JSON or click Prefill template first.");
            setHttpStatus(null);
            setResponseBody(null);
            return;
        }
        let structured_override: unknown;
        try {
            structured_override = JSON.parse(fieldOverrideJson) as unknown;
        } catch (e) {
            setResponseError(`structured_override JSON: ${e instanceof Error ? e.message : "parse error"}`);
            setHttpStatus(null);
            setResponseBody(null);
            return;
        }
        setSubmitting(true);
        setResponseError(null);
        setHttpStatus(null);
        setResponseBody(null);
        try {
            const res = await fetch("/api/admin/agent/v2/field-visibility", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    request_id: ids.request_id,
                    correlation_id: ids.correlation_id,
                    message,
                    structured_override,
                }),
            });
            setHttpStatus(res.status);
            const json = (await res.json()) as unknown;
            setResponseBody(json);
        } catch (e) {
            setResponseError(e instanceof Error ? e.message : "Request failed");
        } finally {
            setSubmitting(false);
        }
    };

    const summary = useMemo(() => {
        if (!responseBody || typeof responseBody !== "object" || responseBody === null) return null;
        const r = responseBody as Record<string, unknown>;
        const ok = r.ok === true;
        const exec = r.execution as Record<string, unknown> | undefined;
        const err = r.error as { error_code?: string; message?: string } | undefined;
        const step0 = Array.isArray(exec?.per_step) ? (exec!.per_step as Record<string, unknown>[])[0] : undefined;
        return {
            ok,
            proposal_id: exec?.proposal_id,
            result_id: exec?.result_id,
            applied_queue_definition_version: step0?.applied_queue_definition_version,
            applied_config_version: step0?.applied_config_version,
            applied_updated_at: step0?.applied_updated_at,
            terminal_status: exec?.terminal_status,
            error_code: err?.error_code,
            error_message: err?.message,
        };
    }, [responseBody]);

    return (
        <div className="max-w-5xl mx-auto px-4 py-8 pb-16">
            <AdminPageHeader
                title="Agent Config Lab"
                subtitle="Internal testing only — exercises agent config POST routes (no LLM). Not production assistant UX."
            />

            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-950">
                <strong className="font-semibold">Guardrails:</strong> Admin-only page. Server must enable{" "}
                <code className="rounded bg-amber-100 px-1">AGENT_V0_ENABLED</code> /{" "}
                <code className="rounded bg-amber-100 px-1">AGENT_V1_RECORD_LAYOUT_ENABLED</code> /{" "}
                <code className="rounded bg-amber-100 px-1">AGENT_V2_FIELD_VISIBILITY_ENABLED</code> for the matching
                POST. This UI does not mutate global <code className="rounded bg-amber-100 px-1">record_layouts</code> or
                entity record data. Checkpoint:{" "}
                <code className="rounded bg-amber-100 px-1">docs/implementation/ai-agent-foundation-checkpoint.md</code>
            </div>

            <div className="mb-6">
                <AgentLabAssistantPanel
                    message={message}
                    ids={ids}
                    setIds={setIds}
                    newRequestIds={newRequestIds}
                    setResponseBody={setResponseBody}
                    setHttpStatus={setHttpStatus}
                    setResponseError={setResponseError}
                    setSubmitting={setSubmitting}
                />
            </div>

            <div className="flex gap-2 border-b border-admin-border mb-4">
                <button
                    type="button"
                    onClick={() => {
                        setTab("queue");
                        setResponseBody(null);
                        setHttpStatus(null);
                        setResponseError(null);
                    }}
                    className={`px-4 py-2 text-sm font-medium rounded-t-md border-b-2 -mb-px ${
                        tab === "queue"
                            ? "border-alloy-blue text-alloy-forge bg-admin-surface-card"
                            : "border-transparent text-alloy-muted hover:text-alloy-forge"
                    }`}
                >
                    A. Queue definition (v0)
                </button>
                <button
                    type="button"
                    onClick={() => {
                        setTab("layout");
                        setResponseBody(null);
                        setHttpStatus(null);
                        setResponseError(null);
                    }}
                    className={`px-4 py-2 text-sm font-medium rounded-t-md border-b-2 -mb-px ${
                        tab === "layout"
                            ? "border-alloy-blue text-alloy-forge bg-admin-surface-card"
                            : "border-transparent text-alloy-muted hover:text-alloy-forge"
                    }`}
                >
                    B. Record overview layout (v1)
                </button>
                <button
                    type="button"
                    onClick={() => {
                        setTab("field");
                        setResponseBody(null);
                        setHttpStatus(null);
                        setResponseError(null);
                    }}
                    className={`px-4 py-2 text-sm font-medium rounded-t-md border-b-2 -mb-px ${
                        tab === "field"
                            ? "border-alloy-blue text-alloy-forge bg-admin-surface-card"
                            : "border-transparent text-alloy-muted hover:text-alloy-forge"
                    }`}
                >
                    C. Field visibility (v2)
                </button>
            </div>

            <div className="mb-6 rounded-lg border border-admin-border bg-admin-page/80 px-4 py-3 text-sm text-alloy-forge">
                <span className="font-semibold text-alloy-muted">Current tab — </span>
                {tab === "queue" && (
                    <>
                        Work unit selected: <code className="text-xs">{selectedWuId || "—"}</code>
                        {loadedWu && (
                            <>
                                {" "}
                                · Loaded id matches:{" "}
                                <strong>{loadedWu.id === selectedWuId ? "yes" : "no — click Load selected"}</strong> ·
                                queue_definition version: <strong>{storedQueueVersion ?? "—"}</strong>
                            </>
                        )}
                    </>
                )}
                {tab === "layout" && (
                    <>
                        Overview layout HTTP: <strong>{layoutLoadStatus ?? "—"}</strong>
                        {loadedLayout && (
                            <>
                                {" "}
                                · config version: <strong>{storedLayoutVersion ?? "—"}</strong>
                            </>
                        )}
                    </>
                )}
                {tab === "field" && (
                    <>
                        entity_type <code className="text-xs">{fieldEntityType}</code> · field selected:{" "}
                        <code className="text-xs">{selectedFieldId || "—"}</code>
                        {loadedField && (
                            <>
                                {" "}
                                · Loaded id matches:{" "}
                                <strong>{String(loadedField.id) === selectedFieldId ? "yes" : "no — click Load selected"}</strong>{" "}
                                · lock: <code className="text-xs break-all">{fieldLockTimestamp ?? "—"}</code>
                            </>
                        )}
                    </>
                )}
            </div>

            <SectionCard title="Request envelope (shared)">
                <div className="space-y-3">
                    <label className="block text-xs font-medium text-alloy-muted">
                        message
                        <input
                            className="mt-1 w-full rounded border border-admin-border px-2 py-1.5 text-sm font-mono"
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                        />
                    </label>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block text-xs font-medium text-alloy-muted">
                            request_id (UUID)
                            <input
                                className="mt-1 w-full rounded border border-admin-border px-2 py-1.5 text-sm font-mono"
                                value={ids.request_id}
                                onChange={(e) => setIds((p) => ({ ...p, request_id: e.target.value }))}
                            />
                        </label>
                        <label className="block text-xs font-medium text-alloy-muted">
                            correlation_id (UUID)
                            <input
                                className="mt-1 w-full rounded border border-admin-border px-2 py-1.5 text-sm font-mono"
                                value={ids.correlation_id}
                                onChange={(e) => setIds((p) => ({ ...p, correlation_id: e.target.value }))}
                            />
                        </label>
                    </div>
                    <button
                        type="button"
                        onClick={() => setIds(newRequestIds())}
                        className="rounded-md border border-admin-border bg-white px-3 py-1.5 text-xs font-medium text-alloy-forge hover:bg-admin-page"
                    >
                        New request_id / correlation_id
                    </button>
                </div>
            </SectionCard>

            {tab === "queue" && (
                <div className="mt-6 space-y-6">
                    <SectionCard title="Load current state (GET)">
                        <p className="mb-3 text-sm text-alloy-muted">
                            <code className="rounded bg-admin-page px-1">GET /api/admin/work-units</code> and{" "}
                            <code className="rounded bg-admin-page px-1">GET /api/admin/work-units/[id]</code>
                        </p>
                        <div className="flex flex-wrap items-end gap-3">
                            <label className="text-xs font-medium text-alloy-muted">
                                Work unit
                                <select
                                    className="mt-1 block min-w-[240px] rounded border border-admin-border px-2 py-1.5 text-sm"
                                    value={selectedWuId}
                                    onChange={(e) => setSelectedWuId(e.target.value)}
                                >
                                    <option value="">— select —</option>
                                    {workUnits.map((w) => (
                                        <option key={w.id} value={w.id}>
                                            {(w.name || w.key || w.id).slice(0, 60)} ({w.id.slice(0, 8)}…)
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <button
                                type="button"
                                onClick={() => void fetchWorkUnits()}
                                disabled={wuLoading}
                                className="rounded-md border border-admin-border bg-white px-3 py-1.5 text-sm"
                            >
                                {wuLoading ? "Refreshing…" : "Refresh list"}
                            </button>
                            <button
                                type="button"
                                onClick={() => void loadWorkUnitDetail()}
                                className="rounded-md bg-alloy-blue px-3 py-1.5 text-sm font-medium text-white"
                            >
                                Load selected
                            </button>
                        </div>
                        {wuError && <p className="mt-2 text-sm text-red-600">{wuError}</p>}
                        {wuLoadError && <p className="mt-2 text-sm text-amber-800">{wuLoadError}</p>}
                        {loadedWu && (
                            <div className="mt-4 rounded border border-admin-border/80 bg-admin-page p-3 text-sm">
                                <p>
                                    <span className="text-alloy-muted">Stored queue_definition version:</span>{" "}
                                    <strong>{storedQueueVersion ?? "—"}</strong>
                                </p>
                                <p className="mt-1 text-xs text-alloy-muted break-all">id: {loadedWu.id}</p>
                            </div>
                        )}
                    </SectionCard>

                    <SectionCard title="structured_override → POST /api/admin/agent/v0/queue-definition">
                        <div className="mb-2 flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={fillQueueTemplateFromLoaded}
                                className="rounded-md border border-admin-border bg-white px-3 py-1.5 text-xs font-medium"
                            >
                                Prefill template from loaded work unit
                            </button>
                        </div>
                        <textarea
                            className="w-full min-h-[280px] rounded border border-admin-border p-3 font-mono text-xs leading-relaxed"
                            spellCheck={false}
                            placeholder='Click "Prefill template from loaded work unit" or paste JSON.'
                            value={queueOverrideJson}
                            onChange={(e) => setQueueOverrideJson(e.target.value)}
                        />
                        <button
                            type="button"
                            disabled={submitting}
                            onClick={() => void submitQueue()}
                            className="mt-3 rounded-md bg-alloy-midnight px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                        >
                            {submitting ? "Submitting…" : "Submit queue definition"}
                        </button>
                    </SectionCard>
                </div>
            )}

            {tab === "layout" && (
                <div className="mt-6 space-y-6">
                    <SectionCard title="Load current state (GET)">
                        <p className="mb-3 text-sm text-alloy-muted">
                            <code className="rounded bg-admin-page px-1">
                                GET /api/admin/record-overview-layouts?entity_type=job&amp;surface=overview
                            </code>
                        </p>
                        <button
                            type="button"
                            onClick={() => void loadRecordOverviewLayout()}
                            className="rounded-md border border-admin-border bg-white px-3 py-1.5 text-sm"
                        >
                            Reload layout
                        </button>
                        {layoutLoadStatus != null && (
                            <p className="mt-2 text-sm">
                                Last load HTTP: <strong>{layoutLoadStatus}</strong>
                            </p>
                        )}
                        {layoutLoadError && <p className="mt-2 text-sm text-amber-800">{layoutLoadError}</p>}
                        {loadedLayout && (
                            <div className="mt-4 rounded border border-admin-border/80 bg-admin-page p-3 text-sm">
                                <p>
                                    <span className="text-alloy-muted">Stored config version:</span>{" "}
                                    <strong>{storedLayoutVersion ?? "—"}</strong>
                                </p>
                                <p className="mt-1 text-xs text-alloy-muted break-all">id: {String(loadedLayout.id)}</p>
                            </div>
                        )}
                    </SectionCard>

                    <SectionCard title="structured_override → POST /api/admin/agent/v1/record-overview-layout">
                        <p className="mb-2 text-xs text-alloy-muted">
                            Use <code className="rounded bg-admin-page px-1">entity_type: &quot;job&quot;</code> in slots
                            (not <code className="rounded bg-admin-page px-1">jobs</code>). request_id / correlation_id
                            must be valid UUIDs (use “New request ids” above).
                        </p>
                        <div className="mb-2 flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={fillLayoutTemplateFromLoaded}
                                className="rounded-md border border-admin-border bg-white px-3 py-1.5 text-xs font-medium"
                            >
                                Prefill template from loaded layout (or default if 404)
                            </button>
                        </div>
                        <textarea
                            className="w-full min-h-[320px] rounded border border-admin-border p-3 font-mono text-xs leading-relaxed"
                            spellCheck={false}
                            placeholder="Prefill from loaded layout or paste structured_override JSON."
                            value={layoutOverrideJson}
                            onChange={(e) => setLayoutOverrideJson(e.target.value)}
                        />
                        <button
                            type="button"
                            disabled={submitting}
                            onClick={() => void submitLayout()}
                            className="mt-3 rounded-md bg-alloy-midnight px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                        >
                            {submitting ? "Submitting…" : "Submit record overview layout"}
                        </button>
                    </SectionCard>
                </div>
            )}

            {tab === "field" && (
                <div className="mt-6 space-y-6">
                    <SectionCard title="Load current state (GET)">
                        <p className="mb-3 text-sm text-alloy-muted">
                            <code className="rounded bg-admin-page px-1">GET /api/admin/field-definitions?entity_type=…</code>{" "}
                            and <code className="rounded bg-admin-page px-1">GET /api/admin/field-definitions/[id]</code>
                        </p>
                        <div className="flex flex-wrap items-end gap-3">
                            <label className="text-xs font-medium text-alloy-muted">
                                entity_type
                                <select
                                    className="mt-1 block min-w-[140px] rounded border border-admin-border px-2 py-1.5 text-sm"
                                    value={fieldEntityType}
                                    onChange={(e) => {
                                        setFieldEntityType(e.target.value);
                                        setSelectedFieldId("");
                                        setLoadedField(null);
                                    }}
                                >
                                    {["person", "customer", "job", "opportunity", "vendor", "schedule", "location"].map(
                                        (et) => (
                                            <option key={et} value={et}>
                                                {et}
                                            </option>
                                        )
                                    )}
                                </select>
                            </label>
                            <label className="text-xs font-medium text-alloy-muted">
                                Field
                                <select
                                    className="mt-1 block min-w-[260px] rounded border border-admin-border px-2 py-1.5 text-sm"
                                    value={selectedFieldId}
                                    onChange={(e) => setSelectedFieldId(e.target.value)}
                                >
                                    <option value="">— select —</option>
                                    {fieldDefs.map((f) => (
                                        <option key={f.id} value={f.id}>
                                            {(f.field_key || f.label || f.id).slice(0, 48)} ({f.id.slice(0, 8)}…)
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <button
                                type="button"
                                onClick={() => void fetchFieldDefinitions()}
                                disabled={fieldDefsLoading}
                                className="rounded-md border border-admin-border bg-white px-3 py-1.5 text-sm"
                            >
                                {fieldDefsLoading ? "Refreshing…" : "Refresh list"}
                            </button>
                            <button
                                type="button"
                                onClick={() => void loadFieldDetail()}
                                className="rounded-md bg-alloy-blue px-3 py-1.5 text-sm font-medium text-white"
                            >
                                Load selected
                            </button>
                        </div>
                        {fieldDefsError && <p className="mt-2 text-sm text-red-600">{fieldDefsError}</p>}
                        {fieldLoadError && <p className="mt-2 text-sm text-amber-800">{fieldLoadError}</p>}
                        {loadedField && (
                            <div className="mt-4 rounded border border-admin-border/80 bg-admin-page p-3 text-sm space-y-1">
                                <p>
                                    <span className="text-alloy-muted">Lock timestamp (expected_updated_at):</span>{" "}
                                    <strong className="break-all">{fieldLockTimestamp ?? "—"}</strong>
                                </p>
                                <p className="text-xs text-alloy-muted break-all">id: {String(loadedField.id)}</p>
                            </div>
                        )}
                    </SectionCard>

                    <SectionCard title="structured_override → POST /api/admin/agent/v2/field-visibility">
                        <p className="mb-2 text-xs text-alloy-muted">
                            Prefill loads <code className="rounded bg-admin-page px-1">expected_updated_at</code> from the
                            row. After a successful apply, reload the field to get a new lock timestamp.
                        </p>
                        <div className="mb-2 flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={fillFieldTemplateFromLoaded}
                                className="rounded-md border border-admin-border bg-white px-3 py-1.5 text-xs font-medium"
                            >
                                Prefill template from loaded field
                            </button>
                        </div>
                        <textarea
                            className="w-full min-h-[300px] rounded border border-admin-border p-3 font-mono text-xs leading-relaxed"
                            spellCheck={false}
                            placeholder="Prefill from loaded field or paste structured_override JSON."
                            value={fieldOverrideJson}
                            onChange={(e) => setFieldOverrideJson(e.target.value)}
                        />
                        <button
                            type="button"
                            disabled={submitting}
                            onClick={() => void submitFieldVisibility()}
                            className="mt-3 rounded-md bg-alloy-midnight px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                        >
                            {submitting ? "Submitting…" : "Submit field visibility"}
                        </button>
                    </SectionCard>
                </div>
            )}

            <SectionCard title="Last response">
                {responseError && <p className="mb-2 text-sm text-red-600">{responseError}</p>}
                {httpStatus != null && (
                    <p className="mb-2 text-sm">
                        HTTP status:{" "}
                        <strong
                            className={
                                httpStatus >= 200 && httpStatus < 300
                                    ? "text-green-800"
                                    : httpStatus === 409
                                      ? "text-amber-800"
                                      : "text-red-800"
                            }
                        >
                            {httpStatus}
                        </strong>
                    </p>
                )}
                {summary && (
                    <div
                        className={`mb-3 rounded border p-3 text-sm space-y-1 ${
                            summary.ok
                                ? "border-green-300 bg-green-50/90 border-l-4 border-l-green-600"
                                : "border-red-200 bg-red-50/80 border-l-4 border-l-red-500"
                        }`}
                    >
                        <p>
                            ok: <strong>{String(summary.ok)}</strong>
                        </p>
                        {summary.proposal_id != null && (
                            <p>
                                proposal_id: <code className="text-xs break-all">{String(summary.proposal_id)}</code>
                            </p>
                        )}
                        {summary.result_id != null && (
                            <p>
                                result_id: <code className="text-xs break-all">{String(summary.result_id)}</code>
                            </p>
                        )}
                        {summary.applied_queue_definition_version != null && (
                            <p>applied_queue_definition_version: {String(summary.applied_queue_definition_version)}</p>
                        )}
                        {summary.applied_config_version != null && (
                            <p>applied_config_version: {String(summary.applied_config_version)}</p>
                        )}
                        {summary.applied_updated_at != null && (
                            <p className="break-all">
                                applied_updated_at: {String(summary.applied_updated_at)}
                            </p>
                        )}
                        {summary.terminal_status != null && <p>terminal_status: {String(summary.terminal_status)}</p>}
                        {!summary.ok && summary.error_code && (
                            <p className="text-red-700">
                                {summary.error_code}: {summary.error_message}
                            </p>
                        )}
                    </div>
                )}
                <pre className="max-h-[420px] overflow-auto rounded border border-admin-border bg-white p-3 text-xs font-mono whitespace-pre-wrap">
                    {responseBody != null ? safeStringify(responseBody) : "—"}
                </pre>
            </SectionCard>
        </div>
    );
}
