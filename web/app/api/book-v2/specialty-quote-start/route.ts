import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { normalizeEmail, normalizePhone } from "@/lib/contactNormalize";
import { emitEvent } from "@/lib/emitEvent";
import { createServiceRoleClient } from "@/lib/supabase/serverServiceClient";
import type { SquareFootageOption } from "@/lib/pricing/cleaningPricing";
import {
  type FieldDefMeta,
  getFieldDefinitionMeta,
  upsertTypedFieldValue,
} from "@/lib/bookV2/fieldValueUpsert";
import { findOrCreatePersonInOrg } from "@/lib/persons/findOrCreatePersonInOrg";
import { LEGACY_QUOTE_STARTED_PIPELINE_STAGE_ID } from "@/lib/book-v2/bookingConstants";
import { resolvePipelineStageIdByOrgKey, pipelineStageEnvFallback } from "@/lib/book-v2/resolvePipelineStage";
import {
  loadSqftTiersForVertical,
  normalizeSqftKeyInput,
  resolveSquareFootageStorageString,
} from "@/lib/book-v2/loadCleaningPricingCatalog";
import {
  createQuoteLocation,
  quoteLocationLabel,
  quoteStartNativeLocationPatch,
  upsertPersonLocationForQuote,
} from "@/lib/book-v2/quoteStartLocationHelpers";
import {
  MAX_SPECIALTY_QUOTE_PHOTO_BYTES,
  SPECIALTY_QUOTE_PHOTO_DOC_TYPE,
  SPECIALTY_QUOTE_PHOTO_FORM_KEYS,
  SPECIALTY_QUOTE_PHOTO_SEMANTIC_SLOT_BY_FORM_KEY,
  SPECIALTY_QUOTE_PHOTO_SLOT_METADATA_KEY,
  type SpecialtyQuotePhotoFormKey,
} from "@/lib/book-v2/specialtyQuotePhotos";
import { ORG_DOCUMENTS_STORAGE_BUCKET } from "@/lib/storage/orgDocumentsBucket";

const SPECIALTY_SOURCE = "specialty_web_quote";

type SpecialtyBody = {
  cleaning_type?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  zip?: string;
  square_footage?: string | number;
  street_address?: string;
  city?: string;
  state?: string;
  preferred_service_date?: string;
  home_type?: string;
  bedrooms?: string;
  bathrooms?: string;
  notes?: string;
  sms_consent?: boolean;
  email_consent?: boolean;
  quote_context?: Record<string, unknown>;
};

async function parseSpecialtyRequest(
  request: NextRequest
): Promise<
  | { ok: true; body: SpecialtyBody; photoFiles: Partial<Record<SpecialtyQuotePhotoFormKey, File>> }
  | { ok: false; response: NextResponse }
> {
  const ct = request.headers.get("content-type") || "";
  if (ct.includes("multipart/form-data")) {
    let fd: FormData;
    try {
      fd = await request.formData();
    } catch {
      return {
        ok: false,
        response: NextResponse.json({ ok: false, message: "Invalid multipart form data" }, { status: 400 }),
      };
    }
    const payload = fd.get("payload");
    if (typeof payload !== "string") {
      return {
        ok: false,
        response: NextResponse.json({ ok: false, message: "Missing form field payload (JSON)" }, { status: 400 }),
      };
    }
    let body: SpecialtyBody;
    try {
      body = JSON.parse(payload) as SpecialtyBody;
    } catch {
      return {
        ok: false,
        response: NextResponse.json({ ok: false, message: "Invalid JSON in payload" }, { status: 400 }),
      };
    }
    const photoFiles: Partial<Record<SpecialtyQuotePhotoFormKey, File>> = {};
    for (const key of SPECIALTY_QUOTE_PHOTO_FORM_KEYS) {
      const v = fd.get(key);
      if (v instanceof File && v.size > 0) {
        photoFiles[key] = v;
      }
    }
    return { ok: true, body, photoFiles };
  }
  const body = (await request.json()) as SpecialtyBody;
  return { ok: true, body, photoFiles: {} };
}

/**
 * POST /api/book-v2/specialty-quote-start
 * Move-out / heavy clean: person + location + opportunity with metadata only (no standard pricing RPC).
 */
export async function POST(request: NextRequest) {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY environment variable is not set");
    }

    const parsed = await parseSpecialtyRequest(request);
    if (!parsed.ok) return parsed.response;
    const { body, photoFiles } = parsed;

    const cleaningType = String(body.cleaning_type ?? "").trim();
    if (cleaningType !== "move_out" && cleaningType !== "heavy_clean") {
      return NextResponse.json(
        { ok: false, message: "cleaning_type must be move_out or heavy_clean" },
        { status: 400 }
      );
    }

    const email = body.email != null ? normalizeEmail(body.email) : null;
    const phone = body.phone != null ? normalizePhone(body.phone) : null;
    if (!email && !phone) {
      return NextResponse.json(
        { ok: false, message: "At least one of email or phone is required" },
        { status: 400 }
      );
    }

    const first_name = body.first_name?.trim() || null;
    const last_name = body.last_name?.trim() || null;
    const zip = body.zip?.trim() || null;
    if (!zip) {
      return NextResponse.json({ ok: false, message: "ZIP code is required" }, { status: 400 });
    }

    const square_footage_raw = body.square_footage;
    if (square_footage_raw == null || String(square_footage_raw).trim() === "") {
      return NextResponse.json(
        { ok: false, message: "Approximate square footage is required" },
        { status: 400 }
      );
    }

    const street = body.street_address?.trim() || null;
    const city = body.city?.trim() || null;
    const preferred_service_date = body.preferred_service_date?.trim() || null;
    const home_type = body.home_type?.trim() || null;
    const bedrooms = body.bedrooms?.trim() || null;
    const bathrooms = body.bathrooms?.trim() || null;

    if (!street || !city) {
      return NextResponse.json(
        { ok: false, message: "Street address and city are required" },
        { status: 400 }
      );
    }
    if (!preferred_service_date) {
      return NextResponse.json(
        { ok: false, message: "Preferred service date is required" },
        { status: 400 }
      );
    }
    if (!home_type) {
      return NextResponse.json({ ok: false, message: "Home type is required" }, { status: 400 });
    }
    if (!bedrooms || !bathrooms) {
      return NextResponse.json(
        { ok: false, message: "Bedrooms and bathrooms are required" },
        { status: 400 }
      );
    }

    for (const key of SPECIALTY_QUOTE_PHOTO_FORM_KEYS) {
      const f = photoFiles[key];
      if (!f) {
        return NextResponse.json(
          {
            ok: false,
            message:
              "Please upload all four photos: living room, kitchen, master bedroom, and master bathroom.",
          },
          { status: 400 }
        );
      }
      if (f.size > MAX_SPECIALTY_QUOTE_PHOTO_BYTES) {
        return NextResponse.json(
          { ok: false, message: "Each photo must be 10MB or smaller." },
          { status: 400 }
        );
      }
      const mime = f.type || "";
      if (!mime.startsWith("image/")) {
        return NextResponse.json(
          { ok: false, message: "Photos must be image files (JPEG, PNG, or WebP)." },
          { status: 400 }
        );
      }
    }

    const supabase = createServiceRoleClient();
    const publicOrgId = process.env.ALLOY_PUBLIC_ORG_ID ?? null;
    const orgIdForWrites = publicOrgId;
    if (!orgIdForWrites) {
      return NextResponse.json({ ok: false, message: "Server configuration error (org)" }, { status: 500 });
    }

    const personId = await findOrCreatePersonInOrg(supabase, {
      email: email || null,
      phone: phone || null,
      first_name,
      last_name,
      org_id: publicOrgId,
    });
    if (!personId) {
      return NextResponse.json(
        { ok: false, message: "Unable to create or find lead record. Please try again." },
        { status: 400 }
      );
    }

    const { data: vert } = await supabase
      .from("verticals")
      .select("id")
      .eq("slug", "cleaning")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    const verticalId = vert?.id ?? null;
    if (!verticalId) {
      return NextResponse.json({ ok: false, message: "Cleaning vertical not found" }, { status: 500 });
    }

    const sqftTierRows = await loadSqftTiersForVertical(supabase, verticalId);
    const squareFootageOption = normalizeSqftKeyInput(square_footage_raw, sqftTierRows) as SquareFootageOption;
    const squareFootageStored = resolveSquareFootageStorageString(
      square_footage_raw,
      squareFootageOption,
      sqftTierRows
    );

    const quoteStartedStageId =
      (await resolvePipelineStageIdByOrgKey(supabase, orgIdForWrites, "quote_started")) ??
      pipelineStageEnvFallback("quote_started") ??
      LEGACY_QUOTE_STARTED_PIPELINE_STAGE_ID;

    const [opportunityFreqDef, personSmsConsentDef, personEmailConsentDef] = await Promise.all([
      getFieldDefinitionMeta(supabase, orgIdForWrites, "opportunity", "cleaning_frequency"),
      body.sms_consent
        ? getFieldDefinitionMeta(supabase, orgIdForWrites, "person", "sms_consent")
        : Promise.resolve(null as FieldDefMeta | null),
      body.email_consent
        ? getFieldDefinitionMeta(supabase, orgIdForWrites, "person", "email_consent")
        : Promise.resolve(null as FieldDefMeta | null),
    ]);

    if (!opportunityFreqDef) {
      return NextResponse.json(
        {
          ok: false,
          message: "Server misconfiguration: opportunity field cleaning_frequency is not defined for this org",
        },
        { status: 500 }
      );
    }

    const quote_started_at = new Date().toISOString();
    const state = body.state?.trim() || null;
    const notes = body.notes?.trim() || null;

    const quote_input: Record<string, unknown> = {
      zip,
      square_footage: squareFootageStored,
      cleaning_type: cleaningType,
      cleaning_frequency: "one_time",
      cleaning_frequency_key: null,
      street_address: street,
      city,
      state,
      preferred_service_date,
      home_type,
      bedrooms,
      bathrooms,
      notes,
      specialty_quote_notes: notes,
      specialty_request: true,
      ...body.quote_context,
    };

    const quote_output = {
      is_manual_quote: true,
      estimated_price: null,
      first_clean_price: null,
      recurring_price: null,
      frequency_label: null,
      discount_label: null,
      price_breakdown: "Specialty cleaning — our team will prepare a custom estimate.",
    };

    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: existingOpp } = await supabase
      .from("opportunities")
      .select("id, metadata, location_id")
      .eq("primary_person_id", personId)
      .gte("created_at", tenMinutesAgo)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const existingOppRow = existingOpp as
      | { id: string; metadata?: Record<string, unknown> | null; location_id?: string | null }
      | null
      | undefined;
    const shouldReuse =
      !!existingOppRow && (existingOppRow.metadata as Record<string, unknown> | undefined)?.source === SPECIALTY_SOURCE;

    const personName = [first_name, last_name].filter(Boolean).join(" ").trim() || null;
    let locationId: string;
    if (shouldReuse && existingOppRow?.location_id) {
      const existingLocId = existingOppRow.location_id;
      await supabase
        .from("locations")
        .update({
          postal_code: zip,
          label: quoteLocationLabel(personName, zip),
          address1: street,
          city,
          state,
          ...quoteStartNativeLocationPatch(
            {
              home_type,
              bedrooms,
              bathrooms,
            } as Record<string, unknown>,
            squareFootageOption
          ),
        })
        .eq("id", existingLocId)
        .eq("org_id", orgIdForWrites);
      locationId = existingLocId;
    } else {
      const created = await createQuoteLocation(supabase, orgIdForWrites, zip, personName);
      if (!created) {
        return NextResponse.json({ ok: false, message: "Failed to create quote location" }, { status: 500 });
      }
      locationId = created;
      await supabase
        .from("locations")
        .update({
          address1: street,
          city,
          state,
          ...quoteStartNativeLocationPatch(
            {
              home_type,
              bedrooms,
              bathrooms,
            } as Record<string, unknown>,
            squareFootageOption
          ),
        })
        .eq("id", locationId)
        .eq("org_id", orgIdForWrites);
    }

    let opportunityId: string;
    let created_new_opportunity = false;

    if (shouldReuse && existingOppRow) {
      opportunityId = existingOppRow.id;
      await supabase
        .from("opportunities")
        .update({
          location_id: locationId,
          pipeline_stage_id: quoteStartedStageId,
          status_key: "quote_started",
          status: "open",
          vertical_id: verticalId,
          estimated_price_cents: null,
          monetary_value_cents: null,
          metadata: {
            quote_input,
            quote_output,
            source: SPECIALTY_SOURCE,
            quote_started_at,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", opportunityId);
    } else {
      const opportunityName =
        personName != null && personName.length > 0
          ? `${personName} — ${cleaningType === "move_out" ? "Move-out" : "Heavy clean"} quote`
          : `${email || phone || "Lead"} — Specialty quote`;
      const { data: newOpp, error: oppError } = await supabase
        .from("opportunities")
        .insert({
          org_id: orgIdForWrites,
          vertical_id: verticalId,
          primary_person_id: personId,
          primary_contact_id: null,
          customer_id: null,
          location_id: locationId,
          pipeline_stage_id: quoteStartedStageId,
          status_key: "quote_started",
          name: opportunityName,
          status: "open",
          source: "website",
          estimated_price_cents: null,
          monetary_value_cents: null,
          metadata: {
            quote_input,
            quote_output,
            source: SPECIALTY_SOURCE,
            quote_started_at,
          },
        })
        .select("id")
        .single();

      if (oppError || !newOpp) {
        console.error("[SPECIALTY_QUOTE_START] Opportunity insert failed:", oppError);
        return NextResponse.json({ ok: false, message: "Failed to create opportunity" }, { status: 500 });
      }
      opportunityId = (newOpp as { id: string }).id;
      created_new_opportunity = true;

      const { executeWorkflowRun } = await import("@/lib/workflowRun");
      let wq = supabase
        .from("workflows")
        .select("id")
        .eq("enabled", true)
        .eq("event_type", "quote_started")
        .eq("entity_type", "opportunity");
      if (orgIdForWrites) wq = wq.or(`org_id.eq.${orgIdForWrites},org_id.is.null`);
      const { data: quoteWfs } = await wq;
      const { data: oppRow } = await supabase.from("opportunities").select("*").eq("id", opportunityId).single();
      const eventPayload: Record<string, unknown> = {
        event_type: "quote_started",
        occurred_at: new Date().toISOString(),
        org_id: orgIdForWrites ?? null,
        quote_started_stage_id: quoteStartedStageId,
        opportunity: oppRow ?? null,
        specialty_cleaning: true,
        cleaning_type: cleaningType,
      };
      let eventId: string | null = null;
      try {
        eventId = await emitEvent({
          org_id: orgIdForWrites ?? null,
          event_type: "quote_started",
          entity_type: "opportunity",
          entity_id: opportunityId ?? null,
          action_type: null,
          occurred_at: (eventPayload.occurred_at as string) ?? new Date().toISOString(),
          payload: eventPayload,
        });
      } catch (emitErr: unknown) {
        console.error("[SPECIALTY_QUOTE_START_EMIT_EVENT]", emitErr);
      }
      for (const wf of quoteWfs ?? []) {
        try {
          await executeWorkflowRun(supabase, (wf as { id: string }).id, eventPayload, {
            event_id: eventId ?? null,
            org_id: orgIdForWrites ?? null,
          });
        } catch (_) {
          /* non-fatal */
        }
      }
    }

    await upsertTypedFieldValue(supabase, orgIdForWrites, "opportunity", opportunityId, opportunityFreqDef, "one_time");

    if (personSmsConsentDef && body.sms_consent) {
      await upsertTypedFieldValue(supabase, orgIdForWrites, "person", personId, personSmsConsentDef, "true");
    }
    if (personEmailConsentDef && body.email_consent) {
      await upsertTypedFieldValue(supabase, orgIdForWrites, "person", personId, personEmailConsentDef, "true");
    }

    await upsertPersonLocationForQuote(supabase, orgIdForWrites, personId, locationId);

    const specCleanDef = await getFieldDefinitionMeta(
      supabase,
      orgIdForWrites,
      "opportunity",
      "specialty_cleaning_type"
    );
    if (specCleanDef) {
      await upsertTypedFieldValue(supabase, orgIdForWrites, "opportunity", opportunityId, specCleanDef, cleaningType);
    }
    const prefDateDef = await getFieldDefinitionMeta(
      supabase,
      orgIdForWrites,
      "opportunity",
      "preferred_service_date"
    );
    if (prefDateDef && preferred_service_date) {
      await upsertTypedFieldValue(
        supabase,
        orgIdForWrites,
        "opportunity",
        opportunityId,
        prefDateDef,
        preferred_service_date
      );
    }
    const specNotesDef = await getFieldDefinitionMeta(
      supabase,
      orgIdForWrites,
      "opportunity",
      "specialty_quote_notes"
    );
    if (specNotesDef && notes) {
      await upsertTypedFieldValue(supabase, orgIdForWrites, "opportunity", opportunityId, specNotesDef, notes);
    }

    const brDef = await getFieldDefinitionMeta(supabase, orgIdForWrites, "location", "bedrooms");
    if (brDef && bedrooms) {
      await upsertTypedFieldValue(supabase, orgIdForWrites, "location", locationId, brDef, bedrooms);
    }
    const baDef = await getFieldDefinitionMeta(supabase, orgIdForWrites, "location", "bathrooms");
    if (baDef && bathrooms) {
      await upsertTypedFieldValue(supabase, orgIdForWrites, "location", locationId, baDef, bathrooms);
    }
    const htDef = await getFieldDefinitionMeta(supabase, orgIdForWrites, "location", "home_type");
    if (htDef && home_type) {
      await upsertTypedFieldValue(supabase, orgIdForWrites, "location", locationId, htDef, home_type);
    }
    const sqTierDef = await getFieldDefinitionMeta(supabase, orgIdForWrites, "location", "square_footage_tier");
    if (sqTierDef) {
      await upsertTypedFieldValue(
        supabase,
        orgIdForWrites,
        "location",
        locationId,
        sqTierDef,
        String(squareFootageStored)
      );
    }

    const bucket = ORG_DOCUMENTS_STORAGE_BUCKET;
    const specialty_quote_photo_documents: Array<{
      specialty_quote_photo_slot: string;
      document_id: string;
    }> = [];

    for (const key of SPECIALTY_QUOTE_PHOTO_FORM_KEYS) {
      const file = photoFiles[key]!;
      const semanticSlot = SPECIALTY_QUOTE_PHOTO_SEMANTIC_SLOT_BY_FORM_KEY[key];
      const buf = Buffer.from(await file.arrayBuffer());
      const mime = file.type || "image/jpeg";
      const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
      const storagePath = `${orgIdForWrites}/opportunity/${opportunityId}/${randomUUID()}-${semanticSlot}.${ext}`;
      const { error: upErr } = await supabase.storage.from(bucket).upload(storagePath, buf, {
        contentType: mime,
        upsert: false,
      });
      if (upErr) {
        console.error("[SPECIALTY_QUOTE_START_UPLOAD]", key, upErr);
        return NextResponse.json(
          { ok: false, message: "Could not upload photos. Please try again." },
          { status: 500 }
        );
      }
      const origName = file instanceof File && file.name ? file.name : "upload";
      const title = `Specialty quote photo (${semanticSlot.replace(/_/g, " ")})`;
      const { data: docRow, error: docErr } = await supabase
        .from("documents")
        .insert({
          org_id: orgIdForWrites,
          entity_type: "opportunity",
          entity_id: opportunityId,
          doc_type: SPECIALTY_QUOTE_PHOTO_DOC_TYPE,
          title,
          original_filename: origName !== "upload" ? origName : `${semanticSlot}.${ext}`,
          mime_type: mime,
          byte_size: buf.length,
          bucket,
          storage_path: storagePath,
          status: "uploaded",
          metadata: {
            [SPECIALTY_QUOTE_PHOTO_SLOT_METADATA_KEY]: semanticSlot,
            intake_source: SPECIALTY_SOURCE,
          },
        })
        .select("id")
        .single();
      if (docErr || !docRow) {
        console.error("[SPECIALTY_QUOTE_START_DOCUMENT]", key, docErr);
        return NextResponse.json(
          { ok: false, message: "Could not save photo records. Please try again." },
          { status: 500 }
        );
      }
      specialty_quote_photo_documents.push({
        specialty_quote_photo_slot: semanticSlot,
        document_id: (docRow as { id: string }).id,
      });
    }

    const { data: mdRow } = await supabase
      .from("opportunities")
      .select("metadata")
      .eq("id", opportunityId)
      .maybeSingle();
    const existingMeta = (mdRow?.metadata as Record<string, unknown> | null) ?? {};
    const prevQi = (existingMeta.quote_input as Record<string, unknown> | undefined) ?? {};
    const { error: metaErr } = await supabase
      .from("opportunities")
      .update({
        metadata: {
          ...existingMeta,
          quote_input: {
            ...prevQi,
            specialty_quote_photo_documents,
          },
        },
      })
      .eq("id", opportunityId);
    if (metaErr) {
      console.error("[SPECIALTY_QUOTE_START_METADATA]", metaErr);
    }

    console.log(
      "[SPECIALTY_QUOTE_START] person_id=%s created_new=%s opportunity_id=%s type=%s",
      personId,
      created_new_opportunity,
      opportunityId,
      cleaningType
    );

    return NextResponse.json({
      ok: true,
      person_id: personId,
      opportunity_id: opportunityId,
      quote_output,
      specialty_quote_photo_documents,
    });
  } catch (err) {
    console.error("[SPECIALTY_QUOTE_START_ERROR]", err);
    return NextResponse.json(
      { ok: false, message: err instanceof Error ? err.message : "Specialty quote start failed" },
      { status: 500 }
    );
  }
}
