import { mountPrototype } from "./prototype/mount.ts";

const root = document.querySelector<HTMLElement>("#app");

if (root === null) {
  throw new Error("Missing application root");
}

mountPrototype(root);
