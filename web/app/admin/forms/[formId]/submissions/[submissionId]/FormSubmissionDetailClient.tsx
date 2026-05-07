"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import SectionCard from "@/components/admin/SectionCard";
import PrimaryButton from "@/components/PrimaryButton";
import { StatusBadge, getStatusVariant } from "@/components/admin/StatusBadge";
import { formatDateTime } from "@/lib/adminFormatters";
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
    const { canMutate } = useAdminAuth();
    const { openDrawer } = useAdminDrawer();

    const [row, setRow] = useState<SubmissionDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [genBusy, setGenBusy] = useState(false);
    const [genMsg, setGenMsg] = useState<string | null>(null);
    const [genErr, setGenErr] = useState<string | null>(null);

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
                                    {formatDateTime(row.submitted_at)}
                                </p>
                            ) : (
                                <p className="text-sm text-[#59678b]">Not submitted yet — no submitted timestamp.</p>
                            )}
                            <p className="text-sm text-[#59678b]">Created: {formatDateTime(row.created_at)}</p>
                            {lifecycle.notes.length ? (
                                <ul className="list-disc space-y-1 pl-5 text-sm text-[#31394d]">
                                    {lifecycle.notes.map((n, i) => (
                                        <li key={`lc-${i}`}>{n}</li>
                                    ))}
                                </ul>
                            ) : null}
                        </section>

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
