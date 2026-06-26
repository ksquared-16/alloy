"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import SectionCard from "@/components/admin/SectionCard";
import SettingsPageHeader from "@/components/adminV2/settings/SettingsPageHeader";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { useEntityLabels } from "@/contexts/EntityLabelsContext";
import type { StatusDef } from "@/app/api/admin/status-definitions/route";
import { ADMIN_STATUS_DEFINITIONS_ENTITY_TYPES } from "@/lib/admin/statusDefinitionsAdminEntityTypes";
import {
    slugifyStatusKey,
    STATUS_KEY_REGEX,
    uniqueStatusKey,
} from "@/lib/admin/slugifyAdminKey";
import {
    buildPersonStatusApplicabilityMetadata,
    formatPersonStatusApplicabilityLabel,
} from "@/lib/admin/person/personStatusApplicability";
import {
    filterPersonStatusRowsForSettingsProfile,
    parsePersonProfileFilterParam,
    personProfileFilterChipHref,
    personStatusDrawerPreviewNotes,
    STATUS_SETTINGS_SECTION_DESCRIPTIONS,
    STATUS_SETTINGS_SECTION_TITLES,
    statusDrawerSourceTagsForEntityType,
    statusDrawerSourceTagsForOcmRow,
    statusDrawerSourceTagsForOpportunityRow,
    statusDrawerSourceTagsForPersonRow,
    type PersonProfileFilterParam,
} from "@/lib/admin/statusSettingsClarity";
import {
    PersonStatusPreviewNotes,
    StatusDrawerSourceBadgeList,
} from "@/components/adminV2/settings/StatusSettingsClarityBadges";
import StatusSettingsInventoryPanel from "@/components/adminV2/settings/StatusSettingsInventoryPanel";
import { ADMIN_V2_SETTINGS_BUSINESS_PROCESSES_PATH } from "@/lib/adminV2/settings/lifecycleSettingsPaths";
import type { StatusDefinitionRow } from "@/lib/admin/statusDefinitionsResolve";
import { buildStatusCategoryCatalog } from "@/lib/lifecycle/statusCategoryCatalog";
import {
    BP_PICKER_VISIBLE_CATEGORY_KEYS,
    STATUS_SETTINGS_CATEGORY_DESCRIPTIONS,
} from "@/lib/lifecycle/statusSettingsCategoryDoctrine";
import type { StatusRollupCategoryKey } from "@/lib/lifecycle/statusRollupV1";

/** Canonical admin-configurable workflow statuses (kept in sync with GET /api/admin/status-definitions unscoped list). */
const ENTITY_TYPES = ADMIN_STATUS_DEFINITIONS_ENTITY_TYPES;

const ENTITY_TYPE_TO_LABEL_KEY: Record<string, string> = {
    opportunities: "opportunities",
    jobs: "jobs",
    schedules: "schedules",
    customers: "customers",
    opportunity_customer_members: "opportunity_customer_members",
    vendors: "vendors",
    service_plan_templates: "service_plan_templates",
    persons: "persons",
    contacts: "contacts",
    locations: "locations",
    documents: "documents",
    payments: "payments",
    subscriptions: "subscriptions",
};

const STATUS_SETTINGS_ENTITY_TYPES = new Set([
    "opportunities",
    "opportunity_customer_members",
    "persons",
]);

function statusDefToRow(row: StatusDef): StatusDefinitionRow {
    return {
        id: row.id,
        org_id: row.org_id ?? "",
        entity_type: row.entity_type,
        status_key: row.status_key,
        status_label: row.status_label,
        sort_order: row.sort_order,
        is_active: row.is_active,
        is_system: row.is_system,
        industry_key: null,
        metadata: row.metadata,
    };
}

const FALLBACK_LABELS: Record<string, string> = {
    opportunities: "Lead / Case Statuses",
    jobs: "Jobs",
    schedules: "Schedules",
    customers: "Customers",
    opportunity_customer_members: "Enrollment Statuses",
    vendors: "Vendors",
    service_plan_templates: "Plan templates",
    persons: "People Statuses",
    contacts: "Contacts",
    locations: "Locations",
    documents: "Documents",
    payments: "Payments",
    subscriptions: "Subscriptions",
};

function entityTypeDisplayLabel(
    entityType: string,
    labels: Record<string, { singular: string | null; plural: string | null }> | null
): string {
    const settingsTitle = STATUS_SETTINGS_SECTION_TITLES[entityType];
    if (settingsTitle) return settingsTitle;
    const key = ENTITY_TYPE_TO_LABEL_KEY[entityType] ?? entityType;
    const entry = labels?.[key];
    const plural = entry?.plural ?? entry?.singular;
    return plural ?? FALLBACK_LABELS[entityType] ?? FALLBACK_LABELS[key] ?? entityType;
}

const STATUSES_DEFAULT_SUBTITLE =
    "Display names for status keys on schedules, jobs, customers, opportunities, vendors, plan templates, and people. Drawers read options from here. Which status changes are allowed is not configured here — see Status transition rules under Settings diagnostics (read-only) or a future Workflow Status Configuration sprint.";

const STATUSES_ADMINV2_SUBTITLE =
    "Manage status names and order by category. Enrollment Statuses carry process movement; Lead / Case Statuses are container state; People Statuses are profile state. Stage rollups are assigned in Business Processes.";

/** Legacy extended hints — merged with STATUS_SETTINGS_SECTION_DESCRIPTIONS where present. */
const STATUS_ENTITY_EXTENDED_HINTS: Partial<Record<string, string>> = {};

const PERSON_PROFILE_CHIP_LABELS: Record<PersonProfileFilterParam, string> = {
    all: "All People",
    person_generic: "Parent/Guardian",
    child_lifecycle: "Child",
};

type PersonStatusApplicabilityMode = "child_lifecycle" | "person_generic" | "both";

export default function StatusesClient({
    basePath = "/admin/system/statuses",
    adminV2Chrome = false,
}: { basePath?: string; adminV2Chrome?: boolean } = {}) {
    const searchParams = useSearchParams();
    const router = useRouter();
    const entityTypeFilter = searchParams.get("entity_type")?.trim() ?? "";
    const personProfileFilter = parsePersonProfileFilterParam(searchParams.get("profile"));
    const { labels } = useEntityLabels();
    const { canMutate } = useAdminAuth();

    const [statuses, setStatuses] = useState<StatusDef[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showInactive, setShowInactive] = useState(false);
    const [actionMessage, setActionMessage] = useState<string | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    const [modalOpen, setModalOpen] = useState(false);
    const [modalEntityType, setModalEntityType] = useState("");
    const [modalKey, setModalKey] = useState("");
    const [modalLabel, setModalLabel] = useState("");
    const [modalAdvancedKey, setModalAdvancedKey] = useState(false);
    const [modalKeyManual, setModalKeyManual] = useState(false);
    const [modalSortOrder, setModalSortOrder] = useState(100);
    const [modalPersonApplicability, setModalPersonApplicability] =
        useState<PersonStatusApplicabilityMode>("child_lifecycle");
    const [modalSaving, setModalSaving] = useState(false);
    const [modalError, setModalError] = useState<string | null>(null);

    const [editingId, setEditingId] = useState<string | null>(null);
    const [editLabel, setEditLabel] = useState("");
    const [editSortOrder, setEditSortOrder] = useState(100);
    const [editActive, setEditActive] = useState(true);
    const [editSaving, setEditSaving] = useState(false);
    const [editError, setEditError] = useState<string | null>(null);
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    const [deleteSaving, setDeleteSaving] = useState(false);

    const [expandedEntityType, setExpandedEntityType] = useState<string | null>(null);
    const [expandedCategoryKey, setExpandedCategoryKey] = useState<StatusRollupCategoryKey | null>(null);
    const [modalEntityTypeLocked, setModalEntityTypeLocked] = useState(false);
    const hasAutoExpandedRef = useRef(false);

    const fetchStatuses = useCallback(async (opts?: { silent?: boolean }) => {
        if (!opts?.silent) {
            setLoading(true);
        }
        setError(null);
        try {
            const params = new URLSearchParams();
            if (entityTypeFilter) {
                params.set("entity_type", entityTypeFilter);
            }
            if (showInactive) {
                params.set("include_inactive", "1");
            }
            const qs = params.toString();
            const url = qs ? `/api/admin/status-definitions?${qs}` : "/api/admin/status-definitions";
            const res = await fetch(url);
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Failed to load statuses");
            setStatuses((json as { statuses?: StatusDef[] }).statuses ?? []);
        } catch (e) {
            setError((e as Error).message);
            if (!opts?.silent) {
                setStatuses([]);
            }
        } finally {
            if (!opts?.silent) {
                setLoading(false);
            }
        }
    }, [entityTypeFilter, showInactive]);

    useEffect(() => {
        fetchStatuses();
    }, [fetchStatuses]);

    useEffect(() => {
        if (entityTypeFilter === "customer_members") {
            router.replace(basePath);
        }
    }, [entityTypeFilter, basePath, router]);

    useEffect(() => {
        if (entityTypeFilter) {
            setExpandedEntityType(entityTypeFilter);
        }
    }, [entityTypeFilter]);

    const openNewModal = (forEntityType?: string) => {
        if (forEntityType != null) {
            setModalEntityType(forEntityType);
            setModalEntityTypeLocked(true);
        } else {
            setModalEntityType(entityTypeFilter || ENTITY_TYPES[0]);
            setModalEntityTypeLocked(!!entityTypeFilter);
        }
        setModalKey("");
        setModalLabel("");
        setModalAdvancedKey(false);
        setModalKeyManual(false);
        setModalSortOrder(100);
        setModalPersonApplicability("child_lifecycle");
        setModalError(null);
        setModalOpen(true);
    };

    const handleCreate = async () => {
        if (!canMutate) return;
        const label = modalLabel.trim();
        if (!label) {
            setModalError("Status label is required.");
            return;
        }
        const reserved = new Set(
            (statusesByEntityType[modalEntityType] ?? []).map((s) => s.status_key)
        );
        const key = (
            modalAdvancedKey && modalKey.trim()
                ? modalKey.trim().toLowerCase()
                : uniqueStatusKey(label, reserved)
        );
        if (!STATUS_KEY_REGEX.test(key)) {
            setModalError("Key must be 2–32 characters: lowercase letters, numbers, underscores only.");
            return;
        }
        if (reserved.has(key)) {
            setModalError("A status with this key already exists for this entity type.");
            return;
        }
        setModalSaving(true);
        setModalError(null);
        try {
            const metadata =
                modalEntityType === "persons"
                    ? buildPersonStatusApplicabilityMetadata(modalPersonApplicability)
                    : {};
            const res = await fetch("/api/admin/status-definitions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    entity_type: modalEntityType,
                    status_key: key,
                    status_label: modalLabel.trim() || null,
                    sort_order: modalSortOrder,
                    is_active: true,
                    metadata,
                }),
            });
            const json = await res.json().catch(() => ({}));
            if (res.status === 409) {
                setModalError((json as { error?: string }).error ?? "A status with this key already exists.");
                return;
            }
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Create failed");
            setModalOpen(false);
            await fetchStatuses();
        } catch (e) {
            setModalError((e as Error).message);
        } finally {
            setModalSaving(false);
        }
    };

    const startEdit = (row: StatusDef) => {
        setEditingId(row.id);
        setEditLabel(row.status_label ?? "");
        setEditSortOrder(row.sort_order);
        setEditActive(row.is_active);
        setEditError(null);
    };

    const cancelEdit = () => {
        setEditingId(null);
        setEditError(null);
    };

    const saveEdit = async () => {
        if (!canMutate || !editingId) return;
        const editingRow = statuses.find((s) => s.id === editingId);
        setEditSaving(true);
        setEditError(null);
        try {
            const patch: Record<string, unknown> = {
                status_label: editLabel.trim() || null,
                sort_order: editSortOrder,
                is_active: editActive,
            };
            const res = await fetch(`/api/admin/status-definitions/${editingId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(patch),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Update failed");
            setEditingId(null);
            await fetchStatuses();
        } catch (e) {
            setEditError((e as Error).message);
        } finally {
            setEditSaving(false);
        }
    };

    const handleDelete = async (row: StatusDef) => {
        if (!canMutate) return;
        if (!row.org_id) {
            setDeleteError("Industry default statuses cannot be deleted here. Add an org override or deactivate via Edit.");
            return;
        }
        setDeleteSaving(true);
        setDeleteError(null);
        setActionMessage(null);
        const previousStatuses = statuses;
        setStatuses((prev) =>
            showInactive
                ? prev.map((s) => (s.id === row.id ? { ...s, is_active: false } : s))
                : prev.filter((s) => s.id !== row.id),
        );
        setDeleteConfirmId(null);
        try {
            const res = await fetch(`/api/admin/status-definitions/${row.id}`, { method: "DELETE" });
            const json = (await res.json().catch(() => ({}))) as {
                error?: string;
                message?: string;
                action?: "deleted" | "inactivated";
                warnings?: string[];
            };
            if (!res.ok) {
                setStatuses(previousStatuses);
                throw new Error(json.error ?? "Delete failed");
            }
            const message =
                json.message ??
                (json.action === "inactivated"
                    ? "Status is used by records, so it was inactivated instead."
                    : "Status deleted.");
            setActionMessage(message);
            if (json.warnings?.length) {
                setActionMessage(`${message} ${json.warnings[0] ?? ""}`.trim());
            }
            if (json.action === "inactivated" && !showInactive) {
                setStatuses((prev) => prev.filter((s) => s.id !== row.id));
            }
            void fetchStatuses({ silent: true });
        } catch (e) {
            setDeleteError((e as Error).message);
        } finally {
            setDeleteSaving(false);
        }
    };

    const filterLabel = entityTypeFilter ? entityTypeDisplayLabel(entityTypeFilter, labels ?? {}) : "";

    const statusesByEntityType = useMemo(() => {
        const map: Record<string, StatusDef[]> = {};
        for (const s of statuses) {
            (map[s.entity_type] = map[s.entity_type] ?? []).push(s);
        }
        return map;
    }, [statuses]);

    const modalPreviewStatusKey = useMemo(() => {
        const label = modalLabel.trim();
        if (!label) return "";
        const reserved = new Set(
            (statusesByEntityType[modalEntityType] ?? []).map((s) => s.status_key)
        );
        return uniqueStatusKey(label, reserved);
    }, [modalLabel, modalEntityType, statusesByEntityType]);

    useEffect(() => {
        if (!modalOpen || modalAdvancedKey || modalKeyManual) return;
        setModalKey(modalPreviewStatusKey);
    }, [modalOpen, modalAdvancedKey, modalKeyManual, modalPreviewStatusKey]);

    const allowedSet = useMemo(() => new Set<string>(ENTITY_TYPES as unknown as string[]), []);

    const sortedEntityTypes = useMemo(() => {
        const keys = Object.keys(statusesByEntityType).filter((t) => allowedSet.has(t));
        const canonicalOrder: string[] = [...ENTITY_TYPES];
        const ordered = canonicalOrder.filter((t) => keys.includes(t));
        const extra = keys.filter((t) => !ordered.includes(t)).sort((a, b) => a.localeCompare(b));
        return [...ordered, ...extra];
    }, [statusesByEntityType, allowedSet]);

    useEffect(() => {
        if (adminV2Chrome || entityTypeFilter || sortedEntityTypes.length !== 1) return;
        if (!hasAutoExpandedRef.current) {
            hasAutoExpandedRef.current = true;
            setExpandedEntityType(sortedEntityTypes[0]);
        }
    }, [adminV2Chrome, entityTypeFilter, sortedEntityTypes]);

    const statusCategorySections = useMemo(() => {
        if (!adminV2Chrome) return [];
        const rows = statuses
            .filter((s) => STATUS_SETTINGS_ENTITY_TYPES.has(s.entity_type))
            .map(statusDefToRow);
        const catalog = buildStatusCategoryCatalog(rows, {
            includeSystemCategories: false,
            categoryKeys: BP_PICKER_VISIBLE_CATEGORY_KEYS,
        });
        const byKey = new Map(statuses.map((s) => [`${s.entity_type}:${s.status_key}`, s] as const));
        return catalog.map((group) => ({
            ...group,
            statusDefs: group.statuses
                .map((s) => byKey.get(`${s.entity_type}:${s.status_key}`))
                .filter((s): s is StatusDef => s != null),
        }));
    }, [adminV2Chrome, statuses]);

    const renderSectionDescription = (entityType: string) => {
        const description = STATUS_SETTINGS_SECTION_DESCRIPTIONS[entityType];
        const extended = STATUS_ENTITY_EXTENDED_HINTS[entityType];
        const tags = statusDrawerSourceTagsForEntityType(entityType);
        const showBusinessProcessesLink =
            adminV2Chrome &&
            (entityType === "opportunities" || entityType === "opportunity_customer_members");
        if (!description && !extended && !tags.length && !showBusinessProcessesLink) return null;
        return (
            <div className="mb-3 space-y-2" data-status-settings-section-description={entityType}>
                {description ?
                    <p className="text-xs leading-snug text-[#59678b]">{description}</p>
                :   null}
                {extended ?
                    <p className="text-[11px] leading-snug text-[#59678b]">{extended}</p>
                :   null}
                {showBusinessProcessesLink ?
                    <p className="text-[11px] leading-snug text-[#59678b]">
                        <Link
                            href={ADMIN_V2_SETTINGS_BUSINESS_PROCESSES_PATH}
                            className="font-medium text-alloy-pine hover:underline"
                        >
                            Open Business Processes
                        </Link>{" "}
                        to assign which statuses roll up into each stage.
                    </p>
                :   null}
                {tags.length ?
                    <StatusDrawerSourceBadgeList tags={tags} />
                :   null}
            </div>
        );
    };

    const renderPersonProfileChips = () => (
        <div
            className="mb-4 flex flex-wrap items-center gap-2"
            data-status-settings-person-profile-chips="true"
        >
            <span className="text-xs font-medium text-[#59678b]">Filter by drawer profile:</span>
            {(Object.keys(PERSON_PROFILE_CHIP_LABELS) as PersonProfileFilterParam[])
                .filter((profile) => !adminV2Chrome || profile !== "child_lifecycle")
                .map((profile) => {
                const active = personProfileFilter === profile;
                return (
                    <Link
                        key={profile}
                        href={personProfileFilterChipHref(basePath, profile)}
                        className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                            active ?
                                "border-alloy-midnight/30 bg-alloy-midnight text-white"
                            :   "border-[#e6e8ec] bg-white text-[#59678b] hover:bg-[#eef0f4]"
                        }`}
                        data-status-settings-profile-chip={profile}
                        aria-current={active ? "true" : undefined}
                    >
                        {PERSON_PROFILE_CHIP_LABELS[profile]}
                    </Link>
                );
            })}
        </div>
    );

    const renderTable = (rows: StatusDef[], emptyMessage: string, entityType?: string) => {
        const showStatusKeyColumn = !adminV2Chrome;
        const showPersonColumns = entityType === "persons";
        const showDrawerColumn =
            entityType === "persons" ||
            entityType === "opportunities" ||
            entityType === "opportunity_customer_members";
        const displayRows =
            showPersonColumns ? filterPersonStatusRowsForSettingsProfile(rows, personProfileFilter) : rows;
        const colSpan =
            4 +
            (showStatusKeyColumn ? 1 : 0) +
            (showPersonColumns ? 2 : 0) +
            (showDrawerColumn && !showPersonColumns ? 1 : 0) +
            (canMutate ? 1 : 0);
        return (
        <div className="overflow-x-auto">
            {showPersonColumns ? renderPersonProfileChips() : null}
            {showPersonColumns && personProfileFilter !== "all" ?
                <p className="mb-3 text-xs text-[#59678b]" data-status-settings-profile-filter-note="true">
                    Showing People statuses for{" "}
                    <strong>{PERSON_PROFILE_CHIP_LABELS[personProfileFilter]}</strong> drawer profile.
                </p>
            :   null}
            <table
                className="w-full min-w-[520px] text-left text-sm"
                data-testid={
                    entityType === "opportunities"
                        ? "statuses-opportunities-table"
                        : entityType === "persons"
                          ? "statuses-persons-table"
                          : undefined
                }
            >
                <thead>
                    <tr className="border-b border-[#e6e8ec] text-[#59678b]">
                        <th className="pb-2 pr-4 font-semibold">Label</th>
                        {showStatusKeyColumn ?
                            <th className="pb-2 pr-4 font-semibold">Key</th>
                        :   null}
                        {showPersonColumns ?
                            <th className="pb-2 pr-4 font-semibold">Applicability</th>
                        :   null}
                        {showDrawerColumn ?
                            <th className="pb-2 pr-4 font-semibold">Drawer / pipeline</th>
                        :   null}
                        <th className="pb-2 pr-4 font-semibold">Sort</th>
                        <th className="pb-2 pr-4 font-semibold">Active</th>
                        <th className="pb-2 pr-4 font-semibold">System</th>
                        {canMutate && <th className="pb-2 font-semibold">Actions</th>}
                    </tr>
                </thead>
                <tbody>
                    {displayRows.length === 0 ?
                        <tr>
                            <td colSpan={colSpan} className="py-4 text-[#59678b]">
                                {emptyMessage}
                            </td>
                        </tr>
                    :   displayRows.map((row) => (
                            <tr key={row.id} className="border-b border-[#e6e8ec] align-middle">
                                {editingId === row.id ? (
                                    <>
                                        <td className="py-2 pr-4">
                                            <input
                                                type="text"
                                                value={editLabel}
                                                onChange={(e) => setEditLabel(e.target.value)}
                                                className="w-full min-w-[120px] rounded border border-[#e6e8ec] px-2 py-1.5 text-sm"
                                            />
                                        </td>
                                        {showStatusKeyColumn ?
                                            <td className="py-2 pr-4 text-[#59678b]">{row.status_key}</td>
                                        :   null}
                                        {showPersonColumns ?
                                            <td className="py-2 pr-4 text-[#59678b]">
                                                {formatPersonStatusApplicabilityLabel(row.metadata, row.status_key)}
                                            </td>
                                        :   null}
                                        {showDrawerColumn ?
                                            <td className="py-2 pr-4 text-[#59678b]">—</td>
                                        :   null}
                                        <td className="py-2 pr-4">
                                            <input
                                                type="number"
                                                value={editSortOrder}
                                                onChange={(e) => setEditSortOrder(Number(e.target.value) || 0)}
                                                className="w-20 rounded border border-[#e6e8ec] px-2 py-1.5 text-sm"
                                            />
                                        </td>
                                        <td className="py-2 pr-4">
                                            <input
                                                type="checkbox"
                                                checked={editActive}
                                                onChange={(e) => setEditActive(e.target.checked)}
                                            />
                                        </td>
                                        <td className="py-2 pr-4">{row.is_system ? "Yes" : "—"}</td>
                                        <td className="py-2 flex flex-wrap gap-1">
                                            <button
                                                type="button"
                                                onClick={saveEdit}
                                                disabled={editSaving}
                                                className="rounded border border-alloy-stone/50 px-2 py-1 text-xs font-medium hover:bg-alloy-stone/20 disabled:opacity-50"
                                            >
                                                {editSaving ? "Saving…" : "Save"}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={cancelEdit}
                                                className="rounded border border-[#e6e8ec] px-2 py-1 text-xs font-medium hover:bg-[#eef0f4]"
                                            >
                                                Cancel
                                            </button>
                                        </td>
                                    </>
                                ) : (
                                    <>
                                        <td className="py-2 pr-4 font-medium text-[#31394d]">
                                            {row.status_label ?? "—"}
                                        </td>
                                        {showStatusKeyColumn ?
                                            <td className="py-2 pr-4 text-[#59678b]">{row.status_key}</td>
                                        :   null}
                                        {showPersonColumns ?
                                            <td className="py-2 pr-4 text-[#59678b]">
                                                {formatPersonStatusApplicabilityLabel(row.metadata, row.status_key)}
                                            </td>
                                        :   null}
                                        {showDrawerColumn ?
                                            <td className="py-2 pr-4">
                                                {entityType === "persons" ?
                                                    <>
                                                        <StatusDrawerSourceBadgeList
                                                            tags={statusDrawerSourceTagsForPersonRow(row)}
                                                        />
                                                        <PersonStatusPreviewNotes
                                                            notes={personStatusDrawerPreviewNotes(row)}
                                                        />
                                                    </>
                                                : entityType === "opportunity_customer_members" ?
                                                    <StatusDrawerSourceBadgeList
                                                        tags={statusDrawerSourceTagsForOcmRow(row.is_active)}
                                                    />
                                                :   <StatusDrawerSourceBadgeList
                                                        tags={statusDrawerSourceTagsForOpportunityRow(row.is_active)}
                                                    />
                                                }
                                            </td>
                                        :   null}
                                        <td className="py-2 pr-4 text-[#59678b]">{row.sort_order}</td>
                                        <td className="py-2 pr-4">{row.is_active ? "Yes" : "No"}</td>
                                        <td className="py-2 pr-4">{row.is_system ? "Yes" : "—"}</td>
                                        {canMutate && (
                                            <td className="py-2 flex flex-wrap gap-1">
                                                <button
                                                    type="button"
                                                    onClick={() => startEdit(row)}
                                                    className="rounded border border-alloy-stone/50 px-2 py-1 text-xs font-medium hover:bg-alloy-stone/20"
                                                >
                                                    Edit
                                                </button>
                                                {!row.org_id ?
                                                    <span className="text-[10px] text-[#59678b]">Default</span>
                                                : deleteConfirmId === row.id ? (
                                                    <>
                                                        <span className="text-xs text-[#59678b]">
                                                            {row.is_system ? "Deactivate?" : "Delete?"}
                                                        </span>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleDelete(row)}
                                                            disabled={deleteSaving}
                                                            className="rounded border border-red-200 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                                                        >
                                                            {deleteSaving ? "…" : row.is_system ? "Deactivate" : "Delete"}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setDeleteConfirmId(null)}
                                                            className="rounded border border-[#e6e8ec] px-2 py-1 text-xs font-medium hover:bg-[#eef0f4]"
                                                        >
                                                            Cancel
                                                        </button>
                                                    </>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        onClick={() => setDeleteConfirmId(row.id)}
                                                        className="rounded border border-amber-200 px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-50"
                                                    >
                                                        {row.is_system ? "Deactivate" : "Delete"}
                                                    </button>
                                                )}
                                            </td>
                                        )}
                                    </>
                                )}
                            </tr>
                        ))
                    }
                </tbody>
            </table>
        </div>
        );
    };

    const statusTitle = entityTypeFilter ? `Statuses — ${filterLabel}` : "Statuses";
    const statusSubtitle = entityTypeFilter
        ? undefined
        : adminV2Chrome
          ? STATUSES_ADMINV2_SUBTITLE
          : STATUSES_DEFAULT_SUBTITLE;
    const newStatusBtn = canMutate ? (
        <button
            type="button"
            onClick={() => openNewModal()}
            className={adminV2Chrome ? "config-primary-btn shrink-0" : "shrink-0 rounded-md bg-alloy-midnight px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"}
        >
            New Status
        </button>
    ) : null;

    const showInactiveToggle = (
        <label className={`flex items-center gap-2 text-xs ${adminV2Chrome ? "text-alloy-forge/70" : "text-[#59678b]"}`}>
            <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
                className={adminV2Chrome ? "config-mode-control h-4 w-4 rounded border-alloy-stone/40" : undefined}
                data-testid="status-settings-show-inactive"
            />
            Show inactive
        </label>
    );

    return (
        <>
            {adminV2Chrome ? (
                <SettingsPageHeader
                    title={statusTitle}
                    subtitle={statusSubtitle}
                    actions={
                        <div className="flex flex-wrap items-center gap-3">
                            {showInactiveToggle}
                            {newStatusBtn}
                        </div>
                    }
                />
            ) : (
                <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <AdminPageHeader title={statusTitle} subtitle={statusSubtitle} />
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        {showInactiveToggle}
                        {newStatusBtn}
                    </div>
                </div>
            )}

            {actionMessage ?
                <div
                    className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
                    data-testid="status-settings-action-message"
                >
                    {actionMessage}
                </div>
            :   null}

            {deleteError ?
                <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                    {deleteError}
                </div>
            :   null}

            {entityTypeFilter && (
                <div className="mb-6 flex flex-wrap items-center gap-2 rounded-lg border border-[#e6e8ec] bg-[#F4F6F9] px-4 py-3 text-sm">
                    <span className="text-[#31394d]">
                        Filtered to: <strong>{filterLabel}</strong>
                    </span>
                    <Link
                        href={basePath}
                        className="font-medium text-alloy-pine hover:underline"
                    >
                        Clear filter
                    </Link>
                </div>
            )}

            {loading && <p className="text-sm text-[#59678b]">Loading…</p>}
            {error && (
                <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                    {error}
                </div>
            )}

            {!loading && !error && entityTypeFilter && (
                <SectionCard title="Status definitions">
                    {renderSectionDescription(entityTypeFilter)}
                    {renderTable(statuses, "No statuses found. Try clearing the filter or add a new status.", entityTypeFilter)}
                    {editError && <p className="mt-2 text-sm text-red-600">{editError}</p>}
                </SectionCard>
            )}

            {!loading && !error && !entityTypeFilter && adminV2Chrome && (
                <div className="space-y-3" data-status-settings-category-sections="true">
                    {statusCategorySections.length === 0 ? (
                        <SectionCard title="Status definitions">
                            <p className="text-sm text-[#59678b]">No statuses found. Add a status to get started.</p>
                        </SectionCard>
                    ) : (
                        statusCategorySections.map((section) => {
                            const isExpanded = expandedCategoryKey === section.category_key;
                            const count = section.statusDefs.length;
                            const tableEntityType =
                                section.category_key === "person_statuses" ? "persons"
                                : section.category_key === "lead_statuses" ? "opportunities"
                                : undefined;
                            const description =
                                STATUS_SETTINGS_CATEGORY_DESCRIPTIONS[
                                    section.category_key as keyof typeof STATUS_SETTINGS_CATEGORY_DESCRIPTIONS
                                ];
                            return (
                                <section
                                    key={section.category_key}
                                    className="rounded-xl border border-[#e6e8ec] bg-white shadow-sm overflow-hidden"
                                    data-status-settings-category={section.category_key}
                                >
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setExpandedCategoryKey((prev) =>
                                                prev === section.category_key ? null : section.category_key
                                            )
                                        }
                                        className="w-full flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-left border-b border-[#e6e8ec] bg-[#F4F6F9]/50 hover:bg-[#eef0f4] transition-colors"
                                    >
                                        <div className="flex items-center gap-2 min-w-0">
                                            <ChevronDown
                                                className={`h-4 w-4 shrink-0 text-[#59678b] transition-transform ${isExpanded ? "rotate-180" : ""}`}
                                                aria-hidden
                                            />
                                            <span className="text-sm font-semibold tracking-wider text-[#31394d]">
                                                {section.label}
                                            </span>
                                            <span className="text-sm text-[#59678b]">
                                                {count} {count === 1 ? "status" : "statuses"}
                                            </span>
                                        </div>
                                        {canMutate && (
                                            <span onClick={(e) => e.stopPropagation()}>
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        const defaultEntity =
                                                            section.category_key === "person_statuses"
                                                                ? "persons"
                                                                : section.category_key === "enrollment_statuses"
                                                                  ? "opportunity_customer_members"
                                                                  : "opportunities";
                                                        openNewModal(defaultEntity);
                                                    }}
                                                    className="shrink-0 px-2 py-1 text-xs font-medium bg-alloy-midnight text-white rounded hover:opacity-90"
                                                >
                                                    New Status
                                                </button>
                                            </span>
                                        )}
                                    </button>
                                    {isExpanded && (
                                        <div className="p-5">
                                            {description ?
                                                <p className="mb-3 text-xs leading-snug text-[#59678b]">{description}</p>
                                            :   null}
                                            <p className="mb-3 text-[11px] leading-snug text-[#59678b]">
                                                <Link
                                                    href={ADMIN_V2_SETTINGS_BUSINESS_PROCESSES_PATH}
                                                    className="font-medium text-alloy-pine hover:underline"
                                                >
                                                    Open Business Processes
                                                </Link>{" "}
                                                to assign which statuses roll up into each stage.
                                            </p>
                                            {renderTable(
                                                section.statusDefs,
                                                "No statuses for this category.",
                                                tableEntityType
                                            )}
                                            {editError && <p className="mt-2 text-sm text-red-600">{editError}</p>}
                                        </div>
                                    )}
                                </section>
                            );
                        })
                    )}
                </div>
            )}

            {!loading && !error && !entityTypeFilter && !adminV2Chrome && (
                <>
                    {sortedEntityTypes.length === 0 ? (
                        <SectionCard title="Status definitions">
                            {renderTable([], "No statuses found. Add a status to get started.")}
                            {editError && <p className="mt-2 text-sm text-red-600">{editError}</p>}
                        </SectionCard>
                    ) : (
                        <div className="space-y-3">
                            {sortedEntityTypes.map((entityType) => {
                                const isExpanded = expandedEntityType === entityType;
                                const rows = statusesByEntityType[entityType] ?? [];
                                const count = rows.length;
                                const label = entityTypeDisplayLabel(entityType, labels ?? {});
                                return (
                                    <section
                                        key={entityType}
                                        className="rounded-xl border border-[#e6e8ec] bg-white shadow-sm overflow-hidden"
                                    >
                                        <button
                                            type="button"
                                            onClick={() => setExpandedEntityType((prev) => (prev === entityType ? null : entityType))}
                                            className="w-full flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-left border-b border-[#e6e8ec] bg-[#F4F6F9]/50 hover:bg-[#eef0f4] transition-colors"
                                        >
                                            <div className="flex items-center gap-2 min-w-0">
                                                <ChevronDown
                                                    className={`h-4 w-4 shrink-0 text-[#59678b] transition-transform ${isExpanded ? "rotate-180" : ""}`}
                                                    aria-hidden
                                                />
                                                <span className="text-sm font-semibold tracking-wider text-[#31394d]">
                                                    {label}
                                                </span>
                                                <span className="text-sm text-[#59678b]">
                                                    {count} {count === 1 ? "status" : "statuses"}
                                                </span>
                                            </div>
                                            {canMutate && (
                                                <span onClick={(e) => e.stopPropagation()}>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            openNewModal(entityType);
                                                        }}
                                                        className="shrink-0 px-2 py-1 text-xs font-medium bg-alloy-midnight text-white rounded hover:opacity-90"
                                                    >
                                                        New Status
                                                    </button>
                                                </span>
                                            )}
                                        </button>
                                        {isExpanded && (
                                            <div className="p-5">
                                                {renderSectionDescription(entityType)}
                                                {renderTable(rows, "No statuses for this entity type.", entityType)}
                                                {editError && <p className="mt-2 text-sm text-red-600">{editError}</p>}
                                            </div>
                                        )}
                                    </section>
                                );
                            })}
                        </div>
                    )}
                </>
            )}

            {!loading && !error && adminV2Chrome ? <StatusSettingsInventoryPanel /> : null}

            {modalOpen && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
                    onClick={() => !modalSaving && setModalOpen(false)}
                >
                    <div
                        className="w-full max-w-md rounded-lg border border-[#e6e8ec] bg-white p-4 shadow-xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 className="mb-4 text-lg font-semibold text-[#31394d]">New Status</h3>
                        <div className="space-y-3">
                            {!modalEntityTypeLocked && (
                                <div>
                                    <label className="block text-xs font-medium text-[#59678b] mb-0.5">Entity type</label>
                                    <select
                                        value={modalEntityType}
                                        onChange={(e) => setModalEntityType(e.target.value)}
                                        className="w-full rounded border border-[#e6e8ec] px-2 py-1.5 text-sm"
                                    >
                                        {ENTITY_TYPES.map((t) => (
                                            <option key={t} value={t}>
                                                {entityTypeDisplayLabel(t, labels ?? {})}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}
                            {modalEntityType === "persons" ? (
                                <div>
                                    <label className="block text-xs font-medium text-[#59678b] mb-0.5">
                                        Applicability / profile
                                    </label>
                                    <select
                                        value={modalPersonApplicability}
                                        onChange={(e) =>
                                            setModalPersonApplicability(e.target.value as PersonStatusApplicabilityMode)
                                        }
                                        className="w-full rounded border border-[#e6e8ec] px-2 py-1.5 text-sm"
                                    >
                                        <option value="child_lifecycle">Child lifecycle</option>
                                        <option value="person_generic">All people (parent/guardian/employee)</option>
                                        <option value="both">Child + all people</option>
                                    </select>
                                    <p className="mt-1 text-[11px] leading-snug text-[#59678b]">
                                        Creates a <strong>People</strong> status on persons.status_key — not
                                        opportunity enrollment sub-statuses.
                                    </p>
                                </div>
                            ) : null}
                            <div>
                                <label className="block text-xs font-medium text-[#59678b] mb-0.5">Status label</label>
                                <input
                                    type="text"
                                    value={modalLabel}
                                    onChange={(e) => setModalLabel(e.target.value)}
                                    placeholder="e.g. Future Start"
                                    className="w-full rounded border border-[#e6e8ec] px-2 py-1.5 text-sm"
                                />
                            </div>
                            {!modalAdvancedKey ? (
                                <p className="text-xs text-[#59678b]">
                                    Status key will be{" "}
                                    <code className="rounded bg-[#eef0f4] px-1 py-0.5">
                                        {modalPreviewStatusKey || "…"}
                                    </code>
                                </p>
                            ) : (
                                <div>
                                    <label className="block text-xs font-medium text-[#59678b] mb-0.5">
                                        Status key (advanced override)
                                    </label>
                                    <input
                                        type="text"
                                        value={modalKey}
                                        onChange={(e) => {
                                            setModalKeyManual(true);
                                            setModalKey(e.target.value);
                                        }}
                                        placeholder="e.g. future_start"
                                        className="w-full rounded border border-[#e6e8ec] px-2 py-1.5 text-sm"
                                    />
                                </div>
                            )}
                            <label className="flex items-center gap-2 text-xs text-[#59678b]">
                                <input
                                    type="checkbox"
                                    checked={modalAdvancedKey}
                                    onChange={(e) => {
                                        setModalAdvancedKey(e.target.checked);
                                        if (!e.target.checked) {
                                            setModalKeyManual(false);
                                            setModalKey(modalPreviewStatusKey);
                                        }
                                    }}
                                />
                                Advanced (edit status key manually)
                            </label>
                            <div>
                                <label className="block text-xs font-medium text-[#59678b] mb-0.5">Sort order (optional)</label>
                                <input
                                    type="number"
                                    value={modalSortOrder}
                                    onChange={(e) => setModalSortOrder(Number(e.target.value) || 100)}
                                    className="w-full rounded border border-[#e6e8ec] px-2 py-1.5 text-sm"
                                />
                            </div>
                        </div>
                        {modalError && (
                            <p className="mt-2 text-sm text-red-600">{modalError}</p>
                        )}
                        <div className="mt-4 flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => !modalSaving && setModalOpen(false)}
                                className="rounded border border-[#e6e8ec] px-3 py-1.5 text-sm font-medium hover:bg-[#eef0f4]"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleCreate}
                                disabled={modalSaving}
                                className={adminV2Chrome ? "config-primary-btn disabled:opacity-50" : "rounded bg-alloy-midnight px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"}
                            >
                                {modalSaving ? "Creating…" : "Create"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
