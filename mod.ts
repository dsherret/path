import { basename } from "@std/path/basename";
import { dirname } from "@std/path/dirname";
import { extname } from "@std/path/extname";
import { fromFileUrl } from "@std/path/from-file-url";
import { isAbsolute } from "@std/path/is-absolute";
import { join } from "@std/path/join";
import { normalize } from "@std/path/normalize";
import { relative } from "@std/path/relative";
import { resolve } from "@std/path/resolve";
import { toFileUrl } from "@std/path/to-file-url";
import { emptyDir, emptyDirSync } from "@std/fs/empty-dir";
import { ensureDir, ensureDirSync } from "@std/fs/ensure-dir";
import { ensureFile, ensureFileSync } from "@std/fs/ensure-file";
import { copy, copySync } from "@std/fs/copy";
import { walk, walkSync } from "@std/fs/walk";
import { expandGlob, expandGlobSync } from "@std/fs/expand-glob";

/**
 * `ExpandGlobOptions` from https://deno.land/std/fs/expand_glob.ts
 * @internal
 */
type DenoStdExpandGlobOptions = import("@std/fs/expand-glob").ExpandGlobOptions;
/** Options for expanding globs in a directory. */
export type ExpandGlobOptions = DenoStdExpandGlobOptions;
/**
 * `WalkOptions` from https://deno.land/std/fs/walk.ts
 * @internal
 */
type DenoStdWalkOptions = import("@std/fs/walk").WalkOptions;
/** Options for walking a directory. */
export type WalkOptions = DenoStdWalkOptions;

/** Directory entry when walking or reading a directory. */
export interface DirEntry extends Deno.DirEntry {
  /** Path of this directory entry. */
  path: Path;
}

/** Options for creating a symlink. */
export interface SymlinkOptions extends Partial<Deno.SymlinkOptions> {
  /** Creates the symlink as absolute or relative. */
  kind: "absolute" | "relative";
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
      this.#path = fromFileUrl(path);
    } else if (path instanceof Path) {
      this.#path = path.toString();
    } else if (typeof path === "string") {
      if (path.startsWith("file://")) {
        this.#path = fromFileUrl(path);
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
    return toFileUrl(resolvedPath.toString());
  }

  /** If this path reference is the same as another one. */
  equals(otherPath: Path): boolean {
    return this.resolve().toString() === otherPath.resolve().toString();
  }

  /** Follows symlinks and gets if this path is a directory. */
  isDirSync(): boolean {
    return this.statSync()?.isDirectory ?? false;
  }

  /** Follows symlinks and gets if this path is a file. */
  isFileSync(): boolean {
    return this.statSync()?.isFile ?? false;
  }

  /** Gets if this path is a symlink. */
  isSymlinkSync(): boolean {
    return this.lstatSync()?.isSymlink ?? false;
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

  /** Resolves the `Deno.FileInfo` of this path following symlinks. */
  async stat(): Promise<Deno.FileInfo | undefined> {
    try {
      return await Deno.stat(this.#path);
    } catch (err) {
      if (err instanceof Deno.errors.NotFound) {
        return undefined;
      } else {
        throw err;
      }
    }
  }

  /** Synchronously resolves the `Deno.FileInfo` of this
   * path following symlinks. */
  statSync(): Deno.FileInfo | undefined {
    try {
      return Deno.statSync(this.#path);
    } catch (err) {
      if (err instanceof Deno.errors.NotFound) {
        return undefined;
      } else {
        throw err;
      }
    }
  }

  /** Resolves the `Deno.FileInfo` of this path without
   * following symlinks. */
  async lstat(): Promise<Deno.FileInfo | undefined> {
    try {
      return await Deno.lstat(this.#path);
    } catch (err) {
      if (err instanceof Deno.errors.NotFound) {
        return undefined;
      } else {
        throw err;
      }
    }
  }

  /** Synchronously resolves the `Deno.FileInfo` of this path
   * without following symlinks. */
  lstatSync(): Deno.FileInfo | undefined {
    try {
      return Deno.lstatSync(this.#path);
    } catch (err) {
      if (err instanceof Deno.errors.NotFound) {
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
    return Deno.realPath(this.#path).then((path) => new Path(path));
  }

  /** Synchronously resolves to the absolute normalized path, with symbolic links resolved. */
  realPathSync(): Path {
    return new Path(Deno.realPathSync(this.#path));
  }

  /** Expands the glob using the current path as the root. */
  async *expandGlob(
    glob: string | URL,
    options?: Omit<ExpandGlobOptions, "root">,
  ): AsyncGenerator<DirEntry, void, unknown> {
    const entries = expandGlob(glob, {
      root: this.resolve().toString(),
      ...options,
    });
    for await (const entry of entries) {
      yield this.#stdWalkEntryToDax(entry);
    }
  }

  /** Synchronously expands the glob using the current path as the root. */
  *expandGlobSync(
    glob: string | URL,
    options?: Omit<ExpandGlobOptions, "root">,
  ): Generator<DirEntry, void, unknown> {
    const entries = expandGlobSync(glob, {
      root: this.resolve().toString(),
      ...options,
    });
    for (const entry of entries) {
      yield this.#stdWalkEntryToDax(entry);
    }
  }

  /** Walks the file tree rooted at the current path, yielding each file or
   * directory in the tree filtered according to the given options. */
  async *walk(options?: WalkOptions): AsyncIterableIterator<DirEntry> {
    // Resolve the path before walking so that these paths always point to
    // absolute paths in the case that someone changes the cwd after walking.
    for await (const entry of walk(this.resolve().toString(), options)) {
      yield this.#stdWalkEntryToDax(entry);
    }
  }

  /** Synchronously walks the file tree rooted at the current path, yielding each
   * file or directory in the tree filtered according to the given options. */
  *walkSync(options?: WalkOptions): Iterable<DirEntry> {
    for (const entry of walkSync(this.resolve().toString(), options)) {
      yield this.#stdWalkEntryToDax(entry);
    }
  }

  #stdWalkEntryToDax(entry: import("@std/fs/walk").WalkEntry): DirEntry {
    return {
      ...entry,
      path: new Path(entry.path),
    };
  }

  /** Creates a directory at this path.
   * @remarks By default, this is recursive.
   */
  async mkdir(options?: Deno.MkdirOptions): Promise<this> {
    await Deno.mkdir(this.#path, {
      recursive: true,
      ...options,
    });
    return this;
  }

  /** Synchronously creates a directory at this path.
   * @remarks By default, this is recursive.
   */
  mkdirSync(options?: Deno.MkdirOptions): this {
    Deno.mkdirSync(this.#path, {
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
    await Deno.link(targetPathRef.toString(), this.resolve().toString());
  }

  /**
   * Synchronously creates a hardlink to the provided target path.
   */
  linkToSync(
    targetPath: string | URL | Path,
  ): void {
    const targetPathRef = ensurePath(targetPath).resolve();
    Deno.linkSync(targetPathRef.toString(), this.resolve().toString());
  }

  /** Reads the entries in the directory. */
  async *readDir(): AsyncIterable<DirEntry> {
    const dir = this.resolve();
    for await (const entry of Deno.readDir(dir.#path)) {
      yield {
        ...entry,
        path: dir.join(entry.name),
      };
    }
  }

  /** Synchronously reads the entries in the directory. */
  *readDirSync(): Iterable<DirEntry> {
    const dir = this.resolve();
    for (const entry of Deno.readDirSync(dir.#path)) {
      yield {
        ...entry,
        path: dir.join(entry.name),
      };
    }
  }

  /** Reads only the directory file paths, not including symlinks. */
  async *readDirFilePaths(): AsyncIterable<Path> {
    const dir = this.resolve();
    for await (const entry of Deno.readDir(dir.#path)) {
      if (entry.isFile) {
        yield dir.join(entry.name);
      }
    }
  }

  /** Synchronously reads only the directory file paths, not including symlinks. */
  *readDirFilePathsSync(): Iterable<Path> {
    const dir = this.resolve();
    for (const entry of Deno.readDirSync(dir.#path)) {
      if (entry.isFile) {
        yield dir.join(entry.name);
      }
    }
  }

  /** Reads the bytes from the file. */
  readBytes(options?: Deno.ReadFileOptions): Promise<Uint8Array> {
    return Deno.readFile(this.#path, options);
  }

  /** Synchronously reads the bytes from the file. */
  readBytesSync(): Uint8Array {
    return Deno.readFileSync(this.#path);
  }

  /** Calls `.readBytes()`, but returns undefined if the path doesn't exist. */
  readMaybeBytes(
    options?: Deno.ReadFileOptions,
  ): Promise<Uint8Array | undefined> {
    return notFoundToUndefined(() => this.readBytes(options));
  }

  /** Calls `.readBytesSync()`, but returns undefined if the path doesn't exist. */
  readMaybeBytesSync(): Uint8Array | undefined {
    return notFoundToUndefinedSync(() => this.readBytesSync());
  }

  /** Reads the text from the file. */
  readText(options?: Deno.ReadFileOptions): Promise<string> {
    return Deno.readTextFile(this.#path, options);
  }

  /** Synchronously reads the text from the file. */
  readTextSync(): string {
    return Deno.readTextFileSync(this.#path);
  }

  /** Calls `.readText()`, but returns undefined when the path doesn't exist.
   * @remarks This still errors for other kinds of errors reading a file.
   */
  readMaybeText(options?: Deno.ReadFileOptions): Promise<string | undefined> {
    return notFoundToUndefined(() => this.readText(options));
  }

  /** Calls `.readTextSync()`, but returns undefined when the path doesn't exist.
   * @remarks This still errors for other kinds of errors reading a file.
   */
  readMaybeTextSync(): string | undefined {
    return notFoundToUndefinedSync(() => this.readTextSync());
  }

  /** Reads and parses the file as JSON, throwing if it doesn't exist or is not valid JSON. */
  async readJson<T>(options?: Deno.ReadFileOptions): Promise<T> {
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
  readMaybeJson<T>(options?: Deno.ReadFileOptions): Promise<T | undefined> {
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
    options?: Deno.WriteFileOptions,
  ): Promise<this> {
    await this.#withFileForWriting(options, (file) => {
      return writeAll(file, data);
    });
    return this;
  }

  /** Synchronously writes out the provided bytes or text to the file. */
  writeSync(data: Uint8Array, options?: Deno.WriteFileOptions): this {
    this.#withFileForWritingSync(options, (file) => {
      writeAllSync(file, data);
    });
    return this;
  }

  /** Writes the provided text to this file. */
  writeText(text: string, options?: Deno.WriteFileOptions): Promise<this> {
    return this.write(new TextEncoder().encode(text), options);
  }

  /** Synchronously writes the provided text to this file. */
  writeTextSync(text: string, options?: Deno.WriteFileOptions): this {
    return this.writeSync(new TextEncoder().encode(text), options);
  }

  /** Writes out the provided object as compact JSON. */
  async writeJson(
    obj: unknown,
    options?: Deno.WriteFileOptions,
  ): Promise<this> {
    const text = JSON.stringify(obj);
    await this.writeText(text + "\n", options);
    return this;
  }

  /** Synchronously writes out the provided object as compact JSON. */
  writeJsonSync(obj: unknown, options?: Deno.WriteFileOptions): this {
    const text = JSON.stringify(obj);
    this.writeTextSync(text + "\n", options);
    return this;
  }

  /** Writes out the provided object as formatted JSON. */
  async writeJsonPretty(
    obj: unknown,
    options?: Deno.WriteFileOptions,
  ): Promise<this> {
    const text = JSON.stringify(obj, undefined, 2);
    await this.writeText(text + "\n", options);
    return this;
  }

  /** Synchronously writes out the provided object as formatted JSON. */
  writeJsonPrettySync(obj: unknown, options?: Deno.WriteFileOptions): this {
    const text = JSON.stringify(obj, undefined, 2);
    this.writeTextSync(text + "\n", options);
    return this;
  }

  /** Appends the provided bytes to the file. */
  async append(
    data: Uint8Array,
    options?: Omit<Deno.WriteFileOptions, "append">,
  ): Promise<this> {
    await this.#withFileForAppending(options, (file) => writeAll(file, data));
    return this;
  }

  /** Synchronously appends the provided bytes to the file. */
  appendSync(
    data: Uint8Array,
    options?: Omit<Deno.WriteFileOptions, "append">,
  ): this {
    this.#withFileForAppendingSync(options, (file) => {
      writeAllSync(file, data);
    });
    return this;
  }

  /** Appends the provided text to the file. */
  async appendText(
    text: string,
    options?: Omit<Deno.WriteFileOptions, "append">,
  ): Promise<this> {
    await this.#withFileForAppending(
      options,
      (file) => writeAll(file, new TextEncoder().encode(text)),
    );
    return this;
  }

  /** Synchronously appends the provided text to the file. */
  appendTextSync(
    text: string,
    options?: Omit<Deno.WriteFileOptions, "append">,
  ): this {
    this.#withFileForAppendingSync(options, (file) => {
      writeAllSync(file, new TextEncoder().encode(text));
    });
    return this;
  }

  #withFileForAppending<T>(
    options: Omit<Deno.WriteFileOptions, "append"> | undefined,
    action: (file: Deno.FsFile) => Promise<T>,
  ) {
    return this.#withFileForWriting({
      append: true,
      ...options,
    }, action);
  }

  async #withFileForWriting<T>(
    options: Deno.WriteFileOptions | undefined,
    action: (file: Deno.FsFile) => Promise<T>,
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
  async #openFileMaybeCreatingDirectory(options: Deno.OpenOptions) {
    const resolvedPath = this.resolve(); // pre-resolve before going async in case the cwd changes
    try {
      return await resolvedPath.open(options);
    } catch (err) {
      if (err instanceof Deno.errors.NotFound) {
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
    options: Omit<Deno.WriteFileOptions, "append"> | undefined,
    action: (file: Deno.FsFile) => T,
  ) {
    return this.#withFileForWritingSync({
      append: true,
      ...options,
    }, action);
  }

  #withFileForWritingSync<T>(
    options: Deno.WriteFileOptions | undefined,
    action: (file: Deno.FsFile) => T,
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
  #openFileForWritingSync(options: Deno.WriteFileOptions | undefined) {
    return this.#openFileMaybeCreatingDirectorySync({
      write: true,
      create: true,
      truncate: options?.append !== true,
      ...options,
    });
  }

  /** Opens a file for writing, but handles if the directory does not exist. */
  #openFileMaybeCreatingDirectorySync(options: Deno.OpenOptions) {
    try {
      return this.openSync(options);
    } catch (err) {
      if (err instanceof Deno.errors.NotFound) {
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
    await Deno.chmod(this.#path, mode);
    return this;
  }

  /** Synchronously changes the permissions of the file or directory. */
  chmodSync(mode: number): this {
    Deno.chmodSync(this.#path, mode);
    return this;
  }

  /** Changes the ownership permissions of the file. */
  async chown(uid: number | null, gid: number | null): Promise<this> {
    await Deno.chown(this.#path, uid, gid);
    return this;
  }

  /** Synchronously changes the ownership permissions of the file. */
  chownSync(uid: number | null, gid: number | null): this {
    Deno.chownSync(this.#path, uid, gid);
    return this;
  }

  /** Creates a new file or opens the existing one. */
  create(): Promise<FsFileWrapper> {
    return Deno.create(this.#path)
      .then((file) => createFsFileWrapper(file));
  }

  /** Synchronously creates a new file or opens the existing one. */
  createSync(): FsFileWrapper {
    return createFsFileWrapper(Deno.createSync(this.#path));
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
  open(options?: Deno.OpenOptions): Promise<FsFileWrapper> {
    return Deno.open(this.#path, options)
      .then((file) => createFsFileWrapper(file));
  }

  /** Opens a file synchronously. */
  openSync(options?: Deno.OpenOptions): FsFileWrapper {
    return createFsFileWrapper(Deno.openSync(this.#path, options));
  }

  /** Removes the file or directory from the file system. */
  async remove(options?: Deno.RemoveOptions): Promise<this> {
    await Deno.remove(this.#path, options);
    return this;
  }

  /** Removes the file or directory from the file system synchronously. */
  removeSync(options?: Deno.RemoveOptions): this {
    Deno.removeSync(this.#path, options);
    return this;
  }

  /** Removes the file or directory from the file system, but doesn't throw
   * when the file doesn't exist.
   */
  async ensureRemove(options?: Deno.RemoveOptions): Promise<this> {
    try {
      return await this.remove(options);
    } catch (err) {
      if (err instanceof Deno.errors.NotFound) {
        return this;
      } else {
        throw err;
      }
    }
  }

  /** Removes the file or directory from the file system, but doesn't throw
   * when the file doesn't exist.
   */
  ensureRemoveSync(options?: Deno.RemoveOptions): this {
    try {
      return this.removeSync(options);
    } catch (err) {
      if (err instanceof Deno.errors.NotFound) {
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
    await emptyDir(this.toString());
    return this;
  }

  /** Synchronous version of `emptyDir()` */
  emptyDirSync(): this {
    emptyDirSync(this.toString());
    return this;
  }

  /** Ensures that the directory exists.
   * If the directory structure does not exist, it is created. Like mkdir -p.
   */
  async ensureDir(): Promise<this> {
    await ensureDir(this.toString());
    return this;
  }

  /** Synchronously ensures that the directory exists.
   * If the directory structure does not exist, it is created. Like mkdir -p.
   */
  ensureDirSync(): this {
    ensureDirSync(this.toString());
    return this;
  }

  /**
   * Ensures that the file exists.
   * If the file that is requested to be created is in directories that do
   * not exist these directories are created. If the file already exists,
   * it is NOTMODIFIED.
   */
  async ensureFile(): Promise<this> {
    await ensureFile(this.toString());
    return this;
  }

  /**
   * Synchronously ensures that the file exists.
   * If the file that is requested to be created is in directories that do
   * not exist these directories are created. If the file already exists,
   * it is NOTMODIFIED.
   */
  ensureFileSync(): this {
    ensureFileSync(this.toString());
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
    await copy(this.#path, pathRef.toString(), options);
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
    copySync(this.#path, pathRef.toString(), options);
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
    return Deno.copyFile(this.#path, pathRef.toString())
      .then(() => pathRef);
  }

  /**
   * Copies the file to the destination path synchronously.
   * @returns The destination path.
   */
  copyFileSync(destinationPath: string | URL | Path): Path {
    const pathRef = ensurePath(destinationPath);
    Deno.copyFileSync(this.#path, pathRef.toString());
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
    return Deno.rename(this.#path, pathRef.toString()).then(() => pathRef);
  }

  /**
   * Moves the file or directory returning the renamed path synchronously.
   * @returns The destination path.
   */
  renameSync(newPath: string | URL | Path): Path {
    const pathRef = ensurePath(newPath);
    Deno.renameSync(this.#path, pathRef.toString());
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
    const file = await Deno.open(this.#path, { read: true });
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

function createFsFileWrapper(file: Deno.FsFile): FsFileWrapper {
  Object.setPrototypeOf(file, FsFileWrapper.prototype);
  return file as FsFileWrapper;
}

/** Wrapper around `Deno.FsFile` that has more helper methods. */
export class FsFileWrapper extends Deno.FsFile {
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
  if (kind == null && Deno.build.os === "windows") {
    const info = await opts.targetPath.lstat();
    if (info?.isDirectory) {
      kind = "dir";
    } else if (info?.isFile) {
      kind = "file";
    } else {
      throw new Deno.errors.NotFound(
        `The target path '${opts.targetPath}' did not exist or path kind could not be determined. ` +
          `When the path doesn't exist, you need to specify a symlink type on Windows.`,
      );
    }
  }

  await Deno.symlink(
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
  if (kind == null && Deno.build.os === "windows") {
    const info = opts.targetPath.lstatSync();
    if (info?.isDirectory) {
      kind = "dir";
    } else if (info?.isFile) {
      kind = "file";
    } else {
      throw new Deno.errors.NotFound(
        `The target path '${opts.targetPath}' did not exist or path kind could not be determined. ` +
          `When the path doesn't exist, you need to specify a symlink type on Windows.`,
      );
    }
  }

  Deno.symlinkSync(
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
    if (err instanceof Deno.errors.NotFound) {
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
    if (err instanceof Deno.errors.NotFound) {
      return undefined;
    } else {
      throw err;
    }
  }
}

async function writeAll(
  writer: { write(data: Uint8Array): Promise<number> },
  data: Uint8Array,
) {
  let nwritten = 0;
  while (nwritten < data.length) {
    nwritten += await writer.write(data.subarray(nwritten));
  }
}

function writeAllSync(
  writer: { writeSync(data: Uint8Array): number },
  data: Uint8Array,
) {
  let nwritten = 0;
  while (nwritten < data.length) {
    nwritten += writer.writeSync(data.subarray(nwritten));
  }
}
