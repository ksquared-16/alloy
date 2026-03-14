/**
 * Node type → color mapping for system map canvas.
 * All colors from design tokens (confirmed palette only); no hardcoded hex.
 * document and ai_action use confirmed palette keys (no Coastal Current / High Desert Sky).
 */

import { palette } from "@/styles/tokens/colors";

export type NodeType =
  | "customer"
  | "job"
  | "workflow"
  | "payment"
  | "document"
  | "ai_action";

const nodeTypeToPaletteKey: Record<NodeType, keyof typeof palette> = {
  customer: "alloyBlue",
  job: "bendPine",
  workflow: "juniperEmber",
  payment: "midnightForge",
  document: "bendPine",
  ai_action: "alloyBlue",
};

/**
 * Returns the fill color for a node type (for canvas nodes).
 */
export function getNodeColor(nodeType: NodeType): string {
  return palette[nodeTypeToPaletteKey[nodeType]];
}

/**
 * Returns the palette key for a node type (for Tailwind or CSS variables if needed).
 */
export function getNodeColorKey(nodeType: NodeType): keyof typeof palette {
  return nodeTypeToPaletteKey[nodeType];
}
