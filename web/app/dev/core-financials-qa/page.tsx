import { notFound } from "next/navigation";

import { classifyPublicRuntime, isHostedRuntime } from "@/lib/publicAppUrl";

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
 * model rather than inventing a second one — a `/dev` route outside the operator shell, gated on
 * where it is RUNNING, with the product opened deliberately in its own tab.
 *
 * ── WHAT IS SHARED, AND WHAT IS NOT ────────────────────────────────────────────────────────────
 *
 * The presentation changed; the truth did not. Scenarios still come from
 * `lib/qa/financialsDirectorQa/scenarioCatalog`, and readiness and acceptance still come from
 * `/api/admin/qa/financials-director`, which reads money through `buildFinancialsCardVM` and writes
 * only its own table. There is one scenario catalog and one financial read authority; this route is
 * a different window onto them, never a second opinion.
 *
 * ── LOCAL BY CONSTRUCTION ──────────────────────────────────────────────────────────────────────
 *
 * Gated on the RUNTIME rather than on `NODE_ENV`, for the reason Enrollment already discovered: a
 * QA server is deliberately a production BUILD, so a `NODE_ENV` check would 404 the page on the one
 * server it is meant to be read beside. `classifyPublicRuntime` draws the line that actually
 * matters — a Vercel production or preview deployment is hosted; a developer machine is not.
 */
export const dynamic = "force-dynamic";

export const metadata = { title: "Core Financials Director QA" };

export default function CoreFinancialsQaPage() {
    if (isHostedRuntime(classifyPublicRuntime())) {
        notFound();
    }
    return <CoreFinancialsQaReader />;
}
