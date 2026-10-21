/**
 * REPLACING A SECONDARY ASSIGNMENT IS ONE TRANSACTION — proven against a live database.
 *
 * `replace_secondary_schedule_assignment` locks the predecessor, binds it to the subject, org and
 * site, closes it and inserts the successor in one transaction. Those guarantees are unobservable
 * from source or a mock: that a refused successor rolls the close back, that concurrent replacements
 * cannot both succeed, that a retry replays instead of chaining. This suite drives both the function
 * and the real service (`createOperationalAssignment`) on the shared certification stack.
 *
 * A reachable stack with the function missing FAILS (an unmeasured gate is not a passed gate); an
 * unreachable stack skips, as every sibling live suite does.
 *
 * ISOLATION. Each test makes its own customer member and hangs proposed child secondaries off it;
 * teardown deletes those rows and the member. No pre-existing row is written.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { createOperationalAssignment } from "@/lib/operationalAssignments/operationalAssignmentService";

const FN = "replace_secondary_schedule_assignment";
const LIVE = ["planned", "active", "ending"];
const ACTOR = "7a1d2c3e-0000-4000-8000-00000000a11e";

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

type Row = Record<string, unknown> & { id: string; status: string; end_date: string | null };

describe.skipIf(!env)("secondary assignment replacement, against a live database", () => {
    let db: SupabaseClient;
    let a: { orgId: string; customerId: string; siteId: string; otherSiteId: string | null; patternId: string; typeId: string | null };
    const members: string[] = [];

    beforeAll(async () => {
        db = createClient(env!.url, env!.serviceKey, { auth: { persistSession: false } });
        const probe = await db.rpc(FN, {
            p_org_id: "00000000-0000-0000-0000-000000000000",
            p_prior_assignment_id: "00000000-0000-0000-0000-000000000000",
            p_subject_type: "child",
            p_customer_member_id: null,
            p_enrollment_agreement_id: null,
            p_subject_person_id: null,
            p_replacement_key: "probe",
            p_actor: null,
            p_successor: {},
        });
        const missing = probe.error && /could not find the function|does not exist|PGRST202/i.test(`${probe.error.code ?? ""} ${probe.error.message ?? ""}`);
        expect(missing, `${FN} is not installed on the reachable stack — apply 20261201090000_secondary_assignment_replacement_atomic.sql`).toBe(false);

        // Anchors from a pattern the database already accepted at its site, and a child-capable type.
        const { data: pat } = await db.from("schedule_patterns").select("id, org_id, site_location_id").not("site_location_id", "is", null).limit(1);
        const p = pat![0] as { id: string; org_id: string; site_location_id: string };
        const { data: cust } = await db.from("customers").select("id").eq("org_id", p.org_id).limit(1);
        const { data: types } = await db.from("operational_assignment_types").select("id, subject_types").eq("org_id", p.org_id);
        const childType = ((types ?? []) as Array<{ id: string; subject_types: string[] | null }>).find((t) => (t.subject_types ?? []).includes("child"));
        const { data: sites } = await db.from("locations").select("id").eq("org_id", p.org_id).eq("location_type", "site").neq("id", p.site_location_id).limit(1);
        a = {
            orgId: p.org_id,
            customerId: (cust![0] as { id: string }).id,
            siteId: p.site_location_id,
            otherSiteId: (sites?.[0] as { id: string } | undefined)?.id ?? null,
            patternId: p.id,
            typeId: childType?.id ?? null,
        };
    });

    afterEach(async () => {
        while (members.length) {
            const m = members.pop()!;
            await db.from("schedule_assignments").delete().eq("customer_member_id", m);
            await db.from("customer_members").delete().eq("id", m);
        }
    });

    async function member(): Promise<string> {
        const { data, error } = await db
            .from("customer_members")
            .insert({ org_id: a.orgId, customer_id: a.customerId, display_name: `secondary replacement fixture ${crypto.randomUUID().slice(0, 8)}` })
            .select("id")
            .single();
        expect(error, error?.message).toBeNull();
        members.push((data as { id: string }).id);
        return (data as { id: string }).id;
    }

    /** A proposed child secondary, written by the real service. */
    async function secondary(memberId: string, start = "2026-11-02") {
        return createOperationalAssignment(db, {
            orgId: a.orgId,
            subject: { type: "child", customerMemberId: memberId, siteLocationId: a.siteId },
            schedulePatternId: a.patternId,
            startDate: start,
            assignmentTypeId: a.typeId,
            isPrimary: false,
            actorUserId: ACTOR,
        });
    }
    const rows = async (memberId: string) =>
        ((await db.from("schedule_assignments").select("*").eq("customer_member_id", memberId).order("created_at")).data ?? []) as Row[];
    const live = (rs: Row[]) => rs.filter((r) => LIVE.includes(r.status));

    function rpcArgs(memberId: string, priorId: string, key: string, successor: Record<string, unknown> = {}) {
        return {
            p_org_id: a.orgId,
            p_prior_assignment_id: priorId,
            p_subject_type: "child",
            p_customer_member_id: memberId,
            p_enrollment_agreement_id: null,
            p_subject_person_id: null,
            p_replacement_key: key,
            p_actor: ACTOR,
            p_successor: {
                site_location_id: a.siteId,
                schedule_pattern_id: a.patternId,
                operational_assignment_type_id: a.typeId,
                start_date: "2026-11-09",
                status: "planned",
                commitment_kind: "proposed",
                metadata: { planning: true },
                ...successor,
            },
        };
    }

    it("replaces through the service: prior superseded the day before, successor linked, audit actor on both", async () => {
        const m = await member();
        const prior = await secondary(m);
        const next = await createOperationalAssignment(db, {
            orgId: a.orgId,
            subject: { type: "child", customerMemberId: m, siteLocationId: a.siteId },
            schedulePatternId: a.patternId,
            startDate: "2026-11-09",
            assignmentTypeId: a.typeId,
            isPrimary: false,
            supersedesAssignmentId: prior.id,
            actorUserId: ACTOR,
        });
        const rs = await rows(m);
        const p = rs.find((r) => r.id === prior.id)!;
        expect(p).toMatchObject({ status: "superseded", end_date: "2026-11-08", updated_by: ACTOR });
        expect(rs.find((r) => r.id === next.id)).toMatchObject({ supersedes_assignment_id: prior.id, is_primary: false, created_by: ACTOR, start_date: "2026-11-09" });
        expect(live(rs).map((r) => r.id)).toEqual([next.id]);
    });

    it("a successor the database refuses rolls the close back: the predecessor is untouched", async () => {
        const m = await member();
        const prior = await secondary(m);
        const before = (await rows(m))[0]!;
        const r = await db.rpc(FN, rpcArgs(m, prior.id, "k-fail", { status: "bogus" })); // violates the status CHECK on INSERT
        expect(r.error?.message ?? "").toMatch(/status_check|violates check constraint/);
        const rs = await rows(m);
        expect(rs).toHaveLength(1);
        expect(rs[0]).toMatchObject({ id: prior.id, status: before.status, end_date: before.end_date, updated_at: before.updated_at });
    });

    it("a stale predecessor is refused, and no second successor exists", async () => {
        const m = await member();
        const prior = await secondary(m);
        expect((await db.rpc(FN, rpcArgs(m, prior.id, "k-first"))).error).toBeNull();
        const second = await db.rpc(FN, rpcArgs(m, prior.id, "k-second", { start_date: "2026-11-16" }));
        expect(second.error?.message ?? "").toMatch(/stale_predecessor/);
        const rs = await rows(m);
        expect(rs).toHaveLength(2);
        expect(live(rs)).toHaveLength(1);
    });

    it("a retry with the same key replays the successor instead of chaining one", async () => {
        const m = await member();
        const prior = await secondary(m);
        const first = await db.rpc(FN, rpcArgs(m, prior.id, "k-retry"));
        const again = await db.rpc(FN, rpcArgs(m, prior.id, "k-retry"));
        expect(first.error).toBeNull();
        expect(again.error).toBeNull();
        expect((again.data as { replayed: boolean }).replayed).toBe(true);
        expect((again.data as { successor: { id: string } }).successor.id).toBe((first.data as { successor: { id: string } }).successor.id);
        expect(await rows(m)).toHaveLength(2);
    });

    it("the service's resubmitted identical request replays (deterministic key)", async () => {
        const m = await member();
        const prior = await secondary(m);
        const input = {
            orgId: a.orgId,
            subject: { type: "child" as const, customerMemberId: m, siteLocationId: a.siteId },
            schedulePatternId: a.patternId,
            startDate: "2026-11-09",
            assignmentTypeId: a.typeId,
            isPrimary: false,
            supersedesAssignmentId: prior.id,
            actorUserId: ACTOR,
        };
        const one = await createOperationalAssignment(db, input);
        const two = await createOperationalAssignment(db, input);
        expect(two.id).toBe(one.id);
        expect(live(await rows(m)).map((r) => r.id)).toEqual([one.id]);
    });

    it("concurrent replacements: exactly one succeeds, one live successor", async () => {
        const m = await member();
        const prior = await secondary(m);
        const results = await Promise.all(
            ["k-c1", "k-c2", "k-c3"].map((k, i) => db.rpc(FN, rpcArgs(m, prior.id, k, { start_date: `2026-11-1${i}` }))),
        );
        expect(results.filter((r) => !r.error)).toHaveLength(1);
        for (const r of results.filter((x) => x.error)) expect(r.error!.message).toMatch(/stale_predecessor/);
        const rs = await rows(m);
        expect(live(rs)).toHaveLength(1);
        expect(rs).toHaveLength(2);
    });

    it("another subject's row, another org, another site: refused, nothing changes", async () => {
        const mine = await member();
        const theirs = await member();
        const theirRow = await secondary(theirs);
        const wrongSubject = await db.rpc(FN, rpcArgs(mine, theirRow.id, "k-x"));
        expect(wrongSubject.error?.message ?? "").toMatch(/prior_not_found/);
        const wrongOrg = await db.rpc(FN, { ...rpcArgs(theirs, theirRow.id, "k-y"), p_org_id: crypto.randomUUID() });
        expect(wrongOrg.error?.message ?? "").toMatch(/prior_not_found/);
        if (a.otherSiteId) {
            const wrongSite = await db.rpc(FN, rpcArgs(theirs, theirRow.id, "k-z", { site_location_id: a.otherSiteId }));
            expect(wrongSite.error?.message ?? "").toMatch(/site_mismatch/);
        }
        expect(await rows(mine)).toHaveLength(0);
        const rs = await rows(theirs);
        expect(rs).toHaveLength(1);
        expect(rs[0]).toMatchObject({ id: theirRow.id, end_date: null });
        expect(LIVE).toContain(rs[0]!.status);
    });

    it("a successor starting on or before the predecessor is refused before anything is written", async () => {
        const m = await member();
        const prior = await secondary(m, "2026-11-02");
        const r = await db.rpc(FN, rpcArgs(m, prior.id, "k-early", { start_date: "2026-11-02" }));
        expect(r.error?.message ?? "").toMatch(/invalid_successor_start/);
        expect(await rows(m)).toHaveLength(1);
    });

    it("a primary is never replaced through this path", async () => {
        const m = await member();
        const primary = await createOperationalAssignment(db, {
            orgId: a.orgId,
            subject: { type: "child", customerMemberId: m, siteLocationId: a.siteId },
            schedulePatternId: a.patternId,
            startDate: "2026-11-02",
            isPrimary: true,
            actorUserId: ACTOR,
        });
        const r = await db.rpc(FN, rpcArgs(m, primary.id, "k-p"));
        expect(r.error?.message ?? "").toMatch(/primary_not_supported/);
        expect(await rows(m)).toHaveLength(1);
    });

    it("the consistency trigger refuses a room outside the assignment's site for ANY writer, and never re-judges a status-only close", async () => {
        const m = await member();
        const { data: units } = await db.from("locations").select("id").eq("org_id", a.orgId).eq("location_type", "unit").limit(200);
        const ids = ((units ?? []) as Array<{ id: string }>).map((u) => u.id);
        const siteOf = async (id: string) => (await db.rpc("location_site_id", { p_location_id: id })).data as string | null;
        let inside: string | null = null;
        let outside: string | null = null;
        for (const id of ids) {
            const s = await siteOf(id);
            if (!inside && s === a.siteId) inside = id;
            if (!outside && s && s !== a.siteId) outside = id;
            if (inside && outside) break;
        }
        const base = {
            org_id: a.orgId, subject_type: "child", customer_member_id: m, site_location_id: a.siteId,
            commitment_kind: "proposed", is_primary: false, schedule_pattern_id: a.patternId,
            operational_assignment_type_id: a.typeId, start_date: "2026-11-02", status: "planned",
            assignment_kind: "base", source_key: "live-test",
        };
        if (outside) {
            // A direct insert — no service in front of it: the database itself refuses.
            const bad = await db.from("schedule_assignments").insert({ ...base, room_location_id: outside }).select("id");
            expect(bad.error?.message ?? "").toMatch(/Room must resolve to the assignment site/);
        }
        if (inside) {
            const ok = await db.from("schedule_assignments").insert({ ...base, room_location_id: inside }).select("id").single();
            expect(ok.error).toBeNull();
            const close = await db.from("schedule_assignments").update({ status: "canceled" }).eq("id", (ok.data as { id: string }).id).select("status").single();
            expect(close.error).toBeNull();
        }
        expect(Boolean(inside) || Boolean(outside), "no unit found to exercise the room rule").toBe(true);
    });
});
