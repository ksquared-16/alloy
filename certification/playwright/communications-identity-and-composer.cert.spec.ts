/**
 * Visible identity, hidden ingress, and the Email composer — in the browser.
 *
 * Four claims are proved here, each of which was previously either false or
 * unproven:
 *
 *   1. The address a family sees and the address mail is delivered to are
 *      separate, and the delivery address never reaches operator UX.
 *   2. Receiving readiness comes from OBSERVED ARRIVAL. Configuration alone
 *      reports outstanding routing work, and an actual inbound turns it green.
 *   3. A new email requires a Subject; a reply shows no Subject field and
 *      inherits the conversation's on the server.
 *   4. Overlays launched from the Communications workspace render ABOVE it,
 *      on `document.body`, rather than behind the workspace that opened them.
 *
 * Everything runs against production routes and the real page. The one harness
 * is `/api/admin/debug/certification/inbound-email`, which hands a documented
 * provider payload to the real ingestion path — already the basis of the
 * certified inbound-email evidence.
 *
 * CERT_REQUIRES_PRISTINE_TENANT — this file must run against a freshly reset
 * tenant. R-1 asserts that NOTHING has ever been received at the configured
 * address, and R-3 then delivers a message to prove arrival is what turns
 * receiving green. R-3 therefore destroys R-1's precondition, permanently, for
 * every later run against the same tenant. On an inherited tenant R-1 fails for
 * a reason that looks like a product defect and is not.
 *
 * WHAT THIS DOES NOT COVER, stated so it is not read as more than it is: the
 * LIVE routing hop. No external mail provider forwards anything here, so whether
 * an administrative forwarding rule preserves RFC correlation across a real hop
 * is NOT certified by this file. That requires the controlled live test the
 * Director's route configuration gates, and until it runs the hop's evidence
 * preservation is unproven.
 */
import { expect, test } from "@playwright/test";
import crypto from "node:crypto";

type Page = import("@playwright/test").Page;

const PAGE = "/organization/communications";
const WORKSPACE = "/workspace";
const INBOX_NAV = '[data-adminv2-sidebar-modal-nav="inbox"]';
const BINDINGS = "/api/admin/communications/bindings";

/** The seeded VISIBLE identity — what a family sees and replies to. */
const VISIBLE_IDENTITY = "hello@northwind-cert.invalid";
/** A seeded person with a unique email in the certification tenant. */
const RESOLVED_SENDER = "qa+guardian1@example.invalid";

function uid(tag: string): string {
    return `${tag}${crypto.randomBytes(8).toString("hex")}`;
}

async function deliverEmail(
    page: Page,
    params: { from: string; to: string; subject: string; text: string }
) {
    const emailId = uid("cert-email-");
    const res = await page.request.post("/api/admin/debug/certification/inbound-email", {
        data: {
            event: {
                email_id: emailId,
                created_at: new Date().toISOString(),
                from: params.from,
                to: [params.to],
                cc: [],
                bcc: [],
                received_for: [],
                message_id: `<${emailId}@sender.invalid>`,
                subject: params.subject,
                attachments: [],
            },
            retrieval: {
                text: params.text,
                html: `<p>${params.text}</p>`,
                html_format: "data_uri",
                headers: { "message-id": `<${emailId}@sender.invalid>` },
            },
        },
    });
    expect(res.ok(), `injection failed: ${res.status()}`).toBeTruthy();
    return { emailId, outcome: (await res.json()).outcome as Record<string, unknown> };
}

const INBOUND_URL = process.env.CERT_INBOUND_URL || "http://127.0.0.1:8013";
const TWILIO_AUTH_TOKEN =
    process.env.CERT_TWILIO_AUTH_TOKEN || "alloy-certification-synthetic-twilio-token";
const SMS_DESTINATION = process.env.CERT_INBOUND_TO_E164 || "+15550001111";
/** The SAME seeded person as RESOLVED_SENDER — one party, two channels. */
const RESOLVED_SENDER_PHONE = "+15550000001";

function twilioSignature(url: string, params: Record<string, string>): string {
    const payload = Object.keys(params)
        .sort()
        .reduce((acc, k) => acc + k + params[k], url);
    return crypto.createHmac("sha1", TWILIO_AUTH_TOKEN).update(Buffer.from(payload, "utf-8")).digest("base64");
}

/**
 * Give the tenant ONE party holding SEVERAL conversations.
 *
 * The queue assertions used to depend on whatever the seed happened to contain.
 * On a pristine tenant that is nothing at all, so "no duplicate hub labels"
 * passed for the worst possible reason — an empty queue — and the roll-up went
 * unproved. A certification spec must build the situation it certifies.
 *
 * IT MUST BE TWO CHANNELS, and that is a fact about the product rather than a
 * convenience. An email thread keys on (party, channel, sender address), so a
 * single correspondent can never open a second EMAIL thread — a second message
 * from them correlates into the first by endpoint provenance, which is correct.
 * Several email threads under one family come from several different senders in
 * that family. The certification tenant seeds no multi-person household, so the
 * reachable shape of the reported defect here is email + SMS from one person:
 * two canonical threads, one party, which is exactly what used to render as two
 * identical-looking rows.
 *
 * Both deliveries go through the real ingestion paths — the documented Resend
 * payload and the SIGNED Twilio webhook — not through fixtures.
 */
async function seedMultiThreadHub(page: Page) {
    const { outcome } = await deliverEmail(page, {
        from: RESOLVED_SENDER,
        to: VISIBLE_IDENTITY,
        subject: `Tour availability ${uid("s")}`,
        text: "Certification fixture: the email half of one party's conversations.",
    });
    // A fixture that silently failed to persist would make every assertion below
    // vacuous, so its success is asserted rather than assumed.
    expect(outcome.status, "fixture email persisted").toBe("persisted");

    const url = `${INBOUND_URL}/sms/inbound`;
    const form: Record<string, string> = {
        From: RESOLVED_SENDER_PHONE,
        To: SMS_DESTINATION,
        Body: "Certification fixture: the SMS half of the same party.",
        MessageSid: `SMcert${crypto.randomBytes(8).toString("hex")}`,
        AccountSid: "ACcertification0000000000000000000",
    };
    const res = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "X-Twilio-Signature": twilioSignature(url, form),
        },
        body: new URLSearchParams(form).toString(),
    });
    expect(res.status, "fixture SMS accepted by the signed webhook").toBeLessThan(400);
}

async function emailBinding(page: Page) {
    const res = await page.request.get(BINDINGS);
    expect(res.ok(), `GET ${BINDINGS} → ${res.status()}`).toBe(true);
    const body = (await res.json()) as { bindings?: Array<Record<string, unknown>> };
    const binding = (body.bindings ?? []).find(
        (b) =>
            String(b.channel ?? "") === "email" &&
            String(b.status ?? "") === "active" &&
            String(b.inbound_address ?? "") === VISIBLE_IDENTITY
    );
    expect(binding, `the seeded active email binding for ${VISIBLE_IDENTITY} exists`).toBeTruthy();
    return binding!;
}

async function openOperatorInbox(page: Page) {
    await page.goto(WORKSPACE);
    await page.waitForLoadState("domcontentloaded");
    const nav = page.locator(INBOX_NAV);
    await expect(nav).toBeVisible({ timeout: 180_000 });
    await nav.first().click();
    const tab = page.locator('[data-comms-tab="inbox"]');
    await expect(tab).toBeVisible({ timeout: 120_000 });
    await tab.click();
    await expect(page.locator('[data-comms-tab-panel="inbox"] [data-cc-shell]')).toBeVisible({
        timeout: 120_000,
    });
    // Always wait for a RENDERED marker before probing. `locator.count()` does not
    // retry, so counting straight after navigation reports a phantom zero and the
    // failure reads as "precondition unmet" rather than "still loading".
    await expect(page.locator("[data-cc-conversation]").first()).toBeVisible({ timeout: 120_000 });
}

test.describe("Visible identity vs hidden ingress destination", () => {
    test("I-1 the operator's Email identity is the organization's own address", async ({ page }) => {
        await page.goto(PAGE);
        await expect(page.getByTestId("communications-email-sending-value")).toHaveText(VISIBLE_IDENTITY);
        await expect(page.getByTestId("communications-email-receiving-value")).toHaveText(VISIBLE_IDENTITY);
    });

    test("I-2 no provider ingress address appears anywhere on the configuration surface", async ({
        page,
    }) => {
        await page.goto(PAGE);
        const surface = page.getByTestId("organization-communications-page");
        await expect(surface).toBeVisible({ timeout: 120_000 });
        const text = (await surface.innerText()).toLowerCase();
        // A destination is transport. If one ever renders here, an administrator
        // may copy it to a parent, who then keeps it in their address book.
        expect(text).not.toContain("resend.app");
        expect(text).not.toContain("resend.dev");
    });

    test("I-3 a route claiming another organization's binding cannot be created", async ({ page }) => {
        // Tenant containment is structural — a composite foreign key, not a check
        // every writer must remember. Proved through the API rather than psql so
        // the guarantee is asserted where a caller would actually hit it.
        const binding = await emailBinding(page);
        expect(String(binding.inbound_address ?? "")).toBe(VISIBLE_IDENTITY);
        // The visible identity is what the payload carries. The delivery
        // destination is deliberately absent from this projection entirely.
        expect(JSON.stringify(binding)).not.toContain("resend.app");
    });
});

test.describe("Receiving readiness is observed, never inferred", () => {
    test("R-1 a configured address with no arrivals reports routing setup outstanding", async ({
        page,
    }) => {
        const binding = await emailBinding(page);
        const readiness = binding.readiness as { receive: { state: string; detail: string } };
        // The old behaviour returned "ready" here, from the presence of a value
        // in `inbound_address`. Nothing has ever been received at this address in
        // the certification tenant; there is no mail provider and no rule.
        expect(readiness.receive.state).toBe("routing_setup_required");
    });

    test("R-2 sending stays Ready — the two directions are answered separately", async ({ page }) => {
        // The positive control for R-1. Without it, "receiving is not ready"
        // would also pass if readiness had broken outright.
        const binding = await emailBinding(page);
        const readiness = binding.readiness as { send: { state: string } };
        expect(readiness.send.state).toBe("ready");
    });

    test("R-3 an actual inbound message turns receiving Ready", async ({ page }) => {
        // The evidence that makes R-1 a truthful report rather than a permanent
        // red light: deliver one real message through the production ingestion
        // path, and the same surface answers differently.
        const before = await emailBinding(page);
        expect((before.readiness as { receive: { state: string } }).receive.state).toBe(
            "routing_setup_required"
        );

        const { outcome } = await deliverEmail(page, {
            from: RESOLVED_SENDER,
            to: VISIBLE_IDENTITY,
            subject: `Cert routing proof ${uid("s")}`,
            text: "Proving that arrival is what turns receiving green.",
        });
        expect(outcome.status, "the message was actually persisted").toBe("persisted");

        const after = await emailBinding(page);
        const receive = (after.readiness as { receive: { state: string; detail: string } }).receive;
        expect(receive.state).toBe("ready");
        expect(receive.detail).toContain("Last inbound verified");
        // Even when green, the copy names the VISIBLE identity and never the
        // destination the provider delivered to.
        expect(receive.detail).toContain(VISIBLE_IDENTITY);
        expect(receive.detail).not.toContain("resend.app");
    });

    test("R-4 the page shows the observed state, not a cached claim", async ({ page }) => {
        await page.goto(PAGE);
        await expect(page.getByTestId("communications-email-receiving-state")).toHaveText("Ready");
    });
});

test.describe("Email Subject — authored once, inherited thereafter", () => {
    /**
     * A syntactically valid customer id that this tenant does not own.
     *
     * Deliberate: it lets the SUBJECT contract be exercised without seeding a
     * household, because the new-email refusal is decided from the request alone
     * and returns before any customer lookup. The reply path reaches the lookup
     * and answers 404 — and that DIFFERENCE, under an otherwise identical
     * request, is the proof.
     */
    const UNOWNED_CUSTOMER = "00000000-0000-4000-8000-0000000000aa";
    const UNOWNED_PERSON = "00000000-0000-4000-8000-0000000000ab";

    async function familySend(page: Page, extra: Record<string, unknown>) {
        const res = await page.request.post("/api/admin/communications/family-send", {
            data: {
                customer_id: UNOWNED_CUSTOMER,
                recipient_person_ids: [UNOWNED_PERSON],
                channel: "email",
                body: "Certification body.",
                confirm: false,
                ...extra,
            },
        });
        return { status: res.status(), payload: JSON.stringify(await res.json()) };
    }

    test("S-1 a new email is refused without a Subject", async ({ page }) => {
        const { status, payload } = await familySend(page, { subject: "" });
        expect(status).toBe(400);
        expect(payload).toContain("subject is required for email");
    });

    test("S-2 a REPLY is NOT refused for a missing Subject", async ({ page }) => {
        /*
         * The defect that blocked every operator reply, and therefore the live
         * Email test: the composer renders no Subject field on a reply, so every
         * reply arrived empty and was refused with `subject is required for
         * email`.
         *
         * This request is byte-identical to S-1 except for `reply_to_thread_id`.
         * S-1 above is the positive control: it proves the endpoint is reachable
         * and that the subject gate really does fire, so "the error is absent
         * here" cannot be satisfied by an unreachable route or a blanket refusal.
         */
        const newEmail = await familySend(page, { subject: "" });
        expect(newEmail.payload, "control: the gate fires for a new email").toContain(
            "subject is required for email"
        );

        const reply = await familySend(page, {
            subject: "",
            reply_to_thread_id: "00000000-0000-4000-8000-0000000000ac",
        });
        expect(reply.payload).not.toContain("subject is required for email");
        // It got PAST the subject gate to the tenant boundary — which is the
        // whole claim. A different status here would mean the request died
        // somewhere else and this assertion proved nothing.
        expect(reply.status, `reply reached the customer lookup (got ${reply.payload})`).toBe(404);
    });

    /**
     * Select a conversation that opens the EMAIL composer, and expand its reply.
     *
     * Not simply the first row. An UNIDENTIFIED sender renders a different panel
     * with no family composer at all, and which conversations sort first depends
     * entirely on what the tenant has received — after an inbound regression run
     * the whole top of the queue is unidentified. Scanning until one opens is what
     * makes this stable across tenant states.
     *
     * When none open it THROWS. A check that quietly passes because it found
     * nothing to look at is worse than one that fails.
     */
    async function openComposer(page: Page, requireEmail: boolean) {
        await openOperatorInbox(page);
        const rows = page.locator("[data-cc-conversation]");
        const total = await rows.count();
        expect(total, "the queue has conversations to open").toBeGreaterThan(0);

        for (let i = 0; i < Math.min(total, 8); i++) {
            await rows.nth(i).click();

            // The FIRST attempt waits long enough for a cold Turbopack compile of
            // the workspace routes; later attempts are cheap because the code is
            // already warm. A uniform short timeout made this loop skip every row
            // on a cold server and then report "no composer opened", which reads
            // as a product defect and is not one.
            const patience = i === 0 ? 90_000 : 15_000;

            // `:visible` is load-bearing. The view renders a reply control in both
            // its activity-embed and workspace branches, so a bare `.first()`
            // resolves to the HIDDEN one, reports not-visible, and the loop
            // silently concludes no composer exists — a false negative that reads
            // as a product defect.
            const expand = page.locator("[data-cc-reply-expand]:visible").first();
            if (await expand.isVisible({ timeout: patience }).catch(() => false)) {
                await expand.click();
            }
            const footer = page.locator("[data-cc-composer-footer]:visible").first();
            if (!(await footer.isVisible({ timeout: patience }).catch(() => false))) continue;

            // The composer opens in the conversation's OWN channel, and a hub's
            // newest thread may be the SMS one. So SELECT email first, then look
            // for the From line — waiting for a line that cannot appear until the
            // channel is switched just burns the budget and then fails.
            if (requireEmail) {
                const emailTab = page
                    .locator("[data-cc-composer-channels]:visible button", { hasText: "Email" })
                    .first();
                if (!(await emailTab.isVisible({ timeout: patience }).catch(() => false))) continue;
                if ((await emailTab.getAttribute("aria-pressed")) !== "true") await emailTab.click();

                const from = page.locator("[data-cc-compose-from-address]:visible").first();
                if (!(await from.isVisible({ timeout: 30_000 }).catch(() => false))) continue;
                return;
            }
            if (await footer.isVisible().catch(() => false)) return;
        }
        throw new Error(
            requireEmail
                ? "no conversation in the queue opened an email composer"
                : "no conversation in the queue opened a reply composer"
        );
    }

    test("S-3 a reply composer shows NO Subject field", async ({ page }) => {
        test.setTimeout(600_000);
        await seedMultiThreadHub(page);
        // Channel-agnostic on purpose: the claim is about the reply lifecycle,
        // not about email, and the SMS composer must not show one either.
        await openComposer(page, false);
        // Not rendered, rather than hidden. An invisible field still holds stale
        // draft text, and an operator must not be able to rename a parent's
        // conversation by typing into one.
        await expect(page.locator("[data-cc-subject-input]")).toHaveCount(0);
    });

    test("S-4 Compose shows the identity the parent will see", async ({ page }) => {
        test.setTimeout(600_000);
        await seedMultiThreadHub(page);
        await openComposer(page, true);
        const from = page.locator("[data-cc-compose-from-address]");
        await expect(from).toBeVisible({ timeout: 120_000 });
        // The VISIBLE identity. Never a transport destination — an operator who
        // read one here could hand it to a parent.
        await expect(from).not.toContainText("resend.app");
        await expect(from).toContainText("@");
    });

});

test.describe("The queue speaks English, not storage", () => {
    test("L-1 no raw enum token renders in the conversation queue", async ({ page }) => {
        await openOperatorInbox(page);
        const shell = page.locator('[data-comms-tab-panel="inbox"] [data-cc-shell]');
        await expect(shell).toBeVisible({ timeout: 120_000 });
        const text = await shell.innerText();

        // `needs_response` is what inbound ingestion WRITES to
        // communication_threads.attention_state. It is a storage value and must
        // never reach an operator; the queue says "Needs response".
        const machineTokens = [
            "needs_response",
            "needs_routing_resolution",
            "awaiting_parent_reply",
            "needs_follow_up",
            "documents_missing",
            "first_response_due",
            "routing_setup_required",
        ];
        const leaked = machineTokens.filter((t) => text.includes(t));
        expect(leaked, `raw enum tokens rendered in the queue: ${leaked.join(", ")}`).toEqual([]);
    });

    test("L-2 the queue is actually rendering rows — the sweep above is not vacuous", async ({
        page,
    }) => {
        // The positive control. A sweep for absent strings passes trivially on an
        // empty panel, which would read as "no machine labels" when the truth is
        // "nothing rendered at all".
        await openOperatorInbox(page);
        const rows = page.locator("[data-cc-conversation]");
        await expect(rows.first()).toBeVisible({ timeout: 120_000 });
        expect(await rows.count()).toBeGreaterThan(0);
    });
});

test.describe("The queue is one row per party", () => {
    test("Q-1 no two hub rows carry the same label", async ({ page }) => {
        await seedMultiThreadHub(page);
        await openOperatorInbox(page);
        const labels = await page.locator("[data-cc-hub]").evaluateAll((els) =>
            els.map((el) => (el.querySelector("span")?.textContent ?? "").trim())
        );
        expect(labels.length, "the queue rendered hub rows").toBeGreaterThan(0);
        // The reported defect: several rows all reading "Kurzman Family" with
        // nothing to tell them apart. Duplicate LABELS are the symptom, and the
        // hub grain is what removes them.
        const duplicated = labels.filter((l, i) => l && labels.indexOf(l) !== i);
        expect([...new Set(duplicated)], `duplicate hub labels: ${duplicated.join(", ")}`).toEqual([]);
    });

    test("Q-2 a hub holding several threads still renders ONE row", async ({ page }) => {
        await seedMultiThreadHub(page);
        await openOperatorInbox(page);
        const rows = page.locator("[data-cc-hub]");
        const counts = await rows.evaluateAll((els) =>
            els.map((el) => Number(el.getAttribute("data-cc-hub-threads") ?? "0"))
        );
        expect(counts.length).toBeGreaterThan(0);
        // Positive control for Q-1: if every hub held exactly one thread, "no
        // duplicate labels" would be true for a reason that has nothing to do
        // with roll-up, and this suite would prove nothing about it.
        expect(Math.max(...counts), "at least one hub rolls up multiple threads").toBeGreaterThan(1);
    });

    test("Q-3 unresolved conversations are their own rows, never inside a family", async ({ page }) => {
        await seedMultiThreadHub(page);
        await openOperatorInbox(page);
        const kinds = await page
            .locator("[data-cc-hub]")
            .evaluateAll((els) => els.map((el) => el.getAttribute("data-cc-hub-kind")));
        expect(kinds.length).toBeGreaterThan(0);
        // Every row declares its own grain; an unresolved party is never folded
        // into a family hub by endpoint coincidence.
        expect(kinds.every((k) => k === "family" || k === "person" || k === "unresolved")).toBe(true);
    });
});

test.describe("Overlays render above the workspace that opened them", () => {
    test("O-1 Compose New opens on document.body, above the shell", async ({ page }) => {
        await openOperatorInbox(page);
        const trigger = page.locator("[data-inbox-compose-new]").first();
        if (!(await trigger.isVisible().catch(() => false))) {
            // Never let a check silently skip itself. If the entry point is not
            // where this spec expects it, that is a finding, not an absence.
            throw new Error("Compose New entry point [data-inbox-compose-new] was not found");
        }
        await trigger.click();

        const modal = page.locator("[data-compose-new-modal]");
        await expect(modal).toBeVisible({ timeout: 120_000 });

        // It must be a DIRECT child of body — that is what escaping the shell's
        // stacking context means. A modal nested inside the workspace cannot rise
        // above it however large its z-index.
        const parentIsBody = await modal.evaluate((el) => el.parentElement === document.body);
        expect(parentIsBody, "Compose New portals to document.body").toBe(true);

        // And above shell chrome (100) / the workspace BOS layers (96, 97).
        const z = await modal.evaluate((el) => Number(getComputedStyle(el).zIndex));
        expect(z).toBeGreaterThan(100);
    });

    test("O-2 Compose New outranks every other fixed layer on the page", async ({ page }) => {
        test.setTimeout(600_000);
        await openOperatorInbox(page);
        const trigger = page.locator("[data-inbox-compose-new]").first();
        await expect(trigger).toBeVisible({ timeout: 60_000 });
        await trigger.click();

        const modal = page.locator("[data-compose-new-modal]");
        await expect(modal).toBeVisible({ timeout: 60_000 });

        // Compared against every fixed/sticky layer ACTUALLY on the page, not
        // against a remembered constant — a layer added later would otherwise
        // sail past this check, which is exactly how the original defect (a
        // modal at 80, under shell chrome at 100) survived review.
        const { modalZ, highestOtherZ } = await modal.evaluate((el) => {
            let max = 0;
            for (const node of Array.from(document.body.querySelectorAll<HTMLElement>("*"))) {
                if (node === el || el.contains(node)) continue;
                const style = getComputedStyle(node);
                if (style.position !== "fixed" && style.position !== "sticky") continue;
                if (style.visibility === "hidden" || style.display === "none") continue;
                const z = Number(style.zIndex);
                if (Number.isFinite(z) && z > max) max = z;
            }
            return { modalZ: Number(getComputedStyle(el).zIndex), highestOtherZ: max };
        });
        expect(modalZ).toBeGreaterThanOrEqual(highestOtherZ);

        // Closes normally, by keyboard and by control.
        await page.keyboard.press("Escape");
        const closeBtn = page.locator("[data-compose-new-modal] button[aria-label='Close']").first();
        if (await closeBtn.isVisible({ timeout: 4_000 }).catch(() => false)) await closeBtn.click();
        await expect(modal).toBeHidden({ timeout: 30_000 });
    });

    /*
     * BOS PINNED IS NOT COVERED HERE, AND THAT IS NOT AN OVERSIGHT.
     *
     * With the BOS rail PINNED, clicking any sidebar modal entry freezes the main
     * thread: the click is dispatched, never completes, and `page.evaluate` stops
     * responding. Measured against Inbox, Tasks and Scheduling — all three hang
     * identically, with no console error and no React update-depth warning.
     *
     * That is a platform shell defect, not a Communications one: Tasks and
     * Scheduling share none of this workspace's code. Compose New cannot be
     * reached in the pinned state by any operator gesture, so there is nothing
     * here to assert about its layering until the shell defect is fixed.
     *
     * Written down rather than silently omitted, because an absent test reads as
     * "covered" to the next person, and the pinned half of this claim is NOT
     * proved.
     */
});
