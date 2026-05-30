import type { SupabaseClient } from "@supabase/supabase-js";
import { hashFormLinkToken } from "@/lib/public/forms/tokenHash";
import {
    DEMO_CHILDCARE_ENROLLMENT_LEAD_EMBED_TOKEN,
    DEMO_CHILDCARE_ENROLLMENT_LEAD_INTAKE_LINK_METADATA,
    DEMO_CHILDCARE_ORG_ID,
} from "@/lib/forms/intakeRuntimeTestFixtures";
import { ENROLLMENT_LEAD_CAPTURE_DEMO_FORM_KEY } from "@/lib/forms/seeds/enrollmentLeadCaptureDemo";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** First active site location for Demo Childcare — avoids stale hardcoded fixture UUIDs. */
export async function resolveDemoChildcareSiteLocationId(
    supabase: SupabaseClient,
    orgId: string = DEMO_CHILDCARE_ORG_ID
): Promise<string> {
    const { data, error } = await supabase
        .from("locations")
        .select("id")
        .eq("org_id", orgId)
        .eq("is_active", true)
        .eq("location_type", "site")
        .order("created_at")
        .limit(1)
        .maybeSingle();
    if (error) throw new Error(error.message);
    const id = typeof data?.id === "string" ? data.id.trim() : "";
    if (!UUID_RE.test(id)) {
        throw new Error(`No active site location found for org ${orgId}`);
    }
    return id;
}

/** Enrollment lead proof link metadata with live org routing (location must exist). */
export async function buildDemoEnrollmentLeadIntakeLinkMetadata(
    supabase: SupabaseClient,
    orgId: string = DEMO_CHILDCARE_ORG_ID
): Promise<Record<string, unknown>> {
    const locationId = await resolveDemoChildcareSiteLocationId(supabase, orgId);
    return {
        ...DEMO_CHILDCARE_ENROLLMENT_LEAD_INTAKE_LINK_METADATA,
        default_location_id: locationId,
        runtime_test_prepared_at: new Date().toISOString(),
    };
}

export type DemoEnrollmentLeadProofContext = {
    formId: string;
    formName: string;
    publicLinkId: string;
    token: string;
};

/** Resolve demo enrollment-lead form + canonical public link by embed token (not limit(1)). */
export async function resolveDemoEnrollmentLeadProofContext(
    supabase: SupabaseClient,
    orgId: string = DEMO_CHILDCARE_ORG_ID
): Promise<DemoEnrollmentLeadProofContext | null> {
    const { data: form, error: formErr } = await supabase
        .from("form_definitions")
        .select("id,name,is_active")
        .eq("org_id", orgId)
        .eq("key", ENROLLMENT_LEAD_CAPTURE_DEMO_FORM_KEY)
        .maybeSingle();
    if (formErr) throw new Error(formErr.message);
    if (!form?.id || form.is_active === false) return null;

    const tokenHash = hashFormLinkToken(DEMO_CHILDCARE_ENROLLMENT_LEAD_EMBED_TOKEN);
    const { data: link, error: linkErr } = await supabase
        .from("form_public_links")
        .select("id,is_active,form_definition_id")
        .eq("org_id", orgId)
        .eq("token_hash", tokenHash)
        .maybeSingle();
    if (linkErr) throw new Error(linkErr.message);
    if (!link?.id || link.is_active === false) return null;
    if (link.form_definition_id !== form.id) return null;

    return {
        formId: form.id,
        formName: typeof form.name === "string" ? form.name : "Enrollment Lead — Demo",
        publicLinkId: link.id,
        token: DEMO_CHILDCARE_ENROLLMENT_LEAD_EMBED_TOKEN,
    };
}

/** Upsert intake metadata on the canonical demo embed link before QA submit. */
export async function ensureDemoEnrollmentLeadPublicLinkMetadata(
    supabase: SupabaseClient,
    orgId: string = DEMO_CHILDCARE_ORG_ID
): Promise<DemoEnrollmentLeadProofContext> {
    const ctx = await resolveDemoEnrollmentLeadProofContext(supabase, orgId);
    if (!ctx) {
        throw new Error(
            "Demo enrollment lead form/link not ready — run prepareDemoChildcareEnrollmentLeadIntakeTest.ts first"
        );
    }

    const metadata = await buildDemoEnrollmentLeadIntakeLinkMetadata(supabase, orgId);
    const { error } = await supabase
        .from("form_public_links")
        .update({ metadata, is_active: true })
        .eq("id", ctx.publicLinkId);
    if (error) throw new Error(error.message);

    return ctx;
}

export function readUuidOrNull(value: unknown): string | null {
    return typeof value === "string" && UUID_RE.test(value.trim()) ? value.trim() : null;
}
