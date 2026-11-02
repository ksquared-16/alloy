/**
 * THE SHARED QA WORKFLOW VERIFIER — negative controls with a FAKE driver.
 *
 * A fake driver proves only the verifier's own logic: what it refuses before a browser exists, what it enforces on
 * everything the driver reports, and that it never trusts the driver's own judgement. It is not a rendered proof.
 * No browser, no network, no session: the "session file" is synthetic bytes in a temp directory.
 */
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
    ALLOWED_METHODS,
    judgeRequest,
    readWorkflowBinding,
    runWorkflowVerification,
    validateAdapter,
    WORKFLOW_FAILURES as F,
    WORKFLOW_REFUSALS as R,
    workflowVerificationLines,
} from "../../scripts/qa/qaWorkflowVerifier.mjs";

const NOW = Date.parse("2026-11-01T15:00:00.000Z");
const RUN = "qar_0123456789ab";
const PERSONA = "finance_admin";
const CAND = "c".repeat(40);
const ORG = "4acc9386-c485-486f-aa1f-05d83499d142";
const API = "http://127.0.0.1:56102";
const PREVIEW = "http://127.0.0.1:4413";
const TAILNET = "https://synthetic.example.ts.net:4413";
const EMAIL = "qa-pool-01@example.com";
const TOKEN = "synthetic-session-token-never-print";

const base = mkdtempSync(join(tmpdir(), "qa-workflow-verifier-"));
afterAll(() => rmSync(base, { recursive: true, force: true }));
const sessionDir = join(base, "qa-runs", RUN, PERSONA);
mkdirSync(sessionDir, { recursive: true });
const SESSION_FILE = join(sessionDir, "storage-state.json");
const SESSION_BYTES = JSON.stringify({ cookies: [{ name: "sb-access-token", value: TOKEN }] });
writeFileSync(SESSION_FILE, SESSION_BYTES);
const SESSION_SHA = createHash("sha256").update(SESSION_BYTES).digest("hex");

const AUTHORITY = Object.freeze({ candidate_sha: CAND, environment_id: "certenv-0123456789", qa_run_id: RUN, org_id: ORG, api_url: API, expires_at: new Date(NOW + 600_000).toISOString() });
const ENV = (over: Record<string, string | undefined> = {}) => ({
    ALLOY_QA_PREVIEW_ORIGIN: PREVIEW,
    ALLOY_QA_SESSION_ORIGIN: TAILNET,
    ALLOY_QA_RUN_ID: RUN,
    ALLOY_QA_PERSONA: PERSONA,
    ALLOY_QA_SESSION_FILE: SESSION_FILE,
    ALLOY_QA_SESSION_SHA256: SESSION_SHA,
    ALLOY_QA_IDENTITY_EMAIL: EMAIL,
    ALLOY_QA_CANDIDATE_SHA: CAND,
    ALLOY_QA_ENVIRONMENT_ID: "certenv-0123456789",
    ALLOY_CERT_FIXTURE_ORG_ID: ORG,
    SUPABASE_URL: API,
    ALLOY_QA_BINDING_EXPIRES_AT: new Date(NOW + 300_000).toISOString(),
    ...over,
});
const bind = (over: Record<string, string | undefined> = {}, authority: Record<string, unknown> = {}, nowMs = NOW) =>
    readWorkflowBinding(ENV(over), { ...AUTHORITY, ...authority } as never, { nowMs });

describe("readWorkflowBinding — refused before any browser exists", () => {
    it("accepts the executor's exact binding; the tailnet session adds only its own origins", () => {
        const b = bind();
        expect(b.ok).toBe(true);
        expect(b.binding).toMatchObject({ previewOrigin: PREVIEW, sessionOrigin: TAILNET, expectedIdentity: EMAIL, candidate: CAND, qaRunId: RUN, persona: PERSONA, orgId: ORG });
        expect([...b.binding!.allowedOrigins].sort()).toEqual([API, PREVIEW, TAILNET, "https://synthetic.example.ts.net:56102"].sort());
        expect(b.binding!.expiresAtMs).toBe(NOW + 300_000);
        const loop = bind({ ALLOY_QA_SESSION_ORIGIN: undefined });
        expect(loop.ok && [...loop.binding!.allowedOrigins].sort()).toEqual([API, PREVIEW].sort());
    });

    it.each([
        ["a non-loopback preview", { ALLOY_QA_PREVIEW_ORIGIN: "http://10.0.0.5:4413" }, R.PREVIEW_ORIGIN],
        ["a preview outside the candidate port range", { ALLOY_QA_PREVIEW_ORIGIN: "http://127.0.0.1:3011" }, R.PREVIEW_ORIGIN],
        ["an https loopback preview", { ALLOY_QA_PREVIEW_ORIGIN: "https://127.0.0.1:4413" }, R.PREVIEW_ORIGIN],
        ["a preview with a path", { ALLOY_QA_PREVIEW_ORIGIN: "http://127.0.0.1:4413/x" }, R.PREVIEW_ORIGIN],
        ["a preview carrying credentials", { ALLOY_QA_PREVIEW_ORIGIN: "http://u:p@127.0.0.1:4413" }, R.PREVIEW_ORIGIN],
        ["a foreign session origin", { ALLOY_QA_SESSION_ORIGIN: "https://evil.example.com:4413" }, R.SESSION_ORIGIN],
        ["a tailnet session on another port", { ALLOY_QA_SESSION_ORIGIN: "https://synthetic.example.ts.net:4414" }, R.SESSION_ORIGIN],
        ["a plain-http tailnet session", { ALLOY_QA_SESSION_ORIGIN: "http://synthetic.example.ts.net:4413" }, R.SESSION_ORIGIN],
        ["another run", { ALLOY_QA_RUN_ID: "qar_ffffffffffff" }, R.RUN],
        ["a malformed persona", { ALLOY_QA_PERSONA: "../admin" }, R.SESSION_FILE],
        ["a session file that is not this run's", { ALLOY_QA_SESSION_FILE: join(base, "qa-runs", "qar_ffffffffffff", PERSONA, "storage-state.json") }, R.SESSION_FILE],
        ["a session file that is not this persona's", { ALLOY_QA_SESSION_FILE: join(base, "qa-runs", RUN, "director", "storage-state.json") }, R.SESSION_FILE],
        ["a traversing session path", { ALLOY_QA_SESSION_FILE: `${sessionDir}/../${PERSONA}/storage-state.json` }, R.SESSION_FILE],
        ["a relative session path", { ALLOY_QA_SESSION_FILE: `qa-runs/${RUN}/${PERSONA}/storage-state.json` }, R.SESSION_FILE],
        ["no session digest", { ALLOY_QA_SESSION_SHA256: undefined }, R.SESSION_DIGEST],
        ["session bytes that are not the bound ones", { ALLOY_QA_SESSION_SHA256: "0".repeat(64) }, R.SESSION_DIGEST],
        ["no identity email", { ALLOY_QA_IDENTITY_EMAIL: undefined }, R.IDENTITY],
        ["an identity that is not an email", { ALLOY_QA_IDENTITY_EMAIL: "finance_admin" }, R.IDENTITY],
        ["another candidate", { ALLOY_QA_CANDIDATE_SHA: "d".repeat(40) }, R.CANDIDATE],
        ["another environment", { ALLOY_QA_ENVIRONMENT_ID: "certenv-ffffffffff" }, R.ENVIRONMENT],
        ["another organization", { ALLOY_CERT_FIXTURE_ORG_ID: "00000000-0000-4000-8000-000000000001" }, R.ORG],
        ["an API origin that is not the attested one", { SUPABASE_URL: "http://127.0.0.1:56191" }, R.API],
        ["an expired binding", { ALLOY_QA_BINDING_EXPIRES_AT: new Date(NOW - 1).toISOString() }, R.EXPIRED],
        ["an unparseable binding expiry", { ALLOY_QA_BINDING_EXPIRES_AT: "soon" }, R.EXPIRED],
    ])("%s → refused", (_label, over, code) => {
        const r = bind(over);
        expect(r).toMatchObject({ ok: false, code });
        expect(JSON.stringify(r)).not.toContain(TOKEN);
    });

    it("an expired AUTHORITY refuses even when the env's expiry is later", () => {
        expect(bind({}, { expires_at: new Date(NOW - 1).toISOString() })).toMatchObject({ ok: false, code: R.EXPIRED });
    });

    it("an unreadable session file refuses; the path is never in the refusal", () => {
        const r = readWorkflowBinding(ENV(), AUTHORITY as never, { nowMs: NOW, readFile: () => { throw new Error(SESSION_FILE); } });
        expect(r).toMatchObject({ ok: false, code: R.SESSION_FILE });
        expect(JSON.stringify(r)).not.toContain(SESSION_FILE);
    });

    it("no environment or authority at all → binding absent", () => {
        expect(readWorkflowBinding(null as never, AUTHORITY as never)).toMatchObject({ ok: false, code: R.BINDING_ABSENT });
        expect(readWorkflowBinding(ENV(), null as never)).toMatchObject({ ok: false, code: R.BINDING_ABSENT });
    });
});

describe("judgeRequest — the network policy", () => {
    const b = bind().binding!;
    it.each([
        ["GET", `${PREVIEW}/x`, true, null],
        ["HEAD", `${TAILNET}/x`, true, null],
        ["GET", `${API}/rest/v1/charges`, true, null],
        ["GET", "data:image/png;base64,AA==", true, null],
        ["POST", `${PREVIEW}/api/x`, false, F.MUTATION],
        ["PATCH", `${API}/rest/v1/charges`, false, F.MUTATION],
        ["DELETE", `${API}/rest/v1/charges`, false, F.MUTATION],
        ["GET", "https://api.sendgrid.com/v3/mail/send", false, F.OUTBOUND],
        ["GET", "https://127.0.0.1:4413/x", false, F.OUTBOUND],
        ["GET", "wss://evil.example.com/socket", false, F.OUTBOUND],
        ["GET", "ws://127.0.0.1:56102/realtime/v1", true, null],
        ["GET", "not a url", false, F.OUTBOUND],
    ])("%s %s → ok=%s", (method, url, ok, failure) => {
        const v = judgeRequest(b, method, url);
        expect(v.ok).toBe(ok);
        if (!ok) expect(v.failure).toBe(failure);
    });
    it("only GET and HEAD are ever allowed", () => expect([...ALLOWED_METHODS]).toEqual(["GET", "HEAD"]));
});

/* ── a fake driver: records what the verifier handed it and returns a scripted page ── */
type Page = { finalUrl?: string; identity?: string | null; requests?: Array<{ method: string; url: string; blocked?: boolean }> | null; snapshot?: Record<string, unknown> };
function fakeDriver(pages: Page[] | ((path: string, i: number) => Page), { failOpen = false, failVisit = false } = {}) {
    const seen = { opened: 0, closed: 0, visits: [] as string[], policy: null as null | Record<string, unknown> };
    return {
        seen,
        driver: {
            async open(policy: Record<string, unknown>) {
                seen.opened += 1;
                seen.policy = policy;
                if (failOpen) throw new Error(`driver could not start ${TOKEN}`);
                return {
                    async visit(path: string) {
                        const i = seen.visits.length;
                        seen.visits.push(path);
                        if (failVisit) throw new Error(`visit failed ${TOKEN}`);
                        const p = typeof pages === "function" ? pages(path, i) : pages[i] ?? pages[pages.length - 1];
                        return { finalUrl: new URL(path, TAILNET).href, identity: EMAIL, requests: [{ method: "GET", url: new URL(path, TAILNET).href }], snapshot: {}, ...p };
                    },
                    async close() { seen.closed += 1; },
                };
            },
        },
    };
}
const ADAPTER = Object.freeze({
    key: "synthetic_flow",
    routes: [{ id: "one", path: "/records/child/abc/financials" }],
    capture: [{ name: "rows", selector: "[data-row]" }],
    reveal: ['[aria-expanded="false"]'],
    assert: (_id: string, snap: Record<string, unknown>) => [{ ok: Array.isArray(snap.rows) && snap.rows.length === 1, check: "ui synthetic one row" }],
});
const ONE_ROW = { snapshot: { rows: [{ attrs: {}, text: "row", parts: {} }] } };
const attestOk = async () => ({ ok: true });
const run = (over: Partial<Parameters<typeof runWorkflowVerification>[0]> = {}) =>
    runWorkflowVerification({ adapter: ADAPTER as never, binding: bind().binding!, driver: fakeDriver([ONE_ROW]).driver as never, attest: attestOk, nowMs: () => NOW, ...over } as never);

describe("runWorkflowVerification — what the fake driver reports is re-judged", () => {
    it("a clean render: route, identity, request log and the adapter's assertion all hold", async () => {
        const f = fakeDriver([ONE_ROW]);
        const r = await run({ driver: f.driver as never });
        expect(r).toMatchObject({ ok: true, failures: [], adapter: "synthetic_flow" });
        expect(r.checks.map((c: { check: string }) => c.check)).toEqual([
            "ui synthetic_flow route=one rendered at its own path",
            `ui synthetic_flow route=one signed in as persona=${PERSONA}`,
            "ui synthetic_flow route=one requests=1 writes=0 foreign=0",
            "ui synthetic one row",
        ]);
        expect(f.seen).toMatchObject({ opened: 1, closed: 1, visits: ["/records/child/abc/financials"] });
        // The driver gets the bound session, the adapter's reveal/capture and the verifier's own judge — nothing else.
        expect(Object.keys(f.seen.policy!).sort()).toEqual(["allowedMethods", "allowedOrigins", "baseOrigin", "capture", "judge", "reveal", "storageStatePath"]);
        expect(f.seen.policy).toMatchObject({ baseOrigin: TAILNET, storageStatePath: SESSION_FILE, reveal: ADAPTER.reveal });
        const judge = f.seen.policy!.judge as (m: string, u: string) => { ok: boolean };
        expect(judge("POST", `${PREVIEW}/x`).ok).toBe(false);
        expect(judge("GET", "https://evil.example.com/").ok).toBe(false);
        const lines = workflowVerificationLines(r);
        expect(lines.at(-1)).toBe("ui verification adapter=synthetic_flow ok=true");
        expect(lines.join("\n")).not.toMatch(new RegExp(`${TOKEN}|storage-state|${SESSION_SHA}`));
    });

    it("ATTESTATION refused (a hold that changed, an expired record) → refused; the browser never opens", async () => {
        for (const attest of [async () => ({ ok: false, code: "target_hold_held" }), async () => null, undefined]) {
            const f = fakeDriver([ONE_ROW]);
            const r = await run({ driver: f.driver as never, attest: attest as never });
            expect(r).toMatchObject({ ok: false, refusal: R.ATTEST });
            expect(f.seen.opened).toBe(0);
        }
    });

    it("an expired binding refuses before attestation and before the browser", async () => {
        let attested = 0;
        const f = fakeDriver([ONE_ROW]);
        const r = await run({ driver: f.driver as never, attest: async () => { attested += 1; return { ok: true }; }, nowMs: () => NOW + 300_001 });
        expect(r).toMatchObject({ ok: false, refusal: R.EXPIRED });
        expect([attested, f.seen.opened]).toEqual([0, 0]);
    });

    it("the binding expiring between routes stops the run as EXPIRED", async () => {
        const two = { ...ADAPTER, routes: [{ id: "one", path: "/a" }, { id: "two", path: "/b" }] };
        let t = NOW;
        const f = fakeDriver(() => { t = NOW + 300_001; return ONE_ROW; });
        const r = await run({ adapter: two as never, driver: f.driver as never, nowMs: () => t });
        expect(r.ok).toBe(false);
        expect(r.failures).toContain(R.EXPIRED);
        expect(f.seen.visits).toEqual(["/a"]);
        expect(f.seen.closed).toBe(1);
    });

    it.each([
        ["a redirect to login", { finalUrl: `${TAILNET}/login?next=/x` }, F.SIGNED_OUT],
        ["a redirect to unauthorized", { finalUrl: `${TAILNET}/unauthorized` }, F.SIGNED_OUT],
        ["a redirect elsewhere", { finalUrl: `${TAILNET}/records/child/other/financials` }, F.REDIRECTED],
        ["a page on another origin", { finalUrl: "https://evil.example.com/records/child/abc/financials" }, F.REDIRECTED],
        ["another signed-in identity", { identity: "someone-else@example.com" }, F.WRONG_IDENTITY],
        ["no signed-in identity", { identity: null }, F.SIGNED_OUT],
        ["an attempted write (even if the driver aborted it)", { requests: [{ method: "POST", url: `${API}/rest/v1/charges`, blocked: true }] }, F.MUTATION],
        ["an attempted outbound send", { requests: [{ method: "GET", url: "https://hooks.slack.com/services/x", blocked: true }] }, F.OUTBOUND],
        ["no request log", { requests: null }, F.DRIVER],
        ["an adapter assertion that fails", { snapshot: { rows: [] } }, F.ASSERTION],
    ])("%s → not ok (%s)", async (_l, page, failure) => {
        const f = fakeDriver([{ ...ONE_ROW, ...page }]);
        const r = await run({ driver: f.driver as never });
        expect(r.ok).toBe(false);
        expect(r.failures).toContain(failure);
        expect(f.seen.closed).toBe(1);
        expect(workflowVerificationLines(r).at(-1)).toMatch(/ok=false failures=/);
    });

    it("a request the driver marked NOT blocked is still re-judged: the driver's own verdict is never trusted", async () => {
        const r = await run({ driver: fakeDriver([{ ...ONE_ROW, requests: [{ method: "DELETE", url: `${PREVIEW}/x`, blocked: false }] }]).driver as never });
        expect(r.failures).toEqual([F.MUTATION]);
    });

    it("an adapter that throws, or returns no assertion at all, fails", async () => {
        for (const assert of [() => { throw new Error(TOKEN); }, () => [], () => null]) {
            const r = await run({ adapter: { ...ADAPTER, assert } as never });
            expect(r.ok).toBe(false);
            expect(r.failures).toContain(F.ASSERTION);
            expect(JSON.stringify(r)).not.toContain(TOKEN);
        }
    });

    it("a driver that cannot start, or a visit that throws, is a DRIVER failure; the session is closed", async () => {
        const a = fakeDriver([ONE_ROW], { failOpen: true });
        const ra = await run({ driver: a.driver as never });
        expect(ra).toMatchObject({ ok: false, failures: [F.DRIVER] });
        const b = fakeDriver([ONE_ROW], { failVisit: true });
        const rb = await run({ driver: b.driver as never });
        expect(rb).toMatchObject({ ok: false, failures: [F.DRIVER] });
        expect(b.seen.closed).toBe(1);
        expect(JSON.stringify([ra, rb])).not.toContain(TOKEN);
    });
});

describe("validateAdapter — the caller names no route", () => {
    it.each([
        ["an absolute URL route", { routes: [{ id: "x", path: "https://evil.example.com/" }] }, R.ROUTE],
        ["a protocol-relative route", { routes: [{ id: "x", path: "//evil.example.com/x" }] }, R.ROUTE],
        ["a traversing route", { routes: [{ id: "x", path: "/a/../admin" }] }, R.ROUTE],
        ["a route with a fragment or encoded host", { routes: [{ id: "x", path: "/a#@evil" }] }, R.ROUTE],
        ["no route", { routes: [] }, R.ADAPTER],
        ["nine routes", { routes: Array.from({ length: 9 }, (_, i) => ({ id: `r${i}`, path: `/r${i}` })) }, R.ADAPTER],
        ["an extra field (e.g. a caller-supplied route list)", { extraRoutes: ["/admin"] }, R.ADAPTER],
        ["no capture", { capture: [] }, R.ADAPTER],
        ["a reveal that is not a selector list", { reveal: "button" }, R.ADAPTER],
        ["no assert", { assert: undefined }, R.ADAPTER],
    ])("%s → refused before the browser", async (_l, over, code) => {
        const adapter = { ...ADAPTER, ...over };
        expect(validateAdapter(adapter)).toMatchObject({ ok: false, code });
        const f = fakeDriver([ONE_ROW]);
        const r = await run({ adapter: adapter as never, driver: f.driver as never });
        expect(r).toMatchObject({ ok: false, refusal: code });
        expect(f.seen.opened).toBe(0);
    });
});

describe("foreign-request and capture diagnostics — origin + class and counts only, and only on failure", () => {
    const visit = (requests: Array<{ method: string; url: string }>, snapshot: Record<string, unknown> = ONE_ROW.snapshot) =>
        run({ driver: fakeDriver([{ requests, snapshot }]).driver as never });
    const lines = (r: { checks: { check: string }[] }) => r.checks.map((c) => c.check);
    const SECRET_Q = `?access_token=${TOKEN}&apikey=${TOKEN}`;

    it.each([
        ["a loopback port outside the binding", `http://127.0.0.1:54421/rest/v1/charges${SECRET_Q}`, "http://127.0.0.1:54421", "loopback_other_port"],
        ["a websocket to a loopback port outside the binding", "ws://127.0.0.1:54421/realtime/v1/websocket", "http://127.0.0.1:54421", "loopback_other_port"],
        ["the session's own tailnet host on another port", `https://synthetic.example.ts.net:3000/api/x${SECRET_Q}`, "https://synthetic.example.ts.net:3000", "session_host_other_port"],
        ["the session host on the default port", "https://synthetic.example.ts.net/x", "https://synthetic.example.ts.net", "session_host_other_port"],
        ["another tailnet host", "https://other-box.example.ts.net:4413/x", "https://other-box.example.ts.net:4413", "tailnet_other_host"],
        ["a private-network address", "http://192.168.1.5:8080/x", "http://192.168.1.5:8080", "private_network"],
        ["a third party (path and query withheld)", `https://fonts.googleapis.com/css2?family=Poppins${SECRET_Q}`, "https://fonts.googleapis.com", "third_party"],
        ["userinfo in a third-party URL", `https://user:${TOKEN}@cdn.example.org/a.js`, "https://cdn.example.org", "third_party"],
    ])("%s → one line naming only its origin and class", async (_l, url, origin, cls) => {
        const r = await visit([{ method: "GET", url: `${TAILNET}/records/child/abc/financials` }, { method: "GET", url }]);
        expect(r.ok).toBe(false);
        expect(r.failures).toContain(F.OUTBOUND);
        expect(lines(r)).toContain(`ui synthetic_flow route=one foreign origin=${origin} class=${cls} count=1`);
        const text = workflowVerificationLines(r).join("\n");
        expect(text).not.toContain(TOKEN);
        expect(text).not.toMatch(/\/rest\/v1|\/css2|\/api\/x|access_token|apikey|user:/);
    });

    it("non-http schemes and unparseable URLs are named by class only", async () => {
        const r = await visit([{ method: "GET", url: "chrome-extension://abcdef/x.js" }, { method: "GET", url: "::not a url::" }]);
        expect(lines(r)).toEqual(expect.arrayContaining(["ui synthetic_flow route=one foreign origin=chrome-extension: class=non_http_scheme count=1", "ui synthetic_flow route=one foreign origin=unparseable class=unparseable count=1"]));
    });

    it("repeated and many origins: one counted line per origin, at most three, then a bounded remainder", async () => {
        const reqs = ["a", "a", "b", "c", "d", "e"].map((h) => ({ method: "GET", url: `https://${h}.example.org/x` }));
        const r = await visit(reqs);
        const diag = lines(r).filter((l) => l.includes(" foreign origin") || l.includes("origins_more"));
        expect(diag).toEqual([
            "ui synthetic_flow route=one foreign origin=https://a.example.org class=third_party count=2",
            "ui synthetic_flow route=one foreign origin=https://b.example.org class=third_party count=1",
            "ui synthetic_flow route=one foreign origin=https://c.example.org class=third_party count=1",
            "ui synthetic_flow route=one foreign origins_more=2",
        ]);
        expect(lines(r)).toContain("ui synthetic_flow route=one requests=6 writes=0 foreign=6");
    });

    it("the production binding's four origins (loopback preview, tailnet session, loopback and tailnet API) are never flagged", async () => {
        const b = bind().binding!;
        expect([...b.allowedOrigins].sort()).toEqual([API, PREVIEW, TAILNET, "https://synthetic.example.ts.net:56102"].sort());
        const r = await visit([PREVIEW, TAILNET, API, "https://synthetic.example.ts.net:56102", "wss://synthetic.example.ts.net:56102"].map((o) => ({ method: "GET", url: `${o}/x` })));
        expect(r.ok).toBe(true);
        expect(lines(r).some((l) => l.includes("foreign origin"))).toBe(false);
    });

    it("a write is a MUTATION, never a foreign-origin line; a clean render prints no diagnostic", async () => {
        const w = await visit([{ method: "POST", url: `${API}/rest/v1/charges` }]);
        expect(w.failures).toEqual([F.MUTATION]);
        expect(lines(w).some((l) => l.includes("foreign origin"))).toBe(false);
        const ok = await visit([{ method: "GET", url: `${TAILNET}/x` }]);
        expect(lines(ok)).toEqual(["ui synthetic_flow route=one rendered at its own path", `ui synthetic_flow route=one signed in as persona=${PERSONA}`, "ui synthetic_flow route=one requests=1 writes=0 foreign=0", "ui synthetic one row"]);
    });

    it("on a failed assertion: how much each capture rendered (count or absent), never its content", async () => {
        const none = await visit([{ method: "GET", url: `${TAILNET}/x` }], { rows: [] });
        expect(lines(none)).toContain("ui synthetic_flow route=one captured rows=0");
        const absent = await visit([{ method: "GET", url: `${TAILNET}/x` }], {});
        expect(lines(absent)).toContain("ui synthetic_flow route=one captured rows=absent");
        const two = await visit([{ method: "GET", url: `${TAILNET}/x` }], { rows: [{ attrs: {}, text: `secret-${TOKEN}`, parts: {} }, { attrs: {}, text: "b", parts: {} }] });
        expect(lines(two)).toContain("ui synthetic_flow route=one captured rows=2");
        expect(workflowVerificationLines(two).join("\n")).not.toContain(TOKEN);
    });
});
