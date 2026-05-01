module.exports = [
"[project]/components/admin/entity/EntityDrawerSection.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>EntityDrawerSection
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
"use client";
;
;
const SECTION_HEADER_CLASS = "rounded-t-md bg-alloy-stone/30 border-b border-admin-border px-3 py-2 mb-3 text-xs font-semibold uppercase tracking-wider text-alloy-forge";
/** Pine accent — aligned with inquiry workflow snapshot header cards. */ const PREMIUM_SECTION = "rounded-lg border border-alloy-stone/20 border-l-[3px] border-l-[rgb(0,162,131)] bg-white/90 shadow-sm shadow-alloy-stone/10 ring-1 ring-alloy-stone/10 overflow-hidden";
const PREMIUM_HEADER_STATIC = "border-b border-alloy-stone/15 bg-alloy-stone/[0.05] px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-alloy-forge/80";
function EntityDrawerSection({ config, children, headerRight, defaultExpanded, className = "", surface = "default" }) {
    const isPremium = surface === "premium";
    const isCollapsible = config.collapsible ?? false;
    const [expanded, setExpanded] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(defaultExpanded ?? config.defaultExpanded ?? false);
    const showContent = !isCollapsible || expanded;
    const gridCols = config.gridCols === 2 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1";
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
        className: `${isPremium ? `mb-5 ${PREMIUM_SECTION} ${isCollapsible && !expanded ? "shadow-md shadow-alloy-stone/15" : ""}` : "mb-6"} ${className}`,
        "data-entity-section": true,
        "data-section-key": config.key,
        "data-section-surface": surface,
        children: [
            isCollapsible ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: isPremium ? "flex w-full min-w-0 items-stretch border-b border-alloy-stone/15 bg-alloy-stone/[0.05]" : `flex w-full min-w-0 items-stretch rounded-t-md bg-alloy-stone/30 border-b border-admin-border mb-3 text-xs font-semibold uppercase tracking-wider text-alloy-forge`,
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        type: "button",
                        onClick: ()=>setExpanded((e)=>!e),
                        className: `entity-drawer-section-toggle flex min-h-0 min-w-0 flex-1 items-center justify-between gap-2 text-left transition-colors duration-150 ${isPremium ? "border-0 bg-transparent px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-alloy-forge/80 hover:bg-alloy-stone/10" : "border-0 bg-transparent px-3 py-2 hover:bg-alloy-stone/25"}`,
                        "aria-expanded": expanded,
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "min-w-0 truncate",
                                children: config.title
                            }, void 0, false, {
                                fileName: "[project]/components/admin/entity/EntityDrawerSection.tsx",
                                lineNumber: 73,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "shrink-0 text-alloy-muted transition-opacity duration-150",
                                "aria-hidden": true,
                                children: expanded ? "−" : "+"
                            }, void 0, false, {
                                fileName: "[project]/components/admin/entity/EntityDrawerSection.tsx",
                                lineNumber: 74,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/admin/entity/EntityDrawerSection.tsx",
                        lineNumber: 63,
                        columnNumber: 11
                    }, this),
                    headerRight ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: `flex shrink-0 items-center gap-2 self-center px-3 normal-case tracking-normal ${isPremium ? "py-2.5" : "py-2"}`,
                        children: headerRight
                    }, void 0, false, {
                        fileName: "[project]/components/admin/entity/EntityDrawerSection.tsx",
                        lineNumber: 79,
                        columnNumber: 13
                    }, this) : null
                ]
            }, void 0, true, {
                fileName: "[project]/components/admin/entity/EntityDrawerSection.tsx",
                lineNumber: 56,
                columnNumber: 9
            }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: isPremium ? PREMIUM_HEADER_STATIC : SECTION_HEADER_CLASS,
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "flex items-center gap-2",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "truncate",
                            children: config.title
                        }, void 0, false, {
                            fileName: "[project]/components/admin/entity/EntityDrawerSection.tsx",
                            lineNumber: 91,
                            columnNumber: 13
                        }, this),
                        headerRight ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "shrink-0 normal-case tracking-normal",
                            children: headerRight
                        }, void 0, false, {
                            fileName: "[project]/components/admin/entity/EntityDrawerSection.tsx",
                            lineNumber: 92,
                            columnNumber: 28
                        }, this) : null
                    ]
                }, void 0, true, {
                    fileName: "[project]/components/admin/entity/EntityDrawerSection.tsx",
                    lineNumber: 90,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/components/admin/entity/EntityDrawerSection.tsx",
                lineNumber: 89,
                columnNumber: 9
            }, this),
            showContent && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: isPremium ? `min-w-0 w-full px-3 pb-3 pt-2.5 grid gap-x-4 gap-y-2 ${gridCols} [&>*]:min-w-0` : `grid gap-x-4 gap-y-2 ${gridCols} ${isCollapsible ? "mt-2" : "mt-3"}`,
                children: children
            }, void 0, false, {
                fileName: "[project]/components/admin/entity/EntityDrawerSection.tsx",
                lineNumber: 97,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/components/admin/entity/EntityDrawerSection.tsx",
        lineNumber: 45,
        columnNumber: 5
    }, this);
}
}),
"[project]/components/admin/entity/EntityDrawerField.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>EntityDrawerField
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
"use client";
;
const LABEL_DEFAULT = "block text-xs font-medium text-alloy-midnight/80 mb-1";
/** Schedule/job record snapshot rows — subtle label, emphasized value (aligned with JobRecordModalV2 snapshot cells). */ const LABEL_COMPACT = "block text-[10px] font-semibold uppercase tracking-[0.08em] text-alloy-forge/65 mb-0.5";
const VALUE_DEFAULT = "text-sm text-alloy-forge min-h-[2rem] flex items-center";
const VALUE_COMPACT = "text-sm font-medium text-alloy-midnight/90 min-h-[1.375rem] flex items-center leading-snug";
/** Schedule snapshot row tiers — aligns with JobRecordModalV2 snapshot rhythm */ const VALUE_COMPACT_PRIMARY = "text-[15px] font-semibold tracking-tight text-alloy-midnight min-h-[1.5rem] flex items-center leading-snug";
const VALUE_COMPACT_SECONDARY = VALUE_COMPACT;
const VALUE_COMPACT_SUPPORTING = "text-xs font-normal text-alloy-forge/80 min-h-[1.25rem] flex items-center leading-snug";
const VALUE_EDIT_WRAP = "min-h-[2rem] flex items-stretch";
const VALUE_EDIT_WRAP_COMPACT = "min-h-[1.375rem] flex items-stretch";
const VALUE_EDIT_WRAP_COMPACT_PRIMARY = "min-h-[1.5rem] flex items-stretch";
const VALUE_EDIT_WRAP_COMPACT_SUPPORTING = "min-h-[1.25rem] flex items-stretch";
function EntityDrawerField({ label, value, span = 1, editNode, isEditing, className = "", density = "default", showLabel = true, valueEmphasis }) {
    const showEdit = isEditing && editNode != null;
    const compact = density === "compact";
    const valueCompactClass = compact && valueEmphasis === "primary" ? VALUE_COMPACT_PRIMARY : compact && valueEmphasis === "supporting" ? VALUE_COMPACT_SUPPORTING : compact && valueEmphasis === "secondary" ? VALUE_COMPACT_SECONDARY : compact ? VALUE_COMPACT : VALUE_DEFAULT;
    const editWrapCompactClass = compact && valueEmphasis === "primary" ? VALUE_EDIT_WRAP_COMPACT_PRIMARY : compact && valueEmphasis === "supporting" ? VALUE_EDIT_WRAP_COMPACT_SUPPORTING : VALUE_EDIT_WRAP_COMPACT;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: `${span === 2 ? "col-span-2" : ""} ${className}`,
        "data-entity-field": true,
        "data-field-density": compact ? "compact" : "default",
        "data-span": span,
        children: [
            showLabel ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                className: compact ? LABEL_COMPACT : LABEL_DEFAULT,
                children: label
            }, void 0, false, {
                fileName: "[project]/components/admin/entity/EntityDrawerField.tsx",
                lineNumber: 80,
                columnNumber: 20
            }, this) : null,
            showEdit ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: compact ? editWrapCompactClass : VALUE_EDIT_WRAP,
                children: editNode
            }, void 0, false, {
                fileName: "[project]/components/admin/entity/EntityDrawerField.tsx",
                lineNumber: 82,
                columnNumber: 9
            }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: compact ? valueCompactClass : VALUE_DEFAULT,
                children: value ?? "—"
            }, void 0, false, {
                fileName: "[project]/components/admin/entity/EntityDrawerField.tsx",
                lineNumber: 84,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/components/admin/entity/EntityDrawerField.tsx",
        lineNumber: 74,
        columnNumber: 5
    }, this);
}
}),
"[project]/components/admin/entity/EntityDrawerOverview.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>EntityDrawerOverview
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$entityPresentation$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/entityPresentation.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminFormatters$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/adminFormatters.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$StatusBadge$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/components/admin/StatusBadge.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$entity$2f$EntityDrawerSection$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/components/admin/entity/EntityDrawerSection.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$entity$2f$EntityDrawerField$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/components/admin/entity/EntityDrawerField.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$overviewRelationshipLabels$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/overviewRelationshipLabels.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$scheduleOverviewLabels$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/scheduleOverviewLabels.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$scheduleCanceledStatus$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/scheduleCanceledStatus.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$scheduleOverviewRows$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/scheduleOverviewRows.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$scheduleFieldPresentation$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/scheduleFieldPresentation.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$scheduleRecordSnapshot$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/scheduleRecordSnapshot.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$recordChrome$2f$scheduleLayoutConfig$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/recordChrome/scheduleLayoutConfig.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$drawer$2f$ScheduleSnapCell$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/components/admin/drawer/ScheduleSnapCell.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$opportunityOverviewLabels$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/opportunityOverviewLabels.ts [app-ssr] (ecmascript)");
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
const INLINE_EDIT_INPUT = "w-full rounded border border-admin-border bg-white px-2 py-1.5 text-sm text-alloy-forge focus:border-alloy-blue focus:outline-none focus:ring-1 focus:ring-alloy-blue/20 disabled:opacity-60";
const INLINE_EDIT_SELECT = "w-full rounded border border-admin-border bg-white px-2 py-1.5 text-sm text-alloy-forge focus:border-alloy-blue focus:outline-none disabled:opacity-60";
function isNoiseStatusToken(s) {
    if (s == null) return true;
    const t = String(s).trim().toLowerCase();
    return t === "" || t === "none" || t === "null" || t === "undefined";
}
function formatFieldValue(value, field, getStatusLabel, record, onOpenDrawer, presentationEntityType) {
    const hint = field.renderHint ?? "text";
    const key = field.key;
    if (hint === "status") {
        if (presentationEntityType === "opportunities" && record) {
            const oppLine = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$opportunityOverviewLabels$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["opportunityOverviewStatusBadgeLabel"])(record);
            if (oppLine) {
                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$StatusBadge$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["StatusBadge"], {
                    label: oppLine,
                    variant: "default"
                }, void 0, false, {
                    fileName: "[project]/components/admin/entity/EntityDrawerOverview.tsx",
                    lineNumber: 91,
                    columnNumber: 16
                }, this);
            }
        }
        const dispRaw = record?._status_display != null ? String(record._status_display).trim() : "";
        if (dispRaw && !isNoiseStatusToken(dispRaw)) {
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$StatusBadge$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["StatusBadge"], {
                label: dispRaw,
                variant: "default"
            }, void 0, false, {
                fileName: "[project]/components/admin/entity/EntityDrawerOverview.tsx",
                lineNumber: 96,
                columnNumber: 14
            }, this);
        }
        const fromValue = value != null && String(value).trim() !== "" ? String(value).trim() : "";
        const fromRecord = record?.status_key != null ? String(record.status_key).trim() : "";
        const rawKey = !isNoiseStatusToken(fromValue) ? fromValue : !isNoiseStatusToken(fromRecord) ? fromRecord : "";
        if (presentationEntityType === "locations") {
            const defLabel = rawKey ? getStatusLabel?.(rawKey) ?? rawKey : "";
            const label = !isNoiseStatusToken(defLabel) ? defLabel : "Active";
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$StatusBadge$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["StatusBadge"], {
                label: label,
                variant: "default"
            }, void 0, false, {
                fileName: "[project]/components/admin/entity/EntityDrawerOverview.tsx",
                lineNumber: 105,
                columnNumber: 14
            }, this);
        }
        if (presentationEntityType === "schedules") {
            const defLabel = rawKey ? getStatusLabel?.(rawKey) ?? rawKey : "";
            const label = !isNoiseStatusToken(defLabel) ? defLabel : "—";
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$StatusBadge$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["StatusBadge"], {
                label: label,
                variant: "default"
            }, void 0, false, {
                fileName: "[project]/components/admin/entity/EntityDrawerOverview.tsx",
                lineNumber: 110,
                columnNumber: 14
            }, this);
        }
        const s = rawKey;
        const label = (getStatusLabel?.(s) ?? s) || "—";
        const clean = isNoiseStatusToken(label) ? "—" : label;
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$StatusBadge$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["StatusBadge"], {
            label: clean,
            variant: "default"
        }, void 0, false, {
            fileName: "[project]/components/admin/entity/EntityDrawerOverview.tsx",
            lineNumber: 116,
            columnNumber: 12
        }, this);
    }
    if (value === null || value === undefined) return null;
    if (hint === "phone") return (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminFormatters$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["formatPhoneUS"])(value);
    switch(hint){
        case "date":
            return (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminFormatters$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["formatDate"])(value);
        case "datetime":
            return (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminFormatters$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["formatDateTime"])(value);
        case "money":
            {
                if (presentationEntityType === "schedules" && key === "price_cents") {
                    const raw = value;
                    const cents = typeof raw === "number" ? raw : typeof raw === "string" ? parseInt(String(raw), 10) : NaN;
                    if (Number.isFinite(cents)) return (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminFormatters$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["formatMoneyFromCents"])(cents);
                    return "—";
                }
                const n = typeof value === "number" ? value : typeof value === "string" ? parseFloat(value) : NaN;
                if (key === "_discount_amount_cents" && Number.isFinite(n) && n > 0) {
                    return `-${(0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminFormatters$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["formatMoneyFromCents"])(n)}`;
                }
                return (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminFormatters$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["formatMoney"])(value, key);
            }
        case "link":
            if (presentationEntityType === "schedules" && field.key === "assigned_vendor_id" && field.linkTarget?.entityType === "vendors" && record) {
                const idField = field.linkTarget.idField;
                const id = record[idField];
                if (id == null || String(id).trim() === "") {
                    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-sm font-medium text-alloy-forge/85",
                        children: "Unassigned"
                    }, void 0, false, {
                        fileName: "[project]/components/admin/entity/EntityDrawerOverview.tsx",
                        lineNumber: 149,
                        columnNumber: 18
                    }, this);
                }
            }
            if (field.linkTarget && record && onOpenDrawer) {
                const idField = field.linkTarget.idField;
                const id = record[idField];
                if (id != null && String(id).trim() !== "") {
                    let labelFromRecord = null;
                    if (presentationEntityType === "schedules") {
                        const sched = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$scheduleOverviewLabels$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["scheduleOverviewRelationshipReadLabel"])(record, field.key);
                        if (sched !== undefined) {
                            labelFromRecord = sched === "" ? null : sched;
                        }
                        if (labelFromRecord == null && idField !== field.key) {
                            const schedById = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$scheduleOverviewLabels$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["scheduleOverviewRelationshipReadLabel"])(record, idField);
                            if (schedById !== undefined) {
                                labelFromRecord = schedById === "" ? null : schedById;
                            }
                        }
                    } else if (presentationEntityType === "opportunities") {
                        const ol = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$opportunityOverviewLabels$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["opportunityOverviewRelationshipReadLabel"])(record, field.key);
                        if (ol !== undefined) {
                            labelFromRecord = ol === "" ? null : ol;
                        }
                        if (labelFromRecord == null && idField !== field.key) {
                            const ol2 = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$opportunityOverviewLabels$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["opportunityOverviewRelationshipReadLabel"])(record, idField);
                            if (ol2 !== undefined) {
                                labelFromRecord = ol2 === "" ? null : ol2;
                            }
                        }
                    }
                    if (labelFromRecord == null) {
                        labelFromRecord = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$overviewRelationshipLabels$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["resolveOverviewRelationshipLabel"])(record, field.key, {
                            linkIdField: idField
                        });
                    }
                    const uuidLike = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$overviewRelationshipLabels$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["isUuidLike"])(value);
                    const displayText = labelFromRecord ?? (!uuidLike && value != null && String(value).trim() !== "" ? String(value) : null) ?? "—";
                    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        type: "button",
                        onClick: ()=>onOpenDrawer(field.linkTarget.entityType, String(id)),
                        className: "text-alloy-blue hover:underline text-left",
                        children: displayText
                    }, void 0, false, {
                        fileName: "[project]/components/admin/entity/EntityDrawerOverview.tsx",
                        lineNumber: 189,
                        columnNumber: 13
                    }, this);
                }
            }
            return String(value);
        case "primary_yes_no":
            return value === true || value === "true" ? "Yes" : value === false || value === "false" ? "No" : "—";
        case "text":
        case "custom":
        default:
            if (presentationEntityType === "locations" && record) {
                const accessLabel = record._access_method_label != null && String(record._access_method_label).trim() !== "" ? String(record._access_method_label).trim() : null;
                if (accessLabel && (key === "access_method_id" || key === "access_method" || typeof key === "string" && key.toLowerCase().includes("access_method"))) {
                    return accessLabel;
                }
            }
            if (key === "payout_percent") return (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminFormatters$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["formatPayoutPercent"])(value);
            if (presentationEntityType === "schedules" && record) {
                const sched = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$scheduleOverviewLabels$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["scheduleOverviewRelationshipReadLabel"])(record, key);
                if (sched !== undefined) {
                    return sched === "" ? "—" : sched;
                }
            }
            if (presentationEntityType === "opportunities" && record) {
                const ol = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$opportunityOverviewLabels$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["opportunityOverviewRelationshipReadLabel"])(record, key);
                if (ol !== undefined) {
                    return ol === "" ? "—" : ol;
                }
            }
            if (record && (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$overviewRelationshipLabels$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["isUuidLike"])(value)) {
                const rel = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$overviewRelationshipLabels$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["resolveOverviewRelationshipLabel"])(record, key);
                if (rel) return rel;
            }
            return String(value);
    }
}
/**
 * When custom field_definitions reuse legacy keys (gate_code, home_type, …), prefer hydrated API columns / _service_* so blank or duplicate defs never beat canonical values.
 */ function canonicalReadFallbackForShadowedField(entityType, fieldKey, record) {
    if (entityType === "locations") {
        if (fieldKey === "gate_code" && record.access_code != null && String(record.access_code).trim() !== "") {
            return String(record.access_code).trim();
        }
        if (fieldKey === "pets" && typeof record.has_pets === "boolean") {
            return record.has_pets;
        }
    }
    if (entityType === "locations" || entityType === "jobs" || entityType === "schedules") {
        if (fieldKey === "home_type" && String(record._service_home_type_label ?? "").trim() !== "") {
            return String(record._service_home_type_label).trim();
        }
        if (fieldKey === "square_footage" && String(record._service_square_footage_display ?? "").trim() !== "") {
            return String(record._service_square_footage_display).trim();
        }
        const br = record._service_bedrooms;
        if (fieldKey === "bedrooms" && br != null && br !== "" && !Number.isNaN(Number(br))) {
            return br;
        }
        const bt = record._service_bathrooms;
        if (fieldKey === "bathrooms" && bt != null && bt !== "" && !Number.isNaN(Number(bt))) {
            return bt;
        }
    }
    return undefined;
}
function makeKeydownHandlers(key, onBlur, onEscape) {
    return (e)=>{
        if (e.key === "Enter") {
            e.preventDefault();
            e.target.blur();
        }
        if (e.key === "Escape") {
            e.preventDefault();
            onEscape(key);
            e.target.blur();
        }
    };
}
function renderFieldEditNode(field, formData, record, onFieldChange, onBlur, onEscape, statusDefs, disabled, selectOptionsByFieldKey, presentationEntityType) {
    const key = field.key;
    const formVal = formData[key];
    const formHasMeaningful = formVal !== undefined && formVal !== null && String(formVal).trim() !== "";
    const value = formHasMeaningful ? formVal : record[key];
    const hint = field.renderHint ?? "text";
    const onKeyDown = makeKeydownHandlers(key, onBlur, onEscape);
    if (presentationEntityType === "schedules" && key === "assigned_vendor_id") {
        const fk = record.assigned_vendor_id;
        const hasFk = fk != null && String(fk).trim() !== "";
        const nameRaw = record._assigned_vendor_name ?? record._vendor_name;
        const name = nameRaw != null && String(nameRaw).trim() !== "" ? String(nameRaw).trim() : "";
        const display = !hasFk ? "Unassigned" : name || "—";
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
            className: "inline-flex w-full min-h-[2.25rem] items-center text-sm font-medium text-alloy-midnight/90",
            children: display
        }, void 0, false, {
            fileName: "[project]/components/admin/entity/EntityDrawerOverview.tsx",
            lineNumber: 320,
            columnNumber: 7
        }, this);
    }
    if (hint === "datetime" || hint === "date") {
        const str = value != null ? String(value) : "";
        const type = hint === "date" ? "date" : "datetime-local";
        const normalized = str && str.length >= 16 ? str.slice(0, 16) : str;
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
            type: type,
            value: normalized,
            onChange: (e)=>onFieldChange(key, e.target.value),
            onBlur: onBlur,
            onKeyDown: onKeyDown,
            disabled: disabled,
            className: INLINE_EDIT_INPUT
        }, void 0, false, {
            fileName: "[project]/components/admin/entity/EntityDrawerOverview.tsx",
            lineNumber: 331,
            columnNumber: 7
        }, this);
    }
    if (hint === "money" && key.endsWith("_cents")) {
        const num = typeof value === "number" ? value / 100 : typeof value === "string" ? parseFloat(value) || 0 : 0;
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
            type: "number",
            step: 0.01,
            value: num > 0 ? num : "",
            onChange: (e)=>{
                const v = e.target.value ? Math.round(parseFloat(e.target.value) * 100) : null;
                onFieldChange(key, v);
            },
            onBlur: onBlur,
            onKeyDown: onKeyDown,
            disabled: disabled,
            className: INLINE_EDIT_INPUT,
            placeholder: "0.00"
        }, void 0, false, {
            fileName: "[project]/components/admin/entity/EntityDrawerOverview.tsx",
            lineNumber: 346,
            columnNumber: 7
        }, this);
    }
    if (hint === "primary_yes_no") {
        const boolVal = value === true || value === "true";
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
            value: boolVal ? "true" : value === false || value === "false" ? "false" : "",
            onChange: (e)=>{
                const v = e.target.value;
                onFieldChange(key, v === "" ? "" : v === "true");
            },
            onBlur: onBlur,
            onKeyDown: onKeyDown,
            disabled: disabled,
            className: INLINE_EDIT_SELECT,
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                    value: "",
                    children: "— None —"
                }, void 0, false, {
                    fileName: "[project]/components/admin/entity/EntityDrawerOverview.tsx",
                    lineNumber: 377,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                    value: "true",
                    children: "Yes"
                }, void 0, false, {
                    fileName: "[project]/components/admin/entity/EntityDrawerOverview.tsx",
                    lineNumber: 378,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                    value: "false",
                    children: "No"
                }, void 0, false, {
                    fileName: "[project]/components/admin/entity/EntityDrawerOverview.tsx",
                    lineNumber: 379,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/components/admin/entity/EntityDrawerOverview.tsx",
            lineNumber: 366,
            columnNumber: 7
        }, this);
    }
    const refOpts = selectOptionsByFieldKey?.[key];
    const refSelectKeys = new Set([
        "pipeline_stage_id",
        "vertical_id",
        "primary_person_id",
        "assigned_vendor_id",
        "location_id",
        "primary_contact_id",
        "contact_id",
        "customer_id",
        "opportunity_id",
        "job_id",
        "customer_subscription_id",
        "discount_code_id",
        "work_unit_id"
    ]);
    /** Reference selects (FK ids) win over generic `status` hint; workflow status uses status_key + statusDefs. */ if (refOpts && refOpts.length > 0 && refSelectKeys.has(key)) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
            value: String(value ?? ""),
            onChange: (e)=>onFieldChange(key, e.target.value || null),
            onBlur: onBlur,
            onKeyDown: onKeyDown,
            disabled: disabled,
            className: INLINE_EDIT_SELECT,
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                    value: "",
                    children: "— None —"
                }, void 0, false, {
                    fileName: "[project]/components/admin/entity/EntityDrawerOverview.tsx",
                    lineNumber: 411,
                    columnNumber: 9
                }, this),
                refOpts.map((o)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                        value: o.value,
                        children: o.label
                    }, o.value, false, {
                        fileName: "[project]/components/admin/entity/EntityDrawerOverview.tsx",
                        lineNumber: 413,
                        columnNumber: 11
                    }, this))
            ]
        }, void 0, true, {
            fileName: "[project]/components/admin/entity/EntityDrawerOverview.tsx",
            lineNumber: 403,
            columnNumber: 7
        }, this);
    }
    if (hint === "status" && statusDefs && statusDefs.length > 0) {
        const valStr = String(value ?? "").trim();
        const scheduleCanceled = presentationEntityType === "schedules" && record.canceled_at != null && String(record.canceled_at).trim() !== "";
        if (scheduleCanceled) {
            const lab = statusDefs.find((s)=>s.status_key === valStr)?.status_label ?? valStr;
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                className: "inline-flex w-full items-center rounded border border-admin-border bg-alloy-stone/5 px-2 py-1.5 text-sm text-alloy-midnight/80",
                children: lab || "—"
            }, void 0, false, {
                fileName: "[project]/components/admin/entity/EntityDrawerOverview.tsx",
                lineNumber: 430,
                columnNumber: 9
            }, this);
        }
        let options = statusDefs.filter((s)=>s.is_active !== false).sort((a, b)=>(a.sort_order ?? 0) - (b.sort_order ?? 0));
        if (presentationEntityType === "schedules") {
            options = options.filter((s)=>!(0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$scheduleCanceledStatus$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["isScheduleCanceledStatusKey"])(s.status_key));
        }
        if (valStr && !options.some((s)=>s.status_key === valStr)) {
            if (!(presentationEntityType === "schedules" && (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$scheduleCanceledStatus$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["isScheduleCanceledStatusKey"])(valStr))) {
                options = [
                    ...options,
                    {
                        status_key: valStr,
                        status_label: valStr,
                        sort_order: 9999,
                        is_active: true
                    }
                ];
            }
        }
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
            value: valStr,
            onChange: (e)=>onFieldChange(key, e.target.value || null),
            onBlur: onBlur,
            onKeyDown: onKeyDown,
            disabled: disabled,
            className: INLINE_EDIT_SELECT,
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                    value: "",
                    children: "— None —"
                }, void 0, false, {
                    fileName: "[project]/components/admin/entity/EntityDrawerOverview.tsx",
                    lineNumber: 453,
                    columnNumber: 9
                }, this),
                options.map((s)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                        value: s.status_key,
                        children: s.status_label ?? s.status_key
                    }, s.status_key, false, {
                        fileName: "[project]/components/admin/entity/EntityDrawerOverview.tsx",
                        lineNumber: 455,
                        columnNumber: 11
                    }, this))
            ]
        }, void 0, true, {
            fileName: "[project]/components/admin/entity/EntityDrawerOverview.tsx",
            lineNumber: 445,
            columnNumber: 7
        }, this);
    }
    if (key === "recurrence_unit") {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
            value: String(value ?? ""),
            onChange: (e)=>onFieldChange(key, e.target.value || null),
            onBlur: onBlur,
            onKeyDown: onKeyDown,
            disabled: disabled,
            className: INLINE_EDIT_SELECT,
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                    value: "",
                    children: "— None —"
                }, void 0, false, {
                    fileName: "[project]/components/admin/entity/EntityDrawerOverview.tsx",
                    lineNumber: 471,
                    columnNumber: 9
                }, this),
                __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminFormatters$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["RECURRENCE_UNIT_OPTIONS"].map((o)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                        value: o.value,
                        children: o.label
                    }, o.value, false, {
                        fileName: "[project]/components/admin/entity/EntityDrawerOverview.tsx",
                        lineNumber: 473,
                        columnNumber: 11
                    }, this))
            ]
        }, void 0, true, {
            fileName: "[project]/components/admin/entity/EntityDrawerOverview.tsx",
            lineNumber: 463,
            columnNumber: 7
        }, this);
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
        type: "text",
        value: String(value ?? ""),
        onChange: (e)=>onFieldChange(key, e.target.value),
        onBlur: onBlur,
        onKeyDown: onKeyDown,
        disabled: disabled,
        className: INLINE_EDIT_INPUT
    }, void 0, false, {
        fileName: "[project]/components/admin/entity/EntityDrawerOverview.tsx",
        lineNumber: 480,
        columnNumber: 5
    }, this);
}
function EntityDrawerOverview({ entityType, data, customSectionContent = {}, customSectionHeaderRight = {}, overviewSectionsOverride, isEditing = false, formData, onFieldChange, onBlur, canEdit = false, statusDefs, getStatusLabel, onOpenDrawer, selectOptionsByFieldKey, scheduleOverviewRows, scheduleRecordLayout, sectionSurface = "default" }) {
    const config = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$entityPresentation$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getEntityPresentation"])(entityType);
    const baseSections = overviewSectionsOverride ?? config.drawer?.overviewSections ?? [];
    const fieldIndex = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$scheduleOverviewRows$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["flattenOverviewFieldIndex"])(baseSections);
    const useScheduleLayoutV2 = entityType === "schedules" && (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$recordChrome$2f$scheduleLayoutConfig$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["isScheduleLayoutV2"])(scheduleRecordLayout ?? undefined);
    const layoutBlocks = scheduleRecordLayout?.layout_blocks;
    const rowKeySet = entityType === "schedules" && useScheduleLayoutV2 && layoutBlocks?.length ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$recordChrome$2f$scheduleLayoutConfig$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["collectResolvedKeysFromScheduleLayoutBlocks"])(layoutBlocks) : scheduleOverviewRows && scheduleOverviewRows.length > 0 && entityType === "schedules" ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$scheduleOverviewRows$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["collectScheduleRowResolvedKeys"])(scheduleOverviewRows) : null;
    const sections = rowKeySet ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$scheduleOverviewRows$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["scheduleSectionsAfterRowExtraction"])(baseSections, rowKeySet, customSectionContent) : baseSections;
    const record = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>data ?? {}, [
        data
    ]);
    const scheduleSnapshot = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>entityType === "schedules" ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$scheduleRecordSnapshot$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getScheduleSnapshot"])(record) : null, [
        entityType,
        record
    ]);
    if (!baseSections.length) return null;
    const editFormData = formData ?? record;
    const handleFieldChange = onFieldChange ?? (()=>{});
    const handleBlur = onBlur ?? (()=>{});
    /** Revert one field to record value and blur (Escape). */ const handleEscape = (key)=>{
        handleFieldChange(key, record[key]);
        handleBlur();
    };
    const renderOverviewField = (field, opts)=>{
        const key = field.key;
        let displayFallback = undefined;
        if (entityType === "schedules") {
            const schedExplicit = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$scheduleOverviewLabels$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["scheduleOverviewRelationshipReadLabel"])(record, key);
            if (schedExplicit !== undefined) {
                displayFallback = schedExplicit === "" ? "—" : schedExplicit;
            }
        }
        if (displayFallback === undefined && entityType === "opportunities") {
            const oppExplicit = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$opportunityOverviewLabels$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["opportunityOverviewRelationshipReadLabel"])(record, key);
            if (oppExplicit !== undefined) {
                displayFallback = oppExplicit === "" ? "—" : oppExplicit;
            }
        }
        if (displayFallback === undefined && entityType === "schedules" && scheduleSnapshot) {
            const fromSnap = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$scheduleRecordSnapshot$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["scheduleOverviewValueFromSnapshot"])(scheduleSnapshot, key);
            if (fromSnap !== undefined) displayFallback = fromSnap;
        }
        if (displayFallback === undefined) {
            displayFallback = key === "_status_display" ? record._status_display : key === "status_key" && record._status_display != null ? record._status_display : key === "status" && record._status_display != null && String(record._status_display).trim() !== "" ? record._status_display : key === "assigned_vendor_id" && (record._vendor_name != null || record._assigned_vendor_name != null) ? String(record._vendor_name ?? record._assigned_vendor_name) : key === "work_unit_id" && record._work_unit_label != null ? String(record._work_unit_label) : key === "pipeline_stage_id" && record._pipeline_stage_name != null ? record._pipeline_stage_name : key === "pipeline_id" && record._pipeline_name != null ? record._pipeline_name : key === "discount_program_id" && record._discount_program_label != null ? record._discount_program_label : key === "vertical_id" && record._vertical_name != null ? record._vertical_name : key === "location_id" && (record._location_label != null || record._location_name != null) ? String(record._location_label ?? record._location_name) : key === "access_method_id" && record._access_method_label != null && String(record._access_method_label).trim() !== "" ? String(record._access_method_label).trim() : key === "primary_person_id" && record._primary_person_name != null ? record._primary_person_name : key === "primary_contact_id" && (record._primary_contact_name != null || record._contact_name != null) ? record._primary_contact_name ?? record._contact_name : key === "contact_id" && (record._primary_contact_name != null || record._contact_name != null) ? record._primary_contact_name ?? record._contact_name : key === "customer_id" && record._customer_name != null ? record._customer_name : key === "opportunity_id" && record._opportunity_name != null ? record._opportunity_name : key === "job_id" && (record._job_title != null || record._job_label != null) ? String(record._job_title ?? record._job_label) : key === "customer_subscription_id" && record._customer_subscription_label != null ? String(record._customer_subscription_label) : key === "discount_code_id" && (record.discount_code != null || record._discount_label != null) ? String(record.discount_code ?? record._discount_label ?? "").trim() || undefined : key === "_customer_name" && record._customer_name != null ? String(record._customer_name) : key === "_location_name" && (record._location_name != null || record._location_label != null) ? String(record._location_name ?? record._location_label) : key === "_opportunity_name" && record._opportunity_name != null ? String(record._opportunity_name) : key === "_primary_person_name" && record._primary_person_name != null ? String(record._primary_person_name) : undefined;
        }
        if (displayFallback === undefined) {
            const canon = canonicalReadFallbackForShadowedField(entityType, key, record);
            if (canon !== undefined) displayFallback = canon;
        }
        if (displayFallback === undefined) {
            const resolved = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$overviewRelationshipLabels$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["resolveOverviewRelationshipLabel"])(record, key);
            if (resolved != null) displayFallback = resolved;
        }
        const showFieldEdit = !!(isEditing && canEdit && field.editable && onFieldChange);
        const rawForRead = displayFallback !== undefined ? displayFallback : record[key];
        const rawValue = showFieldEdit ? (()=>{
            const ed = editFormData[key];
            if (ed !== undefined && ed !== null && String(ed).trim() !== "") return ed;
            return record[key];
        })() : rawForRead;
        let displayValue = formatFieldValue(rawValue, field, getStatusLabel, record, onOpenDrawer, entityType);
        if (!showFieldEdit && (displayValue === null || displayValue === undefined || displayValue === "")) {
            displayValue = "—";
        }
        const editNode = showFieldEdit ? renderFieldEditNode(field, editFormData, record, handleFieldChange, handleBlur, handleEscape, statusDefs, !canEdit, selectOptionsByFieldKey, entityType) : undefined;
        const scheduleSnapRow = !!(opts?.row && entityType === "schedules");
        const density = opts?.row ? "compact" : "default";
        const tier = opts?.scheduleFieldTier;
        const fieldProps = {
            label: scheduleSnapRow ? "" : field.label,
            value: displayValue,
            span: field.span ?? 1,
            editNode,
            isEditing: showFieldEdit,
            density,
            showLabel: !scheduleSnapRow,
            ...scheduleSnapRow && tier ? {
                valueEmphasis: tier
            } : {}
        };
        if (scheduleSnapRow && opts?.scheduleChromePresentation === "flat") {
            const valClass = tier === "primary" ? "text-[15px] font-semibold tracking-tight text-alloy-midnight" : tier === "supporting" ? "text-xs font-normal text-alloy-forge/85" : "text-sm font-medium text-alloy-midnight/88";
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "min-w-0",
                "data-schedule-flat-field": field.key,
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "mb-0.5 text-[8px] font-semibold uppercase tracking-[0.1em] text-alloy-forge/50",
                        children: field.label
                    }, void 0, false, {
                        fileName: "[project]/components/admin/entity/EntityDrawerOverview.tsx",
                        lineNumber: 686,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: `${valClass} leading-snug`,
                        children: showFieldEdit ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
                            children: editNode
                        }, void 0, false) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
                            children: displayValue
                        }, void 0, false)
                    }, void 0, false, {
                        fileName: "[project]/components/admin/entity/EntityDrawerOverview.tsx",
                        lineNumber: 687,
                        columnNumber: 11
                    }, this)
                ]
            }, field.key, true, {
                fileName: "[project]/components/admin/entity/EntityDrawerOverview.tsx",
                lineNumber: 685,
                columnNumber: 9
            }, this);
        }
        if (scheduleSnapRow) {
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$drawer$2f$ScheduleSnapCell$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                label: field.label,
                tier: tier ?? "secondary",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$entity$2f$EntityDrawerField$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                    ...fieldProps
                }, void 0, false, {
                    fileName: "[project]/components/admin/entity/EntityDrawerOverview.tsx",
                    lineNumber: 694,
                    columnNumber: 11
                }, this)
            }, field.key, false, {
                fileName: "[project]/components/admin/entity/EntityDrawerOverview.tsx",
                lineNumber: 693,
                columnNumber: 9
            }, this);
        }
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$entity$2f$EntityDrawerField$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
            ...fieldProps
        }, field.key, false, {
            fileName: "[project]/components/admin/entity/EntityDrawerOverview.tsx",
            lineNumber: 698,
            columnNumber: 12
        }, this);
    };
    const rowGridClass = (n)=>n <= 1 ? "grid-cols-1" : n === 2 ? "grid-cols-1 sm:grid-cols-2" : n === 3 ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4";
    const renderScheduleChromeField = (token, cellKey, tierBreak, presentation = "cards")=>{
        const resolvedKey = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$scheduleOverviewRows$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["resolveScheduleOverviewRowFieldKey"])(token);
        const tier = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$scheduleFieldPresentation$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getScheduleOverviewFieldTier"])(resolvedKey);
        if (resolvedKey === "_contact_email" && !(0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$scheduleRecordSnapshot$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["shouldShowScheduleContactEmailRow"])(record)) {
            return null;
        }
        let field = fieldIndex.get(resolvedKey);
        if (!field) {
            field = {
                key: resolvedKey,
                label: (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$scheduleOverviewRows$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["scheduleOverviewRowTokenLabel"])(token),
                span: 1,
                renderHint: "text",
                editable: false
            };
        }
        const groupClass = tierBreak ? "min-w-0 mt-3 border-t border-alloy-stone/15 pt-3 sm:mt-0 sm:border-t-0 sm:border-l sm:border-alloy-stone/25 sm:pt-0 sm:pl-3" : "min-w-0";
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: groupClass,
            children: renderOverviewField(field, {
                row: true,
                scheduleFieldTier: tier,
                scheduleChromePresentation: presentation
            })
        }, cellKey, false, {
            fileName: "[project]/components/admin/entity/EntityDrawerOverview.tsx",
            lineNumber: 735,
            columnNumber: 7
        }, this);
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: `${sectionSurface === "premium" ? "space-y-0 pt-4 pb-1" : `space-y-0 ${entityType === "schedules" ? "pt-2 [&_section[data-entity-section]]:mb-3" : "pt-4"}`}`,
        "data-entity-drawer-overview": true,
        "data-section-surface": sectionSurface,
        children: [
            useScheduleLayoutV2 && layoutBlocks?.length && entityType === "schedules" ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "mb-2 space-y-1.5",
                "data-schedule-layout-version": "2",
                children: layoutBlocks.map((block)=>{
                    if (block.type === "section_group") return null;
                    if (block.type === "snapshot") {
                        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            "data-schedule-layout-block": "snapshot",
                            "data-block-key": block.key,
                            className: "rounded-lg border border-admin-border/40 bg-white px-2 py-1.5 shadow-sm sm:px-2.5 sm:py-2",
                            children: [
                                block.title ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                    className: "mb-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-alloy-forge/60",
                                    children: block.title
                                }, void 0, false, {
                                    fileName: "[project]/components/admin/entity/EntityDrawerOverview.tsx",
                                    lineNumber: 768,
                                    columnNumber: 21
                                }, this) : null,
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "divide-y divide-alloy-stone/15",
                                    children: block.groups.map((group, gi)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "flex flex-col gap-1.5 py-2 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:gap-3",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "shrink-0 pt-0.5 text-[8px] font-semibold uppercase tracking-[0.12em] text-alloy-forge/45 sm:w-[7.5rem]",
                                                    children: group.label
                                                }, void 0, false, {
                                                    fileName: "[project]/components/admin/entity/EntityDrawerOverview.tsx",
                                                    lineNumber: 778,
                                                    columnNumber: 25
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: `min-w-0 flex-1 grid gap-x-3 gap-y-1.5 ${rowGridClass(Math.min(4, Math.max(1, group.fields.length)))}`,
                                                    children: group.fields.map((token, ci)=>{
                                                        const prevResolvedKey = ci > 0 ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$scheduleOverviewRows$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["resolveScheduleOverviewRowFieldKey"])(group.fields[ci - 1]) : null;
                                                        const resolvedKey = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$scheduleOverviewRows$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["resolveScheduleOverviewRowFieldKey"])(token);
                                                        const prevTier = prevResolvedKey != null ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$scheduleFieldPresentation$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getScheduleOverviewFieldTier"])(prevResolvedKey) : null;
                                                        const tier = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$scheduleFieldPresentation$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getScheduleOverviewFieldTier"])(resolvedKey);
                                                        const tierBreak = ci > 0 && prevTier != null && tier !== prevTier;
                                                        return renderScheduleChromeField(token, `${block.key}-${gi}-${ci}-${resolvedKey}`, tierBreak, "flat");
                                                    })
                                                }, void 0, false, {
                                                    fileName: "[project]/components/admin/entity/EntityDrawerOverview.tsx",
                                                    lineNumber: 781,
                                                    columnNumber: 25
                                                }, this)
                                            ]
                                        }, `${block.key}-g-${gi}`, true, {
                                            fileName: "[project]/components/admin/entity/EntityDrawerOverview.tsx",
                                            lineNumber: 774,
                                            columnNumber: 23
                                        }, this))
                                }, void 0, false, {
                                    fileName: "[project]/components/admin/entity/EntityDrawerOverview.tsx",
                                    lineNumber: 772,
                                    columnNumber: 19
                                }, this)
                            ]
                        }, block.key, true, {
                            fileName: "[project]/components/admin/entity/EntityDrawerOverview.tsx",
                            lineNumber: 761,
                            columnNumber: 17
                        }, this);
                    }
                    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        "data-schedule-layout-block": "secondary_summary",
                        "data-block-key": block.key,
                        className: "border-t border-alloy-stone/20 pt-2",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "flex flex-wrap items-baseline gap-x-10 gap-y-2",
                            children: block.fields.map((token)=>{
                                const resolvedKey = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$scheduleOverviewRows$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["resolveScheduleOverviewRowFieldKey"])(token);
                                if (!scheduleSnapshot) return null;
                                if (resolvedKey === "service_type") {
                                    const text = scheduleSnapshot.service.label?.trim() || "—";
                                    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "min-w-0",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "mr-2 text-[8px] font-semibold uppercase tracking-[0.1em] text-alloy-forge/45",
                                                children: "Service"
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/entity/EntityDrawerOverview.tsx",
                                                lineNumber: 822,
                                                columnNumber: 27
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "text-[13px] font-medium text-alloy-midnight/90",
                                                children: text
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/entity/EntityDrawerOverview.tsx",
                                                lineNumber: 825,
                                                columnNumber: 27
                                            }, this)
                                        ]
                                    }, `${block.key}-svc`, true, {
                                        fileName: "[project]/components/admin/entity/EntityDrawerOverview.tsx",
                                        lineNumber: 821,
                                        columnNumber: 25
                                    }, this);
                                }
                                if (resolvedKey === "price_cents") {
                                    const cents = scheduleSnapshot.service.price;
                                    const text = cents != null && Number.isFinite(cents) ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminFormatters$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["formatMoneyFromCents"])(cents) : "—";
                                    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "min-w-0",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "mr-2 text-[8px] font-semibold uppercase tracking-[0.1em] text-alloy-forge/45",
                                                children: "Price"
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/entity/EntityDrawerOverview.tsx",
                                                lineNumber: 835,
                                                columnNumber: 27
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "text-[13px] font-semibold tabular-nums text-alloy-midnight",
                                                children: text
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/entity/EntityDrawerOverview.tsx",
                                                lineNumber: 838,
                                                columnNumber: 27
                                            }, this)
                                        ]
                                    }, `${block.key}-price`, true, {
                                        fileName: "[project]/components/admin/entity/EntityDrawerOverview.tsx",
                                        lineNumber: 834,
                                        columnNumber: 25
                                    }, this);
                                }
                                return renderScheduleChromeField(token, `${block.key}-ss-${resolvedKey}`, false, "flat");
                            })
                        }, void 0, false, {
                            fileName: "[project]/components/admin/entity/EntityDrawerOverview.tsx",
                            lineNumber: 814,
                            columnNumber: 17
                        }, this)
                    }, block.key, false, {
                        fileName: "[project]/components/admin/entity/EntityDrawerOverview.tsx",
                        lineNumber: 808,
                        columnNumber: 15
                    }, this);
                })
            }, void 0, false, {
                fileName: "[project]/components/admin/entity/EntityDrawerOverview.tsx",
                lineNumber: 756,
                columnNumber: 9
            }, this) : scheduleOverviewRows && scheduleOverviewRows.length > 0 && entityType === "schedules" ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "mb-3 rounded-lg border border-admin-border/40 bg-white/90 px-2 py-2 shadow-sm sm:px-2.5",
                "data-schedule-overview-rows": "true",
                "data-schedule-layout-version": "1",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "px-0.5 pb-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-alloy-forge/70",
                        children: "Visit details"
                    }, void 0, false, {
                        fileName: "[project]/components/admin/entity/EntityDrawerOverview.tsx",
                        lineNumber: 860,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "space-y-3",
                        children: scheduleOverviewRows.map((row, ri)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: `grid gap-x-2.5 gap-y-2 ${rowGridClass(Math.min(4, Math.max(1, row.length)))}`,
                                children: row.map((token, ci)=>{
                                    const resolvedKey = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$scheduleOverviewRows$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["resolveScheduleOverviewRowFieldKey"])(token);
                                    const prevResolvedKey = ci > 0 ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$scheduleOverviewRows$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["resolveScheduleOverviewRowFieldKey"])(row[ci - 1]) : null;
                                    const tier = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$scheduleFieldPresentation$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getScheduleOverviewFieldTier"])(resolvedKey);
                                    const prevTier = prevResolvedKey != null ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$scheduleFieldPresentation$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getScheduleOverviewFieldTier"])(prevResolvedKey) : null;
                                    const tierBreak = ci > 0 && prevTier != null && tier !== prevTier;
                                    return renderScheduleChromeField(token, `${ri}-${ci}-${resolvedKey}`, tierBreak);
                                })
                            }, `row-${ri}`, false, {
                                fileName: "[project]/components/admin/entity/EntityDrawerOverview.tsx",
                                lineNumber: 865,
                                columnNumber: 15
                            }, this))
                    }, void 0, false, {
                        fileName: "[project]/components/admin/entity/EntityDrawerOverview.tsx",
                        lineNumber: 863,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/admin/entity/EntityDrawerOverview.tsx",
                lineNumber: 855,
                columnNumber: 9
            }, this) : null,
            sections.map((section)=>{
                const hasSubsections = (section.subsections?.length ?? 0) > 0;
                const hasTopFields = section.fields && section.fields.length > 0;
                const hasFields = hasTopFields || hasSubsections;
                const customContent = customSectionContent[section.key];
                const headerRight = customSectionHeaderRight[section.key];
                const gridInner = section.gridCols === 2 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1";
                const subsectionTitleClass = sectionSurface === "premium" ? "text-[10px] font-semibold uppercase tracking-[0.1em] text-alloy-midnight/50 border-b border-alloy-stone/15 pb-1.5 mb-2.5" : "text-xs font-semibold uppercase tracking-wider text-alloy-forge/80 border-b border-admin-border pb-2 mb-3";
                const children = customContent ?? (hasSubsections ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: `${section.gridCols === 2 ? "md:col-span-2" : ""} w-full ${sectionSurface === "premium" ? "space-y-5" : "space-y-6"}`,
                    children: section.subsections.map((sub)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                    className: subsectionTitleClass,
                                    children: sub.title
                                }, void 0, false, {
                                    fileName: "[project]/components/admin/entity/EntityDrawerOverview.tsx",
                                    lineNumber: 902,
                                    columnNumber: 19
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: `grid ${sectionSurface === "premium" ? "gap-x-4 gap-y-3" : "gap-x-6 gap-y-4"} ${gridInner}`,
                                    children: sub.fields.map((f)=>renderOverviewField(f))
                                }, void 0, false, {
                                    fileName: "[project]/components/admin/entity/EntityDrawerOverview.tsx",
                                    lineNumber: 903,
                                    columnNumber: 19
                                }, this)
                            ]
                        }, sub.title, true, {
                            fileName: "[project]/components/admin/entity/EntityDrawerOverview.tsx",
                            lineNumber: 901,
                            columnNumber: 17
                        }, this))
                }, void 0, false, {
                    fileName: "[project]/components/admin/entity/EntityDrawerOverview.tsx",
                    lineNumber: 899,
                    columnNumber: 13
                }, this) : hasTopFields ? section.fields.map((f)=>renderOverviewField(f)) : null);
                if (!hasFields && !customContent) return null;
                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$entity$2f$EntityDrawerSection$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                    config: section,
                    surface: sectionSurface,
                    headerRight: headerRight,
                    children: children
                }, section.key, false, {
                    fileName: "[project]/components/admin/entity/EntityDrawerOverview.tsx",
                    lineNumber: 916,
                    columnNumber: 11
                }, this);
            })
        ]
    }, void 0, true, {
        fileName: "[project]/components/admin/entity/EntityDrawerOverview.tsx",
        lineNumber: 746,
        columnNumber: 5
    }, this);
}
}),
"[project]/components/admin/entity/OpportunityInquiryChildrenSection.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>OpportunityInquiryChildrenSection
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$workspace$2f$AdminV2DrawerLoadingState$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/components/admin/workspace/AdminV2DrawerLoadingState.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminFormatters$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/adminFormatters.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$workspaceChildcareInquiryOptionSets$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/workspace/workspaceChildcareInquiryOptionSets.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$workspaceAdminFetchDedupe$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/workspace/workspaceAdminFetchDedupe.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$workspaceDataFetch$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/workspace/workspaceDataFetch.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
"use client";
;
;
;
;
;
;
;
function normalizeKey(v) {
    return (v ?? "").trim();
}
/** Matches opportunity inquiry outcome keys/labels that imply waitlist (subtle attention styling). */ function isWaitlistedInquiryOutcome(outcomeKey, outcomeLabel) {
    const k = outcomeKey.toLowerCase();
    const l = outcomeLabel.toLowerCase();
    return k.includes("waitlist") || l.includes("waitlist");
}
function inquiryChildRowAttention(args) {
    const { dob, desiredProgramType, desiredScheduleType, outcomeKey, outcomeLabel } = args;
    const missingDob = !normalizeKey(dob);
    const missingProgram = !normalizeKey(desiredProgramType);
    const missingSchedule = !normalizeKey(desiredScheduleType);
    const waitlisted = isWaitlistedInquiryOutcome(outcomeKey, outcomeLabel);
    const k = outcomeKey.toLowerCase();
    const l = outcomeLabel.toLowerCase();
    const noFitOrBlocked = /no_?fit|no_classroom|blocked|enrollment_?block/i.test(k) || /no fit|no classroom|blocked enrollment|enrollment block/i.test(l);
    return waitlisted || missingDob || missingProgram || missingSchedule || noFitOrBlocked;
}
function useDebouncedPatch(ms) {
    const timers = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(new Map());
    const queue = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(new Map());
    const schedule = (id, patch, run)=>{
        const next = {
            ...queue.current.get(id) ?? {},
            ...patch
        };
        queue.current.set(id, next);
        const existing = timers.current.get(id);
        if (existing) window.clearTimeout(existing);
        const t = window.setTimeout(()=>{
            timers.current.delete(id);
            const p = queue.current.get(id);
            if (!p) return;
            queue.current.delete(id);
            run(id, p);
        }, ms);
        timers.current.set(id, t);
    };
    const flush = (id, run)=>{
        const existing = timers.current.get(id);
        if (existing) window.clearTimeout(existing);
        timers.current.delete(id);
        const p = queue.current.get(id);
        if (!p) return;
        queue.current.delete(id);
        run(id, p);
    };
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        return ()=>{
            for (const t of timers.current.values())window.clearTimeout(t);
            timers.current.clear();
            queue.current.clear();
        };
    }, []);
    return {
        schedule,
        flush
    };
}
function OpportunityInquiryChildrenSection({ rows, canEdit, onOpenChild, /** When true and rows are empty, show a loading shell (full inquiry payload still fetching). */ recordDetailPending = false, /** When true, outer EntityDrawerSection already provides premium card chrome — avoid nested heavy cards. */ embeddedInPremiumSection = false }) {
    const rootCol = embeddedInPremiumSection ? "min-w-0 w-full" : "md:col-span-2";
    const emptyBox = embeddedInPremiumSection ? "rounded-md border border-dashed border-alloy-stone/25 bg-white/50 px-3 py-2.5 text-sm text-alloy-midnight/60" : "rounded-lg border border-alloy-stone/25 bg-white px-3 py-2 text-sm text-alloy-midnight/60";
    const [programItems, setProgramItems] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])([]);
    const [scheduleItems, setScheduleItems] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])([]);
    const [statusItems, setStatusItems] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])([]);
    const [loadErr, setLoadErr] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [local, setLocal] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])({});
    const [savingById, setSavingById] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])({});
    const [errorById, setErrorById] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])({});
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        setLocal((prev)=>{
            const next = {
                ...prev
            };
            for (const r of rows){
                if (!r.id) continue;
                next[r.id] = {
                    desired_program_type: normalizeKey(r.desired_program_type),
                    desired_schedule_type: normalizeKey(r.desired_schedule_type),
                    outcome_status_key: normalizeKey(r.outcome_status_key),
                    notes: (r.notes ?? "").toString()
                };
            }
            return next;
        });
    }, [
        rows
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (rows.length === 0) {
            setProgramItems([]);
            setScheduleItems([]);
            setStatusItems([]);
            setLoadErr(null);
            return undefined;
        }
        let cancelled = false;
        async function load() {
            try {
                setLoadErr(null);
                const init = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$workspaceDataFetch$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["workspaceDataFetchInit"])();
                const [bundle, statusRes] = await Promise.all([
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$workspaceChildcareInquiryOptionSets$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["loadWorkspaceChildcareInquiryOptionSets"])(init),
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$workspaceAdminFetchDedupe$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["dedupeAdminFetchWithTtl"])("/api/admin/status-definitions?entity_type=opportunity_customer_members", init, 1500)
                ]);
                const progRes = bundle.programRes;
                const schedRes = bundle.scheduleRes;
                const progJson = await progRes.json().catch(()=>({}));
                const schedJson = await schedRes.json().catch(()=>({}));
                const statusJson = await statusRes.json().catch(()=>({}));
                if (!progRes.ok) throw new Error(progJson.error ?? "Failed to load program types");
                if (!schedRes.ok) throw new Error(schedJson.error ?? "Failed to load schedule types");
                if (!statusRes.ok) throw new Error(statusJson.error ?? "Failed to load outcome statuses");
                if (cancelled) return;
                setProgramItems((progJson.items ?? []).slice());
                setScheduleItems((schedJson.items ?? []).slice());
                setStatusItems((statusJson.statuses ?? []).slice().sort((a, b)=>Number(a.sort_order ?? 100) - Number(b.sort_order ?? 100)));
            } catch (e) {
                if (cancelled) return;
                setLoadErr(e.message);
            }
        }
        load();
        return ()=>{
            cancelled = true;
        };
    }, [
        rows.length
    ]);
    const programLabelByKey = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>new Map(programItems.map((i)=>[
                i.item_key,
                i.label ?? i.item_key
            ])), [
        programItems
    ]);
    const scheduleLabelByKey = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>new Map(scheduleItems.map((i)=>[
                i.item_key,
                i.label ?? i.item_key
            ])), [
        scheduleItems
    ]);
    const statusLabelByKey = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>new Map(statusItems.map((s)=>[
                s.status_key,
                s.status_label ?? s.status_key
            ])), [
        statusItems
    ]);
    const debounced = useDebouncedPatch(600);
    const savePatch = async (id, patch)=>{
        setSavingById((p)=>({
                ...p,
                [id]: true
            }));
        setErrorById((p)=>({
                ...p,
                [id]: null
            }));
        try {
            const res = await fetch(`/api/admin/opportunity-customer-members/${encodeURIComponent(id)}`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(patch)
            });
            const json = await res.json().catch(()=>({}));
            if (!res.ok) throw new Error(json.error ?? "Save failed");
        } catch (e) {
            setErrorById((p)=>({
                    ...p,
                    [id]: e.message
                }));
        }
        setSavingById((p)=>({
                ...p,
                [id]: false
            }));
    };
    if (!rows.length) {
        if (recordDetailPending) {
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: rootCol,
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$workspace$2f$AdminV2DrawerLoadingState$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AdminV2DrawerLoadingState"], {
                    density: "inline",
                    title: "Loading inquiry children",
                    description: "Programs, schedules, and child rows appear after the full enrollment payload loads.",
                    className: "border-alloy-stone/12 bg-alloy-stone/[0.02]"
                }, void 0, false, {
                    fileName: "[project]/components/admin/entity/OpportunityInquiryChildrenSection.tsx",
                    lineNumber: 217,
                    columnNumber: 21
                }, this)
            }, void 0, false, {
                fileName: "[project]/components/admin/entity/OpportunityInquiryChildrenSection.tsx",
                lineNumber: 216,
                columnNumber: 17
            }, this);
        }
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: `${rootCol} ${emptyBox}`,
            children: "No children added to this inquiry yet."
        }, void 0, false, {
            fileName: "[project]/components/admin/entity/OpportunityInquiryChildrenSection.tsx",
            lineNumber: 227,
            columnNumber: 13
        }, this);
    }
    const tableWrap = embeddedInPremiumSection ? "overflow-x-auto rounded-md border border-alloy-stone/15 bg-white/75" : "overflow-x-auto rounded-lg border border-alloy-stone/25 bg-white";
    const theadRow = embeddedInPremiumSection ? "border-b border-alloy-stone/15 bg-alloy-stone/[0.04]" : "border-b border-alloy-stone/25 bg-alloy-stone/10";
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: rootCol,
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: tableWrap,
            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("table", {
                className: "w-full min-w-[760px] text-left text-sm",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("thead", {
                        className: theadRow,
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("tr", {
                            className: "text-[11px] font-semibold uppercase tracking-[0.12em] text-alloy-midnight/55",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("th", {
                                    className: "px-3 py-2",
                                    children: "Child"
                                }, void 0, false, {
                                    fileName: "[project]/components/admin/entity/OpportunityInquiryChildrenSection.tsx",
                                    lineNumber: 244,
                                    columnNumber: 29
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("th", {
                                    className: "px-3 py-2",
                                    children: "DOB / Age"
                                }, void 0, false, {
                                    fileName: "[project]/components/admin/entity/OpportunityInquiryChildrenSection.tsx",
                                    lineNumber: 245,
                                    columnNumber: 29
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("th", {
                                    className: "px-3 py-2",
                                    children: "Desired program"
                                }, void 0, false, {
                                    fileName: "[project]/components/admin/entity/OpportunityInquiryChildrenSection.tsx",
                                    lineNumber: 246,
                                    columnNumber: 29
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("th", {
                                    className: "px-3 py-2",
                                    children: "Desired schedule"
                                }, void 0, false, {
                                    fileName: "[project]/components/admin/entity/OpportunityInquiryChildrenSection.tsx",
                                    lineNumber: 247,
                                    columnNumber: 29
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("th", {
                                    className: "px-3 py-2",
                                    children: "Outcome"
                                }, void 0, false, {
                                    fileName: "[project]/components/admin/entity/OpportunityInquiryChildrenSection.tsx",
                                    lineNumber: 248,
                                    columnNumber: 29
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("th", {
                                    className: "px-3 py-2",
                                    children: "Notes"
                                }, void 0, false, {
                                    fileName: "[project]/components/admin/entity/OpportunityInquiryChildrenSection.tsx",
                                    lineNumber: 249,
                                    columnNumber: 29
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/components/admin/entity/OpportunityInquiryChildrenSection.tsx",
                            lineNumber: 243,
                            columnNumber: 25
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/components/admin/entity/OpportunityInquiryChildrenSection.tsx",
                        lineNumber: 242,
                        columnNumber: 21
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("tbody", {
                        children: [
                            loadErr ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("tr", {
                                className: "border-b border-alloy-stone/20 last:border-b-0",
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("td", {
                                    className: "px-3 py-2 text-sm text-red-700",
                                    colSpan: 6,
                                    children: loadErr
                                }, void 0, false, {
                                    fileName: "[project]/components/admin/entity/OpportunityInquiryChildrenSection.tsx",
                                    lineNumber: 255,
                                    columnNumber: 33
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/components/admin/entity/OpportunityInquiryChildrenSection.tsx",
                                lineNumber: 254,
                                columnNumber: 29
                            }, this) : null,
                            rows.map((r)=>{
                                const name = (r.display_name ?? "").trim() || "—";
                                const isMetadataOnly = (r.customer_member_id ?? "").startsWith("metadata_child:");
                                const dob = r.dob ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminFormatters$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["formatDate"])(r.dob) : "—";
                                const age = (r.age ?? "").trim();
                                const dobAge = age ? `${dob} · ${age}` : dob;
                                const st = local[r.id] ?? {
                                    desired_program_type: normalizeKey(r.desired_program_type),
                                    desired_schedule_type: normalizeKey(r.desired_schedule_type),
                                    outcome_status_key: normalizeKey(r.outcome_status_key),
                                    notes: (r.notes ?? "").toString()
                                };
                                const saving = !!savingById[r.id];
                                const err = errorById[r.id];
                                const rowCanEdit = canEdit && !isMetadataOnly;
                                const fallbackProgram = (r.desired_program_label ?? "").trim() || (st.desired_program_type ? programLabelByKey.get(st.desired_program_type) ?? st.desired_program_type : "—");
                                const fallbackSchedule = (r.desired_schedule_label ?? "").trim() || (st.desired_schedule_type ? scheduleLabelByKey.get(st.desired_schedule_type) ?? st.desired_schedule_type : "—");
                                const fallbackOutcome = (r.outcome_status_label ?? "").trim() || (st.outcome_status_key ? statusLabelByKey.get(st.outcome_status_key) ?? st.outcome_status_key : "—");
                                const attention = inquiryChildRowAttention({
                                    dob: r.dob,
                                    desiredProgramType: st.desired_program_type || normalizeKey(r.desired_program_type),
                                    desiredScheduleType: st.desired_schedule_type || normalizeKey(r.desired_schedule_type),
                                    outcomeKey: st.outcome_status_key,
                                    outcomeLabel: fallbackOutcome
                                });
                                const rowAttentionClass = attention ? "bg-amber-50/[0.38] [box-shadow:inset_3px_0_0_0_rgba(245,158,11,0.55)]" : "";
                                const outcomeSelectAttention = attention && isWaitlistedInquiryOutcome(st.outcome_status_key, fallbackOutcome) ? "border-amber-300/80 bg-amber-50/50" : "";
                                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("tr", {
                                    className: `border-b border-alloy-stone/20 last:border-b-0 ${rowAttentionClass}`,
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("td", {
                                            className: "px-3 py-2 font-medium text-alloy-midnight/85",
                                            children: onOpenChild && name !== "—" && !isMetadataOnly ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                type: "button",
                                                onClick: ()=>onOpenChild({
                                                        person_id: r.person_id,
                                                        customer_member_id: r.customer_member_id,
                                                        display_name: r.display_name
                                                    }),
                                                className: "text-left text-alloy-blue hover:underline font-semibold",
                                                children: name
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/entity/OpportunityInquiryChildrenSection.tsx",
                                                lineNumber: 297,
                                                columnNumber: 45
                                            }, this) : name
                                        }, void 0, false, {
                                            fileName: "[project]/components/admin/entity/OpportunityInquiryChildrenSection.tsx",
                                            lineNumber: 295,
                                            columnNumber: 37
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("td", {
                                            className: "px-3 py-2 text-alloy-midnight/65 tabular-nums",
                                            children: dobAge
                                        }, void 0, false, {
                                            fileName: "[project]/components/admin/entity/OpportunityInquiryChildrenSection.tsx",
                                            lineNumber: 314,
                                            columnNumber: 37
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("td", {
                                            className: "px-3 py-2 text-alloy-midnight/65",
                                            children: rowCanEdit ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                                                value: st.desired_program_type,
                                                disabled: !rowCanEdit || saving,
                                                onChange: (e)=>{
                                                    const v = e.target.value;
                                                    setLocal((p)=>({
                                                            ...p,
                                                            [r.id]: {
                                                                ...st,
                                                                desired_program_type: v
                                                            }
                                                        }));
                                                    debounced.schedule(r.id, {
                                                        desired_program_type: v || null
                                                    }, savePatch);
                                                },
                                                className: "w-full min-w-[150px] rounded-md border border-alloy-stone/40 bg-white px-2 py-1 text-sm disabled:opacity-60",
                                                "aria-label": `Desired program for ${name}`,
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                        value: "",
                                                        children: "(inherit)"
                                                    }, void 0, false, {
                                                        fileName: "[project]/components/admin/entity/OpportunityInquiryChildrenSection.tsx",
                                                        lineNumber: 328,
                                                        columnNumber: 49
                                                    }, this),
                                                    programItems.map((i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                            value: i.item_key,
                                                            children: i.label ?? i.item_key
                                                        }, i.item_key, false, {
                                                            fileName: "[project]/components/admin/entity/OpportunityInquiryChildrenSection.tsx",
                                                            lineNumber: 330,
                                                            columnNumber: 53
                                                        }, this))
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/components/admin/entity/OpportunityInquiryChildrenSection.tsx",
                                                lineNumber: 317,
                                                columnNumber: 45
                                            }, this) : fallbackProgram
                                        }, void 0, false, {
                                            fileName: "[project]/components/admin/entity/OpportunityInquiryChildrenSection.tsx",
                                            lineNumber: 315,
                                            columnNumber: 37
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("td", {
                                            className: "px-3 py-2 text-alloy-midnight/65",
                                            children: rowCanEdit ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                                                value: st.desired_schedule_type,
                                                disabled: !rowCanEdit || saving,
                                                onChange: (e)=>{
                                                    const v = e.target.value;
                                                    setLocal((p)=>({
                                                            ...p,
                                                            [r.id]: {
                                                                ...st,
                                                                desired_schedule_type: v
                                                            }
                                                        }));
                                                    debounced.schedule(r.id, {
                                                        desired_schedule_type: v || null
                                                    }, savePatch);
                                                },
                                                className: "w-full min-w-[150px] rounded-md border border-alloy-stone/40 bg-white px-2 py-1 text-sm disabled:opacity-60",
                                                "aria-label": `Desired schedule for ${name}`,
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                        value: "",
                                                        children: "(inherit)"
                                                    }, void 0, false, {
                                                        fileName: "[project]/components/admin/entity/OpportunityInquiryChildrenSection.tsx",
                                                        lineNumber: 352,
                                                        columnNumber: 49
                                                    }, this),
                                                    scheduleItems.map((i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                            value: i.item_key,
                                                            children: i.label ?? i.item_key
                                                        }, i.item_key, false, {
                                                            fileName: "[project]/components/admin/entity/OpportunityInquiryChildrenSection.tsx",
                                                            lineNumber: 354,
                                                            columnNumber: 53
                                                        }, this))
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/components/admin/entity/OpportunityInquiryChildrenSection.tsx",
                                                lineNumber: 341,
                                                columnNumber: 45
                                            }, this) : fallbackSchedule
                                        }, void 0, false, {
                                            fileName: "[project]/components/admin/entity/OpportunityInquiryChildrenSection.tsx",
                                            lineNumber: 339,
                                            columnNumber: 37
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("td", {
                                            className: "px-3 py-2 text-alloy-midnight/65",
                                            children: rowCanEdit ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                                                value: st.outcome_status_key,
                                                disabled: !rowCanEdit || saving,
                                                onChange: (e)=>{
                                                    const v = e.target.value;
                                                    setLocal((p)=>({
                                                            ...p,
                                                            [r.id]: {
                                                                ...st,
                                                                outcome_status_key: v
                                                            }
                                                        }));
                                                    debounced.schedule(r.id, {
                                                        outcome_status_key: v || null
                                                    }, savePatch);
                                                },
                                                className: `w-full min-w-[150px] rounded-md border border-alloy-stone/40 bg-white px-2 py-1 text-sm disabled:opacity-60 ${outcomeSelectAttention}`,
                                                "aria-label": `Outcome for ${name}`,
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                        value: "",
                                                        children: "—"
                                                    }, void 0, false, {
                                                        fileName: "[project]/components/admin/entity/OpportunityInquiryChildrenSection.tsx",
                                                        lineNumber: 376,
                                                        columnNumber: 49
                                                    }, this),
                                                    statusItems.map((s)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                            value: s.status_key,
                                                            children: s.status_label ?? s.status_key
                                                        }, s.status_key, false, {
                                                            fileName: "[project]/components/admin/entity/OpportunityInquiryChildrenSection.tsx",
                                                            lineNumber: 378,
                                                            columnNumber: 53
                                                        }, this))
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/components/admin/entity/OpportunityInquiryChildrenSection.tsx",
                                                lineNumber: 365,
                                                columnNumber: 45
                                            }, this) : fallbackOutcome
                                        }, void 0, false, {
                                            fileName: "[project]/components/admin/entity/OpportunityInquiryChildrenSection.tsx",
                                            lineNumber: 363,
                                            columnNumber: 37
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("td", {
                                            className: "px-3 py-2 text-alloy-midnight/65",
                                            children: rowCanEdit ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "min-w-[260px] max-w-[420px]",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                        value: st.notes,
                                                        disabled: !rowCanEdit || saving,
                                                        onChange: (e)=>{
                                                            const v = e.target.value;
                                                            setLocal((p)=>({
                                                                    ...p,
                                                                    [r.id]: {
                                                                        ...st,
                                                                        notes: v
                                                                    }
                                                                }));
                                                            debounced.schedule(r.id, {
                                                                notes: v
                                                            }, savePatch);
                                                        },
                                                        onBlur: ()=>debounced.flush(r.id, savePatch),
                                                        className: "w-full rounded-md border border-alloy-stone/40 bg-white px-2 py-1 text-sm disabled:opacity-60",
                                                        placeholder: "Add notes…",
                                                        "aria-label": `Notes for ${name}`
                                                    }, void 0, false, {
                                                        fileName: "[project]/components/admin/entity/OpportunityInquiryChildrenSection.tsx",
                                                        lineNumber: 390,
                                                        columnNumber: 49
                                                    }, this),
                                                    err ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: "mt-1 text-[11px] font-medium text-red-700",
                                                        children: err
                                                    }, void 0, false, {
                                                        fileName: "[project]/components/admin/entity/OpportunityInquiryChildrenSection.tsx",
                                                        lineNumber: 403,
                                                        columnNumber: 56
                                                    }, this) : null,
                                                    saving ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: "mt-1 text-[11px] font-medium text-alloy-midnight/45",
                                                        children: "Saving…"
                                                    }, void 0, false, {
                                                        fileName: "[project]/components/admin/entity/OpportunityInquiryChildrenSection.tsx",
                                                        lineNumber: 404,
                                                        columnNumber: 59
                                                    }, this) : null
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/components/admin/entity/OpportunityInquiryChildrenSection.tsx",
                                                lineNumber: 389,
                                                columnNumber: 45
                                            }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "block max-w-[280px] truncate",
                                                title: normalizeKey(r.notes) ? String(r.notes) : undefined,
                                                children: normalizeKey(r.notes) ? String(r.notes).trim() : "—"
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/entity/OpportunityInquiryChildrenSection.tsx",
                                                lineNumber: 407,
                                                columnNumber: 45
                                            }, this)
                                        }, void 0, false, {
                                            fileName: "[project]/components/admin/entity/OpportunityInquiryChildrenSection.tsx",
                                            lineNumber: 387,
                                            columnNumber: 37
                                        }, this)
                                    ]
                                }, r.id, true, {
                                    fileName: "[project]/components/admin/entity/OpportunityInquiryChildrenSection.tsx",
                                    lineNumber: 294,
                                    columnNumber: 33
                                }, this);
                            })
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/admin/entity/OpportunityInquiryChildrenSection.tsx",
                        lineNumber: 252,
                        columnNumber: 21
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/admin/entity/OpportunityInquiryChildrenSection.tsx",
                lineNumber: 241,
                columnNumber: 17
            }, this)
        }, void 0, false, {
            fileName: "[project]/components/admin/entity/OpportunityInquiryChildrenSection.tsx",
            lineNumber: 240,
            columnNumber: 13
        }, this)
    }, void 0, false, {
        fileName: "[project]/components/admin/entity/OpportunityInquiryChildrenSection.tsx",
        lineNumber: 239,
        columnNumber: 9
    }, this);
}
}),
];

//# sourceMappingURL=components_admin_entity_5f4a0e9f._.js.map