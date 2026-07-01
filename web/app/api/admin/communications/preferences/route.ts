import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireAdminOrgContextLight } from "@/lib/admin/getAdminOrgContextLight";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { isCommsV2FlagEnabled } from "@/lib/communications/v2/flags";
import { loadPersonCommunicationPreferencesBundle } from "@/lib/communications/v2/loadCommunicationPreferences";
import { persistCommunicationPreference } from "@/lib/communications/v2/persistCommunicationPreference";
import {
    PREFERENCE_FIELD_DEFS,
    type PreferenceFieldKey,
    operatorStatusToPreferenceState,
} from "@/lib/communications/v2/communicationPreferenceLabels";
import type { PreferenceCategory, PreferenceState } from "@/lib/communications/v2/preferences";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CATEGORY_BY_KEY = new Map<PreferenceFieldKey, PreferenceCategory>(
    PREFERENCE_FIELD_DEFS.map((d) => [d.key, d.category])
);

/**
 * GET /api/admin/communications/preferences?person_id=
 * PATCH /api/admin/communications/preferences — update one category for a person.
 */
export async function GET(req: Request) {
    if (!isCommsV2FlagEnabled("comms_v2_command_center")) {
        return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const ctx = await requireAdminOrgContextLight();
    if (ctx instanceof Response) return ctx;

    const personId = new URL(req.url).searchParams.get("person_id")?.trim() ?? "";
    if (!UUID_RE.test(personId)) return NextResponse.json({ error: "person_id must be a UUID" }, { status: 400 });

    const supabase = createAdminClient();
    if (!(await assertRowOrg(supabase, "persons", personId, ctx.orgId)).ok) {
        return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }

    const bundle = await loadPersonCommunicationPreferencesBundle(supabase, ctx.orgId, [personId]);
    const profile = bundle.profilesByContact[personId] ?? {
        email_transactional: "unset",
        sms_transactional: "unset",
        email_marketing: "unset",
        sms_marketing: "unset",
    };

    return NextResponse.json({
        person_id: personId,
        preferences: profile,
        household_summary: bundle.byContact[personId] ?? { email: "unset", sms: "unset", marketing: "unset" },
    });
}

export async function PATCH(req: Request) {
    if (!isCommsV2FlagEnabled("comms_v2_command_center")) {
        return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const ctx = await requireAdminOrgContextLight();
    if (ctx instanceof Response) return ctx;

    let body: Record<string, unknown>;
    try {
        body = (await req.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const personId = String(body.person_id ?? "").trim();
    const fieldKey = String(body.field ?? "") as PreferenceFieldKey;
    const statusRaw = String(body.status ?? "").trim();

    if (!UUID_RE.test(personId)) return NextResponse.json({ error: "person_id must be a UUID" }, { status: 400 });
    if (!CATEGORY_BY_KEY.has(fieldKey)) return NextResponse.json({ error: "invalid field" }, { status: 400 });
    if (statusRaw !== "Allowed" && statusRaw !== "Blocked") {
        return NextResponse.json({ error: "status must be Allowed or Blocked" }, { status: 400 });
    }

    const supabase = createAdminClient();
    if (!(await assertRowOrg(supabase, "persons", personId, ctx.orgId)).ok) {
        return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }

    const category = CATEGORY_BY_KEY.get(fieldKey)!;
    const toState = operatorStatusToPreferenceState(statusRaw as "Allowed" | "Blocked");

    const { data: existing } = await supabase
        .from("communication_preferences")
        .select("state")
        .eq("org_id", ctx.orgId)
        .eq("person_id", personId)
        .eq("category", category)
        .maybeSingle();

    const fromState =
        existing && typeof existing === "object" && "state" in existing ?
            (existing.state as PreferenceState)
        :   null;

    const result = await persistCommunicationPreference(supabase, {
        orgId: ctx.orgId,
        personId,
        category,
        fromState,
        toState,
        source: "admin_command_center",
        method: "operator_edit",
        actorUserId: ctx.userId ?? null,
    });

    if (!result.ok) return NextResponse.json({ error: result.message }, { status: 500 });
    return NextResponse.json({ ok: true, field: fieldKey, state: toState });
}
