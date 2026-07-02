"use client";

import { buildPrepareParamsFromOpenDrawer } from "@/lib/adminV2/viewModel/drawer/drawerShellPinnedModelSwap";
import { prepareDrawerViewModelDeduped } from "@/lib/adminV2/viewModel/drawer/drawerModelSwapNavigation";
import { PERSON_DRAWER_CHILD_OPEN_SOURCE } from "@/lib/admin/drawer/personDrawerOpenSeed";
import { buildInquiryChildPersonOpenSeed } from "@/lib/admin/drawer/inquiryChildPersonOpen";
import { resolveInquiryChildOpenPersonId } from "@/lib/admin/drawer/inquiryChildPersonOpen";
import { logDrawerHardTrace } from "@/lib/adminV2/drawer/drawerHardTrace";
import {
    drawerLinkPendingKeyForChildFromOpportunity,
    drawerLinkPendingKeyForInquiryChildRow,
    type DrawerLinkPendingActions,
} from "@/lib/adminV2/viewModel/drawer/vmRuntime/drawerLinkPending";

import { formatDate } from "@/lib/adminFormatters";
import {
    buildInquiryChildOcmPatchFromEditorLocal,
    ensureOpportunityCustomerMemberLink,
    inquiryChildEditorRowIsDirty,
    inquiryChildIdentityHasChanges,
    patchInquiryChildIdentityFromDrawer,
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
import { applyInquiryChildPlacementFieldChange } from "@/lib/admin/location/inquiryChildPlacementFieldKeys";
import { resolveProgramSelectOptionsForSite } from "@/lib/admin/location/inquiryChildPlacementOptions";
import { resolveProgramKeyForRoomCascade } from "@/lib/admin/location/inquiryChildLocationMismatch";
import {
    findLocationProgramCategory,
    type LocationProgramCategoryRow,
} from "@/lib/locations/locationProgramCategories";
import { loadWorkspaceChildcareInquiryOptionSets } from "@/lib/workspace/workspaceChildcareInquiryOptionSets";
import { dedupeAdminFetchWithTtl } from "@/lib/workspace/workspaceAdminFetchDedupe";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import { logInquiryChildrenDebug, summarizeInquiryChildrenRows } from "@/lib/admin/drawer/inquiryChildrenDebug";
import { buildQueueRowDisplayPatchFromInquiryChildRow } from "@/lib/admin/opportunityQueueRowDisplayPatch";
import { dispatchOpportunityQueueUpdated } from "@/lib/admin/opportunityQueueRefreshEvent";
import {
    ADMINV2_OPPORTUNITY_FOCUS_INQUIRY_CHILDREN,
    scrollToInquiryChildrenSection,
    type InquiryChildrenFocusField,
} from "@/lib/admin/actions/enrollmentActionClient";
import { dispatchPersonRecordUpdated } from "@/lib/admin/person/dispatchPersonRecordUpdated";
import { resolveChildAgeDisplayLabel } from "@/lib/admin/drawer/childAgeDisplay";
import {
    registerDrawerOperatingEditSection,
    type DrawerOperatingSaveSectionOptions,
} from "@/lib/admin/drawer/drawerOperatingSaveCoordinator";
import { resolveInquiryChildProgramCategoryLabel } from "@/lib/admin/drawer/inquiryChildOcmPlacementDisplay";
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
import ViewPersonDrawerIconButton from "@/components/admin/drawer/ViewPersonDrawerIconButton";
import EnrollmentPlacementIntentReadout from "@/components/childcareOperational/EnrollmentPlacementIntentReadout";
import OperationalEnrollmentOpportunityReadout from "@/components/childcareOperational/OperationalEnrollmentOpportunityReadout";
import { inquiryChildRowMatchesSubjectFocus } from "@/lib/admin/drawer/resolveDrawerSubjectFocusPresentation";
import { buildChildEnrollmentStatusControlVm } from "@/lib/adminV2/viewModel/drawer/opportunity/buildChildEnrollmentStatusControlVm";
import type { LifecycleBuilderStageRecord } from "@/lib/lifecycle/lifecycleBuilderConfig";
import type { StatusMenuItemVm } from "@/lib/adminV2/viewModel/drawer/types";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChildEnrollmentStatusPanel } from "@/components/mutations/ChildEnrollmentStatusPanel";
import type { MutationResult } from "@/lib/mutations/types";
import { useOcmSectionActions } from "@/lib/platform/actions/useOcmSectionActions";

/** Literal Tailwind classes (must not be composed at runtime). DOB column compact; Desired Start wider. */
const INQUIRY_CHILD_DESKTOP_GRID_7 =
    "grid grid-cols-[minmax(0,1.2fr)_minmax(6.5rem,0.72fr)_minmax(0,0.82fr)_minmax(0,0.82fr)_minmax(0,0.82fr)_minmax(0,0.82fr)_minmax(0,1.05fr)] items-center gap-x-1.5 gap-y-1";
const INQUIRY_CHILD_DESKTOP_GRID_8 =
    "grid grid-cols-[minmax(0,1.1fr)_minmax(6.5rem,0.68fr)_minmax(7.75rem,1fr)_minmax(0,0.78fr)_minmax(0,0.78fr)_minmax(0,0.78fr)_minmax(0,0.78fr)_minmax(0,1.05fr)] items-center gap-x-1.5 gap-y-1";
const INQUIRY_CHILD_DESKTOP_GRID_8_CUSTOM_1 =
    "grid grid-cols-[minmax(0,1.1fr)_minmax(6.5rem,0.68fr)_minmax(7.75rem,0.95fr)_minmax(0,0.72fr)_minmax(0,0.82fr)_minmax(0,0.82fr)_minmax(0,0.82fr)_minmax(0,0.82fr)_minmax(0,1.05fr)] items-center gap-x-1.5 gap-y-1";
const INQUIRY_CHILD_DESKTOP_GRID_8_CUSTOM_2 =
    "grid grid-cols-[minmax(0,1.05fr)_minmax(6.5rem,0.65fr)_minmax(7.5rem,0.95fr)_minmax(0,0.68fr)_minmax(0,0.68fr)_minmax(0,0.78fr)_minmax(0,0.78fr)_minmax(0,0.78fr)_minmax(0,0.78fr)_minmax(0,1.05fr)] items-center gap-x-1.5 gap-y-1";

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
const INQUIRY_CHILD_DOB_CELL = "min-w-[6.5rem] shrink-0 self-center";
const INQUIRY_CHILD_DOB_READ =
    "block whitespace-nowrap text-[11px] leading-tight tabular-nums text-alloy-midnight/70";

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
    program_category_id?: string | null;
    /** Stable program key derived from the category FK — display only, never persisted. */
    program_key?: string | null;
    desired_program_label: string | null;
    schedule_type: string | null;
    desired_schedule_label: string | null;
    outcome_status_key: string | null;
    outcome_status_label: string | null;
    notes: string | null;
    start_date?: string | null;
    location_id?: string | null;
    location_label?: string | null;
    program_room_cohort_key?: string | null;
    program_room_cohort_label?: string | null;
    custom_fields?: Record<string, unknown>;
};

type OptionItem = { item_key: string; label: string | null };
type StatusRow = {
    status_key: string;
    status_label: string | null;
    sort_order?: number | null;
    metadata?: Record<string, unknown> | null;
};

type OcmLocalState = {
    location_id: string;
    program_room_cohort_key: string;
    /** Program picker value = location_program_categories.id (the stored FK). */
    program_category_id: string;
    schedule_type: string;
    outcome_status_key: string;
    notes: string;
    desired_start_edit: string;
    custom: Record<string, string>;
};

function normalizeKey(v: string | null | undefined): string {
    return (v ?? "").trim();
}

function ocmPlacementFieldMap(st: OcmLocalState): Record<string, string> {
    return {
        location_id: st.location_id,
        program_category_id: st.program_category_id,
        program_room_cohort_key: st.program_room_cohort_key,
    };
}

function applyOcmPlacementCascade(
    fieldKey: "location_id" | "program_category_id",
    value: string,
    st: OcmLocalState,
): Pick<OcmLocalState, "location_id" | "program_category_id" | "program_room_cohort_key"> {
    const next = applyInquiryChildPlacementFieldChange(fieldKey, value, ocmPlacementFieldMap(st));
    return {
        location_id: next.location_id ?? "",
        program_category_id: next.program_category_id ?? "",
        program_room_cohort_key: next.program_room_cohort_key ?? "",
    };
}

/** Keep stale stored values visible until operator changes placement fields. */
function placementSelectOptionsWithCurrent(
    options: { value: string; label: string }[],
    currentValue: string,
    labelForKey: (key: string) => string,
): { value: string; label: string }[] {
    const current = normalizeKey(currentValue);
    if (!current || options.some((o) => o.value === current)) return options;
    return [...options, { value: current, label: labelForKey(current) }];
}

/** Matches opportunity inquiry outcome keys/labels that imply waitlist (subtle attention styling). */
function isWaitlistedInquiryOutcome(outcomeKey: string, outcomeLabel: string): boolean {
    const k = outcomeKey.toLowerCase();
    const l = outcomeLabel.toLowerCase();
    return k.includes("waitlist") || l.includes("waitlist");
}

function inquiryChildRowAttention(args: {
    dob: string | null;
    programCategoryId: string;
    scheduleType: string;
    outcomeKey: string;
    outcomeLabel: string;
}): boolean {
    const { dob, programCategoryId, scheduleType, outcomeKey, outcomeLabel } = args;
    const missingDob = !normalizeKey(dob);
    const missingProgram = !normalizeKey(programCategoryId);
    const missingSchedule = !normalizeKey(scheduleType);
    const waitlisted = isWaitlistedInquiryOutcome(outcomeKey, outcomeLabel);
    const k = outcomeKey.toLowerCase();
    const l = outcomeLabel.toLowerCase();
    const noFitOrBlocked =
        /no_?fit|no_classroom|blocked|enrollment_?block/i.test(k) ||
        /no fit|no classroom|blocked enrollment|enrollment block/i.test(l);
    return waitlisted || missingDob || missingProgram || missingSchedule || noFitOrBlocked;
}

function InquiryChildDrawerIconButton({
    personId,
    customerMemberId,
    displayName,
    onOpenChild,
    row,
    opportunityId,
    opportunityRecord,
    opportunityWorkspaceContext,
    linkPending,
    pendingKey,
}: {
    personId: string | null;
    customerMemberId: string;
    displayName: string;
    onOpenChild?: (row: Pick<InquiryChildRow, "person_id" | "customer_member_id" | "display_name">) => void;
    row: InquiryChildRow;
    opportunityId: string;
    opportunityRecord: Record<string, unknown>;
    opportunityWorkspaceContext?: { work_unit_id: string; department_id: string } | null;
    linkPending?: DrawerLinkPendingActions;
    pendingKey: string | null;
}) {
    if (!onOpenChild) return null;
    const cmId = customerMemberId.trim();
    if (!cmId) return null;
    const resolvedPersonId = resolveInquiryChildOpenPersonId(opportunityRecord, row) ?? personId?.trim() ?? "";
    const iconTargetId = resolvedPersonId || cmId;
    const isPending =
        pendingKey != null && (linkPending?.isPending?.(pendingKey) ?? false);

    const warmChildVm = () => {
        if (!resolvedPersonId) return;
        const openSeed = buildInquiryChildPersonOpenSeed(opportunityRecord, row, resolvedPersonId);
        void prepareDrawerViewModelDeduped(
            buildPrepareParamsFromOpenDrawer({
                type: "persons",
                id: resolvedPersonId,
                source: PERSON_DRAWER_CHILD_OPEN_SOURCE,
                personDrawerOpenSeed: openSeed,
                opportunityWorkspaceContext: opportunityWorkspaceContext ?? null,
            })
        ).catch(() => {
            /* warm must not block UI */
        });
    };

    return (
        <ViewPersonDrawerIconButton
            personId={iconTargetId}
            displayName={displayName}
            recordKind="child"
            isPending={isPending}
            onMouseEnter={warmChildVm}
            onFocus={warmChildVm}
            onPointerDown={warmChildVm}
            onClick={() => {
                logDrawerHardTrace(
                    "child_click",
                    "components/admin/entity/OpportunityInquiryChildrenSection.tsx",
                    {
                        opportunity_id: opportunityId,
                        person_id: row.person_id ?? resolvedPersonId ?? null,
                        customer_member_id: row.customer_member_id,
                        pending_key: pendingKey,
                    }
                );
                onOpenChild({
                    person_id: row.person_id ?? resolvedPersonId ?? null,
                    customer_member_id: row.customer_member_id,
                    display_name: row.display_name,
                });
            }}
        />
    );
}

type IdentityLocal = { first_name: string; last_name: string; dob: string };

type LocationItem = InquiryChildLocationHierarchyRow;

export default function OpportunityInquiryChildrenSection({
    rows,
    canEdit,
    opportunityId,
    opportunityStartDate = null,
    onOpenChild,
    opportunityRecord = {},
    opportunityWorkspaceContext = null,
    linkPending,
    onChildrenMutated,
    /** When true and rows are empty, reserve row shells until drawer owner supplies rows. */
    recordDetailPending = false,
    /** When true, outer EntityDrawerSection already provides premium card chrome — avoid nested heavy cards. */
    embeddedInPremiumSection = false,
    /** When false, defers field-definitions / option-set / status-definitions until edit. */
    enrichmentFetchEnabled = false,
    /** When true, loads program/schedule option labels for read-only display (OCM placement). */
    placementLabelFetchEnabled = false,
    shellReservedRowCount = 0,
    opportunityDisplayLocationKind,
    highlightSubjectIds = [],
    configuredLifecycleStages = null,
}: {
    rows: InquiryChildRow[];
    canEdit: boolean;
    opportunityId?: string;
    /** Household/inquiry-level desired start for inheritance display when child OCM value is null. */
    opportunityStartDate?: string | null;
    onOpenChild?: (row: Pick<InquiryChildRow, "person_id" | "customer_member_id" | "display_name">) => void;
    opportunityRecord?: Record<string, unknown>;
    opportunityWorkspaceContext?: { work_unit_id: string; department_id: string } | null;
    linkPending?: DrawerLinkPendingActions;
    onChildrenMutated?: () => void;
    recordDetailPending?: boolean;
    embeddedInPremiumSection?: boolean;
    enrichmentFetchEnabled?: boolean;
    placementLabelFetchEnabled?: boolean;
    shellReservedRowCount?: number;
    /** Resolved opportunity-level location display — used for multi-location operator hint. */
    opportunityDisplayLocationKind?: "none" | "single" | "multiple" | null;
    /** Queue-row drawer subject ids — highlight matching inquiry child rows. */
    highlightSubjectIds?: string[];
    /** Builder lifecycle stages for progressive child-track status selector. */
    configuredLifecycleStages?: LifecycleBuilderStageRecord[] | null;
}) {
    const rootCol = embeddedInPremiumSection ? "min-w-0 w-full" : "md:col-span-2";
    const emptyBox = embeddedInPremiumSection
        ? "rounded-md border border-dashed border-alloy-stone/25 bg-white/50 px-3 py-2.5 text-sm text-alloy-midnight/60"
        : "rounded-lg border border-alloy-stone/25 bg-white px-3 py-2 text-sm text-alloy-midnight/60";

    const [programItems, setProgramItems] = useState<OptionItem[]>([]);
    const [locationProgramCategories, setLocationProgramCategories] = useState<LocationProgramCategoryRow[]>([]);
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

    // Mutation command state — tracks which child's enrollment status mutation panel is open.
    const [childMutationState, setChildMutationState] = useState<{
        ocmId: string;
        commandKey: string;
        childDisplayName: string | null;
        currentStatusKey: string | null;
        currentStatusLabel: string | null;
    } | null>(null);

    // Resolve OCM-grain actions from action_placements (placement-driven, not hardcoded).
    // Uses the first available OCM id as anchor; result is the same for all children
    // in the section since placements have no per-row conditions at this grain.
    const anchorOcmId = rows.find((r) => r.ocm_id)?.ocm_id ?? null;
    const { actions: ocmSectionActions } = useOcmSectionActions("children", anchorOcmId);

    useEffect(() => {
        setLocal((prev) => {
            const next = { ...prev };
            for (const r of rows) {
                if (!r.id) continue;
                const startDisplay = resolveInquiryChildDesiredStartDisplay(
                    r.start_date,
                    opportunityStartDate
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
                    program_category_id: normalizeKey(r.program_category_id),
                    schedule_type: normalizeKey(r.schedule_type),
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

    const loadPlacementLabels = placementLabelFetchEnabled && rows.length > 0;
    /** Load location/status option sets whenever placement labels load — first paint must show Program + Location. */
    const loadEditorEnrichment =
        (enrichmentFetchEnabled || placementLabelFetchEnabled) && rows.length > 0;

    useEffect(() => {
        if (!loadPlacementLabels && !loadEditorEnrichment) {
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
                    loadEditorEnrichment
                        ? dedupeAdminFetchWithTtl(
                              "/api/admin/status-definitions?entity_type=opportunity_customer_members",
                              init,
                              1500
                          )
                        : Promise.resolve(new Response(JSON.stringify({ definitions: [] }), { status: 200 })),
                ]);
                const progRes = bundle.programRes;
                const schedRes = bundle.scheduleRes;
                const locRes = bundle.locationsRes;
                const categoriesRes = bundle.programCategoriesRes;
                const progJson = (await progRes.json().catch(() => ({}))) as { items?: OptionItem[]; error?: string };
                const categoriesJson = (await categoriesRes.json().catch(() => ({}))) as {
                    categories?: LocationProgramCategoryRow[];
                    error?: string;
                };
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
                if (cancelled) return;
                if (loadPlacementLabels || loadEditorEnrichment) {
                    setProgramItems((progJson.items ?? []).slice());
                    setScheduleItems((schedJson.items ?? []).slice());
                    if (categoriesRes.ok) {
                        setLocationProgramCategories((categoriesJson.categories ?? []).slice());
                    }
                }
                if (loadEditorEnrichment) {
                    if (!locRes.ok) throw new Error(locJson.error ?? "Failed to load locations");
                    if (!statusRes.ok) throw new Error(statusJson.error ?? "Failed to load child status options");
                    setLocationItems(
                        (locJson.locations ?? []).map((loc) => ({
                            id: String(loc.id),
                            label: (loc.label ?? loc.city ?? loc.id).trim() || loc.id,
                            location_type: loc.location_type ?? null,
                            parent_location_id: loc.parent_location_id ?? null,
                        }))
                    );
                    setStatusItems(
                        (statusJson.statuses ?? [])
                            .map((s) => ({
                                status_key: s.status_key,
                                status_label: s.status_label ?? null,
                                sort_order: s.sort_order ?? null,
                                metadata:
                                    s.metadata != null && typeof s.metadata === "object" && !Array.isArray(s.metadata)
                                        ? (s.metadata as Record<string, unknown>)
                                        : null,
                            }))
                            .sort((a, b) => Number(a.sort_order ?? 100) - Number(b.sort_order ?? 100))
                    );
                }
            } catch (e) {
                if (cancelled) return;
                setLoadErr((e as Error).message);
            }
        }
        load();
        return () => {
            cancelled = true;
        };
    }, [loadPlacementLabels, loadEditorEnrichment, rows.length]);

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
    const desiredStartLabel = labelForInquiryChildFieldKey(fieldDefs, "start_date", "Desired start");
    const locationLabel = labelForInquiryChildFieldKey(fieldDefs, "location_id", "Location");
    const programLabel = labelForInquiryChildFieldKey(fieldDefs, "program_category_id", "Program");
    const roomLabel = labelForInquiryChildFieldKey(fieldDefs, "program_room_cohort_key", "Room");
    const scheduleLabel = labelForInquiryChildFieldKey(fieldDefs, "schedule_type", "Schedule");
    const statusLabel = labelForInquiryChildFieldKey(fieldDefs, "outcome_status_key", "Status");

    const childStatusMenuForRow = useCallback(
        (currentStatusKey: string): StatusMenuItemVm[] | null => {
            if (!configuredLifecycleStages?.length || !statusItems.length) return null;
            const vm = buildChildEnrollmentStatusControlVm({
                currentStatusKey,
                statusDefs: statusItems.map((s) => ({
                    id: s.status_key,
                    org_id: null,
                    industry_key: null,
                    entity_type: INQUIRY_CHILD_ENTITY_TYPE,
                    status_key: s.status_key,
                    status_label: s.status_label,
                    sort_order: Number(s.sort_order ?? 100),
                    is_active: true,
                    is_system: false,
                    metadata: s.metadata ?? null,
                })),
                configuredStages: configuredLifecycleStages,
            });
            return vm.renderAs === "dropdown" ? (vm.progressive_menu ?? null) : null;
        },
        [configuredLifecycleStages, statusItems]
    );

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
    const programLabelByKey = useMemo(() => {
        const m = new Map(programItems.map((i) => [i.item_key, i.label ?? i.item_key]));
        for (const c of locationProgramCategories) {
            if (c.is_active === false) continue;
            m.set(c.key, c.label);
        }
        return m;
    }, [programItems, locationProgramCategories]);
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
        const ocmId = await resolveOcmIdForRow(row);
        await patchOpportunityCustomerMemberFromInquiryChild(ocmId, patch);
        const oppId = opportunityId?.trim() ?? "";
        const affectsWaitlist = Object.keys(patch).some((k) =>
            ["location_id", "program_room_cohort_key", "program_category_id", "outcome_status_key"].includes(k)
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
    };

    const identityBaselineForRow = (row: InquiryChildRow) => {
        const display = (row.display_name ?? "").trim();
        let first = (row.first_name ?? "").trim();
        let last = (row.last_name ?? "").trim();
        if (!first && !last && display) {
            const parts = display.split(/\s+/).filter(Boolean);
            first = parts[0] ?? "";
            last = parts.length > 1 ? parts.slice(1).join(" ") : "";
        }
        return {
            first_name: first,
            last_name: last,
            dob: row.dob ? String(row.dob).slice(0, 10) : "",
        };
    };

    const saveInquiryChildRow = useCallback(async (row: InquiryChildRow, options?: { confirmOnly?: boolean }) => {
        const st = local[row.id];
        const identityDraft = identityLocal[row.id];
        if (!st || !identityDraft) return;
        const identityBaseline = identityBaselineForRow(row);
        const customFieldKeys = customDrawerDefs.map((d) => d.field_key);
        if (
            !inquiryChildEditorRowIsDirty({
                row,
                local: st,
                identityDraft,
                identityBaseline,
                opportunityStartDate,
                customFieldKeys,
            })
        ) {
            return;
        }

        markRowSaveState(row.id, "saving");
        try {
            const isMetadataOnly = (row.customer_member_id ?? "").startsWith("metadata_child:");
            if (
                canEdit &&
                !isMetadataOnly &&
                row.customer_member_id &&
                inquiryChildIdentityHasChanges(identityDraft, identityBaseline)
            ) {
                const identityWrite = await patchInquiryChildIdentityFromDrawer({
                    row: { customer_member_id: row.customer_member_id, person_id: row.person_id },
                    draft: identityDraft,
                    baseline: identityBaseline,
                });
                const personId = (row.person_id ?? "").trim();
                if (
                    identityWrite.writeTarget === "person" &&
                    personId &&
                    Object.keys(identityWrite.patch).length > 0
                ) {
                    dispatchPersonRecordUpdated({
                        personId,
                        patch: identityWrite.patch,
                        person: identityWrite.person,
                        source: "inquiry_child_identity",
                        opportunityId: opportunityId ?? null,
                    });
                }
            }
            const ocmPatch = buildInquiryChildOcmPatchFromEditorLocal({
                row,
                local: st,
                opportunityStartDate,
                customFieldKeys,
            });
            if (Object.keys(ocmPatch).length > 0) {
                await saveOcmPatch(row, ocmPatch);
                const oid = (opportunityId ?? "").trim();
                if (oid) {
                    const displayName =
                        [identityDraft.first_name, identityDraft.last_name]
                            .filter(Boolean)
                            .join(" ")
                            .trim() || (row.display_name ?? "").trim();
                    const queuePatch = buildQueueRowDisplayPatchFromInquiryChildRow(
                        {
                            ...row,
                            display_name: displayName || row.display_name,
                            first_name: identityDraft.first_name || row.first_name,
                            last_name: identityDraft.last_name || row.last_name,
                            dob: identityDraft.dob || row.dob,
                            program_category_id:
                                st.program_category_id || row.program_category_id,
                            program_key:
                                resolveProgramKeyForRoomCascade({
                                    program_category_id:
                                        st.program_category_id || normalizeKey(row.program_category_id),
                                    categories: locationProgramCategories,
                                }) ?? row.program_key,
                            schedule_type:
                                st.schedule_type || row.schedule_type,
                            program_room_cohort_key:
                                st.program_room_cohort_key || row.program_room_cohort_key,
                            location_label:
                                (st.location_id ? siteLabelById.get(st.location_id) : null) ??
                                row.location_label,
                        },
                        programLabelByKey
                    );
                    dispatchOpportunityQueueUpdated(oid, "inquiry_children_placement", queuePatch);
                }
            }
            markRowSaveState(row.id, "saved");
            if (!options?.confirmOnly) {
                onChildrenMutated?.();
            }
        } catch (e) {
            markRowSaveState(row.id, "error", (e as Error).message);
        }
    }, [
        canEdit,
        customDrawerDefs,
        local,
        identityLocal,
        locationProgramCategories,
        opportunityStartDate,
        opportunityId,
        onChildrenMutated,
        programLabelByKey,
        siteLabelById,
    ]);

    const customFieldKeys = useMemo(() => customDrawerDefs.map((d) => d.field_key), [customDrawerDefs]);

    const resetEditorStateFromRows = useCallback(() => {
        setLocal((prev) => {
            const next = { ...prev };
            for (const r of rows) {
                if (!r.id) continue;
                const startDisplay = resolveInquiryChildDesiredStartDisplay(
                    r.start_date,
                    opportunityStartDate
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
                    program_category_id: normalizeKey(r.program_category_id),
                    schedule_type: normalizeKey(r.schedule_type),
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
    }, [rows, opportunityStartDate]);

    const inquiryChildrenSectionIsDirty = useCallback(() => {
        return rows.some((r) => {
            const st = local[r.id];
            const identityDraft = identityLocal[r.id];
            if (!st || !identityDraft) return false;
            return inquiryChildEditorRowIsDirty({
                row: r,
                local: st,
                identityDraft,
                identityBaseline: identityBaselineForRow(r),
                opportunityStartDate,
                customFieldKeys,
            });
        });
    }, [rows, local, identityLocal, opportunityStartDate, customFieldKeys]);

    const inquiryChildrenOptimisticSnapshotRef = useRef<{
        local: typeof local;
        identityLocal: typeof identityLocal;
    } | null>(null);

    const dirtyInquiryChildRows = useCallback(() => {
        return rows.filter((r) => {
            const st = local[r.id];
            const identityDraft = identityLocal[r.id];
            if (!st || !identityDraft) return false;
            return inquiryChildEditorRowIsDirty({
                row: r,
                local: st,
                identityDraft,
                identityBaseline: identityBaselineForRow(r),
                opportunityStartDate,
                customFieldKeys,
            });
        });
    }, [rows, local, identityLocal, opportunityStartDate, customFieldKeys]);

    const applyInquiryChildrenOptimistic = useCallback(() => {
        const dirtyRows = dirtyInquiryChildRows();
        if (dirtyRows.length === 0) return;
        inquiryChildrenOptimisticSnapshotRef.current = {
            local: { ...local },
            identityLocal: { ...identityLocal },
        };
        for (const row of dirtyRows) {
            markRowSaveState(row.id, "saved");
            const oid = (opportunityId ?? "").trim();
            if (!oid) continue;
            const identityDraft = identityLocal[row.id];
            const st = local[row.id];
            if (!identityDraft || !st) continue;
            const displayName =
                [identityDraft.first_name, identityDraft.last_name].filter(Boolean).join(" ").trim()
                || (row.display_name ?? "").trim();
            const queuePatch = buildQueueRowDisplayPatchFromInquiryChildRow(
                {
                    ...row,
                    display_name: displayName || row.display_name,
                    first_name: identityDraft.first_name || row.first_name,
                    last_name: identityDraft.last_name || row.last_name,
                    dob: identityDraft.dob || row.dob,
                    program_category_id: st.program_category_id || row.program_category_id,
                    program_key:
                        resolveProgramKeyForRoomCascade({
                            program_category_id:
                                st.program_category_id || normalizeKey(row.program_category_id),
                            categories: locationProgramCategories,
                        }) ?? row.program_key,
                    schedule_type: st.schedule_type || row.schedule_type,
                    program_room_cohort_key: st.program_room_cohort_key || row.program_room_cohort_key,
                    location_label:
                        (st.location_id ? siteLabelById.get(st.location_id) : null) ?? row.location_label,
                },
                programLabelByKey,
            );
            dispatchOpportunityQueueUpdated(oid, "inquiry_children_placement", queuePatch);
        }
    }, [
        dirtyInquiryChildRows,
        identityLocal,
        local,
        locationProgramCategories,
        opportunityId,
        programLabelByKey,
        siteLabelById,
    ]);

    const rollbackInquiryChildrenOptimistic = useCallback(() => {
        const snapshot = inquiryChildrenOptimisticSnapshotRef.current;
        if (snapshot) {
            setLocal(snapshot.local);
            setIdentityLocal(snapshot.identityLocal);
        }
        inquiryChildrenOptimisticSnapshotRef.current = null;
        for (const row of rows) {
            setSavingById((p) => ({ ...p, [row.id]: false }));
            setSavedById((p) => ({ ...p, [row.id]: false }));
            setErrorById((p) => ({ ...p, [row.id]: null }));
        }
    }, [rows]);

    useLayoutEffect(() => {
        if (!canEdit) {
            registerDrawerOperatingEditSection("opportunity_inquiry_children", null);
            return undefined;
        }
        registerDrawerOperatingEditSection("opportunity_inquiry_children", {
            isDirty: inquiryChildrenSectionIsDirty,
            save: async (options?: DrawerOperatingSaveSectionOptions) => {
                const targets = dirtyInquiryChildRows();
                await Promise.all(targets.map((r) => saveInquiryChildRow(r, { confirmOnly: options?.confirmOnly })));
                inquiryChildrenOptimisticSnapshotRef.current = null;
            },
            revert: () => resetEditorStateFromRows(),
            applyOptimistic: applyInquiryChildrenOptimistic,
            rollbackOptimistic: rollbackInquiryChildrenOptimistic,
            saveOrder: 1,
        });
        return () => registerDrawerOperatingEditSection("opportunity_inquiry_children", null);
    }, [
        applyInquiryChildrenOptimistic,
        canEdit,
        dirtyInquiryChildRows,
        inquiryChildrenSectionIsDirty,
        rollbackInquiryChildrenOptimistic,
        resetEditorStateFromRows,
        saveInquiryChildRow,
    ]);

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

    useEffect(() => {
        const oppId = opportunityId?.trim() ?? "";
        if (!oppId || typeof window === "undefined") return;
        const onFocus = (ev: Event) => {
            const ce = ev as CustomEvent<{ opportunity_id?: string | null; field?: InquiryChildrenFocusField | null }>;
            const id = typeof ce.detail?.opportunity_id === "string" ? ce.detail.opportunity_id.trim() : "";
            if (!id || id !== oppId) return;
            scrollToInquiryChildrenSection(ce.detail?.field ?? null);
        };
        window.addEventListener(ADMINV2_OPPORTUNITY_FOCUS_INQUIRY_CHILDREN, onFocus as EventListener);
        return () =>
            window.removeEventListener(ADMINV2_OPPORTUNITY_FOCUS_INQUIRY_CHILDREN, onFocus as EventListener);
    }, [opportunityId]);

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
                <div className={`${listWrap} w-full`} role="region" aria-label="Inquiry children">
                    <div className="w-full">
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
    const fieldSelectStatus = `${fieldInput} pr-5 text-xs leading-snug`;
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
            <EnrollmentPlacementIntentReadout rows={rows} />
            {opportunityId ?
                <OperationalEnrollmentOpportunityReadout
                    opportunityId={opportunityId}
                    opportunityStatusKey={
                        typeof opportunityRecord.status_key === "string" ?
                            opportunityRecord.status_key
                        :   null
                    }
                    rows={rows}
                />
            :   null}
            <div className={`${listWrap} w-full`} role="region" aria-label="Inquiry children">
                <div className="w-full" data-inquiry-children-desktop-table="true">
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
                </div>
                <div>
                {rows.map((r) => {
                    const name = (r.display_name ?? "").trim() || "—";
                    const isMetadataOnly = (r.customer_member_id ?? "").startsWith("metadata_child:");
                    const ageLabel = resolveChildAgeDisplayLabel({
                        person_id: r.person_id,
                        person_date_of_birth: r.person_id && r.dob ? String(r.dob).slice(0, 10) : null,
                        member_dob: r.dob ? String(r.dob).slice(0, 10) : null,
                    });
                    const dobAge =
                        r.dob ?
                            ageLabel ? `${formatDate(r.dob)} · ${ageLabel}`
                            :   formatDate(r.dob)
                        :   ageLabel || "—";
                    const startFallback = resolveInquiryChildDesiredStartDisplay(
                        r.start_date,
                        opportunityStartDate
                    );
                    const st: OcmLocalState = local[r.id] ?? {
                        location_id: normalizeKey(r.location_id),
                        program_room_cohort_key: normalizeKey(r.program_room_cohort_key),
                        program_category_id: normalizeKey(r.program_category_id),
                        schedule_type: normalizeKey(r.schedule_type),
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
                        !normalizeIsoDateOnly(r.start_date) &&
                        !!normalizeIsoDateOnly(opportunityStartDate);
                    const saving = !!savingById[r.id];
                    const rowCanEdit = canEdit && !isMetadataOnly;
                    const identity = identityLocal[r.id] ?? {
                        first_name: "",
                        last_name: "",
                        dob: r.dob ? String(r.dob).slice(0, 10) : "",
                    };
                    const identityBaseline = identityBaselineForRow(r);
                    const rowDirty =
                        rowCanEdit &&
                        inquiryChildEditorRowIsDirty({
                            row: r,
                            local: st,
                            identityDraft: identity,
                            identityBaseline,
                            opportunityStartDate,
                            customFieldKeys: customDrawerDefs.map((d) => d.field_key),
                        });
                    const displayName =
                        [identity.first_name, identity.last_name].filter(Boolean).join(" ").trim() || name;
                    const fallbackProgram =
                        resolveInquiryChildProgramCategoryLabel({
                            program_category_id:
                                st.program_category_id || normalizeKey(r.program_category_id),
                            program_key: normalizeKey(r.program_key) || null,
                            desired_program_label: r.desired_program_label,
                            optionLabelLookup: programLabelByKey,
                            locationProgramCategories,
                        }) ?? "—";
                    const fallbackSchedule =
                        (r.desired_schedule_label ?? "").trim() ||
                        (st.schedule_type
                            ? (scheduleLabelByKey.get(st.schedule_type) ?? st.schedule_type)
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
                    // Option values are category ids — the stored OCM program_category_id FK.
                    const rowProgramOptions = placementSelectOptionsWithCurrent(
                        resolveProgramSelectOptionsForSite(
                            locationItems,
                            st.location_id,
                            programItems,
                            locationProgramCategories,
                            "category_id",
                        ),
                        st.program_category_id,
                        (categoryId) =>
                            findLocationProgramCategory({
                                categories: locationProgramCategories,
                                categoryId,
                                includeInactive: true,
                            })?.label ?? categoryId,
                    );
                    const programFilterKey =
                        resolveProgramKeyForRoomCascade({
                            program_category_id:
                                st.program_category_id || normalizeKey(r.program_category_id),
                            categories: locationProgramCategories,
                        }) ?? undefined;
                    const rowRoomOptions = placementSelectOptionsWithCurrent(
                        buildInquiryChildRoomOptionsForSite(
                            locationItems,
                            st.location_id,
                            programFilterKey,
                        ).map((opt) => ({ value: opt.cohort_key, label: opt.label })),
                        st.program_room_cohort_key,
                        (k) => roomLabelByKey.get(k) ?? k,
                    );
                    const placementScopeHint = inquiryChildPlacementScopeDiagnosticHint({
                        locationId: st.location_id,
                        programRoomCohortKey: st.program_room_cohort_key,
                    });
                    const attention = inquiryChildRowAttention({
                        dob: r.dob,
                        programCategoryId: st.program_category_id || normalizeKey(r.program_category_id),
                        scheduleType: st.schedule_type || normalizeKey(r.schedule_type),
                        outcomeKey: st.outcome_status_key,
                        outcomeLabel: fallbackOutcome,
                    });
                    const subjectFocusHighlight = inquiryChildRowMatchesSubjectFocus(r, highlightSubjectIds);
                    const rowAttentionClass = attention ? "bg-amber-50/30" : "";
                    const rowSubjectFocusClass = subjectFocusHighlight ? "bg-alloy-blue/[0.07] ring-1 ring-inset ring-alloy-blue/20" : "";
                    const outcomeSelectAttention =
                        attention && isWaitlistedInquiryOutcome(st.outcome_status_key, fallbackOutcome)
                            ? "border-amber-300/80 bg-amber-50/50"
                            : "";

                    return (
                        <div
                            key={r.id}
                            className={`${desktopGridClass} border-t border-alloy-stone/8 px-3 py-2 ${rowAttentionClass} ${rowSubjectFocusClass}`}
                            data-inquiry-child-row="true"
                            data-inquiry-child-card="true"
                            data-inquiry-child-queue-subject-focus={subjectFocusHighlight ? "true" : undefined}
                            role="row"
                        >
                            {!r.linked_on_inquiry && rowCanEdit ? (
                                <p className="col-span-full pb-0.5 text-[9px] font-medium leading-tight text-alloy-midnight/45">
                                    Not on inquiry — saving program, schedule, or status links this child.
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
                                    <div className="flex min-w-0 items-center gap-1">
                                        <InquiryChildDrawerIconButton
                                            personId={r.person_id}
                                            customerMemberId={r.customer_member_id}
                                            displayName={displayName}
                                            onOpenChild={onOpenChild && !isMetadataOnly ? onOpenChild : undefined}
                                            row={r}
                                            opportunityId={opportunityId ?? ""}
                                            opportunityRecord={opportunityRecord}
                                            opportunityWorkspaceContext={opportunityWorkspaceContext}
                                            linkPending={linkPending}
                                            pendingKey={
                                                opportunityId ?
                                                    drawerLinkPendingKeyForInquiryChildRow({
                                                        opportunityRecord,
                                                        row: r,
                                                        opportunityId,
                                                        opportunityWorkspaceContext,
                                                    })
                                                :   null
                                            }
                                        />
                                        {rowCanEdit ? (
                                            <>
                                                <input
                                                    value={identity.first_name}
                                                    disabled={saving}
                                                    onChange={(e) => {
                                                        setIdentityLocal((p) => ({
                                                            ...p,
                                                            [r.id]: { ...identity, first_name: e.target.value },
                                                        }));
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
                                                    }}
                                                    className={fieldInput}
                                                    placeholder="Last"
                                                    aria-label={`Last name for ${displayName}`}
                                                />
                                            </>
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
                                </div>
                                <div className={INQUIRY_CHILD_DOB_CELL}>
                                    <div className={INQUIRY_CHILD_MOBILE_LABEL}>
                                        DOB / Age
                                    </div>
                                    {rowCanEdit ? (
                                        <div className="flex items-center gap-1 whitespace-nowrap">
                                            <input
                                                type="date"
                                                value={identity.dob}
                                                disabled={saving}
                                                onChange={(e) => {
                                                    setIdentityLocal((p) => ({
                                                        ...p,
                                                        [r.id]: { ...identity, dob: e.target.value },
                                                    }));
                                                }}
                                                className={`${fieldInput} w-[6.5rem] shrink-0`}
                                                aria-label={`Date of birth for ${displayName}`}
                                            />
                                            {ageLabel ? (
                                                <span className="shrink-0 tabular-nums text-[10px] text-alloy-midnight/55">
                                                    · {ageLabel}
                                                </span>
                                            ) : null}
                                        </div>
                                    ) : (
                                        <span className={INQUIRY_CHILD_DOB_READ}>{dobAge}</span>
                                    )}
                                </div>
                                {showDesiredStartColumn ? (
                                    <div className={INQUIRY_CHILD_CELL} data-inquiry-field="start_date">
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
                                                const placement = applyOcmPlacementCascade(
                                                    "location_id",
                                                    e.target.value,
                                                    st,
                                                );
                                                setLocal((p) => ({
                                                    ...p,
                                                    [r.id]: { ...st, ...placement },
                                                }));
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
                                            value={st.program_category_id}
                                            disabled={saving || programFieldsDisabled}
                                            title={programFieldsDisabled ? INQUIRY_CHILD_PLACEMENT_SCOPE_LIMITATION : undefined}
                                            onChange={(e) => {
                                                const placement = applyOcmPlacementCascade(
                                                    "program_category_id",
                                                    e.target.value,
                                                    st,
                                                );
                                                setLocal((p) => ({
                                                    ...p,
                                                    [r.id]: { ...st, ...placement },
                                                }));
                                            }}
                                            className={fieldSelect}
                                            aria-label={`${programLabel} for ${displayName}`}
                                        >
                                            <option value="">
                                                {programFieldsDisabled ? "Select location first" : "—"}
                                            </option>
                                            {rowProgramOptions.map((i) => (
                                                <option key={i.value} value={i.value}>
                                                    {i.label}
                                                </option>
                                            ))}
                                        </select>
                                    ) : (
                                        <span className={readOnlyText}>{fallbackProgram}</span>
                                    )}
                                </div>
                                <div className={INQUIRY_CHILD_CELL} data-inquiry-field="program_room_cohort_key">
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
                                            }}
                                            className={fieldSelect}
                                            aria-label={`${roomLabel} for ${displayName}`}
                                        >
                                            <option value="">
                                                {programFieldsDisabled ? "Select location first" : "—"}
                                            </option>
                                            {rowRoomOptions.map((i) => (
                                                <option key={i.value} value={i.value}>
                                                    {i.label}
                                                </option>
                                            ))}
                                        </select>
                                    ) : (
                                        <span className={readOnlyText}>{fallbackCohort}</span>
                                    )}
                                </div>
                                <div className={INQUIRY_CHILD_CELL} data-inquiry-field="schedule_type">
                                    <div className={INQUIRY_CHILD_MOBILE_LABEL}>{scheduleLabel}</div>
                                    {rowCanEdit ? (
                                        <select
                                            value={st.schedule_type}
                                            disabled={saving}
                                            onChange={(e) => {
                                                const v = e.target.value;
                                                setLocal((p) => ({ ...p, [r.id]: { ...st, schedule_type: v } }));
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
                                            }}
                                            className={`${fieldSelectStatus} ${outcomeSelectAttention}`}
                                            aria-label={`${statusLabel} for ${displayName}`}
                                            data-child-enrollment-status-select="true"
                                        >
                                            <option value="">—</option>
                                            {(() => {
                                                const progressive = childStatusMenuForRow(st.outcome_status_key);
                                                if (progressive?.length) {
                                                    return progressive.map((item, idx) => {
                                                        if (item.kind === "separator") {
                                                            return (
                                                                <option
                                                                    key={`sep-${idx}`}
                                                                    disabled
                                                                    value={`__sep_${idx}`}
                                                                >
                                                                    {item.label}
                                                                </option>
                                                            );
                                                        }
                                                        if (item.kind === "stage_heading") {
                                                            return (
                                                                <option
                                                                    key={`head-${item.stage_key}`}
                                                                    disabled
                                                                    value={`__head_${item.stage_key}`}
                                                                >
                                                                    {item.label}
                                                                </option>
                                                            );
                                                        }
                                                        return (
                                                            <option key={item.status_key} value={item.status_key}>
                                                                {item.label}
                                                            </option>
                                                        );
                                                    });
                                                }
                                                return statusItems.map((s) => (
                                                    <option key={s.status_key} value={s.status_key}>
                                                        {s.status_label ?? s.status_key}
                                                    </option>
                                                ));
                                            })()}
                                        </select>
                                    ) : (
                                        <span className={`${readOnlyText} text-xs`}>{fallbackOutcome}</span>
                                    )}
                                    {rowCanEdit ? (
                                        <div className="mt-0.5 flex min-h-[0.75rem] flex-wrap items-center gap-1.5 leading-none">
                                            {rowDirty ? (
                                                <span className="text-[9px] font-medium text-amber-800/80">Unsaved</span>
                                            ) : null}
                                            {rowStatus(r.id)}
                                        </div>
                                    ) : null}
                                    {r.ocm_id && ocmSectionActions.length > 0 ? (
                                        <div className="mt-1 flex flex-wrap gap-1.5">
                                            {ocmSectionActions.map((action) => (
                                                <button
                                                    key={action.key}
                                                    type="button"
                                                    className="text-[9px] text-alloy-midnight/50 hover:text-alloy-midnight/80 underline underline-offset-2 transition-colors"
                                                    onClick={() =>
                                                        setChildMutationState({
                                                            ocmId: r.ocm_id!,
                                                            commandKey: action.key,
                                                            childDisplayName: displayName ?? null,
                                                            currentStatusKey: st.outcome_status_key || r.outcome_status_key,
                                                            currentStatusLabel: fallbackOutcome !== "—" ? fallbackOutcome : null,
                                                        })
                                                    }
                                                >
                                                    {action.label}
                                                </button>
                                            ))}
                                        </div>
                                    ) : null}
                                </div>
                        </div>
                    );
                })}
                </div>
                </div>
                {childMutationState && (
                    <ChildEnrollmentStatusPanel
                        ocmId={childMutationState.ocmId}
                        commandKey={childMutationState.commandKey}
                        opportunityId={opportunityId ?? ""}
                        childDisplayName={childMutationState.childDisplayName}
                        currentStatusKey={childMutationState.currentStatusKey}
                        currentStatusLabel={childMutationState.currentStatusLabel}
                        statusOptions={statusItems.map((s) => ({
                            value: s.status_key,
                            label: s.status_label ?? s.status_key,
                        }))}
                        onClose={() => setChildMutationState(null)}
                        onSuccess={(result: Extract<MutationResult, { status: "committed" }>) => {
                            const actionKey = childMutationState.commandKey;
                            setChildMutationState(null);
                            // Optimistically update local state for the mutated row
                            const ocmId = result.subjectId;
                            const newKey = result.newState;
                            setLocal((prev) => {
                                const next = { ...prev };
                                for (const [rowId, st] of Object.entries(next)) {
                                    const rowOcmId = ocmIdByRowKey[rowId];
                                    if (rowOcmId === ocmId) {
                                        next[rowId] = { ...st, outcome_status_key: newKey };
                                    }
                                }
                                return next;
                            });
                            window.dispatchEvent(
                                new CustomEvent("adminv2:opportunity-updated", {
                                    detail: { id: opportunityId, action_key: actionKey },
                                })
                            );
                        }}
                    />
                )}
            </div>
        </div>
    );
}

