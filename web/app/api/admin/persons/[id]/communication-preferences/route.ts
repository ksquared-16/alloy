/**
 * One person's communication preferences, as staff may see and change them.
 *
 * GET   — legal consent per category (with who last changed it and why a change is locked) and the
 *         advisory preferred channel.
 * PATCH — `{ field, status: "Allowed"|"Blocked" }` for a consent category, or `{ preferred_channel }`.
 *         Writes the canonical store through its single writer (audited); refuses to reverse a STOP or
 *         an unsubscribe, and to record a marketing opt-in. See personCommunicationPreferences.ts.
 * Communications authority: read to view, send to change — the same as the Command Center route.
 */
import { NextResponse } from "next/server";

import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { requireAdminOrgContextLight } from "@/lib/admin/getAdminOrgContextLight";
import { COMMUNICATIONS_READ, COMMUNICATIONS_SEND, requireCommunicationsAuthority } from "@/lib/communications/communicationsAuthority";
import {
    loadPersonPreferencesView,
    updatePersonPreference,
    updatePreferredChannel,
} from "@/lib/communications/v2/personCommunicationPreferences";
import { createAdminClient } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const ctx = await requireAdminOrgContextLight();
    if (ctx instanceof Response) return ctx;
    const auth = await requireCommunicationsAuthority(COMMUNICATIONS_READ);
    if (!auth.ok) return auth.response;
    const personId = (await params).id?.trim() ?? "";
    if (!UUID_RE.test(personId)) return NextResponse.json({ error: "personId must be a UUID" }, { status: 400 });
    const supabase = createAdminClient();
    if (!(await assertRowOrg(supabase, "persons", personId, ctx.orgId)).ok) {
        return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }
    try {
        return NextResponse.json({ data: await loadPersonPreferencesView(supabase, { orgId: ctx.orgId, personId }) });
    } catch (e) {
        console.error("[person preferences] read failed", e instanceof Error ? e.message : e);
        return NextResponse.json({ error: "Preferences could not be read." }, { status: 500 });
    }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const ctx = await requireAdminOrgContextLight();
    if (ctx instanceof Response) return ctx;
    const auth = await requireCommunicationsAuthority(COMMUNICATIONS_SEND);
    if (!auth.ok) return auth.response;
    const personId = (await params).id?.trim() ?? "";
    if (!UUID_RE.test(personId)) return NextResponse.json({ error: "personId must be a UUID" }, { status: 400 });
    let body: Record<string, unknown>;
    try {
        body = (await req.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const supabase = createAdminClient();
    if (!(await assertRowOrg(supabase, "persons", personId, ctx.orgId)).ok) {
        return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }
    try {
        const result =
            "preferred_channel" in body
                ? await updatePreferredChannel(supabase, { orgId: ctx.orgId, personId, value: typeof body.preferred_channel === "string" ? body.preferred_channel : null })
                : await updatePersonPreference(supabase, {
                      orgId: ctx.orgId,
                      personId,
                      actorUserId: ctx.userId ?? null,
                      field: String(body.field ?? ""),
                      status: String(body.status ?? ""),
                  });
        if (!result.ok) return NextResponse.json({ error: result.message, code: result.code }, { status: result.status });
        return NextResponse.json({ data: result.view });
    } catch (e) {
        console.error("[person preferences] update failed", e instanceof Error ? e.message : e);
        return NextResponse.json({ error: "The preference could not be saved." }, { status: 500 });
    }
}
