/**
 * verify-persistent-caliber（A-04E-2a 第二批口径的决定性校验，业主 2026-08-08 裁定四条约束的第 3/4 条）。
 *
 * 校验对象：tools/a-04e/normalized-pdf-sha-persistent.mjs（新口径）与
 * tools/a-04e/normalized-pdf-sha.mjs（签署口径，只被调用、不被改写/复制——
 * 算法唯一真源，本脚本经 child_process 调用它）。
 *
 * 四组判定（任一失败即非零退出）：
 *   1. 同构判等：--session 两份同会话产物（结构同、node ID 平移）新口径必须判【等】。
 *   2. 冷启交叉校验：--cold 两份冷启产物（各起浏览器进程）上，新口径判定必须与
 *      签署口径判定一致（两口径各自出哈希，分别比较等/不等，结论须相同）——
 *      若分歧，说明新归一化写坏，立即停。
 *   3. 决定性反例（同 A02F5 反例 3 纪律：证明修复没换来失明）：以 --session 第 1 份
 *      为底本在内存构造三类变异，新口径必须逐个判【不等】：
 *      M1 换指——一处 /Headers [(nodeXXXXXXXX)] 引用改指另一既有节点；
 *      M2 删——删除一处 /ID (nodeXXXXXXXX) 定义 token；
 *      M3 增——插入一处多余 /ID (nodeXXXXXXXX) token。
 *   4. 阴性对照：原样复制的底本与自身判【等】（防校验器把一切都报不等）。
 *
 * 用法：node tools/a-04e/verify-persistent-caliber.mjs
 *       --session <p1.pdf> <p2.pdf> --cold <c1.pdf> <c2.pdf>
 */
import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import console from "node:console";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { normalizePersistentCaliber } from "./normalized-pdf-sha-persistent.mjs";

const here = dirname(fileURLToPath(import.meta.url));

function argPair(flag) {
  const i = process.argv.indexOf(flag);
  if (i < 0) return undefined;
  return [process.argv[i + 1], process.argv[i + 2]];
}

function newCaliberSha(text) {
  return createHash("sha256")
    .update(Buffer.from(normalizePersistentCaliber(text), "latin1"))
    .digest("hex")
    .toUpperCase();
}

function signedCaliberSha(path) {
  const out = execFileSync(
    process.execPath,
    [resolve(here, "normalized-pdf-sha.mjs"), path],
    { encoding: "utf8" },
  );
  return out.trim().split(/\s+/)[0];
}

let failures = 0;
function check(label, ok) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failures += 1;
}

const sessionPair = argPair("--session");
const coldPair = argPair("--cold");
if (!sessionPair || !coldPair) {
  console.error("usage: --session <p1> <p2> --cold <c1> <c2>");
  process.exit(2);
}

// 1. 同构判等（会话形态）
const [p1, p2] = sessionPair;
const t1 = readFileSync(p1, "latin1");
const t2 = readFileSync(p2, "latin1");
check(
  "isomorphism: session pair judged EQUAL under persistent caliber",
  newCaliberSha(t1) === newCaliberSha(t2),
);

// 4. 阴性对照（先跑，底本自身必须判等）
check(
  "negative control: identical copy judged EQUAL",
  newCaliberSha(t1) === newCaliberSha(t1),
);

// 3. 决定性反例
const headerRef = /\/Headers \[\(node(\d{8})\)\]/;
const refMatch = headerRef.exec(t1);
if (!refMatch) {
  console.error("FAIL  fixture has no /Headers reference to mutate");
  process.exit(1);
}
const allIds = [...new Set([...t1.matchAll(/node\d{8}/g)].map((m) => m[0]))];
const otherId = allIds.filter((id) => id !== `node${refMatch[1]}`).at(-1);
if (!otherId) {
  console.error("FAIL  fixture has no alternate node id for retarget mutation");
  process.exit(1);
}
const m1 = t1.replace(headerRef, `/Headers [(${otherId})]`);
check(
  `M1 retarget: /Headers ref ${`node${refMatch[1]}`} -> ${otherId} judged UNEQUAL`,
  newCaliberSha(m1) !== newCaliberSha(t1),
);

const idDef = /\/ID \(node\d{8}\)/;
const m2 = t1.replace(idDef, "");
check(
  "M2 delete: one /ID definition token removed judged UNEQUAL",
  newCaliberSha(m2) !== newCaliberSha(t1),
);

const m3 = t1.replace(idDef, (m) => `${m}${m}`);
check(
  "M3 insert: one extra /ID definition token inserted judged UNEQUAL",
  newCaliberSha(m3) !== newCaliberSha(t1),
);

// 2. 冷启交叉校验：新口径判定 === 签署口径判定
const [c1, c2] = coldPair;
const newVerdict =
  newCaliberSha(readFileSync(c1, "latin1")) ===
  newCaliberSha(readFileSync(c2, "latin1"));
const signedVerdict = signedCaliberSha(c1) === signedCaliberSha(c2);
check(
  `cross-validation: cold pair new caliber (${newVerdict ? "EQUAL" : "UNEQUAL"}) agrees with signed caliber (${signedVerdict ? "EQUAL" : "UNEQUAL"})`,
  newVerdict === signedVerdict,
);

if (failures > 0) {
  console.error(`verify-persistent-caliber: ${failures} check(s) FAILED`);
  process.exit(1);
}
console.log("verify-persistent-caliber: all checks PASS");
