/**
 * Company view: 3-over-2 grid — sized for clean gaps (no overlap when content fills min height).
 */
/** ~10% larger than prior 576×544; gaps nudged to keep clear separation */
/** Canonical grid / department–manager math (focus anchor, camera, activation). */
export const COMPANY_DEPT_NODE_WIDTH = 632;
export const COMPANY_DEPT_NODE_HEIGHT = 598;
/** Company overview only — ~7% smaller, centered in canonical cells. */
export const COMPANY_GRID_DEPT_WIDTH = 588;
export const COMPANY_GRID_DEPT_HEIGHT = 556;
export const COMPANY_GAP_X = 128;
export const COMPANY_GAP_Y = 100;
export const COMPANY_OFFSET_X = 52;
export const COMPANY_OFFSET_Y = 28;

function row1CenterX(): number {
  const W = COMPANY_DEPT_NODE_WIDTH;
  const GX = COMPANY_GAP_X;
  const row1Width = 3 * W + 2 * GX;
  return COMPANY_OFFSET_X + row1Width / 2;
}

function row2StartX(): number {
  const W = COMPANY_DEPT_NODE_WIDTH;
  const GX = COMPANY_GAP_X;
  const row2Width = 2 * W + GX;
  return row1CenterX() - row2Width / 2;
}

export function getDepartmentPosition(index: number): { x: number; y: number } {
  const W = COMPANY_DEPT_NODE_WIDTH;
  const H = COMPANY_DEPT_NODE_HEIGHT;
  const GX = COMPANY_GAP_X;
  const GY = COMPANY_GAP_Y;
  const y1 = COMPANY_OFFSET_Y;
  const y2 = COMPANY_OFFSET_Y + H + GY;

  switch (index) {
    case 0:
      return { x: COMPANY_OFFSET_X, y: y1 };
    case 1:
      return { x: COMPANY_OFFSET_X + W + GX, y: y1 };
    case 2:
      return { x: COMPANY_OFFSET_X + 2 * (W + GX), y: y1 };
    case 3:
      return { x: row2StartX(), y: y2 };
    case 4:
      return { x: row2StartX() + W + GX, y: y2 };
    default:
      return { x: COMPANY_OFFSET_X, y: y1 };
  }
}

/** Top-left for smaller company tiles, centered in each canonical slot. */
export function getCompanyDepartmentDisplayPosition(index: number): { x: number; y: number } {
  const p = getDepartmentPosition(index);
  const dx = (COMPANY_DEPT_NODE_WIDTH - COMPANY_GRID_DEPT_WIDTH) / 2;
  const dy = (COMPANY_DEPT_NODE_HEIGHT - COMPANY_GRID_DEPT_HEIGHT) / 2;
  return { x: p.x + dx, y: p.y + dy };
}

export function getCompanyGridCenter(): { x: number; y: number } {
  const W = COMPANY_DEPT_NODE_WIDTH;
  const H = COMPANY_DEPT_NODE_HEIGHT;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < 5; i++) {
    const p = getDepartmentPosition(i);
    sx += p.x + W / 2;
    sy += p.y + H / 2;
  }
  return { x: sx / 5, y: sy / 5 };
}

/** One large flow-space rect for full-field company ambient (excluded from fitView). */
const CHAMBER_AMBIENT_PAD = 3000;

export function getCompanyChamberAmbientRect(): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const Gw = COMPANY_GRID_DEPT_WIDTH;
  const Gh = COMPANY_GRID_DEPT_HEIGHT;
  for (let i = 0; i < 5; i++) {
    const p = getCompanyDepartmentDisplayPosition(i);
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x + Gw);
    maxY = Math.max(maxY, p.y + Gh);
  }
  const P = CHAMBER_AMBIENT_PAD;
  return {
    x: minX - P,
    y: minY - P,
    width: maxX - minX + 2 * P,
    height: maxY - minY + 2 * P,
  };
}

/** Second company ambient anchor — lower field / between row-2 cards */
export function getCompanyFieldAmbientB(): { x: number; y: number } {
  const W = COMPANY_DEPT_NODE_WIDTH;
  const H = COMPANY_DEPT_NODE_HEIGHT;
  const p3 = getDepartmentPosition(3);
  const p4 = getDepartmentPosition(4);
  return {
    x: (p3.x + W / 2 + p4.x + W / 2) / 2,
    y: p3.y + H * 0.58,
  };
}

/** Vertical midpoint between row centers — lateral ambient anchors */
export function getCompanyAmbientMidY(): number {
  const H = COMPANY_DEPT_NODE_HEIGHT;
  const GY = COMPANY_GAP_Y;
  const y1 = COMPANY_OFFSET_Y + H / 2;
  const y2 = COMPANY_OFFSET_Y + H + GY + H / 2;
  return (y1 + y2) / 2;
}

/** West / east of card grid — lateral ambient coverage */
export function getCompanyFieldAmbientWest(): { x: number; y: number } {
  return {
    x: COMPANY_OFFSET_X - 340,
    y: getCompanyAmbientMidY(),
  };
}

export function getCompanyFieldAmbientEast(): { x: number; y: number } {
  const W = COMPANY_DEPT_NODE_WIDTH;
  const GX = COMPANY_GAP_X;
  return {
    x: COMPANY_OFFSET_X + 3 * W + 2 * GX + 340,
    y: getCompanyAmbientMidY(),
  };
}

/** Upper band — spreads motion above row 1 */
export function getCompanyFieldAmbientTop(): { x: number; y: number } {
  const W = COMPANY_DEPT_NODE_WIDTH;
  const GX = COMPANY_GAP_X;
  const h = COMPANY_DEPT_NODE_HEIGHT;
  return {
    x: COMPANY_OFFSET_X + (3 * W + 2 * GX) / 2,
    y: COMPANY_OFFSET_Y + h * 0.1,
  };
}

/** Below row 2 — vertical coverage toward bottom of chamber */
export function getCompanyFieldAmbientSouth(): { x: number; y: number } {
  const W = COMPANY_DEPT_NODE_WIDTH;
  const H = COMPANY_DEPT_NODE_HEIGHT;
  const GY = COMPANY_GAP_Y;
  const p3 = getDepartmentPosition(3);
  const p4 = getDepartmentPosition(4);
  return {
    x: (p3.x + W / 2 + p4.x + W / 2) / 2,
    y: p3.y + H + GY + 100,
  };
}
