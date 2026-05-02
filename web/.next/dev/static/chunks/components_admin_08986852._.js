(globalThis.TURBOPACK || (globalThis.TURBOPACK = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/components/admin/Drawer.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>Drawer
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/styles/tokens/colors.ts [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
function Drawer({ isOpen, onClose, title, headerSubtitle, headerTitleRight, headerRecordContext, statusBadge, headerActions, headerSignals, headerExtra, children, zIndexBackdrop = 40, zIndexPanel = 50, accentColor, variant = "legacy", presentation = "sidebar", panelClassName, recordModalTone, recordModalContextStyle }) {
    _s();
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "Drawer.useEffect": ()=>{
            if (isOpen) {
                document.body.style.overflow = "hidden";
            } else {
                document.body.style.overflow = "";
            }
            return ({
                "Drawer.useEffect": ()=>{
                    document.body.style.overflow = "";
                }
            })["Drawer.useEffect"];
        }
    }["Drawer.useEffect"], [
        isOpen
    ]);
    if (!isOpen) return null;
    const titleContent = title != null && (typeof title === "string" || typeof title === "number" || /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["isValidElement"])(title)) ? title : "—";
    const isV2 = variant === "adminV2";
    const isModal = isV2 && presentation === "modal";
    const cleaningRecordModalTone = isModal && recordModalTone === "cleaning-v2";
    const leftAccent = accentColor ?? (isV2 ? __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["palette"].midnightForge : undefined);
    const panelStyle = isModal ? {
        zIndex: zIndexPanel,
        backgroundColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["neutral"].surface,
        color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["neutral"].textPrimary,
        borderColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].border,
        boxShadow: cleaningRecordModalTone ? "0 12px 40px rgba(39, 63, 82, 0.1), 0 2px 8px rgba(39, 63, 82, 0.04)" : __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].cardShadow,
        ...cleaningRecordModalTone && recordModalContextStyle ? {
            borderLeftWidth: 3,
            borderLeftStyle: "solid",
            borderLeftColor: "var(--vc-record-rim)"
        } : {}
    } : {
        zIndex: zIndexPanel,
        ...isV2 ? {
            backgroundColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["neutral"].surface,
            color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["neutral"].textPrimary,
            borderColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].border,
            borderLeftWidth: 4,
            borderLeftStyle: "solid",
            borderLeftColor: leftAccent ?? __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["palette"].midnightForge
        } : accentColor ? {
            borderLeftWidth: 4,
            borderLeftStyle: "solid",
            borderLeftColor: accentColor
        } : {}
    };
    const modalBodyBg = isModal && isV2 ? cleaningRecordModalTone ? {
        backgroundColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["neutral"].background,
        color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["neutral"].textPrimary
    } : {
        background: `linear-gradient(180deg, ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["palette"].riverStone} 0%, color-mix(in srgb, ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["palette"].riverStone} 88%, ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].canvasFieldDepth}) 100%)`,
        color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["neutral"].textPrimary
    } : isV2 ? {
        backgroundColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["neutral"].background,
        color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["neutral"].textPrimary
    } : undefined;
    const subtitleTypographyClass = cleaningRecordModalTone ? "mt-1.5 text-[13px] font-normal leading-snug" : `mt-1 text-sm font-medium ${isV2 ? "" : "text-alloy-midnight/55"}`;
    const subtitleStyle = isV2 && headerSubtitle != null && headerSubtitle !== false ? {
        color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].textSecondary,
        ...cleaningRecordModalTone ? {
            opacity: 0.88
        } : {}
    } : undefined;
    /** Rich ReactNode subtitles must not be wrapped in <p> — avoids invalid nesting (e.g. div inside p). */ const renderHeaderSubtitle = ()=>{
        if (headerSubtitle == null || headerSubtitle === false) return null;
        const isPlainText = typeof headerSubtitle === "string" || typeof headerSubtitle === "number";
        if (isPlainText) {
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: subtitleTypographyClass,
                style: subtitleStyle,
                children: headerSubtitle
            }, void 0, false, {
                fileName: "[project]/components/admin/Drawer.tsx",
                lineNumber: 165,
                columnNumber: 17
            }, this);
        }
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: subtitleTypographyClass,
            style: subtitleStyle,
            children: headerSubtitle
        }, void 0, false, {
            fileName: "[project]/components/admin/Drawer.tsx",
            lineNumber: 171,
            columnNumber: 13
        }, this);
    };
    const headerBlock = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: `sticky top-0 ${isV2 ? "z-20" : "z-10"} shrink-0 ${cleaningRecordModalTone ? "border-b border-solid" : `border-b ${isV2 ? "" : "border-admin-border bg-admin-surface-card"}`}`,
                style: isV2 ? {
                    ...cleaningRecordModalTone ? {
                        backgroundColor: "var(--vc-drawer-header-bg, #ffffff)",
                        borderBottomColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].border,
                        borderRightWidth: 3,
                        borderRightStyle: "solid",
                        borderRightColor: "var(--vc-header-rail-accent)"
                    } : {
                        backgroundColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["neutral"].surface,
                        borderBottomColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].border
                    }
                } : undefined,
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: `${cleaningRecordModalTone ? "px-6 pt-5 pb-1.5" : "px-6 pt-4 pb-2"} ${headerTitleRight != null && headerTitleRight !== false ? "flex items-start justify-between gap-4" : ""}`,
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: headerTitleRight != null && headerTitleRight !== false ? "min-w-0 flex-1" : "",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                                        id: isModal ? "admin-drawer-title" : undefined,
                                        className: cleaningRecordModalTone ? "text-[1.375rem] sm:text-2xl font-semibold tracking-tight leading-[1.2] break-words text-[rgb(39,63,82)]" : `text-xl font-bold leading-snug break-words ${isV2 ? "" : "text-alloy-forge"}`,
                                        style: isV2 && !cleaningRecordModalTone ? {
                                            color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["neutral"].textPrimary
                                        } : undefined,
                                        children: titleContent
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/Drawer.tsx",
                                        lineNumber: 206,
                                        columnNumber: 25
                                    }, this),
                                    renderHeaderSubtitle()
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/admin/Drawer.tsx",
                                lineNumber: 205,
                                columnNumber: 21
                            }, this),
                            headerTitleRight != null && headerTitleRight !== false ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex shrink-0 items-start gap-3",
                                children: [
                                    headerTitleRight,
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                        type: "button",
                                        onClick: onClose,
                                        className: `shrink-0 text-2xl leading-none transition-colors p-1 ${isV2 ? "" : "text-alloy-midnight/70 hover:text-alloy-forge"}`,
                                        style: isV2 ? {
                                            color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].textSecondary
                                        } : undefined,
                                        "aria-label": "Close",
                                        children: "×"
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/Drawer.tsx",
                                        lineNumber: 222,
                                        columnNumber: 29
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/admin/Drawer.tsx",
                                lineNumber: 220,
                                columnNumber: 25
                            }, this) : null
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/admin/Drawer.tsx",
                        lineNumber: 200,
                        columnNumber: 17
                    }, this),
                    headerRecordContext != null && headerRecordContext !== false && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        "data-adminv2-drawer-header-record-context": true,
                        className: `border-t border-b px-6 py-2 ${cleaningRecordModalTone ? "border-[var(--vc-drawer-hairline,rgba(39,63,82,0.12))] bg-[color-mix(in_srgb,var(--vc-drawer-header-bg,#fff)_92%,rgba(39,63,82,0.04))]" : "border-alloy-stone/15 bg-alloy-stone/[0.035]"}`,
                        style: isV2 && !cleaningRecordModalTone ? {
                            borderTopColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].border,
                            borderBottomColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].border,
                            backgroundColor: "rgba(246, 248, 252, 0.65)"
                        } : undefined,
                        children: headerRecordContext
                    }, void 0, false, {
                        fileName: "[project]/components/admin/Drawer.tsx",
                        lineNumber: 235,
                        columnNumber: 21
                    }, this),
                    headerTitleRight == null || headerTitleRight === false ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: `px-6 flex items-center justify-between ${cleaningRecordModalTone ? "pb-3 gap-3" : "pb-4 gap-4"}`,
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: `flex items-center min-w-0 ${cleaningRecordModalTone ? "gap-2" : "gap-3"}`,
                                children: [
                                    statusBadge != null && statusBadge !== false && statusBadge,
                                    headerActions
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/admin/Drawer.tsx",
                                lineNumber: 255,
                                columnNumber: 25
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                type: "button",
                                onClick: onClose,
                                className: `shrink-0 text-2xl leading-none transition-colors p-1 ${isV2 ? "" : "text-alloy-midnight/70 hover:text-alloy-forge"}`,
                                style: isV2 ? {
                                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].textSecondary
                                } : undefined,
                                "aria-label": "Close",
                                children: "×"
                            }, void 0, false, {
                                fileName: "[project]/components/admin/Drawer.tsx",
                                lineNumber: 259,
                                columnNumber: 25
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/admin/Drawer.tsx",
                        lineNumber: 252,
                        columnNumber: 21
                    }, this) : null,
                    headerSignals != null && headerSignals !== false && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        "data-adminv2-record-modal-signals-wrap": true,
                        className: `px-6 ${cleaningRecordModalTone ? "pb-2.5 pt-0" : "pb-3"}`,
                        style: isV2 ? {
                            borderBottomWidth: cleaningRecordModalTone ? 0 : 1,
                            borderBottomStyle: "solid",
                            borderBottomColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].border,
                            backgroundColor: cleaningRecordModalTone ? "transparent" : undefined
                        } : undefined,
                        children: headerSignals
                    }, void 0, false, {
                        fileName: "[project]/components/admin/Drawer.tsx",
                        lineNumber: 271,
                        columnNumber: 21
                    }, this),
                    headerExtra != null && headerExtra !== false && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        "data-adminv2-record-modal-tabs-wrap": true,
                        className: `px-6 pb-2.5 pt-2 ${cleaningRecordModalTone ? "border-t border-solid" : `border-t ${isV2 ? "" : "border-admin-border border-t-alloy-blue/30"}`}`,
                        style: isV2 ? {
                            borderTopColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].border,
                            backgroundColor: cleaningRecordModalTone ? __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["neutral"].surface : undefined
                        } : undefined,
                        children: headerExtra
                    }, void 0, false, {
                        fileName: "[project]/components/admin/Drawer.tsx",
                        lineNumber: 291,
                        columnNumber: 21
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/admin/Drawer.tsx",
                lineNumber: 179,
                columnNumber: 13
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                "data-adminv2-record-modal-scroll": true,
                className: `flex-1 overflow-y-auto min-h-0 ${isModal ? cleaningRecordModalTone ? "px-4 py-2.5 sm:px-5 sm:py-3.5" : "px-4 py-3 sm:px-5 sm:py-4" : "p-6"} ${isV2 ? "" : "bg-admin-surface-card"}`,
                style: modalBodyBg,
                children: children
            }, void 0, false, {
                fileName: "[project]/components/admin/Drawer.tsx",
                lineNumber: 307,
                columnNumber: 13
            }, this)
        ]
    }, void 0, true);
    if (isModal) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "fixed inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity duration-200",
                    style: {
                        zIndex: zIndexBackdrop
                    },
                    onClick: onClose,
                    "aria-hidden": true
                }, void 0, false, {
                    fileName: "[project]/components/admin/Drawer.tsx",
                    lineNumber: 320,
                    columnNumber: 17
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "fixed inset-0 flex items-center justify-center p-3 sm:p-6 pointer-events-none",
                    style: {
                        zIndex: zIndexPanel
                    },
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        "data-adminv2-drawer": "true",
                        "data-adminv2-record-modal": "true",
                        "data-adminv2-record-modal-tone": cleaningRecordModalTone ? "cleaning-v2" : undefined,
                        className: `pointer-events-auto flex max-h-[min(920px,92vh)] w-full flex-col overflow-hidden rounded-2xl border border-solid shadow-2xl animate-in fade-in zoom-in-[0.99] duration-300 ${cleaningRecordModalTone ? "min-h-[min(520px,78vh)]" : ""} ${panelClassName ?? "max-w-5xl"}`,
                        style: cleaningRecordModalTone && recordModalContextStyle ? {
                            ...recordModalContextStyle,
                            ...panelStyle
                        } : panelStyle,
                        role: "dialog",
                        "aria-modal": "true",
                        "aria-labelledby": "admin-drawer-title",
                        children: headerBlock
                    }, void 0, false, {
                        fileName: "[project]/components/admin/Drawer.tsx",
                        lineNumber: 330,
                        columnNumber: 21
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/components/admin/Drawer.tsx",
                    lineNumber: 326,
                    columnNumber: 17
                }, this)
            ]
        }, void 0, true);
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "fixed inset-0 bg-black/50",
                style: {
                    zIndex: zIndexBackdrop
                },
                onClick: onClose
            }, void 0, false, {
                fileName: "[project]/components/admin/Drawer.tsx",
                lineNumber: 353,
                columnNumber: 13
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                "data-adminv2-drawer": isV2 ? "true" : undefined,
                className: `fixed right-0 top-0 bottom-0 w-full shadow-xl flex flex-col border ${panelClassName ?? "max-w-2xl"} ${isV2 ? "border-solid" : `bg-admin-surface-card border-admin-border ${accentColor ? "" : "border-l-4 border-alloy-blue/40"}`}`,
                style: panelStyle,
                children: headerBlock
            }, void 0, false, {
                fileName: "[project]/components/admin/Drawer.tsx",
                lineNumber: 358,
                columnNumber: 13
            }, this)
        ]
    }, void 0, true);
}
_s(Drawer, "OD7bBpZva5O2jO+Puf00hKivP7c=");
_c = Drawer;
var _c;
__turbopack_context__.k.register(_c, "Drawer");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/components/admin/AssociatedDocumentUploadModal.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>AssociatedDocumentUploadModal
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$Drawer$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/components/admin/Drawer.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$v1DocumentEntities$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/v1DocumentEntities.ts [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
;
function AssociatedDocumentUploadModal({ isOpen, onClose, onSuccess, lockAssociation = false, fixedEntityType, fixedEntityId }) {
    _s();
    const hintsListId = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useId"])().replace(/:/g, "");
    const [entityType, setEntityType] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("customer");
    const [entityId, setEntityId] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [options, setOptions] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])([]);
    const [optionsLoading, setOptionsLoading] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [optionsError, setOptionsError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [labelFilter, setLabelFilter] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [docType, setDocType] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [title, setTitle] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [file, setFile] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [uploading, setUploading] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [uploadError, setUploadError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [docTypeHints, setDocTypeHints] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])([]);
    const effectiveType = lockAssociation && fixedEntityType ? fixedEntityType : entityType;
    const effectiveId = lockAssociation && fixedEntityId ? fixedEntityId : entityId;
    const filteredOptions = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "AssociatedDocumentUploadModal.useMemo[filteredOptions]": ()=>{
            const q = labelFilter.trim().toLowerCase();
            if (!q) return options;
            return options.filter({
                "AssociatedDocumentUploadModal.useMemo[filteredOptions]": (o)=>o.label.toLowerCase().includes(q)
            }["AssociatedDocumentUploadModal.useMemo[filteredOptions]"]);
        }
    }["AssociatedDocumentUploadModal.useMemo[filteredOptions]"], [
        options,
        labelFilter
    ]);
    const loadHints = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "AssociatedDocumentUploadModal.useCallback[loadHints]": async ()=>{
            try {
                const res = await fetch("/api/admin/org-settings");
                const json = await res.json().catch({
                    "AssociatedDocumentUploadModal.useCallback[loadHints]": ()=>({})
                }["AssociatedDocumentUploadModal.useCallback[loadHints]"]);
                if (!res.ok) return;
                const meta = json.metadata ?? {};
                const raw = meta.v1_document_type_hints;
                const list = Array.isArray(raw) ? raw : typeof raw === "string" ? [
                    raw
                ] : [];
                setDocTypeHints(list.map({
                    "AssociatedDocumentUploadModal.useCallback[loadHints]": (s)=>String(s).trim()
                }["AssociatedDocumentUploadModal.useCallback[loadHints]"]).filter(Boolean));
            } catch  {
                setDocTypeHints([]);
            }
        }
    }["AssociatedDocumentUploadModal.useCallback[loadHints]"], []);
    const loadOptions = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "AssociatedDocumentUploadModal.useCallback[loadOptions]": async ()=>{
            if (lockAssociation) return;
            setOptionsLoading(true);
            setOptionsError(null);
            try {
                const res = await fetch(`/api/admin/documents/entity-options?entity_type=${encodeURIComponent(entityType)}`);
                const json = await res.json().catch({
                    "AssociatedDocumentUploadModal.useCallback[loadOptions]": ()=>({})
                }["AssociatedDocumentUploadModal.useCallback[loadOptions]"]);
                if (!res.ok) throw new Error(json.error ?? "Failed to load records");
                const opts = json.options ?? [];
                setOptions(opts);
                setEntityId("");
            } catch (e) {
                setOptionsError(e.message);
                setOptions([]);
            } finally{
                setOptionsLoading(false);
            }
        }
    }["AssociatedDocumentUploadModal.useCallback[loadOptions]"], [
        entityType,
        lockAssociation
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "AssociatedDocumentUploadModal.useEffect": ()=>{
            if (!isOpen) return;
            loadHints();
        }
    }["AssociatedDocumentUploadModal.useEffect"], [
        isOpen,
        loadHints
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "AssociatedDocumentUploadModal.useEffect": ()=>{
            if (!isOpen) return;
            if (lockAssociation) {
                setEntityType(fixedEntityType ?? "customer");
                setEntityId(fixedEntityId ?? "");
                setOptions([]);
                setOptionsError(null);
                return;
            }
            loadOptions();
        }
    }["AssociatedDocumentUploadModal.useEffect"], [
        isOpen,
        lockAssociation,
        fixedEntityType,
        fixedEntityId,
        entityType,
        loadOptions
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "AssociatedDocumentUploadModal.useEffect": ()=>{
            if (!isOpen) {
                setLabelFilter("");
                setDocType("");
                setTitle("");
                setFile(null);
                setUploadError(null);
                setOptionsError(null);
                if (!lockAssociation) {
                    setEntityType("customer");
                    setEntityId("");
                    setOptions([]);
                }
            }
        }
    }["AssociatedDocumentUploadModal.useEffect"], [
        isOpen,
        lockAssociation
    ]);
    const fixedLabel = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "AssociatedDocumentUploadModal.useMemo[fixedLabel]": ()=>{
            if (!lockAssociation || !fixedEntityType) return "";
            const opt = __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$v1DocumentEntities$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["V1_DOCUMENT_ENTITY_OPTIONS"].find({
                "AssociatedDocumentUploadModal.useMemo[fixedLabel].opt": (o)=>o.value === fixedEntityType
            }["AssociatedDocumentUploadModal.useMemo[fixedLabel].opt"]);
            return opt?.label ?? fixedEntityType;
        }
    }["AssociatedDocumentUploadModal.useMemo[fixedLabel]"], [
        lockAssociation,
        fixedEntityType
    ]);
    const shortId = (id)=>id.length <= 14 ? id : `${id.slice(0, 8)}…`;
    const submit = async ()=>{
        setUploadError(null);
        if (!file) {
            setUploadError("Choose a file to upload.");
            return;
        }
        if (!effectiveId?.trim()) {
            setUploadError("Select the record this document belongs to.");
            return;
        }
        setUploading(true);
        try {
            const fd = new FormData();
            fd.set("file", file);
            fd.set("entity_type", effectiveType);
            fd.set("entity_id", effectiveId.trim());
            if (docType.trim()) fd.set("doc_type", docType.trim());
            if (title.trim()) fd.set("title", title.trim());
            const res = await fetch("/api/admin/documents/upload", {
                method: "POST",
                body: fd
            });
            const json = await res.json().catch(()=>({}));
            if (!res.ok) throw new Error(json.error ?? `Upload failed (${res.status})`);
            onSuccess();
            onClose();
        } catch (e) {
            setUploadError(e.message);
        } finally{
            setUploading(false);
        }
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$Drawer$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
        isOpen: isOpen,
        onClose: ()=>!uploading && onClose(),
        title: "Attach document",
        zIndexBackdrop: 60,
        zIndexPanel: 70,
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "space-y-4 text-sm",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                    className: "text-alloy-midnight/70 text-xs",
                    children: "Documents must be linked to a customer, vendor, opportunity, contact, person, job, or schedule."
                }, void 0, false, {
                    fileName: "[project]/components/admin/AssociatedDocumentUploadModal.tsx",
                    lineNumber: 160,
                    columnNumber: 17
                }, this),
                lockAssociation ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "rounded-md border border-alloy-stone/30 bg-alloy-stone/5 px-3 py-2",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                            className: "text-xs font-medium text-alloy-midnight/60",
                            children: "Linked record"
                        }, void 0, false, {
                            fileName: "[project]/components/admin/AssociatedDocumentUploadModal.tsx",
                            lineNumber: 166,
                            columnNumber: 25
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                            className: "text-alloy-forge/90 font-medium",
                            children: [
                                fixedLabel,
                                fixedEntityId ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
                                    children: [
                                        " · ",
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "font-mono text-xs font-normal text-alloy-midnight/80",
                                            children: shortId(fixedEntityId)
                                        }, void 0, false, {
                                            fileName: "[project]/components/admin/AssociatedDocumentUploadModal.tsx",
                                            lineNumber: 172,
                                            columnNumber: 37
                                        }, this)
                                    ]
                                }, void 0, true) : null
                            ]
                        }, void 0, true, {
                            fileName: "[project]/components/admin/AssociatedDocumentUploadModal.tsx",
                            lineNumber: 167,
                            columnNumber: 25
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/components/admin/AssociatedDocumentUploadModal.tsx",
                    lineNumber: 165,
                    columnNumber: 21
                }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                    className: "block text-xs font-medium text-alloy-midnight/60 mb-0.5",
                                    children: "Record type"
                                }, void 0, false, {
                                    fileName: "[project]/components/admin/AssociatedDocumentUploadModal.tsx",
                                    lineNumber: 180,
                                    columnNumber: 29
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                                    value: entityType,
                                    onChange: (e)=>setEntityType(e.target.value),
                                    className: "w-full px-2 py-1.5 border rounded text-sm",
                                    children: __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$v1DocumentEntities$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["V1_DOCUMENT_ENTITY_OPTIONS"].map((o)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                            value: o.value,
                                            children: o.label
                                        }, o.value, false, {
                                            fileName: "[project]/components/admin/AssociatedDocumentUploadModal.tsx",
                                            lineNumber: 187,
                                            columnNumber: 37
                                        }, this))
                                }, void 0, false, {
                                    fileName: "[project]/components/admin/AssociatedDocumentUploadModal.tsx",
                                    lineNumber: 181,
                                    columnNumber: 29
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/components/admin/AssociatedDocumentUploadModal.tsx",
                            lineNumber: 179,
                            columnNumber: 25
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                    className: "block text-xs font-medium text-alloy-midnight/60 mb-0.5",
                                    children: "Search / filter"
                                }, void 0, false, {
                                    fileName: "[project]/components/admin/AssociatedDocumentUploadModal.tsx",
                                    lineNumber: 194,
                                    columnNumber: 29
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                    value: labelFilter,
                                    onChange: (e)=>setLabelFilter(e.target.value),
                                    placeholder: "Filter loaded records…",
                                    className: "w-full px-2 py-1.5 border rounded text-sm mb-2"
                                }, void 0, false, {
                                    fileName: "[project]/components/admin/AssociatedDocumentUploadModal.tsx",
                                    lineNumber: 195,
                                    columnNumber: 29
                                }, this),
                                optionsLoading ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                    className: "text-xs text-alloy-midnight/50",
                                    children: "Loading records…"
                                }, void 0, false, {
                                    fileName: "[project]/components/admin/AssociatedDocumentUploadModal.tsx",
                                    lineNumber: 202,
                                    columnNumber: 33
                                }, this) : optionsError ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                    className: "text-xs text-red-600",
                                    children: optionsError
                                }, void 0, false, {
                                    fileName: "[project]/components/admin/AssociatedDocumentUploadModal.tsx",
                                    lineNumber: 204,
                                    columnNumber: 33
                                }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                                    value: entityId,
                                    onChange: (e)=>setEntityId(e.target.value),
                                    className: "w-full px-2 py-1.5 border rounded text-sm",
                                    size: Math.min(8, Math.max(3, filteredOptions.length || 3)),
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                            value: "",
                                            children: "— Select record —"
                                        }, void 0, false, {
                                            fileName: "[project]/components/admin/AssociatedDocumentUploadModal.tsx",
                                            lineNumber: 212,
                                            columnNumber: 37
                                        }, this),
                                        filteredOptions.map((o)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                value: o.id,
                                                children: o.label
                                            }, o.id, false, {
                                                fileName: "[project]/components/admin/AssociatedDocumentUploadModal.tsx",
                                                lineNumber: 214,
                                                columnNumber: 41
                                            }, this))
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/components/admin/AssociatedDocumentUploadModal.tsx",
                                    lineNumber: 206,
                                    columnNumber: 33
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                    className: "text-[11px] text-alloy-midnight/45 mt-1",
                                    children: "Showing up to 40 matches (recent or alphabetical). Refine with the filter above."
                                }, void 0, false, {
                                    fileName: "[project]/components/admin/AssociatedDocumentUploadModal.tsx",
                                    lineNumber: 220,
                                    columnNumber: 29
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/components/admin/AssociatedDocumentUploadModal.tsx",
                            lineNumber: 193,
                            columnNumber: 25
                        }, this)
                    ]
                }, void 0, true),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                            className: "block text-xs font-medium text-alloy-midnight/60 mb-0.5",
                            children: "File *"
                        }, void 0, false, {
                            fileName: "[project]/components/admin/AssociatedDocumentUploadModal.tsx",
                            lineNumber: 228,
                            columnNumber: 21
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                            type: "file",
                            onChange: (e)=>setFile(e.target.files?.[0] ?? null),
                            className: "w-full text-sm"
                        }, void 0, false, {
                            fileName: "[project]/components/admin/AssociatedDocumentUploadModal.tsx",
                            lineNumber: 229,
                            columnNumber: 21
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/components/admin/AssociatedDocumentUploadModal.tsx",
                    lineNumber: 227,
                    columnNumber: 17
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                            className: "block text-xs font-medium text-alloy-midnight/60 mb-0.5",
                            children: "Doc type (optional)"
                        }, void 0, false, {
                            fileName: "[project]/components/admin/AssociatedDocumentUploadModal.tsx",
                            lineNumber: 237,
                            columnNumber: 21
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                            value: docType,
                            onChange: (e)=>setDocType(e.target.value),
                            list: hintsListId,
                            placeholder: "e.g. contract, w9",
                            className: "w-full px-2 py-1.5 border rounded text-sm"
                        }, void 0, false, {
                            fileName: "[project]/components/admin/AssociatedDocumentUploadModal.tsx",
                            lineNumber: 238,
                            columnNumber: 21
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("datalist", {
                            id: hintsListId,
                            children: docTypeHints.map((h)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                    value: h
                                }, h, false, {
                                    fileName: "[project]/components/admin/AssociatedDocumentUploadModal.tsx",
                                    lineNumber: 247,
                                    columnNumber: 29
                                }, this))
                        }, void 0, false, {
                            fileName: "[project]/components/admin/AssociatedDocumentUploadModal.tsx",
                            lineNumber: 245,
                            columnNumber: 21
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/components/admin/AssociatedDocumentUploadModal.tsx",
                    lineNumber: 236,
                    columnNumber: 17
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                            className: "block text-xs font-medium text-alloy-midnight/60 mb-0.5",
                            children: "Title (optional)"
                        }, void 0, false, {
                            fileName: "[project]/components/admin/AssociatedDocumentUploadModal.tsx",
                            lineNumber: 253,
                            columnNumber: 21
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                            value: title,
                            onChange: (e)=>setTitle(e.target.value),
                            placeholder: "Shown in lists",
                            className: "w-full px-2 py-1.5 border rounded text-sm"
                        }, void 0, false, {
                            fileName: "[project]/components/admin/AssociatedDocumentUploadModal.tsx",
                            lineNumber: 254,
                            columnNumber: 21
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/components/admin/AssociatedDocumentUploadModal.tsx",
                    lineNumber: 252,
                    columnNumber: 17
                }, this),
                uploadError && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "rounded border border-red-200 bg-red-50 px-2 py-1.5 text-sm text-red-800",
                    role: "alert",
                    children: uploadError
                }, void 0, false, {
                    fileName: "[project]/components/admin/AssociatedDocumentUploadModal.tsx",
                    lineNumber: 263,
                    columnNumber: 21
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "flex gap-2 pt-2",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                            type: "button",
                            disabled: uploading,
                            onClick: submit,
                            className: "px-3 py-1.5 text-sm bg-alloy-blue text-white rounded-md hover:opacity-90 disabled:opacity-50",
                            children: uploading ? "Uploading…" : "Upload"
                        }, void 0, false, {
                            fileName: "[project]/components/admin/AssociatedDocumentUploadModal.tsx",
                            lineNumber: 269,
                            columnNumber: 21
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                            type: "button",
                            disabled: uploading,
                            onClick: onClose,
                            className: "px-3 py-1.5 text-sm border rounded-md",
                            children: "Cancel"
                        }, void 0, false, {
                            fileName: "[project]/components/admin/AssociatedDocumentUploadModal.tsx",
                            lineNumber: 277,
                            columnNumber: 21
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/components/admin/AssociatedDocumentUploadModal.tsx",
                    lineNumber: 268,
                    columnNumber: 17
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/components/admin/AssociatedDocumentUploadModal.tsx",
            lineNumber: 159,
            columnNumber: 13
        }, this)
    }, void 0, false, {
        fileName: "[project]/components/admin/AssociatedDocumentUploadModal.tsx",
        lineNumber: 158,
        columnNumber: 9
    }, this);
}
_s(AssociatedDocumentUploadModal, "oUhPO8VFTiqnL++8N2TCdI1ytBg=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useId"]
    ];
});
_c = AssociatedDocumentUploadModal;
var _c;
__turbopack_context__.k.register(_c, "AssociatedDocumentUploadModal");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/components/admin/EntityDocumentsSection.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>EntityDocumentsSection
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminFormatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/adminFormatters.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$v1DocumentEntities$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/v1DocumentEntities.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$AssociatedDocumentUploadModal$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/components/admin/AssociatedDocumentUploadModal.tsx [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
;
;
function EntityDocumentsSection({ documents, loading = false, fetchError = null, onRetryFetch, uploadEntityType, entityId, canMutate, onAfterUpload, showUpload = true }) {
    _s();
    const [uploadModalOpen, setUploadModalOpen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const fileUploadSupported = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$v1DocumentEntities$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["isV1DocumentEntityType"])(uploadEntityType);
    const [uploading, setUploading] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [uploadError, setUploadError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [docType, setDocType] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [title, setTitle] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [openingId, setOpeningId] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [openError, setOpenError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const openSignedUrl = async (docId)=>{
        setOpenError(null);
        setOpeningId(docId);
        try {
            const res = await fetch(`/api/admin/documents/${encodeURIComponent(docId)}/signed-url`);
            let json = {};
            try {
                json = await res.json();
            } catch  {
                setOpenError(`Could not read response (${res.status})`);
                return;
            }
            if (!res.ok) {
                setOpenError(json.error || `Could not open file (${res.status})`);
                return;
            }
            if (json.ok && json.signedUrl) {
                window.open(json.signedUrl, "_blank", "noopener,noreferrer");
                return;
            }
            setOpenError(json.error || "Could not open file");
        } catch (e) {
            setOpenError(e.message || "Network error while opening file");
        } finally{
            setOpeningId(null);
        }
    };
    const onPickFileLegacy = async (e)=>{
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file || !canMutate) return;
        setUploading(true);
        setUploadError(null);
        try {
            const fd = new FormData();
            fd.set("file", file);
            fd.set("entity_type", uploadEntityType);
            fd.set("entity_id", entityId);
            if (docType.trim()) fd.set("doc_type", docType.trim());
            if (title.trim()) fd.set("title", title.trim());
            const res = await fetch("/api/admin/documents/upload", {
                method: "POST",
                body: fd
            });
            let json = {};
            try {
                json = await res.json();
            } catch  {
                throw new Error(`Upload failed (${res.status})`);
            }
            if (!res.ok) {
                throw new Error(json.error || `Upload failed (${res.status})`);
            }
            onAfterUpload();
        } catch (err) {
            setUploadError(err.message);
        } finally{
            setUploading(false);
        }
    };
    const displayName = (doc)=>doc.name && String(doc.name).trim() || doc.original_filename && String(doc.original_filename).trim() || "Untitled";
    const displayWhen = (doc)=>{
        const raw = doc.uploaded_at || doc.created_at;
        return raw ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminFormatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatDateTime"])(raw) : "";
    };
    const listEmpty = documents.length === 0;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "space-y-3",
        children: [
            showUpload && canMutate && fileUploadSupported && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "rounded-lg border border-alloy-stone/30 bg-alloy-pine/5 p-3 space-y-2",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: "text-xs font-medium text-alloy-midnight/70",
                                children: "Attach document"
                            }, void 0, false, {
                                fileName: "[project]/components/admin/EntityDocumentsSection.tsx",
                                lineNumber: 130,
                                columnNumber: 25
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: "text-[11px] text-alloy-midnight/50",
                                children: "Uploads are linked to this record."
                            }, void 0, false, {
                                fileName: "[project]/components/admin/EntityDocumentsSection.tsx",
                                lineNumber: 131,
                                columnNumber: 25
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                type: "button",
                                onClick: ()=>setUploadModalOpen(true),
                                className: "px-3 py-1.5 text-sm bg-alloy-blue text-white rounded-md hover:opacity-90",
                                children: "Upload…"
                            }, void 0, false, {
                                fileName: "[project]/components/admin/EntityDocumentsSection.tsx",
                                lineNumber: 132,
                                columnNumber: 25
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/admin/EntityDocumentsSection.tsx",
                        lineNumber: 129,
                        columnNumber: 21
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$AssociatedDocumentUploadModal$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                        isOpen: uploadModalOpen,
                        onClose: ()=>setUploadModalOpen(false),
                        onSuccess: onAfterUpload,
                        lockAssociation: true,
                        fixedEntityType: uploadEntityType,
                        fixedEntityId: entityId
                    }, void 0, false, {
                        fileName: "[project]/components/admin/EntityDocumentsSection.tsx",
                        lineNumber: 140,
                        columnNumber: 21
                    }, this)
                ]
            }, void 0, true),
            showUpload && canMutate && !fileUploadSupported && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "rounded-lg border border-alloy-stone/30 bg-alloy-pine/5 p-3 space-y-2",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "text-xs font-medium text-alloy-midnight/70",
                        children: "Upload document"
                    }, void 0, false, {
                        fileName: "[project]/components/admin/EntityDocumentsSection.tsx",
                        lineNumber: 153,
                        columnNumber: 21
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "grid grid-cols-1 sm:grid-cols-2 gap-2",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                        className: "block text-xs text-alloy-midnight/60 mb-0.5",
                                        children: "Doc type (optional)"
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/EntityDocumentsSection.tsx",
                                        lineNumber: 156,
                                        columnNumber: 29
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                        value: docType,
                                        onChange: (e)=>setDocType(e.target.value),
                                        placeholder: "e.g. contract, w9",
                                        className: "w-full px-2 py-1.5 border rounded text-sm"
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/EntityDocumentsSection.tsx",
                                        lineNumber: 157,
                                        columnNumber: 29
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/admin/EntityDocumentsSection.tsx",
                                lineNumber: 155,
                                columnNumber: 25
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                        className: "block text-xs text-alloy-midnight/60 mb-0.5",
                                        children: "Title (optional)"
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/EntityDocumentsSection.tsx",
                                        lineNumber: 165,
                                        columnNumber: 29
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                        value: title,
                                        onChange: (e)=>setTitle(e.target.value),
                                        placeholder: "Shown in lists",
                                        className: "w-full px-2 py-1.5 border rounded text-sm"
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/EntityDocumentsSection.tsx",
                                        lineNumber: 166,
                                        columnNumber: 29
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/admin/EntityDocumentsSection.tsx",
                                lineNumber: 164,
                                columnNumber: 25
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/admin/EntityDocumentsSection.tsx",
                        lineNumber: 154,
                        columnNumber: 21
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                        className: "inline-block",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "sr-only",
                                children: "Choose file"
                            }, void 0, false, {
                                fileName: "[project]/components/admin/EntityDocumentsSection.tsx",
                                lineNumber: 175,
                                columnNumber: 25
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                type: "file",
                                className: "text-sm",
                                disabled: uploading,
                                onChange: onPickFileLegacy
                            }, void 0, false, {
                                fileName: "[project]/components/admin/EntityDocumentsSection.tsx",
                                lineNumber: 176,
                                columnNumber: 25
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/admin/EntityDocumentsSection.tsx",
                        lineNumber: 174,
                        columnNumber: 21
                    }, this),
                    uploadError && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "rounded border border-red-200 bg-red-50 px-2 py-1.5 text-sm text-red-800",
                        role: "alert",
                        children: uploadError
                    }, void 0, false, {
                        fileName: "[project]/components/admin/EntityDocumentsSection.tsx",
                        lineNumber: 179,
                        columnNumber: 25
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/admin/EntityDocumentsSection.tsx",
                lineNumber: 152,
                columnNumber: 17
            }, this),
            fetchError && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 flex flex-wrap items-center justify-between gap-2",
                role: "alert",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        children: [
                            "Could not load documents: ",
                            fetchError
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/admin/EntityDocumentsSection.tsx",
                        lineNumber: 191,
                        columnNumber: 21
                    }, this),
                    onRetryFetch && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        type: "button",
                        onClick: onRetryFetch,
                        className: "shrink-0 px-2 py-1 text-xs font-medium rounded border border-amber-300 hover:bg-amber-100",
                        children: "Retry"
                    }, void 0, false, {
                        fileName: "[project]/components/admin/EntityDocumentsSection.tsx",
                        lineNumber: 193,
                        columnNumber: 25
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/admin/EntityDocumentsSection.tsx",
                lineNumber: 187,
                columnNumber: 17
            }, this),
            loading ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "rounded-lg border border-alloy-stone/20 bg-alloy-stone/5 px-3 py-4 text-sm text-alloy-midnight/60",
                "aria-busy": "true",
                children: "Loading documents…"
            }, void 0, false, {
                fileName: "[project]/components/admin/EntityDocumentsSection.tsx",
                lineNumber: 205,
                columnNumber: 17
            }, this) : listEmpty && !fetchError ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "rounded-lg border border-dashed border-alloy-stone/40 bg-alloy-stone/5 px-3 py-4 text-center text-sm text-alloy-midnight/60",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "font-medium text-alloy-midnight/70",
                        children: "No documents linked yet"
                    }, void 0, false, {
                        fileName: "[project]/components/admin/EntityDocumentsSection.tsx",
                        lineNumber: 210,
                        columnNumber: 21
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "mt-1 text-xs text-alloy-midnight/50",
                        children: canMutate ? "Upload a file to attach it to this record." : "Documents will appear here after upload."
                    }, void 0, false, {
                        fileName: "[project]/components/admin/EntityDocumentsSection.tsx",
                        lineNumber: 211,
                        columnNumber: 21
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/admin/EntityDocumentsSection.tsx",
                lineNumber: 209,
                columnNumber: 17
            }, this) : listEmpty && fetchError ? null : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                className: "space-y-2",
                children: documents.map((doc)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                        className: "flex flex-wrap items-start justify-between gap-2 rounded-lg border border-alloy-stone/20 px-3 py-2 bg-white/80",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "min-w-0 flex-1",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "text-sm font-medium text-alloy-forge/90 truncate",
                                        children: displayName(doc)
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/EntityDocumentsSection.tsx",
                                        lineNumber: 223,
                                        columnNumber: 33
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "text-xs text-alloy-muted",
                                        children: [
                                            doc.document_type,
                                            doc.status,
                                            displayWhen(doc)
                                        ].filter(Boolean).join(" · ") || "—"
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/EntityDocumentsSection.tsx",
                                        lineNumber: 224,
                                        columnNumber: 33
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/admin/EntityDocumentsSection.tsx",
                                lineNumber: 222,
                                columnNumber: 29
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                type: "button",
                                disabled: openingId === doc.id,
                                onClick: ()=>openSignedUrl(doc.id),
                                className: "text-xs px-2 py-1 border border-alloy-blue/50 rounded text-alloy-blue hover:bg-alloy-blue/10 shrink-0 disabled:opacity-50",
                                children: openingId === doc.id ? "Opening…" : "Open"
                            }, void 0, false, {
                                fileName: "[project]/components/admin/EntityDocumentsSection.tsx",
                                lineNumber: 228,
                                columnNumber: 29
                            }, this)
                        ]
                    }, doc.id, true, {
                        fileName: "[project]/components/admin/EntityDocumentsSection.tsx",
                        lineNumber: 218,
                        columnNumber: 25
                    }, this))
            }, void 0, false, {
                fileName: "[project]/components/admin/EntityDocumentsSection.tsx",
                lineNumber: 216,
                columnNumber: 17
            }, this),
            openError && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "rounded border border-red-200 bg-red-50 px-2 py-1.5 text-sm text-red-800",
                role: "alert",
                children: openError
            }, void 0, false, {
                fileName: "[project]/components/admin/EntityDocumentsSection.tsx",
                lineNumber: 242,
                columnNumber: 17
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/components/admin/EntityDocumentsSection.tsx",
        lineNumber: 126,
        columnNumber: 9
    }, this);
}
_s(EntityDocumentsSection, "BQ2yXQwD/0ZQKIoBWFib4z1DDGI=");
_c = EntityDocumentsSection;
var _c;
__turbopack_context__.k.register(_c, "EntityDocumentsSection");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/components/admin/RelatedRecordsTabs.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>RelatedRecordsTabs
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/client/app-dir/link.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$Drawer$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/components/admin/Drawer.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$EntityDocumentsSection$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/components/admin/EntityDocumentsSection.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$contexts$2f$AdminDrawerContext$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/contexts/AdminDrawerContext.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$contexts$2f$AdminAuthContext$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/contexts/AdminAuthContext.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$contexts$2f$EntityLabelsContext$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/contexts/EntityLabelsContext.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminFormatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/adminFormatters.ts [app-client] (ecmascript)");
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
const RELATED_SCHEDULE_COLUMNS = [
    {
        key: "start_at",
        label: "Start",
        render: (v)=>v ? new Date(v).toLocaleString() : "—"
    },
    {
        key: "end_at",
        label: "End",
        render: (v)=>v ? new Date(v).toLocaleString() : "—"
    },
    {
        key: "timezone",
        label: "Timezone",
        render: (v)=>{
            if (v == null || v === "") return "—";
            const s = String(v).trim();
            return s.length > 0 ? s : "—";
        }
    },
    {
        key: "status_key",
        label: "Workflow",
        render: (v)=>{
            if (v == null || v === "") return "—";
            const s = String(v).trim();
            return s.length > 0 ? s : "—";
        }
    },
    {
        key: "canceled_at",
        label: "Canceled",
        render: (v, row)=>{
            if (!v) return "—";
            const when = new Date(v).toLocaleString();
            const reason = row?.cancel_reason;
            if (reason != null && String(reason).trim()) {
                const s = String(reason).trim();
                const short = s.length > 64 ? `${s.slice(0, 64)}…` : s;
                return `${when} · ${short}`;
            }
            return when;
        }
    }
];
const EMPTY = {
    people: [],
    opportunities: [],
    jobs: [],
    schedules: [],
    contacts: [],
    locations: [],
    customer_members: [],
    payments: [],
    customer_subscriptions: [],
    discount_redemptions: [],
    documents: [],
    messages: [],
    customer_tags: [],
    linked_persons: []
};
function RelatedRecordsTabs({ entityType, entityId }) {
    _s();
    const { openDrawer } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$contexts$2f$AdminDrawerContext$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAdminDrawer"])();
    const { canMutate } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$contexts$2f$AdminAuthContext$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAdminAuth"])();
    const { labels } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$contexts$2f$EntityLabelsContext$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEntityLabels"])();
    const membersPlural = labels.customer_members?.plural ?? "Members";
    const membersSingular = labels.customer_members?.singular ?? "Member";
    const [data, setData] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(EMPTY);
    const [loading, setLoading] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(true);
    const [error, setError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const refetch = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "RelatedRecordsTabs.useCallback[refetch]": ()=>{
            setLoading(true);
            setError(null);
            fetch(`/api/admin/related/${entityType}/${entityId}`).then({
                "RelatedRecordsTabs.useCallback[refetch]": async (res)=>{
                    const json = await res.json().catch({
                        "RelatedRecordsTabs.useCallback[refetch]": ()=>({})
                    }["RelatedRecordsTabs.useCallback[refetch]"]);
                    if (!res.ok) {
                        const msg = json.error || (res.status === 404 ? "Record not found" : `Failed to load related records (${res.status})`);
                        throw new Error(msg);
                    }
                    return json;
                }
            }["RelatedRecordsTabs.useCallback[refetch]"]).then({
                "RelatedRecordsTabs.useCallback[refetch]": (json)=>setData({
                        ...EMPTY,
                        ...json
                    })
            }["RelatedRecordsTabs.useCallback[refetch]"]).catch({
                "RelatedRecordsTabs.useCallback[refetch]": (e)=>setError(e.message)
            }["RelatedRecordsTabs.useCallback[refetch]"]).finally({
                "RelatedRecordsTabs.useCallback[refetch]": ()=>setLoading(false)
            }["RelatedRecordsTabs.useCallback[refetch]"]);
        }
    }["RelatedRecordsTabs.useCallback[refetch]"], [
        entityType,
        entityId
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "RelatedRecordsTabs.useEffect": ()=>{
            refetch();
        }
    }["RelatedRecordsTabs.useEffect"], [
        refetch
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "RelatedRecordsTabs.useEffect": ()=>{
            const onSaved = {
                "RelatedRecordsTabs.useEffect.onSaved": (ev)=>{
                    const detail = ev.detail;
                    if (detail?.type === "schedules") refetch();
                }
            }["RelatedRecordsTabs.useEffect.onSaved"];
            window.addEventListener("admin-entity-saved", onSaved);
            return ({
                "RelatedRecordsTabs.useEffect": ()=>window.removeEventListener("admin-entity-saved", onSaved)
            })["RelatedRecordsTabs.useEffect"];
        }
    }["RelatedRecordsTabs.useEffect"], [
        refetch
    ]);
    const [addLocationOpen, setAddLocationOpen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [locationTypes, setLocationTypes] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])([]);
    const [addLocationForm, setAddLocationForm] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])({
        label: "",
        location_type_id: "",
        is_primary: false,
        is_active: true,
        address1: "",
        address2: "",
        city: "",
        state: "",
        postal_code: "",
        country: "",
        access_notes: ""
    });
    const [addLocationSaving, setAddLocationSaving] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [addLocationError, setAddLocationError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "RelatedRecordsTabs.useEffect": ()=>{
            if (entityType !== "customer" || !addLocationOpen) return;
            fetch("/api/admin/location-types").then({
                "RelatedRecordsTabs.useEffect": (r)=>r.ok ? r.json() : {
                        location_types: []
                    }
            }["RelatedRecordsTabs.useEffect"]).then({
                "RelatedRecordsTabs.useEffect": (json)=>setLocationTypes(json.location_types ?? [])
            }["RelatedRecordsTabs.useEffect"]).catch({
                "RelatedRecordsTabs.useEffect": ()=>setLocationTypes([])
            }["RelatedRecordsTabs.useEffect"]);
        }
    }["RelatedRecordsTabs.useEffect"], [
        entityType,
        addLocationOpen
    ]);
    const tabs = [];
    const primaryContactId = entityType === "customer" ? data._primary_contact_id : null;
    if (entityType === "contact") {
        tabs.push({
            key: "opportunities",
            label: "Opportunities",
            entityType: "opportunities",
            dataKey: "opportunities",
            columns: [
                {
                    key: "created_at",
                    label: "Created",
                    render: (v)=>v ? new Date(v).toLocaleDateString() : "-"
                },
                {
                    key: "name",
                    label: "Name"
                },
                {
                    key: "status",
                    label: "Status"
                },
                {
                    key: "job_date",
                    label: "Job Date"
                },
                {
                    key: "quote_total",
                    label: "Quote",
                    render: (v)=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminFormatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatMoneyFromDollars"])(v)
                }
            ]
        }, {
            key: "jobs",
            label: "Jobs",
            entityType: "jobs",
            dataKey: "jobs",
            columns: [
                {
                    key: "created_at",
                    label: "Created",
                    render: (v)=>v ? new Date(v).toLocaleDateString() : "-"
                },
                {
                    key: "title",
                    label: "Title"
                },
                {
                    key: "scheduled_at",
                    label: "Scheduled",
                    render: (v)=>v ? new Date(v).toLocaleString() : "-"
                }
            ]
        }, {
            key: "schedules",
            label: "Schedules",
            entityType: "schedules",
            dataKey: "schedules",
            columns: RELATED_SCHEDULE_COLUMNS
        }, {
            key: "documents",
            label: "Documents",
            entityType: "contacts",
            dataKey: "documents",
            isDocumentsPanel: true,
            documentUploadEntityType: "contact",
            columns: []
        });
    } else if (entityType === "customer") {
        tabs.push({
            key: "people",
            label: "People",
            entityType: "persons",
            dataKey: "people",
            rowIdKey: "person_id",
            columns: [
                {
                    key: "_person_name",
                    label: "Name",
                    render: (v)=>v || "—"
                },
                {
                    key: "role_label",
                    label: "Role",
                    render: (v)=>v || "—"
                },
                {
                    key: "_person_email",
                    label: "Email",
                    render: (v)=>v || "—"
                },
                {
                    key: "_person_phone",
                    label: "Phone",
                    render: (v)=>v || "—"
                }
            ]
        }, {
            key: "contacts",
            label: "Contacts",
            entityType: "contacts",
            dataKey: "contacts",
            columns: [
                {
                    key: "_primary",
                    label: " ",
                    render: (_v, row)=>row?.id && primaryContactId && row.id === primaryContactId ? "Primary" : ""
                },
                {
                    key: "created_at",
                    label: "Created",
                    render: (v)=>v ? new Date(v).toLocaleDateString() : "-"
                },
                {
                    key: "first_name",
                    label: "Name",
                    render: (_v, row)=>row ? [
                            row.first_name,
                            row.last_name
                        ].filter(Boolean).join(" ") || row.email || "—" : "—"
                },
                {
                    key: "email",
                    label: "Email"
                },
                {
                    key: "phone",
                    label: "Phone"
                }
            ]
        }, {
            key: "customer_members",
            label: membersPlural,
            entityType: "customer_members",
            dataKey: "customer_members",
            columns: [
                {
                    key: "display_name",
                    label: "Name",
                    render: (v, row)=>v || (row ? [
                            row.first_name,
                            row.last_name
                        ].filter(Boolean).join(" ") : null) || "—"
                },
                {
                    key: "relationship",
                    label: "Relationship",
                    render: (v)=>v || "—"
                },
                {
                    key: "dob",
                    label: "DOB",
                    render: (v)=>v || "—"
                },
                {
                    key: "is_active",
                    label: "Active",
                    render: (v)=>v ? "Yes" : "No"
                }
            ]
        }, {
            key: "opportunities",
            label: "Opportunities",
            entityType: "opportunities",
            dataKey: "opportunities",
            columns: [
                {
                    key: "created_at",
                    label: "Created",
                    render: (v)=>v ? new Date(v).toLocaleDateString() : "-"
                },
                {
                    key: "name",
                    label: "Name"
                },
                {
                    key: "status",
                    label: "Status"
                },
                {
                    key: "quote_total",
                    label: "Quote",
                    render: (v)=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminFormatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatMoneyFromDollars"])(v)
                }
            ]
        }, {
            key: "jobs",
            label: "Jobs",
            entityType: "jobs",
            dataKey: "jobs",
            columns: [
                {
                    key: "created_at",
                    label: "Created",
                    render: (v)=>v ? new Date(v).toLocaleDateString() : "-"
                },
                {
                    key: "title",
                    label: "Title"
                },
                {
                    key: "scheduled_at",
                    label: "Scheduled",
                    render: (v)=>v ? new Date(v).toLocaleString() : "-"
                }
            ]
        }, {
            key: "schedules",
            label: "Schedules",
            entityType: "schedules",
            dataKey: "schedules",
            columns: RELATED_SCHEDULE_COLUMNS
        }, {
            key: "locations",
            label: "Locations",
            entityType: "locations",
            dataKey: "locations",
            columns: [
                {
                    key: "label",
                    label: "Name"
                },
                {
                    key: "location_type",
                    label: "Type",
                    render: (v)=>v && typeof v === "string" ? v.charAt(0).toUpperCase() + v.slice(1).toLowerCase() : "—"
                },
                {
                    key: "city",
                    label: "City"
                },
                {
                    key: "state",
                    label: "State"
                }
            ]
        }, {
            key: "customer_subscriptions",
            label: "Subscriptions",
            entityType: "subscriptions",
            dataKey: "customer_subscriptions",
            columns: [
                {
                    key: "status",
                    label: "Status"
                },
                {
                    key: "start_date",
                    label: "Start date",
                    render: (v)=>v ? new Date(v).toLocaleDateString() : "—"
                },
                {
                    key: "created_at",
                    label: "Created",
                    render: (v)=>v ? new Date(v).toLocaleDateString() : "—"
                }
            ]
        }, {
            key: "discount_redemptions",
            label: "Discounts / Promotions",
            entityType: "discount_redemptions",
            dataKey: "discount_redemptions",
            columns: [
                {
                    key: "created_at",
                    label: "Redeemed",
                    render: (v)=>v ? new Date(v).toLocaleDateString() : "—"
                },
                {
                    key: "discount_code_id",
                    label: "Code ID",
                    render: (v)=>v && typeof v === "string" ? v.slice(0, 8) + "…" : "—"
                }
            ]
        }, {
            key: "documents",
            label: "Documents",
            entityType: "customers",
            dataKey: "documents",
            isDocumentsPanel: true,
            documentUploadEntityType: "customer",
            columns: []
        });
    } else if (entityType === "opportunity") {
        tabs.push({
            key: "jobs",
            label: "Jobs",
            entityType: "jobs",
            dataKey: "jobs",
            columns: [
                {
                    key: "created_at",
                    label: "Created",
                    render: (v)=>v ? new Date(v).toLocaleDateString() : "-"
                },
                {
                    key: "title",
                    label: "Title"
                },
                {
                    key: "scheduled_at",
                    label: "Scheduled",
                    render: (v)=>v ? new Date(v).toLocaleString() : "-"
                }
            ]
        }, {
            key: "schedules",
            label: "Schedules",
            entityType: "schedules",
            dataKey: "schedules",
            columns: RELATED_SCHEDULE_COLUMNS
        }, {
            key: "documents",
            label: "Documents",
            entityType: "opportunities",
            dataKey: "documents",
            isDocumentsPanel: true,
            documentUploadEntityType: "opportunity",
            columns: []
        });
    } else if (entityType === "job") {
        tabs.push({
            key: "schedules",
            label: "Schedules",
            entityType: "schedules",
            dataKey: "schedules",
            columns: RELATED_SCHEDULE_COLUMNS
        }, {
            key: "documents",
            label: "Documents",
            entityType: "jobs",
            dataKey: "documents",
            isDocumentsPanel: true,
            documentUploadEntityType: "job",
            columns: []
        });
    } else if (entityType === "location") {
        tabs.push({
            key: "linked_persons",
            label: "People",
            entityType: "persons",
            dataKey: "linked_persons",
            rowIdKey: "person_id",
            columns: [
                {
                    key: "_person_name",
                    label: "Name",
                    render: (v)=>v?.trim() || "—"
                },
                {
                    key: "is_primary",
                    label: "Primary",
                    render: (v)=>v ? "Yes" : "No"
                },
                {
                    key: "relationship_type",
                    label: "Link",
                    render: (v)=>v?.trim() || "—"
                }
            ]
        }, {
            key: "jobs",
            label: "Jobs",
            entityType: "jobs",
            dataKey: "jobs",
            columns: [
                {
                    key: "created_at",
                    label: "Created",
                    render: (v)=>v ? new Date(v).toLocaleDateString() : "-"
                },
                {
                    key: "title",
                    label: "Title"
                },
                {
                    key: "scheduled_at",
                    label: "Scheduled",
                    render: (v)=>v ? new Date(v).toLocaleString() : "-"
                }
            ]
        }, {
            key: "schedules",
            label: "Schedules",
            entityType: "schedules",
            dataKey: "schedules",
            columns: RELATED_SCHEDULE_COLUMNS
        }, {
            key: "documents",
            label: "Documents",
            entityType: "locations",
            dataKey: "documents",
            isDocumentsPanel: true,
            documentUploadEntityType: "location",
            columns: []
        });
    }
    const [activeTab, setActiveTab] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(tabs[0]?.key ?? "");
    if (tabs.length === 0) return null;
    const active = tabs.find((t)=>t.key === activeTab) ?? tabs[0];
    const rows = data[active.dataKey] ?? [];
    const hideGlobalErrorBanner = Boolean(error && active.isDocumentsPanel && activeTab === "documents");
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "mt-6 border-t border-alloy-stone/30 pt-4",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                className: "text-sm font-semibold text-alloy-midnight/80 mb-3",
                children: "Related"
            }, void 0, false, {
                fileName: "[project]/components/admin/RelatedRecordsTabs.tsx",
                lineNumber: 255,
                columnNumber: 13
            }, this),
            error && !hideGlobalErrorBanner && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "text-red-600 text-sm mb-2",
                children: [
                    "Error: ",
                    error
                ]
            }, void 0, true, {
                fileName: "[project]/components/admin/RelatedRecordsTabs.tsx",
                lineNumber: 256,
                columnNumber: 49
            }, this),
            loading ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "text-alloy-midnight/60 text-sm",
                children: "Loading related records…"
            }, void 0, false, {
                fileName: "[project]/components/admin/RelatedRecordsTabs.tsx",
                lineNumber: 258,
                columnNumber: 17
            }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex gap-2 border-b border-alloy-stone/30 mb-3",
                        children: tabs.map((t)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                type: "button",
                                onClick: ()=>setActiveTab(t.key),
                                className: `px-3 py-1.5 text-sm font-medium rounded-t border-b-2 -mb-px transition-colors ${activeTab === t.key ? "bg-alloy-pine/8 text-alloy-pine border-alloy-pine" : "border-transparent text-alloy-midnight/60 hover:bg-alloy-pine/5"}`,
                                children: t.label
                            }, t.key, false, {
                                fileName: "[project]/components/admin/RelatedRecordsTabs.tsx",
                                lineNumber: 263,
                                columnNumber: 29
                            }, this))
                    }, void 0, false, {
                        fileName: "[project]/components/admin/RelatedRecordsTabs.tsx",
                        lineNumber: 261,
                        columnNumber: 21
                    }, this),
                    entityType === "customer" && activeTab === "customer_members" && canMutate && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "mb-3",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                            href: `/admin/customer-members?customer_id=${encodeURIComponent(entityId)}`,
                            className: "inline-block px-3 py-1.5 text-sm bg-alloy-blue text-white rounded-md hover:opacity-90",
                            children: [
                                "Add ",
                                membersSingular
                            ]
                        }, void 0, true, {
                            fileName: "[project]/components/admin/RelatedRecordsTabs.tsx",
                            lineNumber: 275,
                            columnNumber: 29
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/components/admin/RelatedRecordsTabs.tsx",
                        lineNumber: 274,
                        columnNumber: 25
                    }, this),
                    entityType === "customer" && activeTab === "locations" && canMutate && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "mb-3",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                            type: "button",
                            onClick: ()=>{
                                setAddLocationError(null);
                                setAddLocationForm({
                                    label: "",
                                    location_type_id: "",
                                    is_primary: false,
                                    is_active: true,
                                    address1: "",
                                    address2: "",
                                    city: "",
                                    state: "",
                                    postal_code: "",
                                    country: "",
                                    access_notes: ""
                                });
                                setAddLocationOpen(true);
                            },
                            className: "px-3 py-1.5 text-sm bg-alloy-blue text-white rounded-md hover:opacity-90",
                            children: "Add location"
                        }, void 0, false, {
                            fileName: "[project]/components/admin/RelatedRecordsTabs.tsx",
                            lineNumber: 285,
                            columnNumber: 29
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/components/admin/RelatedRecordsTabs.tsx",
                        lineNumber: 284,
                        columnNumber: 25
                    }, this),
                    active.isDocumentsPanel && active.documentUploadEntityType ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$EntityDocumentsSection$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                        documents: data.documents ?? [],
                        loading: loading,
                        fetchError: error,
                        onRetryFetch: refetch,
                        uploadEntityType: active.documentUploadEntityType,
                        entityId: entityId,
                        canMutate: canMutate,
                        onAfterUpload: refetch
                    }, void 0, false, {
                        fileName: "[project]/components/admin/RelatedRecordsTabs.tsx",
                        lineNumber: 311,
                        columnNumber: 25
                    }, this) : rows.length === 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "text-alloy-midnight/60 text-sm",
                        children: [
                            "No ",
                            active.label.toLowerCase(),
                            " found."
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/admin/RelatedRecordsTabs.tsx",
                        lineNumber: 322,
                        columnNumber: 25
                    }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "overflow-x-auto",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("table", {
                            className: "w-full text-sm border border-alloy-stone/30 rounded overflow-hidden",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("thead", {
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("tr", {
                                        className: "bg-alloy-stone/30",
                                        children: active.columns.map((col)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("th", {
                                                className: "text-left px-3 py-2 font-medium text-alloy-midnight/80",
                                                children: col.label
                                            }, col.key, false, {
                                                fileName: "[project]/components/admin/RelatedRecordsTabs.tsx",
                                                lineNumber: 329,
                                                columnNumber: 45
                                            }, this))
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/RelatedRecordsTabs.tsx",
                                        lineNumber: 327,
                                        columnNumber: 37
                                    }, this)
                                }, void 0, false, {
                                    fileName: "[project]/components/admin/RelatedRecordsTabs.tsx",
                                    lineNumber: 326,
                                    columnNumber: 33
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("tbody", {
                                    children: rows.map((row, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("tr", {
                                            className: "border-t border-alloy-stone/20 hover:bg-alloy-pine/5 cursor-pointer",
                                            onClick: ()=>openDrawer({
                                                    type: active.entityType,
                                                    id: active.rowIdKey ? row[active.rowIdKey] : row.id
                                                }),
                                            children: active.columns.map((col)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("td", {
                                                    className: "px-3 py-2",
                                                    children: col.render ? col.render(row[col.key], row) : row[col.key] ?? "-"
                                                }, col.key, false, {
                                                    fileName: "[project]/components/admin/RelatedRecordsTabs.tsx",
                                                    lineNumber: 343,
                                                    columnNumber: 49
                                                }, this))
                                        }, (active.rowIdKey ? row[active.rowIdKey] : row.id) ?? String(i), false, {
                                            fileName: "[project]/components/admin/RelatedRecordsTabs.tsx",
                                            lineNumber: 337,
                                            columnNumber: 41
                                        }, this))
                                }, void 0, false, {
                                    fileName: "[project]/components/admin/RelatedRecordsTabs.tsx",
                                    lineNumber: 335,
                                    columnNumber: 33
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/components/admin/RelatedRecordsTabs.tsx",
                            lineNumber: 325,
                            columnNumber: 29
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/components/admin/RelatedRecordsTabs.tsx",
                        lineNumber: 324,
                        columnNumber: 25
                    }, this)
                ]
            }, void 0, true),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$Drawer$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                isOpen: addLocationOpen,
                onClose: ()=>setAddLocationOpen(false),
                title: "New location",
                zIndexBackdrop: 60,
                zIndexPanel: 70,
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "space-y-3",
                    children: [
                        addLocationError && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                            className: "text-red-600 text-sm",
                            children: addLocationError
                        }, void 0, false, {
                            fileName: "[project]/components/admin/RelatedRecordsTabs.tsx",
                            lineNumber: 363,
                            columnNumber: 42
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                    className: "block text-sm text-alloy-midnight/70 mb-0.5",
                                    children: "Name"
                                }, void 0, false, {
                                    fileName: "[project]/components/admin/RelatedRecordsTabs.tsx",
                                    lineNumber: 365,
                                    columnNumber: 25
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                    value: addLocationForm.label,
                                    onChange: (e)=>setAddLocationForm((f)=>({
                                                ...f,
                                                label: e.target.value
                                            })),
                                    className: "w-full px-2 py-1.5 border rounded text-sm"
                                }, void 0, false, {
                                    fileName: "[project]/components/admin/RelatedRecordsTabs.tsx",
                                    lineNumber: 366,
                                    columnNumber: 25
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/components/admin/RelatedRecordsTabs.tsx",
                            lineNumber: 364,
                            columnNumber: 21
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                    className: "block text-sm text-alloy-midnight/70 mb-0.5",
                                    children: "Type"
                                }, void 0, false, {
                                    fileName: "[project]/components/admin/RelatedRecordsTabs.tsx",
                                    lineNumber: 373,
                                    columnNumber: 25
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                                    value: addLocationForm.location_type_id,
                                    onChange: (e)=>setAddLocationForm((f)=>({
                                                ...f,
                                                location_type_id: e.target.value
                                            })),
                                    className: "w-full px-2 py-1.5 border rounded text-sm",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                            value: "",
                                            children: "— Select —"
                                        }, void 0, false, {
                                            fileName: "[project]/components/admin/RelatedRecordsTabs.tsx",
                                            lineNumber: 379,
                                            columnNumber: 29
                                        }, this),
                                        locationTypes.map((t)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                value: t.id,
                                                children: t.label
                                            }, t.id, false, {
                                                fileName: "[project]/components/admin/RelatedRecordsTabs.tsx",
                                                lineNumber: 381,
                                                columnNumber: 33
                                            }, this))
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/components/admin/RelatedRecordsTabs.tsx",
                                    lineNumber: 374,
                                    columnNumber: 25
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/components/admin/RelatedRecordsTabs.tsx",
                            lineNumber: 372,
                            columnNumber: 21
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "flex items-center gap-2",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                    type: "checkbox",
                                    checked: addLocationForm.is_primary,
                                    onChange: (e)=>setAddLocationForm((f)=>({
                                                ...f,
                                                is_primary: e.target.checked
                                            }))
                                }, void 0, false, {
                                    fileName: "[project]/components/admin/RelatedRecordsTabs.tsx",
                                    lineNumber: 386,
                                    columnNumber: 25
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                    className: "text-sm text-alloy-midnight/70",
                                    children: "Primary"
                                }, void 0, false, {
                                    fileName: "[project]/components/admin/RelatedRecordsTabs.tsx",
                                    lineNumber: 391,
                                    columnNumber: 25
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/components/admin/RelatedRecordsTabs.tsx",
                            lineNumber: 385,
                            columnNumber: 21
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "flex items-center gap-2",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                    type: "checkbox",
                                    checked: addLocationForm.is_active,
                                    onChange: (e)=>setAddLocationForm((f)=>({
                                                ...f,
                                                is_active: e.target.checked
                                            }))
                                }, void 0, false, {
                                    fileName: "[project]/components/admin/RelatedRecordsTabs.tsx",
                                    lineNumber: 394,
                                    columnNumber: 25
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                    className: "text-sm text-alloy-midnight/70",
                                    children: "Active"
                                }, void 0, false, {
                                    fileName: "[project]/components/admin/RelatedRecordsTabs.tsx",
                                    lineNumber: 399,
                                    columnNumber: 25
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/components/admin/RelatedRecordsTabs.tsx",
                            lineNumber: 393,
                            columnNumber: 21
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                    className: "block text-sm text-alloy-midnight/70 mb-0.5",
                                    children: "Address 1"
                                }, void 0, false, {
                                    fileName: "[project]/components/admin/RelatedRecordsTabs.tsx",
                                    lineNumber: 402,
                                    columnNumber: 25
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                    value: addLocationForm.address1,
                                    onChange: (e)=>setAddLocationForm((f)=>({
                                                ...f,
                                                address1: e.target.value
                                            })),
                                    className: "w-full px-2 py-1.5 border rounded text-sm"
                                }, void 0, false, {
                                    fileName: "[project]/components/admin/RelatedRecordsTabs.tsx",
                                    lineNumber: 403,
                                    columnNumber: 25
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/components/admin/RelatedRecordsTabs.tsx",
                            lineNumber: 401,
                            columnNumber: 21
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                    className: "block text-sm text-alloy-midnight/70 mb-0.5",
                                    children: "Address 2"
                                }, void 0, false, {
                                    fileName: "[project]/components/admin/RelatedRecordsTabs.tsx",
                                    lineNumber: 410,
                                    columnNumber: 25
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                    value: addLocationForm.address2,
                                    onChange: (e)=>setAddLocationForm((f)=>({
                                                ...f,
                                                address2: e.target.value
                                            })),
                                    className: "w-full px-2 py-1.5 border rounded text-sm"
                                }, void 0, false, {
                                    fileName: "[project]/components/admin/RelatedRecordsTabs.tsx",
                                    lineNumber: 411,
                                    columnNumber: 25
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/components/admin/RelatedRecordsTabs.tsx",
                            lineNumber: 409,
                            columnNumber: 21
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "grid grid-cols-3 gap-2",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                    value: addLocationForm.city,
                                    onChange: (e)=>setAddLocationForm((f)=>({
                                                ...f,
                                                city: e.target.value
                                            })),
                                    placeholder: "City",
                                    className: "px-2 py-1.5 border rounded text-sm"
                                }, void 0, false, {
                                    fileName: "[project]/components/admin/RelatedRecordsTabs.tsx",
                                    lineNumber: 418,
                                    columnNumber: 25
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                    value: addLocationForm.state,
                                    onChange: (e)=>setAddLocationForm((f)=>({
                                                ...f,
                                                state: e.target.value
                                            })),
                                    placeholder: "State",
                                    className: "px-2 py-1.5 border rounded text-sm"
                                }, void 0, false, {
                                    fileName: "[project]/components/admin/RelatedRecordsTabs.tsx",
                                    lineNumber: 424,
                                    columnNumber: 25
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                    value: addLocationForm.postal_code,
                                    onChange: (e)=>setAddLocationForm((f)=>({
                                                ...f,
                                                postal_code: e.target.value
                                            })),
                                    placeholder: "ZIP",
                                    className: "px-2 py-1.5 border rounded text-sm"
                                }, void 0, false, {
                                    fileName: "[project]/components/admin/RelatedRecordsTabs.tsx",
                                    lineNumber: 430,
                                    columnNumber: 25
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/components/admin/RelatedRecordsTabs.tsx",
                            lineNumber: 417,
                            columnNumber: 21
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                    className: "block text-sm text-alloy-midnight/70 mb-0.5",
                                    children: "Country"
                                }, void 0, false, {
                                    fileName: "[project]/components/admin/RelatedRecordsTabs.tsx",
                                    lineNumber: 438,
                                    columnNumber: 25
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                    value: addLocationForm.country,
                                    onChange: (e)=>setAddLocationForm((f)=>({
                                                ...f,
                                                country: e.target.value
                                            })),
                                    className: "w-full px-2 py-1.5 border rounded text-sm"
                                }, void 0, false, {
                                    fileName: "[project]/components/admin/RelatedRecordsTabs.tsx",
                                    lineNumber: 439,
                                    columnNumber: 25
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/components/admin/RelatedRecordsTabs.tsx",
                            lineNumber: 437,
                            columnNumber: 21
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                    className: "block text-sm text-alloy-midnight/70 mb-0.5",
                                    children: "Access notes"
                                }, void 0, false, {
                                    fileName: "[project]/components/admin/RelatedRecordsTabs.tsx",
                                    lineNumber: 446,
                                    columnNumber: 25
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("textarea", {
                                    value: addLocationForm.access_notes,
                                    onChange: (e)=>setAddLocationForm((f)=>({
                                                ...f,
                                                access_notes: e.target.value
                                            })),
                                    className: "w-full px-2 py-1.5 border rounded text-sm",
                                    rows: 2
                                }, void 0, false, {
                                    fileName: "[project]/components/admin/RelatedRecordsTabs.tsx",
                                    lineNumber: 447,
                                    columnNumber: 25
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/components/admin/RelatedRecordsTabs.tsx",
                            lineNumber: 445,
                            columnNumber: 21
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "flex gap-2 pt-2",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    disabled: addLocationSaving,
                                    onClick: async ()=>{
                                        setAddLocationSaving(true);
                                        setAddLocationError(null);
                                        try {
                                            const selectedType = addLocationForm.location_type_id ? locationTypes.find((t)=>t.id === addLocationForm.location_type_id) : null;
                                            const res = await fetch("/api/admin/locations", {
                                                method: "POST",
                                                headers: {
                                                    "Content-Type": "application/json"
                                                },
                                                body: JSON.stringify({
                                                    customer_id: entityId,
                                                    label: addLocationForm.label.trim() || null,
                                                    location_type_id: addLocationForm.location_type_id.trim() || null,
                                                    location_type: selectedType ? selectedType.key : null,
                                                    is_primary: addLocationForm.is_primary,
                                                    is_active: addLocationForm.is_active,
                                                    address1: addLocationForm.address1.trim() || null,
                                                    address2: addLocationForm.address2.trim() || null,
                                                    city: addLocationForm.city.trim() || null,
                                                    state: addLocationForm.state.trim() || null,
                                                    postal_code: addLocationForm.postal_code.trim() || null,
                                                    country: addLocationForm.country.trim() || null,
                                                    access_notes: addLocationForm.access_notes.trim() || null
                                                })
                                            });
                                            const json = await res.json().catch(()=>({}));
                                            if (!res.ok) throw new Error(json.error || "Create failed");
                                            const createdId = json.id;
                                            if (!createdId) throw new Error("No id returned");
                                            setAddLocationOpen(false);
                                            refetch();
                                            openDrawer({
                                                type: "locations",
                                                id: createdId
                                            });
                                        } catch (e) {
                                            setAddLocationError(e.message);
                                        }
                                        setAddLocationSaving(false);
                                    },
                                    className: "px-3 py-1.5 text-sm bg-alloy-blue text-white rounded-md disabled:opacity-50",
                                    children: addLocationSaving ? "Saving…" : "Save"
                                }, void 0, false, {
                                    fileName: "[project]/components/admin/RelatedRecordsTabs.tsx",
                                    lineNumber: 455,
                                    columnNumber: 25
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    onClick: ()=>setAddLocationOpen(false),
                                    className: "px-3 py-1.5 text-sm border rounded-md",
                                    children: "Cancel"
                                }, void 0, false, {
                                    fileName: "[project]/components/admin/RelatedRecordsTabs.tsx",
                                    lineNumber: 500,
                                    columnNumber: 25
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/components/admin/RelatedRecordsTabs.tsx",
                            lineNumber: 454,
                            columnNumber: 21
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/components/admin/RelatedRecordsTabs.tsx",
                    lineNumber: 362,
                    columnNumber: 17
                }, this)
            }, void 0, false, {
                fileName: "[project]/components/admin/RelatedRecordsTabs.tsx",
                lineNumber: 355,
                columnNumber: 13
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/components/admin/RelatedRecordsTabs.tsx",
        lineNumber: 254,
        columnNumber: 9
    }, this);
}
_s(RelatedRecordsTabs, "tLaynlEa61JqhwiC7u/giPImwFA=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$contexts$2f$AdminDrawerContext$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAdminDrawer"],
        __TURBOPACK__imported__module__$5b$project$5d2f$contexts$2f$AdminAuthContext$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAdminAuth"],
        __TURBOPACK__imported__module__$5b$project$5d2f$contexts$2f$EntityLabelsContext$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEntityLabels"]
    ];
});
_c = RelatedRecordsTabs;
var _c;
__turbopack_context__.k.register(_c, "RelatedRecordsTabs");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/components/admin/communications/CommunicationsDrawerSection.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>CommunicationsDrawerSection
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$contexts$2f$AdminViewerTimezoneContext$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/contexts/AdminViewerTimezoneContext.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminFormatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/adminFormatters.ts [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
;
const COMPOSER_LABEL = "mb-1 text-[8px] font-semibold tracking-[0.12em] text-alloy-midnight/45";
/** Map POST /communications/send notes to concise operator copy (honest vs optimistic). */ function userFriendlySendNote(processNote) {
    const n = processNote.trim().toLowerCase();
    if (!n) return "Email queued for delivery.";
    if (n.includes("unset") || n.includes("queued until cron") || n.includes("stays queued")) return "Email queued for delivery.";
    if (n.includes("dispatched") || n.includes("backend process trigger")) return "Email sent.";
    return "Email queued for delivery.";
}
function communicationMessageInstant(m) {
    const s = m.sent_at ?? m.created_at ?? null;
    return s && String(s).trim() ? s : null;
}
function CommunicationsDrawerSection({ apiEntityType, entityId, active = true, embedded = true, className = "" }) {
    _s();
    const viewerTz = (0, __TURBOPACK__imported__module__$5b$project$5d2f$contexts$2f$AdminViewerTimezoneContext$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAdminViewerTimezone"])();
    const [threads, setThreads] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])([]);
    const [thrErr, setThrErr] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [loadingThreads, setLoadingThreads] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [selectedId, setSelectedId] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [msgs, setMsgs] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])([]);
    const [msgErr, setMsgErr] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [loadingMsgs, setLoadingMsgs] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [threadSpaceExpanded, setThreadSpaceExpanded] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const composerEntity = apiEntityType === "opportunities" || apiEntityType === "jobs" ? apiEntityType : null;
    const showEmailComposerChrome = !!(embedded && composerEntity);
    const [channelsAvailable, setChannelsAvailable] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])([]);
    const [bindingsErr, setBindingsErr] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [loadingBindings, setLoadingBindings] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [recipients, setRecipients] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])([]);
    const [recipientsErr, setRecipientsErr] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [loadingRecipients, setLoadingRecipients] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [selectedRecipientIds, setSelectedRecipientIds] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])({
        "CommunicationsDrawerSection.useState": ()=>new Set()
    }["CommunicationsDrawerSection.useState"]);
    const [composerSubject, setComposerSubject] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [composerBody, setComposerBody] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [sendBusy, setSendBusy] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [sendErr, setSendErr] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [sendOkNote, setSendOkNote] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const emailOutboundReady = channelsAvailable.includes("email") && !bindingsErr && !loadingBindings;
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "CommunicationsDrawerSection.useEffect": ()=>{
            setThreads([]);
            setThrErr(null);
            setLoadingThreads(false);
            setSelectedId(null);
            setMsgs([]);
            setMsgErr(null);
            setLoadingMsgs(false);
            setThreadSpaceExpanded(false);
            setChannelsAvailable([]);
            setBindingsErr(null);
            setRecipients([]);
            setRecipientsErr(null);
            setSelectedRecipientIds(new Set());
            setComposerSubject("");
            setComposerBody("");
            setSendErr(null);
            setSendOkNote(null);
        }
    }["CommunicationsDrawerSection.useEffect"], [
        entityId,
        apiEntityType
    ]);
    /** When parent hides Communication (`active` false), drop thread detail state (no polling; next open is clean). */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "CommunicationsDrawerSection.useEffect": ()=>{
            if (active) return;
            setThreadSpaceExpanded(false);
            setSelectedId(null);
            setMsgs([]);
            setMsgErr(null);
        }
    }["CommunicationsDrawerSection.useEffect"], [
        active
    ]);
    /** Fetches run only while `active`. */ const dataLayerActive = active;
    /** When recipients load, default selection = suggested primary or first row. */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "CommunicationsDrawerSection.useEffect": ()=>{
            if (!recipients.length) {
                setSelectedRecipientIds(new Set());
                return;
            }
            const sug = recipients.filter({
                "CommunicationsDrawerSection.useEffect.sug": (r)=>r.is_suggested_default
            }["CommunicationsDrawerSection.useEffect.sug"]).map({
                "CommunicationsDrawerSection.useEffect.sug": (r)=>r.person_id
            }["CommunicationsDrawerSection.useEffect.sug"]);
            const pick = sug.length > 0 ? sug : recipients[0]?.person_id ? [
                recipients[0].person_id
            ] : [];
            setSelectedRecipientIds(new Set(pick));
        }
    }["CommunicationsDrawerSection.useEffect"], [
        recipients
    ]);
    const loadThreads = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "CommunicationsDrawerSection.useCallback[loadThreads]": async ()=>{
            setLoadingThreads(true);
            setThrErr(null);
            try {
                const qs = new URLSearchParams({
                    entity_type: apiEntityType,
                    entity_id: entityId,
                    limit: "40"
                });
                const r = await fetch(`/api/admin/communications/threads?${qs.toString()}`, {
                    credentials: "include"
                });
                const j = await r.json().catch({
                    "CommunicationsDrawerSection.useCallback[loadThreads]": ()=>({})
                }["CommunicationsDrawerSection.useCallback[loadThreads]"]);
                if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
                const t = Array.isArray(j.threads) ? j.threads : [];
                setThreads(t);
                setSelectedId({
                    "CommunicationsDrawerSection.useCallback[loadThreads]": (prev)=>{
                        if (embedded) {
                            if (prev && t.some({
                                "CommunicationsDrawerSection.useCallback[loadThreads]": (x)=>x.id === prev
                            }["CommunicationsDrawerSection.useCallback[loadThreads]"])) return prev;
                            return null;
                        }
                        if (prev && t.some({
                            "CommunicationsDrawerSection.useCallback[loadThreads]": (x)=>x.id === prev
                        }["CommunicationsDrawerSection.useCallback[loadThreads]"])) return prev;
                        return t[0]?.id ?? null;
                    }
                }["CommunicationsDrawerSection.useCallback[loadThreads]"]);
            } catch (e) {
                setThrErr(e instanceof Error ? e.message : "Failed to load threads");
                setThreads([]);
                setSelectedId(null);
            } finally{
                setLoadingThreads(false);
            }
        }
    }["CommunicationsDrawerSection.useCallback[loadThreads]"], [
        apiEntityType,
        entityId,
        embedded
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "CommunicationsDrawerSection.useEffect": ()=>{
            if (!dataLayerActive) return;
            void loadThreads();
        }
    }["CommunicationsDrawerSection.useEffect"], [
        dataLayerActive,
        loadThreads
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "CommunicationsDrawerSection.useEffect": ()=>{
            if (!dataLayerActive || !showEmailComposerChrome || !composerEntity) return;
            let cancelled = false;
            ({
                "CommunicationsDrawerSection.useEffect": async ()=>{
                    setLoadingBindings(true);
                    setBindingsErr(null);
                    try {
                        const r = await fetch(`/api/admin/communications/bindings`, {
                            credentials: "include"
                        });
                        const j = await r.json().catch({
                            "CommunicationsDrawerSection.useEffect": ()=>({})
                        }["CommunicationsDrawerSection.useEffect"]);
                        if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
                        const ch = j.channels_available;
                        setChannelsAvailable(Array.isArray(ch) ? ch : []);
                    } catch (e) {
                        if (!cancelled) setBindingsErr(e instanceof Error ? e.message : "Failed to load bindings");
                        setChannelsAvailable([]);
                    } finally{
                        if (!cancelled) setLoadingBindings(false);
                    }
                }
            })["CommunicationsDrawerSection.useEffect"]();
            return ({
                "CommunicationsDrawerSection.useEffect": ()=>{
                    cancelled = true;
                }
            })["CommunicationsDrawerSection.useEffect"];
        }
    }["CommunicationsDrawerSection.useEffect"], [
        dataLayerActive,
        showEmailComposerChrome,
        composerEntity
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "CommunicationsDrawerSection.useEffect": ()=>{
            if (!dataLayerActive || !showEmailComposerChrome || !composerEntity || loadingBindings || !emailOutboundReady) {
                setRecipients([]);
                setRecipientsErr(null);
                setLoadingRecipients(false);
                return;
            }
            let cancelled = false;
            ({
                "CommunicationsDrawerSection.useEffect": async ()=>{
                    setLoadingRecipients(true);
                    setRecipientsErr(null);
                    try {
                        const qs = new URLSearchParams({
                            entity_type: composerEntity,
                            entity_id: entityId
                        });
                        const r = await fetch(`/api/admin/communications/drawer-recipients?${qs}`, {
                            credentials: "include"
                        });
                        const j = await r.json().catch({
                            "CommunicationsDrawerSection.useEffect": ()=>({})
                        }["CommunicationsDrawerSection.useEffect"]);
                        if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
                        const list = j.recipients;
                        if (!cancelled) setRecipients(Array.isArray(list) ? list : []);
                    } catch (e) {
                        if (!cancelled) {
                            setRecipients([]);
                            setRecipientsErr(e instanceof Error ? e.message : "Failed to load recipients");
                        }
                    } finally{
                        if (!cancelled) setLoadingRecipients(false);
                    }
                }
            })["CommunicationsDrawerSection.useEffect"]();
            return ({
                "CommunicationsDrawerSection.useEffect": ()=>{
                    cancelled = true;
                }
            })["CommunicationsDrawerSection.useEffect"];
        }
    }["CommunicationsDrawerSection.useEffect"], [
        dataLayerActive,
        showEmailComposerChrome,
        composerEntity,
        entityId,
        emailOutboundReady,
        loadingBindings
    ]);
    const loadMsgs = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "CommunicationsDrawerSection.useCallback[loadMsgs]": async (tid)=>{
            setLoadingMsgs(true);
            setMsgErr(null);
            try {
                const r = await fetch(`/api/admin/communications/threads/${encodeURIComponent(tid)}/messages?limit=80`, {
                    credentials: "include"
                });
                const j = await r.json().catch({
                    "CommunicationsDrawerSection.useCallback[loadMsgs]": ()=>({})
                }["CommunicationsDrawerSection.useCallback[loadMsgs]"]);
                if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
                setMsgs(Array.isArray(j.messages) ? j.messages.reverse() : []);
            } catch (e) {
                setMsgErr(e instanceof Error ? e.message : "Failed to load messages");
                setMsgs([]);
            } finally{
                setLoadingMsgs(false);
            }
        }
    }["CommunicationsDrawerSection.useCallback[loadMsgs]"], []);
    const fetchMessages = embedded ? threadSpaceExpanded : true;
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "CommunicationsDrawerSection.useEffect": ()=>{
            if (!dataLayerActive) return;
            if (!fetchMessages || !selectedId) {
                setMsgs([]);
                setMsgErr(null);
                return;
            }
            void loadMsgs(selectedId);
        }
    }["CommunicationsDrawerSection.useEffect"], [
        dataLayerActive,
        fetchMessages,
        selectedId,
        loadMsgs
    ]);
    const toggleRecipient = (personId)=>{
        setSelectedRecipientIds((prev)=>{
            const n = new Set(prev);
            if (n.has(personId)) n.delete(personId);
            else n.add(personId);
            return n;
        });
    };
    const sendEmails = async ()=>{
        if (!composerEntity || selectedRecipientIds.size === 0 || !composerBody.trim()) return;
        setSendBusy(true);
        setSendErr(null);
        setSendOkNote(null);
        try {
            let lastNote = "";
            for (const personId of selectedRecipientIds){
                const res = await fetch("/api/admin/communications/send", {
                    method: "POST",
                    credentials: "include",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        entity_type: composerEntity,
                        entity_id: entityId,
                        channel: "email",
                        subject: composerSubject.trim(),
                        body: composerBody.trim(),
                        recipient_person_id: personId
                    })
                });
                const j = await res.json().catch(()=>({}));
                if (!res.ok) {
                    throw new Error(j.error ?? `Send failed (${res.status})`);
                }
                lastNote = typeof j.process_trigger_attempted_note === "string" ? String(j.process_trigger_attempted_note) : "";
            }
            setSendOkNote(userFriendlySendNote(lastNote));
            setComposerSubject("");
            setComposerBody("");
            await loadThreads();
            const refetchMsgs = (!embedded || threadSpaceExpanded) && selectedId;
            if (refetchMsgs && selectedId) void loadMsgs(selectedId);
        } catch (e) {
            setSendErr(e instanceof Error ? e.message : "Send failed");
        } finally{
            setSendBusy(false);
        }
    };
    if (!active) return null;
    const headerTitle = !embedded ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
        className: DRAWER_SECTION_HEADER_CLASS,
        children: "Communications"
    }, void 0, false, {
        fileName: "[project]/components/admin/communications/CommunicationsDrawerSection.tsx",
        lineNumber: 346,
        columnNumber: 9
    }, this) : null;
    const description = !embedded ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
        className: "text-sm text-alloy-midnight/65 -mt-2 mb-3",
        children: "Canonical SMS, email, and in-app threads for this record (read-only)."
    }, void 0, false, {
        fileName: "[project]/components/admin/communications/CommunicationsDrawerSection.tsx",
        lineNumber: 350,
        columnNumber: 9
    }, this) : null;
    const threadList = (variant)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: variant === "compact" ? "space-y-1.5" : "sm:w-44 shrink-0 space-y-1",
            children: threads.map((t)=>variant === "compact" ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "flex min-w-0 flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 rounded-md border border-alloy-stone/15 bg-white/[0.97] px-2 py-1.5 text-[12px]",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "font-semibold capitalize text-alloy-midnight/85",
                            children: t.channel
                        }, void 0, false, {
                            fileName: "[project]/components/admin/communications/CommunicationsDrawerSection.tsx",
                            lineNumber: 363,
                            columnNumber: 25
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "min-w-0 truncate text-alloy-midnight/60",
                            children: [
                                t.recipient_key ? t.recipient_key : "—",
                                t.updated_at ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "ml-1.5 tabular-nums text-[11px] text-alloy-midnight/45",
                                    children: [
                                        "· ",
                                        (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminFormatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatDateTimeForUserDisplay"])(t.updated_at, viewerTz)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/components/admin/communications/CommunicationsDrawerSection.tsx",
                                    lineNumber: 367,
                                    columnNumber: 33
                                }, this) : null
                            ]
                        }, void 0, true, {
                            fileName: "[project]/components/admin/communications/CommunicationsDrawerSection.tsx",
                            lineNumber: 364,
                            columnNumber: 25
                        }, this)
                    ]
                }, t.id, true, {
                    fileName: "[project]/components/admin/communications/CommunicationsDrawerSection.tsx",
                    lineNumber: 359,
                    columnNumber: 21
                }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                    type: "button",
                    onClick: ()=>setSelectedId(t.id),
                    className: `w-full rounded-md border px-2 py-1.5 text-left text-xs font-medium transition-colors ${selectedId === t.id ? "border-alloy-midnight bg-alloy-midnight text-white" : "border-alloy-stone/30 bg-white text-alloy-forge hover:bg-alloy-stone/10"}`,
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "capitalize",
                            children: t.channel
                        }, void 0, false, {
                            fileName: "[project]/components/admin/communications/CommunicationsDrawerSection.tsx",
                            lineNumber: 384,
                            columnNumber: 25
                        }, this),
                        t.recipient_key ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "mt-0.5 truncate font-normal text-[11px] opacity-80",
                            children: t.recipient_key
                        }, void 0, false, {
                            fileName: "[project]/components/admin/communications/CommunicationsDrawerSection.tsx",
                            lineNumber: 386,
                            columnNumber: 29
                        }, this) : null
                    ]
                }, t.id, true, {
                    fileName: "[project]/components/admin/communications/CommunicationsDrawerSection.tsx",
                    lineNumber: 374,
                    columnNumber: 21
                }, this))
        }, void 0, false, {
            fileName: "[project]/components/admin/communications/CommunicationsDrawerSection.tsx",
            lineNumber: 356,
            columnNumber: 9
        }, this);
    const messagesPanel = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "min-h-[120px] flex-1 rounded-lg border border-alloy-stone/15 bg-white p-3",
        children: selectedId == null ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
            className: "text-sm text-alloy-midnight/60",
            children: "Select a thread."
        }, void 0, false, {
            fileName: "[project]/components/admin/communications/CommunicationsDrawerSection.tsx",
            lineNumber: 397,
            columnNumber: 17
        }, this) : loadingMsgs ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
            className: "text-sm text-alloy-midnight/60",
            children: "Loading messages…"
        }, void 0, false, {
            fileName: "[project]/components/admin/communications/CommunicationsDrawerSection.tsx",
            lineNumber: 399,
            columnNumber: 17
        }, this) : msgErr ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
            className: "text-sm text-alloy-ember",
            children: msgErr
        }, void 0, false, {
            fileName: "[project]/components/admin/communications/CommunicationsDrawerSection.tsx",
            lineNumber: 401,
            columnNumber: 17
        }, this) : msgs.length === 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
            className: "text-sm text-alloy-midnight/60",
            children: "No messages in this thread."
        }, void 0, false, {
            fileName: "[project]/components/admin/communications/CommunicationsDrawerSection.tsx",
            lineNumber: 403,
            columnNumber: 17
        }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
            className: "space-y-2",
            children: msgs.map((m)=>{
                const msgWhen = communicationMessageInstant(m);
                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                    className: "rounded-md border border-alloy-stone/10 bg-alloy-stone/5 px-2.5 py-2 text-sm",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "flex flex-wrap items-baseline justify-between gap-2 text-[12px] text-alloy-forge/70",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "font-semibold capitalize text-alloy-forge",
                                    children: [
                                        m.direction,
                                        " · ",
                                        m.channel ?? "—",
                                        " · ",
                                        m.status ?? "—"
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/components/admin/communications/CommunicationsDrawerSection.tsx",
                                    lineNumber: 411,
                                    columnNumber: 33
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "tabular-nums text-[11px]",
                                    children: msgWhen ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminFormatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatDateTimeForUserDisplay"])(msgWhen, viewerTz) : ""
                                }, void 0, false, {
                                    fileName: "[project]/components/admin/communications/CommunicationsDrawerSection.tsx",
                                    lineNumber: 414,
                                    columnNumber: 33
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/components/admin/communications/CommunicationsDrawerSection.tsx",
                            lineNumber: 410,
                            columnNumber: 29
                        }, this),
                        (m.from_address || m.to_address) && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "mt-1 text-[12px] text-alloy-forge/65",
                            children: [
                                m.from_address ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    children: [
                                        "from ",
                                        m.from_address
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/components/admin/communications/CommunicationsDrawerSection.tsx",
                                    lineNumber: 420,
                                    columnNumber: 55
                                }, this) : null,
                                m.from_address && m.to_address ? " · " : null,
                                m.to_address ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    children: [
                                        "to ",
                                        m.to_address
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/components/admin/communications/CommunicationsDrawerSection.tsx",
                                    lineNumber: 422,
                                    columnNumber: 53
                                }, this) : null
                            ]
                        }, void 0, true, {
                            fileName: "[project]/components/admin/communications/CommunicationsDrawerSection.tsx",
                            lineNumber: 419,
                            columnNumber: 33
                        }, this),
                        m.body ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "mt-1.5 whitespace-pre-wrap text-[13px] text-alloy-forge/90",
                            children: m.body
                        }, void 0, false, {
                            fileName: "[project]/components/admin/communications/CommunicationsDrawerSection.tsx",
                            lineNumber: 426,
                            columnNumber: 33
                        }, this) : null
                    ]
                }, m.id, true, {
                    fileName: "[project]/components/admin/communications/CommunicationsDrawerSection.tsx",
                    lineNumber: 409,
                    columnNumber: 29
                }, this);
            })
        }, void 0, false, {
            fileName: "[project]/components/admin/communications/CommunicationsDrawerSection.tsx",
            lineNumber: 405,
            columnNumber: 17
        }, this)
    }, void 0, false, {
        fileName: "[project]/components/admin/communications/CommunicationsDrawerSection.tsx",
        lineNumber: 395,
        columnNumber: 9
    }, this);
    const emptyThreadsClass = embedded ? "text-[12px] text-alloy-midnight/60" : "text-sm text-alloy-midnight/60";
    const emptyThreadsBody = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
        className: emptyThreadsClass,
        children: "No communication threads for this record yet."
    }, void 0, false, {
        fileName: "[project]/components/admin/communications/CommunicationsDrawerSection.tsx",
        lineNumber: 437,
        columnNumber: 30
    }, this);
    const expandCollapseBtnClass = "text-left text-[12px] font-semibold underline-offset-2 bg-transparent border-0 p-0 cursor-pointer";
    const composerBlock = showEmailComposerChrome && composerEntity ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "mb-3 rounded-md border border-alloy-stone/15 bg-white/[0.98] px-2.5 py-2",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: COMPOSER_LABEL,
                children: "Email (queued send)"
            }, void 0, false, {
                fileName: "[project]/components/admin/communications/CommunicationsDrawerSection.tsx",
                lineNumber: 445,
                columnNumber: 17
            }, this),
            loadingBindings ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "text-[11px] text-alloy-midnight/55",
                children: "Checking org email setup…"
            }, void 0, false, {
                fileName: "[project]/components/admin/communications/CommunicationsDrawerSection.tsx",
                lineNumber: 447,
                columnNumber: 21
            }, this) : bindingsErr ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "text-[11px] text-alloy-ember",
                children: bindingsErr
            }, void 0, false, {
                fileName: "[project]/components/admin/communications/CommunicationsDrawerSection.tsx",
                lineNumber: 449,
                columnNumber: 21
            }, this) : !channelsAvailable.includes("email") ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "text-[11px] text-alloy-midnight/65",
                children: "Email outbound is not configured for this organization (missing active Resend binding)."
            }, void 0, false, {
                fileName: "[project]/components/admin/communications/CommunicationsDrawerSection.tsx",
                lineNumber: 451,
                columnNumber: 21
            }, this) : loadingRecipients ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "text-[11px] text-alloy-midnight/55",
                children: "Loading person recipients…"
            }, void 0, false, {
                fileName: "[project]/components/admin/communications/CommunicationsDrawerSection.tsx",
                lineNumber: 455,
                columnNumber: 21
            }, this) : recipientsErr ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "text-[11px] text-alloy-ember",
                children: recipientsErr
            }, void 0, false, {
                fileName: "[project]/components/admin/communications/CommunicationsDrawerSection.tsx",
                lineNumber: 457,
                columnNumber: 21
            }, this) : recipients.length === 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "text-[11px] text-alloy-midnight/65",
                children: "No person with email on this record — add or link a person with email on the household to send."
            }, void 0, false, {
                fileName: "[project]/components/admin/communications/CommunicationsDrawerSection.tsx",
                lineNumber: 459,
                columnNumber: 21
            }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "mt-1.5 space-y-2",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "space-y-1.5",
                        children: recipients.map((r)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                className: "flex cursor-pointer items-start gap-2 text-[11px] text-alloy-midnight/80",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                        type: "checkbox",
                                        checked: selectedRecipientIds.has(r.person_id),
                                        onChange: ()=>toggleRecipient(r.person_id),
                                        disabled: sendBusy,
                                        className: "mt-0.5 shrink-0"
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/communications/CommunicationsDrawerSection.tsx",
                                        lineNumber: 470,
                                        columnNumber: 37
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "min-w-0 leading-snug",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "font-semibold",
                                                children: r.display_name
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/communications/CommunicationsDrawerSection.tsx",
                                                lineNumber: 478,
                                                columnNumber: 41
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "text-alloy-midnight/55",
                                                children: [
                                                    " · ",
                                                    r.email
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/components/admin/communications/CommunicationsDrawerSection.tsx",
                                                lineNumber: 479,
                                                columnNumber: 41
                                            }, this),
                                            r.relationship_hint ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "block text-[10px] text-alloy-midnight/45",
                                                children: r.relationship_hint
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/communications/CommunicationsDrawerSection.tsx",
                                                lineNumber: 481,
                                                columnNumber: 45
                                            }, this) : null
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/components/admin/communications/CommunicationsDrawerSection.tsx",
                                        lineNumber: 477,
                                        columnNumber: 37
                                    }, this)
                                ]
                            }, r.person_id, true, {
                                fileName: "[project]/components/admin/communications/CommunicationsDrawerSection.tsx",
                                lineNumber: 466,
                                columnNumber: 33
                            }, this))
                    }, void 0, false, {
                        fileName: "[project]/components/admin/communications/CommunicationsDrawerSection.tsx",
                        lineNumber: 464,
                        columnNumber: 25
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                        className: "block space-y-0.5",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "block text-[11px] font-medium text-alloy-midnight/75",
                                children: "Subject"
                            }, void 0, false, {
                                fileName: "[project]/components/admin/communications/CommunicationsDrawerSection.tsx",
                                lineNumber: 488,
                                columnNumber: 29
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                type: "text",
                                value: composerSubject,
                                onChange: (e)=>setComposerSubject(e.target.value),
                                disabled: sendBusy,
                                placeholder: "Optional — sensible default if empty",
                                className: "w-full rounded-md border border-alloy-stone/20 bg-white px-2 py-1 text-[12px] text-alloy-midnight/85 shadow-sm focus:border-alloy-blue focus:outline-none focus:ring-1 focus:ring-alloy-blue/20 disabled:opacity-60",
                                "aria-label": "Subject",
                                autoComplete: "off"
                            }, void 0, false, {
                                fileName: "[project]/components/admin/communications/CommunicationsDrawerSection.tsx",
                                lineNumber: 489,
                                columnNumber: 33
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/admin/communications/CommunicationsDrawerSection.tsx",
                        lineNumber: 487,
                        columnNumber: 25
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("textarea", {
                        value: composerBody,
                        onChange: (e)=>setComposerBody(e.target.value),
                        disabled: sendBusy,
                        rows: 3,
                        placeholder: "Email body (plain text)…",
                        className: "w-full resize-none rounded-md border border-alloy-stone/20 bg-white px-2 py-1.5 text-[12px] leading-snug text-alloy-midnight/85 shadow-sm focus:border-alloy-blue focus:outline-none focus:ring-1 focus:ring-alloy-blue/20 disabled:opacity-60",
                        "aria-label": "Email body"
                    }, void 0, false, {
                        fileName: "[project]/components/admin/communications/CommunicationsDrawerSection.tsx",
                        lineNumber: 500,
                        columnNumber: 25
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex flex-wrap items-center gap-2",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                            type: "button",
                            onClick: ()=>void sendEmails(),
                            disabled: sendBusy || selectedRecipientIds.size === 0 || !composerBody.trim() || !emailOutboundReady,
                            className: "rounded-md border border-alloy-midnight/20 bg-alloy-midnight px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-alloy-midnight/90 disabled:cursor-not-allowed disabled:opacity-45",
                            children: sendBusy ? "Sending…" : `Send (${selectedRecipientIds.size})`
                        }, void 0, false, {
                            fileName: "[project]/components/admin/communications/CommunicationsDrawerSection.tsx",
                            lineNumber: 510,
                            columnNumber: 29
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/components/admin/communications/CommunicationsDrawerSection.tsx",
                        lineNumber: 509,
                        columnNumber: 25
                    }, this),
                    sendErr ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "text-[11px] text-alloy-ember",
                        children: sendErr
                    }, void 0, false, {
                        fileName: "[project]/components/admin/communications/CommunicationsDrawerSection.tsx",
                        lineNumber: 524,
                        columnNumber: 36
                    }, this) : null,
                    sendOkNote ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "text-[11px] text-green-800/85",
                        children: sendOkNote
                    }, void 0, false, {
                        fileName: "[project]/components/admin/communications/CommunicationsDrawerSection.tsx",
                        lineNumber: 525,
                        columnNumber: 39
                    }, this) : null
                ]
            }, void 0, true, {
                fileName: "[project]/components/admin/communications/CommunicationsDrawerSection.tsx",
                lineNumber: 463,
                columnNumber: 21
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/components/admin/communications/CommunicationsDrawerSection.tsx",
        lineNumber: 444,
        columnNumber: 13
    }, this) : null;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: `min-w-0 ${className}`,
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
            children: [
                headerTitle,
                description,
                composerBlock,
                embedded ? !threadSpaceExpanded ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "space-y-2",
                    children: [
                        loadingThreads ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                            className: "text-[12px] text-alloy-midnight/60",
                            children: "Loading threads…"
                        }, void 0, false, {
                            fileName: "[project]/components/admin/communications/CommunicationsDrawerSection.tsx",
                            lineNumber: 543,
                            columnNumber: 33
                        }, this) : thrErr ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                            className: "text-[12px] text-alloy-ember",
                            children: thrErr
                        }, void 0, false, {
                            fileName: "[project]/components/admin/communications/CommunicationsDrawerSection.tsx",
                            lineNumber: 545,
                            columnNumber: 33
                        }, this) : threads.length === 0 ? emptyThreadsBody : threadList("compact"),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                            type: "button",
                            className: `${expandCollapseBtnClass} text-alloy-blue hover:underline`,
                            onClick: ()=>setThreadSpaceExpanded(true),
                            children: "Expand thread space"
                        }, void 0, false, {
                            fileName: "[project]/components/admin/communications/CommunicationsDrawerSection.tsx",
                            lineNumber: 551,
                            columnNumber: 29
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/components/admin/communications/CommunicationsDrawerSection.tsx",
                    lineNumber: 541,
                    columnNumber: 25
                }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "space-y-2",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "flex flex-col gap-3 sm:flex-row",
                            children: loadingThreads ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: "min-h-[120px] flex-1 rounded-lg border border-alloy-stone/15 bg-white p-3 text-[12px] text-alloy-midnight/60",
                                children: "Loading threads…"
                            }, void 0, false, {
                                fileName: "[project]/components/admin/communications/CommunicationsDrawerSection.tsx",
                                lineNumber: 563,
                                columnNumber: 37
                            }, this) : thrErr ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: "min-h-[120px] flex-1 rounded-lg border border-alloy-stone/15 bg-white p-3 text-[12px] text-alloy-ember",
                                children: thrErr
                            }, void 0, false, {
                                fileName: "[project]/components/admin/communications/CommunicationsDrawerSection.tsx",
                                lineNumber: 567,
                                columnNumber: 37
                            }, this) : threads.length === 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "min-h-[120px] flex-1 rounded-lg border border-alloy-stone/15 bg-white p-3",
                                children: emptyThreadsBody
                            }, void 0, false, {
                                fileName: "[project]/components/admin/communications/CommunicationsDrawerSection.tsx",
                                lineNumber: 571,
                                columnNumber: 37
                            }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
                                children: [
                                    threadList("full"),
                                    messagesPanel
                                ]
                            }, void 0, true)
                        }, void 0, false, {
                            fileName: "[project]/components/admin/communications/CommunicationsDrawerSection.tsx",
                            lineNumber: 561,
                            columnNumber: 29
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                            type: "button",
                            className: `${expandCollapseBtnClass} text-alloy-midnight/55 hover:text-alloy-blue hover:underline`,
                            onClick: ()=>{
                                setThreadSpaceExpanded(false);
                                setSelectedId(null);
                            },
                            children: "Collapse thread space"
                        }, void 0, false, {
                            fileName: "[project]/components/admin/communications/CommunicationsDrawerSection.tsx",
                            lineNumber: 581,
                            columnNumber: 29
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/components/admin/communications/CommunicationsDrawerSection.tsx",
                    lineNumber: 560,
                    columnNumber: 25
                }, this) : loadingThreads ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                    className: "text-sm text-alloy-midnight/60",
                    children: "Loading threads…"
                }, void 0, false, {
                    fileName: "[project]/components/admin/communications/CommunicationsDrawerSection.tsx",
                    lineNumber: 594,
                    columnNumber: 21
                }, this) : thrErr ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                    className: "text-sm text-alloy-ember",
                    children: thrErr
                }, void 0, false, {
                    fileName: "[project]/components/admin/communications/CommunicationsDrawerSection.tsx",
                    lineNumber: 596,
                    columnNumber: 21
                }, this) : threads.length === 0 ? emptyThreadsBody : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "flex flex-col gap-3 sm:flex-row",
                    children: [
                        threadList("full"),
                        messagesPanel
                    ]
                }, void 0, true, {
                    fileName: "[project]/components/admin/communications/CommunicationsDrawerSection.tsx",
                    lineNumber: 600,
                    columnNumber: 21
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/components/admin/communications/CommunicationsDrawerSection.tsx",
            lineNumber: 533,
            columnNumber: 13
        }, this)
    }, void 0, false, {
        fileName: "[project]/components/admin/communications/CommunicationsDrawerSection.tsx",
        lineNumber: 532,
        columnNumber: 9
    }, this);
}
_s(CommunicationsDrawerSection, "S6X0hy6Yr0v0KxwsAOjkKfEB7XI=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$contexts$2f$AdminViewerTimezoneContext$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAdminViewerTimezone"]
    ];
});
_c = CommunicationsDrawerSection;
const DRAWER_SECTION_HEADER_CLASS = "text-xs font-semibold tracking-wider text-[#59678b] border-b border-[#e6e8ec] pb-2 mb-4";
var _c;
__turbopack_context__.k.register(_c, "CommunicationsDrawerSection");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/components/admin/StatusBadge.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "AssignmentStatusBadge",
    ()=>AssignmentStatusBadge,
    "StatusBadge",
    ()=>StatusBadge,
    "default",
    ()=>__TURBOPACK__default__export__,
    "getStatusVariant",
    ()=>getStatusVariant
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
"use client";
;
const ASSIGNMENT_STYLES = {
    offered: "bg-alloy-ember/10 text-alloy-ember border-alloy-ember/30",
    accepted: "bg-alloy-pine/12 text-alloy-pine border-alloy-pine/30",
    declined: "bg-alloy-ember/12 text-alloy-ember border-alloy-ember/35",
    removed: "bg-alloy-stone/60 text-alloy-slate border-admin-border",
    completed: "bg-alloy-pine/12 text-alloy-pine border-alloy-pine/30",
    unassigned: "bg-alloy-stone/50 text-alloy-muted border-admin-border",
    canceled: "bg-alloy-ember/12 text-alloy-ember border-alloy-ember/35"
};
function getAssignmentStyle(key) {
    if (!key) return ASSIGNMENT_STYLES.unassigned;
    const k = key.toLowerCase();
    return ASSIGNMENT_STYLES[k] ?? "bg-alloy-stone/50 text-alloy-slate border-admin-border";
}
const PILL_CLASS = "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium";
function AssignmentStatusBadge({ statusKey, label }) {
    const display = label ?? statusKey ?? "Unassigned";
    const style = getAssignmentStyle(statusKey ?? "unassigned");
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
        className: `${PILL_CLASS} ${style}`,
        children: display
    }, void 0, false, {
        fileName: "[project]/components/admin/StatusBadge.tsx",
        lineNumber: 32,
        columnNumber: 12
    }, this);
}
_c = AssignmentStatusBadge;
const STATUS_VARIANTS = {
    default: "bg-alloy-stone/50 text-alloy-slate border-admin-border",
    success: "bg-alloy-pine/12 text-alloy-pine border-alloy-pine/30",
    info: "bg-alloy-blue/10 text-alloy-blue border-alloy-blue/30",
    warning: "bg-alloy-ember/10 text-alloy-ember border-alloy-ember/30",
    error: "bg-alloy-ember/12 text-alloy-ember border-alloy-ember/35",
    neutral: "bg-alloy-stone/50 text-alloy-forge/70 border-admin-border",
    gold: "bg-alloy-light/50 text-alloy-gold-dark border-alloy-gold/40"
};
function getStatusVariant(statusKey) {
    if (!statusKey) return "neutral";
    const k = statusKey.toLowerCase();
    if ([
        "active",
        "completed",
        "success",
        "accepted",
        "posted"
    ].some((x)=>k.includes(x))) return "success";
    if ([
        "pending",
        "new",
        "draft",
        "scheduled",
        "offered",
        "in_progress"
    ].some((x)=>k.includes(x))) return "info";
    if ([
        "inactive",
        "archived",
        "canceled",
        "cancelled",
        "removed",
        "unassigned",
        "declined"
    ].some((x)=>k.includes(x))) return "neutral";
    if ([
        "failed",
        "error",
        "lost"
    ].some((x)=>k.includes(x))) return "error";
    if ([
        "warning",
        "attention"
    ].some((x)=>k.includes(x))) return "warning";
    return "neutral";
}
function StatusBadge({ label, variant = "default" }) {
    const display = label ?? "—";
    const resolvedVariant = variant === "default" ? getStatusVariant(label ?? null) : variant;
    const style = STATUS_VARIANTS[resolvedVariant] ?? STATUS_VARIANTS.default;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
        className: `${PILL_CLASS} ${style}`,
        children: display
    }, void 0, false, {
        fileName: "[project]/components/admin/StatusBadge.tsx",
        lineNumber: 68,
        columnNumber: 12
    }, this);
}
_c1 = StatusBadge;
const __TURBOPACK__default__export__ = StatusBadge;
var _c, _c1;
__turbopack_context__.k.register(_c, "AssignmentStatusBadge");
__turbopack_context__.k.register(_c1, "StatusBadge");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/components/admin/workspace/AdminV2DrawerLoadingState.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "AdminV2DrawerLoadingState",
    ()=>AdminV2DrawerLoadingState
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
;
;
function AdminV2DrawerLoadingState({ title, description, density = "panel", showTrack = true, children, className = "" }) {
    const isMicro = density === "micro";
    const isInline = density === "inline";
    const spinnerLg = !isMicro && !isInline;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: `rounded-lg border border-admin-border/50 bg-gradient-to-b from-white to-alloy-stone/[0.03] shadow-sm ring-1 ring-alloy-stone/[0.06] ${isMicro ? "px-3 py-3" : isInline ? "px-4 py-4" : "px-5 py-6"} ${className}`,
        "aria-busy": "true",
        "aria-live": "polite",
        "aria-label": title,
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: `flex ${isMicro ? "items-center gap-3" : "items-start gap-3"}`,
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: `flex shrink-0 items-center justify-center rounded-full bg-alloy-forge/[0.06] ${spinnerLg ? "h-11 w-11" : isInline ? "h-9 w-9" : "h-8 w-8"}`,
                    "aria-hidden": true,
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: `rounded-full border-[3px] border-alloy-forge/12 border-t-alloy-forge/70 border-r-alloy-forge/35 animate-spin motion-reduce:animate-none ${spinnerLg ? "h-7 w-7" : isInline ? "h-[18px] w-[18px] border-[2px]" : "h-4 w-4 border-2"}`,
                        style: {
                            animationDuration: "0.95s"
                        }
                    }, void 0, false, {
                        fileName: "[project]/components/admin/workspace/AdminV2DrawerLoadingState.tsx",
                        lineNumber: 44,
                        columnNumber: 21
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/components/admin/workspace/AdminV2DrawerLoadingState.tsx",
                    lineNumber: 38,
                    columnNumber: 17
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "min-w-0 flex-1 text-left",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                            className: `m-0 font-semibold text-alloy-forge ${isMicro ? "text-xs" : "text-[13px]"}`,
                            children: title
                        }, void 0, false, {
                            fileName: "[project]/components/admin/workspace/AdminV2DrawerLoadingState.tsx",
                            lineNumber: 52,
                            columnNumber: 21
                        }, this),
                        description ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                            className: `m-0 text-alloy-forge/62 ${isMicro ? "mt-0.5 text-[11px] leading-snug" : "mt-1 text-[11px] leading-snug"}`,
                            children: description
                        }, void 0, false, {
                            fileName: "[project]/components/admin/workspace/AdminV2DrawerLoadingState.tsx",
                            lineNumber: 54,
                            columnNumber: 25
                        }, this) : null,
                        showTrack && !isMicro ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: `adminv2-route-loading-track max-w-[11rem] ${isInline ? "mt-3 opacity-[0.92]" : "mt-4"}`,
                            "aria-hidden": true,
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "adminv2-route-loading-track__bar"
                            }, void 0, false, {
                                fileName: "[project]/components/admin/workspace/AdminV2DrawerLoadingState.tsx",
                                lineNumber: 65,
                                columnNumber: 29
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/components/admin/workspace/AdminV2DrawerLoadingState.tsx",
                            lineNumber: 61,
                            columnNumber: 25
                        }, this) : null,
                        children ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: isMicro ? "mt-0 min-w-0" : "mt-3 min-w-0",
                            children: children
                        }, void 0, false, {
                            fileName: "[project]/components/admin/workspace/AdminV2DrawerLoadingState.tsx",
                            lineNumber: 68,
                            columnNumber: 33
                        }, this) : null
                    ]
                }, void 0, true, {
                    fileName: "[project]/components/admin/workspace/AdminV2DrawerLoadingState.tsx",
                    lineNumber: 51,
                    columnNumber: 17
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/components/admin/workspace/AdminV2DrawerLoadingState.tsx",
            lineNumber: 37,
            columnNumber: 13
        }, this)
    }, void 0, false, {
        fileName: "[project]/components/admin/workspace/AdminV2DrawerLoadingState.tsx",
        lineNumber: 29,
        columnNumber: 9
    }, this);
}
_c = AdminV2DrawerLoadingState;
var _c;
__turbopack_context__.k.register(_c, "AdminV2DrawerLoadingState");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/components/admin/JobPricingBreakdown.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>JobPricingBreakdown
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminFormatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/adminFormatters.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$StatusBadge$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/components/admin/StatusBadge.tsx [app-client] (ecmascript)");
"use client";
;
;
;
function centsNum(v) {
    if (v === null || v === undefined) return null;
    const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
    if (!Number.isFinite(n)) return null;
    return Math.round(n);
}
function formatQty(q) {
    if (q === null || q === undefined) return "1";
    const n = typeof q === "number" ? q : typeof q === "string" ? parseFloat(q) : NaN;
    if (!Number.isFinite(n)) return String(q);
    if (Number.isInteger(n)) return String(n);
    return n.toFixed(2).replace(/\.?0+$/, "");
}
function lineTypeBadgeClass(lineType) {
    const t = String(lineType || "").toLowerCase();
    const base = "inline-flex shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide";
    if (t === "discount") return `${base} bg-red-50 text-red-800 border border-red-200/80`;
    if (t === "tax") return `${base} bg-violet-50 text-violet-900 border border-violet-200/80`;
    if (t === "fee") return `${base} bg-slate-100 text-slate-800 border border-slate-200`;
    if (t === "addon") return `${base} bg-sky-50 text-sky-900 border border-sky-200/80`;
    if (t === "adjustment") return `${base} bg-amber-50 text-amber-900 border border-amber-200/70`;
    return `${base} bg-alloy-stone/40 text-alloy-forge border border-admin-border`;
}
function humanizePricingStatus(s) {
    const t = String(s ?? "").trim().toLowerCase();
    if (!t) return "—";
    return t.charAt(0).toUpperCase() + t.slice(1);
}
function JobPricingBreakdown({ record }) {
    const r = record ?? {};
    const linesRaw = r._job_line_items;
    const lines = Array.isArray(linesRaw) ? linesRaw : [];
    const subtotal = centsNum(r.subtotal_cents);
    const discountTotal = centsNum(r.discount_total_cents);
    const feeTotal = centsNum(r.fee_total_cents);
    const adjustmentTotal = centsNum(r.adjustment_total_cents);
    const taxTotal = centsNum(r.tax_total_cents);
    const total = centsNum(r.total_cents);
    const pricingStatus = r.pricing_status != null ? String(r.pricing_status) : null;
    const pricingLockedAt = r.pricing_locked_at != null ? String(r.pricing_locked_at) : null;
    const pricingVersion = r.pricing_version;
    const hasOverrideLine = lines.some((li)=>li.is_manual_override === true || li.manual_override_reason != null && String(li.manual_override_reason).trim() !== "");
    const overrideReasons = [
        ...new Set(lines.map((li)=>li.manual_override_reason != null ? String(li.manual_override_reason).trim() : "").filter(Boolean))
    ];
    const rowClass = "flex justify-between gap-3 text-sm";
    const labelMuted = "text-alloy-midnight/65";
    const valueStrong = "font-medium text-alloy-forge tabular-nums text-right";
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "space-y-4 md:col-span-2 w-full",
        children: [
            hasOverrideLine && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "rounded border border-amber-200 bg-amber-50/90 px-2.5 py-2 text-xs text-amber-950",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "font-semibold",
                        children: "Pricing was manually overridden"
                    }, void 0, false, {
                        fileName: "[project]/components/admin/JobPricingBreakdown.tsx",
                        lineNumber: 90,
                        columnNumber: 11
                    }, this),
                    overrideReasons.length > 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "mt-1 text-amber-900/90 leading-snug",
                        children: overrideReasons.join(" · ")
                    }, void 0, false, {
                        fileName: "[project]/components/admin/JobPricingBreakdown.tsx",
                        lineNumber: 92,
                        columnNumber: 13
                    }, this) : null
                ]
            }, void 0, true, {
                fileName: "[project]/components/admin/JobPricingBreakdown.tsx",
                lineNumber: 89,
                columnNumber: 9
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "rounded border border-admin-border bg-white/60 px-3 py-2.5 space-y-1.5",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "text-[10px] font-semibold tracking-wider text-alloy-forge/80 mb-1",
                        children: "Summary (from job)"
                    }, void 0, false, {
                        fileName: "[project]/components/admin/JobPricingBreakdown.tsx",
                        lineNumber: 98,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: rowClass,
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: labelMuted,
                                children: "Subtotal"
                            }, void 0, false, {
                                fileName: "[project]/components/admin/JobPricingBreakdown.tsx",
                                lineNumber: 100,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: valueStrong,
                                children: subtotal != null ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminFormatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatMoneyFromCents"])(subtotal) : "—"
                            }, void 0, false, {
                                fileName: "[project]/components/admin/JobPricingBreakdown.tsx",
                                lineNumber: 101,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/admin/JobPricingBreakdown.tsx",
                        lineNumber: 99,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: rowClass,
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: labelMuted,
                                children: "Discounts"
                            }, void 0, false, {
                                fileName: "[project]/components/admin/JobPricingBreakdown.tsx",
                                lineNumber: 104,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: `${valueStrong} text-red-700`,
                                children: discountTotal != null && discountTotal !== 0 ? `−${(0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminFormatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatMoneyFromCents"])(Math.abs(discountTotal))}` : discountTotal === 0 ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminFormatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatMoneyFromCents"])(0) : "—"
                            }, void 0, false, {
                                fileName: "[project]/components/admin/JobPricingBreakdown.tsx",
                                lineNumber: 105,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/admin/JobPricingBreakdown.tsx",
                        lineNumber: 103,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: rowClass,
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: labelMuted,
                                children: "Fees"
                            }, void 0, false, {
                                fileName: "[project]/components/admin/JobPricingBreakdown.tsx",
                                lineNumber: 114,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: `${valueStrong} text-slate-800`,
                                children: feeTotal != null ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminFormatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatMoneyFromCents"])(feeTotal) : "—"
                            }, void 0, false, {
                                fileName: "[project]/components/admin/JobPricingBreakdown.tsx",
                                lineNumber: 115,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/admin/JobPricingBreakdown.tsx",
                        lineNumber: 113,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: rowClass,
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: labelMuted,
                                children: "Adjustments"
                            }, void 0, false, {
                                fileName: "[project]/components/admin/JobPricingBreakdown.tsx",
                                lineNumber: 118,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: valueStrong,
                                children: adjustmentTotal != null ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminFormatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatMoneyFromCents"])(adjustmentTotal) : "—"
                            }, void 0, false, {
                                fileName: "[project]/components/admin/JobPricingBreakdown.tsx",
                                lineNumber: 119,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/admin/JobPricingBreakdown.tsx",
                        lineNumber: 117,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: rowClass,
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: labelMuted,
                                children: "Tax"
                            }, void 0, false, {
                                fileName: "[project]/components/admin/JobPricingBreakdown.tsx",
                                lineNumber: 122,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: `${valueStrong} text-violet-900`,
                                children: taxTotal != null ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminFormatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatMoneyFromCents"])(taxTotal) : "—"
                            }, void 0, false, {
                                fileName: "[project]/components/admin/JobPricingBreakdown.tsx",
                                lineNumber: 123,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/admin/JobPricingBreakdown.tsx",
                        lineNumber: 121,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: `${rowClass} border-t border-admin-border pt-2 mt-2`,
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "text-sm font-semibold text-alloy-forge",
                                children: "Total"
                            }, void 0, false, {
                                fileName: "[project]/components/admin/JobPricingBreakdown.tsx",
                                lineNumber: 126,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "text-sm font-semibold text-alloy-forge tabular-nums text-right",
                                children: total != null ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminFormatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatMoneyFromCents"])(total) : "—"
                            }, void 0, false, {
                                fileName: "[project]/components/admin/JobPricingBreakdown.tsx",
                                lineNumber: 127,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/admin/JobPricingBreakdown.tsx",
                        lineNumber: 125,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/admin/JobPricingBreakdown.tsx",
                lineNumber: 97,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex flex-wrap items-center gap-2 text-xs",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: labelMuted,
                        children: "Status"
                    }, void 0, false, {
                        fileName: "[project]/components/admin/JobPricingBreakdown.tsx",
                        lineNumber: 134,
                        columnNumber: 9
                    }, this),
                    pricingStatus ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$StatusBadge$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["StatusBadge"], {
                        label: humanizePricingStatus(pricingStatus),
                        variant: "default"
                    }, void 0, false, {
                        fileName: "[project]/components/admin/JobPricingBreakdown.tsx",
                        lineNumber: 136,
                        columnNumber: 11
                    }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-alloy-forge",
                        children: "—"
                    }, void 0, false, {
                        fileName: "[project]/components/admin/JobPricingBreakdown.tsx",
                        lineNumber: 138,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-alloy-midnight/40",
                        children: "·"
                    }, void 0, false, {
                        fileName: "[project]/components/admin/JobPricingBreakdown.tsx",
                        lineNumber: 140,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: labelMuted,
                        children: "Locked"
                    }, void 0, false, {
                        fileName: "[project]/components/admin/JobPricingBreakdown.tsx",
                        lineNumber: 141,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-alloy-forge",
                        children: pricingLockedAt ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminFormatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatDateTime"])(pricingLockedAt) : "—"
                    }, void 0, false, {
                        fileName: "[project]/components/admin/JobPricingBreakdown.tsx",
                        lineNumber: 142,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-alloy-midnight/40",
                        children: "·"
                    }, void 0, false, {
                        fileName: "[project]/components/admin/JobPricingBreakdown.tsx",
                        lineNumber: 143,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: labelMuted,
                        children: "Version"
                    }, void 0, false, {
                        fileName: "[project]/components/admin/JobPricingBreakdown.tsx",
                        lineNumber: 144,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-alloy-forge font-mono",
                        children: pricingVersion != null ? String(pricingVersion) : "—"
                    }, void 0, false, {
                        fileName: "[project]/components/admin/JobPricingBreakdown.tsx",
                        lineNumber: 145,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/admin/JobPricingBreakdown.tsx",
                lineNumber: 133,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "text-[10px] font-semibold tracking-wider text-alloy-forge/80 mb-2",
                        children: "Line items (active)"
                    }, void 0, false, {
                        fileName: "[project]/components/admin/JobPricingBreakdown.tsx",
                        lineNumber: 149,
                        columnNumber: 9
                    }, this),
                    lines.length === 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "text-sm text-alloy-midnight/60",
                        children: "No active line items on file."
                    }, void 0, false, {
                        fileName: "[project]/components/admin/JobPricingBreakdown.tsx",
                        lineNumber: 151,
                        columnNumber: 11
                    }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                        className: "divide-y divide-admin-border rounded border border-admin-border bg-white/40",
                        children: lines.map((li)=>{
                            const amt = centsNum(li.amount_cents);
                            const unit = centsNum(li.unit_amount_cents);
                            const qty = formatQty(li.quantity);
                            const lt = String(li.line_type || "line");
                            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                className: "flex flex-col gap-1 px-2.5 py-2 text-sm sm:flex-row sm:items-start sm:justify-between sm:gap-3",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "min-w-0 flex-1 space-y-0.5",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "flex flex-wrap items-center gap-2",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        className: "font-medium text-alloy-forge truncate",
                                                        children: li.label || "—"
                                                    }, void 0, false, {
                                                        fileName: "[project]/components/admin/JobPricingBreakdown.tsx",
                                                        lineNumber: 163,
                                                        columnNumber: 23
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        className: lineTypeBadgeClass(lt),
                                                        children: lt
                                                    }, void 0, false, {
                                                        fileName: "[project]/components/admin/JobPricingBreakdown.tsx",
                                                        lineNumber: 164,
                                                        columnNumber: 23
                                                    }, this),
                                                    li.is_manual_override ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        className: "text-[10px] font-semibold text-amber-800",
                                                        children: "Override"
                                                    }, void 0, false, {
                                                        fileName: "[project]/components/admin/JobPricingBreakdown.tsx",
                                                        lineNumber: 166,
                                                        columnNumber: 25
                                                    }, this) : null
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/components/admin/JobPricingBreakdown.tsx",
                                                lineNumber: 162,
                                                columnNumber: 21
                                            }, this),
                                            li.description ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                className: "text-xs text-alloy-midnight/60 leading-snug",
                                                children: String(li.description)
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/JobPricingBreakdown.tsx",
                                                lineNumber: 170,
                                                columnNumber: 23
                                            }, this) : null,
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                className: "text-xs text-alloy-midnight/55",
                                                children: [
                                                    qty,
                                                    " × ",
                                                    unit != null ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminFormatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatMoneyFromCents"])(unit) : "—",
                                                    li.pricing_source ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        className: "ml-1",
                                                        children: [
                                                            "· ",
                                                            String(li.pricing_source)
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/components/admin/JobPricingBreakdown.tsx",
                                                        lineNumber: 174,
                                                        columnNumber: 44
                                                    }, this) : null
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/components/admin/JobPricingBreakdown.tsx",
                                                lineNumber: 172,
                                                columnNumber: 21
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/components/admin/JobPricingBreakdown.tsx",
                                        lineNumber: 161,
                                        columnNumber: 19
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: `shrink-0 font-medium tabular-nums sm:text-right ${lt === "discount" ? "text-red-700" : lt === "tax" ? "text-violet-900" : lt === "fee" ? "text-slate-800" : "text-alloy-forge"}`,
                                        children: amt != null ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminFormatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatMoneyFromCents"])(amt) : "—"
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/JobPricingBreakdown.tsx",
                                        lineNumber: 177,
                                        columnNumber: 19
                                    }, this)
                                ]
                            }, li.id, true, {
                                fileName: "[project]/components/admin/JobPricingBreakdown.tsx",
                                lineNumber: 160,
                                columnNumber: 17
                            }, this);
                        })
                    }, void 0, false, {
                        fileName: "[project]/components/admin/JobPricingBreakdown.tsx",
                        lineNumber: 153,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/admin/JobPricingBreakdown.tsx",
                lineNumber: 148,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "text-[11px] text-alloy-midnight/50",
                children: "Totals and lines are stored on the job; this view does not recalculate pricing."
            }, void 0, false, {
                fileName: "[project]/components/admin/JobPricingBreakdown.tsx",
                lineNumber: 191,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                type: "button",
                disabled: true,
                className: "mt-1 text-left text-xs text-alloy-midnight/40 cursor-not-allowed",
                title: "Not available yet",
                children: "Adjust pricing from admin…"
            }, void 0, false, {
                fileName: "[project]/components/admin/JobPricingBreakdown.tsx",
                lineNumber: 194,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/components/admin/JobPricingBreakdown.tsx",
        lineNumber: 87,
        columnNumber: 5
    }, this);
}
_c = JobPricingBreakdown;
var _c;
__turbopack_context__.k.register(_c, "JobPricingBreakdown");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/components/admin/JobRrsOverviewTab.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>JobRrsOverviewTab
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/styles/tokens/colors.ts [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
function formatRrsValue(v) {
    if (v == null) return "—";
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
    try {
        return JSON.stringify(v);
    } catch  {
        return String(v);
    }
}
function parseEntityError(json, res) {
    if (typeof json === "string" && json.trim()) return json;
    if (json && typeof json === "object" && "error" in json) {
        const e = json.error;
        if (typeof e === "string" && e.trim()) return e;
    }
    return res.status === 404 ? "Not found" : "Failed to load";
}
function JobRrsOverviewTab({ jobId, variant = "legacy" }) {
    _s();
    const [payload, setPayload] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [err, setErr] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [loading, setLoading] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(true);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "JobRrsOverviewTab.useEffect": ()=>{
            let cancelled = false;
            ({
                "JobRrsOverviewTab.useEffect": async ()=>{
                    setLoading(true);
                    setErr(null);
                    try {
                        const res = await fetch(`/api/admin/entity/jobs/${encodeURIComponent(jobId)}?surface=overview`);
                        const json = await res.json().catch({
                            "JobRrsOverviewTab.useEffect": ()=>null
                        }["JobRrsOverviewTab.useEffect"]);
                        if (!res.ok) throw new Error(parseEntityError(json, res));
                        const rrs = json && typeof json === "object" ? json._rrs : undefined;
                        if (!rrs) throw new Error("No _rrs in response");
                        if (!cancelled) setPayload(rrs);
                    } catch (e) {
                        if (!cancelled) setErr(e.message);
                    } finally{
                        if (!cancelled) setLoading(false);
                    }
                }
            })["JobRrsOverviewTab.useEffect"]();
            return ({
                "JobRrsOverviewTab.useEffect": ()=>{
                    cancelled = true;
                }
            })["JobRrsOverviewTab.useEffect"];
        }
    }["JobRrsOverviewTab.useEffect"], [
        jobId
    ]);
    const v2 = variant === "adminV2";
    if (loading) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
            className: "text-sm py-4",
            style: {
                color: v2 ? __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].textSecondary : undefined
            },
            children: v2 ? "Loading overview…" : "Loading resolver overview…"
        }, void 0, false, {
            fileName: "[project]/components/admin/JobRrsOverviewTab.tsx",
            lineNumber: 65,
            columnNumber: 13
        }, this);
    }
    if (err) return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
        className: "text-sm text-red-600 py-4",
        children: err
    }, void 0, false, {
        fileName: "[project]/components/admin/JobRrsOverviewTab.tsx",
        lineNumber: 70,
        columnNumber: 21
    }, this);
    if (!payload) return null;
    const sectionBorder = v2 ? {
        borderBottomColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].border
    } : undefined;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "space-y-6",
        "data-job-rrs-overview": v2 ? "adminV2" : undefined,
        children: [
            !v2 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "text-xs text-alloy-midnight/50",
                children: [
                    "Resolver surface ",
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("code", {
                        className: "text-[11px]",
                        children: "overview"
                    }, void 0, false, {
                        fileName: "[project]/components/admin/JobRrsOverviewTab.tsx",
                        lineNumber: 79,
                        columnNumber: 38
                    }, this),
                    payload.overview_layout?.template_key ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
                        children: [
                            " ",
                            "· layout ",
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("code", {
                                className: "text-[11px]",
                                children: payload.overview_layout.template_key
                            }, void 0, false, {
                                fileName: "[project]/components/admin/JobRrsOverviewTab.tsx",
                                lineNumber: 83,
                                columnNumber: 38
                            }, this)
                        ]
                    }, void 0, true) : null
                ]
            }, void 0, true, {
                fileName: "[project]/components/admin/JobRrsOverviewTab.tsx",
                lineNumber: 78,
                columnNumber: 17
            }, this) : null,
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: v2 ? "rounded-[10px] border border-solid bg-white p-4 shadow-sm sm:p-5" : "",
                style: v2 ? {
                    borderColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].border,
                    backgroundColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["neutral"].surface
                } : undefined,
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                        className: `text-xs font-semibold tracking-wide pb-2 mb-3 ${v2 ? "" : "text-alloy-forge/75 border-b border-admin-border"}`,
                        style: v2 ? {
                            color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].textSecondary,
                            borderBottomWidth: 1,
                            borderBottomStyle: "solid",
                            ...sectionBorder
                        } : undefined,
                        children: "Record"
                    }, void 0, false, {
                        fileName: "[project]/components/admin/JobRrsOverviewTab.tsx",
                        lineNumber: 92,
                        columnNumber: 17
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3",
                        children: payload.fields.map((f)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "text-sm",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: `text-xs font-medium ${v2 ? "" : "text-alloy-midnight/55"}`,
                                        style: v2 ? {
                                            color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].textSecondary
                                        } : undefined,
                                        children: f.label
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/JobRrsOverviewTab.tsx",
                                        lineNumber: 101,
                                        columnNumber: 29
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: `mt-0.5 break-words ${v2 ? "" : "text-alloy-midnight/90"}`,
                                        style: v2 ? {
                                            color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["neutral"].textPrimary
                                        } : undefined,
                                        children: formatRrsValue(f.value)
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/JobRrsOverviewTab.tsx",
                                        lineNumber: 107,
                                        columnNumber: 29
                                    }, this)
                                ]
                            }, f.key, true, {
                                fileName: "[project]/components/admin/JobRrsOverviewTab.tsx",
                                lineNumber: 100,
                                columnNumber: 25
                            }, this))
                    }, void 0, false, {
                        fileName: "[project]/components/admin/JobRrsOverviewTab.tsx",
                        lineNumber: 98,
                        columnNumber: 17
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/admin/JobRrsOverviewTab.tsx",
                lineNumber: 88,
                columnNumber: 13
            }, this),
            payload.relationship_groups.length > 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "space-y-4",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                        className: `text-xs font-semibold tracking-wide pb-2 ${v2 ? "" : "text-alloy-forge/75 border-b border-admin-border"}`,
                        style: v2 ? {
                            color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].textSecondary,
                            borderBottomWidth: 1,
                            borderBottomStyle: "solid",
                            ...sectionBorder
                        } : undefined,
                        children: "Relationships"
                    }, void 0, false, {
                        fileName: "[project]/components/admin/JobRrsOverviewTab.tsx",
                        lineNumber: 119,
                        columnNumber: 21
                    }, this),
                    payload.relationship_groups.map((g)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                    className: "text-sm font-medium text-alloy-midnight mb-2",
                                    children: g.label
                                }, void 0, false, {
                                    fileName: "[project]/components/admin/JobRrsOverviewTab.tsx",
                                    lineNumber: 127,
                                    columnNumber: 29
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                                    className: "text-sm space-y-1 text-alloy-forge/90",
                                    children: g.items.map((item, i)=>{
                                        const rid = item && typeof item === "object" && "id" in item && typeof item.id === "string" ? item.id : `row-${i}`;
                                        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                            className: "rounded border border-admin-border bg-alloy-stone/15 px-3 py-2 font-mono text-xs break-all",
                                            children: formatRrsValue(item)
                                        }, rid, false, {
                                            fileName: "[project]/components/admin/JobRrsOverviewTab.tsx",
                                            lineNumber: 135,
                                            columnNumber: 41
                                        }, this);
                                    })
                                }, void 0, false, {
                                    fileName: "[project]/components/admin/JobRrsOverviewTab.tsx",
                                    lineNumber: 128,
                                    columnNumber: 29
                                }, this)
                            ]
                        }, g.group_key, true, {
                            fileName: "[project]/components/admin/JobRrsOverviewTab.tsx",
                            lineNumber: 126,
                            columnNumber: 25
                        }, this))
                ]
            }, void 0, true, {
                fileName: "[project]/components/admin/JobRrsOverviewTab.tsx",
                lineNumber: 118,
                columnNumber: 17
            }, this) : null
        ]
    }, void 0, true, {
        fileName: "[project]/components/admin/JobRrsOverviewTab.tsx",
        lineNumber: 76,
        columnNumber: 9
    }, this);
}
_s(JobRrsOverviewTab, "HoKf57s8pI7T8s7O9oO6o2WNE1s=");
_c = JobRrsOverviewTab;
var _c;
__turbopack_context__.k.register(_c, "JobRrsOverviewTab");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/components/admin/AdminDeleteConfirmModal.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "AdminDeleteConfirmModal",
    ()=>AdminDeleteConfirmModal
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
"use client";
;
function AdminDeleteConfirmModal({ isOpen, onClose, onConfirm, recordLabel, entityTypeLabel, isLoading }) {
    if (!isOpen) return null;
    const handleConfirm = ()=>{
        void Promise.resolve(onConfirm()).catch(()=>{});
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "fixed inset-0 z-[80] flex items-center justify-center bg-black/50",
        role: "dialog",
        "aria-modal": "true",
        "aria-labelledby": "admin-delete-modal-title",
        onClick: onClose,
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "bg-white rounded-lg shadow-lg border border-alloy-stone/30 p-5 max-w-md w-full mx-4",
            onClick: (e)=>e.stopPropagation(),
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                    id: "admin-delete-modal-title",
                    className: "text-base font-semibold text-alloy-midnight mb-2",
                    children: [
                        "Delete ",
                        entityTypeLabel,
                        "?"
                    ]
                }, void 0, true, {
                    fileName: "[project]/components/admin/AdminDeleteConfirmModal.tsx",
                    lineNumber: 40,
                    columnNumber: 17
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                    className: "text-sm text-alloy-midnight/80 mb-1",
                    children: [
                        "This will permanently remove ",
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                            children: recordLabel || "this record"
                        }, void 0, false, {
                            fileName: "[project]/components/admin/AdminDeleteConfirmModal.tsx",
                            lineNumber: 44,
                            columnNumber: 50
                        }, this),
                        ". This action cannot be undone."
                    ]
                }, void 0, true, {
                    fileName: "[project]/components/admin/AdminDeleteConfirmModal.tsx",
                    lineNumber: 43,
                    columnNumber: 17
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                    className: "text-sm text-alloy-ember font-medium mb-4",
                    children: "This is destructive and cannot be undone."
                }, void 0, false, {
                    fileName: "[project]/components/admin/AdminDeleteConfirmModal.tsx",
                    lineNumber: 46,
                    columnNumber: 17
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "flex justify-end gap-2",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                            type: "button",
                            onClick: onClose,
                            disabled: isLoading,
                            className: "px-3 py-1.5 text-sm border border-alloy-stone/40 rounded hover:bg-alloy-stone/20 disabled:opacity-50",
                            children: "Cancel"
                        }, void 0, false, {
                            fileName: "[project]/components/admin/AdminDeleteConfirmModal.tsx",
                            lineNumber: 48,
                            columnNumber: 21
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                            type: "button",
                            onClick: handleConfirm,
                            disabled: isLoading,
                            className: "px-3 py-1.5 text-sm bg-alloy-ember text-white rounded hover:opacity-90 disabled:opacity-50",
                            children: isLoading ? "Deleting…" : "Delete permanently"
                        }, void 0, false, {
                            fileName: "[project]/components/admin/AdminDeleteConfirmModal.tsx",
                            lineNumber: 56,
                            columnNumber: 21
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/components/admin/AdminDeleteConfirmModal.tsx",
                    lineNumber: 47,
                    columnNumber: 17
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/components/admin/AdminDeleteConfirmModal.tsx",
            lineNumber: 36,
            columnNumber: 13
        }, this)
    }, void 0, false, {
        fileName: "[project]/components/admin/AdminDeleteConfirmModal.tsx",
        lineNumber: 29,
        columnNumber: 9
    }, this);
}
_c = AdminDeleteConfirmModal;
var _c;
__turbopack_context__.k.register(_c, "AdminDeleteConfirmModal");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/components/admin/JobReceivableChargesPanel.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "JobReceivableChargesPanel",
    ()=>JobReceivableChargesPanel,
    "jobTotalSummaryLabel",
    ()=>jobTotalSummaryLabel
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminFormatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/adminFormatters.ts [app-client] (ecmascript)");
"use client";
;
;
function labelChargeType(t) {
    const k = t.toLowerCase();
    if (k === "service") return "Service";
    if (k === "fee") return "Fee";
    if (k === "adjustment") return "Adjustment";
    if (k === "cancellation_fee") return "Cancellation fee";
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : "—";
}
/** Short sub-label so adjustment vs cancellation fee is obvious in finance surfaces. */ function chargeTypeHint(chargeType) {
    const k = chargeType.toLowerCase();
    if (k === "adjustment") return "Pricing change (credit or additional charge)";
    if (k === "cancellation_fee") return "From schedule cancellation rules";
    if (k === "service") return "Primary visit / service receivable";
    if (k === "fee") return "Other fee";
    return null;
}
function labelChargeStatus(s) {
    const k = s.toLowerCase();
    const map = {
        draft: "Draft",
        posted: "Posted",
        partially_paid: "Partially paid",
        paid: "Paid",
        void: "Void"
    };
    return map[k] ?? (s ? s.charAt(0).toUpperCase() + s.slice(1) : "—");
}
function shortId(id) {
    if (id.length <= 10) return id;
    return `…${id.slice(-8)}`;
}
function dateCell(service, due) {
    const parts = [];
    if (service) parts.push(`Svc ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminFormatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatDate"])(service)}`);
    if (due) parts.push(`Due ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminFormatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatDate"])(due)}`);
    return parts.length ? parts.join(" · ") : "—";
}
function formatOutstanding(cents) {
    if (cents < 0) {
        return {
            text: `${(0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminFormatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatMoneyFromCents"])(cents)} (credit)`,
            isCredit: true
        };
    }
    return {
        text: (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminFormatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatMoneyFromCents"])(cents),
        isCredit: false
    };
}
function JobReceivableChargesPanel({ receivableSource, chargeRows, openChargeCount, contextScheduleId, compact = false, className = "" }) {
    const rows = chargeRows ?? [];
    const ctxSid = contextScheduleId?.trim() || null;
    if (receivableSource === "legacy_job") {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: `rounded-md border border-alloy-stone/20 bg-alloy-stone/5 px-3 py-2 text-xs text-alloy-midnight/60 leading-relaxed ${className}`,
            children: "Balance uses priced job lines (no receivable charges on file yet). When pricing locks, a service charge is created and totals follow charges."
        }, void 0, false, {
            fileName: "[project]/components/admin/JobReceivableChargesPanel.tsx",
            lineNumber: 83,
            columnNumber: 13
        }, this);
    }
    if (receivableSource !== "charges" || rows.length === 0) {
        return null;
    }
    const th = compact ? "text-[10px] py-1 pr-2" : "text-[11px] py-1.5 pr-2";
    const td = compact ? "text-xs py-1.5 pr-2 align-top" : "text-sm py-2 pr-2 align-top";
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: `rounded-md border border-alloy-stone/30 bg-white px-3 py-2 ${className}`,
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-baseline justify-between gap-2 mb-2",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: `font-semibold text-alloy-midnight ${compact ? "text-xs" : "text-sm"}`,
                        children: "Open receivable charges"
                    }, void 0, false, {
                        fileName: "[project]/components/admin/JobReceivableChargesPanel.tsx",
                        lineNumber: 102,
                        columnNumber: 17
                    }, this),
                    openChargeCount != null && openChargeCount > 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-[11px] text-alloy-midnight/55 tabular-nums",
                        children: [
                            openChargeCount,
                            " with balance"
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/admin/JobReceivableChargesPanel.tsx",
                        lineNumber: 104,
                        columnNumber: 21
                    }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-[11px] text-alloy-midnight/45",
                        children: "No outstanding balance"
                    }, void 0, false, {
                        fileName: "[project]/components/admin/JobReceivableChargesPanel.tsx",
                        lineNumber: 106,
                        columnNumber: 21
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/admin/JobReceivableChargesPanel.tsx",
                lineNumber: 101,
                columnNumber: 13
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "text-[11px] text-alloy-midnight/55 mb-2 leading-snug",
                children: ctxSid ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
                    children: [
                        "Rows ",
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "font-medium text-alloy-midnight/70",
                            children: "highlighted"
                        }, void 0, false, {
                            fileName: "[project]/components/admin/JobReceivableChargesPanel.tsx",
                            lineNumber: 112,
                            columnNumber: 30
                        }, this),
                        " are linked to this visit (",
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "font-mono text-[10px]",
                            children: "schedule_id"
                        }, void 0, false, {
                            fileName: "[project]/components/admin/JobReceivableChargesPanel.tsx",
                            lineNumber: 113,
                            columnNumber: 25
                        }, this),
                        "). The summary totals still reflect",
                        " ",
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                            children: "all"
                        }, void 0, false, {
                            fileName: "[project]/components/admin/JobReceivableChargesPanel.tsx",
                            lineNumber: 114,
                            columnNumber: 25
                        }, this),
                        " charges on the job; card collection allocates against open balances on the server."
                    ]
                }, void 0, true) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
                    children: "Summary totals are the sum of these charge amounts. Posted payments allocate to charges (plus any legacy job-only allocations). Adjustments and cancellation fees appear as their own rows."
                }, void 0, false)
            }, void 0, false, {
                fileName: "[project]/components/admin/JobReceivableChargesPanel.tsx",
                lineNumber: 109,
                columnNumber: 13
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "overflow-x-auto -mx-1",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("table", {
                    className: `w-full ${compact ? "" : "min-w-[520px]"}`,
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("thead", {
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("tr", {
                                className: "border-b border-alloy-stone/25 text-left text-alloy-midnight/60 tracking-wide",
                                children: [
                                    !compact && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("th", {
                                        className: th,
                                        children: "ID"
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/JobReceivableChargesPanel.tsx",
                                        lineNumber: 127,
                                        columnNumber: 42
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("th", {
                                        className: th,
                                        children: "Type"
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/JobReceivableChargesPanel.tsx",
                                        lineNumber: 128,
                                        columnNumber: 29
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("th", {
                                        className: th,
                                        children: "Status"
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/JobReceivableChargesPanel.tsx",
                                        lineNumber: 129,
                                        columnNumber: 29
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("th", {
                                        className: `${th} text-right`,
                                        children: "Amount"
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/JobReceivableChargesPanel.tsx",
                                        lineNumber: 130,
                                        columnNumber: 29
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("th", {
                                        className: `${th} text-right`,
                                        children: "Paid"
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/JobReceivableChargesPanel.tsx",
                                        lineNumber: 131,
                                        columnNumber: 29
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("th", {
                                        className: `${th} text-right`,
                                        children: "Outstanding"
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/JobReceivableChargesPanel.tsx",
                                        lineNumber: 132,
                                        columnNumber: 29
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("th", {
                                        className: th,
                                        children: "Dates"
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/JobReceivableChargesPanel.tsx",
                                        lineNumber: 133,
                                        columnNumber: 29
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/admin/JobReceivableChargesPanel.tsx",
                                lineNumber: 126,
                                columnNumber: 25
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/components/admin/JobReceivableChargesPanel.tsx",
                            lineNumber: 125,
                            columnNumber: 21
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("tbody", {
                            children: rows.map((r)=>{
                                const linkedVisit = !!(ctxSid && r.schedule_id && r.schedule_id === ctxSid);
                                const out = formatOutstanding(r.outstanding_cents);
                                const hint = chargeTypeHint(r.charge_type);
                                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("tr", {
                                    className: `border-b border-alloy-stone/15 last:border-0 ${linkedVisit ? "bg-alloy-blue/[0.06]" : ""}`,
                                    children: [
                                        !compact && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("td", {
                                            className: `${td} font-mono text-alloy-midnight/50`,
                                            title: r.charge_id,
                                            children: shortId(r.charge_id)
                                        }, void 0, false, {
                                            fileName: "[project]/components/admin/JobReceivableChargesPanel.tsx",
                                            lineNumber: 147,
                                            columnNumber: 41
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("td", {
                                            className: td,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "flex flex-wrap items-center gap-1.5",
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            className: "font-medium text-alloy-midnight",
                                                            children: labelChargeType(r.charge_type)
                                                        }, void 0, false, {
                                                            fileName: "[project]/components/admin/JobReceivableChargesPanel.tsx",
                                                            lineNumber: 153,
                                                            columnNumber: 45
                                                        }, this),
                                                        linkedVisit ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            className: "text-[10px] font-medium tracking-wide text-alloy-blue bg-alloy-blue/10 px-1.5 py-0.5 rounded",
                                                            children: "This visit"
                                                        }, void 0, false, {
                                                            fileName: "[project]/components/admin/JobReceivableChargesPanel.tsx",
                                                            lineNumber: 155,
                                                            columnNumber: 49
                                                        }, this) : null
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/components/admin/JobReceivableChargesPanel.tsx",
                                                    lineNumber: 152,
                                                    columnNumber: 41
                                                }, this),
                                                hint ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: `block font-normal text-alloy-midnight/50 leading-snug mt-0.5 ${compact ? "text-[10px]" : "text-[11px]"}`,
                                                    children: hint
                                                }, void 0, false, {
                                                    fileName: "[project]/components/admin/JobReceivableChargesPanel.tsx",
                                                    lineNumber: 161,
                                                    columnNumber: 45
                                                }, this) : null,
                                                r.description ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: `block font-normal text-alloy-midnight/55 leading-snug mt-0.5 ${compact ? "text-[10px]" : "text-[11px]"}`,
                                                    children: r.description
                                                }, void 0, false, {
                                                    fileName: "[project]/components/admin/JobReceivableChargesPanel.tsx",
                                                    lineNumber: 170,
                                                    columnNumber: 45
                                                }, this) : null
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/components/admin/JobReceivableChargesPanel.tsx",
                                            lineNumber: 151,
                                            columnNumber: 37
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("td", {
                                            className: td,
                                            children: labelChargeStatus(r.status)
                                        }, void 0, false, {
                                            fileName: "[project]/components/admin/JobReceivableChargesPanel.tsx",
                                            lineNumber: 179,
                                            columnNumber: 37
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("td", {
                                            className: `${td} text-right tabular-nums font-medium`,
                                            children: (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminFormatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatMoneyFromCents"])(r.amount_cents)
                                        }, void 0, false, {
                                            fileName: "[project]/components/admin/JobReceivableChargesPanel.tsx",
                                            lineNumber: 180,
                                            columnNumber: 37
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("td", {
                                            className: `${td} text-right tabular-nums`,
                                            children: (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminFormatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatMoneyFromCents"])(r.posted_allocated_cents)
                                        }, void 0, false, {
                                            fileName: "[project]/components/admin/JobReceivableChargesPanel.tsx",
                                            lineNumber: 181,
                                            columnNumber: 37
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("td", {
                                            className: `${td} text-right tabular-nums font-medium ${out.isCredit ? "text-alloy-juniper" : "text-alloy-midnight"}`,
                                            children: out.text
                                        }, void 0, false, {
                                            fileName: "[project]/components/admin/JobReceivableChargesPanel.tsx",
                                            lineNumber: 182,
                                            columnNumber: 37
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("td", {
                                            className: `${td} text-alloy-midnight/70 whitespace-nowrap`,
                                            children: dateCell(r.service_date, r.due_date)
                                        }, void 0, false, {
                                            fileName: "[project]/components/admin/JobReceivableChargesPanel.tsx",
                                            lineNumber: 189,
                                            columnNumber: 37
                                        }, this)
                                    ]
                                }, r.charge_id, true, {
                                    fileName: "[project]/components/admin/JobReceivableChargesPanel.tsx",
                                    lineNumber: 142,
                                    columnNumber: 33
                                }, this);
                            })
                        }, void 0, false, {
                            fileName: "[project]/components/admin/JobReceivableChargesPanel.tsx",
                            lineNumber: 136,
                            columnNumber: 21
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/components/admin/JobReceivableChargesPanel.tsx",
                    lineNumber: 124,
                    columnNumber: 17
                }, this)
            }, void 0, false, {
                fileName: "[project]/components/admin/JobReceivableChargesPanel.tsx",
                lineNumber: 123,
                columnNumber: 13
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/components/admin/JobReceivableChargesPanel.tsx",
        lineNumber: 100,
        columnNumber: 9
    }, this);
}
_c = JobReceivableChargesPanel;
function jobTotalSummaryLabel(receivableSource) {
    return receivableSource === "charges" ? "Total charged (sum of charges)" : "Job total (legacy pricing)";
}
var _c;
__turbopack_context__.k.register(_c, "JobReceivableChargesPanel");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/components/admin/AdminCollectPaymentModal.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "AdminCollectPaymentModal",
    ()=>AdminCollectPaymentModal
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$polyfills$2f$process$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = /*#__PURE__*/ __turbopack_context__.i("[project]/node_modules/next/dist/build/polyfills/process.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$stripe$2f$stripe$2d$js$2f$dist$2f$stripe$2e$esm$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@stripe/stripe-js/dist/stripe.esm.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$adHocChargeTypes$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/adHocChargeTypes.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$paymentRunFeedback$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/paymentRunFeedback.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$JobReceivableChargesPanel$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/components/admin/JobReceivableChargesPanel.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminFormatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/adminFormatters.ts [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
;
;
;
;
function money(cents) {
    if (cents == null || !Number.isFinite(cents)) return "—";
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminFormatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatMoneyFromCents"])(Math.max(0, Math.round(cents)));
}
function defaultCentsForTarget(target, data) {
    if (!data || target === "adhoc") return null;
    if (data.job.balance_cents > 0) return data.job.balance_cents;
    const jobTotal = data.job.job_total_cents ?? data.job.original_cents;
    if (jobTotal != null && jobTotal > 0) return jobTotal;
    return 0;
}
function AdminCollectPaymentModal({ isOpen, onClose, context, disabled, onAfterRun, onPaymentOutcome, /** Increment after a successful charge so the modal refetches payment-collect-context while still open. */ contextRefreshKey }) {
    _s();
    const [collect, setCollect] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [ctxLoading, setCtxLoading] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [ctxError, setCtxError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [target, setTarget] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("job");
    const [cardMode, setCardMode] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("on_file");
    const [savePaymentMethod, setSavePaymentMethod] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(true);
    const [amountDollars, setAmountDollars] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [amountTouched, setAmountTouched] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [adhocChargeType, setAdhocChargeType] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$adHocChargeTypes$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AD_HOC_CHARGE_TYPE_OPTIONS"][0]?.value ?? "other");
    const [submitting, setSubmitting] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [feedback, setFeedback] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [stripe, setStripe] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [cardEl, setCardEl] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const cardMountRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    /** Prevents overlapping charges if the button is double-clicked before React re-renders. */ const paymentInFlightRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(false);
    const runAfterPaymentSideEffects = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "AdminCollectPaymentModal.useCallback[runAfterPaymentSideEffects]": (jobId, scheduleId)=>{
            queueMicrotask({
                "AdminCollectPaymentModal.useCallback[runAfterPaymentSideEffects]": ()=>{
                    console.log("[CollectPayment] onAfterRun start", {
                        jobId: jobId.slice(0, 8),
                        scheduleId: scheduleId?.slice(0, 8) ?? null
                    });
                    try {
                        onAfterRun(jobId, scheduleId);
                    } finally{
                        console.log("[CollectPayment] onAfterRun end");
                    }
                }
            }["AdminCollectPaymentModal.useCallback[runAfterPaymentSideEffects]"]);
        }
    }["AdminCollectPaymentModal.useCallback[runAfterPaymentSideEffects]"], [
        onAfterRun
    ]);
    const hasSchedule = !!(context?.scheduleId && context.scheduleId.trim());
    const effectiveJobId = context?.jobId ?? "";
    const applyDefaultAmount = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "AdminCollectPaymentModal.useCallback[applyDefaultAmount]": (t, data)=>{
            if (amountTouched) return;
            const c = defaultCentsForTarget(t, data);
            if (c != null && c >= 0) setAmountDollars(c === 0 ? "" : (c / 100).toFixed(2));
            else setAmountDollars("");
        }
    }["AdminCollectPaymentModal.useCallback[applyDefaultAmount]"], [
        amountTouched
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "AdminCollectPaymentModal.useEffect": ()=>{
            if (!isOpen || !context?.jobId) {
                setCollect(null);
                setCtxError(null);
                setCtxLoading(false);
                return;
            }
            let cancelled = false;
            setCtxLoading(true);
            setCtxError(null);
            const q = context.scheduleId?.trim() ? `?schedule_id=${encodeURIComponent(context.scheduleId.trim())}` : "";
            fetch(`/api/admin/jobs/${context.jobId}/payment-collect-context${q}`).then({
                "AdminCollectPaymentModal.useEffect": (r)=>r.json().then({
                        "AdminCollectPaymentModal.useEffect": (j)=>({
                                ok: r.ok,
                                j
                            })
                    }["AdminCollectPaymentModal.useEffect"])
            }["AdminCollectPaymentModal.useEffect"]).then({
                "AdminCollectPaymentModal.useEffect": ({ ok, j })=>{
                    if (cancelled) return;
                    if (!ok) throw new Error(j.error ?? "Failed to load payment context");
                    setCollect(j);
                }
            }["AdminCollectPaymentModal.useEffect"]).catch({
                "AdminCollectPaymentModal.useEffect": (e)=>{
                    if (!cancelled) {
                        setCollect(null);
                        setCtxError(e.message);
                    }
                }
            }["AdminCollectPaymentModal.useEffect"]).finally({
                "AdminCollectPaymentModal.useEffect": ()=>{
                    if (!cancelled) setCtxLoading(false);
                }
            }["AdminCollectPaymentModal.useEffect"]);
            return ({
                "AdminCollectPaymentModal.useEffect": ()=>{
                    cancelled = true;
                }
            })["AdminCollectPaymentModal.useEffect"];
        }
    }["AdminCollectPaymentModal.useEffect"], [
        isOpen,
        context?.jobId,
        context?.scheduleId,
        contextRefreshKey
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "AdminCollectPaymentModal.useEffect": ()=>{
            if (!isOpen || !context) return;
            setTarget("job");
            setCardMode("on_file");
            setSavePaymentMethod(true);
            setFeedback(null);
            setAmountTouched(false);
            setAdhocChargeType(__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$adHocChargeTypes$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AD_HOC_CHARGE_TYPE_OPTIONS"][0]?.value ?? "other");
        }
    }["AdminCollectPaymentModal.useEffect"], [
        isOpen,
        context
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "AdminCollectPaymentModal.useEffect": ()=>{
            if (!isOpen || !collect || amountTouched) return;
            applyDefaultAmount(target, collect);
        }
    }["AdminCollectPaymentModal.useEffect"], [
        isOpen,
        collect,
        target,
        amountTouched,
        applyDefaultAmount
    ]);
    /** Load Stripe.js whenever the modal is open so 3DS / requires_action works for saved-card charges too. */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "AdminCollectPaymentModal.useEffect": ()=>{
            if (!isOpen) {
                setStripe(null);
                setCardEl(null);
                return;
            }
            const pk = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$polyfills$2f$process$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].env.NEXT_PUBLIC_STRIPE_PUBLISHABLE?.trim();
            if (!pk) return;
            let cancelled = false;
            void ({
                "AdminCollectPaymentModal.useEffect": async ()=>{
                    const s = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$stripe$2f$stripe$2d$js$2f$dist$2f$stripe$2e$esm$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["loadStripe"])(pk);
                    if (cancelled || !s) return;
                    setStripe(s);
                }
            })["AdminCollectPaymentModal.useEffect"]();
            return ({
                "AdminCollectPaymentModal.useEffect": ()=>{
                    cancelled = true;
                    setStripe(null);
                    setCardEl(null);
                }
            })["AdminCollectPaymentModal.useEffect"];
        }
    }["AdminCollectPaymentModal.useEffect"], [
        isOpen
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "AdminCollectPaymentModal.useEffect": ()=>{
            if (!stripe || cardMode !== "new_card" || !isOpen) return;
            const el = stripe.elements().create("card", {
                style: {
                    base: {
                        fontSize: "16px",
                        color: "#1a1a1a",
                        "::placeholder": {
                            color: "#9ca3af"
                        }
                    },
                    invalid: {
                        color: "#ef4444"
                    }
                }
            });
            setCardEl(el);
            return ({
                "AdminCollectPaymentModal.useEffect": ()=>{
                    try {
                        el.unmount();
                        el.destroy();
                    } catch  {
                    /* ignore */ }
                    setCardEl(null);
                }
            })["AdminCollectPaymentModal.useEffect"];
        }
    }["AdminCollectPaymentModal.useEffect"], [
        stripe,
        cardMode,
        isOpen
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "AdminCollectPaymentModal.useEffect": ()=>{
            if (!cardEl || !cardMountRef.current || cardMode !== "new_card") return;
            const node = cardMountRef.current;
            if (node.childElementCount > 0) return;
            cardEl.mount(node);
            return ({
                "AdminCollectPaymentModal.useEffect": ()=>{
                    try {
                        cardEl.unmount();
                    } catch  {
                    /* ignore */ }
                }
            })["AdminCollectPaymentModal.useEffect"];
        }
    }["AdminCollectPaymentModal.useEffect"], [
        cardEl,
        cardMode
    ]);
    const amountCentsPayload = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "AdminCollectPaymentModal.useMemo[amountCentsPayload]": ()=>{
            const t = amountDollars.trim();
            if (!t) return undefined;
            const n = Number.parseFloat(t);
            if (!Number.isFinite(n) || n < 0) return undefined;
            return Math.round(n * 100);
        }
    }["AdminCollectPaymentModal.useMemo[amountCentsPayload]"], [
        amountDollars
    ]);
    const hasStripeCustomer = !!collect?.customer?.stripe_customer_id;
    const adhocValid = target !== "adhoc" || !!adhocChargeType && amountCentsPayload != null && amountCentsPayload > 0;
    const canSubmitSaved = !!effectiveJobId && !submitting && !disabled && cardMode === "on_file" && adhocValid && !ctxLoading && !ctxError;
    const canSubmitNew = !!effectiveJobId && !submitting && !disabled && cardMode === "new_card" && adhocValid && stripe && cardEl && hasStripeCustomer && !ctxLoading && !ctxError;
    const canSubmit = canSubmitSaved || canSubmitNew;
    const runPayment = async ()=>{
        if (paymentInFlightRef.current) {
            console.warn("[CollectPayment] ignored duplicate submit (in-flight)");
            return;
        }
        if (!effectiveJobId || !canSubmit) return;
        paymentInFlightRef.current = true;
        const traceId = crypto.randomUUID().slice(0, 8);
        const afterScheduleId = context?.scheduleId?.trim() ? context.scheduleId.trim() : null;
        console.log("[CollectPayment] charge start", {
            traceId,
            jobId: effectiveJobId.slice(0, 8),
            cardMode,
            target
        });
        setSubmitting(true);
        setFeedback(null);
        try {
            let paymentMethodId;
            if (cardMode === "new_card" && stripe && cardEl) {
                const { error: pmErr, paymentMethod } = await stripe.createPaymentMethod({
                    type: "card",
                    card: cardEl
                });
                if (pmErr || !paymentMethod?.id) {
                    const line = {
                        type: "error",
                        message: pmErr?.message ?? "Could not read card"
                    };
                    setFeedback(line);
                    onPaymentOutcome?.(line);
                    console.log("[CollectPayment] new card PM error, abort", {
                        traceId
                    });
                    return;
                }
                paymentMethodId = paymentMethod.id;
            }
            const body = {
                job_id: effectiveJobId
            };
            if (amountCentsPayload != null) body.amount_cents = amountCentsPayload;
            if (target === "adhoc") {
                body.ad_hoc_charge_type = adhocChargeType;
                body.payment_target = "ad_hoc";
            } else {
                body.payment_target = "job";
                const sid = context?.scheduleId?.trim();
                if (sid) body.schedule_id = sid;
            }
            if (paymentMethodId) {
                body.payment_method_id = paymentMethodId;
                body.save_payment_method = savePaymentMethod;
            }
            const idempotencyKey = crypto.randomUUID();
            body.idempotency_key = idempotencyKey;
            console.log("[CollectPayment] request sent", {
                traceId,
                idempotencyKey: idempotencyKey.slice(0, 8) + "…",
                cardMode,
                target,
                amount_cents: body.amount_cents
            });
            const res = await fetch("/api/admin/payments/run", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(body)
            });
            const json = await res.json().catch(()=>({}));
            console.log("[CollectPayment] response received", {
                traceId,
                httpStatus: res.status,
                ok: json.ok,
                requires_action: json.requires_action
            });
            if (json.requires_action === true && typeof json.client_secret === "string") {
                if (!stripe) {
                    const line = {
                        type: "error",
                        message: "This payment needs authentication but Stripe.js is not loaded. Check NEXT_PUBLIC_STRIPE_PUBLISHABLE."
                    };
                    setFeedback(line);
                    onPaymentOutcome?.(line);
                    runAfterPaymentSideEffects(effectiveJobId, afterScheduleId);
                    return;
                }
                const { error: cErr, paymentIntent } = await stripe.confirmCardPayment(json.client_secret);
                if (cErr) {
                    const line = {
                        type: "error",
                        message: cErr.message ?? "Authentication failed"
                    };
                    setFeedback(line);
                    onPaymentOutcome?.(line);
                    runAfterPaymentSideEffects(effectiveJobId, afterScheduleId);
                    return;
                }
                if (paymentIntent?.status === "succeeded") {
                    const amt = paymentIntent.amount ?? amountCentsPayload;
                    const parts = [
                        "Payment succeeded"
                    ];
                    if (typeof amt === "number" && Number.isFinite(amt)) parts.push((0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminFormatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatMoneyFromCents"])(amt));
                    const line = {
                        type: "success",
                        message: parts.join(" · ")
                    };
                    setFeedback(line);
                    onPaymentOutcome?.(line);
                    console.log("[CollectPayment] 3DS success, scheduling refresh", {
                        traceId
                    });
                    runAfterPaymentSideEffects(effectiveJobId, afterScheduleId);
                    return;
                } else {
                    const line = {
                        type: "error",
                        message: `Payment status: ${paymentIntent?.status ?? "unknown"}`
                    };
                    setFeedback(line);
                    onPaymentOutcome?.(line);
                    runAfterPaymentSideEffects(effectiveJobId, afterScheduleId);
                    return;
                }
            }
            if (res.status === 409) {
                const msg = typeof json.error === "string" && json.error || "Request conflict";
                setFeedback({
                    type: "error",
                    message: msg
                });
                onPaymentOutcome?.({
                    type: "error",
                    message: msg
                });
                runAfterPaymentSideEffects(effectiveJobId, afterScheduleId);
                return;
            }
            const fb = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$paymentRunFeedback$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["adminPaymentRunFeedback"])(json, res.ok && json.ok === true);
            const line = {
                type: fb.ok ? "success" : "error",
                message: fb.message
            };
            setFeedback(line);
            onPaymentOutcome?.(line);
            console.log("[CollectPayment] outcome set, scheduling refresh", {
                traceId,
                fbOk: fb.ok
            });
            runAfterPaymentSideEffects(effectiveJobId, afterScheduleId);
        } catch (e) {
            const line = {
                type: "error",
                message: e.message
            };
            setFeedback(line);
            onPaymentOutcome?.(line);
            console.log("[CollectPayment] error", {
                traceId,
                message: line.message
            });
        } finally{
            paymentInFlightRef.current = false;
            setSubmitting(false);
            console.log("[CollectPayment] processing cleared", {
                traceId
            });
        }
    };
    const onTargetChange = (next)=>{
        setTarget(next);
    };
    const scheduleContextLine = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "AdminCollectPaymentModal.useMemo[scheduleContextLine]": ()=>{
            if (!hasSchedule || !collect) return null;
            const sc = collect.schedule_context;
            const visit = context?.scheduleLabel && String(context.scheduleLabel).trim() || (sc?.visit_start_at ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminFormatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatDateTime"])(String(sc.visit_start_at)) : null);
            const price = sc?.list_price_cents != null && Number.isFinite(sc.list_price_cents) && sc.list_price_cents > 0 ? money(sc.list_price_cents) : null;
            const linked = sc && typeof sc.linked_charge_count === "number" ? sc.linked_charge_count : null;
            const parts = [];
            parts.push(`Opened from visit ${visit ?? "—"}`);
            if (price) parts.push(`visit list price ${price}`);
            if (linked != null) {
                parts.push(linked === 0 ? "no receivable rows linked to this visit yet (charges may be job-level only)" : `${linked} receivable row${linked === 1 ? "" : "s"} linked to this visit (highlighted below)`);
            }
            return parts.join(" · ");
        }
    }["AdminCollectPaymentModal.useMemo[scheduleContextLine]"], [
        hasSchedule,
        collect,
        context?.scheduleLabel
    ]);
    if (!isOpen || !context) return null;
    const savedCardDescription = collect?.saved_card_label ?? (hasStripeCustomer ? "Saved card on file" : "No saved card on file");
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "fixed inset-0 z-[85] flex items-center justify-center bg-black/50",
        role: "dialog",
        "aria-modal": "true",
        "aria-labelledby": "admin-add-payment-title",
        onClick: onClose,
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "bg-white rounded-xl shadow-xl border border-alloy-stone/25 p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto",
            onClick: (e)=>e.stopPropagation(),
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                    id: "admin-add-payment-title",
                    className: "text-lg font-semibold text-alloy-midnight tracking-tight",
                    children: "Add payment"
                }, void 0, false, {
                    fileName: "[project]/components/admin/AdminCollectPaymentModal.tsx",
                    lineNumber: 459,
                    columnNumber: 9
                }, this),
                context.jobLabel ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                    className: "text-sm font-medium text-alloy-forge/90 mt-0.5",
                    children: context.jobLabel
                }, void 0, false, {
                    fileName: "[project]/components/admin/AdminCollectPaymentModal.tsx",
                    lineNumber: 463,
                    columnNumber: 11
                }, this) : null,
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                    className: "text-sm text-alloy-midnight/65 mt-2 leading-relaxed",
                    children: collect?.job.receivable_source === "charges" ? "Balances are driven by receivable charges on this job (listed below). The amount you enter is collected on the customer’s card; the server applies it to open charge balances (not a manual per-charge picker yet)." : "This job is still on legacy pricing totals until receivable charges exist. Payment posts to the job; Stripe uses the customer’s profile."
                }, void 0, false, {
                    fileName: "[project]/components/admin/AdminCollectPaymentModal.tsx",
                    lineNumber: 465,
                    columnNumber: 9
                }, this),
                scheduleContextLine ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                    className: "text-xs text-alloy-midnight/50 mt-3 leading-snug border-l-2 border-alloy-stone/40 pl-2.5",
                    children: scheduleContextLine
                }, void 0, false, {
                    fileName: "[project]/components/admin/AdminCollectPaymentModal.tsx",
                    lineNumber: 472,
                    columnNumber: 11
                }, this) : null,
                ctxLoading && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                    className: "text-sm text-alloy-midnight/60 mt-4",
                    children: "Loading payment details…"
                }, void 0, false, {
                    fileName: "[project]/components/admin/AdminCollectPaymentModal.tsx",
                    lineNumber: 477,
                    columnNumber: 24
                }, this),
                ctxError && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "text-sm text-alloy-ember mt-4 rounded-lg border border-alloy-ember/25 bg-alloy-ember/5 px-3 py-2",
                    children: ctxError
                }, void 0, false, {
                    fileName: "[project]/components/admin/AdminCollectPaymentModal.tsx",
                    lineNumber: 479,
                    columnNumber: 11
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "space-y-5 text-sm mt-4",
                    children: [
                        collect && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "rounded-lg border border-alloy-stone/35 bg-gradient-to-b from-alloy-stone/5 to-transparent px-4 py-3 space-y-2.5",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                    className: "text-[11px] font-semibold tracking-wider text-alloy-forge/75",
                                    children: "Receivables summary"
                                }, void 0, false, {
                                    fileName: "[project]/components/admin/AdminCollectPaymentModal.tsx",
                                    lineNumber: 487,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "flex justify-between gap-3 text-sm",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "text-alloy-midnight/65",
                                            children: (0, __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$JobReceivableChargesPanel$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jobTotalSummaryLabel"])(collect.job.receivable_source ?? undefined)
                                        }, void 0, false, {
                                            fileName: "[project]/components/admin/AdminCollectPaymentModal.tsx",
                                            lineNumber: 489,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "font-medium tabular-nums",
                                            children: money(collect.job.job_total_cents ?? collect.job.original_cents)
                                        }, void 0, false, {
                                            fileName: "[project]/components/admin/AdminCollectPaymentModal.tsx",
                                            lineNumber: 490,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/components/admin/AdminCollectPaymentModal.tsx",
                                    lineNumber: 488,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "flex justify-between gap-3 text-sm",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "text-alloy-midnight/65",
                                            children: "Paid (posted)"
                                        }, void 0, false, {
                                            fileName: "[project]/components/admin/AdminCollectPaymentModal.tsx",
                                            lineNumber: 493,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "font-medium tabular-nums",
                                            children: money(collect.job.paid_cents)
                                        }, void 0, false, {
                                            fileName: "[project]/components/admin/AdminCollectPaymentModal.tsx",
                                            lineNumber: 494,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/components/admin/AdminCollectPaymentModal.tsx",
                                    lineNumber: 492,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "flex justify-between gap-3 text-sm pt-0.5 border-t border-alloy-stone/25",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "text-alloy-midnight/80 font-medium",
                                            children: "Outstanding"
                                        }, void 0, false, {
                                            fileName: "[project]/components/admin/AdminCollectPaymentModal.tsx",
                                            lineNumber: 497,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "font-semibold text-alloy-midnight tabular-nums",
                                            children: money(collect.job.balance_cents)
                                        }, void 0, false, {
                                            fileName: "[project]/components/admin/AdminCollectPaymentModal.tsx",
                                            lineNumber: 498,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/components/admin/AdminCollectPaymentModal.tsx",
                                    lineNumber: 496,
                                    columnNumber: 15
                                }, this),
                                (collect.job.pending_payment_amount_cents ?? 0) > 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "flex justify-between gap-3 text-sm",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "text-alloy-midnight/65",
                                            children: "Pending (authorized)"
                                        }, void 0, false, {
                                            fileName: "[project]/components/admin/AdminCollectPaymentModal.tsx",
                                            lineNumber: 502,
                                            columnNumber: 19
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "font-medium tabular-nums text-alloy-midnight/85",
                                            children: money(collect.job.pending_payment_amount_cents)
                                        }, void 0, false, {
                                            fileName: "[project]/components/admin/AdminCollectPaymentModal.tsx",
                                            lineNumber: 503,
                                            columnNumber: 19
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/components/admin/AdminCollectPaymentModal.tsx",
                                    lineNumber: 501,
                                    columnNumber: 17
                                }, this) : null
                            ]
                        }, void 0, true, {
                            fileName: "[project]/components/admin/AdminCollectPaymentModal.tsx",
                            lineNumber: 486,
                            columnNumber: 13
                        }, this),
                        collect ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$JobReceivableChargesPanel$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["JobReceivableChargesPanel"], {
                            receivableSource: collect.job.receivable_source ?? undefined,
                            chargeRows: collect.job.charge_balance_rows,
                            openChargeCount: collect.job.open_charge_count ?? undefined,
                            contextScheduleId: hasSchedule ? context?.scheduleId?.trim() ?? null : null,
                            compact: true,
                            className: "mt-3"
                        }, void 0, false, {
                            fileName: "[project]/components/admin/AdminCollectPaymentModal.tsx",
                            lineNumber: 509,
                            columnNumber: 13
                        }, this) : null,
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "block text-[11px] font-semibold tracking-wider text-alloy-forge/75 mb-2",
                                    children: "Charge type"
                                }, void 0, false, {
                                    fileName: "[project]/components/admin/AdminCollectPaymentModal.tsx",
                                    lineNumber: 520,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "space-y-2.5",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                            className: "flex items-start gap-2.5 cursor-pointer rounded-md px-1 py-0.5 -mx-1 hover:bg-alloy-stone/10",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                    type: "radio",
                                                    name: "pay-target",
                                                    checked: target === "job",
                                                    onChange: ()=>onTargetChange("job"),
                                                    className: "mt-0.5"
                                                }, void 0, false, {
                                                    fileName: "[project]/components/admin/AdminCollectPaymentModal.tsx",
                                                    lineNumber: 525,
                                                    columnNumber: 17
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "leading-snug",
                                                    children: [
                                                        "Pay toward job balance",
                                                        collect ? ` · outstanding ${money(collect.job.balance_cents)}` : "",
                                                        collect?.job.receivable_source === "charges" ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            className: "block text-[11px] text-alloy-midnight/50 font-normal mt-0.5",
                                                            children: "Allocations are applied by the server across open charges."
                                                        }, void 0, false, {
                                                            fileName: "[project]/components/admin/AdminCollectPaymentModal.tsx",
                                                            lineNumber: 535,
                                                            columnNumber: 21
                                                        }, this) : null
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/components/admin/AdminCollectPaymentModal.tsx",
                                                    lineNumber: 532,
                                                    columnNumber: 17
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/components/admin/AdminCollectPaymentModal.tsx",
                                            lineNumber: 524,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                            className: "flex items-start gap-2.5 cursor-pointer rounded-md px-1 py-0.5 -mx-1 hover:bg-alloy-stone/10",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                    type: "radio",
                                                    name: "pay-target",
                                                    checked: target === "adhoc",
                                                    onChange: ()=>onTargetChange("adhoc"),
                                                    className: "mt-0.5"
                                                }, void 0, false, {
                                                    fileName: "[project]/components/admin/AdminCollectPaymentModal.tsx",
                                                    lineNumber: 542,
                                                    columnNumber: 17
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "leading-snug",
                                                    children: "Ad hoc amount (category required)"
                                                }, void 0, false, {
                                                    fileName: "[project]/components/admin/AdminCollectPaymentModal.tsx",
                                                    lineNumber: 549,
                                                    columnNumber: 17
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/components/admin/AdminCollectPaymentModal.tsx",
                                            lineNumber: 541,
                                            columnNumber: 15
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/components/admin/AdminCollectPaymentModal.tsx",
                                    lineNumber: 523,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/components/admin/AdminCollectPaymentModal.tsx",
                            lineNumber: 519,
                            columnNumber: 11
                        }, this),
                        target === "adhoc" && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                    className: "block text-xs font-semibold tracking-wide text-alloy-forge/90 mb-1",
                                    children: [
                                        "Charge type / reason ",
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "text-alloy-ember",
                                            children: "*"
                                        }, void 0, false, {
                                            fileName: "[project]/components/admin/AdminCollectPaymentModal.tsx",
                                            lineNumber: 557,
                                            columnNumber: 38
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/components/admin/AdminCollectPaymentModal.tsx",
                                    lineNumber: 556,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                                    value: adhocChargeType,
                                    onChange: (e)=>setAdhocChargeType(e.target.value),
                                    className: "w-full px-2 py-2 border border-alloy-stone/40 rounded text-sm",
                                    children: __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$adHocChargeTypes$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AD_HOC_CHARGE_TYPE_OPTIONS"].map((o)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                            value: o.value,
                                            children: o.label
                                        }, o.value, false, {
                                            fileName: "[project]/components/admin/AdminCollectPaymentModal.tsx",
                                            lineNumber: 565,
                                            columnNumber: 19
                                        }, this))
                                }, void 0, false, {
                                    fileName: "[project]/components/admin/AdminCollectPaymentModal.tsx",
                                    lineNumber: 559,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/components/admin/AdminCollectPaymentModal.tsx",
                            lineNumber: 555,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                    className: "block text-xs font-semibold tracking-wide text-alloy-forge/90 mb-1",
                                    children: [
                                        "Amount (USD)",
                                        target === "adhoc" && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "text-alloy-ember",
                                            children: " *"
                                        }, void 0, false, {
                                            fileName: "[project]/components/admin/AdminCollectPaymentModal.tsx",
                                            lineNumber: 576,
                                            columnNumber: 38
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/components/admin/AdminCollectPaymentModal.tsx",
                                    lineNumber: 574,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                    type: "text",
                                    inputMode: "decimal",
                                    placeholder: target === "adhoc" ? "Required" : "Balance due (or override)",
                                    value: amountDollars,
                                    onChange: (e)=>{
                                        setAmountTouched(true);
                                        setAmountDollars(e.target.value);
                                    },
                                    className: "w-full px-2 py-2 border border-alloy-stone/40 rounded text-sm"
                                }, void 0, false, {
                                    fileName: "[project]/components/admin/AdminCollectPaymentModal.tsx",
                                    lineNumber: 578,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/components/admin/AdminCollectPaymentModal.tsx",
                            lineNumber: 573,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "block text-xs font-semibold tracking-wide text-alloy-forge/90 mb-2",
                                    children: "Payment method"
                                }, void 0, false, {
                                    fileName: "[project]/components/admin/AdminCollectPaymentModal.tsx",
                                    lineNumber: 592,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "space-y-2",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                            className: "flex items-start gap-2 cursor-pointer",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                    type: "radio",
                                                    name: "card-mode",
                                                    checked: cardMode === "on_file",
                                                    onChange: ()=>setCardMode("on_file"),
                                                    className: "mt-1",
                                                    disabled: !hasStripeCustomer
                                                }, void 0, false, {
                                                    fileName: "[project]/components/admin/AdminCollectPaymentModal.tsx",
                                                    lineNumber: 597,
                                                    columnNumber: 17
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    children: [
                                                        "Use saved card",
                                                        collect?.saved_card_label ? ` — ${collect.saved_card_label}` : ` — ${savedCardDescription}`,
                                                        !hasStripeCustomer && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            className: "block text-xs text-alloy-ember mt-0.5",
                                                            children: "Customer needs a Stripe customer id to charge."
                                                        }, void 0, false, {
                                                            fileName: "[project]/components/admin/AdminCollectPaymentModal.tsx",
                                                            lineNumber: 608,
                                                            columnNumber: 21
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/components/admin/AdminCollectPaymentModal.tsx",
                                                    lineNumber: 605,
                                                    columnNumber: 17
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/components/admin/AdminCollectPaymentModal.tsx",
                                            lineNumber: 596,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                            className: `flex flex-col gap-1 ${disabled ? "opacity-50" : ""}`,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "flex items-start gap-2 cursor-pointer",
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                            type: "radio",
                                                            name: "card-mode",
                                                            checked: cardMode === "new_card",
                                                            onChange: ()=>setCardMode("new_card"),
                                                            disabled: disabled || !hasStripeCustomer,
                                                            className: "mt-1"
                                                        }, void 0, false, {
                                                            fileName: "[project]/components/admin/AdminCollectPaymentModal.tsx",
                                                            lineNumber: 614,
                                                            columnNumber: 19
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            children: [
                                                                "Enter new card",
                                                                !__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$polyfills$2f$process$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].env.NEXT_PUBLIC_STRIPE_PUBLISHABLE?.trim() && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                    className: "block text-xs text-alloy-ember mt-0.5",
                                                                    children: "NEXT_PUBLIC_STRIPE_PUBLISHABLE is not set."
                                                                }, void 0, false, {
                                                                    fileName: "[project]/components/admin/AdminCollectPaymentModal.tsx",
                                                                    lineNumber: 625,
                                                                    columnNumber: 23
                                                                }, this)
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/components/admin/AdminCollectPaymentModal.tsx",
                                                            lineNumber: 622,
                                                            columnNumber: 19
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/components/admin/AdminCollectPaymentModal.tsx",
                                                    lineNumber: 613,
                                                    columnNumber: 17
                                                }, this),
                                                cardMode === "new_card" && hasStripeCustomer && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            ref: cardMountRef,
                                                            className: "w-full min-h-[44px] px-2 py-2 border border-alloy-stone/40 rounded bg-white"
                                                        }, void 0, false, {
                                                            fileName: "[project]/components/admin/AdminCollectPaymentModal.tsx",
                                                            lineNumber: 631,
                                                            columnNumber: 21
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                            className: "flex items-center gap-2 text-xs cursor-pointer",
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                                    type: "checkbox",
                                                                    checked: savePaymentMethod,
                                                                    onChange: (e)=>setSavePaymentMethod(e.target.checked)
                                                                }, void 0, false, {
                                                                    fileName: "[project]/components/admin/AdminCollectPaymentModal.tsx",
                                                                    lineNumber: 633,
                                                                    columnNumber: 23
                                                                }, this),
                                                                "Save as customer default card after successful charge"
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/components/admin/AdminCollectPaymentModal.tsx",
                                                            lineNumber: 632,
                                                            columnNumber: 21
                                                        }, this)
                                                    ]
                                                }, void 0, true)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/components/admin/AdminCollectPaymentModal.tsx",
                                            lineNumber: 612,
                                            columnNumber: 15
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/components/admin/AdminCollectPaymentModal.tsx",
                                    lineNumber: 595,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/components/admin/AdminCollectPaymentModal.tsx",
                            lineNumber: 591,
                            columnNumber: 11
                        }, this),
                        feedback && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: `rounded-md px-3 py-2 text-sm ${feedback.type === "success" ? "bg-alloy-juniper/15 text-alloy-midnight" : "bg-alloy-ember/10 text-alloy-ember"}`,
                            role: "status",
                            children: feedback.message
                        }, void 0, false, {
                            fileName: "[project]/components/admin/AdminCollectPaymentModal.tsx",
                            lineNumber: 647,
                            columnNumber: 13
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/components/admin/AdminCollectPaymentModal.tsx",
                    lineNumber: 484,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "flex justify-end gap-2 mt-6 pt-2 border-t border-alloy-stone/20",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                            type: "button",
                            onClick: onClose,
                            disabled: submitting,
                            className: "px-4 py-2 text-sm border border-alloy-stone/45 rounded-lg hover:bg-alloy-stone/15 disabled:opacity-50",
                            children: "Close"
                        }, void 0, false, {
                            fileName: "[project]/components/admin/AdminCollectPaymentModal.tsx",
                            lineNumber: 659,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                            type: "button",
                            onClick: ()=>void runPayment(),
                            disabled: !canSubmit,
                            className: "px-4 py-2 text-sm font-medium bg-alloy-blue text-white rounded-lg hover:opacity-90 disabled:opacity-50 shadow-sm",
                            children: submitting ? "Processing…" : target === "adhoc" ? "Charge ad hoc" : "Charge customer"
                        }, void 0, false, {
                            fileName: "[project]/components/admin/AdminCollectPaymentModal.tsx",
                            lineNumber: 667,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/components/admin/AdminCollectPaymentModal.tsx",
                    lineNumber: 658,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/components/admin/AdminCollectPaymentModal.tsx",
            lineNumber: 455,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/components/admin/AdminCollectPaymentModal.tsx",
        lineNumber: 448,
        columnNumber: 5
    }, this);
}
_s(AdminCollectPaymentModal, "uCwxxKvawCqPhLpIZvoMgp8IKzc=");
_c = AdminCollectPaymentModal;
var _c;
__turbopack_context__.k.register(_c, "AdminCollectPaymentModal");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/components/admin/JobManualChargeForm.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "JobManualChargeForm",
    ()=>JobManualChargeForm
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
function JobManualChargeForm({ jobId, disabled, onCreated }) {
    _s();
    const [amountDollars, setAmountDollars] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [chargeType, setChargeType] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("adjustment");
    const [description, setDescription] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [serviceDate, setServiceDate] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [dueDate, setDueDate] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [saving, setSaving] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [error, setError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [success, setSuccess] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const submit = async ()=>{
        setError(null);
        setSuccess(null);
        const t = amountDollars.trim();
        if (!t) {
            setError("Enter an amount.");
            return;
        }
        const n = Number.parseFloat(t);
        if (!Number.isFinite(n) || n === 0) {
            setError("Amount must be a non-zero number (negative allowed for credits).");
            return;
        }
        const amountCents = Math.round(n * 100);
        if (amountCents === 0) {
            setError("Amount rounds to zero.");
            return;
        }
        setSaving(true);
        try {
            const res = await fetch(`/api/admin/jobs/${jobId}/charges`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    charge_type: chargeType,
                    amount_cents: amountCents,
                    description: description.trim() || null,
                    service_date: serviceDate.trim() || null,
                    due_date: dueDate.trim() || null
                })
            });
            const json = await res.json().catch(()=>({}));
            if (!res.ok) {
                setError(json.error ?? `Failed (${res.status})`);
                return;
            }
            setSuccess("Charge added.");
            setAmountDollars("");
            setDescription("");
            setServiceDate("");
            setDueDate("");
            window.dispatchEvent(new CustomEvent("admin-entity-saved", {
                detail: {
                    type: "jobs",
                    id: jobId
                }
            }));
            window.dispatchEvent(new CustomEvent("admin-entity-saved", {
                detail: {
                    type: "payments",
                    id: "*"
                }
            }));
            onCreated();
        } catch (e) {
            setError(e.message);
        } finally{
            setSaving(false);
        }
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "rounded-md border border-alloy-stone/30 bg-white px-3 py-3 space-y-3 mb-4",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h4", {
                        className: "text-sm font-semibold text-alloy-midnight",
                        children: "Add manual charge"
                    }, void 0, false, {
                        fileName: "[project]/components/admin/JobManualChargeForm.tsx",
                        lineNumber: 75,
                        columnNumber: 17
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "text-[11px] text-alloy-midnight/55 mt-1 leading-snug max-w-xl",
                        children: "Creates a posted receivable row on this job (adjustment or fee). Negative amounts are allowed for credit-style adjustments. Does not run Stripe — use Add payment to collect."
                    }, void 0, false, {
                        fileName: "[project]/components/admin/JobManualChargeForm.tsx",
                        lineNumber: 76,
                        columnNumber: 17
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/admin/JobManualChargeForm.tsx",
                lineNumber: 74,
                columnNumber: 13
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                className: "block text-xs font-medium text-alloy-midnight/60 mb-0.5",
                                children: "Amount (USD)"
                            }, void 0, false, {
                                fileName: "[project]/components/admin/JobManualChargeForm.tsx",
                                lineNumber: 83,
                                columnNumber: 21
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                type: "text",
                                inputMode: "decimal",
                                placeholder: "e.g. 25.00 or -10.00",
                                value: amountDollars,
                                onChange: (e)=>setAmountDollars(e.target.value),
                                disabled: disabled || saving,
                                className: "w-full px-2 py-1.5 border border-alloy-stone/40 rounded text-sm"
                            }, void 0, false, {
                                fileName: "[project]/components/admin/JobManualChargeForm.tsx",
                                lineNumber: 84,
                                columnNumber: 21
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/admin/JobManualChargeForm.tsx",
                        lineNumber: 82,
                        columnNumber: 17
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                className: "block text-xs font-medium text-alloy-midnight/60 mb-0.5",
                                children: "Type"
                            }, void 0, false, {
                                fileName: "[project]/components/admin/JobManualChargeForm.tsx",
                                lineNumber: 95,
                                columnNumber: 21
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                                value: chargeType,
                                onChange: (e)=>setChargeType(e.target.value),
                                disabled: disabled || saving,
                                className: "w-full px-2 py-1.5 border border-alloy-stone/40 rounded text-sm",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                        value: "adjustment",
                                        children: "Adjustment (pricing / credit)"
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/JobManualChargeForm.tsx",
                                        lineNumber: 102,
                                        columnNumber: 25
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                        value: "fee",
                                        children: "Fee (add-on)"
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/JobManualChargeForm.tsx",
                                        lineNumber: 103,
                                        columnNumber: 25
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/admin/JobManualChargeForm.tsx",
                                lineNumber: 96,
                                columnNumber: 21
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/admin/JobManualChargeForm.tsx",
                        lineNumber: 94,
                        columnNumber: 17
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "sm:col-span-2",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                className: "block text-xs font-medium text-alloy-midnight/60 mb-0.5",
                                children: "Description (optional)"
                            }, void 0, false, {
                                fileName: "[project]/components/admin/JobManualChargeForm.tsx",
                                lineNumber: 107,
                                columnNumber: 21
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                type: "text",
                                value: description,
                                onChange: (e)=>setDescription(e.target.value),
                                disabled: disabled || saving,
                                className: "w-full px-2 py-1.5 border border-alloy-stone/40 rounded text-sm",
                                placeholder: "e.g. Extra materials, price correction"
                            }, void 0, false, {
                                fileName: "[project]/components/admin/JobManualChargeForm.tsx",
                                lineNumber: 108,
                                columnNumber: 21
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/admin/JobManualChargeForm.tsx",
                        lineNumber: 106,
                        columnNumber: 17
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                className: "block text-xs font-medium text-alloy-midnight/60 mb-0.5",
                                children: "Service date (optional)"
                            }, void 0, false, {
                                fileName: "[project]/components/admin/JobManualChargeForm.tsx",
                                lineNumber: 118,
                                columnNumber: 21
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                type: "date",
                                value: serviceDate,
                                onChange: (e)=>setServiceDate(e.target.value),
                                disabled: disabled || saving,
                                className: "w-full px-2 py-1.5 border border-alloy-stone/40 rounded text-sm"
                            }, void 0, false, {
                                fileName: "[project]/components/admin/JobManualChargeForm.tsx",
                                lineNumber: 119,
                                columnNumber: 21
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/admin/JobManualChargeForm.tsx",
                        lineNumber: 117,
                        columnNumber: 17
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                className: "block text-xs font-medium text-alloy-midnight/60 mb-0.5",
                                children: "Due date (optional)"
                            }, void 0, false, {
                                fileName: "[project]/components/admin/JobManualChargeForm.tsx",
                                lineNumber: 128,
                                columnNumber: 21
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                type: "date",
                                value: dueDate,
                                onChange: (e)=>setDueDate(e.target.value),
                                disabled: disabled || saving,
                                className: "w-full px-2 py-1.5 border border-alloy-stone/40 rounded text-sm"
                            }, void 0, false, {
                                fileName: "[project]/components/admin/JobManualChargeForm.tsx",
                                lineNumber: 129,
                                columnNumber: 21
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/admin/JobManualChargeForm.tsx",
                        lineNumber: 127,
                        columnNumber: 17
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/admin/JobManualChargeForm.tsx",
                lineNumber: 81,
                columnNumber: 13
            }, this),
            error ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "text-sm text-alloy-ember",
                children: error
            }, void 0, false, {
                fileName: "[project]/components/admin/JobManualChargeForm.tsx",
                lineNumber: 138,
                columnNumber: 22
            }, this) : null,
            success ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "text-sm text-alloy-juniper",
                children: success
            }, void 0, false, {
                fileName: "[project]/components/admin/JobManualChargeForm.tsx",
                lineNumber: 139,
                columnNumber: 24
            }, this) : null,
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                type: "button",
                onClick: ()=>void submit(),
                disabled: disabled || saving,
                className: "px-3 py-1.5 text-sm font-medium bg-alloy-midnight text-white rounded-md hover:opacity-90 disabled:opacity-50",
                children: saving ? "Saving…" : "Create charge"
            }, void 0, false, {
                fileName: "[project]/components/admin/JobManualChargeForm.tsx",
                lineNumber: 140,
                columnNumber: 13
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/components/admin/JobManualChargeForm.tsx",
        lineNumber: 73,
        columnNumber: 9
    }, this);
}
_s(JobManualChargeForm, "8OmkIB/rLwQzh3odesZ3PdlRIAg=");
_c = JobManualChargeForm;
var _c;
__turbopack_context__.k.register(_c, "JobManualChargeForm");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/components/admin/quoteIntake/OpportunityQuoteIntakeSection.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>OpportunityQuoteIntakeSection
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$quoteIntake$2f$workflows$2f$opportunityCleaningQuoteV1$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/quoteIntake/workflows/opportunityCleaningQuoteV1.ts [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
function initialValuesFromFields(fields) {
    const out = {};
    for (const f of fields){
        if (f.input === "multiselect") {
            out[f.quote_input_key] = [];
        } else {
            out[f.quote_input_key] = "";
        }
    }
    return out;
}
function OpportunityQuoteIntakeSection({ opportunityId, canMutate, onSaved, onClose }) {
    _s();
    const [loading, setLoading] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(true);
    const [loadError, setLoadError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [catalog, setCatalog] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [values, setValues] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])({});
    const [saving, setSaving] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [saveError, setSaveError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "OpportunityQuoteIntakeSection.useEffect": ()=>{
            let cancelled = false;
            setLoading(true);
            setLoadError(null);
            fetch(`/api/admin/quote-intake/catalog?workflow_key=${encodeURIComponent(__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$quoteIntake$2f$workflows$2f$opportunityCleaningQuoteV1$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["OPPORTUNITY_CLEANING_QUOTE_INTAKE_V1"].workflow_key)}`).then({
                "OpportunityQuoteIntakeSection.useEffect": (r)=>r.json()
            }["OpportunityQuoteIntakeSection.useEffect"]).then({
                "OpportunityQuoteIntakeSection.useEffect": (j)=>{
                    if (cancelled) return;
                    if (!j?.ok || !j.fields?.length) {
                        throw new Error(j.error ?? "Failed to load quote intake catalog");
                    }
                    setCatalog(j);
                    setValues(initialValuesFromFields(j.fields));
                }
            }["OpportunityQuoteIntakeSection.useEffect"]).catch({
                "OpportunityQuoteIntakeSection.useEffect": (e)=>{
                    if (!cancelled) setLoadError(e instanceof Error ? e.message : "Load failed");
                }
            }["OpportunityQuoteIntakeSection.useEffect"]).finally({
                "OpportunityQuoteIntakeSection.useEffect": ()=>{
                    if (!cancelled) setLoading(false);
                }
            }["OpportunityQuoteIntakeSection.useEffect"]);
            return ({
                "OpportunityQuoteIntakeSection.useEffect": ()=>{
                    cancelled = true;
                }
            })["OpportunityQuoteIntakeSection.useEffect"];
        }
    }["OpportunityQuoteIntakeSection.useEffect"], []);
    const fieldsSorted = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "OpportunityQuoteIntakeSection.useMemo[fieldsSorted]": ()=>catalog?.fields ? [
                ...catalog.fields
            ].sort({
                "OpportunityQuoteIntakeSection.useMemo[fieldsSorted]": (a, b)=>a.sort_order - b.sort_order
            }["OpportunityQuoteIntakeSection.useMemo[fieldsSorted]"]) : []
    }["OpportunityQuoteIntakeSection.useMemo[fieldsSorted]"], [
        catalog?.fields
    ]);
    const setField = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "OpportunityQuoteIntakeSection.useCallback[setField]": (key, input, v, checked)=>{
            setValues({
                "OpportunityQuoteIntakeSection.useCallback[setField]": (prev)=>{
                    if (input === "multiselect") {
                        const cur = Array.isArray(prev[key]) ? [
                            ...prev[key]
                        ] : [];
                        if (checked) {
                            if (!cur.includes(v)) cur.push(v);
                        } else {
                            const i = cur.indexOf(v);
                            if (i >= 0) cur.splice(i, 1);
                        }
                        return {
                            ...prev,
                            [key]: cur
                        };
                    }
                    return {
                        ...prev,
                        [key]: v
                    };
                }
            }["OpportunityQuoteIntakeSection.useCallback[setField]"]);
        }
    }["OpportunityQuoteIntakeSection.useCallback[setField]"], []);
    const onSubmit = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "OpportunityQuoteIntakeSection.useCallback[onSubmit]": async ()=>{
            if (!catalog) return;
            setSaving(true);
            setSaveError(null);
            try {
                const quote_inputs = {};
                for (const f of fieldsSorted){
                    const raw = values[f.quote_input_key];
                    if (f.input === "multiselect") {
                        quote_inputs[f.quote_input_key] = Array.isArray(raw) ? raw : [];
                    } else {
                        const s = typeof raw === "string" ? raw.trim() : "";
                        if (f.required && !s) {
                            throw new Error(`${f.label} is required`);
                        }
                        quote_inputs[f.quote_input_key] = s || null;
                    }
                }
                const sqft = quote_inputs.square_footage;
                if (sqft == null || typeof sqft === "string" && !sqft.trim()) {
                    throw new Error("Square footage is required");
                }
                const res = await fetch(`/api/admin/opportunities/${opportunityId}`, {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        status_key: "needs_a_quote",
                        quote_inputs
                    })
                });
                const json = await res.json().catch({
                    "OpportunityQuoteIntakeSection.useCallback[onSubmit]": ()=>({})
                }["OpportunityQuoteIntakeSection.useCallback[onSubmit]"]);
                if (!res.ok) throw new Error(json.error ?? "Quote save failed");
                onSaved(json);
            } catch (e) {
                setSaveError(e instanceof Error ? e.message : "Quote save failed");
            } finally{
                setSaving(false);
            }
        }
    }["OpportunityQuoteIntakeSection.useCallback[onSubmit]"], [
        catalog,
        fieldsSorted,
        onSaved,
        opportunityId,
        values
    ]);
    if (loading) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
            className: "rounded-lg border border-admin-border bg-white/80 p-3 text-sm text-alloy-midnight/70",
            children: "Loading quote intake…"
        }, void 0, false, {
            fileName: "[project]/components/admin/quoteIntake/OpportunityQuoteIntakeSection.tsx",
            lineNumber: 124,
            columnNumber: 13
        }, this);
    }
    if (loadError || !catalog) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
            className: "rounded-lg border border-amber-200 bg-amber-50/90 p-3 text-sm text-amber-950",
            children: loadError ?? "Could not load catalog"
        }, void 0, false, {
            fileName: "[project]/components/admin/quoteIntake/OpportunityQuoteIntakeSection.tsx",
            lineNumber: 132,
            columnNumber: 13
        }, this);
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
        className: "rounded-lg border border-admin-border bg-white/80 p-3",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-start justify-between gap-3",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                className: "text-sm font-medium text-alloy-midnight/90",
                                children: catalog.workflow.label
                            }, void 0, false, {
                                fileName: "[project]/components/admin/quoteIntake/OpportunityQuoteIntakeSection.tsx",
                                lineNumber: 142,
                                columnNumber: 21
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: "mt-0.5 text-xs text-alloy-midnight/60",
                                children: [
                                    "Config-driven fields · saves to ",
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("code", {
                                        className: "text-[11px]",
                                        children: "metadata.quote_inputs"
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/quoteIntake/OpportunityQuoteIntakeSection.tsx",
                                        lineNumber: 144,
                                        columnNumber: 57
                                    }, this),
                                    " and runs pricing."
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/admin/quoteIntake/OpportunityQuoteIntakeSection.tsx",
                                lineNumber: 143,
                                columnNumber: 21
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/admin/quoteIntake/OpportunityQuoteIntakeSection.tsx",
                        lineNumber: 141,
                        columnNumber: 17
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        type: "button",
                        onClick: onClose,
                        className: "text-xs px-2 py-1 rounded border border-alloy-stone/50 hover:bg-alloy-stone/20",
                        children: "Close"
                    }, void 0, false, {
                        fileName: "[project]/components/admin/quoteIntake/OpportunityQuoteIntakeSection.tsx",
                        lineNumber: 147,
                        columnNumber: 17
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/admin/quoteIntake/OpportunityQuoteIntakeSection.tsx",
                lineNumber: 140,
                columnNumber: 13
            }, this),
            saveError ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "mt-2 text-xs text-alloy-ember",
                children: saveError
            }, void 0, false, {
                fileName: "[project]/components/admin/quoteIntake/OpportunityQuoteIntakeSection.tsx",
                lineNumber: 156,
                columnNumber: 26
            }, this) : null,
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2",
                children: fieldsSorted.map((f)=>{
                    const colClass = f.full_width ? "sm:col-span-2" : "";
                    if (f.input === "select") {
                        const v = typeof values[f.quote_input_key] === "string" ? values[f.quote_input_key] : "";
                        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: colClass,
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                    className: "block text-xs text-alloy-midnight/70 mb-0.5",
                                    children: [
                                        f.label,
                                        f.required ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "text-alloy-ember",
                                            children: " *"
                                        }, void 0, false, {
                                            fileName: "[project]/components/admin/quoteIntake/OpportunityQuoteIntakeSection.tsx",
                                            lineNumber: 167,
                                            columnNumber: 51
                                        }, this) : null
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/components/admin/quoteIntake/OpportunityQuoteIntakeSection.tsx",
                                    lineNumber: 165,
                                    columnNumber: 33
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                                    value: v,
                                    onChange: (e)=>setField(f.quote_input_key, "select", e.target.value),
                                    disabled: !canMutate,
                                    className: "w-full rounded border border-alloy-stone/50 px-2 py-1.5 text-sm bg-white disabled:opacity-50",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                            value: "",
                                            children: f.required ? `Select…` : "—"
                                        }, void 0, false, {
                                            fileName: "[project]/components/admin/quoteIntake/OpportunityQuoteIntakeSection.tsx",
                                            lineNumber: 175,
                                            columnNumber: 37
                                        }, this),
                                        f.options.map((o)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                value: o.value,
                                                children: o.label
                                            }, o.value, false, {
                                                fileName: "[project]/components/admin/quoteIntake/OpportunityQuoteIntakeSection.tsx",
                                                lineNumber: 177,
                                                columnNumber: 41
                                            }, this))
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/components/admin/quoteIntake/OpportunityQuoteIntakeSection.tsx",
                                    lineNumber: 169,
                                    columnNumber: 33
                                }, this)
                            ]
                        }, f.id, true, {
                            fileName: "[project]/components/admin/quoteIntake/OpportunityQuoteIntakeSection.tsx",
                            lineNumber: 164,
                            columnNumber: 29
                        }, this);
                    }
                    const selected = Array.isArray(values[f.quote_input_key]) ? values[f.quote_input_key] : [];
                    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: colClass,
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "block text-xs text-alloy-midnight/70 mb-1",
                                children: [
                                    f.label,
                                    f.required ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "text-alloy-ember",
                                        children: " *"
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/quoteIntake/OpportunityQuoteIntakeSection.tsx",
                                        lineNumber: 190,
                                        columnNumber: 47
                                    }, this) : null
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/admin/quoteIntake/OpportunityQuoteIntakeSection.tsx",
                                lineNumber: 188,
                                columnNumber: 29
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex flex-wrap gap-2",
                                children: f.options.length === 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "text-xs text-alloy-midnight/55",
                                    children: "No add-ons configured for this org."
                                }, void 0, false, {
                                    fileName: "[project]/components/admin/quoteIntake/OpportunityQuoteIntakeSection.tsx",
                                    lineNumber: 194,
                                    columnNumber: 37
                                }, this) : f.options.map((o)=>{
                                    const checked = selected.includes(o.value);
                                    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                        className: "inline-flex items-center gap-1.5 text-xs rounded border border-alloy-stone/40 px-2 py-1 cursor-pointer hover:bg-alloy-stone/15",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                type: "checkbox",
                                                checked: checked,
                                                disabled: !canMutate,
                                                onChange: (e)=>setField(f.quote_input_key, "multiselect", o.value, e.target.checked)
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/quoteIntake/OpportunityQuoteIntakeSection.tsx",
                                                lineNumber: 203,
                                                columnNumber: 49
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                children: o.label
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/quoteIntake/OpportunityQuoteIntakeSection.tsx",
                                                lineNumber: 209,
                                                columnNumber: 49
                                            }, this)
                                        ]
                                    }, o.value, true, {
                                        fileName: "[project]/components/admin/quoteIntake/OpportunityQuoteIntakeSection.tsx",
                                        lineNumber: 199,
                                        columnNumber: 45
                                    }, this);
                                })
                            }, void 0, false, {
                                fileName: "[project]/components/admin/quoteIntake/OpportunityQuoteIntakeSection.tsx",
                                lineNumber: 192,
                                columnNumber: 29
                            }, this)
                        ]
                    }, f.id, true, {
                        fileName: "[project]/components/admin/quoteIntake/OpportunityQuoteIntakeSection.tsx",
                        lineNumber: 187,
                        columnNumber: 25
                    }, this);
                })
            }, void 0, false, {
                fileName: "[project]/components/admin/quoteIntake/OpportunityQuoteIntakeSection.tsx",
                lineNumber: 158,
                columnNumber: 13
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "mt-3 flex flex-wrap items-center gap-2",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        type: "button",
                        disabled: saving || !canMutate,
                        onClick: ()=>void onSubmit(),
                        className: "px-3 py-1.5 text-sm bg-alloy-blue text-white rounded-md hover:opacity-90 disabled:opacity-50",
                        children: saving ? "Saving…" : "Save + compute quote"
                    }, void 0, false, {
                        fileName: "[project]/components/admin/quoteIntake/OpportunityQuoteIntakeSection.tsx",
                        lineNumber: 221,
                        columnNumber: 17
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        type: "button",
                        disabled: saving,
                        onClick: onClose,
                        className: "px-3 py-1.5 text-sm border border-alloy-stone/60 rounded-md hover:bg-alloy-stone/30",
                        children: "Cancel"
                    }, void 0, false, {
                        fileName: "[project]/components/admin/quoteIntake/OpportunityQuoteIntakeSection.tsx",
                        lineNumber: 229,
                        columnNumber: 17
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/admin/quoteIntake/OpportunityQuoteIntakeSection.tsx",
                lineNumber: 220,
                columnNumber: 13
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/components/admin/quoteIntake/OpportunityQuoteIntakeSection.tsx",
        lineNumber: 139,
        columnNumber: 9
    }, this);
}
_s(OpportunityQuoteIntakeSection, "reH88ajYiY3O4bzPkO5DHKfLk0Q=");
_c = OpportunityQuoteIntakeSection;
var _c;
__turbopack_context__.k.register(_c, "OpportunityQuoteIntakeSection");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
]);

//# sourceMappingURL=components_admin_08986852._.js.map