import { NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serverServiceClient";
import { validateFormPayload, type FormPayload } from "@/lib/forms/validateSubmission";
import { validateFormSchema, type FormSchemaV1 } from "@/lib/forms/schema";
import { filterPayloadValuesToSchemaFields } from "@/lib/forms/filterPayloadValuesToSchema";
import { normalizeSubmissionForSchema } from "@/lib/forms/submissionSemantics";
import { normalizeValidationErrors } from "@/lib/forms/validateSubmission";
import { ZodError } from "zod";
import { resolvePublicFormEmbedContext } from "@/lib/public/forms/resolvePublicFormEmbedContext";
import { verifySubmissionBelongsToPublicEmbed } from "@/lib/public/forms/publicEmbedSubmissionGuard";
import {
    advancePacketSessionAfterSubmit,
    syncPacketSessionCrmSnapshotFromSubmission,
} from "@/lib/forms/packets/formPacketService";
import { isEmbedOriginAllowed, requestEmbedOrigin } from "@/lib/public/forms/embedOrigin";
import { publicErr, publicOk } from "@/lib/public/forms/publicFormResponses";
import { hashClientIp } from "@/lib/public/forms/clientIpHash";
import { mergePublicSubmissionMeta } from "@/lib/public/forms/publicPayloadMeta";
import { linkRequiresLeadCapture } from "@/lib/public/forms/publicFormTypes";
import { buildFormIntakeMetaFromPayload } from "@/lib/forms/intake/buildFormIntakeMetaFromPayload";
import {
    buildLifecycleValidationBlockedMeta,
    validatePublicSubmissionLifecycleRequirements,
} from "@/lib/forms/lifecycle/validatePublicSubmissionLifecycleRequirements";
import { persistFormSubmissionSignatures } from "@/lib/forms/signatures/persistFormSubmissionSignatures";
import { persistSignedEnrollmentArtifact } from "@/lib/forms/pdf/persistSignedEnrollmentArtifact";
import {
    emitFormPacketCompletedSafe,
    emitFormSignedSafe,
    emitFormSubmittedSafe,
} from "@/lib/forms/workflow/formSubmissionEvents";
import { emitIntakeCaseLifecycleEventsSafe } from "@/lib/forms/workflow/intakeCaseLifecycleEvents";
import { maybeOpenProcessingCaseFromPacketCompletionSafe } from "@/lib/pos/processingCase/maybeOpenProcessingCaseFromPacketCompletionSafe";
import { ingestPublicFormThroughProcessing } from "@/lib/pos/processingIdentity/sources/formIntakeAdapter";
import type { FormIntakeMeta } from "@/lib/forms/intake/formLeadCaptureTypes";
import {
    emitOpportunityEnrollmentPacketCompletedProjectionSafe,
    emitOpportunityEnrollmentPacketOpenedSafe,
    emitOpportunityEnrollmentPacketStepCompletedSafe,
} from "@/lib/forms/workflow/opportunityEnrollmentPacketProjections";
import { applyReadOnlyBaselineToPayload } from "@/lib/forms/readOnlyFormPayload";
import { resolveFormDerivedValues } from "@/lib/forms/derived/resolveFormDerivedValues";
import { fetchOrgTimeZoneIana } from "@/lib/admin/orgLocalDayBounds";
import { realizeEnrollmentFeesForProcessInstance } from "@/lib/enrollment/financial/realizeEnrollmentFeesForProcessInstance";
import {
    extractCollectionSubmissionEnvelope,
    validateCollectionPayloadOrgSecurity,
} from "@/lib/forms/collection/formsCollectionSubmissionValidation";
import { takeTourPublicRateLimit } from "@/lib/tours/public/tourPublicRateLimit";
import { findOfferedTourSlot, resolvePublicTourCalendar } from "@/lib/tours/publicCalendar/publicTourCalendarServer";
import {
    buildRequestedTourRecord,
    parsePublicTourSelection,
    type RequestedTourRecord,
} from "@/lib/tours/publicCalendar/requestedTour";
import { publicLinkOffersMarketingConsent } from "@/lib/tours/publicCalendar/tourCalendarLinkConfig";
import {
    buildIntakeMarketingConsentRecord,
    parsePublicMarketingConsentChoice,
    type IntakeMarketingConsentRecord,
    withoutCompetingMarketingConsentFields,
} from "@/lib/communications/preferences/intakeMarketingConsentRecord";

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function plaintextToken(raw: string): string {
    try {
        return decodeURIComponent(raw);
    } catch {
        return raw;
    }
}

/** POST /api/public/forms/[token]/submissions/[submissionId]/submit */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ token: string; submissionId: string }> }
) {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return publicErr("Server misconfiguration", 500);
    }

    const { token: rawToken, submissionId } = await params;
    if (!submissionId || !UUID_RE.test(submissionId)) return publicErr("Invalid submission id", 400);

    const token = plaintextToken(rawToken ?? "");
    if (!token.trim()) return publicErr("Missing token", 400);

    const supabase = createServiceRoleClient();
    const resolved = await resolvePublicFormEmbedContext(supabase, token);
    if (!resolved.ok) {
        const codeMap = { NOT_FOUND: 404, INACTIVE: 403, EXPIRED: 403, NO_PUBLISHED_VERSION: 409 };
        return publicErr(resolved.error.message, codeMap[resolved.error.code] ?? 400, { code: resolved.error.code });
    }

    const ctx = resolved.value;
    const origin = requestEmbedOrigin(request);
    if (!isEmbedOriginAllowed(origin, ctx.allowedEmbedOrigins)) {
        return publicErr("Origin not allowed for this form embed", 403, { code: "ORIGIN_FORBIDDEN" });
    }

    if (ctx.packetTerminal) {
        return publicErr("Packet already completed", 409, { code: "PACKET_COMPLETE" });
    }

    if (ctx.schemaJson == null) {
        return publicErr("No form schema available", 409);
    }

    let body: Record<string, unknown> = {};
    try {
        const parsed = await request.json();
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) body = parsed as Record<string, unknown>;
    } catch {
        /* empty body */
    }

    const optionValuesRaw = body.option_values_by_field_id;
    const optionValuesByFieldId =
        optionValuesRaw &&
        typeof optionValuesRaw === "object" &&
        !Array.isArray(optionValuesRaw) &&
        optionValuesRaw !== null
            ? Object.fromEntries(
                  Object.entries(optionValuesRaw as Record<string, unknown>).map(([k, v]) => [
                      k,
                      Array.isArray(v) ? v.map(String) : [],
                  ])
              )
            : undefined;

    const gate = await verifySubmissionBelongsToPublicEmbed(supabase, ctx, submissionId);
    if (!gate.ok) return publicErr(gate.message, gate.status);

    const existing = gate.row;
    const sub = existing as {
        status: string;
        created_via_public_link_id: string | null;
        form_definition_version_id: string;
        payload: Record<string, unknown>;
        person_id: string | null;
        customer_id: string | null;
        customer_member_id: string | null;
        opportunity_id: string | null;
    };

    if (sub.status !== "draft") {
        return publicErr("Only draft submissions can be submitted", 409, { code: "NOT_DRAFT" });
    }

    /*
     * S7 — A REQUESTED TOUR. A time picked on the school's public tour calendar rides with the lead
     * form as pending intent on the Processing case. The browser sends two instants and nothing
     * else: org and location come from THIS link, the slot must be one the canonical slot engine
     * offers right now, and a refusal happens before anything is written — the draft stays a draft,
     * so the family can pick another time without losing their answers. Nothing here books a seat
     * or sends a message: acceptance is the administrator's Approve.
     */
    let requestedTour: RequestedTourRecord | null = null;
    if (body.requested_tour !== undefined && body.requested_tour !== null) {
        const retryAfter = takeTourPublicRateLimit(request, "calendar_request", token);
        if (retryAfter != null) {
            return publicErr("Too many requests", 429, { code: "RATE_LIMIT" });
        }
        const selection = parsePublicTourSelection(body.requested_tour);
        if (!selection.ok) return publicErr(selection.message, 400, { code: "TOUR_REQUEST_INVALID" });
        if (ctx.packet) {
            return publicErr("This form can't take a tour request.", 400, { code: "TOUR_REQUEST_NOT_ACCEPTED" });
        }
        const calendar = await resolvePublicTourCalendar(supabase, token, { embedOrigin: origin });
        if (!calendar.ok || calendar.value.linkId !== ctx.linkId) {
            return publicErr("This form can't take a tour request.", 400, { code: "TOUR_REQUEST_NOT_ACCEPTED" });
        }
        let offered: Awaited<ReturnType<typeof findOfferedTourSlot>> = null;
        try {
            offered = await findOfferedTourSlot(supabase, {
                orgId: calendar.value.orgId,
                locationId: calendar.value.locationId,
                startAt: selection.value.startAt,
                endAt: selection.value.endAt,
            });
        } catch {
            return publicErr("We couldn't check that time just now. Please try again.", 503, { code: "TOUR_CHECK_UNAVAILABLE" });
        }
        if (!offered) {
            return publicErr("That time is no longer available. Please choose another time.", 409, {
                code: "TOUR_SLOT_UNAVAILABLE",
            });
        }
        requestedTour = buildRequestedTourRecord({
            locationId: calendar.value.locationId,
            startAt: selection.value.startAt,
            endAt: selection.value.endAt,
            timezone: offered.timezone,
            ruleId: offered.ruleId ?? null,
            formPublicLinkId: ctx.linkId,
            formSubmissionId: submissionId,
        });
    }

    /*
     * S7 × C1 — OPTIONAL MARKETING CONSENT. Only a link that offers the control can carry an answer
     * (decided by the link, never the body). The answer is evidence on the Processing case, not a
     * preference: Approve commits it for the resolved person through Communications. An unchecked
     * or missing answer is recorded as "no" — submitting the form is never consent.
     */
    let marketingConsent: IntakeMarketingConsentRecord | null = null;
    {
        const parsed = parsePublicMarketingConsentChoice(body.marketing_consent);
        if (!parsed.ok) return publicErr(parsed.message, 400, { code: "MARKETING_CONSENT_INVALID" });
        const offered = publicLinkOffersMarketingConsent(ctx.linkMetadata, { packet: Boolean(ctx.packet) });
        if (parsed.value && !offered) {
            return publicErr("This form can't take a consent answer.", 400, { code: "MARKETING_CONSENT_NOT_ACCEPTED" });
        }
        if (offered) {
            marketingConsent = buildIntakeMarketingConsentRecord({
                choice: parsed.value,
                formPublicLinkId: ctx.linkId,
                formSubmissionId: submissionId,
            });
        }
    }

    const { data: ver } = await supabase
        .from("form_definition_versions")
        .select("schema_json, metadata")
        .eq("id", ctx.formDefinitionVersionId)
        .maybeSingle();
    const versionRow = ver as { schema_json?: unknown; metadata?: unknown } | null;
    const schemaJson = versionRow?.schema_json ?? ctx.schemaJson;

    let schema: FormSchemaV1;
    try {
        schema = validateFormSchema(schemaJson);
    } catch (e) {
        if (e instanceof ZodError) {
            return publicErr("Invalid published schema", 500, { validation_errors: normalizeValidationErrors(e) });
        }
        throw e;
    }
    // Where this link offers the marketing-consent control, it is the one consent answer: the form's own
    // "Email opt-in" / "SMS opt-in" person fields are not shown, not required and not stored (P1-close, D5).
    const competingConsentFieldIds = new Set<string>();
    if (marketingConsent) {
        const before = new Set(collectFieldIds(schema.fields));
        schema = withoutCompetingMarketingConsentFields(schema);
        const after = new Set(collectFieldIds(schema.fields));
        for (const id of before) if (!after.has(id)) competingConsentFieldIds.add(id);
    }

    let payloadToValidate: Record<string, unknown> =
        body.payload !== undefined && typeof body.payload === "object" && !Array.isArray(body.payload)
            ? (body.payload as Record<string, unknown>)
            : (sub.payload as Record<string, unknown>);

    if (competingConsentFieldIds.size) {
        const values = { ...((payloadToValidate.values ?? {}) as Record<string, unknown>) };
        for (const id of competingConsentFieldIds) delete values[id];
        payloadToValidate = { ...payloadToValidate, values };
    }

    if (ctx.packet) {
        payloadToValidate = {
            ...payloadToValidate,
            values: filterPayloadValuesToSchemaFields(schema, (payloadToValidate.values ?? {}) as Record<string, unknown>),
        };
    }

    /*
     * The authored semantics both participant runtimes share: a group's answers are its rows, and a
     * hidden question has no answer. Applied before derived values and validation so the generic
     * form and the Enrollment conversation are judged by exactly the same rules.
     */
    payloadToValidate = normalizeSubmissionForSchema(schema, payloadToValidate as Parameters<typeof normalizeSubmissionForSchema>[1]);

    /*
     * Derived destinations are filled HERE — before validation, because this is the moment the
     * source means.
     *
     * "Today's Date" beside a signature is the day the family signed, and that instant does not
     * exist until now. Filling it after validation would reject the submission for a blank the
     * platform was about to write itself; filling it earlier would stamp the wrong day. The
     * organisation's own zone decides which calendar day this is — a 9pm Pacific signature is not
     * tomorrow.
     */
    const derivedValues = resolveFormDerivedValues(
        schema,
        (payloadToValidate.values ?? {}) as Record<string, unknown>,
        {
            executedAtIso: new Date().toISOString(),
            timeZone: await fetchOrgTimeZoneIana(supabase, ctx.orgId),
            // A signature date is the date of THAT signature — so whether it applies depends on
            // whether the participant actually made it.
            signatures: (payloadToValidate.signatures ?? null) as Record<string, unknown> | null,
        },
    );
    if (Object.keys(derivedValues).length > 0) {
        payloadToValidate = {
            ...payloadToValidate,
            values: { ...((payloadToValidate.values ?? {}) as Record<string, unknown>), ...derivedValues },
        };
    }

    const validated = validateFormPayload({
        schemaJson,
        payload: payloadToValidate,
        mode: "submit",
        optionValuesByFieldId,
    });
    if (!validated.ok) {
        return publicErr("Invalid submission payload", 400, { validation_errors: validated.errors });
    }

    const collectionSecurityErrors = await validateCollectionPayloadOrgSecurity(
        supabase,
        ctx.orgId,
        validated.schema,
        validated.payload,
        { customer_id: sub.customer_id },
    );
    if (collectionSecurityErrors.length > 0) {
        return publicErr("Invalid collection item reference", 403, { validation_errors: collectionSecurityErrors });
    }

    const guardedValues = applyReadOnlyBaselineToPayload(validated.schema, validated.payload, sub.payload as FormPayload);

    const ipHash = hashClientIp(request);
    let finalPayload: FormPayload = {
        ...guardedValues,
        meta: mergePublicSubmissionMeta(guardedValues.meta as Record<string, unknown> | undefined, ipHash),
    };

    const collectionEnvelope = extractCollectionSubmissionEnvelope(finalPayload);
    if (Object.keys(collectionEnvelope).length > 0) {
        finalPayload = {
            ...finalPayload,
            meta: {
                ...((finalPayload.meta ?? {}) as Record<string, unknown>),
                collection_submission_envelope: collectionEnvelope,
            },
        };
    }

    const personId = sub.person_id;
    const customerId = sub.customer_id;
    const customerMemberId = sub.customer_member_id;
    const opportunityId = sub.opportunity_id;
    let processingCaseId: string | null = null;
    let formIntakeMeta: FormIntakeMeta | null = null;

    const metaRecord = ctx.linkMetadata as Record<string, unknown> | undefined;
    const launchMode = typeof metaRecord?.form_context_mode === "string" ? metaRecord.form_context_mode.trim() : "";
    const isExplicitEntityLaunch =
        launchMode === "existing_record" ||
        (launchMode === "packet" &&
            typeof metaRecord?.source_entity_type === "string" &&
            typeof metaRecord?.source_entity_id === "string");

    if (linkRequiresLeadCapture(metaRecord)) {
        const built = buildFormIntakeMetaFromPayload({
            values: finalPayload.values as Record<string, unknown>,
            linkMetadata: metaRecord,
            submissionId,
            // Structured collection responses are the PREFERRED intake source: when a form projects
            // guardians into a collection its flat guardian questions are suppressed, so flat-only
            // resolution would find nothing and silently open no case.
            collectionEnvelope: collectionEnvelope as never,
            schema,
        });

        if (!built.ok && requestedTour) {
            // No Processing case could be opened, so there is nowhere to hold the request.
            return publicErr("This form can't take a tour request.", 400, { code: "TOUR_REQUEST_NOT_ACCEPTED" });
        }
        if (!built.ok) {
            finalPayload = {
                ...finalPayload,
                meta: {
                    ...((finalPayload.meta ?? {}) as Record<string, unknown>),
                    intake_resolution_path: "skipped_missing_config",
                    intake_skip_reason: built.reason,
                },
            };
        } else {
            finalPayload = {
                ...finalPayload,
                meta: {
                    ...((finalPayload.meta ?? {}) as Record<string, unknown>),
                    intake: built.intake,
                },
            };

            const lifecycleValidation = await validatePublicSubmissionLifecycleRequirements(supabase, {
                orgId: ctx.orgId,
                formDefinitionId: ctx.formDefinitionId,
                schemaJson,
                linkMetadata: metaRecord,
                submittedValues: (finalPayload.values ?? {}) as Record<string, unknown>,
            });

            if (!lifecycleValidation.ok) {
                const blockedMeta = buildLifecycleValidationBlockedMeta({
                    usage: lifecycleValidation.usage,
                    missingRequiredLabels: lifecycleValidation.missingRequiredLabels,
                    missingRequiredFieldKeys: lifecycleValidation.missingRequiredFieldKeys,
                });
                finalPayload = {
                    ...finalPayload,
                    meta: {
                        ...((finalPayload.meta ?? {}) as Record<string, unknown>),
                        ...blockedMeta,
                    },
                };
                await supabase
                    .from("form_submissions")
                    .update({ payload: finalPayload as unknown as Record<string, unknown> })
                    .eq("id", submissionId)
                    .eq("org_id", ctx.orgId)
                    .eq("created_via_public_link_id", ctx.linkId)
                    .eq("status", "draft");
                return publicErr(lifecycleValidation.publicMessage, 400, {
                    code: "LIFECYCLE_VALIDATION_BLOCKED",
                    missing_fields: lifecycleValidation.missingRequiredLabels,
                });
            }

            try {
                // D5: Processing is authoritative — no direct CRM identity writes from public submit.
                const intake = await ingestPublicFormThroughProcessing(supabase, {
                    orgId: ctx.orgId,
                    submissionId,
                    formDefinitionId: ctx.formDefinitionId,
                    intakeMeta: built.intake,
                    payload: finalPayload,
                    linkMetadata: metaRecord,
                    requestedTour,
                    marketingConsent,
                });
                if (!intake.ok) {
                    throw new Error(intake.error);
                }
                processingCaseId = intake.processingCaseId;
                formIntakeMeta = built.intake;
                finalPayload = {
                    ...finalPayload,
                    meta: {
                        ...((finalPayload.meta ?? {}) as Record<string, unknown>),
                        intake_resolution_path: "processing_authoritative",
                        processing_case_id: intake.processingCaseId,
                        intake_needs_review: true,
                    },
                };
            } catch (e) {
                if (requestedTour || marketingConsent?.choices.email || marketingConsent?.choices.sms) {
                    // Never tell a family "request received" for a request — or a consent — Processing does not hold.
                    return publicErr("We couldn't record your request just now. Please try again.", 503, {
                        code: requestedTour ? "TOUR_REQUEST_NOT_RECORDED" : "MARKETING_CONSENT_NOT_RECORDED",
                    });
                }
                const msg = e instanceof Error ? e.message : "Intake failed";
                const cleanedMeta = { ...((finalPayload.meta ?? {}) as Record<string, unknown>) };
                delete cleanedMeta.intake;
                delete cleanedMeta.intake_match_strategy;
                delete cleanedMeta.intake_match_confidence;
                delete cleanedMeta.intake_needs_review;
                delete cleanedMeta.intake_review_reason;
                delete cleanedMeta.intake_candidate_email_count;
                delete cleanedMeta.intake_candidate_phone_count;
                cleanedMeta.intake_resolution_path = "skipped_error";
                cleanedMeta.intake_error = msg.slice(0, 500);
                delete cleanedMeta.intake_skip_reason;
                finalPayload = { ...finalPayload, meta: cleanedMeta };
            }
        }
    } else if (!isExplicitEntityLaunch) {
        finalPayload = {
            ...finalPayload,
            meta: {
                ...((finalPayload.meta ?? {}) as Record<string, unknown>),
                intake_resolution_path: "skipped_intake_disabled",
                intake_skip_reason:
                    "This public link does not have lead_capture / intake enabled on its metadata — CRM intake did not run.",
            },
        };
    } else {
        finalPayload = {
            ...finalPayload,
            meta: {
                ...((finalPayload.meta ?? {}) as Record<string, unknown>),
                intake_resolution_path: "existing_record_launch",
                intake_match_strategy: "launch_context",
                intake_match_confidence: "explicit",
                intake_needs_review: false,
                ...(opportunityId ? { intake_opportunity_match: "attached_existing" as const } : {}),
            },
        };
    }

    const { data: updated, error: upErr } = await supabase
        .from("form_submissions")
        .update({
            status: "submitted",
            payload: finalPayload as unknown as Record<string, unknown>,
            submitted_at: new Date().toISOString(),
            submitted_by_user_id: null,
            person_id: personId,
            customer_id: customerId,
            customer_member_id: customerMemberId,
            opportunity_id: opportunityId,
        })
        .eq("id", submissionId)
        .eq("org_id", ctx.orgId)
        .eq("created_via_public_link_id", ctx.linkId)
        .eq("status", "draft")
        .select("*")
        .single();

    if (upErr) {
        if (upErr.code === "PGRST116") {
            return publicErr("Submission could not be finalized (conflict or not draft)", 409);
        }
        if (upErr.message?.includes("form_submissions:")) {
            return publicErr(upErr.message, 409);
        }
        return publicErr(upErr.message, 400);
    }

    if (ctx.packet) {
        const snapRes = await syncPacketSessionCrmSnapshotFromSubmission(supabase, ctx.orgId, ctx.packet.packet_session_id, {
            person_id: personId,
            customer_id: customerId,
            customer_member_id: customerMemberId,
            opportunity_id: opportunityId,
        });
        if (snapRes.error) {
            console.error("[public submit] packet crm_snapshot sync failed:", snapRes.error.message);
        }
    }

    if (ctx.packet) {
        const oOpen = await emitOpportunityEnrollmentPacketOpenedSafe({
            orgId: ctx.orgId,
            packetSessionId: ctx.packet.packet_session_id,
        });
        if (oOpen.error) {
            console.error("[public submit] enrollment opened projection failed:", oOpen.error.message);
        }
    }

    const submittedRow = updated as Record<string, unknown>;
    const meta = finalPayload.meta as Record<string, unknown> | undefined;
    const signerIpHash =
        typeof meta?.client_ip_hash === "string" && meta.client_ip_hash.trim() ? meta.client_ip_hash.trim() : ipHash;

    // The adult this link was sent to — the CONTEXT a signer is recorded against, never the signer.
    const recipientPersonId =
        typeof metaRecord?.recipient_person_id === "string" && metaRecord.recipient_person_id.trim() ? metaRecord.recipient_person_id.trim() : null;
    let recipientName: string | null = null;
    if (recipientPersonId) {
        const { data: recipient } = await supabase
            .from("persons")
            .select("first_name, last_name")
            .eq("org_id", ctx.orgId)
            .eq("id", recipientPersonId)
            .maybeSingle();
        const r = recipient as { first_name?: string | null; last_name?: string | null } | null;
        recipientName = [r?.first_name, r?.last_name].filter((x) => typeof x === "string" && x.trim()).join(" ") || null;
    }
    const sigRes = await persistFormSubmissionSignatures(supabase, {
        orgId: ctx.orgId,
        formSubmissionId: submissionId,
        schema: validated.schema,
        payload: finalPayload,
        signerIpHash,
        channel: {
            kind: "public_link",
            linkId: ctx.linkId,
            packetSessionId: ctx.packet?.packet_session_id ?? null,
            recipientPersonId,
            recipientName,
        },
    });
    if ("error" in sigRes) {
        return publicErr(sigRes.error, 500, { code: "SIGNATURE_PERSIST" });
    }

    await emitFormSubmittedSafe(submittedRow as Parameters<typeof emitFormSubmittedSafe>[0]);
    if (sigRes.inserted > 0) {
        await emitFormSignedSafe(submittedRow as Parameters<typeof emitFormSignedSafe>[0]);
    }

    // D5: Processing case is opened during authoritative intake above; no shadow dual-path.
    void formIntakeMeta;
    void processingCaseId;

    if (linkRequiresLeadCapture(metaRecord)) {
        await emitIntakeCaseLifecycleEventsSafe({
            submission: submittedRow as Parameters<typeof emitFormSubmittedSafe>[0],
            payloadMeta: finalPayload.meta as Record<string, unknown> | undefined,
            linkMetadata: metaRecord,
            packetSessionId: ctx.packet?.packet_session_id ?? null,
        });
    }

    let packetStepSequenceIndex = 0;
    if (ctx.packet) {
        const { data: piRow } = await supabase
            .from("form_packet_session_items")
            .select("sequence_index")
            .eq("form_submission_id", submissionId)
            .eq("org_id", ctx.orgId)
            .maybeSingle();
        if (typeof (piRow as { sequence_index?: number } | null)?.sequence_index === "number") {
            packetStepSequenceIndex = (piRow as { sequence_index: number }).sequence_index;
        }
    }

    const adv = await advancePacketSessionAfterSubmit(
        supabase,
        ctx.orgId,
        submissionId,
        (finalPayload.values ?? {}) as Record<string, unknown>,
        // Which artifact these values are FROM. Without it a field id is a position, not a fact.
        { schema: validated.schema, formDefinitionId: ctx.formDefinitionId }
    );
    if (adv.error) {
        console.error("[public submit] packet advance failed:", adv.error.message);
    }

    /**
     * The COMPLETED COPY — original document, filled with the submitted values, signed, flattened,
     * stored against the child's record. Presentation of a fact that already happened: the
     * canonical submission above is the satisfaction authority, so a failure here is logged and
     * never fails the participant's submit; the operator generate path can rebuild it by the same
     * idempotency key.
     */
    try {
        const artifact = await persistSignedEnrollmentArtifact(supabase, {
            orgId: ctx.orgId,
            submissionId,
            nowIso: new Date().toISOString(),
        });
        if (!artifact.ok) {
            console.error("[public submit] signed artifact persistence failed:", artifact.error);
        }
    } catch (e) {
        console.error("[public submit] signed artifact persistence threw:", e);
    }

    if (ctx.packet && adv.result) {
        const st = await emitOpportunityEnrollmentPacketStepCompletedSafe({
            orgId: ctx.orgId,
            packetSessionId: ctx.packet.packet_session_id,
            formSubmissionId: submissionId,
            sequenceIndex: packetStepSequenceIndex,
        });
        if (st.error) {
            console.error("[public submit] enrollment step_completed projection failed:", st.error.message);
        }
    }

    if (adv.result?.packet_complete === true && ctx.packet) {
        const [pe, oDone] = await Promise.all([
            emitFormPacketCompletedSafe(ctx.orgId, ctx.packet.packet_session_id),
            emitOpportunityEnrollmentPacketCompletedProjectionSafe({
                orgId: ctx.orgId,
                packetSessionId: ctx.packet.packet_session_id,
            }),
        ]);
        if (pe.error) {
            console.error("[public submit] form_packet_completed emit failed:", pe.error.message);
        }
        if (oDone.error) {
            console.error("[public submit] enrollment completed projection failed:", oDone.error.message);
        }

        // POS-FP1b: best-effort, marker-gated. POS-connected packet completion opens one
        // Processing Case (packet session as primary source). Legacy packets unaffected. Never throws.
        await maybeOpenProcessingCaseFromPacketCompletionSafe(supabase, {
            orgId: ctx.orgId,
            packetSessionId: ctx.packet.packet_session_id,
        });

        /*
         * THE CHILD'S PAPERWORK IS DONE: its per-child Enrollment fee becomes a charge now, dated by
         * this completion. Idempotent and best-effort — a failure is logged, never a failed submit,
         * and a retry of the same completion resolves to the same charge.
         */
        try {
            const { data: sessionRow } = await supabase
                .from("form_packet_sessions")
                .select("process_instance_id")
                .eq("org_id", ctx.orgId)
                .eq("id", ctx.packet.packet_session_id)
                .maybeSingle();
            const processInstanceId = (sessionRow as { process_instance_id?: string | null } | null)?.process_instance_id ?? null;
            if (processInstanceId) {
                const fee = await realizeEnrollmentFeesForProcessInstance(supabase, { orgId: ctx.orgId, processInstanceId });
                if (fee.status === "realized") {
                    for (const r of fee.requirements) {
                        if (!r.result.templateResolved) {
                            console.error("[public submit] enrollment fee template not found:", r.chargeTemplateKey);
                        }
                    }
                }
            }
        } catch (e) {
            console.error("[public submit] enrollment fee realization failed:", e instanceof Error ? e.message : String(e));
        }
    }

    const packetExtras: Record<string, unknown> = {};
    if (adv.result) {
        packetExtras.packet_complete = adv.result.packet_complete;
        packetExtras.next_form_available = adv.result.next_form_available;
    }

    const { org_id: _o, ...rest } = submittedRow;
    void _o;
    return publicOk({
        ...rest,
        ...packetExtras,
        // Received, not booked: the family's screen says exactly this.
        ...(requestedTour ? { tour_request: { state: requestedTour.state } } : {}),
    });
}

function collectFieldIds(fields: { id: string; fields?: unknown }[]): string[] {
    return fields.flatMap((f) => [f.id, ...(Array.isArray(f.fields) ? collectFieldIds(f.fields as { id: string; fields?: unknown }[]) : [])]);
}
