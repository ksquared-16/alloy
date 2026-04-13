"use client";

import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import SectionCard from "@/components/admin/SectionCard";
import { parseAssistantCommand } from "@/lib/admin/agentLab/parseAssistantCommand";
import { resolveFieldDefinitionByQuery, type FieldDefListItem } from "@/lib/admin/agentLab/resolveFieldDefinitionByQuery";
import { buildAssistantPayload } from "@/lib/admin/agentLab/buildAssistantStructuredOverride";
import { getFieldDefinitionLockTimestamp } from "@/lib/agent/v2/fieldVisibilityConfigV0";
import type { JobOverviewPlannerFailure, JobOverviewPlannerSuccess } from "@/lib/agent/planner/jobOverviewPlannerTypes";

function assistantPanelEnabled(): boolean {
    const v = process.env.NEXT_PUBLIC_AGENT_LAB_ASSISTANT_ENABLED?.trim().toLowerCase();
    if (v === "false" || v === "0") return false;
    return true;
}

type Props = {
    message: string;
    ids: { request_id: string; correlation_id: string };
    setIds: Dispatch<SetStateAction<{ request_id: string; correlation_id: string }>>;
    newRequestIds: () => { request_id: string; correlation_id: string };
    setResponseBody: (v: unknown) => void;
    setHttpStatus: (v: number | null) => void;
    setResponseError: (v: string | null) => void;
    setSubmitting: (v: boolean) => void;
};

export default function AgentLabAssistantPanel(props: Props) {
    const { message, ids, setIds, newRequestIds, setResponseBody, setHttpStatus, setResponseError, setSubmitting } = props;

    const [command, setCommand] = useState("");
    const [entityType, setEntityType] = useState("job");
    const [previewJson, setPreviewJson] = useState("");
    const [previewRoute, setPreviewRoute] = useState<"v1" | "v2" | null>(null);
    const [previewLabel, setPreviewLabel] = useState<string | null>(null);
    const [parseNote, setParseNote] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [semanticPlannerOk, setSemanticPlannerOk] = useState<JobOverviewPlannerSuccess | null>(null);
    const [semanticPlannerErr, setSemanticPlannerErr] = useState<JobOverviewPlannerFailure | null>(null);

    const runPreview = useCallback(async () => {
        setParseNote(null);
        setPreviewRoute(null);
        setPreviewLabel(null);
        setPreviewJson("");
        setSemanticPlannerOk(null);
        setSemanticPlannerErr(null);

        const parsed = parseAssistantCommand(command);
        if (!parsed.ok) {
            setParseNote(parsed.error);
            return;
        }

        if (
            parsed.parsed.kind === "overview_financial" ||
            parsed.parsed.kind === "overview_layout_semantic"
        ) {
            setBusy(true);
            try {
                const res = await fetch(
                    "/api/admin/record-overview-layouts?entity_type=job&surface=overview",
                    { credentials: "include" }
                );
                const data = (await res.json()) as { layout?: { config?: unknown }; error?: string; message?: string };
                if (!res.ok) {
                    setParseNote(data.error ?? data.message ?? `HTTP ${res.status} — load overview layout first (tab B).`);
                    return;
                }
                const cfg = data.layout?.config;
                const built = buildAssistantPayload(parsed.parsed, {
                    fieldDefinitionId: "",
                    expectedUpdatedAt: "",
                    overviewConfigRaw: cfg ?? {},
                });
                if (!built.ok) {
                    const plannerFailure =
                        "semanticPlannerFailure" in built ? built.semanticPlannerFailure ?? null : null;
                    setSemanticPlannerErr(plannerFailure);
                    setParseNote(built.error);
                    return;
                }
                const payload = built.payload;
                const semanticPlanner =
                    "semanticPlanner" in payload ? payload.semanticPlanner ?? null : null;
                setPreviewRoute("v1");
                setPreviewLabel(payload.label);
                setPreviewJson(JSON.stringify(payload.structured_override, null, 2));
                setSemanticPlannerOk(semanticPlanner);
                setSemanticPlannerErr(null);
                setParseNote(
                    semanticPlanner
                        ? "Semantic planner preview ready — review rationale and JSON, then Apply."
                        : "Preview ready — review JSON, then Apply."
                );
            } catch (e) {
                setParseNote(e instanceof Error ? e.message : "Request failed");
            } finally {
                setBusy(false);
            }
            return;
        }

        setBusy(true);
        try {
            const res = await fetch(`/api/admin/field-definitions?entity_type=${encodeURIComponent(entityType)}`, {
                credentials: "include",
            });
            const data = (await res.json()) as { field_definitions?: FieldDefListItem[]; error?: string };
            if (!res.ok) {
                setParseNote(data.error ?? `HTTP ${res.status}`);
                return;
            }
            const list = Array.isArray(data.field_definitions) ? data.field_definitions : [];
            const q = parsed.parsed.labelQuery;
            const resolved = resolveFieldDefinitionByQuery(list, q);
            if (!resolved.ok) {
                setParseNote(resolved.error);
                return;
            }
            const fdRes = await fetch(`/api/admin/field-definitions/${resolved.match.id}`, { credentials: "include" });
            const fdRow = (await fdRes.json()) as Record<string, unknown> & { error?: string };
            if (!fdRes.ok) {
                setParseNote(fdRow.error ?? `HTTP ${fdRes.status}`);
                return;
            }
            const lock = getFieldDefinitionLockTimestamp(fdRow);
            if (!lock) {
                setParseNote("Field row has no updated_at/created_at — cannot lock.");
                return;
            }
            const built = buildAssistantPayload(parsed.parsed, {
                fieldDefinitionId: String(fdRow.id),
                expectedUpdatedAt: lock,
                overviewConfigRaw: {},
            });
            if (!built.ok) {
                setParseNote(built.error);
                return;
            }
            setPreviewRoute("v2");
            setPreviewLabel(built.payload.label);
            setPreviewJson(JSON.stringify(built.payload.structured_override, null, 2));
            setSemanticPlannerOk(null);
            setSemanticPlannerErr(null);
            setParseNote(`Matched field: ${resolved.match.field_key ?? resolved.match.id} — review JSON, then Apply.`);
        } catch (e) {
            setParseNote(e instanceof Error ? e.message : "Request failed");
        } finally {
            setBusy(false);
        }
    }, [command, entityType]);

    const applyPreview = async () => {
        let structured_override: unknown;
        try {
            structured_override = JSON.parse(previewJson) as unknown;
        } catch (e) {
            setParseNote(`Invalid JSON: ${e instanceof Error ? e.message : "parse error"}`);
            return;
        }
        setSubmitting(true);
        setResponseError(null);
        setHttpStatus(null);
        setResponseBody(null);
        const url =
            previewRoute === "v1"
                ? "/api/admin/agent/v1/record-overview-layout"
                : previewRoute === "v2"
                  ? "/api/admin/agent/v2/field-visibility"
                  : null;
        if (!url) {
            setParseNote("No preview — run Preview command first.");
            setSubmitting(false);
            return;
        }
        try {
            const res = await fetch(url, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    request_id: ids.request_id,
                    correlation_id: ids.correlation_id,
                    message: message.trim() || "Agent Lab assistant",
                    structured_override,
                }),
            });
            setHttpStatus(res.status);
            setResponseBody((await res.json()) as unknown);
        } catch (e) {
            setResponseError(e instanceof Error ? e.message : "Request failed");
        } finally {
            setSubmitting(false);
        }
    };

    if (!assistantPanelEnabled()) {
        return null;
    }

    return (
        <SectionCard title="Deterministic assistant (internal)">
            <p className="mb-3 text-xs text-alloy-muted leading-relaxed">
                No LLM. Field commands use regex; job overview also supports a{" "}
                <strong className="font-medium text-alloy-forge">semantic layout planner</strong> (deterministic catalog +
                rules) for richer overview phrases. Preview fills{" "}
                <code className="rounded bg-admin-page px-1">structured_override</code> for the existing v1/v2 agent routes.
                Edit the JSON if needed before Apply.
            </p>
            <div className="grid gap-3 sm:grid-cols-2 mb-3">
                <label className="block text-xs font-medium text-alloy-muted">
                    Entity type (field commands only)
                    <select
                        className="mt-1 w-full rounded border border-admin-border px-2 py-1.5 text-sm"
                        value={entityType}
                        onChange={(e) => setEntityType(e.target.value)}
                    >
                        {["person", "customer", "job", "opportunity", "vendor", "schedule", "location"].map((et) => (
                            <option key={et} value={et}>
                                {et}
                            </option>
                        ))}
                    </select>
                </label>
            </div>
            <label className="block text-xs font-medium text-alloy-muted mb-1">
                Command
                <textarea
                    className="mt-1 w-full min-h-[72px] rounded border border-admin-border p-2 text-sm font-mono"
                    spellCheck={false}
                    placeholder={
                        "e.g. hide field Display name from table — customer-focused layout — show address and next service"
                    }
                    value={command}
                    onChange={(e) => setCommand(e.target.value)}
                />
            </label>
            <div className="flex flex-wrap gap-2 mt-2 mb-3">
                <button
                    type="button"
                    disabled={busy}
                    onClick={() => void runPreview()}
                    className="rounded-md bg-alloy-blue px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                >
                    {busy ? "Working…" : "Preview → structured_override"}
                </button>
                <button
                    type="button"
                    onClick={() => {
                        setIds(newRequestIds());
                        setParseNote("New request/correlation ids (see envelope below).");
                    }}
                    className="rounded-md border border-admin-border bg-white px-3 py-1.5 text-xs"
                >
                    New ids for apply
                </button>
            </div>
            {previewLabel && <p className="text-sm text-alloy-forge mb-1">{previewLabel}</p>}
            {parseNote && (
                <p
                    className={`text-sm mb-2 ${
                        parseNote.startsWith("Preview") ||
                        parseNote.startsWith("Matched") ||
                        parseNote.startsWith("Semantic")
                            ? "text-green-800"
                            : "text-amber-900"
                    }`}
                >
                    {parseNote}
                </p>
            )}
            {semanticPlannerErr && (
                <div className="mb-3 rounded-md border border-red-200 bg-red-50/90 p-3 text-xs text-red-950 space-y-2">
                    <p className="font-semibold">Semantic planner did not produce a proposal</p>
                    <p>{semanticPlannerErr.error}</p>
                    {semanticPlannerErr.ambiguity && semanticPlannerErr.ambiguity.length > 0 && (
                        <div>
                            <p className="font-medium">Ambiguity / conflict</p>
                            <ul className="list-disc pl-4 mt-1">
                                {semanticPlannerErr.ambiguity.map((a) => (
                                    <li key={a.code}>
                                        <code className="rounded bg-red-100/80 px-1">{a.code}</code> — {a.detail}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                    {semanticPlannerErr.rationale && semanticPlannerErr.rationale.length > 0 && (
                        <div>
                            <p className="font-medium">Rationale</p>
                            <ul className="list-disc pl-4 mt-1">
                                {semanticPlannerErr.rationale.map((line, i) => (
                                    <li key={i}>{line}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}
            {semanticPlannerOk && (
                <div className="mb-3 rounded-md border border-emerald-200 bg-emerald-50/80 p-3 text-xs text-emerald-950 space-y-2">
                    <p className="font-semibold text-emerald-900">Semantic planner succeeded</p>
                    <div>
                        <p className="font-medium text-emerald-900">Parsed intent</p>
                        <pre className="mt-1 max-h-32 overflow-auto rounded bg-white/80 p-2 border border-emerald-100">
                            {JSON.stringify(semanticPlannerOk.parsed_intent, null, 2)}
                        </pre>
                    </div>
                    <div>
                        <p className="font-medium text-emerald-900">Resolution</p>
                        <pre className="mt-1 max-h-40 overflow-auto rounded bg-white/80 p-2 border border-emerald-100">
                            {JSON.stringify(semanticPlannerOk.resolution, null, 2)}
                        </pre>
                    </div>
                    {semanticPlannerOk.rationale.length > 0 && (
                        <div>
                            <p className="font-medium text-emerald-900">Rationale</p>
                            <ul className="list-disc pl-4 mt-1">
                                {semanticPlannerOk.rationale.map((line, i) => (
                                    <li key={i}>{line}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                    {semanticPlannerOk.ambiguity.length > 0 && (
                        <div>
                            <p className="font-medium text-amber-900">Ambiguity markers</p>
                            <ul className="list-disc pl-4 mt-1">
                                {semanticPlannerOk.ambiguity.map((a) => (
                                    <li key={a.code}>
                                        <code className="rounded bg-amber-100 px-1">{a.code}</code> — {a.detail}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                    <div>
                        <p className="font-medium text-emerald-900">Diff summary</p>
                        <pre className="mt-1 max-h-40 overflow-auto rounded bg-white/80 p-2 border border-emerald-100">
                            {JSON.stringify(semanticPlannerOk.diff_summary, null, 2)}
                        </pre>
                    </div>
                    <p className="text-emerald-800">
                        Full v1 <code className="rounded bg-emerald-100/80 px-1">structured_override</code> (intent +
                        slots) is in the textarea below — same shape as{" "}
                        <code className="rounded bg-emerald-100/80 px-1">POST /api/admin/agent/v1/record-overview-layout</code>.
                    </p>
                </div>
            )}
            <label className="block text-xs font-medium text-alloy-muted mb-1">
                Editable preview (structured_override)
                <textarea
                    className="mt-1 w-full min-h-[220px] rounded border border-admin-border p-3 font-mono text-xs leading-relaxed"
                    spellCheck={false}
                    value={previewJson}
                    onChange={(e) => setPreviewJson(e.target.value)}
                />
            </label>
            <button
                type="button"
                onClick={() => void applyPreview()}
                className="mt-2 rounded-md bg-alloy-midnight px-4 py-2 text-sm font-medium text-white"
            >
                Apply via agent route (v1 or v2)
            </button>
        </SectionCard>
    );
}
