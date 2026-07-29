import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { launchChromiumTabs } from "./chromium-tabs.ts";

const root = dirname(fileURLToPath(import.meta.url));
const wasmRoot = join(root, "node_modules", "@sqlite.org", "sqlite-wasm", "dist");
const mime = new Map([
  [".html", "text/html"],
  [".js", "text/javascript"],
  [".mjs", "text/javascript"],
  [".wasm", "application/wasm"],
]);

const pageHtml = `<!doctype html><script type="module">
globalThis.stage={isolated:crossOriginIsolated,opfs:!!navigator.storage?.getDirectory};
try {
  const {sqlite3Worker1Promiser}=await import('/index.mjs');
  const connect=()=>new Promise((resolve,reject)=>{
    const worker=new Worker('/sqlite3-worker1.mjs',{type:'module'});
    worker.onerror=event=>reject(new Error('worker:'+event.message));
    sqlite3Worker1Promiser({worker,onready:promiser=>resolve({worker,promiser})});
  });
  const channel=new BroadcastChannel('pb08-lock');
  if(new URL(location.href).searchParams.get('role')==='contender'){
    const {worker,promiser}=await connect();
    channel.postMessage({phase:'opening'});
    const started=performance.now();
    await promiser('open',{filename:'file:pb08.sqlite?vfs=opfs'});
    await promiser('exec',{sql:'insert into probe values(2)'});
    const blockedMs=performance.now()-started;
    const count=await promiser('exec',{sql:'select count(*) as total from probe',rowMode:'object',resultRows:[]});
    await promiser('close',{});
    channel.postMessage({phase:'done',total:count.result.resultRows[0].total,blockedMs});
    worker.terminate();
    channel.close();
  } else {
    const {worker,promiser}=await connect();
    const opened=await promiser('open',{filename:'file:pb08.sqlite?vfs=opfs'});
    await promiser('exec',{sql:'create table if not exists probe(v);delete from probe;insert into probe values(1)'});
    const version=await promiser('exec',{sql:'select sqlite_version() as version',rowMode:'object',resultRows:[]});
    await promiser('close',{});
    const reopened=await promiser('open',{filename:'file:pb08.sqlite?vfs=opfs'});
    const persisted=await promiser('exec',{sql:'select count(*) as total from probe',rowMode:'object',resultRows:[]});
    await promiser('exec',{sql:'begin immediate'});
    channel.onmessage=async event=>{
      if(event.data?.phase==='opening'){
        setTimeout(async()=>{
          await promiser('exec',{sql:'rollback'});
        },150);
      }
      if(event.data?.phase==='done'){
        await promiser('close',{});
        const estimate=await navigator.storage.estimate();
        globalThis.result={
          version:version.result.resultRows[0].version,
          opfs:opened.result.vfs==='opfs'&&opened.result.persistent===true,
          filename:reopened.result.filename,
          initialTotal:persisted.result.resultRows[0].total,
          total:event.data.total,
          lockObserved:event.data.blockedMs>=100,
          blockedMs:event.data.blockedMs,
          contexts:2,
          size:estimate.usage,
          stage:globalThis.stage
        };
        worker.terminate();
        channel.close();
      }
    };
    globalThis.readyForContender=true;
  }
} catch(error) { globalThis.result={error:'page:'+String(error),stage:globalThis.stage}; }
</script>`;

test("two Chromium contexts use real SQLite OPFS persistence and lock contention", async () => {
  const requests: string[] = [];
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    requests.push(url);
    if (url === "/favicon.ico") {
      response.writeHead(204);
      response.end();
      return;
    }
    const body =
      url === "/" ? pageHtml : await readFile(join(wasmRoot, url.replace(/^\//u, "")));
    response.writeHead(200, {
      "content-type":
        url === "/" ? "text/html" : (mime.get(extname(url)) ?? "text/javascript"),
      "cross-origin-opener-policy": "same-origin",
      "cross-origin-embedder-policy": "require-corp",
    });
    response.end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("PB08_SERVER_FAILED");
  }
  const browser = await launchChromiumTabs();
  try {
    const main = await browser.open(`http://127.0.0.1:${address.port}/`);
    await main.evaluate(
      "new Promise((resolve,reject)=>{const t=setInterval(()=>{if(globalThis.readyForContender){clearInterval(t);resolve(true)}},25);setTimeout(()=>{clearInterval(t);reject(new Error('PB08_MAIN_TIMEOUT'))},10000)})",
    );
    await browser.open(`http://127.0.0.1:${address.port}/?role=contender`);
    type Result = {
      version: string;
      opfs: boolean;
      filename: string;
      initialTotal: number;
      total: number;
      lockObserved: boolean;
      blockedMs: number;
      contexts: number;
      size: number;
    };
    let result: Result;
    try {
      result = await main.evaluate<Result>(
        "new Promise((resolve,reject)=>{const t=setInterval(()=>{if(globalThis.result){clearInterval(t);resolve(globalThis.result)}},25);setTimeout(()=>{clearInterval(t);reject(new Error('PB08_OPFS_TIMEOUT'))},15000)})",
      );
    } catch (error) {
      throw new Error(`PB08_OPFS_FAILED requests=${JSON.stringify(requests)}`, {
        cause: error,
      });
    }
    assert.equal("error" in result, false, JSON.stringify(result));
    assert.equal(typeof result.version, "string", JSON.stringify(result));
    assert.match(result.version, /^3\./u);
    assert.equal(result.opfs, true, JSON.stringify(result));
    assert.match(result.filename, /pb08\.sqlite/u);
    assert.equal(result.initialTotal, 1);
    assert.equal(result.total, 2);
    assert.equal(result.lockObserved, true);
    assert.ok(result.blockedMs >= 100, JSON.stringify(result));
    assert.equal(result.contexts, 2);
    assert.ok(result.size > 0);
  } finally {
    await browser.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
