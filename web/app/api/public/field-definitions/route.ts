import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serverServiceClient";
import { normalizeOptionsFromConfig } from "@/lib/fields/fieldDefinitionConfig";
import { isCatalogKey } from "@/lib/fields/fieldDefinitionConfig";
import { resolveCatalogOptions } from "@/lib/fields/resolveFieldCatalog";
import { optionSetKeyFromFieldConfig, resolveOptionSetOptions } from "@/lib/fields/resolveOptionSetOptions";

/**
 * GET /api/public/field-definitions?entity_type=location&vertical_slug=cleaning
 * Service role + ALLOY_PUBLIC_ORG_ID. Returns active custom fields flagged for public booking, with section labels and resolved options.
 */
export async function GET(request: NextRequest) {
    try {
        if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
            return NextResponse.json({ ok: false, error: "Server misconfiguration" }, { status: 500 });
        }
        const orgId = process.env.ALLOY_PUBLIC_ORG_ID?.trim();
        if (!orgId) {
            return NextResponse.json({ ok: false, error: "ALLOY_PUBLIC_ORG_ID not set" }, { status: 500 });
        }

        const { searchParams } = new URL(request.url);
        const entityType = searchParams.get("entity_type")?.trim();
        const verticalSlug = searchParams.get("vertical_slug")?.trim() || null;
        const sectionKeysFilter =
            searchParams
                .get("section_keys")
                ?.split(",")
                .map((s) => s.trim())
                .filter(Boolean) ?? null;

        const allowed = ["location", "opportunity", "person", "customer", "job", "vendor", "schedule"];
        if (!entityType || !allowed.includes(entityType)) {
            return NextResponse.json(
                { ok: false, error: `entity_type required; one of: ${allowed.join(", ")}` },
                { status: 400 }
            );
        }

        const supabase = createServiceRoleClient();

        const [{ data: sectionRows, error: secErr }, { data: defRows, error: defErr }] = await Promise.all([
            supabase
                .from("field_section_definitions")
                .select("section_key, label, description, sort_order")
                .eq("org_id", orgId)
                .eq("entity_type", entityType)
                .order("sort_order", { ascending: true }),
            supabase
                .from("field_definitions")
                .select(
                    "id, field_key, field_type, label, description, section_key, sort_order, placeholder, help_text, config, is_required"
                )
                .eq("org_id", orgId)
                .eq("entity_type", entityType)
                .eq("is_active", true)
                .eq("is_visible_in_public_booking", true)
                .order("section_key", { ascending: true })
                .order("sort_order", { ascending: true }),
        ]);

        if (secErr) {
            console.error("[PUBLIC_FIELD_DEFS] sections", secErr.message);
        }
        if (defErr) {
            return NextResponse.json({ ok: false, error: defErr.message }, { status: 500 });
        }

        const sections = (sectionRows ?? []).map((s) => ({
            section_key: String((s as { section_key: string }).section_key),
            label: String((s as { label: string }).label),
            description: (s as { description?: string | null }).description ?? null,
            sort_order: Number((s as { sort_order: number }).sort_order) || 0,
        }));

        const defs = defRows ?? [];
        const fields: unknown[] = [];

        for (const d of defs) {
            const row = d as {
                id: string;
                field_key: string;
                field_type: string;
                label: string;
                description: string | null;
                section_key: string | null;
                sort_order: number;
                placeholder: string | null;
                help_text: string | null;
                config: unknown;
                is_required: boolean;
            };
            if (sectionKeysFilter?.length) {
                const sk = (row.section_key ?? "").trim();
                if (!sectionKeysFilter.includes(sk)) continue;
            }
            const cfg = row.config;
            let options: { value: string; label: string }[] = normalizeOptionsFromConfig(cfg);
            const optSetKey = optionSetKeyFromFieldConfig(cfg);
            if (optSetKey) {
                options = await resolveOptionSetOptions(supabase, orgId, optSetKey);
            }
            const ck =
                cfg &&
                typeof cfg === "object" &&
                !Array.isArray(cfg) &&
                typeof (cfg as Record<string, unknown>).catalog_key === "string"
                    ? String((cfg as Record<string, unknown>).catalog_key).trim()
                    : "";
            if (ck && isCatalogKey(ck)) {
                options = await resolveCatalogOptions(supabase, ck, { verticalSlug, orgId });
            }

            fields.push({
                id: row.id,
                field_key: row.field_key,
                field_type: row.field_type,
                label: row.label,
                description: row.description,
                section_key: row.section_key ?? "custom",
                sort_order: row.sort_order,
                placeholder: row.placeholder,
                help_text: row.help_text,
                is_required: row.is_required,
                options,
            });
        }

        return NextResponse.json({ ok: true, entity_type: entityType, sections, fields });
    } catch (e) {
        console.error("[PUBLIC_FIELD_DEFS]", e);
        return NextResponse.json(
            { ok: false, error: e instanceof Error ? e.message : "failed" },
            { status: 500 }
        );
    }
}
