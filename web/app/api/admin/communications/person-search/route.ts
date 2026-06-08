import { NextRequest, NextResponse } from "next/server";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabaseAdmin";

const UUID_RE = /^[0-9a-f-]{36}$/i;

/** Avoid breaking PostgREST `or=(...)` parsing and accidental LIKE wildcards. */
function sanitizeSearchToken(s: string): string {
    return s.replace(/[%_,\\()."]/g, " ").replace(/\s+/g, " ").trim().slice(0, 64);
}

/**
 * GET /api/admin/communications/person-search?q= — org-scoped persons for quick-message picker (person-first).
 * Bounded list; no contacts table.
 */
export async function GET(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const rawQ = request.nextUrl.searchParams.get("q")?.trim() ?? "";
    const token = sanitizeSearchToken(rawQ);
    if (token.length < 2 && !UUID_RE.test(rawQ)) {
        return NextResponse.json({ error: "q must be at least 2 characters, or a full person UUID" }, { status: 400 });
    }

    const supabase = createAdminClient();

    if (UUID_RE.test(rawQ)) {
        const { data, error } = await supabase
            .from("persons")
            .select("id, first_name, last_name, full_name, email, phone")
            .eq("org_id", ctx.orgId)
            .eq("id", rawQ)
            .maybeSingle();
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        if (!data) return NextResponse.json({ persons: [] });
        const p = data as {
            id: string;
            first_name?: string | null;
            last_name?: string | null;
            full_name?: string | null;
            email?: string | null;
            phone?: string | null;
        };
        return NextResponse.json({
            persons: [
                {
                    person_id: p.id,
                    display_name: labelPerson(p),
                    email: p.email?.trim() || null,
                    phone: p.phone?.trim() || null,
                    has_email: !!(p.email && p.email.includes("@")),
                    has_phone: (p.phone?.replace(/\D/g, "").length ?? 0) >= 10,
                },
            ],
        });
    }

    const pattern = `%${token}%`;
    const sel = "id, first_name, last_name, full_name, email, phone";
    const q = () => supabase.from("persons").select(sel).eq("org_id", ctx.orgId).limit(20);

    const [fn, sn, ln, em, ph] = await Promise.all([
        q().ilike("full_name", pattern),
        q().ilike("first_name", pattern),
        q().ilike("last_name", pattern),
        q().ilike("email", pattern),
        q().ilike("phone", pattern),
    ]);
    const firstErr = fn.error ?? sn.error ?? ln.error ?? em.error ?? ph.error;
    if (firstErr) return NextResponse.json({ error: firstErr.message }, { status: 500 });

    const byId = new Map<
        string,
        {
            id: string;
            first_name?: string | null;
            last_name?: string | null;
            full_name?: string | null;
            email?: string | null;
            phone?: string | null;
        }
    >();
    for (const batch of [fn.data, sn.data, ln.data, em.data, ph.data]) {
        for (const row of (batch ?? []) as {
            id: string;
            first_name?: string | null;
            last_name?: string | null;
            full_name?: string | null;
            email?: string | null;
            phone?: string | null;
        }[]) {
            if (row?.id) byId.set(String(row.id), row);
        }
    }

    const merged = [...byId.values()].sort((a, b) => {
        const la = labelPerson(a).toLowerCase();
        const lb = labelPerson(b).toLowerCase();
        const c = la.localeCompare(lb);
        return c !== 0 ? c : String(a.id).localeCompare(String(b.id));
    });
    const slice = merged.slice(0, 20);

    const persons = slice.map((p) => ({
        person_id: p.id,
        display_name: labelPerson(p),
        email: p.email?.trim() || null,
        phone: p.phone?.trim() || null,
        has_email: !!(p.email && String(p.email).includes("@")),
        has_phone: (p.phone?.replace(/\D/g, "").length ?? 0) >= 10,
    }));

    return NextResponse.json({ persons });
}

function labelPerson(p: {
    full_name?: string | null;
    first_name?: string | null;
    last_name?: string | null;
}): string {
    const fn = (p.full_name ?? "").trim();
    if (fn) return fn;
    const a = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
    return a || "—";
}
