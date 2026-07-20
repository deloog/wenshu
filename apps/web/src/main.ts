const root = document.querySelector<HTMLElement>("#app");

if (root === null) {
  throw new Error("Missing application root");
}

root.textContent = "文枢工程底座";
