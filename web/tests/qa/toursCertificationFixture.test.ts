/**
 * The Tours certification fixture (`dev:qa:tours-fixture`) against SYNTHETIC ports — no database, no
 * preview, no network. Proves the runner's contract with the installed toolkit (argv, output lines, namespace,
 * reset bound), its guards, its ownership, idempotency and partial-failure recovery, the fail-closed outbound
 * contract, secret-free output, and that the fixture's data yields the G-T2 and G-T5 semantics through the
 * product's own functions, and its consumption of the installed executor's A741 binding (persona org, trusted
 * preview origin, digest-bound session) with negative controls for each — no seed-org fallback. The v2 authority is
 * injected here as a verdict (the real verifier over a synthetic executor store is toursFixtureAuthority.test.ts).
 * The two run-owned lead-capture forms: ownership, collision and foreign-org refusals, idempotency, partial-failure
 * recovery and their retained disposition. Integrated proof on an isolated QA run is NOT claimed here.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
    LINK_PLAN,
    TOURS_BINDING_ENV_KEYS,
    TOURS_FIXTURE_MARKER,
    TOURS_FIXTURE_MARKER_KEY,
    TOURS_FIXTURE_NAMESPACE,
    TOURS_FIXTURE_RESET_LIMIT,
    TOURS_FIXTURE_PERSONA_ORG,
    TOURS_FIXTURE_ROLE_KEY,
    TOURS_FIXTURE_SITE,
    LEGACY_RULE,
    bindingFromEnv,
    guardToursFixture,
    makeSink,
    nextLegacySlot,
    runToursFixture,
    sessionFromStorageState,
    sha256Hex,
    type LocationLinkRow,
    type MarkerBooking,
    type MarkerFamily,
    type MarkerRule,
    type AttestedConnection,
    type PreviewSession,
    type ToursAuthorityVerdict,
    type ToursClientConfig,
    type ToursFixtureOperation,
    type ToursFixturePorts,
    type ToursFixtureWorld,
} from "@/lib/qa/toursFixture/toursCertificationFixture";
import {
    FIXTURE_FORM_SCHEMA,
    FORM_PLAN,
    TOURS_FIXTURE_FORM_INTENT,
    formKeyFor,
    runMarker,
    type FixtureFormRow,
    type FixtureFormVersionRow,
} from "@/lib/qa/toursFixture/toursFixtureForms";
import { validateFormSchema } from "@/lib/forms/schema";
import { buildLocationSpecificLinkMetadata } from "@/lib/forms/locationSpecificPublicLinkMetadata";
import { expandTourScheduleToRuleValues } from "@/lib/tours/schedules/tourWeeklySchedule";

const root = resolve(__dirname, "../..");
const LOCATION = TOURS_FIXTURE_SITE.id;
const SEED_ORG_ID = "00000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-10-30T18:00:00Z");

/* ── the installed executor's A741 binding, as fixtureChildEnv / runIsolatedFixture build it ── */
const PREVIEW_ORIGIN = "http://127.0.0.1:3101";
const AUTHORITY_FILE = "/state/isolated-fixture/authority/tfx-req-1.0123456789abcdef.json";
const SESSION_FILE = "/state/qa/sessions/qar_4246ac22ece0/admin.json";
const CANDIDATE = "4edb2ab3f26b096ae876ab611841d8cda1cc08ac";
const BINDING_DIGEST = "b".repeat(64);
const RUN = "qar_4246ac22ece0";
const API_URL = "http://127.0.0.1:56130";
const SESSION_TEXT = JSON.stringify({
    cookies: [
        { name: "sb-alloy-local-auth", value: "cookie-SENTINEL", domain: "127.0.0.1" },
        { name: "foreign", value: "foreign-SENTINEL", domain: "evil.example" },
    ],
    // A URL in the session file is never used: requests go to the executor's preview origin.
    origins: [{ origin: "http://127.0.0.1:9" }],
});
const BASE_ENV = {
    ALLOY_CERT_FIXTURE: "tours_certification",
    ALLOY_CERT_NAMESPACE: TOURS_FIXTURE_NAMESPACE,
    ALLOY_QA_RUN_ID: RUN,
    ALLOY_QA_ENVIRONMENT_ID: "certenv-3669337690",
    SUPABASE_URL: API_URL,
    SUPABASE_SERVICE_ROLE_KEY: "service-key-SENTINEL-never-printed",
    DATABASE_URL: "postgresql://postgres:db-SENTINEL@127.0.0.1:56131/postgres",
    PATH: "/usr/bin",
};
function boundEnv(): Record<string, string | undefined> {
    return {
        ...BASE_ENV,
        ALLOY_QA_PERSONA: "admin",
        ALLOY_QA_SESSION_FILE: SESSION_FILE,
        ALLOY_CERT_FIXTURE_ORG_ID: TOURS_FIXTURE_PERSONA_ORG.id,
        ALLOY_CERT_FIXTURE_ORG_SOURCE: "persona",
        ALLOY_QA_PREVIEW_ORIGIN: PREVIEW_ORIGIN,
        ALLOY_QA_SESSION_ORIGIN: PREVIEW_ORIGIN,
        ALLOY_QA_SESSION_SHA256: sha256Hex(SESSION_TEXT),
        ALLOY_QA_CANDIDATE_SHA: CANDIDATE,
        ALLOY_QA_REQUEST_ID: "tfx-req-1",
        ALLOY_QA_BINDING_DIGEST: BINDING_DIGEST,
        ALLOY_QA_BINDING_EXPIRES_AT: "2026-10-30T19:00:00.000Z",
        ALLOY_QA_AUTHORITY_FILE: AUTHORITY_FILE,
        ALLOY_QA_AUTHORITY_SHA256: "a".repeat(64),
    };
}
const ENV = boundEnv();
type Files = Record<string, string | null>;
const FILES: Files = { [SESSION_FILE]: SESSION_TEXT };

/** The verdict toursFixtureAuthority.mjs returns for a genuine v2 record of this execution (fields the runner uses). */
function genuine(over: Partial<Extract<ToursAuthorityVerdict, { ok: true }>["authority"]> = {}): ToursAuthorityVerdict {
    return {
        ok: true,
        authority: {
            org_id: TOURS_FIXTURE_PERSONA_ORG.id, org_key: "qa_shared", qa_run_id: RUN, environment_id: "certenv-3669337690", request_id: "tfx-req-1",
            candidate_sha: CANDIDATE, api_url: API_URL, api_identity_digest: "d".repeat(64), program_pins_digest: "e".repeat(64), ...over,
        },
    };
}

const MARK = { [TOURS_FIXTURE_MARKER_KEY]: TOURS_FIXTURE_MARKER };
const ORG = TOURS_FIXTURE_PERSONA_ORG.id;
const FOREIGN_ORG = "ad53fee2-2570-460f-9300-f0e106c473b6";
const KEY_A = formKeyFor("form_a", RUN);
const KEY_B = formKeyFor("form_b", RUN);

type WorldOpts = {
    bindings?: number;
    outboundDelta?: number;
    failCreateLinkAt?: number;
    extraMarkerRows?: number;
    namespaceOutbound?: number;
    ownLocationRuleCovering?: boolean;
    /** The org the session's Forms routes act in (the route's ctx.orgId). */
    routeOrg?: string;
    failCreateDraftAt?: number;
    failPublishAt?: number;
    /** Rows already present before the fixture runs. */
    preForms?: FixtureFormRow[];
    preVersions?: FixtureFormVersionRow[];
    preLinks?: LocationLinkRow[];
};

/** In-memory stand-in for the isolated database and the preview's Forms routes (route semantics: org = the session's). */
function world(opts: WorldOpts = {}) {
    let clock = Date.parse("2026-10-30T00:00:00Z");
    let seq = 0;
    const id = (p: string) => `${p}-${++seq}`;
    const state = {
        rules: [] as (MarkerRule & { marker: boolean })[],
        bookings: [] as MarkerBooking[],
        family: { personId: null, customerId: null, opportunityId: null, membershipIds: [] } as MarkerFamily,
        links: [...(opts.preLinks ?? [])] as LocationLinkRow[],
        forms: [...(opts.preForms ?? [])] as FixtureFormRow[],
        versions: [...(opts.preVersions ?? [])] as FixtureFormVersionRow[],
        outbound: { messages: 7, scheduled: 3 },
        calls: [] as string[],
        linkCreates: 0,
        formCreates: 0,
        draftCreates: 0,
        publishes: 0,
    };
    const routeOrg = opts.routeOrg ?? ORG;
    /** The run the ports were bound to (the real port stamps `world.runId` on every link). */
    let boundRun = RUN;
    for (let i = 0; i < (opts.extraMarkerRows ?? 0); i++) state.bookings.push({ id: id("bk"), location_id: LOCATION, status_key: "pending_approval", start_at: NOW.toISOString(), end_at: NOW.toISOString() });
    const isMarked = (m: unknown) => (m as Record<string, unknown> | null)?.[TOURS_FIXTURE_MARKER_KEY] === TOURS_FIXTURE_MARKER;
    const ports: ToursFixturePorts = {
        orgAndLocationExist: async () => true,
        countActiveProviderBindings: async () => opts.bindings ?? 0,
        countOutboundRows: async () => ({ ...state.outbound }),
        countNamespaceOutboundRows: async () => opts.namespaceOutbound ?? 0,
        findMarkerRules: async () => state.rules.filter((r) => r.marker),
        findLocationRules: async () =>
            opts.ownLocationRuleCovering ? [{ id: "own", location_id: LOCATION, day_of_week: 4, start_time: "12:00:00", end_time: "15:00:00", schedule_id: "s-own" }] : [],
        createLegacyRule: async () => {
            state.calls.push("createLegacyRule");
            // The real writer's own expansion — the legacy shape is the product's, location_id NULL.
            const rows = expandTourScheduleToRuleValues(
                { name: LEGACY_RULE.name, days: [LEGACY_RULE.day_of_week], windows: [{ start_time: LEGACY_RULE.start_time, end_time: LEGACY_RULE.end_time }], timezone: LEGACY_RULE.timezone, slot_duration_minutes: 30, buffer_minutes: 0, max_bookings_per_slot: 1, approval_required: true, is_active: true },
                { orgId: "org", locationId: null, scheduleId: "s-legacy" },
            );
            for (const r of rows) state.rules.push({ id: id("rule"), location_id: r.location_id, day_of_week: r.day_of_week, start_time: `${r.start_time}:00`, end_time: `${r.end_time}:00`, schedule_id: "s-legacy", marker: true });
            if (opts.outboundDelta) state.outbound.messages += opts.outboundDelta;
        },
        deleteRuleSchedule: async (s) => {
            const before = state.rules.length;
            state.rules = state.rules.filter((r) => r.schedule_id !== s);
            return before - state.rules.length;
        },
        deleteRules: async (ids) => {
            const before = state.rules.length;
            state.rules = state.rules.filter((r) => !ids.includes(r.id));
            return before - state.rules.length;
        },
        findMarkerFamily: async () => ({ ...state.family, membershipIds: [...state.family.membershipIds] }),
        createFamily: async (f) => {
            state.calls.push("createFamily");
            state.family = { personId: f.personId ?? id("person"), customerId: f.customerId ?? id("cust"), opportunityId: f.opportunityId ?? id("opp"), membershipIds: f.membershipIds.length ? f.membershipIds : [id("cp")] };
            return state.family;
        },
        deleteFamily: async (f) => {
            const n = [f.personId, f.customerId, f.opportunityId].filter(Boolean).length + f.membershipIds.length;
            state.family = { personId: null, customerId: null, opportunityId: null, membershipIds: [] };
            return n;
        },
        findMarkerBookings: async () => [...state.bookings],
        insertLegacyPendingBooking: async (b) => {
            state.calls.push("insertLegacyPendingBooking");
            state.bookings.push({ id: id("bk"), location_id: LOCATION, status_key: "pending_approval", start_at: b.startAt, end_at: b.endAt });
        },
        deleteBookings: async (ids) => {
            const before = state.bookings.length;
            state.bookings = state.bookings.filter((b) => !ids.includes(b.id));
            return before - state.bookings.length;
        },

        // ── forms: the database reads (org-scoped as the real port) and the three product routes ──
        findFixtureFormRows: async (keys) => state.forms.filter((f) => f.org_id === ORG && (keys.includes(f.key) || isMarked(f.metadata))).map((f) => ({ ...f })),
        countFormKeysOutsideOrg: async (keys) => state.forms.filter((f) => f.org_id !== ORG && keys.includes(f.key)).length,
        findFormOrg: async (formId) => state.forms.find((f) => f.id === formId)?.org_id ?? null,
        listFormVersions: async (ids) => state.versions.filter((v) => ids.includes(v.form_definition_id)).map((v) => ({ ...v })),
        createForm: async ({ key, name, metadata }) => {
            state.formCreates += 1;
            // POST /api/admin/forms: the route's org, the route's 409 on a taken key.
            if (state.forms.some((f) => f.org_id === routeOrg && f.key === key)) throw new Error("preview_409");
            const row = { id: id("form"), org_id: routeOrg, key, name, is_active: true, metadata: { ...metadata } };
            state.forms.push(row);
            return row.id;
        },
        createDraftVersion: async ({ formId, schema, metadata }) => {
            state.draftCreates += 1;
            if (opts.failCreateDraftAt && state.draftCreates === opts.failCreateDraftAt) throw new Error("preview_500 SENTINEL");
            const form = state.forms.find((f) => f.id === formId && f.org_id === routeOrg);
            if (!form) throw new Error("preview_404");
            validateFormSchema(schema); // the route's own gate
            const row = { id: id("ver"), org_id: routeOrg, form_definition_id: formId, status: "draft", metadata: { ...metadata } };
            state.versions.push(row);
            return row.id;
        },
        publishVersion: async ({ formId, versionId }) => {
            state.publishes += 1;
            if (opts.failPublishAt && state.publishes === opts.failPublishAt) throw new Error("preview_500 SENTINEL");
            const v = state.versions.find((x) => x.id === versionId && x.form_definition_id === formId && x.org_id === routeOrg);
            if (!v || v.status !== "draft") throw new Error("preview_409");
            v.status = "published";
        },

        listLocationLinks: async () => state.links.map((l) => ({ ...l })),
        createLink: async ({ formId, key }) => {
            state.linkCreates += 1;
            if (opts.failCreateLinkAt && state.linkCreates === opts.failCreateLinkAt) throw new Error("preview_500 secret-token-SENTINEL");
            clock += 60_000;
            // What the product route stores: location metadata, the form's stored intent merged as lead-capture
            // (mergePublicLinkMetadataForCreate), and the caller's marker, role and run.
            const form = state.forms.find((f) => f.id === formId);
            const intent = form?.metadata?.intake_intent === "enrollment_lead" ? { lead_capture: true, intake: true, mode: "intake" } : {};
            const metadata = { ...buildLocationSpecificLinkMetadata({ formName: formId, locationId: LOCATION, locationName: "QA North" }), ...intent, ...MARK, [TOURS_FIXTURE_ROLE_KEY]: key, qa_run: boundRun };
            const row = { id: id("link"), form_definition_id: formId, is_active: true, expires_at: null, allowed_embed_origins: null, metadata, created_at: new Date(clock).toISOString() };
            state.links.push(row);
            return row.id;
        },
        withdrawLink: async ({ linkId }) => {
            state.calls.push("withdrawLink");
            const l = state.links.find((x) => x.id === linkId);
            if (l) l.is_active = false;
        },
    };
    return { state, ports, bindRun: (r: string) => { boundRun = r; } };
}

type RunOpts = { env?: Record<string, string | undefined>; files?: Files; verdict?: ToursAuthorityVerdict; attestVerdict?: ToursAuthorityVerdict };
async function run(op: string, w: ReturnType<typeof world>, opts: RunOpts = {}) {
    const lines: string[] = [];
    const bound: { world: ToursFixtureWorld; session: PreviewSession; client: ToursClientConfig }[] = [];
    const verified: string[] = [];
    const attested: AttestedConnection[] = [];
    const files = opts.files ?? FILES;
    const env = opts.env ?? ENV;
    const code = await runToursFixture({
        argv: [op],
        env,
        verify: (operation) => {
            verified.push(operation);
            return opts.verdict ?? genuine();
        },
        attest: async (_operation, apiOrigin, connect) => {
            const v = opts.attestVerdict ?? opts.verdict ?? genuine();
            if (!v.ok) return v;
            const frozen = Object.freeze({ url: String(env.DATABASE_URL ?? ""), clientEnv: Object.freeze({ ...env }), apiOrigin });
            attested.push(frozen);
            return { ...v, result: connect(frozen) };
        },
        ports: (b) => {
            bound.push(b);
            w.bindRun(b.world.runId);
            return w.ports;
        },
        readFile: (path) => files[path] ?? null,
        write: (l) => lines.push(l),
        now: NOW,
    });
    return { code, lines, bound, verified, attested };
}
const census = (lines: string[]) => Number(/census count=(\d+)/.exec(lines.join("\n"))?.[1] ?? NaN);
const resetLine = (lines: string[]) => /reset namespace=(\S+) removed=(\d+)/.exec(lines.join("\n"));

describe("the installed tours_certification contract", () => {
    it("package.json names the script the registry runs, and the script runs this runner", () => {
        const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as { scripts: Record<string, string> };
        expect(pkg.scripts["dev:qa:tours-fixture"]).toBe("tsx --tsconfig tsconfig.json scripts/qaToursFixture.ts");
        const entry = readFileSync(resolve(root, "scripts/qaToursFixture.ts"), "utf8");
        expect(entry).toContain("runToursFixture");
        // No .env loading: only the executor's from-scratch environment reaches it.
        expect(entry).not.toMatch(/dotenv|loadEnv|\.env\.local/);
    });

    it("accepts exactly one of the registered argv: --ensure, --count, --reset", () => {
        for (const op of ["--ensure", "--count", "--reset"]) expect(guardToursFixture([op], ENV).ok).toBe(true);
        for (const argv of [[], ["--ensure", "--reset"], ["ensure"], ["--ensure", "--org=x"]]) expect(guardToursFixture(argv, ENV)).toMatchObject({ ok: false, code: "operation_required" });
    });

    it("namespace and reset bound match the registry", () => {
        expect(TOURS_FIXTURE_NAMESPACE).toBe("tours-cert.alloy.invalid");
        expect(TOURS_FIXTURE_RESET_LIMIT).toBe(200);
    });
});

describe("guards refuse before any port is built", () => {
    const refusals: [string, Record<string, string | undefined>, string][] = [
        ["hosted database", { ...ENV, SUPABASE_URL: "https://ikaxilmwmrmbagoidedu.supabase.co" }, "isolated_database_required"],
        ["foreign namespace", { ...ENV, ALLOY_CERT_NAMESPACE: "enrollment-cert.alloy.invalid" }, "namespace_mismatch"],
        ["another fixture", { ...ENV, ALLOY_CERT_FIXTURE: "financials_historical_draft" }, "fixture_mismatch"],
        ["no QA run", { ...ENV, ALLOY_QA_RUN_ID: undefined }, "qa_run_required"],
        ["not an isolated environment", { ...ENV, ALLOY_QA_ENVIRONMENT_ID: "alloy_staging_web" }, "isolated_environment_required"],
        ["a provider credential name", { ...ENV, RESEND_API_KEY: "x" }, "outbound_provider_env_present"],
        ["the queue trigger", { ...ENV, INTERNAL_MESSAGES_PROCESS_URL: "http://127.0.0.1:1/x" }, "outbound_provider_env_present"],
        ["Twilio", { ...ENV, TWILIO_AUTH_TOKEN: "x" }, "outbound_provider_env_present"],
    ];
    for (const [name, env, code] of refusals) {
        it(`refuses ${name}`, async () => {
            let built = false;
            const lines: string[] = [];
            let verified = false;
            const exit = await runToursFixture({
                argv: ["--ensure"], env,
                verify: () => { verified = true; return genuine(); },
                attest: async () => ({ ok: false, code: "unreached" }),
                ports: () => { built = true; return world().ports; }, readFile: (p) => FILES[p] ?? null, write: (l) => lines.push(l), now: NOW,
            });
            expect(verified).toBe(false);
            expect(exit).toBe(2);
            expect(built).toBe(false);
            expect(lines).toEqual([`✗ refused_${code}`]);
        });
    }
});

describe("ensure → count → reset", () => {
    it("ensure builds the whole fixture, verifies its shape and reports a census", async () => {
        const w = world();
        const r = await run("--ensure", w);
        expect(r.code, r.lines.join("\n")).toBe(0);
        // 1 legacy rule + 1 booking + person, household, opportunity, membership + 3 active links (the 4th is withdrawn).
        expect(census(r.lines)).toBe(1 + 1 + 4 + 3);
        // The withdrawn G-T5 link is a physical row outside the census, and is said so.
        expect(r.lines).toContain("✓ retained_revoked_links=1");
        expect(r.lines.filter((l) => l.startsWith("✗"))).toEqual([]);
        expect(w.state.links).toHaveLength(LINK_PLAN.length);
    });

    it("is idempotent: a second ensure creates nothing and reports the same census", async () => {
        const w = world();
        const first = await run("--ensure", w);
        const calls = w.state.calls.length;
        const creates = w.state.linkCreates;
        const second = await run("--ensure", w);
        expect(second.code).toBe(0);
        expect(census(second.lines)).toBe(census(first.lines));
        expect(w.state.calls.length).toBe(calls);
        expect(w.state.linkCreates).toBe(creates);
    });

    it("a half-finished ensure (preview failed on the 3rd link) exits 1 without the error text, and the rerun completes it", async () => {
        const w = world({ failCreateLinkAt: 3 });
        const broken = await run("--ensure", w);
        expect(broken.code).toBe(1);
        expect(broken.lines.join("\n")).not.toMatch(/SENTINEL|preview_500/);
        expect(broken.lines).toContain("✗ ensure_failed_rerun_is_safe");
        const healed = await run("--ensure", w);
        expect(healed.code, healed.lines.join("\n")).toBe(0);
        expect(w.state.links.filter((l) => l.metadata?.[TOURS_FIXTURE_ROLE_KEY] === "A_old")).toHaveLength(1);
        expect(w.state.links).toHaveLength(LINK_PLAN.length);
    });

    it("count is read-only, reports the census and re-verifies the shape", async () => {
        const w = world();
        await run("--ensure", w);
        const before = JSON.stringify(w.state);
        const c = await run("--count", w);
        expect(c.code).toBe(0);
        expect(census(c.lines)).toBe(9);
        expect(JSON.stringify(w.state)).toBe(before);
    });

    it("count on an absent fixture is a measured zero, not a failure", async () => {
        const c = await run("--count", world());
        expect(c.code).toBe(0);
        expect(census(c.lines)).toBe(0);
    });

    it("reset deletes only fixture rows, revokes links through the product route, and never counts a revocation as a removal", async () => {
        const w = world();
        await run("--ensure", w);
        const r = await run("--reset", w);
        expect(r.code, r.lines.join("\n")).toBe(0);
        const m = resetLine(r.lines)!;
        expect(m[1]).toBe(TOURS_FIXTURE_NAMESPACE);
        // PHYSICAL deletions only: booking, rule, person, household, membership, opportunity.
        expect(Number(m[2])).toBe(6);
        expect(Number(m[2])).toBeLessThanOrEqual(TOURS_FIXTURE_RESET_LIMIT);
        expect(r.lines).toContain("✓ links_revoked_this_reset=3");
        expect(r.lines).toContain("✓ retained_revoked_links=4");
        // Withdrawn, never deleted (the product has no link deletion): census 0 is NOT zero physical rows.
        const after = await run("--count", w);
        expect(census(after.lines)).toBe(0);
        expect(after.lines).toContain("✓ retained_revoked_links=4");
        expect(w.state.links).toHaveLength(4);
        expect(w.state.links.every((l) => l.is_active === false)).toBe(true);
    });

    it("reset twice is safe: the second removes nothing", async () => {
        const w = world();
        await run("--ensure", w);
        await run("--reset", w);
        const again = await run("--reset", w);
        expect(again.code).toBe(0);
        expect(Number(resetLine(again.lines)![2])).toBe(0);
        expect(again.lines).toContain("✓ links_revoked_this_reset=0");
        expect(again.lines).toContain("✓ retained_revoked_links=4");
    });

    it("reset refuses an unbounded marker match before touching anything", async () => {
        const w = world({ extraMarkerRows: TOURS_FIXTURE_RESET_LIMIT + 1 });
        const r = await run("--reset", w);
        expect(r.code).toBe(1);
        expect(r.lines).toContain("✗ reset_unbounded_refused");
        expect(Number(resetLine(r.lines)![2])).toBe(0);
        expect(w.state.bookings).toHaveLength(TOURS_FIXTURE_RESET_LIMIT + 1);
    });

    it("reset never deletes outbound residue addressed into the namespace; it stops for an operator", async () => {
        const w = world({ namespaceOutbound: 1 });
        await run("--ensure", w);
        const r = await run("--reset", w);
        expect(r.code).toBe(1);
        expect(r.lines).toContain("✗ outbound_residue_present");
        expect(w.state.bookings).toHaveLength(1);
    });
});

describe("fail-closed outbound contract", () => {
    it("an active provider binding refuses ensure before any write", async () => {
        const w = world({ bindings: 1 });
        const r = await run("--ensure", w);
        expect(r.code).toBe(1);
        expect(r.lines).toContain("✗ outbound_provider_binding_active");
        expect(w.state.calls).toEqual([]);
        expect(w.state.linkCreates).toBe(0);
    });

    it("any outbound row appearing during ensure fails it", async () => {
        const r = await run("--ensure", world({ outboundDelta: 1 }));
        expect(r.code).toBe(1);
        expect(r.lines).toContain("✗ outbound_rows_changed_during_ensure");
    });

    it("nothing in the fixture reaches a confirmation, reminder or orchestrator path", () => {
        const src = ["lib/qa/toursFixture/toursCertificationFixture.ts", "lib/qa/toursFixture/toursCertificationFixturePorts.ts", "scripts/qaToursFixture.ts"].map((f) => readFileSync(resolve(root, f), "utf8")).join("\n");
        for (const forbidden of ["confirmTourBooking", "orchestrateTourBooking", "enqueueCanonicalOutboundMessage", "triggerBackendMessagesQueue", "sendTourInternalCalendarInvite", "createTourBooking("]) {
            expect(src).not.toContain(forbidden);
        }
    });
});

describe("secret-free output", () => {
    it("prints nothing but contract lines, and never the service key", async () => {
        const w = world();
        const all = [...(await run("--ensure", w)).lines, ...(await run("--count", w)).lines, ...(await run("--reset", w)).lines];
        expect(all.join("\n")).not.toContain("SENTINEL");
        for (const l of all) expect(l).toMatch(/^(census count=\d+|reset namespace=\S+ removed=\d+|[✓✗] [a-z0-9_:. =/-]+)$/);
    });

    it("a line that is not a contract shape is withheld, not printed", () => {
        const lines: string[] = [];
        const sink = makeSink((l) => lines.push(l));
        sink.raw("token=abc123 https://x");
        expect(lines).toEqual(["✗ output_withheld"]);
        expect(sink.failed()).toBe(true);
    });

    it("the link port keeps only the new link's id from the route response", () => {
        const ports = readFileSync(resolve(root, "lib/qa/toursFixture/toursCertificationFixturePorts.ts"), "utf8");
        expect(ports).toMatch(/const id = typeof data\.id === "string" \? data\.id : "";/);
        expect(ports).not.toMatch(/plaintext_token\s*[,}:]|data\.plaintext_token|embed_path\b(?!.*never)/);
    });
});

describe("product owners are reused, never re-implemented", () => {
    const ports = readFileSync(resolve(root, "lib/qa/toursFixture/toursCertificationFixturePorts.ts"), "utf8");
    it("links are minted and withdrawn only through the product Forms routes", () => {
        expect(ports).toContain("/api/admin/forms/${formId}/public-links");
        expect(ports).toContain('method: "PATCH", body: { is_active: false }');
        for (const minting of ["generateSecureFormLinkPlaintext", "hashFormLinkToken", "token_hash", 'from("form_public_links").insert', 'from("form_public_links").update', 'from("form_public_links").delete']) {
            expect(ports).not.toContain(minting);
        }
    });
    it("the run's forms are authored only through the product Forms routes, keeping only the new ids", () => {
        expect(ports).toContain('preview("/api/admin/forms", { method: "POST"');
        expect(ports).toContain("/api/admin/forms/${formId}/versions");
        expect(ports).toContain("/api/admin/forms/${formId}/versions/${versionId}/publish");
        for (const direct of ['from("form_definitions").insert', 'from("form_definition_versions").insert', 'from("form_definition_versions").update', "dbInsertFormDefinition", "dbPublishVersion"]) expect(ports).not.toContain(direct);
    });
    it("the legacy rule is written and removed by the product schedule writer", () => {
        expect(ports).toMatch(/createTourSchedule\(db, \{ orgId: ORG, locationId: null \}/);
        expect(ports).toMatch(/deleteTourSchedule\(db, \{ orgId: ORG, locationId: null \}/);
    });
    it("the opportunity's vertical is the platform childcare vertical — verticals carry no org_id", () => {
        expect(ports).toContain('from("verticals").select("id").eq("slug", "childcare").eq("is_active", true)');
        expect(ports).not.toMatch(/from\("verticals"\)[^\n]*org_id/);
    });
    it("every delete re-asserts ownership (marker, or both marked ends of the membership)", () => {
        const deletes = ports.split("\n").filter((l) => l.includes(".delete()"));
        expect(deletes.length).toBeGreaterThan(0);
        for (const l of deletes) expect(l, l).toMatch(/MARKER_FILTER|eq\("customer_id", f\.customerId\)\.eq\("person_id", f\.personId\)/);
    });
    it("the ports take the organization, site, run, API origin and key from what was verified — no constant, no env, no session-file URL", () => {
        expect(ports).toContain("const ORG = bound.world.orgId;");
        expect(ports).toContain("const LOCATION = bound.world.locationId;");
        expect(ports).toContain("const RUN = bound.world.runId;");
        expect(ports).toContain("createClient(client.apiUrl, client.serviceKey");
        expect(ports).not.toMatch(/process\.env|env\.SUPABASE/);
        expect(ports).not.toMatch(/00000000-0000-4000-8000-0000000000(01|11)/);
        expect(ports).not.toMatch(/readFileSync|ALLOY_QA_SESSION_FILE|\.origins\b/);
    });
});

describe("G-T2 / G-T5 semantics from the fixture's own data", () => {
    it("the legacy booking slot is a Thursday 13:00 in Los Angeles, after now, 30 minutes long", () => {
        const { startAt, endAt } = nextLegacySlot(NOW);
        expect(Date.parse(startAt)).toBeGreaterThan(NOW.getTime());
        expect(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Los_Angeles", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(startAt))).toBe("Thu 13:00");
        expect(Date.parse(endAt) - Date.parse(startAt)).toBe(30 * 60_000);
    });

    it("G-T2: the legacy rule offers nothing new at the location but is kept for the pending confirmation", async () => {
        const r = await run("--ensure", world());
        for (const c of ["g_t2_one_legacy_rule", "g_t2_legacy_rule_excluded_from_new_availability", "g_t2_legacy_rule_org_wide_for_pending_confirmation", "g_t2_one_pending_booking_at_location", "g_t2_booking_inside_legacy_rule", "g_t2_no_own_location_rule_covers_booking"]) {
            expect(r.lines).toContain(`✓ ${c}`);
        }
    });

    it("G-T2 is refused as a fixture if an own-location rule also covers the booking (it would not test legacy authority)", async () => {
        const r = await run("--ensure", world({ ownLocationRuleCovering: true }));
        expect(r.code).toBe(1);
        expect(r.lines).toContain("✗ g_t2_no_own_location_rule_covers_booking");
    });

    it("G-T5: two forms attachable, form A once on its newest link, the withdrawn link blocked — via the product picker", async () => {
        const r = await run("--ensure", world());
        for (const c of ["g_t5_four_fixture_links", "g_t5_two_forms_attachable", "g_t5_form_a_offered_once_on_newest_link", "g_t5_form_b_offered", "g_t5_withdrawn_link_blocked", "g_t5_no_calendar_published_by_fixture"]) {
            expect(r.lines).toContain(`✓ ${c}`);
        }
    });

});

/* ── the run's two lead-capture forms ───────────────────────────────────────────────────────────── */

const ownedForm = (role: "form_a" | "form_b", over: Partial<FixtureFormRow> = {}): FixtureFormRow => ({
    id: `pre-${role}`, org_id: ORG, key: formKeyFor(role, RUN), name: `pre ${role}`, is_active: true,
    metadata: { ...runMarker(role, RUN), intake_intent: TOURS_FIXTURE_FORM_INTENT }, ...over,
});
const fixtureForms = (w: ReturnType<typeof world>) => w.state.forms.filter((f) => f.metadata?.[TOURS_FIXTURE_MARKER_KEY] === TOURS_FIXTURE_MARKER);

describe("exactly two run-owned lead-capture forms, through the product Forms routes", () => {
    it("an empty baseline (no form in qa_shared): ensure authors and publishes exactly two, then mints the links on them", async () => {
        const w = world();
        const r = await run("--ensure", w);
        expect(r.code, r.lines.join("\n")).toBe(0);
        expect(fixtureForms(w).map((f) => f.key).sort()).toEqual([KEY_A, KEY_B].sort());
        expect(fixtureForms(w).every((f) => f.org_id === ORG && f.is_active && f.metadata?.qa_run === RUN && f.metadata?.intake_intent === "enrollment_lead")).toBe(true);
        expect(w.state.versions.filter((v) => v.status === "published")).toHaveLength(2);
        expect(w.state.versions.every((v) => v.metadata?.qa_run === RUN && v.metadata?.[TOURS_FIXTURE_MARKER_KEY] === TOURS_FIXTURE_MARKER)).toBe(true);
        for (const l of ["✓ forms_owned_this_run=2", "✓ forms_created_this_ensure=2", "✓ form_versions_created_this_ensure=2", "✓ form_versions_published_this_ensure=2", "✓ g_t5_two_run_owned_forms", "✓ g_t5_links_only_on_run_owned_forms", "✓ retained_fixture_forms=2", "✓ retained_fixture_form_versions=2"]) expect(r.lines).toContain(l);
        const formIds = new Set(fixtureForms(w).map((f) => f.id));
        expect(w.state.links.every((l) => formIds.has(l.form_definition_id))).toBe(true);
    });

    it("forms are never looked up by title, and the keys are the verified run's", () => {
        const src = readFileSync(resolve(root, "lib/qa/toursFixture/toursFixtureForms.ts"), "utf8") + readFileSync(resolve(root, "lib/qa/toursFixture/toursCertificationFixturePorts.ts"), "utf8");
        expect(src).not.toMatch(/\.in\("name"|\.eq\("name"|Northwind Tour Inquiry|QA V2 Inquiry/);
        expect(KEY_A).toMatch(/^tours_cert_form_a_[0-9a-f]{12}$/);
        expect(formKeyFor("form_a", "qar_other0000000")).not.toBe(KEY_A);
        expect(FORM_PLAN.map((f) => f.role)).toEqual(["form_a", "form_b"]);
        expect(validateFormSchema(FIXTURE_FORM_SCHEMA).fields.length).toBeGreaterThan(0);
    });

    it("the run comes from the verified authority, not the environment's copy", async () => {
        const w = world();
        const r = await run("--ensure", w, { env: { ...ENV, ALLOY_QA_RUN_ID: "qar_envcopy00000" } });
        expect(r).toMatchObject({ code: 2, lines: ["✗ refused_authority_binding_mismatch"], bound: [] });
        expect(w.state.formCreates).toBe(0);
    });

    it("is idempotent: a second ensure creates no form, version or link", async () => {
        const w = world();
        await run("--ensure", w);
        const second = await run("--ensure", w);
        expect(second.code, second.lines.join("\n")).toBe(0);
        expect([w.state.formCreates, w.state.draftCreates, w.state.publishes, w.state.linkCreates]).toEqual([2, 2, 2, LINK_PLAN.length]);
        for (const l of ["✓ forms_created_this_ensure=0", "✓ form_versions_created_this_ensure=0", "✓ form_versions_published_this_ensure=0"]) expect(second.lines).toContain(l);
    });

    it("an ensure interrupted after the definition (draft create failed) completes on the rerun — one definition, one published version", async () => {
        const w = world({ failCreateDraftAt: 1 });
        const broken = await run("--ensure", w);
        expect(broken.code).toBe(1);
        expect(broken.lines).toContain("✗ ensure_failed_rerun_is_safe");
        expect(broken.lines.join("\n")).not.toMatch(/SENTINEL|preview_500/);
        expect(w.state.linkCreates).toBe(0);
        const healed = await run("--ensure", w);
        expect(healed.code, healed.lines.join("\n")).toBe(0);
        expect(fixtureForms(w)).toHaveLength(2);
        expect(w.state.versions.filter((v) => v.status === "published")).toHaveLength(2);
    });

    it("an ensure interrupted between draft and publish publishes the owned draft on the rerun, never a second draft", async () => {
        const w = world({ failPublishAt: 1 });
        expect((await run("--ensure", w)).code).toBe(1);
        expect(w.state.versions).toHaveLength(1);
        const healed = await run("--ensure", w);
        expect(healed.code, healed.lines.join("\n")).toBe(0);
        expect(w.state.draftCreates).toBe(2); // A's (reused) + B's
        expect(w.state.versions.filter((v) => v.status === "published")).toHaveLength(2);
        expect(w.state.versions).toHaveLength(2);
    });

    const squatters: [string, FixtureFormRow, string][] = [
        ["an unmarked form at the run's key", ownedForm("form_a", { metadata: { intake_intent: "enrollment_lead" } }), "forms_form_key_not_owned"],
        ["another fixture's form at the run's key", ownedForm("form_a", { metadata: { qa_fixture: "fee_doc_pending_v1", qa_run: RUN, qa_fixture_key: "form_a" } }), "forms_form_key_not_owned"],
        ["another run's form at this run's key", ownedForm("form_a", { metadata: { ...runMarker("form_a", "qar_other0000000"), intake_intent: "enrollment_lead" } }), "forms_form_key_not_owned"],
        ["this run's marker in the wrong role", ownedForm("form_a", { metadata: { ...runMarker("form_b", RUN), intake_intent: "enrollment_lead" } }), "forms_unexpected_run_form"],
        ["a third run-marked form", ownedForm("form_a", { id: "pre-x", key: "tours_cert_form_c_x", metadata: { ...runMarker("form_c", RUN), intake_intent: "enrollment_lead" } }), "forms_unexpected_run_form"],
        ["an inactive owned form", ownedForm("form_a", { is_active: false }), "forms_form_inactive"],
        ["an owned form without the lead-capture intent", ownedForm("form_a", { metadata: runMarker("form_a", RUN) }), "forms_form_not_lead_capture"],
    ];
    for (const [name, row, code] of squatters) {
        it(`refuses ${name} before any other write`, async () => {
            const w = world({ preForms: [row] });
            const r = await run("--ensure", w);
            expect(r.code).toBe(1);
            expect(r.lines).toContain(`✗ ${code}`);
            expect([w.state.formCreates, w.state.draftCreates, w.state.linkCreates]).toEqual([0, 0, 0]);
            expect(w.state.calls).toEqual([]);
        });
    }

    it("refuses a run-owned key already present in another organization", async () => {
        const w = world({ preForms: [ownedForm("form_a", { org_id: FOREIGN_ORG })] });
        const r = await run("--ensure", w);
        expect(r.lines).toContain("✗ forms_form_key_in_foreign_org");
        expect(w.state.formCreates).toBe(0);
    });

    it("a session whose Forms routes act in another org: the create is detected as outside the fixture org and nothing else is written", async () => {
        const w = world({ routeOrg: FOREIGN_ORG });
        const r = await run("--ensure", w);
        expect(r.code).toBe(1);
        expect(r.lines).toContain("✗ forms_form_created_outside_fixture_org");
        expect([w.state.formCreates, w.state.draftCreates, w.state.linkCreates]).toEqual([1, 0, 0]);
        expect(w.state.calls).toEqual([]);
        // The stray form is reported, never deleted (no deletion capability exists), and a rerun refuses on it.
        const again = await run("--ensure", w);
        expect(again.lines).toContain("✗ forms_form_key_in_foreign_org");
    });

    it("refuses a version on an owned form that is not this run's, or two published versions", async () => {
        const foreign = world({ preForms: [ownedForm("form_a")], preVersions: [{ id: "v1", org_id: ORG, form_definition_id: "pre-form_a", status: "published", metadata: { note: "someone else" } }] });
        expect((await run("--ensure", foreign)).lines).toContain("✗ forms_form_version_not_owned");
        const twice = world({ preForms: [ownedForm("form_a")], preVersions: [1, 2].map((n) => ({ id: `v${n}`, org_id: ORG, form_definition_id: "pre-form_a", status: "published", metadata: runMarker("form_a", RUN) })) });
        expect((await run("--ensure", twice)).lines).toContain("✗ forms_form_published_twice");
    });

    it("forms of other runs are retained and reported, never used", async () => {
        const OTHER = "qar_other0000000";
        const old = [ownedForm("form_a", { id: "old-a", key: formKeyFor("form_a", OTHER), metadata: { ...runMarker("form_a", OTHER), intake_intent: "enrollment_lead" } })];
        const w = world({ preForms: old });
        const r = await run("--ensure", w);
        expect(r.code, r.lines.join("\n")).toBe(0);
        expect(w.state.links.some((l) => l.form_definition_id === "old-a")).toBe(false);
        expect(r.lines).toContain("✓ retained_fixture_forms=3");
    });

    it("count is read-only over the forms, and refuses a squatted key", async () => {
        const w = world();
        await run("--ensure", w);
        const before = JSON.stringify(w.state);
        const c = await run("--count", w);
        expect(c.code).toBe(0);
        expect(c.lines).toContain("✓ forms_owned_this_run=2");
        expect(c.lines).toContain("✓ retained_fixture_form_versions=2");
        expect(JSON.stringify(w.state)).toBe(before);
        const squat = await run("--count", world({ preForms: [ownedForm("form_b", { metadata: {} })] }));
        expect(squat.code).toBe(1);
        expect(squat.lines).toContain("✗ forms_form_key_not_owned");
    });
});

describe("reset disposition: what is deleted, revoked and retained", () => {
    it("deletes six rows, revokes three links, retains four revoked links and the two forms with their two published versions", async () => {
        const w = world();
        await run("--ensure", w);
        const r = await run("--reset", w);
        expect(r.code, r.lines.join("\n")).toBe(0);
        expect(Number(resetLine(r.lines)![2])).toBe(6);
        for (const l of ["✓ links_revoked_this_reset=3", "✓ retained_revoked_links=4", "✓ retained_fixture_forms=2", "✓ retained_fixture_form_versions=2"]) expect(r.lines).toContain(l);
        expect(fixtureForms(w).every((f) => f.is_active)).toBe(true);
        expect(w.state.versions.filter((v) => v.status === "published")).toHaveLength(2);
        const after = await run("--count", w);
        expect(census(after.lines)).toBe(0);
        expect(after.lines).toContain("✓ fixture_absent");
    });

    it("a second ensure in the SAME run after reset is refused before any write: its links cannot be revived", async () => {
        const w = world();
        await run("--ensure", w);
        await run("--reset", w);
        const creates = [w.state.formCreates, w.state.draftCreates, w.state.linkCreates, w.state.calls.length];
        const again = await run("--ensure", w);
        expect(again.code).toBe(1);
        expect(again.lines).toContain("✗ run_links_revoked_new_qa_run_required");
        expect([w.state.formCreates, w.state.draftCreates, w.state.linkCreates, w.state.calls.length]).toEqual(creates);
    });

    it("a NEW run after reset builds its own forms and links; the old run's revoked rows stay outside its evidence", async () => {
        const w = world();
        await run("--ensure", w);
        await run("--reset", w);
        const NEXT = "qar_nextrun00000";
        const r = await run("--ensure", w, { env: { ...ENV, ALLOY_QA_RUN_ID: NEXT }, verdict: genuine({ qa_run_id: NEXT }) });
        expect(r.code, r.lines.join("\n")).toBe(0);
        expect(r.lines).toContain("✓ forms_created_this_ensure=2");
        expect(fixtureForms(w)).toHaveLength(4);
        expect(w.state.links).toHaveLength(2 * LINK_PLAN.length);
        // The old run's four revoked links are physical rows (retained), outside the new run's G-T5 evidence.
        for (const l of ["✓ g_t5_four_fixture_links", "✓ g_t5_two_forms_attachable", "✓ g_t5_no_other_run_fixture_link_active", "✓ retained_revoked_links=5", "✓ retained_fixture_forms=4", "✓ retained_fixture_form_versions=4"]) expect(r.lines).toContain(l);
    });

    it("another run's fixture link still live at the location refuses ensure before any write (reset that run first)", async () => {
        const live: LocationLinkRow = { id: "old-link", form_definition_id: "old-form", is_active: true, expires_at: null, allowed_embed_origins: null, metadata: { ...MARK, [TOURS_FIXTURE_ROLE_KEY]: "A_new", qa_run: "qar_other0000000", default_location_id: LOCATION }, created_at: null };
        const w = world({ preLinks: [live] });
        const r = await run("--ensure", w);
        expect(r.code).toBe(1);
        expect(r.lines).toContain("✗ other_run_fixture_links_active_reset_first");
        expect([w.state.formCreates, w.state.linkCreates, w.state.calls.length]).toEqual([0, 0, 0]);
    });

    it("no fixture file names a deletion of forms or versions, or an archive", () => {
        const src = ["lib/qa/toursFixture/toursFixtureForms.ts", "lib/qa/toursFixture/toursCertificationFixturePorts.ts", "lib/qa/toursFixture/toursCertificationFixture.ts"].map((f) => readFileSync(resolve(root, f), "utf8")).join("\n");
        expect(src).not.toMatch(/from\("form_definitions"\)[^\n]*\.(delete|update|insert)\(|from\("form_definition_versions"\)[^\n]*\.(delete|update|insert)\(|\/archive|is_active: false[^\n]*form_definitions/);
        expect(src).not.toMatch(/dbInsertFormDefinition|dbInsertVersion|dbPublishVersion/);
    });
});

describe("the installed executor's binding (A741: persona org, trusted preview, session digest) under the v2 verdict", () => {
    it("binds the persona org qa_shared, its site qa_north and the verified run; the client is the attested copy", async () => {
        const r = await run("--ensure", world());
        expect(r.code, r.lines.join("\n")).toBe(0);
        expect(r.lines[0]).toBe("✓ binding a741 org=persona_qa_shared site=qa_north preview=loopback session=digest_bound authority=v2 api=identity_bound pins=verified");
        expect(r.bound).toHaveLength(1);
        expect(r.bound[0]!.world).toEqual({ orgId: "4acc9386-c485-486f-aa1f-05d83499d142", locationId: "21c9be10-f6e9-4048-ab4c-939ddbe0f0b7", runId: RUN });
        expect(r.bound[0]!.session).toEqual({ origin: PREVIEW_ORIGIN, cookie: "sb-alloy-local-auth=cookie-SENTINEL" });
        expect(r.bound[0]!.client).toEqual({ apiUrl: API_URL, serviceKey: BASE_ENV.SUPABASE_SERVICE_ROLE_KEY });
        expect(r.attested).toHaveLength(1);
        expect(r.attested[0]!.apiOrigin).toBe(API_URL);
        expect(r.verified).toEqual(["ensure"]);
        expect(r.lines.join("\n")).not.toContain("SENTINEL");
    });

    it("the client's API origin is the VERIFIED one, never a second read of SUPABASE_URL", async () => {
        const r = await run("--count", world(), { env: { ...ENV, SUPABASE_URL: "http://127.0.0.1:56999" } });
        expect(r.attested[0]!.apiOrigin).toBe(API_URL);
        expect(r.bound[0]!.client.apiUrl).toBe(API_URL);
    });

    it("the operation verified is the one in argv", async () => {
        for (const op of ["ensure", "count", "reset"] as const) expect((await run(`--${op}`, world())).verified).toEqual([op]);
    });

    it("a refused v2 verdict prints its code only, and reads neither the service key nor the session file", async () => {
        for (const code of ["fixture_authority_org_unbound", "api_identity_mismatch", "target_hold_held", "fixture_program_pins_absent"]) {
            const touched: string[] = [];
            const env = new Proxy(ENV, { get: (t, k) => { touched.push(String(k)); return t[k as string]; } });
            const reads: string[] = [];
            const w = world();
            const r = await run("--ensure", w, { env, verdict: { ok: false, code, fields: ["x"] }, files: new Proxy(FILES, { get: (t, k) => { reads.push(String(k)); return t[k as string]; } }) });
            expect(r).toMatchObject({ code: 2, lines: [`✗ refused_${code}`], bound: [] });
            expect(touched).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
            expect(reads).toEqual([]);
        }
    });

    it("a gate that refuses at the client (the hold changed since verification) builds no port", async () => {
        const w = world();
        const r = await run("--ensure", w, { attestVerdict: { ok: false, code: "target_hold_changed_since_issue" } });
        expect(r).toMatchObject({ code: 2, bound: [] });
        expect(r.lines.at(-1)).toBe("✗ refused_target_hold_changed_since_issue");
    });

    it("a verdict for another org, run, environment, request or candidate than the binding is refused", async () => {
        const cases: [Partial<Extract<ToursAuthorityVerdict, { ok: true }>["authority"]>, string][] = [
            [{ org_id: SEED_ORG_ID }, "authority_org_mismatch"],
            [{ org_key: "certification_seed" }, "authority_org_mismatch"],
            [{ qa_run_id: "qar_other0000000" }, "authority_binding_mismatch"],
            [{ environment_id: "certenv-0000000000" }, "authority_binding_mismatch"],
            [{ request_id: "tfx-other" }, "authority_binding_mismatch"],
            [{ candidate_sha: "c".repeat(40) }, "authority_binding_mismatch"],
        ];
        for (const [over, code] of cases) {
            const r = await run("--ensure", world(), { verdict: genuine(over) });
            expect(r, JSON.stringify(over)).toMatchObject({ code: 2, lines: [`✗ refused_${code}`], bound: [] });
        }
    });

    it("no service key → refused after authority, before the session or any port", async () => {
        const r = await run("--ensure", world(), { env: { ...ENV, SUPABASE_SERVICE_ROLE_KEY: undefined } });
        expect(r).toMatchObject({ code: 2, lines: ["✗ refused_service_key_missing"], bound: [] });
    });

    const env = ENV;
    const without = (k: string) => ({ ...env, [k]: undefined });
    const refusals: [string, Record<string, string | undefined>, Files, string][] = [
        ["the pre-A741 environment (no binding at all)", { ...BASE_ENV, ALLOY_QA_SESSION_FILE: SESSION_FILE }, FILES, "executor_binding_absent"],
        ["a partial binding (no preview origin)", without("ALLOY_QA_PREVIEW_ORIGIN"), FILES, "binding_incomplete"],
        ["a partial binding (no authority record)", without("ALLOY_QA_AUTHORITY_FILE"), FILES, "binding_incomplete"],
        ["a partial binding (no fixture org)", without("ALLOY_CERT_FIXTURE_ORG_ID"), FILES, "binding_incomplete"],
        ["a binding with no persona session file", without("ALLOY_QA_SESSION_FILE"), FILES, "persona_session_missing"],
        ["the certification seed org (no seed fallback)", { ...env, ALLOY_CERT_FIXTURE_ORG_ID: SEED_ORG_ID }, FILES, "fixture_org_mismatch"],
        ["the seed org declared as seed_manifest", { ...env, ALLOY_CERT_FIXTURE_ORG_ID: SEED_ORG_ID, ALLOY_CERT_FIXTURE_ORG_SOURCE: "seed_manifest" }, FILES, "fixture_org_not_persona_bound"],
        ["the cross-org QA tenant", { ...env, ALLOY_CERT_FIXTURE_ORG_ID: FOREIGN_ORG }, FILES, "fixture_org_mismatch"],
        ["the Firefly operating tenant", { ...env, ALLOY_CERT_FIXTURE_ORG_ID: "93667019-bd28-49b5-a688-acc9bb1e0a19" }, FILES, "fixture_org_mismatch"],
        ["a hosted preview origin", { ...env, ALLOY_QA_PREVIEW_ORIGIN: "https://alloy-staging.vercel.app" }, FILES, "preview_origin_not_loopback"],
        ["a preview origin with a path", { ...env, ALLOY_QA_PREVIEW_ORIGIN: `${PREVIEW_ORIGIN}/api` }, FILES, "preview_origin_not_loopback"],
        ["a malformed candidate", { ...env, ALLOY_QA_CANDIDATE_SHA: "4edb2ab3f" }, FILES, "binding_malformed"],
        ["an expired binding", { ...env, ALLOY_QA_BINDING_EXPIRES_AT: "2026-10-30T17:00:00.000Z" }, FILES, "binding_expired"],
    ];
    for (const [name, e, files, code] of refusals) {
        it(`refuses ${name} before the authority is consulted or any port is built`, async () => {
            const w = world();
            const r = await run("--ensure", w, { env: e, files });
            expect(r).toMatchObject({ code: 2, lines: [`✗ refused_${code}`], bound: [], verified: [] });
            expect(w.state.calls).toEqual([]);
        });
    }

    it("a session file that does not hash to the bound digest is refused after authority, before any port", async () => {
        const r = await run("--ensure", world(), { files: { [SESSION_FILE]: SESSION_TEXT.replace("cookie-SENTINEL", "swapped") } });
        expect(r).toMatchObject({ code: 2, lines: ["✗ refused_session_digest_mismatch"], bound: [] });
    });

    it("a session with no cookie for the session origin is refused (cookies of another host are never sent)", async () => {
        const foreignOnly = JSON.stringify({ cookies: [{ name: "x", value: "y", domain: "evil.example" }] });
        const r = await run("--ensure", world(), { env: { ...ENV, ALLOY_QA_SESSION_SHA256: sha256Hex(foreignOnly) }, files: { [SESSION_FILE]: foreignOnly } });
        expect(r).toMatchObject({ code: 2, lines: ["✗ refused_persona_session_unreadable"], bound: [] });
    });

    it("sessionFromStorageState never returns a URL from the session file", () => {
        const b = { previewOrigin: PREVIEW_ORIGIN, sessionOrigin: "https://cert.tailnet.example" };
        const text = JSON.stringify({ cookies: [{ name: "a", value: "1", domain: ".cert.tailnet.example" }], origins: [{ origin: "http://127.0.0.1:9" }] });
        expect(sessionFromStorageState(text, b)).toEqual({ origin: PREVIEW_ORIGIN, cookie: "a=1" });
        expect(sessionFromStorageState(null, b)).toBeNull();
        expect(sessionFromStorageState("not json", b)).toBeNull();
    });

    it("every binding key the runner reads is one the installed executor sets", () => {
        // fixtureChildEnv + runIsolatedFixture, installed toolkit 2aa8b30d6dd8 (lib/isolated-fixture-execution.mjs);
        // ALLOY_QA_SESSION_FILE is required too, but predates A741 and so does not select the binding.
        const installed = ["ALLOY_CERT_FIXTURE_ORG_ID", "ALLOY_CERT_FIXTURE_ORG_SOURCE", "ALLOY_QA_PREVIEW_ORIGIN", "ALLOY_QA_SESSION_ORIGIN", "ALLOY_QA_SESSION_SHA256", "ALLOY_QA_CANDIDATE_SHA", "ALLOY_QA_REQUEST_ID", "ALLOY_QA_BINDING_DIGEST", "ALLOY_QA_BINDING_EXPIRES_AT", "ALLOY_QA_AUTHORITY_FILE", "ALLOY_QA_AUTHORITY_SHA256"];
        expect([...TOURS_BINDING_ENV_KEYS].sort()).toEqual([...installed].sort());
        expect(bindingFromEnv(ENV, NOW.getTime())).toMatchObject({ ok: true, binding: { world: { orgId: TOURS_FIXTURE_PERSONA_ORG.id, locationId: LOCATION } } });
    });

    it("no runner file names the certification seed org or Lakeside", () => {
        for (const f of ["lib/qa/toursFixture/toursCertificationFixture.ts", "lib/qa/toursFixture/toursCertificationFixturePorts.ts", "lib/qa/toursFixture/toursFixtureForms.ts", "scripts/qaToursFixture.ts"]) {
            expect(readFileSync(resolve(root, f), "utf8"), f).not.toMatch(/00000000-0000-4000-8000-0000000000(01|11)/);
        }
    });
});
