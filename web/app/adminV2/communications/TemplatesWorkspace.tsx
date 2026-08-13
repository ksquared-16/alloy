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
    templateChannelLabel,
    templateChannelSupportsSubject,
    templateStatusLabel,
    type TemplateChannel,
    type TemplateStatus,
} from "@/lib/communications/v2/templateSchema";
import TemplateCategoryField from "@/app/adminV2/communications/TemplateCategoryField";
import TemplateCategoriesManageModal from "@/app/adminV2/communications/TemplateCategoriesManageModal";
import TemplateTokenPickerPanel from "@/app/adminV2/communications/TemplateTokenPickerPanel";
import CommsMessageTextToolbar from "@/app/adminV2/communications/CommsMessageTextToolbar";
import {
    collectTemplateCategories,
    mergeTemplateCategoryOptions,
    normalizeTemplateCategoryLabel,
} from "@/lib/communications/v2/templateCategoryOptions";
import {
    COMMS_EMPTY_STATE_CLASS,
    COMMS_ERROR_BANNER_CLASS,
    COMMS_FIELD_LABEL_CLASS,
    COMMS_FIELD_STACK_CLASS,
    COMMS_FILTERS_TOGGLE_ACTIVE_CLASS,
    COMMS_FILTERS_TOGGLE_CLASS,
    COMMS_INPUT_CLASS,
    COMMS_PRIMARY_BTN_CLASS,
    COMMS_SECONDARY_BTN_CLASS,
    COMMS_SELECT_CLASS,
    COMMS_UTILITY_CARD_CLASS,
    COMMS_LIBRARY_RAIL_HEADER_CLASS,
    COMMS_LIBRARY_ROW_CLASS,
    COMMS_LIBRARY_ROW_SELECTED_CLASS,
    CommsLibraryListReserve,
    CommsSectionCard,
} from "@/app/adminV2/communications/commsWorkspaceUi";
import {
    getCommunicationsWarmTemplatesLibrary,
    subscribeCommunicationsWorkspaceWarm,
} from "@/lib/communications/v2/communicationsWorkspaceWarmCache";
import { useCommunicationsWorkspaceKpiOptional } from "@/app/adminV2/communications/CommunicationsWorkspaceKpiContext";
import TourTemplateDeliveryAutomationCard from "@/app/adminV2/communications/TourTemplateDeliveryAutomationCard";
import {
    extractTourCommsMetadataRoot,
    mergeTourCommsConfig,
    parseTourCommsConfigFragment,
} from "@/lib/tours/comms/tourCommsConfig";
import {
    buildTourCommsStudioDraftFromConfig,
    isTourSystemTemplateSystemKey,
    serializeTourCommsStudioDraftToFragment,
    tourSystemTemplateEventKey,
    type TourCommsStudioDraft,
    validateTourCommsStudioDraft,
} from "@/lib/tours/comms/tourCommsStudioPolicy";

/**
 * Templates Workspace (Phase 1 / B3) — three-column template authoring.
 * Left: library rail with search + Filters disclosure; list scrolls independently.
 * Center: dense template details + message-first editor (subject/body dominate).
 * Right: token picker + LIVE preview (B0 engine, client-side) + missing/unknown indicators.
 *
 * Data comes ONLY from the B2 template APIs (/api/admin/communications/templates...).
 * No provider, no send, no queue. Live preview renders client-side with the B0 token
 * engine against sample values — no Save/Refresh/manual generation required.
 */

const TEMPLATES_API = "/api/admin/communications/templates";
const ORG_SETTINGS_API = "/api/admin/org-settings";

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
    system_key: string | null;
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

function initialTemplatesFromWarm(): TemplateRow[] {
    return (getCommunicationsWarmTemplatesLibrary() as TemplateRow[] | null) ?? [];
}

function initialTemplatesListResolved(): boolean {
    return getCommunicationsWarmTemplatesLibrary() !== null;
}

function getInitialTemplateOccupancy(): {
    selectedId: string | null;
    creating: boolean;
    draft: EditorDraft;
    versionInfo: { current: number | null; count: number };
} {
    if (!initialTemplatesListResolved()) {
        return { selectedId: null, creating: false, draft: EMPTY_DRAFT, versionInfo: { current: null, count: 0 } };
    }
    const warm = initialTemplatesFromWarm();
    if (warm.length === 0) {
        return { selectedId: null, creating: true, draft: EMPTY_DRAFT, versionInfo: { current: null, count: 0 } };
    }
    const row = warm[0];
    const cv = row.current_version ?? null;
    return {
        selectedId: row.id,
        creating: false,
        draft: {
            name: row.name ?? "",
            description: row.description ?? "",
            category: row.category,
            channel: row.channel,
            status: row.status,
            subject: cv?.subject ?? "",
            body: cv?.body ?? "",
        },
        versionInfo: { current: cv?.version_number ?? null, count: cv ? 1 : 0 },
    };
}

function draftFromTemplateRow(row: TemplateRow): EditorDraft {
    const cv = row.current_version ?? null;
    return {
        name: row.name ?? "",
        description: row.description ?? "",
        category: row.category,
        channel: row.channel,
        status: row.status,
        subject: cv?.subject ?? "",
        body: cv?.body ?? "",
    };
}

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
    const kpiContext = useCommunicationsWorkspaceKpiOptional();
    const [templates, setTemplates] = useState<TemplateRow[]>(initialTemplatesFromWarm);
    const [loading, setLoading] = useState(() => !initialTemplatesListResolved());
    const [listResolved, setListResolved] = useState(initialTemplatesListResolved);
    const [error, setError] = useState<string | null>(null);

    // filters
    const [search, setSearch] = useState("");
    const [categoryFilter, setCategoryFilter] = useState("");
    const [channelFilter, setChannelFilter] = useState<TemplateChannel | "">("");
    const [statusFilter, setStatusFilter] = useState<TemplateStatus | "">("");
    /** Advanced category/channel/status controls — collapsed by default (queue Filters pattern). */
    const [filtersOpen, setFiltersOpen] = useState(false);

    // selection + editor — warm-cache-first occupancy (Increment 2C)
    const [selectedId, setSelectedId] = useState<string | null>(() => getInitialTemplateOccupancy().selectedId);
    const [draft, setDraft] = useState<EditorDraft>(() => getInitialTemplateOccupancy().draft);
    const [creating, setCreating] = useState(() => getInitialTemplateOccupancy().creating);
    const [saving, setSaving] = useState(false);
    const [extraCategories, setExtraCategories] = useState<string[]>([]);
    const [removedCategories, setRemovedCategories] = useState<string[]>([]);
    const [categoriesManageOpen, setCategoriesManageOpen] = useState(false);
    const [versionInfo, setVersionInfo] = useState<{ current: number | null; count: number }>(
        () => getInitialTemplateOccupancy().versionInfo
    );
    const [selectedSystemKey, setSelectedSystemKey] = useState<string | null>(null);
    const [tourCommsDraft, setTourCommsDraft] = useState<TourCommsStudioDraft | null>(null);
    const [tourCommsBaselineJson, setTourCommsBaselineJson] = useState<string | null>(null);
    const [tourCommsLoading, setTourCommsLoading] = useState(false);
    const [tourCommsLoaded, setTourCommsLoaded] = useState(false);

    const didInitialOccupancyRef = useRef(false);

    const sampleContext = useMemo(buildSampleContext, []);
    const templateDerivedCategories = useMemo(() => collectTemplateCategories(templates), [templates]);
    const categoryOptions = useMemo(
        () => mergeTemplateCategoryOptions(templateDerivedCategories, extraCategories, removedCategories),
        [templateDerivedCategories, extraCategories, removedCategories]
    );

    const bodyRef = useRef<HTMLTextAreaElement | null>(null);
    const subjectRef = useRef<HTMLInputElement | null>(null);
    const activeFieldRef = useRef<"body" | "subject">("body");

    const isEmail = templateChannelSupportsSubject(draft.channel);
    const filtersDefault = !categoryFilter && !channelFilter && !statusFilter;

    // ---- data ----
    const loadList = useCallback(async (opts?: { background?: boolean }) => {
        if (!opts?.background) {
            const warm = filtersDefault ? getCommunicationsWarmTemplatesLibrary() : null;
            if (warm) {
                setTemplates(warm as TemplateRow[]);
                setListResolved(true);
            } else {
                setLoading(true);
            }
            setError(null);
        }
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
            setListResolved(true);
        }
    }, [categoryFilter, channelFilter, statusFilter, filtersDefault]);

    const loadTourCommsPolicy = useCallback(async () => {
        setTourCommsLoading(true);
        try {
            const res = await fetch(ORG_SETTINGS_API, { credentials: "include" });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Failed to load org settings");
            const fragment = parseTourCommsConfigFragment(extractTourCommsMetadataRoot(json.metadata));
            const merged = mergeTourCommsConfig(fragment, {});
            const nextDraft = buildTourCommsStudioDraftFromConfig(merged);
            setTourCommsDraft(nextDraft);
            setTourCommsBaselineJson(JSON.stringify(nextDraft));
            setTourCommsLoaded(true);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load Tour delivery policy");
        } finally {
            setTourCommsLoading(false);
        }
    }, []);

    const persistTourCommsPolicy = useCallback(async (draft: TourCommsStudioDraft) => {
        const res = await fetch(ORG_SETTINGS_API, { credentials: "include" });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Failed to load org settings");

        const currentMeta = (json.metadata as Record<string, unknown> | null | undefined) ?? {};
        const existingFragment = parseTourCommsConfigFragment(extractTourCommsMetadataRoot(currentMeta));
        const tourCommsPatch = serializeTourCommsStudioDraftToFragment(draft, existingFragment);
        const mergedTourComms = { ...existingFragment, ...tourCommsPatch };

        const patchRes = await fetch(ORG_SETTINGS_API, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ metadata: { tour_comms: mergedTourComms } }),
        });
        const patchJson = await patchRes.json().catch(() => ({}));
        if (!patchRes.ok) {
            throw new Error(typeof patchJson.error === "string" ? patchJson.error : "Failed to save Tour delivery policy");
        }
        setTourCommsBaselineJson(JSON.stringify(draft));
    }, []);

    useEffect(() => {
        return subscribeCommunicationsWorkspaceWarm(() => {
            if (!filtersDefault) return;
            const warm = getCommunicationsWarmTemplatesLibrary();
            if (!warm) return;
            setTemplates(warm as TemplateRow[]);
            setListResolved(true);
            setLoading(false);
        });
    }, [filtersDefault]);

    useEffect(() => {
        const warm = filtersDefault ? getCommunicationsWarmTemplatesLibrary() : null;
        void loadList({ background: warm !== null });
    }, [loadList, filtersDefault]);

    useEffect(() => {
        kpiContext?.setTemplatesKpis({
            rows: templates.map((t) => ({
                status: t.status,
                category: t.category,
                updated_at: t.updated_at,
                has_version: Boolean(t.current_version_id),
            })),
            listResolved,
        });
    }, [kpiContext, templates, listResolved]);

    const selectTemplate = useCallback(async (id: string) => {
        setCreating(false);
        setSelectedId(id);
        setError(null);
        // Seed from list row immediately so details/channel paint before version fetch.
        const preview = templates.find((t) => t.id === id);
        if (preview) {
            setDraft(draftFromTemplateRow(preview));
            setSelectedSystemKey(preview.system_key ?? null);
        }
        try {
            const res = await fetch(`${TEMPLATES_API}/${id}`, { credentials: "include" });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Failed to load template");
            const t = json.template as TemplateRow;
            const cv = (json.current_version as VersionSummary | null) ?? null;
            const versions = Array.isArray(json.versions) ? (json.versions as VersionSummary[]) : [];
            setSelectedSystemKey(typeof t.system_key === "string" ? t.system_key : null);
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
    }, [templates]);

    useEffect(() => {
        if (didInitialOccupancyRef.current) return;
        if (!listResolved || !filtersDefault) return;
        didInitialOccupancyRef.current = true;

        if (templates.length === 0) {
            if (!creating) {
                setCreating(true);
                setSelectedId(null);
                setDraft(EMPTY_DRAFT);
                setVersionInfo({ current: null, count: 0 });
            }
            return;
        }

        if (selectedId) {
            const row = templates.find((t) => t.id === selectedId);
            const hasEditorBody = Boolean(draft.body || row?.current_version?.body);
            if (!hasEditorBody) void selectTemplate(selectedId);
            return;
        }

        if (!creating) {
            const row = templates[0];
            const cv = row.current_version ?? null;
            setSelectedId(row.id);
            setDraft(draftFromTemplateRow(row));
            setVersionInfo({ current: cv?.version_number ?? null, count: cv ? 1 : 0 });
            if (!cv?.body) void selectTemplate(row.id);
        }
    }, [listResolved, filtersDefault, templates, selectedId, creating, draft.body, selectTemplate]);

    useEffect(() => {
        if (!isTourSystemTemplateSystemKey(selectedSystemKey)) return;
        if (tourCommsLoaded || tourCommsLoading) return;
        void loadTourCommsPolicy();
    }, [selectedSystemKey, tourCommsLoaded, tourCommsLoading, loadTourCommsPolicy]);

    const startCreate = useCallback(() => {
        setCreating(true);
        setSelectedId(null);
        setSelectedSystemKey(null);
        setDraft(EMPTY_DRAFT);
        setVersionInfo({ current: null, count: 0 });
    }, []);

    const save = useCallback(async () => {
        setSaving(true);
        setError(null);

        const tourEventKey = tourSystemTemplateEventKey(selectedSystemKey);
        const showTourDelivery = isTourSystemTemplateSystemKey(selectedSystemKey);
        const tourCommsDirty =
            showTourDelivery && tourCommsDraft != null && tourCommsBaselineJson !== JSON.stringify(tourCommsDraft);

        if (tourCommsDirty && tourCommsDraft) {
            const validation = validateTourCommsStudioDraft(tourCommsDraft, {
                eventKey: tourEventKey,
                editingReminderControls: tourCommsDraft.reminderEnabled,
            });
            if (!validation.ok) {
                setError(validation.error);
                setSaving(false);
                return;
            }
        }

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
            if (tourCommsDirty && tourCommsDraft) {
                await persistTourCommsPolicy(tourCommsDraft);
            }

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
    }, [
        creating,
        selectedId,
        draft,
        loadList,
        selectTemplate,
        selectedSystemKey,
        tourCommsDraft,
        tourCommsBaselineJson,
        persistTourCommsPolicy,
    ]);

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

    const addSessionCategory = useCallback((category: string) => {
        const next = normalizeTemplateCategoryLabel(category);
        if (!next) return;
        setExtraCategories((prev) => (prev.includes(next) ? prev : [...prev, next]));
        setRemovedCategories((prev) => prev.filter((c) => c !== next));
    }, []);

    const renameCategory = useCallback(
        async (from: string, to: string) => {
            const next = normalizeTemplateCategoryLabel(to);
            const prev = from.trim();
            if (!next || !prev || next === prev) return;

            const affected = templates.filter((t) => (t.category ?? "").trim() === prev);
            setTemplates((list) =>
                list.map((t) => ((t.category ?? "").trim() === prev ? { ...t, category: next } : t))
            );
            setDraft((d) => ((d.category ?? "").trim() === prev ? { ...d, category: next } : d));
            setExtraCategories((list) => {
                const mapped = list.map((c) => (c === prev ? next : c));
                return mapped.includes(next) ? [...new Set(mapped)] : [...new Set([...mapped, next])];
            });
            setRemovedCategories((list) => list.filter((c) => c !== prev && c !== next));
            if (categoryFilter === prev) setCategoryFilter(next);

            const errors: string[] = [];
            for (const t of affected) {
                const res = await fetch(`${TEMPLATES_API}/${t.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ category: next }),
                });
                if (!res.ok) {
                    const json = await res.json().catch(() => ({}));
                    errors.push(typeof json.error === "string" ? json.error : `Failed to rename ${t.name}`);
                }
            }
            if (errors.length) {
                await loadList();
                throw new Error(errors[0]);
            }
        },
        [templates, categoryFilter, loadList]
    );

    const removeCategory = useCallback(
        (name: string) => {
            const trimmed = name.trim();
            if (!trimmed) return;
            setExtraCategories((prev) => prev.filter((c) => c !== trimmed));
            setRemovedCategories((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
            setDraft((d) => ((d.category ?? "").trim() === trimmed ? { ...d, category: "" } : d));
            if (categoryFilter === trimmed) setCategoryFilter("");
        },
        [categoryFilter]
    );

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
    const advancedFilterCount = [categoryFilter, channelFilter, statusFilter].filter(Boolean).length;
    const showTourDeliverySection = isTourSystemTemplateSystemKey(selectedSystemKey);
    const tourDeliveryEventKey = tourSystemTemplateEventKey(selectedSystemKey);

    return (
        <div
            data-templates-workspace="true"
            className="relative grid h-full min-h-0 grid-cols-[272px_minmax(0,1fr)_320px] gap-0 divide-x divide-alloy-stone/28"
        >
            {/* LEFT — list + filters */}
            <CommsSectionCard
                title="Template Library"
                helper="Search and filter saved templates."
                data-template-list="true"
                className="flex min-h-0 flex-col !rounded-none !border-0 !p-0 !shadow-none"
                headerClassName="shrink-0 border-b border-alloy-stone/25 bg-alloy-stone/[0.04] px-3 py-2"
                bodyClassName="min-h-0 flex-1 gap-0 overflow-hidden"
            >
                <div className={COMMS_LIBRARY_RAIL_HEADER_CLASS} data-template-library-header="true">
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold tracking-wide text-alloy-midnight/85">Templates</span>
                        <button type="button" data-template-new="true" onClick={startCreate} className={`${COMMS_PRIMARY_BTN_CLASS} !px-2 !py-1 text-[11px]`}>
                            New
                        </button>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                        <input
                            type="search"
                            data-template-search="true"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search templates…"
                            aria-label="Search templates"
                            className={`min-w-0 flex-1 ${COMMS_INPUT_CLASS}`}
                        />
                        <button
                            type="button"
                            data-template-filters-toggle="true"
                            aria-expanded={filtersOpen}
                            aria-controls="template-library-advanced-filters"
                            onClick={() => setFiltersOpen((v) => !v)}
                            className={
                                filtersOpen || advancedFilterCount > 0
                                    ? COMMS_FILTERS_TOGGLE_ACTIVE_CLASS
                                    : COMMS_FILTERS_TOGGLE_CLASS
                            }
                        >
                            Filters
                            {advancedFilterCount > 0 ? (
                                <span
                                    data-template-filters-badge="true"
                                    className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-alloy-juniper px-1 text-[10px] font-bold text-white tabular-nums"
                                >
                                    {advancedFilterCount}
                                </span>
                            ) : null}
                        </button>
                    </div>
                    {filtersOpen ? (
                        <div
                            id="template-library-advanced-filters"
                            data-template-filters-advanced="true"
                            className="mt-2 grid grid-cols-1 gap-1.5 rounded-lg border border-alloy-stone/25 bg-alloy-stone/[0.04] px-2 py-2"
                        >
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
                                        {templateChannelLabel(c)}
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
                                        {templateStatusLabel(s)}
                                    </option>
                                ))}
                            </select>
                        </div>
                    ) : null}
                </div>
                <div
                    data-template-list-scroll="true"
                    className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2"
                >
                    {loading && !listResolved ?
                        <CommsLibraryListReserve label="Loading templates" />
                    :   null}
                    {listResolved && !loading && visibleTemplates.length === 0 ?
                        <div className="px-3 py-4 text-center">
                            <p className="text-[11px] font-medium text-alloy-midnight/60">No templates yet</p>
                            <button type="button" onClick={startCreate} className={`${COMMS_PRIMARY_BTN_CLASS} mt-2 !px-2.5 !py-1 text-[11px]`}>
                                Create Template
                            </button>
                        </div>
                    :   null}
                    {visibleTemplates.map((t) => (
                        <button
                            key={t.id}
                            type="button"
                            data-template-row={t.id}
                            data-template-row-channel={t.channel}
                            data-template-row-status={t.status}
                            onClick={() => void selectTemplate(t.id)}
                            className={`${COMMS_LIBRARY_ROW_CLASS} ${
                                selectedId === t.id ? COMMS_LIBRARY_ROW_SELECTED_CLASS : ""
                            }`}
                        >
                            <span className="truncate text-[12px] font-medium text-alloy-midnight/90">{t.name}</span>
                            <span className="text-[10px] tracking-wide text-alloy-midnight/45">
                                {templateChannelLabel(t.channel)} · {t.category} · {templateStatusLabel(t.status)}
                            </span>
                        </button>
                    ))}
                </div>
            </CommsSectionCard>

            {/* CENTER — details + message (message-first density) */}
            <section
                data-template-editor="true"
                className="flex min-h-0 flex-col gap-2 overflow-hidden bg-white px-3 py-2.5"
            >
                {error && (
                    <div data-template-error="true" className={`${COMMS_ERROR_BANNER_CLASS} shrink-0`}>
                        {error}
                    </div>
                )}
                {!hasSelection ?
                    <div className={COMMS_EMPTY_STATE_CLASS}>
                        <p className="font-medium text-alloy-midnight/70">No template selected</p>
                        <p className="mt-1 text-[11px] text-alloy-midnight/50">
                            Choose a template from the library or create a new one.
                        </p>
                        <button type="button" onClick={startCreate} className={`${COMMS_PRIMARY_BTN_CLASS} mt-3`}>
                            Create Template
                        </button>
                    </div>
                :   (
                    <>
                        <div className="flex shrink-0 items-center justify-between px-0.5">
                            <span className="text-xs font-semibold text-alloy-midnight/80">
                                {creating ? "New Template" : "Edit template"}
                            </span>
                            {!creating && (
                                <span data-template-version="true" className="text-[10px] text-alloy-midnight/45">
                                    Version {versionInfo.current ?? "—"}
                                    {versionInfo.count > 0 ? ` · ${versionInfo.count} total` : ""}
                                </span>
                            )}
                        </div>

                        <CommsSectionCard
                            title="Template details"
                            data-template-details="true"
                            dense
                            className="shrink-0 !p-2.5"
                        >
                            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,0.85fr)_7rem_6.25rem]">
                                <label className={COMMS_FIELD_STACK_CLASS}>
                                    <span className={COMMS_FIELD_LABEL_CLASS}>Name</span>
                                    <input
                                        data-template-name="true"
                                        value={draft.name}
                                        onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                                        className={COMMS_INPUT_CLASS}
                                    />
                                </label>
                                <TemplateCategoryField
                                    value={draft.category}
                                    onChange={(category) => setDraft((d) => ({ ...d, category }))}
                                    existingCategories={categoryOptions}
                                    extraCategories={extraCategories}
                                    onCreateCategory={addSessionCategory}
                                />
                                <label className={COMMS_FIELD_STACK_CLASS}>
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
                                                {templateChannelLabel(c)}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <label className={COMMS_FIELD_STACK_CLASS}>
                                    <span className={COMMS_FIELD_LABEL_CLASS}>Status</span>
                                    <select
                                        data-template-status="true"
                                        value={draft.status}
                                        onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value as TemplateStatus }))}
                                        className={COMMS_SELECT_CLASS}
                                    >
                                        {TEMPLATE_STATUSES.map((s) => (
                                            <option key={s} value={s}>
                                                {templateStatusLabel(s)}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            </div>
                            <label className={COMMS_FIELD_STACK_CLASS}>
                                <span className={COMMS_FIELD_LABEL_CLASS}>Description</span>
                                <input
                                    data-template-description="true"
                                    value={draft.description}
                                    onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                                    className={COMMS_INPUT_CLASS}
                                />
                            </label>
                        </CommsSectionCard>

                        {showTourDeliverySection && tourDeliveryEventKey && tourCommsDraft ? (
                            <TourTemplateDeliveryAutomationCard
                                eventKey={tourDeliveryEventKey}
                                draft={tourCommsDraft}
                                disabled={saving || tourCommsLoading}
                                onChange={setTourCommsDraft}
                            />
                        ) : showTourDeliverySection && tourCommsLoading ? (
                            <CommsSectionCard
                                title="Delivery & automation"
                                dense
                                className="shrink-0 !p-2.5"
                                data-tour-delivery-automation-loading="true"
                            >
                                <span className="text-[11px] text-alloy-midnight/50">Loading Tour delivery policy…</span>
                            </CommsSectionCard>
                        ) : null}

                        <CommsSectionCard
                            title="Message content"
                            data-template-message="true"
                            dense
                            className="flex min-h-0 flex-1 flex-col !p-2.5"
                            bodyClassName="min-h-0 flex-1 gap-1.5 overflow-hidden"
                        >
                            {isEmail && (
                                <label className={`${COMMS_FIELD_STACK_CLASS} shrink-0`}>
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
                            <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-hidden" data-template-body-region="true">
                                <span className={`${COMMS_FIELD_LABEL_CLASS} shrink-0`}>Body</span>
                                <div className="shrink-0">
                                    <CommsMessageTextToolbar
                                        value={draft.body}
                                        onChange={(body) => setDraft((d) => ({ ...d, body }))}
                                        textareaRef={bodyRef}
                                    />
                                </div>
                                <textarea
                                    data-template-body="true"
                                    ref={bodyRef}
                                    value={draft.body}
                                    onFocus={() => (activeFieldRef.current = "body")}
                                    onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
                                    className={`${COMMS_INPUT_CLASS} min-h-[10rem] flex-1 resize-none overflow-y-auto font-mono`}
                                />
                            </div>
                        </CommsSectionCard>

                        <div className="flex shrink-0 flex-wrap items-center gap-2 px-0.5 pb-0.5">
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
            <aside className="flex min-h-0 flex-col gap-2.5 overflow-y-auto overscroll-contain bg-white px-2.5 py-2.5">
                <TemplateTokenPickerPanel onInsert={insertToken} />
                <CommsSectionCard title="Live preview" data-template-preview="true" dense className="!p-2.5">
                    {subjectPreview && (
                        <div className={COMMS_UTILITY_CARD_CLASS}>
                            <div className="text-[9px] font-semibold uppercase tracking-wide text-alloy-midnight/40">Subject</div>
                            <div className="text-[12px] text-alloy-midnight/85">{subjectPreview.plainText}</div>
                        </div>
                    )}
                    <div className={COMMS_UTILITY_CARD_CLASS}>
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

            <button
                type="button"
                data-template-categories-settings="true"
                aria-label="Manage categories"
                title="Manage categories"
                onClick={() => setCategoriesManageOpen(true)}
                className="absolute bottom-2 left-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-alloy-stone/25 bg-white text-alloy-midnight/60 shadow-sm hover:border-alloy-juniper/35 hover:text-alloy-juniper"
            >
                <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4 fill-current">
                    <path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Zm7.4-2.5c0-.5-.04-.98-.11-1.45l1.6-1.24a.75.75 0 0 0 .18-.96l-1.52-2.63a.75.75 0 0 0-.9-.33l-1.88.76a7.2 7.2 0 0 0-1.26-.73l-.29-2a.75.75 0 0 0-.74-.64H9.92a.75.75 0 0 0-.74.64l-.29 2c-.45.18-.87.42-1.26.73l-1.88-.76a.75.75 0 0 0-.9.33L3.33 6.85a.75.75 0 0 0 .18.96l1.6 1.24c-.07.47-.11.95-.11 1.45s.04.98.11 1.45l-1.6 1.24a.75.75 0 0 0-.18.96l1.52 2.63c.2.35.6.48.9.33l1.88-.76c.39.31.81.55 1.26.73l.29 2c.06.4.4.69.74.64h3.04c.34.05.68-.24.74-.64l.29-2c.45-.18.87-.42 1.26-.73l1.88.76c.3.15.7.02.9-.33l1.52-2.63a.75.75 0 0 0-.18-.96l-1.6-1.24c.07-.47.11-.95.11-1.45Z" />
                </svg>
            </button>

            <TemplateCategoriesManageModal
                open={categoriesManageOpen}
                onClose={() => setCategoriesManageOpen(false)}
                categories={categoryOptions}
                templates={templates}
                onRename={renameCategory}
                onRemove={removeCategory}
            />
        </div>
    );
}
