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

const ORG_ID = process.env.ORG_ID || "93667019-bd28-49b5-a688-acc9bb1e0a19";

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

async function main() {
  const env = loadEnvLocal(".env.local");
  const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const created = {};
  const add = (table, id) => {
    if (!created[table]) created[table] = [];
    created[table].push(id);
  };

  // --- Lookup field_definition ids we need (do NOT modify field_definitions)
  const neededOppKeys = [
    "desired_start_date",
    "program_type",
    "schedule_type",
    "inquiry_source",
    "tour_date",
    "follow_up_notes",
  ];
  const neededLocKeys = ["classroom_age_group", "room_schedule_type"];

  const [oppDefsRes, locDefsRes] = await Promise.all([
    sb
      .from("field_definitions")
      .select("id, field_key, field_type")
      .eq("org_id", ORG_ID)
      .eq("entity_type", "opportunity")
      .in("field_key", neededOppKeys),
    sb
      .from("field_definitions")
      .select("id, field_key, field_type")
      .eq("org_id", ORG_ID)
      .eq("entity_type", "location")
      .in("field_key", neededLocKeys),
  ]);
  if (oppDefsRes.error) throw new Error(`field_definitions(opportunity) failed: ${oppDefsRes.error.message}`);
  if (locDefsRes.error) throw new Error(`field_definitions(location) failed: ${locDefsRes.error.message}`);

  const oppDefByKey = new Map((oppDefsRes.data ?? []).map((d) => [d.field_key, d]));
  const locDefByKey = new Map((locDefsRes.data ?? []).map((d) => [d.field_key, d]));
  for (const k of neededOppKeys) {
    if (!oppDefByKey.get(k)) throw new Error(`Missing opportunity field_definition: ${k}`);
  }
  for (const k of neededLocKeys) {
    if (!locDefByKey.get(k)) throw new Error(`Missing location field_definition: ${k}`);
  }

  // --- 1) Customer / Family
  const { data: custRow, error: custErr } = await sb
    .from("customers")
    .insert({
      org_id: ORG_ID,
      name: "Parker Family",
      status: "active",
      metadata: { demo_seed: "childcare_one_scenario_v1" },
    })
    .select("id")
    .single();
  if (custErr) throw new Error(`customers insert failed: ${custErr.message}`);
  const customerId = custRow.id;
  add("customers", customerId);

  // --- 2) Parent/guardian persons
  const insertPerson = async (first, last, email, dob) => {
    const row = {
      org_id: ORG_ID,
      first_name: first,
      last_name: last,
      email,
      metadata: { demo_seed: "childcare_one_scenario_v1" },
    };
    if (dob) row.date_of_birth = dob;
    const { data, error } = await sb.from("persons").insert(row).select("id").single();
    if (error) throw new Error(`persons insert failed (${first} ${last}): ${error.message}`);
    add("persons", data.id);
    return data.id;
  };

  const sarahId = await insertPerson(
    "Sarah",
    "Parker",
    `sarah.parker.${ORG_ID.slice(0, 8)}@invalid.local`,
    null
  );
  const jamesId = await insertPerson(
    "James",
    "Parker",
    `james.parker.${ORG_ID.slice(0, 8)}@invalid.local`,
    null
  );

  // --- 3) Child persons
  const emmaId = await insertPerson("Emma", "Parker", null, "2021-08-15");
  const noahId = await insertPerson("Noah", "Parker", null, "2023-11-10");

  // --- 4) Customer-person links (adults)
  const { error: cpErr1 } = await sb.from("customer_persons").insert({
    org_id: ORG_ID,
    customer_id: customerId,
    person_id: sarahId,
    role_type: "primary_contact",
    is_primary: true,
    metadata: { demo_seed: "childcare_one_scenario_v1" },
  });
  if (cpErr1) throw new Error(`customer_persons insert Sarah failed: ${cpErr1.message}`);
  add("customer_persons", "sarah");

  const { error: cpErr2 } = await sb.from("customer_persons").insert({
    org_id: ORG_ID,
    customer_id: customerId,
    person_id: jamesId,
    role_type: "guardian",
    is_primary: false,
    metadata: { demo_seed: "childcare_one_scenario_v1" },
  });
  if (cpErr2) throw new Error(`customer_persons insert James failed: ${cpErr2.message}`);
  add("customer_persons", "james");

  // --- 5) Customer member rows for children (canonical child list)
  const insertMember = async (personId, displayName, dob) => {
    const { data, error } = await sb
      .from("customer_members")
      .insert({
        org_id: ORG_ID,
        customer_id: customerId,
        person_id: personId,
        display_name: displayName,
        relationship: "child",
        dob,
        is_active: true,
        metadata: { demo_seed: "childcare_one_scenario_v1" },
      })
      .select("id")
      .single();
    if (error) throw new Error(`customer_members insert failed (${displayName}): ${error.message}`);
    add("customer_members", data.id);
    return data.id;
  };

  const emmaMemberId = await insertMember(emmaId, "Emma Parker", "2021-08-15");
  const noahMemberId = await insertMember(noahId, "Noah Parker", "2023-11-10");

  // --- 6) Person relationships
  const rels = [
    { from: sarahId, to: emmaId, type: "parent" },
    { from: sarahId, to: noahId, type: "parent" },
    { from: jamesId, to: emmaId, type: "guardian" },
    { from: jamesId, to: noahId, type: "guardian" },
  ];
  for (const r of rels) {
    const { error } = await sb.from("person_relationships").insert({
      org_id: ORG_ID,
      from_person_id: r.from,
      to_person_id: r.to,
      relationship_type: r.type,
      is_primary: true,
      metadata: { demo_seed: "childcare_one_scenario_v1" },
    });
    if (error) throw new Error(`person_relationships insert failed: ${error.message}`);
  }
  add("person_relationships", "4");

  // --- 7) Center/site location
  const { data: centerRow, error: centerErr } = await sb
    .from("locations")
    .insert({
      org_id: ORG_ID,
      customer_id: customerId,
      location_type: "site",
      label: "BrightStart Learning Center",
      is_primary: true,
      is_active: true,
      metadata: { demo_seed: "childcare_one_scenario_v1" },
    })
    .select("id")
    .single();
  if (centerErr) throw new Error(`locations insert center failed: ${centerErr.message}`);
  const centerId = centerRow.id;
  add("locations", centerId);

  // --- 8) Classroom/unit locations under center
  const insertClassroom = async (label) => {
    const { data, error } = await sb
      .from("locations")
      .insert({
        org_id: ORG_ID,
        customer_id: customerId,
        location_type: "unit",
        parent_location_id: centerId,
        label,
        is_primary: false,
        is_active: true,
        metadata: { demo_seed: "childcare_one_scenario_v1" },
      })
      .select("id")
      .single();
    if (error) throw new Error(`locations insert classroom failed (${label}): ${error.message}`);
    add("locations", data.id);
    return data.id;
  };

  const preschoolRoomId = await insertClassroom("Preschool Room A");
  const toddlerRoomId = await insertClassroom("Toddler Room B");

  // Classroom field_values (offered program/schedule)
  const locAgeDef = locDefByKey.get("classroom_age_group");
  const locSchedDef = locDefByKey.get("room_schedule_type");
  const fvLocRows = [
    // Preschool Room A
    {
      org_id: ORG_ID,
      field_definition_id: locAgeDef.id,
      entity_type: "location",
      entity_id: preschoolRoomId,
      value_text: "preschool",
    },
    {
      org_id: ORG_ID,
      field_definition_id: locSchedDef.id,
      entity_type: "location",
      entity_id: preschoolRoomId,
      value_text: "full_time",
    },
    // Toddler Room B
    {
      org_id: ORG_ID,
      field_definition_id: locAgeDef.id,
      entity_type: "location",
      entity_id: toddlerRoomId,
      value_text: "toddler",
    },
    {
      org_id: ORG_ID,
      field_definition_id: locSchedDef.id,
      entity_type: "location",
      entity_id: toddlerRoomId,
      value_text: "part_time",
    },
  ];

  const { error: fvLocErr } = await sb.from("field_values").insert(fvLocRows);
  if (fvLocErr) throw new Error(`field_values insert (locations) failed: ${fvLocErr.message}`);
  add("field_values", "locations:4");

  // --- 9) Opportunity / Inquiry linked to family + primary contact + center
  // OPPORTUNITY_WRITE_NORMALIZATION (bypass): Plain `.mjs` seed — row is person-first by construction
  // (`primary_person_id: sarahId`, no `primary_contact_id`). Cannot import `normalizeOpportunityWritePayload`
  // from TypeScript here; parity with `web/scripts/seedEnrollmentPipelineDemoData.ts` which calls normalization.
  const { data: oppRow, error: oppErr } = await sb
    .from("opportunities")
    .insert({
      org_id: ORG_ID,
      customer_id: customerId,
      primary_person_id: sarahId,
      location_id: centerId,
      name: "Parker Family Inquiry",
      status_key: "new_inquiry",
      metadata: { demo_seed: "childcare_one_scenario_v1" },
    })
    .select("id")
    .single();
  if (oppErr) throw new Error(`opportunities insert failed: ${oppErr.message}`);
  const opportunityId = oppRow.id;
  add("opportunities", opportunityId);

  // Opportunity field_values (Inquiry data)
  const today = new Date();
  const desiredStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 30));
  const tourDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 10));

  const fvOppRows = [
    {
      org_id: ORG_ID,
      field_definition_id: oppDefByKey.get("inquiry_source").id,
      entity_type: "opportunity",
      entity_id: opportunityId,
      value_text: "website",
    },
    {
      org_id: ORG_ID,
      field_definition_id: oppDefByKey.get("desired_start_date").id,
      entity_type: "opportunity",
      entity_id: opportunityId,
      value_date: isoDate(desiredStart),
    },
    {
      org_id: ORG_ID,
      field_definition_id: oppDefByKey.get("program_type").id,
      entity_type: "opportunity",
      entity_id: opportunityId,
      value_text: "preschool",
    },
    {
      org_id: ORG_ID,
      field_definition_id: oppDefByKey.get("schedule_type").id,
      entity_type: "opportunity",
      entity_id: opportunityId,
      value_text: "full_time",
    },
    {
      org_id: ORG_ID,
      field_definition_id: oppDefByKey.get("tour_date").id,
      entity_type: "opportunity",
      entity_id: opportunityId,
      value_date: isoDate(tourDate),
    },
    {
      org_id: ORG_ID,
      field_definition_id: oppDefByKey.get("follow_up_notes").id,
      entity_type: "opportunity",
      entity_id: opportunityId,
      value_text:
        "Family is evaluating care for both children. Preschool spot likely available; toddler may need waitlist.",
    },
  ];
  const { error: fvOppErr } = await sb.from("field_values").insert(fvOppRows);
  if (fvOppErr) throw new Error(`field_values insert (opportunity) failed: ${fvOppErr.message}`);
  add("field_values", "opportunity:6");

  // --- 10) Opportunity-customer-member links for both children (overrides + outcomes)
  const { error: ocmErr } = await sb.from("opportunity_customer_members").insert([
    {
      org_id: ORG_ID,
      opportunity_id: opportunityId,
      customer_member_id: emmaMemberId,
      desired_program_type: "preschool",
      desired_schedule_type: "full_time",
      outcome_status_key: "interested",
      notes: "Preschool spot likely available.",
      metadata: { demo_seed: "childcare_one_scenario_v1" },
    },
    {
      org_id: ORG_ID,
      opportunity_id: opportunityId,
      customer_member_id: noahMemberId,
      desired_program_type: "toddler",
      desired_schedule_type: "part_time",
      outcome_status_key: "waitlisted",
      notes: "Toddler availability tight; likely waitlist.",
      metadata: { demo_seed: "childcare_one_scenario_v1" },
    },
  ]);
  if (ocmErr) throw new Error(`opportunity_customer_members insert failed: ${ocmErr.message}`);
  add("opportunity_customer_members", "2");

  // --- Verification (DB-backed): show what the resolver should expose in _inquiry_children
  const verifySqlLike = await Promise.all([
    sb
      .from("opportunity_customer_members")
      .select(
        "id, customer_member_id, desired_program_type, desired_schedule_type, outcome_status_key, notes, customer_members:customer_member_id(id,display_name,dob,person_id)"
      )
      .eq("org_id", ORG_ID)
      .eq("opportunity_id", opportunityId)
      .order("created_at", { ascending: true }),
    sb
      .from("status_definitions")
      .select("status_key,status_label")
      .eq("org_id", ORG_ID)
      .eq("entity_type", "opportunity_customer_members")
      .eq("is_active", true),
  ]);

  const links = verifySqlLike[0];
  if (links.error) throw new Error(`verify links failed: ${links.error.message}`);
  const sd = verifySqlLike[1];
  if (sd.error) throw new Error(`verify status_definitions failed: ${sd.error.message}`);
  const sdMap = new Map((sd.data ?? []).map((r) => [r.status_key, r.status_label]));

  const verify = (links.data ?? []).map((r) => ({
    link_id: r.id,
    child: r.customer_members?.display_name ?? null,
    dob: r.customer_members?.dob ?? null,
    desired_program_type: r.desired_program_type ?? null,
    desired_schedule_type: r.desired_schedule_type ?? null,
    outcome_status_key: r.outcome_status_key ?? null,
    outcome_status_label: r.outcome_status_key ? (sdMap.get(r.outcome_status_key) ?? null) : null,
    notes: r.notes ?? null,
  }));

  const output = {
    org_id: ORG_ID,
    created_rows_by_table: Object.fromEntries(
      Object.entries(created).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0])
    ),
    ids: {
      customer_id: customerId,
      sarah_person_id: sarahId,
      james_person_id: jamesId,
      emma_person_id: emmaId,
      noah_person_id: noahId,
      emma_customer_member_id: emmaMemberId,
      noah_customer_member_id: noahMemberId,
      center_location_id: centerId,
      preschool_room_location_id: preschoolRoomId,
      toddler_room_location_id: toddlerRoomId,
      opportunity_id: opportunityId,
    },
    field_values_inserted: {
      location: fvLocRows.length,
      opportunity: fvOppRows.length,
    },
    inquiry_children_verify: verify,
    review_paths: {
      admin_opportunities: "/admin/opportunities",
      admin_customers: "/admin/customers",
      adminv2_settings_relationships: "/adminV2/settings/relationships",
    },
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch((e) => {
  console.error(String(e?.stack ?? e));
  process.exitCode = 1;
});

