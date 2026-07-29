const { writeFile } = require("node:fs/promises");

function electronPrintOptions(params) {
  return Object.freeze({
    landscape: false,
    displayHeaderFooter: false,
    printBackground: params.printBackground === true,
    scale: params.scale,
    pageSize: Object.freeze({ width: params.paperWidth, height: params.paperHeight }),
    margins: Object.freeze({
      top: params.marginTop,
      bottom: params.marginBottom,
      left: params.marginLeft,
      right: params.marginRight,
    }),
    preferCSSPageSize: params.preferCSSPageSize === true,
    generateTaggedPDF: params.generateTaggedPDF === true,
    generateDocumentOutline: params.generateDocumentOutline === true,
  });
}

function createElectronSession(BrowserWindow, app, preferences) {
  const window = new BrowserWindow({ show: false, webPreferences: preferences });
  return Object.freeze({
    navigate: async (url) => window.loadURL(url),
    evaluate: async (expression) =>
      window.webContents.executeJavaScript(expression, true),
    screenshot: async (filePath) => {
      const image = await window.webContents.capturePage();
      await writeFile(filePath, image.toPNG());
    },
    printToPdf: async (params) =>
      new Uint8Array(await window.webContents.printToPDF(electronPrintOptions(params))),
    productVersion: async () =>
      `Electron/${app.getVersion()} Chromium/${globalThis.process.versions.chrome}`,
    close: async () => {
      if (!window.isDestroyed()) window.destroy();
    },
  });
}

module.exports = { createElectronSession };
