/** Industry axis for the UI V2 workspace demo (drives dataset + workspace models). */
export type DemoIndustryId = "home_services" | "childcare" | "insurance";

/** Workspace level axis (company → record drill-down). */
export type DemoWorkspaceLevelId = "company" | "department" | "work_unit" | "record";

export const DEMO_DEFAULT_INDUSTRY: DemoIndustryId = "home_services";
export const DEMO_DEFAULT_LEVEL: DemoWorkspaceLevelId = "company";

export const DEMO_INDUSTRY_OPTIONS: { id: DemoIndustryId; label: string }[] = [
  { id: "childcare", label: "Childcare" },
  { id: "insurance", label: "Insurance" },
  { id: "home_services", label: "Home Services" },
];

export const DEMO_LEVEL_OPTIONS: { id: DemoWorkspaceLevelId; label: string }[] = [
  { id: "company", label: "Company" },
  { id: "department", label: "Department" },
  { id: "work_unit", label: "Work Unit" },
  { id: "record", label: "Record" },
];
