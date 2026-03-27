import { execSync } from "node:child_process";
import { platform } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Block only inside Nix build sandbox (not dev shells, which are fine)
if (process.env.NIX_BUILD_TOP) {
  console.log("Nix build sandbox detected.");
  console.log("Use `nix profile install .` instead.");
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
