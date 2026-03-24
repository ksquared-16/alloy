import type { DepartmentWorkspaceModel } from "../../workspace-types";
import type { ContextRelationshipRawData } from "../../adapters/context-adapter";

/** Insurance — Revenue / Retention · renewals pipeline (drill → expiring policies work unit). */
export const demoInsuranceDepartmentModelBase: Omit<DepartmentWorkspaceModel, "workspaceLevel" | "contextRail"> = {
  departmentId: "dept-insurance-renewals",
  departmentLabel: "Revenue / Retention",
  aiSummary: {
    headline: "Renewals pipeline · expiring policies + binder gaps",
    aiAwarenessLine: "Live model — 14d window · retention touches · dec pages (3 binders blocking)",
    bodyParagraphs: [
      "The next two weeks concentrate coastal HO and a commercial auto block; carriers are responsive on admitted lines but E&S renewals are waiting on signed dec pages.",
      "Retention plays are staged for two SMB groups; premium timing and installment changes need producer confirmation before auto-chase resumes.",
      "UW is quiet in visible lanes today — exceptions are mostly document gaps on renewals, not new-business triage.",
    ],
    emphasisPhrases: ["14d window", "dec pages"],
  },
  signals: [
    {
      id: "sig-expiring",
      severity: "critical",
      title: "6 policies expiring < 7d",
      description: "Binder risk",
      aiExplanation: "Critical — bind paperwork or carrier bind confirmation missing.",
      actions: [{ id: "open_expiring_lane", label: "Open" }],
    },
    {
      id: "sig-retention",
      severity: "warning",
      title: "2 SMB groups · retention touch",
      aiExplanation: "Renew inside 14d; last touch > 10d ago.",
      actions: [{ id: "queue_retention", label: "Queue" }],
    },
    {
      id: "sig-premium",
      severity: "info",
      title: "3 installment changes pending",
      aiExplanation: "Agency bill timing — confirm with insured before bind.",
      actions: [{ id: "open_premium", label: "Review" }],
    },
  ],
  kpis: [
    { id: "ins-k1", label: "Renewals (30d)", value: "54", lane: "business" },
    { id: "ins-k2", label: "Retention rate", value: "91", unit: "%", lane: "business" },
    { id: "ins-k3", label: "Binders outstanding", value: "7", lane: "business" },
    {
      id: "ins-a1",
      label: "Renewal risk score",
      value: "84",
      unit: "%",
      lane: "ai",
      aiSummary: "Book-wide, 30d",
    },
    {
      id: "ins-a2",
      label: "Chase automation fit",
      value: "72",
      unit: "%",
      lane: "ai",
    },
    {
      id: "ins-a3",
      label: "Producer workload balance",
      value: "88",
      unit: "%",
      lane: "ai",
    },
  ],
  primaryQueue: {
    id: "q-renewals-pipeline",
    title: "Renewals pipeline",
    countBadge: 12,
    items: [],
    rollupSummary: "Renewal cohorts by time-to-expiry and binder status — drill into expiring policies.",
    rollupGroups: [
      {
        id: "ren-t-exp",
        label: "Expiring next 7 days",
        count: 6,
        descriptor: "Policies needing bind confirmation, dec page, or carrier invoice before expiry.",
      },
      {
        id: "ren-t-risk",
        label: "At risk · 30–60 days",
        count: 4,
        descriptor: "Retention outreach incomplete or carrier shopping still open mid-flight.",
      },
      {
        id: "ren-t-binder",
        label: "Binder outstanding",
        count: 2,
        descriptor: "Signed app or payment authorization missing before carrier will bind.",
      },
    ],
    rollupExamples: [{ id: "ren-ex1", label: "e.g. Rivera CAU renewal · dec page + payment auth" }],
    viewAllActionId: "open_renewals_work_unit",
    viewAllLabel: "Open expiring policies →",
    drillWorkUnitKey: "expiring_policies",
  },
  secondaryQueue: {
    id: "q-renewals-review",
    title: "Exceptions & documents",
    countBadge: 5,
    items: [],
    rollupSummary: "Non-standard renewal work — endorsements, audits, and coastal referrals.",
    rollupGroups: [
      {
        id: "ren-a-uw",
        label: "UW referrals on renewal",
        count: 1,
        descriptor: "Coastal wind, loss runs, or driver changes stuck in referral.",
      },
      {
        id: "ren-a-end",
        label: "Endorsements in flight",
        count: 2,
        descriptor: "Mid-term changes that must clear before renewal bind.",
      },
      {
        id: "ren-a-audit",
        label: "Audit / ACORD gaps",
        count: 2,
        descriptor: "SOV, class code, or signed application mismatches.",
      },
    ],
    viewAllActionId: "open_exceptions",
    viewAllLabel: "Open rollup →",
  },
  workSummary: {
    id: "ws-renewals-flows",
    title: "",
    progressLabel: "8 live · renewals + retention",
    workflowMetrics: {
      avgRunTimeLabel: "5m 10s",
      successRateLabel: "97.0%",
      runsTodayLabel: "156",
      failuresTodayLabel: "2",
    },
    workflowRuns: [
      {
        id: "rwr1",
        name: "Renewal chase — 14d cohort",
        status: "running",
        lastRunLabel: "09:48 · batch",
      },
      {
        id: "rwr2",
        name: "Binder reminder workflow",
        status: "completed",
        lastRunLabel: "09:12 · 3m 02s",
      },
      {
        id: "rwr3",
        name: "Retention playbook — SMB",
        status: "completed",
        lastRunLabel: "08:40 · 11m",
      },
    ],
    aiSuggestion:
      "Observation — auto-chase paused on litigation-flagged accounts; Rivera renewal is highest SLA risk in the 7d bucket.",
  },
  actionsRail: {
    primaries: [],
    systemStatusLines: [
      "Automation active: renewal chase (14d cohort)",
      "Queue load: elevated · Revenue / Retention",
    ],
    systemActions: [
      { id: "sys_create_renewal", label: "Create renewal task", variant: "primary" },
      { id: "sys_upload_document", label: "Ingest document", variant: "secondary" },
      { id: "sys_run_retention_report", label: "Execute retention report", variant: "secondary" },
      { id: "sys_trigger_chase", label: "Execute renewal chase workflow", variant: "secondary" },
    ],
    quickOperations: [
      { id: "open_expiring_lane", label: "Open", variant: "primary" },
      { id: "nudge_carriers", label: "Notify", variant: "secondary" },
      { id: "export_renewal_list", label: "Export renewal list", variant: "secondary" },
    ],
    smartSuggestions: [
      { id: "smart_chase_dec_pages", label: "Chase 3 missing dec pages" },
      { id: "smart_retention_smb", label: "Queue retention touch → SMB block" },
      { id: "smart_bind_rivera", label: "Prioritize Rivera CAU bind" },
    ],
  },
  latentWorkObjectQueues: [
    { id: "latent-ren-exp", title: "Expiring next 7 days", countBadge: 6, items: [] },
    { id: "latent-ren-pay", title: "Premium / installment issues", countBadge: 2, items: [] },
    { id: "latent-ren-carrier", title: "Carrier invoice pending", countBadge: 3, items: [] },
  ],
};

export const demoInsuranceDepartmentContextRaw: ContextRelationshipRawData = {
  carriers_on_file: [
    { id: "car1", name: "Coastal Mutual", status: "Admitted · HO focus" },
    { id: "car2", name: "Midwest General", status: "Commercial lines" },
    { id: "car3", name: "Acme Specialty", status: "E&S overflow" },
  ],
  pending_quotes: [
    { id: "pqx1", client: "Rivera Garages", carrier: "Midwest", sla: "Binder due 48h" },
    { id: "pqx2", client: "Summit Dental", carrier: "Acme", sla: "Quote open" },
  ],
};

/** @deprecated use demoInsuranceDepartmentContextRaw */
export const demoInsuranceContextRaw = demoInsuranceDepartmentContextRaw;
