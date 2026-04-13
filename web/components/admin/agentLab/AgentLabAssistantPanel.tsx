"use client";

import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import SectionCard from "@/components/admin/SectionCard";
import { parseAssistantCommand } from "@/lib/admin/agentLab/parseAssistantCommand";
import { resolveFieldDefinitionByQuery, type FieldDefListItem } from "@/lib/admin/agentLab/resolveFieldDefinitionByQuery";
import { buildAssistantPayload } from "@/lib/admin/agentLab/buildAssistantStructuredOverride";
import { getFieldDefinitionLockTimestamp } from "@/lib/agent/v2/fieldVisibilityConfigV0";

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

    const runPreview = useCallback(async () => {
        setParseNote(null);
        setPreviewRoute(null);
        setPreviewLabel(null);
        setPreviewJson("");

        const parsed = parseAssistantCommand(command);
        if (!parsed.ok) {
            setParseNote(parsed.error);
            return;
        }

        if (parsed.parsed.kind === "overview_financial") {
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
                    setParseNote(built.error);
                    return;
                }
                setPreviewRoute("v1");
                setPreviewLabel(built.payload.label);
                setPreviewJson(JSON.stringify(built.payload.structured_override, null, 2));
                setParseNote("Preview ready — review JSON, then Apply.");
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
                Regex-only commands — no LLM. Preview fills <code className="rounded bg-admin-page px-1">structured_override</code>{" "}
                for the existing v1/v2 agent routes. Edit the JSON if needed before Apply.
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
                    placeholder={'e.g. hide field Display name from table'}
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
                <p className={`text-sm mb-2 ${parseNote.startsWith("Preview") || parseNote.startsWith("Matched") ? "text-green-800" : "text-amber-900"}`}>
                    {parseNote}
                </p>
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
