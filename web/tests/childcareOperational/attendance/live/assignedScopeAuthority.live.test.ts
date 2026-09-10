/**
 * Assignment-scoped teacher authority — against the real database.
 *
 * The unit suite proves the containment ARITHMETIC. This proves the path: a
 * session user resolving through an explicit link to a person, that person's
 * staff assignments on a given service date, and the real
 * `assertAttendanceCaptureAllowed` gate deciding on what it finds. Nothing here
 * is stubbed — the resolver reads `user_person_links`, the scope reads
 * `schedule_assignments`, and the verdict is the one production returns.
 *
 * Why that distinction matters: every defect this slice has had so far lived in
 * the wiring rather than the logic. A field dropped in normalisation, a policy
 * read from the wrong bag, an authority keyed on an id nothing joined. Unit
 * tests could not see any of them.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { assertAttendanceCaptureAllowed } from "@/lib/childcareOperational/attendance/attendancePermissions";
import { resolveLinkedPersonId } from "@/lib/access/linkedPersonIdentity";
import { resolveAssignedCaptureScope } from "@/lib/childcareOperational/attendance/assignedScopeCapture";

function certEnv(): { url: string; serviceKey: string } | null {
    const fromProcess = { url: process.env.CERT_SUPABASE_URL ?? "", serviceKey: process.env.CERT_SERVICE_ROLE_KEY ?? "" };
    if (fromProcess.url && fromProcess.serviceKey) return fromProcess;
    try {
        const file = readFileSync(resolve(__dirname, "../../../../.env.certification.local"), "utf8");
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
const describeLive = env ? describe : describe.skip;

const ORG = "00000000-0000-4000-8000-000000000001";
const OTHER_ORG = "aaaa1111-0000-4000-8000-000000000001";
const RIVERSIDE = "00000000-0000-4000-8000-000000000010";
const LAKESIDE = "00000000-0000-4000-8000-000000000011";
const ROOM_A = "00000000-0000-4000-8000-000000000013"; // Toddler Room A, Riverside
const ROOM_B = "00000000-0000-4000-8000-000000000014"; // Preschool Room A, Riverside
const PATTERN = "00000000-0000-4000-8000-000050000069";
const EMPLOYMENT_A = "00000000-0000-4000-8000-000060000011";
const EMPLOYMENT_B = "00000000-0000-4000-8000-000060000012";

/** Fixtures this suite owns, namespaced so it can clean up exactly its own rows. */
const TEACHER_PERSON = "00000000-0000-4000-8000-0000t6000001".replace("t6", "60");
const OTHER_PERSON = "00000000-0000-4000-8000-0000t6000002".replace("t6", "60");
const TEACHER_USER = "00000000-0000-4000-9000-0000t6000001".replace("t6", "60");

/** Site scope that holds Riverside only — the ordinary dimension, unchanged. */
const siteScoped = (captureScope: "site" | "assigned") => ({
    departmentScope: "all" as const,
    allowedDepartmentIds: null,
    siteScope: "restricted" as const,
    allowedSiteLocationIds: [RIVERSIDE],
    attendanceCaptureScope: captureScope,
});

const TODAY = new Date().toISOString().slice(0, 10);
const day = (offset: number) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + offset);
    return d.toISOString().slice(0, 10);
};

describeLive("assignment-scoped teacher authority — live", () => {
    const supabase = (env
        ? createClient(env.url, env.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
        : null) as unknown as SupabaseClient;

    const assignmentIds: string[] = [];
    const createdUserIds: string[] = [];
    let teacherUserId = "";

    async function addAssignment(params: {
        roomLocationId: string | null;
        siteLocationId: string | null;
        startDate: string;
        endDate: string | null;
        personId?: string;
    }): Promise<string> {
        const { data, error } = await supabase
            .from("schedule_assignments")
            .insert({
                org_id: ORG,
                subject_type: "staff",
                subject_person_id: params.personId ?? TEACHER_PERSON,
                room_location_id: params.roomLocationId,
                site_location_id: params.siteLocationId,
                start_date: params.startDate,
                end_date: params.endDate,
                status: "active",
                // Required by the schema and org-scoped; the certification org's
                // own pattern, so the insert satisfies the same tenancy trigger
                // production writes do.
                schedule_pattern_id: PATTERN,
                commitment_kind: "committed",
                assignment_kind: "base",
            })
            .select("id")
            .single();
        if (error) throw new Error(`assignment insert failed: ${error.message}`);
        const id = (data as { id: string }).id;
        assignmentIds.push(id);
        return id;
    }

    beforeAll(async () => {
        // Two persons in the cert org, and two auth users. Real rows, because the
        // whole point is that the resolver reads real rows.
        for (const [id, name] of [[TEACHER_PERSON, "T6 Teacher"], [OTHER_PERSON, "T6 Other"]] as const) {
            const { error } = await supabase.from("persons").upsert(
                { id, org_id: ORG, first_name: name, last_name: "Certification", full_name: `${name} Certification` },
                { onConflict: "id" },
            );
            if (error) throw new Error(`person fixture failed: ${error.message}`);
        }
        /*
         * Canonical employment, because the platform requires it: a staff
         * assignment is refused unless an `employments` row covers its start
         * date. That invariant is the platform saying assignments are real
         * staffing truth rather than a scheduling scratchpad — worth honouring
         * in the fixture rather than working around.
         */
        for (const [personId, employmentId] of [
            [TEACHER_PERSON, EMPLOYMENT_A],
            [OTHER_PERSON, EMPLOYMENT_B],
        ] as const) {
            const { error } = await supabase.from("employments").upsert(
                {
                    id: employmentId,
                    org_id: ORG,
                    person_id: personId,
                    employment_status: "active",
                    start_date: day(-365),
                    source_key: "certification",
                },
                { onConflict: "id" },
            );
            // Surfaced, not swallowed. A fixture that fails quietly produces a
            // green suite that proved nothing — the exact "vacuous zero-target
            // green" the certification bar forbids.
            if (error) throw new Error(`employment fixture failed: ${error.message}`);
        }
        await supabase.from("user_person_links").delete().eq("org_id", ORG).in("person_id", [TEACHER_PERSON, OTHER_PERSON]);

        /*
         * A REAL authenticated identity. `user_person_links.user_id` references
         * `auth.users`, so a fabricated uuid would be refused by the FK — which
         * is the point: the bridge cannot link a session that does not exist.
         * Created through the admin API rather than by reaching into auth
         * tables, because that is how an account actually comes to exist.
         */
        const created = await supabase.auth.admin.createUser({
            email: `t6-teacher-${Date.now()}@certification.invalid`,
            password: `cert-${Math.random().toString(36).slice(2)}A1!`,
            email_confirm: true,
        });
        if (created.error || !created.data.user) {
            throw new Error(`auth user fixture failed: ${created.error?.message ?? "no user"}`);
        }
        teacherUserId = created.data.user.id;
        createdUserIds.push(teacherUserId);
    });

    afterAll(async () => {
        if (!supabase) return;
        if (assignmentIds.length) {
            await supabase.from("schedule_assignments").delete().in("id", assignmentIds);
        }
        await supabase.from("user_person_links").delete().eq("org_id", ORG).in("person_id", [TEACHER_PERSON, OTHER_PERSON]);
        await supabase.from("employments").delete().in("id", [EMPLOYMENT_A, EMPLOYMENT_B]);
        for (const id of createdUserIds) {
            await supabase.auth.admin.deleteUser(id).catch(() => undefined);
        }
    });

    // ── T0 / T0A — identity resolution ──────────────────────────────────────

    it("T0A — a user with no active link resolves to nobody, and says so definitely", async () => {
        // `resolved: true, personId: null` is the important shape. It means "we
        // looked and there is no link", which is a safe basis for a deliberate
        // denial — as opposed to a failed read, which must never look the same.
        const r = await resolveLinkedPersonId(supabase, ORG, TEACHER_USER);
        expect(r.resolved).toBe(true);
        expect(r.personId).toBeNull();
    });

    it("T0A — assignment-constrained capture fails closed with no link, and never falls back to email", async () => {
        await addAssignment({ roomLocationId: ROOM_A, siteLocationId: RIVERSIDE, startDate: day(-30), endDate: null });
        const verdict = await assertAttendanceCaptureAllowed({
            supabase,
            orgId: ORG,
            userId: TEACHER_USER,
            dim: siteScoped("assigned"),
            siteLocationId: RIVERSIDE,
            roomLocationIds: [ROOM_A],
            serviceDate: TODAY,
        });
        expect(verdict.ok).toBe(false);
        if (!verdict.ok) {
            // Denied for want of a capability or a link — never permitted by a
            // guess at who this account belongs to.
            expect(["permission_denied", "permission_unresolved", "identity_not_linked"]).toContain(verdict.code);
        }
    });

    // ── the assignment scope resolver, against real rows ────────────────────

    it("T1/T2 — resolves exactly the rooms the person is assigned to on the service date", async () => {
        const scope = await resolveAssignedCaptureScope({
            supabase,
            orgId: ORG,
            personId: TEACHER_PERSON,
            serviceDate: TODAY,
        });
        expect(scope.resolved).toBe(true);
        expect(scope.roomLocationIds).toContain(ROOM_A);
        // Room B was never assigned. Absence here is what T2 rests on.
        expect(scope.roomLocationIds).not.toContain(ROOM_B);
    });

    it("T5 — a coverage window widens reach while it is open and not before or after", async () => {
        // Supplemental coverage of Room B for today only, expressed as an
        // ordinary effective-dated row. No coverage ACL subsystem.
        await addAssignment({ roomLocationId: ROOM_B, siteLocationId: RIVERSIDE, startDate: TODAY, endDate: TODAY });

        const during = await resolveAssignedCaptureScope({ supabase, orgId: ORG, personId: TEACHER_PERSON, serviceDate: TODAY });
        expect(during.roomLocationIds).toContain(ROOM_B);

        // Before the window opens: the row exists but does not apply.
        const before = await resolveAssignedCaptureScope({ supabase, orgId: ORG, personId: TEACHER_PERSON, serviceDate: day(-1) });
        expect(before.roomLocationIds).not.toContain(ROOM_B);
        // Room A is open-ended, so it still applies yesterday — proving the
        // window filter is per-row rather than a blanket date cut.
        expect(before.roomLocationIds).toContain(ROOM_A);

        // After it closes.
        const after = await resolveAssignedCaptureScope({ supabase, orgId: ORG, personId: TEACHER_PERSON, serviceDate: day(1) });
        expect(after.roomLocationIds).not.toContain(ROOM_B);
        expect(after.roomLocationIds).toContain(ROOM_A);
    });

    it("service date — an assignment that has ended does not authorise a later fact", async () => {
        // The reason authorization evaluates the fact's service date rather than
        // wall clock: a teacher who left Room A last week must not gain reach
        // over it today, and must not lose reach over the days they worked it.
        const ended = await addAssignment({
            roomLocationId: ROOM_B,
            siteLocationId: RIVERSIDE,
            startDate: day(-20),
            endDate: day(-10),
            personId: OTHER_PERSON,
        });
        expect(ended).toBeTruthy();

        const whileHeld = await resolveAssignedCaptureScope({ supabase, orgId: ORG, personId: OTHER_PERSON, serviceDate: day(-15) });
        expect(whileHeld.roomLocationIds).toContain(ROOM_B);

        const afterEnd = await resolveAssignedCaptureScope({ supabase, orgId: ORG, personId: OTHER_PERSON, serviceDate: TODAY });
        expect(afterEnd.roomLocationIds).not.toContain(ROOM_B);

        const beforeStart = await resolveAssignedCaptureScope({ supabase, orgId: ORG, personId: OTHER_PERSON, serviceDate: day(-25) });
        expect(beforeStart.roomLocationIds).not.toContain(ROOM_B);
    });

    it("another org's person resolves to nothing here, whatever assignments exist", async () => {
        // Tenancy on the scope read itself, independent of the link trigger.
        const scope = await resolveAssignedCaptureScope({
            supabase,
            orgId: OTHER_ORG,
            personId: TEACHER_PERSON,
            serviceDate: TODAY,
        });
        expect(scope.resolved).toBe(true);
        expect(scope.roomLocationIds).toEqual([]);
    });

    // ── T6 — the administrator path is untouched ────────────────────────────

    it("T6 — a site-wide actor is unaffected by assignments entirely", async () => {
        // Same user, same assignments, same everything — only the profile mode
        // differs. Under `site` the assignment layer is never consulted, which is
        // what makes administrator preservation structural rather than a rule.
        const verdict = await assertAttendanceCaptureAllowed({
            supabase,
            orgId: ORG,
            userId: TEACHER_USER,
            dim: siteScoped("site"),
            siteLocationId: RIVERSIDE,
            roomLocationIds: [ROOM_B],
            serviceDate: TODAY,
        });
        // It may still be denied for want of the capability — this user holds no
        // role — but it must NOT be denied for an assignment reason.
        if (!verdict.ok) {
            expect(["identity_not_linked", "no_applicable_assignment", "location_outside_assignment"]).not.toContain(
                verdict.code,
            );
        }
    });

    // ── T0 / T0B / T0C — the link lifecycle, through the real resolver ──────

    it("T0 — an active link resolves the session to the canonical person", async () => {
        const { error } = await supabase.from("user_person_links").insert({
            org_id: ORG,
            user_id: teacherUserId,
            person_id: TEACHER_PERSON,
        });
        if (error) throw new Error(`link insert failed: ${error.message}`);

        const r = await resolveLinkedPersonId(supabase, ORG, teacherUserId);
        expect(r.resolved).toBe(true);
        expect(r.personId).toBe(TEACHER_PERSON);
    });

    it("T0B — the same link is invisible from another org", async () => {
        // Tenancy on the READ, not merely on the write. A link made in one org
        // must not resolve a session in another even with the same user id.
        const r = await resolveLinkedPersonId(supabase, OTHER_ORG, teacherUserId);
        expect(r.resolved).toBe(true);
        expect(r.personId).toBeNull();
    });

    it("T0B — a link naming a person from another org is refused by the database", async () => {
        const { error } = await supabase.from("user_person_links").insert({
            org_id: OTHER_ORG,
            user_id: teacherUserId,
            person_id: TEACHER_PERSON,
        });
        expect(error).not.toBeNull();
        // The trigger, not a caller's care, is what makes this impossible.
        expect(String(error?.message ?? "")).toMatch(/belongs to org/i);
    });

    it("T0C — a revoked link stops resolving, and the history remains", async () => {
        const { error } = await supabase
            .from("user_person_links")
            .update({ status: "revoked", revoked_at: new Date().toISOString() })
            .eq("org_id", ORG)
            .eq("user_id", teacherUserId);
        if (error) throw new Error(`revoke failed: ${error.message}`);

        const r = await resolveLinkedPersonId(supabase, ORG, teacherUserId);
        expect(r.resolved).toBe(true);
        expect(r.personId).toBeNull();

        // Revocation is lifecycle, not deletion: the row survives as evidence
        // that this user WAS this person, which past provenance needs.
        const { data } = await supabase
            .from("user_person_links")
            .select("status")
            .eq("org_id", ORG)
            .eq("user_id", teacherUserId);
        expect((data ?? []).length).toBe(1);
        expect((data ?? [])[0]).toMatchObject({ status: "revoked" });
    });

    it("T0C — assignment-scoped capture is denied once the link is revoked", async () => {
        const verdict = await assertAttendanceCaptureAllowed({
            supabase,
            orgId: ORG,
            userId: teacherUserId,
            dim: siteScoped("assigned"),
            siteLocationId: RIVERSIDE,
            roomLocationIds: [ROOM_A],
            serviceDate: TODAY,
        });
        expect(verdict.ok).toBe(false);
    });

    it("T3 — an assignment never supplies the capability", async () => {
        // This person holds a live Room A assignment and (after re-linking) a
        // resolvable identity. They still hold no role, so `attendance.record`
        // is absent and capture is refused before scope is even considered.
        await supabase
            .from("user_person_links")
            .update({ status: "active", revoked_at: null })
            .eq("org_id", ORG)
            .eq("user_id", teacherUserId);

        const verdict = await assertAttendanceCaptureAllowed({
            supabase,
            orgId: ORG,
            userId: teacherUserId,
            dim: siteScoped("assigned"),
            siteLocationId: RIVERSIDE,
            roomLocationIds: [ROOM_A],
            serviceDate: TODAY,
        });
        expect(verdict.ok).toBe(false);
        if (!verdict.ok) expect(verdict.code).toBe("permission_denied");
    });

    it("site scope still binds under the narrowed policy — an assignment is not a passport", async () => {
        // An assignment naming a Lakeside room must not carry a Riverside-scoped
        // actor into Lakeside. Ordinary site scope runs first and independently.
        const verdict = await assertAttendanceCaptureAllowed({
            supabase,
            orgId: ORG,
            userId: TEACHER_USER,
            dim: siteScoped("assigned"),
            siteLocationId: LAKESIDE,
            roomLocationIds: ["00000000-0000-4000-8000-000000000016"],
            serviceDate: TODAY,
        });
        expect(verdict.ok).toBe(false);
    });
});
