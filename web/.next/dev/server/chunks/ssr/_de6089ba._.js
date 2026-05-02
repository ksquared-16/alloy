module.exports = [
"[project]/styles/tokens/colors.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Alloy design tokens — confirmed brand palette only.
 * Use these tokens everywhere in adminV2; no hardcoded hex in components.
 *
 * Confirmed brand colors only:
 * - River Stone, Alloy Blue, Bend Pine, Juniper Ember, Midnight Forge
 * Derived tints use only these five (opacity or blend).
 */ /** Confirmed Alloy brand palette — no invented colors */ __turbopack_context__.s([
    "brand",
    ()=>brand,
    "colors",
    ()=>colors,
    "default",
    ()=>__TURBOPACK__default__export__,
    "derived",
    ()=>derived,
    "neutral",
    ()=>neutral,
    "palette",
    ()=>palette,
    "semantic",
    ()=>semantic
]);
const palette = {
    /** Slightly lifted vs legacy F4F6F9 — cleaner ambient read with white cards */ riverStone: "#F6F8FC",
    alloyBlue: "#00458C",
    bendPine: "#00A283",
    juniperEmber: "#BC4300",
    midnightForge: "#273F52"
};
const derived = {
    /** Border: Midnight Forge at low opacity */ border: "rgba(39, 63, 82, 0.18)",
    /** Secondary text: Midnight Forge at medium opacity */ textSecondary: "rgba(39, 63, 82, 0.65)",
    /** Top bar divider / subtle edge on primary */ topBarDivider: "rgba(255, 255, 255, 0.15)",
    /** Search field background on primary (top bar) */ searchBgOnPrimary: "rgba(255, 255, 255, 0.12)",
    /** Active tab background on primary */ tabActiveOnPrimary: "rgba(255, 255, 255, 0.2)",
    /** Mask / overlay (e.g. minimap) */ maskOverlay: "rgba(39, 63, 82, 0.06)",
    /** Subtle panel shadow (e.g. bottom command bar) */ panelShadow: "0 -1px 4px rgba(39, 63, 82, 0.08)",
    /** Card / node shadow */ cardShadow: "0 2px 8px rgba(39, 63, 82, 0.08)",
    /** Node elevation (slightly stronger for focus) */ nodeElevation: "0 4px 12px rgba(39, 63, 82, 0.1)",
    /** KPI band — subtle AI-side wash (Alloy Blue) */ kpiBandAiWash: "rgba(0, 69, 140, 0.04)",
    /** KPI band — subtle Business-side wash (Bend Pine) */ kpiBandBusinessWash: "rgba(0, 162, 131, 0.05)",
    /** System node subtle tint (department card) */ nodeSurfaceTint: "rgba(0, 69, 140, 0.04)",
    /** Canvas field — slightly cooler than page bg (depth) */ canvasFieldWash: "rgba(39, 63, 82, 0.028)",
    /** Canvas subtle vertical depth */ canvasFieldDepth: "rgba(39, 63, 82, 0.046)",
    /** Inspector column wash */ inspectorColumnWash: "rgba(0, 69, 140, 0.018)",
    /** Inspector left edge depth */ inspectorEdgeShadow: "-6px 0 18px rgba(39, 63, 82, 0.06)",
    /** Inspector vs dark org-chart field (light touch) */ inspectorChamberSeparation: "-4px 0 28px rgba(39, 63, 82, 0.07)",
    /** Inspector rail — airy surfaces */ inspectorRailWash: "rgba(244, 246, 249, 0.35)",
    inspectorListHairline: "rgba(39, 63, 82, 0.07)",
    inspectorCardQuiet: "rgba(255, 255, 255, 0.98)",
    inspectorSectionMuted: "rgba(39, 63, 82, 0.5)",
    /** Command rail — lighter than chamber, soft premium (not harsh white) */ inspectorCommandRail: "rgba(252, 253, 255, 0.97)",
    inspectorCommandRailWash: "rgba(248, 250, 252, 0.92)",
    inspectorCommandHairline: "rgba(39, 63, 82, 0.055)",
    /** Node resting shadow — sits above canvas */ nodeOnCanvasShadow: "0 6px 16px rgba(39, 63, 82, 0.12)",
    /** Node active / elevated */ nodeOnCanvasShadowActive: "0 8px 22px rgba(39, 63, 82, 0.14)",
    /** Ripple pulse (Alloy Blue, very low) */ rippleGlow: "rgba(0, 69, 140, 0.14)",
    /** KPI band elevation */ kpiBandShadow: "0 2px 10px rgba(39, 63, 82, 0.06)",
    /** Stronger AI / Business contrast in KPI band */ kpiBandAiWashStrong: "rgba(0, 69, 140, 0.065)",
    kpiBandBusinessWashStrong: "rgba(0, 162, 131, 0.075)",
    /** Active canvas field — noticeably warmer than page chrome */ canvasFieldActive: "rgba(0, 69, 140, 0.045)",
    /** Radial wash core (command field) */ canvasRadialCore: "rgba(0, 69, 140, 0.07)",
    canvasRadialMid: "rgba(0, 162, 131, 0.04)",
    canvasRadialEdge: "rgba(39, 63, 82, 0.03)",
    /** Ambient focus halo (multi-stop radial, low) */ ambientBloomInner: "rgba(0, 69, 140, 0.09)",
    ambientBloomOuter: "rgba(0, 162, 131, 0.05)",
    /** Orbiting spec dots */ ambientSpec: "rgba(0, 69, 140, 0.28)",
    ambientSpecAlt: "rgba(0, 162, 131, 0.22)",
    /** KPI / chrome deck */ chromeDeckBg: "rgba(255, 255, 255, 0.98)",
    /**
   * PROOF PASS — exaggerate for screenshots; tone down for production.
   * Canvas “chamber”: darker, higher contrast vs chrome.
   */ canvasProofBase: "rgba(39, 63, 82, 0.11)",
    canvasProofRadialStrong: "rgba(0, 69, 140, 0.24)",
    canvasProofRadialMid: "rgba(0, 162, 131, 0.14)",
    canvasProofFloor: "rgba(39, 63, 82, 0.08)",
    canvasProofVignette: "rgba(39, 63, 82, 0.18)",
    /** Ambient field — proof visibility */ ambientProofBloomCore: "rgba(0, 69, 140, 0.42)",
    ambientProofBloomMid: "rgba(0, 162, 131, 0.28)",
    ambientProofBloomEdge: "rgba(0, 69, 140, 0.14)",
    ambientProofSpec: "rgba(0, 69, 140, 0.92)",
    ambientProofSpecAlt: "rgba(0, 162, 131, 0.88)",
    /** Canvas dot grid — proof contrast */ canvasProofGridDot: "rgba(39, 63, 82, 0.16)",
    /**
   * Operational chamber — dark org-chart field (Midnight Forge + Alloy Blue depth).
   * Contrasts with light KPI rail above.
   */ canvasChamberBase: "rgba(39, 63, 82, 1)",
    canvasChamberDeep: "rgba(39, 63, 82, 0.92)",
    canvasChamberBlueMist: "rgba(0, 69, 140, 0.32)",
    canvasChamberBlueDepth: "rgba(0, 69, 140, 0.18)",
    canvasChamberPineDrift: "rgba(0, 162, 131, 0.08)",
    canvasChamberVignetteEdge: "rgba(0, 69, 140, 0.45)",
    /** Dots on dark field (River Stone white, minimal) */ canvasChamberGridDot: "rgba(255, 255, 255, 0.06)",
    /**
   * Bend Pine — “life” / motion / vitality (not full UI green-out).
   */ ambientLifeBloomCore: "rgba(0, 162, 131, 0.11)",
    ambientLifeBloomMid: "rgba(0, 162, 131, 0.055)",
    ambientLifeBloomEdge: "rgba(0, 162, 131, 0.024)",
    ambientLifeSpec: "rgba(0, 162, 131, 0.5)",
    ambientLifeSpecSoft: "rgba(0, 162, 131, 0.28)",
    /** Company view — higher-contrast specs (still calmer than focus) */ ambientCompanySpecVivid: "rgba(0, 162, 131, 0.78)",
    ambientCompanySpecMid: "rgba(0, 162, 131, 0.55)",
    ambientCompanyBloomLift: "rgba(0, 162, 131, 0.2)",
    /** Company particles — high read on dark chamber */ ambientCompanyParticleBright: "rgba(0, 220, 185, 0.95)",
    ambientCompanyParticleCore: "rgba(0, 162, 131, 0.95)",
    /** Focus field — extra drift visibility (behind cards) */ ambientFocusDriftBright: "rgba(0, 162, 131, 0.55)",
    ambientFocusRingPine: "rgba(0, 162, 131, 0.42)",
    ambientLifeGlow: "rgba(0, 162, 131, 0.22)",
    /** Focus / department — pine-forward bloom, blue structure */ ambientFocusLifeCore: "rgba(0, 162, 131, 0.36)",
    ambientFocusLifeMid: "rgba(0, 162, 131, 0.2)",
    ambientFocusLifeEdge: "rgba(0, 69, 140, 0.16)",
    ambientFocusLifeSpec: "rgba(0, 162, 131, 0.92)",
    ambientFocusLifeSpecAlt: "rgba(0, 162, 131, 0.55)",
    /** White cards on dark chamber (depth via Midnight Forge) */ nodeOnChamberShadow: "0 12px 36px rgba(39, 63, 82, 0.42), 0 4px 14px rgba(39, 63, 82, 0.28)",
    nodeOnChamberShadowActive: "0 16px 44px rgba(39, 63, 82, 0.48), 0 0 0 1px rgba(0, 162, 131, 0.4)",
    /** KPI rail — extra light, calm */ kpiRailWash: "rgba(244, 246, 249, 0.65)",
    kpiBandBusinessLight: "rgba(0, 162, 131, 0.04)",
    kpiBandAiLight: "rgba(0, 69, 140, 0.032)",
    /** adminV2 — subtle Juniper Ember system boundaries (not alert tone) */ adminV2BoundaryAmber: "rgba(188, 67, 0, 0.24)",
    adminV2BoundaryAmberInset: "rgba(188, 67, 0, 0.2)",
    /** AI command bar — Bend Pine tints */ adminV2AiBarPineWash: "rgba(0, 162, 131, 0.09)",
    adminV2AiBarPineBorder: "rgba(0, 162, 131, 0.38)",
    adminV2AiInputPineRing: "rgba(0, 162, 131, 0.32)"
};
const brand = {
    primary: palette.alloyBlue,
    secondary: palette.bendPine,
    accent: palette.juniperEmber
};
const neutral = {
    background: palette.riverStone,
    surface: "#FFFFFF",
    textPrimary: palette.midnightForge,
    textSecondary: derived.textSecondary,
    border: derived.border
};
const semantic = {
    success: palette.bendPine,
    warning: palette.juniperEmber,
    info: palette.alloyBlue
};
const colors = {
    palette,
    derived,
    brand,
    neutral,
    semantic
};
const __TURBOPACK__default__export__ = colors;
}),
"[project]/app/adminV2/components/navigation/AdminV2NavLink.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "AdminV2NavLink",
    ()=>AdminV2NavLink
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/client/app-dir/link.js [app-ssr] (ecmascript)");
"use client";
;
;
;
function NavLinkInner({ children }) {
    const { pending } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useLinkStatus"])();
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
        "data-adminv2-nav-pending": pending ? "true" : undefined,
        className: pending ? "adminv2-nav-link__inner adminv2-nav-link__inner--pending" : "adminv2-nav-link__inner",
        children: children
    }, void 0, false, {
        fileName: "[project]/app/adminV2/components/navigation/AdminV2NavLink.tsx",
        lineNumber: 10,
        columnNumber: 9
    }, this);
}
function AdminV2NavLink({ className, active, children, ...rest }) {
    const merged = [
        "adminv2-nav-link",
        active ? "adminv2-nav-link--active" : "",
        className
    ].filter(Boolean).join(" ");
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
        ...rest,
        className: merged,
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(NavLinkInner, {
            children: children
        }, void 0, false, {
            fileName: "[project]/app/adminV2/components/navigation/AdminV2NavLink.tsx",
            lineNumber: 34,
            columnNumber: 13
        }, this)
    }, void 0, false, {
        fileName: "[project]/app/adminV2/components/navigation/AdminV2NavLink.tsx",
        lineNumber: 33,
        columnNumber: 9
    }, this);
}
}),
"[project]/app/adminV2/components/TopNavBar.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>TopNavBar
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/navigation.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$navigation$2f$AdminV2NavLink$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/adminV2/components/navigation/AdminV2NavLink.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabaseClient$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/supabaseClient.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/styles/tokens/colors.ts [app-ssr] (ecmascript)");
"use client";
;
;
;
;
;
;
function normalizeAdminPath(pathname) {
    if (pathname === "/admin/v2" || pathname.startsWith("/admin/v2/")) {
        if (pathname === "/admin/v2") return "/adminV2/workspace";
        return `/adminV2${pathname.slice("/admin/v2".length)}`;
    }
    if (pathname === "/adminv2" || pathname.startsWith("/adminv2/")) {
        return `/adminV2${pathname.slice("/adminv2".length)}`;
    }
    return pathname;
}
const WORK_UNIT_QUEUE_PATH = /^\/adminV2\/workspace\/dept\/[^/]+\/work-unit\/[^/]+\/?$/;
function TopNavBar() {
    const pathname = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["usePathname"])();
    const searchParams = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useSearchParams"])();
    const router = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRouter"])();
    const normalizedPath = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>normalizeAdminPath(pathname), [
        pathname
    ]);
    const isQueueContext = WORK_UNIT_QUEUE_PATH.test(normalizedPath);
    const isWorkspaceOverview = (normalizedPath === "/adminV2/workspace" || /^\/adminV2\/workspace\/dept\/[^/]+\/?$/.test(normalizedPath)) && !isQueueContext;
    const isAiActivity = normalizedPath === "/adminV2/ai-activity";
    const queueHref = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        if (isQueueContext) {
            const qs = searchParams?.toString() ?? "";
            return qs ? `${normalizedPath}?${qs}` : normalizedPath;
        }
        return "/adminV2/workspace";
    }, [
        isQueueContext,
        normalizedPath,
        searchParams
    ]);
    const tabStyle = (active)=>active ? {
            backgroundColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].tabActiveOnPrimary,
            color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].surface
        } : {
            opacity: 0.88,
            color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].surface
        };
    const secondaryTabStyle = (active)=>active ? {
            backgroundColor: "rgba(255,255,255,0.14)",
            color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].surface,
            opacity: 1
        } : {
            opacity: 0.55,
            color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].surface
        };
    const onSignOut = async ()=>{
        const supabase = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabaseClient$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["createClient"])();
        await supabase.auth.signOut();
        router.push("/login");
        router.refresh();
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("header", {
        className: "flex items-center h-12 flex-shrink-0 px-4 gap-4 border-b",
        style: {
            backgroundColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["palette"].midnightForge,
            borderColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].topBarDivider,
            color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].surface
        },
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-center shrink-0",
                "aria-label": "Alloy",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("img", {
                    src: "/brand/alloy-brandmark-gradient.svg",
                    alt: "",
                    width: 32,
                    height: 32,
                    className: "h-8 w-8 shrink-0"
                }, void 0, false, {
                    fileName: "[project]/app/adminV2/components/TopNavBar.tsx",
                    lineNumber: 71,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/app/adminV2/components/TopNavBar.tsx",
                lineNumber: 70,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex-1 max-w-md rounded-md px-3 py-1.5 text-sm",
                style: {
                    backgroundColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].searchBgOnPrimary,
                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].surface
                },
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                    style: {
                        opacity: 0.92
                    },
                    children: "Search"
                }, void 0, false, {
                    fileName: "[project]/app/adminV2/components/TopNavBar.tsx",
                    lineNumber: 86,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/app/adminV2/components/TopNavBar.tsx",
                lineNumber: 79,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("nav", {
                className: "flex items-center gap-1 shrink-0",
                "aria-label": "Perspective tabs",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$navigation$2f$AdminV2NavLink$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AdminV2NavLink"], {
                        href: "/adminV2/workspace",
                        active: isWorkspaceOverview,
                        className: "px-2 py-1 rounded text-xs font-medium",
                        style: tabStyle(isWorkspaceOverview),
                        children: "Overview"
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/TopNavBar.tsx",
                        lineNumber: 89,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$navigation$2f$AdminV2NavLink$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AdminV2NavLink"], {
                        href: queueHref,
                        active: isQueueContext,
                        className: "px-2 py-1 rounded text-xs font-medium",
                        style: tabStyle(isQueueContext),
                        title: "Opens the current work unit queue when you are in workspace queue context; otherwise Workspace.",
                        children: "Queue"
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/TopNavBar.tsx",
                        lineNumber: 97,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$navigation$2f$AdminV2NavLink$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AdminV2NavLink"], {
                        href: "/adminV2/ai-activity",
                        active: isAiActivity,
                        className: "px-2 py-1 rounded text-[11px] font-normal",
                        style: secondaryTabStyle(isAiActivity),
                        title: "Full AI apply history (recent actions also appear above the command bar)",
                        children: "AI log"
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/TopNavBar.tsx",
                        lineNumber: 106,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/app/adminV2/components/TopNavBar.tsx",
                lineNumber: 88,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                type: "button",
                onClick: onSignOut,
                className: "px-2 py-1 rounded text-[11px] font-medium",
                style: {
                    opacity: 0.78,
                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].surface,
                    border: `1px solid ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].topBarDivider}`
                },
                children: "Sign out"
            }, void 0, false, {
                fileName: "[project]/app/adminV2/components/TopNavBar.tsx",
                lineNumber: 116,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/app/adminV2/components/TopNavBar.tsx",
        lineNumber: 62,
        columnNumber: 5
    }, this);
}
}),
"[project]/lib/workspace/workspaceDataFetch.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/** Shared timeout for admin workspace client fetches — avoids one stalled request blocking UI forever. */ __turbopack_context__.s([
    "WORKSPACE_DATA_FETCH_MS",
    ()=>WORKSPACE_DATA_FETCH_MS,
    "workspaceDataFetchInit",
    ()=>workspaceDataFetchInit
]);
const WORKSPACE_DATA_FETCH_MS = 45_000;
function workspaceDataFetchInit() {
    const timeout = AbortSignal.timeout;
    if (typeof timeout === "function") {
        return {
            signal: timeout(WORKSPACE_DATA_FETCH_MS)
        };
    }
    return undefined;
}
}),
"[project]/lib/workspace/workspaceAdminFetchDedupe.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Coalesces identical in-flight GETs so mounts that share the same URL
 * (e.g. sidebar + workspace data hook) do not double-hit the API on cold navigation.
 *
 * Important: callers must receive **independent clones** — the Fetch spec allows only one consumer
 * to read each Response body stream. Returning the raw shared Response causes the second `.json()`
 * to fail or yield `{}`, breaking department lookup ("Department not found for this organization").
 */ __turbopack_context__.s([
    "dedupeAdminFetch",
    ()=>dedupeAdminFetch,
    "dedupeAdminFetchWithTtl",
    ()=>dedupeAdminFetchWithTtl
]);
const inflight = new Map();
function dedupeAdminFetch(input, init) {
    const key = input;
    let p = inflight.get(key);
    if (!p) {
        p = fetch(input, init).finally(()=>{
            inflight.delete(key);
        });
        inflight.set(key, p);
    }
    return p.then((res)=>res.clone());
}
const shortCache = new Map();
async function dedupeAdminFetchWithTtl(input, init, ttlMs) {
    const method = (init?.method ?? "GET").toUpperCase();
    const key = input;
    if (method === "GET" && ttlMs > 0) {
        const hit = shortCache.get(key);
        if (hit && Date.now() - hit.atMs < ttlMs) {
            return new Response(hit.bodyText, {
                status: hit.status,
                statusText: hit.statusText,
                headers: hit.headers
            });
        }
    }
    const res = await dedupeAdminFetch(input, init);
    if (method === "GET" && ttlMs > 0) {
        try {
            const clone = res.clone();
            const bodyText = await clone.text();
            shortCache.set(key, {
                atMs: Date.now(),
                status: res.status,
                statusText: res.statusText,
                headers: Array.from(res.headers.entries()),
                bodyText
            });
            // bounded growth: clear oldest-ish by size.
            if (shortCache.size > 50) {
                const first = shortCache.keys().next().value;
                if (first) shortCache.delete(first);
            }
        } catch  {
        // ignore cache failures (e.g. non-cloneable)
        }
    }
    return res;
}
}),
"[project]/app/adminV2/components/Sidebar.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>Sidebar
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/navigation.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$building$2d$2$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Building2$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/building-2.js [app-ssr] (ecmascript) <export default as Building2>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$boxes$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Boxes$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/boxes.js [app-ssr] (ecmascript) <export default as Boxes>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$git$2d$branch$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__GitBranch$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/git-branch.js [app-ssr] (ecmascript) <export default as GitBranch>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$layout$2d$grid$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__LayoutGrid$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/layout-grid.js [app-ssr] (ecmascript) <export default as LayoutGrid>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$panel$2d$left$2d$close$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__PanelLeftClose$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/panel-left-close.js [app-ssr] (ecmascript) <export default as PanelLeftClose>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$panel$2d$left$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__PanelLeft$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/panel-left.js [app-ssr] (ecmascript) <export default as PanelLeft>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$settings$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Settings$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/settings.js [app-ssr] (ecmascript) <export default as Settings>");
var __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/styles/tokens/colors.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$navigation$2f$AdminV2NavLink$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/adminV2/components/navigation/AdminV2NavLink.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$workspaceDataFetch$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/workspace/workspaceDataFetch.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$workspaceAdminFetchDedupe$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/workspace/workspaceAdminFetchDedupe.ts [app-ssr] (ecmascript)");
"use client";
;
;
;
;
;
;
;
;
const WORKSPACE = "/adminV2/workspace";
const SETTINGS_HREF = "/adminV2/settings";
function normalizeAdminPath(pathname) {
    if (pathname === "/admin/v2" || pathname.startsWith("/admin/v2/")) {
        if (pathname === "/admin/v2") return "/adminV2/workspace";
        return `/adminV2${pathname.slice("/admin/v2".length)}`;
    }
    if (pathname === "/adminv2" || pathname.startsWith("/adminv2/")) {
        return `/adminV2${pathname.slice("/adminv2".length)}`;
    }
    return pathname;
}
function parseWorkspaceRoute(path) {
    const m = /^\/adminV2\/workspace\/dept\/([^/]+)(?:\/work-unit\/([^/]+))?\/?$/.exec(path);
    if (!m) return {
        departmentId: null,
        workUnitId: null
    };
    return {
        departmentId: m[1] ?? null,
        workUnitId: m[2] ?? null
    };
}
function Sidebar({ collapsed, onToggle }) {
    const pathname = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["usePathname"])();
    const path = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>normalizeAdminPath(pathname), [
        pathname
    ]);
    const { departmentId, workUnitId } = parseWorkspaceRoute(path);
    const onWorkspace = path === WORKSPACE || path.startsWith(`${WORKSPACE}/`);
    const onSettings = path.startsWith(SETTINGS_HREF);
    const onWorkflows = path.startsWith("/adminV2/workflows");
    const [depts, setDepts] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])([]);
    const [wus, setWus] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])([]);
    const [treeError, setTreeError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (collapsed) return;
        let cancelled = false;
        (async ()=>{
            try {
                const init = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$workspaceDataFetch$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["workspaceDataFetchInit"])();
                const [dRes, wRes] = await Promise.all([
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$workspaceAdminFetchDedupe$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["dedupeAdminFetch"])("/api/admin/departments", init),
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$workspaceAdminFetchDedupe$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["dedupeAdminFetch"])("/api/admin/work-units", init)
                ]);
                const dj = await dRes.json().catch(()=>({}));
                const wj = await wRes.json().catch(()=>({}));
                if (cancelled) return;
                setTreeError(null);
                if (dRes.ok) setDepts(dj.items ?? []);
                else setTreeError("Departments unavailable");
                if (wRes.ok) setWus(wj.items ?? []);
            } catch  {
                if (!cancelled) setTreeError("Navigation data unavailable");
            }
        })();
        return ()=>{
            cancelled = true;
        };
    }, [
        collapsed
    ]);
    const deptsSorted = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        return [
            ...depts
        ].filter((d)=>{
            const key = String(d.key ?? "").trim().toLowerCase();
            const name = String(d.name ?? "").trim().toLowerCase();
            return key !== "system" && name !== "system";
        }).sort((a, b)=>(a.name ?? a.id).localeCompare(b.name ?? b.id));
    }, [
        depts
    ]);
    const wusByDept = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        const m = new Map();
        for (const w of wus){
            const k = w.department_id;
            if (!m.has(k)) m.set(k, []);
            m.get(k).push(w);
        }
        for (const arr of m.values()){
            arr.sort((a, b)=>(a.name ?? a.id).localeCompare(b.name ?? b.id));
        }
        return m;
    }, [
        wus
    ]);
    const railWidth = collapsed ? 56 : 280;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("aside", {
        className: "flex flex-col flex-shrink-0 min-h-0 border-r transition-[width] duration-200 ease-out overflow-hidden",
        style: {
            width: railWidth,
            backgroundColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].surface,
            borderColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].border
        },
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                type: "button",
                onClick: onToggle,
                className: "flex items-center justify-center h-12 w-full flex-shrink-0 hover:opacity-90 active:scale-[0.98] transition-transform",
                style: {
                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["brand"].primary
                },
                "aria-label": collapsed ? "Expand sidebar" : "Collapse sidebar",
                children: collapsed ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$panel$2d$left$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__PanelLeft$3e$__["PanelLeft"], {
                    size: 20
                }, void 0, false, {
                    fileName: "[project]/app/adminV2/components/Sidebar.tsx",
                    lineNumber: 119,
                    columnNumber: 30
                }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$panel$2d$left$2d$close$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__PanelLeftClose$3e$__["PanelLeftClose"], {
                    size: 20
                }, void 0, false, {
                    fileName: "[project]/app/adminV2/components/Sidebar.tsx",
                    lineNumber: 119,
                    columnNumber: 56
                }, this)
            }, void 0, false, {
                fileName: "[project]/app/adminV2/components/Sidebar.tsx",
                lineNumber: 112,
                columnNumber: 13
            }, this),
            collapsed ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("nav", {
                className: "flex flex-col flex-1 min-h-0 px-1.5 pb-2",
                "aria-label": "Workspace navigation",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex min-h-0 flex-1 flex-col items-stretch gap-1 overflow-y-auto",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$navigation$2f$AdminV2NavLink$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AdminV2NavLink"], {
                                href: WORKSPACE,
                                title: "Workspace",
                                "aria-label": "Workspace",
                                active: path === WORKSPACE,
                                className: "adminv2-sidebar-rail-link",
                                style: {
                                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["brand"].primary
                                },
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$layout$2d$grid$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__LayoutGrid$3e$__["LayoutGrid"], {
                                    size: 20,
                                    strokeWidth: 1.75
                                }, void 0, false, {
                                    fileName: "[project]/app/adminV2/components/Sidebar.tsx",
                                    lineNumber: 136,
                                    columnNumber: 29
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/app/adminV2/components/Sidebar.tsx",
                                lineNumber: 128,
                                columnNumber: 25
                            }, this),
                            departmentId ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$navigation$2f$AdminV2NavLink$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AdminV2NavLink"], {
                                href: `${WORKSPACE}/dept/${departmentId}`,
                                title: "Department",
                                "aria-label": "Department",
                                active: Boolean(departmentId && !workUnitId),
                                className: "adminv2-sidebar-rail-link",
                                style: {
                                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["brand"].primary
                                },
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$building$2d$2$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Building2$3e$__["Building2"], {
                                    size: 20,
                                    strokeWidth: 1.75
                                }, void 0, false, {
                                    fileName: "[project]/app/adminV2/components/Sidebar.tsx",
                                    lineNumber: 147,
                                    columnNumber: 33
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/app/adminV2/components/Sidebar.tsx",
                                lineNumber: 139,
                                columnNumber: 29
                            }, this) : null,
                            departmentId && workUnitId ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$navigation$2f$AdminV2NavLink$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AdminV2NavLink"], {
                                href: `${WORKSPACE}/dept/${departmentId}/work-unit/${workUnitId}`,
                                title: "Work unit",
                                "aria-label": "Work unit",
                                active: true,
                                className: "adminv2-sidebar-rail-link",
                                style: {
                                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["brand"].primary
                                },
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$boxes$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Boxes$3e$__["Boxes"], {
                                    size: 20,
                                    strokeWidth: 1.75
                                }, void 0, false, {
                                    fileName: "[project]/app/adminV2/components/Sidebar.tsx",
                                    lineNumber: 159,
                                    columnNumber: 33
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/app/adminV2/components/Sidebar.tsx",
                                lineNumber: 151,
                                columnNumber: 29
                            }, this) : null
                        ]
                    }, void 0, true, {
                        fileName: "[project]/app/adminV2/components/Sidebar.tsx",
                        lineNumber: 127,
                        columnNumber: 21
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "mt-auto flex flex-shrink-0 flex-col items-stretch gap-1 border-t pt-1",
                        style: {
                            borderColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].border
                        },
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$navigation$2f$AdminV2NavLink$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AdminV2NavLink"], {
                                href: "/adminV2/workflows",
                                title: "Automations",
                                "aria-label": "Automations",
                                active: onWorkflows,
                                className: "adminv2-sidebar-rail-link",
                                style: {
                                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["brand"].primary
                                },
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$git$2d$branch$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__GitBranch$3e$__["GitBranch"], {
                                    size: 20,
                                    strokeWidth: 1.75
                                }, void 0, false, {
                                    fileName: "[project]/app/adminV2/components/Sidebar.tsx",
                                    lineNumber: 172,
                                    columnNumber: 29
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/app/adminV2/components/Sidebar.tsx",
                                lineNumber: 164,
                                columnNumber: 25
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$navigation$2f$AdminV2NavLink$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AdminV2NavLink"], {
                                href: SETTINGS_HREF,
                                title: "Settings",
                                "aria-label": "Settings",
                                active: onSettings,
                                className: "adminv2-sidebar-rail-link",
                                style: {
                                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["brand"].primary
                                },
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$settings$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Settings$3e$__["Settings"], {
                                    size: 20,
                                    strokeWidth: 1.75
                                }, void 0, false, {
                                    fileName: "[project]/app/adminV2/components/Sidebar.tsx",
                                    lineNumber: 182,
                                    columnNumber: 29
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/app/adminV2/components/Sidebar.tsx",
                                lineNumber: 174,
                                columnNumber: 25
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/app/adminV2/components/Sidebar.tsx",
                        lineNumber: 163,
                        columnNumber: 21
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/app/adminV2/components/Sidebar.tsx",
                lineNumber: 123,
                columnNumber: 17
            }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex flex-col flex-1 min-h-0 px-2 pb-3 gap-2 text-[13px] overflow-y-auto",
                style: {
                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].textSecondary
                },
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "pt-1 font-semibold text-[11px] tracking-wide",
                        style: {
                            color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].textSecondary
                        },
                        children: "Navigate"
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/Sidebar.tsx",
                        lineNumber: 191,
                        columnNumber: 21
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$navigation$2f$AdminV2NavLink$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AdminV2NavLink"], {
                        href: WORKSPACE,
                        active: path === WORKSPACE,
                        className: "rounded-md px-2 py-1.5 font-medium text-alloy-midnight/85 hover:bg-alloy-stone/10",
                        style: {
                            color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["brand"].primary
                        },
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "inline-flex items-center gap-2",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$layout$2d$grid$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__LayoutGrid$3e$__["LayoutGrid"], {
                                    size: 16,
                                    strokeWidth: 1.75
                                }, void 0, false, {
                                    fileName: "[project]/app/adminV2/components/Sidebar.tsx",
                                    lineNumber: 201,
                                    columnNumber: 29
                                }, this),
                                "Workspace"
                            ]
                        }, void 0, true, {
                            fileName: "[project]/app/adminV2/components/Sidebar.tsx",
                            lineNumber: 200,
                            columnNumber: 25
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/Sidebar.tsx",
                        lineNumber: 194,
                        columnNumber: 21
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$navigation$2f$AdminV2NavLink$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AdminV2NavLink"], {
                        href: "/adminV2/workflows",
                        active: onWorkflows,
                        className: "rounded-md px-2 py-1.5 font-medium text-alloy-midnight/85 hover:bg-alloy-stone/10",
                        style: {
                            color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["brand"].primary
                        },
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "inline-flex items-center gap-2",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$git$2d$branch$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__GitBranch$3e$__["GitBranch"], {
                                    size: 16,
                                    strokeWidth: 1.75
                                }, void 0, false, {
                                    fileName: "[project]/app/adminV2/components/Sidebar.tsx",
                                    lineNumber: 212,
                                    columnNumber: 29
                                }, this),
                                "Automations"
                            ]
                        }, void 0, true, {
                            fileName: "[project]/app/adminV2/components/Sidebar.tsx",
                            lineNumber: 211,
                            columnNumber: 25
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/Sidebar.tsx",
                        lineNumber: 205,
                        columnNumber: 21
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "pt-2",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "mb-1 flex items-center justify-between px-2 text-[11px] font-semibold tracking-wide",
                                style: {
                                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].textSecondary
                                },
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        children: "Departments"
                                    }, void 0, false, {
                                        fileName: "[project]/app/adminV2/components/Sidebar.tsx",
                                        lineNumber: 222,
                                        columnNumber: 29
                                    }, this),
                                    treeError ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "normal-case font-medium text-red-700/70",
                                        children: "Unavailable"
                                    }, void 0, false, {
                                        fileName: "[project]/app/adminV2/components/Sidebar.tsx",
                                        lineNumber: 223,
                                        columnNumber: 42
                                    }, this) : null
                                ]
                            }, void 0, true, {
                                fileName: "[project]/app/adminV2/components/Sidebar.tsx",
                                lineNumber: 218,
                                columnNumber: 25
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "space-y-1",
                                children: deptsSorted.map((d)=>{
                                    const name = (d.name ?? "").trim() || "Untitled department";
                                    const deptHref = `${WORKSPACE}/dept/${d.id}`;
                                    const deptActive = departmentId === d.id && !workUnitId;
                                    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "space-y-1",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$navigation$2f$AdminV2NavLink$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AdminV2NavLink"], {
                                                href: deptHref,
                                                active: deptActive,
                                                className: "rounded-md px-2 py-1.5 font-medium hover:bg-alloy-stone/10",
                                                style: {
                                                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["brand"].primary
                                                },
                                                title: name,
                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "inline-flex items-center gap-2",
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$building$2d$2$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Building2$3e$__["Building2"], {
                                                            size: 16,
                                                            strokeWidth: 1.75
                                                        }, void 0, false, {
                                                            fileName: "[project]/app/adminV2/components/Sidebar.tsx",
                                                            lineNumber: 240,
                                                            columnNumber: 49
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            className: "truncate",
                                                            children: name
                                                        }, void 0, false, {
                                                            fileName: "[project]/app/adminV2/components/Sidebar.tsx",
                                                            lineNumber: 241,
                                                            columnNumber: 49
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/app/adminV2/components/Sidebar.tsx",
                                                    lineNumber: 239,
                                                    columnNumber: 45
                                                }, this)
                                            }, void 0, false, {
                                                fileName: "[project]/app/adminV2/components/Sidebar.tsx",
                                                lineNumber: 232,
                                                columnNumber: 41
                                            }, this),
                                            (wusByDept.get(d.id) ?? []).length ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "ml-6 space-y-1",
                                                children: (wusByDept.get(d.id) ?? []).map((wu)=>{
                                                    const wuName = (wu.name ?? "").trim() || "Untitled work unit";
                                                    const wuHref = `${WORKSPACE}/dept/${d.id}/work-unit/${wu.id}`;
                                                    const wuActive = departmentId === d.id && workUnitId === wu.id;
                                                    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$navigation$2f$AdminV2NavLink$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AdminV2NavLink"], {
                                                        href: wuHref,
                                                        active: wuActive,
                                                        className: "rounded-md px-2 py-1.5 font-medium hover:bg-alloy-stone/10",
                                                        style: {
                                                            color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["brand"].primary
                                                        },
                                                        title: wuName,
                                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            className: "inline-flex items-center gap-2",
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$boxes$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Boxes$3e$__["Boxes"], {
                                                                    size: 15,
                                                                    strokeWidth: 1.75
                                                                }, void 0, false, {
                                                                    fileName: "[project]/app/adminV2/components/Sidebar.tsx",
                                                                    lineNumber: 260,
                                                                    columnNumber: 65
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                    className: "truncate",
                                                                    children: wuName
                                                                }, void 0, false, {
                                                                    fileName: "[project]/app/adminV2/components/Sidebar.tsx",
                                                                    lineNumber: 261,
                                                                    columnNumber: 65
                                                                }, this)
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/app/adminV2/components/Sidebar.tsx",
                                                            lineNumber: 259,
                                                            columnNumber: 61
                                                        }, this)
                                                    }, wu.id, false, {
                                                        fileName: "[project]/app/adminV2/components/Sidebar.tsx",
                                                        lineNumber: 251,
                                                        columnNumber: 57
                                                    }, this);
                                                })
                                            }, void 0, false, {
                                                fileName: "[project]/app/adminV2/components/Sidebar.tsx",
                                                lineNumber: 245,
                                                columnNumber: 45
                                            }, this) : null
                                        ]
                                    }, d.id, true, {
                                        fileName: "[project]/app/adminV2/components/Sidebar.tsx",
                                        lineNumber: 231,
                                        columnNumber: 37
                                    }, this);
                                })
                            }, void 0, false, {
                                fileName: "[project]/app/adminV2/components/Sidebar.tsx",
                                lineNumber: 225,
                                columnNumber: 25
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/app/adminV2/components/Sidebar.tsx",
                        lineNumber: 217,
                        columnNumber: 21
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "mt-auto pt-2 border-t",
                        style: {
                            borderColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].border
                        },
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$navigation$2f$AdminV2NavLink$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AdminV2NavLink"], {
                            href: SETTINGS_HREF,
                            active: onSettings,
                            className: "rounded-md px-2 py-1.5 font-medium hover:bg-alloy-stone/10",
                            style: {
                                color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["brand"].primary
                            },
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "inline-flex items-center gap-2",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$settings$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Settings$3e$__["Settings"], {
                                        size: 16,
                                        strokeWidth: 1.75
                                    }, void 0, false, {
                                        fileName: "[project]/app/adminV2/components/Sidebar.tsx",
                                        lineNumber: 282,
                                        columnNumber: 33
                                    }, this),
                                    "Settings"
                                ]
                            }, void 0, true, {
                                fileName: "[project]/app/adminV2/components/Sidebar.tsx",
                                lineNumber: 281,
                                columnNumber: 29
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/app/adminV2/components/Sidebar.tsx",
                            lineNumber: 275,
                            columnNumber: 25
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/Sidebar.tsx",
                        lineNumber: 274,
                        columnNumber: 21
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/app/adminV2/components/Sidebar.tsx",
                lineNumber: 187,
                columnNumber: 17
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/app/adminV2/components/Sidebar.tsx",
        lineNumber: 104,
        columnNumber: 9
    }, this);
}
}),
"[project]/app/adminV2/components/inspector/mockInspectorData.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "getInspectorDepartmentData",
    ()=>getInspectorDepartmentData
]);
const BY_DEPARTMENT = {
    operations: {
        summary: {
            departmentName: "Operations",
            health: "Good",
            aiSummary: "Scheduling and dispatch are running within targets. Utilization is healthy."
        },
        metrics: [
            {
                label: "Jobs Active",
                value: "42"
            },
            {
                label: "Utilization",
                value: "78%"
            },
            {
                label: "Completion Rate",
                value: "94%"
            },
            {
                label: "Delays",
                value: "3"
            }
        ],
        activity: [
            {
                id: "a1",
                text: "Scheduling Agent assigned job #4821",
                time: "2m ago"
            },
            {
                id: "a2",
                text: "Dispatch run completed for 12 jobs",
                time: "15m ago"
            },
            {
                id: "a3",
                text: "Completion Manager updated 3 records",
                time: "1h ago"
            }
        ],
        actions: [
            {
                id: "act1",
                label: "Optimize schedule"
            },
            {
                id: "act2",
                label: "Investigate delays"
            },
            {
                id: "act3",
                label: "Review technician utilization"
            }
        ],
        history: [
            {
                id: "h1",
                text: "Zoom into Operations",
                time: "Just now"
            },
            {
                id: "h2",
                text: "KPI refresh",
                time: "5m ago"
            }
        ]
    },
    sales: {
        summary: {
            departmentName: "Sales",
            health: "Good",
            aiSummary: "Pipeline and follow-up automation are active. Conversion trending up."
        },
        metrics: [
            {
                label: "Pipeline",
                value: "12"
            },
            {
                label: "Conversion",
                value: "24%"
            },
            {
                label: "Revenue",
                value: "$12,400"
            }
        ],
        activity: [
            {
                id: "a1",
                text: "Pipeline Manager updated stage",
                time: "5m ago"
            },
            {
                id: "a2",
                text: "Follow-up task completed",
                time: "1h ago"
            }
        ],
        actions: [
            {
                id: "act1",
                label: "Review pipeline"
            },
            {
                id: "act2",
                label: "Run conversion report"
            }
        ],
        history: [
            {
                id: "h1",
                text: "Zoom into Sales",
                time: "Just now"
            }
        ]
    },
    finance: {
        summary: {
            departmentName: "Finance",
            health: "Attention",
            aiSummary: "Two open exceptions in collections. Billing accuracy remains high."
        },
        metrics: [
            {
                label: "Invoices Open",
                value: "8"
            },
            {
                label: "Collected",
                value: "94%"
            },
            {
                label: "Exceptions",
                value: "2"
            },
            {
                label: "Margin",
                value: "31%"
            }
        ],
        activity: [
            {
                id: "a1",
                text: "Billing Agent sent invoice #1033",
                time: "10m ago"
            },
            {
                id: "a2",
                text: "Collections exception flagged",
                time: "45m ago"
            },
            {
                id: "a3",
                text: "Reporting Manager ran daily summary",
                time: "2h ago"
            }
        ],
        actions: [
            {
                id: "act1",
                label: "Reconcile exceptions"
            },
            {
                id: "act2",
                label: "Run collections report"
            }
        ],
        history: [
            {
                id: "h1",
                text: "Zoom into Finance",
                time: "Just now"
            }
        ]
    },
    customerSuccess: {
        summary: {
            departmentName: "Customer Success",
            health: "Good",
            aiSummary: "Active cases within SLA. Retention metrics stable."
        },
        metrics: [
            {
                label: "Active Cases",
                value: "5"
            },
            {
                label: "SLA Met",
                value: "98%"
            }
        ],
        activity: [
            {
                id: "a1",
                text: "Support Manager closed case #882",
                time: "20m ago"
            },
            {
                id: "a2",
                text: "Success Manager sent check-in",
                time: "1h ago"
            }
        ],
        actions: [
            {
                id: "act1",
                label: "Review open cases"
            },
            {
                id: "act2",
                label: "Run SLA report"
            }
        ],
        history: [
            {
                id: "h1",
                text: "Zoom into Customer Success",
                time: "Just now"
            }
        ]
    },
    aiSystems: {
        summary: {
            departmentName: "AI Systems",
            health: "Good",
            aiSummary: "Runs at 99.2% success. One minor exception in document parsing."
        },
        metrics: [
            {
                label: "Runs Today",
                value: "1,240"
            },
            {
                label: "Success Rate",
                value: "99.2%"
            },
            {
                label: "Exceptions",
                value: "1"
            }
        ],
        activity: [
            {
                id: "a1",
                text: "Document parsing run completed",
                time: "1m ago"
            },
            {
                id: "a2",
                text: "Scheduling optimization ran",
                time: "30m ago"
            }
        ],
        actions: [
            {
                id: "act1",
                label: "Review exceptions"
            },
            {
                id: "act2",
                label: "Re-run failed workflow"
            }
        ],
        history: [
            {
                id: "h1",
                text: "Zoom into AI Systems",
                time: "Just now"
            }
        ]
    }
};
function getInspectorDepartmentData(key) {
    return BY_DEPARTMENT[key];
}
}),
"[project]/app/adminV2/components/inspector/mockCommandCenter.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "MOCK_COMMAND_CENTER_ACTIVITY",
    ()=>MOCK_COMMAND_CENTER_ACTIVITY,
    "MOCK_COMMAND_CENTER_ALERTS",
    ()=>MOCK_COMMAND_CENTER_ALERTS,
    "MOCK_COMMAND_CENTER_SUGGESTIONS",
    ()=>MOCK_COMMAND_CENTER_SUGGESTIONS,
    "MOCK_SYSTEM_ACTION_GROUPS",
    ()=>MOCK_SYSTEM_ACTION_GROUPS
]);
const MOCK_COMMAND_CENTER_ACTIVITY = [
    {
        id: "1",
        text: "Dispatch run completed for 12 jobs",
        time: "3m ago"
    },
    {
        id: "2",
        text: "Billing agent flagged 2 exceptions",
        time: "18m ago"
    },
    {
        id: "3",
        text: "Customer success closed 3 cases",
        time: "42m ago"
    },
    {
        id: "4",
        text: "Scheduling optimization ran for Operations",
        time: "1h ago"
    }
];
const MOCK_COMMAND_CENTER_ALERTS = [
    {
        id: "a1",
        text: "Finance: 2 invoices past due review",
        severity: "attention"
    },
    {
        id: "a2",
        text: "AI Systems: 1 document parse retry queued",
        severity: "info"
    }
];
const MOCK_SYSTEM_ACTION_GROUPS = [
    {
        id: "system-actions",
        title: "System actions",
        actions: [
            {
                id: "sa-upload",
                label: "Upload document"
            },
            {
                id: "sa-doc",
                label: "Create document"
            },
            {
                id: "sa-record",
                label: "Create record"
            }
        ]
    },
    {
        id: "automations",
        title: "Automations",
        actions: [
            {
                id: "sa-auto",
                label: "Run automation"
            },
            {
                id: "sa-workflow",
                label: "Trigger workflow"
            }
        ]
    },
    {
        id: "system-tools",
        title: "System tools",
        actions: [
            {
                id: "sa-search",
                label: "Search system"
            },
            {
                id: "sa-exceptions",
                label: "Review exceptions"
            }
        ]
    }
];
const MOCK_COMMAND_CENTER_SUGGESTIONS = [
    {
        id: "s1",
        text: "Review finance exceptions"
    },
    {
        id: "s2",
        text: "Optimize tomorrow’s dispatch window"
    },
    {
        id: "s3",
        text: "Check pipeline follow-ups in Sales"
    }
];
}),
"[project]/app/adminV2/components/canvas/mockDepartmentActions.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Mock operational data for company-level department tiles.
 * UI-only: quick actions, next-best-action, priority. No backend.
 */ __turbopack_context__.s([
    "MOCK_ACTION_PANEL_CONTENT",
    ()=>MOCK_ACTION_PANEL_CONTENT,
    "MOCK_DEPARTMENT_ACTIONS",
    ()=>MOCK_DEPARTMENT_ACTIONS,
    "getActionPanelContent",
    ()=>getActionPanelContent
]);
const MOCK_DEPARTMENT_ACTIONS = {
    operations: {
        quickActions: [
            {
                id: "ops-optimize",
                label: "Optimize schedule",
                icon: "gear"
            },
            {
                id: "ops-review-queue",
                label: "Review queue",
                icon: "list"
            }
        ],
        nextBestAction: "3 delayed jobs need review",
        isPriority: true
    },
    sales: {
        quickActions: [
            {
                id: "sales-pipeline",
                label: "Review pipeline",
                icon: "list"
            },
            {
                id: "sales-followup",
                label: "Trigger follow-up",
                icon: "mail"
            }
        ],
        nextBestAction: "2 leads ready for follow-up",
        isPriority: false
    },
    finance: {
        quickActions: [
            {
                id: "finance-exceptions",
                label: "Review exceptions",
                icon: "warning"
            },
            {
                id: "finance-recon",
                label: "Run reconciliation",
                icon: "check"
            }
        ],
        nextBestAction: "2 exceptions ready for approval",
        isPriority: true
    },
    customerSuccess: {
        quickActions: [
            {
                id: "cs-cases",
                label: "Review cases",
                icon: "list"
            },
            {
                id: "cs-escalate",
                label: "Escalate issue",
                icon: "warning"
            }
        ],
        nextBestAction: "1 case approaching SLA",
        isPriority: false
    },
    aiSystems: {
        quickActions: [
            {
                id: "ai-inspect",
                label: "Inspect runs",
                icon: "eye"
            },
            {
                id: "ai-failures",
                label: "Review failures",
                icon: "warning"
            }
        ],
        nextBestAction: "1 failed run in last hour",
        isPriority: false
    }
};
const MOCK_ACTION_PANEL_CONTENT = {
    "ops-optimize": {
        title: "Optimize operations",
        description: "Review and tune workflow settings for this department.",
        records: [
            "2 workflows pending review",
            "1 bottleneck in dispatch",
            "Capacity at 78%"
        ],
        primaryLabel: "Open optimizer",
        secondaryLabel: "View history"
    },
    "ops-review-queue": {
        title: "Review queue",
        description: "See delayed and pending items that need attention.",
        records: [
            "3 delayed jobs",
            "2 unassigned jobs",
            "1 technician conflict"
        ],
        primaryLabel: "Open queue",
        secondaryLabel: "Filter by type"
    },
    "sales-pipeline": {
        title: "Review pipeline",
        description: "Inspect deals and stages for this period.",
        records: [
            "2 stalled opportunities",
            "1 lead missing next touch",
            "3 deals closing this week"
        ],
        primaryLabel: "Open pipeline",
        secondaryLabel: "Export"
    },
    "sales-followup": {
        title: "Trigger follow-up",
        description: "Send reminders or run automated follow-up sequences.",
        records: [
            "2 leads ready for follow-up",
            "1 sequence due today"
        ],
        primaryLabel: "Run follow-up",
        secondaryLabel: "Schedule"
    },
    "finance-exceptions": {
        title: "Review exceptions",
        description: "Approve or resolve flagged transactions.",
        records: [
            "Invoice INV-1023 overdue",
            "Payment batch mismatch",
            "2 unreconciled records"
        ],
        primaryLabel: "Open exceptions",
        secondaryLabel: "Bulk approve"
    },
    "finance-recon": {
        title: "Run reconciliation",
        description: "Start a reconciliation run for the selected period.",
        records: [
            "Last run: 2 discrepancies",
            "1 batch pending"
        ],
        primaryLabel: "Run now",
        secondaryLabel: "Configure"
    },
    "cs-cases": {
        title: "Review cases",
        description: "View open cases and SLA status.",
        records: [
            "1 case approaching SLA",
            "2 awaiting response",
            "4 closed today"
        ],
        primaryLabel: "Open cases",
        secondaryLabel: "Assign"
    },
    "cs-escalate": {
        title: "Escalate issues",
        description: "Escalate selected cases to the next tier.",
        records: [
            "1 case eligible for escalation",
            "2 in queue"
        ],
        primaryLabel: "Escalate",
        secondaryLabel: "Add note"
    },
    "ai-inspect": {
        title: "Inspect runs",
        description: "View recent AI run logs and outcomes.",
        records: [
            "12 runs in last 24h",
            "1 slow run",
            "All systems nominal"
        ],
        primaryLabel: "Open runs",
        secondaryLabel: "Retry failed"
    },
    "ai-failures": {
        title: "Review failures",
        description: "See failed runs and error details.",
        records: [
            "1 failed run in last hour",
            "2 retries pending"
        ],
        primaryLabel: "Open failures",
        secondaryLabel: "Notify"
    }
};
function getActionPanelContent(actionId) {
    return MOCK_ACTION_PANEL_CONTENT[actionId];
}
}),
"[project]/app/adminV2/components/canvas/mockDepartments.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Company org chart: department tiles only. Global utilities live in Command Center (InspectorPanel).
 */ __turbopack_context__.s([
    "MOCK_DEPARTMENTS",
    ()=>MOCK_DEPARTMENTS
]);
const MOCK_DEPARTMENTS = [
    {
        id: "dept-operations",
        key: "operations",
        name: "Operations",
        primaryKpi: "Jobs Active",
        primaryValue: "42",
        secondaryKpi: "Utilization",
        secondaryValue: "78%",
        health: "good",
        alertCount: 0,
        compact1Label: "Throughput",
        compact1Value: "312",
        compact2Label: "Queue depth",
        compact2Value: "14",
        primarySignal: "42 active jobs",
        agentRollup: "3 agents active · 1 needs review",
        agentStates: [
            {
                name: "Dispatch Agent",
                status: "Healthy"
            },
            {
                name: "Scheduling Agent",
                status: "Attention"
            }
        ],
        topPerformer: "Top performer: Scheduling Agent"
    },
    {
        id: "dept-sales",
        key: "sales",
        name: "Sales",
        primaryKpi: "Pipeline",
        primaryValue: "12",
        secondaryKpi: "Conversion",
        secondaryValue: "24%",
        health: "good",
        alertCount: 0,
        compact1Label: "Leads touched",
        compact1Value: "48",
        compact2Label: "Win rate",
        compact2Value: "18%",
        primarySignal: "12 deals in pipeline",
        agentRollup: "2 agents active · all healthy",
        agentStates: [
            {
                name: "Follow-up Agent",
                status: "Healthy"
            },
            {
                name: "Scoring Agent",
                status: "Healthy"
            }
        ],
        topPerformer: "Top performer: Follow-up Agent"
    },
    {
        id: "dept-finance",
        key: "finance",
        name: "Finance",
        primaryKpi: "Invoices Open",
        primaryValue: "8",
        secondaryKpi: "Collected",
        secondaryValue: "94%",
        health: "attention",
        alertCount: 2,
        compact1Label: "Reconciled",
        compact1Value: "428",
        compact2Label: "Margin",
        compact2Value: "31%",
        primarySignal: "8 invoices open",
        agentRollup: "2 agents active · 1 exception state",
        agentStates: [
            {
                name: "Billing Agent",
                status: "Attention"
            },
            {
                name: "Reconciliation Agent",
                status: "Healthy"
            }
        ],
        topPerformer: "Top performer: Reconciliation Agent"
    },
    {
        id: "dept-customer-success",
        key: "customerSuccess",
        name: "Customer Success",
        primaryKpi: "Active Cases",
        primaryValue: "5",
        secondaryKpi: "SLA Met",
        secondaryValue: "98%",
        health: "good",
        alertCount: 0,
        compact1Label: "CSAT pulse",
        compact1Value: "4.6",
        compact2Label: "Escalations",
        compact2Value: "1",
        primarySignal: "5 active cases",
        agentRollup: "2 agents active · 1 escalation pending",
        agentStates: [
            {
                name: "Support Agent",
                status: "Healthy"
            },
            {
                name: "Escalation Agent",
                status: "Attention"
            }
        ],
        topPerformer: "Top performer: Support Agent"
    },
    {
        id: "dept-ai-systems",
        key: "aiSystems",
        name: "AI Systems",
        primaryKpi: "Runs Today",
        primaryValue: "1,240",
        secondaryKpi: "Success Rate",
        secondaryValue: "99.2%",
        health: "good",
        alertCount: 1,
        compact1Label: "Model runs",
        compact1Value: "1,240",
        compact2Label: "Cost / 1k",
        compact2Value: "$0.42",
        primarySignal: "1,240 runs today",
        agentRollup: "4 agents active · 1 needs review",
        agentStates: [
            {
                name: "Processing Agent",
                status: "Healthy"
            },
            {
                name: "Monitoring Agent",
                status: "Attention"
            }
        ],
        topPerformer: "Top performer: Processing Agent"
    }
];
}),
"[project]/app/adminV2/components/InspectorPanel.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>InspectorPanel
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/styles/tokens/colors.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$inspector$2f$mockInspectorData$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/adminV2/components/inspector/mockInspectorData.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$inspector$2f$mockCommandCenter$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/adminV2/components/inspector/mockCommandCenter.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$canvas$2f$mockDepartmentActions$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/adminV2/components/canvas/mockDepartmentActions.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$canvas$2f$mockDepartments$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/adminV2/components/canvas/mockDepartments.ts [app-ssr] (ecmascript)");
"use client";
;
;
;
;
;
;
;
const RAIL_INNER_MAX = 272;
const SECTION_GAP = 26;
/** Align command header rhythm with KPI band (~minHeight 102, padded label row) */ const RAIL_TOP_PAD = 18;
function sectionTitle(text, accent) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
        style: {
            fontSize: 10,
            fontWeight: 700,
            color: accent ?? __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].inspectorSectionMuted,
            textTransform: "none",
            letterSpacing: "0.1em",
            marginBottom: 12,
            marginTop: 0
        },
        children: text
    }, void 0, false, {
        fileName: "[project]/app/adminV2/components/InspectorPanel.tsx",
        lineNumber: 29,
        columnNumber: 5
    }, this);
}
const SYSTEM_ACTION_GROUP_GAP = 24;
function SystemActionsBlock() {
    const [hoverId, setHoverId] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        style: {
            marginBottom: SECTION_GAP
        },
        children: __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$inspector$2f$mockCommandCenter$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["MOCK_SYSTEM_ACTION_GROUPS"].map((group, gi)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                style: {
                    marginBottom: gi < __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$inspector$2f$mockCommandCenter$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["MOCK_SYSTEM_ACTION_GROUPS"].length - 1 ? SYSTEM_ACTION_GROUP_GAP : 0
                },
                children: [
                    sectionTitle(group.title, __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].inspectorSectionMuted),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        style: {
                            display: "flex",
                            flexDirection: "column",
                            gap: 11
                        },
                        children: group.actions.map((item)=>{
                            const h = hoverId === item.id;
                            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                type: "button",
                                onMouseEnter: ()=>setHoverId(item.id),
                                onMouseLeave: ()=>setHoverId(null),
                                style: {
                                    padding: "12px 16px",
                                    borderRadius: 10,
                                    border: `1px solid ${h ? __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].border : __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].inspectorCommandHairline}`,
                                    backgroundColor: h ? __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].inspectorCardQuiet : __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].inspectorCommandRail,
                                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].textPrimary,
                                    fontSize: 13,
                                    fontWeight: 500,
                                    textAlign: "left",
                                    cursor: "pointer",
                                    boxShadow: h ? __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].cardShadow : __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].cardShadow,
                                    lineHeight: 1.4,
                                    transition: "border-color 0.15s ease, background-color 0.15s ease"
                                },
                                children: item.label
                            }, item.id, false, {
                                fileName: "[project]/app/adminV2/components/InspectorPanel.tsx",
                                lineNumber: 64,
                                columnNumber: 17
                            }, this);
                        })
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/InspectorPanel.tsx",
                        lineNumber: 60,
                        columnNumber: 11
                    }, this)
                ]
            }, group.id, true, {
                fileName: "[project]/app/adminV2/components/InspectorPanel.tsx",
                lineNumber: 53,
                columnNumber: 9
            }, this))
    }, void 0, false, {
        fileName: "[project]/app/adminV2/components/InspectorPanel.tsx",
        lineNumber: 51,
        columnNumber: 5
    }, this);
}
function NextStepBlock({ departmentName, nextBestAction }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        style: {
            marginBottom: SECTION_GAP,
            padding: "14px 16px",
            borderRadius: 10,
            border: `1px solid ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].inspectorCommandHairline}`,
            backgroundColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].inspectorCardQuiet,
            borderLeft: `3px solid ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["brand"].primary}`,
            boxShadow: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].cardShadow
        },
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                style: {
                    fontSize: 10,
                    fontWeight: 700,
                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["brand"].primary,
                    textTransform: "none",
                    letterSpacing: "0.08em",
                    marginBottom: 6
                },
                children: [
                    "Next step · ",
                    departmentName
                ]
            }, void 0, true, {
                fileName: "[project]/app/adminV2/components/InspectorPanel.tsx",
                lineNumber: 108,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                style: {
                    fontSize: 13,
                    fontWeight: 600,
                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].textPrimary,
                    lineHeight: 1.4
                },
                children: nextBestAction
            }, void 0, false, {
                fileName: "[project]/app/adminV2/components/InspectorPanel.tsx",
                lineNumber: 120,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/app/adminV2/components/InspectorPanel.tsx",
        lineNumber: 97,
        columnNumber: 5
    }, this);
}
function CommandCenterPanel({ selectedNodeId }) {
    const selectedDept = selectedNodeId ? __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$canvas$2f$mockDepartments$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["MOCK_DEPARTMENTS"].find((d)=>d.id === selectedNodeId) : null;
    const nextStepConfig = selectedDept ? __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$canvas$2f$mockDepartmentActions$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["MOCK_DEPARTMENT_ACTIONS"][selectedDept.key] : null;
    const showNextStep = nextStepConfig?.nextBestAction != null;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        style: {
            padding: `${RAIL_TOP_PAD}px 22px 28px`,
            maxWidth: RAIL_INNER_MAX,
            margin: "0 auto",
            width: "100%",
            boxSizing: "border-box"
        },
        children: [
            showNextStep && selectedDept && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(NextStepBlock, {
                departmentName: selectedDept.name,
                nextBestAction: nextStepConfig.nextBestAction
            }, void 0, false, {
                fileName: "[project]/app/adminV2/components/InspectorPanel.tsx",
                lineNumber: 145,
                columnNumber: 9
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("header", {
                style: {
                    marginBottom: SECTION_GAP + 4,
                    textAlign: "left"
                },
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        style: {
                            fontSize: 11,
                            fontWeight: 700,
                            color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["brand"].primary,
                            letterSpacing: "0.07em",
                            marginBottom: 6
                        },
                        children: "Command center"
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/InspectorPanel.tsx",
                        lineNumber: 151,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        style: {
                            fontSize: 16,
                            fontWeight: 700,
                            color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].textPrimary,
                            letterSpacing: "-0.022em",
                            lineHeight: 1.25
                        },
                        children: "Recent activity & signals"
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/InspectorPanel.tsx",
                        lineNumber: 162,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/app/adminV2/components/InspectorPanel.tsx",
                lineNumber: 150,
                columnNumber: 7
            }, this),
            sectionTitle("Recent activity", __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["brand"].primary),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                style: {
                    listStyle: "none",
                    padding: 0,
                    margin: `0 0 ${SECTION_GAP}px`
                },
                children: __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$inspector$2f$mockCommandCenter$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["MOCK_COMMAND_CENTER_ACTIVITY"].map((a)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                        style: {
                            fontSize: 13,
                            color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].textPrimary,
                            padding: "12px 0",
                            borderBottom: `1px solid ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].inspectorCommandHairline}`,
                            lineHeight: 1.5
                        },
                        children: [
                            a.text,
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                style: {
                                    display: "block",
                                    fontSize: 11,
                                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].inspectorSectionMuted,
                                    marginTop: 4
                                },
                                children: a.time
                            }, void 0, false, {
                                fileName: "[project]/app/adminV2/components/InspectorPanel.tsx",
                                lineNumber: 189,
                                columnNumber: 13
                            }, this)
                        ]
                    }, a.id, true, {
                        fileName: "[project]/app/adminV2/components/InspectorPanel.tsx",
                        lineNumber: 178,
                        columnNumber: 11
                    }, this))
            }, void 0, false, {
                fileName: "[project]/app/adminV2/components/InspectorPanel.tsx",
                lineNumber: 176,
                columnNumber: 7
            }, this),
            sectionTitle("Active alerts", __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["semantic"].warning),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                style: {
                    listStyle: "none",
                    padding: 0,
                    margin: `0 0 ${SECTION_GAP}px`
                },
                children: __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$inspector$2f$mockCommandCenter$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["MOCK_COMMAND_CENTER_ALERTS"].map((a)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                        style: {
                            fontSize: 13,
                            padding: "12px 14px",
                            marginBottom: 10,
                            borderRadius: 10,
                            border: `1px solid ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].inspectorCommandHairline}`,
                            borderLeft: `3px solid ${a.severity === "attention" ? __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["semantic"].warning : __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["semantic"].info}`,
                            backgroundColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].inspectorCardQuiet,
                            color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].textPrimary,
                            boxShadow: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].cardShadow,
                            lineHeight: 1.45
                        },
                        children: a.text
                    }, a.id, false, {
                        fileName: "[project]/app/adminV2/components/InspectorPanel.tsx",
                        lineNumber: 206,
                        columnNumber: 11
                    }, this))
            }, void 0, false, {
                fileName: "[project]/app/adminV2/components/InspectorPanel.tsx",
                lineNumber: 204,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(SystemActionsBlock, {}, void 0, false, {
                fileName: "[project]/app/adminV2/components/InspectorPanel.tsx",
                lineNumber: 226,
                columnNumber: 7
            }, this),
            sectionTitle("Suggested actions", __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["brand"].secondary),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                style: {
                    display: "flex",
                    flexDirection: "column",
                    gap: 10
                },
                children: __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$inspector$2f$mockCommandCenter$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["MOCK_COMMAND_CENTER_SUGGESTIONS"].map((s)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        type: "button",
                        style: {
                            padding: "12px 16px",
                            borderRadius: 10,
                            border: `1px solid ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].inspectorCommandHairline}`,
                            backgroundColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].inspectorCommandRail,
                            color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].textPrimary,
                            fontSize: 13,
                            fontWeight: 500,
                            textAlign: "left",
                            cursor: "pointer",
                            boxShadow: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].cardShadow,
                            lineHeight: 1.4
                        },
                        children: s.text
                    }, s.id, false, {
                        fileName: "[project]/app/adminV2/components/InspectorPanel.tsx",
                        lineNumber: 231,
                        columnNumber: 11
                    }, this))
            }, void 0, false, {
                fileName: "[project]/app/adminV2/components/InspectorPanel.tsx",
                lineNumber: 229,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/app/adminV2/components/InspectorPanel.tsx",
        lineNumber: 135,
        columnNumber: 5
    }, this);
}
function DepartmentInspector({ departmentKey }) {
    const data = (0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$inspector$2f$mockInspectorData$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getInspectorDepartmentData"])(departmentKey);
    const { summary, metrics, activity, actions, history } = data;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        style: {
            padding: `${RAIL_TOP_PAD}px 22px 28px`,
            maxWidth: RAIL_INNER_MAX,
            margin: "0 auto",
            width: "100%",
            boxSizing: "border-box"
        },
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                style: {
                    paddingBottom: 20,
                    marginBottom: SECTION_GAP,
                    borderBottom: `1px solid ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].inspectorCommandHairline}`
                },
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        style: {
                            fontSize: 10,
                            fontWeight: 700,
                            color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["brand"].secondary,
                            letterSpacing: "0.09em",
                            marginBottom: 8
                        },
                        children: "Department"
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/InspectorPanel.tsx",
                        lineNumber: 277,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        style: {
                            fontSize: 19,
                            fontWeight: 700,
                            color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].textPrimary,
                            letterSpacing: "-0.02em",
                            marginBottom: 10,
                            lineHeight: 1.2
                        },
                        children: summary.departmentName
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/InspectorPanel.tsx",
                        lineNumber: 288,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        style: {
                            fontSize: 12,
                            fontWeight: 600,
                            color: HEALTH_FOR_SUMMARY[summary.health],
                            marginBottom: 12
                        },
                        children: summary.health
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/InspectorPanel.tsx",
                        lineNumber: 300,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        style: {
                            fontSize: 13,
                            color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].inspectorSectionMuted,
                            lineHeight: 1.6
                        },
                        children: summary.aiSummary
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/InspectorPanel.tsx",
                        lineNumber: 310,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/app/adminV2/components/InspectorPanel.tsx",
                lineNumber: 270,
                columnNumber: 7
            }, this),
            sectionTitle("Key metrics", __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["brand"].primary),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                style: {
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 10,
                    marginBottom: SECTION_GAP
                },
                children: metrics.map((m)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        style: {
                            padding: "12px 16px",
                            borderRadius: 10,
                            backgroundColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].inspectorCardQuiet,
                            border: `1px solid ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].inspectorCommandHairline}`,
                            borderTop: `2px solid ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["semantic"].info}`,
                            minWidth: 108,
                            flex: "1 1 108px",
                            boxShadow: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].cardShadow
                        },
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                style: {
                                    fontSize: 9,
                                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].inspectorSectionMuted,
                                    textTransform: "none",
                                    letterSpacing: "0.06em",
                                    marginBottom: 6
                                },
                                children: m.label
                            }, void 0, false, {
                                fileName: "[project]/app/adminV2/components/InspectorPanel.tsx",
                                lineNumber: 331,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                style: {
                                    fontSize: 16,
                                    fontWeight: 700,
                                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].textPrimary
                                },
                                children: m.value
                            }, void 0, false, {
                                fileName: "[project]/app/adminV2/components/InspectorPanel.tsx",
                                lineNumber: 342,
                                columnNumber: 13
                            }, this)
                        ]
                    }, m.label, true, {
                        fileName: "[project]/app/adminV2/components/InspectorPanel.tsx",
                        lineNumber: 318,
                        columnNumber: 11
                    }, this))
            }, void 0, false, {
                fileName: "[project]/app/adminV2/components/InspectorPanel.tsx",
                lineNumber: 316,
                columnNumber: 7
            }, this),
            sectionTitle("Activity"),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                style: {
                    listStyle: "none",
                    padding: 0,
                    margin: `0 0 ${SECTION_GAP}px`
                },
                children: activity.map((a)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                        style: {
                            fontSize: 13,
                            color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].textPrimary,
                            padding: "11px 0",
                            borderBottom: `1px solid ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].inspectorCommandHairline}`,
                            lineHeight: 1.45
                        },
                        children: [
                            a.text,
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                style: {
                                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].inspectorSectionMuted,
                                    marginLeft: 8
                                },
                                children: a.time
                            }, void 0, false, {
                                fileName: "[project]/app/adminV2/components/InspectorPanel.tsx",
                                lineNumber: 361,
                                columnNumber: 13
                            }, this)
                        ]
                    }, a.id, true, {
                        fileName: "[project]/app/adminV2/components/InspectorPanel.tsx",
                        lineNumber: 350,
                        columnNumber: 11
                    }, this))
            }, void 0, false, {
                fileName: "[project]/app/adminV2/components/InspectorPanel.tsx",
                lineNumber: 348,
                columnNumber: 7
            }, this),
            sectionTitle("Actions", __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["brand"].secondary),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                style: {
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                    marginBottom: SECTION_GAP
                },
                children: actions.map((a)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        type: "button",
                        style: {
                            padding: "12px 16px",
                            borderRadius: 10,
                            border: `1px solid ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].inspectorCommandHairline}`,
                            backgroundColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].inspectorCommandRail,
                            color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["brand"].primary,
                            fontSize: 13,
                            fontWeight: 600,
                            textAlign: "left",
                            cursor: "pointer"
                        },
                        children: a.label
                    }, a.id, false, {
                        fileName: "[project]/app/adminV2/components/InspectorPanel.tsx",
                        lineNumber: 369,
                        columnNumber: 11
                    }, this))
            }, void 0, false, {
                fileName: "[project]/app/adminV2/components/InspectorPanel.tsx",
                lineNumber: 367,
                columnNumber: 7
            }, this),
            sectionTitle("History"),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                style: {
                    listStyle: "none",
                    padding: 0,
                    margin: 0
                },
                children: history.map((h)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                        style: {
                            fontSize: 12,
                            color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].inspectorSectionMuted,
                            padding: "6px 0",
                            lineHeight: 1.45
                        },
                        children: [
                            h.text,
                            " · ",
                            h.time
                        ]
                    }, h.id, true, {
                        fileName: "[project]/app/adminV2/components/InspectorPanel.tsx",
                        lineNumber: 392,
                        columnNumber: 11
                    }, this))
            }, void 0, false, {
                fileName: "[project]/app/adminV2/components/InspectorPanel.tsx",
                lineNumber: 390,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/app/adminV2/components/InspectorPanel.tsx",
        lineNumber: 261,
        columnNumber: 5
    }, this);
}
const HEALTH_FOR_SUMMARY = {
    Good: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["semantic"].success,
    Attention: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["semantic"].warning,
    Critical: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["semantic"].warning
};
function InspectorPanel({ selectedNodeId, selectedDepartmentKey, zoomLevel }) {
    const resolvedKey = selectedDepartmentKey ?? (selectedNodeId ? MOCK_DEPT_ID_TO_KEY[selectedNodeId] ?? null : null);
    const showDepartmentDetail = zoomLevel === "department" && resolvedKey != null;
    const showCommandCenter = zoomLevel === "company";
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("aside", {
        className: "adminv2-inspector-rail w-80 flex-shrink-0 overflow-y-auto min-h-0 self-stretch",
        style: {
            background: `linear-gradient(185deg, ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].inspectorCommandRail} 0%, ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].inspectorCommandRailWash} 42%, ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].inspectorCommandRail} 100%)`,
            borderLeft: `1px solid ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].inspectorCommandHairline}`,
            boxShadow: `${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].inspectorChamberSeparation}, inset 0 0 0 1px ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].adminV2BoundaryAmber}`,
            zIndex: 1
        },
        children: [
            showCommandCenter && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(CommandCenterPanel, {
                selectedNodeId: selectedNodeId
            }, void 0, false, {
                fileName: "[project]/app/adminV2/components/InspectorPanel.tsx",
                lineNumber: 436,
                columnNumber: 29
            }, this),
            showDepartmentDetail && resolvedKey && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(DepartmentInspector, {
                departmentKey: resolvedKey
            }, void 0, false, {
                fileName: "[project]/app/adminV2/components/InspectorPanel.tsx",
                lineNumber: 437,
                columnNumber: 47
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/app/adminV2/components/InspectorPanel.tsx",
        lineNumber: 427,
        columnNumber: 5
    }, this);
}
const MOCK_DEPT_ID_TO_KEY = {
    "dept-operations": "operations",
    "dept-sales": "sales",
    "dept-finance": "finance",
    "dept-customer-success": "customerSuccess",
    "dept-ai-systems": "aiSystems"
};
}),
"[project]/app/adminV2/components/AICommandBar.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>AICommandBar
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/styles/tokens/colors.ts [app-ssr] (ecmascript)");
"use client";
;
;
const BAR_MAX_WIDTH = 720;
function AICommandBar() {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("footer", {
        "data-adminv2-ai-command-bar": true,
        role: "contentinfo",
        "aria-label": "AI command bar",
        className: "flex justify-center items-center flex-shrink-0 min-h-[52px] py-2 px-4 border-t-2 rounded-t-xl",
        style: {
            background: `linear-gradient(180deg, ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].adminV2AiBarPineWash} 0%, ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].surface} 38%, ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].surface} 100%)`,
            borderColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].adminV2AiBarPineBorder,
            boxShadow: `0 -4px 18px rgba(0, 162, 131, 0.07), ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].panelShadow}`
        },
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "flex items-center gap-3 w-full justify-center",
            style: {
                maxWidth: BAR_MAX_WIDTH
            },
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "flex-1 min-w-0 rounded-xl px-4 py-3 flex items-center gap-2 border-2 bg-white",
                    style: {
                        borderColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].adminV2AiInputPineRing,
                        color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].textSecondary,
                        maxWidth: BAR_MAX_WIDTH - 52,
                        boxShadow: `0 1px 0 rgba(0, 162, 131, 0.06), inset 0 1px 0 rgba(255,255,255,0.9)`
                    },
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-sm truncate font-medium",
                        style: {
                            color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].textPrimary,
                            opacity: 0.88
                        },
                        children: "Ask or command…"
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/AICommandBar.tsx",
                        lineNumber: 33,
                        columnNumber: 11
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/app/adminV2/components/AICommandBar.tsx",
                    lineNumber: 24,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                    className: "text-[11px] font-bold shrink-0 tracking-widest px-3 py-2 rounded-lg text-white",
                    style: {
                        backgroundColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["brand"].secondary,
                        letterSpacing: "0.14em",
                        boxShadow: `0 2px 8px rgba(0, 162, 131, 0.35)`
                    },
                    children: "AI"
                }, void 0, false, {
                    fileName: "[project]/app/adminV2/components/AICommandBar.tsx",
                    lineNumber: 37,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/app/adminV2/components/AICommandBar.tsx",
            lineNumber: 20,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/app/adminV2/components/AICommandBar.tsx",
        lineNumber: 9,
        columnNumber: 5
    }, this);
}
}),
"[project]/lib/agent/planner/jobOverviewPlannerTypes.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Types for deterministic job overview semantic layout planner (P0/P1).
 * @see docs/implementation/ai-agent-semantic-layout-planner-v1.md
 */ __turbopack_context__.s([
    "JOB_OVERVIEW_PLANNER_VERSION",
    ()=>JOB_OVERVIEW_PLANNER_VERSION
]);
const JOB_OVERVIEW_PLANNER_VERSION = 1;
}),
"[project]/lib/agent/planner/jobOverviewResolutionCatalog.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Machine-readable resolution catalog for job record overview layout (semantic planner).
 * Keys align with strict overview layout schema and job RRS overview usage.
 */ __turbopack_context__.s([
    "JOB_OVERVIEW_RESOLUTION_CATALOG",
    ()=>JOB_OVERVIEW_RESOLUTION_CATALOG
]);
const JOB_OVERVIEW_RESOLUTION_CATALOG = {
    catalog_version: 3,
    band_keys: [
        "summary",
        "people",
        "operational",
        "financial",
        "relationships",
        "service_property"
    ],
    relationship_group_keys: [
        "primary_customer_person",
        "customer_account"
    ],
    system_fields: [
        {
            key: "_primary_person_name",
            synonyms: [
                "main contact",
                "primary contact",
                "primary person",
                "primary customer person",
                "contact name",
                "their contact"
            ],
            preferred_band: "people",
            /** Planner promotes to header only for customer-focused template (identity strip). */ allow_header: true
        },
        {
            key: "_customer_name",
            synonyms: [
                "customer name",
                "account name"
            ],
            preferred_band: "summary",
            allow_header: true
        },
        {
            key: "_location_label",
            synonyms: [
                "address",
                "service address",
                "location"
            ],
            preferred_band: "summary",
            /** Narrative fields stay in the summary band; header ribbon is for identity/status. */ allow_header: false
        },
        {
            key: "_next_schedule",
            synonyms: [
                "next service date",
                "next service",
                "next visit",
                "next schedule",
                "next appointment"
            ],
            preferred_band: "summary",
            allow_header: false
        },
        {
            key: "scheduled_at",
            synonyms: [
                "scheduled",
                "schedule date"
            ],
            preferred_band: "summary",
            allow_header: false
        },
        {
            key: "service_key",
            synonyms: [
                "what service",
                "service they got",
                "service type",
                "booked service",
                "service booked",
                "type of service"
            ],
            preferred_band: "summary",
            /** Service line reads best in summary; property specifics use service_property band. */ allow_header: false
        },
        {
            key: "title",
            synonyms: [
                "job title",
                "title"
            ],
            preferred_band: "summary",
            allow_header: true
        },
        {
            key: "display_total_cents",
            synonyms: [
                "total",
                "price",
                "amount"
            ],
            preferred_band: "financial",
            allow_header: false
        }
    ],
    capability_gaps: [
        {
            id: "phone",
            synonyms: [
                "phone",
                "phones",
                "telephone",
                "cell",
                "mobile"
            ],
            reason: "Job overview layout has no canonical system_field for phone today; use org custom fields or relationship UI outside this rail."
        },
        {
            id: "email",
            synonyms: [
                "email",
                "e-mail",
                "e mail"
            ],
            reason: "Job overview layout has no canonical system_field for email today; use org custom fields or relationship UI outside this rail."
        }
    ],
    service_property_default_items: [
        {
            kind: "system_field",
            key: "_service_home_type_label"
        },
        {
            kind: "system_field",
            key: "_service_sqft_band_label"
        },
        {
            kind: "system_field",
            key: "_service_bedrooms"
        },
        {
            kind: "system_field",
            key: "_service_bathrooms"
        }
    ]
};
}),
"[project]/lib/rrs/overview/overviewLayoutConfigStrict.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Strict validation for `record_overview_layouts.config` (writes + agent v1).
 * Lenient read path remains `parseOverviewLayoutConfig` in overviewLayoutConfigModel.ts.
 */ __turbopack_context__.s([
    "JOB_OVERVIEW_RELATIONSHIP_GROUP_KEYS",
    ()=>JOB_OVERVIEW_RELATIONSHIP_GROUP_KEYS,
    "getOverviewLayoutConfigStoredVersion",
    ()=>getOverviewLayoutConfigStoredVersion,
    "overviewLayoutConfigStrictSchema",
    ()=>overviewLayoutConfigStrictSchema,
    "parseOverviewLayoutConfigStrict",
    ()=>parseOverviewLayoutConfigStrict
]);
const TOP_LEVEL = new Set([
    "version",
    "bands",
    "header_keys",
    "relationship_group_keys"
]);
const BAND_KEYS = new Set([
    "summary",
    "people",
    "operational",
    "financial",
    "relationships",
    "service_property"
]);
function normalizeItemKind(kind) {
    if (kind === "field") return "system_field";
    if (kind === "system_field" || kind === "custom_field" || kind === "section") {
        return kind;
    }
    return null;
}
const JOB_OVERVIEW_RELATIONSHIP_GROUP_KEYS = new Set([
    "primary_customer_person",
    "customer_account"
]);
function extraKeys(obj, allowed) {
    for (const k of Object.keys(obj)){
        if (!allowed.has(k)) return k;
    }
    return undefined;
}
function getOverviewLayoutConfigStoredVersion(raw) {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return 0;
    const v = raw.version;
    return typeof v === "number" && Number.isFinite(v) ? Math.floor(v) : 0;
}
function parseOverviewLayoutConfigStrict(raw) {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
        return {
            ok: false,
            error: "config must be a JSON object"
        };
    }
    const o = raw;
    const bad = extraKeys(o, TOP_LEVEL);
    if (bad) return {
        ok: false,
        error: `unknown key: ${bad}`
    };
    if (typeof o.version !== "number" || !Number.isInteger(o.version) || o.version < 1) {
        return {
            ok: false,
            error: "config.version must be an integer >= 1"
        };
    }
    if (!Array.isArray(o.header_keys)) {
        return {
            ok: false,
            error: "header_keys must be an array"
        };
    }
    const header_keys = [];
    for (const x of o.header_keys){
        if (typeof x !== "string" || !x.trim()) {
            return {
                ok: false,
                error: "header_keys must be non-empty strings"
            };
        }
        const t = x.trim();
        if (!/^[a-z0-9_:]+$/.test(t)) {
            return {
                ok: false,
                error: `invalid header_keys entry: ${t}`
            };
        }
        header_keys.push(t);
    }
    if (!Array.isArray(o.bands)) {
        return {
            ok: false,
            error: "bands must be an array"
        };
    }
    const bandsOut = [];
    const seenBand = new Set();
    for(let i = 0; i < o.bands.length; i++){
        const b = o.bands[i];
        if (b == null || typeof b !== "object" || Array.isArray(b)) {
            return {
                ok: false,
                error: `bands[${i}] must be an object`
            };
        }
        const br = b;
        const bkBad = extraKeys(br, new Set([
            "band_key",
            "enabled",
            "items"
        ]));
        if (bkBad) return {
            ok: false,
            error: `bands[${i}]: unknown key: ${bkBad}`
        };
        const bk = br.band_key;
        if (typeof bk !== "string" || !BAND_KEYS.has(bk)) {
            return {
                ok: false,
                error: `bands[${i}]: invalid band_key`
            };
        }
        if (seenBand.has(bk)) {
            return {
                ok: false,
                error: `duplicate band_key: ${bk}`
            };
        }
        seenBand.add(bk);
        if (br.enabled !== true && br.enabled !== false) {
            return {
                ok: false,
                error: `bands[${i}]: enabled must be a boolean`
            };
        }
        const enabled = br.enabled;
        if (!Array.isArray(br.items)) {
            return {
                ok: false,
                error: `bands[${i}].items must be an array`
            };
        }
        const items = [];
        for(let j = 0; j < br.items.length; j++){
            const it = br.items[j];
            if (it == null || typeof it !== "object" || Array.isArray(it)) {
                return {
                    ok: false,
                    error: `bands[${i}].items[${j}] must be an object`
                };
            }
            const ir = it;
            const ikBad = extraKeys(ir, new Set([
                "kind",
                "key",
                "hint"
            ]));
            if (ikBad) return {
                ok: false,
                error: `bands[${i}].items[${j}]: unknown key: ${ikBad}`
            };
            const finalKind = normalizeItemKind(ir.kind);
            if (!finalKind) {
                return {
                    ok: false,
                    error: `bands[${i}].items[${j}]: invalid kind`
                };
            }
            const key = ir.key;
            if (typeof key !== "string" || !key.trim()) {
                return {
                    ok: false,
                    error: `bands[${i}].items[${j}]: key required`
                };
            }
            let hint;
            if (ir.hint !== undefined) {
                if (ir.hint == null || typeof ir.hint !== "object" || Array.isArray(ir.hint)) {
                    return {
                        ok: false,
                        error: `bands[${i}].items[${j}]: hint must be an object`
                    };
                }
                const hr = ir.hint;
                const hBad = extraKeys(hr, new Set([
                    "span"
                ]));
                if (hBad) return {
                    ok: false,
                    error: `bands[${i}].items[${j}].hint: unknown key: ${hBad}`
                };
                const sp = hr.span;
                if (sp !== undefined && sp !== 1 && sp !== 2 && sp !== 3) {
                    return {
                        ok: false,
                        error: `bands[${i}].items[${j}].hint.span must be 1, 2, or 3`
                    };
                }
                if (sp !== undefined) hint = {
                    span: sp
                };
            }
            items.push({
                kind: finalKind,
                key: key.trim(),
                hint
            });
        }
        bandsOut.push({
            band_key: bk,
            enabled,
            items
        });
    }
    let relationship_group_keys;
    if (o.relationship_group_keys !== undefined) {
        if (!Array.isArray(o.relationship_group_keys)) {
            return {
                ok: false,
                error: "relationship_group_keys must be an array"
            };
        }
        const rel = [];
        for (const x of o.relationship_group_keys){
            if (typeof x !== "string" || !x.trim()) {
                return {
                    ok: false,
                    error: "relationship_group_keys must be non-empty strings"
                };
            }
            const t = x.trim();
            if (!JOB_OVERVIEW_RELATIONSHIP_GROUP_KEYS.has(t)) {
                return {
                    ok: false,
                    error: `relationship_group_keys must be one of: ${[
                        ...JOB_OVERVIEW_RELATIONSHIP_GROUP_KEYS
                    ].join(", ")}`
                };
            }
            rel.push(t);
        }
        if (rel.length) relationship_group_keys = rel;
    }
    const semantic = {
        header_keys,
        bands: bandsOut
    };
    if (relationship_group_keys?.length) {
        semantic.relationship_group_keys = relationship_group_keys;
    }
    const out = {
        version: o.version,
        header_keys: semantic.header_keys,
        bands: semantic.bands.map((band)=>({
                band_key: band.band_key,
                enabled: band.enabled,
                items: band.items.map((it)=>{
                    const row = {
                        kind: it.kind,
                        key: it.key
                    };
                    if (it.hint !== undefined) row.hint = it.hint;
                    return row;
                })
            }))
    };
    if (semantic.relationship_group_keys?.length) {
        out.relationship_group_keys = semantic.relationship_group_keys;
    }
    return {
        ok: true,
        value: out
    };
}
const overviewLayoutConfigStrictSchema = {
    parseStrict: parseOverviewLayoutConfigStrict,
    getStoredVersion: getOverviewLayoutConfigStoredVersion
};
}),
"[project]/lib/rrs/overview/overviewLayoutConfigModel.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
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
"[project]/lib/agent/planner/planJobOverviewLayoutRequest.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Deterministic semantic planner for job record overview layout (P0/P1).
 * Pure: no I/O, no LLM.
 */ __turbopack_context__.s([
    "classifyContactSemantics",
    ()=>classifyContactSemantics,
    "computeCustomerFocusedHeaderKeys",
    ()=>computeCustomerFocusedHeaderKeys,
    "detectJobOverviewIntentFlags",
    ()=>detectJobOverviewIntentFlags,
    "jobOverviewRequestHasSupportedIntent",
    ()=>jobOverviewRequestHasSupportedIntent,
    "normalizeJobOverviewRequestText",
    ()=>normalizeJobOverviewRequestText,
    "planJobOverviewLayoutRequest",
    ()=>planJobOverviewLayoutRequest,
    "resolveCatalogCapabilityGapsInText",
    ()=>resolveCatalogCapabilityGapsInText,
    "resolveCatalogFieldsInText",
    ()=>resolveCatalogFieldsInText
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$agent$2f$planner$2f$jobOverviewPlannerTypes$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/agent/planner/jobOverviewPlannerTypes.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$agent$2f$planner$2f$jobOverviewResolutionCatalog$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/agent/planner/jobOverviewResolutionCatalog.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$rrs$2f$overview$2f$overviewLayoutConfigStrict$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/rrs/overview/overviewLayoutConfigStrict.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$rrs$2f$overview$2f$overviewLayoutConfigModel$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/rrs/overview/overviewLayoutConfigModel.ts [app-ssr] (ecmascript)");
;
;
;
;
function normalizeJobOverviewRequestText(text) {
    return text.trim().toLowerCase().replace(/\s+/g, " ").replace(/[’']/g, "'");
}
function longestSynonymHit(normalizedText, synonyms) {
    let bestLen = 0;
    let bestPhrase = "";
    for (const syn of synonyms){
        const s = syn.toLowerCase();
        if (!s.length) continue;
        let idx = normalizedText.indexOf(s);
        while(idx !== -1){
            const before = idx === 0 ? " " : normalizedText[idx - 1];
            const after = idx + s.length >= normalizedText.length ? " " : normalizedText[idx + s.length];
            const boundaryOk = !/\w/.test(before) && !/\w/.test(after);
            if (boundaryOk && s.length >= bestLen) {
                bestLen = s.length;
                bestPhrase = syn;
            }
            idx = normalizedText.indexOf(s, idx + 1);
        }
    }
    return bestLen > 0 ? {
        phrase: bestPhrase,
        len: bestLen
    } : null;
}
function resolveCatalogFieldsInText(normalizedText, catalog) {
    const hits = [];
    for (const f of catalog.system_fields){
        const hit = longestSynonymHit(normalizedText, f.synonyms);
        if (hit) {
            hits.push({
                phrase_matched: hit.phrase,
                field_key: f.key,
                confidence: "high"
            });
        }
    }
    const byKey = new Map();
    for (const h of hits){
        byKey.set(h.field_key, h);
    }
    return [
        ...byKey.values()
    ];
}
function classifyContactSemantics(normalizedText) {
    const ch = /\b(phone|phones|telephone|mobile|cell|email|e-mail|e mail)\b/.test(normalizedText);
    const id = /\b(main\s+contact|primary\s+contact|primary\s+person)\b/.test(normalizedText) || /\bcontact\s+details\b/.test(normalizedText) || /\bcontact\s+info\b/.test(normalizedText) || /\btheir\s+contact\b/.test(normalizedText) || /\bshow\b/.test(normalizedText) && /\bcontact\b/.test(normalizedText) && !/\b(phone|phones|telephone|mobile|cell|email|e-mail|e mail)\b/.test(normalizedText);
    if (id && ch) return "mixed";
    if (id) return "identity";
    if (ch) return "channels";
    return "none";
}
function resolveCatalogCapabilityGapsInText(normalizedText, catalog) {
    const out = [];
    const seen = new Set();
    for (const g of catalog.capability_gaps){
        const hit = longestSynonymHit(normalizedText, g.synonyms);
        if (hit && !seen.has(g.id)) {
            seen.add(g.id);
            out.push({
                concept_id: g.id,
                phrase_matched: hit.phrase,
                reason: g.reason
            });
        }
    }
    return out;
}
function detectJobOverviewIntentFlags(normalizedText) {
    const hideVerb = /\b(hide|remove|collapse|turn off|get rid of)\b/.test(normalizedText);
    const showVerb = /\b(show|display|reveal|turn on|include|add|see|want|give)\b/.test(normalizedText);
    const finWord = /\b(financial|finance|money|pricing|billing|invoice|payment|cost)\b/.test(normalizedText);
    const hide_financial = hideVerb && finWord || /\bno\b\s+\b(financial|money|pricing)\b/.test(normalizedText) || /\b(financial|money)\s+\b(off|gone)\b/.test(normalizedText);
    const show_financial = /\b(show|display|reveal|include|add)\b[^.]{0,48}\b(financial|finance|money|pricing|billing|invoice|payment|cost)\b/.test(normalizedText) || /\b(financial|money)\s+\b(on|back)\b/.test(normalizedText) || /\bturn\b[^.]{0,24}\bfinancial\b[^.]{0,16}\b(on|back)\b/.test(normalizedText);
    const customer_focused = /\bcustomer[- ]?focused\b/.test(normalizedText) || /\bcustomer[- ]centric\b/.test(normalizedText) || /\bcustomer\s+centric\b/.test(normalizedText) || /\bmore\s+customer\b/.test(normalizedText) || /\bcustomer\s+first\b/.test(normalizedText) || /\bcustomer[- ]?focus\b/.test(normalizedText) || /\bemphasize\s+(the\s+)?customer\b/.test(normalizedText) || /\b(make|got)\b[^.]{0,24}\b(the\s+)?(job|work|overview)\b[^.]{0,48}\b(customer|customer-focused|customer\s+centric)\b/.test(normalizedText) || /\b(job|overview)\b[^.]{0,36}\bmore\s+customer\b/.test(normalizedText);
    const service_details_higher = /\b(service|property)\s+details?\b[^.]{0,40}\b(higher|above|up|first|top|sooner)\b/.test(normalizedText) || /\b(higher|above|up|first|top)\b[^.]{0,40}\b(service|property)\s+details?\b/.test(normalizedText) || /\b(put|move|make)\b[^.]{0,50}\b(service|property)\b[^.]{0,40}\b(higher|above|up|first)\b/.test(normalizedText);
    const contact_details_higher = /\b(contact\s+details|contact\s+info|people)\b[^.]{0,48}\b(higher|above|up|first|top)\b/.test(normalizedText) || /\b(higher|above|up|first|top)\b[^.]{0,48}\b(contact\s+details|contact\s+info)\b/.test(normalizedText) || /\b(put|move|make)\b[^.]{0,56}\b(contact|people)\b[^.]{0,36}\b(higher|above|up|first)\b/.test(normalizedText);
    const contact_semantics = classifyContactSemantics(normalizedText);
    let show_main_contact = /\bmain\s+contact\b/.test(normalizedText) || /\bprimary\s+contact\b/.test(normalizedText) || /\bprimary\s+person\b/.test(normalizedText) || /\bcontact\s+details\b/.test(normalizedText) || /\bcontact\s+info\b/.test(normalizedText) || /\btheir\s+contact\b/.test(normalizedText) || /\bshow\b/.test(normalizedText) && /\bcontact\b/.test(normalizedText);
    /** Channel-only utterances (“show phone”) are not identity; keep person flags off unless named above. */ if (contact_semantics === "channels" && !/\b(main\s+contact|primary\s+contact|primary\s+person|contact\s+details|contact\s+info|their\s+contact)\b/.test(normalizedText)) {
        show_main_contact = false;
    }
    const show_address = /\b(address|service address|location)\b/.test(normalizedText) && (showVerb || /\band\b/.test(normalizedText) || /\bnext\s+service\b/.test(normalizedText) || /\btheir\b/.test(normalizedText));
    const show_next_service = /\bnext\s+service\b/.test(normalizedText) || /\bnext\s+visit\b/.test(normalizedText) || /\bnext\s+schedule\b/.test(normalizedText) || /\bnext\s+appointment\b/.test(normalizedText) || /\bnext\s+service\s+date\b/.test(normalizedText);
    const mentionsNextServiceContext = /\bnext\s+service\b/.test(normalizedText) || /\bnext\s+visit\b/.test(normalizedText) || /\bnext\s+schedule\b/.test(normalizedText) || /\bnext\s+appointment\b/.test(normalizedText) || /\bnext\s+service\s+date\b/.test(normalizedText);
    const show_service_details = /\b(service\s+details|service\s+detail)\b/.test(normalizedText) || /\bwhat\s+service\b/.test(normalizedText) || /\bservice\s+they\b/.test(normalizedText) || /\bservice\s+type\b/.test(normalizedText) || /\bservice\s+got\b/.test(normalizedText) || showVerb && /\bservice\b/.test(normalizedText) && !mentionsNextServiceContext && !/\bfinancial\b/.test(normalizedText);
    const referenced_unreachable_contact_channels = /\b(phone|phones|telephone|mobile|cell|email|e-mail|e mail)\b/.test(normalizedText);
    return {
        hide_financial,
        show_financial,
        customer_focused,
        service_details_higher,
        contact_details_higher,
        show_main_contact,
        show_address,
        show_next_service,
        show_service_details,
        referenced_unreachable_contact_channels,
        contact_semantics
    };
}
function hasAnyIntent(i) {
    return i.hide_financial || i.show_financial || i.customer_focused || i.service_details_higher || i.contact_details_higher || i.show_main_contact || i.show_address || i.show_next_service || i.show_service_details || i.referenced_unreachable_contact_channels;
}
function jobOverviewRequestHasSupportedIntent(rawRequestText) {
    return hasAnyIntent(detectJobOverviewIntentFlags(normalizeJobOverviewRequestText(rawRequestText)));
}
function dedupeBands(bands) {
    const seen = new Set();
    const out = [];
    for (const b of bands){
        if (seen.has(b.band_key)) continue;
        seen.add(b.band_key);
        out.push(structuredClone(b));
    }
    return out;
}
function getBand(layout, key) {
    return layout.bands.find((b)=>b.band_key === key);
}
function ensureBand(layout, key, template) {
    let b = getBand(layout, key);
    if (!b) {
        b = structuredClone(template);
        layout.bands.push(b);
    }
    return b;
}
function addSystemItemIfMissing(band, key) {
    if (band.items.some((it)=>it.key === key)) return false;
    band.items.push({
        kind: "system_field",
        key
    });
    return true;
}
function addHeaderIfMissing(layout, key) {
    if (layout.header_keys.includes(key)) return false;
    layout.header_keys.push(key);
    return true;
}
function computeCustomerFocusedHeaderKeys(headerKeys) {
    const nextHeader = [];
    const rest = [
        ...headerKeys
    ];
    const take = (k)=>{
        const i = rest.indexOf(k);
        if (i >= 0) {
            rest.splice(i, 1);
            nextHeader.push(k);
        }
    };
    take("title");
    take("_customer_name");
    take("_primary_person_name");
    for (const k of [
        ...rest
    ]){
        if (!nextHeader.includes(k)) nextHeader.push(k);
    }
    return nextHeader;
}
function sortedRelationshipKeysSig(keys) {
    return [
        ...keys ?? []
    ].sort().join("\0");
}
/** True when layout already matches what the customer-focused block would apply (no meaningful diff). */ function layoutMatchesCustomerFocusedTemplate(layout, catalog) {
    const want = sortedRelationshipKeysSig([
        ...catalog.relationship_group_keys
    ]);
    const have = sortedRelationshipKeysSig(layout.relationship_group_keys);
    if (!want.length || want !== have) return false;
    const people = getBand(layout, "people");
    if (!people?.enabled) return false;
    if (!people.items.some((it)=>it.key === "_primary_person_name")) return false;
    const rel = getBand(layout, "relationships");
    if (!rel?.enabled) return false;
    const summary = getBand(layout, "summary");
    if (!summary?.enabled) return false;
    if (!summary.items.some((it)=>it.key === "_customer_name")) return false;
    const expectedHeader = computeCustomerFocusedHeaderKeys(layout.header_keys);
    if (JSON.stringify(layout.header_keys) !== JSON.stringify(expectedHeader)) return false;
    return true;
}
function appendContactSemanticsDoctrineNotes(parsed, rationale) {
    switch(parsed.contact_semantics){
        case "identity":
            rationale.push("Contact semantics: identity — primary person uses the people band; header stays off identity unless customer-focused template applies.");
            break;
        case "channels":
            rationale.push("Contact semantics: channels (phone/email) — no canonical overview system_field keys; targets stay unresolved (relationship UI / custom fields elsewhere).");
            break;
        case "mixed":
            rationale.push("Contact semantics: mixed (identity + channels) — resolved person/summary fields in layout; phone/email remain unresolved until the catalog gains keys.");
            break;
        default:
            break;
    }
}
function reorderBandAfterSummary(layout, bandKey) {
    const idx = layout.bands.findIndex((b)=>b.band_key === bandKey);
    if (idx < 0) return;
    const [b] = layout.bands.splice(idx, 1);
    const sumIdx = layout.bands.findIndex((x)=>x.band_key === "summary");
    const insertAt = sumIdx >= 0 ? sumIdx + 1 : 0;
    layout.bands.splice(insertAt, 0, b);
}
function defaultFinancialBand() {
    const d = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$rrs$2f$overview$2f$overviewLayoutConfigModel$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getDefaultOverviewLayoutConfig"])();
    const f = d.bands.find((b)=>b.band_key === "financial");
    return f ? structuredClone(f) : {
        band_key: "financial",
        enabled: true,
        items: []
    };
}
function defaultServicePropertyBand(catalog) {
    return {
        band_key: "service_property",
        enabled: true,
        items: catalog.service_property_default_items.map((it)=>({
                kind: "system_field",
                key: it.key
            }))
    };
}
function layoutBodyFingerprint(layout) {
    return JSON.stringify({
        hk: layout.header_keys,
        rg: layout.relationship_group_keys ?? null,
        bands: layout.bands.map((b)=>({
                k: b.band_key,
                e: b.enabled,
                items: b.items.map((i)=>i.key)
            }))
    });
}
function catalogFieldEntry(catalog, fieldKey) {
    return catalog.system_fields.find((f)=>f.key === fieldKey);
}
/**
 * Header ribbon: identity/status (title, customer, primary) for customer-focused template only.
 * Schedule, location, and service line stay in summary band unless catalog explicitly allows header.
 */ function shouldPromoteFieldToHeader(fieldKey, entry, promotePrimaryToHeader) {
    if (fieldKey === "_primary_person_name") return promotePrimaryToHeader;
    return entry.allow_header;
}
function applyCatalogSystemField(layout, catalog, defaultLayout, fieldKey, phraseMatched, confidence, outcomes, rationale, bandsTouched, promotePrimaryToHeader) {
    const entry = catalogFieldEntry(catalog, fieldKey);
    if (!entry) return;
    const tmpl = defaultLayout.bands.find((b)=>b.band_key === entry.preferred_band) ?? {
        band_key: entry.preferred_band,
        enabled: true,
        items: []
    };
    const band = ensureBand(layout, entry.preferred_band, tmpl);
    const addedItem = addSystemItemIfMissing(band, fieldKey);
    if (addedItem) {
        outcomes.push({
            kind: "system_field",
            field_key: fieldKey,
            phrase_matched: phraseMatched,
            outcome: "added",
            confidence
        });
        rationale.push(`Added ${fieldKey} to ${entry.preferred_band} (matched “${phraseMatched}”).`);
    } else {
        outcomes.push({
            kind: "system_field",
            field_key: fieldKey,
            phrase_matched: phraseMatched,
            outcome: "already_present",
            confidence
        });
    }
    bandsTouched.add(entry.preferred_band);
    if (shouldPromoteFieldToHeader(fieldKey, entry, promotePrimaryToHeader)) {
        const addedHeader = addHeaderIfMissing(layout, fieldKey);
        if (addedHeader) {
            rationale.push(`Added ${fieldKey} to header (identity strip).`);
        }
    }
}
/**
 * Prefer people band for contact narrative; avoid the same identity field in header + people
 * when the request is contact-focused but not the full customer header template.
 */ function applyEditorialContactHeaderPolicy(layout, parsed, rationale) {
    if (parsed.customer_focused) return;
    const people = getBand(layout, "people");
    if (!people?.enabled || !people.items.some((it)=>it.key === "_primary_person_name")) return;
    if (!(parsed.show_main_contact || parsed.contact_details_higher)) return;
    const had = layout.header_keys.includes("_primary_person_name");
    layout.header_keys = layout.header_keys.filter((k)=>k !== "_primary_person_name");
    if (had) {
        rationale.push("Removed _primary_person_name from the header ribbon — doctrine keeps primary identity in the people band for contact-only / contact-higher requests (avoids duplicating the identity strip and the people band).");
    }
}
function takeSnapshot(layout) {
    const fin = getBand(layout, "financial");
    const bands_items = {};
    for (const b of layout.bands){
        bands_items[b.band_key] = b.items.map((i)=>i.key);
    }
    return {
        header_keys: [
            ...layout.header_keys
        ],
        band_order: layout.bands.map((b)=>b.band_key),
        financial_enabled: fin ? fin.enabled : null,
        relationship_group_keys: layout.relationship_group_keys ? [
            ...layout.relationship_group_keys
        ] : undefined,
        bands_items
    };
}
function bandsContentChangedKeys(before, after) {
    const keys = new Set([
        ...Object.keys(before.bands_items),
        ...Object.keys(after.bands_items)
    ]);
    const changed = [];
    for (const k of keys){
        const a = (before.bands_items[k] ?? []).join("\0");
        const b = (after.bands_items[k] ?? []).join("\0");
        if (a !== b) changed.push(k);
    }
    return changed;
}
function diffSnapshots(before, after) {
    const d = {};
    if (JSON.stringify(before.header_keys) !== JSON.stringify(after.header_keys)) {
        d.header_keys = {
            before: before.header_keys,
            after: after.header_keys
        };
    }
    if (JSON.stringify(before.band_order) !== JSON.stringify(after.band_order)) {
        d.band_order = {
            before: before.band_order,
            after: after.band_order
        };
    }
    if (before.financial_enabled !== after.financial_enabled || before.financial_enabled === null !== (after.financial_enabled === null)) {
        d.financial_band_enabled = {
            before: before.financial_enabled,
            after: after.financial_enabled
        };
    }
    if (JSON.stringify(before.relationship_group_keys ?? null) !== JSON.stringify(after.relationship_group_keys ?? null)) {
        d.relationship_group_keys = {
            before: before.relationship_group_keys,
            after: after.relationship_group_keys
        };
    }
    const bic = bandsContentChangedKeys(before, after);
    if (bic.length) d.bands_content_changed = bic;
    return d;
}
function mergeUnresolved(fromText, extraRationale) {
    const byId = new Map();
    for (const u of fromText){
        byId.set(u.concept_id, u);
        extraRationale.push(`Unresolved: “${u.phrase_matched}” (${u.concept_id}) — ${u.reason}`);
    }
    return [
        ...byId.values()
    ];
}
function mergeFieldWant(m, key, w) {
    const cur = m.get(key);
    if (!cur || w.phrase.length >= cur.phrase.length) m.set(key, w);
}
function planJobOverviewLayoutRequest(requestText, currentOverviewConfig, catalog = __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$agent$2f$planner$2f$jobOverviewResolutionCatalog$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["JOB_OVERVIEW_RESOLUTION_CATALOG"]) {
    const user_request_text = requestText.trim();
    const norm = normalizeJobOverviewRequestText(user_request_text);
    const parsed_intent = detectJobOverviewIntentFlags(norm);
    const ambiguity = [];
    if (parsed_intent.hide_financial && parsed_intent.show_financial) {
        ambiguity.push({
            code: "financial_hide_show_conflict",
            detail: "Request both hides and shows the financial band; clarify which applies."
        });
    }
    if (ambiguity.length > 0) {
        return {
            ok: false,
            user_request_text,
            error: "Ambiguous request; cannot produce a single proposal.",
            ambiguity,
            rationale: [
                "Conflicting directives for the financial band."
            ]
        };
    }
    if (!hasAnyIntent(parsed_intent)) {
        return {
            ok: false,
            user_request_text,
            error: "No supported job overview intent matched this request."
        };
    }
    const rationale = [];
    if (parsed_intent.contact_semantics !== "none") {
        appendContactSemanticsDoctrineNotes(parsed_intent, rationale);
    }
    const expected_config_version = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$rrs$2f$overview$2f$overviewLayoutConfigStrict$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getOverviewLayoutConfigStoredVersion"])(currentOverviewConfig);
    const base = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$rrs$2f$overview$2f$overviewLayoutConfigModel$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["parseOverviewLayoutConfig"])(currentOverviewConfig);
    base.bands = dedupeBands(base.bands);
    const layout = structuredClone(base);
    const fingerprintBefore = layoutBodyFingerprint(layout);
    const beforeSnap = takeSnapshot(layout);
    const defaultLayout = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$rrs$2f$overview$2f$overviewLayoutConfigModel$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getDefaultOverviewLayoutConfig"])();
    const bandsTouched = new Set();
    let relationship_groups_touched = false;
    const resolvedOutcomes = [];
    const catalogHits = resolveCatalogFieldsInText(norm, catalog);
    const gapRefs = resolveCatalogCapabilityGapsInText(norm, catalog);
    const resolutionFields = [
        ...catalogHits
    ];
    if (parsed_intent.hide_financial) {
        const fin = ensureBand(layout, "financial", defaultFinancialBand());
        fin.enabled = false;
        bandsTouched.add("financial");
        rationale.push("Disabled the financial band (reversible via enabled flag).");
    }
    if (parsed_intent.show_financial) {
        const fin = ensureBand(layout, "financial", defaultFinancialBand());
        if (fin.items.length === 0) {
            const tmpl = defaultFinancialBand();
            fin.items = structuredClone(tmpl.items);
        }
        fin.enabled = true;
        bandsTouched.add("financial");
        rationale.push("Enabled the financial band and ensured default money fields when empty.");
    }
    if (parsed_intent.service_details_higher) {
        const sp = ensureBand(layout, "service_property", defaultServicePropertyBand(catalog));
        sp.enabled = true;
        if (sp.items.length === 0) {
            sp.items = defaultServicePropertyBand(catalog).items.map((x)=>({
                    ...x
                }));
        }
        reorderBandAfterSummary(layout, "service_property");
        bandsTouched.add("service_property");
        rationale.push("Moved service_property up after summary; service line (service_key) stays in summary unless you ask for it separately — avoids duplicating the same idea in header and band.");
    }
    if (parsed_intent.contact_details_higher) {
        const people = ensureBand(layout, "people", defaultLayout.bands.find((b)=>b.band_key === "people"));
        people.enabled = true;
        reorderBandAfterSummary(layout, "people");
        bandsTouched.add("people");
        rationale.push("Moved the people band immediately after summary (“contact higher” adjusts band order per doctrine, not the header ribbon).");
    }
    const summaryBand = ensureBand(layout, "summary", defaultLayout.bands.find((b)=>b.band_key === "summary"));
    if (parsed_intent.show_main_contact) {
        const people = ensureBand(layout, "people", defaultLayout.bands.find((b)=>b.band_key === "people"));
        people.enabled = true;
    }
    if (parsed_intent.show_service_details) {
        const sp = ensureBand(layout, "service_property", defaultServicePropertyBand(catalog));
        sp.enabled = true;
        if (sp.items.length === 0) {
            sp.items = defaultServicePropertyBand(catalog).items.map((x)=>({
                    ...x
                }));
        }
        bandsTouched.add("service_property");
        rationale.push("Enabled service_property for on-site attributes (home type, size, beds/baths); the booked service line uses service_key in summary, not duplicated in header.");
    }
    const fieldWants = new Map();
    if (parsed_intent.show_address) {
        mergeFieldWant(fieldWants, "_location_label", {
            phrase: "address",
            confidence: "high"
        });
    }
    if (parsed_intent.show_next_service) {
        mergeFieldWant(fieldWants, "_next_schedule", {
            phrase: "next service",
            confidence: "high"
        });
    }
    if (parsed_intent.show_main_contact) {
        mergeFieldWant(fieldWants, "_primary_person_name", {
            phrase: "main contact",
            confidence: "high"
        });
    }
    if (parsed_intent.contact_details_higher) {
        mergeFieldWant(fieldWants, "_primary_person_name", {
            phrase: "contact details higher",
            confidence: "high"
        });
    }
    if (parsed_intent.show_service_details) {
        mergeFieldWant(fieldWants, "service_key", {
            phrase: "service details",
            confidence: "high"
        });
    }
    for (const hit of catalogHits){
        mergeFieldWant(fieldWants, hit.field_key, {
            phrase: hit.phrase_matched,
            confidence: hit.confidence
        });
    }
    const fieldApplyOrder = [
        "_location_label",
        "_next_schedule",
        "scheduled_at",
        "service_key",
        "title",
        "_customer_name",
        "_primary_person_name",
        "display_total_cents"
    ];
    for (const fk of fieldApplyOrder){
        const w = fieldWants.get(fk);
        if (!w) continue;
        applyCatalogSystemField(layout, catalog, defaultLayout, fk, w.phrase, w.confidence, resolvedOutcomes, rationale, bandsTouched, false);
    }
    for (const [fk, w] of fieldWants){
        if (fieldApplyOrder.includes(fk)) continue;
        applyCatalogSystemField(layout, catalog, defaultLayout, fk, w.phrase, w.confidence, resolvedOutcomes, rationale, bandsTouched, false);
    }
    if (parsed_intent.customer_focused) {
        if (layoutMatchesCustomerFocusedTemplate(layout, catalog)) {
            rationale.push("Customer-focused template already matches this layout (relationship_group_keys, people and relationships on, summary account name, header identity order); no layout churn.");
        } else {
            layout.relationship_group_keys = [
                ...catalog.relationship_group_keys
            ];
            relationship_groups_touched = true;
            const people = ensureBand(layout, "people", defaultLayout.bands.find((b)=>b.band_key === "people"));
            const rel = ensureBand(layout, "relationships", defaultLayout.bands.find((b)=>b.band_key === "relationships") ?? {
                band_key: "relationships",
                enabled: true,
                items: []
            });
            people.enabled = true;
            rel.enabled = true;
            addSystemItemIfMissing(people, "_primary_person_name");
            addSystemItemIfMissing(summaryBand, "_customer_name");
            layout.header_keys = computeCustomerFocusedHeaderKeys(layout.header_keys);
            bandsTouched.add("people");
            bandsTouched.add("relationships");
            bandsTouched.add("summary");
            rationale.push("Customer-focused template: relationship_group_keys set to both registry groups; people + relationships bands on; header orders title → account → primary person (identity strip).");
            if (rel.items.length === 0) {
                rationale.push("Relationships band has no item rows in config; relationship_group_keys still scope which relationship slices the resolver may show on the overview.");
            }
            resolutionFields.push({
                phrase_matched: "customer-focused",
                field_key: "_customer_name",
                confidence: "medium"
            });
        }
    }
    applyEditorialContactHeaderPolicy(layout, parsed_intent, rationale);
    const dedupeOutcomes = (()=>{
        const m = new Map();
        for (const o of resolvedOutcomes){
            const prev = m.get(o.field_key);
            if (!prev || o.outcome === "added") m.set(o.field_key, o);
        }
        return [
            ...m.values()
        ];
    })();
    const alreadyIds = dedupeOutcomes.filter((o)=>o.outcome === "already_present").map((o)=>o.field_key);
    if (alreadyIds.length > 0) {
        rationale.push(`Already satisfied (layout already exposed these): ${alreadyIds.join(", ")} — no duplicate items added.`);
    }
    const unresolved = mergeUnresolved(gapRefs, rationale);
    const dedupResolution = (()=>{
        const m = new Map();
        for (const r of resolutionFields){
            const prev = m.get(r.field_key);
            if (!prev || r.confidence === "high") m.set(r.field_key, r);
        }
        return [
            ...m.values()
        ];
    })();
    const nextVersion = Math.max(1, expected_config_version + 1);
    const configRecord = {
        version: nextVersion,
        header_keys: layout.header_keys,
        bands: layout.bands.map((band)=>({
                band_key: band.band_key,
                enabled: band.enabled,
                items: band.items.map((it)=>({
                        kind: it.kind,
                        key: it.key
                    }))
            }))
    };
    if (layout.relationship_group_keys?.length) {
        configRecord.relationship_group_keys = layout.relationship_group_keys;
    }
    const strict = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$rrs$2f$overview$2f$overviewLayoutConfigStrict$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["parseOverviewLayoutConfigStrict"])(configRecord);
    if (!strict.ok) {
        return {
            ok: false,
            user_request_text,
            error: `Strict validation failed: ${strict.error}`,
            rationale
        };
    }
    const afterSemantic = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$rrs$2f$overview$2f$overviewLayoutConfigModel$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["parseOverviewLayoutConfig"])(strict.value);
    afterSemantic.bands = dedupeBands(afterSemantic.bands);
    const afterSnap = takeSnapshot(afterSemantic);
    const diff_summary = diffSnapshots(beforeSnap, afterSnap);
    const fingerprintAfter = layoutBodyFingerprint(afterSemantic);
    const effective_layout_change = fingerprintBefore !== fingerprintAfter;
    if (!effective_layout_change && unresolved.length > 0) {
        rationale.push("No layout keys changed; request referenced fields that are not available as canonical overview items (see unresolved_targets).");
    }
    if (!effective_layout_change && unresolved.length === 0 && dedupeOutcomes.every((o)=>o.outcome === "already_present")) {
        rationale.push("Layout already matched the request; version will still increment on apply if you submit.");
    }
    return {
        ok: true,
        planner_version: __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$agent$2f$planner$2f$jobOverviewPlannerTypes$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["JOB_OVERVIEW_PLANNER_VERSION"],
        user_request_text,
        target: {
            target_kind: "record_overview_layout",
            entity_type: "job",
            surface: "overview"
        },
        parsed_intent,
        resolution: {
            fields: dedupResolution,
            resolved_outcomes: dedupeOutcomes,
            unresolved_targets: unresolved,
            relationship_groups_touched,
            bands_touched: [
                ...bandsTouched
            ]
        },
        rationale,
        ambiguity,
        diff_summary,
        effective_layout_change,
        config: strict.value,
        expected_config_version
    };
}
}),
"[project]/lib/admin/agentLab/mergeFinancialBandOverview.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Toggle `financial` band enabled on job overview layout config (strict v1 shape).
 */ __turbopack_context__.s([
    "mergeFinancialBandEnabled",
    ()=>mergeFinancialBandEnabled
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$rrs$2f$overview$2f$overviewLayoutConfigStrict$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/rrs/overview/overviewLayoutConfigStrict.ts [app-ssr] (ecmascript)");
;
function mergeFinancialBandEnabled(configRaw, enabled) {
    if (configRaw == null || typeof configRaw !== "object" || Array.isArray(configRaw)) {
        return {
            ok: false,
            error: "Layout config is missing."
        };
    }
    const base = structuredClone(configRaw);
    const bandsIn = base.bands;
    if (!Array.isArray(bandsIn)) {
        return {
            ok: false,
            error: "Layout config has no bands array."
        };
    }
    const bands = bandsIn.map((b)=>b != null && typeof b === "object" && !Array.isArray(b) ? {
            ...b
        } : b);
    const idx = bands.findIndex((b)=>b != null && typeof b === "object" && !Array.isArray(b) && b.band_key === "financial");
    if (idx < 0) {
        return {
            ok: false,
            error: "No “financial” band in current overview config."
        };
    }
    const band = bands[idx];
    band.enabled = enabled;
    bands[idx] = band;
    base.bands = bands;
    const stored = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$rrs$2f$overview$2f$overviewLayoutConfigStrict$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getOverviewLayoutConfigStoredVersion"])(base);
    const nextVersion = stored <= 0 ? 1 : stored + 1;
    base.version = nextVersion;
    const strict = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$rrs$2f$overview$2f$overviewLayoutConfigStrict$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["parseOverviewLayoutConfigStrict"])(base);
    if (!strict.ok) {
        return {
            ok: false,
            error: `Invalid config after edit: ${strict.error}`
        };
    }
    return {
        ok: true,
        config: strict.value,
        expected_config_version: stored
    };
}
}),
"[project]/lib/admin/agentLab/buildAssistantStructuredOverride.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "buildAssistantPayload",
    ()=>buildAssistantPayload,
    "buildFieldVisibilityStructuredOverrideParts",
    ()=>buildFieldVisibilityStructuredOverrideParts,
    "buildRecordLayoutStructuredOverrideParts",
    ()=>buildRecordLayoutStructuredOverrideParts
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$agentLab$2f$mergeFinancialBandOverview$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/agentLab/mergeFinancialBandOverview.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$agentLab$2f$overviewLayoutSemanticAssistant$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/agentLab/overviewLayoutSemanticAssistant.ts [app-ssr] (ecmascript)");
;
;
function newIntent() {
    return {
        intent_id: crypto.randomUUID(),
        intent_version: 1
    };
}
function buildFieldVisibilityStructuredOverrideParts(fieldDefinitionId, expectedUpdatedAt, visibilityPatch) {
    const { intent_id, intent_version } = newIntent();
    return {
        intent_id,
        intent_version,
        intent_type: "update_field_visibility",
        slots: {
            target_kind: "field_definition_visibility",
            field_definition_id: fieldDefinitionId,
            expected_updated_at: expectedUpdatedAt,
            visibility_patch: {
                version: 1,
                ...visibilityPatch
            }
        }
    };
}
function buildRecordLayoutStructuredOverrideParts(config, expectedConfigVersion) {
    const { intent_id, intent_version } = newIntent();
    return {
        intent_id,
        intent_version,
        intent_type: "update_record_layout",
        slots: {
            target_kind: "record_overview_layout",
            entity_type: "job",
            surface: "overview",
            config,
            expected_config_version: expectedConfigVersion
        }
    };
}
function buildAssistantPayload(parsed, ctx) {
    if (parsed.kind === "field_table") {
        const hide = parsed.action === "hide";
        const vis = {
            is_visible_in_table: !hide
        };
        return {
            ok: true,
            payload: {
                route: "v2",
                label: `${parsed.action} table visibility for field`,
                structured_override: buildFieldVisibilityStructuredOverrideParts(ctx.fieldDefinitionId, ctx.expectedUpdatedAt, vis)
            }
        };
    }
    if (parsed.kind === "field_drawer") {
        const hide = parsed.action === "hide";
        const vis = {
            is_visible_in_drawer: !hide
        };
        return {
            ok: true,
            payload: {
                route: "v2",
                label: `${parsed.action} drawer visibility for field`,
                structured_override: buildFieldVisibilityStructuredOverrideParts(ctx.fieldDefinitionId, ctx.expectedUpdatedAt, vis)
            }
        };
    }
    if (parsed.kind === "overview_financial") {
        const enabled = parsed.action === "show";
        const merged = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$agentLab$2f$mergeFinancialBandOverview$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["mergeFinancialBandEnabled"])(ctx.overviewConfigRaw, enabled);
        if (!merged.ok) {
            return {
                ok: false,
                error: merged.error
            };
        }
        return {
            ok: true,
            payload: {
                route: "v1",
                label: `${parsed.action} financial band on job overview`,
                structured_override: buildRecordLayoutStructuredOverrideParts(merged.config, merged.expected_config_version)
            }
        };
    }
    if (parsed.kind === "overview_layout_semantic") {
        const prev = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$agentLab$2f$overviewLayoutSemanticAssistant$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["runOverviewLayoutSemanticPreview"])(parsed.text, ctx.overviewConfigRaw);
        if (!prev.ok) {
            return {
                ok: false,
                error: prev.error,
                semanticPlannerFailure: prev.planner
            };
        }
        return {
            ok: true,
            payload: {
                route: "v1",
                label: "Semantic job overview layout (preview)",
                structured_override: prev.structured_override,
                semanticPlanner: prev.planner
            }
        };
    }
    return {
        ok: false,
        error: "Unsupported parse kind."
    };
}
}),
"[project]/lib/admin/agentLab/overviewLayoutSemanticAssistant.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Agent Config Lab — semantic overview layout preview/apply bridge (job, overview only).
 */ __turbopack_context__.s([
    "runOverviewLayoutSemanticPreview",
    ()=>runOverviewLayoutSemanticPreview
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$agent$2f$planner$2f$planJobOverviewLayoutRequest$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/agent/planner/planJobOverviewLayoutRequest.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$agent$2f$planner$2f$jobOverviewResolutionCatalog$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/agent/planner/jobOverviewResolutionCatalog.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$agentLab$2f$buildAssistantStructuredOverride$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/agentLab/buildAssistantStructuredOverride.ts [app-ssr] (ecmascript)");
;
;
;
function runOverviewLayoutSemanticPreview(commandText, overviewConfigRaw, catalog = __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$agent$2f$planner$2f$jobOverviewResolutionCatalog$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["JOB_OVERVIEW_RESOLUTION_CATALOG"]) {
    const planner = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$agent$2f$planner$2f$planJobOverviewLayoutRequest$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["planJobOverviewLayoutRequest"])(commandText, overviewConfigRaw, catalog);
    if (!planner.ok) {
        return {
            ok: false,
            error: planner.error,
            planner
        };
    }
    const structured_override = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$agentLab$2f$buildAssistantStructuredOverride$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["buildRecordLayoutStructuredOverrideParts"])(planner.config, planner.expected_config_version);
    return {
        ok: true,
        structured_override,
        planner
    };
}
}),
"[project]/lib/admin/agentLab/semanticOverviewNoopSummary.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "classifySemanticOverviewNoop",
    ()=>classifySemanticOverviewNoop,
    "semanticOverviewNoopHeadline",
    ()=>semanticOverviewNoopHeadline,
    "shouldBlockSemanticNoopApply",
    ()=>shouldBlockSemanticNoopApply
]);
function classifySemanticOverviewNoop(planner) {
    if (planner.effective_layout_change) return "change";
    if (planner.resolution.unresolved_targets.length > 0) return "noop_unresolved_only";
    return "noop_already_satisfied";
}
function semanticOverviewNoopHeadline(kind) {
    switch(kind){
        case "change":
            return null;
        case "noop_already_satisfied":
            return "This request is already satisfied by the current layout.";
        case "noop_unresolved_only":
            return "This request only referenced unsupported overview targets (e.g. phone/email), so no layout change is proposed.";
        default:
            return null;
    }
}
function shouldBlockSemanticNoopApply(params) {
    if (params.previewRoute !== "v1" || !params.semanticPlanner) return false;
    if (params.semanticPlanner.effective_layout_change) return false;
    return !params.applySemanticNoopAnyway;
}
}),
"[project]/lib/adminV2/aiCommandSurface/aiCommandSurfaceModel.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "badgeLabel",
    ()=>badgeLabel,
    "confidenceFromPlanner",
    ()=>confidenceFromPlanner,
    "formatDiffSummaryHuman",
    ()=>formatDiffSummaryHuman,
    "formatIntentSummary",
    ()=>formatIntentSummary,
    "headlineForPreview",
    ()=>headlineForPreview,
    "statusFromPlanner",
    ()=>statusFromPlanner
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$agentLab$2f$semanticOverviewNoopSummary$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/agentLab/semanticOverviewNoopSummary.ts [app-ssr] (ecmascript)");
;
function badgeLabel(c) {
    switch(c){
        case "ready":
            return "Ready to apply";
        case "partial":
            return "Partial — review gaps";
        case "up_to_date":
            return "Already up to date";
        case "gaps_only":
            return "Unsupported items only";
        case "in_progress":
            return "Working…";
        case "applied":
            return "Applied";
        case "error":
            return "Couldn’t complete";
        default:
            return "";
    }
}
function statusFromPlanner(planner) {
    if (planner.effective_layout_change) {
        return planner.resolution.unresolved_targets.length > 0 ? "partial" : "ready";
    }
    const noopKind = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$agentLab$2f$semanticOverviewNoopSummary$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["classifySemanticOverviewNoop"])(planner);
    if (noopKind === "noop_unresolved_only") return "gaps_only";
    return "up_to_date";
}
function headlineForPreview(planner) {
    if (!planner.effective_layout_change) {
        const k = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$agentLab$2f$semanticOverviewNoopSummary$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["classifySemanticOverviewNoop"])(planner);
        const h = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$agentLab$2f$semanticOverviewNoopSummary$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["semanticOverviewNoopHeadline"])(k) ?? "No changes to apply";
        return {
            headline: h,
            subline: k === "noop_unresolved_only" ? "Some asks aren’t supported on the overview yet." : "Layout already matches.",
            kind: k === "noop_unresolved_only" ? "unresolved_only" : "no_op"
        };
    }
    return {
        headline: "Review changes before applying",
        subline: "Preview ready — job overview only.",
        kind: "action_preview"
    };
}
function formatIntentSummary(p) {
    const lines = [];
    if (p.hide_financial) lines.push("Financial band off on the overview.");
    if (p.show_financial) lines.push("Financial band on the overview.");
    if (p.customer_focused) lines.push("Customer-focused bands: relationship context and people up front.");
    if (p.service_details_higher) lines.push("Service / property details higher on the page.");
    if (p.contact_details_higher) lines.push("Contact / people block higher on the page.");
    if (p.show_main_contact) lines.push("Primary contact visible in the header or bands.");
    if (p.show_address) lines.push("Address / location surfaced on the overview.");
    if (p.show_next_service) lines.push("Next service / schedule on the overview.");
    if (p.show_service_details) lines.push("Booked service line / service details visible.");
    if (p.referenced_unreachable_contact_channels) {
        lines.push("Phone/email called out — not mappable to overview fields yet.");
    }
    if (p.contact_semantics === "mixed") {
        lines.push("Mix of contact identity and channels; channel rows stay unresolved for now.");
    } else if (p.contact_semantics === "channels") {
        lines.push("Reads as phone/email channels, not a placeable overview block.");
    } else if (p.contact_semantics === "identity") {
        lines.push("Reads as a person/contact to show on the overview.");
    }
    if (lines.length === 0) lines.push("Adjust overview layout.");
    return lines;
}
function boolPhrase(v) {
    if (v === true) return "on";
    if (v === false) return "off";
    return "not set";
}
function formatDiffSummaryHuman(d) {
    const out = [];
    if (d.financial_band_enabled) {
        const { before, after } = d.financial_band_enabled;
        if (before !== after) {
            out.push(`Financial band ${boolPhrase(before)} → ${boolPhrase(after)}.`);
        }
    }
    if (d.band_order) {
        const a = JSON.stringify(d.band_order.before);
        const b = JSON.stringify(d.band_order.after);
        if (a !== b) out.push("Band order changes — what sits higher on the overview shifts.");
    }
    if (d.header_keys) {
        const a = JSON.stringify(d.header_keys.before);
        const b = JSON.stringify(d.header_keys.after);
        if (a !== b) out.push("Header chips updated or reordered.");
    }
    if (d.relationship_group_keys) {
        const a = JSON.stringify(d.relationship_group_keys.before ?? []);
        const b = JSON.stringify(d.relationship_group_keys.after ?? []);
        if (a !== b) out.push("Relationship summary groups updated.");
    }
    if (d.bands_content_changed && d.bands_content_changed.length > 0) {
        out.push(`Fields touched: ${d.bands_content_changed.join(", ")}.`);
    }
    if (out.length === 0) out.push("See technical details for raw diff.");
    return out;
}
const confidenceFromPlanner = statusFromPlanner;
}),
"[project]/lib/adminV2/aiActivity/activityTypes.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "activityStatusWord",
    ()=>activityStatusWord,
    "activitySummaryLine",
    ()=>activitySummaryLine,
    "formatActivityTs",
    ()=>formatActivityTs,
    "shortActivityId",
    ()=>shortActivityId
]);
function formatActivityTs(iso) {
    try {
        const d = new Date(iso);
        return d.toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        });
    } catch  {
        return iso;
    }
}
function activityStatusWord(s) {
    switch(s){
        case "applied":
            return "Applied";
        case "failed":
            return "Error";
        default:
            return "Unknown";
    }
}
function shortActivityId(id) {
    if (!id || id.length < 10) return id;
    return `${id.slice(0, 8)}…`;
}
function activitySummaryLine(it) {
    const word = activityStatusWord(it.status);
    const tail = it.outcome_summary?.trim() || `Job overview · ${it.entity_type}/${it.surface}`;
    return `${word} · ${tail}`;
}
}),
"[project]/app/adminV2/components/aiActivity/AiActivityDetailPanel.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>AiActivityDetailPanel
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/styles/tokens/colors.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminV2$2f$aiActivity$2f$activityTypes$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/adminV2/aiActivity/activityTypes.ts [app-ssr] (ecmascript)");
"use client";
;
;
;
function AiActivityDetailPanel(props) {
    const { selected, techOpen, onToggleTech, footer } = props;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "min-h-0 flex-1 overflow-y-auto px-4 py-3",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-start justify-between gap-2",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                        className: "text-base font-semibold",
                        style: {
                            color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].textPrimary
                        },
                        children: [
                            (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminV2$2f$aiActivity$2f$activityTypes$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["activityStatusWord"])(selected.status),
                            " · Job overview layout"
                        ]
                    }, void 0, true, {
                        fileName: "[project]/app/adminV2/components/aiActivity/AiActivityDetailPanel.tsx",
                        lineNumber: 25,
                        columnNumber: 17
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                        style: {
                            backgroundColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].kpiBandBusinessWash,
                            color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["brand"].secondary,
                            border: `1px solid ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].border}`
                        },
                        children: selected.agent_domain
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/aiActivity/AiActivityDetailPanel.tsx",
                        lineNumber: 28,
                        columnNumber: 17
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/app/adminV2/components/aiActivity/AiActivityDetailPanel.tsx",
                lineNumber: 24,
                columnNumber: 13
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "mt-1 text-xs",
                style: {
                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].textSecondary
                },
                children: [
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminV2$2f$aiActivity$2f$activityTypes$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["formatActivityTs"])(selected.created_at),
                    " · ",
                    selected.outcome_summary
                ]
            }, void 0, true, {
                fileName: "[project]/app/adminV2/components/aiActivity/AiActivityDetailPanel.tsx",
                lineNumber: 39,
                columnNumber: 13
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("dl", {
                className: "mt-4 grid gap-2 text-xs",
                style: {
                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].textPrimary
                },
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("dt", {
                                className: "font-semibold tracking-wide",
                                style: {
                                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].inspectorSectionMuted
                                },
                                children: "Request (command)"
                            }, void 0, false, {
                                fileName: "[project]/app/adminV2/components/aiActivity/AiActivityDetailPanel.tsx",
                                lineNumber: 45,
                                columnNumber: 21
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("dd", {
                                className: "mt-0.5",
                                children: selected.request_text?.trim() ? selected.request_text : "Not stored for this audit row — structured intent only."
                            }, void 0, false, {
                                fileName: "[project]/app/adminV2/components/aiActivity/AiActivityDetailPanel.tsx",
                                lineNumber: 48,
                                columnNumber: 21
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/app/adminV2/components/aiActivity/AiActivityDetailPanel.tsx",
                        lineNumber: 44,
                        columnNumber: 17
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("dt", {
                                className: "font-semibold tracking-wide",
                                style: {
                                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].inspectorSectionMuted
                                },
                                children: "Target"
                            }, void 0, false, {
                                fileName: "[project]/app/adminV2/components/aiActivity/AiActivityDetailPanel.tsx",
                                lineNumber: 55,
                                columnNumber: 21
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("dd", {
                                className: "mt-0.5",
                                children: [
                                    selected.target_kind,
                                    " · ",
                                    selected.entity_type,
                                    " · ",
                                    selected.surface
                                ]
                            }, void 0, true, {
                                fileName: "[project]/app/adminV2/components/aiActivity/AiActivityDetailPanel.tsx",
                                lineNumber: 58,
                                columnNumber: 21
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/app/adminV2/components/aiActivity/AiActivityDetailPanel.tsx",
                        lineNumber: 54,
                        columnNumber: 17
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("dt", {
                                className: "font-semibold tracking-wide",
                                style: {
                                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].inspectorSectionMuted
                                },
                                children: "User / org"
                            }, void 0, false, {
                                fileName: "[project]/app/adminV2/components/aiActivity/AiActivityDetailPanel.tsx",
                                lineNumber: 63,
                                columnNumber: 21
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("dd", {
                                className: "mt-0.5 font-mono text-[11px]",
                                children: [
                                    "User ",
                                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminV2$2f$aiActivity$2f$activityTypes$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["shortActivityId"])(selected.user_id),
                                    " · Org ",
                                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminV2$2f$aiActivity$2f$activityTypes$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["shortActivityId"])(selected.org_id)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/app/adminV2/components/aiActivity/AiActivityDetailPanel.tsx",
                                lineNumber: 66,
                                columnNumber: 21
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/app/adminV2/components/aiActivity/AiActivityDetailPanel.tsx",
                        lineNumber: 62,
                        columnNumber: 17
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("dt", {
                                className: "font-semibold tracking-wide",
                                style: {
                                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].inspectorSectionMuted
                                },
                                children: "IDs"
                            }, void 0, false, {
                                fileName: "[project]/app/adminV2/components/aiActivity/AiActivityDetailPanel.tsx",
                                lineNumber: 71,
                                columnNumber: 21
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("dd", {
                                className: "mt-0.5 break-all font-mono text-[10px]",
                                style: {
                                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].textSecondary
                                },
                                children: [
                                    "request ",
                                    selected.request_id,
                                    " · correlation ",
                                    selected.correlation_id
                                ]
                            }, void 0, true, {
                                fileName: "[project]/app/adminV2/components/aiActivity/AiActivityDetailPanel.tsx",
                                lineNumber: 74,
                                columnNumber: 21
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/app/adminV2/components/aiActivity/AiActivityDetailPanel.tsx",
                        lineNumber: 70,
                        columnNumber: 17
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/app/adminV2/components/aiActivity/AiActivityDetailPanel.tsx",
                lineNumber: 43,
                columnNumber: 13
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "mt-4 border-t pt-3",
                style: {
                    borderColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].border
                },
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        type: "button",
                        onClick: onToggleTech,
                        className: "flex w-full items-center justify-between text-left text-[11px] font-semibold",
                        style: {
                            color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].inspectorSectionMuted
                        },
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                children: "Technical details (JSON)"
                            }, void 0, false, {
                                fileName: "[project]/app/adminV2/components/aiActivity/AiActivityDetailPanel.tsx",
                                lineNumber: 87,
                                columnNumber: 21
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                children: techOpen ? "−" : "+"
                            }, void 0, false, {
                                fileName: "[project]/app/adminV2/components/aiActivity/AiActivityDetailPanel.tsx",
                                lineNumber: 88,
                                columnNumber: 21
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/app/adminV2/components/aiActivity/AiActivityDetailPanel.tsx",
                        lineNumber: 81,
                        columnNumber: 17
                    }, this),
                    techOpen ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("pre", {
                        className: "mt-2 max-h-64 overflow-auto rounded border p-2 font-mono text-[10px] leading-relaxed",
                        style: {
                            borderColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].border,
                            backgroundColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].background,
                            color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].textSecondary
                        },
                        children: JSON.stringify(selected.intent_json, null, 2)
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/aiActivity/AiActivityDetailPanel.tsx",
                        lineNumber: 91,
                        columnNumber: 21
                    }, this) : null
                ]
            }, void 0, true, {
                fileName: "[project]/app/adminV2/components/aiActivity/AiActivityDetailPanel.tsx",
                lineNumber: 80,
                columnNumber: 13
            }, this),
            footer ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "mt-4",
                children: footer
            }, void 0, false, {
                fileName: "[project]/app/adminV2/components/aiActivity/AiActivityDetailPanel.tsx",
                lineNumber: 104,
                columnNumber: 23
            }, this) : null
        ]
    }, void 0, true, {
        fileName: "[project]/app/adminV2/components/aiActivity/AiActivityDetailPanel.tsx",
        lineNumber: 23,
        columnNumber: 9
    }, this);
}
}),
"[project]/app/adminV2/components/aiActivity/AiActivityDetailModal.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>AiActivityDetailModal
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/styles/tokens/colors.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$aiActivity$2f$AiActivityDetailPanel$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/adminV2/components/aiActivity/AiActivityDetailPanel.tsx [app-ssr] (ecmascript)");
"use client";
;
;
;
;
function AiActivityDetailModal(props) {
    const { item, open, onClose } = props;
    const [techOpen, setTechOpen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (!open) setTechOpen(false);
    }, [
        open,
        item?.id
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (!open) return;
        const onKey = (e)=>{
            if (e.key === "Escape") {
                e.preventDefault();
                onClose();
            }
        };
        document.addEventListener("keydown", onKey);
        return ()=>document.removeEventListener("keydown", onKey);
    }, [
        open,
        onClose
    ]);
    const handleBackdrop = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((e)=>{
        if (e.target === e.currentTarget) onClose();
    }, [
        onClose
    ]);
    if (!open || !item) return null;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-4",
        style: {
            backgroundColor: "rgba(39, 63, 82, 0.45)"
        },
        onMouseDown: handleBackdrop,
        role: "presentation",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "flex max-h-[min(520px,85vh)] w-full max-w-lg flex-col rounded-t-2xl border shadow-xl sm:rounded-2xl",
            style: {
                backgroundColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].surface,
                borderColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].border,
                boxShadow: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].cardShadow
            },
            onMouseDown: (e)=>e.stopPropagation(),
            role: "dialog",
            "aria-modal": "true",
            "aria-labelledby": "ai-activity-detail-title",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "flex shrink-0 items-center justify-between border-b px-3 py-2",
                    style: {
                        borderColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].border
                    },
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            id: "ai-activity-detail-title",
                            className: "text-sm font-semibold",
                            style: {
                                color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].textPrimary
                            },
                            children: "Activity detail"
                        }, void 0, false, {
                            fileName: "[project]/app/adminV2/components/aiActivity/AiActivityDetailModal.tsx",
                            lineNumber: 63,
                            columnNumber: 21
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                            type: "button",
                            onClick: onClose,
                            className: "rounded-md px-2 py-1 text-xs font-medium",
                            style: {
                                color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].textSecondary
                            },
                            children: "Close"
                        }, void 0, false, {
                            fileName: "[project]/app/adminV2/components/aiActivity/AiActivityDetailModal.tsx",
                            lineNumber: 66,
                            columnNumber: 21
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/app/adminV2/components/aiActivity/AiActivityDetailModal.tsx",
                    lineNumber: 62,
                    columnNumber: 17
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$aiActivity$2f$AiActivityDetailPanel$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                    selected: item,
                    techOpen: techOpen,
                    onToggleTech: ()=>setTechOpen((o)=>!o)
                }, void 0, false, {
                    fileName: "[project]/app/adminV2/components/aiActivity/AiActivityDetailModal.tsx",
                    lineNumber: 75,
                    columnNumber: 17
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/app/adminV2/components/aiActivity/AiActivityDetailModal.tsx",
            lineNumber: 50,
            columnNumber: 13
        }, this)
    }, void 0, false, {
        fileName: "[project]/app/adminV2/components/aiActivity/AiActivityDetailModal.tsx",
        lineNumber: 44,
        columnNumber: 9
    }, this);
}
}),
"[project]/app/adminV2/components/aiActivity/RecentAiActionsStrip.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>RecentAiActionsStrip,
    "dispatchAiActivityRefresh",
    ()=>dispatchAiActivityRefresh
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/client/app-dir/link.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/styles/tokens/colors.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminV2$2f$aiActivity$2f$activityTypes$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/adminV2/aiActivity/activityTypes.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$aiActivity$2f$AiActivityDetailModal$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/adminV2/components/aiActivity/AiActivityDetailModal.tsx [app-ssr] (ecmascript)");
"use client";
;
;
;
;
;
;
const REFRESH_EVENT = "adminv2-ai-activity-refresh";
function dispatchAiActivityRefresh() {
    if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
    ;
}
const STRIP_MAX = 3;
function RecentAiActionsStrip() {
    const [items, setItems] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])([]);
    const [loading, setLoading] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(true);
    const [hidden, setHidden] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [detail, setDetail] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const load = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(async ()=>{
        setLoading(true);
        try {
            const res = await fetch(`/api/admin/agent/v1/activity?limit=${STRIP_MAX}`, {
                credentials: "include"
            });
            const data = await res.json();
            if (!res.ok) {
                setHidden(true);
                setItems([]);
                return;
            }
            setHidden(false);
            setItems(Array.isArray(data.items) ? data.items.slice(0, STRIP_MAX) : []);
        } catch  {
            setHidden(true);
            setItems([]);
        } finally{
            setLoading(false);
        }
    }, []);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        void load();
    }, [
        load
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        const onRefresh = ()=>void load();
        window.addEventListener(REFRESH_EVENT, onRefresh);
        return ()=>window.removeEventListener(REFRESH_EVENT, onRefresh);
    }, [
        load
    ]);
    if (hidden) {
        return null;
    }
    if (loading) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "mb-1 px-1 py-1 text-[10px]",
            style: {
                color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].textSecondary
            },
            children: "Recent AI actions…"
        }, void 0, false, {
            fileName: "[project]/app/adminV2/components/aiActivity/RecentAiActionsStrip.tsx",
            lineNumber: 61,
            columnNumber: 13
        }, this);
    }
    if (items.length === 0) {
        return null;
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "mb-1 rounded-t-lg border border-b-0 px-2 py-1.5",
                style: {
                    borderColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].border,
                    backgroundColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].inspectorCommandRailWash
                },
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "mb-1 flex items-center justify-between gap-2",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "text-[10px] font-bold tracking-wider",
                                style: {
                                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].inspectorSectionMuted
                                },
                                children: "Recent AI actions"
                            }, void 0, false, {
                                fileName: "[project]/app/adminV2/components/aiActivity/RecentAiActionsStrip.tsx",
                                lineNumber: 81,
                                columnNumber: 21
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                                href: "/adminV2/ai-activity",
                                className: "text-[10px] font-medium underline-offset-2 hover:underline",
                                style: {
                                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].textSecondary
                                },
                                children: "Full log"
                            }, void 0, false, {
                                fileName: "[project]/app/adminV2/components/aiActivity/RecentAiActionsStrip.tsx",
                                lineNumber: 84,
                                columnNumber: 21
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/app/adminV2/components/aiActivity/RecentAiActionsStrip.tsx",
                        lineNumber: 80,
                        columnNumber: 17
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                        className: "space-y-0.5",
                        children: items.map((it)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    onClick: ()=>setDetail(it),
                                    className: "w-full rounded px-1.5 py-0.5 text-left text-[11px] leading-snug transition-colors hover:bg-white/80",
                                    style: {
                                        color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].textPrimary
                                    },
                                    title: (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminV2$2f$aiActivity$2f$activityTypes$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["activitySummaryLine"])(it),
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "line-clamp-1",
                                        children: (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminV2$2f$aiActivity$2f$activityTypes$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["activitySummaryLine"])(it)
                                    }, void 0, false, {
                                        fileName: "[project]/app/adminV2/components/aiActivity/RecentAiActionsStrip.tsx",
                                        lineNumber: 102,
                                        columnNumber: 33
                                    }, this)
                                }, void 0, false, {
                                    fileName: "[project]/app/adminV2/components/aiActivity/RecentAiActionsStrip.tsx",
                                    lineNumber: 95,
                                    columnNumber: 29
                                }, this)
                            }, it.id, false, {
                                fileName: "[project]/app/adminV2/components/aiActivity/RecentAiActionsStrip.tsx",
                                lineNumber: 94,
                                columnNumber: 25
                            }, this))
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/aiActivity/RecentAiActionsStrip.tsx",
                        lineNumber: 92,
                        columnNumber: 17
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/app/adminV2/components/aiActivity/RecentAiActionsStrip.tsx",
                lineNumber: 73,
                columnNumber: 13
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$aiActivity$2f$AiActivityDetailModal$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                item: detail,
                open: detail != null,
                onClose: ()=>setDetail(null)
            }, void 0, false, {
                fileName: "[project]/app/adminV2/components/aiActivity/RecentAiActionsStrip.tsx",
                lineNumber: 108,
                columnNumber: 13
            }, this)
        ]
    }, void 0, true);
}
}),
"[project]/app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>AICommandSurfaceShell
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/navigation.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/styles/tokens/colors.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$agentLab$2f$overviewLayoutSemanticAssistant$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/agentLab/overviewLayoutSemanticAssistant.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$agentLab$2f$semanticOverviewNoopSummary$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/agentLab/semanticOverviewNoopSummary.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminV2$2f$aiCommandSurface$2f$aiCommandSurfaceModel$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/adminV2/aiCommandSurface/aiCommandSurfaceModel.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$aiActivity$2f$RecentAiActionsStrip$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/adminV2/components/aiActivity/RecentAiActionsStrip.tsx [app-ssr] (ecmascript)");
"use client";
;
;
;
;
;
;
;
;
const CMD = {
    textBody: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].textPrimary,
    textSupporting: "rgba(39, 63, 82, 0.78)",
    textLabel: "rgba(39, 63, 82, 0.52)"
};
const BAR_MAX_WIDTH = 840;
const COLLAPSED_MIN_H = 36;
const EXPANDED_MAX_H = 320;
/** Delay before auto-collapsing the panel after a successful Apply. */ const POST_APPLY_COLLAPSE_MS = 1800;
/** How long to show the compact “saved” strip after auto-collapse. */ const SUCCESS_STRIP_MS = 5200;
function safeJson(x) {
    return JSON.stringify(x, null, 2);
}
function clampExpandedHeightPx(viewportH) {
    return Math.max(220, Math.min(EXPANDED_MAX_H, Math.round(viewportH * 0.42)));
}
function newIds() {
    return {
        request_id: crypto.randomUUID(),
        correlation_id: crypto.randomUUID()
    };
}
/** Pine wash = positive path; Ember wash = gaps / unsupported / error. */ function outcomeWash(confidence) {
    const pine = __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].adminV2AiBarPineWash;
    const ember = `color-mix(in srgb, ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["semantic"].warning} 10%, ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].surface})`;
    switch(confidence){
        case "ready":
        case "applied":
        case "up_to_date":
        case "in_progress":
            return {
                bg: pine,
                isEmber: false
            };
        case "partial":
        case "gaps_only":
        case "error":
            return {
                bg: ember,
                isEmber: true
            };
        default:
            return {
                bg: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].background,
                isEmber: false
            };
    }
}
function outcomeBadgeStyles(confidence, isEmberWash) {
    if (isEmberWash) {
        return {
            bg: "rgba(188, 67, 0, 0.12)",
            color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["semantic"].warning
        };
    }
    return {
        bg: "rgba(0, 162, 131, 0.14)",
        color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["semantic"].success
    };
}
/** Max 3 bullets for Details toggle — no paragraphs. */ function buildDetailsBullets(params) {
    const { kind, planner, commandText, errorSubline } = params;
    const out = [];
    const q = commandText.trim();
    if (q) {
        out.push(q.length > 88 ? `${q.slice(0, 85)}…` : q);
    }
    if (kind === "applied_success") {
        out.push("Layout saved to the job overview.");
        return out.slice(0, 3);
    }
    if (kind === "error" && errorSubline) {
        out.push(errorSubline);
        return out.slice(0, 3);
    }
    if (!planner) {
        return out.slice(0, 3);
    }
    if (!q) {
        const intents = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminV2$2f$aiCommandSurface$2f$aiCommandSurfaceModel$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["formatIntentSummary"])(planner.parsed_intent);
        if (intents[0]) out.push(intents[0]);
    }
    if (planner.effective_layout_change) {
        const diffLines = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminV2$2f$aiCommandSurface$2f$aiCommandSurfaceModel$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["formatDiffSummaryHuman"])(planner.diff_summary);
        if (diffLines[0]) out.push(diffLines[0]);
        const u = planner.resolution.unresolved_targets?.[0];
        if (u && out.length < 3) {
            out.push(`Not placed: ${u.concept_id} — ${u.reason}`);
        }
    } else {
        const un = planner.resolution.unresolved_targets ?? [];
        if (un.length) {
            out.push("No layout diff — unsupported asks.");
            if (un[0] && out.length < 3) out.push(`${un[0].concept_id}: ${un[0].reason}`);
        } else {
            out.push("No layout diff — already matches.");
        }
    }
    return out.filter(Boolean).slice(0, 3);
}
async function loadCurrentJobOverviewConfig() {
    const res = await fetch("/api/admin/record-overview-layouts?entity_type=job&surface=overview", {
        credentials: "include"
    });
    const data = await res.json();
    if (!res.ok) {
        throw new Error(data.error ?? data.message ?? `HTTP ${res.status}`);
    }
    return data.layout?.config ?? {};
}
function SurfaceCard(props) {
    const { children, expanded } = props;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("footer", {
        "data-adminv2-ai-command-surface": true,
        role: "contentinfo",
        "aria-label": "AI command surface",
        className: "w-full flex justify-center px-4",
        style: {
            paddingTop: expanded ? 8 : 10,
            paddingBottom: 8,
            background: `linear-gradient(180deg, ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].adminV2AiBarPineWash} 0%, ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].surface} 38%, ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].surface} 100%)`,
            borderTop: `2px solid ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].adminV2AiBarPineBorder}`,
            boxShadow: `0 -2px 10px rgba(0, 162, 131, 0.05)`
        },
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "w-full",
            style: {
                maxWidth: BAR_MAX_WIDTH
            },
            children: children
        }, void 0, false, {
            fileName: "[project]/app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx",
            lineNumber: 173,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx",
        lineNumber: 160,
        columnNumber: 5
    }, this);
}
function OutcomeZone(props) {
    const { headline, subline, confidence, submittedCommand } = props;
    const { bg, isEmber } = outcomeWash(confidence);
    const badge = outcomeBadgeStyles(confidence, isEmber);
    const oneLine = subline?.split("\n")[0]?.trim();
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "px-3 py-3",
        style: {
            backgroundColor: bg
        },
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-start justify-between gap-2",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "min-w-0 flex-1",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "text-base font-semibold leading-tight tracking-tight",
                                style: {
                                    color: CMD.textBody
                                },
                                children: headline
                            }, void 0, false, {
                                fileName: "[project]/app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx",
                                lineNumber: 190,
                                columnNumber: 11
                            }, this),
                            oneLine ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "mt-1 text-[12px] leading-snug line-clamp-2",
                                style: {
                                    color: CMD.textSupporting
                                },
                                children: oneLine
                            }, void 0, false, {
                                fileName: "[project]/app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx",
                                lineNumber: 194,
                                columnNumber: 13
                            }, this) : null
                        ]
                    }, void 0, true, {
                        fileName: "[project]/app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx",
                        lineNumber: 189,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold",
                        style: {
                            backgroundColor: badge.bg,
                            color: badge.color,
                            border: `1px solid ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].border}`
                        },
                        "aria-label": `Status: ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminV2$2f$aiCommandSurface$2f$aiCommandSurfaceModel$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["badgeLabel"])(confidence)}`,
                        children: (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminV2$2f$aiCommandSurface$2f$aiCommandSurfaceModel$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["badgeLabel"])(confidence)
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx",
                        lineNumber: 199,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx",
                lineNumber: 188,
                columnNumber: 7
            }, this),
            submittedCommand ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "mt-2 border-t pt-2 text-[12px] leading-snug",
                style: {
                    borderColor: isEmber ? "rgba(188, 67, 0, 0.15)" : "rgba(0, 162, 131, 0.15)"
                },
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "font-semibold tracking-wide text-[10px]",
                        style: {
                            color: CMD.textLabel
                        },
                        children: "Your request"
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx",
                        lineNumber: 216,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "mt-0.5 line-clamp-3",
                        style: {
                            color: CMD.textBody
                        },
                        title: submittedCommand,
                        children: submittedCommand
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx",
                        lineNumber: 219,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx",
                lineNumber: 212,
                columnNumber: 9
            }, this) : null
        ]
    }, void 0, true, {
        fileName: "[project]/app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx",
        lineNumber: 187,
        columnNumber: 5
    }, this);
}
function AIActionsRow(props) {
    const { kind, canApply, applying, applyBlockedByNoop, applyAnyway, onToggleApplyAnyway, onApply, onDismiss, onRefine } = props;
    const showApplyAnyway = kind === "no_op" || kind === "unresolved_only";
    const showApply = kind !== "loading" && kind !== "applied_success" && kind !== "error";
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "flex flex-wrap items-center gap-x-2 gap-y-1.5",
        children: [
            showApply ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                type: "button",
                disabled: !canApply || applying,
                onClick: onApply,
                className: "rounded-md px-3.5 py-2 text-[12px] font-bold tracking-wide disabled:opacity-45 disabled:cursor-not-allowed",
                style: {
                    backgroundColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["brand"].secondary,
                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].surface,
                    letterSpacing: "0.05em"
                },
                children: applying ? "Applying…" : "Apply"
            }, void 0, false, {
                fileName: "[project]/app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx",
                lineNumber: 256,
                columnNumber: 9
            }, this) : null,
            kind !== "loading" ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                type: "button",
                onClick: onRefine,
                className: "rounded-md border px-3 py-2 text-[12px] font-semibold",
                style: {
                    borderColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].border,
                    backgroundColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].surface,
                    color: CMD.textBody
                },
                children: "Refine"
            }, void 0, false, {
                fileName: "[project]/app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx",
                lineNumber: 272,
                columnNumber: 9
            }, this) : null,
            showApplyAnyway ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                className: "inline-flex cursor-pointer items-center gap-1 text-[10px]",
                style: {
                    color: CMD.textSupporting
                },
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                        type: "checkbox",
                        className: "h-3 w-3 shrink-0 rounded border",
                        style: {
                            borderColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].border
                        },
                        checked: applyAnyway,
                        onChange: (e)=>onToggleApplyAnyway(e.target.checked),
                        "aria-label": "Apply without layout diff"
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx",
                        lineNumber: 284,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        children: [
                            "Apply anyway",
                            applyBlockedByNoop && !applyAnyway ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "opacity-80",
                                children: " · unlocks Apply"
                            }, void 0, false, {
                                fileName: "[project]/app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx",
                                lineNumber: 294,
                                columnNumber: 51
                            }, this) : null
                        ]
                    }, void 0, true, {
                        fileName: "[project]/app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx",
                        lineNumber: 292,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx",
                lineNumber: 283,
                columnNumber: 9
            }, this) : null,
            kind !== "loading" ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                type: "button",
                onClick: onDismiss,
                className: "text-[11px] font-medium underline-offset-2 hover:underline ml-auto sm:ml-0",
                style: {
                    color: CMD.textSupporting
                },
                title: "Collapse panel (Esc)",
                children: "Collapse"
            }, void 0, false, {
                fileName: "[project]/app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx",
                lineNumber: 300,
                columnNumber: 9
            }, this) : null,
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                href: "/adminV2/ai-activity",
                className: "text-[10px] underline-offset-2 hover:underline opacity-70",
                style: {
                    color: CMD.textSupporting
                },
                title: "Full audit log (recent actions are above the command bar)",
                children: "Full log"
            }, void 0, false, {
                fileName: "[project]/app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx",
                lineNumber: 311,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx",
        lineNumber: 254,
        columnNumber: 5
    }, this);
}
function DetailsToggle(props) {
    const { open, onToggle, bullets } = props;
    if (bullets.length === 0) return null;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "mt-2 border-t pt-2",
        style: {
            borderColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].border
        },
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                type: "button",
                onClick: onToggle,
                className: "flex w-full items-center justify-between text-left text-[11px] font-semibold",
                style: {
                    color: CMD.textLabel
                },
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        children: "Details"
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx",
                        lineNumber: 339,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        "aria-hidden": true,
                        className: "text-[10px]",
                        children: open ? "−" : "+"
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx",
                        lineNumber: 340,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx",
                lineNumber: 333,
                columnNumber: 7
            }, this),
            open ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                className: "mt-1.5 list-disc space-y-0.5 pl-4 text-[12px] leading-snug",
                style: {
                    color: CMD.textBody
                },
                children: bullets.map((b, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                        children: b
                    }, i, false, {
                        fileName: "[project]/app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx",
                        lineNumber: 347,
                        columnNumber: 13
                    }, this))
            }, void 0, false, {
                fileName: "[project]/app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx",
                lineNumber: 345,
                columnNumber: 9
            }, this) : null
        ]
    }, void 0, true, {
        fileName: "[project]/app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx",
        lineNumber: 332,
        columnNumber: 5
    }, this);
}
function AdvancedDrawer(props) {
    const { open, onToggle, planner, structuredOverrideJson, applyResultJson, errorDetailJson } = props;
    const hasJson = planner || structuredOverrideJson || applyResultJson || errorDetailJson;
    if (!hasJson) return null;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "mt-2 border-t pt-2",
        style: {
            borderColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].border
        },
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                type: "button",
                onClick: onToggle,
                className: "flex w-full items-center justify-between rounded-md border border-dashed px-2 py-1.5 text-[10px] font-medium",
                style: {
                    borderColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].border,
                    backgroundColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].surface,
                    color: CMD.textSupporting
                },
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        children: "Advanced (JSON)"
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx",
                        lineNumber: 380,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        "aria-hidden": true,
                        children: open ? "Hide" : "Show"
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx",
                        lineNumber: 381,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx",
                lineNumber: 370,
                columnNumber: 7
            }, this),
            open ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "mt-2 grid max-h-[min(200px,35vh)] gap-2 overflow-y-auto pr-1",
                children: [
                    planner ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("pre", {
                        className: "rounded border p-2 font-mono text-[10px] leading-relaxed",
                        style: {
                            borderColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].border,
                            backgroundColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].background,
                            color: CMD.textSupporting
                        },
                        children: safeJson(planner.parsed_intent)
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx",
                        lineNumber: 388,
                        columnNumber: 13
                    }, this) : null,
                    planner ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("pre", {
                        className: "rounded border p-2 font-mono text-[10px] leading-relaxed",
                        style: {
                            borderColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].border,
                            backgroundColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].background,
                            color: CMD.textSupporting
                        },
                        children: safeJson(planner.diff_summary)
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx",
                        lineNumber: 393,
                        columnNumber: 13
                    }, this) : null,
                    structuredOverrideJson ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("pre", {
                        className: "rounded border p-2 font-mono text-[10px] leading-relaxed",
                        style: {
                            borderColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].border,
                            backgroundColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].background,
                            color: CMD.textSupporting
                        },
                        children: structuredOverrideJson
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx",
                        lineNumber: 398,
                        columnNumber: 13
                    }, this) : null,
                    applyResultJson ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("pre", {
                        className: "rounded border p-2 font-mono text-[10px] leading-relaxed",
                        style: {
                            borderColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].border,
                            backgroundColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].background,
                            color: CMD.textSupporting
                        },
                        children: applyResultJson
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx",
                        lineNumber: 403,
                        columnNumber: 13
                    }, this) : null,
                    errorDetailJson ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("pre", {
                        className: "rounded border p-2 font-mono text-[10px] leading-relaxed",
                        style: {
                            borderColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].border,
                            backgroundColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].background,
                            color: CMD.textSupporting
                        },
                        children: errorDetailJson
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx",
                        lineNumber: 408,
                        columnNumber: 13
                    }, this) : null
                ]
            }, void 0, true, {
                fileName: "[project]/app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx",
                lineNumber: 386,
                columnNumber: 9
            }, this) : null
        ]
    }, void 0, true, {
        fileName: "[project]/app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx",
        lineNumber: 369,
        columnNumber: 5
    }, this);
}
function AICommandSurfaceShell() {
    const pathname = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["usePathname"])();
    const routePathRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(pathname);
    const postApplyCollapseRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const successStripRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const inputRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const [commandText, setCommandText] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("");
    const [expanded, setExpanded] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [showSuccessStrip, setShowSuccessStrip] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [busy, setBusy] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [advancedOpen, setAdvancedOpen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [detailsOpen, setDetailsOpen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [applyAnyway, setApplyAnyway] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [viewportH, setViewportH] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(("TURBOPACK compile-time falsy", 0) ? "TURBOPACK unreachable" : 900);
    const [response, setResponse] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [structuredOverrideJson, setStructuredOverrideJson] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("");
    const clearPostApplyTimer = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(()=>{
        if (postApplyCollapseRef.current) {
            clearTimeout(postApplyCollapseRef.current);
            postApplyCollapseRef.current = null;
        }
    }, []);
    const clearSuccessStripTimer = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(()=>{
        if (successStripRef.current) {
            clearTimeout(successStripRef.current);
            successStripRef.current = null;
        }
    }, []);
    const collapsePanel = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(()=>{
        clearPostApplyTimer();
        setExpanded(false);
        setAdvancedOpen(false);
        setDetailsOpen(false);
    }, [
        clearPostApplyTimer
    ]);
    const activePlanner = response?.plannerOk ?? null;
    const applyBlockedByNoop = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$agentLab$2f$semanticOverviewNoopSummary$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["shouldBlockSemanticNoopApply"])({
        previewRoute: "v1",
        semanticPlanner: activePlanner,
        applySemanticNoopAnyway: applyAnyway
    });
    const canApply = Boolean(structuredOverrideJson) && !applyBlockedByNoop && (response?.kind === "action_preview" || response?.kind === "no_op" || response?.kind === "unresolved_only");
    const panelMaxHeight = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>clampExpandedHeightPx(viewportH), [
        viewportH
    ]);
    const detailsBullets = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        if (!response) return [];
        return buildDetailsBullets({
            kind: response.kind,
            planner: response.plannerOk ?? null,
            commandText: response.submittedCommand ?? "",
            errorSubline: response.kind === "error" ? response.subline : undefined
        });
    }, [
        response
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        const onResize = ()=>setViewportH(window.innerHeight);
        window.addEventListener("resize", onResize);
        return ()=>window.removeEventListener("resize", onResize);
    }, []);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        return ()=>{
            clearPostApplyTimer();
            clearSuccessStripTimer();
        };
    }, [
        clearPostApplyTimer,
        clearSuccessStripTimer
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (routePathRef.current !== pathname) {
            routePathRef.current = pathname;
            setShowSuccessStrip(false);
            clearSuccessStripTimer();
            collapsePanel();
        }
    }, [
        pathname,
        collapsePanel,
        clearSuccessStripTimer
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        const panelOpen = expanded && response != null;
        if (!panelOpen || busy) return;
        const onKey = (e)=>{
            if (e.key === "Escape") {
                e.preventDefault();
                collapsePanel();
            }
        };
        document.addEventListener("keydown", onKey);
        return ()=>document.removeEventListener("keydown", onKey);
    }, [
        expanded,
        response,
        busy,
        collapsePanel
    ]);
    const runPreview = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(async ()=>{
        const submitted = commandText.trim();
        if (!submitted) return;
        setCommandText("");
        queueMicrotask(()=>{
            inputRef.current?.focus();
        });
        setShowSuccessStrip(false);
        clearSuccessStripTimer();
        clearPostApplyTimer();
        setExpanded(true);
        setBusy(true);
        setAdvancedOpen(false);
        setDetailsOpen(false);
        setApplyAnyway(false);
        setStructuredOverrideJson("");
        setResponse({
            kind: "loading",
            headline: "Working on your request…",
            confidence: "in_progress",
            subline: "Building preview…",
            submittedCommand: submitted
        });
        try {
            const cfg = await loadCurrentJobOverviewConfig();
            const prev = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$agentLab$2f$overviewLayoutSemanticAssistant$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["runOverviewLayoutSemanticPreview"])(submitted, cfg);
            if (!prev.ok) {
                setResponse({
                    kind: "error",
                    headline: "Couldn’t build a preview",
                    subline: prev.error,
                    confidence: "error",
                    submittedCommand: submitted,
                    plannerErr: prev.planner,
                    errorDetailJson: safeJson(prev.planner)
                });
                return;
            }
            const planner = prev.planner;
            const { headline, subline, kind } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminV2$2f$aiCommandSurface$2f$aiCommandSurfaceModel$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["headlineForPreview"])(planner);
            const structuredJson = safeJson(prev.structured_override);
            setStructuredOverrideJson(structuredJson);
            setResponse({
                kind,
                headline,
                subline,
                confidence: (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminV2$2f$aiCommandSurface$2f$aiCommandSurfaceModel$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["statusFromPlanner"])(planner),
                submittedCommand: submitted,
                plannerOk: planner,
                structuredOverrideJson: structuredJson
            });
        } catch (e) {
            setResponse({
                kind: "error",
                headline: "Preview failed",
                subline: e instanceof Error ? e.message : "Request failed",
                confidence: "error",
                submittedCommand: submitted,
                errorDetailJson: safeJson({
                    message: e instanceof Error ? e.message : String(e)
                })
            });
        } finally{
            setBusy(false);
            queueMicrotask(()=>{
                inputRef.current?.focus();
            });
        }
    }, [
        commandText,
        clearPostApplyTimer,
        clearSuccessStripTimer
    ]);
    const apply = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(async ()=>{
        if (!structuredOverrideJson) return;
        if (applyBlockedByNoop) return;
        const auditMessage = response?.submittedCommand?.trim() || "AdminV2 AI command surface";
        clearPostApplyTimer();
        setBusy(true);
        setAdvancedOpen(false);
        setDetailsOpen(false);
        setResponse((r)=>r ? {
                ...r,
                kind: "loading",
                headline: "Working on your request…",
                subline: "Applying…",
                confidence: "in_progress"
            } : {
                kind: "loading",
                headline: "Working on your request…",
                subline: "Applying…",
                confidence: "in_progress"
            });
        try {
            const ids = newIds();
            const structured_override = JSON.parse(structuredOverrideJson);
            const res = await fetch("/api/admin/agent/v1/record-overview-layout", {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    request_id: ids.request_id,
                    correlation_id: ids.correlation_id,
                    message: auditMessage,
                    structured_override
                })
            });
            const data = await res.json();
            if (!res.ok) {
                clearPostApplyTimer();
                setResponse((r)=>r ? {
                        ...r,
                        kind: "error",
                        headline: "Apply failed",
                        subline: `HTTP ${res.status}`,
                        confidence: "error",
                        plannerOk: activePlanner,
                        structuredOverrideJson,
                        errorDetailJson: safeJson(data)
                    } : r);
                return;
            }
            setResponse((r)=>r ? {
                    ...r,
                    kind: "applied_success",
                    headline: "Changes applied",
                    subline: "Saved.",
                    confidence: "applied",
                    applyResultJson: safeJson(data),
                    plannerOk: activePlanner,
                    structuredOverrideJson
                } : r);
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$aiActivity$2f$RecentAiActionsStrip$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["dispatchAiActivityRefresh"])();
            clearPostApplyTimer();
            postApplyCollapseRef.current = setTimeout(()=>{
                postApplyCollapseRef.current = null;
                setExpanded(false);
                setAdvancedOpen(false);
                setDetailsOpen(false);
                setShowSuccessStrip(true);
                clearSuccessStripTimer();
                successStripRef.current = setTimeout(()=>{
                    successStripRef.current = null;
                    setShowSuccessStrip(false);
                }, SUCCESS_STRIP_MS);
            }, POST_APPLY_COLLAPSE_MS);
        } catch (e) {
            clearPostApplyTimer();
            setResponse((r)=>r ? {
                    ...r,
                    kind: "error",
                    headline: "Apply failed",
                    subline: e instanceof Error ? e.message : "Request failed",
                    confidence: "error",
                    plannerOk: activePlanner,
                    structuredOverrideJson,
                    errorDetailJson: safeJson({
                        message: e instanceof Error ? e.message : String(e)
                    })
                } : r);
        } finally{
            setBusy(false);
            queueMicrotask(()=>{
                inputRef.current?.focus();
            });
        }
    }, [
        structuredOverrideJson,
        applyBlockedByNoop,
        activePlanner,
        response?.submittedCommand,
        clearPostApplyTimer,
        clearSuccessStripTimer
    ]);
    const refine = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(()=>{
        setExpanded(true);
        inputRef.current?.focus();
        const len = commandText.length;
        queueMicrotask(()=>{
            inputRef.current?.setSelectionRange(len, len);
        });
    }, [
        commandText
    ]);
    const showPanel = expanded && response != null;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(SurfaceCard, {
        expanded: showPanel || showSuccessStrip,
        children: [
            showSuccessStrip && !expanded && response?.kind === "applied_success" ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "mb-0 flex items-center justify-between gap-2 rounded-t-lg px-3 py-1.5",
                style: {
                    backgroundColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].kpiBandBusinessWash,
                    borderBottom: `1px solid ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].border}`
                },
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "min-w-0 text-[11px] leading-snug",
                        style: {
                            color: CMD.textBody
                        },
                        children: "Job overview layout saved."
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx",
                        lineNumber: 719,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        type: "button",
                        className: "shrink-0 text-[11px] font-semibold",
                        style: {
                            color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["brand"].secondary
                        },
                        onClick: ()=>setExpanded(true),
                        children: "Show"
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx",
                        lineNumber: 722,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx",
                lineNumber: 712,
                columnNumber: 9
            }, this) : null,
            showPanel && response ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "rounded-t-xl overflow-hidden border-b",
                style: {
                    maxHeight: panelMaxHeight,
                    borderTop: `2px solid ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].adminV2AiBarPineBorder}`,
                    borderColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].border,
                    backgroundColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].surface
                },
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(OutcomeZone, {
                        headline: response.headline,
                        subline: response.subline,
                        confidence: response.confidence,
                        submittedCommand: response.submittedCommand
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx",
                        lineNumber: 743,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "space-y-0 px-3 py-2",
                        style: {
                            backgroundColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].background
                        },
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(AIActionsRow, {
                                kind: response.kind,
                                canApply: canApply,
                                applying: busy && response.kind === "loading" && Boolean(structuredOverrideJson),
                                applyBlockedByNoop: applyBlockedByNoop,
                                applyAnyway: applyAnyway,
                                onToggleApplyAnyway: setApplyAnyway,
                                onApply: ()=>void apply(),
                                onDismiss: collapsePanel,
                                onRefine: refine
                            }, void 0, false, {
                                fileName: "[project]/app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx",
                                lineNumber: 751,
                                columnNumber: 13
                            }, this),
                            response.kind !== "loading" ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(DetailsToggle, {
                                open: detailsOpen,
                                onToggle: ()=>setDetailsOpen((o)=>!o),
                                bullets: detailsBullets
                            }, void 0, false, {
                                fileName: "[project]/app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx",
                                lineNumber: 764,
                                columnNumber: 15
                            }, this) : null,
                            response.kind !== "loading" && (response.plannerOk || structuredOverrideJson || response.errorDetailJson || response.applyResultJson) ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(AdvancedDrawer, {
                                open: advancedOpen,
                                onToggle: ()=>setAdvancedOpen((o)=>!o),
                                planner: response.plannerOk ?? null,
                                structuredOverrideJson: structuredOverrideJson,
                                applyResultJson: response.kind === "applied_success" ? response.applyResultJson : undefined,
                                errorDetailJson: response.kind === "error" ? response.errorDetailJson : undefined
                            }, void 0, false, {
                                fileName: "[project]/app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx",
                                lineNumber: 769,
                                columnNumber: 15
                            }, this) : null
                        ]
                    }, void 0, true, {
                        fileName: "[project]/app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx",
                        lineNumber: 750,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx",
                lineNumber: 734,
                columnNumber: 9
            }, this) : null,
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: `flex items-end gap-2 ${showPanel || showSuccessStrip ? "mt-0" : "mt-2"}`,
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: `flex-1 min-w-0 border-2 bg-white px-3 py-2 ${showPanel || showSuccessStrip ? "rounded-b-xl rounded-t-none border-t border-t-[rgba(0,0,0,0.06)]" : "rounded-2xl px-3.5 py-2.5"}`,
                        style: {
                            borderColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].adminV2AiInputPineRing,
                            boxShadow: showPanel || showSuccessStrip ? `inset 0 1px 0 rgba(255,255,255,0.95)` : `0 1px 0 rgba(0, 162, 131, 0.06), inset 0 1px 0 rgba(255,255,255,0.9)`
                        },
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("textarea", {
                                ref: inputRef,
                                value: commandText,
                                onChange: (e)=>{
                                    const v = e.target.value;
                                    setCommandText(v);
                                    if (response && v.trim().length > 0) {
                                        setExpanded(true);
                                    }
                                },
                                onFocus: ()=>{
                                    if (commandText.trim().length > 0) {
                                        setExpanded(true);
                                    }
                                },
                                placeholder: "Command: configure job overview… (e.g. “make the overview more customer-focused”)",
                                className: "w-full resize-none bg-transparent outline-none text-sm leading-snug",
                                rows: 1,
                                style: {
                                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].textPrimary
                                },
                                "aria-label": "AI command input",
                                onKeyDown: (e)=>{
                                    if (e.key === "Enter" && !e.shiftKey) {
                                        e.preventDefault();
                                        if (!busy) void runPreview();
                                    }
                                }
                            }, void 0, false, {
                                fileName: "[project]/app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx",
                                lineNumber: 797,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "mt-0.5 text-[10px] leading-tight",
                                style: {
                                    color: CMD.textSupporting
                                },
                                children: "Job overview only · Enter to preview"
                            }, void 0, false, {
                                fileName: "[project]/app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx",
                                lineNumber: 824,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx",
                        lineNumber: 783,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        type: "button",
                        disabled: busy || !commandText.trim(),
                        onClick: ()=>void runPreview(),
                        className: "shrink-0 rounded-xl px-3.5 py-2.5 text-xs font-bold tracking-widest disabled:opacity-50 disabled:cursor-not-allowed",
                        style: {
                            backgroundColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["brand"].secondary,
                            color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].surface,
                            letterSpacing: "0.14em",
                            boxShadow: `0 2px 8px rgba(0, 162, 131, 0.35)`
                        },
                        children: busy ? "Working…" : "Preview"
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx",
                        lineNumber: 828,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx",
                lineNumber: 782,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx",
        lineNumber: 710,
        columnNumber: 5
    }, this);
}
}),
"[project]/app/adminV2/components/navigation/BreadcrumbBar.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>BreadcrumbBar
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/styles/tokens/colors.ts [app-ssr] (ecmascript)");
"use client";
;
;
function BreadcrumbBar({ zoomLevel, departmentName, onGoToCompany }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("nav", {
        "aria-label": "Breadcrumb",
        style: {
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 16px",
            fontSize: 13,
            borderBottom: `1px solid ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].border}`,
            backgroundColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].surface
        },
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                type: "button",
                onClick: onGoToCompany,
                style: {
                    background: "none",
                    border: "none",
                    padding: 0,
                    font: "inherit",
                    color: zoomLevel === "company" ? __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["brand"].primary : __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].textSecondary,
                    fontWeight: zoomLevel === "company" ? 600 : 500,
                    cursor: "pointer"
                },
                children: "Company"
            }, void 0, false, {
                fileName: "[project]/app/adminV2/components/navigation/BreadcrumbBar.tsx",
                lineNumber: 25,
                columnNumber: 7
            }, this),
            zoomLevel === "department" && departmentName && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        style: {
                            color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].textSecondary
                        },
                        "aria-hidden": true,
                        children: "/"
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/navigation/BreadcrumbBar.tsx",
                        lineNumber: 42,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        style: {
                            color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].textPrimary,
                            fontWeight: 500
                        },
                        children: departmentName
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/navigation/BreadcrumbBar.tsx",
                        lineNumber: 43,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true)
        ]
    }, void 0, true, {
        fileName: "[project]/app/adminV2/components/navigation/BreadcrumbBar.tsx",
        lineNumber: 13,
        columnNumber: 5
    }, this);
}
}),
"[project]/app/adminV2/components/dashboard/KPIStatCard.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>KPIStatCard
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/styles/tokens/colors.ts [app-ssr] (ecmascript)");
"use client";
;
;
;
const CARD_MIN_HEIGHT = 62;
const accentColor = {
    ai: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["brand"].primary,
    business: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["brand"].secondary
};
function KPIStatCard({ label, value, delta, trend = "neutral", variant = "ai" }) {
    const [hover, setHover] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const trendColor = trend === "up" ? __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["semantic"].success : trend === "down" ? __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["semantic"].warning : __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].textSecondary;
    const topAccent = accentColor[variant];
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        onMouseEnter: ()=>setHover(true),
        onMouseLeave: ()=>setHover(false),
        style: {
            padding: "12px 12px 10px",
            borderRadius: 8,
            backgroundColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].surface,
            border: `1px solid ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].border}`,
            borderTop: `3px solid ${topAccent}`,
            minWidth: 0,
            width: "100%",
            flex: 1,
            minHeight: CARD_MIN_HEIGHT,
            boxSizing: "border-box",
            transition: "border-color 160ms ease, box-shadow 160ms ease",
            boxShadow: hover ? __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].cardShadow : undefined
        },
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                style: {
                    fontSize: 10,
                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].textSecondary,
                    marginBottom: 8,
                    fontWeight: 600,
                    textTransform: "none",
                    letterSpacing: "0.06em"
                },
                children: label
            }, void 0, false, {
                fileName: "[project]/app/adminV2/components/dashboard/KPIStatCard.tsx",
                lineNumber: 50,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                style: {
                    fontSize: 18,
                    fontWeight: 600,
                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].textPrimary,
                    letterSpacing: "-0.02em",
                    lineHeight: 1.15
                },
                children: value
            }, void 0, false, {
                fileName: "[project]/app/adminV2/components/dashboard/KPIStatCard.tsx",
                lineNumber: 62,
                columnNumber: 7
            }, this),
            delta != null && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                style: {
                    fontSize: 11,
                    color: trendColor,
                    marginTop: 6
                },
                children: delta
            }, void 0, false, {
                fileName: "[project]/app/adminV2/components/dashboard/KPIStatCard.tsx",
                lineNumber: 74,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/app/adminV2/components/dashboard/KPIStatCard.tsx",
        lineNumber: 32,
        columnNumber: 5
    }, this);
}
}),
"[project]/app/adminV2/components/dashboard/mockKpiData.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "getAIKpiItems",
    ()=>getAIKpiItems,
    "getAIKpis",
    ()=>getAIKpis,
    "getBusinessKpiItems",
    ()=>getBusinessKpiItems,
    "getBusinessKpis",
    ()=>getBusinessKpis
]);
const COMPANY_AI = {
    transactionsProcessed: "1,240",
    automationRate: "87%",
    accuracy: "99.2%",
    avgProcessingTime: "2.3s"
};
const COMPANY_BUSINESS = {
    revenue: "$48,200",
    jobsCompleted: "122",
    conversionRate: "24%",
    utilization: "78%",
    exceptions: "3"
};
const OPERATIONS_AI = {
    transactionsProcessed: "312",
    automationRate: "91%",
    accuracy: "98.8%",
    avgProcessingTime: "1.8s"
};
const OPERATIONS_BUSINESS = {
    jobsActive: "42",
    utilization: "78%",
    completionRate: "94%",
    exceptions: "3",
    delays: "3"
};
const FINANCE_AI = {
    transactionsProcessed: "428",
    automationRate: "99.5%",
    accuracy: "99.5%",
    avgProcessingTime: "2.1s",
    exceptionDetection: "12"
};
const FINANCE_BUSINESS = {
    invoicesOpen: "8",
    collected: "94%",
    exceptions: "2",
    margin: "31%"
};
const SALES_AI = {
    transactionsProcessed: "84",
    automationRate: "76%",
    accuracy: "97%",
    avgProcessingTime: "3.1s"
};
const SALES_BUSINESS = {
    revenue: "$12,400",
    jobsCompleted: "28",
    conversionRate: "24%",
    utilization: "72%"
};
const CUSTOMER_SUCCESS_AI = {
    transactionsProcessed: "56",
    automationRate: "82%",
    accuracy: "98%",
    avgProcessingTime: "2.0s"
};
const CUSTOMER_SUCCESS_BUSINESS = {
    activeCases: "5",
    slaMet: "98%",
    utilization: "85%"
};
const AI_SYSTEMS_AI = {
    transactionsProcessed: "1,240",
    automationRate: "99.2%",
    accuracy: "99.2%",
    avgProcessingTime: "0.8s"
};
const AI_SYSTEMS_BUSINESS = {
    runsToday: "1,240",
    successRate: "99.2%",
    exceptions: "1"
};
const DEPT_AI = {
    operations: {
        ...OPERATIONS_AI,
        transactionsProcessed: "312"
    },
    sales: SALES_AI,
    finance: {
        ...FINANCE_AI,
        transactionsProcessed: "428"
    },
    customerSuccess: CUSTOMER_SUCCESS_AI,
    aiSystems: AI_SYSTEMS_AI
};
const DEPT_BUSINESS = {
    operations: OPERATIONS_BUSINESS,
    sales: SALES_BUSINESS,
    finance: FINANCE_BUSINESS,
    customerSuccess: CUSTOMER_SUCCESS_BUSINESS,
    aiSystems: AI_SYSTEMS_BUSINESS
};
function getAIKpis(scope) {
    if (scope.level === "company") return COMPANY_AI;
    return DEPT_AI[scope.key];
}
function getBusinessKpis(scope) {
    if (scope.level === "company") return COMPANY_BUSINESS;
    return DEPT_BUSINESS[scope.key];
}
const COMPANY_AI_ITEMS = [
    {
        label: "Transactions Processed",
        value: COMPANY_AI.transactionsProcessed
    },
    {
        label: "Automation Rate",
        value: COMPANY_AI.automationRate
    },
    {
        label: "Accuracy",
        value: COMPANY_AI.accuracy
    },
    {
        label: "Avg Processing Time",
        value: COMPANY_AI.avgProcessingTime
    }
];
const COMPANY_BUSINESS_ITEMS = [
    {
        label: "Revenue",
        value: COMPANY_BUSINESS.revenue ?? "—"
    },
    {
        label: "Jobs Completed",
        value: COMPANY_BUSINESS.jobsCompleted ?? "—"
    },
    {
        label: "Conversion Rate",
        value: COMPANY_BUSINESS.conversionRate ?? "—"
    },
    {
        label: "Utilization",
        value: COMPANY_BUSINESS.utilization ?? "—"
    },
    {
        label: "Exceptions",
        value: COMPANY_BUSINESS.exceptions ?? "—"
    }
];
function deptAIItems(key) {
    const a = DEPT_AI[key];
    const labels = key === "operations" ? [
        "Automated Assignments",
        "Optimization Rate",
        "Accuracy",
        "Avg Scheduling Time"
    ] : key === "finance" ? [
        "Auto-Reconciled",
        "Accuracy",
        "Exception Detection",
        "Avg Processing Time"
    ] : [
        "Transactions Processed",
        "Automation Rate",
        "Accuracy",
        "Avg Processing Time"
    ];
    return [
        {
            label: labels[0],
            value: a.transactionsProcessed
        },
        {
            label: labels[1],
            value: a.automationRate
        },
        {
            label: labels[2],
            value: a.accuracy
        },
        {
            label: labels[3],
            value: a.avgProcessingTime
        }
    ];
}
function deptBusinessItems(key) {
    const b = DEPT_BUSINESS[key];
    if (key === "operations") return [
        {
            label: "Jobs Active",
            value: b.jobsActive ?? "—"
        },
        {
            label: "Utilization",
            value: b.utilization ?? "—"
        },
        {
            label: "Completion Rate",
            value: b.completionRate ?? "—"
        },
        {
            label: "Delays",
            value: b.delays ?? "—"
        }
    ];
    if (key === "finance") return [
        {
            label: "Invoices Open",
            value: b.invoicesOpen ?? "—"
        },
        {
            label: "Collected",
            value: b.collected ?? "—"
        },
        {
            label: "Exceptions",
            value: b.exceptions ?? "—"
        },
        {
            label: "Margin",
            value: b.margin ?? "—"
        }
    ];
    if (key === "customerSuccess") return [
        {
            label: "Active Cases",
            value: b.activeCases ?? "—"
        },
        {
            label: "SLA Met",
            value: b.slaMet ?? "—"
        },
        {
            label: "Utilization",
            value: b.utilization ?? "—"
        }
    ];
    if (key === "aiSystems") return [
        {
            label: "Runs Today",
            value: b.runsToday ?? "—"
        },
        {
            label: "Success Rate",
            value: b.successRate ?? "—"
        },
        {
            label: "Exceptions",
            value: b.exceptions ?? "—"
        }
    ];
    return [
        {
            label: "Revenue",
            value: b.revenue ?? "—"
        },
        {
            label: "Jobs Completed",
            value: b.jobsCompleted ?? "—"
        },
        {
            label: "Conversion Rate",
            value: b.conversionRate ?? "—"
        },
        {
            label: "Utilization",
            value: b.utilization ?? "—"
        },
        {
            label: "Exceptions",
            value: b.exceptions ?? "—"
        }
    ].slice(0, 5);
}
function getAIKpiItems(scope) {
    if (scope.level === "company") return COMPANY_AI_ITEMS;
    return deptAIItems(scope.key);
}
function getBusinessKpiItems(scope) {
    if (scope.level === "company") return COMPANY_BUSINESS_ITEMS;
    return deptBusinessItems(scope.key);
}
}),
"[project]/app/adminV2/components/dashboard/KPIBand.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>KPIBand
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/styles/tokens/colors.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$dashboard$2f$KPIStatCard$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/adminV2/components/dashboard/KPIStatCard.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$dashboard$2f$mockKpiData$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/adminV2/components/dashboard/mockKpiData.ts [app-ssr] (ecmascript)");
"use client";
;
;
;
;
function KPIBand({ scope }) {
    const aiItems = (0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$dashboard$2f$mockKpiData$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getAIKpiItems"])(scope);
    const businessItems = (0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$dashboard$2f$mockKpiData$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getBusinessKpiItems"])(scope);
    const bCols = Math.max(businessItems.length, 1);
    const aCols = Math.max(aiItems.length, 1);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        style: {
            display: "flex",
            flexDirection: "row",
            alignItems: "stretch",
            minHeight: 102,
            borderBottom: `1px solid ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].border}`,
            backgroundColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].surface,
            backgroundImage: `linear-gradient(180deg, ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].surface} 0%, ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].kpiRailWash} 100%)`,
            boxShadow: `${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].kpiBandShadow}, inset 0 0 0 1px ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].adminV2BoundaryAmber}`,
            zIndex: 3
        },
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                style: {
                    flex: 1,
                    minWidth: 0,
                    padding: "16px 20px 18px",
                    background: `linear-gradient(142deg, ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].kpiBandBusinessLight} 0%, transparent 52%)`,
                    borderRight: `1px solid ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].border}`,
                    display: "flex",
                    flexDirection: "column"
                },
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        style: {
                            fontSize: 10,
                            fontWeight: 700,
                            color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["brand"].secondary,
                            textTransform: "none",
                            letterSpacing: "0.11em",
                            marginBottom: 12,
                            flexShrink: 0
                        },
                        children: "Business metrics"
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/dashboard/KPIBand.tsx",
                        lineNumber: 40,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        style: {
                            display: "grid",
                            gridTemplateColumns: `repeat(${bCols}, minmax(0, 1fr))`,
                            gap: 10,
                            alignItems: "stretch",
                            flex: 1,
                            minHeight: 0
                        },
                        children: businessItems.map((item)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                style: {
                                    minWidth: 0,
                                    display: "flex"
                                },
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$dashboard$2f$KPIStatCard$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                                    label: item.label,
                                    value: item.value,
                                    variant: "business"
                                }, void 0, false, {
                                    fileName: "[project]/app/adminV2/components/dashboard/KPIBand.tsx",
                                    lineNumber: 65,
                                    columnNumber: 15
                                }, this)
                            }, item.label, false, {
                                fileName: "[project]/app/adminV2/components/dashboard/KPIBand.tsx",
                                lineNumber: 64,
                                columnNumber: 13
                            }, this))
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/dashboard/KPIBand.tsx",
                        lineNumber: 53,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/app/adminV2/components/dashboard/KPIBand.tsx",
                lineNumber: 29,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                style: {
                    flex: 1,
                    minWidth: 0,
                    padding: "16px 20px 18px",
                    background: `linear-gradient(218deg, ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].kpiBandAiLight} 0%, transparent 50%)`,
                    display: "flex",
                    flexDirection: "column"
                },
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        style: {
                            fontSize: 10,
                            fontWeight: 700,
                            color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["brand"].primary,
                            textTransform: "none",
                            letterSpacing: "0.11em",
                            marginBottom: 12,
                            flexShrink: 0
                        },
                        children: "AI metrics"
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/dashboard/KPIBand.tsx",
                        lineNumber: 84,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        style: {
                            display: "grid",
                            gridTemplateColumns: `repeat(${aCols}, minmax(0, 1fr))`,
                            gap: 10,
                            alignItems: "stretch",
                            flex: 1,
                            minHeight: 0
                        },
                        children: aiItems.map((item)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                style: {
                                    minWidth: 0,
                                    display: "flex"
                                },
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$dashboard$2f$KPIStatCard$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                                    label: item.label,
                                    value: item.value,
                                    variant: "ai"
                                }, void 0, false, {
                                    fileName: "[project]/app/adminV2/components/dashboard/KPIBand.tsx",
                                    lineNumber: 109,
                                    columnNumber: 15
                                }, this)
                            }, item.label, false, {
                                fileName: "[project]/app/adminV2/components/dashboard/KPIBand.tsx",
                                lineNumber: 108,
                                columnNumber: 13
                            }, this))
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/dashboard/KPIBand.tsx",
                        lineNumber: 97,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/app/adminV2/components/dashboard/KPIBand.tsx",
                lineNumber: 74,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/app/adminV2/components/dashboard/KPIBand.tsx",
        lineNumber: 16,
        columnNumber: 5
    }, this);
}
}),
"[project]/lib/departmentColors.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Department → brand color mapping for top-level department nodes.
 * Uses confirmed palette only.
 */ __turbopack_context__.s([
    "getDepartmentColor",
    ()=>getDepartmentColor,
    "getDepartmentColorKey",
    ()=>getDepartmentColorKey
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/styles/tokens/colors.ts [app-ssr] (ecmascript)");
;
const departmentToPaletteKey = {
    operations: "bendPine",
    sales: "alloyBlue",
    finance: "midnightForge",
    customerSuccess: "bendPine",
    aiSystems: "juniperEmber"
};
function getDepartmentColor(key) {
    return __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["palette"][departmentToPaletteKey[key]];
}
function getDepartmentColorKey(key) {
    return departmentToPaletteKey[key];
}
}),
"[project]/app/adminV2/components/canvas/canvasLayout.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Company view: 3-over-2 grid — sized for clean gaps.
 * Responsive: layout scales by viewport width (large desktop, laptop, smaller).
 */ __turbopack_context__.s([
    "BREAKPOINT_LAPTOP",
    ()=>BREAKPOINT_LAPTOP,
    "BREAKPOINT_SMALL",
    ()=>BREAKPOINT_SMALL,
    "COMPANY_DEPT_NODE_HEIGHT",
    ()=>COMPANY_DEPT_NODE_HEIGHT,
    "COMPANY_DEPT_NODE_WIDTH",
    ()=>COMPANY_DEPT_NODE_WIDTH,
    "COMPANY_GAP_X",
    ()=>COMPANY_GAP_X,
    "COMPANY_GAP_Y",
    ()=>COMPANY_GAP_Y,
    "COMPANY_GRID_DEPT_HEIGHT",
    ()=>COMPANY_GRID_DEPT_HEIGHT,
    "COMPANY_GRID_DEPT_WIDTH",
    ()=>COMPANY_GRID_DEPT_WIDTH,
    "COMPANY_OFFSET_X",
    ()=>COMPANY_OFFSET_X,
    "COMPANY_OFFSET_Y",
    ()=>COMPANY_OFFSET_Y,
    "getCompanyAmbientMidY",
    ()=>getCompanyAmbientMidY,
    "getCompanyChamberAmbientRect",
    ()=>getCompanyChamberAmbientRect,
    "getCompanyDepartmentDisplayPosition",
    ()=>getCompanyDepartmentDisplayPosition,
    "getCompanyFieldAmbientB",
    ()=>getCompanyFieldAmbientB,
    "getCompanyFieldAmbientEast",
    ()=>getCompanyFieldAmbientEast,
    "getCompanyFieldAmbientSouth",
    ()=>getCompanyFieldAmbientSouth,
    "getCompanyFieldAmbientTop",
    ()=>getCompanyFieldAmbientTop,
    "getCompanyFieldAmbientWest",
    ()=>getCompanyFieldAmbientWest,
    "getCompanyGridCenter",
    ()=>getCompanyGridCenter,
    "getDepartmentPosition",
    ()=>getDepartmentPosition,
    "getResponsiveLayout",
    ()=>getResponsiveLayout
]);
const BREAKPOINT_LAPTOP = 1680;
const BREAKPOINT_SMALL = 1280;
/** Scale factors for tile/gap sizing (large = 1). Laptop uses 0.96 so company view feels larger without browser zoom. */ const SCALE_LARGE = 1;
const SCALE_LAPTOP = 0.96;
const SCALE_SMALL = 0.82;
const BASE = {
    COMPANY_DEPT_NODE_WIDTH: 632,
    COMPANY_DEPT_NODE_HEIGHT: 380,
    COMPANY_GRID_DEPT_WIDTH: 588,
    COMPANY_GRID_DEPT_HEIGHT: 348,
    COMPANY_GAP_X: 128,
    COMPANY_GAP_Y: 72,
    COMPANY_OFFSET_X: 52,
    COMPANY_OFFSET_Y: 22,
    CARD_PAD: 18,
    fitViewPadding: 0.068,
    actionPanelWidth: 360
};
function getResponsiveLayout(viewportWidth) {
    const scale = viewportWidth >= BREAKPOINT_LAPTOP ? SCALE_LARGE : viewportWidth >= BREAKPOINT_SMALL ? SCALE_LAPTOP : SCALE_SMALL;
    return {
        COMPANY_DEPT_NODE_WIDTH: Math.round(BASE.COMPANY_DEPT_NODE_WIDTH * scale),
        COMPANY_DEPT_NODE_HEIGHT: Math.round(BASE.COMPANY_DEPT_NODE_HEIGHT * scale),
        COMPANY_GRID_DEPT_WIDTH: Math.round(BASE.COMPANY_GRID_DEPT_WIDTH * scale),
        COMPANY_GRID_DEPT_HEIGHT: Math.round(BASE.COMPANY_GRID_DEPT_HEIGHT * scale),
        COMPANY_GAP_X: Math.round(BASE.COMPANY_GAP_X * scale),
        COMPANY_GAP_Y: Math.round(BASE.COMPANY_GAP_Y * scale),
        COMPANY_OFFSET_X: Math.round(BASE.COMPANY_OFFSET_X * scale),
        COMPANY_OFFSET_Y: Math.round(BASE.COMPANY_OFFSET_Y * scale),
        CARD_PAD: Math.round(BASE.CARD_PAD * scale),
        fitViewPadding: scale === SCALE_LARGE ? 0.068 : scale === SCALE_LAPTOP ? 0.055 : 0.07,
        actionPanelWidth: Math.round(BASE.actionPanelWidth * (scale === SCALE_LARGE ? 1 : scale === SCALE_LAPTOP ? 0.96 : 0.88))
    };
}
/** Default layout for initial render / SSR (large desktop). */ const DEFAULT_LAYOUT = getResponsiveLayout(1920);
const COMPANY_DEPT_NODE_WIDTH = BASE.COMPANY_DEPT_NODE_WIDTH;
const COMPANY_DEPT_NODE_HEIGHT = BASE.COMPANY_DEPT_NODE_HEIGHT;
const COMPANY_GRID_DEPT_WIDTH = BASE.COMPANY_GRID_DEPT_WIDTH;
const COMPANY_GRID_DEPT_HEIGHT = BASE.COMPANY_GRID_DEPT_HEIGHT;
const COMPANY_GAP_X = BASE.COMPANY_GAP_X;
const COMPANY_GAP_Y = BASE.COMPANY_GAP_Y;
const COMPANY_OFFSET_X = BASE.COMPANY_OFFSET_X;
const COMPANY_OFFSET_Y = BASE.COMPANY_OFFSET_Y;
function row1CenterX(layout) {
    const W = layout.COMPANY_DEPT_NODE_WIDTH;
    const GX = layout.COMPANY_GAP_X;
    const row1Width = 3 * W + 2 * GX;
    return layout.COMPANY_OFFSET_X + row1Width / 2;
}
function row2StartX(layout) {
    const W = layout.COMPANY_DEPT_NODE_WIDTH;
    const GX = layout.COMPANY_GAP_X;
    const row2Width = 2 * W + GX;
    return row1CenterX(layout) - row2Width / 2;
}
function getDepartmentPosition(index, layout = DEFAULT_LAYOUT) {
    const W = layout.COMPANY_DEPT_NODE_WIDTH;
    const H = layout.COMPANY_DEPT_NODE_HEIGHT;
    const GX = layout.COMPANY_GAP_X;
    const GY = layout.COMPANY_GAP_Y;
    const y1 = layout.COMPANY_OFFSET_Y;
    const y2 = layout.COMPANY_OFFSET_Y + H + GY;
    switch(index){
        case 0:
            return {
                x: layout.COMPANY_OFFSET_X,
                y: y1
            };
        case 1:
            return {
                x: layout.COMPANY_OFFSET_X + W + GX,
                y: y1
            };
        case 2:
            return {
                x: layout.COMPANY_OFFSET_X + 2 * (W + GX),
                y: y1
            };
        case 3:
            return {
                x: row2StartX(layout),
                y: y2
            };
        case 4:
            return {
                x: row2StartX(layout) + W + GX,
                y: y2
            };
        default:
            return {
                x: layout.COMPANY_OFFSET_X,
                y: y1
            };
    }
}
function getCompanyDepartmentDisplayPosition(index, layout = DEFAULT_LAYOUT) {
    const p = getDepartmentPosition(index, layout);
    const dx = (layout.COMPANY_DEPT_NODE_WIDTH - layout.COMPANY_GRID_DEPT_WIDTH) / 2;
    const dy = (layout.COMPANY_DEPT_NODE_HEIGHT - layout.COMPANY_GRID_DEPT_HEIGHT) / 2;
    return {
        x: p.x + dx,
        y: p.y + dy
    };
}
function getCompanyGridCenter(layout = DEFAULT_LAYOUT) {
    const W = layout.COMPANY_DEPT_NODE_WIDTH;
    const H = layout.COMPANY_DEPT_NODE_HEIGHT;
    let sx = 0;
    let sy = 0;
    for(let i = 0; i < 5; i++){
        const p = getDepartmentPosition(i, layout);
        sx += p.x + W / 2;
        sy += p.y + H / 2;
    }
    return {
        x: sx / 5,
        y: sy / 5
    };
}
const CHAMBER_AMBIENT_PAD = 3000;
function getCompanyChamberAmbientRect(layout = DEFAULT_LAYOUT) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const Gw = layout.COMPANY_GRID_DEPT_WIDTH;
    const Gh = layout.COMPANY_GRID_DEPT_HEIGHT;
    for(let i = 0; i < 5; i++){
        const p = getCompanyDepartmentDisplayPosition(i, layout);
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x + Gw);
        maxY = Math.max(maxY, p.y + Gh);
    }
    const P = CHAMBER_AMBIENT_PAD;
    return {
        x: minX - P,
        y: minY - P,
        width: maxX - minX + 2 * P,
        height: maxY - minY + 2 * P
    };
}
function getCompanyFieldAmbientB(layout = DEFAULT_LAYOUT) {
    const W = layout.COMPANY_DEPT_NODE_WIDTH;
    const H = layout.COMPANY_DEPT_NODE_HEIGHT;
    const p3 = getDepartmentPosition(3, layout);
    const p4 = getDepartmentPosition(4, layout);
    return {
        x: (p3.x + W / 2 + p4.x + W / 2) / 2,
        y: p3.y + H * 0.58
    };
}
function getCompanyAmbientMidY(layout = DEFAULT_LAYOUT) {
    const H = layout.COMPANY_DEPT_NODE_HEIGHT;
    const GY = layout.COMPANY_GAP_Y;
    const y1 = layout.COMPANY_OFFSET_Y + H / 2;
    const y2 = layout.COMPANY_OFFSET_Y + H + GY + H / 2;
    return (y1 + y2) / 2;
}
function getCompanyFieldAmbientWest(layout = DEFAULT_LAYOUT) {
    const scale = layout.COMPANY_GRID_DEPT_WIDTH / BASE.COMPANY_GRID_DEPT_WIDTH;
    return {
        x: layout.COMPANY_OFFSET_X - 340 * scale,
        y: getCompanyAmbientMidY(layout)
    };
}
function getCompanyFieldAmbientEast(layout = DEFAULT_LAYOUT) {
    const W = layout.COMPANY_DEPT_NODE_WIDTH;
    const GX = layout.COMPANY_GAP_X;
    const scale = layout.COMPANY_GRID_DEPT_WIDTH / BASE.COMPANY_GRID_DEPT_WIDTH;
    return {
        x: layout.COMPANY_OFFSET_X + 3 * W + 2 * GX + 340 * scale,
        y: getCompanyAmbientMidY(layout)
    };
}
function getCompanyFieldAmbientTop(layout = DEFAULT_LAYOUT) {
    const W = layout.COMPANY_DEPT_NODE_WIDTH;
    const GX = layout.COMPANY_GAP_X;
    const h = layout.COMPANY_DEPT_NODE_HEIGHT;
    return {
        x: layout.COMPANY_OFFSET_X + (3 * W + 2 * GX) / 2,
        y: layout.COMPANY_OFFSET_Y + h * 0.1
    };
}
function getCompanyFieldAmbientSouth(layout = DEFAULT_LAYOUT) {
    const W = layout.COMPANY_DEPT_NODE_WIDTH;
    const H = layout.COMPANY_DEPT_NODE_HEIGHT;
    const GY = layout.COMPANY_GAP_Y;
    const p3 = getDepartmentPosition(3, layout);
    const p4 = getDepartmentPosition(4, layout);
    return {
        x: (p3.x + W / 2 + p4.x + W / 2) / 2,
        y: p3.y + H + GY + 100
    };
}
}),
"[project]/app/adminV2/components/canvas/DepartmentNode.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>__TURBOPACK__default__export__
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$reactflow$2f$core$2f$dist$2f$esm$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@reactflow/core/dist/esm/index.mjs [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/styles/tokens/colors.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$departmentColors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/departmentColors.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$canvas$2f$canvasLayout$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/adminV2/components/canvas/canvasLayout.ts [app-ssr] (ecmascript)");
"use client";
;
;
;
;
;
;
const HEALTH_LABELS = {
    good: "Good",
    attention: "Attention",
    critical: "At risk"
};
const HEALTH_COLOR = {
    good: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["semantic"].success,
    attention: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["semantic"].warning,
    critical: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["semantic"].warning
};
const DEFAULT_W = __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$canvas$2f$canvasLayout$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["COMPANY_GRID_DEPT_WIDTH"];
const DEFAULT_H = __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$canvas$2f$canvasLayout$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["COMPANY_GRID_DEPT_HEIGHT"];
const DEFAULT_CARD_PAD = 18;
const ICON_SIZE = 14;
const ICON_GAP = 6;
function QuickActionIconSvg({ icon, size = ICON_SIZE }) {
    const s = size;
    const common = {
        width: s,
        height: s,
        fill: "currentColor",
        stroke: "currentColor"
    };
    switch(icon){
        case "gear":
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
                viewBox: "0 0 24 24",
                ...common,
                "aria-hidden": true,
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                        d: "M12 15.5A3.5 3.5 0 0 1 8.5 12 3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5 3.5 3.5 0 0 1-3.5 3.5z",
                        fill: "none",
                        strokeWidth: "1.8",
                        strokeLinecap: "round",
                        strokeLinejoin: "round"
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/canvas/DepartmentNode.tsx",
                        lineNumber: 80,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                        d: "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z",
                        fill: "none",
                        strokeWidth: "1.8",
                        strokeLinecap: "round",
                        strokeLinejoin: "round"
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/canvas/DepartmentNode.tsx",
                        lineNumber: 81,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/app/adminV2/components/canvas/DepartmentNode.tsx",
                lineNumber: 79,
                columnNumber: 9
            }, this);
        case "list":
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
                viewBox: "0 0 24 24",
                ...common,
                "aria-hidden": true,
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                    d: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
                    fill: "none",
                    strokeWidth: "2",
                    strokeLinecap: "round",
                    strokeLinejoin: "round"
                }, void 0, false, {
                    fileName: "[project]/app/adminV2/components/canvas/DepartmentNode.tsx",
                    lineNumber: 87,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/app/adminV2/components/canvas/DepartmentNode.tsx",
                lineNumber: 86,
                columnNumber: 9
            }, this);
        case "mail":
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
                viewBox: "0 0 24 24",
                ...common,
                "aria-hidden": true,
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                        d: "M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z",
                        fill: "none",
                        strokeWidth: "2",
                        strokeLinecap: "round",
                        strokeLinejoin: "round"
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/canvas/DepartmentNode.tsx",
                        lineNumber: 93,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                        d: "M22 6l-10 7L2 6",
                        strokeWidth: "2",
                        strokeLinecap: "round",
                        strokeLinejoin: "round"
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/canvas/DepartmentNode.tsx",
                        lineNumber: 94,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/app/adminV2/components/canvas/DepartmentNode.tsx",
                lineNumber: 92,
                columnNumber: 9
            }, this);
        case "warning":
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
                viewBox: "0 0 24 24",
                ...common,
                "aria-hidden": true,
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                        d: "M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z",
                        fill: "none",
                        strokeWidth: "2",
                        strokeLinecap: "round",
                        strokeLinejoin: "round"
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/canvas/DepartmentNode.tsx",
                        lineNumber: 100,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                        d: "M12 9v4M12 17h.01",
                        strokeWidth: "2",
                        strokeLinecap: "round",
                        strokeLinejoin: "round"
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/canvas/DepartmentNode.tsx",
                        lineNumber: 101,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/app/adminV2/components/canvas/DepartmentNode.tsx",
                lineNumber: 99,
                columnNumber: 9
            }, this);
        case "eye":
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
                viewBox: "0 0 24 24",
                ...common,
                "aria-hidden": true,
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                        d: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z",
                        fill: "none",
                        strokeWidth: "2",
                        strokeLinecap: "round",
                        strokeLinejoin: "round"
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/canvas/DepartmentNode.tsx",
                        lineNumber: 107,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("circle", {
                        cx: "12",
                        cy: "12",
                        r: "3",
                        fill: "none",
                        strokeWidth: "2",
                        strokeLinecap: "round",
                        strokeLinejoin: "round"
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/canvas/DepartmentNode.tsx",
                        lineNumber: 108,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/app/adminV2/components/canvas/DepartmentNode.tsx",
                lineNumber: 106,
                columnNumber: 9
            }, this);
        case "check":
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
                viewBox: "0 0 24 24",
                ...common,
                "aria-hidden": true,
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                    d: "M20 6L9 17l-5-5",
                    fill: "none",
                    strokeWidth: "2",
                    strokeLinecap: "round",
                    strokeLinejoin: "round"
                }, void 0, false, {
                    fileName: "[project]/app/adminV2/components/canvas/DepartmentNode.tsx",
                    lineNumber: 114,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/app/adminV2/components/canvas/DepartmentNode.tsx",
                lineNumber: 113,
                columnNumber: 9
            }, this);
        default:
            return null;
    }
}
function SystemTileContent({ data, quickActions, id, onQuickActionClick, fill }) {
    const topKpi = data.primarySignal ?? data.primaryValue ?? "—";
    const agentRollup = data.agentRollup ?? "";
    const agentStates = data.agentStates ?? [];
    const topPerformer = data.topPerformer ?? "";
    const primaryAction = quickActions[0];
    const secondaryAction = quickActions[1];
    const hasRollup = agentRollup || agentStates.length > 0 || topPerformer;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        style: {
            display: "flex",
            flexDirection: "column",
            height: "100%",
            minHeight: 0
        },
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                style: {
                    flexShrink: 0,
                    marginBottom: 6
                },
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        style: {
                            height: 3,
                            borderRadius: 2,
                            marginBottom: 5,
                            background: `linear-gradient(90deg, ${fill} 0%, ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["brand"].secondary} 100%)`
                        }
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/canvas/DepartmentNode.tsx",
                        lineNumber: 160,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        style: {
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 8
                        },
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            style: {
                                fontSize: 10,
                                fontWeight: 700,
                                textTransform: "none",
                                letterSpacing: "0.06em",
                                color: HEALTH_COLOR[data.health]
                            },
                            children: HEALTH_LABELS[data.health]
                        }, void 0, false, {
                            fileName: "[project]/app/adminV2/components/canvas/DepartmentNode.tsx",
                            lineNumber: 176,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/canvas/DepartmentNode.tsx",
                        lineNumber: 168,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        style: {
                            fontSize: 18,
                            fontWeight: 700,
                            color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].textPrimary,
                            letterSpacing: "-0.02em",
                            lineHeight: 1.2,
                            display: "block"
                        },
                        children: data.name
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/canvas/DepartmentNode.tsx",
                        lineNumber: 188,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/app/adminV2/components/canvas/DepartmentNode.tsx",
                lineNumber: 154,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                style: {
                    flexShrink: 0,
                    marginBottom: 6,
                    paddingBottom: 6,
                    borderBottom: `1px solid ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].border}`
                },
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                    style: {
                        fontSize: 22,
                        fontWeight: 600,
                        color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].textPrimary,
                        letterSpacing: "-0.02em",
                        lineHeight: 1.25
                    },
                    children: topKpi
                }, void 0, false, {
                    fileName: "[project]/app/adminV2/components/canvas/DepartmentNode.tsx",
                    lineNumber: 211,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/app/adminV2/components/canvas/DepartmentNode.tsx",
                lineNumber: 203,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                style: {
                    flexShrink: 0,
                    paddingTop: 8
                },
                children: [
                    hasRollup && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
                        children: [
                            agentRollup && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                style: {
                                    fontSize: 13,
                                    fontWeight: 600,
                                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].textSecondary,
                                    marginBottom: 6,
                                    lineHeight: 1.4
                                },
                                children: agentRollup
                            }, void 0, false, {
                                fileName: "[project]/app/adminV2/components/canvas/DepartmentNode.tsx",
                                lineNumber: 235,
                                columnNumber: 15
                            }, this),
                            agentStates.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                style: {
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 4,
                                    marginBottom: 6
                                },
                                children: agentStates.slice(0, 3).map((a, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        style: {
                                            fontSize: 13,
                                            fontWeight: 500,
                                            color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].textPrimary,
                                            lineHeight: 1.4
                                        },
                                        children: [
                                            a.name,
                                            " — ",
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                style: {
                                                    color: a.status === "Healthy" ? __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["semantic"].success : __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["semantic"].warning
                                                },
                                                children: a.status
                                            }, void 0, false, {
                                                fileName: "[project]/app/adminV2/components/canvas/DepartmentNode.tsx",
                                                lineNumber: 267,
                                                columnNumber: 32
                                            }, this)
                                        ]
                                    }, i, true, {
                                        fileName: "[project]/app/adminV2/components/canvas/DepartmentNode.tsx",
                                        lineNumber: 258,
                                        columnNumber: 19
                                    }, this))
                            }, void 0, false, {
                                fileName: "[project]/app/adminV2/components/canvas/DepartmentNode.tsx",
                                lineNumber: 249,
                                columnNumber: 15
                            }, this),
                            topPerformer && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                style: {
                                    fontSize: 13,
                                    fontWeight: 600,
                                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].textSecondary,
                                    marginBottom: 8,
                                    lineHeight: 1.4
                                },
                                children: topPerformer
                            }, void 0, false, {
                                fileName: "[project]/app/adminV2/components/canvas/DepartmentNode.tsx",
                                lineNumber: 274,
                                columnNumber: 15
                            }, this)
                        ]
                    }, void 0, true),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        style: {
                            display: "flex",
                            flexDirection: "row",
                            flexWrap: "wrap",
                            gap: 10,
                            marginBottom: 8
                        },
                        children: [
                            primaryAction && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                type: "button",
                                className: "adminv2-dept-quick-action adminv2-dept-system-primary-action",
                                onClick: (e)=>{
                                    e.stopPropagation();
                                    onQuickActionClick?.(id, primaryAction.id, e);
                                },
                                style: {
                                    minHeight: 34,
                                    padding: "6px 12px",
                                    borderRadius: 8,
                                    border: `1px solid ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].border}`,
                                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].surface,
                                    backgroundColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["brand"].primary,
                                    fontSize: 13,
                                    fontWeight: 600,
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    gap: ICON_GAP
                                },
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(QuickActionIconSvg, {
                                        icon: primaryAction.icon,
                                        size: 13
                                    }, void 0, false, {
                                        fileName: "[project]/app/adminV2/components/canvas/DepartmentNode.tsx",
                                        lineNumber: 321,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        children: primaryAction.label
                                    }, void 0, false, {
                                        fileName: "[project]/app/adminV2/components/canvas/DepartmentNode.tsx",
                                        lineNumber: 322,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/app/adminV2/components/canvas/DepartmentNode.tsx",
                                lineNumber: 299,
                                columnNumber: 13
                            }, this),
                            secondaryAction && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                type: "button",
                                className: "adminv2-dept-quick-action adminv2-dept-system-secondary-action",
                                onClick: (e)=>{
                                    e.stopPropagation();
                                    onQuickActionClick?.(id, secondaryAction.id, e);
                                },
                                style: {
                                    minHeight: 34,
                                    padding: "6px 12px",
                                    borderRadius: 8,
                                    border: `1px solid ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].border}`,
                                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["brand"].primary,
                                    backgroundColor: "transparent",
                                    fontSize: 13,
                                    fontWeight: 600,
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    gap: ICON_GAP
                                },
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(QuickActionIconSvg, {
                                        icon: secondaryAction.icon,
                                        size: 12
                                    }, void 0, false, {
                                        fileName: "[project]/app/adminV2/components/canvas/DepartmentNode.tsx",
                                        lineNumber: 348,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        children: secondaryAction.label
                                    }, void 0, false, {
                                        fileName: "[project]/app/adminV2/components/canvas/DepartmentNode.tsx",
                                        lineNumber: 349,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/app/adminV2/components/canvas/DepartmentNode.tsx",
                                lineNumber: 326,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/app/adminV2/components/canvas/DepartmentNode.tsx",
                        lineNumber: 289,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "adminv2-dept-view-details",
                        style: {
                            fontSize: 13,
                            fontWeight: 500,
                            color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["brand"].primary,
                            cursor: "pointer",
                            display: "inline-block"
                        },
                        onClick: (e)=>e.stopPropagation(),
                        role: "button",
                        tabIndex: 0,
                        onKeyDown: (e)=>e.key === "Enter" && e.stopPropagation(),
                        children: "View details →"
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/canvas/DepartmentNode.tsx",
                        lineNumber: 353,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/app/adminV2/components/canvas/DepartmentNode.tsx",
                lineNumber: 225,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/app/adminV2/components/canvas/DepartmentNode.tsx",
        lineNumber: 145,
        columnNumber: 5
    }, this);
}
function DepartmentNodeComponent({ id, data, selected }) {
    const fill = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$departmentColors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getDepartmentColor"])(data.departmentKey);
    const zoomingOut = data.zoomingOut ?? false;
    const activating = data.activating ?? false;
    const quickActions = data.quickActions ?? [];
    const isPriority = data.isPriority ?? false;
    const onQuickActionClick = data.onQuickActionClick;
    const W = data.tileWidth ?? DEFAULT_W;
    const H = data.tileHeight ?? DEFAULT_H;
    const CARD_PAD = data.cardPad ?? DEFAULT_CARD_PAD;
    /* Clean node primitive: rounded rect, thin border, no edge gimmicks */ const shellRadius = 12;
    const focusRingStyle = {
        width: W,
        height: H,
        boxSizing: "border-box",
        padding: CARD_PAD,
        borderRadius: shellRadius,
        background: `linear-gradient(180deg, ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].surface} 0%, ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].background} 100%)`,
        border: `1px solid ${selected || activating ? __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["semantic"].info : __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].border}`,
        boxShadow: activating || selected ? `0 0 0 2px rgba(0,69,140,0.24), 0 2px 8px rgba(39,63,82,0.05)` : `0 0 0 1px ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].border}`,
        opacity: zoomingOut ? 0.52 : 1,
        transform: zoomingOut ? "scale(0.96)" : "scale(1)",
        transition: "opacity 420ms cubic-bezier(0.42, 0, 0.58, 1), transform 420ms cubic-bezier(0.42, 0, 0.58, 1), box-shadow 200ms ease, border-color 200ms ease",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden"
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: `adminv2-dept-node-fixed adminv2-dept-system-tile ${selected ? "adminv2-dept-selected" : ""} ${isPriority ? "adminv2-dept-priority" : ""}`,
        style: {
            position: "relative",
            width: W,
            height: H,
            flexShrink: 0,
            cursor: "pointer"
        },
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$reactflow$2f$core$2f$dist$2f$esm$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Handle"], {
                type: "target",
                position: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$reactflow$2f$core$2f$dist$2f$esm$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Position"].Top
            }, void 0, false, {
                fileName: "[project]/app/adminV2/components/canvas/DepartmentNode.tsx",
                lineNumber: 417,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: `adminv2-dept-focus-ring ${activating ? "adminv2-dept-activating-soft" : ""}`,
                style: focusRingStyle,
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(SystemTileContent, {
                    data: data,
                    quickActions: quickActions,
                    id: id,
                    onQuickActionClick: onQuickActionClick,
                    fill: fill
                }, void 0, false, {
                    fileName: "[project]/app/adminV2/components/canvas/DepartmentNode.tsx",
                    lineNumber: 422,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/app/adminV2/components/canvas/DepartmentNode.tsx",
                lineNumber: 418,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$reactflow$2f$core$2f$dist$2f$esm$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Handle"], {
                type: "source",
                position: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$reactflow$2f$core$2f$dist$2f$esm$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Position"].Bottom
            }, void 0, false, {
                fileName: "[project]/app/adminV2/components/canvas/DepartmentNode.tsx",
                lineNumber: 430,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/app/adminV2/components/canvas/DepartmentNode.tsx",
        lineNumber: 407,
        columnNumber: 5
    }, this);
}
const __TURBOPACK__default__export__ = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["memo"])(DepartmentNodeComponent);
}),
"[project]/app/adminV2/components/canvas/ActionPanelNode.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>__TURBOPACK__default__export__
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/styles/tokens/colors.ts [app-ssr] (ecmascript)");
"use client";
;
;
;
const PANEL_PADDING = 20;
const BORDER_RADIUS = 14;
const SHADOW = "0 12px 32px rgba(0, 0, 0, 0.12), 0 4px 12px rgba(0, 0, 0, 0.06)";
function ActionPanelNodeComponent({ data }) {
    const { title, description, records, primaryLabel, secondaryLabel, panelWidth, onClose } = data;
    const hasRecords = Array.isArray(records) && records.length > 0;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "adminv2-action-panel",
        role: "dialog",
        "aria-label": title,
        style: {
            width: panelWidth,
            minWidth: 280,
            maxWidth: "min(420px, 92vw)",
            padding: PANEL_PADDING,
            borderRadius: BORDER_RADIUS,
            backgroundColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].surface,
            border: `1px solid ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].border}`,
            boxShadow: SHADOW,
            animation: "adminv2-action-panel-in 180ms ease-out forwards"
        },
        onClick: (e)=>e.stopPropagation(),
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                className: "adminv2-action-panel-title",
                style: {
                    margin: 0,
                    marginBottom: 8,
                    fontSize: 16,
                    fontWeight: 600,
                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].textPrimary,
                    letterSpacing: "-0.01em",
                    lineHeight: 1.3
                },
                children: title
            }, void 0, false, {
                fileName: "[project]/app/adminV2/components/canvas/ActionPanelNode.tsx",
                lineNumber: 43,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "adminv2-action-panel-desc",
                style: {
                    margin: 0,
                    marginBottom: hasRecords ? 12 : 16,
                    fontSize: 14,
                    fontWeight: 400,
                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].textSecondary,
                    lineHeight: 1.45
                },
                children: description
            }, void 0, false, {
                fileName: "[project]/app/adminV2/components/canvas/ActionPanelNode.tsx",
                lineNumber: 57,
                columnNumber: 7
            }, this),
            hasRecords && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "adminv2-action-panel-records",
                style: {
                    marginBottom: 16,
                    paddingTop: 12,
                    paddingBottom: 12,
                    borderTop: `1px solid ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].border}`,
                    borderBottom: `1px solid ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].border}`
                },
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        style: {
                            fontSize: 11,
                            fontWeight: 700,
                            color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].textSecondary,
                            textTransform: "none",
                            letterSpacing: "0.06em",
                            marginBottom: 8
                        },
                        children: "Records / context"
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/canvas/ActionPanelNode.tsx",
                        lineNumber: 81,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                        style: {
                            margin: 0,
                            paddingLeft: 18,
                            fontSize: 13,
                            fontWeight: 500,
                            color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].textPrimary,
                            lineHeight: 1.5
                        },
                        children: records.map((line, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                children: line
                            }, i, false, {
                                fileName: "[project]/app/adminV2/components/canvas/ActionPanelNode.tsx",
                                lineNumber: 104,
                                columnNumber: 15
                            }, this))
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/canvas/ActionPanelNode.tsx",
                        lineNumber: 93,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/app/adminV2/components/canvas/ActionPanelNode.tsx",
                lineNumber: 71,
                columnNumber: 9
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "adminv2-action-panel-view-records",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                    type: "button",
                    onClick: ()=>onClose(),
                    className: "adminv2-action-panel-view-records-link",
                    style: {
                        background: "none",
                        border: "none",
                        padding: 0,
                        marginBottom: 14,
                        fontSize: 13,
                        fontWeight: 500,
                        color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["brand"].primary,
                        cursor: "pointer",
                        textDecoration: "none",
                        letterSpacing: "0.01em"
                    },
                    children: "View related records"
                }, void 0, false, {
                    fileName: "[project]/app/adminV2/components/canvas/ActionPanelNode.tsx",
                    lineNumber: 110,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/app/adminV2/components/canvas/ActionPanelNode.tsx",
                lineNumber: 109,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "adminv2-action-panel-actions",
                style: {
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    flexWrap: "wrap"
                },
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        type: "button",
                        onClick: ()=>onClose(),
                        style: {
                            padding: "10px 16px",
                            fontSize: 14,
                            fontWeight: 600,
                            color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].surface,
                            backgroundColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["brand"].primary,
                            border: "none",
                            borderRadius: 10,
                            cursor: "pointer",
                            letterSpacing: "0.02em"
                        },
                        children: primaryLabel
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/canvas/ActionPanelNode.tsx",
                        lineNumber: 139,
                        columnNumber: 9
                    }, this),
                    secondaryLabel && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        type: "button",
                        onClick: ()=>onClose(),
                        style: {
                            padding: "10px 16px",
                            fontSize: 14,
                            fontWeight: 600,
                            color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["brand"].primary,
                            backgroundColor: "transparent",
                            border: `1px solid ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].border}`,
                            borderRadius: 10,
                            cursor: "pointer",
                            letterSpacing: "0.02em"
                        },
                        children: secondaryLabel
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/canvas/ActionPanelNode.tsx",
                        lineNumber: 157,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/app/adminV2/components/canvas/ActionPanelNode.tsx",
                lineNumber: 130,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/app/adminV2/components/canvas/ActionPanelNode.tsx",
        lineNumber: 26,
        columnNumber: 5
    }, this);
}
const __TURBOPACK__default__export__ = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["memo"])(ActionPanelNodeComponent);
}),
"[project]/app/adminV2/components/canvas/ManagerNode.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "MANAGER_CARD_WIDTH",
    ()=>MANAGER_CARD_WIDTH,
    "default",
    ()=>__TURBOPACK__default__export__
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$reactflow$2f$core$2f$dist$2f$esm$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@reactflow/core/dist/esm/index.mjs [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/styles/tokens/colors.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$departmentColors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/departmentColors.ts [app-ssr] (ecmascript)");
"use client";
;
;
;
;
;
const MANAGER_CARD_WIDTH = 316;
function ManagerNodeComponent({ data, selected }) {
    const accent = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$departmentColors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getDepartmentColor"])(data.departmentKey);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$reactflow$2f$core$2f$dist$2f$esm$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Handle"], {
                type: "target",
                position: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$reactflow$2f$core$2f$dist$2f$esm$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Position"].Top
            }, void 0, false, {
                fileName: "[project]/app/adminV2/components/canvas/ManagerNode.tsx",
                lineNumber: 26,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "adminv2-manager-node-shell-hero adminv2-manager-card-surface",
                style: {
                    width: MANAGER_CARD_WIDTH,
                    minHeight: 248,
                    padding: 28,
                    borderRadius: 16,
                    backgroundColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].surface,
                    border: `2px solid ${selected ? __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["semantic"].info : __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].border}`,
                    boxSizing: "border-box",
                    boxShadow: selected ? __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].nodeOnChamberShadowActive : __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].nodeOnChamberShadow,
                    transition: "border-color 200ms ease, box-shadow 200ms ease",
                    animationDelay: `${data.enterStaggerMs ?? 0}ms`
                },
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        style: {
                            height: 4,
                            borderRadius: 2,
                            marginBottom: 16,
                            backgroundColor: accent
                        }
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/canvas/ManagerNode.tsx",
                        lineNumber: 42,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        style: {
                            fontSize: 20,
                            fontWeight: 700,
                            color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].textPrimary,
                            marginBottom: 18,
                            letterSpacing: "-0.02em",
                            lineHeight: 1.2
                        },
                        children: data.name
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/canvas/ManagerNode.tsx",
                        lineNumber: 50,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        style: {
                            marginBottom: 12
                        },
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                style: {
                                    fontSize: 10,
                                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].textSecondary,
                                    textTransform: "none",
                                    letterSpacing: "0.06em",
                                    marginBottom: 4
                                },
                                children: data.stat1Label
                            }, void 0, false, {
                                fileName: "[project]/app/adminV2/components/canvas/ManagerNode.tsx",
                                lineNumber: 63,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                style: {
                                    fontSize: 26,
                                    fontWeight: 700,
                                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["brand"].secondary,
                                    lineHeight: 1.1
                                },
                                children: data.stat1Value
                            }, void 0, false, {
                                fileName: "[project]/app/adminV2/components/canvas/ManagerNode.tsx",
                                lineNumber: 74,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/app/adminV2/components/canvas/ManagerNode.tsx",
                        lineNumber: 62,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                style: {
                                    fontSize: 10,
                                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].textSecondary,
                                    textTransform: "none",
                                    letterSpacing: "0.06em",
                                    marginBottom: 4
                                },
                                children: data.stat2Label
                            }, void 0, false, {
                                fileName: "[project]/app/adminV2/components/canvas/ManagerNode.tsx",
                                lineNumber: 79,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                style: {
                                    fontSize: 16,
                                    fontWeight: 600,
                                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].textPrimary
                                },
                                children: data.stat2Value
                            }, void 0, false, {
                                fileName: "[project]/app/adminV2/components/canvas/ManagerNode.tsx",
                                lineNumber: 90,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/app/adminV2/components/canvas/ManagerNode.tsx",
                        lineNumber: 78,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/app/adminV2/components/canvas/ManagerNode.tsx",
                lineNumber: 27,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$reactflow$2f$core$2f$dist$2f$esm$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Handle"], {
                type: "source",
                position: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$reactflow$2f$core$2f$dist$2f$esm$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Position"].Bottom
            }, void 0, false, {
                fileName: "[project]/app/adminV2/components/canvas/ManagerNode.tsx",
                lineNumber: 95,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true);
}
const __TURBOPACK__default__export__ = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["memo"])(ManagerNodeComponent);
}),
"[project]/app/adminV2/components/canvas/ambientTiers.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Ambient intensity hierarchy (adminV2 canvas only).
 * company < department (~+30% vs prior dept steady) < manager (~+50% vs company target).
 */ /** Chamber node data.intensity (drives root opacity floor in ChamberAmbientNode). */ __turbopack_context__.s([
    "AMBIENT_CHAMBER_INTENSITY",
    ()=>AMBIENT_CHAMBER_INTENSITY,
    "AMBIENT_FOCUS_ACTIVATING",
    ()=>AMBIENT_FOCUS_ACTIVATING,
    "AMBIENT_FOCUS_DEPARTMENT_ENTER",
    ()=>AMBIENT_FOCUS_DEPARTMENT_ENTER,
    "AMBIENT_FOCUS_DEPARTMENT_STEADY",
    ()=>AMBIENT_FOCUS_DEPARTMENT_STEADY,
    "AMBIENT_FOCUS_INITIAL",
    ()=>AMBIENT_FOCUS_INITIAL,
    "AMBIENT_FOCUS_MANAGER_STEADY",
    ()=>AMBIENT_FOCUS_MANAGER_STEADY,
    "AMBIENT_FOCUS_MAX_DEPARTMENT",
    ()=>AMBIENT_FOCUS_MAX_DEPARTMENT,
    "AMBIENT_FOCUS_MAX_MANAGER",
    ()=>AMBIENT_FOCUS_MAX_MANAGER,
    "isManagerAmbientNodeId",
    ()=>isManagerAmbientNodeId
]);
const AMBIENT_CHAMBER_INTENSITY = 1;
const AMBIENT_FOCUS_DEPARTMENT_ENTER = 1.02;
const AMBIENT_FOCUS_DEPARTMENT_STEADY = 0.962;
const AMBIENT_FOCUS_MANAGER_STEADY = 1.12;
const AMBIENT_FOCUS_MAX_DEPARTMENT = 1.14;
const AMBIENT_FOCUS_MAX_MANAGER = 1.22;
const AMBIENT_FOCUS_INITIAL = 0.72;
const AMBIENT_FOCUS_ACTIVATING = 1.04;
function isManagerAmbientNodeId(nodeId) {
    return nodeId != null && nodeId.startsWith("mgr-");
}
}),
"[project]/app/adminV2/components/canvas/companyFieldAmbient.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Shared data for AdminV2 "company field" ambient — used by SystemCanvas (AmbientFocusNode, companyLayout: field)
 * and by the workspace shell (WorkspaceAmbientLayer) so specs/bloom/rings stay one product family.
 */ __turbopack_context__.s([
    "COMPANY_FIELD_DRIFT",
    ()=>COMPANY_FIELD_DRIFT,
    "COMPANY_FIELD_DRIFT_FULL",
    ()=>COMPANY_FIELD_DRIFT_FULL,
    "COMPANY_FIELD_DRIFT_PERIMETER_START",
    ()=>COMPANY_FIELD_DRIFT_PERIMETER_START,
    "COMPANY_FIELD_DRIFT_PHASE_A",
    ()=>COMPANY_FIELD_DRIFT_PHASE_A,
    "COMPANY_FIELD_DRIFT_PHASE_B",
    ()=>COMPANY_FIELD_DRIFT_PHASE_B,
    "COMPANY_FIELD_EDGE",
    ()=>COMPANY_FIELD_EDGE
]);
const COMPANY_FIELD_DRIFT = [
    {
        l: 12,
        t: 18
    },
    {
        l: 88,
        t: 22
    },
    {
        l: 6,
        t: 52
    },
    {
        l: 94,
        t: 48
    },
    {
        l: 48,
        t: 8
    },
    {
        l: 52,
        t: 92
    },
    {
        l: 22,
        t: 72
    },
    {
        l: 78,
        t: 68
    },
    {
        l: 35,
        t: 38
    },
    {
        l: 65,
        t: 42
    },
    {
        l: 18,
        t: 88
    },
    {
        l: 82,
        t: 85
    },
    {
        l: 50,
        t: 50
    },
    {
        l: 8,
        t: 12
    },
    {
        l: 92,
        t: 14
    },
    {
        l: 44,
        t: 62
    },
    {
        l: 56,
        t: 58
    },
    {
        l: 30,
        t: 28
    },
    {
        l: 70,
        t: 32
    },
    {
        l: 14,
        t: 44
    },
    {
        l: 86,
        t: 40
    },
    {
        l: 40,
        t: 82
    },
    {
        l: 60,
        t: 78
    },
    {
        l: 4,
        t: 24
    },
    {
        l: 96,
        t: 30
    },
    {
        l: 24,
        t: 8
    },
    {
        l: 76,
        t: 6
    },
    {
        l: 10,
        t: 62
    },
    {
        l: 90,
        t: 58
    },
    {
        l: 42,
        t: 18
    },
    {
        l: 58,
        t: 14
    },
    {
        l: 16,
        t: 36
    },
    {
        l: 84,
        t: 34
    },
    {
        l: 32,
        t: 88
    },
    {
        l: 68,
        t: 90
    },
    {
        l: 50,
        t: 68
    },
    {
        l: 28,
        t: 52
    },
    {
        l: 72,
        t: 48
    },
    {
        l: 46,
        t: 42
    },
    {
        l: 54,
        t: 38
    },
    {
        l: 38,
        t: 72
    },
    {
        l: 62,
        t: 76
    },
    {
        l: 6,
        t: 78
    },
    {
        l: 94,
        t: 74
    },
    {
        l: 20,
        t: 14
    },
    {
        l: 80,
        t: 12
    },
    {
        l: 2,
        t: 46
    },
    {
        l: 98,
        t: 52
    },
    {
        l: 52,
        t: 28
    },
    {
        l: 48,
        t: 74
    },
    {
        l: 66,
        t: 22
    },
    {
        l: 34,
        t: 26
    }
];
const COMPANY_FIELD_EDGE = [
    ...Array.from({
        length: 14
    }, (_, i)=>({
            l: i * 100 / 13,
            t: 1.2
        })),
    ...Array.from({
        length: 14
    }, (_, i)=>({
            l: i * 100 / 13,
            t: 98.8
        })),
    ...Array.from({
        length: 12
    }, (_, i)=>({
            l: 1.2,
            t: 8 + i * 84 / 11
        })),
    ...Array.from({
        length: 12
    }, (_, i)=>({
            l: 98.8,
            t: 8 + i * 84 / 11
        }))
];
const COMPANY_FIELD_DRIFT_PHASE_A = COMPANY_FIELD_DRIFT.map((p, i)=>({
        l: (p.l + 29 + i * 7 % 19) % 100,
        t: (p.t + 41 + i * 5 % 17) % 100
    }));
const COMPANY_FIELD_DRIFT_PHASE_B = COMPANY_FIELD_DRIFT.map((p, i)=>({
        l: (p.l * 0.88 + 7 + i % 9) % 100,
        t: (100 - p.t * 0.9 + 12) % 100
    }));
/** First 31 of PHASE_B completes +83 interior points (52 + 31) ≈ +40% on prior 208 total */ const COMPANY_FIELD_DRIFT_PHASE_B_TRIM = COMPANY_FIELD_DRIFT_PHASE_B.slice(0, 31);
const COMPANY_FIELD_DRIFT_FULL = [
    ...COMPANY_FIELD_DRIFT,
    ...COMPANY_FIELD_DRIFT.map((p, i)=>({
            l: (p.l + 19) % 100,
            t: (p.t + 23 + i) % 100
        })),
    ...COMPANY_FIELD_DRIFT.map((p, i)=>({
            l: (p.l * 0.7 + 15) % 100,
            t: (p.t * 0.8 + 10) % 100
        })),
    ...COMPANY_FIELD_DRIFT_PHASE_A,
    ...COMPANY_FIELD_DRIFT_PHASE_B_TRIM,
    ...COMPANY_FIELD_EDGE
];
const COMPANY_FIELD_DRIFT_PERIMETER_START = COMPANY_FIELD_DRIFT_FULL.length - COMPANY_FIELD_EDGE.length;
}),
"[project]/app/adminV2/components/canvas/AmbientFocusNode.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>__TURBOPACK__default__export__
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/styles/tokens/colors.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$canvas$2f$ambientTiers$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/adminV2/components/canvas/ambientTiers.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$canvas$2f$companyFieldAmbient$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/adminV2/components/canvas/companyFieldAmbient.ts [app-ssr] (ecmascript)");
"use client";
;
;
;
;
;
const R5 = [
    0,
    72,
    144,
    216,
    288
];
const R5I = [
    36,
    108,
    180,
    252,
    324
];
const R8 = [
    0,
    45,
    90,
    135,
    180,
    225,
    270,
    315
];
const R6 = [
    0,
    60,
    120,
    180,
    240,
    300
];
const R12 = [
    0,
    30,
    60,
    90,
    120,
    150,
    180,
    210,
    240,
    270,
    300,
    330
];
const R10 = [
    0,
    36,
    72,
    108,
    144,
    180,
    216,
    252,
    288,
    324
];
const R16 = [
    0,
    22.5,
    45,
    67.5,
    90,
    112.5,
    135,
    157.5,
    180,
    202.5,
    225,
    247.5,
    270,
    292.5,
    315,
    337.5
];
const R20 = [
    0,
    18,
    36,
    54,
    72,
    90,
    108,
    126,
    144,
    162,
    180,
    198,
    216,
    234,
    252,
    270,
    288,
    306,
    324,
    342
];
const COMPANY_DRIFT = [
    {
        l: 8,
        t: 12
    },
    {
        l: 22,
        t: 6
    },
    {
        l: 38,
        t: 18
    },
    {
        l: 55,
        t: 8
    },
    {
        l: 72,
        t: 14
    },
    {
        l: 88,
        t: 10
    },
    {
        l: 94,
        t: 28
    },
    {
        l: 12,
        t: 36
    },
    {
        l: 28,
        t: 48
    },
    {
        l: 48,
        t: 42
    },
    {
        l: 68,
        t: 52
    },
    {
        l: 84,
        t: 44
    },
    {
        l: 6,
        t: 62
    },
    {
        l: 18,
        t: 78
    },
    {
        l: 35,
        t: 72
    },
    {
        l: 52,
        t: 66
    },
    {
        l: 70,
        t: 74
    },
    {
        l: 88,
        t: 68
    },
    {
        l: 92,
        t: 86
    },
    {
        l: 42,
        t: 88
    },
    {
        l: 58,
        t: 24
    },
    {
        l: 76,
        t: 32
    },
    {
        l: 14,
        t: 92
    },
    {
        l: 62,
        t: 12
    },
    {
        l: 4,
        t: 22
    },
    {
        l: 96,
        t: 18
    },
    {
        l: 32,
        t: 8
    },
    {
        l: 66,
        t: 6
    },
    {
        l: 18,
        t: 52
    },
    {
        l: 44,
        t: 58
    },
    {
        l: 78,
        t: 48
    },
    {
        l: 10,
        t: 44
    },
    {
        l: 90,
        t: 40
    },
    {
        l: 50,
        t: 16
    },
    {
        l: 26,
        t: 28
    },
    {
        l: 74,
        t: 22
    },
    {
        l: 46,
        t: 76
    },
    {
        l: 60,
        t: 84
    },
    {
        l: 24,
        t: 64
    },
    {
        l: 82,
        t: 58
    },
    {
        l: 98,
        t: 72
    },
    {
        l: 2,
        t: 48
    },
    {
        l: 54,
        t: 94
    },
    {
        l: 36,
        t: 38
    },
    {
        l: 64,
        t: 34
    },
    {
        l: 16,
        t: 18
    },
    {
        l: 86,
        t: 26
    }
];
/** Edge- and corner-weighted drift — de-centers company motion */ const COMPANY_DRIFT_EDGE = [
    {
        l: 1,
        t: 8
    },
    {
        l: 3,
        t: 45
    },
    {
        l: 2,
        t: 78
    },
    {
        l: 5,
        t: 92
    },
    {
        l: 12,
        t: 3
    },
    {
        l: 8,
        t: 96
    },
    {
        l: 97,
        t: 6
    },
    {
        l: 99,
        t: 38
    },
    {
        l: 98,
        t: 72
    },
    {
        l: 94,
        t: 94
    },
    {
        l: 48,
        t: 2
    },
    {
        l: 52,
        t: 4
    },
    {
        l: 22,
        t: 2
    },
    {
        l: 78,
        t: 3
    },
    {
        l: 50,
        t: 98
    },
    {
        l: 30,
        t: 96
    },
    {
        l: 70,
        t: 97
    },
    {
        l: 0,
        t: 62
    },
    {
        l: 100,
        t: 55
    },
    {
        l: 15,
        t: 15
    },
    {
        l: 85,
        t: 12
    },
    {
        l: 14,
        t: 88
    },
    {
        l: 88,
        t: 88
    },
    {
        l: 40,
        t: 6
    },
    {
        l: 60,
        t: 5
    },
    {
        l: 6,
        t: 30
    },
    {
        l: 93,
        t: 28
    },
    {
        l: 25,
        t: 98
    },
    {
        l: 75,
        t: 99
    },
    {
        l: 50,
        t: 8
    },
    {
        l: 33,
        t: 3
    },
    {
        l: 67,
        t: 2
    },
    {
        l: 1,
        t: 25
    },
    {
        l: 99,
        t: 18
    }
];
const COMPANY_DRIFT_EDGE2 = [
    {
        l: 0,
        t: 12
    },
    {
        l: 100,
        t: 8
    },
    {
        l: 4,
        t: 98
    },
    {
        l: 96,
        t: 96
    },
    {
        l: 18,
        t: 0
    },
    {
        l: 82,
        t: 1
    },
    {
        l: 50,
        t: 0
    },
    {
        l: 0,
        t: 50
    },
    {
        l: 100,
        t: 42
    },
    {
        l: 11,
        t: 91
    },
    {
        l: 91,
        t: 89
    },
    {
        l: 27,
        t: 7
    },
    {
        l: 73,
        t: 5
    },
    {
        l: 7,
        t: 73
    },
    {
        l: 95,
        t: 68
    },
    {
        l: 45,
        t: 1
    },
    {
        l: 55,
        t: 99
    },
    {
        l: 1,
        t: 38
    },
    {
        l: 99,
        t: 28
    },
    {
        l: 38,
        t: 99
    },
    {
        l: 62,
        t: 98
    },
    {
        l: 20,
        t: 95
    },
    {
        l: 80,
        t: 94
    },
    {
        l: 4,
        t: 68
    },
    {
        l: 98,
        t: 82
    },
    {
        l: 15,
        t: 50
    },
    {
        l: 85,
        t: 52
    },
    {
        l: 50,
        t: 15
    },
    {
        l: 48,
        t: 86
    }
];
const FOCUS_DRIFT = [
    {
        l: 15,
        t: 72
    },
    {
        l: 85,
        t: 68
    },
    {
        l: 8,
        t: 55
    },
    {
        l: 92,
        t: 58
    },
    {
        l: 50,
        t: 82
    },
    {
        l: 28,
        t: 78
    },
    {
        l: 72,
        t: 76
    },
    {
        l: 12,
        t: 88
    },
    {
        l: 88,
        t: 85
    },
    {
        l: 48,
        t: 92
    },
    {
        l: 6,
        t: 38,
        sz: 1
    },
    {
        l: 94,
        t: 42,
        sz: 2
    },
    {
        l: 22,
        t: 22,
        sz: 0
    },
    {
        l: 78,
        t: 18,
        sz: 1
    },
    {
        l: 38,
        t: 12,
        sz: 2
    },
    {
        l: 62,
        t: 10,
        sz: 0
    },
    {
        l: 10,
        t: 68,
        sz: 1
    },
    {
        l: 90,
        t: 72,
        sz: 2
    },
    {
        l: 32,
        t: 62,
        sz: 0
    },
    {
        l: 68,
        t: 64,
        sz: 1
    },
    {
        l: 48,
        t: 58,
        sz: 2
    },
    {
        l: 18,
        t: 48,
        sz: 1
    },
    {
        l: 82,
        t: 52,
        sz: 0
    },
    {
        l: 52,
        t: 48,
        sz: 1
    },
    {
        l: 26,
        t: 54,
        sz: 2
    },
    {
        l: 74,
        t: 50,
        sz: 0
    },
    {
        l: 4,
        t: 82,
        sz: 1
    },
    {
        l: 96,
        t: 88,
        sz: 2
    },
    {
        l: 44,
        t: 86,
        sz: 0
    },
    {
        l: 58,
        t: 90,
        sz: 1
    },
    {
        l: 34,
        t: 72,
        sz: 2
    },
    {
        l: 66,
        t: 78,
        sz: 0
    },
    {
        l: 14,
        t: 62,
        sz: 1
    },
    {
        l: 86,
        t: 60,
        sz: 2
    },
    {
        l: 40,
        t: 32,
        sz: 0
    },
    {
        l: 60,
        t: 28,
        sz: 1
    },
    {
        l: 50,
        t: 38,
        sz: 2
    },
    {
        l: 30,
        t: 40,
        sz: 1
    },
    {
        l: 70,
        t: 36,
        sz: 0
    },
    {
        l: 8,
        t: 28,
        sz: 2
    },
    {
        l: 92,
        t: 24,
        sz: 1
    },
    {
        l: 20,
        t: 8,
        sz: 0
    },
    {
        l: 80,
        t: 6,
        sz: 2
    },
    {
        l: 46,
        t: 70,
        sz: 1
    },
    {
        l: 54,
        t: 66,
        sz: 0
    },
    {
        l: 2,
        t: 58,
        sz: 2
    },
    {
        l: 98,
        t: 52,
        sz: 1
    },
    {
        l: 11,
        t: 42,
        sz: 0
    },
    {
        l: 89,
        t: 46,
        sz: 1
    },
    {
        l: 24,
        t: 34,
        sz: 2
    },
    {
        l: 76,
        t: 30,
        sz: 0
    },
    {
        l: 42,
        t: 22,
        sz: 1
    },
    {
        l: 58,
        t: 20,
        sz: 2
    },
    {
        l: 16,
        t: 74,
        sz: 0
    },
    {
        l: 84,
        t: 78,
        sz: 1
    },
    {
        l: 36,
        t: 66,
        sz: 2
    },
    {
        l: 64,
        t: 70,
        sz: 0
    },
    {
        l: 50,
        t: 44,
        sz: 1
    },
    {
        l: 26,
        t: 50,
        sz: 2
    },
    {
        l: 74,
        t: 46,
        sz: 0
    },
    {
        l: 6,
        t: 64,
        sz: 1
    },
    {
        l: 94,
        t: 66,
        sz: 2
    },
    {
        l: 38,
        t: 76,
        sz: 0
    },
    {
        l: 62,
        t: 74,
        sz: 1
    },
    {
        l: 18,
        t: 56,
        sz: 2
    },
    {
        l: 82,
        t: 58,
        sz: 0
    },
    {
        l: 46,
        t: 36,
        sz: 1
    },
    {
        l: 54,
        t: 34,
        sz: 2
    },
    {
        l: 32,
        t: 14,
        sz: 0
    },
    {
        l: 68,
        t: 12,
        sz: 1
    },
    {
        l: 12,
        t: 94,
        sz: 2
    },
    {
        l: 88,
        t: 92,
        sz: 0
    },
    {
        l: 44,
        t: 52,
        sz: 1
    },
    {
        l: 56,
        t: 54,
        sz: 2
    },
    {
        l: 3,
        t: 48,
        sz: 0
    },
    {
        l: 97,
        t: 44,
        sz: 1
    },
    {
        l: 5,
        t: 22,
        sz: 2
    },
    {
        l: 95,
        t: 18,
        sz: 0
    },
    {
        l: 13,
        t: 32,
        sz: 1
    },
    {
        l: 87,
        t: 36,
        sz: 2
    },
    {
        l: 23,
        t: 84,
        sz: 0
    },
    {
        l: 77,
        t: 88,
        sz: 1
    },
    {
        l: 41,
        t: 92,
        sz: 2
    },
    {
        l: 59,
        t: 90,
        sz: 0
    },
    {
        l: 33,
        t: 18,
        sz: 1
    },
    {
        l: 67,
        t: 16,
        sz: 2
    },
    {
        l: 19,
        t: 52,
        sz: 0
    },
    {
        l: 81,
        t: 48,
        sz: 1
    },
    {
        l: 47,
        t: 24,
        sz: 2
    },
    {
        l: 53,
        t: 22,
        sz: 0
    },
    {
        l: 29,
        t: 64,
        sz: 1
    },
    {
        l: 71,
        t: 68,
        sz: 2
    },
    {
        l: 39,
        t: 80,
        sz: 0
    },
    {
        l: 61,
        t: 82,
        sz: 1
    },
    {
        l: 9,
        t: 38,
        sz: 2
    },
    {
        l: 91,
        t: 34,
        sz: 0
    },
    {
        l: 51,
        t: 56,
        sz: 1
    },
    {
        l: 49,
        t: 60,
        sz: 2
    },
    {
        l: 1,
        t: 72,
        sz: 0
    },
    {
        l: 99,
        t: 76,
        sz: 1
    },
    {
        l: 25,
        t: 12,
        sz: 2
    },
    {
        l: 75,
        t: 8,
        sz: 0
    },
    {
        l: 55,
        t: 72,
        sz: 1
    },
    {
        l: 45,
        t: 76,
        sz: 2
    }
];
const FOCUS_MICRO = [
    {
        l: 19,
        t: 61
    },
    {
        l: 81,
        t: 63
    },
    {
        l: 13,
        t: 49
    },
    {
        l: 87,
        t: 51
    },
    {
        l: 47,
        t: 71
    },
    {
        l: 53,
        t: 69
    },
    {
        l: 29,
        t: 57
    },
    {
        l: 71,
        t: 59
    },
    {
        l: 41,
        t: 45
    },
    {
        l: 59,
        t: 47
    },
    {
        l: 23,
        t: 81
    },
    {
        l: 77,
        t: 83
    },
    {
        l: 9,
        t: 71
    },
    {
        l: 91,
        t: 73
    },
    {
        l: 51,
        t: 61
    },
    {
        l: 35,
        t: 73
    },
    {
        l: 65,
        t: 75
    },
    {
        l: 17,
        t: 39
    },
    {
        l: 83,
        t: 41
    },
    {
        l: 49,
        t: 35
    },
    {
        l: 27,
        t: 27
    },
    {
        l: 73,
        t: 25
    },
    {
        l: 55,
        t: 27
    },
    {
        l: 21,
        t: 65
    },
    {
        l: 79,
        t: 67
    },
    {
        l: 7,
        t: 51
    },
    {
        l: 93,
        t: 53
    },
    {
        l: 39,
        t: 59
    },
    {
        l: 61,
        t: 57
    },
    {
        l: 45,
        t: 79
    },
    {
        l: 55,
        t: 77
    },
    {
        l: 31,
        t: 87
    },
    {
        l: 69,
        t: 89
    },
    {
        l: 14,
        t: 76
    },
    {
        l: 86,
        t: 74
    },
    {
        l: 52,
        t: 41
    },
    {
        l: 48,
        t: 63
    },
    {
        l: 66,
        t: 44
    },
    {
        l: 34,
        t: 46
    },
    {
        l: 58,
        t: 86
    },
    {
        l: 42,
        t: 84
    },
    {
        l: 24,
        t: 54
    },
    {
        l: 76,
        t: 56
    },
    {
        l: 11,
        t: 11
    },
    {
        l: 89,
        t: 9
    },
    {
        l: 7,
        t: 93
    },
    {
        l: 93,
        t: 91
    },
    {
        l: 31,
        t: 7
    },
    {
        l: 69,
        t: 5
    },
    {
        l: 5,
        t: 41
    },
    {
        l: 95,
        t: 39
    },
    {
        l: 21,
        t: 19
    },
    {
        l: 79,
        t: 21
    },
    {
        l: 37,
        t: 91
    },
    {
        l: 63,
        t: 93
    },
    {
        l: 15,
        t: 67
    },
    {
        l: 85,
        t: 65
    },
    {
        l: 49,
        t: 13
    },
    {
        l: 51,
        t: 87
    },
    {
        l: 27,
        t: 45
    },
    {
        l: 73,
        t: 43
    },
    {
        l: 43,
        t: 29
    },
    {
        l: 57,
        t: 31
    },
    {
        l: 17,
        t: 83
    },
    {
        l: 83,
        t: 81
    },
    {
        l: 35,
        t: 55
    },
    {
        l: 65,
        t: 53
    },
    {
        l: 53,
        t: 69
    },
    {
        l: 47,
        t: 71
    },
    {
        l: 13,
        t: 25
    },
    {
        l: 87,
        t: 23
    },
    {
        l: 23,
        t: 39
    },
    {
        l: 77,
        t: 37
    }
];
const FOCUS_DRIFT_CLASS = [
    "adminv2-focus-drift-sm",
    "adminv2-focus-drift-md",
    "adminv2-focus-drift-lg"
];
/** Top/bottom edges + left/right — chamber perimeter life (not center-clustered) */ const COMPANY_HUB_PERIMETER = (()=>{
    const pts = [];
    for(let l = 0; l <= 100; l += 5){
        pts.push({
            l,
            t: 0.6
        }, {
            l,
            t: 99.4
        });
    }
    for(let t = 4; t <= 96; t += 4.2){
        pts.push({
            l: 0.6,
            t
        }, {
            l: 99.4,
            t
        });
    }
    return pts;
})();
const COMPANY_HUB_CORRIDOR = [
    ...Array.from({
        length: 22
    }, (_, i)=>({
            l: 4 + i * 92 / 21,
            t: 11 + i % 5 * 0.4
        })),
    ...Array.from({
        length: 22
    }, (_, i)=>({
            l: 4 + i * 92 / 21,
            t: 86 + i % 5 * 0.4
        })),
    ...Array.from({
        length: 16
    }, (_, i)=>({
            l: 2.5 + i % 8 * 0.3,
            t: 18 + i * 4.2
        })),
    ...Array.from({
        length: 16
    }, (_, i)=>({
            l: 97.2 + i % 8 * 0.3,
            t: 18 + i * 4.2
        }))
];
const COMPANY_HUB_DRIFT = [
    ...COMPANY_DRIFT,
    ...COMPANY_DRIFT_EDGE,
    ...COMPANY_DRIFT_EDGE2,
    ...COMPANY_HUB_PERIMETER,
    ...COMPANY_HUB_CORRIDOR,
    ...COMPANY_DRIFT.map((p, i)=>({
            l: (p.l + 13 + i % 6) % 100,
            t: (p.t + 17 + i) % 100
        })),
    ...COMPANY_DRIFT_EDGE.map((p, i)=>({
            l: (p.l + 8 + i) % 100,
            t: (p.t + 21) % 100
        })),
    ...COMPANY_DRIFT.map((p, i)=>({
            l: Math.min(100, p.l + i % 3 * 2),
            t: Math.max(0, p.t - i % 5)
        }))
];
const HUB_AMBIENT_PERIM_START = COMPANY_DRIFT.length + COMPANY_DRIFT_EDGE.length + COMPANY_DRIFT_EDGE2.length;
const HUB_AMBIENT_PERIM_END = HUB_AMBIENT_PERIM_START + COMPANY_HUB_PERIMETER.length + COMPANY_HUB_CORRIDOR.length;
const FOCUS_PERIMETER_MICRO = (()=>{
    const o = [];
    for(let i = 0; i < 28; i++){
        o.push({
            l: 1.2 + i % 7 * 0.25,
            t: 5 + i * 3.2
        });
        o.push({
            l: 98.5 - i % 7 * 0.25,
            t: 8 + i * 3.1
        });
    }
    for(let i = 0; i < 20; i++){
        o.push({
            l: 6 + i * 4.4,
            t: 2.5 + i % 3 * 0.2
        });
        o.push({
            l: 5 + i * 4.5,
            t: 97.2 + i % 3 * 0.2
        });
    }
    return o;
})();
function AmbientFocusNodeComponent({ data }) {
    const variant = data.variant ?? "focus";
    const isCompany = variant === "company";
    const companyLayout = data.companyLayout ?? "hub";
    const focusTier = data.focusTier ?? "department";
    const focusCap = focusTier === "manager" ? __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$canvas$2f$ambientTiers$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AMBIENT_FOCUS_MAX_MANAGER"] : __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$canvas$2f$ambientTiers$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AMBIENT_FOCUS_MAX_DEPARTMENT"];
    const i = isCompany ? Math.max(0.5, Math.min(0.92, data.intensity ?? 0.8)) : Math.max(0.52, Math.min(focusCap, data.intensity ?? 0.78));
    if (isCompany && companyLayout === "field") {
        const fi = Math.min(0.78, i);
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "adminv2-ambient-root-company-field",
            style: {
                opacity: fi
            },
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "adminv2-ambient-bloom adminv2-ambient-bloom-company-field",
                    style: {
                        background: `radial-gradient(ellipse 108% 102% at 48% 46%, ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].ambientCompanyBloomLift} 0%, ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].ambientLifeBloomCore} 18%, transparent 58%)`
                    }
                }, void 0, false, {
                    fileName: "[project]/app/adminV2/components/canvas/AmbientFocusNode.tsx",
                    lineNumber: 179,
                    columnNumber: 9
                }, this),
                __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$canvas$2f$companyFieldAmbient$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["COMPANY_FIELD_DRIFT_FULL"].map((p, idx)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: idx >= __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$canvas$2f$companyFieldAmbient$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["COMPANY_FIELD_DRIFT_PERIMETER_START"] ? "adminv2-company-field-drift adminv2-company-field-drift-perimeter" : "adminv2-company-field-drift",
                        style: {
                            left: `${p.l}%`,
                            top: `${p.t}%`,
                            backgroundColor: idx % 2 === 0 ? __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].ambientCompanySpecMid : __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].ambientCompanyParticleCore,
                            animationDelay: `${idx * 0.22}s`
                        }
                    }, `cf-${idx}`, false, {
                        fileName: "[project]/app/adminV2/components/canvas/AmbientFocusNode.tsx",
                        lineNumber: 186,
                        columnNumber: 11
                    }, this)),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "adminv2-ambient-ring adminv2-ambient-ring-company-field-a",
                    "aria-hidden": true,
                    children: R8.map((deg)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "adminv2-ambient-spec-company-field",
                            style: {
                                transform: `rotate(${deg}deg) translateY(-118px)`
                            }
                        }, `cfa-${deg}`, false, {
                            fileName: "[project]/app/adminV2/components/canvas/AmbientFocusNode.tsx",
                            lineNumber: 203,
                            columnNumber: 13
                        }, this))
                }, void 0, false, {
                    fileName: "[project]/app/adminV2/components/canvas/AmbientFocusNode.tsx",
                    lineNumber: 201,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "adminv2-ambient-ring adminv2-ambient-ring-reverse adminv2-ambient-ring-company-field-b",
                    "aria-hidden": true,
                    children: R10.map((deg)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "adminv2-ambient-spec-company-field-soft",
                            style: {
                                transform: `rotate(${deg}deg) translateY(-198px)`
                            }
                        }, `cfb-${deg}`, false, {
                            fileName: "[project]/app/adminV2/components/canvas/AmbientFocusNode.tsx",
                            lineNumber: 212,
                            columnNumber: 13
                        }, this))
                }, void 0, false, {
                    fileName: "[project]/app/adminV2/components/canvas/AmbientFocusNode.tsx",
                    lineNumber: 210,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "adminv2-ambient-ring adminv2-ambient-ring-company-field-c",
                    "aria-hidden": true,
                    children: R12.map((deg)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "adminv2-ambient-spec-company-field-outer",
                            style: {
                                transform: `rotate(${deg}deg) translateY(-292px)`
                            }
                        }, `cfc-${deg}`, false, {
                            fileName: "[project]/app/adminV2/components/canvas/AmbientFocusNode.tsx",
                            lineNumber: 221,
                            columnNumber: 13
                        }, this))
                }, void 0, false, {
                    fileName: "[project]/app/adminV2/components/canvas/AmbientFocusNode.tsx",
                    lineNumber: 219,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "adminv2-ambient-ring adminv2-ambient-ring-reverse adminv2-ambient-ring-company-field-d",
                    "aria-hidden": true,
                    children: R10.map((deg)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "adminv2-ambient-spec-company-field-dim",
                            style: {
                                transform: `rotate(${deg}deg) translateY(-368px)`
                            }
                        }, `cfd-${deg}`, false, {
                            fileName: "[project]/app/adminV2/components/canvas/AmbientFocusNode.tsx",
                            lineNumber: 230,
                            columnNumber: 13
                        }, this))
                }, void 0, false, {
                    fileName: "[project]/app/adminV2/components/canvas/AmbientFocusNode.tsx",
                    lineNumber: 228,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "adminv2-ambient-ring adminv2-ambient-ring-company-field-e",
                    "aria-hidden": true,
                    children: R12.map((deg)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "adminv2-ambient-spec-company-field-proof",
                            style: {
                                transform: `rotate(${deg}deg) translateY(-402px)`
                            }
                        }, `cfe-${deg}`, false, {
                            fileName: "[project]/app/adminV2/components/canvas/AmbientFocusNode.tsx",
                            lineNumber: 239,
                            columnNumber: 13
                        }, this))
                }, void 0, false, {
                    fileName: "[project]/app/adminV2/components/canvas/AmbientFocusNode.tsx",
                    lineNumber: 237,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/app/adminV2/components/canvas/AmbientFocusNode.tsx",
            lineNumber: 178,
            columnNumber: 7
        }, this);
    }
    if (isCompany) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "adminv2-ambient-root-company-hub adminv2-ambient-proof-root",
            style: {
                opacity: i
            },
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "adminv2-ambient-bloom adminv2-ambient-bloom-company-hub",
                    style: {
                        background: `radial-gradient(ellipse 132% 100% at 36% 38%, ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].ambientCompanyBloomLift} 0%, ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].ambientLifeBloomCore} 14%, transparent 58%)`
                    }
                }, void 0, false, {
                    fileName: "[project]/app/adminV2/components/canvas/AmbientFocusNode.tsx",
                    lineNumber: 253,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "adminv2-ambient-bloom adminv2-ambient-bloom-company-hub-mid",
                    style: {
                        background: `radial-gradient(ellipse 88% 92% at 52% 48%, ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].ambientLifeBloomMid} 0%, transparent 50%)`
                    }
                }, void 0, false, {
                    fileName: "[project]/app/adminV2/components/canvas/AmbientFocusNode.tsx",
                    lineNumber: 259,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "adminv2-ambient-bloom adminv2-ambient-bloom-company-hub-soft",
                    style: {
                        background: `radial-gradient(ellipse 95% 78% at 68% 64%, ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].canvasChamberPineDrift} 0%, transparent 52%)`
                    }
                }, void 0, false, {
                    fileName: "[project]/app/adminV2/components/canvas/AmbientFocusNode.tsx",
                    lineNumber: 265,
                    columnNumber: 9
                }, this),
                COMPANY_HUB_DRIFT.map((p, idx)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: `adminv2-company-drift-dot adminv2-company-drift-vivid adminv2-ambient-proof ${idx >= HUB_AMBIENT_PERIM_START && idx < HUB_AMBIENT_PERIM_END ? "adminv2-company-drift-perimeter-slow" : ""} ${idx % 3 === 0 ? "adminv2-company-drift-jumbo" : ""}`,
                        style: {
                            left: `${p.l}%`,
                            top: `${p.t}%`,
                            backgroundColor: idx % 3 === 0 ? __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].ambientCompanyParticleBright : __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].ambientCompanyParticleCore,
                            animationDelay: `${idx * 0.14}s`
                        }
                    }, `d-${idx}`, false, {
                        fileName: "[project]/app/adminV2/components/canvas/AmbientFocusNode.tsx",
                        lineNumber: 272,
                        columnNumber: 11
                    }, this)),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "adminv2-ambient-ring adminv2-ambient-ring-company-hub-inner",
                    "aria-hidden": true,
                    children: R8.map((deg)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "adminv2-ambient-spec-company-bold",
                            style: {
                                transform: `rotate(${deg}deg) translateY(-128px)`,
                                backgroundColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].ambientCompanySpecVivid
                            }
                        }, `hi-${deg}`, false, {
                            fileName: "[project]/app/adminV2/components/canvas/AmbientFocusNode.tsx",
                            lineNumber: 289,
                            columnNumber: 13
                        }, this))
                }, void 0, false, {
                    fileName: "[project]/app/adminV2/components/canvas/AmbientFocusNode.tsx",
                    lineNumber: 287,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "adminv2-ambient-ring adminv2-ambient-ring-reverse adminv2-ambient-ring-company-hub-a",
                    "aria-hidden": true,
                    children: R10.map((deg)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "adminv2-ambient-spec-company-bold",
                            style: {
                                transform: `rotate(${deg}deg) translateY(-198px)`,
                                backgroundColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].ambientCompanySpecVivid
                            }
                        }, `ha-${deg}`, false, {
                            fileName: "[project]/app/adminV2/components/canvas/AmbientFocusNode.tsx",
                            lineNumber: 301,
                            columnNumber: 13
                        }, this))
                }, void 0, false, {
                    fileName: "[project]/app/adminV2/components/canvas/AmbientFocusNode.tsx",
                    lineNumber: 299,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "adminv2-ambient-ring adminv2-ambient-ring-company-fast",
                    "aria-hidden": true,
                    children: R8.map((deg)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "adminv2-ambient-spec-company-bold",
                            style: {
                                transform: `rotate(${deg}deg) translateY(-278px)`,
                                backgroundColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].ambientCompanySpecVivid
                            }
                        }, `f-${deg}`, false, {
                            fileName: "[project]/app/adminV2/components/canvas/AmbientFocusNode.tsx",
                            lineNumber: 313,
                            columnNumber: 13
                        }, this))
                }, void 0, false, {
                    fileName: "[project]/app/adminV2/components/canvas/AmbientFocusNode.tsx",
                    lineNumber: 311,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "adminv2-ambient-ring adminv2-ambient-ring-reverse adminv2-ambient-ring-company-mid",
                    "aria-hidden": true,
                    children: R6.map((deg)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "adminv2-ambient-spec-company-hero",
                            style: {
                                transform: `rotate(${deg}deg) translateY(-362px)`,
                                backgroundColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].ambientCompanySpecVivid
                            }
                        }, `m-${deg}`, false, {
                            fileName: "[project]/app/adminV2/components/canvas/AmbientFocusNode.tsx",
                            lineNumber: 325,
                            columnNumber: 13
                        }, this))
                }, void 0, false, {
                    fileName: "[project]/app/adminV2/components/canvas/AmbientFocusNode.tsx",
                    lineNumber: 323,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "adminv2-ambient-ring adminv2-ambient-ring-company",
                    "aria-hidden": true,
                    children: R5.map((deg)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "adminv2-ambient-spec-company-hero",
                            style: {
                                transform: `rotate(${deg}deg) translateY(-448px)`,
                                backgroundColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].ambientCompanySpecMid
                            }
                        }, deg, false, {
                            fileName: "[project]/app/adminV2/components/canvas/AmbientFocusNode.tsx",
                            lineNumber: 337,
                            columnNumber: 13
                        }, this))
                }, void 0, false, {
                    fileName: "[project]/app/adminV2/components/canvas/AmbientFocusNode.tsx",
                    lineNumber: 335,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "adminv2-ambient-ring adminv2-ambient-ring-reverse adminv2-ambient-ring-company-slow",
                    "aria-hidden": true,
                    children: R5I.map((deg)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "adminv2-ambient-spec-company-ring-outer",
                            style: {
                                transform: `rotate(${deg}deg) translateY(-532px)`,
                                backgroundColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].ambientCompanySpecVivid
                            }
                        }, deg, false, {
                            fileName: "[project]/app/adminV2/components/canvas/AmbientFocusNode.tsx",
                            lineNumber: 349,
                            columnNumber: 13
                        }, this))
                }, void 0, false, {
                    fileName: "[project]/app/adminV2/components/canvas/AmbientFocusNode.tsx",
                    lineNumber: 347,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "adminv2-ambient-ring adminv2-ambient-ring-company-outer2",
                    "aria-hidden": true,
                    children: R12.map((deg)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "adminv2-ambient-spec-company-outer-dot",
                            style: {
                                transform: `rotate(${deg}deg) translateY(-618px)`,
                                backgroundColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].ambientCompanySpecMid
                            }
                        }, `o-${deg}`, false, {
                            fileName: "[project]/app/adminV2/components/canvas/AmbientFocusNode.tsx",
                            lineNumber: 361,
                            columnNumber: 13
                        }, this))
                }, void 0, false, {
                    fileName: "[project]/app/adminV2/components/canvas/AmbientFocusNode.tsx",
                    lineNumber: 359,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "adminv2-ambient-ring adminv2-ambient-ring-reverse adminv2-ambient-ring-company-hub-outer",
                    "aria-hidden": true,
                    children: R16.map((deg)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "adminv2-ambient-spec-company-outer-wide",
                            style: {
                                transform: `rotate(${deg}deg) translateY(-702px)`,
                                backgroundColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].ambientCompanySpecMid
                            }
                        }, `ho-${deg}`, false, {
                            fileName: "[project]/app/adminV2/components/canvas/AmbientFocusNode.tsx",
                            lineNumber: 373,
                            columnNumber: 13
                        }, this))
                }, void 0, false, {
                    fileName: "[project]/app/adminV2/components/canvas/AmbientFocusNode.tsx",
                    lineNumber: 371,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "adminv2-ambient-ring adminv2-ambient-ring-company-hub-rim",
                    "aria-hidden": true,
                    children: R12.map((deg)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "adminv2-ambient-spec-company-rim",
                            style: {
                                transform: `rotate(${deg}deg) translateY(-738px)`,
                                backgroundColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].ambientCompanyParticleBright
                            }
                        }, `hr-${deg}`, false, {
                            fileName: "[project]/app/adminV2/components/canvas/AmbientFocusNode.tsx",
                            lineNumber: 385,
                            columnNumber: 13
                        }, this))
                }, void 0, false, {
                    fileName: "[project]/app/adminV2/components/canvas/AmbientFocusNode.tsx",
                    lineNumber: 383,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "adminv2-ambient-ring adminv2-ambient-ring-reverse adminv2-ambient-ring-company-hub-mega",
                    "aria-hidden": true,
                    children: R20.map((deg)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "adminv2-ambient-spec-company-mega",
                            style: {
                                transform: `rotate(${deg}deg) translateY(-668px)`,
                                backgroundColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].ambientCompanyParticleBright
                            }
                        }, `hm-${deg}`, false, {
                            fileName: "[project]/app/adminV2/components/canvas/AmbientFocusNode.tsx",
                            lineNumber: 397,
                            columnNumber: 13
                        }, this))
                }, void 0, false, {
                    fileName: "[project]/app/adminV2/components/canvas/AmbientFocusNode.tsx",
                    lineNumber: 395,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "adminv2-ambient-ring adminv2-ambient-ring-company-horizon",
                    "aria-hidden": true,
                    children: R16.map((deg)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "adminv2-ambient-spec-company-horizon",
                            style: {
                                transform: `rotate(${deg}deg) translateY(-812px)`
                            }
                        }, `hz-${deg}`, false, {
                            fileName: "[project]/app/adminV2/components/canvas/AmbientFocusNode.tsx",
                            lineNumber: 409,
                            columnNumber: 13
                        }, this))
                }, void 0, false, {
                    fileName: "[project]/app/adminV2/components/canvas/AmbientFocusNode.tsx",
                    lineNumber: 407,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/app/adminV2/components/canvas/AmbientFocusNode.tsx",
            lineNumber: 252,
            columnNumber: 7
        }, this);
    }
    const FOCUS_DRIFT_PROOF = Array.from({
        length: 52
    }, (_, i)=>({
            l: (i * 23 + 11) % 100,
            t: (i * 31 + 7) % 100,
            sz: i % 3
        }));
    const FOCUS_MICRO_PROOF = FOCUS_MICRO.map((p, i)=>({
            l: (p.l + 17 + i % 5) % 100,
            t: (p.t + 13 + i % 7) % 100
        }));
    const FOCUS_DEPT_DENSITY = Array.from({
        length: 36
    }, (_, k)=>({
            l: (k * 17 + 9) % 100,
            t: (k * 23 + 11) % 100
        }));
    const FOCUS_MANAGER_EXTRA = Array.from({
        length: 44
    }, (_, k)=>({
            l: (k * 19 + 5 + k % 7) % 100,
            t: (k * 29 + 3 + k % 5) % 100
        }));
    const tierClass = focusTier === "manager" ? "adminv2-ambient-tier-manager" : "adminv2-ambient-tier-department";
    const innerFilter = i > 1.008 ? `brightness(${1 + (i - 1) * 0.62}) saturate(${1 + (i - 1) * 0.22})` : undefined;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: `adminv2-ambient-root-focus adminv2-ambient-proof-focus ${tierClass}`,
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "adminv2-ambient-focus-inner",
            style: {
                position: "absolute",
                inset: 0,
                opacity: Math.min(1, i),
                filter: innerFilter
            },
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "adminv2-ambient-bloom",
                    style: {
                        background: `radial-gradient(circle at 50% 55%, ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].ambientFocusLifeCore} 0%, ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].ambientFocusLifeMid} 32%, ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].ambientFocusLifeEdge} 52%, transparent 72%)`
                    }
                }, void 0, false, {
                    fileName: "[project]/app/adminV2/components/canvas/AmbientFocusNode.tsx",
                    lineNumber: 462,
                    columnNumber: 7
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "adminv2-ambient-bloom adminv2-ambient-bloom-focus-veil",
                    style: {
                        background: `radial-gradient(circle at 48% 62%, ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].canvasChamberBlueDepth} 0%, transparent 55%)`
                    }
                }, void 0, false, {
                    fileName: "[project]/app/adminV2/components/canvas/AmbientFocusNode.tsx",
                    lineNumber: 468,
                    columnNumber: 7
                }, this),
                FOCUS_MICRO.map((p, idx)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "adminv2-focus-micro-spec adminv2-focus-micro-proof",
                        style: {
                            left: `${p.l}%`,
                            top: `${p.t}%`,
                            animationDelay: `${idx * 0.07}s`
                        }
                    }, `fm-${idx}`, false, {
                        fileName: "[project]/app/adminV2/components/canvas/AmbientFocusNode.tsx",
                        lineNumber: 475,
                        columnNumber: 9
                    }, this)),
                FOCUS_MICRO_PROOF.map((p, idx)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "adminv2-focus-micro-spec adminv2-focus-micro-proof",
                        style: {
                            left: `${p.l}%`,
                            top: `${p.t}%`,
                            animationDelay: `${idx * 0.09 + 0.4}s`
                        }
                    }, `fmp-${idx}`, false, {
                        fileName: "[project]/app/adminV2/components/canvas/AmbientFocusNode.tsx",
                        lineNumber: 486,
                        columnNumber: 9
                    }, this)),
                FOCUS_PERIMETER_MICRO.map((p, idx)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "adminv2-focus-micro-spec adminv2-focus-micro-proof adminv2-focus-micro-edge",
                        style: {
                            left: `${p.l}%`,
                            top: `${p.t}%`,
                            animationDelay: `${idx * 0.05}s`
                        }
                    }, `fpm-${idx}`, false, {
                        fileName: "[project]/app/adminV2/components/canvas/AmbientFocusNode.tsx",
                        lineNumber: 497,
                        columnNumber: 9
                    }, this)),
                FOCUS_DRIFT.map((p, idx)=>{
                    const sz = p.sz ?? idx % 3;
                    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: `adminv2-focus-drift-dot adminv2-focus-drift-perimeter adminv2-focus-drift-proof ${FOCUS_DRIFT_CLASS[sz]}`,
                        style: {
                            left: `${p.l}%`,
                            top: `${p.t}%`,
                            backgroundColor: idx % 4 === 0 ? __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].ambientFocusDriftBright : __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].ambientFocusLifeSpecAlt,
                            animationDelay: `${idx * 0.08}s`
                        }
                    }, `fd-${idx}`, false, {
                        fileName: "[project]/app/adminV2/components/canvas/AmbientFocusNode.tsx",
                        lineNumber: 510,
                        columnNumber: 11
                    }, this);
                }),
                FOCUS_DRIFT_PROOF.map((p, idx)=>{
                    const sz = p.sz;
                    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: `adminv2-focus-drift-dot adminv2-focus-drift-perimeter adminv2-focus-drift-proof ${FOCUS_DRIFT_CLASS[sz]}`,
                        style: {
                            left: `${p.l}%`,
                            top: `${p.t}%`,
                            backgroundColor: idx % 3 === 0 ? __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].ambientFocusDriftBright : __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].ambientFocusLifeSpecAlt,
                            animationDelay: `${idx * 0.06 + 0.2}s`
                        }
                    }, `fdp-${idx}`, false, {
                        fileName: "[project]/app/adminV2/components/canvas/AmbientFocusNode.tsx",
                        lineNumber: 525,
                        columnNumber: 11
                    }, this);
                }),
                FOCUS_DEPT_DENSITY.map((p, idx)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "adminv2-focus-micro-spec adminv2-focus-micro-proof adminv2-focus-dept-density",
                        style: {
                            left: `${p.l}%`,
                            top: `${p.t}%`,
                            animationDelay: `${idx * 0.05 + 0.15}s`
                        }
                    }, `fdd-${idx}`, false, {
                        fileName: "[project]/app/adminV2/components/canvas/AmbientFocusNode.tsx",
                        lineNumber: 538,
                        columnNumber: 9
                    }, this)),
                focusTier === "manager" && FOCUS_MANAGER_EXTRA.map((p, idx)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "adminv2-focus-drift-dot adminv2-focus-drift-perimeter adminv2-focus-drift-proof adminv2-focus-drift-md adminv2-focus-manager-extra",
                        style: {
                            left: `${p.l}%`,
                            top: `${p.t}%`,
                            backgroundColor: idx % 2 === 0 ? __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].ambientFocusDriftBright : __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].ambientFocusLifeSpecAlt,
                            animationDelay: `${idx * 0.04}s`
                        }
                    }, `fme-${idx}`, false, {
                        fileName: "[project]/app/adminV2/components/canvas/AmbientFocusNode.tsx",
                        lineNumber: 550,
                        columnNumber: 11
                    }, this)),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "adminv2-ambient-ring adminv2-ambient-ring-focus-early",
                    "aria-hidden": true,
                    children: R8.map((deg)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "adminv2-ambient-spec-focus-early",
                            style: {
                                transform: `rotate(${deg}deg) translateY(-202px)`
                            }
                        }, `pe-${deg}`, false, {
                            fileName: "[project]/app/adminV2/components/canvas/AmbientFocusNode.tsx",
                            lineNumber: 563,
                            columnNumber: 11
                        }, this))
                }, void 0, false, {
                    fileName: "[project]/app/adminV2/components/canvas/AmbientFocusNode.tsx",
                    lineNumber: 561,
                    columnNumber: 7
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "adminv2-ambient-ring adminv2-ambient-ring-reverse adminv2-ambient-ring-focus-inner",
                    "aria-hidden": true,
                    children: R12.map((deg, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "adminv2-ambient-spec-focus-micro-orbit",
                            style: {
                                transform: `rotate(${deg}deg) translateY(-252px)`,
                                opacity: i % 2 ? 0.65 : 0.9
                            }
                        }, `pi-${deg}`, false, {
                            fileName: "[project]/app/adminV2/components/canvas/AmbientFocusNode.tsx",
                            lineNumber: 572,
                            columnNumber: 11
                        }, this))
                }, void 0, false, {
                    fileName: "[project]/app/adminV2/components/canvas/AmbientFocusNode.tsx",
                    lineNumber: 570,
                    columnNumber: 7
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "adminv2-ambient-ring adminv2-ambient-ring-focus-mid",
                    "aria-hidden": true,
                    children: R12.map((deg, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: i % 2 === 0 ? "adminv2-ambient-spec-focus-mid" : "adminv2-ambient-spec-focus-mid-soft",
                            style: {
                                transform: `rotate(${deg}deg) translateY(-298px)`,
                                backgroundColor: i % 2 === 0 ? __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].ambientFocusRingPine : __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].ambientFocusDriftBright
                            }
                        }, `pm-${deg}`, false, {
                            fileName: "[project]/app/adminV2/components/canvas/AmbientFocusNode.tsx",
                            lineNumber: 584,
                            columnNumber: 11
                        }, this))
                }, void 0, false, {
                    fileName: "[project]/app/adminV2/components/canvas/AmbientFocusNode.tsx",
                    lineNumber: 582,
                    columnNumber: 7
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "adminv2-ambient-ring adminv2-ambient-ring-reverse adminv2-ambient-ring-focus-mid2",
                    "aria-hidden": true,
                    children: R10.map((deg)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "adminv2-ambient-spec-focus-mid2",
                            style: {
                                transform: `rotate(${deg}deg) translateY(-342px)`,
                                backgroundColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].ambientFocusLifeSpecAlt
                            }
                        }, `pm2-${deg}`, false, {
                            fileName: "[project]/app/adminV2/components/canvas/AmbientFocusNode.tsx",
                            lineNumber: 596,
                            columnNumber: 11
                        }, this))
                }, void 0, false, {
                    fileName: "[project]/app/adminV2/components/canvas/AmbientFocusNode.tsx",
                    lineNumber: 594,
                    columnNumber: 7
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "adminv2-ambient-ring adminv2-ambient-ring-focus-fill",
                    "aria-hidden": true,
                    children: R10.map((deg)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "adminv2-ambient-spec-focus-fill",
                            style: {
                                transform: `rotate(${deg}deg) translateY(-378px)`
                            }
                        }, `pf-${deg}`, false, {
                            fileName: "[project]/app/adminV2/components/canvas/AmbientFocusNode.tsx",
                            lineNumber: 608,
                            columnNumber: 11
                        }, this))
                }, void 0, false, {
                    fileName: "[project]/app/adminV2/components/canvas/AmbientFocusNode.tsx",
                    lineNumber: 606,
                    columnNumber: 7
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "adminv2-ambient-ring adminv2-ambient-ring-reverse adminv2-ambient-ring-focus-perimeter-a",
                    "aria-hidden": true,
                    children: R10.map((deg)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "adminv2-ambient-spec-focus-perimeter",
                            style: {
                                transform: `rotate(${deg}deg) translateY(-418px)`,
                                backgroundColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].ambientFocusLifeSpecAlt
                            }
                        }, `pa-${deg}`, false, {
                            fileName: "[project]/app/adminV2/components/canvas/AmbientFocusNode.tsx",
                            lineNumber: 617,
                            columnNumber: 11
                        }, this))
                }, void 0, false, {
                    fileName: "[project]/app/adminV2/components/canvas/AmbientFocusNode.tsx",
                    lineNumber: 615,
                    columnNumber: 7
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "adminv2-ambient-ring adminv2-ambient-ring-focus-perimeter-b",
                    "aria-hidden": true,
                    children: R8.map((deg)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "adminv2-ambient-spec-focus-perimeter-soft",
                            style: {
                                transform: `rotate(${deg}deg) translateY(-462px)`,
                                backgroundColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].ambientSpec
                            }
                        }, `pb-${deg}`, false, {
                            fileName: "[project]/app/adminV2/components/canvas/AmbientFocusNode.tsx",
                            lineNumber: 629,
                            columnNumber: 11
                        }, this))
                }, void 0, false, {
                    fileName: "[project]/app/adminV2/components/canvas/AmbientFocusNode.tsx",
                    lineNumber: 627,
                    columnNumber: 7
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "adminv2-ambient-ring adminv2-ambient-ring-reverse adminv2-ambient-ring-focus-perimeter-c",
                    "aria-hidden": true,
                    children: R12.map((deg)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "adminv2-ambient-spec-focus-perimeter-pine",
                            style: {
                                transform: `rotate(${deg}deg) translateY(-508px)`,
                                backgroundColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].ambientLifeSpecSoft
                            }
                        }, `pc-${deg}`, false, {
                            fileName: "[project]/app/adminV2/components/canvas/AmbientFocusNode.tsx",
                            lineNumber: 641,
                            columnNumber: 11
                        }, this))
                }, void 0, false, {
                    fileName: "[project]/app/adminV2/components/canvas/AmbientFocusNode.tsx",
                    lineNumber: 639,
                    columnNumber: 7
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "adminv2-ambient-ring adminv2-ambient-ring-focus-outer",
                    "aria-hidden": true,
                    children: R16.map((deg)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "adminv2-ambient-spec-focus-outer-fine adminv2-focus-spec-proof",
                            style: {
                                transform: `rotate(${deg}deg) translateY(-548px)`
                            }
                        }, `po-${deg}`, false, {
                            fileName: "[project]/app/adminV2/components/canvas/AmbientFocusNode.tsx",
                            lineNumber: 653,
                            columnNumber: 11
                        }, this))
                }, void 0, false, {
                    fileName: "[project]/app/adminV2/components/canvas/AmbientFocusNode.tsx",
                    lineNumber: 651,
                    columnNumber: 7
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "adminv2-ambient-ring adminv2-ambient-ring-reverse adminv2-ambient-ring-focus-mega",
                    "aria-hidden": true,
                    children: R20.map((deg)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "adminv2-ambient-spec-focus-mega",
                            style: {
                                transform: `rotate(${deg}deg) translateY(-520px)`
                            }
                        }, `fmg-${deg}`, false, {
                            fileName: "[project]/app/adminV2/components/canvas/AmbientFocusNode.tsx",
                            lineNumber: 664,
                            columnNumber: 11
                        }, this))
                }, void 0, false, {
                    fileName: "[project]/app/adminV2/components/canvas/AmbientFocusNode.tsx",
                    lineNumber: 662,
                    columnNumber: 7
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/app/adminV2/components/canvas/AmbientFocusNode.tsx",
            lineNumber: 453,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/app/adminV2/components/canvas/AmbientFocusNode.tsx",
        lineNumber: 452,
        columnNumber: 5
    }, this);
}
const __TURBOPACK__default__export__ = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["memo"])(AmbientFocusNodeComponent);
}),
"[project]/app/adminV2/components/canvas/ChamberAmbientNode.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>__TURBOPACK__default__export__
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
"use client";
;
;
const R6 = [
    0,
    60,
    120,
    180,
    240,
    300
];
const R8 = [
    0,
    45,
    90,
    135,
    180,
    225,
    270,
    315
];
const R10 = [
    0,
    36,
    72,
    108,
    144,
    180,
    216,
    252,
    288,
    324
];
const R12 = [
    0,
    30,
    60,
    90,
    120,
    150,
    180,
    210,
    240,
    270,
    300,
    330
];
const R16 = [
    0,
    22.5,
    45,
    67.5,
    90,
    112.5,
    135,
    157.5,
    180,
    202.5,
    225,
    247.5,
    270,
    292.5,
    315,
    337.5
];
const R20 = [
    0,
    18,
    36,
    54,
    72,
    90,
    108,
    126,
    144,
    162,
    180,
    198,
    216,
    234,
    252,
    270,
    288,
    306,
    324,
    342
];
/** Company org view: ~1.5× stronger field vs prior (blooms + filter in CSS). */ const AMP = 1.5;
const DRIFT = (()=>{
    const d = [];
    for(let l = 0; l <= 100; l += 2.6){
        d.push({
            l,
            t: 1.2 + l % 11 * 0.18
        });
        d.push({
            l,
            t: 98.5 - l % 9 * 0.18
        });
    }
    for(let t = 1.5; t < 98.5; t += 2.1){
        d.push({
            l: 0.4 + t % 7 * 0.11,
            t
        });
        d.push({
            l: 99.3 - t % 7 * 0.11,
            t
        });
    }
    for(let i = 0; i < 95; i++){
        d.push({
            l: 4 + i % 28 * 3.4,
            t: 5 + i % 26 * 3.5
        });
        d.push({
            l: 2.5 + i * 5.7 % 95,
            t: 82 + i % 15
        });
        d.push({
            l: 12 + i * 13 % 76,
            t: 18 + i * 11 % 62
        });
    }
    return d;
})();
const DRIFT_MICRO = (()=>{
    const d = [];
    for(let i = 0; i < 110; i++){
        d.push({
            l: 6 + i * 17.3 % 88,
            t: 8 + i * 23.7 % 84
        });
    }
    return d;
})();
function ChamberAmbientNodeComponent({ data }) {
    const { width: W, height: H, intensity } = data;
    const rm = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>Math.min(W, H) * 0.42, [
        W,
        H
    ]);
    const rings = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>[
            {
                r: rm * 0.09,
                R: R6,
                cls: "adminv2-chamber-spec-a",
                rev: true,
                dur: "adminv2-chamber-ring-fast"
            },
            {
                r: rm * 0.12,
                R: R8,
                cls: "adminv2-chamber-spec-a",
                rev: false,
                dur: "adminv2-chamber-ring-slow"
            },
            {
                r: rm * 0.17,
                R: R10,
                cls: "adminv2-chamber-spec-b",
                rev: true,
                dur: "adminv2-chamber-ring-mid"
            },
            {
                r: rm * 0.22,
                R: R10,
                cls: "adminv2-chamber-spec-b",
                rev: false,
                dur: "adminv2-chamber-ring-mid"
            },
            {
                r: rm * 0.28,
                R: R8,
                cls: "adminv2-chamber-spec-c",
                rev: true,
                dur: "adminv2-chamber-ring-fast"
            },
            {
                r: rm * 0.34,
                R: R8,
                cls: "adminv2-chamber-spec-c",
                rev: false,
                dur: "adminv2-chamber-ring-fast"
            },
            {
                r: rm * 0.4,
                R: R12,
                cls: "adminv2-chamber-spec-d",
                rev: true,
                dur: "adminv2-chamber-ring-slow"
            },
            {
                r: rm * 0.46,
                R: R12,
                cls: "adminv2-chamber-spec-d",
                rev: false,
                dur: "adminv2-chamber-ring-slow"
            },
            {
                r: rm * 0.52,
                R: R10,
                cls: "adminv2-chamber-spec-e",
                rev: true,
                dur: "adminv2-chamber-ring-mid"
            },
            {
                r: rm * 0.58,
                R: R10,
                cls: "adminv2-chamber-spec-e",
                rev: false,
                dur: "adminv2-chamber-ring-mid"
            },
            {
                r: rm * 0.65,
                R: R12,
                cls: "adminv2-chamber-spec-f",
                rev: true,
                dur: "adminv2-chamber-ring-outer"
            },
            {
                r: rm * 0.72,
                R: R12,
                cls: "adminv2-chamber-spec-f",
                rev: false,
                dur: "adminv2-chamber-ring-outer"
            },
            {
                r: rm * 0.79,
                R: R16,
                cls: "adminv2-chamber-spec-g",
                rev: true,
                dur: "adminv2-chamber-ring-horizon"
            },
            {
                r: rm * 0.86,
                R: R16,
                cls: "adminv2-chamber-spec-g",
                rev: false,
                dur: "adminv2-chamber-ring-horizon"
            },
            {
                r: rm * 0.91,
                R: R20,
                cls: "adminv2-chamber-spec-d",
                rev: true,
                dur: "adminv2-chamber-ring-horizon"
            }
        ], [
        rm
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "adminv2-chamber-ambient-anchor nodrag nopan",
        style: {
            width: 1,
            height: 1,
            position: "relative",
            opacity: Math.min(1, Math.max(0.96, intensity) * 1.08)
        },
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "adminv2-chamber-ambient-root",
            style: {
                position: "absolute",
                left: "50%",
                top: "50%",
                width: W,
                height: H,
                marginLeft: -W / 2,
                marginTop: -H / 2
            },
            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "adminv2-chamber-ambient-masked adminv2-chamber-vivid adminv2-chamber-org-amp",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "adminv2-chamber-bloom adminv2-chamber-bloom-1",
                        style: {
                            background: `radial-gradient(ellipse 62% 56% at 42% 44%, rgba(0, 162, 131, ${Math.min(0.72, 0.44 * AMP)}) 0%, rgba(0, 162, 131, ${Math.min(0.45, 0.26 * AMP)}) 26%, rgba(0, 162, 131, ${Math.min(0.2, 0.11 * AMP)}) 50%, transparent 70%)`
                        }
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/canvas/ChamberAmbientNode.tsx",
                        lineNumber: 97,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "adminv2-chamber-bloom adminv2-chamber-bloom-2",
                        style: {
                            background: `radial-gradient(ellipse 56% 62% at 68% 58%, rgba(0, 162, 131, ${Math.min(0.38, 0.22 * AMP)}) 0%, rgba(0, 162, 131, ${Math.min(0.16, 0.09 * AMP)}) 38%, transparent 58%)`
                        }
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/canvas/ChamberAmbientNode.tsx",
                        lineNumber: 103,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "adminv2-chamber-bloom adminv2-chamber-bloom-3",
                        style: {
                            background: `radial-gradient(ellipse 48% 50% at 52% 22%, rgba(0, 162, 131, ${Math.min(0.34, 0.2 * AMP)}) 0%, rgba(0, 120, 100, ${Math.min(0.16, 0.09 * AMP)}) 42%, transparent 55%)`
                        }
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/canvas/ChamberAmbientNode.tsx",
                        lineNumber: 109,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "adminv2-chamber-bloom adminv2-chamber-bloom-4",
                        style: {
                            background: `radial-gradient(ellipse 58% 46% at 28% 78%, rgba(0, 162, 131, ${Math.min(0.52, 0.3 * AMP)}) 0%, rgba(0, 162, 131, ${Math.min(0.18, 0.1 * AMP)}) 40%, transparent 55%)`
                        }
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/canvas/ChamberAmbientNode.tsx",
                        lineNumber: 115,
                        columnNumber: 9
                    }, this),
                    DRIFT.map((p, idx)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "adminv2-chamber-drift",
                            style: {
                                left: `${p.l}%`,
                                top: `${p.t}%`,
                                animationDelay: `${idx % 40 * 0.08}s`
                            }
                        }, `d-${idx}`, false, {
                            fileName: "[project]/app/adminV2/components/canvas/ChamberAmbientNode.tsx",
                            lineNumber: 122,
                            columnNumber: 11
                        }, this)),
                    DRIFT.map((p, idx)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "adminv2-chamber-drift adminv2-chamber-drift-phase2",
                            style: {
                                left: `${(p.l + 3.7) % 100}%`,
                                top: `${(p.t + 2.1) % 100}%`,
                                animationDelay: `${0.4 + idx % 35 * 0.06}s`
                            }
                        }, `d2-${idx}`, false, {
                            fileName: "[project]/app/adminV2/components/canvas/ChamberAmbientNode.tsx",
                            lineNumber: 133,
                            columnNumber: 11
                        }, this)),
                    DRIFT.map((p, idx)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "adminv2-chamber-drift adminv2-chamber-drift-phase3",
                            style: {
                                left: `${(p.l + 11.3) % 100}%`,
                                top: `${(p.t + 7.8) % 100}%`,
                                animationDelay: `${0.2 + idx % 28 * 0.05}s`
                            }
                        }, `d3-${idx}`, false, {
                            fileName: "[project]/app/adminV2/components/canvas/ChamberAmbientNode.tsx",
                            lineNumber: 144,
                            columnNumber: 11
                        }, this)),
                    DRIFT_MICRO.map((p, idx)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "adminv2-chamber-drift adminv2-chamber-drift-micro",
                            style: {
                                left: `${p.l}%`,
                                top: `${p.t}%`,
                                animationDelay: `${idx % 50 * 0.04}s`
                            }
                        }, `dm-${idx}`, false, {
                            fileName: "[project]/app/adminV2/components/canvas/ChamberAmbientNode.tsx",
                            lineNumber: 155,
                            columnNumber: 11
                        }, this)),
                    rings.map((ring, ri)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: `adminv2-chamber-ring ${ring.rev ? "adminv2-chamber-ring-rev" : ""} ${ring.dur}`,
                            "aria-hidden": true,
                            children: ring.R.map((deg)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: ring.cls,
                                    style: {
                                        transform: `rotate(${deg}deg) translateY(-${ring.r}px)`
                                    }
                                }, `${ri}-${deg}`, false, {
                                    fileName: "[project]/app/adminV2/components/canvas/ChamberAmbientNode.tsx",
                                    lineNumber: 172,
                                    columnNumber: 15
                                }, this))
                        }, `ring-${ri}`, false, {
                            fileName: "[project]/app/adminV2/components/canvas/ChamberAmbientNode.tsx",
                            lineNumber: 166,
                            columnNumber: 11
                        }, this))
                ]
            }, void 0, true, {
                fileName: "[project]/app/adminV2/components/canvas/ChamberAmbientNode.tsx",
                lineNumber: 96,
                columnNumber: 7
            }, this)
        }, void 0, false, {
            fileName: "[project]/app/adminV2/components/canvas/ChamberAmbientNode.tsx",
            lineNumber: 84,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/app/adminV2/components/canvas/ChamberAmbientNode.tsx",
        lineNumber: 75,
        columnNumber: 5
    }, this);
}
const __TURBOPACK__default__export__ = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["memo"])(ChamberAmbientNodeComponent);
}),
"[project]/app/adminV2/components/canvas/mockManagers.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "getManagersForDepartment",
    ()=>getManagersForDepartment
]);
const BY_DEPARTMENT = {
    operations: [
        {
            id: "mgr-ops-scheduling",
            departmentKey: "operations",
            name: "Scheduling Manager"
        },
        {
            id: "mgr-ops-dispatch",
            departmentKey: "operations",
            name: "Dispatch Manager"
        },
        {
            id: "mgr-ops-completion",
            departmentKey: "operations",
            name: "Completion Manager"
        }
    ],
    sales: [
        {
            id: "mgr-sales-pipeline",
            departmentKey: "sales",
            name: "Pipeline Manager"
        },
        {
            id: "mgr-sales-followup",
            departmentKey: "sales",
            name: "Follow-Up Manager"
        },
        {
            id: "mgr-sales-conversion",
            departmentKey: "sales",
            name: "Conversion Manager"
        }
    ],
    finance: [
        {
            id: "mgr-fin-billing",
            departmentKey: "finance",
            name: "Billing Manager"
        },
        {
            id: "mgr-fin-collections",
            departmentKey: "finance",
            name: "Collections Manager"
        },
        {
            id: "mgr-fin-reporting",
            departmentKey: "finance",
            name: "Reporting Manager"
        }
    ],
    customerSuccess: [
        {
            id: "mgr-cs-support",
            departmentKey: "customerSuccess",
            name: "Support Manager"
        },
        {
            id: "mgr-cs-success",
            departmentKey: "customerSuccess",
            name: "Success Manager"
        },
        {
            id: "mgr-cs-retention",
            departmentKey: "customerSuccess",
            name: "Retention Manager"
        }
    ],
    aiSystems: [
        {
            id: "mgr-ai-ops",
            departmentKey: "aiSystems",
            name: "Operations AI"
        },
        {
            id: "mgr-ai-dispatch",
            departmentKey: "aiSystems",
            name: "Dispatch AI"
        },
        {
            id: "mgr-ai-billing",
            departmentKey: "aiSystems",
            name: "Billing AI"
        }
    ]
};
function getManagersForDepartment(key) {
    return BY_DEPARTMENT[key];
}
}),
"[project]/app/adminV2/components/canvas/mockManagerStats.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "MOCK_MANAGER_CARD_STATS",
    ()=>MOCK_MANAGER_CARD_STATS,
    "getManagerCardStats",
    ()=>getManagerCardStats
]);
const MOCK_MANAGER_CARD_STATS = {
    "mgr-ops-scheduling": {
        stat1Label: "Jobs scheduled today",
        stat1Value: "38",
        stat2Label: "Avg assignment time",
        stat2Value: "1.8m"
    },
    "mgr-ops-dispatch": {
        stat1Label: "Active dispatches",
        stat1Value: "12",
        stat2Label: "Completion health",
        stat2Value: "Strong"
    },
    "mgr-ops-completion": {
        stat1Label: "Jobs completed",
        stat1Value: "29",
        stat2Label: "Follow-up rate",
        stat2Value: "94%"
    },
    "mgr-sales-pipeline": {
        stat1Label: "Open leads",
        stat1Value: "12",
        stat2Label: "Stage velocity",
        stat2Value: "+8%"
    },
    "mgr-sales-followup": {
        stat1Label: "Follow-ups due",
        stat1Value: "6",
        stat2Label: "Response SLA",
        stat2Value: "96%"
    },
    "mgr-sales-conversion": {
        stat1Label: "Conversion (7d)",
        stat1Value: "24%",
        stat2Label: "Won deals",
        stat2Value: "4"
    },
    "mgr-fin-billing": {
        stat1Label: "Invoices sent",
        stat1Value: "14",
        stat2Label: "Auto-match rate",
        stat2Value: "99%"
    },
    "mgr-fin-collections": {
        stat1Label: "Exceptions open",
        stat1Value: "2",
        stat2Label: "Recovery rate",
        stat2Value: "88%"
    },
    "mgr-fin-reporting": {
        stat1Label: "Reports run",
        stat1Value: "8",
        stat2Label: "Accuracy",
        stat2Value: "100%"
    },
    "mgr-cs-support": {
        stat1Label: "Open tickets",
        stat1Value: "5",
        stat2Label: "First response",
        stat2Value: "12m"
    },
    "mgr-cs-success": {
        stat1Label: "Check-ins sent",
        stat1Value: "22",
        stat2Label: "NPS pulse",
        stat2Value: "72"
    },
    "mgr-cs-retention": {
        stat1Label: "At-risk accounts",
        stat1Value: "3",
        stat2Label: "Save rate",
        stat2Value: "67%"
    },
    "mgr-ai-ops": {
        stat1Label: "Runs (24h)",
        stat1Value: "412",
        stat2Label: "Latency p95",
        stat2Value: "840ms"
    },
    "mgr-ai-dispatch": {
        stat1Label: "Dispatch decisions",
        stat1Value: "156",
        stat2Label: "Override rate",
        stat2Value: "2%"
    },
    "mgr-ai-billing": {
        stat1Label: "Line items parsed",
        stat1Value: "2.1k",
        stat2Label: "Error rate",
        stat2Value: "0.1%"
    }
};
function getManagerCardStats(managerId) {
    return MOCK_MANAGER_CARD_STATS[managerId] ?? {
        stat1Label: "Throughput",
        stat1Value: "—",
        stat2Label: "Health",
        stat2Value: "OK"
    };
}
}),
"[project]/app/adminV2/components/canvas/SystemCanvas.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>SystemCanvas
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$reactflow$2f$core$2f$dist$2f$esm$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@reactflow/core/dist/esm/index.mjs [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$reactflow$2f$background$2f$dist$2f$esm$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@reactflow/background/dist/esm/index.mjs [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$reactflow$2f$controls$2f$dist$2f$esm$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@reactflow/controls/dist/esm/index.mjs [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$reactflow$2f$minimap$2f$dist$2f$esm$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@reactflow/minimap/dist/esm/index.mjs [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/styles/tokens/colors.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$canvas$2f$DepartmentNode$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/adminV2/components/canvas/DepartmentNode.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$canvas$2f$ActionPanelNode$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/adminV2/components/canvas/ActionPanelNode.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$canvas$2f$ManagerNode$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/adminV2/components/canvas/ManagerNode.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$canvas$2f$AmbientFocusNode$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/adminV2/components/canvas/AmbientFocusNode.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$canvas$2f$ChamberAmbientNode$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/adminV2/components/canvas/ChamberAmbientNode.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$canvas$2f$canvasLayout$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/adminV2/components/canvas/canvasLayout.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$canvas$2f$mockDepartments$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/adminV2/components/canvas/mockDepartments.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$canvas$2f$mockDepartmentActions$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/adminV2/components/canvas/mockDepartmentActions.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$canvas$2f$mockManagers$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/adminV2/components/canvas/mockManagers.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$canvas$2f$mockManagerStats$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/adminV2/components/canvas/mockManagerStats.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$canvas$2f$ambientTiers$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/adminV2/components/canvas/ambientTiers.ts [app-ssr] (ecmascript)");
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
const ACTIVATION_MS = 160;
/** Single coherent camera move into department (no prior recenter) */ const DEPARTMENT_ENTER_MS = 720;
const AMBIENT_FADE_DELAY_MS = 2200;
const PROOF_MANAGER_LIMIT = 2;
const AMBIENT_FOCUS_SIZE = 1120;
const AMBIENT_FOCUS_HALF = AMBIENT_FOCUS_SIZE / 2;
const ACTION_PANEL_HEIGHT_ESTIMATE = 280;
function deptCenterFromId(id, layout) {
    const idx = __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$canvas$2f$mockDepartments$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["MOCK_DEPARTMENTS"].findIndex((d)=>d.id === id);
    if (idx < 0) return null;
    const p = (0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$canvas$2f$canvasLayout$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getDepartmentPosition"])(idx, layout);
    const W = layout.COMPANY_DEPT_NODE_WIDTH;
    const H = layout.COMPANY_DEPT_NODE_HEIGHT;
    return {
        x: p.x + W / 2,
        y: p.y + H / 2
    };
}
const MANAGER_GAP = 64;
const MANAGER_Y_OFFSET = 56;
function getManagerPositions(count, centerAt) {
    const totalWidth = count * __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$canvas$2f$ManagerNode$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["MANAGER_CARD_WIDTH"] + (count - 1) * MANAGER_GAP;
    const startX = centerAt ? centerAt.x - totalWidth / 2 + __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$canvas$2f$ManagerNode$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["MANAGER_CARD_WIDTH"] / 2 : 100;
    const y = centerAt ? centerAt.y + MANAGER_Y_OFFSET : 120;
    const positions = [];
    for(let i = 0; i < count; i++){
        positions.push({
            x: startX + i * (__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$canvas$2f$ManagerNode$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["MANAGER_CARD_WIDTH"] + MANAGER_GAP),
            y
        });
    }
    return positions;
}
function managerClusterCenter(count, centerAt) {
    const positions = getManagerPositions(count, centerAt);
    if (positions.length === 0) return {
        x: 320,
        y: 280
    };
    const midY = positions[0].y + 124;
    const cx = (positions[0].x + positions[positions.length - 1].x + __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$canvas$2f$ManagerNode$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["MANAGER_CARD_WIDTH"]) / 2;
    return {
        x: cx,
        y: midY
    };
}
/** Ambient anchor below manager card faces — specs orbit dark gap, not white tiles */ function ambientFocusAnchorBehindCards(count, focusAnchor, layout) {
    const mc = managerClusterCenter(count, focusAnchor);
    const deptW = layout.COMPANY_DEPT_NODE_WIDTH;
    const deptCx = focusAnchor.x + deptW / 2;
    return {
        x: mc.x * 0.72 + deptCx * 0.28,
        y: mc.y + 155
    };
}
function managersForProof(key) {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$canvas$2f$mockManagers$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getManagersForDepartment"])(key).slice(0, PROOF_MANAGER_LIMIT);
}
/** Exposes React Flow's screenToFlowPosition to parent (must be inside ReactFlowProvider). */ function SetScreenToFlowRef({ projectRef }) {
    const { screenToFlowPosition } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$reactflow$2f$core$2f$dist$2f$esm$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useReactFlow"])();
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        projectRef.current = screenToFlowPosition;
        return ()=>{
            projectRef.current = null;
        };
    }, [
        screenToFlowPosition,
        projectRef
    ]);
    return null;
}
/** One smooth move from current viewport → department operating view */ function DepartmentEnterRunner({ active, focusAnchor, managerCount, departmentKey, layout }) {
    const { setCenter } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$reactflow$2f$core$2f$dist$2f$esm$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useReactFlow"])();
    const ranKeyRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (!active) {
            ranKeyRef.current = null;
            return;
        }
        if (!focusAnchor || managerCount < 1 || !departmentKey) {
            return;
        }
        const runKey = `${departmentKey}-${focusAnchor.x}-${focusAnchor.y}`;
        if (ranKeyRef.current === runKey) return;
        const c = managerClusterCenter(managerCount, focusAnchor);
        const deptW = layout.COMPANY_DEPT_NODE_WIDTH;
        const deptH = layout.COMPANY_DEPT_NODE_HEIGHT;
        const deptCy = focusAnchor.y + deptH / 2;
        const blendY = deptCy * 0.2 + c.y * 0.8;
        const blendX = focusAnchor.x + deptW / 2;
        const cx = blendX * 0.26 + c.x * 0.74;
        const cy = blendY;
        let cancelled = false;
        const id = window.requestAnimationFrame(()=>{
            window.requestAnimationFrame(()=>{
                if (cancelled) return;
                setCenter(cx, cy, {
                    zoom: 1.58,
                    duration: DEPARTMENT_ENTER_MS,
                    interpolate: "smooth"
                });
                ranKeyRef.current = runKey;
            });
        });
        return ()=>{
            cancelled = true;
            window.cancelAnimationFrame(id);
        };
    }, [
        active,
        focusAnchor,
        managerCount,
        departmentKey,
        layout,
        setCenter
    ]);
    return null;
}
function FitCompanyView({ zoomLevel, fitViewPadding }) {
    const { fitView } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$reactflow$2f$core$2f$dist$2f$esm$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useReactFlow"])();
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (zoomLevel !== "company") return;
        const id = window.setTimeout(()=>{
            fitView({
                padding: fitViewPadding,
                duration: 420,
                maxZoom: 2.05,
                minZoom: 0.26,
                nodes: __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$canvas$2f$mockDepartments$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["MOCK_DEPARTMENTS"].map((d)=>({
                        id: d.id
                    }))
            });
        }, 0);
        return ()=>clearTimeout(id);
    }, [
        zoomLevel,
        fitView,
        fitViewPadding
    ]);
    return null;
}
const PANEL_OFFSET_BELOW_BUTTON = 8;
const nodeTypes = {
    department: __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$canvas$2f$DepartmentNode$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"],
    actionPanel: __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$canvas$2f$ActionPanelNode$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"],
    manager: __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$canvas$2f$ManagerNode$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"],
    ambientFocus: __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$canvas$2f$AmbientFocusNode$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"],
    chamberAmbient: __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$canvas$2f$ChamberAmbientNode$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"]
};
const AMBIENT_ID = "__ambient_focus__";
const AMBIENT_CHAMBER = "__ambient_chamber__";
function isAmbientNodeId(id) {
    return id === AMBIENT_ID || id === AMBIENT_CHAMBER;
}
function SystemCanvas({ zoomLevel, selectedDepartmentKey, selectedNodeId, onDepartmentClick, onNodeSelect }) {
    const [activatingDepartmentId, setActivatingDepartmentId] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [ambientIntensity, setAmbientIntensity] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$canvas$2f$ambientTiers$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AMBIENT_FOCUS_INITIAL"]);
    const selectedNodeIdRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(selectedNodeId);
    selectedNodeIdRef.current = selectedNodeId;
    const ambientFadeTimerRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const [mapToolsOpen, setMapToolsOpen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [activeAction, setActiveAction] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const screenToFlowRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const canvasContainerRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const [viewportWidth, setViewportWidth] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(()=>("TURBOPACK compile-time falsy", 0) ? "TURBOPACK unreachable" : 1920);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        const onResize = ()=>setViewportWidth(window.innerWidth);
        window.addEventListener("resize", onResize);
        return ()=>window.removeEventListener("resize", onResize);
    }, []);
    const layout = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$canvas$2f$canvasLayout$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getResponsiveLayout"])(viewportWidth), [
        viewportWidth
    ]);
    const pendingZoomRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const lastZoomedPositionRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const [focusAnchor, setFocusAnchor] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (zoomLevel === "company") {
            setFocusAnchor(null);
            if (ambientFadeTimerRef.current != null) {
                window.clearTimeout(ambientFadeTimerRef.current);
                ambientFadeTimerRef.current = null;
            }
            setAmbientIntensity(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$canvas$2f$ambientTiers$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AMBIENT_FOCUS_INITIAL"]);
        }
    }, [
        zoomLevel
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (!activatingDepartmentId || !pendingZoomRef.current) return;
        const pending = pendingZoomRef.current;
        const t = window.setTimeout(()=>{
            lastZoomedPositionRef.current = pending.position;
            setFocusAnchor(pending.position);
            setActivatingDepartmentId(null);
            setAmbientIntensity(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$canvas$2f$ambientTiers$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AMBIENT_FOCUS_DEPARTMENT_ENTER"]);
            if (ambientFadeTimerRef.current != null) {
                window.clearTimeout(ambientFadeTimerRef.current);
            }
            ambientFadeTimerRef.current = window.setTimeout(()=>{
                ambientFadeTimerRef.current = null;
                setAmbientIntensity((0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$canvas$2f$ambientTiers$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["isManagerAmbientNodeId"])(selectedNodeIdRef.current) ? __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$canvas$2f$ambientTiers$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AMBIENT_FOCUS_MANAGER_STEADY"] : __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$canvas$2f$ambientTiers$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AMBIENT_FOCUS_DEPARTMENT_STEADY"]);
            }, AMBIENT_FADE_DELAY_MS);
            setMapToolsOpen(false);
            onDepartmentClick(pending.key);
            onNodeSelect(pending.nodeId);
            pendingZoomRef.current = null;
        }, ACTIVATION_MS);
        return ()=>clearTimeout(t);
    }, [
        activatingDepartmentId,
        onDepartmentClick,
        onNodeSelect
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (zoomLevel !== "department" || !selectedDepartmentKey) return;
        if ((0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$canvas$2f$ambientTiers$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["isManagerAmbientNodeId"])(selectedNodeId)) {
            setAmbientIntensity(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$canvas$2f$ambientTiers$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AMBIENT_FOCUS_MANAGER_STEADY"]);
        } else if (selectedNodeId === null) {
            setAmbientIntensity(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$canvas$2f$ambientTiers$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AMBIENT_FOCUS_DEPARTMENT_STEADY"]);
        }
    }, [
        selectedNodeId,
        zoomLevel,
        selectedDepartmentKey
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (activatingDepartmentId) setAmbientIntensity(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$canvas$2f$ambientTiers$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AMBIENT_FOCUS_ACTIVATING"]);
    }, [
        activatingDepartmentId
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (zoomLevel === "company") setMapToolsOpen(false);
    }, [
        zoomLevel
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (!activeAction) return;
        const onKey = (e)=>{
            if (e.key === "Escape") setActiveAction(null);
        };
        window.addEventListener("keydown", onKey);
        return ()=>window.removeEventListener("keydown", onKey);
    }, [
        activeAction
    ]);
    const onQuickActionClick = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((nodeId, actionId, event)=>{
        const rect = event.currentTarget.getBoundingClientRect();
        const clickX = rect.left + rect.width / 2;
        const clickY = rect.bottom;
        const screenToFlow = screenToFlowRef.current;
        if (!screenToFlow) return;
        const flowPoint = screenToFlow({
            x: clickX,
            y: clickY
        });
        const panelW = layout.actionPanelWidth;
        let flowX = flowPoint.x - panelW / 2;
        let flowY = flowPoint.y + PANEL_OFFSET_BELOW_BUTTON;
        const container = canvasContainerRef.current;
        if (container) {
            const vr = container.getBoundingClientRect();
            const flowTL = screenToFlow({
                x: vr.left,
                y: vr.top
            });
            const flowBR = screenToFlow({
                x: vr.right,
                y: vr.bottom
            });
            flowX = Math.max(flowTL.x, Math.min(flowBR.x - panelW, flowX));
            flowY = Math.max(flowTL.y, Math.min(flowBR.y - ACTION_PANEL_HEIGHT_ESTIMATE, flowY));
        }
        setActiveAction({
            nodeId,
            actionId,
            flowPosition: {
                x: flowX,
                y: flowY
            }
        });
    }, [
        layout.actionPanelWidth
    ]);
    const ambientVariant = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        if (zoomLevel === "department" && selectedDepartmentKey) return "focus";
        if (activatingDepartmentId != null) return "focus";
        return "company";
    }, [
        zoomLevel,
        selectedDepartmentKey,
        activatingDepartmentId
    ]);
    const ambientCenter = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        if (zoomLevel === "department" && selectedDepartmentKey) {
            const n = managersForProof(selectedDepartmentKey).length;
            const pos = lastZoomedPositionRef.current;
            const fallback = pos ?? (()=>{
                const idx = __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$canvas$2f$mockDepartments$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["MOCK_DEPARTMENTS"].findIndex((d)=>d.key === selectedDepartmentKey);
                return idx >= 0 ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$canvas$2f$canvasLayout$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getDepartmentPosition"])(idx, layout) : {
                    x: 120,
                    y: 80
                };
            })();
            return ambientFocusAnchorBehindCards(n, fallback, layout);
        }
        if (activatingDepartmentId) {
            return deptCenterFromId(activatingDepartmentId, layout);
        }
        if (zoomLevel === "company") {
            return (0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$canvas$2f$canvasLayout$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getCompanyGridCenter"])(layout);
        }
        return null;
    }, [
        zoomLevel,
        selectedDepartmentKey,
        activatingDepartmentId,
        layout
    ]);
    const ambientHalf = AMBIENT_FOCUS_HALF;
    const ambientIntensityForNode = ambientIntensity;
    const focusAmbientTier = zoomLevel === "department" && (0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$canvas$2f$ambientTiers$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["isManagerAmbientNodeId"])(selectedNodeId) ? "manager" : "department";
    const ambientNodes = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        const companyIdle = zoomLevel === "company" && activatingDepartmentId == null;
        if (companyIdle) {
            const rect = (0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$canvas$2f$canvasLayout$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getCompanyChamberAmbientRect"])(layout);
            const cx = rect.x + rect.width / 2;
            const cy = rect.y + rect.height / 2;
            /* 1×1 flow bounds so fitView / controls don’t zoom to the full ambient rect */ return [
                {
                    id: AMBIENT_CHAMBER,
                    type: "chamberAmbient",
                    position: {
                        x: cx - 0.5,
                        y: cy - 0.5
                    },
                    width: 1,
                    height: 1,
                    draggable: false,
                    selectable: false,
                    className: "adminv2-rf-ambient adminv2-rf-chamber-ambient",
                    zIndex: 0,
                    style: {
                        width: 1,
                        height: 1
                    },
                    data: {
                        intensity: __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$canvas$2f$ambientTiers$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AMBIENT_CHAMBER_INTENSITY"],
                        width: rect.width,
                        height: rect.height
                    }
                }
            ];
        }
        if (!ambientCenter) return [];
        const base = {
            type: "ambientFocus",
            draggable: false,
            selectable: false,
            className: "adminv2-rf-ambient",
            zIndex: 0
        };
        return [
            {
                id: AMBIENT_ID,
                ...base,
                position: {
                    x: ambientCenter.x - ambientHalf,
                    y: ambientCenter.y - ambientHalf
                },
                data: {
                    intensity: ambientIntensityForNode,
                    variant: ambientVariant,
                    focusTier: focusAmbientTier
                }
            }
        ];
    }, [
        ambientCenter,
        ambientHalf,
        ambientIntensityForNode,
        ambientVariant,
        focusAmbientTier,
        zoomLevel,
        activatingDepartmentId,
        layout
    ]);
    const departmentNodes = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$canvas$2f$mockDepartments$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["MOCK_DEPARTMENTS"].map((d, i)=>{
            const actions = __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$canvas$2f$mockDepartmentActions$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["MOCK_DEPARTMENT_ACTIONS"][d.key];
            return {
                id: d.id,
                type: "department",
                position: (0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$canvas$2f$canvasLayout$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getCompanyDepartmentDisplayPosition"])(i, layout),
                data: {
                    name: d.name,
                    departmentKey: d.key,
                    primaryKpi: d.primaryKpi,
                    primaryValue: d.primaryValue,
                    secondaryKpi: d.secondaryKpi,
                    secondaryValue: d.secondaryValue,
                    compact1Label: d.compact1Label,
                    compact1Value: d.compact1Value,
                    compact2Label: d.compact2Label,
                    compact2Value: d.compact2Value,
                    health: d.health,
                    alertCount: d.alertCount,
                    zoomingOut: activatingDepartmentId != null && activatingDepartmentId !== d.id,
                    activating: activatingDepartmentId === d.id,
                    quickActions: actions?.quickActions,
                    nextBestAction: actions?.nextBestAction,
                    isPriority: actions?.isPriority,
                    onQuickActionClick,
                    tileWidth: layout.COMPANY_GRID_DEPT_WIDTH,
                    tileHeight: layout.COMPANY_GRID_DEPT_HEIGHT,
                    cardPad: layout.CARD_PAD,
                    primarySignal: d.primarySignal,
                    secondaryContext: d.secondaryContext,
                    agentSummary: d.agentSummary,
                    agentRollup: d.agentRollup,
                    agentStates: d.agentStates,
                    topPerformer: d.topPerformer
                },
                draggable: !activatingDepartmentId,
                selected: selectedNodeId === d.id,
                zIndex: 60,
                className: "adminv2-rf-foreground"
            };
        }), [
        selectedNodeId,
        activatingDepartmentId,
        onQuickActionClick,
        layout
    ]);
    const managerNodes = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        if (!selectedDepartmentKey) return [];
        const managers = managersForProof(selectedDepartmentKey);
        const centerAt = lastZoomedPositionRef.current;
        const positions = getManagerPositions(managers.length, centerAt);
        return managers.map((m, i)=>{
            const stats = (0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$canvas$2f$mockManagerStats$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getManagerCardStats"])(m.id);
            return {
                id: m.id,
                type: "manager",
                position: positions[i],
                data: {
                    name: m.name,
                    departmentKey: m.departmentKey,
                    stat1Label: stats.stat1Label,
                    stat1Value: stats.stat1Value,
                    stat2Label: stats.stat2Label,
                    stat2Value: stats.stat2Value,
                    enterStaggerMs: i * 64
                },
                draggable: true,
                selected: selectedNodeId === m.id,
                zIndex: 500,
                className: "adminv2-rf-foreground adminv2-rf-manager"
            };
        });
    }, [
        selectedDepartmentKey,
        selectedNodeId
    ]);
    const contentNodes = zoomLevel === "company" ? departmentNodes : managerNodes;
    const actionPanelNode = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        if (!activeAction || zoomLevel !== "company") return null;
        const content = (0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$canvas$2f$mockDepartmentActions$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getActionPanelContent"])(activeAction.actionId);
        const title = content?.title ?? "Action";
        const description = content?.description ?? "";
        const records = content?.records ?? [];
        const primaryLabel = content?.primaryLabel ?? "OK";
        const secondaryLabel = content?.secondaryLabel;
        return {
            id: "__action_panel__",
            type: "actionPanel",
            position: activeAction.flowPosition,
            data: {
                title,
                description,
                records,
                primaryLabel,
                secondaryLabel,
                panelWidth: layout.actionPanelWidth,
                onClose: ()=>setActiveAction(null)
            },
            draggable: false,
            selectable: false,
            zIndex: 300,
            className: "adminv2-rf-foreground"
        };
    }, [
        activeAction,
        zoomLevel,
        layout.actionPanelWidth
    ]);
    const nodes = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        const list = [
            ...ambientNodes,
            ...contentNodes
        ];
        if (actionPanelNode) list.push(actionPanelNode);
        return list;
    }, [
        ambientNodes,
        contentNodes,
        actionPanelNode
    ]);
    const [nodesState, setNodes, onNodesChange] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$reactflow$2f$core$2f$dist$2f$esm$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useNodesState"])(nodes);
    const [edges, , onEdgesChange] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$reactflow$2f$core$2f$dist$2f$esm$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEdgesState"])([]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        setNodes(nodes);
    }, [
        nodes,
        setNodes
    ]);
    const onNodeClick = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((_, node)=>{
        if (node.id === "__action_panel__") return;
        setActiveAction(null);
        if (isAmbientNodeId(node.id)) return;
        if (activatingDepartmentId) return;
        if (node.type === "department" && zoomLevel === "company") {
            const idx = __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$canvas$2f$mockDepartments$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["MOCK_DEPARTMENTS"].findIndex((d)=>d.id === node.id);
            pendingZoomRef.current = {
                nodeId: node.id,
                key: node.data.departmentKey,
                position: idx >= 0 ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$canvas$2f$canvasLayout$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getDepartmentPosition"])(idx, layout) : node.position
            };
            setActivatingDepartmentId(node.id);
        } else {
            onNodeSelect(node.id);
        }
    }, [
        zoomLevel,
        onNodeSelect,
        activatingDepartmentId,
        layout
    ]);
    const onPaneClick = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(()=>{
        setActiveAction(null);
        if (!activatingDepartmentId) onNodeSelect(null);
    }, [
        onNodeSelect,
        activatingDepartmentId
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        ref: canvasContainerRef,
        className: "w-full h-full relative overflow-hidden",
        style: {
            backgroundColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].canvasChamberBase,
            backgroundImage: `
          radial-gradient(ellipse 84% 50% at 44% 30%, ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].canvasChamberBlueMist} 0%, transparent 56%),
          radial-gradient(ellipse 56% 44% at 76% 62%, ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].canvasChamberPineDrift} 0%, transparent 58%),
          radial-gradient(ellipse 100% 72% at 50% 112%, ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].canvasChamberVignetteEdge} 0%, transparent 46%),
          linear-gradient(168deg, ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].canvasChamberDeep} 0%, ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].canvasChamberBase} 42%, ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].canvasChamberDeep} 100%)
        `
        },
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$reactflow$2f$core$2f$dist$2f$esm$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ReactFlowProvider"], {
            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$reactflow$2f$core$2f$dist$2f$esm$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ReactFlow"], {
                className: "w-full h-full",
                nodes: nodesState,
                edges: edges,
                onNodesChange: onNodesChange,
                onEdgesChange: onEdgesChange,
                nodeTypes: nodeTypes,
                onNodeClick: onNodeClick,
                onPaneClick: onPaneClick,
                minZoom: 0.1,
                maxZoom: 2.35,
                defaultViewport: {
                    x: 0,
                    y: 0,
                    zoom: 1
                },
                proOptions: {
                    hideAttribution: true
                },
                fitView: false,
                fitViewOptions: {
                    padding: 0.28,
                    duration: 0
                },
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$reactflow$2f$background$2f$dist$2f$esm$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Background"], {
                        variant: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$reactflow$2f$background$2f$dist$2f$esm$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["BackgroundVariant"].Dots,
                        gap: 26,
                        size: 1.35,
                        color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].canvasChamberGridDot
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/canvas/SystemCanvas.tsx",
                        lineNumber: 642,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(SetScreenToFlowRef, {
                        projectRef: screenToFlowRef
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/canvas/SystemCanvas.tsx",
                        lineNumber: 648,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(FitCompanyView, {
                        zoomLevel: zoomLevel,
                        fitViewPadding: layout.fitViewPadding
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/canvas/SystemCanvas.tsx",
                        lineNumber: 649,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(DepartmentEnterRunner, {
                        active: zoomLevel === "department" && selectedDepartmentKey != null,
                        focusAnchor: focusAnchor,
                        managerCount: selectedDepartmentKey ? managersForProof(selectedDepartmentKey).length : 0,
                        departmentKey: selectedDepartmentKey,
                        layout: layout
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/canvas/SystemCanvas.tsx",
                        lineNumber: 650,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "pointer-events-none",
                        style: {
                            position: "absolute",
                            right: 10,
                            bottom: 10,
                            zIndex: 220,
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "flex-end"
                        },
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "pointer-events-auto",
                            children: [
                                mapToolsOpen && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "adminv2-canvas-tools-tray",
                                    style: {
                                        borderColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].border,
                                        backgroundColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].surface
                                    },
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            style: {
                                                display: "flex",
                                                justifyContent: "space-between",
                                                alignItems: "center",
                                                marginBottom: 4
                                            },
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    style: {
                                                        fontSize: 10,
                                                        fontWeight: 700,
                                                        color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].textSecondary,
                                                        textTransform: "none",
                                                        letterSpacing: "0.08em"
                                                    },
                                                    children: "Overview"
                                                }, void 0, false, {
                                                    fileName: "[project]/app/adminV2/components/canvas/SystemCanvas.tsx",
                                                    lineNumber: 688,
                                                    columnNumber: 21
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                    type: "button",
                                                    onClick: ()=>setMapToolsOpen(false),
                                                    style: {
                                                        fontSize: 11,
                                                        fontWeight: 600,
                                                        color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["brand"].primary,
                                                        background: "none",
                                                        border: "none",
                                                        cursor: "pointer",
                                                        padding: "2px 6px"
                                                    },
                                                    children: "Close"
                                                }, void 0, false, {
                                                    fileName: "[project]/app/adminV2/components/canvas/SystemCanvas.tsx",
                                                    lineNumber: 699,
                                                    columnNumber: 21
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/app/adminV2/components/canvas/SystemCanvas.tsx",
                                            lineNumber: 680,
                                            columnNumber: 19
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$reactflow$2f$minimap$2f$dist$2f$esm$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["MiniMap"], {
                                            nodeColor: (n)=>isAmbientNodeId(n.id) ? "transparent" : __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].border,
                                            maskColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].maskOverlay,
                                            style: {
                                                width: 168,
                                                height: 96,
                                                backgroundColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].surface
                                            }
                                        }, void 0, false, {
                                            fileName: "[project]/app/adminV2/components/canvas/SystemCanvas.tsx",
                                            lineNumber: 715,
                                            columnNumber: 19
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            style: {
                                                borderColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].border,
                                                borderWidth: 1,
                                                borderStyle: "solid",
                                                borderRadius: 8,
                                                overflow: "hidden"
                                            },
                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$reactflow$2f$controls$2f$dist$2f$esm$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Controls"], {
                                                showInteractive: false
                                            }, void 0, false, {
                                                fileName: "[project]/app/adminV2/components/canvas/SystemCanvas.tsx",
                                                lineNumber: 733,
                                                columnNumber: 21
                                            }, this)
                                        }, void 0, false, {
                                            fileName: "[project]/app/adminV2/components/canvas/SystemCanvas.tsx",
                                            lineNumber: 724,
                                            columnNumber: 19
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/app/adminV2/components/canvas/SystemCanvas.tsx",
                                    lineNumber: 673,
                                    columnNumber: 17
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    className: "adminv2-canvas-tools-fab",
                                    style: {
                                        borderColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].border,
                                        backgroundColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].surface,
                                        boxShadow: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].cardShadow
                                    },
                                    "aria-expanded": mapToolsOpen,
                                    "aria-label": mapToolsOpen ? "Hide map and zoom controls" : "Show map and zoom controls",
                                    onClick: ()=>setMapToolsOpen((o)=>!o),
                                    children: mapToolsOpen ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
                                        width: "14",
                                        height: "14",
                                        viewBox: "0 0 24 24",
                                        fill: "none",
                                        "aria-hidden": true,
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                                            d: "M6 6l12 12M18 6L6 18",
                                            stroke: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["brand"].primary,
                                            strokeWidth: 2.2,
                                            strokeLinecap: "round"
                                        }, void 0, false, {
                                            fileName: "[project]/app/adminV2/components/canvas/SystemCanvas.tsx",
                                            lineNumber: 751,
                                            columnNumber: 21
                                        }, this)
                                    }, void 0, false, {
                                        fileName: "[project]/app/adminV2/components/canvas/SystemCanvas.tsx",
                                        lineNumber: 750,
                                        columnNumber: 19
                                    }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
                                        width: "14",
                                        height: "14",
                                        viewBox: "0 0 24 24",
                                        fill: "none",
                                        "aria-hidden": true,
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                                            d: "M4 10h4V6H4v4zm6 10h4v-4h-4v4zm0-10h10v4H10V10zM4 20h4v-4H4v4z",
                                            fill: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["brand"].primary,
                                            opacity: 0.85
                                        }, void 0, false, {
                                            fileName: "[project]/app/adminV2/components/canvas/SystemCanvas.tsx",
                                            lineNumber: 760,
                                            columnNumber: 21
                                        }, this)
                                    }, void 0, false, {
                                        fileName: "[project]/app/adminV2/components/canvas/SystemCanvas.tsx",
                                        lineNumber: 759,
                                        columnNumber: 19
                                    }, this)
                                }, void 0, false, {
                                    fileName: "[project]/app/adminV2/components/canvas/SystemCanvas.tsx",
                                    lineNumber: 737,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/app/adminV2/components/canvas/SystemCanvas.tsx",
                            lineNumber: 671,
                            columnNumber: 13
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/canvas/SystemCanvas.tsx",
                        lineNumber: 659,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/app/adminV2/components/canvas/SystemCanvas.tsx",
                lineNumber: 626,
                columnNumber: 9
            }, this)
        }, void 0, false, {
            fileName: "[project]/app/adminV2/components/canvas/SystemCanvas.tsx",
            lineNumber: 625,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/app/adminV2/components/canvas/SystemCanvas.tsx",
        lineNumber: 612,
        columnNumber: 5
    }, this);
}
}),
"[project]/app/adminV2/components/records/mockRecordsData.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "MOCK_AI_SYSTEMS_COLUMNS",
    ()=>MOCK_AI_SYSTEMS_COLUMNS,
    "MOCK_AI_SYSTEMS_RECORDS",
    ()=>MOCK_AI_SYSTEMS_RECORDS,
    "MOCK_COMPANY_COLUMNS",
    ()=>MOCK_COMPANY_COLUMNS,
    "MOCK_COMPANY_RECORDS",
    ()=>MOCK_COMPANY_RECORDS,
    "MOCK_CUSTOMER_SUCCESS_COLUMNS",
    ()=>MOCK_CUSTOMER_SUCCESS_COLUMNS,
    "MOCK_CUSTOMER_SUCCESS_RECORDS",
    ()=>MOCK_CUSTOMER_SUCCESS_RECORDS,
    "MOCK_FINANCE_COLUMNS",
    ()=>MOCK_FINANCE_COLUMNS,
    "MOCK_FINANCE_RECORDS",
    ()=>MOCK_FINANCE_RECORDS,
    "MOCK_OPERATIONS_RECORDS",
    ()=>MOCK_OPERATIONS_RECORDS,
    "MOCK_SALES_COLUMNS",
    ()=>MOCK_SALES_COLUMNS,
    "MOCK_SALES_RECORDS",
    ()=>MOCK_SALES_RECORDS,
    "getRecordsForScope",
    ()=>getRecordsForScope
]);
const MOCK_COMPANY_RECORDS = [
    {
        id: "4821",
        customer: "Johnson",
        technician: "Mike",
        status: "Scheduled",
        time: "10:00",
        pct: "65%"
    },
    {
        id: "4822",
        customer: "Adams",
        technician: "Sarah",
        status: "In Progress",
        time: "11:30",
        pct: "30%"
    },
    {
        id: "4819",
        customer: "Lee",
        technician: "Mike",
        status: "Completed",
        time: "09:00",
        pct: "100%"
    }
];
const MOCK_COMPANY_COLUMNS = [
    {
        key: "id",
        label: "Job ID"
    },
    {
        key: "customer",
        label: "Customer"
    },
    {
        key: "technician",
        label: "Technician"
    },
    {
        key: "status",
        label: "Status"
    },
    {
        key: "time",
        label: "Scheduled Time"
    },
    {
        key: "pct",
        label: "Completion %"
    }
];
const MOCK_OPERATIONS_RECORDS = [
    {
        id: "4821",
        customer: "Johnson",
        technician: "Mike",
        status: "Scheduled",
        time: "10:00",
        pct: "65%"
    },
    {
        id: "4822",
        customer: "Adams",
        technician: "Sarah",
        status: "In Progress",
        time: "11:30",
        pct: "30%"
    },
    {
        id: "4823",
        customer: "Brown",
        technician: "Mike",
        status: "Scheduled",
        time: "14:00",
        pct: "0%"
    }
];
const MOCK_FINANCE_RECORDS = [
    {
        id: "INV-1033",
        customer: "Johnson",
        amount: "$240",
        status: "Paid",
        due: "Mar 10"
    },
    {
        id: "INV-1034",
        customer: "Adams",
        amount: "$180",
        status: "Open",
        due: "Mar 15"
    }
];
const MOCK_FINANCE_COLUMNS = [
    {
        key: "id",
        label: "Invoice"
    },
    {
        key: "customer",
        label: "Customer"
    },
    {
        key: "amount",
        label: "Amount"
    },
    {
        key: "status",
        label: "Status"
    },
    {
        key: "due",
        label: "Due"
    }
];
const MOCK_SALES_RECORDS = [
    {
        id: "P1",
        name: "Johnson",
        stage: "Proposal",
        value: "$480"
    },
    {
        id: "P2",
        name: "Adams",
        stage: "Follow-up",
        value: "$320"
    }
];
const MOCK_SALES_COLUMNS = [
    {
        key: "id",
        label: "Lead"
    },
    {
        key: "name",
        label: "Name"
    },
    {
        key: "stage",
        label: "Stage"
    },
    {
        key: "value",
        label: "Value"
    }
];
const MOCK_CUSTOMER_SUCCESS_RECORDS = [
    {
        id: "C-882",
        customer: "Johnson",
        status: "Open",
        sla: "2h"
    }
];
const MOCK_CUSTOMER_SUCCESS_COLUMNS = [
    {
        key: "id",
        label: "Case"
    },
    {
        key: "customer",
        label: "Customer"
    },
    {
        key: "status",
        label: "Status"
    },
    {
        key: "sla",
        label: "SLA"
    }
];
const MOCK_AI_SYSTEMS_RECORDS = [
    {
        id: "run-1",
        workflow: "Schedule Assign",
        status: "Success",
        time: "2m ago"
    },
    {
        id: "run-2",
        workflow: "Invoice Send",
        status: "Success",
        time: "5m ago"
    }
];
const MOCK_AI_SYSTEMS_COLUMNS = [
    {
        key: "id",
        label: "Run"
    },
    {
        key: "workflow",
        label: "Workflow"
    },
    {
        key: "status",
        label: "Status"
    },
    {
        key: "time",
        label: "Time"
    }
];
function getRecordsForScope(scope) {
    if (scope.level === "company") {
        return {
            columns: MOCK_COMPANY_COLUMNS,
            rows: MOCK_COMPANY_RECORDS
        };
    }
    switch(scope.key){
        case "operations":
            return {
                columns: MOCK_COMPANY_COLUMNS,
                rows: MOCK_OPERATIONS_RECORDS
            };
        case "finance":
            return {
                columns: MOCK_FINANCE_COLUMNS,
                rows: MOCK_FINANCE_RECORDS
            };
        case "sales":
            return {
                columns: MOCK_SALES_COLUMNS,
                rows: MOCK_SALES_RECORDS
            };
        case "customerSuccess":
            return {
                columns: MOCK_CUSTOMER_SUCCESS_COLUMNS,
                rows: MOCK_CUSTOMER_SUCCESS_RECORDS
            };
        case "aiSystems":
            return {
                columns: MOCK_AI_SYSTEMS_COLUMNS,
                rows: MOCK_AI_SYSTEMS_RECORDS
            };
        default:
            return {
                columns: MOCK_COMPANY_COLUMNS,
                rows: MOCK_COMPANY_RECORDS
            };
    }
}
}),
"[project]/app/adminV2/components/records/RecordsPanel.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>RecordsPanel
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/styles/tokens/colors.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$records$2f$mockRecordsData$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/adminV2/components/records/mockRecordsData.ts [app-ssr] (ecmascript)");
"use client";
;
;
;
function RecordsPanel({ scope, title, embedded }) {
    const { columns, rows } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$records$2f$mockRecordsData$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getRecordsForScope"])(scope);
    const displayTitle = title ?? "Records";
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        style: {
            flexShrink: 0,
            height: 200,
            borderTop: embedded ? `1px solid ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].border}` : undefined,
            backgroundColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].surface,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column"
        },
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                style: {
                    padding: "10px 16px",
                    borderBottom: `1px solid ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].border}`,
                    fontSize: 12,
                    fontWeight: 600,
                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].textSecondary,
                    textTransform: "none",
                    letterSpacing: "0.02em"
                },
                children: displayTitle
            }, void 0, false, {
                fileName: "[project]/app/adminV2/components/records/RecordsPanel.tsx",
                lineNumber: 29,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                style: {
                    flex: 1,
                    overflow: "auto"
                },
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("table", {
                    style: {
                        width: "100%",
                        borderCollapse: "collapse",
                        fontSize: 12
                    },
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("thead", {
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("tr", {
                                children: columns.map((col)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("th", {
                                        style: {
                                            textAlign: "left",
                                            padding: "8px 12px",
                                            fontWeight: 600,
                                            color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].textSecondary,
                                            borderBottom: `1px solid ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].border}`
                                        },
                                        children: col.label
                                    }, col.key, false, {
                                        fileName: "[project]/app/adminV2/components/records/RecordsPanel.tsx",
                                        lineNumber: 53,
                                        columnNumber: 17
                                    }, this))
                            }, void 0, false, {
                                fileName: "[project]/app/adminV2/components/records/RecordsPanel.tsx",
                                lineNumber: 51,
                                columnNumber: 13
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/app/adminV2/components/records/RecordsPanel.tsx",
                            lineNumber: 50,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("tbody", {
                            children: rows.map((row, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("tr", {
                                    style: {
                                        borderBottom: `1px solid ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].border}`
                                    },
                                    children: columns.map((col)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("td", {
                                            style: {
                                                padding: "8px 12px",
                                                color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].textPrimary
                                            },
                                            children: row[col.key] ?? "—"
                                        }, col.key, false, {
                                            fileName: "[project]/app/adminV2/components/records/RecordsPanel.tsx",
                                            lineNumber: 77,
                                            columnNumber: 19
                                        }, this))
                                }, i, false, {
                                    fileName: "[project]/app/adminV2/components/records/RecordsPanel.tsx",
                                    lineNumber: 70,
                                    columnNumber: 15
                                }, this))
                        }, void 0, false, {
                            fileName: "[project]/app/adminV2/components/records/RecordsPanel.tsx",
                            lineNumber: 68,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/app/adminV2/components/records/RecordsPanel.tsx",
                    lineNumber: 43,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/app/adminV2/components/records/RecordsPanel.tsx",
                lineNumber: 42,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/app/adminV2/components/records/RecordsPanel.tsx",
        lineNumber: 18,
        columnNumber: 5
    }, this);
}
}),
"[project]/app/adminV2/components/records/RecordsExpandable.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>RecordsExpandable
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/styles/tokens/colors.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$records$2f$RecordsPanel$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/adminV2/components/records/RecordsPanel.tsx [app-ssr] (ecmascript)");
"use client";
;
;
;
;
function RecordsExpandable({ departmentName, scope }) {
    const [open, setOpen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        style: {
            flexShrink: 0,
            borderTop: `1px solid ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].border}`,
            backgroundColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].surface
        },
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                type: "button",
                onClick: ()=>setOpen((o)=>!o),
                style: {
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 16px",
                    border: "none",
                    background: open ? __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].kpiBandAiWash : __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].surface,
                    fontSize: 13,
                    fontWeight: 600,
                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["brand"].primary,
                    cursor: "pointer",
                    textAlign: "left"
                },
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        children: open ? `Hide ${departmentName} records` : `Show ${departmentName} records`
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/records/RecordsExpandable.tsx",
                        lineNumber: 42,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        style: {
                            color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].textSecondary,
                            fontSize: 11
                        },
                        "aria-hidden": true,
                        children: open ? "▲" : "▼"
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/records/RecordsExpandable.tsx",
                        lineNumber: 43,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/app/adminV2/components/records/RecordsExpandable.tsx",
                lineNumber: 24,
                columnNumber: 7
            }, this),
            open && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$records$2f$RecordsPanel$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                scope: scope,
                title: `${departmentName} records`,
                embedded: true
            }, void 0, false, {
                fileName: "[project]/app/adminV2/components/records/RecordsExpandable.tsx",
                lineNumber: 47,
                columnNumber: 16
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/app/adminV2/components/records/RecordsExpandable.tsx",
        lineNumber: 17,
        columnNumber: 5
    }, this);
}
}),
"[project]/app/adminV2/components/WorkspaceAmbientLayer.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>__TURBOPACK__default__export__
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
/**
 * Workspace shell ambient — renders the same company-field system as SystemCanvas
 * (AmbientFocusNode companyLayout: "field"): shared drift positions from companyFieldAmbient.ts,
 * adminv2-company-field-drift + orbital rings + bloom from adminV2.css.
 * Specs stay z-0 under workspace UI (shell z-10); pointer-events none.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$canvas$2f$companyFieldAmbient$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/adminV2/components/canvas/companyFieldAmbient.ts [app-ssr] (ecmascript)");
"use client";
;
;
;
const R8 = [
    0,
    45,
    90,
    135,
    180,
    225,
    270,
    315
];
const R10 = [
    0,
    36,
    72,
    108,
    144,
    180,
    216,
    252,
    288,
    324
];
const R12 = [
    0,
    30,
    60,
    90,
    120,
    150,
    180,
    210,
    240,
    270,
    300,
    330
];
/** Field texture only — specs/dots extremely subtle vs near-white slab */ const WORKSPACE_COMPANY_FIELD_OPACITY = 0.26;
function WorkspaceAmbientLayerComponent() {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "adminv2-workspace-ambient-field",
        "aria-hidden": true,
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "adminv2-ambient-root-company-field",
            style: {
                opacity: WORKSPACE_COMPANY_FIELD_OPACITY
            },
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "adminv2-ambient-bloom adminv2-ambient-bloom-company-field adminv2-workspace-ambient-bloom-dial",
                    style: {
                        /* Neutral vignette only — teal energy comes from spec dots at low weight */ background: "radial-gradient(ellipse 110% 70% at 50% 38%, rgba(39, 63, 82, 0.04) 0%, transparent 52%)"
                    }
                }, void 0, false, {
                    fileName: "[project]/app/adminV2/components/WorkspaceAmbientLayer.tsx",
                    lineNumber: 29,
                    columnNumber: 9
                }, this),
                __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$canvas$2f$companyFieldAmbient$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["COMPANY_FIELD_DRIFT_FULL"].map((p, idx)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: idx >= __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$canvas$2f$companyFieldAmbient$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["COMPANY_FIELD_DRIFT_PERIMETER_START"] ? "adminv2-company-field-drift adminv2-company-field-drift-perimeter" : "adminv2-company-field-drift",
                        style: {
                            left: `${p.l}%`,
                            top: `${p.t}%`,
                            backgroundColor: idx % 2 === 0 ? "rgba(39, 63, 82, 0.2)" : "rgba(39, 63, 82, 0.12)",
                            animationDelay: `${idx * 0.22}s`
                        }
                    }, `ws-cf-${idx}`, false, {
                        fileName: "[project]/app/adminV2/components/WorkspaceAmbientLayer.tsx",
                        lineNumber: 38,
                        columnNumber: 11
                    }, this)),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "adminv2-ambient-ring adminv2-ambient-ring-company-field-a",
                    "aria-hidden": true,
                    children: R8.map((deg)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "adminv2-ambient-spec-company-field",
                            style: {
                                transform: `rotate(${deg}deg) translateY(-118px)`
                            }
                        }, `ws-cfa-${deg}`, false, {
                            fileName: "[project]/app/adminV2/components/WorkspaceAmbientLayer.tsx",
                            lineNumber: 55,
                            columnNumber: 13
                        }, this))
                }, void 0, false, {
                    fileName: "[project]/app/adminV2/components/WorkspaceAmbientLayer.tsx",
                    lineNumber: 53,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "adminv2-ambient-ring adminv2-ambient-ring-reverse adminv2-ambient-ring-company-field-b",
                    "aria-hidden": true,
                    children: R10.map((deg)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "adminv2-ambient-spec-company-field-soft",
                            style: {
                                transform: `rotate(${deg}deg) translateY(-198px)`
                            }
                        }, `ws-cfb-${deg}`, false, {
                            fileName: "[project]/app/adminV2/components/WorkspaceAmbientLayer.tsx",
                            lineNumber: 64,
                            columnNumber: 13
                        }, this))
                }, void 0, false, {
                    fileName: "[project]/app/adminV2/components/WorkspaceAmbientLayer.tsx",
                    lineNumber: 62,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "adminv2-ambient-ring adminv2-ambient-ring-company-field-c",
                    "aria-hidden": true,
                    children: R12.map((deg)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "adminv2-ambient-spec-company-field-outer",
                            style: {
                                transform: `rotate(${deg}deg) translateY(-292px)`
                            }
                        }, `ws-cfc-${deg}`, false, {
                            fileName: "[project]/app/adminV2/components/WorkspaceAmbientLayer.tsx",
                            lineNumber: 73,
                            columnNumber: 13
                        }, this))
                }, void 0, false, {
                    fileName: "[project]/app/adminV2/components/WorkspaceAmbientLayer.tsx",
                    lineNumber: 71,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "adminv2-ambient-ring adminv2-ambient-ring-reverse adminv2-ambient-ring-company-field-d",
                    "aria-hidden": true,
                    children: R10.map((deg)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "adminv2-ambient-spec-company-field-dim",
                            style: {
                                transform: `rotate(${deg}deg) translateY(-368px)`
                            }
                        }, `ws-cfd-${deg}`, false, {
                            fileName: "[project]/app/adminV2/components/WorkspaceAmbientLayer.tsx",
                            lineNumber: 82,
                            columnNumber: 13
                        }, this))
                }, void 0, false, {
                    fileName: "[project]/app/adminV2/components/WorkspaceAmbientLayer.tsx",
                    lineNumber: 80,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "adminv2-ambient-ring adminv2-ambient-ring-company-field-e",
                    "aria-hidden": true,
                    children: R12.map((deg)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "adminv2-ambient-spec-company-field-proof",
                            style: {
                                transform: `rotate(${deg}deg) translateY(-402px)`
                            }
                        }, `ws-cfe-${deg}`, false, {
                            fileName: "[project]/app/adminV2/components/WorkspaceAmbientLayer.tsx",
                            lineNumber: 91,
                            columnNumber: 13
                        }, this))
                }, void 0, false, {
                    fileName: "[project]/app/adminV2/components/WorkspaceAmbientLayer.tsx",
                    lineNumber: 89,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/app/adminV2/components/WorkspaceAmbientLayer.tsx",
            lineNumber: 25,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/app/adminV2/components/WorkspaceAmbientLayer.tsx",
        lineNumber: 24,
        columnNumber: 5
    }, this);
}
const __TURBOPACK__default__export__ = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["memo"])(WorkspaceAmbientLayerComponent);
}),
"[project]/app/adminV2/components/AdminV2Shell.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>AdminV2Shell
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/navigation.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/styles/tokens/colors.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$TopNavBar$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/adminV2/components/TopNavBar.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$Sidebar$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/adminV2/components/Sidebar.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$InspectorPanel$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/adminV2/components/InspectorPanel.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$AICommandBar$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/adminV2/components/AICommandBar.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$aiCommandSurface$2f$AICommandSurfaceShell$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$aiActivity$2f$RecentAiActionsStrip$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/adminV2/components/aiActivity/RecentAiActionsStrip.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$navigation$2f$BreadcrumbBar$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/adminV2/components/navigation/BreadcrumbBar.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$dashboard$2f$KPIBand$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/adminV2/components/dashboard/KPIBand.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$canvas$2f$SystemCanvas$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/adminV2/components/canvas/SystemCanvas.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$records$2f$RecordsExpandable$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/adminV2/components/records/RecordsExpandable.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$canvas$2f$mockDepartments$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/adminV2/components/canvas/mockDepartments.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$WorkspaceAmbientLayer$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/adminV2/components/WorkspaceAmbientLayer.tsx [app-ssr] (ecmascript)");
"use client";
;
;
;
;
const CHAMBER_FRAME = `inset 0 0 0 1px ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].adminV2BoundaryAmberInset}`;
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
 * AdminV2 AI command surface is internal/admin-only and should be interactive whenever visible.
 * This avoids NEXT_PUBLIC env misconfiguration causing a non-interactive placeholder bar in production.
 */ function adminV2AiCommandSurfaceEnabled() {
    return true;
}
/** Matches `AICommandSurfaceShell` inner max width so the activity strip aligns with the bar. */ const COMMAND_SURFACE_MAX_W_PX = 840;
function getDepartmentName(key) {
    const dept = __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$canvas$2f$mockDepartments$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["MOCK_DEPARTMENTS"].find((d)=>d.key === key);
    return dept?.name ?? key;
}
/**
 * DEBUG: set false after verifying ambient paints in DevTools.
 * Production tokens use ~3–7% alpha (see colors.ts); they are effectively invisible on neutral.background.
 * This pass uses the same hues (#00a283 teal, #273f52 slate) at high alpha so the shell wrapper is unmistakable.
 */ const DEBUG_EXAGGERATE_WORKSPACE_AMBIENT = false;
/** Production ambient — cool near-white slab + restrained slate/indigo wash (ambient dots stay very subtle separately). */ const workspaceContentAmbientStyleProduction = {
    backgroundColor: "#f6f9fb",
    backgroundImage: `
    linear-gradient(180deg, rgba(36, 59, 86, 0.022) 0%, transparent 30%),
    linear-gradient(180deg, transparent 74%, rgba(39, 63, 82, 0.03) 100%),
    linear-gradient(135deg, rgba(33, 56, 88, 0.014) 0%, transparent 42%)
  `
};
/** Debug ambient — larger blooms + stronger field wash/depth, same vocabulary hues, no layout change */ const workspaceContentAmbientStyleDebug = {
    backgroundColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].background,
    backgroundImage: `
    radial-gradient(ellipse 120% 85% at 50% 12%, rgba(0, 162, 131, 0.5) 0%, rgba(0, 162, 131, 0.12) 45%, transparent 72%),
    radial-gradient(ellipse 95% 75% at 96% 8%, rgba(0, 162, 131, 0.42) 0%, transparent 58%),
    linear-gradient(180deg, rgba(39, 63, 82, 0.2) 0%, rgba(39, 63, 82, 0.06) 38%, transparent 62%),
    linear-gradient(180deg, transparent 35%, rgba(39, 63, 82, 0.32) 100%)
  `
};
const workspaceContentAmbientStyle = ("TURBOPACK compile-time falsy", 0) ? "TURBOPACK unreachable" : workspaceContentAmbientStyleProduction;
function AdminV2Shell({ children }) {
    const pathname = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["usePathname"])();
    const isWorkspaceV2Route = pathname === "/adminV2/workspace" || pathname.startsWith("/adminV2/workspace/") || pathname === "/admin/v2" || pathname === "/admin/v2/workspace" || pathname.startsWith("/admin/v2/workspace/");
    const isAiActivityRoute = pathname === "/adminV2/ai-activity" || pathname === "/admin/v2/ai-activity";
    const isSettingsRoute = pathname === "/adminV2/settings" || pathname.startsWith("/adminV2/settings/") || pathname === "/admin/v2/settings" || pathname.startsWith("/admin/v2/settings/");
    const isWorkflowsRoute = pathname === "/adminV2/workflows" || pathname.startsWith("/adminV2/workflows/") || pathname === "/admin/v2/workflows" || pathname.startsWith("/admin/v2/workflows/");
    const [sidebarCollapsed, setSidebarCollapsed] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(true);
    const [zoomLevel, setZoomLevel] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("company");
    const [selectedDepartmentKey, setSelectedDepartmentKey] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [selectedNodeId, setSelectedNodeId] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const handleDepartmentClick = (key)=>{
        setSelectedDepartmentKey(key);
        setZoomLevel("department");
    };
    const handleGoToCompany = ()=>{
        setZoomLevel("company");
        setSelectedDepartmentKey(null);
        setSelectedNodeId(null);
    };
    const kpiScope = zoomLevel === "company" || !selectedDepartmentKey ? {
        level: "company"
    } : {
        level: "department",
        key: selectedDepartmentKey
    };
    const showRecordsExpandable = zoomLevel === "department" && selectedDepartmentKey != null;
    if (isWorkspaceV2Route || isAiActivityRoute || isSettingsRoute || isWorkflowsRoute) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "flex h-screen w-full overflow-hidden",
            style: {
                backgroundColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].background
            },
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$Sidebar$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                    collapsed: sidebarCollapsed,
                    onToggle: ()=>setSidebarCollapsed((c)=>!c)
                }, void 0, false, {
                    fileName: "[project]/app/adminV2/components/AdminV2Shell.tsx",
                    lineNumber: 123,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "flex flex-1 flex-col min-w-0 min-h-0 overflow-hidden",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Suspense"], {
                            fallback: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex h-12 flex-shrink-0 items-center px-4 text-sm text-white/70",
                                style: {
                                    backgroundColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["palette"].midnightForge
                                },
                                "aria-hidden": true,
                                children: "Loading…"
                            }, void 0, false, {
                                fileName: "[project]/app/adminV2/components/AdminV2Shell.tsx",
                                lineNumber: 130,
                                columnNumber: 15
                            }, void 0),
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$TopNavBar$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {}, void 0, false, {
                                fileName: "[project]/app/adminV2/components/AdminV2Shell.tsx",
                                lineNumber: 139,
                                columnNumber: 13
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/app/adminV2/components/AdminV2Shell.tsx",
                            lineNumber: 128,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            "data-adminv2-workspace-ambient-root": true,
                            className: "relative flex flex-1 min-h-0 min-w-0 flex-col overflow-hidden",
                            style: workspaceContentAmbientStyle,
                            children: [
                                isWorkspaceV2Route || isSettingsRoute || isWorkflowsRoute ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$WorkspaceAmbientLayer$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {}, void 0, false, {
                                    fileName: "[project]/app/adminV2/components/AdminV2Shell.tsx",
                                    lineNumber: 146,
                                    columnNumber: 74
                                }, this) : null,
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "relative z-10 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden isolate pb-[96px]",
                                    children: isAiActivityRoute || isSettingsRoute || isWorkflowsRoute ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("main", {
                                        className: "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
                                        children: children
                                    }, void 0, false, {
                                        fileName: "[project]/app/adminV2/components/AdminV2Shell.tsx",
                                        lineNumber: 150,
                                        columnNumber: 17
                                    }, this) : children
                                }, void 0, false, {
                                    fileName: "[project]/app/adminV2/components/AdminV2Shell.tsx",
                                    lineNumber: 148,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "absolute bottom-2 left-0 right-0 z-20 flex flex-col",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "flex w-full justify-center px-4",
                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "w-full",
                                                style: {
                                                    maxWidth: COMMAND_SURFACE_MAX_W_PX
                                                },
                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$aiActivity$2f$RecentAiActionsStrip$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {}, void 0, false, {
                                                    fileName: "[project]/app/adminV2/components/AdminV2Shell.tsx",
                                                    lineNumber: 159,
                                                    columnNumber: 19
                                                }, this)
                                            }, void 0, false, {
                                                fileName: "[project]/app/adminV2/components/AdminV2Shell.tsx",
                                                lineNumber: 158,
                                                columnNumber: 17
                                            }, this)
                                        }, void 0, false, {
                                            fileName: "[project]/app/adminV2/components/AdminV2Shell.tsx",
                                            lineNumber: 157,
                                            columnNumber: 15
                                        }, this),
                                        adminV2AiCommandSurfaceEnabled() ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$aiCommandSurface$2f$AICommandSurfaceShell$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {}, void 0, false, {
                                            fileName: "[project]/app/adminV2/components/AdminV2Shell.tsx",
                                            lineNumber: 162,
                                            columnNumber: 51
                                        }, this) : /*#__PURE__*/ "TURBOPACK unreachable"
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/app/adminV2/components/AdminV2Shell.tsx",
                                    lineNumber: 156,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/app/adminV2/components/AdminV2Shell.tsx",
                            lineNumber: 141,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/app/adminV2/components/AdminV2Shell.tsx",
                    lineNumber: 127,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/app/adminV2/components/AdminV2Shell.tsx",
            lineNumber: 119,
            columnNumber: 7
        }, this);
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "flex h-screen w-full overflow-hidden",
        style: {
            backgroundColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].background
        },
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$Sidebar$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                collapsed: sidebarCollapsed,
                onToggle: ()=>setSidebarCollapsed((c)=>!c)
            }, void 0, false, {
                fileName: "[project]/app/adminV2/components/AdminV2Shell.tsx",
                lineNumber: 175,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex flex-1 flex-col min-w-0",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Suspense"], {
                        fallback: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "flex h-12 flex-shrink-0 items-center px-4 text-sm text-white/70",
                            style: {
                                backgroundColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["palette"].midnightForge
                            },
                            "aria-hidden": true,
                            children: "Loading…"
                        }, void 0, false, {
                            fileName: "[project]/app/adminV2/components/AdminV2Shell.tsx",
                            lineNumber: 182,
                            columnNumber: 13
                        }, void 0),
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$TopNavBar$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {}, void 0, false, {
                            fileName: "[project]/app/adminV2/components/AdminV2Shell.tsx",
                            lineNumber: 191,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/AdminV2Shell.tsx",
                        lineNumber: 180,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$navigation$2f$BreadcrumbBar$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                        zoomLevel: zoomLevel,
                        departmentName: selectedDepartmentKey ? getDepartmentName(selectedDepartmentKey) : null,
                        onGoToCompany: handleGoToCompany
                    }, void 0, false, {
                        fileName: "[project]/app/adminV2/components/AdminV2Shell.tsx",
                        lineNumber: 193,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex flex-1 min-h-0 flex-row min-w-0",
                        style: {
                            backgroundColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].surface,
                            boxShadow: `0 1px 0 ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].border}`
                        },
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex flex-1 min-w-0 min-h-0 flex-col",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$dashboard$2f$KPIBand$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                                        scope: kpiScope
                                    }, void 0, false, {
                                        fileName: "[project]/app/adminV2/components/AdminV2Shell.tsx",
                                        lineNumber: 207,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "flex flex-1 min-h-0 flex-col min-w-0",
                                        style: {
                                            backgroundColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].canvasChamberDeep,
                                            boxShadow: `inset 0 2px 0 ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].surface}, ${CHAMBER_FRAME}`,
                                            borderTop: `1px solid ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].border}`
                                        },
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("main", {
                                                className: "flex-1 min-h-0 min-w-0 overflow-hidden",
                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$canvas$2f$SystemCanvas$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                                                    zoomLevel: zoomLevel,
                                                    selectedDepartmentKey: selectedDepartmentKey,
                                                    selectedNodeId: selectedNodeId,
                                                    onDepartmentClick: handleDepartmentClick,
                                                    onNodeSelect: setSelectedNodeId
                                                }, void 0, false, {
                                                    fileName: "[project]/app/adminV2/components/AdminV2Shell.tsx",
                                                    lineNumber: 217,
                                                    columnNumber: 17
                                                }, this)
                                            }, void 0, false, {
                                                fileName: "[project]/app/adminV2/components/AdminV2Shell.tsx",
                                                lineNumber: 216,
                                                columnNumber: 15
                                            }, this),
                                            showRecordsExpandable && selectedDepartmentKey && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$records$2f$RecordsExpandable$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                                                departmentName: getDepartmentName(selectedDepartmentKey),
                                                scope: {
                                                    level: "department",
                                                    key: selectedDepartmentKey
                                                }
                                            }, selectedDepartmentKey, false, {
                                                fileName: "[project]/app/adminV2/components/AdminV2Shell.tsx",
                                                lineNumber: 226,
                                                columnNumber: 17
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/app/adminV2/components/AdminV2Shell.tsx",
                                        lineNumber: 208,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/app/adminV2/components/AdminV2Shell.tsx",
                                lineNumber: 206,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$InspectorPanel$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                                selectedNodeId: selectedNodeId,
                                selectedDepartmentKey: selectedDepartmentKey,
                                zoomLevel: zoomLevel
                            }, void 0, false, {
                                fileName: "[project]/app/adminV2/components/AdminV2Shell.tsx",
                                lineNumber: 235,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/app/adminV2/components/AdminV2Shell.tsx",
                        lineNumber: 198,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "relative flex flex-col",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex w-full justify-center px-4",
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "w-full",
                                    style: {
                                        maxWidth: COMMAND_SURFACE_MAX_W_PX
                                    },
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$aiActivity$2f$RecentAiActionsStrip$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {}, void 0, false, {
                                        fileName: "[project]/app/adminV2/components/AdminV2Shell.tsx",
                                        lineNumber: 244,
                                        columnNumber: 15
                                    }, this)
                                }, void 0, false, {
                                    fileName: "[project]/app/adminV2/components/AdminV2Shell.tsx",
                                    lineNumber: 243,
                                    columnNumber: 13
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/app/adminV2/components/AdminV2Shell.tsx",
                                lineNumber: 242,
                                columnNumber: 11
                            }, this),
                            adminV2AiCommandSurfaceEnabled() ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$adminV2$2f$components$2f$aiCommandSurface$2f$AICommandSurfaceShell$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {}, void 0, false, {
                                fileName: "[project]/app/adminV2/components/AdminV2Shell.tsx",
                                lineNumber: 247,
                                columnNumber: 47
                            }, this) : /*#__PURE__*/ "TURBOPACK unreachable"
                        ]
                    }, void 0, true, {
                        fileName: "[project]/app/adminV2/components/AdminV2Shell.tsx",
                        lineNumber: 241,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/app/adminV2/components/AdminV2Shell.tsx",
                lineNumber: 179,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/app/adminV2/components/AdminV2Shell.tsx",
        lineNumber: 171,
        columnNumber: 5
    }, this);
}
}),
];

//# sourceMappingURL=_de6089ba._.js.map