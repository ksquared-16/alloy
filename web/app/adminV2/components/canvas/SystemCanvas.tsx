"use client";

import { useCallback } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Node,
  type Edge,
  BackgroundVariant,
} from "reactflow";
import "reactflow/dist/style.css";
import { neutral, derived } from "@/styles/tokens/colors";
import DepartmentNode from "./DepartmentNode";
import { MOCK_DEPARTMENTS } from "./mockDepartments";
import type { DepartmentNodeData } from "./DepartmentNode";

const NODE_WIDTH = 200;
const NODE_HEIGHT = 160;
const GAP_X = 80;
const GAP_Y = 60;
const OFFSET_X = 60;
const OFFSET_Y = 40;

/** Grid: row 0 = Operations, Sales; row 1 = Finance, Customer Success; row 2 = AI Systems (centered) */
function getDepartmentPosition(index: number): { x: number; y: number } {
  switch (index) {
    case 0:
      return { x: OFFSET_X, y: OFFSET_Y };
    case 1:
      return { x: OFFSET_X + NODE_WIDTH + GAP_X, y: OFFSET_Y };
    case 2:
      return { x: OFFSET_X, y: OFFSET_Y + NODE_HEIGHT + GAP_Y };
    case 3:
      return { x: OFFSET_X + NODE_WIDTH + GAP_X, y: OFFSET_Y + NODE_HEIGHT + GAP_Y };
    case 4: {
      const centerX = (OFFSET_X * 2 + NODE_WIDTH * 2 + GAP_X) / 2 - NODE_WIDTH / 2;
      return { x: centerX, y: OFFSET_Y + (NODE_HEIGHT + GAP_Y) * 2 };
    }
    default:
      return { x: OFFSET_X + (index % 2) * (NODE_WIDTH + GAP_X), y: OFFSET_Y + Math.floor(index / 2) * (NODE_HEIGHT + GAP_Y) };
  }
}

const initialNodes: Node<DepartmentNodeData>[] = MOCK_DEPARTMENTS.map((d, i) => ({
  id: d.id,
  type: "department",
  position: getDepartmentPosition(i),
  data: {
    name: d.name,
    departmentKey: d.key,
    primaryKpi: d.primaryKpi,
    primaryValue: d.primaryValue,
    secondaryKpi: d.secondaryKpi,
    secondaryValue: d.secondaryValue,
    health: d.health,
    alertCount: d.alertCount,
  } satisfies DepartmentNodeData,
  draggable: true,
}));

const initialEdges: Edge[] = [];

const nodeTypes = { department: DepartmentNode };

export default function SystemCanvas() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  return (
    <div className="w-full h-full" style={{ backgroundColor: neutral.background }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.1}
        maxZoom={2}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} color={neutral.border} />
        <Controls />
        <MiniMap
          nodeColor={neutral.border}
          maskColor={derived.maskOverlay}
          style={{ backgroundColor: neutral.surface }}
        />
      </ReactFlow>
    </div>
  );
}
