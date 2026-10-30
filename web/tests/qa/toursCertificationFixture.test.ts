/**
 * The Tours certification fixture (`dev:qa:tours-fixture`) against SYNTHETIC ports — no database, no
 * preview, no network. Proves the runner's contract with the installed toolkit (argv, output lines, namespace,
 * reset bound), its guards, its ownership, idempotency and partial-failure recovery, the fail-closed outbound
 * contract, secret-free output, and that the fixture's data yields the G-T2 and G-T5 semantics through the
 * product's own functions. Integrated proof on an isolated QA run is NOT claimed here.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
    LINK_PLAN,
    TOURS_FIXTURE_FORM_TITLES,
    TOURS_FIXTURE_LOCATION_ID,
    TOURS_FIXTURE_MARKER,
    TOURS_FIXTURE_MARKER_KEY,
    TOURS_FIXTURE_NAMESPACE,
    TOURS_FIXTURE_RESET_LIMIT,
    TOURS_FIXTURE_ROLE_KEY,
    LEGACY_RULE,
    guardToursFixture,
    makeSink,
    nextLegacySlot,
    runToursFixture,
    type LocationLinkRow,
    type MarkerBooking,
    type MarkerFamily,
    type MarkerRule,
    type ToursFixturePorts,
} from "@/lib/qa/toursFixture/toursCertificationFixture";
import { previewSessionFrom } from "@/lib/qa/toursFixture/toursCertificationFixturePorts";
import { buildLocationSpecificLinkMetadata } from "@/lib/forms/locationSpecificPublicLinkMetadata";
import { expandTourScheduleToRuleValues } from "@/lib/tours/schedules/tourWeeklySchedule";

const root = resolve(__dirname, "../..");
const ENV = {
    ALLOY_CERT_FIXTURE: "tours_certification",
    ALLOY_CERT_NAMESPACE: TOURS_FIXTURE_NAMESPACE,
    ALLOY_QA_RUN_ID: "qar_4246ac22ece0",
    ALLOY_QA_ENVIRONMENT_ID: "certenv-3669337690",
    SUPABASE_URL: "http://127.0.0.1:56130",
    SUPABASE_SERVICE_ROLE_KEY: "service-key-SENTINEL-never-printed",
    PATH: "/usr/bin",
};
const MARK = { [TOURS_FIXTURE_MARKER_KEY]: TOURS_FIXTURE_MARKER };
const FORM_A = "f-aaaa";
const FORM_B = "f-bbbb";
const NOW = new Date("2026-10-30T18:00:00Z");

/** In-memory stand-in for the isolated database and the preview's Forms routes. */
function world(opts: { bindings?: number; outboundDelta?: number; failCreateLinkAt?: number; extraMarkerRows?: number; namespaceOutbound?: number; ownLocationRuleCovering?: boolean; forms?: "ok" | "missing" } = {}) {
    let clock = Date.parse("2026-10-30T00:00:00Z");
    let seq = 0;
    const id = (p: string) => `${p}-${++seq}`;
    const state = {
        rules: [] as (MarkerRule & { marker: boolean })[],
        bookings: [] as MarkerBooking[],
        family: { personId: null, customerId: null, opportunityId: null, membershipIds: [] } as MarkerFamily,
        links: [] as LocationLinkRow[],
        outbound: { messages: 7, scheduled: 3 },
        calls: [] as string[],
        linkCreates: 0,
    };
    for (let i = 0; i < (opts.extraMarkerRows ?? 0); i++) state.bookings.push({ id: id("bk"), location_id: TOURS_FIXTURE_LOCATION_ID, status_key: "pending_approval", start_at: NOW.toISOString(), end_at: NOW.toISOString() });
    const ports: ToursFixturePorts = {
        orgAndLocationExist: async () => true,
        countActiveProviderBindings: async () => opts.bindings ?? 0,
        countOutboundRows: async () => ({ ...state.outbound }),
        countNamespaceOutboundRows: async () => opts.namespaceOutbound ?? 0,
        findMarkerRules: async () => state.rules.filter((r) => r.marker),
        findLocationRules: async () =>
            opts.ownLocationRuleCovering ? [{ id: "own", location_id: TOURS_FIXTURE_LOCATION_ID, day_of_week: 4, start_time: "12:00:00", end_time: "15:00:00", schedule_id: "s-own" }] : [],
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
            state.bookings.push({ id: id("bk"), location_id: TOURS_FIXTURE_LOCATION_ID, status_key: "pending_approval", start_at: b.startAt, end_at: b.endAt });
        },
        deleteBookings: async (ids) => {
            const before = state.bookings.length;
            state.bookings = state.bookings.filter((b) => !ids.includes(b.id));
            return before - state.bookings.length;
        },
        resolveForms: async (titles) =>
            opts.forms === "missing" ? { refused: "missing" } : titles.map((t, i) => ({ id: i === 0 ? FORM_A : FORM_B, title: t })),
        listLocationLinks: async () => state.links.map((l) => ({ ...l })),
        createLink: async ({ formId, key }) => {
            state.linkCreates += 1;
            if (opts.failCreateLinkAt && state.linkCreates === opts.failCreateLinkAt) throw new Error("preview_500 secret-token-SENTINEL");
            clock += 60_000;
            // What the product route stores: location metadata, the form's lead-capture intent, the caller's marker.
            const metadata = { ...buildLocationSpecificLinkMetadata({ formName: formId, locationId: TOURS_FIXTURE_LOCATION_ID, locationName: "Lakeside" }), lead_capture: true, ...MARK, [TOURS_FIXTURE_ROLE_KEY]: key };
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
    return { state, ports };
}

async function run(op: string, w: ReturnType<typeof world>, env: Record<string, string | undefined> = ENV) {
    const lines: string[] = [];
    const code = await runToursFixture({ argv: [op], env, ports: () => w.ports, write: (l) => lines.push(l), now: NOW });
    return { code, lines };
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
            const exit = await runToursFixture({ argv: ["--ensure"], env, ports: () => { built = true; return world().ports; }, write: (l) => lines.push(l) });
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

    it("reset removes only fixture rows, revokes links through the product route, and reports within the bound", async () => {
        const w = world();
        await run("--ensure", w);
        const r = await run("--reset", w);
        expect(r.code, r.lines.join("\n")).toBe(0);
        const m = resetLine(r.lines)!;
        expect(m[1]).toBe(TOURS_FIXTURE_NAMESPACE);
        expect(Number(m[2])).toBe(9);
        expect(Number(m[2])).toBeLessThanOrEqual(TOURS_FIXTURE_RESET_LIMIT);
        expect(census((await run("--count", w)).lines)).toBe(0);
        // Withdrawn, never deleted: the product has no link deletion.
        expect(w.state.links.every((l) => l.is_active === false)).toBe(true);
        expect(r.lines).toContain("✓ withdrawn_links_retained_revoked");
    });

    it("reset twice is safe: the second removes nothing", async () => {
        const w = world();
        await run("--ensure", w);
        await run("--reset", w);
        const again = await run("--reset", w);
        expect(again.code).toBe(0);
        expect(Number(resetLine(again.lines)![2])).toBe(0);
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
    it("the legacy rule is written and removed by the product schedule writer", () => {
        expect(ports).toMatch(/createTourSchedule\(db, \{ orgId: ORG, locationId: null \}/);
        expect(ports).toMatch(/deleteTourSchedule\(db, \{ orgId: ORG, locationId: null \}/);
    });
    it("every delete re-asserts ownership (marker, or both marked ends of the membership)", () => {
        const deletes = ports.split("\n").filter((l) => l.includes(".delete()"));
        expect(deletes.length).toBeGreaterThan(0);
        for (const l of deletes) expect(l, l).toMatch(/MARKER_FILTER|eq\("customer_id", f\.customerId\)\.eq\("person_id", f\.personId\)/);
    });
    it("the preview session is loopback-only", () => {
        expect(previewSessionFrom(undefined)).toBeNull();
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

    it("missing seed forms refuse ensure before any link is minted", async () => {
        const w = world({ forms: "missing" });
        const r = await run("--ensure", w);
        expect(r.code).toBe(1);
        expect(r.lines).toContain("✗ forms_missing");
        expect(w.state.linkCreates).toBe(0);
        expect(TOURS_FIXTURE_FORM_TITLES).toHaveLength(2);
    });
});
