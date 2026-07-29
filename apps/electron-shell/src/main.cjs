const { app, BrowserWindow, ipcMain } = require("electron");
const { createHash } = require("node:crypto");
const { mkdir, writeFile } = require("node:fs/promises");
const { resolve } = require("node:path");
const { dirname } = require("node:path");
const { createElectronSession } = require("./electron-session.cjs");

const appDir = dirname(require.resolve("./main.cjs"));

const capabilityNames = Object.freeze([
  "project.directory.select",
  "project.directory.authorize",
  "project.save.atomic",
  "project.save.as",
  "project.backup.create",
  "project.backup.restore",
  "file.import.select",
  "file.export.write",
  "print.pdf.export",
  "font.catalog.list",
  "font.catalog.check",
  "window.control",
  "clipboard.text.write",
  "share.invoke",
  "link.open.external",
  "secret.credential.manage",
  "secret.credential.status",
  "platform.info.read",
]);

function declaration(name) {
  const supported = name === "print.pdf.export";
  return Object.freeze({
    name,
    capability_version: "0.1.0",
    support_status: supported ? "supported" : "unsupported",
    permission_status: "not_applicable",
    input_schema: `wenshu.host.input.${name}/0.1.0`,
    output_schema: `wenshu.host.output.${name}/0.1.0`,
    limits: { max_concurrent_requests: 1, timeout_ms: 300000, max_payload_bytes: 0 },
    lifecycle: "request",
    cancellation: "none",
    progress: "none",
    error_codes: supported
      ? ["HOST_INVALID_REQUEST", "HOST_INTERNAL"]
      : ["HOST_UNSUPPORTED"],
    fallback: {
      strategy: supported ? "none" : "read_only",
      reason_code: supported ? "ELECTRON_PRINT_AVAILABLE" : "PA14E_OUT_OF_SCOPE",
    },
  });
}

const registry = Object.freeze({
  protocol_version: "0.1.0",
  kind: "registry",
  host_kind: "electron",
  host_version: app.getVersion(),
  instance_id: "host_14e00000000000000000000000000000",
  capabilities: capabilityNames.map(declaration),
});

async function loadHostValidator() {
  return import("@wenshu/host-contract");
}

async function createWindow() {
  const window = new BrowserWindow({
    show: false,
    webPreferences: preferences,
  });
  await window.loadFile(appDir + "\\renderer.html");
  return window;
}

const preferences = Object.freeze({
  contextIsolation: true,
  sandbox: true,
  nodeIntegration: false,
  preload: appDir + "\\preload.cjs",
});

app
  .whenReady()
  .then(async () => {
    const { validateHostContract, validateHostSession } = await loadHostValidator();
    const registryValidation = validateHostContract(registry);
    if (!registryValidation.ok) {
      throw new Error(
        `invalid electron host registry: ${registryValidation.issues[0]?.code}`,
      );
    }

    ipcMain.handle("wenshu.host.registry", () => registry);
    ipcMain.handle("wenshu.host.invoke", async (_event, request) => {
      if (request?.capability !== "print.pdf.export") {
        throw new Error("electron host capability is not supported");
      }
      const window =
        BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
      if (window === undefined) throw new Error("electron host has no reverify window");
      const pdf = await window.webContents.printToPDF({ printBackground: true });
      const response = Object.freeze({
        protocol_version: "0.1.0",
        kind: "success",
        request_id: request.request_id,
        capability: "print.pdf.export",
        output: Object.freeze({
          sha256: createHash("sha256").update(pdf).digest("hex"),
        }),
      });
      const session = validateHostSession(registry, [request, response]);
      if (!session.ok)
        throw new Error(`invalid electron host session: ${session.issues[0]?.code}`);
      return response;
    });

    const window = await createWindow();
    if (globalThis.process.argv.includes("--reverify")) {
      const proof = await window.webContents.executeJavaScript(
        "Promise.all([window.wenshuHost.registry(), window.wenshuHost.invoke({protocol_version:'0.1.0',kind:'request',request_id:'req_14e00000000000000000000000000000',capability:'print.pdf.export',capability_version:'0.1.0',input:{}}), typeof require, typeof process, Object.keys(window.wenshuHost).sort()])",
        true,
      );
      const { produceBaselinePdf } = await import("@wenshu/pdf-export");
      const root = resolve(appDir, "../../..");
      const output = await produceBaselinePdf({
        fixture: resolve(root, "docs/poc-a/fixtures/golden-report.md"),
        fixtureRoot: resolve(root, "docs/poc-a/fixtures"),
        fontDir: resolve(root, "assets/fonts/source-han-sans-cn/2.005R"),
        templatePath: resolve(
          root,
          "docs/poc-a/fixtures/formal-business.template.json",
        ),
        createBrowser: async () =>
          createElectronSession(BrowserWindow, app, preferences),
      });
      const out = resolve(root, "test-results/pa-14e-electron");
      await mkdir(out, { recursive: true });
      await writeFile(resolve(out, "electron-baseline.pdf"), output.pdfBytes);
      const evidence = Object.freeze({
        electron: {
          product: output.browserProduct,
          pageCount: output.inspection.pageCount,
          fontsEmbedded: output.inspection.fonts.every((font) => font.embedded),
        },
        rendererSecurity: {
          exposedKeys: proof[4],
          requireType: proof[2],
          processType: proof[3],
          actualPreferences: window.webContents.getLastWebPreferences(),
        },
        hostSession: { terminalKind: proof[1].kind, capability: proof[1].capability },
      });
      await writeFile(
        resolve(out, "evidence.json"),
        `${JSON.stringify(evidence, null, 2)}\n`,
      );
      globalThis.process.stdout.write(`${JSON.stringify(evidence)}\n`);
      app.exit(0);
    }
  })
  .catch((error) => {
    globalThis.process.stderr.write(
      `Electron PA-14E reverify failed: ${String(error)}\n`,
    );
    app.exit(1);
  });
