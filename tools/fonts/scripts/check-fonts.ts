import { resolve } from "node:path";

import { verifyFontSet } from "../src/index.ts";

const fontRoot = resolve(
  import.meta.dirname,
  "../../../assets/fonts/source-han-sans-cn/2.005R",
);
const verified = await verifyFontSet(fontRoot);
process.stdout.write(
  `Font check passed: ${verified.manifest.files.length} frozen OTF files.\n`,
);
