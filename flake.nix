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

        # Single source of truth: read version from package.json so a single
        # `npm version` bump propagates to nix store paths and `nix profile list`.
        version = (builtins.fromJSON (builtins.readFile ./package.json)).version;

        # Rust toolchain - stable with additional components
        rustToolchain = pkgs.rust-bin.stable.latest.default.override {
          extensions = [ "rust-src" "rust-analyzer" "clippy" "rustfmt" ];
        };

        isLinux = pkgs.stdenv.isLinux;

        # Linux-only Tauri system dependencies
        linuxBuildInputs = with pkgs; lib.optionals isLinux [
          pkg-config
          openssl
          glib
          gtk3
          libsoup_3
          webkitgtk_4_1
          librsvg
          gsettings-desktop-schemas
          glib-networking
          gcc
          gnumake
          xdg-utils

          # libsmbclient for the `smb` feature in nslnotes-web. pavao-sys
          # uses pkg-config to find the headers; without this `cargo build
          # -p nslnotes-web` fails with "smbclient.h not found" on NixOS.
          # Linux-only: nixpkgs samba currently fails to build on Darwin,
          # and the smb feature isn't used on macOS.
          samba
        ];

        # Common build inputs for both shell and package
        commonBuildInputs = with pkgs; [
          # Rust toolchain
          rustToolchain
          cargo-watch
          cargo-tauri

          # Node.js for frontend
          nodejs_20
          nodePackages.npm

          # Development utilities
          jq
          curl
        ] ++ linuxBuildInputs;

        # Prefetch npm dependencies for offline build
        npmDeps = pkgs.fetchNpmDeps {
          src = ./.;
          hash = "sha256-xBuTi4zW/mHvWsK4dw1h9oB/vOg1tfMskaCf3elVpk4=";
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
            # Ensure npm binaries are in PATH
            export PATH="$PWD/node_modules/.bin:$PATH"

            # Playwright browser path
            export PLAYWRIGHT_BROWSERS_PATH="${pkgs.playwright-driver.browsers}"
            export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

            # Rust source for rust-analyzer
            export RUST_SRC_PATH="${rustToolchain}/lib/rustlib/src/rust/library"

            ${pkgs.lib.optionalString isLinux ''
              export GIO_MODULE_DIR="${pkgs.glib-networking}/lib/gio/modules"
              export GIO_EXTRA_MODULES="${pkgs.glib-networking}/lib/gio/modules"
              export XDG_DATA_DIRS="${pkgs.gsettings-desktop-schemas}/share/gsettings-schemas/${pkgs.gsettings-desktop-schemas.name}:${pkgs.gtk3}/share/gsettings-schemas/${pkgs.gtk3.name}:$XDG_DATA_DIRS"
              export LD_LIBRARY_PATH="${pkgs.lib.makeLibraryPath [
                pkgs.gtk3
                pkgs.glib
                pkgs.webkitgtk_4_1
                pkgs.libsoup_3
                pkgs.openssl
              ]}:$LD_LIBRARY_PATH"
              export PKG_CONFIG_PATH="${pkgs.lib.makeSearchPath "lib/pkgconfig" [
                pkgs.openssl.dev
                pkgs.glib.dev
                pkgs.gtk3.dev
                pkgs.libsoup_3.dev
                pkgs.webkitgtk_4_1.dev
              ]}"
            ''}

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

        # Package definition
        packages.default = pkgs.rustPlatform.buildRustPackage {
          pname = "nslnotes";
          inherit version;
          src = ./.;

          cargoHash = "sha256-blTDj1jQs0CQVVdAOMSELkOI+dspWSPIA000SDC0lT8=";

          nativeBuildInputs = with pkgs; [
            pkg-config
            nodejs_20
            nodePackages.npm
            npmHooks.npmConfigHook
            cargo-tauri
          ] ++ lib.optionals isLinux [
            wrapGAppsHook3
            gobject-introspection
          ];

          buildInputs = with pkgs; [
            openssl
          ] ++ lib.optionals isLinux [
            glib
            gtk3
            libsoup_3
            webkitgtk_4_1
            librsvg
            gsettings-desktop-schemas
            glib-networking
          ];

          inherit npmDeps;

          # Override build phase to use `cargo tauri build` which properly
          # embeds frontend assets into the binary
          buildPhase = ''
            runHook preBuild
            npm run build
            cargo tauri build --no-bundle
            runHook postBuild
          '';

          # Skip default cargo test (needs runtime deps)
          doCheck = false;

          # Override install phase since we're not using cargoInstallHook
          installPhase = ''
            runHook preInstall
            mkdir -p $out/bin
            cp target/release/nslnotes-tauri $out/bin/nslnotes

            mkdir -p $out/share/applications
            cat > $out/share/applications/NslNotes.desktop <<'DESKTOP'
[Desktop Entry]
Name=NslNotes
Comment=Local-first, plain-text knowledge tool
Exec=nslnotes
Icon=nslnotes
Terminal=false
Type=Application
Categories=Office;Utility;
DESKTOP

            mkdir -p $out/share/icons/hicolor/128x128/apps
            cp src-tauri/icons/128x128.png $out/share/icons/hicolor/128x128/apps/nslnotes.png
            runHook postInstall
          '';
        };

        # Web server package
        packages.web = pkgs.rustPlatform.buildRustPackage {
          pname = "nslnotes-web";
          inherit version;
          src = ./.;

          cargoHash = "sha256-blTDj1jQs0CQVVdAOMSELkOI+dspWSPIA000SDC0lT8=";

          nativeBuildInputs = with pkgs; [
            pkg-config
            nodejs_20
            nodePackages.npm
            npmHooks.npmConfigHook
          ];

          buildInputs = with pkgs; [
            openssl
          ];

          inherit npmDeps;

          buildPhase = ''
            runHook preBuild
            npm run build
            cargo build --release -p nslnotes-web
            runHook postBuild
          '';

          doCheck = false;

          installPhase = ''
            runHook preInstall
            mkdir -p $out/bin
            cp target/release/nslnotes-web $out/bin/nslnotes-web

            mkdir -p $out/lib/systemd/user
            cat > $out/lib/systemd/user/nslnotes-web.service <<EOF
[Unit]
Description=NslNotes Web Server
After=network.target

[Service]
ExecStart=$out/bin/nslnotes-web
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
EOF
            runHook postInstall
          '';
        };
      }
    );
}
