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
"[project]/lib/kpi/registry.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "getMetricDefinition",
    ()=>getMetricDefinition,
    "isKnownMetricKey",
    ()=>isKnownMetricKey,
    "listMetricDefinitions",
    ()=>listMetricDefinitions,
    "metricFormatUnitLabel",
    ()=>metricFormatUnitLabel,
    "validateMetricForSurface",
    ()=>validateMetricForSurface
]);
const DEFINITIONS = {
    "org.structure.departments_count": {
        key: "org.structure.departments_count",
        family: "S",
        allowedSurfaces: [
            "workspace"
        ],
        defaultLabel: "Departments",
        defaultLane: "business",
        defaultFormat: "count"
    },
    "org.structure.work_units_count": {
        key: "org.structure.work_units_count",
        family: "S",
        allowedSurfaces: [
            "workspace"
        ],
        defaultLabel: "Work units",
        defaultLane: "business",
        defaultFormat: "count"
    },
    "org.pipeline.active_in_motion": {
        key: "org.pipeline.active_in_motion",
        family: "R",
        allowedSurfaces: [
            "workspace"
        ],
        defaultLabel: "Active pipeline",
        defaultLane: "business",
        defaultFormat: "count"
    },
    "org.pipeline.pipeline_value_open": {
        key: "org.pipeline.pipeline_value_open",
        family: "R",
        allowedSurfaces: [
            "workspace"
        ],
        defaultLabel: "Pipeline value",
        defaultLane: "business",
        defaultFormat: "currency"
    },
    "org.pipeline.closed_outcomes": {
        key: "org.pipeline.closed_outcomes",
        family: "R",
        allowedSurfaces: [
            "workspace"
        ],
        defaultLabel: "Closed outcomes",
        defaultLane: "business",
        defaultFormat: "count"
    },
    "ctx.workspace.total_in_scope": {
        key: "ctx.workspace.total_in_scope",
        family: "L",
        allowedSurfaces: [
            "workspace"
        ],
        defaultLabel: "Opportunities in pipeline scope",
        defaultLane: "business",
        defaultFormat: "count"
    },
    "dept.wu_queue.total_per_work_unit": {
        key: "dept.wu_queue.total_per_work_unit",
        family: "Q",
        allowedSurfaces: [
            "department"
        ],
        defaultLabel: "Work unit",
        defaultLane: "business",
        defaultFormat: "count"
    },
    "ctx.dept.total_in_scope": {
        key: "ctx.dept.total_in_scope",
        family: "Q",
        allowedSurfaces: [
            "department"
        ],
        defaultLabel: "Total in department",
        defaultLane: "business",
        defaultFormat: "count"
    },
    "ctx.dept.queue_total": {
        key: "ctx.dept.queue_total",
        family: "Q",
        allowedSurfaces: [
            "department"
        ],
        defaultLabel: "Queue heads (dept)",
        defaultLane: "business",
        defaultFormat: "count"
    },
    "ctx.dept.needs_attention_count": {
        key: "ctx.dept.needs_attention_count",
        family: "Q",
        allowedSurfaces: [
            "department"
        ],
        defaultLabel: "Needs attention",
        defaultLane: "business",
        defaultFormat: "count"
    },
    "wu.queue.selected_tab_count": {
        key: "wu.queue.selected_tab_count",
        family: "Q",
        allowedSurfaces: [
            "work_unit"
        ],
        defaultLabel: "Selected queue",
        defaultLane: "business",
        defaultFormat: "count"
    },
    "wu.queue.primary_lane_total": {
        key: "wu.queue.primary_lane_total",
        family: "Q",
        allowedSurfaces: [
            "work_unit"
        ],
        defaultLabel: "Primary lane",
        defaultLane: "business",
        defaultFormat: "count"
    },
    "ctx.wu.total_in_queue": {
        key: "ctx.wu.total_in_queue",
        family: "Q",
        allowedSurfaces: [
            "work_unit"
        ],
        defaultLabel: "All queues total",
        defaultLane: "business",
        defaultFormat: "count"
    },
    "ctx.wu.selected_queue_count": {
        key: "ctx.wu.selected_queue_count",
        family: "Q",
        allowedSurfaces: [
            "work_unit"
        ],
        defaultLabel: "This queue",
        defaultLane: "business",
        defaultFormat: "count"
    },
    "ctx.wu.primary_lane_total": {
        key: "ctx.wu.primary_lane_total",
        family: "Q",
        allowedSurfaces: [
            "work_unit"
        ],
        defaultLabel: "First lane total",
        defaultLane: "business",
        defaultFormat: "count"
    },
    "ctx.wu.needs_attention_count": {
        key: "ctx.wu.needs_attention_count",
        family: "Q",
        allowedSurfaces: [
            "work_unit"
        ],
        defaultLabel: "Needs attention",
        defaultLane: "business",
        defaultFormat: "count"
    }
};
const KEYS = new Set(Object.keys(DEFINITIONS));
function isKnownMetricKey(key) {
    return KEYS.has(key);
}
function getMetricDefinition(key) {
    return DEFINITIONS[key];
}
function validateMetricForSurface(key, surface) {
    return getMetricDefinition(key).allowedSurfaces.includes(surface);
}
function listMetricDefinitions() {
    return Object.freeze(Object.values(DEFINITIONS));
}
function metricFormatUnitLabel(format) {
    switch(format){
        case "count":
            return "Count";
        case "currency":
            return "Currency";
        case "percent":
            return "Percent";
        case "duration":
            return "Duration";
        case "text":
            return "Text";
        default:
            return "—";
    }
}
}),
"[project]/lib/kpi/placementMutationValidation.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "PlacementValidationError",
    ()=>PlacementValidationError,
    "validatePlacementCreateBody",
    ()=>validatePlacementCreateBody,
    "validatePlacementPatchBody",
    ()=>validatePlacementPatchBody
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$kpi$2f$registry$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/kpi/registry.ts [app-route] (ecmascript)");
;
const LABEL_OVERRIDE_MAX = 160;
class PlacementValidationError extends Error {
    status;
    constructor(status, message){
        super(message);
        this.name = "PlacementValidationError";
        this.status = status;
    }
}
function normalizeUuid(raw) {
    const t = typeof raw === "string" ? raw.trim() : "";
    return t.length ? t : null;
}
function normalizeLabelOverride(raw) {
    if (raw == null) return null;
    const t = raw.trim();
    if (!t) return null;
    if (t.length > LABEL_OVERRIDE_MAX) {
        throw new PlacementValidationError(400, `label_override exceeds ${LABEL_OVERRIDE_MAX} characters`);
    }
    return t;
}
function assertScope(surface, departmentId, workUnitId) {
    if (surface === "workspace") {
        if (departmentId != null || workUnitId != null) {
            throw new PlacementValidationError(400, "workspace placements must not set department_id or work_unit_id");
        }
        return;
    }
    if (surface === "department") {
        if (!departmentId) throw new PlacementValidationError(400, "department_id required for surface=department");
        if (workUnitId != null) throw new PlacementValidationError(400, "department placements must not set work_unit_id");
        return;
    }
    if (surface === "work_unit") {
        if (!departmentId || !workUnitId) {
            throw new PlacementValidationError(400, "department_id and work_unit_id required for surface=work_unit");
        }
    }
}
function validatePlacementCreateBody(body) {
    const surface = body.surface;
    if (surface !== "workspace" && surface !== "department" && surface !== "work_unit") {
        throw new PlacementValidationError(400, "Invalid surface");
    }
    const metricRaw = typeof body.metric_key === "string" ? body.metric_key.trim() : "";
    if (!metricRaw) throw new PlacementValidationError(400, "metric_key required");
    if (!(0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$kpi$2f$registry$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["isKnownMetricKey"])(metricRaw)) {
        throw new PlacementValidationError(400, "Unknown metric_key — must be a registry key");
    }
    const metric_key = metricRaw;
    if (!(0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$kpi$2f$registry$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["validateMetricForSurface"])(metric_key, surface)) {
        throw new PlacementValidationError(400, `metric_key is not allowed on surface ${surface}`);
    }
    const department_id = normalizeUuid(body.department_id ?? null);
    const work_unit_id = normalizeUuid(body.work_unit_id ?? null);
    assertScope(surface, department_id, work_unit_id);
    const display_order = typeof body.display_order === "number" && Number.isFinite(body.display_order) ? Math.trunc(body.display_order) : 0;
    const label_override = normalizeLabelOverride(body.label_override);
    return {
        surface,
        metric_key,
        display_order,
        label_override,
        department_id,
        work_unit_id
    };
}
function validatePlacementPatchBody(body) {
    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!id) throw new PlacementValidationError(400, "id required");
    const hasVisible = typeof body.is_visible === "boolean";
    const hasOrder = typeof body.display_order === "number" && Number.isFinite(body.display_order);
    const hasLabel = body.label_override !== undefined;
    if (!hasVisible && !hasOrder && !hasLabel) {
        throw new PlacementValidationError(400, "At least one of is_visible, display_order, label_override required");
    }
    let label_override;
    if (hasLabel) {
        label_override = normalizeLabelOverride(body.label_override);
    }
    return {
        id,
        is_visible: hasVisible ? body.is_visible : undefined,
        display_order: hasOrder ? Math.trunc(body.display_order) : undefined,
        label_override
    };
}
}),
"[project]/app/api/admin/workspace-kpi-placements/route.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "DELETE",
    ()=>DELETE,
    "GET",
    ()=>GET,
    "PATCH",
    ()=>PATCH,
    "POST",
    ()=>POST,
    "dynamic",
    ()=>dynamic
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/server.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabaseAdmin$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/supabaseAdmin.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$assertRowOrg$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/assertRowOrg.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$getAdminContext$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/getAdminContext.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$kpi$2f$placementMutationValidation$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/kpi/placementMutationValidation.ts [app-route] (ecmascript)");
;
;
;
;
;
const dynamic = "force-dynamic";
const SELECT_COLS = "id, org_id, surface, department_id, work_unit_id, metric_key, display_order, is_visible, label_override, format_override, lane_override, metadata, created_at, updated_at";
async function GET(request) {
    const ctx = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$getAdminContext$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["getAdminContextCached"])();
    if (!ctx.ok) return (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$getAdminContext$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["adminContextFailureResponse"])(ctx);
    const listOrg = request.nextUrl.searchParams.get("list")?.trim() === "org";
    if (listOrg) {
        if (ctx.role !== "admin") {
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                error: "Forbidden"
            }, {
                status: 403
            });
        }
        const supabase = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabaseAdmin$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["createAdminClient"])();
        const { data, error } = await supabase.from("workspace_kpi_placement").select(SELECT_COLS).eq("org_id", ctx.orgId).order("display_order", {
            ascending: true
        }).order("metric_key", {
            ascending: true
        });
        if (error) {
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                error: error.message
            }, {
                status: 500
            });
        }
        const items = data ?? [];
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            items
        });
    }
    const surface = (request.nextUrl.searchParams.get("surface") ?? "").trim().toLowerCase();
    const departmentId = (request.nextUrl.searchParams.get("department_id") ?? "").trim();
    const workUnitId = (request.nextUrl.searchParams.get("work_unit_id") ?? "").trim();
    if (surface !== "workspace" && surface !== "department" && surface !== "work_unit") {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: "Invalid surface"
        }, {
            status: 400
        });
    }
    if (surface === "department" && !departmentId) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: "department_id required for surface=department"
        }, {
            status: 400
        });
    }
    if (surface === "work_unit" && (!departmentId || !workUnitId)) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: "department_id and work_unit_id required for surface=work_unit"
        }, {
            status: 400
        });
    }
    if (surface === "workspace" && (departmentId || workUnitId)) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: "workspace surface must not include department_id or work_unit_id"
        }, {
            status: 400
        });
    }
    const supabase = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabaseAdmin$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["createAdminClient"])();
    let countBuilder = supabase.from("workspace_kpi_placement").select("id", {
        count: "exact",
        head: true
    }).eq("org_id", ctx.orgId).eq("surface", surface);
    let q = supabase.from("workspace_kpi_placement").select(SELECT_COLS).eq("org_id", ctx.orgId).eq("surface", surface).eq("is_visible", true).order("display_order", {
        ascending: true
    }).order("metric_key", {
        ascending: true
    });
    if (surface === "workspace") {
        q = q.is("department_id", null).is("work_unit_id", null);
        countBuilder = countBuilder.is("department_id", null).is("work_unit_id", null);
    } else if (surface === "department") {
        q = q.eq("department_id", departmentId).is("work_unit_id", null);
        countBuilder = countBuilder.eq("department_id", departmentId).is("work_unit_id", null);
    } else {
        q = q.eq("department_id", departmentId).eq("work_unit_id", workUnitId);
        countBuilder = countBuilder.eq("department_id", departmentId).eq("work_unit_id", workUnitId);
    }
    const [{ data, error }, countRes] = await Promise.all([
        q,
        countBuilder
    ]);
    if (error) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: error.message
        }, {
            status: 500
        });
    }
    if (countRes.error) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: countRes.error.message
        }, {
            status: 500
        });
    }
    const items = data ?? [];
    const scopeHasPlacementRows = (countRes.count ?? 0) > 0;
    return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
        items,
        scope_has_placements: scopeHasPlacementRows
    });
}
async function POST(request) {
    const ctx = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$getAdminContext$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["getAdminContextCached"])();
    if (!ctx.ok) return (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$getAdminContext$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["adminContextFailureResponse"])(ctx);
    if (ctx.role !== "admin") {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: "Forbidden"
        }, {
            status: 403
        });
    }
    let body;
    try {
        body = await request.json();
    } catch  {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: "Invalid JSON"
        }, {
            status: 400
        });
    }
    let parsed;
    try {
        parsed = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$kpi$2f$placementMutationValidation$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["validatePlacementCreateBody"])(body);
    } catch (e) {
        if (e instanceof __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$kpi$2f$placementMutationValidation$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["PlacementValidationError"]) {
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                error: e.message
            }, {
                status: e.status
            });
        }
        throw e;
    }
    const supabase = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabaseAdmin$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["createAdminClient"])();
    const deptOk = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$assertRowOrg$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["assertRowOrg"])(supabase, "departments", parsed.department_id ?? "", ctx.orgId);
    if (parsed.surface === "department") {
        if (!deptOk.ok) return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: "Department not found"
        }, {
            status: 404
        });
    }
    if (parsed.surface === "work_unit") {
        if (!deptOk.ok) return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: "Department not found"
        }, {
            status: 404
        });
        const { data: wuRow, error: wuErr } = await supabase.from("work_units").select("id, department_id").eq("id", parsed.work_unit_id ?? "").eq("org_id", ctx.orgId).maybeSingle();
        if (wuErr || !wuRow) {
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                error: "Work unit not found"
            }, {
                status: 404
            });
        }
        if (String(wuRow.department_id ?? "") !== String(parsed.department_id ?? "")) {
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                error: "Work unit does not belong to selected department"
            }, {
                status: 400
            });
        }
    }
    const insertRow = {
        org_id: ctx.orgId,
        surface: parsed.surface,
        department_id: parsed.department_id,
        work_unit_id: parsed.work_unit_id,
        metric_key: parsed.metric_key,
        display_order: parsed.display_order,
        is_visible: true,
        label_override: parsed.label_override,
        format_override: null,
        lane_override: null,
        metadata: {}
    };
    const { data: inserted, error: insErr } = await supabase.from("workspace_kpi_placement").insert(insertRow).select(SELECT_COLS).maybeSingle();
    if (insErr) {
        const code = insErr.code;
        if (code === "23505") {
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                error: "A visible placement for this metric and scope already exists. Hide the existing row or adjust scope."
            }, {
                status: 409
            });
        }
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: insErr.message
        }, {
            status: 500
        });
    }
    return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
        item: inserted
    });
}
async function PATCH(request) {
    const ctx = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$getAdminContext$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["getAdminContextCached"])();
    if (!ctx.ok) return (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$getAdminContext$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["adminContextFailureResponse"])(ctx);
    if (ctx.role !== "admin") {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: "Forbidden"
        }, {
            status: 403
        });
    }
    let body;
    try {
        body = await request.json();
    } catch  {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: "Invalid JSON"
        }, {
            status: 400
        });
    }
    let patch;
    try {
        patch = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$kpi$2f$placementMutationValidation$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["validatePlacementPatchBody"])(body);
    } catch (e) {
        if (e instanceof __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$kpi$2f$placementMutationValidation$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["PlacementValidationError"]) {
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                error: e.message
            }, {
                status: e.status
            });
        }
        throw e;
    }
    const supabase = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabaseAdmin$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["createAdminClient"])();
    const { data: existing, error: exErr } = await supabase.from("workspace_kpi_placement").select("id, org_id").eq("id", patch.id).eq("org_id", ctx.orgId).maybeSingle();
    if (exErr) return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
        error: exErr.message
    }, {
        status: 500
    });
    if (!existing) return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
        error: "Not found"
    }, {
        status: 404
    });
    const updates = {};
    if (patch.is_visible !== undefined) updates.is_visible = patch.is_visible;
    if (patch.display_order !== undefined) updates.display_order = patch.display_order;
    if (patch.label_override !== undefined) updates.label_override = patch.label_override;
    const { data: updated, error: upErr } = await supabase.from("workspace_kpi_placement").update(updates).eq("id", patch.id).eq("org_id", ctx.orgId).select(SELECT_COLS).maybeSingle();
    if (upErr) {
        const code = upErr.code;
        if (code === "23505") {
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                error: "Update would duplicate another visible placement for this metric and scope."
            }, {
                status: 409
            });
        }
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: upErr.message
        }, {
            status: 500
        });
    }
    return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
        item: updated
    });
}
async function DELETE(request) {
    const ctx = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$getAdminContext$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["getAdminContextCached"])();
    if (!ctx.ok) return (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$getAdminContext$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["adminContextFailureResponse"])(ctx);
    if (ctx.role !== "admin") {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: "Forbidden"
        }, {
            status: 403
        });
    }
    const id = request.nextUrl.searchParams.get("id")?.trim() ?? "";
    if (!id) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: "id query parameter required"
        }, {
            status: 400
        });
    }
    const supabase = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabaseAdmin$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["createAdminClient"])();
    const { data: existing, error: exErr } = await supabase.from("workspace_kpi_placement").select("id").eq("id", id).eq("org_id", ctx.orgId).maybeSingle();
    if (exErr) return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
        error: exErr.message
    }, {
        status: 500
    });
    if (!existing) return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
        error: "Not found"
    }, {
        status: 404
    });
    const { error: delErr } = await supabase.from("workspace_kpi_placement").delete().eq("id", id).eq("org_id", ctx.orgId);
    if (delErr) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: delErr.message
        }, {
            status: 500
        });
    }
    return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
        ok: true
    });
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__44acd710._.js.map