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
"[project]/lib/adminAuth.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Admin portal auth: role-based access (admin / ops).
 * Resolved from user_profiles, then user_roles, then app_users — no email allowlist.
 * V1 roles: admin (full access), ops (read-only). All other roles are denied.
 */ __turbopack_context__.s([
    "getAdminAuth",
    ()=>getAdminAuth,
    "logAdminAudit",
    ()=>logAdminAudit,
    "requireAdmin",
    ()=>requireAdmin,
    "requireAdminOrOps",
    ()=>requireAdminOrOps
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/server.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabaseAdmin$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/supabaseAdmin.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$cachedAuthSession$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/cachedAuthSession.ts [app-route] (ecmascript)");
;
;
;
const ALLOWED_ROLES = [
    "admin",
    "ops"
];
async function getAdminAuth() {
    const t0 = Date.now();
    const user = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$cachedAuthSession$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["getCachedAuthUser"])();
    const authUserMs = Date.now() - t0;
    if (!user?.id) return null;
    const t1 = Date.now();
    const admin = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabaseAdmin$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["createAdminClient"])();
    const { data: profile } = await admin.from("user_profiles").select("role").eq("id", user.id).maybeSingle();
    let role = null;
    const pr = profile && typeof profile.role === "string" ? profile.role : null;
    if (pr && ALLOWED_ROLES.includes(pr)) {
        role = pr;
    }
    if (!role) {
        const { data: urRows } = await admin.from("user_roles").select("role, org_id").eq("user_id", user.id);
        const rows = Array.isArray(urRows) ? urRows : [];
        const pick = rows.find((r)=>r && typeof r.role === "string" && ALLOWED_ROLES.includes(r.role) && typeof r.org_id === "string" && r.org_id.length > 0);
        if (pick?.role) {
            role = pick.role;
        }
    }
    if (!role) {
        const { data: au } = await admin.from("app_users").select("role").eq("id", user.id).maybeSingle();
        const ar = au && typeof au.role === "string" ? au.role : null;
        if (ar && ALLOWED_ROLES.includes(ar)) {
            role = ar;
        }
    }
    if (!role) {
        const { data: au2 } = await admin.from("app_users").select("role").eq("auth_user_id", user.id).maybeSingle();
        const ar2 = au2 && typeof au2.role === "string" ? au2.role : null;
        if (ar2 && ALLOWED_ROLES.includes(ar2)) {
            role = ar2;
        }
    }
    if (!role) return null;
    const profileMs = Date.now() - t1;
    const totalMs = Date.now() - t0;
    if (totalMs > 400) {
        console.warn("[admin-context-perf] getAdminAuth", {
            auth_get_user_ms: authUserMs,
            role_resolve_ms: profileMs,
            total_ms: totalMs
        });
    }
    return {
        user,
        role
    };
}
async function requireAdmin() {
    const auth = await getAdminAuth();
    if (!auth) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: "Unauthorized"
        }, {
            status: 401
        });
    }
    if (auth.role !== "admin") {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: "Forbidden"
        }, {
            status: 403
        });
    }
    return null;
}
async function requireAdminOrOps() {
    const auth = await getAdminAuth();
    if (!auth) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: "Unauthorized"
        }, {
            status: 401
        });
    }
    return null;
}
function logAdminAudit(params) {
    console.log("[ADMIN_AUDIT]", JSON.stringify(params));
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
"[project]/lib/admin/timezoneContract.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Alloy Timezone Contract v1 — shared resolution (server).
 * Operational calendar: org metadata chain.
 * User-facing display: user_profiles.timezone → org metadata chain → UTC.
 */ __turbopack_context__.s([
    "UTC_FALLBACK_IANA",
    ()=>UTC_FALLBACK_IANA,
    "fetchEffectiveUserDisplayTimezone",
    ()=>fetchEffectiveUserDisplayTimezone,
    "fetchOperationalTimezoneForOrg",
    ()=>fetchOperationalTimezoneForOrg,
    "isValidIanaTimeZone",
    ()=>isValidIanaTimeZone,
    "resolveOrgTimezoneFromMetadata",
    ()=>resolveOrgTimezoneFromMetadata
]);
const UTC_FALLBACK_IANA = "UTC";
function isValidIanaTimeZone(tz) {
    const s = tz.trim();
    if (!s) return false;
    try {
        Intl.DateTimeFormat(undefined, {
            timeZone: s
        });
        return true;
    } catch  {
        return false;
    }
}
function resolveOrgTimezoneFromMetadata(metadata) {
    const meta = metadata && typeof metadata === "object" ? metadata : {};
    const tzRaw = typeof meta.timezone === "string" && meta.timezone.trim() ? meta.timezone.trim() : typeof meta.time_zone === "string" && meta.time_zone.trim() ? meta.time_zone.trim() : "";
    if (!tzRaw) {
        return {
            iana: UTC_FALLBACK_IANA,
            source: "utc_fallback"
        };
    }
    if (!isValidIanaTimeZone(tzRaw)) {
        return {
            iana: UTC_FALLBACK_IANA,
            source: "utc_fallback"
        };
    }
    const source = typeof meta.timezone === "string" && meta.timezone.trim() ? "org_metadata" : "org_metadata_time_zone";
    return {
        iana: tzRaw,
        source
    };
}
async function fetchOperationalTimezoneForOrg(supabase, orgId) {
    const { data, error } = await supabase.from("org_settings").select("metadata").eq("org_id", orgId).maybeSingle();
    if (error || !data) {
        return {
            iana: UTC_FALLBACK_IANA,
            source: "utc_fallback"
        };
    }
    return resolveOrgTimezoneFromMetadata(data.metadata);
}
async function fetchEffectiveUserDisplayTimezone(supabase, params) {
    const { userId, orgId } = params;
    const { data: profile, error: profileErr } = await supabase.from("user_profiles").select("timezone").eq("id", userId).maybeSingle();
    if (!profileErr && profile) {
        const raw = profile.timezone;
        if (typeof raw === "string" && raw.trim() && isValidIanaTimeZone(raw)) {
            return {
                iana: raw.trim(),
                source: "user_profile"
            };
        }
    }
    const orgResolved = await fetchOperationalTimezoneForOrg(supabase, orgId);
    return {
        iana: orgResolved.iana,
        source: orgResolved.source
    };
}
}),
"[project]/lib/admin/orgLocalDayBounds.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Org-local calendar day bounds in UTC for scheduling / “today’s board” filters.
 * Operational calendar uses org_settings.metadata (see timezoneContract).
 */ __turbopack_context__.s([
    "fetchOrgTimeZoneIana",
    ()=>fetchOrgTimeZoneIana,
    "getOrgLocalTodayUtcBounds",
    ()=>getOrgLocalTodayUtcBounds,
    "getOrgLocalYmdUtcBounds",
    ()=>getOrgLocalYmdUtcBounds,
    "resolveScheduledOnBounds",
    ()=>resolveScheduledOnBounds
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$date$2d$fns$2f$addDays$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/date-fns/addDays.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$date$2d$fns$2f$parseISO$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/date-fns/parseISO.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$date$2d$fns$2f$format$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/node_modules/date-fns/format.js [app-route] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$date$2d$fns$2f$startOfDay$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/date-fns/startOfDay.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$date$2d$fns$2d$tz$2f$dist$2f$esm$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/node_modules/date-fns-tz/dist/esm/index.js [app-route] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$date$2d$fns$2d$tz$2f$dist$2f$esm$2f$toDate$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/date-fns-tz/dist/esm/toDate/index.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$date$2d$fns$2d$tz$2f$dist$2f$esm$2f$toZonedTime$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/date-fns-tz/dist/esm/toZonedTime/index.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$date$2d$fns$2d$tz$2f$dist$2f$esm$2f$fromZonedTime$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/date-fns-tz/dist/esm/fromZonedTime/index.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$timezoneContract$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/timezoneContract.ts [app-route] (ecmascript)");
;
;
;
async function fetchOrgTimeZoneIana(supabase, orgId) {
    const { iana } = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$timezoneContract$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["fetchOperationalTimezoneForOrg"])(supabase, orgId);
    return iana;
}
function getOrgLocalTodayUtcBounds(timeZone, refUtc = new Date()) {
    const zoned = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$date$2d$fns$2d$tz$2f$dist$2f$esm$2f$toZonedTime$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["toZonedTime"])(refUtc, timeZone);
    const localStart = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$date$2d$fns$2f$startOfDay$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["startOfDay"])(zoned);
    const dayStartUtc = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$date$2d$fns$2d$tz$2f$dist$2f$esm$2f$fromZonedTime$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["fromZonedTime"])(localStart, timeZone);
    const dayEndExclusiveUtc = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$date$2d$fns$2d$tz$2f$dist$2f$esm$2f$fromZonedTime$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["fromZonedTime"])((0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$date$2d$fns$2f$addDays$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["addDays"])(localStart, 1), timeZone);
    return {
        dayStartUtc,
        dayEndExclusiveUtc
    };
}
function getOrgLocalYmdUtcBounds(ymd, timeZone) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
    if (!m) {
        throw new RangeError(`Invalid scheduled_on date: ${ymd}`);
    }
    const ymdStr = `${m[1]}-${m[2]}-${m[3]}`;
    const base = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$date$2d$fns$2f$parseISO$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["parseISO"])(`${ymdStr}T00:00:00.000Z`);
    const nextStr = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$date$2d$fns$2f$format$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__["format"])((0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$date$2d$fns$2f$addDays$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["addDays"])(base, 1), "yyyy-MM-dd");
    const dayStartUtc = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$date$2d$fns$2d$tz$2f$dist$2f$esm$2f$toDate$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["toDate"])(`${ymdStr}T00:00:00`, {
        timeZone
    });
    const dayEndExclusiveUtc = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$date$2d$fns$2d$tz$2f$dist$2f$esm$2f$toDate$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["toDate"])(`${nextStr}T00:00:00`, {
        timeZone
    });
    return {
        dayStartUtc,
        dayEndExclusiveUtc
    };
}
function resolveScheduledOnBounds(scheduledOnRaw, timeZone, refUtc = new Date()) {
    const s = scheduledOnRaw.trim().toLowerCase();
    if (s === "today") {
        return getOrgLocalTodayUtcBounds(timeZone, refUtc);
    }
    return getOrgLocalYmdUtcBounds(scheduledOnRaw.trim(), timeZone);
}
}),
"[project]/app/api/admin/workflow-runs/route.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "GET",
    ()=>GET
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/server.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabaseAdmin$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/supabaseAdmin.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminAuth$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/adminAuth.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$getAdminContext$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/getAdminContext.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$orgLocalDayBounds$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/orgLocalDayBounds.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$timezoneContract$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/timezoneContract.ts [app-route] (ecmascript)");
;
;
;
;
;
;
async function GET(request) {
    const forbidden = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminAuth$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["requireAdminOrOps"])();
    if (forbidden) return forbidden;
    const ctx = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$getAdminContext$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["getAdminContext"])();
    if (!ctx.ok) return (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$getAdminContext$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["adminContextFailureResponse"])(ctx);
    const orgId = ctx.orgId;
    const { searchParams } = new URL(request.url);
    const list = searchParams.get("list");
    if (list === "kpis") {
        const t0 = Date.now();
        const supabase = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabaseAdmin$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["createAdminClient"])();
        const now = new Date();
        const { iana: timezoneEffective, source: timezoneSource } = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$timezoneContract$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["fetchOperationalTimezoneForOrg"])(supabase, orgId);
        const todayBounds = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$orgLocalDayBounds$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["getOrgLocalTodayUtcBounds"])(timezoneEffective, now);
        const dayStartIso = todayBounds.dayStartUtc.toISOString();
        const dayEndExclusiveIso = todayBounds.dayEndExclusiveUtc.toISOString();
        const last7d = new Date(now);
        last7d.setDate(last7d.getDate() - 7);
        const rangeFroms = {
            last7d: last7d.toISOString()
        };
        /** Bounded scan for dashboard KPIs (avoids 6× exact COUNT on large `workflow_runs`). */ const KPI_SAMPLE_LIMIT = 12_000;
        const tFetch = Date.now();
        const { data: runSample, error: sampleErr } = await supabase.from("workflow_runs").select("id, status, started_at").eq("org_id", orgId).gte("started_at", rangeFroms.last7d).order("started_at", {
            ascending: false
        }).limit(KPI_SAMPLE_LIMIT);
        const fetchSampleMs = Date.now() - tFetch;
        if (sampleErr) {
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                error: sampleErr.message
            }, {
                status: 500
            });
        }
        const rows = runSample ?? [];
        const sampleCapped = rows.length >= KPI_SAMPLE_LIMIT;
        let runs7d = 0;
        let completed7d = 0;
        let failed7d = 0;
        let running7d = 0;
        let skipped7d = 0;
        let runsToday = 0;
        for (const r of rows){
            runs7d += 1;
            const st = String(r.status ?? "");
            if (st === "completed") completed7d += 1;
            else if (st === "failed") failed7d += 1;
            else if (st === "running") running7d += 1;
            else if (st === "skipped") skipped7d += 1;
            const sa = r.started_at ? String(r.started_at) : "";
            if (sa >= dayStartIso && sa < dayEndExclusiveIso) runsToday += 1;
        }
        const recentRunIds = rows.map((r)=>r.id);
        const tFail = Date.now();
        let failedActionRunIds = new Set();
        if (recentRunIds.length) {
            const { data: failedRows } = await supabase.from("workflow_action_runs").select("workflow_run_id").eq("org_id", orgId).in("workflow_run_id", recentRunIds).eq("status", "failed");
            failedActionRunIds = new Set((failedRows ?? []).map((r)=>String(r.workflow_run_id)));
        }
        const failedActionsMs = Date.now() - tFail;
        const failedIncludingActionFailures = Math.max(failed7d, failedActionRunIds.size);
        const denom = completed7d + failedIncludingActionFailures;
        const successRate = denom > 0 ? completed7d / denom : null;
        const totalMs = Date.now() - t0;
        if (totalMs > 300) {
            console.warn("[admin-timing] GET /api/admin/workflow-runs list=kpis", {
                total_ms: totalMs,
                fetch_sample_ms: fetchSampleMs,
                failed_actions_ms: failedActionsMs,
                sample_rows: rows.length,
                sample_capped: sampleCapped
            });
        }
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            kpis: {
                runs_today: runsToday,
                runs_last_7d: runs7d,
                successful_last_7d: completed7d,
                failed_last_7d: failedIncludingActionFailures,
                running_last_7d: running7d,
                skipped_last_7d: skipped7d,
                success_rate_last_7d: successRate
            },
            meta: {
                calendar_type: "operational_day",
                timezone_effective: timezoneEffective,
                timezone_source: timezoneSource,
                day_start_utc: dayStartIso,
                day_end_exclusive_utc: dayEndExclusiveIso
            }
        });
    }
    if (list === "workflows") {
        const supabase = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabaseAdmin$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["createAdminClient"])();
        const { data, error } = await supabase.from("workflows").select("id, name").eq("org_id", orgId).order("name", {
            ascending: true
        });
        if (error) return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: error.message
        }, {
            status: 500
        });
        const workflows = (data ?? []).map((w)=>({
                id: w.id,
                name: w.name ?? "—"
            }));
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            workflows
        });
    }
    if (list === "event_types") {
        const supabase = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabaseAdmin$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["createAdminClient"])();
        const { data, error } = await supabase.from("workflow_events").select("event_type").eq("org_id", orgId).not("event_type", "is", null);
        if (error) return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: error.message
        }, {
            status: 500
        });
        const types = [
            ...new Set((data ?? []).map((r)=>r.event_type).filter(Boolean))
        ].sort();
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            event_types: types
        });
    }
    const status = searchParams.get("status") ?? "";
    const workflowId = searchParams.get("workflow_id") ?? "";
    const eventType = searchParams.get("event_type") ?? "";
    const entityType = (searchParams.get("entity_type") ?? "").trim();
    const entityId = (searchParams.get("entity_id") ?? "").trim();
    const range = searchParams.get("range") ?? "";
    const search = (searchParams.get("search") ?? "").trim();
    const limit = Math.min(Number(searchParams.get("limit")) || 50, 100);
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const offset = (page - 1) * limit;
    let fromIso = null;
    if (range === "24h") {
        const d = new Date();
        d.setHours(d.getHours() - 24);
        fromIso = d.toISOString();
    } else if (range === "7d") {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        fromIso = d.toISOString();
    } else if (range === "30d") {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        fromIso = d.toISOString();
    }
    const supabase = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabaseAdmin$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["createAdminClient"])();
    let eventIdsForType = null;
    if (eventType) {
        const { data: evRows } = await supabase.from("workflow_events").select("id").eq("org_id", orgId).eq("event_type", eventType);
        eventIdsForType = (evRows ?? []).map((r)=>r.id);
        if (eventIdsForType.length === 0) {
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                runs: [],
                total: 0,
                page,
                limit
            });
        }
    }
    let eventIdsForEntity = null;
    if (entityType && entityId) {
        const { data: evRows } = await supabase.from("workflow_events").select("id").eq("org_id", orgId).eq("entity_type", entityType).eq("entity_id", entityId);
        eventIdsForEntity = (evRows ?? []).map((r)=>r.id);
        if (eventIdsForEntity.length === 0) {
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                runs: [],
                total: 0,
                page,
                limit
            });
        }
    }
    let q = supabase.from("workflow_runs").select("id, workflow_id, event_id, status, error, started_at, completed_at, event_payload", {
        count: "exact"
    }).eq("org_id", orgId).order("started_at", {
        ascending: false
    });
    if (status) q = q.eq("status", status);
    if (workflowId) q = q.eq("workflow_id", workflowId);
    if (fromIso) q = q.gte("started_at", fromIso);
    if (eventIdsForType && eventIdsForType.length > 0) q = q.in("event_id", eventIdsForType);
    if (eventIdsForEntity && eventIdsForEntity.length > 0) q = q.in("event_id", eventIdsForEntity);
    async function enrichRuns(rows) {
        const wfIds = [
            ...new Set(rows.map((r)=>r.workflow_id).filter(Boolean))
        ];
        const evIds = [
            ...new Set(rows.map((r)=>r.event_id).filter(Boolean))
        ];
        const { data: wfData } = wfIds.length ? await supabase.from("workflows").select("id, name").eq("org_id", orgId).in("id", wfIds) : {
            data: []
        };
        const { data: evData } = evIds.length ? await supabase.from("workflow_events").select("id, event_type, entity_type, entity_id").eq("org_id", orgId).in("id", evIds) : {
            data: []
        };
        const wfMap = new Map((wfData ?? []).map((w)=>[
                w.id,
                w.name ?? null
            ]));
        const evMap = new Map((evData ?? []).map((e)=>[
                e.id,
                e
            ]));
        const runIds = rows.map((r)=>r.id);
        let runIdsWithFailedAction = new Set();
        if (runIds.length > 0) {
            const { data: failedRows } = await supabase.from("workflow_action_runs").select("workflow_run_id").eq("org_id", orgId).in("workflow_run_id", runIds).eq("status", "failed");
            runIdsWithFailedAction = new Set((failedRows ?? []).map((r)=>r.workflow_run_id));
        }
        return rows.map((r)=>({
                id: r.id,
                workflow_id: r.workflow_id,
                workflow_name: wfMap.get(r.workflow_id) ?? null,
                event_id: r.event_id,
                event_type: r.event_id ? evMap.get(r.event_id)?.event_type ?? null : null,
                entity_type: r.event_id ? evMap.get(r.event_id)?.entity_type ?? null : null,
                entity_id: r.event_id ? evMap.get(r.event_id)?.entity_id ?? null : null,
                status: r.status,
                error: r.error,
                started_at: r.started_at,
                completed_at: r.completed_at,
                event_payload: r.event_payload ?? {},
                has_failed_action: runIdsWithFailedAction.has(r.id)
            }));
    }
    if (search) {
        const { data: rows, error } = await q.limit(1000);
        if (error) return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: error.message
        }, {
            status: 500
        });
        const raw = rows ?? [];
        const enriched = await enrichRuns(raw);
        const searchLower = search.toLowerCase();
        const filtered = enriched.filter((r)=>r.id.toLowerCase().includes(searchLower) || r.error && r.error.toLowerCase().includes(searchLower) || JSON.stringify(r.event_payload).toLowerCase().includes(searchLower) || r.entity_id && r.entity_id.toLowerCase().includes(searchLower));
        const runs = filtered.slice(offset, offset + limit);
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            runs,
            total: filtered.length,
            page,
            limit
        });
    }
    const { data: rows, error, count } = await q.range(offset, offset + limit - 1);
    if (error) return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
        error: error.message
    }, {
        status: 500
    });
    const raw = rows ?? [];
    const runs = await enrichRuns(raw);
    return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
        runs,
        total: count ?? runs.length,
        page,
        limit
    });
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__05445e23._.js.map