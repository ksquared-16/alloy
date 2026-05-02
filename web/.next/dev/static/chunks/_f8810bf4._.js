(globalThis.TURBOPACK || (globalThis.TURBOPACK = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/app/adminV2/components/workspace/blocks/KPIBlock.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>KPIBlock
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
/** Default orientation band capacity (compact scorecard target). */ const KPI_ORIENTATION_MAX = 5;
/**
 * Normalize metrics to a steady left-to-right read: business-lane KPIs first, then `lane: "ai"`, capped at `maxVisible`.
 */ function mergeKpisForOrientationStrip(kpis, maxVisible) {
    const cap = Math.max(0, Math.min(maxVisible, KPI_ORIENTATION_MAX));
    const business = kpis.filter((k)=>(k.lane ?? "business") !== "ai");
    const ai = kpis.filter((k)=>k.lane === "ai");
    return [
        ...business,
        ...ai
    ].slice(0, cap);
}
function KPIBlock({ kpis, maxVisible = KPI_ORIENTATION_MAX, surface: _surface, dualRailHeadings: _dualRailHeadings }) {
    _s();
    void _surface;
    void _dualRailHeadings;
    const items = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "KPIBlock.useMemo[items]": ()=>mergeKpisForOrientationStrip(kpis, maxVisible)
    }["KPIBlock.useMemo[items]"], [
        kpis,
        maxVisible
    ]);
    if (items.length === 0) return null;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "adminv2-ws-kpi-root-band adminv2-ws-kpi-root-band--compact",
        role: "group",
        "aria-label": "Key metrics",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "adminv2-ws-kpi-strip adminv2-ws-kpi-strip--orientation",
            role: "list",
            children: items.map((k)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: [
                        "adminv2-ws-kpi-cell",
                        "adminv2-ws-kpi-cell--orientation",
                        k.tone && k.tone !== "neutral" ? `adminv2-ws-kpi-cell--tone-${k.tone}` : "",
                        k.lane === "ai" ? "adminv2-ws-kpi-cell--lane-ai" : ""
                    ].filter(Boolean).join(" "),
                    role: "listitem",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "adminv2-ws-kpi-label",
                            children: k.label
                        }, void 0, false, {
                            fileName: "[project]/app/adminV2/components/workspace/blocks/KPIBlock.tsx",
                            lineNumber: 62,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "adminv2-ws-kpi-value",
                            children: [
                                k.value,
                                k.unit ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "adminv2-ws-kpi-unit",
                                    children: k.unit
                                }, void 0, false, {
                                    fileName: "[project]/app/adminV2/components/workspace/blocks/KPIBlock.tsx",
                                    lineNumber: 65,
                                    columnNumber: 25
                                }, this) : null
                            ]
                        }, void 0, true, {
                            fileName: "[project]/app/adminV2/components/workspace/blocks/KPIBlock.tsx",
                            lineNumber: 63,
                            columnNumber: 13
                        }, this),
                        k.aiSummary ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "adminv2-ws-kpi-ai",
                            children: k.aiSummary
                        }, void 0, false, {
                            fileName: "[project]/app/adminV2/components/workspace/blocks/KPIBlock.tsx",
                            lineNumber: 67,
                            columnNumber: 28
                        }, this) : null
                    ]
                }, k.id, true, {
                    fileName: "[project]/app/adminV2/components/workspace/blocks/KPIBlock.tsx",
                    lineNumber: 50,
                    columnNumber: 11
                }, this))
        }, void 0, false, {
            fileName: "[project]/app/adminV2/components/workspace/blocks/KPIBlock.tsx",
            lineNumber: 48,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/app/adminV2/components/workspace/blocks/KPIBlock.tsx",
        lineNumber: 43,
        columnNumber: 5
    }, this);
}
_s(KPIBlock, "JuH2Tip3cwnoihIGVm6QoIvsF5k=");
_c = KPIBlock;
var _c;
__turbopack_context__.k.register(_c, "KPIBlock");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/lib/workspace/growthSliceDepartments.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Departments that use the opportunity / pipeline workspace (Growth slice), not job-centric metrics.
 * Keys align with `departments.key` from bootstrap / admin.
 */ __turbopack_context__.s([
    "isGrowthSliceDepartmentKey",
    ()=>isGrowthSliceDepartmentKey
]);
const GROWTH_SLICE_KEYS = new Set([
    "growth",
    "enrollment"
]);
function isGrowthSliceDepartmentKey(departmentKey) {
    const k = (departmentKey ?? "").trim().toLowerCase();
    return k !== "" && GROWTH_SLICE_KEYS.has(k);
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/components/admin/workspace/WorkspaceRootDepartmentGrid.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "WorkspaceRootDepartmentGrid",
    ()=>WorkspaceRootDepartmentGrid
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/client/app-dir/link.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/styles/tokens/colors.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$visualContext$2f$index$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/lib/visualContext/index.ts [app-client] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$visualContext$2f$contextStyle$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/visualContext/contextStyle.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$visualContext$2f$contextResolver$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/visualContext/contextResolver.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$growthSliceDepartments$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/workspace/growthSliceDepartments.ts [app-client] (ecmascript)");
"use client";
;
;
;
;
;
;
/** Org-level company shell — weakest contextual intensity; tiles use `data-ws-company-dept-tone` per row. */ const companyRootStyle = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$visualContext$2f$contextStyle$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["operationalWorkspaceShellStyle"])({
    layer: "workspace"
});
function WorkspaceRootDepartmentGrid({ workspaceBasePath, departments, deptTileStats, tileVariant = "default", omitOuterChrome = false }) {
    const base = workspaceBasePath.replace(/\/$/, "");
    const root = tileVariant === "workspaceRoot";
    const grid = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: root ? "adminv2-ws-company-v2-dept-grid adminv2-ws-company-v2-dept-grid--workspace-root" : "adminv2-ws-company-v2-dept-grid",
        children: departments.map((d)=>{
            const tone = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$visualContext$2f$contextStyle$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["alloyFamilyToWorkspaceTileTone"])((0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$visualContext$2f$contextResolver$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["resolveVisualContext"])({
                departmentKey: d.key,
                departmentDefaultVisualContextKey: d.default_visual_context_key ?? undefined
            }).alloyFamily);
            const desc = d.description && String(d.description).trim() || `Departments and work units for ${d.name}.`;
            const stats = deptTileStats?.[d.id];
            const wu = stats?.workUnitCount;
            const rollup = stats?.opportunityRollupLine?.trim();
            const statsLine = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$growthSliceDepartments$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["isGrowthSliceDepartmentKey"])(d.key) && rollup ? rollup : wu != null && wu >= 0 ? `${wu} work unit${wu === 1 ? "" : "s"}` : null;
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                href: `${base}/dept/${encodeURIComponent(d.id)}`,
                className: [
                    "adminv2-ws-company-dept-tile group block h-full text-left no-underline text-inherit rounded-[inherit] focus:outline-none focus-visible:ring-2 focus-visible:ring-alloy-blue/35",
                    root ? "adminv2-ws-company-dept-tile--workspace-root" : ""
                ].filter(Boolean).join(" "),
                "data-ws-company-dept-key": d.key,
                "data-ws-company-dept-tone": tone,
                "aria-label": `${d.name} department workspace`,
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "adminv2-ws-company-dept-tile-head",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                            className: "adminv2-ws-company-dept-tile-name",
                            children: d.name
                        }, void 0, false, {
                            fileName: "[project]/components/admin/workspace/WorkspaceRootDepartmentGrid.tsx",
                            lineNumber: 102,
                            columnNumber: 41
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/components/admin/workspace/WorkspaceRootDepartmentGrid.tsx",
                        lineNumber: 101,
                        columnNumber: 37
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "adminv2-ws-company-dept-tile-desc flex-1",
                        children: desc
                    }, void 0, false, {
                        fileName: "[project]/components/admin/workspace/WorkspaceRootDepartmentGrid.tsx",
                        lineNumber: 104,
                        columnNumber: 37
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "mt-auto pt-2 flex flex-col gap-1",
                        children: [
                            statsLine ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: "text-xs font-semibold tabular-nums",
                                style: {
                                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["neutral"].textPrimary
                                },
                                children: statsLine
                            }, void 0, false, {
                                fileName: "[project]/components/admin/workspace/WorkspaceRootDepartmentGrid.tsx",
                                lineNumber: 107,
                                columnNumber: 45
                            }, this) : null,
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: "text-[11px] font-medium leading-snug",
                                style: {
                                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].textSecondary
                                },
                                children: "Open department"
                            }, void 0, false, {
                                fileName: "[project]/components/admin/workspace/WorkspaceRootDepartmentGrid.tsx",
                                lineNumber: 111,
                                columnNumber: 41
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/admin/workspace/WorkspaceRootDepartmentGrid.tsx",
                        lineNumber: 105,
                        columnNumber: 37
                    }, this)
                ]
            }, d.id, true, {
                fileName: "[project]/components/admin/workspace/WorkspaceRootDepartmentGrid.tsx",
                lineNumber: 88,
                columnNumber: 33
            }, this);
        })
    }, void 0, false, {
        fileName: "[project]/components/admin/workspace/WorkspaceRootDepartmentGrid.tsx",
        lineNumber: 61,
        columnNumber: 9
    }, this);
    if (omitOuterChrome) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
            className: "adminv2-ws-company-v2-main",
            "aria-label": "Departments",
            "data-production-workspace-root": "true",
            children: grid
        }, void 0, false, {
            fileName: "[project]/components/admin/workspace/WorkspaceRootDepartmentGrid.tsx",
            lineNumber: 123,
            columnNumber: 13
        }, this);
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        "data-ws-surface": "company",
        "data-production-workspace-root": "true",
        "data-ws-root-tile-variant": root ? "workspaceRoot" : undefined,
        className: "adminv2-ws-root adminv2-ws-company adminv2-ws-company-v2",
        style: companyRootStyle,
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: root ? "adminv2-ws-dept-v2-contain px-0" : "adminv2-ws-dept-v2-contain",
            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                className: "adminv2-ws-company-v2-main",
                "aria-label": "Departments",
                children: grid
            }, void 0, false, {
                fileName: "[project]/components/admin/workspace/WorkspaceRootDepartmentGrid.tsx",
                lineNumber: 138,
                columnNumber: 17
            }, this)
        }, void 0, false, {
            fileName: "[project]/components/admin/workspace/WorkspaceRootDepartmentGrid.tsx",
            lineNumber: 137,
            columnNumber: 13
        }, this)
    }, void 0, false, {
        fileName: "[project]/components/admin/workspace/WorkspaceRootDepartmentGrid.tsx",
        lineNumber: 130,
        columnNumber: 9
    }, this);
}
_c = WorkspaceRootDepartmentGrid;
var _c;
__turbopack_context__.k.register(_c, "WorkspaceRootDepartmentGrid");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/components/admin/workspace/WorkspaceShellLayout.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "WorkspaceShellLayout",
    ()=>WorkspaceShellLayout
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
"use client";
;
;
function WorkspaceShellLayout({ surface, rootClassName, style, workspaceRootShell, productionWorkspaceBridge, containLead, primaryColumn, railContent, showRail, railAriaLabel = "Decisions and actions" }) {
    const hasRail = typeof showRail === "boolean" ? showRail : railContent != null;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        "data-ws-surface": surface,
        className: `adminv2-ws-root ${rootClassName}`.trim(),
        style: style,
        ...workspaceRootShell ? {
            "data-adminv2-workspace-root-shell": "true"
        } : {},
        ...productionWorkspaceBridge ? {
            "data-production-workspace-bridge": "true"
        } : {},
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "adminv2-ws-dept-v2-contain",
            children: [
                containLead,
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: hasRail ? "adminv2-ws-dept-v2-page-split" : "adminv2-ws-dept-v2-page-split adminv2-ws-dept-v2-page-split--no-rail",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "adminv2-ws-dept-v2-primary-column",
                            children: primaryColumn
                        }, void 0, false, {
                            fileName: "[project]/components/admin/workspace/WorkspaceShellLayout.tsx",
                            lineNumber: 62,
                            columnNumber: 11
                        }, this),
                        hasRail ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "adminv2-ws-dept-v2-command-column adminv2-ws-shell-command-column",
                            "data-adminv2-workspace-command-column": true,
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("aside", {
                                className: "adminv2-ws-dept-v2-rail adminv2-ws-dept-v2-rail--command-shell",
                                "data-adminv2-workspace-command-rail": true,
                                "aria-label": railAriaLabel,
                                children: railContent
                            }, void 0, false, {
                                fileName: "[project]/components/admin/workspace/WorkspaceShellLayout.tsx",
                                lineNumber: 68,
                                columnNumber: 15
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/components/admin/workspace/WorkspaceShellLayout.tsx",
                            lineNumber: 64,
                            columnNumber: 13
                        }, this) : null
                    ]
                }, void 0, true, {
                    fileName: "[project]/components/admin/workspace/WorkspaceShellLayout.tsx",
                    lineNumber: 55,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/components/admin/workspace/WorkspaceShellLayout.tsx",
            lineNumber: 53,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/components/admin/workspace/WorkspaceShellLayout.tsx",
        lineNumber: 46,
        columnNumber: 5
    }, this);
}
_c = WorkspaceShellLayout;
var _c;
__turbopack_context__.k.register(_c, "WorkspaceShellLayout");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/components/admin/workspace/WorkspaceRootShell.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "WorkspaceRootShell",
    ()=>WorkspaceRootShell
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/client/app-dir/link.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/styles/tokens/colors.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$workspace$2f$blocks$2f$KPIBlock$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/adminV2/components/workspace/blocks/KPIBlock.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$workspace$2f$WorkspaceRootDepartmentGrid$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/components/admin/workspace/WorkspaceRootDepartmentGrid.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$workspace$2f$WorkspaceShellLayout$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/components/admin/workspace/WorkspaceShellLayout.tsx [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
;
;
;
;
const WORKSPACE_BASE = "/adminV2/workspace";
const companyRootStyle = {
    backgroundColor: "transparent",
    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["neutral"].textPrimary,
    ["--d-text-primary"]: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["neutral"].textPrimary,
    ["--d-page-bg"]: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["neutral"].background,
    ["--d-border"]: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].border,
    ["--d-muted"]: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].textSecondary,
    ["--d-surface"]: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["neutral"].surface,
    ["--d-brand"]: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["brand"].primary,
    ["--d-pine"]: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["brand"].secondary,
    ["--d-top-wash"]: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].kpiRailWash,
    ["--d-panel"]: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].chromeDeckBg,
    ["--d-panel-quiet"]: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].inspectorCommandRailWash,
    ["--d-rail"]: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].inspectorCommandRail,
    ["--d-field-veil"]: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].canvasFieldWash,
    ["--d-ambient-core"]: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].ambientLifeBloomMid,
    ["--d-kpi-tint"]: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].kpiBandBusinessLight,
    ["--d-kpi-ai-tint"]: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].kpiBandAiLight,
    ["--d-summary-wash"]: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].maskOverlay,
    ["--d-boundary-inset"]: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].adminV2BoundaryAmberInset,
    ["--d-kpi-band-shadow"]: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].kpiBandShadow,
    ["--d-admin-amber"]: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].adminV2BoundaryAmber,
    ["--d-rail-hairline"]: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].inspectorCommandHairline,
    ["--d-rail-sep"]: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].inspectorChamberSeparation,
    ["--d-ambient-edge"]: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].ambientLifeBloomEdge,
    ["--d-field-depth"]: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].canvasFieldDepth,
    ["--d-card-shadow"]: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].cardShadow
};
function formatInt(n) {
    if (n == null || Number.isNaN(n)) return "—";
    return String(Math.max(0, Math.floor(n)));
}
function buildStructureKpis(params) {
    const { metrics } = params;
    return [
        {
            id: "depts",
            label: "Departments",
            value: formatInt(metrics?.departments),
            lane: "business"
        },
        {
            id: "wu",
            label: "Work units",
            value: formatInt(metrics?.workUnits),
            lane: "business"
        }
    ];
}
function WorkspaceRootShell({ orgName, departments, deptTileStats, metrics, metricsLoading, orgOpportunityKpis, workspaceKpiStrip }) {
    _s();
    const displayName = orgName && orgName.trim() || "Your organization";
    const kpis = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "WorkspaceRootShell.useMemo[kpis]": ()=>{
            if (workspaceKpiStrip !== undefined) {
                return workspaceKpiStrip;
            }
            const structure = buildStructureKpis({
                metrics,
                metricsLoading
            });
            const roll = orgOpportunityKpis?.length ? orgOpportunityKpis : [];
            return [
                ...structure,
                ...roll
            ];
        }
    }["WorkspaceRootShell.useMemo[kpis]"], [
        workspaceKpiStrip,
        metrics,
        metricsLoading,
        orgOpportunityKpis
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$workspace$2f$WorkspaceShellLayout$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["WorkspaceShellLayout"], {
        surface: "company",
        rootClassName: "adminv2-ws-company adminv2-ws-company-v2",
        style: companyRootStyle,
        workspaceRootShell: true,
        railAriaLabel: "Workspace orientation",
        showRail: true,
        railContent: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
            className: "adminv2-ws-actions-rail adminv2-ws-actions-rail--dept-panel adminv2-ws-actions-rail--orientation px-3 pb-3 pt-3",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                    className: "adminv2-ws-actions-rail-title",
                    children: "Orientation"
                }, void 0, false, {
                    fileName: "[project]/components/admin/workspace/WorkspaceRootShell.tsx",
                    lineNumber: 116,
                    columnNumber: 11
                }, void 0),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                    className: "adminv2-ws-workspace-orientation-lead",
                    children: "You are at the top of the hierarchy. Use the department cards to drill into work units and queues; this column stays lightweight."
                }, void 0, false, {
                    fileName: "[project]/components/admin/workspace/WorkspaceRootShell.tsx",
                    lineNumber: 117,
                    columnNumber: 11
                }, void 0),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "adminv2-ws-workspace-orientation-meta",
                    "aria-label": "Related admin surfaces",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "adminv2-ws-workspace-orientation-meta-k",
                            children: "Drill path"
                        }, void 0, false, {
                            fileName: "[project]/components/admin/workspace/WorkspaceRootShell.tsx",
                            lineNumber: 122,
                            columnNumber: 13
                        }, void 0),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "adminv2-ws-workspace-orientation-meta-v",
                            children: "Department → work unit → record"
                        }, void 0, false, {
                            fileName: "[project]/components/admin/workspace/WorkspaceRootShell.tsx",
                            lineNumber: 123,
                            columnNumber: 13
                        }, void 0)
                    ]
                }, void 0, true, {
                    fileName: "[project]/components/admin/workspace/WorkspaceRootShell.tsx",
                    lineNumber: 121,
                    columnNumber: 11
                }, void 0),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "adminv2-ws-actions-rail-list adminv2-ws-actions-rail-list--column mt-3",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                            href: "/admin/opportunities",
                            className: "adminv2-ws-actions-rail-secondary adminv2-ws-workspace-orientation-link text-center no-underline rounded-md font-bold text-[11px] w-full",
                            children: "Open inquiries (classic admin)"
                        }, void 0, false, {
                            fileName: "[project]/components/admin/workspace/WorkspaceRootShell.tsx",
                            lineNumber: 126,
                            columnNumber: 13
                        }, void 0),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                            href: "/admin/system/work-units",
                            className: "adminv2-ws-actions-rail-secondary adminv2-ws-workspace-orientation-link text-center no-underline rounded-md font-bold text-[11px] w-full",
                            children: "Work unit registry"
                        }, void 0, false, {
                            fileName: "[project]/components/admin/workspace/WorkspaceRootShell.tsx",
                            lineNumber: 132,
                            columnNumber: 13
                        }, void 0)
                    ]
                }, void 0, true, {
                    fileName: "[project]/components/admin/workspace/WorkspaceRootShell.tsx",
                    lineNumber: 125,
                    columnNumber: 11
                }, void 0)
            ]
        }, void 0, true, {
            fileName: "[project]/components/admin/workspace/WorkspaceRootShell.tsx",
            lineNumber: 115,
            columnNumber: 9
        }, void 0),
        containLead: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("nav", {
            className: "text-sm text-alloy-midnight/60 flex flex-wrap items-center gap-1 pb-2",
            "aria-label": "Breadcrumb",
            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                className: "text-alloy-midnight/80 font-medium",
                children: "Workspace"
            }, void 0, false, {
                fileName: "[project]/components/admin/workspace/WorkspaceRootShell.tsx",
                lineNumber: 143,
                columnNumber: 11
            }, void 0)
        }, void 0, false, {
            fileName: "[project]/components/admin/workspace/WorkspaceRootShell.tsx",
            lineNumber: 142,
            columnNumber: 9
        }, void 0),
        primaryColumn: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "adminv2-ws-dept-v2-control-deck",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "adminv2-ws-dept-v2-top-stack",
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "adminv2-ws-dept-v2-brief",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "adminv2-ws-dept-v2-brief-focus-label",
                                        children: "Organization workspace"
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/workspace/WorkspaceRootShell.tsx",
                                        lineNumber: 151,
                                        columnNumber: 17
                                    }, void 0),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "adminv2-ws-dept-v2-brief-head-row",
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                                            className: "adminv2-ws-dept-v2-brief-headline",
                                            children: displayName
                                        }, void 0, false, {
                                            fileName: "[project]/components/admin/workspace/WorkspaceRootShell.tsx",
                                            lineNumber: 153,
                                            columnNumber: 19
                                        }, void 0)
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/workspace/WorkspaceRootShell.tsx",
                                        lineNumber: 152,
                                        columnNumber: 17
                                    }, void 0),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "text-sm mt-2 max-w-3xl adminv2-ws-root-brief-subline",
                                        style: {
                                            lineHeight: 1.45
                                        },
                                        children: "Pick a department to drill into work units. This root surface stays structure-only."
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/workspace/WorkspaceRootShell.tsx",
                                        lineNumber: 155,
                                        columnNumber: 17
                                    }, void 0)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/admin/workspace/WorkspaceRootShell.tsx",
                                lineNumber: 150,
                                columnNumber: 15
                            }, void 0)
                        }, void 0, false, {
                            fileName: "[project]/components/admin/workspace/WorkspaceRootShell.tsx",
                            lineNumber: 149,
                            columnNumber: 13
                        }, void 0),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$workspace$2f$blocks$2f$KPIBlock$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                            kpis: kpis,
                            maxVisible: 5
                        }, void 0, false, {
                            fileName: "[project]/components/admin/workspace/WorkspaceRootShell.tsx",
                            lineNumber: 163,
                            columnNumber: 13
                        }, void 0)
                    ]
                }, void 0, true, {
                    fileName: "[project]/components/admin/workspace/WorkspaceRootShell.tsx",
                    lineNumber: 148,
                    columnNumber: 11
                }, void 0),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                    className: "adminv2-ws-root-departments-zone",
                    "aria-labelledby": "ws-root-dept-heading",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "flex flex-wrap items-end justify-between gap-2 mb-3",
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                                        id: "ws-root-dept-heading",
                                        className: "adminv2-ws-root-zone-kicker",
                                        children: "Departments"
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/workspace/WorkspaceRootShell.tsx",
                                        lineNumber: 169,
                                        columnNumber: 17
                                    }, void 0),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "adminv2-ws-root-zone-sub",
                                        children: "Each card is a live department from your org — drill in to work units and queues."
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/workspace/WorkspaceRootShell.tsx",
                                        lineNumber: 172,
                                        columnNumber: 17
                                    }, void 0)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/admin/workspace/WorkspaceRootShell.tsx",
                                lineNumber: 168,
                                columnNumber: 15
                            }, void 0)
                        }, void 0, false, {
                            fileName: "[project]/components/admin/workspace/WorkspaceRootShell.tsx",
                            lineNumber: 167,
                            columnNumber: 13
                        }, void 0),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$workspace$2f$WorkspaceRootDepartmentGrid$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["WorkspaceRootDepartmentGrid"], {
                            workspaceBasePath: WORKSPACE_BASE,
                            departments: departments,
                            deptTileStats: deptTileStats,
                            tileVariant: "workspaceRoot",
                            omitOuterChrome: true
                        }, void 0, false, {
                            fileName: "[project]/components/admin/workspace/WorkspaceRootShell.tsx",
                            lineNumber: 177,
                            columnNumber: 13
                        }, void 0)
                    ]
                }, void 0, true, {
                    fileName: "[project]/components/admin/workspace/WorkspaceRootShell.tsx",
                    lineNumber: 166,
                    columnNumber: 11
                }, void 0)
            ]
        }, void 0, true)
    }, void 0, false, {
        fileName: "[project]/components/admin/workspace/WorkspaceRootShell.tsx",
        lineNumber: 107,
        columnNumber: 5
    }, this);
}
_s(WorkspaceRootShell, "226myOclMwNvdKJsKDt1I7mHIHE=");
_c = WorkspaceRootShell;
var _c;
__turbopack_context__.k.register(_c, "WorkspaceRootShell");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/lib/ui-v2/formatWorkspaceCurrency.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Workspace UI convention: USD with thousands grouping, e.g. $1,234.
 * Used for KPI copy, pipeline cards, and queue row value labels (presentation only).
 */ __turbopack_context__.s([
    "formatWorkspaceUsdGrouped",
    ()=>formatWorkspaceUsdGrouped
]);
const USD_GROUPED = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
});
function formatWorkspaceUsdGrouped(n) {
    return USD_GROUPED.format(Math.round(n));
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/lib/workspace/viewModels/workspaceRootRollup.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "buildWorkspaceRootDepartmentTileRollupLine",
    ()=>buildWorkspaceRootDepartmentTileRollupLine,
    "buildWorkspaceRootOrgOpportunityKpis",
    ()=>buildWorkspaceRootOrgOpportunityKpis,
    "closedCountFromLifecycleCounts",
    ()=>closedCountFromLifecycleCounts,
    "inMotionCountFromLifecycleCounts",
    ()=>inMotionCountFromLifecycleCounts
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$ui$2d$v2$2f$formatWorkspaceCurrency$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/ui-v2/formatWorkspaceCurrency.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$growthSliceDepartments$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/workspace/growthSliceDepartments.ts [app-client] (ecmascript)");
;
;
function inMotionCountFromLifecycleCounts(c) {
    if (!c) return 0;
    return (c.intake ?? 0) + (c.qualification ?? 0) + (c.execution ?? 0) + (c.decision ?? 0);
}
function closedCountFromLifecycleCounts(c) {
    if (!c) return 0;
    return (c.success ?? 0) + (c.failure ?? 0);
}
function buildWorkspaceRootOrgOpportunityKpis(snapshots) {
    let inquiriesInLane = 0;
    let sawInquiries = false;
    let closed = 0;
    let pipeline = 0;
    for (const { key, pipelineExact, lifecycleAnalytics } of snapshots){
        if (!(0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$growthSliceDepartments$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["isGrowthSliceDepartmentKey"])(key)) continue;
        if (pipelineExact?.total != null) {
            sawInquiries = true;
            inquiriesInLane += Math.max(0, pipelineExact.total);
        }
        const kpis = lifecycleAnalytics;
        if (kpis?.counts) {
            closed += closedCountFromLifecycleCounts(kpis.counts);
            pipeline += Number(kpis.values?.openPipeline ?? 0);
        }
    }
    return [
        {
            id: "org_in_motion",
            label: "Inquiries (pipeline lane)",
            value: sawInquiries ? String(Math.max(0, inquiriesInLane)) : "—",
            lane: "business"
        },
        {
            id: "org_pipeline_value",
            label: "Pipeline value (lifecycle)",
            value: pipeline > 0 ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$ui$2d$v2$2f$formatWorkspaceCurrency$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatWorkspaceUsdGrouped"])(pipeline) : "—",
            lane: "business"
        },
        {
            id: "org_closed",
            label: "Closed (lifecycle)",
            value: String(Math.max(0, closed)),
            lane: "business"
        }
    ];
}
function buildWorkspaceRootDepartmentTileRollupLine(params) {
    if ((0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$growthSliceDepartments$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["isGrowthSliceDepartmentKey"])(params.departmentKey) && params.pipelineExact?.total != null) {
        return `${params.pipelineExact.total} in pipeline`;
    }
    if (params.workUnitCount >= 0) {
        return `${params.workUnitCount} work unit${params.workUnitCount === 1 ? "" : "s"}`;
    }
    return null;
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/lib/kpi/contextKpiMetrics.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "departmentNeedsAttentionSumSafe",
    ()=>departmentNeedsAttentionSumSafe,
    "departmentSumWorkUnitTotals",
    ()=>departmentSumWorkUnitTotals,
    "workUnitNeedsAttentionCount",
    ()=>workUnitNeedsAttentionCount,
    "workUnitPrimaryLaneTotal",
    ()=>workUnitPrimaryLaneTotal,
    "workUnitSelectedTabCount",
    ()=>workUnitSelectedTabCount,
    "workUnitSelectedTabFromContext",
    ()=>workUnitSelectedTabFromContext,
    "workUnitSummedQueueHeads",
    ()=>workUnitSummedQueueHeads,
    "workUnitTotalInQueueFromContext",
    ()=>workUnitTotalInQueueFromContext,
    "workspaceLifecycleTotalInScope",
    ()=>workspaceLifecycleTotalInScope,
    "workspacePipelineExactTotalInScope",
    ()=>workspacePipelineExactTotalInScope
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$growthSliceDepartments$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/workspace/growthSliceDepartments.ts [app-client] (ecmascript)");
;
function workspacePipelineExactTotalInScope(snapshots) {
    let sum = 0;
    let saw = false;
    for (const { departmentKey, pipelineExact } of snapshots){
        if (!(0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$growthSliceDepartments$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["isGrowthSliceDepartmentKey"])(departmentKey)) continue;
        if (pipelineExact?.total != null) {
            saw = true;
            sum += Math.max(0, pipelineExact.total);
        }
    }
    return saw ? sum : null;
}
function workspaceLifecycleTotalInScope(growthSnapshots) {
    let sum = 0;
    let saw = false;
    for (const { departmentKey, kpis } of growthSnapshots){
        if (!(0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$growthSliceDepartments$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["isGrowthSliceDepartmentKey"])(departmentKey) || !kpis?.counts) continue;
        saw = true;
        sum += Math.max(0, kpis.counts.total ?? 0);
    }
    return saw ? sum : null;
}
function departmentSumWorkUnitTotals(params) {
    if (params.deptQueueSummariesLoading || params.deptQueueSummariesError) return null;
    const list = params.deptWorkUnits;
    if (!list.length) return 0;
    let sum = 0;
    for (const wu of list){
        const s = params.deptWorkUnitSummaries[wu.id];
        if (!s) return null;
        sum += s.total;
    }
    return sum;
}
function departmentNeedsAttentionSumSafe(params) {
    if (params.deptQueueSummariesLoading || params.deptQueueSummariesError) return null;
    const list = params.deptWorkUnits;
    if (!list.length) return 0;
    let sum = 0;
    for (const wu of list){
        const n = params.deptWorkUnitSummaries[wu.id]?.needs_attention;
        if (n == null) return null;
        sum += n;
    }
    return sum;
}
function workUnitSummedQueueHeads(summaries) {
    if (!summaries?.length) return null;
    let sum = 0;
    for (const q of summaries){
        if (q.counts_deferred === true) return null;
        if (typeof q.count !== "number" || Number.isNaN(q.count)) return null;
        sum += q.count;
    }
    return sum;
}
function workUnitNeedsAttentionCount(summaries) {
    if (!summaries?.length) return null;
    const row = summaries.find((q)=>(q.key ?? "").trim().toLowerCase() === "needs_attention");
    if (!row) return null;
    if (row.counts_deferred === true) return null;
    if (typeof row.count !== "number") return null;
    return row.count;
}
function workUnitPrimaryLaneTotal(summaries) {
    if (!summaries?.length) return null;
    const first = summaries[0];
    if (first.counts_deferred === true) return null;
    if (typeof first.count !== "number") return null;
    return first.count;
}
function filterVmItemIds(items) {
    let n = 0;
    for (const r of items){
        if (typeof r === "object" && r != null && typeof r.id === "string" && String(r.id).trim()) {
            n++;
        }
    }
    return n;
}
function workUnitSelectedTabCount(params) {
    const { summaries, selectedQueueKey, queueItems, queueItemsLoading, queueItemsError } = params;
    if (queueItemsError) return null;
    if (!summaries?.length) return null;
    const activeQueue = selectedQueueKey ? summaries.find((q)=>q.key === selectedQueueKey) ?? summaries[0] : summaries[0];
    if (!activeQueue) return null;
    const tabCount = activeQueue.counts_deferred === true ? undefined : typeof activeQueue.count === "number" ? activeQueue.count : undefined;
    if (queueItems && queueItems.queue.key !== activeQueue.key) {
        return null;
    }
    if (queueItems == null) {
        if (typeof tabCount === "number") return tabCount;
        return queueItemsLoading ? null : null;
    }
    const vmLen = filterVmItemIds(queueItems.items ?? []);
    const reconcileListEmptyVsTab = !queueItemsLoading && queueItems.queue.key === activeQueue.key && (queueItems.offset ?? 0) === 0 && vmLen === 0 && queueItems.total_omitted === true && typeof tabCount === "number" && tabCount > 0;
    if (reconcileListEmptyVsTab) return 0;
    if (queueItems.total_omitted === true && typeof tabCount === "number") return tabCount;
    if (typeof queueItems.total === "number") return queueItems.total;
    if (typeof tabCount === "number") return tabCount;
    return null;
}
function workUnitTotalInQueueFromContext(params) {
    const fromQueues = workUnitSummedQueueHeads(params.queueSummaries);
    if (fromQueues != null) return fromQueues;
    if (params.legacyOpportunityListTotal != null) return params.legacyOpportunityListTotal;
    return null;
}
function workUnitSelectedTabFromContext(ctx) {
    const n = workUnitSelectedTabCount({
        summaries: ctx.queueSummaries,
        selectedQueueKey: ctx.selectedQueueKey,
        queueItems: ctx.queueItems,
        queueItemsLoading: ctx.queueItemsLoading,
        queueItemsError: ctx.queueItemsError
    });
    if (n != null) return n;
    if (!ctx.queueSummaries?.length && ctx.legacyOpportunityListTotal != null) return ctx.legacyOpportunityListTotal;
    return null;
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/lib/kpi/baseline.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "buildDefaultDepartmentKpis",
    ()=>buildDefaultDepartmentKpis,
    "buildDefaultWorkUnitKpis",
    ()=>buildDefaultWorkUnitKpis,
    "buildDefaultWorkspaceKpis",
    ()=>buildDefaultWorkspaceKpis
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$viewModels$2f$workspaceRootRollup$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/workspace/viewModels/workspaceRootRollup.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$kpi$2f$contextKpiMetrics$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/kpi/contextKpiMetrics.ts [app-client] (ecmascript)");
;
;
function formatInt(n) {
    if (n == null || Number.isNaN(n)) return "—";
    return String(Math.max(0, Math.floor(n)));
}
function buildDefaultWorkspaceKpis(metrics, growthSnapshots) {
    const mapped = growthSnapshots.map((s)=>({
            departmentKey: s.key,
            kpis: s.lifecycleAnalytics,
            pipelineExact: s.pipelineExact ?? undefined
        }));
    const inScope = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$kpi$2f$contextKpiMetrics$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["workspacePipelineExactTotalInScope"])(mapped);
    const contextFirst = inScope != null ? [
        {
            id: "baseline.ctx.workspace.total_in_scope",
            label: "Inquiries (pipeline lane)",
            value: String(inScope),
            lane: "business"
        }
    ] : [];
    const structure = [
        {
            id: "depts",
            label: "Departments",
            value: formatInt(metrics?.departments),
            lane: "business"
        },
        {
            id: "wu",
            label: "Work units",
            value: formatInt(metrics?.workUnits),
            lane: "business"
        }
    ];
    const roll = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$viewModels$2f$workspaceRootRollup$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["buildWorkspaceRootOrgOpportunityKpis"])(growthSnapshots);
    return [
        ...contextFirst,
        ...structure,
        ...roll
    ];
}
function buildDefaultDepartmentKpis(params) {
    const list = params.deptWorkUnits;
    if (!list.length) return [];
    const agg = [];
    if (!params.deptQueueSummariesLoading && !params.deptQueueSummariesError) {
        const total = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$kpi$2f$contextKpiMetrics$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["departmentSumWorkUnitTotals"])(params);
        const needs = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$kpi$2f$contextKpiMetrics$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["departmentNeedsAttentionSumSafe"])(params);
        if (total != null) {
            agg.push({
                id: "baseline.ctx.dept.total_in_scope",
                label: "Total in department",
                value: String(total),
                lane: "business"
            });
        }
        if (needs != null) {
            agg.push({
                id: "baseline.ctx.dept.needs_attention_count",
                label: "Needs attention",
                value: String(needs),
                lane: "business"
            });
        }
    }
    const facets = list.map((wu)=>{
        const summary = params.deptWorkUnitSummaries[wu.id];
        const value = params.deptQueueSummariesLoading || params.deptQueueSummariesError ? "—" : summary ? String(summary.total) : "—";
        const key = (wu.key ?? "").trim().toLowerCase();
        const label = key === "enrollment_pipeline" || key === "pipeline_overview" ? "Active inquiries" : wu.name?.trim() || "Work unit";
        return {
            id: `wu_${wu.id}`,
            label,
            value,
            lane: "business"
        };
    });
    return [
        ...agg,
        ...facets
    ];
}
function formatMetricValue(n) {
    if (n == null || Number.isNaN(n)) return "—";
    return String(Math.max(0, Math.floor(n)));
}
function buildDefaultWorkUnitKpis(context) {
    if (context.queueSummariesLoading || context.queueSummariesError) return [];
    const items = [];
    const all = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$kpi$2f$contextKpiMetrics$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["workUnitTotalInQueueFromContext"])({
        queueSummaries: context.queueSummaries,
        legacyOpportunityListTotal: context.legacyOpportunityListTotal
    });
    if (all != null) {
        items.push({
            id: "baseline.ctx.wu.total_in_queue",
            label: "All queues total",
            value: formatMetricValue(all),
            lane: "business"
        });
    }
    const sel = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$kpi$2f$contextKpiMetrics$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["workUnitSelectedTabFromContext"])(context);
    if (sel != null) {
        items.push({
            id: "baseline.ctx.wu.selected_queue_count",
            label: "This queue",
            value: formatMetricValue(sel),
            lane: "business"
        });
    }
    const needs = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$kpi$2f$contextKpiMetrics$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["workUnitNeedsAttentionCount"])(context.queueSummaries);
    if (needs != null) {
        items.push({
            id: "baseline.ctx.wu.needs_attention_count",
            label: "Needs attention",
            value: formatMetricValue(needs),
            lane: "business"
        });
    }
    return items;
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/lib/kpi/registry.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "getMetricDefinition",
    ()=>getMetricDefinition,
    "isKnownMetricKey",
    ()=>isKnownMetricKey,
    "listMetricDefinitions",
    ()=>listMetricDefinitions,
    "metricFormatUnitLabel",
    ()=>metricFormatUnitLabel,
    "validateMetricForSurface",
    ()=>validateMetricForSurface
]);
const DEFINITIONS = {
    "org.structure.departments_count": {
        key: "org.structure.departments_count",
        family: "S",
        allowedSurfaces: [
            "workspace"
        ],
        defaultLabel: "Departments",
        defaultLane: "business",
        defaultFormat: "count"
    },
    "org.structure.work_units_count": {
        key: "org.structure.work_units_count",
        family: "S",
        allowedSurfaces: [
            "workspace"
        ],
        defaultLabel: "Work units",
        defaultLane: "business",
        defaultFormat: "count"
    },
    "org.pipeline.active_in_motion": {
        key: "org.pipeline.active_in_motion",
        family: "R",
        allowedSurfaces: [
            "workspace"
        ],
        defaultLabel: "Active pipeline",
        defaultLane: "business",
        defaultFormat: "count"
    },
    "org.pipeline.pipeline_value_open": {
        key: "org.pipeline.pipeline_value_open",
        family: "R",
        allowedSurfaces: [
            "workspace"
        ],
        defaultLabel: "Pipeline value",
        defaultLane: "business",
        defaultFormat: "currency"
    },
    "org.pipeline.closed_outcomes": {
        key: "org.pipeline.closed_outcomes",
        family: "R",
        allowedSurfaces: [
            "workspace"
        ],
        defaultLabel: "Closed outcomes",
        defaultLane: "business",
        defaultFormat: "count"
    },
    "ctx.workspace.total_in_scope": {
        key: "ctx.workspace.total_in_scope",
        family: "L",
        allowedSurfaces: [
            "workspace"
        ],
        defaultLabel: "Opportunities in pipeline scope",
        defaultLane: "business",
        defaultFormat: "count"
    },
    "dept.wu_queue.total_per_work_unit": {
        key: "dept.wu_queue.total_per_work_unit",
        family: "Q",
        allowedSurfaces: [
            "department"
        ],
        defaultLabel: "Work unit",
        defaultLane: "business",
        defaultFormat: "count"
    },
    "ctx.dept.total_in_scope": {
        key: "ctx.dept.total_in_scope",
        family: "Q",
        allowedSurfaces: [
            "department"
        ],
        defaultLabel: "Total in department",
        defaultLane: "business",
        defaultFormat: "count"
    },
    "ctx.dept.queue_total": {
        key: "ctx.dept.queue_total",
        family: "Q",
        allowedSurfaces: [
            "department"
        ],
        defaultLabel: "Queue heads (dept)",
        defaultLane: "business",
        defaultFormat: "count"
    },
    "ctx.dept.needs_attention_count": {
        key: "ctx.dept.needs_attention_count",
        family: "Q",
        allowedSurfaces: [
            "department"
        ],
        defaultLabel: "Needs attention",
        defaultLane: "business",
        defaultFormat: "count"
    },
    "wu.queue.selected_tab_count": {
        key: "wu.queue.selected_tab_count",
        family: "Q",
        allowedSurfaces: [
            "work_unit"
        ],
        defaultLabel: "Selected queue",
        defaultLane: "business",
        defaultFormat: "count"
    },
    "wu.queue.primary_lane_total": {
        key: "wu.queue.primary_lane_total",
        family: "Q",
        allowedSurfaces: [
            "work_unit"
        ],
        defaultLabel: "Primary lane",
        defaultLane: "business",
        defaultFormat: "count"
    },
    "ctx.wu.total_in_queue": {
        key: "ctx.wu.total_in_queue",
        family: "Q",
        allowedSurfaces: [
            "work_unit"
        ],
        defaultLabel: "All queues total",
        defaultLane: "business",
        defaultFormat: "count"
    },
    "ctx.wu.selected_queue_count": {
        key: "ctx.wu.selected_queue_count",
        family: "Q",
        allowedSurfaces: [
            "work_unit"
        ],
        defaultLabel: "This queue",
        defaultLane: "business",
        defaultFormat: "count"
    },
    "ctx.wu.primary_lane_total": {
        key: "ctx.wu.primary_lane_total",
        family: "Q",
        allowedSurfaces: [
            "work_unit"
        ],
        defaultLabel: "First lane total",
        defaultLane: "business",
        defaultFormat: "count"
    },
    "ctx.wu.needs_attention_count": {
        key: "ctx.wu.needs_attention_count",
        family: "Q",
        allowedSurfaces: [
            "work_unit"
        ],
        defaultLabel: "Needs attention",
        defaultLane: "business",
        defaultFormat: "count"
    }
};
const KEYS = new Set(Object.keys(DEFINITIONS));
function isKnownMetricKey(key) {
    return KEYS.has(key);
}
function getMetricDefinition(key) {
    return DEFINITIONS[key];
}
function validateMetricForSurface(key, surface) {
    return getMetricDefinition(key).allowedSurfaces.includes(surface);
}
function listMetricDefinitions() {
    return Object.freeze(Object.values(DEFINITIONS));
}
function metricFormatUnitLabel(format) {
    switch(format){
        case "count":
            return "Count";
        case "currency":
            return "Currency";
        case "percent":
            return "Percent";
        case "duration":
            return "Duration";
        case "text":
            return "Text";
        default:
            return "—";
    }
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/lib/kpi/resolver.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "resolveKpisForDepartment",
    ()=>resolveKpisForDepartment,
    "resolveKpisForWorkUnit",
    ()=>resolveKpisForWorkUnit,
    "resolveKpisForWorkspace",
    ()=>resolveKpisForWorkspace
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$viewModels$2f$workspaceRootRollup$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/workspace/viewModels/workspaceRootRollup.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$kpi$2f$baseline$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/kpi/baseline.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$kpi$2f$contextKpiMetrics$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/kpi/contextKpiMetrics.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$kpi$2f$registry$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/kpi/registry.ts [app-client] (ecmascript)");
;
;
;
;
const FACET_MAX_WORK_UNITS = 12;
function formatInt(n) {
    if (n == null || Number.isNaN(n)) return "—";
    return String(Math.max(0, Math.floor(n)));
}
function vmFromRow(metricKey, value, row) {
    const def = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$kpi$2f$registry$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getMetricDefinition"])(metricKey);
    const lane = row?.lane_override ?? def.defaultLane;
    return {
        id: metricKey,
        label: row?.label_override?.trim() || def.defaultLabel,
        value,
        lane
    };
}
function mapPipelineCellToMetricKey(orgKpis, metricKey) {
    const order = [
        "org.pipeline.active_in_motion",
        "org.pipeline.pipeline_value_open",
        "org.pipeline.closed_outcomes"
    ];
    const idx = order.indexOf(metricKey);
    if (idx < 0 || idx >= orgKpis.length) return null;
    const src = orgKpis[idx];
    if (!src) return null;
    return {
        id: metricKey,
        label: src.label,
        value: src.value,
        lane: src.lane ?? "business",
        unit: src.unit
    };
}
function sortPlacements(rows) {
    return [
        ...rows
    ].sort((a, b)=>{
        if (a.display_order !== b.display_order) return a.display_order - b.display_order;
        return a.metric_key.localeCompare(b.metric_key);
    });
}
function resolveKpisForWorkspace(params) {
    const warnings = [];
    const visible = params.placementRows.filter((r)=>r.is_visible !== false);
    const baseline = ()=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$kpi$2f$baseline$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["buildDefaultWorkspaceKpis"])(params.metrics, params.growthSnapshots);
    if (visible.length === 0) {
        if (!params.scopeHasPlacementRows) {
            return {
                items: baseline(),
                warnings
            };
        }
        return {
            items: [],
            warnings
        };
    }
    const orgPipeline = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$viewModels$2f$workspaceRootRollup$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["buildWorkspaceRootOrgOpportunityKpis"])(params.growthSnapshots);
    const items = [];
    for (const row of sortPlacements(visible)){
        const mk = row.metric_key;
        if (!(0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$kpi$2f$registry$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["isKnownMetricKey"])(mk)) {
            warnings.push(`unknown_metric_key:${mk}`);
            continue;
        }
        if (!(0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$kpi$2f$registry$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["validateMetricForSurface"])(mk, "workspace")) {
            warnings.push(`surface_mismatch:${mk}:workspace`);
            continue;
        }
        switch(mk){
            case "ctx.workspace.total_in_scope":
                {
                    const n = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$kpi$2f$contextKpiMetrics$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["workspacePipelineExactTotalInScope"])(params.growthSnapshots.map((s)=>({
                            departmentKey: s.key,
                            kpis: s.lifecycleAnalytics,
                            pipelineExact: s.pipelineExact ?? undefined
                        })));
                    items.push(vmFromRow(mk, formatInt(n), row));
                    break;
                }
            case "org.structure.departments_count":
                items.push(vmFromRow(mk, formatInt(params.metrics?.departments), row));
                break;
            case "org.structure.work_units_count":
                items.push(vmFromRow(mk, formatInt(params.metrics?.workUnits), row));
                break;
            case "org.pipeline.active_in_motion":
            case "org.pipeline.pipeline_value_open":
            case "org.pipeline.closed_outcomes":
                {
                    const cell = mapPipelineCellToMetricKey(orgPipeline, mk);
                    if (!cell) {
                        warnings.push(`pipeline_cell_missing:${mk}`);
                        continue;
                    }
                    if (row.label_override?.trim()) cell.label = row.label_override.trim();
                    if (row.lane_override) cell.lane = row.lane_override;
                    items.push(cell);
                    break;
                }
            default:
                warnings.push(`unhandled_workspace_metric:${mk}`);
        }
    }
    if (items.length === 0) {
        if (!params.scopeHasPlacementRows) {
            return {
                items: baseline(),
                warnings
            };
        }
        return {
            items: [],
            warnings
        };
    }
    return {
        items,
        warnings
    };
}
function resolveKpisForDepartment(params) {
    const warnings = [];
    const deptCtx = {
        deptWorkUnits: params.deptWorkUnits,
        deptWorkUnitSummaries: params.deptWorkUnitSummaries,
        deptQueueSummariesLoading: params.deptQueueSummariesLoading,
        deptQueueSummariesError: params.deptQueueSummariesError
    };
    const baseline = ()=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$kpi$2f$baseline$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["buildDefaultDepartmentKpis"])(deptCtx);
    const visible = params.placementRows.filter((r)=>r.is_visible !== false);
    if (visible.length === 0) {
        if (!params.scopeHasPlacementRows) {
            return {
                items: baseline(),
                warnings
            };
        }
        return {
            items: [],
            warnings
        };
    }
    const items = [];
    for (const row of sortPlacements(visible)){
        const mk = row.metric_key;
        if (!(0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$kpi$2f$registry$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["isKnownMetricKey"])(mk)) {
            warnings.push(`unknown_metric_key:${mk}`);
            continue;
        }
        if (!(0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$kpi$2f$registry$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["validateMetricForSurface"])(mk, "department")) {
            warnings.push(`surface_mismatch:${mk}:department`);
            continue;
        }
        if (mk === "dept.wu_queue.total_per_work_unit") {
            const list = params.deptWorkUnits;
            const slice = list.slice(0, FACET_MAX_WORK_UNITS);
            if (list.length > FACET_MAX_WORK_UNITS) {
                warnings.push("facet_cap_exceeded");
            }
            for (const wu of slice){
                const summary = params.deptWorkUnitSummaries[wu.id];
                const value = params.deptQueueSummariesLoading || params.deptQueueSummariesError ? "—" : summary ? String(summary.total) : "—";
                const key = (wu.key ?? "").trim().toLowerCase();
                const label = key === "enrollment_pipeline" || key === "pipeline_overview" ? "Active inquiries" : wu.name?.trim() || "Work unit";
                items.push({
                    id: `${mk}:${wu.id}`,
                    label,
                    value,
                    lane: row.lane_override ?? "business"
                });
            }
        } else if (mk === "ctx.dept.total_in_scope" || mk === "ctx.dept.queue_total") {
            const n = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$kpi$2f$contextKpiMetrics$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["departmentSumWorkUnitTotals"])(deptCtx);
            items.push(vmFromRow(mk, formatInt(n), row));
        } else if (mk === "ctx.dept.needs_attention_count") {
            const n = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$kpi$2f$contextKpiMetrics$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["departmentNeedsAttentionSumSafe"])(deptCtx);
            items.push(vmFromRow(mk, formatInt(n), row));
        } else {
            warnings.push(`unhandled_department_metric:${mk}`);
        }
    }
    if (items.length === 0) {
        if (!params.scopeHasPlacementRows) {
            return {
                items: baseline(),
                warnings
            };
        }
        return {
            items: [],
            warnings
        };
    }
    return {
        items,
        warnings
    };
}
function resolveKpisForWorkUnit(params) {
    const warnings = [];
    const baseline = ()=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$kpi$2f$baseline$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["buildDefaultWorkUnitKpis"])(params.context);
    const visible = params.placementRows.filter((r)=>r.is_visible !== false);
    if (visible.length === 0) {
        if (!params.scopeHasPlacementRows) {
            return {
                items: baseline(),
                warnings
            };
        }
        return {
            items: [],
            warnings
        };
    }
    const items = [];
    const ctx = params.context;
    for (const row of sortPlacements(visible)){
        const mk = row.metric_key;
        if (!(0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$kpi$2f$registry$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["isKnownMetricKey"])(mk)) {
            warnings.push(`unknown_metric_key:${mk}`);
            continue;
        }
        if (!(0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$kpi$2f$registry$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["validateMetricForSurface"])(mk, "work_unit")) {
            warnings.push(`surface_mismatch:${mk}:work_unit`);
            continue;
        }
        const fmt = (n)=>formatInt(n);
        switch(mk){
            case "ctx.wu.total_in_queue":
                items.push(vmFromRow(mk, fmt((0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$kpi$2f$contextKpiMetrics$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["workUnitTotalInQueueFromContext"])({
                    queueSummaries: ctx.queueSummaries,
                    legacyOpportunityListTotal: ctx.legacyOpportunityListTotal
                })), row));
                break;
            case "ctx.wu.selected_queue_count":
            case "wu.queue.selected_tab_count":
                items.push(vmFromRow(mk, fmt((0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$kpi$2f$contextKpiMetrics$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["workUnitSelectedTabFromContext"])(ctx)), row));
                break;
            case "ctx.wu.primary_lane_total":
            case "wu.queue.primary_lane_total":
                items.push(vmFromRow(mk, fmt((0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$kpi$2f$contextKpiMetrics$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["workUnitPrimaryLaneTotal"])(ctx.queueSummaries)), row));
                break;
            case "ctx.wu.needs_attention_count":
                items.push(vmFromRow(mk, fmt((0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$kpi$2f$contextKpiMetrics$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["workUnitNeedsAttentionCount"])(ctx.queueSummaries)), row));
                break;
            default:
                warnings.push(`unhandled_work_unit_metric:${mk}`);
        }
    }
    if (items.length === 0) {
        if (!params.scopeHasPlacementRows) {
            return {
                items: baseline(),
                warnings
            };
        }
        return {
            items: [],
            warnings
        };
    }
    return {
        items,
        warnings
    };
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/components/admin/workspace/workspaceRouteSkeletons.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "DepartmentRouteSkeletonBody",
    ()=>DepartmentRouteSkeletonBody,
    "WorkUnitRouteSkeletonBody",
    ()=>WorkUnitRouteSkeletonBody,
    "WsRouteLoadingRibbon",
    ()=>WsRouteLoadingRibbon
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
;
;
function WsRouteLoadingRibbon({ label = "Loading" }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "ws-route-loading-ribbon",
        role: "progressbar",
        "aria-label": label,
        "aria-busy": "true",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "ws-route-loading-ribbon__bar"
        }, void 0, false, {
            fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
            lineNumber: 12,
            columnNumber: 13
        }, this)
    }, void 0, false, {
        fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
        lineNumber: 6,
        columnNumber: 9
    }, this);
}
_c = WsRouteLoadingRibbon;
function KpiBannerSkeleton() {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "adminv2-ws-kpi-root-band",
        role: "status",
        "aria-label": "Loading KPI banner",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "adminv2-ws-kpi-strip adminv2-ws-kpi-strip--single-band",
            role: "list",
            "aria-hidden": true,
            children: Array.from({
                length: 6
            }).map((_, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "adminv2-ws-kpi-cell adminv2-ws-kpi-cell--single-band adminv2-ws-kpi-cell--placeholder",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "adminv2-ws-kpi-label",
                            children: " "
                        }, void 0, false, {
                            fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                            lineNumber: 26,
                            columnNumber: 25
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "adminv2-ws-kpi-value adminv2-ws-kpi-value--placeholder",
                            children: "—"
                        }, void 0, false, {
                            fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                            lineNumber: 27,
                            columnNumber: 25
                        }, this)
                    ]
                }, i, true, {
                    fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                    lineNumber: 22,
                    columnNumber: 21
                }, this))
        }, void 0, false, {
            fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
            lineNumber: 20,
            columnNumber: 13
        }, this)
    }, void 0, false, {
        fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
        lineNumber: 19,
        columnNumber: 9
    }, this);
}
_c1 = KpiBannerSkeleton;
function QueueCardSkeleton({ variant }) {
    const cardClass = variant === "attention" ? "adminv2-ws-wu-queue-card adminv2-ws-wu-queue-card--compact adminv2-ws-wu-queue-card--attention adminv2-ws-wu-queue-card--tier-warning" : "adminv2-ws-wu-queue-card adminv2-ws-wu-queue-card--compact adminv2-ws-wu-queue-card--tier-standard";
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: `${cardClass} flex flex-col items-stretch`,
        "aria-hidden": true,
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "adminv2-ws-wu-queue-card-compact-text",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "h-3 w-40 adminv2-shimmer-bar rounded bg-alloy-stone/20"
                    }, void 0, false, {
                        fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                        lineNumber: 43,
                        columnNumber: 17
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "mt-2 h-3 w-56 adminv2-shimmer-bar rounded bg-alloy-stone/12",
                        style: {
                            animationDelay: "70ms"
                        }
                    }, void 0, false, {
                        fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                        lineNumber: 44,
                        columnNumber: 17
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] tabular-nums",
                        style: {
                            color: "var(--d-muted)"
                        },
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "font-medium text-alloy-midnight/75",
                                        children: "Count"
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                        lineNumber: 47,
                                        columnNumber: 25
                                    }, this),
                                    " ",
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "inline-block h-3 w-10 align-middle adminv2-shimmer-bar rounded bg-alloy-stone/12",
                                        style: {
                                            animationDelay: "120ms"
                                        }
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                        lineNumber: 48,
                                        columnNumber: 25
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                lineNumber: 46,
                                columnNumber: 21
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "text-right",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "font-medium text-alloy-midnight/75",
                                        children: "Value"
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                        lineNumber: 54,
                                        columnNumber: 25
                                    }, this),
                                    " ",
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "inline-block h-3 w-14 align-middle adminv2-shimmer-bar rounded bg-alloy-stone/12",
                                        style: {
                                            animationDelay: "160ms"
                                        }
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                        lineNumber: 55,
                                        columnNumber: 25
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                lineNumber: 53,
                                columnNumber: 21
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                        lineNumber: 45,
                        columnNumber: 17
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                lineNumber: 42,
                columnNumber: 13
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "adminv2-ws-wu-queue-card-compact-aside",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                    className: "adminv2-ws-wu-queue-action-chip adminv2-ws-wu-queue-action-chip--open",
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "inline-block h-3 w-16 align-middle adminv2-shimmer-bar rounded bg-alloy-stone/10",
                        style: {
                            animationDelay: "90ms"
                        }
                    }, void 0, false, {
                        fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                        lineNumber: 64,
                        columnNumber: 21
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                    lineNumber: 63,
                    columnNumber: 17
                }, this)
            }, void 0, false, {
                fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                lineNumber: 62,
                columnNumber: 13
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
        lineNumber: 41,
        columnNumber: 9
    }, this);
}
_c2 = QueueCardSkeleton;
function DepartmentRouteSkeletonBody() {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        "data-ws-surface": "department",
        className: "adminv2-ws-root adminv2-ws-department adminv2-ws-dept-v2",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "adminv2-ws-dept-v2-contain",
            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "adminv2-ws-dept-v2-page-split",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "adminv2-ws-dept-v2-primary-column",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "adminv2-ws-dept-v2-control-deck",
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "adminv2-ws-dept-v2-top-stack",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "adminv2-ws-dept-v2-brief",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "adminv2-ws-dept-v2-brief-focus-label",
                                                    children: "Today's focus"
                                                }, void 0, false, {
                                                    fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                                    lineNumber: 84,
                                                    columnNumber: 37
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "adminv2-ws-dept-v2-brief-head-row",
                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                                                        className: "adminv2-ws-dept-v2-brief-headline adminv2-ws-dept-v2-brief-headline--placeholder",
                                                        children: "Loading department"
                                                    }, void 0, false, {
                                                        fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                                        lineNumber: 86,
                                                        columnNumber: 41
                                                    }, this)
                                                }, void 0, false, {
                                                    fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                                    lineNumber: 85,
                                                    columnNumber: 37
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "mt-3 space-y-2 max-w-3xl",
                                                    "aria-hidden": true,
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            className: "h-3 w-full adminv2-shimmer-bar rounded bg-alloy-stone/15"
                                                        }, void 0, false, {
                                                            fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                                            lineNumber: 91,
                                                            columnNumber: 41
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            className: "h-3 w-2/3 adminv2-shimmer-bar rounded bg-alloy-stone/10",
                                                            style: {
                                                                animationDelay: "70ms"
                                                            }
                                                        }, void 0, false, {
                                                            fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                                            lineNumber: 92,
                                                            columnNumber: 41
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                                    lineNumber: 90,
                                                    columnNumber: 37
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                            lineNumber: 83,
                                            columnNumber: 33
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            "data-workspace-zone": "kpi-banner",
                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(KpiBannerSkeleton, {}, void 0, false, {
                                                fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                                lineNumber: 96,
                                                columnNumber: 37
                                            }, this)
                                        }, void 0, false, {
                                            fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                            lineNumber: 95,
                                            columnNumber: 33
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                    lineNumber: 82,
                                    columnNumber: 29
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                lineNumber: 81,
                                columnNumber: 25
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "adminv2-ws-dept-v2-operational-row adminv2-ws-dept-v2-operational-row--triple",
                                "aria-label": "Operational lanes",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "adminv2-ws-dept-v2-lane adminv2-ws-dept-v2-lane--throughput",
                                        "data-ws-lane-kind": "throughput",
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "adminv2-ws-dept-v2-lane-chrome adminv2-ws-dept-v2-lane-chrome--throughput-deck",
                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                                                className: "adminv2-ws-dept-qsec adminv2-ws-dept-qsec--primary adminv2-ws-dept-throughput-panel",
                                                "aria-label": "Pipeline lanes",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("header", {
                                                        className: "adminv2-ws-queue-header",
                                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            className: "adminv2-ws-queue-title-row",
                                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                                                className: "adminv2-ws-queue-title",
                                                                children: "Pipeline"
                                                            }, void 0, false, {
                                                                fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                                                lineNumber: 113,
                                                                columnNumber: 49
                                                            }, this)
                                                        }, void 0, false, {
                                                            fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                                            lineNumber: 112,
                                                            columnNumber: 45
                                                        }, this)
                                                    }, void 0, false, {
                                                        fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                                        lineNumber: 111,
                                                        columnNumber: 41
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: "adminv2-ws-wu-v2",
                                                        "data-ws-surface": "work_unit",
                                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                                                            className: "adminv2-ws-queue-list",
                                                            role: "list",
                                                            "aria-hidden": true,
                                                            children: Array.from({
                                                                length: 3
                                                            }).map((_, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                                                    className: "adminv2-ws-wu-queue-item-wrap",
                                                                    role: "listitem",
                                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(QueueCardSkeleton, {
                                                                        variant: "standard"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                                                        lineNumber: 120,
                                                                        columnNumber: 57
                                                                    }, this)
                                                                }, i, false, {
                                                                    fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                                                    lineNumber: 119,
                                                                    columnNumber: 53
                                                                }, this))
                                                        }, void 0, false, {
                                                            fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                                            lineNumber: 117,
                                                            columnNumber: 45
                                                        }, this)
                                                    }, void 0, false, {
                                                        fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                                        lineNumber: 116,
                                                        columnNumber: 41
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                                lineNumber: 107,
                                                columnNumber: 37
                                            }, this)
                                        }, void 0, false, {
                                            fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                            lineNumber: 106,
                                            columnNumber: 33
                                        }, this)
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                        lineNumber: 105,
                                        columnNumber: 29
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "adminv2-ws-dept-v2-lane adminv2-ws-dept-v2-lane--attention",
                                        "data-ws-lane-kind": "attention",
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "adminv2-ws-dept-v2-lane-chrome adminv2-ws-dept-v2-board-secondary-slot",
                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                                                className: "adminv2-ws-dept-qsec adminv2-ws-dept-qsec--secondary adminv2-ws-dept-attention-panel",
                                                "aria-label": "Needs Attention",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("header", {
                                                        className: "adminv2-ws-attention-panel-header",
                                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                    className: "adminv2-ws-attention-panel-kicker",
                                                                    children: "Needs attention"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                                                    lineNumber: 137,
                                                                    columnNumber: 49
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                                                    className: "adminv2-ws-attention-panel-title",
                                                                    children: "Needs Attention"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                                                    lineNumber: 138,
                                                                    columnNumber: 49
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                    className: "mt-2 space-y-2",
                                                                    "aria-hidden": true,
                                                                    children: [
                                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                            className: "h-3 w-48 adminv2-shimmer-bar rounded bg-alloy-stone/10"
                                                                        }, void 0, false, {
                                                                            fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                                                            lineNumber: 140,
                                                                            columnNumber: 53
                                                                        }, this),
                                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                            className: "h-3 w-56 adminv2-shimmer-bar rounded bg-alloy-stone/10",
                                                                            style: {
                                                                                animationDelay: "90ms"
                                                                            }
                                                                        }, void 0, false, {
                                                                            fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                                                            lineNumber: 141,
                                                                            columnNumber: 53
                                                                        }, this)
                                                                    ]
                                                                }, void 0, true, {
                                                                    fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                                                    lineNumber: 139,
                                                                    columnNumber: 49
                                                                }, this)
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                                            lineNumber: 136,
                                                            columnNumber: 45
                                                        }, this)
                                                    }, void 0, false, {
                                                        fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                                        lineNumber: 135,
                                                        columnNumber: 41
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: "adminv2-ws-attention-stack",
                                                        "aria-hidden": true,
                                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            className: "adminv2-ws-attention-card adminv2-ws-attention-card--queue-aligned",
                                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                className: "adminv2-ws-wu-v2",
                                                                "data-ws-surface": "work_unit",
                                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                                                                    className: "adminv2-ws-queue-list",
                                                                    role: "list",
                                                                    children: Array.from({
                                                                        length: 2
                                                                    }).map((_, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                                                            className: "adminv2-ws-wu-queue-item-wrap",
                                                                            role: "listitem",
                                                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(QueueCardSkeleton, {
                                                                                variant: "attention"
                                                                            }, void 0, false, {
                                                                                fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                                                                lineNumber: 151,
                                                                                columnNumber: 65
                                                                            }, this)
                                                                        }, i, false, {
                                                                            fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                                                            lineNumber: 150,
                                                                            columnNumber: 61
                                                                        }, this))
                                                                }, void 0, false, {
                                                                    fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                                                    lineNumber: 148,
                                                                    columnNumber: 53
                                                                }, this)
                                                            }, void 0, false, {
                                                                fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                                                lineNumber: 147,
                                                                columnNumber: 49
                                                            }, this)
                                                        }, void 0, false, {
                                                            fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                                            lineNumber: 146,
                                                            columnNumber: 45
                                                        }, this)
                                                    }, void 0, false, {
                                                        fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                                        lineNumber: 145,
                                                        columnNumber: 41
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                                lineNumber: 131,
                                                columnNumber: 37
                                            }, this)
                                        }, void 0, false, {
                                            fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                            lineNumber: 130,
                                            columnNumber: 33
                                        }, this)
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                        lineNumber: 129,
                                        columnNumber: 29
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                lineNumber: 101,
                                columnNumber: 25
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                        lineNumber: 80,
                        columnNumber: 21
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "adminv2-ws-dept-v2-command-column",
                        "data-adminv2-workspace-command-column": true,
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("aside", {
                            className: "adminv2-ws-dept-v2-rail adminv2-ws-dept-v2-rail--command-shell",
                            "data-adminv2-workspace-command-rail": true,
                            "aria-label": "Decisions and actions",
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                                className: "adminv2-ws-actions-rail adminv2-ws-actions-rail--dept-panel px-3 pb-3 pt-3",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "h-4 w-20 adminv2-shimmer-bar rounded bg-alloy-stone/15",
                                        "aria-hidden": true
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                        lineNumber: 171,
                                        columnNumber: 33
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "mt-3 space-y-2",
                                        "aria-hidden": true,
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "h-8 w-full adminv2-shimmer-bar rounded-md bg-alloy-stone/10"
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                                lineNumber: 173,
                                                columnNumber: 37
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "h-8 w-full adminv2-shimmer-bar rounded-md bg-alloy-stone/10",
                                                style: {
                                                    animationDelay: "55ms"
                                                }
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                                lineNumber: 174,
                                                columnNumber: 37
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "h-8 w-full adminv2-shimmer-bar rounded-md bg-alloy-stone/10",
                                                style: {
                                                    animationDelay: "110ms"
                                                }
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                                lineNumber: 175,
                                                columnNumber: 37
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                        lineNumber: 172,
                                        columnNumber: 33
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                lineNumber: 170,
                                columnNumber: 29
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                            lineNumber: 165,
                            columnNumber: 25
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                        lineNumber: 164,
                        columnNumber: 21
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                lineNumber: 79,
                columnNumber: 17
            }, this)
        }, void 0, false, {
            fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
            lineNumber: 78,
            columnNumber: 13
        }, this)
    }, void 0, false, {
        fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
        lineNumber: 77,
        columnNumber: 9
    }, this);
}
_c3 = DepartmentRouteSkeletonBody;
function DualKpiRailsSkeleton() {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "adminv2-ws-dept-v2-kpi-measurement-strip",
        role: "status",
        "aria-label": "Loading KPIs",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "adminv2-ws-dept-v2-kpi-dual",
            "aria-hidden": true,
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "adminv2-ws-dept-v2-kpi-rail adminv2-ws-dept-v2-kpi-rail--business",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "adminv2-ws-dept-v2-kpi-rail-heading",
                            children: "Business metrics"
                        }, void 0, false, {
                            fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                            lineNumber: 191,
                            columnNumber: 21
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "adminv2-ws-kpi-strip adminv2-ws-kpi-strip--dept-embedded",
                            role: "list",
                            children: Array.from({
                                length: 3
                            }).map((_, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "adminv2-ws-kpi-cell adminv2-ws-kpi-cell--placeholder",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "adminv2-ws-kpi-label",
                                            children: " "
                                        }, void 0, false, {
                                            fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                            lineNumber: 195,
                                            columnNumber: 33
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "adminv2-ws-kpi-value adminv2-ws-kpi-value--placeholder",
                                            children: "—"
                                        }, void 0, false, {
                                            fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                            lineNumber: 196,
                                            columnNumber: 33
                                        }, this)
                                    ]
                                }, i, true, {
                                    fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                    lineNumber: 194,
                                    columnNumber: 29
                                }, this))
                        }, void 0, false, {
                            fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                            lineNumber: 192,
                            columnNumber: 21
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                    lineNumber: 190,
                    columnNumber: 17
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "adminv2-ws-dept-v2-kpi-rail adminv2-ws-dept-v2-kpi-rail--ai",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "adminv2-ws-dept-v2-kpi-rail-heading",
                            children: "AI metrics"
                        }, void 0, false, {
                            fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                            lineNumber: 202,
                            columnNumber: 21
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "adminv2-ws-kpi-strip adminv2-ws-kpi-strip--dept-embedded",
                            role: "list",
                            children: Array.from({
                                length: 3
                            }).map((_, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "adminv2-ws-kpi-cell adminv2-ws-kpi-cell--placeholder",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "adminv2-ws-kpi-label",
                                            children: " "
                                        }, void 0, false, {
                                            fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                            lineNumber: 206,
                                            columnNumber: 33
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "adminv2-ws-kpi-value adminv2-ws-kpi-value--placeholder",
                                            children: "—"
                                        }, void 0, false, {
                                            fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                            lineNumber: 207,
                                            columnNumber: 33
                                        }, this)
                                    ]
                                }, i, true, {
                                    fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                    lineNumber: 205,
                                    columnNumber: 29
                                }, this))
                        }, void 0, false, {
                            fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                            lineNumber: 203,
                            columnNumber: 21
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                    lineNumber: 201,
                    columnNumber: 17
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
            lineNumber: 189,
            columnNumber: 13
        }, this)
    }, void 0, false, {
        fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
        lineNumber: 188,
        columnNumber: 9
    }, this);
}
_c4 = DualKpiRailsSkeleton;
function QueueRowSkeleton() {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "adminv2-ws-wu-queue-row",
        "aria-hidden": true,
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "adminv2-ws-wu-queue-row-main",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "h-3 w-44 adminv2-shimmer-bar rounded bg-alloy-stone/20"
                    }, void 0, false, {
                        fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                        lineNumber: 221,
                        columnNumber: 17
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "mt-2 h-3 w-64 adminv2-shimmer-bar rounded bg-alloy-stone/12",
                        style: {
                            animationDelay: "70ms"
                        }
                    }, void 0, false, {
                        fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                        lineNumber: 222,
                        columnNumber: 17
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                lineNumber: 220,
                columnNumber: 13
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "adminv2-ws-wu-queue-row-meta",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "h-3 w-16 adminv2-shimmer-bar rounded bg-alloy-stone/10",
                    style: {
                        animationDelay: "110ms"
                    }
                }, void 0, false, {
                    fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                    lineNumber: 225,
                    columnNumber: 17
                }, this)
            }, void 0, false, {
                fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                lineNumber: 224,
                columnNumber: 13
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
        lineNumber: 219,
        columnNumber: 9
    }, this);
}
_c5 = QueueRowSkeleton;
function WorkUnitRouteSkeletonBody() {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        "data-ws-surface": "work_unit",
        className: "adminv2-ws-root adminv2-ws-work-unit adminv2-ws-wu-v2",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "adminv2-ws-dept-v2-contain",
            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "adminv2-ws-dept-v2-page-split",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "adminv2-ws-dept-v2-primary-column",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "adminv2-ws-dept-v2-control-deck",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "adminv2-ws-dept-v2-top-stack",
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "adminv2-ws-dept-v2-brief",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "adminv2-ws-dept-v2-brief-kicker",
                                                    children: "Work unit"
                                                }, void 0, false, {
                                                    fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                                    lineNumber: 241,
                                                    columnNumber: 37
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "adminv2-ws-dept-v2-brief-head-row",
                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                                                        className: "adminv2-ws-dept-v2-brief-headline adminv2-ws-dept-v2-brief-headline--placeholder",
                                                        children: "Loading lane"
                                                    }, void 0, false, {
                                                        fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                                        lineNumber: 243,
                                                        columnNumber: 41
                                                    }, this)
                                                }, void 0, false, {
                                                    fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                                    lineNumber: 242,
                                                    columnNumber: 37
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                            lineNumber: 240,
                                            columnNumber: 33
                                        }, this)
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                        lineNumber: 239,
                                        columnNumber: 29
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        "data-workspace-zone": "kpi-banner",
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(DualKpiRailsSkeleton, {}, void 0, false, {
                                            fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                            lineNumber: 250,
                                            columnNumber: 33
                                        }, this)
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                        lineNumber: 249,
                                        columnNumber: 29
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                lineNumber: 238,
                                columnNumber: 25
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "adminv2-ws-dept-v2-operational-row adminv2-ws-dept-v2-operational-row--double",
                                "aria-label": "Lane queue",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "adminv2-ws-dept-v2-lane adminv2-ws-dept-v2-lane--throughput",
                                        "data-ws-lane-kind": "lane_queue",
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "adminv2-ws-dept-v2-lane-chrome adminv2-ws-dept-v2-lane-chrome--throughput-deck",
                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "adminv2-ws-wu-queue",
                                                "aria-hidden": true,
                                                children: Array.from({
                                                    length: 8
                                                }).map((_, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(QueueRowSkeleton, {}, i, false, {
                                                        fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                                        lineNumber: 259,
                                                        columnNumber: 45
                                                    }, this))
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                                lineNumber: 257,
                                                columnNumber: 37
                                            }, this)
                                        }, void 0, false, {
                                            fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                            lineNumber: 256,
                                            columnNumber: 33
                                        }, this)
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                        lineNumber: 255,
                                        columnNumber: 29
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "adminv2-ws-dept-v2-lane adminv2-ws-dept-v2-lane--attention adminv2-ws-dept-v2-lane--attention--hidden",
                                        "aria-hidden": true
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                        lineNumber: 264,
                                        columnNumber: 29
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                lineNumber: 254,
                                columnNumber: 25
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                        lineNumber: 237,
                        columnNumber: 21
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "adminv2-ws-dept-v2-command-column",
                        "data-adminv2-workspace-command-column": true,
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("aside", {
                            className: "adminv2-ws-dept-v2-rail adminv2-ws-dept-v2-rail--command-shell",
                            "data-adminv2-workspace-command-rail": true,
                            "aria-label": "Decisions and actions",
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                                className: "adminv2-ws-actions-rail adminv2-ws-actions-rail--dept-panel px-3 pb-3 pt-3",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "h-4 w-20 adminv2-shimmer-bar rounded bg-alloy-stone/15",
                                        "aria-hidden": true
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                        lineNumber: 275,
                                        columnNumber: 33
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "mt-3 space-y-2",
                                        "aria-hidden": true,
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "h-8 w-full adminv2-shimmer-bar rounded-md bg-alloy-stone/10"
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                                lineNumber: 277,
                                                columnNumber: 37
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "h-8 w-full adminv2-shimmer-bar rounded-md bg-alloy-stone/10",
                                                style: {
                                                    animationDelay: "55ms"
                                                }
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                                lineNumber: 278,
                                                columnNumber: 37
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "h-8 w-full adminv2-shimmer-bar rounded-md bg-alloy-stone/10",
                                                style: {
                                                    animationDelay: "110ms"
                                                }
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                                lineNumber: 279,
                                                columnNumber: 37
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "h-8 w-full adminv2-shimmer-bar rounded-md bg-alloy-stone/10",
                                                style: {
                                                    animationDelay: "165ms"
                                                }
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                                lineNumber: 280,
                                                columnNumber: 37
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                        lineNumber: 276,
                                        columnNumber: 33
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                lineNumber: 274,
                                columnNumber: 29
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                            lineNumber: 269,
                            columnNumber: 25
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                        lineNumber: 268,
                        columnNumber: 21
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                lineNumber: 236,
                columnNumber: 17
            }, this)
        }, void 0, false, {
            fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
            lineNumber: 235,
            columnNumber: 13
        }, this)
    }, void 0, false, {
        fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
        lineNumber: 234,
        columnNumber: 9
    }, this);
}
_c6 = WorkUnitRouteSkeletonBody;
var _c, _c1, _c2, _c3, _c4, _c5, _c6;
__turbopack_context__.k.register(_c, "WsRouteLoadingRibbon");
__turbopack_context__.k.register(_c1, "KpiBannerSkeleton");
__turbopack_context__.k.register(_c2, "QueueCardSkeleton");
__turbopack_context__.k.register(_c3, "DepartmentRouteSkeletonBody");
__turbopack_context__.k.register(_c4, "DualKpiRailsSkeleton");
__turbopack_context__.k.register(_c5, "QueueRowSkeleton");
__turbopack_context__.k.register(_c6, "WorkUnitRouteSkeletonBody");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/components/admin/workspace/AdminV2RouteLoadingState.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "AdminV2RouteLoadingState",
    ()=>AdminV2RouteLoadingState
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$workspace$2f$workspaceRouteSkeletons$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/components/admin/workspace/workspaceRouteSkeletons.tsx [app-client] (ecmascript)");
;
;
;
const DEFAULTS = {
    workspace: {
        title: "Preparing workspace",
        description: "Loading departments and organization context…",
        ribbon: "Loading workspace"
    },
    department: {
        title: "Loading department",
        description: "Fetching department details…",
        ribbon: "Loading department"
    },
    work_unit: {
        title: "Loading work unit",
        description: "Fetching queues and actions for this lane…",
        ribbon: "Loading work unit"
    },
    queue: {
        title: "Preparing queue",
        description: "Loading records for the selected lane…",
        ribbon: "Loading queue"
    }
};
function AdminV2RouteLoadingState({ variant, title: titleOverride, description: descriptionOverride, ribbonLabel, showRibbon = true, showIndeterminateBar = true, children, className = "" }) {
    const d = DEFAULTS[variant];
    const title = titleOverride ?? d.title;
    const description = descriptionOverride ?? d.description;
    const compact = variant === "queue";
    const showBar = showIndeterminateBar && !compact;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
        children: [
            showRibbon ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$workspace$2f$workspaceRouteSkeletons$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["WsRouteLoadingRibbon"], {
                label: ribbonLabel ?? d.ribbon
            }, void 0, false, {
                fileName: "[project]/components/admin/workspace/AdminV2RouteLoadingState.tsx",
                lineNumber: 67,
                columnNumber: 27
            }, this) : null,
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: compact ? `rounded-lg border border-alloy-blue/18 bg-white/95 px-4 py-4 shadow-sm ring-1 ring-alloy-stone/[0.07] ${className}` : `rounded-xl border border-admin-border/55 bg-gradient-to-b from-white to-alloy-stone/[0.04] px-6 py-12 shadow-sm ring-1 ring-alloy-stone/8 ${className}`,
                "aria-busy": "true",
                "aria-live": "polite",
                "aria-label": title,
                children: compact ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "flex max-w-2xl items-start gap-3 text-left",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-alloy-blue/[0.06]",
                            "aria-hidden": true,
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "h-[18px] w-[18px] rounded-full border-[2px] border-alloy-blue/12 border-r-alloy-blue/28 border-t-alloy-blue/70 animate-spin motion-reduce:animate-none",
                                style: {
                                    animationDuration: "0.95s"
                                }
                            }, void 0, false, {
                                fileName: "[project]/components/admin/workspace/AdminV2RouteLoadingState.tsx",
                                lineNumber: 81,
                                columnNumber: 29
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/components/admin/workspace/AdminV2RouteLoadingState.tsx",
                            lineNumber: 80,
                            columnNumber: 25
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "min-w-0 flex-1",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                    className: "m-0 text-[13px] font-semibold text-alloy-forge",
                                    children: title
                                }, void 0, false, {
                                    fileName: "[project]/components/admin/workspace/AdminV2RouteLoadingState.tsx",
                                    lineNumber: 87,
                                    columnNumber: 29
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                    className: "m-0 mt-1 text-[11px] leading-snug text-alloy-forge/62",
                                    children: description
                                }, void 0, false, {
                                    fileName: "[project]/components/admin/workspace/AdminV2RouteLoadingState.tsx",
                                    lineNumber: 88,
                                    columnNumber: 29
                                }, this),
                                children ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "mt-3 w-full border-t border-alloy-blue/10 pt-3",
                                    children: children
                                }, void 0, false, {
                                    fileName: "[project]/components/admin/workspace/AdminV2RouteLoadingState.tsx",
                                    lineNumber: 90,
                                    columnNumber: 33
                                }, this) : null
                            ]
                        }, void 0, true, {
                            fileName: "[project]/components/admin/workspace/AdminV2RouteLoadingState.tsx",
                            lineNumber: 86,
                            columnNumber: 25
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/components/admin/workspace/AdminV2RouteLoadingState.tsx",
                    lineNumber: 79,
                    columnNumber: 21
                }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "mx-auto max-w-md text-center",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "mx-auto mb-5 flex h-14 w-14 items-center justify-center",
                            "aria-hidden": true,
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "h-11 w-11 rounded-full border-[3px] border-alloy-forge/12 border-t-alloy-forge/70 border-r-alloy-forge/35 animate-spin motion-reduce:animate-none",
                                style: {
                                    animationDuration: "0.95s"
                                }
                            }, void 0, false, {
                                fileName: "[project]/components/admin/workspace/AdminV2RouteLoadingState.tsx",
                                lineNumber: 97,
                                columnNumber: 29
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/components/admin/workspace/AdminV2RouteLoadingState.tsx",
                            lineNumber: 96,
                            columnNumber: 25
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                            className: "text-sm font-semibold text-alloy-forge",
                            children: title
                        }, void 0, false, {
                            fileName: "[project]/components/admin/workspace/AdminV2RouteLoadingState.tsx",
                            lineNumber: 102,
                            columnNumber: 25
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                            className: "mt-1 text-xs text-alloy-forge/60",
                            children: description
                        }, void 0, false, {
                            fileName: "[project]/components/admin/workspace/AdminV2RouteLoadingState.tsx",
                            lineNumber: 103,
                            columnNumber: 25
                        }, this),
                        showBar ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "adminv2-route-loading-track mx-auto mt-8",
                            "aria-hidden": true,
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "adminv2-route-loading-track__bar"
                            }, void 0, false, {
                                fileName: "[project]/components/admin/workspace/AdminV2RouteLoadingState.tsx",
                                lineNumber: 106,
                                columnNumber: 33
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/components/admin/workspace/AdminV2RouteLoadingState.tsx",
                            lineNumber: 105,
                            columnNumber: 29
                        }, this) : null,
                        children ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "mx-auto mt-8 w-full max-w-xl text-left",
                            children: children
                        }, void 0, false, {
                            fileName: "[project]/components/admin/workspace/AdminV2RouteLoadingState.tsx",
                            lineNumber: 109,
                            columnNumber: 37
                        }, this) : null
                    ]
                }, void 0, true, {
                    fileName: "[project]/components/admin/workspace/AdminV2RouteLoadingState.tsx",
                    lineNumber: 95,
                    columnNumber: 21
                }, this)
            }, void 0, false, {
                fileName: "[project]/components/admin/workspace/AdminV2RouteLoadingState.tsx",
                lineNumber: 68,
                columnNumber: 13
            }, this)
        ]
    }, void 0, true);
}
_c = AdminV2RouteLoadingState;
var _c;
__turbopack_context__.k.register(_c, "AdminV2RouteLoadingState");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/app/adminV2/workspace/page.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>AdminV2WorkspaceIndexPage
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$contexts$2f$WorkspaceOrgContext$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/contexts/WorkspaceOrgContext.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$workspace$2f$WorkspaceRootShell$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/components/admin/workspace/WorkspaceRootShell.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$growthSliceDepartments$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/workspace/growthSliceDepartments.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$viewModels$2f$workspaceRootRollup$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/workspace/viewModels/workspaceRootRollup.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$kpi$2f$resolver$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/kpi/resolver.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$workspaceDataFetch$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/workspace/workspaceDataFetch.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$workspace$2f$AdminV2RouteLoadingState$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/components/admin/workspace/AdminV2RouteLoadingState.tsx [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
;
;
;
;
;
;
async function loadWorkspaceRollup(departments) {
    const fetchInit = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$workspaceDataFetch$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["workspaceDataFetchInit"])();
    let workUnitsRes = null;
    try {
        workUnitsRes = await fetch("/api/admin/work-units", fetchInit);
    } catch  {
        workUnitsRes = null;
    }
    const wuJson = await (workUnitsRes?.json().catch(()=>({})) ?? Promise.resolve({}));
    const deptTileStats = {};
    if (workUnitsRes?.ok && Array.isArray(wuJson.items)) {
        for (const row of wuJson.items){
            const did = typeof row.department_id === "string" ? row.department_id : "";
            if (!did) continue;
            const cur = deptTileStats[did]?.workUnitCount ?? 0;
            deptTileStats[did] = {
                workUnitCount: cur + 1
            };
        }
    }
    for (const d of departments){
        const wu = deptTileStats[d.id]?.workUnitCount ?? 0;
        if (!deptTileStats[d.id]) deptTileStats[d.id] = {
            workUnitCount: wu
        };
        else deptTileStats[d.id] = {
            ...deptTileStats[d.id],
            workUnitCount: wu
        };
    }
    const growthDepts = departments.filter((d)=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$growthSliceDepartments$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["isGrowthSliceDepartmentKey"])(d.key));
    const growthSettled = await Promise.allSettled(growthDepts.map((d)=>(async ()=>{
            let lifecycleRes = null;
            let pipelineRes = null;
            try {
                [lifecycleRes, pipelineRes] = await Promise.all([
                    fetch(`/api/admin/departments/${encodeURIComponent(d.id)}/opportunity-lifecycle-kpis`, fetchInit),
                    fetch(`/api/admin/departments/${encodeURIComponent(d.id)}/pipeline-exact-count`, fetchInit)
                ]);
            } catch  {
                return {
                    id: d.id,
                    key: d.key,
                    pipelineExact: null,
                    lifecycleAnalytics: null
                };
            }
            const lifecycleJson = await (lifecycleRes?.json().catch(()=>({})) ?? Promise.resolve({}));
            const pipelineJson = await (pipelineRes?.json().catch(()=>({})) ?? Promise.resolve({}));
            const lifecycleAnalytics = lifecycleRes?.ok && lifecycleJson.counts ? lifecycleJson : null;
            let pipelineExact = null;
            if (pipelineRes?.ok) {
                if (typeof pipelineJson.work_unit_id === "string" && String(pipelineJson.work_unit_id).trim() && typeof pipelineJson.total === "number" && Number.isFinite(pipelineJson.total)) {
                    pipelineExact = {
                        work_unit_id: pipelineJson.work_unit_id,
                        queue_key: typeof pipelineJson.queue_key === "string" ? pipelineJson.queue_key : null,
                        total: pipelineJson.total
                    };
                } else {
                    pipelineExact = null;
                }
            }
            if ("TURBOPACK compile-time truthy", 1) {
                console.warn("[pipeline-count-unify]", {
                    source: "workspace",
                    department_id: d.id,
                    work_unit_id: pipelineExact?.work_unit_id ?? null,
                    queue_key: pipelineExact?.queue_key ?? null,
                    count: pipelineExact?.total ?? null
                });
            }
            return {
                id: d.id,
                key: d.key,
                pipelineExact,
                lifecycleAnalytics
            };
        })()));
    const growthSnapshots = growthDepts.map((d, i)=>{
        const s = growthSettled[i];
        if (s?.status === "fulfilled") return s.value;
        return {
            id: d.id,
            key: d.key,
            pipelineExact: null,
            lifecycleAnalytics: null
        };
    });
    const pipelineByDeptId = new Map(growthSnapshots.map((s)=>[
            s.id,
            s
        ]));
    for (const d of departments){
        const wu = deptTileStats[d.id]?.workUnitCount ?? 0;
        const growthSnap = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$growthSliceDepartments$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["isGrowthSliceDepartmentKey"])(d.key) ? pipelineByDeptId.get(d.id) : undefined;
        deptTileStats[d.id] = {
            workUnitCount: wu,
            opportunityRollupLine: (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$viewModels$2f$workspaceRootRollup$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["buildWorkspaceRootDepartmentTileRollupLine"])({
                departmentKey: d.key,
                workUnitCount: wu,
                pipelineExact: growthSnap?.pipelineExact ?? null
            })
        };
    }
    const orgOpportunityKpis = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$viewModels$2f$workspaceRootRollup$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["buildWorkspaceRootOrgOpportunityKpis"])(growthSnapshots);
    const metrics = {
        departments: null,
        workUnits: workUnitsRes?.ok && Array.isArray(wuJson.items) ? wuJson.items.length : null
    };
    return {
        metrics,
        deptTileStats,
        orgOpportunityKpis,
        growthSnapshots
    };
}
function AdminV2WorkspaceIndexPage() {
    _s();
    const { orgName: orgNameFromContext } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$contexts$2f$WorkspaceOrgContext$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useWorkspaceOrg"])();
    const [departments, setDepartments] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])([]);
    const [loading, setLoading] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(true);
    const [error, setError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [metrics, setMetrics] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [deptTileStats, setDeptTileStats] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])({});
    const [orgOpportunityKpis, setOrgOpportunityKpis] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    /** `undefined` = use shell legacy merge; otherwise full strip from placement resolver (after successful placement fetch). */ const [workspaceKpiStrip, setWorkspaceKpiStrip] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(undefined);
    const [metricsLoading, setMetricsLoading] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(true);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "AdminV2WorkspaceIndexPage.useEffect": ()=>{
            /** Synchronous: avoids a Strict Mode window where `loading` is still default `true` but the async body has not run yet (same class of bug as deferred `setLoading(true)`). */ setLoading(true);
            setError(null);
            const ac = new AbortController();
            /** Hard cap so a hung `/api/admin/departments` cannot block the UI forever when `AbortSignal.timeout` is unavailable. */ const hardStopMs = 50_000;
            const hardStop = setTimeout({
                "AdminV2WorkspaceIndexPage.useEffect.hardStop": ()=>ac.abort()
            }["AdminV2WorkspaceIndexPage.useEffect.hardStop"], hardStopMs);
            let applyResults = true;
            void ({
                "AdminV2WorkspaceIndexPage.useEffect": async ()=>{
                    try {
                        const perfDebug = ("TURBOPACK compile-time value", "object") !== "undefined" && window.__WS_PERF_DEBUG__ === true;
                        const t0 = perfDebug ? performance.now() : 0;
                        const res = await fetch("/api/admin/departments", {
                            signal: ac.signal
                        });
                        const json = await res.json().catch({
                            "AdminV2WorkspaceIndexPage.useEffect": ()=>({})
                        }["AdminV2WorkspaceIndexPage.useEffect"]);
                        if (!res.ok) throw new Error(json.error ?? "Failed to load departments");
                        const items = json.items ?? [];
                        const active = items.filter({
                            "AdminV2WorkspaceIndexPage.useEffect.active": (d)=>d.is_active !== false
                        }["AdminV2WorkspaceIndexPage.useEffect.active"]);
                        if (applyResults) {
                            setDepartments(active);
                        }
                        // Rollup runs after departments resolve without blocking first paint of the shell.
                        if (applyResults && active.length) {
                            setMetrics({
                                departments: null,
                                workUnits: null
                            });
                            setDeptTileStats({});
                            setOrgOpportunityKpis(null);
                            setWorkspaceKpiStrip(undefined);
                            setMetricsLoading(true);
                            void ({
                                "AdminV2WorkspaceIndexPage.useEffect": async ()=>{
                                    try {
                                        const fetchInit = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$workspaceDataFetch$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["workspaceDataFetchInit"])();
                                        const [rollupResult, placementRes] = await Promise.all([
                                            loadWorkspaceRollup(active),
                                            fetch("/api/admin/workspace-kpi-placements?surface=workspace", {
                                                ...fetchInit ?? {},
                                                cache: "no-store"
                                            }).catch({
                                                "AdminV2WorkspaceIndexPage.useEffect": ()=>null
                                            }["AdminV2WorkspaceIndexPage.useEffect"])
                                        ]);
                                        const { metrics: m, deptTileStats: stats, orgOpportunityKpis: roll, growthSnapshots } = rollupResult;
                                        let placementStrip = undefined;
                                        try {
                                            if (placementRes?.ok) {
                                                const body = await placementRes.json().catch({
                                                    "AdminV2WorkspaceIndexPage.useEffect": ()=>({})
                                                }["AdminV2WorkspaceIndexPage.useEffect"]);
                                                const metricsForResolve = {
                                                    ...m,
                                                    departments: active.length
                                                };
                                                placementStrip = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$kpi$2f$resolver$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["resolveKpisForWorkspace"])({
                                                    placementRows: body.items ?? [],
                                                    scopeHasPlacementRows: body.scope_has_placements === true,
                                                    metrics: metricsForResolve,
                                                    growthSnapshots
                                                }).items;
                                            }
                                        } catch  {
                                            placementStrip = undefined;
                                        }
                                        if (!applyResults) return;
                                        setMetrics(m);
                                        setDeptTileStats(stats);
                                        setOrgOpportunityKpis(roll.length ? roll : null);
                                        setWorkspaceKpiStrip(placementStrip);
                                    } catch  {
                                        if (!applyResults) return;
                                        setMetrics(null);
                                        setDeptTileStats({});
                                        setOrgOpportunityKpis(null);
                                        setWorkspaceKpiStrip(undefined);
                                    } finally{
                                        if (applyResults) setMetricsLoading(false);
                                    }
                                }
                            })["AdminV2WorkspaceIndexPage.useEffect"]();
                        } else if (applyResults) {
                            setMetricsLoading(false);
                            setMetrics(null);
                            setDeptTileStats({});
                            setOrgOpportunityKpis(null);
                            setWorkspaceKpiStrip(undefined);
                        }
                        if (perfDebug) {
                            const t1 = performance.now();
                            console.debug(`[ws.root] departments+rollup ready in ${Math.round(t1 - t0)}ms`, {
                                departments: active.length
                            });
                        }
                    } catch (e) {
                        const aborted = e instanceof DOMException && e.name === "AbortError" || e instanceof Error && e.name === "AbortError";
                        if (aborted) {
                            if (applyResults) {
                                setError("Loading departments timed out or was interrupted. Check your connection and try again.");
                            }
                        } else if (applyResults) {
                            setError(e.message);
                        }
                    } finally{
                        clearTimeout(hardStop);
                        if (applyResults) setLoading(false);
                    }
                }
            })["AdminV2WorkspaceIndexPage.useEffect"]();
            return ({
                "AdminV2WorkspaceIndexPage.useEffect": ()=>{
                    applyResults = false;
                    clearTimeout(hardStop);
                    ac.abort();
                }
            })["AdminV2WorkspaceIndexPage.useEffect"];
        }
    }["AdminV2WorkspaceIndexPage.useEffect"], []);
    // Rollup is now driven by the initial load effect to avoid staggered readiness waves.
    const metricsResolved = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "AdminV2WorkspaceIndexPage.useMemo[metricsResolved]": ()=>{
            if (!metrics) return null;
            return {
                ...metrics,
                departments: departments.length
            };
        }
    }["AdminV2WorkspaceIndexPage.useMemo[metricsResolved]"], [
        metrics,
        departments.length
    ]);
    if (loading) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            "data-ws-surface": "company",
            className: "adminv2-ws-root adminv2-ws-company adminv2-ws-company-v2",
            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "adminv2-ws-dept-v2-contain",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("nav", {
                        className: "text-sm text-alloy-midnight/60 flex flex-wrap items-center gap-1 pb-2",
                        "aria-label": "Breadcrumb",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "text-alloy-midnight/80 font-medium",
                            children: "Workspace"
                        }, void 0, false, {
                            fileName: "[project]/app/adminV2/workspace/page.tsx",
                            lineNumber: 299,
                            columnNumber: 25
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/workspace/page.tsx",
                        lineNumber: 298,
                        columnNumber: 21
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$workspace$2f$AdminV2RouteLoadingState$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AdminV2RouteLoadingState"], {
                        variant: "workspace"
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/workspace/page.tsx",
                        lineNumber: 301,
                        columnNumber: 21
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/app/adminV2/workspace/page.tsx",
                lineNumber: 297,
                columnNumber: 17
            }, this)
        }, void 0, false, {
            fileName: "[project]/app/adminV2/workspace/page.tsx",
            lineNumber: 296,
            columnNumber: 13
        }, this);
    }
    if (error) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "max-w-3xl",
            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "text-sm text-alloy-ember",
                children: error
            }, void 0, false, {
                fileName: "[project]/app/adminV2/workspace/page.tsx",
                lineNumber: 310,
                columnNumber: 17
            }, this)
        }, void 0, false, {
            fileName: "[project]/app/adminV2/workspace/page.tsx",
            lineNumber: 309,
            columnNumber: 13
        }, this);
    }
    if (departments.length === 0) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "max-w-3xl space-y-2",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                    className: "text-sm text-alloy-midnight/80",
                    children: "No active departments found for your organization."
                }, void 0, false, {
                    fileName: "[project]/app/adminV2/workspace/page.tsx",
                    lineNumber: 318,
                    columnNumber: 17
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                    className: "text-sm text-alloy-midnight/60",
                    children: "Add departments under Organization, then return here."
                }, void 0, false, {
                    fileName: "[project]/app/adminV2/workspace/page.tsx",
                    lineNumber: 319,
                    columnNumber: 17
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/app/adminV2/workspace/page.tsx",
            lineNumber: 317,
            columnNumber: 13
        }, this);
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$workspace$2f$WorkspaceRootShell$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["WorkspaceRootShell"], {
        orgName: orgNameFromContext,
        departments: departments,
        deptTileStats: deptTileStats,
        metrics: metricsResolved,
        metricsLoading: metricsLoading,
        orgOpportunityKpis: orgOpportunityKpis,
        workspaceKpiStrip: workspaceKpiStrip
    }, void 0, false, {
        fileName: "[project]/app/adminV2/workspace/page.tsx",
        lineNumber: 327,
        columnNumber: 9
    }, this);
}
_s(AdminV2WorkspaceIndexPage, "AMHsNdhjPSZEkmihHo94L50mzfo=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$contexts$2f$WorkspaceOrgContext$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useWorkspaceOrg"]
    ];
});
_c = AdminV2WorkspaceIndexPage;
var _c;
__turbopack_context__.k.register(_c, "AdminV2WorkspaceIndexPage");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
]);

//# sourceMappingURL=_f8810bf4._.js.map