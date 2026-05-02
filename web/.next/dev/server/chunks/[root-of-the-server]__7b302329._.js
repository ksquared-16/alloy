module.exports = [
"[externals]/next/dist/compiled/next-server/app-route-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-route-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/@opentelemetry/api [external] (next/dist/compiled/@opentelemetry/api, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/@opentelemetry/api", () => require("next/dist/compiled/@opentelemetry/api"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/next-server/app-page-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-page-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-unit-async-storage.external.js [external] (next/dist/server/app-render/work-unit-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-unit-async-storage.external.js", () => require("next/dist/server/app-render/work-unit-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-async-storage.external.js [external] (next/dist/server/app-render/work-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-async-storage.external.js", () => require("next/dist/server/app-render/work-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/shared/lib/no-fallback-error.external.js [external] (next/dist/shared/lib/no-fallback-error.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/shared/lib/no-fallback-error.external.js", () => require("next/dist/shared/lib/no-fallback-error.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/after-task-async-storage.external.js [external] (next/dist/server/app-render/after-task-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/after-task-async-storage.external.js", () => require("next/dist/server/app-render/after-task-async-storage.external.js"));

module.exports = mod;
}),
"[project]/lib/supabaseAdmin.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Supabase admin client for server-side operations.
 * Uses service role key to bypass RLS for admin operations.
 * DO NOT use this in client components - only server components and route handlers.
 */ __turbopack_context__.s([
    "createAdminClient",
    ()=>createAdminClient
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$supabase$2d$js$2f$dist$2f$index$2e$mjs__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/node_modules/@supabase/supabase-js/dist/index.mjs [app-route] (ecmascript) <locals>");
;
const getSupabaseUrl = ()=>{
    const url = (process.env.SUPABASE_URL?.trim() || ("TURBOPACK compile-time value", "https://ikaxilmwmrmbagoidedu.supabase.co")?.trim()) ?? "";
    if (!url) {
        throw new Error("Supabase URL is not set. Set SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL.");
    }
    return url;
};
const getSupabaseServiceRoleKey = ()=>{
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) {
        console.error("[createAdminClient] missing service role key");
        throw new Error("SUPABASE_SERVICE_ROLE_KEY environment variable is not set");
    }
    return key;
};
function createAdminClient() {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$supabase$2d$js$2f$dist$2f$index$2e$mjs__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__["createClient"])(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    });
}
}),
"[project]/lib/admin/assertRowOrg.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "assertRowOrg",
    ()=>assertRowOrg
]);
async function assertRowOrg(supabase, table, rowId, orgId, options) {
    const idCol = options?.idColumn ?? "id";
    const orgCol = options?.orgColumn ?? "org_id";
    const cols = options?.columns ?? idCol;
    const { data, error } = await supabase.from(table).select(cols).eq(idCol, rowId).eq(orgCol, orgId).maybeSingle();
    if (error) {
        console.error("[assertRowOrg]", table, error);
        return {
            ok: false
        };
    }
    if (!data) return {
        ok: false
    };
    return {
        ok: true
    };
}
}),
"[project]/lib/admin/primaryAdminOpsOrg.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "fetchPrimaryAdminOpsMembershipForUser",
    ()=>fetchPrimaryAdminOpsMembershipForUser
]);
const ADMIN_OPS_ROLES = [
    "admin",
    "ops"
];
async function fetchPrimaryAdminOpsMembershipForUser(admin, userId) {
    const { data, error } = await admin.from("user_roles").select("org_id, role").eq("user_id", userId).in("role", [
        ...ADMIN_OPS_ROLES
    ]).order("org_id", {
        ascending: true
    }).limit(1).maybeSingle();
    if (error) {
        console.error("[fetchPrimaryAdminOpsMembershipForUser] user_roles error:", error);
        return null;
    }
    const row = data;
    if (!row || typeof row.org_id !== "string" || !row.org_id || typeof row.role !== "string") {
        return null;
    }
    if (!ADMIN_OPS_ROLES.includes(row.role)) {
        return null;
    }
    return {
        orgId: row.org_id,
        role: row.role
    };
}
}),
"[project]/lib/supabase/auth-env.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Supabase Auth cookie names are derived from the project URL host.
 * The browser client can only use NEXT_PUBLIC_SUPABASE_URL — so middleware and
 * server RSC clients MUST use the same URL (prefer NEXT_PUBLIC_*) or they will
 * look for cookies under a different `sb-*-auth-token` prefix and see "no user".
 */ __turbopack_context__.s([
    "getSupabaseAnonKeyForAuth",
    ()=>getSupabaseAnonKeyForAuth,
    "getSupabaseUrlForAuth",
    ()=>getSupabaseUrlForAuth,
    "warnIfAuthSupabaseUrlMismatch",
    ()=>warnIfAuthSupabaseUrlMismatch
]);
function getSupabaseUrlForAuth() {
    const pub = ("TURBOPACK compile-time value", "https://ikaxilmwmrmbagoidedu.supabase.co")?.trim();
    const srv = process.env.SUPABASE_URL?.trim();
    return pub || srv;
}
function getSupabaseAnonKeyForAuth() {
    const pub = ("TURBOPACK compile-time value", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlrYXhpbG13bXJtYmFnb2lkZWR1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyOTAzNDgsImV4cCI6MjA4OTg2NjM0OH0.thNJQBUCVJDuyaMCsECK2cFEClBk1fE_fFz5v95d42c")?.trim();
    const srv = process.env.SUPABASE_ANON_KEY?.trim();
    return pub || srv;
}
function warnIfAuthSupabaseUrlMismatch() {
    const pub = ("TURBOPACK compile-time value", "https://ikaxilmwmrmbagoidedu.supabase.co")?.trim();
    const srv = process.env.SUPABASE_URL?.trim();
    if (pub && srv && pub !== srv) {
        console.warn("[supabase auth-env] NEXT_PUBLIC_SUPABASE_URL and SUPABASE_URL differ. Auth cookies are keyed from the URL the browser uses (NEXT_PUBLIC_*). Middleware/server auth should prefer NEXT_PUBLIC_* — see getSupabaseUrlForAuth().");
    }
}
}),
"[project]/lib/supabaseServer.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Supabase client for server-side operations (middleware, server components).
 * Uses the same URL/key priority as the browser for auth cookies (NEXT_PUBLIC_* first).
 * Do NOT use this in client components.
 */ __turbopack_context__.s([
    "createClient",
    ()=>createClient
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$ssr$2f$dist$2f$module$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/node_modules/@supabase/ssr/dist/module/index.js [app-route] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$ssr$2f$dist$2f$module$2f$createServerClient$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@supabase/ssr/dist/module/createServerClient.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$headers$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/headers.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabase$2f$auth$2d$env$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/supabase/auth-env.ts [app-route] (ecmascript)");
;
;
;
async function createClient() {
    const cookieStore = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$headers$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["cookies"])();
    const supabaseUrl = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabase$2f$auth$2d$env$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["getSupabaseUrlForAuth"])();
    const supabaseAnonKey = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabase$2f$auth$2d$env$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["getSupabaseAnonKeyForAuth"])();
    if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error("Missing Supabase environment variables. Required: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_URL and SUPABASE_ANON_KEY)");
    }
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$ssr$2f$dist$2f$module$2f$createServerClient$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["createServerClient"])(supabaseUrl, supabaseAnonKey, {
        cookies: {
            getAll () {
                return cookieStore.getAll();
            },
            setAll (cookiesToSet) {
                try {
                    cookiesToSet.forEach(({ name, value, options })=>cookieStore.set(name, value, options));
                } catch  {
                // The `setAll` method was called from a Server Component.
                // This can be ignored if you have middleware refreshing
                // user sessions.
                }
            }
        }
    });
}
}),
"[project]/lib/admin/cachedAuthSession.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "getCachedAuthUser",
    ()=>getCachedAuthUser,
    "getCachedAuthUserId",
    ()=>getCachedAuthUserId
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/rsc/react.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabaseServer$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/supabaseServer.ts [app-route] (ecmascript)");
;
;
const getCachedAuthUserId = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["cache"])(async ()=>{
    try {
        const supabase = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabaseServer$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["createClient"])();
        const claimsRes = await supabase.auth.getClaims();
        if (!claimsRes.error && claimsRes.data?.claims) {
            const sub = claimsRes.data.claims.sub;
            if (typeof sub === "string" && sub.length > 0) {
                return sub;
            }
        }
        const { data: authData, error: userErr } = await supabase.auth.getUser();
        if (userErr) {
            console.error("[getCachedAuthUserId] auth.getUser error:", userErr);
        }
        const uid = authData?.user?.id;
        return typeof uid === "string" && uid.length > 0 ? uid : null;
    } catch (e) {
        console.error("[getCachedAuthUserId] unexpected:", e);
        return null;
    }
});
const getCachedAuthUser = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["cache"])(async ()=>{
    try {
        const supabase = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabaseServer$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["createClient"])();
        const { data: authData, error } = await supabase.auth.getUser();
        if (error) {
            console.error("[getCachedAuthUser] auth.getUser error:", error);
            return null;
        }
        return authData?.user ?? null;
    } catch (e) {
        console.error("[getCachedAuthUser] unexpected:", e);
        return null;
    }
});
}),
"[project]/lib/admin/getAdminContext.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Resolve admin org context from public.user_roles (membership scoping).
 * Use in admin API routes that need org_id and role.
 *
 * Request-scoped memoization: `getAdminContext` and `getAdminContextCached` are the same
 * function — React `cache()` dedupes work within a single request (no cross-request leakage).
 */ __turbopack_context__.s([
    "adminContextFailureResponse",
    ()=>adminContextFailureResponse,
    "getAdminContext",
    ()=>getAdminContext,
    "getAdminContextCached",
    ()=>getAdminContextCached
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/rsc/react.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/server.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabaseAdmin$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/supabaseAdmin.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$primaryAdminOpsOrg$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/primaryAdminOpsOrg.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$cachedAuthSession$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/cachedAuthSession.ts [app-route] (ecmascript)");
;
;
;
;
;
async function loadAdminContext() {
    try {
        const t0 = Date.now();
        const userId = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$cachedAuthSession$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["getCachedAuthUserId"])();
        const authMs = Date.now() - t0;
        if (!userId) {
            return {
                ok: false,
                status: 401
            };
        }
        const t1 = Date.now();
        const admin = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabaseAdmin$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["createAdminClient"])();
        const membership = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$primaryAdminOpsOrg$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["fetchPrimaryAdminOpsMembershipForUser"])(admin, userId);
        const membershipMs = Date.now() - t1;
        if (!membership) {
            if (authMs + membershipMs > 400) {
                console.warn("[admin-context-perf] getAdminContext (no membership)", {
                    auth_claims_or_user_ms: authMs,
                    membership_ms: membershipMs
                });
            }
            return {
                ok: false,
                status: 403
            };
        }
        const totalMs = Date.now() - t0;
        if (totalMs > 400) {
            console.warn("[admin-context-perf] getAdminContext", {
                auth_claims_or_user_ms: authMs,
                user_roles_membership_ms: membershipMs,
                total_ms: totalMs
            });
        }
        return {
            ok: true,
            orgId: membership.orgId,
            role: membership.role,
            userId
        };
    } catch (e) {
        console.error("[getAdminContext] unexpected:", e);
        return {
            ok: false,
            status: 403
        };
    }
}
const resolveAdminContextOnce = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["cache"])(async ()=>{
    const t0 = Date.now();
    const result = await loadAdminContext();
    console.log("[admin-context]", {
        cache_hit: false,
        duration_ms: Date.now() - t0
    });
    return result;
});
const adminContextInvocationCounter = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["cache"])(()=>({
        n: 0
    }));
async function getAdminContextCached() {
    const ctr = adminContextInvocationCounter();
    ctr.n += 1;
    const out = await resolveAdminContextOnce();
    if (ctr.n > 1) {
        console.log("[admin-context]", {
            cache_hit: true,
            duration_ms: 0
        });
    }
    return out;
}
const getAdminContext = getAdminContextCached;
function adminContextFailureResponse(failure) {
    const message = failure.status === 401 ? "Unauthorized" : "Forbidden";
    return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
        error: message
    }, {
        status: failure.status
    });
}
}),
"[project]/lib/admin/activitySignals.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Activity Signals V1 — derived from workflow_events + org config (metadata.activity_signal_rules).
 * No persisted derived state; no hardcoded thresholds.
 */ __turbopack_context__.s([
    "enrichOpportunityQueueRowsWithActivitySignals",
    ()=>enrichOpportunityQueueRowsWithActivitySignals,
    "fetchLatestWorkflowEventByOpportunityId",
    ()=>fetchLatestWorkflowEventByOpportunityId,
    "formatActivityRelativeShort",
    ()=>formatActivityRelativeShort,
    "getActivitySignalForEntity",
    ()=>getActivitySignalForEntity,
    "parseActivitySignalRulesFromMetadata",
    ()=>parseActivitySignalRulesFromMetadata,
    "resolveActivitySignalRules",
    ()=>resolveActivitySignalRules,
    "summarizeWorkflowEventForSignal",
    ()=>summarizeWorkflowEventForSignal
]);
function normalizeRulesEntityType(raw) {
    const s = raw.trim().toLowerCase();
    if (s === "opportunity") return "opportunities";
    return s;
}
function resolveActivitySignalRules(workUnitMetadata, departmentMetadata) {
    const fromWu = parseActivitySignalRulesFromMetadata(workUnitMetadata);
    if (fromWu?.length) return fromWu;
    return parseActivitySignalRulesFromMetadata(departmentMetadata);
}
function parseActivitySignalRulesFromMetadata(metadata) {
    if (!metadata || typeof metadata !== "object") return null;
    const root = metadata;
    const raw = root.activity_signal_rules;
    if (!Array.isArray(raw) || raw.length === 0) return null;
    const out = [];
    for (const entry of raw){
        if (!entry || typeof entry !== "object") continue;
        const o = entry;
        const key = typeof o.key === "string" ? o.key.trim() : "";
        const entity_type = typeof o.entity_type === "string" ? o.entity_type.trim() : "";
        const label = typeof o.label === "string" ? o.label.trim() : "";
        const thresholdRaw = o.threshold_minutes;
        const threshold_minutes = typeof thresholdRaw === "number" && Number.isFinite(thresholdRaw) ? thresholdRaw : NaN;
        const severity = o.severity;
        if (!key || !entity_type || !label) continue;
        if (![
            "low",
            "medium",
            "high"
        ].includes(String(severity))) continue;
        if (!(threshold_minutes >= 0)) continue;
        let status_keys;
        if (Array.isArray(o.status_keys)) {
            const sk = o.status_keys.filter((x)=>typeof x === "string").map((x)=>x.trim()).filter(Boolean);
            if (sk.length) status_keys = sk;
        }
        out.push({
            key,
            entity_type,
            status_keys,
            threshold_minutes,
            severity: severity,
            label
        });
    }
    return out.length ? out : null;
}
function summarizeWorkflowEventForSignal(ev) {
    const t = (ev.event_type ?? "").trim();
    const p = ev.payload && typeof ev.payload === "object" ? ev.payload : {};
    if (t === "message_received") return "SMS received";
    if (t === "message_sent") return "SMS sent";
    if (t === "opportunity_status_changed" || t === "entity_status_changed") {
        const o = p.old_status_key != null ? String(p.old_status_key) : "—";
        const n = p.new_status_key != null ? String(p.new_status_key) : "—";
        return `Status: ${o} → ${n}`;
    }
    if (t === "note_added") return "Note added";
    if (t === "action_executed") {
        const k = p.action_key != null ? String(p.action_key) : "";
        return k ? `Action: ${k}` : "Action executed";
    }
    return t || "Activity";
}
function formatActivityRelativeShort(iso, nowMs) {
    if (!iso) return null;
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return null;
    const diffMs = Math.max(0, nowMs - t);
    const s = Math.floor(diffMs / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    const d = Math.floor(h / 24);
    if (d > 0) return `${d}d ago`;
    if (h > 0) return `${h}h ago`;
    if (m > 0) return `${m}m ago`;
    return "just now";
}
function getActivitySignalForEntity(input) {
    const nowMs = input.nowMs ?? Date.now();
    const sorted = [
        ...input.events
    ].sort((a, b)=>Date.parse(b.occurred_at) - Date.parse(a.occurred_at));
    const latest = sorted[0] ?? null;
    const last_activity_at = latest?.occurred_at ?? null;
    const last_activity_type = latest?.event_type ?? null;
    const last_activity_summary = latest ? summarizeWorkflowEventForSignal(latest) : null;
    const rules = input.rules;
    if (!rules?.length || !last_activity_at) {
        return {
            last_activity_at,
            last_activity_type,
            last_activity_summary,
            stale_signal: null
        };
    }
    const eventMs = Date.parse(last_activity_at);
    if (!Number.isFinite(eventMs)) {
        return {
            last_activity_at,
            last_activity_type,
            last_activity_summary,
            stale_signal: null
        };
    }
    const ageMinutes = (nowMs - eventMs) / 60_000;
    const sk = input.entity.status_key != null ? String(input.entity.status_key).trim() : "";
    for (const rule of rules){
        if (normalizeRulesEntityType(rule.entity_type) !== "opportunities") continue;
        const allowStatuses = rule.status_keys;
        if (allowStatuses?.length) {
            if (!allowStatuses.includes(sk)) continue;
        }
        if (ageMinutes > rule.threshold_minutes) {
            return {
                last_activity_at,
                last_activity_type,
                last_activity_summary,
                stale_signal: {
                    key: rule.key,
                    label: rule.label,
                    severity: rule.severity,
                    threshold_minutes: rule.threshold_minutes
                }
            };
        }
    }
    return {
        last_activity_at,
        last_activity_type,
        last_activity_summary,
        stale_signal: null
    };
}
function collapseLatestEventPerEntity(rows) {
    const m = new Map();
    for (const row of rows){
        const id = row.entity_id != null ? String(row.entity_id).trim() : "";
        if (!id || m.has(id)) continue;
        m.set(id, row);
    }
    return m;
}
function mergeLatestMaps(a, b) {
    for (const [id, row] of b){
        const existing = a.get(id);
        if (!existing) {
            a.set(id, row);
            continue;
        }
        if (Date.parse(row.occurred_at) > Date.parse(existing.occurred_at)) {
            a.set(id, row);
        }
    }
}
async function fetchLatestWorkflowEventByOpportunityId(supabase, orgId, opportunityIds) {
    const unique = [
        ...new Set(opportunityIds.map((x)=>String(x).trim()).filter(Boolean))
    ];
    const latest = new Map();
    if (!unique.length) return latest;
    const chunkSize = 80;
    for(let i = 0; i < unique.length; i += chunkSize){
        const chunk = unique.slice(i, i + chunkSize);
        const limit = Math.min(6000, Math.max(200, chunk.length * 40));
        const { data, error } = await supabase.from("workflow_events").select("occurred_at, event_type, entity_id, payload").eq("org_id", orgId).eq("entity_type", "opportunities").in("entity_id", chunk).order("occurred_at", {
            ascending: false
        }).limit(limit);
        if (error) {
            throw new Error(`fetchLatestWorkflowEventByOpportunityId: ${error.message}`);
        }
        const rows = data ?? [];
        mergeLatestMaps(latest, collapseLatestEventPerEntity(rows));
    }
    return latest;
}
async function enrichOpportunityQueueRowsWithActivitySignals(params) {
    const rules = resolveActivitySignalRules(params.workUnitMetadata, params.departmentMetadata);
    const ids = params.rows.map((r)=>r.id);
    let latestById = new Map();
    try {
        latestById = await fetchLatestWorkflowEventByOpportunityId(params.supabase, params.orgId, ids);
    } catch  {
        latestById = new Map();
    }
    const nowMs = params.nowMs ?? Date.now();
    return params.rows.map((row)=>{
        const ev = latestById.get(row.id);
        const events = ev ? [
            ev
        ] : [];
        const sig = getActivitySignalForEntity({
            events,
            entity: {
                id: row.id,
                status_key: row.status_key
            },
            rules,
            nowMs
        });
        return {
            ...row,
            last_activity_at: sig.last_activity_at,
            last_activity_type: sig.last_activity_type,
            last_activity_summary: sig.last_activity_summary,
            stale_signal: sig.stale_signal
        };
    });
}
}),
"[project]/app/api/admin/opportunities/[id]/activity-signal/route.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "GET",
    ()=>GET
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/server.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabaseAdmin$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/supabaseAdmin.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$assertRowOrg$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/assertRowOrg.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$getAdminContext$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/getAdminContext.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$activitySignals$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/activitySignals.ts [app-route] (ecmascript)");
;
;
;
;
;
function trimOrEmpty(v) {
    return v != null && String(v).trim() !== "" ? String(v).trim() : "";
}
async function GET(_request, context) {
    const ctx = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$getAdminContext$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["getAdminContextCached"])();
    if (!ctx.ok) return (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$getAdminContext$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["adminContextFailureResponse"])(ctx);
    const { id: opportunityId } = await context.params;
    if (!trimOrEmpty(opportunityId)) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: "Missing opportunity id"
        }, {
            status: 400
        });
    }
    const supabase = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabaseAdmin$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["createAdminClient"])();
    if (!(await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$assertRowOrg$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["assertRowOrg"])(supabase, "opportunities", opportunityId, ctx.orgId)).ok) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: "Not found"
        }, {
            status: 404
        });
    }
    const { data: opp, error: oppErr } = await supabase.from("opportunities").select("id, status_key, status, work_unit_id").eq("id", opportunityId).eq("org_id", ctx.orgId).maybeSingle();
    if (oppErr || !opp) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: oppErr?.message ?? "Not found"
        }, {
            status: 404
        });
    }
    const row = opp;
    const statusKey = trimOrEmpty(row.status_key) || trimOrEmpty(row.status) || "";
    let workUnitMetadata = null;
    let departmentMetadata = null;
    const wuid = trimOrEmpty(row.work_unit_id);
    if (wuid) {
        const { data: wu } = await supabase.from("work_units").select("metadata, department_id").eq("id", wuid).eq("org_id", ctx.orgId).maybeSingle();
        workUnitMetadata = wu?.metadata ?? null;
        const deptId = trimOrEmpty(wu?.department_id);
        if (deptId) {
            const { data: deptRow } = await supabase.from("departments").select("metadata").eq("id", deptId).eq("org_id", ctx.orgId).maybeSingle();
            departmentMetadata = deptRow?.metadata ?? null;
        }
    }
    const rules = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$activitySignals$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["resolveActivitySignalRules"])(workUnitMetadata, departmentMetadata);
    let latestById;
    try {
        latestById = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$activitySignals$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["fetchLatestWorkflowEventByOpportunityId"])(supabase, ctx.orgId, [
            opportunityId
        ]);
    } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to load workflow events";
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: msg
        }, {
            status: 500
        });
    }
    const ev = latestById.get(opportunityId);
    const events = ev ? [
        ev
    ] : [];
    const sig = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$activitySignals$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["getActivitySignalForEntity"])({
        events,
        entity: {
            id: opportunityId,
            status_key: statusKey || null
        },
        rules
    });
    return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json(sig);
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__7b302329._.js.map