/**
 * R1 — the parent signs the Oregon CIS, finishes it, and lands on the next document.
 *
 * Everything here happens through the public participant door with no operator session: the same
 * link a real parent is emailed. Structural evidence is deliberately not trusted on its own — the
 * signed artifact is fetched, hashed and rasterised so the mark can be LOOKED at.
 */
import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

const TOKEN = process.env.PARTICIPANT_TOKEN ?? "";
const OUT = process.env.R1_OUT ?? "/tmp/r1";
test.use({ storageState: { cookies: [], origins: [] } });

test("sign the CIS, finish it, and advance", async ({ page }) => {
    test.setTimeout(300_000);
    test.skip(!TOKEN, "no token");
    mkdirSync(OUT, { recursive: true });
    const errors: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    page.on("pageerror", (e) => errors.push(String(e)));
    // The refusal itself, not the toast: capture the submit route's own body.
    page.on("response", async (r) => {
        if (r.status() >= 400) {
            let b = ""; try { b = (await r.text()).slice(0, 400); } catch { /* consumed */ }
            console.log(`=== HTTP ${r.status()} ${r.request().method()} ${new URL(r.url()).pathname} ${b} ===`);
        }
        if (!/\/submit$/.test(new URL(r.url()).pathname)) return;
        let body = ""; try { body = (await r.text()).slice(0, 2000); } catch { /* consumed */ }
        console.log(`=== SUBMIT ${r.status()} ${body} ===`);
    });

    const surface = async (label: string) => {
        const t = await page.evaluate(() => {
            const out: string[] = [];
            document.querySelectorAll<HTMLElement>("h1,h2,h3,p,button,span,label,legend").forEach((el) => {
                if (el.children.length || el.closest(".sr-only")) return;
                const s = (el.innerText || "").trim();
                if (s && s.length < 120) out.push(s);
            });
            return [...new Set(out)];
        });
        console.log(`=== ${label} ===\n` + t.join("\n"));
        return t;
    };
    const objective = async () => page.evaluate(async (t) => {
        const r = await fetch(`/api/public/forms/${t}/enrollment-objective`);
        const j = await r.json();
        return { phase: j?.data?.phase, progress: j?.data?.progress, prompt: j?.data?.next_turn?.prompt };
    }, TOKEN);
    const grabDoc = async (name: string) => page.evaluate(async ([t, n]) => {
        const r = await fetch(`/api/public/forms/${t}/enrollment-document?rev=${n}${Date.now()}`);
        if (!r.ok) return { status: r.status, bytes: 0, sha: "", b64: "" };
        const b = new Uint8Array(await r.arrayBuffer());
        const d = await crypto.subtle.digest("SHA-256", b);
        let s = ""; for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode(...b.subarray(i, i + 8192));
        return { status: r.status, bytes: b.length, sha: [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join("").slice(0, 16), b64: btoa(s) };
    }, [TOKEN, name] as const);

    await page.goto(`/forms/embed/${TOKEN}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(6000);
    console.log("=== objective on arrival:", JSON.stringify(await objective()), "===");

    const enter = page.getByRole("button", { name: /review paperwork/i });
    if (await enter.count()) { await enter.first().click(); await page.waitForTimeout(9000); }
    const reviewText = await surface("REVIEW");

    // §1 — no source label may reach the parent, on any phase.
    const SOURCE_NAMES = ["Var History", "Var history", "Signature1", "Signature Update", "Prov Sp", "Module Sp"];
    const leakedAtReview = SOURCE_NAMES.filter((n) => reviewText.some((s) => s.includes(n)));
    console.log("=== source labels visible at review:", JSON.stringify(leakedAtReview), "===");

    // §11 — the attachments this document asks for, done as a parent would.
    const uploadRows = await page.locator("[data-upload-request]").count();
    console.log("=== upload requests presented:", uploadRows, "===");
    for (let i = 0; i < uploadRows; i++) {
        const row = page.locator("[data-upload-request]").nth(i);
        const fieldId = await row.getAttribute("data-upload-request");
        console.log("=== upload row:", fieldId, JSON.stringify((await row.innerText()).replace(/\n/g, " | ")), "===");
        await row.locator("input[type=file]").setInputFiles({
            name: "immunization-record.pdf",
            mimeType: "application/pdf",
            buffer: Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n"),
        });
        await page.waitForTimeout(6000);
        console.log("=== attached:", await row.locator("[data-upload-attached]").count(), (await row.innerText()).replace(/\n/g, " | "), "===");
    }
    console.log("=== outstanding note:", await page.locator("[data-uploads-outstanding]").count(), "===");
    console.log("=== Everything looks good enabled:", await page.getByRole("button", { name: /everything looks good/i }).first().isEnabled(), "===");

    const before = await grabDoc("before");
    writeFileSync(`${OUT}/cis-before.pdf`, Buffer.from(before.b64, "base64"));
    console.log("=== document before signing:", before.status, before.bytes, before.sha, "===");

    await page.getByRole("button", { name: /everything looks good/i }).first().click();
    await page.waitForTimeout(8000);
    const signText = await surface("SIGN PHASE");
    const leakedAtSign = SOURCE_NAMES.filter((n) => signText.some((s) => s.includes(n)));
    console.log("=== source labels visible at sign:", JSON.stringify(leakedAtSign), "===");
    expect(leakedAtSign, "no source label in the signature phase").toEqual([]);

    await page.getByText(/tap to sign/i).first().click();
    await page.waitForTimeout(2500);
    const dlgText = await surface("CAPTURE OPEN");
    const leakedInDialog = SOURCE_NAMES.filter((n) => dlgText.some((s) => s.includes(n)));
    expect(leakedInDialog, "no source label in the signature dialog").toEqual([]);

    const pad = page.locator("canvas").last();
    const box = await pad.boundingBox();
    if (!box) throw new Error("no signature pad");
    const t0 = Date.now();
    await page.mouse.move(box.x + box.width * 0.15, box.y + box.height * 0.65);
    await page.mouse.down();
    for (const [dx, dy] of [[0.25, 0.3], [0.35, 0.72], [0.45, 0.35], [0.55, 0.7], [0.68, 0.4], [0.8, 0.62]]) {
        await page.mouse.move(box.x + box.width * dx, box.y + box.height * dy, { steps: 10 });
    }
    await page.mouse.up();
    await page.waitForTimeout(600);
    await page.getByRole("checkbox").last().check();
    const done = page.getByRole("button", { name: /^done$/i }).first();
    expect(await done.isEnabled(), "Done available once acknowledged").toBe(true);
    await done.click();
    await page.waitForTimeout(9000);
    console.log(`=== capture->persisted ms: ${Date.now() - t0} ===`);
    await surface("AFTER DONE");

    const previewed = await grabDoc("previewed");
    console.log("=== document after capture:", previewed.status, previewed.bytes, previewed.sha, "===");

    // THE STEP THIS RUN IS ABOUT.
    const finish = page.getByRole("button", { name: /sign and finish/i }).first();
    console.log("=== Sign and finish present:", await finish.count(), "enabled:", await finish.isEnabled(), "===");
    const t1 = Date.now();
    await finish.click();
    await page.waitForTimeout(20000);
    console.log(`=== finish->next ms: ${Date.now() - t1} ===`);
    await surface("AFTER SIGN AND FINISH");
    console.log("=== objective after finish:", JSON.stringify(await objective()), "===");
    console.log("=== url:", page.url(), "===");

    const next = await grabDoc("next");
    writeFileSync(`${OUT}/after-finish.pdf`, Buffer.from(next.b64, "base64"));
    console.log("=== document now served:", next.status, next.bytes, next.sha, "===");
    console.log("=== console errors:", JSON.stringify(errors.slice(0, 5)), "===");
});
