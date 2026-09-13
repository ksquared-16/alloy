/**
 * PROCESSING AUTHORITY — FOUR CAPABILITIES, AND SIX MUTATIONS THAT ASKED NOTHING.
 *
 * This cluster arrived with two opposite problems, and proving only one of them fixed would have
 * been the more comfortable lie.
 *
 * Twelve handlers asked `ctx.role !== "admin"`, and one shared helper asked
 * `ctx.role === "admin" || ctx.role === "ops"` on behalf of seven more. That is job-title authority.
 *
 * Beside them sat real Processing mutations — classifying a case, persisting operator decisions,
 * running a detection pass, previewing and COMMITTING a related-record proposal — that asked
 * NOTHING beyond portal admission. Anyone who could reach the admin shell could commit them. PHASE 3
 * is the proof that this is no longer true, and it is the phase this file exists for.
 *
 * ── WHY A STATUS CODE IS THE SUBJECT ──
 *
 * Every gate runs before the handler reads its body or looks anything up, so an empty body is all
 * the payload needed and the answer is unambiguous:
 *
 *     403  → refused at the gate
 *     anything else (400 invalid body, 404 no such row) → ADMITTED past the gate
 *
 * A 404 is therefore a PASS for an authorized persona: it means the gate let them through to a
 * lookup that legitimately found nothing. Writing real Processing state instead would prove the same
 * thing while leaving rows this file would have to clean up, and cleanup that fails leaves the next
 * run lying.
 *
 * Personas come from `fixtures/access-personas.mjs`; run
 * `node ../certification/playwright/fixtures/access-personas.mjs setup` from `web/` first.
 */
import { test, expect, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const OPERATOR_STATE = path.join(__dirname, "..", ".auth", "operator.json");
const EVIDENCE = path.join(__dirname, "..", "evidence", "processing-authority");
const PASSWORD = "alloy-local-cert";

/** Ids that belong to nobody. Admitted callers get 404 or 400; refused callers get 403. */
const NO_CASE = "99999999-0000-4000-8000-0000000000c1";
const NO_DOC = "99999999-0000-4000-8000-0000000000d1";
const NO_PROPOSAL = "99999999-0000-4000-8000-0000000000e1";

const PERSONAS = {
    /** ROLE A — holds `processing.operate` and nothing else. */
    processor: { email: "cert.procoperate@northwind.invalid", role: "mcert_proc_operate" },
    /** ROLE B — holds `processing.archive` and nothing else. */
    archiver: { email: "cert.procarchive@northwind.invalid", role: "mcert_proc_archive" },
    /** ROLE C — holds `processing.documents.manage` and nothing else. */
    docManager: { email: "cert.procdocs@northwind.invalid", role: "mcert_proc_docs" },
    /** ROLE D — holds `processing.dev_cleanup`. The environment still refuses it. */
    resetter: { email: "cert.procdevclean@northwind.invalid", role: "mcert_proc_devcleanup" },
    /** ROLE E — its LABEL is "Admin". It holds no Processing capability at all. */
    titular: { email: "cert.proctitular@northwind.invalid", role: "mcert_proc_titular" },
    /** The security control: admitted to the portal, holding nothing. */
    portalOnly: { email: "cert.procportal@northwind.invalid", role: "mcert_proc_portal_only" },
    /** Holds the general `documents.write` that `ops` holds everywhere. Not a Processing authority. */
    docsWriter: { email: "cert.procdocswriter@northwind.invalid", role: "mcert_proc_docs_writer" },
    /** Holds `forms.author`. Authors packets; works no case. */
    formsAuthor: { email: "cert.procformsauthor@northwind.invalid", role: "mcert_proc_forms_author" },
} as const;

const OPS = { email: "cert.ops@northwind.invalid", id: "c0000000-0000-4000-8000-00000000d003" };

type Door =
    | "operate:classification"
    | "operate:commit"
    | "operate:identityApprove"
    | "archive"
    | "documents:rename"
    | "documents:delete"
    | "devCleanup"
    | "formsAuthor:packetRequirements";

type Session = { page: Page; request: APIRequestContext; signedIn: boolean; close: () => Promise<void> };

async function signIn(browser: Browser, email: string): Promise<Session> {
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    await page.goto("/login");
    await page.locator('input[type="email"]').first().fill(email);
    const pw = page.locator('input[type="password"]').first();
    await pw.fill(PASSWORD);
    await pw.press("Enter");
    let signedIn = true;
    try {
        await page.waitForURL("**/workspace**", { timeout: 90_000 });
    } catch {
        signedIn = false;
    }
    return { page, request: page.request, signedIn, close: () => context.close() };
}

async function knock(request: APIRequestContext, door: Door): Promise<number> {
    const no = { failOnStatusCode: false } as const;
    switch (door) {
        case "operate:classification":
            return (await request.patch(`/api/admin/processing/cases/${NO_CASE}/classification`, { data: {}, ...no })).status();
        case "operate:commit":
            return (
                await request.post(
                    `/api/admin/processing/cases/${NO_CASE}/related-record-proposals/${NO_PROPOSAL}/commit`,
                    { data: {}, ...no },
                )
            ).status();
        case "operate:identityApprove":
            return (await request.post(`/api/admin/processing/cases/${NO_CASE}/identity/approve`, { data: {}, ...no })).status();
        case "archive":
            return (await request.post(`/api/admin/processing/cases/${NO_CASE}/archive`, { data: {}, ...no })).status();
        case "documents:rename":
            return (await request.patch(`/api/admin/pos/documents/${NO_DOC}`, { data: {}, ...no })).status();
        case "documents:delete":
            return (await request.delete(`/api/admin/pos/documents/${NO_DOC}`, no)).status();
        case "devCleanup":
            return (await request.post("/api/admin/processing/dev-cleanup", { data: {}, ...no })).status();
        case "formsAuthor:packetRequirements":
            return (await request.get("/api/admin/pos/packets/requirements?form_definition_ids=", no)).status();
    }
}

const admitted = (status: number) => status !== 403;

const MATRIX: Record<string, Record<string, number>> = {};
function record(who: string, door: string, status: number) {
    MATRIX[who] = MATRIX[who] ?? {};
    MATRIX[who][door] = status;
}

test.describe.configure({ mode: "serial" });

test.describe("Processing authority is a capability, not a job title", () => {
    test.afterAll(() => {
        fs.mkdirSync(EVIDENCE, { recursive: true });
        fs.writeFileSync(path.join(EVIDENCE, "authority-matrix.json"), `${JSON.stringify(MATRIX, null, 2)}\n`);
    });

    /* ── PHASE 1 — the four capabilities, proved independent ─────────────────────────────── */

    test("PHASE 1 — each capability opens its own door and no other", async ({ browser }) => {
        /*
         * If the four keys were secretly one key, some row would show two families opening together.
         * If any handler still read a job title, `titular` — whose role LABEL is "Admin" — would
         * open doors its holder was never granted.
         */
        const DOORS: Door[] = [
            "operate:classification",
            "operate:identityApprove",
            "archive",
            "documents:rename",
            "documents:delete",
            "formsAuthor:packetRequirements",
        ];
        const expected: Record<keyof typeof PERSONAS, Partial<Record<Door, boolean>>> = {
            processor: {
                "operate:classification": true, "operate:identityApprove": true,
                archive: false, "documents:rename": false, "documents:delete": false,
                "formsAuthor:packetRequirements": false,
            },
            archiver: {
                "operate:classification": false, "operate:identityApprove": false,
                archive: true, "documents:rename": false, "documents:delete": false,
                "formsAuthor:packetRequirements": false,
            },
            docManager: {
                "operate:classification": false, "operate:identityApprove": false,
                archive: false, "documents:rename": true, "documents:delete": true,
                "formsAuthor:packetRequirements": false,
            },
            resetter: {
                "operate:classification": false, "operate:identityApprove": false,
                archive: false, "documents:rename": false, "documents:delete": false,
                "formsAuthor:packetRequirements": false,
            },
            titular: {
                "operate:classification": false, "operate:identityApprove": false,
                archive: false, "documents:rename": false, "documents:delete": false,
                "formsAuthor:packetRequirements": false,
            },
            portalOnly: {
                "operate:classification": false, "operate:identityApprove": false,
                archive: false, "documents:rename": false, "documents:delete": false,
                "formsAuthor:packetRequirements": false,
            },
            /*
             * THE REASON `processing.documents.manage` EXISTS. This persona holds the general
             * `documents.write` that `ops` holds in every organization. If the cleanup had reused
             * that key, these two document doors would open here — which is precisely the
             * broadening that was not approved.
             */
            docsWriter: {
                "operate:classification": false, "operate:identityApprove": false,
                archive: false, "documents:rename": false, "documents:delete": false,
                "formsAuthor:packetRequirements": false,
            },
            /* forms.author reaches the authoring it owns and NO Processing authority. */
            formsAuthor: {
                "operate:classification": false, "operate:identityApprove": false,
                archive: false, "documents:rename": false, "documents:delete": false,
                "formsAuthor:packetRequirements": true,
            },
        };

        for (const [name, p] of Object.entries(PERSONAS) as [keyof typeof PERSONAS, { email: string }][]) {
            const s = await signIn(browser, p.email);
            expect(s.signedIn, `${name} could not sign in`).toBe(true);
            for (const door of DOORS) {
                const status = await knock(s.request, door);
                record(name, door, status);
                expect(
                    admitted(status),
                    `${name} at ${door}: expected ${expected[name][door] ? "ADMITTED" : "REFUSED (403)"}, got ${status}`,
                ).toBe(expected[name][door]);
            }
            await s.close();
        }
    });

    /* ── PHASE 2 — compatibility ──────────────────────────────────────────────────────────── */

    test("PHASE 2 — admin keeps everything; ops gains nothing it did not have", async ({ browser }) => {
        const adminCtx = await browser.newContext({ storageState: OPERATOR_STATE });
        for (const door of ["operate:classification", "operate:identityApprove", "archive", "documents:rename", "documents:delete"] as Door[]) {
            const status = await knock(adminCtx.request, door);
            record("admin", door, status);
            expect(admitted(status), `admin lost ${door} (${status})`).toBe(true);
        }
        await adminCtx.close();

        /*
         * `ops` is the load-bearing half. It was admitted by the Processing OPERATOR context and by
         * nothing else in this cluster: archive was admin-only, and so were both document
         * operations. Handing it `processing.operate` must not have swept those along.
         */
        const s = await signIn(browser, OPS.email);
        expect(s.signedIn, "cert.ops could not sign in").toBe(true);
        const opsExpected: Partial<Record<Door, boolean>> = {
            "operate:classification": true,
            "operate:identityApprove": true,
            archive: false,
            "documents:rename": false,
            "documents:delete": false,
        };
        for (const door of Object.keys(opsExpected) as Door[]) {
            const status = await knock(s.request, door);
            record("ops", door, status);
            expect(
                admitted(status),
                `ops at ${door}: expected ${opsExpected[door] ? "ADMITTED" : "REFUSED"}, got ${status}`,
            ).toBe(opsExpected[door]);
        }
        await s.close();
    });

    /* ── PHASE 3 — the tightening, which is the point of this slice ───────────────────────── */

    test("PHASE 3 — portal admission no longer authorizes a Processing mutation", async ({ browser }) => {
        /*
         * Before this change every door below was open to this persona. `classification` rewrote a
         * case's classification; `commit` committed a related-record proposal into real records;
         * `form-draft` ran a detection pass. None of them asked anything beyond "are you signed in
         * and in the portal".
         *
         * This is the security regression test the slice is FOR. If it ever passes by returning
         * anything other than 403, the tightening has been undone.
         */
        const s = await signIn(browser, PERSONAS.portalOnly.email);
        expect(s.signedIn, "the portal-only persona could not sign in").toBe(true);

        const formerlyOpen: [string, () => Promise<number>][] = [
            ["classification PATCH", async () => knock(s.request, "operate:classification")],
            ["related-record commit POST", async () => knock(s.request, "operate:commit")],
            ["form-draft POST", async () =>
                (await s.request.post(`/api/admin/processing/cases/${NO_CASE}/form-draft`, { data: {}, failOnStatusCode: false })).status()],
            ["apply-discovery POST", async () =>
                (await s.request.post(`/api/admin/processing/cases/${NO_CASE}/form-draft/apply-discovery`, { data: {}, failOnStatusCode: false })).status()],
            ["discovery-decisions PUT", async () =>
                (await s.request.put(`/api/admin/processing/cases/${NO_CASE}/form-draft/discovery-decisions`, { data: {}, failOnStatusCode: false })).status()],
            ["related-record preview POST", async () =>
                (await s.request.post(`/api/admin/processing/cases/${NO_CASE}/related-record-proposals/${NO_PROPOSAL}/preview`, { data: {}, failOnStatusCode: false })).status()],
        ];
        for (const [label, probe] of formerlyOpen) {
            const status = await probe();
            record("portalOnly", label, status);
            expect(status, `${label} must now refuse a caller holding only portal.access`).toBe(403);
        }
        await s.close();
    });

    test("PHASE 3b — and the reads that were open are still open", async ({ browser }) => {
        /*
         * The other half of the same claim. Write authority was repaired; read behaviour was NOT
         * touched, because tightening a read removes access people have today and that was a
         * separate decision. A slice that quietly took the reads too would look identical in the
         * matrix above and be a regression in the product.
         */
        const s = await signIn(browser, PERSONAS.portalOnly.email);
        const reads = [
            "/api/admin/processing/queue",
            `/api/admin/processing/cases/${NO_CASE}`,
            `/api/admin/processing/cases/${NO_CASE}/identity/review`,
            `/api/admin/processing/cases/${NO_CASE}/form-draft/discovery-decisions`,
            "/api/admin/pos/documents",
            "/api/admin/pos/packets",
        ];
        for (const url of reads) {
            const res = await s.request.get(url, { failOnStatusCode: false });
            record("portalOnly", `GET ${url.replace(NO_CASE, ":case")}`, res.status());
            expect(res.status(), `${url} was open before this slice and must stay open`).not.toBe(403);
        }
        await s.close();
    });

    /* ── PHASE 4 — the environment outranks the capability ───────────────────────────────── */

    test("PHASE 4 — dev cleanup is refused in a production-equivalent environment, capability or not", async ({ browser }) => {
        /*
         * The certification server is a PRODUCTION build served by `next start`, so `NODE_ENV` is
         * `production` — which makes this the real proof rather than a simulated one.
         * `assertProcessingDevCleanupAllowed` runs before the capability is consulted, so the holder
         * of `processing.dev_cleanup` and the organization's administrator are refused alike.
         *
         * The confirmation token is deliberately not sent: it is an acknowledgement of a destructive
         * action, not a credential, and it could not change this answer if it were.
         */
        const holder = await signIn(browser, PERSONAS.resetter.email);
        const holderStatus = await knock(holder.request, "devCleanup");
        record("resetter", "devCleanup", holderStatus);
        expect(holderStatus, "the capability holder must still be refused in production").toBe(403);
        await holder.close();

        const adminCtx = await browser.newContext({ storageState: OPERATOR_STATE });
        const adminStatus = await knock(adminCtx.request, "devCleanup");
        record("admin", "devCleanup", adminStatus);
        expect(adminStatus, "an administrator must still be refused in production").toBe(403);
        await adminCtx.close();
    });

    /* ── PHASE 5 — multi-role composition, and immediate revocation ──────────────────────── */

    test("PHASE 5 — a second role opens the door, and removing it closes it again", async ({ browser }) => {
        /*
         * W-17 made assignment additive and the resolver unions capabilities. The subject starts
         * holding portal admission and nothing else, is granted the processor role by an
         * administrator, and the door opens on the NEXT request in the SAME signed-in session — no
         * sign-out, no reload, no TTL. Then it closes the same way.
         */
        const subjectId = "c0000000-0000-4000-8000-00000000d021";
        const admin = await browser.newContext({ storageState: OPERATOR_STATE });
        const subject = await signIn(browser, PERSONAS.portalOnly.email);

        expect(await knock(subject.request, "operate:classification"), "precondition: shut").toBe(403);

        const add = await admin.request.post(`/api/admin/users/${subjectId}/roles`, {
            data: { role: PERSONAS.processor.role },
            failOnStatusCode: false,
        });
        expect(add.status(), `assignment failed: ${await add.text()}`).toBeLessThan(400);

        const opened = await knock(subject.request, "operate:classification");
        record("portalOnly+processor", "operate:classification", opened);
        expect(admitted(opened), `the union must take effect immediately (got ${opened})`).toBe(true);

        // Archive stays shut: the union added operate, and operate is not archive.
        expect(await knock(subject.request, "archive"), "operate must not imply archive").toBe(403);

        const remove = await admin.request.delete(`/api/admin/users/${subjectId}/roles/${PERSONAS.processor.role}`, {
            failOnStatusCode: false,
        });
        expect(remove.status(), `removal failed: ${await remove.text()}`).toBeLessThan(400);

        const closed = await knock(subject.request, "operate:classification");
        record("portalOnly-after-removal", "operate:classification", closed);
        expect(closed, "removing the role must close the door again").toBe(403);

        await subject.close();
        await admin.close();
    });

    test("PHASE 6 — those grants are in the access history, attributed", async ({ browser }) => {
        const admin = await browser.newContext({ storageState: OPERATOR_STATE });
        const res = await admin.request.get(
            "/api/admin/access/history?subject=c0000000-0000-4000-8000-00000000d021&limit=25",
        );
        expect(res.status()).toBe(200);
        const body = (await res.json()) as { entries: { actorDisplay: string }[] };
        expect(body.entries.length, "the assignment and the removal must both be recorded").toBeGreaterThanOrEqual(2);
        for (const entry of body.entries.slice(0, 2)) {
            expect(entry.actorDisplay, "an access change must name who made it").toBeTruthy();
        }
        await admin.close();
    });

    /* ── PHASE 7 — scope ────────────────────────────────────────────────────────────────── */

    test("PHASE 7 — a Processing capability does not cross an organization boundary", async ({ browser }) => {
        const s = await signIn(browser, "cert.otherorg@adapter.invalid");
        expect(s.signedIn, "cert.otherorg could not sign in").toBe(true);
        for (const door of ["archive", "documents:delete"] as Door[]) {
            const status = await knock(s.request, door);
            record("otherorg", door, status);
            expect(status, `another organization's administrator must not act here (${door})`).toBeGreaterThanOrEqual(400);
        }
        await s.close();
    });

    /* ── PHASE 8 — the matrix, as evidence ──────────────────────────────────────────────── */

    test("PHASE 8 — the recorded matrix is complete and non-vacuous", async () => {
        const statuses = Object.values(MATRIX).flatMap((d) => Object.values(d));
        expect(statuses.some((s) => s === 403), "no refusal recorded — the gates are not gating").toBe(true);
        expect(statuses.some((s) => s !== 403), "no admission recorded — nothing can be done at all").toBe(true);
        for (const who of [...Object.keys(PERSONAS), "admin", "ops"]) {
            expect(MATRIX[who], `${who} is missing from the matrix`).toBeTruthy();
        }
    });
});
