# Autumn Launcher

A minimal Windows x64 desktop launcher for locally installed Minecraft: Java Edition instances, built with Electron, React, TypeScript, MSAL Node and XMCL.

## Personal practice project and image notice

This is a personal practice project for learning purposes only. It is strictly non-commercial. No fees will be charged in any form.

All third-party images and trademarks belong to their respective rights holders. If any image used by this launcher infringes your rights, please [contact the maintainer by opening an issue](https://github.com/Cherishealer/autumn-launcher/issues). We sincerely apologize for any infringement and will remove the identified image assets from the launcher within 24 hours of receiving your notification.

## Project status

Version: **0.1.7**, under development.

Microsoft browser authorization and Xbox authentication reach Minecraft Services, which currently returns HTTP 403 / Invalid app registration. Minecraft API application access approval is pending. Complete account sign-in, token refresh, player skin retrieval and real game launches have not yet passed end-to-end validation.

The repository contains the actual implementation, build configuration, interface assets and 49 automated tests. Authentication tests use the installed MSAL and XMCL implementations with isolated synthetic HTTP responses; they do not establish live application approval.

- [Authentication purpose, service endpoints and local data handling](AUTHENTICATION.md)
- [Validation record and known limitations](VALIDATION.md)

## Features

- Scan standard local Minecraft directories and parse installed Vanilla, Fabric, Forge and NeoForge versions using Java 17 or newer, including modern snapshots with standard metadata.
- Window resizing keeps a 16:9 aspect ratio. Plain clicks and small pointer jitter do not initiate window dragging. Browser zoom is disabled.
- Settings dropdown arrows use a consistent inset from the field edge. Dialog content reserves space for the top focus outline.
- Choose Simplified Chinese or English in settings. The first run defaults to Chinese for Chinese system languages and English otherwise; saved choices take precedence.
- Create isolated game directories with per-instance names, icons, Java paths and memory settings.
- Right-click an instance for Launch, Edit and Remove actions. Hold its icon for 350 ms, then drag to reorder; the order is saved automatically.
- Sign in from the avatar button through Microsoft's official browser-based device-code flow.
- Verify Minecraft Java Edition entitlement and retrieve the player's UUID, name and skin.
- Launch through XMCL with the selected Java runtime and instance directory.
- Show the latest startup log, then keep the status at **Instance is Running.** or **Launch Failed.** Normal game exit restores **Ready to launch.**
- Check dependencies and download missing resources with integrity verification.
- Configure direct, system, HTTP or unauthenticated SOCKS5 networking for launcher requests.

Feature implementation is separate from live validation; see the validation record for current acceptance limits.

## Development

Requirements: Windows x64, Node.js 22.12 or newer, npm and a Java runtime appropriate for the installed Minecraft version.

    npm ci
    npm run dev

Type checking, production build and tests:

    npm run build
    npm test
    npm start

Build a Windows x64 portable executable:

    npm run package

The portable executable is generated under release/Autumn-Launcher-0.1.7-x64.exe. The unpacked application is generated under release/win-unpacked/ and requires all adjacent runtime files. Generated executables, build output and node_modules are excluded from this source repository. The application/window icon is generated from the bundled grass-block SVG; run npm run generate:icon after changing that SVG.

The initial dependency installation may download Electron's official runtime. Configure the Electron downloader's supported proxy environment variables if your network requires a proxy.

## Basic use

1. Select the sidebar plus button. Scan a standard Minecraft root or choose a folder containing versions, libraries and assets.
2. Select an installed version that passes basic checks and create an instance. New instances use separate game directories for mods, settings and saves.
3. Open settings and select a Windows x64 Java runtime suitable for that version. Configure memory globally or override it per instance.
4. In settings, choose the interface language if desired.
5. Select the avatar button to start Microsoft sign-in. Account credentials are entered on Microsoft's official website.
6. Select Play. The startup status follows actual game output and XMCL's game-window-ready event. Select the status line to open detailed logs.
7. Click the instance title or its edit button to edit its settings. Right-click a sidebar icon for Launch and Edit, followed by a divider and Remove. Removing an instance record requires confirmation and preserves game data.
8. Hold a sidebar icon for 350 ms, then drag it to change its position. Release inside the list to save the order; press Escape or release outside the list to cancel. The list scrolls when the dragged icon reaches its top or bottom edge.

## Application registration and Microsoft sign-in

This source build does not embed a Microsoft application Client ID. The ID identifies the launcher application and is not a player's email, password or Minecraft UUID. For developer setup, configure the ID in advanced settings or set MICROSOFT_CLIENT_ID before the first run. Existing saved settings take precedence.

The application registration must allow personal Microsoft accounts and public-client flows. The launcher uses MSAL's device-code flow with XboxLive.signin, then XMCL for Xbox Live, XSTS and Minecraft token exchange. It checks Java Edition entitlement and the Minecraft profile before making game-launch credentials available.

Minecraft API access also requires approval for the application's Client ID. The developer submits the application for review; production users should not need to register individual applications. If Minecraft Services returns Invalid app registration, repeated player authorization does not resolve application access approval.

- [Microsoft application registration](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app)
- [Microsoft device-code flow](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-device-code)
- [Minecraft application access request](https://aka.ms/mce-reviewappid)
- [Developer documentation on Minecraft API permission](https://minecraft-launcher-lib.readthedocs.io/en/stable/tutorial/microsoft_login.html#apply-for-permission)

The launcher has no Microsoft password entry form. MSAL cache and proxy passwords are encrypted locally with Electron safeStorage on Windows. Access tokens remain in the main process and are not sent to React or written into ordinary configuration. Logout clears stored account credentials. See AUTHENTICATION.md for details.

## Data and scope

Application settings and instance records are stored under the local user-data directory, normally %APPDATA%/autumn-minecraft-launcher. Configuration is in config.json; account.bin and proxy.bin contain encrypted credentials. Instances, icons and game logs are stored separately. User data and credentials are excluded from this repository.

Changing the default instance location does not move existing instances. Removing a record does not delete its directory. Closing the launcher does not terminate an active game; reopening does not attach to an already running game process.

Installed metadata entries are classified as ready, repairable or unavailable. Repairable entries can be selected; their first launch verifies and downloads missing client JARs, dependencies and assets using the existing metadata and checksum checks. Downloads may be large. Existing corrupted files are not overwritten. Asset indexes with reused IDs are stored under their expected hashes when needed, preserving the conventional index used by other versions. Unfinished loader processing and existing corrupt files still require the original installer. The launcher does not provide a full version installation catalog.

Quilt, OptiFine, nonstandard MultiMC metadata, unknown custom launch chains and older Java launch chains are outside the current scope. Launcher proxy settings do not proxy the Java game's traffic. HTTP proxy authentication is supported; SOCKS5 authentication is not.

There are no advertising, telemetry, marketplace or offline-authentication substitute features. Portable builds are not code-signed. Interface assets originate from the supplied Figma design; their inclusion does not grant independent rights to third-party artwork or trademarks. Autumn Launcher is not affiliated with or endorsed by Mojang or Microsoft.

## Dependency compatibility

The lockfile pins dependencies. The project currently uses XMCL core 2.16.2, installer 6.3.6 and user 4.4.2, plus MSAL Node 7.1.0.

The install script applies three narrow compatibility fixes for the published XMCL packages:

- Resolve the unzip package's workspace dependency to the published @xmcl/yauzl 2.10.0 package.
- Correct @xmcl/unzip's entry point from its unpublished TypeScript source to its existing dist output.
- Restore the upstream isNotNull export required by the installer's missing @xmcl/core/utils subpath.

Review these workarounds when upgrading XMCL. Game parsing, authentication and launch logic continue to use XMCL.

## Source layout

- electron/: main-process services, authentication, storage, scanning and launch logic.
- src/: React interface and styling.
- shared/: IPC types and launch-state transitions.
- tests/: automated regressions.
- scripts/: development, compatibility and diagnostic tools.
- public/assets/: interface assets.
