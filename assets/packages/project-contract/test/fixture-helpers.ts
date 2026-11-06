import { readFile } from "node:fs/promises";

export async function readJson(path: URL): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

export function validFixture(name: string): Promise<unknown> {
  return readJson(new URL(`../fixtures/valid/${name}.json`, import.meta.url));
}

export function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Fixture must be an object.");
  }
  return value as Record<string, unknown>;
}
