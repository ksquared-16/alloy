(globalThis.TURBOPACK || (globalThis.TURBOPACK = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/contexts/AdminAuthContext.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "AdminAuthProvider",
    ()=>AdminAuthProvider,
    "useAdminAuth",
    ()=>useAdminAuth
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
const AdminAuthContext = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["createContext"])(null);
function useAdminAuth() {
    _s();
    const ctx = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useContext"])(AdminAuthContext);
    if (!ctx) throw new Error("useAdminAuth must be used within AdminAuthProvider");
    return ctx;
}
_s(useAdminAuth, "/dMy7t63NXD4eYACoT93CePwGrg=");
function AdminAuthProvider({ userEmail, role, children }) {
    const safeEmail = typeof userEmail === "string" ? userEmail : "Unknown";
    const safeRole = typeof role === "string" ? role : "";
    const canMutate = safeRole === "admin";
    const value = {
        userEmail: safeEmail,
        role: safeRole,
        canMutate
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(AdminAuthContext.Provider, {
        value: value,
        children: children
    }, void 0, false, {
        fileName: "[project]/contexts/AdminAuthContext.tsx",
        lineNumber: 34,
        columnNumber: 9
    }, this);
}
_c = AdminAuthProvider;
var _c;
__turbopack_context__.k.register(_c, "AdminAuthProvider");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/contexts/AdminDrawerContext.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "AdminDrawerProvider",
    ()=>AdminDrawerProvider,
    "useAdminDrawer",
    ()=>useAdminDrawer
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature(), _s1 = __turbopack_context__.k.signature();
"use client";
;
const AdminDrawerContext = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["createContext"])(null);
function useAdminDrawer() {
    _s();
    const ctx = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useContext"])(AdminDrawerContext);
    if (!ctx) throw new Error("useAdminDrawer must be used within AdminDrawerProvider");
    return ctx;
}
_s(useAdminDrawer, "/dMy7t63NXD4eYACoT93CePwGrg=");
function AdminDrawerProvider({ children }) {
    _s1();
    const [drawer, setDrawer] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])({
        type: null,
        id: null
    });
    const [stack, setStack] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])([]);
    const openDrawer = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "AdminDrawerProvider.useCallback[openDrawer]": (params)=>{
            setDrawer({
                "AdminDrawerProvider.useCallback[openDrawer]": (prev)=>{
                    const prevType = prev.type;
                    const prevId = prev.id;
                    if (prevType != null && prevId != null) {
                        setStack({
                            "AdminDrawerProvider.useCallback[openDrawer]": (s)=>[
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
                                ]
                        }["AdminDrawerProvider.useCallback[openDrawer]"]);
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
                }
            }["AdminDrawerProvider.useCallback[openDrawer]"]);
        }
    }["AdminDrawerProvider.useCallback[openDrawer]"], []);
    const goBack = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "AdminDrawerProvider.useCallback[goBack]": ()=>{
            setStack({
                "AdminDrawerProvider.useCallback[goBack]": (s)=>{
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
                }
            }["AdminDrawerProvider.useCallback[goBack]"]);
        }
    }["AdminDrawerProvider.useCallback[goBack]"], []);
    const closeDrawer = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "AdminDrawerProvider.useCallback[closeDrawer]": ()=>{
            setDrawer({
                type: null,
                id: null
            });
            setStack([]);
        }
    }["AdminDrawerProvider.useCallback[closeDrawer]"], []);
    const previousDrawer = stack.length > 0 ? stack[stack.length - 1] : null;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(AdminDrawerContext.Provider, {
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
_s1(AdminDrawerProvider, "Wk8Oc1ovNekMIw7jPVCsKx07khQ=");
_c = AdminDrawerProvider;
var _c;
__turbopack_context__.k.register(_c, "AdminDrawerProvider");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/contexts/AdminVerticalContext.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "AdminVerticalProvider",
    ()=>AdminVerticalProvider,
    "useAdminVertical",
    ()=>useAdminVertical
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature(), _s1 = __turbopack_context__.k.signature();
"use client";
;
const STORAGE_KEY = "admin_selected_vertical_id";
const AdminVerticalContext = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["createContext"])(null);
function useAdminVertical() {
    _s();
    const ctx = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useContext"])(AdminVerticalContext);
    if (!ctx) throw new Error("useAdminVertical must be used within AdminVerticalProvider");
    return ctx;
}
_s(useAdminVertical, "/dMy7t63NXD4eYACoT93CePwGrg=");
function AdminVerticalProvider({ children }) {
    _s1();
    const [verticals, setVerticals] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])([]);
    const [loading, setLoading] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(true);
    const [selectedVerticalId, setSelectedVerticalIdState] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "AdminVerticalProvider.useEffect": ()=>{
            fetch("/api/admin/verticals").then({
                "AdminVerticalProvider.useEffect": (res)=>res.ok ? res.json() : []
            }["AdminVerticalProvider.useEffect"]).then({
                "AdminVerticalProvider.useEffect": (data)=>setVerticals(Array.isArray(data) ? data : [])
            }["AdminVerticalProvider.useEffect"]).catch({
                "AdminVerticalProvider.useEffect": ()=>setVerticals([])
            }["AdminVerticalProvider.useEffect"]).finally({
                "AdminVerticalProvider.useEffect": ()=>setLoading(false)
            }["AdminVerticalProvider.useEffect"]);
        }
    }["AdminVerticalProvider.useEffect"], []);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "AdminVerticalProvider.useEffect": ()=>{
            if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
            ;
            const stored = localStorage.getItem(STORAGE_KEY);
            setSelectedVerticalIdState(stored || null);
        }
    }["AdminVerticalProvider.useEffect"], []);
    const setSelectedVerticalId = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "AdminVerticalProvider.useCallback[setSelectedVerticalId]": (id)=>{
            setSelectedVerticalIdState(id);
            if ("TURBOPACK compile-time truthy", 1) {
                if (id) localStorage.setItem(STORAGE_KEY, id);
                else localStorage.removeItem(STORAGE_KEY);
            }
        }
    }["AdminVerticalProvider.useCallback[setSelectedVerticalId]"], []);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(AdminVerticalContext.Provider, {
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
_s1(AdminVerticalProvider, "2bSkRLRdfj8k1Lu9h8vWFq18BRM=");
_c = AdminVerticalProvider;
var _c;
__turbopack_context__.k.register(_c, "AdminVerticalProvider");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/contexts/EntityLabelsContext.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "EntityLabelsProvider",
    ()=>EntityLabelsProvider,
    "getEntityLabel",
    ()=>getEntityLabel,
    "useEntityLabels",
    ()=>useEntityLabels
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature(), _s1 = __turbopack_context__.k.signature();
"use client";
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
const EntityLabelsContext = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["createContext"])(null);
function loadFromCache() {
    if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
    ;
    try {
        const raw = sessionStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const { at, data } = JSON.parse(raw);
        if (Date.now() - at > CACHE_TTL_MS) return null;
        const map = {};
        for (const row of data ?? []){
            map[row.entity_type] = {
                singular: row.singular ?? null,
                plural: row.plural ?? null
            };
        }
        return map;
    } catch  {
        return null;
    }
}
function saveToCache(effective) {
    if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
    ;
    try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({
            at: Date.now(),
            data: effective
        }));
    } catch (_) {}
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
    _s();
    const ctx = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useContext"])(EntityLabelsContext);
    if (!ctx) throw new Error("useEntityLabels must be used within EntityLabelsProvider");
    return ctx;
}
_s(useEntityLabels, "/dMy7t63NXD4eYACoT93CePwGrg=");
function EntityLabelsProvider({ children, initialLabels }) {
    _s1();
    const seeded = !!(initialLabels && Object.keys(initialLabels).length > 0);
    const [labels, setLabels] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])({
        "EntityLabelsProvider.useState": ()=>seeded ? {
                ...initialLabels
            } : {}
    }["EntityLabelsProvider.useState"]);
    const [loading, setLoading] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])({
        "EntityLabelsProvider.useState": ()=>!seeded
    }["EntityLabelsProvider.useState"]);
    const refreshEntityLabels = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "EntityLabelsProvider.useCallback[refreshEntityLabels]": async ()=>{
            try {
                const res = await fetch("/api/admin/entity-labels");
                const json = await res.json().catch({
                    "EntityLabelsProvider.useCallback[refreshEntityLabels]": ()=>({})
                }["EntityLabelsProvider.useCallback[refreshEntityLabels]"]);
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
        }
    }["EntityLabelsProvider.useCallback[refreshEntityLabels]"], []);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "EntityLabelsProvider.useEffect": ()=>{
            if (seeded) {
                // Server already hydrated labels; avoid doubling GET /api/admin/entity-labels on mount.
                if (typeof requestIdleCallback !== "undefined") {
                    const id = requestIdleCallback({
                        "EntityLabelsProvider.useEffect.id": ()=>void refreshEntityLabels()
                    }["EntityLabelsProvider.useEffect.id"]);
                    return ({
                        "EntityLabelsProvider.useEffect": ()=>cancelIdleCallback(id)
                    })["EntityLabelsProvider.useEffect"];
                }
                const t = window.setTimeout({
                    "EntityLabelsProvider.useEffect.t": ()=>void refreshEntityLabels()
                }["EntityLabelsProvider.useEffect.t"], 2500);
                return ({
                    "EntityLabelsProvider.useEffect": ()=>window.clearTimeout(t)
                })["EntityLabelsProvider.useEffect"];
            }
            const cached = loadFromCache();
            if (Object.keys(cached ?? {}).length > 0) {
                setLabels(cached);
                setLoading(false);
                void refreshEntityLabels();
                return;
            }
            void refreshEntityLabels();
        }
    }["EntityLabelsProvider.useEffect"], [
        seeded,
        refreshEntityLabels
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(EntityLabelsContext.Provider, {
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
_s1(EntityLabelsProvider, "7VMvfq4MCg+j5EPK+MkwciagScs=");
_c = EntityLabelsProvider;
var _c;
__turbopack_context__.k.register(_c, "EntityLabelsProvider");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/contexts/WorkspaceOrgContext.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "WorkspaceOrgProvider",
    ()=>WorkspaceOrgProvider,
    "useWorkspaceOrg",
    ()=>useWorkspaceOrg
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
const WorkspaceOrgContext = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["createContext"])({
    orgName: null
});
function WorkspaceOrgProvider({ orgName, children }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(WorkspaceOrgContext.Provider, {
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
_c = WorkspaceOrgProvider;
function useWorkspaceOrg() {
    _s();
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useContext"])(WorkspaceOrgContext);
}
_s(useWorkspaceOrg, "gDsCjeeItUuvgOWf1v4qoK9RF6k=");
var _c;
__turbopack_context__.k.register(_c, "WorkspaceOrgProvider");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/hooks/useRecordChromeConfig.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "useRecordChromeConfig",
    ()=>useRecordChromeConfig
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$workspaceAdminFetchDedupe$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/workspace/workspaceAdminFetchDedupe.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$workspaceDataFetch$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/workspace/workspaceDataFetch.ts [app-client] (ecmascript)");
var _s = __turbopack_context__.k.signature();
"use client";
;
;
;
const RECORD_CHROME_TTL_MS = 1500;
function useRecordChromeConfig(entityKind) {
    _s();
    const [layout, setLayout] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [actions, setActions] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])([]);
    const [loading, setLoading] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [error, setError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "useRecordChromeConfig.useEffect": ()=>{
            if (!entityKind) {
                setLayout(null);
                setActions([]);
                setError(null);
                return;
            }
            let cancelled = false;
            ({
                "useRecordChromeConfig.useEffect": async ()=>{
                    setLoading(true);
                    setError(null);
                    try {
                        const init = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$workspaceDataFetch$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["workspaceDataFetchInit"])();
                        const [lRes, aRes] = await Promise.all([
                            (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$workspaceAdminFetchDedupe$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["dedupeAdminFetchWithTtl"])(`/api/admin/record-layouts?entity_type=${encodeURIComponent(entityKind)}`, init, RECORD_CHROME_TTL_MS),
                            (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$workspaceAdminFetchDedupe$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["dedupeAdminFetchWithTtl"])(`/api/admin/record-actions?entity_type=${encodeURIComponent(entityKind)}`, init, RECORD_CHROME_TTL_MS)
                        ]);
                        const lJson = await lRes.json().catch({
                            "useRecordChromeConfig.useEffect": ()=>({})
                        }["useRecordChromeConfig.useEffect"]);
                        const aJson = await aRes.json().catch({
                            "useRecordChromeConfig.useEffect": ()=>({})
                        }["useRecordChromeConfig.useEffect"]);
                        if (!lRes.ok) throw new Error(lJson.error ?? "Failed to load record layouts");
                        if (!aRes.ok) throw new Error(aJson.error ?? "Failed to load record actions");
                        const layouts = lJson.layouts ?? [];
                        const defaultLayout = layouts.find({
                            "useRecordChromeConfig.useEffect": (x)=>x.key === "default"
                        }["useRecordChromeConfig.useEffect"]) ?? layouts[0] ?? null;
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
                }
            })["useRecordChromeConfig.useEffect"]();
            return ({
                "useRecordChromeConfig.useEffect": ()=>{
                    cancelled = true;
                }
            })["useRecordChromeConfig.useEffect"];
        }
    }["useRecordChromeConfig.useEffect"], [
        entityKind
    ]);
    return {
        layout,
        actions,
        loading,
        error
    };
}
_s(useRecordChromeConfig, "UPInPsON2+FJlevf8wr9ZSb0Gyw=");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/app/adminV2/workspace/AdminV2WorkspaceClientProviders.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>AdminV2WorkspaceClientProviders
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$contexts$2f$AdminAuthContext$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/contexts/AdminAuthContext.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$contexts$2f$AdminDrawerContext$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/contexts/AdminDrawerContext.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$contexts$2f$AdminVerticalContext$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/contexts/AdminVerticalContext.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$contexts$2f$EntityLabelsContext$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/contexts/EntityLabelsContext.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$AdminEntityDrawer$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/components/admin/AdminEntityDrawer.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$contexts$2f$WorkspaceOrgContext$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/contexts/WorkspaceOrgContext.tsx [app-client] (ecmascript)");
"use client";
;
;
;
;
;
;
;
function AdminV2WorkspaceClientProviders({ children, userEmail, role, initialEntityLabels, orgName = null }) {
    const safeEmail = typeof userEmail === "string" && userEmail.length > 0 ? userEmail : "Unknown";
    const safeRole = typeof role === "string" ? role : "";
    const labels = initialEntityLabels ? initialEntityLabels : undefined;
    const workspaceScrollStyle = {
        "--ws-rail-sticky-top": "10px",
        "--ws-shell-bottom-safe": "120px"
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$contexts$2f$AdminAuthContext$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AdminAuthProvider"], {
        userEmail: safeEmail,
        role: safeRole,
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$contexts$2f$AdminVerticalContext$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AdminVerticalProvider"], {
            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$contexts$2f$EntityLabelsContext$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["EntityLabelsProvider"], {
                initialLabels: labels,
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$contexts$2f$WorkspaceOrgContext$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["WorkspaceOrgProvider"], {
                    orgName: orgName,
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$contexts$2f$AdminDrawerContext$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AdminDrawerProvider"], {
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "adminv2-workspace-scroll-surface min-h-0 flex-1 overflow-auto px-4 py-3 sm:px-5",
                                    style: workspaceScrollStyle,
                                    children: children
                                }, void 0, false, {
                                    fileName: "[project]/app/adminV2/workspace/AdminV2WorkspaceClientProviders.tsx",
                                    lineNumber: 48,
                                    columnNumber: 17
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$AdminEntityDrawer$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {}, void 0, false, {
                                    fileName: "[project]/app/adminV2/workspace/AdminV2WorkspaceClientProviders.tsx",
                                    lineNumber: 54,
                                    columnNumber: 17
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/app/adminV2/workspace/AdminV2WorkspaceClientProviders.tsx",
                            lineNumber: 47,
                            columnNumber: 15
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/workspace/AdminV2WorkspaceClientProviders.tsx",
                        lineNumber: 46,
                        columnNumber: 13
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/app/adminV2/workspace/AdminV2WorkspaceClientProviders.tsx",
                    lineNumber: 45,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/app/adminV2/workspace/AdminV2WorkspaceClientProviders.tsx",
                lineNumber: 44,
                columnNumber: 9
            }, this)
        }, void 0, false, {
            fileName: "[project]/app/adminV2/workspace/AdminV2WorkspaceClientProviders.tsx",
            lineNumber: 43,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/app/adminV2/workspace/AdminV2WorkspaceClientProviders.tsx",
        lineNumber: 42,
        columnNumber: 5
    }, this);
}
_c = AdminV2WorkspaceClientProviders;
var _c;
__turbopack_context__.k.register(_c, "AdminV2WorkspaceClientProviders");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
]);

//# sourceMappingURL=_79929919._.js.map