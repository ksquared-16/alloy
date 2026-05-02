module.exports = [
"[project]/contexts/AdminAuthContext.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "AdminAuthProvider",
    ()=>AdminAuthProvider,
    "useAdminAuth",
    ()=>useAdminAuth
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
"use client";
;
;
const AdminAuthContext = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["createContext"])(null);
function useAdminAuth() {
    const ctx = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useContext"])(AdminAuthContext);
    if (!ctx) throw new Error("useAdminAuth must be used within AdminAuthProvider");
    return ctx;
}
function AdminAuthProvider({ userEmail, role, children }) {
    const safeEmail = typeof userEmail === "string" ? userEmail : "Unknown";
    const safeRole = typeof role === "string" ? role : "";
    const canMutate = safeRole === "admin";
    const value = {
        userEmail: safeEmail,
        role: safeRole,
        canMutate
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(AdminAuthContext.Provider, {
        value: value,
        children: children
    }, void 0, false, {
        fileName: "[project]/contexts/AdminAuthContext.tsx",
        lineNumber: 34,
        columnNumber: 9
    }, this);
}
}),
"[project]/contexts/AdminDrawerContext.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "AdminDrawerProvider",
    ()=>AdminDrawerProvider,
    "useAdminDrawer",
    ()=>useAdminDrawer
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
"use client";
;
;
const AdminDrawerContext = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["createContext"])(null);
function useAdminDrawer() {
    const ctx = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useContext"])(AdminDrawerContext);
    if (!ctx) throw new Error("useAdminDrawer must be used within AdminDrawerProvider");
    return ctx;
}
function AdminDrawerProvider({ children }) {
    const [drawer, setDrawer] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])({
        type: null,
        id: null
    });
    const [stack, setStack] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])([]);
    const openDrawer = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((params)=>{
        setDrawer((prev)=>{
            const prevType = prev.type;
            const prevId = prev.id;
            if (prevType != null && prevId != null) {
                setStack((s)=>[
                        ...s,
                        {
                            type: prevType,
                            id: prevId,
                            defaultWorkflowEntityType: prev.defaultWorkflowEntityType,
                            defaultCustomerId: prev.defaultCustomerId,
                            defaultVendorId: prev.defaultVendorId,
                            defaultSchedulePrefill: prev.defaultSchedulePrefill,
                            defaultJobPrefill: prev.defaultJobPrefill,
                            jobRecordSurface: prev.jobRecordSurface,
                            operationalVisualContext: prev.operationalVisualContext,
                            defaultOpportunitySurface: prev.defaultOpportunitySurface,
                            opportunityWorkspaceContext: prev.opportunityWorkspaceContext
                        }
                    ]);
            }
            return {
                type: params.type,
                id: params.id,
                defaultWorkflowEntityType: params.defaultWorkflowEntityType,
                defaultCustomerId: params.defaultCustomerId,
                defaultVendorId: params.defaultVendorId,
                defaultSchedulePrefill: params.defaultSchedulePrefill,
                defaultJobPrefill: params.defaultJobPrefill,
                jobRecordSurface: params.type === "jobs" ? params.jobRecordSurface : undefined,
                operationalVisualContext: params.operationalVisualContext,
                defaultOpportunitySurface: params.defaultOpportunitySurface,
                opportunityWorkspaceContext: params.type === "opportunities" ? params.opportunityWorkspaceContext ?? null : null
            };
        });
    }, []);
    const goBack = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(()=>{
        setStack((s)=>{
            const next = [
                ...s
            ];
            const item = next.pop();
            if (item) {
                setDrawer({
                    type: item.type,
                    id: item.id,
                    defaultWorkflowEntityType: item.defaultWorkflowEntityType,
                    defaultCustomerId: item.defaultCustomerId,
                    defaultVendorId: item.defaultVendorId,
                    defaultSchedulePrefill: item.defaultSchedulePrefill,
                    defaultJobPrefill: item.defaultJobPrefill,
                    jobRecordSurface: item.jobRecordSurface,
                    operationalVisualContext: item.operationalVisualContext,
                    defaultOpportunitySurface: item.defaultOpportunitySurface,
                    opportunityWorkspaceContext: item.opportunityWorkspaceContext
                });
            }
            return next;
        });
    }, []);
    const closeDrawer = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(()=>{
        setDrawer({
            type: null,
            id: null
        });
        setStack([]);
    }, []);
    const previousDrawer = stack.length > 0 ? stack[stack.length - 1] : null;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(AdminDrawerContext.Provider, {
        value: {
            drawer,
            stack,
            canGoBack: stack.length > 0,
            previousDrawer,
            openDrawer,
            goBack,
            closeDrawer
        },
        children: children
    }, void 0, false, {
        fileName: "[project]/contexts/AdminDrawerContext.tsx",
        lineNumber: 208,
        columnNumber: 9
    }, this);
}
}),
"[project]/contexts/AdminVerticalContext.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "AdminVerticalProvider",
    ()=>AdminVerticalProvider,
    "useAdminVertical",
    ()=>useAdminVertical
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
"use client";
;
;
const STORAGE_KEY = "admin_selected_vertical_id";
const AdminVerticalContext = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["createContext"])(null);
function useAdminVertical() {
    const ctx = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useContext"])(AdminVerticalContext);
    if (!ctx) throw new Error("useAdminVertical must be used within AdminVerticalProvider");
    return ctx;
}
function AdminVerticalProvider({ children }) {
    const [verticals, setVerticals] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])([]);
    const [loading, setLoading] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(true);
    const [selectedVerticalId, setSelectedVerticalIdState] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        fetch("/api/admin/verticals").then((res)=>res.ok ? res.json() : []).then((data)=>setVerticals(Array.isArray(data) ? data : [])).catch(()=>setVerticals([])).finally(()=>setLoading(false));
    }, []);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if ("TURBOPACK compile-time truthy", 1) return;
        //TURBOPACK unreachable
        ;
        const stored = undefined;
    }, []);
    const setSelectedVerticalId = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((id)=>{
        setSelectedVerticalIdState(id);
        if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
        ;
    }, []);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(AdminVerticalContext.Provider, {
        value: {
            verticals,
            selectedVerticalId,
            setSelectedVerticalId,
            loading
        },
        children: children
    }, void 0, false, {
        fileName: "[project]/contexts/AdminVerticalContext.tsx",
        lineNumber: 56,
        columnNumber: 9
    }, this);
}
}),
"[project]/contexts/EntityLabelsContext.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "EntityLabelsProvider",
    ()=>EntityLabelsProvider,
    "getEntityLabel",
    ()=>getEntityLabel,
    "useEntityLabels",
    ()=>useEntityLabels
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
"use client";
;
;
const CACHE_KEY = "entity_labels_cache";
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
/** Default display labels when entity_labels has no override (DB entity type unchanged). */ const DEFAULT_ENTITY_LABELS = {
    vendors: {
        singular: "Vendor",
        plural: "Vendors"
    },
    jobs: {
        singular: "Job",
        plural: "Jobs"
    },
    schedules: {
        singular: "Schedule",
        plural: "Schedules"
    },
    customers: {
        singular: "Customer",
        plural: "Customers"
    },
    contacts: {
        singular: "Contact",
        plural: "Contacts"
    },
    customer_members: {
        singular: "Member",
        plural: "Members"
    },
    persons: {
        singular: "Person",
        plural: "People"
    },
    opportunities: {
        singular: "Opportunity",
        plural: "Opportunities"
    },
    workflows: {
        singular: "Workflow",
        plural: "Workflows"
    },
    locations: {
        singular: "Location",
        plural: "Locations"
    },
    documents: {
        singular: "Document",
        plural: "Documents"
    },
    subscriptions: {
        singular: "Subscription",
        plural: "Subscriptions"
    },
    payments: {
        singular: "Payment",
        plural: "Payments"
    },
    messages: {
        singular: "Message",
        plural: "Messages"
    },
    service_offerings: {
        singular: "Service Offering",
        plural: "Service Offerings"
    },
    service_plan_templates: {
        singular: "Plan Template",
        plural: "Plan Templates"
    },
    discount_redemptions: {
        singular: "Discount Redemption",
        plural: "Discount Redemptions"
    },
    addons: {
        singular: "Add-on",
        plural: "Add-ons"
    }
};
function getEntityLabel(labels, entityType, form) {
    const entry = labels[entityType];
    const value = form === "singular" ? entry?.singular : entry?.plural;
    if (value != null && value.trim() !== "") return value.trim();
    const defaults = DEFAULT_ENTITY_LABELS[entityType];
    if (defaults) return defaults[form];
    const fallback = form === "singular" ? entityType.replace(/s$/, "") : entityType;
    return fallback.charAt(0).toUpperCase() + fallback.slice(1);
}
const EntityLabelsContext = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["createContext"])(null);
function loadFromCache() {
    if ("TURBOPACK compile-time truthy", 1) return null;
    //TURBOPACK unreachable
    ;
}
function saveToCache(effective) {
    if ("TURBOPACK compile-time truthy", 1) return;
    //TURBOPACK unreachable
    ;
}
function buildMap(effective) {
    const map = {};
    for (const row of effective){
        map[row.entity_type] = {
            singular: row.singular ?? null,
            plural: row.plural ?? null
        };
    }
    return map;
}
function useEntityLabels() {
    const ctx = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useContext"])(EntityLabelsContext);
    if (!ctx) throw new Error("useEntityLabels must be used within EntityLabelsProvider");
    return ctx;
}
function EntityLabelsProvider({ children, initialLabels }) {
    const seeded = !!(initialLabels && Object.keys(initialLabels).length > 0);
    const [labels, setLabels] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(()=>seeded ? {
            ...initialLabels
        } : {});
    const [loading, setLoading] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(()=>!seeded);
    const refreshEntityLabels = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(async ()=>{
        try {
            const res = await fetch("/api/admin/entity-labels");
            const json = await res.json().catch(()=>({}));
            if (!res.ok) return;
            const effective = json.effective ?? [];
            const map = buildMap(effective);
            setLabels(map);
            saveToCache(effective);
        } catch (_) {
        // keep previous labels on error
        } finally{
            setLoading(false);
        }
    }, []);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (seeded) {
            // Server already hydrated labels; avoid doubling GET /api/admin/entity-labels on mount.
            if (typeof requestIdleCallback !== "undefined") {
                const id = requestIdleCallback(()=>void refreshEntityLabels());
                return ()=>cancelIdleCallback(id);
            }
            const t = window.setTimeout(()=>void refreshEntityLabels(), 2500);
            return ()=>window.clearTimeout(t);
        }
        const cached = loadFromCache();
        if (Object.keys(cached ?? {}).length > 0) {
            setLabels(cached);
            setLoading(false);
            void refreshEntityLabels();
            return;
        }
        void refreshEntityLabels();
    }, [
        seeded,
        refreshEntityLabels
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(EntityLabelsContext.Provider, {
        value: {
            labels,
            loading,
            refreshEntityLabels
        },
        children: children
    }, void 0, false, {
        fileName: "[project]/contexts/EntityLabelsContext.tsx",
        lineNumber: 148,
        columnNumber: 9
    }, this);
}
}),
"[project]/contexts/AdminViewerTimezoneContext.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "AdminViewerTimezoneProvider",
    ()=>AdminViewerTimezoneProvider,
    "useAdminViewerTimezone",
    ()=>useAdminViewerTimezone,
    "useAdminViewerTimezoneMeta",
    ()=>useAdminViewerTimezoneMeta
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$timezoneContract$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/timezoneContract.ts [app-ssr] (ecmascript)");
"use client";
;
;
;
const AdminViewerTimezoneContext = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["createContext"])({
    iana: __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$timezoneContract$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["UTC_FALLBACK_IANA"],
    source: "utc_fallback"
});
function AdminViewerTimezoneProvider({ value, children }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(AdminViewerTimezoneContext.Provider, {
        value: value,
        children: children
    }, void 0, false, {
        fileName: "[project]/contexts/AdminViewerTimezoneContext.tsx",
        lineNumber: 25,
        columnNumber: 12
    }, this);
}
function useAdminViewerTimezone() {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useContext"])(AdminViewerTimezoneContext).iana;
}
function useAdminViewerTimezoneMeta() {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useContext"])(AdminViewerTimezoneContext);
}
}),
"[project]/contexts/WorkspaceOrgContext.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "WorkspaceOrgProvider",
    ()=>WorkspaceOrgProvider,
    "useWorkspaceOrg",
    ()=>useWorkspaceOrg
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
"use client";
;
;
const WorkspaceOrgContext = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["createContext"])({
    orgName: null
});
function WorkspaceOrgProvider({ orgName, children }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(WorkspaceOrgContext.Provider, {
        value: {
            orgName
        },
        children: children
    }, void 0, false, {
        fileName: "[project]/contexts/WorkspaceOrgContext.tsx",
        lineNumber: 18,
        columnNumber: 10
    }, this);
}
function useWorkspaceOrg() {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useContext"])(WorkspaceOrgContext);
}
}),
"[project]/hooks/useRecordChromeConfig.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "useRecordChromeConfig",
    ()=>useRecordChromeConfig
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$workspaceAdminFetchDedupe$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/workspace/workspaceAdminFetchDedupe.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$workspaceDataFetch$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/workspace/workspaceDataFetch.ts [app-ssr] (ecmascript)");
"use client";
;
;
;
const RECORD_CHROME_TTL_MS = 1500;
function useRecordChromeConfig(entityKind) {
    const [layout, setLayout] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [actions, setActions] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])([]);
    const [loading, setLoading] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [error, setError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (!entityKind) {
            setLayout(null);
            setActions([]);
            setError(null);
            return;
        }
        let cancelled = false;
        (async ()=>{
            setLoading(true);
            setError(null);
            try {
                const init = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$workspaceDataFetch$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["workspaceDataFetchInit"])();
                const [lRes, aRes] = await Promise.all([
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$workspaceAdminFetchDedupe$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["dedupeAdminFetchWithTtl"])(`/api/admin/record-layouts?entity_type=${encodeURIComponent(entityKind)}`, init, RECORD_CHROME_TTL_MS),
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$workspaceAdminFetchDedupe$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["dedupeAdminFetchWithTtl"])(`/api/admin/record-actions?entity_type=${encodeURIComponent(entityKind)}`, init, RECORD_CHROME_TTL_MS)
                ]);
                const lJson = await lRes.json().catch(()=>({}));
                const aJson = await aRes.json().catch(()=>({}));
                if (!lRes.ok) throw new Error(lJson.error ?? "Failed to load record layouts");
                if (!aRes.ok) throw new Error(aJson.error ?? "Failed to load record actions");
                const layouts = lJson.layouts ?? [];
                const defaultLayout = layouts.find((x)=>x.key === "default") ?? layouts[0] ?? null;
                if (!cancelled) {
                    setLayout(defaultLayout);
                    setActions(aJson.actions ?? []);
                }
            } catch (e) {
                if (!cancelled) {
                    setLayout(null);
                    setActions([]);
                    setError(e instanceof Error ? e.message : "Record chrome load failed");
                }
            } finally{
                if (!cancelled) setLoading(false);
            }
        })();
        return ()=>{
            cancelled = true;
        };
    }, [
        entityKind
    ]);
    return {
        layout,
        actions,
        loading,
        error
    };
}
}),
"[project]/app/adminV2/workspace/AdminV2WorkspaceClientProviders.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>AdminV2WorkspaceClientProviders
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$contexts$2f$AdminAuthContext$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/contexts/AdminAuthContext.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$contexts$2f$AdminDrawerContext$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/contexts/AdminDrawerContext.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$contexts$2f$AdminVerticalContext$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/contexts/AdminVerticalContext.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$contexts$2f$EntityLabelsContext$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/contexts/EntityLabelsContext.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$AdminEntityDrawer$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/components/admin/AdminEntityDrawer.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$contexts$2f$AdminViewerTimezoneContext$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/contexts/AdminViewerTimezoneContext.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$contexts$2f$WorkspaceOrgContext$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/contexts/WorkspaceOrgContext.tsx [app-ssr] (ecmascript)");
"use client";
;
;
;
;
;
;
;
;
function AdminV2WorkspaceClientProviders({ children, userEmail, role, initialEntityLabels, orgName = null, initialViewerTimezone }) {
    const safeEmail = typeof userEmail === "string" && userEmail.length > 0 ? userEmail : "Unknown";
    const safeRole = typeof role === "string" ? role : "";
    const tzValue = initialViewerTimezone ?? {
        iana: "UTC",
        source: "utc_fallback"
    };
    const labels = initialEntityLabels ? initialEntityLabels : undefined;
    const workspaceScrollStyle = {
        "--ws-rail-sticky-top": "10px",
        "--ws-shell-bottom-safe": "120px"
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$contexts$2f$AdminAuthContext$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AdminAuthProvider"], {
        userEmail: safeEmail,
        role: safeRole,
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$contexts$2f$AdminVerticalContext$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AdminVerticalProvider"], {
            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$contexts$2f$EntityLabelsContext$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["EntityLabelsProvider"], {
                initialLabels: labels,
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$contexts$2f$AdminViewerTimezoneContext$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AdminViewerTimezoneProvider"], {
                    value: tzValue,
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$contexts$2f$WorkspaceOrgContext$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["WorkspaceOrgProvider"], {
                        orgName: orgName,
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$contexts$2f$AdminDrawerContext$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AdminDrawerProvider"], {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "adminv2-workspace-scroll-surface min-h-0 flex-1 overflow-auto px-4 py-3 sm:px-5",
                                        style: workspaceScrollStyle,
                                        children: children
                                    }, void 0, false, {
                                        fileName: "[project]/app/adminV2/workspace/AdminV2WorkspaceClientProviders.tsx",
                                        lineNumber: 57,
                                        columnNumber: 17
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$AdminEntityDrawer$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {}, void 0, false, {
                                        fileName: "[project]/app/adminV2/workspace/AdminV2WorkspaceClientProviders.tsx",
                                        lineNumber: 63,
                                        columnNumber: 17
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/app/adminV2/workspace/AdminV2WorkspaceClientProviders.tsx",
                                lineNumber: 56,
                                columnNumber: 15
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/app/adminV2/workspace/AdminV2WorkspaceClientProviders.tsx",
                            lineNumber: 55,
                            columnNumber: 13
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/workspace/AdminV2WorkspaceClientProviders.tsx",
                        lineNumber: 54,
                        columnNumber: 13
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/app/adminV2/workspace/AdminV2WorkspaceClientProviders.tsx",
                    lineNumber: 53,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/app/adminV2/workspace/AdminV2WorkspaceClientProviders.tsx",
                lineNumber: 52,
                columnNumber: 9
            }, this)
        }, void 0, false, {
            fileName: "[project]/app/adminV2/workspace/AdminV2WorkspaceClientProviders.tsx",
            lineNumber: 51,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/app/adminV2/workspace/AdminV2WorkspaceClientProviders.tsx",
        lineNumber: 50,
        columnNumber: 5
    }, this);
}
}),
];

//# sourceMappingURL=_90e954f1._.js.map