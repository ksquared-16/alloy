/**
 * Enrollment Focus Panel Summary — published-doc resolver (runtime read).
 *
 *   GET /api/admin/entity-layouts/focus-panel-summary
 *     → { published: { id, version, doc } | null, draft: { id, version, doc } | null }
 *
 * The operator Focus Panel Summary grid reads the PUBLISHED org doc here and
 * falls back to the code-built default when none exists. The Surfaces editor
 * reads both (draft to continue editing, published as the live baseline). Reuses
 * the isolated `entity_layouts` table; org isolation enforced in code.
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";
import { isLayoutRuntimeReadPathEnabled } from "@/lib/layout/featureFlag";
import { listOrgLayouts } from "@/lib/layout/entityLayoutsRepo";
import type { EntityLayoutRecord } from "@/lib/layout/layoutV2";
import {
    FOCUS_PANEL_SUMMARY_ENTITY_TYPE,
    FOCUS_PANEL_SUMMARY_LAYOUT_KEY,
    FOCUS_PANEL_SUMMARY_SURFACE,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelLayoutDocModel";

function highestVersion(records: EntityLayoutRecord[]): EntityLayoutRecord | null {
    return records.reduce<EntityLayoutRecord | null>(
        (best, r) => (best === null || r.version > best.version ? r : best),
        null,
    );
}

function summarize(record: EntityLayoutRecord | null) {
    if (!record) return null;
    return { id: record.id, version: record.version, doc: record.doc };
}

export async function GET() {
    if (!isLayoutRuntimeReadPathEnabled()) {
        return NextResponse.json({ published: null, draft: null });
    }

    const ctx = await getAdminContext();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status },
        );
    }

    try {
        const supabase = createAdminClient();
        const rows = await listOrgLayouts(
            supabase,
            ctx.orgId,
            FOCUS_PANEL_SUMMARY_ENTITY_TYPE,
            FOCUS_PANEL_SUMMARY_SURFACE,
        );
        const summaryRows = rows.filter((r) => r.layoutKey === FOCUS_PANEL_SUMMARY_LAYOUT_KEY);
        const published = highestVersion(summaryRows.filter((r) => r.status === "published"));
        const draft = highestVersion(summaryRows.filter((r) => r.status === "draft"));
        return NextResponse.json({ published: summarize(published), draft: summarize(draft) });
    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
