import { test } from "@playwright/test";

/**
 * OX SLICE 7 — WHAT DOES THE OPERATOR SEE AT THE IDENTITY-SAFE FRAME?
 *
 * The gate trace proved the committed subject now moves to B in ~7ms. That number only says the
 * COMMIT is immediate; it says nothing about what is on screen while B's facts are still resolving.
 * Slice 7 claims the panel lands on configured geometry with unresolved cells reserved as honest
 * UNKNOWN, not on a cold loader and not on A's retained grid. That claim is a composition claim, so
 * it has to be read off the composition rather than inferred from a milestone.
 *
 * This samples the panel on a fixed cadence across the switch and reports the trajectory: how many
 * cells exist, how many are reserved, and whose payload the cards carry, at every step from the
 * click to quiescence. A frame that shows B's identity over A's cards is the failure this must be
 * able to catch, so the card subject is recorded at every sample rather than only at the end.
 */
test("ox7 safe frame composition", async ({ page }) => {
    test.setTimeout(240_000);

    await page.goto("/adminV2/workspace/work-unit/new-leads", { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForTimeout(15000);

    await page.evaluate(`(() => {
        const rows=[...document.querySelectorAll('.alloy-os-queue-row-card')];
        if (rows.length < 2) return false;
        const cur = rows.findIndex(r=>r.getAttribute('aria-selected')==='true'||r.className.includes('--selected'));
        window.__ox7 = { target: rows[cur>=0?(cur+1)%rows.length:1] };
        for (const t of ["pointerover","mouseover","pointerenter","mouseenter"]) {
            window.__ox7.target.dispatchEvent(new MouseEvent(t, { bubbles: true }));
        }
        return true;
    })()`);
    await page.waitForTimeout(800);

    await page.evaluate(`(() => {
        const HEADER = '[data-alloy-os-focus-panel-header="true"]';
        const w = window.__ox7;
        const bodySubject = () => document.querySelector('[data-focus-panel-body-subject]')?.getAttribute('data-focus-panel-body-subject') || null;
        const cardSubject = () => {
            const els = [...document.querySelectorAll('[data-card-subject]')];
            if (!els.length) return null;
            const vals = [...new Set(els.map((e) => e.getAttribute('data-card-subject')))];
            return vals.length === 1 ? vals[0] : 'MIXED';
        };
        const snap = (rel) => ({
            rel,
            body: bodySubject(),
            cards: cardSubject(),
            cells: document.querySelectorAll('.alloy-os-ucard').length,
            reserved: document.querySelectorAll('[data-focus-panel-cell-reserved="true"]').length,
            carded: document.querySelectorAll('[data-card-subject]').length,
            head: (document.querySelector(HEADER)?.textContent || '').replace(/\\s+/g,' ').trim().slice(0,40),
            src: document.querySelector('[data-focus-panel-body-source]')?.getAttribute('data-focus-panel-body-source') || null,
            act: !!document.querySelector(HEADER + ' [data-alloy-os-fp-header-actions="true"] button:not([disabled])'),
        });
        w.before = snap(-1);
        w.frames = [];
        w.clickAt = performance.now();
        // 100ms cadence is fine: the question is which COMPOSITION appears, not its exact millisecond.
        w.timer = setInterval(() => {
            w.frames.push(snap(Math.round(performance.now() - w.clickAt)));
            if (w.frames.length >= 60) clearInterval(w.timer);
        }, 100);
        w.target.click();
        return true;
    })()`);
    await page.waitForTimeout(14000);

    const out = await page.evaluate(() => {
        const w = window as unknown as {
            __ox7: { before: Record<string, unknown>; frames: Array<Record<string, unknown>> };
        };
        const { before, frames } = w.__ox7;
        const b = before.body as string | null;
        // The first frame in which the committed subject is no longer A: the identity-safe frame.
        const safe = frames.find((f) => f.body && f.body !== b) ?? null;
        // The first frame in which the cards carry B's payload.
        const facts = frames.find((f) => f.cards && f.cards !== "MIXED" && f.cards !== before.cards) ?? null;
        // Any frame showing B's committed identity over A's cards is a mixed-subject frame.
        const mixedFrames = frames.filter(
            (f) => f.body && f.body !== b && f.cards && (f.cards === before.cards || f.cards === "MIXED"),
        );
        return {
            signedOut: !!document.querySelector('input[type="password"]'),
            before,
            safeFrame: safe,
            factsFrame: facts,
            mixedSubjectFrames: mixedFrames.length,
            mixedSample: mixedFrames[0] ?? null,
            trajectory: frames.filter((f) => (f.rel as number) <= 5000).slice(0, 50),
        };
    });
    console.log(`[safeframe] ${JSON.stringify(out)}`);
});
