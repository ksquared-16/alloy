"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
    COMMUNICATION_TOKEN_CATALOG,
    listCommunicationTokensByGroup,
    segmentCommunicationTemplate,
    validateCommunicationTokenPaths,
} from "@/lib/communications/v2/templateTokens";
import {
    TEMPLATE_CATEGORIES,
    TEMPLATE_CHANNELS,
    TEMPLATE_STATUSES,
    templateChannelSupportsSubject,
    type TemplateCategory,
    type TemplateChannel,
    type TemplateStatus,
} from "@/lib/communications/v2/templateSchema";

/**
 * Templates Workspace (Phase 1 / B3) — three-column template authoring.
 * Left: list + search + category/channel/status filters.
 * Center: metadata + subject (email only) + body editor.
 * Right: token picker + LIVE preview (B0 engine, client-side) + missing/unknown indicators.
 *
 * Data comes ONLY from the B2 template APIs (/api/admin/communications/templates...).
 * No provider, no send, no queue. Live preview renders client-side with the B0 token
 * engine against sample values — no Save/Refresh/manual generation required.
 */

const TEMPLATES_API = "/api/admin/communications/templates";

type VersionSummary = {
    id: string;
    version_number: number;
    subject: string | null;
    body: string;
    token_paths: string[];
};

type TemplateRow = {
    id: string;
    name: string;
    description: string | null;
    category: TemplateCategory;
    channel: TemplateChannel;
    status: TemplateStatus;
    current_version_id: string | null;
    current_version?: VersionSummary | null;
    updated_at: string | null;
};

type EditorDraft = {
    name: string;
    description: string;
    category: TemplateCategory;
    channel: TemplateChannel;
    status: TemplateStatus;
    subject: string;
    body: string;
};

const EMPTY_DRAFT: EditorDraft = {
    name: "",
    description: "",
    category: "general",
    channel: "email",
    status: "draft",
    subject: "",
    body: "",
};

/** Build a nested sample context from the catalog so the live preview reads naturally. */
function buildSampleContext(): Record<string, unknown> {
    const ctx: Record<string, unknown> = {};
    for (const def of COMMUNICATION_TOKEN_CATALOG) {
        const parts = def.path.split(".");
        let cur = ctx;
        for (let i = 0; i < parts.length - 1; i++) {
            const k = parts[i];
            if (typeof cur[k] !== "object" || cur[k] === null) cur[k] = {};
            cur = cur[k] as Record<string, unknown>;
        }
        cur[parts[parts.length - 1]] = def.sample;
    }
    return ctx;
}

export default function TemplatesWorkspace() {
    const [templates, setTemplates] = useState<TemplateRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // filters
    const [search, setSearch] = useState("");
    const [categoryFilter, setCategoryFilter] = useState<TemplateCategory | "">("");
    const [channelFilter, setChannelFilter] = useState<TemplateChannel | "">("");
    const [statusFilter, setStatusFilter] = useState<TemplateStatus | "">("");

    // selection + editor
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [draft, setDraft] = useState<EditorDraft>(EMPTY_DRAFT);
    const [creating, setCreating] = useState(false);
    const [saving, setSaving] = useState(false);
    const [versionInfo, setVersionInfo] = useState<{ current: number | null; count: number }>({
        current: null,
        count: 0,
    });

    const sampleContext = useMemo(buildSampleContext, []);
    const tokenGroups = useMemo(() => listCommunicationTokensByGroup(), []);

    const bodyRef = useRef<HTMLTextAreaElement | null>(null);
    const subjectRef = useRef<HTMLInputElement | null>(null);
    const activeFieldRef = useRef<"body" | "subject">("body");

    const isEmail = templateChannelSupportsSubject(draft.channel);

    // ---- data ----
    const loadList = useCallback(async () => {
        setLoading(true);
        setError(null);
        const params = new URLSearchParams();
        if (categoryFilter) params.set("category", categoryFilter);
        if (channelFilter) params.set("channel", channelFilter);
        if (statusFilter) params.set("status", statusFilter);
        const qs = params.toString();
        try {
            const res = await fetch(`${TEMPLATES_API}${qs ? `?${qs}` : ""}`, { credentials: "include" });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Failed to load templates");
            setTemplates(Array.isArray(json.templates) ? (json.templates as TemplateRow[]) : []);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load templates");
        } finally {
            setLoading(false);
        }
    }, [categoryFilter, channelFilter, statusFilter]);

    useEffect(() => {
        void loadList();
    }, [loadList]);

    const selectTemplate = useCallback(async (id: string) => {
        setCreating(false);
        setSelectedId(id);
        setError(null);
        try {
            const res = await fetch(`${TEMPLATES_API}/${id}`, { credentials: "include" });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Failed to load template");
            const t = json.template as TemplateRow;
            const cv = (json.current_version as VersionSummary | null) ?? null;
            const versions = Array.isArray(json.versions) ? (json.versions as VersionSummary[]) : [];
            setDraft({
                name: t.name ?? "",
                description: t.description ?? "",
                category: t.category,
                channel: t.channel,
                status: t.status,
                subject: cv?.subject ?? "",
                body: cv?.body ?? "",
            });
            setVersionInfo({ current: cv?.version_number ?? null, count: versions.length });
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load template");
        }
    }, []);

    const startCreate = useCallback(() => {
        setCreating(true);
        setSelectedId(null);
        setDraft(EMPTY_DRAFT);
        setVersionInfo({ current: null, count: 0 });
    }, []);

    const save = useCallback(async () => {
        setSaving(true);
        setError(null);
        // For non-email channels, subject is not editable and must be omitted/empty.
        const payload = {
            name: draft.name,
            description: draft.description,
            category: draft.category,
            channel: draft.channel,
            status: draft.status,
            subject: templateChannelSupportsSubject(draft.channel) ? draft.subject : "",
            body: draft.body,
        };
        try {
            let res: Response;
            if (creating || !selectedId) {
                res = await fetch(TEMPLATES_API, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify(payload),
                });
            } else {
                res = await fetch(`${TEMPLATES_API}/${selectedId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify(payload),
                });
            }
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Failed to save template");
            const savedId = String((json.template as TemplateRow).id);
            await loadList();
            await selectTemplate(savedId);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to save template");
        } finally {
            setSaving(false);
        }
    }, [creating, selectedId, draft, loadList, selectTemplate]);

    const archive = useCallback(async () => {
        if (!selectedId) return;
        setSaving(true);
        setError(null);
        try {
            const res = await fetch(`${TEMPLATES_API}/${selectedId}/archive`, {
                method: "POST",
                credentials: "include",
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Failed to archive template");
            await loadList();
            await selectTemplate(selectedId);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to archive template");
        } finally {
            setSaving(false);
        }
    }, [selectedId, loadList, selectTemplate]);

    // ---- token insertion ----
    const insertToken = useCallback(
        (path: string) => {
            const token = `{{${path}}}`;
            const field = activeFieldRef.current === "subject" && isEmail ? "subject" : "body";
            if (field === "subject") {
                const el = subjectRef.current;
                const cur = draft.subject;
                const pos = el?.selectionStart ?? cur.length;
                setDraft((d) => ({ ...d, subject: cur.slice(0, pos) + token + cur.slice(pos) }));
            } else {
                const el = bodyRef.current;
                const cur = draft.body;
                const pos = el?.selectionStart ?? cur.length;
                setDraft((d) => ({ ...d, body: cur.slice(0, pos) + token + cur.slice(pos) }));
            }
        },
        [draft.subject, draft.body, isEmail]
    );

    // ---- live preview (B0; updates automatically on every keystroke) ----
    const bodyPreview = useMemo(() => segmentCommunicationTemplate(draft.body, sampleContext), [draft.body, sampleContext]);
    const subjectPreview = useMemo(
        () => (isEmail ? segmentCommunicationTemplate(draft.subject, sampleContext) : null),
        [draft.subject, isEmail, sampleContext]
    );
    const unknownTokens = useMemo(() => {
        const combined = `${isEmail ? draft.subject : ""}\n${draft.body}`;
        return validateCommunicationTokenPaths(combined).unknownPaths;
    }, [draft.subject, draft.body, isEmail]);
    const missingTokens = useMemo(() => {
        const set = new Set<string>();
        for (const p of subjectPreview?.missingPaths ?? []) set.add(p);
        for (const p of bodyPreview.missingPaths) set.add(p);
        return [...set];
    }, [subjectPreview, bodyPreview]);

    // client-side text search over the loaded list
    const visibleTemplates = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return templates;
        return templates.filter((t) => t.name.toLowerCase().includes(q) || (t.description ?? "").toLowerCase().includes(q));
    }, [templates, search]);

    const hasSelection = creating || selectedId != null;
    const isArchived = draft.status === "archived";

    return (
        <div data-templates-workspace="true" className="grid h-full min-h-0 grid-cols-[260px_minmax(0,1fr)_300px] gap-3">
            {/* LEFT RAIL */}
            <aside data-template-list="true" className="flex min-h-0 flex-col rounded-xl border border-alloy-stone/20 bg-white">
                <div className="border-b border-alloy-stone/15 p-2">
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-alloy-midnight/80">Templates</span>
                        <button
                            type="button"
                            data-template-new="true"
                            onClick={startCreate}
                            className="rounded-md bg-[#00A283] px-2 py-1 text-[11px] font-medium text-white hover:bg-[#00916f]"
                        >
                            New
                        </button>
                    </div>
                    <input
                        type="search"
                        data-template-search="true"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search templates…"
                        aria-label="Search templates"
                        className="mt-2 w-full rounded-lg border border-alloy-stone/18 bg-white px-2 py-1.5 text-[12px] text-alloy-midnight/85 focus:border-[#00A283]/35 focus:outline-none focus:ring-1 focus:ring-[#00A283]/20"
                    />
                    <div className="mt-2 grid grid-cols-1 gap-1.5">
                        <select
                            data-template-filter-category="true"
                            aria-label="Filter by category"
                            value={categoryFilter}
                            onChange={(e) => setCategoryFilter(e.target.value as TemplateCategory | "")}
                            className="w-full rounded-md border border-alloy-stone/18 bg-white px-2 py-1 text-[11px] text-alloy-midnight/80"
                        >
                            <option value="">All categories</option>
                            {TEMPLATE_CATEGORIES.map((c) => (
                                <option key={c} value={c}>
                                    {c}
                                </option>
                            ))}
                        </select>
                        <select
                            data-template-filter-channel="true"
                            aria-label="Filter by channel"
                            value={channelFilter}
                            onChange={(e) => setChannelFilter(e.target.value as TemplateChannel | "")}
                            className="w-full rounded-md border border-alloy-stone/18 bg-white px-2 py-1 text-[11px] text-alloy-midnight/80"
                        >
                            <option value="">All channels</option>
                            {TEMPLATE_CHANNELS.map((c) => (
                                <option key={c} value={c}>
                                    {c}
                                </option>
                            ))}
                        </select>
                        <select
                            data-template-filter-status="true"
                            aria-label="Filter by status"
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value as TemplateStatus | "")}
                            className="w-full rounded-md border border-alloy-stone/18 bg-white px-2 py-1 text-[11px] text-alloy-midnight/80"
                        >
                            <option value="">All statuses</option>
                            {TEMPLATE_STATUSES.map((s) => (
                                <option key={s} value={s}>
                                    {s}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-1">
                    {loading && <div className="p-3 text-[11px] text-alloy-midnight/50">Loading…</div>}
                    {!loading && visibleTemplates.length === 0 && (
                        <div className="p-3 text-[11px] text-alloy-midnight/50">No templates.</div>
                    )}
                    {visibleTemplates.map((t) => (
                        <button
                            key={t.id}
                            type="button"
                            data-template-row={t.id}
                            onClick={() => void selectTemplate(t.id)}
                            className={`flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left transition-colors ${
                                selectedId === t.id ? "bg-[#00A283]/10" : "hover:bg-alloy-stone/8"
                            }`}
                        >
                            <span className="truncate text-[12px] font-medium text-alloy-midnight/90">{t.name}</span>
                            <span className="text-[10px] uppercase tracking-wide text-alloy-midnight/45">
                                {t.channel} · {t.category} · {t.status}
                            </span>
                        </button>
                    ))}
                </div>
            </aside>

            {/* CENTER PANEL */}
            <section data-template-editor="true" className="flex min-h-0 flex-col overflow-y-auto rounded-xl border border-alloy-stone/20 bg-white p-3">
                {error && (
                    <div data-template-error="true" className="mb-2 rounded-md bg-red-50 px-2 py-1 text-[11px] text-red-700">
                        {error}
                    </div>
                )}
                {!hasSelection ? (
                    <div className="flex h-full items-center justify-center text-[12px] text-alloy-midnight/50">
                        Select a template or create a new one.
                    </div>
                ) : (
                    <div className="flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-alloy-midnight/80">
                                {creating ? "New template" : "Edit template"}
                            </span>
                            {!creating && (
                                <span data-template-version="true" className="text-[10px] text-alloy-midnight/45">
                                    Version {versionInfo.current ?? "—"}
                                    {versionInfo.count > 0 ? ` · ${versionInfo.count} total` : ""}
                                </span>
                            )}
                        </div>

                        <label className="flex flex-col gap-1 text-[11px] text-alloy-midnight/70">
                            Name
                            <input
                                data-template-name="true"
                                value={draft.name}
                                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                                className="rounded-md border border-alloy-stone/18 px-2 py-1.5 text-[12px] text-alloy-midnight/85"
                            />
                        </label>

                        <label className="flex flex-col gap-1 text-[11px] text-alloy-midnight/70">
                            Description
                            <input
                                data-template-description="true"
                                value={draft.description}
                                onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                                className="rounded-md border border-alloy-stone/18 px-2 py-1.5 text-[12px] text-alloy-midnight/85"
                            />
                        </label>

                        <div className="grid grid-cols-3 gap-2">
                            <label className="flex flex-col gap-1 text-[11px] text-alloy-midnight/70">
                                Category
                                <select
                                    data-template-category="true"
                                    value={draft.category}
                                    onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value as TemplateCategory }))}
                                    className="rounded-md border border-alloy-stone/18 px-2 py-1.5 text-[12px] text-alloy-midnight/85"
                                >
                                    {TEMPLATE_CATEGORIES.map((c) => (
                                        <option key={c} value={c}>
                                            {c}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label className="flex flex-col gap-1 text-[11px] text-alloy-midnight/70">
                                Channel
                                <select
                                    data-template-channel="true"
                                    value={draft.channel}
                                    onChange={(e) => {
                                        const channel = e.target.value as TemplateChannel;
                                        // Clear subject when leaving email so non-email never carries a subject.
                                        setDraft((d) => ({
                                            ...d,
                                            channel,
                                            subject: templateChannelSupportsSubject(channel) ? d.subject : "",
                                        }));
                                    }}
                                    className="rounded-md border border-alloy-stone/18 px-2 py-1.5 text-[12px] text-alloy-midnight/85"
                                >
                                    {TEMPLATE_CHANNELS.map((c) => (
                                        <option key={c} value={c}>
                                            {c}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label className="flex flex-col gap-1 text-[11px] text-alloy-midnight/70">
                                Status
                                <select
                                    data-template-status="true"
                                    value={draft.status}
                                    onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value as TemplateStatus }))}
                                    className="rounded-md border border-alloy-stone/18 px-2 py-1.5 text-[12px] text-alloy-midnight/85"
                                >
                                    {TEMPLATE_STATUSES.map((s) => (
                                        <option key={s} value={s}>
                                            {s}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        </div>

                        {/* Subject — EMAIL ONLY. Hidden entirely for sms/in_app. */}
                        {isEmail && (
                            <label className="flex flex-col gap-1 text-[11px] text-alloy-midnight/70">
                                Subject
                                <input
                                    data-template-subject="true"
                                    ref={subjectRef}
                                    value={draft.subject}
                                    onFocus={() => (activeFieldRef.current = "subject")}
                                    onChange={(e) => setDraft((d) => ({ ...d, subject: e.target.value }))}
                                    className="rounded-md border border-alloy-stone/18 px-2 py-1.5 text-[12px] text-alloy-midnight/85"
                                />
                            </label>
                        )}

                        <label className="flex flex-col gap-1 text-[11px] text-alloy-midnight/70">
                            Body
                            <textarea
                                data-template-body="true"
                                ref={bodyRef}
                                value={draft.body}
                                onFocus={() => (activeFieldRef.current = "body")}
                                onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
                                rows={10}
                                className="rounded-md border border-alloy-stone/18 px-2 py-1.5 font-mono text-[12px] text-alloy-midnight/85"
                            />
                        </label>

                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                data-template-save="true"
                                onClick={() => void save()}
                                disabled={saving || draft.name.trim() === ""}
                                className="rounded-lg bg-[#00A283] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#00916f] disabled:opacity-50"
                            >
                                {saving ? "Saving…" : creating ? "Create" : "Save"}
                            </button>
                            {!creating && selectedId && !isArchived && (
                                <button
                                    type="button"
                                    data-template-archive="true"
                                    onClick={() => void archive()}
                                    disabled={saving}
                                    className="rounded-lg border border-alloy-stone/25 px-3 py-1.5 text-xs font-medium text-alloy-midnight/70 hover:bg-alloy-stone/8 disabled:opacity-50"
                                >
                                    Archive
                                </button>
                            )}
                            {isArchived && <span className="text-[11px] text-alloy-midnight/45">Archived</span>}
                        </div>
                    </div>
                )}
            </section>

            {/* RIGHT PANEL */}
            <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto">
                {/* Token picker */}
                <div data-template-token-picker="true" className="rounded-xl border border-alloy-stone/20 bg-white p-2">
                    <div className="mb-1 text-[11px] font-semibold text-alloy-midnight/80">Insert token</div>
                    <div className="flex flex-col gap-2">
                        {tokenGroups.map((g) => (
                            <div key={g.group}>
                                <div className="text-[9px] uppercase tracking-wide text-alloy-midnight/40">{g.group}</div>
                                <div className="mt-1 flex flex-wrap gap-1">
                                    {g.tokens.map((t) => (
                                        <button
                                            key={t.path}
                                            type="button"
                                            data-token-path={t.path}
                                            onClick={() => insertToken(t.path)}
                                            title={`{{${t.path}}}`}
                                            className="rounded-md border border-alloy-stone/20 bg-alloy-stone/5 px-1.5 py-0.5 text-[10px] text-alloy-midnight/75 hover:border-[#00A283]/40 hover:bg-[#00A283]/5"
                                        >
                                            {t.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Live preview */}
                <div data-template-preview="true" className="rounded-xl border border-alloy-stone/20 bg-white p-2">
                    <div className="mb-1 text-[11px] font-semibold text-alloy-midnight/80">Live preview</div>
                    {subjectPreview && (
                        <div className="mb-1 rounded-md bg-alloy-stone/5 px-2 py-1">
                            <div className="text-[9px] uppercase tracking-wide text-alloy-midnight/40">Subject</div>
                            <div className="text-[12px] text-alloy-midnight/85">{subjectPreview.plainText}</div>
                        </div>
                    )}
                    <div className="rounded-md bg-alloy-stone/5 px-2 py-1">
                        <div className="text-[9px] uppercase tracking-wide text-alloy-midnight/40">Body</div>
                        <div className="whitespace-pre-wrap text-[12px] text-alloy-midnight/85">{bodyPreview.plainText}</div>
                    </div>

                    {/* Missing token indicators */}
                    {missingTokens.length > 0 && (
                        <div data-template-missing-tokens="true" className="mt-2">
                            <div className="text-[9px] uppercase tracking-wide text-amber-600">Missing tokens</div>
                            <div className="mt-1 flex flex-wrap gap-1">
                                {missingTokens.map((p) => (
                                    <span key={p} className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700">
                                        {`{{${p}}}`}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Unknown token indicators */}
                    {unknownTokens.length > 0 && (
                        <div data-template-unknown-tokens="true" className="mt-2">
                            <div className="text-[9px] uppercase tracking-wide text-red-600">Unknown tokens</div>
                            <div className="mt-1 flex flex-wrap gap-1">
                                {unknownTokens.map((p) => (
                                    <span key={p} className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] text-red-700">
                                        {`{{${p}}}`}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </aside>
        </div>
    );
}
