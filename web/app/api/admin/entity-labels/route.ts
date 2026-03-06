import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";
import { getOrgConfigLocked } from "@/lib/admin/getOrgConfigLocked";

type LabelRow = { entity_type: string; singular: string | null; plural: string | null };

/** GET: effective labels for org (industry defaults + overrides). Admin + ops can read. */
export async function GET() {
    const ctx = await getAdminContext();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status }
        );
    }

    const supabase = createAdminClient();

    const { data: orgRow } = await supabase
        .from("orgs")
        .select("industry_id")
        .eq("id", ctx.orgId)
        .maybeSingle();

    const industryId = (orgRow as { industry_id?: string } | null)?.industry_id ?? null;

    let industry: { key: string; label: string } | null = null;
    let defaultIndustryId: string | null = industryId;

    if (industryId) {
        const { data: ind } = await supabase
            .from("industries")
            .select("key, label")
            .eq("id", industryId)
            .eq("is_active", true)
            .maybeSingle();
        if (ind) {
            industry = { key: (ind as { key: string }).key, label: (ind as { label: string }).label };
        }
    }

    if (!defaultIndustryId) {
        const { data: generic } = await supabase
            .from("industries")
            .select("id, key, label")
            .eq("key", "generic")
            .eq("is_active", true)
            .maybeSingle();
        if (generic) {
            defaultIndustryId = (generic as { id: string }).id;
            industry = {
                key: (generic as { key: string }).key,
                label: (generic as { label: string }).label,
            };
        }
    }

    const defaults: LabelRow[] = [];
    if (defaultIndustryId) {
        const { data: defaultRows } = await supabase
            .from("industry_default_entity_labels")
            .select("entity_type, singular, plural")
            .eq("industry_id", defaultIndustryId)
            .order("entity_type", { ascending: true });
        if (defaultRows) {
            for (const r of defaultRows as { entity_type: string; singular: string | null; plural: string | null }[]) {
                defaults.push({
                    entity_type: r.entity_type,
                    singular: r.singular ?? null,
                    plural: r.plural ?? null,
                });
            }
        }
    }

    const { data: overrideRows } = await supabase
        .from("entity_labels")
        .select("entity_type, singular, plural")
        .eq("org_id", ctx.orgId)
        .order("entity_type", { ascending: true });

    const overrides: LabelRow[] = (overrideRows ?? []).map((r) => ({
        entity_type: (r as { entity_type: string }).entity_type,
        singular: (r as { singular: string | null }).singular ?? null,
        plural: (r as { plural: string | null }).plural ?? null,
    }));

    const overrideByType: Record<string, LabelRow> = {};
    for (const o of overrides) overrideByType[o.entity_type] = o;

    const effective: LabelRow[] = defaults.map((d) => {
        const ov = overrideByType[d.entity_type];
        return {
            entity_type: d.entity_type,
            singular: ov?.singular ?? d.singular,
            plural: ov?.plural ?? d.plural,
        };
    });

    return NextResponse.json({
        org_industry_id: industryId,
        industry,
        defaults,
        overrides,
        effective,
    });
}

/** PUT: upsert or clear override for one entity_type. Admin only. Blocked when config is locked. */
export async function PUT(request: NextRequest) {
    const ctx = await getAdminContext();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status }
        );
    }
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const locked = await getOrgConfigLocked(ctx.orgId);
    if (locked) {
        return NextResponse.json(
            { error: "Configuration is locked. Unlock in Entity Labels / Industry settings to change labels." },
            { status: 403 }
        );
    }

    let body: { entity_type?: string; singular?: string; plural?: string } = {};
    try {
        body = (await request.json()) as typeof body;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const entity_type = typeof body.entity_type === "string" ? body.entity_type.trim() : "";
    if (!entity_type) {
        return NextResponse.json({ error: "entity_type is required" }, { status: 400 });
    }

    const singular = typeof body.singular === "string" ? body.singular.trim() : "";
    const plural = typeof body.plural === "string" ? body.plural.trim() : "";
    const blank = !singular && !plural;

    const supabase = createAdminClient();

    if (blank) {
        const { error: delErr } = await supabase
            .from("entity_labels")
            .delete()
            .eq("org_id", ctx.orgId)
            .eq("entity_type", entity_type);
        if (delErr) {
            return NextResponse.json({ error: delErr.message }, { status: 500 });
        }
        return NextResponse.json({ ok: true });
    }

    const { error: upsertErr } = await supabase.from("entity_labels").upsert(
        {
            org_id: ctx.orgId,
            entity_type,
            singular: singular || null,
            plural: plural || null,
        },
        { onConflict: "org_id,entity_type" }
    );

    if (upsertErr) {
        return NextResponse.json({ error: upsertErr.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
}

/** DELETE: remove override for entity_type. Admin only. Blocked when config is locked. */
export async function DELETE(request: NextRequest) {
    const ctx = await getAdminContext();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status }
        );
    }
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const locked = await getOrgConfigLocked(ctx.orgId);
    if (locked) {
        return NextResponse.json(
            { error: "Configuration is locked. Unlock in Entity Labels / Industry settings to change labels." },
            { status: 403 }
        );
    }

    const entity_type = request.nextUrl.searchParams.get("entity_type")?.trim();
    if (!entity_type) {
        return NextResponse.json({ error: "entity_type is required" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { error } = await supabase
        .from("entity_labels")
        .delete()
        .eq("org_id", ctx.orgId)
        .eq("entity_type", entity_type);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
}
