/**
 * V7-03 against a live database: derived homerooms from real assignments written by the real
 * writer and real triggers, on real dates. The scheduling projection (what the Focus Panel reads)
 * and the roster derive the SAME set; deriving writes nothing; the Homeroom meaning is set through
 * the category authoring service, including for a category an org created itself.
 *
 * ISOLATION. Every row carries an id under `P` or hangs off this file's own customer members;
 * teardown deletes exactly those. Skipped unless the cert stack is configured.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createOperationalAssignment } from "@/lib/operationalAssignments/operationalAssignmentService";
import { createOrgAssignmentType, updateOrgAssignmentType } from "@/lib/operationalAssignments/assignmentTypeService";
import { loadSchedulingProjectionsForChildren } from "@/lib/scheduling/projection/buildSchedulingProjection";
import { buildAssignmentRosterReadModel } from "@/lib/scheduling/roster/buildAssignmentRosterReadModel";

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
const P = "ee7a0300-0000-4000-8000-";
const T2 = `${P}0000000000c1`;
const T3 = `${P}0000000000c2`;
const LEGACY = `${P}0000000000c3`;
const GYM = `${P}0000000000c4`;
const CAT_ENRICH = `${P}0000000000a2`;
const PATTERN = `${P}0000000000d1`;
const ROOMS = [T2, T3, LEGACY, GYM];

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const TODAY = ymd(new Date());
const plus = (days: number) => ymd(new Date(Date.parse(`${TODAY}T00:00:00Z`) + days * 86_400_000));
const PAST = plus(-40);
const MOVE = plus(20);

describe.skipIf(!env)("V7-03 derived homerooms, live", () => {
    const db = (env ? createClient(env.url, env.serviceKey, { auth: { persistSession: false } }) : null) as SupabaseClient;
    const members: string[] = [];
    const agreements: string[] = [];
    let siteId = "";
    let customerId = "";
    let homeCategory = "";
    const ok = (r: { error: { message: string } | null }) => expect(r.error, r.error?.message).toBeNull();

    async function cleanup() {
        const { data: own } = await db.from("customer_members").select("id").eq("org_id", ORG).like("display_name", "v7-03 homeroom fixture %");
        const ids = [...new Set([...members, ...((own ?? []) as { id: string }[]).map((m) => m.id)])];
        for (const m of ids) await db.from("schedule_assignments").delete().eq("org_id", ORG).eq("customer_member_id", m);
        for (const m of ids) await db.from("child_placements").delete().eq("org_id", ORG).eq("customer_member_id", m);
        for (const m of ids) await db.from("child_enrollment_agreements").delete().eq("org_id", ORG).eq("customer_member_id", m);
        for (const m of ids) await db.from("customer_members").delete().eq("id", m);
        await db.from("schedule_patterns").delete().eq("id", PATTERN);
        await db.from("locations").delete().in("id", ROOMS);
        await db.from("operational_assignment_types").delete().eq("org_id", ORG).like("label", "V7-03 %");
        await db.from("operational_assignment_types").delete().eq("id", CAT_ENRICH);
    }

    /** A child enrolled at the site: member + agreement (+ optional placement). */
    async function enrolledChild(placementRoom?: string): Promise<{ member: string; agreement: string }> {
        const m = await db.from("customer_members").insert({ org_id: ORG, customer_id: customerId, display_name: `v7-03 homeroom fixture ${crypto.randomUUID().slice(0, 6)}` }).select("id").single();
        ok(m);
        const member = (m.data as { id: string }).id;
        members.push(member);
        const a = await db.from("child_enrollment_agreements").insert({ org_id: ORG, customer_member_id: member, customer_id: customerId, site_location_id: siteId, status: "active", start_date: PAST }).select("id").single();
        ok(a);
        const agreement = (a.data as { id: string }).id;
        agreements.push(agreement);
        if (placementRoom) {
            ok(await db.from("child_placements").insert({ org_id: ORG, customer_member_id: member, enrollment_agreement_id: agreement, site_location_id: siteId, room_location_id: placementRoom, start_date: PAST, status: "active" }));
        }
        return { member, agreement };
    }

    const assign = (agreement: string, args: { room?: string | null; category?: string | null; primary?: boolean; start?: string }) =>
        createOperationalAssignment(db, {
            orgId: ORG,
            subject: { type: "child", enrollmentAgreementId: agreement },
            schedulePatternId: PATTERN,
            startDate: args.start ?? PAST,
            roomLocationId: args.room ?? null,
            assignmentTypeId: args.category ?? null,
            isPrimary: args.primary ?? false,
            actorUserId: ACTOR,
            todayYmd: TODAY,
        });

    const projectionHomerooms = async (member: string, onDate: string) => {
        const byMember = await loadSchedulingProjectionsForChildren(db, ORG, {
            children: [{ customerMemberId: member, subjectName: "fixture", ageGroup: null }],
            siteLocationId: siteId,
            todayYmd: onDate,
            computedAt: new Date().toISOString(),
        });
        return (byMember.get(member)?.children[0]?.homerooms ?? []).map((h) => h.spaceId);
    };
    const rosterHomerooms = async (member: string) => {
        const model = await buildAssignmentRosterReadModel(db, ORG, siteId, null);
        return (model.subjects.find((s) => s.customerMemberId === member)?.homerooms ?? []).map((h) => h.spaceId);
    };

    beforeAll(async () => {
        await cleanup();
        const { data: sites } = await db.from("locations").select("id").eq("org_id", ORG).eq("location_type", "site").limit(1);
        siteId = (sites![0] as { id: string }).id;
        const { data: customers } = await db.from("customers").select("id").eq("org_id", ORG).limit(1);
        customerId = (customers![0] as { id: string }).id;
        // The Homeroom category is created through the AUTHORING SERVICE — the path an org without
        // seeded categories uses — and given its meaning there, never by name.
        const created = await createOrgAssignmentType(db, ORG, {
            label: "V7-03 Homeroom",
            subjectTypes: ["child"],
            behavior: { providesHomeroom: false },
        } as never);
        expect(created.id, "the authoring service created the category").toBeTruthy();
        const flagged = await updateOrgAssignmentType(db, ORG, created.id as string, {
            label: "V7-03 Homeroom",
            subjectTypes: ["child"],
            behavior: { providesHomeroom: true },
        } as never);
        expect(flagged.behavior.providesHomeroom).toBe(true);
        homeCategory = created.id as string;
        ok(await db.from("operational_assignment_types").insert({ id: CAT_ENRICH, org_id: ORG, key: "cert_v703_enrichment", label: "V7-03 Enrichment", subject_types: ["child"] }));
        const unit = (id: string, label: string, role: string, metadata: Record<string, unknown>) => ({
            id, org_id: ORG, location_type: "unit", unit_role: role, parent_location_id: siteId, label, is_active: true, metadata,
        });
        ok(await db.from("locations").insert([
            unit(T2, "V7-03 Toddler 2", "operational_group", { space_uses: [homeCategory] }),
            unit(T3, "V7-03 Toddler 3", "operational_group", { space_uses: [homeCategory, CAT_ENRICH] }),
            unit(LEGACY, "V7-03 Legacy Room", "operational_group", {}),
            unit(GYM, "V7-03 Gym", "shared_space", { space_uses: [CAT_ENRICH] }),
        ]));
        ok(await db.from("schedule_patterns").insert({
            id: PATTERN, org_id: ORG, site_location_id: siteId, key: "cert_v703_mwf", label: "V7-03 MWF", schedule_type_key: "cert_v703", weekdays: [1, 3, 5],
        }));
    }, 90_000);

    afterAll(async () => {
        await cleanup();
    });

    it("two simultaneous classrooms → two homerooms; enrichment in the gym adds none; projection and roster agree", async () => {
        const { member, agreement } = await enrolledChild(T2);
        await assign(agreement, { room: T2, primary: true });
        await assign(agreement, { room: T3, category: homeCategory });
        await assign(agreement, { room: GYM, category: CAT_ENRICH });
        expect((await projectionHomerooms(member, TODAY)).sort()).toEqual([T2, T3].sort());
        expect((await rosterHomerooms(member)).sort()).toEqual([T2, T3].sort());
    });

    it("enrichment only → none; an unconfigured legacy classroom → none (missing Uses is not Homeroom)", async () => {
        const enrichOnly = await enrolledChild();
        await assign(enrichOnly.agreement, { room: T3, category: CAT_ENRICH });
        expect(await projectionHomerooms(enrichOnly.member, TODAY)).toEqual([]);
        expect(await rosterHomerooms(enrichOnly.member)).toEqual([]);
        const legacy = await enrolledChild(LEGACY);
        await assign(legacy.agreement, { room: LEGACY, primary: true });
        expect(await projectionHomerooms(legacy.member, TODAY)).toEqual([]);
        expect(await rosterHomerooms(legacy.member)).toEqual([]);
    });

    it("a legacy enrollment assignment with no room of its own resolves through its committed placement — and without one, to nothing", async () => {
        const placed = await enrolledChild(T2);
        await assign(placed.agreement, { room: null, primary: true });
        expect(await projectionHomerooms(placed.member, TODAY)).toEqual([T2]);
        expect(await rosterHomerooms(placed.member)).toEqual([T2]);
        const unplaced = await enrolledChild();
        await assign(unplaced.agreement, { room: null, primary: true });
        expect(await projectionHomerooms(unplaced.member, TODAY)).toEqual([]);
        expect(await rosterHomerooms(unplaced.member)).toEqual([]);
    });

    it("dates: history, today, the gap before a planned move, the move day; a canceled row never counts", async () => {
        const { member, agreement } = await enrolledChild();
        const first = await assign(agreement, { room: T2, primary: true });
        const firstId = (first as { assignmentId?: string; id?: string }).assignmentId ?? (first as { id?: string }).id;
        // Supersession as the writer records it: the predecessor ends the day before its successor.
        ok(await db.from("schedule_assignments").update({ end_date: plus(19), status: "superseded" }).eq("id", firstId!));
        await assign(agreement, { room: T3, category: homeCategory, primary: false, start: MOVE });
        expect(await projectionHomerooms(member, PAST)).toEqual([T2]);
        expect(await projectionHomerooms(member, TODAY)).toEqual([T2]); // superseded, but still the room until the move
        expect(await rosterHomerooms(member)).toEqual([T2]); // the roster agrees in the gap
        expect(await projectionHomerooms(member, plus(19))).toEqual([T2]);
        expect(await projectionHomerooms(member, MOVE)).toEqual([T3]);
        expect(await projectionHomerooms(member, plus(-41))).toEqual([]);

        const canceled = await enrolledChild();
        const c = await assign(canceled.agreement, { room: T2, primary: true });
        const cId = (c as { assignmentId?: string; id?: string }).assignmentId ?? (c as { id?: string }).id;
        ok(await db.from("schedule_assignments").update({ status: "canceled" }).eq("id", cId!));
        expect(await projectionHomerooms(canceled.member, TODAY)).toEqual([]);
    });

    it("deriving writes nothing: assignments, placements, agreements and charges are unchanged", async () => {
        const snapshot = async () => {
            const [sa, cp, ea, ch] = await Promise.all([
                db.from("schedule_assignments").select("id, status, start_date, end_date, room_location_id, is_primary, updated_at").in("customer_member_id", members).order("id"),
                db.from("child_placements").select("id, status, room_location_id, updated_at").in("customer_member_id", members).order("id"),
                db.from("child_enrollment_agreements").select("id, status, updated_at").in("id", agreements).order("id"),
                db.from("billing_charges").select("id").in("customer_member_id", members),
            ]);
            return JSON.stringify([sa.data, cp.data, ea.data, ch.data ?? []]);
        };
        const before = await snapshot();
        for (const m of members) {
            await projectionHomerooms(m, TODAY);
            await projectionHomerooms(m, MOVE);
        }
        await buildAssignmentRosterReadModel(db, ORG, siteId, null);
        expect(await snapshot()).toBe(before);
    });
});
