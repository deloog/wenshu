export const TEST_LAYERS = Object.freeze([
  "unit",
  "contract",
  "render",
  "integration",
  "e2e",
] as const);

export type TestLayer = (typeof TEST_LAYERS)[number];

export function isTestLayer(value: string): value is TestLayer {
  return TEST_LAYERS.some((layer) => layer === value);
}

export function classifyTestFile(filePath: string): TestLayer | undefined {
  const normalized = filePath.replaceAll("\\", "/");
  return TEST_LAYERS.find((layer) =>
    normalized.endsWith(`.${layer}.test.ts`),
  );
}

export function acceptedTestSuffixes(): readonly string[] {
  return Object.freeze(TEST_LAYERS.map((layer) => `.${layer}.test.ts`));
}
