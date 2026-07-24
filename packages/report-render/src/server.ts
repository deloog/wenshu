import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";

const CONTENT_TYPES: Readonly<Record<string, string>> = Object.freeze({
  ".html": "text/html; charset=utf-8",
  ".otf": "font/otf",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
});

export interface ServedRoot {
  /** URL 前缀（如 "/fonts/"），只服务该前缀下的裸文件名。 */
  readonly mount: string;
  readonly directory: string;
}

export interface StaticServer {
  readonly origin: string;
  close(): Promise<void>;
}

/**
 * 测试用本地静态服务器：只监听 127.0.0.1，只服务挂载前缀下的裸文件名，
 * 路径必须解析在声明目录内，否则 404（不服务目录遍历）。
 */
export async function startStaticServer(
  roots: readonly ServedRoot[],
  documents: Readonly<Record<string, string | Uint8Array>> = {},
): Promise<StaticServer> {
  const resolvedRoots = roots.map((root) => ({
    mount: root.mount,
    directory: resolve(root.directory),
  }));
  const server: Server = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const inline = documents[url.pathname];
      if (inline !== undefined) {
        const type =
          typeof inline === "string" ? ".html" : extname(url.pathname).toLowerCase();
        response.writeHead(200, {
          "content-type": CONTENT_TYPES[type] ?? "application/octet-stream",
        });
        response.end(inline);
        return;
      }
      for (const root of resolvedRoots) {
        if (!url.pathname.startsWith(root.mount)) {
          continue;
        }
        const rest = url.pathname.slice(root.mount.length);
        if (rest.length === 0 || rest.includes("/") || rest.includes("\\")) {
          break;
        }
        const absolute = normalize(join(root.directory, rest));
        if (!absolute.startsWith(root.directory + sep)) {
          break;
        }
        try {
          const bytes = await readFile(absolute);
          response.writeHead(200, {
            "content-type":
              CONTENT_TYPES[extname(rest).toLowerCase()] ?? "application/octet-stream",
          });
          response.end(bytes);
        } catch {
          response.writeHead(404);
          response.end();
        }
        return;
      }
      response.writeHead(404);
      response.end();
    })();
  });
  await new Promise<void>((resolveListen) => {
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  return Object.freeze({
    origin: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolveClose, rejectClose) => {
        server.close((error) =>
          error === undefined ? resolveClose() : rejectClose(error),
        );
      }),
  });
}
