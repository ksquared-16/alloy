import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serverServiceClient";

const BUCKET = "vendor_documents";

function getStr(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function getBool(form: FormData, key: string): boolean {
  const v = form.get(key);
  if (v === "true" || v === "1") return true;
  if (v === "false" || v === "0" || v === null || v === undefined) return false;
  return typeof v === "string" && v.trim().toLowerCase() === "true";
}

function getFile(form: FormData, key: string): File | null {
  const v = form.get(key);
  return v instanceof File ? v : null;
}

function getAll(form: FormData, key: string): string[] {
  const v = form.getAll(key);
  return v.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean);
}

function uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ZIP_REGEX = /^\d{5}$/;

export async function POST(request: NextRequest) {
  try {
    const orgId = process.env.ALLOY_PUBLIC_ORG_ID;
    if (!orgId) {
      console.error("[VENDOR_APPLICATION] ALLOY_PUBLIC_ORG_ID not set");
      return NextResponse.json({ ok: false, error: "Server configuration error" }, { status: 500 });
    }

    const form = await request.formData();

    const first_name = getStr(form, "first_name");
    const last_name = getStr(form, "last_name");
    const email = getStr(form, "email");
    const phone = getStr(form, "phone");
    const address_line1 = getStr(form, "address_line1");
    const city = getStr(form, "city");
    const state = getStr(form, "state");
    const postal_code = getStr(form, "postal_code");
    const owns_supplies = getBool(form, "owns_supplies");
    const days_available = getAll(form, "days_available[]").length ? getAll(form, "days_available[]") : getAll(form, "days_available");
    const operating_hours_open = getStr(form, "operating_hours_open");
    const operating_hours_close = getStr(form, "operating_hours_close");
    const service_area_zip_codes = getAll(form, "service_area_zip_codes[]");
    const vertical_ids = getAll(form, "vertical_ids[]");
    const consent_contractor_agreement = getBool(form, "consent_contractor_agreement");
    const consent_marketing = getBool(form, "consent_marketing");
    const consent_legal = getBool(form, "consent_legal");
    const proof_of_insurance = getFile(form, "proof_of_insurance");
    const drivers_license = getFile(form, "drivers_license");

    if (!first_name || !last_name) {
      return NextResponse.json({ ok: false, error: "First name and last name are required" }, { status: 400 });
    }
    if (!email) {
      return NextResponse.json({ ok: false, error: "Email is required" }, { status: 400 });
    }
    if (!EMAIL_REGEX.test(email)) {
      return NextResponse.json({ ok: false, error: "Invalid email format" }, { status: 400 });
    }
    if (!phone) {
      return NextResponse.json({ ok: false, error: "Phone is required" }, { status: 400 });
    }
    if (!consent_contractor_agreement || !consent_legal) {
      return NextResponse.json({ ok: false, error: "Required consents must be accepted" }, { status: 400 });
    }
    if (!proof_of_insurance || proof_of_insurance.size === 0) {
      return NextResponse.json({ ok: false, error: "Proof of insurance file is required" }, { status: 400 });
    }
    if (!drivers_license || drivers_license.size === 0) {
      return NextResponse.json({ ok: false, error: "Drivers license file is required" }, { status: 400 });
    }
    if (vertical_ids.length === 0) {
      return NextResponse.json({ ok: false, error: "Select at least one service" }, { status: 400 });
    }
    const invalidZip = service_area_zip_codes.find((z) => !ZIP_REGEX.test(z));
    if (invalidZip) {
      return NextResponse.json({ ok: false, error: "Invalid zip code (use 5 digits)" }, { status: 400 });
    }
    if (operating_hours_open && operating_hours_close) {
      if (operating_hours_open >= operating_hours_close) {
        return NextResponse.json({ ok: false, error: "Operating hours: open must be before close" }, { status: 400 });
      }
    }

    const supabase = createServiceRoleClient();

    let contactId: string;

    const { data: existingContact } = await supabase
      .from("contacts")
      .select("id, first_name, last_name, phone, address_line1, city, state, postal_code")
      .ilike("email", email)
      .limit(1)
      .maybeSingle();

    if (existingContact) {
      contactId = (existingContact as { id: string }).id;
      const updates: Record<string, unknown> = {};
      if (first_name) updates.first_name = first_name;
      if (last_name) updates.last_name = last_name;
      if (phone) updates.phone = phone;
      if (postal_code !== undefined) updates.postal_code = postal_code || null;
      if (orgId) updates.org_id = orgId;
      if (Object.keys(updates).length > 0) {
        await supabase.from("contacts").update(updates).eq("id", contactId);
      }
    } else {
      const contactInsert: Record<string, unknown> = {
        email,
        phone,
        first_name,
        last_name,
        postal_code: postal_code || null,
        contact_type: "lead",
      };
      if (orgId) contactInsert.org_id = orgId;
      const { data: newContact, error: contactErr } = await supabase
        .from("contacts")
        .insert(contactInsert)
        .select("id")
        .single();
      if (contactErr || !newContact) {
        console.error("[VENDOR_APPLICATION] Contact insert failed:", contactErr?.message);
        return NextResponse.json({ ok: false, error: "Failed to save contact" }, { status: 500 });
      }
      contactId = (newContact as { id: string }).id;
    }

    const { data: pendingStatus } = await supabase
      .from("vendor_statuses")
      .select("id")
      .eq("key", "pending")
      .limit(1)
      .maybeSingle();
    const vendorStatusId = (pendingStatus as { id: string } | null)?.id ?? null;

    const vendorName = `${first_name} ${last_name}`.trim() || email;
    const vendorPayload: Record<string, unknown> = {
      org_id: orgId,
      name: vendorName,
      vendor_status_id: vendorStatusId,
      email,
      phone,
      primary_contact_id: contactId,
      owns_supplies,
      days_available: days_available.length ? days_available : null,
      operating_hours_open: operating_hours_open || null,
      operating_hours_close: operating_hours_close || null,
      service_area_zip_codes: service_area_zip_codes.length ? service_area_zip_codes : null,
      address_line1: address_line1 || null,
      city: city || null,
      state: state || null,
      postal_code: postal_code || null,
      consent_contractor_agreement,
      consent_marketing,
      consent_legal,
      submitted_at: new Date().toISOString(),
    };

    const { data: vendor, error: vendorErr } = await supabase
      .from("vendors")
      .insert(vendorPayload)
      .select("id")
      .single();

    if (vendorErr || !vendor) {
      console.error("[VENDOR_APPLICATION] Vendor insert failed:", vendorErr?.message);
      return NextResponse.json({ ok: false, error: "Failed to create application" }, { status: 500 });
    }

    const vendorId = (vendor as { id: string }).id;

    const vendorVerticalsRows = vertical_ids.map((vertical_id) => ({
      vendor_id: vendorId,
      vertical_id,
    }));
    if (vendorVerticalsRows.length > 0) {
      const { error: vvErr } = await supabase
        .from("vendor_verticals")
        .upsert(vendorVerticalsRows, { onConflict: "vendor_id,vertical_id" });
      if (vvErr) {
        console.error("[VENDOR_APPLICATION] Vendor verticals upsert failed:", vvErr.message);
        return NextResponse.json({ ok: false, error: "Failed to save services" }, { status: 500 });
      }
    }

    const ext = (filename: string) => {
      const i = filename.lastIndexOf(".");
      return i >= 0 ? filename.slice(i).toLowerCase() : "";
    };
    const contentType = (file: File) => file.type || "application/octet-stream";

    const insurancePath = `vendors/${vendorId}/insurance/${uuid()}${ext(proof_of_insurance.name) || ".bin"}`;
    const driversPath = `vendors/${vendorId}/drivers_license/${uuid()}${ext(drivers_license.name) || ".bin"}`;

    const insuranceBuf = Buffer.from(await proof_of_insurance.arrayBuffer());
    const driversBuf = Buffer.from(await drivers_license.arrayBuffer());

    const { error: up1 } = await supabase.storage.from(BUCKET).upload(insurancePath, insuranceBuf, {
      contentType: contentType(proof_of_insurance),
      upsert: false,
    });
    if (up1) {
      console.error("[VENDOR_APPLICATION] upload failed", { which: "insurance", error: up1 });
      return NextResponse.json({ ok: false, error: "Failed to upload proof of insurance" }, { status: 400 });
    }

    const { error: up2 } = await supabase.storage.from(BUCKET).upload(driversPath, driversBuf, {
      contentType: contentType(drivers_license),
      upsert: false,
    });
    if (up2) {
      console.error("[VENDOR_APPLICATION] upload failed", { which: "drivers_license", error: up2 });
      await supabase
        .from("vendors")
        .update({
          vendor_status_id: vendorStatusId,
          insurance_doc_path: insurancePath,
        })
        .eq("id", vendorId);
      return NextResponse.json({ ok: false, error: "Failed to upload drivers license" }, { status: 400 });
    }

    await supabase
      .from("vendors")
      .update({
        insurance_doc_path: insurancePath,
        drivers_license_doc_path: driversPath,
      })
      .eq("id", vendorId);

    console.log("[VENDOR_APPLICATION] uploaded docs", { vendorId, insurance_doc_path: insurancePath, drivers_license_doc_path: driversPath });

    await supabase
      .from("contacts")
      .update({ vendor_id: vendorId })
      .eq("id", contactId);

    return NextResponse.json({ ok: true, vendor_id: vendorId });
  } catch (err) {
    console.error("[VENDOR_APPLICATION] Error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Application failed" },
      { status: 500 }
    );
  }
}
