/**
 * The five-artifact walk, through the parent's own public link.
 *
 * One loop, artifact-agnostic: whatever this artifact asks for — attachments, a signature at an
 * authored placement or a composed one — is done the way a parent would do it, and the loop moves on
 * when the runtime says the next document is ready. Nothing here knows which document it is on.
 */
import { test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

const TOKEN = process.env.PARTICIPANT_TOKEN ?? "";
const OUT = process.env.R1_OUT ?? "/tmp/r1walk";
const MAX = Number(process.env.R1_MAX ?? "5");
/** A phone when asked for one — 375px is the width the parent actually holds. */
const VIEWPORT = process.env.R1_VIEWPORT === "mobile" ? { width: 375, height: 812 } : undefined;
test.use({ storageState: { cookies: [], origins: [] }, ...(VIEWPORT ? { viewport: VIEWPORT } : {}) });

const SOURCE_NAMES = [
    "Var History",
    "Var history",
    "Signature1",
    "Signature Update",
    "Prov Sp",
    "Module Sp",
    "Philos",
    "subject_line",
];

test("walk every artifact to completion", async ({ page }) => {
    test.setTimeout(900_000);
    test.skip(!TOKEN, "no token");
    mkdirSync(OUT, { recursive: true });
    console.log(`viewport: ${JSON.stringify(page.viewportSize())}`);

    /** Nothing may push the page sideways — a document scrolls inside its own box. */
    const horizontalOverflow = async () =>
        page.evaluate(() => ({
            scroll: document.documentElement.scrollWidth,
            client: document.documentElement.clientWidth,
        }));
    const errors: string[] = [];
    const httpErrors: string[] = [];
    page.on("console", (m) => {
        if (m.type() === "error") errors.push(m.text());
    });
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("response", async (r) => {
        if (r.status() < 400) return;
        let b = "";
        try {
            b = (await r.text()).slice(0, 400);
        } catch {
            /* body already consumed */
        }
        httpErrors.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname} ${b}`);
    });

    const texts = async () =>
        page.evaluate(() => {
            const out: string[] = [];
            document.querySelectorAll<HTMLElement>("h1,h2,h3,p,button,span,label").forEach((el) => {
                if (el.children.length || el.closest(".sr-only")) return;
                const s = (el.innerText || "").trim();
                if (s && s.length < 140) out.push(s);
            });
            return [...new Set(out)];
        });
    const objective = async () =>
        page.evaluate(async (t) => {
            const r = await fetch(`/api/public/forms/${t}/enrollment-objective`);
            const j = await r.json();
            return { phase: j?.data?.phase, progress: j?.data?.progress, complete: j?.data?.complete };
        }, TOKEN);
    const grabDoc = async () =>
        page.evaluate(async (t) => {
            const r = await fetch(`/api/public/forms/${t}/enrollment-document?rev=w${Date.now()}`);
            if (!r.ok) return { status: r.status, bytes: 0, b64: "" };
            const b = new Uint8Array(await r.arrayBuffer());
            let s = "";
            for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode(...b.subarray(i, i + 8192));
            return { status: r.status, bytes: b.length, b64: btoa(s) };
        }, TOKEN);

    page.setDefaultTimeout(20_000);
    await page.goto(`/forms/embed/${TOKEN}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(7000);

    for (let step = 1; step <= MAX; step++) {
        const before = await objective();
        console.log(`\n########## ARTIFACT ${step} — ${JSON.stringify(before)}`);
        if (before.complete) {
            console.log("packet already complete");
            break;
        }

        const enter = page.getByRole("button", { name: /review paperwork/i });
        if (await enter.count()) {
            await enter.first().click();
            await page.waitForTimeout(9000);
        }

        const t = await texts();
        console.log("REVIEW SURFACE:\n" + t.join("\n"));
        console.log("source-label leak:", JSON.stringify(SOURCE_NAMES.filter((n) => t.some((s) => s.includes(n)))));
        const overflow = await horizontalOverflow();
        console.log(`page width: scroll=${overflow.scroll} client=${overflow.client} horizontal-overflow=${overflow.scroll > overflow.client + 1}`);

        const rows = await page.locator("[data-upload-request]").count();
        console.log("upload requests:", rows);
        for (let i = 0; i < rows; i++) {
            const row = page.locator("[data-upload-request]").nth(i);
            if (await row.locator("[data-upload-attached]").count()) continue;
            const label = (await row.innerText()).split("\n")[0];
            await row.locator("input[type=file]").setInputFiles({
                name: `${label.replace(/[^\w]+/g, "-").slice(0, 40) || "attachment"}.pdf`,
                mimeType: "application/pdf",
                buffer: Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n"),
            });
            await page.waitForTimeout(6000);
            console.log("  attached:", label, "->", (await row.locator("[data-upload-attached]").count()) === 1);
        }

        const good = page.getByRole("button", { name: /everything looks good/i }).first();
        if (!(await good.count())) {
            console.log("!! no review affordance; stopping");
            break;
        }
        console.log("Everything looks good enabled:", await good.isEnabled());
        const tRender = Date.now();
        await good.click();
        await page.waitForTimeout(8000);
        const signText = await texts();
        console.log("SIGN SURFACE:\n" + signText.join("\n"));
        console.log("sign-phase leak:", JSON.stringify(SOURCE_NAMES.filter((n) => signText.some((s) => s.includes(n)))));

        const tap = page.getByText(/tap to sign/i);
        if (await tap.count()) {
            /*
             * MEASURED, not waited out — the same mistake as the finish interval.
             *
             * `waitForTimeout(2500)` then reporting the elapsed time reports 2.5s for every
             * artifact, which is the harness's own sleep and says nothing about the product. The
             * interval that matters is tap -> the capture surface is usable.
             */
            const tTap = Date.now();
            await tap.first().click();
            await page
                .getByRole("checkbox")
                .last()
                .waitFor({ state: "visible", timeout: 30_000 })
                .catch(() => undefined);
            console.log(`  tap -> capture usable: ${Date.now() - tTap} ms`);
            const pad = page.locator("canvas").last();
            const box = await pad.boundingBox();
            if (box) {
                await page.mouse.move(box.x + box.width * 0.15, box.y + box.height * 0.65);
                await page.mouse.down();
                for (const [dx, dy] of [
                    [0.28, 0.32],
                    [0.4, 0.74],
                    [0.52, 0.36],
                    [0.66, 0.7],
                    [0.8, 0.44],
                ]) {
                    await page.mouse.move(box.x + box.width * dx, box.y + box.height * dy, { steps: 10 });
                }
                await page.mouse.up();
                await page.waitForTimeout(600);
            }
            const ack = page.getByRole("checkbox").last();
            if (await ack.count()) {
                try {
                    await ack.check({ timeout: 15_000, force: true });
                } catch (e) {
                    console.log("  !! acknowledgement check failed:", String(e).split("\n")[0]);
                }
            }
            const done = page.getByRole("button", { name: /^done$/i }).first();
            console.log("  Done enabled after acknowledgement:", await done.isEnabled());
            /* Done -> the regenerated document is on screen again, not a fixed sleep. */
            const tDone = Date.now();
            await done.click({ timeout: 20_000 });
            await page
                .getByRole("checkbox")
                .last()
                .waitFor({ state: "detached", timeout: 30_000 })
                .catch(() => undefined);
            await page
                .locator("[data-participant-document] canvas")
                .first()
                .waitFor({ state: "attached", timeout: 60_000 })
                .catch(() => undefined);
            console.log(`  done -> signed document back on screen: ${Date.now() - tDone} ms`);
        } else {
            console.log("  no tap-to-sign affordance on this artifact");
        }

        const doc = await grabDoc();
        if (doc.b64) writeFileSync(`${OUT}/artifact-${step}-signed.pdf`, Buffer.from(doc.b64, "base64"));
        console.log(`  document ${doc.status} ${doc.bytes} bytes (ms since review: ${Date.now() - tRender})`);

        const finish = page.getByRole("button", { name: /sign and finish|finish/i }).first();
        if (!(await finish.count())) {
            console.log("!! no finish affordance; stopping");
            break;
        }
        /*
         * MEASURED, not waited out.
         *
         * A fixed `waitForTimeout(22000)` here reported "22s" for every artifact, which measured the
         * test and not the product. The interval that matters is finish -> the runtime has moved on.
         */
        const tFinish = Date.now();
        await finish.click();
        let after = before;
        let advancedMs: number | null = null;
        for (let waited = 0; waited < 60_000; waited += 500) {
            await page.waitForTimeout(500);
            after = await objective();
            if (after.complete || after.progress?.satisfied !== before.progress?.satisfied) {
                advancedMs = Date.now() - tFinish;
                break;
            }
        }
        console.log(`  finish -> runtime advanced: ${advancedMs ?? "did not advance within 60s"} ms`);
        // The next artifact still has to be fetched and painted before the parent can act on it.
        const tReady = Date.now();
        await page
            .locator("[data-participant-document] canvas, [data-participant-thread]")
            .first()
            .waitFor({ state: "attached", timeout: 60_000 })
            .catch(() => undefined);
        console.log(`  next artifact surface ready: ${Date.now() - tReady} ms after that`);
        await page.waitForTimeout(4000);
        console.log("  objective after:", JSON.stringify(after));
        console.log("AFTER FINISH:\n" + (await texts()).slice(0, 14).join("\n"));
        if (httpErrors.length) console.log("  HTTP errors so far:", JSON.stringify(httpErrors.slice(-3)));
        if (after.progress?.satisfied === before.progress?.satisfied) {
            console.log("!! did not advance; stopping");
            break;
        }
    }

    console.log("\n=== FINAL objective:", JSON.stringify(await objective()), "===");
    console.log("=== console errors:", JSON.stringify(errors.slice(0, 6)), "===");
    console.log("=== http errors:", JSON.stringify(httpErrors.slice(0, 6)), "===");
});
