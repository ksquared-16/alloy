import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const ROOT = '/Users/vacilando/Code/alloy-worktrees/documentation-api';
const inv = JSON.parse(readFileSync(`${ROOT}/docs/api/api-inventory.json`, 'utf8'));
const R = Array.isArray(inv) ? inv : (inv.routes || inv.rows);

// Which paths does the OpenAPI spec actually cover?
const spec = readFileSync(`${ROOT}/docs/api/openapi/alloy-api.v0.yaml`, 'utf8');
const normPath = s => s.replace(/[{\[]([^}\]]+)[}\]]/g, ":p");
// Next.js writes [id]; OpenAPI writes {id}. Normalize both or the coverage count lies.
const specPaths = new Set(
  spec.split('\n').filter(l => /^  \/api\//.test(l)).map(l => normPath(l.trim().replace(/:$/, '')))
);

// Objective classification criteria. Each route gets exactly one class, decided in order.
// EXTERNAL_READY is deliberately the hardest to earn: authentication alone never qualifies.
function classify(r) {
  const p = r.apiPath, auth = r.auth || [];
  if (auth.includes('provider-signature') || /^\/api\/(webhooks|stripe)\//.test(p))
    return ['PROVIDER_INGRESS', 'signed provider callback'];
  if (/^\/api\/public\/kiosk\//.test(p))
    return ['DEVICE_MACHINE', 'device credential, org+site read off the resolved row'];
  if (/^\/api\/(public\/(forms|tour-booking)|action|action-links)\//.test(p))
    return ['PARTICIPANT_PUBLIC', 'opaque participant token'];
  // Thread 5 B.2 — the public contract surface. Not internal transport, and not
  // a participant token: an application principal whose organization is read from
  // its installation. Its coverage is guarded by the PUBLIC spec and
  // web/tests/platform/external/openApiDriftGuard.test.ts, not by the internal
  // v0 artifact this generator measures, which is why `inSpec` below stays false
  // for it and it does not claim EXTERNAL_READY here.
  if (/^\/api\/v1\//.test(p))
    return ['EXTERNAL_PUBLIC_V1', 'public contract, application principal, org from installation'];
  if (auth.includes('cron-token'))
    return ['INTERNAL_ONLY', 'shared global cron secret'];
  if (r.stability === 'experimental')
    return ['INTERNAL_ONLY', 'experimental'];
  if (auth.includes('re-export') || /\/dev\//.test(p))
    return ['COMPATIBILITY', 're-export or dev utility'];
  if (auth.length === 0)
    return ['UNCLASSIFIED_NO_AUTH', 'no auth pattern detected — priority review'];
  // Everything session-gated is internal transport by default.
  const sessionGated = auth.some(a => /admin|route-gate|access-scope|users-roles|analytics|scoped|bos/.test(a));
  if (sessionGated) {
    const inSpec = specPaths.has(normPath(p));
    const validated = r.validation === 'schema' || r.validation === 'zod';
    if (inSpec && validated) return ['PLATFORM_INTERNAL_STABLE', 'in OpenAPI + schema-validated'];
    return ['INTERNAL_ONLY', 'browser session transport'];
  }
  if (auth.includes('token') || auth.includes('public-org'))
    return ['PARTICIPANT_PUBLIC', 'token-scoped'];
  return ['UNCLASSIFIED_NO_AUTH', 'auth pattern not recognised'];
}

// EXTERNAL_READY requires ALL of these. Applied as a separate test so the count is meaningful.
function externalReady(r, cls) {
  const auth = r.auth || [];
  const nonSession = !auth.some(a => /admin|route-gate|access-scope|users-roles|analytics|scoped|bos/.test(a));
  const orgFromCredential = cls === 'DEVICE_MACHINE' || cls === 'PROVIDER_INGRESS';
  const validated = r.validation === 'schema' || r.validation === 'zod';
  const inSpec = specPaths.has(normPath(r.apiPath));
  const idempotentIfMutating = !r.writes; // no route declares an Idempotency-Key convention
  const checks = { nonSession, orgFromCredential, validated, inSpec, idempotentIfMutating };
  return { ready: Object.values(checks).every(Boolean), checks };
}

const out = R.map(r => {
  const [cls, why] = classify(r);
  const er = externalReady(r, cls);
  return {
    apiPath: r.apiPath, file: r.file, methods: r.methods,
    domain: r.domain, stability: r.stability,
    auth: r.auth, validation: r.validation, serviceRole: r.serviceRole,
    writes: r.writes, events: r.events, tables: r.tables, rpcs: r.rpcs,
    classification: cls, classificationBasis: why,
    inOpenApi: specPaths.has(normPath(r.apiPath)),
    externalReady: er.ready, externalReadyChecks: er.checks,
  };
});

writeFileSync(process.argv[2], JSON.stringify(out, null, 1));

const tally = f => { const m = {}; for (const r of out) m[f(r)] = (m[f(r)] || 0) + 1; return Object.entries(m).sort((a,b)=>b[1]-a[1]); };
console.log('total routes:', out.length);
console.log('\n=== CLASSIFICATION ===');
tally(r => r.classification).forEach(([k,v]) => console.log(String(v).padStart(4), k));
console.log('\n=== EXTERNAL_READY ===');
console.log('  routes passing every gate:', out.filter(r => r.externalReady).length);
console.log('  in OpenAPI:', out.filter(r => r.inOpenApi).length);
console.log('\n=== writes by classification ===');
const wm = {}; for (const r of out) if (r.writes) wm[r.classification] = (wm[r.classification]||0)+1;
Object.entries(wm).sort((a,b)=>b[1]-a[1]).forEach(([k,v]) => console.log(String(v).padStart(4), k));
