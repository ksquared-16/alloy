(globalThis.TURBOPACK || (globalThis.TURBOPACK = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/components/admin/workspace/WorkspaceChrome.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "WorkspaceChrome",
    ()=>WorkspaceChrome
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/navigation.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$navigation$2f$AdminV2NavLink$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/adminV2/components/navigation/AdminV2NavLink.tsx [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
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
    _s();
    const pathname = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["usePathname"])();
    const path = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "WorkspaceChrome.useMemo[path]": ()=>normalizedPathname(pathname)
    }["WorkspaceChrome.useMemo[path]"], [
        pathname
    ]);
    const outer = variant === "bridge" ? "w-full max-w-none mx-0 px-0 pt-1 pb-0 space-y-2" : "max-w-6xl mx-auto px-4 py-6 space-y-6";
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: outer,
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("nav", {
                className: "text-sm text-alloy-midnight/60 flex flex-wrap items-center gap-1 px-1",
                "aria-label": "Breadcrumb",
                children: breadcrumbs.map((b, i)=>{
                    const isLast = i === breadcrumbs.length - 1;
                    const href = b.href?.trim() || null;
                    const showLink = Boolean(href) && !isLast;
                    const active = Boolean(href && path.replace(/\/$/, "") === href.replace(/\/$/, ""));
                    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "flex items-center gap-1",
                        children: [
                            i > 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "text-alloy-midnight/40",
                                "aria-hidden": true,
                                children: "/"
                            }, void 0, false, {
                                fileName: "[project]/components/admin/workspace/WorkspaceChrome.tsx",
                                lineNumber: 56,
                                columnNumber: 38
                            }, this) : null,
                            showLink && href ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$navigation$2f$AdminV2NavLink$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AdminV2NavLink"], {
                                href: href,
                                active: active,
                                className: "px-1 -mx-0.5 py-0.5 text-alloy-midnight/75 hover:text-alloy-blue font-medium",
                                children: b.label
                            }, void 0, false, {
                                fileName: "[project]/components/admin/workspace/WorkspaceChrome.tsx",
                                lineNumber: 58,
                                columnNumber: 33
                            }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
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
            variant !== "bridge" ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("header", {
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "text-xs font-semibold tracking-wide text-alloy-forge/70",
                        children: "Workspace (V2 slice)"
                    }, void 0, false, {
                        fileName: "[project]/components/admin/workspace/WorkspaceChrome.tsx",
                        lineNumber: 82,
                        columnNumber: 21
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h1", {
                        className: "text-2xl font-semibold text-alloy-midnight mt-1",
                        children: title
                    }, void 0, false, {
                        fileName: "[project]/components/admin/workspace/WorkspaceChrome.tsx",
                        lineNumber: 83,
                        columnNumber: 21
                    }, this),
                    subtitle ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
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
_s(WorkspaceChrome, "LBShkgJfC6p48EphsO4MG0BxHFo=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["usePathname"]
    ];
});
_c = WorkspaceChrome;
var _c;
__turbopack_context__.k.register(_c, "WorkspaceChrome");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/app/adminV2/components/workspace/blocks/SignalBlock.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>SignalBlock
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/styles/tokens/colors.ts [app-client] (ecmascript)");
"use client";
;
;
const severityAccent = {
    info: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["brand"].primary,
    warning: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["semantic"].warning,
    critical: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["semantic"].warning
};
function SignalBlock({ signals, onAction, maxVisible = 5, surface = "default" }) {
    const visible = signals.slice(0, maxVisible);
    if (visible.length === 0) return null;
    if (surface === "department" || surface === "company" || surface === "work_unit" || surface === "record") {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "adminv2-ws-signal-strip adminv2-ws-band-signals",
            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "adminv2-ws-signal-cards",
                children: visible.map((s)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "adminv2-ws-signal-card",
                        "data-severity": s.severity,
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "adminv2-ws-signal-card-row",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "adminv2-ws-signal-card-main",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "adminv2-ws-signal-label",
                                            children: "Signal"
                                        }, void 0, false, {
                                            fileName: "[project]/app/adminV2/components/workspace/blocks/SignalBlock.tsx",
                                            lineNumber: 33,
                                            columnNumber: 19
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "adminv2-ws-signal-title",
                                            children: s.title
                                        }, void 0, false, {
                                            fileName: "[project]/app/adminV2/components/workspace/blocks/SignalBlock.tsx",
                                            lineNumber: 34,
                                            columnNumber: 19
                                        }, this),
                                        s.description && surface !== "work_unit" && surface !== "record" ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "adminv2-ws-signal-desc",
                                            children: s.description
                                        }, void 0, false, {
                                            fileName: "[project]/app/adminV2/components/workspace/blocks/SignalBlock.tsx",
                                            lineNumber: 36,
                                            columnNumber: 21
                                        }, this) : null,
                                        (surface === "department" || surface === "work_unit" || surface === "record") && s.aiExplanation?.trim() ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "adminv2-ws-signal-ai",
                                            children: s.aiExplanation.trim()
                                        }, void 0, false, {
                                            fileName: "[project]/app/adminV2/components/workspace/blocks/SignalBlock.tsx",
                                            lineNumber: 40,
                                            columnNumber: 21
                                        }, this) : null
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/app/adminV2/components/workspace/blocks/SignalBlock.tsx",
                                    lineNumber: 32,
                                    columnNumber: 17
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "adminv2-ws-signal-actions",
                                    children: s.actions.map((a)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                            type: "button",
                                            onClick: ()=>onAction({
                                                    type: "signal.action",
                                                    signalId: s.id,
                                                    actionId: a.id
                                                }),
                                            children: a.label
                                        }, a.id, false, {
                                            fileName: "[project]/app/adminV2/components/workspace/blocks/SignalBlock.tsx",
                                            lineNumber: 45,
                                            columnNumber: 21
                                        }, this))
                                }, void 0, false, {
                                    fileName: "[project]/app/adminV2/components/workspace/blocks/SignalBlock.tsx",
                                    lineNumber: 43,
                                    columnNumber: 17
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/app/adminV2/components/workspace/blocks/SignalBlock.tsx",
                            lineNumber: 31,
                            columnNumber: 15
                        }, this)
                    }, s.id, false, {
                        fileName: "[project]/app/adminV2/components/workspace/blocks/SignalBlock.tsx",
                        lineNumber: 30,
                        columnNumber: 13
                    }, this))
            }, void 0, false, {
                fileName: "[project]/app/adminV2/components/workspace/blocks/SignalBlock.tsx",
                lineNumber: 28,
                columnNumber: 9
            }, this)
        }, void 0, false, {
            fileName: "[project]/app/adminV2/components/workspace/blocks/SignalBlock.tsx",
            lineNumber: 27,
            columnNumber: 7
        }, this);
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "adminv2-ws-band-signals",
        style: {
            padding: "12px 16px"
        },
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            style: {
                display: "flex",
                flexWrap: "wrap",
                gap: 10
            },
            children: visible.map((s)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "adminv2-ws-zone",
                    style: {
                        flex: "1 1 280px",
                        maxWidth: 420,
                        padding: "10px 12px",
                        borderLeft: `3px solid ${severityAccent[s.severity]}`
                    },
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            style: {
                                fontSize: 11,
                                fontWeight: 700,
                                color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].textSecondary,
                                marginBottom: 4
                            },
                            children: "Signal"
                        }, void 0, false, {
                            fileName: "[project]/app/adminV2/components/workspace/blocks/SignalBlock.tsx",
                            lineNumber: 76,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            style: {
                                fontSize: 14,
                                fontWeight: 600,
                                color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["neutral"].textPrimary,
                                marginBottom: 4
                            },
                            children: s.title
                        }, void 0, false, {
                            fileName: "[project]/app/adminV2/components/workspace/blocks/SignalBlock.tsx",
                            lineNumber: 79,
                            columnNumber: 13
                        }, this),
                        s.description && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            style: {
                                fontSize: 12,
                                color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].textSecondary,
                                marginBottom: 6,
                                lineHeight: 1.4
                            },
                            children: s.description
                        }, void 0, false, {
                            fileName: "[project]/app/adminV2/components/workspace/blocks/SignalBlock.tsx",
                            lineNumber: 83,
                            columnNumber: 15
                        }, this),
                        s.aiExplanation && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            style: {
                                fontSize: 11,
                                color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["brand"].secondary,
                                fontStyle: "italic",
                                marginBottom: 8,
                                lineHeight: 1.35
                            },
                            children: s.aiExplanation
                        }, void 0, false, {
                            fileName: "[project]/app/adminV2/components/workspace/blocks/SignalBlock.tsx",
                            lineNumber: 88,
                            columnNumber: 15
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            style: {
                                display: "flex",
                                flexWrap: "wrap",
                                gap: 6
                            },
                            children: s.actions.map((a)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    className: "adminv2-ws-btn-primary-solid",
                                    onClick: ()=>onAction({
                                            type: "signal.action",
                                            signalId: s.id,
                                            actionId: a.id
                                        }),
                                    style: {
                                        fontSize: 12,
                                        fontWeight: 600,
                                        padding: "4px 10px",
                                        borderRadius: 6,
                                        cursor: "pointer"
                                    },
                                    children: a.label
                                }, a.id, false, {
                                    fileName: "[project]/app/adminV2/components/workspace/blocks/SignalBlock.tsx",
                                    lineNumber: 102,
                                    columnNumber: 17
                                }, this))
                        }, void 0, false, {
                            fileName: "[project]/app/adminV2/components/workspace/blocks/SignalBlock.tsx",
                            lineNumber: 100,
                            columnNumber: 13
                        }, this)
                    ]
                }, s.id, true, {
                    fileName: "[project]/app/adminV2/components/workspace/blocks/SignalBlock.tsx",
                    lineNumber: 66,
                    columnNumber: 11
                }, this))
        }, void 0, false, {
            fileName: "[project]/app/adminV2/components/workspace/blocks/SignalBlock.tsx",
            lineNumber: 64,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/app/adminV2/components/workspace/blocks/SignalBlock.tsx",
        lineNumber: 63,
        columnNumber: 5
    }, this);
}
_c = SignalBlock;
var _c;
__turbopack_context__.k.register(_c, "SignalBlock");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
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
"[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>QueueBlock
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/styles/tokens/colors.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminFormatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/adminFormatters.ts [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
;
function fireViewAll(queue, onAction) {
    if (!queue.viewAllActionId) return;
    onAction({
        type: "queue.item.action",
        queueId: queue.id,
        itemId: "__view_all__",
        actionId: queue.viewAllActionId,
        payload: queue.drillWorkUnitKey != null && queue.drillWorkUnitKey !== "" ? {
            workUnitKey: queue.drillWorkUnitKey
        } : undefined
    });
}
/**
 * Department-only: rollup surface — entire card drills to work-unit list when `viewAllActionId` is set.
 */ function DepartmentRollupLane({ queue, onAction, variant }) {
    const isAttention = variant === "secondary";
    const groups = queue.rollupGroups ?? [];
    const examples = (queue.rollupExamples ?? []).slice(0, 2);
    const total = queue.countBadge ?? groups.reduce((s, g)=>s + g.count, 0);
    const kicker = isAttention ? "AI-prioritized exceptions" : "AI-ranked throughput";
    const groupsClass = isAttention ? "adminv2-ws-dept-rollup-groups adminv2-ws-dept-rollup-groups--attention" : "adminv2-ws-dept-rollup-groups adminv2-ws-dept-rollup-groups--throughput";
    const shellClass = [
        "adminv2-ws-dept-qsec",
        isAttention ? "adminv2-ws-dept-qsec--secondary" : "adminv2-ws-dept-qsec--primary",
        isAttention ? "adminv2-ws-dept-attention-panel" : "adminv2-ws-dept-throughput-panel",
        "adminv2-ws-dept-rollup-lane",
        queue.viewAllActionId ? "adminv2-ws-dept-rollup-card-hit" : ""
    ].filter(Boolean).join(" ");
    const inner = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("header", {
                className: isAttention ? "adminv2-ws-dept-rollup-head adminv2-ws-dept-rollup-head--attention" : "adminv2-ws-dept-rollup-head adminv2-ws-dept-rollup-head--throughput",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "adminv2-ws-dept-rollup-head-text",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "adminv2-ws-dept-rollup-kicker",
                                children: kicker
                            }, void 0, false, {
                                fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                lineNumber: 66,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                className: "adminv2-ws-dept-rollup-title",
                                children: queue.title
                            }, void 0, false, {
                                fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                lineNumber: 67,
                                columnNumber: 11
                            }, this),
                            queue.rollupSummary ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: "adminv2-ws-dept-rollup-lane-summary",
                                children: queue.rollupSummary
                            }, void 0, false, {
                                fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                lineNumber: 68,
                                columnNumber: 34
                            }, this) : null
                        ]
                    }, void 0, true, {
                        fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                        lineNumber: 65,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "adminv2-ws-dept-rollup-head-meta",
                        children: total > 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "adminv2-ws-dept-rollup-total-badge",
                            children: total
                        }, void 0, false, {
                            fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                            lineNumber: 71,
                            columnNumber: 24
                        }, this) : null
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                        lineNumber: 70,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                lineNumber: 64,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "adminv2-ws-dept-rollup-scroll",
                children: [
                    groups.length > 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                        className: groupsClass,
                        role: "list",
                        children: groups.map((g)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                className: "adminv2-ws-dept-rollup-group",
                                role: "listitem",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "adminv2-ws-dept-rollup-group-main",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "adminv2-ws-dept-rollup-group-label",
                                                children: g.label
                                            }, void 0, false, {
                                                fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                                lineNumber: 81,
                                                columnNumber: 19
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "adminv2-ws-dept-rollup-group-count",
                                                "aria-label": `${g.count} items`,
                                                children: g.count
                                            }, void 0, false, {
                                                fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                                lineNumber: 82,
                                                columnNumber: 19
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                        lineNumber: 80,
                                        columnNumber: 17
                                    }, this),
                                    g.descriptor ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "adminv2-ws-dept-rollup-group-desc",
                                        children: g.descriptor
                                    }, void 0, false, {
                                        fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                        lineNumber: 86,
                                        columnNumber: 33
                                    }, this) : null
                                ]
                            }, g.id, true, {
                                fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                lineNumber: 79,
                                columnNumber: 15
                            }, this))
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                        lineNumber: 77,
                        columnNumber: 11
                    }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "adminv2-ws-dept-rollup-empty",
                        children: "No rollup breakdown available for this lane."
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                        lineNumber: 91,
                        columnNumber: 11
                    }, this),
                    examples.length > 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "adminv2-ws-dept-rollup-examples",
                        "aria-label": "Sample context only",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "adminv2-ws-dept-rollup-examples-label",
                                children: "Examples"
                            }, void 0, false, {
                                fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                lineNumber: 96,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "adminv2-ws-dept-rollup-examples-text",
                                children: examples.map((e)=>e.label).join(" · ")
                            }, void 0, false, {
                                fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                lineNumber: 97,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                        lineNumber: 95,
                        columnNumber: 11
                    }, this) : null
                ]
            }, void 0, true, {
                fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                lineNumber: 75,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true);
    const laneKind = isAttention ? "attention" : "throughput";
    if (queue.viewAllActionId) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
            type: "button",
            className: shellClass,
            "data-ws-queue-id": queue.id,
            "data-ws-lane-kind": laneKind,
            onClick: ()=>fireViewAll(queue, onAction),
            "aria-label": `Open ${queue.title} — work-unit list`,
            children: inner
        }, void 0, false, {
            fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
            lineNumber: 108,
            columnNumber: 7
        }, this);
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: shellClass,
        "data-ws-queue-id": queue.id,
        "data-ws-lane-kind": laneKind,
        children: inner
    }, void 0, false, {
        fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
        lineNumber: 122,
        columnNumber: 5
    }, this);
}
_c = DepartmentRollupLane;
function workUnitSectionKey(item) {
    return item.groupKey?.trim() || item.groupLabel?.trim() || undefined;
}
function queueQuickActionDispatchId(qa) {
    const withAction = qa;
    if (typeof withAction.actionId === "string" && withAction.actionId.trim()) return withAction.actionId.trim();
    if (qa.id === "open") return "open_record";
    return qa.id;
}
/** Primary "Open" first for CRM action column scan hierarchy. */ function orderedQueueQuickActions(actions) {
    if (!actions?.length) return [];
    const openIdx = actions.findIndex((qa)=>queueQuickActionDispatchId(qa) === "open_record");
    if (openIdx <= 0) return actions;
    const next = actions.slice();
    const [open] = next.splice(openIdx, 1);
    return [
        open,
        ...next
    ];
}
/** Sentence-case each segment (split on middot) — work-unit status pill is no longer all-caps in CSS. */ function formatWorkUnitQueueStatusPill(raw) {
    return raw.split(/\s*·\s*/).map((seg)=>{
        const t = seg.trim();
        if (!t) return t;
        const lower = t.toLowerCase();
        return lower.charAt(0).toUpperCase() + lower.slice(1);
    }).join(" · ");
}
/**
 * CRM-compact queue preview — render-only layout from `CrmCompactRowSemanticSlots`.
 * Zones: identity+status+next | structured middle | footer note/activity preview (registry fields optional).
 */ function CrmCompactQueuePreview({ slots, urgencyTier = "standard" }) {
    const stageStatus = slots.stageLabel && slots.statusLabel && slots.stageLabel !== slots.statusLabel ? `${slots.stageLabel} · ${slots.statusLabel}` : slots.stageLabel || slots.statusLabel || null;
    const noteStress = Boolean(slots.attentionReason?.trim());
    const staleTone = slots.activityStale?.severity === "high" ? "adminv2-ws-queue-preview-stale adminv2-ws-queue-preview-stale--high" : slots.activityStale?.severity === "medium" ? "adminv2-ws-queue-preview-stale adminv2-ws-queue-preview-stale--medium" : "adminv2-ws-queue-preview-stale adminv2-ws-queue-preview-stale--low";
    const timingPartsLegacy = [];
    if (slots.ageContext?.trim()) timingPartsLegacy.push(slots.ageContext.trim());
    if (slots.tourContext?.trim()) {
        const t = slots.tourContext.trim();
        timingPartsLegacy.push(t.startsWith("Tour:") ? t : `Tour: ${t}`);
    }
    const timingLineLegacyRaw = timingPartsLegacy.length ? timingPartsLegacy.join(" · ") : null;
    const timingLineLegacy = timingLineLegacyRaw ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminFormatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["normalizePreviewLooseDateTokens"])(timingLineLegacyRaw) : null;
    const childLines = slots.childrenLines ?? [];
    const multiChild = childLines.length >= 2;
    const visibleChildren = childLines.slice(0, 4);
    const childOverflow = Math.max(0, childLines.length - visibleChildren.length);
    const hasNextStrip = Boolean(slots.nextStep?.trim());
    const primaryContactCaption = slots.rowPreviewLabelPrimaryContact?.trim() || "Contact";
    const structuredContact = Boolean(slots.contactDisplayName?.trim()) || Boolean(slots.contactPhoneDisplay?.trim()) || Boolean(slots.contactEmail?.trim());
    const desiredStartDv = slots.desiredStartDateDisplay?.trim();
    const ageBandDv = slots.ageBandContext?.trim();
    const tourDvRaw = slots.tourContext?.trim();
    const tourDv = tourDvRaw ? stripTourContextValuePrefix(tourDvRaw) : "";
    const desiredLabel = slots.rowPreviewLabelDesiredStartDate?.trim() || null;
    const ageLabel = slots.rowPreviewLabelAgeBand?.trim() || null;
    const tourLabel = slots.rowPreviewLabelTourDate?.trim() || null;
    const hasMiddle = structuredContact || Boolean(slots.contactSnippet?.trim()) || Boolean(!multiChild && slots.childName?.trim()) || multiChild || Boolean(slots.programContext?.trim()) || Boolean(slots.roomContext?.trim()) || Boolean(desiredStartDv) || Boolean(ageBandDv) || Boolean(tourDv) || Boolean(timingLineLegacy);
    const bodyClass = `adminv2-ws-crm-queue-preview__body${hasMiddle ? "" : " adminv2-ws-crm-queue-preview__body--identity-only"}`;
    const hasFooter = Boolean(slots.familyNote?.trim() || slots.lastActivity?.trim());
    const commercial = slots.commercialValue?.trim() ?? "";
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "adminv2-ws-crm-queue-preview adminv2-ws-enrollment-crm-preview",
        "data-queue-preview": "crm_compact",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: bodyClass,
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "adminv2-ws-crm-queue-preview__zone adminv2-ws-crm-queue-preview__zone--left",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "adminv2-ws-crm-queue-preview__title-row",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "adminv2-ws-crm-queue-preview__title",
                                        title: slots.primaryIdentity,
                                        children: slots.primaryIdentity
                                    }, void 0, false, {
                                        fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                        lineNumber: 245,
                                        columnNumber: 13
                                    }, this),
                                    stageStatus ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: `adminv2-ws-crm-queue-preview__status-pill adminv2-ws-crm-queue-preview__status-pill--urgency-${urgencyTier}`,
                                        children: formatWorkUnitQueueStatusPill(stageStatus)
                                    }, void 0, false, {
                                        fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                        lineNumber: 249,
                                        columnNumber: 15
                                    }, this) : null
                                ]
                            }, void 0, true, {
                                fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                lineNumber: 244,
                                columnNumber: 11
                            }, this),
                            hasNextStrip ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "adminv2-ws-crm-queue-preview__next-strip",
                                "aria-label": "Next step",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "adminv2-ws-crm-queue-preview__next-value",
                                        children: slots.nextStep.trim()
                                    }, void 0, false, {
                                        fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                        lineNumber: 258,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "adminv2-ws-crm-queue-preview__next-caption",
                                        children: "Next step"
                                    }, void 0, false, {
                                        fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                        lineNumber: 259,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                lineNumber: 257,
                                columnNumber: 13
                            }, this) : null,
                            commercial ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "adminv2-ws-crm-queue-preview__commercial",
                                children: commercial
                            }, void 0, false, {
                                fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                lineNumber: 263,
                                columnNumber: 13
                            }, this) : null,
                            slots.attentionReason?.trim() ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "adminv2-ws-crm-queue-preview__attention",
                                children: slots.attentionReason.trim()
                            }, void 0, false, {
                                fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                lineNumber: 266,
                                columnNumber: 13
                            }, this) : null,
                            slots.activityStale ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: staleTone,
                                children: slots.activityStale.label
                            }, void 0, false, {
                                fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                lineNumber: 268,
                                columnNumber: 34
                            }, this) : null
                        ]
                    }, void 0, true, {
                        fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                        lineNumber: 243,
                        columnNumber: 9
                    }, this),
                    hasMiddle ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "adminv2-ws-crm-queue-preview__zone adminv2-ws-crm-queue-preview__zone--middle",
                        children: [
                            structuredContact ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "adminv2-ws-crm-queue-preview__group",
                                "aria-label": primaryContactCaption,
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "adminv2-ws-crm-queue-preview__contact-segments",
                                        children: [
                                            slots.contactDisplayName?.trim() ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "adminv2-ws-crm-queue-preview__contact-seg adminv2-ws-crm-queue-preview__contact-seg--name",
                                                children: slots.contactDisplayName.trim()
                                            }, void 0, false, {
                                                fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                                lineNumber: 277,
                                                columnNumber: 21
                                            }, this) : null,
                                            slots.contactPhoneDisplay?.trim() ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "adminv2-ws-crm-queue-preview__contact-seg",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        className: "adminv2-ws-crm-queue-preview__contact-seg-k",
                                                        children: "Phone:"
                                                    }, void 0, false, {
                                                        fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                                        lineNumber: 283,
                                                        columnNumber: 23
                                                    }, this),
                                                    " ",
                                                    slots.contactPhoneDisplay.trim()
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                                lineNumber: 282,
                                                columnNumber: 21
                                            }, this) : null,
                                            slots.contactEmail?.trim() ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "adminv2-ws-crm-queue-preview__contact-seg",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        className: "adminv2-ws-crm-queue-preview__contact-seg-k",
                                                        children: "Email:"
                                                    }, void 0, false, {
                                                        fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                                        lineNumber: 289,
                                                        columnNumber: 23
                                                    }, this),
                                                    " ",
                                                    slots.contactEmail.trim()
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                                lineNumber: 288,
                                                columnNumber: 21
                                            }, this) : null
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                        lineNumber: 275,
                                        columnNumber: 17
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "adminv2-ws-crm-queue-preview__gk",
                                        children: primaryContactCaption
                                    }, void 0, false, {
                                        fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                        lineNumber: 294,
                                        columnNumber: 17
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                lineNumber: 274,
                                columnNumber: 15
                            }, this) : slots.contactSnippet?.trim() ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "adminv2-ws-crm-queue-preview__group",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "adminv2-ws-crm-queue-preview__gv",
                                        children: slots.contactSnippet.trim()
                                    }, void 0, false, {
                                        fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                        lineNumber: 298,
                                        columnNumber: 17
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "adminv2-ws-crm-queue-preview__gk",
                                        children: primaryContactCaption
                                    }, void 0, false, {
                                        fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                        lineNumber: 299,
                                        columnNumber: 17
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                lineNumber: 297,
                                columnNumber: 15
                            }, this) : null,
                            multiChild ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "adminv2-ws-crm-queue-preview__group adminv2-ws-crm-queue-preview__group--children-stack",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "adminv2-ws-crm-queue-preview__gk",
                                        children: "Children"
                                    }, void 0, false, {
                                        fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                        lineNumber: 304,
                                        columnNumber: 17
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                                        className: "adminv2-ws-crm-queue-preview__children-mini",
                                        role: "list",
                                        children: [
                                            visibleChildren.map((c, idx)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                                    className: "adminv2-ws-crm-queue-preview__child-mini",
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            className: "adminv2-ws-crm-queue-preview__child-mini-primary",
                                                            children: c.primary
                                                        }, void 0, false, {
                                                            fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                                            lineNumber: 308,
                                                            columnNumber: 23
                                                        }, this),
                                                        c.secondary?.trim() ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            className: "adminv2-ws-crm-queue-preview__child-mini-secondary",
                                                            children: c.secondary.trim()
                                                        }, void 0, false, {
                                                            fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                                            lineNumber: 310,
                                                            columnNumber: 25
                                                        }, this) : null
                                                    ]
                                                }, idx, true, {
                                                    fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                                    lineNumber: 307,
                                                    columnNumber: 21
                                                }, this)),
                                            childOverflow > 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                                className: "adminv2-ws-crm-queue-preview__child-mini adminv2-ws-crm-queue-preview__child-mini--more",
                                                children: [
                                                    "+",
                                                    childOverflow,
                                                    " more"
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                                lineNumber: 315,
                                                columnNumber: 21
                                            }, this) : null
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                        lineNumber: 305,
                                        columnNumber: 17
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                lineNumber: 303,
                                columnNumber: 15
                            }, this) : slots.childName?.trim() ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "adminv2-ws-crm-queue-preview__group",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "adminv2-ws-crm-queue-preview__gv",
                                        children: slots.childName.trim()
                                    }, void 0, false, {
                                        fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                        lineNumber: 323,
                                        columnNumber: 17
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "adminv2-ws-crm-queue-preview__gk",
                                        children: slots.childName.includes(" · ") ? "Children" : "Child"
                                    }, void 0, false, {
                                        fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                        lineNumber: 324,
                                        columnNumber: 17
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                lineNumber: 322,
                                columnNumber: 15
                            }, this) : null,
                            slots.programContext?.trim() ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "adminv2-ws-crm-queue-preview__group",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "adminv2-ws-crm-queue-preview__gv",
                                        children: slots.programContext.trim()
                                    }, void 0, false, {
                                        fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                        lineNumber: 331,
                                        columnNumber: 17
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "adminv2-ws-crm-queue-preview__gk",
                                        children: "Programs"
                                    }, void 0, false, {
                                        fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                        lineNumber: 332,
                                        columnNumber: 17
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                lineNumber: 330,
                                columnNumber: 15
                            }, this) : null,
                            slots.roomContext?.trim() ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "adminv2-ws-crm-queue-preview__group",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "adminv2-ws-crm-queue-preview__gv",
                                        children: slots.roomContext.trim()
                                    }, void 0, false, {
                                        fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                        lineNumber: 337,
                                        columnNumber: 17
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "adminv2-ws-crm-queue-preview__gk",
                                        children: "Room"
                                    }, void 0, false, {
                                        fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                        lineNumber: 338,
                                        columnNumber: 17
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                lineNumber: 336,
                                columnNumber: 15
                            }, this) : null,
                            desiredStartDv ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "adminv2-ws-crm-queue-preview__group",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "adminv2-ws-crm-queue-preview__gv",
                                        children: desiredStartDv
                                    }, void 0, false, {
                                        fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                        lineNumber: 343,
                                        columnNumber: 17
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "adminv2-ws-crm-queue-preview__gk",
                                        children: desiredLabel ?? ""
                                    }, void 0, false, {
                                        fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                        lineNumber: 344,
                                        columnNumber: 17
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                lineNumber: 342,
                                columnNumber: 15
                            }, this) : null,
                            ageBandDv ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "adminv2-ws-crm-queue-preview__group",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "adminv2-ws-crm-queue-preview__gv",
                                        children: ageBandDv
                                    }, void 0, false, {
                                        fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                        lineNumber: 349,
                                        columnNumber: 17
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "adminv2-ws-crm-queue-preview__gk",
                                        children: ageLabel ?? ""
                                    }, void 0, false, {
                                        fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                        lineNumber: 350,
                                        columnNumber: 17
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                lineNumber: 348,
                                columnNumber: 15
                            }, this) : null,
                            tourDv ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "adminv2-ws-crm-queue-preview__group",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "adminv2-ws-crm-queue-preview__gv",
                                        children: tourDv
                                    }, void 0, false, {
                                        fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                        lineNumber: 355,
                                        columnNumber: 17
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "adminv2-ws-crm-queue-preview__gk",
                                        children: tourLabel ?? ""
                                    }, void 0, false, {
                                        fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                        lineNumber: 356,
                                        columnNumber: 17
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                lineNumber: 354,
                                columnNumber: 15
                            }, this) : null,
                            timingLineLegacy && !desiredStartDv && !ageBandDv && !tourDv ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "adminv2-ws-crm-queue-preview__group",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "adminv2-ws-crm-queue-preview__gv",
                                        children: timingLineLegacy
                                    }, void 0, false, {
                                        fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                        lineNumber: 361,
                                        columnNumber: 17
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "adminv2-ws-crm-queue-preview__gk",
                                        children: "Timing"
                                    }, void 0, false, {
                                        fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                        lineNumber: 362,
                                        columnNumber: 17
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                lineNumber: 360,
                                columnNumber: 15
                            }, this) : null
                        ]
                    }, void 0, true, {
                        fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                        lineNumber: 272,
                        columnNumber: 11
                    }, this) : null
                ]
            }, void 0, true, {
                fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                lineNumber: 242,
                columnNumber: 7
            }, this),
            hasFooter ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: noteStress ? "adminv2-ws-crm-queue-preview__footer adminv2-ws-crm-queue-preview__footer--stress" : "adminv2-ws-crm-queue-preview__footer",
                children: [
                    slots.familyNote?.trim() ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "adminv2-ws-crm-queue-preview__footer-notes",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "adminv2-ws-crm-queue-preview__gv",
                                children: slots.familyNote.trim()
                            }, void 0, false, {
                                fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                lineNumber: 379,
                                columnNumber: 15
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "adminv2-ws-crm-queue-preview__gk",
                                children: "Notes"
                            }, void 0, false, {
                                fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                lineNumber: 380,
                                columnNumber: 15
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                        lineNumber: 378,
                        columnNumber: 13
                    }, this) : null,
                    slots.lastActivity?.trim() ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "adminv2-ws-crm-queue-preview__footer-activity",
                        children: slots.lastActivity.trim()
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                        lineNumber: 384,
                        columnNumber: 13
                    }, this) : null
                ]
            }, void 0, true, {
                fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                lineNumber: 370,
                columnNumber: 9
            }, this) : null
        ]
    }, void 0, true, {
        fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
        lineNumber: 238,
        columnNumber: 5
    }, this);
}
_c1 = CrmCompactQueuePreview;
function WorkUnitQueueLane({ queue, onAction }) {
    _s();
    const groupCounts = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "WorkUnitQueueLane.useMemo[groupCounts]": ()=>{
            const m = new Map();
            for (const item of queue.items){
                const k = workUnitSectionKey(item);
                if (!k) continue;
                m.set(k, (m.get(k) ?? 0) + 1);
            }
            return m;
        }
    }["WorkUnitQueueLane.useMemo[groupCounts]"], [
        queue.items
    ]);
    let lastSectionKey;
    const showQueueHeader = Boolean(queue.title?.trim());
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
        className: "adminv2-ws-dept-qsec adminv2-ws-dept-qsec--primary adminv2-ws-wu-queue-shell",
        "data-ws-queue-id": queue.id,
        "aria-label": queue.title?.trim() || "Queue",
        children: [
            showQueueHeader ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("header", {
                className: "adminv2-ws-queue-header",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "adminv2-ws-queue-title-row",
                    children: [
                        queue.title?.trim() ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                            className: "adminv2-ws-queue-title",
                            children: queue.title.trim()
                        }, void 0, false, {
                            fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                            lineNumber: 415,
                            columnNumber: 36
                        }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "sr-only",
                            children: "Queue"
                        }, void 0, false, {
                            fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                            lineNumber: 415,
                            columnNumber: 103
                        }, this),
                        queue.countBadge != null ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "adminv2-ws-wu-queue-count-badge",
                            "aria-label": `${queue.countBadge} in queue`,
                            children: queue.countBadge
                        }, void 0, false, {
                            fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                            lineNumber: 417,
                            columnNumber: 15
                        }, this) : null
                    ]
                }, void 0, true, {
                    fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                    lineNumber: 414,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                lineNumber: 413,
                columnNumber: 9
            }, this) : null,
            queue.rollupSummary ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "adminv2-ws-wu-queue-summary",
                children: queue.rollupSummary
            }, void 0, false, {
                fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                lineNumber: 424,
                columnNumber: 30
            }, this) : null,
            queue.sortCaption ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "adminv2-ws-wu-queue-sort-caption",
                role: "note",
                children: queue.sortCaption
            }, void 0, false, {
                fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                lineNumber: 426,
                columnNumber: 9
            }, this) : null,
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                className: "adminv2-ws-queue-list adminv2-ws-wu-queue-list",
                role: "list",
                children: [
                    queue.rowsLoading && queue.items.length === 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                        className: "adminv2-ws-wu-queue-empty-wrap",
                        role: "status",
                        "aria-busy": "true",
                        "aria-label": "Loading queue rows",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "adminv2-ws-wu-queue-empty-panel",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                    className: "adminv2-ws-wu-queue-empty-title",
                                    children: "Loading…"
                                }, void 0, false, {
                                    fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                    lineNumber: 434,
                                    columnNumber: 15
                                }, this),
                                queue.laneQueueLabel?.trim() ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                    className: "adminv2-ws-wu-queue-empty-queue text-alloy-forge/55",
                                    children: queue.laneQueueLabel.trim()
                                }, void 0, false, {
                                    fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                    lineNumber: 436,
                                    columnNumber: 17
                                }, this) : null
                            ]
                        }, void 0, true, {
                            fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                            lineNumber: 433,
                            columnNumber: 13
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                        lineNumber: 432,
                        columnNumber: 11
                    }, this) : !queue.rowsLoading && queue.items.length === 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                        className: "adminv2-ws-wu-queue-empty-wrap",
                        role: "status",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "adminv2-ws-wu-queue-empty-panel",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                    className: "adminv2-ws-wu-queue-empty-title",
                                    children: "No records"
                                }, void 0, false, {
                                    fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                    lineNumber: 443,
                                    columnNumber: 15
                                }, this),
                                queue.laneQueueLabel?.trim() ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                    className: "adminv2-ws-wu-queue-empty-queue",
                                    children: queue.laneQueueLabel.trim()
                                }, void 0, false, {
                                    fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                    lineNumber: 445,
                                    columnNumber: 17
                                }, this) : null
                            ]
                        }, void 0, true, {
                            fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                            lineNumber: 442,
                            columnNumber: 13
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                        lineNumber: 441,
                        columnNumber: 11
                    }, this) : null,
                    queue.items.map((item)=>{
                        const sectionKey = workUnitSectionKey(item);
                        const showGroup = sectionKey && sectionKey !== lastSectionKey;
                        if (sectionKey) lastSectionKey = sectionKey;
                        const tier = item.urgencyTier ?? "standard";
                        const rowQuickActions = orderedQueueQuickActions(item.quickActions);
                        const crm = item.semanticCrmCompact;
                        const valueShown = (crm?.commercialValue ?? item.valueLabel)?.trim() ?? "";
                        const hasValue = Boolean(valueShown);
                        const headerCfg = sectionKey ? queue.workUnitGroupHeaders?.[sectionKey] : undefined;
                        const count = sectionKey ? groupCounts.get(sectionKey) ?? 0 : 0;
                        const sectionTitle = showGroup && sectionKey ? headerCfg ? `${headerCfg.emoji ? `${headerCfg.emoji} ` : ""}${headerCfg.label} (${count})` : `${sectionKey} (${count})` : null;
                        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                            className: "adminv2-ws-wu-queue-item-wrap",
                            role: "listitem",
                            children: [
                                sectionTitle ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: `adminv2-ws-wu-queue-section-label${headerCfg ? " adminv2-ws-wu-queue-section-label--rich" : ""}`,
                                    role: "presentation",
                                    children: sectionTitle
                                }, void 0, false, {
                                    fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                    lineNumber: 473,
                                    columnNumber: 17
                                }, this) : null,
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: `adminv2-ws-wu-queue-card adminv2-ws-wu-queue-card--compact adminv2-ws-wu-queue-card--tier-${tier}`,
                                    "data-ws-wu-urgency": tier,
                                    role: "button",
                                    tabIndex: 0,
                                    onClick: ()=>onAction({
                                            type: "queue.item.action",
                                            queueId: queue.id,
                                            itemId: item.id,
                                            actionId: "open_record"
                                        }),
                                    onKeyDown: (e)=>{
                                        if (e.key === "Enter" || e.key === " ") {
                                            e.preventDefault();
                                            onAction({
                                                type: "queue.item.action",
                                                queueId: queue.id,
                                                itemId: item.id,
                                                actionId: "open_record"
                                            });
                                        }
                                    },
                                    children: [
                                        crm ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "adminv2-ws-enrollment-crm-row adminv2-ws-enrollment-crm-row--split",
                                            "data-enrollment-row-layout": "split_actions",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "adminv2-ws-enrollment-crm-row__content",
                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(CrmCompactQueuePreview, {
                                                        slots: crm,
                                                        urgencyTier: tier
                                                    }, void 0, false, {
                                                        fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                                        lineNumber: 508,
                                                        columnNumber: 23
                                                    }, this)
                                                }, void 0, false, {
                                                    fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                                    lineNumber: 507,
                                                    columnNumber: 21
                                                }, this),
                                                rowQuickActions.length ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "adminv2-ws-enrollment-crm-row__actions",
                                                    role: "group",
                                                    "aria-label": "Actions",
                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: "adminv2-ws-enrollment-crm-row__action-stack",
                                                        children: rowQuickActions.map((qa)=>{
                                                            const dispatchId = queueQuickActionDispatchId(qa);
                                                            const isOpen = dispatchId === "open_record";
                                                            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                type: "button",
                                                                className: isOpen ? "adminv2-ws-wu-queue-action-chip adminv2-ws-wu-queue-action-chip--open" : "adminv2-ws-wu-queue-action-chip adminv2-ws-wu-queue-action-chip--quiet",
                                                                onClick: (e)=>{
                                                                    e.stopPropagation();
                                                                    onAction({
                                                                        type: "queue.item.action",
                                                                        queueId: queue.id,
                                                                        itemId: item.id,
                                                                        actionId: dispatchId,
                                                                        payload: qa.payload
                                                                    });
                                                                },
                                                                children: qa.label
                                                            }, `${item.id}-qa-${qa.id}`, false, {
                                                                fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                                                lineNumber: 517,
                                                                columnNumber: 31
                                                            }, this);
                                                        })
                                                    }, void 0, false, {
                                                        fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                                        lineNumber: 512,
                                                        columnNumber: 25
                                                    }, this)
                                                }, void 0, false, {
                                                    fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                                    lineNumber: 511,
                                                    columnNumber: 23
                                                }, this) : null
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                            lineNumber: 506,
                                            columnNumber: 19
                                        }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "adminv2-ws-wu-queue-card-compact-text",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "adminv2-ws-wu-queue-card-title adminv2-ws-wu-queue-card-title--compact",
                                                    children: item.title
                                                }, void 0, false, {
                                                    fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                                    lineNumber: 546,
                                                    columnNumber: 21
                                                }, this),
                                                item.subtitle?.trim() ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "adminv2-ws-wu-queue-card-sub adminv2-ws-wu-queue-card-sub--compact",
                                                    children: item.subtitle.trim()
                                                }, void 0, false, {
                                                    fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                                    lineNumber: 548,
                                                    columnNumber: 23
                                                }, this) : null,
                                                item.tags && item.tags.length > 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "adminv2-ws-wu-queue-card-tags",
                                                    "aria-label": "Context",
                                                    children: item.tags.map((t)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            className: "adminv2-ws-wu-queue-card-tag",
                                                            children: t
                                                        }, `${item.id}-tag-${t}`, false, {
                                                            fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                                            lineNumber: 553,
                                                            columnNumber: 27
                                                        }, this))
                                                }, void 0, false, {
                                                    fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                                    lineNumber: 551,
                                                    columnNumber: 23
                                                }, this) : null,
                                                item.routeLabel?.trim() ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "adminv2-ws-wu-queue-card-route adminv2-ws-wu-queue-card-route--compact",
                                                    children: item.routeLabel.trim()
                                                }, void 0, false, {
                                                    fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                                    lineNumber: 560,
                                                    columnNumber: 23
                                                }, this) : null,
                                                item.windowLabel?.trim() ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "adminv2-ws-wu-queue-card-window adminv2-ws-wu-queue-card-window--compact",
                                                    children: item.windowLabel.trim()
                                                }, void 0, false, {
                                                    fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                                    lineNumber: 563,
                                                    columnNumber: 23
                                                }, this) : null,
                                                item.metaLines && item.metaLines.length > 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                                                    className: item.metaDensity === "inline" ? "adminv2-ws-wu-queue-card-meta adminv2-ws-wu-queue-card-meta--inline mt-1 list-none pl-0 m-0" : "adminv2-ws-wu-queue-card-meta mt-1 space-y-0.5 list-none pl-0 m-0",
                                                    "aria-label": "Inquiry details",
                                                    children: item.metaLines.map((line)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                                            className: item.metaDensity === "inline" ? "adminv2-ws-wu-queue-meta-inline-item text-[10px] leading-snug" : "flex flex-wrap gap-x-1.5 gap-y-0 text-[11px] leading-snug",
                                                            style: {
                                                                color: "var(--d-muted, rgba(55,65,81,0.85))"
                                                            },
                                                            children: item.metaDensity === "inline" ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                        className: "adminv2-ws-wu-queue-meta-inline-k",
                                                                        children: line.label
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                                                        lineNumber: 586,
                                                                        columnNumber: 33
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                        className: "min-w-0 break-words",
                                                                        children: line.value
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                                                        lineNumber: 587,
                                                                        columnNumber: 33
                                                                    }, this)
                                                                ]
                                                            }, void 0, true) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                        className: "font-medium shrink-0",
                                                                        children: line.label
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                                                        lineNumber: 591,
                                                                        columnNumber: 33
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                        className: "min-w-0 break-words",
                                                                        children: line.value
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                                                        lineNumber: 592,
                                                                        columnNumber: 33
                                                                    }, this)
                                                                ]
                                                            }, void 0, true)
                                                        }, `${item.id}-${line.label}`, false, {
                                                            fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                                            lineNumber: 575,
                                                            columnNumber: 27
                                                        }, this))
                                                }, void 0, false, {
                                                    fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                                    lineNumber: 566,
                                                    columnNumber: 23
                                                }, this) : null
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                            lineNumber: 545,
                                            columnNumber: 19
                                        }, this),
                                        !crm ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "adminv2-ws-wu-queue-card-compact-aside",
                                            children: [
                                                hasValue ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "adminv2-ws-wu-queue-value adminv2-ws-wu-queue-value--compact",
                                                    "aria-label": "Value",
                                                    children: valueShown
                                                }, void 0, false, {
                                                    fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                                    lineNumber: 604,
                                                    columnNumber: 23
                                                }, this) : null,
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "adminv2-ws-wu-queue-card-compact-cta-row",
                                                    children: [
                                                        rowQuickActions.length ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            className: "adminv2-ws-wu-queue-card-quick-actions",
                                                            role: "group",
                                                            "aria-label": "Quick actions",
                                                            children: rowQuickActions.map((qa)=>{
                                                                const qaDispatchId = queueQuickActionDispatchId(qa);
                                                                const isOpenQa = qaDispatchId === "open_record";
                                                                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                    type: "button",
                                                                    className: isOpenQa ? "adminv2-ws-wu-queue-action-chip adminv2-ws-wu-queue-action-chip--open" : "adminv2-ws-wu-queue-action-chip adminv2-ws-wu-queue-action-chip--quiet",
                                                                    onClick: (e)=>{
                                                                        e.stopPropagation();
                                                                        onAction({
                                                                            type: "queue.item.action",
                                                                            queueId: queue.id,
                                                                            itemId: item.id,
                                                                            actionId: qaDispatchId,
                                                                            payload: qa.payload
                                                                        });
                                                                    },
                                                                    children: qa.label
                                                                }, `${item.id}-qa-${qa.id}`, false, {
                                                                    fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                                                    lineNumber: 615,
                                                                    columnNumber: 31
                                                                }, this);
                                                            })
                                                        }, void 0, false, {
                                                            fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                                            lineNumber: 610,
                                                            columnNumber: 25
                                                        }, this) : null,
                                                        rowQuickActions.some((qa)=>queueQuickActionDispatchId(qa) === "open_record") ? null : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                            type: "button",
                                                            className: "adminv2-ws-wu-queue-action-chip adminv2-ws-wu-queue-action-chip--open",
                                                            onClick: (e)=>{
                                                                e.stopPropagation();
                                                                onAction({
                                                                    type: "queue.item.action",
                                                                    queueId: queue.id,
                                                                    itemId: item.id,
                                                                    actionId: "open_record"
                                                                });
                                                            },
                                                            children: "Open"
                                                        }, void 0, false, {
                                                            fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                                            lineNumber: 641,
                                                            columnNumber: 25
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                                    lineNumber: 608,
                                                    columnNumber: 21
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                            lineNumber: 602,
                                            columnNumber: 19
                                        }, this) : null
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                    lineNumber: 480,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, item.id, true, {
                            fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                            lineNumber: 471,
                            columnNumber: 13
                        }, this);
                    })
                ]
            }, void 0, true, {
                fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                lineNumber: 430,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
        lineNumber: 407,
        columnNumber: 5
    }, this);
}
_s(WorkUnitQueueLane, "KtGQgZ8lUsd8ypk9+pslg6Jz+IU=");
_c2 = WorkUnitQueueLane;
function QueueBlock({ queue, onAction, variant = "primary", surface = "default" }) {
    const isPrimary = variant === "primary";
    if (surface === "department") {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(DepartmentRollupLane, {
            queue: queue,
            onAction: onAction,
            variant: variant
        }, void 0, false, {
            fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
            lineNumber: 673,
            columnNumber: 12
        }, this);
    }
    if (surface === "work_unit") {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(WorkUnitQueueLane, {
            queue: queue,
            onAction: onAction
        }, void 0, false, {
            fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
            lineNumber: 677,
            columnNumber: 12
        }, this);
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: `adminv2-ws-zone adminv2-ws-zone--queue ${isPrimary ? "adminv2-ws-zone--dominant" : ""}`,
        style: {
            padding: "12px 14px"
        },
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                style: {
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 10
                },
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        style: {
                            display: "flex",
                            alignItems: "baseline",
                            gap: 8
                        },
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                style: {
                                    fontSize: isPrimary ? 15 : 13,
                                    fontWeight: 700,
                                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["neutral"].textPrimary,
                                    margin: 0
                                },
                                children: queue.title
                            }, void 0, false, {
                                fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                lineNumber: 687,
                                columnNumber: 11
                            }, this),
                            queue.countBadge != null && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                style: {
                                    fontSize: 11,
                                    fontWeight: 700,
                                    padding: "2px 8px",
                                    borderRadius: 999,
                                    background: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].border,
                                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["neutral"].textPrimary
                                },
                                children: queue.countBadge
                            }, void 0, false, {
                                fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                lineNumber: 691,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                        lineNumber: 686,
                        columnNumber: 9
                    }, this),
                    queue.viewAllActionId && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        type: "button",
                        onClick: ()=>onAction({
                                type: "queue.item.action",
                                queueId: queue.id,
                                itemId: "__view_all__",
                                actionId: queue.viewAllActionId
                            }),
                        style: {
                            fontSize: 11,
                            fontWeight: 600,
                            color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].textSecondary,
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            textDecoration: "underline",
                            textUnderlineOffset: "2px"
                        },
                        children: queue.viewAllLabel ?? "View all"
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                        lineNumber: 706,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                lineNumber: 685,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                style: {
                    listStyle: "none",
                    margin: 0,
                    padding: 0,
                    display: "flex",
                    flexDirection: "column",
                    gap: 8
                },
                children: queue.items.map((item)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                        style: {
                            padding: "8px 10px",
                            borderRadius: 8,
                            border: `1px solid ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].border}`,
                            background: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["neutral"].surface
                        },
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                style: {
                                    fontSize: 13,
                                    fontWeight: 600,
                                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["neutral"].textPrimary
                                },
                                children: item.title
                            }, void 0, false, {
                                fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                lineNumber: 742,
                                columnNumber: 13
                            }, this),
                            item.subtitle && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                style: {
                                    fontSize: 11,
                                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].textSecondary,
                                    marginTop: 2
                                },
                                children: item.subtitle
                            }, void 0, false, {
                                fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                lineNumber: 744,
                                columnNumber: 15
                            }, this),
                            item.aiPrioritization && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                style: {
                                    fontSize: 10,
                                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["brand"].secondary,
                                    marginTop: 4,
                                    fontStyle: "italic"
                                },
                                children: item.aiPrioritization
                            }, void 0, false, {
                                fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                lineNumber: 747,
                                columnNumber: 15
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                style: {
                                    display: "flex",
                                    flexWrap: "wrap",
                                    gap: 6,
                                    marginTop: 8
                                },
                                children: item.quickActions.map((qa)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                        type: "button",
                                        onClick: ()=>onAction({
                                                type: "queue.item.action",
                                                queueId: queue.id,
                                                itemId: item.id,
                                                actionId: qa.id
                                            }),
                                        style: {
                                            fontSize: 11,
                                            fontWeight: 600,
                                            padding: "3px 8px",
                                            borderRadius: 6,
                                            border: `1px solid ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].border}`,
                                            background: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["neutral"].surface,
                                            color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["neutral"].textPrimary,
                                            cursor: "pointer"
                                        },
                                        children: qa.label
                                    }, qa.id, false, {
                                        fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                        lineNumber: 753,
                                        columnNumber: 17
                                    }, this))
                            }, void 0, false, {
                                fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                                lineNumber: 751,
                                columnNumber: 13
                            }, this)
                        ]
                    }, item.id, true, {
                        fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                        lineNumber: 733,
                        columnNumber: 11
                    }, this))
            }, void 0, false, {
                fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
                lineNumber: 731,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
        lineNumber: 681,
        columnNumber: 5
    }, this);
}
_c3 = QueueBlock;
var _c, _c1, _c2, _c3;
__turbopack_context__.k.register(_c, "DepartmentRollupLane");
__turbopack_context__.k.register(_c1, "CrmCompactQueuePreview");
__turbopack_context__.k.register(_c2, "WorkUnitQueueLane");
__turbopack_context__.k.register(_c3, "QueueBlock");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/app/adminV2/components/workspace/blocks/WorkBlock.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "RecordWorkflowActivityLead",
    ()=>RecordWorkflowActivityLead,
    "default",
    ()=>WorkBlock
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/styles/tokens/colors.ts [app-client] (ecmascript)");
"use client";
;
;
function RecordWorkflowActivityLead({ events, showKicker = true }) {
    const lines = events.filter((e)=>e.trim());
    if (lines.length === 0) return null;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "adminv2-ws-record-workflow-activity-lead",
        "aria-label": "Recent activity",
        children: [
            showKicker ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "adminv2-ws-record-workflow-activity-lead-kicker",
                children: "Recent activity"
            }, void 0, false, {
                fileName: "[project]/app/adminV2/components/workspace/blocks/WorkBlock.tsx",
                lineNumber: 32,
                columnNumber: 9
            }, this) : null,
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                className: "adminv2-ws-record-workflow-activity-lead-list",
                role: "list",
                children: lines.slice(0, 4).map((line, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                        className: "adminv2-ws-record-workflow-activity-lead-item",
                        children: line
                    }, `rec-act-${i}`, false, {
                        fileName: "[project]/app/adminV2/components/workspace/blocks/WorkBlock.tsx",
                        lineNumber: 36,
                        columnNumber: 11
                    }, this))
            }, void 0, false, {
                fileName: "[project]/app/adminV2/components/workspace/blocks/WorkBlock.tsx",
                lineNumber: 34,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/app/adminV2/components/workspace/blocks/WorkBlock.tsx",
        lineNumber: 30,
        columnNumber: 5
    }, this);
}
_c = RecordWorkflowActivityLead;
function statusLabel(s) {
    switch(s){
        case "running":
            return "Running";
        case "completed":
            return "Completed";
        case "failed":
            return "Failed";
    }
}
/** Fallback when adapters only send legacy `steps`. */ function workflowRunsForDisplay(work) {
    if (work.workflowRuns?.length) return work.workflowRuns;
    if (!work.steps?.length) return [];
    return work.steps.map((s)=>({
            id: s.id,
            name: s.label,
            status: s.done ? "completed" : "running"
        }));
}
function WorkBlock({ work, onAction, mode = "full", surface = "default", recordRecentActivity, recordActivityShowKicker = true }) {
    const showOpenExecution = mode === "full";
    const deptWorkflows = (surface === "department" || surface === "company" || surface === "work_unit" || surface === "record") && mode === "summary";
    const m = work.workflowMetrics;
    const runs = deptWorkflows ? workflowRunsForDisplay(work) : [];
    const runsList = deptWorkflows && runs.length > 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "adminv2-ws-dept-workflows-list-wrap",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "adminv2-ws-dept-workflows-list-head",
                "aria-hidden": true,
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        children: "Workflow"
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/workspace/blocks/WorkBlock.tsx",
                        lineNumber: 89,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        children: "Status"
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/workspace/blocks/WorkBlock.tsx",
                        lineNumber: 90,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        children: "Last run"
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/workspace/blocks/WorkBlock.tsx",
                        lineNumber: 91,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "adminv2-ws-dept-workflows-list-head-success",
                        children: "OK"
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/workspace/blocks/WorkBlock.tsx",
                        lineNumber: 92,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/app/adminV2/components/workspace/blocks/WorkBlock.tsx",
                lineNumber: 88,
                columnNumber: 9
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                className: "adminv2-ws-dept-workflows-runs",
                role: "list",
                children: runs.map((r)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                        className: "adminv2-ws-dept-workflows-run",
                        role: "listitem",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "adminv2-ws-dept-workflows-run-name",
                                children: r.name
                            }, void 0, false, {
                                fileName: "[project]/app/adminV2/components/workspace/blocks/WorkBlock.tsx",
                                lineNumber: 97,
                                columnNumber: 15
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "adminv2-ws-dept-workflows-run-status",
                                "data-status": r.status,
                                children: statusLabel(r.status)
                            }, void 0, false, {
                                fileName: "[project]/app/adminV2/components/workspace/blocks/WorkBlock.tsx",
                                lineNumber: 98,
                                columnNumber: 15
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "adminv2-ws-dept-workflows-run-timing",
                                children: r.lastRunLabel ?? "—"
                            }, void 0, false, {
                                fileName: "[project]/app/adminV2/components/workspace/blocks/WorkBlock.tsx",
                                lineNumber: 101,
                                columnNumber: 15
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "adminv2-ws-dept-workflows-run-indicator",
                                "data-status": r.status,
                                "aria-label": r.status === "failed" ? "Failed" : r.status === "completed" ? "Succeeded" : "In progress"
                            }, void 0, false, {
                                fileName: "[project]/app/adminV2/components/workspace/blocks/WorkBlock.tsx",
                                lineNumber: 102,
                                columnNumber: 15
                            }, this)
                        ]
                    }, r.id, true, {
                        fileName: "[project]/app/adminV2/components/workspace/blocks/WorkBlock.tsx",
                        lineNumber: 96,
                        columnNumber: 13
                    }, this))
            }, void 0, false, {
                fileName: "[project]/app/adminV2/components/workspace/blocks/WorkBlock.tsx",
                lineNumber: 94,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/app/adminV2/components/workspace/blocks/WorkBlock.tsx",
        lineNumber: 87,
        columnNumber: 7
    }, this) : null;
    const sharedTail = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
        children: [
            work.assignees && work.assignees.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                style: {
                    fontSize: 10,
                    color: deptWorkflows ? "inherit" : __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].textSecondary,
                    opacity: deptWorkflows ? 0.75 : 1,
                    marginBottom: deptWorkflows ? 4 : 6
                },
                children: work.assignees.join(" · ")
            }, void 0, false, {
                fileName: "[project]/app/adminV2/components/workspace/blocks/WorkBlock.tsx",
                lineNumber: 122,
                columnNumber: 9
            }, this),
            !deptWorkflows && work.steps && work.steps.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                style: {
                    listStyle: "none",
                    margin: 0,
                    padding: 0
                },
                children: work.steps.map((step)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                        style: {
                            fontSize: 11,
                            padding: "4px 0",
                            borderBottom: `1px solid ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].border}`,
                            color: step.done ? __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].textSecondary : __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["neutral"].textPrimary,
                            textDecoration: step.done ? "line-through" : undefined
                        },
                        children: step.label
                    }, step.id, false, {
                        fileName: "[project]/app/adminV2/components/workspace/blocks/WorkBlock.tsx",
                        lineNumber: 136,
                        columnNumber: 13
                    }, this))
            }, void 0, false, {
                fileName: "[project]/app/adminV2/components/workspace/blocks/WorkBlock.tsx",
                lineNumber: 134,
                columnNumber: 9
            }, this),
            work.aiSuggestion && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: deptWorkflows ? "adminv2-ws-dept-workflows-ai" : undefined,
                style: deptWorkflows ? undefined : {
                    fontSize: 10,
                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["brand"].secondary,
                    marginTop: 6,
                    fontStyle: "italic"
                },
                children: work.aiSuggestion
            }, void 0, false, {
                fileName: "[project]/app/adminV2/components/workspace/blocks/WorkBlock.tsx",
                lineNumber: 152,
                columnNumber: 9
            }, this),
            showOpenExecution && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                type: "button",
                onClick: ()=>onAction({
                        type: "work.action",
                        workId: work.id,
                        actionId: "open_work"
                    }),
                style: {
                    marginTop: 10,
                    fontSize: 12,
                    fontWeight: 600,
                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["brand"].primary,
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: 0
                },
                children: "Open execution →"
            }, void 0, false, {
                fileName: "[project]/app/adminV2/components/workspace/blocks/WorkBlock.tsx",
                lineNumber: 164,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true);
    const recordActivityLead = surface === "record" && recordRecentActivity && recordRecentActivity.length > 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(RecordWorkflowActivityLead, {
        events: recordRecentActivity,
        showKicker: recordActivityShowKicker
    }, void 0, false, {
        fileName: "[project]/app/adminV2/components/workspace/blocks/WorkBlock.tsx",
        lineNumber: 186,
        columnNumber: 7
    }, this) : null;
    if (deptWorkflows) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "adminv2-ws-dept-workflows-panel",
            children: [
                recordActivityLead,
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "adminv2-ws-dept-workflows-toolbar",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "adminv2-ws-dept-workflows-toolbar-zone adminv2-ws-dept-workflows-toolbar-zone--left",
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "adminv2-ws-dept-workflows-toolbar-kicker",
                                children: "Automation & workflows"
                            }, void 0, false, {
                                fileName: "[project]/app/adminV2/components/workspace/blocks/WorkBlock.tsx",
                                lineNumber: 195,
                                columnNumber: 13
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/app/adminV2/components/workspace/blocks/WorkBlock.tsx",
                            lineNumber: 194,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "adminv2-ws-dept-workflows-toolbar-zone adminv2-ws-dept-workflows-toolbar-zone--center",
                            children: work.progressLabel ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "adminv2-ws-dept-workflows-toolbar-progress",
                                children: work.progressLabel
                            }, void 0, false, {
                                fileName: "[project]/app/adminV2/components/workspace/blocks/WorkBlock.tsx",
                                lineNumber: 199,
                                columnNumber: 15
                            }, this) : null
                        }, void 0, false, {
                            fileName: "[project]/app/adminV2/components/workspace/blocks/WorkBlock.tsx",
                            lineNumber: 197,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "adminv2-ws-dept-workflows-toolbar-zone adminv2-ws-dept-workflows-toolbar-zone--right",
                            children: m ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "adminv2-ws-dept-workflows-toolbar-metrics",
                                role: "group",
                                "aria-label": "Workflow performance",
                                children: [
                                    m.avgRunTimeLabel ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "adminv2-ws-dept-workflows-toolbar-metric",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "adminv2-ws-dept-workflows-toolbar-metric-label",
                                                children: "Avg run"
                                            }, void 0, false, {
                                                fileName: "[project]/app/adminV2/components/workspace/blocks/WorkBlock.tsx",
                                                lineNumber: 207,
                                                columnNumber: 21
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "adminv2-ws-dept-workflows-toolbar-metric-value",
                                                children: m.avgRunTimeLabel
                                            }, void 0, false, {
                                                fileName: "[project]/app/adminV2/components/workspace/blocks/WorkBlock.tsx",
                                                lineNumber: 208,
                                                columnNumber: 21
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/app/adminV2/components/workspace/blocks/WorkBlock.tsx",
                                        lineNumber: 206,
                                        columnNumber: 19
                                    }, this) : null,
                                    m.successRateLabel ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "adminv2-ws-dept-workflows-toolbar-metric adminv2-ws-dept-workflows-toolbar-metric--success",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "adminv2-ws-dept-workflows-toolbar-metric-label",
                                                children: "Success"
                                            }, void 0, false, {
                                                fileName: "[project]/app/adminV2/components/workspace/blocks/WorkBlock.tsx",
                                                lineNumber: 213,
                                                columnNumber: 21
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "adminv2-ws-dept-workflows-toolbar-metric-value",
                                                children: m.successRateLabel
                                            }, void 0, false, {
                                                fileName: "[project]/app/adminV2/components/workspace/blocks/WorkBlock.tsx",
                                                lineNumber: 214,
                                                columnNumber: 21
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/app/adminV2/components/workspace/blocks/WorkBlock.tsx",
                                        lineNumber: 212,
                                        columnNumber: 19
                                    }, this) : null,
                                    m.runsTodayLabel ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "adminv2-ws-dept-workflows-toolbar-metric",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "adminv2-ws-dept-workflows-toolbar-metric-label",
                                                children: "Runs today"
                                            }, void 0, false, {
                                                fileName: "[project]/app/adminV2/components/workspace/blocks/WorkBlock.tsx",
                                                lineNumber: 219,
                                                columnNumber: 21
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "adminv2-ws-dept-workflows-toolbar-metric-value",
                                                children: m.runsTodayLabel
                                            }, void 0, false, {
                                                fileName: "[project]/app/adminV2/components/workspace/blocks/WorkBlock.tsx",
                                                lineNumber: 220,
                                                columnNumber: 21
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/app/adminV2/components/workspace/blocks/WorkBlock.tsx",
                                        lineNumber: 218,
                                        columnNumber: 19
                                    }, this) : null,
                                    m.failuresTodayLabel != null && m.failuresTodayLabel !== "" ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "adminv2-ws-dept-workflows-toolbar-metric adminv2-ws-dept-workflows-toolbar-metric--failures",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "adminv2-ws-dept-workflows-toolbar-metric-label",
                                                children: "Failures"
                                            }, void 0, false, {
                                                fileName: "[project]/app/adminV2/components/workspace/blocks/WorkBlock.tsx",
                                                lineNumber: 225,
                                                columnNumber: 21
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "adminv2-ws-dept-workflows-toolbar-metric-value",
                                                children: m.failuresTodayLabel
                                            }, void 0, false, {
                                                fileName: "[project]/app/adminV2/components/workspace/blocks/WorkBlock.tsx",
                                                lineNumber: 226,
                                                columnNumber: 21
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/app/adminV2/components/workspace/blocks/WorkBlock.tsx",
                                        lineNumber: 224,
                                        columnNumber: 19
                                    }, this) : null
                                ]
                            }, void 0, true, {
                                fileName: "[project]/app/adminV2/components/workspace/blocks/WorkBlock.tsx",
                                lineNumber: 204,
                                columnNumber: 15
                            }, this) : null
                        }, void 0, false, {
                            fileName: "[project]/app/adminV2/components/workspace/blocks/WorkBlock.tsx",
                            lineNumber: 202,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/app/adminV2/components/workspace/blocks/WorkBlock.tsx",
                    lineNumber: 193,
                    columnNumber: 9
                }, this),
                runsList,
                sharedTail
            ]
        }, void 0, true, {
            fileName: "[project]/app/adminV2/components/workspace/blocks/WorkBlock.tsx",
            lineNumber: 191,
            columnNumber: 7
        }, this);
    }
    const body = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                style: {
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    marginBottom: 6
                },
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                        style: {
                            fontSize: mode === "full" ? 16 : 12,
                            fontWeight: 700,
                            color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["neutral"].textPrimary,
                            margin: 0
                        },
                        children: work.title
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/workspace/blocks/WorkBlock.tsx",
                        lineNumber: 249,
                        columnNumber: 9
                    }, this),
                    work.progressLabel && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        style: {
                            fontSize: 10,
                            fontWeight: 600,
                            color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].textSecondary
                        },
                        children: work.progressLabel
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/workspace/blocks/WorkBlock.tsx",
                        lineNumber: 260,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/app/adminV2/components/workspace/blocks/WorkBlock.tsx",
                lineNumber: 241,
                columnNumber: 7
            }, this),
            sharedTail
        ]
    }, void 0, true);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "adminv2-ws-zone",
        style: {
            padding: "12px 14px"
        },
        children: body
    }, void 0, false, {
        fileName: "[project]/app/adminV2/components/workspace/blocks/WorkBlock.tsx",
        lineNumber: 275,
        columnNumber: 10
    }, this);
}
_c1 = WorkBlock;
var _c, _c1;
__turbopack_context__.k.register(_c, "RecordWorkflowActivityLead");
__turbopack_context__.k.register(_c1, "WorkBlock");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/app/adminV2/components/workspace/blocks/ContextBlock.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>ContextBlock
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/styles/tokens/colors.ts [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature(), _s1 = __turbopack_context__.k.signature();
"use client";
;
;
function GroupSection({ group, onAction, surface }) {
    _s();
    const [open, setOpen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(group.expanded);
    if (surface === "department" || surface === "company" || surface === "work_unit" || surface === "record") {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "adminv2-ws-context-group",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                    type: "button",
                    className: "adminv2-ws-context-group-toggle",
                    onClick: ()=>setOpen((o)=>!o),
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            children: group.label
                        }, void 0, false, {
                            fileName: "[project]/app/adminV2/components/workspace/blocks/ContextBlock.tsx",
                            lineNumber: 34,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            style: {
                                opacity: 0.6,
                                fontSize: 12
                            },
                            children: open ? "−" : "+"
                        }, void 0, false, {
                            fileName: "[project]/app/adminV2/components/workspace/blocks/ContextBlock.tsx",
                            lineNumber: 35,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/app/adminV2/components/workspace/blocks/ContextBlock.tsx",
                    lineNumber: 33,
                    columnNumber: 9
                }, this),
                open && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                    className: "adminv2-ws-context-group-body",
                    children: group.items.map((item)=>{
                        const entityLink = surface === "record" && item.linkedEntity;
                        const openEntity = ()=>onAction({
                                type: "context.group.action",
                                groupKey: group.key,
                                actionId: "open_record",
                                targetId: item.id
                            });
                        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                            className: `adminv2-ws-context-item${entityLink ? " adminv2-ws-context-item--entity" : ""}`,
                            children: [
                                entityLink ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    className: "adminv2-ws-context-item-entity-hit",
                                    onClick: openEntity,
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "adminv2-ws-context-item-line",
                                            children: item.previewLine
                                        }, void 0, false, {
                                            fileName: "[project]/app/adminV2/components/workspace/blocks/ContextBlock.tsx",
                                            lineNumber: 59,
                                            columnNumber: 23
                                        }, this),
                                        Object.keys(item.fields).length > 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "adminv2-ws-context-item-fields",
                                            children: Object.entries(item.fields).map(([k, v])=>`${k}: ${v}`).join(" · ")
                                        }, void 0, false, {
                                            fileName: "[project]/app/adminV2/components/workspace/blocks/ContextBlock.tsx",
                                            lineNumber: 61,
                                            columnNumber: 25
                                        }, this) : null
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/app/adminV2/components/workspace/blocks/ContextBlock.tsx",
                                    lineNumber: 54,
                                    columnNumber: 21
                                }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "adminv2-ws-context-item-line",
                                            children: item.previewLine
                                        }, void 0, false, {
                                            fileName: "[project]/app/adminV2/components/workspace/blocks/ContextBlock.tsx",
                                            lineNumber: 70,
                                            columnNumber: 23
                                        }, this),
                                        Object.keys(item.fields).length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "adminv2-ws-context-item-fields",
                                            children: Object.entries(item.fields).map(([k, v])=>`${k}: ${v}`).join(" · ")
                                        }, void 0, false, {
                                            fileName: "[project]/app/adminV2/components/workspace/blocks/ContextBlock.tsx",
                                            lineNumber: 72,
                                            columnNumber: 25
                                        }, this)
                                    ]
                                }, void 0, true),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "adminv2-ws-context-item-actions",
                                    children: item.quickActions.map((qa)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                            type: "button",
                                            onClick: ()=>onAction({
                                                    type: "context.group.action",
                                                    groupKey: group.key,
                                                    actionId: qa.id,
                                                    targetId: item.id
                                                }),
                                            children: qa.label
                                        }, qa.id, false, {
                                            fileName: "[project]/app/adminV2/components/workspace/blocks/ContextBlock.tsx",
                                            lineNumber: 82,
                                            columnNumber: 23
                                        }, this))
                                }, void 0, false, {
                                    fileName: "[project]/app/adminV2/components/workspace/blocks/ContextBlock.tsx",
                                    lineNumber: 80,
                                    columnNumber: 19
                                }, this)
                            ]
                        }, item.id, true, {
                            fileName: "[project]/app/adminV2/components/workspace/blocks/ContextBlock.tsx",
                            lineNumber: 49,
                            columnNumber: 17
                        }, this);
                    })
                }, void 0, false, {
                    fileName: "[project]/app/adminV2/components/workspace/blocks/ContextBlock.tsx",
                    lineNumber: 38,
                    columnNumber: 11
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/app/adminV2/components/workspace/blocks/ContextBlock.tsx",
            lineNumber: 32,
            columnNumber: 7
        }, this);
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        style: {
            borderBottom: `1px solid ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].border}`
        },
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                type: "button",
                onClick: ()=>setOpen((o)=>!o),
                style: {
                    width: "100%",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "8px 0",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 700,
                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["neutral"].textPrimary
                },
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        children: group.label
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/workspace/blocks/ContextBlock.tsx",
                        lineNumber: 126,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        style: {
                            color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].textSecondary,
                            fontSize: 11
                        },
                        children: open ? "−" : "+"
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/workspace/blocks/ContextBlock.tsx",
                        lineNumber: 127,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/app/adminV2/components/workspace/blocks/ContextBlock.tsx",
                lineNumber: 109,
                columnNumber: 7
            }, this),
            open && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                style: {
                    listStyle: "none",
                    margin: 0,
                    padding: "0 0 8px 0"
                },
                children: group.items.map((item)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                        style: {
                            padding: "6px 0"
                        },
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                style: {
                                    fontSize: 12,
                                    fontWeight: 500,
                                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["neutral"].textPrimary
                                },
                                children: item.previewLine
                            }, void 0, false, {
                                fileName: "[project]/app/adminV2/components/workspace/blocks/ContextBlock.tsx",
                                lineNumber: 133,
                                columnNumber: 15
                            }, this),
                            Object.keys(item.fields).length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                style: {
                                    fontSize: 10,
                                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].textSecondary,
                                    marginTop: 2
                                },
                                children: Object.entries(item.fields).map(([k, v])=>`${k}: ${v}`).join(" · ")
                            }, void 0, false, {
                                fileName: "[project]/app/adminV2/components/workspace/blocks/ContextBlock.tsx",
                                lineNumber: 135,
                                columnNumber: 17
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                style: {
                                    display: "flex",
                                    flexWrap: "wrap",
                                    gap: 4,
                                    marginTop: 6
                                },
                                children: item.quickActions.map((qa)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                        type: "button",
                                        onClick: ()=>onAction({
                                                type: "context.group.action",
                                                groupKey: group.key,
                                                actionId: qa.id,
                                                targetId: item.id
                                            }),
                                        style: {
                                            fontSize: 10,
                                            fontWeight: 600,
                                            padding: "2px 6px",
                                            borderRadius: 4,
                                            border: `1px solid ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].border}`,
                                            background: "transparent",
                                            color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["brand"].primary,
                                            cursor: "pointer"
                                        },
                                        children: qa.label
                                    }, qa.id, false, {
                                        fileName: "[project]/app/adminV2/components/workspace/blocks/ContextBlock.tsx",
                                        lineNumber: 143,
                                        columnNumber: 19
                                    }, this))
                            }, void 0, false, {
                                fileName: "[project]/app/adminV2/components/workspace/blocks/ContextBlock.tsx",
                                lineNumber: 141,
                                columnNumber: 15
                            }, this)
                        ]
                    }, item.id, true, {
                        fileName: "[project]/app/adminV2/components/workspace/blocks/ContextBlock.tsx",
                        lineNumber: 132,
                        columnNumber: 13
                    }, this))
            }, void 0, false, {
                fileName: "[project]/app/adminV2/components/workspace/blocks/ContextBlock.tsx",
                lineNumber: 130,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/app/adminV2/components/workspace/blocks/ContextBlock.tsx",
        lineNumber: 108,
        columnNumber: 5
    }, this);
}
_s(GroupSection, "NelbvWKq5OeDwIZ1AHpBksuksUA=");
_c = GroupSection;
function ContextBlock({ model, onAction, surface = "default", layout = "rail" }) {
    _s1();
    const sorted = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "ContextBlock.useMemo[sorted]": ()=>[
                ...model.groups
            ].sort({
                "ContextBlock.useMemo[sorted]": (a, b)=>a.order - b.order
            }["ContextBlock.useMemo[sorted]"])
    }["ContextBlock.useMemo[sorted]"], [
        model.groups
    ]);
    if (surface === "department" || surface === "company" || surface === "work_unit" || surface === "record") {
        if (layout === "embedded") {
            if (sorted.length === 0) return null;
            const defaultKicker = surface === "record" ? "Related entities" : surface === "company" ? "Organization context" : surface === "department" ? "Department context" : "Lane context";
            const kicker = model.title?.trim() || defaultKicker;
            const isRecordAside = surface === "record";
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: [
                    "adminv2-ws-context-embedded",
                    isRecordAside ? "adminv2-ws-context-embedded--record-aside adminv2-ws-record-interaction-panel adminv2-ws-record-interaction-panel--context-soft" : "adminv2-ws-context-embedded--primary"
                ].filter(Boolean).join(" "),
                "aria-label": kicker,
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                        className: isRecordAside ? "adminv2-ws-record-interaction-panel-title" : "adminv2-ws-context-embedded-title",
                        children: kicker
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/workspace/blocks/ContextBlock.tsx",
                        lineNumber: 217,
                        columnNumber: 11
                    }, this),
                    sorted.map((g)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(GroupSection, {
                            group: g,
                            onAction: onAction,
                            surface: surface
                        }, g.key, false, {
                            fileName: "[project]/app/adminV2/components/workspace/blocks/ContextBlock.tsx",
                            lineNumber: 227,
                            columnNumber: 13
                        }, this))
                ]
            }, void 0, true, {
                fileName: "[project]/app/adminV2/components/workspace/blocks/ContextBlock.tsx",
                lineNumber: 206,
                columnNumber: 9
            }, this);
        }
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "adminv2-ws-context-rail",
            children: [
                model.title && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "adminv2-ws-context-rail-kicker",
                    children: model.title
                }, void 0, false, {
                    fileName: "[project]/app/adminV2/components/workspace/blocks/ContextBlock.tsx",
                    lineNumber: 235,
                    columnNumber: 25
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "adminv2-ws-context-rail-kicker",
                    children: "Context & support"
                }, void 0, false, {
                    fileName: "[project]/app/adminV2/components/workspace/blocks/ContextBlock.tsx",
                    lineNumber: 236,
                    columnNumber: 9
                }, this),
                sorted.length === 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "adminv2-ws-context-rail-empty",
                    children: "No relationship groups in this view."
                }, void 0, false, {
                    fileName: "[project]/app/adminV2/components/workspace/blocks/ContextBlock.tsx",
                    lineNumber: 238,
                    columnNumber: 11
                }, this),
                sorted.map((g)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(GroupSection, {
                        group: g,
                        onAction: onAction,
                        surface: surface
                    }, g.key, false, {
                        fileName: "[project]/app/adminV2/components/workspace/blocks/ContextBlock.tsx",
                        lineNumber: 241,
                        columnNumber: 11
                    }, this))
            ]
        }, void 0, true, {
            fileName: "[project]/app/adminV2/components/workspace/blocks/ContextBlock.tsx",
            lineNumber: 234,
            columnNumber: 7
        }, this);
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "adminv2-ws-zone",
        style: {
            padding: "12px 14px",
            overflow: "auto"
        },
        children: [
            model.title && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                style: {
                    fontSize: 10,
                    fontWeight: 700,
                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].textSecondary,
                    marginBottom: 8
                },
                children: model.title
            }, void 0, false, {
                fileName: "[project]/app/adminV2/components/workspace/blocks/ContextBlock.tsx",
                lineNumber: 250,
                columnNumber: 9
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                style: {
                    fontSize: 11,
                    fontWeight: 700,
                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["brand"].secondary,
                    textTransform: "none",
                    marginBottom: 8
                },
                children: "Context"
            }, void 0, false, {
                fileName: "[project]/app/adminV2/components/workspace/blocks/ContextBlock.tsx",
                lineNumber: 254,
                columnNumber: 7
            }, this),
            sorted.length === 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                style: {
                    fontSize: 12,
                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].textSecondary
                },
                children: "No relationship groups in view."
            }, void 0, false, {
                fileName: "[project]/app/adminV2/components/workspace/blocks/ContextBlock.tsx",
                lineNumber: 258,
                columnNumber: 9
            }, this),
            sorted.map((g)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(GroupSection, {
                    group: g,
                    onAction: onAction,
                    surface: "default"
                }, g.key, false, {
                    fileName: "[project]/app/adminV2/components/workspace/blocks/ContextBlock.tsx",
                    lineNumber: 261,
                    columnNumber: 9
                }, this))
        ]
    }, void 0, true, {
        fileName: "[project]/app/adminV2/components/workspace/blocks/ContextBlock.tsx",
        lineNumber: 248,
        columnNumber: 5
    }, this);
}
_s1(ContextBlock, "bJ0njqnWmG3okb5MUQo2WV0gRWo=");
_c1 = ContextBlock;
var _c, _c1;
__turbopack_context__.k.register(_c, "GroupSection");
__turbopack_context__.k.register(_c1, "ContextBlock");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>ActionsBlock
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/styles/tokens/colors.ts [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
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
    _s();
    const [open, setOpen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    if (items.length === 0) return null;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
        className: "adminv2-ws-command-section adminv2-ws-command-section--more-actions",
        "aria-label": "More actions",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                type: "button",
                className: "adminv2-ws-command-more-actions-trigger",
                "aria-expanded": open,
                onClick: ()=>setOpen((o)=>!o),
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "adminv2-ws-command-more-actions-trigger-label",
                        children: "More actions"
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx",
                        lineNumber: 45,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
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
            open ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                className: "adminv2-ws-command-row-list adminv2-ws-command-row-list--more-actions",
                children: items.map((a)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                            type: "button",
                            className: "adminv2-ws-command-more-actions-row",
                            onClick: ()=>onAction({
                                    type: "actions.block",
                                    actionId: a.id
                                }),
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "adminv2-ws-command-row-glyph",
                                    "aria-hidden": true,
                                    children: "›"
                                }, void 0, false, {
                                    fileName: "[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx",
                                    lineNumber: 59,
                                    columnNumber: 17
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
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
_s(MoreActionsSection, "xG1TONbKtDWtdOTrXaTAsNhPg/Q=");
_c = MoreActionsSection;
/** User-driven row actions inside a single card (demoted system + quick / record secondary). */ function OperationalActionsCard({ actions, onAction, panelClassName }) {
    if (actions.length === 0) return null;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
        className: [
            "adminv2-ws-actions-rail adminv2-ws-actions-rail--dept-panel adminv2-ws-command-section--operational",
            panelClassName
        ].filter(Boolean).join(" "),
        "aria-label": "Operational actions",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                className: "adminv2-ws-actions-rail-title",
                children: "Operational actions"
            }, void 0, false, {
                fileName: "[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx",
                lineNumber: 94,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                className: "adminv2-ws-command-row-list adminv2-ws-command-row-list--operational",
                children: actions.map((a)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
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
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "adminv2-ws-command-row-glyph",
                                    "aria-hidden": true,
                                    children: "›"
                                }, void 0, false, {
                                    fileName: "[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx",
                                    lineNumber: 104,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
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
_c1 = OperationalActionsCard;
/** AI suggestions — light section, not a card; distinct from operational rows. */ function AISuggestionsSection({ actions, onAction, sectionClassName }) {
    if (actions.length === 0) return null;
    const sectionTitle = "AI suggestions";
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
        className: [
            "adminv2-ws-command-section adminv2-ws-command-section--ai-suggestions",
            sectionClassName
        ].filter(Boolean).join(" "),
        "aria-label": sectionTitle,
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                className: "adminv2-ws-command-section-title adminv2-ws-command-section-title--ai",
                children: sectionTitle
            }, void 0, false, {
                fileName: "[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx",
                lineNumber: 137,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                className: "adminv2-ws-command-row-list adminv2-ws-command-row-list--ai-suggestions",
                children: actions.map((a)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
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
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "adminv2-ws-command-row-glyph adminv2-ws-command-row-glyph--ai",
                                    "aria-hidden": true,
                                    children: "›"
                                }, void 0, false, {
                                    fileName: "[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx",
                                    lineNumber: 147,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "adminv2-ws-command-ai-suggestion-row-main",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "adminv2-ws-command-row-ai-badge",
                                            "aria-label": "AI suggested",
                                            children: "AI"
                                        }, void 0, false, {
                                            fileName: "[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx",
                                            lineNumber: 151,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
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
_c2 = AISuggestionsSection;
function PrimaryActionsPanel({ sectionTitle, actions, onAction, panelClassName, maxSolidButtons = PRIMARY_SOLID_CAP }) {
    const solidUsed = {
        n: 0
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
        className: [
            "adminv2-ws-actions-rail adminv2-ws-actions-rail--dept-panel adminv2-ws-command-section--primary",
            panelClassName
        ].filter(Boolean).join(" "),
        "aria-label": sectionTitle,
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                className: "adminv2-ws-actions-rail-title",
                children: sectionTitle
            }, void 0, false, {
                fileName: "[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx",
                lineNumber: 186,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "adminv2-ws-actions-rail-list adminv2-ws-actions-rail-list--column",
                children: actions.map((a)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
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
_c3 = PrimaryActionsPanel;
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
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "adminv2-ws-dept-command-actions-stack",
                children: [
                    hasAnchor && anchor ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "adminv2-ws-record-decision-anchor",
                        "aria-label": "Record state",
                        children: [
                            anchor.status?.trim() ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "adminv2-ws-record-decision-anchor-row",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "adminv2-ws-record-decision-anchor-k",
                                        children: "Status"
                                    }, void 0, false, {
                                        fileName: "[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx",
                                        lineNumber: 252,
                                        columnNumber: 19
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
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
                            anchor.risk?.trim() ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "adminv2-ws-record-decision-anchor-row adminv2-ws-record-decision-anchor-row--risk",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "adminv2-ws-record-decision-anchor-k",
                                        children: "Risk"
                                    }, void 0, false, {
                                        fileName: "[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx",
                                        lineNumber: 258,
                                        columnNumber: 19
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
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
                            anchor.nextAction?.trim() ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "adminv2-ws-record-decision-anchor-row",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "adminv2-ws-record-decision-anchor-k",
                                        children: "Next action"
                                    }, void 0, false, {
                                        fileName: "[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx",
                                        lineNumber: 264,
                                        columnNumber: 19
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
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
                    showStatusStrip ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: `adminv2-ws-dept-command-status${surface === "record" ? " adminv2-ws-dept-command-status--record" : ""}`,
                        "aria-label": surface === "record" ? "Record status" : "System status",
                        children: status.map((line, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
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
                    primaryBand.length > 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(PrimaryActionsPanel, {
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
                    operationalN > 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(OperationalActionsCard, {
                        actions: operationalActions,
                        onAction: onAction,
                        panelClassName: recordOpClass
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx",
                        lineNumber: 292,
                        columnNumber: 13
                    }, this) : null,
                    smartN > 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(AISuggestionsSection, {
                        actions: smart ?? [],
                        onAction: onAction,
                        sectionClassName: recordAiClass
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx",
                        lineNumber: 299,
                        columnNumber: 13
                    }, this) : null,
                    moreN > 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(MoreActionsSection, {
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
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "adminv2-ws-dept-command-actions-stack",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "adminv2-ws-actions-rail adminv2-ws-actions-rail--dept-panel",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "adminv2-ws-actions-rail-title",
                            children: title
                        }, void 0, false, {
                            fileName: "[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx",
                            lineNumber: 309,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "adminv2-ws-actions-rail-list",
                            children: model.primaries.map((a)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
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
                model.overflow && model.overflow.length > 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(MoreActionsSection, {
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
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "adminv2-ws-zone",
        style: {
            padding: "12px 14px"
        },
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                style: {
                    fontSize: 11,
                    fontWeight: 700,
                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].textSecondary,
                    marginBottom: 10
                },
                children: title
            }, void 0, false, {
                fileName: "[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx",
                lineNumber: 333,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                style: {
                    display: "flex",
                    flexDirection: "column",
                    gap: 8
                },
                children: model.primaries.map((a)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
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
                            border: `1px solid ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].border}`,
                            background: a.variant === "secondary" ? "transparent" : __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["brand"].primary,
                            color: a.variant === "secondary" ? __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["brand"].primary : __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["neutral"].surface,
                            cursor: "pointer",
                            outline: a.emphasized ? `2px solid ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["brand"].secondary}` : undefined
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
            model.overflow && model.overflow.length > 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                style: {
                    marginTop: 10
                },
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(MoreActionsSection, {
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
_c4 = ActionsBlock;
var _c, _c1, _c2, _c3, _c4;
__turbopack_context__.k.register(_c, "MoreActionsSection");
__turbopack_context__.k.register(_c1, "OperationalActionsCard");
__turbopack_context__.k.register(_c2, "AISuggestionsSection");
__turbopack_context__.k.register(_c3, "PrimaryActionsPanel");
__turbopack_context__.k.register(_c4, "ActionsBlock");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/app/adminV2/components/workspace/blocks/RecordBodyBlock.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>RecordBodyBlock
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
"use client";
;
function lineClass(tone, rowKind, hasBadge) {
    const parts = [
        "adminv2-ws-record-line"
    ];
    if (tone === "primary") parts.push("adminv2-ws-record-line--primary");
    else if (tone === "muted") parts.push("adminv2-ws-record-line--muted");
    const rk = rowKind ?? "default";
    if (rk === "schedule") parts.push("adminv2-ws-record-line--schedule");
    if (rk === "financial") parts.push("adminv2-ws-record-line--financial");
    if (rk === "document") parts.push("adminv2-ws-record-line--document");
    if (rk === "tag") parts.push("adminv2-ws-record-line--tag");
    if (hasBadge) parts.push("adminv2-ws-record-line--has-badge");
    return parts.join(" ");
}
function FieldRow({ recordId, sectionId, line, onAction }) {
    const k = line.fieldLabel.trim();
    const toneMod = line.tone === "primary" ? "adminv2-ws-record-field-row--primary" : line.tone === "muted" ? "adminv2-ws-record-field-row--muted" : "";
    const badge = line.typeBadge?.trim();
    const hasBadge = Boolean(badge);
    const core = line.linkId ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
        type: "button",
        className: `adminv2-ws-record-inline-link${line.rowKind === "document" ? " adminv2-ws-record-inline-link--document" : ""}`,
        "aria-label": line.rowKind === "document" ? `Open document: ${line.text}` : undefined,
        onClick: ()=>onAction({
                type: "record.body.link",
                recordId,
                sectionId,
                linkId: line.linkId,
                linePreview: line.text.slice(0, 120)
            }),
        children: line.text
    }, void 0, false, {
        fileName: "[project]/app/adminV2/components/workspace/blocks/RecordBodyBlock.tsx",
        lineNumber: 52,
        columnNumber: 5
    }, this) : line.text;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: `adminv2-ws-record-field-row ${toneMod}`.trim(),
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                className: "adminv2-ws-record-field-k",
                children: k
            }, void 0, false, {
                fileName: "[project]/app/adminV2/components/workspace/blocks/RecordBodyBlock.tsx",
                lineNumber: 74,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                className: "adminv2-ws-record-field-v",
                children: [
                    hasBadge ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "adminv2-ws-record-type-badge adminv2-ws-record-type-badge--in-field",
                        children: badge
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/workspace/blocks/RecordBodyBlock.tsx",
                        lineNumber: 76,
                        columnNumber: 21
                    }, this) : null,
                    core
                ]
            }, void 0, true, {
                fileName: "[project]/app/adminV2/components/workspace/blocks/RecordBodyBlock.tsx",
                lineNumber: 75,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/app/adminV2/components/workspace/blocks/RecordBodyBlock.tsx",
        lineNumber: 73,
        columnNumber: 5
    }, this);
}
_c = FieldRow;
function sectionClassName(id, density) {
    const base = "adminv2-ws-record-section";
    if (density === "band") {
        return `${base} adminv2-ws-record-section--in-band`;
    }
    if (id === "overview" || id === "scheduling") {
        return `${base} adminv2-ws-record-section--priority`;
    }
    if (id === "financial") {
        return `${base} adminv2-ws-record-section--support adminv2-ws-record-section--financial`;
    }
    if (id === "billing_documents") {
        return `${base} adminv2-ws-record-section--support adminv2-ws-record-section--documents`;
    }
    if (id === "requirements") {
        return `${base} adminv2-ws-record-section--support adminv2-ws-record-section--tags`;
    }
    return `${base} adminv2-ws-record-section--support`;
}
function RecordBodyBlock({ recordId, sections, onAction, density = "default" }) {
    if (sections.length === 0) return null;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: density === "band" ? "adminv2-ws-record-body-scroll adminv2-ws-record-body-scroll--band" : "adminv2-ws-record-body-scroll",
        role: "region",
        "aria-label": "Record core details",
        children: sections.map((sec)=>{
            const showTitle = Boolean(sec.title?.trim());
            const hasFieldRows = sec.lines.some((l)=>Boolean(l.fieldLabel?.trim()));
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                className: sectionClassName(sec.id, density),
                "data-section-id": sec.id,
                children: [
                    showTitle ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                        className: density === "band" ? "adminv2-ws-record-section-title adminv2-ws-record-section-title--band" : "adminv2-ws-record-section-title",
                        children: sec.title
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/workspace/blocks/RecordBodyBlock.tsx",
                        lineNumber: 124,
                        columnNumber: 15
                    }, this) : null,
                    sec.lines.length > 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: hasFieldRows ? "adminv2-ws-record-section-lines adminv2-ws-record-section-lines--fields" : "adminv2-ws-record-section-lines",
                        children: sec.lines.map((line, i)=>{
                            const fl = line.fieldLabel?.trim();
                            if (fl) {
                                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(FieldRow, {
                                    recordId: recordId,
                                    sectionId: sec.id,
                                    line: line,
                                    onAction: onAction
                                }, `${sec.id}-L${i}`, false, {
                                    fileName: "[project]/app/adminV2/components/workspace/blocks/RecordBodyBlock.tsx",
                                    lineNumber: 146,
                                    columnNumber: 23
                                }, this);
                            }
                            const badge = line.typeBadge?.trim();
                            const hasBadge = Boolean(badge);
                            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: lineClass(line.tone, line.rowKind, hasBadge),
                                children: [
                                    badge ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "adminv2-ws-record-type-badge",
                                        children: badge
                                    }, void 0, false, {
                                        fileName: "[project]/app/adminV2/components/workspace/blocks/RecordBodyBlock.tsx",
                                        lineNumber: 159,
                                        columnNumber: 32
                                    }, this) : null,
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "adminv2-ws-record-line-core",
                                        children: line.linkId ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                            type: "button",
                                            className: `adminv2-ws-record-inline-link${line.rowKind === "document" ? " adminv2-ws-record-inline-link--document" : ""}`,
                                            "aria-label": line.rowKind === "document" ? `Open document: ${line.text}` : undefined,
                                            onClick: ()=>onAction({
                                                    type: "record.body.link",
                                                    recordId,
                                                    sectionId: sec.id,
                                                    linkId: line.linkId,
                                                    linePreview: line.text.slice(0, 120)
                                                }),
                                            children: line.text
                                        }, void 0, false, {
                                            fileName: "[project]/app/adminV2/components/workspace/blocks/RecordBodyBlock.tsx",
                                            lineNumber: 162,
                                            columnNumber: 27
                                        }, this) : line.text
                                    }, void 0, false, {
                                        fileName: "[project]/app/adminV2/components/workspace/blocks/RecordBodyBlock.tsx",
                                        lineNumber: 160,
                                        columnNumber: 23
                                    }, this)
                                ]
                            }, `${sec.id}-L${i}`, true, {
                                fileName: "[project]/app/adminV2/components/workspace/blocks/RecordBodyBlock.tsx",
                                lineNumber: 158,
                                columnNumber: 21
                            }, this);
                        })
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/workspace/blocks/RecordBodyBlock.tsx",
                        lineNumber: 135,
                        columnNumber: 15
                    }, this) : null,
                    sec.bullets && sec.bullets.length > 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                        className: "adminv2-ws-record-section-bullets adminv2-ws-record-section-bullets--compact",
                        children: sec.bullets.map((b, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                children: b
                            }, `${sec.id}-b-${i}`, false, {
                                fileName: "[project]/app/adminV2/components/workspace/blocks/RecordBodyBlock.tsx",
                                lineNumber: 192,
                                columnNumber: 19
                            }, this))
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/workspace/blocks/RecordBodyBlock.tsx",
                        lineNumber: 190,
                        columnNumber: 15
                    }, this) : null
                ]
            }, sec.id, true, {
                fileName: "[project]/app/adminV2/components/workspace/blocks/RecordBodyBlock.tsx",
                lineNumber: 122,
                columnNumber: 11
            }, this);
        })
    }, void 0, false, {
        fileName: "[project]/app/adminV2/components/workspace/blocks/RecordBodyBlock.tsx",
        lineNumber: 109,
        columnNumber: 5
    }, this);
}
_c1 = RecordBodyBlock;
var _c, _c1;
__turbopack_context__.k.register(_c, "FieldRow");
__turbopack_context__.k.register(_c1, "RecordBodyBlock");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/app/adminV2/components/workspace/blocks/RecordInteractionPanels.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>RecordInteractionPanels
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
"use client";
;
function RecordInteractionPanels({ recordId, contact, onAction }) {
    if (!contact) return null;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "adminv2-ws-record-context-stack",
        "aria-label": "Customer and contact",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "adminv2-ws-record-interaction-panel adminv2-ws-record-interaction-panel--contact-primary",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                    className: "adminv2-ws-record-interaction-panel-title",
                    children: "Customer / contact"
                }, void 0, false, {
                    fileName: "[project]/app/adminV2/components/workspace/blocks/RecordInteractionPanels.tsx",
                    lineNumber: 22,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                    className: "adminv2-ws-record-interaction-primary",
                    children: contact.name
                }, void 0, false, {
                    fileName: "[project]/app/adminV2/components/workspace/blocks/RecordInteractionPanels.tsx",
                    lineNumber: 23,
                    columnNumber: 9
                }, this),
                contact.address ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                    className: "adminv2-ws-record-interaction-line",
                    children: contact.address
                }, void 0, false, {
                    fileName: "[project]/app/adminV2/components/workspace/blocks/RecordInteractionPanels.tsx",
                    lineNumber: 25,
                    columnNumber: 11
                }, this) : null,
                contact.preferredContact ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                    className: "adminv2-ws-record-interaction-line",
                    children: contact.preferredContact
                }, void 0, false, {
                    fileName: "[project]/app/adminV2/components/workspace/blocks/RecordInteractionPanels.tsx",
                    lineNumber: 28,
                    columnNumber: 11
                }, this) : null,
                contact.lastContactAt ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                    className: "adminv2-ws-record-interaction-meta",
                    children: [
                        "Last contact · ",
                        contact.lastContactAt
                    ]
                }, void 0, true, {
                    fileName: "[project]/app/adminV2/components/workspace/blocks/RecordInteractionPanels.tsx",
                    lineNumber: 31,
                    columnNumber: 11
                }, this) : null,
                contact.contactActions.length > 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "adminv2-ws-record-interaction-chips",
                    role: "group",
                    "aria-label": "Contact channels",
                    children: contact.contactActions.map((a)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                            type: "button",
                            className: "adminv2-ws-record-interaction-chip",
                            onClick: ()=>onAction({
                                    type: "record.interaction",
                                    recordId,
                                    panel: "contact",
                                    actionId: a.id
                                }),
                            children: a.label
                        }, a.id, false, {
                            fileName: "[project]/app/adminV2/components/workspace/blocks/RecordInteractionPanels.tsx",
                            lineNumber: 36,
                            columnNumber: 15
                        }, this))
                }, void 0, false, {
                    fileName: "[project]/app/adminV2/components/workspace/blocks/RecordInteractionPanels.tsx",
                    lineNumber: 34,
                    columnNumber: 11
                }, this) : null
            ]
        }, void 0, true, {
            fileName: "[project]/app/adminV2/components/workspace/blocks/RecordInteractionPanels.tsx",
            lineNumber: 21,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/app/adminV2/components/workspace/blocks/RecordInteractionPanels.tsx",
        lineNumber: 20,
        columnNumber: 5
    }, this);
}
_c = RecordInteractionPanels;
var _c;
__turbopack_context__.k.register(_c, "RecordInteractionPanels");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/app/adminV2/components/workspace/blocks/index.ts [app-client] (ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([]);
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$workspace$2f$blocks$2f$SignalBlock$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/adminV2/components/workspace/blocks/SignalBlock.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$workspace$2f$blocks$2f$KPIBlock$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/adminV2/components/workspace/blocks/KPIBlock.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$workspace$2f$blocks$2f$QueueBlock$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$workspace$2f$blocks$2f$WorkBlock$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/adminV2/components/workspace/blocks/WorkBlock.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$workspace$2f$blocks$2f$ContextBlock$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/adminV2/components/workspace/blocks/ContextBlock.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$workspace$2f$blocks$2f$ActionsBlock$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$workspace$2f$blocks$2f$RecordBodyBlock$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/adminV2/components/workspace/blocks/RecordBodyBlock.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$workspace$2f$blocks$2f$RecordInteractionPanels$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/adminV2/components/workspace/blocks/RecordInteractionPanels.tsx [app-client] (ecmascript)");
;
;
;
;
;
;
;
;
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/app/adminV2/components/workspace/blocks/SignalBlock.tsx [app-client] (ecmascript) <export default as SignalBlock>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "SignalBlock",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$workspace$2f$blocks$2f$SignalBlock$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"]
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$workspace$2f$blocks$2f$SignalBlock$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/adminV2/components/workspace/blocks/SignalBlock.tsx [app-client] (ecmascript)");
}),
"[project]/app/adminV2/components/workspace/blocks/KPIBlock.tsx [app-client] (ecmascript) <export default as KPIBlock>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "KPIBlock",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$workspace$2f$blocks$2f$KPIBlock$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"]
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$workspace$2f$blocks$2f$KPIBlock$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/adminV2/components/workspace/blocks/KPIBlock.tsx [app-client] (ecmascript)");
}),
"[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx [app-client] (ecmascript) <export default as QueueBlock>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "QueueBlock",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$workspace$2f$blocks$2f$QueueBlock$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"]
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$workspace$2f$blocks$2f$QueueBlock$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx [app-client] (ecmascript)");
}),
"[project]/app/adminV2/components/workspace/blocks/WorkBlock.tsx [app-client] (ecmascript) <export default as WorkBlock>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "WorkBlock",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$workspace$2f$blocks$2f$WorkBlock$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"]
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$workspace$2f$blocks$2f$WorkBlock$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/adminV2/components/workspace/blocks/WorkBlock.tsx [app-client] (ecmascript)");
}),
"[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx [app-client] (ecmascript) <export default as ActionsBlock>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ActionsBlock",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$workspace$2f$blocks$2f$ActionsBlock$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"]
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$workspace$2f$blocks$2f$ActionsBlock$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx [app-client] (ecmascript)");
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
"[project]/components/admin/workspace/KpiStripSkeleton.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "KpiStripSkeleton",
    ()=>KpiStripSkeleton
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
"use client";
;
function KpiStripSkeleton({ id = "kpi-strip-skeleton" }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        id: id,
        className: "adminv2-ws-kpi-root-band adminv2-ws-kpi-root-band--compact",
        "aria-busy": "true",
        "aria-label": "Loading key metrics",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "adminv2-ws-kpi-strip adminv2-ws-kpi-strip--orientation flex flex-wrap gap-4",
            role: "presentation",
            children: [
                1,
                2,
                3,
                4
            ].map((i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "flex min-w-[4.5rem] flex-col gap-1.5",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "h-2.5 w-14 animate-pulse rounded bg-alloy-stone/20"
                        }, void 0, false, {
                            fileName: "[project]/components/admin/workspace/KpiStripSkeleton.tsx",
                            lineNumber: 15,
                            columnNumber: 25
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "h-5 w-10 animate-pulse rounded bg-alloy-stone/25"
                        }, void 0, false, {
                            fileName: "[project]/components/admin/workspace/KpiStripSkeleton.tsx",
                            lineNumber: 16,
                            columnNumber: 25
                        }, this)
                    ]
                }, i, true, {
                    fileName: "[project]/components/admin/workspace/KpiStripSkeleton.tsx",
                    lineNumber: 14,
                    columnNumber: 21
                }, this))
        }, void 0, false, {
            fileName: "[project]/components/admin/workspace/KpiStripSkeleton.tsx",
            lineNumber: 12,
            columnNumber: 13
        }, this)
    }, void 0, false, {
        fileName: "[project]/components/admin/workspace/KpiStripSkeleton.tsx",
        lineNumber: 6,
        columnNumber: 9
    }, this);
}
_c = KpiStripSkeleton;
var _c;
__turbopack_context__.k.register(_c, "KpiStripSkeleton");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/app/adminV2/components/workspace/shells/WorkUnitWorkspace.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>WorkUnitWorkspace
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$visualContext$2f$index$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/lib/visualContext/index.ts [app-client] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$visualContext$2f$contextStyle$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/visualContext/contextStyle.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$workspace$2f$blocks$2f$index$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/app/adminV2/components/workspace/blocks/index.ts [app-client] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$workspace$2f$blocks$2f$SignalBlock$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__SignalBlock$3e$__ = __turbopack_context__.i("[project]/app/adminV2/components/workspace/blocks/SignalBlock.tsx [app-client] (ecmascript) <export default as SignalBlock>");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$workspace$2f$blocks$2f$KPIBlock$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__KPIBlock$3e$__ = __turbopack_context__.i("[project]/app/adminV2/components/workspace/blocks/KPIBlock.tsx [app-client] (ecmascript) <export default as KPIBlock>");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$workspace$2f$blocks$2f$QueueBlock$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__QueueBlock$3e$__ = __turbopack_context__.i("[project]/app/adminV2/components/workspace/blocks/QueueBlock.tsx [app-client] (ecmascript) <export default as QueueBlock>");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$workspace$2f$blocks$2f$WorkBlock$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__WorkBlock$3e$__ = __turbopack_context__.i("[project]/app/adminV2/components/workspace/blocks/WorkBlock.tsx [app-client] (ecmascript) <export default as WorkBlock>");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$workspace$2f$blocks$2f$ActionsBlock$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ActionsBlock$3e$__ = __turbopack_context__.i("[project]/app/adminV2/components/workspace/blocks/ActionsBlock.tsx [app-client] (ecmascript) <export default as ActionsBlock>");
var __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$workspace$2f$WorkspaceShellLayout$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/components/admin/workspace/WorkspaceShellLayout.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$workspace$2f$KpiStripSkeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/components/admin/workspace/KpiStripSkeleton.tsx [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
;
;
;
function WorkUnitWorkspace({ model, onAction, headerQueuePicker, kpiStripPlaceholder, primaryFooterSlot }) {
    _s();
    const wuShellStyle = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "WorkUnitWorkspace.useMemo[wuShellStyle]": ()=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$visualContext$2f$contextStyle$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["operationalWorkspaceShellStyle"])({
                layer: "work_unit",
                laneKey: model.laneKey,
                workUnitVisualContextKey: model.visualContextKey,
                departmentDefaultVisualContextKey: model.departmentDefaultVisualContextKey,
                departmentKey: model.departmentKey
            })
    }["WorkUnitWorkspace.useMemo[wuShellStyle]"], [
        model.departmentDefaultVisualContextKey,
        model.departmentKey,
        model.laneKey,
        model.visualContextKey
    ]);
    const briefParagraphs = model.aiSummary?.bodyParagraphs?.filter((p)=>p.trim()) ?? (model.aiSummary?.body?.trim() ? [
        model.aiSummary.body.trim()
    ] : []);
    const fullBriefTooltip = briefParagraphs.join("\n\n");
    const hasBrief = Boolean(model.aiSummary?.headline?.trim()) || Boolean(fullBriefTooltip);
    const awarenessLine = model.aiSummary?.aiAwarenessLine?.trim() ?? "";
    const hasAwareness = Boolean(awarenessLine);
    const hasSignals = model.signals.length > 0;
    const hasKpis = model.kpis.length > 0;
    const hasTopStack = hasBrief || hasSignals || hasAwareness || Boolean(headerQueuePicker);
    const hasKpiZone = hasKpis || kpiStripPlaceholder;
    const hasControlDeck = hasTopStack || hasKpiZone;
    const focusKicker = model.focusLabel?.trim() || "Work unit";
    const li = model.laneInterpretation;
    const statusLine = li?.laneStatusLine?.trim() ?? "";
    const recLine = li?.recommendedActionLine?.trim() ?? "";
    const hasLaneStrip = Boolean(statusLine || recLine);
    const hasConfiguredActions = (model.actionsRail.primaries?.length ?? 0) > 0 || (model.actionsRail.systemActions?.length ?? 0) > 0 || (model.actionsRail.quickOperations?.length ?? 0) > 0 || (model.actionsRail.overflow?.length ?? 0) > 0;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$workspace$2f$WorkspaceShellLayout$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["WorkspaceShellLayout"], {
        surface: "work_unit",
        rootClassName: "adminv2-ws-work-unit adminv2-ws-wu-v2",
        style: wuShellStyle,
        railAriaLabel: "Decisions and actions",
        showRail: hasConfiguredActions,
        railContent: hasConfiguredActions ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$workspace$2f$blocks$2f$ActionsBlock$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ActionsBlock$3e$__["ActionsBlock"], {
            model: model.actionsRail,
            onAction: onAction,
            title: "Actions",
            surface: "work_unit"
        }, void 0, false, {
            fileName: "[project]/app/adminV2/components/workspace/shells/WorkUnitWorkspace.tsx",
            lineNumber: 81,
            columnNumber: 11
        }, void 0) : null,
        primaryColumn: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
            children: [
                hasControlDeck ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "adminv2-ws-dept-v2-control-deck",
                    children: [
                        hasTopStack ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "adminv2-ws-dept-v2-top-stack",
                            children: [
                                hasBrief ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "adminv2-ws-dept-v2-brief",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "adminv2-ws-dept-v2-brief-kicker",
                                            children: focusKicker
                                        }, void 0, false, {
                                            fileName: "[project]/app/adminV2/components/workspace/shells/WorkUnitWorkspace.tsx",
                                            lineNumber: 92,
                                            columnNumber: 23
                                        }, void 0),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "adminv2-ws-dept-v2-brief-head-row",
                                            children: [
                                                model.aiSummary?.headline?.trim() ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                                                    className: "adminv2-ws-dept-v2-brief-headline",
                                                    children: model.aiSummary.headline.trim()
                                                }, void 0, false, {
                                                    fileName: "[project]/app/adminV2/components/workspace/shells/WorkUnitWorkspace.tsx",
                                                    lineNumber: 95,
                                                    columnNumber: 27
                                                }, void 0) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                                                    className: "adminv2-ws-dept-v2-brief-headline adminv2-ws-dept-v2-brief-headline--placeholder",
                                                    children: "Lane headline"
                                                }, void 0, false, {
                                                    fileName: "[project]/app/adminV2/components/workspace/shells/WorkUnitWorkspace.tsx",
                                                    lineNumber: 97,
                                                    columnNumber: 27
                                                }, void 0),
                                                fullBriefTooltip ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                    type: "button",
                                                    className: "adminv2-ws-dept-v2-briefing-trigger",
                                                    title: fullBriefTooltip,
                                                    "aria-label": `Lane briefing: ${fullBriefTooltip}`,
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            className: "adminv2-ws-dept-v2-briefing-trigger-icon",
                                                            "aria-hidden": true,
                                                            children: "ⓘ"
                                                        }, void 0, false, {
                                                            fileName: "[project]/app/adminV2/components/workspace/shells/WorkUnitWorkspace.tsx",
                                                            lineNumber: 108,
                                                            columnNumber: 29
                                                        }, void 0),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            className: "adminv2-ws-dept-v2-briefing-trigger-label",
                                                            children: "Briefing"
                                                        }, void 0, false, {
                                                            fileName: "[project]/app/adminV2/components/workspace/shells/WorkUnitWorkspace.tsx",
                                                            lineNumber: 111,
                                                            columnNumber: 29
                                                        }, void 0)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/app/adminV2/components/workspace/shells/WorkUnitWorkspace.tsx",
                                                    lineNumber: 102,
                                                    columnNumber: 27
                                                }, void 0) : null
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/app/adminV2/components/workspace/shells/WorkUnitWorkspace.tsx",
                                            lineNumber: 93,
                                            columnNumber: 23
                                        }, void 0),
                                        headerQueuePicker ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "adminv2-ws-wu-header-queue-picker mt-2 min-w-0",
                                            children: headerQueuePicker
                                        }, void 0, false, {
                                            fileName: "[project]/app/adminV2/components/workspace/shells/WorkUnitWorkspace.tsx",
                                            lineNumber: 116,
                                            columnNumber: 25
                                        }, void 0) : null
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/app/adminV2/components/workspace/shells/WorkUnitWorkspace.tsx",
                                    lineNumber: 91,
                                    columnNumber: 21
                                }, void 0) : null,
                                !hasBrief && headerQueuePicker ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "adminv2-ws-wu-header-queue-picker mt-1 min-w-0 px-1",
                                    children: headerQueuePicker
                                }, void 0, false, {
                                    fileName: "[project]/app/adminV2/components/workspace/shells/WorkUnitWorkspace.tsx",
                                    lineNumber: 121,
                                    columnNumber: 21
                                }, void 0) : null,
                                hasAwareness ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                    className: "adminv2-ws-dept-v2-ai-awareness",
                                    "aria-live": "polite",
                                    children: awarenessLine
                                }, void 0, false, {
                                    fileName: "[project]/app/adminV2/components/workspace/shells/WorkUnitWorkspace.tsx",
                                    lineNumber: 124,
                                    columnNumber: 21
                                }, void 0) : null,
                                hasSignals ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "adminv2-ws-dept-v2-signals",
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$workspace$2f$blocks$2f$SignalBlock$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__SignalBlock$3e$__["SignalBlock"], {
                                        signals: model.signals,
                                        onAction: onAction,
                                        surface: "work_unit",
                                        maxVisible: 3
                                    }, void 0, false, {
                                        fileName: "[project]/app/adminV2/components/workspace/shells/WorkUnitWorkspace.tsx",
                                        lineNumber: 130,
                                        columnNumber: 23
                                    }, void 0)
                                }, void 0, false, {
                                    fileName: "[project]/app/adminV2/components/workspace/shells/WorkUnitWorkspace.tsx",
                                    lineNumber: 129,
                                    columnNumber: 21
                                }, void 0) : null
                            ]
                        }, void 0, true, {
                            fileName: "[project]/app/adminV2/components/workspace/shells/WorkUnitWorkspace.tsx",
                            lineNumber: 89,
                            columnNumber: 17
                        }, void 0) : null,
                        kpiStripPlaceholder ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            "data-workspace-zone": "kpi-banner",
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$workspace$2f$KpiStripSkeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["KpiStripSkeleton"], {
                                id: "wu-kpi-skeleton"
                            }, void 0, false, {
                                fileName: "[project]/app/adminV2/components/workspace/shells/WorkUnitWorkspace.tsx",
                                lineNumber: 137,
                                columnNumber: 19
                            }, void 0)
                        }, void 0, false, {
                            fileName: "[project]/app/adminV2/components/workspace/shells/WorkUnitWorkspace.tsx",
                            lineNumber: 136,
                            columnNumber: 17
                        }, void 0) : hasKpis ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            "data-workspace-zone": "kpi-banner",
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$workspace$2f$blocks$2f$KPIBlock$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__KPIBlock$3e$__["KPIBlock"], {
                                kpis: model.kpis,
                                maxVisible: 5
                            }, void 0, false, {
                                fileName: "[project]/app/adminV2/components/workspace/shells/WorkUnitWorkspace.tsx",
                                lineNumber: 141,
                                columnNumber: 19
                            }, void 0)
                        }, void 0, false, {
                            fileName: "[project]/app/adminV2/components/workspace/shells/WorkUnitWorkspace.tsx",
                            lineNumber: 140,
                            columnNumber: 17
                        }, void 0) : null
                    ]
                }, void 0, true, {
                    fileName: "[project]/app/adminV2/components/workspace/shells/WorkUnitWorkspace.tsx",
                    lineNumber: 87,
                    columnNumber: 13
                }, void 0) : null,
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "adminv2-ws-dept-v2-operational-row adminv2-ws-dept-v2-operational-row--double",
                    "aria-label": "Lane queue",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "adminv2-ws-dept-v2-lane adminv2-ws-dept-v2-lane--throughput",
                            "data-ws-lane-kind": "lane_queue",
                            "data-ws-lane-drill-queue": model.primaryQueue.id,
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "adminv2-ws-dept-v2-lane-chrome adminv2-ws-dept-v2-lane-chrome--throughput-deck",
                                children: [
                                    hasLaneStrip ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "adminv2-ws-wu-lane-strip",
                                        "aria-label": "Lane status",
                                        children: [
                                            statusLine ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                className: "adminv2-ws-wu-lane-strip-line",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        className: "adminv2-ws-wu-lane-strip-k",
                                                        children: "Status"
                                                    }, void 0, false, {
                                                        fileName: "[project]/app/adminV2/components/workspace/shells/WorkUnitWorkspace.tsx",
                                                        lineNumber: 157,
                                                        columnNumber: 25
                                                    }, void 0),
                                                    statusLine
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/app/adminV2/components/workspace/shells/WorkUnitWorkspace.tsx",
                                                lineNumber: 156,
                                                columnNumber: 23
                                            }, void 0) : null,
                                            recLine ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                className: "adminv2-ws-wu-lane-strip-line",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        className: "adminv2-ws-wu-lane-strip-k",
                                                        children: "Suggested"
                                                    }, void 0, false, {
                                                        fileName: "[project]/app/adminV2/components/workspace/shells/WorkUnitWorkspace.tsx",
                                                        lineNumber: 163,
                                                        columnNumber: 25
                                                    }, void 0),
                                                    recLine
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/app/adminV2/components/workspace/shells/WorkUnitWorkspace.tsx",
                                                lineNumber: 162,
                                                columnNumber: 23
                                            }, void 0) : null
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/app/adminV2/components/workspace/shells/WorkUnitWorkspace.tsx",
                                        lineNumber: 154,
                                        columnNumber: 19
                                    }, void 0) : null,
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$workspace$2f$blocks$2f$QueueBlock$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__QueueBlock$3e$__["QueueBlock"], {
                                        queue: model.primaryQueue,
                                        onAction: onAction,
                                        variant: "primary",
                                        surface: "work_unit"
                                    }, void 0, false, {
                                        fileName: "[project]/app/adminV2/components/workspace/shells/WorkUnitWorkspace.tsx",
                                        lineNumber: 169,
                                        columnNumber: 17
                                    }, void 0)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/app/adminV2/components/workspace/shells/WorkUnitWorkspace.tsx",
                                lineNumber: 152,
                                columnNumber: 15
                            }, void 0)
                        }, void 0, false, {
                            fileName: "[project]/app/adminV2/components/workspace/shells/WorkUnitWorkspace.tsx",
                            lineNumber: 147,
                            columnNumber: 13
                        }, void 0),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "adminv2-ws-dept-v2-lane adminv2-ws-dept-v2-lane--attention adminv2-ws-dept-v2-lane--attention--hidden",
                            "aria-hidden": true
                        }, void 0, false, {
                            fileName: "[project]/app/adminV2/components/workspace/shells/WorkUnitWorkspace.tsx",
                            lineNumber: 172,
                            columnNumber: 13
                        }, void 0)
                    ]
                }, void 0, true, {
                    fileName: "[project]/app/adminV2/components/workspace/shells/WorkUnitWorkspace.tsx",
                    lineNumber: 146,
                    columnNumber: 11
                }, void 0),
                model.workSummary ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "adminv2-ws-dept-v2-workflows-strip",
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$workspace$2f$blocks$2f$WorkBlock$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__WorkBlock$3e$__["WorkBlock"], {
                        work: model.workSummary,
                        onAction: onAction,
                        mode: "summary",
                        surface: "work_unit"
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/workspace/shells/WorkUnitWorkspace.tsx",
                        lineNumber: 179,
                        columnNumber: 15
                    }, void 0)
                }, void 0, false, {
                    fileName: "[project]/app/adminV2/components/workspace/shells/WorkUnitWorkspace.tsx",
                    lineNumber: 178,
                    columnNumber: 13
                }, void 0) : null,
                primaryFooterSlot ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "adminv2-ws-dept-v2-workflows-strip",
                    "data-ws-lane-kind": "automation_workflows",
                    children: primaryFooterSlot
                }, void 0, false, {
                    fileName: "[project]/app/adminV2/components/workspace/shells/WorkUnitWorkspace.tsx",
                    lineNumber: 183,
                    columnNumber: 13
                }, void 0) : null
            ]
        }, void 0, true)
    }, void 0, false, {
        fileName: "[project]/app/adminV2/components/workspace/shells/WorkUnitWorkspace.tsx",
        lineNumber: 73,
        columnNumber: 5
    }, this);
}
_s(WorkUnitWorkspace, "rBSm0B9hUrwpMVFjBBduAm4gS+U=");
_c = WorkUnitWorkspace;
var _c;
__turbopack_context__.k.register(_c, "WorkUnitWorkspace");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "AutomationWorkflowsBlock",
    ()=>AutomationWorkflowsBlock
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/client/app-dir/link.js [app-client] (ecmascript)");
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
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "adminv2-ws-automation-telemetry",
        "data-ws-component": "automation_telemetry",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("header", {
                className: "adminv2-ws-automation-telemetry__mast",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "adminv2-ws-automation-telemetry__mast-primary",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: "adminv2-ws-automation-telemetry__kicker",
                                children: "Workflow telemetry"
                            }, void 0, false, {
                                fileName: "[project]/app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock.tsx",
                                lineNumber: 48,
                                columnNumber: 21
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                className: "adminv2-ws-automation-telemetry__title",
                                children: title
                            }, void 0, false, {
                                fileName: "[project]/app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock.tsx",
                                lineNumber: 49,
                                columnNumber: 21
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
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
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                        href: href,
                        className: "adminv2-ws-automation-telemetry__review",
                        children: [
                            "Review",
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
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
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "adminv2-ws-automation-telemetry__groups",
                role: "group",
                "aria-label": "Automation metrics",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                        className: "adminv2-ws-automation-telemetry__group",
                        "aria-label": "Throughput",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h4", {
                                className: "adminv2-ws-automation-telemetry__group-title",
                                children: "Throughput"
                            }, void 0, false, {
                                fileName: "[project]/app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock.tsx",
                                lineNumber: 62,
                                columnNumber: 21
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "adminv2-ws-automation-telemetry__group-cells",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "adminv2-ws-automation-telemetry__metric",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "adminv2-ws-automation-telemetry__metric-label",
                                                children: "Runs today"
                                            }, void 0, false, {
                                                fileName: "[project]/app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock.tsx",
                                                lineNumber: 65,
                                                columnNumber: 29
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
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
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "adminv2-ws-automation-telemetry__metric",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "adminv2-ws-automation-telemetry__metric-label",
                                                children: "Running (7d)"
                                            }, void 0, false, {
                                                fileName: "[project]/app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock.tsx",
                                                lineNumber: 73,
                                                columnNumber: 29
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
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
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                        className: "adminv2-ws-automation-telemetry__group",
                        "aria-label": "Reliability",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h4", {
                                className: "adminv2-ws-automation-telemetry__group-title",
                                children: "Reliability"
                            }, void 0, false, {
                                fileName: "[project]/app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock.tsx",
                                lineNumber: 83,
                                columnNumber: 21
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "adminv2-ws-automation-telemetry__group-cells",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: `adminv2-ws-automation-telemetry__metric ${successConcern ? "adminv2-ws-automation-telemetry__metric--watch" : ""}`,
                                        "data-automation-watch": successConcern ? "true" : undefined,
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "adminv2-ws-automation-telemetry__metric-label",
                                                children: "Success rate (7d)"
                                            }, void 0, false, {
                                                fileName: "[project]/app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock.tsx",
                                                lineNumber: 89,
                                                columnNumber: 29
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
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
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: `adminv2-ws-automation-telemetry__metric ${failuresHot ? "adminv2-ws-automation-telemetry__metric--attention" : ""}`,
                                        "data-automation-attention": failuresHot ? "true" : undefined,
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "adminv2-ws-automation-telemetry__metric-label",
                                                children: "Failures (7d)"
                                            }, void 0, false, {
                                                fileName: "[project]/app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock.tsx",
                                                lineNumber: 100,
                                                columnNumber: 29
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
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
            workflows?.length ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                className: "adminv2-ws-automation-telemetry__workflows",
                "aria-label": "Relevant workflows",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "adminv2-ws-automation-telemetry__workflows-head",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "adminv2-ws-automation-telemetry__workflows-kicker",
                                children: "In scope"
                            }, void 0, false, {
                                fileName: "[project]/app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock.tsx",
                                lineNumber: 114,
                                columnNumber: 25
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
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
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                        className: "adminv2-ws-automation-telemetry__workflow-list",
                        role: "list",
                        children: workflows.slice(0, 4).map((w)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                className: "adminv2-ws-automation-workflow-row",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "adminv2-ws-automation-workflow-row__rail",
                                        "aria-hidden": true
                                    }, void 0, false, {
                                        fileName: "[project]/app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock.tsx",
                                        lineNumber: 120,
                                        columnNumber: 33
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "adminv2-ws-automation-workflow-row__body",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "adminv2-ws-automation-workflow-row__name",
                                                children: w.name ?? w.id
                                            }, void 0, false, {
                                                fileName: "[project]/app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock.tsx",
                                                lineNumber: 122,
                                                columnNumber: 37
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "adminv2-ws-automation-workflow-row__meta",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        className: "adminv2-ws-automation-workflow-row__trigger",
                                                        children: humanTrigger(w.event_type)
                                                    }, void 0, false, {
                                                        fileName: "[project]/app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock.tsx",
                                                        lineNumber: 124,
                                                        columnNumber: 41
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        className: "adminv2-ws-automation-workflow-row__sep",
                                                        "aria-hidden": true,
                                                        children: "·"
                                                    }, void 0, false, {
                                                        fileName: "[project]/app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock.tsx",
                                                        lineNumber: 125,
                                                        columnNumber: 41
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
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
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
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
_c = AutomationWorkflowsBlock;
var _c;
__turbopack_context__.k.register(_c, "AutomationWorkflowsBlock");
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
"[project]/lib/workspace/viewModels/enrollmentRightRailMerge.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
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
"[project]/lib/ui-v2/queueUiConfig.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "DEFAULT_QUEUE_ROW_PREVIEW_FIELD_LABELS",
    ()=>DEFAULT_QUEUE_ROW_PREVIEW_FIELD_LABELS,
    "getQueueRowPreviewFieldLabel",
    ()=>getQueueRowPreviewFieldLabel,
    "getQueueUiConfig",
    ()=>getQueueUiConfig,
    "mergeQueueRowPreviewFieldLabels",
    ()=>mergeQueueRowPreviewFieldLabels,
    "partitionQueueUiSections",
    ()=>partitionQueueUiSections,
    "queuePrimaryTotalFromSummaries",
    ()=>queuePrimaryTotalFromSummaries
]);
const DEFAULT_QUEUE_ROW_PREVIEW_FIELD_LABELS = {
    title: "Title",
    status: "Status",
    primary_contact: "Contact",
    phone: "Phone",
    email: "Email",
    child_name: "Child",
    program: "Programs",
    /** Inline label before program per child (e.g. `Program: Preschool`). */ program_inline: "Program",
    /** CRM compact section heading above desired start + tour row. */ timing: "Timing",
    /** CRM compact section above multi- or single-child rows with program. */ children_programs: "Children / Programs",
    desired_start_date: "Desired Start Date",
    tour_date: "Tour",
    age_band: "Age band"
};
function mergeQueueRowPreviewFieldLabels(override) {
    return {
        ...DEFAULT_QUEUE_ROW_PREVIEW_FIELD_LABELS,
        ...override ?? {}
    };
}
function getQueueRowPreviewFieldLabel(ui, key) {
    return ui.row_preview.fieldLabels[key] ?? DEFAULT_QUEUE_ROW_PREVIEW_FIELD_LABELS[key] ?? key;
}
function uniqPreserve(xs) {
    const out = [];
    const seen = new Set();
    for (const x of xs){
        const k = x.trim();
        if (!k) continue;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(k);
    }
    return out;
}
function getQueueUiConfig(def) {
    const allKeys = def.queues.map((q)=>q.key);
    const ui = def.ui;
    const fallback = {
        layout: "single_section",
        primary_total_label: undefined,
        primary_total_queue: undefined,
        sections: [
            {
                key: "all",
                label: "Queues",
                queue_keys: allKeys
            }
        ],
        row_preview: {
            variant: "basic",
            fields: [
                "title",
                "status"
            ],
            actions: [
                "open"
            ],
            fieldLabels: mergeQueueRowPreviewFieldLabels()
        }
    };
    if (!ui) return fallback;
    const sections = Array.isArray(ui.sections) && ui.sections.length ? ui.sections.map((s)=>({
            key: String(s.key ?? "").trim(),
            label: String(s.label ?? "").trim(),
            tone: s.tone,
            queue_keys: uniqPreserve((Array.isArray(s.queue_keys) ? s.queue_keys : []).map(String))
        })).filter((s)=>s.key && s.label && s.queue_keys.length > 0) : fallback.sections;
    const row_preview = ui.row_preview ?? {};
    const variant = row_preview.variant === "crm_compact" ? "crm_compact" : "basic";
    const fields = Array.isArray(row_preview.fields) && row_preview.fields.length ? row_preview.fields : fallback.row_preview.fields;
    const actions = Array.isArray(row_preview.actions) && row_preview.actions.length ? row_preview.actions : fallback.row_preview.actions;
    const labelOverride = row_preview.field_labels && typeof row_preview.field_labels === "object" ? row_preview.field_labels : row_preview.fieldLabels && typeof row_preview.fieldLabels === "object" ? row_preview.fieldLabels : null;
    const fieldLabels = mergeQueueRowPreviewFieldLabels(labelOverride);
    return {
        layout: ui.layout === "pipeline_with_attention" ? "pipeline_with_attention" : "single_section",
        primary_total_label: ui.primary_total_label,
        primary_total_queue: ui.primary_total_queue,
        sections,
        row_preview: {
            variant,
            fields,
            actions,
            fieldLabels
        }
    };
}
function queuePrimaryTotalFromSummaries(params) {
    const target = (params.ui.primary_total_queue ?? "").trim();
    if (!target) return null;
    const q = params.summaries.find((s)=>s.key === target);
    if (!q) return null;
    return q.count ?? 0;
}
function partitionQueueUiSections(ui) {
    const attention = ui.sections.filter((s)=>s.tone === "critical");
    const throughput = ui.sections.filter((s)=>s.tone !== "critical");
    return {
        throughput,
        attention
    };
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/lib/ui-v2/crmQueueRowPreviewPresentation.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Shared CRM compact queue row presentation: structured contact + date/tour captions.
 * Driven by queue `row_preview.fields` (want()) and `row_preview.field_labels`.
 */ __turbopack_context__.s([
    "buildCrmQueueRowPreviewPresentation",
    ()=>buildCrmQueueRowPreviewPresentation,
    "dedupeRedundantProgramAgeInPreview",
    ()=>dedupeRedundantProgramAgeInPreview,
    "refineCrmCompactChildLinesForPreview",
    ()=>refineCrmCompactChildLinesForPreview,
    "stripTourContextValuePrefix",
    ()=>stripTourContextValuePrefix
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminFormatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/adminFormatters.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$ui$2d$v2$2f$queueUiConfig$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/ui-v2/queueUiConfig.ts [app-client] (ecmascript)");
;
;
function stripTourContextValuePrefix(raw) {
    const t = (raw ?? "").trim();
    if (!t) return "";
    return t.replace(/^Tour:\s*/i, "").trim() || t;
}
function dedupeRedundantProgramAgeInPreview(text) {
    const t = text.trim();
    if (!t) return "";
    const parts = t.split(/\s*·\s*/).map((p)=>p.replace(/\s+/g, " ").trim()).filter(Boolean);
    if (parts.length < 2) return t;
    const isAgeFragment = (p)=>/^Ages?\s/i.test(p) || /^age\s*[:/]/i.test(p);
    const kept = [];
    for (const p of parts){
        if (!isAgeFragment(p)) {
            kept.push(p);
            continue;
        }
        const ageTail = p.replace(/^Ages?\s*/i, "").replace(/\s/g, "").toLowerCase();
        const redundant = kept.some((k)=>{
            const kn = k.replace(/\s/g, "").toLowerCase();
            if (!ageTail || ageTail.length < 4) return false;
            return kn.includes(ageTail) || kn.includes(ageTail.replace(/[–—-]/g, ""));
        });
        if (!redundant) kept.push(p);
    }
    return kept.length ? kept.join(" · ") : t;
}
function refineCrmCompactChildLinesForPreview(lines, familyProgram, opts) {
    const fam = (familyProgram ?? "").trim() ? dedupeRedundantProgramAgeInPreview(String(familyProgram)) : "";
    return lines.map((line)=>{
        const sec = (line.secondary ?? "").trim() ? dedupeRedundantProgramAgeInPreview(String(line.secondary)) : "";
        let programInline = sec || null;
        if (!programInline && opts.attachFamilyWhenMissing && fam) programInline = fam;
        return {
            ...line,
            programInline: programInline || null
        };
    });
}
function deriveStructuredContactFromQueueRow(row, want) {
    const contactLine = typeof row._primary_contact_line === "string" ? row._primary_contact_line.trim() : "";
    const emailRaw = typeof row._primary_email === "string" ? row._primary_email.trim() : "";
    const phoneRaw = typeof row._primary_phone === "string" ? row._primary_phone.trim() : "";
    const wantPrimary = want("primary_contact");
    const wantPhone = want("phone");
    const wantEmail = want("email");
    const em = wantEmail ? emailRaw : "";
    const phoneFmt = wantPhone && phoneRaw ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminFormatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatPhoneUS"])(phoneRaw) : "";
    const phoneOk = phoneFmt && phoneFmt !== "—" ? phoneFmt : "";
    const phoneDigits = phoneRaw.replace(/\D/g, "");
    const isPhoneToken = (p)=>{
        const d = p.replace(/\D/g, "");
        if (d.length < 10) return false;
        return d === phoneDigits || phoneDigits.length >= 10 && d === phoneDigits.slice(-10);
    };
    const isEmailToken = (p)=>p.includes("@") || em.length > 0 && p.toLowerCase() === em.toLowerCase();
    let contactDisplayName = null;
    if (wantPrimary && contactLine) {
        const parts = contactLine.split(/\s*·\s*/).map((p)=>p.trim()).filter(Boolean);
        const nameParts = [];
        for (const p of parts){
            if (wantEmail && isEmailToken(p)) continue;
            if (wantPhone && isPhoneToken(p)) continue;
            if (p.includes("@")) continue;
            if (/^[\d\s\-+().]+$/.test(p) && p.replace(/\D/g, "").length >= 10) continue;
            nameParts.push(p);
        }
        contactDisplayName = nameParts.join(" ").trim() || null;
        if (!contactDisplayName && parts.length === 1) {
            const only = parts[0];
            if (!isEmailToken(only) && !isPhoneToken(only)) contactDisplayName = only;
        }
    }
    const contactEmail = em || null;
    const contactPhoneDisplay = phoneOk || null;
    const structuredAny = Boolean(contactDisplayName && contactDisplayName.trim() || contactPhoneDisplay || contactEmail);
    const snippetParts = [
        wantPrimary && contactDisplayName ? contactDisplayName : "",
        wantPhone && phoneOk ? phoneOk : "",
        wantEmail && em ? em : ""
    ].filter(Boolean);
    const contactSnippet = structuredAny ? null : snippetParts.length > 0 ? snippetParts.join(" · ") : wantPrimary && contactLine ? contactLine : null;
    return {
        contactDisplayName: contactDisplayName?.trim() || null,
        contactPhoneDisplay,
        contactEmail,
        contactSnippet
    };
}
function buildCrmQueueRowPreviewPresentation(row, want, rowPreviewFieldLabels) {
    const labels = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$ui$2d$v2$2f$queueUiConfig$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["mergeQueueRowPreviewFieldLabels"])(rowPreviewFieldLabels);
    const contact = deriveStructuredContactFromQueueRow(row, want);
    const wantD = want("desired_start_date");
    const wantT = want("tour_date");
    const desiredRaw = typeof row._desired_start_date === "string" ? row._desired_start_date.trim() : "";
    const desiredFormatted = wantD && desiredRaw ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminFormatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatDateUsShortHyphenUtc"])(desiredRaw) : null;
    const desiredVal = wantD && desiredFormatted && desiredFormatted !== "—" && desiredFormatted.trim() ? desiredFormatted : wantD ? "—" : null;
    const ageBandRaw = typeof row._age_band === "string" ? row._age_band.trim() : "";
    const ageBandContext = ageBandRaw || null;
    const tourPrimary = typeof row._tour_context === "string" ? row._tour_context.trim() : "";
    const tourAlt = typeof row._tour_timing === "string" ? row._tour_timing.trim() : "";
    const tourRaw = tourPrimary || tourAlt;
    const tourStripped = tourRaw ? stripTourContextValuePrefix(tourRaw) : "";
    const tourFormatted = wantT && tourStripped ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminFormatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatQueuePreviewTourTimingUtc"])(tourStripped) : "";
    const tourVal = wantT ? tourFormatted.trim() ? tourFormatted : "—" : null;
    const timingParts = [];
    if (wantD && labels.desired_start_date) timingParts.push(`${labels.desired_start_date}: ${desiredVal ?? "—"}`);
    if (wantT && labels.tour_date) timingParts.push(`${labels.tour_date}: ${tourVal ?? "—"}`);
    const crmCompactTimingValueLine = timingParts.length ? timingParts.join("    ") : null;
    return {
        ...contact,
        desiredStartDateDisplay: wantD ? desiredVal : null,
        ageBandContext,
        tourContext: wantT ? tourVal : null,
        crmCompactTimingValueLine,
        rowPreviewLabelTimingGroup: labels.timing ?? null,
        crmChildrenProgramsGroupLabel: labels.children_programs ?? null,
        rowPreviewLabelProgramInline: labels.program_inline ?? null,
        ageContext: null,
        rowPreviewLabelPrimaryContact: labels.primary_contact ?? null,
        rowPreviewLabelDesiredStartDate: labels.desired_start_date ?? null,
        rowPreviewLabelTourDate: labels.tour_date ?? null,
        rowPreviewLabelAgeBand: labels.age_band ?? null
    };
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/lib/workspace/viewModels/enrollmentWorkUnitViewModel.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ENROLLMENT_CRM_QUEUE_PAYLOAD_GAPS",
    ()=>ENROLLMENT_CRM_QUEUE_PAYLOAD_GAPS,
    "buildEnrollmentCrmRowSemanticSlots",
    ()=>buildEnrollmentCrmRowSemanticSlots,
    "buildEnrollmentDepartmentCommandRail",
    ()=>buildEnrollmentDepartmentCommandRail,
    "buildEnrollmentOpportunityQueueItemVm",
    ()=>buildEnrollmentOpportunityQueueItemVm,
    "buildEnrollmentWorkUnitActionsRail",
    ()=>buildEnrollmentWorkUnitActionsRail,
    "enrollmentCrmContactCapabilityForRow",
    ()=>enrollmentCrmContactCapabilityForRow
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$opportunityActivityTimelineFormat$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/lib/admin/opportunityActivityTimelineFormat.ts [app-client] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$ui$2d$v2$2f$crmQueueRowPreviewPresentation$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/ui-v2/crmQueueRowPreviewPresentation.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$contactNormalize$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/contactNormalize.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$ui$2d$v2$2f$formatWorkspaceCurrency$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/ui-v2/formatWorkspaceCurrency.ts [app-client] (ecmascript)");
;
;
;
;
const ENROLLMENT_CRM_QUEUE_PAYLOAD_GAPS = [
    "structured multi-child CRM rows use `_crm_compact_children[]` (+ optional `_child_display_name` for single-child fallback) from queue enrichment.",
    "dedicated_sms_action (no SMS/comms API route wired from workspace queue)",
    "in_app_message_action (no threaded message UI route from workspace row)"
];
function enrollmentCrmContactCapabilityForRow(row) {
    const email = Boolean(row._primary_email?.trim());
    const phoneRaw = row._primary_phone?.trim() ?? "";
    const phoneTel = phoneRaw.replace(/\D/g, "").length >= 10;
    return {
        emailMailto: email,
        phoneTel
    };
}
function parseIsoMs(ts) {
    if (!ts) return null;
    const ms = Date.parse(ts);
    return Number.isFinite(ms) ? ms : null;
}
function formatAgeCompact(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    const d = Math.floor(h / 24);
    if (d > 0) return `${d}d`;
    if (h > 0) return `${h}h`;
    if (m > 0) return `${m}m`;
    return `${s}s`;
}
function opportunityQuickActionsForLane(workUnitKey) {
    const k = workUnitKey.trim().toLowerCase();
    if (k === "needs_attention") {
        return [
            {
                id: "open_quote",
                label: "Open"
            }
        ];
    }
    if (k === "priced_followup") {
        return [
            {
                id: "open_quote",
                label: "Open inquiry"
            },
            {
                id: "mark_won",
                label: "Enrolled"
            },
            {
                id: "mark_lost",
                label: "Lost"
            }
        ];
    }
    if (k === "quoting") {
        return [
            {
                id: "open_quote",
                label: "Open inquiry"
            },
            {
                id: "start_quote",
                label: "Schedule tour"
            },
            {
                id: "mark_lost",
                label: "Lost"
            }
        ];
    }
    return [
        {
            id: "qualify_opportunity",
            label: "Conversation had"
        },
        {
            id: "start_quote",
            label: "Schedule tour"
        },
        {
            id: "mark_lost",
            label: "Lost"
        }
    ];
}
function laneQuickActionsForAttentionRow(row, workUnitKey) {
    const wk = workUnitKey.trim().toLowerCase();
    const reason = row._attention_reason?.trim() || null;
    if (wk === "needs_attention" && reason) {
        if (reason === "stale_quote_followup") {
            return [
                {
                    id: "open_quote",
                    label: "Open inquiry"
                },
                {
                    id: "mark_won",
                    label: "Enrolled"
                },
                {
                    id: "mark_lost",
                    label: "Lost"
                }
            ];
        }
        if (reason === "missing_quote_after_execution") {
            return [
                {
                    id: "open_quote",
                    label: "Open inquiry"
                },
                {
                    id: "start_quote",
                    label: "Schedule tour"
                },
                {
                    id: "mark_lost",
                    label: "Lost"
                }
            ];
        }
        return [
            {
                id: "qualify_opportunity",
                label: "Conversation had"
            },
            {
                id: "start_quote",
                label: "Schedule tour"
            },
            {
                id: "mark_lost",
                label: "Lost"
            }
        ];
    }
    return opportunityQuickActionsForLane(workUnitKey);
}
function parseCrmChildrenFromStructuredRow(row) {
    const raw = row._crm_compact_children;
    if (!Array.isArray(raw)) return [];
    const out = [];
    for (const x of raw){
        if (x === null || typeof x !== "object") continue;
        const o = x;
        const primary = typeof o.primary === "string" ? o.primary.trim() : typeof o.line === "string" ? o.line.trim() : "";
        if (!primary) continue;
        const secondary = typeof o.secondary === "string" ? o.secondary.trim() : typeof o.detail === "string" ? o.detail.trim() : null;
        out.push({
            primary,
            secondary: secondary || null
        });
    }
    return out;
}
function crmContactQuickActions(row) {
    const cap = enrollmentCrmContactCapabilityForRow(row);
    const email = row._primary_email?.trim();
    const phone = row._primary_phone?.trim();
    const out = [];
    if (cap.emailMailto && email) {
        out.push({
            id: "crm_mailto",
            label: "Email",
            payload: {
                href: `mailto:${email}`
            }
        });
    }
    if (cap.phoneTel && phone) {
        const tel = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$contactNormalize$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["normalizePhone"])(phone) ?? `+1${phone.replace(/\D/g, "").slice(-10)}`;
        out.push({
            id: "crm_tel",
            label: "Call",
            payload: {
                href: `tel:${tel}`
            }
        });
    }
    return out;
}
function buildEnrollmentCrmRowSemanticSlots(row, options) {
    const customer = (row._customer_name ?? "").trim();
    const titleBase = (row.name ?? "").trim();
    const primaryIdentity = customer || titleBase || row.id.slice(-8);
    const structuredChildren = parseCrmChildrenFromStructuredRow(row);
    const multiChild = structuredChildren.length >= 2;
    const childNameFlat = row._child_display_name?.trim() || null;
    const childName = multiChild ? null : childNameFlat;
    const stageLabel = row._lifecycle_stage_title?.trim() || null;
    const statusLabel = (row._status_display ?? "").trim() || (row.status_key ?? "").trim() || null;
    const nextStep = row._next_step_preview?.trim() || row._lifecycle_next_step?.title?.trim() || null;
    const wfAt = row.last_activity_at;
    const wfSummary = row.last_activity_summary?.trim() || null;
    let lastActivity = null;
    if (wfAt) {
        const ms = parseIsoMs(wfAt);
        if (ms != null) {
            const rel = `${formatAgeCompact(Date.now() - ms)} ago`;
            lastActivity = wfSummary ? `${rel} · ${wfSummary}` : rel;
        }
    }
    if (!lastActivity) {
        const lastTouchedMs = parseIsoMs(row.updated_at) ?? parseIsoMs(row.created_at);
        lastActivity = lastTouchedMs != null ? `${formatAgeCompact(Date.now() - lastTouchedMs)} ago` : null;
    }
    const commercialValue = row.quote_total != null && Number.isFinite(Number(row.quote_total)) && Number(row.quote_total) > 0 ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$ui$2d$v2$2f$formatWorkspaceCurrency$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatWorkspaceUsdGrouped"])(Number(row.quote_total)) : null;
    const roomContext = row._room_label?.trim() || null;
    const attentionReason = row._attention_reason_label?.trim() || null;
    const familyNote = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$opportunityActivityTimelineFormat$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__["formatOpportunityQueueNotesPreview"])(row._notes_preview, options?.viewerTimezone ?? undefined);
    const staleSig = row.stale_signal;
    const activityStale = staleSig && String(staleSig.label ?? "").trim() ? {
        label: String(staleSig.label).trim(),
        severity: staleSig.severity
    } : null;
    const programRaw = row._requested_program?.trim() || null;
    const programContextDeduped = programRaw ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$ui$2d$v2$2f$crmQueueRowPreviewPresentation$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["dedupeRedundantProgramAgeInPreview"])(programRaw) : null;
    const want = options?.previewWant ?? ((_f)=>true);
    const childrenLinesRefined = multiChild && structuredChildren.length >= 2 ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$ui$2d$v2$2f$crmQueueRowPreviewPresentation$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["refineCrmCompactChildLinesForPreview"])(structuredChildren, want("program") ? programContextDeduped : null, {
        attachFamilyWhenMissing: want("program")
    }) : null;
    const previewPresentation = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$ui$2d$v2$2f$crmQueueRowPreviewPresentation$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["buildCrmQueueRowPreviewPresentation"])(row, want, options?.rowPreviewFieldLabels);
    const programContext = want("program") ? !multiChild ? programContextDeduped : null : null;
    return {
        primaryIdentity,
        childName,
        childrenLines: multiChild ? childrenLinesRefined : null,
        stageLabel,
        statusLabel,
        nextStep,
        lastActivity,
        commercialValue,
        ...previewPresentation,
        programContext,
        roomContext,
        attentionReason,
        familyNote,
        activityStale
    };
}
function buildEnrollmentOpportunityQueueItemVm(row, ctx) {
    const slots = buildEnrollmentCrmRowSemanticSlots(row, {
        rowPreviewFieldLabels: ctx.rowPreviewFieldLabels
    });
    const titleBase = (row.name ?? "").trim();
    const title = (row._customer_name ?? "").trim() || titleBase || row.id.slice(-8);
    const status = (row.status_key ?? "").trim();
    const statusLabel = (row._status_display ?? "").trim() || status;
    const laneActions = ctx.workUnitKey.trim().toLowerCase() === "needs_attention" ? laneQuickActionsForAttentionRow(row, ctx.workUnitKey) : opportunityQuickActionsForLane(ctx.workUnitKey);
    const quickActions = [
        ...crmContactQuickActions(row),
        ...laneActions
    ];
    const item = {
        id: row.id,
        title,
        subtitle: slots.stageLabel && slots.statusLabel && slots.stageLabel !== slots.statusLabel ? `${slots.stageLabel} · ${slots.statusLabel}` : slots.stageLabel || slots.statusLabel || undefined,
        valueLabel: slots.commercialValue ?? undefined,
        quickActions,
        semanticCrmCompact: slots,
        urgencyTier: ctx.workUnitKey.trim().toLowerCase() === "priced_followup" ? "warning" : "standard"
    };
    if (statusLabel) {
        item.groupKey = status;
        item.groupLabel = statusLabel;
    }
    return item;
}
function buildEnrollmentWorkUnitActionsRail() {
    return {
        primaries: [],
        systemActions: [
            {
                id: "wu_back_department",
                label: "Back to department",
                variant: "primary"
            }
        ],
        quickOperations: [
            {
                id: "wu_open_needs_attention",
                label: "Open Needs attention queue"
            },
            {
                id: "wu_manage_work_units",
                label: "Manage work units"
            }
        ],
        overflow: [
            {
                id: "wu_workspace_root",
                label: "Organization workspace",
                variant: "secondary"
            }
        ]
    };
}
function buildEnrollmentDepartmentCommandRail() {
    return {
        primaries: [],
        systemActions: [
            {
                id: "dept_open_enrollment_wu",
                label: "Open enrollment queue",
                variant: "primary"
            }
        ],
        quickOperations: [
            {
                id: "wu_manage_work_units",
                label: "Manage work units"
            }
        ],
        overflow: [
            {
                id: "wu_workspace_root",
                label: "Organization workspace",
                variant: "secondary"
            }
        ]
    };
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/lib/ui-v2/adapters/realWorkUnitFromOpportunities.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "buildRealOpportunityWorkUnitWorkspaceModel",
    ()=>buildRealOpportunityWorkUnitWorkspaceModel
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$ui$2d$v2$2f$formatWorkspaceCurrency$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/ui-v2/formatWorkspaceCurrency.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$viewModels$2f$enrollmentWorkUnitViewModel$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/workspace/viewModels/enrollmentWorkUnitViewModel.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$viewModels$2f$enrollmentRightRailMerge$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/workspace/viewModels/enrollmentRightRailMerge.ts [app-client] (ecmascript)");
;
;
;
function parseIsoMs(ts) {
    if (!ts) return null;
    const ms = Date.parse(ts);
    return Number.isFinite(ms) ? ms : null;
}
function formatAgeCompact(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    const d = Math.floor(h / 24);
    if (d > 0) return `${d}d`;
    if (h > 0) return `${h}h`;
    if (m > 0) return `${m}m`;
    return `${s}s`;
}
function defaultOpportunityQueueItemVm(row, workUnitKey) {
    const customer = (row._customer_name ?? "").trim();
    const titleBase = (row.name ?? "").trim();
    const title = customer || titleBase || row.id.slice(-8);
    const status = (row.status_key ?? "").trim();
    const statusLabel = (row._status_display ?? "").trim() || status;
    const value = row.quote_total != null && Number.isFinite(Number(row.quote_total)) && Number(row.quote_total) > 0 ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$ui$2d$v2$2f$formatWorkspaceCurrency$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatWorkspaceUsdGrouped"])(Number(row.quote_total)) : undefined;
    const reasonLabel = row._attention_reason_label?.trim() || null;
    const reason = row._attention_reason?.trim() || null;
    const nextStep = row._lifecycle_next_step?.title?.trim() || "";
    const wfAt = row.last_activity_at;
    const wfSummary = row.last_activity_summary?.trim() || null;
    let lastActivityLabel = null;
    if (wfAt) {
        const wfMs = parseIsoMs(wfAt);
        if (wfMs != null) {
            const rel = `${formatAgeCompact(Date.now() - wfMs)} ago`;
            lastActivityLabel = wfSummary ? `${rel} · ${wfSummary}` : rel;
        }
    }
    if (!lastActivityLabel) {
        const lastTouchedMs = parseIsoMs(row.updated_at) ?? parseIsoMs(row.created_at);
        lastActivityLabel = lastTouchedMs != null ? `${formatAgeCompact(Date.now() - lastTouchedMs)} ago` : "";
    }
    const quickActions = workUnitKey.trim().toLowerCase() === "needs_attention" && reason ? (()=>{
        if (reason === "stale_quote_followup") {
            return [
                {
                    id: "open_quote",
                    label: "Open inquiry"
                },
                {
                    id: "mark_won",
                    label: "Enrolled"
                },
                {
                    id: "mark_lost",
                    label: "Lost"
                }
            ];
        }
        if (reason === "missing_quote_after_execution") {
            return [
                {
                    id: "open_quote",
                    label: "Open inquiry"
                },
                {
                    id: "start_quote",
                    label: "Schedule tour"
                },
                {
                    id: "mark_lost",
                    label: "Lost"
                }
            ];
        }
        return [
            {
                id: "qualify_opportunity",
                label: "Conversation had"
            },
            {
                id: "start_quote",
                label: "Schedule tour"
            },
            {
                id: "mark_lost",
                label: "Lost"
            }
        ];
    })() : (()=>{
        const k = workUnitKey.trim().toLowerCase();
        if (k === "needs_attention") return [
            {
                id: "open_quote",
                label: "Open"
            }
        ];
        if (k === "priced_followup") {
            return [
                {
                    id: "open_quote",
                    label: "Open inquiry"
                },
                {
                    id: "mark_won",
                    label: "Enrolled"
                },
                {
                    id: "mark_lost",
                    label: "Lost"
                }
            ];
        }
        if (k === "quoting") {
            return [
                {
                    id: "open_quote",
                    label: "Open inquiry"
                },
                {
                    id: "start_quote",
                    label: "Schedule tour"
                },
                {
                    id: "mark_lost",
                    label: "Lost"
                }
            ];
        }
        return [
            {
                id: "qualify_opportunity",
                label: "Conversation had"
            },
            {
                id: "start_quote",
                label: "Schedule tour"
            },
            {
                id: "mark_lost",
                label: "Lost"
            }
        ];
    })();
    const stale = row.stale_signal;
    const tags = stale && String(stale.label ?? "").trim() ? [
        String(stale.label).trim()
    ] : undefined;
    const item = {
        id: row.id,
        title,
        valueLabel: value,
        metaLines: [
            ...statusLabel ? [
                {
                    label: "Status",
                    value: statusLabel
                }
            ] : [],
            ...nextStep ? [
                {
                    label: "Next step",
                    value: nextStep
                }
            ] : [],
            ...reasonLabel ? [
                {
                    label: "Reason",
                    value: reasonLabel
                }
            ] : [],
            ...lastActivityLabel ? [
                {
                    label: "Last activity",
                    value: lastActivityLabel
                }
            ] : []
        ],
        ...tags ? {
            tags
        } : {},
        quickActions,
        urgencyTier: workUnitKey.trim().toLowerCase() === "priced_followup" ? "warning" : "standard"
    };
    if (statusLabel) {
        item.groupKey = status;
        item.groupLabel = statusLabel;
    }
    return item;
}
function buildRealOpportunityWorkUnitWorkspaceModel(input) {
    const workUnitKeyLower = input.workUnitKey.trim().toLowerCase();
    const isAllInquiries = workUnitKeyLower === "pipeline_overview";
    const isEnrollmentDept = (input.departmentKey ?? "").trim().toLowerCase() === "enrollment";
    const rawItems = input.oq.items.map((row)=>{
        const base = isEnrollmentDept ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$viewModels$2f$enrollmentWorkUnitViewModel$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["buildEnrollmentOpportunityQueueItemVm"])(row, {
            workUnitKey: input.workUnitKey,
            rowPreviewFieldLabels: input.rowPreviewFieldLabels
        }) : defaultOpportunityQueueItemVm(row, input.workUnitKey);
        if (input.queueRowQuickActions?.length) {
            return {
                ...base,
                quickActions: input.queueRowQuickActions
            };
        }
        return base;
    });
    const items = rawItems.slice().sort((a, b)=>{
        const ak = (a.groupLabel ?? "").toLowerCase();
        const bk = (b.groupLabel ?? "").toLowerCase();
        if (ak !== bk) return ak.localeCompare(bk);
        return a.title.toLowerCase().localeCompare(b.title.toLowerCase());
    });
    const queue = {
        id: `oq:${input.workUnitId}`,
        title: input.workUnitName,
        countBadge: input.oq.total,
        items,
        sortCaption: "Grouped by status",
        workUnitMidlineKeys: isEnrollmentDept ? {
            left: "Lifecycle",
            right: "Next step"
        } : {
            left: "Next step",
            right: "Status"
        },
        workUnitGroupHeaders: Object.fromEntries([
            ...new Set(items.map((i)=>i.groupKey || i.groupLabel).filter(Boolean))
        ].map((k)=>[
                k,
                {
                    label: items.find((i)=>(i.groupKey || i.groupLabel) === k)?.groupLabel ?? k
                }
            ]))
    };
    const laneKey = input.workUnitKey;
    const focusLabel = `${input.deptName} · ${input.workUnitName}`;
    let valueTotal = 0;
    let oldestMs = null;
    let needsActionCount = 0;
    for (const row of input.oq.items){
        const q = row.quote_total != null && Number.isFinite(Number(row.quote_total)) ? Number(row.quote_total) : 0;
        if (q > 0) valueTotal += q;
        const touched = parseIsoMs(row.updated_at) ?? parseIsoMs(row.created_at);
        if (touched != null) oldestMs = oldestMs == null ? touched : Math.min(oldestMs, touched);
        const hasNext = Boolean(row._lifecycle_next_step?.title?.trim());
        if (!hasNext) needsActionCount += 1;
    }
    if (workUnitKeyLower === "needs_attention") {
        needsActionCount = input.oq.total;
    }
    const oldestAgeLabel = oldestMs != null ? `${formatAgeCompact(Date.now() - oldestMs)} ago` : "—";
    const actionsRail = isEnrollmentDept ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$viewModels$2f$enrollmentRightRailMerge$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["mergeEnrollmentRightRailActions"])(input.rightRailResolved ?? [], {
        primaries: [],
        systemActions: [],
        quickOperations: [],
        overflow: []
    }) : {
        primaries: [
            {
                id: "back_department",
                label: "Back to department",
                variant: "secondary"
            }
        ],
        overflow: [
            {
                id: "open_admin_opportunities",
                label: "All inquiries",
                variant: "secondary"
            }
        ]
    };
    return {
        workspaceLevel: "work_unit",
        workUnitId: input.workUnitId,
        departmentKey: input.departmentKey ?? undefined,
        focusLabel,
        laneKey,
        aiSummary: {
            headline: input.workUnitName.trim() || "Queue",
            aiAwarenessLine: "Grouped by configured status labels from definitions."
        },
        signals: [],
        kpis: [
            {
                id: "wu_count",
                label: "In queue",
                value: String(Math.max(0, input.oq.total ?? 0)),
                lane: "business"
            },
            {
                id: "wu_value",
                label: "Queue value",
                value: valueTotal > 0 ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$ui$2d$v2$2f$formatWorkspaceCurrency$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatWorkspaceUsdGrouped"])(valueTotal) : "—",
                lane: "business"
            },
            {
                id: "wu_oldest",
                label: "Oldest in queue",
                value: oldestAgeLabel,
                lane: "business"
            },
            {
                id: "wu_needs_action",
                label: "Needs action (queue)",
                value: String(Math.max(0, needsActionCount)),
                lane: "business"
            }
        ],
        laneInterpretation: {
            laneStatusLine: `${input.oq.total} in this queue`,
            recommendedActionLine: laneKey.toLowerCase() === "priced_followup" ? "Follow up on offers that have a price and are awaiting a decision." : isAllInquiries ? "Work by status group — move families forward with the next clear step." : "Work the oldest blockers first; use quick actions to move the inquiry forward."
        },
        primaryQueue: queue,
        actionsRail,
        contextRail: {
            title: "About this queue",
            groups: []
        }
    };
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/lib/workspace/rightRailResolvedFromActionsPayload.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
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
"[project]/lib/kpi/surfaceContext.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "workUnitContextFromParts",
    ()=>workUnitContextFromParts
]);
function workUnitContextFromParts(params) {
    return {
        ...params
    };
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/lib/workspace/workspaceRouteParam.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
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
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/lib/workspace/workUnitQueueDerived.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "WORK_UNIT_OTHER_PILL_KEY",
    ()=>WORK_UNIT_OTHER_PILL_KEY,
    "computeUnmappedOverflowCount",
    ()=>computeUnmappedOverflowCount,
    "computeWorkUnitLifecycleCoverage",
    ()=>computeWorkUnitLifecycleCoverage,
    "findAllRecordsQueueKey",
    ()=>findAllRecordsQueueKey,
    "isRowUnmappedForThroughput",
    ()=>isRowUnmappedForThroughput,
    "queueHasStatusFilters",
    ()=>queueHasStatusFilters,
    "reorderSectionsWithAllRecordsFirst",
    ()=>reorderSectionsWithAllRecordsFirst,
    "rowStatusKeyNormalized",
    ()=>rowStatusKeyNormalized,
    "shouldSuppressWorkUnitKpiStrip",
    ()=>shouldSuppressWorkUnitKpiStrip,
    "statusKeysCoveredByThroughputQueues",
    ()=>statusKeysCoveredByThroughputQueues,
    "summarizeUnmappedRowsForDiagnostics",
    ()=>summarizeUnmappedRowsForDiagnostics,
    "workUnitScopeTotalFromSummaries",
    ()=>workUnitScopeTotalFromSummaries
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$ui$2d$v2$2f$queueUiConfig$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/ui-v2/queueUiConfig.ts [app-client] (ecmascript)");
;
const WORK_UNIT_OTHER_PILL_KEY = "__derived_other__";
function queueHasStatusFilters(queue) {
    return (queue.filters ?? []).some((f)=>f.type === "status");
}
function findAllRecordsQueueKey(def, ui) {
    const needsKey = (k)=>k.trim().toLowerCase() === "needs_attention";
    const primary = (ui?.primary_total_queue ?? "").trim();
    if (primary && def.queues.some((q)=>q.key === primary)) {
        return primary;
    }
    for (const q of def.queues){
        if (needsKey(q.key)) continue;
        if (!queueHasStatusFilters(q)) return q.key;
    }
    const first = def.queues.find((q)=>!needsKey(q.key));
    return first?.key ?? null;
}
function statusKeysCoveredByThroughputQueues(def, allRecordsQueueKey) {
    const covered = new Set();
    for (const q of def.queues){
        if (!allRecordsQueueKey || q.key === allRecordsQueueKey) continue;
        if (q.key.trim().toLowerCase() === "needs_attention") continue;
        for (const f of q.filters ?? []){
            if (f.type !== "status" || f.operator !== "in") continue;
            for (const v of f.values ?? []){
                const t = String(v ?? "").trim().toLowerCase();
                if (t) covered.add(t);
            }
        }
    }
    return covered;
}
function workUnitScopeTotalFromSummaries(def, summaries) {
    const ui = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$ui$2d$v2$2f$queueUiConfig$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getQueueUiConfig"])(def);
    const queueKey = findAllRecordsQueueKey(def, ui);
    if (!queueKey) return {
        queueKey: null,
        total: null
    };
    const row = summaries.find((s)=>s.key === queueKey);
    if (!row || row.counts_deferred === true || typeof row.count !== "number") {
        return {
            queueKey,
            total: null
        };
    }
    return {
        queueKey,
        total: Math.max(0, Math.floor(row.count))
    };
}
function computeUnmappedOverflowCount(params) {
    const { summaries, def, allRecordsQueueKey } = params;
    if (!summaries?.length || !allRecordsQueueKey) return null;
    const allRow = summaries.find((s)=>s.key === allRecordsQueueKey);
    if (!allRow || allRow.counts_deferred === true || typeof allRow.count !== "number") return null;
    const allCount = Math.max(0, Math.floor(allRow.count));
    let sumStatusLanes = 0;
    for (const q of def.queues){
        if (q.key === allRecordsQueueKey || q.key.trim().toLowerCase() === "needs_attention") continue;
        if (!queueHasStatusFilters(q)) continue;
        const row = summaries.find((s)=>s.key === q.key);
        if (!row || row.counts_deferred === true || typeof row.count !== "number") return null;
        sumStatusLanes += Math.max(0, Math.floor(row.count));
    }
    return Math.max(0, allCount - sumStatusLanes);
}
function shouldSuppressWorkUnitKpiStrip(params) {
    const { def, ui } = params;
    if (!def || !ui) return false;
    if (ui.layout === "pipeline_with_attention") return true;
    const { throughput } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$ui$2d$v2$2f$queueUiConfig$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["partitionQueueUiSections"])(ui);
    const allKey = findAllRecordsQueueKey(def, ui);
    if (!allKey) return false;
    const statusLanes = def.queues.filter((q)=>q.key !== allKey && q.key.trim().toLowerCase() !== "needs_attention" && queueHasStatusFilters(q));
    return throughput.length > 1 && statusLanes.length >= 1;
}
function reorderSectionsWithAllRecordsFirst(sections, allRecordsQueueKey) {
    if (!allRecordsQueueKey) return sections;
    return sections.map((sec)=>{
        const qs = [
            ...sec.queues
        ];
        const ix = qs.findIndex((q)=>q.key === allRecordsQueueKey);
        if (ix <= 0) return sec;
        const [row] = qs.splice(ix, 1);
        return {
            ...sec,
            queues: [
                row,
                ...qs
            ]
        };
    });
}
function rowStatusKeyNormalized(row) {
    if (typeof row !== "object" || row == null) return null;
    const sk = row.status_key;
    if (typeof sk !== "string") return null;
    const t = sk.trim().toLowerCase();
    return t || null;
}
function isRowUnmappedForThroughput(row, covered) {
    const sk = rowStatusKeyNormalized(row);
    if (!sk) return true;
    return !covered.has(sk);
}
function computeWorkUnitLifecycleCoverage(params) {
    const { summaries, def, allRecordsQueueKey } = params;
    const unmappedCount = computeUnmappedOverflowCount(params);
    if (!summaries?.length || !allRecordsQueueKey) {
        return {
            allRecordsCount: null,
            statusLaneCountSum: null,
            unmappedCount,
            needsAttentionCount: null,
            isComplete: false
        };
    }
    const allRow = summaries.find((s)=>s.key === allRecordsQueueKey);
    const allRecordsCount = allRow && allRow.counts_deferred !== true && typeof allRow.count === "number" ? Math.max(0, Math.floor(allRow.count)) : null;
    const allComplete = Boolean(allRow && allRow.counts_deferred !== true && typeof allRow.count === "number");
    let statusLaneCountSum = 0;
    let statusLanesComplete = true;
    for (const q of def.queues){
        if (q.key === allRecordsQueueKey || q.key.trim().toLowerCase() === "needs_attention") continue;
        if (!queueHasStatusFilters(q)) continue;
        const row = summaries.find((s)=>s.key === q.key);
        if (!row || row.counts_deferred === true || typeof row.count !== "number") {
            statusLanesComplete = false;
            break;
        }
        statusLaneCountSum += Math.max(0, Math.floor(row.count));
    }
    const needsAttentionLaneDefined = def.queues.some((q)=>q.key.trim().toLowerCase() === "needs_attention");
    const naRow = needsAttentionLaneDefined ? summaries.find((s)=>s.key.trim().toLowerCase() === "needs_attention") : undefined;
    const needsAttentionCount = !needsAttentionLaneDefined ? null : naRow && naRow.counts_deferred !== true && typeof naRow.count === "number" ? Math.max(0, Math.floor(naRow.count)) : null;
    let needsAttentionComplete = true;
    if (needsAttentionLaneDefined) {
        if (!naRow || naRow.counts_deferred === true || typeof naRow.count !== "number") {
            needsAttentionComplete = false;
        }
    }
    const unmappedComplete = unmappedCount != null;
    const isComplete = allComplete && statusLanesComplete && unmappedComplete && needsAttentionComplete;
    return {
        allRecordsCount,
        statusLaneCountSum: statusLanesComplete ? statusLaneCountSum : null,
        unmappedCount,
        needsAttentionCount: naRow ? needsAttentionCount : null,
        isComplete
    };
}
function summarizeUnmappedRowsForDiagnostics(rows, covered, limit = 50) {
    const unmapped = rows.filter((r)=>isRowUnmappedForThroughput(r, covered));
    const statusKeyCounts = {};
    let missingStatusKeyCount = 0;
    for (const r of unmapped){
        const sk = rowStatusKeyNormalized(r);
        if (sk == null) missingStatusKeyCount += 1;
        const k = sk ?? "";
        statusKeyCounts[k] = (statusKeyCounts[k] ?? 0) + 1;
    }
    const samples = [];
    let i = 0;
    for (const r of unmapped){
        if (i >= limit) break;
        if (typeof r !== "object" || r == null) continue;
        const o = r;
        const id = typeof o.id === "string" && o.id.trim() ? o.id.trim() : "";
        if (!id) continue;
        const name = typeof o.name === "string" && o.name.trim() ? o.name.trim() : "";
        const title = typeof o.title === "string" && o.title.trim() ? o.title.trim() : "";
        const label = name || title || id;
        const statusKey = rowStatusKeyNormalized(r);
        samples.push({
            id,
            label,
            statusKey
        });
        i += 1;
    }
    return {
        samples,
        truncated: unmapped.length > limit,
        statusKeyCounts,
        missingStatusKeyCount
    };
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/components/admin/workspace/WorkUnitLifecycleCoveragePanel.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "WorkUnitLifecycleCoveragePanel",
    ()=>WorkUnitLifecycleCoveragePanel
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$workUnitQueueDerived$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/workspace/workUnitQueueDerived.ts [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
const SETTINGS_STATUSES_HREF = "/adminV2/settings/statuses";
const SETTINGS_WORK_UNITS_HREF = "/adminV2/settings/work-units";
function WorkUnitLifecycleCoveragePanel({ hasLifecycleThroughput, showOtherPill, coverage, allRecordsQueueKey, selectedQueueKey, queueItems, queueItemsLoading, coveredStatusKeys }) {
    _s();
    const [diagOpen, setDiagOpen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const onAllLane = Boolean(allRecordsQueueKey) && Boolean(selectedQueueKey) && selectedQueueKey === allRecordsQueueKey;
    const diagnostic = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "WorkUnitLifecycleCoveragePanel.useMemo[diagnostic]": ()=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$workUnitQueueDerived$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["summarizeUnmappedRowsForDiagnostics"])(queueItems ?? [], coveredStatusKeys, 40)
    }["WorkUnitLifecycleCoveragePanel.useMemo[diagnostic]"], [
        queueItems,
        coveredStatusKeys
    ]);
    if (!hasLifecycleThroughput) return null;
    const unmappedN = coverage?.unmappedCount;
    const hasUnmappedFromSummaries = coverage?.isComplete === true && typeof unmappedN === "number" && unmappedN > 0 && coverage.allRecordsCount != null;
    const showPanel = showOtherPill || !coverage?.isComplete || hasUnmappedFromSummaries;
    if (!showPanel) return null;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "mt-1.5 min-w-0 border-t border-admin-border/35 pt-2 text-[11px] leading-snug text-alloy-forge/72",
        children: [
            showOtherPill ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "m-0 text-alloy-forge/75",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "font-semibold text-alloy-forge",
                        children: "Other"
                    }, void 0, false, {
                        fileName: "[project]/components/admin/workspace/WorkUnitLifecycleCoveragePanel.tsx",
                        lineNumber: 62,
                        columnNumber: 21
                    }, this),
                    " — records in this work unit whose status is not mapped to any lifecycle/stage bucket in ",
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "font-medium",
                        children: "queue_definition"
                    }, void 0, false, {
                        fileName: "[project]/components/admin/workspace/WorkUnitLifecycleCoveragePanel.tsx",
                        lineNumber: 63,
                        columnNumber: 65
                    }, this),
                    ". This is a ",
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "font-medium",
                        children: "coverage"
                    }, void 0, false, {
                        fileName: "[project]/components/admin/workspace/WorkUnitLifecycleCoveragePanel.tsx",
                        lineNumber: 64,
                        columnNumber: 23
                    }, this),
                    " signal, not a separate queue."
                ]
            }, void 0, true, {
                fileName: "[project]/components/admin/workspace/WorkUnitLifecycleCoveragePanel.tsx",
                lineNumber: 61,
                columnNumber: 17
            }, this) : null,
            !coverage?.isComplete && hasLifecycleThroughput ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "m-0 mt-1.5 text-alloy-forge/55",
                children: "Loading queue counts… coverage check unavailable until summaries settle."
            }, void 0, false, {
                fileName: "[project]/components/admin/workspace/WorkUnitLifecycleCoveragePanel.tsx",
                lineNumber: 69,
                columnNumber: 17
            }, this) : null,
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: showOtherPill || hasUnmappedFromSummaries ? "mt-2 border-t border-admin-border/25 pt-2" : "",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        type: "button",
                        className: "flex w-full items-center justify-between gap-2 text-left text-[11px] font-medium text-alloy-forge/60 hover:text-alloy-forge/85",
                        onClick: ()=>setDiagOpen((o)=>!o),
                        "aria-expanded": diagOpen,
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                children: "Admin / diagnostics"
                            }, void 0, false, {
                                fileName: "[project]/components/admin/workspace/WorkUnitLifecycleCoveragePanel.tsx",
                                lineNumber: 79,
                                columnNumber: 21
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "tabular-nums text-alloy-forge/45",
                                children: diagOpen ? "−" : "+"
                            }, void 0, false, {
                                fileName: "[project]/components/admin/workspace/WorkUnitLifecycleCoveragePanel.tsx",
                                lineNumber: 80,
                                columnNumber: 21
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/admin/workspace/WorkUnitLifecycleCoveragePanel.tsx",
                        lineNumber: 73,
                        columnNumber: 17
                    }, this),
                    diagOpen ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "mt-2 space-y-2 text-alloy-forge/80",
                        children: [
                            hasUnmappedFromSummaries ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: "m-0 text-[10px] leading-snug text-alloy-forge/58",
                                children: [
                                    "Summaries show",
                                    " ",
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "tabular-nums font-medium text-alloy-forge/72",
                                        children: unmappedN
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/workspace/WorkUnitLifecycleCoveragePanel.tsx",
                                        lineNumber: 87,
                                        columnNumber: 33
                                    }, this),
                                    " record",
                                    unmappedN === 1 ? "" : "s",
                                    " in the all-records lane outside mapped stage/status filters — a configuration/data topic, not a UI fault. Adjust in",
                                    " ",
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                                        href: SETTINGS_WORK_UNITS_HREF,
                                        className: "font-medium text-alloy-blue hover:underline",
                                        children: "Settings → Work units"
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/workspace/WorkUnitLifecycleCoveragePanel.tsx",
                                        lineNumber: 90,
                                        columnNumber: 33
                                    }, this),
                                    " ",
                                    "and/or",
                                    " ",
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                                        href: SETTINGS_STATUSES_HREF,
                                        className: "font-medium text-alloy-blue hover:underline",
                                        children: "Settings → Statuses"
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/workspace/WorkUnitLifecycleCoveragePanel.tsx",
                                        lineNumber: 94,
                                        columnNumber: 33
                                    }, this),
                                    "."
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/admin/workspace/WorkUnitLifecycleCoveragePanel.tsx",
                                lineNumber: 85,
                                columnNumber: 29
                            }, this) : null,
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: "m-0 text-[10px] text-alloy-forge/52",
                                children: [
                                    "Sample from the",
                                    " ",
                                    onAllLane ? "current page of the all-records lane" : "current list (switch to All records for a broader sample)",
                                    ".",
                                    queueItemsLoading ? " Loading…" : ""
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/admin/workspace/WorkUnitLifecycleCoveragePanel.tsx",
                                lineNumber: 100,
                                columnNumber: 25
                            }, this),
                            diagnostic.samples.length === 0 && !queueItemsLoading ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: "m-0 text-alloy-forge/58",
                                children: "No unmapped rows in this sample."
                            }, void 0, false, {
                                fileName: "[project]/components/admin/workspace/WorkUnitLifecycleCoveragePanel.tsx",
                                lineNumber: 108,
                                columnNumber: 29
                            }, this) : null,
                            Object.keys(diagnostic.statusKeyCounts).length > 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "m-0 mb-1 text-[10px] font-semibold tracking-wide text-alloy-forge/48",
                                        children: "Unmapped status keys (this sample)"
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/workspace/WorkUnitLifecycleCoveragePanel.tsx",
                                        lineNumber: 112,
                                        columnNumber: 33
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                                        className: "m-0 list-none space-y-0.5 p-0",
                                        children: Object.entries(diagnostic.statusKeyCounts).sort((a, b)=>b[1] - a[1]).map(([k, n])=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                                className: "tabular-nums",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("code", {
                                                        className: "rounded bg-alloy-stone/15 px-1",
                                                        children: k || "(empty)"
                                                    }, void 0, false, {
                                                        fileName: "[project]/components/admin/workspace/WorkUnitLifecycleCoveragePanel.tsx",
                                                        lineNumber: 120,
                                                        columnNumber: 49
                                                    }, this),
                                                    " — ",
                                                    n
                                                ]
                                            }, k, true, {
                                                fileName: "[project]/components/admin/workspace/WorkUnitLifecycleCoveragePanel.tsx",
                                                lineNumber: 119,
                                                columnNumber: 45
                                            }, this))
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/workspace/WorkUnitLifecycleCoveragePanel.tsx",
                                        lineNumber: 115,
                                        columnNumber: 33
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/admin/workspace/WorkUnitLifecycleCoveragePanel.tsx",
                                lineNumber: 111,
                                columnNumber: 29
                            }, this) : null,
                            diagnostic.missingStatusKeyCount > 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: "m-0 tabular-nums",
                                children: [
                                    "Rows with missing ",
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("code", {
                                        className: "rounded bg-alloy-stone/15 px-1",
                                        children: "status_key"
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/workspace/WorkUnitLifecycleCoveragePanel.tsx",
                                        lineNumber: 128,
                                        columnNumber: 51
                                    }, this),
                                    ":",
                                    " ",
                                    diagnostic.missingStatusKeyCount
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/admin/workspace/WorkUnitLifecycleCoveragePanel.tsx",
                                lineNumber: 127,
                                columnNumber: 29
                            }, this) : null,
                            diagnostic.samples.length > 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "max-h-48 overflow-auto rounded border border-admin-border/50 bg-white/50",
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("table", {
                                    className: "w-full border-collapse text-left text-[10px]",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("thead", {
                                            className: "sticky top-0 bg-alloy-stone/10",
                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("tr", {
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("th", {
                                                        className: "border-b border-admin-border/40 px-1.5 py-1 font-semibold",
                                                        children: "Label"
                                                    }, void 0, false, {
                                                        fileName: "[project]/components/admin/workspace/WorkUnitLifecycleCoveragePanel.tsx",
                                                        lineNumber: 137,
                                                        columnNumber: 45
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("th", {
                                                        className: "border-b border-admin-border/40 px-1.5 py-1 font-semibold",
                                                        children: "id"
                                                    }, void 0, false, {
                                                        fileName: "[project]/components/admin/workspace/WorkUnitLifecycleCoveragePanel.tsx",
                                                        lineNumber: 138,
                                                        columnNumber: 45
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("th", {
                                                        className: "border-b border-admin-border/40 px-1.5 py-1 font-semibold",
                                                        children: "status_key"
                                                    }, void 0, false, {
                                                        fileName: "[project]/components/admin/workspace/WorkUnitLifecycleCoveragePanel.tsx",
                                                        lineNumber: 139,
                                                        columnNumber: 45
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/components/admin/workspace/WorkUnitLifecycleCoveragePanel.tsx",
                                                lineNumber: 136,
                                                columnNumber: 41
                                            }, this)
                                        }, void 0, false, {
                                            fileName: "[project]/components/admin/workspace/WorkUnitLifecycleCoveragePanel.tsx",
                                            lineNumber: 135,
                                            columnNumber: 37
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("tbody", {
                                            children: diagnostic.samples.map((r)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("tr", {
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("td", {
                                                            className: "border-b border-admin-border/30 px-1.5 py-1",
                                                            children: r.label
                                                        }, void 0, false, {
                                                            fileName: "[project]/components/admin/workspace/WorkUnitLifecycleCoveragePanel.tsx",
                                                            lineNumber: 145,
                                                            columnNumber: 49
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("td", {
                                                            className: "border-b border-admin-border/30 px-1.5 py-1 font-mono text-alloy-forge/70",
                                                            children: r.id
                                                        }, void 0, false, {
                                                            fileName: "[project]/components/admin/workspace/WorkUnitLifecycleCoveragePanel.tsx",
                                                            lineNumber: 146,
                                                            columnNumber: 49
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("td", {
                                                            className: "border-b border-admin-border/30 px-1.5 py-1 font-mono",
                                                            children: r.statusKey ?? "—"
                                                        }, void 0, false, {
                                                            fileName: "[project]/components/admin/workspace/WorkUnitLifecycleCoveragePanel.tsx",
                                                            lineNumber: 149,
                                                            columnNumber: 49
                                                        }, this)
                                                    ]
                                                }, r.id, true, {
                                                    fileName: "[project]/components/admin/workspace/WorkUnitLifecycleCoveragePanel.tsx",
                                                    lineNumber: 144,
                                                    columnNumber: 45
                                                }, this))
                                        }, void 0, false, {
                                            fileName: "[project]/components/admin/workspace/WorkUnitLifecycleCoveragePanel.tsx",
                                            lineNumber: 142,
                                            columnNumber: 37
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/components/admin/workspace/WorkUnitLifecycleCoveragePanel.tsx",
                                    lineNumber: 134,
                                    columnNumber: 33
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/components/admin/workspace/WorkUnitLifecycleCoveragePanel.tsx",
                                lineNumber: 133,
                                columnNumber: 29
                            }, this) : null,
                            diagnostic.truncated ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: "m-0 text-[10px] text-alloy-forge/52",
                                children: "Table truncated for display; not all rows shown."
                            }, void 0, false, {
                                fileName: "[project]/components/admin/workspace/WorkUnitLifecycleCoveragePanel.tsx",
                                lineNumber: 159,
                                columnNumber: 29
                            }, this) : null
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/admin/workspace/WorkUnitLifecycleCoveragePanel.tsx",
                        lineNumber: 83,
                        columnNumber: 21
                    }, this) : null
                ]
            }, void 0, true, {
                fileName: "[project]/components/admin/workspace/WorkUnitLifecycleCoveragePanel.tsx",
                lineNumber: 72,
                columnNumber: 13
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/components/admin/workspace/WorkUnitLifecycleCoveragePanel.tsx",
        lineNumber: 59,
        columnNumber: 9
    }, this);
}
_s(WorkUnitLifecycleCoveragePanel, "8hTVX2hkY31piTBoYtgZiKhUZzE=");
_c = WorkUnitLifecycleCoveragePanel;
var _c;
__turbopack_context__.k.register(_c, "WorkUnitLifecycleCoveragePanel");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>AdminV2OpportunityWorkUnitPage
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/navigation.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$workspace$2f$WorkspaceChrome$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/components/admin/workspace/WorkspaceChrome.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$workspace$2f$shells$2f$WorkUnitWorkspace$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/adminV2/components/workspace/shells/WorkUnitWorkspace.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$workspace$2f$blocks$2f$AutomationWorkflowsBlock$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$contexts$2f$AdminDrawerContext$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/contexts/AdminDrawerContext.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$contexts$2f$AdminViewerTimezoneContext$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/contexts/AdminViewerTimezoneContext.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$workspace$2f$AdminV2RouteLoadingState$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/components/admin/workspace/AdminV2RouteLoadingState.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$actions$2f$applyRegistryResolvedActionClient$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/actions/applyRegistryResolvedActionClient.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$viewModels$2f$enrollmentRightRailMerge$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/workspace/viewModels/enrollmentRightRailMerge.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$recordChrome$2f$executeOpportunityRecordAction$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/recordChrome/executeOpportunityRecordAction.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$ui$2d$v2$2f$adapters$2f$realWorkUnitFromOpportunities$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/ui-v2/adapters/realWorkUnitFromOpportunities.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$ui$2d$v2$2f$crmQueueRowPreviewPresentation$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/ui-v2/crmQueueRowPreviewPresentation.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$rightRailResolvedFromActionsPayload$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/workspace/rightRailResolvedFromActionsPayload.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$workspaceDataFetch$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/workspace/workspaceDataFetch.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$kpi$2f$resolver$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/kpi/resolver.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$kpi$2f$baseline$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/kpi/baseline.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$kpi$2f$surfaceContext$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/kpi/surfaceContext.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$workspaceRouteParam$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/workspace/workspaceRouteParam.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$config$2f$queueDefinitionSchema$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/config/queueDefinitionSchema.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$ui$2d$v2$2f$queueUiConfig$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/ui-v2/queueUiConfig.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$workspaceAdminFetchDedupe$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/workspace/workspaceAdminFetchDedupe.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$opportunity$2f$actions$2f$UpdateStatusAddNoteModal$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/components/admin/opportunity/actions/UpdateStatusAddNoteModal.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$opportunity$2f$actions$2f$ContactAttemptedModal$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/components/admin/opportunity/actions/ContactAttemptedModal.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$activitySignals$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/activitySignals.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminFormatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/adminFormatters.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$opportunityActivityTimelineFormat$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/lib/admin/opportunityActivityTimelineFormat.ts [app-client] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$contactNormalize$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/contactNormalize.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$workspace$2f$WorkUnitLifecycleCoveragePanel$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/components/admin/workspace/WorkUnitLifecycleCoveragePanel.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$workUnitQueueDerived$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/workspace/workUnitQueueDerived.ts [app-client] (ecmascript)");
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
;
;
;
;
const WORKSPACE_BASE = "/adminV2/workspace";
function queueParamFromWindow() {
    if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
    ;
    try {
        return new URL(window.location.href).searchParams.get("queue")?.trim() ?? "";
    } catch  {
        return "";
    }
}
/** Lane selection from definition + URL only — before exact summaries (Phase 3.1). */ function resolveProvisionalQueueKey(wu, qFromUrl) {
    if (!wu.queue_definition) {
        const q = qFromUrl.trim();
        return q || null;
    }
    try {
        const def = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$config$2f$queueDefinitionSchema$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["validateQueueDefinition"])(wu.queue_definition);
        const ui = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$ui$2d$v2$2f$queueUiConfig$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getQueueUiConfig"])(def);
        const keys = new Set(def.queues.map((q)=>q.key));
        const qTrim = qFromUrl.trim();
        if (qTrim && keys.has(qTrim)) return qTrim;
        const allKey = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$workUnitQueueDerived$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["findAllRecordsQueueKey"])(def, ui);
        if (allKey && keys.has(allKey)) return allKey;
        const uiOrder = ui.sections.flatMap((s)=>s.queue_keys);
        return uiOrder.find((k)=>keys.has(k)) ?? def.queues[0]?.key ?? null;
    } catch  {
        const q = qFromUrl.trim();
        return q || null;
    }
}
function registryQuickActionsFromResolved(rowInline) {
    return rowInline.map((a)=>({
            id: a.key,
            label: a.label,
            payload: {
                source: "action_registry",
                actionType: a.action_type
            }
        }));
}
function queueItemPayloadHasId(r) {
    return typeof r === "object" && r != null && typeof r.id === "string" && String(r.id).trim() !== "";
}
/** Queue definitions may carry admin-only notes tagged "(internal)" — hide from the work-unit header. */ function isOperatorFacingQueueSummaryDescription(description) {
    return !/\(internal\)/i.test(description.trim());
}
const DEFAULT_WF_KPIS = {
    runs_today: 0,
    runs_last_7d: 0,
    successful_last_7d: 0,
    failed_last_7d: 0,
    running_last_7d: 0,
    skipped_last_7d: 0,
    success_rate_last_7d: null
};
function isRowPreviewFieldEnabled(fields, f) {
    return fields.includes(f);
}
function parseQueueRowCrmChildren(raw) {
    if (!Array.isArray(raw)) return [];
    const out = [];
    for (const x of raw){
        if (x === null || typeof x !== "object") continue;
        const o = x;
        const primary = typeof o.primary === "string" ? o.primary.trim() : typeof o.line === "string" ? o.line.trim() : "";
        if (!primary) continue;
        const secondary = typeof o.secondary === "string" ? o.secondary.trim() : typeof o.detail === "string" ? o.detail.trim() : null;
        out.push({
            primary,
            secondary: secondary || null
        });
    }
    return out;
}
function AdminV2OpportunityWorkUnitPage() {
    _s();
    const params = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useParams"])();
    const departmentId = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$workspaceRouteParam$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["workspaceRouteParam"])(params.departmentId);
    const workUnitId = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$workspaceRouteParam$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["workspaceRouteParam"])(params.workUnitId);
    const searchParams = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useSearchParams"])();
    const router = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRouter"])();
    const { openDrawer } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$contexts$2f$AdminDrawerContext$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAdminDrawer"])();
    const viewerTz = (0, __TURBOPACK__imported__module__$5b$project$5d2f$contexts$2f$AdminViewerTimezoneContext$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAdminViewerTimezone"])();
    const [loading, setLoading] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(true);
    const [error, setError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [workUnit, setWorkUnit] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [dept, setDept] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [oq, setOq] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [needsAttentionWorkUnitId, setNeedsAttentionWorkUnitId] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [opportunityQueueRowActions, setOpportunityQueueRowActions] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [opportunityQueueRowResolved, setOpportunityQueueRowResolved] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [enrollmentRightRailResolved, setEnrollmentRightRailResolved] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [actionFeedback, setActionFeedback] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [queueSummaries, setQueueSummaries] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [queueSummariesError, setQueueSummariesError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [queueSummariesRoute, setQueueSummariesRoute] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [selectedQueueKey, setSelectedQueueKey] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [queueItems, setQueueItems] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [queueItemsError, setQueueItemsError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [queueItemsRoute, setQueueItemsRoute] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [queueItemsLoading, setQueueItemsLoading] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [wuPrimaryLaneTimedOut, setWuPrimaryLaneTimedOut] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    /** `undefined` = placement config not loaded → baseline strip; values are derived in `wuResolvedPlacementKpis`. */ const [wuPlacementRows, setWuPlacementRows] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(undefined);
    const [wuScopeHasPlacements, setWuScopeHasPlacements] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const queueItemsRequestSeq = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(0);
    const queueSummariesRequestSeq = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(0);
    /**
     * Skips redundant queue-item GETs when only `queueSummaries` reference changes while work unit,
     * selected tab, and omit-total semantics are unchanged — same URL as last fetch.
     * Cleared on work-unit navigation; bypass with fetchQueueItems(..., { force: true }) for invalidation.
     */ const queueItemsLastFetchSigRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const [workflowKpis, setWorkflowKpis] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(DEFAULT_WF_KPIS);
    const [workflowKpisLoading, setWorkflowKpisLoading] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(true);
    const [workflowsSummary, setWorkflowsSummary] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [statusOptions, setStatusOptions] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])([]);
    const [updateStatusFormOpen, setUpdateStatusFormOpen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [updateStatusTargetId, setUpdateStatusTargetId] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [contactAttemptedOpen, setContactAttemptedOpen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [contactAttemptedTargetId, setContactAttemptedTargetId] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const queueDef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "AdminV2OpportunityWorkUnitPage.useMemo[queueDef]": ()=>{
            if (!workUnit?.queue_definition) return null;
            try {
                return (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$config$2f$queueDefinitionSchema$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["validateQueueDefinition"])(workUnit.queue_definition);
            } catch  {
                return null;
            }
        }
    }["AdminV2OpportunityWorkUnitPage.useMemo[queueDef]"], [
        workUnit?.queue_definition
    ]);
    const queueUi = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "AdminV2OpportunityWorkUnitPage.useMemo[queueUi]": ()=>{
            if (!queueDef) return null;
            return (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$ui$2d$v2$2f$queueUiConfig$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getQueueUiConfig"])(queueDef);
        }
    }["AdminV2OpportunityWorkUnitPage.useMemo[queueUi]"], [
        queueDef
    ]);
    const sectionedQueueSummaries = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "AdminV2OpportunityWorkUnitPage.useMemo[sectionedQueueSummaries]": ()=>{
            if (!queueSummaries) return null;
            if (!queueUi) {
                // fallback to existing flat list; but still deterministic
                return [
                    {
                        key: "all",
                        label: "Queues",
                        tone: "standard",
                        queues: queueSummaries
                    }
                ];
            }
            const byKey = new Map(queueSummaries.map({
                "AdminV2OpportunityWorkUnitPage.useMemo[sectionedQueueSummaries]": (q)=>[
                        q.key,
                        q
                    ]
            }["AdminV2OpportunityWorkUnitPage.useMemo[sectionedQueueSummaries]"]));
            const used = new Set();
            const sections = queueUi.sections.map({
                "AdminV2OpportunityWorkUnitPage.useMemo[sectionedQueueSummaries].sections": (s)=>{
                    const qs = s.queue_keys.map({
                        "AdminV2OpportunityWorkUnitPage.useMemo[sectionedQueueSummaries].sections.qs": (k)=>byKey.get(k) ?? null
                    }["AdminV2OpportunityWorkUnitPage.useMemo[sectionedQueueSummaries].sections.qs"]).filter({
                        "AdminV2OpportunityWorkUnitPage.useMemo[sectionedQueueSummaries].sections.qs": (x)=>Boolean(x)
                    }["AdminV2OpportunityWorkUnitPage.useMemo[sectionedQueueSummaries].sections.qs"]);
                    for (const q of qs)used.add(q.key);
                    return {
                        key: s.key,
                        label: s.label,
                        tone: s.tone ?? "standard",
                        queues: qs
                    };
                }
            }["AdminV2OpportunityWorkUnitPage.useMemo[sectionedQueueSummaries].sections"]).filter({
                "AdminV2OpportunityWorkUnitPage.useMemo[sectionedQueueSummaries].sections": (s)=>s.queues.length > 0
            }["AdminV2OpportunityWorkUnitPage.useMemo[sectionedQueueSummaries].sections"]);
            if (sections.length > 0) return sections;
            // If config sections don't match summaries, fall back to all queues.
            return [
                {
                    key: "all",
                    label: "Queues",
                    tone: "standard",
                    queues: queueSummaries
                }
            ];
        }
    }["AdminV2OpportunityWorkUnitPage.useMemo[sectionedQueueSummaries]"], [
        queueSummaries,
        queueUi
    ]);
    const allRecordsQueueKey = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "AdminV2OpportunityWorkUnitPage.useMemo[allRecordsQueueKey]": ()=>{
            if (!queueDef) return null;
            return (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$workUnitQueueDerived$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["findAllRecordsQueueKey"])(queueDef, queueUi);
        }
    }["AdminV2OpportunityWorkUnitPage.useMemo[allRecordsQueueKey]"], [
        queueDef,
        queueUi
    ]);
    const sectionedQueueSummariesOrdered = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "AdminV2OpportunityWorkUnitPage.useMemo[sectionedQueueSummariesOrdered]": ()=>{
            if (!sectionedQueueSummaries) return null;
            return (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$workUnitQueueDerived$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["reorderSectionsWithAllRecordsFirst"])(sectionedQueueSummaries, allRecordsQueueKey);
        }
    }["AdminV2OpportunityWorkUnitPage.useMemo[sectionedQueueSummariesOrdered]"], [
        sectionedQueueSummaries,
        allRecordsQueueKey
    ]);
    /** Tab shells from definition only (no counts) while exact summaries are in flight. */ const queueTabPlaceholders = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "AdminV2OpportunityWorkUnitPage.useMemo[queueTabPlaceholders]": ()=>{
            if (!queueUi || !queueDef) return null;
            const keySet = new Set(queueDef.queues.map({
                "AdminV2OpportunityWorkUnitPage.useMemo[queueTabPlaceholders]": (q)=>q.key
            }["AdminV2OpportunityWorkUnitPage.useMemo[queueTabPlaceholders]"]));
            const sections = queueUi.sections.map({
                "AdminV2OpportunityWorkUnitPage.useMemo[queueTabPlaceholders].sections": (s)=>({
                        key: s.key,
                        label: s.label,
                        tone: s.tone ?? "standard",
                        queues: s.queue_keys.filter({
                            "AdminV2OpportunityWorkUnitPage.useMemo[queueTabPlaceholders].sections": (k)=>keySet.has(k)
                        }["AdminV2OpportunityWorkUnitPage.useMemo[queueTabPlaceholders].sections"]).map({
                            "AdminV2OpportunityWorkUnitPage.useMemo[queueTabPlaceholders].sections": (k)=>{
                                const qc = queueDef.queues.find({
                                    "AdminV2OpportunityWorkUnitPage.useMemo[queueTabPlaceholders].sections.qc": (q)=>q.key === k
                                }["AdminV2OpportunityWorkUnitPage.useMemo[queueTabPlaceholders].sections.qc"]);
                                if (!qc) return null;
                                return {
                                    key: qc.key,
                                    label: qc.label,
                                    priority: qc.priority ?? "standard"
                                };
                            }
                        }["AdminV2OpportunityWorkUnitPage.useMemo[queueTabPlaceholders].sections"]).filter({
                            "AdminV2OpportunityWorkUnitPage.useMemo[queueTabPlaceholders].sections": (q)=>q != null
                        }["AdminV2OpportunityWorkUnitPage.useMemo[queueTabPlaceholders].sections"])
                    })
            }["AdminV2OpportunityWorkUnitPage.useMemo[queueTabPlaceholders].sections"]).filter({
                "AdminV2OpportunityWorkUnitPage.useMemo[queueTabPlaceholders].sections": (s)=>s.queues.length > 0
            }["AdminV2OpportunityWorkUnitPage.useMemo[queueTabPlaceholders].sections"]);
            if (!sections.length) return null;
            return (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$workUnitQueueDerived$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["reorderSectionsWithAllRecordsFirst"])(sections, allRecordsQueueKey);
        }
    }["AdminV2OpportunityWorkUnitPage.useMemo[queueTabPlaceholders]"], [
        queueUi,
        queueDef,
        allRecordsQueueKey
    ]);
    const coveredThroughputStatusKeys = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "AdminV2OpportunityWorkUnitPage.useMemo[coveredThroughputStatusKeys]": ()=>{
            if (!queueDef) return new Set();
            return (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$workUnitQueueDerived$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["statusKeysCoveredByThroughputQueues"])(queueDef, allRecordsQueueKey);
        }
    }["AdminV2OpportunityWorkUnitPage.useMemo[coveredThroughputStatusKeys]"], [
        queueDef,
        allRecordsQueueKey
    ]);
    const unmappedPillCount = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "AdminV2OpportunityWorkUnitPage.useMemo[unmappedPillCount]": ()=>{
            if (!queueDef || !queueSummaries) return null;
            return (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$workUnitQueueDerived$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["computeUnmappedOverflowCount"])({
                summaries: queueSummaries,
                def: queueDef,
                allRecordsQueueKey
            });
        }
    }["AdminV2OpportunityWorkUnitPage.useMemo[unmappedPillCount]"], [
        queueDef,
        queueSummaries,
        allRecordsQueueKey
    ]);
    const suppressWorkUnitKpiStrip = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "AdminV2OpportunityWorkUnitPage.useMemo[suppressWorkUnitKpiStrip]": ()=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$workUnitQueueDerived$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["shouldSuppressWorkUnitKpiStrip"])({
                def: queueDef,
                ui: queueUi
            })
    }["AdminV2OpportunityWorkUnitPage.useMemo[suppressWorkUnitKpiStrip]"], [
        queueDef,
        queueUi
    ]);
    const otherPillSectionKey = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "AdminV2OpportunityWorkUnitPage.useMemo[otherPillSectionKey]": ()=>{
            if (!queueUi) return null;
            const { throughput } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$ui$2d$v2$2f$queueUiConfig$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["partitionQueueUiSections"])(queueUi);
            if (!throughput.length) return null;
            return throughput[throughput.length - 1].key;
        }
    }["AdminV2OpportunityWorkUnitPage.useMemo[otherPillSectionKey]"], [
        queueUi
    ]);
    const hasLifecycleThroughput = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "AdminV2OpportunityWorkUnitPage.useMemo[hasLifecycleThroughput]": ()=>{
            if (!queueDef || !allRecordsQueueKey) return false;
            return queueDef.queues.some({
                "AdminV2OpportunityWorkUnitPage.useMemo[hasLifecycleThroughput]": (q)=>q.key !== allRecordsQueueKey && q.key.trim().toLowerCase() !== "needs_attention" && (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$workUnitQueueDerived$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["queueHasStatusFilters"])(q)
            }["AdminV2OpportunityWorkUnitPage.useMemo[hasLifecycleThroughput]"]);
        }
    }["AdminV2OpportunityWorkUnitPage.useMemo[hasLifecycleThroughput]"], [
        queueDef,
        allRecordsQueueKey
    ]);
    const lifecycleCoverage = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "AdminV2OpportunityWorkUnitPage.useMemo[lifecycleCoverage]": ()=>{
            if (!queueDef || !queueSummaries) return null;
            return (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$workUnitQueueDerived$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["computeWorkUnitLifecycleCoverage"])({
                summaries: queueSummaries,
                def: queueDef,
                allRecordsQueueKey
            });
        }
    }["AdminV2OpportunityWorkUnitPage.useMemo[lifecycleCoverage]"], [
        queueDef,
        queueSummaries,
        allRecordsQueueKey
    ]);
    const unmappedOnly = (searchParams?.get("unmapped") ?? "").trim() === "1";
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "AdminV2OpportunityWorkUnitPage.useEffect": ()=>{
            if (!actionFeedback) return;
            const t = setTimeout({
                "AdminV2OpportunityWorkUnitPage.useEffect.t": ()=>setActionFeedback(null)
            }["AdminV2OpportunityWorkUnitPage.useEffect.t"], 10000);
            return ({
                "AdminV2OpportunityWorkUnitPage.useEffect": ()=>clearTimeout(t)
            })["AdminV2OpportunityWorkUnitPage.useEffect"];
        }
    }["AdminV2OpportunityWorkUnitPage.useEffect"], [
        actionFeedback
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "AdminV2OpportunityWorkUnitPage.useEffect": ()=>{
            if (!departmentId || !workUnitId) {
                setLoading(false);
                setWorkUnit(null);
                setDept(null);
                setOq(null);
                setNeedsAttentionWorkUnitId(null);
                setQueueSummaries(null);
                setQueueSummariesError(null);
                setQueueSummariesRoute(null);
                setSelectedQueueKey(null);
                setQueueItems(null);
                setQueueItemsError(null);
                setQueueItemsRoute(null);
                setQueueItemsLoading(false);
                setOpportunityQueueRowActions(null);
                setEnrollmentRightRailResolved(null);
                setWuPlacementRows(undefined);
                setWuScopeHasPlacements(false);
                setError("Missing department or work unit in the URL.");
                queueItemsLastFetchSigRef.current = null;
                return;
            }
            let cancelled = false;
            void ({
                "AdminV2OpportunityWorkUnitPage.useEffect": async ()=>{
                    const routeStart = typeof performance !== "undefined" ? performance.now() : 0;
                    setLoading(true);
                    setError(null);
                    const init = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$workspaceDataFetch$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["workspaceDataFetchInit"])();
                    try {
                        if (!cancelled) {
                            setWorkUnit(null);
                            setDept(null);
                            setOq(null);
                            setNeedsAttentionWorkUnitId(null);
                            setQueueSummaries(null);
                            setQueueSummariesError(null);
                            setQueueSummariesRoute(null);
                            setSelectedQueueKey(null);
                            setQueueItems(null);
                            setQueueItemsError(null);
                            setQueueItemsRoute(null);
                            setQueueItemsLoading(false);
                            setOpportunityQueueRowActions(null);
                            setEnrollmentRightRailResolved(null);
                            queueItemsLastFetchSigRef.current = null;
                            setWuPlacementRows(undefined);
                            setWuScopeHasPlacements(false);
                        }
                        const [wuRes, deptRes, deptWusRes] = await Promise.all([
                            fetch(`/api/admin/work-units/${encodeURIComponent(workUnitId)}`, init),
                            fetch(`/api/admin/departments/${encodeURIComponent(departmentId)}`, init),
                            fetch(`/api/admin/work-units?department_id=${encodeURIComponent(departmentId)}`, init)
                        ]);
                        const [wuJson, deptJson, deptWusJson] = await Promise.all([
                            wuRes.json().catch({
                                "AdminV2OpportunityWorkUnitPage.useEffect": ()=>({})
                            }["AdminV2OpportunityWorkUnitPage.useEffect"]),
                            deptRes.json().catch({
                                "AdminV2OpportunityWorkUnitPage.useEffect": ()=>({})
                            }["AdminV2OpportunityWorkUnitPage.useEffect"]),
                            deptWusRes.json().catch({
                                "AdminV2OpportunityWorkUnitPage.useEffect": ()=>({})
                            }["AdminV2OpportunityWorkUnitPage.useEffect"])
                        ]);
                        if (!wuRes.ok) throw new Error(wuJson.error ?? "Failed to load work unit");
                        if (!deptRes.ok) throw new Error(deptJson.error ?? "Failed to load department");
                        const wu = wuJson;
                        if (wu.department_id !== departmentId) {
                            throw new Error("Work unit does not belong to this department");
                        }
                        const naListEarly = deptWusRes.ok ? deptWusJson.items ?? [] : [];
                        const naWuEarly = naListEarly.find({
                            "AdminV2OpportunityWorkUnitPage.useEffect.naWuEarly": (r)=>String(r.key ?? "").trim().toLowerCase() === "needs_attention"
                        }["AdminV2OpportunityWorkUnitPage.useEffect.naWuEarly"]);
                        if (!cancelled) {
                            setWorkUnit(wu);
                            setDept(deptJson);
                            setNeedsAttentionWorkUnitId(naWuEarly?.id ?? null);
                        }
                        const qFromUrlEarly = queueParamFromWindow();
                        const provisionalKey = resolveProvisionalQueueKey(wu, qFromUrlEarly);
                        if (!cancelled) {
                            if (provisionalKey) setSelectedQueueKey(provisionalKey);
                            setLoading(false);
                            if ("TURBOPACK compile-time truthy", 1) {
                                console.log("[wu-load-phase]", {
                                    phase: "first_paint",
                                    duration_ms: Math.round(performance.now() - routeStart)
                                });
                            }
                        }
                        const isAttention = (wu.key ?? "").trim().toLowerCase() === "needs_attention";
                        // Prefer the new QueueService-backed queues. Only fall back to legacy opportunity runtime on 501 or
                        // network/runtime failures that indicate the new queue API isn't usable.
                        let usedNewQueueApi = false;
                        let shouldFallbackToLegacy = false;
                        let fallbackReason = null;
                        const queueListRoute = `/api/admin/work-units/${encodeURIComponent(workUnitId)}/queues?include_previews=false&count_mode=exact&limit=3`;
                        const actionsListRoute = `/api/admin/actions?` + new URLSearchParams({
                            surface: "queue_row",
                            entity_type: "opportunity",
                            work_unit_id: workUnitId,
                            department_id: departmentId
                        }).toString();
                        const rightRailActionsRoute = `/api/admin/actions?` + new URLSearchParams({
                            surface: "right_rail",
                            entity_type: "opportunity",
                            work_unit_id: workUnitId,
                            department_id: departmentId
                        }).toString();
                        let parsedQueueRowQuick = null;
                        let parsedRightRail = [];
                        const [queuesSettled, actionsSettled, rightRailSettled] = await Promise.allSettled([
                            fetch(queueListRoute, init),
                            (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$workspaceAdminFetchDedupe$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["dedupeAdminFetchWithTtl"])(actionsListRoute, init, 1500),
                            (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$workspaceAdminFetchDedupe$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["dedupeAdminFetchWithTtl"])(rightRailActionsRoute, init, 1500)
                        ]);
                        if (actionsSettled.status === "fulfilled") {
                            try {
                                const ar = actionsSettled.value;
                                const aj = await ar.json().catch({
                                    "AdminV2OpportunityWorkUnitPage.useEffect": ()=>({})
                                }["AdminV2OpportunityWorkUnitPage.useEffect"]);
                                if (ar.ok) {
                                    const rowInline = aj.actions?.row_inline ?? [];
                                    const overflow = aj.actions?.overflow ?? [];
                                    const combined = [
                                        ...rowInline,
                                        ...overflow
                                    ];
                                    if (!cancelled) setOpportunityQueueRowResolved(combined);
                                    if (combined.length) parsedQueueRowQuick = registryQuickActionsFromResolved(combined);
                                }
                            } catch  {
                            /* non-fatal */ }
                        }
                        if (rightRailSettled.status === "fulfilled") {
                            try {
                                const ar = rightRailSettled.value;
                                const aj = await ar.json().catch({
                                    "AdminV2OpportunityWorkUnitPage.useEffect": ()=>({})
                                }["AdminV2OpportunityWorkUnitPage.useEffect"]);
                                if (ar.ok) {
                                    parsedRightRail = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$rightRailResolvedFromActionsPayload$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["rightRailResolvedFromActionsPayload"])(aj.actions);
                                }
                            } catch  {
                            /* non-fatal */ }
                        }
                        if (queuesSettled.status === "fulfilled") {
                            try {
                                const res = queuesSettled.value;
                                const j = await res.json().catch({
                                    "AdminV2OpportunityWorkUnitPage.useEffect": ()=>({})
                                }["AdminV2OpportunityWorkUnitPage.useEffect"]);
                                const route = queueListRoute;
                                if (res.ok) {
                                    usedNewQueueApi = true;
                                    if (!cancelled) {
                                        const qs = j.queues ?? [];
                                        setQueueSummaries(qs);
                                        setQueueSummariesError(null);
                                        setQueueSummariesRoute(route);
                                        if ("TURBOPACK compile-time truthy", 1) {
                                            console.warn("[pipeline-count-unify]", {
                                                source: "work-unit",
                                                work_unit_id: workUnitId,
                                                queue_key: j.work_unit_scope_queue_key ?? null,
                                                count: typeof j.work_unit_scope_total === "number" ? j.work_unit_scope_total : null
                                            });
                                        }
                                        const qFromUrl = queueParamFromWindow().trim();
                                        let allKeyFromDef = null;
                                        try {
                                            const defBoot = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$config$2f$queueDefinitionSchema$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["validateQueueDefinition"])(wu.queue_definition);
                                            const uiBoot = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$ui$2d$v2$2f$queueUiConfig$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getQueueUiConfig"])(defBoot);
                                            allKeyFromDef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$workUnitQueueDerived$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["findAllRecordsQueueKey"])(defBoot, uiBoot);
                                        } catch  {
                                            allKeyFromDef = null;
                                        }
                                        const uiOrder = ({
                                            "AdminV2OpportunityWorkUnitPage.useEffect.uiOrder": ()=>{
                                                try {
                                                    const def = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$config$2f$queueDefinitionSchema$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["validateQueueDefinition"])(wu.queue_definition);
                                                    const ui = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$ui$2d$v2$2f$queueUiConfig$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getQueueUiConfig"])(def);
                                                    return ui.sections.flatMap({
                                                        "AdminV2OpportunityWorkUnitPage.useEffect.uiOrder": (s)=>s.queue_keys
                                                    }["AdminV2OpportunityWorkUnitPage.useEffect.uiOrder"]);
                                                } catch  {
                                                    return qs.map({
                                                        "AdminV2OpportunityWorkUnitPage.useEffect.uiOrder": (x)=>x.key
                                                    }["AdminV2OpportunityWorkUnitPage.useEffect.uiOrder"]);
                                                }
                                            }
                                        })["AdminV2OpportunityWorkUnitPage.useEffect.uiOrder"]();
                                        const firstByUi = uiOrder.find({
                                            "AdminV2OpportunityWorkUnitPage.useEffect": (k)=>qs.some({
                                                    "AdminV2OpportunityWorkUnitPage.useEffect": (x)=>x.key === k
                                                }["AdminV2OpportunityWorkUnitPage.useEffect"])
                                        }["AdminV2OpportunityWorkUnitPage.useEffect"]) ?? qs[0]?.key ?? null;
                                        const initial = qFromUrl && qs.some({
                                            "AdminV2OpportunityWorkUnitPage.useEffect": (x)=>x.key === qFromUrl
                                        }["AdminV2OpportunityWorkUnitPage.useEffect"]) ? qFromUrl : allKeyFromDef && qs.some({
                                            "AdminV2OpportunityWorkUnitPage.useEffect": (x)=>x.key === allKeyFromDef
                                        }["AdminV2OpportunityWorkUnitPage.useEffect"]) ? allKeyFromDef : firstByUi;
                                        setSelectedQueueKey(initial);
                                        if ("TURBOPACK compile-time truthy", 1) {
                                            console.log("[wu-load-phase]", {
                                                phase: "summaries_ready",
                                                duration_ms: Math.round(performance.now() - routeStart)
                                            });
                                        }
                                    }
                                } else if (res.status === 501) {
                                    shouldFallbackToLegacy = true;
                                    fallbackReason = "queue_api_501_not_supported";
                                    if (!cancelled) {
                                        setQueueSummaries(null);
                                        setQueueSummariesError("Queue type not supported yet");
                                        setQueueSummariesRoute(route);
                                    }
                                } else {
                                    shouldFallbackToLegacy = false;
                                    fallbackReason = `queue_api_${res.status}`;
                                    if (!cancelled) {
                                        setQueueSummaries(null);
                                        setQueueSummariesError(j.error ?? "Failed to load queues");
                                        setQueueSummariesRoute(route);
                                    }
                                }
                            } catch (e) {
                                shouldFallbackToLegacy = true;
                                fallbackReason = "queue_api_exception";
                                if (!cancelled) {
                                    setQueueSummaries(null);
                                    setQueueSummariesError(e instanceof Error ? e.message : "Failed to load queues");
                                    setQueueSummariesRoute(queueListRoute);
                                }
                            }
                        } else {
                            shouldFallbackToLegacy = true;
                            fallbackReason = "queue_api_exception";
                            const reason = queuesSettled.status === "rejected" ? queuesSettled.reason instanceof Error ? queuesSettled.reason.message : "Queue request failed" : "Queue request failed";
                            if (!cancelled) {
                                setQueueSummaries(null);
                                setQueueSummariesError(reason);
                                setQueueSummariesRoute(queueListRoute);
                            }
                        }
                        let oqRuntime = null;
                        if (!usedNewQueueApi && shouldFallbackToLegacy) {
                            try {
                                const oqRes = await fetch(`/api/admin/work-units/${encodeURIComponent(workUnitId)}/${isAttention ? "opportunity-attention-queue" : "opportunity-queue"}`, init);
                                const oqJson = await oqRes.json().catch({
                                    "AdminV2OpportunityWorkUnitPage.useEffect": ()=>({})
                                }["AdminV2OpportunityWorkUnitPage.useEffect"]);
                                if (!oqRes.ok) {
                                    oqRuntime = {
                                        total: 0,
                                        error: oqJson.error ?? "Failed to load queue",
                                        items: []
                                    };
                                } else {
                                    oqRuntime = {
                                        total: typeof oqJson.total === "number" ? oqJson.total : 0,
                                        error: null,
                                        items: oqJson.items ?? []
                                    };
                                }
                            } catch (e) {
                                const msg = e instanceof Error ? e.message : "Queue request failed";
                                oqRuntime = {
                                    total: 0,
                                    error: msg,
                                    items: []
                                };
                            }
                        } else if (!usedNewQueueApi) {
                        // No-op: legacy fallback not used.
                        }
                        if (!cancelled) {
                            setOq(oqRuntime);
                            setOpportunityQueueRowActions(parsedQueueRowQuick);
                            setEnrollmentRightRailResolved(parsedRightRail);
                        }
                    } catch (e) {
                        if (!cancelled) {
                            setError(e.message);
                            setWorkUnit(null);
                            setDept(null);
                            setOq(null);
                            setNeedsAttentionWorkUnitId(null);
                            setQueueSummaries(null);
                            setQueueSummariesError(null);
                            setQueueSummariesRoute(null);
                            setSelectedQueueKey(null);
                            setQueueItems(null);
                            setQueueItemsError(null);
                            setQueueItemsRoute(null);
                            setQueueItemsLoading(false);
                            setOpportunityQueueRowActions(null);
                            setOpportunityQueueRowResolved(null);
                            setEnrollmentRightRailResolved(null);
                        }
                    } finally{
                        if (!cancelled) setLoading(false);
                    }
                }
            })["AdminV2OpportunityWorkUnitPage.useEffect"]();
            return ({
                "AdminV2OpportunityWorkUnitPage.useEffect": ()=>{
                    cancelled = true;
                }
            })["AdminV2OpportunityWorkUnitPage.useEffect"];
        }
    }["AdminV2OpportunityWorkUnitPage.useEffect"], [
        departmentId,
        workUnitId
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "AdminV2OpportunityWorkUnitPage.useEffect": ()=>{
            const gated = Boolean(workUnitId) && Boolean(selectedQueueKey) && Boolean(queueSummaries?.length) && queueItemsLoading && queueItems === null && !queueItemsError;
            if (!gated) {
                setWuPrimaryLaneTimedOut(false);
                return;
            }
            const t = window.setTimeout({
                "AdminV2OpportunityWorkUnitPage.useEffect.t": ()=>setWuPrimaryLaneTimedOut(true)
            }["AdminV2OpportunityWorkUnitPage.useEffect.t"], 12_000);
            return ({
                "AdminV2OpportunityWorkUnitPage.useEffect": ()=>clearTimeout(t)
            })["AdminV2OpportunityWorkUnitPage.useEffect"];
        }
    }["AdminV2OpportunityWorkUnitPage.useEffect"], [
        workUnitId,
        selectedQueueKey,
        queueSummaries,
        queueItemsLoading,
        queueItems,
        queueItemsError
    ]);
    /** Browser back/forward: sync selected queue with `?queue=` without re-running bootstrap. */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "AdminV2OpportunityWorkUnitPage.useEffect": ()=>{
            if (!queueSummaries?.length) return;
            const qFromUrl = (searchParams?.get("queue") ?? "").trim();
            if (!qFromUrl || !queueSummaries.some({
                "AdminV2OpportunityWorkUnitPage.useEffect": (x)=>x.key === qFromUrl
            }["AdminV2OpportunityWorkUnitPage.useEffect"])) return;
            setSelectedQueueKey({
                "AdminV2OpportunityWorkUnitPage.useEffect": (prev)=>prev !== qFromUrl ? qFromUrl : prev
            }["AdminV2OpportunityWorkUnitPage.useEffect"]);
        }
    }["AdminV2OpportunityWorkUnitPage.useEffect"], [
        queueSummaries,
        searchParams
    ]);
    const fetchQueueItems = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "AdminV2OpportunityWorkUnitPage.useCallback[fetchQueueItems]": async (workUnitId, queueKey, summaries, options)=>{
            const tab = summaries?.find({
                "AdminV2OpportunityWorkUnitPage.useCallback[fetchQueueItems]": (q)=>q.key === queueKey
            }["AdminV2OpportunityWorkUnitPage.useCallback[fetchQueueItems]"]);
            const canOmitTotal = tab != null && tab.counts_deferred !== true;
            const fetchSig = `${workUnitId}|${queueKey}|${canOmitTotal ? "omit" : "fullcount"}`;
            if (!options?.force && fetchSig === queueItemsLastFetchSigRef.current) {
                return;
            }
            queueItemsLastFetchSigRef.current = fetchSig;
            const seq = ++queueItemsRequestSeq.current;
            const qs = new URLSearchParams({
                limit: "20",
                offset: "0",
                count_mode: "exact"
            });
            if (canOmitTotal) qs.set("omit_total_count", "true");
            const route = `/api/admin/queues/${encodeURIComponent(workUnitId)}/${encodeURIComponent(queueKey)}?${qs.toString()}`;
            setQueueItemsLoading(true);
            setQueueItemsError(null);
            setQueueItemsRoute(route);
            setQueueItems({
                "AdminV2OpportunityWorkUnitPage.useCallback[fetchQueueItems]": (prev)=>{
                    const pk = prev?.queue && typeof prev.queue.key === "string" ? prev.queue.key : null;
                    if (pk != null && pk !== queueKey) return null;
                    return prev;
                }
            }["AdminV2OpportunityWorkUnitPage.useCallback[fetchQueueItems]"]);
            try {
                const init = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$workspaceDataFetch$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["workspaceDataFetchInit"])();
                const res = await fetch(route, init);
                const json = await res.json().catch({
                    "AdminV2OpportunityWorkUnitPage.useCallback[fetchQueueItems]": ()=>({})
                }["AdminV2OpportunityWorkUnitPage.useCallback[fetchQueueItems]"]);
                if (!res.ok) {
                    if (res.status === 501) throw new Error("Queue type not supported yet");
                    throw new Error(json.error ?? "Failed to load queue items");
                }
                const payload = json;
                if (seq === queueItemsRequestSeq.current) {
                    setQueueItems(payload);
                    if ("TURBOPACK compile-time truthy", 1) {
                        console.warn("[pipeline-count-unify]", {
                            source: "queue-rows",
                            work_unit_id: workUnitId,
                            queue_key: queueKey,
                            count: typeof payload.total === "number" ? payload.total : null
                        });
                    }
                }
            } catch (e) {
                if (seq === queueItemsRequestSeq.current) {
                    setQueueItems(null);
                    setQueueItemsError(e instanceof Error ? e.message : "Failed to load queue items");
                }
            } finally{
                if (seq === queueItemsRequestSeq.current) setQueueItemsLoading(false);
            }
        }
    }["AdminV2OpportunityWorkUnitPage.useCallback[fetchQueueItems]"], []);
    const fetchQueueSummaries = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "AdminV2OpportunityWorkUnitPage.useCallback[fetchQueueSummaries]": async (wuId, _focusQueueKey)=>{
            const seq = ++queueSummariesRequestSeq.current;
            const qs = new URLSearchParams({
                include_previews: "false",
                count_mode: "exact",
                limit: "3"
            });
            const route = `/api/admin/work-units/${encodeURIComponent(wuId)}/queues?${qs.toString()}`;
            setQueueSummariesError(null);
            setQueueSummariesRoute(route);
            try {
                const init = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$workspaceDataFetch$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["workspaceDataFetchInit"])();
                const res = await fetch(route, init);
                const json = await res.json().catch({
                    "AdminV2OpportunityWorkUnitPage.useCallback[fetchQueueSummaries]": ()=>({})
                }["AdminV2OpportunityWorkUnitPage.useCallback[fetchQueueSummaries]"]);
                if (!res.ok) {
                    throw new Error(json.error ?? "Failed to load queues");
                }
                const qsOut = json.queues ?? [];
                if (seq === queueSummariesRequestSeq.current) {
                    setQueueSummaries(qsOut);
                    if ("TURBOPACK compile-time truthy", 1) {
                        console.warn("[pipeline-count-unify]", {
                            source: "work-unit-refresh",
                            work_unit_id: wuId,
                            queue_key: json.work_unit_scope_queue_key ?? null,
                            count: typeof json.work_unit_scope_total === "number" ? json.work_unit_scope_total : null
                        });
                    }
                }
            } catch (e) {
                if (seq === queueSummariesRequestSeq.current) {
                    setQueueSummaries(null);
                    setQueueSummariesError(e instanceof Error ? e.message : "Failed to load queues");
                }
            }
        }
    }["AdminV2OpportunityWorkUnitPage.useCallback[fetchQueueSummaries]"], []);
    const invalidate = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "AdminV2OpportunityWorkUnitPage.useCallback[invalidate]": (opts)=>{
            void opts;
            if (!workUnitId || !selectedQueueKey) return;
            void Promise.all([
                fetchQueueItems(workUnitId, selectedQueueKey, queueSummaries, {
                    force: true
                }),
                fetchQueueSummaries(workUnitId, selectedQueueKey)
            ]);
        }
    }["AdminV2OpportunityWorkUnitPage.useCallback[invalidate]"], [
        fetchQueueItems,
        fetchQueueSummaries,
        queueSummaries,
        selectedQueueKey,
        workUnitId
    ]);
    const queueSummariesRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(queueSummaries);
    queueSummariesRef.current = queueSummaries;
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "AdminV2OpportunityWorkUnitPage.useEffect": ()=>{
            if (!workUnitId || !selectedQueueKey) return;
            const onUpdated = {
                "AdminV2OpportunityWorkUnitPage.useEffect.onUpdated": (_ev)=>{
                    const summaries = queueSummariesRef.current;
                    void Promise.all([
                        fetchQueueItems(workUnitId, selectedQueueKey, summaries, {
                            force: true
                        }),
                        fetchQueueSummaries(workUnitId, selectedQueueKey)
                    ]);
                }
            }["AdminV2OpportunityWorkUnitPage.useEffect.onUpdated"];
            window.addEventListener("adminv2:opportunity-updated", onUpdated);
            return ({
                "AdminV2OpportunityWorkUnitPage.useEffect": ()=>window.removeEventListener("adminv2:opportunity-updated", onUpdated)
            })["AdminV2OpportunityWorkUnitPage.useEffect"];
        }
    }["AdminV2OpportunityWorkUnitPage.useEffect"], [
        fetchQueueItems,
        fetchQueueSummaries,
        selectedQueueKey,
        workUnitId
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "AdminV2OpportunityWorkUnitPage.useEffect": ()=>{
            if (!workUnitId || !selectedQueueKey) return;
            void fetchQueueItems(workUnitId, selectedQueueKey, queueSummaries);
        }
    }["AdminV2OpportunityWorkUnitPage.useEffect"], [
        fetchQueueItems,
        queueSummaries,
        selectedQueueKey,
        workUnitId
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "AdminV2OpportunityWorkUnitPage.useEffect": ()=>{
            let cancelled = false;
            setWorkflowKpisLoading(true);
            ({
                "AdminV2OpportunityWorkUnitPage.useEffect": async ()=>{
                    try {
                        const init = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$workspaceDataFetch$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["workspaceDataFetchInit"])();
                        const [kRes, sRes] = await Promise.all([
                            fetch("/api/admin/workflow-runs?list=kpis", init),
                            fetch("/api/admin/workflows/summary?variant=workspace", init)
                        ]);
                        const kBody = await kRes.json().catch({
                            "AdminV2OpportunityWorkUnitPage.useEffect": ()=>({})
                        }["AdminV2OpportunityWorkUnitPage.useEffect"]);
                        const sJson = await sRes.json().catch({
                            "AdminV2OpportunityWorkUnitPage.useEffect": ()=>({})
                        }["AdminV2OpportunityWorkUnitPage.useEffect"]);
                        if (!cancelled) {
                            if (kRes.ok && kBody.kpis) setWorkflowKpis({
                                ...DEFAULT_WF_KPIS,
                                ...kBody.kpis
                            });
                            if (sRes.ok) {
                                const all = Array.isArray(sJson.workflows) ? sJson.workflows : [];
                                const relevant = all.filter({
                                    "AdminV2OpportunityWorkUnitPage.useEffect.relevant": (w)=>(w.entity_type ?? "").toLowerCase() === "opportunity"
                                }["AdminV2OpportunityWorkUnitPage.useEffect.relevant"]);
                                setWorkflowsSummary(relevant);
                            }
                        }
                    } catch  {
                    // non-fatal
                    } finally{
                        if (!cancelled) setWorkflowKpisLoading(false);
                    }
                }
            })["AdminV2OpportunityWorkUnitPage.useEffect"]();
            return ({
                "AdminV2OpportunityWorkUnitPage.useEffect": ()=>{
                    cancelled = true;
                }
            })["AdminV2OpportunityWorkUnitPage.useEffect"];
        }
    }["AdminV2OpportunityWorkUnitPage.useEffect"], []);
    const queuePicker = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "AdminV2OpportunityWorkUnitPage.useMemo[queuePicker]": ()=>{
            if (!workUnitId) return null;
            const summariesPending = queueSummaries === null && !queueSummariesError;
            if (summariesPending && queueTabPlaceholders?.length) {
                const pillBase = "inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-0.5 text-left text-[11px] font-semibold leading-tight transition-colors";
                const countBadgePending = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                    className: "inline-flex h-3.5 w-3.5 shrink-0 rounded-full border-2 border-alloy-forge/20 border-t-alloy-blue/75 animate-spin",
                    "aria-label": "Loading queue count"
                }, void 0, false, {
                    fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx",
                    lineNumber: 923,
                    columnNumber: 17
                }, this);
                const multiSectionPh = queueTabPlaceholders.length > 1;
                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "flex flex-col gap-1.5 min-w-0",
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex flex-col gap-1",
                        children: queueTabPlaceholders.map({
                            "AdminV2OpportunityWorkUnitPage.useMemo[queuePicker]": (section)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "flex flex-wrap items-center gap-1",
                                    role: "group",
                                    "aria-label": section.label,
                                    children: [
                                        multiSectionPh ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "w-full text-[10px] font-semibold tracking-wide text-alloy-forge/50 sm:w-auto sm:mr-1",
                                            children: section.label
                                        }, void 0, false, {
                                            fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx",
                                            lineNumber: 935,
                                            columnNumber: 37
                                        }, this) : null,
                                        section.queues.map({
                                            "AdminV2OpportunityWorkUnitPage.useMemo[queuePicker]": (q)=>{
                                                const selected = q.key === selectedQueueKey && (!unmappedOnly || allRecordsQueueKey == null || q.key !== allRecordsQueueKey);
                                                const tier = q.priority === "critical" ? "critical" : q.priority === "attention" ? "attention" : "standard";
                                                const ring = tier === "critical" ? selected ? "border-alloy-ember bg-alloy-ember/12 text-alloy-forge" : "border-alloy-ember/35 bg-white/60 text-alloy-forge/85" : tier === "attention" ? selected ? "border-alloy-honey bg-alloy-honey/12 text-alloy-forge" : "border-alloy-honey/40 bg-white/60 text-alloy-forge/85" : selected ? "border-alloy-blue bg-alloy-blue/[0.07] text-alloy-forge shadow-[inset_0_0_0_1px_rgba(0,69,140,0.12)]" : "border-admin-border bg-white/70 text-alloy-forge/80";
                                                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                    type: "button",
                                                    onClick: {
                                                        "AdminV2OpportunityWorkUnitPage.useMemo[queuePicker]": ()=>{
                                                            setSelectedQueueKey(q.key);
                                                            void fetchQueueItems(workUnitId, q.key, null, {
                                                                force: true
                                                            });
                                                            if ("TURBOPACK compile-time truthy", 1) {
                                                                const url = new URL(window.location.href);
                                                                url.searchParams.set("queue", q.key);
                                                                url.searchParams.delete("unmapped");
                                                                router.replace(`${url.pathname}${url.search}`, {
                                                                    scroll: false
                                                                });
                                                            }
                                                        }
                                                    }["AdminV2OpportunityWorkUnitPage.useMemo[queuePicker]"],
                                                    className: `${pillBase} ${ring}`,
                                                    "aria-pressed": selected,
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            className: "truncate",
                                                            children: q.label
                                                        }, void 0, false, {
                                                            fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx",
                                                            lineNumber: 978,
                                                            columnNumber: 45
                                                        }, this),
                                                        countBadgePending
                                                    ]
                                                }, q.key, true, {
                                                    fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx",
                                                    lineNumber: 962,
                                                    columnNumber: 41
                                                }, this);
                                            }
                                        }["AdminV2OpportunityWorkUnitPage.useMemo[queuePicker]"])
                                    ]
                                }, section.key, true, {
                                    fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx",
                                    lineNumber: 933,
                                    columnNumber: 29
                                }, this)
                        }["AdminV2OpportunityWorkUnitPage.useMemo[queuePicker]"])
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx",
                        lineNumber: 931,
                        columnNumber: 21
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx",
                    lineNumber: 930,
                    columnNumber: 17
                }, this);
            }
            if (!queueSummaries) {
                if (!queueSummariesError) return null;
                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "rounded-md border border-admin-border bg-admin-surface-card px-3 py-2 text-sm text-alloy-ember",
                    children: [
                        queueSummariesError,
                        queueSummariesRoute ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "mt-1 text-xs text-alloy-ember/80",
                            children: [
                                "Route: ",
                                queueSummariesRoute
                            ]
                        }, void 0, true, {
                            fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx",
                            lineNumber: 996,
                            columnNumber: 25
                        }, this) : null
                    ]
                }, void 0, true, {
                    fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx",
                    lineNumber: 993,
                    columnNumber: 17
                }, this);
            }
            if (queueSummaries.length === 0) {
                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "rounded-md border border-admin-border bg-admin-surface-card px-3 py-2 text-sm text-alloy-forge/70",
                    children: [
                        "No queues configured for this work unit.",
                        queueSummariesRoute ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "mt-1 text-xs text-alloy-forge/50",
                            children: [
                                "Route: ",
                                queueSummariesRoute
                            ]
                        }, void 0, true, {
                            fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx",
                            lineNumber: 1006,
                            columnNumber: 25
                        }, this) : null
                    ]
                }, void 0, true, {
                    fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx",
                    lineNumber: 1003,
                    columnNumber: 17
                }, this);
            }
            const activeSummary = selectedQueueKey ? queueSummaries.find({
                "AdminV2OpportunityWorkUnitPage.useMemo[queuePicker]": (q)=>q.key === selectedQueueKey
            }["AdminV2OpportunityWorkUnitPage.useMemo[queuePicker]"]) ?? queueSummaries[0] : queueSummaries[0];
            const tabNForSelected = activeSummary?.counts_deferred === true ? undefined : typeof activeSummary?.count === "number" ? activeSummary.count : undefined;
            const reconcilePickerCountZero = queueItems != null && !queueItemsError && !queueItemsLoading && selectedQueueKey && queueItems.queue.key === selectedQueueKey && (queueItems.offset ?? 0) === 0 && !(queueItems.items ?? []).some(queueItemPayloadHasId) && queueItems.total_omitted === true && typeof tabNForSelected === "number" && tabNForSelected > 0;
            /** Drill-in totals / empty page — aligns selected-tab pill with list without inventing estimates. */ let authoritativeBadgeForSelectedTab = undefined;
            if (selectedQueueKey && queueItems != null && !queueItemsError && !queueItemsLoading && queueItems.queue.key === selectedQueueKey) {
                if (queueItems.total_omitted !== true && typeof queueItems.total === "number" && Number.isFinite(queueItems.total)) {
                    authoritativeBadgeForSelectedTab = Math.max(0, Math.floor(queueItems.total));
                } else if (queueItems.total_omitted === true && (queueItems.offset ?? 0) === 0 && !(queueItems.items ?? []).some(queueItemPayloadHasId)) {
                    authoritativeBadgeForSelectedTab = 0;
                }
            }
            const pillBase = "inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-0.5 text-left text-[11px] font-semibold leading-tight transition-colors";
            function queuePillBadgeCount(q) {
                if (q.counts_deferred) return "…";
                if (q.key === selectedQueueKey && typeof authoritativeBadgeForSelectedTab === "number" && !(unmappedOnly && allRecordsQueueKey != null && q.key === allRecordsQueueKey)) {
                    return authoritativeBadgeForSelectedTab;
                }
                if (q.key === selectedQueueKey && reconcilePickerCountZero) return 0;
                const raw = q.count;
                const sc = typeof raw === "number" && Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : undefined;
                return sc === undefined ? "—" : sc;
            }
            const sections = sectionedQueueSummariesOrdered ?? [
                {
                    key: "all",
                    label: "Queues",
                    tone: "standard",
                    queues: queueSummaries
                }
            ];
            const multiSection = sections.length > 1;
            const showOtherPill = typeof unmappedPillCount === "number" && unmappedPillCount > 0 && Boolean(allRecordsQueueKey) && Boolean(otherPillSectionKey);
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex flex-col gap-1.5 min-w-0",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex flex-col gap-1",
                        children: sections.map({
                            "AdminV2OpportunityWorkUnitPage.useMemo[queuePicker]": (section)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "flex flex-wrap items-center gap-1",
                                    role: "group",
                                    "aria-label": section.label,
                                    children: [
                                        multiSection ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "w-full text-[10px] font-semibold tracking-wide text-alloy-forge/50 sm:w-auto sm:mr-1",
                                            children: section.label
                                        }, void 0, false, {
                                            fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx",
                                            lineNumber: 1079,
                                            columnNumber: 33
                                        }, this) : null,
                                        section.queues.map({
                                            "AdminV2OpportunityWorkUnitPage.useMemo[queuePicker]": (q)=>{
                                                const selected = q.key === selectedQueueKey && (!unmappedOnly || allRecordsQueueKey == null || q.key !== allRecordsQueueKey);
                                                const tier = q.priority === "critical" ? "critical" : q.priority === "attention" ? "attention" : "standard";
                                                const ring = tier === "critical" ? selected ? "border-alloy-ember bg-alloy-ember/12 text-alloy-forge" : "border-alloy-ember/35 bg-white/60 text-alloy-forge/85" : tier === "attention" ? selected ? "border-alloy-honey bg-alloy-honey/12 text-alloy-forge" : "border-alloy-honey/40 bg-white/60 text-alloy-forge/85" : selected ? "border-alloy-blue bg-alloy-blue/[0.07] text-alloy-forge shadow-[inset_0_0_0_1px_rgba(0,69,140,0.12)]" : "border-admin-border bg-white/70 text-alloy-forge/80";
                                                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                    type: "button",
                                                    onClick: {
                                                        "AdminV2OpportunityWorkUnitPage.useMemo[queuePicker]": ()=>{
                                                            setSelectedQueueKey(q.key);
                                                            void fetchQueueItems(workUnitId, q.key, queueSummaries, {
                                                                force: true
                                                            });
                                                            if ("TURBOPACK compile-time truthy", 1) {
                                                                const url = new URL(window.location.href);
                                                                url.searchParams.set("queue", q.key);
                                                                url.searchParams.delete("unmapped");
                                                                router.replace(`${url.pathname}${url.search}`, {
                                                                    scroll: false
                                                                });
                                                            }
                                                        }
                                                    }["AdminV2OpportunityWorkUnitPage.useMemo[queuePicker]"],
                                                    className: `${pillBase} ${ring}`,
                                                    "aria-pressed": selected,
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            className: "truncate",
                                                            children: q.label
                                                        }, void 0, false, {
                                                            fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx",
                                                            lineNumber: 1122,
                                                            columnNumber: 41
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            className: `tabular-nums rounded-full px-1 py-px text-[10px] font-bold ${selected ? "bg-alloy-forge/10 text-alloy-forge" : "bg-alloy-stone/15 text-alloy-forge/70"}`,
                                                            children: queuePillBadgeCount(q)
                                                        }, void 0, false, {
                                                            fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx",
                                                            lineNumber: 1123,
                                                            columnNumber: 41
                                                        }, this)
                                                    ]
                                                }, q.key, true, {
                                                    fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx",
                                                    lineNumber: 1106,
                                                    columnNumber: 37
                                                }, this);
                                            }
                                        }["AdminV2OpportunityWorkUnitPage.useMemo[queuePicker]"]),
                                        showOtherPill && section.key === otherPillSectionKey && allRecordsQueueKey ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                            type: "button",
                                            onClick: {
                                                "AdminV2OpportunityWorkUnitPage.useMemo[queuePicker]": ()=>{
                                                    setSelectedQueueKey(allRecordsQueueKey);
                                                    void fetchQueueItems(workUnitId, allRecordsQueueKey, queueSummaries, {
                                                        force: true
                                                    });
                                                    if ("TURBOPACK compile-time truthy", 1) {
                                                        const url = new URL(window.location.href);
                                                        url.searchParams.set("queue", allRecordsQueueKey);
                                                        url.searchParams.set("unmapped", "1");
                                                        router.replace(`${url.pathname}${url.search}`, {
                                                            scroll: false
                                                        });
                                                    }
                                                }
                                            }["AdminV2OpportunityWorkUnitPage.useMemo[queuePicker]"],
                                            className: `${pillBase} ${unmappedOnly && selectedQueueKey === allRecordsQueueKey ? "border-alloy-blue bg-alloy-blue/[0.07] text-alloy-forge shadow-[inset_0_0_0_1px_rgba(0,69,140,0.12)]" : "border-admin-border bg-white/70 text-alloy-forge/80"}`,
                                            "aria-pressed": unmappedOnly && selectedQueueKey === allRecordsQueueKey,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "truncate",
                                                    children: "Other"
                                                }, void 0, false, {
                                                    fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx",
                                                    lineNumber: 1154,
                                                    columnNumber: 37
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: `tabular-nums rounded-full px-1 py-px text-[10px] font-bold ${unmappedOnly && selectedQueueKey === allRecordsQueueKey ? "bg-alloy-forge/10 text-alloy-forge" : "bg-alloy-stone/15 text-alloy-forge/70"}`,
                                                    children: unmappedPillCount ?? "—"
                                                }, void 0, false, {
                                                    fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx",
                                                    lineNumber: 1155,
                                                    columnNumber: 37
                                                }, this)
                                            ]
                                        }, "__derived_other__", true, {
                                            fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx",
                                            lineNumber: 1134,
                                            columnNumber: 33
                                        }, this) : null
                                    ]
                                }, section.key, true, {
                                    fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx",
                                    lineNumber: 1077,
                                    columnNumber: 25
                                }, this)
                        }["AdminV2OpportunityWorkUnitPage.useMemo[queuePicker]"])
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx",
                        lineNumber: 1075,
                        columnNumber: 17
                    }, this),
                    activeSummary?.description?.trim() && isOperatorFacingQueueSummaryDescription(activeSummary.description) ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "m-0 text-[11px] leading-snug text-alloy-forge/60 line-clamp-2",
                        children: activeSummary.description.trim()
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx",
                        lineNumber: 1170,
                        columnNumber: 21
                    }, this) : null
                ]
            }, void 0, true, {
                fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx",
                lineNumber: 1074,
                columnNumber: 13
            }, this);
        }
    }["AdminV2OpportunityWorkUnitPage.useMemo[queuePicker]"], [
        fetchQueueItems,
        queueSummaries,
        queueSummariesError,
        queueSummariesRoute,
        sectionedQueueSummariesOrdered,
        selectedQueueKey,
        queueItems,
        queueItemsError,
        queueItemsLoading,
        workUnitId,
        router,
        unmappedOnly,
        allRecordsQueueKey,
        unmappedPillCount,
        otherPillSectionKey,
        queueTabPlaceholders
    ]);
    const queueModel = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "AdminV2OpportunityWorkUnitPage.useMemo[queueModel]": ()=>{
            if (!workUnit || !dept) return null;
            const enrollmentActionsRail = {
                "AdminV2OpportunityWorkUnitPage.useMemo[queueModel].enrollmentActionsRail": ()=>{
                    const isEnrollmentDept = (dept.key ?? "").trim().toLowerCase() === "enrollment";
                    const emptyBase = {
                        primaries: [],
                        systemActions: [],
                        quickOperations: [],
                        overflow: []
                    };
                    return isEnrollmentDept ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$viewModels$2f$enrollmentRightRailMerge$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["mergeEnrollmentRightRailActions"])(enrollmentRightRailResolved ?? [], emptyBase) : emptyBase;
                }
            }["AdminV2OpportunityWorkUnitPage.useMemo[queueModel].enrollmentActionsRail"];
            if (!queueSummaries && !queueSummariesError && !oq) {
                return {
                    workspaceLevel: "work_unit",
                    workUnitId: workUnit.id,
                    departmentKey: dept.key ?? undefined,
                    laneKey: "queue:loading",
                    focusLabel: dept.name ?? "Department",
                    aiSummary: {
                        headline: workUnit.name ?? "Queue",
                        subline: dept.name ?? "Department",
                        aiAwarenessLine: undefined
                    },
                    laneInterpretation: {
                        laneStatusLine: "Loading queues…",
                        recommendedActionLine: "Records will appear here when the queue is ready."
                    },
                    signals: [],
                    kpis: [],
                    primaryQueue: {
                        id: `wu:${workUnit.id}:queue:loading`,
                        title: "",
                        laneQueueLabel: "Loading queues",
                        countBadge: undefined,
                        items: [],
                        rowsLoading: true,
                        sortCaption: undefined,
                        rollupSummary: undefined
                    },
                    workSummary: null,
                    actionsRail: enrollmentActionsRail(),
                    contextRail: {
                        title: "About",
                        groups: []
                    }
                };
            }
            if (queueSummariesError && !queueSummaries && !oq) {
                return {
                    workspaceLevel: "work_unit",
                    workUnitId: workUnit.id,
                    departmentKey: dept.key ?? undefined,
                    laneKey: "queue:error",
                    focusLabel: dept.name ?? "Department",
                    aiSummary: {
                        headline: workUnit.name ?? "Queue",
                        subline: dept.name ?? "Department",
                        aiAwarenessLine: undefined
                    },
                    laneInterpretation: {
                        laneStatusLine: "Queue summaries could not be loaded.",
                        recommendedActionLine: "Try reloading the page or pick another lane."
                    },
                    signals: [],
                    kpis: [],
                    primaryQueue: {
                        id: `wu:${workUnit.id}:queue:error`,
                        title: "",
                        laneQueueLabel: "Error",
                        countBadge: undefined,
                        items: [],
                        rowsLoading: false,
                        sortCaption: queueSummariesError,
                        rollupSummary: undefined
                    },
                    workSummary: null,
                    actionsRail: enrollmentActionsRail(),
                    contextRail: {
                        title: "About",
                        groups: []
                    }
                };
            }
            if (!queueSummaries) return null;
            const activeQueue = selectedQueueKey ? queueSummaries.find({
                "AdminV2OpportunityWorkUnitPage.useMemo[queueModel]": (q)=>q.key === selectedQueueKey
            }["AdminV2OpportunityWorkUnitPage.useMemo[queueModel]"]) ?? queueSummaries[0] : queueSummaries[0];
            const entity = queueItems?.queue.entity_type ?? activeQueue?.entity_type ?? "job";
            const rawList = queueItems?.items ?? [];
            const unmappedClientFilter = unmappedOnly && Boolean(allRecordsQueueKey) && selectedQueueKey === allRecordsQueueKey && entity === "opportunity";
            const sourceRows = rawList.filter({
                "AdminV2OpportunityWorkUnitPage.useMemo[queueModel].sourceRows": (r)=>typeof r?.id === "string" && String(r.id).trim()
            }["AdminV2OpportunityWorkUnitPage.useMemo[queueModel].sourceRows"]).filter({
                "AdminV2OpportunityWorkUnitPage.useMemo[queueModel].sourceRows": (r)=>unmappedClientFilter ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$workUnitQueueDerived$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["isRowUnmappedForThroughput"])(r, coveredThroughputStatusKeys) : true
            }["AdminV2OpportunityWorkUnitPage.useMemo[queueModel].sourceRows"]);
            const previewCfg = queueUi?.row_preview ?? {
                variant: "basic",
                fields: [
                    "title",
                    "status"
                ],
                actions: [
                    "open"
                ]
            };
            const previewFields = previewCfg.fields ?? [
                "title",
                "status"
            ];
            const previewActions = previewCfg.actions?.length ? [
                ...previewCfg.actions
            ] : [
                "open"
            ];
            const vmItems = sourceRows.map({
                "AdminV2OpportunityWorkUnitPage.useMemo[queueModel].vmItems": (r)=>{
                    const rid = r.id;
                    const title = typeof r?.name === "string" && r.name.trim() ? r.name.trim() : typeof r?.title === "string" && r.title.trim() ? r.title.trim() : rid;
                    const familyTitle = typeof r?._customer_name === "string" && r._customer_name.trim() ? r._customer_name.trim() : title;
                    const statusLabel = typeof r?._status_display === "string" && r._status_display.trim() ? r._status_display.trim() : typeof r?.status_key === "string" ? r.status_key : "";
                    const contactName = typeof r?._primary_contact_line === "string" ? r._primary_contact_line.trim() : "";
                    const phone = typeof r?._primary_phone === "string" ? r._primary_phone.trim() : "";
                    const email = typeof r?._primary_email === "string" ? r._primary_email.trim() : "";
                    const childName = typeof r?._child_display_name === "string" ? r._child_display_name.trim() : "";
                    const program = typeof r?._requested_program === "string" ? r._requested_program.trim() : "";
                    const note = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$opportunityActivityTimelineFormat$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__["formatOpportunityQueueNotesPreview"])(typeof r?._notes_preview === "string" ? r._notes_preview : null, viewerTz) ?? "";
                    const attentionReason = typeof r?._attention_reason_label === "string" ? r._attention_reason_label.trim() : "";
                    const wfAt = typeof r?.last_activity_at === "string" && r.last_activity_at.trim() ? r.last_activity_at.trim() : null;
                    const wfSummary = typeof r?.last_activity_summary === "string" && r.last_activity_summary.trim() ? r.last_activity_summary.trim() : null;
                    let activityLastLine = null;
                    if (wfAt) {
                        const rel = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$activitySignals$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatActivityRelativeShort"])(wfAt, Date.now());
                        if (rel) activityLastLine = wfSummary ? `${rel} · ${wfSummary}` : rel;
                    }
                    const staleSig = r?.stale_signal;
                    const activityStale = staleSig && typeof staleSig.label === "string" && staleSig.label.trim() ? {
                        label: staleSig.label.trim(),
                        severity: staleSig.severity ?? "low"
                    } : null;
                    const quickActions = [
                        ...previewActions.includes("open") ? [
                            {
                                id: "open",
                                label: "Open",
                                actionId: "open_record",
                                variant: "primary"
                            }
                        ] : []
                    ];
                    if (previewActions.includes("call") && phone) {
                        const tel = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$contactNormalize$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["normalizePhone"])(phone) ?? `+1${phone.replace(/\D/g, "").slice(-10)}`;
                        quickActions.push({
                            id: "call",
                            label: "Call",
                            actionId: "crm_tel",
                            variant: "secondary",
                            payload: {
                                href: `tel:${tel}`
                            }
                        });
                    }
                    if (previewActions.includes("email") && email) {
                        quickActions.push({
                            id: "email",
                            label: "Email",
                            actionId: "crm_mailto",
                            variant: "secondary",
                            payload: {
                                href: `mailto:${email}`
                            }
                        });
                    }
                    if (entity === "opportunity" && opportunityQueueRowActions?.length) {
                        for (const qa of opportunityQueueRowActions){
                            quickActions.push({
                                id: qa.id,
                                label: qa.label,
                                actionId: qa.id,
                                variant: "secondary",
                                payload: qa.payload
                            });
                        }
                    }
                    const want = {
                        "AdminV2OpportunityWorkUnitPage.useMemo[queueModel].vmItems.want": (f)=>isRowPreviewFieldEnabled(previewFields, f)
                    }["AdminV2OpportunityWorkUnitPage.useMemo[queueModel].vmItems.want"];
                    const crmChildrenParsed = parseQueueRowCrmChildren(r?._crm_compact_children);
                    const multiChildren = Boolean(want("child_name") && crmChildrenParsed.length >= 2);
                    const programDeduped = program.trim() && want("program") ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$ui$2d$v2$2f$crmQueueRowPreviewPresentation$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["dedupeRedundantProgramAgeInPreview"])(program) : null;
                    const childrenLinesForVm = want("child_name") && multiChildren ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$ui$2d$v2$2f$crmQueueRowPreviewPresentation$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["refineCrmCompactChildLinesForPreview"])(crmChildrenParsed, want("program") ? programDeduped : null, {
                        attachFamilyWhenMissing: want("program")
                    }) : null;
                    const basicSubtitleParts = [];
                    if (want("status") && statusLabel) basicSubtitleParts.push(`Status: ${statusLabel}`);
                    if (want("primary_contact") && contactName) basicSubtitleParts.push(contactName);
                    if (want("phone") && phone || want("email") && email) {
                        const bits = [
                            want("phone") ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminFormatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatPhoneUS"])(phone) : "",
                            want("email") ? email : ""
                        ].filter({
                            "AdminV2OpportunityWorkUnitPage.useMemo[queueModel].vmItems.bits": (s)=>s && s !== "—"
                        }["AdminV2OpportunityWorkUnitPage.useMemo[queueModel].vmItems.bits"]);
                        if (bits.length) basicSubtitleParts.push(bits.join(" · "));
                    }
                    return {
                        id: rid,
                        title: familyTitle,
                        subtitle: previewCfg.variant === "basic" ? basicSubtitleParts.filter(Boolean).join(" · ") || undefined : undefined,
                        urgencyTier: activeQueue?.priority === "critical" ? "critical" : activeQueue?.priority === "attention" ? "warning" : "standard",
                        quickActions,
                        semanticCrmCompact: previewCfg.variant === "crm_compact" ? ({
                            "AdminV2OpportunityWorkUnitPage.useMemo[queueModel].vmItems": ()=>{
                                const crmPresentation = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$ui$2d$v2$2f$crmQueueRowPreviewPresentation$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["buildCrmQueueRowPreviewPresentation"])(r, want, queueUi?.row_preview.fieldLabels);
                                return {
                                    primaryIdentity: familyTitle,
                                    childrenLines: childrenLinesForVm,
                                    childName: want("child_name") ? multiChildren ? null : childName || null : null,
                                    stageLabel: null,
                                    statusLabel: want("status") ? statusLabel || null : null,
                                    nextStep: typeof r?._next_step_preview === "string" && r._next_step_preview.trim() ? r._next_step_preview.trim() : null,
                                    lastActivity: activityLastLine,
                                    commercialValue: null,
                                    ...crmPresentation,
                                    programContext: want("program") ? multiChildren ? null : programDeduped : null,
                                    roomContext: null,
                                    attentionReason: attentionReason || null,
                                    familyNote: note || null,
                                    activityStale
                                };
                            }
                        })["AdminV2OpportunityWorkUnitPage.useMemo[queueModel].vmItems"]() : undefined
                    };
                }
            }["AdminV2OpportunityWorkUnitPage.useMemo[queueModel].vmItems"]);
            const laneTitle = workUnit.name ?? "Queue";
            const errorLine = queueItemsError ? `${queueItemsError}${queueItemsRoute ? ` · Route: ${queueItemsRoute}` : ""}` : undefined;
            const tabCount = activeQueue?.counts_deferred === true ? undefined : typeof activeQueue?.count === "number" ? activeQueue.count : undefined;
            const reconcileListEmptyVsTab = queueItems != null && !queueItemsError && !queueItemsLoading && queueItems.queue.key === activeQueue?.key && (queueItems.offset ?? 0) === 0 && vmItems.length === 0 && queueItems.total_omitted === true && typeof tabCount === "number" && tabCount > 0;
            const unmappedListView = unmappedClientFilter && typeof unmappedPillCount === "number" && unmappedPillCount >= 0;
            const effectiveRowTotal = unmappedListView ? unmappedPillCount : reconcileListEmptyVsTab ? 0 : queueItems != null ? queueItems.total_omitted === true ? tabCount : queueItems.total : tabCount;
            const rowTotalDisplay = effectiveRowTotal == null ? "—" : String(effectiveRowTotal);
            const activeQueueKey = String(activeQueue?.key ?? "");
            const queueItemsKey = queueItems != null && typeof queueItems.queue === "object" && queueItems.queue != null ? String(queueItems.queue.key ?? "") : "";
            const awaitingFirstRows = !queueItemsError && Boolean(queueSummaries?.length) && Boolean(selectedQueueKey) && queueItems === null;
            /** Empty list + in-flight fetch, tab mismatch, or waiting for first row batch — in-lane loading (no “No records”). */ const rowsLoading = awaitingFirstRows || Boolean(queueItemsLoading) && (queueItems === null || vmItems.length === 0 || activeQueueKey !== "" && queueItemsKey !== "" && queueItemsKey !== activeQueueKey);
            return {
                workspaceLevel: "work_unit",
                workUnitId: workUnit.id,
                departmentKey: dept.key ?? undefined,
                laneKey: `queue:${activeQueue?.key ?? "unknown"}`,
                focusLabel: dept.name ?? "Department",
                aiSummary: {
                    headline: laneTitle,
                    subline: activeQueue?.label ? `${dept.name ?? "Department"} · ${activeQueue.label}` : `${dept.name ?? "Department"}`,
                    aiAwarenessLine: entity === "job" ? "Server-evaluated queues (previews only)." : undefined
                },
                laneInterpretation: entity === "job" ? {
                    laneStatusLine: queueItemsLoading ? "Loading queue items…" : `Queue: ${activeQueue?.key ?? "—"} · ${rowTotalDisplay} items`,
                    recommendedActionLine: "Open a row to view the record in the drawer."
                } : null,
                signals: [],
                kpis: [],
                primaryQueue: {
                    id: `wu:${workUnit.id}:queue:${activeQueue?.key ?? "unknown"}`,
                    // Title lives in the shell headline + queue pills; body starts with rows only.
                    title: "",
                    laneQueueLabel: activeQueue?.label?.trim() || activeQueue?.key || undefined,
                    countBadge: effectiveRowTotal,
                    items: vmItems,
                    sortCaption: errorLine ? errorLine : unmappedListView ? "Unmapped / other bucket: list is filtered on the client from the current server page of the all-records lane — use full lane or fix stage filters for complete paging." : undefined,
                    rollupSummary: undefined,
                    rowsLoading
                },
                workSummary: null,
                actionsRail: enrollmentActionsRail(),
                contextRail: {
                    title: "About",
                    groups: []
                }
            };
        }
    }["AdminV2OpportunityWorkUnitPage.useMemo[queueModel]"], [
        dept,
        enrollmentRightRailResolved,
        oq,
        queueItems,
        queueItemsError,
        queueItemsLoading,
        queueItemsRoute,
        queueSummaries,
        queueSummariesError,
        selectedQueueKey,
        workUnit,
        queueUi,
        opportunityQueueRowActions,
        unmappedOnly,
        allRecordsQueueKey,
        coveredThroughputStatusKeys,
        unmappedPillCount,
        viewerTz
    ]);
    const showOtherBucketPill = typeof unmappedPillCount === "number" && unmappedPillCount > 0 && Boolean(allRecordsQueueKey) && Boolean(otherPillSectionKey);
    const headerQueuePickerSlot = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "AdminV2OpportunityWorkUnitPage.useMemo[headerQueuePickerSlot]": ()=>{
            if (!queueModel) return null;
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "min-w-0",
                children: [
                    queuePicker,
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$workspace$2f$WorkUnitLifecycleCoveragePanel$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["WorkUnitLifecycleCoveragePanel"], {
                        hasLifecycleThroughput: hasLifecycleThroughput,
                        showOtherPill: showOtherBucketPill,
                        coverage: lifecycleCoverage,
                        allRecordsQueueKey: allRecordsQueueKey,
                        selectedQueueKey: selectedQueueKey,
                        queueItems: queueItems?.items,
                        queueItemsLoading: queueItemsLoading,
                        coveredStatusKeys: coveredThroughputStatusKeys
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx",
                        lineNumber: 1588,
                        columnNumber: 17
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx",
                lineNumber: 1586,
                columnNumber: 13
            }, this);
        }
    }["AdminV2OpportunityWorkUnitPage.useMemo[headerQueuePickerSlot]"], [
        queueModel,
        queuePicker,
        hasLifecycleThroughput,
        showOtherBucketPill,
        lifecycleCoverage,
        allRecordsQueueKey,
        selectedQueueKey,
        queueItems?.items,
        queueItemsLoading,
        coveredThroughputStatusKeys
    ]);
    const model = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "AdminV2OpportunityWorkUnitPage.useMemo[model]": ()=>{
            if (!workUnit || !dept || !oq) return null;
            const rawItems = oq.items ?? [];
            const statusKeysRaw = (searchParams?.get("status_keys") ?? "").trim();
            const statusKeys = statusKeysRaw ? statusKeysRaw.split(",").map({
                "AdminV2OpportunityWorkUnitPage.useMemo[model]": (s)=>s.trim().toLowerCase()
            }["AdminV2OpportunityWorkUnitPage.useMemo[model]"]).filter(Boolean) : [];
            const attentionReason = (searchParams?.get("attention_reason") ?? "").trim();
            const activitySignalKey = (searchParams?.get("activity_signal_key") ?? "").trim();
            const filteredItems = rawItems.filter({
                "AdminV2OpportunityWorkUnitPage.useMemo[model].filteredItems": (it)=>{
                    if (statusKeys.length) {
                        const sk = String(it.status_key ?? "").trim().toLowerCase();
                        if (!statusKeys.includes(sk)) return false;
                    }
                    if (attentionReason) {
                        const rl = String(it._attention_reason_label ?? "").trim();
                        if (rl !== attentionReason) return false;
                    }
                    if (activitySignalKey) {
                        const k = String(it.stale_signal?.key ?? "").trim();
                        if (k !== activitySignalKey) return false;
                    }
                    return true;
                }
            }["AdminV2OpportunityWorkUnitPage.useMemo[model].filteredItems"]);
            const oqFiltered = {
                total: filteredItems.length,
                error: oq.error,
                items: filteredItems
            };
            return (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$ui$2d$v2$2f$adapters$2f$realWorkUnitFromOpportunities$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["buildRealOpportunityWorkUnitWorkspaceModel"])({
                workUnitId: workUnit.id,
                workUnitKey: workUnit.key ?? "work_unit",
                workUnitName: workUnit.name ?? "Work unit",
                departmentId,
                deptName: dept.name ?? "Department",
                departmentKey: dept.key,
                oq: oqFiltered,
                queueRowQuickActions: opportunityQueueRowActions,
                rightRailResolved: enrollmentRightRailResolved ?? [],
                rowPreviewFieldLabels: queueUi?.row_preview.fieldLabels ?? null
            });
        }
    }["AdminV2OpportunityWorkUnitPage.useMemo[model]"], [
        departmentId,
        dept,
        enrollmentRightRailResolved,
        oq,
        opportunityQueueRowActions,
        queueUi,
        searchParams,
        workUnit
    ]);
    const workUnitKpiContext = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "AdminV2OpportunityWorkUnitPage.useMemo[workUnitKpiContext]": ()=>{
            if (!workUnit?.id || !departmentId) return null;
            const summariesForKpi = queueSummaries?.map({
                "AdminV2OpportunityWorkUnitPage.useMemo[workUnitKpiContext]": (q)=>({
                        key: q.key,
                        label: q.label,
                        count: q.count,
                        counts_deferred: q.counts_deferred
                    })
            }["AdminV2OpportunityWorkUnitPage.useMemo[workUnitKpiContext]"]) ?? null;
            const qi = queueItems ? {
                queue: {
                    key: queueItems.queue.key
                },
                total: queueItems.total,
                total_omitted: queueItems.total_omitted,
                offset: queueItems.offset,
                items: queueItems.items ?? []
            } : null;
            let legacyOpportunityListTotal = null;
            if (!queueSummaries && model) {
                const badge = model.primaryQueue?.countBadge;
                if (typeof badge === "number" && !Number.isNaN(badge)) {
                    legacyOpportunityListTotal = badge;
                } else if (model.primaryQueue?.items) {
                    legacyOpportunityListTotal = model.primaryQueue.items.length;
                }
            }
            return (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$kpi$2f$surfaceContext$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["workUnitContextFromParts"])({
                workUnitId: workUnit.id,
                queueSummaries: summariesForKpi,
                queueSummariesLoading: queueSummaries === null && queueSummariesError === null,
                queueSummariesError,
                selectedQueueKey,
                queueItems: qi,
                queueItemsLoading,
                queueItemsError,
                legacyOpportunityListTotal
            });
        }
    }["AdminV2OpportunityWorkUnitPage.useMemo[workUnitKpiContext]"], [
        departmentId,
        workUnit?.id,
        queueSummaries,
        queueSummariesError,
        selectedQueueKey,
        queueItems,
        queueItemsLoading,
        queueItemsError,
        model
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "AdminV2OpportunityWorkUnitPage.useEffect": ()=>{
            if (!departmentId || !workUnit?.id) return;
            if (suppressWorkUnitKpiStrip) {
                setWuPlacementRows([]);
                setWuScopeHasPlacements(true);
                return;
            }
            let cancelled = false;
            setWuPlacementRows(undefined);
            setWuScopeHasPlacements(false);
            const init = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$workspaceDataFetch$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["workspaceDataFetchInit"])();
            void ({
                "AdminV2OpportunityWorkUnitPage.useEffect": async ()=>{
                    const tPlace0 = typeof performance !== "undefined" ? performance.now() : 0;
                    try {
                        const res = await fetch(`/api/admin/workspace-kpi-placements?surface=work_unit&department_id=${encodeURIComponent(departmentId)}&work_unit_id=${encodeURIComponent(workUnit.id)}`, {
                            ...init ?? {},
                            cache: "no-store"
                        });
                        if (!res.ok) {
                            if (!cancelled) {
                                setWuPlacementRows([]);
                                setWuScopeHasPlacements(false);
                            }
                            return;
                        }
                        const j = await res.json().catch({
                            "AdminV2OpportunityWorkUnitPage.useEffect": ()=>({})
                        }["AdminV2OpportunityWorkUnitPage.useEffect"]);
                        if (cancelled) return;
                        if (!cancelled) {
                            setWuPlacementRows(j.items ?? []);
                            setWuScopeHasPlacements(j.scope_has_placements === true);
                        }
                    } catch  {
                        if (!cancelled) {
                            setWuPlacementRows([]);
                            setWuScopeHasPlacements(false);
                        }
                    } finally{
                        if (typeof performance !== "undefined" && ("TURBOPACK compile-time value", "object") !== "undefined") {
                            console.log("[page-timing]", {
                                route: "work_unit",
                                phase: "kpi_placement",
                                duration_ms: Math.round(performance.now() - tPlace0)
                            });
                        }
                    }
                }
            })["AdminV2OpportunityWorkUnitPage.useEffect"]();
            return ({
                "AdminV2OpportunityWorkUnitPage.useEffect": ()=>{
                    cancelled = true;
                }
            })["AdminV2OpportunityWorkUnitPage.useEffect"];
        }
    }["AdminV2OpportunityWorkUnitPage.useEffect"], [
        departmentId,
        workUnit?.id,
        suppressWorkUnitKpiStrip
    ]);
    const wuResolvedPlacementKpis = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "AdminV2OpportunityWorkUnitPage.useMemo[wuResolvedPlacementKpis]": ()=>{
            if (suppressWorkUnitKpiStrip) return [];
            if (!workUnitKpiContext) return undefined;
            if (wuPlacementRows === undefined) return undefined;
            return (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$kpi$2f$resolver$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["resolveKpisForWorkUnit"])({
                placementRows: wuPlacementRows,
                scopeHasPlacementRows: wuScopeHasPlacements,
                context: workUnitKpiContext
            }).items;
        }
    }["AdminV2OpportunityWorkUnitPage.useMemo[wuResolvedPlacementKpis]"], [
        suppressWorkUnitKpiStrip,
        wuPlacementRows,
        wuScopeHasPlacements,
        workUnitKpiContext
    ]);
    const enrollmentRightRailByKey = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "AdminV2OpportunityWorkUnitPage.useMemo[enrollmentRightRailByKey]": ()=>{
            const m = new Map();
            for (const a of enrollmentRightRailResolved ?? [])m.set(a.key, a);
            return m;
        }
    }["AdminV2OpportunityWorkUnitPage.useMemo[enrollmentRightRailByKey]"], [
        enrollmentRightRailResolved
    ]);
    const needsAttentionHref = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "AdminV2OpportunityWorkUnitPage.useMemo[needsAttentionHref]": ()=>{
            if (!departmentId) return `${WORKSPACE_BASE}`;
            if (!needsAttentionWorkUnitId) return `${WORKSPACE_BASE}/dept/${encodeURIComponent(departmentId)}`;
            return `${WORKSPACE_BASE}/dept/${encodeURIComponent(departmentId)}/work-unit/${encodeURIComponent(needsAttentionWorkUnitId)}?queue=needs_attention`;
        }
    }["AdminV2OpportunityWorkUnitPage.useMemo[needsAttentionHref]"], [
        departmentId,
        needsAttentionWorkUnitId
    ]);
    const queueRowResolvedByKey = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "AdminV2OpportunityWorkUnitPage.useMemo[queueRowResolvedByKey]": ()=>{
            const m = new Map();
            for (const a of opportunityQueueRowResolved ?? [])m.set(a.key, a);
            return m;
        }
    }["AdminV2OpportunityWorkUnitPage.useMemo[queueRowResolvedByKey]"], [
        opportunityQueueRowResolved
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "AdminV2OpportunityWorkUnitPage.useEffect": ()=>{
            if (!updateStatusFormOpen) return;
            let cancelled = false;
            ({
                "AdminV2OpportunityWorkUnitPage.useEffect": async ()=>{
                    try {
                        const res = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$workspaceAdminFetchDedupe$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["dedupeAdminFetchWithTtl"])("/api/admin/status-options?entity_type=opportunities", {
                            ...(0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$workspaceDataFetch$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["workspaceDataFetchInit"])(),
                            credentials: "include"
                        }, 60_000);
                        const j = await res.json().catch({
                            "AdminV2OpportunityWorkUnitPage.useEffect": ()=>({})
                        }["AdminV2OpportunityWorkUnitPage.useEffect"]);
                        if (!cancelled && res.ok) setStatusOptions(j.options ?? []);
                    } catch  {
                        if (!cancelled) setStatusOptions([]);
                    }
                }
            })["AdminV2OpportunityWorkUnitPage.useEffect"]();
            return ({
                "AdminV2OpportunityWorkUnitPage.useEffect": ()=>{
                    cancelled = true;
                }
            })["AdminV2OpportunityWorkUnitPage.useEffect"];
        }
    }["AdminV2OpportunityWorkUnitPage.useEffect"], [
        updateStatusFormOpen
    ]);
    const opportunityWorkspaceContext = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "AdminV2OpportunityWorkUnitPage.useMemo[opportunityWorkspaceContext]": ()=>workUnit?.id && departmentId ? {
                work_unit_id: workUnit.id,
                department_id: departmentId
            } : null
    }["AdminV2OpportunityWorkUnitPage.useMemo[opportunityWorkspaceContext]"], [
        departmentId,
        workUnit?.id
    ]);
    const oppDrawerExtra = opportunityWorkspaceContext ? {
        opportunityWorkspaceContext
    } : {};
    const onAction = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "AdminV2OpportunityWorkUnitPage.useCallback[onAction]": async (action)=>{
            if (action.type === "actions.block" && action.actionId.startsWith(__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$viewModels$2f$enrollmentRightRailMerge$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["REGISTRY_RIGHT_RAIL_ACTION_ID_PREFIX"])) {
                const key = action.actionId.slice(__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$viewModels$2f$enrollmentRightRailMerge$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["REGISTRY_RIGHT_RAIL_ACTION_ID_PREFIX"].length);
                const resolved = enrollmentRightRailByKey.get(key);
                if (!resolved) return;
                const out = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$actions$2f$applyRegistryResolvedActionClient$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["applyRegistryResolvedActionClient"])(resolved, {
                    router,
                    openDrawer,
                    openForm: {
                        "AdminV2OpportunityWorkUnitPage.useCallback[onAction]": ()=>{
                        // Action forms are currently owned by the opportunity drawer (v1 scope).
                        // Right-rail actions in the enrollment work unit do not use forms yet.
                        }
                    }["AdminV2OpportunityWorkUnitPage.useCallback[onAction]"],
                    invalidate,
                    departmentId,
                    workUnitId: workUnit?.id ?? null,
                    needsAttentionHref,
                    context: {
                        surface: "right_rail",
                        department_id: departmentId,
                        work_unit_id: workUnit?.id ?? null
                    }
                });
                const wf = out.ok ? out.execution_result?.workflow_run_id : undefined;
                if (typeof wf === "string" && wf.trim()) {
                    setActionFeedback(`Workflow run ${wf.trim().slice(0, 8)}… completed.`);
                }
                return;
            }
            if (action.type === "queue.item.action" && action.payload && typeof action.payload === "object" && action.payload.source === "action_registry" && action.actionId && action.itemId) {
                const resolved = queueRowResolvedByKey.get(action.actionId);
                if (resolved && resolved.action_type === "open_form") {
                    const formKey = resolved.payload?.form_key != null ? String(resolved.payload.form_key).trim() : "";
                    if (formKey === "update_status_add_note") {
                        setUpdateStatusTargetId(action.itemId);
                        setUpdateStatusFormOpen(true);
                        return;
                    }
                    if (formKey === "contact_attempted") {
                        setContactAttemptedTargetId(action.itemId);
                        setContactAttemptedOpen(true);
                        return;
                    }
                }
                const res = await fetch("/api/admin/actions/execute", {
                    method: "POST",
                    credentials: "include",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        action_key: action.actionId,
                        entity_type: "opportunity",
                        entity_id: action.itemId,
                        context: {
                            surface: "queue_row",
                            work_unit_id: workUnit?.id ?? null,
                            department_id: departmentId
                        }
                    })
                });
                const json = await res.json().catch({
                    "AdminV2OpportunityWorkUnitPage.useCallback[onAction]": ()=>({})
                }["AdminV2OpportunityWorkUnitPage.useCallback[onAction]"]);
                if (!res.ok || !json.ok) {
                    return;
                }
                const er = json.execution_result;
                if (er?.kind === "start_workflow" && typeof er.workflow_run_id === "string" && er.workflow_run_id.trim()) {
                    setActionFeedback(`Workflow run ${er.workflow_run_id.trim().slice(0, 8)}… completed.`);
                }
                if (er?.kind === "open_drawer") {
                    if (er.drawer?.defaultSurface === "quote_intake") {
                        openDrawer({
                            type: "opportunities",
                            id: action.itemId,
                            defaultOpportunitySurface: "quote_intake",
                            ...oppDrawerExtra
                        });
                    } else {
                        openDrawer({
                            type: "opportunities",
                            id: action.itemId,
                            ...oppDrawerExtra
                        });
                    }
                    invalidate({
                        entity_type: "opportunity",
                        entity_id: action.itemId,
                        action_key: action.actionId
                    });
                    return;
                }
                if (er?.kind === "navigate" && er.href) {
                    router.push(er.href);
                    return;
                }
                invalidate({
                    entity_type: "opportunity",
                    entity_id: action.itemId,
                    action_key: action.actionId
                });
                return;
            }
            if (action.type === "queue.item.action" && action.actionId === "open_record") {
                const entityType = queueItems?.queue.entity_type;
                if (entityType === "job") {
                    openDrawer({
                        type: "jobs",
                        id: action.itemId,
                        jobRecordSurface: "drawer"
                    });
                    return;
                }
                if (entityType === "schedule") {
                    openDrawer({
                        type: "schedules",
                        id: action.itemId
                    });
                    return;
                }
                if (entityType === "opportunity") {
                    openDrawer({
                        type: "opportunities",
                        id: action.itemId,
                        ...oppDrawerExtra
                    });
                    return;
                }
            }
            if (action.type === "queue.item.action" && action.actionId === "open_record") {
                openDrawer({
                    type: "opportunities",
                    id: action.itemId,
                    ...oppDrawerExtra
                });
                return;
            }
            if (action.type === "queue.item.action" && action.actionId && action.itemId) {
                if (action.actionId === "crm_mailto" || action.actionId === "crm_tel") {
                    const href = action.payload && typeof action.payload.href === "string" ? action.payload.href : "";
                    if (href) window.location.href = href;
                    return;
                }
                // Map queue quick actions → opportunity record actions (event keys).
                const eventKey = action.actionId;
                if (eventKey === "start_quote" || eventKey === "open_quote") {
                    openDrawer({
                        type: "opportunities",
                        id: action.itemId,
                        defaultOpportunitySurface: "quote_intake",
                        ...oppDrawerExtra
                    });
                    return;
                }
                const r = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$recordChrome$2f$executeOpportunityRecordAction$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["executeOpportunityRecordAction"])({
                    opportunityId: action.itemId,
                    eventKey
                });
                if (r.ok) {
                // Drawer close will cause refetch in other lanes; here we just rely on refresh-on-next navigation.
                // Keep simple: do nothing.
                }
                return;
            }
            if (action.type === "actions.block") {
                if (action.actionId === "back_department" || action.actionId === "wu_back_department") {
                    window.location.href = `${WORKSPACE_BASE}/dept/${encodeURIComponent(departmentId)}`;
                    return;
                }
                if (action.actionId === "open_admin_opportunities" || action.actionId === "wu_open_all_inquiries") {
                    window.alert("Coming next: Inquiry browser in AdminV2.");
                    return;
                }
                if (action.actionId === "wu_new_inquiry") {
                    window.alert("Coming next: Create inquiry in AdminV2.");
                    return;
                }
                if (action.actionId === "wu_open_needs_attention") {
                    if (needsAttentionWorkUnitId) {
                        window.location.href = `${WORKSPACE_BASE}/dept/${encodeURIComponent(departmentId)}/work-unit/${encodeURIComponent(needsAttentionWorkUnitId)}`;
                    } else {
                        window.location.href = `${WORKSPACE_BASE}/dept/${encodeURIComponent(departmentId)}`;
                    }
                    return;
                }
                if (action.actionId === "wu_manage_work_units") {
                    window.location.href = "/adminV2/settings/work-units";
                    return;
                }
                if (action.actionId === "wu_workspace_root") {
                    window.location.href = WORKSPACE_BASE;
                }
            }
        }
    }["AdminV2OpportunityWorkUnitPage.useCallback[onAction]"], [
        departmentId,
        enrollmentRightRailByKey,
        needsAttentionHref,
        needsAttentionWorkUnitId,
        openDrawer,
        oppDrawerExtra,
        opportunityWorkspaceContext,
        queueItems?.queue.entity_type,
        router,
        workUnit?.id
    ]);
    const deptName = dept?.name?.trim() || "Department";
    const wuName = workUnit?.name?.trim() || "Work unit";
    const mergedWorkspaceModel = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "AdminV2OpportunityWorkUnitPage.useMemo[mergedWorkspaceModel]": ()=>{
            const base = queueModel ?? model;
            if (!base || !workUnitKpiContext) return base;
            if (suppressWorkUnitKpiStrip) {
                return {
                    ...base,
                    kpis: []
                };
            }
            if (wuPlacementRows === undefined) {
                return {
                    ...base,
                    kpis: []
                };
            }
            const kpis = wuResolvedPlacementKpis ?? (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$kpi$2f$baseline$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["buildDefaultWorkUnitKpis"])(workUnitKpiContext);
            return {
                ...base,
                kpis
            };
        }
    }["AdminV2OpportunityWorkUnitPage.useMemo[mergedWorkspaceModel]"], [
        queueModel,
        model,
        workUnitKpiContext,
        wuResolvedPlacementKpis,
        suppressWorkUnitKpiStrip,
        wuPlacementRows
    ]);
    const effectiveModel = mergedWorkspaceModel;
    const workUnitKpiStripPlaceholder = !suppressWorkUnitKpiStrip && wuPlacementRows === undefined;
    /** Shell + header render after WU + dept; queue summaries and rows stay in-lane (Phase 3.1). */ const workUnitPageCoherent = !loading && Boolean(workUnit) && Boolean(dept) && !error;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$workspace$2f$WorkspaceChrome$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["WorkspaceChrome"], {
        variant: "bridge",
        breadcrumbs: [
            {
                href: WORKSPACE_BASE,
                label: "Workspace"
            },
            {
                href: `${WORKSPACE_BASE}/dept/${departmentId}`,
                label: deptName
            },
            {
                label: wuName
            }
        ],
        title: wuName,
        subtitle: "",
        children: !workUnitPageCoherent ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$workspace$2f$AdminV2RouteLoadingState$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AdminV2RouteLoadingState"], {
            variant: "work_unit",
            showRibbon: false
        }, void 0, false, {
            fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx",
            lineNumber: 2066,
            columnNumber: 17
        }, this) : effectiveModel ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
            children: [
                actionFeedback ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "mb-2 rounded-md border border-alloy-pine/30 bg-emerald-50/90 px-3 py-2 text-sm text-alloy-midnight",
                    role: "status",
                    children: [
                        actionFeedback,
                        " ",
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                            href: "/adminV2/workflows",
                            className: "font-semibold text-alloy-blue hover:underline",
                            children: "View workflows"
                        }, void 0, false, {
                            fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx",
                            lineNumber: 2075,
                            columnNumber: 29
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx",
                    lineNumber: 2070,
                    columnNumber: 25
                }, this) : null,
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$workspace$2f$shells$2f$WorkUnitWorkspace$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                    model: effectiveModel,
                    onAction: onAction,
                    headerQueuePicker: headerQueuePickerSlot,
                    kpiStripPlaceholder: workUnitKpiStripPlaceholder,
                    primaryFooterSlot: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$workspace$2f$blocks$2f$AutomationWorkflowsBlock$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AutomationWorkflowsBlock"], {
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
                        fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx",
                        lineNumber: 2086,
                        columnNumber: 29
                    }, void 0)
                }, void 0, false, {
                    fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx",
                    lineNumber: 2080,
                    columnNumber: 21
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$opportunity$2f$actions$2f$UpdateStatusAddNoteModal$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["UpdateStatusAddNoteModal"], {
                    open: updateStatusFormOpen,
                    title: "Update status",
                    statusOptions: statusOptions,
                    transitionContext: {
                        entityType: "opportunities",
                        departmentId: departmentId,
                        workUnitId: workUnit?.id ?? null,
                        actionKey: "update_status_add_note"
                    },
                    onClose: ()=>{
                        setUpdateStatusFormOpen(false);
                        setUpdateStatusTargetId(null);
                    },
                    onSubmit: async (payload)=>{
                        if (!updateStatusTargetId) return;
                        const res = await fetch("/api/admin/actions/execute", {
                            method: "POST",
                            credentials: "include",
                            headers: {
                                "Content-Type": "application/json"
                            },
                            body: JSON.stringify({
                                action_key: "update_status_add_note",
                                entity_type: "opportunity",
                                entity_id: updateStatusTargetId,
                                context: {
                                    surface: "queue_row",
                                    work_unit_id: workUnit?.id ?? null,
                                    department_id: departmentId
                                },
                                payload
                            })
                        });
                        const json = await res.json().catch(()=>({}));
                        if (!res.ok || !json.ok) throw new Error(json.error ?? "Update failed");
                        invalidate({
                            entity_type: "opportunity",
                            entity_id: updateStatusTargetId,
                            action_key: "update_status_add_note"
                        });
                    }
                }, void 0, false, {
                    fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx",
                    lineNumber: 2100,
                    columnNumber: 21
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$opportunity$2f$actions$2f$ContactAttemptedModal$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ContactAttemptedModal"], {
                    open: contactAttemptedOpen,
                    title: "Log contact attempt",
                    onClose: ()=>{
                        setContactAttemptedOpen(false);
                        setContactAttemptedTargetId(null);
                    },
                    onSubmit: async (payload)=>{
                        if (!contactAttemptedTargetId) return;
                        const res = await fetch("/api/admin/actions/execute", {
                            method: "POST",
                            credentials: "include",
                            headers: {
                                "Content-Type": "application/json"
                            },
                            body: JSON.stringify({
                                action_key: "contact_attempted",
                                entity_type: "opportunity",
                                entity_id: contactAttemptedTargetId,
                                context: {
                                    surface: "queue_row",
                                    work_unit_id: workUnit?.id ?? null,
                                    department_id: departmentId
                                },
                                payload
                            })
                        });
                        const json = await res.json().catch(()=>({}));
                        if (!res.ok || !json.ok) throw new Error(json.error ?? "Update failed");
                        invalidate({
                            entity_type: "opportunity",
                            entity_id: contactAttemptedTargetId,
                            action_key: "contact_attempted"
                        });
                    }
                }, void 0, false, {
                    fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx",
                    lineNumber: 2137,
                    columnNumber: 21
                }, this)
            ]
        }, void 0, true) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
            className: "text-sm text-alloy-ember px-1 py-4",
            children: error ?? "Unable to load this work unit."
        }, void 0, false, {
            fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx",
            lineNumber: 2173,
            columnNumber: 17
        }, this)
    }, void 0, false, {
        fileName: "[project]/app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx",
        lineNumber: 2055,
        columnNumber: 9
    }, this);
}
_s(AdminV2OpportunityWorkUnitPage, "o4IN9g84Nmj1BtzP2KnSm/g9adg=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useParams"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useSearchParams"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRouter"],
        __TURBOPACK__imported__module__$5b$project$5d2f$contexts$2f$AdminDrawerContext$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAdminDrawer"],
        __TURBOPACK__imported__module__$5b$project$5d2f$contexts$2f$AdminViewerTimezoneContext$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAdminViewerTimezone"]
    ];
});
_c = AdminV2OpportunityWorkUnitPage;
var _c;
__turbopack_context__.k.register(_c, "AdminV2OpportunityWorkUnitPage");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
]);

//# sourceMappingURL=_126d7736._.js.map