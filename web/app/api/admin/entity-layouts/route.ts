/**
 * Layout V2 — admin API (collection).
 *
 *   GET  /api/admin/entity-layouts                         → all rows for org + defaults (list UI)
 *   GET  /api/admin/entity-layouts?entity_type=&surface=   → resolved layout + candidate rows
 *   POST /api/admin/entity-layouts                         → create a draft (admin only)
 *
 * Foundation only: this endpoint reads/writes the isolated `entity_layouts`
 * table. It does NOT affect any live drawer/queue rendering.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";
import { logAdminAudit } from "@/lib/adminAuth";
import { isLayoutV2PreviewEnabledServer } from "@/lib/layout/featureFlag";
import { isLayoutSurface, type LayoutSurface } from "@/lib/layout/layoutV2";
import { parseLayoutDoc } from "@/lib/layout/layoutV2Schema";
import { resolveLayout } from "@/lib/layout/layoutResolver";
import { layoutDocFromRegistry, ALL_ENTITY_PRESENTATION_TYPES } from "@/lib/layout/migrateFromRegistry";
import { seedLayoutDocFromCurrent } from "@/lib/layout/seedFromCurrentPresentation";
import { buildLeadDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import { buildWaitlistDefaultDoc } from "@/lib/layout/defaultWaitlistLayouts";
import { buildRecordDrawerDefaultDoc } from "@/lib/layout/defaultRecordDrawers";
import { WAITLIST_CANDIDATE_ENTITY_TYPE } from "@/lib/layout/waitlist/waitlistCandidateCardVm";

/** Layout entity types beyond the entityPresentation registry (curated-only). */
const EXTRA_LAYOUT_ENTITY_TYPES: readonly string[] = [WAITLIST_CANDIDATE_ENTITY_TYPE, "person", "child"];
function isAllowedLayoutEntityType(t: string): boolean {
    return (ALL_ENTITY_PRESENTATION_TYPES as readonly string[]).includes(t) || EXTRA_LAYOUT_ENTITY_TYPES.includes(t);
}
import {
    createDraft,
    listAllForOrg,
    listDefaultLayouts,
    listOrgLayouts,
} from "@/lib/layout/entityLayoutsRepo";

const LAYOUT_KEY_REGEX = /^[a-z0-9_]{1,64}$/;

function notFound() {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function GET(request: NextRequest) {
    if (!isLayoutV2PreviewEnabledServer()) return notFound();

    const ctx = await getAdminContext();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    }

    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);
    const entityType = searchParams.get("entity_type")?.trim() || null;
    const surfaceParam = searchParams.get("surface")?.trim() || null;

    try {
        // Resolve mode: needs both entity_type and surface.
        if (entityType && surfaceParam) {
            if (!isLayoutSurface(surfaceParam)) {
                return NextResponse.json({ error: "surface must be drawer|queue" }, { status: 400 });
            }
            const surface = surfaceParam as LayoutSurface;
            const [orgRecords, defaultRecords] = await Promise.all([
                listOrgLayouts(supabase, ctx.orgId, entityType, surface),
                listDefaultLayouts(supabase, entityType, surface),
            ]);
            const resolution = resolveLayout({ entityType, surface, orgRecords, defaultRecords });
            return NextResponse.json({
                resolved: resolution.doc,
                source: resolution.source,
                orgRecords,
                defaultRecords,
            });
        }

        // List mode: everything visible to this org.
        const records = await listAllForOrg(supabase, ctx.orgId);
        return NextResponse.json({
            records,
            entityTypes: ALL_ENTITY_PRESENTATION_TYPES,
            surfaces: ["drawer", "queue"],
        });
    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    if (!isLayoutV2PreviewEnabledServer()) return notFound();

    const ctx = await getAdminContext();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    }
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body: Record<string, unknown> = {};
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const entityType = typeof body.entity_type === "string" ? body.entity_type.trim() : "";
    if (!entityType) return NextResponse.json({ error: "entity_type required" }, { status: 400 });
    // Only entity types known to the registry may have layouts. Prevents
    // creating rows for typos/bogus entities (and a registry-seed for an
    // unknown type would silently yield a near-empty doc).
    if (!isAllowedLayoutEntityType(entityType)) {
        return NextResponse.json({ error: "Unknown entity_type" }, { status: 400 });
    }

    const surfaceRaw = typeof body.surface === "string" ? body.surface.trim() : "";
    if (!isLayoutSurface(surfaceRaw)) {
        return NextResponse.json({ error: "surface must be drawer|queue" }, { status: 400 });
    }
    const surface = surfaceRaw as LayoutSurface;

    const layoutKeyRaw = typeof body.layout_key === "string" ? body.layout_key.trim().toLowerCase() : "default";
    const layoutKey = layoutKeyRaw || "default";
    if (!LAYOUT_KEY_REGEX.test(layoutKey)) {
        return NextResponse.json({ error: "layout_key must be 1–64 chars: a-z, 0-9, _" }, { status: 400 });
    }

    const fromDefault = body.from_registry === true || body.doc === undefined;

    const supabase = createAdminClient();

    // Build the doc. "Create from default" prefers the CURRENT runtime
    // presentation (e.g. the live opportunity drawer / work-unit queue) and
    // falls back to the legacy registry when no newer source exists. A provided
    // doc is validated as-is.
    // seed mode: "lead_default" (curated, recommended) | "runtime" (mirror live)
    const seedMode = body.seed === "runtime" ? "runtime" : "lead_default";

    let doc;
    let seededFrom: string;
    if (fromDefault) {
        const waitlist = buildWaitlistDefaultDoc(entityType, surface);
        const recordDrawer = buildRecordDrawerDefaultDoc(entityType, surface);
        const lead = seedMode === "lead_default" ? buildLeadDefaultDoc(entityType, surface) : null;
        if (waitlist) {
            doc = waitlist;
            seededFrom = "waitlist_default";
        } else if (recordDrawer) {
            doc = recordDrawer;
            seededFrom = `${entityType}_default`;
        } else if (lead) {
            doc = lead;
            seededFrom = "lead_default";
        } else {
            const current = await seedLayoutDocFromCurrent(supabase, ctx.orgId, entityType, surface);
            if (current) {
                doc = current;
                seededFrom = "current_presentation";
            } else {
                doc = layoutDocFromRegistry(entityType as never, surface);
                seededFrom = "registry";
            }
        }
    } else {
        const parsed = parseLayoutDoc(body.doc);
        if (!parsed.ok || !parsed.doc) {
            return NextResponse.json({ error: "Invalid layout doc", details: parsed.errors }, { status: 400 });
        }
        doc = parsed.doc;
        seededFrom = "request";
    }

    const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : `${entityType} ${surface} layout`;

    try {
        const created = await createDraft(supabase, {
            orgId: ctx.orgId,
            entityType,
            surface,
            layoutKey,
            name,
            doc,
            createdBy: ctx.userId,
            metadata: { seededFrom },
        });
        logAdminAudit({
            entity: "entity_layouts",
            id: created.id,
            changed_fields: ["created", `seed:${seededFrom}`],
            actor_user_id: ctx.userId,
            role: ctx.role,
        });
        return NextResponse.json(created, { status: 201 });
    } catch (e) {
        const msg = (e as Error).message;
        if (msg.includes("duplicate key")) {
            return NextResponse.json({ error: "A layout with this key/version already exists" }, { status: 409 });
        }
        return NextResponse.json({ error: msg }, { status: 400 });
    }
}
