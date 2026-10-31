/**
 * TOURS CERTIFICATION FIXTURE — the product half of the installed `tours_certification` contract.
 *
 * The toolkit (lib/certification-fixture.mjs, isolated-fixture-execution.mjs) runs
 * `npm run --silent dev:qa:tours-fixture -- --ensure|--count|--reset` inside an open ISOLATED QA run, with
 * an environment it builds from scratch (loopback Supabase, service key, QA run / environment / persona,
 * `ALLOY_CERT_NAMESPACE`, and the A741 binding below). It reads exactly these lines and nothing else:
 *
 *   census count=<n>                                   (count: required)
 *   reset namespace=tours-cert.alloy.invalid removed=<n>   (reset: required, n ≤ 200)
 *   ✓ <check> / ✗ <check>                              (optional)
 *
 * What it builds (Tours feedback objective EB9A9359C92B, gaps G-T2 and G-T5), all owned by one marker
 * (`metadata.qa_fixture = "tours_location_only_v1"`) inside the reserved namespace:
 *
 *   G-T2  one LEGACY organization-wide tour rule (location_id NULL), written through the product schedule
 *         writer; one person / household / opportunity at the fixture site (email @tours-cert.alloy.invalid,
 *         no phone); one PENDING booking in that rule's interval — legacy data, written directly because the
 *         product booking writer (correctly) refuses a new booking a location's own rules do not offer.
 *   G-T5  four links at the fixture site on two lead-capture forms, minted ONLY through the product route
 *         (POST /api/admin/forms/[formId]/public-links, as the QA persona): form A twice (older, newer),
 *         form B once, and one more form-A link withdrawn through the product PATCH (the "blocked" row).
 *
 * `--count` measures the marker rows AND re-derives both gaps through the product's own pure functions
 * (`tourRulesForLocation`, `projectTourCalendarShareLinks`, `tourCalendarAttachOptions`), so a census that
 * passes is a census of the intended shape. It never writes.
 *
 * Fail-closed outbound contract: before any write, the org must have no active communication provider
 * binding and the environment must carry no provider / queue-trigger variable. Nothing here calls a
 * confirmation, reminder or orchestrator path; after `--ensure` the org's outbound row counts must equal
 * the pre-write baseline. Confirming the legacy booking (test T4) is NOT a fixture operation.
 *
 * WHERE IT ACTS — THE EXECUTOR'S BINDING, NEVER A CONSTANT OR THE SESSION FILE (installed toolkit 66f2d0dab2c7,
 * A741F0C6D2E9: QAFX-ORG-01 / QAFX-PREVIEW-01 / QAFX-AUTH-01). The registry declares `tours_certification`
 * `fixture_org: persona`, `preview: true`, so the executor passes:
 *   - ALLOY_CERT_FIXTURE_ORG_ID / _SOURCE=persona — the bound persona's org. Accepted only as `qa_shared` (every
 *     bp_v2 persona's org); the fixture site is that org's registered `qa_north`. There is no seed-org fallback:
 *     an absent or other org is refused before any port, and a seed-org write is never presented as the persona's.
 *   - ALLOY_QA_PREVIEW_ORIGIN (loopback) — where every Forms route call goes; ALLOY_QA_SESSION_ORIGIN — whose
 *     cookies are read; ALLOY_QA_SESSION_SHA256 — the session file must hash to it. No URL is ever taken from the
 *     session file.
 *   - ALLOY_QA_AUTHORITY_FILE / _SHA256 — the record of exactly this execution. Checked here for CONSISTENCY only
 *     (digest, fields, the operation's `mutating`, validity window). Live provenance against the executor's
 *     request store is the toolkit's `verifyFixtureAuthority`; this runner does not claim it.
 * The whole binding is required: a partial one is refused, never completed from elsewhere.
 *
 * Output is secret-free by construction: only stable keys and counts are printed, never ids, tokens,
 * URLs, emails or response bodies.
 *
 * Pure orchestration over injected ports (`ToursFixturePorts`); the real ports live in
 * toursCertificationFixturePorts.ts.
 */

import { createHash } from "node:crypto";

import { QA_ORGS, QA_STRUCTURE, isForbiddenQaOrgId } from "@/lib/qa/sharedQaRegistry";
import { projectTourCalendarShareLinks, tourCalendarAttachOptions, type TourCalendarShareLinkRow } from "@/lib/tours/publicCalendar/tourCalendarShare";
import { tourRulesForLocation } from "@/lib/tours/availability/computeAvailableTourSlots";

export const TOURS_FIXTURE = "tours_certification";
export const TOURS_FIXTURE_NAMESPACE = "tours-cert.alloy.invalid";
export const TOURS_FIXTURE_RESET_LIMIT = 200;
export const TOURS_FIXTURE_MARKER_KEY = "qa_fixture";
export const TOURS_FIXTURE_MARKER = "tours_location_only_v1";
/** Per-row role inside the fixture, so ensure can find each piece again. */
export const TOURS_FIXTURE_ROLE_KEY = "qa_fixture_key";

export const TOURS_FIXTURE_NPM_SCRIPT = "dev:qa:tours-fixture";

/** The only organization the executor may bind: the bp_v2 personas' QA tenant (persona-bound, QAFX-ORG-01). */
export const TOURS_FIXTURE_PERSONA_ORG = QA_ORGS.qa_shared;
/** The fixture site: that org's registered site, created in an isolated run by the QA run's own local structure ensure. */
export const TOURS_FIXTURE_SITE = QA_STRUCTURE.sites.qa_north;

/** Where the fixture acts. Comes only from a whole, consistent executor binding (`bindingFromEnv`). */
export type ToursFixtureWorld = { orgId: string; locationId: string };

/** The two lead-capture forms G-T5 needs, by exact title in the fixture org. */
export const TOURS_FIXTURE_FORM_TITLES = ["Northwind Tour Inquiry", "QA V2 Inquiry"] as const;

export const TOURS_FIXTURE_EMAIL = `legacy.pending@${TOURS_FIXTURE_NAMESPACE}`;
export const LEGACY_RULE = {
    name: "Tours cert — legacy organization-wide (fixture)",
    day_of_week: 4, // Thursday
    start_time: "13:00",
    end_time: "14:00",
    timezone: "America/Los_Angeles",
    slot_duration_minutes: 30,
} as const;

export type ToursFixtureOperation = "ensure" | "count" | "reset";

/** The planned links, in creation order (creation order is what makes A_new newer than A_old). */
export const LINK_PLAN = [
    { key: "A_old", form: 0, withdraw: false },
    { key: "A_new", form: 0, withdraw: false },
    { key: "B", form: 1, withdraw: false },
    { key: "A_withdrawn", form: 0, withdraw: true },
] as const;

export type MarkerRule = { id: string; location_id: string | null; day_of_week: number; start_time: string; end_time: string; schedule_id: string | null };
export type MarkerBooking = { id: string; location_id: string; status_key: string; start_at: string; end_at: string };
export type MarkerFamily = { personId: string | null; customerId: string | null; opportunityId: string | null; membershipIds: string[] };
export type FixtureForm = { id: string; title: string };
export type LocationLinkRow = TourCalendarShareLinkRow;

export interface ToursFixturePorts {
    orgAndLocationExist(): Promise<boolean>;
    countActiveProviderBindings(): Promise<number>;
    countOutboundRows(): Promise<{ messages: number; scheduled: number }>;
    /** Outbound rows addressed into the namespace (residue a reset must never silently delete). */
    countNamespaceOutboundRows(): Promise<number>;

    findMarkerRules(): Promise<MarkerRule[]>;
    /** Every active own-location rule at the fixture location (to prove only the legacy rule covers the booking). */
    findLocationRules(): Promise<MarkerRule[]>;
    createLegacyRule(): Promise<void>;
    deleteRuleSchedule(scheduleId: string): Promise<number>;
    deleteRules(ids: string[]): Promise<number>;

    findMarkerFamily(): Promise<MarkerFamily>;
    createFamily(existing: MarkerFamily): Promise<MarkerFamily>;
    deleteFamily(family: MarkerFamily): Promise<number>;

    findMarkerBookings(): Promise<MarkerBooking[]>;
    insertLegacyPendingBooking(input: { opportunityId: string; personId: string; startAt: string; endAt: string }): Promise<void>;
    deleteBookings(ids: string[]): Promise<number>;

    resolveForms(titles: readonly string[]): Promise<FixtureForm[] | { refused: string }>;
    /** All link rows at the fixture location (any owner), for the product projection. */
    listLocationLinks(): Promise<LocationLinkRow[]>;
    /** Through the product route only. Returns the new link's id, nothing else. */
    createLink(input: { formId: string; key: string }): Promise<string>;
    /** Through the product PATCH route only. */
    withdrawLink(input: { formId: string; linkId: string }): Promise<void>;
}

/* ── guards ───────────────────────────────────────────────────────────────────────────────────── */

const PROVIDER_ENV = /^(RESEND_|SENDGRID_|POSTMARK_|MAILGUN_|SMTP_|TWILIO_|INTERNAL_MESSAGES_PROCESS_URL$|STRIPE_SECRET)/;

export type GuardResult = { ok: true; operation: ToursFixtureOperation } | { ok: false; code: string };

/** Everything that must hold before a single read or write. */
export function guardToursFixture(argv: readonly string[], env: Readonly<Record<string, string | undefined>>): GuardResult {
    const ops = argv.filter((a) => a === "--ensure" || a === "--count" || a === "--reset");
    if (ops.length !== 1 || argv.length !== 1) return { ok: false, code: "operation_required" };
    const operation = ops[0]!.slice(2) as ToursFixtureOperation;
    if (env.ALLOY_CERT_FIXTURE !== TOURS_FIXTURE) return { ok: false, code: "fixture_mismatch" };
    if (env.ALLOY_CERT_NAMESPACE !== TOURS_FIXTURE_NAMESPACE) return { ok: false, code: "namespace_mismatch" };
    if (!/^qar_[a-z0-9]{8,}$/i.test(env.ALLOY_QA_RUN_ID ?? "")) return { ok: false, code: "qa_run_required" };
    if (!/^certenv-[0-9a-f]{6,}$/i.test(env.ALLOY_QA_ENVIRONMENT_ID ?? "")) return { ok: false, code: "isolated_environment_required" };
    if (!isLoopbackHttp(env.SUPABASE_URL)) return { ok: false, code: "isolated_database_required" };
    if (!env.SUPABASE_SERVICE_ROLE_KEY) return { ok: false, code: "service_key_missing" };
    if (Object.keys(env).some((k) => PROVIDER_ENV.test(k))) return { ok: false, code: "outbound_provider_env_present" };
    return { ok: true, operation };
}

export function isLoopbackHttp(raw: string | undefined): boolean {
    try {
        const u = new URL(String(raw ?? ""));
        return u.protocol === "http:" && (u.hostname === "127.0.0.1" || u.hostname === "localhost");
    } catch {
        return false;
    }
}

/* ── the executor's binding (A741: QAFX-ORG-01 / QAFX-PREVIEW-01 / QAFX-AUTH-01) ───────────────── */

/** The authority record schema the installed executor writes (lib/isolated-fixture-execution.mjs). */
export const FIXTURE_AUTHORITY_SCHEMA = "vacilando.isolated_fixture_authority.v1";

const BINDING_REQUIRED = [
    "ALLOY_CERT_FIXTURE_ORG_ID",
    "ALLOY_CERT_FIXTURE_ORG_SOURCE",
    "ALLOY_QA_PREVIEW_ORIGIN",
    "ALLOY_QA_SESSION_ORIGIN",
    "ALLOY_QA_SESSION_SHA256",
    "ALLOY_QA_CANDIDATE_SHA",
    "ALLOY_QA_REQUEST_ID",
    "ALLOY_QA_BINDING_DIGEST",
    "ALLOY_QA_AUTHORITY_FILE",
    "ALLOY_QA_AUTHORITY_SHA256",
] as const;
/** Set only when a lease expiry is known; when present it must be well-formed and in the future. */
const BINDING_OPTIONAL = ["ALLOY_QA_BINDING_EXPIRES_AT"] as const;
export const TOURS_BINDING_ENV_KEYS: readonly string[] = [...BINDING_REQUIRED, ...BINDING_OPTIONAL];

const SHA256_RE = /^[0-9a-f]{64}$/;
const SHA1_RE = /^[0-9a-f]{40}$/;
const REQUEST_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{2,120}$/;

export type ToursFixtureBinding = {
    world: ToursFixtureWorld;
    previewOrigin: string;
    sessionOrigin: string;
    sessionFile: string;
    sessionSha256: string;
    candidateSha: string;
    requestId: string;
    bindingDigest: string;
    authorityFile: string;
    authoritySha256: string;
};

export const sha256Hex = (text: string): string => createHash("sha256").update(text).digest("hex");

/** A bare http(s) origin (no credentials, path, query or fragment), normalised; anything else → null. */
export function exactOrigin(raw: string | undefined): string | null {
    try {
        const u = new URL(String(raw ?? ""));
        if (u.protocol !== "http:" && u.protocol !== "https:") return null;
        if (u.username || u.password || u.pathname !== "/" || u.search || u.hash) return null;
        return u.origin;
    } catch {
        return null;
    }
}

/** Env-only: the whole executor binding, or why not. No I/O. */
export function bindingFromEnv(env: Readonly<Record<string, string | undefined>>, nowMs: number): { ok: true; binding: ToursFixtureBinding } | { ok: false; code: string } {
    if (!TOURS_BINDING_ENV_KEYS.some((k) => env[k] !== undefined)) return { ok: false, code: "executor_binding_absent" };
    if (BINDING_REQUIRED.some((k) => !env[k])) return { ok: false, code: "binding_incomplete" };
    // The session file predates A741 (every QA-bound executor sets it), so it is required but does not select the binding.
    if (!env.ALLOY_QA_SESSION_FILE) return { ok: false, code: "persona_session_missing" };
    // QAFX-ORG-01: persona-bound, and the persona org is the registered QA tenant — never the seed org, never Firefly.
    if (env.ALLOY_CERT_FIXTURE_ORG_SOURCE !== "persona") return { ok: false, code: "fixture_org_not_persona_bound" };
    const orgId = env.ALLOY_CERT_FIXTURE_ORG_ID!;
    if (isForbiddenQaOrgId(orgId) || orgId !== TOURS_FIXTURE_PERSONA_ORG.id) return { ok: false, code: "fixture_org_mismatch" };
    const previewOrigin = exactOrigin(env.ALLOY_QA_PREVIEW_ORIGIN);
    if (!previewOrigin || !isLoopbackHttp(previewOrigin) || !new URL(previewOrigin).port) return { ok: false, code: "preview_origin_not_loopback" };
    const sessionOrigin = exactOrigin(env.ALLOY_QA_SESSION_ORIGIN);
    if (!sessionOrigin) return { ok: false, code: "session_origin_malformed" };
    if (
        !SHA256_RE.test(env.ALLOY_QA_SESSION_SHA256!) ||
        !SHA256_RE.test(env.ALLOY_QA_BINDING_DIGEST!) ||
        !SHA256_RE.test(env.ALLOY_QA_AUTHORITY_SHA256!) ||
        !SHA1_RE.test(env.ALLOY_QA_CANDIDATE_SHA!) ||
        !REQUEST_ID_RE.test(env.ALLOY_QA_REQUEST_ID!)
    )
        return { ok: false, code: "binding_malformed" };
    if (env.ALLOY_QA_BINDING_EXPIRES_AT !== undefined) {
        const exp = Date.parse(env.ALLOY_QA_BINDING_EXPIRES_AT);
        if (!Number.isFinite(exp)) return { ok: false, code: "binding_malformed" };
        if (exp <= nowMs) return { ok: false, code: "binding_expired" };
    }
    return {
        ok: true,
        binding: {
            world: { orgId, locationId: TOURS_FIXTURE_SITE.id },
            previewOrigin,
            sessionOrigin,
            sessionFile: env.ALLOY_QA_SESSION_FILE!,
            sessionSha256: env.ALLOY_QA_SESSION_SHA256!,
            candidateSha: env.ALLOY_QA_CANDIDATE_SHA!,
            requestId: env.ALLOY_QA_REQUEST_ID!,
            bindingDigest: env.ALLOY_QA_BINDING_DIGEST!,
            authorityFile: env.ALLOY_QA_AUTHORITY_FILE!,
            authoritySha256: env.ALLOY_QA_AUTHORITY_SHA256!,
        },
    };
}

/**
 * Consistency of the executor's authority record with this env, this program and THIS operation — not live
 * provenance (the toolkit's verifyFixtureAuthority). `count` must be recorded non-mutating; ensure/reset mutating.
 */
export function checkAuthorityRecord(
    text: string | null,
    env: Readonly<Record<string, string | undefined>>,
    binding: ToursFixtureBinding,
    operation: ToursFixtureOperation,
    nowMs: number,
): { ok: true } | { ok: false; code: string } {
    if (text === null) return { ok: false, code: "authority_unreadable" };
    if (sha256Hex(text) !== binding.authoritySha256) return { ok: false, code: "authority_altered" };
    let a: Record<string, unknown>;
    try {
        a = JSON.parse(text) as Record<string, unknown>;
    } catch {
        return { ok: false, code: "authority_altered" };
    }
    if (a?.schema !== FIXTURE_AUTHORITY_SCHEMA) return { ok: false, code: "authority_schema" };
    const expect: [string, unknown][] = [
        ["request_id", binding.requestId],
        ["fixture", TOURS_FIXTURE],
        ["operation", operation],
        ["npm_script", TOURS_FIXTURE_NPM_SCRIPT],
        ["qa_run_id", env.ALLOY_QA_RUN_ID],
        ["environment_id", env.ALLOY_QA_ENVIRONMENT_ID],
        ["candidate_sha", binding.candidateSha],
        ["binding_digest", binding.bindingDigest],
        ["mutating", operation !== "count"],
    ];
    if (expect.some(([k, v]) => v === undefined || a[k] !== v)) return { ok: false, code: "authority_mismatch" };
    const issued = Date.parse(String(a.issued_at ?? ""));
    const expires = Date.parse(String(a.expires_at ?? ""));
    if (!Number.isFinite(issued) || !Number.isFinite(expires)) return { ok: false, code: "authority_schema" };
    if (issued > nowMs) return { ok: false, code: "authority_not_yet_valid" };
    if (expires <= nowMs) return { ok: false, code: "authority_expired" };
    return { ok: true };
}

export type PreviewSession = { origin: string; cookie: string };

/**
 * The Cookie header for the bound session: cookies of the SESSION origin's host only, sent to the trusted PREVIEW
 * origin. The storage state's own `origins` are never read — no URL comes from the session file.
 */
export function sessionFromStorageState(text: string | null, binding: Pick<ToursFixtureBinding, "previewOrigin" | "sessionOrigin">): PreviewSession | null {
    if (text === null) return null;
    try {
        const state = JSON.parse(text) as { cookies?: { name?: string; value?: string; domain?: string }[] };
        const host = new URL(binding.sessionOrigin).hostname;
        const cookies = (state.cookies ?? []).filter((c) => c.name && typeof c.value === "string" && (!c.domain || c.domain.replace(/^\./, "") === host));
        if (!cookies.length) return null;
        return { origin: binding.previewOrigin, cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; ") };
    } catch {
        return null;
    }
}

/* ── output ───────────────────────────────────────────────────────────────────────────────────── */

/** A line is printed only if it is one of the contract shapes and carries nothing that could be a secret. */
const SAFE_LINE = /^(census count=\d{1,9}|reset namespace=[a-z.-]+ removed=\d{1,9}|[✓✗] [a-z0-9_:. =/-]{1,160})$/;

export function makeSink(write: (line: string) => void): { ok(check: string): void; fail(check: string): void; raw(line: string): void; failed(): boolean } {
    let failed = false;
    const emit = (line: string) => {
        // Refuse rather than print: an unsafe line becomes a generic failure, never the text itself.
        if (!SAFE_LINE.test(line)) {
            failed = true;
            write("✗ output_withheld");
            return;
        }
        write(line);
    };
    return {
        ok: (c) => emit(`✓ ${c}`),
        fail: (c) => {
            failed = true;
            emit(`✗ ${c}`);
        },
        raw: emit,
        failed: () => failed,
    };
}

/* ── the legacy booking's time ────────────────────────────────────────────────────────────────── */

/** UTC offset (minutes) of `timeZone` at `at`. */
function offsetMinutes(at: Date, timeZone: string): number {
    const part = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
        .formatToParts(at)
        .find((p) => p.type === "timeZoneName")?.value ?? "GMT";
    const m = /GMT([+-])(\d{2}):(\d{2})/.exec(part);
    return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
}

/** The next legacy-rule Thursday 13:00–13:30 local, at least one day after `now`. */
export function nextLegacySlot(now: Date): { startAt: string; endAt: string } {
    const tz = LEGACY_RULE.timezone;
    for (let d = 1; d <= 8; d++) {
        const probe = new Date(now.getTime() + d * 86_400_000);
        const local = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" }).formatToParts(probe);
        const weekday = local.find((p) => p.type === "weekday")?.value;
        if (weekday !== "Thu") continue;
        const y = local.find((p) => p.type === "year")!.value;
        const mo = local.find((p) => p.type === "month")!.value;
        const da = local.find((p) => p.type === "day")!.value;
        const wall = Date.UTC(Number(y), Number(mo) - 1, Number(da), 13, 0, 0);
        const start = new Date(wall - offsetMinutes(new Date(wall), tz) * 60_000);
        return { startAt: start.toISOString(), endAt: new Date(start.getTime() + LEGACY_RULE.slot_duration_minutes * 60_000).toISOString() };
    }
    throw new Error("no Thursday within eight days");
}

const hm = (t: string) => t.slice(0, 5);
const localWall = (iso: string) =>
    new Intl.DateTimeFormat("en-GB", { timeZone: LEGACY_RULE.timezone, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));

function covers(rule: MarkerRule, booking: MarkerBooking): boolean {
    const wall = localWall(booking.start_at); // e.g. "Thu 13:00"
    const [day, time] = wall.split(" ");
    const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(day ?? "");
    return rule.day_of_week === dow && hm(rule.start_time) <= (time ?? "") && (time ?? "") < hm(rule.end_time);
}

/* ── verification (count) ─────────────────────────────────────────────────────────────────────── */

const markerOf = (row: { metadata?: Record<string, unknown> | null }) => row.metadata?.[TOURS_FIXTURE_MARKER_KEY] === TOURS_FIXTURE_MARKER;
const roleOf = (row: { metadata?: Record<string, unknown> | null }) => String(row.metadata?.[TOURS_FIXTURE_ROLE_KEY] ?? "");

export type ToursFixtureState = {
    rules: MarkerRule[];
    locationRules: MarkerRule[];
    bookings: MarkerBooking[];
    family: MarkerFamily;
    links: LocationLinkRow[];
    forms: FixtureForm[];
};

/** G-T2 and G-T5, re-derived through the product's own functions. Returns the failing check names. */
export function verifyToursFixtureShape(state: ToursFixtureState, world: ToursFixtureWorld): { passed: string[]; failed: string[] } {
    const passed: string[] = [];
    const failed: string[] = [];
    const check = (name: string, ok: boolean) => (ok ? passed : failed).push(name);

    // G-T2 — the legacy rule is organization-wide and offers nothing new at the location …
    check("g_t2_one_legacy_rule", state.rules.length === 1 && state.rules[0]!.location_id === null);
    check("g_t2_legacy_rule_excluded_from_new_availability", tourRulesForLocation(state.rules, world.locationId).length === 0);
    // The legacy confirmation authority is passed by the booking service alone (a source guard holds that), so
    // the fixture checks the shape that authority admits — organization-wide — rather than invoking it.
    check("g_t2_legacy_rule_org_wide_for_pending_confirmation", state.rules.length > 0 && state.rules.every((r) => r.location_id === null));
    // … and the one pending booking sits in an interval ONLY that legacy rule covers.
    const booking = state.bookings[0];
    check("g_t2_one_pending_booking_at_location", state.bookings.length === 1 && booking!.status_key === "pending_approval" && booking!.location_id === world.locationId);
    check("g_t2_booking_inside_legacy_rule", Boolean(booking) && state.rules.some((r) => covers(r, booking!)));
    check("g_t2_no_own_location_rule_covers_booking", Boolean(booking) && !state.locationRules.some((r) => covers(r, booking!)));
    check("g_t2_family_present", Boolean(state.family.personId && state.family.customerId && state.family.opportunityId));

    // G-T5 — the picker, as Preview & Share computes it, over the fixture's own links at the location.
    const own = state.links.filter(markerOf);
    const titles = Object.fromEntries(state.forms.map((f) => [f.id, f.title]));
    const projected = projectTourCalendarShareLinks(own, { locationId: world.locationId, baseUrl: "", formTitles: titles });
    const { attachable, blocked } = tourCalendarAttachOptions(projected);
    const role = new Map(own.map((r) => [r.id, roleOf(r)]));
    check("g_t5_four_fixture_links", own.length === LINK_PLAN.length);
    check("g_t5_two_forms_attachable", attachable.length === 2);
    const a = attachable.find((f) => f.formId === state.forms[0]?.id);
    check("g_t5_form_a_offered_once_on_newest_link", Boolean(a) && role.get(a!.link.linkId) === "A_new" && a!.otherLinks.length === 1 && role.get(a!.otherLinks[0]!.linkId) === "A_old");
    const b = attachable.find((f) => f.formId === state.forms[1]?.id);
    check("g_t5_form_b_offered", Boolean(b) && role.get(b!.link.linkId) === "B" && b!.otherLinks.length === 0);
    check("g_t5_withdrawn_link_blocked", blocked.some((l) => role.get(l.linkId) === "A_withdrawn" && l.unusableReason === "inactive"));
    check("g_t5_no_calendar_published_by_fixture", projected.every((l) => !l.calendarPublished));
    return { passed, failed };
}

/**
 * Marker rows that are LIVE fixture state. A withdrawn link is revoked and is not counted here — but it is
 * still a physical row (the product has no link deletion), reported separately by `retainedRevokedLinksOf`,
 * so a census of 0 never reads as "no fixture rows remain".
 */
export function retainedRevokedLinksOf(links: readonly LocationLinkRow[]): number {
    return links.filter((l) => markerOf(l) && !l.is_active).length;
}

export function censusOf(state: Pick<ToursFixtureState, "rules" | "bookings" | "family" | "links">): number {
    const family = [state.family.personId, state.family.customerId, state.family.opportunityId].filter(Boolean).length + state.family.membershipIds.length;
    const activeLinks = state.links.filter((l) => markerOf(l) && l.is_active).length;
    return state.rules.length + state.bookings.length + family + activeLinks;
}

/* ── operations ───────────────────────────────────────────────────────────────────────────────── */

async function readState(p: ToursFixturePorts, forms: FixtureForm[]): Promise<ToursFixtureState> {
    const [rules, locationRules, bookings, family, links] = await Promise.all([
        p.findMarkerRules(),
        p.findLocationRules(),
        p.findMarkerBookings(),
        p.findMarkerFamily(),
        p.listLocationLinks(),
    ]);
    return { rules, locationRules, bookings, family, links, forms };
}

type Sink = ReturnType<typeof makeSink>;

async function preconditions(p: ToursFixturePorts, out: Sink): Promise<boolean> {
    if (!(await p.orgAndLocationExist())) {
        out.fail("fixture_world_missing");
        return false;
    }
    out.ok("fixture_world_present");
    return true;
}

export async function ensureToursFixture(p: ToursFixturePorts, out: Sink, now: Date, world: ToursFixtureWorld): Promise<number> {
    if (!(await preconditions(p, out))) return 1;
    // Fail-closed outbound contract, measured before the first write.
    if ((await p.countActiveProviderBindings()) !== 0) {
        out.fail("outbound_provider_binding_active");
        return 1;
    }
    out.ok("outbound_no_active_provider_binding");
    const baseline = await p.countOutboundRows();

    const forms = await p.resolveForms(TOURS_FIXTURE_FORM_TITLES);
    if (!Array.isArray(forms)) {
        out.fail(`forms_${forms.refused}`);
        return 1;
    }

    // Each piece is found-or-created on its own, so a run that failed half-way completes on the next one.
    if ((await p.findMarkerRules()).length === 0) await p.createLegacyRule();
    out.ok("legacy_rule_ensured");

    let family = await p.findMarkerFamily();
    if (!family.personId || !family.customerId || !family.opportunityId || family.membershipIds.length === 0) family = await p.createFamily(family);
    out.ok("family_ensured");

    if ((await p.findMarkerBookings()).length === 0) {
        const slot = nextLegacySlot(now);
        await p.insertLegacyPendingBooking({ opportunityId: family.opportunityId!, personId: family.personId!, ...slot });
    }
    out.ok("legacy_pending_booking_ensured");

    const existing = (await p.listLocationLinks()).filter(markerOf);
    for (const planned of LINK_PLAN) {
        const form = forms[planned.form]!;
        let row = existing.find((r) => roleOf(r) === planned.key);
        if (!row) {
            const id = await p.createLink({ formId: form.id, key: planned.key });
            row = { id, form_definition_id: form.id, is_active: true, expires_at: null, allowed_embed_origins: null, metadata: null };
        }
        if (planned.withdraw && row.is_active) await p.withdrawLink({ formId: form.id, linkId: row.id });
    }
    out.ok("links_ensured_through_product_route");

    const after = await p.countOutboundRows();
    if (after.messages !== baseline.messages || after.scheduled !== baseline.scheduled) {
        out.fail("outbound_rows_changed_during_ensure");
        return 1;
    }
    out.ok("outbound_unchanged");

    const state = await readState(p, forms);
    const v = verifyToursFixtureShape(state, world);
    for (const c of v.passed) out.ok(c);
    for (const c of v.failed) out.fail(c);
    out.raw(`census count=${censusOf(state)}`);
    out.ok(`retained_revoked_links=${retainedRevokedLinksOf(state.links)}`);
    return v.failed.length || out.failed() ? 1 : 0;
}

export async function countToursFixture(p: ToursFixturePorts, out: Sink, world: ToursFixtureWorld): Promise<number> {
    if (!(await preconditions(p, out))) return 1;
    const forms = await p.resolveForms(TOURS_FIXTURE_FORM_TITLES);
    const state = await readState(p, Array.isArray(forms) ? forms : []);
    out.raw(`census count=${censusOf(state)}`);
    out.ok(`retained_revoked_links=${retainedRevokedLinksOf(state.links)}`);
    if (censusOf(state) === 0) {
        out.ok("fixture_absent");
        return 0;
    }
    const v = verifyToursFixtureShape(state, world);
    for (const c of v.passed) out.ok(c);
    for (const c of v.failed) out.fail(c);
    return v.failed.length || out.failed() ? 1 : 0;
}

export async function resetToursFixture(p: ToursFixturePorts, out: Sink): Promise<number> {
    // `removed` is PHYSICAL deletions only. Withdrawn links stay as revoked rows and are reported on their own.
    let removed = 0;
    let revoked = 0;
    const report = () => out.raw(`reset namespace=${TOURS_FIXTURE_NAMESPACE} removed=${removed}`);
    if (!(await preconditions(p, out))) {
        report();
        return 1;
    }
    const [rules, bookings, family, links] = await Promise.all([p.findMarkerRules(), p.findMarkerBookings(), p.findMarkerFamily(), p.listLocationLinks()]);
    const activeLinks = links.filter((l) => markerOf(l) && l.is_active);
    const planned = censusOf({ rules, bookings, family, links });
    if (planned > TOURS_FIXTURE_RESET_LIMIT) {
        // Bounded before anything is touched: an unexpected volume means the marker matched something it should not.
        out.fail("reset_unbounded_refused");
        report();
        return 1;
    }
    // Outbound residue is never deleted by a fixture: it is evidence, for an operator.
    if ((await p.countNamespaceOutboundRows()) > 0) {
        out.fail("outbound_residue_present");
        report();
        return 1;
    }
    try {
        // Dependency order: bookings → links → rules → family.
        removed += await p.deleteBookings(bookings.map((b) => b.id));
        for (const l of activeLinks) {
            await p.withdrawLink({ formId: l.form_definition_id, linkId: l.id });
            revoked += 1;
        }
        const schedules = [...new Set(rules.map((r) => r.schedule_id).filter((s): s is string => Boolean(s)))];
        for (const s of schedules) removed += await p.deleteRuleSchedule(s);
        const orphans = rules.filter((r) => !r.schedule_id).map((r) => r.id);
        if (orphans.length) removed += await p.deleteRules(orphans);
        removed += await p.deleteFamily(family);
    } catch {
        out.fail("reset_partial_rerun_to_finish");
        report();
        return 1;
    }
    out.ok(`links_revoked_this_reset=${revoked}`);
    out.ok(`retained_revoked_links=${retainedRevokedLinksOf(links) + revoked}`);
    report();
    return removed <= TOURS_FIXTURE_RESET_LIMIT ? 0 : 1;
}

export async function runToursFixture(input: {
    argv: readonly string[];
    env: Readonly<Record<string, string | undefined>>;
    ports: (bound: { world: ToursFixtureWorld; session: PreviewSession }) => ToursFixturePorts;
    /** Reads the executor-named authority record and session file; null when unreadable. */
    readFile: (path: string) => string | null;
    write: (line: string) => void;
    now?: Date;
}): Promise<number> {
    const out = makeSink(input.write);
    const now = input.now ?? new Date();
    const refuse = (code: string) => {
        out.fail(`refused_${code}`);
        return 2;
    };
    const guard = guardToursFixture(input.argv, input.env);
    if (!guard.ok) return refuse(guard.code);
    const bound = bindingFromEnv(input.env, now.getTime());
    if (!bound.ok) return refuse(bound.code);
    const binding = bound.binding;
    const authority = checkAuthorityRecord(input.readFile(binding.authorityFile), input.env, binding, guard.operation, now.getTime());
    if (!authority.ok) return refuse(authority.code);
    const sessionText = input.readFile(binding.sessionFile);
    if (sessionText !== null && sha256Hex(sessionText) !== binding.sessionSha256) return refuse("session_digest_mismatch");
    const session = sessionFromStorageState(sessionText, binding);
    if (!session) return refuse("persona_session_unreadable");
    out.ok("binding a741 org=persona_qa_shared site=qa_north preview=loopback session=digest_bound authority=consistent");
    let ports: ToursFixturePorts;
    try {
        ports = input.ports({ world: binding.world, session });
    } catch {
        out.fail("refused_ports_unavailable");
        return 2;
    }
    try {
        if (guard.operation === "ensure") return await ensureToursFixture(ports, out, now, binding.world);
        if (guard.operation === "count") return await countToursFixture(ports, out, binding.world);
        return await resetToursFixture(ports, out);
    } catch {
        // Never the error text: it can carry a URL, a key fragment or a row.
        out.fail(`${guard.operation}_failed_rerun_is_safe`);
        if (guard.operation === "reset") out.raw(`reset namespace=${TOURS_FIXTURE_NAMESPACE} removed=0`);
        return 1;
    }
}
