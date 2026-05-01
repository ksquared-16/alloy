(globalThis.TURBOPACK || (globalThis.TURBOPACK = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/components/admin/opportunity/actions/ScheduleTourActionFormModal.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ScheduleTourActionFormModal",
    ()=>ScheduleTourActionFormModal
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
;
function ScheduleTourActionFormModal(props) {
    _s();
    const { open, onClose, onSubmit, title = "Schedule tour", subtitle = "Enter the tour date and time to start the follow-up workflow.", submitLabel = "Schedule tour", initialTourDate = null, initialTourTime = null } = props;
    const [tourDate, setTourDate] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(initialTourDate ?? "");
    const [tourTime, setTourTime] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(initialTourTime ?? "");
    const [submitting, setSubmitting] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [error, setError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const canSubmit = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "ScheduleTourActionFormModal.useMemo[canSubmit]": ()=>Boolean(tourDate && tourTime && !submitting)
    }["ScheduleTourActionFormModal.useMemo[canSubmit]"], [
        tourDate,
        tourTime,
        submitting
    ]);
    // When reopening, re-hydrate from initial values (supports reschedule prefill).
    __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].useEffect({
        "ScheduleTourActionFormModal.useEffect": ()=>{
            if (!open) return;
            setTourDate(initialTourDate ?? "");
            setTourTime(initialTourTime ?? "");
            setError(null);
            setSubmitting(false);
        }
    }["ScheduleTourActionFormModal.useEffect"], [
        open,
        initialTourDate,
        initialTourTime
    ]);
    if (!open) return null;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "fixed inset-0 z-[999] flex items-center justify-center bg-black/30 p-4",
        onClick: onClose,
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "w-full max-w-md overflow-hidden rounded-2xl border border-alloy-stone/25 bg-white shadow-2xl",
            onClick: (e)=>e.stopPropagation(),
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "border-b border-alloy-stone/15 px-5 py-4",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "text-base font-semibold text-alloy-midnight",
                            children: title
                        }, void 0, false, {
                            fileName: "[project]/components/admin/opportunity/actions/ScheduleTourActionFormModal.tsx",
                            lineNumber: 50,
                            columnNumber: 21
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "mt-0.5 text-sm text-alloy-midnight/65",
                            children: subtitle
                        }, void 0, false, {
                            fileName: "[project]/components/admin/opportunity/actions/ScheduleTourActionFormModal.tsx",
                            lineNumber: 51,
                            columnNumber: 21
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/components/admin/opportunity/actions/ScheduleTourActionFormModal.tsx",
                    lineNumber: 49,
                    columnNumber: 17
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "space-y-4 px-5 py-4",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "grid grid-cols-1 gap-3",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                    className: "text-sm",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "mb-1 font-medium text-alloy-midnight",
                                            children: "Tour date"
                                        }, void 0, false, {
                                            fileName: "[project]/components/admin/opportunity/actions/ScheduleTourActionFormModal.tsx",
                                            lineNumber: 57,
                                            columnNumber: 29
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                            type: "date",
                                            value: tourDate,
                                            onChange: (e)=>setTourDate(e.target.value),
                                            className: "w-full rounded-lg border border-alloy-stone/25 bg-white px-3 py-2 text-sm text-alloy-midnight shadow-sm outline-none focus:border-alloy-midnight/30",
                                            required: true
                                        }, void 0, false, {
                                            fileName: "[project]/components/admin/opportunity/actions/ScheduleTourActionFormModal.tsx",
                                            lineNumber: 58,
                                            columnNumber: 29
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/components/admin/opportunity/actions/ScheduleTourActionFormModal.tsx",
                                    lineNumber: 56,
                                    columnNumber: 25
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                    className: "text-sm",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "mb-1 font-medium text-alloy-midnight",
                                            children: "Tour time"
                                        }, void 0, false, {
                                            fileName: "[project]/components/admin/opportunity/actions/ScheduleTourActionFormModal.tsx",
                                            lineNumber: 67,
                                            columnNumber: 29
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                            type: "time",
                                            value: tourTime,
                                            onChange: (e)=>setTourTime(e.target.value),
                                            className: "w-full rounded-lg border border-alloy-stone/25 bg-white px-3 py-2 text-sm text-alloy-midnight shadow-sm outline-none focus:border-alloy-midnight/30",
                                            required: true
                                        }, void 0, false, {
                                            fileName: "[project]/components/admin/opportunity/actions/ScheduleTourActionFormModal.tsx",
                                            lineNumber: 68,
                                            columnNumber: 29
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/components/admin/opportunity/actions/ScheduleTourActionFormModal.tsx",
                                    lineNumber: 66,
                                    columnNumber: 25
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/components/admin/opportunity/actions/ScheduleTourActionFormModal.tsx",
                            lineNumber: 55,
                            columnNumber: 21
                        }, this),
                        error && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800",
                            children: error
                        }, void 0, false, {
                            fileName: "[project]/components/admin/opportunity/actions/ScheduleTourActionFormModal.tsx",
                            lineNumber: 78,
                            columnNumber: 31
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "flex items-center justify-end gap-2 pt-1",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    className: "rounded-lg border border-alloy-stone/25 bg-white px-3 py-2 text-sm text-alloy-midnight shadow-sm hover:bg-alloy-stone/5",
                                    onClick: onClose,
                                    disabled: submitting,
                                    children: "Cancel"
                                }, void 0, false, {
                                    fileName: "[project]/components/admin/opportunity/actions/ScheduleTourActionFormModal.tsx",
                                    lineNumber: 81,
                                    columnNumber: 25
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    className: "rounded-lg bg-alloy-midnight px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-alloy-midnight/90 disabled:opacity-60",
                                    disabled: !canSubmit,
                                    onClick: async ()=>{
                                        setError(null);
                                        setSubmitting(true);
                                        try {
                                            await onSubmit({
                                                tour_date: tourDate,
                                                tour_time: tourTime
                                            });
                                            onClose();
                                        } catch (e) {
                                            const msg = e instanceof Error ? e.message : String(e);
                                            setError(msg || "Failed to schedule tour");
                                        } finally{
                                            setSubmitting(false);
                                        }
                                    },
                                    children: submitting ? "Saving…" : submitLabel
                                }, void 0, false, {
                                    fileName: "[project]/components/admin/opportunity/actions/ScheduleTourActionFormModal.tsx",
                                    lineNumber: 89,
                                    columnNumber: 25
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/components/admin/opportunity/actions/ScheduleTourActionFormModal.tsx",
                            lineNumber: 80,
                            columnNumber: 21
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/components/admin/opportunity/actions/ScheduleTourActionFormModal.tsx",
                    lineNumber: 54,
                    columnNumber: 17
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/components/admin/opportunity/actions/ScheduleTourActionFormModal.tsx",
            lineNumber: 45,
            columnNumber: 13
        }, this)
    }, void 0, false, {
        fileName: "[project]/components/admin/opportunity/actions/ScheduleTourActionFormModal.tsx",
        lineNumber: 44,
        columnNumber: 9
    }, this);
}
_s(ScheduleTourActionFormModal, "cDbSIv1m3NnIr7ugcWEYHrOQG0A=");
_c = ScheduleTourActionFormModal;
var _c;
__turbopack_context__.k.register(_c, "ScheduleTourActionFormModal");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/components/admin/opportunity/actions/ContactAttemptedModal.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ContactAttemptedModal",
    ()=>ContactAttemptedModal
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
function ContactAttemptedModal(props) {
    _s();
    const { open, title = "Log contact attempt", onClose, onSubmit } = props;
    const [note, setNote] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [method, setMethod] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [busy, setBusy] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [error, setError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "ContactAttemptedModal.useEffect": ()=>{
            if (!open) return;
            setNote("");
            setMethod("");
            setError(null);
            setBusy(false);
        }
    }["ContactAttemptedModal.useEffect"], [
        open
    ]);
    const canSubmit = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "ContactAttemptedModal.useMemo[canSubmit]": ()=>!busy
    }["ContactAttemptedModal.useMemo[canSubmit]"], [
        busy
    ]);
    const overlay = "fixed inset-0 z-[80] bg-black/20 backdrop-blur-[1px]";
    const panel = "fixed left-1/2 top-1/2 z-[81] w-[92vw] max-w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-admin-border bg-white shadow-xl";
    const label = "text-[11px] font-semibold uppercase tracking-wide text-alloy-forge/50";
    const input = "w-full rounded-lg border border-alloy-stone/20 bg-white px-3 py-2 text-sm text-alloy-midnight focus:border-alloy-blue/45 focus:outline-none focus:ring-2 focus:ring-alloy-blue/15 disabled:opacity-60";
    if (!open) return null;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: overlay,
                onClick: ()=>!busy ? onClose() : null
            }, void 0, false, {
                fileName: "[project]/components/admin/opportunity/actions/ContactAttemptedModal.tsx",
                lineNumber: 38,
                columnNumber: 13
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: panel,
                role: "dialog",
                "aria-modal": "true",
                "aria-label": title,
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-start justify-between gap-3 px-5 py-4 border-b border-alloy-stone/15",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "min-w-0",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "text-sm font-semibold text-alloy-midnight",
                                        children: title
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/opportunity/actions/ContactAttemptedModal.tsx",
                                        lineNumber: 42,
                                        columnNumber: 25
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "mt-0.5 text-[12px] text-alloy-midnight/60",
                                        children: "Record that you attempted to contact this family."
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/opportunity/actions/ContactAttemptedModal.tsx",
                                        lineNumber: 43,
                                        columnNumber: 25
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/admin/opportunity/actions/ContactAttemptedModal.tsx",
                                lineNumber: 41,
                                columnNumber: 21
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                type: "button",
                                disabled: busy,
                                onClick: onClose,
                                className: "text-xs font-semibold text-alloy-midnight/60 hover:text-alloy-midnight disabled:opacity-50",
                                children: "Close"
                            }, void 0, false, {
                                fileName: "[project]/components/admin/opportunity/actions/ContactAttemptedModal.tsx",
                                lineNumber: 47,
                                columnNumber: 21
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/admin/opportunity/actions/ContactAttemptedModal.tsx",
                        lineNumber: 40,
                        columnNumber: 17
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "px-5 py-4 space-y-3",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: label,
                                        children: "Method (optional)"
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/opportunity/actions/ContactAttemptedModal.tsx",
                                        lineNumber: 59,
                                        columnNumber: 25
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                                        value: method,
                                        disabled: busy,
                                        onChange: (e)=>setMethod(e.target.value),
                                        className: input,
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                value: "",
                                                children: "Select…"
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/opportunity/actions/ContactAttemptedModal.tsx",
                                                lineNumber: 66,
                                                columnNumber: 29
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                value: "call",
                                                children: "Call"
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/opportunity/actions/ContactAttemptedModal.tsx",
                                                lineNumber: 67,
                                                columnNumber: 29
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                value: "sms",
                                                children: "Text"
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/opportunity/actions/ContactAttemptedModal.tsx",
                                                lineNumber: 68,
                                                columnNumber: 29
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                value: "email",
                                                children: "Email"
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/opportunity/actions/ContactAttemptedModal.tsx",
                                                lineNumber: 69,
                                                columnNumber: 29
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                value: "in_person",
                                                children: "In person"
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/opportunity/actions/ContactAttemptedModal.tsx",
                                                lineNumber: 70,
                                                columnNumber: 29
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                value: "other",
                                                children: "Other"
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/opportunity/actions/ContactAttemptedModal.tsx",
                                                lineNumber: 71,
                                                columnNumber: 29
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/components/admin/opportunity/actions/ContactAttemptedModal.tsx",
                                        lineNumber: 60,
                                        columnNumber: 25
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/admin/opportunity/actions/ContactAttemptedModal.tsx",
                                lineNumber: 58,
                                columnNumber: 21
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: label,
                                        children: "Note (optional)"
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/opportunity/actions/ContactAttemptedModal.tsx",
                                        lineNumber: 75,
                                        columnNumber: 25
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("textarea", {
                                        value: note,
                                        disabled: busy,
                                        onChange: (e)=>setNote(e.target.value),
                                        className: input,
                                        rows: 4,
                                        placeholder: "Add a quick note about what you tried."
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/opportunity/actions/ContactAttemptedModal.tsx",
                                        lineNumber: 76,
                                        columnNumber: 25
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/admin/opportunity/actions/ContactAttemptedModal.tsx",
                                lineNumber: 74,
                                columnNumber: 21
                            }, this),
                            error ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "rounded-lg border border-alloy-ember/30 bg-alloy-ember/5 px-3 py-2 text-sm text-alloy-ember",
                                children: error
                            }, void 0, false, {
                                fileName: "[project]/components/admin/opportunity/actions/ContactAttemptedModal.tsx",
                                lineNumber: 86,
                                columnNumber: 25
                            }, this) : null
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/admin/opportunity/actions/ContactAttemptedModal.tsx",
                        lineNumber: 57,
                        columnNumber: 17
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-center justify-end gap-2 px-5 py-4 border-t border-alloy-stone/15",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                type: "button",
                                disabled: busy,
                                onClick: onClose,
                                className: "rounded-lg border border-alloy-stone/25 bg-white px-3 py-2 text-sm font-semibold text-alloy-midnight/75 hover:bg-alloy-stone/5 disabled:opacity-50",
                                children: "Cancel"
                            }, void 0, false, {
                                fileName: "[project]/components/admin/opportunity/actions/ContactAttemptedModal.tsx",
                                lineNumber: 93,
                                columnNumber: 21
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                type: "button",
                                disabled: !canSubmit,
                                onClick: async ()=>{
                                    setBusy(true);
                                    setError(null);
                                    try {
                                        await onSubmit({
                                            note: note.trim(),
                                            last_contact_attempt_method: method.trim()
                                        });
                                        onClose();
                                    } catch (e) {
                                        setError(e instanceof Error ? e.message : "Save failed");
                                    } finally{
                                        setBusy(false);
                                    }
                                },
                                className: "rounded-lg border border-alloy-blue/30 bg-alloy-blue px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50",
                                children: busy ? "Saving…" : "Save"
                            }, void 0, false, {
                                fileName: "[project]/components/admin/opportunity/actions/ContactAttemptedModal.tsx",
                                lineNumber: 101,
                                columnNumber: 21
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/admin/opportunity/actions/ContactAttemptedModal.tsx",
                        lineNumber: 92,
                        columnNumber: 17
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/admin/opportunity/actions/ContactAttemptedModal.tsx",
                lineNumber: 39,
                columnNumber: 13
            }, this)
        ]
    }, void 0, true);
}
_s(ContactAttemptedModal, "mcxshw9NaLjLz5FWlYKjkWFISvM=");
_c = ContactAttemptedModal;
var _c;
__turbopack_context__.k.register(_c, "ContactAttemptedModal");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/components/admin/opportunity/actions/UpdateStatusAddNoteModal.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "UpdateStatusAddNoteModal",
    ()=>UpdateStatusAddNoteModal
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$polyfills$2f$process$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = /*#__PURE__*/ __turbopack_context__.i("[project]/node_modules/next/dist/build/polyfills/process.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
let transitionRulesCache = null;
let transitionRulesInflight = null;
const TRANSITION_RULES_TTL_MS = 60_000;
async function loadTransitionRules(signal) {
    const timingEnabled = ("TURBOPACK compile-time value", "development") !== "production";
    const t0 = ("TURBOPACK compile-time truthy", 1) ? performance.now() : "TURBOPACK unreachable";
    const now = Date.now();
    if (transitionRulesCache && now - transitionRulesCache.atMs < TRANSITION_RULES_TTL_MS) {
        if ("TURBOPACK compile-time truthy", 1) {
            console.info("[timing][drawer]", {
                phase: "status_transition_rules_cache_hit",
                ms: 0
            });
        }
        return transitionRulesCache.items;
    }
    if (transitionRulesInflight) return transitionRulesInflight;
    transitionRulesInflight = (async ()=>{
        const res = await fetch("/api/admin/status-transition-rules", {
            credentials: "include",
            signal
        });
        const json = await res.json().catch(()=>({}));
        if (!res.ok) return [];
        const raw = Array.isArray(json.items) ? json.items : Array.isArray(json.rules) ? json.rules : [];
        const list = Array.isArray(raw) ? raw : [];
        const normalized = list.map((r)=>({
                entity_type: r?.entity_type ?? null,
                department_id: r?.department_id ?? null,
                work_unit_id: r?.work_unit_id ?? null,
                action_key: r?.action_key ?? null,
                to_status_key: r?.to_status_key ?? null,
                required_payload_fields: Array.isArray(r?.required_payload_fields) ? r.required_payload_fields.filter((x)=>typeof x === "string") : null,
                blocked: r?.blocked ?? null,
                is_active: r?.is_active ?? null
            })).filter((r)=>r.is_active !== false);
        transitionRulesCache = {
            atMs: Date.now(),
            items: normalized
        };
        if ("TURBOPACK compile-time truthy", 1) {
            console.info("[timing][drawer]", {
                phase: "status_transition_rules_fetch",
                url: "/api/admin/status-transition-rules",
                ms: Math.round((performance.now() - t0) * 10) / 10
            });
        }
        return normalized;
    })().finally(()=>{
        transitionRulesInflight = null;
    });
    return transitionRulesInflight;
}
function UpdateStatusAddNoteModal(props) {
    _s();
    const { open, title = "Update status", statusOptions, initialStatusKey, onClose, onSubmit, transitionContext } = props;
    const [statusKey, setStatusKey] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [note, setNote] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [nextStep, setNextStep] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [extra, setExtra] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])({});
    const [busy, setBusy] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [error, setError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [rules, setRules] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])([]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "UpdateStatusAddNoteModal.useEffect": ()=>{
            if (!open) return;
            setStatusKey(initialStatusKey ?? "");
            setNote("");
            setNextStep("");
            setExtra({});
            setError(null);
            setBusy(false);
        }
    }["UpdateStatusAddNoteModal.useEffect"], [
        open,
        initialStatusKey
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "UpdateStatusAddNoteModal.useEffect": ()=>{
            if (!open) return;
            let cancelled = false;
            const ac = new AbortController();
            ({
                "UpdateStatusAddNoteModal.useEffect": async ()=>{
                    try {
                        const normalized = await loadTransitionRules(ac.signal);
                        if (!cancelled) setRules(normalized);
                    } catch  {
                        if (!cancelled) setRules([]);
                    }
                }
            })["UpdateStatusAddNoteModal.useEffect"]();
            return ({
                "UpdateStatusAddNoteModal.useEffect": ()=>{
                    cancelled = true;
                    ac.abort();
                }
            })["UpdateStatusAddNoteModal.useEffect"];
        }
    }["UpdateStatusAddNoteModal.useEffect"], [
        open
    ]);
    const requiredPayloadFields = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "UpdateStatusAddNoteModal.useMemo[requiredPayloadFields]": ()=>{
            const to = statusKey.trim();
            if (!to) return [];
            const ctx = transitionContext ?? null;
            const matches = rules.filter({
                "UpdateStatusAddNoteModal.useMemo[requiredPayloadFields].matches": (r)=>{
                    if (r.blocked) return false;
                    const et = String(r.entity_type ?? "").trim().toLowerCase();
                    if (et !== "opportunities" && et !== "opportunity") return false;
                    if (String(r.to_status_key ?? "").trim() !== to) return false;
                    if (r.department_id && (!ctx?.departmentId || r.department_id !== ctx.departmentId)) return false;
                    if (r.work_unit_id && (!ctx?.workUnitId || r.work_unit_id !== ctx.workUnitId)) return false;
                    if (r.action_key && (!ctx?.actionKey || r.action_key !== ctx.actionKey)) return false;
                    return true;
                }
            }["UpdateStatusAddNoteModal.useMemo[requiredPayloadFields].matches"]);
            const out = [];
            for (const m of matches){
                for (const f of m.required_payload_fields ?? [])out.push(f);
            }
            return [
                ...new Set(out)
            ];
        }
    }["UpdateStatusAddNoteModal.useMemo[requiredPayloadFields]"], [
        rules,
        statusKey,
        transitionContext
    ]);
    const overlay = "fixed inset-0 z-[80] bg-black/20 backdrop-blur-[1px]";
    const panel = "fixed left-1/2 top-1/2 z-[81] w-[92vw] max-w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-admin-border bg-white shadow-xl";
    const label = "text-[11px] font-semibold uppercase tracking-wide text-alloy-forge/50";
    const input = "w-full rounded-lg border border-alloy-stone/20 bg-white px-3 py-2 text-sm text-alloy-midnight focus:border-alloy-blue/45 focus:outline-none focus:ring-2 focus:ring-alloy-blue/15 disabled:opacity-60";
    const statusOptionsResolved = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "UpdateStatusAddNoteModal.useMemo[statusOptionsResolved]": ()=>{
            const base = statusOptions ?? [];
            const sorted = [
                ...base
            ].sort({
                "UpdateStatusAddNoteModal.useMemo[statusOptionsResolved].sorted": (a, b)=>a.label.localeCompare(b.label)
            }["UpdateStatusAddNoteModal.useMemo[statusOptionsResolved].sorted"]);
            return sorted;
        }
    }["UpdateStatusAddNoteModal.useMemo[statusOptionsResolved]"], [
        statusOptions
    ]);
    if (!open) return null;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: overlay,
                onClick: ()=>!busy ? onClose() : null
            }, void 0, false, {
                fileName: "[project]/components/admin/opportunity/actions/UpdateStatusAddNoteModal.tsx",
                lineNumber: 159,
                columnNumber: 13
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: panel,
                role: "dialog",
                "aria-modal": "true",
                "aria-label": title,
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-start justify-between gap-3 px-5 py-4 border-b border-alloy-stone/15",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "min-w-0",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "text-sm font-semibold text-alloy-midnight",
                                        children: title
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/opportunity/actions/UpdateStatusAddNoteModal.tsx",
                                        lineNumber: 163,
                                        columnNumber: 25
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "mt-0.5 text-[12px] text-alloy-midnight/60",
                                        children: "Update the opportunity status and log a quick note."
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/opportunity/actions/UpdateStatusAddNoteModal.tsx",
                                        lineNumber: 164,
                                        columnNumber: 25
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/admin/opportunity/actions/UpdateStatusAddNoteModal.tsx",
                                lineNumber: 162,
                                columnNumber: 21
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                type: "button",
                                disabled: busy,
                                onClick: onClose,
                                className: "text-xs font-semibold text-alloy-midnight/60 hover:text-alloy-midnight disabled:opacity-50",
                                children: "Close"
                            }, void 0, false, {
                                fileName: "[project]/components/admin/opportunity/actions/UpdateStatusAddNoteModal.tsx",
                                lineNumber: 168,
                                columnNumber: 21
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/admin/opportunity/actions/UpdateStatusAddNoteModal.tsx",
                        lineNumber: 161,
                        columnNumber: 17
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "px-5 py-4 space-y-3",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: label,
                                        children: "Status"
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/opportunity/actions/UpdateStatusAddNoteModal.tsx",
                                        lineNumber: 180,
                                        columnNumber: 25
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                                        value: statusKey,
                                        disabled: busy,
                                        onChange: (e)=>setStatusKey(e.target.value),
                                        className: input,
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                value: "",
                                                children: "Select…"
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/opportunity/actions/UpdateStatusAddNoteModal.tsx",
                                                lineNumber: 187,
                                                columnNumber: 29
                                            }, this),
                                            statusOptionsResolved.map((o)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                    value: o.value,
                                                    children: o.label
                                                }, o.value, false, {
                                                    fileName: "[project]/components/admin/opportunity/actions/UpdateStatusAddNoteModal.tsx",
                                                    lineNumber: 189,
                                                    columnNumber: 33
                                                }, this))
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/components/admin/opportunity/actions/UpdateStatusAddNoteModal.tsx",
                                        lineNumber: 181,
                                        columnNumber: 25
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/admin/opportunity/actions/UpdateStatusAddNoteModal.tsx",
                                lineNumber: 179,
                                columnNumber: 21
                            }, this),
                            requiredPayloadFields.length ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "rounded-lg border border-alloy-stone/20 bg-alloy-stone/5 px-3 py-2",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: label,
                                        children: "Required for this transition"
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/opportunity/actions/UpdateStatusAddNoteModal.tsx",
                                        lineNumber: 197,
                                        columnNumber: 29
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3",
                                        children: requiredPayloadFields.map((k)=>{
                                            const v = extra[k] ?? "";
                                            const inputType = k.toLowerCase().includes("date") ? "date" : k.toLowerCase().includes("time") ? "time" : "text";
                                            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                className: "block",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: "text-xs font-semibold text-alloy-midnight/70",
                                                        children: k
                                                    }, void 0, false, {
                                                        fileName: "[project]/components/admin/opportunity/actions/UpdateStatusAddNoteModal.tsx",
                                                        lineNumber: 205,
                                                        columnNumber: 45
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                        type: inputType,
                                                        value: v,
                                                        disabled: busy,
                                                        onChange: (e)=>setExtra((prev)=>({
                                                                    ...prev,
                                                                    [k]: e.target.value
                                                                })),
                                                        className: `${input} mt-1`
                                                    }, void 0, false, {
                                                        fileName: "[project]/components/admin/opportunity/actions/UpdateStatusAddNoteModal.tsx",
                                                        lineNumber: 206,
                                                        columnNumber: 45
                                                    }, this)
                                                ]
                                            }, k, true, {
                                                fileName: "[project]/components/admin/opportunity/actions/UpdateStatusAddNoteModal.tsx",
                                                lineNumber: 204,
                                                columnNumber: 41
                                            }, this);
                                        })
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/opportunity/actions/UpdateStatusAddNoteModal.tsx",
                                        lineNumber: 198,
                                        columnNumber: 29
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/admin/opportunity/actions/UpdateStatusAddNoteModal.tsx",
                                lineNumber: 196,
                                columnNumber: 25
                            }, this) : null,
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: label,
                                        children: "Note"
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/opportunity/actions/UpdateStatusAddNoteModal.tsx",
                                        lineNumber: 225,
                                        columnNumber: 25
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("textarea", {
                                        value: note,
                                        disabled: busy,
                                        onChange: (e)=>setNote(e.target.value),
                                        className: input,
                                        rows: 4,
                                        placeholder: "Add a quick note (optional)."
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/opportunity/actions/UpdateStatusAddNoteModal.tsx",
                                        lineNumber: 226,
                                        columnNumber: 25
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "mt-1 text-[11px] text-alloy-midnight/45",
                                        children: "Notes are stored on the opportunity for now (Enrollment V1)."
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/opportunity/actions/UpdateStatusAddNoteModal.tsx",
                                        lineNumber: 234,
                                        columnNumber: 25
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/admin/opportunity/actions/UpdateStatusAddNoteModal.tsx",
                                lineNumber: 224,
                                columnNumber: 21
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: label,
                                        children: "Next step (optional)"
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/opportunity/actions/UpdateStatusAddNoteModal.tsx",
                                        lineNumber: 239,
                                        columnNumber: 25
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                        value: nextStep,
                                        disabled: busy,
                                        onChange: (e)=>setNextStep(e.target.value),
                                        className: input,
                                        placeholder: "e.g. Confirm tour date with parent"
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/opportunity/actions/UpdateStatusAddNoteModal.tsx",
                                        lineNumber: 240,
                                        columnNumber: 25
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/admin/opportunity/actions/UpdateStatusAddNoteModal.tsx",
                                lineNumber: 238,
                                columnNumber: 21
                            }, this),
                            error ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "rounded-lg border border-alloy-ember/30 bg-alloy-ember/5 px-3 py-2 text-sm text-alloy-ember",
                                children: error
                            }, void 0, false, {
                                fileName: "[project]/components/admin/opportunity/actions/UpdateStatusAddNoteModal.tsx",
                                lineNumber: 249,
                                columnNumber: 25
                            }, this) : null
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/admin/opportunity/actions/UpdateStatusAddNoteModal.tsx",
                        lineNumber: 178,
                        columnNumber: 17
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-center justify-end gap-2 px-5 py-4 border-t border-alloy-stone/15",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                type: "button",
                                disabled: busy,
                                onClick: onClose,
                                className: "rounded-lg border border-alloy-stone/25 bg-white px-3 py-2 text-sm font-semibold text-alloy-midnight/75 hover:bg-alloy-stone/5 disabled:opacity-50",
                                children: "Cancel"
                            }, void 0, false, {
                                fileName: "[project]/components/admin/opportunity/actions/UpdateStatusAddNoteModal.tsx",
                                lineNumber: 256,
                                columnNumber: 21
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                type: "button",
                                disabled: busy || !statusKey.trim(),
                                onClick: async ()=>{
                                    if (!statusKey.trim()) return;
                                    for (const k of requiredPayloadFields){
                                        const v = String(extra[k] ?? "").trim();
                                        if (!v) {
                                            setError(`Missing required field: ${k}`);
                                            return;
                                        }
                                    }
                                    setBusy(true);
                                    setError(null);
                                    try {
                                        await onSubmit({
                                            status_key: statusKey.trim(),
                                            note: note.trim(),
                                            next_step: nextStep.trim(),
                                            ...Object.fromEntries(requiredPayloadFields.map((k)=>[
                                                    k,
                                                    String(extra[k] ?? "").trim()
                                                ]))
                                        });
                                        onClose();
                                    } catch (e) {
                                        setError(e instanceof Error ? e.message : "Save failed");
                                    } finally{
                                        setBusy(false);
                                    }
                                },
                                className: "rounded-lg border border-alloy-blue/30 bg-alloy-blue px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50",
                                children: busy ? "Saving…" : "Save"
                            }, void 0, false, {
                                fileName: "[project]/components/admin/opportunity/actions/UpdateStatusAddNoteModal.tsx",
                                lineNumber: 264,
                                columnNumber: 21
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/admin/opportunity/actions/UpdateStatusAddNoteModal.tsx",
                        lineNumber: 255,
                        columnNumber: 17
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/admin/opportunity/actions/UpdateStatusAddNoteModal.tsx",
                lineNumber: 160,
                columnNumber: 13
            }, this)
        ]
    }, void 0, true);
}
_s(UpdateStatusAddNoteModal, "qunqYmmjfRBEVofwLGnVgx81ZOI=");
_c = UpdateStatusAddNoteModal;
var _c;
__turbopack_context__.k.register(_c, "UpdateStatusAddNoteModal");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/components/admin/opportunity/actions/AddRelatedPersonModal.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "AddRelatedPersonModal",
    ()=>AddRelatedPersonModal
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
const ROLE_OPTIONS = [
    {
        value: "primary_contact",
        label: "Primary contact"
    },
    {
        value: "parent",
        label: "Parent"
    },
    {
        value: "guardian",
        label: "Guardian"
    },
    {
        value: "emergency_contact",
        label: "Emergency contact"
    },
    {
        value: "other",
        label: "Other"
    }
];
function AddRelatedPersonModal(props) {
    _s();
    const { open, title = "Add parent/contact", onClose, onSubmit } = props;
    const [firstName, setFirstName] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [lastName, setLastName] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [email, setEmail] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [phone, setPhone] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [roleType, setRoleType] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("primary_contact");
    const [busy, setBusy] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [error, setError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "AddRelatedPersonModal.useEffect": ()=>{
            if (!open) return;
            setFirstName("");
            setLastName("");
            setEmail("");
            setPhone("");
            setRoleType("primary_contact");
            setBusy(false);
            setError(null);
        }
    }["AddRelatedPersonModal.useEffect"], [
        open
    ]);
    const overlay = "fixed inset-0 z-[80] bg-black/20 backdrop-blur-[1px]";
    const panel = "fixed left-1/2 top-1/2 z-[81] w-[92vw] max-w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-admin-border bg-white shadow-xl";
    const label = "text-[11px] font-semibold uppercase tracking-wide text-alloy-forge/50";
    const input = "w-full rounded-lg border border-alloy-stone/20 bg-white px-3 py-2 text-sm text-alloy-midnight focus:border-alloy-blue/45 focus:outline-none focus:ring-2 focus:ring-alloy-blue/15 disabled:opacity-60";
    const roleOptions = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "AddRelatedPersonModal.useMemo[roleOptions]": ()=>[
                ...ROLE_OPTIONS
            ]
    }["AddRelatedPersonModal.useMemo[roleOptions]"], []);
    if (!open) return null;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: overlay,
                onClick: ()=>!busy ? onClose() : null
            }, void 0, false, {
                fileName: "[project]/components/admin/opportunity/actions/AddRelatedPersonModal.tsx",
                lineNumber: 52,
                columnNumber: 13
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: panel,
                role: "dialog",
                "aria-modal": "true",
                "aria-label": title,
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-start justify-between gap-3 px-5 py-4 border-b border-alloy-stone/15",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "min-w-0",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "text-sm font-semibold text-alloy-midnight",
                                        children: title
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/opportunity/actions/AddRelatedPersonModal.tsx",
                                        lineNumber: 56,
                                        columnNumber: 25
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "mt-0.5 text-[12px] text-alloy-midnight/60",
                                        children: "Adds a person to the household and links them for this account."
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/opportunity/actions/AddRelatedPersonModal.tsx",
                                        lineNumber: 57,
                                        columnNumber: 25
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/admin/opportunity/actions/AddRelatedPersonModal.tsx",
                                lineNumber: 55,
                                columnNumber: 21
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                type: "button",
                                disabled: busy,
                                onClick: onClose,
                                className: "text-xs font-semibold text-alloy-midnight/60 hover:text-alloy-midnight disabled:opacity-50",
                                children: "Close"
                            }, void 0, false, {
                                fileName: "[project]/components/admin/opportunity/actions/AddRelatedPersonModal.tsx",
                                lineNumber: 61,
                                columnNumber: 21
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/admin/opportunity/actions/AddRelatedPersonModal.tsx",
                        lineNumber: 54,
                        columnNumber: 17
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "px-5 py-4 space-y-3",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "grid grid-cols-1 sm:grid-cols-2 gap-3",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: label,
                                                children: "First name"
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/opportunity/actions/AddRelatedPersonModal.tsx",
                                                lineNumber: 74,
                                                columnNumber: 29
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                value: firstName,
                                                disabled: busy,
                                                onChange: (e)=>setFirstName(e.target.value),
                                                className: input
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/opportunity/actions/AddRelatedPersonModal.tsx",
                                                lineNumber: 75,
                                                columnNumber: 29
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/components/admin/opportunity/actions/AddRelatedPersonModal.tsx",
                                        lineNumber: 73,
                                        columnNumber: 25
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: label,
                                                children: "Last name"
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/opportunity/actions/AddRelatedPersonModal.tsx",
                                                lineNumber: 78,
                                                columnNumber: 29
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                value: lastName,
                                                disabled: busy,
                                                onChange: (e)=>setLastName(e.target.value),
                                                className: input
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/opportunity/actions/AddRelatedPersonModal.tsx",
                                                lineNumber: 79,
                                                columnNumber: 29
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/components/admin/opportunity/actions/AddRelatedPersonModal.tsx",
                                        lineNumber: 77,
                                        columnNumber: 25
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/admin/opportunity/actions/AddRelatedPersonModal.tsx",
                                lineNumber: 72,
                                columnNumber: 21
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: label,
                                        children: "Role (optional)"
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/opportunity/actions/AddRelatedPersonModal.tsx",
                                        lineNumber: 83,
                                        columnNumber: 25
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                                        value: roleType,
                                        disabled: busy,
                                        onChange: (e)=>setRoleType(e.target.value),
                                        className: input,
                                        children: roleOptions.map((o)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                value: o.value,
                                                children: o.label
                                            }, o.value, false, {
                                                fileName: "[project]/components/admin/opportunity/actions/AddRelatedPersonModal.tsx",
                                                lineNumber: 86,
                                                columnNumber: 33
                                            }, this))
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/opportunity/actions/AddRelatedPersonModal.tsx",
                                        lineNumber: 84,
                                        columnNumber: 25
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/admin/opportunity/actions/AddRelatedPersonModal.tsx",
                                lineNumber: 82,
                                columnNumber: 21
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "grid grid-cols-1 sm:grid-cols-2 gap-3",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: label,
                                                children: "Email (optional)"
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/opportunity/actions/AddRelatedPersonModal.tsx",
                                                lineNumber: 94,
                                                columnNumber: 29
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                value: email,
                                                disabled: busy,
                                                onChange: (e)=>setEmail(e.target.value),
                                                className: input
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/opportunity/actions/AddRelatedPersonModal.tsx",
                                                lineNumber: 95,
                                                columnNumber: 29
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/components/admin/opportunity/actions/AddRelatedPersonModal.tsx",
                                        lineNumber: 93,
                                        columnNumber: 25
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: label,
                                                children: "Phone (optional)"
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/opportunity/actions/AddRelatedPersonModal.tsx",
                                                lineNumber: 98,
                                                columnNumber: 29
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                value: phone,
                                                disabled: busy,
                                                onChange: (e)=>setPhone(e.target.value),
                                                className: input
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/opportunity/actions/AddRelatedPersonModal.tsx",
                                                lineNumber: 99,
                                                columnNumber: 29
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/components/admin/opportunity/actions/AddRelatedPersonModal.tsx",
                                        lineNumber: 97,
                                        columnNumber: 25
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/admin/opportunity/actions/AddRelatedPersonModal.tsx",
                                lineNumber: 92,
                                columnNumber: 21
                            }, this),
                            error ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "rounded-lg border border-alloy-ember/30 bg-alloy-ember/5 px-3 py-2 text-sm text-alloy-ember",
                                children: error
                            }, void 0, false, {
                                fileName: "[project]/components/admin/opportunity/actions/AddRelatedPersonModal.tsx",
                                lineNumber: 103,
                                columnNumber: 25
                            }, this) : null
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/admin/opportunity/actions/AddRelatedPersonModal.tsx",
                        lineNumber: 71,
                        columnNumber: 17
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-center justify-end gap-2 px-5 py-4 border-t border-alloy-stone/15",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                type: "button",
                                disabled: busy,
                                onClick: onClose,
                                className: "rounded-lg border border-alloy-stone/25 bg-white px-3 py-2 text-sm font-semibold text-alloy-midnight/75 hover:bg-alloy-stone/5 disabled:opacity-50",
                                children: "Cancel"
                            }, void 0, false, {
                                fileName: "[project]/components/admin/opportunity/actions/AddRelatedPersonModal.tsx",
                                lineNumber: 110,
                                columnNumber: 21
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                type: "button",
                                disabled: busy || !firstName.trim() || !lastName.trim(),
                                onClick: async ()=>{
                                    if (!firstName.trim() || !lastName.trim()) return;
                                    setBusy(true);
                                    setError(null);
                                    try {
                                        await onSubmit({
                                            first_name: firstName.trim(),
                                            last_name: lastName.trim(),
                                            email: email.trim() || undefined,
                                            phone: phone.trim() || undefined,
                                            role_type: roleType.trim() || undefined
                                        });
                                        onClose();
                                    } catch (e) {
                                        setError(e instanceof Error ? e.message : "Save failed");
                                    } finally{
                                        setBusy(false);
                                    }
                                },
                                className: "rounded-lg border border-alloy-blue/30 bg-alloy-blue px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50",
                                children: busy ? "Saving…" : "Add"
                            }, void 0, false, {
                                fileName: "[project]/components/admin/opportunity/actions/AddRelatedPersonModal.tsx",
                                lineNumber: 118,
                                columnNumber: 21
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/admin/opportunity/actions/AddRelatedPersonModal.tsx",
                        lineNumber: 109,
                        columnNumber: 17
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/admin/opportunity/actions/AddRelatedPersonModal.tsx",
                lineNumber: 53,
                columnNumber: 13
            }, this)
        ]
    }, void 0, true);
}
_s(AddRelatedPersonModal, "v5QzfTxSpTV1I7xHnKk2oFTTNBY=");
_c = AddRelatedPersonModal;
var _c;
__turbopack_context__.k.register(_c, "AddRelatedPersonModal");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/components/admin/opportunity/actions/AddFamilyMemberModal.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "AddFamilyMemberModal",
    ()=>AddFamilyMemberModal
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
const ROLE_OPTIONS = [
    {
        value: "parent",
        label: "Parent"
    },
    {
        value: "guardian",
        label: "Guardian"
    },
    {
        value: "family_member",
        label: "Family member"
    },
    {
        value: "emergency_contact",
        label: "Emergency contact"
    },
    {
        value: "other",
        label: "Other"
    }
];
function AddFamilyMemberModal(props) {
    _s();
    const { open, title = "Add family member", onClose, onSubmit } = props;
    const [firstName, setFirstName] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [lastName, setLastName] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [email, setEmail] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [phone, setPhone] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [roleType, setRoleType] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("parent");
    const [busy, setBusy] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [error, setError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "AddFamilyMemberModal.useEffect": ()=>{
            if (!open) return;
            setFirstName("");
            setLastName("");
            setEmail("");
            setPhone("");
            setRoleType("parent");
            setBusy(false);
            setError(null);
        }
    }["AddFamilyMemberModal.useEffect"], [
        open
    ]);
    const overlay = "fixed inset-0 z-[80] bg-black/20 backdrop-blur-[1px]";
    const panel = "fixed left-1/2 top-1/2 z-[81] w-[92vw] max-w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-admin-border bg-white shadow-xl";
    const label = "text-[11px] font-semibold uppercase tracking-wide text-alloy-forge/50";
    const input = "w-full rounded-lg border border-alloy-stone/20 bg-white px-3 py-2 text-sm text-alloy-midnight focus:border-alloy-blue/45 focus:outline-none focus:ring-2 focus:ring-alloy-blue/15 disabled:opacity-60";
    const roleOptions = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "AddFamilyMemberModal.useMemo[roleOptions]": ()=>[
                ...ROLE_OPTIONS
            ]
    }["AddFamilyMemberModal.useMemo[roleOptions]"], []);
    if (!open) return null;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: overlay,
                onClick: ()=>!busy ? onClose() : null
            }, void 0, false, {
                fileName: "[project]/components/admin/opportunity/actions/AddFamilyMemberModal.tsx",
                lineNumber: 52,
                columnNumber: 13
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: panel,
                role: "dialog",
                "aria-modal": "true",
                "aria-label": title,
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-start justify-between gap-3 px-5 py-4 border-b border-alloy-stone/15",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "min-w-0",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "text-sm font-semibold text-alloy-midnight",
                                        children: title
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/opportunity/actions/AddFamilyMemberModal.tsx",
                                        lineNumber: 56,
                                        columnNumber: 25
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "mt-0.5 text-[12px] text-alloy-midnight/60",
                                        children: "Links a person to this opportunity only (not the contacts model)."
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/opportunity/actions/AddFamilyMemberModal.tsx",
                                        lineNumber: 57,
                                        columnNumber: 25
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/admin/opportunity/actions/AddFamilyMemberModal.tsx",
                                lineNumber: 55,
                                columnNumber: 21
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                type: "button",
                                disabled: busy,
                                onClick: onClose,
                                className: "text-xs font-semibold text-alloy-midnight/60 hover:text-alloy-midnight disabled:opacity-50",
                                children: "Close"
                            }, void 0, false, {
                                fileName: "[project]/components/admin/opportunity/actions/AddFamilyMemberModal.tsx",
                                lineNumber: 61,
                                columnNumber: 21
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/admin/opportunity/actions/AddFamilyMemberModal.tsx",
                        lineNumber: 54,
                        columnNumber: 17
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "px-5 py-4 space-y-3",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "grid grid-cols-1 sm:grid-cols-2 gap-3",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: label,
                                                children: "First name"
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/opportunity/actions/AddFamilyMemberModal.tsx",
                                                lineNumber: 74,
                                                columnNumber: 29
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                value: firstName,
                                                disabled: busy,
                                                onChange: (e)=>setFirstName(e.target.value),
                                                className: input
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/opportunity/actions/AddFamilyMemberModal.tsx",
                                                lineNumber: 75,
                                                columnNumber: 29
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/components/admin/opportunity/actions/AddFamilyMemberModal.tsx",
                                        lineNumber: 73,
                                        columnNumber: 25
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: label,
                                                children: "Last name"
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/opportunity/actions/AddFamilyMemberModal.tsx",
                                                lineNumber: 78,
                                                columnNumber: 29
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                value: lastName,
                                                disabled: busy,
                                                onChange: (e)=>setLastName(e.target.value),
                                                className: input
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/opportunity/actions/AddFamilyMemberModal.tsx",
                                                lineNumber: 79,
                                                columnNumber: 29
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/components/admin/opportunity/actions/AddFamilyMemberModal.tsx",
                                        lineNumber: 77,
                                        columnNumber: 25
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/admin/opportunity/actions/AddFamilyMemberModal.tsx",
                                lineNumber: 72,
                                columnNumber: 21
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: label,
                                        children: "Role"
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/opportunity/actions/AddFamilyMemberModal.tsx",
                                        lineNumber: 83,
                                        columnNumber: 25
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                                        value: roleType,
                                        disabled: busy,
                                        onChange: (e)=>setRoleType(e.target.value),
                                        className: input,
                                        children: roleOptions.map((o)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                value: o.value,
                                                children: o.label
                                            }, o.value, false, {
                                                fileName: "[project]/components/admin/opportunity/actions/AddFamilyMemberModal.tsx",
                                                lineNumber: 86,
                                                columnNumber: 33
                                            }, this))
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/opportunity/actions/AddFamilyMemberModal.tsx",
                                        lineNumber: 84,
                                        columnNumber: 25
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/admin/opportunity/actions/AddFamilyMemberModal.tsx",
                                lineNumber: 82,
                                columnNumber: 21
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "grid grid-cols-1 sm:grid-cols-2 gap-3",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: label,
                                                children: "Email (optional)"
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/opportunity/actions/AddFamilyMemberModal.tsx",
                                                lineNumber: 94,
                                                columnNumber: 29
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                value: email,
                                                disabled: busy,
                                                onChange: (e)=>setEmail(e.target.value),
                                                className: input
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/opportunity/actions/AddFamilyMemberModal.tsx",
                                                lineNumber: 95,
                                                columnNumber: 29
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/components/admin/opportunity/actions/AddFamilyMemberModal.tsx",
                                        lineNumber: 93,
                                        columnNumber: 25
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: label,
                                                children: "Phone (optional)"
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/opportunity/actions/AddFamilyMemberModal.tsx",
                                                lineNumber: 98,
                                                columnNumber: 29
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                value: phone,
                                                disabled: busy,
                                                onChange: (e)=>setPhone(e.target.value),
                                                className: input
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/opportunity/actions/AddFamilyMemberModal.tsx",
                                                lineNumber: 99,
                                                columnNumber: 29
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/components/admin/opportunity/actions/AddFamilyMemberModal.tsx",
                                        lineNumber: 97,
                                        columnNumber: 25
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/admin/opportunity/actions/AddFamilyMemberModal.tsx",
                                lineNumber: 92,
                                columnNumber: 21
                            }, this),
                            error ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "text-sm text-alloy-ember",
                                children: error
                            }, void 0, false, {
                                fileName: "[project]/components/admin/opportunity/actions/AddFamilyMemberModal.tsx",
                                lineNumber: 103,
                                columnNumber: 30
                            }, this) : null,
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex justify-end gap-2 pt-1",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                        type: "button",
                                        disabled: busy,
                                        onClick: onClose,
                                        className: input + " w-auto px-4",
                                        children: "Cancel"
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/opportunity/actions/AddFamilyMemberModal.tsx",
                                        lineNumber: 106,
                                        columnNumber: 25
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                        type: "button",
                                        disabled: busy,
                                        onClick: ()=>{
                                            void (async ()=>{
                                                setError(null);
                                                if (!firstName.trim() || !lastName.trim()) {
                                                    setError("First and last name are required.");
                                                    return;
                                                }
                                                setBusy(true);
                                                try {
                                                    await onSubmit({
                                                        first_name: firstName.trim(),
                                                        last_name: lastName.trim(),
                                                        email: email.trim() || undefined,
                                                        phone: phone.trim() || undefined,
                                                        role_type: roleType.trim() || undefined
                                                    });
                                                } catch (e) {
                                                    setError(e instanceof Error ? e.message : "Something went wrong");
                                                } finally{
                                                    setBusy(false);
                                                }
                                            })();
                                        },
                                        className: "rounded-lg bg-alloy-blue px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50",
                                        children: busy ? "Saving…" : "Save"
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/opportunity/actions/AddFamilyMemberModal.tsx",
                                        lineNumber: 109,
                                        columnNumber: 25
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/admin/opportunity/actions/AddFamilyMemberModal.tsx",
                                lineNumber: 105,
                                columnNumber: 21
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/admin/opportunity/actions/AddFamilyMemberModal.tsx",
                        lineNumber: 71,
                        columnNumber: 17
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/admin/opportunity/actions/AddFamilyMemberModal.tsx",
                lineNumber: 53,
                columnNumber: 13
            }, this)
        ]
    }, void 0, true);
}
_s(AddFamilyMemberModal, "3VZymDJbQ/X7V9BbFJdfp6jLxxw=");
_c = AddFamilyMemberModal;
var _c;
__turbopack_context__.k.register(_c, "AddFamilyMemberModal");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/components/admin/opportunity/actions/AddInquiryChildModal.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "AddInquiryChildModal",
    ()=>AddInquiryChildModal
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
;
function AddInquiryChildModal(props) {
    _s();
    const { open, mode, onClose, onSubmit } = props;
    const [first, setFirst] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [last, setLast] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [dob, setDob] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [program, setProgram] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [ageGroup, setAgeGroup] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [submitting, setSubmitting] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [error, setError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const canSubmit = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "AddInquiryChildModal.useMemo[canSubmit]": ()=>Boolean(first.trim() && last.trim() && !submitting)
    }["AddInquiryChildModal.useMemo[canSubmit]"], [
        first,
        last,
        submitting
    ]);
    if (!open) return null;
    const title = mode === "sibling" ? "Add sibling" : "Add child";
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "fixed inset-0 z-[999] flex items-center justify-center bg-black/30 p-4",
        onClick: onClose,
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "w-full max-w-md overflow-hidden rounded-2xl border border-alloy-stone/25 bg-white shadow-2xl",
            onClick: (e)=>e.stopPropagation(),
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "border-b border-alloy-stone/15 px-5 py-4",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "text-base font-semibold text-alloy-midnight",
                            children: title
                        }, void 0, false, {
                            fileName: "[project]/components/admin/opportunity/actions/AddInquiryChildModal.tsx",
                            lineNumber: 38,
                            columnNumber: 21
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "mt-0.5 text-sm text-alloy-midnight/65",
                            children: "This UI is wired; persistence will be added next."
                        }, void 0, false, {
                            fileName: "[project]/components/admin/opportunity/actions/AddInquiryChildModal.tsx",
                            lineNumber: 39,
                            columnNumber: 21
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/components/admin/opportunity/actions/AddInquiryChildModal.tsx",
                    lineNumber: 37,
                    columnNumber: 17
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "space-y-4 px-5 py-4",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "grid grid-cols-1 gap-3",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                    className: "text-sm",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "mb-1 font-medium text-alloy-midnight",
                                            children: "First name"
                                        }, void 0, false, {
                                            fileName: "[project]/components/admin/opportunity/actions/AddInquiryChildModal.tsx",
                                            lineNumber: 45,
                                            columnNumber: 29
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                            value: first,
                                            onChange: (e)=>setFirst(e.target.value),
                                            className: "w-full rounded-lg border border-alloy-stone/25 bg-white px-3 py-2 text-sm text-alloy-midnight shadow-sm outline-none focus:border-alloy-midnight/30",
                                            required: true
                                        }, void 0, false, {
                                            fileName: "[project]/components/admin/opportunity/actions/AddInquiryChildModal.tsx",
                                            lineNumber: 46,
                                            columnNumber: 29
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/components/admin/opportunity/actions/AddInquiryChildModal.tsx",
                                    lineNumber: 44,
                                    columnNumber: 25
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                    className: "text-sm",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "mb-1 font-medium text-alloy-midnight",
                                            children: "Last name"
                                        }, void 0, false, {
                                            fileName: "[project]/components/admin/opportunity/actions/AddInquiryChildModal.tsx",
                                            lineNumber: 54,
                                            columnNumber: 29
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                            value: last,
                                            onChange: (e)=>setLast(e.target.value),
                                            className: "w-full rounded-lg border border-alloy-stone/25 bg-white px-3 py-2 text-sm text-alloy-midnight shadow-sm outline-none focus:border-alloy-midnight/30",
                                            required: true
                                        }, void 0, false, {
                                            fileName: "[project]/components/admin/opportunity/actions/AddInquiryChildModal.tsx",
                                            lineNumber: 55,
                                            columnNumber: 29
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/components/admin/opportunity/actions/AddInquiryChildModal.tsx",
                                    lineNumber: 53,
                                    columnNumber: 25
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                    className: "text-sm",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "mb-1 font-medium text-alloy-midnight",
                                            children: "Date of birth (optional)"
                                        }, void 0, false, {
                                            fileName: "[project]/components/admin/opportunity/actions/AddInquiryChildModal.tsx",
                                            lineNumber: 63,
                                            columnNumber: 29
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                            type: "date",
                                            value: dob,
                                            onChange: (e)=>setDob(e.target.value),
                                            className: "w-full rounded-lg border border-alloy-stone/25 bg-white px-3 py-2 text-sm text-alloy-midnight shadow-sm outline-none focus:border-alloy-midnight/30"
                                        }, void 0, false, {
                                            fileName: "[project]/components/admin/opportunity/actions/AddInquiryChildModal.tsx",
                                            lineNumber: 64,
                                            columnNumber: 29
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/components/admin/opportunity/actions/AddInquiryChildModal.tsx",
                                    lineNumber: 62,
                                    columnNumber: 25
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                    className: "text-sm",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "mb-1 font-medium text-alloy-midnight",
                                            children: "Program (optional)"
                                        }, void 0, false, {
                                            fileName: "[project]/components/admin/opportunity/actions/AddInquiryChildModal.tsx",
                                            lineNumber: 72,
                                            columnNumber: 29
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                            value: program,
                                            onChange: (e)=>setProgram(e.target.value),
                                            className: "w-full rounded-lg border border-alloy-stone/25 bg-white px-3 py-2 text-sm text-alloy-midnight shadow-sm outline-none focus:border-alloy-midnight/30",
                                            placeholder: "e.g. Toddler"
                                        }, void 0, false, {
                                            fileName: "[project]/components/admin/opportunity/actions/AddInquiryChildModal.tsx",
                                            lineNumber: 73,
                                            columnNumber: 29
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/components/admin/opportunity/actions/AddInquiryChildModal.tsx",
                                    lineNumber: 71,
                                    columnNumber: 25
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                    className: "text-sm",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "mb-1 font-medium text-alloy-midnight",
                                            children: "Age group (optional)"
                                        }, void 0, false, {
                                            fileName: "[project]/components/admin/opportunity/actions/AddInquiryChildModal.tsx",
                                            lineNumber: 81,
                                            columnNumber: 29
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                            value: ageGroup,
                                            onChange: (e)=>setAgeGroup(e.target.value),
                                            className: "w-full rounded-lg border border-alloy-stone/25 bg-white px-3 py-2 text-sm text-alloy-midnight shadow-sm outline-none focus:border-alloy-midnight/30",
                                            placeholder: "e.g. 2–3"
                                        }, void 0, false, {
                                            fileName: "[project]/components/admin/opportunity/actions/AddInquiryChildModal.tsx",
                                            lineNumber: 82,
                                            columnNumber: 29
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/components/admin/opportunity/actions/AddInquiryChildModal.tsx",
                                    lineNumber: 80,
                                    columnNumber: 25
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/components/admin/opportunity/actions/AddInquiryChildModal.tsx",
                            lineNumber: 43,
                            columnNumber: 21
                        }, this),
                        error && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800",
                            children: error
                        }, void 0, false, {
                            fileName: "[project]/components/admin/opportunity/actions/AddInquiryChildModal.tsx",
                            lineNumber: 91,
                            columnNumber: 31
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "flex items-center justify-end gap-2 pt-1",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    className: "rounded-lg border border-alloy-stone/25 bg-white px-3 py-2 text-sm text-alloy-midnight shadow-sm hover:bg-alloy-stone/5",
                                    onClick: onClose,
                                    disabled: submitting,
                                    children: "Cancel"
                                }, void 0, false, {
                                    fileName: "[project]/components/admin/opportunity/actions/AddInquiryChildModal.tsx",
                                    lineNumber: 94,
                                    columnNumber: 25
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    className: "rounded-lg bg-alloy-midnight px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-alloy-midnight/90 disabled:opacity-60",
                                    disabled: !canSubmit,
                                    onClick: async ()=>{
                                        setError(null);
                                        setSubmitting(true);
                                        try {
                                            await onSubmit({
                                                first_name: first.trim(),
                                                last_name: last.trim(),
                                                date_of_birth: dob.trim() || null,
                                                program: program.trim() || null,
                                                age_group: ageGroup.trim() || null
                                            });
                                        } catch (e) {
                                            setError(e instanceof Error ? e.message : String(e));
                                        } finally{
                                            setSubmitting(false);
                                        }
                                    },
                                    children: submitting ? "Saving…" : "Save"
                                }, void 0, false, {
                                    fileName: "[project]/components/admin/opportunity/actions/AddInquiryChildModal.tsx",
                                    lineNumber: 102,
                                    columnNumber: 25
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/components/admin/opportunity/actions/AddInquiryChildModal.tsx",
                            lineNumber: 93,
                            columnNumber: 21
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/components/admin/opportunity/actions/AddInquiryChildModal.tsx",
                    lineNumber: 42,
                    columnNumber: 17
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/components/admin/opportunity/actions/AddInquiryChildModal.tsx",
            lineNumber: 33,
            columnNumber: 13
        }, this)
    }, void 0, false, {
        fileName: "[project]/components/admin/opportunity/actions/AddInquiryChildModal.tsx",
        lineNumber: 32,
        columnNumber: 9
    }, this);
}
_s(AddInquiryChildModal, "SMJI7+ULWGCM0mxg+hn7DjoOV8U=");
_c = AddInquiryChildModal;
var _c;
__turbopack_context__.k.register(_c, "AddInquiryChildModal");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/components/admin/opportunity/OpportunityRecordSectionRegistryActions.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>OpportunityRecordSectionRegistryActions
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$polyfills$2f$process$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = /*#__PURE__*/ __turbopack_context__.i("[project]/node_modules/next/dist/build/polyfills/process.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$actions$2f$applyRegistryResolvedActionClient$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/actions/applyRegistryResolvedActionClient.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$workspaceAdminFetchDedupe$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/workspace/workspaceAdminFetchDedupe.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$workspaceDataFetch$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/workspace/workspaceDataFetch.ts [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
;
;
function filterSlot(items, exclude) {
    const list = items ?? [];
    if (!exclude?.size) return list;
    return list.filter((a)=>!exclude.has(a.key));
}
function OpportunityRecordSectionRegistryActions({ opportunityId, sectionKey, departmentId, workUnitId, excludeActionKeys, canMutate, router, openDrawer, openForm, onApplied, onExecutionResult }) {
    _s();
    const mountRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const [shouldLoad, setShouldLoad] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [bySlot, setBySlot] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [loading, setLoading] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [busyKey, setBusyKey] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "OpportunityRecordSectionRegistryActions.useEffect": ()=>{
            setShouldLoad(false);
            setBySlot(null);
            setLoading(false);
        }
    }["OpportunityRecordSectionRegistryActions.useEffect"], [
        opportunityId,
        sectionKey
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "OpportunityRecordSectionRegistryActions.useEffect": ()=>{
            const el = mountRef.current;
            if (!el || shouldLoad) return;
            const obs = new IntersectionObserver({
                "OpportunityRecordSectionRegistryActions.useEffect": (entries)=>{
                    const hit = entries.some({
                        "OpportunityRecordSectionRegistryActions.useEffect.hit": (e)=>e.isIntersecting
                    }["OpportunityRecordSectionRegistryActions.useEffect.hit"]);
                    if (hit) {
                        setShouldLoad(true);
                        obs.disconnect();
                    }
                }
            }["OpportunityRecordSectionRegistryActions.useEffect"], {
                root: null,
                rootMargin: "140px",
                threshold: 0
            });
            obs.observe(el);
            return ({
                "OpportunityRecordSectionRegistryActions.useEffect": ()=>obs.disconnect()
            })["OpportunityRecordSectionRegistryActions.useEffect"];
        }
    }["OpportunityRecordSectionRegistryActions.useEffect"], [
        opportunityId,
        sectionKey,
        shouldLoad
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "OpportunityRecordSectionRegistryActions.useEffect": ()=>{
            if (!shouldLoad) return;
            let cancelled = false;
            const wu = (workUnitId ?? "").trim();
            const dept = (departmentId ?? "").trim();
            // Scoped placements require both dimensions; avoid a first fetch without department_id then a second with it.
            if (wu && !dept) {
                setBySlot(null);
                setLoading(true);
                return ({
                    "OpportunityRecordSectionRegistryActions.useEffect": ()=>{
                        cancelled = true;
                    }
                })["OpportunityRecordSectionRegistryActions.useEffect"];
            }
            setLoading(true);
            const qs = new URLSearchParams({
                surface: "record_section",
                entity_type: "opportunity",
                entity_id: opportunityId,
                section_key: sectionKey
            });
            if (dept) qs.set("department_id", dept);
            if (wu) qs.set("work_unit_id", wu);
            const url = `/api/admin/actions?${qs.toString()}`;
            const timingEnabled = ("TURBOPACK compile-time value", "development") !== "production" || ("TURBOPACK compile-time value", "object") !== "undefined" && /staging|localhost|127\.0\.0\.1/i.test(window.location.hostname);
            const t0 = ("TURBOPACK compile-time truthy", 1) ? performance.now() : "TURBOPACK unreachable";
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$workspaceAdminFetchDedupe$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["dedupeAdminFetchWithTtl"])(url, (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$workspaceDataFetch$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["workspaceDataFetchInit"])(), 1500).then({
                "OpportunityRecordSectionRegistryActions.useEffect": (r)=>r.json()
            }["OpportunityRecordSectionRegistryActions.useEffect"]).then({
                "OpportunityRecordSectionRegistryActions.useEffect": (j)=>{
                    if (!cancelled) setBySlot(j.actions ?? null);
                    if ("TURBOPACK compile-time truthy", 1) {
                        console.info("[timing][drawer]", {
                            key: `opportunities:${opportunityId}`,
                            phase: "record_section_actions_fetch",
                            section_key: sectionKey,
                            url,
                            ms: Math.round((performance.now() - t0) * 10) / 10
                        });
                    }
                }
            }["OpportunityRecordSectionRegistryActions.useEffect"]).catch({
                "OpportunityRecordSectionRegistryActions.useEffect": ()=>{
                    if (!cancelled) setBySlot(null);
                }
            }["OpportunityRecordSectionRegistryActions.useEffect"]).finally({
                "OpportunityRecordSectionRegistryActions.useEffect": ()=>{
                    if (!cancelled) setLoading(false);
                }
            }["OpportunityRecordSectionRegistryActions.useEffect"]);
            return ({
                "OpportunityRecordSectionRegistryActions.useEffect": ()=>{
                    cancelled = true;
                }
            })["OpportunityRecordSectionRegistryActions.useEffect"];
        }
    }["OpportunityRecordSectionRegistryActions.useEffect"], [
        shouldLoad,
        opportunityId,
        sectionKey,
        departmentId,
        workUnitId
    ]);
    const primary = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "OpportunityRecordSectionRegistryActions.useMemo[primary]": ()=>filterSlot(bySlot?.primary, excludeActionKeys)
    }["OpportunityRecordSectionRegistryActions.useMemo[primary]"], [
        bySlot,
        excludeActionKeys
    ]);
    const secondary = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "OpportunityRecordSectionRegistryActions.useMemo[secondary]": ()=>filterSlot(bySlot?.secondary, excludeActionKeys)
    }["OpportunityRecordSectionRegistryActions.useMemo[secondary]"], [
        bySlot,
        excludeActionKeys
    ]);
    const overflow = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "OpportunityRecordSectionRegistryActions.useMemo[overflow]": ()=>filterSlot(bySlot?.overflow, excludeActionKeys)
    }["OpportunityRecordSectionRegistryActions.useMemo[overflow]"], [
        bySlot,
        excludeActionKeys
    ]);
    const onClick = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "OpportunityRecordSectionRegistryActions.useCallback[onClick]": async (resolved)=>{
            if (!canMutate) return;
            setBusyKey(resolved.key);
            try {
                const out = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$actions$2f$applyRegistryResolvedActionClient$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["applyRegistryResolvedActionClient"])(resolved, {
                    router,
                    openDrawer,
                    openForm,
                    departmentId: departmentId ?? null,
                    workUnitId: workUnitId ?? null,
                    entityId: opportunityId,
                    context: {
                        surface: "record_section",
                        section_key: sectionKey,
                        department_id: departmentId ?? null,
                        work_unit_id: workUnitId ?? null
                    }
                });
                if (out.ok) {
                    onExecutionResult?.(out.execution_result);
                    onApplied?.();
                }
            } finally{
                setBusyKey(null);
            }
        }
    }["OpportunityRecordSectionRegistryActions.useCallback[onClick]"], [
        canMutate,
        departmentId,
        opportunityId,
        onApplied,
        onExecutionResult,
        openDrawer,
        openForm,
        router,
        sectionKey,
        workUnitId
    ]);
    const n = primary.length + secondary.length + overflow.length;
    const primaryCls = "px-3 py-1.5 text-sm font-semibold rounded-md bg-alloy-blue text-white hover:opacity-90 disabled:opacity-50";
    const secondaryCls = "px-3 py-1.5 text-sm font-semibold rounded-md border border-alloy-stone/60 text-alloy-midnight/90 hover:bg-alloy-stone/15 disabled:opacity-50";
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        ref: mountRef,
        className: "mt-2 min-h-[2px]",
        "data-opportunity-record-section-actions-root": sectionKey,
        children: !shouldLoad ? null : loading ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "flex flex-wrap gap-2",
            "aria-busy": "true",
            "aria-label": "Loading section actions",
            "data-opportunity-record-section-actions-skeleton": sectionKey,
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "h-8 w-[7.5rem] animate-pulse rounded-md bg-alloy-stone/15"
                }, void 0, false, {
                    fileName: "[project]/components/admin/opportunity/OpportunityRecordSectionRegistryActions.tsx",
                    lineNumber: 202,
                    columnNumber: 21
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "h-8 w-[6.5rem] animate-pulse rounded-md bg-alloy-stone/12"
                }, void 0, false, {
                    fileName: "[project]/components/admin/opportunity/OpportunityRecordSectionRegistryActions.tsx",
                    lineNumber: 203,
                    columnNumber: 21
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/components/admin/opportunity/OpportunityRecordSectionRegistryActions.tsx",
            lineNumber: 196,
            columnNumber: 17
        }, this) : n === 0 ? null : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "flex flex-wrap gap-2",
            "data-opportunity-record-section-actions": sectionKey,
            children: [
                primary.map((a)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        type: "button",
                        disabled: !canMutate || busyKey != null,
                        onClick: ()=>void onClick(a),
                        className: primaryCls,
                        children: busyKey === a.key ? "…" : a.label
                    }, `${sectionKey}:p:${a.key}`, false, {
                        fileName: "[project]/components/admin/opportunity/OpportunityRecordSectionRegistryActions.tsx",
                        lineNumber: 208,
                        columnNumber: 25
                    }, this)),
                secondary.map((a)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        type: "button",
                        disabled: !canMutate || busyKey != null,
                        onClick: ()=>void onClick(a),
                        className: secondaryCls,
                        children: busyKey === a.key ? "…" : a.label
                    }, `${sectionKey}:s:${a.key}`, false, {
                        fileName: "[project]/components/admin/opportunity/OpportunityRecordSectionRegistryActions.tsx",
                        lineNumber: 219,
                        columnNumber: 25
                    }, this)),
                overflow.map((a)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        type: "button",
                        disabled: !canMutate || busyKey != null,
                        onClick: ()=>void onClick(a),
                        className: secondaryCls,
                        children: busyKey === a.key ? "…" : a.label
                    }, `${sectionKey}:o:${a.key}`, false, {
                        fileName: "[project]/components/admin/opportunity/OpportunityRecordSectionRegistryActions.tsx",
                        lineNumber: 230,
                        columnNumber: 25
                    }, this))
            ]
        }, void 0, true, {
            fileName: "[project]/components/admin/opportunity/OpportunityRecordSectionRegistryActions.tsx",
            lineNumber: 206,
            columnNumber: 17
        }, this)
    }, void 0, false, {
        fileName: "[project]/components/admin/opportunity/OpportunityRecordSectionRegistryActions.tsx",
        lineNumber: 194,
        columnNumber: 9
    }, this);
}
_s(OpportunityRecordSectionRegistryActions, "stUspc3sAVS6Zo4vZZe1jTV7G4A=");
_c = OpportunityRecordSectionRegistryActions;
var _c;
__turbopack_context__.k.register(_c, "OpportunityRecordSectionRegistryActions");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/components/admin/opportunity/OpportunityHouseholdPeoplePanel.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "OpportunityHouseholdPeoplePanel",
    ()=>OpportunityHouseholdPeoplePanel
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$polyfills$2f$process$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = /*#__PURE__*/ __turbopack_context__.i("[project]/node_modules/next/dist/build/polyfills/process.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$workspace$2f$AdminV2DrawerLoadingState$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/components/admin/workspace/AdminV2DrawerLoadingState.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$opportunity$2f$OpportunityRecordSectionRegistryActions$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/components/admin/opportunity/OpportunityRecordSectionRegistryActions.tsx [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
;
function OpportunityHouseholdPeoplePanel(props) {
    _s();
    const { opportunityId, customerId, canMutate, sectionKey, departmentId, workUnitId, router, openDrawer, openForm, refreshKey, recordHydrationPending } = props;
    const [loading, setLoading] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(true);
    const [error, setError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [people, setPeople] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])([]);
    const load = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "OpportunityHouseholdPeoplePanel.useCallback[load]": async ()=>{
            setLoading(true);
            setError(null);
            try {
                const timingEnabled = ("TURBOPACK compile-time value", "development") !== "production";
                const t0 = ("TURBOPACK compile-time truthy", 1) ? performance.now() : "TURBOPACK unreachable";
                const res = await fetch(`/api/admin/related/customer/${encodeURIComponent(customerId)}`, {
                    credentials: "include"
                });
                const json = await res.json().catch({
                    "OpportunityHouseholdPeoplePanel.useCallback[load]": ()=>({})
                }["OpportunityHouseholdPeoplePanel.useCallback[load]"]);
                if (!res.ok) throw new Error(json.error ?? "Failed to load household people");
                setPeople(Array.isArray(json.people) ? json.people : []);
                if ("TURBOPACK compile-time truthy", 1) {
                    console.info("[timing][drawer]", {
                        key: `opportunities:${opportunityId}`,
                        phase: "related_people_fetch",
                        url: `/api/admin/related/customer/${encodeURIComponent(customerId)}`,
                        ms: Math.round((performance.now() - t0) * 10) / 10
                    });
                }
            } catch (e) {
                setPeople([]);
                setError(e instanceof Error ? e.message : "Failed to load household people");
            } finally{
                setLoading(false);
            }
        }
    }["OpportunityHouseholdPeoplePanel.useCallback[load]"], [
        customerId
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "OpportunityHouseholdPeoplePanel.useEffect": ()=>{
            void load();
        }
    }["OpportunityHouseholdPeoplePanel.useEffect"], [
        load,
        refreshKey
    ]);
    const rows = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "OpportunityHouseholdPeoplePanel.useMemo[rows]": ()=>{
            return [
                ...people
            ].sort({
                "OpportunityHouseholdPeoplePanel.useMemo[rows]": (a, b)=>{
                    const ra = String(a.role_label ?? a.role_type ?? "");
                    const rb = String(b.role_label ?? b.role_type ?? "");
                    if (ra !== rb) return ra.localeCompare(rb);
                    return String(a._person_name ?? "").localeCompare(String(b._person_name ?? ""));
                }
            }["OpportunityHouseholdPeoplePanel.useMemo[rows]"]);
        }
    }["OpportunityHouseholdPeoplePanel.useMemo[rows]"], [
        people
    ]);
    const tinyLabel = "text-[11px] font-semibold uppercase tracking-wide text-alloy-forge/55";
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "space-y-2",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: tinyLabel,
                        children: "Household people"
                    }, void 0, false, {
                        fileName: "[project]/components/admin/opportunity/OpportunityHouseholdPeoplePanel.tsx",
                        lineNumber: 85,
                        columnNumber: 17
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "mt-1 text-xs text-alloy-forge/60",
                        children: "People linked to this household (via customer_persons)."
                    }, void 0, false, {
                        fileName: "[project]/components/admin/opportunity/OpportunityHouseholdPeoplePanel.tsx",
                        lineNumber: 86,
                        columnNumber: 17
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/admin/opportunity/OpportunityHouseholdPeoplePanel.tsx",
                lineNumber: 84,
                columnNumber: 13
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$opportunity$2f$OpportunityRecordSectionRegistryActions$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                opportunityId: opportunityId,
                sectionKey: sectionKey,
                departmentId: departmentId ?? null,
                workUnitId: workUnitId ?? null,
                canMutate: canMutate,
                router: router,
                openDrawer: openDrawer,
                openForm: openForm,
                onApplied: ()=>void load()
            }, void 0, false, {
                fileName: "[project]/components/admin/opportunity/OpportunityHouseholdPeoplePanel.tsx",
                lineNumber: 91,
                columnNumber: 13
            }, this),
            error ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "rounded-lg border border-alloy-ember/25 bg-alloy-ember/5 px-3 py-2 text-sm text-alloy-ember",
                children: error
            }, void 0, false, {
                fileName: "[project]/components/admin/opportunity/OpportunityHouseholdPeoplePanel.tsx",
                lineNumber: 104,
                columnNumber: 17
            }, this) : null,
            loading ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$workspace$2f$AdminV2DrawerLoadingState$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AdminV2DrawerLoadingState"], {
                density: "inline",
                title: "Loading household people",
                description: "Fetching people linked to this household.",
                className: "border-0 bg-transparent px-0 py-2 shadow-none ring-0"
            }, void 0, false, {
                fileName: "[project]/components/admin/opportunity/OpportunityHouseholdPeoplePanel.tsx",
                lineNumber: 110,
                columnNumber: 17
            }, this) : rows.length === 0 && recordHydrationPending ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$workspace$2f$AdminV2DrawerLoadingState$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AdminV2DrawerLoadingState"], {
                density: "inline",
                title: "Loading household people",
                description: "Additional links may still be merging into the full record.",
                className: "border-0 bg-transparent px-0 py-2 shadow-none ring-0"
            }, void 0, false, {
                fileName: "[project]/components/admin/opportunity/OpportunityHouseholdPeoplePanel.tsx",
                lineNumber: 117,
                columnNumber: 17
            }, this) : rows.length === 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "text-sm text-alloy-forge/60",
                children: "No linked people yet."
            }, void 0, false, {
                fileName: "[project]/components/admin/opportunity/OpportunityHouseholdPeoplePanel.tsx",
                lineNumber: 124,
                columnNumber: 17
            }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "space-y-2",
                children: rows.map((r)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "rounded-lg border border-alloy-stone/15 bg-white/70 px-3 py-2",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex items-start justify-between gap-2",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                        type: "button",
                                        onClick: ()=>openDrawer({
                                                type: "persons",
                                                id: r.person_id
                                            }),
                                        className: "min-w-0 truncate text-left text-[13px] font-semibold text-alloy-blue hover:underline",
                                        children: r._person_name?.trim() || "Person"
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/opportunity/OpportunityHouseholdPeoplePanel.tsx",
                                        lineNumber: 133,
                                        columnNumber: 33
                                    }, this),
                                    r.role_label || r.role_type ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "shrink-0 rounded-full border border-alloy-stone/20 bg-white px-2 py-0.5 text-[11px] font-semibold text-alloy-midnight/70",
                                        children: String(r.role_label ?? r.role_type)
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/opportunity/OpportunityHouseholdPeoplePanel.tsx",
                                        lineNumber: 141,
                                        columnNumber: 37
                                    }, this) : null
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/admin/opportunity/OpportunityHouseholdPeoplePanel.tsx",
                                lineNumber: 132,
                                columnNumber: 29
                            }, this),
                            r._person_email || r._person_phone ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "mt-1 text-[12px] text-alloy-midnight/65",
                                children: [
                                    r._person_email,
                                    r._person_phone
                                ].filter(Boolean).join(" · ")
                            }, void 0, false, {
                                fileName: "[project]/components/admin/opportunity/OpportunityHouseholdPeoplePanel.tsx",
                                lineNumber: 147,
                                columnNumber: 33
                            }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "mt-1 text-[12px] text-alloy-midnight/45",
                                children: "No contact info."
                            }, void 0, false, {
                                fileName: "[project]/components/admin/opportunity/OpportunityHouseholdPeoplePanel.tsx",
                                lineNumber: 151,
                                columnNumber: 33
                            }, this)
                        ]
                    }, r.id, true, {
                        fileName: "[project]/components/admin/opportunity/OpportunityHouseholdPeoplePanel.tsx",
                        lineNumber: 128,
                        columnNumber: 25
                    }, this))
            }, void 0, false, {
                fileName: "[project]/components/admin/opportunity/OpportunityHouseholdPeoplePanel.tsx",
                lineNumber: 126,
                columnNumber: 17
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/components/admin/opportunity/OpportunityHouseholdPeoplePanel.tsx",
        lineNumber: 83,
        columnNumber: 9
    }, this);
}
_s(OpportunityHouseholdPeoplePanel, "a0284aFEH05uiyfttLdGdVxJs30=");
_c = OpportunityHouseholdPeoplePanel;
var _c;
__turbopack_context__.k.register(_c, "OpportunityHouseholdPeoplePanel");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/components/admin/opportunity/FamilyContactsPanel.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "FamilyContactsPanel",
    ()=>FamilyContactsPanel
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$polyfills$2f$process$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = /*#__PURE__*/ __turbopack_context__.i("[project]/node_modules/next/dist/build/polyfills/process.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$opportunity$2f$OpportunityRecordSectionRegistryActions$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/components/admin/opportunity/OpportunityRecordSectionRegistryActions.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminFormatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/adminFormatters.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$workspace$2f$AdminV2DrawerLoadingState$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/components/admin/workspace/AdminV2DrawerLoadingState.tsx [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
;
;
/** Humanize stored role keys (e.g. family_member → Family member). Data stays authoritative; no hardcoded role enums. */ function formatRoleTypeLabel(key) {
    const s = key.trim();
    if (!s || s === "—") return s || "—";
    if (/\s/.test(s)) {
        return s.split(/\s+/).map((w)=>w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w).join(" ");
    }
    const words = s.split(/[_.-]+/).filter(Boolean);
    if (words.length === 0) return s;
    return words.map((w)=>w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}
function FamilyContactsPanel(props) {
    _s();
    const { opportunityId, record, canMutate, sectionKey, departmentId, workUnitId, excludeActionKeys, router, openDrawer, openForm, onRegistryApplied, refreshKey, recordHydrationPending = false, variant = "default" } = props;
    const timingEnabled = ("TURBOPACK compile-time falsy", 0) ? "TURBOPACK unreachable" : ("TURBOPACK compile-time value", "development") !== "production" || /staging|localhost|127\.0\.0\.1/i.test(window.location.hostname);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "FamilyContactsPanel.useEffect": ()=>{
            if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
            ;
            console.info("[timing][drawer]", {
                key: `opportunities:${opportunityId}`,
                phase: "family_contacts_panel_mount",
                section_key: sectionKey,
                variant
            });
        }
    }["FamilyContactsPanel.useEffect"], [
        opportunityId,
        sectionKey,
        variant,
        timingEnabled
    ]);
    const primaryPersonId = record.primary_person_id != null ? String(record.primary_person_id).trim() : "";
    const primaryName = record._primary_person_name != null ? String(record._primary_person_name).trim() : "";
    const primaryEmail = record._primary_person_email != null ? String(record._primary_person_email) : null;
    const primaryPhone = record._primary_person_phone != null ? String(record._primary_person_phone) : null;
    const rows = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "FamilyContactsPanel.useMemo[rows]": ()=>{
            const raw = record._opportunity_persons ?? [];
            if (!Array.isArray(raw)) return [];
            return raw.map({
                "FamilyContactsPanel.useMemo[rows]": (x)=>{
                    const r = x;
                    return {
                        id: String(r.id ?? ""),
                        person_id: String(r.person_id ?? ""),
                        role_type: String(r.role_type ?? "—"),
                        name: r.name != null ? String(r.name) : null,
                        phone: r.phone != null ? String(r.phone) : null,
                        email: r.email != null ? String(r.email) : null
                    };
                }
            }["FamilyContactsPanel.useMemo[rows]"]).filter({
                "FamilyContactsPanel.useMemo[rows]": (r)=>r.id && r.person_id
            }["FamilyContactsPanel.useMemo[rows]"]);
        }
    }["FamilyContactsPanel.useMemo[rows]"], [
        record._opportunity_persons,
        refreshKey
    ]);
    const sorted = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "FamilyContactsPanel.useMemo[sorted]": ()=>{
            const filtered = primaryPersonId ? rows.filter({
                "FamilyContactsPanel.useMemo[sorted]": (r)=>String(r.person_id).trim() !== primaryPersonId
            }["FamilyContactsPanel.useMemo[sorted]"]) : rows;
            return [
                ...filtered
            ].sort({
                "FamilyContactsPanel.useMemo[sorted]": (a, b)=>{
                    const ra = String(a.role_type ?? "");
                    const rb = String(b.role_type ?? "");
                    if (ra !== rb) return ra.localeCompare(rb);
                    return String(a.name ?? "").localeCompare(String(b.name ?? ""));
                }
            }["FamilyContactsPanel.useMemo[sorted]"]);
        }
    }["FamilyContactsPanel.useMemo[sorted]"], [
        rows,
        primaryPersonId
    ]);
    const tinyLabel = variant === "summary" ? "mb-0.5 text-[8px] font-semibold uppercase tracking-[0.12em] text-alloy-midnight/45" : "text-[11px] font-semibold uppercase tracking-wide text-alloy-forge/55";
    const cardPad = variant === "summary" ? "px-2 py-1.5" : "px-3 py-2.5";
    const nameLink = variant === "summary" ? "text-left text-[12px] font-semibold text-alloy-blue hover:underline" : "text-left text-[15px] font-semibold leading-snug text-alloy-blue hover:underline";
    const contactRow = variant === "summary" ? "mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-alloy-midnight/70" : "mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-alloy-midnight/80";
    const contactMuted = variant === "summary" ? "text-alloy-midnight/45" : "text-alloy-midnight/50";
    const contactLink = variant === "summary" ? "font-semibold text-alloy-blue hover:underline underline-offset-2" : "font-semibold text-alloy-blue hover:underline underline-offset-2";
    const roleBadge = variant === "summary" ? "inline-flex max-w-[9.5rem] items-center rounded-full border border-alloy-stone/20 bg-alloy-stone/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-alloy-midnight/70" : "inline-flex max-w-[11rem] items-center rounded-full border border-alloy-blue/20 bg-alloy-blue/[0.07] px-2.5 py-0.5 text-[11px] font-semibold text-alloy-midnight/85";
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: variant === "summary" ? "space-y-2" : "space-y-3",
        "data-family-contacts-panel": sectionKey,
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                children: [
                    variant === "default" ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: tinyLabel,
                        children: "Primary person"
                    }, void 0, false, {
                        fileName: "[project]/components/admin/opportunity/FamilyContactsPanel.tsx",
                        lineNumber: 147,
                        columnNumber: 42
                    }, this) : null,
                    primaryPersonId ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: `mt-1 rounded-lg border border-alloy-stone/20 bg-white shadow-sm ring-1 ring-alloy-stone/[0.06] ${cardPad}`,
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                type: "button",
                                onClick: ()=>openDrawer({
                                        type: "persons",
                                        id: primaryPersonId
                                    }),
                                className: nameLink,
                                children: primaryName && primaryName !== "—" ? primaryName : "View person"
                            }, void 0, false, {
                                fileName: "[project]/components/admin/opportunity/FamilyContactsPanel.tsx",
                                lineNumber: 150,
                                columnNumber: 25
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: contactRow,
                                children: [
                                    primaryPhone ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "tabular-nums",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: contactMuted,
                                                children: "Phone "
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/opportunity/FamilyContactsPanel.tsx",
                                                lineNumber: 156,
                                                columnNumber: 37
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                                                className: contactLink,
                                                href: `tel:${primaryPhone}`,
                                                children: (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminFormatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatPhoneUS"])(primaryPhone)
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/opportunity/FamilyContactsPanel.tsx",
                                                lineNumber: 157,
                                                columnNumber: 37
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/components/admin/opportunity/FamilyContactsPanel.tsx",
                                        lineNumber: 155,
                                        columnNumber: 33
                                    }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: contactMuted,
                                        children: "Phone —"
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/opportunity/FamilyContactsPanel.tsx",
                                        lineNumber: 162,
                                        columnNumber: 33
                                    }, this),
                                    primaryEmail ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "min-w-0 truncate",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: contactMuted,
                                                children: "Email "
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/opportunity/FamilyContactsPanel.tsx",
                                                lineNumber: 166,
                                                columnNumber: 37
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                                                className: contactLink,
                                                href: `mailto:${primaryEmail}`,
                                                children: primaryEmail
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/opportunity/FamilyContactsPanel.tsx",
                                                lineNumber: 167,
                                                columnNumber: 37
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/components/admin/opportunity/FamilyContactsPanel.tsx",
                                        lineNumber: 165,
                                        columnNumber: 33
                                    }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: contactMuted,
                                        children: "Email —"
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/opportunity/FamilyContactsPanel.tsx",
                                        lineNumber: 172,
                                        columnNumber: 33
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/admin/opportunity/FamilyContactsPanel.tsx",
                                lineNumber: 153,
                                columnNumber: 25
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/admin/opportunity/FamilyContactsPanel.tsx",
                        lineNumber: 149,
                        columnNumber: 21
                    }, this) : recordHydrationPending ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$workspace$2f$AdminV2DrawerLoadingState$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AdminV2DrawerLoadingState"], {
                        density: "micro",
                        showTrack: false,
                        title: "Loading primary contact",
                        description: "Person details arrive with the full record.",
                        className: "mt-1 border-0 bg-transparent px-0 py-1 shadow-none ring-0"
                    }, void 0, false, {
                        fileName: "[project]/components/admin/opportunity/FamilyContactsPanel.tsx",
                        lineNumber: 177,
                        columnNumber: 21
                    }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: `mt-1 ${variant === "summary" ? "text-[12px] text-alloy-midnight/55" : "text-sm text-alloy-forge/60"}`,
                        children: "No primary person on this opportunity."
                    }, void 0, false, {
                        fileName: "[project]/components/admin/opportunity/FamilyContactsPanel.tsx",
                        lineNumber: 185,
                        columnNumber: 21
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/admin/opportunity/FamilyContactsPanel.tsx",
                lineNumber: 146,
                columnNumber: 13
            }, this),
            variant === "default" ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: tinyLabel,
                        children: "Opportunity people"
                    }, void 0, false, {
                        fileName: "[project]/components/admin/opportunity/FamilyContactsPanel.tsx",
                        lineNumber: 193,
                        columnNumber: 21
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "mt-0.5 text-xs text-alloy-forge/60",
                        children: "Linked on this inquiry only (opportunity_persons)."
                    }, void 0, false, {
                        fileName: "[project]/components/admin/opportunity/FamilyContactsPanel.tsx",
                        lineNumber: 194,
                        columnNumber: 21
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/admin/opportunity/FamilyContactsPanel.tsx",
                lineNumber: 192,
                columnNumber: 17
            }, this) : null,
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$opportunity$2f$OpportunityRecordSectionRegistryActions$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                opportunityId: opportunityId,
                sectionKey: sectionKey,
                departmentId: departmentId ?? null,
                workUnitId: workUnitId ?? null,
                excludeActionKeys: excludeActionKeys,
                canMutate: canMutate,
                router: router,
                openDrawer: openDrawer,
                openForm: openForm,
                onApplied: onRegistryApplied
            }, void 0, false, {
                fileName: "[project]/components/admin/opportunity/FamilyContactsPanel.tsx",
                lineNumber: 198,
                columnNumber: 13
            }, this),
            sorted.length === 0 ? recordHydrationPending ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$workspace$2f$AdminV2DrawerLoadingState$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AdminV2DrawerLoadingState"], {
                density: "inline",
                title: "Loading family & opportunity people",
                description: "Relationship rows populate after the record fully hydrates.",
                className: "border-0 bg-transparent px-0 py-2 shadow-none ring-0"
            }, void 0, false, {
                fileName: "[project]/components/admin/opportunity/FamilyContactsPanel.tsx",
                lineNumber: 213,
                columnNumber: 21
            }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: variant === "summary" ? "text-[12px] text-alloy-midnight/55" : "text-sm text-alloy-forge/60",
                children: "No additional people linked yet."
            }, void 0, false, {
                fileName: "[project]/components/admin/opportunity/FamilyContactsPanel.tsx",
                lineNumber: 220,
                columnNumber: 21
            }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                className: `${variant === "summary" ? "space-y-1.5" : "space-y-2.5"} list-none`,
                children: sorted.map((r)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                        className: `rounded-lg border border-alloy-stone/20 bg-white shadow-sm ring-1 ring-alloy-stone/[0.06] ${cardPad}`,
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex flex-wrap items-start justify-between gap-2",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                        type: "button",
                                        onClick: ()=>openDrawer({
                                                type: "persons",
                                                id: r.person_id
                                            }),
                                        className: `min-w-0 flex-1 truncate ${nameLink}`,
                                        children: r.name && r.name.trim() ? r.name : "View person"
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/opportunity/FamilyContactsPanel.tsx",
                                        lineNumber: 232,
                                        columnNumber: 33
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: roleBadge,
                                        title: r.role_type,
                                        children: formatRoleTypeLabel(r.role_type)
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/opportunity/FamilyContactsPanel.tsx",
                                        lineNumber: 239,
                                        columnNumber: 33
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/admin/opportunity/FamilyContactsPanel.tsx",
                                lineNumber: 231,
                                columnNumber: 29
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: contactRow,
                                children: [
                                    r.phone ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "tabular-nums",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: contactMuted,
                                                children: "Phone "
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/opportunity/FamilyContactsPanel.tsx",
                                                lineNumber: 246,
                                                columnNumber: 41
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                                                className: contactLink,
                                                href: `tel:${r.phone}`,
                                                children: (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminFormatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatPhoneUS"])(r.phone)
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/opportunity/FamilyContactsPanel.tsx",
                                                lineNumber: 247,
                                                columnNumber: 41
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/components/admin/opportunity/FamilyContactsPanel.tsx",
                                        lineNumber: 245,
                                        columnNumber: 37
                                    }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: contactMuted,
                                        children: "Phone —"
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/opportunity/FamilyContactsPanel.tsx",
                                        lineNumber: 252,
                                        columnNumber: 37
                                    }, this),
                                    r.email ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "min-w-0 truncate",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: contactMuted,
                                                children: "Email "
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/opportunity/FamilyContactsPanel.tsx",
                                                lineNumber: 256,
                                                columnNumber: 41
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                                                className: contactLink,
                                                href: `mailto:${r.email}`,
                                                children: r.email
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/opportunity/FamilyContactsPanel.tsx",
                                                lineNumber: 257,
                                                columnNumber: 41
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/components/admin/opportunity/FamilyContactsPanel.tsx",
                                        lineNumber: 255,
                                        columnNumber: 37
                                    }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: contactMuted,
                                        children: "Email —"
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/opportunity/FamilyContactsPanel.tsx",
                                        lineNumber: 262,
                                        columnNumber: 37
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/admin/opportunity/FamilyContactsPanel.tsx",
                                lineNumber: 243,
                                columnNumber: 29
                            }, this)
                        ]
                    }, r.id, true, {
                        fileName: "[project]/components/admin/opportunity/FamilyContactsPanel.tsx",
                        lineNumber: 227,
                        columnNumber: 25
                    }, this))
            }, void 0, false, {
                fileName: "[project]/components/admin/opportunity/FamilyContactsPanel.tsx",
                lineNumber: 225,
                columnNumber: 17
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/components/admin/opportunity/FamilyContactsPanel.tsx",
        lineNumber: 145,
        columnNumber: 9
    }, this);
}
_s(FamilyContactsPanel, "1AIDXdSpj7JdUY2VAZYkFRivwF8=");
_c = FamilyContactsPanel;
var _c;
__turbopack_context__.k.register(_c, "FamilyContactsPanel");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/components/admin/opportunity/OpportunityInquiryChildrenRegistryActions.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "OpportunityInquiryChildrenRegistryActions",
    ()=>OpportunityInquiryChildrenRegistryActions
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$polyfills$2f$process$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = /*#__PURE__*/ __turbopack_context__.i("[project]/node_modules/next/dist/build/polyfills/process.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$workspaceAdminFetchDedupe$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/workspace/workspaceAdminFetchDedupe.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$workspaceDataFetch$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/workspace/workspaceDataFetch.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$actions$2f$applyRegistryResolvedActionClient$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/actions/applyRegistryResolvedActionClient.ts [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
;
;
function OpportunityInquiryChildrenRegistryActions(props) {
    _s();
    const { opportunityId, childrenCount, canMutate, router, openDrawer, openForm } = props;
    const [bySlot, setBySlot] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [loading, setLoading] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(true);
    const [busyKey, setBusyKey] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "OpportunityInquiryChildrenRegistryActions.useEffect": ()=>{
            let cancelled = false;
            setLoading(true);
            const qs = new URLSearchParams({
                surface: "record_section",
                entity_type: "opportunity",
                entity_id: opportunityId,
                section_key: "inquiry_children"
            });
            const url = `/api/admin/actions?${qs.toString()}`;
            const timingEnabled = ("TURBOPACK compile-time value", "development") !== "production";
            const t0 = ("TURBOPACK compile-time truthy", 1) ? performance.now() : "TURBOPACK unreachable";
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$workspaceAdminFetchDedupe$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["dedupeAdminFetchWithTtl"])(url, (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$workspaceDataFetch$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["workspaceDataFetchInit"])(), 1500).then({
                "OpportunityInquiryChildrenRegistryActions.useEffect": (r)=>r.json()
            }["OpportunityInquiryChildrenRegistryActions.useEffect"]).then({
                "OpportunityInquiryChildrenRegistryActions.useEffect": (j)=>{
                    if (!cancelled) setBySlot(j.actions ?? null);
                    if ("TURBOPACK compile-time truthy", 1) {
                        console.info("[timing][drawer]", {
                            key: `opportunities:${opportunityId}`,
                            phase: "inquiry_children_record_section_actions_fetch",
                            section_key: "inquiry_children",
                            url,
                            ms: Math.round((performance.now() - t0) * 10) / 10
                        });
                    }
                }
            }["OpportunityInquiryChildrenRegistryActions.useEffect"]).catch({
                "OpportunityInquiryChildrenRegistryActions.useEffect": ()=>{
                    if (!cancelled) setBySlot(null);
                }
            }["OpportunityInquiryChildrenRegistryActions.useEffect"]).finally({
                "OpportunityInquiryChildrenRegistryActions.useEffect": ()=>{
                    if (!cancelled) setLoading(false);
                }
            }["OpportunityInquiryChildrenRegistryActions.useEffect"]);
            return ({
                "OpportunityInquiryChildrenRegistryActions.useEffect": ()=>{
                    cancelled = true;
                }
            })["OpportunityInquiryChildrenRegistryActions.useEffect"];
        }
    }["OpportunityInquiryChildrenRegistryActions.useEffect"], [
        opportunityId
    ]);
    const chosen = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "OpportunityInquiryChildrenRegistryActions.useMemo[chosen]": ()=>{
            const all = [
                ...bySlot?.primary ?? [],
                ...bySlot?.secondary ?? [],
                ...bySlot?.overflow ?? []
            ];
            const want = childrenCount > 0 ? "add_sibling" : "add_child";
            return all.find({
                "OpportunityInquiryChildrenRegistryActions.useMemo[chosen]": (a)=>a.key === want
            }["OpportunityInquiryChildrenRegistryActions.useMemo[chosen]"]) ?? null;
        }
    }["OpportunityInquiryChildrenRegistryActions.useMemo[chosen]"], [
        bySlot,
        childrenCount
    ]);
    if (loading) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "h-9 w-[10.5rem] animate-pulse rounded-md bg-alloy-stone/12",
            "aria-busy": "true",
            "aria-label": "Loading inquiry actions",
            "data-inquiry-children-registry-action-skeleton": "true"
        }, void 0, false, {
            fileName: "[project]/components/admin/opportunity/OpportunityInquiryChildrenRegistryActions.tsx",
            lineNumber: 77,
            columnNumber: 13
        }, this);
    }
    if (!chosen) return null;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
        type: "button",
        disabled: !canMutate || busyKey != null,
        onClick: async ()=>{
            if (!canMutate) return;
            setBusyKey(chosen.key);
            try {
                await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$actions$2f$applyRegistryResolvedActionClient$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["applyRegistryResolvedActionClient"])(chosen, {
                    router,
                    openDrawer,
                    openForm,
                    entityId: opportunityId,
                    context: {
                        surface: "record_section",
                        section_key: "inquiry_children"
                    }
                });
            } finally{
                setBusyKey(null);
            }
        },
        className: "rounded-md border border-alloy-blue/30 bg-alloy-blue/5 px-3 py-1.5 text-sm font-semibold text-alloy-blue hover:bg-alloy-blue/10 hover:border-alloy-blue/45 disabled:opacity-50",
        "data-inquiry-children-registry-action": chosen.key,
        children: busyKey === chosen.key ? "…" : chosen.label
    }, void 0, false, {
        fileName: "[project]/components/admin/opportunity/OpportunityInquiryChildrenRegistryActions.tsx",
        lineNumber: 88,
        columnNumber: 9
    }, this);
}
_s(OpportunityInquiryChildrenRegistryActions, "qu0yUUPof8dJwAsfYJt7h3M7fTY=");
_c = OpportunityInquiryChildrenRegistryActions;
var _c;
__turbopack_context__.k.register(_c, "OpportunityInquiryChildrenRegistryActions");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
]);

//# sourceMappingURL=components_admin_opportunity_a6a9ce4b._.js.map