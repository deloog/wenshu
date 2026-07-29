export const FROZEN_TOOL_NAMES = Object.freeze([
  "rewrite",
  "insert",
  "outline",
  "table",
  "citation",
  "move_subtree",
] as const);

export type SemanticToolName = (typeof FROZEN_TOOL_NAMES)[number];

export interface ToolPermission {
  readonly allowedTools: readonly SemanticToolName[];
  readonly writableNodeIds: readonly string[];
}

export interface ModelToolDefinition {
  readonly name: SemanticToolName;
  readonly input: Readonly<Record<string, string>>;
}

export type ToolRejectionCode =
  | "TOOL_PERMISSION_DENIED"
  | "TOOL_SCHEMA_REJECTED"
  | "TOOL_TARGET_INVALID"
  | "TOOL_TARGET_KIND_REJECTED"
  | "TOOL_TRANSACTION_ROLLED_BACK"
  | "TOOL_UNKNOWN";

export type ModelToolResult =
  | { readonly status: "committed"; readonly affectedNodeIds: readonly string[] }
  | { readonly status: "rejected"; readonly code: ToolRejectionCode };

interface RewriteRequest {
  readonly tool: "rewrite";
  readonly nodeId: string;
  readonly text: string;
}

interface InsertRequest {
  readonly tool: "insert";
  readonly parentId: string;
  readonly text: string;
}

interface OutlineRequest {
  readonly tool: "outline";
  readonly parentId: string;
  readonly level: number;
  readonly title: string;
  readonly initialText: string;
}

interface TableRequest {
  readonly tool: "table";
  readonly parentId: string;
  readonly caption: string | undefined;
  readonly columns: readonly {
    readonly header: string;
    readonly align: "start" | "center" | "end";
  }[];
  readonly rows: readonly (readonly string[])[];
}

interface CitationRequest {
  readonly tool: "citation";
  readonly parentId: string;
  readonly text: string;
  readonly attribution: string;
}

interface MoveRequest {
  readonly tool: "move_subtree";
  readonly nodeId: string;
  readonly destinationParentId: string;
}

export type ToolRequest =
  | RewriteRequest
  | InsertRequest
  | OutlineRequest
  | TableRequest
  | CitationRequest
  | MoveRequest;

export function requiredNodeIds(request: ToolRequest): readonly string[] {
  switch (request.tool) {
    case "rewrite":
      return [request.nodeId];
    case "move_subtree":
      return [request.nodeId, request.destinationParentId];
    case "insert":
    case "outline":
    case "table":
    case "citation":
      return [request.parentId];
  }
}

export function isAllowed(permission: ToolPermission, request: ToolRequest): boolean {
  const tools = new Set(permission.allowedTools);
  const nodes = new Set(permission.writableNodeIds);
  return (
    tools.has(request.tool) && requiredNodeIds(request).every((id) => nodes.has(id))
  );
}

export function modelToolDefinitions(): readonly ModelToolDefinition[] {
  return Object.freeze([
    {
      name: "rewrite",
      input: Object.freeze({ nodeId: "node ID", text: "replacement text" }),
    },
    {
      name: "insert",
      input: Object.freeze({ parentId: "container ID", text: "paragraph text" }),
    },
    {
      name: "outline",
      input: Object.freeze({
        parentId: "container ID",
        level: "1..6",
        title: "title",
        initialText: "body",
      }),
    },
    {
      name: "table",
      input: Object.freeze({
        parentId: "container ID",
        caption: "text|null",
        columns: "header/align[]",
        rows: "text[][]",
      }),
    },
    {
      name: "citation",
      input: Object.freeze({
        parentId: "container ID",
        text: "quoted text",
        attribution: "source",
      }),
    },
    {
      name: "move_subtree",
      input: Object.freeze({ nodeId: "node ID", destinationParentId: "container ID" }),
    },
  ]);
}
