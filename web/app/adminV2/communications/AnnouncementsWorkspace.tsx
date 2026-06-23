"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useWorkspaceSiteFilter } from "@/contexts/WorkspaceSiteFilterContext";
import type { InquiryChildPlacementHierarchyRow } from "@/lib/admin/location/inquiryChildPlacementOptions";
import { segmentCommunicationTemplate } from "@/lib/communications/v2/templateTokens";
import { ANNOUNCEMENT_CHANNELS, type AnnouncementChannel } from "@/lib/communications/v2/announcementSchema";
import { AUDIENCE_GRAINS, type AnnouncementAudienceSpec, type AudienceGrain } from "@/lib/communications/v2/audienceSpec";
import {
    filterProgramIdsForLocations,
    programOptionsForDisplay,
    roomAudienceBuilderState,
    statusOptionsForDisplay,
    type ProgramOptionRow,
} from "@/lib/communications/v2/audienceOptionLabels";
import CommsAudienceMultiSelect from "@/app/adminV2/communications/CommsAudienceMultiSelect";
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
 * Announcements Workspace (Phase 1 / B8E) — draft authoring + the Audience Builder.
 *
 * The audience is a GRAIN + composable FILTERS (family_status / child_enrollment_status /
 * location / program; room is visible-but-disabled until a room option source exists). It is
 * saved as ONE announcement_targets row: target_type='custom', rule.audience_spec={grain,filters}.
 * No fixed buckets. DRAFT-only mutations; scheduling reuses the existing B7 path unchanged.
 */

const ANNOUNCEMENTS_API = "/api/admin/communications/announcements";
const TEMPLATES_API = "/api/admin/communications/templates";
const LOCATION_OPTIONS_API = "/api/admin/location-options";
const PROGRAM_OPTIONS_API = "/api/admin/location-program-categories";
const STATUS_OPTIONS_API = "/api/admin/communications/status-options";
const LOCATION_HIERARCHY_API = "/api/admin/locations?hierarchy=1";

type AnnouncementRow = {
    id: string;
    title: string;
    status: string;
    channels: string[];
    template_id: string | null;
    subject: string | null;
    body: string;
    updated_at: string | null;
};

type TemplateOption = { id: string; name: string; channel: string };
type IdLabel = { id: string; label: string };
type StatusOpt = { status_key: string; label: string };

type PerFilterRow = {
    kind: string;
    status: "resolved" | "unresolved";
    count?: number;
    reason?: string;
};
type RecipientPreviewResult = {
    grain: "families" | "children";
    matched_families: number;
    matched_children?: number | null;
    total_recipients: number;
    counts_by_channel: { email: number; sms: number; in_app: number; messageable: number } | null;
    per_filter: PerFilterRow[];
    unresolved: PerFilterRow[];
    excluded: { opted_out: number };
    sample_recipients: { family: string }[];
    capped: boolean;
};

type Draft = {
    title: string;
    channels: AnnouncementChannel[];
    template_id: string | null;
    subject: string;
    body: string;
};

const EMPTY_DRAFT: Draft = { title: "", channels: [], template_id: null, subject: "", body: "" };

const GRAIN_LABEL: Record<AudienceGrain, string> = { families: "Families", children: "Children (guardians)" };

const SAMPLE_CONTEXT: Record<string, unknown> = {
    person: { first_name: "Mateo", name: "Mateo Rivera" },
    customer: { name: "The Rivera Family" },
    location: { name: "North Campus" },
    org: { name: "Bright Beginnings" },
};

export default function AnnouncementsWorkspace() {
    const siteFilter = useWorkspaceSiteFilter();
    const headerSiteId = siteFilter?.selectedSiteId ?? null;
    const appliedHeaderSiteRef = useRef<string | null>(null);

    const [list, setList] = useState<AnnouncementRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);
    const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
    const [status, setStatus] = useState<string>("draft");
    const [saving, setSaving] = useState(false);

    const [templates, setTemplates] = useState<TemplateOption[]>([]);
    const [templatePreview, setTemplatePreview] = useState<{ subject: string | null; body: string } | null>(null);

    const [locationOptions, setLocationOptions] = useState<IdLabel[]>([]);
    const [programOptions, setProgramOptions] = useState<ProgramOptionRow[]>([]);
    const [locationHierarchy, setLocationHierarchy] = useState<InquiryChildPlacementHierarchyRow[]>([]);
    const [familyStatusOptions, setFamilyStatusOptions] = useState<StatusOpt[]>([]);
    const [childStatusOptions, setChildStatusOptions] = useState<StatusOpt[]>([]);

    // Audience Builder state (grain + composable filters).
    const [grain, setGrain] = useState<AudienceGrain>("families");
    const [familyStatusKeys, setFamilyStatusKeys] = useState<string[]>([]);
    const [childStatusKeys, setChildStatusKeys] = useState<string[]>([]);
    const [locationIds, setLocationIds] = useState<string[]>([]);
    const [programIds, setProgramIds] = useState<string[]>([]);
    const [roomCohortKeys, setRoomCohortKeys] = useState<string[]>([]);

    const [recipientPreview, setRecipientPreview] = useState<RecipientPreviewResult | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [scheduleAt, setScheduleAt] = useState("");
    const [scheduling, setScheduling] = useState(false);
    const bodyRef = useRef<HTMLTextAreaElement | null>(null);

    // Populate the builder from a saved/parsed audience spec (or reset when null).
    const applyAudienceSpec = useCallback((spec: AnnouncementAudienceSpec | null) => {
        setGrain(spec?.grain === "children" ? "children" : "families");
        const filters = spec?.filters ?? [];
        const find = (kind: string) => filters.find((f) => f.kind === kind);
        setFamilyStatusKeys(((find("family_status") as { status_keys?: string[] } | undefined)?.status_keys ?? []).slice());
        setChildStatusKeys(((find("child_enrollment_status") as { status_keys?: string[] } | undefined)?.status_keys ?? []).slice());
        setLocationIds(((find("location") as { location_ids?: string[] } | undefined)?.location_ids ?? []).slice());
        setProgramIds(((find("program") as { program_category_ids?: string[] } | undefined)?.program_category_ids ?? []).slice());
        const room = find("room") as { room_cohort_keys?: string[] } | undefined;
        setRoomCohortKeys((room?.room_cohort_keys ?? []).slice());
    }, []);

    // Build the audience spec from the builder state (room is never written yet).
    const buildAudienceSpec = useCallback((): AnnouncementAudienceSpec => {
        const filters: AnnouncementAudienceSpec["filters"] = [];
        if (familyStatusKeys.length) filters.push({ kind: "family_status", status_keys: familyStatusKeys });
        if (childStatusKeys.length) filters.push({ kind: "child_enrollment_status", status_keys: childStatusKeys });
        if (locationIds.length) filters.push({ kind: "location", location_ids: locationIds });
        if (programIds.length) filters.push({ kind: "program", program_category_ids: programIds });
        if (roomCohortKeys.length && locationIds.length === 1 && programIds.length === 1) {
            filters.push({
                kind: "room",
                room_cohort_keys: roomCohortKeys,
                location_id: locationIds[0]!,
                program_category_id: programIds[0]!,
            });
        }
        return { grain, filters };
    }, [grain, familyStatusKeys, childStatusKeys, locationIds, programIds, roomCohortKeys]);

    const locationLabelById = useMemo(() => new Map(locationOptions.map((l) => [l.id, l.label])), [locationOptions]);
    const familyStatusDisplay = useMemo(() => statusOptionsForDisplay(familyStatusOptions), [familyStatusOptions]);
    const childStatusDisplay = useMemo(() => statusOptionsForDisplay(childStatusOptions), [childStatusOptions]);
    const programDisplay = useMemo(
        () => programOptionsForDisplay(programOptions, locationLabelById, locationIds),
        [programOptions, locationLabelById, locationIds]
    );
    const roomBuilder = useMemo(
        () => roomAudienceBuilderState(locationHierarchy, programOptions, locationIds, programIds),
        [locationHierarchy, programOptions, locationIds, programIds]
    );

    useEffect(() => {
        if (!headerSiteId) return;
        if (appliedHeaderSiteRef.current === headerSiteId) return;
        setLocationIds((prev) => {
            if (prev.length > 0) return prev;
            appliedHeaderSiteRef.current = headerSiteId;
            return [headerSiteId];
        });
    }, [headerSiteId]);

    useEffect(() => {
        setProgramIds((prev) => filterProgramIdsForLocations(prev, programOptions, locationIds));
    }, [locationIds, programOptions]);

    useEffect(() => {
        setRoomCohortKeys((prev) => {
            if (roomBuilder.enabled) return prev;
            return prev.length ? [] : prev;
        });
    }, [roomBuilder.enabled, locationIds, programIds]);

    // ---- loaders ----
    const loadList = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(ANNOUNCEMENTS_API, { credentials: "include" });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Failed to load announcements");
            setList(Array.isArray(json.announcements) ? (json.announcements as AnnouncementRow[]) : []);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load announcements");
        } finally {
            setLoading(false);
        }
    }, []);

    const loadTemplates = useCallback(async () => {
        try {
            const res = await fetch(`${TEMPLATES_API}?status=active`, { credentials: "include" });
            const json = await res.json().catch(() => ({}));
            if (res.ok && Array.isArray(json.templates)) {
                setTemplates(
                    (json.templates as Record<string, unknown>[]).map((t) => ({
                        id: String(t.id),
                        name: String(t.name ?? ""),
                        channel: String(t.channel ?? ""),
                    }))
                );
            }
        } catch {
            /* options are best-effort */
        }
    }, []);

    const loadAudienceOptions = useCallback(async () => {
        try {
            const [locRes, progRes, hierarchyRes] = await Promise.all([
                fetch(LOCATION_OPTIONS_API, { credentials: "include" }),
                fetch(PROGRAM_OPTIONS_API, { credentials: "include" }),
                fetch(LOCATION_HIERARCHY_API, { credentials: "include" }),
            ]);
            const locJson = await locRes.json().catch(() => ({}));
            const progJson = await progRes.json().catch(() => ({}));
            const hierarchyJson = await hierarchyRes.json().catch(() => ({}));
            if (locRes.ok && Array.isArray(locJson.locations)) {
                setLocationOptions(locJson.locations.map((l: Record<string, unknown>) => ({ id: String(l.id), label: String(l.label ?? l.id) })));
            }
            const progArr = (progJson.categories ?? progJson.program_categories ?? progJson.location_program_categories) as
                | Record<string, unknown>[]
                | undefined;
            if (progRes.ok && Array.isArray(progArr)) {
                setProgramOptions(
                    progArr.map((p) => ({
                        id: String(p.id),
                        label: String(p.label ?? p.id),
                        location_id: String(p.location_id ?? ""),
                        key: String(p.key ?? ""),
                    }))
                );
            }
            const hierarchyArr = hierarchyJson.locations as InquiryChildPlacementHierarchyRow[] | undefined;
            if (hierarchyRes.ok && Array.isArray(hierarchyArr)) {
                setLocationHierarchy(hierarchyArr);
            }
        } catch {
            /* options are best-effort */
        }
    }, []);

    const loadStatusOptions = useCallback(async () => {
        const fetchOpts = async (g: "family" | "child"): Promise<StatusOpt[]> => {
            try {
                const res = await fetch(`${STATUS_OPTIONS_API}?grain=${g}`, { credentials: "include" });
                const json = await res.json().catch(() => ({}));
                if (!res.ok || !Array.isArray(json.options)) return [];
                return (json.options as Record<string, unknown>[]).map((o) => ({ status_key: String(o.status_key), label: String(o.label ?? o.status_key) }));
            } catch {
                return [];
            }
        };
        const [fam, child] = await Promise.all([fetchOpts("family"), fetchOpts("child")]);
        setFamilyStatusOptions(fam);
        setChildStatusOptions(child);
    }, []);

    useEffect(() => {
        void loadList();
        void loadTemplates();
        void loadAudienceOptions();
        void loadStatusOptions();
    }, [loadList, loadTemplates, loadAudienceOptions, loadStatusOptions]);

    const loadTemplatePreview = useCallback(async (templateId: string | null) => {
        if (!templateId) {
            setTemplatePreview(null);
            return;
        }
        try {
            const res = await fetch(`${TEMPLATES_API}/${templateId}`, { credentials: "include" });
            const json = await res.json().catch(() => ({}));
            if (res.ok && json.current_version) {
                const cv = json.current_version as Record<string, unknown>;
                setTemplatePreview({
                    subject: cv.subject != null ? String(cv.subject) : null,
                    body: cv.body != null ? String(cv.body) : "",
                });
            } else {
                setTemplatePreview(null);
            }
        } catch {
            setTemplatePreview(null);
        }
    }, []);

    const selectAnnouncement = useCallback(
        async (id: string) => {
            setCreating(false);
            setSelectedId(id);
            setError(null);
            try {
                const [annRes, tgtRes] = await Promise.all([
                    fetch(`${ANNOUNCEMENTS_API}/${id}`, { credentials: "include" }),
                    fetch(`${ANNOUNCEMENTS_API}/${id}/targets`, { credentials: "include" }),
                ]);
                const annJson = await annRes.json().catch(() => ({}));
                if (!annRes.ok) throw new Error(typeof annJson.error === "string" ? annJson.error : "Failed to load announcement");
                const a = annJson.announcement as AnnouncementRow;
                setDraft({
                    title: a.title ?? "",
                    channels: (a.channels ?? []) as AnnouncementChannel[],
                    template_id: a.template_id ?? null,
                    subject: a.subject ?? "",
                    body: a.body ?? "",
                });
                setStatus(a.status ?? "draft");
                void loadTemplatePreview(a.template_id ?? null);

                const tgtJson = await tgtRes.json().catch(() => ({}));
                const rows = Array.isArray(tgtJson.targets) ? (tgtJson.targets as Record<string, unknown>[]) : [];
                const customRow = rows.find((r) => String(r.target_type) === "custom");
                const spec = customRow
                    ? ((customRow.rule as Record<string, unknown> | null)?.audience_spec as AnnouncementAudienceSpec | undefined) ?? null
                    : null;
                applyAudienceSpec(spec);
                setRecipientPreview(null);
            } catch (e) {
                setError(e instanceof Error ? e.message : "Failed to load announcement");
            }
        },
        [loadTemplatePreview, applyAudienceSpec]
    );

    const startCreate = useCallback(() => {
        setCreating(true);
        setSelectedId(null);
        setDraft(EMPTY_DRAFT);
        setStatus("draft");
        applyAudienceSpec(null);
        setTemplatePreview(null);
        setRecipientPreview(null);
    }, [applyAudienceSpec]);

    // ---- recipient preview (READ-ONLY; no send/queue/recipient writes) ----
    const previewRecipients = useCallback(async () => {
        if (!selectedId) return;
        setPreviewLoading(true);
        setError(null);
        try {
            const res = await fetch(`${ANNOUNCEMENTS_API}/${selectedId}/recipient-preview`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ targets: [{ target_type: "custom", rule: { audience_spec: buildAudienceSpec() } }] }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Failed to preview recipients");
            setRecipientPreview(json as RecipientPreviewResult);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to preview recipients");
        } finally {
            setPreviewLoading(false);
        }
    }, [selectedId, buildAudienceSpec]);

    // ---- mutations (draft-only; no send/schedule) ----
    const save = useCallback(async () => {
        setSaving(true);
        setError(null);
        const payload = {
            title: draft.title,
            channels: draft.channels,
            template_id: draft.template_id,
            subject: draft.subject,
            body: draft.body,
        };
        try {
            let id = selectedId;
            if (creating || !id) {
                const res = await fetch(ANNOUNCEMENTS_API, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify(payload),
                });
                const json = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Failed to create announcement");
                id = String((json.announcement as AnnouncementRow).id);
            } else {
                const res = await fetch(`${ANNOUNCEMENTS_API}/${id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify(payload),
                });
                const json = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Failed to save announcement");
            }

            // Persist the audience as ONE custom row: rule.audience_spec={grain,filters}.
            const targetPayload = { targets: [{ target_type: "custom", rule: { audience_spec: buildAudienceSpec() } }] };
            const tRes = await fetch(`${ANNOUNCEMENTS_API}/${id}/targets`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify(targetPayload),
            });
            if (!tRes.ok) {
                const tJson = await tRes.json().catch(() => ({}));
                throw new Error(typeof tJson.error === "string" ? tJson.error : "Failed to save audience");
            }

            await loadList();
            if (id) await selectAnnouncement(id);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to save announcement");
        } finally {
            setSaving(false);
        }
    }, [creating, selectedId, draft, buildAudienceSpec, loadList, selectAnnouncement]);

    const doSchedule = useCallback(async () => {
        if (!selectedId || !scheduleAt) return;
        setScheduling(true);
        setError(null);
        try {
            const iso = new Date(scheduleAt).toISOString();
            const res = await fetch(`${ANNOUNCEMENTS_API}/${selectedId}/schedule`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ send_at: iso }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Failed to schedule");
            await loadList();
            await selectAnnouncement(selectedId);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to schedule");
        } finally {
            setScheduling(false);
        }
    }, [selectedId, scheduleAt, loadList, selectAnnouncement]);

    const doCancelSchedule = useCallback(async () => {
        if (!selectedId) return;
        setScheduling(true);
        setError(null);
        try {
            const res = await fetch(`${ANNOUNCEMENTS_API}/${selectedId}/cancel`, { method: "POST", credentials: "include" });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Failed to cancel");
            await loadList();
            await selectAnnouncement(selectedId);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to cancel schedule");
        } finally {
            setScheduling(false);
        }
    }, [selectedId, loadList, selectAnnouncement]);

    const archive = useCallback(async () => {
        if (!selectedId) return;
        setSaving(true);
        setError(null);
        try {
            const res = await fetch(`${ANNOUNCEMENTS_API}/${selectedId}/archive`, { method: "POST", credentials: "include" });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Failed to archive announcement");
            await loadList();
            await selectAnnouncement(selectedId);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to archive announcement");
        } finally {
            setSaving(false);
        }
    }, [selectedId, loadList, selectAnnouncement]);

    // ---- target toggles ----
    const toggleChannel = useCallback((c: AnnouncementChannel) => {
        setDraft((d) => ({
            ...d,
            channels: d.channels.includes(c) ? d.channels.filter((x) => x !== c) : [...d.channels, c],
        }));
    }, []);

    // live sample preview of the announcement body
    const bodyPreview = useMemo(() => segmentCommunicationTemplate(draft.body, SAMPLE_CONTEXT), [draft.body]);

    const hasSelection = creating || selectedId != null;
    const isArchived = status === "archived";

    return (
        <div data-announcements-workspace="true" className="grid h-full min-h-0 grid-cols-[272px_minmax(0,1fr)_320px] gap-3">
            {/* LEFT — list */}
            <CommsSectionCard title="Announcements" helper="Draft and scheduled broadcasts." data-announcement-list="true" className="flex min-h-0 flex-col !p-0">
                <div className="flex items-center justify-between border-b border-alloy-stone/12 p-3">
                    <span className="text-xs font-semibold text-alloy-midnight/80">All announcements</span>
                    <button type="button" data-announcement-new="true" onClick={startCreate} className={`${COMMS_PRIMARY_BTN_CLASS} !px-2 !py-1 text-[11px]`}>
                        New
                    </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-2">
                    {loading && <div className="p-3 text-[11px] text-alloy-midnight/50">Loading…</div>}
                    {!loading && list.length === 0 && <div className="p-3 text-[11px] text-alloy-midnight/50">No announcements.</div>}
                    {list.map((a) => (
                        <button
                            key={a.id}
                            type="button"
                            data-announcement-row={a.id}
                            onClick={() => void selectAnnouncement(a.id)}
                            className={`mb-1 flex w-full flex-col items-start gap-0.5 rounded-lg border px-2 py-2 text-left transition-colors ${
                                selectedId === a.id
                                    ? "border-alloy-pine/35 bg-alloy-pine/10 shadow-sm"
                                    : "border-transparent hover:border-alloy-stone/15 hover:bg-alloy-stone/8"
                            }`}
                        >
                            <span className="truncate text-[12px] font-medium text-alloy-midnight/90">{a.title || "Untitled"}</span>
                            <span className="text-[10px] uppercase tracking-wide text-alloy-midnight/45">
                                {a.status}
                                {a.channels.length ? ` · ${a.channels.join(", ")}` : ""}
                            </span>
                        </button>
                    ))}
                </div>
            </CommsSectionCard>

            {/* CENTER — draft editor */}
            <section data-announcement-editor="true" className="flex min-h-0 flex-col gap-3 overflow-y-auto">
                {error && <div className="rounded-md bg-red-50 px-2 py-1 text-[11px] text-red-700">{error}</div>}
                {!hasSelection ? (
                    <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-alloy-stone/25 bg-white p-6 text-[12px] text-alloy-midnight/50">
                        Select an announcement or create a new one.
                    </div>
                ) : (
                    <>
                        <div className="flex items-center justify-between px-1">
                            <span className="text-xs font-semibold text-alloy-midnight/80">{creating ? "New announcement" : "Edit announcement"}</span>
                            <span data-announcement-status="true" className="rounded bg-alloy-stone/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-alloy-midnight/55">
                                {status}
                            </span>
                        </div>

                        <CommsSectionCard title="Announcement details" data-announcement-details="true">
                            <label className="flex flex-col gap-1.5">
                                <span className={COMMS_FIELD_LABEL_CLASS}>Title</span>
                                <input
                                    data-announcement-title="true"
                                    value={draft.title}
                                    onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                                    className={COMMS_INPUT_CLASS}
                                />
                            </label>

                            <div data-announcement-channels="true" className="flex flex-col gap-1.5">
                                <span className={COMMS_FIELD_LABEL_CLASS}>Channels</span>
                                <div className="flex flex-wrap gap-1.5">
                                    {ANNOUNCEMENT_CHANNELS.map((c) => {
                                        const on = draft.channels.includes(c);
                                        return (
                                            <button
                                                key={c}
                                                type="button"
                                                data-channel-option={c}
                                                aria-pressed={on}
                                                onClick={() => toggleChannel(c)}
                                                className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium shadow-sm ${
                                                    on
                                                        ? "border-alloy-pine/35 bg-alloy-pine/10 text-alloy-midnight/90"
                                                        : "border-alloy-stone/25 bg-white text-alloy-midnight/65 hover:bg-alloy-stone/8"
                                                }`}
                                            >
                                                {c}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </CommsSectionCard>

                        <CommsSectionCard title="Message content" helper="Optional template seeds subject and body; edit before sending." data-announcement-message="true">
                            <label className="flex flex-col gap-1.5">
                                <span className={COMMS_FIELD_LABEL_CLASS}>Template</span>
                                <select
                                    data-announcement-template="true"
                                    value={draft.template_id ?? ""}
                                    onChange={(e) => {
                                        const v = e.target.value || null;
                                        setDraft((d) => ({ ...d, template_id: v }));
                                        void loadTemplatePreview(v);
                                    }}
                                    className={COMMS_SELECT_CLASS}
                                >
                                    <option value="">No template</option>
                                    {templates.map((t) => (
                                        <option key={t.id} value={t.id}>
                                            {t.name} ({t.channel})
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <label className="flex flex-col gap-1.5">
                                <span className={COMMS_FIELD_LABEL_CLASS}>Subject</span>
                                <input
                                    data-announcement-subject="true"
                                    value={draft.subject}
                                    onChange={(e) => setDraft((d) => ({ ...d, subject: e.target.value }))}
                                    className={COMMS_INPUT_CLASS}
                                />
                            </label>

                            <label className="flex flex-col gap-1.5">
                                <span className={COMMS_FIELD_LABEL_CLASS}>Body</span>
                                <CommsMessageTextToolbar
                                    value={draft.body}
                                    onChange={(body) => setDraft((d) => ({ ...d, body }))}
                                    textareaRef={bodyRef}
                                />
                                <textarea
                                    data-announcement-body="true"
                                    ref={bodyRef}
                                    value={draft.body}
                                    onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
                                    rows={8}
                                    className={`${COMMS_INPUT_CLASS} font-mono`}
                                />
                            </label>
                        </CommsSectionCard>

                        <div className="flex flex-wrap items-center gap-2 px-1">
                            <button
                                type="button"
                                data-announcement-save="true"
                                onClick={() => void save()}
                                disabled={saving || draft.title.trim() === ""}
                                className={COMMS_PRIMARY_BTN_CLASS}
                            >
                                {saving ? "Saving…" : creating ? "Create draft" : "Save draft"}
                            </button>
                            {!creating && selectedId && status === "draft" && (
                                <span data-announcement-schedule="true" className="flex items-center gap-1">
                                    <input
                                        type="datetime-local"
                                        data-announcement-schedule-at="true"
                                        value={scheduleAt}
                                        onChange={(e) => setScheduleAt(e.target.value)}
                                        className="rounded-md border border-alloy-stone/18 px-2 py-1 text-[11px] text-alloy-midnight/80"
                                    />
                                    <button
                                        type="button"
                                        data-announcement-schedule-run="true"
                                        onClick={() => void doSchedule()}
                                        disabled={scheduling || !scheduleAt}
                                        className="rounded-lg border border-[#00A283]/40 px-3 py-1.5 text-xs font-medium text-[#00A283] hover:bg-[#00A283]/5 disabled:opacity-50"
                                    >
                                        {scheduling ? "Scheduling…" : "Schedule"}
                                    </button>
                                </span>
                            )}
                            {!creating && selectedId && status === "scheduled" && (
                                <button
                                    type="button"
                                    data-announcement-cancel-schedule="true"
                                    onClick={() => void doCancelSchedule()}
                                    disabled={scheduling}
                                    className="rounded-lg border border-alloy-stone/25 px-3 py-1.5 text-xs font-medium text-alloy-midnight/70 hover:bg-alloy-stone/8 disabled:opacity-50"
                                >
                                    {scheduling ? "Canceling…" : "Cancel schedule"}
                                </button>
                            )}
                            {!creating && selectedId && !isArchived && (
                                <button
                                    type="button"
                                    data-announcement-archive="true"
                                    onClick={() => void archive()}
                                    disabled={saving}
                                    className="rounded-lg border border-alloy-stone/25 px-3 py-1.5 text-xs font-medium text-alloy-midnight/70 hover:bg-alloy-stone/8 disabled:opacity-50"
                                >
                                    Archive
                                </button>
                            )}
                            {isArchived && <span className="text-[11px] text-alloy-midnight/45">Archived</span>}
                        </div>
                    </>
                )}
            </section>

            {/* RIGHT — template preview + targets + recipient preview */}
            <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto">
                <CommsSectionCard title="Preview" data-announcement-preview="true">
                    {templatePreview && (
                        <div data-announcement-template-preview="true" className="rounded-md border border-alloy-stone/12 bg-alloy-stone/5 px-2 py-1.5">
                            <div className="text-[9px] uppercase tracking-wide text-alloy-midnight/40">From template</div>
                            {templatePreview.subject && <div className="text-[12px] font-medium text-alloy-midnight/85">{templatePreview.subject}</div>}
                            <div className="whitespace-pre-wrap text-[11px] text-alloy-midnight/70">{templatePreview.body}</div>
                        </div>
                    )}
                    <div className="rounded-md border border-alloy-stone/12 bg-alloy-stone/5 px-2 py-1.5">
                        <div className="text-[9px] uppercase tracking-wide text-alloy-midnight/40">Body (sample-rendered)</div>
                        <div className="whitespace-pre-wrap text-[12px] text-alloy-midnight/85">{bodyPreview.plainText}</div>
                    </div>
                </CommsSectionCard>

                <CommsSectionCard
                    title="Audience builder"
                    helper="Choose who to match, then narrow with filters. Messages go to guardians, not children directly."
                    data-announcement-targets="true"
                    data-audience-builder="true"
                >
                    <div>
                        <div className="text-[10px] font-medium text-alloy-midnight/70">Match</div>
                        <div data-audience-grain="true" className="mt-1 flex flex-wrap gap-1.5">
                            {AUDIENCE_GRAINS.map((g) => (
                                <button
                                    key={g}
                                    type="button"
                                    data-grain-option={g}
                                    aria-pressed={grain === g}
                                    onClick={() => setGrain(g)}
                                    className={`rounded-md border px-2 py-1 text-[11px] ${
                                        grain === g ? "border-[#00A283]/50 bg-[#00A283]/10 text-alloy-midnight/90" : "border-alloy-stone/20 text-alloy-midnight/65"
                                    }`}
                                >
                                    {GRAIN_LABEL[g]}
                                </button>
                            ))}
                        </div>
                        {grain === "children" ? (
                            <p className="mt-1.5 text-[10px] text-alloy-midnight/50">Match children, send to guardians.</p>
                        ) : null}
                    </div>

                    <div data-filter-family-status="true">
                        <CommsAudienceMultiSelect
                            label="Family status"
                            options={familyStatusDisplay}
                            selected={familyStatusKeys}
                            onChange={setFamilyStatusKeys}
                            emptyNote="No configured family statuses"
                            data-filter="family-status"
                        />
                    </div>

                    <div data-filter-child-status="true">
                        <CommsAudienceMultiSelect
                            label="Child status"
                            helper="Enrollment status"
                            options={childStatusDisplay}
                            selected={childStatusKeys}
                            onChange={setChildStatusKeys}
                            emptyNote="No configured child statuses"
                            data-filter="child-status"
                        />
                    </div>

                    <div data-target-location="true">
                        <CommsAudienceMultiSelect
                            label="Location"
                            helper={
                                headerSiteId
                                    ? "Workspace location filter applied — adjust here if needed."
                                    : "Schools / sites where children are enrolled or inquiring."
                            }
                            options={locationOptions}
                            selected={locationIds}
                            onChange={setLocationIds}
                            emptyNote="No locations"
                            data-filter="location"
                        />
                    </div>

                    <div data-target-program="true">
                        <CommsAudienceMultiSelect
                            label="Program"
                            helper={locationIds.length > 0 ? "Filtered by selected location(s)." : "Select a location to narrow programs."}
                            options={programDisplay}
                            selected={programIds}
                            onChange={setProgramIds}
                            emptyNote={locationIds.length > 0 ? "No programs for selected locations" : "No programs"}
                            data-filter="program"
                        />
                    </div>

                    <div data-target-room="true">
                        {roomBuilder.enabled ? (
                            <CommsAudienceMultiSelect
                                label="Room/classroom"
                                helper={roomBuilder.helper}
                                options={roomBuilder.options}
                                selected={roomCohortKeys}
                                onChange={setRoomCohortKeys}
                                emptyNote="No rooms for this location and program"
                                data-filter="room"
                            />
                        ) : (
                            <>
                                <div className="text-[10px] font-medium text-alloy-midnight/70">Room/classroom</div>
                                <button
                                    type="button"
                                    disabled
                                    aria-label="Room/classroom (unavailable)"
                                    title={roomBuilder.helper}
                                    className="mt-1 w-full cursor-not-allowed rounded-lg border border-dashed border-alloy-stone/25 bg-white px-2 py-2 text-left text-[11px] text-alloy-midnight/40"
                                >
                                    {roomBuilder.helper}
                                </button>
                            </>
                        )}
                    </div>

                    <p className="text-[9px] leading-snug text-alloy-midnight/45">
                        No filters = all families. Multiple values in a filter are OR; different filters are AND.
                    </p>
                </CommsSectionCard>

                <CommsSectionCard title="Recipient preview" helper="Read-only estimate from the current audience. Nothing is sent." data-recipient-preview="true">
                    <div className="flex items-center justify-end">
                        <button
                            type="button"
                            data-recipient-preview-run="true"
                            onClick={() => void previewRecipients()}
                            disabled={previewLoading || !selectedId}
                            title={!selectedId ? "Save the draft first" : "Estimate recipients from current targets"}
                            className="rounded-md border border-alloy-stone/25 px-2 py-0.5 text-[10px] font-medium text-alloy-midnight/70 hover:bg-alloy-stone/8 disabled:opacity-50"
                        >
                            {previewLoading ? "Estimating…" : "Preview recipients"}
                        </button>
                    </div>

                    {!recipientPreview ? (
                        <p className="text-[10px] text-alloy-midnight/45">
                            {selectedId ? "Run a preview to estimate recipients from the current audience." : "Save the draft to preview recipients."}
                        </p>
                    ) : (
                        <div className="flex flex-col gap-1.5 rounded-md border border-alloy-stone/12 bg-alloy-stone/[0.03] p-2">
                            <div data-recipient-total="true" className="text-[12px] font-semibold text-alloy-midnight/90">
                                {recipientPreview.matched_families} families
                                {recipientPreview.grain === "children" && recipientPreview.matched_children != null
                                    ? ` · ${recipientPreview.matched_children} children matched`
                                    : ""}
                                {" · "}
                                {recipientPreview.total_recipients} recipients (guardians)
                            </div>
                            {recipientPreview.counts_by_channel && (
                                <div data-recipient-channels="true" className="text-[10px] text-alloy-midnight/65">
                                    Reachable — email {recipientPreview.counts_by_channel.email} · SMS {recipientPreview.counts_by_channel.sms} · in-app{" "}
                                    {recipientPreview.counts_by_channel.in_app}
                                </div>
                            )}
                            <div data-recipient-by-filter="true" className="flex flex-col gap-0.5">
                                {recipientPreview.per_filter.map((f, i) => (
                                    <div key={`${f.kind}:${i}`} className="flex items-center justify-between text-[10px]">
                                        <span className="text-alloy-midnight/70">{f.kind.replace(/_/g, " ")}</span>
                                        {f.status === "resolved" ? (
                                            <span className="text-alloy-midnight/85">{f.count ?? 0}</span>
                                        ) : (
                                            <span className="text-amber-600">unresolved</span>
                                        )}
                                    </div>
                                ))}
                            </div>

                            {recipientPreview.unresolved.length > 0 && (
                                <div data-recipient-unresolved="true" className="rounded-md bg-amber-50 px-1.5 py-1">
                                    <div className="text-[9px] uppercase tracking-wide text-amber-700">Unresolved filters</div>
                                    {recipientPreview.unresolved.map((f, i) => (
                                        <div key={`u-${i}`} className="text-[10px] text-amber-700">
                                            {f.kind.replace(/_/g, " ")}: {f.reason ?? "unresolved"}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {recipientPreview.excluded.opted_out > 0 && (
                                <div className="text-[10px] text-alloy-midnight/55">Excluded (opted out): {recipientPreview.excluded.opted_out}</div>
                            )}
                            {recipientPreview.sample_recipients.length > 0 && (
                                <div className="text-[10px] text-alloy-midnight/45">
                                    e.g. {recipientPreview.sample_recipients.map((s) => s.family).join(", ")}
                                </div>
                            )}
                            {recipientPreview.capped && <div className="text-[9px] text-alloy-midnight/40">Counts capped for preview.</div>}
                        </div>
                    )}
                </CommsSectionCard>
            </aside>
        </div>
    );
}
