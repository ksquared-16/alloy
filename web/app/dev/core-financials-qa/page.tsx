import CoreFinancialsQaReader from "./CoreFinancialsQaReader";

/**
 * CORE FINANCIALS DIRECTOR QA — the walkthrough, readable beside the product.
 *
 * ── WHY THIS EXISTS WHEN A HOSTED HARNESS ALREADY DID ───────────────────────────────────────────
 *
 * The first version of this rendered inside the authenticated Alloy operator shell, complete with
 * sidebar and BOS. That is the wrong room for human acceptance: the person doing QA needs the
 * script in one tab and the product in the other, and a QA page wearing the product's own chrome is
 * neither. Enrollment had already solved this at `/dev/real-enrollment-qa`, and this follows that
 * model rather than inventing a second one — a route outside the operator shell, with the product
 * opened deliberately in its own tab.
 *
 * ── WHAT IS SHARED, AND WHAT IS NOT ────────────────────────────────────────────────────────────
 *
 * The presentation changed; the truth did not. Scenarios still come from
 * `lib/qa/financialsDirectorQa/scenarioCatalog`, and readiness and acceptance still come from
 * `/api/admin/qa/financials-director`, which reads money through `buildFinancialsCardVM` and writes
 * only its own table. There is one scenario catalog and one financial read authority; this route is
 * a different window onto them, never a second opinion.
 *
 * ── SHELL-LESS, NOT UNAUTHENTICATED ────────────────────────────────────────────────────────────
 *
 * This page used to call `notFound()` on any hosted runtime, which made the Director's own QA
 * surface a 404 on the only deployment they were being asked to accept. The gate was written as
 * "local by construction", and the word doing the work in that phrase was never *local* — it was
 * *shell-less*. What the experience is for is reading the script beside the product without
 * navigating the operator workspace to reach it. Nothing about that requires the page to be absent
 * from staging.
 *
 * So the route resolves wherever it is deployed, and the AUTHORIZATION IS UNCHANGED AND LIVES
 * WHERE IT ALWAYS DID — on the data, not on the route. `/api/admin/qa/financials-director` calls
 * `requireAdminOrOps()` on both GET and POST and `assertFinancialsReadAllowed` on GET, under its
 * own stated reason: being an internal QA tool is not a licence to read money more cheaply than
 * the product does.
 *
 * The consequence is deliberate and is the point. Without a session this page renders its frame
 * and heading and then reports that it cannot read the environment; no scenario, no fixture, no
 * balance and no household name reaches the browser, and no note or acceptance can be written.
 * Shell-less is a statement about CHROME. It is not a statement about authority.
 */
export const dynamic = "force-dynamic";

export const metadata = { title: "Core Financials Director QA" };

export default function CoreFinancialsQaPage() {
    return <CoreFinancialsQaReader />;
}
