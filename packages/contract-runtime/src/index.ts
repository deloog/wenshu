export type InspectionFailureKind =
  "accessor" | "budget" | "cycle" | "function" | "prototype";

export type InspectionResult<TCode extends string> =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly kind: InspectionFailureKind;
      readonly path: string;
    }
  | {
      readonly ok: false;
      readonly kind: "custom";
      readonly code: TCode;
      readonly path: string;
    };

export interface InspectionOptions<TCode extends string> {
  readonly classifyKey?: (normalizedKey: string) => TCode | undefined;
  readonly classifyString?: (value: string) => TCode | undefined;
  readonly maxDepth: number;
  readonly maxNodes: number;
}

interface InspectionItem {
  readonly depth: number;
  readonly path: string;
  readonly value: unknown;
}

function escapePathSegment(segment: string): string {
  return segment.replaceAll("~", "~0").replaceAll("/", "~1");
}

function failure<TCode extends string>(
  kind: InspectionFailureKind,
  path: string,
): InspectionResult<TCode> {
  return Object.freeze({ ok: false, kind, path });
}

function isAllowedPrototype(value: object): boolean {
  const prototype = Object.getPrototypeOf(value) as unknown;
  if (Array.isArray(value)) {
    return prototype === Array.prototype;
  }
  return prototype === null || prototype === Object.prototype;
}

export function inspectData<TCode extends string = never>(
  input: unknown,
  options: InspectionOptions<TCode>,
): InspectionResult<TCode> {
  const stack: InspectionItem[] = [{ depth: 0, path: "/", value: input }];
  const seen = new WeakSet<object>();
  let visitedNodes = 0;

  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) {
      break;
    }
    if (typeof current.value === "function") {
      return failure("function", current.path);
    }
    if (typeof current.value === "string") {
      const code = options.classifyString?.(current.value);
      if (code !== undefined) {
        return Object.freeze({
          ok: false,
          kind: "custom",
          code,
          path: current.path,
        });
      }
      continue;
    }
    if (typeof current.value !== "object" || current.value === null) {
      continue;
    }
    visitedNodes += 1;
    if (current.depth > options.maxDepth || visitedNodes > options.maxNodes) {
      return failure("budget", current.path);
    }
    if (seen.has(current.value)) {
      return failure("cycle", current.path);
    }
    seen.add(current.value);
    if (!isAllowedPrototype(current.value)) {
      return failure("prototype", current.path);
    }

    const descriptors = Object.entries(Object.getOwnPropertyDescriptors(current.value));
    for (let index = descriptors.length - 1; index >= 0; index -= 1) {
      const entry = descriptors[index];
      if (entry === undefined) {
        continue;
      }
      const [key, descriptor] = entry;
      const path = `${current.path === "/" ? "" : current.path}/${escapePathSegment(key)}`;
      if (descriptor.get !== undefined || descriptor.set !== undefined) {
        return failure("accessor", path);
      }
      const normalizedKey = key.toLowerCase().replaceAll(/[-_\s]/gu, "");
      const code = options.classifyKey?.(normalizedKey);
      if (code !== undefined) {
        return Object.freeze({ ok: false, kind: "custom", code, path });
      }
      const descriptorValue: unknown = descriptor.value;
      stack.push({
        depth: current.depth + 1,
        path,
        value: descriptorValue,
      });
    }
  }
  return Object.freeze({ ok: true });
}

export function cloneAndFreeze<T>(value: T): T {
  const clone = structuredClone(value);
  if (typeof clone !== "object" || clone === null) {
    return clone;
  }

  const stack: object[] = [clone];
  const seen = new WeakSet<object>();
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined || seen.has(current)) {
      continue;
    }
    seen.add(current);
    for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(current))) {
      const child: unknown = descriptor.value;
      if (typeof child === "object" && child !== null) {
        stack.push(child);
      }
    }
    Object.freeze(current);
  }
  return clone;
}
