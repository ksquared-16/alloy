/**
 * V7-02a against a live database: space uses decide eligibility in the real assignment writer, the
 * configuration validator reads the org's real categories, a ratio stays on classrooms, a room's
 * programs come from the keys the Rooms editor writes, and placement options count the child they
 * are asked about.
 *
 * Distinguished throughout: NEW configured spaces vs EXISTING unconfigured (legacy) spaces, and NEW
 * assignments vs EDITS of existing ones.
 *
 * ISOLATION. Every row carries an id under `P` or hangs off this file's own customer members;
 * teardown deletes exactly those. Skipped unless the cert stack is configured.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createRatioRule } from "@/lib/childcareOperational/config/configRuleAuthoringService";
import { validateSpaceUsesConfiguration } from "@/lib/location/validateSpaceUses";
import { loadSiteOperationalRooms } from "@/lib/operationalAssignments/loadSiteOperationalRooms";
import { createOperationalAssignment } from "@/lib/operationalAssignments/operationalAssignmentService";
import { generatePlacementOptions } from "@/lib/scheduling/options/generatePlacementOptions";

function certEnv(): { url: string; serviceKey: string } | null {
    try {
        const file = readFileSync(resolve(__dirname, "../../../.env.certification.local"), "utf8");
        const read = (key: string) =>
            file.split("\n").find((l) => l.startsWith(`${key}=`))?.slice(key.length + 1).trim() ?? "";
        const url = read("SUPABASE_URL") || read("NEXT_PUBLIC_SUPABASE_URL");
        const serviceKey = read("SUPABASE_SERVICE_ROLE_KEY");
        return url && serviceKey ? { url, serviceKey } : null;
    } catch {
        return null;
    }
}
const env = certEnv();

const ORG = "00000000-0000-4000-8000-000000000001";
const ACTOR = "00000000-0000-4000-8000-0000000000aa";
const P = "ee7a0000-0000-4000-8000-";
const CLASSROOM_CONFIGURED = `${P}0000000000c1`;
const CLASSROOM_LEGACY = `${P}0000000000c2`;
const GYM_CONFIGURED = `${P}0000000000c3`;
const YARD_UNCONFIGURED = `${P}0000000000c4`;
const SHELL = `${P}0000000000c5`;
const CAT_BEFORE = `${P}0000000000a1`;
const CAT_ENRICH = `${P}0000000000a2`;
const PROGRAM_A = `${P}0000000000b1`;
const PROGRAM_B = `${P}0000000000b2`;
const PATTERN = `${P}0000000000d1`;
const AGREEMENT = `${P}0000000000e1`;
const PLACEMENT = `${P}0000000000f1`;
const TODAY = "2026-10-22";
const ROOMS = [CLASSROOM_CONFIGURED, CLASSROOM_LEGACY, GYM_CONFIGURED, YARD_UNCONFIGURED, SHELL];

describe.skipIf(!env)("V7-02a space uses and canonical eligibility, live", () => {
    const db = (env ? createClient(env.url, env.serviceKey, { auth: { persistSession: false } }) : null) as SupabaseClient;
    const members: string[] = [];
    let siteId = "";
    let customerId = "";
    const ok = (r: { error: { message: string } | null }) => expect(r.error, r.error?.message).toBeNull();

    async function cleanup() {
        for (const m of members) await db.from("schedule_assignments").delete().eq("org_id", ORG).eq("customer_member_id", m);
        await db.from("child_placements").delete().eq("id", PLACEMENT);
        await db.from("child_enrollment_agreements").delete().eq("id", AGREEMENT);
        for (const m of members) await db.from("customer_members").delete().eq("id", m);
        await db.from("childcare_ratio_rules").delete().in("room_location_id", ROOMS);
        await db.from("schedule_patterns").delete().eq("id", PATTERN);
        await db.from("locations").delete().in("id", ROOMS);
        await db.from("location_program_categories").delete().in("id", [PROGRAM_A, PROGRAM_B]);
        await db.from("operational_assignment_types").delete().in("id", [CAT_BEFORE, CAT_ENRICH]);
    }

    async function member(): Promise<string> {
        const m = await db
            .from("customer_members")
            .insert({ org_id: ORG, customer_id: customerId, display_name: `v7a space-use fixture ${crypto.randomUUID().slice(0, 6)}` })
            .select("id")
            .single();
        ok(m);
        members.push((m.data as { id: string }).id);
        return (m.data as { id: string }).id;
    }

    const create = (memberId: string, room: string, categoryId: string | null, supersedes?: string) =>
        createOperationalAssignment(db, {
            orgId: ORG,
            subject: { type: "child", customerMemberId: memberId, siteLocationId: siteId },
            schedulePatternId: PATTERN,
            startDate: supersedes ? "2026-11-16" : "2026-11-02",
            roomLocationId: room,
            assignmentTypeId: categoryId,
            isPrimary: false,
            supersedesAssignmentId: supersedes ?? null,
            actorUserId: ACTOR,
            todayYmd: TODAY,
        });

    beforeAll(async () => {
        await cleanup();
        const { data: sites } = await db.from("locations").select("id").eq("org_id", ORG).eq("location_type", "site").limit(1);
        siteId = (sites![0] as { id: string }).id;
        const { data: customers } = await db.from("customers").select("id").eq("org_id", ORG).limit(1);
        customerId = (customers![0] as { id: string }).id;
        ok(await db.from("operational_assignment_types").insert([
            { id: CAT_BEFORE, org_id: ORG, key: "cert_v7a_before_care", label: "V7-A Before Care", subject_types: ["child"] },
            { id: CAT_ENRICH, org_id: ORG, key: "cert_v7a_enrichment", label: "V7-A Enrichment", subject_types: ["child"] },
        ]));
        ok(await db.from("location_program_categories").insert([
            { id: PROGRAM_A, org_id: ORG, location_id: siteId, key: "cert_v7a_toddler", label: "V7-A Toddler", is_active: true },
            { id: PROGRAM_B, org_id: ORG, location_id: siteId, key: "cert_v7a_preschool", label: "V7-A Preschool", is_active: true },
        ]));
        const unit = (id: string, label: string, role: string, metadata: Record<string, unknown>) => ({
            id, org_id: ORG, location_type: "unit", unit_role: role, parent_location_id: siteId, label, is_active: true, metadata,
        });
        ok(await db.from("locations").insert([
            unit(CLASSROOM_CONFIGURED, "V7-A Toddler 2", "operational_group", { space_uses: [CAT_BEFORE], supported_program_keys: ["cert_v7a_toddler", "cert_v7a_preschool"] }),
            unit(CLASSROOM_LEGACY, "V7-A Legacy Room", "operational_group", { supported_program_keys: ["cert_v7a_toddler"] }),
            unit(GYM_CONFIGURED, "V7-A Gym", "shared_space", { space_uses: [CAT_ENRICH] }),
            unit(YARD_UNCONFIGURED, "V7-A Yard", "shared_space", {}),
            unit(SHELL, "V7-A Room 1", "physical_space", {}),
        ]));
        ok(await db.from("schedule_patterns").insert({
            id: PATTERN, org_id: ORG, site_location_id: siteId, key: "cert_v7a_mwf", label: "V7-A MWF", schedule_type_key: "cert_v7a", weekdays: [1, 3, 5],
        }));
    }, 60_000);

    afterAll(async () => {
        await cleanup();
    });

    it("NEW assignments: configured use accepted; unconfigured shared, wrong use and physical refused", async () => {
        const m = await member();
        expect((await create(m, GYM_CONFIGURED, CAT_ENRICH)).room_location_id).toBe(GYM_CONFIGURED);
        await expect(create(m, GYM_CONFIGURED, CAT_BEFORE)).rejects.toMatchObject({ details: { code: "use_not_configured_for_space" } });
        await expect(create(m, YARD_UNCONFIGURED, CAT_ENRICH)).rejects.toMatchObject({ details: { code: "space_uses_not_configured" } });
        await expect(create(m, SHELL, CAT_ENRICH)).rejects.toMatchObject({ details: { code: "physical_space_not_schedulable" } });
        await expect(create(m, CLASSROOM_CONFIGURED, CAT_ENRICH)).rejects.toMatchObject({ details: { code: "use_not_configured_for_space" } });
        expect((await create(m, CLASSROOM_CONFIGURED, CAT_BEFORE)).room_location_id).toBe(CLASSROOM_CONFIGURED);
    });

    it("LEGACY (unconfigured) classroom keeps its pre-V7 eligibility", async () => {
        const m = await member();
        expect((await create(m, CLASSROOM_LEGACY, CAT_ENRICH)).room_location_id).toBe(CLASSROOM_LEGACY);
    });

    it("EDIT of an existing assignment keeping its room and use is never refused by later configuration", async () => {
        const m = await member();
        const existing = await create(m, CLASSROOM_LEGACY, CAT_ENRICH);
        // The space is configured afterwards — without Enrichment.
        ok(await db.from("locations").update({ metadata: { space_uses: [CAT_BEFORE], supported_program_keys: ["cert_v7a_toddler"] } }).eq("id", CLASSROOM_LEGACY));
        const edited = await create(m, CLASSROOM_LEGACY, CAT_ENRICH, existing.id);
        expect(edited.supersedes_assignment_id).toBe(existing.id);
        // …but a NEW Enrichment schedule there is now refused.
        const other = await member();
        await expect(create(other, CLASSROOM_LEGACY, CAT_ENRICH)).rejects.toMatchObject({ details: { code: "use_not_configured_for_space" } });
        ok(await db.from("locations").update({ metadata: { supported_program_keys: ["cert_v7a_toddler"] } }).eq("id", CLASSROOM_LEGACY));
    });

    it("configuration validation reads the org's real categories and the space's structure", async () => {
        expect(await validateSpaceUsesConfiguration(db, ORG, { locationType: "unit", unitRole: "shared_space", metadata: { space_uses: [CAT_ENRICH] } })).toEqual({ ok: true });
        const physical = await validateSpaceUsesConfiguration(db, ORG, { locationType: "unit", unitRole: "physical_space", metadata: { space_uses: [CAT_ENRICH] } });
        expect(physical.ok).toBe(false);
        const unknown = await validateSpaceUsesConfiguration(db, ORG, { locationType: "unit", unitRole: "operational_group", metadata: { space_uses: [`${P}000000000999`] } });
        expect(unknown.ok).toBe(false);
    });

    it("a staffing ratio is refused on a physical or shared space, allowed on a classroom", async () => {
        for (const room of [SHELL, GYM_CONFIGURED]) {
            await expect(
                createRatioRule(db, { orgId: ORG, scopeType: "room", roomLocationId: room, tiers: [{ maxChildren: 5, requiredStaff: 1 }], effectiveStart: "2026-01-01", actorUserId: ACTOR }),
            ).rejects.toMatchObject({ code: "invalid_input" });
        }
        const { rule } = await createRatioRule(db, {
            orgId: ORG, scopeType: "room", roomLocationId: CLASSROOM_CONFIGURED, tiers: [{ maxChildren: 5, requiredStaff: 1 }], effectiveStart: "2026-01-01", actorUserId: ACTOR,
        });
        expect(rule.room_location_id).toBe(CLASSROOM_CONFIGURED);
    });

    it("a room's programs are the keys the Rooms editor writes, resolved at its site", async () => {
        const rooms = await loadSiteOperationalRooms(db, ORG, siteId);
        const toddler2 = rooms.find((r) => r.roomId === CLASSROOM_CONFIGURED)!;
        expect(new Set(toddler2.supportedProgramCategoryIds)).toEqual(new Set([PROGRAM_A, PROGRAM_B]));
        expect(toddler2.programCategoryId).toBeNull(); // two programs imply none
        expect(toddler2.spaceUses).toEqual([CAT_BEFORE]);
        const legacy = rooms.find((r) => r.roomId === CLASSROOM_LEGACY)!;
        expect(legacy.programCategoryId).toBe(PROGRAM_A);
        expect(legacy.spaceUses).toBeNull();
        expect(rooms.find((r) => r.roomId === YARD_UNCONFIGURED)!.supportedProgramCategoryIds).toBeNull();
    });

    it("placement options COUNT the child asked about (lead) and fit by supported programs", async () => {
        const lead = await member();
        const { options } = await generatePlacementOptions(db, {
            orgId: ORG, siteLocationId: siteId, customerMemberId: lead, programCategoryId: PROGRAM_B, patternId: PATTERN,
            dateStart: "2026-11-02", dateEnd: "2026-11-08",
        });
        const t2 = options.find((o) => o.roomId === CLASSROOM_CONFIGURED)!;
        expect(t2.afterPeakOccupancy, "the lead is counted in the room it would join").toBe(t2.beforePeakOccupancy + 1);
        expect(options.some((o) => o.roomId === SHELL || o.roomId === GYM_CONFIGURED)).toBe(false); // placement targets are classrooms
    });

    it("placement options recognise an ENROLLED child by agreement (moving rooms does not double-count)", async () => {
        const m = await member();
        ok(await db.from("child_enrollment_agreements").insert({
            id: AGREEMENT, org_id: ORG, customer_member_id: m, customer_id: customerId, site_location_id: siteId, status: "active", start_date: "2026-09-01",
        }));
        ok(await db.from("child_placements").insert({
            id: PLACEMENT, org_id: ORG, customer_member_id: m, enrollment_agreement_id: AGREEMENT, site_location_id: siteId,
            room_location_id: CLASSROOM_CONFIGURED, program_category_id: PROGRAM_A, start_date: "2026-09-01", status: "active",
        }));
        await createOperationalAssignment(db, {
            orgId: ORG, subject: { type: "child", enrollmentAgreementId: AGREEMENT }, schedulePatternId: PATTERN,
            startDate: "2026-09-01", isPrimary: true, actorUserId: ACTOR, todayYmd: TODAY,
        });
        const { options } = await generatePlacementOptions(db, {
            orgId: ORG, siteLocationId: siteId, customerMemberId: m, programCategoryId: PROGRAM_A, patternId: PATTERN,
            dateStart: "2026-11-02", dateEnd: "2026-11-08",
        });
        const current = options.find((o) => o.roomId === CLASSROOM_CONFIGURED)!;
        const other = options.find((o) => o.roomId === CLASSROOM_LEGACY)!;
        expect(current.afterPeakOccupancy, "staying in the current room adds no one").toBe(current.beforePeakOccupancy);
        expect(other.afterPeakOccupancy, "moving to another room adds the child there").toBe(other.beforePeakOccupancy + 1);
    });
});
