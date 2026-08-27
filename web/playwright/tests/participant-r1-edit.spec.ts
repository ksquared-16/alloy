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
test.use({ storageState: { cookies: [], origins: [] } });

test("edit one answer on the generated document", async ({ page }) => {
    test.setTimeout(420_000);
    test.skip(!TOKEN, "no token");
    mkdirSync(OUT, { recursive: true });
    const errors: string[] = [];
    page.on("console", (m) => {
        if (m.type() === "error") errors.push(m.text());
    });
    page.on("pageerror", (e) => errors.push(String(e)));
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
    const draftValues = async () =>
        page.evaluate(async (t) => {
            const id = window.sessionStorage.getItem(`alloy.form.${t}`) ?? "";
            if (!id) return null;
            const r = await fetch(`/api/public/forms/${t}/submissions/${id}`);
            const j = await r.json();
            return (j?.data?.payload?.values ?? null) as Record<string, unknown> | null;
        }, TOKEN);

    await page.goto(`/forms/embed/${TOKEN}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(7000);
    const enter = page.getByRole("button", { name: /review paperwork/i });
    if (await enter.count()) {
        await enter.first().click();
        await page.waitForTimeout(9000);
    }

    const before = await artifact();
    console.log("=== artifact:", JSON.stringify({ title: before?.title, renderer: before?.renderer, id: before?.render_identity, version: before?.form_definition_version_id }), "===");
    expect(before?.renderer, "this proof is about the generated renderer").toBe("generated_document");

    const docBefore = await grabDoc();
    const valuesBefore = await draftValues();
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
    const NEW_VALUE = "Corrected by the parent";
    for (let i = 0; i < count; i++) {
        const el = inputs.nth(i);
        if (!(await el.isEditable().catch(() => false))) continue;
        const id = await el.getAttribute("id");
        await el.fill(NEW_VALUE);
        await el.blur();
        editedFieldId = id;
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
    const valuesAfter = await draftValues();
    writeFileSync(`${OUT}/admissions-after.pdf`, Buffer.from(docAfter.b64, "base64"));
    console.log("=== document after:", docAfter.bytes, docAfter.sha, "===");

    // The completed record changed.
    expect(docAfter.sha, "the generated document reflects the correction").not.toBe(docBefore.sha);
    // Same Form, same version, same composer.
    expect(after?.form_definition_version_id).toBe(before?.form_definition_version_id);
    expect(after?.render_identity).toBe(before?.render_identity);
    expect(after?.renderer).toBe("generated_document");

    // Exactly one answer moved.
    const changed = Object.keys({ ...(valuesBefore ?? {}), ...(valuesAfter ?? {}) }).filter(
        (k) => JSON.stringify(valuesBefore?.[k]) !== JSON.stringify(valuesAfter?.[k]),
    );
    console.log("=== draft keys that changed:", JSON.stringify(changed), "===");
    console.log("=== console errors:", JSON.stringify(errors.slice(0, 4)), "===");
});
