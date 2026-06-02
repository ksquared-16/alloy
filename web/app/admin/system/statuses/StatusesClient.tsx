"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
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
import { ADMIN_V2_SETTINGS_LIFECYCLE_PATH } from "@/lib/adminV2/settings/lifecycleSettingsPaths";
import type { LifecycleOperatorStage } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import {
    effectiveEnrollmentOperatorStage,
    ENROLLMENT_OPERATOR_STAGE_UNASSIGNED,
    mergeEnrollmentOperatorStageMetadata,
} from "@/lib/lifecycle/enrollmentOperatorStage";
import {
    enrollmentProcessStageDisplayLabel,
    enrollmentProcessStageSelectOptions,
} from "@/lib/lifecycle/enrollmentProcessStatusDisplay";

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
    customer_members: "customer_members",
    locations: "locations",
    documents: "documents",
    payments: "payments",
    subscriptions: "subscriptions",
};

const FALLBACK_LABELS: Record<string, string> = {
    opportunities: "Opportunities",
    jobs: "Jobs",
    schedules: "Schedules",
    customers: "Customers",
    opportunity_customer_members: "Opportunity Sub Statuses",
    vendors: "Vendors",
    service_plan_templates: "Plan templates",
    persons: "People",
    contacts: "Contacts",
    customer_members: "Customer members",
    locations: "Locations",
    documents: "Documents",
    payments: "Payments",
    subscriptions: "Subscriptions",
};

function entityTypeDisplayLabel(
    entityType: string,
    labels: Record<string, { singular: string | null; plural: string | null }> | null
): string {
    const key = ENTITY_TYPE_TO_LABEL_KEY[entityType] ?? entityType;
    const entry = labels?.[key];
    const plural = entry?.plural ?? entry?.singular;
    return plural ?? FALLBACK_LABELS[entityType] ?? FALLBACK_LABELS[key] ?? entityType;
}

const STATUSES_DEFAULT_SUBTITLE =
    "Display names for status keys on schedules, jobs, customers, opportunities, vendors, plan templates, and people. Drawers read options from here. Which status changes are allowed is not configured here — see Status transition rules under Settings diagnostics (read-only) or a future Workflow Status Configuration sprint.";

const STATUSES_ADMINV2_SUBTITLE =
    "Manage status names and order. For opportunities, Enrollment Stage shows which lifecycle stage owns each status — edit mapping in Lifecycle when needed.";

/** Operator hints — disambiguate childcare labels (Children vs People). */
const STATUS_ENTITY_HINTS: Partial<Record<string, string>> = {
    persons:
        "Person lifecycle status on persons.status_key. Use Applicability to target child vs parent/guardian drawers — not customer_members roster or opportunity sub-statuses.",
    customer_members:
        "Member roster status on customer_members — not the person drawer status (configure under People / persons).",
    opportunity_customer_members:
        "Per-child inquiry sub-status on an opportunity — not the person drawer status.",
};

type PersonStatusApplicabilityMode = "child_lifecycle" | "person_generic" | "both";

export default function StatusesClient({
    basePath = "/admin/system/statuses",
    adminV2Chrome = false,
}: { basePath?: string; adminV2Chrome?: boolean } = {}) {
    const searchParams = useSearchParams();
    const entityTypeFilter = searchParams.get("entity_type")?.trim() ?? "";
    const { labels } = useEntityLabels();
    const { canMutate } = useAdminAuth();

    const [statuses, setStatuses] = useState<StatusDef[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

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
    const [editEnrollmentStage, setEditEnrollmentStage] = useState<LifecycleOperatorStage | "">("");

    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    const [deleteSaving, setDeleteSaving] = useState(false);

    const [expandedEntityType, setExpandedEntityType] = useState<string | null>(null);
    const [modalEntityTypeLocked, setModalEntityTypeLocked] = useState(false);
    const hasAutoExpandedRef = useRef(false);

    const fetchStatuses = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const url = entityTypeFilter
                ? `/api/admin/status-definitions?entity_type=${encodeURIComponent(entityTypeFilter)}`
                : "/api/admin/status-definitions";
            const res = await fetch(url);
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Failed to load statuses");
            setStatuses((json as { statuses?: StatusDef[] }).statuses ?? []);
        } catch (e) {
            setError((e as Error).message);
            setStatuses([]);
        } finally {
            setLoading(false);
        }
    }, [entityTypeFilter]);

    useEffect(() => {
        fetchStatuses();
    }, [fetchStatuses]);

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
        if (row.entity_type === "opportunities") {
            const { stage } = effectiveEnrollmentOperatorStage(row.status_key, row.metadata);
            setEditEnrollmentStage(stage ?? "");
        } else {
            setEditEnrollmentStage("");
        }
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
            if (
                editingRow?.entity_type === "opportunities" &&
                editingRow.org_id
            ) {
                const meta =
                    editingRow.metadata !== null &&
                    typeof editingRow.metadata === "object" &&
                    !Array.isArray(editingRow.metadata)
                        ? (editingRow.metadata as Record<string, unknown>)
                        : {};
                patch.metadata = mergeEnrollmentOperatorStageMetadata(
                    meta,
                    editEnrollmentStage || ENROLLMENT_OPERATOR_STAGE_UNASSIGNED
                );
            }
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
        setDeleteSaving(true);
        try {
            const res = await fetch(`/api/admin/status-definitions/${row.id}`, { method: "DELETE" });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Delete failed");
            setDeleteConfirmId(null);
            await fetchStatuses();
        } catch (e) {
            setEditError((e as Error).message);
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
        if (entityTypeFilter || sortedEntityTypes.length !== 1) return;
        if (!hasAutoExpandedRef.current) {
            hasAutoExpandedRef.current = true;
            setExpandedEntityType(sortedEntityTypes[0]);
        }
    }, [entityTypeFilter, sortedEntityTypes]);

    const renderTable = (rows: StatusDef[], emptyMessage: string, entityType?: string) => {
        const showEnrollmentStage = entityType === "opportunities";
        const colSpan =
            5 +
            (entityType === "persons" ? 1 : 0) +
            (showEnrollmentStage ? 1 : 0) +
            (canMutate ? 1 : 0);
        return (
        <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm" data-testid={showEnrollmentStage ? "statuses-opportunities-table" : undefined}>
                <thead>
                    <tr className="border-b border-[#e6e8ec] text-[#59678b]">
                        <th className="pb-2 pr-4 font-semibold">Label</th>
                        <th className="pb-2 pr-4 font-semibold">Key</th>
                        {entityType === "persons" ? (
                            <th className="pb-2 pr-4 font-semibold">Applicability</th>
                        ) : null}
                        {showEnrollmentStage ? (
                            <th className="pb-2 pr-4 font-semibold">Enrollment Stage</th>
                        ) : null}
                        <th className="pb-2 pr-4 font-semibold">Sort</th>
                        <th className="pb-2 pr-4 font-semibold">Active</th>
                        <th className="pb-2 pr-4 font-semibold">System</th>
                        {canMutate && <th className="pb-2 font-semibold">Actions</th>}
                    </tr>
                </thead>
                <tbody>
                    {rows.length === 0 ? (
                        <tr>
                            <td colSpan={colSpan} className="py-4 text-[#59678b]">
                                {emptyMessage}
                            </td>
                        </tr>
                    ) : (
                        rows.map((row) => (
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
                                        <td className="py-2 pr-4 text-[#59678b]">{row.status_key}</td>
                                        {entityType === "persons" ? (
                                            <td className="py-2 pr-4 text-[#59678b]">
                                                {formatPersonStatusApplicabilityLabel(row.metadata, row.status_key)}
                                            </td>
                                        ) : null}
                                        {showEnrollmentStage ? (
                                            <td className="py-2 pr-4">
                                                {row.org_id ? (
                                                    <select
                                                        className="w-full min-w-[8rem] rounded border border-[#e6e8ec] px-2 py-1.5 text-sm"
                                                        value={editEnrollmentStage}
                                                        onChange={(e) =>
                                                            setEditEnrollmentStage(
                                                                e.target.value as LifecycleOperatorStage | ""
                                                            )
                                                        }
                                                        data-testid="statuses-edit-enrollment-stage"
                                                    >
                                                        {enrollmentProcessStageSelectOptions().map((o) => (
                                                            <option key={o.label} value={o.value}>
                                                                {o.label}
                                                            </option>
                                                        ))}
                                                    </select>
                                                ) : (
                                                    <span className="text-xs text-[#59678b]">Platform default</span>
                                                )}
                                            </td>
                                        ) : null}
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
                                        <td className="py-2 pr-4 text-[#59678b]">{row.status_key}</td>
                                        {entityType === "persons" ? (
                                            <td className="py-2 pr-4 text-[#59678b]">
                                                {formatPersonStatusApplicabilityLabel(row.metadata, row.status_key)}
                                            </td>
                                        ) : null}
                                        {showEnrollmentStage ? (
                                            <td className="py-2 pr-4" data-testid="statuses-enrollment-stage-cell">
                                                <span className="inline-block rounded-md border border-alloy-forge/15 bg-alloy-stone/10 px-2 py-0.5 text-xs font-medium text-alloy-midnight">
                                                    {enrollmentProcessStageDisplayLabel(row.status_key, row.metadata)}
                                                </span>
                                                {!row.org_id ? (
                                                    <Link
                                                        href={ADMIN_V2_SETTINGS_LIFECYCLE_PATH}
                                                        className="mt-1 block text-[11px] font-medium text-alloy-pine hover:underline"
                                                    >
                                                        Manage in Lifecycle
                                                    </Link>
                                                ) : null}
                                            </td>
                                        ) : null}
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
                                                {deleteConfirmId === row.id ? (
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
                    )}
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
            className="shrink-0 rounded-md bg-alloy-midnight px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
        >
            New Status
        </button>
    ) : null;

    return (
        <>
            {adminV2Chrome ? (
                <SettingsPageHeader title={statusTitle} subtitle={statusSubtitle} actions={newStatusBtn} />
            ) : (
                <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <AdminPageHeader title={statusTitle} subtitle={statusSubtitle} />
                    </div>
                    {newStatusBtn}
                </div>
            )}

            {entityTypeFilter && (
                <div className="mb-6 flex flex-wrap items-center gap-2 rounded-lg border border-[#e6e8ec] bg-[#F4F6F9] px-4 py-3 text-sm">
                    <span className="text-[#31394d]">
                        Filtered to: <strong>{filterLabel}</strong>
                    </span>
                    <Link
                        href={basePath}
                        className="font-medium text-alloy-blue hover:underline"
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
                    {renderTable(statuses, "No statuses found. Try clearing the filter or add a new status.", entityTypeFilter)}
                    {editError && <p className="mt-2 text-sm text-red-600">{editError}</p>}
                </SectionCard>
            )}

            {!loading && !error && !entityTypeFilter && (
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
                                                {STATUS_ENTITY_HINTS[entityType] ? (
                                                    <p className="mb-3 text-xs leading-snug text-[#59678b]">
                                                        {STATUS_ENTITY_HINTS[entityType]}
                                                    </p>
                                                ) : null}
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
                                        customer_members roster or opportunity enrollment sub-statuses.
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
                                className="rounded bg-alloy-midnight px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
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
