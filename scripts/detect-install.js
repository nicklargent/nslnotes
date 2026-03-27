import { execSync } from "node:child_process";
import { platform } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Check if running in Nix environment
if (process.env.IN_NIX_SHELL || process.env.NIX_BUILD_TOP) {
  console.log("Nix environment detected.");
  console.log("Use `nix build` or `nix profile install .` instead.");
  process.exit(0);
}

const os = platform();

if (os === "win32") {
  const script = join(__dirname, "install.ps1");
  execSync(`powershell -ExecutionPolicy Bypass -File "${script}"`, {
    stdio: "inherit",
  });
} else {
  const script = join(__dirname, "install.sh");
  execSync(`bash "${script}"`, { stdio: "inherit" });
}
