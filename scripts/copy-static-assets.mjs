import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const copies = [
  ["client/static/domino-mesa", "dist/public/domino-mesa"],
  ["shared", "dist/public/shared"],
];

for (const [from, to] of copies) {
  const source = path.resolve(root, from);
  const target = path.resolve(root, to);

  if (!fs.existsSync(source)) {
    throw new Error(`Static asset source not found: ${source}`);
  }

  fs.rmSync(target, { recursive: true, force: true });
  fs.cpSync(source, target, { recursive: true });
}
