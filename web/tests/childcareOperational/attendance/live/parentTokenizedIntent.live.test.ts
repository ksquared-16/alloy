/**
 * Parent tokenized intent — against the real database.
 *
 * The whole point of this slice is a boundary: a family can say what they EXPECT
 * and can never author what HAPPENED. A mock cannot fail that boundary, because
 * in a mock nothing is on the other side of it. So every scenario here runs the
 * real authorizer against real `action_links` rows, reaches the real
 * Expectations intake, and — where it matters — checks that the Attendance
 * ledger stayed empty.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { hashFormLinkToken } from "@/lib/public/forms/tokenHash";
import {
    submitParentAwayIntent,
    FAMILY_SUBMITTED_INTENT_AUTHORITY_KEY,
} from "@/lib/childcareOperational/attendance/parentIntent/submitParentAwayIntent";
import { PARENT_INTENT_CAPABILITY } from "@/lib/childcareOperational/attendance/parentIntent/parentIntentAuthority";
import { ratifyOperationalExpectation } from "@/lib/operationalExpectations/ratification/ratifyOperationalExpectation";
import { createSupabaseRatificationGateway } from "@/lib/operationalExpectations/ratification/supabaseRatificationGateway";
import { effectiveExpectationsForWindow } from "@/lib/operationalExpectations/query/effectiveExpectationsForWindow";
import { authorOperationalExpectation } from "@/lib/operationalExpectations/intake/authorOperationalExpectation";
import { createSupabaseAuthoringGateway } from "@/lib/operationalExpectations/intake/supabaseAuthoringGateway";
import { reviseChildAway } from "@/lib/childcareOperational/attendance/serviceDayExceptionCommands";
import { ATTENDANCE_EXPECTATION_PURPOSE } from "@/lib/childcareOperational/attendance/serviceDayExpectations";
import { createSupabaseExpectationQueryGateway } from "@/lib/operationalExpectations/query/supabaseExpectationQueryGateway";
import {
    ATTENDANCE_SUBJECT_KINDS,
    interpretServiceDay,
    applyObservedPresence,
    serviceDayAsOf,
} from "@/lib/childcareOperational/attendance/serviceDayExpectations";
import { listAttendanceEvents, recordAttendanceEvent } from "@/lib/childcareOperational/attendance/attendanceService";

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
if (env) {
    process.env.SUPABASE_URL ||= env.url;
    process.env.NEXT_PUBLIC_SUPABASE_URL ||= env.url;
    process.env.SUPABASE_SERVICE_ROLE_KEY ||= env.serviceKey;
    /*
     * DELIBERATELY NOT SET: `OE_LEDGER_AUTHOR_ENABLED`.
     *
     * An earlier version of this suite switched the global flag on so that P7
     * could pass. That would have certified a path which cannot run in
     * production as configured — the flag is OFF by default and governs the
     * GENERIC intake. Ratification now takes the same activated-purpose seam
     * authoring has, so these scenarios run in the configuration a real tenant
     * has, and if that seam regresses they report `disabled` instead of passing.
     */
}

const ORG = "00000000-0000-4000-8000-000000000001";
const RIVERSIDE = "00000000-0000-4000-8000-000000000010";
const ROOM_A = "00000000-0000-4000-8000-000000000013";
const CHILD_A = "00000000-0000-4000-8000-000070000050";
const AGREEMENT_A = "00000000-0000-4000-8000-000070000060";
const CHILD_B = "00000000-0000-4000-8000-000070000051";

const run = Date.now();
const TODAY = new Date().toISOString().slice(0, 10);
/** Run-unique future dates, so one run's lineage never reads another's. */
const dayOffset = (n: number) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 30 + (run % 200) + n);
    return d.toISOString().slice(0, 10);
};
const SICK_DAY = dayOffset(0);
const HOLIDAY_FROM = dayOffset(10);
const HOLIDAY_TO = dayOffset(14);

describeLive("parent tokenized intent — live", () => {
    const supabase = (env
        ? createClient(env.url, env.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
        : null) as unknown as SupabaseClient;

    const tokens: Record<string, string> = {};
    const createdUserIds: string[] = [];
    let ratifierUserId = "";

    const mkLink = async (
        name: string,
        over: Record<string, unknown> = {},
    ): Promise<void> => {
        const token = `cert-parent-${run}-${name}`;
        tokens[name] = token;
        const { error } = await supabase.from("action_links").insert({
            org_id: ORG,
            action_type: "parent_report_absence",
            entity_type: "customer_member",
            entity_id: CHILD_A,
            token_hash: hashFormLinkToken(token),
            short_code: `p${run % 100000}${name}`.slice(0, 12),
            expires_at: new Date(Date.now() + 7 * 86400_000).toISOString(),
            ...over,
        });
        if (error) throw new Error(`link fixture "${name}" failed: ${error.message}`);
    };

    async function cleanup() {
        const hashes = Object.values(tokens).map(hashFormLinkToken);
        if (hashes.length) await supabase.from("action_links").delete().in("token_hash", hashes);
        for (const id of createdUserIds) {
            await supabase.auth.admin.deleteUser(id).catch(() => undefined);
        }
    }

    beforeAll(async () => {
        await mkLink("valid");
        await mkLink("expired", { expires_at: new Date(Date.now() - 3600_000).toISOString() });
        await mkLink("revoked", { revoked_at: new Date().toISOString(), revoked_reason: "cert" });
        await mkLink("consumed", { consumed_at: new Date().toISOString() });
        await mkLink("wrongAction", { action_type: "customer_reschedule" });
        await mkLink("wrongSubjectKind", { entity_type: "opportunity" });
        await mkLink("childB", { entity_id: CHILD_B });
        await mkLink("ratifiable");

        // A REAL authenticated ratifier. `holder_id` is matched against the
        // actor's user id, so a fabricated uuid would prove nothing about whether
        // a real staff member can ratify.
        const created = await supabase.auth.admin.createUser({
            email: `cert-ratifier-${run}@example.test`,
            password: `Cert-${run}-Ratify!`,
            email_confirm: true,
        });
        if (created.error || !created.data.user) throw new Error(`ratifier fixture failed: ${created.error?.message}`);
        ratifierUserId = created.data.user.id;
        createdUserIds.push(ratifierUserId);

        // The governed authority family intent is filed under, and a grant of it
        // to one human. This is ADMINISTRATION, not something Thread 6 builds a
        // UI for — but without it no family intent is ratifiable, so the
        // certification establishes it explicitly rather than assuming it.
        const auth = await supabase.rpc("upsert_operational_authority", {
            p_org_id: ORG,
            p_authority_key: FAMILY_SUBMITTED_INTENT_AUTHORITY_KEY,
            p_label: "Family submitted intent",
            p_description: "Known-away intent submitted by a family through a bounded link.",
            p_kind: "operational",
            p_is_active: true,
            p_actor: null,
        });
        if (auth.error) throw new Error(`authority fixture failed: ${auth.error.message}`);

        const grant = await supabase.rpc("grant_operational_authority_assignment", {
            p_org_id: ORG,
            p_authority_key: FAMILY_SUBMITTED_INTENT_AUTHORITY_KEY,
            p_holder_type: "human",
            p_holder_id: ratifierUserId,
            p_scope_type: "organization",
            p_scope_id: null,
            p_effective_start: new Date(Date.now() - 3600_000).toISOString(),
            p_effective_end: null,
            p_actor: null,
        });
        if (grant.error) throw new Error(`authority grant fixture failed: ${grant.error.message}`);
    });

    afterAll(cleanup);

    const submit = (name: string, over: Record<string, unknown> = {}) =>
        submitParentAwayIntent({
            supabase,
            plaintextToken: tokens[name],
            fromDate: SICK_DAY,
            reasonKey: "sick",
            ...over,
        } as Parameters<typeof submitParentAwayIntent>[0]);

    const effectiveFor = async (childId: string, serviceDate: string) =>
        effectiveExpectationsForWindow(
            {
                orgId: ORG,
                subjects: [{ kind: ATTENDANCE_SUBJECT_KINDS.child, id: childId }],
                asOf: serviceDayAsOf(serviceDate),
            },
            createSupabaseExpectationQueryGateway(supabase),
        );

    // ── P1 — sick ──────────────────────────────────────────────────────────

    it("P1 — a valid link authors a PROPOSED known-away expectation, and no Attendance fact", async () => {
        const out = await submit("valid", { note: "temperature since last night" });
        expect(out.status).toBe("authored");
        if (out.status !== "authored") return;

        // Standing is derived, never chosen. A family cannot bind the nursery.
        expect(out.act.standing).toBe("proposed");
        expect(out.act.modality).toBe("intended");

        // It is really in the ledger, under the governed family authority.
        const { data } = await supabase
            .from("operational_expectations")
            .select("id, org_id, authority_key, author_class, subject_kind, subject_ref, standing, condition")
            .eq("id", out.act.id)
            .single();
        expect(data).toMatchObject({
            org_id: ORG,
            authority_key: FAMILY_SUBMITTED_INTENT_AUTHORITY_KEY,
            author_class: "external",
            subject_kind: "child",
            standing: "proposed",
        });

        // And the resolver reads it back as this child being known away.
        const { effective } = await effectiveFor(CHILD_A, SICK_DAY);
        const authored = effective.find((e) => e.expectationId === out.act.id);
        expect(authored).toBeTruthy();

        /*
         * The REASON is read from the expectation this scenario authored, not
         * from whichever one the resolver surfaced.
         *
         * `interpretServiceDay` answers one expectation per child, and this
         * certification tenant accumulates them: the ledger is append-only, the
         * run-derived dates collide across runs, and 43 days already carry more
         * than one family-authored expectation for this child — several with
         * both `sick` and `holiday`. Asserting the surfaced reason was asserting
         * something about the tenant's history rather than about this submission.
         */
        expect((authored?.condition as { params?: { reason_key?: string } })?.params?.reason_key).toBe("sick");

        const interpreted = interpretServiceDay({
            siteLocationId: RIVERSIDE,
            scheduledChildIds: [CHILD_A],
            effective,
        });
        // Any live child-away intent reads as known-away, whichever one wins.
        expect(interpreted[0]?.interpretation).toBe("known_away");
    });

    it("P5 — the same submission wrote nothing to the Attendance ledger", async () => {
        // The capability says it cannot author observed facts. This checks the
        // claim against the ledger rather than trusting the constant.
        expect(PARENT_INTENT_CAPABILITY.report_absence.authorsObservedFact).toBe(false);

        const events = await listAttendanceEvents(supabase, ORG, { enrollmentAgreementId: AGREEMENT_A });
        expect(events.filter((e) => e.service_date === SICK_DAY)).toHaveLength(0);
    });

    // ── P2 — vacation ──────────────────────────────────────────────────────

    it("P2 — a future range covers every day of the holiday, including the last", async () => {
        const out = await submit("valid", {
            fromDate: HOLIDAY_FROM,
            toDate: HOLIDAY_TO,
            reasonKey: "holiday",
        });
        expect(out.status).toBe("authored");
        if (out.status !== "authored") return;

        for (const day of [HOLIDAY_FROM, HOLIDAY_TO]) {
            const { effective } = await effectiveFor(CHILD_A, day);
            expect(effective.map((e) => e.expectationId)).toContain(out.act.id);
            const interpreted = interpretServiceDay({
                siteLocationId: RIVERSIDE,
                scheduledChildIds: [CHILD_A],
                effective,
            });
            expect(interpreted[0]?.interpretation).toBe("known_away");
        }

        /*
         * The day AFTER the holiday is not covered. An off-by-one here would
         * silently suppress a missing-arrival signal for a child who IS expected.
         *
         * Asserted as "this expectation does not reach that day" rather than "that
         * day is normal": the expectation ledger is append-only, so this shared
         * certification child carries every previous run's holidays, and a claim
         * about the whole day would be a claim about all of them.
         */
        const { effective: after } = await effectiveFor(CHILD_A, dayOffset(15));
        expect(after.map((e) => e.expectationId)).not.toContain(out.act.id);
    });

    // ── P3 — subject escalation ────────────────────────────────────────────

    it("P3 — a link for one child cannot be used to speak for another", async () => {
        const out = await submit("valid", {
            assertedChildCustomerMemberId: CHILD_B,
            fromDate: dayOffset(20),
            note: `escalation-${run}`,
        });
        expect(out.status).toBe("denied");
        if (out.status !== "denied") return;
        expect(out.code).toBe("subject_mismatch");

        /*
         * Fail CLOSED. Asserted by IDENTITY rather than by an empty list: the
         * expectation ledger is append-only and this certification child carries
         * every previous run's expectations, so "nothing exists for this child on
         * this date" is a claim about history rather than about this scenario.
         */
        expect(out).not.toHaveProperty("act");
        const { effective } = await effectiveFor(CHILD_B, dayOffset(20));
        expect(effective.map((e) => e.condition?.note ?? null)).not.toContain(`escalation-${run}`);
    });

    it("P3 — the subject comes from the link even when the caller asserts nothing", async () => {
        const day = dayOffset(21);
        const out = await submit("childB", { fromDate: day, reasonKey: "family" });
        expect(out.status).toBe("authored");

        if (out.status !== "authored") return;

        // Child B's link speaks for child B, and only for child B — asserted by
        // the authored expectation's identity, not by counting rows on a child
        // whose ledger accumulates across every certification run.
        const b = await effectiveFor(CHILD_B, day);
        expect(b.effective.map((e) => e.expectationId)).toContain(out.act.id);
        const a = await effectiveFor(CHILD_A, day);
        expect(a.effective.map((e) => e.expectationId)).not.toContain(out.act.id);
    });

    // ── P4 — expired / revoked / consumed ──────────────────────────────────

    it("P4 — expired, revoked and consumed links all fail closed and say nothing extra", async () => {
        const day = dayOffset(30);
        for (const [name, code] of [
            ["expired", "expired"],
            ["revoked", "revoked"],
            ["consumed", "consumed"],
        ] as const) {
            const out = await submit(name, { fromDate: day, note: `refused-${run}` });
            expect(out.status).toBe("denied");
            if (out.status !== "denied") continue;
            expect(out.code).toBe(code);
            // The bearer is told the same sentence in every case: the difference
            // between "expired" and "revoked" is exactly what a prober wants.
            expect(out.message).toBe("This link is no longer valid.");
        }

        // Nothing this scenario submitted reached the ledger. Identified by the
        // note it would have carried, for the append-only reason above.
        const { effective } = await effectiveFor(CHILD_A, day);
        expect(effective.map((e) => e.condition?.note ?? null)).not.toContain(`refused-${run}`);
    });

    it("P4 — a token nobody issued is refused", async () => {
        const out = await submitParentAwayIntent({
            supabase,
            plaintextToken: `not-a-real-token-${run}`,
            fromDate: dayOffset(31),
            reasonKey: "sick",
        });
        expect(out.status).toBe("denied");
    });

    // ── P5 — capability escalation ─────────────────────────────────────────

    it("P5 — a link issued for another action cannot report an absence", async () => {
        const out = await submit("wrongAction", { fromDate: dayOffset(32) });
        expect(out.status).toBe("denied");
        if (out.status !== "denied") return;
        expect(out.code).toBe("wrong_intent");
    });

    it("P5 — a link bound to something that is not a child is refused", async () => {
        const out = await submit("wrongSubjectKind", { fromDate: dayOffset(33) });
        expect(out.status).toBe("denied");
        if (out.status !== "denied") return;
        expect(out.code).toBe("wrong_subject_kind");
    });

    it("P5 — the payload cannot smuggle a reason the link may not report", async () => {
        const out = await submit("valid", { fromDate: dayOffset(34), reasonKey: "excluded_by_policy" });
        expect(out.status).toBe("denied");
        if (out.status !== "denied") return;
        expect(out.code).toBe("invalid_reason");
    });

    // ── P6 — replay ────────────────────────────────────────────────────────

    it("P6 — resubmitting the same report converges on the one expectation", async () => {
        const day = dayOffset(40);
        const first = await submit("valid", { fromDate: day });
        const second = await submit("valid", { fromDate: day });
        expect(first.status).toBe("authored");
        expect(second.status).toBe("authored");
        if (first.status !== "authored" || second.status !== "authored") return;

        // Idempotency is keyed on the link plus the content of the assertion, so
        // a double-tap is the same act rather than two absences for one day.
        expect(second.act.id).toBe(first.act.id);
        expect(second.idempotent).toBe(true);

        // ONE expectation for that one report — counted by identity, not by the
        // size of a ledger that never forgets.
        const { effective } = await effectiveFor(CHILD_A, day);
        expect(effective.filter((e) => e.expectationId === first.act.id)).toHaveLength(1);
    });

    it("P6 — a genuinely different report is a new expectation, not a swallowed retry", async () => {
        const day = dayOffset(41);
        const sick = await submit("valid", { fromDate: day, reasonKey: "sick" });
        const holiday = await submit("valid", { fromDate: day, reasonKey: "holiday" });
        expect(sick.status).toBe("authored");
        expect(holiday.status).toBe("authored");
        if (sick.status !== "authored" || holiday.status !== "authored") return;
        expect(holiday.act.id).not.toBe(sick.act.id);
    });

    // ── P7 — ratification ──────────────────────────────────────────────────

    it("P7 — an authorized human ratifies family intent to BINDING", async () => {
        const day = dayOffset(50);
        const authored = await submit("ratifiable", { fromDate: day, reasonKey: "holiday" });
        expect(authored.status).toBe("authored");
        if (authored.status !== "authored") return;
        expect(authored.act.standing).toBe("proposed");

        const ratified = await ratifyOperationalExpectation(
            { idempotencyKey: `cert-ratify-${run}-${day}`, expectationId: authored.act.id, rationale: "Confirmed with the family." },
            {
                orgId: ORG,
                actorUserId: ratifierUserId,
                actorLabel: "Cert ratifier",
                actorAuthenticated: true,
                ratifierAuthorityKey: FAMILY_SUBMITTED_INTENT_AUTHORITY_KEY,
            },
            createSupabaseRatificationGateway(supabase, ATTENDANCE_EXPECTATION_PURPOSE),
        );
        expect(ratified.status).toBe("ratified");
        if (ratified.status !== "ratified") return;
        expect(ratified.act.newStanding).toBe("binding");

        /*
         * THE ROW DOES NOT MOVE, AND THAT IS THE DESIGN.
         *
         * "binding is NEVER a mutated column — it is recorded by a new,
         * immutable, lineage-linked Ratification Act, and effective standing is
         * DERIVED from its presence." The proof of binding is therefore the act,
         * not the column, and asserting the column would be asserting that this
         * ledger is not append-only.
         */
        const { data: row } = await supabase
            .from("operational_expectations")
            .select("standing")
            .eq("id", authored.act.id)
            .single();
        expect(row).toMatchObject({ standing: "proposed" });

        const { data: act } = await supabase
            .from("operational_expectation_ratifications")
            .select("prior_standing, new_standing, ratified_by_user_id, ratifier_authority_key")
            .eq("expectation_id", authored.act.id)
            .single();
        expect(act).toMatchObject({
            prior_standing: "proposed",
            new_standing: "binding",
            ratified_by_user_id: ratifierUserId,
            ratifier_authority_key: FAMILY_SUBMITTED_INTENT_AUTHORITY_KEY,
        });

        /*
         * AND THE CONSUMER SEES IT. This is the leg that was missing: the write
         * path was real while every reader still said `proposed`, so a ratified
         * expectation was indistinguishable from an unratified one. The resolver
         * now derives governed standing from the ratification evidence, and
         * reports BOTH — what was authored, and what governs now.
         */
        const { effective } = await effectiveFor(CHILD_A, day);
        const governed = effective.find((e) => e.expectationId === authored.act.id);
        expect(governed).toBeTruthy();
        expect(governed?.standing).toBe("proposed");
        expect(governed?.effectiveStanding).toBe("binding");
        expect(governed?.ratifiedUnderAuthorityKey).toBe(FAMILY_SUBMITTED_INTENT_AUTHORITY_KEY);
        expect(governed?.ratifiedAt).toBeTruthy();
    });

    it("P7 — without a ratification, the consumer sees a proposal and nothing more", async () => {
        const day = dayOffset(52);
        const authored = await submit("valid", { fromDate: day, reasonKey: "family" });
        expect(authored.status).toBe("authored");
        if (authored.status !== "authored") return;

        const { effective } = await effectiveFor(CHILD_A, day);
        const e = effective.find((x) => x.expectationId === authored.act.id);
        expect(e?.standing).toBe("proposed");
        // The whole point: unratified must NOT read as governed.
        expect(e?.effectiveStanding).toBe("proposed");
        expect(e?.ratifiedAt).toBeNull();
    });

    it("P7 — a ratification that was refused makes nothing effective", async () => {
        const day = dayOffset(53);
        const authored = await submit("ratifiable", { fromDate: day });
        expect(authored.status).toBe("authored");
        if (authored.status !== "authored") return;

        // A real authenticated user who holds no grant on this authority.
        const outsider = await supabase.auth.admin.createUser({
            email: `cert-outsider-${run}@example.test`,
            password: `Cert-${run}-Outsider!`,
            email_confirm: true,
        });
        if (outsider.error || !outsider.data.user) throw new Error("outsider fixture failed");
        createdUserIds.push(outsider.data.user.id);

        const refused = await ratifyOperationalExpectation(
            { idempotencyKey: `cert-badratify-${run}-${day}`, expectationId: authored.act.id },
            {
                orgId: ORG,
                actorUserId: outsider.data.user.id,
                actorAuthenticated: true,
                ratifierAuthorityKey: FAMILY_SUBMITTED_INTENT_AUTHORITY_KEY,
            },
            createSupabaseRatificationGateway(supabase, ATTENDANCE_EXPECTATION_PURPOSE),
        );
        expect(refused.status).toBe("rejected");
        if (refused.status === "rejected") expect(refused.code).toBe("insufficient_authority");

        // No evidence written, so nothing for the resolver to promote.
        const { effective } = await effectiveFor(CHILD_A, day);
        expect(effective.find((x) => x.expectationId === authored.act.id)?.effectiveStanding).toBe("proposed");
    });

    it("P7 — a revision does not inherit its predecessor's ratification", async () => {
        const day = dayOffset(54);
        const authored = await submit("ratifiable", { fromDate: day, reasonKey: "holiday" });
        expect(authored.status).toBe("authored");
        if (authored.status !== "authored") return;

        const ratified = await ratifyOperationalExpectation(
            { idempotencyKey: `cert-ratify-super-${run}`, expectationId: authored.act.id },
            {
                orgId: ORG,
                actorUserId: ratifierUserId,
                actorAuthenticated: true,
                ratifierAuthorityKey: FAMILY_SUBMITTED_INTENT_AUTHORITY_KEY,
            },
            createSupabaseRatificationGateway(supabase, ATTENDANCE_EXPECTATION_PURPOSE),
        );
        expect(ratified.status).toBe("ratified");
        expect(
            (await effectiveFor(CHILD_A, day)).effective.find((e) => e.expectationId === authored.act.id)
                ?.effectiveStanding,
        ).toBe("binding");

        /*
         * The plan changes. `operational_expectation_ratifications` has no
         * revocation column — the model supports supersession of the EXPECTATION
         * instead, and a ratification names one expectation. So the revision must
         * come back to `proposed`: governance attaches to what was actually
         * reviewed, not to a lineage a later author can silently extend.
         */
        const revised = await authorOperationalExpectation(
            reviseChildAway({
                idempotencyKey: `cert-revise-${run}-${day}`,
                actorUserId: "",
                authority: {
                    authorityKey: FAMILY_SUBMITTED_INTENT_AUTHORITY_KEY,
                    authorClass: "external",
                },
                reasonKey: "holiday",
                childId: CHILD_A,
                range: { fromDate: day, toDate: dayOffset(55) },
                predecessorId: authored.act.id,
            }),
            { orgId: ORG, actorUserId: null, actorLabel: "Family (link)", actorAuthenticated: true },
            createSupabaseAuthoringGateway(supabase, ATTENDANCE_EXPECTATION_PURPOSE),
        );
        expect(revised.status).toBe("authored");
        if (revised.status !== "authored") return;

        const { effective } = await effectiveFor(CHILD_A, day);
        const now = effective.find((e) => e.expectationId === revised.act.id);
        expect(now).toBeTruthy();
        expect(now?.effectiveStanding).toBe("proposed");
        expect(now?.ratifiedAt).toBeNull();
    });

    it("P7 — a family cannot ratify its own intent", async () => {
        const day = dayOffset(51);
        const authored = await submit("ratifiable", { fromDate: day });
        expect(authored.status).toBe("authored");
        if (authored.status !== "authored") return;

        // The link id is not a holder of anything, and `external` is not the
        // holder space a ratifier is looked up in. Both are true at once, which
        // is why this fails rather than merely being unlikely.
        const selfRatified = await ratifyOperationalExpectation(
            { idempotencyKey: `cert-selfratify-${run}-${day}`, expectationId: authored.act.id },
            {
                orgId: ORG,
                actorUserId: null,
                actorLabel: "Family (link)",
                actorAuthenticated: true,
                ratifierAuthorityKey: FAMILY_SUBMITTED_INTENT_AUTHORITY_KEY,
            },
            createSupabaseRatificationGateway(supabase, ATTENDANCE_EXPECTATION_PURPOSE),
        );
        expect(selfRatified.status).toBe("rejected");

        // No act was recorded, so nothing derives binding for this expectation.
        const { data } = await supabase
            .from("operational_expectation_ratifications")
            .select("id")
            .eq("expectation_id", authored.act.id);
        expect(data ?? []).toHaveLength(0);
    });

    // ── P8 — contradiction ─────────────────────────────────────────────────

    it("P8 — a child who attends anyway keeps BOTH the intent and the observed fact", async () => {
        const authored = await submit("valid", { fromDate: TODAY, reasonKey: "sick" });
        expect(authored.status).toBe("authored");
        if (authored.status !== "authored") return;

        const ratified = await ratifyOperationalExpectation(
            { idempotencyKey: `cert-ratify-today-${run}`, expectationId: authored.act.id },
            {
                orgId: ORG,
                actorUserId: ratifierUserId,
                actorAuthenticated: true,
                ratifierAuthorityKey: FAMILY_SUBMITTED_INTENT_AUTHORITY_KEY,
            },
            createSupabaseRatificationGateway(supabase, ATTENDANCE_EXPECTATION_PURPOSE),
        );
        expect(ratified.status).toBe("ratified");

        // Reality arrives and disagrees with the plan.
        const fact = await recordAttendanceEvent(supabase, {
            orgId: ORG,
            enrollmentAgreementId: AGREEMENT_A,
            eventKind: "check_in",
            eventAt: `${TODAY}T08:15:00.000Z`,
            serviceDate: TODAY,
            roomLocationId: ROOM_A,
            idempotencyKey: `cert-parent-contradiction-${run}`,
            actor: { actorType: "staff", actorLabel: "Cert operator", sourceType: "operator_action", sourceKey: "cert" },
        } as Parameters<typeof recordAttendanceEvent>[1]);
        expect(fact.id).toBeTruthy();

        // NEITHER erases the other. The plan was validly held; the child is
        // validly here; and the operator sees both at once.
        const { data: stillThere } = await supabase
            .from("operational_expectations")
            .select("id, standing")
            .eq("id", authored.act.id)
            .single();
        expect(stillThere).toBeTruthy();
        const { data: stillRatified } = await supabase
            .from("operational_expectation_ratifications")
            .select("new_standing")
            .eq("expectation_id", authored.act.id)
            .single();
        expect(stillRatified).toMatchObject({ new_standing: "binding" });

        const events = await listAttendanceEvents(supabase, ORG, { enrollmentAgreementId: AGREEMENT_A });
        expect(events.some((e) => e.id === fact.id)).toBe(true);

        const { effective } = await effectiveFor(CHILD_A, TODAY);
        const interpreted = interpretServiceDay({
            siteLocationId: RIVERSIDE,
            scheduledChildIds: [CHILD_A],
            effective,
        });
        expect(interpreted[0]?.interpretation).toBe("known_away");

        // Present for every physical purpose, and visibly not what was planned.
        expect(applyObservedPresence(interpreted[0]!, "present")).toBe("attended_despite_plan");
    });
});
