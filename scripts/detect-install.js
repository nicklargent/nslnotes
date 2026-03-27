import { execSync } from "node:child_process";
import { platform } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// On NixOS, the install script won't work — use `nix profile install .` instead
import { readFileSync } from "node:fs";
try {
  const osRelease = readFileSync("/etc/os-release", "utf-8");
  if (osRelease.includes('ID=nixos')) {
    console.log("NixOS detected.");
    console.log("Use `nix profile install .` instead.");
    process.exit(0);
  }
} catch {
  // Not NixOS or no /etc/os-release — continue
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
