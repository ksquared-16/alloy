/**
 * One-off audit: field_definitions for childcare org + dependency checks.
 * Reads web/.env.local for SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 * Run: node scripts/audit-childcare-field-cleanup.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, "..", ".env.local");

function loadEnvLocal(path) {
    const raw = readFileSync(path, "utf8");
    /** @type {Record<string, string>} */
    const out = {};
    for (const line of raw.split("\n")) {
        const t = line.trim();
        if (!t || t.startsWith("#")) continue;
        const i = t.indexOf("=");
        if (i === -1) continue;
        const k = t.slice(0, i).trim();
        let v = t.slice(i + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
            v = v.slice(1, -1);
        }
        out[k] = v;
    }
    return out;
}

const PROMOTE_TARGET = "93667019-bd28-49b5-a688-acc9bb1e0a19";

const FOCUS_KEYS = {
    location: [
        "beds",
        "baths",
        "home_type",
        "square_footage_tier",
        "bedrooms",
        "bathrooms",
        "square_footage",
        "access_method",
    ],
    opportunity: ["specialty_cleaning_type", "preferred_service_date", "specialty_quote_notes"],
};

const ENTITY_TYPES = ["person", "customer", "location", "opportunity", "job", "schedule", "vendor"];

function loadDotenv() {
    const env = loadEnvLocal(envPath);
    const url = env.SUPABASE_URL;
    const key = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in web/.env.local");
        process.exit(1);
    }
    return createClient(url, key, { auth: { persistSession: false } });
}

/** @param {string} json */
function jsonRefsField(json, entityType, fieldKey) {
    if (!json) return false;
    const needles = [
        `"${fieldKey}"`,
        `"key":"${fieldKey}"`,
        `'${fieldKey}'`,
        `${entityType}.${fieldKey}`,
        `location.${fieldKey}`,
        `opportunity.${fieldKey}`,
    ];
    return needles.some((n) => json.includes(n));
}

async function main() {
    const supabase = loadDotenv();

    const { data: industry, error: indErr } = await supabase.from("industries").select("id, key").eq("key", "childcare").maybeSingle();
    if (indErr || !industry) {
        console.error("Could not load industries.key=childcare", indErr);
        process.exit(1);
    }

    const { data: orgs, error: orgErr } = await supabase
        .from("orgs")
        .select("id, name, slug, industry_id")
        .eq("industry_id", industry.id);
    if (orgErr) {
        console.error(orgErr);
        process.exit(1);
    }

    let targetOrg = (orgs ?? []).find((o) => o.id === PROMOTE_TARGET) ?? (orgs ?? [])[0];
    if (!targetOrg) {
        console.error("No org with industry childcare found.");
        process.exit(1);
    }

    const { data: defs, error: fdErr } = await supabase
        .from("field_definitions")
        .select(
            "id, org_id, entity_type, field_key, label, field_type, is_system, is_active, is_required, section_key, sort_order, config"
        )
        .eq("org_id", targetOrg.id)
        .in("entity_type", ENTITY_TYPES)
        .order("entity_type")
        .order("field_key");

    if (fdErr) {
        console.error(fdErr);
        process.exit(1);
    }

    const rows = defs ?? [];
    const defByKey = new Map(rows.map((r) => [`${r.entity_type}.${r.field_key}`, r]));

    const focusDefIds = [];
    for (const [et, keys] of Object.entries(FOCUS_KEYS)) {
        for (const fk of keys) {
            const r = defByKey.get(`${et}.${fk}`);
            if (r) focusDefIds.push(r.id);
        }
    }

    /** field_values for candidate defs */
    let fvByDefId = new Map();
    if (focusDefIds.length > 0) {
        const { data: fvs, error: fvErr } = await supabase
            .from("field_values")
            .select("field_definition_id")
            .eq("org_id", targetOrg.id)
            .in("field_definition_id", focusDefIds);
        if (fvErr) {
            console.error("field_values query", fvErr);
        } else {
            for (const row of fvs ?? []) {
                const id = row.field_definition_id;
                fvByDefId.set(id, (fvByDefId.get(id) ?? 0) + 1);
            }
        }
    }

    const { data: overviewLayouts, error: olErr } = await supabase
        .from("record_overview_layouts")
        .select("id, entity_type, surface, template_key, config")
        .eq("org_id", targetOrg.id);
    if (olErr) console.error("record_overview_layouts", olErr);

    const { data: globalLayouts, error: glErr } = await supabase.from("record_layouts").select("id, entity_type, key, config_json");
    if (glErr) console.error("record_layouts", glErr);

    const { data: workflows, error: wfErr } = await supabase.from("workflows").select("id, name, org_id").eq("org_id", targetOrg.id);
    if (wfErr) console.error("workflows", wfErr);
    const wfIds = (workflows ?? []).map((w) => w.id);

    let actionHits = [];
    let conditionHits = [];
    if (wfIds.length > 0) {
        const { data: actions, error: waErr } = await supabase
            .from("workflow_actions")
            .select("id, workflow_id, action_type, payload")
            .in("workflow_id", wfIds);
        if (waErr) console.error("workflow_actions", waErr);
        else {
            const payloadStr = (a) => JSON.stringify(a.payload ?? {});
            const allFocus = [...FOCUS_KEYS.location.map((k) => ["location", k]), ...FOCUS_KEYS.opportunity.map((k) => ["opportunity", k])];
            for (const a of actions ?? []) {
                const p = payloadStr(a);
                for (const [et, fk] of allFocus) {
                    if (
                        p.includes(`${et}.${fk}`) ||
                        p.includes(`"${fk}"`) ||
                        p.includes(`'${fk}'`) ||
                        p.includes(`{{${et}.${fk}}}`)
                    ) {
                        actionHits.push({ action_id: a.id, workflow_id: a.workflow_id, matched: `${et}.${fk}` });
                    }
                }
            }
        }

        const { data: conds, error: wcErr } = await supabase
            .from("workflow_conditions")
            .select("id, workflow_id, field, operator, value")
            .in("workflow_id", wfIds);
        if (wcErr) console.error("workflow_conditions", wcErr);
        else {
            for (const c of conds ?? []) {
                const f = (c.field ?? "").toLowerCase();
                for (const fk of [...FOCUS_KEYS.location, ...FOCUS_KEYS.opportunity]) {
                    if (f === fk || f.endsWith(`.${fk}`) || f.includes(fk)) {
                        conditionHits.push({
                            condition_id: c.id,
                            workflow_id: c.workflow_id,
                            field: c.field,
                            matched: fk,
                        });
                    }
                }
            }
        }
    }

    /** Overview layout JSON hits (org-scoped) */
    const overviewHits = [];
    for (const layout of overviewLayouts ?? []) {
        const j = JSON.stringify(layout.config ?? {});
        for (const [et, keys] of Object.entries(FOCUS_KEYS)) {
            for (const fk of keys) {
                if (jsonRefsField(j, et, fk)) {
                    overviewHits.push({
                        layout_id: layout.id,
                        entity_type: layout.entity_type,
                        surface: layout.surface,
                        matched: `${et}.${fk}`,
                    });
                }
            }
        }
    }

    /** Global record_layouts (not org-scoped) — flag if key appears anywhere */
    const globalLayoutHits = [];
    for (const layout of globalLayouts ?? []) {
        const j = JSON.stringify(layout.config_json ?? {});
        for (const [et, keys] of Object.entries(FOCUS_KEYS)) {
            for (const fk of keys) {
                if (jsonRefsField(j, et, fk)) {
                    globalLayoutHits.push({
                        layout_id: layout.id,
                        layout_key: layout.key,
                        entity_type: layout.entity_type,
                        matched: `${et}.${fk}`,
                    });
                }
            }
        }
    }

    const out = {
        resolved_org: {
            id: targetOrg.id,
            name: targetOrg.name,
            slug: targetOrg.slug,
            industry_key: "childcare",
            childcare_org_count: (orgs ?? []).length,
            all_childcare_org_ids: (orgs ?? []).map((o) => o.id),
            used_explicit_promote_id: targetOrg.id === PROMOTE_TARGET,
        },
        field_definitions: rows,
        dependency_checks: {
            field_values_counts_for_focus_keys: Object.fromEntries(
                [...defByKey.entries()]
                    .filter(([k]) =>
                        [...FOCUS_KEYS.location.map((fk) => `location.${fk}`), ...FOCUS_KEYS.opportunity.map((fk) => `opportunity.${fk}`)].includes(
                            k
                        )
                    )
                    .map(([k, r]) => [k, fvByDefId.get(r.id) ?? 0])
            ),
            record_overview_layouts_hits: overviewHits,
            record_layouts_global_hits: globalLayoutHits,
            workflow_action_payload_hits: actionHits,
            workflow_condition_hits: conditionHits,
        },
    };

    console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
