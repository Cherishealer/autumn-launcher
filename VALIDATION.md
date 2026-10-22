# Validation record

Last updated: 2026-10-22. Current version: **0.1.5**.

## Passed checks

- Frontend and Electron TypeScript checks and Vite production build.
- 38 automated tests covering Microsoft OAuth response validation, trusted verification URLs, legacy verification_url compatibility, device-code callbacks, cancellation, concurrent attempts, actual MSAL request normalization, actual XMCL exchange handling, stage-specific errors and sensitive-response redaction.
- Launch-state tests for latest startup output, stable running/failed status, rejection of stale events and normal/abnormal exits.
- JVM argument, path-boundary, IPC input and detached-console EPIPE regressions.
- Windows Electron backend checks with isolated fixtures: configuration persistence, encrypted credential round trip, absence of plaintext test credentials and compatibility with older encrypted files.
- Synthetic Vanilla/Fabric/NeoForge inheritance parsing and classification; rejection of cycles and traversal; incomplete versions are never reported as runnable.
- Actual local metadata scanning identified a basically complete Vanilla 1.19.2 installation and incomplete Fabric metadata. This does not establish a successful game launch.
- Windows x64 portable packaging. The packaged app.asar contains version 0.1.4, dependency compatibility fixes and the production stage-specific authentication handler.

Tests of authentication success and failure use synthetic responses and no real player credentials. They do not establish platform approval or live sign-in success.

## Live authentication status

A real initial device-code request first returned HTTP 401 / AADSTS70002 until public-client flows were enabled in the application registration. A later request returned HTTP 200 and reached the MSAL device-code callback; that diagnostic stopped before account sign-in.

The developer subsequently completed browser authorization in the launcher. Microsoft and Xbox authentication reached Minecraft Services, where /authentication/login_with_xbox returned HTTP 403 with Invalid app registration. Minecraft API application access approval is pending.

Complete account login, silent refresh, entitlement/profile acceptance and real player skin retrieval have not yet passed end-to-end validation.

## Unverified acceptance criteria

- Actual Vanilla, Fabric and NeoForge client startup, running and exit.
- Full missing-resource download/repair behavior and each proxy mode in real network environments.
- Broader instance-icon, long-list, resizing and dialog interaction coverage.

No real NeoForge installation was found during local inspection; its metadata support was checked with synthetic fixtures only.

## Fix history

### 0.1.1: detached console errors

Deprecated synchronous credential decryption emitted a warning into a disconnected console pipe and could raise an uncaught EPIPE error. The main process now installs stdout/stderr handlers first and uses Electron 45's asynchronous safeStorage APIs. Existing encrypted files remain readable. Game-log file failures remain explicit.

### 0.1.2: device-code request cancellation

A getter-only cancel property caused MSAL's request normalization to throw. The launcher and SDK now share an ordinary mutable request. Regressions cover callback delivery, cancellation during initialization/polling, duplicate attempts and retries.

### 0.1.3: Microsoft error responses and invalid URLs

A Microsoft 401 error response was previously treated as successful device-code data, yielding an undefined verification URL. The HTTP adapter now validates errors and successful response fields before callbacks or browser opening. Error types remain compatible with MSAL so specific failures are not reduced to a generic network error.

### 0.1.4: Xbox and Minecraft failure stages

The earlier generic message combined Xbox profile restrictions and Minecraft application approval. Failures now identify the actual user/device/XSTS/token/entitlement/profile stage and retain numeric HTTP/XErr codes without exposing raw service bodies. Only an explicit Minecraft login 403 containing Invalid app registration is classified as an application-registration refusal. Unknown 403 responses retain uncertainty. Silent refresh preserves the same diagnosis.

## Known scope limits

Missing client JARs, dependencies and resources can be repaired from existing verified metadata. Existing corrupt files are preserved, and a complete game-version installer is not provided. Quilt, OptiFine, nonstandard MultiMC metadata, older Java launch chains and unknown custom launch chains are outside the current scope. Java game-traffic proxying, SOCKS5 authentication, save migration and game-directory cleanup are not provided. The application is not code-signed.

## Local portable artifact

The generated 0.1.4 portable executable has SHA-256:

    10ca5829b1a26d3a880ce3d70e836b012a340aff7b032cc3efaee11bcb5e59df

Generated binaries are excluded from this source repository. This hash records the locally produced artifact and does not imply that a GitHub Release has been published.

## 0.1.5: language, interaction and local version discovery

- Added Simplified Chinese and English UI strings, language persistence and migration of older settings. The initial default uses Electron’s preferred system language: Chinese systems use Chinese; all others use English. Explicit saved choices are preserved. User-provided names, paths and raw game output remain unchanged.
- Added direct instance-title editing, consistent square sidebar interaction areas, softer selected borders and bounded instance artwork based on the grass SVG’s visible bounds. The signed-out avatar is smaller and centered. Main-view text cannot be selected; text inputs and device codes remain selectable.
- Added pointer-driven dragging across noninteractive main-window areas, using OS DIP cursor coordinates for Windows display scaling. Controls, editable/copyable content and scrollable regions are excluded, and movement stops on pointer release, loss of focus or window closure.
- Added reproducible PNG/ICO generation from the existing grass SVG, a BrowserWindow icon and Windows packaging icon configuration. No portable build is uploaded with this source update.
- Ready and repairable local versions are now selectable. Modern snapshots are identified by their metadata/runtime rather than a hardcoded release-name list. Existing standard Forge installations are recognized.
- A reused asset-index ID no longer forces replacement of an existing index. Missing version-specific indexes use checksum-based filenames consistently in diagnosis, download plans and game launch arguments. Missing client JARs can be downloaded from existing checksum-bearing metadata; existing corrupt files and unfinished loader processing remain blocked.
- Read-only rescanning of the same local root found 17 entries: 2 ready and 15 repairable, rather than only one selectable version. No user game files were changed during scanning. This is not a real game-launch result.
- Added regression coverage for system-language selection, settings migration/override persistence, composed English diagnostics, snapshot recognition, missing-versus-corrupt clients, non-overwriting asset-index repair and Forge classification.

The dialog close button now has the same rounded-square hover color as the main-window close control. Windows icon assets include seven ICO sizes derived from the bundled grass SVG. Automated window-drag coverage verifies OS-coordinate deltas and release/focus cleanup.

The isolated Windows UI check confirmed Chinese/English settings, persisted English after reopening, direct title editing, 80 × 80 sidebar hit areas, bounded 56-pixel icon artwork, dialog close hover, and pointer-driven window movement. A quick drag changed the window from (640, 336) to (740, 376) in DIP coordinates. UI checks used fixture instances, the production renderer/preload and isolated settings; no real account login or game launch was simulated as a successful acceptance result.
