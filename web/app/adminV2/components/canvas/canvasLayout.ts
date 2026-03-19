/**
 * Company view: 3-over-2 grid — sized for clean gaps.
 * Responsive: layout scales by viewport width (large desktop, laptop, smaller).
 */
export const BREAKPOINT_LAPTOP = 1680;
export const BREAKPOINT_SMALL = 1280;

/** Scale factors for tile/gap sizing (large = 1). Laptop uses 0.96 so company view feels larger without browser zoom. */
const SCALE_LARGE = 1;
const SCALE_LAPTOP = 0.96;
const SCALE_SMALL = 0.82;

export type CompanyLayout = {
  COMPANY_DEPT_NODE_WIDTH: number;
  COMPANY_DEPT_NODE_HEIGHT: number;
  COMPANY_GRID_DEPT_WIDTH: number;
  COMPANY_GRID_DEPT_HEIGHT: number;
  COMPANY_GAP_X: number;
  COMPANY_GAP_Y: number;
  COMPANY_OFFSET_X: number;
  COMPANY_OFFSET_Y: number;
  CARD_PAD: number;
  fitViewPadding: number;
  actionPanelWidth: number;
};

const BASE = {
  COMPANY_DEPT_NODE_WIDTH: 632,
  COMPANY_DEPT_NODE_HEIGHT: 380,
  COMPANY_GRID_DEPT_WIDTH: 588,
  COMPANY_GRID_DEPT_HEIGHT: 348,
  COMPANY_GAP_X: 128,
  COMPANY_GAP_Y: 72,
  COMPANY_OFFSET_X: 52,
  COMPANY_OFFSET_Y: 22,
  CARD_PAD: 18,
  fitViewPadding: 0.068,
  actionPanelWidth: 360,
};

export function getResponsiveLayout(viewportWidth: number): CompanyLayout {
  const scale =
    viewportWidth >= BREAKPOINT_LAPTOP
      ? SCALE_LARGE
      : viewportWidth >= BREAKPOINT_SMALL
        ? SCALE_LAPTOP
        : SCALE_SMALL;
  return {
    COMPANY_DEPT_NODE_WIDTH: Math.round(BASE.COMPANY_DEPT_NODE_WIDTH * scale),
    COMPANY_DEPT_NODE_HEIGHT: Math.round(BASE.COMPANY_DEPT_NODE_HEIGHT * scale),
    COMPANY_GRID_DEPT_WIDTH: Math.round(BASE.COMPANY_GRID_DEPT_WIDTH * scale),
    COMPANY_GRID_DEPT_HEIGHT: Math.round(BASE.COMPANY_GRID_DEPT_HEIGHT * scale),
    COMPANY_GAP_X: Math.round(BASE.COMPANY_GAP_X * scale),
    COMPANY_GAP_Y: Math.round(BASE.COMPANY_GAP_Y * scale),
    COMPANY_OFFSET_X: Math.round(BASE.COMPANY_OFFSET_X * scale),
    COMPANY_OFFSET_Y: Math.round(BASE.COMPANY_OFFSET_Y * scale),
    CARD_PAD: Math.round(BASE.CARD_PAD * scale),
    fitViewPadding: scale === SCALE_LARGE ? 0.068 : scale === SCALE_LAPTOP ? 0.055 : 0.07,
    actionPanelWidth: Math.round(BASE.actionPanelWidth * (scale === SCALE_LARGE ? 1 : scale === SCALE_LAPTOP ? 0.96 : 0.88)),
  };
}

/** Default layout for initial render / SSR (large desktop). */
const DEFAULT_LAYOUT = getResponsiveLayout(1920);

export const COMPANY_DEPT_NODE_WIDTH = BASE.COMPANY_DEPT_NODE_WIDTH;
export const COMPANY_DEPT_NODE_HEIGHT = BASE.COMPANY_DEPT_NODE_HEIGHT;
export const COMPANY_GRID_DEPT_WIDTH = BASE.COMPANY_GRID_DEPT_WIDTH;
export const COMPANY_GRID_DEPT_HEIGHT = BASE.COMPANY_GRID_DEPT_HEIGHT;
export const COMPANY_GAP_X = BASE.COMPANY_GAP_X;
export const COMPANY_GAP_Y = BASE.COMPANY_GAP_Y;
export const COMPANY_OFFSET_X = BASE.COMPANY_OFFSET_X;
export const COMPANY_OFFSET_Y = BASE.COMPANY_OFFSET_Y;

function row1CenterX(layout: CompanyLayout): number {
  const W = layout.COMPANY_DEPT_NODE_WIDTH;
  const GX = layout.COMPANY_GAP_X;
  const row1Width = 3 * W + 2 * GX;
  return layout.COMPANY_OFFSET_X + row1Width / 2;
}

function row2StartX(layout: CompanyLayout): number {
  const W = layout.COMPANY_DEPT_NODE_WIDTH;
  const GX = layout.COMPANY_GAP_X;
  const row2Width = 2 * W + GX;
  return row1CenterX(layout) - row2Width / 2;
}

export function getDepartmentPosition(index: number, layout: CompanyLayout = DEFAULT_LAYOUT): { x: number; y: number } {
  const W = layout.COMPANY_DEPT_NODE_WIDTH;
  const H = layout.COMPANY_DEPT_NODE_HEIGHT;
  const GX = layout.COMPANY_GAP_X;
  const GY = layout.COMPANY_GAP_Y;
  const y1 = layout.COMPANY_OFFSET_Y;
  const y2 = layout.COMPANY_OFFSET_Y + H + GY;

  switch (index) {
    case 0:
      return { x: layout.COMPANY_OFFSET_X, y: y1 };
    case 1:
      return { x: layout.COMPANY_OFFSET_X + W + GX, y: y1 };
    case 2:
      return { x: layout.COMPANY_OFFSET_X + 2 * (W + GX), y: y1 };
    case 3:
      return { x: row2StartX(layout), y: y2 };
    case 4:
      return { x: row2StartX(layout) + W + GX, y: y2 };
    default:
      return { x: layout.COMPANY_OFFSET_X, y: y1 };
  }
}

/** Top-left for company tiles, centered in each canonical slot. */
export function getCompanyDepartmentDisplayPosition(index: number, layout: CompanyLayout = DEFAULT_LAYOUT): { x: number; y: number } {
  const p = getDepartmentPosition(index, layout);
  const dx = (layout.COMPANY_DEPT_NODE_WIDTH - layout.COMPANY_GRID_DEPT_WIDTH) / 2;
  const dy = (layout.COMPANY_DEPT_NODE_HEIGHT - layout.COMPANY_GRID_DEPT_HEIGHT) / 2;
  return { x: p.x + dx, y: p.y + dy };
}

export function getCompanyGridCenter(layout: CompanyLayout = DEFAULT_LAYOUT): { x: number; y: number } {
  const W = layout.COMPANY_DEPT_NODE_WIDTH;
  const H = layout.COMPANY_DEPT_NODE_HEIGHT;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < 5; i++) {
    const p = getDepartmentPosition(i, layout);
    sx += p.x + W / 2;
    sy += p.y + H / 2;
  }
  return { x: sx / 5, y: sy / 5 };
}

const CHAMBER_AMBIENT_PAD = 3000;

export function getCompanyChamberAmbientRect(layout: CompanyLayout = DEFAULT_LAYOUT): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const Gw = layout.COMPANY_GRID_DEPT_WIDTH;
  const Gh = layout.COMPANY_GRID_DEPT_HEIGHT;
  for (let i = 0; i < 5; i++) {
    const p = getCompanyDepartmentDisplayPosition(i, layout);
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

export function getCompanyFieldAmbientB(layout: CompanyLayout = DEFAULT_LAYOUT): { x: number; y: number } {
  const W = layout.COMPANY_DEPT_NODE_WIDTH;
  const H = layout.COMPANY_DEPT_NODE_HEIGHT;
  const p3 = getDepartmentPosition(3, layout);
  const p4 = getDepartmentPosition(4, layout);
  return {
    x: (p3.x + W / 2 + p4.x + W / 2) / 2,
    y: p3.y + H * 0.58,
  };
}

export function getCompanyAmbientMidY(layout: CompanyLayout = DEFAULT_LAYOUT): number {
  const H = layout.COMPANY_DEPT_NODE_HEIGHT;
  const GY = layout.COMPANY_GAP_Y;
  const y1 = layout.COMPANY_OFFSET_Y + H / 2;
  const y2 = layout.COMPANY_OFFSET_Y + H + GY + H / 2;
  return (y1 + y2) / 2;
}

export function getCompanyFieldAmbientWest(layout: CompanyLayout = DEFAULT_LAYOUT): { x: number; y: number } {
  const scale = layout.COMPANY_GRID_DEPT_WIDTH / BASE.COMPANY_GRID_DEPT_WIDTH;
  return {
    x: layout.COMPANY_OFFSET_X - 340 * scale,
    y: getCompanyAmbientMidY(layout),
  };
}

export function getCompanyFieldAmbientEast(layout: CompanyLayout = DEFAULT_LAYOUT): { x: number; y: number } {
  const W = layout.COMPANY_DEPT_NODE_WIDTH;
  const GX = layout.COMPANY_GAP_X;
  const scale = layout.COMPANY_GRID_DEPT_WIDTH / BASE.COMPANY_GRID_DEPT_WIDTH;
  return {
    x: layout.COMPANY_OFFSET_X + 3 * W + 2 * GX + 340 * scale,
    y: getCompanyAmbientMidY(layout),
  };
}

export function getCompanyFieldAmbientTop(layout: CompanyLayout = DEFAULT_LAYOUT): { x: number; y: number } {
  const W = layout.COMPANY_DEPT_NODE_WIDTH;
  const GX = layout.COMPANY_GAP_X;
  const h = layout.COMPANY_DEPT_NODE_HEIGHT;
  return {
    x: layout.COMPANY_OFFSET_X + (3 * W + 2 * GX) / 2,
    y: layout.COMPANY_OFFSET_Y + h * 0.1,
  };
}

export function getCompanyFieldAmbientSouth(layout: CompanyLayout = DEFAULT_LAYOUT): { x: number; y: number } {
  const W = layout.COMPANY_DEPT_NODE_WIDTH;
  const H = layout.COMPANY_DEPT_NODE_HEIGHT;
  const GY = layout.COMPANY_GAP_Y;
  const p3 = getDepartmentPosition(3, layout);
  const p4 = getDepartmentPosition(4, layout);
  return {
    x: (p3.x + W / 2 + p4.x + W / 2) / 2,
    y: p3.y + H + GY + 100,
  };
}
