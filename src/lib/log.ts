// Diagnostics go to stderr so stdout stays clean for JSON/YAML piping by AI callers.
export function warn(msg: string): void {
  process.stderr.write(`x: ${msg}\n`);
}
export function info(msg: string): void {
  if (process.stderr.isTTY) process.stderr.write(`x: ${msg}\n`);
}
