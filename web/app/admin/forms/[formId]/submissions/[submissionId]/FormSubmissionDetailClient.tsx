"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
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
};

function FkRow({
    label,
    id,
    onOpen,
}: {
    label: string;
    id: string | null;
    onOpen?: () => void;
}) {
    if (!id) return null;
    return (
        <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-[#59678b]">{label}</span>
            <code className="rounded bg-[#F4F6F9] px-1.5 py-0.5 font-mono text-xs text-[#31394d]">{id}</code>
            {onOpen ? (
                <button type="button" className="text-[#00458C] hover:underline" onClick={onOpen}>
                    Open
                </button>
            ) : null}
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

    if (!formId || !submissionId) {
        return <p className="p-6 text-sm text-red-700">Missing route params.</p>;
    }

    const mismatch = row && row.form_definition_id !== formId;

    return (
        <div className="space-y-6">
            <AdminPageHeader
                title="Submission"
                subtitle="Status, linked documents, and captured answers."
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
            ) : row ? (
                <>
                    <SectionCard title="Summary">
                        <div className="flex flex-wrap gap-3">
                            <StatusBadge label={row.status} variant={getStatusVariant(row.status)} />
                        </div>
                        <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                            <div>
                                <dt className="text-[#59678b]">Submission id</dt>
                                <dd className="font-mono text-xs text-[#31394d]">{row.id}</dd>
                            </div>
                            <div>
                                <dt className="text-[#59678b]">Version id</dt>
                                <dd className="font-mono text-xs text-[#31394d]">{row.form_definition_version_id}</dd>
                            </div>
                            <div>
                                <dt className="text-[#59678b]">Created</dt>
                                <dd className="text-[#31394d]">{formatDateTime(row.created_at)}</dd>
                            </div>
                            <div>
                                <dt className="text-[#59678b]">Submitted</dt>
                                <dd className="text-[#31394d]">{row.submitted_at ? formatDateTime(row.submitted_at) : "—"}</dd>
                            </div>
                        </dl>

                        <div className="mt-4 space-y-2 border-t border-[#e6e8ec] pt-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-[#59678b]">Related records</p>
                            <FkRow
                                label="Person"
                                id={row.person_id}
                                onOpen={
                                    row.person_id ? () => openDrawer({ type: "persons", id: row.person_id! }) : undefined
                                }
                            />
                            <FkRow
                                label="Customer"
                                id={row.customer_id}
                                onOpen={
                                    row.customer_id ? () => openDrawer({ type: "customers", id: row.customer_id! }) : undefined
                                }
                            />
                            <FkRow
                                label="Customer member"
                                id={row.customer_member_id}
                                onOpen={
                                    row.customer_member_id
                                        ? () => openDrawer({ type: "customer_members", id: row.customer_member_id! })
                                        : undefined
                                }
                            />
                            <FkRow
                                label="Opportunity"
                                id={row.opportunity_id}
                                onOpen={
                                    row.opportunity_id
                                        ? () => openDrawer({ type: "opportunities", id: row.opportunity_id! })
                                        : undefined
                                }
                            />
                            <FkRow label="Public link id" id={row.created_via_public_link_id} />
                        </div>
                    </SectionCard>

                    <SectionCard title="Documents">
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
                                        <PrimaryButton
                                            type="button"
                                            className="!px-3 !py-2 text-sm"
                                            disabled={genBusy}
                                            onClick={() => void generateDocument()}
                                        >
                                            {genBusy ? "Generating…" : "Generate document (PDF stub)"}
                                        </PrimaryButton>
                                        {genErr ? <p className="mt-2 text-sm text-red-700">{genErr}</p> : null}
                                        {genMsg ? <p className="mt-2 text-sm text-[#31394d]">{genMsg}</p> : null}
                                        <p className="mt-2 text-xs text-[#59678b]">
                                            Uses existing pdf_mapping_json for this version; creates or reuses a documents row
                                            and links it here.
                                        </p>
                                    </>
                                )}
                            </div>
                        ) : (
                            <p className="mt-3 text-xs text-[#59678b]">Submit the form before generating a document.</p>
                        )}
                    </SectionCard>

                    <SectionCard title="Answers (read-only)">
                        {!schema ? (
                            <p className="text-sm text-[#59678b]">Schema unavailable; raw payload below.</p>
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
                        <details className="mt-4">
                            <summary className="cursor-pointer text-sm text-[#00458C]">Raw payload JSON</summary>
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
