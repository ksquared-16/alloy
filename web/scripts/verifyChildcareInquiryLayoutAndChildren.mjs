import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

function loadEnvLocal(path) {
  const raw = readFileSync(path, "utf8");
  const out = {};
  for (const line of raw.split("\n")) {
    const l = line.trim();
    if (!l || l.startsWith("#")) continue;
    const i = l.indexOf("=");
    if (i <= 0) continue;
    const k = l.slice(0, i).trim();
    const v = l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    out[k] = v;
  }
  return out;
}

const env = loadEnvLocal(".env.local");
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const orgId = process.env.ORG_ID || "93667019-bd28-49b5-a688-acc9bb1e0a19";

async function main() {
  const results = {
    orgId,
    drawerLayout: { ok: false, details: null },
    inquiryChildrenPayload: { ok: false, details: null },
    missingSeed: null,
  };

  // 1) Effective opportunity drawer layout includes inquiry_children
  const { data: orgLayoutRow, error: orgLayErr } = await sb
    .from("record_drawer_layouts")
    .select("config_json")
    .eq("org_id", orgId)
    .eq("entity_type", "opportunity")
    .eq("surface", "drawer")
    .eq("key", "default")
    .eq("is_active", true)
    .maybeSingle();
  if (orgLayErr) throw new Error(`record_drawer_layouts query failed: ${orgLayErr.message}`);
  const order =
    orgLayoutRow && typeof orgLayoutRow.config_json === "object"
      ? orgLayoutRow.config_json?.overview_section_order
      : null;
  const hasInquiryChildren = Array.isArray(order) && order.includes("inquiry_children");
  results.drawerLayout = {
    ok: Boolean(hasInquiryChildren),
    details: { overview_section_order: Array.isArray(order) ? order : null },
  };

  // 2) Opportunity payload includes _inquiry_children with outcome keys/labels when linked rows exist
  const { data: anyLinkRows, error: linkErr } = await sb
    .from("opportunity_customer_members")
    .select("id, opportunity_id, customer_member_id, outcome_status_key")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (linkErr) {
    // Table may not exist yet if migration not applied.
    results.inquiryChildrenPayload = { ok: false, details: { error: linkErr.message } };
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  const link = Array.isArray(anyLinkRows) && anyLinkRows.length ? anyLinkRows[0] : null;
  if (!link?.opportunity_id) {
    results.inquiryChildrenPayload = {
      ok: false,
      details: { reason: "no_opportunity_customer_members_rows" },
    };
    results.missingSeed = {
      minimal_steps: [
        "Create a customer_members child row for a family/customer.",
        "Insert one opportunity_customer_members row linking an opportunity_id + that customer_member_id (same org/customer).",
        "Set outcome_status_key on the link to any configured status_definitions key for entity_type='opportunity_customer_members' (optional).",
      ],
      example_sql: [
        "-- Find an opportunity + its customer_id",
        "SELECT id, customer_id FROM public.opportunities WHERE org_id = '<org>'::uuid ORDER BY created_at DESC LIMIT 1;",
        "",
        "-- Find a child member for that customer (or create one first)",
        "SELECT id, customer_id, display_name FROM public.customer_members WHERE org_id = '<org>'::uuid AND customer_id = '<customer>'::uuid LIMIT 5;",
        "",
        "-- Link child to inquiry",
        "INSERT INTO public.opportunity_customer_members (org_id, opportunity_id, customer_member_id, outcome_status_key)",
        "VALUES ('<org>'::uuid, '<opp>'::uuid, '<member>'::uuid, 'interested');",
      ].join("\n"),
    };
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  const oppId = link.opportunity_id;
  const { data: oppRow, error: oppErr } = await sb
    .from("opportunities")
    .select("id, org_id, customer_id, program_type, schedule_type")
    .eq("org_id", orgId)
    .eq("id", oppId)
    .maybeSingle();
  if (oppErr || !oppRow) throw new Error(`opportunity fetch failed: ${oppErr?.message ?? "not found"}`);

  // Simulate the resolver behavior: ensure linked children rows exist + attempt label resolution.
  // (We don't hit Next routes here; we validate DB + resolvability.)
  const { data: children, error: kidsErr } = await sb
    .from("opportunity_customer_members")
    .select("id, customer_member_id, desired_program_type, desired_schedule_type, outcome_status_key, fit_status, notes")
    .eq("org_id", orgId)
    .eq("opportunity_id", oppId);
  if (kidsErr) throw new Error(`opportunity_customer_members fetch failed: ${kidsErr.message}`);

  const first = (children ?? [])[0] ?? null;
  const okHasKeys =
    first &&
    Object.prototype.hasOwnProperty.call(first, "outcome_status_key") &&
    Object.prototype.hasOwnProperty.call(first, "desired_program_type") &&
    Object.prototype.hasOwnProperty.call(first, "desired_schedule_type");

  let outcomeLabel = null;
  if (first?.outcome_status_key) {
    const { data: sd, error: sdErr } = await sb
      .from("status_definitions")
      .select("status_label")
      .eq("org_id", orgId)
      .eq("entity_type", "opportunity_customer_members")
      .eq("status_key", first.outcome_status_key)
      .eq("is_active", true)
      .maybeSingle();
    if (sdErr) throw new Error(`status_definitions lookup failed: ${sdErr.message}`);
    outcomeLabel = sd?.status_label ?? null;
  }

  results.inquiryChildrenPayload = {
    ok: Boolean(okHasKeys) && (first?.outcome_status_key ? Boolean(outcomeLabel) : true),
    details: {
      opportunity_id: oppId,
      linked_children_count: Array.isArray(children) ? children.length : 0,
      sample: first
        ? {
            outcome_status_key: first.outcome_status_key ?? null,
            outcome_status_label: outcomeLabel,
          }
        : null,
    },
  };

  console.log(JSON.stringify(results, null, 2));
}

main().catch((e) => {
  console.error(String(e?.stack ?? e));
  process.exitCode = 1;
});

