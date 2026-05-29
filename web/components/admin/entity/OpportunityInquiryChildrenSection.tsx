"use client";

import { prefetchPersonDrawerSnapshot } from "@/lib/admin/prefetchPersonDrawerSnapshot";

import { formatDate } from "@/lib/adminFormatters";
import {
    buildCustomerMemberPatch,
    ensureOpportunityCustomerMemberLink,
    patchCustomerMemberFromInquiryChild,
    patchOpportunityCustomerMemberFromInquiryChild,
    resolveInquiryChildOcmId,
    type InquiryChildOcmPatch,
} from "@/lib/admin/drawer/inquiryChildFieldEdit";
import {
    buildInquiryChildRoomOptionsForSite,
    filterInquiryChildSiteLocationOptions,
    INQUIRY_CHILD_PLACEMENT_SCOPE_LIMITATION,
    inquiryChildPlacementScopeDiagnosticHint,
    isInquiryChildPlacementProgramFieldDisabled,
    type InquiryChildLocationHierarchyRow,
} from "@/lib/admin/drawer/inquiryChildPlacementScope";
import { loadWorkspaceChildcareInquiryOptionSets } from "@/lib/workspace/workspaceChildcareInquiryOptionSets";
import { dedupeAdminFetchWithTtl } from "@/lib/workspace/workspaceAdminFetchDedupe";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import { logInquiryChildrenDebug, summarizeInquiryChildrenRows } from "@/lib/admin/drawer/inquiryChildrenDebug";
import { OPPORTUNITY_INQUIRY_CHILDREN_COLLAPSED_SHELL_CLASS } from "@/lib/admin/drawer/opportunityDrawerLayoutStability";

const INQUIRY_CHILD_ROW_SHELL_MIN_H = "min-h-[2.25rem]";
import {
    INQUIRY_CHILD_ENTITY_TYPE,
    inquiryChildDrawerShowsDesiredStart,
    isInquiryChildNativeFieldKey,
    labelForInquiryChildFieldKey,
    normalizeIsoDateOnly,
    resolveInquiryChildDesiredStartDisplay,
    type InquiryChildFieldDefLike,
} from "@/lib/fields/inquiryChildFieldRegistry";
import { useEffect, useMemo, useRef, useState } from "react";

/** Literal Tailwind classes (must not be composed at runtime). */
const INQUIRY_CHILD_DESKTOP_GRID_8 =
    "grid grid-cols-[220px_120px_140px_130px_130px_150px_150px_130px_minmax(200px,1fr)_70px] items-center gap-2";
const INQUIRY_CHILD_DESKTOP_GRID_7 =
    "grid grid-cols-[220px_120px_130px_130px_150px_150px_130px_minmax(200px,1fr)_70px] items-center gap-2";
const INQUIRY_CHILD_DESKTOP_GRID_8_CUSTOM_1 =
    "grid grid-cols-[220px_120px_140px_120px_150px_150px_130px_minmax(200px,1fr)_70px] items-center gap-2";
const INQUIRY_CHILD_DESKTOP_GRID_8_CUSTOM_2 =
    "grid grid-cols-[220px_120px_140px_120px_120px_150px_150px_130px_minmax(180px,1fr)_70px] items-center gap-2";

function inquiryChildDesktopGridClass(showDesiredStart: boolean, customColumnCount: number): string {
    if (customColumnCount >= 2) return INQUIRY_CHILD_DESKTOP_GRID_8_CUSTOM_2;
    if (customColumnCount === 1) return INQUIRY_CHILD_DESKTOP_GRID_8_CUSTOM_1;
    if (showDesiredStart) return INQUIRY_CHILD_DESKTOP_GRID_8;
    return INQUIRY_CHILD_DESKTOP_GRID_7;
}

const INQUIRY_CHILD_COL_HDR =
    "truncate text-[9px] font-semibold uppercase tracking-wide text-alloy-midnight/45 leading-none";
/** Header row supplies labels; per-field labels stay hidden to keep one compact row. */
const INQUIRY_CHILD_MOBILE_LABEL = "hidden";
const INQUIRY_CHILD_CELL = "min-w-0 self-center";

export type InquiryChildRow = {
    id: string;
    customer_member_id: string;
    person_id: string | null;
    display_name: string | null;
    first_name?: string | null;
    last_name?: string | null;
    linked_on_inquiry?: boolean;
    ocm_id?: string | null;
    dob: string | null;
    age: string | null;
    desired_program_type: string | null;
    desired_program_label: string | null;
    desired_schedule_type: string | null;
    desired_schedule_label: string | null;
    outcome_status_key: string | null;
    outcome_status_label: string | null;
    notes: string | null;
    desired_start_date?: string | null;
    location_id?: string | null;
    location_label?: string | null;
    program_room_cohort_key?: string | null;
    program_room_cohort_label?: string | null;
    custom_fields?: Record<string, unknown>;
};

type OptionItem = { item_key: string; label: string | null };
type StatusRow = { status_key: string; status_label: string | null; sort_order?: number | null };

function normalizeKey(v: string | null | undefined): string {
    return (v ?? "").trim();
}

/** Matches opportunity inquiry outcome keys/labels that imply waitlist (subtle attention styling). */
function isWaitlistedInquiryOutcome(outcomeKey: string, outcomeLabel: string): boolean {
    const k = outcomeKey.toLowerCase();
    const l = outcomeLabel.toLowerCase();
    return k.includes("waitlist") || l.includes("waitlist");
}

function inquiryChildRowAttention(args: {
    dob: string | null;
    desiredProgramType: string;
    desiredScheduleType: string;
    outcomeKey: string;
    outcomeLabel: string;
}): boolean {
    const { dob, desiredProgramType, desiredScheduleType, outcomeKey, outcomeLabel } = args;
    const missingDob = !normalizeKey(dob);
    const missingProgram = !normalizeKey(desiredProgramType);
    const missingSchedule = !normalizeKey(desiredScheduleType);
    const waitlisted = isWaitlistedInquiryOutcome(outcomeKey, outcomeLabel);
    const k = outcomeKey.toLowerCase();
    const l = outcomeLabel.toLowerCase();
    const noFitOrBlocked =
        /no_?fit|no_classroom|blocked|enrollment_?block/i.test(k) ||
        /no fit|no classroom|blocked enrollment|enrollment block/i.test(l);
    return waitlisted || missingDob || missingProgram || missingSchedule || noFitOrBlocked;
}

function useDebouncedPatch(ms: number) {
    const timers = useRef(new Map<string, number>());
    const queue = useRef(new Map<string, Record<string, unknown>>());

    const schedule = (id: string, patch: Record<string, unknown>, run: (id: string, patch: Record<string, unknown>) => void) => {
        const next = { ...(queue.current.get(id) ?? {}), ...patch };
        queue.current.set(id, next);
        const existing = timers.current.get(id);
        if (existing) window.clearTimeout(existing);
        const t = window.setTimeout(() => {
            timers.current.delete(id);
            const p = queue.current.get(id);
            if (!p) return;
            queue.current.delete(id);
            run(id, p);
        }, ms);
        timers.current.set(id, t);
    };

    const flush = (id: string, run: (id: string, patch: Record<string, unknown>) => void) => {
        const existing = timers.current.get(id);
        if (existing) window.clearTimeout(existing);
        timers.current.delete(id);
        const p = queue.current.get(id);
        if (!p) return;
        queue.current.delete(id);
        run(id, p);
    };

    useEffect(() => {
        return () => {
            for (const t of timers.current.values()) window.clearTimeout(t);
            timers.current.clear();
            queue.current.clear();
        };
    }, []);

    return { schedule, flush };
}

type IdentityLocal = { first_name: string; last_name: string; dob: string };

type OcmLocalState = {
    location_id: string;
    program_room_cohort_key: string;
    desired_program_type: string;
    desired_schedule_type: string;
    outcome_status_key: string;
    notes: string;
    desired_start_edit: string;
    custom: Record<string, string>;
};

type LocationItem = InquiryChildLocationHierarchyRow;

export default function OpportunityInquiryChildrenSection({
    rows,
    canEdit,
    opportunityId,
    opportunityDesiredStartDate = null,
    onOpenChild,
    onChildrenMutated,
    /** When true and rows are empty, reserve row shells until drawer owner supplies rows. */
    recordDetailPending = false,
    /** When true, outer EntityDrawerSection already provides premium card chrome — avoid nested heavy cards. */
    embeddedInPremiumSection = false,
    /** When false, defers field-definitions / option-set / status-definitions until edit. */
    enrichmentFetchEnabled = false,
    shellReservedRowCount = 0,
    opportunityDisplayLocationKind,
}: {
    rows: InquiryChildRow[];
    canEdit: boolean;
    opportunityId?: string;
    /** Household/inquiry-level desired start for inheritance display when child OCM value is null. */
    opportunityDesiredStartDate?: string | null;
    onOpenChild?: (row: Pick<InquiryChildRow, "person_id" | "customer_member_id" | "display_name">) => void;
    onChildrenMutated?: () => void;
    recordDetailPending?: boolean;
    embeddedInPremiumSection?: boolean;
    enrichmentFetchEnabled?: boolean;
    shellReservedRowCount?: number;
    /** Resolved opportunity-level location display — used for multi-location operator hint. */
    opportunityDisplayLocationKind?: "none" | "single" | "multiple" | null;
}) {
    const rootCol = embeddedInPremiumSection ? "min-w-0 w-full" : "md:col-span-2";
    const emptyBox = embeddedInPremiumSection
        ? "rounded-md border border-dashed border-alloy-stone/25 bg-white/50 px-3 py-2.5 text-sm text-alloy-midnight/60"
        : "rounded-lg border border-alloy-stone/25 bg-white px-3 py-2 text-sm text-alloy-midnight/60";

    const [programItems, setProgramItems] = useState<OptionItem[]>([]);
    const [scheduleItems, setScheduleItems] = useState<OptionItem[]>([]);
    const [locationItems, setLocationItems] = useState<LocationItem[]>([]);
    const [statusItems, setStatusItems] = useState<StatusRow[]>([]);
    const [loadErr, setLoadErr] = useState<string | null>(null);

    const [fieldDefs, setFieldDefs] = useState<InquiryChildFieldDefLike[]>([]);
    const [local, setLocal] = useState<Record<string, OcmLocalState>>({});
    const [identityLocal, setIdentityLocal] = useState<Record<string, IdentityLocal>>({});
    const [ocmIdByRowKey, setOcmIdByRowKey] = useState<Record<string, string>>({});
    const [savingById, setSavingById] = useState<Record<string, boolean>>({});
    const [savedById, setSavedById] = useState<Record<string, boolean>>({});
    const [errorById, setErrorById] = useState<Record<string, string | null>>({});

    useEffect(() => {
        setLocal((prev) => {
            const next = { ...prev };
            for (const r of rows) {
                if (!r.id) continue;
                const startDisplay = resolveInquiryChildDesiredStartDisplay(
                    r.desired_start_date,
                    opportunityDesiredStartDate
                );
                const custom: Record<string, string> = {};
                for (const [k, v] of Object.entries(r.custom_fields ?? {})) {
                    if (v == null) custom[k] = "";
                    else if (typeof v === "string") custom[k] = v;
                    else custom[k] = String(v);
                }
                next[r.id] = {
                    location_id: normalizeKey(r.location_id),
                    program_room_cohort_key: normalizeKey(r.program_room_cohort_key),
                    desired_program_type: normalizeKey(r.desired_program_type),
                    desired_schedule_type: normalizeKey(r.desired_schedule_type),
                    outcome_status_key: normalizeKey(r.outcome_status_key),
                    notes: (r.notes ?? "").toString(),
                    desired_start_edit: startDisplay.inputValue,
                    custom,
                };
            }
            return next;
        });
        setIdentityLocal((prev) => {
            const next = { ...prev };
            for (const r of rows) {
                if (!r.id) continue;
                const display = (r.display_name ?? "").trim();
                let first = (r.first_name ?? "").trim();
                let last = (r.last_name ?? "").trim();
                if (!first && !last && display) {
                    const parts = display.split(/\s+/).filter(Boolean);
                    first = parts[0] ?? "";
                    last = parts.length > 1 ? parts.slice(1).join(" ") : "";
                }
                next[r.id] = {
                    first_name: first,
                    last_name: last,
                    dob: r.dob ? String(r.dob).slice(0, 10) : "",
                };
            }
            return next;
        });
        setOcmIdByRowKey((prev) => {
            const next = { ...prev };
            for (const r of rows) {
                const ocm = resolveInquiryChildOcmId(r);
                if (ocm) next[r.id] = ocm;
            }
            return next;
        });
    }, [rows]);

    useEffect(() => {
        if (!enrichmentFetchEnabled || rows.length === 0) {
            setProgramItems([]);
            setScheduleItems([]);
            setLocationItems([]);
            setStatusItems([]);
            setLoadErr(null);
            return undefined;
        }
        let cancelled = false;
        async function load() {
            try {
                setLoadErr(null);
                const init = workspaceDataFetchInit();
                const [bundle, statusRes] = await Promise.all([
                    loadWorkspaceChildcareInquiryOptionSets(init),
                    dedupeAdminFetchWithTtl("/api/admin/status-definitions?entity_type=opportunity_customer_members", init, 1500),
                ]);
                const progRes = bundle.programRes;
                const schedRes = bundle.scheduleRes;
                const locRes = bundle.locationsRes;
                const progJson = (await progRes.json().catch(() => ({}))) as { items?: OptionItem[]; error?: string };
                const schedJson = (await schedRes.json().catch(() => ({}))) as { items?: OptionItem[]; error?: string };
                const locJson = (await locRes.json().catch(() => ({}))) as {
                    locations?: Array<{
                        id: string;
                        label?: string | null;
                        city?: string | null;
                        location_type?: string | null;
                        parent_location_id?: string | null;
                    }>;
                    error?: string;
                };
                const statusJson = (await statusRes.json().catch(() => ({}))) as { statuses?: StatusRow[]; error?: string };
                if (!progRes.ok) throw new Error(progJson.error ?? "Failed to load program types");
                if (!schedRes.ok) throw new Error(schedJson.error ?? "Failed to load schedule types");
                if (!locRes.ok) throw new Error(locJson.error ?? "Failed to load locations");
                if (!statusRes.ok) throw new Error(statusJson.error ?? "Failed to load child status options");
                if (cancelled) return;
                setProgramItems((progJson.items ?? []).slice());
                setScheduleItems((schedJson.items ?? []).slice());
                setLocationItems(
                    (locJson.locations ?? []).map((loc) => ({
                        id: String(loc.id),
                        label: (loc.label ?? loc.city ?? loc.id).trim() || loc.id,
                        location_type: loc.location_type ?? null,
                        parent_location_id: loc.parent_location_id ?? null,
                    }))
                );
                setStatusItems((statusJson.statuses ?? []).slice().sort((a, b) => (Number(a.sort_order ?? 100) - Number(b.sort_order ?? 100))));
            } catch (e) {
                if (cancelled) return;
                setLoadErr((e as Error).message);
            }
        }
        load();
        return () => {
            cancelled = true;
        };
    }, [enrichmentFetchEnabled, rows.length]);

    useEffect(() => {
        if (!enrichmentFetchEnabled) {
            setFieldDefs([]);
            return undefined;
        }
        let cancelled = false;
        async function loadDefs() {
            try {
                const res = await fetch(
                    `/api/admin/field-definitions?entity_type=${encodeURIComponent(INQUIRY_CHILD_ENTITY_TYPE)}`,
                    { credentials: "include" }
                );
                const json = (await res.json().catch(() => ({}))) as {
                    field_definitions?: InquiryChildFieldDefLike[];
                };
                if (!res.ok || cancelled) return;
                setFieldDefs((json.field_definitions ?? []).filter((d) => d.is_active !== false));
            } catch {
                if (!cancelled) setFieldDefs([]);
            }
        }
        void loadDefs();
        return () => {
            cancelled = true;
        };
    }, [enrichmentFetchEnabled]);

    const showDesiredStartColumn = inquiryChildDrawerShowsDesiredStart(fieldDefs);
    const desiredStartLabel = labelForInquiryChildFieldKey(fieldDefs, "desired_start_date", "Desired start");
    const locationLabel = labelForInquiryChildFieldKey(fieldDefs, "location_id", "Location");
    const programLabel = labelForInquiryChildFieldKey(fieldDefs, "desired_program_type", "Program");
    const roomLabel = labelForInquiryChildFieldKey(fieldDefs, "program_room_cohort_key", "Room");
    const scheduleLabel = labelForInquiryChildFieldKey(fieldDefs, "desired_schedule_type", "Schedule");
    const statusLabel = labelForInquiryChildFieldKey(fieldDefs, "outcome_status_key", "Status");
    const customDrawerDefs = useMemo(
        () =>
            fieldDefs.filter(
                (d) =>
                    !d.is_system &&
                    !isInquiryChildNativeFieldKey(d.field_key) &&
                    d.is_visible_in_drawer !== false &&
                    (d.field_type === "text" || d.field_type === "date")
            ),
        [fieldDefs]
    );
    const desktopGridClass = useMemo(
        () => inquiryChildDesktopGridClass(showDesiredStartColumn, customDrawerDefs.length),
        [showDesiredStartColumn, customDrawerDefs.length]
    );

    const siteOptions = useMemo(
        () => filterInquiryChildSiteLocationOptions(locationItems),
        [locationItems]
    );
    const programLabelByKey = useMemo(() => new Map(programItems.map((i) => [i.item_key, i.label ?? i.item_key])), [programItems]);
    const siteLabelById = useMemo(
        () => new Map(siteOptions.map((i) => [i.id, i.label])),
        [siteOptions]
    );
    const roomLabelByKey = useMemo(() => {
        const m = new Map<string, string>();
        for (const loc of locationItems) {
            if (String(loc.location_type ?? "").trim() !== "unit") continue;
            m.set(String(loc.id), (loc.label ?? loc.id).trim() || String(loc.id));
        }
        return m;
    }, [locationItems]);
    const scheduleLabelByKey = useMemo(() => new Map(scheduleItems.map((i) => [i.item_key, i.label ?? i.item_key])), [scheduleItems]);
    const statusLabelByKey = useMemo(
        () => new Map(statusItems.map((s) => [s.status_key, s.status_label ?? s.status_key])),
        [statusItems]
    );

    const debounced = useDebouncedPatch(600);

    const resolveOcmIdForRow = async (row: InquiryChildRow): Promise<string> => {
        const cached = ocmIdByRowKey[row.id];
        if (cached) return cached;
        const existing = resolveInquiryChildOcmId(row);
        if (existing) return existing;
        const oppId = opportunityId?.trim() ?? "";
        const cmId = row.customer_member_id?.trim() ?? "";
        if (!oppId || !cmId) throw new Error("Cannot save inquiry fields for this child row");
        const linked = await ensureOpportunityCustomerMemberLink({
            opportunityId: oppId,
            customerMemberId: cmId,
        });
        setOcmIdByRowKey((p) => ({ ...p, [row.id]: linked.ocmId }));
        onChildrenMutated?.();
        return linked.ocmId;
    };

    const markRowSaveState = (rowKey: string, phase: "saving" | "saved" | "error", message?: string) => {
        if (phase === "saving") {
            setSavingById((p) => ({ ...p, [rowKey]: true }));
            setSavedById((p) => ({ ...p, [rowKey]: false }));
            setErrorById((p) => ({ ...p, [rowKey]: null }));
            return;
        }
        setSavingById((p) => ({ ...p, [rowKey]: false }));
        if (phase === "saved") {
            setSavedById((p) => ({ ...p, [rowKey]: true }));
            window.setTimeout(() => setSavedById((p) => ({ ...p, [rowKey]: false })), 2000);
        }
        if (phase === "error") setErrorById((p) => ({ ...p, [rowKey]: message ?? "Save failed" }));
    };

    const saveOcmPatch = async (row: InquiryChildRow, patch: InquiryChildOcmPatch) => {
        markRowSaveState(row.id, "saving");
        try {
            const ocmId = await resolveOcmIdForRow(row);
            await patchOpportunityCustomerMemberFromInquiryChild(ocmId, patch);
            markRowSaveState(row.id, "saved");
            const oppId = opportunityId?.trim() ?? "";
            const affectsWaitlist = Object.keys(patch).some((k) =>
                ["location_id", "program_room_cohort_key", "desired_program_type", "outcome_status_key"].includes(k)
            );
            if (oppId && affectsWaitlist && typeof window !== "undefined") {
                window.dispatchEvent(
                    new CustomEvent("adminv2:opportunity-updated", {
                        detail: {
                            id: oppId,
                            action_key: "inquiry_child_placement_scope",
                            affects_waitlist: true,
                        },
                    })
                );
            }
        } catch (e) {
            markRowSaveState(row.id, "error", (e as Error).message);
        }
    };

    const debouncedIdentity = useDebouncedPatch(600);

    useEffect(() => {
        logInquiryChildrenDebug("OpportunityInquiryChildrenSection.render", {
            component: "OpportunityInquiryChildrenSection",
            rowCount: rows.length,
            rows: summarizeInquiryChildrenRows(
                rows.map((r) => ({
                    id: r.id,
                    customer_member_id: r.customer_member_id,
                    ocm_id: r.ocm_id,
                    first_name: r.first_name,
                    last_name: r.last_name,
                    display_name: r.display_name,
                    linked_on_inquiry: r.linked_on_inquiry,
                }))
            ),
        });
    }, [rows]);

    const scheduleIdentitySave = (row: InquiryChildRow) => {
        const isMetadataOnly = (row.customer_member_id ?? "").startsWith("metadata_child:");
        if (!canEdit || isMetadataOnly || !row.customer_member_id) return;
        const draft = identityLocal[row.id];
        if (!draft) return;
        const baseline = {
            first_name: (row.first_name ?? "").trim(),
            last_name: (row.last_name ?? "").trim(),
            dob: row.dob ? String(row.dob).slice(0, 10) : "",
        };
        const patch = buildCustomerMemberPatch(draft, baseline);
        if (Object.keys(patch).length === 0) return;
        debouncedIdentity.schedule(`${row.id}:identity`, patch, async (_id, p) => {
            markRowSaveState(row.id, "saving");
            try {
                await patchCustomerMemberFromInquiryChild(row.customer_member_id, p);
                markRowSaveState(row.id, "saved");
                onChildrenMutated?.();
            } catch (e) {
                markRowSaveState(row.id, "error", (e as Error).message);
            }
        });
    };

    const reservedRowCount = Math.max(shellReservedRowCount, recordDetailPending ? 1 : 0);

    if (!rows.length && reservedRowCount > 0) {
        const listWrap = embeddedInPremiumSection
            ? "rounded-md border border-alloy-stone/15 bg-white/75"
            : "rounded-lg border border-alloy-stone/25 bg-white";
        const placeholderGrid = inquiryChildDesktopGridClass(false, 0);
        return (
            <div
                className={`${rootCol} ${OPPORTUNITY_INQUIRY_CHILDREN_COLLAPSED_SHELL_CLASS}`}
                data-inquiry-children-section="OpportunityInquiryChildrenSection"
                data-inquiry-children-shell-placeholder="true"
                data-inquiry-children-placeholder-count={reservedRowCount}
            >
                <div className={`${listWrap} overflow-x-auto`} role="region" aria-label="Inquiry children">
                    <div className="min-w-[1100px]">
                        <div
                            className={`${placeholderGrid} sticky left-0 z-[1] border-b border-alloy-stone/15 bg-alloy-stone/[0.04] px-3 py-2`}
                            data-inquiry-children-header-row="true"
                        >
                            <div className={INQUIRY_CHILD_COL_HDR}>Child</div>
                            <div className={INQUIRY_CHILD_COL_HDR}>DOB / Age</div>
                            <div className={INQUIRY_CHILD_COL_HDR}>{locationLabel}</div>
                            <div className={INQUIRY_CHILD_COL_HDR}>{programLabel}</div>
                            <div className={INQUIRY_CHILD_COL_HDR}>{roomLabel}</div>
                            <div className={INQUIRY_CHILD_COL_HDR}>{scheduleLabel}</div>
                            <div className={INQUIRY_CHILD_COL_HDR}>{statusLabel}</div>
                            <div className={INQUIRY_CHILD_COL_HDR}>Notes</div>
                            <div className={`${INQUIRY_CHILD_COL_HDR} text-right`}>View</div>
                        </div>
                        <div className="divide-y divide-alloy-stone/10">
                            {Array.from({ length: reservedRowCount }, (_, i) => (
                                <div
                                    key={`shell-row-${i}`}
                                    className={`${placeholderGrid} px-3 py-2 ${INQUIRY_CHILD_ROW_SHELL_MIN_H}`}
                                    data-inquiry-children-placeholder-row={i}
                                    aria-hidden
                                >
                                    <div className="h-5 w-32 skeleton-pulse rounded bg-alloy-stone/12" />
                                    <div className="h-5 w-20 skeleton-pulse rounded bg-alloy-stone/10" />
                                    <div className="h-5 w-24 skeleton-pulse rounded bg-alloy-stone/10" />
                                    <div className="h-5 w-24 skeleton-pulse rounded bg-alloy-stone/10" />
                                    <div className="h-5 w-16 skeleton-pulse rounded bg-alloy-stone/10" />
                                    <div className="h-5 w-full skeleton-pulse rounded bg-alloy-stone/8" />
                                    <div className="h-5 w-10 skeleton-pulse rounded bg-alloy-stone/10 justify-self-end" />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (!rows.length) {
        return (
            <div className={`${rootCol} ${emptyBox}`} data-inquiry-children-empty-confirmed="true">
                No children added to this inquiry yet.
            </div>
        );
    }

    const listWrap = embeddedInPremiumSection
        ? "rounded-md border border-alloy-stone/15 bg-white/75"
        : "rounded-lg border border-alloy-stone/25 bg-white";
    const fieldInput =
        "h-7 w-full min-w-0 rounded border border-alloy-stone/35 bg-white px-1.5 py-0 text-[11px] leading-tight text-alloy-midnight/85 disabled:opacity-60";
    const fieldSelect = `${fieldInput} pr-5`;
    const readOnlyText = "block truncate text-[11px] leading-tight text-alloy-midnight/70";

    const rowStatus = (rowId: string) => {
        const err = errorById[rowId];
        if (err) return <span className="text-[10px] font-medium text-red-700">{err}</span>;
        if (savingById[rowId]) return <span className="text-[10px] text-alloy-midnight/45">Saving…</span>;
        if (savedById[rowId]) return <span className="text-[10px] font-medium text-emerald-800/75">Saved</span>;
        return null;
    };

    return (
        <div
            className={rootCol}
            data-component="OpportunityInquiryChildrenSection"
            data-inquiry-children-section="OpportunityInquiryChildrenSection"
        >
            {loadErr ? <p className="mb-2 text-sm text-red-700">{loadErr}</p> : null}
            {opportunityDisplayLocationKind === "multiple" ? (
                <p
                    className="mb-2 text-[10px] leading-snug text-alloy-midnight/50"
                    data-inquiry-children-multi-location="true"
                >
                    Children on this inquiry may have different locations. Set location per child below.
                </p>
            ) : null}
            {enrichmentFetchEnabled && canEdit ? (
                <p className="mb-2 text-[10px] leading-snug text-alloy-midnight/50">{INQUIRY_CHILD_PLACEMENT_SCOPE_LIMITATION}</p>
            ) : null}
            <div className={`${listWrap} overflow-x-auto`} role="region" aria-label="Inquiry children">
                <div className="min-w-[1100px]" data-inquiry-children-desktop-table="true">
                <div
                    className={`${desktopGridClass} sticky left-0 z-[1] border-b border-alloy-stone/15 bg-alloy-stone/[0.04] px-3 py-2`}
                    data-inquiry-children-header-row="true"
                    role="row"
                >
                    <div className={INQUIRY_CHILD_COL_HDR}>Child</div>
                    <div className={INQUIRY_CHILD_COL_HDR}>DOB / Age</div>
                    {showDesiredStartColumn ? <div className={INQUIRY_CHILD_COL_HDR}>{desiredStartLabel}</div> : null}
                    {customDrawerDefs.map((d) => (
                        <div key={d.field_key} className={INQUIRY_CHILD_COL_HDR}>
                            {(d.label ?? d.field_key ?? "").trim()}
                        </div>
                    ))}
                    <div className={INQUIRY_CHILD_COL_HDR}>{locationLabel}</div>
                    <div className={INQUIRY_CHILD_COL_HDR}>{programLabel}</div>
                    <div className={INQUIRY_CHILD_COL_HDR}>{roomLabel}</div>
                    <div className={INQUIRY_CHILD_COL_HDR}>{scheduleLabel}</div>
                    <div className={INQUIRY_CHILD_COL_HDR}>{statusLabel}</div>
                    <div className={INQUIRY_CHILD_COL_HDR}>Notes</div>
                    <div className={`${INQUIRY_CHILD_COL_HDR} text-right`}>View</div>
                </div>
                <div>
                {rows.map((r) => {
                    const name = (r.display_name ?? "").trim() || "—";
                    const isMetadataOnly = (r.customer_member_id ?? "").startsWith("metadata_child:");
                    const age = (r.age ?? "").trim();
                    const dobAge =
                        r.dob ?
                            age ? `${formatDate(r.dob)} · ${age}`
                            :   formatDate(r.dob)
                        :   age || "—";
                    const startFallback = resolveInquiryChildDesiredStartDisplay(
                        r.desired_start_date,
                        opportunityDesiredStartDate
                    );
                    const st: OcmLocalState = local[r.id] ?? {
                        location_id: normalizeKey(r.location_id),
                        program_room_cohort_key: normalizeKey(r.program_room_cohort_key),
                        desired_program_type: normalizeKey(r.desired_program_type),
                        desired_schedule_type: normalizeKey(r.desired_schedule_type),
                        outcome_status_key: normalizeKey(r.outcome_status_key),
                        notes: (r.notes ?? "").toString(),
                        desired_start_edit: startFallback.inputValue,
                        custom: Object.fromEntries(
                            Object.entries(r.custom_fields ?? {}).map(([k, v]) => [
                                k,
                                v == null ? "" : typeof v === "string" ? v : String(v),
                            ])
                        ),
                    };
                    const desiredStartInherited =
                        !normalizeIsoDateOnly(r.desired_start_date) &&
                        !!normalizeIsoDateOnly(opportunityDesiredStartDate);
                    const saving = !!savingById[r.id];
                    const rowCanEdit = canEdit && !isMetadataOnly;
                    const identity = identityLocal[r.id] ?? {
                        first_name: "",
                        last_name: "",
                        dob: r.dob ? String(r.dob).slice(0, 10) : "",
                    };
                    const displayName =
                        [identity.first_name, identity.last_name].filter(Boolean).join(" ").trim() || name;
                    const fallbackProgram =
                        (r.desired_program_label ?? "").trim() ||
                        (st.desired_program_type
                            ? (programLabelByKey.get(st.desired_program_type) ?? st.desired_program_type)
                            : "—");
                    const fallbackSchedule =
                        (r.desired_schedule_label ?? "").trim() ||
                        (st.desired_schedule_type
                            ? (scheduleLabelByKey.get(st.desired_schedule_type) ?? st.desired_schedule_type)
                            : "—");
                    const fallbackOutcome =
                        (r.outcome_status_label ?? "").trim() ||
                        (st.outcome_status_key
                            ? (statusLabelByKey.get(st.outcome_status_key) ?? st.outcome_status_key)
                            : "—");
                    const fallbackSite =
                        (r.location_label ?? "").trim() ||
                        (st.location_id ? (siteLabelById.get(st.location_id) ?? st.location_id) : "—");
                    const fallbackCohort =
                        (r.program_room_cohort_label ?? "").trim() ||
                        (st.program_room_cohort_key
                            ? (roomLabelByKey.get(st.program_room_cohort_key) ?? st.program_room_cohort_key)
                            : "—");
                    const programFieldsDisabled = isInquiryChildPlacementProgramFieldDisabled(st.location_id);
                    const rowRoomOptions = buildInquiryChildRoomOptionsForSite(locationItems, st.location_id);
                    const placementScopeHint = inquiryChildPlacementScopeDiagnosticHint({
                        locationId: st.location_id,
                        programRoomCohortKey: st.program_room_cohort_key,
                    });
                    const attention = inquiryChildRowAttention({
                        dob: r.dob,
                        desiredProgramType: st.desired_program_type || normalizeKey(r.desired_program_type),
                        desiredScheduleType: st.desired_schedule_type || normalizeKey(r.desired_schedule_type),
                        outcomeKey: st.outcome_status_key,
                        outcomeLabel: fallbackOutcome,
                    });
                    const rowAttentionClass = attention ? "bg-amber-50/30" : "";
                    const outcomeSelectAttention =
                        attention && isWaitlistedInquiryOutcome(st.outcome_status_key, fallbackOutcome)
                            ? "border-amber-300/80 bg-amber-50/50"
                            : "";

                    return (
                        <div
                            key={r.id}
                            className={`${desktopGridClass} border-t border-alloy-stone/8 px-3 py-2 ${rowAttentionClass}`}
                            data-inquiry-child-row="true"
                            data-inquiry-child-card="true"
                            role="row"
                        >
                            {!r.linked_on_inquiry && rowCanEdit ? (
                                <p className="col-span-full pb-0.5 text-[9px] font-medium leading-tight text-alloy-midnight/45">
                                    Not on inquiry — saving program, schedule, status, or notes links this child.
                                </p>
                            ) : null}
                            {placementScopeHint ? (
                                <p
                                    className="col-span-full pb-0.5 text-[9px] font-medium leading-tight text-amber-700/80"
                                    data-placement-scope-diagnostic="true"
                                >
                                    {placementScopeHint}
                                </p>
                            ) : null}
                                <div className={INQUIRY_CHILD_CELL}>
                                    <div className={INQUIRY_CHILD_MOBILE_LABEL}>Child</div>
                                    {rowCanEdit ? (
                                        <div className="flex min-w-0 gap-1">
                                            <input
                                                value={identity.first_name}
                                                disabled={saving}
                                                onChange={(e) => {
                                                    setIdentityLocal((p) => ({
                                                        ...p,
                                                        [r.id]: { ...identity, first_name: e.target.value },
                                                    }));
                                                    scheduleIdentitySave(r);
                                                }}
                                                className={fieldInput}
                                                placeholder="First"
                                                aria-label={`First name for ${displayName}`}
                                            />
                                            <input
                                                value={identity.last_name}
                                                disabled={saving}
                                                onChange={(e) => {
                                                    setIdentityLocal((p) => ({
                                                        ...p,
                                                        [r.id]: { ...identity, last_name: e.target.value },
                                                    }));
                                                    scheduleIdentitySave(r);
                                                }}
                                                className={fieldInput}
                                                placeholder="Last"
                                                aria-label={`Last name for ${displayName}`}
                                            />
                                        </div>
                                    ) : onOpenChild && displayName !== "—" && !isMetadataOnly ? (
                                        <button
                                            type="button"
                                            onClick={() =>
                                                onOpenChild({
                                                    person_id: r.person_id,
                                                    customer_member_id: r.customer_member_id,
                                                    display_name: r.display_name,
                                                })
                                            }
                                            className="truncate text-left text-[11px] font-semibold text-alloy-blue hover:underline"
                                        >
                                            {displayName}
                                        </button>
                                    ) : (
                                        <span className={`${readOnlyText} font-semibold text-alloy-midnight/85`}>
                                            {displayName}
                                        </span>
                                    )}
                                </div>
                                <div className={INQUIRY_CHILD_CELL}>
                                    <div className={INQUIRY_CHILD_MOBILE_LABEL}>
                                        DOB / Age
                                    </div>
                                    {rowCanEdit ? (
                                        <div className="flex min-w-0 items-center gap-1">
                                            <input
                                                type="date"
                                                value={identity.dob}
                                                disabled={saving}
                                                onChange={(e) => {
                                                    setIdentityLocal((p) => ({
                                                        ...p,
                                                        [r.id]: { ...identity, dob: e.target.value },
                                                    }));
                                                    scheduleIdentitySave(r);
                                                }}
                                                className={`${fieldInput} min-w-0 flex-1`}
                                                aria-label={`Date of birth for ${displayName}`}
                                            />
                                            {age ? (
                                                <span className="shrink-0 tabular-nums text-[9px] text-alloy-midnight/45">
                                                    {age}
                                                </span>
                                            ) : null}
                                        </div>
                                    ) : (
                                        <span className={`${readOnlyText} tabular-nums`}>{dobAge}</span>
                                    )}
                                </div>
                                {showDesiredStartColumn ? (
                                    <div className={INQUIRY_CHILD_CELL}>
                                        <div className={INQUIRY_CHILD_MOBILE_LABEL}>
                                            {desiredStartLabel}
                                        </div>
                                        {rowCanEdit ? (
                                            <>
                                                <input
                                                    type="date"
                                                    value={st.desired_start_edit}
                                                    disabled={saving}
                                                    title={
                                                        desiredStartInherited ?
                                                            `Inherited: ${formatDate(st.desired_start_edit)}`
                                                        :   undefined
                                                    }
                                                    className={`${fieldInput}${desiredStartInherited ? " text-alloy-midnight/55" : ""}`}
                                                    onChange={(e) => {
                                                        const v = e.target.value;
                                                        setLocal((p) => ({
                                                            ...p,
                                                            [r.id]: { ...st, desired_start_edit: v },
                                                        }));
                                                        const oppNorm = normalizeIsoDateOnly(opportunityDesiredStartDate);
                                                        const patchVal = !v.trim() || v === oppNorm ? null : v;
                                                        debounced.schedule(
                                                            r.id,
                                                            { desired_start_date: patchVal },
                                                            (_id, patch) => {
                                                                void saveOcmPatch(r, patch as InquiryChildOcmPatch);
                                                            }
                                                        );
                                                    }}
                                                    aria-label={`${desiredStartLabel} for ${displayName}`}
                                                />
                                            </>
                                        ) : (
                                            <span
                                                className={`${readOnlyText} tabular-nums ${desiredStartInherited ? "text-alloy-midnight/55" : ""}`}
                                                title={
                                                    desiredStartInherited ?
                                                        `Inherited: ${formatDate(st.desired_start_edit)}`
                                                    :   undefined
                                                }
                                            >
                                                {desiredStartInherited ?
                                                    formatDate(st.desired_start_edit)
                                                : st.desired_start_edit ?
                                                    formatDate(st.desired_start_edit)
                                                :   "—"}
                                            </span>
                                        )}
                                    </div>
                                ) : null}
                                {customDrawerDefs.map((def) => {
                                    const customVal = st.custom[def.field_key] ?? "";
                                    return (
                                        <div key={def.field_key} className={INQUIRY_CHILD_CELL}>
                                            <div className={INQUIRY_CHILD_MOBILE_LABEL}>
                                                {(def.label ?? def.field_key).trim()}
                                            </div>
                                            {rowCanEdit ? (
                                                def.field_type === "date" ? (
                                                    <input
                                                        type="date"
                                                        value={customVal}
                                                        disabled={saving}
                                                        className={fieldInput}
                                                        onChange={(e) => {
                                                            const v = e.target.value;
                                                            setLocal((p) => ({
                                                                ...p,
                                                                [r.id]: {
                                                                    ...st,
                                                                    custom: { ...st.custom, [def.field_key]: v },
                                                                },
                                                            }));
                                                    debounced.schedule(
                                                        r.id,
                                                        { [def.field_key]: v || null },
                                                        (_id, patch) => {
                                                            void saveOcmPatch(r, patch as InquiryChildOcmPatch);
                                                        }
                                                    );
                                                        }}
                                                    />
                                                ) : (
                                                    <input
                                                        type="text"
                                                        value={customVal}
                                                        disabled={saving}
                                                        className={fieldInput}
                                                        onChange={(e) => {
                                                            const v = e.target.value;
                                                            setLocal((p) => ({
                                                                ...p,
                                                                [r.id]: {
                                                                    ...st,
                                                                    custom: { ...st.custom, [def.field_key]: v },
                                                                },
                                                            }));
                                                    debounced.schedule(
                                                        r.id,
                                                        { [def.field_key]: v || null },
                                                        (_id, patch) => {
                                                            void saveOcmPatch(r, patch as InquiryChildOcmPatch);
                                                        }
                                                    );
                                                        }}
                                                    />
                                                )
                                            ) : (
                                                <span className={readOnlyText}>
                                                    {customVal ?
                                                        def.field_type === "date" ?
                                                            formatDate(customVal)
                                                        :   customVal
                                                    :   "—"}
                                                </span>
                                            )}
                                        </div>
                                    );
                                })}
                                <div className={INQUIRY_CHILD_CELL}>
                                    <div className={INQUIRY_CHILD_MOBILE_LABEL}>{locationLabel}</div>
                                    {rowCanEdit ? (
                                        <select
                                            value={st.location_id}
                                            disabled={saving}
                                            onChange={(e) => {
                                                const v = e.target.value;
                                                const roomStillValid = rowRoomOptions.some(
                                                    (opt) => opt.cohort_key === st.program_room_cohort_key
                                                );
                                                const nextCohort =
                                                    v && roomStillValid ? st.program_room_cohort_key : "";
                                                setLocal((p) => ({
                                                    ...p,
                                                    [r.id]: {
                                                        ...st,
                                                        location_id: v,
                                                        program_room_cohort_key: nextCohort,
                                                    },
                                                }));
                                                debounced.schedule(
                                                    r.id,
                                                    {
                                                        location_id: v || null,
                                                        ...(nextCohort !== st.program_room_cohort_key ?
                                                            { program_room_cohort_key: nextCohort || null }
                                                        :   {}),
                                                    },
                                                    (_id, patch) => {
                                                        void saveOcmPatch(r, patch as InquiryChildOcmPatch);
                                                    }
                                                );
                                            }}
                                            className={fieldSelect}
                                            aria-label={`${locationLabel} for ${displayName}`}
                                        >
                                            <option value="">—</option>
                                            {siteOptions.map((loc) => (
                                                <option key={loc.id} value={loc.id}>
                                                    {loc.label}
                                                </option>
                                            ))}
                                        </select>
                                    ) : (
                                        <span className={readOnlyText}>{fallbackSite}</span>
                                    )}
                                </div>
                                <div className={INQUIRY_CHILD_CELL}>
                                    <div className={INQUIRY_CHILD_MOBILE_LABEL}>{programLabel}</div>
                                    {rowCanEdit ? (
                                        <select
                                            value={st.desired_program_type}
                                            disabled={saving || programFieldsDisabled}
                                            title={programFieldsDisabled ? INQUIRY_CHILD_PLACEMENT_SCOPE_LIMITATION : undefined}
                                            onChange={(e) => {
                                                const v = e.target.value;
                                                setLocal((p) => ({
                                                    ...p,
                                                    [r.id]: {
                                                        ...st,
                                                        desired_program_type: v,
                                                    },
                                                }));
                                                debounced.schedule(
                                                    r.id,
                                                    { desired_program_type: v || null },
                                                    (_id, p) => {
                                                        void saveOcmPatch(r, p as InquiryChildOcmPatch);
                                                    }
                                                );
                                            }}
                                            className={fieldSelect}
                                            aria-label={`${programLabel} for ${displayName}`}
                                        >
                                            <option value="">(inherit)</option>
                                            {programItems.map((i) => (
                                                <option key={i.item_key} value={i.item_key}>
                                                    {i.label ?? i.item_key}
                                                </option>
                                            ))}
                                        </select>
                                    ) : (
                                        <span className={readOnlyText}>{fallbackProgram}</span>
                                    )}
                                </div>
                                <div className={INQUIRY_CHILD_CELL}>
                                    <div className={INQUIRY_CHILD_MOBILE_LABEL}>{roomLabel}</div>
                                    {rowCanEdit ? (
                                        <select
                                            value={st.program_room_cohort_key}
                                            disabled={saving || programFieldsDisabled}
                                            title={
                                                programFieldsDisabled ?
                                                    "Select a location to choose a room"
                                                :   undefined
                                            }
                                            onChange={(e) => {
                                                const v = e.target.value;
                                                setLocal((p) => ({
                                                    ...p,
                                                    [r.id]: { ...st, program_room_cohort_key: v },
                                                }));
                                                debounced.schedule(
                                                    r.id,
                                                    { program_room_cohort_key: v || null },
                                                    (_id, patch) => {
                                                        void saveOcmPatch(r, patch as InquiryChildOcmPatch);
                                                    }
                                                );
                                            }}
                                            className={fieldSelect}
                                            aria-label={`${roomLabel} for ${displayName}`}
                                        >
                                            <option value="">
                                                {programFieldsDisabled ? "Select location first" : "—"}
                                            </option>
                                            {rowRoomOptions.map((i) => (
                                                <option key={i.cohort_key} value={i.cohort_key}>
                                                    {i.label}
                                                </option>
                                            ))}
                                        </select>
                                    ) : (
                                        <span className={readOnlyText}>{fallbackCohort}</span>
                                    )}
                                </div>
                                <div className={INQUIRY_CHILD_CELL}>
                                    <div className={INQUIRY_CHILD_MOBILE_LABEL}>{scheduleLabel}</div>
                                    {rowCanEdit ? (
                                        <select
                                            value={st.desired_schedule_type}
                                            disabled={saving}
                                            onChange={(e) => {
                                                const v = e.target.value;
                                                setLocal((p) => ({ ...p, [r.id]: { ...st, desired_schedule_type: v } }));
                                                debounced.schedule(r.id, { desired_schedule_type: v || null }, (_id, patch) => {
                                                    void saveOcmPatch(r, patch as InquiryChildOcmPatch);
                                                });
                                            }}
                                            className={fieldSelect}
                                            aria-label={`${scheduleLabel} for ${displayName}`}
                                        >
                                            <option value="">(inherit)</option>
                                            {scheduleItems.map((i) => (
                                                <option key={i.item_key} value={i.item_key}>
                                                    {i.label ?? i.item_key}
                                                </option>
                                            ))}
                                        </select>
                                    ) : (
                                        <span className={readOnlyText}>{fallbackSchedule}</span>
                                    )}
                                </div>
                                <div className={INQUIRY_CHILD_CELL}>
                                    <div className={INQUIRY_CHILD_MOBILE_LABEL}>{statusLabel}</div>
                                    {rowCanEdit ? (
                                        <select
                                            value={st.outcome_status_key}
                                            disabled={saving}
                                            onChange={(e) => {
                                                const v = e.target.value;
                                                setLocal((p) => ({ ...p, [r.id]: { ...st, outcome_status_key: v } }));
                                                debounced.schedule(r.id, { outcome_status_key: v || null }, (_id, patch) => {
                                                    void saveOcmPatch(r, patch as InquiryChildOcmPatch);
                                                });
                                            }}
                                            className={`${fieldSelect} ${outcomeSelectAttention}`}
                                            aria-label={`${statusLabel} for ${displayName}`}
                                        >
                                            <option value="">—</option>
                                            {statusItems.map((s) => (
                                                <option key={s.status_key} value={s.status_key}>
                                                    {s.status_label ?? s.status_key}
                                                </option>
                                            ))}
                                        </select>
                                    ) : (
                                        <span className={readOnlyText}>{fallbackOutcome}</span>
                                    )}
                                </div>
                                <div className={INQUIRY_CHILD_CELL}>
                                    <div className={INQUIRY_CHILD_MOBILE_LABEL}>
                                        Notes
                                    </div>
                                    {rowCanEdit ? (
                                        <input
                                            value={st.notes}
                                            disabled={saving}
                                            onChange={(e) => {
                                                const v = e.target.value;
                                                setLocal((p) => ({ ...p, [r.id]: { ...st, notes: v } }));
                                                debounced.schedule(r.id, { notes: v }, (_id, patch) => {
                                                    void saveOcmPatch(r, patch as InquiryChildOcmPatch);
                                                });
                                            }}
                                            onBlur={() =>
                                                debounced.flush(r.id, (_id, patch) => {
                                                    void saveOcmPatch(r, patch as InquiryChildOcmPatch);
                                                })
                                            }
                                            className={fieldInput}
                                            placeholder="Notes…"
                                            aria-label={`Notes for ${displayName}`}
                                        />
                                    ) : (
                                        <span className={readOnlyText}>
                                            {normalizeKey(r.notes) ? String(r.notes).trim() : "—"}
                                        </span>
                                    )}
                                </div>
                                <div className={`${INQUIRY_CHILD_CELL} flex flex-col items-end justify-center gap-0`}>
                                    {onOpenChild ? (
                                        <button
                                            type="button"
                                            onMouseEnter={() => {
                                                if (r.person_id) prefetchPersonDrawerSnapshot(r.person_id);
                                            }}
                                            onFocus={() => {
                                                if (r.person_id) prefetchPersonDrawerSnapshot(r.person_id);
                                            }}
                                            onClick={() =>
                                                onOpenChild({
                                                    person_id: r.person_id,
                                                    customer_member_id: r.customer_member_id,
                                                    display_name: r.display_name,
                                                })
                                            }
                                            className="shrink-0 whitespace-nowrap text-[10px] font-semibold text-alloy-blue hover:underline"
                                        >
                                            {r.person_id ? "View person" : "View child"}
                                        </button>
                                    ) : null}
                                    {rowCanEdit ? (
                                        <div className="min-h-[0.75rem] text-right leading-none">{rowStatus(r.id)}</div>
                                    ) : null}
                                </div>
                        </div>
                    );
                })}
                </div>
                </div>
            </div>
        </div>
    );
}

