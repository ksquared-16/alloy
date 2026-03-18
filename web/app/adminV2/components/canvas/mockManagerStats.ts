export type ManagerCardStats = {
  stat1Label: string;
  stat1Value: string;
  stat2Label: string;
  stat2Value: string;
};

export const MOCK_MANAGER_CARD_STATS: Record<string, ManagerCardStats> = {
  "mgr-ops-scheduling": {
    stat1Label: "Jobs scheduled today",
    stat1Value: "38",
    stat2Label: "Avg assignment time",
    stat2Value: "1.8m",
  },
  "mgr-ops-dispatch": {
    stat1Label: "Active dispatches",
    stat1Value: "12",
    stat2Label: "Completion health",
    stat2Value: "Strong",
  },
  "mgr-ops-completion": {
    stat1Label: "Jobs completed",
    stat1Value: "29",
    stat2Label: "Follow-up rate",
    stat2Value: "94%",
  },
  "mgr-sales-pipeline": {
    stat1Label: "Open leads",
    stat1Value: "12",
    stat2Label: "Stage velocity",
    stat2Value: "+8%",
  },
  "mgr-sales-followup": {
    stat1Label: "Follow-ups due",
    stat1Value: "6",
    stat2Label: "Response SLA",
    stat2Value: "96%",
  },
  "mgr-sales-conversion": {
    stat1Label: "Conversion (7d)",
    stat1Value: "24%",
    stat2Label: "Won deals",
    stat2Value: "4",
  },
  "mgr-fin-billing": {
    stat1Label: "Invoices sent",
    stat1Value: "14",
    stat2Label: "Auto-match rate",
    stat2Value: "99%",
  },
  "mgr-fin-collections": {
    stat1Label: "Exceptions open",
    stat1Value: "2",
    stat2Label: "Recovery rate",
    stat2Value: "88%",
  },
  "mgr-fin-reporting": {
    stat1Label: "Reports run",
    stat1Value: "8",
    stat2Label: "Accuracy",
    stat2Value: "100%",
  },
  "mgr-cs-support": {
    stat1Label: "Open tickets",
    stat1Value: "5",
    stat2Label: "First response",
    stat2Value: "12m",
  },
  "mgr-cs-success": {
    stat1Label: "Check-ins sent",
    stat1Value: "22",
    stat2Label: "NPS pulse",
    stat2Value: "72",
  },
  "mgr-cs-retention": {
    stat1Label: "At-risk accounts",
    stat1Value: "3",
    stat2Label: "Save rate",
    stat2Value: "67%",
  },
  "mgr-ai-ops": {
    stat1Label: "Runs (24h)",
    stat1Value: "412",
    stat2Label: "Latency p95",
    stat2Value: "840ms",
  },
  "mgr-ai-dispatch": {
    stat1Label: "Dispatch decisions",
    stat1Value: "156",
    stat2Label: "Override rate",
    stat2Value: "2%",
  },
  "mgr-ai-billing": {
    stat1Label: "Line items parsed",
    stat1Value: "2.1k",
    stat2Label: "Error rate",
    stat2Value: "0.1%",
  },
};

export function getManagerCardStats(managerId: string): ManagerCardStats {
  return (
    MOCK_MANAGER_CARD_STATS[managerId] ?? {
      stat1Label: "Throughput",
      stat1Value: "—",
      stat2Label: "Health",
      stat2Value: "OK",
    }
  );
}
