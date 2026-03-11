{
  description = "NslNotes - Local-first plain-text knowledge tool";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    rust-overlay = {
      url = "github:oxalica/rust-overlay";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { self, nixpkgs, flake-utils, rust-overlay }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        overlays = [ (import rust-overlay) ];
        pkgs = import nixpkgs {
          inherit system overlays;
        };

        # Rust toolchain - stable with additional components
        rustToolchain = pkgs.rust-bin.stable.latest.default.override {
          extensions = [ "rust-src" "rust-analyzer" "clippy" "rustfmt" ];
        };

        # Common build inputs for both shell and package
        commonBuildInputs = with pkgs; [
          # Rust toolchain
          rustToolchain
          cargo-watch
          cargo-tauri

          # Node.js for frontend
          nodejs_20
          nodePackages.npm

          # Tauri system dependencies (Linux)
          pkg-config
          openssl
          glib
          gtk3
          libsoup_3
          webkitgtk_4_1
          librsvg

          # Additional build tools
          gcc
          gnumake

          # Development utilities
          jq
          curl
        ];

        # Environment variables for Tauri on Linux
        tauriEnvVars = {
          # WebKit / GTK
          GIO_MODULE_DIR = "${pkgs.glib-networking}/lib/gio/modules";

          # For pkg-config to find libraries
          PKG_CONFIG_PATH = pkgs.lib.makeSearchPath "lib/pkgconfig" [
            pkgs.openssl.dev
            pkgs.glib.dev
            pkgs.gtk3.dev
            pkgs.libsoup_3.dev
            pkgs.webkitgtk_4_1.dev
          ];
        };

      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = commonBuildInputs ++ (with pkgs; [
            # Additional dev tools
            git

            # Playwright dependencies for E2E testing
            playwright-driver.browsers
          ]);

          shellHook = ''
            # Set Tauri environment variables
            export GIO_MODULE_DIR="${pkgs.glib-networking}/lib/gio/modules"

            # Ensure npm binaries are in PATH
            export PATH="$PWD/node_modules/.bin:$PATH"

            # Playwright browser path
            export PLAYWRIGHT_BROWSERS_PATH="${pkgs.playwright-driver.browsers}"
            export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

            # Rust source for rust-analyzer
            export RUST_SRC_PATH="${rustToolchain}/lib/rustlib/src/rust/library"

            # Library paths for Tauri runtime
            export LD_LIBRARY_PATH="${pkgs.lib.makeLibraryPath [
              pkgs.gtk3
              pkgs.glib
              pkgs.webkitgtk_4_1
              pkgs.libsoup_3
              pkgs.openssl
            ]}:$LD_LIBRARY_PATH"

            echo "NslNotes development environment loaded"
            echo ""
            echo "Available commands:"
            echo "  npm install     - Install frontend dependencies"
            echo "  npm run dev     - Start Vite dev server"
            echo "  cargo tauri dev - Start Tauri dev mode"
            echo "  cargo check     - Check Rust code"
            echo "  cargo clippy    - Lint Rust code"
            echo ""
          '';
        };

        # Package definition (for future builds)
        packages.default = pkgs.stdenv.mkDerivation {
          pname = "nslnotes";
          version = "0.1.0";
          src = ./.;

          nativeBuildInputs = commonBuildInputs;

          buildPhase = ''
            npm ci
            npm run build
            cargo tauri build
          '';

          installPhase = ''
            mkdir -p $out/bin
            cp src-tauri/target/release/nslnotes $out/bin/
          '';
        };
      }
    );
}
