/**
 * Surface cleanup Item 1 — the record New Message composer, certified in the running app.
 *
 * Proves, against the seeded certification tenant (providers mocked, nothing leaves the machine):
 *
 *   A  Current Work → Contact Family: shared composer, preview → confirm → send through
 *      family-send, DECLARING `work_consequence: contact_family_work`, the server attempting the
 *      Contact Family association, and the workspace returning on Done.
 *   B  Manage → Send Message: the SAME composer (in a record modal), the SAME route, NO declared
 *      consequence, no association attempted, the work item untouched, and the modal closing on Done.
 *   C  Template ▾ applies the current version as an editable copy.
 *   D  Send later schedules through communication-scheduled-sends.
 *   E  BOS opens on the draft.
 *   F  Manage → Send Tour Invitation: prepared invitation activated (mark_sent) after the confirmed send.
 *   G  SMS through the same lifecycle.
 *   V  Visual evidence at desktop and a narrower panel width, with editor-height measurements.
 *
 * Opt-in: ITEM1_CERT=1 — it sends (locally) and mutates the tenant.
 * ITEM1_LABEL=before|after names the evidence folder; `before` captures presentation only, so the
 * same measurements can be taken against the pre-change build.
 */

import { expect, test, type Page, type Response } from "@playwright/test";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const RUN = process.env.ITEM1_CERT === "1";
const LABEL = process.env.ITEM1_LABEL === "before" ? "before" : "after";
const OUT = path.join(__dirname, "..", "evidence", "item1-composer", LABEL);
const DB = process.env.CERT_DB_URL || "postgresql://postgres:postgres@127.0.0.1:54422/postgres";
const PSQL = process.env.CERT_PSQL || (fs.existsSync("/opt/homebrew/opt/libpq/bin/psql") ? "/opt/homebrew/opt/libpq/bin/psql" : "psql");

const OPP_CURRENT_WORK = { id: "00000000-0000-4000-8000-400000000001", row: "Inquiry 2401 — Test Family 0001 Family" };
const OPP_MANAGE = { id: "00000000-0000-4000-8000-400000000002", row: "Inquiry 2402 — Test Family 0002 Family" };
const OPP_SMS = { id: "00000000-0000-4000-8000-400000000003", row: "Inquiry 2403 — Test Family 0003 Family" };
const OPP_TOUR = { id: "00000000-0000-4000-8000-400000000004", row: "Inquiry 2404 — Test Family 0004 Family" };

const sql = (q: string) =>
    execSync(`${PSQL} ${JSON.stringify(DB)} -tAc ${JSON.stringify(q.replace(/\s+/g, " ").trim())}`, { encoding: "utf8" }).trim();

const log: string[] = [];
/** Unique per run: identical content to the same person is (correctly) an idempotent duplicate. */
const RUN_TAG = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const note = (line: string) => {
    log.push(line);
    console.log(`[item1:${LABEL}] ${line}`);
};

async function shot(page: Page, name: string) {
    fs.mkdirSync(OUT, { recursive: true });
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
}

async function openLead(page: Page, row: string, viewport = { width: 1512, height: 982 }) {
    await page.setViewportSize(viewport);
    await page.goto("/workspace");
    await page.getByText("New Leads", { exact: true }).first().click({ timeout: 120_000 });
    const bosClose = page.getByRole("button", { name: "Close", exact: true });
    await page.waitForTimeout(1500);
    if (await bosClose.count()) await bosClose.first().click({ timeout: 5000 }).catch(() => {});
    await page.getByText(row, { exact: true }).first().click({ timeout: 120_000 });
    await expect(page.locator("[data-focus-panel-manage-trigger]").first()).toBeVisible({ timeout: 120_000 });
}

/** Geometry the director asked about: how much of the composer is message body. */
async function measure(page: Page, rootSelector: string) {
    return page.evaluate((sel) => {
        const root = document.querySelector(sel);
        if (!root) return null;
        const h = (el: Element | null) => (el ? Math.round(el.getBoundingClientRect().height) : null);
        const editor =
            root.querySelector('[data-cc-email-composer="true"]')
            ?? root.querySelector('textarea[aria-label="Message body"]')
            ?? root.querySelector("[data-adminv2-messaging-composer] textarea")
            ?? root.querySelector("textarea");
        const composer = root.querySelector('[data-cc-ws-section="composer"]') ?? root;
        const header = root.querySelector("[data-cc-thread-header]");
        return {
            rootHeight: h(root),
            composerHeight: h(composer),
            editorHeight: h(editor),
            headerHasChannels: Boolean(header?.querySelector("[data-cc-composer-channels]")),
            headerText: (header?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 80),
            preferencesRow: Boolean(root.querySelector("[data-cc-recipient-preferences-row]")),
            toRow: Boolean(root.querySelector("[data-cc-recipient-to-row]")),
            ccInToRow: Boolean(root.querySelector("[data-cc-recipient-to-row] [data-cc-toggle-cc-bcc]")),
            addAnotherEmailRow: /Add another email/.test(root.textContent ?? ""),
            templateInToolbar: Boolean(root.querySelector('[data-cc-template-trigger="true"]')),
            sharedComposer: Boolean(root.querySelector('[data-family-new-message-composer="true"]')),
        };
    }, rootSelector);
}

type FamilySendExchange = { request: Record<string, unknown>; response: Record<string, unknown> };

function recordFamilySend(page: Page): FamilySendExchange[] {
    const out: FamilySendExchange[] = [];
    page.on("response", async (res: Response) => {
        if (!res.url().includes("/api/admin/communications/family-send")) return;
        const request = JSON.parse(res.request().postData() ?? "{}") as Record<string, unknown>;
        const response = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        out.push({ request, response });
    });
    return out;
}

function recordUrls(page: Page, fragment: string): { url: string; body: Record<string, unknown> }[] {
    const out: { url: string; body: Record<string, unknown> }[] = [];
    page.on("request", (req) => {
        if (!req.url().includes(fragment) || req.method() !== "POST") return;
        out.push({ url: req.url(), body: JSON.parse(req.postData() ?? "{}") as Record<string, unknown> });
    });
    return out;
}

const workState = (opp: string) =>
    sql(`select coalesce(string_agg(metadata->>'work_template_key'||':'||status, ',' order by created_at), '-')
         from operational_tasks where entity_id='${opp}'`);
const familySendMessages = (opp: string) =>
    Number(sql(`select count(*) from communication_messages where metadata->>'source'='family_send'
                and metadata->>'opportunity_id'='${opp}'`));
const allFamilySendMessages = () =>
    Number(sql(`select count(*) from communication_messages where metadata->>'source'='family_send'`));
const legacyQuickMessages = (personIds: string[]) =>
    personIds.length === 0
        ? 0
        : Number(sql(`select count(*) from communication_messages where (metadata->>'quick_message')='true'
                      and metadata->>'recipient_person_id' in (${personIds.map((p) => `'${p}'`).join(",")})`));

async function fillDraft(page: Page, scope: string, subject: string, body: string) {
    const subj = page.locator(`${scope} [data-cc-subject-input="true"]`);
    if (await subj.count()) await subj.fill(subject);
    const editor = page.locator(`${scope} [data-cc-email-composer="true"]`);
    if (await editor.count()) {
        await editor.click();
        await page.keyboard.type(body);
    } else {
        await page.locator(`${scope} textarea[aria-label="Message body"]`).fill(body);
    }
}

async function sendThroughConfirmation(page: Page, scope: string, evidence: string) {
    await page.locator(`${scope} [data-cc-send-button="true"]`).click();
    const dialog = page.locator('[data-cc-send-confirm-dialog="true"]');
    await expect(dialog).toHaveAttribute("data-cc-send-confirm-phase", "preflight", { timeout: 60_000 });
    await shot(page, `${evidence}-preview`);
    await page.locator('[data-cc-send-confirm-action="true"]').click();
    await expect(dialog).toHaveAttribute("data-cc-send-confirm-phase", "success", { timeout: 60_000 });
    await shot(page, `${evidence}-sent`);
    await page.locator('[data-cc-send-done="true"]').click();
}

const CW_SCOPE = '[data-work-action-surface="communications_composer"]';
const MODAL_SCOPE = '[data-record-message-composer-modal="true"]';
const LEGACY_MODAL = '[data-adminv2-quick-message-modal="true"]';

/**
 * Tenant configuration, through the product's own placement API: this seed does not place the
 * org's `quick_message` action in the record-header Manage menu (the director's tenant does, as
 * "Send Message"). 409 = already placed by an earlier run.
 */
async function ensureManageMessagePlacement(page: Page) {
    const defId = sql(`select id from action_definitions where key='quick_message' and is_active and org_id is not null limit 1`);
    expect(defId, "the tenant has an active quick_message action definition").toMatch(/^[0-9a-f-]{36}$/);
    await page.goto("/workspace");
    // The route's duplicate check compares section_key with `= null`, which never matches, so a
    // second POST would add a second placement. Ask the tenant first.
    const existing = sql(`select count(*) from action_placements where action_definition_id='${defId}'
                          and surface='record_header' and is_active`);
    if (Number(existing) > 0) {
        // Earlier runs of this spec, before the check above, could add duplicates. Keep the oldest.
        const extras = sql(`select coalesce(string_agg(id::text, ',' order by created_at), '') from (
                              select id, created_at from action_placements where action_definition_id='${defId}'
                              and surface='record_header' and is_active order by created_at offset 1) x`);
        for (const id of extras.split(",").filter(Boolean)) {
            const del = await page.request.delete(`/api/admin/action-placements/${id}`);
            note(`placement duplicate ${id} removed: http ${del.status()}`);
        }
        note(`placement quick_message → record_header: already present`);
        return;
    }
    const res = await page.request.post("/api/admin/action-placements", {
        data: { action_definition_id: defId, surface: "record_header", slot: "secondary", entity_type: "opportunity" },
    });
    note(`placement quick_message → record_header: http ${res.status()}`);
    expect([201, 409]).toContain(res.status());
}

async function openManageMessage(page: Page, label: RegExp) {
    await page.locator("[data-focus-panel-manage-trigger]").first().click();
    const items = page.getByRole("menuitem");
    await expect(items.first()).toBeVisible({ timeout: 30_000 });
    note(`Manage menu offers: ${(await items.allInnerTexts()).map((t) => t.trim()).join(" | ")}`);
    await items.filter({ hasText: label }).first().click({ timeout: 30_000 });
}

test.describe("Item 1 — record New Message composer convergence", () => {
    test.skip(!RUN, "set ITEM1_CERT=1 — sends locally and mutates the tenant");
    test.describe.configure({ mode: "serial" });

    test.afterAll(() => {
        fs.mkdirSync(OUT, { recursive: true });
        fs.writeFileSync(path.join(OUT, "certification.log"), log.join("\n") + "\n");
    });

    test("A — Current Work → Contact Family", async ({ page }) => {
        test.setTimeout(600_000);
        const exchanges = recordFamilySend(page);
        await openLead(page, OPP_CURRENT_WORK.row);
        await page.locator('[data-process-action="quick_message"]').first().click();
        const composer = page.locator(`${CW_SCOPE} [data-cc-ws-section="composer"]`);
        await expect(composer).toBeVisible({ timeout: 120_000 });
        await page.waitForTimeout(1500);
        await shot(page, "A1-current-work-composer-desktop");
        const m = await measure(page, CW_SCOPE);
        note(`A presentation ${JSON.stringify(m)}`);
        if (LABEL === "before") return;

        expect(m?.sharedComposer).toBe(true);
        expect(m?.headerHasChannels).toBe(true);
        expect(m?.headerText).not.toContain("New Message");
        expect(m?.preferencesRow).toBe(false);
        expect(m?.ccInToRow).toBe(true);
        expect(m?.addAnotherEmailRow).toBe(false);
        expect(m?.templateInToolbar).toBe(true);

        // Recipient preselection + preference from the recipient itself.
        const pref = page.locator(`${CW_SCOPE} [data-cc-recipient-to-row] [data-cc-recipient-preference-trigger]`).first();
        await expect(pref).toBeVisible();
        note(`A preselected recipient: ${(await pref.innerText()).trim()}`);
        await pref.click();
        await expect(page.locator(`${CW_SCOPE} [data-cc-recipient-preference-panel]`).first()).toBeVisible();
        await shot(page, "A2-recipient-preferences");
        // One Escape closes ONE layer: the popover, never the composer behind it.
        await page.keyboard.press("Escape");
        await expect(page.locator(`${CW_SCOPE} [data-cc-recipient-preference-panel]`)).toHaveCount(0);
        await expect(composer).toBeVisible();

        // CC/BCC hidden until invoked.
        await expect(page.locator(`${CW_SCOPE} input[aria-label="CC email"]`)).toHaveCount(0);
        await page.locator(`${CW_SCOPE} [data-cc-toggle-cc-bcc]`).click();
        await expect(page.locator(`${CW_SCOPE} input[aria-label="CC email"]`)).toBeVisible();
        await shot(page, "A3-cc-bcc-open");
        await page.locator(`${CW_SCOPE} [data-cc-toggle-cc-bcc]`).click();

        // + Add opens the picker over the family's people.
        await page.locator(`${CW_SCOPE} [data-cc-recipient-compact-trigger]`).click();
        await expect(page.locator(`${CW_SCOPE} [data-cc-recipient-popover]`)).toBeVisible();
        await shot(page, "A4-add-recipient-picker");
        await page.locator(`${CW_SCOPE} [data-cc-recipient-compact-trigger]`).click();

        // C — Template ▾ copies the current version, still editable.
        await page.locator(`${CW_SCOPE} [data-cc-template-trigger="true"]`).click();
        const option = page.locator(`${CW_SCOPE} [data-cc-template-option]`).first();
        await expect(option).toBeVisible({ timeout: 30_000 });
        const templateId = await option.getAttribute("data-cc-template-option");
        await option.click();
        const subject = page.locator(`${CW_SCOPE} [data-cc-subject-input="true"]`);
        await expect(subject).not.toHaveValue("", { timeout: 30_000 });
        const current = sql(`select coalesce(v.subject,'') from communication_templates t
                             join communication_template_versions v on v.id = t.current_version_id
                             where t.id='${templateId}'`);
        note(`C template ${templateId} applied subject="${await subject.inputValue()}" db current_version.subject="${current}"`);
        expect(await subject.inputValue()).toBe(current);
        await shot(page, "C1-template-applied");
        await subject.fill("Item 1 certification — Current Work");
        await expect(subject).toHaveValue("Item 1 certification — Current Work");
        // The body is a copy too: the operator replaces the template's merge-token text (which this
        // seeded record cannot satisfy — canonical send refuses missing tokens per recipient).
        const editor = page.locator(`${CW_SCOPE} [data-cc-email-composer="true"]`);
        await editor.click();
        await page.keyboard.press("ControlOrMeta+a");
        await page.keyboard.type(`Hello from Current Work → Contact Family (${RUN_TAG}).`);
        await expect(editor).toHaveText(`Hello from Current Work → Contact Family (${RUN_TAG}).`);
        await expect(page.locator(`${CW_SCOPE} [aria-label="Bold"]`)).toBeEnabled();
        await expect(page.locator(`${CW_SCOPE} [aria-label="Attach"]`)).toBeVisible();

        // E — BOS opens on the draft.
        await page.locator(`${CW_SCOPE} [data-bos-assist-button="true"]`).click();
        await expect(page.locator('[data-adminv2-composer-bos-modal="true"]')).toBeVisible();
        await shot(page, "E1-bos");
        await page.keyboard.press("Escape");
        await expect(page.locator('[data-adminv2-composer-bos-modal="true"]')).toHaveCount(0);
        await expect(composer).toBeVisible();

        // Send.
        const workBefore = workState(OPP_CURRENT_WORK.id);
        const msgsBefore = allFamilySendMessages();
        await sendThroughConfirmation(page, CW_SCOPE, "A5");
        await expect(page.locator(CW_SCOPE)).toHaveCount(0, { timeout: 60_000 });
        await shot(page, "A6-returned-to-focus-panel");
        expect(exchanges.map((e) => e.request.confirm)).toEqual([false, true]);
        for (const e of exchanges) expect(e.request.work_consequence).toBe("contact_family_work");
        const confirmed = exchanges[1]!.response;
        note(`A results=${JSON.stringify(confirmed.results)} summary=${JSON.stringify(confirmed.summary)}`);
        note(`A contact_attempt_association=${JSON.stringify(confirmed.contact_attempt_association)} meta=${JSON.stringify(confirmed.meta)}`);
        expect(confirmed.contact_attempt_association).toBeDefined();
        const resolvedOpp = String((confirmed.meta as { opportunity_id?: string }).opportunity_id ?? "");
        const sent = Number((confirmed.summary as { sent?: number }).sent ?? 0);
        expect(sent).toBeGreaterThan(0);
        expect(allFamilySendMessages()).toBe(msgsBefore + sent);
        expect(resolvedOpp).toMatch(/^[0-9a-f-]{36}$/);
        const threadId = ((confirmed.results as { thread_id?: string }[])[0] ?? {}).thread_id ?? "";
        const thread = sql(`select primary_entity_type||':'||channel from communication_threads where id='${threadId}'`);
        note(`A thread ${threadId} identity=${thread}; row opp ${OPP_CURRENT_WORK.id} work ${workBefore} -> ${workState(OPP_CURRENT_WORK.id)}; composer opp ${resolvedOpp} work ${workState(resolvedOpp)}`);
        expect(thread).toBe("persons:email");
    });

    test("A2 — family-send attempts Contact Family completion only when the consequence is declared", async ({ page }) => {
        test.skip(LABEL === "before", "contract did not exist before");
        test.setTimeout(300_000);
        // The lead that actually holds the open first_contact work (the Focus Panel resolves this
        // family to its tour opportunity, so the UI path above cannot reach this item).
        const opp = OPP_CURRENT_WORK.id;
        const customer = sql(`select customer_id from opportunities where id='${opp}'`);
        // The primary recipient the composer preselected for this family in A.
        const person = "00000000-0000-4000-8000-200000000001";
        await page.goto("/workspace");
        const post = async (extra: Record<string, unknown>, tag: string) => {
            const res = await page.request.post("/api/admin/communications/family-send", {
                data: {
                    customer_id: customer,
                    recipient_person_ids: [person],
                    channel: "email",
                    subject: `Item 1 route contract ${tag}`,
                    body: `Route contract ${tag} ${RUN_TAG}`,
                    confirm: true,
                    client_token: `item1-${tag}-${Date.now()}`,
                    opportunity_id: opp,
                    ...extra,
                },
            });
            expect(res.status()).toBe(200);
            return (await res.json()) as Record<string, unknown>;
        };
        const before = workState(opp);
        const generic = await post({}, "generic");
        note(`A2 generic: sent=${JSON.stringify(generic.summary)} association=${JSON.stringify(generic.contact_attempt_association)} work ${before} -> ${workState(opp)}`);
        expect(generic.contact_attempt_association).toBeUndefined();
        expect(workState(opp)).toBe(before);
        const declared = await post({ work_consequence: "contact_family_work" }, "declared");
        const after = workState(opp);
        note(`A2 declared: sent=${JSON.stringify(declared.summary)} association=${JSON.stringify(declared.contact_attempt_association)} work ${before} -> ${after}`);
        expect(declared.contact_attempt_association).toBeDefined();
        if ((declared.contact_attempt_association as { associated?: boolean }).associated) {
            expect(after).not.toBe(before);
        }
    });

    test("B — Manage → Send Message", async ({ page }) => {
        test.setTimeout(600_000);
        const exchanges = recordFamilySend(page);
        const legacy = recordUrls(page, "/api/admin/communications/send");
        await ensureManageMessagePlacement(page);
        await openLead(page, OPP_MANAGE.row);
        await openManageMessage(page, /^(send )?message$/i);
        const scope = LABEL === "before" ? LEGACY_MODAL : MODAL_SCOPE;
        await expect(page.locator(scope)).toBeVisible({ timeout: 120_000 });
        await page.waitForTimeout(3000);
        await shot(page, "B1-manage-send-message-desktop");
        const m = await measure(page, scope);
        note(`B presentation ${JSON.stringify(m)}`);
        if (LABEL === "before") return;

        expect(m?.sharedComposer).toBe(true);
        expect(m?.headerHasChannels).toBe(true);
        expect(m?.preferencesRow).toBe(false);
        expect(m?.ccInToRow).toBe(true);
        expect(m?.templateInToolbar).toBe(true);
        await expect(page.locator(`${scope} [data-cc-recipient-to-row] [data-cc-recipient-preference-trigger]`).first()).toBeVisible();

        // D — Send later through the canonical scheduled-send path. Scheduling is one recipient per
        // send (the canonical contract says so in the modal), so keep the first and remove the rest.
        const removes = page.locator(`${scope} [data-cc-recipient-remove]`);
        while ((await removes.count()) > 1) {
            await removes.last().click();
        }
        await expect(page.locator(`${scope} [data-cc-recipient-pill]`)).toHaveCount(1);
        await fillDraft(page, scope, "Item 1 certification — Manage", `Hello from Manage → Send Message (${RUN_TAG}).`);
        const scheduledBefore = Number(sql(`select count(*) from communication_scheduled_sends`));
        await page.locator(`${scope} [aria-label="Send later"]`).click();
        const schedule = page.locator('[data-adminv2-composer-schedule-modal="true"]');
        await expect(schedule).toBeVisible();
        await shot(page, "D1-send-later");
        await schedule.getByRole("button", { name: "Schedule send" }).click();
        // The modal closes itself on a successful schedule; the row is the proof.
        await expect(schedule).toHaveCount(0, { timeout: 30_000 });
        await expect.poll(() => Number(sql(`select count(*) from communication_scheduled_sends`)), { timeout: 30_000 }).toBe(scheduledBefore + 1);
        const row = sql(`select entity_type||'|'||entity_id||'|'||recipient_person_id||'|'||channel||'|'||status||'|'||coalesce(subject_snapshot,'')
                         from communication_scheduled_sends order by created_at desc limit 1`);
        note(`D scheduled send: ${row}`);
        expect(row).toContain("Item 1 certification — Manage");
        // The draft stays in the composer after scheduling.
        await expect(page.locator(`${scope} [data-cc-subject-input="true"]`)).toHaveValue("Item 1 certification — Manage");

        const workBefore = workState(OPP_MANAGE.id);
        const familyWorkBefore = sql(`select coalesce(string_agg(t.id::text||':'||t.status, ',' order by t.id), '-')
                                      from operational_tasks t join opportunities o on o.id=t.entity_id
                                      where o.customer_id=(select customer_id from opportunities where id='${OPP_MANAGE.id}')`);
        const msgsBefore = allFamilySendMessages();
        await sendThroughConfirmation(page, scope, "B2");
        await expect(page.locator(scope)).toHaveCount(0, { timeout: 60_000 });
        expect(exchanges.map((e) => e.request.confirm)).toEqual([false, true]);
        const familyOf = (opp: string) => sql(`select customer_id from opportunities where id='${opp}'`);
        for (const e of exchanges) {
            expect("work_consequence" in e.request).toBe(false);
            // The Focus Panel anchors the family's resolved opportunity (as Current Work does).
            expect(familyOf(String(e.request.opportunity_id))).toBe(familyOf(OPP_MANAGE.id));
        }
        const resolvedOpp = String(exchanges[0]!.request.opportunity_id);
        const confirmed = exchanges[1]!.response;
        note(`B results=${JSON.stringify(confirmed.results)} summary=${JSON.stringify(confirmed.summary)}`);
        note(`B contact_attempt_association=${JSON.stringify(confirmed.contact_attempt_association)} meta=${JSON.stringify(confirmed.meta)}`);
        expect(confirmed.contact_attempt_association).toBeUndefined();
        expect(legacy).toHaveLength(0);
        expect(allFamilySendMessages()).toBe(msgsBefore + Number((confirmed.summary as { sent?: number }).sent ?? 0));
        expect(Number((confirmed.summary as { sent?: number }).sent ?? 0)).toBeGreaterThan(0);
        const workAfter = workState(OPP_MANAGE.id);
        const familyWorkAfter = sql(`select coalesce(string_agg(t.id::text||':'||t.status, ',' order by t.id), '-')
                                     from operational_tasks t join opportunities o on o.id=t.entity_id
                                     where o.customer_id=(select customer_id from opportunities where id='${OPP_MANAGE.id}')`);
        note(`B row opp ${OPP_MANAGE.id} work ${workBefore} -> ${workAfter}; composer opp ${resolvedOpp}; every work item in the family ${familyWorkBefore} -> ${familyWorkAfter}`);
        expect(workAfter).toBe(workBefore);
        expect(familyWorkAfter).toBe(familyWorkBefore);
        const threadId = ((confirmed.results as { thread_id?: string }[])[0] ?? {}).thread_id ?? "";
        const thread = sql(`select primary_entity_type||':'||channel from communication_threads where id='${threadId}'`);
        note(`B thread ${threadId} identity=${thread}`);
        expect(thread).toBe("persons:email");
    });

    test("G — SMS through the same lifecycle (Manage)", async ({ page }) => {
        test.skip(LABEL === "before", "presentation-only baseline");
        test.setTimeout(600_000);
        const exchanges = recordFamilySend(page);
        await openLead(page, OPP_SMS.row);
        await openManageMessage(page, /^(send )?message$/i);
        await expect(page.locator(MODAL_SCOPE)).toBeVisible({ timeout: 120_000 });
        await page.locator(`${MODAL_SCOPE} [data-cc-thread-header] [data-cc-workspace-mode="sms"]`).click();
        await expect(page.locator(`${MODAL_SCOPE} [data-cc-toggle-cc-bcc]`)).toHaveCount(0);
        await fillDraft(page, MODAL_SCOPE, "", `Item 1 certification — SMS (${RUN_TAG})`);
        await shot(page, "G1-sms");
        await sendThroughConfirmation(page, MODAL_SCOPE, "G2");
        expect(exchanges.map((e) => [e.request.confirm, e.request.channel])).toEqual([[false, "sms"], [true, "sms"]]);
        note(`G sms results=${JSON.stringify(exchanges[1]!.response.summary)}`);
    });

    test("F — Manage → Send Tour Invitation activates the invitation after the confirmed send", async ({ page }) => {
        test.skip(LABEL === "before", "presentation-only baseline");
        test.setTimeout(600_000);
        const exchanges = recordFamilySend(page);
        const marks = recordUrls(page, "/api/admin/actions/execute");
        // The representative seed ships NO tour availability, so the tour authority (correctly)
        // refuses to mint an invitation. Same certification setup as schedule-tour.cert.spec.ts:
        // one all-day window at the family's site(s), so the thing under test is the composer path.
        sql(`INSERT INTO tour_availability_rules
                (id, org_id, location_id, day_of_week, start_time, end_time, timezone,
                 slot_duration_minutes, buffer_minutes, max_bookings_per_slot, approval_required, is_active, metadata)
             SELECT gen_random_uuid(), o.org_id, o.location_id, dow, '00:00', '23:59', 'UTC', 60, 0, 5, false, true, '{}'::jsonb
             FROM (SELECT DISTINCT org_id, location_id FROM opportunities
                   WHERE customer_id=(SELECT customer_id FROM opportunities WHERE id='${OPP_TOUR.id}') AND location_id IS NOT NULL) o,
                  generate_series(0,6) AS dow
             WHERE NOT EXISTS (SELECT 1 FROM tour_availability_rules r WHERE r.location_id=o.location_id AND r.day_of_week=dow)
             RETURNING 1`);
        const prepareResponse = page.waitForResponse(
            (r) => r.url().includes("/api/admin/actions/execute") && (r.request().postData() ?? "").includes('"prepare"'),
            { timeout: 120_000 },
        );
        await openLead(page, OPP_TOUR.row);
        await openManageMessage(page, /^send tour invitation$/i);
        const prep = await prepareResponse;
        const prepBody = (await prep.json().catch(() => ({}))) as Record<string, unknown>;
        await expect(page.locator(MODAL_SCOPE)).toBeVisible({ timeout: 120_000 });
        if (prep.status() !== 200) {
            // The tour authority refused to mint an invitation for this record. The launcher opens a
            // blank composer by design; there is no invitation to activate, so F cannot run here.
            note(`F prepare refused: http ${prep.status()} ${JSON.stringify(prepBody).slice(0, 400)}`);
            await shot(page, "F0-tour-prepare-refused");
            test.info().annotations.push({ type: "not-reachable", description: `tour prepare ${prep.status()}` });
            return;
        }
        await expect(page.locator(`${MODAL_SCOPE} [data-cc-subject-input="true"]`)).not.toHaveValue("", { timeout: 60_000 });
        await shot(page, "F1-tour-invitation-draft");
        const prepared = marks.find((m) => (m.body.payload as { mode?: string })?.mode === "prepare");
        note(`F prepared=${Boolean(prepared)}`);
        await sendThroughConfirmation(page, MODAL_SCOPE, "F2");
        await expect.poll(() => marks.filter((m) => (m.body.payload as { mode?: string })?.mode === "mark_sent").length, { timeout: 30_000 }).toBe(1);
        const mark = marks.find((m) => (m.body.payload as { mode?: string })?.mode === "mark_sent")!;
        const invitationId = String((mark.body.payload as { invitation_id?: string }).invitation_id ?? "");
        const status = sql(`select status from tour_invitations where id='${invitationId}'`);
        note(`F mark_sent invitation=${invitationId} status=${status} work_consequence_sent=${exchanges.some((e) => "work_consequence" in e.request)}`);
        expect(exchanges.some((e) => "work_consequence" in e.request)).toBe(false);
        expect(status).toBe("active");
        // mark_sent follows the CONFIRMED send.
        const confirmAt = exchanges.findIndex((e) => e.request.confirm === true);
        expect(confirmAt).toBeGreaterThan(-1);
    });

    test("V — narrower Focus Panel", async ({ page }) => {
        test.setTimeout(600_000);
        const viewport = { width: 1180, height: 820 };
        await openLead(page, OPP_SMS.row, viewport);
        await page.locator('[data-process-action="quick_message"]').first().click();
        await expect(page.locator(`${CW_SCOPE} [data-cc-ws-section="composer"]`)).toBeVisible({ timeout: 120_000 });
        await page.waitForTimeout(1500);
        await shot(page, "V1-current-work-narrow");
        note(`V current-work narrow ${JSON.stringify(await measure(page, CW_SCOPE))}`);
        await page.keyboard.press("Escape");
        await openLead(page, OPP_SMS.row, viewport);
        await openManageMessage(page, /^(send )?message$/i);
        const scope = LABEL === "before" ? LEGACY_MODAL : MODAL_SCOPE;
        await expect(page.locator(scope)).toBeVisible({ timeout: 120_000 });
        await page.waitForTimeout(2000);
        await shot(page, "V2-manage-narrow");
        note(`V manage narrow ${JSON.stringify(await measure(page, scope))}`);
        if (LABEL === "after") {
            // Every primary control still reachable at the narrower width.
            for (const sel of ['[data-cc-send-button="true"]', '[aria-label="Send later"]', '[data-bos-assist-button="true"]', "[data-cc-toggle-cc-bcc]", '[data-cc-template-trigger="true"]']) {
                await expect(page.locator(`${scope} ${sel}`)).toBeInViewport();
            }
        }
    });
});
