export type { WorkspaceKpiPlacementRow, MetricKey, MetricFamily, ResolveKpisResult, KpiSurface } from "@/lib/kpi/types";
export {
    isKnownMetricKey,
    getMetricDefinition,
    validateMetricForSurface,
    listMetricDefinitions,
    metricFormatUnitLabel,
} from "@/lib/kpi/registry";
export { buildDefaultWorkspaceKpis, buildDefaultDepartmentKpis, type DeptWorkUnitRow } from "@/lib/kpi/baseline";
export { resolveKpisForWorkspace, resolveKpisForDepartment } from "@/lib/kpi/resolver";
