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
"[project]/lib/adminFormatters.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Shared formatting helpers for admin portal.
 * Use these for consistent date and currency display in tables and drawers.
 */ __turbopack_context__.s([
    "RECURRENCE_UNIT_OPTIONS",
    ()=>RECURRENCE_UNIT_OPTIONS,
    "formatDate",
    ()=>formatDate,
    "formatDateTime",
    ()=>formatDateTime,
    "formatDateTimeLocal",
    ()=>formatDateTimeLocal,
    "formatFrequencyLabel",
    ()=>formatFrequencyLabel,
    "formatMoney",
    ()=>formatMoney,
    "formatMoneyFromCents",
    ()=>formatMoneyFromCents,
    "formatMoneyFromDollars",
    ()=>formatMoneyFromDollars,
    "formatPayoutPercent",
    ()=>formatPayoutPercent,
    "formatPhoneUS",
    ()=>formatPhoneUS,
    "formatRecurrenceLabel",
    ()=>formatRecurrenceLabel,
    "formatScheduleDrawerHeaderTitle",
    ()=>formatScheduleDrawerHeaderTitle,
    "personDisplayName",
    ()=>personDisplayName
]);
const usdOptions = {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
};
function formatMoneyFromCents(value) {
    if (value === null || value === undefined) return "-";
    const num = typeof value === "string" ? parseFloat(value) : value;
    if (Number.isNaN(num)) return "-";
    return new Intl.NumberFormat("en-US", usdOptions).format(num / 100);
}
function formatMoneyFromDollars(value) {
    if (value === null || value === undefined) return "-";
    const num = typeof value === "string" ? parseFloat(value) : value;
    if (Number.isNaN(num)) return "-";
    return new Intl.NumberFormat("en-US", usdOptions).format(num);
}
function formatMoney(value, fieldName) {
    if (value === null || value === undefined) return "-";
    const num = typeof value === "string" ? parseFloat(value) : value;
    if (Number.isNaN(num)) return "-";
    const isCents = fieldName?.endsWith("_cents") ?? false;
    const dollars = isCents ? num / 100 : num;
    return new Intl.NumberFormat("en-US", usdOptions).format(dollars);
}
function formatPayoutPercent(value) {
    if (value === null || value === undefined) return "—";
    const n = typeof value === "string" ? parseFloat(value) : typeof value === "number" ? value : Number(value);
    if (Number.isNaN(n)) return "—";
    const display = n > 0 && n <= 1 ? n * 100 : n;
    return `${display}%`;
}
function formatDate(value) {
    if (value === null || value === undefined) return "-";
    const d = typeof value === "object" ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return "-";
    return new Intl.DateTimeFormat("en-US", {
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
        timeZone: "UTC"
    }).format(d);
}
function formatFrequencyLabel(cadence, interval) {
    const c = (cadence ?? "month").toLowerCase();
    const n = Math.max(1, Number(interval) || 1);
    if (c === "week") return n === 1 ? "Every 1 week" : `Every ${n} weeks`;
    return n === 1 ? "Every 1 month" : `Every ${n} months`;
}
function formatPhoneUS(value) {
    if (value == null || value === "") return "—";
    const digits = String(value).replace(/\D/g, "");
    if (digits.length < 10) return String(value);
    const area = digits.slice(-10, -7);
    const mid = digits.slice(-7, -4);
    const last = digits.slice(-4);
    return `(${area}) ${mid}-${last}`;
}
function formatDateTime(value) {
    if (value === null || value === undefined) return "-";
    const d = typeof value === "object" ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return "-";
    return new Intl.DateTimeFormat("en-US", {
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZone: "UTC"
    }).format(d);
}
function formatDateTimeLocal(value) {
    if (value === null || value === undefined) return "-";
    const d = typeof value === "object" ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return "-";
    const s = new Intl.DateTimeFormat("en-US", {
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true
    }).format(d);
    return s.replace(",", "").replace(/\s+/g, " ").trim();
}
const RECURRENCE_UNIT_OPTIONS = [
    {
        value: "day",
        label: "Day"
    },
    {
        value: "week",
        label: "Week"
    },
    {
        value: "month",
        label: "Month"
    },
    {
        value: "quarter",
        label: "Quarter"
    },
    {
        value: "year",
        label: "Year"
    }
];
function formatRecurrenceLabel(unit, interval) {
    if (!unit || interval == null || interval < 1) return null;
    const i = Math.max(1, Number(interval) || 1);
    const u = unit.toLowerCase();
    if (u === "day" && i === 1) return "Daily";
    if (u === "day") return `Every ${i} days`;
    if (u === "week" && i === 1) return "Weekly";
    if (u === "week") return `Every ${i} weeks`;
    if (u === "month" && i === 1) return "Monthly";
    if (u === "month") return `Every ${i} months`;
    if (u === "quarter" && i === 1) return "Quarterly";
    if (u === "quarter") return `Every ${i} quarters`;
    if (u === "year" && i === 1) return "Annually";
    if (u === "year") return `Every ${i} years`;
    return `${i} ${u}(s)`;
}
function personDisplayName(o) {
    if (!o) return "—";
    const full = o.full_name?.trim();
    if (full) return full;
    const parts = [
        o.first_name,
        o.last_name
    ].filter(Boolean).map((s)=>String(s).trim());
    return parts.length ? parts.join(" ") : "—";
}
function formatScheduleDrawerHeaderTitle(iso, timeZone) {
    if (iso == null || String(iso).trim() === "") return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const tz = timeZone && String(timeZone).trim() ? String(timeZone).trim() : undefined;
    const dateParts = new Intl.DateTimeFormat("en-US", {
        month: "numeric",
        day: "numeric",
        year: "2-digit",
        timeZone: tz
    }).formatToParts(d);
    const month = dateParts.find((p)=>p.type === "month")?.value ?? "";
    const day = dateParts.find((p)=>p.type === "day")?.value ?? "";
    const year = dateParts.find((p)=>p.type === "year")?.value ?? "";
    const dateStr = `${month}/${day}/${year}`;
    const tp = new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        minute: "numeric",
        hour12: true,
        timeZone: tz
    }).formatToParts(d);
    const hourRaw = tp.find((p)=>p.type === "hour")?.value ?? "12";
    const minRaw = tp.find((p)=>p.type === "minute")?.value ?? "00";
    const dayPeriod = (tp.find((p)=>p.type === "dayPeriod")?.value ?? "am").toLowerCase();
    const isPm = dayPeriod.startsWith("p");
    let hour12 = parseInt(hourRaw, 10);
    if (Number.isNaN(hour12)) hour12 = 12;
    if (hour12 === 0) hour12 = 12;
    const minNum = parseInt(minRaw, 10);
    const suffix = isPm ? "p" : "a";
    let timeCompact;
    if (!Number.isNaN(minNum) && minNum === 0) {
        timeCompact = `${hour12}${suffix}`;
    } else {
        const mm = Number.isNaN(minNum) ? "00" : String(minNum).padStart(2, "0");
        timeCompact = `${hour12}${mm}${suffix}`;
    }
    return `${dateStr} · ${timeCompact}`;
}
}),
"[project]/lib/admin/vendorOptionLabel.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Human-readable labels for vendor dropdowns and job/schedule display.
 * Value saved to DB remains vendors.id; labels are presentation-only.
 */ __turbopack_context__.s([
    "buildVendorIdToLabelMap",
    ()=>buildVendorIdToLabelMap,
    "formatVendorOptionLabel",
    ()=>formatVendorOptionLabel,
    "vendorRowToDisplayStub",
    ()=>vendorRowToDisplayStub,
    "vendorsToSelectOptions",
    ()=>vendorsToSelectOptions
]);
function formatVendorOptionLabel(v) {
    const company = v.company_name?.trim();
    if (company) return company;
    const person = [
        v.primary_person?.first_name,
        v.primary_person?.last_name
    ].filter(Boolean).join(" ").trim();
    if (person) return person;
    const name = v.name?.trim();
    if (name) return name;
    const email = v.email?.trim();
    if (email) return email;
    const phone = v.phone?.trim();
    if (phone) return phone;
    return `${v.id.slice(0, 8)}…`;
}
function buildVendorIdToLabelMap(vendorRows, persons) {
    const pmap = new Map(persons.map((p)=>[
            p.id,
            p
        ]));
    const m = new Map();
    for (const r of vendorRows){
        const person = r.primary_person_id ? pmap.get(r.primary_person_id) ?? null : null;
        m.set(r.id, formatVendorOptionLabel({
            id: r.id,
            name: r.name,
            company_name: r.company_name,
            email: r.email,
            phone: r.phone,
            primary_person: person ?? null
        }));
    }
    return m;
}
function vendorsToSelectOptions(vendorRows, personById) {
    return vendorRows.map((r)=>{
        const person = r.primary_person_id ? personById.get(r.primary_person_id) ?? null : null;
        const label = formatVendorOptionLabel({
            id: r.id,
            name: r.name,
            company_name: r.company_name,
            email: r.email,
            phone: r.phone,
            primary_person: person
        });
        return {
            id: r.id,
            name: r.name ?? null,
            label
        };
    });
}
function vendorRowToDisplayStub(row, person) {
    return {
        id: row.id,
        name: formatVendorOptionLabel({
            id: row.id,
            name: row.name,
            company_name: row.company_name,
            email: row.email,
            phone: row.phone,
            primary_person: person
        })
    };
}
}),
"[project]/lib/admin/relationshipDisplayAttach.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "attachDirectFkRelationshipDisplays",
    ()=>attachDirectFkRelationshipDisplays
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$vendorOptionLabel$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/vendorOptionLabel.ts [app-route] (ecmascript)");
;
function numOrNull(v) {
    if (v == null) return null;
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "") {
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    }
    return null;
}
function contactLabel(c) {
    const n = [
        c.first_name,
        c.last_name
    ].filter(Boolean).join(" ").trim();
    if (n) return n;
    return c.email && String(c.email).trim() || "—";
}
const DRAWER_FK_SPECS = {
    jobs: [
        {
            column: "customer_id",
            kind: "customer"
        },
        {
            column: "location_id",
            kind: "location"
        },
        {
            column: "opportunity_id",
            kind: "opportunity"
        },
        {
            column: "assigned_vendor_id",
            kind: "vendor"
        },
        {
            column: "primary_person_id",
            kind: "person"
        },
        {
            column: "primary_contact_id",
            kind: "contact"
        }
    ],
    customers: [
        {
            column: "primary_contact_id",
            kind: "contact"
        }
    ],
    opportunities: [
        {
            column: "customer_id",
            kind: "customer"
        },
        {
            column: "location_id",
            kind: "location"
        },
        {
            column: "primary_person_id",
            kind: "person"
        },
        {
            column: "primary_contact_id",
            kind: "contact"
        }
    ],
    locations: [
        {
            column: "customer_id",
            kind: "customer"
        },
        {
            column: "vendor_id",
            kind: "vendor"
        }
    ],
    schedules: [
        {
            column: "job_id",
            kind: "job"
        },
        {
            column: "location_id",
            kind: "location"
        },
        {
            column: "assigned_vendor_id",
            kind: "vendor"
        }
    ],
    vendors: [
        {
            column: "primary_person_id",
            kind: "person"
        },
        {
            column: "primary_contact_id",
            kind: "contact"
        }
    ]
};
const STUB_KEY = (kind, id)=>`${kind}:${id}`;
async function attachDirectFkRelationshipDisplays(supabase, orgId, drawerType, out) {
    const specs = DRAWER_FK_SPECS[drawerType];
    if (!specs?.length) {
        out._relationship_displays = {};
        return;
    }
    const byKind = new Map();
    for (const { column, kind } of specs){
        const raw = out[column];
        if (typeof raw === "string" && raw.trim()) {
            const id = raw.trim();
            if (!byKind.has(kind)) byKind.set(kind, new Set());
            byKind.get(kind).add(id);
        }
    }
    const stubByKey = new Map();
    const customerIds = byKind.get("customer");
    if (customerIds?.size) {
        const { data: rows } = await supabase.from("customers").select("id, name, customer_number").eq("org_id", orgId).in("id", [
            ...customerIds
        ]);
        for (const r of rows ?? []){
            const row = r;
            stubByKey.set(STUB_KEY("customer", row.id), {
                id: row.id,
                entity_type: "customer",
                label: row.name && String(row.name).trim() || "—",
                record_number: numOrNull(row.customer_number)
            });
        }
    }
    const jobIds = byKind.get("job");
    if (jobIds?.size) {
        const { data: rows } = await supabase.from("jobs").select("id, title, service_key, job_number, job_number_for_customer").eq("org_id", orgId).in("id", [
            ...jobIds
        ]);
        for (const r of rows ?? []){
            const row = r;
            const jn = numOrNull(row.job_number);
            const label = row.title && String(row.title).trim() || row.service_key && String(row.service_key).trim() || (jn != null ? `Job #${jn}` : row.job_number_for_customer != null ? `Job #${row.job_number_for_customer}` : row.id.slice(0, 8));
            stubByKey.set(STUB_KEY("job", row.id), {
                id: row.id,
                entity_type: "job",
                label,
                record_number: jn
            });
        }
    }
    const locationIds = byKind.get("location");
    if (locationIds?.size) {
        const { data: rows } = await supabase.from("locations").select("id, label, address1, city, postal_code, location_number").eq("org_id", orgId).in("id", [
            ...locationIds
        ]);
        for (const r of rows ?? []){
            const row = r;
            const lbl = row.label && String(row.label).trim() || [
                row.address1,
                row.city,
                row.postal_code
            ].filter(Boolean).join(", ") || "—";
            stubByKey.set(STUB_KEY("location", row.id), {
                id: row.id,
                entity_type: "location",
                label: lbl,
                record_number: numOrNull(row.location_number)
            });
        }
    }
    const personIds = byKind.get("person");
    if (personIds?.size) {
        const { data: rows } = await supabase.from("persons").select("id, first_name, last_name, full_name, email, person_number").eq("org_id", orgId).in("id", [
            ...personIds
        ]);
        for (const r of rows ?? []){
            const row = r;
            const nm = row.full_name && String(row.full_name).trim() || [
                row.first_name,
                row.last_name
            ].filter(Boolean).join(" ").trim() || row.email && String(row.email).trim() || "—";
            stubByKey.set(STUB_KEY("person", row.id), {
                id: row.id,
                entity_type: "person",
                label: nm,
                record_number: numOrNull(row.person_number)
            });
        }
    }
    const vendorIds = byKind.get("vendor");
    if (vendorIds?.size) {
        const { data: rows } = await supabase.from("vendors").select("id, name, company_name, email, phone, primary_person_id, vendor_number").eq("org_id", orgId).in("id", [
            ...vendorIds
        ]);
        const vRows = rows ?? [];
        const ppIds = [
            ...new Set(vRows.map((v)=>v.primary_person_id).filter(Boolean))
        ];
        const { data: persons } = ppIds.length > 0 ? await supabase.from("persons").select("id, first_name, last_name").eq("org_id", orgId).in("id", ppIds) : {
            data: []
        };
        const personById = new Map((persons ?? []).map((p)=>[
                p.id,
                p
            ]));
        for (const row of vRows){
            const person = row.primary_person_id ? personById.get(row.primary_person_id) ?? null : null;
            const stub = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$vendorOptionLabel$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["vendorRowToDisplayStub"])(row, person);
            stubByKey.set(STUB_KEY("vendor", row.id), {
                id: row.id,
                entity_type: "vendor",
                label: stub.name,
                record_number: numOrNull(row.vendor_number)
            });
        }
    }
    const opportunityIds = byKind.get("opportunity");
    if (opportunityIds?.size) {
        const { data: rows } = await supabase.from("opportunities").select("id, name, title, opportunity_number").eq("org_id", orgId).in("id", [
            ...opportunityIds
        ]);
        for (const r of rows ?? []){
            const row = r;
            const lbl = row.name && String(row.name).trim() || row.title && String(row.title).trim() || "—";
            stubByKey.set(STUB_KEY("opportunity", row.id), {
                id: row.id,
                entity_type: "opportunity",
                label: lbl,
                record_number: numOrNull(row.opportunity_number)
            });
        }
    }
    const contactIds = byKind.get("contact");
    if (contactIds?.size) {
        const { data: rows } = await supabase.from("contacts").select("id, first_name, last_name, email").eq("org_id", orgId).in("id", [
            ...contactIds
        ]);
        for (const r of rows ?? []){
            const row = r;
            stubByKey.set(STUB_KEY("contact", row.id), {
                id: row.id,
                entity_type: "contact",
                label: contactLabel(row)
            });
        }
    }
    const displays = {};
    for (const { column, kind } of specs){
        const raw = out[column];
        if (typeof raw !== "string" || !raw.trim()) {
            displays[column] = null;
            continue;
        }
        displays[column] = stubByKey.get(STUB_KEY(kind, raw.trim())) ?? null;
    }
    out._relationship_displays = displays;
}
}),
"[project]/lib/admin/scheduleRecordSnapshot.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Schedule “snapshot” — single composed view of operational schedule data for admin UI.
 * Lives under record_layouts / overview_rows: layout stays config-driven; values come from here.
 */ __turbopack_context__.s([
    "computeScheduleHydratedDisplay",
    ()=>computeScheduleHydratedDisplay,
    "computeScheduleSnapshot",
    ()=>computeScheduleSnapshot,
    "computeScheduleSnapshotFromHydratedRecord",
    ()=>computeScheduleSnapshotFromHydratedRecord,
    "getContactEmailRaw",
    ()=>getContactEmailRaw,
    "getScheduleSnapshot",
    ()=>getScheduleSnapshot,
    "resolveScheduleCustomerDisplayName",
    ()=>resolveScheduleCustomerDisplayName,
    "resolveSchedulePriceCents",
    ()=>resolveSchedulePriceCents,
    "resolveScheduleServiceDisplay",
    ()=>resolveScheduleServiceDisplay,
    "scheduleOverviewValueFromSnapshot",
    ()=>scheduleOverviewValueFromSnapshot,
    "shouldHideContactEmailDuplicate",
    ()=>shouldHideContactEmailDuplicate,
    "shouldShowScheduleContactEmailRow",
    ()=>shouldShowScheduleContactEmailRow
]);
function trimStr(v) {
    if (v == null) return "";
    return String(v).trim();
}
function resolveCustomerNameLine(input) {
    const fromCust = trimStr(input.customer?.name);
    if (fromCust) return fromCust;
    const pn = trimStr(input.primaryPersonName);
    if (pn) return pn;
    const pc = trimStr(input.primaryContactDisplayName);
    if (pc) return pc;
    const ct = input.contact;
    if (ct) {
        const nm = [
            trimStr(ct.first_name),
            trimStr(ct.last_name)
        ].filter(Boolean).join(" ").trim();
        if (nm) return nm;
        const em = trimStr(ct.email);
        if (em) return em;
    }
    return "";
}
function resolveLocationAddress(input) {
    const top = trimStr(input.location?.preferredLabel);
    if (top) return top;
    const loc = input.location;
    if (!loc) return null;
    const line = [
        loc.address1,
        loc.city,
        loc.state,
        loc.postal_code
    ].map(trimStr).filter(Boolean).join(", ");
    return line || null;
}
function resolveServiceLabel(schedule, job) {
    const direct = trimStr(schedule.service_type);
    if (direct) return direct.replace(/_/g, " ");
    const j = job;
    if (!j) return null;
    const sk = trimStr(j.service_key ?? j.job_type);
    if (sk) return sk.replace(/_/g, " ");
    return null;
}
function resolvePriceCents(schedule, job) {
    const raw = schedule.price_cents;
    if (raw != null && raw !== "") {
        const n = typeof raw === "number" ? raw : parseInt(String(raw), 10);
        if (Number.isFinite(n)) return n;
    }
    if (!job) return null;
    const jn = (typeof job.display_total_cents === "number" ? job.display_total_cents : null) ?? (typeof job.gross_price_cents === "number" ? job.gross_price_cents : null) ?? (typeof job.estimated_total_cents === "number" ? job.estimated_total_cents : null);
    if (jn != null && Number.isFinite(Number(jn))) return Number(jn);
    return null;
}
function computeScheduleSnapshot(input) {
    const nameLine = resolveCustomerNameLine(input);
    const emailRaw = trimStr(input.contact?.email) || null;
    const phoneRaw = trimStr(input.contact?.phone) || null;
    const emailSuppressedAsDuplicate = Boolean(emailRaw && nameLine && emailRaw.toLowerCase() === nameLine.toLowerCase());
    const sched = input.schedule;
    const job = input.job;
    return {
        customer: {
            name: nameLine,
            email: emailRaw,
            phone: phoneRaw,
            emailSuppressedAsDuplicate
        },
        vendor: {
            name: trimStr(input.vendor?.name) || null
        },
        location: {
            address: resolveLocationAddress(input)
        },
        service: {
            label: resolveServiceLabel(sched, job),
            price: resolvePriceCents(sched, job)
        },
        timing: {
            start_at: sched.start_at != null && String(sched.start_at).trim() !== "" ? String(sched.start_at) : null,
            end_at: sched.end_at != null && String(sched.end_at).trim() !== "" ? String(sched.end_at) : null,
            timezone: sched.timezone != null && String(sched.timezone).trim() !== "" ? String(sched.timezone) : null
        }
    };
}
function computeScheduleSnapshotFromHydratedRecord(record) {
    const job = record._job ?? null;
    const customer = record._customer ?? null;
    const locRow = record._location;
    const location = locRow ? {
        preferredLabel: record._location_label ?? record._location_name,
        address1: locRow.address1,
        city: locRow.city,
        state: locRow.state,
        postal_code: locRow.postal_code
    } : {
        preferredLabel: record._location_label ?? record._location_name,
        address1: null,
        city: null,
        state: null,
        postal_code: null
    };
    const vStub = record._vendor;
    const jvStub = record._job_assigned_vendor;
    const vendorName = trimStr(record._assigned_vendor_name) || trimStr(vStub?.name) || trimStr(jvStub?.name) || null;
    return computeScheduleSnapshot({
        schedule: {
            start_at: record.start_at,
            end_at: record.end_at,
            timezone: record.timezone,
            service_type: record.service_type,
            price_cents: record.price_cents
        },
        job,
        customer,
        location,
        vendor: vendorName ? {
            name: vendorName
        } : null,
        contact: record._contact ?? null,
        primaryPersonName: trimStr(record._primary_person_name) || null,
        primaryContactDisplayName: trimStr(record._primary_contact_name ?? record._contact_name) || null
    });
}
function shouldShowScheduleContactEmailRow(record) {
    const s = getScheduleSnapshot(record);
    if (s.customer.emailSuppressedAsDuplicate) return false;
    const em = trimStr(s.customer.email);
    return em.length > 0;
}
function getScheduleSnapshot(record) {
    const existing = record._schedule_snapshot;
    if (existing && typeof existing === "object" && existing.customer && existing.service) {
        return existing;
    }
    return computeScheduleSnapshotFromHydratedRecord(record);
}
function scheduleOverviewValueFromSnapshot(snap, fieldKey) {
    const k = fieldKey.trim();
    switch(k){
        case "_customer_name":
            return snap.customer.name || undefined;
        case "_contact_email":
            return snap.customer.emailSuppressedAsDuplicate ? "—" : snap.customer.email ?? undefined;
        case "_contact_phone":
            return snap.customer.phone ?? undefined;
        case "service_type":
            return snap.service.label ?? undefined;
        case "price_cents":
            return snap.service.price === null ? undefined : snap.service.price;
        case "_location_label":
            return snap.location.address ?? undefined;
        case "start_at":
            return snap.timing.start_at ?? undefined;
        case "end_at":
            return snap.timing.end_at ?? undefined;
        default:
            return undefined;
    }
}
function computeScheduleHydratedDisplay(out) {
    const snap = computeScheduleSnapshotFromHydratedRecord(out);
    out._schedule_snapshot = snap;
    if (snap.customer.name) {
        out._customer_name = snap.customer.name;
    }
    out._contact_email_duplicate_of_customer = snap.customer.emailSuppressedAsDuplicate;
}
function resolveScheduleCustomerDisplayName(record) {
    return getScheduleSnapshot(record).customer.name;
}
function getContactEmailRaw(record) {
    return getScheduleSnapshot(record).customer.email ?? "";
}
function shouldHideContactEmailDuplicate(record, customerDisplay) {
    const em = getContactEmailRaw(record);
    if (!em || !customerDisplay.trim()) return false;
    return em.toLowerCase() === customerDisplay.trim().toLowerCase();
}
function resolveScheduleServiceDisplay(record) {
    return getScheduleSnapshot(record).service.label ?? "";
}
function resolveSchedulePriceCents(record) {
    return getScheduleSnapshot(record).service.price;
}
}),
"[project]/lib/admin/typedFieldValues.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Maps field_definitions.field_type → field_values typed columns.
 * Clears sibling columns on write so one source column is authoritative.
 */ /** field_values table has only typed columns (no legacy value column). */ __turbopack_context__.s([
    "displayFromFieldValueRow",
    ()=>displayFromFieldValueRow,
    "payloadFromFieldType",
    ()=>payloadFromFieldType
]);
/** Typed columns only; used for insert/update. Do not add legacy value. */ const EMPTY_TYPED = {
    value_text: null,
    value_number: null,
    value_boolean: null,
    value_date: null,
    value_json: null
};
function payloadFromFieldType(fieldType, raw) {
    const t = (fieldType || "text").toLowerCase();
    if (t === "multiselect") {
        let arr = [];
        if (Array.isArray(raw)) {
            arr = raw.filter((x)=>typeof x === "string" && x.trim() !== "").map((x)=>x.trim());
        } else if (typeof raw === "string" && raw.trim()) {
            try {
                const p = JSON.parse(raw);
                if (Array.isArray(p)) {
                    arr = p.filter((x)=>typeof x === "string" && x.trim() !== "").map((x)=>x.trim());
                }
            } catch  {
                arr = raw.split(",").map((x)=>x.trim()).filter(Boolean);
            }
        }
        if (arr.length === 0) return {
            ...EMPTY_TYPED
        };
        const text = arr.join(", ");
        return {
            ...EMPTY_TYPED,
            value_json: arr,
            value_text: text
        };
    }
    const s = raw == null ? "" : typeof raw === "boolean" ? raw ? "true" : "false" : typeof raw === "number" && !Number.isNaN(raw) ? String(raw) : String(raw).trim();
    if (s === "") {
        return {
            ...EMPTY_TYPED
        };
    }
    if (t === "number") {
        const n = parseFloat(s.replace(/,/g, ""));
        const num = Number.isFinite(n) ? n : null;
        return {
            ...EMPTY_TYPED,
            value_number: num,
            value_text: s
        };
    }
    if (t === "boolean") {
        const b = s === "true" || s === "1" || s.toLowerCase() === "yes";
        return {
            ...EMPTY_TYPED,
            value_boolean: b,
            value_text: s
        };
    }
    if (t === "date" || t === "datetime") {
        const ms = Date.parse(s);
        const iso = Number.isFinite(ms) ? new Date(ms).toISOString() : null;
        return {
            ...EMPTY_TYPED,
            value_date: iso,
            value_text: s
        };
    }
    if (t === "select") {
        return {
            ...EMPTY_TYPED,
            value_text: s
        };
    }
    return {
        ...EMPTY_TYPED,
        value_text: s
    };
}
function displayFromFieldValueRow(fieldType, row) {
    if (!row) return "";
    const t = (fieldType || "text").toLowerCase();
    if (t === "number" && row.value_number != null && !Number.isNaN(Number(row.value_number))) {
        return String(row.value_number);
    }
    if (t === "boolean" && row.value_boolean != null) {
        return row.value_boolean ? "true" : "false";
    }
    if ((t === "date" || t === "datetime") && row.value_date) {
        return String(row.value_date).slice(0, t === "date" ? 10 : 16);
    }
    if (t === "multiselect" && row.value_json != null) {
        if (Array.isArray(row.value_json)) {
            return row.value_json.filter((x)=>typeof x === "string").join(", ");
        }
    }
    if (row.value_text != null && row.value_text !== "") return row.value_text;
    if (row.value_json != null) {
        try {
            return typeof row.value_json === "string" ? row.value_json : JSON.stringify(row.value_json);
        } catch  {
            return "";
        }
    }
    return "";
}
}),
"[project]/lib/admin/entityFieldRegistryAttach.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "DRAWER_TYPE_TO_FIELD_ENTITY_TYPE",
    ()=>DRAWER_TYPE_TO_FIELD_ENTITY_TYPE,
    "attachFieldDefinitionsAndValues",
    ()=>attachFieldDefinitionsAndValues,
    "hasMeaningfulNativeFieldValue",
    ()=>hasMeaningfulNativeFieldValue
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$typedFieldValues$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/typedFieldValues.ts [app-route] (ecmascript)");
;
const DRAWER_TYPE_TO_FIELD_ENTITY_TYPE = {
    customers: "customer",
    jobs: "job",
    opportunities: "opportunity",
    vendors: "vendor",
    schedules: "schedule",
    persons: "person",
    locations: "location"
};
function hasMeaningfulNativeFieldValue(v) {
    if (v === undefined) return false;
    if (v === null) return false;
    if (typeof v === "boolean") return true;
    if (typeof v === "number") return !Number.isNaN(v);
    if (typeof v === "string") return v.trim() !== "";
    return true;
}
async function attachFieldDefinitionsAndValues(supabase, out, drawerType, entityId, options) {
    const mergeValues = options?.mergeValues !== false;
    const entityType = DRAWER_TYPE_TO_FIELD_ENTITY_TYPE[drawerType];
    if (!entityType) return;
    let orgId = out.org_id ?? null;
    if (!orgId && drawerType === "schedules" && out._job) {
        orgId = out._job.org_id ?? null;
    }
    if (!orgId) return;
    const { data: defRows } = await supabase.from("field_definitions").select("id, field_key, field_type, label, section_key, sort_order, is_system, is_visible_in_drawer").eq("org_id", orgId).eq("entity_type", entityType).eq("is_active", true).order("section_key", {
        ascending: true
    }).order("sort_order", {
        ascending: true
    });
    const fieldDefs = defRows ?? [];
    out._field_definitions = fieldDefs;
    const { data: sectionRows } = await supabase.from("field_section_definitions").select("section_key, label, sort_order").eq("org_id", orgId).eq("entity_type", entityType).order("sort_order", {
        ascending: true
    });
    out._field_sections = sectionRows ?? [];
    if (fieldDefs.length === 0) return;
    const customDefs = fieldDefs.filter((d)=>!d.is_system);
    const customDefIds = customDefs.map((d)=>d.id);
    if (customDefIds.length === 0 || !mergeValues) return;
    const { data: fvRows } = await supabase.from("field_values").select("field_definition_id, value_text, value_number, value_boolean, value_date, value_json").eq("entity_type", entityType).eq("entity_id", entityId).in("field_definition_id", customDefIds);
    const rowByDefId = new Map((fvRows ?? []).map((r)=>[
            r.field_definition_id,
            r
        ]));
    for (const d of customDefs){
        const row = rowByDefId.get(d.id);
        const before = out[d.field_key];
        if (row) {
            const applied = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$typedFieldValues$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["displayFromFieldValueRow"])(d.field_type, row);
            const appliedEmpty = applied === "" || typeof applied === "string" && applied.trim() === "";
            if (!appliedEmpty) {
                out[d.field_key] = applied;
            } else if (!hasMeaningfulNativeFieldValue(before)) {
                out[d.field_key] = applied;
            }
        } else if (!hasMeaningfulNativeFieldValue(before) && !(d.field_key in out)) {
            out[d.field_key] = "";
        }
    }
}
}),
"[project]/lib/admin/jobDisplayPrice.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Canonical admin / payment math for job prices: **integer cents** only.
 *
 * **Canonical net total:** `display_total_cents` (and list `_price_display` = that / 100 in dollars).
 *
 * `jobs.discount_amount` is **intended to be cents** (admin resolver, fixed book-v2 writes).
 * Legacy rows may store **dollars** (e.g. `66.25` from book-v2) or **whole dollars** as integers (`66`);
 * `normalizeJobDiscountAmountToCents` normalizes for display and payment math.
 */ __turbopack_context__.s([
    "computeJobDisplayTotalCents",
    ()=>computeJobDisplayTotalCents,
    "computeJobGrossBasisCents",
    ()=>computeJobGrossBasisCents,
    "normalizeJobDiscountAmountToCents",
    ()=>normalizeJobDiscountAmountToCents
]);
function computeJobGrossBasisCents(row) {
    const g = row.gross_price_cents;
    const e = row.estimated_total_cents;
    if (g != null && Number.isFinite(Number(g))) return Math.max(0, Math.round(Number(g)));
    if (e != null && Number.isFinite(Number(e))) return Math.max(0, Math.round(Number(e)));
    return null;
}
function normalizeJobDiscountAmountToCents(discountRaw, grossCents) {
    const g = Math.max(0, Math.round(Number(grossCents) || 0));
    const raw = Number(discountRaw ?? 0);
    if (!Number.isFinite(raw) || raw <= 0 || g === 0) return 0;
    const frac = Math.abs(raw % 1);
    if (frac > 1e-9) {
        return Math.min(g, Math.max(0, Math.round(raw * 100)));
    }
    const n = Math.round(raw);
    if (n <= 0) return 0;
    if (n > g) return g;
    const maxWholeDollars = Math.floor(g / 100);
    if (n * 100 <= g && n <= maxWholeDollars) {
        return Math.min(g, n * 100);
    }
    if (n > maxWholeDollars && n * 100 > g && n <= 1000) {
        return Math.min(g, n * 100);
    }
    return Math.min(g, n);
}
function computeJobDisplayTotalCents(row) {
    const gross = computeJobGrossBasisCents(row);
    if (gross == null) return null;
    const flagged = row.discounted === true;
    const rawDisc = row.discount_amount != null ? Number(row.discount_amount) : 0;
    const hasDiscount = flagged || Number.isFinite(rawDisc) && rawDisc > 0;
    if (!hasDiscount) return gross;
    const d = normalizeJobDiscountAmountToCents(row.discount_amount, gross);
    return Math.max(0, gross - Math.min(d, gross));
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
"[project]/lib/admin/normalizeDocumentRow.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Maps public.documents rows to a stable shape for admin UI (legacy + canonical columns).
 * All `/api/admin/related/...` document arrays use this shape so drawers and Related tabs stay consistent.
 */ __turbopack_context__.s([
    "normalizeDocumentRow",
    ()=>normalizeDocumentRow,
    "normalizeDocumentRows",
    ()=>normalizeDocumentRows
]);
function normalizeDocumentRow(row) {
    const title = row.title ?? row.name;
    const orig = row.original_filename;
    const docType = row.doc_type ?? row.document_type;
    const created = row.created_at;
    const legacyUploaded = row.uploaded_at;
    const createdStr = created != null && created !== "" ? String(created) : null;
    const uploadedStr = legacyUploaded != null && legacyUploaded !== "" ? String(legacyUploaded) : createdStr;
    const titleStr = title != null && String(title).trim() !== "" ? String(title) : null;
    const origStr = orig != null && String(orig).trim() !== "" ? String(orig) : null;
    return {
        id: String(row.id),
        name: titleStr ?? origStr,
        original_filename: origStr,
        document_type: docType != null && String(docType) !== "" ? String(docType) : null,
        status: row.status != null && String(row.status) !== "" ? String(row.status) : null,
        uploaded_at: uploadedStr,
        created_at: createdStr
    };
}
function normalizeDocumentRows(rows) {
    if (!rows?.length) return [];
    return rows.filter((r)=>r != null && typeof r === "object" && "id" in r).map((r)=>normalizeDocumentRow(r));
}
}),
"[project]/lib/admin/overviewRelationshipLabels.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/** UUID v4 pattern — used to avoid showing raw ids in overview when a label exists on the record. */ __turbopack_context__.s([
    "isUuidLike",
    ()=>isUuidLike,
    "resolveOverviewRelationshipLabel",
    ()=>resolveOverviewRelationshipLabel
]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuidLike(value) {
    return typeof value === "string" && UUID_RE.test(value.trim());
}
function resolveOverviewRelationshipLabel(record, fieldKey, opts) {
    const tryKeys = [
        fieldKey,
        opts?.linkIdField
    ].filter((k)=>typeof k === "string" && k.length > 0);
    const seen = new Set();
    for (const k of tryKeys){
        if (seen.has(k)) continue;
        seen.add(k);
        const label = labelForRelationshipKey(record, k);
        if (label) return label;
    }
    return null;
}
function nonEmpty(s) {
    if (s == null) return null;
    const t = String(s).trim();
    return t.length > 0 ? t : null;
}
/** Prefer Batch-2 `_relationship_displays` keyed by FK column (e.g. `customer_id`). */ function labelFromRelationshipDisplays(record, fkColumn) {
    const raw = record._relationship_displays;
    if (!raw || typeof raw !== "object") return null;
    const entry = raw[fkColumn];
    if (!entry || typeof entry !== "object") return null;
    const label = nonEmpty(entry.label);
    if (label) return label;
    const rn = entry.record_number;
    if (rn != null && rn !== "") {
        const n = typeof rn === "number" ? rn : Number(rn);
        if (Number.isFinite(n)) return `#${n}`;
    }
    return null;
}
function labelForRelationshipKey(record, k) {
    const fromApi = labelFromRelationshipDisplays(record, k);
    if (fromApi) return fromApi;
    switch(k){
        case "job_id":
            return nonEmpty(record._job_title ?? record._job_label);
        case "location_id":
            return nonEmpty(record._location_label ?? record._location_name);
        case "customer_id":
            return nonEmpty(record._customer_name);
        case "_customer_name":
            return nonEmpty(record._customer_name);
        case "_location_name":
            return nonEmpty(record._location_name ?? record._location_label);
        case "_opportunity_name":
            return nonEmpty(record._opportunity_name);
        case "_primary_person_name":
            return nonEmpty(record._primary_person_name);
        case "primary_contact_id":
            return nonEmpty(record._primary_contact_name ?? record._contact_name);
        case "contact_id":
            return nonEmpty(record._primary_contact_name ?? record._contact_name);
        case "primary_person_id":
            return nonEmpty(record._primary_person_name);
        case "person_id":
            return nonEmpty(record._person_name ?? record._primary_person_name);
        case "opportunity_id":
            return nonEmpty(record._opportunity_name);
        case "assigned_vendor_id":
            return nonEmpty(record._assigned_vendor_name ?? record._vendor_name);
        case "vendor_id":
            return nonEmpty(record._linked_vendor_name ?? record._vendor_name ?? record._assigned_vendor_name);
        case "customer_subscription_id":
            return nonEmpty(record._customer_subscription_label);
        case "vertical_id":
            return nonEmpty(record._vertical_name);
        case "pipeline_stage_id":
            return nonEmpty(record._pipeline_stage_name ?? record._stage_name);
        case "pipeline_id":
            return nonEmpty(record._pipeline_name);
        case "discount_program_id":
            return nonEmpty(record._discount_program_label);
        case "discount_code_id":
            return nonEmpty(record.discount_code ?? record._discount_label);
        default:
            return null;
    }
}
}),
"[project]/lib/admin/jobPaymentBalances.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Authoritative payment/balance reads for jobs.
 *
 * When the job has at least one **non-void** receivable in `charges`, totals use charge amounts +
 * `payment_allocations.charge_id` (plus legacy job-target rows with `charge_id` null). Otherwise
 * reads fall back to job_line_items / `jobs.total_cents` and job-targeted allocations only.
 */ __turbopack_context__.s([
    "batchAllocatedCentsForJob",
    ()=>batchAllocatedCentsForJob,
    "batchPaymentAllocationRollups",
    ()=>batchPaymentAllocationRollups,
    "computeJobBalanceSnapshot",
    ()=>computeJobBalanceSnapshot,
    "fetchNonVoidChargesForJob",
    ()=>fetchNonVoidChargesForJob,
    "getAllChargeIdsForJob",
    ()=>getAllChargeIdsForJob,
    "getAllocatedAmountCentsForJob",
    ()=>getAllocatedAmountCentsForJob,
    "getJobPricingTotalCents",
    ()=>getJobPricingTotalCents,
    "getNonVoidChargeIdsForJob",
    ()=>getNonVoidChargeIdsForJob,
    "getPaymentAllocationRollup",
    ()=>getPaymentAllocationRollup,
    "getPaymentIdsForJob",
    ()=>getPaymentIdsForJob,
    "getPendingAllocatedCentsForJob",
    ()=>getPendingAllocatedCentsForJob,
    "getPostedAllocatedCentsForJob",
    ()=>getPostedAllocatedCentsForJob
]);
function toIntCents(v) {
    const n = typeof v === "bigint" ? Number(v) : Number(v);
    if (!Number.isFinite(n)) return 0;
    return Math.round(n);
}
async function fetchNonVoidChargesForJob(supabase, orgId, jobId) {
    const { data, error } = await supabase.from("charges").select("id, amount_cents, status, charge_type, schedule_id, service_date, due_date, description").eq("org_id", orgId).eq("job_id", jobId).neq("status", "void");
    if (error) {
        console.warn("[fetchNonVoidChargesForJob]:", error.message);
        return [];
    }
    return data ?? [];
}
async function getNonVoidChargeIdsForJob(supabase, orgId, jobId) {
    const rows = await fetchNonVoidChargesForJob(supabase, orgId, jobId);
    return rows.map((r)=>r.id).filter(Boolean);
}
async function getAllChargeIdsForJob(supabase, orgId, jobId) {
    const { data, error } = await supabase.from("charges").select("id").eq("org_id", orgId).eq("job_id", jobId);
    if (error) {
        console.warn("[getAllChargeIdsForJob]:", error.message);
        return [];
    }
    return (data ?? []).map((r)=>r.id).filter(Boolean);
}
function jobUsesChargeReceivableModel(nonVoidCharges) {
    return nonVoidCharges.length > 0;
}
function sumNonVoidChargeAmountCents(charges) {
    let sum = 0;
    for (const c of charges){
        sum += toIntCents(c.amount_cents);
    }
    return sum;
}
/**
 * Allocations that apply to this job's receivable reads when in charge mode:
 * - rows with `charge_id` on one of the job's non-void charges, or
 * - legacy rows with `charge_id` null and job target (avoids double-counting rows that have both).
 */ async function fetchActiveReceivableAllocRows(supabase, orgId, jobId, nonVoidChargeIds) {
    const legacyJob = await supabase.from("payment_allocations").select("payment_id, allocated_amount_cents, charge_id").eq("org_id", orgId).eq("status", "active").eq("target_entity_type", "job").eq("target_entity_id", jobId).is("charge_id", null);
    if (legacyJob.error) {
        console.warn("[fetchActiveReceivableAllocRows] legacy job:", legacyJob.error.message);
    }
    let chargeLinkedData = [];
    if (nonVoidChargeIds.length > 0) {
        const chargeLinked = await supabase.from("payment_allocations").select("payment_id, allocated_amount_cents, charge_id").eq("org_id", orgId).eq("status", "active").in("charge_id", nonVoidChargeIds);
        if (chargeLinked.error) {
            console.warn("[fetchActiveReceivableAllocRows] charge:", chargeLinked.error.message);
        } else {
            chargeLinkedData = chargeLinked.data ?? [];
        }
    }
    const a = legacyJob.data ?? [];
    return [
        ...a,
        ...chargeLinkedData
    ];
}
async function sumAllocatedCentsForJobByParentPaymentStatus(supabase, orgId, jobId, nonVoidChargeIds, paymentStatus) {
    const rows = await fetchActiveReceivableAllocRows(supabase, orgId, jobId, nonVoidChargeIds);
    if (rows.length === 0) return 0;
    const paymentIds = [
        ...new Set(rows.map((r)=>r.payment_id))
    ];
    const { data: statusRows, error: pErr } = await supabase.from("payments").select("id").eq("org_id", orgId).in("id", paymentIds).eq("status", paymentStatus);
    if (pErr) {
        console.warn("[sumAllocatedCentsForJobByParentPaymentStatus] payments:", pErr.message);
        return 0;
    }
    const allowed = new Set((statusRows ?? []).map((r)=>r.id));
    let sum = 0;
    for (const r of rows){
        if (!allowed.has(r.payment_id)) continue;
        sum += toIntCents(r.allocated_amount_cents);
    }
    return sum;
}
async function sumPostedAllocatedByChargeId(supabase, orgId, chargeIds) {
    const out = new Map();
    for (const id of chargeIds)out.set(id, 0);
    if (chargeIds.length === 0) return out;
    const { data: rows, error } = await supabase.from("payment_allocations").select("payment_id, allocated_amount_cents, charge_id").eq("org_id", orgId).eq("status", "active").in("charge_id", chargeIds);
    if (error) {
        console.warn("[sumPostedAllocatedByChargeId]:", error.message);
        return out;
    }
    const list = rows ?? [];
    if (list.length === 0) return out;
    const paymentIds = [
        ...new Set(list.map((r)=>r.payment_id))
    ];
    const { data: posted, error: pErr } = await supabase.from("payments").select("id").eq("org_id", orgId).in("id", paymentIds).eq("status", "posted");
    if (pErr) {
        console.warn("[sumPostedAllocatedByChargeId] payments:", pErr.message);
        return out;
    }
    const postedSet = new Set((posted ?? []).map((r)=>r.id));
    for (const r of list){
        if (!postedSet.has(r.payment_id)) continue;
        const cid = r.charge_id;
        if (!cid) continue;
        const add = toIntCents(r.allocated_amount_cents);
        out.set(cid, (out.get(cid) ?? 0) + add);
    }
    return out;
}
function truncateDesc(s, max) {
    const t = s.trim();
    if (t.length <= max) return t;
    return `${t.slice(0, Math.max(0, max - 1))}…`;
}
function normalizeDateOnly(v) {
    if (v == null) return null;
    const s = String(v).trim();
    if (!s) return null;
    return s.length >= 10 ? s.slice(0, 10) : s;
}
function buildChargeBalanceRows(nonVoidCharges, postedByCharge) {
    const rows = [];
    let open = 0;
    for (const c of nonVoidCharges){
        const amount = toIntCents(c.amount_cents);
        const postedAlloc = postedByCharge.get(c.id) ?? 0;
        const outstanding = amount - postedAlloc;
        const st = String(c.status ?? "").toLowerCase();
        const rawDesc = c.description != null && String(c.description).trim() ? String(c.description).trim() : null;
        const sid = c.schedule_id != null && String(c.schedule_id).trim() ? String(c.schedule_id).trim() : null;
        rows.push({
            charge_id: c.id,
            charge_type: String(c.charge_type ?? "service").toLowerCase(),
            amount_cents: amount,
            status: st,
            posted_allocated_cents: postedAlloc,
            outstanding_cents: outstanding,
            schedule_id: sid,
            service_date: normalizeDateOnly(c.service_date),
            due_date: normalizeDateOnly(c.due_date),
            description: rawDesc ? truncateDesc(rawDesc, 120) : null
        });
        if (outstanding !== 0) open += 1;
    }
    return {
        rows,
        open_charge_count: open
    };
}
async function getJobPricingTotalCents(supabase, orgId, jobId) {
    const { data: lines, error: lineErr } = await supabase.from("job_line_items").select("amount_cents").eq("org_id", orgId).eq("job_id", jobId).eq("is_active", true);
    if (lineErr) {
        console.warn("[getJobPricingTotalCents] job_line_items:", lineErr.message);
    }
    const active = lines ?? [];
    if (active.length > 0) {
        let sum = 0;
        for (const row of active){
            sum += toIntCents(row.amount_cents);
        }
        return sum;
    }
    const { data: job, error: jobErr } = await supabase.from("jobs").select("total_cents").eq("id", jobId).eq("org_id", orgId).maybeSingle();
    if (jobErr) {
        console.warn("[getJobPricingTotalCents] jobs:", jobErr.message);
        return null;
    }
    const t = job?.total_cents;
    if (t == null) return null;
    return toIntCents(t);
}
async function getPaymentIdsForJob(supabase, orgId, jobId) {
    const chargeIds = await getAllChargeIdsForJob(supabase, orgId, jobId);
    const [allocRes, chargeAllocRes, legacyRes] = await Promise.all([
        supabase.from("payment_allocations").select("payment_id").eq("org_id", orgId).eq("target_entity_type", "job").eq("target_entity_id", jobId),
        chargeIds.length > 0 ? supabase.from("payment_allocations").select("payment_id").eq("org_id", orgId).in("charge_id", chargeIds) : Promise.resolve({
            data: [],
            error: null
        }),
        supabase.from("payments").select("id").eq("org_id", orgId).eq("job_id", jobId)
    ]);
    const ids = new Set();
    for (const r of allocRes.data ?? []){
        const pid = r.payment_id;
        if (pid) ids.add(pid);
    }
    if (!chargeAllocRes.error) {
        for (const r of chargeAllocRes.data ?? []){
            const pid = r.payment_id;
            if (pid) ids.add(pid);
        }
    } else {
        console.warn("[getPaymentIdsForJob] charge allocations:", chargeAllocRes.error.message);
    }
    for (const r of legacyRes.data ?? []){
        const id = r.id;
        if (id) ids.add(id);
    }
    return [
        ...ids
    ];
}
async function getPostedAllocatedCentsForJob(supabase, orgId, jobId) {
    const nonVoidCharges = await fetchNonVoidChargesForJob(supabase, orgId, jobId);
    const nonVoidIds = nonVoidCharges.map((c)=>c.id);
    if (jobUsesChargeReceivableModel(nonVoidCharges)) {
        return sumAllocatedCentsForJobByParentPaymentStatus(supabase, orgId, jobId, nonVoidIds, "posted");
    }
    const { data: allocs, error } = await supabase.from("payment_allocations").select("payment_id, allocated_amount_cents").eq("org_id", orgId).eq("status", "active").eq("target_entity_type", "job").eq("target_entity_id", jobId);
    if (error) {
        console.warn("[getPostedAllocatedCentsForJob]:", error.message);
        return 0;
    }
    const rows = allocs ?? [];
    if (rows.length === 0) return 0;
    const paymentIds = [
        ...new Set(rows.map((r)=>r.payment_id))
    ];
    const { data: posted, error: pErr } = await supabase.from("payments").select("id").eq("org_id", orgId).in("id", paymentIds).eq("status", "posted");
    if (pErr) {
        console.warn("[getPostedAllocatedCentsForJob] payments:", pErr.message);
        return 0;
    }
    const postedSet = new Set((posted ?? []).map((r)=>r.id));
    let sum = 0;
    for (const r of rows){
        const pid = r.payment_id;
        if (!postedSet.has(pid)) continue;
        sum += toIntCents(r.allocated_amount_cents);
    }
    return sum;
}
async function getPendingAllocatedCentsForJob(supabase, orgId, jobId) {
    const nonVoidCharges = await fetchNonVoidChargesForJob(supabase, orgId, jobId);
    const nonVoidIds = nonVoidCharges.map((c)=>c.id);
    if (jobUsesChargeReceivableModel(nonVoidCharges)) {
        return sumAllocatedCentsForJobByParentPaymentStatus(supabase, orgId, jobId, nonVoidIds, "pending");
    }
    const { data: allocs, error } = await supabase.from("payment_allocations").select("payment_id, allocated_amount_cents").eq("org_id", orgId).eq("status", "active").eq("target_entity_type", "job").eq("target_entity_id", jobId);
    if (error) {
        console.warn("[getPendingAllocatedCentsForJob]:", error.message);
        return 0;
    }
    const rows = allocs ?? [];
    if (rows.length === 0) return 0;
    const paymentIds = [
        ...new Set(rows.map((r)=>r.payment_id))
    ];
    const { data: pending, error: pErr } = await supabase.from("payments").select("id").eq("org_id", orgId).in("id", paymentIds).eq("status", "pending");
    if (pErr) {
        console.warn("[getPendingAllocatedCentsForJob] payments:", pErr.message);
        return 0;
    }
    const pendingSet = new Set((pending ?? []).map((r)=>r.id));
    let sum = 0;
    for (const r of rows){
        const pid = r.payment_id;
        if (!pendingSet.has(pid)) continue;
        sum += toIntCents(r.allocated_amount_cents);
    }
    return sum;
}
async function computeJobBalanceSnapshot(supabase, orgId, jobId) {
    const nonVoidCharges = await fetchNonVoidChargesForJob(supabase, orgId, jobId);
    const nonVoidIds = nonVoidCharges.map((c)=>c.id);
    if (jobUsesChargeReceivableModel(nonVoidCharges)) {
        const job_total_cents = sumNonVoidChargeAmountCents(nonVoidCharges);
        const [paid_amount_cents, pending_payment_amount_cents, postedByCharge] = await Promise.all([
            sumAllocatedCentsForJobByParentPaymentStatus(supabase, orgId, jobId, nonVoidIds, "posted"),
            sumAllocatedCentsForJobByParentPaymentStatus(supabase, orgId, jobId, nonVoidIds, "pending"),
            sumPostedAllocatedByChargeId(supabase, orgId, nonVoidIds)
        ]);
        const outstanding_balance_cents = job_total_cents != null && Number.isFinite(job_total_cents) ? Math.max(0, Math.round(job_total_cents) - paid_amount_cents) : null;
        const { rows: charge_balance_rows, open_charge_count } = buildChargeBalanceRows(nonVoidCharges, postedByCharge);
        return {
            job_total_cents,
            paid_amount_cents,
            outstanding_balance_cents,
            pending_payment_amount_cents,
            receivable_source: "charges",
            open_charge_count,
            charge_balance_rows
        };
    }
    const [job_total_cents, paid_amount_cents, pending_payment_amount_cents] = await Promise.all([
        getJobPricingTotalCents(supabase, orgId, jobId),
        getPostedAllocatedCentsForJob(supabase, orgId, jobId),
        getPendingAllocatedCentsForJob(supabase, orgId, jobId)
    ]);
    const outstanding_balance_cents = job_total_cents != null && Number.isFinite(job_total_cents) ? Math.max(0, Math.round(job_total_cents) - paid_amount_cents) : null;
    return {
        job_total_cents,
        paid_amount_cents,
        outstanding_balance_cents,
        pending_payment_amount_cents,
        receivable_source: "legacy_job"
    };
}
function allocationStateFromAmounts(paymentAmount, allocatedActive) {
    if (allocatedActive <= 0) return "unallocated";
    if (allocatedActive >= paymentAmount) return "fully_allocated";
    return "partially_allocated";
}
async function getPaymentAllocationRollup(supabase, orgId, paymentId, paymentAmountCents) {
    const { data: allocs, error } = await supabase.from("payment_allocations").select("allocated_amount_cents").eq("org_id", orgId).eq("payment_id", paymentId).eq("status", "active");
    if (error) {
        console.warn("[getPaymentAllocationRollup]:", error.message);
        return {
            allocated_amount_cents: 0,
            unallocated_amount_cents: Math.max(0, paymentAmountCents),
            allocation_state: "unallocated"
        };
    }
    let allocated = 0;
    for (const r of allocs ?? []){
        allocated += toIntCents(r.allocated_amount_cents);
    }
    const amount = Math.max(0, toIntCents(paymentAmountCents));
    const clampedAlloc = Math.min(allocated, amount);
    const unallocated = Math.max(0, amount - clampedAlloc);
    return {
        allocated_amount_cents: clampedAlloc,
        unallocated_amount_cents: unallocated,
        allocation_state: allocationStateFromAmounts(amount, clampedAlloc)
    };
}
async function getAllocatedAmountCentsForJob(supabase, orgId, paymentId, jobId) {
    const nonVoidIds = await getNonVoidChargeIdsForJob(supabase, orgId, jobId);
    if (nonVoidIds.length > 0) {
        const [legacyJob, chargeLinked] = await Promise.all([
            supabase.from("payment_allocations").select("allocated_amount_cents").eq("org_id", orgId).eq("payment_id", paymentId).eq("status", "active").eq("target_entity_type", "job").eq("target_entity_id", jobId).is("charge_id", null),
            supabase.from("payment_allocations").select("allocated_amount_cents").eq("org_id", orgId).eq("payment_id", paymentId).eq("status", "active").in("charge_id", nonVoidIds)
        ]);
        if (legacyJob.error) console.warn("[getAllocatedAmountCentsForJob] legacy:", legacyJob.error.message);
        if (chargeLinked.error) console.warn("[getAllocatedAmountCentsForJob] charge:", chargeLinked.error.message);
        let sum = 0;
        for (const r of legacyJob.data ?? []){
            sum += toIntCents(r.allocated_amount_cents);
        }
        for (const r of chargeLinked.data ?? []){
            sum += toIntCents(r.allocated_amount_cents);
        }
        return sum;
    }
    const { data: rows, error } = await supabase.from("payment_allocations").select("allocated_amount_cents").eq("org_id", orgId).eq("payment_id", paymentId).eq("status", "active").eq("target_entity_type", "job").eq("target_entity_id", jobId);
    if (error) {
        console.warn("[getAllocatedAmountCentsForJob]:", error.message);
        return 0;
    }
    let sum = 0;
    for (const r of rows ?? []){
        sum += toIntCents(r.allocated_amount_cents);
    }
    return sum;
}
async function batchPaymentAllocationRollups(supabase, orgId, paymentIds, paymentAmountById) {
    const out = new Map();
    if (paymentIds.length === 0) return out;
    const { data: allocs, error } = await supabase.from("payment_allocations").select("payment_id, allocated_amount_cents").eq("org_id", orgId).eq("status", "active").in("payment_id", paymentIds);
    if (error) {
        console.warn("[batchPaymentAllocationRollups]:", error.message);
        for (const id of paymentIds){
            const amt = paymentAmountById.get(id) ?? 0;
            out.set(id, {
                allocated_amount_cents: 0,
                unallocated_amount_cents: Math.max(0, amt),
                allocation_state: "unallocated"
            });
        }
        return out;
    }
    const sumByPayment = new Map();
    for (const r of allocs ?? []){
        const pid = r.payment_id;
        const add = toIntCents(r.allocated_amount_cents);
        sumByPayment.set(pid, (sumByPayment.get(pid) ?? 0) + add);
    }
    for (const id of paymentIds){
        const amount = Math.max(0, toIntCents(paymentAmountById.get(id) ?? 0));
        const allocatedRaw = sumByPayment.get(id) ?? 0;
        const clampedAlloc = Math.min(allocatedRaw, amount);
        const unallocated = Math.max(0, amount - clampedAlloc);
        out.set(id, {
            allocated_amount_cents: clampedAlloc,
            unallocated_amount_cents: unallocated,
            allocation_state: allocationStateFromAmounts(amount, clampedAlloc)
        });
    }
    return out;
}
async function batchAllocatedCentsForJob(supabase, orgId, jobId, paymentIds) {
    const out = new Map();
    for (const id of paymentIds)out.set(id, 0);
    if (paymentIds.length === 0) return out;
    const nonVoidIds = await getNonVoidChargeIdsForJob(supabase, orgId, jobId);
    if (nonVoidIds.length > 0) {
        const [legacyJob, chargeLinked] = await Promise.all([
            supabase.from("payment_allocations").select("payment_id, allocated_amount_cents").eq("org_id", orgId).eq("status", "active").eq("target_entity_type", "job").eq("target_entity_id", jobId).is("charge_id", null).in("payment_id", paymentIds),
            supabase.from("payment_allocations").select("payment_id, allocated_amount_cents").eq("org_id", orgId).eq("status", "active").in("charge_id", nonVoidIds).in("payment_id", paymentIds)
        ]);
        if (legacyJob.error) console.warn("[batchAllocatedCentsForJob] legacy:", legacyJob.error.message);
        if (chargeLinked.error) console.warn("[batchAllocatedCentsForJob] charge:", chargeLinked.error.message);
        for (const r of legacyJob.data ?? []){
            const pid = r.payment_id;
            const add = toIntCents(r.allocated_amount_cents);
            out.set(pid, (out.get(pid) ?? 0) + add);
        }
        for (const r of chargeLinked.data ?? []){
            const pid = r.payment_id;
            const add = toIntCents(r.allocated_amount_cents);
            out.set(pid, (out.get(pid) ?? 0) + add);
        }
        return out;
    }
    const { data: rows, error } = await supabase.from("payment_allocations").select("payment_id, allocated_amount_cents").eq("org_id", orgId).eq("status", "active").eq("target_entity_type", "job").eq("target_entity_id", jobId).in("payment_id", paymentIds);
    if (error) {
        console.warn("[batchAllocatedCentsForJob]:", error.message);
        return out;
    }
    for (const r of rows ?? []){
        const pid = r.payment_id;
        const add = toIntCents(r.allocated_amount_cents);
        out.set(pid, (out.get(pid) ?? 0) + add);
    }
    return out;
}
}),
"[project]/lib/fields/resolveOptionSetOptions.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "optionSetKeyFromFieldConfig",
    ()=>optionSetKeyFromFieldConfig,
    "resolveOptionSetOptions",
    ()=>resolveOptionSetOptions,
    "resolveOptionSetOptionsWithMetadata",
    ()=>resolveOptionSetOptionsWithMetadata,
    "resolveOptionSetsForOrg",
    ()=>resolveOptionSetsForOrg
]);
async function resolveOptionSetOptions(supabase, orgId, setKey) {
    const sk = setKey.trim();
    if (!sk) return [];
    const { data: setRow, error: setErr } = await supabase.from("option_sets").select("id").eq("org_id", orgId).eq("set_key", sk).maybeSingle();
    if (setErr || !setRow?.id) {
        if (setErr) console.warn("[resolveOptionSetOptions] option_sets", setErr.message);
        return [];
    }
    const { data: items, error: itemErr } = await supabase.from("option_set_items").select("item_key, label").eq("option_set_id", setRow.id).order("sort_order", {
        ascending: true
    });
    if (itemErr) {
        console.warn("[resolveOptionSetOptions] option_set_items", itemErr.message);
        return [];
    }
    return (items ?? []).map((r)=>({
            value: String(r.item_key).trim(),
            label: r.label && String(r.label).trim() || String(r.item_key).trim()
        }));
}
async function resolveOptionSetOptionsWithMetadata(supabase, orgId, setKey) {
    const sk = setKey.trim();
    if (!sk) return [];
    const { data: setRow, error: setErr } = await supabase.from("option_sets").select("id").eq("org_id", orgId).eq("set_key", sk).maybeSingle();
    if (setErr || !setRow?.id) {
        if (setErr) console.warn("[resolveOptionSetOptionsWithMetadata] option_sets", setErr.message);
        return [];
    }
    const { data: items, error: itemErr } = await supabase.from("option_set_items").select("item_key, label, metadata").eq("option_set_id", setRow.id).order("sort_order", {
        ascending: true
    });
    if (itemErr) {
        console.warn("[resolveOptionSetOptionsWithMetadata] option_set_items", itemErr.message);
        return [];
    }
    return (items ?? []).map((r)=>({
            value: String(r.item_key).trim(),
            label: r.label && String(r.label).trim() || String(r.item_key).trim(),
            metadata: r.metadata && typeof r.metadata === "object" && !Array.isArray(r.metadata) ? r.metadata : undefined
        }));
}
async function resolveOptionSetsForOrg(supabase, orgId, setKeys) {
    const keys = [
        ...new Set(setKeys.map((k)=>k.trim()).filter(Boolean))
    ];
    const out = {};
    if (keys.length === 0) return out;
    const { data: sets, error: sErr } = await supabase.from("option_sets").select("id, set_key").eq("org_id", orgId).in("set_key", keys);
    if (sErr || !sets?.length) return out;
    const idByKey = new Map(sets.map((r)=>[
            r.set_key,
            r.id
        ]));
    const setIds = [
        ...idByKey.values()
    ];
    const { data: items, error: iErr } = await supabase.from("option_set_items").select("option_set_id, item_key, label, sort_order").in("option_set_id", setIds).order("sort_order", {
        ascending: true
    });
    if (iErr || !items) return out;
    const keyBySetId = new Map([
        ...idByKey.entries()
    ].map(([k, v])=>[
            v,
            k
        ]));
    for (const row of items){
        const sk = keyBySetId.get(row.option_set_id);
        if (!sk) continue;
        if (!out[sk]) out[sk] = [];
        out[sk].push({
            value: String(row.item_key).trim(),
            label: row.label && String(row.label).trim() || String(row.item_key).trim()
        });
    }
    return out;
}
function optionSetKeyFromFieldConfig(config) {
    if (!config || typeof config !== "object" || Array.isArray(config)) return null;
    const k = config.option_set_key;
    return typeof k === "string" && k.trim() ? k.trim() : null;
}
}),
"[project]/lib/book-v2/loadCleaningPricingCatalog.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "CANONICAL_SQFT_TIER_OPTIONS",
    ()=>CANONICAL_SQFT_TIER_OPTIONS,
    "FALLBACK_SQFT_TIERS",
    ()=>FALLBACK_SQFT_TIERS,
    "loadActiveHomeTypes",
    ()=>loadActiveHomeTypes,
    "loadCleaningAddonsFromDb",
    ()=>loadCleaningAddonsFromDb,
    "loadPricingFrequenciesForVertical",
    ()=>loadPricingFrequenciesForVertical,
    "loadSqftTiersForVertical",
    ()=>loadSqftTiersForVertical,
    "normalizeAddonKeysAgainstMap",
    ()=>normalizeAddonKeysAgainstMap,
    "normalizeSqftKeyInput",
    ()=>normalizeSqftKeyInput,
    "resolveCleaningVerticalId",
    ()=>resolveCleaningVerticalId,
    "resolveSqftTierDisplayLabels",
    ()=>resolveSqftTierDisplayLabels,
    "resolveSquareFootageStorageString",
    ()=>resolveSquareFootageStorageString
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$fields$2f$resolveOptionSetOptions$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/fields/resolveOptionSetOptions.ts [app-route] (ecmascript)");
;
const CANONICAL_SQFT_TIER_OPTIONS = [
    {
        value: "0_1499",
        label: "Under 1,500 sq ft"
    },
    {
        value: "1500_1999",
        label: "1,500 – 1,999 sq ft"
    },
    {
        value: "2000_2599",
        label: "2,000 – 2,599 sq ft"
    },
    {
        value: "2600_3199",
        label: "2,600 – 3,199 sq ft"
    },
    {
        value: "3200_3999",
        label: "3,200 – 3,999 sq ft"
    },
    {
        value: "4000_5499",
        label: "4,000 – 5,499 sq ft"
    },
    {
        value: "5500_plus",
        label: "5,500+ sq ft"
    }
];
const FALLBACK_SQFT_TIERS = CANONICAL_SQFT_TIER_OPTIONS.map((o, i)=>({
        sqft_key: o.value,
        sqft_label: o.label,
        sort_order: i
    }));
const LEGACY_LABEL_OR_KEY_TO_TIER = (()=>{
    const m = {};
    for (const o of CANONICAL_SQFT_TIER_OPTIONS){
        m[o.value.toLowerCase()] = o.value;
        m[o.label.toLowerCase().replace(/\s+/g, " ")] = o.value;
    }
    const legacy = [
        [
            "Under 1500 sq ft",
            "0_1499"
        ],
        [
            "under 1500 sq ft",
            "0_1499"
        ],
        [
            "1501–2,000 sq ft",
            "1500_1999"
        ],
        [
            "1501-2,000 sq ft",
            "1500_1999"
        ],
        [
            "2,001-2,600 sq ft",
            "2000_2599"
        ],
        [
            "2,601-3,200 sq ft",
            "2600_3199"
        ],
        [
            "3,201-4,000 sq ft",
            "3200_3999"
        ],
        [
            "4,001-5,500 sq ft",
            "4000_5499"
        ],
        [
            "Over 5,500 sq ft",
            "5500_plus"
        ]
    ];
    for (const [k, v] of legacy){
        m[k.toLowerCase()] = v;
    }
    return m;
})();
function legacyNumericSqftToTierKey(sqft) {
    if (sqft <= 1499) return "0_1499";
    if (sqft <= 1999) return "1500_1999";
    if (sqft <= 2599) return "2000_2599";
    if (sqft <= 3199) return "2600_3199";
    if (sqft <= 3999) return "3200_3999";
    if (sqft <= 5499) return "4000_5499";
    return "5500_plus";
}
async function resolveCleaningVerticalId(supabase, verticalSlug = "cleaning") {
    const { data } = await supabase.from("verticals").select("id").eq("slug", verticalSlug).eq("is_active", true).limit(1).maybeSingle();
    return data?.id ?? null;
}
async function loadSqftTiersForVertical(supabase, verticalId) {
    const { data, error } = await supabase.from("pricing_square_footage_tiers").select("tier_key, sort_order, dimension_value_id").eq("vertical_id", verticalId).eq("is_active", true).order("sort_order", {
        ascending: true
    });
    if (error) {
        console.error("[BOOKING_CATALOG] pricing_square_footage_tiers", error.message);
        return [];
    }
    return (data ?? []).map((r)=>({
            tier_key: String(r.tier_key).trim(),
            sort_order: typeof r.sort_order === "number" ? r.sort_order : 0,
            dimension_value_id: r.dimension_value_id != null && String(r.dimension_value_id).trim() ? String(r.dimension_value_id).trim() : null
        }));
}
async function resolveSqftTierDisplayLabels(supabase, orgId, rows) {
    const optionLabelByTierKey = new Map();
    if (orgId?.trim()) {
        const opts = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$fields$2f$resolveOptionSetOptions$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["resolveOptionSetOptions"])(supabase, orgId.trim(), "square_footage_tier");
        for (const o of opts){
            const k = o.value.trim();
            if (!k) continue;
            const lab = o.label && String(o.label).trim() || k;
            optionLabelByTierKey.set(k, lab);
        }
    }
    const dimIds = [
        ...new Set(rows.map((r)=>r.dimension_value_id).filter((id)=>id != null && id !== ""))
    ];
    const dimLabelById = new Map();
    if (dimIds.length > 0) {
        const { data: dimRows, error: dimErr } = await supabase.from("pricing_dimension_values").select("id, value_label").in("id", dimIds);
        if (dimErr) {
            console.warn("[BOOKING_CATALOG] pricing_dimension_values", dimErr.message);
        } else {
            for (const d of dimRows ?? []){
                const id = String(d.id).trim();
                if (!id) continue;
                const lab = d.value_label != null && String(d.value_label).trim() || id;
                dimLabelById.set(id, lab);
            }
        }
    }
    return rows.map((r)=>{
        const tier_key = r.tier_key.trim();
        const fromOption = optionLabelByTierKey.get(tier_key);
        const fromDim = r.dimension_value_id ? dimLabelById.get(r.dimension_value_id) : undefined;
        const tier_label = (fromOption != null && String(fromOption).trim() !== "" ? String(fromOption).trim() : null) ?? (fromDim != null && String(fromDim).trim() !== "" ? String(fromDim).trim() : null);
        return {
            tier_key,
            sort_order: r.sort_order,
            tier_label
        };
    });
}
function normalizeSqftKeyInput(val, tiers) {
    const tierList = tiers.length ? tiers : CANONICAL_SQFT_TIER_OPTIONS.map((o, i)=>({
            tier_key: o.value,
            sort_order: i
        }));
    const keys = new Set(tierList.map((t)=>t.tier_key.trim()));
    if (val == null) return tierList[0].tier_key;
    const s = typeof val === "string" ? val.trim() : String(val);
    if (keys.has(s)) return s;
    const mapped = LEGACY_LABEL_OR_KEY_TO_TIER[s.toLowerCase().replace(/\u2013/g, "-")];
    if (mapped && keys.has(mapped)) return mapped;
    const loose = LEGACY_LABEL_OR_KEY_TO_TIER[s.toLowerCase().replace(/\s+/g, " ")];
    if (loose && keys.has(loose)) return loose;
    const num = typeof val === "number" ? val : parseInt(s.replace(/,/g, ""), 10);
    if (!Number.isNaN(num) && num > 0) {
        const byNum = legacyNumericSqftToTierKey(num);
        if (keys.has(byNum)) return byNum;
    }
    return tierList[0].tier_key;
}
function resolveSquareFootageStorageString(_raw, normalizedTierKey, _tiers) {
    return normalizedTierKey;
}
async function loadCleaningAddonsFromDb(supabase, verticalId) {
    const addonPriceMap = {};
    const available_addons = [];
    const { data: typeRows, error: typesError } = await supabase.from("addon_types").select("key, label, position").eq("vertical_id", verticalId).eq("is_active", true).order("position", {
        ascending: true
    });
    if (typesError) {
        console.error("[BOOKING_CATALOG] addon_types", typesError.message);
        throw new Error(`addon_types query failed: ${typesError.message}`);
    }
    const types = typeRows ?? [];
    const { data: priceRows, error: pricesError } = await supabase.from("pricing_addons").select("addon_key, addon_name, amount_cents, sort_order").eq("vertical_id", verticalId).eq("is_active", true);
    if (pricesError) {
        console.error("[BOOKING_CATALOG] pricing_addons", pricesError.message);
        throw new Error(`pricing_addons query failed: ${pricesError.message}`);
    }
    const priceList = priceRows ?? [];
    const priceByKey = new Map();
    for (const p of priceList){
        const key = String(p.addon_key ?? "").trim().toLowerCase();
        if (!key) continue;
        priceByKey.set(key, {
            label: (p.addon_name ?? key).trim(),
            price: (p.amount_cents ?? 0) / 100
        });
    }
    for (const t of types){
        const key = String(t.key ?? "").trim().toLowerCase();
        if (!key) continue;
        const pricing = priceByKey.get(key);
        const label = (t.label ?? pricing?.label ?? key).trim();
        const price = pricing?.price ?? 0;
        const position = typeof t.position === "number" ? t.position : 0;
        available_addons.push({
            key,
            label,
            price,
            sort_order: position
        });
        addonPriceMap[key] = {
            label,
            price
        };
    }
    return {
        available_addons,
        addonPriceMap
    };
}
async function loadPricingFrequenciesForVertical(supabase, verticalId) {
    const { data, error } = await supabase.from("pricing_frequencies").select("frequency_key, frequency_label, discount_label, is_recurring").eq("vertical_id", verticalId);
    if (error) {
        console.warn("[BOOKING_CATALOG] pricing_frequencies", error.message);
        return [];
    }
    return data ?? [];
}
async function loadActiveHomeTypes(supabase) {
    const { data, error } = await supabase.from("home_types").select("key, label, position").eq("is_active", true).order("position", {
        ascending: true
    });
    if (error) {
        console.error("[BOOKING_CATALOG] home_types", error.message);
        return [];
    }
    return data ?? [];
}
function normalizeAddonKeysAgainstMap(arr, addonPriceMap) {
    if (!Array.isArray(arr)) return [];
    const allowed = new Set(Object.keys(addonPriceMap));
    const displayToKey = new Map();
    for (const [k, v] of Object.entries(addonPriceMap)){
        displayToKey.set(v.label.trim().toLowerCase(), k);
    }
    const titleCaseKeys = {
        fridge: "fridge",
        oven: "oven",
        cabinets: "cabinets",
        "pet hair": "pet_hair",
        pet_hair: "pet_hair"
    };
    return arr.filter((x)=>typeof x === "string").map((raw)=>{
        const trimmed = raw.trim();
        if (!trimmed) return null;
        const lower = trimmed.toLowerCase().replace(/\s+/g, " ");
        if (allowed.has(lower)) return lower;
        const fromLabel = displayToKey.get(lower);
        if (fromLabel) return fromLabel;
        const slug = lower.replace(/\s+/g, "_");
        if (allowed.has(slug)) return slug;
        const tc = titleCaseKeys[lower];
        if (tc && allowed.has(tc)) return tc;
        const fromDisplay = displayToKey.get(trimmed.toLowerCase());
        return fromDisplay ?? null;
    }).filter((x)=>x != null);
}
}),
"[project]/lib/admin/optionItemLabelForOrg.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "batchOptionItemLabelsForOrg",
    ()=>batchOptionItemLabelsForOrg,
    "optionItemLabelForOrg",
    ()=>optionItemLabelForOrg,
    "optionLabelFromBatchMap",
    ()=>optionLabelFromBatchMap
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$book$2d$v2$2f$loadCleaningPricingCatalog$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/book-v2/loadCleaningPricingCatalog.ts [app-route] (ecmascript)");
;
function canonicalSqftTierLabel(tierKey) {
    const k = String(tierKey ?? "").trim();
    if (!k) return null;
    return __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$book$2d$v2$2f$loadCleaningPricingCatalog$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["CANONICAL_SQFT_TIER_OPTIONS"].find((o)=>o.value === k)?.label ?? k;
}
async function optionItemLabelForOrg(supabase, orgId, setKey, itemKey) {
    const k = String(itemKey ?? "").trim();
    if (!k) return null;
    const { data: setRow } = await supabase.from("option_sets").select("id").eq("org_id", orgId).eq("set_key", setKey).maybeSingle();
    const sid = setRow?.id;
    if (!sid) {
        if (setKey === "square_footage_tier") return canonicalSqftTierLabel(k) ?? k;
        return k;
    }
    const { data: it } = await supabase.from("option_set_items").select("label").eq("option_set_id", sid).eq("item_key", k).maybeSingle();
    const lab = it?.label;
    if (lab != null && String(lab).trim() !== "") return String(lab).trim();
    return canonicalSqftTierLabel(k) ?? k;
}
function batchCacheKey(setKey, itemKey) {
    return `${setKey}\0${itemKey}`;
}
async function batchOptionItemLabelsForOrg(supabase, orgId, pairs) {
    const out = new Map();
    const bySet = new Map();
    for (const p of pairs){
        const sk = String(p.setKey ?? "").trim();
        const ik = String(p.itemKey ?? "").trim();
        if (!sk || !ik) continue;
        let keys = bySet.get(sk);
        if (!keys) {
            keys = new Set();
            bySet.set(sk, keys);
        }
        keys.add(ik);
    }
    for (const [setKey, itemKeys] of bySet){
        const { data: setRow } = await supabase.from("option_sets").select("id").eq("org_id", orgId).eq("set_key", setKey).maybeSingle();
        const sid = setRow?.id;
        const keysArr = [
            ...itemKeys
        ];
        if (!sid) {
            for (const ik of keysArr){
                const ck = batchCacheKey(setKey, ik);
                out.set(ck, setKey === "square_footage_tier" ? canonicalSqftTierLabel(ik) ?? ik : ik);
            }
            continue;
        }
        const { data: itemRows } = await supabase.from("option_set_items").select("item_key, label").eq("option_set_id", sid).in("item_key", keysArr);
        const labelByKey = new Map((itemRows ?? []).map((r)=>[
                r.item_key,
                r.label
            ]));
        for (const ik of keysArr){
            const ck = batchCacheKey(setKey, ik);
            const lab = labelByKey.get(ik);
            const trimmed = lab != null && String(lab).trim() !== "" ? String(lab).trim() : null;
            if (trimmed) {
                out.set(ck, trimmed);
            } else {
                out.set(ck, setKey === "square_footage_tier" ? canonicalSqftTierLabel(ik) ?? ik : ik);
            }
        }
    }
    return out;
}
function optionLabelFromBatchMap(map, setKey, itemKey) {
    const sk = String(setKey ?? "").trim();
    const ik = String(itemKey ?? "").trim();
    if (!sk || !ik) return null;
    return map.get(batchCacheKey(sk, ik)) ?? null;
}
}),
"[project]/lib/admin/hydrateVendorDisplayStub.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "hydrateVendorDisplayStub",
    ()=>hydrateVendorDisplayStub
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$vendorOptionLabel$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/vendorOptionLabel.ts [app-route] (ecmascript)");
;
async function hydrateVendorDisplayStub(supabase, vendorId, orgId) {
    const { data: row } = await supabase.from("vendors").select("id, name, company_name, email, phone, primary_person_id").eq("id", vendorId).eq("org_id", orgId).maybeSingle();
    if (!row) return null;
    const r = row;
    let person = null;
    if (r.primary_person_id) {
        const { data: p } = await supabase.from("persons").select("first_name, last_name").eq("id", r.primary_person_id).eq("org_id", orgId).maybeSingle();
        person = p;
    }
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$vendorOptionLabel$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["vendorRowToDisplayStub"])(r, person);
}
}),
"[project]/lib/admin/validateDiscountCode.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Validate a discount code for a job and compute discount_amount (cents).
 * Used by POST/PATCH jobs to ensure code is active, in date range, and (when applicable) matches job vertical.
 * Returns { error: string } or { discount_amount_cents: number; code: string }.
 */ __turbopack_context__.s([
    "computeDiscountCents",
    ()=>computeDiscountCents,
    "validateDiscountCodeForJob",
    ()=>validateDiscountCodeForJob
]);
function computeDiscountCents(gross_price_cents, codeRow) {
    const gross = Math.max(0, Math.round(gross_price_cents));
    const type = String(codeRow.discount_type ?? "").trim().toLowerCase();
    const val = codeRow.discount_value;
    if (type === "percent") {
        const percent = Math.min(100, Math.max(0, Number(val) ?? 0));
        return Math.round(gross * percent / 100);
    }
    if (type === "fixed") {
        const dollars = Number(val) ?? 0;
        const cents = Math.round(dollars * 100);
        return Math.min(gross, Math.max(0, cents));
    }
    return 0;
}
function validateDiscountCodeForJob(codeRow, gross_price_cents, job_vertical_slug) {
    if (!codeRow) {
        return {
            error: "Discount code not found"
        };
    }
    if (codeRow.is_active !== true) {
        return {
            error: "Discount code is not active"
        };
    }
    const now = new Date().toISOString();
    if (codeRow.starts_at != null && codeRow.starts_at > now) {
        return {
            error: "Discount code is not yet valid"
        };
    }
    if (codeRow.ends_at != null && codeRow.ends_at < now) {
        return {
            error: "Discount code has expired"
        };
    }
    const appliesTo = (codeRow.applies_to_vertical_slug ?? "").trim() || null;
    if (appliesTo && job_vertical_slug !== appliesTo) {
        return {
            error: "Discount code does not apply to this job's vertical"
        };
    }
    const discount_amount_cents = computeDiscountCents(gross_price_cents, codeRow);
    return {
        discount_amount_cents,
        code: codeRow.code ?? ""
    };
}
}),
"[project]/lib/admin/jobDiscountSelection.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Job discount selection: unified tokens (program:uuid | code:uuid), resolution for admin jobs,
 * and compatibility with legacy discount_codes + migrated programs (legacy_discount_code_id).
 */ __turbopack_context__.s([
    "buildJobDiscountDisplayLabel",
    ()=>buildJobDiscountDisplayLabel,
    "computeJobDiscountOptionPreviewCents",
    ()=>computeJobDiscountOptionPreviewCents,
    "discountProgramRowSelectableForJobAdmin",
    ()=>discountProgramRowSelectableForJobAdmin,
    "fetchJobDiscountOptionsForAdmin",
    ()=>fetchJobDiscountOptionsForAdmin,
    "formatProgramOptionLabel",
    ()=>formatProgramOptionLabel,
    "inferJobDiscountSelectionToken",
    ()=>inferJobDiscountSelectionToken,
    "inferOpportunityDiscountSelectionToken",
    ()=>inferOpportunityDiscountSelectionToken,
    "parseJobDiscountSelectionInput",
    ()=>parseJobDiscountSelectionInput,
    "programViewRowToPreviewFields",
    ()=>programViewRowToPreviewFields,
    "resolveJobDiscountSelection",
    ()=>resolveJobDiscountSelection
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$validateDiscountCode$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/validateDiscountCode.ts [app-route] (ecmascript)");
;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function parseJobDiscountSelectionInput(raw) {
    if (raw == null) return null;
    const s = String(raw).trim();
    if (!s) return null;
    const idx = s.indexOf(":");
    if (idx > 0) {
        const prefix = s.slice(0, idx).toLowerCase();
        const id = s.slice(idx + 1).trim();
        if (!id || !UUID_RE.test(id)) return null;
        if (prefix === "program") return {
            kind: "program",
            programId: id
        };
        if (prefix === "code") return {
            kind: "legacy_code",
            codeId: id
        };
        return null;
    }
    if (UUID_RE.test(s)) return {
        kind: "legacy_code",
        codeId: s
    };
    return null;
}
function formatProgramOptionLabel(code, programType) {
    const c = (code ?? "").trim() || "(no code)";
    const t = (programType ?? "").trim() || "program";
    return `${c} — ${t}`;
}
function computeJobDiscountOptionPreviewCents(option, grossCents) {
    const gross = Math.max(0, Math.round(grossCents));
    const type = (option.discount_type ?? "").toLowerCase();
    const val = option.discount_value;
    if (type === "percent") {
        const percent = Math.min(100, Math.max(0, Number(val) ?? 0));
        return Math.round(gross * percent / 100);
    }
    if (type === "fixed") {
        const dollars = Number(val) ?? 0;
        const cents = Math.round(dollars * 100);
        return Math.min(gross, Math.max(0, cents));
    }
    return 0;
}
function discountProgramRowSelectableForJobAdmin(row) {
    const st = String(row.status ?? "").trim().toLowerCase();
    if (st && st !== "active") return false;
    const now = Date.now();
    const vf = row.valid_from;
    const vt = row.valid_to;
    if (typeof vf === "string" && vf && new Date(vf).getTime() > now) return false;
    if (typeof vt === "string" && vt && new Date(vt).getTime() < now) return false;
    return true;
}
async function loadVerticalSlugsForProgram(supabase, programId) {
    const { data, error } = await supabase.from("discount_program_qualifiers").select("value_json").eq("discount_program_id", programId).eq("qualifier_type", "vertical_slug_in");
    if (error || !data?.length) return [];
    const slugs = new Set();
    for (const q of data){
        const v = q.value_json;
        if (v && typeof v === "object" && !Array.isArray(v)) {
            const vals = v.values;
            if (Array.isArray(vals)) {
                for (const x of vals){
                    const s = String(x).trim();
                    if (s) slugs.add(s);
                }
            }
        }
    }
    return [
        ...slugs
    ];
}
function computeDiscountCentsFromProgramView(row, grossCents) {
    const gross = Math.max(0, Math.round(grossCents));
    const benefitType = String(row.primary_benefit_type ?? "").trim();
    if (benefitType === "percent_off") {
        const bps = Number(row.primary_benefit_percent_basis_points ?? row.percent_basis_points ?? 0);
        const percent = Math.min(100, Math.max(0, bps / 100));
        return Math.round(gross * percent / 100);
    }
    if (benefitType === "fixed_amount_off") {
        const cents = Math.round(Number(row.primary_benefit_amount_cents ?? row.amount_cents ?? 0));
        return Math.min(gross, Math.max(0, cents));
    }
    if (benefitType === "free_service") {
        return gross;
    }
    return 0;
}
async function resolveJobDiscountSelection(supabase, parsed, grossCents, jobVerticalSlug, orgId) {
    if (!parsed) {
        return {
            ok: true,
            value: {
                discount_code_id: null,
                discount_program_id: null,
                discount_code: null,
                discount_amount: 0,
                discounted: false
            }
        };
    }
    if (parsed.kind === "legacy_code") {
        const { data: codeRow, error: codeErr } = await supabase.from("discount_codes").select("id, code, is_active, discount_type, discount_value, applies_to_vertical_slug, starts_at, ends_at").eq("id", parsed.codeId).maybeSingle();
        if (codeErr) return {
            ok: false,
            error: codeErr.message
        };
        const result = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$validateDiscountCode$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["validateDiscountCodeForJob"])(codeRow, grossCents, jobVerticalSlug);
        if ("error" in result) return {
            ok: false,
            error: result.error
        };
        return {
            ok: true,
            value: {
                discount_code_id: parsed.codeId,
                discount_program_id: null,
                discount_code: result.code,
                discount_amount: result.discount_amount_cents,
                discounted: true
            }
        };
    }
    const { data: row, error } = await supabase.from("discount_programs_admin_v").select("*").eq("id", parsed.programId).maybeSingle();
    if (error) return {
        ok: false,
        error: error.message
    };
    if (!row) return {
        ok: false,
        error: "Discount program not found"
    };
    const r = row;
    const rowOrg = r.org_id;
    if (rowOrg && rowOrg !== orgId) {
        return {
            ok: false,
            error: "Discount program does not belong to your org"
        };
    }
    if (!discountProgramRowSelectableForJobAdmin(r)) {
        return {
            ok: false,
            error: "Discount program is not active or is outside its valid dates"
        };
    }
    const verticalSlugs = await loadVerticalSlugsForProgram(supabase, parsed.programId);
    if (verticalSlugs.length > 0) {
        const jobV = (jobVerticalSlug ?? "").trim();
        if (!jobV || !verticalSlugs.includes(jobV)) {
            return {
                ok: false,
                error: "Discount program does not apply to this job's vertical"
            };
        }
    }
    const discount_amount = computeDiscountCentsFromProgramView(r, grossCents);
    const legacyId = r.legacy_discount_code_id ?? null;
    const codeStr = r.code ?? "";
    return {
        ok: true,
        value: {
            discount_program_id: parsed.programId,
            discount_code_id: legacyId,
            discount_code: codeStr || null,
            discount_amount,
            discounted: true
        }
    };
}
function inferOpportunityDiscountSelectionToken(opp) {
    const pid = opp.discount_program_id ?? null;
    if (pid) return `program:${pid}`;
    const cid = opp.discount_code_id ?? null;
    if (cid) return `code:${cid}`;
    return "";
}
async function inferJobDiscountSelectionToken(supabase, job) {
    const pid = job.discount_program_id ?? null;
    if (pid) return `program:${pid}`;
    const cid = job.discount_code_id ?? null;
    if (!cid) return "";
    const { data: prog } = await supabase.from("discount_programs").select("id").eq("legacy_discount_code_id", cid).maybeSingle();
    const found = prog;
    if (found?.id) return `program:${found.id}`;
    return `code:${cid}`;
}
async function buildJobDiscountDisplayLabel(supabase, job) {
    const pid = job.discount_program_id ?? null;
    if (pid) {
        const { data: v } = await supabase.from("discount_programs_admin_v").select("code, name, program_type").eq("id", pid).maybeSingle();
        const vr = v;
        if (vr) {
            const code = (vr.code ?? "").trim();
            const name = (vr.name ?? "").trim();
            const pt = (vr.program_type ?? "").trim() || "program";
            if (name && code) return `${code} — ${pt} (${name})`;
            return formatProgramOptionLabel(code || name || null, pt);
        }
    }
    const cid = job.discount_code_id ?? null;
    if (cid) {
        const { data: dc } = await supabase.from("discount_codes").select("code").eq("id", cid).maybeSingle();
        const c = dc?.code;
        if (c) return `${c} — legacy code`;
    }
    if (job.discount_code && String(job.discount_code).trim()) {
        return String(job.discount_code).trim();
    }
    return null;
}
function programViewRowToPreviewFields(row) {
    const benefitType = String(row.primary_benefit_type ?? "").trim();
    const firstOnly = row.first_time_customer_only === true;
    if (benefitType === "percent_off") {
        const bps = Number(row.primary_benefit_percent_basis_points ?? 0);
        return {
            discount_type: "percent",
            discount_value: bps / 100,
            first_job_only: firstOnly
        };
    }
    if (benefitType === "fixed_amount_off") {
        const cents = Number(row.primary_benefit_amount_cents ?? 0);
        return {
            discount_type: "fixed",
            discount_value: cents / 100,
            first_job_only: firstOnly
        };
    }
    if (benefitType === "free_service") {
        return {
            discount_type: "percent",
            discount_value: 100,
            first_job_only: firstOnly
        };
    }
    return {
        discount_type: null,
        discount_value: null,
        first_job_only: firstOnly
    };
}
async function fetchJobDiscountOptionsForAdmin(supabase, orgId, verticalSlug) {
    const now = new Date().toISOString();
    const { data: progRows, error: pe } = await supabase.from("discount_programs_admin_v").select("*").or(`org_id.eq.${orgId},org_id.is.null`).order("code", {
        ascending: true
    }).limit(500);
    if (pe) throw new Error(pe.message);
    const programs = (progRows ?? []).filter((raw)=>discountProgramRowSelectableForJobAdmin(raw));
    const programIds = programs.map((p)=>p.id).filter(Boolean);
    const verticalMap = new Map();
    if (programIds.length > 0) {
        const { data: quals } = await supabase.from("discount_program_qualifiers").select("discount_program_id, value_json").in("discount_program_id", programIds).eq("qualifier_type", "vertical_slug_in");
        for (const q of quals ?? []){
            const pid = q.discount_program_id;
            const v = q.value_json;
            const parts = [];
            if (v && typeof v === "object" && !Array.isArray(v)) {
                const vals = v.values;
                if (Array.isArray(vals)) {
                    for (const x of vals){
                        const s = String(x).trim();
                        if (s) parts.push(s);
                    }
                }
            }
            if (parts.length) verticalMap.set(pid, parts.join(","));
        }
    }
    const options = [];
    const legacyLinked = new Set();
    for (const raw of programs){
        const r = raw;
        const id = r.id;
        const legacy = r.legacy_discount_code_id ?? null;
        if (legacy) legacyLinked.add(legacy);
        const applies = verticalMap.get(id) ?? null;
        if (verticalSlug && applies) {
            const list = applies.split(",").map((s)=>s.trim()).filter(Boolean);
            if (list.length > 0 && !list.includes(verticalSlug)) continue;
        }
        const preview = programViewRowToPreviewFields(r);
        const code = r.code ?? "";
        const pt = r.program_type ?? null;
        options.push({
            value: `program:${id}`,
            label: formatProgramOptionLabel(code, pt),
            code: code || "(no code)",
            discount_type: preview.discount_type,
            discount_value: preview.discount_value,
            applies_to_vertical_slug: applies,
            first_job_only: preview.first_job_only,
            program_id: id,
            legacy_code_id: legacy,
            program_type: pt
        });
    }
    let cq = supabase.from("discount_codes").select("id, code, discount_type, discount_value, applies_to_vertical_slug, first_job_only").eq("is_active", true).or(`starts_at.is.null,starts_at.lte.${now}`).or(`ends_at.is.null,ends_at.gte.${now}`).order("code", {
        ascending: true
    });
    if (verticalSlug) {
        cq = cq.or(`applies_to_vertical_slug.is.null,applies_to_vertical_slug.eq.${verticalSlug}`);
    }
    const { data: codes, error: ce } = await cq;
    if (ce) throw new Error(ce.message);
    for (const raw of codes ?? []){
        const row = raw;
        if (legacyLinked.has(row.id)) continue;
        const t = String(row.discount_type ?? "").trim().toLowerCase();
        const dt = t === "percent" ? "percent" : t === "fixed" ? "fixed" : null;
        const dv = dt ? Number(row.discount_value) : null;
        options.push({
            value: `code:${row.id}`,
            label: `${(row.code ?? "").trim() || row.id.slice(0, 8)} — legacy code`,
            code: row.code ?? "",
            discount_type: dt,
            discount_value: dv != null && Number.isFinite(dv) ? dv : null,
            applies_to_vertical_slug: row.applies_to_vertical_slug ?? null,
            first_job_only: row.first_job_only ?? null,
            program_id: null,
            legacy_code_id: row.id,
            program_type: null
        });
    }
    return options.sort((a, b)=>a.label.localeCompare(b.label));
}
}),
"[project]/lib/admin/attachJobWorkUnitDisplay.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "attachJobWorkUnitDisplay",
    ()=>attachJobWorkUnitDisplay
]);
async function attachJobWorkUnitDisplay(supabase, orgId, job) {
    const wuId = job.work_unit_id;
    if (!wuId || typeof wuId !== "string" || !wuId.trim()) {
        return {
            ...job,
            _work_unit_name: null,
            _work_unit_department_name: null,
            _work_unit_label: null
        };
    }
    const { data: wu } = await supabase.from("work_units").select("id, name, department_id").eq("id", wuId.trim()).eq("org_id", orgId).maybeSingle();
    if (!wu) {
        return {
            ...job,
            _work_unit_name: null,
            _work_unit_department_name: null,
            _work_unit_label: null
        };
    }
    const w = wu;
    const { data: dept } = await supabase.from("departments").select("name").eq("id", w.department_id).eq("org_id", orgId).maybeSingle();
    const deptName = dept?.name ?? null;
    const wuName = w.name ?? null;
    const label = deptName && wuName ? `${deptName} · ${wuName}` : wuName ?? deptName ?? wuId.trim();
    return {
        ...job,
        _work_unit_name: wuName,
        _work_unit_department_name: deptName,
        _work_unit_label: label
    };
}
}),
"[project]/lib/admin/fetchActiveJobLineItems.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "fetchActiveJobLineItemsForAdmin",
    ()=>fetchActiveJobLineItemsForAdmin
]);
const JOB_LINE_ITEM_ADMIN_SELECT = "id, line_type, label, description, quantity, unit_amount_cents, amount_cents, pricing_source, is_manual_override, manual_override_reason, metadata, is_active, sort_order, created_at";
async function fetchActiveJobLineItemsForAdmin(supabase, orgId, jobId) {
    const { data, error } = await supabase.from("job_line_items").select(JOB_LINE_ITEM_ADMIN_SELECT).eq("job_id", jobId).eq("org_id", orgId).eq("is_active", true).order("sort_order", {
        ascending: true,
        nullsFirst: false
    }).order("created_at", {
        ascending: true
    });
    if (error) {
        console.warn("[fetchActiveJobLineItemsForAdmin]", error.message);
        return [];
    }
    return data ?? [];
}
}),
"[project]/lib/rrs/version.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/** Semver-style string; bump when ResolvedRecordPayload shape breaks consumers. */ __turbopack_context__.s([
    "RRS_VERSION",
    ()=>RRS_VERSION
]);
const RRS_VERSION = "0.1.0";
}),
"[project]/lib/rrs/overview/overviewLayoutConfigModel.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Pure overview layout config model (no DB). Safe for client bundles.
 */ __turbopack_context__.s([
    "collectOverviewFieldKeys",
    ()=>collectOverviewFieldKeys,
    "getDefaultOverviewLayoutConfig",
    ()=>getDefaultOverviewLayoutConfig,
    "getOrderedOverviewFieldKeys",
    ()=>getOrderedOverviewFieldKeys,
    "orderAndFilterOverviewFields",
    ()=>orderAndFilterOverviewFields,
    "parseOverviewLayoutConfig",
    ()=>parseOverviewLayoutConfig
]);
const DEFAULT_OVERVIEW_LAYOUT = {
    header_keys: [
        "title",
        "status_key",
        "_customer_name",
        "_primary_person_name",
        "_work_unit_label"
    ],
    bands: [
        {
            band_key: "summary",
            enabled: true,
            items: [
                {
                    kind: "system_field",
                    key: "scheduled_at"
                },
                {
                    kind: "system_field",
                    key: "_next_schedule"
                },
                {
                    kind: "system_field",
                    key: "_location_label"
                }
            ]
        },
        {
            band_key: "people",
            enabled: true,
            items: [
                {
                    kind: "system_field",
                    key: "_primary_person_name"
                }
            ]
        },
        {
            band_key: "financial",
            enabled: true,
            items: [
                {
                    kind: "system_field",
                    key: "display_total_cents"
                },
                {
                    kind: "system_field",
                    key: "_discount_applied"
                }
            ]
        },
        {
            band_key: "operational",
            enabled: false,
            items: []
        },
        {
            band_key: "relationships",
            enabled: false,
            items: []
        }
    ]
};
function isBandKey(s) {
    return [
        "summary",
        "people",
        "operational",
        "financial",
        "relationships",
        "service_property"
    ].includes(s);
}
function normalizeItemKind(kind) {
    if (kind === "field") return "system_field";
    if (kind === "system_field" || kind === "custom_field" || kind === "section") return kind;
    return null;
}
function parseOverviewLayoutConfig(raw) {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
        return structuredClone(DEFAULT_OVERVIEW_LAYOUT);
    }
    const o = raw;
    const header_keys = Array.isArray(o.header_keys) ? o.header_keys.filter((x)=>typeof x === "string") : DEFAULT_OVERVIEW_LAYOUT.header_keys;
    const relRaw = o.relationship_group_keys;
    const relationship_group_keys = Array.isArray(relRaw) ? relRaw.filter((x)=>typeof x === "string" && x.trim() !== "") : undefined;
    const bandsIn = Array.isArray(o.bands) ? o.bands : [];
    const bands = [];
    for (const b of bandsIn){
        if (b == null || typeof b !== "object" || Array.isArray(b)) continue;
        const bk = b.band_key;
        if (!bk || !isBandKey(bk)) continue;
        const enabled = Boolean(b.enabled);
        const itemsRaw = Array.isArray(b.items) ? b.items : [];
        const items = [];
        for (const it of itemsRaw){
            if (it == null || typeof it !== "object") continue;
            const nk = normalizeItemKind(it.kind);
            const key = it.key;
            if (!nk || typeof key !== "string" || !key.trim()) continue;
            items.push({
                kind: nk,
                key: key.trim(),
                hint: undefined
            });
        }
        bands.push({
            band_key: bk,
            enabled,
            items
        });
    }
    if (bands.length === 0) return structuredClone(DEFAULT_OVERVIEW_LAYOUT);
    const base = {
        header_keys,
        bands
    };
    if (relationship_group_keys?.length) {
        base.relationship_group_keys = relationship_group_keys;
    }
    return base;
}
function getDefaultOverviewLayoutConfig() {
    return structuredClone(DEFAULT_OVERVIEW_LAYOUT);
}
function collectOverviewFieldKeys(layout) {
    const s = new Set(layout.header_keys);
    for (const b of layout.bands){
        if (!b.enabled) continue;
        for (const it of b.items){
            s.add(it.key);
        }
    }
    return s;
}
function getOrderedOverviewFieldKeys(layout) {
    const ordered = [];
    const seen = new Set();
    for (const k of layout.header_keys){
        const t = typeof k === "string" ? k.trim() : "";
        if (!t || seen.has(t)) continue;
        seen.add(t);
        ordered.push(t);
    }
    for (const b of layout.bands){
        if (!b.enabled) continue;
        for (const it of b.items){
            const t = it.key.trim();
            if (!t || seen.has(t)) continue;
            seen.add(t);
            ordered.push(t);
        }
    }
    return ordered;
}
function orderAndFilterOverviewFields(fields, layout) {
    const allow = collectOverviewFieldKeys(layout);
    const byKey = new Map(fields.map((f)=>[
            f.key,
            f
        ]));
    const out = [];
    for (const k of getOrderedOverviewFieldKeys(layout)){
        if (!allow.has(k)) continue;
        const f = byKey.get(k);
        if (f) out.push(f);
    }
    return out;
}
}),
"[project]/lib/rrs/overview/overviewLayoutV0.ts [app-route] (ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

/**
 * Overview layout v0: pure model re-exports + admin DB loaders.
 * @see overviewLayoutConfigModel.ts for client-safe parsing (no Supabase).
 */ __turbopack_context__.s([
    "loadEffectiveOverviewLayoutConfig",
    ()=>loadEffectiveOverviewLayoutConfig,
    "loadRecordOverviewLayoutRow",
    ()=>loadRecordOverviewLayoutRow
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$rrs$2f$overview$2f$overviewLayoutConfigModel$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/rrs/overview/overviewLayoutConfigModel.ts [app-route] (ecmascript)");
;
;
async function loadRecordOverviewLayoutRow(supabase, orgId, entityType, surface) {
    const { data, error } = await supabase.from("record_overview_layouts").select("id, org_id, entity_type, surface, template_key, config, is_active").eq("org_id", orgId).eq("entity_type", entityType).eq("surface", surface).eq("is_active", true).maybeSingle();
    if (error || !data) return null;
    return data;
}
async function loadEffectiveOverviewLayoutConfig(supabase, orgId, entityType, surface) {
    const row = await loadRecordOverviewLayoutRow(supabase, orgId, entityType, surface);
    if (!row) return {
        row: null,
        config: (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$rrs$2f$overview$2f$overviewLayoutConfigModel$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["getDefaultOverviewLayoutConfig"])()
    };
    return {
        row,
        config: (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$rrs$2f$overview$2f$overviewLayoutConfigModel$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["parseOverviewLayoutConfig"])(row.config)
    };
}
}),
"[project]/lib/rrs/entities/job.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "resolveJobRecord",
    ()=>resolveJobRecord
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$relationshipDisplayAttach$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/relationshipDisplayAttach.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$entityFieldRegistryAttach$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/entityFieldRegistryAttach.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$jobDiscountSelection$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/jobDiscountSelection.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$jobDisplayPrice$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/jobDisplayPrice.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$statusDefinitionsResolve$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/lib/admin/statusDefinitionsResolve.ts [app-route] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$attachJobWorkUnitDisplay$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/attachJobWorkUnitDisplay.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$fetchActiveJobLineItems$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/fetchActiveJobLineItems.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$optionItemLabelForOrg$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/optionItemLabelForOrg.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$hydrateVendorDisplayStub$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/hydrateVendorDisplayStub.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$rrs$2f$version$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/rrs/version.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$rrs$2f$overview$2f$overviewLayoutV0$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/lib/rrs/overview/overviewLayoutV0.ts [app-route] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$rrs$2f$overview$2f$overviewLayoutConfigModel$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/rrs/overview/overviewLayoutConfigModel.ts [app-route] (ecmascript)");
;
;
;
;
;
;
;
;
;
;
;
function personDisplayName(p) {
    if (!p) return null;
    return [
        p.first_name,
        p.last_name
    ].filter(Boolean).join(" ").trim() || null;
}
/**
 * Persons-first primary display for job (doctrine order):
 * 1) jobs.primary_person_id → persons
 * 2) customer_persons for job.customer_id (prefer is_primary + role_type primary_contact)
 * 3) jobs.primary_contact_id → contacts → optional persons via person_id
 */ async function resolveJobPrimaryPersonDisplay(supabase, orgId, data) {
    const jobPrimaryPersonId = data.primary_person_id;
    const jobPrimaryContactId = data.primary_contact_id;
    const customerId = data.customer_id;
    if (jobPrimaryPersonId) {
        const { data: person } = await supabase.from("persons").select("id, first_name, last_name").eq("id", jobPrimaryPersonId).eq("org_id", orgId).maybeSingle();
        const p = person;
        const name = personDisplayName(p);
        return {
            _primary_person_id: p?.id ?? null,
            _primary_person_name: name,
            _contact_name: name
        };
    }
    if (customerId) {
        const { data: cpRows } = await supabase.from("customer_persons").select("person_id, is_primary, role_type, created_at").eq("org_id", orgId).eq("customer_id", customerId);
        const rows = cpRows ?? [];
        rows.sort((a, b)=>{
            const score = (r)=>(r.is_primary ? 2 : 0) + (r.role_type === "primary_contact" ? 1 : 0);
            const d = score(b) - score(a);
            if (d !== 0) return d;
            const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
            const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
            return ta - tb;
        });
        for (const cp of rows){
            const { data: person } = await supabase.from("persons").select("id, first_name, last_name").eq("id", cp.person_id).eq("org_id", orgId).maybeSingle();
            const p = person;
            if (p) {
                const name = personDisplayName(p);
                return {
                    _primary_person_id: p.id,
                    _primary_person_name: name,
                    _contact_name: name
                };
            }
        }
    }
    if (jobPrimaryContactId) {
        const { data: c } = await supabase.from("contacts").select("first_name, last_name, person_id").eq("id", jobPrimaryContactId).eq("org_id", orgId).single();
        const contactRow = c;
        const contactName = contactRow ? [
            contactRow.first_name,
            contactRow.last_name
        ].filter(Boolean).join(" ") || null : null;
        if (contactRow?.person_id) {
            const { data: person } = await supabase.from("persons").select("id, first_name, last_name").eq("id", contactRow.person_id).eq("org_id", orgId).maybeSingle();
            const p = person;
            return {
                _primary_person_id: p?.id ?? null,
                _primary_person_name: personDisplayName(p),
                _contact_name: contactName
            };
        }
        return {
            _primary_person_id: null,
            _primary_person_name: null,
            _contact_name: contactName
        };
    }
    return {
        _primary_person_id: null,
        _primary_person_name: null,
        _contact_name: null
    };
}
const JOB_SYSTEM_FIELD_SPECS = [
    {
        key: "title",
        label: "Title",
        column: "title",
        editable: true
    },
    {
        key: "description",
        label: "Description",
        column: "description",
        editable: true,
        surfaces: [
            "full"
        ]
    },
    {
        key: "internal_notes",
        label: "Internal notes",
        column: "internal_notes",
        editable: true,
        surfaces: [
            "full"
        ]
    },
    {
        key: "status_key",
        label: "Status",
        column: "status_key",
        editable: true
    },
    {
        key: "scheduled_at",
        label: "Scheduled at",
        column: "scheduled_at",
        editable: true
    },
    {
        key: "completed_at",
        label: "Completed at",
        column: "completed_at",
        editable: true
    },
    {
        key: "service_key",
        label: "Service",
        column: "service_key",
        editable: true,
        surfaces: [
            "overview",
            "full"
        ]
    },
    {
        key: "service_frequency_key",
        label: "Service frequency",
        column: "service_frequency_key",
        editable: true
    },
    {
        key: "job_number",
        label: "Job number",
        column: "job_number",
        editable: false,
        surfaces: [
            "overview",
            "full"
        ]
    },
    {
        key: "customer_id",
        label: "Customer",
        column: "customer_id",
        editable: true
    },
    {
        key: "location_id",
        label: "Location",
        column: "location_id",
        editable: true
    },
    {
        key: "work_unit_id",
        label: "Work unit",
        column: "work_unit_id",
        editable: true
    },
    {
        key: "assigned_vendor_id",
        label: "Assigned vendor",
        column: "assigned_vendor_id",
        editable: true
    },
    {
        key: "primary_person_id",
        label: "Primary person",
        column: "primary_person_id",
        editable: true
    },
    {
        key: "primary_contact_id",
        label: "Primary contact (legacy)",
        column: "primary_contact_id",
        editable: true,
        surfaces: [
            "full"
        ]
    },
    {
        key: "estimated_total_cents",
        label: "Estimated total (cents)",
        column: "estimated_total_cents",
        editable: true,
        surfaces: [
            "full",
            "overview"
        ]
    },
    {
        key: "recurring_total_cents",
        label: "Recurring total (cents)",
        column: "recurring_total_cents",
        editable: true,
        surfaces: [
            "full"
        ]
    }
];
function specAllowedOnSurface(spec, surface) {
    if (!spec.surfaces) return true;
    return spec.surfaces.includes(surface);
}
function buildJobSystemFields(data, flat, surface) {
    const out = [];
    for (const spec of JOB_SYSTEM_FIELD_SPECS){
        if (!specAllowedOnSurface(spec, surface)) continue;
        const col = spec.column;
        const value = data[col] ?? flat[col] ?? null;
        out.push({
            key: spec.key,
            label: spec.label,
            value,
            source: "system",
            editable: spec.editable,
            editable_entity: spec.editable ? "jobs" : null,
            editable_key: spec.editable ? col : null,
            provenance: "Job"
        });
    }
    return out;
}
function buildJobComputedFields(flat, surface) {
    const keys = [
        {
            key: "_customer_name",
            label: "Customer name"
        },
        {
            key: "_status_display",
            label: "Status (display)"
        },
        {
            key: "_work_unit_label",
            label: "Work unit"
        },
        {
            key: "_location_label",
            label: "Location"
        },
        {
            key: "_next_schedule",
            label: "Next schedule"
        },
        {
            key: "display_total_cents",
            label: "Display total (cents)"
        },
        {
            key: "_price_display",
            label: "Price (display)"
        },
        {
            key: "_primary_person_name",
            label: "Primary person name"
        },
        {
            key: "_contact_name",
            label: "Contact name"
        },
        {
            key: "_vendor_name",
            label: "Vendor name"
        },
        {
            key: "_opportunity_name",
            label: "Opportunity"
        },
        {
            key: "_discount_applied",
            label: "Discount applied"
        },
        {
            key: "_discount_label",
            label: "Discount"
        },
        {
            key: "_service_home_type_label",
            label: "Home type"
        },
        {
            key: "_service_sqft_band_label",
            label: "Size band"
        },
        {
            key: "_service_bedrooms",
            label: "Bedrooms"
        },
        {
            key: "_service_bathrooms",
            label: "Bathrooms"
        }
    ];
    const rows = [];
    for (const k of keys){
        if (k.surface && !k.surface.includes(surface)) continue;
        if (!(k.key in flat)) continue;
        rows.push({
            key: k.key,
            label: k.label,
            value: flat[k.key],
            source: "computed",
            editable: false,
            editable_entity: null,
            editable_key: null
        });
    }
    return rows;
}
function buildJobCustomFields(flat, surface) {
    const defs = flat._field_definitions;
    if (!defs?.length) return [];
    const rows = [];
    for (const d of defs){
        if (d.is_system) continue;
        rows.push({
            key: `custom:${d.field_key}`,
            label: d.label || d.field_key,
            value: flat[d.field_key],
            source: "custom",
            editable: true,
            editable_entity: "field_values",
            editable_key: d.id
        });
    }
    if (surface === "drawer") {
        return rows.slice(0, 12);
    }
    return rows;
}
function buildRelationshipGroups(flat) {
    const groups = [];
    const personId = flat._primary_person_id;
    const personName = flat._primary_person_name;
    if (personId || personName) {
        groups.push({
            group_key: "primary_customer_person",
            label: "Primary person",
            items: [
                {
                    person_id: personId ?? null,
                    display_name: personName ?? null,
                    contact_name: flat._contact_name ?? null
                }
            ]
        });
    }
    if (flat.customer_id || flat._customer_name) {
        groups.push({
            group_key: "customer_account",
            label: "Customer",
            items: [
                {
                    customer_id: flat.customer_id ?? null,
                    name: flat._customer_name ?? null
                }
            ]
        });
    }
    return groups;
}
function buildFinancialBlock(flat) {
    if (flat.display_total_cents == null && flat._price_display == null && flat._discount_amount_cents == null) {
        return null;
    }
    return {
        display_total_cents: flat.display_total_cents ?? null,
        price_display: flat._price_display ?? null,
        discount_amount_cents: flat._discount_amount_cents ?? null,
        discount_applied: flat._discount_applied ?? null,
        discount_label: flat._discount_label ?? null
    };
}
async function buildJobRrsPayload(supabase, orgId, jobId, surface, data, flat) {
    const { row: layoutRow, config: overviewConfig } = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$rrs$2f$overview$2f$overviewLayoutV0$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__["loadEffectiveOverviewLayoutConfig"])(supabase, orgId, "jobs", "overview");
    const systemFields = buildJobSystemFields(data, flat, surface);
    const computedFields = buildJobComputedFields(flat, surface);
    let customFields = buildJobCustomFields(flat, surface);
    let fields = [
        ...systemFields,
        ...computedFields,
        ...customFields
    ];
    if (surface === "overview") {
        fields = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$rrs$2f$overview$2f$overviewLayoutConfigModel$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["orderAndFilterOverviewFields"])(fields, overviewConfig);
    } else if (surface === "drawer") {
        fields = fields.filter((f)=>![
                "description",
                "internal_notes"
            ].includes(f.key) && !f.key.startsWith("custom:"));
        const drawerMax = 24;
        if (fields.length > drawerMax) {
            const priority = new Set([
                "title",
                "status_key",
                "_status_display",
                "_customer_name",
                "_primary_person_name",
                "_work_unit_label"
            ]);
            const head = fields.filter((f)=>priority.has(f.key));
            const tail = fields.filter((f)=>!priority.has(f.key));
            fields = [
                ...head,
                ...tail
            ].slice(0, drawerMax);
        }
    }
    let relationship_groups = buildRelationshipGroups(flat);
    if (surface === "overview" && overviewConfig.relationship_group_keys?.length) {
        const allowRg = new Set(overviewConfig.relationship_group_keys);
        relationship_groups = relationship_groups.filter((g)=>allowRg.has(g.group_key));
    } else if (surface === "drawer") {
        relationship_groups = relationship_groups.slice(0, 1);
    }
    return {
        meta: {
            rrs_version: __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$rrs$2f$version$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["RRS_VERSION"],
            entity_type: "jobs",
            entity_id: jobId,
            surface
        },
        fields,
        relationship_groups,
        financial: surface === "drawer" ? null : buildFinancialBlock(flat),
        overview_layout: layoutRow,
        actions: [],
        signals: []
    };
}
async function resolveJobRecord(supabase, orgId, jobId, surface) {
    const { data, error } = await supabase.from("jobs").select("*").eq("id", jobId).eq("org_id", orgId).single();
    if (error || !data) {
        const notFound = error?.code === "PGRST116";
        return {
            ok: false,
            notFound,
            message: error?.message
        };
    }
    const out = {
        ...data
    };
    if (data.opportunity_id) {
        const opp = await supabase.from("opportunities").select("name").eq("id", data.opportunity_id).eq("org_id", orgId).single();
        out._opportunity_name = opp.data?.name ?? null;
    } else {
        out._opportunity_name = null;
    }
    const primary = await resolveJobPrimaryPersonDisplay(supabase, orgId, {
        primary_person_id: data.primary_person_id,
        primary_contact_id: data.primary_contact_id,
        customer_id: data.customer_id
    });
    out._primary_person_id = primary._primary_person_id;
    out._primary_person_name = primary._primary_person_name;
    out._contact_name = primary._contact_name;
    if (typeof out._primary_person_id === "string" && out._primary_person_id.trim()) {
        out.primary_person_id = out._primary_person_id;
    }
    if (data.customer_id) {
        const customer = await supabase.from("customers").select("name").eq("id", data.customer_id).eq("org_id", orgId).single();
        out._customer_name = customer.data?.name ?? null;
    } else {
        out._customer_name = null;
    }
    const assignedVendorId = data.assigned_vendor_id;
    if (assignedVendorId) {
        const stub = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$hydrateVendorDisplayStub$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["hydrateVendorDisplayStub"])(supabase, assignedVendorId, orgId);
        out._assigned_vendor = stub;
        out._vendor_name = stub?.name ?? null;
    } else {
        out._assigned_vendor = null;
        out._vendor_name = null;
    }
    const jobLocationId = data.location_id;
    if (jobLocationId) {
        const { data: loc } = await supabase.from("locations").select("id, label, address1, city, state, postal_code").eq("id", jobLocationId).eq("org_id", orgId).maybeSingle();
        if (loc) {
            const l = loc;
            const label = l.label ?? ([
                l.address1,
                l.city,
                l.postal_code
            ].filter(Boolean).join(", ") || null);
            out._location_label = label;
            out._location_name = label;
            out._location = loc;
        } else {
            out._location_label = null;
            out._location_name = null;
            out._location = null;
        }
    } else {
        out._location_label = null;
        out._location_name = null;
        out._location = null;
    }
    const verticalId = data.vertical_id;
    if (verticalId) {
        const { data: vert } = await supabase.from("verticals").select("slug, name").eq("id", verticalId).maybeSingle();
        const vr = vert;
        out._vertical_slug = vr?.slug ?? null;
        out._vertical_name = vr?.name ?? null;
    } else {
        out._vertical_slug = null;
        out._vertical_name = null;
    }
    const orgIdJob = data.org_id;
    let statusKey = data.status_key;
    const jobStatusFk = data.job_status_id;
    if ((!statusKey || !String(statusKey).trim()) && jobStatusFk) {
        const { data: jst } = await supabase.from("job_statuses").select("key").eq("id", jobStatusFk).maybeSingle();
        const k = jst?.key;
        if (k && String(k).trim()) {
            statusKey = String(k).trim();
            out.status_key = statusKey;
        }
    }
    out._status_display = orgIdJob ? await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$statusDefinitionsResolve$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__["resolveStatusLabel"])(supabase, orgIdJob, "jobs", statusKey) : typeof statusKey === "string" && statusKey.trim() ? statusKey.trim() : null;
    const grossBasis = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$jobDisplayPrice$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["computeJobGrossBasisCents"])(data) ?? 0;
    out._discount_amount_cents = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$jobDisplayPrice$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["normalizeJobDiscountAmountToCents"])(data.discount_amount, grossBasis);
    const display_total_cents = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$jobDisplayPrice$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["computeJobDisplayTotalCents"])(data);
    out.display_total_cents = display_total_cents;
    out._price_display = display_total_cents != null ? display_total_cents / 100 : null;
    const codeStr = String(data.discount_code ?? "").trim();
    out._discount_applied = Number(out._discount_amount_cents ?? 0) > 0 || !!codeStr || !!data.discount_code_id || !!data.discount_program_id;
    const { data: nextSched } = await supabase.from("schedules").select("start_at").eq("job_id", jobId).eq("org_id", orgId).is("canceled_at", null).gte("start_at", new Date().toISOString()).order("start_at", {
        ascending: true
    }).limit(1).maybeSingle();
    out._next_schedule = nextSched?.start_at ?? null;
    out._discount_selection = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$jobDiscountSelection$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["inferJobDiscountSelectionToken"])(supabase, {
        discount_program_id: data.discount_program_id ?? null,
        discount_code_id: data.discount_code_id ?? null
    });
    out._discount_label = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$jobDiscountSelection$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["buildJobDiscountDisplayLabel"])(supabase, {
        discount_program_id: data.discount_program_id ?? null,
        discount_code_id: data.discount_code_id ?? null,
        discount_code: data.discount_code ?? null
    });
    out._service_home_type_label = null;
    out._service_sqft_band_label = null;
    out._service_square_footage = null;
    out._service_square_footage_display = null;
    out._service_bedrooms = null;
    out._service_bathrooms = null;
    const { data: cjdJob } = await supabase.from("cleaning_job_details").select("*").eq("job_id", jobId).maybeSingle();
    const jd = cjdJob;
    if (jd) {
        out._service_bedrooms = jd.beds ?? null;
        out._service_bathrooms = jd.baths ?? null;
        out._service_square_footage = null;
        if (jd.home_type_key) {
            out._service_home_type_label = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$optionItemLabelForOrg$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["optionItemLabelForOrg"])(supabase, orgId, "home_type", jd.home_type_key);
        }
        if (jd.square_footage_tier_key) {
            out._service_sqft_band_label = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$optionItemLabelForOrg$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["optionItemLabelForOrg"])(supabase, orgId, "square_footage_tier", jd.square_footage_tier_key);
        }
        const bandLabel = out._service_sqft_band_label != null ? String(out._service_sqft_band_label).trim() : "";
        out._service_square_footage_display = bandLabel || null;
    }
    const jobDprogId = data.discount_program_id ?? null;
    if (jobDprogId) {
        const { data: dpr } = await supabase.from("discount_programs").select("name").eq("id", jobDprogId).maybeSingle();
        out._discount_program_label = dpr?.name ?? null;
    } else {
        out._discount_program_label = null;
    }
    const withWu = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$attachJobWorkUnitDisplay$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["attachJobWorkUnitDisplay"])(supabase, orgId, out);
    out._work_unit_name = withWu._work_unit_name;
    out._work_unit_department_name = withWu._work_unit_department_name;
    out._work_unit_label = withWu._work_unit_label;
    out._job_line_items = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$fetchActiveJobLineItems$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["fetchActiveJobLineItemsForAdmin"])(supabase, orgId, jobId);
    await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$entityFieldRegistryAttach$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["attachFieldDefinitionsAndValues"])(supabase, out, "jobs", jobId);
    await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$relationshipDisplayAttach$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["attachDirectFkRelationshipDisplays"])(supabase, orgId, "jobs", out);
    const rrs = await buildJobRrsPayload(supabase, orgId, jobId, surface, data, out);
    return {
        ok: true,
        flat: out,
        rrs
    };
}
}),
"[project]/lib/rrs/surfaces.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "parseRecordSurface",
    ()=>parseRecordSurface,
    "resolveRecordSurfaceParam",
    ()=>resolveRecordSurfaceParam
]);
const SURFACES = [
    "drawer",
    "overview",
    "full"
];
function parseRecordSurface(raw) {
    if (raw == null || String(raw).trim() === "") return null;
    const s = String(raw).trim().toLowerCase();
    return SURFACES.includes(s) ? s : null;
}
function resolveRecordSurfaceParam(raw, fallback) {
    return parseRecordSurface(raw) ?? fallback;
}
}),
"[project]/app/api/admin/entity/[type]/[id]/route.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "GET",
    ()=>GET
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/server.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabaseAdmin$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/supabaseAdmin.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$getAdminContext$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/getAdminContext.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$assertRowOrg$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/assertRowOrg.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminFormatters$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/adminFormatters.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$relationshipDisplayAttach$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/relationshipDisplayAttach.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$scheduleRecordSnapshot$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/scheduleRecordSnapshot.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$entityFieldRegistryAttach$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/entityFieldRegistryAttach.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$jobDisplayPrice$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/jobDisplayPrice.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$opportunityLifecyclePresentation$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/opportunityLifecyclePresentation.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$statusDefinitionsResolve$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/lib/admin/statusDefinitionsResolve.ts [app-route] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$normalizeDocumentRow$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/normalizeDocumentRow.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$overviewRelationshipLabels$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/overviewRelationshipLabels.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$jobPaymentBalances$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/jobPaymentBalances.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$optionItemLabelForOrg$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/optionItemLabelForOrg.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$hydrateVendorDisplayStub$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/hydrateVendorDisplayStub.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$rrs$2f$entities$2f$job$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/rrs/entities/job.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$rrs$2f$surfaces$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/rrs/surfaces.ts [app-route] (ecmascript)");
;
;
;
;
;
;
;
;
;
;
;
;
;
;
;
;
;
;
;
/**
 * Drawer entity org model:
 * - **Tenant-scoped** (primary row has `org_id` or access is verified via FKs): jobs, opportunities, contacts, customers, schedules, locations, workflows, vendors, subscriptions, documents, payments, customer_members, persons, service_offerings, service_plan_templates, discount_redemptions (no `org_id` on row — allowed when any linked customer/job/opportunity/contact is in the caller org).
 * - **Global / catalog** (no org on primary table): `verticals`, `discount_codes`, `assignment_statuses`, `job_statuses`, `location_types` (read in joins only). **`addons`** maps to `pricing_addons` (vertical-scoped, no `org_id`); any authenticated admin may open a row by id.
 */ const ENTITY_TYPES = [
    "jobs",
    "opportunities",
    "contacts",
    "customers",
    "customer_members",
    "persons",
    "schedules",
    "discount_redemptions",
    "workflows",
    "vendors",
    "subscriptions",
    "locations",
    "payments",
    "service_offerings",
    "service_plan_templates",
    "addons",
    "documents"
];
async function assertDiscountRedemptionInOrg(supabase, redemptionId, orgId) {
    const { data, error } = await supabase.from("discount_redemptions").select("*").eq("id", redemptionId).maybeSingle();
    if (error || !data) return {
        ok: false
    };
    const r = data;
    const paths = [];
    if (r.customer_id) paths.push((0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$assertRowOrg$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["assertRowOrg"])(supabase, "customers", r.customer_id, orgId));
    if (r.job_id) paths.push((0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$assertRowOrg$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["assertRowOrg"])(supabase, "jobs", r.job_id, orgId));
    if (r.opportunity_id) paths.push((0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$assertRowOrg$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["assertRowOrg"])(supabase, "opportunities", r.opportunity_id, orgId));
    if (r.contact_id) paths.push((0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$assertRowOrg$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["assertRowOrg"])(supabase, "contacts", r.contact_id, orgId));
    if (paths.length === 0) return {
        ok: false
    };
    const results = await Promise.all(paths);
    if (!results.some((x)=>x.ok)) return {
        ok: false
    };
    return {
        ok: true,
        row: data
    };
}
function trimOrNull(v) {
    if (v == null) return null;
    const s = String(v).trim();
    return s ? s : null;
}
function ageFromDobIso(dobIso) {
    const raw = String(dobIso ?? "").trim();
    if (!raw) return null;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return null;
    const now = new Date();
    let years = now.getFullYear() - d.getFullYear();
    let months = now.getMonth() - d.getMonth();
    const dayDelta = now.getDate() - d.getDate();
    if (dayDelta < 0) months -= 1;
    if (months < 0) {
        years -= 1;
        months += 12;
    }
    if (years < 0) return null;
    const label = years >= 2 ? `${years}y` : years >= 1 ? `${years}y ${months}m` : `${Math.max(0, years * 12 + months)}m`;
    return {
        years,
        months,
        label
    };
}
async function resolveCustomerPersonRole(supabase, params) {
    const { data: cp } = await supabase.from("customer_persons").select("role_type").eq("org_id", params.orgId).eq("customer_id", params.customerId).eq("person_id", params.personId).maybeSingle();
    const roleType = trimOrNull(cp?.role_type);
    if (!roleType) return {
        role_key: null,
        role_label: null
    };
    const { data: rt } = await supabase.from("customer_person_role_types").select("label").eq("org_id", params.orgId).eq("key", roleType).maybeSingle();
    const roleLabel = trimOrNull(rt?.label);
    return {
        role_key: roleType,
        role_label: roleLabel
    };
}
async function GET(request, { params }) {
    const { type, id } = await params;
    if (!id || !ENTITY_TYPES.includes(type)) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: "Invalid type or id"
        }, {
            status: 400
        });
    }
    try {
        const ctx = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$getAdminContext$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["getAdminContext"])();
        if (!ctx.ok) return (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$getAdminContext$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["adminContextFailureResponse"])(ctx);
        const orgId = ctx.orgId;
        const supabase = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabaseAdmin$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["createAdminClient"])();
        if (type === "jobs") {
            if (id === "new") {
                return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                    _create: true
                });
            }
            const surface = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$rrs$2f$surfaces$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["resolveRecordSurfaceParam"])(request.nextUrl.searchParams.get("surface"), "full");
            const resolved = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$rrs$2f$entities$2f$job$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["resolveJobRecord"])(supabase, orgId, id, surface);
            if (!resolved.ok) {
                const status = resolved.notFound ? 404 : 500;
                return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json(resolved.message || "Not found", {
                    status
                });
            }
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                ...resolved.flat,
                _rrs: resolved.rrs
            });
        }
        if (type === "opportunities") {
            const { data, error } = await supabase.from("opportunities").select("*").eq("id", id).eq("org_id", orgId).single();
            if (error || !data) return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json(error?.message || "Not found", {
                status: error?.code === "PGRST116" ? 404 : 500
            });
            const opp = data;
            const out = {
                ...data
            };
            const enrichStartedAt = Date.now();
            const enrichPhaseMs = {};
            const markPhase = (key)=>{
                enrichPhaseMs[key] = Date.now() - enrichStartedAt;
            };
            const wuidForDept = trimOrNull(opp.work_unit_id);
            const oppPipelineStageId = opp.pipeline_stage_id ?? null;
            const oppPipelineId = opp.pipeline_id ?? null;
            const oppDprogId = opp.discount_program_id ?? null;
            const [wuDeptRow, customerRow, stRow, plRow, dprRow, vertRow, locRow] = await Promise.all([
                wuidForDept ? supabase.from("work_units").select("department_id").eq("id", wuidForDept).eq("org_id", orgId).maybeSingle() : Promise.resolve({
                    data: null
                }),
                opp.customer_id ? supabase.from("customers").select("name").eq("id", opp.customer_id).eq("org_id", orgId).single() : Promise.resolve({
                    data: null
                }),
                oppPipelineStageId ? supabase.from("pipeline_stages").select("name").eq("id", oppPipelineStageId).maybeSingle() : Promise.resolve({
                    data: null
                }),
                oppPipelineId ? supabase.from("pipelines").select("name").eq("id", oppPipelineId).maybeSingle() : Promise.resolve({
                    data: null
                }),
                oppDprogId ? supabase.from("discount_programs").select("name").eq("id", oppDprogId).maybeSingle() : Promise.resolve({
                    data: null
                }),
                opp.vertical_id ? supabase.from("verticals").select("name").eq("id", opp.vertical_id).maybeSingle() : Promise.resolve({
                    data: null
                }),
                opp.location_id ? supabase.from("locations").select("id, label, address1, city, state, postal_code").eq("id", opp.location_id).eq("org_id", orgId).maybeSingle() : Promise.resolve({
                    data: null
                })
            ]);
            markPhase("after_parallel_context_lookups");
            out._work_unit_department_id = wuidForDept ? trimOrNull(wuDeptRow.data?.department_id ?? null) : null;
            out._customer_name = customerRow.data?.name ?? null;
            if (oppPipelineStageId) {
                const stName = stRow.data?.name ?? null;
                out._pipeline_stage_name = stName;
                out._stage_name = stName;
            } else {
                out._pipeline_stage_name = null;
                out._stage_name = null;
            }
            out._pipeline_name = plRow.data?.name ?? null;
            out._discount_program_label = dprRow.data?.name ?? null;
            out._vertical_name = vertRow.data?.name ?? null;
            if (opp.location_id) {
                const l = locRow.data;
                const locLabel = l ? l.label || [
                    l.address1,
                    l.city,
                    l.state,
                    l.postal_code
                ].filter(Boolean).join(", ") || null : null;
                out._location_name = locLabel;
                out._location_label = locLabel;
                out._location_id = opp.location_id;
            } else {
                out._location_name = null;
                out._location_label = null;
                out._location_id = null;
            }
            // Prefer primary_person_id for display; fallback to contact
            const personDisplayName = (p)=>p ? p.full_name && p.full_name.trim() || [
                    p.first_name,
                    p.last_name
                ].filter(Boolean).join(" ").trim() || null : null;
            if (opp.primary_person_id) {
                const { data: person } = await supabase.from("persons").select("id, first_name, last_name, full_name, email, phone").eq("id", opp.primary_person_id).eq("org_id", orgId).maybeSingle();
                const p = person;
                out._primary_person_id = p?.id ?? null;
                out._primary_person_name = personDisplayName(p);
                out._primary_person_email = trimOrNull(p?.email);
                out._primary_person_phone = trimOrNull(p?.phone);
                out._contact_name = out._primary_person_name;
                out._primary_contact_name = out._primary_person_name;
            } else if (opp.primary_contact_id) {
                const contact = await supabase.from("contacts").select("first_name, last_name, person_id, email, phone").eq("id", opp.primary_contact_id).eq("org_id", orgId).single();
                const c = contact.data;
                const name = c ? [
                    c.first_name,
                    c.last_name
                ].filter(Boolean).join(" ") || null : null;
                out._contact_name = name;
                out._primary_contact_name = name;
                out._primary_contact_email = trimOrNull(c?.email);
                out._primary_contact_phone = trimOrNull(c?.phone);
                if (c && c.person_id) {
                    const { data: person } = await supabase.from("persons").select("id, first_name, last_name, full_name, email, phone").eq("id", c.person_id).eq("org_id", orgId).maybeSingle();
                    const p = person;
                    out._primary_person_id = p?.id ?? null;
                    out._primary_person_name = personDisplayName(p);
                    if (!out._primary_contact_email && p?.email) out._primary_contact_email = trimOrNull(p.email);
                    if (!out._primary_contact_phone && p?.phone) out._primary_contact_phone = trimOrNull(p.phone);
                } else {
                    out._primary_person_id = null;
                    out._primary_person_name = null;
                }
            } else {
                out._contact_name = null;
                out._primary_contact_name = null;
                out._primary_person_id = null;
                out._primary_person_name = null;
            }
            markPhase("after_primary_person_contact");
            const oppOrgId = opp.org_id;
            const opportunityDefs = oppOrgId ? await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$statusDefinitionsResolve$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__["fetchEffectiveStatusDefinitions"])(supabase, oppOrgId, "opportunities", {
                activeOnly: true
            }) : [];
            const oppStatusLabelByKey = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$statusDefinitionsResolve$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__["displayLabelsFromDefinitions"])(opportunityDefs);
            const oppLegacyStatus = opp.status;
            const oppSkRaw = opp.status_key != null && String(opp.status_key).trim() !== "" ? String(opp.status_key).trim() : oppLegacyStatus != null && String(oppLegacyStatus).trim() !== "" ? String(oppLegacyStatus).trim() : null;
            const stageLabel = out._pipeline_stage_name != null && String(out._pipeline_stage_name).trim() !== "" ? String(out._pipeline_stage_name).trim() : null;
            let oppStatusDisplay = null;
            if (oppOrgId && oppSkRaw) {
                const ci = opportunityDefs.find((d)=>d.status_key.toLowerCase() === oppSkRaw.toLowerCase());
                if (ci?.status_label != null && String(ci.status_label).trim() !== "") {
                    oppStatusDisplay = String(ci.status_label).trim();
                } else {
                    oppStatusDisplay = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$statusDefinitionsResolve$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__["resolveDisplayFromLabelMap"])(oppStatusLabelByKey, oppSkRaw, null);
                }
            } else {
                oppStatusDisplay = oppSkRaw;
            }
            if (oppPipelineStageId && oppSkRaw && String(oppSkRaw) === String(oppPipelineStageId) && stageLabel) {
                oppStatusDisplay = stageLabel;
            } else if (oppStatusDisplay != null && (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$overviewRelationshipLabels$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["isUuidLike"])(String(oppStatusDisplay))) {
                if (stageLabel) {
                    oppStatusDisplay = stageLabel;
                } else if ((0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$overviewRelationshipLabels$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["isUuidLike"])(oppSkRaw)) {
                    const { data: stRow } = await supabase.from("pipeline_stages").select("name").eq("id", oppSkRaw).maybeSingle();
                    const nm = stRow?.name;
                    if (nm != null && String(nm).trim() !== "") oppStatusDisplay = String(nm).trim();
                }
            }
            if ((oppStatusDisplay == null || String(oppStatusDisplay).trim() === "") && stageLabel) {
                oppStatusDisplay = stageLabel;
            }
            out._status_display = oppStatusDisplay;
            const qt = opp.quote_total != null && !Number.isNaN(Number(opp.quote_total)) ? Number(opp.quote_total) : opp.estimated_price_cents != null && !Number.isNaN(Number(opp.estimated_price_cents)) ? Number(opp.estimated_price_cents) / 100 : opp.monetary_value_cents != null && !Number.isNaN(Number(opp.monetary_value_cents)) ? Number(opp.monetary_value_cents) / 100 : null;
            out._quote_total_display = qt;
            Object.assign(out, (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$opportunityLifecyclePresentation$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["buildOpportunityLifecycleFields"])({
                statusKey: oppSkRaw,
                quoteTotalDollars: (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$opportunityLifecyclePresentation$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["opportunityQuoteTotalForLifecycle"])(opp),
                defs: opportunityDefs
            }));
            markPhase("after_status_defs_and_financial");
            const drawerInitial = request.nextUrl.searchParams.get("surface")?.trim().toLowerCase() === "drawer_initial";
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$entityFieldRegistryAttach$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["attachFieldDefinitionsAndValues"])(supabase, out, "opportunities", id, {
                mergeValues: !drawerInitial
            });
            markPhase("after_field_definitions_values");
            if (drawerInitial) {
                markPhase("drawer_initial_skip_rel_inquiry_persons");
                out._inquiry_children = [];
                out._opportunity_persons = [];
                out._record_surface = "drawer_initial";
                const inquiryTitleEarly = trimOrNull(out.name) ?? trimOrNull(out.title) ?? "—";
                out._identity = {
                    household: typeof opp.customer_id === "string" && opp.customer_id.trim() ? {
                        id: opp.customer_id.trim(),
                        label: trimOrNull(out._customer_name) ?? "—"
                    } : null,
                    primary_person: opp.primary_person_id ? {
                        id: String(opp.primary_person_id),
                        label: trimOrNull(out._primary_person_name) ?? "—",
                        email: trimOrNull(out._primary_person_email),
                        phone: trimOrNull(out._primary_person_phone),
                        role_key: null,
                        role_label: null
                    } : null,
                    primary_contact: opp.primary_contact_id ? {
                        id: String(opp.primary_contact_id),
                        label: trimOrNull(out._primary_contact_name) ?? "—",
                        email: trimOrNull(out._primary_contact_email),
                        phone: trimOrNull(out._primary_contact_phone),
                        role_key: null,
                        role_label: null
                    } : null,
                    primary_child: null,
                    inquiry: {
                        title: inquiryTitleEarly,
                        lines: [],
                        section_key: "quote"
                    }
                };
                markPhase("after_identity_block");
                if ("TURBOPACK compile-time truthy", 1) {
                    console.info("[timing][opportunity-api]", {
                        opportunity_id: id,
                        enrich_ms: Date.now() - enrichStartedAt,
                        enrich_phases_ms: enrichPhaseMs,
                        surface: "drawer_initial"
                    });
                }
                return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json(out);
            }
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$relationshipDisplayAttach$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["attachDirectFkRelationshipDisplays"])(supabase, orgId, "opportunities", out);
            markPhase("after_relationship_displays");
            const oppMeta = opp.metadata ?? null;
            const metaDesired = oppMeta && typeof oppMeta.desired_start_date === "string" ? oppMeta.desired_start_date.trim() : "";
            const metaTour = oppMeta && typeof oppMeta.tour_date === "string" ? oppMeta.tour_date.trim() : "";
            if (metaDesired && (out.desired_start_date == null || String(out.desired_start_date).trim() === "")) {
                out.desired_start_date = metaDesired;
            }
            if (metaTour && (out.tour_date == null || String(out.tour_date).trim() === "")) {
                out.tour_date = metaTour;
            }
            // -----------------------------------------------------------------
            // Canonical identity block (relationship/FK-derived; avoids UI key-guessing)
            // -----------------------------------------------------------------
            const rel = out._relationship_displays ?? {};
            const householdLabel = trimOrNull(out._customer_name) ?? rel.customer_id?.label ?? null;
            const householdId = typeof opp.customer_id === "string" && opp.customer_id.trim() ? opp.customer_id.trim() : null;
            // Primary guardian/person role label (from customer_persons.role_type -> role_types.label) when possible.
            let personRoleKey = null;
            let personRoleLabel = null;
            if (householdId && typeof opp.primary_person_id === "string" && opp.primary_person_id.trim()) {
                const pid = opp.primary_person_id.trim();
                const rr = await resolveCustomerPersonRole(supabase, {
                    orgId,
                    customerId: householdId,
                    personId: pid
                });
                personRoleKey = rr.role_key;
                personRoleLabel = rr.role_label;
            }
            // Primary contact role label (same role system; derived via contact.person_id when available).
            let contactRoleKey = null;
            let contactRoleLabel = null;
            if (householdId && typeof opp.primary_contact_id === "string" && opp.primary_contact_id.trim()) {
                const { data: cRow } = await supabase.from("contacts").select("person_id").eq("id", opp.primary_contact_id.trim()).eq("org_id", orgId).maybeSingle();
                const pid = trimOrNull(cRow?.person_id);
                if (pid) {
                    const rr = await resolveCustomerPersonRole(supabase, {
                        orgId,
                        customerId: householdId,
                        personId: pid
                    });
                    contactRoleKey = rr.role_key;
                    contactRoleLabel = rr.role_label;
                }
            }
            // Primary child (from customer_members; pick the first "child-like" relationship, else first member).
            let child = null;
            if (householdId) {
                const { data: cms } = await supabase.from("customer_members").select("id, display_name, relationship, dob").eq("org_id", orgId).eq("customer_id", householdId).eq("is_active", true).limit(25);
                const rows = cms ?? [];
                const pick = rows.find((r)=>[
                        "child",
                        "dependent",
                        "student"
                    ].includes(String(r.relationship ?? "").trim().toLowerCase())) ?? rows[0] ?? null;
                if (pick) {
                    const relKey = trimOrNull(pick.relationship);
                    let relLabel = null;
                    if (relKey) {
                        const { data: rt } = await supabase.from("customer_member_relationship_types").select("label").eq("org_id", orgId).eq("key", relKey).maybeSingle();
                        relLabel = trimOrNull(rt?.label);
                    }
                    child = {
                        id: pick.id,
                        display_name: pick.display_name,
                        relationship: relKey,
                        relationship_label: relLabel,
                        dob: pick.dob ? String(pick.dob) : null
                    };
                }
            }
            // -----------------------------------------------------------------
            // Child links for this inquiry (opportunity_customer_members)
            // -----------------------------------------------------------------
            // This is the canonical “which siblings are included in this inquiry?” relationship.
            // desired_program_type / desired_schedule_type may override opportunity-level defaults (when null, inherit).
            const oppDefaultProgramType = trimOrNull(out.program_type);
            const oppDefaultScheduleType = trimOrNull(out.schedule_type);
            const { data: joinRows } = await supabase.from("opportunity_customer_members").select("id, customer_member_id, desired_program_type, desired_schedule_type, outcome_status_key, fit_status, notes, metadata, created_at, updated_at").eq("org_id", orgId).eq("opportunity_id", id).order("created_at", {
                ascending: true
            });
            const jrows = joinRows ?? [];
            const memberIds = [
                ...new Set(jrows.map((r)=>r.customer_member_id).filter(Boolean))
            ];
            const { data: memberRows } = memberIds.length > 0 ? await supabase.from("customer_members").select("id, display_name, relationship, dob, person_id, first_name, last_name, metadata").eq("org_id", orgId).in("id", memberIds) : {
                data: []
            };
            const memList = memberRows ?? [];
            const memberMap = new Map(memList.map((m)=>[
                    m.id,
                    m
                ]));
            const personIds = [
                ...new Set(memList.map((m)=>trimOrNull(m.person_id)).filter(Boolean))
            ];
            const { data: personRows } = personIds.length > 0 ? await supabase.from("persons").select("id, first_name, last_name, full_name, date_of_birth").eq("org_id", orgId).in("id", personIds) : {
                data: []
            };
            const pmap = new Map((personRows ?? []).map((p)=>[
                    p.id,
                    p
                ]));
            const tInquiry0 = Date.now();
            const ocmMemberStatusDefs = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$statusDefinitionsResolve$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__["fetchEffectiveStatusDefinitions"])(supabase, orgId, "opportunity_customer_members", {
                activeOnly: true
            });
            const ocmStatusLabelByKey = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$statusDefinitionsResolve$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__["displayLabelsFromDefinitions"])(ocmMemberStatusDefs);
            const optionPairs = [];
            for (const r of jrows){
                const desiredProgramType = trimOrNull(r.desired_program_type) ?? oppDefaultProgramType;
                const desiredScheduleType = trimOrNull(r.desired_schedule_type) ?? oppDefaultScheduleType;
                if (desiredProgramType) optionPairs.push({
                    setKey: "childcare_program_type",
                    itemKey: desiredProgramType
                });
                if (desiredScheduleType) optionPairs.push({
                    setKey: "childcare_schedule_type",
                    itemKey: desiredScheduleType
                });
            }
            const optionLabelMap = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$optionItemLabelForOrg$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["batchOptionItemLabelsForOrg"])(supabase, orgId, optionPairs);
            const inquiryBatchMs = Date.now() - tInquiry0;
            const inquiryChildren = jrows.map((r)=>{
                const m = memberMap.get(r.customer_member_id) ?? null;
                const pid = trimOrNull(m?.person_id);
                const p = pid ? pmap.get(pid) ?? null : null;
                const dob = p?.date_of_birth ? String(p.date_of_birth) : m?.dob ? String(m.dob) : null;
                const age = ageFromDobIso(dob);
                const desiredProgramType = trimOrNull(r.desired_program_type) ?? oppDefaultProgramType;
                const desiredScheduleType = trimOrNull(r.desired_schedule_type) ?? oppDefaultScheduleType;
                const memMeta = m?.metadata ?? null;
                const demoProgramLabel = memMeta && typeof memMeta.demo_program_label === "string" ? trimOrNull(memMeta.demo_program_label) : null;
                const outcomeStatusKey = trimOrNull(r.outcome_status_key);
                const rawProgLabel = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$optionItemLabelForOrg$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["optionLabelFromBatchMap"])(optionLabelMap, "childcare_program_type", desiredProgramType);
                const desiredProgramLabel = rawProgLabel ?? demoProgramLabel;
                const desiredScheduleLabel = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$optionItemLabelForOrg$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["optionLabelFromBatchMap"])(optionLabelMap, "childcare_schedule_type", desiredScheduleType);
                const outcomeStatusLabel = outcomeStatusKey ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$statusDefinitionsResolve$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__["resolveDisplayFromLabelMap"])(ocmStatusLabelByKey, outcomeStatusKey, null) : null;
                return {
                    id: r.id,
                    customer_member_id: r.customer_member_id,
                    person_id: pid,
                    display_name: m?.display_name ?? (pid ? personDisplayName(p) : null) ?? r.customer_member_id.slice(0, 8) + "…",
                    dob,
                    age: age ? age.label : null,
                    desired_program_type: desiredProgramType,
                    desired_program_label: desiredProgramLabel,
                    desired_schedule_type: desiredScheduleType,
                    desired_schedule_label: desiredScheduleLabel,
                    outcome_status_key: outcomeStatusKey,
                    outcome_status_label: outcomeStatusLabel,
                    fit_status: trimOrNull(r.fit_status),
                    notes: trimOrNull(r.notes),
                    metadata: r.metadata ?? null,
                    created_at: r.created_at ?? null,
                    updated_at: r.updated_at ?? null
                };
            });
            enrichPhaseMs.inquiry_children_batch_ms = inquiryBatchMs;
            let inquiryChildrenOut = inquiryChildren;
            if (!inquiryChildrenOut.length && oppMeta && Array.isArray(oppMeta.inquiry_children)) {
                const mdKids = oppMeta.inquiry_children;
                inquiryChildrenOut = mdKids.map((raw, i)=>{
                    if (!raw || typeof raw !== "object") return null;
                    const row = raw;
                    const displayName = typeof row.display_name === "string" && row.display_name.trim() ? row.display_name.trim() : typeof row.child_name === "string" && row.child_name.trim() ? row.child_name.trim() : null;
                    if (!displayName) return null;
                    const sid = `metadata_child:${id}:${i}`;
                    return {
                        id: sid,
                        customer_member_id: sid,
                        person_id: null,
                        display_name: displayName,
                        dob: typeof row.dob === "string" ? row.dob : null,
                        age: typeof row.age === "string" ? row.age : null,
                        desired_program_type: typeof row.program_type_key === "string" ? trimOrNull(row.program_type_key) : null,
                        desired_program_label: typeof row.program_label === "string" ? trimOrNull(row.program_label) : typeof row.program_short === "string" ? trimOrNull(row.program_short) : null,
                        desired_schedule_type: null,
                        desired_schedule_label: null,
                        outcome_status_key: null,
                        outcome_status_label: null,
                        fit_status: null,
                        notes: typeof row.notes === "string" ? trimOrNull(row.notes) : null,
                        metadata: row.metadata ?? {
                            source: "opportunity_metadata"
                        },
                        created_at: null,
                        updated_at: null
                    };
                }).filter(Boolean);
            }
            // Final fallback: demo/seed metadata uses simple child_name fields (queue shows these).
            if (!inquiryChildrenOut.length && oppMeta && typeof oppMeta === "object") {
                const md = oppMeta;
                const demoChild = typeof md.demo_child_name === "string" && md.demo_child_name.trim() ? md.demo_child_name.trim() : typeof md.child_name === "string" && md.child_name.trim() ? md.child_name.trim() : null;
                if (demoChild) {
                    const sid = `metadata_child:${id}:demo`;
                    inquiryChildrenOut = [
                        {
                            id: sid,
                            customer_member_id: sid,
                            person_id: null,
                            display_name: demoChild,
                            dob: typeof md.child_dob === "string" ? md.child_dob : null,
                            age: typeof md.child_age === "string" ? md.child_age : null,
                            desired_program_type: typeof md.program_type_key === "string" ? trimOrNull(md.program_type_key) : null,
                            desired_program_label: typeof md.program_label === "string" ? trimOrNull(md.program_label) : typeof md.demo_requested_program === "string" ? trimOrNull(md.demo_requested_program) : null,
                            desired_schedule_type: typeof md.schedule_type_key === "string" ? trimOrNull(md.schedule_type_key) : null,
                            desired_schedule_label: typeof md.schedule_label === "string" ? trimOrNull(md.schedule_label) : null,
                            outcome_status_key: null,
                            outcome_status_label: null,
                            fit_status: null,
                            notes: typeof md.notes === "string" ? trimOrNull(md.notes) : null,
                            metadata: {
                                source: "opportunity_metadata_demo_child_name"
                            },
                            created_at: null,
                            updated_at: null
                        }
                    ];
                }
            }
            out._inquiry_children = inquiryChildrenOut;
            markPhase("after_inquiry_children_resolved");
            {
                const { data: opRows } = await supabase.from("opportunity_persons").select("id, person_id, role_type, created_at").eq("org_id", orgId).eq("opportunity_id", id).order("created_at", {
                    ascending: true
                });
                const personIdsForOpp = [
                    ...new Set((opRows ?? []).map((z)=>z.person_id).filter(Boolean))
                ];
                const { data: opPeople } = personIdsForOpp.length > 0 ? await supabase.from("persons").select("id, first_name, last_name, full_name, email, phone").eq("org_id", orgId).in("id", personIdsForOpp) : {
                    data: []
                };
                const oppPersonMap = new Map((opPeople ?? []).map((p)=>[
                        p.id,
                        p
                    ]));
                out._opportunity_persons = (opRows ?? []).map((r)=>{
                    const p = oppPersonMap.get(r.person_id) ?? null;
                    return {
                        id: r.id,
                        person_id: r.person_id,
                        role_type: trimOrNull(r.role_type) ?? "—",
                        name: personDisplayName(p),
                        phone: trimOrNull(p?.phone),
                        email: trimOrNull(p?.email)
                    };
                });
            }
            markPhase("after_opportunity_persons");
            // Inquiry summary from configured field_definitions in the "quote" section when present.
            const defs = out._field_definitions ?? [];
            const quoteDefs = defs.filter((d)=>d.is_visible_in_drawer !== false).filter((d)=>String(d.section_key ?? "").trim() === "quote");
            const inquiryLines = [];
            for (const d of quoteDefs){
                const key = d.field_key;
                const v = out[key];
                const s = trimOrNull(v);
                if (!s) continue;
                inquiryLines.push({
                    key,
                    label: trimOrNull(d.label) ?? key,
                    value: s
                });
                if (inquiryLines.length >= 3) break;
            }
            const inquiryTitle = trimOrNull(out.name) ?? trimOrNull(out.title) ?? (inquiryLines.length ? inquiryLines.map((l)=>l.value).join(" · ") : null) ?? "—";
            out._identity = {
                household: householdId ? {
                    id: householdId,
                    label: householdLabel ?? "—"
                } : null,
                primary_person: opp.primary_person_id ? {
                    id: String(opp.primary_person_id),
                    label: trimOrNull(out._primary_person_name) ?? rel.primary_person_id?.label ?? "—",
                    email: trimOrNull(out._primary_person_email),
                    phone: trimOrNull(out._primary_person_phone),
                    role_key: personRoleKey,
                    role_label: personRoleLabel
                } : null,
                primary_contact: opp.primary_contact_id ? {
                    id: String(opp.primary_contact_id),
                    label: trimOrNull(out._primary_contact_name) ?? rel.primary_contact_id?.label ?? "—",
                    email: trimOrNull(out._primary_contact_email),
                    phone: trimOrNull(out._primary_contact_phone),
                    role_key: contactRoleKey,
                    role_label: contactRoleLabel
                } : null,
                primary_child: child,
                inquiry: {
                    title: inquiryTitle,
                    lines: inquiryLines,
                    section_key: "quote"
                }
            };
            markPhase("after_identity_block");
            if ("TURBOPACK compile-time truthy", 1) {
                console.info("[timing][opportunity-api]", {
                    opportunity_id: id,
                    enrich_ms: Date.now() - enrichStartedAt,
                    enrich_phases_ms: enrichPhaseMs,
                    inquiry_batch_ms: enrichPhaseMs.inquiry_children_batch_ms,
                    surface: "full"
                });
            }
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json(out);
        }
        if (type === "contacts") {
            if (id === "new") {
                return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                    _create: true
                });
            }
            const { data, error } = await supabase.from("contacts").select("*").eq("id", id).eq("org_id", orgId).single();
            if (error || !data) return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json(error?.message || "Not found", {
                status: error?.code === "PGRST116" ? 404 : 500
            });
            const contact = data;
            let _person = null;
            let _person_id = null;
            let _person_name = null;
            if (contact.person_id) {
                const { data: personRow } = await supabase.from("persons").select("id, first_name, last_name, full_name, email, phone, created_at, updated_at").eq("id", contact.person_id).eq("org_id", orgId).maybeSingle();
                if (personRow) {
                    _person = personRow;
                    _person_id = personRow.id;
                    const p = personRow;
                    _person_name = p.full_name && p.full_name.trim() || [
                        p.first_name,
                        p.last_name
                    ].filter(Boolean).join(" ").trim() || null;
                }
            }
            let _linked_customer_name = null;
            let _linked_vendor_name = null;
            if (contact.customer_id) {
                const { data: cust } = await supabase.from("customers").select("name").eq("id", contact.customer_id).eq("org_id", orgId).maybeSingle();
                _linked_customer_name = cust?.name ?? null;
            }
            if (contact.vendor_id) {
                const { data: vend } = await supabase.from("vendors").select("name").eq("id", contact.vendor_id).eq("org_id", orgId).maybeSingle();
                _linked_vendor_name = vend?.name ?? null;
            }
            const [custPrimary, vendPrimary] = await Promise.all([
                supabase.from("customers").select("id").eq("primary_contact_id", id).eq("org_id", orgId).limit(1).maybeSingle(),
                supabase.from("vendors").select("id").eq("primary_contact_id", id).eq("org_id", orgId).limit(1).maybeSingle()
            ]);
            const pc = [];
            if (custPrimary.data) pc.push("Customer");
            if (vendPrimary.data) pc.push("Vendor");
            const _primary_contact_for = pc.length > 0 ? pc.join(", ") : "—";
            let _contact_vendor = null;
            if (contact.vendor_id) {
                const { data: vendor } = await supabase.from("vendors").select("id, name, vendor_status_id, created_at").eq("id", contact.vendor_id).eq("org_id", orgId).single();
                if (vendor) _contact_vendor = {
                    id: vendor.id,
                    name: vendor.name ?? null,
                    vendor_status_id: vendor.vendor_status_id ?? null,
                    created_at: vendor.created_at
                };
            }
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                ...data,
                _contact_vendor,
                _linked_customer_name,
                _linked_vendor_name,
                _primary_contact_for,
                _person: _person ?? null,
                _person_id,
                _person_name
            });
        }
        if (type === "customers") {
            const { data, error } = await supabase.from("customers").select("*").eq("id", id).eq("org_id", orgId).single();
            if (error || !data) return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json(error?.message || "Not found", {
                status: error?.code === "PGRST116" ? 404 : 500
            });
            const out = {
                ...data
            };
            const primaryContactId = data.primary_contact_id;
            const verticalId = data.vertical_id;
            const metadata = data.metadata;
            if (primaryContactId) {
                const { data: contact } = await supabase.from("contacts").select("id, first_name, last_name, email, phone, person_id").eq("id", primaryContactId).eq("org_id", orgId).maybeSingle();
                out._primary_contact = contact ?? null;
                const c = contact;
                out._primary_contact_name = c ? [
                    c.first_name,
                    c.last_name
                ].filter(Boolean).join(" ") || null : null;
                out._primary_contact_email = c?.email ?? null;
                out._primary_contact_phone = c?.phone ?? null;
                if (c?.person_id) {
                    const { data: person } = await supabase.from("persons").select("id, first_name, last_name, email, phone").eq("id", c.person_id).eq("org_id", orgId).maybeSingle();
                    const p = person;
                    out._primary_person_id = p?.id ?? null;
                    out._primary_person_name = p ? [
                        p.first_name,
                        p.last_name
                    ].filter(Boolean).join(" ").trim() || null : null;
                    out._primary_person_email = p?.email ?? null;
                    out._primary_person_phone = p?.phone ?? null;
                } else {
                    out._primary_person_id = null;
                    out._primary_person_name = null;
                    out._primary_person_email = null;
                    out._primary_person_phone = null;
                }
            } else {
                out._primary_contact = null;
                out._primary_contact_name = null;
                out._primary_contact_email = null;
                out._primary_contact_phone = null;
                out._primary_person_id = null;
                out._primary_person_name = null;
                out._primary_person_email = null;
                out._primary_person_phone = null;
            }
            const meta = metadata && typeof metadata === "object" ? metadata : {};
            out._metadata_email = meta.email ?? null;
            out._metadata_phone = meta.phone ?? null;
            out._metadata_source = meta.source ?? null;
            if (verticalId) {
                const { data: vert } = await supabase.from("verticals").select("id, name, slug").eq("id", verticalId).maybeSingle();
                const v = vert;
                out._vertical_name = v ? v.name ?? v.slug ?? null : null;
            } else {
                out._vertical_name = null;
            }
            const { data: primaryLoc } = await supabase.from("locations").select("id, label, address1, city, postal_code").eq("customer_id", id).eq("org_id", orgId).eq("is_primary", true).limit(1).maybeSingle();
            out._primary_location = primaryLoc ?? null;
            {
                const [{ count: contactsCount }, { count: oppCount }, { count: jobsCount }, { count: locsCount }] = await Promise.all([
                    supabase.from("contacts").select("id", {
                        count: "exact",
                        head: true
                    }).eq("customer_id", id).eq("org_id", orgId),
                    supabase.from("opportunities").select("id", {
                        count: "exact",
                        head: true
                    }).eq("customer_id", id).eq("org_id", orgId),
                    supabase.from("jobs").select("id", {
                        count: "exact",
                        head: true
                    }).eq("customer_id", id).eq("org_id", orgId),
                    supabase.from("locations").select("id", {
                        count: "exact",
                        head: true
                    }).eq("customer_id", id).eq("org_id", orgId)
                ]);
                const { data: jobRows } = await supabase.from("jobs").select("id").eq("customer_id", id).eq("org_id", orgId);
                const jobIds = (jobRows ?? []).map((j)=>j.id);
                let schedulesCount = 0;
                if (jobIds.length > 0) {
                    const { count } = await supabase.from("schedules").select("id", {
                        count: "exact",
                        head: true
                    }).in("job_id", jobIds).eq("org_id", orgId);
                    schedulesCount = count ?? 0;
                }
                out._counts = {
                    contacts: contactsCount ?? 0,
                    opportunities: oppCount ?? 0,
                    jobs: jobsCount ?? 0,
                    schedules: schedulesCount,
                    locations: locsCount ?? 0
                };
            }
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$entityFieldRegistryAttach$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["attachFieldDefinitionsAndValues"])(supabase, out, "customers", id);
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$relationshipDisplayAttach$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["attachDirectFkRelationshipDisplays"])(supabase, orgId, "customers", out);
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json(out);
        }
        if (type === "schedules") {
            if (id === "new") {
                return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                    _create: true
                });
            }
            const { data: schedule, error } = await supabase.from("schedules").select("*").eq("id", id).eq("org_id", orgId).single();
            if (error || !schedule) return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json(error?.message || "Not found", {
                status: error?.code === "PGRST116" ? 404 : 500
            });
            const out = {
                ...schedule
            };
            const scheduleLocationId = schedule.location_id;
            const jobId = schedule.job_id;
            if (jobId) {
                const { data: job } = await supabase.from("jobs").select("id, title, customer_id, primary_contact_id, primary_person_id, opportunity_id, vertical_id, job_status_id, assigned_vendor_id, location_id, service_key, job_type, gross_price_cents, estimated_total_cents").eq("id", jobId).eq("org_id", orgId).single();
                out._job = job ?? null;
                if (job) {
                    if (job.customer_id) {
                        const { data: cust } = await supabase.from("customers").select("id, name").eq("id", job.customer_id).eq("org_id", orgId).single();
                        out._customer = cust ?? null;
                    } else out._customer = null;
                    const jobPrimaryPersonId = job.primary_person_id;
                    const jobPrimaryContactId = job.primary_contact_id;
                    if (jobPrimaryPersonId) {
                        const { data: person } = await supabase.from("persons").select("id, first_name, last_name, email, phone").eq("id", jobPrimaryPersonId).eq("org_id", orgId).maybeSingle();
                        const p = person;
                        out._primary_person_id = p?.id ?? null;
                        out._primary_person_name = p ? [
                            p.first_name,
                            p.last_name
                        ].filter(Boolean).join(" ").trim() || null : null;
                        out._contact = p ? {
                            id: p.id,
                            first_name: p.first_name,
                            last_name: p.last_name,
                            email: person.email,
                            phone: person.phone,
                            person_id: p.id
                        } : null;
                    } else if (jobPrimaryContactId) {
                        const { data: contact } = await supabase.from("contacts").select("id, first_name, last_name, email, phone, person_id").eq("id", jobPrimaryContactId).eq("org_id", orgId).single();
                        out._contact = contact ?? null;
                        const contactWithPerson = contact;
                        if (contactWithPerson?.person_id) {
                            const { data: person } = await supabase.from("persons").select("id, first_name, last_name").eq("id", contactWithPerson.person_id).eq("org_id", orgId).maybeSingle();
                            const p = person;
                            out._primary_person_id = p?.id ?? null;
                            out._primary_person_name = p ? [
                                p.first_name,
                                p.last_name
                            ].filter(Boolean).join(" ").trim() || null : null;
                        } else {
                            out._primary_person_id = null;
                            out._primary_person_name = null;
                        }
                    } else {
                        out._contact = null;
                        out._primary_person_id = null;
                        out._primary_person_name = null;
                    }
                    if (job.opportunity_id) {
                        const { data: opp } = await supabase.from("opportunities").select("id, name").eq("id", job.opportunity_id).eq("org_id", orgId).single();
                        out._opportunity = opp ?? null;
                    } else out._opportunity = null;
                    if (job.vertical_id) {
                        const { data: vert } = await supabase.from("verticals").select("id, name, slug").eq("id", job.vertical_id).single();
                        out._vertical = vert ?? null;
                    } else out._vertical = null;
                }
            } else {
                out._job = null;
                out._customer = null;
                out._contact = null;
                out._opportunity = null;
                out._vertical = null;
            }
            const { data: assignment } = await supabase.from("assignments").select("id, schedule_id, job_id, vendor_id, assignment_status_id, created_at").eq("schedule_id", id).eq("org_id", orgId).maybeSingle();
            out._assignment = assignment ?? null;
            if (assignment) {
                out._vendor = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$hydrateVendorDisplayStub$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["hydrateVendorDisplayStub"])(supabase, assignment.vendor_id, orgId);
                const statusId = assignment.assignment_status_id;
                if (statusId) {
                    const { data: st } = await supabase.from("assignment_statuses").select("id, key, label").eq("id", statusId).single();
                    out._assignment_status = st ?? null;
                } else out._assignment_status = null;
            } else {
                out._vendor = null;
                out._assignment_status = null;
            }
            if (!out._assignment && jobId) {
                const job = out._job;
                const jobVendorId = job?.assigned_vendor_id ?? null;
                if (jobVendorId) {
                    out._job_assigned_vendor = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$hydrateVendorDisplayStub$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["hydrateVendorDisplayStub"])(supabase, jobVendorId, orgId);
                } else {
                    out._job_assigned_vendor = null;
                }
            } else {
                out._job_assigned_vendor = null;
            }
            const effectiveLocationId = scheduleLocationId ?? out._job?.location_id ?? null;
            out._location_id = effectiveLocationId ?? null;
            if (effectiveLocationId) {
                const { data: loc } = await supabase.from("locations").select("id, label, address1, city, state, postal_code").eq("id", effectiveLocationId).eq("org_id", orgId).maybeSingle();
                if (loc) {
                    const l = loc;
                    out._location_label = l.label ?? ([
                        l.address1,
                        l.city,
                        l.postal_code
                    ].filter(Boolean).join(", ") || null);
                    out._location_name = out._location_label;
                    out._location = loc;
                } else {
                    out._location_label = null;
                    out._location_name = null;
                    out._location = null;
                }
            } else {
                out._location_label = null;
                out._location_name = null;
                out._location = null;
            }
            const sched = schedule;
            const jobRef = out._job;
            const vertRef = out._vertical;
            const jobTitle = jobRef?.title?.trim() || null;
            const vertName = vertRef?.name?.trim() || null;
            const startRaw = sched.start_at ? String(sched.start_at) : "";
            const endRaw = sched.end_at ? String(sched.end_at) : "";
            const timePart = startRaw && endRaw ? `${startRaw.slice(0, 10)} ${startRaw.slice(11, 16)}–${endRaw.slice(11, 16)}` : startRaw ? `${startRaw.slice(0, 10)} ${startRaw.slice(11, 16)}` : null;
            const titleParts = [
                jobTitle,
                vertName,
                timePart
            ].filter(Boolean);
            out._schedule_display_title = titleParts.length > 0 ? titleParts.join(" · ") : "Schedule";
            let schedStatusKey = schedule.status_key;
            const schedStatusFk = schedule.schedule_status_id;
            if ((!schedStatusKey || !String(schedStatusKey).trim()) && schedStatusFk) {
                const { data: sst } = await supabase.from("schedule_statuses").select("key, label").eq("id", schedStatusFk).maybeSingle();
                const row = sst;
                if (row?.key && String(row.key).trim()) {
                    schedStatusKey = String(row.key).trim();
                    out.status_key = schedStatusKey;
                }
                if (row?.label && String(row.label).trim()) {
                    out._schedule_status_label = String(row.label).trim();
                }
            }
            const schedOrgId = schedule.org_id;
            out._status_display = schedOrgId ? await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$statusDefinitionsResolve$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__["resolveStatusLabel"])(supabase, schedOrgId, "schedules", schedStatusKey) : typeof schedStatusKey === "string" && schedStatusKey.trim() ? schedStatusKey.trim() : null;
            const jt = jobRef?.title?.trim() || null;
            out._job_title = jt;
            const subId = schedule.customer_subscription_id;
            if (subId) {
                const { data: subRow } = await supabase.from("customer_subscriptions").select("id, customer_id, vertical_id, cadence, interval").eq("id", subId).eq("org_id", orgId).maybeSingle();
                const sr = subRow;
                if (sr?.customer_id) {
                    const freq = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminFormatters$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["formatFrequencyLabel"])(sr.cadence ?? "month", Math.max(1, Number(sr.interval) || 1));
                    const parts = [];
                    const { data: custRow } = await supabase.from("customers").select("name").eq("id", sr.customer_id).eq("org_id", orgId).maybeSingle();
                    const custName = custRow?.name?.trim();
                    if (custName) parts.push(custName);
                    if (sr.vertical_id) {
                        const { data: vertRow } = await supabase.from("verticals").select("name").eq("id", sr.vertical_id).maybeSingle();
                        const vertName = vertRow?.name?.trim();
                        if (vertName) parts.push(vertName);
                    }
                    parts.push(freq);
                    out._customer_subscription_label = parts.join(" · ");
                } else {
                    out._customer_subscription_label = `Subscription ${subId.slice(0, 8)}…`;
                }
            } else {
                out._customer_subscription_label = null;
            }
            const vStub = out._vendor;
            const jvStub = out._job_assigned_vendor;
            let assignedVendorName = vStub?.name ?? jvStub?.name ?? null;
            const scheduleRowVendorId = schedule.assigned_vendor_id ?? null;
            if (!assignedVendorName && scheduleRowVendorId) {
                const rowStub = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$hydrateVendorDisplayStub$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["hydrateVendorDisplayStub"])(supabase, scheduleRowVendorId, orgId);
                assignedVendorName = rowStub?.name ?? null;
            }
            out._assigned_vendor_name = assignedVendorName;
            const assignVid = assignment?.vendor_id ?? null;
            if (!out.assigned_vendor_id && assignVid) {
                out.assigned_vendor_id = assignVid;
            }
            out._service_home_type_label = null;
            out._service_square_footage_display = null;
            out._service_bedrooms = null;
            out._service_bathrooms = null;
            if (jobId) {
                const { data: cjdSched } = await supabase.from("cleaning_job_details").select("*").eq("job_id", jobId).maybeSingle();
                const sd = cjdSched;
                if (sd) {
                    out._service_bedrooms = sd.beds ?? null;
                    out._service_bathrooms = sd.baths ?? null;
                    if (sd.home_type_key) {
                        out._service_home_type_label = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$optionItemLabelForOrg$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["optionItemLabelForOrg"])(supabase, orgId, "home_type", sd.home_type_key);
                    }
                    let bandLabel = "";
                    if (sd.square_footage_tier_key) {
                        bandLabel = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$optionItemLabelForOrg$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["optionItemLabelForOrg"])(supabase, orgId, "square_footage_tier", sd.square_footage_tier_key) ?? "";
                    }
                    out._service_square_footage_display = bandLabel.trim() || null;
                }
            }
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$entityFieldRegistryAttach$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["attachFieldDefinitionsAndValues"])(supabase, out, "schedules", id);
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$relationshipDisplayAttach$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["attachDirectFkRelationshipDisplays"])(supabase, orgId, "schedules", out);
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$scheduleRecordSnapshot$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["computeScheduleHydratedDisplay"])(out);
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json(out);
        }
        if (type === "locations") {
            const { data: location, error } = await supabase.from("locations").select("*").eq("id", id).eq("org_id", orgId).single();
            if (error || !location) {
                return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json(error?.code === "PGRST116" ? "Not found" : error?.message ?? "Not found", {
                    status: 404
                });
            }
            const out = {
                ...location
            };
            const locSk = location.status_key;
            out._status_display = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$statusDefinitionsResolve$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__["resolveStatusLabel"])(supabase, orgId, "locations", locSk);
            const locationTypeId = location.location_type_id;
            if (locationTypeId) {
                const { data: typeRow } = await supabase.from("location_types").select("label").eq("id", locationTypeId).maybeSingle();
                out._location_type_label = typeRow?.label ?? null;
            } else {
                out._location_type_label = null;
            }
            const customerId = location.customer_id;
            if (customerId) {
                const { data: cust } = await supabase.from("customers").select("id, name").eq("id", customerId).eq("org_id", orgId).maybeSingle();
                out._customer = cust ?? null;
                out._customer_name = cust?.name ?? null;
            } else {
                out._customer = null;
                out._customer_name = null;
            }
            const { data: plRows } = await supabase.from("person_locations").select("person_id, is_primary, relationship_type").eq("location_id", id).eq("org_id", orgId);
            const plList = plRows ?? [];
            const personIdsFromPl = [
                ...new Set(plList.map((r)=>r.person_id))
            ];
            const { data: personRowsForLoc } = personIdsFromPl.length > 0 ? await supabase.from("persons").select("id, first_name, last_name, full_name, email").eq("org_id", orgId).in("id", personIdsFromPl) : {
                data: []
            };
            const personNameById = new Map((personRowsForLoc ?? []).map((p)=>{
                const nm = p.full_name && String(p.full_name).trim() || [
                    p.first_name,
                    p.last_name
                ].filter(Boolean).join(" ").trim() || p.email && String(p.email).trim() || null;
                return [
                    p.id,
                    nm
                ];
            }));
            out._linked_persons = plList.map((row)=>({
                    person_id: row.person_id,
                    _person_name: personNameById.get(row.person_id) ?? null,
                    is_primary: !!row.is_primary,
                    relationship_type: row.relationship_type ?? null
                }));
            const accessMethodKey = location.access_method_key;
            const accessMethodId = location.access_method_id;
            if (accessMethodKey) {
                out._access_method_label = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$optionItemLabelForOrg$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["optionItemLabelForOrg"])(supabase, orgId, "access_method", accessMethodKey);
            } else if (accessMethodId) {
                const { data: amRow } = await supabase.from("access_methods").select("label").eq("id", accessMethodId).maybeSingle();
                out._access_method_label = amRow?.label ?? null;
            } else {
                out._access_method_label = null;
            }
            out._service_home_type_label = null;
            out._service_sqft_band_label = null;
            out._service_square_footage = null;
            out._service_square_footage_display = null;
            out._service_bedrooms = null;
            out._service_bathrooms = null;
            out._service_details_job_id = null;
            const { data: latestJob } = await supabase.from("jobs").select("id").eq("location_id", id).eq("org_id", orgId).order("created_at", {
                ascending: false
            }).limit(1).maybeSingle();
            const latestJobId = latestJob?.id ?? null;
            if (latestJobId) {
                const { data: cjd } = await supabase.from("cleaning_job_details").select("*").eq("job_id", latestJobId).maybeSingle();
                const details = cjd;
                if (details) {
                    out._service_details_job_id = latestJobId;
                    out._service_bedrooms = details.beds ?? null;
                    out._service_bathrooms = details.baths ?? null;
                    out._service_square_footage = null;
                    if (details.home_type_key) {
                        out._service_home_type_label = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$optionItemLabelForOrg$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["optionItemLabelForOrg"])(supabase, orgId, "home_type", details.home_type_key);
                    }
                    if (details.square_footage_tier_key) {
                        out._service_sqft_band_label = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$optionItemLabelForOrg$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["optionItemLabelForOrg"])(supabase, orgId, "square_footage_tier", details.square_footage_tier_key);
                    }
                    const bandLabel = out._service_sqft_band_label != null ? String(out._service_sqft_band_label).trim() : "";
                    out._service_square_footage_display = bandLabel || null;
                }
            }
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$entityFieldRegistryAttach$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["attachFieldDefinitionsAndValues"])(supabase, out, "locations", id);
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$relationshipDisplayAttach$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["attachDirectFkRelationshipDisplays"])(supabase, orgId, "locations", out);
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json(out);
        }
        if (type === "discount_redemptions") {
            const dr = await assertDiscountRedemptionInOrg(supabase, id, orgId);
            if (!dr.ok) return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json("Not found", {
                status: 404
            });
            const redemption = dr.row;
            const out = {
                ...redemption
            };
            const codeId = redemption.discount_code_id;
            if (codeId) {
                const { data: dc } = await supabase.from("discount_codes").select("code, discount_type, discount_value, is_active, first_job_only").eq("id", codeId).maybeSingle();
                const c = dc;
                out._code = c?.code ?? null;
                out._discount_type = c?.discount_type ?? null;
                const val = c?.discount_value;
                if (c?.discount_type === "percent" && val != null) out._discount_value = `${Number(val)}%`;
                else if (val != null) out._discount_value = typeof val === "number" ? `$${val.toFixed(2)}` : String(val);
                else out._discount_value = null;
            } else {
                out._code = null;
                out._discount_type = null;
                out._discount_value = null;
            }
            if (redemption.customer_id) {
                const { data: cust } = await supabase.from("customers").select("name").eq("id", redemption.customer_id).eq("org_id", orgId).maybeSingle();
                out._customer_name = cust?.name ?? null;
            } else out._customer_name = null;
            if (redemption.contact_id) {
                const { data: contact } = await supabase.from("contacts").select("first_name, last_name, person_id").eq("id", redemption.contact_id).eq("org_id", orgId).maybeSingle();
                const ct = contact;
                out._contact_name = ct ? [
                    ct.first_name,
                    ct.last_name
                ].filter(Boolean).join(" ") || null : null;
                if (ct?.person_id) {
                    const { data: person } = await supabase.from("persons").select("id, first_name, last_name").eq("id", ct.person_id).eq("org_id", orgId).maybeSingle();
                    const p = person;
                    out._person_id = p?.id ?? null;
                    out._person_name = p ? [
                        p.first_name,
                        p.last_name
                    ].filter(Boolean).join(" ").trim() || null : null;
                } else {
                    out._person_id = null;
                    out._person_name = null;
                }
            } else {
                out._contact_name = null;
                out._person_id = null;
                out._person_name = null;
            }
            if (redemption.opportunity_id) {
                const { data: opp } = await supabase.from("opportunities").select("name").eq("id", redemption.opportunity_id).eq("org_id", orgId).maybeSingle();
                out._opportunity_name = opp?.name ?? null;
            } else out._opportunity_name = null;
            if (redemption.job_id) {
                const { data: job } = await supabase.from("jobs").select("id, title, service_key, job_number_for_customer").eq("id", redemption.job_id).eq("org_id", orgId).maybeSingle();
                const j = job;
                out._job_label = j ? j.title && String(j.title).trim() || j.service_key && String(j.service_key).trim() || j.job_number_for_customer && String(j.job_number_for_customer).trim() || `Job #${redemption.job_id.slice(-6)}` : null;
            } else out._job_label = null;
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json(out);
        }
        if (type === "workflows") {
            if (id === "new") {
                return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                    _create: true
                });
            }
            const { data: wf, error: wErr } = await supabase.from("workflows").select("*").eq("id", id).eq("org_id", orgId).single();
            if (wErr || !wf) return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json(wErr?.message || "Not found", {
                status: wErr?.code === "PGRST116" ? 404 : 500
            });
            const { data: cond } = await supabase.from("workflow_conditions").select("*").eq("workflow_id", id);
            const { data: acts } = await supabase.from("workflow_actions").select("*").eq("workflow_id", id).order("action_order", {
                ascending: true
            });
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                ...wf,
                _conditions: cond ?? [],
                _actions: acts ?? []
            });
        }
        if (type === "vendors") {
            const { data: vendor, error: vErr } = await supabase.from("vendors").select("*").eq("id", id).eq("org_id", orgId).single();
            if (vErr || !vendor) return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json(vErr?.message || "Not found", {
                status: vErr?.code === "PGRST116" ? 404 : 500
            });
            const v = vendor;
            const out = {
                ...vendor
            };
            const vOrgId = orgId;
            out._vendor_status_label = null;
            out._status_display = vOrgId ? await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$statusDefinitionsResolve$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__["resolveStatusLabel"])(supabase, vOrgId, "vendors", v.status_key ?? v.status ?? null) : v.status_key ?? v.status ?? null;
            if (vOrgId) {
                try {
                    const vDefs = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$statusDefinitionsResolve$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__["fetchEffectiveStatusDefinitions"])(supabase, vOrgId, "vendors", {
                        activeOnly: true
                    });
                    out._vendor_status_options = vDefs.map((d)=>({
                            id: d.id,
                            key: d.status_key,
                            label: d.status_label?.trim() || d.status_key
                        }));
                } catch  {
                    out._vendor_status_options = [];
                }
            } else {
                out._vendor_status_options = [];
            }
            const directPersonId = v.primary_person_id ?? null;
            const primaryContactId = v.primary_contact_id ?? null;
            let personLite = null;
            if (directPersonId) {
                const { data: pDirect } = await supabase.from("persons").select("id, first_name, last_name").eq("id", directPersonId).eq("org_id", orgId).maybeSingle();
                personLite = pDirect ?? null;
            }
            if (primaryContactId) {
                const { data: pc } = await supabase.from("contacts").select("id, first_name, last_name, email, phone, person_id").eq("id", primaryContactId).eq("org_id", orgId).single();
                const c = pc;
                out._primary_contact = pc;
                out._primary_contact_name = c ? [
                    c.first_name,
                    c.last_name
                ].filter(Boolean).join(" ").trim() || null : null;
                out._primary_contact_email = c?.email ?? null;
                out._primary_contact_phone = c?.phone ?? null;
                if (!personLite && c?.person_id) {
                    const { data: pFromContact } = await supabase.from("persons").select("id, first_name, last_name").eq("id", c.person_id).eq("org_id", orgId).maybeSingle();
                    personLite = pFromContact ?? null;
                }
            } else {
                out._primary_contact = null;
                out._primary_contact_name = null;
                out._primary_contact_email = null;
                out._primary_contact_phone = null;
            }
            if (personLite) {
                out._primary_person_id = personLite.id;
                out._primary_person_name = [
                    personLite.first_name,
                    personLite.last_name
                ].filter(Boolean).join(" ").trim() || null;
            } else {
                out._primary_person_id = null;
                out._primary_person_name = null;
            }
            const { data: jobsCountRows } = await supabase.from("jobs").select("id").eq("assigned_vendor_id", id).eq("org_id", orgId);
            out._jobs_count = (jobsCountRows ?? []).length;
            const JOBS_LIMIT = 25;
            const { data: vendorJobs } = await supabase.from("jobs").select("id, created_at, title, scheduled_at, status_key, job_status_id, gross_price_cents, recurring_total_cents, opportunity_id, assigned_vendor_id, estimated_total_cents, discount_amount, discounted").eq("assigned_vendor_id", id).eq("org_id", orgId).order("created_at", {
                ascending: false
            }).limit(JOBS_LIMIT);
            let jobStatusLabelByKey = new Map();
            if (vOrgId) {
                try {
                    const defs = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$statusDefinitionsResolve$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__["fetchEffectiveStatusDefinitions"])(supabase, vOrgId, "jobs", {
                        activeOnly: true
                    });
                    jobStatusLabelByKey = new Map(defs.map((d)=>[
                            d.status_key,
                            d.status_label && d.status_label.trim() || d.status_key
                        ]));
                } catch  {
                    jobStatusLabelByKey = new Map();
                }
            }
            out._vendor_jobs = (vendorJobs ?? []).map((row)=>{
                const jsk = row.status_key;
                const jskTrim = jsk && String(jsk).trim() ? String(jsk).trim() : null;
                return {
                    ...row,
                    _job_status_label: jskTrim ? jobStatusLabelByKey.get(jskTrim) ?? jskTrim : null,
                    display_total_cents: (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$jobDisplayPrice$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["computeJobDisplayTotalCents"])(row)
                };
            });
            const jobIds = (vendorJobs ?? []).map((j)=>j.id);
            const { data: vendorSchedules } = jobIds.length > 0 ? await supabase.from("schedules").select("id, job_id, start_at, end_at, timezone").in("job_id", jobIds).eq("org_id", orgId).order("start_at", {
                ascending: false
            }) : {
                data: []
            };
            out._vendor_schedules = vendorSchedules ?? [];
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$entityFieldRegistryAttach$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["attachFieldDefinitionsAndValues"])(supabase, out, "vendors", id);
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$relationshipDisplayAttach$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["attachDirectFkRelationshipDisplays"])(supabase, orgId, "vendors", out);
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json(out);
        }
        if (type === "subscriptions") {
            const { data: sub, error: subErr } = await supabase.from("customer_subscriptions").select("*").eq("id", id).eq("org_id", orgId).single();
            if (subErr || !sub) return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json(subErr?.message || "Not found", {
                status: subErr?.code === "PGRST116" ? 404 : 500
            });
            const out = {
                ...sub
            };
            const cadence = sub.cadence ?? "month";
            const interval = Math.max(1, Number(sub.interval) || 1);
            const { formatFrequencyLabel } = await __turbopack_context__.A("[project]/lib/adminFormatters.ts [app-route] (ecmascript, async loader)");
            out._frequency_label = formatFrequencyLabel(cadence, interval);
            out._cadence = cadence;
            out._interval = interval;
            const customerId = sub.customer_id;
            if (customerId) {
                const { data: cust } = await supabase.from("customers").select("name, org_id").eq("id", customerId).eq("org_id", orgId).maybeSingle();
                out._customer_name = cust?.name ?? null;
            } else {
                out._customer_name = null;
            }
            const subStatus = sub.status ?? null;
            out._status_display = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$statusDefinitionsResolve$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__["resolveStatusLabel"])(supabase, orgId, "subscriptions", subStatus);
            const { data: scheds } = await supabase.from("schedules").select("id, job_id, start_at, end_at, timezone, subscription_sequence, rescheduled_from_schedule_id, canceled_at, canceled_by, cancel_reason").eq("customer_subscription_id", id).eq("org_id", orgId).order("subscription_sequence", {
                ascending: true
            });
            out._schedules = scheds ?? [];
            out._ref = `SUB-${String(id).slice(-8)}`;
            const schedList = scheds ?? [];
            const upcoming = schedList.find((s)=>s.start_at && !s.canceled_at);
            out._scheduled_for = upcoming?.start_at ?? schedList[0]?.start_at ?? null;
            out.service_type = sub.service_type ?? sub.service_key ?? null;
            const subPcId = sub.primary_contact_id ?? null;
            if (subPcId) {
                const { data: sct } = await supabase.from("contacts").select("first_name, last_name").eq("id", subPcId).eq("org_id", orgId).maybeSingle();
                const sc = sct;
                out._primary_contact_name = sc ? [
                    sc.first_name,
                    sc.last_name
                ].filter(Boolean).join(" ").trim() || null : null;
            } else {
                out._primary_contact_name = null;
            }
            const subVertId = sub.vertical_id ?? null;
            if (subVertId) {
                const { data: sv } = await supabase.from("verticals").select("name").eq("id", subVertId).maybeSingle();
                out._vertical_name = sv?.name ?? null;
            } else {
                out._vertical_name = null;
            }
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json(out);
        }
        if (type === "documents") {
            const { data: doc, error: docErr } = await supabase.from("documents").select("*").eq("id", id).eq("org_id", orgId).maybeSingle();
            if (docErr || !doc) {
                return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json(docErr?.message || "Not found", {
                    status: docErr?.code === "PGRST116" ? 404 : 500
                });
            }
            const row = doc;
            const out = {
                ...row
            };
            const n = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$normalizeDocumentRow$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["normalizeDocumentRow"])(row);
            out.name = n.name;
            out.original_filename = n.original_filename;
            out.document_type = n.document_type;
            out.uploaded_at = n.uploaded_at;
            out.status = n.status;
            const docDefsForRow = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$statusDefinitionsResolve$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__["fetchEffectiveStatusDefinitions"])(supabase, orgId, "documents", {
                activeOnly: true
            });
            const docUi = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$statusDefinitionsResolve$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__["inferDocumentStatusFromStored"])(docDefsForRow, n.status);
            out.status_key = docUi.inferredKey;
            out._status_display = docUi.display;
            out._ref = `DOC-${String(id).slice(-8)}`;
            const et = row.entity_type?.trim() ?? null;
            const eid = row.entity_id?.trim() ?? null;
            out._linked_record_type = et;
            if (et && eid) {
                const labelKey = `${et}:${eid}`;
                const labelMap = new Map();
                if (et === "customer") {
                    const { data: c } = await supabase.from("customers").select("id, name").eq("id", eid).eq("org_id", orgId).maybeSingle();
                    if (c) labelMap.set(labelKey, c.name?.trim() || `Customer ${eid.slice(0, 8)}…`);
                } else if (et === "vendor") {
                    const { data: v } = await supabase.from("vendors").select("id, name").eq("id", eid).eq("org_id", orgId).maybeSingle();
                    if (v) labelMap.set(labelKey, v.name?.trim() || `Vendor ${eid.slice(0, 8)}…`);
                } else if (et === "job") {
                    const { data: j } = await supabase.from("jobs").select("id, title").eq("id", eid).eq("org_id", orgId).maybeSingle();
                    if (j) labelMap.set(labelKey, j.title?.trim() || `Job ${eid.slice(0, 8)}…`);
                } else if (et === "schedule") {
                    const { data: s } = await supabase.from("schedules").select("id, start_at").eq("id", eid).eq("org_id", orgId).maybeSingle();
                    if (s) {
                        const st = s.start_at;
                        labelMap.set(labelKey, st ? `Visit ${new Date(st).toLocaleString()}` : `Schedule ${eid.slice(0, 8)}…`);
                    }
                } else if (et === "opportunity") {
                    const { data: o } = await supabase.from("opportunities").select("id, name").eq("id", eid).eq("org_id", orgId).maybeSingle();
                    if (o) labelMap.set(labelKey, o.name?.trim() || `Opportunity ${eid.slice(0, 8)}…`);
                } else if (et === "contact") {
                    const { data: c } = await supabase.from("contacts").select("id, first_name, last_name, email").eq("id", eid).eq("org_id", orgId).maybeSingle();
                    if (c) {
                        const cr = c;
                        const nm = [
                            cr.first_name,
                            cr.last_name
                        ].filter(Boolean).join(" ").trim() || cr.email?.trim() || null;
                        labelMap.set(labelKey, nm || `Contact ${eid.slice(0, 8)}…`);
                    }
                } else if (et === "person") {
                    const { data: p } = await supabase.from("persons").select("id, first_name, last_name, email, full_name").eq("id", eid).eq("org_id", orgId).maybeSingle();
                    if (p) {
                        const pr = p;
                        const nm = pr.full_name && String(pr.full_name).trim() || [
                            pr.first_name,
                            pr.last_name
                        ].filter(Boolean).join(" ").trim() || pr.email?.trim() || null;
                        labelMap.set(labelKey, nm || `Person ${eid.slice(0, 8)}…`);
                    }
                }
                out._linked_record_label = labelMap.get(labelKey) ?? null;
            } else {
                out._linked_record_label = null;
            }
            const exStatus = row.extraction_status ?? row.ai_extraction_status ?? null;
            out._ai_extraction_status = exStatus;
            out._uploaded_by = row.uploaded_by ?? null;
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json(out);
        }
        if (type === "payments") {
            const { data, error } = await supabase.from("payments").select("*").eq("id", id).eq("org_id", orgId).single();
            if (error || !data) return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json(error?.message || "Not found", {
                status: error?.code === "PGRST116" ? 404 : 500
            });
            const payment = data;
            const out = {
                ...payment
            };
            const procRef = payment.processor_transaction_id && String(payment.processor_transaction_id).trim() || payment.provider_payment_id && String(payment.provider_payment_id).trim();
            out._payment_label = procRef || `Payment #${payment.id.slice(-6)}`;
            const amountCents = typeof payment.amount_cents === "bigint" ? Number(payment.amount_cents) : Math.round(Number(payment.amount_cents) || 0);
            const rollup = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$jobPaymentBalances$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["getPaymentAllocationRollup"])(supabase, orgId, id, amountCents);
            out._allocation_summary = {
                allocated_amount_cents: rollup.allocated_amount_cents,
                unallocated_amount_cents: rollup.unallocated_amount_cents,
                allocation_state: rollup.allocation_state
            };
            const { data: allocRows } = await supabase.from("payment_allocations").select("id, target_entity_type, target_entity_id, allocated_amount_cents, status, allocation_type, allocated_at, reversed_at").eq("org_id", orgId).eq("payment_id", id).order("allocated_at", {
                ascending: false
            });
            out._allocations = allocRows ?? [];
            if (payment.customer_id) {
                const { data: cust } = await supabase.from("customers").select("name").eq("id", payment.customer_id).eq("org_id", orgId).maybeSingle();
                out._customer_name = cust?.name ?? null;
            } else {
                out._customer_name = null;
            }
            let primaryJobId = payment.job_id ?? null;
            if (!primaryJobId && allocRows && allocRows.length > 0) {
                const jobAlloc = allocRows.find((a)=>String(a.target_entity_type ?? "").toLowerCase() === "job");
                if (jobAlloc?.target_entity_id) primaryJobId = String(jobAlloc.target_entity_id);
            }
            if (primaryJobId) {
                const { data: job } = await supabase.from("jobs").select("id, title, service_key, job_number_for_customer").eq("id", primaryJobId).eq("org_id", orgId).maybeSingle();
                const j = job;
                out._job_label = j ? j.title && String(j.title).trim() || j.service_key && String(j.service_key).trim() || j.job_number_for_customer && String(j.job_number_for_customer).trim() || `Job #${primaryJobId.slice(-6)}` : null;
            } else {
                out._job_label = null;
            }
            const canon = payment.status != null && String(payment.status).trim() !== "" ? String(payment.status).trim().toLowerCase() : "";
            const canonicalLabels = {
                pending: "Pending",
                posted: "Posted",
                failed: "Failed",
                voided: "Voided"
            };
            const paySk = payment.status_key ?? null;
            const legacyDisplay = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$statusDefinitionsResolve$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__["resolveStatusLabel"])(supabase, orgId, "payments", paySk);
            out._status_display = canon && canonicalLabels[canon] || legacyDisplay || canon || paySk || null;
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json(out);
        }
        if (type === "customer_members") {
            if (id === "new") {
                return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                    _create: true
                });
            }
            const { data: row, error: rowErr } = await supabase.from("customer_members").select("*").eq("id", id).eq("org_id", orgId).maybeSingle();
            if (rowErr || !row) {
                return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json(rowErr?.code === "PGRST116" ? "Not found" : rowErr?.message ?? "Not found", {
                    status: 404
                });
            }
            const out = {
                ...row
            };
            const personId = row.person_id ?? null;
            if (personId) {
                const { data: personRow } = await supabase.from("persons").select("id, first_name, last_name, email, phone, created_at, updated_at").eq("id", personId).eq("org_id", orgId).maybeSingle();
                if (personRow) {
                    out._person = personRow;
                    out._person_id = personRow.id;
                    const p = personRow;
                    out._person_name = [
                        p.first_name,
                        p.last_name
                    ].filter(Boolean).join(" ").trim() || null;
                } else {
                    out._person = null;
                    out._person_id = null;
                    out._person_name = null;
                }
            } else {
                out._person = null;
                out._person_id = null;
                out._person_name = null;
            }
            const customerId = row.customer_id;
            if (customerId) {
                const { data: cust } = await supabase.from("customers").select("name").eq("id", customerId).eq("org_id", orgId).maybeSingle();
                out._customer_name = cust?.name ?? null;
            } else {
                out._customer_name = null;
            }
            const relationshipKey = row.relationship ?? null;
            if (relationshipKey) {
                const { data: relRow } = await supabase.from("customer_member_relationship_types").select("label").eq("org_id", orgId).eq("key", relationshipKey).maybeSingle();
                out._relationship_label = relRow?.label ?? relationshipKey;
            } else {
                out._relationship_label = null;
            }
            const dob = row.dob ?? null;
            if (dob && dob.trim()) {
                const d = new Date(dob);
                if (!Number.isNaN(d.getTime())) {
                    const today = new Date();
                    let age = today.getFullYear() - d.getFullYear();
                    if (today.getMonth() < d.getMonth() || today.getMonth() === d.getMonth() && today.getDate() < d.getDate()) age--;
                    out._age = age >= 0 ? age : null;
                } else {
                    out._age = null;
                }
            } else {
                out._age = null;
            }
            const { data: linkRows } = await supabase.from("customer_member_contacts").select("id, contact_id, role_key, is_active, contact:contacts(id, first_name, last_name, email, phone)").eq("org_id", orgId).eq("customer_member_id", id);
            const roleKeys = [
                ...new Set((linkRows ?? []).map((l)=>l.role_key).filter(Boolean))
            ];
            const { data: roleRows } = roleKeys.length ? await supabase.from("customer_member_contact_roles").select("role_key, label").eq("org_id", orgId).in("role_key", roleKeys) : {
                data: []
            };
            const roleLabelMap = new Map((roleRows ?? []).map((r)=>[
                    r.role_key,
                    r.label ?? r.role_key
                ]));
            out._linked_contacts = (linkRows ?? []).map((l)=>{
                const contact = l.contact ?? l.contacts;
                const name = contact ? [
                    contact.first_name,
                    contact.last_name
                ].filter(Boolean).join(" ") || contact.email || contact.phone || null : null;
                return {
                    contact_id: l.contact_id,
                    contact_name: name,
                    email: contact?.email ?? null,
                    phone: contact?.phone ?? null,
                    role_key: l.role_key ?? null,
                    role_label: l.role_key ? roleLabelMap.get(l.role_key) ?? l.role_key : null,
                    is_active: l.is_active ?? true
                };
            });
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json(out);
        }
        if (type === "persons") {
            if (id === "new") {
                return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                    _create: true
                });
            }
            const { data: personRow, error: personErr } = await supabase.from("persons").select("*").eq("id", id).eq("org_id", orgId).maybeSingle();
            if (personErr || !personRow) {
                return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json(personErr?.code === "PGRST116" ? "Not found" : personErr?.message ?? "Not found", {
                    status: 404
                });
            }
            const out = {
                ...personRow
            };
            const p = personRow;
            out._person_name = p.full_name && p.full_name.trim() || [
                p.first_name,
                p.last_name
            ].filter(Boolean).join(" ").trim() || null;
            const psk = personRow.status_key ?? null;
            out._status_display = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$statusDefinitionsResolve$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__["resolveStatusLabel"])(supabase, orgId, "persons", psk);
            const { data: cpRows } = await supabase.from("customer_persons").select("id, customer_id, person_id, role_type, created_at").eq("person_id", id).eq("org_id", orgId);
            const customerIds = [
                ...new Set((cpRows ?? []).map((r)=>r.customer_id))
            ];
            const roleKeys = [
                ...new Set((cpRows ?? []).map((r)=>r.role_type).filter(Boolean))
            ];
            const [customerRowsRes, roleTypesRes] = await Promise.all([
                customerIds.length > 0 ? supabase.from("customers").select("id, name").in("id", customerIds).eq("org_id", orgId) : {
                    data: []
                },
                roleKeys.length > 0 ? supabase.from("customer_person_role_types").select("key, label").eq("org_id", orgId).in("key", roleKeys) : {
                    data: []
                }
            ]);
            const customerMap = new Map((customerRowsRes.data ?? []).map((c)=>[
                    c.id,
                    c.name ?? null
                ]));
            const roleLabelMap = new Map((roleTypesRes.data ?? []).map((r)=>[
                    r.key,
                    r.label ?? r.key
                ]));
            out._customer_persons = (cpRows ?? []).map((r)=>({
                    ...r,
                    _customer_name: customerMap.get(r.customer_id) ?? null,
                    _role_label: r.role_type ? roleLabelMap.get(r.role_type) ?? r.role_type : null
                }));
            const { data: relRows } = await supabase.from("person_relationships").select("id, from_person_id, to_person_id, relationship_type, created_at").eq("org_id", orgId).or(`from_person_id.eq.${id},to_person_id.eq.${id}`);
            const relTypeKeys = [
                ...new Set((relRows ?? []).map((r)=>r.relationship_type).filter(Boolean))
            ];
            const { data: relTypeRows } = relTypeKeys.length > 0 ? await supabase.from("person_relationship_type_settings").select("key, label").eq("org_id", orgId).in("key", relTypeKeys) : {
                data: []
            };
            const relTypeLabelMap = new Map((relTypeRows ?? []).map((r)=>[
                    r.key,
                    r.label ?? r.key
                ]));
            const otherPersonIds = [
                ...new Set((relRows ?? []).flatMap((r)=>r.from_person_id === id ? [
                        r.to_person_id
                    ] : [
                        r.from_person_id
                    ]))
            ];
            const { data: otherPersons } = otherPersonIds.length > 0 ? await supabase.from("persons").select("id, first_name, last_name").in("id", otherPersonIds).eq("org_id", orgId) : {
                data: []
            };
            const personNameMap = new Map((otherPersons ?? []).map((p)=>[
                    p.id,
                    [
                        p.first_name,
                        p.last_name
                    ].filter(Boolean).join(" ").trim() || null
                ]));
            out._person_relationships = (relRows ?? []).map((r)=>({
                    ...r,
                    _other_person_id: r.from_person_id === id ? r.to_person_id : r.from_person_id,
                    _other_person_name: personNameMap.get(r.from_person_id === id ? r.to_person_id : r.from_person_id) ?? null,
                    _relationship_type_label: r.relationship_type ? relTypeLabelMap.get(r.relationship_type) ?? r.relationship_type : null
                }));
            const PERSON_LIMIT = 25;
            const { data: contactRows } = await supabase.from("contacts").select("id, first_name, last_name, email, phone, customer_id").eq("person_id", id).eq("org_id", orgId).limit(PERSON_LIMIT);
            const { data: memberRows } = await supabase.from("customer_members").select("id, display_name, relationship, customer_id").eq("person_id", id).eq("org_id", orgId).limit(PERSON_LIMIT);
            out._compatibility_contacts = contactRows ?? [];
            out._compatibility_members = memberRows ?? [];
            const { data: plLocRows } = await supabase.from("person_locations").select("location_id, is_primary, relationship_type").eq("person_id", id).eq("org_id", orgId).limit(PERSON_LIMIT);
            const locLinkList = plLocRows ?? [];
            const locIdsFromPl = [
                ...new Set(locLinkList.map((r)=>r.location_id))
            ];
            const { data: locRowsForPerson } = locIdsFromPl.length > 0 ? await supabase.from("locations").select("id, label, postal_code, city, address1").eq("org_id", orgId).in("id", locIdsFromPl) : {
                data: []
            };
            const locLabelById = new Map((locRowsForPerson ?? []).map((l)=>{
                const lbl = l.label && String(l.label).trim() || [
                    l.address1,
                    l.city,
                    l.postal_code
                ].filter(Boolean).join(", ") || null;
                return [
                    l.id,
                    lbl
                ];
            }));
            out._linked_locations = locLinkList.map((row)=>({
                    location_id: row.location_id,
                    _location_label: locLabelById.get(row.location_id) ?? null,
                    is_primary: !!row.is_primary,
                    relationship_type: row.relationship_type ?? null
                }));
            const { data: oppRows } = await supabase.from("opportunities").select("id, name, status_key, job_date, quote_total, created_at").eq("primary_person_id", id).eq("org_id", orgId).order("created_at", {
                ascending: false
            }).limit(PERSON_LIMIT);
            out._linked_opportunities = oppRows ?? [];
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$entityFieldRegistryAttach$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["attachFieldDefinitionsAndValues"])(supabase, out, "persons", id);
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$relationshipDisplayAttach$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["attachDirectFkRelationshipDisplays"])(supabase, orgId, "persons", out);
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json(out);
        }
        if (type === "service_offerings") {
            const { data, error } = await supabase.from("service_offerings").select("*").eq("id", id).eq("org_id", orgId).single();
            if (error || !data) return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json(error?.message || "Not found", {
                status: error?.code === "PGRST116" ? 404 : 500
            });
            const row = data;
            const out = {
                ...row
            };
            out._updated = row.updated_at ?? row.created_at ?? null;
            if (row.vertical_id) {
                const { data: vert } = await supabase.from("verticals").select("id, name, slug").eq("id", row.vertical_id).maybeSingle();
                out._vertical_name = vert?.name ?? vert?.slug ?? null;
            } else {
                out._vertical_name = null;
            }
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json(out);
        }
        if (type === "service_plan_templates") {
            const { data, error } = await supabase.from("service_plan_templates").select("*").eq("id", id).eq("org_id", orgId).single();
            if (error || !data) return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json(error?.message || "Not found", {
                status: error?.code === "PGRST116" ? 404 : 500
            });
            const row = data;
            const out = {
                ...row
            };
            out._updated = row.updated_at ?? row.created_at ?? null;
            out._recurrence_label = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminFormatters$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["formatRecurrenceLabel"])(row.recurrence_unit ?? null, row.recurrence_interval != null ? Math.max(1, Number(row.recurrence_interval) || 1) : null);
            const tplOrgId = row.org_id;
            const tplSk = row.status_key ?? null;
            out._status_display = tplOrgId ? await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$statusDefinitionsResolve$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__["resolveStatusLabel"])(supabase, tplOrgId, "service_plan_templates", tplSk) : tplSk;
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json(out);
        }
        if (type === "addons") {
            const { data, error } = await supabase.from("pricing_addons").select("*").eq("id", id).single();
            if (error || !data) return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json(error?.message || "Not found", {
                status: error?.code === "PGRST116" ? 404 : 500
            });
            const row = data;
            const out = {
                ...row
            };
            out._updated = row.updated_at ?? row.created_at ?? null;
            if (row.vertical_id) {
                const { data: vert } = await supabase.from("verticals").select("id, name, slug").eq("id", row.vertical_id).maybeSingle();
                out._vertical_name = vert?.name ?? vert?.slug ?? null;
            } else {
                out._vertical_name = null;
            }
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json(out);
        }
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: "Invalid type"
        }, {
            status: 400
        });
    } catch (e) {
        console.error("[ADMIN_ENTITY]", e);
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: "Failed to fetch entity"
        }, {
            status: 500
        });
    }
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__af92073b._.js.map