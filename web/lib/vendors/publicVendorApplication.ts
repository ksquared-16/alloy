import type { SupabaseClient } from "@supabase/supabase-js";
import { ORG_DOCUMENTS_STORAGE_BUCKET } from "@/lib/storage/orgDocumentsBucket";
import { findOrCreatePersonInOrgWithMeta } from "@/lib/persons/findOrCreatePersonInOrg";
import { resolveVendorStatusByKey } from "@/lib/vendors/vendorStatusSync";

export type PublicVendorApplicant = {
  first_name: string;
  last_name: string;
  company_name: string;
  email: string;
  phone: string;
  address_line1: string;
  city: string;
  state: string;
  postal_code: string;
};

export type PublicVendorApplicationFile = {
  buffer: Buffer;
  filename: string;
  contentType: string;
};

export type SubmitPublicVendorApplicationParams = {
  orgId: string;
  applicant: PublicVendorApplicant;
  owns_supplies: boolean;
  days_available: string[];
  operating_hours_open: string;
  operating_hours_close: string;
  service_area_zip_codes: string[];
  vertical_ids: string[];
  consent_contractor_agreement: boolean;
  consent_marketing: boolean;
  consent_legal: boolean;
  proof_of_insurance: PublicVendorApplicationFile;
  drivers_license: PublicVendorApplicationFile;
};

export type SubmitPublicVendorApplicationOk = {
  ok: true;
  vendor_id: string;
  person_id: string;
  contact_id: string;
};

export type SubmitPublicVendorApplicationErr = { ok: false; error: string; status: number };

async function rollbackPublicVendorApplication(params: {
  supabase: SupabaseClient;
  orgId: string;
  vendorId: string | null;
  personId: string | null;
  personCreatedThisRequest: boolean;
  storagePaths: string[];
}) {
  const { supabase, orgId, vendorId, personId, personCreatedThisRequest, storagePaths } = params;
  if (vendorId) {
    await supabase.from("documents").delete().eq("org_id", orgId).eq("entity_type", "vendor").eq("entity_id", vendorId);
    await supabase.from("contacts").delete().eq("org_id", orgId).eq("vendor_id", vendorId);
    await supabase.from("vendors").delete().eq("id", vendorId).eq("org_id", orgId);
  }
  if (personCreatedThisRequest && personId) {
    await supabase.from("persons").delete().eq("id", personId).eq("org_id", orgId);
  }
  if (storagePaths.length > 0) {
    await supabase.storage.from(ORG_DOCUMENTS_STORAGE_BUCKET).remove(storagePaths).catch(() => {});
  }
}

/**
 * Creates or attaches the primary vendor contact (email/phone uniqueness is global on `contacts`).
 */
async function ensureVendorPrimaryContact(
  supabase: SupabaseClient,
  params: {
    orgId: string;
    vendorId: string;
    personId: string;
    emailNorm: string;
    phoneNorm: string;
    first_name: string;
    last_name: string;
    company_name: string;
    address_line1: string;
    city: string;
    state: string;
    postal_code: string;
  }
): Promise<{ contactId: string } | { error: string }> {
  const {
    orgId,
    vendorId,
    personId,
    emailNorm,
    phoneNorm,
    first_name,
    last_name,
    company_name,
    address_line1,
    city,
    state,
    postal_code,
  } = params;

  const basePayload: Record<string, unknown> = {
    org_id: orgId,
    vendor_id: vendorId,
    person_id: personId,
    first_name,
    last_name,
    email: emailNorm,
    phone: phoneNorm,
    company_name: company_name || null,
    vendor_contact_role: "primary",
    contact_type: "vendor",
    status: "active",
    customer_id: null,
    address_line1: address_line1 || null,
    city: city || null,
    state: state || null,
    postal_code: postal_code || null,
  };

  const { data: inserted, error: insErr } = await supabase.from("contacts").insert(basePayload).select("id").single();

  if (!insErr && inserted && typeof (inserted as { id?: string }).id === "string") {
    const contactId = (inserted as { id: string }).id;
    const { error: vErr } = await supabase.from("vendors").update({ primary_contact_id: contactId }).eq("id", vendorId);
    if (vErr) {
      await supabase.from("contacts").delete().eq("id", contactId);
      return { error: vErr.message ?? "Failed to set primary contact on vendor" };
    }
    return { contactId };
  }

  if (insErr?.code !== "23505") {
    return { error: insErr?.message ?? "Failed to create vendor contact" };
  }

  const { data: byEmail } = await supabase.from("contacts").select("id, vendor_id, org_id").eq("email", emailNorm).limit(1).maybeSingle();

  let existing = byEmail as { id: string; vendor_id: string | null; org_id: string } | null;
  if (!existing && phoneNorm) {
    const { data: byPhone } = await supabase.from("contacts").select("id, vendor_id, org_id").eq("phone", phoneNorm).limit(1).maybeSingle();
    existing = byPhone as { id: string; vendor_id: string | null; org_id: string } | null;
  }

  if (!existing) {
    console.error("[ensureVendorPrimaryContact] unique violation but no conflicting row", insErr);
    return { error: "Failed to link vendor contact" };
  }

  if (existing.org_id !== orgId) {
    return { error: "This email or phone is already used for a contact in another organization" };
  }

  if (existing.vendor_id && existing.vendor_id !== vendorId) {
    return { error: "This email or phone is already linked to another vendor profile" };
  }

  const { error: upErr } = await supabase
    .from("contacts")
    .update({
      vendor_id: vendorId,
      person_id: personId,
      first_name,
      last_name,
      email: emailNorm,
      phone: phoneNorm,
      company_name: company_name || null,
      vendor_contact_role: "primary",
      contact_type: "vendor",
      status: "active",
      address_line1: address_line1 || null,
      city: city || null,
      state: state || null,
      postal_code: postal_code || null,
    })
    .eq("id", existing.id);

  if (upErr) {
    return { error: upErr.message ?? "Failed to update vendor contact" };
  }

  const { error: vErr } = await supabase.from("vendors").update({ primary_contact_id: existing.id }).eq("id", vendorId);
  if (vErr) {
    return { error: vErr.message ?? "Failed to set primary contact on vendor" };
  }

  return { contactId: existing.id };
}

/**
 * Person → vendor → verticals → primary contact → storage → documents → vendor doc paths.
 * On any failure after the person is resolved, rolls back DB rows and uploaded objects so
 * `vendors.primary_person_id` never points at a missing person for a persisted vendor row.
 */
export async function submitPublicVendorApplication(
  supabase: SupabaseClient,
  input: SubmitPublicVendorApplicationParams
): Promise<SubmitPublicVendorApplicationOk | SubmitPublicVendorApplicationErr> {
  const { orgId, applicant, vertical_ids } = input;
  const emailNorm = applicant.email.trim().toLowerCase();
  const phoneNorm = applicant.phone.trim();

  const personRes = await findOrCreatePersonInOrgWithMeta(supabase, {
    email: applicant.email,
    phone: applicant.phone,
    first_name: applicant.first_name,
    last_name: applicant.last_name,
    org_id: orgId,
  });

  if (!personRes) {
    console.error("[submitPublicVendorApplication] Could not resolve person");
    return { ok: false, error: "Failed to save applicant profile", status: 500 };
  }

  const { id: personId, created: personCreatedThisRequest } = personRes;

  await supabase
    .from("persons")
    .update({
      first_name: applicant.first_name,
      last_name: applicant.last_name,
      phone: phoneNorm || null,
      email: emailNorm,
    })
    .eq("id", personId)
    .eq("org_id", orgId);

  const { data: personRow, error: personVerifyErr } = await supabase
    .from("persons")
    .select("id")
    .eq("id", personId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (personVerifyErr || !personRow) {
    console.error("[submitPublicVendorApplication] Person row missing after resolve", personVerifyErr);
    if (personCreatedThisRequest) {
      await supabase.from("persons").delete().eq("id", personId).eq("org_id", orgId);
    }
    return { ok: false, error: "Failed to save applicant profile", status: 500 };
  }

  const pendingAligned = await resolveVendorStatusByKey(supabase, "pending");
  if (!pendingAligned) {
    console.error("[submitPublicVendorApplication] vendor_statuses row for key 'pending' not found");
    return { ok: false, error: "Server configuration error", status: 500 };
  }

  const vendorName = `${applicant.first_name} ${applicant.last_name}`.trim() || applicant.email;
  const vendorPayload: Record<string, unknown> = {
    org_id: orgId,
    name: vendorName,
    company_name: applicant.company_name || null,
    ...pendingAligned,
    email: emailNorm,
    phone: phoneNorm,
    primary_person_id: personId,
    primary_contact_id: null,
    owns_supplies: input.owns_supplies,
    days_available: input.days_available.length ? input.days_available : null,
    operating_hours_open: input.operating_hours_open || null,
    operating_hours_close: input.operating_hours_close || null,
    service_area_zip_codes: input.service_area_zip_codes.length ? input.service_area_zip_codes : null,
    address_line1: applicant.address_line1 || null,
    city: applicant.city || null,
    state: applicant.state || null,
    postal_code: applicant.postal_code || null,
    consent_contractor_agreement: input.consent_contractor_agreement,
    consent_marketing: input.consent_marketing,
    consent_legal: input.consent_legal,
    submitted_at: new Date().toISOString(),
  };

  const { data: vendor, error: vendorErr } = await supabase.from("vendors").insert(vendorPayload).select("id").single();

  if (vendorErr || !vendor) {
    console.error("[submitPublicVendorApplication] Vendor insert failed:", vendorErr?.message);
    await rollbackPublicVendorApplication({
      supabase,
      orgId,
      vendorId: null,
      personId,
      personCreatedThisRequest,
      storagePaths: [],
    });
    return { ok: false, error: "Failed to create application", status: 500 };
  }

  const vendorId = (vendor as { id: string }).id;

  const vendorVerticalsRows = vertical_ids.map((vertical_id) => ({
    vendor_id: vendorId,
    vertical_id,
  }));

  if (vendorVerticalsRows.length > 0) {
    const { error: vvErr } = await supabase.from("vendor_verticals").upsert(vendorVerticalsRows, { onConflict: "vendor_id,vertical_id" });
    if (vvErr) {
      console.error("[submitPublicVendorApplication] Vendor verticals upsert failed:", vvErr.message);
      await rollbackPublicVendorApplication({
        supabase,
        orgId,
        vendorId,
        personId,
        personCreatedThisRequest,
        storagePaths: [],
      });
      return { ok: false, error: "Failed to save services", status: 500 };
    }
  }

  const contactOutcome = await ensureVendorPrimaryContact(supabase, {
    orgId,
    vendorId,
    personId,
    emailNorm,
    phoneNorm,
    first_name: applicant.first_name,
    last_name: applicant.last_name,
    company_name: applicant.company_name,
    address_line1: applicant.address_line1,
    city: applicant.city,
    state: applicant.state,
    postal_code: applicant.postal_code,
  });

  if ("error" in contactOutcome) {
    console.error("[submitPublicVendorApplication] Primary contact failed:", contactOutcome.error);
    await rollbackPublicVendorApplication({
      supabase,
      orgId,
      vendorId,
      personId,
      personCreatedThisRequest,
      storagePaths: [],
    });
    return { ok: false, error: contactOutcome.error, status: 409 };
  }

  const contactId = contactOutcome.contactId;

  const ext = (filename: string) => {
    const i = filename.lastIndexOf(".");
    return i >= 0 ? filename.slice(i).toLowerCase() : "";
  };

  const insurancePath = `vendors/${vendorId}/insurance/${crypto.randomUUID()}${ext(input.proof_of_insurance.filename) || ".bin"}`;
  const driversPath = `vendors/${vendorId}/drivers_license/${crypto.randomUUID()}${ext(input.drivers_license.filename) || ".bin"}`;

  const insuranceBuf = input.proof_of_insurance.buffer;
  const driversBuf = input.drivers_license.buffer;

  const { error: up1 } = await supabase.storage.from(ORG_DOCUMENTS_STORAGE_BUCKET).upload(insurancePath, insuranceBuf, {
    contentType: input.proof_of_insurance.contentType || "application/octet-stream",
    upsert: false,
  });
  if (up1) {
    console.error("[submitPublicVendorApplication] upload failed", { which: "insurance", error: up1 });
    await rollbackPublicVendorApplication({
      supabase,
      orgId,
      vendorId,
      personId,
      personCreatedThisRequest,
      storagePaths: [],
    });
    return { ok: false, error: "Failed to upload proof of insurance", status: 400 };
  }

  const { error: up2 } = await supabase.storage.from(ORG_DOCUMENTS_STORAGE_BUCKET).upload(driversPath, driversBuf, {
    contentType: input.drivers_license.contentType || "application/octet-stream",
    upsert: false,
  });
  if (up2) {
    console.error("[submitPublicVendorApplication] upload failed", { which: "drivers_license", error: up2 });
    await rollbackPublicVendorApplication({
      supabase,
      orgId,
      vendorId,
      personId,
      personCreatedThisRequest,
      storagePaths: [insurancePath],
    });
    return { ok: false, error: "Failed to upload drivers license", status: 400 };
  }

  const insuranceFilename = input.proof_of_insurance.filename?.trim() || "proof_of_insurance";
  const driversFilename = input.drivers_license.filename?.trim() || "drivers_license";

  const { error: doc1Err } = await supabase.from("documents").insert({
    org_id: orgId,
    entity_type: "vendor",
    entity_id: vendorId,
    doc_type: "insurance",
    title: "Proof of insurance",
    original_filename: insuranceFilename,
    mime_type: input.proof_of_insurance.contentType || "application/octet-stream",
    byte_size: insuranceBuf.length,
    bucket: ORG_DOCUMENTS_STORAGE_BUCKET,
    storage_path: insurancePath,
    status: "uploaded",
  });
  if (doc1Err) {
    console.error("[submitPublicVendorApplication] documents insert (insurance) failed:", doc1Err.message);
    await rollbackPublicVendorApplication({
      supabase,
      orgId,
      vendorId,
      personId,
      personCreatedThisRequest,
      storagePaths: [insurancePath, driversPath],
    });
    return { ok: false, error: "Failed to save document records", status: 500 };
  }

  const { error: doc2Err } = await supabase.from("documents").insert({
    org_id: orgId,
    entity_type: "vendor",
    entity_id: vendorId,
    doc_type: "drivers_license",
    title: "Driver's license",
    original_filename: driversFilename,
    mime_type: input.drivers_license.contentType || "application/octet-stream",
    byte_size: driversBuf.length,
    bucket: ORG_DOCUMENTS_STORAGE_BUCKET,
    storage_path: driversPath,
    status: "uploaded",
  });
  if (doc2Err) {
    console.error("[submitPublicVendorApplication] documents insert (drivers_license) failed:", doc2Err.message);
    await rollbackPublicVendorApplication({
      supabase,
      orgId,
      vendorId,
      personId,
      personCreatedThisRequest,
      storagePaths: [insurancePath, driversPath],
    });
    return { ok: false, error: "Failed to save document records", status: 500 };
  }

  const { error: pathErr } = await supabase
    .from("vendors")
    .update({
      insurance_doc_path: insurancePath,
      drivers_license_doc_path: driversPath,
    })
    .eq("id", vendorId);

  if (pathErr) {
    console.error("[submitPublicVendorApplication] vendor path update failed:", pathErr.message);
    await rollbackPublicVendorApplication({
      supabase,
      orgId,
      vendorId,
      personId,
      personCreatedThisRequest,
      storagePaths: [insurancePath, driversPath],
    });
    return { ok: false, error: "Failed to finalize application", status: 500 };
  }

  console.log("[submitPublicVendorApplication] created", { vendorId, personId, contactId, insurancePath, driversPath });

  return { ok: true, vendor_id: vendorId, person_id: personId, contact_id: contactId };
}
