/**
 * The Core Resource family, executed over HTTP against a running server.
 *
 * Eight read endpoints certified against the real listener, real tokens, real boundaries and the
 * real SQL authorities — never a mock of them. Each resource is proven independently, so one
 * failing resource cannot make a passing one look broken and cannot hide a broken one.
 *
 * ── THE FIXTURES THIS SUITE DEPENDS ON, AND WHY THEY ARE THE RIGHT ONES ──
 *
 * The certification tenant happens to contain the two situations that are hardest to get right,
 * and this suite uses both rather than constructing friendlier ones:
 *
 *   · Household 50000001 has nine children enrolled at Riverside and ONE at Lakeside. A
 *     Riverside-scoped installation must see the household and must not learn the Lakeside
 *     sibling exists. That is the hidden-sibling case, and it is live data.
 *
 *   · Two children carry active safeguarding restrictions — one naming a person, one naming its
 *     subject only in free text — while BOTH hold an active `authorized_pickup` role. They are
 *     exactly the rows that would make a naive read publish "may collect" over a protective order.
 *
 * Skips without a certification environment and a running server.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { issueCredential } from "@/lib/platform/principal/applicationCredential";

function certEnv(): { url: string; serviceKey: string } | null {
    const fromProcess = {
        url: process.env.CERT_SUPABASE_URL ?? "",
        serviceKey: process.env.CERT_SERVICE_ROLE_KEY ?? "",
    };
    if (fromProcess.url && fromProcess.serviceKey) return fromProcess;
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
const APP_URL = (process.env.CERT_APP_URL ?? "http://127.0.0.1:3018").replace(/\/+$/, "");
const describeLive = env ? describe : describe.skip;

const ORG = "00000000-0000-4000-8000-000000000001";
const RIVERSIDE = "00000000-0000-4000-8000-000000000010";
const LAKESIDE = "00000000-0000-4000-8000-000000000011";

/** Nine children at Riverside, one at Lakeside. The sibling that must stay hidden. */
const SPLIT_HOUSEHOLD = "00000000-0000-4000-8000-000050000001";
const LAKESIDE_SIBLING = "00000000-0000-4000-8000-000070000055";
const RIVERSIDE_CHILD = "00000000-0000-4000-8000-000070000052";

/** Active `authorized_pickup` role and no restriction — the only shape that may be true. */
const REL_CLEAN = "00000000-0000-4000-8000-000070000090";
/** Active role, and an active restriction naming the related person. */
const CHILD_RESTRICTED_NAMED = "00000000-0000-4000-8000-000070000053";
/** Active role, and an active restriction whose subject is free text only. */
const CHILD_RESTRICTED_UNRESOLVABLE = "00000000-0000-4000-8000-000070000056";

const ALL_READ = [
    "context.read", "locations.read", "children.read", "households.read",
    "relationships.read", "enrollment.read", "schedule.read", "staff.read",
];

const run = Date.now();

type Page = { data: Record<string, unknown>[]; next_cursor: string | null; sync_token: string | null };

describeLive("Thread 7 Core Resources, over the wire", () => {
    let supabase: SupabaseClient;
    const applicationIds: string[] = [];
    const installationIds: string[] = [];
    const creds = new Map<string, { clientId: string; secret: string }>();
    const tokens = new Map<string, string>();

    async function makeInstallation(
        key: string,
        scopes: string[],
        boundary: { mode: "org_wide" | "locations"; ids: string[] },
    ): Promise<string> {
        const registered = await supabase.rpc("register_developer_application", {
            p_slug: `core-res-cert-${key}-${run}`,
            p_name: `Core resource certification ${key} ${run}`,
            p_publisher: "alloy-certification",
            p_ownership_mode: "alloy_managed",
            p_environment: "sandbox",
            p_distribution_mode: "private",
            p_status: "active",
            p_registered_by: "core-resource-cert",
            p_metadata: {},
        });
        const result = registered.data as { ok: boolean; application?: { id: string } };
        expect(result?.ok, JSON.stringify(registered.error ?? result)).toBe(true);
        const applicationId = result.application!.id;
        applicationIds.push(applicationId);

        const inst = await supabase.from("app_installations").insert({
            application_id: applicationId,
            org_id: ORG,
            producer_key: `core-res:${key}:${run}`,
            granted_scopes: scopes,
            boundary_mode: boundary.mode,
            location_boundary: boundary.ids,
            status: "active",
        }).select("id").single();
        expect(inst.error, `installation insert: ${inst.error?.message}`).toBeNull();
        const installationId = (inst.data as { id: string }).id;
        installationIds.push(installationId);

        const issued = await issueCredential(supabase, { installationId, label: `core cert ${key} ${run}` });
        expect(issued.ok, "credential issue").toBe(true);
        if (!issued.ok) throw new Error("credential issue failed");
        creds.set(key, { clientId: issued.issued.clientId, secret: issued.issued.clientSecret });
        return installationId;
    }

    async function bearer(key: string): Promise<string> {
        const cached = tokens.get(key);
        if (cached) return cached;
        const c = creds.get(key)!;
        const res = await fetch(`${APP_URL}/api/v1/oauth/token`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ grant_type: "client_credentials", client_id: c.clientId, client_secret: c.secret }),
        });
        const body = (await res.json()) as { access_token?: string };
        expect(body.access_token, `token exchange for ${key} (status ${res.status})`).toBeTruthy();
        tokens.set(key, body.access_token!);
        return body.access_token!;
    }

    async function raw(key: string, path: string): Promise<Response> {
        return fetch(`${APP_URL}${path}`, { headers: { authorization: `Bearer ${await bearer(key)}` } });
    }

    async function get(key: string, path: string): Promise<Page> {
        const res = await raw(key, path);
        const text = await res.text();
        expect(res.status, `${path} -> ${text.slice(0, 300)}`).toBe(200);
        return JSON.parse(text) as Page;
    }

    let fullInstallation = "";

    beforeAll(async () => {
        supabase = createClient(env!.url, env!.serviceKey, { auth: { persistSession: false } });
        fullInstallation = await makeInstallation("full", ALL_READ, { mode: "org_wide", ids: [] });
        await makeInstallation("riverside", ALL_READ, { mode: "locations", ids: [RIVERSIDE] });
        await makeInstallation("childOnly", ["children.read"], { mode: "org_wide", ids: [] });
        await makeInstallation("contact", ["relationships.read", "relationships.contact.read"], { mode: "org_wide", ids: [] });
        await makeInstallation("staffContact", ["staff.read", "staff.contact.read"], { mode: "org_wide", ids: [] });
        await makeInstallation("contextOnly", ["context.read"], { mode: "org_wide", ids: [] });
        // A boundary naming no site at all: every resource must fail closed, not fall open.
        await makeInstallation("empty", ALL_READ, { mode: "locations", ids: [] });
    }, 120_000);

    afterAll(async () => {
        if (!supabase) return;
        // Correlation rows and installations are removed. No canonical domain row is touched by
        // this suite — every endpoint under test is a read.
        for (const id of installationIds) {
            await supabase.from("integration_resource_refs").delete().eq("installation_id", id);
            await supabase.from("app_installations").delete().eq("id", id);
        }
        for (const id of applicationIds) await supabase.from("developer_applications").delete().eq("id", id);
    }, 120_000);

    const COLLECTIONS = [
        { path: "/api/v1/children", scope: "children.read" },
        { path: "/api/v1/households", scope: "households.read" },
        { path: "/api/v1/relationships", scope: "relationships.read" },
        { path: "/api/v1/enrollments", scope: "enrollment.read" },
        { path: "/api/v1/placements", scope: "enrollment.read" },
        { path: "/api/v1/schedule-assignments", scope: "schedule.read" },
        { path: "/api/v1/staff", scope: "staff.read" },
    ];

    // ── AUTH ────────────────────────────────────────────────────────────────
    describe("auth", () => {
        for (const { path } of [...COLLECTIONS, { path: "/api/v1/schedule-days" }]) {
            it(`${path} refuses an unauthenticated caller`, async () => {
                const res = await fetch(`${APP_URL}${path}`);
                expect(res.status).toBe(401);
            });

            it(`${path} refuses a token that is not one`, async () => {
                const res = await fetch(`${APP_URL}${path}`, { headers: { authorization: "Bearer not-a-token" } });
                expect(res.status).toBe(401);
            });

            it(`${path} refuses an installation holding only context.read`, async () => {
                const res = await raw("contextOnly", path);
                expect(res.status).toBe(403);
            });
        }

        it("accepts each collection for an installation that holds its scope", async () => {
            for (const { path } of COLLECTIONS) {
                const res = await raw("full", path);
                expect(res.status, `${path} with full scopes`).toBe(200);
            }
        });

        it("a neighbouring scope does not imply access — children.read reaches nothing else", async () => {
            expect((await raw("childOnly", "/api/v1/children")).status).toBe(200);
            for (const { path } of COLLECTIONS.filter((c) => c.path !== "/api/v1/children")) {
                expect((await raw("childOnly", path)).status, `childOnly must not reach ${path}`).toBe(403);
            }
            // And not the resources it has no business with at all.
            expect((await raw("childOnly", "/api/v1/locations")).status).toBe(403);
            expect((await raw("childOnly", "/api/v1/attendance-events")).status).toBe(403);
        });

        it("the contact scope is strictly stronger, and is not implied by the base read", async () => {
            const withoutContact = await get("full", "/api/v1/relationships?limit=200");
            const withContact = await get("contact", "/api/v1/relationships?limit=200");
            // `full` deliberately does NOT hold relationships.contact.read.
            expect(withoutContact.data.every((r) => !("email" in r) && !("phone" in r))).toBe(true);
            expect(withContact.data.some((r) => "email" in r)).toBe(true);
        });
    });

    // ── BOUNDARY ────────────────────────────────────────────────────────────
    describe("boundary", () => {
        it("an installation whose boundary names no site sees nothing, anywhere", async () => {
            for (const { path } of COLLECTIONS) {
                const page = await get("empty", `${path}?limit=200`);
                expect(page.data, `${path} must fail closed`).toHaveLength(0);
            }
            const days = await raw("empty", "/api/v1/schedule-days?from=2026-09-21&to=2026-09-27");
            expect((await days.json()).data).toHaveLength(0);
        });

        it("children are bound to enrollment, not to organization membership", async () => {
            // The tenant holds 1,519 children; only those enrolled may appear.
            const page = await get("full", "/api/v1/children?limit=200");
            expect(page.data.length).toBeGreaterThan(0);
            expect(page.data.length).toBeLessThan(100);

            const ids = page.data.map((c) => String(c.id));
            const enrolled = await supabase
                .from("child_enrollment_agreements")
                .select("customer_member_id")
                .eq("org_id", ORG);
            const enrolledIds = new Set((enrolled.data ?? []).map((r) => String(r.customer_member_id)));
            for (const id of ids) expect(enrolledIds.has(id), `${id} appeared without an enrollment`).toBe(true);
        });

        it("a location-scoped installation cannot see a child enrolled elsewhere", async () => {
            const page = await get("riverside", "/api/v1/children?limit=200");
            const ids = page.data.map((c) => String(c.id));
            expect(ids).toContain(RIVERSIDE_CHILD);
            expect(ids).not.toContain(LAKESIDE_SIBLING);
        });

        it("a visible household never reveals a sibling at a site outside the boundary", async () => {
            const households = await get("riverside", "/api/v1/households?limit=200");
            const ids = households.data.map((h) => String(h.id));
            // The household IS visible — nine of its children are at Riverside.
            expect(ids).toContain(SPLIT_HOUSEHOLD);

            // And nothing in the response body mentions the Lakeside sibling, in any field.
            expect(JSON.stringify(households)).not.toContain(LAKESIDE_SIBLING);

            // Asking for that household's children returns only the ones in boundary.
            const children = await get("riverside", `/api/v1/children?household_id=${SPLIT_HOUSEHOLD}&limit=200`);
            const childIds = children.data.map((c) => String(c.id));
            expect(childIds.length).toBeGreaterThan(0);
            expect(childIds).not.toContain(LAKESIDE_SIBLING);
        });

        it("naming an out-of-boundary child in a filter returns nothing, never that child", async () => {
            const page = await get("riverside", `/api/v1/children?child_id=${LAKESIDE_SIBLING}`);
            expect(page.data).toHaveLength(0);
        });

        it("relationships for an out-of-boundary child are unreachable", async () => {
            const page = await get("riverside", `/api/v1/relationships?child_id=${LAKESIDE_SIBLING}`);
            expect(page.data).toHaveLength(0);
        });

        it("a filter narrows within authority and cannot widen past it", async () => {
            const all = await get("riverside", "/api/v1/enrollments?limit=200");
            const narrowed = await get("riverside", `/api/v1/enrollments?site_id=${RIVERSIDE}&limit=200`);
            expect(narrowed.data.length).toBeLessThanOrEqual(all.data.length);
            // Naming the site this installation may NOT reach yields nothing, not everything.
            const widened = await get("riverside", `/api/v1/enrollments?site_id=${LAKESIDE}&limit=200`);
            expect(widened.data).toHaveLength(0);
        });

        it("a cursor issued to a wider installation does not widen a narrower one", async () => {
            const wide = await get("full", "/api/v1/children?limit=1");
            expect(wide.next_cursor).toBeTruthy();
            const narrowed = await get("riverside", `/api/v1/children?limit=200&cursor=${encodeURIComponent(wide.next_cursor!)}`);
            const ids = narrowed.data.map((c) => String(c.id));
            expect(ids).not.toContain(LAKESIDE_SIBLING);
            // A cursor is a position, never a permission.
            for (const id of ids) {
                const check = await get("riverside", `/api/v1/children?child_id=${id}`);
                expect(check.data.length, `${id} came back through a cursor but is not independently visible`).toBe(1);
            }
        });

        it("staff are bound to their assigned location", async () => {
            const wide = await get("full", "/api/v1/staff?limit=200");
            for (const s of wide.data) expect(s.primary_location_id, "staff with no location must not appear").toBeTruthy();
            const narrow = await get("riverside", `/api/v1/staff?site_id=${LAKESIDE}&limit=200`);
            expect(narrow.data).toHaveLength(0);
        });
    });

    // ── PICKUP AUTHORITY ────────────────────────────────────────────────────
    describe("effective pickup authority", () => {
        it("is true only where a grant exists and nothing withdraws it", async () => {
            const page = await get("full", "/api/v1/relationships?limit=200");
            const clean = page.data.find((r) => String(r.id) === REL_CLEAN);
            expect(clean, "the unrestricted relationship fixture must be visible").toBeTruthy();
            expect(clean!.pickup_authorized).toBe(true);
        });

        it("an active restriction naming the person withdraws it", async () => {
            const page = await get("full", `/api/v1/relationships?child_id=${CHILD_RESTRICTED_NAMED}&limit=200`);
            expect(page.data.length).toBeGreaterThan(0);
            for (const r of page.data) expect(r.pickup_authorized, String(r.id)).toBe(false);
        });

        it("a restriction whose subject cannot be resolved fails CLOSED", async () => {
            // The role is active on this child. The restriction names its subject in free text
            // only, so it cannot be proven not to name this person — and false is the safe answer.
            const page = await get("full", `/api/v1/relationships?child_id=${CHILD_RESTRICTED_UNRESOLVABLE}&limit=200`);
            expect(page.data.length).toBeGreaterThan(0);
            for (const r of page.data) expect(r.pickup_authorized, String(r.id)).toBe(false);
        });

        it("never publishes the raw role, the restriction, or any reason", async () => {
            const res = await raw("contact", "/api/v1/relationships?limit=200");
            const body = await res.text();
            for (const leak of [
                "authorized_pickup", "may_not_pick_up", "contact_restricted",
                "restriction", "safeguarding", "protective", "custody",
                "operational_effect", "affected_person", "evidence", "review_state",
            ]) {
                expect(body.toLowerCase(), `relationship response leaked "${leak}"`).not.toContain(leak.toLowerCase());
            }
        });

        it("is not writable from outside", async () => {
            for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
                const res = await fetch(`${APP_URL}/api/v1/relationships`, {
                    method,
                    headers: { authorization: `Bearer ${await bearer("full")}`, "content-type": "application/json" },
                    body: JSON.stringify({ pickup_authorized: true }),
                });
                expect([404, 405], `${method} must not be a relationship mutation`).toContain(res.status);
            }
        });
    });

    // ── PRIVACY ─────────────────────────────────────────────────────────────
    describe("privacy", () => {
        const FORBIDDEN = [
            "allerg", "medical", "medication", "health", "diagnos", "safeguard",
            "stripe", "payment_method", "setup_intent", "compensation", "payroll",
            "salary", "pay_rate", "rate_amount", "tax", "ssn",
            "created_by", "updated_by", "metadata",
        ];

        for (const { path } of COLLECTIONS) {
            it(`${path} publishes no excluded field`, async () => {
                const res = await raw("full", `${path}?limit=200`);
                const body = (await res.text()).toLowerCase();
                for (const word of FORBIDDEN) {
                    expect(body, `${path} leaked "${word}"`).not.toContain(word);
                }
            });
        }

        it("the child resource carries identity and lifecycle, and nothing more", async () => {
            const page = await get("full", "/api/v1/children?limit=5");
            expect(page.data.length).toBeGreaterThan(0);
            for (const child of page.data) {
                expect(Object.keys(child).sort()).toEqual([
                    "date_of_birth", "display_name", "external_id", "first_name",
                    "household_id", "id", "last_name", "status", "status_key",
                ]);
            }
        });

        it("the household resource is a shell, with no member list to mine", async () => {
            const page = await get("full", "/api/v1/households?limit=5");
            expect(page.data.length).toBeGreaterThan(0);
            for (const household of page.data) {
                expect(Object.keys(household).sort()).toEqual([
                    "household_type", "id", "name", "status_key",
                ]);
            }
        });

        it("staff carry no pay and no internal access information", async () => {
            const page = await get("staffContact", "/api/v1/staff?limit=200");
            for (const s of page.data) {
                expect(Object.keys(s)).not.toContain("permissions");
                expect(Object.keys(s)).not.toContain("roles");
            }
        });
    });

    // ── SYNC ────────────────────────────────────────────────────────────────
    describe("collection and sync law", () => {
        for (const { path } of COLLECTIONS) {
            it(`${path} bootstraps, pages and resumes without a gap`, async () => {
                const whole = await get("full", `${path}?limit=200`);
                if (whole.data.length < 2) return; // nothing to page; the other assertions still ran

                const seen: string[] = [];
                let cursor: string | null = null;
                // One row per page is the strongest form of this test: it forces the
                // (sort_key, id) tiebreak to carry every boundary. The guard must therefore
                // exceed the largest collection a single page can return, not a convenient
                // round number — a guard that trips looks exactly like a paging gap.
                for (let guard = 0; guard <= 220; guard += 1) {
                    const page: Page = await get(
                        "full",
                        `${path}?limit=1${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
                    );
                    for (const row of page.data) seen.push(String(row.id));
                    cursor = page.next_cursor;
                    if (!cursor) break;
                }
                expect(seen, `${path} paged set must equal the whole set`).toEqual(whole.data.map((r) => String(r.id)));
                expect(new Set(seen).size, `${path} repeated a row across pages`).toBe(seen.length);
            });

            it(`${path} resumes exactly from a sync token`, async () => {
                const first = await get("full", `${path}?limit=1`);
                if (!first.sync_token) return;
                const rest = await get("full", `${path}?limit=200&since_token=${encodeURIComponent(first.sync_token)}`);
                const restIds = rest.data.map((r) => String(r.id));
                expect(restIds, "the checkpointed row must not be re-delivered").not.toContain(String(first.data[0].id));
            });

            it(`${path} rejects a malformed cursor rather than ignoring it`, async () => {
                const res = await raw("full", `${path}?cursor=not-a-cursor`);
                expect(res.status).toBe(400);
            });

            it(`${path} clamps its page size`, async () => {
                const page = await get("full", `${path}?limit=5000`);
                expect(page.data.length).toBeLessThanOrEqual(200);
            });
        }

        it("a lifecycle change is delivered incrementally", async () => {
            // Children carry a maintained clock, so a change must surface above a watermark taken
            // before it. The change is made and then reverted; no fixture is left altered.
            const before = new Date().toISOString();
            const original = await supabase
                .from("customer_members").select("display_name").eq("id", RIVERSIDE_CHILD).single();
            const previous = (original.data as { display_name: string | null } | null)?.display_name ?? null;

            await supabase.from("customer_members")
                .update({ display_name: `${previous ?? "child"} ` }).eq("id", RIVERSIDE_CHILD);
            try {
                const page = await get("full", `/api/v1/children?updated_since=${encodeURIComponent(before)}&limit=200`);
                expect(page.data.map((c) => String(c.id))).toContain(RIVERSIDE_CHILD);
            } finally {
                await supabase.from("customer_members")
                    .update({ display_name: previous }).eq("id", RIVERSIDE_CHILD);
            }
        });
    });

    // ── CORRELATION ─────────────────────────────────────────────────────────
    describe("external correlation", () => {
        it("a mapping is visible only to the installation that owns it", async () => {
            const external = `core-cert-child-${run}`;
            const { error } = await supabase.from("integration_resource_refs").insert({
                installation_id: fullInstallation,
                org_id: ORG,
                resource_type: "child",
                external_id: external,
                child_customer_member_id: RIVERSIDE_CHILD,
                status: "active",
            });
            expect(error, `map child: ${error?.message}`).toBeNull();

            const mine = await get("full", `/api/v1/children?child_id=${RIVERSIDE_CHILD}`);
            expect(mine.data[0]?.external_id).toBe(external);

            // A different installation sees the same child with NO alias — not a different one,
            // and never this one.
            const theirs = await get("riverside", `/api/v1/children?child_id=${RIVERSIDE_CHILD}`);
            expect(theirs.data[0]?.external_id).toBeNull();

            // And cannot resolve the child by an identifier it does not own.
            const probe = await get("riverside", `/api/v1/children?external_id=${external}`);
            expect(probe.data, "an external id must not cross a trust boundary").toHaveLength(0);
        });
    });

    // ── DERIVED PROJECTION ──────────────────────────────────────────────────
    describe("the dated schedule projection", () => {
        const WINDOW = "from=2026-09-21&to=2026-09-27";

        it("requires a window rather than behaving like a collection", async () => {
            expect((await raw("full", "/api/v1/schedule-days")).status).toBe(400);
            expect((await raw("full", "/api/v1/schedule-days?from=2026-09-21")).status).toBe(400);
        });

        it("refuses an inverted or oversized window", async () => {
            expect((await raw("full", "/api/v1/schedule-days?from=2026-09-27&to=2026-09-21")).status).toBe(400);
            expect((await raw("full", "/api/v1/schedule-days?from=2026-01-01&to=2026-12-31")).status).toBe(400);
        });

        it("offers no sync token and no cursor, because it has nothing to checkpoint", async () => {
            const res = await raw("full", `/api/v1/schedule-days?${WINDOW}`);
            const body = await res.json();
            expect(body.next_cursor).toBeUndefined();
            expect(body.sync_token).toBeUndefined();
            expect(body.derived_from).toBe("schedule_assignments");
        });

        it("is deterministic across repeated identical windows", async () => {
            const a = await (await raw("full", `/api/v1/schedule-days?${WINDOW}`)).json();
            const b = await (await raw("full", `/api/v1/schedule-days?${WINDOW}`)).json();
            expect(JSON.stringify(a.data)).toBe(JSON.stringify(b.data));
        });

        it("projects only days the pattern actually recurs on, inside the window", async () => {
            const body = await (await raw("full", `/api/v1/schedule-days?${WINDOW}`)).json();
            expect(body.data.length).toBeGreaterThan(0);
            for (const day of body.data as { date: string; weekday: number }[]) {
                expect(day.date >= "2026-09-21" && day.date <= "2026-09-27").toBe(true);
                expect(new Date(`${day.date}T00:00:00Z`).getUTCDay()).toBe(day.weekday);
            }
        });

        it("every projected day names the committed assignment it came from", async () => {
            const body = await (await raw("full", `/api/v1/schedule-days?${WINDOW}`)).json();
            const assignments = await get("full", "/api/v1/schedule-assignments?limit=200");
            const known = new Set(assignments.data.map((a) => String(a.id)));
            for (const day of body.data as { schedule_assignment_id: string }[]) {
                expect(known.has(day.schedule_assignment_id), "a day cited an assignment the caller cannot see").toBe(true);
            }
        });

        it("respects the boundary exactly as the canonical resource does", async () => {
            const wide = await (await raw("full", `/api/v1/schedule-days?${WINDOW}`)).json();
            const narrow = await (await raw("riverside", `/api/v1/schedule-days?${WINDOW}`)).json();
            expect(narrow.data.length).toBeLessThanOrEqual(wide.data.length);
            const narrowChildren = new Set((narrow.data as { child_id: string }[]).map((d) => d.child_id));
            expect(narrowChildren.has(LAKESIDE_SIBLING)).toBe(false);
        });
    });

    // ── SCHEDULE POLYMORPHISM ───────────────────────────────────────────────
    describe("schedule assignments are children only", () => {
        it("never returns a staff assignment held in the same authority", async () => {
            const page = await get("full", "/api/v1/schedule-assignments?limit=200");
            const staffRows = await supabase
                .from("schedule_assignments").select("id").eq("org_id", ORG).eq("subject_type", "staff");
            const staffIds = new Set((staffRows.data ?? []).map((r) => String(r.id)));
            expect(staffIds.size, "the fixture must contain a staff assignment for this to prove anything").toBeGreaterThan(0);
            for (const row of page.data) {
                expect(staffIds.has(String(row.id)), "a staff schedule reached a child scope").toBe(false);
            }
        });
    });

    // ── REGRESSION ──────────────────────────────────────────────────────────
    describe("the surface that already shipped still works", () => {
        it("token exchange, context, locations and attendance are unaffected", async () => {
            expect((await raw("full", "/api/v1/context")).status).toBe(200);
            expect((await raw("full", "/api/v1/locations")).status).toBe(200);
            expect((await raw("full", "/api/v1/attendance-events")).status).toBe(403); // no attendance.read
            const attendance = await makeInstallation(
                "attendance", ["attendance.read"], { mode: "org_wide", ids: [] },
            );
            expect(attendance).toBeTruthy();
            expect((await raw("attendance", "/api/v1/attendance-events")).status).toBe(200);
        });
    });
});
