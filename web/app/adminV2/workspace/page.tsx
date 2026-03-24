"use client";

import { useMemo, useState, useCallback, useEffect, type CSSProperties } from "react";
import { neutral, derived, brand } from "@/styles/tokens/colors";
import { CompanyWorkspace, DepartmentWorkspace, WorkUnitWorkspace, RecordWorkspace } from "../components/workspace/shells";
import type { WorkspaceAction } from "@/lib/ui-v2/workspace-actions";
import { toCompanyWorkspaceModel } from "@/lib/ui-v2/adapters/company-adapter";
import { toDepartmentWorkspaceModel } from "@/lib/ui-v2/adapters/department-adapter";
import { toWorkUnitWorkspaceModel } from "@/lib/ui-v2/adapters/work-unit-adapter";
import { toRecordWorkspaceModel } from "@/lib/ui-v2/adapters/record-adapter";
import {
  DEMO_DEFAULT_INDUSTRY,
  DEMO_DEFAULT_LEVEL,
  DEMO_FLOW_DEFAULT_CONTEXT,
  DEMO_INDUSTRY_OPTIONS,
  DEMO_LEVEL_OPTIONS,
  resolveDemoWorkspaceSlices,
  type DemoIndustryId,
  type DemoSelectedContext,
  type DemoWorkspaceLevelId,
} from "@/lib/ui-v2/demo/industry-workspace-registry";

/**
 * UI V2 workspace system demo — config-driven blocks, drill-down state matches industry flow.
 */
export default function AdminV2WorkspaceDemoPage() {
  const [industry, setIndustry] = useState<DemoIndustryId>(DEMO_DEFAULT_INDUSTRY);
  const [level, setLevel] = useState<DemoWorkspaceLevelId>(DEMO_DEFAULT_LEVEL);
  const [selectedContext, setSelectedContext] = useState<DemoSelectedContext>({});

  useEffect(() => {
    setSelectedContext({});
    setLevel("company");
  }, [industry]);

  const onAction = useCallback((action: WorkspaceAction) => {
    console.info("[ui-v2 workspace action]", action);

    if (action.type === "company.open_department") {
      setSelectedContext((c) => ({ ...c, departmentKey: action.departmentKey }));
      setLevel("department");
      return;
    }

    if (action.type === "queue.item.action") {
      const wk = action.payload && typeof action.payload.workUnitKey === "string" ? action.payload.workUnitKey : undefined;
      if (action.itemId === "__view_all__" && wk) {
        setSelectedContext((c) => ({ ...c, workUnitKey: wk }));
        setLevel("work_unit");
        return;
      }
      if (action.actionId === "open_record") {
        setSelectedContext((c) => ({ ...c, recordId: action.itemId }));
        setLevel("record");
      }
    }
  }, []);

  const bundle = useMemo(
    () => resolveDemoWorkspaceSlices(industry, selectedContext),
    [industry, selectedContext]
  );

  const flowDefaults = DEMO_FLOW_DEFAULT_CONTEXT[industry];

  const companyModel = useMemo(
    () =>
      toCompanyWorkspaceModel({
        model: { ...bundle.company.modelBase },
        contextConfig: bundle.company.contextConfig,
        contextRaw: bundle.company.contextRaw,
      }),
    [bundle]
  );

  const departmentModel = useMemo(
    () =>
      toDepartmentWorkspaceModel({
        model: { ...bundle.department.modelBase },
        contextConfig: bundle.department.contextConfig,
        contextRaw: bundle.department.contextRaw,
        role: bundle.department.role,
      }),
    [bundle]
  );

  const workUnitModel = useMemo(
    () =>
      toWorkUnitWorkspaceModel({
        model: { ...bundle.work_unit.modelBase },
        contextConfig: bundle.work_unit.contextConfig,
        contextRaw: bundle.work_unit.contextRaw,
        role: bundle.work_unit.role,
      }),
    [bundle]
  );

  const recordModel = useMemo(
    () =>
      toRecordWorkspaceModel({
        model: { ...bundle.record.modelBase, contextRail: { groups: [] } },
        contextConfig: bundle.record.contextConfig,
        contextRaw: bundle.record.contextRaw,
        role: bundle.record.role,
      }),
    [bundle]
  );

  const selectStyle: CSSProperties = {
    padding: "6px 10px",
    borderRadius: 8,
    border: `1px solid ${derived.border}`,
    background: neutral.surface,
    color: brand.primary,
    fontWeight: 600,
    fontSize: 12,
    cursor: "pointer",
    minWidth: 160,
  };

  const ctxLine = [
    selectedContext.departmentKey ?? flowDefaults.departmentKey,
    selectedContext.workUnitKey ?? flowDefaults.workUnitKey,
    selectedContext.recordId ?? flowDefaults.recordId,
  ].join(" → ");

  return (
    <div className="flex flex-col min-h-0 flex-1 overflow-hidden">
      <div style={{ borderBottom: `1px solid ${derived.border}`, background: neutral.surface, padding: "8px 16px", flexShrink: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: brand.secondary, marginBottom: 8 }}>UI V2 workspace demo</div>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 600, color: brand.primary }}>
            Industry
            <select
              aria-label="Industry"
              value={industry}
              onChange={(e) => setIndustry(e.target.value as DemoIndustryId)}
              style={selectStyle}
            >
              {DEMO_INDUSTRY_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: brand.secondary }}>Level</span>
            {DEMO_LEVEL_OPTIONS.map((lv) => (
              <button
                key={lv.id}
                type="button"
                onClick={() => setLevel(lv.id)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 8,
                  border: `1px solid ${derived.border}`,
                  background: level === lv.id ? brand.primary : "transparent",
                  color: level === lv.id ? neutral.surface : brand.primary,
                  fontWeight: 600,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                {lv.label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ fontSize: 10, color: derived.textSecondary, marginTop: 6 }} title="Resolved drill keys (defaults when unset)">
          Drill context: {ctxLine}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden">
        {level === "company" && <CompanyWorkspace model={companyModel} onAction={onAction} />}
        {level === "department" && <DepartmentWorkspace model={departmentModel} onAction={onAction} />}
        {level === "work_unit" && <WorkUnitWorkspace model={workUnitModel} onAction={onAction} />}
        {level === "record" && <RecordWorkspace model={recordModel} onAction={onAction} />}
      </div>
    </div>
  );
}
