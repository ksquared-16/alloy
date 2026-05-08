"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import SectionCard from "@/components/admin/SectionCard";
import PrimaryButton from "@/components/PrimaryButton";
import SecondaryButton from "@/components/SecondaryButton";
import { StatusBadge, getStatusVariant } from "@/components/admin/StatusBadge";
import { formatDateTimeForUserDisplay } from "@/lib/adminFormatters";
import { useAdminViewerTimezone } from "@/contexts/AdminViewerTimezoneContext";
import { parseFormLaunchContextFromPayloadMeta } from "@/lib/forms/formContextMode";
import { FormEngineRenderer } from "@/components/forms/engine/FormEngineRenderer";
import { safeParseFormSchema, type FormSchemaV1 } from "@/lib/forms/schema";
import type { FormPayload } from "@/lib/forms/validateSubmission";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import { ADMIN_FORMS_UI_BASE } from "@/lib/forms/adminFormsUiBase";
import {
    buildEntityConnectionRows,
    buildSubmissionIntakeSection,
    describeDocumentOutcome,
    describeSubmissionLifecycle,
    documentGenerationBlockedByIntake,
    payloadHasCapturedSignatures,
    recommendedNextAction,
    WORKFLOW_SIGNALS_OPERATOR_COPY,
    type EntityConnectionRow,
    type PublicLinkIntakeDebug,
} from "@/lib/forms/submissionOutcomeSummary";
import {
    buildLinkageReviewCalloutReasons,
    submissionDetailLinkageCalloutVisible,
} from "@/lib/forms/submissionLinkageReviewUx";

type LinkedDoc = {
    role: string;
    junction_created_at: string;
    document: {
        id: string;
        name: string | null;
        original_filename: string | null;
        document_type: string | null;
        status: string | null;
        created_at: string | null;
    };
};

type SubmissionDetail = {
    id: string;
    form_definition_id: string;
    form_definition_version_id: string;
    status: string;
    payload: FormPayload;
    person_id: string | null;
    customer_id: string | null;
    customer_member_id: string | null;
    opportunity_id: string | null;
    created_via_public_link_id: string | null;
    created_at: string;
    submitted_at: string | null;
    schema_json: unknown;
    linked_documents: LinkedDoc[];
    public_link_intake_debug?: PublicLinkIntakeDebug | null;
};

function ConnectionRow({
    row,
    onOpen,
}: {
    row: EntityConnectionRow;
    onOpen?: () => void;
}) {
    const linked = row.recordId != null;
    return (
        <div className="flex flex-col gap-1 border-b border-[#eef0f4] py-2.5 text-sm last:border-b-0 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="font-medium text-[#31394d]">{row.label}</span>
                    <span className={linked ? "font-medium text-[#1a6b52]" : "text-[#59678b]"}>
                        {linked ? "Linked" : "Not linked"}
                    </span>
                </div>
                <p className="mt-0.5 text-xs leading-snug text-[#59678b]">{row.hint}</p>
            </div>
            <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
                {linked && row.recordId ? (
                    <code className="max-w-[240px] truncate rounded bg-[#F4F6F9] px-1.5 py-0.5 font-mono text-[11px] text-[#31394d] sm:max-w-md">
                        {row.recordId}
                    </code>
                ) : null}
                {linked && onOpen ? (
                    <button type="button" className="text-[#00458C] hover:underline" onClick={onOpen}>
                        Open
                    </button>
                ) : null}
            </div>
        </div>
    );
}

export default function FormSubmissionDetailClient() {
    const params = useParams();
    const formId = typeof params?.formId === "string" ? params.formId : "";
    const submissionId = typeof params?.submissionId === "string" ? params.submissionId : "";
    const viewerTz = useAdminViewerTimezone();
    const { canMutate } = useAdminAuth();
    const { openDrawer } = useAdminDrawer();

    const [row, setRow] = useState<SubmissionDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [genBusy, setGenBusy] = useState(false);
    const [genMsg, setGenMsg] = useState<string | null>(null);
    const [genErr, setGenErr] = useState<string | null>(null);
    const [confirmBusy, setConfirmBusy] = useState(false);
    const [confirmErr, setConfirmErr] = useState<string | null>(null);
    const [manualBusy, setManualBusy] = useState(false);
    const [manualErr, setManualErr] = useState<string | null>(null);
    const [manualPerson, setManualPerson] = useState("");
    const [manualCustomer, setManualCustomer] = useState("");
    const [manualMember, setManualMember] = useState("");
    const [manualOpp, setManualOpp] = useState("");

    const load = useCallback(async () => {
        if (!submissionId) return;
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/admin/forms/submissions/${encodeURIComponent(submissionId)}`);
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Failed to load submission");
            setRow((json as { data?: SubmissionDetail }).data ?? null);
        } catch (e) {
            setError((e as Error).message);
            setRow(null);
        } finally {
            setLoading(false);
        }
    }, [submissionId]);

    useEffect(() => {
        void load();
    }, [load]);

    const confirmLinkage = async () => {
        if (!submissionId) return;
        setConfirmBusy(true);
        setConfirmErr(null);
        try {
            const res = await fetch(`/api/admin/forms/submissions/${encodeURIComponent(submissionId)}/confirm-linkage`, {
                method: "POST",
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Confirm failed");
            void load();
        } catch (e) {
            setConfirmErr((e as Error).message);
        } finally {
            setConfirmBusy(false);
        }
    };

    const applyManualLinks = async () => {
        if (!submissionId || !canMutate) return;
        setManualBusy(true);
        setManualErr(null);
        try {
            const body: Record<string, unknown> = {};
            const p = manualPerson.trim();
            const c = manualCustomer.trim();
            const m = manualMember.trim();
            const o = manualOpp.trim();
            if (p) body.person_id = p;
            if (c) body.customer_id = c;
            if (m) body.customer_member_id = m;
            if (o) body.opportunity_id = o;
            const res = await fetch(`/api/admin/forms/submissions/${encodeURIComponent(submissionId)}/manual-link`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Update failed");
            setManualPerson("");
            setManualCustomer("");
            setManualMember("");
            setManualOpp("");
            void load();
        } catch (e) {
            setManualErr((e as Error).message);
        } finally {
            setManualBusy(false);
        }
    };

    const generateDocument = async () => {
        if (!submissionId || !canMutate) return;
        setGenBusy(true);
        setGenErr(null);
        setGenMsg(null);
        try {
            const res = await fetch(`/api/admin/forms/submissions/${encodeURIComponent(submissionId)}/generate-document`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                setGenErr((json as { error?: string }).error ?? "Generate failed");
                return;
            }
            const docId = (json as { document_id?: string; reused?: boolean }).document_id;
            const reused = (json as { reused?: boolean }).reused;
            setGenMsg(
                docId ? `Document ${reused ? "already linked — " : ""}id ${docId}` : "Document generated"
            );
            void load();
        } catch (e) {
            setGenErr((e as Error).message);
        } finally {
            setGenBusy(false);
        }
    };

    const schemaParsed = row?.schema_json != null ? safeParseFormSchema(row.schema_json) : null;
    const schema: FormSchemaV1 | null = schemaParsed?.success ? schemaParsed.data : null;

    const lifecycle = useMemo(() => {
        if (!row) return null;
        return describeSubmissionLifecycle({
            status: row.status,
            payloadHasSignatures: payloadHasCapturedSignatures(row.payload),
        });
    }, [row]);

    const entityRows = useMemo(() => (row ? buildEntityConnectionRows(row) : []), [row]);

    const intakeSection = useMemo(() => (row ? buildSubmissionIntakeSection(row.payload?.meta) : null), [row]);

    const intakeNeedsAttention = useMemo(() => {
        if (!intakeSection) return false;
        return intakeSection.statusLabel !== "Linked" || !intakeSection.hasServerIntakeRecord;
    }, [intakeSection]);

    const payloadMetaObj = row?.payload?.meta;
    const payloadMetaRecord =
        payloadMetaObj && typeof payloadMetaObj === "object" && !Array.isArray(payloadMetaObj)
            ? (payloadMetaObj as Record<string, unknown>)
            : null;

    const launchContext = useMemo(() => parseFormLaunchContextFromPayloadMeta(row?.payload?.meta), [row?.payload?.meta]);

    const hasLaunchContextDisplay = useMemo(() => {
        return !!(
            launchContext.form_context_mode ||
            launchContext.source_entity_type ||
            launchContext.source_entity_id ||
            launchContext.prefill_enabled !== undefined ||
            launchContext.allow_auto_create !== undefined
        );
    }, [launchContext]);

    const needsConfirmLinkage = useMemo(() => {
        if (!row || row.status !== "submitted") return false;
        const hasCrm = !!(row.person_id || row.customer_id || row.customer_member_id || row.opportunity_id);
        return hasCrm && payloadMetaRecord?.intake_needs_review === true;
    }, [row, payloadMetaRecord]);

    const intakeReviewedAt =
        typeof payloadMetaRecord?.intake_reviewed_at === "string" ? payloadMetaRecord.intake_reviewed_at : null;

    const linkageCalloutVisible = useMemo(() => {
        if (!row || row.status !== "submitted") return false;
        return submissionDetailLinkageCalloutVisible({
            status: row.status,
            payloadMeta: row.payload?.meta,
            attachRow: {
                person_id: row.person_id,
                customer_id: row.customer_id,
                customer_member_id: row.customer_member_id,
                opportunity_id: row.opportunity_id,
            },
        });
    }, [row]);

    const linkageCalloutReasons = useMemo(() => {
        if (!row) return [];
        return buildLinkageReviewCalloutReasons(row.payload?.meta, {
            person_id: row.person_id,
            customer_id: row.customer_id,
            customer_member_id: row.customer_member_id,
            opportunity_id: row.opportunity_id,
        });
    }, [row]);

    const showLinkageWorkflowSection = useMemo(() => {
        if (!row || row.status !== "submitted") return false;
        return linkageCalloutVisible || needsConfirmLinkage || canMutate;
    }, [row, linkageCalloutVisible, needsConfirmLinkage, canMutate]);

    const docGenBlocked = useMemo(() => {
        if (!row || row.status !== "submitted") return { blocked: false as const };
        return documentGenerationBlockedByIntake(row.payload?.meta, {
            person_id: row.person_id,
            customer_id: row.customer_id,
            customer_member_id: row.customer_member_id,
            opportunity_id: row.opportunity_id,
        });
    }, [row]);

    const documentOutcome = useMemo(() => {
        if (!row) return null;
        const blocked =
            row.status === "submitted" &&
            documentGenerationBlockedByIntake(row.payload?.meta, {
                person_id: row.person_id,
                customer_id: row.customer_id,
                customer_member_id: row.customer_member_id,
                opportunity_id: row.opportunity_id,
            }).blocked;
        return describeDocumentOutcome({
            linkedDocumentsCount: row.linked_documents.length,
            submissionStatus: row.status,
            canMutate,
            documentGenerationBlocked: blocked,
        });
    }, [row, canMutate]);

    const nextSteps = useMemo(() => {
        if (!row) return [];
        const hasCrm =
            !!(row.person_id || row.customer_id || row.customer_member_id || row.opportunity_id);
        return recommendedNextAction({
            status: row.status,
            linkedDocumentsCount: row.linked_documents.length,
            canMutate,
            hasAnyCrmEntityLink: hasCrm,
            payloadMeta: row.payload?.meta,
            attachRow: {
                person_id: row.person_id,
                customer_id: row.customer_id,
                customer_member_id: row.customer_member_id,
                opportunity_id: row.opportunity_id,
            },
        });
    }, [row, canMutate]);

    if (!formId || !submissionId) {
        return <p className="p-6 text-sm text-red-700">Missing route params.</p>;
    }

    const mismatch = row && row.form_definition_id !== formId;

    return (
        <div className="space-y-6">
            <AdminPageHeader
                title="Submission"
                subtitle="Outcome, linked records, documents, and answers."
                actions={
                    <div className="flex flex-wrap gap-3">
                        <Link
                            href={`${ADMIN_FORMS_UI_BASE}/${encodeURIComponent(formId)}/submissions`}
                            className="text-sm font-medium text-[#00458C] hover:underline"
                        >
                            Submissions
                        </Link>
                        <Link
                            href={`${ADMIN_FORMS_UI_BASE}/${encodeURIComponent(formId)}`}
                            className="text-sm font-medium text-[#00458C] hover:underline"
                        >
                            Form
                        </Link>
                    </div>
                }
            />

            {loading ? (
                <p className="text-sm text-[#59678b]">Loading…</p>
            ) : error ? (
                <p className="text-sm text-red-700">{error}</p>
            ) : mismatch ? (
                <p className="text-sm text-red-700">This submission does not belong to the form in the URL.</p>
            ) : row && lifecycle && documentOutcome ? (
                <>
                    {linkageCalloutVisible ? (
                        <div
                            className="rounded-lg border-2 border-amber-400 bg-amber-50 px-4 py-4 shadow-sm"
                            role="status"
                            aria-live="polite"
                            data-testid="linkage-review-callout"
                        >
                            <p className="text-base font-semibold text-amber-950">
                                Record linkage needs review before document generation.
                            </p>
                            <p className="mt-2 text-sm leading-relaxed text-amber-950/90">
                                Resolve the items below (confirm, correct CRM links, or ask an admin). Document generation
                                stays blocked until Alloy can attach to the right CRM parent safely.
                            </p>
                            {linkageCalloutReasons.length ? (
                                <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-[#31394d]">
                                    {linkageCalloutReasons.map((line, i) => (
                                        <li key={`lr-${i}`}>{line}</li>
                                    ))}
                                </ul>
                            ) : null}
                        </div>
                    ) : null}

                    <SectionCard title="Outcome summary">
                        <section className="space-y-2 border-b border-[#e6e8ec] pb-4">
                            <h3 className="text-xs font-bold uppercase tracking-wide text-[#59678b]">
                                Submission status
                            </h3>
                            <div className="flex flex-wrap items-center gap-2">
                                <StatusBadge label={row.status} variant={getStatusVariant(row.status)} />
                                <span className="text-sm font-semibold text-[#31394d]">{lifecycle.headline}</span>
                            </div>
                            {row.submitted_at ? (
                                <p className="text-sm text-[#31394d]">
                                    <span className="text-[#59678b]">Submitted at: </span>
                                    {formatDateTimeForUserDisplay(row.submitted_at, viewerTz)}
                                </p>
                            ) : (
                                <p className="text-sm text-[#59678b]">Not submitted yet — no submitted timestamp.</p>
                            )}
                            <p className="text-sm text-[#59678b]">
                                Created: {formatDateTimeForUserDisplay(row.created_at, viewerTz)}
                            </p>
                            {intakeReviewedAt ? (
                                <p className="text-sm text-[#31394d]">
                                    <span className="text-[#59678b]">Intake review recorded: </span>
                                    {formatDateTimeForUserDisplay(intakeReviewedAt, viewerTz)}
                                </p>
                            ) : null}
                            {lifecycle.notes.length ? (
                                <ul className="list-disc space-y-1 pl-5 text-sm text-[#31394d]">
                                    {lifecycle.notes.map((n, i) => (
                                        <li key={`lc-${i}`}>{n}</li>
                                    ))}
                                </ul>
                            ) : null}
                        </section>

                        {hasLaunchContextDisplay ? (
                            <section className="space-y-2 border-b border-[#e6e8ec] py-4">
                                <h3 className="text-xs font-bold uppercase tracking-wide text-[#59678b]">
                                    Form launch context
                                </h3>
                                <p className="text-sm text-[#59678b]">
                                    How this submission was started (from link metadata stamped at draft create). Prefill and
                                    deep launch flows are incremental — this panel is read-only today.
                                </p>
                                <dl className="grid gap-2 text-sm text-[#31394d] sm:grid-cols-2">
                                    <div>
                                        <dt className="text-xs text-[#59678b]">form_context_mode</dt>
                                        <dd className="font-mono text-xs">{launchContext.form_context_mode ?? "—"}</dd>
                                    </div>
                                    <div>
                                        <dt className="text-xs text-[#59678b]">source_entity_type</dt>
                                        <dd className="font-mono text-xs">{launchContext.source_entity_type ?? "—"}</dd>
                                    </div>
                                    <div className="sm:col-span-2">
                                        <dt className="text-xs text-[#59678b]">source_entity_id</dt>
                                        <dd className="break-all font-mono text-[11px]">
                                            {launchContext.source_entity_id ?? "—"}
                                        </dd>
                                    </div>
                                    <div>
                                        <dt className="text-xs text-[#59678b]">prefill_enabled</dt>
                                        <dd>{launchContext.prefill_enabled === undefined ? "—" : launchContext.prefill_enabled ? "Yes" : "No"}</dd>
                                    </div>
                                    <div>
                                        <dt className="text-xs text-[#59678b]">allow_auto_create</dt>
                                        <dd>
                                            {launchContext.allow_auto_create === undefined ?
                                                "—"
                                            : launchContext.allow_auto_create ?
                                                "Yes"
                                            :   "No"}
                                        </dd>
                                    </div>
                                </dl>
                            </section>
                        ) : null}

                        {intakeSection ? (
                            <section
                                className={`space-y-2 border-b border-[#e6e8ec] py-4 ${
                                    intakeNeedsAttention ? "rounded-lg border border-amber-200 bg-amber-50/40 px-3 py-3 sm:px-4" : ""
                                }`}
                            >
                                <div className="flex flex-wrap items-center gap-2">
                                    <h3 className="text-xs font-bold uppercase tracking-wide text-[#59678b]">
                                        Intake &amp; record linking
                                    </h3>
                                    <StatusBadge
                                        label={intakeSection.statusLabel}
                                        variant={
                                            intakeSection.statusLabel === "Linked"
                                                ? "success"
                                                : intakeSection.statusLabel === "Skipped"
                                                  ? "neutral"
                                                  : intakeSection.statusLabel === "Error"
                                                    ? "error"
                                                    : intakeSection.statusLabel === "No record"
                                                      ? "neutral"
                                                      : "warning"
                                        }
                                    />
                                </div>
                                <p className="text-sm font-medium text-[#31394d]">{intakeSection.strategyLabel}</p>
                                <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-[#31394d]">
                                    {intakeSection.detailLines.map((n, i) => (
                                        <li key={`intake-${i}`}>{n}</li>
                                    ))}
                                </ul>
                                {intakeNeedsAttention ?
                                    <p className="text-sm font-medium text-amber-950">
                                        Needs review — check this section before using Generate document.
                                    </p>
                                : null}

                                <div className="mt-3 rounded-lg border border-[#e6e8ec] bg-white px-3 py-2.5 sm:px-4">
                                    <h4 className="text-xs font-bold uppercase tracking-wide text-[#59678b]">
                                        Link configuration (operator)
                                    </h4>
                                    {row.public_link_intake_debug ?
                                        <dl className="mt-2 grid gap-2 text-xs text-[#31394d] sm:grid-cols-2">
                                            <div>
                                                <dt className="text-[#59678b]">Public link id</dt>
                                                <dd className="break-all font-mono text-[11px]">
                                                    {row.public_link_intake_debug.public_link_id ?? "—"}
                                                </dd>
                                            </div>
                                            <div>
                                                <dt className="text-[#59678b]">Lead capture / intake</dt>
                                                <dd>{row.public_link_intake_debug.lead_capture ? "Yes" : "No"}</dd>
                                            </div>
                                            <div>
                                                <dt className="text-[#59678b]">default_vertical_id</dt>
                                                <dd className="break-all font-mono text-[11px]">
                                                    {row.public_link_intake_debug.default_vertical_id ?? "Missing"}
                                                </dd>
                                            </div>
                                            <div>
                                                <dt className="text-[#59678b]">Auto-create flags</dt>
                                                <dd className="leading-snug">
                                                    person{" "}
                                                    {row.public_link_intake_debug.auto_create_person ? "on" : "off"},{" "}
                                                    customer{" "}
                                                    {row.public_link_intake_debug.auto_create_customer ? "on" : "off"},{" "}
                                                    member{" "}
                                                    {row.public_link_intake_debug.auto_create_customer_member ?
                                                        "on"
                                                    :   "off"}
                                                    , opp{" "}
                                                    {row.public_link_intake_debug.auto_create_opportunity ? "on" : "off"}
                                                </dd>
                                            </div>
                                            {row.public_link_intake_debug.link_label ?
                                                <div className="sm:col-span-2">
                                                    <dt className="text-[#59678b]">Link label</dt>
                                                    <dd>{row.public_link_intake_debug.link_label}</dd>
                                                </div>
                                            : null}
                                            {row.public_link_intake_debug.alloy_admin_preview ?
                                                <div className="sm:col-span-2 text-[#59678b]">
                                                    This link was minted as an Admin preview session.
                                                </div>
                                            : null}
                                            {row.public_link_intake_debug.form_context_mode ?
                                                <div>
                                                    <dt className="text-[#59678b]">form_context_mode (link)</dt>
                                                    <dd className="font-mono text-[11px]">
                                                        {row.public_link_intake_debug.form_context_mode}
                                                    </dd>
                                                </div>
                                            : null}
                                            {row.public_link_intake_debug.source_entity_type ?
                                                <div>
                                                    <dt className="text-[#59678b]">source_entity_type (link)</dt>
                                                    <dd className="font-mono text-[11px]">
                                                        {row.public_link_intake_debug.source_entity_type}
                                                    </dd>
                                                </div>
                                            : null}
                                            {row.public_link_intake_debug.source_entity_id ?
                                                <div className="sm:col-span-2">
                                                    <dt className="text-[#59678b]">source_entity_id (link)</dt>
                                                    <dd className="break-all font-mono text-[11px]">
                                                        {row.public_link_intake_debug.source_entity_id}
                                                    </dd>
                                                </div>
                                            : null}
                                            {row.public_link_intake_debug.prefill_enabled !== null &&
                                            row.public_link_intake_debug.prefill_enabled !== undefined ?
                                                <div>
                                                    <dt className="text-[#59678b]">prefill_enabled (link)</dt>
                                                    <dd>{row.public_link_intake_debug.prefill_enabled ? "Yes" : "No"}</dd>
                                                </div>
                                            : null}
                                            {row.public_link_intake_debug.allow_auto_create !== null &&
                                            row.public_link_intake_debug.allow_auto_create !== undefined ?
                                                <div>
                                                    <dt className="text-[#59678b]">allow_auto_create (link)</dt>
                                                    <dd>{row.public_link_intake_debug.allow_auto_create ? "Yes" : "No"}</dd>
                                                </div>
                                            : null}
                                        </dl>
                                    : row.created_via_public_link_id ?
                                        <p className="mt-2 text-xs text-[#59678b]">
                                            Public link id on submission:{" "}
                                            <code className="break-all font-mono text-[11px] text-[#31394d]">
                                                {row.created_via_public_link_id}
                                            </code>{" "}
                                            — link metadata could not be loaded.
                                        </p>
                                    :   <p className="mt-2 text-xs text-[#59678b]">
                                            This submission was not created via a public link (no shareable link id).
                                        </p>
                                    }
                                </div>
                            </section>
                        ) : null}

                        <section className="space-y-1 border-b border-[#e6e8ec] py-4">
                            <h3 className="text-xs font-bold uppercase tracking-wide text-[#59678b]">
                                Records connected
                            </h3>
                            <p className="mb-2 text-sm text-[#59678b]">
                                CRM links appear when intake or other flows attach them. “Not linked” is normal for early
                                drafts.
                            </p>
                            <div className="rounded-lg border border-[#e6e8ec] bg-[#fafbfd] px-3 sm:px-4">
                                {entityRows.map((er) => (
                                    <ConnectionRow
                                        key={er.key}
                                        row={er}
                                        onOpen={
                                            er.key === "person" && er.recordId
                                                ? () => openDrawer({ type: "persons", id: er.recordId! })
                                                : er.key === "customer" && er.recordId
                                                  ? () => openDrawer({ type: "customers", id: er.recordId! })
                                                  : er.key === "customer_member" && er.recordId
                                                    ? () =>
                                                          openDrawer({
                                                              type: "customer_members",
                                                              id: er.recordId!,
                                                          })
                                                    : er.key === "opportunity" && er.recordId
                                                      ? () =>
                                                            openDrawer({
                                                                type: "opportunities",
                                                                id: er.recordId!,
                                                            })
                                                      : undefined
                                        }
                                    />
                                ))}
                            </div>
                        </section>

                        {showLinkageWorkflowSection ? (
                            <section
                                className="space-y-4 border-b border-[#e6e8ec] py-4"
                                data-testid="linkage-workflow-section"
                            >
                                <h3 className="text-xs font-bold uppercase tracking-wide text-[#59678b]">
                                    Record linkage review
                                </h3>
                                <p className="text-sm text-[#59678b]">
                                    Use <strong className="font-medium text-[#31394d]">Confirm</strong> when the CRM rows
                                    in &quot;Records connected&quot; are already correct. Use{" "}
                                    <strong className="font-medium text-[#31394d]">Correct linked records</strong> when
                                    intake attached the wrong person, household, child, or opportunity.
                                </p>

                                {needsConfirmLinkage ? (
                                    <div className="rounded-lg border border-[#e6e8ec] bg-[#fafbfd] px-3 py-3 sm:px-4">
                                        <p className="text-sm font-medium text-[#31394d]">Confirm current linked records</p>
                                        <p className="mt-1 text-sm text-[#59678b]">
                                            Intake linked CRM rows but asked for a human check (for example after
                                            auto-creating a child member). If everything above matches the family you expect,
                                            confirm so document generation can continue when a CRM attach parent exists.
                                        </p>
                                        {confirmErr ? <p className="mt-2 text-sm text-red-700">{confirmErr}</p> : null}
                                        <div className="mt-3">
                                            <PrimaryButton
                                                type="button"
                                                className="!px-3 !py-2 text-sm"
                                                disabled={confirmBusy}
                                                onClick={() => void confirmLinkage()}
                                                data-testid="confirm-linkage-primary"
                                            >
                                                {confirmBusy ? "Confirming…" : "Confirm record linkage"}
                                            </PrimaryButton>
                                        </div>
                                    </div>
                                ) : null}

                                <div className="rounded-lg border border-[#e6e8ec] bg-white px-3 py-3 sm:px-4">
                                    <p className="text-sm font-medium text-[#31394d]">Correct linked records</p>
                                    <p className="mt-1 text-sm leading-relaxed text-[#59678b]">
                                        Use this if the submission linked to the wrong person, customer, child member, or
                                        opportunity. Paste the correct CRM record IDs if you already know them.
                                    </p>
                                    <p className="mt-2 text-sm leading-relaxed text-[#59678b]">
                                        If <strong className="font-medium text-[#31394d]">no existing CRM row</strong> is
                                        correct, create the family, child, or opportunity in CRM first, then return here and
                                        link this submission. Alloy does not create new CRM records from this screen yet — see{" "}
                                        <code className="rounded bg-[#F4F6F9] px-1 font-mono text-[11px]">
                                            docs/forms/linkage-review-operator-flow.md
                                        </code>
                                        .
                                    </p>

                                    {canMutate ? (
                                        <>
                                            {/* TODO: Replace UUID paste with a searchable entity picker when a scoped admin search API exists (safe org filters). */}
                                            <details className="mt-3 rounded-md border border-dashed border-[#cfd6e6] bg-[#fafbfd] px-3 py-2">
                                                <summary className="cursor-pointer text-sm font-medium text-[#00458C]">
                                                    Advanced — manual CRM record IDs (UUID paste)
                                                </summary>
                                                <p className="mt-2 text-xs text-[#59678b]">
                                                    For fields you want to change, paste the UUID from the CRM record URL or
                                                    drawer. Leave blank to keep the current link. Clearing a link still
                                                    requires sending{" "}
                                                    <code className="font-mono text-[11px]">null</code> via the API.
                                                </p>
                                                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                                    <label className="block text-xs text-[#59678b]">
                                                        Person id
                                                        <input
                                                            className="mt-1 w-full rounded border border-[#cfd6e6] px-2 py-1.5 font-mono text-xs text-[#31394d]"
                                                            value={manualPerson}
                                                            onChange={(e) => setManualPerson(e.target.value)}
                                                            placeholder={row.person_id ?? "leave blank to keep"}
                                                            autoComplete="off"
                                                            data-testid="manual-link-person"
                                                        />
                                                    </label>
                                                    <label className="block text-xs text-[#59678b]">
                                                        Customer id
                                                        <input
                                                            className="mt-1 w-full rounded border border-[#cfd6e6] px-2 py-1.5 font-mono text-xs text-[#31394d]"
                                                            value={manualCustomer}
                                                            onChange={(e) => setManualCustomer(e.target.value)}
                                                            placeholder={row.customer_id ?? "leave blank to keep"}
                                                            autoComplete="off"
                                                        />
                                                    </label>
                                                    <label className="block text-xs text-[#59678b]">
                                                        Customer member (child) id
                                                        <input
                                                            className="mt-1 w-full rounded border border-[#cfd6e6] px-2 py-1.5 font-mono text-xs text-[#31394d]"
                                                            value={manualMember}
                                                            onChange={(e) => setManualMember(e.target.value)}
                                                            placeholder={row.customer_member_id ?? "leave blank to keep"}
                                                            autoComplete="off"
                                                        />
                                                    </label>
                                                    <label className="block text-xs text-[#59678b]">
                                                        Opportunity id
                                                        <input
                                                            className="mt-1 w-full rounded border border-[#cfd6e6] px-2 py-1.5 font-mono text-xs text-[#31394d]"
                                                            value={manualOpp}
                                                            onChange={(e) => setManualOpp(e.target.value)}
                                                            placeholder={row.opportunity_id ?? "leave blank to keep"}
                                                            autoComplete="off"
                                                        />
                                                    </label>
                                                </div>
                                                {manualErr ? <p className="mt-2 text-sm text-red-700">{manualErr}</p> : null}
                                                <div className="mt-3 flex flex-wrap gap-2">
                                                    <SecondaryButton
                                                        type="button"
                                                        className="!px-3 !py-2 text-sm"
                                                        disabled={manualBusy}
                                                        onClick={() => void applyManualLinks()}
                                                        data-testid="apply-manual-links"
                                                    >
                                                        {manualBusy ? "Applying…" : "Apply corrected CRM links"}
                                                    </SecondaryButton>
                                                </div>
                                            </details>
                                        </>
                                    ) : (
                                        <p className="mt-3 text-xs text-[#59678b]">
                                            Admin role is required to paste CRM IDs and correct foreign keys. Ask an admin if
                                            linkage needs to change.
                                        </p>
                                    )}
                                </div>
                            </section>
                        ) : null}

                        <section className="space-y-2 border-b border-[#e6e8ec] py-4">
                            <h3 className="text-xs font-bold uppercase tracking-wide text-[#59678b]">
                                Document outcome
                            </h3>
                            <p className="text-sm font-medium text-[#31394d]">{documentOutcome.headline}</p>
                            <ul className="list-disc space-y-1 pl-5 text-sm text-[#31394d]">
                                {documentOutcome.bullets.map((b, i) => (
                                    <li key={`doc-${i}`}>{b}</li>
                                ))}
                            </ul>
                            {row.linked_documents.length > 0 ? (
                                <ul className="space-y-1.5 text-sm text-[#31394d]">
                                    {row.linked_documents.map((L) => (
                                        <li key={`${L.role}-${L.document.id}`} className="flex flex-wrap items-center gap-2">
                                            <span className="font-medium text-[#59678b]">{L.role}</span>
                                            <span>
                                                {L.document.name?.trim() ||
                                                    L.document.original_filename?.trim() ||
                                                    "Untitled"}
                                            </span>
                                            <button
                                                type="button"
                                                className="text-[#00458C] hover:underline"
                                                onClick={() => openDrawer({ type: "documents", id: L.document.id })}
                                            >
                                                Open
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            ) : null}
                            <p className="text-xs text-[#59678b]">
                                Full actions (generate PDF) stay under <strong>Documents &amp; PDF</strong> below.
                            </p>
                        </section>

                        <section className="space-y-2 border-b border-[#e6e8ec] py-4">
                            <h3 className="text-xs font-bold uppercase tracking-wide text-[#59678b]">
                                Workflow / automations
                            </h3>
                            <p className="text-sm leading-relaxed text-[#31394d]">{WORKFLOW_SIGNALS_OPERATOR_COPY}</p>
                            <p className="text-xs italic text-[#59678b]">
                                Follow-up: show recent matching workflow events here when we add a scoped list API.
                            </p>
                        </section>

                        <section className="space-y-2 py-4">
                            <h3 className="text-xs font-bold uppercase tracking-wide text-[#59678b]">
                                Recommended next steps
                            </h3>
                            <ul className="list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-[#31394d]">
                                {nextSteps.map((line, i) => (
                                    <li key={`next-${i}`}>{line}</li>
                                ))}
                            </ul>
                        </section>

                        <details className="rounded-md border border-dashed border-[#cfd6e6] bg-[#f8f9fc] px-3 py-2 text-sm">
                            <summary className="cursor-pointer font-medium text-[#59678b]">
                                Technical identifiers
                            </summary>
                            <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                                <div>
                                    <dt className="text-[#59678b]">Submission id</dt>
                                    <dd className="font-mono text-[#31394d]">{row.id}</dd>
                                </div>
                                <div>
                                    <dt className="text-[#59678b]">Form definition id</dt>
                                    <dd className="font-mono text-[#31394d]">{row.form_definition_id}</dd>
                                </div>
                                <div>
                                    <dt className="text-[#59678b]">Version id</dt>
                                    <dd className="font-mono text-[#31394d]">{row.form_definition_version_id}</dd>
                                </div>
                            </dl>
                        </details>
                    </SectionCard>

                    <SectionCard title="Documents & PDF">
                        {row.linked_documents.length === 0 ? (
                            <p className="text-sm text-[#59678b]">No documents linked yet.</p>
                        ) : (
                            <ul className="space-y-2 text-sm">
                                {row.linked_documents.map((L) => (
                                    <li key={`${L.role}-${L.document.id}`} className="flex flex-wrap items-center gap-2">
                                        <StatusBadge label={L.role} variant="neutral" />
                                        <span className="text-[#31394d]">
                                            {L.document.name?.trim() ||
                                                L.document.original_filename?.trim() ||
                                                "Untitled"}
                                        </span>
                                        <button
                                            type="button"
                                            className="text-[#00458C] hover:underline"
                                            onClick={() => openDrawer({ type: "documents", id: L.document.id })}
                                        >
                                            Open
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                        {row.status === "submitted" ? (
                            <div className="mt-4 border-t border-[#e6e8ec] pt-4">
                                {!canMutate ? (
                                    <p className="text-xs text-[#59678b]">Admin role required to generate PDF.</p>
                                ) : (
                                    <>
                                        {docGenBlocked.blocked && docGenBlocked.reason ? (
                                            <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                                                {docGenBlocked.reason}
                                            </p>
                                        ) : null}
                                        <PrimaryButton
                                            type="button"
                                            className="!px-3 !py-2 text-sm"
                                            disabled={genBusy || docGenBlocked.blocked}
                                            onClick={() => void generateDocument()}
                                        >
                                            {genBusy ? "Generating…" : "Generate document (PDF stub)"}
                                        </PrimaryButton>
                                        {genErr ? <p className="mt-2 text-sm text-red-700">{genErr}</p> : null}
                                        {genMsg ? <p className="mt-2 text-sm text-[#31394d]">{genMsg}</p> : null}
                                        <p className="mt-2 text-xs text-[#59678b]">
                                            Creates or reuses a documents row using this version&apos;s{" "}
                                            <code className="font-mono text-[11px]">pdf_mapping_json</code>, then links it
                                            to this submission.
                                        </p>
                                        <p className="mt-3 text-xs leading-relaxed text-[#59678b]">
                                            Generated documents live in the Documents system and attach to the selected CRM
                                            parent (person, customer, child member, or opportunity). Future document type /
                                            category controls will decide how they surface across those records — today,
                                            open linked files from this submission or from the Documents drawer.
                                        </p>
                                    </>
                                )}
                            </div>
                        ) : (
                            <p className="mt-3 text-xs text-[#59678b]">Submit the form before generating a document.</p>
                        )}
                    </SectionCard>

                    <SectionCard title="Answers & technical details">
                        <section className="space-y-2">
                            <h3 className="text-sm font-semibold text-[#31394d]">Answers submitted</h3>
                            <p className="text-xs text-[#59678b]">
                                Same read-only view recipients filled out (fields depend on published schema).
                            </p>
                            {!schema ? (
                                <p className="text-sm text-[#59678b]">Schema unavailable — see technical payload below.</p>
                            ) : (
                                <div className="rounded-lg border border-[#e6e8ec] bg-white p-4">
                                    <FormEngineRenderer
                                        schema={schema}
                                        payload={row.payload}
                                        onChange={() => {}}
                                        mode="readonly"
                                    />
                                </div>
                            )}
                        </section>
                        <details className="mt-5 rounded-md border border-[#e6e8ec] bg-[#fafbfd] p-3">
                            <summary className="cursor-pointer text-sm font-medium text-[#00458C]">
                                Technical payload (JSON)
                            </summary>
                            <p className="mt-2 text-xs text-[#59678b]">
                                Raw submission payload for support or debugging — not needed for daily operations.
                            </p>
                            <pre className="mt-2 max-h-64 overflow-auto rounded bg-[#F4F6F9] p-3 font-mono text-xs">
                                {JSON.stringify(row.payload, null, 2)}
                            </pre>
                        </details>
                    </SectionCard>
                </>
            ) : null}
        </div>
    );
}
