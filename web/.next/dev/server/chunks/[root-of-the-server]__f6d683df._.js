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
"[project]/lib/admin/opportunityLifecyclePresentation.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Effective opportunity lifecycle for UI — driven by status_definitions.metadata.lifecycle_stage
 * plus a derived "decision" stage when quote_total is positive (see product rules).
 * No vertical-specific branching; status keys remain configurable in the database.
 */ __turbopack_context__.s([
    "buildOpportunityLifecycleFields",
    ()=>buildOpportunityLifecycleFields,
    "opportunityQuoteTotalForLifecycle",
    ()=>opportunityQuoteTotalForLifecycle,
    "resolveEffectiveOpportunityLifecycleStage",
    ()=>resolveEffectiveOpportunityLifecycleStage
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$statusDefinitionLifecycle$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/statusDefinitionLifecycle.ts [app-route] (ecmascript)");
;
function opportunityQuoteTotalForLifecycle(opp) {
    const v = opp.quote_total;
    if (v == null || v === "") return null;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
}
function resolveEffectiveOpportunityLifecycleStage(input) {
    const sk = input.statusKey?.trim() || null;
    const def = sk ? input.defs.find((d)=>d.status_key.toLowerCase() === sk.toLowerCase()) : undefined;
    const fromStatus = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$statusDefinitionLifecycle$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["parseLifecycleStageFromMetadata"])(def?.metadata);
    if (fromStatus === "success" || fromStatus === "failure") {
        return fromStatus;
    }
    const q = input.quoteTotalDollars;
    if (q != null && Number.isFinite(q) && q > 0) {
        return "decision";
    }
    return fromStatus ?? null;
}
function lifecycleStageTitle(stage) {
    switch(stage){
        case "intake":
            return "Intake";
        case "qualification":
            return "Qualification";
        case "execution":
            return "Execution";
        case "decision":
            return "Decision";
        case "success":
            return "Success";
        case "failure":
            return "Closed";
        default:
            return "Pipeline";
    }
}
function lifecycleStageMeaning(stage) {
    switch(stage){
        case "intake":
            return "New demand is captured; initial triage and routing.";
        case "qualification":
            return "Fit and priority are being confirmed before solution work.";
        case "execution":
            return "Pricing and scope work is in progress.";
        case "decision":
            return "A price exists; waiting on customer commitment or next step.";
        case "success":
            return "This opportunity reached a successful closed outcome.";
        case "failure":
            return "This opportunity was closed without a win.";
        default:
            return "Track this record using your configured opportunity statuses.";
    }
}
function lifecycleNextStep(stage) {
    switch(stage){
        case "intake":
            return {
                title: "Suggested next step",
                lines: [
                    "Confirm fit, then qualify the opportunity when you are ready to move forward."
                ]
            };
        case "qualification":
            return {
                title: "Suggested next step",
                lines: [
                    "Start or continue quoting so a price can be produced for the customer."
                ]
            };
        case "execution":
            return {
                title: "Suggested next step",
                lines: [
                    "Complete pricing inputs and settle the quote so a decision can be made."
                ]
            };
        case "decision":
            return {
                title: "Suggested next step",
                lines: [
                    "Follow up on the priced offer: book or convert when the customer is ready, or mark lost if they decline."
                ]
            };
        case "success":
            return {
                title: "What’s next",
                lines: [
                    "Operational follow-up happens on the job or booking tied to this opportunity."
                ]
            };
        case "failure":
            return {
                title: "What’s next",
                lines: [
                    "Review notes and source for learnings; reopen only if policy allows."
                ]
            };
        default:
            return {
                title: "Suggested next step",
                lines: [
                    "Set the opportunity status so the team can see where it sits in your pipeline."
                ]
            };
    }
}
function buildOpportunityLifecycleFields(input) {
    const effective = resolveEffectiveOpportunityLifecycleStage({
        statusKey: input.statusKey,
        quoteTotalDollars: input.quoteTotalDollars,
        defs: input.defs
    });
    return {
        _effective_lifecycle_stage: effective,
        _lifecycle_stage_title: lifecycleStageTitle(effective),
        _lifecycle_stage_meaning: lifecycleStageMeaning(effective),
        _lifecycle_next_step: lifecycleNextStep(effective)
    };
}
}),
"[project]/lib/workspace/computeOpportunityLifecycleKpis.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "computeOpportunityLifecycleKpis",
    ()=>computeOpportunityLifecycleKpis
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$opportunityLifecyclePresentation$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/opportunityLifecyclePresentation.ts [app-route] (ecmascript)");
;
function bumpStage(counts, stage) {
    if (stage === null) {
        counts.unclassified++;
        return;
    }
    switch(stage){
        case "intake":
            counts.intake++;
            break;
        case "qualification":
            counts.qualification++;
            break;
        case "execution":
            counts.execution++;
            break;
        case "decision":
            counts.decision++;
            break;
        case "success":
            counts.success++;
            break;
        case "failure":
            counts.failure++;
            break;
        default:
            counts.unclassified++;
    }
}
function computeOpportunityLifecycleKpis(rows, defs) {
    const counts = {
        total: rows.length,
        intake: 0,
        qualification: 0,
        execution: 0,
        decision: 0,
        success: 0,
        failure: 0,
        unclassified: 0
    };
    let openPipeline = 0;
    let pricedInMotion = 0;
    for (const row of rows){
        const quoteNum = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$opportunityLifecyclePresentation$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["opportunityQuoteTotalForLifecycle"])(row);
        const stage = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$opportunityLifecyclePresentation$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["resolveEffectiveOpportunityLifecycleStage"])({
            statusKey: row.status_key,
            quoteTotalDollars: quoteNum,
            defs
        });
        bumpStage(counts, stage);
        const terminal = stage === "success" || stage === "failure";
        if (!terminal) {
            const q = quoteNum ?? 0;
            openPipeline += q;
            if (quoteNum != null && quoteNum > 0) {
                pricedInMotion += quoteNum;
            }
        }
    }
    return {
        counts,
        values: {
            openPipeline,
            pricedInMotion
        }
    };
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
"[project]/lib/rrs/queue/resolveOpportunityQueue.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Server-side interpreter: validated opportunity `queue_definition` (v1) → Supabase query.
 * Org-scoped; no client-side filtering as source of truth.
 */ __turbopack_context__.s([
    "resolveOpportunityQueueFromDefinition",
    ()=>resolveOpportunityQueueFromDefinition
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$rrs$2f$queue$2f$queueDefinitionV1$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/rrs/queue/queueDefinitionV1.ts [app-route] (ecmascript)");
;
const SELECT_COLS = "id, name, status_key, source, assigned_to, quote_total, pipeline_stage_id, customer_id, primary_person_id, location_id, job_date, job_time_window, customer_notes, metadata, created_at, updated_at";
/** Terminal opportunity statuses after a successful book-v2 handoff (see workflow_events in seed data). */ const TERMINAL_BOOKED_STATUSES = [
    "booked",
    "scheduled"
];
async function fetchBookedPipelineStageIds(supabase, orgId) {
    const { data, error } = await supabase.from("pipeline_stages").select("id").eq("org_id", orgId).eq("key", "booked");
    if (error || !data?.length) return [];
    return data.map((r)=>r.id);
}
async function resolveOpportunityQueueFromDefinition(supabase, orgId, queueDefinitionRaw) {
    const parsed = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$rrs$2f$queue$2f$queueDefinitionV1$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["parseQueueDefinitionV1Strict"])(queueDefinitionRaw);
    if (!parsed.ok) {
        return {
            ok: false,
            error: parsed.error,
            code: "INVALID_DEFINITION"
        };
    }
    if (!(0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$rrs$2f$queue$2f$queueDefinitionV1$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["isQueueDefinitionV1Opportunity"])(parsed.value)) {
        return {
            ok: false,
            error: "queue_definition must be entity_type opportunity for this interpreter",
            code: "INVALID_DEFINITION"
        };
    }
    const def = parsed.value;
    const filters = def.filters ?? {};
    let q = supabase.from("opportunities").select(SELECT_COLS, {
        count: "exact"
    }).eq("org_id", orgId);
    if (filters.status_keys?.length) {
        q = q.in("status_key", filters.status_keys);
    }
    if (filters.pipeline_stage_ids?.length) {
        q = q.in("pipeline_stage_id", filters.pipeline_stage_ids);
    }
    if (filters.source_keys?.length) {
        q = q.in("source", filters.source_keys);
    }
    if (filters.assigned_to?.length) {
        q = q.in("assigned_to", filters.assigned_to);
    }
    const quoteState = filters.quote_state;
    if (quoteState === "no_positive_quote") {
        q = q.or("quote_total.is.null,quote_total.lte.0");
    } else if (quoteState === "has_positive_quote") {
        q = q.gt("quote_total", 0);
    } else if (quoteState === "quoted_not_booked") {
        q = q.gt("quote_total", 0);
        q = q.not("status_key", "in", `(${TERMINAL_BOOKED_STATUSES.map((s)=>`"${s}"`).join(",")})`);
        const bookedIds = await fetchBookedPipelineStageIds(supabase, orgId);
        if (bookedIds.length) {
            const inList = `("${bookedIds.join('","')}")`;
            q = q.or(`pipeline_stage_id.is.null,pipeline_stage_id.not.in.${inList}`);
        }
    }
    const sortCol = def.sort.by;
    const asc = def.sort.direction === "asc";
    q = q.order(sortCol, {
        ascending: asc,
        nullsFirst: false
    });
    q = q.limit(def.limit);
    const { data, error, count } = await q;
    if (error) {
        return {
            ok: false,
            error: error.message,
            code: "QUERY_FAILED"
        };
    }
    const rows = data ?? [];
    const total = typeof count === "number" ? count : rows.length;
    return {
        ok: true,
        definition: def,
        total,
        items: rows
    };
}
}),
"[project]/app/api/admin/departments/[departmentId]/opportunity-lifecycle-kpis/route.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "GET",
    ()=>GET,
    "dynamic",
    ()=>dynamic
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/server.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$getAdminContext$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/getAdminContext.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabaseAdmin$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/supabaseAdmin.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$statusDefinitionsResolve$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/lib/admin/statusDefinitionsResolve.ts [app-route] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$computeOpportunityLifecycleKpis$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/workspace/computeOpportunityLifecycleKpis.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$rrs$2f$queue$2f$resolveOpportunityQueue$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/rrs/queue/resolveOpportunityQueue.ts [app-route] (ecmascript)");
;
;
;
;
;
;
const dynamic = "force-dynamic";
async function GET(_request, context) {
    const { departmentId } = await context.params;
    if (!departmentId) return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
        error: "Missing department id"
    }, {
        status: 400
    });
    const ctx = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$getAdminContext$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["getAdminContext"])();
    if (!ctx.ok) return (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$getAdminContext$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["adminContextFailureResponse"])(ctx);
    try {
        const supabase = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabaseAdmin$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["createAdminClient"])();
        // Department scoping for opportunities is defined by the configured work units, not a fixed column.
        // Use the department's `pipeline_overview` queue as the canonical scope when present.
        const { data: scopeWu, error: wuErr } = await supabase.from("work_units").select("id, queue_definition").eq("org_id", ctx.orgId).eq("department_id", departmentId).eq("key", "pipeline_overview").maybeSingle();
        let rows = [];
        if (wuErr) {
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                error: wuErr.message || "Failed to load KPI scope work unit"
            }, {
                status: 500
            });
        }
        if (scopeWu?.queue_definition) {
            const resolved = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$rrs$2f$queue$2f$resolveOpportunityQueue$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["resolveOpportunityQueueFromDefinition"])(supabase, ctx.orgId, scopeWu.queue_definition);
            if (!resolved.ok) {
                const status = resolved.code === "INVALID_DEFINITION" ? 400 : 500;
                return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                    error: resolved.error,
                    code: resolved.code
                }, {
                    status
                });
            }
            // IMPORTANT: queue interpreter applies a `limit` for list rendering.
            // KPI counts must reflect the full filtered dataset, not the preview slice.
            const def = resolved.definition;
            let q = supabase.from("opportunities").select("status_key, quote_total").eq("org_id", ctx.orgId);
            const f = def.filters ?? {};
            if (f.status_keys?.length) q = q.in("status_key", f.status_keys);
            if (f.pipeline_stage_ids?.length) q = q.in("pipeline_stage_id", f.pipeline_stage_ids);
            if (f.source_keys?.length) q = q.in("source", f.source_keys);
            if (f.assigned_to?.length) q = q.in("assigned_to", f.assigned_to);
            if (f.quote_state === "no_positive_quote") q = q.or("quote_total.is.null,quote_total.lte.0");
            else if (f.quote_state === "has_positive_quote") q = q.gt("quote_total", 0);
            else if (f.quote_state === "quoted_not_booked") {
                q = q.gt("quote_total", 0);
                q = q.not("status_key", "in", "(\"booked\",\"scheduled\")");
                // Mirror interpreter behavior: also exclude booked pipeline stage when present.
                const { data: bookedStages } = await supabase.from("pipeline_stages").select("id").eq("org_id", ctx.orgId).eq("key", "booked");
                const bookedIds = (bookedStages ?? []).map((r)=>r.id).filter(Boolean);
                if (bookedIds.length) {
                    q = q.or(`pipeline_stage_id.is.null,pipeline_stage_id.not.in.("${bookedIds.join('","')}")`);
                }
            }
            const { data: allRows, error: allErr } = await q.limit(5000);
            if (allErr) {
                return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                    error: allErr.message || "Failed to load KPI scoped opportunities"
                }, {
                    status: 500
                });
            }
            rows = allRows ?? [];
        } else {
            // Fallback: org-wide opportunities (still useful as a visibility layer).
            const { data, error } = await supabase.from("opportunities").select("status_key, quote_total").eq("org_id", ctx.orgId).limit(5000);
            if (error) {
                return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                    error: error.message || "Failed to load opportunities"
                }, {
                    status: 500
                });
            }
            rows = data ?? [];
        }
        const defs = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$statusDefinitionsResolve$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__["fetchEffectiveStatusDefinitions"])(supabase, ctx.orgId, "opportunities", {
            activeOnly: true
        });
        const snapshot = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$computeOpportunityLifecycleKpis$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["computeOpportunityLifecycleKpis"])(rows ?? [], defs);
        const countsByKey = new Map();
        for (const r of rows ?? []){
            const k = String(r.status_key ?? "").trim();
            if (!k) continue;
            countsByKey.set(k, (countsByKey.get(k) ?? 0) + 1);
        }
        const statusBreakdown = defs.filter((d)=>String(d.status_key ?? "").trim()).sort((a, b)=>{
            const ao = typeof a.sort_order === "number" ? a.sort_order : 0;
            const bo = typeof b.sort_order === "number" ? b.sort_order : 0;
            return ao - bo;
        }).map((d)=>{
            const key = String(d.status_key ?? "").trim();
            const label = String(d.status_label ?? "").trim() || key;
            const lifecycleStage = String(d.metadata?.lifecycle_stage ?? "").trim() || null;
            return {
                status_key: key,
                status_label: label,
                lifecycle_stage: lifecycleStage,
                count: countsByKey.get(key) ?? 0
            };
        });
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            ...snapshot,
            statusBreakdown
        });
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: message || "Failed to compute KPIs"
        }, {
            status: 500
        });
    }
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__f6d683df._.js.map