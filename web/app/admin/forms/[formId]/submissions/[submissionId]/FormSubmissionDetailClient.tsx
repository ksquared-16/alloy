"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FormsOperationalLink, FormsWorkspaceShell } from "@/components/forms/workspace";
import { formsWorkspaceBreadcrumbs } from "@/lib/forms/formsModuleNav";
import { SubmissionIntakeCaseFileContent } from "@/components/forms/review/SubmissionIntakeCaseFileContent";
import type { SubmissionIntakeCaseFileRow } from "@/components/forms/review/SubmissionIntakeCaseFileContent";
import { safeParseFormSchema, type FormSchemaV1 } from "@/lib/forms/schema";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import type { AdminDrawerEntityType } from "@/contexts/AdminDrawerContext";
import { useAdminViewerTimezone } from "@/contexts/AdminViewerTimezoneContext";
import { ADMIN_FORMS_UI_BASE } from "@/lib/forms/adminFormsUiBase";
import { parseFormLaunchContextFromPayloadMeta } from "@/lib/forms/formContextMode";
import { effectiveManualLinkUuid } from "@/lib/admin/forms/crmEntitySearchShared";
import {
    buildEntityConnectionRows,
    buildSubmissionIntakeSection,
    describeDocumentOutcome,
    describeSubmissionLifecycle,
    documentGenerationBlockedByIntake,
    payloadHasCapturedSignatures,
    recommendedNextAction,
} from "@/lib/forms/submissionOutcomeSummary";
import {
    buildLinkageReviewCalloutReasons,
    submissionDetailLinkageCalloutVisible,
} from "@/lib/forms/submissionLinkageReviewUx";
import { isCleanCreatedEnrollmentLead, isCleanOperationalizedEnrollmentLead } from "@/lib/forms/intakeEnrollmentLeadClassification";
import type { BosSubmissionReviewContext } from "@/components/forms/review/BosReviewSummaryPlaceholder";
import { opMetadata } from "@/lib/operational/ui/operationalVisualTokens";

type SubmissionDetail = SubmissionIntakeCaseFileRow & {
    schema_json: unknown;
};

export default function FormSubmissionDetailClient() {
    const params = useParams();
    const formId = typeof params?.formId === "string" ? params.formId : "";
    const submissionId = typeof params?.submissionId === "string" ? params.submissionId : "";
    const viewerTz = useAdminViewerTimezone();
    const { canMutate } = useAdminAuth();
    const { openDrawer } = useAdminDrawer();

    const handleOpenDrawer = useCallback(
        (params: { type: AdminDrawerEntityType; id: string }) => {
            openDrawer({ type: params.type, id: params.id });
        },
        [openDrawer]
    );

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
    const [pickPerson, setPickPerson] = useState<{ id: string; label: string } | null>(null);
    const [pickCustomer, setPickCustomer] = useState<{ id: string; label: string } | null>(null);
    const [pickMember, setPickMember] = useState<{ id: string; label: string } | null>(null);
    const [pickOpp, setPickOpp] = useState<{ id: string; label: string } | null>(null);

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

    useEffect(() => {
        setPickPerson(null);
        setPickCustomer(null);
        setPickMember(null);
        setPickOpp(null);
        setManualPerson("");
        setManualCustomer("");
        setManualMember("");
        setManualOpp("");
    }, [submissionId]);

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
            const p = effectiveManualLinkUuid(manualPerson.trim(), pickPerson?.id);
            const c = effectiveManualLinkUuid(manualCustomer.trim(), pickCustomer?.id);
            const m = effectiveManualLinkUuid(manualMember.trim(), pickMember?.id);
            const o = effectiveManualLinkUuid(manualOpp.trim(), pickOpp?.id);
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
            setPickPerson(null);
            setPickCustomer(null);
            setPickMember(null);
            setPickOpp(null);
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

    const attachRow = useMemo(
        () =>
            row ?
                {
                    person_id: row.person_id,
                    customer_id: row.customer_id,
                    customer_member_id: row.customer_member_id,
                    opportunity_id: row.opportunity_id,
                }
            :   {
                    person_id: null,
                    customer_id: null,
                    customer_member_id: null,
                    opportunity_id: null,
                },
        [row]
    );

    const cleanOperationalizedLead = useMemo(() => {
        if (!row || row.status !== "submitted") return false;
        return isCleanOperationalizedEnrollmentLead({
            status: row.status,
            payloadMeta: row.payload?.meta,
            attachRow,
        });
    }, [row, attachRow]);

    const cleanCreatedLead = useMemo(() => {
        if (!row || row.status !== "submitted") return false;
        return isCleanCreatedEnrollmentLead({
            status: row.status,
            payloadMeta: row.payload?.meta,
            attachRow,
        });
    }, [row, attachRow]);

    const intakeNeedsAttention = useMemo(() => {
        if (cleanOperationalizedLead) return false;
        if (!intakeSection) return false;
        return intakeSection.statusLabel !== "Linked" || !intakeSection.hasServerIntakeRecord;
    }, [intakeSection, cleanOperationalizedLead]);

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
            attachRow,
        });
    }, [row, attachRow]);

    const linkageCalloutReasons = useMemo(() => {
        if (!row) return [];
        return buildLinkageReviewCalloutReasons(row.payload?.meta, attachRow, row.status);
    }, [row, attachRow]);

    const showLinkageWorkflowSection = useMemo(() => {
        if (!row || row.status !== "submitted") return false;
        if (cleanOperationalizedLead && !needsConfirmLinkage) return false;
        return linkageCalloutVisible || needsConfirmLinkage;
    }, [row, linkageCalloutVisible, needsConfirmLinkage, cleanOperationalizedLead]);

    const docGenBlocked = useMemo(() => {
        if (!row || row.status !== "submitted") return { blocked: false as const };
        return documentGenerationBlockedByIntake(row.payload?.meta, attachRow, row.status);
    }, [row, attachRow]);

    const documentOutcome = useMemo(() => {
        if (!row) return null;
        const blocked =
            row.status === "submitted" &&
            documentGenerationBlockedByIntake(row.payload?.meta, attachRow, row.status).blocked;
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
            attachRow,
        });
    }, [row, canMutate, attachRow]);

    const bosSubmissionContext = useMemo((): BosSubmissionReviewContext | null => {
        if (!row) return null;
        return {
            status: row.status,
            formTitle: schema?.title ?? "Form submission",
            linkageAttention: linkageCalloutVisible,
            linkageReasons: linkageCalloutReasons,
            intakeStatusLabel: intakeSection?.statusLabel ?? null,
            linkedDocumentsCount: row.linked_documents.length,
            recommendedActions: nextSteps,
        };
    }, [row, schema?.title, linkageCalloutVisible, linkageCalloutReasons, intakeSection?.statusLabel, nextSteps]);

    if (!formId || !submissionId) {
        return <p className="p-6 text-sm text-alloy-ember">Missing route params.</p>;
    }

    const mismatch = row && row.form_definition_id !== formId;

    return (
        <FormsWorkspaceShell
            title={cleanCreatedLead ? "Lead created" : "Intake review"}
            subtitle={
                cleanCreatedLead ?
                    "This inquiry created a new enrollment lead — continue in the opportunity queue."
                :   "Review answers, linkage, and outputs for this submission."
            }
            breadcrumbs={formsWorkspaceBreadcrumbs([
                {
                    label: schema?.title ?? "Form",
                    href: `${ADMIN_FORMS_UI_BASE}/${encodeURIComponent(formId)}`,
                },
                {
                    label: "Submissions",
                    href: `${ADMIN_FORMS_UI_BASE}/${encodeURIComponent(formId)}/submissions`,
                },
                { label: "Review" },
            ])}
            actions={
                <div className="flex flex-wrap gap-3">
                    <FormsOperationalLink
                        href={`${ADMIN_FORMS_UI_BASE}/${encodeURIComponent(formId)}/submissions`}
                    >
                        Intake inbox
                    </FormsOperationalLink>
                    <FormsOperationalLink href={`${ADMIN_FORMS_UI_BASE}/${encodeURIComponent(formId)}`}>
                        Form workspace
                    </FormsOperationalLink>
                </div>
            }
        >
            {loading ?
                <p className={opMetadata}>Loading…</p>
            : error ?
                <p className="text-sm text-alloy-ember">{error}</p>
            : mismatch ?
                <p className="text-sm text-alloy-ember">This submission does not belong to the form in the URL.</p>
            : row && lifecycle && documentOutcome ?
                <SubmissionIntakeCaseFileContent
                    row={row}
                    schema={schema}
                    viewerTimezone={viewerTz}
                    canMutate={canMutate}
                    lifecycle={lifecycle}
                    entityRows={entityRows}
                    intakeSection={intakeSection}
                    intakeNeedsAttention={intakeNeedsAttention}
                    intakeReviewedAt={intakeReviewedAt}
                    linkageCalloutVisible={linkageCalloutVisible}
                    linkageCalloutReasons={linkageCalloutReasons}
                    showLinkageWorkflowSection={showLinkageWorkflowSection}
                    cleanCreatedLead={cleanCreatedLead}
                    onOpenLead={
                        row.opportunity_id ?
                            () => handleOpenDrawer({ type: "opportunities", id: row.opportunity_id! })
                        :   undefined
                    }
                    needsConfirmLinkage={needsConfirmLinkage}
                    docGenBlocked={docGenBlocked}
                    documentOutcome={documentOutcome}
                    nextSteps={nextSteps}
                    bosSubmissionContext={bosSubmissionContext}
                    launchContext={launchContext}
                    hasLaunchContextDisplay={hasLaunchContextDisplay}
                    confirmBusy={confirmBusy}
                    confirmErr={confirmErr}
                    onConfirmLinkage={() => void confirmLinkage()}
                    manualBusy={manualBusy}
                    manualErr={manualErr}
                    onApplyManualLinks={() => void applyManualLinks()}
                    manualPerson={manualPerson}
                    onManualPersonChange={setManualPerson}
                    manualCustomer={manualCustomer}
                    onManualCustomerChange={setManualCustomer}
                    manualMember={manualMember}
                    onManualMemberChange={setManualMember}
                    manualOpp={manualOpp}
                    onManualOppChange={setManualOpp}
                    pickPerson={pickPerson}
                    onPickPerson={setPickPerson}
                    pickCustomer={pickCustomer}
                    onPickCustomer={setPickCustomer}
                    pickMember={pickMember}
                    onPickMember={setPickMember}
                    pickOpp={pickOpp}
                    onPickOpp={setPickOpp}
                    genBusy={genBusy}
                    genErr={genErr}
                    genMsg={genMsg}
                    onGenerateDocument={() => void generateDocument()}
                    onOpenDrawer={handleOpenDrawer}
                />
            : null}
        </FormsWorkspaceShell>
    );
}
