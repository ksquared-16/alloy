module.exports = [
"[externals]/next/dist/compiled/next-server/app-page-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-page-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[project]/components/GhlScript.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>GhlScript
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$script$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/script.js [app-ssr] (ecmascript)");
"use client";
;
;
function GhlScript() {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$script$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
        src: "https://link.msgsndr.com/js/form_embed.js",
        strategy: "afterInteractive",
        onLoad: ()=>{
            if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
            ;
        }
    }, void 0, false, {
        fileName: "[project]/components/GhlScript.tsx",
        lineNumber: 7,
        columnNumber: 5
    }, this);
}
}),
"[externals]/next/dist/server/app-render/action-async-storage.external.js [external] (next/dist/server/app-render/action-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/action-async-storage.external.js", () => require("next/dist/server/app-render/action-async-storage.external.js"));

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
"[project]/components/StagingBanner.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>StagingBanner
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/navigation.js [app-ssr] (ecmascript)");
"use client";
;
;
function StagingBanner() {
    const appEnv = process.env.NEXT_PUBLIC_APP_ENV;
    const pathname = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["usePathname"])();
    const isAdminRoute = pathname?.startsWith("/admin");
    if (appEnv !== "staging" || isAdminRoute) {
        return null;
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "fixed top-0 left-0 right-0 z-50 bg-red-600 text-white text-center py-2 px-4 font-bold text-sm shadow-lg",
        children: "STAGING — NOT PRODUCTION"
    }, void 0, false, {
        fileName: "[project]/components/StagingBanner.tsx",
        lineNumber: 15,
        columnNumber: 5
    }, this);
}
}),
"[project]/lib/quoteModal.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "QuoteModalProvider",
    ()=>QuoteModalProvider,
    "useQuoteModal",
    ()=>useQuoteModal
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
"use client";
;
;
const QuoteModalContext = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["createContext"])(undefined);
function QuoteModalProvider({ children }) {
    const [isOpen, setIsOpen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [defaultService, setDefaultService] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [campaignQuoteFlow, setCampaignQuoteFlow] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    /**
   * Callbacks must live in a ref: setState(fn) treats fn as an updater and CALLS it.
   * @see https://react.dev/reference/react/useState#im-trying-to-set-state-to-a-function-but-it-gets-called-instead
   */ const onCampaignQuoteCompleteRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const invokeCampaignQuoteComplete = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(()=>{
        onCampaignQuoteCompleteRef.current?.();
    }, []);
    /** Stable identity required: consumers (e.g. campaign useEffect) must not re-run on every provider render. */ const openModal = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((options)=>{
        onCampaignQuoteCompleteRef.current = options?.onCampaignQuoteComplete ?? null;
        setDefaultService(options?.defaultService || null);
        setCampaignQuoteFlow(options?.campaignQuoteFlow ?? null);
        setIsOpen(true);
    }, []);
    const closeModal = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(()=>{
        setIsOpen(false);
        setDefaultService(null);
        setCampaignQuoteFlow(null);
        onCampaignQuoteCompleteRef.current = null;
    }, []);
    const value = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>({
            isOpen,
            defaultService,
            campaignQuoteFlow,
            invokeCampaignQuoteComplete,
            openModal,
            closeModal
        }), [
        isOpen,
        defaultService,
        campaignQuoteFlow,
        invokeCampaignQuoteComplete,
        openModal,
        closeModal
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(QuoteModalContext.Provider, {
        value: value,
        children: children
    }, void 0, false, {
        fileName: "[project]/lib/quoteModal.tsx",
        lineNumber: 74,
        columnNumber: 5
    }, this);
}
function useQuoteModal() {
    const context = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useContext"])(QuoteModalContext);
    if (context === undefined) {
        throw new Error("useQuoteModal must be used within a QuoteModalProvider");
    }
    return context;
}
}),
"[project]/components/PrimaryButton.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>PrimaryButton
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
;
function PrimaryButton({ children, className = "", type = "button", ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
        type: type,
        className: `
        bg-alloy-blue hover:bg-alloy-blue/90
        text-white font-semibold 
        px-6 py-3 rounded-lg 
        transition-all duration-200
        disabled:opacity-50 disabled:cursor-not-allowed
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alloy-blue focus-visible:ring-offset-2
        active:scale-[0.99]
        ${className}
      `,
        ...props,
        children: children
    }, void 0, false, {
        fileName: "[project]/components/PrimaryButton.tsx",
        lineNumber: 15,
        columnNumber: 5
    }, this);
}
}),
"[project]/components/GetQuoteButton.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>GetQuoteButton
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$quoteModal$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/quoteModal.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$PrimaryButton$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/components/PrimaryButton.tsx [app-ssr] (ecmascript)");
"use client";
;
;
;
function GetQuoteButton({ children, className, variant = "primary", defaultService }) {
    const { openModal } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$quoteModal$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useQuoteModal"])();
    const handleClick = (e)=>{
        e.preventDefault();
        e.stopPropagation();
        openModal({
            defaultService
        });
    };
    if (variant === "secondary") {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
            type: "button",
            onClick: handleClick,
            className: className,
            children: children || "Get a Quote"
        }, void 0, false, {
            fileName: "[project]/components/GetQuoteButton.tsx",
            lineNumber: 34,
            columnNumber: 7
        }, this);
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$PrimaryButton$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
        type: "button",
        onClick: handleClick,
        className: className ? `w-full sm:w-auto ${className}` : "w-full sm:w-auto",
        children: children || "Get a Quote"
    }, void 0, false, {
        fileName: "[project]/components/GetQuoteButton.tsx",
        lineNumber: 45,
        columnNumber: 5
    }, this);
}
}),
"[project]/lib/utils.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "cn",
    ()=>cn
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$clsx$2f$dist$2f$clsx$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/clsx/dist/clsx.mjs [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$tailwind$2d$merge$2f$dist$2f$bundle$2d$mjs$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/tailwind-merge/dist/bundle-mjs.mjs [app-ssr] (ecmascript)");
;
;
function cn(...inputs) {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$tailwind$2d$merge$2f$dist$2f$bundle$2d$mjs$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["twMerge"])((0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$clsx$2f$dist$2f$clsx$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["clsx"])(inputs));
}
}),
"[project]/components/ui/dropdown-menu.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "DropdownMenu",
    ()=>DropdownMenu,
    "DropdownMenuCheckboxItem",
    ()=>DropdownMenuCheckboxItem,
    "DropdownMenuContent",
    ()=>DropdownMenuContent,
    "DropdownMenuGroup",
    ()=>DropdownMenuGroup,
    "DropdownMenuItem",
    ()=>DropdownMenuItem,
    "DropdownMenuLabel",
    ()=>DropdownMenuLabel,
    "DropdownMenuPortal",
    ()=>DropdownMenuPortal,
    "DropdownMenuRadioGroup",
    ()=>DropdownMenuRadioGroup,
    "DropdownMenuRadioItem",
    ()=>DropdownMenuRadioItem,
    "DropdownMenuSeparator",
    ()=>DropdownMenuSeparator,
    "DropdownMenuShortcut",
    ()=>DropdownMenuShortcut,
    "DropdownMenuSub",
    ()=>DropdownMenuSub,
    "DropdownMenuSubContent",
    ()=>DropdownMenuSubContent,
    "DropdownMenuSubTrigger",
    ()=>DropdownMenuSubTrigger,
    "DropdownMenuTrigger",
    ()=>DropdownMenuTrigger
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dropdown$2d$menu$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@radix-ui/react-dropdown-menu/dist/index.mjs [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/utils.ts [app-ssr] (ecmascript)");
"use client";
;
;
;
;
const DropdownMenu = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dropdown$2d$menu$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Root"];
const DropdownMenuTrigger = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dropdown$2d$menu$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Trigger"];
const DropdownMenuGroup = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dropdown$2d$menu$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Group"];
const DropdownMenuPortal = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dropdown$2d$menu$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Portal"];
const DropdownMenuSub = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dropdown$2d$menu$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Sub"];
const DropdownMenuRadioGroup = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dropdown$2d$menu$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["RadioGroup"];
const DropdownMenuSubTrigger = /*#__PURE__*/ __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["forwardRef"](({ className, inset, children, ...props }, ref)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dropdown$2d$menu$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["SubTrigger"], {
        ref: ref,
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-alloy-stone/50 data-[state=open]:bg-alloy-stone/50", inset && "pl-8", className),
        ...props,
        children: [
            children,
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
                className: "ml-auto h-4 w-4",
                fill: "none",
                stroke: "currentColor",
                viewBox: "0 0 24 24",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                    strokeLinecap: "round",
                    strokeLinejoin: "round",
                    strokeWidth: 2,
                    d: "M9 5l7 7-7 7"
                }, void 0, false, {
                    fileName: "[project]/components/ui/dropdown-menu.tsx",
                    lineNumber: 41,
                    columnNumber: 7
                }, ("TURBOPACK compile-time value", void 0))
            }, void 0, false, {
                fileName: "[project]/components/ui/dropdown-menu.tsx",
                lineNumber: 35,
                columnNumber: 5
            }, ("TURBOPACK compile-time value", void 0))
        ]
    }, void 0, true, {
        fileName: "[project]/components/ui/dropdown-menu.tsx",
        lineNumber: 25,
        columnNumber: 3
    }, ("TURBOPACK compile-time value", void 0)));
DropdownMenuSubTrigger.displayName = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dropdown$2d$menu$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["SubTrigger"].displayName;
const DropdownMenuSubContent = /*#__PURE__*/ __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["forwardRef"](({ className, ...props }, ref)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dropdown$2d$menu$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["SubContent"], {
        ref: ref,
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("z-50 min-w-[8rem] overflow-hidden rounded-md border border-alloy-stone/30 bg-white p-1 text-alloy-midnight shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/components/ui/dropdown-menu.tsx",
        lineNumber: 51,
        columnNumber: 3
    }, ("TURBOPACK compile-time value", void 0)));
DropdownMenuSubContent.displayName = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dropdown$2d$menu$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["SubContent"].displayName;
const DropdownMenuContent = /*#__PURE__*/ __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["forwardRef"](({ className, sideOffset = 4, ...props }, ref)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dropdown$2d$menu$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Portal"], {
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dropdown$2d$menu$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Content"], {
            ref: ref,
            sideOffset: sideOffset,
            className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("z-[9999] min-w-[8rem] overflow-hidden rounded-lg bg-white border border-alloy-stone/30 shadow-lg py-2", "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2", className),
            ...props
        }, void 0, false, {
            fileName: "[project]/components/ui/dropdown-menu.tsx",
            lineNumber: 67,
            columnNumber: 5
        }, ("TURBOPACK compile-time value", void 0))
    }, void 0, false, {
        fileName: "[project]/components/ui/dropdown-menu.tsx",
        lineNumber: 66,
        columnNumber: 3
    }, ("TURBOPACK compile-time value", void 0)));
DropdownMenuContent.displayName = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dropdown$2d$menu$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Content"].displayName;
const DropdownMenuItem = /*#__PURE__*/ __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["forwardRef"](({ className, inset, ...props }, ref)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dropdown$2d$menu$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Item"], {
        ref: ref,
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("relative flex cursor-pointer select-none items-center rounded-sm px-4 py-2 text-sm text-alloy-midnight outline-none transition-colors focus:bg-alloy-stone/50 data-[disabled]:pointer-events-none data-[disabled]:opacity-50", inset && "pl-8", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/components/ui/dropdown-menu.tsx",
        lineNumber: 87,
        columnNumber: 3
    }, ("TURBOPACK compile-time value", void 0)));
DropdownMenuItem.displayName = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dropdown$2d$menu$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Item"].displayName;
const DropdownMenuCheckboxItem = /*#__PURE__*/ __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["forwardRef"](({ className, children, checked, ...props }, ref)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dropdown$2d$menu$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["CheckboxItem"], {
        ref: ref,
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none transition-colors focus:bg-alloy-stone/50 data-[disabled]:pointer-events-none data-[disabled]:opacity-50", className),
        checked: checked,
        ...props,
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                className: "absolute left-2 flex h-3.5 w-3.5 items-center justify-center",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dropdown$2d$menu$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ItemIndicator"], {
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
                        className: "h-4 w-4",
                        fill: "none",
                        stroke: "currentColor",
                        viewBox: "0 0 24 24",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                            strokeLinecap: "round",
                            strokeLinejoin: "round",
                            strokeWidth: 2,
                            d: "M5 13l4 4L19 7"
                        }, void 0, false, {
                            fileName: "[project]/components/ui/dropdown-menu.tsx",
                            lineNumber: 115,
                            columnNumber: 11
                        }, ("TURBOPACK compile-time value", void 0))
                    }, void 0, false, {
                        fileName: "[project]/components/ui/dropdown-menu.tsx",
                        lineNumber: 114,
                        columnNumber: 9
                    }, ("TURBOPACK compile-time value", void 0))
                }, void 0, false, {
                    fileName: "[project]/components/ui/dropdown-menu.tsx",
                    lineNumber: 113,
                    columnNumber: 7
                }, ("TURBOPACK compile-time value", void 0))
            }, void 0, false, {
                fileName: "[project]/components/ui/dropdown-menu.tsx",
                lineNumber: 112,
                columnNumber: 5
            }, ("TURBOPACK compile-time value", void 0)),
            children
        ]
    }, void 0, true, {
        fileName: "[project]/components/ui/dropdown-menu.tsx",
        lineNumber: 103,
        columnNumber: 3
    }, ("TURBOPACK compile-time value", void 0)));
DropdownMenuCheckboxItem.displayName = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dropdown$2d$menu$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["CheckboxItem"].displayName;
const DropdownMenuRadioItem = /*#__PURE__*/ __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["forwardRef"](({ className, children, ...props }, ref)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dropdown$2d$menu$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["RadioItem"], {
        ref: ref,
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none transition-colors focus:bg-alloy-stone/50 data-[disabled]:pointer-events-none data-[disabled]:opacity-50", className),
        ...props,
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                className: "absolute left-2 flex h-3.5 w-3.5 items-center justify-center",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dropdown$2d$menu$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ItemIndicator"], {
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
                        className: "h-2 w-2 fill-current",
                        viewBox: "0 0 8 8",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("circle", {
                            cx: "4",
                            cy: "4",
                            r: "3"
                        }, void 0, false, {
                            fileName: "[project]/components/ui/dropdown-menu.tsx",
                            lineNumber: 139,
                            columnNumber: 11
                        }, ("TURBOPACK compile-time value", void 0))
                    }, void 0, false, {
                        fileName: "[project]/components/ui/dropdown-menu.tsx",
                        lineNumber: 138,
                        columnNumber: 9
                    }, ("TURBOPACK compile-time value", void 0))
                }, void 0, false, {
                    fileName: "[project]/components/ui/dropdown-menu.tsx",
                    lineNumber: 137,
                    columnNumber: 7
                }, ("TURBOPACK compile-time value", void 0))
            }, void 0, false, {
                fileName: "[project]/components/ui/dropdown-menu.tsx",
                lineNumber: 136,
                columnNumber: 5
            }, ("TURBOPACK compile-time value", void 0)),
            children
        ]
    }, void 0, true, {
        fileName: "[project]/components/ui/dropdown-menu.tsx",
        lineNumber: 128,
        columnNumber: 3
    }, ("TURBOPACK compile-time value", void 0)));
DropdownMenuRadioItem.displayName = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dropdown$2d$menu$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["RadioItem"].displayName;
const DropdownMenuLabel = /*#__PURE__*/ __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["forwardRef"](({ className, inset, ...props }, ref)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dropdown$2d$menu$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Label"], {
        ref: ref,
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("px-2 py-1.5 text-sm font-semibold", inset && "pl-8", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/components/ui/dropdown-menu.tsx",
        lineNumber: 154,
        columnNumber: 3
    }, ("TURBOPACK compile-time value", void 0)));
DropdownMenuLabel.displayName = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dropdown$2d$menu$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Label"].displayName;
const DropdownMenuSeparator = /*#__PURE__*/ __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["forwardRef"](({ className, ...props }, ref)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dropdown$2d$menu$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Separator"], {
        ref: ref,
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("-mx-1 my-1 h-px bg-alloy-stone/30", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/components/ui/dropdown-menu.tsx",
        lineNumber: 166,
        columnNumber: 3
    }, ("TURBOPACK compile-time value", void 0)));
DropdownMenuSeparator.displayName = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dropdown$2d$menu$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Separator"].displayName;
const DropdownMenuShortcut = ({ className, ...props })=>{
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("ml-auto text-xs tracking-widest opacity-60", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/components/ui/dropdown-menu.tsx",
        lineNumber: 175,
        columnNumber: 10
    }, ("TURBOPACK compile-time value", void 0));
};
DropdownMenuShortcut.displayName = "DropdownMenuShortcut";
;
}),
"[project]/components/Navbar.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>Navbar
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/navigation.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/client/app-dir/link.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$image$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/image.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$GetQuoteButton$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/components/GetQuoteButton.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$ui$2f$dropdown$2d$menu$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/components/ui/dropdown-menu.tsx [app-ssr] (ecmascript)");
"use client";
;
;
;
;
;
;
;
function Navbar() {
    const [mobileMenuOpen, setMobileMenuOpen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const pathname = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["usePathname"])();
    const router = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRouter"])();
    const servicesLinks = [
        {
            href: "/services/cleaning",
            label: "Home Cleaning"
        },
        {
            href: "/gutters",
            label: "Gutter Cleaning"
        }
    ];
    const navLinks = [
        {
            href: "/join",
            label: "Join Our Team"
        },
        {
            href: "/about",
            label: "About"
        }
    ];
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("nav", {
        className: "sticky top-0 z-50 home-header-translucent",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "hidden md:flex items-center justify-between h-20",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                            href: "/",
                            className: "flex items-center",
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$image$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                                src: "/brand/alloy-wordmark-white.svg",
                                alt: "Alloy logo",
                                width: 360,
                                height: 96,
                                className: "h-24 w-auto",
                                priority: true
                            }, void 0, false, {
                                fileName: "[project]/components/Navbar.tsx",
                                lineNumber: 38,
                                columnNumber: 13
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/components/Navbar.tsx",
                            lineNumber: 37,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "flex items-center space-x-8",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$ui$2f$dropdown$2d$menu$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["DropdownMenu"], {
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$ui$2f$dropdown$2d$menu$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["DropdownMenuTrigger"], {
                                            className: `
                  text-white/90 hover:text-white
                  transition-colors font-medium pb-1 relative flex items-center gap-1
                  outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#18273A]
                  ${pathname?.startsWith("/services/") || pathname === "/gutters" ? "border-b-2 border-alloy-juniper text-white" : ""}
                `,
                                            children: [
                                                "Services",
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
                                                    className: "w-4 h-4 transition-transform data-[state=open]:rotate-180",
                                                    fill: "none",
                                                    stroke: "currentColor",
                                                    viewBox: "0 0 24 24",
                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                                                        strokeLinecap: "round",
                                                        strokeLinejoin: "round",
                                                        strokeWidth: 2,
                                                        d: "M19 9l-7 7-7-7"
                                                    }, void 0, false, {
                                                        fileName: "[project]/components/Navbar.tsx",
                                                        lineNumber: 69,
                                                        columnNumber: 19
                                                    }, this)
                                                }, void 0, false, {
                                                    fileName: "[project]/components/Navbar.tsx",
                                                    lineNumber: 63,
                                                    columnNumber: 17
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/components/Navbar.tsx",
                                            lineNumber: 52,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$ui$2f$dropdown$2d$menu$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["DropdownMenuContent"], {
                                            align: "start",
                                            className: "w-48",
                                            children: servicesLinks.map((link)=>{
                                                const isActive = pathname === link.href || pathname?.startsWith(link.href + "/");
                                                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$ui$2f$dropdown$2d$menu$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["DropdownMenuItem"], {
                                                    onClick: ()=>router.push(link.href),
                                                    className: `
                        cursor-pointer
                        ${isActive ? "bg-alloy-juniper/10 text-alloy-juniper font-medium" : ""}
                      `,
                                                    children: link.label
                                                }, link.href, false, {
                                                    fileName: "[project]/components/Navbar.tsx",
                                                    lineNumber: 76,
                                                    columnNumber: 21
                                                }, this);
                                            })
                                        }, void 0, false, {
                                            fileName: "[project]/components/Navbar.tsx",
                                            lineNumber: 72,
                                            columnNumber: 15
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/components/Navbar.tsx",
                                    lineNumber: 51,
                                    columnNumber: 13
                                }, this),
                                navLinks.map((link)=>{
                                    const isActive = pathname === link.href || pathname?.startsWith(link.href + "/");
                                    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                                        href: link.href,
                                        className: `
                    text-white/90 hover:text-white
                    transition-colors font-medium pb-1 relative
                    ${isActive ? "border-b-2 border-alloy-juniper text-white" : ""}
                  `,
                                        children: link.label
                                    }, link.href, false, {
                                        fileName: "[project]/components/Navbar.tsx",
                                        lineNumber: 94,
                                        columnNumber: 17
                                    }, this);
                                }),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$GetQuoteButton$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                                    className: "quote-cta-bend-pine !px-5 !py-2.5 !text-sm !text-white !shadow-md hover:!shadow-lg transition-all"
                                }, void 0, false, {
                                    fileName: "[project]/components/Navbar.tsx",
                                    lineNumber: 109,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/components/Navbar.tsx",
                            lineNumber: 49,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/components/Navbar.tsx",
                    lineNumber: 35,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "md:hidden flex items-center justify-between h-20 py-4",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                            href: "/",
                            className: "flex items-center",
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$image$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                                src: "/brand/alloy-wordmark-white.svg",
                                alt: "Alloy logo",
                                width: 280,
                                height: 72,
                                className: "h-[4.5rem] w-auto",
                                priority: true
                            }, void 0, false, {
                                fileName: "[project]/components/Navbar.tsx",
                                lineNumber: 117,
                                columnNumber: 13
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/components/Navbar.tsx",
                            lineNumber: 116,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                            className: "p-3 rounded-lg text-white/90 hover:text-white hover:bg-white/10 transition-colors",
                            onClick: ()=>setMobileMenuOpen(!mobileMenuOpen),
                            "aria-label": "Toggle menu",
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
                                className: "h-6 w-6",
                                fill: "none",
                                strokeLinecap: "round",
                                strokeLinejoin: "round",
                                strokeWidth: "2",
                                viewBox: "0 0 24 24",
                                stroke: "currentColor",
                                children: mobileMenuOpen ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                                    d: "M6 18L18 6M6 6l12 12"
                                }, void 0, false, {
                                    fileName: "[project]/components/Navbar.tsx",
                                    lineNumber: 143,
                                    columnNumber: 17
                                }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                                    d: "M4 6h16M4 12h16M4 18h16"
                                }, void 0, false, {
                                    fileName: "[project]/components/Navbar.tsx",
                                    lineNumber: 145,
                                    columnNumber: 17
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/components/Navbar.tsx",
                                lineNumber: 133,
                                columnNumber: 13
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/components/Navbar.tsx",
                            lineNumber: 128,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/components/Navbar.tsx",
                    lineNumber: 114,
                    columnNumber: 9
                }, this),
                mobileMenuOpen && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "md:hidden py-6 border-t border-white/10",
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex flex-col space-y-5",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "pb-2 border-b border-white/10",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "text-xs font-semibold tracking-wide text-white/50 mb-2",
                                        children: "Services"
                                    }, void 0, false, {
                                        fileName: "[project]/components/Navbar.tsx",
                                        lineNumber: 156,
                                        columnNumber: 17
                                    }, this),
                                    servicesLinks.map((link)=>{
                                        const isActive = pathname === link.href || pathname?.startsWith(link.href + "/");
                                        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                                            href: link.href,
                                            className: `
                        block text-white/90 hover:text-white
                        transition-colors font-medium py-2 pl-4 relative
                        ${isActive ? "text-alloy-juniper font-semibold" : ""}
                      `,
                                            onClick: ()=>setMobileMenuOpen(false),
                                            children: link.label
                                        }, link.href, false, {
                                            fileName: "[project]/components/Navbar.tsx",
                                            lineNumber: 160,
                                            columnNumber: 21
                                        }, this);
                                    })
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/Navbar.tsx",
                                lineNumber: 155,
                                columnNumber: 15
                            }, this),
                            navLinks.map((link)=>{
                                const isActive = pathname === link.href || pathname?.startsWith(link.href + "/");
                                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                                    href: link.href,
                                    className: `
                      text-white/90 hover:text-white
                      transition-colors font-medium py-2 relative
                      ${isActive ? "border-b-2 border-alloy-juniper inline-block w-fit text-white" : ""}
                    `,
                                    onClick: ()=>setMobileMenuOpen(false),
                                    children: link.label
                                }, link.href, false, {
                                    fileName: "[project]/components/Navbar.tsx",
                                    lineNumber: 178,
                                    columnNumber: 19
                                }, this);
                            }),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "pt-2",
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    onClick: ()=>setMobileMenuOpen(false),
                                    className: "w-full",
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$GetQuoteButton$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                                        className: "w-full quote-cta-bend-pine !text-white"
                                    }, void 0, false, {
                                        fileName: "[project]/components/Navbar.tsx",
                                        lineNumber: 194,
                                        columnNumber: 19
                                    }, this)
                                }, void 0, false, {
                                    fileName: "[project]/components/Navbar.tsx",
                                    lineNumber: 193,
                                    columnNumber: 17
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/components/Navbar.tsx",
                                lineNumber: 192,
                                columnNumber: 15
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/Navbar.tsx",
                        lineNumber: 154,
                        columnNumber: 13
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/components/Navbar.tsx",
                    lineNumber: 153,
                    columnNumber: 11
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/components/Navbar.tsx",
            lineNumber: 33,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/components/Navbar.tsx",
        lineNumber: 32,
        columnNumber: 5
    }, this);
}
}),
"[project]/components/Footer.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>Footer
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/client/app-dir/link.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$image$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/image.js [app-ssr] (ecmascript)");
;
;
;
function Footer() {
    const footerLinks = {
        services: [
            {
                href: "/services",
                label: "Services"
            },
            {
                href: "/services/cleaning",
                label: "Home Cleaning"
            }
        ],
        company: [
            {
                href: "/about",
                label: "About"
            },
            {
                href: "/join",
                label: "Join Our Team"
            }
        ],
        legal: [
            {
                href: "/privacy",
                label: "Privacy"
            },
            {
                href: "/terms",
                label: "Terms"
            },
            {
                href: "/sms-consent",
                label: "SMS Consent"
            }
        ]
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("footer", {
        className: "relative z-20 mt-20 bg-alloy-midnight text-alloy-stone",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "h-1 bg-gradient-to-r from-alloy-pine via-alloy-juniper to-alloy-pine"
            }, void 0, false, {
                fileName: "[project]/components/Footer.tsx",
                lineNumber: 24,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-12",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "grid grid-cols-1 md:grid-cols-4 gap-8",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "col-span-1 md:col-span-2",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "flex items-center gap-3 mb-4",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$image$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                                                src: "/brand/alloy-brandmark-white.svg",
                                                alt: "Alloy brandmark",
                                                width: 40,
                                                height: 40,
                                                className: "h-10 w-10"
                                            }, void 0, false, {
                                                fileName: "[project]/components/Footer.tsx",
                                                lineNumber: 30,
                                                columnNumber: 15
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                className: "text-sm text-white/90",
                                                children: "Alloy LLC – Bend, Oregon"
                                            }, void 0, false, {
                                                fileName: "[project]/components/Footer.tsx",
                                                lineNumber: 37,
                                                columnNumber: 15
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/components/Footer.tsx",
                                        lineNumber: 29,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "text-alloy-stone mb-4",
                                        children: "Connecting homeowners with trusted local service professionals."
                                    }, void 0, false, {
                                        fileName: "[project]/components/Footer.tsx",
                                        lineNumber: 41,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "text-alloy-stone text-sm",
                                        children: [
                                            "Contact:",
                                            " ",
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                                                href: "mailto:support@workwithalloy.com",
                                                className: "text-alloy-juniper hover:underline",
                                                children: "support@workwithalloy.com"
                                            }, void 0, false, {
                                                fileName: "[project]/components/Footer.tsx",
                                                lineNumber: 46,
                                                columnNumber: 15
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "text-alloy-stone/50 mx-2",
                                                "aria-hidden": true,
                                                children: "·"
                                            }, void 0, false, {
                                                fileName: "[project]/components/Footer.tsx",
                                                lineNumber: 52,
                                                columnNumber: 15
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                                                href: "tel:+15412408863",
                                                className: "text-alloy-juniper hover:underline",
                                                children: "541-240-8863"
                                            }, void 0, false, {
                                                fileName: "[project]/components/Footer.tsx",
                                                lineNumber: 55,
                                                columnNumber: 15
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/components/Footer.tsx",
                                        lineNumber: 44,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/Footer.tsx",
                                lineNumber: 28,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h4", {
                                        className: "font-semibold mb-4 text-white/90",
                                        children: "Services"
                                    }, void 0, false, {
                                        fileName: "[project]/components/Footer.tsx",
                                        lineNumber: 66,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                                        className: "space-y-2",
                                        children: footerLinks.services.map((link)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                                                    href: link.href,
                                                    className: "text-alloy-stone hover:text-alloy-juniper transition-colors",
                                                    children: link.label
                                                }, void 0, false, {
                                                    fileName: "[project]/components/Footer.tsx",
                                                    lineNumber: 70,
                                                    columnNumber: 19
                                                }, this)
                                            }, link.href, false, {
                                                fileName: "[project]/components/Footer.tsx",
                                                lineNumber: 69,
                                                columnNumber: 17
                                            }, this))
                                    }, void 0, false, {
                                        fileName: "[project]/components/Footer.tsx",
                                        lineNumber: 67,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/Footer.tsx",
                                lineNumber: 65,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h4", {
                                        className: "font-semibold mb-4 text-white/90",
                                        children: "Company"
                                    }, void 0, false, {
                                        fileName: "[project]/components/Footer.tsx",
                                        lineNumber: 83,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                                        className: "space-y-2 mb-6",
                                        children: footerLinks.company.map((link)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                                                    href: link.href,
                                                    className: "text-alloy-stone hover:text-alloy-juniper transition-colors",
                                                    children: link.label
                                                }, void 0, false, {
                                                    fileName: "[project]/components/Footer.tsx",
                                                    lineNumber: 87,
                                                    columnNumber: 19
                                                }, this)
                                            }, link.href, false, {
                                                fileName: "[project]/components/Footer.tsx",
                                                lineNumber: 86,
                                                columnNumber: 17
                                            }, this))
                                    }, void 0, false, {
                                        fileName: "[project]/components/Footer.tsx",
                                        lineNumber: 84,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h4", {
                                        className: "font-semibold mb-4 text-white/90",
                                        children: "Legal"
                                    }, void 0, false, {
                                        fileName: "[project]/components/Footer.tsx",
                                        lineNumber: 96,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                                        className: "space-y-2",
                                        children: footerLinks.legal.map((link)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                                                    href: link.href,
                                                    className: "text-alloy-stone hover:text-alloy-juniper transition-colors",
                                                    children: link.label
                                                }, void 0, false, {
                                                    fileName: "[project]/components/Footer.tsx",
                                                    lineNumber: 100,
                                                    columnNumber: 19
                                                }, this)
                                            }, link.href, false, {
                                                fileName: "[project]/components/Footer.tsx",
                                                lineNumber: 99,
                                                columnNumber: 17
                                            }, this))
                                    }, void 0, false, {
                                        fileName: "[project]/components/Footer.tsx",
                                        lineNumber: 97,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/Footer.tsx",
                                lineNumber: 82,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/Footer.tsx",
                        lineNumber: 26,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "border-t border-white/10 mt-8 pt-8 text-center text-sm text-alloy-stone/80",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                            children: [
                                "© ",
                                new Date().getFullYear(),
                                " Alloy LLC. All rights reserved."
                            ]
                        }, void 0, true, {
                            fileName: "[project]/components/Footer.tsx",
                            lineNumber: 113,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/components/Footer.tsx",
                        lineNumber: 112,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/Footer.tsx",
                lineNumber: 25,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/components/Footer.tsx",
        lineNumber: 22,
        columnNumber: 5
    }, this);
}
}),
"[project]/components/LayoutWrapper.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>LayoutWrapper
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
"use client";
;
function LayoutWrapper({ children }) {
    const appEnv = process.env.NEXT_PUBLIC_APP_ENV;
    const isStaging = appEnv === "staging";
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: isStaging ? "pt-10" : "",
        children: children
    }, void 0, false, {
        fileName: "[project]/components/LayoutWrapper.tsx",
        lineNumber: 12,
        columnNumber: 5
    }, this);
}
}),
"[project]/lib/supabaseClient.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Supabase client for client-side operations (browser).
 * Uses NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY (same host as middleware
 * must use for auth cookie names — see lib/supabase/auth-env.ts).
 */ __turbopack_context__.s([
    "createClient",
    ()=>createClient
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$ssr$2f$dist$2f$module$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/node_modules/@supabase/ssr/dist/module/index.js [app-ssr] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$ssr$2f$dist$2f$module$2f$createBrowserClient$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@supabase/ssr/dist/module/createBrowserClient.js [app-ssr] (ecmascript)");
;
function assertValidSupabaseHttpUrl(supabaseUrl) {
    let u;
    try {
        u = new URL(supabaseUrl);
    } catch  {
        throw new Error("NEXT_PUBLIC_SUPABASE_URL is not a valid URL. Use https://<project-ref>.supabase.co from Project Settings → API.");
    }
    if (u.protocol !== "https:") {
        throw new Error("NEXT_PUBLIC_SUPABASE_URL must use https. Fix your .env.local and restart `next dev`.");
    }
    if (!u.hostname || u.hostname.includes(" ")) {
        throw new Error("NEXT_PUBLIC_SUPABASE_URL has an invalid hostname. Check for typos, quotes, or whitespace in .env.local.");
    }
    const lower = supabaseUrl.toLowerCase();
    if (lower.includes("your_project_ref") || lower.includes("placeholder") || lower.includes("example.supabase.co")) {
        throw new Error("NEXT_PUBLIC_SUPABASE_URL still looks like a placeholder. Set the real project URL from Supabase Dashboard → Project Settings → API.");
    }
}
function createClient() {
    const supabaseUrl = ("TURBOPACK compile-time value", "https://ikaxilmwmrmbagoidedu.supabase.co")?.trim();
    const supabaseAnonKey = ("TURBOPACK compile-time value", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlrYXhpbG13bXJtYmFnb2lkZWR1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyOTAzNDgsImV4cCI6MjA4OTg2NjM0OH0.thNJQBUCVJDuyaMCsECK2cFEClBk1fE_fFz5v95d42c")?.trim();
    if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. These must be set in your environment.");
    }
    assertValidSupabaseHttpUrl(supabaseUrl);
    const looksLikeSupabaseJwt = supabaseAnonKey.startsWith("eyJ");
    const keyLooksPlaceholder = !looksLikeSupabaseJwt || supabaseAnonKey.length < 80 || /^your_/i.test(supabaseAnonKey) || /anon_public_key/i.test(supabaseAnonKey);
    if (keyLooksPlaceholder) {
        throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY looks invalid or like a placeholder. Paste the full anon (public) key from Project Settings → API and restart `next dev`.");
    }
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$ssr$2f$dist$2f$module$2f$createBrowserClient$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["createBrowserClient"])(supabaseUrl, supabaseAnonKey);
}
}),
"[project]/lib/pricing/supabasePricing.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Supabase-based pricing calculation.
 * Calls public.get_quote_pricing RPC function.
 */ __turbopack_context__.s([
    "ADDON_ID_TO_KEY",
    ()=>ADDON_ID_TO_KEY,
    "ADDON_KEY_TO_ID",
    ()=>ADDON_KEY_TO_ID,
    "convertSupabaseResultToQuoteResult",
    ()=>convertSupabaseResultToQuoteResult,
    "getQuotePricingFromSupabase",
    ()=>getQuotePricingFromSupabase,
    "mapAddOnsToKeys",
    ()=>mapAddOnsToKeys,
    "mapFrequencyToKey",
    ()=>mapFrequencyToKey,
    "mapServiceTypeToKey",
    ()=>mapServiceTypeToKey
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabaseClient$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/supabaseClient.ts [app-ssr] (ecmascript)");
;
function mapServiceTypeToKey(serviceType) {
    switch(serviceType){
        case "Standard Cleaning":
            return "standard_cleaning";
        case "Move-Out / Heavy Clean":
            return "move_out_heavy";
        default:
            throw new Error(`Unknown service type: ${serviceType}`);
    }
}
function mapFrequencyToKey(frequency) {
    // Handle one-time
    if (frequency === "One-time") {
        return null;
    }
    // Map new values directly
    if (frequency === "Weekly (30% Off)") {
        return "Weekly (30% Off)";
    }
    if (frequency === "Bi-Weekly (20% Off)") {
        return "Bi-Weekly (20% Off)";
    }
    if (frequency === "Monthly (10% Off)") {
        return "Monthly (10% Off)";
    }
    // Map legacy values forward (backward compatibility)
    if (frequency === "Weekly (40% Off)") {
        return "Weekly (30% Off)";
    }
    if (frequency === "Bi-Weekly (30% Off)") {
        return "Bi-Weekly (20% Off)";
    }
    if (frequency === "Monthly (20% Off)") {
        return "Monthly (10% Off)";
    }
    // Unknown frequency - return null
    return null;
}
const ADDON_ID_TO_KEY = {
    Fridge: "fridge",
    Oven: "oven",
    Cabinets: "cabinets",
    "Pet Hair": "pet_hair"
};
const ADDON_KEY_TO_ID = Object.fromEntries(Object.entries(ADDON_ID_TO_KEY).map(([id, key])=>[
        key,
        id
    ]));
function mapAddOnsToKeys(addOns) {
    return addOns.map((addon)=>ADDON_ID_TO_KEY[addon] || addon.toLowerCase().replace(/\s+/g, "_"));
}
async function getQuotePricingFromSupabase(serviceType, squareFootage, frequency, addOns, options) {
    const supabase = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabaseClient$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["createClient"])();
    const isStaging = process.env.NEXT_PUBLIC_APP_ENV === "staging";
    const serviceKey = mapServiceTypeToKey(serviceType);
    const frequencyKey = mapFrequencyToKey(frequency);
    // Ensure addonKeys is always an array, never undefined/null
    const addonKeys = mapAddOnsToKeys(addOns) ?? [];
    // Ensure p_frequency_key is always a string ("" for one-time, never undefined/null)
    const useRpcOverride = options != null && Object.prototype.hasOwnProperty.call(options, "rpcFrequencyKey");
    const frequencyKeyParam = useRpcOverride ? String(options.rpcFrequencyKey ?? "").trim() : frequencyKey ?? "";
    const rpcParams = {
        p_vertical_slug: "cleaning",
        p_service_key: serviceKey,
        p_sqft_key: squareFootage,
        p_frequency_key: frequencyKeyParam,
        p_addon_keys: addonKeys
    };
    if (isStaging) {
        console.log("[STAGING] Supabase RPC params:", rpcParams);
    }
    const { data, error } = await supabase.rpc("get_quote_pricing", rpcParams);
    if (isStaging) {
        console.log("[STAGING] Supabase RPC response:", {
            data,
            error
        });
    }
    if (error) {
        console.error("[SUPABASE_PRICING] RPC error:", error);
        throw new Error(`Failed to calculate pricing: ${error.message}`);
    }
    if (!data) {
        throw new Error("No pricing data returned from Supabase");
    }
    // RPC returns an array - use first row
    if (Array.isArray(data)) {
        if (data.length === 0) {
            throw new Error("No pricing data returned from Supabase (empty array)");
        }
        return data[0];
    }
    // Fallback: if it's not an array, return as-is
    return data;
}
function convertSupabaseResultToQuoteResult(supabaseResult, serviceType, frequency, addOns) {
    const isStaging = process.env.NEXT_PUBLIC_APP_ENV === "staging";
    if (isStaging) {
        console.log("[STAGING] convertSupabaseResultToQuoteResult - raw row:", supabaseResult);
    }
    const serviceLabel = serviceType === "Move-Out / Heavy Clean" ? "Move-Out / Heavy Clean" : "Standard Cleaning";
    // Handle manual quote
    if (supabaseResult.is_manual_quote) {
        const result = {
            status: "pending",
            source: "supabase",
            service: serviceLabel,
            estimated_price: null,
            first_clean_price: null,
            recurring_price: null,
            frequency_label: null,
            discount_label: null,
            addons: addOns.map((id)=>({
                    name: id,
                    price: null
                })),
            price_breakdown: supabaseResult.price_breakdown || "Manual quote required",
            is_manual_quote: true
        };
        if (isStaging) {
            console.log("[STAGING] convertSupabaseResultToQuoteResult - converted (manual):", result);
        }
        return result;
    }
    // Map fields from Supabase RPC response
    // first_clean_price = (row.first_clean_cents ?? 0) / 100
    const firstCleanPrice = (supabaseResult.first_clean_cents ?? 0) / 100;
    // recurring_price = row.recurring_cents != null ? row.recurring_cents / 100 : null
    const recurringPrice = supabaseResult.recurring_cents != null ? supabaseResult.recurring_cents / 100 : null;
    // estimated_price = (row.total_first_visit_cents ?? (row.first_clean_cents ?? 0) + (row.addons_total_cents ?? 0)) / 100
    const estimatedPrice = (supabaseResult.total_first_visit_cents ?? (supabaseResult.first_clean_cents ?? 0) + (supabaseResult.addons_total_cents ?? 0)) / 100;
    // Extract frequency_label and discount_label from price_breakdown (source of truth)
    // Do NOT use input frequency parameter - parse from breakdown instead
    // Wrap in try/catch to never throw even if price_breakdown is null or malformed
    let frequencyLabel = null;
    let discountLabel = null;
    try {
        if (recurringPrice != null && recurringPrice > 0 && supabaseResult.price_breakdown) {
            // Parse frequency from "Recurring (Bi-Weekly):" or similar pattern
            const frequencyMatch = supabaseResult.price_breakdown.match(/Recurring\s*\(([^)]+)\)/i);
            if (frequencyMatch && frequencyMatch[1]) {
                const parsedFrequency = frequencyMatch[1].trim();
                // Normalize common variations
                if (parsedFrequency.toLowerCase().includes("bi-weekly") || parsedFrequency.toLowerCase().includes("biweekly")) {
                    frequencyLabel = "Bi-Weekly";
                } else if (parsedFrequency.toLowerCase().includes("weekly")) {
                    frequencyLabel = "Weekly";
                } else if (parsedFrequency.toLowerCase().includes("monthly")) {
                    frequencyLabel = "Monthly";
                } else {
                    // Use as-is if it doesn't match known patterns
                    frequencyLabel = parsedFrequency;
                }
            }
            // Parse discount from "(XX% off)" pattern in price_breakdown
            const discountMatch = supabaseResult.price_breakdown.match(/\((\d+)%\s*off\)/i);
            if (discountMatch && discountMatch[1]) {
                discountLabel = `${discountMatch[1]}% off`;
            }
        }
    } catch (parseError) {
        // If parsing fails, default to null (don't throw - let quote proceed)
        console.warn("[SUPABASE_PRICING] Failed to parse frequency/discount from price_breakdown:", parseError);
        frequencyLabel = null;
        discountLabel = null;
    }
    // Build addons list (we don't have individual addon prices from Supabase, so use null)
    const addonsList = addOns.map((id)=>({
            name: id,
            price: null
        }));
    // status = "ready" if we have pricing data
    const status = firstCleanPrice > 0 || estimatedPrice > 0 ? "ready" : "pending";
    const result = {
        status,
        source: "supabase",
        service: serviceLabel,
        estimated_price: estimatedPrice,
        first_clean_price: firstCleanPrice,
        recurring_price: recurringPrice,
        frequency_label: frequencyLabel,
        discount_label: discountLabel,
        addons: addonsList,
        price_breakdown: supabaseResult.price_breakdown || null,
        is_manual_quote: false
    };
    if (isStaging) {
        console.log("[STAGING] convertSupabaseResultToQuoteResult - converted:", result);
    }
    return result;
}
}),
"[project]/lib/book-v2/resolveCleaningFrequencyRpc.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "formatFrequencyRowDisplayLabel",
    ()=>formatFrequencyRowDisplayLabel,
    "frequencyRowForRpcKey",
    ()=>frequencyRowForRpcKey,
    "inferLegacyCleaningFrequencyApiKey",
    ()=>inferLegacyCleaningFrequencyApiKey,
    "resolveRpcFrequencyKey",
    ()=>resolveRpcFrequencyKey
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$pricing$2f$supabasePricing$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/pricing/supabasePricing.ts [app-ssr] (ecmascript)");
;
function formatFrequencyRowDisplayLabel(row) {
    return row.discount_label ? `${row.frequency_label} — ${row.discount_label}` : row.frequency_label;
}
function mapApiFrequencyToOption(freq) {
    switch(freq){
        case "weekly":
            return "Weekly (30% Off)";
        case "biweekly":
            return "Bi-Weekly (20% Off)";
        case "monthly":
            return "Monthly (10% Off)";
        default:
            return "One-time";
    }
}
function resolveRpcFrequencyKey(requested, rows) {
    const s = String(requested ?? "").trim();
    if (!s || s === "one_time") return "";
    const direct = rows.find((r)=>r.frequency_key === s);
    if (direct) {
        if (!direct.is_recurring) return "";
        return direct.frequency_key;
    }
    if (s === "weekly" || s === "biweekly" || s === "monthly") {
        const opt = mapApiFrequencyToOption(s);
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$pricing$2f$supabasePricing$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["mapFrequencyToKey"])(opt) ?? "";
    }
    return "";
}
function inferLegacyCleaningFrequencyApiKey(rpcKey, rows) {
    const k = String(rpcKey ?? "").trim();
    if (!k) return "one_time";
    const row = rows.find((r)=>r.frequency_key === k);
    if (row && !row.is_recurring) return "one_time";
    const fk = (row?.frequency_key ?? k).toLowerCase();
    if (fk.includes("bi") || fk.includes("2 week") || fk.includes("every 2")) return "biweekly";
    if (fk.includes("month")) return "monthly";
    if (fk.includes("week")) return "weekly";
    return "one_time";
}
function frequencyRowForRpcKey(rpcKey, rows) {
    const k = String(rpcKey ?? "").trim();
    if (!k) {
        const oneOff = rows.find((r)=>!r.is_recurring);
        return oneOff ?? null;
    }
    return rows.find((r)=>r.frequency_key === k) ?? null;
}
}),
"[project]/lib/book-v2/catalogFrequencyChoices.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "catalogFrequencyChoices",
    ()=>catalogFrequencyChoices,
    "standardCleaningFrequencyCatalog",
    ()=>standardCleaningFrequencyCatalog
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$book$2d$v2$2f$resolveCleaningFrequencyRpc$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/book-v2/resolveCleaningFrequencyRpc.ts [app-ssr] (ecmascript)");
;
/** When the DB only has recurring `pricing_frequencies` rows, quote/refine still need a one-time option. */ function withSyntheticOneTimeRow(rows) {
    if (!rows.length || rows.some((r)=>!r.is_recurring)) return rows;
    const synthetic = {
        frequency_key: "synthetic_one_time",
        frequency_label: "One-time",
        discount_label: null,
        is_recurring: false
    };
    return [
        synthetic,
        ...rows
    ];
}
function standardCleaningFrequencyCatalog(rows) {
    return withSyntheticOneTimeRow(rows ?? []);
}
function frequencySelectionLabel(selection, rows) {
    if (!rows?.length) {
        const m = {
            one_time: "One-time",
            weekly: "Weekly",
            biweekly: "Every 2 weeks",
            monthly: "Monthly"
        };
        return m[selection] ?? selection;
    }
    const rpc = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$book$2d$v2$2f$resolveCleaningFrequencyRpc$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["resolveRpcFrequencyKey"])(selection, rows);
    const row = rows.find((r)=>r.frequency_key === rpc) ?? (!rpc ? rows.find((r)=>!r.is_recurring) : undefined);
    if (row) return (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$book$2d$v2$2f$resolveCleaningFrequencyRpc$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["formatFrequencyRowDisplayLabel"])(row);
    return selection === "one_time" ? "One-time" : selection;
}
function catalogFrequencyChoices(rows, campaignRecurringOnly) {
    const raw = rows ?? [];
    const base = campaignRecurringOnly ? raw.filter((r)=>r.is_recurring) : standardCleaningFrequencyCatalog(raw);
    if (!base.length) {
        const keys = campaignRecurringOnly ? [
            "weekly",
            "biweekly",
            "monthly"
        ] : [
            "one_time",
            "weekly",
            "biweekly",
            "monthly"
        ];
        return keys.map((value)=>({
                value,
                label: frequencySelectionLabel(value, [])
            }));
    }
    const seen = new Set();
    const out = [];
    for (const r of base){
        const value = r.is_recurring ? r.frequency_key : "one_time";
        if (seen.has(value)) continue;
        seen.add(value);
        out.push({
            value,
            label: (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$book$2d$v2$2f$resolveCleaningFrequencyRpc$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["formatFrequencyRowDisplayLabel"])(r)
        });
    }
    const oneTime = out.filter((o)=>o.value === "one_time");
    const recurring = out.filter((o)=>o.value !== "one_time");
    return [
        ...oneTime,
        ...recurring
    ];
}
}),
"[project]/lib/fields/resolveOptionSetOptions.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
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
"[project]/lib/book-v2/loadCleaningPricingCatalog.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
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
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$fields$2f$resolveOptionSetOptions$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/fields/resolveOptionSetOptions.ts [app-ssr] (ecmascript)");
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
        const opts = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$fields$2f$resolveOptionSetOptions$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["resolveOptionSetOptions"])(supabase, orgId.trim(), "square_footage_tier");
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
"[project]/lib/book-v2/bookingBedBathOptions.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Emergency fallback only: public quote UIs should load bedroom/bathroom **select options** from
 * GET /api/public/field-definitions (option_set_key bedrooms_booking / bathrooms_booking).
 * Keep these values aligned with `option_set_items.item_key` for those sets.
 */ __turbopack_context__.s([
    "BOOKING_BATHROOM_OPTIONS",
    ()=>BOOKING_BATHROOM_OPTIONS,
    "BOOKING_BEDROOM_OPTIONS",
    ()=>BOOKING_BEDROOM_OPTIONS,
    "formatBedBathOptionValueForDisplay",
    ()=>formatBedBathOptionValueForDisplay
]);
const BOOKING_BEDROOM_OPTIONS = [
    {
        value: "studio",
        label: "Studio"
    },
    {
        value: "1",
        label: "1"
    },
    {
        value: "2",
        label: "2"
    },
    {
        value: "3",
        label: "3"
    },
    {
        value: "4",
        label: "4"
    },
    {
        value: "5_plus",
        label: "5+"
    }
];
const BOOKING_BATHROOM_OPTIONS = [
    {
        value: "1",
        label: "1"
    },
    {
        value: "1_5",
        label: "1.5"
    },
    {
        value: "2",
        label: "2"
    },
    {
        value: "2_5",
        label: "2.5"
    },
    {
        value: "3",
        label: "3"
    },
    {
        value: "4_plus",
        label: "4+"
    }
];
function formatBedBathOptionValueForDisplay(fieldKey, value) {
    if (fieldKey === "bedrooms" || fieldKey === "bathrooms") {
        const v = value.trim();
        if (!v) return value;
        if (/_plus$/i.test(v)) return `${v.replace(/_plus$/i, "")}+`;
        return v.replace(/_/g, ".");
    }
    return value;
}
}),
"[project]/lib/public/fetchPublicFieldDefinitions.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "bookingBathroomSelectOptionsFromFields",
    ()=>bookingBathroomSelectOptionsFromFields,
    "bookingBedroomSelectOptionsFromFields",
    ()=>bookingBedroomSelectOptionsFromFields,
    "fetchPublicFieldDefinitions",
    ()=>fetchPublicFieldDefinitions,
    "fieldOptionsByKey",
    ()=>fieldOptionsByKey,
    "homeTypeSelectOptionsFromBookingConfig",
    ()=>homeTypeSelectOptionsFromBookingConfig,
    "squareFootageSelectOptionsFromBookingConfig",
    ()=>squareFootageSelectOptionsFromBookingConfig,
    "squareFootageSelectOptionsFromLocationFields",
    ()=>squareFootageSelectOptionsFromLocationFields
]);
async function fetchPublicFieldDefinitions(params) {
    const q = new URLSearchParams({
        entity_type: params.entityType
    });
    if (params.verticalSlug?.trim()) q.set("vertical_slug", params.verticalSlug.trim());
    if (params.sectionKeys?.length) q.set("section_keys", params.sectionKeys.join(","));
    const res = await fetch(`/api/public/field-definitions?${q.toString()}`);
    return await res.json();
}
function fieldOptionsByKey(fields, fieldKey) {
    const f = fields?.find((x)=>x.field_key === fieldKey);
    if (!f?.options?.length) return null;
    return f.options;
}
function bookingBedroomSelectOptionsFromFields(fields) {
    return fieldOptionsByKey(fields, "bedrooms") ?? fieldOptionsByKey(fields, "beds");
}
function bookingBathroomSelectOptionsFromFields(fields) {
    return fieldOptionsByKey(fields, "bathrooms") ?? fieldOptionsByKey(fields, "baths");
}
function homeTypeSelectOptionsFromBookingConfig(home_types) {
    if (!home_types?.length) return null;
    return home_types.map((h)=>({
            value: String(h.key).trim(),
            label: h.label && String(h.label).trim() || String(h.key).trim()
        }));
}
function squareFootageSelectOptionsFromBookingConfig(tiers) {
    if (!tiers?.length) return null;
    return tiers.map((t)=>({
            value: String(t.sqft_key).trim(),
            label: t.sqft_label && String(t.sqft_label).trim() || String(t.sqft_key).trim()
        }));
}
function squareFootageSelectOptionsFromLocationFields(fields) {
    return fieldOptionsByKey(fields, "square_footage_tier") ?? fieldOptionsByKey(fields, "square_footage");
}
}),
"[project]/lib/book-v2/specialtyQuotePhotos.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/** Form field names + API multipart keys for specialty quote photo slots (AI / ops review). */ __turbopack_context__.s([
    "MAX_SPECIALTY_QUOTE_PHOTO_BYTES",
    ()=>MAX_SPECIALTY_QUOTE_PHOTO_BYTES,
    "SPECIALTY_QUOTE_PHOTO_ACCEPT",
    ()=>SPECIALTY_QUOTE_PHOTO_ACCEPT,
    "SPECIALTY_QUOTE_PHOTO_DOC_TYPE",
    ()=>SPECIALTY_QUOTE_PHOTO_DOC_TYPE,
    "SPECIALTY_QUOTE_PHOTO_FORM_KEYS",
    ()=>SPECIALTY_QUOTE_PHOTO_FORM_KEYS,
    "SPECIALTY_QUOTE_PHOTO_LABELS",
    ()=>SPECIALTY_QUOTE_PHOTO_LABELS,
    "SPECIALTY_QUOTE_PHOTO_SEMANTIC_SLOT_BY_FORM_KEY",
    ()=>SPECIALTY_QUOTE_PHOTO_SEMANTIC_SLOT_BY_FORM_KEY,
    "SPECIALTY_QUOTE_PHOTO_SLOT_METADATA_KEY",
    ()=>SPECIALTY_QUOTE_PHOTO_SLOT_METADATA_KEY
]);
const SPECIALTY_QUOTE_PHOTO_FORM_KEYS = [
    "photo_living_room",
    "photo_kitchen",
    "photo_master_bedroom",
    "photo_master_bathroom"
];
const SPECIALTY_QUOTE_PHOTO_DOC_TYPE = "specialty_quote_photo";
const SPECIALTY_QUOTE_PHOTO_SLOT_METADATA_KEY = "specialty_quote_photo_slot";
const SPECIALTY_QUOTE_PHOTO_SEMANTIC_SLOT_BY_FORM_KEY = {
    photo_living_room: "living_room",
    photo_kitchen: "kitchen",
    photo_master_bedroom: "master_bedroom",
    photo_master_bathroom: "master_bathroom"
};
const SPECIALTY_QUOTE_PHOTO_LABELS = {
    photo_living_room: "Living room",
    photo_kitchen: "Kitchen",
    photo_master_bedroom: "Master bedroom",
    photo_master_bathroom: "Master bathroom"
};
const MAX_SPECIALTY_QUOTE_PHOTO_BYTES = 10 * 1024 * 1024;
const SPECIALTY_QUOTE_PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";
}),
"[project]/components/cleaning/CleaningQuickQuoteForm.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>CleaningQuickQuoteForm
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$book$2d$v2$2f$catalogFrequencyChoices$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/book-v2/catalogFrequencyChoices.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$book$2d$v2$2f$loadCleaningPricingCatalog$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/book-v2/loadCleaningPricingCatalog.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$book$2d$v2$2f$bookingBedBathOptions$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/book-v2/bookingBedBathOptions.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$public$2f$fetchPublicFieldDefinitions$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/public/fetchPublicFieldDefinitions.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$book$2d$v2$2f$specialtyQuotePhotos$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/book-v2/specialtyQuotePhotos.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$book$2d$v2$2f$resolveCleaningFrequencyRpc$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/book-v2/resolveCleaningFrequencyRpc.ts [app-ssr] (ecmascript)");
"use client";
;
;
;
;
;
;
;
;
/** If `specialty_cleaning_type` option set is missing from the org, keep these keys aligned with that set. */ const DOCUMENTED_FALLBACK_SPECIALTY_CLEANING_TYPES = [
    {
        value: "move_out",
        label: "Move-out cleaning"
    },
    {
        value: "heavy_clean",
        label: "Heavy / deep cleaning"
    }
];
function CleaningQuickQuoteForm({ onComplete, campaignQuoteMode, onSwitchToStandardQuote }) {
    const isCampaignFirstFree = campaignQuoteMode?.id === "firstfree4x120";
    const [locationFieldDefs, setLocationFieldDefs] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])([]);
    const [opportunitySpecialtyFieldDefs, setOpportunitySpecialtyFieldDefs] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])([]);
    const [pricingFreqRows, setPricingFreqRows] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])([]);
    const [bookingCfgSqft, setBookingCfgSqft] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [bookingCfgHomeTypes, setBookingCfgHomeTypes] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [bookingCfgBedroomOpts, setBookingCfgBedroomOpts] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [bookingCfgBathroomOpts, setBookingCfgBathroomOpts] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [bookingCfgCleaningTypeOpts, setBookingCfgCleaningTypeOpts] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [bookingCfgSpecialtyOpts, setBookingCfgSpecialtyOpts] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        let cancelled = false;
        Promise.all([
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$public$2f$fetchPublicFieldDefinitions$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["fetchPublicFieldDefinitions"])({
                entityType: "location",
                verticalSlug: "cleaning"
            }),
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$public$2f$fetchPublicFieldDefinitions$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["fetchPublicFieldDefinitions"])({
                entityType: "opportunity",
                sectionKeys: [
                    "specialty_quote"
                ]
            }),
            fetch("/api/public/booking-config").then((r)=>r.json())
        ]).then(([loc, opp, cfg])=>{
            if (cancelled) return;
            if (loc?.ok && Array.isArray(loc.fields)) setLocationFieldDefs(loc.fields);
            else setLocationFieldDefs([]);
            if (opp?.ok && Array.isArray(opp.fields)) setOpportunitySpecialtyFieldDefs(opp.fields);
            else setOpportunitySpecialtyFieldDefs([]);
            const data = cfg;
            if (data?.ok && data.pricing_frequencies?.length) setPricingFreqRows(data.pricing_frequencies);
            if (data?.ok) {
                setBookingCfgSqft(data.square_footage_tiers?.length ? data.square_footage_tiers : null);
                setBookingCfgHomeTypes(data.home_types?.length ? data.home_types : null);
                setBookingCfgBedroomOpts(data.bedroom_options?.length ? data.bedroom_options : null);
                setBookingCfgBathroomOpts(data.bathroom_options?.length ? data.bathroom_options : null);
                setBookingCfgCleaningTypeOpts(data.cleaning_type_options?.length ? data.cleaning_type_options : null);
                setBookingCfgSpecialtyOpts(data.specialty_cleaning_type_options?.length ? data.specialty_cleaning_type_options : null);
            } else {
                setBookingCfgSqft(null);
                setBookingCfgHomeTypes(null);
                setBookingCfgBedroomOpts(null);
                setBookingCfgBathroomOpts(null);
                setBookingCfgCleaningTypeOpts(null);
                setBookingCfgSpecialtyOpts(null);
            }
        }).catch(()=>{
            if (!cancelled) {
                setLocationFieldDefs([]);
                setOpportunitySpecialtyFieldDefs([]);
                setBookingCfgSqft(null);
                setBookingCfgHomeTypes(null);
                setBookingCfgBedroomOpts(null);
                setBookingCfgBathroomOpts(null);
                setBookingCfgCleaningTypeOpts(null);
                setBookingCfgSpecialtyOpts(null);
            }
        });
        return ()=>{
            cancelled = true;
        };
    }, []);
    const squareFootageOptions = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        const fromDefs = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$public$2f$fetchPublicFieldDefinitions$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["squareFootageSelectOptionsFromLocationFields"])(locationFieldDefs);
        if (fromDefs?.length) return fromDefs;
        const fromCfg = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$public$2f$fetchPublicFieldDefinitions$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["squareFootageSelectOptionsFromBookingConfig"])(bookingCfgSqft ?? undefined);
        if (fromCfg?.length) return fromCfg;
        return __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$book$2d$v2$2f$loadCleaningPricingCatalog$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["FALLBACK_SQFT_TIERS"].map((t)=>({
                value: t.sqft_key,
                label: t.sqft_label ?? t.sqft_key
            }));
    }, [
        locationFieldDefs,
        bookingCfgSqft
    ]);
    const homeTypeOptions = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$public$2f$fetchPublicFieldDefinitions$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["fieldOptionsByKey"])(locationFieldDefs, "home_type") ?? (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$public$2f$fetchPublicFieldDefinitions$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["homeTypeSelectOptionsFromBookingConfig"])(bookingCfgHomeTypes ?? undefined) ?? [
            {
                value: "house",
                label: "House"
            },
            {
                value: "condo",
                label: "Condo"
            },
            {
                value: "apartment",
                label: "Apartment"
            },
            {
                value: "townhome",
                label: "Townhome"
            }
        ];
    }, [
        locationFieldDefs,
        bookingCfgHomeTypes
    ]);
    const bedOptions = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$public$2f$fetchPublicFieldDefinitions$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["bookingBedroomSelectOptionsFromFields"])(locationFieldDefs) ?? (bookingCfgBedroomOpts?.length ? bookingCfgBedroomOpts : null) ?? __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$book$2d$v2$2f$bookingBedBathOptions$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["BOOKING_BEDROOM_OPTIONS"];
    }, [
        locationFieldDefs,
        bookingCfgBedroomOpts
    ]);
    const bathOptions = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$public$2f$fetchPublicFieldDefinitions$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["bookingBathroomSelectOptionsFromFields"])(locationFieldDefs) ?? (bookingCfgBathroomOpts?.length ? bookingCfgBathroomOpts : null) ?? __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$book$2d$v2$2f$bookingBedBathOptions$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["BOOKING_BATHROOM_OPTIONS"];
    }, [
        locationFieldDefs,
        bookingCfgBathroomOpts
    ]);
    const cleaningTypeSelectOptions = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        // Canonical: unified cleaning_type (option set), else legacy specialty_cleaning_type (bridged)
        const fromDefsUnified = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$public$2f$fetchPublicFieldDefinitions$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["fieldOptionsByKey"])(opportunitySpecialtyFieldDefs, "cleaning_type");
        const fromDefsLegacy = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$public$2f$fetchPublicFieldDefinitions$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["fieldOptionsByKey"])(opportunitySpecialtyFieldDefs, "specialty_cleaning_type");
        const fromCfgUnified = bookingCfgCleaningTypeOpts?.length ? bookingCfgCleaningTypeOpts : null;
        const fromCfgLegacy = bookingCfgSpecialtyOpts?.length ? bookingCfgSpecialtyOpts : null;
        const source = (fromDefsUnified?.length ? fromDefsUnified : null) ?? (fromCfgUnified?.length ? fromCfgUnified : null) ?? (fromDefsLegacy?.length ? fromDefsLegacy : null) ?? (fromCfgLegacy?.length ? fromCfgLegacy : null);
        if (source?.length) {
            return source.map((o)=>({
                    value: o.value,
                    label: o.label
                }));
        }
        // Back-compat fallback: keep old documented list
        return [
            {
                value: "standard",
                label: "Standard cleaning"
            },
            ...DOCUMENTED_FALLBACK_SPECIALTY_CLEANING_TYPES
        ];
    }, [
        opportunitySpecialtyFieldDefs,
        bookingCfgCleaningTypeOpts,
        bookingCfgSpecialtyOpts
    ]);
    const [cleaningType, setCleaningType] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("standard");
    const [form, setForm] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])({
        first_name: "",
        last_name: "",
        zip: "",
        square_footage: "",
        cleaning_frequency_key: isCampaignFirstFree ? "weekly" : "",
        email: "",
        phone: "",
        street_address: "",
        city: "",
        preferred_service_date: "",
        home_type: "",
        beds: "",
        baths: "",
        specialty_notes: ""
    });
    const [specialtyPhotos, setSpecialtyPhotos] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])({});
    const quickFreqOptions = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$book$2d$v2$2f$catalogFrequencyChoices$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["catalogFrequencyChoices"])(pricingFreqRows, isCampaignFirstFree), [
        pricingFreqRows,
        isCampaignFirstFree
    ]);
    const isSpecialtyCleaning = cleaningType === "move_out" || cleaningType === "heavy_clean";
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (!pricingFreqRows.length) return;
        setForm((f)=>{
            if (f.cleaning_frequency_key && f.cleaning_frequency_key.trim()) return f;
            const opts = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$book$2d$v2$2f$catalogFrequencyChoices$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["catalogFrequencyChoices"])(pricingFreqRows, isCampaignFirstFree);
            const next = isCampaignFirstFree ? opts[0]?.value ?? "weekly" : opts.find((o)=>o.value === "one_time")?.value ?? opts[0]?.value ?? "one_time";
            return {
                ...f,
                cleaning_frequency_key: next
            };
        });
    }, [
        pricingFreqRows,
        isCampaignFirstFree
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (!isCampaignFirstFree || !pricingFreqRows.length) return;
        setForm((f)=>{
            if (f.cleaning_frequency_key && f.cleaning_frequency_key !== "one_time") return f;
            const firstRec = pricingFreqRows.find((r)=>r.is_recurring);
            return {
                ...f,
                cleaning_frequency_key: firstRec?.frequency_key ?? "weekly"
            };
        });
    }, [
        isCampaignFirstFree,
        pricingFreqRows
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (!isSpecialtyCleaning) return;
        setForm((f)=>({
                ...f,
                cleaning_frequency_key: "one_time"
            }));
    }, [
        isSpecialtyCleaning,
        cleaningType
    ]);
    const [submitting, setSubmitting] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [handoffVisible, setHandoffVisible] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [error, setError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [smsConsent, setSmsConsent] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [consentError, setConsentError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [specialtyDone, setSpecialtyDone] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const setSpecialtyPhoto = (key, file)=>{
        setSpecialtyPhotos((prev)=>({
                ...prev,
                [key]: file
            }));
    };
    const handleSubmit = async (e)=>{
        e.preventDefault();
        const { first_name, last_name, zip, square_footage, cleaning_frequency_key, email, phone, street_address, city, preferred_service_date, home_type, beds, baths, specialty_notes } = form;
        if (!first_name?.trim()) {
            setError("First name is required.");
            return;
        }
        if (!last_name?.trim()) {
            setError("Last name is required.");
            return;
        }
        if (!zip.trim()) {
            setError("ZIP code is required");
            return;
        }
        if (!square_footage?.trim()) {
            setError("Please select approximate square footage.");
            return;
        }
        if (!phone?.trim()) {
            setError("Phone number is required.");
            return;
        }
        if (!email?.trim()) {
            setError("Please enter your email so we can save your quote.");
            return;
        }
        if (isSpecialtyCleaning) {
            if (!street_address.trim() || !city.trim()) {
                setError("Street address and city are required.");
                return;
            }
            if (!preferred_service_date.trim()) {
                setError("Preferred service date is required.");
                return;
            }
            if (!home_type.trim()) {
                setError("Please select a home type.");
                return;
            }
            if (!beds.trim() || !baths.trim()) {
                setError("Beds and baths are required.");
                return;
            }
            for (const key of __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$book$2d$v2$2f$specialtyQuotePhotos$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["SPECIALTY_QUOTE_PHOTO_FORM_KEYS"]){
                const f = specialtyPhotos[key];
                if (!f || f.size <= 0) {
                    setError(`Please add a photo: ${__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$book$2d$v2$2f$specialtyQuotePhotos$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["SPECIALTY_QUOTE_PHOTO_LABELS"][key]}.`);
                    return;
                }
                if (f.size > __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$book$2d$v2$2f$specialtyQuotePhotos$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["MAX_SPECIALTY_QUOTE_PHOTO_BYTES"]) {
                    setError("Each photo must be 10MB or smaller.");
                    return;
                }
                if (!f.type.startsWith("image/")) {
                    setError("Photos must be JPEG, PNG, or WebP.");
                    return;
                }
            }
        }
        setSubmitting(true);
        setHandoffVisible(false);
        setError(null);
        setConsentError(null);
        let succeeded = false;
        try {
            const identityKeys = [
                "alloy_person_id",
                "alloy_contact_id",
                "alloy_customer_id",
                "alloy_opportunity_id"
            ];
            try {
                identityKeys.forEach((k)=>{
                    localStorage.removeItem(k);
                    sessionStorage.removeItem(k);
                });
            } catch  {
            // ignore
            }
            if (isSpecialtyCleaning) {
                const payload = {
                    cleaning_type: cleaningType,
                    first_name: first_name.trim(),
                    last_name: last_name.trim(),
                    email: email.trim(),
                    phone: phone.trim(),
                    zip: zip.trim(),
                    square_footage: square_footage.trim(),
                    street_address: street_address.trim(),
                    city: city.trim(),
                    preferred_service_date: preferred_service_date.trim(),
                    home_type: home_type.trim(),
                    beds: beds.trim(),
                    baths: baths.trim(),
                    notes: specialty_notes.trim() || undefined,
                    sms_consent: smsConsent,
                    quote_context: {
                        source: "quick_quote_modal",
                        url: ("TURBOPACK compile-time falsy", 0) ? "TURBOPACK unreachable" : ""
                    }
                };
                const fd = new FormData();
                fd.set("payload", JSON.stringify(payload));
                for (const key of __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$book$2d$v2$2f$specialtyQuotePhotos$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["SPECIALTY_QUOTE_PHOTO_FORM_KEYS"]){
                    const file = specialtyPhotos[key];
                    if (file) fd.set(key, file);
                }
                const res = await fetch("/api/book-v2/specialty-quote-start", {
                    method: "POST",
                    body: fd
                });
                const data = await res.json();
                if (!res.ok || !data.ok) {
                    setError(data.message || "Could not save your request. Please try again.");
                    return;
                }
                succeeded = true;
                try {
                    if (data.person_id) localStorage.setItem("alloy_person_id", data.person_id);
                    if (data.opportunity_id) localStorage.setItem("alloy_opportunity_id", data.opportunity_id);
                } catch (e) {
                    console.warn("localStorage set failed:", e);
                }
                setSubmitting(false);
                setSpecialtyDone(true);
                onComplete({
                    kind: "specialty"
                });
                return;
            }
            const freqSel = cleaning_frequency_key && cleaning_frequency_key.trim() || "one_time";
            const res = await fetch("/api/book-v2/quote-start", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    first_name: first_name.trim(),
                    last_name: last_name.trim(),
                    zip: zip.trim(),
                    square_footage: square_footage.trim(),
                    cleaning_frequency: freqSel,
                    cleaning_type: "standard",
                    email: email?.trim() || undefined,
                    phone: phone.trim(),
                    sms_consent: smsConsent
                })
            });
            const data = await res.json();
            if (!res.ok || !data.ok) {
                setError(data.message || "Could not save your quote. Please try again.");
                return;
            }
            succeeded = true;
            try {
                if (data.person_id) localStorage.setItem("alloy_person_id", data.person_id);
                if (data.contact_id) localStorage.setItem("alloy_contact_id", data.contact_id);
                if (data.opportunity_id) localStorage.setItem("alloy_opportunity_id", data.opportunity_id);
            } catch (e) {
                console.warn("localStorage set failed:", e);
            }
            const qo = data.quote_output;
            const rpcK = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$book$2d$v2$2f$resolveCleaningFrequencyRpc$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["resolveRpcFrequencyKey"])(freqSel, pricingFreqRows);
            const legacyK = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$book$2d$v2$2f$resolveCleaningFrequencyRpc$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["inferLegacyCleaningFrequencyApiKey"])(rpcK, pricingFreqRows);
            const storedQuote = {
                status: "ready",
                source: "local_pricing",
                estimated_price: qo?.estimated_price ?? undefined,
                first_clean_price: qo?.first_clean_price ?? qo?.estimated_price ?? undefined,
                recurring_price: qo?.recurring_price ?? undefined,
                frequency_label: qo?.frequency_label ?? "One-time",
                service: "Standard Cleaning",
                price_breakdown: undefined,
                addons: qo?.addons ?? [],
                quote_input: {
                    zip: zip.trim(),
                    square_footage: square_footage.trim(),
                    cleaning_frequency: legacyK,
                    cleaning_frequency_key: rpcK || null,
                    cleaning_type: "standard"
                },
                email: email?.trim() || undefined,
                phone: phone?.trim() || undefined,
                first_name: first_name?.trim() || undefined,
                last_name: last_name?.trim() || undefined
            };
            const quoteJson = JSON.stringify(storedQuote);
            localStorage.setItem("alloy_quote_v1", quoteJson);
            sessionStorage.setItem("alloy_quote_v1", quoteJson);
            try {
                localStorage.setItem("cleaning_quote", quoteJson);
                sessionStorage.setItem("alloy_cleaning_quote", quoteJson);
                sessionStorage.setItem("cleaning_quote", quoteJson);
            } catch (e) {
                console.warn("legacy quote storage set failed:", e);
            }
            const row = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$book$2d$v2$2f$resolveCleaningFrequencyRpc$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["frequencyRowForRpcKey"])(rpcK, pricingFreqRows);
            const cleaningFrequencyLabel = row ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$book$2d$v2$2f$resolveCleaningFrequencyRpc$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["formatFrequencyRowDisplayLabel"])(row) : "One-time";
            const leadFormPayload = {
                first_name: first_name.trim(),
                last_name: last_name.trim(),
                phone: phone.trim(),
                email: email.trim(),
                postal_code: zip.trim(),
                home_type: "Single-Family Home",
                service_type: "Standard Cleaning",
                approximate_square_footage: square_footage.trim(),
                cleaning_frequency: cleaningFrequencyLabel
            };
            try {
                sessionStorage.setItem("alloy_lead_form_data", JSON.stringify(leadFormPayload));
            } catch (e) {
                console.warn("alloy_lead_form_data set failed:", e);
            }
            const prefillData = {
                email: email?.trim() || undefined,
                phone: phone?.trim() || undefined,
                first_name: first_name?.trim() || undefined,
                last_name: last_name?.trim() || undefined,
                zip: zip?.trim() || undefined,
                postal_code: zip?.trim() || undefined
            };
            if (isCampaignFirstFree) {
                prefillData.campaign = "firstfree4x120";
                prefillData.discount_program_code = "FIRSTFREE4X120";
                prefillData.campaign_source = "quote_modal_firstfree4x120";
            }
            const prefillJson = JSON.stringify(prefillData);
            try {
                sessionStorage.setItem("alloy_booking_prefill", prefillJson);
                localStorage.setItem("alloy_booking_prefill", prefillJson);
            } catch (e) {
                console.warn("alloy_booking_prefill set failed:", e);
            }
            setSubmitting(false);
            setHandoffVisible(true);
            requestAnimationFrame(()=>{
                requestAnimationFrame(()=>onComplete({
                        kind: "standard"
                    }));
            });
        } catch (err) {
            console.error("Quote start failed:", err);
            setError("Something went wrong. Please try again.");
        } finally{
            if (!succeeded) setSubmitting(false);
        }
    };
    const labelBase = "block text-xs font-semibold text-alloy-midnight/80 tracking-wider mb-1.5";
    if (specialtyDone) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "rounded-xl border border-alloy-juniper/30 bg-alloy-juniper/10 p-6 text-alloy-midnight",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                    className: "text-lg font-semibold text-alloy-pine mb-2",
                    children: "Thanks — we've got your details"
                }, void 0, false, {
                    fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                    lineNumber: 534,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                    className: "text-sm text-alloy-midnight/80 leading-relaxed",
                    children: [
                        "Our team will review your photos and property details and follow up with a personalized estimate. For instant standard cleaning pricing, you can use",
                        " ",
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                            href: "/book-v2",
                            className: "text-alloy-juniper font-medium underline",
                            children: "book online"
                        }, void 0, false, {
                            fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                            lineNumber: 538,
                            columnNumber: 11
                        }, this),
                        "."
                    ]
                }, void 0, true, {
                    fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                    lineNumber: 535,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
            lineNumber: 533,
            columnNumber: 7
        }, this);
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("form", {
        onSubmit: handleSubmit,
        className: "relative space-y-0",
        children: [
            (submitting || handoffVisible) && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-[inherit] bg-white/93 px-6 text-center backdrop-blur-[1px]",
                "aria-live": "polite",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "h-10 w-10 rounded-full border-[3px] border-alloy-juniper border-t-transparent animate-spin"
                    }, void 0, false, {
                        fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                        lineNumber: 554,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "text-sm font-medium text-alloy-midnight",
                        children: handoffVisible ? "Quote saved — opening booking…" : isSpecialtyCleaning ? "Sending your request…" : "Saving your quote…"
                    }, void 0, false, {
                        fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                        lineNumber: 555,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                lineNumber: 550,
                columnNumber: 9
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "space-y-4 pb-6 border-b border-alloy-stone/50",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "public-form-section-title",
                        children: "Your details"
                    }, void 0, false, {
                        fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                        lineNumber: 566,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "grid grid-cols-1 sm:grid-cols-2 gap-4",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                        className: labelBase,
                                        children: "First name *"
                                    }, void 0, false, {
                                        fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                                        lineNumber: 569,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                        type: "text",
                                        value: form.first_name,
                                        onChange: (e)=>setForm((f)=>({
                                                    ...f,
                                                    first_name: e.target.value
                                                })),
                                        placeholder: "e.g. Jamie",
                                        className: "public-form-input",
                                        maxLength: 80,
                                        autoComplete: "given-name"
                                    }, void 0, false, {
                                        fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                                        lineNumber: 570,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                                lineNumber: 568,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                        className: labelBase,
                                        children: "Last name *"
                                    }, void 0, false, {
                                        fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                                        lineNumber: 581,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                        type: "text",
                                        value: form.last_name,
                                        onChange: (e)=>setForm((f)=>({
                                                    ...f,
                                                    last_name: e.target.value
                                                })),
                                        placeholder: "e.g. Smith",
                                        className: "public-form-input",
                                        maxLength: 80,
                                        autoComplete: "family-name"
                                    }, void 0, false, {
                                        fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                                        lineNumber: 582,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                                lineNumber: 580,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                        lineNumber: 567,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                className: labelBase,
                                children: "ZIP code *"
                            }, void 0, false, {
                                fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                                lineNumber: 594,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                type: "text",
                                value: form.zip,
                                onChange: (e)=>setForm((f)=>({
                                            ...f,
                                            zip: e.target.value
                                        })),
                                placeholder: "e.g. 97702",
                                className: "public-form-input",
                                maxLength: 10
                            }, void 0, false, {
                                fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                                lineNumber: 595,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                        lineNumber: 593,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                lineNumber: 565,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "space-y-4 py-6 border-b border-alloy-stone/50",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "public-form-section-title",
                        children: "Home & schedule"
                    }, void 0, false, {
                        fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                        lineNumber: 608,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                className: labelBase,
                                children: "Cleaning type *"
                            }, void 0, false, {
                                fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                                lineNumber: 610,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                                value: cleaningType,
                                onChange: (e)=>setCleaningType(e.target.value),
                                className: "public-form-input",
                                disabled: isCampaignFirstFree,
                                children: cleaningTypeSelectOptions.map((o)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                        value: o.value,
                                        children: o.label
                                    }, o.value, false, {
                                        fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                                        lineNumber: 618,
                                        columnNumber: 15
                                    }, this))
                            }, void 0, false, {
                                fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                                lineNumber: 611,
                                columnNumber: 11
                            }, this),
                            isCampaignFirstFree ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: "mt-1.5 text-xs text-alloy-midnight/55",
                                children: "This offer applies to standard cleaning only."
                            }, void 0, false, {
                                fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                                lineNumber: 624,
                                columnNumber: 13
                            }, this) : null
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                        lineNumber: 609,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                className: labelBase,
                                children: "Approximate square footage *"
                            }, void 0, false, {
                                fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                                lineNumber: 628,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                                value: form.square_footage,
                                onChange: (e)=>setForm((f)=>({
                                            ...f,
                                            square_footage: e.target.value
                                        })),
                                className: "public-form-input",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                        value: "",
                                        children: "Select"
                                    }, void 0, false, {
                                        fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                                        lineNumber: 634,
                                        columnNumber: 13
                                    }, this),
                                    squareFootageOptions.map((opt)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                            value: opt.value,
                                            children: opt.label
                                        }, opt.value, false, {
                                            fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                                            lineNumber: 636,
                                            columnNumber: 15
                                        }, this))
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                                lineNumber: 629,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                        lineNumber: 627,
                        columnNumber: 9
                    }, this),
                    !isSpecialtyCleaning && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                className: labelBase,
                                children: "Cleaning frequency"
                            }, void 0, false, {
                                fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                                lineNumber: 644,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                                value: form.cleaning_frequency_key || quickFreqOptions[0]?.value || "one_time",
                                onChange: (e)=>setForm((f)=>({
                                            ...f,
                                            cleaning_frequency_key: e.target.value
                                        })),
                                className: "public-form-input",
                                children: quickFreqOptions.map((opt)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                        value: opt.value,
                                        children: opt.label
                                    }, opt.value, false, {
                                        fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                                        lineNumber: 651,
                                        columnNumber: 17
                                    }, this))
                            }, void 0, false, {
                                fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                                lineNumber: 645,
                                columnNumber: 13
                            }, this),
                            isCampaignFirstFree ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "mt-2 space-y-2 text-xs text-alloy-midnight/70 leading-relaxed",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                            className: "text-alloy-midnight",
                                            children: "Recurring cleaning only."
                                        }, void 0, false, {
                                            fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                                            lineNumber: 659,
                                            columnNumber: 19
                                        }, this)
                                    }, void 0, false, {
                                        fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                                        lineNumber: 658,
                                        columnNumber: 17
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        children: "This offer applies to weekly, every-two-weeks, or monthly standard service — not one-time visits."
                                    }, void 0, false, {
                                        fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                                        lineNumber: 661,
                                        columnNumber: 17
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                            className: "text-alloy-midnight",
                                            children: "Looking for a one-time clean?"
                                        }, void 0, false, {
                                            fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                                            lineNumber: 665,
                                            columnNumber: 19
                                        }, this)
                                    }, void 0, false, {
                                        fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                                        lineNumber: 664,
                                        columnNumber: 17
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        children: [
                                            "We offer one-time, move-out, or heavy / deep clean services?",
                                            " ",
                                            onSwitchToStandardQuote ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                type: "button",
                                                onClick: onSwitchToStandardQuote,
                                                className: "text-alloy-juniper font-semibold underline underline-offset-2 hover:text-alloy-pine",
                                                children: "Use the regular quote form"
                                            }, void 0, false, {
                                                fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                                                lineNumber: 670,
                                                columnNumber: 21
                                            }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                                                href: "/",
                                                className: "text-alloy-juniper font-semibold underline underline-offset-2 hover:text-alloy-pine",
                                                children: "Use the regular quote form"
                                            }, void 0, false, {
                                                fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                                                lineNumber: 678,
                                                columnNumber: 21
                                            }, this),
                                            " ",
                                            "instead (same quick quote experience, without this promotion)."
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                                        lineNumber: 667,
                                        columnNumber: 17
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                                lineNumber: 657,
                                columnNumber: 15
                            }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: "mt-1.5 text-xs text-alloy-midnight/55",
                                children: "Move-out and heavy cleans are priced as one-time jobs; choose those under Cleaning type to add details and photos."
                            }, void 0, false, {
                                fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                                lineNumber: 689,
                                columnNumber: 15
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                        lineNumber: 643,
                        columnNumber: 11
                    }, this),
                    isSpecialtyCleaning ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "space-y-4 pt-2 border-t border-alloy-stone/40",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: "rounded-lg border border-alloy-juniper/20 bg-alloy-juniper/5 px-3 py-2 text-xs text-alloy-midnight/80 leading-relaxed",
                                children: "We need a little more information to give you an accurate quote — the next questions and photos help us understand your home."
                            }, void 0, false, {
                                fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                                lineNumber: 698,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: "text-sm font-medium text-alloy-midnight",
                                children: "Property & photos"
                            }, void 0, false, {
                                fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                                lineNumber: 702,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                        className: labelBase,
                                        children: "Street address *"
                                    }, void 0, false, {
                                        fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                                        lineNumber: 704,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                        type: "text",
                                        value: form.street_address,
                                        onChange: (e)=>setForm((f)=>({
                                                    ...f,
                                                    street_address: e.target.value
                                                })),
                                        className: "public-form-input",
                                        autoComplete: "street-address"
                                    }, void 0, false, {
                                        fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                                        lineNumber: 705,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                                lineNumber: 703,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                        className: labelBase,
                                        children: "City *"
                                    }, void 0, false, {
                                        fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                                        lineNumber: 714,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                        type: "text",
                                        value: form.city,
                                        onChange: (e)=>setForm((f)=>({
                                                    ...f,
                                                    city: e.target.value
                                                })),
                                        className: "public-form-input",
                                        autoComplete: "address-level2"
                                    }, void 0, false, {
                                        fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                                        lineNumber: 715,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                                lineNumber: 713,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                        className: labelBase,
                                        children: "Preferred service date *"
                                    }, void 0, false, {
                                        fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                                        lineNumber: 724,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                        type: "date",
                                        value: form.preferred_service_date,
                                        onChange: (e)=>setForm((f)=>({
                                                    ...f,
                                                    preferred_service_date: e.target.value
                                                })),
                                        className: "public-form-input"
                                    }, void 0, false, {
                                        fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                                        lineNumber: 725,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                                lineNumber: 723,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                        className: labelBase,
                                        children: "Home type *"
                                    }, void 0, false, {
                                        fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                                        lineNumber: 733,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                                        value: form.home_type,
                                        onChange: (e)=>setForm((f)=>({
                                                    ...f,
                                                    home_type: e.target.value
                                                })),
                                        className: "public-form-input",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                value: "",
                                                children: "Select"
                                            }, void 0, false, {
                                                fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                                                lineNumber: 739,
                                                columnNumber: 17
                                            }, this),
                                            homeTypeOptions.map((o)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                    value: o.value,
                                                    children: o.label
                                                }, o.value, false, {
                                                    fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                                                    lineNumber: 741,
                                                    columnNumber: 19
                                                }, this))
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                                        lineNumber: 734,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                                lineNumber: 732,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "grid grid-cols-1 sm:grid-cols-2 gap-4",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                className: labelBase,
                                                children: "Beds *"
                                            }, void 0, false, {
                                                fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                                                lineNumber: 749,
                                                columnNumber: 17
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                                                value: form.beds,
                                                onChange: (e)=>setForm((f)=>({
                                                            ...f,
                                                            beds: e.target.value
                                                        })),
                                                className: "public-form-input",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                        value: "",
                                                        children: "Select"
                                                    }, void 0, false, {
                                                        fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                                                        lineNumber: 755,
                                                        columnNumber: 19
                                                    }, this),
                                                    bedOptions.map((opt)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                            value: opt.value,
                                                            children: opt.label
                                                        }, opt.value, false, {
                                                            fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                                                            lineNumber: 757,
                                                            columnNumber: 21
                                                        }, this))
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                                                lineNumber: 750,
                                                columnNumber: 17
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                                        lineNumber: 748,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                className: labelBase,
                                                children: "Baths *"
                                            }, void 0, false, {
                                                fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                                                lineNumber: 764,
                                                columnNumber: 17
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                                                value: form.baths,
                                                onChange: (e)=>setForm((f)=>({
                                                            ...f,
                                                            baths: e.target.value
                                                        })),
                                                className: "public-form-input",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                        value: "",
                                                        children: "Select"
                                                    }, void 0, false, {
                                                        fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                                                        lineNumber: 770,
                                                        columnNumber: 19
                                                    }, this),
                                                    bathOptions.map((opt)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                            value: opt.value,
                                                            children: opt.label
                                                        }, opt.value, false, {
                                                            fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                                                            lineNumber: 772,
                                                            columnNumber: 21
                                                        }, this))
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                                                lineNumber: 765,
                                                columnNumber: 17
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                                        lineNumber: 763,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                                lineNumber: 747,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "space-y-3",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: labelBase,
                                        children: "Photos * (one per room)"
                                    }, void 0, false, {
                                        fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                                        lineNumber: 780,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "text-xs text-alloy-midnight/60 -mt-1 mb-2",
                                        children: "JPEG, PNG, or WebP, up to 10MB each. These help us quote accurately."
                                    }, void 0, false, {
                                        fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                                        lineNumber: 781,
                                        columnNumber: 15
                                    }, this),
                                    __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$book$2d$v2$2f$specialtyQuotePhotos$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["SPECIALTY_QUOTE_PHOTO_FORM_KEYS"].map((key)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                    className: "block text-xs font-medium text-alloy-midnight mb-1",
                                                    children: [
                                                        __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$book$2d$v2$2f$specialtyQuotePhotos$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["SPECIALTY_QUOTE_PHOTO_LABELS"][key],
                                                        " *"
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                                                    lineNumber: 786,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                    type: "file",
                                                    accept: __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$book$2d$v2$2f$specialtyQuotePhotos$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["SPECIALTY_QUOTE_PHOTO_ACCEPT"],
                                                    className: "block w-full text-sm text-alloy-midnight file:mr-3 file:rounded-lg file:border-0 file:bg-alloy-juniper/15 file:px-3 file:py-2 file:text-sm file:font-medium file:text-alloy-pine",
                                                    onChange: (e)=>{
                                                        const file = e.target.files?.[0] ?? null;
                                                        setSpecialtyPhoto(key, file);
                                                    }
                                                }, void 0, false, {
                                                    fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                                                    lineNumber: 789,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, key, true, {
                                            fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                                            lineNumber: 785,
                                            columnNumber: 17
                                        }, this))
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                                lineNumber: 779,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                        className: labelBase,
                                        children: "Notes (optional)"
                                    }, void 0, false, {
                                        fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                                        lineNumber: 802,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("textarea", {
                                        value: form.specialty_notes,
                                        onChange: (e)=>setForm((f)=>({
                                                    ...f,
                                                    specialty_notes: e.target.value
                                                })),
                                        rows: 3,
                                        className: "public-form-input resize-none",
                                        placeholder: "Anything else we should know?"
                                    }, void 0, false, {
                                        fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                                        lineNumber: 803,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                                lineNumber: 801,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                        lineNumber: 697,
                        columnNumber: 11
                    }, this) : null
                ]
            }, void 0, true, {
                fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                lineNumber: 607,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "space-y-4 py-6 border-b border-alloy-stone/50",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "public-form-section-title",
                        children: "How we'll reach you"
                    }, void 0, false, {
                        fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                        lineNumber: 817,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                className: labelBase,
                                children: "Email (so we can save your quote)"
                            }, void 0, false, {
                                fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                                lineNumber: 819,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                type: "email",
                                value: form.email,
                                onChange: (e)=>setForm((f)=>({
                                            ...f,
                                            email: e.target.value
                                        })),
                                placeholder: "you@example.com",
                                className: "public-form-input"
                            }, void 0, false, {
                                fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                                lineNumber: 820,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                        lineNumber: 818,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                className: labelBase,
                                children: "Phone *"
                            }, void 0, false, {
                                fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                                lineNumber: 829,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                type: "tel",
                                required: true,
                                "aria-required": true,
                                value: form.phone,
                                onChange: (e)=>setForm((f)=>({
                                            ...f,
                                            phone: e.target.value
                                        })),
                                placeholder: "(541) 555-0123",
                                className: "public-form-input"
                            }, void 0, false, {
                                fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                                lineNumber: 830,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: "mt-1.5 text-xs text-alloy-midnight/55",
                                children: "Phone is required for booking. SMS is optional — consent below."
                            }, void 0, false, {
                                fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                                lineNumber: 839,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                        lineNumber: 828,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                lineNumber: 816,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "pt-6",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                        className: "flex items-start gap-3 text-sm text-alloy-midnight/80 cursor-pointer",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                type: "checkbox",
                                checked: smsConsent,
                                onChange: (e)=>{
                                    setSmsConsent(e.target.checked);
                                    setConsentError(null);
                                },
                                className: "mt-0.5 h-4 w-4 rounded border-alloy-stone/60 text-alloy-juniper focus:ring-2 focus:ring-alloy-juniper/25 focus:ring-offset-0 transition-colors"
                            }, void 0, false, {
                                fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                                lineNumber: 848,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "leading-relaxed",
                                children: "By checking this box, you agree to receive transactional SMS from Alloy about your quote and appointments. Message and data rates may apply. Reply STOP to opt out. Consent is not required to purchase."
                            }, void 0, false, {
                                fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                                lineNumber: 857,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                        lineNumber: 847,
                        columnNumber: 9
                    }, this),
                    consentError && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "mt-2 text-sm text-red-600",
                        children: consentError
                    }, void 0, false, {
                        fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                        lineNumber: 862,
                        columnNumber: 26
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                lineNumber: 846,
                columnNumber: 7
            }, this),
            error && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2",
                children: error
            }, void 0, false, {
                fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                lineNumber: 866,
                columnNumber: 9
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                type: "submit",
                disabled: submitting,
                className: "public-form-cta public-btn-primary mt-6 disabled:opacity-50 disabled:cursor-not-allowed",
                children: submitting ? "Saving…" : isCampaignFirstFree ? "Get my recurring quote" : isSpecialtyCleaning ? "Submit for estimate" : "Get my quote"
            }, void 0, false, {
                fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
                lineNumber: 869,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/components/cleaning/CleaningQuickQuoteForm.tsx",
        lineNumber: 548,
        columnNumber: 5
    }, this);
}
}),
"[project]/lib/ui.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Shared UI constants
 */ __turbopack_context__.s([
    "REDIRECT_DELAY_MS",
    ()=>REDIRECT_DELAY_MS
]);
const REDIRECT_DELAY_MS = 3000; // 3 seconds
}),
"[project]/components/gutters/GutterLeadForm.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>GutterLeadForm
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/navigation.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$PrimaryButton$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/components/PrimaryButton.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$ui$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/ui.ts [app-ssr] (ecmascript)");
"use client";
;
;
;
;
;
function GutterLeadForm({ onSuccess } = {}) {
    const router = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRouter"])();
    const [form, setForm] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])({
        first_name: "",
        last_name: "",
        phone: "",
        email: "",
        address_line1: "",
        city: "",
        notes: ""
    });
    const [errors, setErrors] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])({});
    const [isSubmitting, setIsSubmitting] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [submitStatus, setSubmitStatus] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])({
        type: null,
        message: ""
    });
    // Auto-redirect after delay on success
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (submitStatus.type === "success") {
            // Call onSuccess callback if provided (e.g., to close modal)
            if (onSuccess) {
                onSuccess();
            }
            const timer = setTimeout(()=>{
                router.push("/");
            }, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$ui$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["REDIRECT_DELAY_MS"]);
            return ()=>clearTimeout(timer);
        }
    }, [
        submitStatus.type,
        router,
        onSuccess
    ]);
    const validate = ()=>{
        const newErrors = {};
        if (!form.first_name.trim()) {
            newErrors.first_name = "First name is required";
        }
        if (!form.last_name.trim()) {
            newErrors.last_name = "Last name is required";
        }
        // Require at least phone OR email
        if (!form.phone.trim() && !form.email.trim()) {
            newErrors.phone = "Phone or email is required";
            newErrors.email = "Phone or email is required";
        }
        // Validate email format if provided
        if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
            newErrors.email = "Please enter a valid email address";
        }
        // Validate phone format if provided (basic: at least 10 digits)
        if (form.phone.trim()) {
            const digitsOnly = form.phone.replace(/\D/g, "");
            if (digitsOnly.length < 10) {
                newErrors.phone = "Please enter a valid phone number";
            }
        }
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };
    const handleSubmit = async (e)=>{
        e.preventDefault();
        if (!validate()) {
            return;
        }
        setIsSubmitting(true);
        setSubmitStatus({
            type: null,
            message: ""
        });
        try {
            const response = await fetch("/api/leads/gutters", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    first_name: form.first_name.trim(),
                    last_name: form.last_name.trim(),
                    phone: form.phone.trim(),
                    email: form.email.trim() || undefined,
                    address_line1: form.address_line1.trim() || undefined,
                    city: form.city.trim() || undefined,
                    notes: form.notes.trim() || undefined
                })
            });
            const data = await response.json();
            if (!response.ok || !data.ok) {
                throw new Error(data.error || "Failed to submit. Please try again.");
            }
            setSubmitStatus({
                type: "success",
                message: "Thank you! We've received your information and will notify you when gutter cleaning becomes available in your area."
            });
            // Reset form on success
            setForm({
                first_name: "",
                last_name: "",
                phone: "",
                email: "",
                address_line1: "",
                city: "",
                notes: ""
            });
        } catch (error) {
            setSubmitStatus({
                type: "error",
                message: error.message || "Something went wrong. Please try again."
            });
        } finally{
            setIsSubmitting(false);
        }
    };
    // Match cleaning form styling exactly
    const labelClass = "block text-xs font-semibold tracking-wide mb-1 text-alloy-midnight/70";
    const inputBase = "w-full rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2";
    const inputClass = inputBase + " border border-alloy-stone/80 bg-white focus:ring-alloy-blue focus:border-alloy-blue";
    const errorInputClass = inputBase + " border-red-500 bg-white focus:ring-red-500 focus:border-red-500";
    // If success, only show thank-you message
    if (submitStatus.type === "success") {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "bg-white rounded-lg shadow-md p-6 md:p-8 border border-alloy-stone/30",
            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "rounded-lg border border-alloy-juniper/30 bg-alloy-juniper/10 p-6 text-center",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "text-lg font-semibold text-alloy-midnight mb-2",
                        children: submitStatus.message
                    }, void 0, false, {
                        fileName: "[project]/components/gutters/GutterLeadForm.tsx",
                        lineNumber: 163,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "text-xs text-alloy-midnight/60",
                        children: "Redirecting to homepage..."
                    }, void 0, false, {
                        fileName: "[project]/components/gutters/GutterLeadForm.tsx",
                        lineNumber: 166,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/gutters/GutterLeadForm.tsx",
                lineNumber: 162,
                columnNumber: 9
            }, this)
        }, void 0, false, {
            fileName: "[project]/components/gutters/GutterLeadForm.tsx",
            lineNumber: 161,
            columnNumber: 7
        }, this);
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "bg-white rounded-lg shadow-md p-6 md:p-8 border border-alloy-stone/30",
        children: [
            submitStatus.type === "error" && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "mb-6 p-4 bg-red-50 border border-red-200 rounded-md text-red-800 text-sm",
                children: submitStatus.message
            }, void 0, false, {
                fileName: "[project]/components/gutters/GutterLeadForm.tsx",
                lineNumber: 177,
                columnNumber: 9
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("form", {
                onSubmit: handleSubmit,
                className: "space-y-4",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "grid grid-cols-1 md:grid-cols-2 gap-4",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                        htmlFor: "first_name",
                                        className: labelClass,
                                        children: [
                                            "First Name ",
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "text-red-500",
                                                children: "*"
                                            }, void 0, false, {
                                                fileName: "[project]/components/gutters/GutterLeadForm.tsx",
                                                lineNumber: 186,
                                                columnNumber: 26
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/components/gutters/GutterLeadForm.tsx",
                                        lineNumber: 185,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                        type: "text",
                                        id: "first_name",
                                        value: form.first_name,
                                        onChange: (e)=>setForm({
                                                ...form,
                                                first_name: e.target.value
                                            }),
                                        className: errors.first_name ? errorInputClass : inputClass,
                                        required: true
                                    }, void 0, false, {
                                        fileName: "[project]/components/gutters/GutterLeadForm.tsx",
                                        lineNumber: 188,
                                        columnNumber: 13
                                    }, this),
                                    errors.first_name && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "mt-1 text-xs text-red-600",
                                        children: errors.first_name
                                    }, void 0, false, {
                                        fileName: "[project]/components/gutters/GutterLeadForm.tsx",
                                        lineNumber: 199,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/gutters/GutterLeadForm.tsx",
                                lineNumber: 184,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                        htmlFor: "last_name",
                                        className: labelClass,
                                        children: [
                                            "Last Name ",
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "text-red-500",
                                                children: "*"
                                            }, void 0, false, {
                                                fileName: "[project]/components/gutters/GutterLeadForm.tsx",
                                                lineNumber: 205,
                                                columnNumber: 25
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/components/gutters/GutterLeadForm.tsx",
                                        lineNumber: 204,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                        type: "text",
                                        id: "last_name",
                                        value: form.last_name,
                                        onChange: (e)=>setForm({
                                                ...form,
                                                last_name: e.target.value
                                            }),
                                        className: errors.last_name ? errorInputClass : inputClass,
                                        required: true
                                    }, void 0, false, {
                                        fileName: "[project]/components/gutters/GutterLeadForm.tsx",
                                        lineNumber: 207,
                                        columnNumber: 13
                                    }, this),
                                    errors.last_name && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "mt-1 text-xs text-red-600",
                                        children: errors.last_name
                                    }, void 0, false, {
                                        fileName: "[project]/components/gutters/GutterLeadForm.tsx",
                                        lineNumber: 218,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/gutters/GutterLeadForm.tsx",
                                lineNumber: 203,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/gutters/GutterLeadForm.tsx",
                        lineNumber: 183,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "grid grid-cols-1 md:grid-cols-2 gap-4",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                        htmlFor: "phone",
                                        className: labelClass,
                                        children: [
                                            "Phone ",
                                            !form.email.trim() && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "text-red-500",
                                                children: "*"
                                            }, void 0, false, {
                                                fileName: "[project]/components/gutters/GutterLeadForm.tsx",
                                                lineNumber: 226,
                                                columnNumber: 44
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/components/gutters/GutterLeadForm.tsx",
                                        lineNumber: 225,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                        type: "tel",
                                        id: "phone",
                                        value: form.phone,
                                        onChange: (e)=>setForm({
                                                ...form,
                                                phone: e.target.value
                                            }),
                                        placeholder: "(555) 123-4567",
                                        className: errors.phone ? errorInputClass : inputClass
                                    }, void 0, false, {
                                        fileName: "[project]/components/gutters/GutterLeadForm.tsx",
                                        lineNumber: 228,
                                        columnNumber: 13
                                    }, this),
                                    errors.phone && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "mt-1 text-xs text-red-600",
                                        children: errors.phone
                                    }, void 0, false, {
                                        fileName: "[project]/components/gutters/GutterLeadForm.tsx",
                                        lineNumber: 237,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/gutters/GutterLeadForm.tsx",
                                lineNumber: 224,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                        htmlFor: "email",
                                        className: labelClass,
                                        children: [
                                            "Email ",
                                            !form.phone.trim() && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "text-red-500",
                                                children: "*"
                                            }, void 0, false, {
                                                fileName: "[project]/components/gutters/GutterLeadForm.tsx",
                                                lineNumber: 243,
                                                columnNumber: 44
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/components/gutters/GutterLeadForm.tsx",
                                        lineNumber: 242,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                        type: "email",
                                        id: "email",
                                        value: form.email,
                                        onChange: (e)=>setForm({
                                                ...form,
                                                email: e.target.value
                                            }),
                                        placeholder: "you@example.com",
                                        className: errors.email ? errorInputClass : inputClass
                                    }, void 0, false, {
                                        fileName: "[project]/components/gutters/GutterLeadForm.tsx",
                                        lineNumber: 245,
                                        columnNumber: 13
                                    }, this),
                                    errors.email && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "mt-1 text-xs text-red-600",
                                        children: errors.email
                                    }, void 0, false, {
                                        fileName: "[project]/components/gutters/GutterLeadForm.tsx",
                                        lineNumber: 254,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/gutters/GutterLeadForm.tsx",
                                lineNumber: 241,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/gutters/GutterLeadForm.tsx",
                        lineNumber: 223,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                htmlFor: "address_line1",
                                className: labelClass,
                                children: "Address"
                            }, void 0, false, {
                                fileName: "[project]/components/gutters/GutterLeadForm.tsx",
                                lineNumber: 260,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                type: "text",
                                id: "address_line1",
                                value: form.address_line1,
                                onChange: (e)=>setForm({
                                        ...form,
                                        address_line1: e.target.value
                                    }),
                                placeholder: "123 Main St",
                                className: inputClass
                            }, void 0, false, {
                                fileName: "[project]/components/gutters/GutterLeadForm.tsx",
                                lineNumber: 263,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/gutters/GutterLeadForm.tsx",
                        lineNumber: 259,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                htmlFor: "notes",
                                className: labelClass,
                                children: "Notes"
                            }, void 0, false, {
                                fileName: "[project]/components/gutters/GutterLeadForm.tsx",
                                lineNumber: 276,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("textarea", {
                                id: "notes",
                                value: form.notes,
                                onChange: (e)=>setForm({
                                        ...form,
                                        notes: e.target.value
                                    }),
                                rows: 4,
                                placeholder: "Any additional information about your gutter cleaning needs...",
                                className: inputClass
                            }, void 0, false, {
                                fileName: "[project]/components/gutters/GutterLeadForm.tsx",
                                lineNumber: 279,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/gutters/GutterLeadForm.tsx",
                        lineNumber: 275,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "pt-2 flex justify-center",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$PrimaryButton$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                            type: "submit",
                            disabled: isSubmitting,
                            className: "w-full md:w-auto",
                            children: isSubmitting ? "Submitting..." : "Get Early Access Discount"
                        }, void 0, false, {
                            fileName: "[project]/components/gutters/GutterLeadForm.tsx",
                            lineNumber: 290,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/components/gutters/GutterLeadForm.tsx",
                        lineNumber: 289,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/gutters/GutterLeadForm.tsx",
                lineNumber: 182,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/components/gutters/GutterLeadForm.tsx",
        lineNumber: 175,
        columnNumber: 5
    }, this);
}
}),
"[project]/components/QuoteModal.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>QuoteModal
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$dom$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-dom.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/navigation.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$cleaning$2f$CleaningQuickQuoteForm$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/components/cleaning/CleaningQuickQuoteForm.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$gutters$2f$GutterLeadForm$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/components/gutters/GutterLeadForm.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$ui$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/ui.ts [app-ssr] (ecmascript)");
"use client";
;
;
;
;
;
;
;
function QuoteModal({ isOpen, onClose, openModal, defaultService, campaignQuoteFlow = null, invokeCampaignQuoteComplete }) {
    const router = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRouter"])();
    const handleSwitchToStandardQuote = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(()=>{
        onClose();
        if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
        ;
        const run = ()=>openModal({
                defaultService: "cleaning",
                campaignQuoteFlow: null
            });
        if (typeof queueMicrotask === "function") queueMicrotask(run);
        else void Promise.resolve().then(run);
    }, [
        onClose,
        openModal
    ]);
    const [selectedVertical, setSelectedVertical] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [modalStep, setModalStep] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("picker");
    const [mounted, setMounted] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [transitionState, setTransitionState] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("entering");
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        setMounted(true);
    }, []);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (!isOpen) {
            setTransitionState("entering");
            return;
        }
        const t = requestAnimationFrame(()=>{
            requestAnimationFrame(()=>setTransitionState("entered"));
        });
        return ()=>cancelAnimationFrame(t);
    }, [
        isOpen
    ]);
    // When modal opens with defaultService, show that service's form (no redirect)
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (isOpen && defaultService === "cleaning") {
            setSelectedVertical("cleaning");
            setModalStep("form");
        } else if (isOpen && defaultService === "gutters") {
            setSelectedVertical("gutters");
            setModalStep("form");
        } else if (isOpen && !defaultService) {
            setSelectedVertical(null);
            setModalStep("picker");
        }
    }, [
        isOpen,
        defaultService
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (isOpen) {
            // Prevent body scroll when modal is open (lock background)
            const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
            document.body.style.overflow = "hidden";
            document.body.style.paddingRight = `${scrollbarWidth}px`;
            // Also prevent scroll on html element for iOS
            document.documentElement.style.overflow = "hidden";
        } else {
            // Restore body scroll when modal closes
            document.body.style.overflow = "";
            document.body.style.paddingRight = "";
            document.documentElement.style.overflow = "";
            // Reset state when modal closes
            setSelectedVertical(null);
            setModalStep("picker");
        }
        return ()=>{
            // Cleanup on unmount
            document.body.style.overflow = "";
            document.body.style.paddingRight = "";
            document.documentElement.style.overflow = "";
        };
    }, [
        isOpen
    ]);
    // Handle ESC key to close
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        const handleEsc = (e)=>{
            if (e.key === "Escape" && isOpen) {
                onClose();
            }
        };
        if (isOpen) {
            document.addEventListener("keydown", handleEsc);
        }
        return ()=>{
            document.removeEventListener("keydown", handleEsc);
        };
    }, [
        isOpen,
        onClose
    ]);
    if (!isOpen || !mounted) {
        return null;
    }
    const modalContent = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "fixed inset-0 z-50 flex items-center justify-center p-4 public-modal-overlay",
        "data-state": transitionState,
        onClick: (e)=>{
            if (e.target === e.currentTarget) {
                onClose();
            }
        },
        style: {
            touchAction: "none"
        },
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "public-modal-shell public-modal-shell-premium max-w-4xl w-full flex flex-col overflow-hidden",
            style: {
                maxHeight: "90dvh"
            },
            "data-state": transitionState,
            onClick: (e)=>e.stopPropagation(),
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "sticky top-0 bg-white border-b border-alloy-stone/25 px-5 sm:px-6 py-4 flex items-center justify-between z-10 shrink-0 rounded-t-[1.375rem]",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                            className: "text-lg sm:text-xl font-bold text-alloy-pine tracking-tight",
                            children: modalStep === "submitted" ? selectedVertical === "cleaning" ? "Your Quote" : "Thank You!" : selectedVertical === null ? "What service do you need?" : selectedVertical === "cleaning" ? campaignQuoteFlow === "firstfree4x120" ? "Get your recurring quote" : "Get a cleaning quote" : "Get early access"
                        }, void 0, false, {
                            fileName: "[project]/components/QuoteModal.tsx",
                            lineNumber: 155,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                            type: "button",
                            onClick: onClose,
                            className: "text-alloy-midnight/60 hover:text-alloy-midnight hover:bg-alloy-stone/80 rounded-lg transition-colors p-2 -mr-2",
                            "aria-label": "Close modal",
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
                                className: "w-6 h-6",
                                fill: "none",
                                stroke: "currentColor",
                                viewBox: "0 0 24 24",
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                                    strokeLinecap: "round",
                                    strokeLinejoin: "round",
                                    strokeWidth: 2,
                                    d: "M6 18L18 6M6 6l12 12"
                                }, void 0, false, {
                                    fileName: "[project]/components/QuoteModal.tsx",
                                    lineNumber: 180,
                                    columnNumber: 15
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/components/QuoteModal.tsx",
                                lineNumber: 174,
                                columnNumber: 13
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/components/QuoteModal.tsx",
                            lineNumber: 168,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/components/QuoteModal.tsx",
                    lineNumber: 154,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "flex-1 overflow-y-auto overscroll-contain transition-opacity duration-200",
                    style: {
                        WebkitOverflowScrolling: "touch"
                    },
                    "data-modal-content": true,
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "p-4 sm:p-6",
                        children: modalStep === "submitted" && selectedVertical === "gutters" ? // Submitted view only for gutters (cleaning goes directly to /book)
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "space-y-6",
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "text-center",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "mb-4",
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
                                            className: "w-16 h-16 mx-auto text-alloy-juniper",
                                            fill: "none",
                                            stroke: "currentColor",
                                            viewBox: "0 0 24 24",
                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                                                strokeLinecap: "round",
                                                strokeLinejoin: "round",
                                                strokeWidth: 2,
                                                d: "M5 13l4 4L19 7"
                                            }, void 0, false, {
                                                fileName: "[project]/components/QuoteModal.tsx",
                                                lineNumber: 208,
                                                columnNumber: 23
                                            }, this)
                                        }, void 0, false, {
                                            fileName: "[project]/components/QuoteModal.tsx",
                                            lineNumber: 202,
                                            columnNumber: 21
                                        }, this)
                                    }, void 0, false, {
                                        fileName: "[project]/components/QuoteModal.tsx",
                                        lineNumber: 201,
                                        columnNumber: 19
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                        className: "text-2xl font-bold text-alloy-midnight mb-2",
                                        children: "Thank You!"
                                    }, void 0, false, {
                                        fileName: "[project]/components/QuoteModal.tsx",
                                        lineNumber: 216,
                                        columnNumber: 19
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "text-alloy-midnight/70 mb-6",
                                        children: "We've received your request. We'll be in touch soon!"
                                    }, void 0, false, {
                                        fileName: "[project]/components/QuoteModal.tsx",
                                        lineNumber: 219,
                                        columnNumber: 19
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                        type: "button",
                                        onClick: onClose,
                                        className: "px-6 py-3 bg-alloy-blue text-white font-semibold rounded-lg hover:bg-alloy-blue/90 transition-colors",
                                        children: "Close"
                                    }, void 0, false, {
                                        fileName: "[project]/components/QuoteModal.tsx",
                                        lineNumber: 222,
                                        columnNumber: 19
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/QuoteModal.tsx",
                                lineNumber: 200,
                                columnNumber: 17
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/components/QuoteModal.tsx",
                            lineNumber: 199,
                            columnNumber: 15
                        }, this) : selectedVertical === null ? // Service Selection (re-enters with slide when coming back)
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "public-picker-step space-y-6",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                    className: "text-alloy-midnight/80 text-center text-sm md:text-base",
                                    children: "Select a service to get started."
                                }, void 0, false, {
                                    fileName: "[project]/components/QuoteModal.tsx",
                                    lineNumber: 234,
                                    columnNumber: 17
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                            type: "button",
                                            onClick: ()=>{
                                                setSelectedVertical("cleaning");
                                                setModalStep("form");
                                            },
                                            className: "public-modal-service-card group",
                                            "data-stagger": "0",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "public-modal-service-icon flex items-center justify-center rounded-2xl bg-alloy-blue/8 p-5 w-20 h-20 mx-auto mb-4 ring-1 ring-alloy-blue/10 group-hover:bg-alloy-blue/12 group-hover:ring-alloy-juniper/20 transition-all duration-200",
                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("img", {
                                                        src: "/icons/vacuum-blue.png",
                                                        alt: "",
                                                        width: 48,
                                                        height: 48,
                                                        className: "w-12 h-12 object-contain"
                                                    }, void 0, false, {
                                                        fileName: "[project]/components/QuoteModal.tsx",
                                                        lineNumber: 249,
                                                        columnNumber: 23
                                                    }, this)
                                                }, void 0, false, {
                                                    fileName: "[project]/components/QuoteModal.tsx",
                                                    lineNumber: 248,
                                                    columnNumber: 21
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "text-[11px] font-semibold tracking-wider text-alloy-juniper mb-2 inline-block",
                                                    children: "Available now"
                                                }, void 0, false, {
                                                    fileName: "[project]/components/QuoteModal.tsx",
                                                    lineNumber: 257,
                                                    columnNumber: 21
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                                    className: "text-xl font-bold text-alloy-pine mb-2 tracking-tight",
                                                    children: "Home Cleaning"
                                                }, void 0, false, {
                                                    fileName: "[project]/components/QuoteModal.tsx",
                                                    lineNumber: 260,
                                                    columnNumber: 21
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                    className: "text-alloy-midnight/70 mb-5 text-sm flex-grow leading-relaxed",
                                                    children: "Professional home cleaning services."
                                                }, void 0, false, {
                                                    fileName: "[project]/components/QuoteModal.tsx",
                                                    lineNumber: 263,
                                                    columnNumber: 21
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "mt-auto",
                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        className: "public-cta-appearance block w-full text-center",
                                                        children: "Get a cleaning quote"
                                                    }, void 0, false, {
                                                        fileName: "[project]/components/QuoteModal.tsx",
                                                        lineNumber: 267,
                                                        columnNumber: 23
                                                    }, this)
                                                }, void 0, false, {
                                                    fileName: "[project]/components/QuoteModal.tsx",
                                                    lineNumber: 266,
                                                    columnNumber: 21
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/components/QuoteModal.tsx",
                                            lineNumber: 239,
                                            columnNumber: 19
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                            type: "button",
                                            onClick: ()=>{
                                                setSelectedVertical("gutters");
                                                setModalStep("form");
                                            },
                                            className: "public-modal-service-card group",
                                            "data-stagger": "1",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "public-modal-service-icon flex items-center justify-center rounded-2xl bg-alloy-pine/8 p-5 w-20 h-20 mx-auto mb-4 ring-1 ring-alloy-pine/10 group-hover:bg-alloy-pine/12 group-hover:ring-alloy-juniper/20 transition-all duration-200",
                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("img", {
                                                        src: "/icons/gutter-blue.png",
                                                        alt: "",
                                                        width: 48,
                                                        height: 48,
                                                        className: "w-12 h-12 object-contain"
                                                    }, void 0, false, {
                                                        fileName: "[project]/components/QuoteModal.tsx",
                                                        lineNumber: 284,
                                                        columnNumber: 23
                                                    }, this)
                                                }, void 0, false, {
                                                    fileName: "[project]/components/QuoteModal.tsx",
                                                    lineNumber: 283,
                                                    columnNumber: 21
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "text-[11px] font-semibold tracking-wider text-alloy-muted mb-2 inline-block",
                                                    children: "Early access"
                                                }, void 0, false, {
                                                    fileName: "[project]/components/QuoteModal.tsx",
                                                    lineNumber: 292,
                                                    columnNumber: 21
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                                    className: "text-xl font-bold text-alloy-pine mb-2 tracking-tight",
                                                    children: "Gutter Cleaning"
                                                }, void 0, false, {
                                                    fileName: "[project]/components/QuoteModal.tsx",
                                                    lineNumber: 295,
                                                    columnNumber: 21
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                    className: "text-alloy-midnight/70 mb-5 text-sm flex-grow leading-relaxed",
                                                    children: "Sign up early and get $25 off your first service."
                                                }, void 0, false, {
                                                    fileName: "[project]/components/QuoteModal.tsx",
                                                    lineNumber: 298,
                                                    columnNumber: 21
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "mt-auto",
                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        className: "public-cta-appearance block w-full text-center",
                                                        children: "Get Early Access"
                                                    }, void 0, false, {
                                                        fileName: "[project]/components/QuoteModal.tsx",
                                                        lineNumber: 302,
                                                        columnNumber: 23
                                                    }, this)
                                                }, void 0, false, {
                                                    fileName: "[project]/components/QuoteModal.tsx",
                                                    lineNumber: 301,
                                                    columnNumber: 21
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/components/QuoteModal.tsx",
                                            lineNumber: 274,
                                            columnNumber: 19
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/components/QuoteModal.tsx",
                                    lineNumber: 237,
                                    columnNumber: 17
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/components/QuoteModal.tsx",
                            lineNumber: 233,
                            columnNumber: 15
                        }, this) : modalStep === "form" ? // Form Display
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "public-form-step",
                            children: [
                                !defaultService && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    onClick: ()=>{
                                        setSelectedVertical(null);
                                        setModalStep("picker");
                                    },
                                    className: "text-sm text-alloy-midnight/70 hover:text-alloy-midnight hover:bg-alloy-stone/60 rounded-lg transition-colors flex items-center gap-2 mb-4 sm:mb-6 py-2 px-1 -ml-1",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
                                            className: "w-4 h-4",
                                            fill: "none",
                                            stroke: "currentColor",
                                            viewBox: "0 0 24 24",
                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                                                strokeLinecap: "round",
                                                strokeLinejoin: "round",
                                                strokeWidth: 2,
                                                d: "M15 19l-7-7 7-7"
                                            }, void 0, false, {
                                                fileName: "[project]/components/QuoteModal.tsx",
                                                lineNumber: 323,
                                                columnNumber: 23
                                            }, this)
                                        }, void 0, false, {
                                            fileName: "[project]/components/QuoteModal.tsx",
                                            lineNumber: 322,
                                            columnNumber: 21
                                        }, this),
                                        "Back to service selection"
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/components/QuoteModal.tsx",
                                    lineNumber: 314,
                                    columnNumber: 19
                                }, this),
                                selectedVertical === "cleaning" ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "space-y-4",
                                    children: [
                                        campaignQuoteFlow === "firstfree4x120" ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "rounded-xl border border-alloy-juniper/25 bg-alloy-juniper/5 px-4 py-3 text-sm text-alloy-midnight",
                                            role: "region",
                                            "aria-label": "Promotional offer",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                    className: "font-semibold text-alloy-pine mb-1",
                                                    children: "First Service Free — 4 Visits in 120 Days (From First Clean)"
                                                }, void 0, false, {
                                                    fileName: "[project]/components/QuoteModal.tsx",
                                                    lineNumber: 338,
                                                    columnNumber: 25
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                    className: "text-alloy-midnight/85 leading-relaxed",
                                                    children: [
                                                        "Sign up for ",
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                            children: "recurring standard cleaning"
                                                        }, void 0, false, {
                                                            fileName: "[project]/components/QuoteModal.tsx",
                                                            lineNumber: 342,
                                                            columnNumber: 39
                                                        }, this),
                                                        " (weekly, every 2 weeks, or monthly). The complimentary first cleaning must be scheduled and fully completed within",
                                                        " ",
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                            children: "30 days"
                                                        }, void 0, false, {
                                                            fileName: "[project]/components/QuoteModal.tsx",
                                                            lineNumber: 344,
                                                            columnNumber: 27
                                                        }, this),
                                                        " from the date the offer is redeemed. To qualify for the full promotion, all ",
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                            children: "four (4) recurring cleanings"
                                                        }, void 0, false, {
                                                            fileName: "[project]/components/QuoteModal.tsx",
                                                            lineNumber: 345,
                                                            columnNumber: 42
                                                        }, this),
                                                        " must be scheduled and completed within ",
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                            children: "120 days"
                                                        }, void 0, false, {
                                                            fileName: "[project]/components/QuoteModal.tsx",
                                                            lineNumber: 346,
                                                            columnNumber: 34
                                                        }, this),
                                                        " following the date of your first (complimentary) cleaning. Your ",
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                            children: "first clean is covered"
                                                        }, void 0, false, {
                                                            fileName: "[project]/components/QuoteModal.tsx",
                                                            lineNumber: 347,
                                                            columnNumber: 32
                                                        }, this),
                                                        " when you meet the program terms. Use",
                                                        " ",
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                            children: "Get my recurring quote"
                                                        }, void 0, false, {
                                                            fileName: "[project]/components/QuoteModal.tsx",
                                                            lineNumber: 348,
                                                            columnNumber: 27
                                                        }, this),
                                                        " below — next you'll review the program terms, then continue to booking."
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/components/QuoteModal.tsx",
                                                    lineNumber: 341,
                                                    columnNumber: 25
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/components/QuoteModal.tsx",
                                            lineNumber: 333,
                                            columnNumber: 23
                                        }, this) : null,
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: "text-sm text-alloy-midnight/80",
                                            children: campaignQuoteFlow === "firstfree4x120" ? "Recurring standard cleaning only. We’ll save your quote for the next step." : "We'll calculate your price and save it so you can book when you're ready."
                                        }, void 0, false, {
                                            fileName: "[project]/components/QuoteModal.tsx",
                                            lineNumber: 353,
                                            columnNumber: 21
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$cleaning$2f$CleaningQuickQuoteForm$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                                            campaignQuoteMode: campaignQuoteFlow === "firstfree4x120" ? {
                                                id: "firstfree4x120"
                                            } : undefined,
                                            onSwitchToStandardQuote: campaignQuoteFlow === "firstfree4x120" ? handleSwitchToStandardQuote : undefined,
                                            onComplete: (detail)=>{
                                                const isCampaign = campaignQuoteFlow === "firstfree4x120";
                                                if (detail.kind === "specialty") {
                                                    return;
                                                }
                                                if (isCampaign) {
                                                    if (invokeCampaignQuoteComplete) {
                                                        invokeCampaignQuoteComplete();
                                                    }
                                                    onClose();
                                                    return;
                                                }
                                                router.prefetch("/book-v2");
                                                window.setTimeout(()=>{
                                                    router.push("/book-v2");
                                                    window.setTimeout(()=>onClose(), 380);
                                                }, 120);
                                            }
                                        }, void 0, false, {
                                            fileName: "[project]/components/QuoteModal.tsx",
                                            lineNumber: 358,
                                            columnNumber: 21
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/components/QuoteModal.tsx",
                                    lineNumber: 331,
                                    columnNumber: 19
                                }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$gutters$2f$GutterLeadForm$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                                    onSuccess: ()=>{
                                        // Transition to submitted state
                                        setModalStep("submitted");
                                        // Close modal after delay
                                        setTimeout(()=>{
                                            onClose();
                                        }, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$ui$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["REDIRECT_DELAY_MS"]);
                                    }
                                }, void 0, false, {
                                    fileName: "[project]/components/QuoteModal.tsx",
                                    lineNumber: 384,
                                    columnNumber: 19
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/components/QuoteModal.tsx",
                            lineNumber: 311,
                            columnNumber: 15
                        }, this) : null
                    }, void 0, false, {
                        fileName: "[project]/components/QuoteModal.tsx",
                        lineNumber: 196,
                        columnNumber: 11
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/components/QuoteModal.tsx",
                    lineNumber: 191,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/components/QuoteModal.tsx",
            lineNumber: 147,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/components/QuoteModal.tsx",
        lineNumber: 137,
        columnNumber: 5
    }, this);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$dom$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["createPortal"])(modalContent, document.body);
}
}),
"[project]/components/QuoteModalWrapper.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>QuoteModalWrapper
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$quoteModal$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/quoteModal.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$QuoteModal$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/components/QuoteModal.tsx [app-ssr] (ecmascript)");
"use client";
;
;
;
function QuoteModalWrapper() {
    const { isOpen, closeModal, openModal, defaultService, campaignQuoteFlow, invokeCampaignQuoteComplete } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$quoteModal$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useQuoteModal"])();
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$QuoteModal$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
        isOpen: isOpen,
        onClose: closeModal,
        openModal: openModal,
        defaultService: defaultService,
        campaignQuoteFlow: campaignQuoteFlow,
        invokeCampaignQuoteComplete: invokeCampaignQuoteComplete
    }, void 0, false, {
        fileName: "[project]/components/QuoteModalWrapper.tsx",
        lineNumber: 10,
        columnNumber: 5
    }, this);
}
}),
"[project]/components/HomeAmbient.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "HeroPerimeterSpecs",
    ()=>HeroPerimeterSpecs,
    "default",
    ()=>HomeAmbient
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
"use client";
;
/**
 * Document-scoped ambient (`public-site-atmosphere-layer` in ConditionalSiteLayout).
 * Multi-band placement — ~+40% specs vs prior pass, aligned to adminV2 workspace density target.
 * ~30% blue / 55% pine / 15% juniper (Bend Pine / life forward, like workspace particle mix).
 */ const CLOUDS = [
    {
        className: "home-atmosphere-cloud home-atmosphere-cloud-1"
    },
    {
        className: "home-atmosphere-cloud home-atmosphere-cloud-2"
    },
    {
        className: "home-atmosphere-cloud home-atmosphere-cloud-3"
    },
    {
        className: "home-atmosphere-cloud home-atmosphere-cloud-4"
    },
    {
        className: "home-atmosphere-cloud home-atmosphere-cloud-5"
    }
];
const BLOOMS = [
    {
        className: "home-atmosphere-bloom home-atmosphere-bloom-blue"
    },
    {
        className: "home-atmosphere-bloom home-atmosphere-bloom-pine",
        style: {
            animationDelay: "-2s"
        }
    },
    {
        className: "home-atmosphere-bloom home-atmosphere-bloom-juniper",
        style: {
            animationDelay: "-4s"
        }
    },
    {
        className: "home-atmosphere-bloom home-atmosphere-bloom-mid",
        style: {
            animationDelay: "-6s"
        }
    }
];
function toneFromMod(m) {
    const x = (m % 20 + 20) % 20;
    if (x < 6) return "blue";
    if (x < 17) return "pine";
    return "juniper";
}
function toneClass(tone) {
    if (tone === "juniper") return "public-ambient-spec-dot-juniper";
    if (tone === "pine") return "public-ambient-spec-dot-pine";
    return "";
}
const GRID_ROWS = 9;
const GRID_COLS = 13;
const EDGE_N = 31;
const UPPER_N = 31;
const MID_LOWER_N = 28;
function buildSpecPositions() {
    const out = [];
    for(let row = 0; row < GRID_ROWS; row++){
        const t = 3 + row * 92 / (GRID_ROWS - 1 || 1);
        for(let col = 0; col < GRID_COLS; col++){
            const l = 3 + col * 94 / (GRID_COLS - 1 || 1);
            const tone = toneFromMod(row * 17 + col * 3);
            const size = (row + col) % 5 === 0 ? "lg" : (row + col) % 3 === 1 ? "sm" : "md";
            out.push({
                left: `${l}%`,
                top: `${t}%`,
                tone,
                size
            });
        }
    }
    for(let i = 0; i < EDGE_N; i++){
        const u = EDGE_N <= 1 ? 0 : i / (EDGE_N - 1);
        const x = 3 + u * 94;
        const y = 4 + u * 88;
        out.push({
            left: `${x}%`,
            top: "0.85%",
            tone: toneFromMod(i),
            size: "md"
        });
        out.push({
            left: `${x}%`,
            top: "99.15%",
            tone: toneFromMod(i + 3),
            size: "sm"
        });
        out.push({
            left: "0.85%",
            top: `${y}%`,
            tone: toneFromMod(i + 5),
            size: i % 5 === 0 ? "lg" : "md"
        });
        out.push({
            left: "99.15%",
            top: `${y}%`,
            tone: toneFromMod(i + 7),
            size: i % 5 === 1 ? "lg" : "md"
        });
    }
    for(let i = 0; i < UPPER_N; i++){
        const left = 2 + i * 92 / (UPPER_N - 1 || 1);
        const top = 8.5 + i % 7 * 2.05;
        out.push({
            left: `${left}%`,
            top: `${top}%`,
            tone: toneFromMod(i + 11),
            size: i % 6 === 0 ? "lg" : "md"
        });
    }
    for(let i = 0; i < MID_LOWER_N; i++){
        const leftMid = 4 + i * 47 % 91;
        const topMid = 43 + i % 5 * 9;
        out.push({
            left: `${leftMid}%`,
            top: `${topMid}%`,
            tone: toneFromMod(i + 19),
            size: i % 4 === 0 ? "lg" : "sm"
        });
        const leftLow = 5 + i * 53 % 89;
        const topLow = 73 + i % 4 * 6.2;
        out.push({
            left: `${leftLow}%`,
            top: `${topLow}%`,
            tone: toneFromMod(i + 29),
            size: "md"
        });
    }
    return out;
}
const SPEC_POSITIONS = buildSpecPositions();
const HERO_PERIMETER_SPECS = [
    {
        left: "2%",
        top: "22%",
        tone: "pine",
        size: "lg"
    },
    {
        left: "8%",
        top: "78%",
        tone: "pine",
        size: "md"
    },
    {
        left: "52%",
        top: "4%",
        tone: "pine",
        size: "lg"
    },
    {
        left: "94%",
        top: "55%",
        tone: "pine",
        size: "md"
    },
    {
        left: "50%",
        top: "96%",
        tone: "pine",
        size: "lg"
    },
    {
        left: "18%",
        top: "12%",
        tone: "blue",
        size: "sm"
    },
    {
        left: "88%",
        top: "28%",
        tone: "blue",
        size: "md"
    },
    {
        left: "38%",
        top: "88%",
        tone: "juniper",
        size: "sm"
    },
    {
        left: "30%",
        top: "7%",
        tone: "pine",
        size: "sm"
    },
    {
        left: "71%",
        top: "11%",
        tone: "blue",
        size: "md"
    },
    {
        left: "14%",
        top: "48%",
        tone: "pine",
        size: "md"
    },
    {
        left: "91%",
        top: "42%",
        tone: "blue",
        size: "sm"
    },
    {
        left: "44%",
        top: "18%",
        tone: "pine",
        size: "lg"
    },
    {
        left: "63%",
        top: "84%",
        tone: "blue",
        size: "md"
    },
    {
        left: "26%",
        top: "58%",
        tone: "blue",
        size: "md"
    },
    {
        left: "77%",
        top: "68%",
        tone: "juniper",
        size: "sm"
    }
];
function HomeAmbient() {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "home-atmosphere",
        "aria-hidden": true,
        children: [
            CLOUDS.map((c, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: c.className
                }, `cloud-${i}`, false, {
                    fileName: "[project]/components/HomeAmbient.tsx",
                    lineNumber: 123,
                    columnNumber: 9
                }, this)),
            BLOOMS.map((b, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: b.className,
                    style: b.style
                }, `bloom-${i}`, false, {
                    fileName: "[project]/components/HomeAmbient.tsx",
                    lineNumber: 126,
                    columnNumber: 9
                }, this)),
            SPEC_POSITIONS.map((pos, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: `public-ambient-spec public-ambient-spec-dot ${toneClass(pos.tone)} ${pos.size === "sm" ? "public-ambient-spec-sm" : ""} ${pos.size === "lg" ? "public-ambient-spec-lg" : ""}`,
                    style: {
                        left: pos.left,
                        top: pos.top,
                        animationDelay: `${i % 100 * 0.11}s`
                    }
                }, i, false, {
                    fileName: "[project]/components/HomeAmbient.tsx",
                    lineNumber: 129,
                    columnNumber: 9
                }, this))
        ]
    }, void 0, true, {
        fileName: "[project]/components/HomeAmbient.tsx",
        lineNumber: 121,
        columnNumber: 5
    }, this);
}
function HeroPerimeterSpecs() {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "absolute inset-0 pointer-events-none overflow-visible -z-10",
        "aria-hidden": true,
        children: HERO_PERIMETER_SPECS.map((pos, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: `public-ambient-spec public-ambient-spec-dot absolute ${toneClass(pos.tone)} ${pos.size === "sm" ? "public-ambient-spec-sm" : ""} ${pos.size === "lg" ? "public-ambient-spec-lg" : ""}`,
                style: {
                    left: pos.left,
                    top: pos.top,
                    animationDelay: `${i * 0.4}s`
                }
            }, i, false, {
                fileName: "[project]/components/HomeAmbient.tsx",
                lineNumber: 147,
                columnNumber: 9
            }, this))
    }, void 0, false, {
        fileName: "[project]/components/HomeAmbient.tsx",
        lineNumber: 145,
        columnNumber: 5
    }, this);
}
}),
"[project]/components/ConditionalSiteLayout.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>ConditionalSiteLayout
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/navigation.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$Navbar$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/components/Navbar.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$Footer$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/components/Footer.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$LayoutWrapper$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/components/LayoutWrapper.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$QuoteModalWrapper$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/components/QuoteModalWrapper.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$HomeAmbient$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/components/HomeAmbient.tsx [app-ssr] (ecmascript)");
"use client";
;
;
;
;
;
;
;
function ConditionalSiteLayout({ children }) {
    const pathname = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["usePathname"])();
    const isAdminRoute = pathname?.startsWith("/admin");
    if (isAdminRoute) {
        // Admin routes: no Navbar/Footer, just render children (admin layout handles its own UI)
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
            children: children
        }, void 0, false);
    }
    /* Ambient sits in a document-height absolute layer behind chrome (nav/main/footer) so it
   * cannot paint past the intended frame or sit above opaque header/footer regions. */ return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$LayoutWrapper$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "public-site-chrome",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "public-site-atmosphere-layer",
                    "aria-hidden": true,
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$HomeAmbient$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {}, void 0, false, {
                        fileName: "[project]/components/ConditionalSiteLayout.tsx",
                        lineNumber: 29,
                        columnNumber: 11
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/components/ConditionalSiteLayout.tsx",
                    lineNumber: 28,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$Navbar$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {}, void 0, false, {
                    fileName: "[project]/components/ConditionalSiteLayout.tsx",
                    lineNumber: 31,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("main", {
                    className: "public-site-main",
                    children: children
                }, void 0, false, {
                    fileName: "[project]/components/ConditionalSiteLayout.tsx",
                    lineNumber: 32,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$Footer$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {}, void 0, false, {
                    fileName: "[project]/components/ConditionalSiteLayout.tsx",
                    lineNumber: 33,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$QuoteModalWrapper$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {}, void 0, false, {
                    fileName: "[project]/components/ConditionalSiteLayout.tsx",
                    lineNumber: 34,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/components/ConditionalSiteLayout.tsx",
            lineNumber: 27,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/components/ConditionalSiteLayout.tsx",
        lineNumber: 26,
        columnNumber: 5
    }, this);
}
}),
"[project]/lib/metaPixel.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Meta Pixel tracking helper
 * Safely no-ops if pixel is not loaded
 */ __turbopack_context__.s([
    "isMetaPixelLoaded",
    ()=>isMetaPixelLoaded,
    "trackMetaEvent",
    ()=>trackMetaEvent
]);
function trackMetaEvent(eventName, params) {
    // Only track if pixel is loaded
    if ("TURBOPACK compile-time truthy", 1) {
        return;
    }
    //TURBOPACK unreachable
    ;
    // Default vertical to "cleaning"
    const eventParams = undefined;
}
function isMetaPixelLoaded() {
    return ("TURBOPACK compile-time value", "undefined") !== "undefined" && typeof window.fbq === "function";
}
}),
"[project]/components/MetaPixel.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>MetaPixel
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$script$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/script.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/navigation.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$metaPixel$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/metaPixel.ts [app-ssr] (ecmascript)");
"use client";
;
;
;
;
;
const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;
function MetaPixel() {
    const pathname = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["usePathname"])();
    // Track PageView on route changes
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if ("TURBOPACK compile-time truthy", 1) {
            return;
        }
        //TURBOPACK unreachable
        ;
        // Small delay to ensure page is fully loaded
        const timeoutId = undefined;
    }, [
        pathname
    ]);
    // Don't render if pixel ID is not configured
    if (!META_PIXEL_ID) {
        return null;
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$script$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                id: "meta-pixel",
                strategy: "afterInteractive",
                dangerouslySetInnerHTML: {
                    __html: `
            !function(f,b,e,v,n,t,s)
            {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};
            if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
            n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];
            s.parentNode.insertBefore(t,s)}(window, document,'script',
            'https://connect.facebook.net/en_US/fbevents.js');
            fbq('init', '${META_PIXEL_ID}');
            fbq('track', 'PageView');
          `
                }
            }, void 0, false, {
                fileName: "[project]/components/MetaPixel.tsx",
                lineNumber: 40,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("noscript", {
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("img", {
                    height: "1",
                    width: "1",
                    style: {
                        display: "none"
                    },
                    src: `https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`,
                    alt: ""
                }, void 0, false, {
                    fileName: "[project]/components/MetaPixel.tsx",
                    lineNumber: 59,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/components/MetaPixel.tsx",
                lineNumber: 58,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true);
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__2b909e2d._.js.map