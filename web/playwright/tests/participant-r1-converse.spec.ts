/**
 * The conversation half, driven the way a parent drives it.
 *
 * Types into the composer, taps a suggested reply when one fits, fills a date or number control
 * when the turn asks for one, and stops when the runtime hands the paperwork over. Nothing here
 * knows which question is coming.
 */
import { test } from "@playwright/test";

const TOKEN = process.env.PARTICIPANT_TOKEN ?? "";
const MAX_TURNS = Number(process.env.R1_TURNS ?? "40");
test.use({ storageState: { cookies: [], origins: [] } });

/** Source labels that must never reach a parent, in any phase. */
const SOURCE_NAMES = ["Childs Last Name", "Var History", "Signature1", "Prov Sp", "Module Sp", "subject_line"];

test("hold the conversation until the paperwork is ready", async ({ page }) => {
    test.setTimeout(900_000);
    test.skip(!TOKEN, "no token");
    const errors: string[] = [];
    page.on("console", (m) => {
        if (m.type() === "error") errors.push(m.text());
    });
    page.on("pageerror", (e) => errors.push(String(e)));
    page.setDefaultTimeout(25_000);

    const objective = async () =>
        page.evaluate(async (t) => {
            const r = await fetch(`/api/public/forms/${t}/enrollment-objective`);
            const j = await r.json();
            const turn = j?.data?.next_turn ?? {};
            return {
                phase: j?.data?.phase,
                work: j?.data?.work,
                kind: turn.kind,
                inputType: turn.input_type,
                label: turn.label,
                canonicalKey: turn.canonical_key,
                options: turn.options ?? [],
                cluster: turn.cluster ?? null,
            };
        }, TOKEN);

    await page.goto(`/forms/embed/${TOKEN}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(8000);

    const leaks = new Set<string>();
    let handedOver = false;
    let stuck = 0;

    for (let turn = 1; turn <= MAX_TURNS; turn++) {
        const state = await objective();
        if (state.phase !== "shared_collection") {
            console.log(`conversation ended after ${turn - 1} turns — phase ${state.phase}`);
            handedOver = true;
            break;
        }

        const visible = await page.evaluate(() => document.body.innerText);
        for (const n of SOURCE_NAMES) if (visible.includes(n)) leaks.add(n);

        const question = (await page.locator("[data-participant-thread] p, [data-participant-thread] div").last().innerText().catch(() => "")).slice(0, 120);
        console.log(
            `turn ${String(turn).padStart(2)}  ${state.work?.settled}/${state.work?.total}  ` +
                `[${state.kind ?? "?"}${state.inputType ? "/" + state.inputType : ""}] ${question.replace(/\n/g, " ")}`,
        );

        /*
         * Answer in the SHAPE the turn asks for.
         *
         * Typing "Not applicable" at a date is refused, correctly — and a driver that does it
         * anyway loops on "Sorry, I didn't catch that" and proves nothing about the product.
         */
        const suggested = page.locator("[data-participant-suggested] button");
        const dateInput = page.locator('input[type="date"]');
        const numberInput = page.locator('input[type="number"]');
        const composer = page.locator("#participant-composer");
        const send = page.locator('[aria-label="Send"]');

        /*
         * A name has to be a name.
         *
         * "Not applicable" at a guardian-name turn is REFUSED, and correctly so — the runtime checks
         * that an answer is plausible for the fact it collects. A driver that ignores that loops on
         * "Sorry, I didn't catch that" and proves nothing about the product.
         */
        const key = String(state.canonicalKey ?? "");
        const typedAnswer =
            state.inputType === "number"
                ? "5415551234"
                : Array.isArray(state.options) && state.options.length
                  ? String(state.options[0])
                  : /email/.test(key)
                    ? "parent@example.com"
                    : /phone/.test(key)
                      ? "5415551234"
                      : /address/.test(key)
                        ? "100 Main Street, Bend, OR 97701"
                        : /name/.test(key)
                          ? key.includes("child")
                              ? key.includes("first")
                                  ? "Mateo"
                                  : "Sigwalk"
                              : "Alex Sigwalk"
                          : "Not applicable";

        if (await dateInput.count()) {
            await dateInput.first().fill("2026-09-01");
            if (await send.count()) await send.first().click();
            else await page.getByRole("button", { name: /^(send|save|continue|next|use this)$/i }).first().click();
        } else if (await numberInput.count()) {
            await numberInput.first().fill("5415551234");
            if (await send.count()) await send.first().click();
        } else if ((await suggested.count()) > 0) {
            await suggested.first().click();
        } else if (await composer.count()) {
            await composer.fill(typedAnswer);
            await send.first().click();
        } else {
            console.log("  !! nothing to answer with; stopping");
            break;
        }
        await page.waitForTimeout(6000);

        // A repeated refusal means the driver is wrong about the shape; say so rather than loop.
        if ((await page.evaluate(() => document.body.innerText)).includes("I didn't catch that")) {
            stuck += 1;
            if (stuck >= 3) {
                console.log(`  !! refused three times on ${JSON.stringify(state)}; stopping`);
                break;
            }
        } else {
            stuck = 0;
        }
    }

    console.log("=== handed over:", handedOver, "===");
    console.log("=== final objective:", JSON.stringify(await objective()), "===");
    console.log("=== source labels seen in the conversation:", JSON.stringify([...leaks]), "===");
    console.log("=== console errors:", JSON.stringify(errors.slice(0, 5)), "===");
});
