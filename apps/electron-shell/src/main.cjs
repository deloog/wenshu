const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const { createHash } = require("node:crypto");
const { mkdir, writeFile } = require("node:fs/promises");
const { resolve, dirname } = require("node:path");
const { createElectronSession } = require("./electron-session.cjs");
const { registerProjectChannels } = require("./project-channels.cjs");

const appDir = dirname(require.resolve("./main.cjs"));
const instanceId = "host_14e00000000000000000000000000000";

async function loadHostModules() {
  const [
    { createFileHost, createGrantTable },
    { validateHostContract, validateHostSession },
  ] = await Promise.all([
    import("@wenshu/project-storage"),
    import("@wenshu/host-contract"),
  ]);
  return { createFileHost, createGrantTable, validateHostContract, validateHostSession };
}

function hostDialog(window) {
  return async function selectDirectory(purpose) {
    const result = await dialog.showOpenDialog(window, {
      properties: ["openDirectory"],
      title: purpose === undefined ? "选择项目目录" : purpose,
    });
    if (result.canceled) {
      return { status: "cancelled" };
    }
    const [selected] = result.filePaths;
    if (selected === undefined) {
      return { status: "denied" };
    }
    return {
      status: "selected",
      root: selected,
      displayName: "electron-directory",
    };
  };
}

function hostFileDialog(window) {
  return async function selectFiles(request) {
    const result = await dialog.showOpenDialog(window, {
      title: request.purpose === undefined ? "选择导入文件" : request.purpose,
      properties: request.multiple
        ? ["openFile", "multiSelections"]
        : ["openFile"],
      ...(request.extensions === undefined
        ? {}
        : {
            filters: request.extensions.map((extension) => ({
              name: extension,
              extensions: [extension],
            })),
          }),
    });
    if (result.canceled) {
      return { status: "cancelled" };
    }
    return { status: "selected", files: result.filePaths };
  };
}

const printPdfCapability = Object.freeze({
  name: "print.pdf.export",
  capability_version: "0.1.0",
  support_status: "supported",
  permission_status: "not_applicable",
  input_schema: "wenshu.host.input.print.pdf.export/0.1.0",
  output_schema: "wenshu.host.output.print.pdf.export/0.1.0",
  limits: { max_concurrent_requests: 1, timeout_ms: 300000, max_payload_bytes: 0 },
  lifecycle: "request",
  cancellation: "none",
  progress: "none",
  error_codes: ["HOST_INVALID_REQUEST", "HOST_INTERNAL"],
  fallback: { strategy: "none", reason_code: "ELECTRON_PRINT_AVAILABLE" },
});

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
    const [
      {
        validateHostContract,
        validateHostSession,
        createFileHost,
        createGrantTable,
      },
      window,
    ] = await Promise.all([loadHostModules(), createWindow()]);
    // A-02 (ADR-0029 §4): one shared grant table so file.import.select FileGrants
    // and directory.select grants are visible to the orchestration channels.
    const grants = createGrantTable();
    const fileHost = await createFileHost({
      hostKind: "electron",
      hostVersion: app.getVersion(),
      instanceId,
      selectDirectory: hostDialog(window),
      selectFiles: hostFileDialog(window),
      grants,
      additionalDeclarations: [printPdfCapability],
    });

    const registryValidation = validateHostContract(fileHost.registry);
    if (!registryValidation.ok) {
      throw new Error(
        `invalid electron host registry: ${registryValidation.issues[0]?.code}`,
      );
    }

    ipcMain.handle("wenshu.host.registry", () => fileHost.registry);
    ipcMain.handle("wenshu.host.invoke", (_event, request) => {
      if (request?.capability === "print.pdf.export") {
        return handlePrintPdf(request);
      }
      return fileHost.invoke(request);
    });
    ipcMain.handle("wenshu.host.cancel", (_event, request) => fileHost.cancel(request));
    registerProjectChannels(ipcMain, window, { grants });

    async function handlePrintPdf(request) {
      const targetWindow =
        BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
      if (targetWindow === undefined) {
        throw new Error("electron host has no reverify window");
      }
      const pdf = await targetWindow.webContents.printToPDF({
        printBackground: true,
      });
      const response = Object.freeze({
        protocol_version: "0.1.0",
        kind: "success",
        request_id: request.request_id,
        capability: "print.pdf.export",
        output: Object.freeze({
          sha256: createHash("sha256").update(pdf).digest("hex"),
        }),
      });
      const session = validateHostSession(fileHost.registry, [request, response]);
      if (!session.ok)
        throw new Error(`invalid electron host session: ${session.issues[0]?.code}`);
      return response;
    }

    if (globalThis.process.argv.includes("--reverify")) {
      const pdfRequest = {
        protocol_version: "0.1.0",
        kind: "request",
        request_id: "req_14e00000000000000000000000000000",
        capability: "print.pdf.export",
        capability_version: "0.1.0",
        input: {},
      };
      const proof = await window.webContents.executeJavaScript(
        `Promise.all([
          window.wenshuHost.registry(),
          window.wenshuHost.invoke(${JSON.stringify(pdfRequest)}),
          typeof require,
          typeof process,
          Object.keys(window.wenshuHost).sort()
        ])`,
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
      const pdfResponse = {
        protocol_version: "0.1.0",
        kind: "success",
        request_id: pdfRequest.request_id,
        capability: "print.pdf.export",
        output: Object.freeze({
          sha256: createHash("sha256").update(output.pdfBytes).digest("hex"),
        }),
      };
      const session = validateHostSession(fileHost.registry, [pdfRequest, pdfResponse]);
      if (!session.ok)
        throw new Error(`invalid electron host session: ${session.issues[0]?.code}`);
      globalThis.process.stdout.write(`${JSON.stringify(evidence)}\n`);
      app.exit(0);
    }
  })
  .catch((error) => {
    globalThis.process.stderr.write(`Electron PB-10 host failed: ${String(error)}\n`);
    app.exit(1);
  });
