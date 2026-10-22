// A desktop process can outlive the terminal/parent that launched it. Chromium
// and Electron also write warnings to these streams. A closed output pipe must
// never become an uncaught main-process exception or a recurring error dialog.
export function guardOutput(stream: NodeJS.WritableStream) {
  stream.on('error', () => {
    // stdout/stderr are optional diagnostics. Game logs use a separate file
    // stream with its own explicit error handling in Launcher.
  });
}
guardOutput(process.stdout);
guardOutput(process.stderr);
