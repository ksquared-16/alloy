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
"[project]/lib/config/queueDefinitionSchema.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "queueConfigSchema",
    ()=>queueConfigSchema,
    "queueDefinitionV1Schema",
    ()=>queueDefinitionV1Schema,
    "queueFilterSchema",
    ()=>queueFilterSchema,
    "validateQueueDefinition",
    ()=>validateQueueDefinition
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__ = __turbopack_context__.i("[project]/node_modules/zod/v4/classic/external.js [app-route] (ecmascript) <export * as z>");
;
const StatusFilterSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].object({
    type: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].literal("status"),
    operator: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].literal("in"),
    values: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].array(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string())
}).strict();
const FieldFilterSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].object({
    type: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].literal("field"),
    field_key: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string(),
    operator: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].enum([
        "eq",
        "gt",
        "lt"
    ]),
    value: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].unknown()
}).strict();
const DateFilterSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].object({
    type: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].literal("date"),
    field: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string(),
    operator: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].enum([
        "today",
        "past_due"
    ])
}).strict();
const AssignmentFilterSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].object({
    type: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].literal("assignment"),
    operator: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].enum([
        "is_null",
        "equals"
    ]),
    value: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string().optional()
}).strict().superRefine((val, ctx)=>{
    if (val.operator === "equals" && !val.value) {
        ctx.addIssue({
            code: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].ZodIssueCode.custom,
            message: "assignment.equals requires value",
            path: [
                "value"
            ]
        });
    }
    if (val.operator === "is_null" && val.value !== undefined) {
        ctx.addIssue({
            code: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].ZodIssueCode.custom,
            message: "assignment.is_null must not include value",
            path: [
                "value"
            ]
        });
    }
});
const ExceptionFilterSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].object({
    type: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].literal("exception"),
    operator: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].literal("exists"),
    exception_types: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].array(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string()).optional()
}).strict();
const queueFilterSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].union([
    StatusFilterSchema,
    FieldFilterSchema,
    DateFilterSchema,
    AssignmentFilterSchema,
    ExceptionFilterSchema
]).readonly();
const queueConfigSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].object({
    key: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string().min(1),
    label: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string().min(1),
    description: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string().optional(),
    filters: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].array(queueFilterSchema),
    sort: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].array(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].object({
        field: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string().min(1),
        direction: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].enum([
            "asc",
            "desc"
        ])
    }).strict()).optional(),
    limit: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].number().int().positive().optional(),
    priority: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].enum([
        "standard",
        "attention",
        "critical"
    ]).optional(),
    display: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].enum([
        "list",
        "cards"
    ]).optional(),
    group_by: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string().min(1).optional()
}).strict().readonly();
const queueUiRowPreviewSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].object({
    variant: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].enum([
        "crm_compact",
        "basic"
    ]).default("basic"),
    fields: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].array(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].enum([
        "title",
        "status",
        "primary_contact",
        "phone",
        "email",
        "child_name",
        "program",
        "desired_start_date",
        "tour_date"
    ])).default([
        "title",
        "status"
    ]),
    actions: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].array(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].enum([
        "open",
        "call",
        "email"
    ])).default([
        "open"
    ])
}).strict();
const queueUiSectionSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].object({
    key: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string().min(1),
    label: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string().min(1),
    tone: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].enum([
        "standard",
        "attention",
        "critical"
    ]).optional(),
    queue_keys: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].array(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string().min(1)).nonempty()
}).strict();
const queueUiSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].object({
    layout: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].enum([
        "pipeline_with_attention",
        "single_section"
    ]).default("single_section"),
    primary_total_label: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string().min(1).optional(),
    primary_total_queue: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string().min(1).optional(),
    sections: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].array(queueUiSectionSchema).nonempty().optional(),
    row_preview: queueUiRowPreviewSchema.optional()
}).strict();
const queueDefinitionV1Schema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].object({
    version: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].literal(1),
    entity_type: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].enum([
        "job",
        "schedule",
        "opportunity"
    ]),
    queues: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].array(queueConfigSchema).nonempty(),
    ui: queueUiSchema.optional()
}).strict().readonly();
function validateQueueDefinition(input) {
    return queueDefinitionV1Schema.parse(input);
}
}),
"[project]/lib/ui-v2/queueUiConfig.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "getQueueUiConfig",
    ()=>getQueueUiConfig,
    "partitionQueueUiSections",
    ()=>partitionQueueUiSections,
    "queuePrimaryTotalFromSummaries",
    ()=>queuePrimaryTotalFromSummaries
]);
function uniqPreserve(xs) {
    const out = [];
    const seen = new Set();
    for (const x of xs){
        const k = x.trim();
        if (!k) continue;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(k);
    }
    return out;
}
function getQueueUiConfig(def) {
    const allKeys = def.queues.map((q)=>q.key);
    const ui = def.ui;
    const fallback = {
        layout: "single_section",
        primary_total_label: undefined,
        primary_total_queue: undefined,
        sections: [
            {
                key: "all",
                label: "Queues",
                queue_keys: allKeys
            }
        ],
        row_preview: {
            variant: "basic",
            fields: [
                "title",
                "status"
            ],
            actions: [
                "open"
            ]
        }
    };
    if (!ui) return fallback;
    const sections = Array.isArray(ui.sections) && ui.sections.length ? ui.sections.map((s)=>({
            key: String(s.key ?? "").trim(),
            label: String(s.label ?? "").trim(),
            tone: s.tone,
            queue_keys: uniqPreserve((Array.isArray(s.queue_keys) ? s.queue_keys : []).map(String))
        })).filter((s)=>s.key && s.label && s.queue_keys.length > 0) : fallback.sections;
    const row_preview = ui.row_preview ?? {};
    const variant = row_preview.variant === "crm_compact" ? "crm_compact" : "basic";
    const fields = Array.isArray(row_preview.fields) && row_preview.fields.length ? row_preview.fields : fallback.row_preview.fields;
    const actions = Array.isArray(row_preview.actions) && row_preview.actions.length ? row_preview.actions : fallback.row_preview.actions;
    return {
        layout: ui.layout === "pipeline_with_attention" ? "pipeline_with_attention" : "single_section",
        primary_total_label: ui.primary_total_label,
        primary_total_queue: ui.primary_total_queue,
        sections,
        row_preview: {
            variant,
            fields,
            actions
        }
    };
}
function queuePrimaryTotalFromSummaries(params) {
    const target = (params.ui.primary_total_queue ?? "").trim();
    if (!target) return null;
    const q = params.summaries.find((s)=>s.key === target);
    if (!q) return null;
    return q.count ?? 0;
}
function partitionQueueUiSections(ui) {
    const attention = ui.sections.filter((s)=>s.tone === "critical");
    const throughput = ui.sections.filter((s)=>s.tone !== "critical");
    return {
        throughput,
        attention
    };
}
}),
"[project]/lib/workspace/workUnitQueueDerived.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "WORK_UNIT_OTHER_PILL_KEY",
    ()=>WORK_UNIT_OTHER_PILL_KEY,
    "computeUnmappedOverflowCount",
    ()=>computeUnmappedOverflowCount,
    "computeWorkUnitLifecycleCoverage",
    ()=>computeWorkUnitLifecycleCoverage,
    "findAllRecordsQueueKey",
    ()=>findAllRecordsQueueKey,
    "isRowUnmappedForThroughput",
    ()=>isRowUnmappedForThroughput,
    "queueHasStatusFilters",
    ()=>queueHasStatusFilters,
    "reorderSectionsWithAllRecordsFirst",
    ()=>reorderSectionsWithAllRecordsFirst,
    "rowStatusKeyNormalized",
    ()=>rowStatusKeyNormalized,
    "shouldSuppressWorkUnitKpiStrip",
    ()=>shouldSuppressWorkUnitKpiStrip,
    "statusKeysCoveredByThroughputQueues",
    ()=>statusKeysCoveredByThroughputQueues,
    "summarizeUnmappedRowsForDiagnostics",
    ()=>summarizeUnmappedRowsForDiagnostics,
    "workUnitScopeTotalFromSummaries",
    ()=>workUnitScopeTotalFromSummaries
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$ui$2d$v2$2f$queueUiConfig$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/ui-v2/queueUiConfig.ts [app-route] (ecmascript)");
;
const WORK_UNIT_OTHER_PILL_KEY = "__derived_other__";
function queueHasStatusFilters(queue) {
    return (queue.filters ?? []).some((f)=>f.type === "status");
}
function findAllRecordsQueueKey(def, ui) {
    const needsKey = (k)=>k.trim().toLowerCase() === "needs_attention";
    const primary = (ui?.primary_total_queue ?? "").trim();
    if (primary && def.queues.some((q)=>q.key === primary)) {
        return primary;
    }
    for (const q of def.queues){
        if (needsKey(q.key)) continue;
        if (!queueHasStatusFilters(q)) return q.key;
    }
    const first = def.queues.find((q)=>!needsKey(q.key));
    return first?.key ?? null;
}
function statusKeysCoveredByThroughputQueues(def, allRecordsQueueKey) {
    const covered = new Set();
    for (const q of def.queues){
        if (!allRecordsQueueKey || q.key === allRecordsQueueKey) continue;
        if (q.key.trim().toLowerCase() === "needs_attention") continue;
        for (const f of q.filters ?? []){
            if (f.type !== "status" || f.operator !== "in") continue;
            for (const v of f.values ?? []){
                const t = String(v ?? "").trim().toLowerCase();
                if (t) covered.add(t);
            }
        }
    }
    return covered;
}
function workUnitScopeTotalFromSummaries(def, summaries) {
    const ui = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$ui$2d$v2$2f$queueUiConfig$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["getQueueUiConfig"])(def);
    const queueKey = findAllRecordsQueueKey(def, ui);
    if (!queueKey) return {
        queueKey: null,
        total: null
    };
    const row = summaries.find((s)=>s.key === queueKey);
    if (!row || row.counts_deferred === true || typeof row.count !== "number") {
        return {
            queueKey,
            total: null
        };
    }
    return {
        queueKey,
        total: Math.max(0, Math.floor(row.count))
    };
}
function computeUnmappedOverflowCount(params) {
    const { summaries, def, allRecordsQueueKey } = params;
    if (!summaries?.length || !allRecordsQueueKey) return null;
    const allRow = summaries.find((s)=>s.key === allRecordsQueueKey);
    if (!allRow || allRow.counts_deferred === true || typeof allRow.count !== "number") return null;
    const allCount = Math.max(0, Math.floor(allRow.count));
    let sumStatusLanes = 0;
    for (const q of def.queues){
        if (q.key === allRecordsQueueKey || q.key.trim().toLowerCase() === "needs_attention") continue;
        if (!queueHasStatusFilters(q)) continue;
        const row = summaries.find((s)=>s.key === q.key);
        if (!row || row.counts_deferred === true || typeof row.count !== "number") return null;
        sumStatusLanes += Math.max(0, Math.floor(row.count));
    }
    return Math.max(0, allCount - sumStatusLanes);
}
function shouldSuppressWorkUnitKpiStrip(params) {
    const { def, ui } = params;
    if (!def || !ui) return false;
    if (ui.layout === "pipeline_with_attention") return true;
    const { throughput } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$ui$2d$v2$2f$queueUiConfig$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["partitionQueueUiSections"])(ui);
    const allKey = findAllRecordsQueueKey(def, ui);
    if (!allKey) return false;
    const statusLanes = def.queues.filter((q)=>q.key !== allKey && q.key.trim().toLowerCase() !== "needs_attention" && queueHasStatusFilters(q));
    return throughput.length > 1 && statusLanes.length >= 1;
}
function reorderSectionsWithAllRecordsFirst(sections, allRecordsQueueKey) {
    if (!allRecordsQueueKey) return sections;
    return sections.map((sec)=>{
        const qs = [
            ...sec.queues
        ];
        const ix = qs.findIndex((q)=>q.key === allRecordsQueueKey);
        if (ix <= 0) return sec;
        const [row] = qs.splice(ix, 1);
        return {
            ...sec,
            queues: [
                row,
                ...qs
            ]
        };
    });
}
function rowStatusKeyNormalized(row) {
    if (typeof row !== "object" || row == null) return null;
    const sk = row.status_key;
    if (typeof sk !== "string") return null;
    const t = sk.trim().toLowerCase();
    return t || null;
}
function isRowUnmappedForThroughput(row, covered) {
    const sk = rowStatusKeyNormalized(row);
    if (!sk) return true;
    return !covered.has(sk);
}
function computeWorkUnitLifecycleCoverage(params) {
    const { summaries, def, allRecordsQueueKey } = params;
    const unmappedCount = computeUnmappedOverflowCount(params);
    if (!summaries?.length || !allRecordsQueueKey) {
        return {
            allRecordsCount: null,
            statusLaneCountSum: null,
            unmappedCount,
            needsAttentionCount: null,
            isComplete: false
        };
    }
    const allRow = summaries.find((s)=>s.key === allRecordsQueueKey);
    const allRecordsCount = allRow && allRow.counts_deferred !== true && typeof allRow.count === "number" ? Math.max(0, Math.floor(allRow.count)) : null;
    const allComplete = Boolean(allRow && allRow.counts_deferred !== true && typeof allRow.count === "number");
    let statusLaneCountSum = 0;
    let statusLanesComplete = true;
    for (const q of def.queues){
        if (q.key === allRecordsQueueKey || q.key.trim().toLowerCase() === "needs_attention") continue;
        if (!queueHasStatusFilters(q)) continue;
        const row = summaries.find((s)=>s.key === q.key);
        if (!row || row.counts_deferred === true || typeof row.count !== "number") {
            statusLanesComplete = false;
            break;
        }
        statusLaneCountSum += Math.max(0, Math.floor(row.count));
    }
    const needsAttentionLaneDefined = def.queues.some((q)=>q.key.trim().toLowerCase() === "needs_attention");
    const naRow = needsAttentionLaneDefined ? summaries.find((s)=>s.key.trim().toLowerCase() === "needs_attention") : undefined;
    const needsAttentionCount = !needsAttentionLaneDefined ? null : naRow && naRow.counts_deferred !== true && typeof naRow.count === "number" ? Math.max(0, Math.floor(naRow.count)) : null;
    let needsAttentionComplete = true;
    if (needsAttentionLaneDefined) {
        if (!naRow || naRow.counts_deferred === true || typeof naRow.count !== "number") {
            needsAttentionComplete = false;
        }
    }
    const unmappedComplete = unmappedCount != null;
    const isComplete = allComplete && statusLanesComplete && unmappedComplete && needsAttentionComplete;
    return {
        allRecordsCount,
        statusLaneCountSum: statusLanesComplete ? statusLaneCountSum : null,
        unmappedCount,
        needsAttentionCount: naRow ? needsAttentionCount : null,
        isComplete
    };
}
function summarizeUnmappedRowsForDiagnostics(rows, covered, limit = 50) {
    const unmapped = rows.filter((r)=>isRowUnmappedForThroughput(r, covered));
    const statusKeyCounts = {};
    let missingStatusKeyCount = 0;
    for (const r of unmapped){
        const sk = rowStatusKeyNormalized(r);
        if (sk == null) missingStatusKeyCount += 1;
        const k = sk ?? "";
        statusKeyCounts[k] = (statusKeyCounts[k] ?? 0) + 1;
    }
    const samples = [];
    let i = 0;
    for (const r of unmapped){
        if (i >= limit) break;
        if (typeof r !== "object" || r == null) continue;
        const o = r;
        const id = typeof o.id === "string" && o.id.trim() ? o.id.trim() : "";
        if (!id) continue;
        const name = typeof o.name === "string" && o.name.trim() ? o.name.trim() : "";
        const title = typeof o.title === "string" && o.title.trim() ? o.title.trim() : "";
        const label = name || title || id;
        const statusKey = rowStatusKeyNormalized(r);
        samples.push({
            id,
            label,
            statusKey
        });
        i += 1;
    }
    return {
        samples,
        truncated: unmapped.length > limit,
        statusKeyCounts,
        missingStatusKeyCount
    };
}
}),
"[project]/lib/admin/statusDefinitionLifecycle.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Universal lifecycle stages for configurable CRM statuses (`status_definitions.metadata.lifecycle_stage`).
 * Values are persisted in DB — this module only validates / reads; mapping is not hardcoded in app logic.
 */ __turbopack_context__.s([
    "OPPORTUNITY_LIFECYCLE_STAGES",
    ()=>OPPORTUNITY_LIFECYCLE_STAGES,
    "parseLifecycleStageFromMetadata",
    ()=>parseLifecycleStageFromMetadata
]);
const OPPORTUNITY_LIFECYCLE_STAGES = [
    "intake",
    "qualification",
    "execution",
    "decision",
    "success",
    "failure"
];
const STAGE_SET = new Set(OPPORTUNITY_LIFECYCLE_STAGES);
function parseLifecycleStageFromMetadata(metadata) {
    if (metadata == null || typeof metadata !== "object") return null;
    const raw = metadata.lifecycle_stage;
    if (typeof raw !== "string") return null;
    const t = raw.trim();
    return STAGE_SET.has(t) ? t : null;
}
}),
"[project]/lib/admin/statusDefinitionsResolve.ts [app-route] (ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "assertAllowedStatusKey",
    ()=>assertAllowedStatusKey,
    "displayLabelsFromDefinitions",
    ()=>displayLabelsFromDefinitions,
    "fetchEffectiveStatusDefinitions",
    ()=>fetchEffectiveStatusDefinitions,
    "fetchIndustryDefaultStatusDefinitions",
    ()=>fetchIndustryDefaultStatusDefinitions,
    "fetchOrgStatusDefinitions",
    ()=>fetchOrgStatusDefinitions,
    "getOrgIndustryKey",
    ()=>getOrgIndustryKey,
    "inferDocumentStatusFromStored",
    ()=>inferDocumentStatusFromStored,
    "resolveDisplayFromLabelMap",
    ()=>resolveDisplayFromLabelMap,
    "resolveStatusLabel",
    ()=>resolveStatusLabel
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$statusDefinitionLifecycle$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/statusDefinitionLifecycle.ts [app-route] (ecmascript)");
;
const STATUS_DEF_COLUMNS = "id, org_id, industry_key, entity_type, status_key, status_label, sort_order, is_active, is_system, metadata";
function sortDefs(rows) {
    return [
        ...rows
    ].sort((a, b)=>{
        const so = (a.sort_order ?? 0) - (b.sort_order ?? 0);
        if (so !== 0) return so;
        const la = (a.status_label ?? a.status_key ?? "").toLowerCase();
        const lb = (b.status_label ?? b.status_key ?? "").toLowerCase();
        return la.localeCompare(lb);
    });
}
async function fetchOrgStatusDefinitions(supabase, orgId, entityType, opts) {
    const activeOnly = opts?.activeOnly !== false;
    let q = supabase.from("status_definitions").select(STATUS_DEF_COLUMNS).eq("org_id", orgId).in("entity_type", entityType === "opportunities" ? [
        "opportunities",
        "opportunity"
    ] : [
        entityType
    ]);
    if (activeOnly) q = q.eq("is_active", true);
    const { data, error } = await q.order("sort_order", {
        ascending: true
    }).order("status_label", {
        ascending: true
    });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r)=>({
            ...r,
            metadata: r.metadata ?? null
        }));
}
async function fetchIndustryDefaultStatusDefinitions(supabase, entityType, orgIndustryKey, opts) {
    const activeOnly = opts?.activeOnly !== false;
    let q = supabase.from("status_definitions").select(STATUS_DEF_COLUMNS).is("org_id", null).in("entity_type", entityType === "opportunities" ? [
        "opportunities",
        "opportunity"
    ] : [
        entityType
    ]);
    if (activeOnly) q = q.eq("is_active", true);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const rows = (data ?? []).map((r)=>({
            ...r,
            metadata: r.metadata ?? null
        }));
    const generic = rows.filter((r)=>r.industry_key == null || String(r.industry_key).trim() === "");
    const specific = orgIndustryKey ? rows.filter((r)=>String(r.industry_key ?? "").trim() === orgIndustryKey) : [];
    const byKey = new Map();
    for (const r of generic)byKey.set(r.status_key, r);
    for (const r of specific)byKey.set(r.status_key, r);
    return sortDefs(Array.from(byKey.values()));
}
async function getOrgIndustryKey(supabase, orgId) {
    const { data } = await supabase.from("orgs").select("industry_id").eq("id", orgId).maybeSingle();
    const industryId = data?.industry_id ?? null;
    if (!industryId) return null;
    const { data: ind } = await supabase.from("industries").select("key").eq("id", industryId).maybeSingle();
    const k = ind?.key;
    if (k == null || String(k).trim() === "") return null;
    return String(k).trim();
}
async function fetchEffectiveStatusDefinitions(supabase, orgId, entityType, opts) {
    // For schedules/opportunities we need *all* org overrides (including inactive) so an inactive org row can
    // explicitly hide an industry default in the effective list.
    const needsMergeDefaults = entityType === "schedules" || entityType === "opportunities";
    const orgRows = await fetchOrgStatusDefinitions(supabase, orgId, entityType, needsMergeDefaults ? {
        activeOnly: false
    } : opts);
    // Schedules (and opportunities) must merge defaults with org rows so a partial org override
    // does not hide industry defaults required by workflows/actions.
    if (needsMergeDefaults) {
        const industryKey = await getOrgIndustryKey(supabase, orgId);
        const defaultRows = await fetchIndustryDefaultStatusDefinitions(supabase, entityType, industryKey, opts);
        const activeOnly = opts?.activeOnly !== false;
        const byKey = new Map();
        for (const r of sortDefs(defaultRows)){
            if (activeOnly && !r.is_active) continue;
            byKey.set(r.status_key, r);
        }
        for (const r of orgRows){
            if (activeOnly && !r.is_active) {
                byKey.delete(r.status_key);
            } else {
                byKey.set(r.status_key, r);
            }
        }
        return sortDefs(Array.from(byKey.values()));
    }
    if (orgRows.length > 0) return sortDefs(orgRows);
    const industryKey = await getOrgIndustryKey(supabase, orgId);
    return fetchIndustryDefaultStatusDefinitions(supabase, entityType, industryKey, opts);
}
function displayLabelsFromDefinitions(defs) {
    return new Map(defs.map((d)=>[
            d.status_key,
            d.status_label?.trim() || d.status_key
        ]));
}
function resolveDisplayFromLabelMap(labelByKey, statusKey, legacyFallback) {
    const sk = statusKey != null && String(statusKey).trim() !== "" ? String(statusKey).trim() : null;
    if (sk) return labelByKey.get(sk) ?? sk;
    if (legacyFallback != null && String(legacyFallback).trim() !== "") return String(legacyFallback).trim();
    return null;
}
async function resolveStatusLabel(supabase, orgId, entityType, statusKey) {
    if (statusKey == null || String(statusKey).trim() === "") return null;
    const sk = String(statusKey).trim();
    const defs = await fetchEffectiveStatusDefinitions(supabase, orgId, entityType, {
        activeOnly: true
    });
    const hit = defs.find((d)=>d.status_key === sk);
    if (hit?.status_label && String(hit.status_label).trim()) return String(hit.status_label).trim();
    return sk;
}
function inferDocumentStatusFromStored(defs, stored) {
    if (stored == null || String(stored).trim() === "") return {
        display: null,
        inferredKey: null
    };
    const s = String(stored).trim();
    const byKey = defs.find((d)=>d.status_key === s);
    if (byKey) {
        return {
            display: byKey.status_label?.trim() || byKey.status_key,
            inferredKey: byKey.status_key
        };
    }
    const byLabel = defs.find((d)=>(d.status_label?.trim() ?? "") === s);
    if (byLabel) {
        return {
            display: byLabel.status_label?.trim() || byLabel.status_key,
            inferredKey: byLabel.status_key
        };
    }
    return {
        display: s,
        inferredKey: null
    };
}
async function assertAllowedStatusKey(supabase, orgId, entityType, statusKey) {
    if (statusKey == null || String(statusKey).trim() === "") return {
        ok: true
    };
    const sk = String(statusKey).trim();
    const defs = await fetchEffectiveStatusDefinitions(supabase, orgId, entityType, {
        activeOnly: true
    });
    if (!defs.some((d)=>d.status_key === sk)) {
        return {
            ok: false,
            message: "status_key is not defined for this entity in status_definitions"
        };
    }
    return {
        ok: true
    };
}
}),
"[project]/lib/enrollment/formatTourDateTime.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "formatTourDateTime",
    ()=>formatTourDateTime
]);
function formatTourDateTime(tourDateRaw, tourTimeRaw) {
    const tourDate = typeof tourDateRaw === "string" ? tourDateRaw.trim() : "";
    const tourTime = typeof tourTimeRaw === "string" ? tourTimeRaw.trim() : "";
    const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(tourDate);
    const mmddyyyy = dateMatch ? `${dateMatch[2]}/${dateMatch[3]}/${dateMatch[1]}` : "";
    // Accept HTML <input type="time"> output: "HH:MM"
    const timeMatch24 = /^(\d{1,2}):(\d{2})$/.exec(tourTime);
    let hmAmPm = "";
    if (timeMatch24) {
        const hh = Math.min(23, Math.max(0, Number(timeMatch24[1])));
        const mm = Math.min(59, Math.max(0, Number(timeMatch24[2])));
        const ampm = hh >= 12 ? "PM" : "AM";
        const h12 = hh % 12 === 0 ? 12 : hh % 12;
        hmAmPm = `${h12}:${String(mm).padStart(2, "0")} ${ampm}`;
    } else if (tourTime) {
        // Light normalization for "9:30AM" / "9:30 am" etc.
        const m = /^(\d{1,2}):(\d{2})\s*([AaPp])[Mm]$/.exec(tourTime.replace(/\s+/g, ""));
        if (m) hmAmPm = `${Number(m[1])}:${m[2]} ${m[3].toUpperCase()}M`;
    }
    const hasDate = Boolean(mmddyyyy);
    const hasTime = Boolean(hmAmPm);
    if (!hasDate) return {
        display: "—",
        hasDate: false,
        hasTime: false
    };
    if (!hasTime) return {
        display: mmddyyyy,
        hasDate: true,
        hasTime: false
    };
    return {
        display: `${mmddyyyy} ${hmAmPm}`,
        hasDate: true,
        hasTime: true
    };
}
}),
"[project]/lib/queues/QueueService.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "OPPORTUNITY_HIGH_VALUE_STALE_STATUS_KEY_SET",
    ()=>OPPORTUNITY_HIGH_VALUE_STALE_STATUS_KEY_SET,
    "QueueServiceError",
    ()=>QueueServiceError,
    "__testing",
    ()=>__testing,
    "getDepartmentWorkUnitQueueSummaries",
    ()=>getDepartmentWorkUnitQueueSummaries,
    "getWorkUnitQueueItems",
    ()=>getWorkUnitQueueItems,
    "getWorkUnitQueueSummaries",
    ()=>getWorkUnitQueueSummaries
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabaseAdmin$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/supabaseAdmin.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$config$2f$queueDefinitionSchema$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/config/queueDefinitionSchema.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$workUnitQueueDerived$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/workspace/workUnitQueueDerived.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$statusDefinitionsResolve$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/lib/admin/statusDefinitionsResolve.ts [app-route] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$enrollment$2f$formatTourDateTime$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/enrollment/formatTourDateTime.ts [app-route] (ecmascript)");
;
;
;
;
;
class QueueServiceError extends Error {
    status;
    code;
    constructor(message, status, code){
        super(message);
        this.status = status;
        this.code = code;
    }
}
const JOB_FIELD_ALLOWLIST = new Set([
    "status_key",
    "assigned_vendor_id",
    "work_unit_id",
    "created_at"
]);
const JOB_SORT_ALLOWLIST = new Set([
    "created_at",
    "updated_at",
    "status_key"
]);
const JOB_DATE_FIELD_ALLOWLIST = new Set([
    "created_at"
]);
const OPPORTUNITY_FIELD_ALLOWLIST = new Set([
    "status_key",
    "created_at",
    "updated_at"
]);
const OPPORTUNITY_SORT_ALLOWLIST = new Set([
    "updated_at",
    "created_at",
    "status_key",
    "name"
]);
const OPPORTUNITY_DATE_FIELD_ALLOWLIST = new Set([
    "created_at",
    "updated_at"
]);
function isPlainObject(v) {
    return v != null && typeof v === "object" && !Array.isArray(v);
}
function getStoredQueueDefinitionVersion(raw) {
    if (!isPlainObject(raw)) return null;
    const v = raw.version;
    return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function loadQueueDefinitionOrThrow(raw) {
    try {
        const validated = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$config$2f$queueDefinitionSchema$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["validateQueueDefinition"])(raw);
        return validated;
    } catch  {
        throw new QueueServiceError("Work unit queue_definition is not QueueDefinitionV1", 400, "INVALID_QUEUE_DEFINITION");
    }
}
function findQueueByKey(def, queueKey) {
    const q = def.queues.find((x)=>x.key === queueKey);
    if (!q) {
        throw new QueueServiceError(`Unknown queue key: ${queueKey}`, 404, "UNKNOWN_QUEUE_KEY");
    }
    return q;
}
function assertSupportedEntityType(def) {
    if (def.entity_type === "job") return;
    if (def.entity_type === "opportunity") return;
    throw new QueueServiceError(`QueueService does not support entity_type: ${def.entity_type}`, 501, "NOT_IMPLEMENTED");
}
function startOfTodayServerLocal() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
}
function buildJobPlan(queue) {
    const ops = [];
    for (const f of queue.filters){
        ops.push(...jobFilterToOps(f));
    }
    const sort = [];
    if (queue.sort) {
        for (const s of queue.sort){
            if (!JOB_SORT_ALLOWLIST.has(s.field)) {
                throw new QueueServiceError(`Unsupported job sort field: ${s.field}`, 400, "UNSUPPORTED_SORT_FIELD");
            }
            sort.push({
                column: s.field,
                ascending: s.direction === "asc"
            });
        }
    } else {
        sort.push({
            column: "updated_at",
            ascending: false
        });
    }
    return {
        ops,
        sort
    };
}
function buildOpportunityPlan(queue, now = new Date()) {
    const ops = [];
    for (const f of queue.filters){
        ops.push(...opportunityFilterToOps(f, now));
    }
    const sort = [];
    if (queue.sort) {
        for (const s of queue.sort){
            if (!OPPORTUNITY_SORT_ALLOWLIST.has(s.field)) {
                throw new QueueServiceError(`Unsupported opportunity sort field: ${s.field}`, 400, "UNSUPPORTED_SORT_FIELD");
            }
            sort.push({
                column: s.field,
                ascending: s.direction === "asc"
            });
        }
    } else {
        sort.push({
            column: "updated_at",
            ascending: false
        });
    }
    return {
        ops,
        sort
    };
}
function jobFilterToOps(f) {
    switch(f.type){
        case "status":
            {
                // jobs.status_key IN (...)
                if (f.operator !== "in") {
                    throw new QueueServiceError(`Unsupported status operator: ${String(f.operator)}`, 400, "UNSUPPORTED_OPERATOR");
                }
                const values = (f.values ?? []).filter((x)=>typeof x === "string" && x.trim() !== "");
                return [
                    {
                        kind: "in",
                        column: "status_key",
                        values
                    }
                ];
            }
        case "assignment":
            {
                if (f.operator === "is_null") {
                    return [
                        {
                            kind: "is_null",
                            column: "assigned_vendor_id"
                        }
                    ];
                }
                if (f.operator === "equals") {
                    return [
                        {
                            kind: "eq",
                            column: "assigned_vendor_id",
                            value: f.value
                        }
                    ];
                }
                throw new QueueServiceError(`Unsupported assignment operator: ${String(f.operator)}`, 400, "UNSUPPORTED_OPERATOR");
            }
        case "date":
            {
                if (!JOB_DATE_FIELD_ALLOWLIST.has(f.field)) {
                    throw new QueueServiceError(`Unsupported job date field: ${f.field}`, 400, "UNSUPPORTED_DATE_FIELD");
                }
                const start = startOfTodayServerLocal();
                const startIso = start.toISOString();
                if (f.operator === "today") {
                    const end = new Date(start);
                    end.setDate(end.getDate() + 1);
                    const endIso = end.toISOString();
                    return [
                        {
                            kind: "gte",
                            column: f.field,
                            value: startIso
                        },
                        {
                            kind: "range_lt",
                            column: f.field,
                            value: endIso
                        }
                    ];
                }
                if (f.operator === "past_due") {
                    // NOTE: for created_at this means "created before today". For future due-date fields, this will tighten.
                    return [
                        {
                            kind: "lt",
                            column: f.field,
                            value: startIso
                        }
                    ];
                }
                throw new QueueServiceError(`Unsupported date operator: ${String(f.operator)}`, 400, "UNSUPPORTED_OPERATOR");
            }
        case "field":
            {
                if (!JOB_FIELD_ALLOWLIST.has(f.field_key)) {
                    throw new QueueServiceError(`Unsupported job field: ${f.field_key}`, 400, "UNSUPPORTED_FIELD");
                }
                const col = f.field_key;
                if (f.operator === "eq") return [
                    {
                        kind: "eq",
                        column: col,
                        value: f.value
                    }
                ];
                if (f.operator === "gt") return [
                    {
                        kind: "gt",
                        column: col,
                        value: f.value
                    }
                ];
                if (f.operator === "lt") return [
                    {
                        kind: "lt",
                        column: col,
                        value: f.value
                    }
                ];
                throw new QueueServiceError(`Unsupported field operator: ${String(f.operator)}`, 400, "UNSUPPORTED_OPERATOR");
            }
        case "exception":
            {
                throw new QueueServiceError("exception filter evaluation is not implemented", 501, "NOT_IMPLEMENTED");
            }
        default:
            {
                const _exhaustive = f;
                return _exhaustive;
            }
    }
}
function subtractDays(now, days) {
    return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}
function toIso(d) {
    return d.toISOString();
}
function ageLabelFromDob(dobIso) {
    const ms = Date.parse(dobIso);
    if (!Number.isFinite(ms)) return null;
    const now = new Date();
    const dob = new Date(ms);
    if (Number.isNaN(dob.getTime()) || dob > now) return null;
    let years = now.getFullYear() - dob.getFullYear();
    let months = now.getMonth() - dob.getMonth();
    if (now.getDate() < dob.getDate()) months -= 1;
    if (months < 0) {
        years -= 1;
        months += 12;
    }
    if (years < 0) return null;
    if (years === 0) return `${Math.max(0, months)}mo`;
    return months > 0 ? `${years}y ${months}mo` : `${years}y`;
}
const OPPORTUNITY_HIGH_VALUE_STALE_STATUS_KEY_SET = new Set([
    "tour_scheduled",
    "tour_completed",
    "application_in_progress",
    "ready_to_enroll"
]);
/**
 * PostgREST `or` list must not use `status_key.in.(a,b,c)` — commas inside `in.(...)` break the outer `or` list.
 * One `and(status_key.eq.<key>,updated_at.lt...)` per status (no quotes on keys; `eq.<token>` treats underscores as part of the value).
 */ function buildOpportunityHighValueStaleOrBranches(stale2dIso) {
    return [
        ...OPPORTUNITY_HIGH_VALUE_STALE_STATUS_KEY_SET
    ].sort().map((k)=>`and(status_key.eq.${k},updated_at.lt.${stale2dIso})`).join(",");
}
function opportunityNeedsAttention(row, now) {
    const updatedAt = row.updated_at ? new Date(row.updated_at) : null;
    if (!updatedAt || Number.isNaN(updatedAt.getTime())) return false;
    // 1) stale: updated_at < now - 3 days
    if (updatedAt.getTime() < subtractDays(now, 3).getTime()) return true;
    // 2) missing data (enrollment demo is person-backed; legacy data may still use primary_contact_id)
    const pkg = row.metadata && typeof row.metadata.demo_seed_package === "string" ? String(row.metadata.demo_seed_package) : "";
    const isDemoV2 = pkg === "enrollment_pipeline_demo_v2";
    const hasPerson = row.primary_person_id != null && String(row.primary_person_id).trim() !== "";
    const hasLegacyContact = row.primary_contact_id != null && String(row.primary_contact_id).trim() !== "";
    const missingContactLike = isDemoV2 ? !hasPerson : !(hasPerson || hasLegacyContact);
    if (missingContactLike || row.customer_id == null) return true;
    // 3) value/readiness: active funnel status AND updated_at < now - 2 days
    const sk = (row.status_key ?? "").trim().toLowerCase();
    if (OPPORTUNITY_HIGH_VALUE_STALE_STATUS_KEY_SET.has(sk) && updatedAt.getTime() < subtractDays(now, 2).getTime()) {
        return true;
    }
    return false;
}
function opportunityNeedsAttentionReasonLabel(row, now) {
    const updatedAt = row.updated_at ? new Date(row.updated_at) : null;
    if (!updatedAt || Number.isNaN(updatedAt.getTime())) return null;
    const pkg = row.metadata && typeof row.metadata.demo_seed_package === "string" ? String(row.metadata.demo_seed_package) : "";
    const isDemoV2 = pkg === "enrollment_pipeline_demo_v2";
    const hasPerson = row.primary_person_id != null && String(row.primary_person_id).trim() !== "";
    const hasLegacyContact = row.primary_contact_id != null && String(row.primary_contact_id).trim() !== "";
    const missingContactLike = isDemoV2 ? !hasPerson : !(hasPerson || hasLegacyContact);
    if (missingContactLike || row.customer_id == null) return "Missing contact/customer";
    if (updatedAt.getTime() < subtractDays(now, 3).getTime()) return "Stale > 3 days";
    const sk = (row.status_key ?? "").trim().toLowerCase();
    if (OPPORTUNITY_HIGH_VALUE_STALE_STATUS_KEY_SET.has(sk) && updatedAt.getTime() < subtractDays(now, 2).getTime()) {
        return "High-value stale > 2 days";
    }
    return null;
}
/** When ≥2 canonical children exists, CRM compact renders a stacked group instead of a single merged line. */ function buildStructuredCrmCompactChildren(joinChildNames, inquiryChildren) {
    if (joinChildNames.length >= 2) {
        return joinChildNames.map((full)=>{
            const primary = full.trim();
            return primary ? {
                primary,
                secondary: null
            } : null;
        }).filter((x)=>x != null);
    }
    const icRaw = inquiryChildren.filter((x)=>x != null && typeof x === "object");
    if (icRaw.length >= 2) {
        const out = [];
        for (const raw of icRaw){
            const row = raw;
            const disp = typeof row.display_name === "string" ? row.display_name.trim() : "";
            const pl = typeof row.program_label === "string" ? row.program_label.trim() : typeof row.program_short === "string" ? String(row.program_short).trim() : "";
            const ag = typeof row.age_group === "string" ? row.age_group.trim() : "";
            const detail = [
                pl || null,
                ag || null
            ].filter(Boolean).join(" · ") || null;
            const primary = (disp || detail || "").trim();
            if (!primary) continue;
            const secondary = disp && detail ? detail : null;
            out.push({
                primary,
                secondary
            });
        }
        return out.length >= 2 ? out : undefined;
    }
    return undefined;
}
async function enrichOpportunityRows(params) {
    const { supabase, orgId, rows, effectiveStatusDefs: preloadedDefs, enrichment = "full" } = params;
    const previewLite = enrichment === "queue_preview";
    if (!rows.length) return [];
    const tEnrich0 = Date.now();
    const customerIds = [
        ...new Set(rows.map((r)=>r.customer_id).filter((x)=>typeof x === "string" && x.trim() !== ""))
    ];
    const personIds = [
        ...new Set(rows.map((r)=>r.primary_person_id).filter((x)=>typeof x === "string" && x.trim() !== ""))
    ];
    const contactIds = [
        ...new Set(rows.filter((r)=>{
            const pid = r.primary_person_id;
            const md = r.metadata ?? null;
            const pkg = md && typeof md.demo_seed_package === "string" ? String(md.demo_seed_package) : "";
            // Enrollment demo v2 must never use contacts.
            if (pkg === "enrollment_pipeline_demo_v2") return false;
            return !(typeof pid === "string" && pid.trim());
        }).map((r)=>r.primary_contact_id).filter((x)=>typeof x === "string" && x.trim() !== ""))
    ];
    const opportunityIds = [
        ...new Set(rows.map((r)=>r.id).filter((x)=>typeof x === "string" && x.trim() !== ""))
    ];
    const defsPromise = preloadedDefs != null ? Promise.resolve(preloadedDefs) : (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$statusDefinitionsResolve$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__["fetchEffectiveStatusDefinitions"])(supabase, orgId, "opportunities", {
        activeOnly: true
    });
    const tParallel0 = Date.now();
    const [personsRes, contactsRes, customersRes, ocmsRes, defs] = await Promise.all([
        personIds.length ? supabase.from("persons").select("id, first_name, last_name, email, phone").eq("org_id", orgId).in("id", personIds) : Promise.resolve({
            data: [],
            error: null
        }),
        contactIds.length ? supabase.from("contacts").select("id, first_name, last_name, email, phone, customer_id").eq("org_id", orgId).in("id", contactIds) : Promise.resolve({
            data: [],
            error: null
        }),
        customerIds.length ? supabase.from("customers").select("id, name").eq("org_id", orgId).in("id", customerIds) : Promise.resolve({
            data: [],
            error: null
        }),
        !previewLite && opportunityIds.length ? supabase.from("opportunity_customer_members").select("opportunity_id, customer_members(display_name, dob, person_id)").eq("org_id", orgId).in("opportunity_id", opportunityIds) : Promise.resolve({
            data: [],
            error: null
        }),
        defsPromise
    ]);
    const parallelMainMs = Date.now() - tParallel0;
    const labelByKey = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$statusDefinitionsResolve$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__["displayLabelsFromDefinitions"])(defs);
    const personById = new Map();
    for (const p of personsRes.data ?? [])personById.set(String(p.id), p);
    const contactById = new Map();
    for (const c of contactsRes.data ?? [])contactById.set(String(c.id), c);
    const customerById = new Map();
    for (const c of customersRes.data ?? [])customerById.set(String(c.id), c);
    const tChild0 = Date.now();
    // Child identity is canonical in `persons`. Prefer `persons.date_of_birth` and only
    // fall back to legacy/display `customer_members.dob` when needed.
    const childPersonIds = [];
    for (const row of ocmsRes.data ?? []){
        const cm = row.customer_members;
        const pid = cm && typeof cm === "object" ? String(cm.person_id ?? "").trim() : "";
        if (pid) childPersonIds.push(pid);
    }
    const uniqChildPersonIds = [
        ...new Set(childPersonIds)
    ];
    const { data: childPersons } = !previewLite && uniqChildPersonIds.length > 0 ? await supabase.from("persons").select("id, date_of_birth").eq("org_id", orgId).in("id", uniqChildPersonIds) : {
        data: []
    };
    const childDobByPersonId = new Map();
    for (const p of childPersons ?? []){
        const id = String(p.id ?? "").trim();
        const dob = String(p.date_of_birth ?? "").trim();
        if (id && dob) childDobByPersonId.set(id, dob);
    }
    const childNamesByOppId = new Map();
    for (const row of ocmsRes.data ?? []){
        const oppId = String(row.opportunity_id ?? "");
        if (!oppId) continue;
        const cm = row.customer_members;
        const disp = cm && typeof cm === "object" ? String(cm.display_name ?? "").trim() : "";
        if (!disp) continue;
        const memberDob = cm && typeof cm === "object" ? String(cm.dob ?? "").trim() : "";
        const pid = cm && typeof cm === "object" ? String(cm.person_id ?? "").trim() : "";
        const canonicalDob = pid ? childDobByPersonId.get(pid) ?? "" : "";
        const dob = canonicalDob || memberDob;
        const age = dob ? ageLabelFromDob(dob) : null;
        const label = age ? `${disp} (${age})` : disp;
        const list = childNamesByOppId.get(oppId) ?? [];
        list.push(label);
        childNamesByOppId.set(oppId, list);
    }
    const childResolutionMs = Date.now() - tChild0;
    const tMap0 = Date.now();
    const mapped = rows.map((r)=>{
        const pid = r.primary_person_id ?? null;
        const person = pid ? personById.get(pid) : null;
        const contact = r.primary_contact_id ? contactById.get(r.primary_contact_id) : null;
        const customer = r.customer_id ? customerById.get(r.customer_id) : null;
        const contactName = person && (String(person.first_name ?? "").trim() || String(person.last_name ?? "").trim()) ? [
            person.first_name,
            person.last_name
        ].filter(Boolean).join(" ").trim() : contact && (String(contact.first_name ?? "").trim() || String(contact.last_name ?? "").trim()) ? [
            contact.first_name,
            contact.last_name
        ].filter(Boolean).join(" ").trim() : null;
        const contactEmail = person?.email ?? contact?.email ?? null;
        const contactPhone = person?.phone ?? contact?.phone ?? null;
        const md = r.metadata ?? null;
        const notes = typeof md?.notes === "string" ? md.notes : typeof md?.demo_note === "string" ? md.demo_note : null;
        const nextStepPreview = typeof md?.next_step === "string" ? md.next_step.trim() : null;
        const joinChildNames = childNamesByOppId.get(r.id) ?? [];
        const inquiryChildren = md && Array.isArray(md.inquiry_children) ? (md.inquiry_children ?? []).filter((x)=>x && typeof x === "object") : [];
        let childDisplay = null;
        let programsDisplay = null;
        let programCombined = null;
        let desiredStart = null;
        let tourDate = null;
        let tourTime = null;
        if (joinChildNames.length > 0) {
            childDisplay = joinChildNames.join(" · ");
            const programLabel = typeof md?.program_label === "string" ? md.program_label : null;
            const ageGroup = typeof md?.age_group === "string" ? md.age_group.trim() : null;
            programCombined = [
                programLabel,
                ageGroup
            ].filter((x)=>Boolean(x && x.trim())).join(" · ").trim() || programLabel;
            desiredStart = typeof md?.desired_start_date === "string" ? md.desired_start_date : null;
            tourDate = typeof md?.tour_date === "string" ? md.tour_date : null;
            tourTime = typeof md?.tour_time === "string" ? md.tour_time : null;
        } else if (inquiryChildren.length > 0) {
            const names = [];
            const programs = [];
            for (const raw of inquiryChildren){
                const row = raw;
                const disp = typeof row.display_name === "string" ? row.display_name.trim() : "";
                if (disp) names.push(disp);
                const pl = typeof row.program_label === "string" ? row.program_label.trim() : typeof row.program_short === "string" ? String(row.program_short).trim() : "";
                if (pl) programs.push(pl);
            }
            childDisplay = names.length ? names.join(" · ") : typeof md?.child_name === "string" ? md.child_name : null;
            const uniq = [
                ...new Set(programs.filter(Boolean))
            ];
            programsDisplay = uniq.length ? uniq.join(", ") : null;
            const firstAgeRow = inquiryChildren[0];
            const ageGroup = typeof firstAgeRow.age_group === "string" ? firstAgeRow.age_group.trim() : "";
            programCombined = programsDisplay && ageGroup ? `${programsDisplay} · ${ageGroup}` : programsDisplay ?? (typeof md?.program_label === "string" ? md.program_label : null);
            desiredStart = typeof md?.desired_start_date === "string" ? md.desired_start_date : null;
            tourDate = typeof md?.tour_date === "string" ? md.tour_date : null;
            tourTime = typeof md?.tour_time === "string" ? md.tour_time : null;
        } else {
            const child = typeof md?.child_name === "string" ? md.child_name : null;
            const programLabel = typeof md?.program_label === "string" ? md.program_label : null;
            const ageGroup = typeof md?.age_group === "string" ? md.age_group.trim() : null;
            programCombined = [
                programLabel,
                ageGroup
            ].filter((x)=>Boolean(x && x.trim())).join(" · ").trim() || programLabel;
            childDisplay = child;
            programsDisplay = programLabel;
            desiredStart = typeof md?.desired_start_date === "string" ? md.desired_start_date : null;
            tourDate = typeof md?.tour_date === "string" ? md.tour_date : null;
            tourTime = typeof md?.tour_time === "string" ? md.tour_time : null;
        }
        const sk = (r.status_key ?? "").trim();
        const statusDisplay = sk ? labelByKey.get(sk) ?? sk : null;
        const attentionReason = opportunityNeedsAttentionReasonLabel(r, new Date());
        const tourContext = tourDate ? `Tour: ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$enrollment$2f$formatTourDateTime$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["formatTourDateTime"])(tourDate, tourTime).display}` : null;
        const crmCompactChildrenStructured = buildStructuredCrmCompactChildren(joinChildNames, inquiryChildren);
        return {
            ...r,
            title: r.name ?? null,
            _customer_name: customer?.name ?? null,
            _primary_contact_line: contactName ?? null,
            _primary_phone: contactPhone ?? null,
            _primary_email: contactEmail ?? null,
            _child_display_name: childDisplay,
            _crm_compact_children: crmCompactChildrenStructured,
            _requested_program: inquiryChildren.length > 0 ? programsDisplay ?? programCombined : programCombined,
            _desired_start_date: desiredStart,
            _tour_context: tourContext,
            _notes_preview: notes,
            _next_step_preview: nextStepPreview,
            _status_display: statusDisplay,
            _attention_reason_label: attentionReason
        };
    });
    const mapMs = Date.now() - tMap0;
    const enrichMs = Date.now() - tEnrich0;
    if (enrichMs > 200) {
        console.warn("[queue-perf] enrichOpportunityRows", {
            org_id: orgId,
            row_count: rows.length,
            enrichment: previewLite ? "queue_preview" : "full",
            used_preloaded_defs: preloadedDefs != null,
            parallel_main_ms: parallelMainMs,
            child_resolution_ms: childResolutionMs,
            map_ms: mapMs,
            total_ms: enrichMs
        });
    }
    return mapped;
}
function buildOpportunityNeedsAttentionOrExpr(now) {
    const stale3d = toIso(subtractDays(now, 3));
    const stale2d = toIso(subtractDays(now, 2));
    // PostgREST `or` grammar (used by tests / future SQL); enrollment `needs_attention` queue is evaluated in-memory instead.
    return [
        `updated_at.lt.${stale3d}`,
        "primary_contact_id.is.null",
        "customer_id.is.null",
        buildOpportunityHighValueStaleOrBranches(stale2d)
    ].join(",");
}
/** Cap for in-memory needs_attention evaluation (avoids fragile nested `or`/`and` PostgREST URL parsing). */ const NEEDS_ATTENTION_OPPORTUNITY_FETCH_CAP = 5000;
/**
 * When queue summaries only need counts (department cards), use a smaller cap so we do not pull 5k rows
 * per work unit. Count may under-count if more opportunities match than this cap (same class as the 5k cap).
 */ const NEEDS_ATTENTION_COUNT_ONLY_FETCH_CAP = 800;
function sortOpportunityRowsByPlan(rows, sort) {
    if (!rows.length) return rows;
    const plans = sort.length ? sort : [
        {
            column: "updated_at",
            ascending: true
        }
    ];
    return [
        ...rows
    ].sort((a, b)=>{
        for (const p of plans){
            const av = a[p.column];
            const bv = b[p.column];
            const as = av == null ? "" : String(av);
            const bs = bv == null ? "" : String(bv);
            if (as < bs) return p.ascending ? -1 : 1;
            if (as > bs) return p.ascending ? 1 : -1;
        }
        return 0;
    });
}
async function loadOpportunityNeedsAttentionRows(params) {
    const cap = params.fetchCap ?? NEEDS_ATTENTION_OPPORTUNITY_FETCH_CAP;
    let q = params.supabase.from("opportunities").select("id, name, title, status_key, customer_id, primary_person_id, primary_contact_id, work_unit_id, metadata, created_at, updated_at").eq("org_id", params.orgId).eq("work_unit_id", params.workUnitId);
    const plans = params.sort.length ? params.sort : [
        {
            column: "updated_at",
            ascending: true
        }
    ];
    for (const p of plans){
        q = q.order(p.column, {
            ascending: p.ascending
        });
    }
    const { data, error } = await q.limit(cap);
    if (error) {
        throw new QueueServiceError(error.message, 400, "DB_ERROR");
    }
    const rows = data ?? [];
    const filtered = rows.filter((r)=>opportunityNeedsAttention(r, params.now));
    return sortOpportunityRowsByPlan(filtered, params.sort);
}
function opportunityFilterToOps(f, now) {
    switch(f.type){
        case "status":
            {
                if (f.operator !== "in") {
                    throw new QueueServiceError(`Unsupported status operator: ${String(f.operator)}`, 400, "UNSUPPORTED_OPERATOR");
                }
                const values = (f.values ?? []).filter((x)=>typeof x === "string" && x.trim() !== "");
                return [
                    {
                        kind: "in",
                        column: "status_key",
                        values
                    }
                ];
            }
        case "field":
            {
                if (!OPPORTUNITY_FIELD_ALLOWLIST.has(f.field_key)) {
                    throw new QueueServiceError(`Unsupported opportunity field: ${f.field_key}`, 400, "UNSUPPORTED_FIELD");
                }
                const col = f.field_key;
                if (f.operator === "eq") return [
                    {
                        kind: "eq",
                        column: col,
                        value: f.value
                    }
                ];
                if (f.operator === "gt") return [
                    {
                        kind: "gt",
                        column: col,
                        value: f.value
                    }
                ];
                if (f.operator === "lt") return [
                    {
                        kind: "lt",
                        column: col,
                        value: f.value
                    }
                ];
                throw new QueueServiceError(`Unsupported field operator: ${String(f.operator)}`, 400, "UNSUPPORTED_OPERATOR");
            }
        case "date":
            {
                if (!OPPORTUNITY_DATE_FIELD_ALLOWLIST.has(f.field)) {
                    throw new QueueServiceError(`Unsupported opportunity date field: ${f.field}`, 400, "UNSUPPORTED_DATE_FIELD");
                }
                const start = startOfTodayServerLocal();
                const startIso = start.toISOString();
                if (f.operator === "today") {
                    const end = new Date(start);
                    end.setDate(end.getDate() + 1);
                    const endIso = end.toISOString();
                    return [
                        {
                            kind: "gte",
                            column: f.field,
                            value: startIso
                        },
                        {
                            kind: "range_lt",
                            column: f.field,
                            value: endIso
                        }
                    ];
                }
                if (f.operator === "past_due") {
                    return [
                        {
                            kind: "lt",
                            column: f.field,
                            value: startIso
                        }
                    ];
                }
                throw new QueueServiceError(`Unsupported date operator: ${String(f.operator)}`, 400, "UNSUPPORTED_OPERATOR");
            }
        case "exception":
            {
                if (f.operator !== "exists") {
                    throw new QueueServiceError(`Unsupported exception operator: ${String(f.operator)}`, 400, "UNSUPPORTED_OPERATOR");
                }
                // Minimal needs-attention v1: stale OR missing data OR high-value stale.
                return [
                    {
                        kind: "or",
                        expr: buildOpportunityNeedsAttentionOrExpr(now)
                    }
                ];
            }
        case "assignment":
            {
                throw new QueueServiceError("assignment filter is not supported for opportunities", 400, "UNSUPPORTED_FILTER");
            }
        default:
            {
                const _exhaustive = f;
                return _exhaustive;
            }
    }
}
function applyOpsToJobQuery(q, ops) {
    let out = q;
    for (const op of ops){
        switch(op.kind){
            case "eq":
                out = out.eq(op.column, op.value);
                break;
            case "gt":
                out = out.gt(op.column, op.value);
                break;
            case "lt":
                out = out.lt(op.column, op.value);
                break;
            case "in":
                out = out.in(op.column, op.values);
                break;
            case "is_null":
                out = out.is(op.column, null);
                break;
            case "gte":
                out = out.gte(op.column, op.value);
                break;
            case "range_lt":
                out = out.lt(op.column, op.value);
                break;
            case "or":
                out = out.or(op.expr);
                break;
        }
    }
    return out;
}
function applySortToJobQuery(q, sort) {
    let out = q;
    for (const s of sort){
        out = out.order(s.column, {
            ascending: s.ascending
        });
    }
    return out;
}
async function loadWorkUnitQueueDefinition(params) {
    const supabase = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabaseAdmin$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["createAdminClient"])();
    const { data, error } = await supabase.from("work_units").select("id, org_id, queue_definition").eq("id", params.workUnitId).eq("org_id", params.orgId).maybeSingle();
    if (error) {
        throw new QueueServiceError(error.message, 400, "DB_ERROR");
    }
    if (!data) {
        throw new QueueServiceError("Work unit not found", 404, "NOT_FOUND");
    }
    const raw = data.queue_definition;
    const storedVersion = getStoredQueueDefinitionVersion(raw);
    if (raw == null || isPlainObject(raw) && Object.keys(raw).length === 0) {
        throw new QueueServiceError("Work unit has no queue_definition configured", 400, "MISSING_QUEUE_DEFINITION");
    }
    if (storedVersion !== null && storedVersion !== 1) {
        throw new QueueServiceError("Unsupported stored queue_definition version", 400, "UNSUPPORTED_VERSION");
    }
    return loadQueueDefinitionOrThrow(raw);
}
function clampLimit(n, min, max) {
    const v = Math.floor(Number.isFinite(n) ? n : min);
    if (v < min) return min;
    if (v > max) return max;
    return v;
}
function queueCountSelect(accuracy) {
    return accuracy === "planned" ? "planned" : "exact";
}
function buildPriorityQueueKeySet(def, focusKey, budget) {
    const ordered = def.queues.map((q)=>q.key);
    const set = new Set();
    if (ordered.includes("needs_attention")) set.add("needs_attention");
    const focus = (focusKey ?? "").trim();
    if (focus && ordered.includes(focus)) set.add(focus);
    for (const k of ordered){
        if (set.size >= budget) break;
        set.add(k);
    }
    return set;
}
function stubDeferredQueueSummary(q, def) {
    const et = def.entity_type === "job" ? "job" : "opportunity";
    return {
        key: q.key,
        label: q.label,
        description: q.description,
        entity_type: et,
        priority: q.priority ?? "standard",
        display: q.display ?? "list",
        count: 0,
        preview: [],
        counts_deferred: true
    };
}
/** Bounded parallelism for queue summaries within one work unit (avoid sequential latency; cap DB pressure). */ const QUEUE_SUMMARY_PER_DEF_CONCURRENCY = 5;
async function runPool(factories, poolSize) {
    const nFac = factories.length;
    if (nFac === 0) return [];
    const results = new Array(nFac);
    let cursor = 0;
    async function worker() {
        while(true){
            const i = cursor;
            cursor += 1;
            if (i >= nFac) return;
            results[i] = await factories[i]();
        }
    }
    const workers = Math.min(Math.max(1, Math.floor(poolSize)), nFac);
    await Promise.all(Array.from({
        length: workers
    }, ()=>worker()));
    return results;
}
async function getWorkUnitQueueSummaries(params) {
    const includePreviews = params.includePreviews !== false;
    const countSel = queueCountSelect(params.countAccuracy);
    const tW0 = Date.now();
    const tDef0 = Date.now();
    const def = await loadWorkUnitQueueDefinition({
        orgId: params.orgId,
        workUnitId: params.workUnitId
    });
    const loadDefMs = Date.now() - tDef0;
    assertSupportedEntityType(def);
    const supabase = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabaseAdmin$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["createAdminClient"])();
    const previewLimit = clampLimit(params.limit ?? 3, 1, 10);
    const summaryMode = params.summaryMode ?? "all";
    const priorityBudget = clampLimit(params.priorityBudget ?? 6, 1, 20);
    let activeKeySet = null;
    let deferredQueueKeys;
    if (summaryMode === "partial") {
        if (!params.partialQueueKeys || params.partialQueueKeys.size === 0) {
            return {
                queues: []
            };
        }
        activeKeySet = params.partialQueueKeys;
    } else if (summaryMode === "priority") {
        activeKeySet = buildPriorityQueueKeySet(def, params.focusQueueKey ?? null, priorityBudget);
        deferredQueueKeys = def.queues.map((q)=>q.key).filter((k)=>!activeKeySet.has(k));
    }
    let opportunityStatusDefsPromise = null;
    const sharedOpportunityStatusDefs = ()=>{
        if (!opportunityStatusDefsPromise) {
            opportunityStatusDefsPromise = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$statusDefinitionsResolve$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__["fetchEffectiveStatusDefinitions"])(supabase, params.orgId, "opportunities", {
                activeOnly: true
            });
        }
        return opportunityStatusDefsPromise;
    };
    const perQueueMs = new Array(def.queues.length).fill(null);
    const factories = def.queues.map((q, queueIndex)=>async ()=>{
            if (activeKeySet != null && !activeKeySet.has(q.key)) {
                return null;
            }
            const qT0 = Date.now();
            let countMs = 0;
            let previewMs = 0;
            let enrichMs = 0;
            let needsAttentionLoadMs = 0;
            let rowsEnriched = 0;
            const finish = (summary)=>{
                perQueueMs[queueIndex] = {
                    key: q.key,
                    count_ms: countMs,
                    preview_ms: previewMs,
                    enrich_ms: enrichMs,
                    needs_attention_load_ms: needsAttentionLoadMs,
                    total_ms: Date.now() - qT0,
                    rows_enriched: rowsEnriched
                };
                return summary;
            };
            if (def.entity_type === "job") {
                const { ops, sort } = buildJobPlan(q);
                const tC0 = Date.now();
                const base = supabase.from("jobs").select("id", {
                    count: countSel,
                    head: true
                }).eq("org_id", params.orgId).eq("work_unit_id", params.workUnitId);
                const countQ = applyOpsToJobQuery(base, ops);
                const { count, error: countErr } = await countQ;
                countMs = Date.now() - tC0;
                if (countErr) {
                    throw new QueueServiceError(countErr.message, 400, "DB_ERROR");
                }
                if (!includePreviews) {
                    return finish({
                        key: q.key,
                        label: q.label,
                        description: q.description,
                        entity_type: def.entity_type,
                        priority: q.priority ?? "standard",
                        display: q.display ?? "list",
                        count: count ?? 0,
                        preview: []
                    });
                }
                const tP0 = Date.now();
                const previewQ0 = supabase.from("jobs").select("id, title, status_key, work_unit_id, assigned_vendor_id, created_at, updated_at").eq("org_id", params.orgId).eq("work_unit_id", params.workUnitId);
                const previewQ1 = applySortToJobQuery(applyOpsToJobQuery(previewQ0, ops), sort);
                const { data: preview, error: previewErr } = await previewQ1.limit(previewLimit);
                previewMs = Date.now() - tP0;
                if (previewErr) {
                    throw new QueueServiceError(previewErr.message, 400, "DB_ERROR");
                }
                return finish({
                    key: q.key,
                    label: q.label,
                    description: q.description,
                    entity_type: def.entity_type,
                    priority: q.priority ?? "standard",
                    display: q.display ?? "list",
                    count: count ?? 0,
                    preview: preview ?? []
                });
            }
            // opportunity
            let ops = [];
            let sort = [];
            try {
                const plan = buildOpportunityPlan(q);
                ops = plan.ops;
                sort = plan.sort;
            } catch (e) {
                if (e instanceof QueueServiceError && e.status === 501) {
                    return finish({
                        key: q.key,
                        label: q.label,
                        description: q.description,
                        entity_type: def.entity_type,
                        priority: q.priority ?? "standard",
                        display: q.display ?? "list",
                        count: 0,
                        preview: []
                    });
                }
                throw e;
            }
            if (q.key === "needs_attention") {
                const now = new Date();
                const tN0 = Date.now();
                const matched = await loadOpportunityNeedsAttentionRows({
                    supabase,
                    orgId: params.orgId,
                    workUnitId: params.workUnitId,
                    sort,
                    now,
                    fetchCap: includePreviews ? undefined : NEEDS_ATTENTION_COUNT_ONLY_FETCH_CAP
                });
                needsAttentionLoadMs = Date.now() - tN0;
                if (!includePreviews) {
                    return finish({
                        key: q.key,
                        label: q.label,
                        description: q.description,
                        entity_type: def.entity_type,
                        priority: q.priority ?? "standard",
                        display: q.display ?? "list",
                        count: matched.length,
                        preview: []
                    });
                }
                const previewRows = matched.slice(0, previewLimit);
                rowsEnriched = previewRows.length;
                const tE0 = Date.now();
                const effectiveStatusDefs = await sharedOpportunityStatusDefs();
                const preview = await enrichOpportunityRows({
                    supabase,
                    orgId: params.orgId,
                    rows: previewRows,
                    effectiveStatusDefs,
                    enrichment: "queue_preview"
                });
                enrichMs = Date.now() - tE0;
                return finish({
                    key: q.key,
                    label: q.label,
                    description: q.description,
                    entity_type: def.entity_type,
                    priority: q.priority ?? "standard",
                    display: q.display ?? "list",
                    count: matched.length,
                    preview: preview
                });
            }
            const tC0 = Date.now();
            const base = supabase.from("opportunities").select("id", {
                count: countSel,
                head: true
            }).eq("org_id", params.orgId).eq("work_unit_id", params.workUnitId);
            const countQ = applyOpsToJobQuery(base, ops);
            const { count, error: countErr } = await countQ;
            countMs = Date.now() - tC0;
            if (countErr) {
                throw new QueueServiceError(countErr.message, 400, "DB_ERROR");
            }
            if (!includePreviews) {
                return finish({
                    key: q.key,
                    label: q.label,
                    description: q.description,
                    entity_type: def.entity_type,
                    priority: q.priority ?? "standard",
                    display: q.display ?? "list",
                    count: count ?? 0,
                    preview: []
                });
            }
            const tP0 = Date.now();
            const previewQ0 = supabase.from("opportunities").select("id, name, title, status_key, customer_id, primary_person_id, primary_contact_id, work_unit_id, metadata, created_at, updated_at").eq("org_id", params.orgId).eq("work_unit_id", params.workUnitId);
            const previewQ1 = applySortToJobQuery(applyOpsToJobQuery(previewQ0, ops), sort);
            const { data: previewRaw, error: previewErr } = await previewQ1.limit(previewLimit);
            previewMs = Date.now() - tP0;
            if (previewErr) {
                throw new QueueServiceError(previewErr.message, 400, "DB_ERROR");
            }
            const previewRows = previewRaw ?? [];
            rowsEnriched = previewRows.length;
            const tE0 = Date.now();
            const effectiveStatusDefs = await sharedOpportunityStatusDefs();
            const preview = await enrichOpportunityRows({
                supabase,
                orgId: params.orgId,
                rows: previewRows,
                effectiveStatusDefs,
                enrichment: "queue_preview"
            });
            enrichMs = Date.now() - tE0;
            return finish({
                key: q.key,
                label: q.label,
                description: q.description,
                entity_type: def.entity_type,
                priority: q.priority ?? "standard",
                display: q.display ?? "list",
                count: count ?? 0,
                preview: preview
            });
        });
    const rowResults = await runPool(factories, QUEUE_SUMMARY_PER_DEF_CONCURRENCY);
    const totalMs = Date.now() - tW0;
    const queuesDetailed = perQueueMs.filter(Boolean);
    const rowsEnrichedTotal = queuesDetailed.reduce((a, r)=>a + (r?.rows_enriched ?? 0), 0);
    if (totalMs > 300) {
        console.warn("[queue-perf] getWorkUnitQueueSummaries", {
            work_unit_id: params.workUnitId,
            tag: params.perfTag,
            include_previews: includePreviews,
            count_accuracy: countSel,
            summary_mode: summaryMode,
            queue_count: def.queues.length,
            load_def_ms: loadDefMs,
            total_ms: totalMs,
            rows_enriched_total: rowsEnrichedTotal,
            queues: queuesDetailed,
            deferred_queue_keys: deferredQueueKeys
        });
    }
    if (summaryMode === "partial") {
        return {
            queues: rowResults.filter((x)=>x != null)
        };
    }
    const summaries = def.queues.map((q, i)=>{
        const r = rowResults[i];
        if (r) return r;
        return stubDeferredQueueSummary(q, def);
    });
    const scopeMeta = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$workUnitQueueDerived$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["workUnitScopeTotalFromSummaries"])(def, summaries);
    const scopePayload = {
        work_unit_scope_total: scopeMeta.total,
        work_unit_scope_queue_key: scopeMeta.queueKey
    };
    return deferredQueueKeys?.length ? {
        queues: summaries,
        deferred_queue_keys: deferredQueueKeys,
        ...scopePayload
    } : {
        queues: summaries,
        ...scopePayload
    };
}
const DEPARTMENT_WU_SUMMARY_CONCURRENCY = 3;
async function getDepartmentWorkUnitQueueSummaries(params) {
    const includePreviews = params.includePreviews !== false;
    const countAccuracy = params.countAccuracy;
    const supabase = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabaseAdmin$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["createAdminClient"])();
    const { data: rows, error } = await supabase.from("work_units").select("id").eq("org_id", params.orgId).eq("department_id", params.departmentId).order("sort_order", {
        ascending: true
    });
    if (error) {
        throw new QueueServiceError(error.message, 400, "DB_ERROR");
    }
    const ids = (rows ?? []).map((r)=>String(r.id ?? "").trim()).filter(Boolean);
    const previewLimit = clampLimit(params.limit ?? 50, 1, 100);
    const wuConc = clampLimit(params.workUnitConcurrency ?? DEPARTMENT_WU_SUMMARY_CONCURRENCY, 1, 8);
    const tBatch0 = Date.now();
    const factories = ids.map((workUnitId)=>async ()=>{
            const tWu0 = Date.now();
            try {
                const { queues, work_unit_scope_total, work_unit_scope_queue_key } = await getWorkUnitQueueSummaries({
                    orgId: params.orgId,
                    workUnitId,
                    limit: previewLimit,
                    includePreviews,
                    perfTag: `dept:${params.departmentId}`,
                    countAccuracy
                });
                const ms = Date.now() - tWu0;
                console.warn("[queue-perf] getDepartmentWorkUnitQueueSummaries work_unit", {
                    ms,
                    department_id: params.departmentId,
                    work_unit_id: workUnitId,
                    include_previews: includePreviews,
                    count_accuracy: countAccuracy ?? "exact",
                    queue_count: queues.length
                });
                return {
                    id: workUnitId,
                    queues,
                    work_unit_scope_total: work_unit_scope_total ?? null,
                    work_unit_scope_queue_key: work_unit_scope_queue_key ?? null
                };
            } catch (e) {
                const msg = e instanceof QueueServiceError ? e.message : e instanceof Error && e.message ? e.message : "Queue summaries failed";
                return {
                    id: workUnitId,
                    queues: [],
                    error: msg
                };
            }
        });
    const work_units = await runPool(factories, wuConc);
    const batchMs = Date.now() - tBatch0;
    if (batchMs > 400) {
        console.warn("[queue-perf] getDepartmentWorkUnitQueueSummaries batch", {
            total_ms: batchMs,
            department_id: params.departmentId,
            work_unit_count: ids.length,
            include_previews: includePreviews,
            count_accuracy: countAccuracy ?? "exact"
        });
    }
    return {
        work_units
    };
}
async function getWorkUnitQueueItems(params) {
    const tSvc0 = Date.now();
    const def = await loadWorkUnitQueueDefinition({
        orgId: params.orgId,
        workUnitId: params.workUnitId
    });
    const loadDefMs = Date.now() - tSvc0;
    assertSupportedEntityType(def);
    const q = findQueueByKey(def, params.queueKey);
    const supabase = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabaseAdmin$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["createAdminClient"])();
    const effectiveLimit = clampLimit(params.limit ?? q.limit ?? 50, 1, 200);
    const effectiveOffset = clampLimit(params.offset ?? 0, 0, 1000000);
    const omitTotal = params.omitTotalCount === true;
    const countSel = omitTotal ? null : queueCountSelect(params.countAccuracy);
    if (def.entity_type === "job") {
        const { ops, sort } = buildJobPlan(q);
        const itemsBase = supabase.from("jobs").select("id, title, status_key, work_unit_id, assigned_vendor_id, created_at, updated_at").eq("org_id", params.orgId).eq("work_unit_id", params.workUnitId);
        const itemsQ0 = applySortToJobQuery(applyOpsToJobQuery(itemsBase, ops), sort);
        const itemsPromise = itemsQ0.range(effectiveOffset, effectiveOffset + effectiveLimit - 1);
        if (omitTotal) {
            const { data, error } = await itemsPromise;
            if (error) {
                throw new QueueServiceError(error.message, 400, "DB_ERROR");
            }
            const ms = Date.now() - tSvc0;
            if (ms > 250) {
                console.warn("[queue-perf] getWorkUnitQueueItems job", {
                    ms,
                    load_def_ms: loadDefMs,
                    omit_total: true,
                    queue_key: q.key
                });
            }
            return {
                queue: {
                    key: q.key,
                    label: q.label,
                    description: q.description,
                    entity_type: def.entity_type,
                    priority: q.priority ?? "standard",
                    display: q.display ?? "list"
                },
                items: data ?? [],
                total: 0,
                limit: effectiveLimit,
                offset: effectiveOffset,
                total_omitted: true
            };
        }
        const countBase = supabase.from("jobs").select("id", {
            count: countSel,
            head: true
        }).eq("org_id", params.orgId).eq("work_unit_id", params.workUnitId);
        const countQ = applyOpsToJobQuery(countBase, ops);
        const [{ count, error: countErr }, { data, error }] = await Promise.all([
            countQ,
            itemsPromise
        ]);
        if (countErr) {
            throw new QueueServiceError(countErr.message, 400, "DB_ERROR");
        }
        if (error) {
            throw new QueueServiceError(error.message, 400, "DB_ERROR");
        }
        const ms = Date.now() - tSvc0;
        if (ms > 250) {
            console.warn("[queue-perf] getWorkUnitQueueItems job", {
                ms,
                load_def_ms: loadDefMs,
                queue_key: q.key,
                count_accuracy: countSel
            });
        }
        return {
            queue: {
                key: q.key,
                label: q.label,
                description: q.description,
                entity_type: def.entity_type,
                priority: q.priority ?? "standard",
                display: q.display ?? "list"
            },
            items: data ?? [],
            total: count ?? 0,
            limit: effectiveLimit,
            offset: effectiveOffset
        };
    }
    // opportunity
    const { ops, sort } = buildOpportunityPlan(q);
    const oppStatusDefsPromise = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$statusDefinitionsResolve$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__["fetchEffectiveStatusDefinitions"])(supabase, params.orgId, "opportunities", {
        activeOnly: true
    });
    if (params.queueKey === "needs_attention") {
        const now = new Date();
        const tNa0 = Date.now();
        const [matched, effectiveStatusDefs] = await Promise.all([
            loadOpportunityNeedsAttentionRows({
                supabase,
                orgId: params.orgId,
                workUnitId: params.workUnitId,
                sort,
                now
            }),
            oppStatusDefsPromise
        ]);
        const naLoadMs = Date.now() - tNa0;
        const slice = matched.slice(effectiveOffset, effectiveOffset + effectiveLimit);
        const tEn0 = Date.now();
        const items = await enrichOpportunityRows({
            supabase,
            orgId: params.orgId,
            rows: slice,
            effectiveStatusDefs,
            enrichment: "full"
        });
        const enrichMs = Date.now() - tEn0;
        const ms = Date.now() - tSvc0;
        if (ms > 250) {
            console.warn("[queue-perf] getWorkUnitQueueItems opportunity needs_attention", {
                ms,
                load_def_ms: loadDefMs,
                na_load_ms: naLoadMs,
                enrich_ms: enrichMs,
                row_count: slice.length
            });
        }
        return {
            queue: {
                key: q.key,
                label: q.label,
                description: q.description,
                entity_type: def.entity_type,
                priority: q.priority ?? "standard",
                display: q.display ?? "list"
            },
            items: items,
            total: matched.length,
            limit: effectiveLimit,
            offset: effectiveOffset
        };
    }
    const itemsBase = supabase.from("opportunities").select("id, name, status_key, customer_id, primary_person_id, primary_contact_id, metadata, created_at, updated_at").eq("org_id", params.orgId).eq("work_unit_id", params.workUnitId);
    const itemsQ0 = applySortToJobQuery(applyOpsToJobQuery(itemsBase, ops), sort);
    const itemsPromise = itemsQ0.range(effectiveOffset, effectiveOffset + effectiveLimit - 1);
    if (omitTotal) {
        const [{ data: raw, error }, effectiveStatusDefs] = await Promise.all([
            itemsPromise,
            oppStatusDefsPromise
        ]);
        if (error) {
            throw new QueueServiceError(error.message, 400, "DB_ERROR");
        }
        const itemRows = raw ?? [];
        const tEn0 = Date.now();
        const items = await enrichOpportunityRows({
            supabase,
            orgId: params.orgId,
            rows: itemRows,
            effectiveStatusDefs,
            enrichment: "full"
        });
        const enrichMs = Date.now() - tEn0;
        const ms = Date.now() - tSvc0;
        if (ms > 250) {
            console.warn("[queue-perf] getWorkUnitQueueItems opportunity", {
                ms,
                load_def_ms: loadDefMs,
                enrich_ms: enrichMs,
                row_count: itemRows.length,
                omit_total: true,
                queue_key: q.key
            });
        }
        return {
            queue: {
                key: q.key,
                label: q.label,
                description: q.description,
                entity_type: def.entity_type,
                priority: q.priority ?? "standard",
                display: q.display ?? "list"
            },
            items: items,
            total: 0,
            limit: effectiveLimit,
            offset: effectiveOffset,
            total_omitted: true
        };
    }
    const countBase = supabase.from("opportunities").select("id", {
        count: countSel,
        head: true
    }).eq("org_id", params.orgId).eq("work_unit_id", params.workUnitId);
    const countQ = applyOpsToJobQuery(countBase, ops);
    const [{ count, error: countErr }, { data: raw, error }, effectiveStatusDefs] = await Promise.all([
        countQ,
        itemsPromise,
        oppStatusDefsPromise
    ]);
    if (countErr) {
        throw new QueueServiceError(countErr.message, 400, "DB_ERROR");
    }
    if (error) {
        throw new QueueServiceError(error.message, 400, "DB_ERROR");
    }
    const itemRows = raw ?? [];
    const tEn0 = Date.now();
    const items = await enrichOpportunityRows({
        supabase,
        orgId: params.orgId,
        rows: itemRows,
        effectiveStatusDefs,
        enrichment: "full"
    });
    const enrichMs = Date.now() - tEn0;
    const ms = Date.now() - tSvc0;
    if (ms > 250) {
        console.warn("[queue-perf] getWorkUnitQueueItems opportunity", {
            ms,
            load_def_ms: loadDefMs,
            enrich_ms: enrichMs,
            row_count: itemRows.length,
            queue_key: q.key,
            count_accuracy: countSel
        });
    }
    return {
        queue: {
            key: q.key,
            label: q.label,
            description: q.description,
            entity_type: def.entity_type,
            priority: q.priority ?? "standard",
            display: q.display ?? "list"
        },
        items: items,
        total: count ?? 0,
        limit: effectiveLimit,
        offset: effectiveOffset
    };
}
const __testing = {
    buildJobPlan,
    buildOpportunityPlan,
    buildOpportunityNeedsAttentionOrExpr,
    opportunityNeedsAttention,
    findQueueByKey,
    assertSupportedEntityType
};
}),
"[project]/app/api/admin/departments/[departmentId]/work-unit-queue-summaries/route.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "GET",
    ()=>GET
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/server.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabaseAdmin$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/supabaseAdmin.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$getAdminContext$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/getAdminContext.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$assertRowOrg$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/assertRowOrg.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$queues$2f$QueueService$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/queues/QueueService.ts [app-route] (ecmascript)");
;
;
;
;
;
function parseLimit(searchParams) {
    const raw = (searchParams.get("limit") ?? "").trim();
    if (!raw) return undefined;
    const n = Number(raw);
    if (!Number.isFinite(n)) throw new __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$queues$2f$QueueService$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["QueueServiceError"]("limit must be a number", 400, "VALIDATION_FAILED");
    const i = Math.floor(n);
    if (i < 1) throw new __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$queues$2f$QueueService$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["QueueServiceError"]("limit must be >= 1", 400, "VALIDATION_FAILED");
    return Math.min(i, 100);
}
function parseWuConcurrency(searchParams) {
    const raw = (searchParams.get("wu_concurrency") ?? "").trim();
    if (!raw) return undefined;
    const n = Number(raw);
    if (!Number.isFinite(n)) throw new __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$queues$2f$QueueService$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["QueueServiceError"]("wu_concurrency must be a number", 400, "VALIDATION_FAILED");
    const i = Math.floor(n);
    if (i < 1) throw new __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$queues$2f$QueueService$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["QueueServiceError"]("wu_concurrency must be >= 1", 400, "VALIDATION_FAILED");
    return Math.min(i, 8);
}
function parseCountMode(searchParams) {
    const raw = (searchParams.get("count_mode") ?? "").trim().toLowerCase();
    if (!raw || raw === "exact") return undefined;
    if (raw === "planned") return "planned";
    throw new __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$queues$2f$QueueService$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["QueueServiceError"]("count_mode must be exact or planned", 400, "VALIDATION_FAILED");
}
async function GET(request, context) {
    const ctx = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$getAdminContext$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["getAdminContext"])();
    if (!ctx.ok) return (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$getAdminContext$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["adminContextFailureResponse"])(ctx);
    const { departmentId } = await context.params;
    if (!departmentId) return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
        error: "Missing department id"
    }, {
        status: 400
    });
    const supabase = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabaseAdmin$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["createAdminClient"])();
    const deptOk = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$assertRowOrg$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["assertRowOrg"])(supabase, "departments", departmentId, ctx.orgId);
    if (!deptOk.ok) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: "Not found"
        }, {
            status: 404
        });
    }
    const t0 = Date.now();
    try {
        const limit = parseLimit(request.nextUrl.searchParams);
        const workUnitConcurrency = parseWuConcurrency(request.nextUrl.searchParams);
        const includePreviews = request.nextUrl.searchParams.get("include_previews") !== "false";
        const countAccuracy = parseCountMode(request.nextUrl.searchParams);
        const payload = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$queues$2f$QueueService$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["getDepartmentWorkUnitQueueSummaries"])({
            orgId: ctx.orgId,
            departmentId,
            limit,
            workUnitConcurrency,
            includePreviews,
            countAccuracy
        });
        const ms = Date.now() - t0;
        if (ms > 400) {
            console.warn("[admin-timing] GET /api/admin/departments/[id]/work-unit-queue-summaries", {
                ms,
                department_id: departmentId,
                work_units: payload.work_units.length,
                include_previews: request.nextUrl.searchParams.get("include_previews") !== "false",
                count_mode: request.nextUrl.searchParams.get("count_mode") || "exact"
            });
        }
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json(payload);
    } catch (e) {
        if (e instanceof __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$queues$2f$QueueService$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["QueueServiceError"]) {
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                error: e.message,
                code: e.code
            }, {
                status: e.status
            });
        }
        const msg = e instanceof Error && e.message ? e.message : "Unexpected error";
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: msg
        }, {
            status: 500
        });
    }
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__e69ad29f._.js.map