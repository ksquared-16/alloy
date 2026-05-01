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
"[project]/lib/admin/statusDefinitionsAdminEntityTypes.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Entity types listed on the admin Statuses Settings page and used for the
 * unscoped GET /api/admin/status-definitions aggregate (effective defs per type).
 */ __turbopack_context__.s([
    "ADMIN_STATUS_DEFINITIONS_ENTITY_TYPES",
    ()=>ADMIN_STATUS_DEFINITIONS_ENTITY_TYPES
]);
const ADMIN_STATUS_DEFINITIONS_ENTITY_TYPES = [
    "schedules",
    "jobs",
    "customers",
    "opportunities",
    "opportunity_customer_members",
    "vendors",
    "service_plan_templates",
    "persons",
    "contacts",
    "customer_members",
    "locations",
    "documents",
    "payments",
    "subscriptions"
];
}),
"[project]/lib/admin/normalizeStatusMetadata.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/** Coerce status_definitions.metadata for DB writes — never null. */ __turbopack_context__.s([
    "normalizeStatusDefinitionMetadata",
    ()=>normalizeStatusDefinitionMetadata
]);
function normalizeStatusDefinitionMetadata(raw) {
    if (raw == null) return {};
    if (typeof raw === "object" && !Array.isArray(raw)) return raw;
    return {};
}
}),
"[project]/app/api/admin/status-definitions/route.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "GET",
    ()=>GET,
    "POST",
    ()=>POST
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/server.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabaseAdmin$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/supabaseAdmin.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$getAdminContext$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/getAdminContext.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$statusDefinitionsResolve$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/lib/admin/statusDefinitionsResolve.ts [app-route] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$statusDefinitionsAdminEntityTypes$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/statusDefinitionsAdminEntityTypes.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$normalizeStatusMetadata$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/normalizeStatusMetadata.ts [app-route] (ecmascript)");
;
;
;
;
;
;
const STATUS_KEY_REGEX = /^[a-z0-9_]{2,32}$/;
async function GET(request) {
    const ctx = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$getAdminContext$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["getAdminContext"])();
    if (!ctx.ok) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: ctx.status === 401 ? "Unauthorized" : "Forbidden"
        }, {
            status: ctx.status
        });
    }
    const { searchParams } = new URL(request.url);
    const entityType = searchParams.get("entity_type")?.trim() || null;
    const supabase = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabaseAdmin$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["createAdminClient"])();
    try {
        if (entityType) {
            const orgRows = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$statusDefinitionsResolve$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__["fetchOrgStatusDefinitions"])(supabase, ctx.orgId, entityType, {
                activeOnly: true
            });
            const source = orgRows.length > 0 ? "org" : "industry_defaults";
            const rows = orgRows.length > 0 ? orgRows : await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$statusDefinitionsResolve$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__["fetchEffectiveStatusDefinitions"])(supabase, ctx.orgId, entityType, {
                activeOnly: true
            });
            const statuses = rows.map((r)=>({
                    id: r.id,
                    org_id: r.org_id,
                    entity_type: r.entity_type,
                    status_key: r.status_key,
                    status_label: r.status_label ?? null,
                    sort_order: Number(r.sort_order) ?? 100,
                    is_active: Boolean(r.is_active),
                    is_system: Boolean(r.is_system),
                    metadata: r.metadata ?? null,
                    created_at: "",
                    updated_at: ""
                }));
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                statuses,
                source,
                message: source === "industry_defaults" ? "No org-specific statuses yet; showing industry defaults. Add rows under this org to override." : undefined
            });
        }
        /**
         * Aggregate effective definitions for each entity type (same merge rules as
         * GET ?entity_type=…): org rows + industry defaults (`org_id` NULL) where applicable.
         * The previous org-only query hid global defaults when the org had no rows yet.
         */ const rowsNested = await Promise.all(__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$statusDefinitionsAdminEntityTypes$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["ADMIN_STATUS_DEFINITIONS_ENTITY_TYPES"].map((entityType)=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$statusDefinitionsResolve$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__["fetchEffectiveStatusDefinitions"])(supabase, ctx.orgId, entityType, {
                activeOnly: true
            })));
        const merged = rowsNested.flat();
        const statuses = merged.map((r)=>({
                id: r.id,
                org_id: r.org_id,
                entity_type: r.entity_type,
                status_key: r.status_key,
                status_label: r.status_label ?? null,
                sort_order: Number(r.sort_order) ?? 100,
                is_active: Boolean(r.is_active),
                is_system: Boolean(r.is_system),
                metadata: r.metadata ?? null,
                created_at: "",
                updated_at: ""
            }));
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            statuses,
            source: "effective"
        });
    } catch (e) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: e.message
        }, {
            status: 500
        });
    }
}
async function POST(request) {
    const ctx = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$getAdminContext$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["getAdminContext"])();
    if (!ctx.ok) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: ctx.status === 401 ? "Unauthorized" : "Forbidden"
        }, {
            status: ctx.status
        });
    }
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
    const entity_type = typeof body.entity_type === "string" ? body.entity_type.trim() : "";
    const status_key_raw = typeof body.status_key === "string" ? body.status_key.trim() : "";
    const status_key = status_key_raw.toLowerCase();
    const status_label = typeof body.status_label === "string" ? body.status_label.trim() || null : null;
    if (!entity_type) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: "entity_type is required"
        }, {
            status: 400
        });
    }
    if (!status_key) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: "status_key is required"
        }, {
            status: 400
        });
    }
    if (!STATUS_KEY_REGEX.test(status_key)) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: "status_key must be 2–32 characters, lowercase letters, numbers, and underscores only"
        }, {
            status: 400
        });
    }
    const sort_order = typeof body.sort_order === "number" && !Number.isNaN(body.sort_order) ? body.sort_order : 100;
    const is_active = body.is_active !== false;
    const supabase = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabaseAdmin$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["createAdminClient"])();
    const insert = {
        org_id: ctx.orgId,
        entity_type,
        status_key,
        status_label,
        sort_order,
        is_active,
        is_system: false,
        metadata: (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$normalizeStatusMetadata$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["normalizeStatusDefinitionMetadata"])(body.metadata),
        industry_key: null
    };
    const { data: created, error } = await supabase.from("status_definitions").insert(insert).select().single();
    if (error) {
        const code = error.code;
        if (code === "23505") {
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                error: "A status with this key already exists for this entity type"
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

//# sourceMappingURL=%5Broot-of-the-server%5D__3e65f47e._.js.map