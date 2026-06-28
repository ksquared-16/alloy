import type {
    AffectedWorkItem,
    ChartBar,
    ChartSeries,
    ChartStackCategory,
    CohortRow,
    DrillDestination,
    FilterDimension,
    FunnelStage,
    NarrativeInsight,
    RankedItem,
    Recommendation,
    TableColumn,
    TableRow,
} from "./types";

/**
 * Slice 2 fixtures — diagnostic, affected-work, recommendation, command,
 * optimization-center, financial-report, chart, and filter data for the dev
 * Analytics preview. Presentation only; values are pre-resolved (no calculation).
 */

// ── Surface-aware filter contexts ────────────────────────────────────────────

export const EXECUTIVE_FILTERS: FilterDimension[] = [
    { kind: "date_range", label: "Period", value: "This quarter", options: ["This month", "This quarter", "YTD", "Trailing 12m"] },
    { kind: "comparison", label: "vs", value: "Prior quarter", options: ["Prior period", "Prior quarter", "Prior year"] },
    { kind: "location", label: "Location", value: "All locations", options: ["All locations", "Maple St", "Lakeside", "Downtown", "Riverside"] },
];

export const ENROLLMENT_FILTERS: FilterDimension[] = [
    { kind: "date_range", label: "Period", value: "Last 30 days", options: ["Last 7 days", "Last 30 days", "This quarter"] },
    { kind: "location", label: "Location", value: "All locations", options: ["All locations", "Maple St", "Lakeside", "Downtown", "Riverside"] },
    { kind: "program", label: "Program", value: "All programs", options: ["All programs", "Infant", "Toddler", "Preschool", "Pre-K"] },
    { kind: "stage", label: "Stage", value: "All stages", options: ["All stages", "New inquiry", "Contacted", "Tour booked", "Tour done", "Enrolled"] },
    { kind: "source", label: "Source", value: "All sources", options: ["All sources", "Referral", "Web", "Walk-in", "Paid"] },
];

export const FINANCIAL_FILTERS: FilterDimension[] = [
    { kind: "date_range", label: "Period", value: "June 2026", options: ["June 2026", "Q2 2026", "YTD 2026"] },
    { kind: "location", label: "Location", value: "All locations", options: ["All locations", "Maple St", "Lakeside", "Downtown", "Riverside"] },
    { kind: "account", label: "Account", value: "All accounts", options: ["All accounts", "Tuition", "Fees", "Subsidy"] },
    { kind: "aging_bucket", label: "Aging", value: "All buckets", options: ["All buckets", "Current", "1–30 d", "31–60 d", "60+ d"] },
];

export const OPTIMIZATION_FILTERS: FilterDimension[] = [
    { kind: "location", label: "Location", value: "Downtown", options: ["Maple St", "Lakeside", "Downtown", "Riverside"] },
    { kind: "date_range", label: "Day", value: "Today", options: ["Today", "Tomorrow", "This week"] },
    { kind: "room", label: "Room", value: "All rooms", options: ["All rooms", "Infant A", "Toddler B", "Preschool C"] },
    { kind: "staff", label: "Staff", value: "All staff", options: ["All staff", "Floaters only"] },
];

// ── Executive summary — narrative insights (not tiles) ───────────────────────

export const EXECUTIVE_NARRATIVE: NarrativeInsight[] = [
    {
        id: "narr-conversion",
        eyebrow: "Conversion",
        headline: "Tour conversion fell to 38% this quarter, 7 points below target, concentrated at Downtown and Riverside.",
        value: "38%",
        movement: "▼ 7 pts vs target",
        tone: "warning",
        drill: { kind: "report_detail", label: "Why did conversion drop?", target: "diagnostic/tour-conversion", scope: "This quarter" },
    },
    {
        id: "narr-capacity",
        eyebrow: "Capacity",
        headline: "Infant rooms are effectively full (98%) while Preschool sits at 62% — demand is mismatched to capacity.",
        value: "87%",
        movement: "blended fill",
        tone: "healthy",
        drill: { kind: "business_process", label: "Open Enrollment process", target: "process/enrollment", scope: "All programs" },
    },
    {
        id: "narr-ar",
        eyebrow: "Cash",
        headline: "Receivables aged 60+ days grew 16.7% — $6.2k now at collection risk across 9 accounts.",
        value: "$84k",
        movement: "▲ 16.7%",
        tone: "critical",
        drill: { kind: "queue", label: "Open 60+ day accounts", target: "queue/ar-60plus", scope: "60+ d" },
    },
];

// ── Diagnostic: tour conversion drop by site (stacked) + affected families ───

export const CONVERSION_BY_SITE_STACK: ChartStackCategory[] = [
    {
        label: "Maple St",
        segments: [
            { key: "converted", label: "Converted", value: 22, formatted: "22", tone: "healthy", drill: { kind: "queue", label: "Maple converted tours", target: "queue/tours-converted", scope: "Maple St" } },
            { key: "lost", label: "Not converted", value: 8, formatted: "8", tone: "neutral", drill: { kind: "queue", label: "Maple lost tours", target: "queue/tours-lost", scope: "Maple St" } },
        ],
    },
    {
        label: "Lakeside",
        segments: [
            { key: "converted", label: "Converted", value: 18, formatted: "18", tone: "healthy", drill: { kind: "queue", label: "Lakeside converted tours", target: "queue/tours-converted", scope: "Lakeside" } },
            { key: "lost", label: "Not converted", value: 9, formatted: "9", tone: "neutral", drill: { kind: "queue", label: "Lakeside lost tours", target: "queue/tours-lost", scope: "Lakeside" } },
        ],
    },
    {
        label: "Downtown",
        segments: [
            { key: "converted", label: "Converted", value: 11, formatted: "11", tone: "warning", drill: { kind: "queue", label: "Downtown converted tours", target: "queue/tours-converted", scope: "Downtown" } },
            { key: "lost", label: "Not converted", value: 21, formatted: "21", tone: "critical", drill: { kind: "records", label: "Downtown lost tours (21)", target: "records/tours-lost", scope: "Downtown" } },
        ],
    },
    {
        label: "Riverside",
        segments: [
            { key: "converted", label: "Converted", value: 13, formatted: "13", tone: "warning", drill: { kind: "queue", label: "Riverside converted tours", target: "queue/tours-converted", scope: "Riverside" } },
            { key: "lost", label: "Not converted", value: 17, formatted: "17", tone: "critical", drill: { kind: "records", label: "Riverside lost tours (17)", target: "records/tours-lost", scope: "Riverside" } },
        ],
    },
];

/** Affected families keyed by site (populated when a diagnostic mark is selected). */
export const FAMILIES_STUCK_BY_SITE: Record<string, AffectedWorkItem[]> = {
    Downtown: [
        { id: "f-1", title: "Okafor family", detail: "Tour done 9d ago · no follow-up", badge: "Stalled", tone: "critical", drill: { kind: "drawer", label: "Open Okafor family", target: "person/okafor", scope: "Downtown" } },
        { id: "f-2", title: "Reyes family", detail: "Tour done 6d ago · awaiting decision", badge: "At risk", tone: "warning", drill: { kind: "drawer", label: "Open Reyes family", target: "person/reyes", scope: "Downtown" } },
        { id: "f-3", title: "Bianchi family", detail: "Tour done 11d ago · no follow-up", badge: "Stalled", tone: "critical", drill: { kind: "drawer", label: "Open Bianchi family", target: "person/bianchi", scope: "Downtown" } },
    ],
    Riverside: [
        { id: "f-4", title: "Nguyen family", detail: "Tour done 7d ago · pricing question open", badge: "At risk", tone: "warning", drill: { kind: "drawer", label: "Open Nguyen family", target: "person/nguyen", scope: "Riverside" } },
        { id: "f-5", title: "Carter family", detail: "Tour done 12d ago · no follow-up", badge: "Stalled", tone: "critical", drill: { kind: "drawer", label: "Open Carter family", target: "person/carter", scope: "Riverside" } },
    ],
    "Maple St": [
        { id: "f-6", title: "Alvarez family", detail: "Tour done 3d ago · follow-up scheduled", badge: "On track", tone: "healthy", drill: { kind: "drawer", label: "Open Alvarez family", target: "person/alvarez", scope: "Maple St" } },
    ],
    Lakeside: [
        { id: "f-7", title: "Park family", detail: "Tour done 4d ago · awaiting paperwork", badge: "On track", tone: "healthy", drill: { kind: "drawer", label: "Open Park family", target: "person/park", scope: "Lakeside" } },
    ],
};

export const CONVERSION_RECOMMENDATIONS: Recommendation[] = [
    {
        id: "rec-followup",
        title: "Launch 48-hour tour follow-up workflow at Downtown & Riverside",
        rationale: "62% of lost tours had no follow-up within 48h. A structured follow-up recovers a portion of stalled families.",
        projectedImpact: "+6 conversions / mo",
        tone: "healthy",
        action: { kind: "workflow", label: "Start follow-up workflow", target: "workflow/tour-followup", scope: "Downtown · Riverside" },
    },
    {
        id: "rec-assign",
        title: "Assign a dedicated enrollment owner to Downtown",
        rationale: "Downtown has the highest tour volume but lowest conversion; response time is 6.1h vs 1.4h at Maple St.",
        projectedImpact: "−4.7h response",
        tone: "warning",
        action: { kind: "work_unit", label: "Open Downtown enrollment unit", target: "work-unit/downtown-enrollment", scope: "Downtown" },
    },
];

export const CONVERSION_COMMANDS: DrillDestination[] = [
    { kind: "queue", label: "Open stalled-tour queue", target: "queue/tours-stalled", scope: "Downtown · Riverside" },
    { kind: "workflow", label: "Start follow-up workflow", target: "workflow/tour-followup" },
    { kind: "report_detail", label: "Open conversion report", target: "report/conversion" },
    { kind: "optimization_center", label: "Open Enrollment optimization", target: "optimize/enrollment" },
];

// ── Operational command center ───────────────────────────────────────────────

export const COMMAND_CENTER_QUEUES: RankedItem[] = [
    { label: "Overdue work", value: 14, formatted: "14", tone: "critical", drill: { kind: "queue", label: "Open overdue queue", target: "queue/overdue", scope: "Org · Today" } },
    { label: "Tours unconfirmed", value: 9, formatted: "9", tone: "warning", drill: { kind: "queue", label: "Open unconfirmed tours", target: "queue/tours-unconfirmed" } },
    { label: "Leads no contact 48h", value: 8, formatted: "8", tone: "warning", drill: { kind: "queue", label: "Open stale leads", target: "queue/leads-stale" } },
    { label: "Invoices past due", value: 9, formatted: "9", tone: "critical", drill: { kind: "queue", label: "Open past-due invoices", target: "queue/invoices-pastdue" } },
    { label: "Forms incomplete", value: 5, formatted: "5", tone: "neutral", drill: { kind: "queue", label: "Open incomplete forms", target: "queue/forms-incomplete" } },
];

export const COMMAND_CENTER_AFFECTED: AffectedWorkItem[] = [
    { id: "c-1", title: "Riverside · ratio breach 2:17", detail: "Toddler B · 1 staff short", badge: "Compliance", tone: "critical", drill: { kind: "optimization_center", label: "Open ratio optimization", target: "optimize/ratio", scope: "Riverside" } },
    { id: "c-2", title: "12 invoices > 30 days", detail: "$11.4k across 9 accounts", badge: "$11.4k", tone: "critical", drill: { kind: "workflow", label: "Start collections", target: "workflow/collections" } },
    { id: "c-3", title: "3 tours unconfirmed < 24h", detail: "Downtown · today", badge: "Today", tone: "warning", drill: { kind: "queue", label: "Confirm tours", target: "queue/tours-unconfirmed", scope: "Downtown" } },
];

export const COMMAND_CENTER_COMMANDS: DrillDestination[] = [
    { kind: "queue", label: "Resolve overdue work", target: "queue/overdue" },
    { kind: "workflow", label: "Start collections workflow", target: "workflow/collections" },
    { kind: "optimization_center", label: "Open ratio optimization", target: "optimize/ratio" },
    { kind: "work_unit", label: "Open Downtown unit", target: "work-unit/downtown" },
];

// ── Ratio / Labor Optimization Center ────────────────────────────────────────

export const RATIO_CURRENT_STATE: { label: string; value: string; tone?: "healthy" | "warning" | "critical" | "neutral" }[] = [
    { label: "Rooms in breach", value: "2 of 9", tone: "critical" },
    { label: "Staff on shift", value: "11", tone: "neutral" },
    { label: "Children present", value: "96", tone: "neutral" },
    { label: "Worst ratio", value: "1:9 (max 1:8)", tone: "critical" },
];

export const RATIO_AFFECTED_ROOMS: AffectedWorkItem[] = [
    { id: "r-1", title: "Toddler B", detail: "17 children · 2 staff", badge: "1:9 (max 1:8)", tone: "critical", drill: { kind: "drawer", label: "Open Toddler B", target: "room/toddler-b", scope: "Downtown" } },
    { id: "r-2", title: "Infant A", detail: "8 children · 2 staff", badge: "1:4 (max 1:4)", tone: "warning", drill: { kind: "drawer", label: "Open Infant A", target: "room/infant-a", scope: "Downtown" } },
    { id: "r-3", title: "Preschool C", detail: "20 children · 2 staff", badge: "1:10 (max 1:12)", tone: "healthy", drill: { kind: "drawer", label: "Open Preschool C", target: "room/preschool-c", scope: "Downtown" } },
];

export const RATIO_RECOMMENDATIONS: Recommendation[] = [
    {
        id: "opt-move",
        title: "Move 1 floater from Preschool C → Toddler B",
        rationale: "Preschool C is under max (1:10 of 1:12). Reassigning one floater resolves the Toddler B breach immediately.",
        projectedImpact: "Toddler B → 1:6 ✓",
        tone: "healthy",
        action: { kind: "workflow", label: "Apply staff move", target: "workflow/reassign-staff", scope: "Downtown" },
    },
    {
        id: "opt-call",
        title: "Call in 1 on-call staff for 3:00–6:00 pickup window",
        rationale: "Afternoon pickup overlaps with a projected second breach in Infant A as ratios tighten.",
        projectedImpact: "Prevents 2nd breach",
        tone: "warning",
        action: { kind: "workflow", label: "Request on-call staff", target: "workflow/oncall", scope: "Downtown" },
    },
];

/** Projected ratio after applying the recommended move (simulation). */
export const RATIO_SIMULATION: ChartBar[] = [
    { label: "Toddler B", value: 6, formatted: "1:6", tone: "healthy", drill: { kind: "drawer", label: "Open Toddler B", target: "room/toddler-b" } },
    { label: "Infant A", value: 4, formatted: "1:4", tone: "warning", drill: { kind: "drawer", label: "Open Infant A", target: "room/infant-a" } },
    { label: "Preschool C", value: 11, formatted: "1:11", tone: "healthy", drill: { kind: "drawer", label: "Open Preschool C", target: "room/preschool-c" } },
];

// ── Financial report / output surface ────────────────────────────────────────

export const MONTHLY_SUMMARY_COLUMNS: TableColumn[] = [
    { key: "metric", label: "Metric" },
    { key: "month", label: "June", align: "right" },
    { key: "prior", label: "May", align: "right" },
    { key: "delta", label: "Δ", align: "right" },
];

export const MONTHLY_SUMMARY_ROWS: TableRow[] = [
    { id: "rev", cells: { metric: "Revenue", month: "$418k", prior: "$405k", delta: "+3.2%" }, tone: "healthy", drill: { kind: "report_detail", label: "Open revenue detail", target: "report/revenue" } },
    { id: "tuition", cells: { metric: "Tuition collected", month: "$392k", prior: "$388k", delta: "+1.0%" }, tone: "healthy", drill: { kind: "report_detail", label: "Open tuition detail", target: "report/tuition" } },
    { id: "ar", cells: { metric: "Receivables", month: "$84k", prior: "$72k", delta: "+16.7%" }, tone: "critical", drill: { kind: "queue", label: "Open AR queue", target: "queue/ar" } },
    { id: "margin", cells: { metric: "Net margin", month: "19%", prior: "18%", delta: "+1 pt" }, tone: "healthy", drill: { kind: "report_detail", label: "Open margin detail", target: "report/margin" } },
];

export const REVENUE_BY_SITE_TABLE: TableRow[] = [
    { id: "maple", cells: { metric: "Maple St", month: "$386k", prior: "$372k", delta: "+3.8%" }, tone: "healthy", drill: { kind: "report_detail", label: "Maple St revenue", target: "report/site/maple" } },
    { id: "lakeside", cells: { metric: "Lakeside", month: "$341k", prior: "$338k", delta: "+0.9%" }, tone: "healthy", drill: { kind: "report_detail", label: "Lakeside revenue", target: "report/site/lakeside" } },
    { id: "downtown", cells: { metric: "Downtown", month: "$298k", prior: "$305k", delta: "−2.3%" }, tone: "warning", drill: { kind: "report_detail", label: "Downtown revenue", target: "report/site/downtown" } },
    { id: "riverside", cells: { metric: "Riverside", month: "$215k", prior: "$210k", delta: "+2.4%" }, tone: "healthy", drill: { kind: "report_detail", label: "Riverside revenue", target: "report/site/riverside" } },
];

export const AR_AGING_BARS: ChartBar[] = [
    { label: "Current", value: 46, formatted: "$46k", tone: "healthy", drill: { kind: "report_detail", label: "Current receivables", target: "report/ar/current" } },
    { label: "1–30 d", value: 20, formatted: "$20k", tone: "healthy", drill: { kind: "report_detail", label: "1–30 day receivables", target: "report/ar/1-30" } },
    { label: "31–60 d", value: 12, formatted: "$12k", tone: "warning", drill: { kind: "queue", label: "31–60 day accounts", target: "queue/ar-31-60" } },
    { label: "60+ d", value: 6.2, formatted: "$6.2k", tone: "critical", drill: { kind: "queue", label: "60+ day accounts", target: "queue/ar-60plus" } },
];

// ── Chart gallery data (x/y, stacked, funnel, cohort, line, ranked) ──────────

export const REVENUE_LINE: ChartSeries[] = [
    {
        id: "revenue",
        label: "Revenue ($k)",
        tone: "healthy",
        points: [
            { x: "Jan", y: 360, formatted: "$360k", drill: { kind: "report_detail", label: "January detail", target: "report/period/jan" } },
            { x: "Feb", y: 372, formatted: "$372k", drill: { kind: "report_detail", label: "February detail", target: "report/period/feb" } },
            { x: "Mar", y: 388, formatted: "$388k", drill: { kind: "report_detail", label: "March detail", target: "report/period/mar" } },
            { x: "Apr", y: 392, formatted: "$392k", drill: { kind: "report_detail", label: "April detail", target: "report/period/apr" } },
            { x: "May", y: 405, formatted: "$405k", drill: { kind: "report_detail", label: "May detail", target: "report/period/may" } },
            { x: "Jun", y: 418, formatted: "$418k", drill: { kind: "report_detail", label: "June detail", target: "report/period/jun" } },
        ],
    },
];

export const RESPONSE_TIME_BARS: ChartBar[] = [
    { label: "Maple St", value: 1.4, formatted: "1.4h", tone: "healthy", drill: { kind: "queue", label: "Maple lead queue", target: "queue/leads", scope: "Maple St" } },
    { label: "Lakeside", value: 1.9, formatted: "1.9h", tone: "healthy", drill: { kind: "queue", label: "Lakeside lead queue", target: "queue/leads", scope: "Lakeside" } },
    { label: "Riverside", value: 4.8, formatted: "4.8h", tone: "warning", drill: { kind: "queue", label: "Riverside lead queue", target: "queue/leads", scope: "Riverside" } },
    { label: "Downtown", value: 6.1, formatted: "6.1h", tone: "critical", drill: { kind: "queue", label: "Downtown lead queue", target: "queue/leads", scope: "Downtown" } },
];

export const ENROLLMENT_FUNNEL: FunnelStage[] = [
    { label: "New inquiry", value: 248, formatted: "248", conversion: "—", tone: "neutral", drill: { kind: "queue", label: "Open inquiry queue", target: "queue/stage/inquiry" } },
    { label: "Contacted", value: 196, formatted: "196", conversion: "79%", tone: "neutral", drill: { kind: "queue", label: "Open contacted queue", target: "queue/stage/contacted" } },
    { label: "Tour booked", value: 134, formatted: "134", conversion: "68%", tone: "warning", drill: { kind: "queue", label: "Open tour-booked queue", target: "queue/stage/tour-booked" } },
    { label: "Tour done", value: 104, formatted: "104", conversion: "78%", tone: "warning", drill: { kind: "queue", label: "Open tour-done queue", target: "queue/stage/tour-done" } },
    { label: "Enrolled", value: 40, formatted: "40", conversion: "38%", tone: "healthy", drill: { kind: "business_process", label: "Open enrolled families", target: "process/enrolled" } },
];

export const RETENTION_COHORT_COLUMNS = ["M0", "M1", "M2", "M3", "M4", "M5"];

export const RETENTION_COHORT_ROWS: CohortRow[] = [
    { label: "Jan", cells: [
        { intensity: 1.0, formatted: "100%", tone: "healthy", drill: { kind: "records", label: "Jan cohort M0", target: "cohort/jan/0" } },
        { intensity: 0.94, formatted: "94%", tone: "healthy", drill: { kind: "records", label: "Jan cohort M1", target: "cohort/jan/1" } },
        { intensity: 0.9, formatted: "90%", tone: "healthy", drill: { kind: "records", label: "Jan cohort M2", target: "cohort/jan/2" } },
        { intensity: 0.86, formatted: "86%", tone: "warning", drill: { kind: "records", label: "Jan cohort M3", target: "cohort/jan/3" } },
        { intensity: 0.82, formatted: "82%", tone: "warning", drill: { kind: "records", label: "Jan cohort M4", target: "cohort/jan/4" } },
        { intensity: 0.8, formatted: "80%", tone: "warning", drill: { kind: "records", label: "Jan cohort M5", target: "cohort/jan/5" } },
    ] },
    { label: "Feb", cells: [
        { intensity: 1.0, formatted: "100%", tone: "healthy", drill: { kind: "records", label: "Feb cohort M0", target: "cohort/feb/0" } },
        { intensity: 0.92, formatted: "92%", tone: "healthy", drill: { kind: "records", label: "Feb cohort M1", target: "cohort/feb/1" } },
        { intensity: 0.85, formatted: "85%", tone: "warning", drill: { kind: "records", label: "Feb cohort M2", target: "cohort/feb/2" } },
        { intensity: 0.78, formatted: "78%", tone: "warning", drill: { kind: "records", label: "Feb cohort M3", target: "cohort/feb/3" } },
        { intensity: 0.7, formatted: "70%", tone: "critical", drill: { kind: "records", label: "Feb cohort M4", target: "cohort/feb/4" } },
    ] },
    { label: "Mar", cells: [
        { intensity: 1.0, formatted: "100%", tone: "healthy", drill: { kind: "records", label: "Mar cohort M0", target: "cohort/mar/0" } },
        { intensity: 0.95, formatted: "95%", tone: "healthy", drill: { kind: "records", label: "Mar cohort M1", target: "cohort/mar/1" } },
        { intensity: 0.9, formatted: "90%", tone: "healthy", drill: { kind: "records", label: "Mar cohort M2", target: "cohort/mar/2" } },
        { intensity: 0.88, formatted: "88%", tone: "healthy", drill: { kind: "records", label: "Mar cohort M3", target: "cohort/mar/3" } },
    ] },
];

export const STAFFING_GROUPED: ChartStackCategory[] = [
    { label: "Maple St", segments: [
        { key: "required", label: "Required", value: 8, formatted: "8", tone: "neutral", drill: { kind: "drawer", label: "Maple required staffing", target: "labor/maple/required" } },
        { key: "scheduled", label: "Scheduled", value: 9, formatted: "9", tone: "healthy", drill: { kind: "drawer", label: "Maple scheduled staffing", target: "labor/maple/scheduled" } },
    ] },
    { label: "Lakeside", segments: [
        { key: "required", label: "Required", value: 7, formatted: "7", tone: "neutral", drill: { kind: "drawer", label: "Lakeside required staffing", target: "labor/lakeside/required" } },
        { key: "scheduled", label: "Scheduled", value: 7, formatted: "7", tone: "healthy", drill: { kind: "drawer", label: "Lakeside scheduled staffing", target: "labor/lakeside/scheduled" } },
    ] },
    { label: "Downtown", segments: [
        { key: "required", label: "Required", value: 12, formatted: "12", tone: "neutral", drill: { kind: "drawer", label: "Downtown required staffing", target: "labor/downtown/required" } },
        { key: "scheduled", label: "Scheduled", value: 10, formatted: "10", tone: "critical", drill: { kind: "optimization_center", label: "Fix Downtown staffing gap", target: "optimize/labor", scope: "Downtown" } },
    ] },
    { label: "Riverside", segments: [
        { key: "required", label: "Required", value: 9, formatted: "9", tone: "neutral", drill: { kind: "drawer", label: "Riverside required staffing", target: "labor/riverside/required" } },
        { key: "scheduled", label: "Scheduled", value: 8, formatted: "8", tone: "warning", drill: { kind: "optimization_center", label: "Fix Riverside staffing gap", target: "optimize/labor", scope: "Riverside" } },
    ] },
];

export const REVENUE_CONTRIBUTION_STACK: ChartStackCategory[] = [
    { label: "Maple St", segments: [
        { key: "tuition", label: "Tuition", value: 340, formatted: "$340k", tone: "healthy", drill: { kind: "report_detail", label: "Maple tuition", target: "report/maple/tuition" } },
        { key: "fees", label: "Fees", value: 46, formatted: "$46k", tone: "neutral", drill: { kind: "report_detail", label: "Maple fees", target: "report/maple/fees" } },
    ] },
    { label: "Lakeside", segments: [
        { key: "tuition", label: "Tuition", value: 300, formatted: "$300k", tone: "healthy", drill: { kind: "report_detail", label: "Lakeside tuition", target: "report/lakeside/tuition" } },
        { key: "fees", label: "Fees", value: 41, formatted: "$41k", tone: "neutral", drill: { kind: "report_detail", label: "Lakeside fees", target: "report/lakeside/fees" } },
    ] },
    { label: "Downtown", segments: [
        { key: "tuition", label: "Tuition", value: 268, formatted: "$268k", tone: "warning", drill: { kind: "report_detail", label: "Downtown tuition", target: "report/downtown/tuition" } },
        { key: "fees", label: "Fees", value: 30, formatted: "$30k", tone: "neutral", drill: { kind: "report_detail", label: "Downtown fees", target: "report/downtown/fees" } },
    ] },
];
