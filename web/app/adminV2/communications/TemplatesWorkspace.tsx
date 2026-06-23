"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
    COMMUNICATION_TOKEN_CATALOG,
    segmentCommunicationTemplate,
    validateCommunicationTokenPaths,
} from "@/lib/communications/v2/templateTokens";
import {
    TEMPLATE_CHANNELS,
    TEMPLATE_STATUSES,
    templateChannelSupportsSubject,
    type TemplateChannel,
    type TemplateStatus,
} from "@/lib/communications/v2/templateSchema";
import TemplateCategoryField from "@/app/adminV2/communications/TemplateCategoryField";
import TemplateTokenPickerPanel from "@/app/adminV2/communications/TemplateTokenPickerPanel";
import CommsMessageTextToolbar from "@/app/adminV2/communications/CommsMessageTextToolbar";
import {
    COMMS_CARD_CLASS,
    COMMS_FIELD_LABEL_CLASS,
    COMMS_INPUT_CLASS,
    COMMS_PRIMARY_BTN_CLASS,
    COMMS_SECONDARY_BTN_CLASS,
    COMMS_SELECT_CLASS,
    CommsSectionCard,
} from "@/app/adminV2/communications/commsWorkspaceUi";

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
    category: string;
    channel: TemplateChannel;
    status: TemplateStatus;
    current_version_id: string | null;
    current_version?: VersionSummary | null;
    updated_at: string | null;
};

type EditorDraft = {
    name: string;
    description: string;
    category: string;
    channel: TemplateChannel;
    status: TemplateStatus;
    subject: string;
    body: string;
};

const EMPTY_DRAFT: EditorDraft = {
    name: "",
    description: "",
    category: "",
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
    const [categoryFilter, setCategoryFilter] = useState("");
    const [channelFilter, setChannelFilter] = useState<TemplateChannel | "">("");
    const [statusFilter, setStatusFilter] = useState<TemplateStatus | "">("");

    // selection + editor
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [draft, setDraft] = useState<EditorDraft>(EMPTY_DRAFT);
    const [creating, setCreating] = useState(false);
    const [saving, setSaving] = useState(false);
    const [extraCategories, setExtraCategories] = useState<string[]>([]);
    const [versionInfo, setVersionInfo] = useState<{ current: number | null; count: number }>({
        current: null,
        count: 0,
    });

    const sampleContext = useMemo(buildSampleContext, []);
    const categoryOptions = useMemo(() => {
        const set = new Set<string>();
        for (const t of templates) {
            const c = t.category?.trim();
            if (c) set.add(c);
        }
        return [...set].sort((a, b) => a.localeCompare(b));
    }, [templates]);

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
        <div data-templates-workspace="true" className="grid h-full min-h-0 grid-cols-[272px_minmax(0,1fr)_320px] gap-3">
            {/* LEFT — list + filters */}
            <CommsSectionCard title="Template library" helper="Search and filter saved templates." data-template-list="true" className="flex min-h-0 flex-col !p-0">
                <div className="border-b border-alloy-stone/12 p-3">
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-alloy-midnight/80">Templates</span>
                        <button type="button" data-template-new="true" onClick={startCreate} className={`${COMMS_PRIMARY_BTN_CLASS} !px-2 !py-1 text-[11px]`}>
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
                        className={`${COMMS_INPUT_CLASS} mt-2`}
                    />
                    <div className="mt-2 grid grid-cols-1 gap-2">
                        <select
                            data-template-filter-category="true"
                            aria-label="Filter by category"
                            value={categoryFilter}
                            onChange={(e) => setCategoryFilter(e.target.value)}
                            className={COMMS_SELECT_CLASS}
                        >
                            <option value="">All categories</option>
                            {categoryOptions.map((c) => (
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
                            className={COMMS_SELECT_CLASS}
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
                            className={COMMS_SELECT_CLASS}
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
                <div className="min-h-0 flex-1 overflow-y-auto p-2">
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
                            className={`mb-1 flex w-full flex-col items-start gap-0.5 rounded-lg border px-2 py-2 text-left transition-colors ${
                                selectedId === t.id
                                    ? "border-alloy-pine/35 bg-alloy-pine/10 shadow-sm"
                                    : "border-transparent hover:border-alloy-stone/15 hover:bg-alloy-stone/8"
                            }`}
                        >
                            <span className="truncate text-[12px] font-medium text-alloy-midnight/90">{t.name}</span>
                            <span className="text-[10px] uppercase tracking-wide text-alloy-midnight/45">
                                {t.channel} · {t.category} · {t.status}
                            </span>
                        </button>
                    ))}
                </div>
            </CommsSectionCard>

            {/* CENTER — details + message */}
            <section data-template-editor="true" className="flex min-h-0 flex-col gap-3 overflow-y-auto">
                {error && (
                    <div data-template-error="true" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">
                        {error}
                    </div>
                )}
                {!hasSelection ? (
                    <div className={`${COMMS_CARD_CLASS} flex h-full items-center justify-center text-[12px] text-alloy-midnight/50`}>
                        Select a template or create a new one.
                    </div>
                ) : (
                    <>
                        <div className="flex items-center justify-between px-1">
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

                        <CommsSectionCard title="Template details" data-template-details="true">
                            <label className="flex flex-col gap-1.5">
                                <span className={COMMS_FIELD_LABEL_CLASS}>Name</span>
                                <input
                                    data-template-name="true"
                                    value={draft.name}
                                    onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                                    className={COMMS_INPUT_CLASS}
                                />
                            </label>
                            <label className="flex flex-col gap-1.5">
                                <span className={COMMS_FIELD_LABEL_CLASS}>Description</span>
                                <input
                                    data-template-description="true"
                                    value={draft.description}
                                    onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                                    className={COMMS_INPUT_CLASS}
                                />
                            </label>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                <TemplateCategoryField
                                    value={draft.category}
                                    onChange={(category) => setDraft((d) => ({ ...d, category }))}
                                    existingCategories={categoryOptions}
                                    extraCategories={extraCategories}
                                    onCreateCategory={(category) =>
                                        setExtraCategories((prev) =>
                                            prev.includes(category) ? prev : [...prev, category]
                                        )
                                    }
                                />
                                <label className="flex flex-col gap-1.5">
                                    <span className={COMMS_FIELD_LABEL_CLASS}>Channel</span>
                                    <select
                                        data-template-channel="true"
                                        value={draft.channel}
                                        onChange={(e) => {
                                            const channel = e.target.value as TemplateChannel;
                                            setDraft((d) => ({
                                                ...d,
                                                channel,
                                                subject: templateChannelSupportsSubject(channel) ? d.subject : "",
                                            }));
                                        }}
                                        className={COMMS_SELECT_CLASS}
                                    >
                                        {TEMPLATE_CHANNELS.map((c) => (
                                            <option key={c} value={c}>
                                                {c}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <label className="flex flex-col gap-1.5">
                                    <span className={COMMS_FIELD_LABEL_CLASS}>Status</span>
                                    <select
                                        data-template-status="true"
                                        value={draft.status}
                                        onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value as TemplateStatus }))}
                                        className={COMMS_SELECT_CLASS}
                                    >
                                        {TEMPLATE_STATUSES.map((s) => (
                                            <option key={s} value={s}>
                                                {s}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            </div>
                        </CommsSectionCard>

                        <CommsSectionCard title="Message content" helper="Subject applies to email templates only." data-template-message="true">
                            {isEmail && (
                                <label className="flex flex-col gap-1.5">
                                    <span className={COMMS_FIELD_LABEL_CLASS}>Subject</span>
                                    <input
                                        data-template-subject="true"
                                        ref={subjectRef}
                                        value={draft.subject}
                                        onFocus={() => (activeFieldRef.current = "subject")}
                                        onChange={(e) => setDraft((d) => ({ ...d, subject: e.target.value }))}
                                        className={COMMS_INPUT_CLASS}
                                    />
                                </label>
                            )}
                            <label className="flex flex-col gap-1.5">
                                <span className={COMMS_FIELD_LABEL_CLASS}>Body</span>
                                <CommsMessageTextToolbar
                                    value={draft.body}
                                    onChange={(body) => setDraft((d) => ({ ...d, body }))}
                                    textareaRef={bodyRef}
                                />
                                <textarea
                                    data-template-body="true"
                                    ref={bodyRef}
                                    value={draft.body}
                                    onFocus={() => (activeFieldRef.current = "body")}
                                    onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
                                    rows={10}
                                    className={`${COMMS_INPUT_CLASS} font-mono`}
                                />
                            </label>
                        </CommsSectionCard>

                        <div className="flex flex-wrap items-center gap-2 px-1">
                            <button
                                type="button"
                                data-template-save="true"
                                onClick={() => void save()}
                                disabled={saving || draft.name.trim() === "" || draft.category.trim() === ""}
                                className={COMMS_PRIMARY_BTN_CLASS}
                            >
                                {saving ? "Saving…" : creating ? "Create" : "Save"}
                            </button>
                            {!creating && selectedId && !isArchived && (
                                <button
                                    type="button"
                                    data-template-archive="true"
                                    onClick={() => void archive()}
                                    disabled={saving}
                                    className={COMMS_SECONDARY_BTN_CLASS}
                                >
                                    Archive
                                </button>
                            )}
                            {isArchived && <span className="text-[11px] text-alloy-midnight/45">Archived</span>}
                        </div>
                    </>
                )}
            </section>

            {/* RIGHT — tokens + preview */}
            <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto">
                <TemplateTokenPickerPanel onInsert={insertToken} />
                <CommsSectionCard title="Live preview" data-template-preview="true">
                    {subjectPreview && (
                        <div className="rounded-lg border border-alloy-stone/12 bg-alloy-stone/[0.03] px-2.5 py-2">
                            <div className="text-[9px] font-semibold uppercase tracking-wide text-alloy-midnight/40">Subject</div>
                            <div className="text-[12px] text-alloy-midnight/85">{subjectPreview.plainText}</div>
                        </div>
                    )}
                    <div className="rounded-lg border border-alloy-stone/12 bg-alloy-stone/[0.03] px-2.5 py-2">
                        <div className="text-[9px] font-semibold uppercase tracking-wide text-alloy-midnight/40">Body</div>
                        <div className="whitespace-pre-wrap text-[12px] text-alloy-midnight/85">{bodyPreview.plainText}</div>
                    </div>
                    {missingTokens.length > 0 && (
                        <div data-template-missing-tokens="true">
                            <div className="text-[9px] font-semibold uppercase tracking-wide text-amber-600">Missing tokens</div>
                            <div className="mt-1 flex flex-wrap gap-1">
                                {missingTokens.map((p) => (
                                    <span key={p} className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700">
                                        {`{{${p}}}`}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                    {unknownTokens.length > 0 && (
                        <div data-template-unknown-tokens="true">
                            <div className="text-[9px] font-semibold uppercase tracking-wide text-red-600">Unknown tokens</div>
                            <div className="mt-1 flex flex-wrap gap-1">
                                {unknownTokens.map((p) => (
                                    <span key={p} className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] text-red-700">
                                        {`{{${p}}}`}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </CommsSectionCard>
            </aside>
        </div>
    );
}
