import DirectorQaClient from "./DirectorQaClient";

/**
 * CORE FINANCIALS — DIRECTOR QA.
 *
 * Reached at /admin/system/qa/core-financials, through the existing `/admin/:path*` rewrite into
 * this shell — no new route family, no second application, and no parallel authentication: the
 * adminV2 layout above this page already refuses anyone without a session and a role.
 *
 * The page itself holds no state and no financial logic. Everything it shows is resolved live by
 * /api/admin/qa/financials-director, which reads money through the canonical Financials reader and
 * writes only the Director's own testimony.
 */
export const dynamic = "force-dynamic";

export default function CoreFinancialsDirectorQaPage() {
    return <DirectorQaClient />;
}
