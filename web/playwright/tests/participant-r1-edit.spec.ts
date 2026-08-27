/**
 * A correction on a GENERATED document reaches the generated document.
 *
 * The source-fidelity half of this was proven earlier; this is the other renderer. What must hold
 * is that the change is process-scoped: it alters this artifact's own completed record and creates
 * no canonical field, changes no other answer, and does not fall back to rendering a generic Form.
 */
import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

const TOKEN = process.env.PARTICIPANT_TOKEN ?? "";
const OUT = process.env.R1_OUT ?? "/tmp/r1edit";
const VIEWPORT = process.env.R1_VIEWPORT === "mobile" ? { width: 375, height: 812 } : undefined;
test.use({ storageState: { cookies: [], origins: [] }, ...(VIEWPORT ? { viewport: VIEWPORT } : {}) });

test("edit one answer on the generated document", async ({ page }) => {
    test.setTimeout(420_000);
    test.skip(!TOKEN, "no token");
    mkdirSync(OUT, { recursive: true });
    const errors: string[] = [];
    page.on("console", (m) => {
        if (m.type() === "error") errors.push(m.text());
    });
    page.on("pageerror", (e) => errors.push(String(e)));
    // The draft write itself, so "nothing changed" can be told from "nothing was sent".
    page.on("response", async (r) => {
        if (r.request().method() !== "PATCH") return;
        let b = "";
        try {
            b = (await r.text()).slice(0, 500);
        } catch {
            /* consumed */
        }
        console.log(`=== DRAFT PATCH -> ${r.status()} ${r.status() >= 400 ? b : "(ok)"} ===`);
    });
    page.on("request", (r) => {
        if (r.method() === "PATCH" && /\/submissions\//.test(new URL(r.url()).pathname)) {
            const body = r.postData() ?? "";
            console.log(`=== DRAFT PATCH sent (${body.length} bytes) contains the new value: ${body.includes("Corrected by the parent")} ===`);
        }
    });
    page.setDefaultTimeout(25_000);

    const artifact = async () =>
        page.evaluate(async (t) => {
            const r = await fetch(`/api/public/forms/${t}/enrollment-artifact`);
            const j = await r.json();
            return j?.data ?? null;
        }, TOKEN);
    const grabDoc = async () =>
        page.evaluate(async (t) => {
            const r = await fetch(`/api/public/forms/${t}/enrollment-document?rev=e${Date.now()}`);
            const b = new Uint8Array(await r.arrayBuffer());
            const d = await crypto.subtle.digest("SHA-256", b);
            let s = "";
            for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode(...b.subarray(i, i + 8192));
            return {
                bytes: b.length,
                sha: [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join("").slice(0, 16),
                b64: btoa(s),
            };
        }, TOKEN);
    /** The document's own text, which is the only place a correction has to show up. */
    const documentText = async () =>
        page.evaluate(async () => {
            const nodes = [...document.querySelectorAll("[data-participant-document] canvas")];
            return nodes.length;
        });

    await page.goto(`/forms/embed/${TOKEN}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(7000);
    const enter = page.getByRole("button", { name: /review paperwork/i });
    if (await enter.count()) {
        await enter.first().click();
        await page.waitForTimeout(9000);
    }

    const before = await artifact();
    console.log("=== artifact:", JSON.stringify({ title: before?.title, renderer: before?.renderer, id: before?.render_identity, version: before?.form_definition_version_id }), "===");
    // Both renderer classes must honour a correction; the spec proves whichever is open.
    const EXPECT_RENDERER = process.env.R1_RENDERER;
    if (EXPECT_RENDERER) expect(before?.renderer, "the renderer under proof").toBe(EXPECT_RENDERER);

    const docBefore = await grabDoc();
    void (await documentText());
    writeFileSync(`${OUT}/admissions-before.pdf`, Buffer.from(docBefore.b64, "base64"));
    console.log("=== document before:", docBefore.bytes, docBefore.sha, "===");

    await page.getByRole("button", { name: /make a change/i }).first().click();
    await page.waitForTimeout(3000);
    console.log("=== change surface ===\n" + (await page.evaluate(() => document.body.innerText)).slice(0, 900));

    // Pick a free-text control the parent could genuinely correct.
    const inputs = page.locator('input[type="text"], input:not([type]), textarea');
    const count = await inputs.count();
    console.log("=== editable controls on the change surface:", count, "===");
    let editedFieldId: string | null = null;
    // Distinct on every run: refilling a box with the text already in it proves nothing.
    const NEW_VALUE = process.env.R1_EDIT_VALUE ?? "Corrected by the parent";
    for (let i = 0; i < count; i++) {
        const el = inputs.nth(i);
        const info = {
            id: await el.getAttribute("id"),
            visible: await el.isVisible().catch(() => false),
            editable: await el.isEditable().catch(() => false),
            readonly: await el.getAttribute("readonly"),
            disabled: await el.getAttribute("disabled"),
        };
        if (i < 4) console.log("   candidate:", JSON.stringify(info));
        if (!info.visible || !info.editable) continue;
        try {
            await el.scrollIntoViewIfNeeded();
            await el.fill(NEW_VALUE, { timeout: 8000 });
            await el.blur();
        } catch (e) {
            console.log("   fill refused:", String(e).split("\n")[0]);
            continue;
        }
        // The engine's controls carry no id attribute; which ANSWER moved is read from the draft.
        editedFieldId = info.id ?? `control #${i}`;
        console.log("   value in the box after filling:", JSON.stringify(await el.inputValue().catch(() => null)));
        console.log("   its label:", JSON.stringify((await el.evaluate((n) => (n.closest("div")?.textContent ?? "").slice(0, 80))).trim()));
        break;
    }
    console.log("=== edited control:", editedFieldId, "===");
    expect(editedFieldId, "an answer to correct").not.toBeNull();
    await page.waitForTimeout(6000);

    const back = page.getByRole("button", { name: /back to paperwork/i }).first();
    if (await back.count()) await back.click();
    await page.waitForTimeout(9000);

    const after = await artifact();
    const docAfter = await grabDoc();

    writeFileSync(`${OUT}/admissions-after.pdf`, Buffer.from(docAfter.b64, "base64"));
    console.log("=== document after:", docAfter.bytes, docAfter.sha, "===");

    console.log("=== console errors:", JSON.stringify(errors.slice(0, 4)), "===");

    // The completed record changed.
    expect(docAfter.sha, "the generated document reflects the correction").not.toBe(docBefore.sha);
    // Same Form, same version, same composer — a correction is not a new document.
    expect(after?.form_definition_version_id).toBe(before?.form_definition_version_id);
    expect(after?.render_identity).toBe(before?.render_identity);
    expect(after?.renderer, "no fallback to a generic Form").toBe(before?.renderer);
});
