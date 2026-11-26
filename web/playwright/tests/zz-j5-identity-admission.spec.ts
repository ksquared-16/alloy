import { test } from "@playwright/test";

/**
 * OX J5 — CASE A OR CASE B, READ OFF THE WIRE THAT IS ALREADY DEPLOYED.
 *
 * `children` and `household` are the two COMMIT_CRITICAL cards that stay reserved a median 3,495ms.
 * Both gate on identity the answer carries in `subjectIdentityTruth`. Two very different defects
 * produce that: the truth is genuinely absent at commit (A), or it is present and the cards are not
 * admitted (B).
 *
 * No new instrumentation is needed to tell them apart. The composer already folds `_inquiry_children`
 * into the identity bag only when rows came back, and already records `document_children_at_commit`
 * as a span; the route publishes those spans. So this intercepts the provisioning answer during a
 * real row switch and reads what the server actually sent, alongside when each card un-reserves.
 *
 * PRIVACY. Only booleans, counts and classifications leave the page. Never a name, a phone, an email,
 * a child, or any business value — presence of a key, never its content.
 */
const RUNS = Number(process.env.OX_ADM_RUNS ?? "8");

test("j5 identity truth admission", async ({ page }) => {
    test.setTimeout(900_000);

    const answers: unknown[] = [];
    page.on("response", async (res) => {
        if (!/\/api\/admin\/work-units\/[^/]+\/provisioning-answer/.test(res.url())) return;
        try {
            const body = (await res.json()) as Record<string, unknown>;
            const a = (body.answer ?? body) as Record<string, unknown>;
            const sit = a.subjectIdentityTruth as Record<string, unknown> | null | undefined;
            const timings = (a.timings ?? body.timings) as Record<string, unknown> | undefined;
            const spans = (timings?.spans ?? (body as Record<string, unknown>).route_compose_spans) as
                Record<string, number> | undefined;
            const keys = sit ? Object.keys(sit) : [];
            /*
             * THE ROWS, NOT ONLY THE COMMITTED SUBJECT.
             *
             * The answer is fetched once per work unit and NOT re-fetched on a row switch (measured
             * 0 of 8), so subject B's commit-critical context comes from data already in hand. If the
             * queue rows carry `_inquiry_children`, the truth for B is present before B is clicked and
             * the defect is admission; if they do not, it is genuinely absent and no admission change
             * can conjure it.
             */
            const rows = (a.rows ?? (a as Record<string, unknown>).queueRows ?? []) as Array<Record<string, unknown>>;
            const rowsWithChildren = Array.isArray(rows)
                ? rows.filter((r) => r && r._inquiry_children != null).length : null;
            const rowsWithContact = Array.isArray(rows)
                ? rows.filter((r) => r && (r._customer_name != null || r.primary_person_id != null)).length : null;
            answers.push({
                at: Date.now(),
                // PRESENCE ONLY — never the value.
                subjectIdentityTruth_present: sit != null,
                identity_key_count: keys.length,
                inquiry_children_identity_present: keys.includes("_inquiry_children"),
                inquiry_children_count: Array.isArray(sit?._inquiry_children)
                    ? (sit!._inquiry_children as unknown[]).length : null,
                primary_contact_identity_present: keys.includes("person.primary_contact_name"),
                customer_identity_present: keys.includes("customer.id"),
                primary_person_identity_present: keys.includes("primary_person_id"),
                document_children_at_commit: spans?.document_children_at_commit ?? null,
                row_count: Array.isArray(rows) ? rows.length : null,
                rows_with_children_identity: rowsWithChildren,
                rows_with_contact_identity: rowsWithContact,
                cohort_enriched_at_commit: spans?.cohort_enriched_at_commit ?? null,
                // Which identity families exist at all, by stable classification.
                families: keys.map((k) => (k.startsWith("person.") ? "person"
                    : k.startsWith("customer.") ? "customer"
                    : k.startsWith("child.") ? "child"
                    : k.startsWith("_mission") ? "mission"
                    : k === "_inquiry_children" ? "children"
                    : "other")).filter((v, i, s) => s.indexOf(v) === i).sort(),
            });
        } catch { /* not the shape we expect */ }
    });

    for (let run = 0; run < RUNS; run += 1) {
        if (run % 3 === 0) {
            await page.goto("/adminV2/workspace/work-unit/new-leads", { waitUntil: "domcontentloaded", timeout: 180_000 });
            await page.waitForTimeout(16_000);
        }
        const before = 0; // every answer seen so far, including the one from page load
        const card = await page.evaluate(`(async (idx) => {
            const rows=[...document.querySelectorAll('.alloy-os-queue-row-card')];
            if (rows.length < 2) return { error: 'not enough rows' };
            const target = rows[1 + (idx % Math.max(1, rows.length - 1))];
            const bodySubject = () => document.querySelector('[data-focus-panel-body-subject]')?.getAttribute('data-focus-panel-body-subject') || null;
            const was = bodySubject();
            const t0 = performance.now();
            target.click();
            const cleared = {};
            for (let i = 0; i < 240; i += 1) {
                await new Promise((r) => setTimeout(r, 50));
                const reserved = [...document.querySelectorAll('[data-focus-panel-cell-preparing]')]
                    .map((e) => e.getAttribute('data-focus-panel-cell-preparing'));
                for (const k of ['children','household','business_process','financials']) {
                    if (cleared[k] == null && !reserved.includes(k) && performance.now() - t0 > 60) {
                        cleared[k] = Math.round(performance.now() - t0);
                    }
                }
                if (reserved.length === 0 && bodySubject() !== was) break;
            }
            /*
             * THE VERDICT, READ WHERE THE DECISION IS MADE.
             *
             * The provisioning answer is server-rendered into the RSC payload, so there is no
             * response to intercept - measured 0 of 12 row switches. The identity bag reaches the
             * client only as this component's props, and the settlement diagnostic now reports its
             * presence classifications. Reading them here is what separates truth-absent from
             * truth-present-and-unadmitted.
             */
            const d = (window.__ALLOY_FOCUS_SETTLEMENT_DIAG__ || {});
            return {
                switched: bodySubject() !== was,
                clearedAt: cleared,
                identity: {
                    present: d.identityTruthPresent ?? null,
                    keyCount: d.identityKeyCount ?? null,
                    childrenPresent: d.inquiryChildrenIdentityPresent ?? null,
                    childrenCount: d.inquiryChildrenCount ?? null,
                    contactPresent: d.primaryContactIdentityPresent ?? null,
                    customerPresent: d.customerIdentityPresent ?? null,
                    families: d.identityFamilies ?? null,
                },
            };
        })(${run})`);
        const answer = answers.length ? answers[answers.length - 1] : null;
        console.log(`[adm] ${JSON.stringify({ run, card, answer })}`);
        await page.waitForTimeout(1200);
    }
    console.log(`[adm] done runs=${RUNS}`);
});
