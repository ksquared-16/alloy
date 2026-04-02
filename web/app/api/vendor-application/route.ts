import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serverServiceClient";
import { submitPublicVendorApplication } from "@/lib/vendors/publicVendorApplication";
import { emitEvent } from "@/lib/emitEvent";

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
    const company_name = getStr(form, "company_name");
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

    const contentType = (file: File) => file.type || "application/octet-stream";
    const insuranceBuf = Buffer.from(await proof_of_insurance.arrayBuffer());
    const driversBuf = Buffer.from(await drivers_license.arrayBuffer());

    const result = await submitPublicVendorApplication(supabase, {
      orgId,
      applicant: {
        first_name,
        last_name,
        company_name,
        email,
        phone,
        address_line1,
        city,
        state,
        postal_code,
      },
      owns_supplies,
      days_available,
      operating_hours_open,
      operating_hours_close,
      service_area_zip_codes,
      vertical_ids,
      consent_contractor_agreement,
      consent_marketing,
      consent_legal,
      proof_of_insurance: {
        buffer: insuranceBuf,
        filename: proof_of_insurance.name,
        contentType: contentType(proof_of_insurance),
      },
      drivers_license: {
        buffer: driversBuf,
        filename: drivers_license.name,
        contentType: contentType(drivers_license),
      },
    });

    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
    }

    try {
      await emitEvent({
        org_id: orgId,
        event_type: "vendor_application_submitted",
        entity_type: "vendor",
        entity_id: result.vendor_id,
        payload: {
          event_type: "vendor_application_submitted",
          vendor_id: result.vendor_id,
          person_id: result.person_id,
          contact_id: result.contact_id,
        },
      });
    } catch (e) {
      console.warn("[VENDOR_APPLICATION] emitEvent failed (non-fatal)", e);
    }

    return NextResponse.json({
      ok: true,
      vendor_id: result.vendor_id,
      person_id: result.person_id,
      contact_id: result.contact_id,
    });
  } catch (err) {
    console.error("[VENDOR_APPLICATION] Error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Application failed" },
      { status: 500 }
    );
  }
}
