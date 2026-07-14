import { test } from "node:test";
import { strict as nodeAssert } from "node:assert";
import { inspect } from "node:util";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Path } from "./mod.ts";

export const isWindows: boolean = process.platform === "win32";

export { inspect, test };

export function cwd(): string {
  return process.cwd();
}

export function chdir(path: string): void {
  process.chdir(path);
}

export function assert(cond: unknown, msg?: string): asserts cond {
  nodeAssert.ok(cond, msg);
}

export function assertEquals<T>(actual: T, expected: T, msg?: string): void {
  nodeAssert.deepStrictEqual(actual, expected, msg);
}

// deno-lint-ignore no-explicit-any
type ErrorCtor = new (...args: any[]) => Error;

export function assertThrows(
  fn: () => unknown,
  errorClass?: ErrorCtor,
  msgIncludes?: string,
): Error {
  let thrown: unknown;
  let threw = false;
  try {
    fn();
  } catch (err) {
    thrown = err;
    threw = true;
  }
  if (!threw) throw new Error("Expected function to throw.");
  return checkError(thrown, errorClass, msgIncludes);
}

export async function assertRejects(
  fn: () => Promise<unknown>,
  errorClass?: ErrorCtor,
  msgIncludes?: string,
): Promise<Error> {
  let thrown: unknown;
  let threw = false;
  try {
    await fn();
  } catch (err) {
    thrown = err;
    threw = true;
  }
  if (!threw) throw new Error("Expected promise to reject.");
  return checkError(thrown, errorClass, msgIncludes);
}

function checkError(
  thrown: unknown,
  errorClass: ErrorCtor | undefined,
  msgIncludes: string | undefined,
): Error {
  if (errorClass != null && !(thrown instanceof errorClass)) {
    const actualName = (thrown as { constructor?: { name?: string } })
      ?.constructor?.name ?? typeof thrown;
    throw new Error(
      `Expected error to be instance of '${errorClass.name}', got '${actualName}'.`,
    );
  }
  const message = (thrown as Error)?.message ?? "";
  if (msgIncludes != null && !message.includes(msgIncludes)) {
    throw new Error(
      `Expected error message to include '${msgIncludes}', got '${message}'.`,
    );
  }
  return thrown as Error;
}

export async function withTempDir(
  action: (path: Path) => Promise<void> | void,
): Promise<void> {
  const originalDir = cwd();
  // canonicalize with the native realpath so 8.3 short names
  // like RUNNER~1 on the GH actions CI are expanded
  const dirPath = realpathSync.native(
    mkdtempSync(join(tmpdir(), "david-path-test-")),
  );
  chdir(dirPath);
  try {
    await action(new Path(dirPath).resolve());
  } finally {
    chdir(originalDir);
    try {
      rmSync(dirPath, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}
