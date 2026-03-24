import type { CompanyWorkspaceModel, DepartmentWorkspaceModel, RecordWorkspaceModel, WorkUnitWorkspaceModel } from "../workspace-types";
import type { ContextBlockConfig } from "../context-config";
import type { ContextRelationshipRawData } from "../adapters/context-adapter";
import {
  DEMO_CHILDCARE_CONTEXT_CONFIG,
  DEMO_CLEANING_CONTEXT_CONFIG,
  DEMO_COMPANY_CLEANING_CONTEXT_CONFIG,
  DEMO_INSURANCE_CONTEXT_CONFIG,
} from "./context-demo-config";
import { demoHomeServicesCompanyContextRaw, demoHomeServicesCompanyModelBase } from "./home_services/company";
import { demoHomeServicesDepartmentContextRaw, demoHomeServicesDepartmentModelBase } from "./home_services/department";
import { demoHomeServicesRecordBase, demoHomeServicesRecordContextRaw } from "./home_services/record";
import { demoHomeServicesWorkUnitBase } from "./home_services/work_unit";
import { demoChildcareCompanyContextRaw, demoChildcareCompanyModelBase } from "./childcare/company";
import { demoChildcareDepartmentContextRaw, demoChildcareDepartmentModelBase } from "./childcare/department";
import { demoChildcareRecordBase, demoChildcareRecordContextRaw } from "./childcare/record";
import { demoChildcareWorkUnitBase } from "./childcare/work_unit";
import { demoInsuranceCompanyContextRaw, demoInsuranceCompanyModelBase } from "./insurance/company";
import { demoInsuranceDepartmentContextRaw, demoInsuranceDepartmentModelBase } from "./insurance/department";
import { demoInsuranceRecordBase, demoInsuranceRecordContextRaw } from "./insurance/record";
import { demoInsuranceWorkUnitBase } from "./insurance/work_unit";
import type { DemoIndustryId } from "./workspace-demo-types";

/** Drill selection carried across company → department → work unit → record (demo host state). */
export type DemoSelectedContext = {
  departmentKey?: string;
  workUnitKey?: string;
  recordId?: string;
};

type CompanySlice = {
  modelBase: Omit<CompanyWorkspaceModel, "workspaceLevel" | "contextRail">;
  contextRaw: ContextRelationshipRawData;
  contextConfig: ContextBlockConfig;
};

type DepartmentSlice = {
  modelBase: Omit<DepartmentWorkspaceModel, "workspaceLevel" | "contextRail">;
  contextRaw: ContextRelationshipRawData;
  contextConfig: ContextBlockConfig;
  role?: string;
};

type WorkUnitSlice = {
  modelBase: Omit<WorkUnitWorkspaceModel, "workspaceLevel">;
  contextRaw: ContextRelationshipRawData;
  contextConfig: ContextBlockConfig;
  role?: string;
};

type RecordSlice = {
  modelBase: Omit<RecordWorkspaceModel, "workspaceLevel" | "contextRail">;
  contextRaw: ContextRelationshipRawData;
  contextConfig: ContextBlockConfig;
  role?: string;
};

export type IndustryWorkspaceDemoBundle = {
  company: CompanySlice;
  department: DepartmentSlice;
  work_unit: WorkUnitSlice;
  record: RecordSlice;
};

/** Default IDs/keys for each industry’s single happy-path drill (used when context is empty or partial). */
export const DEMO_FLOW_DEFAULT_CONTEXT: Record<
  DemoIndustryId,
  Required<Pick<DemoSelectedContext, "departmentKey" | "workUnitKey" | "recordId">>
> = {
  home_services: {
    departmentKey: "operations",
    workUnitKey: "unassigned_jobs_east",
    recordId: "job-7712",
  },
  insurance: {
    departmentKey: "revenue",
    workUnitKey: "expiring_policies",
    recordId: "policy-renewal-rivera",
  },
  childcare: {
    departmentKey: "team",
    workUnitKey: "rooms_out_of_ratio",
    recordId: "room-b-lakeside",
  },
};

const HOME_COMPANY: CompanySlice = {
  modelBase: demoHomeServicesCompanyModelBase,
  contextRaw: demoHomeServicesCompanyContextRaw,
  contextConfig: DEMO_COMPANY_CLEANING_CONTEXT_CONFIG,
};

const HOME_DEPARTMENT: DepartmentSlice = {
  modelBase: demoHomeServicesDepartmentModelBase,
  contextRaw: demoHomeServicesDepartmentContextRaw,
  contextConfig: DEMO_CLEANING_CONTEXT_CONFIG,
};

const HOME_WORK_UNITS: Record<string, WorkUnitSlice> = {
  unassigned_jobs_east: {
    modelBase: demoHomeServicesWorkUnitBase,
    contextRaw: demoHomeServicesDepartmentContextRaw,
    contextConfig: DEMO_CLEANING_CONTEXT_CONFIG,
  },
};

const HOME_RECORDS: Record<string, RecordSlice> = {
  "job-7712": {
    modelBase: demoHomeServicesRecordBase,
    contextRaw: { ...demoHomeServicesDepartmentContextRaw, ...demoHomeServicesRecordContextRaw },
    contextConfig: DEMO_CLEANING_CONTEXT_CONFIG,
  },
};

const CC_COMPANY: CompanySlice = {
  modelBase: demoChildcareCompanyModelBase,
  contextRaw: demoChildcareCompanyContextRaw,
  contextConfig: DEMO_COMPANY_CLEANING_CONTEXT_CONFIG,
};

const CC_DEPARTMENT: DepartmentSlice = {
  modelBase: demoChildcareDepartmentModelBase,
  contextRaw: demoChildcareDepartmentContextRaw,
  contextConfig: DEMO_CHILDCARE_CONTEXT_CONFIG,
  role: "director",
};

const CC_WORK_UNITS: Record<string, WorkUnitSlice> = {
  rooms_out_of_ratio: {
    modelBase: demoChildcareWorkUnitBase,
    contextRaw: demoChildcareDepartmentContextRaw,
    contextConfig: DEMO_CHILDCARE_CONTEXT_CONFIG,
    role: "director",
  },
};

const CC_RECORDS: Record<string, RecordSlice> = {
  "room-b-lakeside": {
    modelBase: demoChildcareRecordBase,
    contextRaw: { ...demoChildcareDepartmentContextRaw, ...demoChildcareRecordContextRaw },
    contextConfig: DEMO_CHILDCARE_CONTEXT_CONFIG,
    role: "director",
  },
};

const INS_COMPANY: CompanySlice = {
  modelBase: demoInsuranceCompanyModelBase,
  contextRaw: demoInsuranceCompanyContextRaw,
  contextConfig: DEMO_COMPANY_CLEANING_CONTEXT_CONFIG,
};

const INS_DEPARTMENT: DepartmentSlice = {
  modelBase: demoInsuranceDepartmentModelBase,
  contextRaw: demoInsuranceDepartmentContextRaw,
  contextConfig: DEMO_INSURANCE_CONTEXT_CONFIG,
};

const INS_WORK_UNITS: Record<string, WorkUnitSlice> = {
  expiring_policies: {
    modelBase: demoInsuranceWorkUnitBase,
    contextRaw: demoInsuranceDepartmentContextRaw,
    contextConfig: DEMO_INSURANCE_CONTEXT_CONFIG,
  },
};

const INS_RECORDS: Record<string, RecordSlice> = {
  "policy-renewal-rivera": {
    modelBase: demoInsuranceRecordBase,
    contextRaw: { ...demoInsuranceDepartmentContextRaw, ...demoInsuranceRecordContextRaw },
    contextConfig: DEMO_INSURANCE_CONTEXT_CONFIG,
  },
};

/**
 * Resolve adapter inputs for the current industry + drill context.
 * Unknown `workUnitKey` / `recordId` fall back to the industry’s default flow targets.
 */
export function resolveDemoWorkspaceSlices(
  industry: DemoIndustryId,
  context: DemoSelectedContext
): IndustryWorkspaceDemoBundle {
  const defaults = DEMO_FLOW_DEFAULT_CONTEXT[industry];
  const workUnitKey = context.workUnitKey ?? defaults.workUnitKey;
  const recordId = context.recordId ?? defaults.recordId;

  switch (industry) {
    case "home_services":
      return {
        company: HOME_COMPANY,
        department: HOME_DEPARTMENT,
        work_unit: HOME_WORK_UNITS[workUnitKey] ?? HOME_WORK_UNITS[defaults.workUnitKey],
        record: HOME_RECORDS[recordId] ?? HOME_RECORDS[defaults.recordId],
      };
    case "childcare":
      return {
        company: CC_COMPANY,
        department: CC_DEPARTMENT,
        work_unit: CC_WORK_UNITS[workUnitKey] ?? CC_WORK_UNITS[defaults.workUnitKey],
        record: CC_RECORDS[recordId] ?? CC_RECORDS[defaults.recordId],
      };
    case "insurance":
      return {
        company: INS_COMPANY,
        department: INS_DEPARTMENT,
        work_unit: INS_WORK_UNITS[workUnitKey] ?? INS_WORK_UNITS[defaults.workUnitKey],
        record: INS_RECORDS[recordId] ?? INS_RECORDS[defaults.recordId],
      };
    default: {
      const _x: never = industry;
      return _x;
    }
  }
}
