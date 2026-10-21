/**
 * STAFF set_primary AGAINST THE DATABASE ROOM INVARIANT — live.
 *
 * `assignment.set_primary` accepts a room for a staff primary (create spec) and the TypeScript path
 * does not validate it; since 20261201100000 the consistency trigger does. This drives the real
 * `setPrimaryOperationalAssignment` on the shared certification stack: a classroom under the site is
 * accepted; a room at another site, or a unit that is not an operational group, is refused at the
 * insert — and the staff member's existing primary is exactly as it was (the service's compensation
 * restores what it closed).
 *
 * ISOLATION: a fresh person + employment per test (and a temporary shared-space unit); teardown
 * removes them. No pre-existing row is written.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { setPrimaryOperationalAssignment } from "@/lib/operationalAssignments/setPrimaryOperationalAssignment";

const TODAY = "2026-10-21";
const LIVE = ["planned", "active", "ending"];

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

describe.skipIf(!env)("staff set_primary against the room invariant, live", () => {
    let db: SupabaseClient;
    let a: { orgId: string; siteId: string; patternId: string; inside: string; outside: string | null };
    const people: string[] = [];
    const units: string[] = [];

    beforeAll(async () => {
        db = createClient(env!.url, env!.serviceKey, { auth: { persistSession: false } });
        const { data: pat } = await db.from("schedule_patterns").select("id, org_id, site_location_id").not("site_location_id", "is", null).limit(1);
        const p = pat![0] as { id: string; org_id: string; site_location_id: string };
        const { data: units0 } = await db.from("locations").select("id").eq("org_id", p.org_id).eq("location_type", "unit").limit(200);
        let inside: string | null = null;
        let outside: string | null = null;
        for (const u of (units0 ?? []) as Array<{ id: string }>) {
            const s = (await db.rpc("location_site_id", { p_location_id: u.id })).data as string | null;
            const role = (await db.rpc("location_unit_role", { p_location_id: u.id })).data as string | null;
            if (!inside && s === p.site_location_id && role === "operational_group") inside = u.id;
            if (!outside && s && s !== p.site_location_id && role === "operational_group") outside = u.id;
        }
        expect(inside, "no classroom under the anchor site").toBeTruthy();
        a = { orgId: p.org_id, siteId: p.site_location_id, patternId: p.id, inside: inside!, outside };
    });

    afterEach(async () => {
        while (people.length) {
            const id = people.pop()!;
            await db.from("schedule_assignments").delete().eq("subject_person_id", id);
            await db.from("employments").delete().eq("person_id", id);
            await db.from("persons").delete().eq("id", id);
        }
        while (units.length) await db.from("locations").delete().eq("id", units.pop()!);
    });

    async function staff(): Promise<string> {
        const { data, error } = await db
            .from("persons")
            .insert({ org_id: a.orgId, person_number: Math.floor(900000000 + Math.random() * 99999999), first_name: "Staff", last_name: `Primary fixture ${crypto.randomUUID().slice(0, 6)}` })
            .select("id")
            .single();
        expect(error, error?.message).toBeNull();
        const id = (data as { id: string }).id;
        people.push(id);
        const emp = await db.from("employments").insert({ org_id: a.orgId, person_id: id, start_date: "2026-01-01", employment_status: "active" });
        expect(emp.error, emp.error?.message).toBeNull();
        return id;
    }
    const setPrimary = (personId: string, effectiveDate: string, roomLocationId: string) =>
        setPrimaryOperationalAssignment(db, {
            orgId: a.orgId,
            subject: { type: "staff", personId, siteLocationId: a.siteId },
            effectiveDate,
            create: { schedulePatternId: a.patternId, roomLocationId },
            todayYmd: TODAY,
        });
    const rows = async (personId: string) =>
        ((await db.from("schedule_assignments").select("id, status, end_date, room_location_id, is_primary, start_date").eq("subject_person_id", personId).order("created_at")).data ?? []) as Array<Record<string, unknown> & { id: string; status: string }>;

    it("a classroom under the site is accepted as the staff primary", async () => {
        const p = await staff();
        const r = await setPrimary(p, "2026-11-02", a.inside);
        expect(r.primary).toMatchObject({ is_primary: true, room_location_id: a.inside, subject_type: "staff" });
        expect((await rows(p)).filter((x) => LIVE.includes(x.status))).toHaveLength(1);
    });

    it("a room at another site is refused at the insert, and the existing primary is untouched", async () => {
        if (!a.outside) return;
        const p = await staff();
        const first = await setPrimary(p, "2026-11-02", a.inside);
        const before = await rows(p);
        await expect(setPrimary(p, "2026-11-16", a.outside)).rejects.toThrow(/Room must resolve to the assignment site/);
        const after = await rows(p);
        expect(after).toEqual(before);
        expect(after.find((x) => x.id === first.primary.id)).toMatchObject({ end_date: null });
    });

    it("a unit under the site that is not a classroom is refused for staff, and the existing primary is untouched", async () => {
        const p = await staff();
        const first = await setPrimary(p, "2026-11-02", a.inside);
        const { data: unit, error } = await db
            .from("locations")
            .insert({ org_id: a.orgId, location_number: Math.floor(900000000 + Math.random() * 99999999), label: "Playground (fixture)", location_type: "unit", unit_role: "shared_space", parent_location_id: a.siteId })
            .select("id")
            .single();
        expect(error, error?.message).toBeNull();
        units.push((unit as { id: string }).id);
        const before = await rows(p);
        await expect(setPrimary(p, "2026-11-16", (unit as { id: string }).id)).rejects.toThrow(/staff assignment room must be an operational group/);
        expect(await rows(p)).toEqual(before);
        expect((await rows(p)).find((x) => x.id === first.primary.id)).toMatchObject({ end_date: null });
    });
});
