import type { ToolRejectionCode, ToolRequest } from "./contract.ts";

interface SafeRecord {
  readonly [key: string]: unknown;
}

function asSafeRecord(input: unknown): SafeRecord | undefined {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return undefined;
  }
  if (Object.getPrototypeOf(input) !== Object.prototype) return undefined;
  const descriptors = Object.getOwnPropertyDescriptors(input);
  for (const descriptor of Object.values(descriptors)) {
    if (!("value" in descriptor)) return undefined;
  }
  return input as SafeRecord;
}

function exactKeys(record: SafeRecord, expected: readonly string[]): boolean {
  const keys = Object.keys(record).sort();
  return (
    keys.length === expected.length &&
    keys.every((key, index) => key === expected[index])
  );
}

function stringValue(
  record: SafeRecord,
  key: string,
  maximum: number,
): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.length > 0 && value.length <= maximum
    ? value
    : undefined;
}

function nodeId(
  value: string | undefined,
  documentAllowed: boolean,
): string | undefined {
  if (value === undefined) return undefined;
  const pattern = documentAllowed
    ? /^(?:doc|node)_[0-9a-f]{32}$/u
    : /^node_[0-9a-f]{32}$/u;
  return pattern.test(value) ? value : undefined;
}

function tableColumns(
  input: unknown,
): Extract<ToolRequest, { tool: "table" }>["columns"] | undefined {
  if (!Array.isArray(input) || input.length === 0) return undefined;
  const result: { header: string; align: "start" | "center" | "end" }[] = [];
  for (const entry of input) {
    const record = asSafeRecord(entry);
    if (record === undefined || !exactKeys(record, ["align", "header"]))
      return undefined;
    const header = stringValue(record, "header", 500);
    const align = record["align"];
    if (
      header === undefined ||
      (align !== "start" && align !== "center" && align !== "end")
    ) {
      return undefined;
    }
    result.push(Object.freeze({ header, align }));
  }
  return Object.freeze(result);
}

function tableRows(
  input: unknown,
  width: number,
): Extract<ToolRequest, { tool: "table" }>["rows"] | undefined {
  if (!Array.isArray(input) || input.length === 0) return undefined;
  const result: string[][] = [];
  for (const row of input) {
    if (!Array.isArray(row) || row.length !== width) return undefined;
    const cells = row.map((cell) =>
      typeof cell === "string" && cell.length <= 100_000 ? cell : undefined,
    );
    if (cells.some((cell) => cell === undefined)) return undefined;
    result.push(cells as string[]);
  }
  return Object.freeze(result.map((row) => Object.freeze(row)));
}

/** Strictly decodes untrusted model output; unknown keys are prompt-injection attempts. */
export function decodeToolRequest(input: unknown): ToolRequest | ToolRejectionCode {
  const envelope = asSafeRecord(input);
  if (envelope === undefined || !exactKeys(envelope, ["args", "tool"]))
    return "TOOL_SCHEMA_REJECTED";
  const tool = envelope["tool"];
  const args = asSafeRecord(envelope["args"]);
  if (args === undefined) return "TOOL_SCHEMA_REJECTED";
  switch (tool) {
    case "rewrite": {
      if (!exactKeys(args, ["nodeId", "text"])) return "TOOL_SCHEMA_REJECTED";
      const target = nodeId(stringValue(args, "nodeId", 37), false);
      const text = stringValue(args, "text", 100_000);
      return target === undefined || text === undefined
        ? "TOOL_SCHEMA_REJECTED"
        : { tool, nodeId: target, text };
    }
    case "insert": {
      if (!exactKeys(args, ["parentId", "text"])) return "TOOL_SCHEMA_REJECTED";
      const parentId = nodeId(stringValue(args, "parentId", 37), true);
      const text = stringValue(args, "text", 100_000);
      return parentId === undefined || text === undefined
        ? "TOOL_SCHEMA_REJECTED"
        : { tool, parentId, text };
    }
    case "outline": {
      if (!exactKeys(args, ["initialText", "level", "parentId", "title"]))
        return "TOOL_SCHEMA_REJECTED";
      const parentId = nodeId(stringValue(args, "parentId", 37), true);
      const title = stringValue(args, "title", 500);
      const initialText = stringValue(args, "initialText", 100_000);
      const level = args["level"];
      return parentId === undefined ||
        title === undefined ||
        initialText === undefined ||
        typeof level !== "number" ||
        !Number.isInteger(level) ||
        level < 1 ||
        level > 6
        ? "TOOL_SCHEMA_REJECTED"
        : { tool, parentId, title, initialText, level };
    }
    case "table": {
      if (!exactKeys(args, ["caption", "columns", "parentId", "rows"]))
        return "TOOL_SCHEMA_REJECTED";
      const parentId = nodeId(stringValue(args, "parentId", 37), true);
      const caption =
        args["caption"] === null ? undefined : stringValue(args, "caption", 500);
      const columns = tableColumns(args["columns"]);
      const rows =
        columns === undefined ? undefined : tableRows(args["rows"], columns.length);
      return parentId === undefined ||
        (args["caption"] !== null && caption === undefined) ||
        columns === undefined ||
        rows === undefined
        ? "TOOL_SCHEMA_REJECTED"
        : { tool, parentId, caption, columns, rows };
    }
    case "citation": {
      if (!exactKeys(args, ["attribution", "parentId", "text"]))
        return "TOOL_SCHEMA_REJECTED";
      const parentId = nodeId(stringValue(args, "parentId", 37), true);
      const text = stringValue(args, "text", 100_000);
      const attribution = stringValue(args, "attribution", 500);
      return parentId === undefined || text === undefined || attribution === undefined
        ? "TOOL_SCHEMA_REJECTED"
        : { tool, parentId, text, attribution };
    }
    case "move_subtree": {
      if (!exactKeys(args, ["destinationParentId", "nodeId"]))
        return "TOOL_SCHEMA_REJECTED";
      const node = nodeId(stringValue(args, "nodeId", 37), false);
      const destinationParentId = nodeId(
        stringValue(args, "destinationParentId", 37),
        true,
      );
      return node === undefined || destinationParentId === undefined
        ? "TOOL_SCHEMA_REJECTED"
        : { tool, nodeId: node, destinationParentId };
    }
    default:
      return "TOOL_UNKNOWN";
  }
}
