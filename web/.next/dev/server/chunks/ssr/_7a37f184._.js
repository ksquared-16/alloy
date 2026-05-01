module.exports = [
"[project]/components/admin/workspace/WorkspacePairedOperPanels.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "WorkspacePairedOperPanel",
    ()=>WorkspacePairedOperPanel,
    "WorkspacePairedOperPanelsGrid",
    ()=>WorkspacePairedOperPanelsGrid
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
"use client";
;
function WorkspacePairedOperPanelsGrid({ children }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "adminv2-ws-paired-oper-grid",
        role: "presentation",
        children: children
    }, void 0, false, {
        fileName: "[project]/components/admin/workspace/WorkspacePairedOperPanels.tsx",
        lineNumber: 11,
        columnNumber: 9
    }, this);
}
const toneClass = {
    throughput: "adminv2-ws-paired-oper-panel adminv2-ws-paired-oper-panel--throughput adminv2-ws-dept-qsec adminv2-ws-dept-qsec--primary adminv2-ws-dept-throughput-panel",
    attention: "adminv2-ws-paired-oper-panel adminv2-ws-paired-oper-panel--attention adminv2-ws-dept-qsec adminv2-ws-dept-qsec--secondary adminv2-ws-dept-attention-panel adminv2-ws-dept-attention-panel--framed"
};
function WorkspacePairedOperPanel({ tone, ariaLabel, title, titleClassName, children }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
        className: `${toneClass[tone]} flex min-h-0 min-w-0 flex-col`.trim(),
        "aria-label": ariaLabel,
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("header", {
                className: "adminv2-ws-queue-header adminv2-ws-paired-oper-panel__header shrink-0",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "adminv2-ws-queue-title-row adminv2-ws-paired-oper-panel__title-row",
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                        className: `adminv2-ws-queue-title adminv2-ws-paired-oper-panel__title ${titleClassName ?? ""}`.trim(),
                        children: title
                    }, void 0, false, {
                        fileName: "[project]/components/admin/workspace/WorkspacePairedOperPanels.tsx",
                        lineNumber: 43,
                        columnNumber: 21
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/components/admin/workspace/WorkspacePairedOperPanels.tsx",
                    lineNumber: 42,
                    columnNumber: 17
                }, this)
            }, void 0, false, {
                fileName: "[project]/components/admin/workspace/WorkspacePairedOperPanels.tsx",
                lineNumber: 41,
                columnNumber: 13
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "adminv2-ws-paired-oper-panel__body adminv2-ws-wu-v2 min-h-0 flex-1",
                children: children
            }, void 0, false, {
                fileName: "[project]/components/admin/workspace/WorkspacePairedOperPanels.tsx",
                lineNumber: 48,
                columnNumber: 13
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/components/admin/workspace/WorkspacePairedOperPanels.tsx",
        lineNumber: 40,
        columnNumber: 9
    }, this);
}
}),
"[project]/components/admin/workspace/WorkspaceChrome.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "WorkspaceChrome",
    ()=>WorkspaceChrome
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/navigation.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$navigation$2f$AdminV2NavLink$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/adminV2/components/navigation/AdminV2NavLink.tsx [app-ssr] (ecmascript)");
"use client";
;
;
;
;
function normalizedPathname(pathname) {
    if (pathname === "/admin/v2" || pathname.startsWith("/admin/v2/")) {
        if (pathname === "/admin/v2") return "/adminV2/workspace";
        return `/adminV2${pathname.slice("/admin/v2".length)}`;
    }
    if (pathname === "/adminv2" || pathname.startsWith("/adminv2/")) {
        return `/adminV2${pathname.slice("/adminv2".length)}`;
    }
    return pathname;
}
function WorkspaceChrome({ breadcrumbs, title, subtitle, variant = "default", children }) {
    const pathname = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["usePathname"])();
    const path = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>normalizedPathname(pathname), [
        pathname
    ]);
    const outer = variant === "bridge" ? "w-full max-w-none mx-0 px-0 pt-1 pb-0 space-y-2" : "max-w-6xl mx-auto px-4 py-6 space-y-6";
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: outer,
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("nav", {
                className: "text-sm text-alloy-midnight/60 flex flex-wrap items-center gap-1 px-1",
                "aria-label": "Breadcrumb",
                children: breadcrumbs.map((b, i)=>{
                    const isLast = i === breadcrumbs.length - 1;
                    const href = b.href?.trim() || null;
                    const showLink = Boolean(href) && !isLast;
                    const active = Boolean(href && path.replace(/\/$/, "") === href.replace(/\/$/, ""));
                    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "flex items-center gap-1",
                        children: [
                            i > 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "text-alloy-midnight/40",
                                "aria-hidden": true,
                                children: "/"
                            }, void 0, false, {
                                fileName: "[project]/components/admin/workspace/WorkspaceChrome.tsx",
                                lineNumber: 56,
                                columnNumber: 38
                            }, this) : null,
                            showLink && href ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$navigation$2f$AdminV2NavLink$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AdminV2NavLink"], {
                                href: href,
                                active: active,
                                className: "px-1 -mx-0.5 py-0.5 text-alloy-midnight/75 hover:text-alloy-blue font-medium",
                                children: b.label
                            }, void 0, false, {
                                fileName: "[project]/components/admin/workspace/WorkspaceChrome.tsx",
                                lineNumber: 58,
                                columnNumber: 33
                            }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: isLast ? "text-alloy-midnight/90 font-medium px-1 py-0.5 rounded" : "text-alloy-midnight/55 px-1 py-0.5",
                                children: b.label
                            }, void 0, false, {
                                fileName: "[project]/components/admin/workspace/WorkspaceChrome.tsx",
                                lineNumber: 66,
                                columnNumber: 33
                            }, this)
                        ]
                    }, `${b.label}-${i}`, true, {
                        fileName: "[project]/components/admin/workspace/WorkspaceChrome.tsx",
                        lineNumber: 55,
                        columnNumber: 25
                    }, this);
                })
            }, void 0, false, {
                fileName: "[project]/components/admin/workspace/WorkspaceChrome.tsx",
                lineNumber: 45,
                columnNumber: 13
            }, this),
            variant !== "bridge" ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("header", {
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "text-xs font-semibold uppercase tracking-wide text-alloy-forge/70",
                        children: "Workspace (V2 slice)"
                    }, void 0, false, {
                        fileName: "[project]/components/admin/workspace/WorkspaceChrome.tsx",
                        lineNumber: 82,
                        columnNumber: 21
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h1", {
                        className: "text-2xl font-semibold text-alloy-midnight mt-1",
                        children: title
                    }, void 0, false, {
                        fileName: "[project]/components/admin/workspace/WorkspaceChrome.tsx",
                        lineNumber: 83,
                        columnNumber: 21
                    }, this),
                    subtitle ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "text-sm text-alloy-midnight/65 mt-2 max-w-3xl",
                        children: subtitle
                    }, void 0, false, {
                        fileName: "[project]/components/admin/workspace/WorkspaceChrome.tsx",
                        lineNumber: 84,
                        columnNumber: 33
                    }, this) : null
                ]
            }, void 0, true, {
                fileName: "[project]/components/admin/workspace/WorkspaceChrome.tsx",
                lineNumber: 81,
                columnNumber: 17
            }, this) : null,
            children
        ]
    }, void 0, true, {
        fileName: "[project]/components/admin/workspace/WorkspaceChrome.tsx",
        lineNumber: 44,
        columnNumber: 9
    }, this);
}
}),
"[project]/components/admin/workspace/WorkspaceShellLayout.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "WorkspaceShellLayout",
    ()=>WorkspaceShellLayout
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
"use client";
;
;
function WorkspaceShellLayout({ surface, rootClassName, style, workspaceRootShell, productionWorkspaceBridge, containLead, primaryColumn, railContent, showRail, railAriaLabel = "Decisions and actions" }) {
    const hasRail = typeof showRail === "boolean" ? showRail : railContent != null;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        "data-ws-surface": surface,
        className: `adminv2-ws-root ${rootClassName}`.trim(),
        style: style,
        ...workspaceRootShell ? {
            "data-adminv2-workspace-root-shell": "true"
        } : {},
        ...productionWorkspaceBridge ? {
            "data-production-workspace-bridge": "true"
        } : {},
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "adminv2-ws-dept-v2-contain",
            children: [
                containLead,
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: hasRail ? "adminv2-ws-dept-v2-page-split" : "adminv2-ws-dept-v2-page-split adminv2-ws-dept-v2-page-split--no-rail",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "adminv2-ws-dept-v2-primary-column",
                            children: primaryColumn
                        }, void 0, false, {
                            fileName: "[project]/components/admin/workspace/WorkspaceShellLayout.tsx",
                            lineNumber: 62,
                            columnNumber: 11
                        }, this),
                        hasRail ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "adminv2-ws-dept-v2-command-column adminv2-ws-shell-command-column",
                            "data-adminv2-workspace-command-column": true,
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("aside", {
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
}),
"[project]/components/admin/workspace/DepartmentWorkspaceBridgeShell.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "DepartmentWorkspaceBridgeShell",
    ()=>DepartmentWorkspaceBridgeShell
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$visualContext$2f$index$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/lib/visualContext/index.ts [app-ssr] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$visualContext$2f$contextStyle$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/visualContext/contextStyle.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$workspace$2f$WorkspaceShellLayout$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/components/admin/workspace/WorkspaceShellLayout.tsx [app-ssr] (ecmascript)");
"use client";
;
;
;
;
function DepartmentWorkspaceBridgeShell({ departmentKey, departmentDefaultVisualContextKey, visualContextKey, briefTitle, briefSubtitle, signalsSlot, kpiSlot, throughputSlot, attentionSlot, contextSlot, railSlot }) {
    const bridgeShellStyle = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$visualContext$2f$contextStyle$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["operationalWorkspaceShellStyle"])({
            layer: "department",
            visualContextKey: visualContextKey ?? undefined,
            departmentDefaultVisualContextKey: departmentDefaultVisualContextKey ?? undefined,
            departmentKey: departmentKey ?? undefined
        }), [
        departmentDefaultVisualContextKey,
        departmentKey,
        visualContextKey
    ]);
    const hasBrief = Boolean(briefTitle.trim());
    const hasSignals = signalsSlot != null;
    const hasKpis = kpiSlot != null;
    const hasTopStack = hasBrief || hasKpis || hasSignals;
    const hasControlDeck = hasTopStack;
    const hasAttentionLane = attentionSlot != null;
    const hasRail = railSlot != null;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$workspace$2f$WorkspaceShellLayout$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["WorkspaceShellLayout"], {
        surface: "department",
        rootClassName: "adminv2-ws-department adminv2-ws-dept-v2",
        style: bridgeShellStyle,
        productionWorkspaceBridge: true,
        showRail: hasRail,
        railContent: hasRail ? railSlot : null,
        railAriaLabel: "Decisions and actions",
        primaryColumn: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
            children: [
                hasControlDeck ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "adminv2-ws-dept-v2-control-deck",
                    children: hasTopStack ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "adminv2-ws-dept-v2-top-stack",
                        children: [
                            hasBrief ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "adminv2-ws-dept-v2-brief",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "adminv2-ws-dept-v2-brief-focus-label",
                                        children: "Today's focus"
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/workspace/DepartmentWorkspaceBridgeShell.tsx",
                                        lineNumber: 79,
                                        columnNumber: 45
                                    }, void 0),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "adminv2-ws-dept-v2-brief-head-row",
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                                            className: "adminv2-ws-dept-v2-brief-headline",
                                            children: briefTitle
                                        }, void 0, false, {
                                            fileName: "[project]/components/admin/workspace/DepartmentWorkspaceBridgeShell.tsx",
                                            lineNumber: 81,
                                            columnNumber: 49
                                        }, void 0)
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/workspace/DepartmentWorkspaceBridgeShell.tsx",
                                        lineNumber: 80,
                                        columnNumber: 45
                                    }, void 0),
                                    briefSubtitle ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        style: {
                                            margin: "6px 0 0",
                                            fontSize: 12,
                                            lineHeight: 1.45,
                                            color: "var(--d-muted)"
                                        },
                                        children: briefSubtitle
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/workspace/DepartmentWorkspaceBridgeShell.tsx",
                                        lineNumber: 84,
                                        columnNumber: 49
                                    }, void 0) : null
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/admin/workspace/DepartmentWorkspaceBridgeShell.tsx",
                                lineNumber: 78,
                                columnNumber: 41
                            }, void 0) : null,
                            hasKpis ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                "data-workspace-zone": "kpi-banner",
                                children: kpiSlot
                            }, void 0, false, {
                                fileName: "[project]/components/admin/workspace/DepartmentWorkspaceBridgeShell.tsx",
                                lineNumber: 97,
                                columnNumber: 48
                            }, void 0) : null,
                            hasSignals ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "adminv2-ws-dept-v2-signals",
                                children: signalsSlot
                            }, void 0, false, {
                                fileName: "[project]/components/admin/workspace/DepartmentWorkspaceBridgeShell.tsx",
                                lineNumber: 98,
                                columnNumber: 51
                            }, void 0) : null
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/admin/workspace/DepartmentWorkspaceBridgeShell.tsx",
                        lineNumber: 76,
                        columnNumber: 33
                    }, void 0) : null
                }, void 0, false, {
                    fileName: "[project]/components/admin/workspace/DepartmentWorkspaceBridgeShell.tsx",
                    lineNumber: 74,
                    columnNumber: 25
                }, void 0) : null,
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: `adminv2-ws-dept-v2-operational-row ${hasAttentionLane ? "adminv2-ws-dept-v2-operational-row--triple" : "adminv2-ws-dept-v2-operational-row--double"}`,
                    "aria-label": "Operational lanes",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "adminv2-ws-dept-v2-lane adminv2-ws-dept-v2-lane--throughput",
                            "data-ws-lane-kind": "throughput",
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "adminv2-ws-dept-v2-lane-chrome adminv2-ws-dept-v2-lane-chrome--throughput-deck",
                                children: throughputSlot
                            }, void 0, false, {
                                fileName: "[project]/components/admin/workspace/DepartmentWorkspaceBridgeShell.tsx",
                                lineNumber: 113,
                                columnNumber: 29
                            }, void 0)
                        }, void 0, false, {
                            fileName: "[project]/components/admin/workspace/DepartmentWorkspaceBridgeShell.tsx",
                            lineNumber: 112,
                            columnNumber: 25
                        }, void 0),
                        hasAttentionLane ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "adminv2-ws-dept-v2-lane adminv2-ws-dept-v2-lane--attention",
                            "data-ws-lane-kind": "attention",
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "adminv2-ws-dept-v2-lane-chrome adminv2-ws-dept-v2-board-secondary-slot",
                                children: attentionSlot
                            }, void 0, false, {
                                fileName: "[project]/components/admin/workspace/DepartmentWorkspaceBridgeShell.tsx",
                                lineNumber: 119,
                                columnNumber: 33
                            }, void 0)
                        }, void 0, false, {
                            fileName: "[project]/components/admin/workspace/DepartmentWorkspaceBridgeShell.tsx",
                            lineNumber: 118,
                            columnNumber: 29
                        }, void 0) : null
                    ]
                }, void 0, true, {
                    fileName: "[project]/components/admin/workspace/DepartmentWorkspaceBridgeShell.tsx",
                    lineNumber: 104,
                    columnNumber: 21
                }, void 0),
                contextSlot ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    "data-workspace-zone": "context-lower",
                    children: contextSlot
                }, void 0, false, {
                    fileName: "[project]/components/admin/workspace/DepartmentWorkspaceBridgeShell.tsx",
                    lineNumber: 126,
                    columnNumber: 36
                }, void 0) : null
            ]
        }, void 0, true)
    }, void 0, false, {
        fileName: "[project]/components/admin/workspace/DepartmentWorkspaceBridgeShell.tsx",
        lineNumber: 63,
        columnNumber: 9
    }, this);
}
}),
"[project]/app/adminV2/components/workspace/blocks/KPIBlock.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>KPIBlock
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
"use client";
;
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
    void _surface;
    void _dualRailHeadings;
    const items = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>mergeKpisForOrientationStrip(kpis, maxVisible), [
        kpis,
        maxVisible
    ]);
    if (items.length === 0) return null;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "adminv2-ws-kpi-root-band adminv2-ws-kpi-root-band--compact",
        role: "group",
        "aria-label": "Key metrics",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "adminv2-ws-kpi-strip adminv2-ws-kpi-strip--orientation",
            role: "list",
            children: items.map((k)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: [
                        "adminv2-ws-kpi-cell",
                        "adminv2-ws-kpi-cell--orientation",
                        k.tone && k.tone !== "neutral" ? `adminv2-ws-kpi-cell--tone-${k.tone}` : "",
                        k.lane === "ai" ? "adminv2-ws-kpi-cell--lane-ai" : ""
                    ].filter(Boolean).join(" "),
                    role: "listitem",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "adminv2-ws-kpi-label",
                            children: k.label
                        }, void 0, false, {
                            fileName: "[project]/app/adminV2/components/workspace/blocks/KPIBlock.tsx",
                            lineNumber: 62,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "adminv2-ws-kpi-value",
                            children: [
                                k.value,
                                k.unit ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
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
                        k.aiSummary ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
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
}),
"[project]/components/admin/workspace/workspaceRouteSkeletons.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "DepartmentRouteSkeletonBody",
    ()=>DepartmentRouteSkeletonBody,
    "WorkUnitRouteSkeletonBody",
    ()=>WorkUnitRouteSkeletonBody,
    "WsRouteLoadingRibbon",
    ()=>WsRouteLoadingRibbon
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
;
;
function WsRouteLoadingRibbon({ label = "Loading" }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "ws-route-loading-ribbon",
        role: "progressbar",
        "aria-label": label,
        "aria-busy": "true",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
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
function KpiBannerSkeleton() {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "adminv2-ws-kpi-root-band",
        role: "status",
        "aria-label": "Loading KPI banner",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "adminv2-ws-kpi-strip adminv2-ws-kpi-strip--single-band",
            role: "list",
            "aria-hidden": true,
            children: Array.from({
                length: 6
            }).map((_, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "adminv2-ws-kpi-cell adminv2-ws-kpi-cell--single-band adminv2-ws-kpi-cell--placeholder",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "adminv2-ws-kpi-label",
                            children: " "
                        }, void 0, false, {
                            fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                            lineNumber: 26,
                            columnNumber: 25
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
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
function QueueCardSkeleton({ variant }) {
    const cardClass = variant === "attention" ? "adminv2-ws-wu-queue-card adminv2-ws-wu-queue-card--compact adminv2-ws-wu-queue-card--attention adminv2-ws-wu-queue-card--tier-warning" : "adminv2-ws-wu-queue-card adminv2-ws-wu-queue-card--compact adminv2-ws-wu-queue-card--tier-standard";
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: `${cardClass} flex flex-col items-stretch`,
        "aria-hidden": true,
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "adminv2-ws-wu-queue-card-compact-text",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "h-3 w-40 adminv2-shimmer-bar rounded bg-alloy-stone/20"
                    }, void 0, false, {
                        fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                        lineNumber: 43,
                        columnNumber: 17
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "mt-2 h-3 w-56 adminv2-shimmer-bar rounded bg-alloy-stone/12",
                        style: {
                            animationDelay: "70ms"
                        }
                    }, void 0, false, {
                        fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                        lineNumber: 44,
                        columnNumber: 17
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] tabular-nums",
                        style: {
                            color: "var(--d-muted)"
                        },
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "font-medium text-alloy-midnight/75",
                                        children: "Count"
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                        lineNumber: 47,
                                        columnNumber: 25
                                    }, this),
                                    " ",
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
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
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "text-right",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "font-medium text-alloy-midnight/75",
                                        children: "Value"
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                        lineNumber: 54,
                                        columnNumber: 25
                                    }, this),
                                    " ",
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
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
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "adminv2-ws-wu-queue-card-compact-aside",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                    className: "adminv2-ws-wu-queue-action-chip adminv2-ws-wu-queue-action-chip--open",
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
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
function DepartmentRouteSkeletonBody() {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        "data-ws-surface": "department",
        className: "adminv2-ws-root adminv2-ws-department adminv2-ws-dept-v2",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "adminv2-ws-dept-v2-contain",
            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "adminv2-ws-dept-v2-page-split",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "adminv2-ws-dept-v2-primary-column",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "adminv2-ws-dept-v2-control-deck",
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "adminv2-ws-dept-v2-top-stack",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "adminv2-ws-dept-v2-brief",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "adminv2-ws-dept-v2-brief-focus-label",
                                                    children: "Today's focus"
                                                }, void 0, false, {
                                                    fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                                    lineNumber: 84,
                                                    columnNumber: 37
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "adminv2-ws-dept-v2-brief-head-row",
                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
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
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "mt-3 space-y-2 max-w-3xl",
                                                    "aria-hidden": true,
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            className: "h-3 w-full adminv2-shimmer-bar rounded bg-alloy-stone/15"
                                                        }, void 0, false, {
                                                            fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                                            lineNumber: 91,
                                                            columnNumber: 41
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
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
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            "data-workspace-zone": "kpi-banner",
                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(KpiBannerSkeleton, {}, void 0, false, {
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
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "adminv2-ws-dept-v2-operational-row adminv2-ws-dept-v2-operational-row--triple",
                                "aria-label": "Operational lanes",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "adminv2-ws-dept-v2-lane adminv2-ws-dept-v2-lane--throughput",
                                        "data-ws-lane-kind": "throughput",
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "adminv2-ws-dept-v2-lane-chrome adminv2-ws-dept-v2-lane-chrome--throughput-deck",
                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                                                className: "adminv2-ws-dept-qsec adminv2-ws-dept-qsec--primary adminv2-ws-dept-throughput-panel",
                                                "aria-label": "Pipeline lanes",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("header", {
                                                        className: "adminv2-ws-queue-header",
                                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            className: "adminv2-ws-queue-title-row",
                                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
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
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: "adminv2-ws-wu-v2",
                                                        "data-ws-surface": "work_unit",
                                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                                                            className: "adminv2-ws-queue-list",
                                                            role: "list",
                                                            "aria-hidden": true,
                                                            children: Array.from({
                                                                length: 3
                                                            }).map((_, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                                                    className: "adminv2-ws-wu-queue-item-wrap",
                                                                    role: "listitem",
                                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(QueueCardSkeleton, {
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
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "adminv2-ws-dept-v2-lane adminv2-ws-dept-v2-lane--attention",
                                        "data-ws-lane-kind": "attention",
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "adminv2-ws-dept-v2-lane-chrome adminv2-ws-dept-v2-board-secondary-slot",
                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                                                className: "adminv2-ws-dept-qsec adminv2-ws-dept-qsec--secondary adminv2-ws-dept-attention-panel",
                                                "aria-label": "Needs Attention",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("header", {
                                                        className: "adminv2-ws-attention-panel-header",
                                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                    className: "adminv2-ws-attention-panel-kicker",
                                                                    children: "Needs attention"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                                                    lineNumber: 137,
                                                                    columnNumber: 49
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                                                    className: "adminv2-ws-attention-panel-title",
                                                                    children: "Needs Attention"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                                                    lineNumber: 138,
                                                                    columnNumber: 49
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                    className: "mt-2 space-y-2",
                                                                    "aria-hidden": true,
                                                                    children: [
                                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                            className: "h-3 w-48 adminv2-shimmer-bar rounded bg-alloy-stone/10"
                                                                        }, void 0, false, {
                                                                            fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                                                            lineNumber: 140,
                                                                            columnNumber: 53
                                                                        }, this),
                                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
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
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: "adminv2-ws-attention-stack",
                                                        "aria-hidden": true,
                                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            className: "adminv2-ws-attention-card adminv2-ws-attention-card--queue-aligned",
                                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                className: "adminv2-ws-wu-v2",
                                                                "data-ws-surface": "work_unit",
                                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                                                                    className: "adminv2-ws-queue-list",
                                                                    role: "list",
                                                                    children: Array.from({
                                                                        length: 2
                                                                    }).map((_, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                                                            className: "adminv2-ws-wu-queue-item-wrap",
                                                                            role: "listitem",
                                                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(QueueCardSkeleton, {
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
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "adminv2-ws-dept-v2-command-column",
                        "data-adminv2-workspace-command-column": true,
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("aside", {
                            className: "adminv2-ws-dept-v2-rail adminv2-ws-dept-v2-rail--command-shell",
                            "data-adminv2-workspace-command-rail": true,
                            "aria-label": "Decisions and actions",
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                                className: "adminv2-ws-actions-rail adminv2-ws-actions-rail--dept-panel px-3 pb-3 pt-3",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "h-4 w-20 adminv2-shimmer-bar rounded bg-alloy-stone/15",
                                        "aria-hidden": true
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                        lineNumber: 171,
                                        columnNumber: 33
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "mt-3 space-y-2",
                                        "aria-hidden": true,
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "h-8 w-full adminv2-shimmer-bar rounded-md bg-alloy-stone/10"
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                                lineNumber: 173,
                                                columnNumber: 37
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "h-8 w-full adminv2-shimmer-bar rounded-md bg-alloy-stone/10",
                                                style: {
                                                    animationDelay: "55ms"
                                                }
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                                lineNumber: 174,
                                                columnNumber: 37
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
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
function DualKpiRailsSkeleton() {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "adminv2-ws-dept-v2-kpi-measurement-strip",
        role: "status",
        "aria-label": "Loading KPIs",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "adminv2-ws-dept-v2-kpi-dual",
            "aria-hidden": true,
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "adminv2-ws-dept-v2-kpi-rail adminv2-ws-dept-v2-kpi-rail--business",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "adminv2-ws-dept-v2-kpi-rail-heading",
                            children: "Business metrics"
                        }, void 0, false, {
                            fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                            lineNumber: 191,
                            columnNumber: 21
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "adminv2-ws-kpi-strip adminv2-ws-kpi-strip--dept-embedded",
                            role: "list",
                            children: Array.from({
                                length: 3
                            }).map((_, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "adminv2-ws-kpi-cell adminv2-ws-kpi-cell--placeholder",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "adminv2-ws-kpi-label",
                                            children: " "
                                        }, void 0, false, {
                                            fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                            lineNumber: 195,
                                            columnNumber: 33
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
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
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "adminv2-ws-dept-v2-kpi-rail adminv2-ws-dept-v2-kpi-rail--ai",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "adminv2-ws-dept-v2-kpi-rail-heading",
                            children: "AI metrics"
                        }, void 0, false, {
                            fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                            lineNumber: 202,
                            columnNumber: 21
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "adminv2-ws-kpi-strip adminv2-ws-kpi-strip--dept-embedded",
                            role: "list",
                            children: Array.from({
                                length: 3
                            }).map((_, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "adminv2-ws-kpi-cell adminv2-ws-kpi-cell--placeholder",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "adminv2-ws-kpi-label",
                                            children: " "
                                        }, void 0, false, {
                                            fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                            lineNumber: 206,
                                            columnNumber: 33
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
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
function QueueRowSkeleton() {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "adminv2-ws-wu-queue-row",
        "aria-hidden": true,
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "adminv2-ws-wu-queue-row-main",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "h-3 w-44 adminv2-shimmer-bar rounded bg-alloy-stone/20"
                    }, void 0, false, {
                        fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                        lineNumber: 221,
                        columnNumber: 17
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
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
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "adminv2-ws-wu-queue-row-meta",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
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
function WorkUnitRouteSkeletonBody() {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        "data-ws-surface": "work_unit",
        className: "adminv2-ws-root adminv2-ws-work-unit adminv2-ws-wu-v2",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "adminv2-ws-dept-v2-contain",
            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "adminv2-ws-dept-v2-page-split",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "adminv2-ws-dept-v2-primary-column",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "adminv2-ws-dept-v2-control-deck",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "adminv2-ws-dept-v2-top-stack",
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "adminv2-ws-dept-v2-brief",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "adminv2-ws-dept-v2-brief-kicker",
                                                    children: "Work unit"
                                                }, void 0, false, {
                                                    fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                                    lineNumber: 241,
                                                    columnNumber: 37
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "adminv2-ws-dept-v2-brief-head-row",
                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
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
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        "data-workspace-zone": "kpi-banner",
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(DualKpiRailsSkeleton, {}, void 0, false, {
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
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "adminv2-ws-dept-v2-operational-row adminv2-ws-dept-v2-operational-row--double",
                                "aria-label": "Lane queue",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "adminv2-ws-dept-v2-lane adminv2-ws-dept-v2-lane--throughput",
                                        "data-ws-lane-kind": "lane_queue",
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "adminv2-ws-dept-v2-lane-chrome adminv2-ws-dept-v2-lane-chrome--throughput-deck",
                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "adminv2-ws-wu-queue",
                                                "aria-hidden": true,
                                                children: Array.from({
                                                    length: 8
                                                }).map((_, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(QueueRowSkeleton, {}, i, false, {
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
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
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
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "adminv2-ws-dept-v2-command-column",
                        "data-adminv2-workspace-command-column": true,
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("aside", {
                            className: "adminv2-ws-dept-v2-rail adminv2-ws-dept-v2-rail--command-shell",
                            "data-adminv2-workspace-command-rail": true,
                            "aria-label": "Decisions and actions",
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                                className: "adminv2-ws-actions-rail adminv2-ws-actions-rail--dept-panel px-3 pb-3 pt-3",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "h-4 w-20 adminv2-shimmer-bar rounded bg-alloy-stone/15",
                                        "aria-hidden": true
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                        lineNumber: 275,
                                        columnNumber: 33
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "mt-3 space-y-2",
                                        "aria-hidden": true,
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "h-8 w-full adminv2-shimmer-bar rounded-md bg-alloy-stone/10"
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                                lineNumber: 277,
                                                columnNumber: 37
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "h-8 w-full adminv2-shimmer-bar rounded-md bg-alloy-stone/10",
                                                style: {
                                                    animationDelay: "55ms"
                                                }
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                                lineNumber: 278,
                                                columnNumber: 37
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "h-8 w-full adminv2-shimmer-bar rounded-md bg-alloy-stone/10",
                                                style: {
                                                    animationDelay: "110ms"
                                                }
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/workspace/workspaceRouteSkeletons.tsx",
                                                lineNumber: 279,
                                                columnNumber: 37
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
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
}),
"[project]/components/admin/workspace/AdminV2RouteLoadingState.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "AdminV2RouteLoadingState",
    ()=>AdminV2RouteLoadingState
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$workspace$2f$workspaceRouteSkeletons$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/components/admin/workspace/workspaceRouteSkeletons.tsx [app-ssr] (ecmascript)");
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
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
        children: [
            showRibbon ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$workspace$2f$workspaceRouteSkeletons$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["WsRouteLoadingRibbon"], {
                label: ribbonLabel ?? d.ribbon
            }, void 0, false, {
                fileName: "[project]/components/admin/workspace/AdminV2RouteLoadingState.tsx",
                lineNumber: 67,
                columnNumber: 27
            }, this) : null,
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: compact ? `rounded-lg border border-alloy-blue/18 bg-white/95 px-4 py-4 shadow-sm ring-1 ring-alloy-stone/[0.07] ${className}` : `rounded-xl border border-admin-border/55 bg-gradient-to-b from-white to-alloy-stone/[0.04] px-6 py-12 shadow-sm ring-1 ring-alloy-stone/8 ${className}`,
                "aria-busy": "true",
                "aria-live": "polite",
                "aria-label": title,
                children: compact ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "flex max-w-2xl items-start gap-3 text-left",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-alloy-blue/[0.06]",
                            "aria-hidden": true,
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
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
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "min-w-0 flex-1",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                    className: "m-0 text-[13px] font-semibold text-alloy-forge",
                                    children: title
                                }, void 0, false, {
                                    fileName: "[project]/components/admin/workspace/AdminV2RouteLoadingState.tsx",
                                    lineNumber: 87,
                                    columnNumber: 29
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                    className: "m-0 mt-1 text-[11px] leading-snug text-alloy-forge/62",
                                    children: description
                                }, void 0, false, {
                                    fileName: "[project]/components/admin/workspace/AdminV2RouteLoadingState.tsx",
                                    lineNumber: 88,
                                    columnNumber: 29
                                }, this),
                                children ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
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
                }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "mx-auto max-w-md text-center",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "mx-auto mb-5 flex h-14 w-14 items-center justify-center",
                            "aria-hidden": true,
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
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
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                            className: "text-sm font-semibold text-alloy-forge",
                            children: title
                        }, void 0, false, {
                            fileName: "[project]/components/admin/workspace/AdminV2RouteLoadingState.tsx",
                            lineNumber: 102,
                            columnNumber: 25
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                            className: "mt-1 text-xs text-alloy-forge/60",
                            children: description
                        }, void 0, false, {
                            fileName: "[project]/components/admin/workspace/AdminV2RouteLoadingState.tsx",
                            lineNumber: 103,
                            columnNumber: 25
                        }, this),
                        showBar ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "adminv2-route-loading-track mx-auto mt-8",
                            "aria-hidden": true,
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
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
                        children ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
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
}),
"[project]/lib/workspace/workspaceRouteParam.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/** Normalize Next.js `useParams()` segment (string | string[] | undefined) to a single trimmed id. */ __turbopack_context__.s([
    "workspaceRouteParam",
    ()=>workspaceRouteParam
]);
function workspaceRouteParam(v) {
    if (typeof v === "string") return v.trim();
    if (Array.isArray(v) && typeof v[0] === "string") return v[0].trim();
    return "";
}
}),
"[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>ActionsBlock
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/styles/tokens/colors.ts [app-ssr] (ecmascript)");
"use client";
;
;
;
const PRIMARY_SOLID_CAP = 2;
function actionButtonClass(a) {
    return a.variant === "secondary" ? "adminv2-ws-actions-rail-secondary" : "adminv2-ws-actions-rail-primary";
}
/** Primary tier: at most `maxSolid` solid blues; remainder outlined. Secondary variant always outlined. */ function primaryTierButtonClass(a, solidUsed, maxSolid) {
    if (a.variant === "secondary") return "adminv2-ws-actions-rail-secondary";
    const wantsSolid = a.variant === "primary" || a.variant === undefined;
    if (wantsSolid && solidUsed.n < maxSolid) {
        solidUsed.n += 1;
        return "adminv2-ws-actions-rail-primary";
    }
    return "adminv2-ws-actions-rail-secondary";
}
/** Lower-priority actions — own section, collapsed by default (not inside operational / AI). */ function MoreActionsSection({ items, onAction }) {
    const [open, setOpen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    if (items.length === 0) return null;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
        className: "adminv2-ws-command-section adminv2-ws-command-section--more-actions",
        "aria-label": "More actions",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                type: "button",
                className: "adminv2-ws-command-more-actions-trigger",
                "aria-expanded": open,
                onClick: ()=>setOpen((o)=>!o),
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "adminv2-ws-command-more-actions-trigger-label",
                        children: "More actions"
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx",
                        lineNumber: 45,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "adminv2-ws-command-more-actions-trigger-chevron",
                        "aria-hidden": true,
                        children: open ? "▴" : "▾"
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx",
                        lineNumber: 46,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx",
                lineNumber: 39,
                columnNumber: 7
            }, this),
            open ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                className: "adminv2-ws-command-row-list adminv2-ws-command-row-list--more-actions",
                children: items.map((a)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                            type: "button",
                            className: "adminv2-ws-command-more-actions-row",
                            onClick: ()=>onAction({
                                    type: "actions.block",
                                    actionId: a.id
                                }),
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "adminv2-ws-command-row-glyph",
                                    "aria-hidden": true,
                                    children: "›"
                                }, void 0, false, {
                                    fileName: "[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx",
                                    lineNumber: 59,
                                    columnNumber: 17
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "adminv2-ws-command-more-actions-row-label",
                                    children: a.label
                                }, void 0, false, {
                                    fileName: "[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx",
                                    lineNumber: 62,
                                    columnNumber: 17
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx",
                            lineNumber: 54,
                            columnNumber: 15
                        }, this)
                    }, a.id, false, {
                        fileName: "[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx",
                        lineNumber: 53,
                        columnNumber: 13
                    }, this))
            }, void 0, false, {
                fileName: "[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx",
                lineNumber: 51,
                columnNumber: 9
            }, this) : null
        ]
    }, void 0, true, {
        fileName: "[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx",
        lineNumber: 38,
        columnNumber: 5
    }, this);
}
/** User-driven row actions inside a single card (demoted system + quick / record secondary). */ function OperationalActionsCard({ actions, onAction, panelClassName }) {
    if (actions.length === 0) return null;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
        className: [
            "adminv2-ws-actions-rail adminv2-ws-actions-rail--dept-panel adminv2-ws-command-section--operational",
            panelClassName
        ].filter(Boolean).join(" "),
        "aria-label": "Operational actions",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                className: "adminv2-ws-actions-rail-title",
                children: "Operational actions"
            }, void 0, false, {
                fileName: "[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx",
                lineNumber: 94,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                className: "adminv2-ws-command-row-list adminv2-ws-command-row-list--operational",
                children: actions.map((a)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                            type: "button",
                            className: "adminv2-ws-command-operational-row",
                            style: a.emphasized ? {
                                boxShadow: "0 0 0 2px rgba(0, 162, 131, 0.45)"
                            } : undefined,
                            onClick: ()=>onAction({
                                    type: "actions.block",
                                    actionId: a.id
                                }),
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "adminv2-ws-command-row-glyph",
                                    "aria-hidden": true,
                                    children: "›"
                                }, void 0, false, {
                                    fileName: "[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx",
                                    lineNumber: 104,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "adminv2-ws-command-operational-row-label",
                                    children: a.label
                                }, void 0, false, {
                                    fileName: "[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx",
                                    lineNumber: 107,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx",
                            lineNumber: 98,
                            columnNumber: 13
                        }, this)
                    }, a.id, false, {
                        fileName: "[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx",
                        lineNumber: 97,
                        columnNumber: 11
                    }, this))
            }, void 0, false, {
                fileName: "[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx",
                lineNumber: 95,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx",
        lineNumber: 85,
        columnNumber: 5
    }, this);
}
/** AI suggestions — light section, not a card; distinct from operational rows. */ function AISuggestionsSection({ actions, onAction, sectionClassName }) {
    if (actions.length === 0) return null;
    const sectionTitle = "AI suggestions";
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
        className: [
            "adminv2-ws-command-section adminv2-ws-command-section--ai-suggestions",
            sectionClassName
        ].filter(Boolean).join(" "),
        "aria-label": sectionTitle,
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                className: "adminv2-ws-command-section-title adminv2-ws-command-section-title--ai",
                children: sectionTitle
            }, void 0, false, {
                fileName: "[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx",
                lineNumber: 137,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                className: "adminv2-ws-command-row-list adminv2-ws-command-row-list--ai-suggestions",
                children: actions.map((a)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                            type: "button",
                            className: "adminv2-ws-command-ai-suggestion-row",
                            style: a.emphasized ? {
                                boxShadow: "0 0 0 2px rgba(0, 162, 131, 0.35)"
                            } : undefined,
                            onClick: ()=>onAction({
                                    type: "actions.block",
                                    actionId: a.id
                                }),
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "adminv2-ws-command-row-glyph adminv2-ws-command-row-glyph--ai",
                                    "aria-hidden": true,
                                    children: "›"
                                }, void 0, false, {
                                    fileName: "[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx",
                                    lineNumber: 147,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "adminv2-ws-command-ai-suggestion-row-main",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "adminv2-ws-command-row-ai-badge",
                                            "aria-label": "AI suggested",
                                            children: "AI"
                                        }, void 0, false, {
                                            fileName: "[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx",
                                            lineNumber: 151,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "adminv2-ws-command-ai-suggestion-row-label",
                                            children: a.label
                                        }, void 0, false, {
                                            fileName: "[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx",
                                            lineNumber: 154,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx",
                                    lineNumber: 150,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx",
                            lineNumber: 141,
                            columnNumber: 13
                        }, this)
                    }, a.id, false, {
                        fileName: "[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx",
                        lineNumber: 140,
                        columnNumber: 11
                    }, this))
            }, void 0, false, {
                fileName: "[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx",
                lineNumber: 138,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx",
        lineNumber: 131,
        columnNumber: 5
    }, this);
}
function PrimaryActionsPanel({ sectionTitle, actions, onAction, panelClassName, maxSolidButtons = PRIMARY_SOLID_CAP }) {
    const solidUsed = {
        n: 0
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
        className: [
            "adminv2-ws-actions-rail adminv2-ws-actions-rail--dept-panel adminv2-ws-command-section--primary",
            panelClassName
        ].filter(Boolean).join(" "),
        "aria-label": sectionTitle,
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                className: "adminv2-ws-actions-rail-title",
                children: sectionTitle
            }, void 0, false, {
                fileName: "[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx",
                lineNumber: 186,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "adminv2-ws-actions-rail-list adminv2-ws-actions-rail-list--column",
                children: actions.map((a)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        type: "button",
                        className: primaryTierButtonClass(a, solidUsed, maxSolidButtons),
                        style: a.emphasized ? {
                            boxShadow: "0 0 0 2px rgba(0, 162, 131, 0.5)"
                        } : undefined,
                        onClick: ()=>onAction({
                                type: "actions.block",
                                actionId: a.id
                            }),
                        children: a.label
                    }, a.id, false, {
                        fileName: "[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx",
                        lineNumber: 189,
                        columnNumber: 11
                    }, this))
            }, void 0, false, {
                fileName: "[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx",
                lineNumber: 187,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx",
        lineNumber: 180,
        columnNumber: 5
    }, this);
}
function ActionsBlock({ model, onAction, title = "Actions", surface = "default" }) {
    if (surface === "department" || surface === "company" || surface === "work_unit" || surface === "record") {
        const sysFull = model.systemActions ?? [];
        /** Department / work_unit right rails: show every registry-configured system action in the primary band. */ const uncappedRail = surface === "department" || surface === "work_unit";
        const primaryBand = uncappedRail ? sysFull : sysFull.slice(0, 2);
        const demotedSystemActions = uncappedRail ? [] : sysFull.slice(2);
        const maxSolidForPrimary = uncappedRail ? Math.max(primaryBand.length, 1) : PRIMARY_SOLID_CAP;
        const quick = model.quickOperations;
        const smart = model.smartSuggestions;
        const recSec = model.recordSecondaryActions?.length ?? 0;
        const recTer = model.recordTertiaryActions?.length ?? 0;
        const useRecordQuickTiers = surface === "record" && (recSec > 0 || recTer > 0);
        const moreItems = [
            ...useRecordQuickTiers ? model.recordTertiaryActions ?? [] : [],
            ...model.overflow ?? []
        ];
        const baseSecondary = useRecordQuickTiers ? model.recordSecondaryActions ?? [] : quick ?? [];
        const operationalActions = [
            ...demotedSystemActions,
            ...baseSecondary
        ];
        const operationalN = operationalActions.length;
        const smartN = smart?.length ?? 0;
        const moreN = moreItems.length;
        const structuredN = primaryBand.length + operationalN + smartN + moreN;
        const hasStructured = structuredN > 0;
        const systemPanelTitle = surface === "record" ? "Primary actions" : "System operations";
        if (hasStructured) {
            const status = model.systemStatusLines?.filter((l)=>l.trim()) ?? [];
            const anchor = surface === "record" ? model.recordDecisionAnchor : undefined;
            const hasAnchor = surface === "record" && anchor && Boolean(anchor.status?.trim() || anchor.risk?.trim() || anchor.nextAction?.trim());
            const showStatusStrip = status.length > 0;
            const recordOpClass = surface === "record" ? "adminv2-ws-command-section--record-operational" : undefined;
            const recordAiClass = surface === "record" ? "adminv2-ws-command-section--record-ai-suggestions" : undefined;
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "adminv2-ws-dept-command-actions-stack",
                children: [
                    hasAnchor && anchor ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "adminv2-ws-record-decision-anchor",
                        "aria-label": "Record state",
                        children: [
                            anchor.status?.trim() ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "adminv2-ws-record-decision-anchor-row",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "adminv2-ws-record-decision-anchor-k",
                                        children: "Status"
                                    }, void 0, false, {
                                        fileName: "[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx",
                                        lineNumber: 252,
                                        columnNumber: 19
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "adminv2-ws-record-decision-anchor-v",
                                        children: anchor.status.trim()
                                    }, void 0, false, {
                                        fileName: "[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx",
                                        lineNumber: 253,
                                        columnNumber: 19
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx",
                                lineNumber: 251,
                                columnNumber: 17
                            }, this) : null,
                            anchor.risk?.trim() ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "adminv2-ws-record-decision-anchor-row adminv2-ws-record-decision-anchor-row--risk",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "adminv2-ws-record-decision-anchor-k",
                                        children: "Risk"
                                    }, void 0, false, {
                                        fileName: "[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx",
                                        lineNumber: 258,
                                        columnNumber: 19
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "adminv2-ws-record-decision-anchor-v",
                                        children: anchor.risk.trim()
                                    }, void 0, false, {
                                        fileName: "[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx",
                                        lineNumber: 259,
                                        columnNumber: 19
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx",
                                lineNumber: 257,
                                columnNumber: 17
                            }, this) : null,
                            anchor.nextAction?.trim() ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "adminv2-ws-record-decision-anchor-row",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "adminv2-ws-record-decision-anchor-k",
                                        children: "Next action"
                                    }, void 0, false, {
                                        fileName: "[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx",
                                        lineNumber: 264,
                                        columnNumber: 19
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "adminv2-ws-record-decision-anchor-v",
                                        children: anchor.nextAction.trim()
                                    }, void 0, false, {
                                        fileName: "[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx",
                                        lineNumber: 265,
                                        columnNumber: 19
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx",
                                lineNumber: 263,
                                columnNumber: 17
                            }, this) : null
                        ]
                    }, void 0, true, {
                        fileName: "[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx",
                        lineNumber: 249,
                        columnNumber: 13
                    }, this) : null,
                    showStatusStrip ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: `adminv2-ws-dept-command-status${surface === "record" ? " adminv2-ws-dept-command-status--record" : ""}`,
                        "aria-label": surface === "record" ? "Record status" : "System status",
                        children: status.map((line, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "adminv2-ws-dept-command-status-line",
                                children: line
                            }, `${i}-${line.slice(0, 24)}`, false, {
                                fileName: "[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx",
                                lineNumber: 276,
                                columnNumber: 17
                            }, this))
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx",
                        lineNumber: 271,
                        columnNumber: 13
                    }, this) : null,
                    primaryBand.length > 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(PrimaryActionsPanel, {
                        sectionTitle: systemPanelTitle,
                        actions: primaryBand,
                        onAction: onAction,
                        maxSolidButtons: maxSolidForPrimary,
                        panelClassName: surface === "record" ? "adminv2-ws-actions-rail--record-primary-tier" : undefined
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx",
                        lineNumber: 283,
                        columnNumber: 13
                    }, this) : null,
                    operationalN > 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(OperationalActionsCard, {
                        actions: operationalActions,
                        onAction: onAction,
                        panelClassName: recordOpClass
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx",
                        lineNumber: 292,
                        columnNumber: 13
                    }, this) : null,
                    smartN > 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(AISuggestionsSection, {
                        actions: smart ?? [],
                        onAction: onAction,
                        sectionClassName: recordAiClass
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx",
                        lineNumber: 299,
                        columnNumber: 13
                    }, this) : null,
                    moreN > 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(MoreActionsSection, {
                        items: moreItems,
                        onAction: onAction
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx",
                        lineNumber: 301,
                        columnNumber: 24
                    }, this) : null
                ]
            }, void 0, true, {
                fileName: "[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx",
                lineNumber: 247,
                columnNumber: 9
            }, this);
        }
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "adminv2-ws-dept-command-actions-stack",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "adminv2-ws-actions-rail adminv2-ws-actions-rail--dept-panel",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "adminv2-ws-actions-rail-title",
                            children: title
                        }, void 0, false, {
                            fileName: "[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx",
                            lineNumber: 309,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "adminv2-ws-actions-rail-list",
                            children: model.primaries.map((a)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    className: actionButtonClass(a),
                                    style: a.emphasized ? {
                                        boxShadow: "0 0 0 2px rgba(0, 162, 131, 0.5)"
                                    } : undefined,
                                    onClick: ()=>onAction({
                                            type: "actions.block",
                                            actionId: a.id
                                        }),
                                    children: a.label
                                }, a.id, false, {
                                    fileName: "[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx",
                                    lineNumber: 312,
                                    columnNumber: 15
                                }, this))
                        }, void 0, false, {
                            fileName: "[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx",
                            lineNumber: 310,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx",
                    lineNumber: 308,
                    columnNumber: 9
                }, this),
                model.overflow && model.overflow.length > 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(MoreActionsSection, {
                    items: model.overflow,
                    onAction: onAction
                }, void 0, false, {
                    fileName: "[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx",
                    lineNumber: 325,
                    columnNumber: 11
                }, this) : null
            ]
        }, void 0, true, {
            fileName: "[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx",
            lineNumber: 307,
            columnNumber: 7
        }, this);
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "adminv2-ws-zone",
        style: {
            padding: "12px 14px"
        },
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                style: {
                    fontSize: 11,
                    fontWeight: 700,
                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].textSecondary,
                    marginBottom: 10
                },
                children: title
            }, void 0, false, {
                fileName: "[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx",
                lineNumber: 333,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                style: {
                    display: "flex",
                    flexDirection: "column",
                    gap: 8
                },
                children: model.primaries.map((a)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        type: "button",
                        onClick: ()=>onAction({
                                type: "actions.block",
                                actionId: a.id
                            }),
                        style: {
                            fontSize: 13,
                            fontWeight: 600,
                            padding: "8px 12px",
                            borderRadius: 8,
                            border: `1px solid ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].border}`,
                            background: a.variant === "secondary" ? "transparent" : __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["brand"].primary,
                            color: a.variant === "secondary" ? __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["brand"].primary : __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].surface,
                            cursor: "pointer",
                            outline: a.emphasized ? `2px solid ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["brand"].secondary}` : undefined
                        },
                        children: a.label
                    }, a.id, false, {
                        fileName: "[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx",
                        lineNumber: 336,
                        columnNumber: 11
                    }, this))
            }, void 0, false, {
                fileName: "[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx",
                lineNumber: 334,
                columnNumber: 7
            }, this),
            model.overflow && model.overflow.length > 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                style: {
                    marginTop: 10
                },
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(MoreActionsSection, {
                    items: model.overflow,
                    onAction: onAction
                }, void 0, false, {
                    fileName: "[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx",
                    lineNumber: 358,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx",
                lineNumber: 357,
                columnNumber: 9
            }, this) : null
        ]
    }, void 0, true, {
        fileName: "[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx",
        lineNumber: 332,
        columnNumber: 5
    }, this);
}
}),
"[project]/lib/workspace/viewModels/enrollmentRightRailMerge.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "REGISTRY_RIGHT_RAIL_ACTION_ID_PREFIX",
    ()=>REGISTRY_RIGHT_RAIL_ACTION_ID_PREFIX,
    "mergeEnrollmentRightRailActions",
    ()=>mergeEnrollmentRightRailActions,
    "registryRightRailActionId",
    ()=>registryRightRailActionId
]);
const REGISTRY_RIGHT_RAIL_ACTION_ID_PREFIX = "registry_right_rail:";
function registryRightRailActionId(key) {
    return `${REGISTRY_RIGHT_RAIL_ACTION_ID_PREFIX}${key}`;
}
function resolvedToPrimaryVm(a) {
    const style = (a.display_style ?? "").toLowerCase();
    const variant = style === "menu_item" ? "secondary" : "primary";
    return {
        id: registryRightRailActionId(a.key),
        label: a.label,
        variant
    };
}
function mergeEnrollmentRightRailActions(registry, base) {
    if (!registry.length) return base;
    const fromRegistry = registry.map(resolvedToPrimaryVm);
    return {
        ...base,
        systemActions: [
            ...fromRegistry
        ],
        quickOperations: [],
        overflow: []
    };
}
}),
"[project]/lib/workspace/rightRailResolvedFromActionsPayload.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "rightRailResolvedFromActionsPayload",
    ()=>rightRailResolvedFromActionsPayload
]);
function rightRailResolvedFromActionsPayload(actions) {
    if (!actions) return [];
    const rr = actions.right_rail ?? [];
    if (rr.length) return rr;
    return [
        ...actions.primary ?? [],
        ...actions.secondary ?? []
    ];
}
}),
"[project]/app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "AutomationWorkflowsBlock",
    ()=>AutomationWorkflowsBlock
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/client/app-dir/link.js [app-ssr] (ecmascript)");
"use client";
;
;
;
function humanTrigger(eventType) {
    const key = (eventType ?? "").trim().toLowerCase();
    if (key === "opportunity_schedule_tour_followup") return "Runs when a tour is scheduled";
    return "Runs on configured trigger";
}
function AutomationWorkflowsBlock(props) {
    const { kpis, workflows, title = "Automations", href = "/adminV2/workflows", kpisLoading = false } = props;
    const failuresHot = !kpisLoading && kpis.failed_last_7d > 0;
    const successConcern = !kpisLoading && kpis.success_rate_last_7d != null && kpis.success_rate_last_7d < 0.92 && kpis.success_rate_last_7d >= 0;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "adminv2-ws-automation-telemetry",
        "data-ws-component": "automation_telemetry",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("header", {
                className: "adminv2-ws-automation-telemetry__mast",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "adminv2-ws-automation-telemetry__mast-primary",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: "adminv2-ws-automation-telemetry__kicker",
                                children: "Workflow telemetry"
                            }, void 0, false, {
                                fileName: "[project]/app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock.tsx",
                                lineNumber: 48,
                                columnNumber: 21
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                className: "adminv2-ws-automation-telemetry__title",
                                children: title
                            }, void 0, false, {
                                fileName: "[project]/app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock.tsx",
                                lineNumber: 49,
                                columnNumber: 21
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: "adminv2-ws-automation-telemetry__subtitle",
                                children: "Live runs, reliability, and the workflows tied to this workspace surface."
                            }, void 0, false, {
                                fileName: "[project]/app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock.tsx",
                                lineNumber: 50,
                                columnNumber: 21
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock.tsx",
                        lineNumber: 47,
                        columnNumber: 17
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                        href: href,
                        className: "adminv2-ws-automation-telemetry__review",
                        children: [
                            "Review",
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                "aria-hidden": true,
                                children: " →"
                            }, void 0, false, {
                                fileName: "[project]/app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock.tsx",
                                lineNumber: 56,
                                columnNumber: 21
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock.tsx",
                        lineNumber: 54,
                        columnNumber: 17
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock.tsx",
                lineNumber: 46,
                columnNumber: 13
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "adminv2-ws-automation-telemetry__groups",
                role: "group",
                "aria-label": "Automation metrics",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                        className: "adminv2-ws-automation-telemetry__group",
                        "aria-label": "Throughput",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h4", {
                                className: "adminv2-ws-automation-telemetry__group-title",
                                children: "Throughput"
                            }, void 0, false, {
                                fileName: "[project]/app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock.tsx",
                                lineNumber: 62,
                                columnNumber: 21
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "adminv2-ws-automation-telemetry__group-cells",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "adminv2-ws-automation-telemetry__metric",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "adminv2-ws-automation-telemetry__metric-label",
                                                children: "Runs today"
                                            }, void 0, false, {
                                                fileName: "[project]/app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock.tsx",
                                                lineNumber: 65,
                                                columnNumber: 29
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: `adminv2-ws-automation-telemetry__metric-value ${kpisLoading ? "adminv2-ws-automation-telemetry__metric-value--pulse" : ""}`,
                                                children: kpisLoading ? "—" : kpis.runs_today
                                            }, void 0, false, {
                                                fileName: "[project]/app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock.tsx",
                                                lineNumber: 66,
                                                columnNumber: 29
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock.tsx",
                                        lineNumber: 64,
                                        columnNumber: 25
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "adminv2-ws-automation-telemetry__metric",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "adminv2-ws-automation-telemetry__metric-label",
                                                children: "Running (7d)"
                                            }, void 0, false, {
                                                fileName: "[project]/app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock.tsx",
                                                lineNumber: 73,
                                                columnNumber: 29
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: `adminv2-ws-automation-telemetry__metric-value ${kpisLoading ? "adminv2-ws-automation-telemetry__metric-value--pulse" : ""}`,
                                                children: kpisLoading ? "—" : kpis.running_last_7d
                                            }, void 0, false, {
                                                fileName: "[project]/app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock.tsx",
                                                lineNumber: 74,
                                                columnNumber: 29
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock.tsx",
                                        lineNumber: 72,
                                        columnNumber: 25
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock.tsx",
                                lineNumber: 63,
                                columnNumber: 21
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock.tsx",
                        lineNumber: 61,
                        columnNumber: 17
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                        className: "adminv2-ws-automation-telemetry__group",
                        "aria-label": "Reliability",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h4", {
                                className: "adminv2-ws-automation-telemetry__group-title",
                                children: "Reliability"
                            }, void 0, false, {
                                fileName: "[project]/app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock.tsx",
                                lineNumber: 83,
                                columnNumber: 21
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "adminv2-ws-automation-telemetry__group-cells",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: `adminv2-ws-automation-telemetry__metric ${successConcern ? "adminv2-ws-automation-telemetry__metric--watch" : ""}`,
                                        "data-automation-watch": successConcern ? "true" : undefined,
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "adminv2-ws-automation-telemetry__metric-label",
                                                children: "Success rate (7d)"
                                            }, void 0, false, {
                                                fileName: "[project]/app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock.tsx",
                                                lineNumber: 89,
                                                columnNumber: 29
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: `adminv2-ws-automation-telemetry__metric-value ${kpisLoading ? "adminv2-ws-automation-telemetry__metric-value--pulse" : ""}`,
                                                children: kpisLoading ? "—" : kpis.success_rate_last_7d == null ? "—" : `${Math.round(kpis.success_rate_last_7d * 100)}%`
                                            }, void 0, false, {
                                                fileName: "[project]/app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock.tsx",
                                                lineNumber: 90,
                                                columnNumber: 29
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock.tsx",
                                        lineNumber: 85,
                                        columnNumber: 25
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: `adminv2-ws-automation-telemetry__metric ${failuresHot ? "adminv2-ws-automation-telemetry__metric--attention" : ""}`,
                                        "data-automation-attention": failuresHot ? "true" : undefined,
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "adminv2-ws-automation-telemetry__metric-label",
                                                children: "Failures (7d)"
                                            }, void 0, false, {
                                                fileName: "[project]/app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock.tsx",
                                                lineNumber: 100,
                                                columnNumber: 29
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: `adminv2-ws-automation-telemetry__metric-value ${kpisLoading ? "adminv2-ws-automation-telemetry__metric-value--pulse" : ""}`,
                                                children: kpisLoading ? "—" : kpis.failed_last_7d
                                            }, void 0, false, {
                                                fileName: "[project]/app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock.tsx",
                                                lineNumber: 101,
                                                columnNumber: 29
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock.tsx",
                                        lineNumber: 96,
                                        columnNumber: 25
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock.tsx",
                                lineNumber: 84,
                                columnNumber: 21
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock.tsx",
                        lineNumber: 82,
                        columnNumber: 17
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock.tsx",
                lineNumber: 60,
                columnNumber: 13
            }, this),
            workflows?.length ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                className: "adminv2-ws-automation-telemetry__workflows",
                "aria-label": "Relevant workflows",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "adminv2-ws-automation-telemetry__workflows-head",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "adminv2-ws-automation-telemetry__workflows-kicker",
                                children: "In scope"
                            }, void 0, false, {
                                fileName: "[project]/app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock.tsx",
                                lineNumber: 114,
                                columnNumber: 25
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "adminv2-ws-automation-telemetry__workflows-hint",
                                children: "Configured for this entity"
                            }, void 0, false, {
                                fileName: "[project]/app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock.tsx",
                                lineNumber: 115,
                                columnNumber: 25
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock.tsx",
                        lineNumber: 113,
                        columnNumber: 21
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                        className: "adminv2-ws-automation-telemetry__workflow-list",
                        role: "list",
                        children: workflows.slice(0, 4).map((w)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                className: "adminv2-ws-automation-workflow-row",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "adminv2-ws-automation-workflow-row__rail",
                                        "aria-hidden": true
                                    }, void 0, false, {
                                        fileName: "[project]/app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock.tsx",
                                        lineNumber: 120,
                                        columnNumber: 33
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "adminv2-ws-automation-workflow-row__body",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "adminv2-ws-automation-workflow-row__name",
                                                children: w.name ?? w.id
                                            }, void 0, false, {
                                                fileName: "[project]/app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock.tsx",
                                                lineNumber: 122,
                                                columnNumber: 37
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "adminv2-ws-automation-workflow-row__meta",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        className: "adminv2-ws-automation-workflow-row__trigger",
                                                        children: humanTrigger(w.event_type)
                                                    }, void 0, false, {
                                                        fileName: "[project]/app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock.tsx",
                                                        lineNumber: 124,
                                                        columnNumber: 41
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        className: "adminv2-ws-automation-workflow-row__sep",
                                                        "aria-hidden": true,
                                                        children: "·"
                                                    }, void 0, false, {
                                                        fileName: "[project]/app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock.tsx",
                                                        lineNumber: 125,
                                                        columnNumber: 41
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        className: "adminv2-ws-automation-workflow-row__steps",
                                                        children: [
                                                            w.steps_count,
                                                            " step",
                                                            w.steps_count === 1 ? "" : "s"
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock.tsx",
                                                        lineNumber: 128,
                                                        columnNumber: 41
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock.tsx",
                                                lineNumber: 123,
                                                columnNumber: 37
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock.tsx",
                                        lineNumber: 121,
                                        columnNumber: 33
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: w.enabled === false ? "adminv2-ws-automation-workflow-row__chip adminv2-ws-automation-workflow-row__chip--disabled" : "adminv2-ws-automation-workflow-row__chip adminv2-ws-automation-workflow-row__chip--enabled",
                                        children: w.enabled === false ? "Off" : "Live"
                                    }, void 0, false, {
                                        fileName: "[project]/app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock.tsx",
                                        lineNumber: 133,
                                        columnNumber: 33
                                    }, this)
                                ]
                            }, w.id, true, {
                                fileName: "[project]/app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock.tsx",
                                lineNumber: 119,
                                columnNumber: 29
                            }, this))
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock.tsx",
                        lineNumber: 117,
                        columnNumber: 21
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock.tsx",
                lineNumber: 112,
                columnNumber: 17
            }, this) : null
        ]
    }, void 0, true, {
        fileName: "[project]/app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock.tsx",
        lineNumber: 45,
        columnNumber: 9
    }, this);
}
}),
"[project]/lib/ui-v2/formatWorkspaceCurrency.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
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
}),
"[project]/lib/workspace/growthSliceDepartments.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
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
}),
"[project]/lib/workspace/viewModels/workspaceRootRollup.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
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
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$ui$2d$v2$2f$formatWorkspaceCurrency$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/ui-v2/formatWorkspaceCurrency.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$growthSliceDepartments$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/workspace/growthSliceDepartments.ts [app-ssr] (ecmascript)");
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
function buildWorkspaceRootOrgOpportunityKpis(deptSnapshots) {
    let inMotion = 0;
    let closed = 0;
    let pipeline = 0;
    for (const { departmentKey, kpis } of deptSnapshots){
        if (!(0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$growthSliceDepartments$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["isGrowthSliceDepartmentKey"])(departmentKey) || !kpis?.counts) continue;
        inMotion += inMotionCountFromLifecycleCounts(kpis.counts);
        closed += closedCountFromLifecycleCounts(kpis.counts);
        pipeline += Number(kpis.values?.openPipeline ?? 0);
    }
    return [
        {
            id: "org_in_motion",
            label: "Active pipeline",
            value: String(Math.max(0, inMotion)),
            lane: "business"
        },
        {
            id: "org_pipeline_value",
            label: "Pipeline value",
            value: pipeline > 0 ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$ui$2d$v2$2f$formatWorkspaceCurrency$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["formatWorkspaceUsdGrouped"])(pipeline) : "—",
            lane: "business"
        },
        {
            id: "org_closed",
            label: "Closed outcomes",
            value: String(Math.max(0, closed)),
            lane: "business"
        }
    ];
}
function buildWorkspaceRootDepartmentTileRollupLine(params) {
    if ((0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$growthSliceDepartments$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["isGrowthSliceDepartmentKey"])(params.departmentKey) && params.kpis?.counts) {
        const motion = inMotionCountFromLifecycleCounts(params.kpis.counts);
        const pipe = params.kpis.values?.openPipeline;
        const pipeLabel = pipe != null && pipe > 0 ? ` · ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$ui$2d$v2$2f$formatWorkspaceCurrency$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["formatWorkspaceUsdGrouped"])(Number(pipe))} open` : "";
        return `${motion} active in pipeline${pipeLabel}`;
    }
    if (params.workUnitCount >= 0) {
        return `${params.workUnitCount} work unit${params.workUnitCount === 1 ? "" : "s"}`;
    }
    return null;
}
}),
"[project]/lib/kpi/contextKpiMetrics.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
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
    ()=>workspaceLifecycleTotalInScope
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$growthSliceDepartments$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/workspace/growthSliceDepartments.ts [app-ssr] (ecmascript)");
;
function workspaceLifecycleTotalInScope(growthSnapshots) {
    let sum = 0;
    let saw = false;
    for (const { departmentKey, kpis } of growthSnapshots){
        if (!(0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$growthSliceDepartments$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["isGrowthSliceDepartmentKey"])(departmentKey) || !kpis?.counts) continue;
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
}),
"[project]/lib/kpi/baseline.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "buildDefaultDepartmentKpis",
    ()=>buildDefaultDepartmentKpis,
    "buildDefaultWorkUnitKpis",
    ()=>buildDefaultWorkUnitKpis,
    "buildDefaultWorkspaceKpis",
    ()=>buildDefaultWorkspaceKpis
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$viewModels$2f$workspaceRootRollup$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/workspace/viewModels/workspaceRootRollup.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$kpi$2f$contextKpiMetrics$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/kpi/contextKpiMetrics.ts [app-ssr] (ecmascript)");
;
;
function formatInt(n) {
    if (n == null || Number.isNaN(n)) return "—";
    return String(Math.max(0, Math.floor(n)));
}
function buildDefaultWorkspaceKpis(metrics, growthSnapshots) {
    const inScope = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$kpi$2f$contextKpiMetrics$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["workspaceLifecycleTotalInScope"])(growthSnapshots);
    const contextFirst = inScope != null ? [
        {
            id: "baseline.ctx.workspace.total_in_scope",
            label: "Opportunities in pipeline scope",
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
    const roll = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$viewModels$2f$workspaceRootRollup$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["buildWorkspaceRootOrgOpportunityKpis"])(growthSnapshots);
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
        const total = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$kpi$2f$contextKpiMetrics$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["departmentSumWorkUnitTotals"])(params);
        const needs = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$kpi$2f$contextKpiMetrics$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["departmentNeedsAttentionSumSafe"])(params);
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
    const all = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$kpi$2f$contextKpiMetrics$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["workUnitTotalInQueueFromContext"])({
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
    const sel = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$kpi$2f$contextKpiMetrics$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["workUnitSelectedTabFromContext"])(context);
    if (sel != null) {
        items.push({
            id: "baseline.ctx.wu.selected_queue_count",
            label: "This queue",
            value: formatMetricValue(sel),
            lane: "business"
        });
    }
    const needs = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$kpi$2f$contextKpiMetrics$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["workUnitNeedsAttentionCount"])(context.queueSummaries);
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
}),
"[project]/lib/kpi/registry.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
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
}),
"[project]/lib/kpi/resolver.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "resolveKpisForDepartment",
    ()=>resolveKpisForDepartment,
    "resolveKpisForWorkUnit",
    ()=>resolveKpisForWorkUnit,
    "resolveKpisForWorkspace",
    ()=>resolveKpisForWorkspace
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$viewModels$2f$workspaceRootRollup$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/workspace/viewModels/workspaceRootRollup.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$kpi$2f$baseline$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/kpi/baseline.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$kpi$2f$contextKpiMetrics$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/kpi/contextKpiMetrics.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$kpi$2f$registry$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/kpi/registry.ts [app-ssr] (ecmascript)");
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
    const def = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$kpi$2f$registry$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getMetricDefinition"])(metricKey);
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
    const baseline = ()=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$kpi$2f$baseline$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["buildDefaultWorkspaceKpis"])(params.metrics, params.growthSnapshots);
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
    const orgPipeline = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$viewModels$2f$workspaceRootRollup$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["buildWorkspaceRootOrgOpportunityKpis"])(params.growthSnapshots);
    const items = [];
    for (const row of sortPlacements(visible)){
        const mk = row.metric_key;
        if (!(0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$kpi$2f$registry$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["isKnownMetricKey"])(mk)) {
            warnings.push(`unknown_metric_key:${mk}`);
            continue;
        }
        if (!(0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$kpi$2f$registry$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["validateMetricForSurface"])(mk, "workspace")) {
            warnings.push(`surface_mismatch:${mk}:workspace`);
            continue;
        }
        switch(mk){
            case "ctx.workspace.total_in_scope":
                {
                    const n = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$kpi$2f$contextKpiMetrics$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["workspaceLifecycleTotalInScope"])(params.growthSnapshots);
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
    const baseline = ()=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$kpi$2f$baseline$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["buildDefaultDepartmentKpis"])(deptCtx);
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
        if (!(0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$kpi$2f$registry$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["isKnownMetricKey"])(mk)) {
            warnings.push(`unknown_metric_key:${mk}`);
            continue;
        }
        if (!(0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$kpi$2f$registry$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["validateMetricForSurface"])(mk, "department")) {
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
            const n = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$kpi$2f$contextKpiMetrics$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["departmentSumWorkUnitTotals"])(deptCtx);
            items.push(vmFromRow(mk, formatInt(n), row));
        } else if (mk === "ctx.dept.needs_attention_count") {
            const n = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$kpi$2f$contextKpiMetrics$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["departmentNeedsAttentionSumSafe"])(deptCtx);
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
    const baseline = ()=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$kpi$2f$baseline$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["buildDefaultWorkUnitKpis"])(params.context);
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
        if (!(0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$kpi$2f$registry$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["isKnownMetricKey"])(mk)) {
            warnings.push(`unknown_metric_key:${mk}`);
            continue;
        }
        if (!(0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$kpi$2f$registry$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["validateMetricForSurface"])(mk, "work_unit")) {
            warnings.push(`surface_mismatch:${mk}:work_unit`);
            continue;
        }
        const fmt = (n)=>formatInt(n);
        switch(mk){
            case "ctx.wu.total_in_queue":
                items.push(vmFromRow(mk, fmt((0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$kpi$2f$contextKpiMetrics$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["workUnitTotalInQueueFromContext"])({
                    queueSummaries: ctx.queueSummaries,
                    legacyOpportunityListTotal: ctx.legacyOpportunityListTotal
                })), row));
                break;
            case "ctx.wu.selected_queue_count":
            case "wu.queue.selected_tab_count":
                items.push(vmFromRow(mk, fmt((0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$kpi$2f$contextKpiMetrics$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["workUnitSelectedTabFromContext"])(ctx)), row));
                break;
            case "ctx.wu.primary_lane_total":
            case "wu.queue.primary_lane_total":
                items.push(vmFromRow(mk, fmt((0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$kpi$2f$contextKpiMetrics$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["workUnitPrimaryLaneTotal"])(ctx.queueSummaries)), row));
                break;
            case "ctx.wu.needs_attention_count":
                items.push(vmFromRow(mk, fmt((0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$kpi$2f$contextKpiMetrics$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["workUnitNeedsAttentionCount"])(ctx.queueSummaries)), row));
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
}),
"[project]/app/adminV2/workspace/dept/[departmentId]/page.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>AdminV2WorkspaceDepartmentPage
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/navigation.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/client/app-dir/link.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$workspace$2f$WorkspacePairedOperPanels$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/components/admin/workspace/WorkspacePairedOperPanels.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$workspace$2f$WorkspaceChrome$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/components/admin/workspace/WorkspaceChrome.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$workspace$2f$DepartmentWorkspaceBridgeShell$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/components/admin/workspace/DepartmentWorkspaceBridgeShell.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$workspace$2f$blocks$2f$KPIBlock$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/adminV2/components/workspace/blocks/KPIBlock.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$workspace$2f$AdminV2RouteLoadingState$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/components/admin/workspace/AdminV2RouteLoadingState.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$workspace$2f$workspaceRouteSkeletons$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/components/admin/workspace/workspaceRouteSkeletons.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$workspaceRouteParam$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/workspace/workspaceRouteParam.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$workspace$2f$blocks$2f$ActionsBlock$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$contexts$2f$AdminDrawerContext$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/contexts/AdminDrawerContext.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$actions$2f$applyRegistryResolvedActionClient$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/actions/applyRegistryResolvedActionClient.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$viewModels$2f$enrollmentRightRailMerge$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/workspace/viewModels/enrollmentRightRailMerge.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$rightRailResolvedFromActionsPayload$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/workspace/rightRailResolvedFromActionsPayload.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$workspaceDataFetch$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/workspace/workspaceDataFetch.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$workspaceAdminFetchDedupe$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/workspace/workspaceAdminFetchDedupe.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$workspace$2f$blocks$2f$AutomationWorkflowsBlock$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$kpi$2f$baseline$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/kpi/baseline.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$kpi$2f$resolver$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/kpi/resolver.ts [app-ssr] (ecmascript)");
"use client";
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
;
;
const WORKSPACE_BASE = "/adminV2/workspace";
const DEFAULT_WF_KPIS = {
    runs_today: 0,
    runs_last_7d: 0,
    successful_last_7d: 0,
    failed_last_7d: 0,
    running_last_7d: 0,
    skipped_last_7d: 0,
    success_rate_last_7d: null
};
function AdminV2WorkspaceDepartmentPage() {
    const params = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useParams"])();
    const router = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRouter"])();
    const { openDrawer } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$contexts$2f$AdminDrawerContext$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useAdminDrawer"])();
    const departmentId = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$workspaceRouteParam$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["workspaceRouteParam"])(params.departmentId);
    const [dept, setDept] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [deptLoading, setDeptLoading] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(true);
    const [deptError, setDeptError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const deptKey = (dept?.key ?? "").trim().toLowerCase();
    const title = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>dept?.name?.trim() || "Department", [
        dept?.name
    ]);
    const [enrollmentDeptRightRail, setEnrollmentDeptRightRail] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [deptWorkUnits, setDeptWorkUnits] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [deptWorkUnitsError, setDeptWorkUnitsError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [deptWorkUnitSummaries, setDeptWorkUnitSummaries] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])({});
    const [deptQueueSummariesLoading, setDeptQueueSummariesLoading] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [deptQueueSummariesError, setDeptQueueSummariesError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [deptSummariesWaitTimedOut, setDeptSummariesWaitTimedOut] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    /** `undefined` = use baseline strip (placement fetch pending/failed); otherwise resolver output after successful placement fetch. */ const [deptPlacementStrip, setDeptPlacementStrip] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(undefined);
    const [workflowKpis, setWorkflowKpis] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(DEFAULT_WF_KPIS);
    const [workflowKpisLoading, setWorkflowKpisLoading] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(true);
    const [workflowsSummary, setWorkflowsSummary] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const primaryWorkUnit = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        const fromDeptList = deptWorkUnits?.[0] ?? null;
        return fromDeptList ? {
            id: fromDeptList.id
        } : null;
    }, [
        deptWorkUnits
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        let cancelled = false;
        setWorkflowKpisLoading(true);
        (async ()=>{
            try {
                const init = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$workspaceDataFetch$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["workspaceDataFetchInit"])();
                const [kRes, sRes] = await Promise.all([
                    fetch("/api/admin/workflow-runs?list=kpis", init),
                    fetch("/api/admin/workflows/summary?variant=workspace", init)
                ]);
                const kBody = await kRes.json().catch(()=>({}));
                const sJson = await sRes.json().catch(()=>({}));
                if (!cancelled) {
                    if (kRes.ok && kBody.kpis) setWorkflowKpis({
                        ...DEFAULT_WF_KPIS,
                        ...kBody.kpis
                    });
                    if (sRes.ok) {
                        const all = Array.isArray(sJson.workflows) ? sJson.workflows : [];
                        const relevant = all.filter((w)=>(w.entity_type ?? "").toLowerCase() === "opportunity");
                        setWorkflowsSummary(relevant);
                    }
                }
            } catch  {
            // non-fatal
            } finally{
                if (!cancelled) setWorkflowKpisLoading(false);
            }
        })();
        return ()=>{
            cancelled = true;
        };
    }, []);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (!departmentId) {
            setDept(null);
            setDeptWorkUnits(null);
            setDeptWorkUnitsError(null);
            setDeptError(null);
            setDeptLoading(false);
            return;
        }
        let cancelled = false;
        setDeptLoading(true);
        setDeptError(null);
        setDeptWorkUnitsError(null);
        void (async ()=>{
            try {
                const init = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$workspaceDataFetch$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["workspaceDataFetchInit"])();
                const deptRoute = `/api/admin/departments/${encodeURIComponent(departmentId)}`;
                const wuRoute = `/api/admin/work-units?department_id=${encodeURIComponent(departmentId)}`;
                const [deptRes, wuRes] = await Promise.all([
                    fetch(deptRoute, init),
                    fetch(wuRoute, init)
                ]);
                const deptJson = await deptRes.json().catch(()=>({}));
                const wuJson = await wuRes.json().catch(()=>({}));
                if (cancelled) return;
                if (!deptRes.ok) {
                    setDept(null);
                    setDeptError(deptJson.error ?? "Failed to load department");
                } else if (deptJson.id) {
                    setDept({
                        id: String(deptJson.id),
                        name: deptJson.name ?? null,
                        key: deptJson.key ?? null
                    });
                    setDeptError(null);
                } else {
                    setDept(null);
                    setDeptError("Department not found");
                }
                if (!wuRes.ok) {
                    setDeptWorkUnits(null);
                    setDeptWorkUnitsError(wuJson.error ?? "Failed to load work units");
                } else {
                    setDeptWorkUnits((wuJson.items ?? []).map((w)=>({
                            id: String(w.id),
                            name: w.name ?? null,
                            key: w.key ?? null
                        })));
                    setDeptWorkUnitsError(null);
                }
            } catch (e) {
                if (!cancelled) {
                    setDept(null);
                    setDeptError(e instanceof Error ? e.message : "Failed to load department");
                    setDeptWorkUnits(null);
                    setDeptWorkUnitsError(e instanceof Error ? e.message : "Failed to load work units");
                }
            } finally{
                if (!cancelled) setDeptLoading(false);
            }
        })();
        return ()=>{
            cancelled = true;
        };
    }, [
        departmentId
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        const list = deptWorkUnits ?? [];
        if (!departmentId || list.length === 0) {
            setDeptWorkUnitSummaries({});
            setDeptQueueSummariesLoading(false);
            setDeptQueueSummariesError(null);
            return;
        }
        let cancelled = false;
        setDeptQueueSummariesLoading(true);
        setDeptQueueSummariesError(null);
        void (async ()=>{
            try {
                const init = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$workspaceDataFetch$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["workspaceDataFetchInit"])();
                // Match work-unit queue badges: exact head counts (not PostgreSQL planned estimates).
                const route = `/api/admin/departments/${encodeURIComponent(departmentId)}/work-unit-queue-summaries?include_previews=false&count_mode=exact`;
                const res = await fetch(route, init);
                const j = await res.json().catch(()=>({}));
                if (cancelled) return;
                if (!res.ok) {
                    setDeptWorkUnitSummaries({});
                    setDeptQueueSummariesError(j.error ?? "Failed to load queue summaries");
                    return;
                }
                const next = {};
                for (const row of j.work_units ?? []){
                    const id = typeof row.id === "string" ? row.id : "";
                    if (!id) continue;
                    if (row.error) {
                        next[id] = {
                            total: 0,
                            needs_attention: null
                        };
                        continue;
                    }
                    const queues = row.queues ?? [];
                    /** Match work-unit "All" lane — do not sum tabs (overlapping lanes double-count). */ const legacySumAllQueues = ()=>queues.reduce((acc, q)=>acc + (typeof q.count === "number" ? q.count : 0), 0);
                    const total = typeof row.work_unit_scope_total === "number" && Number.isFinite(row.work_unit_scope_total) ? Math.max(0, Math.floor(row.work_unit_scope_total)) : legacySumAllQueues();
                    const needsRow = queues.find((q)=>(q.key ?? "").trim().toLowerCase() === "needs_attention");
                    const needs = needsRow && typeof needsRow.count === "number" ? needsRow.count : null;
                    next[id] = {
                        total,
                        needs_attention: needs
                    };
                }
                setDeptWorkUnitSummaries(next);
                setDeptQueueSummariesError(null);
            } catch (e) {
                if (!cancelled) {
                    setDeptWorkUnitSummaries({});
                    setDeptQueueSummariesError(e instanceof Error ? e.message : "Failed to load queue summaries");
                }
            } finally{
                if (!cancelled) setDeptQueueSummariesLoading(false);
            }
        })();
        return ()=>{
            cancelled = true;
        };
    }, [
        departmentId,
        deptWorkUnits
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        setDeptPlacementStrip(undefined);
    }, [
        departmentId
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (!departmentId) return;
        let cancelled = false;
        const init = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$workspaceDataFetch$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["workspaceDataFetchInit"])();
        void (async ()=>{
            try {
                const res = await fetch(`/api/admin/workspace-kpi-placements?surface=department&department_id=${encodeURIComponent(departmentId)}`, {
                    ...init ?? {},
                    cache: "no-store"
                });
                if (!res.ok) {
                    if (!cancelled) setDeptPlacementStrip(undefined);
                    return;
                }
                const j = await res.json().catch(()=>({}));
                if (cancelled) return;
                const wuList = deptWorkUnits ?? [];
                const { items } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$kpi$2f$resolver$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["resolveKpisForDepartment"])({
                    placementRows: j.items ?? [],
                    scopeHasPlacementRows: j.scope_has_placements === true,
                    departmentSurface: "department",
                    deptWorkUnits: wuList,
                    deptWorkUnitSummaries,
                    deptQueueSummariesLoading,
                    deptQueueSummariesError
                });
                if (!cancelled) setDeptPlacementStrip(items);
            } catch  {
                if (!cancelled) setDeptPlacementStrip(undefined);
            }
        })();
        return ()=>{
            cancelled = true;
        };
    }, [
        departmentId,
        deptWorkUnits,
        deptWorkUnitSummaries,
        deptQueueSummariesLoading,
        deptQueueSummariesError
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (!deptQueueSummariesLoading) {
            setDeptSummariesWaitTimedOut(false);
            return;
        }
        const t = window.setTimeout(()=>setDeptSummariesWaitTimedOut(true), 10_000);
        return ()=>clearTimeout(t);
    }, [
        deptQueueSummariesLoading
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (deptKey !== "enrollment" || !departmentId || !primaryWorkUnit?.id) {
            setEnrollmentDeptRightRail(null);
            return;
        }
        let cancelled = false;
        const route = `/api/admin/actions?` + new URLSearchParams({
            surface: "right_rail",
            entity_type: "opportunity",
            department_id: departmentId,
            work_unit_id: primaryWorkUnit.id
        }).toString();
        (async ()=>{
            try {
                const init = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$workspaceDataFetch$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["workspaceDataFetchInit"])();
                const res = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$workspaceAdminFetchDedupe$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["dedupeAdminFetchWithTtl"])(route, init, 1500);
                const j = await res.json().catch(()=>({}));
                if (!cancelled && res.ok) {
                    setEnrollmentDeptRightRail((0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$rightRailResolvedFromActionsPayload$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["rightRailResolvedFromActionsPayload"])(j.actions));
                } else if (!cancelled) {
                    setEnrollmentDeptRightRail([]);
                }
            } catch  {
                if (!cancelled) setEnrollmentDeptRightRail([]);
            }
        })();
        return ()=>{
            cancelled = true;
        };
    }, [
        deptKey,
        departmentId,
        primaryWorkUnit?.id
    ]);
    const enrollmentDepartmentRailModel = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        if (deptKey !== "enrollment") return null;
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$viewModels$2f$enrollmentRightRailMerge$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["mergeEnrollmentRightRailActions"])(enrollmentDeptRightRail ?? [], {
            primaries: [],
            systemActions: [],
            quickOperations: [],
            overflow: []
        });
    }, [
        deptKey,
        enrollmentDeptRightRail
    ]);
    const enrollmentRightRailByKey = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        const m = new Map();
        for (const a of enrollmentDeptRightRail ?? [])m.set(a.key, a);
        return m;
    }, [
        enrollmentDeptRightRail
    ]);
    const kpis = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        if (deptPlacementStrip !== undefined) return deptPlacementStrip;
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$kpi$2f$baseline$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["buildDefaultDepartmentKpis"])({
            deptWorkUnits: deptWorkUnits ?? [],
            deptWorkUnitSummaries,
            deptQueueSummariesLoading,
            deptQueueSummariesError
        });
    }, [
        deptPlacementStrip,
        deptQueueSummariesError,
        deptQueueSummariesLoading,
        deptWorkUnitSummaries,
        deptWorkUnits
    ]);
    const needsAttentionSummary = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        const list = deptWorkUnits ?? [];
        const explicitNeedsAttentionWu = list.find((w)=>(w.key ?? "").trim().toLowerCase() === "needs_attention") ?? null;
        const total = list.length === 0 || deptQueueSummariesLoading || deptQueueSummariesError ? null : Object.values(deptWorkUnitSummaries).reduce((acc, s)=>acc + (s.needs_attention ?? 0), 0);
        const targetWu = explicitNeedsAttentionWu ?? list[0] ?? null;
        const href = targetWu != null ? `${WORKSPACE_BASE}/dept/${encodeURIComponent(departmentId)}/work-unit/${encodeURIComponent(targetWu.id)}?queue=needs_attention` : `${WORKSPACE_BASE}/dept/${encodeURIComponent(departmentId)}`;
        return {
            total,
            href
        };
    }, [
        departmentId,
        deptQueueSummariesError,
        deptQueueSummariesLoading,
        deptWorkUnitSummaries,
        deptWorkUnits
    ]);
    const needsAttentionHref = needsAttentionSummary.href;
    const onEnrollmentDeptRailAction = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(async (action)=>{
        if (action.type !== "actions.block") return;
        if (action.actionId.startsWith(__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$viewModels$2f$enrollmentRightRailMerge$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["REGISTRY_RIGHT_RAIL_ACTION_ID_PREFIX"])) {
            const key = action.actionId.slice(__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$viewModels$2f$enrollmentRightRailMerge$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["REGISTRY_RIGHT_RAIL_ACTION_ID_PREFIX"].length);
            const resolved = enrollmentRightRailByKey.get(key);
            if (!resolved) return;
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$actions$2f$applyRegistryResolvedActionClient$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["applyRegistryResolvedActionClient"])(resolved, {
                router,
                openDrawer,
                departmentId,
                workUnitId: primaryWorkUnit?.id ?? null,
                needsAttentionHref,
                context: {
                    surface: "right_rail",
                    department_id: departmentId,
                    work_unit_id: primaryWorkUnit?.id ?? null
                }
            });
            return;
        }
        window.alert("Coming next: This action is not configured yet.");
    }, [
        departmentId,
        enrollmentRightRailByKey,
        needsAttentionHref,
        openDrawer,
        primaryWorkUnit?.id,
        router
    ]);
    const deptSummariesRibbonPending = deptQueueSummariesLoading && !deptSummariesWaitTimedOut;
    const throughputPairedPanels = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$workspace$2f$WorkspacePairedOperPanels$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["WorkspacePairedOperPanelsGrid"], {
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$workspace$2f$WorkspacePairedOperPanels$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["WorkspacePairedOperPanel"], {
                tone: "throughput",
                ariaLabel: "Work Unit Queue",
                title: "Work Unit Queue",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                    className: "adminv2-ws-queue-list",
                    role: "list",
                    children: [
                        deptWorkUnitsError ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                            className: "adminv2-ws-wu-queue-item-wrap",
                            role: "listitem",
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "rounded-lg border border-admin-border bg-white/50 px-3 py-2 text-xs text-alloy-ember",
                                children: [
                                    "Failed to load work units: ",
                                    deptWorkUnitsError
                                ]
                            }, void 0, true, {
                                fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/page.tsx",
                                lineNumber: 453,
                                columnNumber: 29
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/page.tsx",
                            lineNumber: 452,
                            columnNumber: 25
                        }, this) : null,
                        (deptWorkUnits ?? []).map((wu)=>{
                            const s = deptWorkUnitSummaries[wu.id];
                            const total = s ? s.total : null;
                            const needs = s ? s.needs_attention : null;
                            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                className: "adminv2-ws-wu-queue-item-wrap",
                                role: "listitem",
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                                    href: `${WORKSPACE_BASE}/dept/${encodeURIComponent(departmentId)}/work-unit/${encodeURIComponent(wu.id)}`,
                                    className: "adminv2-ws-wu-queue-card adminv2-ws-wu-queue-card--compact adminv2-ws-wu-queue-card--tier-standard no-underline text-inherit hover:opacity-[0.98]",
                                    "data-ws-wu-urgency": "standard",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "adminv2-ws-wu-queue-card-compact-text",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "adminv2-ws-wu-queue-card-title adminv2-ws-wu-queue-card-title--compact",
                                                    children: wu.name?.trim() || "Work unit"
                                                }, void 0, false, {
                                                    fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/page.tsx",
                                                    lineNumber: 470,
                                                    columnNumber: 41
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "adminv2-ws-paired-oper-queue-meta mt-2 grid grid-cols-2 gap-x-3 gap-y-1 tabular-nums",
                                                    style: {
                                                        color: "var(--d-muted)"
                                                    },
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                    className: "font-medium text-alloy-midnight/75",
                                                                    children: "Total"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/page.tsx",
                                                                    lineNumber: 478,
                                                                    columnNumber: 49
                                                                }, this),
                                                                " ",
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                    className: "text-alloy-midnight/85",
                                                                    children: total ?? "—"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/page.tsx",
                                                                    lineNumber: 479,
                                                                    columnNumber: 49
                                                                }, this)
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/page.tsx",
                                                            lineNumber: 477,
                                                            columnNumber: 45
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            className: "text-right",
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                    className: "font-medium text-alloy-midnight/75 whitespace-nowrap",
                                                                    children: "Needs attention"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/page.tsx",
                                                                    lineNumber: 482,
                                                                    columnNumber: 49
                                                                }, this),
                                                                " ",
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                    className: "text-alloy-midnight/85",
                                                                    children: needs ?? "—"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/page.tsx",
                                                                    lineNumber: 485,
                                                                    columnNumber: 49
                                                                }, this)
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/page.tsx",
                                                            lineNumber: 481,
                                                            columnNumber: 45
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/page.tsx",
                                                    lineNumber: 473,
                                                    columnNumber: 41
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/page.tsx",
                                            lineNumber: 469,
                                            columnNumber: 37
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "adminv2-ws-wu-queue-card-compact-aside",
                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "adminv2-ws-wu-queue-action-chip adminv2-ws-wu-queue-action-chip--open",
                                                children: "Open"
                                            }, void 0, false, {
                                                fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/page.tsx",
                                                lineNumber: 490,
                                                columnNumber: 41
                                            }, this)
                                        }, void 0, false, {
                                            fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/page.tsx",
                                            lineNumber: 489,
                                            columnNumber: 37
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/page.tsx",
                                    lineNumber: 464,
                                    columnNumber: 33
                                }, this)
                            }, `wu:${wu.id}`, false, {
                                fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/page.tsx",
                                lineNumber: 463,
                                columnNumber: 29
                            }, this);
                        })
                    ]
                }, void 0, true, {
                    fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/page.tsx",
                    lineNumber: 450,
                    columnNumber: 17
                }, this)
            }, void 0, false, {
                fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/page.tsx",
                lineNumber: 449,
                columnNumber: 13
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$workspace$2f$WorkspacePairedOperPanels$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["WorkspacePairedOperPanel"], {
                tone: "attention",
                ariaLabel: "Needs Attention",
                title: "Needs Attention",
                titleClassName: "adminv2-ws-queue-title--section-primary-type",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                    className: "adminv2-ws-queue-list",
                    role: "list",
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                        className: "adminv2-ws-wu-queue-item-wrap",
                        role: "listitem",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                            href: needsAttentionSummary.href,
                            className: "adminv2-ws-wu-queue-card adminv2-ws-wu-queue-card--compact adminv2-ws-wu-queue-card--tier-warning no-underline text-inherit hover:opacity-[0.98]",
                            "data-ws-wu-urgency": "attention",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "adminv2-ws-wu-queue-card-compact-text",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "adminv2-ws-wu-queue-card-title adminv2-ws-wu-queue-card-title--compact",
                                            children: "Needs attention"
                                        }, void 0, false, {
                                            fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/page.tsx",
                                            lineNumber: 514,
                                            columnNumber: 33
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "adminv2-ws-paired-oper-queue-meta mt-2 grid grid-cols-2 gap-x-3 gap-y-1 tabular-nums",
                                            style: {
                                                color: "var(--d-muted)"
                                            },
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            className: "font-medium text-alloy-midnight/75",
                                                            children: "Total"
                                                        }, void 0, false, {
                                                            fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/page.tsx",
                                                            lineNumber: 522,
                                                            columnNumber: 41
                                                        }, this),
                                                        " ",
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            className: "text-alloy-midnight/85",
                                                            children: needsAttentionSummary.total ?? "—"
                                                        }, void 0, false, {
                                                            fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/page.tsx",
                                                            lineNumber: 523,
                                                            columnNumber: 41
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/page.tsx",
                                                    lineNumber: 521,
                                                    columnNumber: 37
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "text-right",
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            className: "font-medium text-alloy-midnight/75 whitespace-nowrap",
                                                            children: "Needs attention"
                                                        }, void 0, false, {
                                                            fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/page.tsx",
                                                            lineNumber: 526,
                                                            columnNumber: 41
                                                        }, this),
                                                        " ",
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            className: "text-alloy-midnight/85",
                                                            children: needsAttentionSummary.total ?? "—"
                                                        }, void 0, false, {
                                                            fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/page.tsx",
                                                            lineNumber: 529,
                                                            columnNumber: 41
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/page.tsx",
                                                    lineNumber: 525,
                                                    columnNumber: 37
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/page.tsx",
                                            lineNumber: 517,
                                            columnNumber: 33
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/page.tsx",
                                    lineNumber: 513,
                                    columnNumber: 29
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "adminv2-ws-wu-queue-card-compact-aside",
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "adminv2-ws-wu-queue-action-chip adminv2-ws-wu-queue-action-chip--open",
                                        children: "Open"
                                    }, void 0, false, {
                                        fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/page.tsx",
                                        lineNumber: 534,
                                        columnNumber: 33
                                    }, this)
                                }, void 0, false, {
                                    fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/page.tsx",
                                    lineNumber: 533,
                                    columnNumber: 29
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/page.tsx",
                            lineNumber: 508,
                            columnNumber: 25
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/page.tsx",
                        lineNumber: 507,
                        columnNumber: 21
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/page.tsx",
                    lineNumber: 506,
                    columnNumber: 17
                }, this)
            }, void 0, false, {
                fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/page.tsx",
                lineNumber: 500,
                columnNumber: 13
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/page.tsx",
        lineNumber: 448,
        columnNumber: 9
    }, this);
    if (deptLoading) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$workspace$2f$WorkspaceChrome$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["WorkspaceChrome"], {
            variant: "bridge",
            breadcrumbs: [
                {
                    href: WORKSPACE_BASE,
                    label: "Workspace"
                },
                {
                    label: "Loading…"
                }
            ],
            title: "Loading…",
            subtitle: "",
            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$workspace$2f$AdminV2RouteLoadingState$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AdminV2RouteLoadingState"], {
                variant: "department"
            }, void 0, false, {
                fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/page.tsx",
                lineNumber: 554,
                columnNumber: 17
            }, this)
        }, void 0, false, {
            fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/page.tsx",
            lineNumber: 545,
            columnNumber: 13
        }, this);
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$workspace$2f$WorkspaceChrome$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["WorkspaceChrome"], {
        variant: "bridge",
        breadcrumbs: [
            {
                href: WORKSPACE_BASE,
                label: "Workspace"
            },
            {
                href: `${WORKSPACE_BASE}/dept/${departmentId}`,
                label: title
            }
        ],
        title: title,
        subtitle: "",
        children: [
            dept && primaryWorkUnit && deptSummariesRibbonPending ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$workspace$2f$workspaceRouteSkeletons$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["WsRouteLoadingRibbon"], {
                label: "Loading queue summaries"
            }, void 0, false, {
                fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/page.tsx",
                lineNumber: 570,
                columnNumber: 17
            }, this) : null,
            deptWorkUnitsError && dept ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "text-sm text-alloy-ember px-1",
                children: deptWorkUnitsError
            }, void 0, false, {
                fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/page.tsx",
                lineNumber: 572,
                columnNumber: 43
            }, this) : null,
            deptQueueSummariesError && dept ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "text-sm text-alloy-ember px-1",
                children: deptQueueSummariesError
            }, void 0, false, {
                fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/page.tsx",
                lineNumber: 573,
                columnNumber: 48
            }, this) : null,
            !dept ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "rounded-xl border px-4 py-10 text-center text-sm text-alloy-ember/90",
                style: {
                    borderColor: "var(--d-border, rgba(39,63,82,0.14))"
                },
                children: deptError ?? "This department could not be loaded. Use the workspace link above to pick another department."
            }, void 0, false, {
                fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/page.tsx",
                lineNumber: 575,
                columnNumber: 17
            }, this) : primaryWorkUnit ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$workspace$2f$DepartmentWorkspaceBridgeShell$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["DepartmentWorkspaceBridgeShell"], {
                departmentKey: deptKey,
                briefTitle: title,
                briefSubtitle: "",
                signalsSlot: null,
                kpiSlot: kpis.length ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$workspace$2f$blocks$2f$KPIBlock$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                    kpis: kpis,
                    maxVisible: 5
                }, void 0, false, {
                    fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/page.tsx",
                    lineNumber: 588,
                    columnNumber: 44
                }, void 0) : null,
                throughputSlot: throughputPairedPanels,
                attentionSlot: null,
                contextSlot: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "adminv2-ws-dept-v2-workflows-strip",
                    "data-ws-lane-kind": "automation_workflows",
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$workspace$2f$blocks$2f$AutomationWorkflowsBlock$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AutomationWorkflowsBlock"], {
                        title: "Automations",
                        kpisLoading: workflowKpisLoading,
                        kpis: {
                            runs_today: workflowKpis.runs_today,
                            failed_last_7d: workflowKpis.failed_last_7d,
                            running_last_7d: workflowKpis.running_last_7d,
                            success_rate_last_7d: workflowKpis.success_rate_last_7d
                        },
                        workflows: workflowsSummary,
                        href: "/adminV2/workflows"
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/page.tsx",
                        lineNumber: 596,
                        columnNumber: 29
                    }, void 0)
                }, void 0, false, {
                    fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/page.tsx",
                    lineNumber: 592,
                    columnNumber: 25
                }, void 0),
                railSlot: deptKey === "enrollment" && (enrollmentDepartmentRailModel?.systemActions?.length ?? 0) > 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$workspace$2f$blocks$2f$ActionsBlock$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                    model: enrollmentDepartmentRailModel,
                    onAction: onEnrollmentDeptRailAction,
                    title: "Actions",
                    surface: "department"
                }, void 0, false, {
                    fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/page.tsx",
                    lineNumber: 613,
                    columnNumber: 29
                }, void 0) : null
            }, void 0, false, {
                fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/page.tsx",
                lineNumber: 583,
                columnNumber: 17
            }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "rounded-xl border px-4 py-10 text-center text-sm text-alloy-midnight/55",
                style: {
                    borderColor: "var(--d-border, rgba(39,63,82,0.14))"
                },
                children: "No configured Work Unit UI was found for this department."
            }, void 0, false, {
                fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/page.tsx",
                lineNumber: 623,
                columnNumber: 17
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/page.tsx",
        lineNumber: 560,
        columnNumber: 9
    }, this);
}
}),
];

//# sourceMappingURL=_7a37f184._.js.map