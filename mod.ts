import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  normalize,
  relative,
  resolve,
} from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as _fs from "./_fs.ts";

export type {
  DirEntryInfo,
  FileInfo,
  MkdirOptions,
  OpenOptions,
  ReadFileOptions,
  RemoveOptions,
  WriteFileOptions,
} from "./_fs.ts";
export { FsFile } from "./_fs.ts";

/** Directory entry when reading a directory. */
export interface DirEntry extends _fs.DirEntryInfo {
  /** Path of this directory entry. */
  path: Path;
}

/** Options for creating a symlink. */
export interface SymlinkOptions {
  /** Creates the symlink as absolute or relative. */
  kind: "absolute" | "relative";
  /** Kind of symlink to create. Required on Windows when the target doesn't exist. */
  type?: "file" | "dir" | "junction";
}

/** Represents a path on the file system. */
export class Path {
  readonly #path: string;
  #knownResolved = false;

  /** This is a special symbol that allows different versions of
   * `Path` API to match on `instanceof` checks. Ideally
   * people shouldn't be mixing versions, but if it happens then
   * this will maybe reduce some bugs.
   * @internal
   */
  private static instanceofSymbol = Symbol.for("@david/path.Path");

  /** Creates a new path from the provided string, URL, or another Path. */
  constructor(path: string | URL | Path) {
    if (path instanceof URL) {
      this.#path = fileURLToPath(path);
    } else if (path instanceof Path) {
      this.#path = path.toString();
    } else if (typeof path === "string") {
      if (path.startsWith("file://")) {
        this.#path = fileURLToPath(path);
      } else {
        this.#path = path;
      }
    } else {
      throw new Error(
        `Invalid path argument: ${path}\n\nProvide a URL, string, or another Path.`,
      );
    }
  }

  /** @internal */
  static [Symbol.hasInstance](instance: unknown): boolean {
    // this should never change because it should work accross versions
    return (instance?.constructor as typeof Path)?.instanceofSymbol ===
      Path.instanceofSymbol;
  }

  /** @internal */
  [Symbol.for("Deno.customInspect")](): string {
    return `Path("${this.#path}")`;
  }

  /** @internal */
  [Symbol.for("nodejs.util.inspect.custom")](): string {
    return `Path("${this.#path}")`;
  }

  /** Gets the string representation of this path. */
  toString(): string {
    return this.#path;
  }

  /** Resolves the path and gets the file URL. */
  toFileUrl(): URL {
    const resolvedPath = this.resolve();
    return pathToFileURL(resolvedPath.toString());
  }

  /** If this path reference is the same as another one. */
  equals(otherPath: Path): boolean {
    return this.resolve().toString() === otherPath.resolve().toString();
  }

  /** Follows symlinks and gets if this path is a directory. */
  isDirSync(): boolean {
    return this.statSync()?.isDirectory() ?? false;
  }

  /** Follows symlinks and gets if this path is a file. */
  isFileSync(): boolean {
    return this.statSync()?.isFile() ?? false;
  }

  /** Gets if this path is a symlink. */
  isSymlinkSync(): boolean {
    return this.lstatSync()?.isSymbolicLink() ?? false;
  }

  /** Gets if this path is an absolute path. */
  isAbsolute(): boolean {
    return isAbsolute(this.#path);
  }

  /** Gets if this path is relative. */
  isRelative(): boolean {
    return !this.isAbsolute();
  }

  /** Joins the provided path segments onto this path. */
  join(...pathSegments: string[]): Path {
    return new Path(join(this.#path, ...pathSegments));
  }

  /** Resolves this path to an absolute path along with the provided path segments. */
  resolve(...pathSegments: string[]): Path {
    if (this.#knownResolved && pathSegments.length === 0) {
      return this;
    }

    const resolvedPath = resolve(this.#path, ...pathSegments);
    if (pathSegments.length === 0 && resolvedPath === this.#path) {
      this.#knownResolved = true;
      return this;
    } else {
      const pathRef = new Path(resolvedPath);
      pathRef.#knownResolved = true;
      return pathRef;
    }
  }

  /**
   * Normalizes the `path`, resolving `'..'` and `'.'` segments.
   * Note that resolving these segments does not necessarily mean that all will be eliminated.
   * A `'..'` at the top-level will be preserved, and an empty path is canonically `'.'`.
   */
  normalize(): Path {
    return new Path(normalize(this.#path));
  }

  /** Resolves the file info of this path following symlinks. */
  async stat(): Promise<_fs.FileInfo | undefined> {
    try {
      return await _fs.stat(this.#path);
    } catch (err) {
      if (_fs.isNotFoundError(err)) {
        return undefined;
      } else {
        throw err;
      }
    }
  }

  /** Synchronously resolves the file info of this path following symlinks. */
  statSync(): _fs.FileInfo | undefined {
    try {
      return _fs.statSync(this.#path);
    } catch (err) {
      if (_fs.isNotFoundError(err)) {
        return undefined;
      } else {
        throw err;
      }
    }
  }

  /** Resolves the file info of this path without following symlinks. */
  async lstat(): Promise<_fs.FileInfo | undefined> {
    try {
      return await _fs.lstat(this.#path);
    } catch (err) {
      if (_fs.isNotFoundError(err)) {
        return undefined;
      } else {
        throw err;
      }
    }
  }

  /** Synchronously resolves the file info of this path without following symlinks. */
  lstatSync(): _fs.FileInfo | undefined {
    try {
      return _fs.lstatSync(this.#path);
    } catch (err) {
      if (_fs.isNotFoundError(err)) {
        return undefined;
      } else {
        throw err;
      }
    }
  }

  /**
   * Gets the directory path. In most cases, it is recommended
   * to use `.parent()` instead since it will give you a `PathRef`.
   */
  dirname(): string {
    return dirname(this.#path);
  }

  /** Gets the file or directory name of the path. */
  basename(): string {
    return basename(this.#path);
  }

  /** Resolves the path getting all its ancestor directories in order. */
  *ancestors(): Generator<Path> {
    let ancestor = this.parent();
    while (ancestor != null) {
      yield ancestor;
      ancestor = ancestor.parent();
    }
  }

  /** Iterates over the components of a path. */
  *components(): Generator<string> {
    const path = this.normalize();
    let last_index = 0;

    // yield the prefix
    if (path.#path.startsWith("\\\\?\\")) {
      last_index = nextSlash(path.#path, 4);
      if (last_index === -1) {
        yield path.#path;
        return;
      } else {
        yield path.#path.substring(0, last_index);
        last_index += 1; // move past next slash
      }
    } else if (path.#path.startsWith("/")) {
      // move past the initial slash
      last_index += 1;
    }

    while (true) {
      const index = nextSlash(path.#path, last_index);
      if (index < 0) {
        const part = path.#path.substring(last_index);
        if (part.length > 0) {
          yield part;
        }
        return;
      }
      yield path.#path.substring(last_index, index);
      last_index = index + 1;
    }

    function nextSlash(path: string, start: number) {
      for (let i = start; i < path.length; i++) {
        const c = path.charCodeAt(i);
        if (c === 47 || c === 92) {
          return i;
        }
      }
      return -1;
    }
  }

  // This is private because this doesn't handle stuff like `\\?\` at the start
  // so it's only used internally with #endsWith for perf. API consumers should
  // use .components()
  *#rcomponents(): Generator<string> {
    const path = this.normalize();
    let last_index = undefined;
    while (last_index == null || last_index > 0) {
      const index = nextSlash(
        path.#path,
        last_index == null ? undefined : last_index - 1,
      );
      if (index < 0) {
        const part = path.#path.substring(0, last_index);
        if (part.length > 0) {
          yield part;
        }
        return;
      }
      const part = path.#path.substring(index + 1, last_index);
      if (last_index != null || part.length > 0) {
        yield part;
      }
      last_index = index;
    }

    function nextSlash(path: string, start: number | undefined) {
      for (let i = start ?? path.length - 1; i >= 0; i--) {
        const c = path.charCodeAt(i);
        if (c === 47 || c === 92) {
          return i;
        }
      }
      return -1;
    }
  }

  /** Gets if the provided path starts with the specified Path, URL, or string.
   *
   * This verifies based on matching the components.
   *
   * ```
   * assert(new Path("/a/b/c").startsWith("/a/b"));
   * assert(!new Path("/example").endsWith("/exam"));
   * ```
   */
  startsWith(path: Path | URL | string): boolean {
    const startsWithComponents = ensurePath(path).components();
    for (const component of this.components()) {
      const next = startsWithComponents.next();
      if (next.done) {
        return true;
      }
      if (next.value !== component) {
        return false;
      }
    }
    return startsWithComponents.next().done ?? true;
  }

  /** Gets if the provided path ends with the specified Path, URL, or string.
   *
   * This verifies based on matching the components.
   *
   * ```
   * assert(new Path("/a/b/c").endsWith("b/c"));
   * assert(!new Path("/a/b/example").endsWith("ple"));
   * ```
   */
  endsWith(path: Path | URL | string): boolean {
    const endsWithComponents = ensurePath(path).#rcomponents();
    for (const component of this.#rcomponents()) {
      const next = endsWithComponents.next();
      if (next.done) {
        return true;
      }
      if (next.value !== component) {
        return false;
      }
    }
    return endsWithComponents.next().done ?? true;
  }

  /** Gets the parent directory or returns undefined if the parent is the root directory. */
  parent(): Path | undefined {
    const resolvedPath = this.resolve();
    const dirname = resolvedPath.dirname();
    if (dirname === resolvedPath.#path) {
      return undefined;
    } else {
      return new Path(dirname);
    }
  }

  /** Gets the parent or throws if the current directory was the root. */
  parentOrThrow(): Path {
    const parent = this.parent();
    if (parent == null) {
      throw new Error(`Cannot get the parent directory of '${this.#path}'.`);
    }
    return parent;
  }

  /**
   * Returns the extension of the path with leading period or undefined
   * if there is no extension.
   */
  extname(): string | undefined {
    const extName = extname(this.#path);
    return extName.length === 0 ? undefined : extName;
  }

  /** Gets a new path reference with the provided extension. */
  withExtname(ext: string): Path {
    const currentExt = this.extname();
    const hasLeadingPeriod = ext.charCodeAt(0) === /* period */ 46;
    if (!hasLeadingPeriod && ext.length !== 0) {
      ext = "." + ext;
    }
    return new Path(
      this.#path.substring(0, this.#path.length - (currentExt?.length ?? 0)) +
        ext,
    );
  }

  /** Gets a new path reference with the provided file or directory name. */
  withBasename(basename: string): Path {
    const currentBaseName = this.basename();
    return new Path(
      this.#path.substring(0, this.#path.length - currentBaseName.length) +
        basename,
    );
  }

  /** Gets the relative path from this path to the specified path. */
  relative(to: string | URL | Path): string {
    const toPathRef = ensurePath(to);
    return relative(this.resolve().#path, toPathRef.resolve().toString());
  }

  /** Gets if the path exists. Beware of TOCTOU issues. */
  exists(): Promise<boolean> {
    return this.lstat().then((info) => info != null);
  }

  /** Synchronously gets if the path exists. Beware of TOCTOU issues. */
  existsSync(): boolean {
    return this.lstatSync() != null;
  }

  /** Resolves to the absolute normalized path, with symbolic links resolved. */
  realPath(): Promise<Path> {
    return _fs.realPath(this.#path).then((path) => new Path(path));
  }

  /** Synchronously resolves to the absolute normalized path, with symbolic links resolved. */
  realPathSync(): Path {
    return new Path(_fs.realPathSync(this.#path));
  }

  /** Creates a directory at this path.
   * @remarks By default, this is recursive.
   */
  async mkdir(options?: _fs.MkdirOptions): Promise<this> {
    await _fs.mkdirFn(this.#path, {
      recursive: true,
      ...options,
    });
    return this;
  }

  /** Synchronously creates a directory at this path.
   * @remarks By default, this is recursive.
   */
  mkdirSync(options?: _fs.MkdirOptions): this {
    _fs.mkdirSyncFn(this.#path, {
      recursive: true,
      ...options,
    });
    return this;
  }

  /**
   * Creates a symlink to the provided target path.
   */
  async symlinkTo(
    targetPath: URL | Path,
    opts: SymlinkOptions,
  ): Promise<void>;
  /**
   * Creates a symlink at the provided path with the provided target text.
   */
  async symlinkTo(
    target: string,
    opts?: Partial<SymlinkOptions>,
  ): Promise<void>;
  async symlinkTo(
    target: string | URL | Path,
    opts?: Partial<SymlinkOptions>,
  ): Promise<void> {
    await createSymlink(this.#resolveCreateSymlinkOpts(target, opts));
  }

  /**
   * Synchronously creates a symlink to the provided target path.
   */
  symlinkToSync(
    targetPath: URL | Path,
    opts: SymlinkOptions,
  ): void;
  /**
   * Synchronously creates a symlink at the provided path with the provided target text.
   */
  symlinkToSync(
    target: string,
    opts?: Partial<SymlinkOptions>,
  ): void;
  symlinkToSync(
    target: string | URL | Path,
    opts?: Partial<SymlinkOptions>,
  ): void {
    createSymlinkSync(this.#resolveCreateSymlinkOpts(target, opts));
  }

  #resolveCreateSymlinkOpts(
    target: string | URL | Path,
    opts: Partial<SymlinkOptions> | undefined,
  ): CreateSymlinkOpts {
    if (opts?.kind == null) {
      if (typeof target === "string") {
        return {
          fromPath: this.resolve(),
          targetPath: ensurePath(target),
          text: target,
          type: opts?.type,
        };
      } else {
        throw new Error(
          "Please specify if this symlink is absolute or relative. Otherwise provide the target text.",
        );
      }
    }
    const targetPath = ensurePath(target).resolve();
    if (opts?.kind === "relative") {
      const fromPath = this.resolve();
      let relativePath: string;
      if (fromPath.dirname() === targetPath.dirname()) {
        // we don't want it to do `../basename`
        relativePath = targetPath.basename();
      } else {
        relativePath = fromPath.relative(targetPath);
      }
      return {
        fromPath,
        targetPath,
        text: relativePath,
        type: opts?.type,
      };
    } else {
      return {
        fromPath: this.resolve(),
        targetPath,
        text: targetPath.toString(),
        type: opts?.type,
      };
    }
  }

  /**
   * Creates a hardlink to the provided target path.
   */
  async linkTo(
    targetPath: string | URL | Path,
  ): Promise<void> {
    const targetPathRef = ensurePath(targetPath).resolve();
    await _fs.linkFn(targetPathRef.toString(), this.resolve().toString());
  }

  /**
   * Synchronously creates a hardlink to the provided target path.
   */
  linkToSync(
    targetPath: string | URL | Path,
  ): void {
    const targetPathRef = ensurePath(targetPath).resolve();
    _fs.linkSyncFn(targetPathRef.toString(), this.resolve().toString());
  }

  /** Reads the entries in the directory. */
  async *readDir(): AsyncIterable<DirEntry> {
    const dir = this.resolve();
    for await (const entry of _fs.readDir(dir.#path)) {
      const out = entry as DirEntry;
      out.path = dir.join(entry.name);
      yield out;
    }
  }

  /** Synchronously reads the entries in the directory. */
  *readDirSync(): Iterable<DirEntry> {
    const dir = this.resolve();
    for (const entry of _fs.readDirSync(dir.#path)) {
      const out = entry as DirEntry;
      out.path = dir.join(entry.name);
      yield out;
    }
  }

  /** Reads only the directory file paths, not including symlinks. */
  async *readDirFilePaths(): AsyncIterable<Path> {
    const dir = this.resolve();
    for await (const entry of _fs.readDir(dir.#path)) {
      if (entry.isFile()) {
        yield dir.join(entry.name);
      }
    }
  }

  /** Synchronously reads only the directory file paths, not including symlinks. */
  *readDirFilePathsSync(): Iterable<Path> {
    const dir = this.resolve();
    for (const entry of _fs.readDirSync(dir.#path)) {
      if (entry.isFile()) {
        yield dir.join(entry.name);
      }
    }
  }

  /** Reads the bytes from the file. */
  readBytes(options?: _fs.ReadFileOptions): Promise<Uint8Array> {
    return _fs.readFile(this.#path, options);
  }

  /** Synchronously reads the bytes from the file. */
  readBytesSync(): Uint8Array {
    return _fs.readFileSync(this.#path);
  }

  /** Calls `.readBytes()`, but returns undefined if the path doesn't exist. */
  readMaybeBytes(
    options?: _fs.ReadFileOptions,
  ): Promise<Uint8Array | undefined> {
    return notFoundToUndefined(() => this.readBytes(options));
  }

  /** Calls `.readBytesSync()`, but returns undefined if the path doesn't exist. */
  readMaybeBytesSync(): Uint8Array | undefined {
    return notFoundToUndefinedSync(() => this.readBytesSync());
  }

  /** Reads the text from the file. */
  readText(options?: _fs.ReadFileOptions): Promise<string> {
    return _fs.readTextFile(this.#path, options);
  }

  /** Synchronously reads the text from the file. */
  readTextSync(): string {
    return _fs.readTextFileSync(this.#path);
  }

  /** Calls `.readText()`, but returns undefined when the path doesn't exist.
   * @remarks This still errors for other kinds of errors reading a file.
   */
  readMaybeText(options?: _fs.ReadFileOptions): Promise<string | undefined> {
    return notFoundToUndefined(() => this.readText(options));
  }

  /** Calls `.readTextSync()`, but returns undefined when the path doesn't exist.
   * @remarks This still errors for other kinds of errors reading a file.
   */
  readMaybeTextSync(): string | undefined {
    return notFoundToUndefinedSync(() => this.readTextSync());
  }

  /** Reads and parses the file as JSON, throwing if it doesn't exist or is not valid JSON. */
  async readJson<T>(options?: _fs.ReadFileOptions): Promise<T> {
    return this.#parseJson<T>(await this.readText(options));
  }

  /** Synchronously reads and parses the file as JSON, throwing if it doesn't
   * exist or is not valid JSON. */
  readJsonSync<T>(): T {
    return this.#parseJson<T>(this.readTextSync());
  }

  #parseJson<T>(text: string) {
    try {
      return JSON.parse(text) as T;
    } catch (err) {
      throw new Error(`Failed parsing JSON in '${this.toString()}'.`, {
        cause: err,
      });
    }
  }

  /**
   * Calls `.readJson()`, but returns undefined if the file doesn't exist.
   * @remarks This method will still throw if the file cannot be parsed as JSON.
   */
  readMaybeJson<T>(options?: _fs.ReadFileOptions): Promise<T | undefined> {
    return notFoundToUndefined(() => this.readJson<T>(options));
  }

  /**
   * Calls `.readJsonSync()`, but returns undefined if the file doesn't exist.
   * @remarks This method will still throw if the file cannot be parsed as JSON.
   */
  readMaybeJsonSync<T>(): T | undefined {
    return notFoundToUndefinedSync(() => this.readJsonSync<T>());
  }

  /** Writes out the provided bytes or text to the file. */
  async write(
    data: Uint8Array,
    options?: _fs.WriteFileOptions,
  ): Promise<this> {
    await this.#withFileForWriting(options, (file) => {
      return writeAll(file, data, options?.signal);
    });
    return this;
  }

  /** Synchronously writes out the provided bytes or text to the file. */
  writeSync(data: Uint8Array, options?: _fs.WriteFileOptions): this {
    this.#withFileForWritingSync(options, (file) => {
      writeAllSync(file, data, options?.signal);
    });
    return this;
  }

  /** Writes the provided text to this file. */
  writeText(text: string, options?: _fs.WriteFileOptions): Promise<this> {
    return this.write(new TextEncoder().encode(text), options);
  }

  /** Synchronously writes the provided text to this file. */
  writeTextSync(text: string, options?: _fs.WriteFileOptions): this {
    return this.writeSync(new TextEncoder().encode(text), options);
  }

  /** Writes out the provided object as compact JSON. */
  async writeJson(
    obj: unknown,
    options?: _fs.WriteFileOptions,
  ): Promise<this> {
    const text = JSON.stringify(obj);
    await this.writeText(text + "\n", options);
    return this;
  }

  /** Synchronously writes out the provided object as compact JSON. */
  writeJsonSync(obj: unknown, options?: _fs.WriteFileOptions): this {
    const text = JSON.stringify(obj);
    this.writeTextSync(text + "\n", options);
    return this;
  }

  /** Writes out the provided object as formatted JSON. */
  async writeJsonPretty(
    obj: unknown,
    options?: _fs.WriteFileOptions,
  ): Promise<this> {
    const text = JSON.stringify(obj, undefined, 2);
    await this.writeText(text + "\n", options);
    return this;
  }

  /** Synchronously writes out the provided object as formatted JSON. */
  writeJsonPrettySync(obj: unknown, options?: _fs.WriteFileOptions): this {
    const text = JSON.stringify(obj, undefined, 2);
    this.writeTextSync(text + "\n", options);
    return this;
  }

  /** Appends the provided bytes to the file. */
  async append(
    data: Uint8Array,
    options?: Omit<_fs.WriteFileOptions, "append">,
  ): Promise<this> {
    await this.#withFileForAppending(
      options,
      (file) => writeAll(file, data, options?.signal),
    );
    return this;
  }

  /** Synchronously appends the provided bytes to the file. */
  appendSync(
    data: Uint8Array,
    options?: Omit<_fs.WriteFileOptions, "append">,
  ): this {
    this.#withFileForAppendingSync(options, (file) => {
      writeAllSync(file, data, options?.signal);
    });
    return this;
  }

  /** Appends the provided text to the file. */
  async appendText(
    text: string,
    options?: Omit<_fs.WriteFileOptions, "append">,
  ): Promise<this> {
    await this.#withFileForAppending(
      options,
      (file) => writeAll(file, new TextEncoder().encode(text), options?.signal),
    );
    return this;
  }

  /** Synchronously appends the provided text to the file. */
  appendTextSync(
    text: string,
    options?: Omit<_fs.WriteFileOptions, "append">,
  ): this {
    this.#withFileForAppendingSync(options, (file) => {
      writeAllSync(file, new TextEncoder().encode(text), options?.signal);
    });
    return this;
  }

  #withFileForAppending<T>(
    options: Omit<_fs.WriteFileOptions, "append"> | undefined,
    action: (file: _fs.FsFile) => Promise<T>,
  ) {
    return this.#withFileForWriting({
      append: true,
      ...options,
    }, action);
  }

  async #withFileForWriting<T>(
    options: _fs.WriteFileOptions | undefined,
    action: (file: _fs.FsFile) => Promise<T>,
  ) {
    const file = await this.#openFileMaybeCreatingDirectory({
      write: true,
      create: true,
      truncate: options?.append !== true,
      ...options,
    });
    try {
      return await action(file);
    } finally {
      try {
        file.close();
      } catch {
        // ignore
      }
    }
  }

  /** Opens a file, but handles if the directory does not exist. */
  async #openFileMaybeCreatingDirectory(options: _fs.OpenOptions) {
    const resolvedPath = this.resolve(); // pre-resolve before going async in case the cwd changes
    try {
      return await resolvedPath.open(options);
    } catch (err) {
      if (_fs.isNotFoundError(err)) {
        // attempt to create the parent directory when it doesn't exist
        const parent = resolvedPath.parent();
        if (parent != null) {
          try {
            await parent.mkdir();
          } catch {
            throw err; // throw the original error
          }
        }
        return await resolvedPath.open(options);
      } else {
        throw err;
      }
    }
  }

  #withFileForAppendingSync<T>(
    options: Omit<_fs.WriteFileOptions, "append"> | undefined,
    action: (file: _fs.FsFile) => T,
  ) {
    return this.#withFileForWritingSync({
      append: true,
      ...options,
    }, action);
  }

  #withFileForWritingSync<T>(
    options: _fs.WriteFileOptions | undefined,
    action: (file: _fs.FsFile) => T,
  ) {
    const file = this.#openFileForWritingSync(options);
    try {
      return action(file);
    } finally {
      try {
        file.close();
      } catch {
        // ignore
      }
    }
  }

  /** Opens a file for writing, but handles if the directory does not exist. */
  #openFileForWritingSync(options: _fs.WriteFileOptions | undefined) {
    return this.#openFileMaybeCreatingDirectorySync({
      write: true,
      create: true,
      truncate: options?.append !== true,
      ...options,
    });
  }

  /** Opens a file for writing, but handles if the directory does not exist. */
  #openFileMaybeCreatingDirectorySync(options: _fs.OpenOptions) {
    try {
      return this.openSync(options);
    } catch (err) {
      if (_fs.isNotFoundError(err)) {
        // attempt to create the parent directory when it doesn't exist
        const parent = this.resolve().parent();
        if (parent != null) {
          try {
            parent.mkdirSync();
          } catch {
            throw err; // throw the original error
          }
        }
        return this.openSync(options);
      } else {
        throw err;
      }
    }
  }

  /** Changes the permissions of the file or directory. */
  async chmod(mode: number): Promise<this> {
    await _fs.chmod(this.#path, mode);
    return this;
  }

  /** Synchronously changes the permissions of the file or directory. */
  chmodSync(mode: number): this {
    _fs.chmodSync(this.#path, mode);
    return this;
  }

  /** Changes the ownership permissions of the file. */
  async chown(uid: number | null, gid: number | null): Promise<this> {
    await _fs.chown(this.#path, uid, gid);
    return this;
  }

  /** Synchronously changes the ownership permissions of the file. */
  chownSync(uid: number | null, gid: number | null): this {
    _fs.chownSync(this.#path, uid, gid);
    return this;
  }

  /** Creates a new file or opens the existing one. */
  create(): Promise<FsFileWrapper> {
    return _fs.createFile(this.#path)
      .then((file) => createFsFileWrapper(file));
  }

  /** Synchronously creates a new file or opens the existing one. */
  createSync(): FsFileWrapper {
    return createFsFileWrapper(_fs.createFileSync(this.#path));
  }

  /** Creates a file throwing if a file previously existed. */
  createNew(): Promise<FsFileWrapper> {
    return this.open({
      createNew: true,
      read: true,
      write: true,
    });
  }

  /** Synchronously creates a file throwing if a file previously existed. */
  createNewSync(): FsFileWrapper {
    return this.openSync({
      createNew: true,
      read: true,
      write: true,
    });
  }

  /** Opens a file. */
  open(options?: _fs.OpenOptions): Promise<FsFileWrapper> {
    return _fs.openFile(this.#path, options)
      .then((file) => createFsFileWrapper(file));
  }

  /** Opens a file synchronously. */
  openSync(options?: _fs.OpenOptions): FsFileWrapper {
    return createFsFileWrapper(_fs.openFileSync(this.#path, options));
  }

  /** Removes the file or directory from the file system. */
  async remove(options?: _fs.RemoveOptions): Promise<this> {
    await _fs.remove(this.#path, options);
    return this;
  }

  /** Removes the file or directory from the file system synchronously. */
  removeSync(options?: _fs.RemoveOptions): this {
    _fs.removeSync(this.#path, options);
    return this;
  }

  /** Removes the file or directory from the file system, but doesn't throw
   * when the file doesn't exist.
   */
  async ensureRemove(options?: _fs.RemoveOptions): Promise<this> {
    try {
      return await this.remove(options);
    } catch (err) {
      if (_fs.isNotFoundError(err)) {
        return this;
      } else {
        throw err;
      }
    }
  }

  /** Removes the file or directory from the file system, but doesn't throw
   * when the file doesn't exist.
   */
  ensureRemoveSync(options?: _fs.RemoveOptions): this {
    try {
      return this.removeSync(options);
    } catch (err) {
      if (_fs.isNotFoundError(err)) {
        return this;
      } else {
        throw err;
      }
    }
  }

  /**
   * Ensures that a directory is empty.
   * Deletes directory contents if the directory is not empty.
   * If the directory does not exist, it is created.
   * The directory itself is not deleted.
   */
  async emptyDir(): Promise<this> {
    await _fs.emptyDir(this.toString());
    return this;
  }

  /** Synchronous version of `emptyDir()` */
  emptyDirSync(): this {
    _fs.emptyDirSync(this.toString());
    return this;
  }

  /** Ensures that the directory exists.
   * If the directory structure does not exist, it is created. Like mkdir -p.
   */
  async ensureDir(): Promise<this> {
    await _fs.ensureDir(this.toString());
    return this;
  }

  /** Synchronously ensures that the directory exists.
   * If the directory structure does not exist, it is created. Like mkdir -p.
   */
  ensureDirSync(): this {
    _fs.ensureDirSync(this.toString());
    return this;
  }

  /**
   * Ensures that the file exists.
   * If the file that is requested to be created is in directories that do
   * not exist these directories are created. If the file already exists,
   * it is NOTMODIFIED.
   */
  async ensureFile(): Promise<this> {
    await _fs.ensureFile(this.toString());
    return this;
  }

  /**
   * Synchronously ensures that the file exists.
   * If the file that is requested to be created is in directories that do
   * not exist these directories are created. If the file already exists,
   * it is NOTMODIFIED.
   */
  ensureFileSync(): this {
    _fs.ensureFileSync(this.toString());
    return this;
  }

  /** Copies a file or directory to the provided destination.
   * @returns The destination path.
   */
  async copy(
    destinationPath: string | URL | Path,
    options?: { overwrite?: boolean },
  ): Promise<Path> {
    const pathRef = ensurePath(destinationPath);
    await _fs.copy(this.#path, pathRef.toString(), options);
    return pathRef;
  }

  /** Copies a file or directory to the provided destination synchronously.
   * @returns The destination path.
   */
  copySync(
    destinationPath: string | URL | Path,
    options?: { overwrite?: boolean },
  ): Path {
    const pathRef = ensurePath(destinationPath);
    _fs.copySync(this.#path, pathRef.toString(), options);
    return pathRef;
  }

  /**
   * Copies the file or directory to the specified directory.
   * @returns The destination path.
   */
  copyToDir(
    destinationDirPath: string | URL | Path,
    options?: { overwrite?: boolean },
  ): Promise<Path> {
    const destinationPath = ensurePath(destinationDirPath)
      .join(this.basename());
    return this.copy(destinationPath, options);
  }

  /**
   * Copies the file or directory to the specified directory synchronously.
   * @returns The destination path.
   */
  copyToDirSync(
    destinationDirPath: string | URL | Path,
    options?: { overwrite?: boolean },
  ): Path {
    const destinationPath = ensurePath(destinationDirPath)
      .join(this.basename());
    return this.copySync(destinationPath, options);
  }

  /**
   * Copies the file to the specified destination path.
   * @returns The destination path.
   */
  copyFile(destinationPath: string | URL | Path): Promise<Path> {
    const pathRef = ensurePath(destinationPath);
    return _fs.copyFileFn(this.#path, pathRef.toString())
      .then(() => pathRef);
  }

  /**
   * Copies the file to the destination path synchronously.
   * @returns The destination path.
   */
  copyFileSync(destinationPath: string | URL | Path): Path {
    const pathRef = ensurePath(destinationPath);
    _fs.copyFileSyncFn(this.#path, pathRef.toString());
    return pathRef;
  }

  /**
   * Copies the file to the specified directory.
   * @returns The destination path.
   */
  copyFileToDir(destinationDirPath: string | URL | Path): Promise<Path> {
    const destinationPath = ensurePath(destinationDirPath)
      .join(this.basename());
    return this.copyFile(destinationPath);
  }

  /**
   * Copies the file to the specified directory synchronously.
   * @returns The destination path.
   */
  copyFileToDirSync(destinationDirPath: string | URL | Path): Path {
    const destinationPath = ensurePath(destinationDirPath)
      .join(this.basename());
    return this.copyFileSync(destinationPath);
  }

  /**
   * Moves the file or directory returning a promise that resolves to
   * the renamed path.
   * @returns The destination path.
   */
  rename(newPath: string | URL | Path): Promise<Path> {
    const pathRef = ensurePath(newPath);
    return _fs.renameFn(this.#path, pathRef.toString()).then(() => pathRef);
  }

  /**
   * Moves the file or directory returning the renamed path synchronously.
   * @returns The destination path.
   */
  renameSync(newPath: string | URL | Path): Path {
    const pathRef = ensurePath(newPath);
    _fs.renameSyncFn(this.#path, pathRef.toString());
    return pathRef;
  }

  /**
   * Moves the file or directory to the specified directory.
   * @returns The destination path.
   */
  renameToDir(destinationDirPath: string | URL | Path): Promise<Path> {
    const destinationPath = ensurePath(destinationDirPath)
      .join(this.basename());
    return this.rename(destinationPath);
  }

  /**
   * Moves the file or directory to the specified directory synchronously.
   * @returns The destination path.
   */
  renameToDirSync(destinationDirPath: string | URL | Path): Path {
    const destinationPath = ensurePath(destinationDirPath)
      .join(this.basename());
    return this.renameSync(destinationPath);
  }

  /** Opens the file and pipes it to the writable stream. */
  async pipeTo(
    dest: WritableStream<Uint8Array>,
    options?: StreamPipeOptions,
  ): Promise<this> {
    const file = await _fs.openFile(this.#path, { read: true });
    try {
      await file.readable.pipeTo(dest, options);
    } finally {
      try {
        file.close();
      } catch {
        // ignore
      }
    }
    return this;
  }
}

function ensurePath(path: string | URL | Path) {
  return path instanceof Path ? path : new Path(path);
}

function createFsFileWrapper(file: _fs.FsFile): FsFileWrapper {
  Object.setPrototypeOf(file, FsFileWrapper.prototype);
  return file as FsFileWrapper;
}

/** Wrapper around `FsFile` that has more helper methods. */
export class FsFileWrapper extends _fs.FsFile {
  /** Writes the provided text to this file. */
  writeText(text: string): Promise<this> {
    return this.writeBytes(new TextEncoder().encode(text));
  }

  /** Synchronously writes the provided text to this file. */
  writeTextSync(text: string): this {
    return this.writeBytesSync(new TextEncoder().encode(text));
  }

  /** Writes the provided bytes to the file. */
  async writeBytes(bytes: Uint8Array): Promise<this> {
    await writeAll(this, bytes);
    return this;
  }

  /** Synchronously writes the provided bytes to the file. */
  writeBytesSync(bytes: Uint8Array): this {
    writeAllSync(this, bytes);
    return this;
  }
}

async function createSymlink(opts: CreateSymlinkOpts) {
  let kind = opts.type;
  if (kind == null && _fs.isWindows()) {
    const info = await opts.targetPath.lstat();
    if (info?.isDirectory()) {
      kind = "dir";
    } else if (info?.isFile()) {
      kind = "file";
    } else {
      throw _fs.createNotFoundError(
        `The target path '${opts.targetPath}' did not exist or path kind could not be determined. ` +
          `When the path doesn't exist, you need to specify a symlink type on Windows.`,
      );
    }
  }

  await _fs.symlinkFn(
    opts.text,
    opts.fromPath.toString(),
    kind == null ? undefined : {
      type: kind,
    },
  );
}

interface CreateSymlinkOpts {
  fromPath: Path;
  targetPath: Path;
  text: string;
  type: "file" | "dir" | "junction" | undefined;
}

function createSymlinkSync(opts: CreateSymlinkOpts) {
  let kind = opts.type;
  if (kind == null && _fs.isWindows()) {
    const info = opts.targetPath.lstatSync();
    if (info?.isDirectory()) {
      kind = "dir";
    } else if (info?.isFile()) {
      kind = "file";
    } else {
      throw _fs.createNotFoundError(
        `The target path '${opts.targetPath}' did not exist or path kind could not be determined. ` +
          `When the path doesn't exist, you need to specify a symlink type on Windows.`,
      );
    }
  }

  _fs.symlinkSyncFn(
    opts.text,
    opts.fromPath.toString(),
    kind == null ? undefined : {
      type: kind,
    },
  );
}

async function notFoundToUndefined<T>(action: () => Promise<T>) {
  try {
    return await action();
  } catch (err) {
    if (_fs.isNotFoundError(err)) {
      return undefined;
    } else {
      throw err;
    }
  }
}

function notFoundToUndefinedSync<T>(action: () => T) {
  try {
    return action();
  } catch (err) {
    if (_fs.isNotFoundError(err)) {
      return undefined;
    } else {
      throw err;
    }
  }
}

async function writeAll(
  writer: { write(data: Uint8Array): Promise<number> },
  data: Uint8Array,
  signal?: AbortSignal,
) {
  let nwritten = 0;
  while (nwritten < data.length) {
    signal?.throwIfAborted();
    nwritten += await writer.write(data.subarray(nwritten));
  }
}

function writeAllSync(
  writer: { writeSync(data: Uint8Array): number },
  data: Uint8Array,
  signal?: AbortSignal,
) {
  let nwritten = 0;
  while (nwritten < data.length) {
    signal?.throwIfAborted();
    nwritten += writer.writeSync(data.subarray(nwritten));
  }
}
