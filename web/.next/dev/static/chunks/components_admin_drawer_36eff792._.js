(globalThis.TURBOPACK || (globalThis.TURBOPACK = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/components/admin/drawer/ScheduleSnapCell.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>ScheduleSnapCell
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
"use client";
;
function ScheduleSnapCell(props) {
    const tier = props.tier ?? "secondary";
    const shell = tier === "primary" ? "min-w-0 rounded-lg border border-admin-border/50 bg-white/95 px-2.5 py-1.5 shadow-[0_1px_0_rgba(15,23,42,0.04)]" : tier === "supporting" ? "min-w-0 rounded-md border border-dashed border-admin-border/28 bg-alloy-stone/[0.03] px-1.5 py-1" : "min-w-0 rounded-md border border-admin-border/35 bg-alloy-stone/[0.06] px-2 py-1";
    const labelClass = tier === "primary" ? "mb-1 text-[9px] font-semibold uppercase leading-none tracking-[0.1em] text-alloy-midnight/55" : tier === "supporting" ? "mb-0.5 text-[8px] font-semibold uppercase leading-none tracking-[0.12em] text-alloy-forge/55" : "mb-1 text-[9px] font-semibold uppercase leading-none tracking-[0.1em] text-alloy-forge/65";
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: `${shell} ${props.className ?? ""}`,
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: labelClass,
                children: props.label
            }, void 0, false, {
                fileName: "[project]/components/admin/drawer/ScheduleSnapCell.tsx",
                lineNumber: 34,
                columnNumber: 13
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: tier === "supporting" ? "flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0" : "flex min-w-0 flex-col gap-0.5",
                children: props.children
            }, void 0, false, {
                fileName: "[project]/components/admin/drawer/ScheduleSnapCell.tsx",
                lineNumber: 35,
                columnNumber: 13
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/components/admin/drawer/ScheduleSnapCell.tsx",
        lineNumber: 33,
        columnNumber: 9
    }, this);
}
_c = ScheduleSnapCell;
var _c;
__turbopack_context__.k.register(_c, "ScheduleSnapCell");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/components/admin/drawer/JobDrawerV2.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "JobDrawerV2OverviewShell",
    ()=>JobDrawerV2OverviewShell,
    "JobDrawerV2PrimaryActions",
    ()=>JobDrawerV2PrimaryActions,
    "JobDrawerV2SignalsStrip",
    ()=>JobDrawerV2SignalsStrip,
    "JobDrawerV2StatusHeader",
    ()=>JobDrawerV2StatusHeader,
    "JobDrawerV2TabBar",
    ()=>JobDrawerV2TabBar,
    "JobDrawerV2TimelineCard",
    ()=>JobDrawerV2TimelineCard,
    "JobRecordPrimaryPanel",
    ()=>JobRecordPrimaryPanel,
    "deriveJobDrawerSignalLines",
    ()=>deriveJobDrawerSignalLines
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/styles/tokens/colors.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminFormatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/adminFormatters.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$StatusBadge$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/components/admin/StatusBadge.tsx [app-client] (ecmascript)");
"use client";
;
;
;
;
const shell = {
    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["neutral"].textPrimary,
    ["--d-muted"]: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].textSecondary,
    ["--d-border"]: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].border,
    ["--d-surface"]: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["neutral"].surface,
    ["--d-brand"]: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["brand"].primary
};
function JobDrawerV2TabBar(props) {
    const { tabs, tabLabels, active, onSelect } = props;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        "data-adminv2-job-record-nav": "true",
        className: "flex flex-wrap gap-1 rounded-xl p-1",
        style: {
            backgroundColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].maskOverlay,
            borderWidth: 1,
            borderStyle: "solid",
            borderColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].border
        },
        role: "tablist",
        "aria-label": "Record sections",
        children: tabs.map((tab)=>{
            const isOn = active === tab;
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                type: "button",
                role: "tab",
                "aria-selected": isOn,
                onClick: ()=>onSelect(tab),
                className: "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                style: isOn ? {
                    backgroundColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["neutral"].surface,
                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["brand"].primary,
                    boxShadow: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].cardShadow
                } : {
                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].textSecondary
                },
                children: tabLabels[tab] ?? tab
            }, tab, false, {
                fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
                lineNumber: 44,
                columnNumber: 21
            }, this);
        })
    }, void 0, false, {
        fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
        lineNumber: 29,
        columnNumber: 9
    }, this);
}
_c = JobDrawerV2TabBar;
function signalTone(tone) {
    switch(tone){
        case "critical":
            return {
                bg: "rgba(188, 67, 0, 0.08)",
                border: "rgba(188, 67, 0, 0.35)"
            };
        case "warning":
            return {
                bg: "rgba(0, 69, 140, 0.06)",
                border: "rgba(0, 69, 140, 0.22)"
            };
        case "info":
            return {
                bg: "rgba(0, 162, 131, 0.06)",
                border: "rgba(0, 162, 131, 0.22)"
            };
        default:
            return {
                bg: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["neutral"].surface,
                border: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].border
            };
    }
}
/** Cleaning flagship modal: meaning-first tints (payment / schedule / assignment families). */ function signalToneCleaningModal(kicker, urgency) {
    if (kicker === "Payment") {
        if (urgency === "critical") {
            return {
                bg: "color-mix(in srgb, #ffffff 86%, rgba(188, 67, 0, 0.12))",
                border: "color-mix(in srgb, rgba(188, 67, 0, 0.45) 70%, rgba(39, 63, 82, 0.2))",
                kickerColor: "rgba(188, 67, 0, 0.92)"
            };
        }
        if (urgency === "warning") {
            return {
                bg: "color-mix(in srgb, #ffffff 88%, rgba(0, 69, 140, 0.09))",
                border: "color-mix(in srgb, rgba(0, 69, 140, 0.38) 65%, rgba(39, 63, 82, 0.15))",
                kickerColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["palette"].alloyBlue
            };
        }
        if (urgency === "info") {
            return {
                bg: "color-mix(in srgb, #ffffff 88%, rgba(0, 162, 131, 0.1))",
                border: "color-mix(in srgb, rgba(0, 162, 131, 0.38) 60%, rgba(39, 63, 82, 0.12))",
                kickerColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["palette"].bendPine
            };
        }
        return {
            bg: "color-mix(in srgb, #ffffff 90%, rgba(0, 69, 140, 0.06))",
            border: "color-mix(in srgb, rgba(0, 69, 140, 0.22) 70%, rgba(39, 63, 82, 0.12))",
            kickerColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].textSecondary
        };
    }
    if (kicker === "Schedule") {
        if (urgency === "critical") {
            return {
                bg: "color-mix(in srgb, #ffffff 85%, rgba(188, 67, 0, 0.11))",
                border: "color-mix(in srgb, rgba(188, 67, 0, 0.4) 65%, rgba(39, 63, 82, 0.18))",
                kickerColor: "rgba(188, 67, 0, 0.92)"
            };
        }
        if (urgency === "warning") {
            return {
                bg: "color-mix(in srgb, #ffffff 88%, rgba(0, 69, 140, 0.075))",
                border: "color-mix(in srgb, rgba(0, 69, 140, 0.28) 60%, rgba(0, 162, 131, 0.2))",
                kickerColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["palette"].alloyBlue
            };
        }
        return {
            bg: "color-mix(in srgb, #ffffff 88%, rgba(0, 162, 131, 0.085))",
            border: "color-mix(in srgb, rgba(0, 162, 131, 0.32) 55%, rgba(39, 63, 82, 0.14))",
            kickerColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["palette"].bendPine
        };
    }
    // Assignment
    if (urgency === "warning") {
        return {
            bg: "color-mix(in srgb, #ffffff 90%, rgba(0, 69, 140, 0.065))",
            border: "color-mix(in srgb, rgba(0, 69, 140, 0.26) 55%, rgba(39, 63, 82, 0.16))",
            kickerColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["palette"].alloyBlue
        };
    }
    return {
        bg: "color-mix(in srgb, #ffffff 91%, rgba(39, 63, 82, 0.055))",
        border: "color-mix(in srgb, rgba(39, 63, 82, 0.2) 70%, rgba(0, 69, 140, 0.12))",
        kickerColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].textSecondary
    };
}
function JobDrawerV2SignalsStrip(props) {
    const cards = [
        {
            kicker: "Payment",
            label: props.paymentLabel,
            tone: props.paymentTone
        },
        {
            kicker: "Schedule",
            label: props.scheduleLabel,
            tone: props.scheduleTone
        },
        {
            kicker: "Assignment",
            label: props.assignmentLabel,
            tone: props.assignmentTone
        }
    ];
    const cleaning = props.presentation === "cleaningRecordModal";
    const signalShadow = "0 1px 2px rgba(39, 63, 82, 0.04), 0 4px 14px rgba(39, 63, 82, 0.05)";
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "adminv2-job-drawer-signals flex flex-wrap gap-2",
        style: shell,
        children: cards.map((c)=>{
            const t = cleaning ? signalToneCleaningModal(c.kicker, c.tone) : {
                ...signalTone(c.tone),
                kickerColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].textSecondary
            };
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: `min-w-[140px] flex-1 rounded-xl px-3 py-2 ${cleaning ? "backdrop-blur-[2px]" : ""}`,
                style: {
                    backgroundColor: t.bg,
                    borderWidth: cleaning ? 0 : 1,
                    borderStyle: "solid",
                    borderColor: cleaning ? "transparent" : t.border,
                    boxShadow: cleaning ? signalShadow : undefined
                },
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "text-[10px] font-semibold uppercase tracking-wide",
                        style: {
                            color: t.kickerColor
                        },
                        children: c.kicker
                    }, void 0, false, {
                        fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
                        lineNumber: 185,
                        columnNumber: 25
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "mt-0.5 text-sm font-medium leading-snug",
                        style: {
                            color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["neutral"].textPrimary
                        },
                        children: c.label
                    }, void 0, false, {
                        fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
                        lineNumber: 188,
                        columnNumber: 25
                    }, this)
                ]
            }, c.kicker, true, {
                fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
                lineNumber: 174,
                columnNumber: 21
            }, this);
        })
    }, void 0, false, {
        fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
        lineNumber: 170,
        columnNumber: 9
    }, this);
}
_c1 = JobDrawerV2SignalsStrip;
function deriveJobDrawerSignalLines(job, schedules, paymentLabel, paymentIsPaid, paymentFailed) {
    const nextRaw = job._next_schedule != null ? String(job._next_schedule) : "";
    const nextFromSched = schedules[0]?.start_at;
    const refIso = nextRaw || nextFromSched || "";
    let scheduleLabel = "No upcoming visit";
    let scheduleTone = "warning";
    if (refIso) {
        const t = new Date(refIso).getTime();
        if (!Number.isNaN(t)) {
            const now = Date.now();
            if (t < now) {
                scheduleLabel = "Overdue visit";
                scheduleTone = "critical";
            } else {
                const days = (t - now) / 86400000;
                scheduleLabel = days <= 1 ? "Visit soon" : "Scheduled";
                scheduleTone = days <= 1 ? "warning" : "info";
            }
        }
    }
    const vendorId = job.assigned_vendor_id != null ? String(job.assigned_vendor_id).trim() : "";
    const vendorName = String(job._vendor_name ?? "").trim();
    const wu = String(job._work_unit_label ?? "").trim();
    let assignmentLabel = "Unassigned";
    let assignmentTone = "warning";
    if (vendorId) {
        assignmentLabel = vendorName ? `Cleaner: ${vendorName}` : "Cleaner assigned";
        assignmentTone = "info";
    } else if (wu) {
        assignmentLabel = `Queue: ${wu}`;
        assignmentTone = "info";
    }
    let payTone = "neutral";
    if (paymentFailed) payTone = "critical";
    else if (paymentIsPaid) payTone = "info";
    else payTone = "warning";
    return {
        paymentLabel,
        paymentTone: payTone,
        scheduleLabel,
        scheduleTone,
        assignmentLabel,
        assignmentTone
    };
}
function formatServiceFrequencyReadLabel(k) {
    if (k == null || String(k).trim() === "") return "—";
    return String(k).replace(/_/g, " ");
}
const primaryPanelFieldClass = "adminv2-job-record-primary-input w-full rounded-lg border px-2 py-1.5 text-sm text-alloy-forge transition-colors duration-150 focus:border-alloy-blue focus:outline-none focus:ring-1 focus:ring-alloy-blue/20 disabled:opacity-60";
const primaryPanelLabelClass = "block text-[10px] font-semibold uppercase tracking-wide mb-0.5";
const primaryPanelReadClass = "text-sm font-medium leading-snug break-words tabular-nums";
function JobRecordPrimaryPanel(props) {
    const r = props.record ?? {};
    const totalRaw = r.display_total_cents ?? r.total_cents ?? r.gross_price_cents ?? r.estimated_total_cents;
    const totalCents = typeof totalRaw === "number" ? totalRaw : typeof totalRaw === "string" ? parseFloat(totalRaw) : NaN;
    const balRaw = r._job_payment_balance_cents;
    const balCents = typeof balRaw === "number" ? balRaw : typeof balRaw === "string" ? parseFloat(balRaw) : NaN;
    const nextIso = r._next_schedule != null && String(r._next_schedule).trim() !== "" ? String(r._next_schedule) : props.firstSchedule?.start_at ?? "";
    let nextLabel = "—";
    if (nextIso) {
        try {
            nextLabel = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminFormatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatDateTime"])(nextIso);
        } catch  {
            nextLabel = nextIso;
        }
    }
    const serviceType = String(r.service_key ?? "").trim() || String(r.job_type ?? "").trim() || "—";
    const recurring = r.is_recurring === true || r.is_recurring === "true" ? "Yes" : r.is_recurring === false || r.is_recurring === "false" ? "No" : "—";
    const statusOptions = props.statusDefs.filter((s)=>s.is_active !== false).sort((a, b)=>(a.sort_order ?? 0) - (b.sort_order ?? 0));
    const sk = String(props.formData.status_key ?? r.status_key ?? "").trim();
    if (sk && !statusOptions.some((s)=>s.status_key === sk)) {
        statusOptions.push({
            status_key: sk,
            status_label: sk,
            sort_order: 9999,
            is_active: true
        });
    }
    const vid = String(props.formData.assigned_vendor_id ?? "").trim();
    const fieldStyle = {
        borderColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].border,
        backgroundColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["neutral"].surface
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "adminv2-job-record-primary-panel rounded-[10px] border border-solid p-3 shadow-sm sm:p-3.5",
        style: {
            borderColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].border,
            backgroundColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["neutral"].surface,
            boxShadow: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].cardShadow,
            ...shell
        },
        "data-adminv2-job-primary-panel": "true",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "text-[10px] font-semibold uppercase tracking-wide mb-2",
                style: {
                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].textSecondary
                },
                children: "Job summary"
            }, void 0, false, {
                fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
                lineNumber: 328,
                columnNumber: 13
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(240px,300px)] lg:gap-5",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "min-w-0 grid grid-cols-1 gap-x-3 gap-y-2 sm:grid-cols-2",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "sm:col-span-2",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                        htmlFor: "job-primary-status",
                                        className: primaryPanelLabelClass,
                                        style: {
                                            color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].textSecondary
                                        },
                                        children: "Status"
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
                                        lineNumber: 334,
                                        columnNumber: 25
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                                        id: "job-primary-status",
                                        value: sk,
                                        onChange: (e)=>props.setFormData((f)=>({
                                                    ...f,
                                                    status_key: e.target.value || null
                                                })),
                                        onBlur: props.onBlur,
                                        disabled: !props.canMutate,
                                        className: primaryPanelFieldClass,
                                        style: fieldStyle,
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                value: "",
                                                children: "— None —"
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
                                                lineNumber: 346,
                                                columnNumber: 29
                                            }, this),
                                            statusOptions.map((s)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                    value: s.status_key,
                                                    children: s.status_label ?? s.status_key
                                                }, s.status_key, false, {
                                                    fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
                                                    lineNumber: 348,
                                                    columnNumber: 33
                                                }, this))
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
                                        lineNumber: 337,
                                        columnNumber: 25
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
                                lineNumber: 333,
                                columnNumber: 21
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "sm:col-span-2",
                                id: "job-assign-vendor-section",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: primaryPanelLabelClass,
                                        style: {
                                            color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].textSecondary
                                        },
                                        children: "Assigned vendor"
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
                                        lineNumber: 355,
                                        columnNumber: 25
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "flex flex-wrap items-center gap-1.5",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                                                value: String(props.formData.assigned_vendor_id ?? ""),
                                                onChange: (e)=>props.setFormData((f)=>({
                                                            ...f,
                                                            assigned_vendor_id: e.target.value || null
                                                        })),
                                                onBlur: props.onBlur,
                                                disabled: !props.canMutate,
                                                className: `${primaryPanelFieldClass} min-w-[140px] flex-1`,
                                                style: fieldStyle,
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                        value: "",
                                                        children: "(none)"
                                                    }, void 0, false, {
                                                        fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
                                                        lineNumber: 367,
                                                        columnNumber: 33
                                                    }, this),
                                                    props.jobVendorOptions.map((v)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                            value: v.id,
                                                            children: v.label
                                                        }, v.id, false, {
                                                            fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
                                                            lineNumber: 369,
                                                            columnNumber: 37
                                                        }, this))
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
                                                lineNumber: 359,
                                                columnNumber: 29
                                            }, this),
                                            vid ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                type: "button",
                                                onClick: ()=>props.openDrawer("vendors", vid),
                                                className: "text-[11px] font-medium px-2 py-1 rounded-md border transition-colors shrink-0",
                                                style: {
                                                    borderColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].border,
                                                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["brand"].primary
                                                },
                                                children: "Open"
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
                                                lineNumber: 375,
                                                columnNumber: 33
                                            }, this) : null
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
                                        lineNumber: 358,
                                        columnNumber: 25
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
                                lineNumber: 354,
                                columnNumber: 21
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "sm:col-span-2",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                        htmlFor: "job-primary-customer",
                                        className: primaryPanelLabelClass,
                                        style: {
                                            color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].textSecondary
                                        },
                                        children: "Customer"
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
                                        lineNumber: 387,
                                        columnNumber: 25
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "flex flex-wrap items-center gap-1.5",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                                                id: "job-primary-customer",
                                                value: String(props.formData.customer_id ?? ""),
                                                onChange: (e)=>props.setFormData((f)=>({
                                                            ...f,
                                                            customer_id: e.target.value,
                                                            primary_contact_id: "",
                                                            opportunity_id: ""
                                                        })),
                                                onBlur: props.onBlur,
                                                disabled: !props.canMutate,
                                                className: `${primaryPanelFieldClass} min-w-[160px] flex-1`,
                                                style: fieldStyle,
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                        value: "",
                                                        children: "(none)"
                                                    }, void 0, false, {
                                                        fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
                                                        lineNumber: 407,
                                                        columnNumber: 33
                                                    }, this),
                                                    props.jobCustomerOptions.map((c)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                            value: c.id,
                                                            children: c.name ?? c.id
                                                        }, c.id, false, {
                                                            fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
                                                            lineNumber: 409,
                                                            columnNumber: 37
                                                        }, this))
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
                                                lineNumber: 391,
                                                columnNumber: 29
                                            }, this),
                                            String(props.formData.customer_id ?? "").trim() ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                type: "button",
                                                onClick: ()=>props.openDrawer("customers", String(props.formData.customer_id)),
                                                className: "text-[11px] font-medium px-2 py-1 rounded-md border shrink-0 transition-colors",
                                                style: {
                                                    borderColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].border,
                                                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["brand"].primary
                                                },
                                                children: "Open"
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
                                                lineNumber: 415,
                                                columnNumber: 33
                                            }, this) : null
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
                                        lineNumber: 390,
                                        columnNumber: 25
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
                                lineNumber: 386,
                                columnNumber: 21
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "sm:col-span-2",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                        htmlFor: "job-primary-contact",
                                        className: primaryPanelLabelClass,
                                        style: {
                                            color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].textSecondary
                                        },
                                        children: "Primary person"
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
                                        lineNumber: 427,
                                        columnNumber: 25
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                                        id: "job-primary-contact",
                                        value: String(props.formData.primary_contact_id ?? ""),
                                        onChange: (e)=>props.setFormData((f)=>({
                                                    ...f,
                                                    primary_contact_id: e.target.value
                                                })),
                                        onBlur: props.onBlur,
                                        disabled: !props.canMutate || props.primaryContactDisabled,
                                        className: primaryPanelFieldClass,
                                        style: fieldStyle,
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                value: "",
                                                children: "(none)"
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
                                                lineNumber: 439,
                                                columnNumber: 29
                                            }, this),
                                            props.jobContactOptions.map((c)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                    value: c.id,
                                                    children: c.label
                                                }, c.id, false, {
                                                    fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
                                                    lineNumber: 441,
                                                    columnNumber: 33
                                                }, this))
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
                                        lineNumber: 430,
                                        columnNumber: 25
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
                                lineNumber: 426,
                                columnNumber: 21
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "sm:col-span-2",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                        htmlFor: "job-primary-location",
                                        className: primaryPanelLabelClass,
                                        style: {
                                            color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].textSecondary
                                        },
                                        children: "Service location"
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
                                        lineNumber: 448,
                                        columnNumber: 25
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "flex flex-wrap items-center gap-1.5",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                                                id: "job-primary-location",
                                                value: String(props.formData.location_id ?? ""),
                                                onChange: (e)=>props.setFormData((f)=>({
                                                            ...f,
                                                            location_id: e.target.value || null
                                                        })),
                                                onBlur: props.onBlur,
                                                disabled: !props.canMutate,
                                                className: `${primaryPanelFieldClass} min-w-[160px] flex-1`,
                                                style: fieldStyle,
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                        value: "",
                                                        children: "(none)"
                                                    }, void 0, false, {
                                                        fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
                                                        lineNumber: 461,
                                                        columnNumber: 33
                                                    }, this),
                                                    props.jobLocationOptions.map((loc)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                            value: loc.id,
                                                            children: loc.label
                                                        }, loc.id, false, {
                                                            fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
                                                            lineNumber: 463,
                                                            columnNumber: 37
                                                        }, this))
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
                                                lineNumber: 452,
                                                columnNumber: 29
                                            }, this),
                                            String(props.formData.location_id ?? "").trim() ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                type: "button",
                                                onClick: ()=>props.openDrawer("locations", String(props.formData.location_id)),
                                                className: "text-[11px] font-medium px-2 py-1 rounded-md border shrink-0 transition-colors",
                                                style: {
                                                    borderColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].border,
                                                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["brand"].primary
                                                },
                                                children: "Open"
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
                                                lineNumber: 469,
                                                columnNumber: 33
                                            }, this) : null,
                                            props.canMutate ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                type: "button",
                                                onClick: props.openJobLocationChange,
                                                className: "text-[11px] font-medium px-2 py-1 rounded-md border shrink-0 transition-colors",
                                                style: {
                                                    borderColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].border,
                                                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].textSecondary
                                                },
                                                children: "Change"
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
                                                lineNumber: 479,
                                                columnNumber: 33
                                            }, this) : null
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
                                        lineNumber: 451,
                                        columnNumber: 25
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
                                lineNumber: 447,
                                columnNumber: 21
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "sm:col-span-2",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: primaryPanelLabelClass,
                                        style: {
                                            color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].textSecondary
                                        },
                                        children: "Next visit"
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
                                        lineNumber: 491,
                                        columnNumber: 25
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "flex flex-wrap items-center gap-2 pt-0.5",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: primaryPanelReadClass,
                                                style: {
                                                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["neutral"].textPrimary
                                                },
                                                children: nextLabel
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
                                                lineNumber: 495,
                                                columnNumber: 29
                                            }, this),
                                            props.firstSchedule && !props.rescheduleFormActive ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                type: "button",
                                                onClick: ()=>props.openReschedule(props.firstSchedule),
                                                className: "text-[11px] font-medium px-2 py-1 rounded-md border transition-colors",
                                                style: {
                                                    borderColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].border,
                                                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["brand"].primary
                                                },
                                                children: "Reschedule"
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
                                                lineNumber: 499,
                                                columnNumber: 33
                                            }, this) : null
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
                                        lineNumber: 494,
                                        columnNumber: 25
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
                                lineNumber: 490,
                                columnNumber: 21
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
                        lineNumber: 332,
                        columnNumber: 17
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "min-w-0 space-y-2 rounded-lg px-3 py-2.5",
                        style: {
                            backgroundColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].maskOverlay,
                            borderWidth: 1,
                            borderStyle: "solid",
                            borderColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].border
                        },
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: "text-[10px] font-semibold uppercase tracking-wide mb-0.5",
                                style: {
                                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].textSecondary
                                },
                                children: "Summary"
                            }, void 0, false, {
                                fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
                                lineNumber: 520,
                                columnNumber: 21
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "grid grid-cols-1 gap-y-1.5",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: primaryPanelLabelClass,
                                                style: {
                                                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].textSecondary
                                                },
                                                children: "Total price"
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
                                                lineNumber: 525,
                                                columnNumber: 29
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: primaryPanelReadClass,
                                                style: {
                                                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["neutral"].textPrimary
                                                },
                                                children: Number.isFinite(totalCents) ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminFormatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatMoneyFromCents"])(totalCents) : "—"
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
                                                lineNumber: 528,
                                                columnNumber: 29
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
                                        lineNumber: 524,
                                        columnNumber: 25
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: primaryPanelLabelClass,
                                                style: {
                                                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].textSecondary
                                                },
                                                children: "Outstanding balance"
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
                                                lineNumber: 533,
                                                columnNumber: 29
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: primaryPanelReadClass,
                                                style: {
                                                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["neutral"].textPrimary
                                                },
                                                children: Number.isFinite(balCents) ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminFormatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatMoneyFromCents"])(balCents) : "—"
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
                                                lineNumber: 536,
                                                columnNumber: 29
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
                                        lineNumber: 532,
                                        columnNumber: 25
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: primaryPanelLabelClass,
                                                style: {
                                                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].textSecondary
                                                },
                                                children: "Service"
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
                                                lineNumber: 541,
                                                columnNumber: 29
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: `${primaryPanelReadClass} font-normal`,
                                                style: {
                                                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["neutral"].textPrimary
                                                },
                                                children: serviceType
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
                                                lineNumber: 544,
                                                columnNumber: 29
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
                                        lineNumber: 540,
                                        columnNumber: 25
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: primaryPanelLabelClass,
                                                style: {
                                                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].textSecondary
                                                },
                                                children: "Frequency"
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
                                                lineNumber: 549,
                                                columnNumber: 29
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: `${primaryPanelReadClass} font-normal`,
                                                style: {
                                                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["neutral"].textPrimary
                                                },
                                                children: formatServiceFrequencyReadLabel(r.service_frequency_key)
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
                                                lineNumber: 552,
                                                columnNumber: 29
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
                                        lineNumber: 548,
                                        columnNumber: 25
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: primaryPanelLabelClass,
                                                style: {
                                                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].textSecondary
                                                },
                                                children: "Recurring"
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
                                                lineNumber: 557,
                                                columnNumber: 29
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: `${primaryPanelReadClass} font-normal`,
                                                style: {
                                                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["neutral"].textPrimary
                                                },
                                                children: recurring
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
                                                lineNumber: 560,
                                                columnNumber: 29
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
                                        lineNumber: 556,
                                        columnNumber: 25
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
                                lineNumber: 523,
                                columnNumber: 21
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
                        lineNumber: 511,
                        columnNumber: 17
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
                lineNumber: 331,
                columnNumber: 13
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
        lineNumber: 323,
        columnNumber: 9
    }, this);
}
_c2 = JobRecordPrimaryPanel;
function JobDrawerV2PrimaryActions(props) {
    const btnBase = {
        fontSize: 13,
        padding: "6px 12px",
        borderRadius: 8,
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].border,
        backgroundColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["neutral"].surface,
        color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["neutral"].textPrimary
    };
    const primaryBtn = {
        ...btnBase,
        backgroundColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["brand"].primary,
        borderColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["brand"].primary,
        color: "#fff"
    };
    const p = props;
    const useChrome = (p.recordChromeActions?.length ?? 0) > 0 && p.onRecordChromeAction;
    const chromePrimary = (p.recordChromeActions ?? []).filter((a)=>a.placement === "primary");
    const chromeSecondary = (p.recordChromeActions ?? []).filter((a)=>a.placement === "secondary");
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "flex flex-wrap items-center gap-2",
        "data-adminv2-job-record-primary-actions": "true",
        children: [
            useChrome ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
                children: [
                    chromePrimary.map((a)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                            type: "button",
                            disabled: !p.canMutate && a.event_key === "collect_payment",
                            onClick: ()=>p.onRecordChromeAction?.(a.event_key),
                            style: primaryBtn,
                            className: "min-h-[36px] font-semibold shadow-sm disabled:opacity-50",
                            children: a.label
                        }, a.id, false, {
                            fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
                            lineNumber: 620,
                            columnNumber: 25
                        }, this)),
                    chromeSecondary.map((a)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                            type: "button",
                            onClick: ()=>p.onRecordChromeAction?.(a.event_key),
                            style: btnBase,
                            className: "min-h-[36px] font-medium shadow-sm",
                            children: a.label
                        }, a.id, false, {
                            fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
                            lineNumber: 632,
                            columnNumber: 25
                        }, this))
                ]
            }, void 0, true) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                    type: "button",
                    disabled: !p.canMutate,
                    onClick: ()=>{
                        p.clearPaymentToast();
                        p.openCollectPayment();
                    },
                    style: primaryBtn,
                    className: "min-h-[36px] font-semibold shadow-sm disabled:opacity-50",
                    children: "Add payment"
                }, void 0, false, {
                    fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
                    lineNumber: 645,
                    columnNumber: 21
                }, this)
            }, void 0, false),
            p.hasServerJobPaymentSummary && p.jobPaymentSummaryFromApi?.payment_status_key === "failed" && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                type: "button",
                disabled: !p.canMutate,
                onClick: ()=>{
                    p.clearPaymentToast();
                    p.openCollectPayment();
                },
                style: {
                    ...btnBase,
                    borderColor: "rgba(188, 67, 0, 0.45)",
                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["brand"].accent,
                    backgroundColor: "rgba(188, 67, 0, 0.06)"
                },
                className: "min-h-[36px] font-semibold shadow-sm disabled:opacity-50",
                children: "Retry payment"
            }, void 0, false, {
                fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
                lineNumber: 660,
                columnNumber: 17
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                type: "button",
                disabled: !!p.jobActionLoading,
                onClick: async ()=>{
                    if (!p.jobId) return;
                    p.setJobActionLoading("mark_completed");
                    try {
                        const res = await fetch(`/api/admin/jobs/${p.jobId}`, {
                            method: "PATCH",
                            headers: {
                                "Content-Type": "application/json"
                            },
                            body: JSON.stringify({
                                action: "mark_completed"
                            })
                        });
                        const json = await res.json().catch(()=>({}));
                        if (!res.ok) throw new Error(json.error || "Failed");
                        p.setData((prev)=>prev ? {
                                ...prev,
                                ...json
                            } : prev);
                        p.refetch();
                        p.router.refresh();
                    } catch (e) {
                        console.error("Mark completed failed", e);
                    } finally{
                        p.setJobActionLoading(null);
                    }
                },
                style: {
                    ...primaryBtn,
                    backgroundColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["brand"].secondary,
                    borderColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["brand"].secondary
                },
                className: "min-h-[36px] font-semibold shadow-sm disabled:opacity-50",
                children: p.jobActionLoading === "mark_completed" ? "…" : "Mark complete"
            }, void 0, false, {
                fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
                lineNumber: 678,
                columnNumber: 13
            }, this),
            !useChrome && p.canMutate && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                type: "button",
                onClick: ()=>{
                    p.setJobExpandedSections((s)=>({
                            ...s,
                            relationships: true
                        }));
                    requestAnimationFrame(()=>{
                        document.getElementById("job-assign-vendor-section")?.scrollIntoView({
                            behavior: "smooth",
                            block: "nearest"
                        });
                    });
                },
                style: btnBase,
                className: "min-h-[36px] font-medium shadow-sm",
                children: [
                    "Assign ",
                    p.vendorSingular
                ]
            }, void 0, true, {
                fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
                lineNumber: 707,
                columnNumber: 17
            }, this),
            p.jobSchedulesLength > 0 && !p.rescheduleFormActive && p.firstSchedule ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                type: "button",
                onClick: ()=>p.openReschedule(p.firstSchedule),
                style: btnBase,
                className: "min-h-[36px] font-medium shadow-sm",
                children: "Reschedule"
            }, void 0, false, {
                fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
                lineNumber: 725,
                columnNumber: 17
            }, this) : null
        ]
    }, void 0, true, {
        fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
        lineNumber: 616,
        columnNumber: 9
    }, this);
}
_c3 = JobDrawerV2PrimaryActions;
function JobDrawerV2OverviewShell(props) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(220px,260px)] lg:items-start lg:gap-5",
        style: shell,
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "min-w-0 space-y-4",
                children: props.primary
            }, void 0, false, {
                fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
                lineNumber: 744,
                columnNumber: 13
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("aside", {
                className: "min-w-0 space-y-3 lg:sticky lg:top-2",
                "aria-label": "Record meta",
                children: props.rail
            }, void 0, false, {
                fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
                lineNumber: 745,
                columnNumber: 13
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
        lineNumber: 740,
        columnNumber: 9
    }, this);
}
_c4 = JobDrawerV2OverviewShell;
function JobDrawerV2TimelineCard(props) {
    const d = props.data;
    if (!d) return null;
    const rows = [];
    if (d.created_at) rows.push({
        label: "Created",
        value: (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminFormatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatDateTime"])(String(d.created_at))
    });
    if (d.updated_at) rows.push({
        label: "Updated",
        value: (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminFormatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatDateTime"])(String(d.updated_at))
    });
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
        className: "rounded-[10px] px-3 py-3",
        style: {
            borderWidth: 1,
            borderStyle: "solid",
            borderColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].border,
            backgroundColor: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["neutral"].surface,
            boxShadow: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].cardShadow
        },
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                className: "text-xs font-semibold uppercase tracking-wide",
                style: {
                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].textSecondary
                },
                children: "Timeline"
            }, void 0, false, {
                fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
                lineNumber: 769,
                columnNumber: 13
            }, this),
            rows.length === 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "mt-2 text-sm",
                style: {
                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].textSecondary
                },
                children: "No timestamps on record."
            }, void 0, false, {
                fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
                lineNumber: 773,
                columnNumber: 17
            }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                className: "mt-2 list-none space-y-1.5 p-0 m-0 text-sm",
                style: {
                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["neutral"].textPrimary
                },
                children: rows.map((r)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                        className: "flex justify-between gap-3",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                style: {
                                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].textSecondary
                                },
                                children: r.label
                            }, void 0, false, {
                                fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
                                lineNumber: 780,
                                columnNumber: 29
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "text-right font-medium",
                                children: r.value
                            }, void 0, false, {
                                fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
                                lineNumber: 781,
                                columnNumber: 29
                            }, this)
                        ]
                    }, r.label, true, {
                        fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
                        lineNumber: 779,
                        columnNumber: 25
                    }, this))
            }, void 0, false, {
                fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
                lineNumber: 777,
                columnNumber: 17
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
        lineNumber: 759,
        columnNumber: 9
    }, this);
}
_c5 = JobDrawerV2TimelineCard;
function JobDrawerV2StatusHeader(props) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "flex flex-wrap items-center gap-2",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$StatusBadge$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["StatusBadge"], {
            label: props.statusLabel,
            variant: props.statusVariant
        }, void 0, false, {
            fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
            lineNumber: 793,
            columnNumber: 13
        }, this)
    }, void 0, false, {
        fileName: "[project]/components/admin/drawer/JobDrawerV2.tsx",
        lineNumber: 792,
        columnNumber: 9
    }, this);
}
_c6 = JobDrawerV2StatusHeader;
var _c, _c1, _c2, _c3, _c4, _c5, _c6;
__turbopack_context__.k.register(_c, "JobDrawerV2TabBar");
__turbopack_context__.k.register(_c1, "JobDrawerV2SignalsStrip");
__turbopack_context__.k.register(_c2, "JobRecordPrimaryPanel");
__turbopack_context__.k.register(_c3, "JobDrawerV2PrimaryActions");
__turbopack_context__.k.register(_c4, "JobDrawerV2OverviewShell");
__turbopack_context__.k.register(_c5, "JobDrawerV2TimelineCard");
__turbopack_context__.k.register(_c6, "JobDrawerV2StatusHeader");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/components/admin/drawer/JobRecordModalV2.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "JOB_RECORD_MODAL_V2_OVERVIEW_SECTIONS",
    ()=>JOB_RECORD_MODAL_V2_OVERVIEW_SECTIONS,
    "JOB_RECORD_MODAL_V2_SECTION_GRID",
    ()=>JOB_RECORD_MODAL_V2_SECTION_GRID,
    "default",
    ()=>JobRecordModalV2,
    "isCleaningJobRecord",
    ()=>isCleaningJobRecord
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/styles/tokens/colors.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminFormatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/adminFormatters.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$entityPresentation$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/entityPresentation.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$entity$2f$EntityDrawerOverview$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/components/admin/entity/EntityDrawerOverview.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$recordChrome$2f$types$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/recordChrome/types.ts [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
;
;
;
;
const shell = {
    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["neutral"].textPrimary,
    ["--d-muted"]: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].textSecondary,
    ["--d-border"]: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].border,
    ["--d-surface"]: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["neutral"].surface,
    ["--d-brand"]: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["brand"].primary
};
function formatServiceFrequencyReadLabel(k) {
    if (k == null || String(k).trim() === "") return "—";
    return String(k).replace(/_/g, " ");
}
function isCleaningJobRecord(record) {
    if (!record) return false;
    const sk = String(record.service_key ?? "").trim().toLowerCase();
    if (sk === "cleaning") return true;
    const vs = String(record._vertical_slug ?? "").trim().toLowerCase();
    if (vs === "cleaning") return true;
    return false;
}
const JOB_RECORD_MODAL_V2_SECTION_GRID = {
    property_service_v2: 2,
    /** Paired date fields — reads well at 2 columns from `md` up (EntityDrawerSection). */ scheduling_v2: 2,
    job_pricing_breakdown: 1,
    /** Subsections (Plan / Totals) — 2 columns balances density vs. scanability. */ pricing: 2,
    people_places_v2: 2,
    communications_canonical_embed: 1,
    internal_notes_record_v2: 1
};
function buildJobRecordModalV2OverviewSections() {
    const pres = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$entityPresentation$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getEntityPresentation"])("jobs").drawer?.overviewSections ?? [];
    const ps = pres.find((s)=>s.key === "property_service");
    const sched = pres.find((s)=>s.key === "scheduling");
    const notes = pres.find((s)=>s.key === "notes");
    const rec = pres.find((s)=>s.key === "record_info");
    const propertyFields = [
        {
            key: "title",
            label: "Title",
            span: 1,
            renderHint: "text",
            editable: true
        },
        {
            key: "service_key",
            label: "Service",
            span: 1,
            renderHint: "text",
            editable: true
        },
        {
            key: "job_type",
            label: "Job type",
            span: 1,
            renderHint: "text",
            editable: true
        },
        ...ps?.fields ?? []
    ];
    const schedFields = (sched?.fields ?? []).filter((f)=>f.key !== "_next_schedule");
    const pb = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$entityPresentation$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getJobPricingBreakdownSection"])();
    const bill = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$entityPresentation$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getJobOverviewBillingSummarySection"])();
    const peoplePlacesFields = [
        {
            key: "customer_id",
            label: "Customer",
            span: 1,
            renderHint: "link",
            editable: true,
            linkTarget: {
                idField: "customer_id",
                entityType: "customers"
            }
        },
        {
            key: "opportunity_id",
            label: "Opportunity",
            span: 1,
            renderHint: "link",
            editable: true,
            linkTarget: {
                idField: "opportunity_id",
                entityType: "opportunities"
            }
        },
        {
            key: "work_unit_id",
            label: "Work unit",
            span: 1,
            renderHint: "text",
            editable: true
        }
    ];
    const g = JOB_RECORD_MODAL_V2_SECTION_GRID;
    return [
        {
            key: "property_service_v2",
            title: "Property & service details",
            defaultExpanded: true,
            collapsible: true,
            gridCols: g.property_service_v2,
            fields: propertyFields,
            locked: true
        },
        {
            key: "scheduling_v2",
            title: "Scheduling",
            defaultExpanded: false,
            collapsible: true,
            gridCols: g.scheduling_v2,
            fields: schedFields,
            locked: true
        },
        {
            ...pb,
            key: "job_pricing_breakdown",
            title: "Pricing",
            defaultExpanded: false,
            gridCols: g.job_pricing_breakdown
        },
        {
            ...bill,
            defaultExpanded: false,
            gridCols: g.pricing
        },
        {
            key: "people_places_v2",
            title: "People & places",
            defaultExpanded: false,
            collapsible: true,
            gridCols: g.people_places_v2,
            fields: peoplePlacesFields,
            locked: true
        },
        {
            key: "communications_canonical_embed",
            title: "Communication",
            defaultExpanded: false,
            collapsible: true,
            gridCols: g.communications_canonical_embed,
            fields: [],
            locked: true
        },
        {
            key: "internal_notes_record_v2",
            title: "Internal notes & record details",
            defaultExpanded: false,
            collapsible: true,
            gridCols: g.internal_notes_record_v2,
            fields: [
                ...notes?.fields ?? [],
                ...rec?.fields ?? []
            ],
            locked: true
        }
    ];
}
const JOB_RECORD_MODAL_V2_OVERVIEW_SECTIONS = buildJobRecordModalV2OverviewSections();
/** Minimal record controls — chrome from `.adminv2-jrm-record-select` (workspace.css); snapshot grid uses compact overrides */ const recordSelectClass = "adminv2-job-record-primary-input adminv2-job-record-modal-v2-input adminv2-jrm-record-select adminv2-jrm-snapshot-select w-full min-w-0 max-w-full font-medium text-alloy-forge disabled:opacity-60";
const textActionClass = "adminv2-jrm-text-action text-[11px] font-medium text-alloy-blue hover:underline underline-offset-2 decoration-alloy-blue/40 bg-transparent border-0 p-0 cursor-pointer shrink-0";
const textActionMutedClass = "adminv2-jrm-text-action text-[11px] font-medium text-alloy-midnight/55 hover:text-alloy-midnight/80 hover:underline underline-offset-2 bg-transparent border-0 p-0 cursor-pointer shrink-0";
/** Compact label-over-control cell for the snapshot summary grid */ function JrmSnapCell(props) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: `min-w-0 ${props.className ?? ""}`,
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "mb-0.5 text-[9px] font-semibold uppercase leading-none tracking-[0.1em]",
                style: {
                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].textSecondary
                },
                children: props.label
            }, void 0, false, {
                fileName: "[project]/components/admin/drawer/JobRecordModalV2.tsx",
                lineNumber: 160,
                columnNumber: 13
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5",
                children: props.children
            }, void 0, false, {
                fileName: "[project]/components/admin/drawer/JobRecordModalV2.tsx",
                lineNumber: 166,
                columnNumber: 13
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/components/admin/drawer/JobRecordModalV2.tsx",
        lineNumber: 159,
        columnNumber: 9
    }, this);
}
_c = JrmSnapCell;
function JobRecordModalV2(props) {
    _s();
    const overviewSectionsResolved = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "JobRecordModalV2.useMemo[overviewSectionsResolved]": ()=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$recordChrome$2f$types$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["applyOverviewSectionOrder"])(JOB_RECORD_MODAL_V2_OVERVIEW_SECTIONS, props.recordChromeLayout?.config_json?.overview_section_order)
    }["JobRecordModalV2.useMemo[overviewSectionsResolved]"], [
        props.recordChromeLayout
    ]);
    const r = props.record ?? {};
    const totalRaw = r.display_total_cents ?? r.total_cents ?? r.gross_price_cents ?? r.estimated_total_cents;
    const totalCents = typeof totalRaw === "number" ? totalRaw : typeof totalRaw === "string" ? parseFloat(totalRaw) : NaN;
    const balRaw = r._job_payment_balance_cents;
    const balCents = typeof balRaw === "number" ? balRaw : typeof balRaw === "string" ? parseFloat(balRaw) : NaN;
    const nextIso = r._next_schedule != null && String(r._next_schedule).trim() !== "" ? String(r._next_schedule) : props.firstSchedule?.start_at ?? "";
    let nextLabel = "—";
    if (nextIso) {
        try {
            nextLabel = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminFormatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatDateTime"])(nextIso);
        } catch  {
            nextLabel = nextIso;
        }
    }
    const serviceType = String(r.service_key ?? "").trim() || String(r.job_type ?? "").trim() || "—";
    const recurring = r.is_recurring === true || r.is_recurring === "true" ? "Yes" : r.is_recurring === false || r.is_recurring === "false" ? "No" : "—";
    const statusOptions = props.statusDefs.filter((s)=>s.is_active !== false).sort((a, b)=>(a.sort_order ?? 0) - (b.sort_order ?? 0));
    const sk = String(props.formData.status_key ?? r.status_key ?? "").trim();
    if (sk && !statusOptions.some((s)=>s.status_key === sk)) {
        statusOptions.push({
            status_key: sk,
            status_label: sk,
            sort_order: 9999,
            is_active: true
        });
    }
    const vid = String(props.formData.assigned_vendor_id ?? "").trim();
    const customerName = String(r._customer_name ?? "").trim();
    const customerId = String(props.formData.customer_id ?? "").trim();
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        "data-adminv2-job-record-modal-v2": "true",
        className: "adminv2-jrm-root w-full max-w-none space-y-2",
        style: {
            ...shell,
            marginTop: -4
        },
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                "data-jrm-strip": "account",
                className: "adminv2-jrm-account-strip flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-xl px-3 py-1.5",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-[10px] font-semibold uppercase tracking-[0.1em]",
                        style: {
                            color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].textSecondary
                        },
                        children: "Account"
                    }, void 0, false, {
                        fileName: "[project]/components/admin/drawer/JobRecordModalV2.tsx",
                        lineNumber: 259,
                        columnNumber: 17
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-sm font-medium",
                        style: {
                            color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["neutral"].textPrimary
                        },
                        children: customerName || "—"
                    }, void 0, false, {
                        fileName: "[project]/components/admin/drawer/JobRecordModalV2.tsx",
                        lineNumber: 262,
                        columnNumber: 17
                    }, this),
                    customerId ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        type: "button",
                        onClick: ()=>props.openDrawer("customers", customerId),
                        className: textActionClass,
                        children: "Open"
                    }, void 0, false, {
                        fileName: "[project]/components/admin/drawer/JobRecordModalV2.tsx",
                        lineNumber: 266,
                        columnNumber: 21
                    }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-xs",
                        style: {
                            color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].textSecondary
                        },
                        children: "No customer linked"
                    }, void 0, false, {
                        fileName: "[project]/components/admin/drawer/JobRecordModalV2.tsx",
                        lineNumber: 270,
                        columnNumber: 21
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/admin/drawer/JobRecordModalV2.tsx",
                lineNumber: 255,
                columnNumber: 13
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "adminv2-jrm-snapshot-card rounded-xl px-1.5 py-1 sm:px-2 sm:py-1.5",
                "data-adminv2-job-record-modal-v2-top": "true",
                style: shell,
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "px-0.5 pb-1 text-[9px] font-semibold uppercase tracking-[0.12em] leading-none",
                        style: {
                            color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].textSecondary
                        },
                        children: "Record snapshot"
                    }, void 0, false, {
                        fileName: "[project]/components/admin/drawer/JobRecordModalV2.tsx",
                        lineNumber: 281,
                        columnNumber: 17
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        "data-jrm-snapshot-grid": "true",
                        className: "adminv2-jrm-snapshot-grid space-y-1.5 px-0.5",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "grid grid-cols-1 gap-x-2.5 gap-y-1.5 sm:grid-cols-2 xl:grid-cols-4",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(JrmSnapCell, {
                                        label: "Status",
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                                            id: "job-modal-v2-status",
                                            value: sk,
                                            onChange: (e)=>props.setFormData((f)=>({
                                                        ...f,
                                                        status_key: e.target.value || null
                                                    })),
                                            onBlur: props.onBlurSave,
                                            disabled: !props.canMutate,
                                            className: recordSelectClass,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                    value: "",
                                                    children: "— None —"
                                                }, void 0, false, {
                                                    fileName: "[project]/components/admin/drawer/JobRecordModalV2.tsx",
                                                    lineNumber: 298,
                                                    columnNumber: 33
                                                }, this),
                                                statusOptions.map((s)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                        value: s.status_key,
                                                        children: s.status_label ?? s.status_key
                                                    }, s.status_key, false, {
                                                        fileName: "[project]/components/admin/drawer/JobRecordModalV2.tsx",
                                                        lineNumber: 300,
                                                        columnNumber: 37
                                                    }, this))
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/components/admin/drawer/JobRecordModalV2.tsx",
                                            lineNumber: 290,
                                            columnNumber: 29
                                        }, this)
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/drawer/JobRecordModalV2.tsx",
                                        lineNumber: 289,
                                        columnNumber: 25
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        id: "job-assign-vendor-section",
                                        className: "min-w-0",
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(JrmSnapCell, {
                                            label: "Assigned vendor",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                                                    value: String(props.formData.assigned_vendor_id ?? ""),
                                                    onChange: (e)=>props.setFormData((f)=>({
                                                                ...f,
                                                                assigned_vendor_id: e.target.value || null
                                                            })),
                                                    onBlur: props.onBlurSave,
                                                    disabled: !props.canMutate,
                                                    className: recordSelectClass,
                                                    "aria-label": "Assigned vendor",
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                            value: "",
                                                            children: "(none)"
                                                        }, void 0, false, {
                                                            fileName: "[project]/components/admin/drawer/JobRecordModalV2.tsx",
                                                            lineNumber: 316,
                                                            columnNumber: 37
                                                        }, this),
                                                        props.jobVendorOptions.map((v)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                                value: v.id,
                                                                children: v.label
                                                            }, v.id, false, {
                                                                fileName: "[project]/components/admin/drawer/JobRecordModalV2.tsx",
                                                                lineNumber: 318,
                                                                columnNumber: 41
                                                            }, this))
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/components/admin/drawer/JobRecordModalV2.tsx",
                                                    lineNumber: 308,
                                                    columnNumber: 33
                                                }, this),
                                                vid ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                    type: "button",
                                                    onClick: ()=>props.openDrawer("vendors", vid),
                                                    className: textActionClass,
                                                    children: "Open"
                                                }, void 0, false, {
                                                    fileName: "[project]/components/admin/drawer/JobRecordModalV2.tsx",
                                                    lineNumber: 324,
                                                    columnNumber: 37
                                                }, this) : null
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/components/admin/drawer/JobRecordModalV2.tsx",
                                            lineNumber: 307,
                                            columnNumber: 29
                                        }, this)
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/drawer/JobRecordModalV2.tsx",
                                        lineNumber: 306,
                                        columnNumber: 25
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(JrmSnapCell, {
                                        label: "Work unit",
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                                            value: String(props.formData.work_unit_id ?? ""),
                                            onChange: (e)=>props.setFormData((f)=>({
                                                        ...f,
                                                        work_unit_id: e.target.value || null
                                                    })),
                                            onBlur: props.onBlurSave,
                                            disabled: !props.canMutate,
                                            className: recordSelectClass,
                                            "aria-label": "Work unit",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                    value: "",
                                                    children: "Unassigned (inbox)"
                                                }, void 0, false, {
                                                    fileName: "[project]/components/admin/drawer/JobRecordModalV2.tsx",
                                                    lineNumber: 339,
                                                    columnNumber: 33
                                                }, this),
                                                props.jobWorkUnitOptions.map((o)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                        value: o.id,
                                                        children: o.label
                                                    }, o.id, false, {
                                                        fileName: "[project]/components/admin/drawer/JobRecordModalV2.tsx",
                                                        lineNumber: 341,
                                                        columnNumber: 37
                                                    }, this))
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/components/admin/drawer/JobRecordModalV2.tsx",
                                            lineNumber: 331,
                                            columnNumber: 29
                                        }, this)
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/drawer/JobRecordModalV2.tsx",
                                        lineNumber: 330,
                                        columnNumber: 25
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(JrmSnapCell, {
                                        label: "Primary person",
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                                            id: "job-modal-v2-contact",
                                            value: String(props.formData.primary_contact_id ?? ""),
                                            onChange: (e)=>props.setFormData((f)=>({
                                                        ...f,
                                                        primary_contact_id: e.target.value
                                                    })),
                                            onBlur: props.onBlurSave,
                                            disabled: !props.canMutate || props.primaryContactDisabled,
                                            className: recordSelectClass,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                    value: "",
                                                    children: "(none)"
                                                }, void 0, false, {
                                                    fileName: "[project]/components/admin/drawer/JobRecordModalV2.tsx",
                                                    lineNumber: 356,
                                                    columnNumber: 33
                                                }, this),
                                                props.jobContactOptions.map((c)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                        value: c.id,
                                                        children: c.label
                                                    }, c.id, false, {
                                                        fileName: "[project]/components/admin/drawer/JobRecordModalV2.tsx",
                                                        lineNumber: 358,
                                                        columnNumber: 37
                                                    }, this))
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/components/admin/drawer/JobRecordModalV2.tsx",
                                            lineNumber: 348,
                                            columnNumber: 29
                                        }, this)
                                    }, void 0, false, {
                                        fileName: "[project]/components/admin/drawer/JobRecordModalV2.tsx",
                                        lineNumber: 347,
                                        columnNumber: 25
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/admin/drawer/JobRecordModalV2.tsx",
                                lineNumber: 288,
                                columnNumber: 21
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "grid grid-cols-1 gap-x-2.5 gap-y-1 md:grid-cols-2",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(JrmSnapCell, {
                                        label: "Service location",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                                                id: "job-modal-v2-location",
                                                value: String(props.formData.location_id ?? ""),
                                                onChange: (e)=>props.setFormData((f)=>({
                                                            ...f,
                                                            location_id: e.target.value || null
                                                        })),
                                                onBlur: props.onBlurSave,
                                                disabled: !props.canMutate,
                                                className: recordSelectClass,
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                        value: "",
                                                        children: "(none)"
                                                    }, void 0, false, {
                                                        fileName: "[project]/components/admin/drawer/JobRecordModalV2.tsx",
                                                        lineNumber: 376,
                                                        columnNumber: 33
                                                    }, this),
                                                    props.jobLocationOptions.map((loc)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                            value: loc.id,
                                                            children: loc.label
                                                        }, loc.id, false, {
                                                            fileName: "[project]/components/admin/drawer/JobRecordModalV2.tsx",
                                                            lineNumber: 378,
                                                            columnNumber: 37
                                                        }, this))
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/components/admin/drawer/JobRecordModalV2.tsx",
                                                lineNumber: 368,
                                                columnNumber: 29
                                            }, this),
                                            String(props.formData.location_id ?? "").trim() ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                type: "button",
                                                onClick: ()=>props.openDrawer("locations", String(props.formData.location_id)),
                                                className: textActionClass,
                                                children: "Open"
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/drawer/JobRecordModalV2.tsx",
                                                lineNumber: 384,
                                                columnNumber: 33
                                            }, this) : null,
                                            props.canMutate ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                type: "button",
                                                onClick: props.openJobLocationChange,
                                                className: textActionMutedClass,
                                                children: "Change"
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/drawer/JobRecordModalV2.tsx",
                                                lineNumber: 393,
                                                columnNumber: 33
                                            }, this) : null
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/components/admin/drawer/JobRecordModalV2.tsx",
                                        lineNumber: 367,
                                        columnNumber: 25
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(JrmSnapCell, {
                                        label: "Next visit",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "text-[13px] font-medium leading-tight tabular-nums",
                                                style: {
                                                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["neutral"].textPrimary
                                                },
                                                children: nextLabel
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/drawer/JobRecordModalV2.tsx",
                                                lineNumber: 399,
                                                columnNumber: 29
                                            }, this),
                                            props.firstSchedule && !props.rescheduleFormActive ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                type: "button",
                                                onClick: ()=>props.openReschedule(props.firstSchedule),
                                                className: textActionClass,
                                                children: "Reschedule"
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/drawer/JobRecordModalV2.tsx",
                                                lineNumber: 403,
                                                columnNumber: 33
                                            }, this) : null
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/components/admin/drawer/JobRecordModalV2.tsx",
                                        lineNumber: 398,
                                        columnNumber: 25
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/admin/drawer/JobRecordModalV2.tsx",
                                lineNumber: 366,
                                columnNumber: 21
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "grid grid-cols-2 gap-x-2.5 gap-y-1 border-t border-solid border-[rgba(39,63,82,0.06)] pt-1.5 sm:grid-cols-3 xl:grid-cols-5",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "min-w-0",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "mb-0.5 text-[9px] font-semibold uppercase leading-none tracking-[0.1em]",
                                                style: {
                                                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].textSecondary
                                                },
                                                children: "Total"
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/drawer/JobRecordModalV2.tsx",
                                                lineNumber: 412,
                                                columnNumber: 29
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "text-[13px] font-semibold tabular-nums leading-tight",
                                                style: {
                                                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["neutral"].textPrimary
                                                },
                                                children: Number.isFinite(totalCents) ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminFormatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatMoneyFromCents"])(totalCents) : "—"
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/drawer/JobRecordModalV2.tsx",
                                                lineNumber: 418,
                                                columnNumber: 29
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/components/admin/drawer/JobRecordModalV2.tsx",
                                        lineNumber: 411,
                                        columnNumber: 25
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "min-w-0",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "mb-0.5 text-[9px] font-semibold uppercase leading-none tracking-[0.1em]",
                                                style: {
                                                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].textSecondary
                                                },
                                                children: "Outstanding"
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/drawer/JobRecordModalV2.tsx",
                                                lineNumber: 423,
                                                columnNumber: 29
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "text-[13px] font-semibold tabular-nums leading-tight",
                                                style: {
                                                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["neutral"].textPrimary
                                                },
                                                children: Number.isFinite(balCents) ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminFormatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatMoneyFromCents"])(balCents) : "—"
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/drawer/JobRecordModalV2.tsx",
                                                lineNumber: 429,
                                                columnNumber: 29
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/components/admin/drawer/JobRecordModalV2.tsx",
                                        lineNumber: 422,
                                        columnNumber: 25
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "min-w-0 xl:col-span-1",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "mb-0.5 text-[9px] font-semibold uppercase leading-none tracking-[0.1em]",
                                                style: {
                                                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].textSecondary
                                                },
                                                children: "Service"
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/drawer/JobRecordModalV2.tsx",
                                                lineNumber: 434,
                                                columnNumber: 29
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "truncate text-[13px] font-medium leading-tight",
                                                style: {
                                                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["neutral"].textPrimary
                                                },
                                                title: serviceType,
                                                children: serviceType
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/drawer/JobRecordModalV2.tsx",
                                                lineNumber: 440,
                                                columnNumber: 29
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/components/admin/drawer/JobRecordModalV2.tsx",
                                        lineNumber: 433,
                                        columnNumber: 25
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "min-w-0",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "mb-0.5 text-[9px] font-semibold uppercase leading-none tracking-[0.1em]",
                                                style: {
                                                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].textSecondary
                                                },
                                                children: "Frequency"
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/drawer/JobRecordModalV2.tsx",
                                                lineNumber: 449,
                                                columnNumber: 29
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "truncate text-[13px] font-medium leading-tight",
                                                style: {
                                                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["neutral"].textPrimary
                                                },
                                                children: formatServiceFrequencyReadLabel(r.service_frequency_key)
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/drawer/JobRecordModalV2.tsx",
                                                lineNumber: 455,
                                                columnNumber: 29
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/components/admin/drawer/JobRecordModalV2.tsx",
                                        lineNumber: 448,
                                        columnNumber: 25
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "min-w-0 col-span-2 sm:col-span-1 xl:col-span-1",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "mb-0.5 text-[9px] font-semibold uppercase leading-none tracking-[0.1em]",
                                                style: {
                                                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].textSecondary
                                                },
                                                children: "Recurring"
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/drawer/JobRecordModalV2.tsx",
                                                lineNumber: 460,
                                                columnNumber: 29
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "text-[13px] font-medium leading-tight",
                                                style: {
                                                    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["neutral"].textPrimary
                                                },
                                                children: recurring
                                            }, void 0, false, {
                                                fileName: "[project]/components/admin/drawer/JobRecordModalV2.tsx",
                                                lineNumber: 466,
                                                columnNumber: 29
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/components/admin/drawer/JobRecordModalV2.tsx",
                                        lineNumber: 459,
                                        columnNumber: 25
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/admin/drawer/JobRecordModalV2.tsx",
                                lineNumber: 410,
                                columnNumber: 21
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/admin/drawer/JobRecordModalV2.tsx",
                        lineNumber: 287,
                        columnNumber: 17
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/admin/drawer/JobRecordModalV2.tsx",
                lineNumber: 276,
                columnNumber: 13
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "adminv2-job-record-fielddeck adminv2-jrm-fielddeck-chapters",
                "data-adminv2-job-record-overview": "true",
                "data-jrm-chapters": "true",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$entity$2f$EntityDrawerOverview$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                    entityType: props.presentationType,
                    data: props.entityDrawerOverviewData,
                    customSectionContent: props.customSectionContent,
                    overviewSectionsOverride: overviewSectionsResolved,
                    selectOptionsByFieldKey: props.selectOptionsByFieldKey,
                    isEditing: props.isEditing,
                    formData: props.formData,
                    onFieldChange: (key, value)=>{
                        props.setFormData((prev)=>({
                                ...prev,
                                [key]: value
                            }));
                    },
                    onBlur: props.onBlurSave,
                    canEdit: props.canMutate,
                    statusDefs: props.statusDefs,
                    getStatusLabel: props.getStatusLabel,
                    onOpenDrawer: (type, id)=>props.openDrawer(type, id)
                }, void 0, false, {
                    fileName: "[project]/components/admin/drawer/JobRecordModalV2.tsx",
                    lineNumber: 479,
                    columnNumber: 17
                }, this)
            }, void 0, false, {
                fileName: "[project]/components/admin/drawer/JobRecordModalV2.tsx",
                lineNumber: 474,
                columnNumber: 13
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/components/admin/drawer/JobRecordModalV2.tsx",
        lineNumber: 250,
        columnNumber: 9
    }, this);
}
_s(JobRecordModalV2, "b4SVRsW0zDg51Lb12QdgJ6tVQ8Q=");
_c1 = JobRecordModalV2;
var _c, _c1;
__turbopack_context__.k.register(_c, "JrmSnapCell");
__turbopack_context__.k.register(_c1, "JobRecordModalV2");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/components/admin/drawer/ScheduleRecordModalV2.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>ScheduleRecordModalV2
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$entity$2f$EntityDrawerOverview$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/components/admin/entity/EntityDrawerOverview.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/styles/tokens/colors.ts [app-client] (ecmascript)");
"use client";
;
;
;
/** Aligns token shell with JobRecordModalV2 so job + schedule records feel like one system. */ const shell = {
    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["neutral"].textPrimary,
    ["--d-muted"]: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].textSecondary,
    ["--d-border"]: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["derived"].border,
    ["--d-surface"]: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["neutral"].surface,
    ["--d-brand"]: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["brand"].primary
};
function ScheduleRecordModalV2(props) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        "data-adminv2-schedule-record-modal": "true",
        className: "adminv2-schedule-record-modal-root w-full max-w-none space-y-2 [&_section[data-entity-section]]:mb-2 [&_[data-entity-drawer-overview]]:pt-2",
        style: {
            ...shell,
            marginTop: -2
        },
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "adminv2-schedule-record-fielddeck rounded-xl px-0.5 sm:px-1",
            style: shell,
            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$admin$2f$entity$2f$EntityDrawerOverview$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                ...props
            }, void 0, false, {
                fileName: "[project]/components/admin/drawer/ScheduleRecordModalV2.tsx",
                lineNumber: 46,
                columnNumber: 17
            }, this)
        }, void 0, false, {
            fileName: "[project]/components/admin/drawer/ScheduleRecordModalV2.tsx",
            lineNumber: 45,
            columnNumber: 13
        }, this)
    }, void 0, false, {
        fileName: "[project]/components/admin/drawer/ScheduleRecordModalV2.tsx",
        lineNumber: 40,
        columnNumber: 9
    }, this);
}
_c = ScheduleRecordModalV2;
var _c;
__turbopack_context__.k.register(_c, "ScheduleRecordModalV2");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
]);

//# sourceMappingURL=components_admin_drawer_36eff792._.js.map