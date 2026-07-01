export type { WorkspaceKpiPlacementRow, MetricKey, MetricFamily, ResolveKpisResult, KpiSurface } from "@/lib/kpi/types";
export {
    isKnownMetricKey,
    getMetricDefinition,
    validateMetricForSurface,
    listMetricDefinitions,
    metricFormatUnitLabel,
} from "@/lib/kpi/registry";
export { buildDefaultWorkspaceKpis, buildDefaultDepartmentKpis, buildDefaultWorkUnitKpis, type DeptWorkUnitRow } from "@/lib/kpi/baseline";
export { resolveKpisForWorkspace, resolveKpisForDepartment, resolveKpisForWorkUnit } from "@/lib/kpi/resolver";
export type { WorkspaceKpiContext, DepartmentKpiContext, WorkUnitKpiContext } from "@/lib/kpi/surfaceContext";
export { CONTEXT_DERIVED_METRIC_KEYS, isContextDerivedMetricKey } from "@/lib/kpi/contextReducerRegistry";
