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
"[project]/lib/admin/actions/cacheTags.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/** Next.js cache tag for GET /api/admin/actions; invalidate after successful execute. */ __turbopack_context__.s([
    "adminActionsOrgTag",
    ()=>adminActionsOrgTag
]);
function adminActionsOrgTag(orgId) {
    return `admin-actions:${orgId}`;
}
}),
"[project]/lib/admin/actions/types.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "emptyResolvedActionsBySlot",
    ()=>emptyResolvedActionsBySlot
]);
function emptyResolvedActionsBySlot() {
    return {
        primary: [],
        secondary: [],
        overflow: [],
        right_rail: [],
        row_inline: [],
        header: []
    };
}
}),
"[project]/lib/admin/actions/resolveActionsForContext.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "resolveActionsForContext",
    ()=>resolveActionsForContext
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$actions$2f$types$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/actions/types.ts [app-route] (ecmascript)");
;
function normEt(v) {
    const s = (v ?? "").trim().toLowerCase();
    return s || null;
}
function passesPlacementScope(p, q) {
    if (p.department_id != null && String(p.department_id).trim() !== "") {
        const d = q.departmentId?.trim();
        if (!d || d !== p.department_id) return false;
    }
    if (p.work_unit_id != null && String(p.work_unit_id).trim() !== "") {
        const w = q.workUnitId?.trim();
        if (!w || w !== p.work_unit_id) return false;
    }
    return true;
}
function passesConditionConfig(defCfg, placementCfg, statusKey, metadata) {
    const cfg = {
        ...defCfg ?? {},
        ...placementCfg ?? {}
    };
    const eq = cfg.status_key_equals;
    if (eq != null && String(eq).trim() !== "") {
        if ((statusKey ?? "").trim() !== String(eq).trim()) return false;
    }
    const ne = cfg.status_key_not_equals;
    if (ne != null && String(ne).trim() !== "") {
        if ((statusKey ?? "").trim() === String(ne).trim()) return false;
    }
    // v1 minimal metadata existence checks (used for Enrollment tour schedule/reschedule).
    const exists = cfg.metadata_field_exists;
    if (exists != null && String(exists).trim() !== "") {
        const key = String(exists).trim();
        const v = metadata ? metadata[key] : undefined;
        if (v == null) return false;
        if (typeof v === "string" && v.trim() === "") return false;
    }
    const missing = cfg.metadata_field_missing;
    if (missing != null && String(missing).trim() !== "") {
        const key = String(missing).trim();
        const v = metadata ? metadata[key] : undefined;
        if (v != null && !(typeof v === "string" && v.trim() === "")) return false;
    }
    return true;
}
async function fetchOpportunityConditionContext(supabase, orgId, opportunityId) {
    const { data, error } = await supabase.from("opportunities").select("status_key, metadata").eq("id", opportunityId).eq("org_id", orgId).maybeSingle();
    if (error || !data) return {
        statusKey: null,
        metadata: null
    };
    const statusKey = data.status_key ?? null;
    const metadataRaw = data.metadata ?? null;
    const metadata = metadataRaw && typeof metadataRaw === "object" ? metadataRaw : null;
    return {
        statusKey,
        metadata
    };
}
async function resolveActionsForContext(supabase, query) {
    const out = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$actions$2f$types$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["emptyResolvedActionsBySlot"])();
    const et = normEt(query.entityType);
    const recordSectionKey = query.surface === "record_section" ? (query.sectionKey ?? "").trim() : "";
    if (query.surface === "record_section" && !recordSectionKey) {
        return out;
    }
    let statusKey = null;
    let oppMetadata = null;
    if (et === "opportunity" && query.entityId?.trim()) {
        const ctx = await fetchOpportunityConditionContext(supabase, query.orgId, query.entityId.trim());
        statusKey = ctx.statusKey;
        oppMetadata = ctx.metadata;
    }
    const { data: rows, error } = await supabase.from("action_placements").select([
        "id",
        "surface",
        "slot",
        "org_id",
        "entity_type",
        "department_id",
        "work_unit_id",
        "section_key",
        "order_index",
        "display_style",
        "condition_config",
        "action_definitions!inner(id, org_id, key, label, description, entity_type, action_type, icon, style, priority, condition_config, payload_schema, workflow_id, is_active)"
    ].join(", ")).eq("surface", query.surface).eq("is_active", true).or(`org_id.is.null,org_id.eq.${query.orgId}`);
    if (error) {
        console.error("[resolveActionsForContext]", error.message);
        return out;
    }
    const list = rows ?? [];
    const resolved = [];
    // If an org-scoped definition exists for a key, suppress global templates for that key.
    // This prevents "schedule_tour" global template from reappearing when org-scoped schedule_tour is filtered out.
    const orgScopedKeys = new Set();
    for (const row of list){
        const d = row.action_definitions;
        if (!d || !d.is_active) continue;
        if (d.org_id != null && d.org_id === query.orgId) orgScopedKeys.add(d.key);
    }
    for (const row of list){
        const d = row.action_definitions;
        if (!d || !d.is_active) continue;
        if (row.org_id != null && String(row.org_id) !== query.orgId) continue;
        if (d.org_id != null && d.org_id !== query.orgId) continue;
        if (d.org_id == null && orgScopedKeys.has(d.key)) continue;
        if (row.entity_type != null && String(row.entity_type).trim() !== "" && et != null) {
            if (normEt(row.entity_type) !== et) continue;
        }
        if (d.entity_type != null && String(d.entity_type).trim() !== "" && et != null) {
            if (normEt(d.entity_type) !== et) continue;
        }
        if (!passesPlacementScope(row, query)) continue;
        if (query.surface === "record_section") {
            const psk = row.section_key != null ? String(row.section_key).trim() : "";
            if (!psk || psk !== recordSectionKey) continue;
        }
        if (!passesConditionConfig(d.condition_config, row.condition_config, statusKey, oppMetadata)) continue;
        const payload = d.payload_schema && typeof d.payload_schema === "object" ? d.payload_schema : {};
        resolved.push({
            key: d.key,
            label: d.label,
            description: d.description,
            action_type: d.action_type,
            icon: d.icon,
            style: d.style,
            display_style: row.display_style ?? "button",
            payload,
            workflow_id: d.workflow_id,
            _order: row.order_index,
            _slot: row.slot,
            _scope_rank: d.org_id != null ? 2 : row.org_id != null ? 1 : 0
        });
    }
    const withMeta = resolved;
    withMeta.sort((a, b)=>a._order !== b._order ? a._order - b._order : a.label.localeCompare(b.label));
    // De-dupe by slot+key, preferring org-scoped definitions over global templates.
    const chosenBySlotKey = new Map();
    for (const a of withMeta){
        const k = `${a._slot}::${a.key}`;
        const prev = chosenBySlotKey.get(k);
        if (!prev || a._scope_rank > prev._scope_rank) chosenBySlotKey.set(k, a);
    }
    for (const a of withMeta){
        const k = `${a._slot}::${a.key}`;
        if (chosenBySlotKey.get(k) !== a) continue;
        const slot = a._slot;
        const { _order: _o, _slot: _s, _scope_rank: _sr, ...rest } = a;
        void _o;
        void _s;
        void _sr;
        if (out[slot]) {
            out[slot].push(rest);
        } else {
            out.overflow.push(rest);
        }
    }
    return out;
}
}),
"[project]/app/api/admin/actions/route.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "GET",
    ()=>GET
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/server.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$cache$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/cache.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabaseAdmin$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/supabaseAdmin.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$getAdminContext$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/getAdminContext.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminAuth$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/adminAuth.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$actions$2f$cacheTags$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/actions/cacheTags.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$actions$2f$resolveActionsForContext$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/actions/resolveActionsForContext.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$actions$2f$types$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/actions/types.ts [app-route] (ecmascript)");
;
;
;
;
;
;
;
;
const SURFACES = new Set([
    "record_header",
    "record_section",
    "queue_row",
    "work_unit",
    "department",
    "workspace",
    "right_rail"
]);
async function GET(request) {
    const forbidden = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminAuth$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["requireAdminOrOps"])();
    if (forbidden) return forbidden;
    const ctx = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$getAdminContext$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["getAdminContext"])();
    if (!ctx.ok) return (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$getAdminContext$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["adminContextFailureResponse"])(ctx);
    const { searchParams } = new URL(request.url);
    const surface = (searchParams.get("surface") ?? "").trim();
    if (!surface || !SURFACES.has(surface)) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: "Invalid or missing surface"
        }, {
            status: 400
        });
    }
    const entityType = searchParams.get("entity_type")?.trim() || null;
    const entityId = searchParams.get("entity_id")?.trim() || null;
    const departmentId = searchParams.get("department_id")?.trim() || null;
    const workUnitId = searchParams.get("work_unit_id")?.trim() || null;
    const sectionKey = searchParams.get("section_key")?.trim() || null;
    if (surface === "record_section") {
        if (!entityId || !sectionKey) {
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                error: "record_section requires entity_id and section_key"
            }, {
                status: 400
            });
        }
    }
    const t0 = Date.now();
    try {
        const orgTag = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$actions$2f$cacheTags$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["adminActionsOrgTag"])(ctx.orgId);
        /** Shorter TTL when entity-specific conditions apply; longer for shared queue-row templates. */ const revalidateSec = entityId ? 6 : 40;
        const actions = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$cache$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["unstable_cache"])(async ()=>{
            const supabase = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabaseAdmin$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["createAdminClient"])();
            return (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$actions$2f$resolveActionsForContext$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["resolveActionsForContext"])(supabase, {
                orgId: ctx.orgId,
                surface,
                entityType,
                entityId,
                departmentId,
                workUnitId,
                sectionKey
            });
        }, [
            "admin-actions-resolve",
            ctx.orgId,
            surface,
            entityType ?? "-",
            entityId ?? "-",
            departmentId ?? "-",
            workUnitId ?? "-",
            sectionKey ?? "-"
        ], {
            revalidate: revalidateSec,
            tags: [
                orgTag
            ]
        })();
        const ms = Date.now() - t0;
        if (ms > 120) {
            console.warn("[admin-timing] GET /api/admin/actions", {
                ms,
                surface,
                entity_id: entityId,
                work_unit_id: workUnitId
            });
        }
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            actions
        });
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[GET /api/admin/actions]", msg);
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            actions: (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$actions$2f$types$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["emptyResolvedActionsBySlot"])(),
            error: msg
        }, {
            status: 500
        });
    }
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__0705ebc3._.js.map