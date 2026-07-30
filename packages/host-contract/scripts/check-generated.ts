import { readFile } from "node:fs/promises";

import { GENERATED_FILES } from "./render-types.ts";

const manifest = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
) as unknown;
if (
  typeof manifest !== "object" ||
  manifest === null ||
  !("wenshu" in manifest) ||
  typeof manifest.wenshu !== "object" ||
  manifest.wenshu === null ||
  !("generatedFiles" in manifest.wenshu) ||
  !Array.isArray(manifest.wenshu.generatedFiles)
) {
  throw new Error("Host generated file registry does not match the generator.");
}
const declared = manifest.wenshu.generatedFiles;
const expected = GENERATED_FILES.map((file) => file.relativeName);
if (
  declared.length !== expected.length ||
  !expected.every((name, index) => declared[index] === name)
) {
  throw new Error("Host generated file registry does not match the generator.");
}

for (const file of GENERATED_FILES) {
  const expectedContent = await file.render();
  const actual = await readFile(file.path, "utf8").catch(() => "");
  if (actual !== expectedContent) {
    throw new Error(
      `Generated host types are stale; run pnpm generate. (${file.relativeName})`,
    );
  }
}
