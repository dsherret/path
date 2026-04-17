import fs from "node:fs";
import fsPromises from "node:fs/promises";
import { dirname, join } from "node:path";

/** Information about a file or directory. Shape matches `node:fs` `Stats`. */
export interface FileInfo {
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
  size: number;
  mtime: Date;
  atime: Date;
  birthtime: Date;
  dev: number;
  ino: number;
  mode: number;
  nlink: number;
  uid: number;
  gid: number;
}

/** A directory entry returned by readDir. Shape matches `node:fs` `Dirent`. */
export interface DirEntryInfo {
  name: string;
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
}

export interface MkdirOptions {
  recursive?: boolean;
  mode?: number;
}

export interface OpenOptions {
  read?: boolean;
  write?: boolean;
  create?: boolean;
  createNew?: boolean;
  append?: boolean;
  truncate?: boolean;
  mode?: number;
}

export interface WriteFileOptions {
  append?: boolean;
  create?: boolean;
  createNew?: boolean;
  mode?: number;
  signal?: AbortSignal;
}

export interface RemoveOptions {
  recursive?: boolean;
}

export interface ReadFileOptions {
  signal?: AbortSignal;
}

/** Checks if an error is a "not found" error. */
export function isNotFoundError(err: unknown): boolean {
  // deno-lint-ignore no-explicit-any
  return (err as any)?.code === "ENOENT";
}

/** Creates a "not found" error. */
export function createNotFoundError(message: string): Error {
  const err = new Error(message);
  // deno-lint-ignore no-explicit-any
  (err as any).code = "ENOENT";
  return err;
}

/** Returns true if running on Windows. */
export function isWindows(): boolean {
  return process.platform === "win32";
}

/** A file handle backed by a Node.js file descriptor. */
export class FsFile {
  /** @internal */
  _fd: number;

  /** @internal */
  constructor(fd: number) {
    this._fd = fd;
  }

  write(data: Uint8Array): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      fs.write(
        this._fd,
        data,
        0,
        data.length,
        null,
        (err, written: number) => {
          if (err) reject(err);
          else resolve(written);
        },
      );
    });
  }

  writeSync(data: Uint8Array): number {
    return fs.writeSync(this._fd, data, 0, data.length);
  }

  close(): void {
    fs.closeSync(this._fd);
  }

  get writable(): WritableStream<Uint8Array> {
    const fd = this._fd;
    return new WritableStream({
      write(chunk) {
        return new Promise<void>((resolve, reject) => {
          fs.write(fd, chunk, 0, chunk.length, null, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      },
    });
  }

  get readable(): ReadableStream<Uint8Array> {
    const fd = this._fd;
    return new ReadableStream({
      pull(controller) {
        return new Promise<void>((resolve, reject) => {
          const buf = new Uint8Array(16384);
          fs.read(fd, buf, 0, buf.length, null, (err, bytesRead: number) => {
            if (err) {
              reject(err);
              return;
            }
            if (bytesRead === 0) {
              controller.close();
            } else {
              controller.enqueue(buf.subarray(0, bytesRead));
            }
            resolve();
          });
        });
      },
    });
  }
}

export function stat(path: string): Promise<FileInfo> {
  return fsPromises.stat(path);
}

export function statSync(path: string): FileInfo {
  return fs.statSync(path);
}

export function lstat(path: string): Promise<FileInfo> {
  return fsPromises.lstat(path);
}

export function lstatSync(path: string): FileInfo {
  return fs.lstatSync(path);
}

export function realPath(path: string): Promise<string> {
  return fsPromises.realpath(path);
}

export function realPathSync(path: string): string {
  return fs.realpathSync(path);
}

export async function mkdirFn(
  path: string,
  options?: MkdirOptions,
): Promise<void> {
  await fsPromises.mkdir(path, options);
}

export function mkdirSyncFn(path: string, options?: MkdirOptions): void {
  fs.mkdirSync(path, options);
}

export async function linkFn(oldPath: string, newPath: string): Promise<void> {
  await fsPromises.link(oldPath, newPath);
}

export function linkSyncFn(oldPath: string, newPath: string): void {
  fs.linkSync(oldPath, newPath);
}

export async function symlinkFn(
  target: string,
  path: string,
  type?: { type: "file" | "dir" | "junction" },
): Promise<void> {
  await fsPromises.symlink(target, path, type?.type);
}

export function symlinkSyncFn(
  target: string,
  path: string,
  type?: { type: "file" | "dir" | "junction" },
): void {
  fs.symlinkSync(target, path, type?.type);
}

export async function* readDir(path: string): AsyncGenerator<DirEntryInfo> {
  const entries = await fsPromises.readdir(path, { withFileTypes: true });
  yield* entries;
}

export function* readDirSync(path: string): Generator<DirEntryInfo> {
  yield* fs.readdirSync(path, { withFileTypes: true });
}

export async function readFile(
  path: string,
  options?: ReadFileOptions,
): Promise<Uint8Array> {
  return new Uint8Array(
    await fsPromises.readFile(path, { signal: options?.signal }),
  );
}

export function readFileSync(path: string): Uint8Array {
  return new Uint8Array(fs.readFileSync(path));
}

export function readTextFile(
  path: string,
  options?: ReadFileOptions,
): Promise<string> {
  return fsPromises.readFile(path, {
    encoding: "utf8",
    signal: options?.signal,
  });
}

export function readTextFileSync(path: string): string {
  return fs.readFileSync(path, "utf8");
}

export async function chmod(path: string, mode: number): Promise<void> {
  await fsPromises.chmod(path, mode);
}

export function chmodSync(path: string, mode: number): void {
  fs.chmodSync(path, mode);
}

export async function chown(
  path: string,
  uid: number | null,
  gid: number | null,
): Promise<void> {
  await fsPromises.chown(path, uid ?? -1, gid ?? -1);
}

export function chownSync(
  path: string,
  uid: number | null,
  gid: number | null,
): void {
  fs.chownSync(path, uid ?? -1, gid ?? -1);
}

export function openFile(
  path: string,
  options?: OpenOptions,
): Promise<FsFile> {
  return new Promise<FsFile>((resolve, reject) => {
    fs.open(path, openOptionsToFlags(options), options?.mode, (err, fd) => {
      if (err) reject(err);
      else resolve(new FsFile(fd));
    });
  });
}

export function openFileSync(path: string, options?: OpenOptions): FsFile {
  const fd = fs.openSync(path, openOptionsToFlags(options), options?.mode);
  return new FsFile(fd);
}

export function createFile(path: string): Promise<FsFile> {
  return openFile(path, {
    write: true,
    create: true,
    truncate: true,
    read: true,
  });
}

export function createFileSync(path: string): FsFile {
  return openFileSync(path, {
    write: true,
    create: true,
    truncate: true,
    read: true,
  });
}

export async function remove(
  path: string,
  options?: RemoveOptions,
): Promise<void> {
  if (options?.recursive) {
    await fsPromises.rm(path, { recursive: true });
    return;
  }
  // without `recursive`, remove files and empty directories only
  const info = await fsPromises.lstat(path);
  if (info.isDirectory()) {
    await fsPromises.rmdir(path);
  } else {
    await fsPromises.unlink(path);
  }
}

export function removeSync(path: string, options?: RemoveOptions): void {
  if (options?.recursive) {
    fs.rmSync(path, { recursive: true });
    return;
  }
  const info = fs.lstatSync(path);
  if (info.isDirectory()) {
    fs.rmdirSync(path);
  } else {
    fs.unlinkSync(path);
  }
}

export async function copyFileFn(src: string, dest: string): Promise<void> {
  await fsPromises.copyFile(src, dest);
}

export function copyFileSyncFn(src: string, dest: string): void {
  fs.copyFileSync(src, dest);
}

export async function renameFn(
  oldPath: string,
  newPath: string,
): Promise<void> {
  await fsPromises.rename(oldPath, newPath);
}

export function renameSyncFn(oldPath: string, newPath: string): void {
  fs.renameSync(oldPath, newPath);
}

export async function ensureDir(path: string): Promise<void> {
  await mkdirFn(path, { recursive: true });
}

export function ensureDirSync(path: string): void {
  mkdirSyncFn(path, { recursive: true });
}

export async function ensureFile(path: string): Promise<void> {
  const info = await lstatOrUndefined(path);
  if (info != null) {
    if (info.isFile()) return;
    throw new Error(`Path '${path}' already exists and is not a file.`);
  }
  await mkdirFn(dirname(path), { recursive: true });
  (await createFile(path)).close();
}

export function ensureFileSync(path: string): void {
  const info = lstatOrUndefinedSync(path);
  if (info != null) {
    if (info.isFile()) return;
    throw new Error(`Path '${path}' already exists and is not a file.`);
  }
  mkdirSyncFn(dirname(path), { recursive: true });
  createFileSync(path).close();
}

export async function emptyDir(path: string): Promise<void> {
  try {
    const entries: DirEntryInfo[] = [];
    for await (const entry of readDir(path)) {
      entries.push(entry);
    }
    for (const entry of entries) {
      await remove(join(path, entry.name), { recursive: true });
    }
  } catch (err) {
    if (!isNotFoundError(err)) throw err;
    await mkdirFn(path, { recursive: true });
  }
}

export function emptyDirSync(path: string): void {
  try {
    const entries = [...readDirSync(path)];
    for (const entry of entries) {
      removeSync(join(path, entry.name), { recursive: true });
    }
  } catch (err) {
    if (!isNotFoundError(err)) throw err;
    mkdirSyncFn(path, { recursive: true });
  }
}

export async function copy(
  src: string,
  dest: string,
  options?: { overwrite?: boolean },
): Promise<void> {
  const overwrite = options?.overwrite ?? false;
  const srcInfo = await stat(src);
  await copyRecursive(src, dest, srcInfo, overwrite);
}

export function copySync(
  src: string,
  dest: string,
  options?: { overwrite?: boolean },
): void {
  const overwrite = options?.overwrite ?? false;
  const srcInfo = statSync(src);
  copyRecursiveSync(src, dest, srcInfo, overwrite);
}

async function copyRecursive(
  src: string,
  dest: string,
  srcInfo: FileInfo,
  overwrite: boolean,
): Promise<void> {
  let destInfo = await lstatOrUndefined(dest);
  if (destInfo != null && !overwrite) {
    throw new Error(`'${dest}' already exists.`);
  }

  if (srcInfo.isDirectory()) {
    if (destInfo != null && !destInfo.isDirectory()) {
      await remove(dest);
      destInfo = undefined;
    }
    if (destInfo == null) {
      await mkdirFn(dest, { recursive: true });
    }
    for await (const entry of readDir(src)) {
      const srcChild = join(src, entry.name);
      const destChild = join(dest, entry.name);
      const childInfo = await stat(srcChild);
      await copyRecursive(srcChild, destChild, childInfo, overwrite);
    }
  } else {
    if (destInfo != null && destInfo.isDirectory()) {
      throw new Error(
        `Cannot overwrite directory '${dest}' with file '${src}'.`,
      );
    }
    await copyFileFn(src, dest);
  }
}

function copyRecursiveSync(
  src: string,
  dest: string,
  srcInfo: FileInfo,
  overwrite: boolean,
): void {
  let destInfo = lstatOrUndefinedSync(dest);
  if (destInfo != null && !overwrite) {
    throw new Error(`'${dest}' already exists.`);
  }

  if (srcInfo.isDirectory()) {
    if (destInfo != null && !destInfo.isDirectory()) {
      removeSync(dest);
      destInfo = undefined;
    }
    if (destInfo == null) {
      mkdirSyncFn(dest, { recursive: true });
    }
    for (const entry of readDirSync(src)) {
      const srcChild = join(src, entry.name);
      const destChild = join(dest, entry.name);
      const childInfo = statSync(srcChild);
      copyRecursiveSync(srcChild, destChild, childInfo, overwrite);
    }
  } else {
    if (destInfo != null && destInfo.isDirectory()) {
      throw new Error(
        `Cannot overwrite directory '${dest}' with file '${src}'.`,
      );
    }
    copyFileSyncFn(src, dest);
  }
}

async function lstatOrUndefined(path: string): Promise<FileInfo | undefined> {
  try {
    return await lstat(path);
  } catch (err) {
    if (isNotFoundError(err)) return undefined;
    throw err;
  }
}

function lstatOrUndefinedSync(path: string): FileInfo | undefined {
  try {
    return lstatSync(path);
  } catch (err) {
    if (isNotFoundError(err)) return undefined;
    throw err;
  }
}

function openOptionsToFlags(options?: OpenOptions): string {
  if (!options) return "r";
  const { read, write, append, truncate, create, createNew } = options;
  if (createNew) {
    if (append) return read ? "ax+" : "ax";
    return read ? "wx+" : "wx";
  }
  if (append) return read ? "a+" : "a";
  if (write) {
    if (truncate || create) return read ? "w+" : "w";
    return "r+";
  }
  return "r";
}
