/**
 * Department → brand color mapping for top-level department nodes.
 * Uses confirmed palette only.
 */

import { palette } from "@/styles/tokens/colors";

export type DepartmentKey =
  | "operations"
  | "sales"
  | "finance"
  | "customerSuccess"
  | "aiSystems";

const departmentToPaletteKey: Record<
  DepartmentKey,
  keyof typeof palette
> = {
  operations: "bendPine",
  sales: "alloyBlue",
  finance: "midnightForge",
  customerSuccess: "bendPine",
  aiSystems: "juniperEmber",
};

export function getDepartmentColor(key: DepartmentKey): string {
  return palette[departmentToPaletteKey[key]];
}

export function getDepartmentColorKey(key: DepartmentKey): keyof typeof palette {
  return departmentToPaletteKey[key];
}
