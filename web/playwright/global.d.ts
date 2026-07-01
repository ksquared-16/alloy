export {};

declare global {
  interface Window {
    __alloyReportBosDrawerGeometry?: (options?: { highlight?: boolean }) => {
      geometry?: unknown;
      recommendations?: unknown;
    };
    __alloyAuditDrawerPanel?: () => unknown;
    __alloyProbeDrawerWidth?: (probeWidthPx: number) => Promise<unknown>;
    __alloyRestoreDrawerGeometry?: () => unknown;
  }
}
