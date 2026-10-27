/**
 * S5 — the Operating Calendar against the REAL certification database (the shared local
 * `alloy-cert` stack; `.env.certification.local`), through the real ledger intake
 * (`author_operational_expectation`), the real lineage trigger and the real query seam.
 *
 * Runs in an organization it creates, because organization calendar defaults reach every
 * location of their org — authored on the shared synthetic tenant they would close days in
 * other lanes' suites.
 *
 * RESIDUE, BY DOCTRINE: `operational_expectations` is append-only (UPDATE and DELETE raise,
 * including the org cascade). The suite therefore WITHDRAWS every entry it authored, so what
 * remains is inert, deletes everything else it created, and leaves the run's org row behind.
 * A finding about the ledger's test hygiene, not about the calendar.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createSupabaseAuthoringGateway } from "@/lib/operationalExpectations/intake/supabaseAuthoringGateway";
import {
    commitCalendarAct,
    prepareCalendarAct,
    type CalendarAuthoringAction,
} from "@/lib/operatingCalendar/operatingCalendarAuthoring";
import { loadSiteOperatingCalendar, loadCalendarSiteClosureForServiceDay } from "@/lib/operatingCalendar/operatingCalendarServer";
import { listCalendarEntries } from "@/lib/operatingCalendar/operatingCalendarEntries";
import { previewCalendarDates } from "@/lib/operatingCalendar/operatingCalendarImpact";
import { OPERATING_CALENDAR_PURPOSE, type OperatingCalendarEntryDraft } from "@/lib/operatingCalendar/operatingCalendarVocabulary";
import { closeOperatingGrain } from "@/lib/childcareOperational/attendance/serviceDayExceptionCommands";
import { ATTENDANCE_EXPECTATION_PURPOSE } from "@/lib/childcareOperational/attendance/serviceDayExpectations";
import { authorOperationalExpectation } from "@/lib/operationalExpectations/intake/authorOperationalExpectation";

function certEnv(): { url: string; serviceKey: string } | null {
    try {
        const file = readFileSync(resolve(__dirname, "../../../.env.certification.local"), "utf8");
        const read = (key: string) => file.split("\n").find((l) => l.startsWith(`${key}=`))?.slice(key.length + 1).trim() ?? "";
        const url = read("SUPABASE_URL") || read("NEXT_PUBLIC_SUPABASE_URL");
        const serviceKey = read("SUPABASE_SERVICE_ROLE_KEY");
        return url && serviceKey ? { url, serviceKey } : null;
    } catch {
        return null;
    }
}

const env = certEnv();
const describeLive = env ? describe : describe.skip;
const RUN = `s5-${Date.now().toString(36)}`;
const ACTOR = "00000000-0000-4000-8000-0000000005a5";

describeLive("S5 Operating Calendar — live certification database", () => {
    const db = (env ? createClient(env.url, env.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }) : null) as unknown as SupabaseClient;
    let orgId = "";
    let siteLA = "";
    let siteNY = "";
    let room = "";
    const authoredLatest = new Map<string, string>(); // lineage -> latest act id

    async function ok<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
        const { data, error } = await p;
        if (error) throw new Error(error.message);
        return data;
    }

    const access = { permissionKeys: ["settings.manage"], dim: { departmentScope: "all", allowedDepartmentIds: [], siteScope: "all", allowedSiteLocationIds: [] } } as never;
    const gateway = () => createSupabaseAuthoringGateway(db as never, OPERATING_CALENDAR_PURPOSE);

    async function act(action: CalendarAuthoringAction, opts: { draft?: Partial<OperatingCalendarEntryDraft>; entryId?: string }) {
        const draft = opts.draft
            ? ({
                  scope: "location",
                  locationId: siteLA,
                  name: "Entry",
                  designation: "closure",
                  effect: "closed",
                  fromDate: "2031-12-25",
                  toDate: "2031-12-25",
                  startTime: null,
                  endTime: null,
                  reasonKey: null,
                  note: null,
                  ...opts.draft,
              } as OperatingCalendarEntryDraft)
            : null;
        const prepared = await prepareCalendarAct({
            supabase: db,
            orgId,
            actorUserId: ACTOR,
            access,
            action,
            draft,
            entryId: opts.entryId ?? null,
            idempotencyKey: `${RUN}:${action}:${Math.random().toString(36).slice(2)}`,
        });
        if (prepared.status !== "prepared") throw new Error(`${prepared.code}: ${prepared.message}`);
        const result = await commitCalendarAct(prepared, { orgId, actorUserId: ACTOR }, gateway());
        if (result.status !== "authored") throw new Error(`authoring ${result.status}: ${"message" in result ? result.message : ""}`);
        authoredLatest.set(result.act.lineageRootId ?? result.act.id, result.act.id);
        return { id: result.act.id, root: result.act.lineageRootId ?? result.act.id, prepared };
    }

    const calendar = (site: string, from: string, to: string) => loadSiteOperatingCalendar(db, { orgId, locationId: site, fromDate: from, toDate: to });
    const statuses = async (site: string, from: string, to: string) => [...(await calendar(site, from, to)).days.values()].map((d) => d.status);

    beforeAll(async () => {
        orgId = ((await ok(db.from("orgs").insert({ name: `ZZ ${RUN}`, slug: `zz-${RUN}` }).select("id").single())) as { id: string }).id;
        await ok(db.from("org_settings").upsert({ org_id: orgId, metadata: { timezone: "America/Los_Angeles" } }, { onConflict: "org_id" }));
        siteLA = ((await ok(
            db.from("locations").insert({ org_id: orgId, label: `ZZ ${RUN} LA`, location_type: "site", metadata: { timezone: "America/Los_Angeles" } }).select("id").single(),
        )) as { id: string }).id;
        siteNY = ((await ok(
            db.from("locations").insert({ org_id: orgId, label: `ZZ ${RUN} NY`, location_type: "site", metadata: { timezone: "America/New_York" } }).select("id").single(),
        )) as { id: string }).id;
        room = ((await ok(
            db.from("locations").insert({ org_id: orgId, label: `ZZ ${RUN} Room`, location_type: "unit", parent_location_id: siteLA }).select("id").single(),
        )) as { id: string }).id;
    }, 60_000);

    afterAll(async () => {
        if (!orgId) return;
        // Withdraw every calendar lineage still in effect, so the append-only residue is inert.
        for (const latest of authoredLatest.values()) {
            await act("withdraw", { entryId: latest }).catch(() => undefined);
        }
        await db.from("locations").delete().eq("org_id", orgId).not("parent_location_id", "is", null);
        await db.from("locations").delete().eq("org_id", orgId);
        await db.from("org_settings").delete().eq("org_id", orgId);
    }, 120_000);

    it("a five-day closure is ONE ledger row, closed on exactly its local dates", async () => {
        const { id } = await act("create", { draft: { name: "Winter break", fromDate: "2031-12-22", toDate: "2031-12-26" } });
        const rows = (await ok(db.from("operational_expectations").select("id, subject_kind, valid_from, valid_to, condition").eq("org_id", orgId).eq("id", id))) as Array<{
            subject_kind: string;
            valid_from: string;
            valid_to: string;
            condition: { typeKey: string };
        }>;
        expect(rows).toHaveLength(1);
        expect(rows[0]!.subject_kind).toBe("site");
        expect(rows[0]!.condition.typeKey).toBe("location.operating_calendar");
        // Local midnight in Los Angeles (PST, UTC-8), not UTC midnight.
        expect(new Date(rows[0]!.valid_from).toISOString()).toBe("2031-12-22T08:00:00.000Z");
        expect(new Date(rows[0]!.valid_to).toISOString()).toBe("2031-12-27T08:00:00.000Z");
        expect(await statuses(siteLA, "2031-12-21", "2031-12-27")).toEqual(["open", "closed", "closed", "closed", "closed", "closed", "open"]);
        // The NY site is untouched by LA's entry.
        expect(await statuses(siteNY, "2031-12-22", "2031-12-22")).toEqual(["open"]);
    });

    it("revising shorter and later reopens the dropped days (real lineage, real seam)", async () => {
        const created = await act("create", { draft: { name: "Training", fromDate: "2032-01-05", toDate: "2032-01-09" } });
        const revised = await act("revise", { entryId: created.id, draft: { name: "Training", fromDate: "2032-01-07", toDate: "2032-01-08" } });
        expect(revised.root).toBe(created.id);
        expect(await statuses(siteLA, "2032-01-05", "2032-01-09")).toEqual(["open", "open", "closed", "closed", "open"]);
        // A stale edit (naming the superseded act) is refused.
        await expect(act("revise", { entryId: created.id, draft: { fromDate: "2032-01-05", toDate: "2032-01-05" } })).rejects.toThrow(/entry_changed/);
    });

    it("withdraw reopens; restore closes again; history keeps every act", async () => {
        const c = await act("create", { draft: { name: "Maintenance", fromDate: "2032-02-02", toDate: "2032-02-03" } });
        const w = await act("withdraw", { entryId: c.id });
        expect(await statuses(siteLA, "2032-02-02", "2032-02-03")).toEqual(["open", "open"]);
        await act("restore", { entryId: w.id });
        expect(await statuses(siteLA, "2032-02-02", "2032-02-03")).toEqual(["closed", "closed"]);
        const lineage = (await ok(db.from("operational_expectations").select("id, verb, transition_type, standing, authority_key").eq("org_id", orgId).or(`id.eq.${c.id},lineage_root_id.eq.${c.id}`))) as Array<{
            verb: string;
            transition_type: string | null;
            standing: string;
            authority_key: string;
        }>;
        expect(lineage.map((r) => r.verb).sort()).toEqual(["create", "revise", "revise"]);
        expect(lineage.every((r) => r.standing === "proposed" && r.authority_key === `user:${ACTOR}`)).toBe(true);
        const cal = await calendar(siteLA, "2032-02-01", "2032-02-04");
        const entry = listCalendarEntries({ orgId, siteId: siteLA, rows: cal.rows }).find((e) => e.lineageId === c.id)!;
        expect(entry).toMatchObject({ status: "active", revisions: 3, source: "calendar", scope: "location" });
    });

    it("an organization default reaches every location on its own local date; a location exception overrides it there only", async () => {
        await act("create", { draft: { scope: "organization", locationId: null, name: "New Year", designation: "holiday", fromDate: "2032-01-01", toDate: "2032-01-01" } });
        await act("create", { draft: { name: "Open on New Year", designation: "other", effect: "open_as_usual", fromDate: "2032-01-01", toDate: "2032-01-01" } });
        const la = (await calendar(siteLA, "2032-01-01", "2032-01-01")).days.get("2032-01-01")!;
        const ny = (await calendar(siteNY, "2032-01-01", "2032-01-01")).days.get("2032-01-01")!;
        expect([la.status, la.governingScope, la.overridden.map((e) => e.name)]).toEqual(["open", "location", ["New Year"]]);
        expect([ny.status, ny.governingScope]).toEqual(["closed", "organization"]);
        // Attendance reads the same answer.
        expect(await loadCalendarSiteClosureForServiceDay(db, { orgId, siteLocationId: siteNY, serviceDate: "2032-01-01" })).not.toBeNull();
        expect(await loadCalendarSiteClosureForServiceDay(db, { orgId, siteLocationId: siteLA, serviceDate: "2032-01-01" })).toBeNull();
    });

    it("partial closure and modified hours on a DST day keep wall time", async () => {
        // 2032-03-14 is the US spring-forward day.
        await act("create", { draft: { name: "Early close", effect: "modified_hours", designation: "modified_hours", startTime: "09:00", endTime: "13:00", fromDate: "2032-03-14", toDate: "2032-03-14" } });
        const cal = await calendar(siteLA, "2032-03-14", "2032-03-14");
        expect(cal.days.get("2032-03-14")!.openIntervals).toEqual([{ start: 540, end: 780 }]);
        await expect(
            act("create", { draft: { name: "Bad", effect: "partial_closure", startTime: "02:30", endTime: "03:30", fromDate: "2032-03-14", toDate: "2032-03-14" } }),
        ).rejects.toThrow(/time_does_not_exist/);
    });

    it("a holiday designation without closure changes nothing operational", async () => {
        await act("create", { draft: { name: "Flag Day", designation: "holiday", effect: "none", fromDate: "2032-06-14", toDate: "2032-06-14" } });
        const day = (await calendar(siteLA, "2032-06-14", "2032-06-14")).days.get("2032-06-14")!;
        expect([day.status, day.designations.map((d) => d.name)]).toEqual(["open", ["Flag Day"]]);
    });

    it("Attendance's existing site and room closures are read on their service dates; a room never closes the site", async () => {
        const g = createSupabaseAuthoringGateway(db as never, ATTENDANCE_EXPECTATION_PURPOSE);
        const ctx = { orgId, actorUserId: ACTOR, actorLabel: null, actorAuthenticated: true };
        const site = await authorOperationalExpectation(
            closeOperatingGrain({ idempotencyKey: `${RUN}:att-site`, actorUserId: ACTOR, reasonKey: "weather_closure", grainKind: "site", grainId: siteLA, range: { fromDate: "2032-04-06" } }),
            ctx,
            g,
        );
        const roomClosure = await authorOperationalExpectation(
            closeOperatingGrain({ idempotencyKey: `${RUN}:att-room`, actorUserId: ACTOR, reasonKey: "maintenance", grainKind: "operational_group", grainId: room, range: { fromDate: "2032-04-07" } }),
            ctx,
            g,
        );
        expect([site.status, roomClosure.status]).toEqual(["authored", "authored"]);
        const cal = await loadSiteOperatingCalendar(db, { orgId, locationId: siteLA, fromDate: "2032-04-05", toDate: "2032-04-08", roomIds: [room] });
        expect([...cal.days.values()].map((d) => d.status)).toEqual(["open", "closed", "open", "open"]);
        expect(cal.days.get("2032-04-06")!.applied[0]!.source).toBe("attendance");
        expect(cal.days.get("2032-04-07")!.roomClosures.map((r) => r.roomId)).toEqual([room]);
        // The calendar→Attendance bridge does not double-report Attendance's own closure.
        expect(await loadCalendarSiteClosureForServiceDay(db, { orgId, siteLocationId: siteLA, serviceDate: "2032-04-06" })).toBeNull();
    });

    it("the impact preview names the dates and hours before anything is written", async () => {
        const before = (await ok(db.from("operational_expectations").select("id").eq("org_id", orgId))) as unknown[];
        const prepared = await prepareCalendarAct({
            supabase: db,
            orgId,
            actorUserId: ACTOR,
            access,
            action: "create",
            draft: { scope: "organization", locationId: null, name: "Inservice", designation: "closure", effect: "partial_closure", fromDate: "2032-05-03", toDate: "2032-05-04", startTime: "12:00", endTime: "17:00", reasonKey: "staff_training", note: null },
            idempotencyKey: `${RUN}:preview`,
        });
        if (prepared.status !== "prepared") throw new Error(prepared.message);
        const preview = await previewCalendarDates(db, { orgId, prepared });
        expect(preview.sites.map((s) => s.siteId).sort()).toEqual([siteLA, siteNY].sort());
        expect(preview.dates.filter((d) => d.siteId === siteNY).map((d) => [d.date, d.after.openIntervals])).toEqual([
            ["2032-05-03", [{ start: 0, end: 720 }, { start: 1020, end: 1440 }]],
            ["2032-05-04", [{ start: 0, end: 720 }, { start: 1020, end: 1440 }]],
        ]);
        const after = (await ok(db.from("operational_expectations").select("id").eq("org_id", orgId))) as unknown[];
        expect(after.length).toBe(before.length);
    });

    it("cross-tenant: another org cannot see or revise this org's entries", async () => {
        const { id } = await act("create", { draft: { name: "Private", fromDate: "2032-07-01", toDate: "2032-07-01" } });
        const foreign = await prepareCalendarAct({
            supabase: db,
            orgId: "00000000-0000-4000-8000-000000000001",
            actorUserId: ACTOR,
            access,
            action: "withdraw",
            entryId: id,
            idempotencyKey: `${RUN}:foreign`,
        });
        expect(foreign).toMatchObject({ status: "refused", code: "entry_not_found" });
        const cal = await loadSiteOperatingCalendar(db, { orgId: "00000000-0000-4000-8000-000000000001", locationId: siteLA, fromDate: "2032-07-01", toDate: "2032-07-01" });
        expect(cal.rows).toEqual([]);
    });
});
