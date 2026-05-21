"use client";

import { useCallback, useState } from "react";
import clsx from "clsx";
import { FormEngineRenderer } from "@/components/forms/engine/FormEngineRenderer";
import type { FormPayload } from "@/lib/forms/validateSubmission";
import { validateFormSchema } from "@/lib/forms/schema";
import type { PacketReviewRollupV1 } from "@/lib/forms/packets/packetReviewRollupTypes";
import {
    artifactKindBadgeClass,
    formatPacketReviewProvenanceLine,
    formatShortDate,
    operatorReviewStatusLabel,
} from "@/lib/forms/packets/packetReviewPresentation";

export type PacketReviewTechnicalDetails = {
    launch_context: unknown;
    crm_snapshot: unknown;
    shared_values: unknown;
};

type Props = {
    rollup: PacketReviewRollupV1;
    technicalDetails?: PacketReviewTechnicalDetails | null;
    /** `page` — full console; `modal` — denser spacing */
    placement?: "page" | "modal";
    /** Review actions slot (approve / reject / needs correction) rendered after case file */
    reviewActionsSlot?: React.ReactNode;
};

function JsonPanel({ title, subtitle, value }: { title: string; subtitle?: string; value: unknown }) {
    return (
        <div className="rounded-lg border border-[#e6e8ec] bg-[#fafbfd] p-3 text-xs text-[#59678b]">
            <p className="font-medium text-[#31394d]">{title}</p>
            {subtitle ? <p className="mt-1 text-[11px] leading-snug">{subtitle}</p> : null}
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-[#31394d]">
                {JSON.stringify(value ?? {}, null, 2)}
            </pre>
        </div>
    );
}

async function openDocumentSignedUrl(docId: string): Promise<string | null> {
    const res = await fetch(`/api/admin/documents/${encodeURIComponent(docId)}/signed-url`, {
        credentials: "include",
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; signedUrl?: string; error?: string };
    if (!res.ok || !json.ok || !json.signedUrl) {
        return json.error ?? `Could not open file (${res.status})`;
    }
    window.open(json.signedUrl, "_blank", "noopener,noreferrer");
    return null;
}

export function PacketReviewRollupView({
    rollup,
    technicalDetails,
    placement = "page",
    reviewActionsSlot,
}: Props) {
    const compact = placement === "modal";
    const [openingDocId, setOpeningDocId] = useState<string | null>(null);
    const [openDocErr, setOpenDocErr] = useState<string | null>(null);
    const [techOpen, setTechOpen] = useState(false);

    const onOpenPdf = useCallback(async (docId: string) => {
        setOpenDocErr(null);
        setOpeningDocId(docId);
        try {
            const err = await openDocumentSignedUrl(docId);
            if (err) setOpenDocErr(err);
        } catch (e) {
            setOpenDocErr(e instanceof Error ? e.message : "Failed to open document");
        } finally {
            setOpeningDocId(null);
        }
    }, []);

    const ctx = rollup.enrollment_context;
    const prog = rollup.progress;

    return (
        <div className={clsx("space-y-4", compact && "space-y-3 text-[13px]")}>
            <section className="rounded-lg border border-[#c7d2fe] bg-[#eef2ff] px-4 py-3 text-sm text-[#1e3a8a]">
                <h2 className="text-sm font-semibold text-[#172554]">Enrollment context</h2>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-[#1e3a8a]/90">
                    <li>
                        <span className="font-medium">Packet:</span> {rollup.packet_definition.name}
                        {rollup.packet_definition.key ?
                            <span className="text-[#475569]"> ({rollup.packet_definition.key})</span>
                        : null}
                    </li>
                    <li>
                        <span className="font-medium">Session status:</span> {rollup.status}
                        {" · "}
                        <span className="font-medium">Review:</span>{" "}
                        {operatorReviewStatusLabel(rollup.operator_review.status)}
                    </li>
                    <li>
                        <span className="font-medium">Progress:</span> {prog.submitted_steps} of {prog.total_steps}{" "}
                        steps submitted
                    </li>
                    {ctx.launch_surface === "crm_opportunity" ?
                        <li>
                            <span className="font-medium">Launch:</span> CRM opportunity packet link
                        </li>
                    : null}
                    {ctx.opportunity_id ?
                        <li>
                            <span className="font-medium">Opportunity:</span>{" "}
                            {ctx.opportunity_label ? `${ctx.opportunity_label} · ` : null}
                            <span className="font-mono text-[11px]">{ctx.opportunity_id}</span>
                        </li>
                    : null}
                    {ctx.customer_id ?
                        <li>
                            <span className="font-medium">Customer:</span>{" "}
                            {ctx.customer_label ? `${ctx.customer_label} · ` : null}
                            <span className="font-mono text-[11px]">{ctx.customer_id}</span>
                        </li>
                    : null}
                </ul>
            </section>

            {(rollup.linkage_summary.any_intake_needs_review || rollup.linkage_summary.steps_missing_crm_fk > 0) ?
                <section
                    role="status"
                    className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
                >
                    <p className="font-semibold">Linkage summary</p>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-[13px]">
                        {rollup.linkage_summary.any_intake_needs_review ?
                            <li>One or more steps need intake / linkage review.</li>
                        : null}
                        {rollup.linkage_summary.steps_missing_crm_fk > 0 ?
                            <li>
                                {rollup.linkage_summary.steps_missing_crm_fk} submitted step(s) missing CRM FK on
                                submission.
                            </li>
                        : null}
                    </ul>
                    <ul className="mt-2 space-y-1 text-[12px]">
                        {rollup.linkage_summary.steps
                            .filter((s) => s.intake_needs_review || !s.has_crm_fk)
                            .map((s) => (
                                <li key={s.sequence_index}>
                                    Step {s.sequence_index + 1}: {s.form_name}
                                    {s.admin_submission_path ?
                                        <>
                                            {" — "}
                                            <a
                                                href={s.admin_submission_path}
                                                className="font-semibold text-[#2563eb] hover:underline"
                                                target="_blank"
                                                rel="noreferrer"
                                            >
                                                Fix linkage
                                            </a>
                                        </>
                                    : null}
                                </li>
                            ))}
                    </ul>
                </section>
            : null}

            {rollup.operator_review.warnings.length > 0 ?
                <section className="rounded-lg border border-amber-200/80 bg-amber-50/90 px-3 py-2">
                    <p className="text-[11px] font-semibold text-amber-950">Name / CRM hints</p>
                    <ul className="mt-1 list-disc space-y-1 pl-4 text-[11px] text-amber-950/90">
                        {rollup.operator_review.warnings.map((w, i) => (
                            <li key={i}>{w.message}</li>
                        ))}
                    </ul>
                </section>
            : null}

            <section>
                <h2 className="text-sm font-semibold text-[#0f172a]">Submitted answers by step</h2>
                {rollup.steps.length === 0 ?
                    <p className="mt-2 text-sm text-[#59678b]">No steps in this packet.</p>
                :   <ul className="mt-2 space-y-4">
                        {rollup.steps.map((step) => {
                            let schema = null;
                            let payload: FormPayload = { values: {}, groups: {}, signatures: {} };
                            if (step.answer_view) {
                                try {
                                    schema = validateFormSchema(step.answer_view.schema_json);
                                    const raw = step.answer_view.payload;
                                    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
                                        payload = raw as FormPayload;
                                    }
                                } catch {
                                    schema = null;
                                }
                            }

                            return (
                                <li
                                    key={step.session_item_id}
                                    className="rounded-lg border border-[#e6e8ec] bg-white px-4 py-3 shadow-sm"
                                >
                                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                                        <h3 className="font-medium text-[#0f172a]">
                                            Step {step.sequence_index + 1}: {step.form_name}
                                        </h3>
                                        <span
                                            className={clsx(
                                                "rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                                                artifactKindBadgeClass(step.artifact.kind)
                                            )}
                                        >
                                            {step.artifact.label}
                                        </span>
                                    </div>
                                    <p className="mt-1 text-[11px] text-[#59678b]">
                                        Item: {step.item_status}
                                        {step.version_number != null ? ` · Version ${step.version_number}` : ""}
                                        {step.submitted_at ?
                                            ` · Submitted ${formatShortDate(step.submitted_at)}`
                                        :   ""}
                                    </p>

                                    {step.intake_meta?.intake_needs_review ?
                                        <p className="mt-2 text-[11px] text-amber-900">
                                            Intake needs review
                                            {step.intake_meta.intake_review_reason ?
                                                `: ${step.intake_meta.intake_review_reason}`
                                            :   ""}
                                        </p>
                                    : null}

                                    <div className="mt-3">
                                        {schema ?
                                            <div className="rounded-lg border border-[#e6e8ec] bg-[#fafbfd] p-3">
                                                <FormEngineRenderer
                                                    schema={schema}
                                                    payload={payload}
                                                    onChange={() => {}}
                                                    mode="readonly"
                                                    optionValuesByFieldId={step.answer_view?.option_values_by_field_id}
                                                />
                                            </div>
                                        : step.submission_status === "submitted" ?
                                            <p className="text-sm text-[#59678b]">
                                                Answers unavailable (schema could not be loaded).{" "}
                                                {step.artifact.admin_submission_path ?
                                                    <a
                                                        href={step.artifact.admin_submission_path}
                                                        className="font-semibold text-[#2563eb] hover:underline"
                                                        target="_blank"
                                                        rel="noreferrer"
                                                    >
                                                        Open submission
                                                    </a>
                                                : null}
                                            </p>
                                        :   <p className="text-sm text-[#59678b]">Not submitted yet.</p>
                                        }
                                    </div>

                                    <div className="mt-3 border-t border-[#e6e8ec] pt-3">
                                        <p className="text-[11px] font-semibold text-[#31394d]">Artifacts</p>
                                        {step.artifact.helper_text ?
                                            <p className="mt-1 text-[11px] text-[#59678b]">{step.artifact.helper_text}</p>
                                        : null}
                                        {step.artifact.kind === "generated_pdf" && step.artifact.documents.length > 0 ?
                                            <ul className="mt-2 space-y-1.5">
                                                {step.artifact.documents.map((doc) => {
                                                    const idxEntry = rollup.documents_index.find(
                                                        (e) => e.document_id === doc.id
                                                    );
                                                    return (
                                                        <li
                                                            key={doc.id}
                                                            className="flex flex-wrap items-center gap-2 text-[12px]"
                                                        >
                                                            <button
                                                                type="button"
                                                                className="font-semibold text-[#2563eb] hover:underline disabled:opacity-50"
                                                                disabled={openingDocId === doc.id}
                                                                onClick={() => void onOpenPdf(doc.id)}
                                                            >
                                                                {openingDocId === doc.id ? "Opening…" : doc.name ?? "View PDF"}
                                                            </button>
                                                            <span className="text-[#59678b]">
                                                                {doc.generation_label === "current" ?
                                                                    "Current generated PDF"
                                                                :   "Also generated"}
                                                            </span>
                                                            {idxEntry ?
                                                                <span className="text-[#59678b]">
                                                                    · {formatPacketReviewProvenanceLine(idxEntry.provenance)}
                                                                </span>
                                                            : null}
                                                        </li>
                                                    );
                                                })}
                                            </ul>
                                        : step.artifact.kind === "submitted_record" ?
                                            <div className="mt-2 text-[12px] text-[#59678b]">
                                                <p>Submitted form record (no generated PDF for this step).</p>
                                                {step.artifact.admin_submission_path ?
                                                    <a
                                                        href={step.artifact.admin_submission_path}
                                                        className="mt-1 inline-block font-semibold text-[#2563eb] hover:underline"
                                                        target="_blank"
                                                        rel="noreferrer"
                                                    >
                                                        View submission
                                                    </a>
                                                : null}
                                                {rollup.documents_index
                                                    .filter(
                                                        (e) =>
                                                            e.kind === "submitted_record" &&
                                                            e.form_submission_id === step.form_submission_id
                                                    )
                                                    .map((e) => (
                                                        <p key={e.form_submission_id} className="mt-1 text-[11px]">
                                                            {formatPacketReviewProvenanceLine(e.provenance)}
                                                        </p>
                                                    ))}
                                            </div>
                                        : step.artifact.kind === "pending" || step.artifact.kind === "not_started" ?
                                            <p className="mt-2 text-[12px] text-[#59678b]">{step.artifact.label}</p>
                                        :   null}
                                        {step.artifact.admin_submission_path ?
                                            <a
                                                href={step.artifact.admin_submission_path}
                                                className="mt-2 inline-block text-[11px] font-semibold text-[#2563eb] hover:underline"
                                                target="_blank"
                                                rel="noreferrer"
                                            >
                                                Open submission (advanced)
                                            </a>
                                        : null}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                }
            </section>

            {rollup.documents_index.length > 0 ?
                <section>
                    <h2 className="text-sm font-semibold text-[#0f172a]">Documents index</h2>
                    <ul className="mt-2 divide-y divide-[#e6e8ec] rounded-lg border border-[#e6e8ec] bg-white text-[12px]">
                        {rollup.documents_index.map((entry) => (
                            <li key={`${entry.kind}-${entry.form_submission_id}-${entry.document_id ?? "rec"}`} className="px-3 py-2">
                                <div className="font-medium text-[#31394d]">
                                    {entry.title}
                                    <span
                                        className={clsx(
                                            "ms-2 rounded border px-1 py-0.5 text-[10px] font-medium",
                                            artifactKindBadgeClass(entry.kind)
                                        )}
                                    >
                                        {entry.kind === "generated_pdf" ? "PDF" : "Submitted record"}
                                    </span>
                                </div>
                                <p className="mt-0.5 text-[#59678b]">{formatPacketReviewProvenanceLine(entry.provenance)}</p>
                                <div className="mt-1 flex flex-wrap gap-2">
                                    <a
                                        href={entry.admin_links.submission_path}
                                        className="font-semibold text-[#2563eb] hover:underline"
                                        target="_blank"
                                        rel="noreferrer"
                                    >
                                        Submission
                                    </a>
                                    {entry.document_id ?
                                        <button
                                            type="button"
                                            className="font-semibold text-[#2563eb] hover:underline disabled:opacity-50"
                                            disabled={openingDocId === entry.document_id}
                                            onClick={() => void onOpenPdf(entry.document_id!)}
                                        >
                                            Open PDF
                                        </button>
                                    : null}
                                </div>
                            </li>
                        ))}
                    </ul>
                </section>
            : null}

            {openDocErr ?
                <p className="text-xs text-red-700" role="alert">
                    {openDocErr}
                </p>
            : null}

            {technicalDetails ?
                <details
                    className="rounded-lg border border-[#e6e8ec] bg-[#fafbfd] px-3 py-2"
                    open={techOpen}
                    onToggle={(e) => setTechOpen(e.currentTarget.open)}
                >
                    <summary className="cursor-pointer text-sm font-medium text-[#00458C]">Technical details (JSON)</summary>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <JsonPanel title="Launch context" value={technicalDetails.launch_context} />
                        <JsonPanel title="CRM snapshot" value={technicalDetails.crm_snapshot} />
                    </div>
                    <div className="mt-3">
                        <JsonPanel title="Shared values" value={technicalDetails.shared_values} />
                    </div>
                </details>
            : null}

            {reviewActionsSlot ? <div className="border-t border-[#e6e8ec] pt-4">{reviewActionsSlot}</div> : null}
        </div>
    );
}
