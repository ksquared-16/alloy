"use client";

import { useCallback, useEffect, useState } from "react";
import DataTable from "@/components/admin/DataTable";
import Drawer from "@/components/admin/Drawer";
import PrimaryButton from "@/components/PrimaryButton";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { formatDateTime, formatMoneyFromCents } from "@/lib/adminFormatters";
import { AdminDeleteConfirmModal } from "@/components/admin/AdminDeleteConfirmModal";
import type { DiscountProgramAdminViewRow } from "@/lib/admin/discountProgramAdmin";

const INPUT_CLASS =
    "w-full px-3 py-2 border border-alloy-stone/80 rounded-md focus:outline-none focus:ring-2 focus:ring-alloy-blue disabled:bg-alloy-stone/20 disabled:cursor-not-allowed";

type CommitmentFormFields = {
    enrollment_mode: string;
    commitment_start_mode: string;
    benefit_grant_timing: string;
    required_service_count: string;
    timeframe_days: string;
    qualifying_service_status: string;
    breach_policy: string;
    max_redemptions_per_customer: string;
};

type DiscountFormState = {
    name: string;
    code: string;
    description: string;
    status: string;
    program_type: string;
    stacking_mode: string;
    priority: string;
    valid_from: string;
    valid_to: string;
    first_time_customer_only: boolean;
    auto_apply: boolean;
    applies_to_entity_type: string;
    applies_to_vertical_slug: string;
    primary_benefit_type: string;
    primary_benefit_applies_to: string;
    service_index: string;
    amount_cents: string;
    percent_for_ui: string;
    commitment: CommitmentFormFields;
};

function emptyCommitment(): CommitmentFormFields {
    return {
        enrollment_mode: "",
        commitment_start_mode: "",
        benefit_grant_timing: "",
        required_service_count: "",
        timeframe_days: "",
        qualifying_service_status: "",
        breach_policy: "",
        max_redemptions_per_customer: "",
    };
}

function defaultCreateForm(): DiscountFormState {
    return {
        name: "",
        code: "",
        description: "",
        status: "active",
        program_type: "code",
        stacking_mode: "exclusive",
        priority: "0",
        valid_from: "",
        valid_to: "",
        first_time_customer_only: false,
        auto_apply: false,
        applies_to_entity_type: "job",
        applies_to_vertical_slug: "",
        primary_benefit_type: "percent_off",
        primary_benefit_applies_to: "first_service",
        service_index: "",
        amount_cents: "",
        percent_for_ui: "10",
        commitment: emptyCommitment(),
    };
}

function isoToDatetimeLocal(iso: string | null | undefined): string {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toISOString().slice(0, 16);
}

function datetimeLocalToIso(local: string): string | null {
    if (!local?.trim()) return null;
    const d = new Date(local);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
}

/** 1% = 100 basis points (e.g. 25% → 2500). */
function percentUiToBasisPoints(percentStr: string): number | null {
    const n = parseFloat(percentStr);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.round(n * 100);
}

function basisPointsToPercentUi(bps: number | null | undefined): string {
    if (bps == null || !Number.isFinite(bps)) return "";
    return String(bps / 100);
}

function rowToForm(row: DiscountProgramAdminViewRow): DiscountFormState {
    const r = row as Record<string, unknown>;
    const bps =
        (row.primary_benefit_percent_basis_points as number | null | undefined) ??
        (typeof r.primary_percent_basis_points === "number" ? r.primary_percent_basis_points : null);
    const cents =
        (row.primary_benefit_amount_cents as number | null | undefined) ??
        (typeof r.primary_amount_cents === "number" ? r.primary_amount_cents : null);
    const svcIdx =
        (row.primary_benefit_service_index as number | null | undefined) ??
        (typeof r.service_index === "number" ? r.service_index : null);

    return {
        name: row.name ?? "",
        code: row.code ?? "",
        description: row.description ?? "",
        status: row.status ?? "active",
        program_type: row.program_type ?? "code",
        stacking_mode: row.stacking_mode ?? "exclusive",
        priority: row.priority != null ? String(row.priority) : "0",
        valid_from: isoToDatetimeLocal(row.valid_from),
        valid_to: isoToDatetimeLocal(row.valid_to),
        first_time_customer_only: row.first_time_customer_only === true,
        auto_apply: row.auto_apply === true,
        applies_to_entity_type: row.applies_to_entity_type ?? "job",
        applies_to_vertical_slug: row.applies_to_vertical_slug ?? "",
        primary_benefit_type: row.primary_benefit_type ?? "percent_off",
        primary_benefit_applies_to: row.primary_benefit_applies_to ?? "first_service",
        service_index: svcIdx != null ? String(svcIdx) : "",
        amount_cents: cents != null ? String(cents) : "",
        percent_for_ui: basisPointsToPercentUi(bps ?? null) || "0",
        commitment: {
            enrollment_mode: row.enrollment_mode ?? "",
            commitment_start_mode: row.commitment_start_mode ?? "",
            benefit_grant_timing: row.benefit_grant_timing ?? "",
            required_service_count: row.required_service_count != null ? String(row.required_service_count) : "",
            timeframe_days: row.timeframe_days != null ? String(row.timeframe_days) : "",
            qualifying_service_status: row.qualifying_service_status ?? "",
            breach_policy: row.breach_policy ?? "",
            max_redemptions_per_customer: row.max_redemptions_per_customer != null ? String(row.max_redemptions_per_customer) : "",
        },
    };
}

/** API body: only fields validateDiscountProgramPayload consumes — never pass a raw view row. */
function buildPayload(form: DiscountFormState): Record<string, unknown> {
    const priority = parseInt(form.priority, 10);
    const benefitType = form.primary_benefit_type;
    const primary_benefit: Record<string, unknown> = {
        benefit_type: benefitType,
        applies_to: form.primary_benefit_applies_to.trim(),
        service_index: form.service_index.trim() ? parseInt(form.service_index, 10) : null,
    };

    if (benefitType === "percent_off") {
        const bps = percentUiToBasisPoints(form.percent_for_ui);
        primary_benefit.percent_basis_points = bps ?? 0;
        primary_benefit.amount_cents = null;
    } else if (benefitType === "fixed_amount_off") {
        primary_benefit.amount_cents = form.amount_cents.trim() ? parseInt(form.amount_cents, 10) : 0;
        primary_benefit.percent_basis_points = null;
    } else {
        primary_benefit.amount_cents = null;
        primary_benefit.percent_basis_points = null;
    }

    const payload: Record<string, unknown> = {
        name: form.name.trim(),
        code: form.code.trim() ? form.code.trim().toUpperCase() : null,
        description: form.description.trim() || null,
        status: form.status.trim() || "active",
        program_type: form.program_type,
        stacking_mode: form.stacking_mode.trim() || "exclusive",
        priority: Number.isFinite(priority) ? priority : 0,
        valid_from: datetimeLocalToIso(form.valid_from),
        valid_to: datetimeLocalToIso(form.valid_to),
        first_time_customer_only: form.first_time_customer_only,
        auto_apply: form.auto_apply,
        applies_to_entity_type: form.applies_to_entity_type.trim() || "job",
        primary_benefit,
        applies_to_vertical_slug: form.applies_to_vertical_slug.trim() || null,
    };

    if (form.program_type === "commitment") {
        payload.commitment = {
            enrollment_mode: form.commitment.enrollment_mode.trim(),
            commitment_start_mode: form.commitment.commitment_start_mode.trim(),
            benefit_grant_timing: form.commitment.benefit_grant_timing.trim(),
            required_service_count: parseInt(form.commitment.required_service_count, 10),
            timeframe_days: parseInt(form.commitment.timeframe_days, 10),
            qualifying_service_status: form.commitment.qualifying_service_status.trim(),
            breach_policy: form.commitment.breach_policy.trim(),
            max_redemptions_per_customer: parseInt(form.commitment.max_redemptions_per_customer, 10),
        };
    }

    return payload;
}

function benefitSummary(row: DiscountProgramAdminViewRow): string {
    const t = row.primary_benefit_type ?? "—";
    if (t === "percent_off") {
        const bps = row.primary_benefit_percent_basis_points;
        if (bps == null) return t;
        return `${bps / 100}%`;
    }
    if (t === "fixed_amount_off") {
        const c = row.primary_benefit_amount_cents;
        if (c == null) return t;
        return formatMoneyFromCents(c);
    }
    if (t === "free_service") return "Free service";
    return t;
}

interface DiscountsClientProps {
    initialData?: DiscountProgramAdminViewRow[];
    error?: string;
}

export default function DiscountsClient({ initialData: initialDataProp, error: errorProp }: DiscountsClientProps) {
    const { canMutate } = useAdminAuth();
    const [clientData, setClientData] = useState<DiscountProgramAdminViewRow[] | null>(null);
    const [clientError, setClientError] = useState<string | null>(null);
    const [loading, setLoading] = useState(typeof initialDataProp === "undefined");
    const [selectedRow, setSelectedRow] = useState<DiscountProgramAdminViewRow | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [formData, setFormData] = useState<DiscountFormState>(defaultCreateForm());
    const [legacyMigrated, setLegacyMigrated] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [deleteSaving, setDeleteSaving] = useState(false);
    type DeletionEligibility = { allowed: boolean; reason: string; recommended_action: string };
    const [deletionEligibility, setDeletionEligibility] = useState<DeletionEligibility | null>(null);
    const [deletionEligibilityLoading, setDeletionEligibilityLoading] = useState(false);
    const readOnly = !canMutate;

    useEffect(() => {
        if (!isEditing || !selectedRow?.id) {
            setDeletionEligibility(null);
            setDeletionEligibilityLoading(false);
            return;
        }
        setDeletionEligibilityLoading(true);
        fetch(`/api/admin/deletion-eligibility?entity_type=discounts&id=${encodeURIComponent(selectedRow.id)}`)
            .then((r) => (r.ok ? r.json() : null))
            .then((json: DeletionEligibility | null) => setDeletionEligibility(json ?? null))
            .catch(() => setDeletionEligibility(null))
            .finally(() => setDeletionEligibilityLoading(false));
    }, [isEditing, selectedRow?.id]);

    const fetchDiscounts = useCallback(async () => {
        setLoading(true);
        setClientError(null);
        try {
            const res = await fetch("/api/admin/discounts");
            const data = await res.json();
            if (res.ok) setClientData(Array.isArray(data) ? data : []);
            else setClientError((data as { error?: string }).error ?? "Failed to load");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (typeof initialDataProp === "undefined") fetchDiscounts();
    }, [initialDataProp, fetchDiscounts]);

    const initialData = initialDataProp ?? clientData ?? [];
    const error = errorProp ?? clientError;

    const columns = [
        {
            key: "created_at",
            label: "Created",
            sortable: true,
            render: (value: string | null | undefined) => (value ? formatDateTime(value) : "—"),
        },
        { key: "name", label: "Name", sortable: true, render: (v: string | null | undefined) => v ?? "—" },
        { key: "code", label: "Code", sortable: true, render: (v: string | null | undefined) => v ?? "—" },
        { key: "status", label: "Status", sortable: true, render: (v: string | null | undefined) => v ?? "—" },
        { key: "program_type", label: "Type", sortable: true, render: (v: string | null | undefined) => v ?? "—" },
        {
            key: "primary_benefit_type",
            label: "Benefit",
            sortable: true,
            render: (_v: unknown, row: DiscountProgramAdminViewRow) => benefitSummary(row),
        },
        {
            key: "required_service_count",
            label: "Commitment",
            sortable: true,
            render: (_v: unknown, row: DiscountProgramAdminViewRow) => {
                if (row.program_type !== "commitment") return "—";
                const n = row.required_service_count;
                const d = row.timeframe_days;
                if (n == null && d == null) return "—";
                return `${n ?? "—"} svc / ${d ?? "—"} d`;
            },
        },
        {
            key: "is_legacy_migrated",
            label: "Legacy",
            sortable: true,
            render: (v: boolean | null | undefined) => (v ? "Migrated" : "—"),
        },
    ];

    const filters = [
        {
            key: "status",
            label: "Status",
            type: "select" as const,
            options: [
                { value: "active", label: "active" },
                { value: "inactive", label: "inactive" },
                { value: "draft", label: "draft" },
            ],
        },
        {
            key: "program_type",
            label: "Program type",
            type: "select" as const,
            options: [
                { value: "code", label: "code" },
                { value: "commitment", label: "commitment" },
            ],
        },
    ];

    const handleEdit = (row: DiscountProgramAdminViewRow) => {
        setSelectedRow(row);
        setFormData(rowToForm(row));
        setLegacyMigrated(row.is_legacy_migrated === true);
        setIsEditing(true);
        setIsCreating(false);
    };

    const handleCreate = () => {
        setSelectedRow(null);
        setFormData(defaultCreateForm());
        setLegacyMigrated(false);
        setIsCreating(true);
        setIsEditing(false);
    };

    const updateCommitment = (patch: Partial<CommitmentFormFields>) => {
        setFormData((f) => ({ ...f, commitment: { ...f.commitment, ...patch } }));
    };

    const handleSubmit = async () => {
        setIsSubmitting(true);
        setSubmitError(null);
        try {
            const payload = buildPayload(formData);
            const url = isCreating ? "/api/admin/discounts" : `/api/admin/discounts/${selectedRow?.id}`;
            const method = isCreating ? "POST" : "PATCH";
            const response = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            if (!response.ok) {
                const errJson = await response.json().catch(() => ({}));
                throw new Error((errJson as { error?: string }).error || "Failed to save discount program");
            }
            if (typeof initialDataProp === "undefined") fetchDiscounts();
            else window.location.reload();
        } catch (err: unknown) {
            setSubmitError(err instanceof Error ? err.message : "Failed to save");
        } finally {
            setIsSubmitting(false);
        }
    };

    const codeLocked = legacyMigrated;
    const saveDisabled =
        isSubmitting ||
        !formData.name.trim() ||
        (isCreating && !formData.code.trim()) ||
        (formData.program_type === "commitment" &&
            (!formData.commitment.enrollment_mode.trim() ||
                !formData.commitment.commitment_start_mode.trim() ||
                !formData.commitment.benefit_grant_timing.trim() ||
                !formData.commitment.qualifying_service_status.trim() ||
                !formData.commitment.breach_policy.trim() ||
                !formData.commitment.required_service_count.trim() ||
                !formData.commitment.timeframe_days.trim() ||
                !formData.commitment.max_redemptions_per_customer.trim()));

    const drawerTitle = readOnly
        ? `View: ${selectedRow?.name ?? selectedRow?.code ?? ""}`
        : isCreating
          ? "Create discount program"
          : `Edit: ${selectedRow?.name ?? selectedRow?.code ?? ""}`;

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-3xl font-bold text-alloy-midnight">Discounts</h1>
                {canMutate && <PrimaryButton onClick={handleCreate}>Create discount program</PrimaryButton>}
            </div>

            {error && (
                <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md text-red-800 text-sm">Error: {error}</div>
            )}

            {loading && typeof initialDataProp === "undefined" && (
                <div className="mb-4 p-4 bg-alloy-stone/10 rounded-md text-sm text-alloy-midnight/80">Loading discount programs…</div>
            )}

            <DataTable data={initialData} columns={columns} filters={filters} onRowClick={handleEdit} />

            <Drawer
                isOpen={isEditing || isCreating}
                onClose={() => {
                    setIsEditing(false);
                    setIsCreating(false);
                    setSelectedRow(null);
                    setFormData(defaultCreateForm());
                    setLegacyMigrated(false);
                    setSubmitError(null);
                    setDeleteConfirmOpen(false);
                }}
                title={drawerTitle}
                headerActions={
                    canMutate && isEditing && selectedRow
                        ? deletionEligibilityLoading
                            ? <span className="text-xs text-alloy-midnight/50">Checking…</span>
                            : deletionEligibility && !deletionEligibility.allowed
                              ? (
                                    <span className="text-xs text-alloy-midnight/70 max-w-[220px]" title={deletionEligibility.reason}>
                                        {deletionEligibility.reason}
                                    </span>
                                )
                              : deletionEligibility?.allowed === true
                                ? (
                                      <button
                                          type="button"
                                          onClick={() => setDeleteConfirmOpen(true)}
                                          className="px-3 py-1.5 text-sm border border-alloy-ember/50 text-alloy-ember rounded-md hover:bg-alloy-ember/10"
                                      >
                                          Delete
                                      </button>
                                  )
                                : undefined
                        : undefined
                }
            >
                <div className="space-y-6">
                    {submitError && !readOnly && (
                        <div className="p-4 bg-red-50 border border-red-200 rounded-md text-red-800 text-sm">{submitError}</div>
                    )}

                    {legacyMigrated && (
                        <div className="flex items-center gap-2 text-xs text-alloy-midnight/70">
                            <span className="px-2 py-0.5 rounded bg-alloy-stone/30 text-alloy-midnight/80 font-medium">Legacy migrated</span>
                            <span>Linked legacy discount code is preserved for existing jobs and redemptions.</span>
                        </div>
                    )}

                    <section className="space-y-3">
                        <h3 className="text-sm font-semibold text-alloy-midnight">Base</h3>
                        <div>
                            <label className="block text-sm font-medium text-alloy-midnight/70 mb-1">Name *</label>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                disabled={readOnly}
                                className={INPUT_CLASS}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-alloy-midnight/70 mb-1">Code {isCreating ? "*" : ""}</label>
                            <input
                                type="text"
                                value={formData.code}
                                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                                disabled={readOnly || codeLocked}
                                className={INPUT_CLASS}
                                placeholder="e.g. SAVE20"
                            />
                            {codeLocked && <p className="text-xs text-alloy-midnight/50 mt-1">Code is read-only for migrated programs.</p>}
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-alloy-midnight/70 mb-1">Description</label>
                            <textarea
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                disabled={readOnly}
                                rows={3}
                                className={INPUT_CLASS}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-sm font-medium text-alloy-midnight/70 mb-1">Status</label>
                                <input
                                    type="text"
                                    value={formData.status}
                                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                                    disabled={readOnly}
                                    className={INPUT_CLASS}
                                    placeholder="active"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-alloy-midnight/70 mb-1">Program type</label>
                                <select
                                    value={formData.program_type}
                                    onChange={(e) => setFormData({ ...formData, program_type: e.target.value })}
                                    disabled={readOnly}
                                    className={INPUT_CLASS}
                                >
                                    <option value="code">code</option>
                                    <option value="commitment">commitment</option>
                                </select>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-sm font-medium text-alloy-midnight/70 mb-1">Stacking mode</label>
                                <input
                                    type="text"
                                    value={formData.stacking_mode}
                                    onChange={(e) => setFormData({ ...formData, stacking_mode: e.target.value })}
                                    disabled={readOnly}
                                    className={INPUT_CLASS}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-alloy-midnight/70 mb-1">Priority</label>
                                <input
                                    type="number"
                                    value={formData.priority}
                                    onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                                    disabled={readOnly}
                                    className={INPUT_CLASS}
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-sm font-medium text-alloy-midnight/70 mb-1">Valid from</label>
                                <input
                                    type="datetime-local"
                                    value={formData.valid_from}
                                    onChange={(e) => setFormData({ ...formData, valid_from: e.target.value })}
                                    disabled={readOnly}
                                    className={INPUT_CLASS}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-alloy-midnight/70 mb-1">Valid to</label>
                                <input
                                    type="datetime-local"
                                    value={formData.valid_to}
                                    onChange={(e) => setFormData({ ...formData, valid_to: e.target.value })}
                                    disabled={readOnly}
                                    className={INPUT_CLASS}
                                />
                            </div>
                        </div>
                        <label className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                checked={formData.first_time_customer_only}
                                onChange={(e) => setFormData({ ...formData, first_time_customer_only: e.target.checked })}
                                disabled={readOnly}
                                className="rounded"
                            />
                            <span className="text-sm font-medium text-alloy-midnight/70">First-time customer only</span>
                        </label>
                        <label className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                checked={formData.auto_apply}
                                onChange={(e) => setFormData({ ...formData, auto_apply: e.target.checked })}
                                disabled={readOnly}
                                className="rounded"
                            />
                            <span className="text-sm font-medium text-alloy-midnight/70">Auto apply</span>
                        </label>
                        <div>
                            <label className="block text-sm font-medium text-alloy-midnight/70 mb-1">Applies to entity type</label>
                            <input
                                type="text"
                                value={formData.applies_to_entity_type}
                                onChange={(e) => setFormData({ ...formData, applies_to_entity_type: e.target.value })}
                                disabled={readOnly}
                                className={INPUT_CLASS}
                                placeholder="job"
                            />
                        </div>
                    </section>

                    <section className="space-y-3 border-t border-alloy-stone/40 pt-4">
                        <h3 className="text-sm font-semibold text-alloy-midnight">Primary benefit</h3>
                        <div>
                            <label className="block text-sm font-medium text-alloy-midnight/70 mb-1">Benefit type</label>
                            <select
                                value={formData.primary_benefit_type}
                                onChange={(e) => setFormData({ ...formData, primary_benefit_type: e.target.value })}
                                disabled={readOnly}
                                className={INPUT_CLASS}
                            >
                                <option value="percent_off">percent_off</option>
                                <option value="fixed_amount_off">fixed_amount_off</option>
                                <option value="free_service">free_service</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-alloy-midnight/70 mb-1">Applies to</label>
                            <input
                                type="text"
                                value={formData.primary_benefit_applies_to}
                                onChange={(e) => setFormData({ ...formData, primary_benefit_applies_to: e.target.value })}
                                disabled={readOnly}
                                className={INPUT_CLASS}
                                placeholder="first_service"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-alloy-midnight/70 mb-1">Service index (optional)</label>
                            <input
                                type="number"
                                value={formData.service_index}
                                onChange={(e) => setFormData({ ...formData, service_index: e.target.value })}
                                disabled={readOnly}
                                className={INPUT_CLASS}
                            />
                        </div>
                        {formData.primary_benefit_type === "percent_off" && (
                            <div>
                                <label className="block text-sm font-medium text-alloy-midnight/70 mb-1">Percent (%)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min={0}
                                    value={formData.percent_for_ui}
                                    onChange={(e) => setFormData({ ...formData, percent_for_ui: e.target.value })}
                                    disabled={readOnly}
                                    className={INPUT_CLASS}
                                />
                                <p className="text-xs text-alloy-midnight/50 mt-1">Stored as basis points (1% = 100 bps).</p>
                            </div>
                        )}
                        {formData.primary_benefit_type === "fixed_amount_off" && (
                            <div>
                                <label className="block text-sm font-medium text-alloy-midnight/70 mb-1">Amount (cents)</label>
                                <input
                                    type="number"
                                    min={0}
                                    value={formData.amount_cents}
                                    onChange={(e) => setFormData({ ...formData, amount_cents: e.target.value })}
                                    disabled={readOnly}
                                    className={INPUT_CLASS}
                                />
                            </div>
                        )}
                    </section>

                    <section className="space-y-3 border-t border-alloy-stone/40 pt-4">
                        <h3 className="text-sm font-semibold text-alloy-midnight">Qualifier (optional)</h3>
                        <div>
                            <label className="block text-sm font-medium text-alloy-midnight/70 mb-1">Vertical slug</label>
                            <input
                                type="text"
                                value={formData.applies_to_vertical_slug}
                                onChange={(e) => setFormData({ ...formData, applies_to_vertical_slug: e.target.value })}
                                disabled={readOnly}
                                className={INPUT_CLASS}
                                placeholder="e.g. cleaning"
                            />
                        </div>
                    </section>

                    {formData.program_type === "commitment" && (
                        <section className="space-y-3 border-t border-alloy-stone/40 pt-4">
                            <h3 className="text-sm font-semibold text-alloy-midnight">Commitment</h3>
                            <div className="grid grid-cols-1 gap-3">
                                <div>
                                    <label className="block text-sm font-medium text-alloy-midnight/70 mb-1">Enrollment mode</label>
                                    <input
                                        type="text"
                                        value={formData.commitment.enrollment_mode}
                                        onChange={(e) => updateCommitment({ enrollment_mode: e.target.value })}
                                        disabled={readOnly}
                                        className={INPUT_CLASS}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-alloy-midnight/70 mb-1">Commitment start mode</label>
                                    <input
                                        type="text"
                                        value={formData.commitment.commitment_start_mode}
                                        onChange={(e) => updateCommitment({ commitment_start_mode: e.target.value })}
                                        disabled={readOnly}
                                        className={INPUT_CLASS}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-alloy-midnight/70 mb-1">Benefit grant timing</label>
                                    <input
                                        type="text"
                                        value={formData.commitment.benefit_grant_timing}
                                        onChange={(e) => updateCommitment({ benefit_grant_timing: e.target.value })}
                                        disabled={readOnly}
                                        className={INPUT_CLASS}
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-sm font-medium text-alloy-midnight/70 mb-1">Required services</label>
                                        <input
                                            type="number"
                                            min={1}
                                            value={formData.commitment.required_service_count}
                                            onChange={(e) => updateCommitment({ required_service_count: e.target.value })}
                                            disabled={readOnly}
                                            className={INPUT_CLASS}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-alloy-midnight/70 mb-1">Timeframe (days)</label>
                                        <input
                                            type="number"
                                            min={1}
                                            value={formData.commitment.timeframe_days}
                                            onChange={(e) => updateCommitment({ timeframe_days: e.target.value })}
                                            disabled={readOnly}
                                            className={INPUT_CLASS}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-alloy-midnight/70 mb-1">Qualifying service status</label>
                                    <input
                                        type="text"
                                        value={formData.commitment.qualifying_service_status}
                                        onChange={(e) => updateCommitment({ qualifying_service_status: e.target.value })}
                                        disabled={readOnly}
                                        className={INPUT_CLASS}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-alloy-midnight/70 mb-1">Breach policy</label>
                                    <input
                                        type="text"
                                        value={formData.commitment.breach_policy}
                                        onChange={(e) => updateCommitment({ breach_policy: e.target.value })}
                                        disabled={readOnly}
                                        className={INPUT_CLASS}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-alloy-midnight/70 mb-1">Max redemptions per customer</label>
                                    <input
                                        type="number"
                                        min={1}
                                        value={formData.commitment.max_redemptions_per_customer}
                                        onChange={(e) => updateCommitment({ max_redemptions_per_customer: e.target.value })}
                                        disabled={readOnly}
                                        className={INPUT_CLASS}
                                    />
                                </div>
                            </div>
                        </section>
                    )}

                    <div className="flex gap-4 pt-4 border-t border-alloy-stone/40">
                        {readOnly ? (
                            <button
                                type="button"
                                onClick={() => {
                                    setIsEditing(false);
                                    setIsCreating(false);
                                    setSelectedRow(null);
                                    setFormData(defaultCreateForm());
                                }}
                                className="px-4 py-2 border border-alloy-stone/80 rounded-md hover:bg-alloy-stone transition-colors"
                            >
                                Close
                            </button>
                        ) : (
                            <>
                                <PrimaryButton onClick={handleSubmit} disabled={saveDisabled}>
                                    {isSubmitting ? "Saving…" : "Save"}
                                </PrimaryButton>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsEditing(false);
                                        setIsCreating(false);
                                        setSelectedRow(null);
                                        setFormData(defaultCreateForm());
                                        setLegacyMigrated(false);
                                        setSubmitError(null);
                                    }}
                                    className="px-4 py-2 border border-alloy-stone/80 rounded-md hover:bg-alloy-stone transition-colors"
                                >
                                    Cancel
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </Drawer>

            <AdminDeleteConfirmModal
                isOpen={deleteConfirmOpen}
                onClose={() => {
                    setDeleteConfirmOpen(false);
                    setSubmitError(null);
                }}
                onConfirm={async () => {
                    if (!selectedRow?.id) return;
                    setDeleteSaving(true);
                    setSubmitError(null);
                    try {
                        const res = await fetch(`/api/admin/discounts/${selectedRow.id}`, { method: "DELETE" });
                        const json = await res.json().catch(() => ({}));
                        if (!res.ok) {
                            const msg = (json.error as string) || "Delete failed";
                            const action = json.recommended_action as string | undefined;
                            setSubmitError(action ? `${msg} (Recommended: ${action})` : msg);
                            return;
                        }
                        setDeleteConfirmOpen(false);
                        setIsEditing(false);
                        setIsCreating(false);
                        setSelectedRow(null);
                        setFormData(defaultCreateForm());
                        if (typeof initialDataProp === "undefined") fetchDiscounts();
                        else window.location.reload();
                    } finally {
                        setDeleteSaving(false);
                    }
                }}
                recordLabel={selectedRow?.code ?? selectedRow?.name ?? "this program"}
                entityTypeLabel="discount program"
                isLoading={deleteSaving}
            />
        </div>
    );
}
