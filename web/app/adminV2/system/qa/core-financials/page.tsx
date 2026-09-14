import DirectorQaClient from "./DirectorQaClient";

/**
 * CORE FINANCIALS — DIRECTOR QA.
 *
 * Reached at /workspace/qa/core-financials, rewritten to this implementation in next.config.ts.
 *
 * WHY THERE AND NOT UNDER /admin. `/workspace` is CANONICAL_OPERATOR_BASE: the middleware's
 * operator gate protects everything beneath it and nothing redirects it away. The `/admin/*`
 * family is retired — `legacyAdminRedirectTarget` sends every path under it to a canonical
 * surface — so a page there is unreachable whatever it renders. That was proven on the hosted
 * route rather than assumed. No new route family, no second application, and no parallel
 * authentication: the adminV2 layout above this page already refuses anyone without a session
 * and a role.
 *
 * The page itself holds no state and no financial logic. Everything it shows is resolved live by
 * /api/admin/qa/financials-director, which reads money through the canonical Financials reader and
 * writes only the Director's own testimony.
 */
export const dynamic = "force-dynamic";

export default function CoreFinancialsDirectorQaPage() {
    return <DirectorQaClient />;
}
