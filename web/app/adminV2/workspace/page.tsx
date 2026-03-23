"use client";

import { useMemo, useState, useCallback } from "react";
import { neutral, derived, brand } from "@/styles/tokens/colors";
import { CompanyWorkspace, DepartmentWorkspace, WorkUnitWorkspace, RecordWorkspace } from "../components/workspace/shells";
import type { WorkspaceAction } from "@/lib/ui-v2/workspace-actions";
import { toCompanyWorkspaceModel } from "@/lib/ui-v2/adapters/company-adapter";
import { toDepartmentWorkspaceModel } from "@/lib/ui-v2/adapters/department-adapter";
import { toWorkUnitWorkspaceModel } from "@/lib/ui-v2/adapters/work-unit-adapter";
import { toRecordWorkspaceModel } from "@/lib/ui-v2/adapters/record-adapter";
import {
  demoCleaningDepartmentModelBase,
  demoCleaningContextRaw,
  demoChildcareDepartmentModelBase,
  demoChildcareContextRaw,
  demoInsuranceDepartmentModelBase,
  demoInsuranceContextRaw,
} from "@/lib/ui-v2/demo/department-demos";
import {
  DEMO_CLEANING_CONTEXT_CONFIG,
  DEMO_CHILDCARE_CONTEXT_CONFIG,
  DEMO_INSURANCE_CONTEXT_CONFIG,
  DEMO_COMPANY_CLEANING_CONTEXT_CONFIG,
} from "@/lib/ui-v2/demo/context-demo-config";
import { demoCleaningCompanyModelBase, demoCleaningCompanyContextRaw } from "@/lib/ui-v2/demo/company-demos";
import { demoCleaningWorkUnitBase } from "@/lib/ui-v2/demo/work-unit-demo";
import { demoRecordBase, demoRecordContextRaw } from "@/lib/ui-v2/demo/record-demo";

type DemoTab = "company-cleaning" | "dept-cleaning" | "dept-childcare" | "dept-insurance" | "work-unit" | "record";

/**
 * UI V2 workspace system demo — config-driven blocks, no vertical logic in components.
 * Actions log to console until mapped to API routes / workflow events.
 */
export default function AdminV2WorkspaceDemoPage() {
  const [tab, setTab] = useState<DemoTab>("company-cleaning");

  const onAction = useCallback((action: WorkspaceAction) => {
    console.info("[ui-v2 workspace action]", action);
    if (action.type === "company.open_department") {
      // Demo: single department workspace — host maps keys to routes / tabs
      setTab("dept-cleaning");
    }
    if (action.type === "queue.item.action" && action.actionId === "open_record") {
      setTab("record");
    }
  }, []);

  const companyCleaning = useMemo(
    () =>
      toCompanyWorkspaceModel({
        model: { ...demoCleaningCompanyModelBase },
        contextConfig: DEMO_COMPANY_CLEANING_CONTEXT_CONFIG,
        contextRaw: demoCleaningCompanyContextRaw,
      }),
    []
  );

  const departmentCleaning = useMemo(
    () =>
      toDepartmentWorkspaceModel({
        model: { ...demoCleaningDepartmentModelBase },
        contextConfig: DEMO_CLEANING_CONTEXT_CONFIG,
        contextRaw: demoCleaningContextRaw,
      }),
    []
  );

  const departmentChildcare = useMemo(
    () =>
      toDepartmentWorkspaceModel({
        model: { ...demoChildcareDepartmentModelBase },
        contextConfig: DEMO_CHILDCARE_CONTEXT_CONFIG,
        contextRaw: demoChildcareContextRaw,
        role: "director",
      }),
    []
  );

  const departmentInsurance = useMemo(
    () =>
      toDepartmentWorkspaceModel({
        model: { ...demoInsuranceDepartmentModelBase },
        contextConfig: DEMO_INSURANCE_CONTEXT_CONFIG,
        contextRaw: demoInsuranceContextRaw,
      }),
    []
  );

  const workUnitCleaning = useMemo(
    () =>
      toWorkUnitWorkspaceModel({
        model: { ...demoCleaningWorkUnitBase },
        contextConfig: DEMO_CLEANING_CONTEXT_CONFIG,
        contextRaw: demoCleaningContextRaw,
      }),
    []
  );

  const recordDemo = useMemo(
    () =>
      toRecordWorkspaceModel({
        model: { ...demoRecordBase, contextRail: { groups: [] } },
        contextConfig: DEMO_CLEANING_CONTEXT_CONFIG,
        contextRaw: { ...demoCleaningContextRaw, ...demoRecordContextRaw },
      }),
    []
  );

  const tabs: { id: DemoTab; label: string }[] = [
    { id: "company-cleaning", label: "Company · Cleaning" },
    { id: "dept-cleaning", label: "Department · Cleaning" },
    { id: "dept-childcare", label: "Department · Childcare" },
    { id: "dept-insurance", label: "Department · Insurance broker" },
    { id: "work-unit", label: "Work unit · Unassigned jobs" },
    { id: "record", label: "Record · Chen job" },
  ];

  return (
    <div className="flex flex-col min-h-0 flex-1 overflow-hidden">
      <div style={{ borderBottom: `1px solid ${derived.border}`, background: neutral.surface, padding: "8px 16px", flexShrink: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: brand.secondary, marginBottom: 8 }}>UI V2 workspace demo</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                border: `1px solid ${derived.border}`,
                background: tab === t.id ? brand.primary : "transparent",
                color: tab === t.id ? neutral.surface : brand.primary,
                fontWeight: 600,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden">
        {tab === "company-cleaning" && <CompanyWorkspace model={companyCleaning} onAction={onAction} />}
        {tab === "dept-cleaning" && <DepartmentWorkspace model={departmentCleaning} onAction={onAction} />}
        {tab === "dept-childcare" && <DepartmentWorkspace model={departmentChildcare} onAction={onAction} />}
        {tab === "dept-insurance" && <DepartmentWorkspace model={departmentInsurance} onAction={onAction} />}
        {tab === "work-unit" && <WorkUnitWorkspace model={workUnitCleaning} onAction={onAction} />}
        {tab === "record" && <RecordWorkspace model={recordDemo} onAction={onAction} />}
      </div>
    </div>
  );
}
