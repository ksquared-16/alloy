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
 */ __turbopack_context__.s([
    "adminContextFailureResponse",
    ()=>adminContextFailureResponse,
    "getAdminContext",
    ()=>getAdminContext
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/server.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabaseAdmin$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/supabaseAdmin.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$primaryAdminOpsOrg$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/primaryAdminOpsOrg.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$cachedAuthSession$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/cachedAuthSession.ts [app-route] (ecmascript)");
;
;
;
;
async function getAdminContext() {
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
function adminContextFailureResponse(failure) {
    const message = failure.status === 401 ? "Unauthorized" : "Forbidden";
    return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
        error: message
    }, {
        status: failure.status
    });
}
}),
"[project]/lib/rrs/queue/queueDefinitionV1.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * work_units.queue_definition — v1 (Track A + Growth opportunity slice).
 * Empty object {} means "no interpreted queue" for *read* helpers (`parseQueueDefinitionV1`).
 * Writes use `parseQueueDefinitionV1Strict` + `queueDefinitionV1Schema` (AI slice v0 / admin PATCH).
 */ // ——— Job (original v1) ———
__turbopack_context__.s([
    "buildJobQueueIntent",
    ()=>buildJobQueueIntent,
    "buildOpportunityQueueIntent",
    ()=>buildOpportunityQueueIntent,
    "getQueueDefinitionStoredVersion",
    ()=>getQueueDefinitionStoredVersion,
    "isQueueDefinitionV1Job",
    ()=>isQueueDefinitionV1Job,
    "isQueueDefinitionV1Opportunity",
    ()=>isQueueDefinitionV1Opportunity,
    "normalizeQueueDefinitionForCreate",
    ()=>normalizeQueueDefinitionForCreate,
    "parseQueueDefinitionV1",
    ()=>parseQueueDefinitionV1,
    "parseQueueDefinitionV1Strict",
    ()=>parseQueueDefinitionV1Strict,
    "queueDefinitionV1Schema",
    ()=>queueDefinitionV1Schema,
    "serializeQueueDefinitionV1",
    ()=>serializeQueueDefinitionV1
]);
const JOB_SORT_BY = new Set([
    "updated_at",
    "created_at",
    "scheduled_at"
]);
const OPP_SORT_BY = new Set([
    "updated_at",
    "created_at",
    "job_date"
]);
const SORT_DIR = new Set([
    "asc",
    "desc"
]);
const TOP_LEVEL_KEYS = new Set([
    "version",
    "entity_type",
    "filters",
    "sort",
    "limit"
]);
const JOB_FILTER_KEYS = new Set([
    "status_keys",
    "job_status_ids"
]);
const OPP_FILTER_KEYS = new Set([
    "status_keys",
    "pipeline_stage_ids",
    "source_keys",
    "assigned_to",
    "quote_state"
]);
const QUOTE_STATE = new Set([
    "no_positive_quote",
    "has_positive_quote",
    "quoted_not_booked"
]);
function isPlainObject(v) {
    return v != null && typeof v === "object" && !Array.isArray(v);
}
function extraKeys(obj, allowed) {
    for (const k of Object.keys(obj)){
        if (!allowed.has(k)) return k;
    }
    return undefined;
}
function getQueueDefinitionStoredVersion(raw) {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return 0;
    const v = raw.version;
    return typeof v === "number" && Number.isFinite(v) ? v : 0;
}
function parseJobDefinitionStrict(raw) {
    if (raw.entity_type !== "job") return {
        ok: false,
        error: "entity_type must be job"
    };
    const sortRaw = raw.sort;
    if (!isPlainObject(sortRaw)) return {
        ok: false,
        error: "sort must be an object"
    };
    const badSort = extraKeys(sortRaw, new Set([
        "by",
        "direction"
    ]));
    if (badSort) return {
        ok: false,
        error: `sort: unknown key: ${badSort}`
    };
    const by = sortRaw.by;
    const direction = sortRaw.direction;
    if (typeof by !== "string" || !JOB_SORT_BY.has(by)) {
        return {
            ok: false,
            error: "sort.by is invalid for job"
        };
    }
    if (typeof direction !== "string" || !SORT_DIR.has(direction)) {
        return {
            ok: false,
            error: "sort.direction is invalid"
        };
    }
    const limitRaw = raw.limit;
    if (typeof limitRaw !== "number" || !Number.isFinite(limitRaw)) {
        return {
            ok: false,
            error: "limit must be a number"
        };
    }
    let limit = Math.floor(limitRaw);
    if (limit < 1) return {
        ok: false,
        error: "limit must be >= 1"
    };
    if (limit > 500) return {
        ok: false,
        error: "limit must be <= 500"
    };
    let filters;
    if (raw.filters !== undefined) {
        if (!isPlainObject(raw.filters)) return {
            ok: false,
            error: "filters must be an object"
        };
        const fr = raw.filters;
        const badF = extraKeys(fr, JOB_FILTER_KEYS);
        if (badF) return {
            ok: false,
            error: `filters: unknown key: ${badF}`
        };
        const status_keys = Array.isArray(fr.status_keys) ? fr.status_keys.filter((x)=>typeof x === "string" && x.trim() !== "") : undefined;
        const job_status_ids = Array.isArray(fr.job_status_ids) ? fr.job_status_ids.filter((x)=>typeof x === "string" && x.trim() !== "") : undefined;
        if (status_keys?.length || job_status_ids?.length) {
            filters = {};
            if (status_keys?.length) filters.status_keys = status_keys;
            if (job_status_ids?.length) filters.job_status_ids = job_status_ids;
        }
    }
    return {
        ok: true,
        value: {
            version: 1,
            entity_type: "job",
            filters,
            sort: {
                by: by,
                direction: direction
            },
            limit
        }
    };
}
function parseOpportunityDefinitionStrict(raw) {
    if (raw.entity_type !== "opportunity") return {
        ok: false,
        error: "entity_type must be opportunity"
    };
    const sortRaw = raw.sort;
    if (!isPlainObject(sortRaw)) return {
        ok: false,
        error: "sort must be an object"
    };
    const badSort = extraKeys(sortRaw, new Set([
        "by",
        "direction"
    ]));
    if (badSort) return {
        ok: false,
        error: `sort: unknown key: ${badSort}`
    };
    const by = sortRaw.by;
    const direction = sortRaw.direction;
    if (typeof by !== "string" || !OPP_SORT_BY.has(by)) {
        return {
            ok: false,
            error: "sort.by is invalid for opportunity"
        };
    }
    if (typeof direction !== "string" || !SORT_DIR.has(direction)) {
        return {
            ok: false,
            error: "sort.direction is invalid"
        };
    }
    const limitRaw = raw.limit;
    if (typeof limitRaw !== "number" || !Number.isFinite(limitRaw)) {
        return {
            ok: false,
            error: "limit must be a number"
        };
    }
    let limit = Math.floor(limitRaw);
    if (limit < 1) return {
        ok: false,
        error: "limit must be >= 1"
    };
    if (limit > 500) return {
        ok: false,
        error: "limit must be <= 500"
    };
    let filters;
    if (raw.filters !== undefined) {
        if (!isPlainObject(raw.filters)) return {
            ok: false,
            error: "filters must be an object"
        };
        const fr = raw.filters;
        const badF = extraKeys(fr, OPP_FILTER_KEYS);
        if (badF) return {
            ok: false,
            error: `filters: unknown key: ${badF}`
        };
        const status_keys = Array.isArray(fr.status_keys) ? fr.status_keys.filter((x)=>typeof x === "string" && x.trim() !== "") : undefined;
        const pipeline_stage_ids = Array.isArray(fr.pipeline_stage_ids) ? fr.pipeline_stage_ids.filter((x)=>typeof x === "string" && x.trim() !== "") : undefined;
        const source_keys = Array.isArray(fr.source_keys) ? fr.source_keys.filter((x)=>typeof x === "string" && x.trim() !== "") : undefined;
        const assigned_to = Array.isArray(fr.assigned_to) ? fr.assigned_to.filter((x)=>typeof x === "string" && x.trim() !== "") : undefined;
        let quote_state;
        if (fr.quote_state !== undefined) {
            if (typeof fr.quote_state !== "string" || !QUOTE_STATE.has(fr.quote_state)) {
                return {
                    ok: false,
                    error: "filters.quote_state is invalid"
                };
            }
            quote_state = fr.quote_state;
        }
        if (status_keys?.length || pipeline_stage_ids?.length || source_keys?.length || assigned_to?.length || quote_state !== undefined) {
            filters = {};
            if (status_keys?.length) filters.status_keys = status_keys;
            if (pipeline_stage_ids?.length) filters.pipeline_stage_ids = pipeline_stage_ids;
            if (source_keys?.length) filters.source_keys = source_keys;
            if (assigned_to?.length) filters.assigned_to = assigned_to;
            if (quote_state !== undefined) filters.quote_state = quote_state;
        }
    }
    return {
        ok: true,
        value: {
            version: 1,
            entity_type: "opportunity",
            filters,
            sort: {
                by: by,
                direction: direction
            },
            limit
        }
    };
}
function parseQueueDefinitionV1Strict(raw) {
    if (raw == null) {
        return {
            ok: false,
            error: "queue_definition must be an object or null to clear"
        };
    }
    if (!isPlainObject(raw)) {
        return {
            ok: false,
            error: "queue_definition must be a JSON object"
        };
    }
    if (Object.keys(raw).length === 0) {
        return {
            ok: false,
            error: "empty object is not valid v1; omit field or pass null to clear"
        };
    }
    const badTop = extraKeys(raw, TOP_LEVEL_KEYS);
    if (badTop) return {
        ok: false,
        error: `unknown key: ${badTop}`
    };
    if (raw.version !== 1) return {
        ok: false,
        error: "version must be 1"
    };
    const et = raw.entity_type;
    if (et === "job") return parseJobDefinitionStrict(raw);
    if (et === "opportunity") return parseOpportunityDefinitionStrict(raw);
    return {
        ok: false,
        error: "entity_type must be job or opportunity"
    };
}
function serializeQueueDefinitionV1(v) {
    if (v.entity_type === "job") {
        const o = {
            version: v.version,
            entity_type: v.entity_type,
            sort: v.sort,
            limit: v.limit
        };
        if (v.filters && Object.keys(v.filters).length > 0) {
            o.filters = v.filters;
        }
        return o;
    }
    const o = {
        version: v.version,
        entity_type: v.entity_type,
        sort: v.sort,
        limit: v.limit
    };
    if (v.filters && Object.keys(v.filters).length > 0) {
        o.filters = v.filters;
    }
    return o;
}
function normalizeQueueDefinitionForCreate(raw) {
    if (raw === undefined || raw === null) {
        return {
            ok: true,
            value: {}
        };
    }
    if (typeof raw === "string") {
        const t = raw.trim();
        if (!t) return {
            ok: true,
            value: {}
        };
        try {
            const p = JSON.parse(t);
            return normalizeQueueDefinitionForCreate(p);
        } catch  {
            return {
                ok: false,
                error: "queue_definition must be valid JSON"
            };
        }
    }
    if (typeof raw !== "object" || Array.isArray(raw) || raw === null) {
        return {
            ok: false,
            error: "queue_definition must be a JSON object"
        };
    }
    const o = raw;
    if (Object.keys(o).length === 0) {
        return {
            ok: true,
            value: {}
        };
    }
    const parsed = parseQueueDefinitionV1Strict(o);
    if (!parsed.ok) {
        return {
            ok: false,
            error: parsed.error
        };
    }
    return {
        ok: true,
        value: serializeQueueDefinitionV1(parsed.value)
    };
}
const queueDefinitionV1Schema = {
    parseStrict: parseQueueDefinitionV1Strict,
    getStoredVersion: getQueueDefinitionStoredVersion
};
function parseJobLenient(raw) {
    const sortRaw = raw.sort;
    if (!isPlainObject(sortRaw)) return null;
    const by = sortRaw.by;
    const direction = sortRaw.direction;
    if (typeof by !== "string" || !JOB_SORT_BY.has(by)) return null;
    if (typeof direction !== "string" || !SORT_DIR.has(direction)) return null;
    const limitRaw = raw.limit;
    let limit = typeof limitRaw === "number" && Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 50;
    if (limit < 1) limit = 1;
    if (limit > 500) limit = 500;
    let filters;
    const filtersRaw = raw.filters;
    if (filtersRaw !== undefined) {
        if (!isPlainObject(filtersRaw)) return null;
        const status_keys = Array.isArray(filtersRaw.status_keys) ? filtersRaw.status_keys.filter((x)=>typeof x === "string" && x.trim() !== "") : undefined;
        const job_status_ids = Array.isArray(filtersRaw.job_status_ids) ? filtersRaw.job_status_ids.filter((x)=>typeof x === "string" && x.trim() !== "") : undefined;
        if (status_keys?.length || job_status_ids?.length) {
            filters = {};
            if (status_keys?.length) filters.status_keys = status_keys;
            if (job_status_ids?.length) filters.job_status_ids = job_status_ids;
        }
    }
    return {
        version: 1,
        entity_type: "job",
        filters,
        sort: {
            by: by,
            direction: direction
        },
        limit
    };
}
function parseOpportunityLenient(raw) {
    const sortRaw = raw.sort;
    if (!isPlainObject(sortRaw)) return null;
    const by = sortRaw.by;
    const direction = sortRaw.direction;
    if (typeof by !== "string" || !OPP_SORT_BY.has(by)) return null;
    if (typeof direction !== "string" || !SORT_DIR.has(direction)) return null;
    const limitRaw = raw.limit;
    let limit = typeof limitRaw === "number" && Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 50;
    if (limit < 1) limit = 1;
    if (limit > 500) limit = 500;
    let filters;
    const filtersRaw = raw.filters;
    if (filtersRaw !== undefined && isPlainObject(filtersRaw)) {
        const status_keys = Array.isArray(filtersRaw.status_keys) ? filtersRaw.status_keys.filter((x)=>typeof x === "string" && x.trim() !== "") : undefined;
        const pipeline_stage_ids = Array.isArray(filtersRaw.pipeline_stage_ids) ? filtersRaw.pipeline_stage_ids.filter((x)=>typeof x === "string" && x.trim() !== "") : undefined;
        const source_keys = Array.isArray(filtersRaw.source_keys) ? filtersRaw.source_keys.filter((x)=>typeof x === "string" && x.trim() !== "") : undefined;
        const assigned_to = Array.isArray(filtersRaw.assigned_to) ? filtersRaw.assigned_to.filter((x)=>typeof x === "string" && x.trim() !== "") : undefined;
        let quote_state;
        if (typeof filtersRaw.quote_state === "string" && QUOTE_STATE.has(filtersRaw.quote_state)) {
            quote_state = filtersRaw.quote_state;
        }
        if (status_keys?.length || pipeline_stage_ids?.length || source_keys?.length || assigned_to?.length || quote_state !== undefined) {
            filters = {};
            if (status_keys?.length) filters.status_keys = status_keys;
            if (pipeline_stage_ids?.length) filters.pipeline_stage_ids = pipeline_stage_ids;
            if (source_keys?.length) filters.source_keys = source_keys;
            if (assigned_to?.length) filters.assigned_to = assigned_to;
            if (quote_state !== undefined) filters.quote_state = quote_state;
        }
    }
    return {
        version: 1,
        entity_type: "opportunity",
        filters,
        sort: {
            by: by,
            direction: direction
        },
        limit
    };
}
function parseQueueDefinitionV1(raw) {
    if (raw == null) return null;
    if (isPlainObject(raw) && Object.keys(raw).length === 0) return null;
    if (!isPlainObject(raw)) return null;
    const version = raw.version;
    if (version !== 1) return null;
    const entity_type = raw.entity_type;
    if (entity_type === "job") return parseJobLenient(raw);
    if (entity_type === "opportunity") return parseOpportunityLenient(raw);
    return null;
}
function buildJobQueueIntent(orgId, def) {
    return {
        entity: "job",
        org_id: orgId,
        filters: {
            status_keys: def.filters?.status_keys,
            job_status_ids: def.filters?.job_status_ids
        },
        sort: def.sort,
        limit: def.limit
    };
}
function buildOpportunityQueueIntent(orgId, def) {
    return {
        entity: "opportunity",
        org_id: orgId,
        filters: def.filters ?? {},
        sort: def.sort,
        limit: def.limit
    };
}
function isQueueDefinitionV1Job(d) {
    return d.entity_type === "job";
}
function isQueueDefinitionV1Opportunity(d) {
    return d.entity_type === "opportunity";
}
}),
"[project]/app/api/admin/work-units/route.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "GET",
    ()=>GET,
    "POST",
    ()=>POST
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/server.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabaseAdmin$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/supabaseAdmin.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$assertRowOrg$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/assertRowOrg.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$getAdminContext$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/getAdminContext.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$rrs$2f$queue$2f$queueDefinitionV1$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/rrs/queue/queueDefinitionV1.ts [app-route] (ecmascript)");
;
;
;
;
;
const KEY_REGEX = /^[a-z0-9_]{2,64}$/;
function normalizeKey(raw) {
    return raw.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
}
async function GET(request) {
    const t0 = Date.now();
    const ctx = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$getAdminContext$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["getAdminContext"])();
    const ctxMs = Date.now() - t0;
    if (!ctx.ok) return (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$getAdminContext$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["adminContextFailureResponse"])(ctx);
    const departmentId = new URL(request.url).searchParams.get("department_id")?.trim() || null;
    const t1 = Date.now();
    const supabase = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabaseAdmin$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["createAdminClient"])();
    let q = supabase.from("work_units").select("id, org_id, department_id, key, name, description, sort_order, is_active, queue_definition, metadata, created_at, updated_at").eq("org_id", ctx.orgId).order("sort_order", {
        ascending: true
    }).order("name", {
        ascending: true
    });
    if (departmentId) {
        const ok = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$assertRowOrg$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["assertRowOrg"])(supabase, "departments", departmentId, ctx.orgId);
        if (!ok.ok) {
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                error: "Department not found"
            }, {
                status: 404
            });
        }
        q = q.eq("department_id", departmentId);
    }
    const { data: rows, error } = await q;
    if (error) {
        if (error.code === "42P01") {
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                error: "work_units table not found — apply hierarchy migration (see docs/implementation/HIERARCHY_SCHEMA_V1.md)"
            }, {
                status: 503
            });
        }
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: error.message
        }, {
            status: 500
        });
    }
    const dbMs = Date.now() - t1;
    const totalMs = Date.now() - t0;
    if (totalMs > 200) {
        console.warn("[admin-timing] GET /api/admin/work-units", {
            total_ms: totalMs,
            get_admin_context_ms: ctxMs,
            query_ms: dbMs,
            department_id: departmentId,
            row_count: (rows ?? []).length
        });
    }
    return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
        items: rows ?? []
    });
}
async function POST(request) {
    const ctx = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$getAdminContext$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["getAdminContext"])();
    if (!ctx.ok) return (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$getAdminContext$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["adminContextFailureResponse"])(ctx);
    if (ctx.role !== "admin") {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: "Forbidden"
        }, {
            status: 403
        });
    }
    let body = {};
    try {
        body = await request.json();
    } catch  {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: "Invalid JSON"
        }, {
            status: 400
        });
    }
    const department_id = typeof body.department_id === "string" ? body.department_id.trim() : "";
    if (!department_id) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: "department_id is required"
        }, {
            status: 400
        });
    }
    const supabase = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabaseAdmin$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["createAdminClient"])();
    const { data: dept, error: deptErr } = await supabase.from("departments").select("id, org_id").eq("id", department_id).eq("org_id", ctx.orgId).maybeSingle();
    if (deptErr || !dept) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: "Department not found"
        }, {
            status: 404
        });
    }
    const key = normalizeKey(typeof body.key === "string" ? body.key : "");
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() || null : body.description === null ? null : null;
    const sort_order = typeof body.sort_order === "number" && !Number.isNaN(body.sort_order) ? body.sort_order : 0;
    const is_active = body.is_active !== false;
    const qdNorm = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$rrs$2f$queue$2f$queueDefinitionV1$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["normalizeQueueDefinitionForCreate"])(body.queue_definition);
    if (!qdNorm.ok) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: qdNorm.error
        }, {
            status: 400
        });
    }
    const queue_definition = qdNorm.value;
    if (!key) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: "key is required"
        }, {
            status: 400
        });
    }
    if (!KEY_REGEX.test(key)) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: "key must be 2–64 characters: lowercase letters, numbers, underscores only"
        }, {
            status: 400
        });
    }
    if (!name) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: "name is required"
        }, {
            status: 400
        });
    }
    const org_id = dept.org_id;
    if (org_id !== ctx.orgId) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: "Department not found"
        }, {
            status: 404
        });
    }
    const now = new Date().toISOString();
    const { data: created, error } = await supabase.from("work_units").insert({
        org_id: ctx.orgId,
        department_id,
        key,
        name,
        description,
        sort_order,
        is_active,
        queue_definition,
        metadata: {},
        updated_at: now
    }).select().single();
    if (error) {
        const code = error.code;
        if (code === "23505") {
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                error: "A work unit with this key already exists in this department"
            }, {
                status: 409
            });
        }
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: error.message
        }, {
            status: 400
        });
    }
    return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json(created);
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__28d5df4e._.js.map