module.exports = [
"[project]/lib/supabaseAdmin.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Supabase admin client for server-side operations.
 * Uses service role key to bypass RLS for admin operations.
 * DO NOT use this in client components - only server components and route handlers.
 */ __turbopack_context__.s([
    "createAdminClient",
    ()=>createAdminClient
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$supabase$2d$js$2f$dist$2f$index$2e$mjs__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/node_modules/@supabase/supabase-js/dist/index.mjs [app-rsc] (ecmascript) <locals>");
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
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$supabase$2d$js$2f$dist$2f$index$2e$mjs__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__["createClient"])(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    });
}
}),
"[project]/lib/supabase/auth-env.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
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
"[project]/lib/supabaseServer.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Supabase client for server-side operations (middleware, server components).
 * Uses the same URL/key priority as the browser for auth cookies (NEXT_PUBLIC_* first).
 * Do NOT use this in client components.
 */ __turbopack_context__.s([
    "createClient",
    ()=>createClient
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$ssr$2f$dist$2f$module$2f$index$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/node_modules/@supabase/ssr/dist/module/index.js [app-rsc] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$ssr$2f$dist$2f$module$2f$createServerClient$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@supabase/ssr/dist/module/createServerClient.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$headers$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/headers.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabase$2f$auth$2d$env$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/supabase/auth-env.ts [app-rsc] (ecmascript)");
;
;
;
async function createClient() {
    const cookieStore = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$headers$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["cookies"])();
    const supabaseUrl = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabase$2f$auth$2d$env$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getSupabaseUrlForAuth"])();
    const supabaseAnonKey = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabase$2f$auth$2d$env$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getSupabaseAnonKeyForAuth"])();
    if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error("Missing Supabase environment variables. Required: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_URL and SUPABASE_ANON_KEY)");
    }
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$ssr$2f$dist$2f$module$2f$createServerClient$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["createServerClient"])(supabaseUrl, supabaseAnonKey, {
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
"[project]/lib/admin/cachedAuthSession.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "getCachedAuthUser",
    ()=>getCachedAuthUser,
    "getCachedAuthUserId",
    ()=>getCachedAuthUserId
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/rsc/react.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabaseServer$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/supabaseServer.ts [app-rsc] (ecmascript)");
;
;
const getCachedAuthUserId = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["cache"])(async ()=>{
    try {
        const supabase = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabaseServer$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["createClient"])();
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
const getCachedAuthUser = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["cache"])(async ()=>{
    try {
        const supabase = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabaseServer$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["createClient"])();
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
"[project]/lib/adminAuth.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
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
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/server.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabaseAdmin$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/supabaseAdmin.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$cachedAuthSession$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/cachedAuthSession.ts [app-rsc] (ecmascript)");
;
;
;
const ALLOWED_ROLES = [
    "admin",
    "ops"
];
async function getAdminAuth() {
    const t0 = Date.now();
    const user = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$cachedAuthSession$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getCachedAuthUser"])();
    const authUserMs = Date.now() - t0;
    if (!user?.id) return null;
    const t1 = Date.now();
    const admin = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabaseAdmin$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["createAdminClient"])();
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
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: "Unauthorized"
        }, {
            status: 401
        });
    }
    if (auth.role !== "admin") {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["NextResponse"].json({
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
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["NextResponse"].json({
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
"[project]/lib/admin/entityLabelsResolve.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "resolveEntityLabelsForOrg",
    ()=>resolveEntityLabelsForOrg
]);
async function resolveEntityLabelsForOrg(supabase, orgId) {
    const t0 = Date.now();
    const phases = {};
    let prev = t0;
    const mark = (name)=>{
        const now = Date.now();
        phases[name] = now - prev;
        prev = now;
    };
    const { data: orgRow } = await supabase.from("orgs").select("industry_id").eq("id", orgId).maybeSingle();
    mark("org_industry_lookup_ms");
    const industryId = orgRow?.industry_id ?? null;
    let industry = null;
    let defaultIndustryId = industryId;
    if (industryId) {
        const { data: ind } = await supabase.from("industries").select("key, label").eq("id", industryId).eq("is_active", true).maybeSingle();
        if (ind) {
            industry = {
                key: ind.key,
                label: ind.label
            };
        }
    }
    if (!defaultIndustryId) {
        const { data: generic } = await supabase.from("industries").select("id, key, label").eq("key", "generic").eq("is_active", true).maybeSingle();
        if (generic) {
            defaultIndustryId = generic.id;
            industry = {
                key: generic.key,
                label: generic.label
            };
        }
    }
    mark("industry_resolve_ms");
    const defaults = [];
    if (defaultIndustryId) {
        const { data: defaultRows } = await supabase.from("industry_default_entity_labels").select("entity_type, singular, plural").eq("industry_id", defaultIndustryId).order("entity_type", {
            ascending: true
        });
        if (defaultRows) {
            for (const r of defaultRows){
                defaults.push({
                    entity_type: r.entity_type,
                    singular: r.singular ?? null,
                    plural: r.plural ?? null
                });
            }
        }
    }
    mark("industry_defaults_ms");
    const { data: overrideRows } = await supabase.from("entity_labels").select("entity_type, singular, plural").eq("org_id", orgId).order("entity_type", {
        ascending: true
    });
    mark("org_overrides_ms");
    const overrides = (overrideRows ?? []).map((r)=>({
            entity_type: r.entity_type,
            singular: r.singular ?? null,
            plural: r.plural ?? null
        }));
    const overrideByType = {};
    for (const o of overrides)overrideByType[o.entity_type] = o;
    const effective = defaults.map((d)=>{
        const ov = overrideByType[d.entity_type];
        return {
            entity_type: d.entity_type,
            singular: ov?.singular ?? d.singular,
            plural: ov?.plural ?? d.plural
        };
    });
    mark("merge_effective_ms");
    const totalMs = Date.now() - t0;
    if (totalMs > 200) {
        console.warn("[entity-labels-perf] resolveEntityLabelsForOrg", {
            org_id: orgId,
            total_ms: totalMs,
            ...phases,
            defaults_rows: defaults.length,
            overrides_rows: overrides.length
        });
    }
    return {
        org_industry_id: industryId,
        industry,
        defaults,
        overrides,
        effective
    };
}
}),
"[project]/lib/admin/primaryAdminOpsOrg.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
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
"[project]/lib/admin/entityLabelsServer.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "entityLabelsMapFromEffective",
    ()=>entityLabelsMapFromEffective,
    "getAdminOrgIdForUser",
    ()=>getAdminOrgIdForUser,
    "loadEntityLabelsMapForUser",
    ()=>loadEntityLabelsMapForUser
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabaseAdmin$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/supabaseAdmin.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$entityLabelsResolve$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/entityLabelsResolve.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$primaryAdminOpsOrg$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/primaryAdminOpsOrg.ts [app-rsc] (ecmascript)");
;
;
;
function entityLabelsMapFromEffective(effective) {
    const map = {};
    for (const row of effective){
        map[row.entity_type] = {
            singular: row.singular ?? null,
            plural: row.plural ?? null
        };
    }
    return map;
}
async function getAdminOrgIdForUser(userId) {
    const supabase = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabaseAdmin$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["createAdminClient"])();
    const membership = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$primaryAdminOpsOrg$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["fetchPrimaryAdminOpsMembershipForUser"])(supabase, userId);
    if (membership) return membership.orgId;
    const { data: au } = await supabase.from("app_users").select("org_id").eq("id", userId).maybeSingle();
    const fromAppUser = au?.org_id ?? null;
    if (fromAppUser) return fromAppUser;
    const { data: auAuth } = await supabase.from("app_users").select("org_id").eq("auth_user_id", userId).maybeSingle();
    return auAuth?.org_id ?? null;
}
async function loadEntityLabelsMapForUser(userId) {
    const orgId = await getAdminOrgIdForUser(userId);
    if (!orgId) return {};
    const supabase = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabaseAdmin$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["createAdminClient"])();
    const { effective } = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$entityLabelsResolve$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["resolveEntityLabelsForOrg"])(supabase, orgId);
    return entityLabelsMapFromEffective(effective);
}
}),
"[project]/app/adminV2/workspace/AdminV2WorkspaceClientProviders.tsx [app-rsc] (client reference proxy) <module evaluation>", ((__turbopack_context__) => {
"use strict";

// This file is generated by next-core EcmascriptClientReferenceModule.
__turbopack_context__.s([
    "default",
    ()=>__TURBOPACK__default__export__
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$server$2d$dom$2d$turbopack$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/rsc/react-server-dom-turbopack-server.js [app-rsc] (ecmascript)");
;
const __TURBOPACK__default__export__ = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$server$2d$dom$2d$turbopack$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerClientReference"])(function() {
    throw new Error("Attempted to call the default export of [project]/app/adminV2/workspace/AdminV2WorkspaceClientProviders.tsx <module evaluation> from the server, but it's on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.");
}, "[project]/app/adminV2/workspace/AdminV2WorkspaceClientProviders.tsx <module evaluation>", "default");
}),
"[project]/app/adminV2/workspace/AdminV2WorkspaceClientProviders.tsx [app-rsc] (client reference proxy)", ((__turbopack_context__) => {
"use strict";

// This file is generated by next-core EcmascriptClientReferenceModule.
__turbopack_context__.s([
    "default",
    ()=>__TURBOPACK__default__export__
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$server$2d$dom$2d$turbopack$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/rsc/react-server-dom-turbopack-server.js [app-rsc] (ecmascript)");
;
const __TURBOPACK__default__export__ = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$server$2d$dom$2d$turbopack$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerClientReference"])(function() {
    throw new Error("Attempted to call the default export of [project]/app/adminV2/workspace/AdminV2WorkspaceClientProviders.tsx from the server, but it's on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.");
}, "[project]/app/adminV2/workspace/AdminV2WorkspaceClientProviders.tsx", "default");
}),
"[project]/app/adminV2/workspace/AdminV2WorkspaceClientProviders.tsx [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$workspace$2f$AdminV2WorkspaceClientProviders$2e$tsx__$5b$app$2d$rsc$5d$__$28$client__reference__proxy$29$__$3c$module__evaluation$3e$__ = __turbopack_context__.i("[project]/app/adminV2/workspace/AdminV2WorkspaceClientProviders.tsx [app-rsc] (client reference proxy) <module evaluation>");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$workspace$2f$AdminV2WorkspaceClientProviders$2e$tsx__$5b$app$2d$rsc$5d$__$28$client__reference__proxy$29$__ = __turbopack_context__.i("[project]/app/adminV2/workspace/AdminV2WorkspaceClientProviders.tsx [app-rsc] (client reference proxy)");
;
__turbopack_context__.n(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$workspace$2f$AdminV2WorkspaceClientProviders$2e$tsx__$5b$app$2d$rsc$5d$__$28$client__reference__proxy$29$__);
}),
"[project]/lib/admin/timezoneContract.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
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
"[project]/lib/admin/viewerTimezoneBootstrap.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "loadAdminViewerTimezoneBootstrap",
    ()=>loadAdminViewerTimezoneBootstrap
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabaseAdmin$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/supabaseAdmin.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$entityLabelsServer$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/entityLabelsServer.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$timezoneContract$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/timezoneContract.ts [app-rsc] (ecmascript)");
;
;
;
async function loadAdminViewerTimezoneBootstrap(userId) {
    try {
        const orgId = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$entityLabelsServer$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getAdminOrgIdForUser"])(userId);
        if (!orgId) {
            return {
                iana: __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$timezoneContract$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["UTC_FALLBACK_IANA"],
                source: "utc_fallback"
            };
        }
        const supabase = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabaseAdmin$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["createAdminClient"])();
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$timezoneContract$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["fetchEffectiveUserDisplayTimezone"])(supabase, {
            userId,
            orgId
        });
    } catch (e) {
        console.error("[viewerTimezoneBootstrap] failed:", e);
        return {
            iana: __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$timezoneContract$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["UTC_FALLBACK_IANA"],
            source: "utc_fallback"
        };
    }
}
}),
"[project]/lib/admin/loadOperationalOrgTimezoneServer.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "loadOperationalOrgTimezoneIana",
    ()=>loadOperationalOrgTimezoneIana
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabaseAdmin$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/supabaseAdmin.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$timezoneContract$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/timezoneContract.ts [app-rsc] (ecmascript)");
;
;
async function loadOperationalOrgTimezoneIana(orgId) {
    const supabase = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabaseAdmin$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["createAdminClient"])();
    const { iana } = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$timezoneContract$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["fetchOperationalTimezoneForOrg"])(supabase, orgId);
    return iana;
}
}),
"[project]/app/adminV2/workspace/layout.tsx [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>AdminV2WorkspaceLayout,
    "dynamic",
    ()=>dynamic
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/rsc/react-jsx-dev-runtime.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$api$2f$navigation$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/node_modules/next/dist/api/navigation.react-server.js [app-rsc] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$components$2f$navigation$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/client/components/navigation.react-server.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminAuth$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/adminAuth.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$entityLabelsServer$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/entityLabelsServer.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabaseAdmin$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/supabaseAdmin.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$workspace$2f$AdminV2WorkspaceClientProviders$2e$tsx__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/adminV2/workspace/AdminV2WorkspaceClientProviders.tsx [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$viewerTimezoneBootstrap$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/viewerTimezoneBootstrap.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$loadOperationalOrgTimezoneServer$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/loadOperationalOrgTimezoneServer.ts [app-rsc] (ecmascript)");
;
;
;
;
;
;
;
;
const dynamic = "force-dynamic";
async function AdminV2WorkspaceLayout({ children }) {
    const auth = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminAuth$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getAdminAuth"])();
    if (!auth?.user?.id || !auth.role) {
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$components$2f$navigation$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["redirect"])("/unauthorized");
    }
    const orgId = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$entityLabelsServer$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getAdminOrgIdForUser"])(auth.user.id);
    if (!orgId) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "flex min-h-screen items-center justify-center bg-admin-page p-6 text-alloy-midnight",
            children: "Loading context..."
        }, void 0, false, {
            fileName: "[project]/app/adminV2/workspace/layout.tsx",
            lineNumber: 26,
            columnNumber: 7
        }, this);
    }
    let orgName = null;
    try {
        const supabase = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabaseAdmin$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["createAdminClient"])();
        const { data: orgRow } = await supabase.from("orgs").select("name").eq("id", orgId).maybeSingle();
        const n = orgRow && typeof orgRow.name === "string" ? orgRow.name.trim() : "";
        orgName = n || null;
    } catch (e) {
        console.error("[adminV2/workspace/layout] org name load failed:", e);
    }
    let viewerTimezone = {
        iana: "UTC",
        source: "utc_fallback"
    };
    try {
        viewerTimezone = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$viewerTimezoneBootstrap$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["loadAdminViewerTimezoneBootstrap"])(auth.user.id);
    } catch (e) {
        console.error("[adminV2/workspace/layout] viewer timezone bootstrap failed:", e);
    }
    let operationalTimezoneIana = "UTC";
    try {
        operationalTimezoneIana = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$loadOperationalOrgTimezoneServer$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["loadOperationalOrgTimezoneIana"])(orgId);
    } catch (e) {
        console.error("[adminV2/workspace/layout] operational org timezone failed:", e);
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$workspace$2f$AdminV2WorkspaceClientProviders$2e$tsx__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["default"], {
        userEmail: typeof auth.user.email === "string" && auth.user.email ? auth.user.email : "Unknown",
        role: auth.role,
        orgName: orgName,
        initialViewerTimezone: viewerTimezone,
        initialOperationalTimezoneIana: operationalTimezoneIana,
        children: children
    }, void 0, false, {
        fileName: "[project]/app/adminV2/workspace/layout.tsx",
        lineNumber: 57,
        columnNumber: 5
    }, this);
}
}),
];

//# sourceMappingURL=_6744bc5d._.js.map