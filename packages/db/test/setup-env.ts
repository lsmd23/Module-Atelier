import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Vitest does not read the repository .env on its own; explicit shell
// variables still win because loadEnvFile does not overwrite them.
const rootEnvFile = fileURLToPath(new URL("../../../.env", import.meta.url));

if (existsSync(rootEnvFile)) {
  process.loadEnvFile(rootEnvFile);
}