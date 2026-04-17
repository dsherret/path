import { readlinkSync } from "node:fs";
import { readlink } from "node:fs/promises";
import * as stdPath from "node:path";
import { fileURLToPath } from "node:url";
import {
  assert,
  assertEquals,
  assertRejects,
  assertThrows,
  cwd,
  inspect,
  isNode,
  isWindows,
  test,
  withTempDir,
} from "./_test_util.ts";
import { Path } from "./mod.ts";

test("create from path ref", () => {
  const path = new Path("src");
  const path2 = new Path(path);
  const path3 = new Path(path);
  assertEquals(path, path2);
  assertEquals(path.toString(), path3.toString());
});

test("custom inspect", () => {
  const path = new Path("src");
  assertEquals(inspect(path), 'Path("src")');
});

test("equals", () => {
  const path = new Path("src");
  assert(path.equals(new Path("src")));
  assert(!path.equals(new Path("src2")));
  assert(path.equals(new Path("src").resolve()));
});

test("join", () => {
  const path = new Path("src");
  const newPath = path.join("other", "test");
  assertEquals(path.toString(), "src");
  assertEquals(newPath.toString(), stdPath.join("src", "other", "test"));
});

test("resolve", () => {
  const path = new Path("src").resolve();
  assertEquals(path.toString(), stdPath.resolve("src"));
});

test("normalize", () => {
  const path = new Path("src").normalize();
  assertEquals(path.toString(), stdPath.normalize("src"));
});

test("isDir", async () => {
  await withTempDir((dir) => {
    assert(dir.isDirSync());
    const file = dir.join("mod.ts");
    file.writeSync("");
    assert(!file.isDirSync());
    assert(!dir.join("nonExistent").isDirSync());
  });
});

test("isFile", async () => {
  await withTempDir((dir) => {
    const file = dir.join("mod.ts");
    file.writeSync("");
    assert(!dir.isFileSync());
    assert(file.isFileSync());
    assert(!dir.join("nonExistent").isFileSync());
  });
});

test("isSymlink", async () => {
  await withTempDir(() => {
    const file = new Path("file.txt").writeSync("");
    const symlinkFile = new Path("test.txt");
    symlinkFile.symlinkToSync(file, { kind: "absolute" });
    assert(symlinkFile.isSymlinkSync());
    assert(!file.isSymlinkSync());
  });
});

test("isAbsolute", () => {
  assert(!new Path("src").isAbsolute());
  assert(new Path("src").resolve().isAbsolute());
});

test("isRelative", () => {
  assert(new Path("src").isRelative());
  assert(!new Path("src").resolve().isRelative());
});

test("parent", () => {
  const parent = new Path("src").parent()!;
  assertEquals(parent.toString(), cwd());
  const lastParent = Array.from(parent.ancestors()).at(-1)!;
  assertEquals(lastParent.parent(), undefined);
});

test("parentOrThrow", () => {
  const parent = new Path("src").parentOrThrow();
  assertEquals(parent.toString(), cwd());
  const lastParent = Array.from(parent.ancestors()).at(-1)!;
  assertThrows(() => lastParent.parentOrThrow(), Error);
});

test("ancestors", () => {
  const srcDir = new Path("src").resolve();
  let lastDir = srcDir;
  for (const ancestor of srcDir.ancestors()) {
    assert(ancestor.toString().length < lastDir.toString().length);
    lastDir = ancestor;
  }
});

test("components", () => {
  {
    const srcDir = new Path("src").resolve();
    const components = Array.from(srcDir.components());
    for (const component of components) {
      assert(!component.includes("/"));
      assert(!component.includes("\\"));
    }
    let expectedLength = srcDir.toString().split(stdPath.sep).length;
    if (!isWindows) {
      expectedLength--; // for leading slash
    }
    assertEquals(components.length, expectedLength);
  }
  {
    const srcDir = new Path("../src");
    const components = Array.from(srcDir.components());
    assertEquals(components, ["..", "src"]);
  }
  {
    const srcDir = new Path("./src");
    const components = Array.from(srcDir.components());
    assertEquals(components, ["src"]);
  }
  // trailing slash
  {
    const srcDir = new Path("./src/");
    const components = Array.from(srcDir.components());
    assertEquals(components, ["src"]);
  }

  // current dir
  {
    const srcDir = new Path(".");
    const components = Array.from(srcDir.components());
    // todo: is this correct?
    assertEquals(components, ["."]);
  }

  // empty dir
  {
    const srcDir = new Path("src/test//asdf");
    const components = Array.from(srcDir.components());
    assertEquals(components, ["src", "test", "asdf"]); // does the same as rust
  }

  // windows prefix
  {
    const prefixed = new Path("\\\\?\\testing\\this\\out");
    const components = Array.from(prefixed.components());
    // todo: is this correct?
    assertEquals(components, ["\\\\?\\testing", "this", "out"]);
  }
});

test("startsWith", () => {
  {
    const srcDir = new Path("src").resolve();
    const thisDir = new Path(".").resolve();
    assert(srcDir.startsWith(thisDir));
    assert(!thisDir.startsWith(srcDir));
  }
});

test("endsWith", () => {
  {
    const srcDir = new Path("src").resolve();
    const thisDir = new Path(".").resolve();
    assert(!srcDir.endsWith(thisDir));
    assert(!thisDir.endsWith(srcDir));
    assert(srcDir.endsWith("src"));
  }
  // nested
  {
    const nestedDir = new Path("src/nested");
    assert(nestedDir.endsWith("src/nested"));
  }
  // trailing slash
  {
    const nestedDir = new Path("src/nested/");
    assert(nestedDir.endsWith("src/nested"));
    assert(nestedDir.endsWith("src/nested/"));
  }
  // the same, then not
  {
    const nestedDir = new Path("src/nested").resolve();
    assert(!nestedDir.endsWith("test/src/nested"));
  }
});

test("resolve", () => {
  // there are more tests elsewhere
  const srcDir = new Path("src").resolve();
  const assetsDir = srcDir.resolve("assets");
  assert(assetsDir.toString().endsWith("assets"));

  // should be the same object since it is known to be resolved
  assert(assetsDir === assetsDir.resolve());
});

test("known resolved", () => {
  // there are more tests elsewhere
  const srcDir = new Path("src").resolve();
  const newPath = new Path(srcDir.toString());

  // should be the same object since the existing path was resolved
  assert(newPath === newPath.resolve());
});

test("stat", async () => {
  await withTempDir(async () => {
    new Path("src").mkdirSync();
    const stat1 = await new Path("src").stat();
    assertEquals(stat1?.isDirectory(), true);
    const stat2 = await new Path("nonExistent").stat();
    assertEquals(stat2, undefined);
    const tempFile = new Path("temp.txt").writeSync("");
    const symlinkFile = new Path("other.txt");
    await symlinkFile.symlinkTo(tempFile, { kind: "absolute" });
    const stat3 = await symlinkFile.stat();
    assertEquals(stat3!.isFile(), true);
    assertEquals(stat3!.isSymbolicLink(), false);
  });
});

test("statSync", async () => {
  await withTempDir(() => {
    new Path("src").mkdirSync();
    const stat1 = new Path("src").statSync();
    assertEquals(stat1?.isDirectory(), true);
    const stat2 = new Path("nonExistent").statSync();
    assertEquals(stat2, undefined);

    const tempFile = new Path("temp.txt").writeSync("");
    const symlinkFile = new Path("other.txt");
    symlinkFile.symlinkToSync(tempFile, { kind: "absolute" });
    const stat3 = symlinkFile.statSync();
    assertEquals(stat3!.isFile(), true);
    assertEquals(stat3!.isSymbolicLink(), false);
  });
});

test("lstat", async () => {
  await withTempDir(async () => {
    new Path("src").mkdirSync();
    const stat1 = await new Path("src").lstat();
    assertEquals(stat1?.isDirectory(), true);
    const stat2 = await new Path("nonExistent").lstat();
    assertEquals(stat2, undefined);

    const symlinkFile = new Path("temp.txt");
    const otherFile = new Path("other.txt").writeSync("");
    // path ref
    await symlinkFile.symlinkTo(otherFile, { kind: "absolute" });
    const stat3 = await symlinkFile.lstat();
    assertEquals(stat3!.isSymbolicLink(), true);
  });
});

test("lstatSync", async () => {
  await withTempDir(() => {
    new Path("src").mkdirSync();
    const stat1 = new Path("src").lstatSync();
    assertEquals(stat1?.isDirectory(), true);
    const stat2 = new Path("nonExistent").lstatSync();
    assertEquals(stat2, undefined);
    const symlinkFile = new Path("temp.txt");
    const otherFile = new Path("other.txt").writeSync("");
    symlinkFile.symlinkToSync(otherFile, { kind: "absolute" });
    assertEquals(symlinkFile.lstatSync()!.isSymbolicLink(), true);
  });
});

test("withExtname", () => {
  let path = new Path("src").resolve();
  path = path.join("temp", "other");
  assertEquals(path.basename(), "other");
  assertEquals(path.extname(), undefined);
  path = path.withExtname("test");
  assertEquals(path.basename(), "other.test");
  path = path.withExtname("test2");
  assertEquals(path.basename(), "other.test2");
  assertEquals(path.extname(), ".test2");
  path = path.withExtname(".txt");
  assertEquals(path.basename(), "other.txt");
  assertEquals(path.extname(), ".txt");
  path = path.withExtname("");
  assertEquals(path.basename(), "other");
  assertEquals(path.extname(), undefined);
  path = path.withExtname("txt");
  assertEquals(path.basename(), "other.txt");
  assertEquals(path.extname(), ".txt");
});

test("withBasename", () => {
  let path = new Path("src").resolve();
  path = path.join("temp", "other");
  assertEquals(path.basename(), "other");
  path = path.withBasename("test");
  assertEquals(path.basename(), "test");
  path = path.withBasename("other.asdf");
  assertEquals(path.basename(), "other.asdf");
});

test("relative", () => {
  const path1 = new Path("src");
  const path2 = new Path(".github");
  assertEquals(
    path1.relative(path2),
    isWindows ? "..\\.github" : "../.github",
  );
});

test("exists", async () => {
  await withTempDir(async () => {
    const file = new Path("file");
    assert(!await file.exists());
    assert(!file.existsSync());
    file.writeSync("");
    assert(await file.exists());
    assert(file.existsSync());
  });
});

test("realpath", async () => {
  await withTempDir(async (tempDir) => {
    let file = tempDir.join("file").resolve();
    file.writeSync("");
    // need to do realPathSync for GH actions CI
    file = file.realPathSync();
    // for the comparison, node doesn't canonicalize
    // RUNNER~1 to runneradmin for some reason
    if (isNode && isWindows) {
      file = new Path(
        file.toString().replace("\\RUNNER~1\\", "\\runneradmin\\"),
      );
    }
    const symlink = new Path("other");
    symlink.symlinkToSync(file, { kind: "absolute" });
    assertEquals(
      (await symlink.realPath()).toString(),
      file.toString(),
    );
    assertEquals(
      symlink.realPathSync().toString(),
      file.toString(),
    );
  });
});

test("mkdir", async () => {
  await withTempDir(async () => {
    const path = new Path("dir");
    await path.mkdir();
    assert(path.isDirSync());
    path.removeSync();
    assert(!path.isDirSync());
    path.mkdirSync();
    assert(path.isDirSync());
    const nestedDir = path.join("subdir", "subsubdir", "sub");
    await assertRejects(() => nestedDir.mkdir({ recursive: false }));
    assertThrows(() => nestedDir.mkdirSync({ recursive: false }));
    assert(!nestedDir.parentOrThrow().existsSync());
    await nestedDir.mkdir();
    assert(nestedDir.existsSync());
    await path.remove({ recursive: true });
    assert(!path.existsSync());
    nestedDir.mkdirSync();
    assert(nestedDir.existsSync());
  });
});

test("symlinkTo", async () => {
  await withTempDir(async () => {
    const destFile = new Path("temp.txt").writeSync("");
    const symlinkFile = destFile.parentOrThrow().join("other.txt");
    await symlinkFile.symlinkTo(destFile, {
      kind: "absolute",
    });
    const stat = await symlinkFile.stat();
    assertEquals(stat!.isFile(), true);
    assertEquals(stat!.isSymbolicLink(), false);
    assert(symlinkFile.isSymlinkSync());

    // invalid
    await assertRejects(
      async () => {
        // @ts-expect-error should require an options bag
        await symlinkFile.symlinkTo(destFile);
      },
      Error,
      "Please specify if this symlink is absolute or relative. Otherwise provide the target text.",
    );
  });
});

test("symlinkToSync", async () => {
  await withTempDir(() => {
    const destFile = new Path("temp.txt").writeSync("");
    const symlinkFile = destFile.parentOrThrow().join("other.txt");

    // path ref
    symlinkFile.symlinkToSync(destFile, { kind: "absolute" });
    const stat = symlinkFile.statSync();
    assertEquals(stat!.isFile(), true);
    assertEquals(stat!.isSymbolicLink(), false);
    assert(symlinkFile.isSymlinkSync());

    // path ref absolute
    symlinkFile.removeSync();
    symlinkFile.symlinkToSync(destFile, { kind: "absolute" });
    assertEquals(symlinkFile.statSync()!.isFile(), true);

    // path ref relative
    symlinkFile.removeSync();
    symlinkFile.symlinkToSync(destFile, { kind: "relative" });
    assertEquals(symlinkFile.statSync()!.isFile(), true);

    // relative text
    symlinkFile.removeSync();
    symlinkFile.symlinkToSync("temp.txt");
    assertEquals(symlinkFile.statSync()!.isFile(), true);

    // invalid
    assertThrows(
      () => {
        // @ts-expect-error should require an options bag
        symlinkFile.symlinkToSync(destFile);
      },
      Error,
      "Please specify if this symlink is absolute or relative. Otherwise provide the target text.",
    );
  });
});

test("symlinkTo relative between sibling directories (issue #8)", async () => {
  await withTempDir(async (tempDir) => {
    const dirA = tempDir.join("a").mkdirSync();
    const dirB = tempDir.join("b").mkdirSync();
    const fileA = dirA.join("a.txt").writeSync("hello");
    const symlinkAtB = dirB.join("b.txt");

    await symlinkAtB.symlinkTo(fileA, { kind: "relative" });
    // the symlink must actually resolve to the target file
    assertEquals(symlinkAtB.readTextSync(), "hello");
    // and the stored target text must be the dir-relative path
    const target = await readlink(symlinkAtB.toString());
    assertEquals(target, stdPath.join("..", "a", "a.txt"));
  });
});

test("symlinkToSync relative between sibling directories (issue #8)", async () => {
  await withTempDir((tempDir) => {
    const dirA = tempDir.join("a").mkdirSync();
    const dirB = tempDir.join("b").mkdirSync();
    const fileA = dirA.join("a.txt").writeSync("hello");
    const symlinkAtB = dirB.join("b.txt");

    symlinkAtB.symlinkToSync(fileA, { kind: "relative" });
    assertEquals(symlinkAtB.readTextSync(), "hello");
    assertEquals(
      readlinkSync(symlinkAtB.toString()),
      stdPath.join("..", "a", "a.txt"),
    );
  });
});

test("symlinkTo relative across deeper directory structures", async () => {
  await withTempDir((tempDir) => {
    tempDir.join("x/y/z").mkdirSync({ recursive: true });
    tempDir.join("other").mkdirSync();
    const target = tempDir.join("other/target.txt").writeSync("data");
    const link = tempDir.join("x/y/z/link.txt");

    link.symlinkToSync(target, { kind: "relative" });
    assertEquals(link.readTextSync(), "data");
    assertEquals(
      readlinkSync(link.toString()),
      stdPath.join("..", "..", "..", "other", "target.txt"),
    );
  });
});

test("symlinkTo relative within same directory stores just the basename", async () => {
  await withTempDir((tempDir) => {
    const target = tempDir.join("target.txt").writeSync("data");
    const link = tempDir.join("link.txt");

    link.symlinkToSync(target, { kind: "relative" });
    assertEquals(readlinkSync(link.toString()), "target.txt");
  });
});

test("linkTo", async () => {
  await withTempDir(async () => {
    const destFile = new Path("temp.txt").writeSync("data");

    // async
    {
      const hardlinkFile = destFile.parentOrThrow().join("other.txt");
      await hardlinkFile.linkTo(destFile);
      const stat = hardlinkFile.statSync();
      assertEquals(stat!.isFile(), true);
      assertEquals(stat!.isSymbolicLink(), false);
      assert(!hardlinkFile.isSymlinkSync());
      assertEquals(hardlinkFile.readTextSync(), "data");
    }

    // sync
    {
      const hardlinkFile = destFile.parentOrThrow().join("sync.txt");
      hardlinkFile.linkToSync(destFile);
      assertEquals(hardlinkFile.readTextSync(), "data");
    }
  });
});

test("readDir", async () => {
  await withTempDir(async () => {
    const dir = new Path(".").resolve();
    dir.join("file1").writeSync("");
    dir.join("file2").writeSync("");

    const entries1 = [];
    for await (const entry of dir.readDir()) {
      entries1.push(entry);
    }
    const entries2 = Array.from(dir.readDirSync());
    entries1.sort((a, b) => a.name.localeCompare(b.name));
    entries2.sort((a, b) => a.name.localeCompare(b.name));

    for (const entries of [entries1, entries2]) {
      assertEquals(entries.length, 2);
      assertEquals(entries[0].name, "file1");
      assertEquals(entries[1].name, "file2");
    }

    const filePaths1 = [];
    for await (const path of dir.readDirFilePaths()) {
      filePaths1.push(path.toString());
    }
    const filePaths2 = Array.from(dir.readDirFilePathsSync()).map((p) =>
      p.toString()
    );
    filePaths1.sort();
    filePaths2.sort();
    assertEquals(filePaths1, filePaths2);
    assertEquals(filePaths1, entries1.map((entry) => entry.path.toString()));
    assertEquals(filePaths1, entries2.map((entry) => entry.path.toString()));
  });
});

test("readBytes", async () => {
  await withTempDir(async () => {
    const file = new Path("file.txt");
    const bytes = new TextEncoder().encode("asdf");
    file.writeSync(bytes);
    assertEquals(file.readBytesSync(), bytes);
    assertEquals(await file.readBytes(), bytes);
    const nonExistent = new Path("not-exists");
    assertThrows(() => nonExistent.readBytesSync());
    await assertRejects(() => nonExistent.readBytes());
  });
});

test("readMaybeBytes", async () => {
  await withTempDir(async () => {
    const file = new Path("file.txt");
    const bytes = new TextEncoder().encode("asdf");
    await file.write(bytes);
    assertEquals(file.readMaybeBytesSync(), bytes);
    assertEquals(await file.readMaybeBytes(), bytes);
    const nonExistent = new Path("not-exists");
    assertEquals(await nonExistent.readMaybeText(), undefined);
    assertEquals(nonExistent.readMaybeTextSync(), undefined);
  });
});

test("readText", async () => {
  await withTempDir(async () => {
    const file = new Path("file.txt");
    file.writeSync("asdf");
    assertEquals(file.readMaybeTextSync(), "asdf");
    assertEquals(await file.readMaybeText(), "asdf");
    const nonExistent = new Path("not-exists");
    assertThrows(() => nonExistent.readTextSync());
    await assertRejects(() => nonExistent.readText());
  });
});

test("readMaybeText", async () => {
  await withTempDir(async () => {
    const file = new Path("file.txt");
    file.writeSync("asdf");
    assertEquals(file.readMaybeTextSync(), "asdf");
    assertEquals(await file.readMaybeText(), "asdf");
    const nonExistent = new Path("not-exists");
    assertEquals(await nonExistent.readMaybeText(), undefined);
    assertEquals(nonExistent.readMaybeTextSync(), undefined);
  });
});

test("lines", async () => {
  await withTempDir(async () => {
    const file = new Path("file.txt");

    // trailing newline is not a blank line
    file.writeSync("a\nb\n");
    assertEquals(await file.lines(), ["a", "b"]);
    assertEquals(file.linesSync(), ["a", "b"]);

    // no trailing newline
    file.writeSync("a\nb");
    assertEquals(file.linesSync(), ["a", "b"]);

    // \r\n line endings
    file.writeSync("a\r\nb\r\n");
    assertEquals(file.linesSync(), ["a", "b"]);

    // embedded blank lines are preserved
    file.writeSync("a\n\nb");
    assertEquals(file.linesSync(), ["a", "", "b"]);

    // double trailing newline drops only one
    file.writeSync("a\n\n");
    assertEquals(file.linesSync(), ["a", ""]);

    // standalone \r is part of the line
    file.writeSync("a\rb\n");
    assertEquals(file.linesSync(), ["a\rb"]);

    // empty file
    file.writeSync("");
    assertEquals(file.linesSync(), []);

    // iterator variants
    file.writeSync("a\nb\n");
    const asyncLines = [];
    for await (const line of file.linesIter()) asyncLines.push(line);
    assertEquals(asyncLines, ["a", "b"]);
    assertEquals(Array.from(file.linesIterSync()), ["a", "b"]);
  });
});

test("readJson", async () => {
  await withTempDir(async () => {
    const file = new Path("file.txt");
    file.writeJsonSync({ test: 123 });
    let data = file.readJsonSync();
    assertEquals(data, { test: 123 });
    data = await file.readJson();
    assertEquals(data, { test: 123 });
  });
});

test("readMaybeJson", async () => {
  await withTempDir(async () => {
    const file = new Path("file.json");
    file.writeJsonSync({ test: 123 });
    let data = file.readMaybeJsonSync();
    assertEquals(data, { test: 123 });
    data = await file.readMaybeJson();
    assertEquals(data, { test: 123 });
    const nonExistent = new Path("not-exists");
    data = nonExistent.readMaybeJsonSync();
    assertEquals(data, undefined);
    data = await nonExistent.readMaybeJson();
    assertEquals(data, undefined);

    file.writeSync("1 23 532lkjladf asd");
    assertThrows(
      () => file.readMaybeJsonSync(),
      Error,
      "Failed parsing JSON in 'file.json'.",
    );
    await assertRejects(
      () => file.readMaybeJson(),
      Error,
      "Failed parsing JSON in 'file.json'.",
    );
  });
});

test("write", async () => {
  await withTempDir(async (dir) => {
    // these should all handle creating the directory when it doesn't exist
    const file1 = dir.join("subDir1/file.txt");
    const file2 = dir.join("subDir2/file.txt");
    const file3 = dir.join("subDir3/file.txt");
    const file4 = dir.join("subDir4/file.txt");

    await file1.write("test");
    assertEquals(file1.readTextSync(), "test");

    file2.writeSync("test");
    assertEquals(file2.readTextSync(), "test");
    file2.writeSync("\ntest", { append: true });
    assertEquals(file2.readTextSync(), "test\ntest");

    await file3.write(new TextEncoder().encode("test"));
    assertEquals(file3.readTextSync(), "test");

    file4.writeSync(new TextEncoder().encode("test"));
    assertEquals(file4.readTextSync(), "test");

    // writing on top of a file should surface the original filesystem error
    const fileOnFile = file1.join("fileOnFile");
    await assertRejects(() => fileOnFile.write("asdf"), Error);
    assertThrows(() => fileOnFile.writeSync("asdf"), Error);
  });
});

test("writeJson", async () => {
  await withTempDir(async () => {
    const path = new Path("file.json");
    await path.writeJson({
      prop: "test",
    });
    assertEquals(path.readTextSync(), `{"prop":"test"}\n`);
    await path.writeJson({
      prop: 1,
    });
    // should truncate
    assertEquals(path.readTextSync(), `{"prop":1}\n`);

    path.writeJsonSync({
      asdf: "test",
    });
    assertEquals(path.readTextSync(), `{"asdf":"test"}\n`);
    path.writeJsonSync({
      asdf: 1,
    });
    // should truncate
    assertEquals(path.readTextSync(), `{"asdf":1}\n`);
  });
});

test("writeJsonPretty", async () => {
  await withTempDir(async () => {
    const path = new Path("file.json");
    await path.writeJsonPretty({
      prop: "test",
    });
    assertEquals(path.readTextSync(), `{\n  "prop": "test"\n}\n`);
    await path.writeJsonPretty({
      prop: 1,
    });
    // should truncate
    assertEquals(path.readTextSync(), `{\n  "prop": 1\n}\n`);

    path.writeJsonPrettySync({
      asdf: "test",
    });
    assertEquals(path.readTextSync(), `{\n  "asdf": "test"\n}\n`);
    path.writeJsonPrettySync({
      asdf: 1,
    });
    // should truncate
    assertEquals(path.readTextSync(), `{\n  "asdf": 1\n}\n`);
  });
});

test("create", async () => {
  await withTempDir(async () => {
    const path = new Path("file.txt").writeSync("text");
    let file = await path.create();
    file.writeSync("asdf");
    file.close();
    path.removeSync();
    file = await path.create();
    file.close();
    file = path.createSync();
    file.writeSync("asdf");
    file.close();
    path.removeSync();
    file = path.createSync();
    file.close();
  });
});

test("createNew", async () => {
  await withTempDir(async () => {
    const path = new Path("file.txt").writeSync("text");
    await assertRejects(() => path.createNew());
    path.removeSync();
    let file = await path.createNew();
    file.close();
    assertThrows(() => path.createNewSync());
    path.removeSync();
    file = path.createNewSync();
    file.close();
  });
});

test("open", async () => {
  await withTempDir(async () => {
    const path = new Path("file.txt").writeSync("text");
    let file = await path.open({ write: true });
    await file.write("1");
    file.writeSync("2");
    file.close();
    file = path.openSync({ write: true, append: true });
    await file.write(new TextEncoder().encode("3"));
    file.close();
    assertEquals(path.readTextSync(), "12xt3");
  });
});

test("remove", async () => {
  await withTempDir(async () => {
    const path = new Path("file.txt").writeSync("text");
    assert(path.existsSync());
    assert(!path.removeSync().existsSync());
    path.writeSync("asdf");
    assert(path.existsSync());
    assert(!(await path.remove()).existsSync());
  });
});

test("emptyDir", async () => {
  await withTempDir(async (path) => {
    const dir = path.join("subDir").mkdirSync();
    const file = dir.join("file.txt").writeSync("text");
    const subDir = dir.join("subDir").mkdirSync();
    subDir.join("test").writeSync("");
    assert((await dir.emptyDir()).existsSync());
    assert(!file.existsSync());
    assert(!subDir.existsSync());
    assert(dir.existsSync());
  });
});

test("emptyDirSync", async () => {
  await withTempDir((path) => {
    const dir = path.join("subDir").mkdirSync();
    const file = dir.join("file.txt").writeSync("text");
    const subDir = dir.join("subDir").mkdirSync();
    subDir.join("test").writeSync("");
    assert(dir.emptyDirSync().existsSync());
    assert(!file.existsSync());
    assert(!subDir.existsSync());
    assert(dir.existsSync());
  });
});

test("ensureDir", async () => {
  await withTempDir(async (path) => {
    const dir = path.join("subDir").mkdirSync();
    const file = dir.join("file.txt").writeSync("text");
    const subDir = dir.join("subDir").mkdirSync();
    subDir.join("test").writeSync("");
    assert((await dir.ensureDir()).existsSync());
    assert(file.existsSync());
    assert(subDir.existsSync());
    assert((await subDir.join("sub/sub").ensureDir()).existsSync());
  });
});

test("ensureDirSync", async () => {
  await withTempDir((path) => {
    const dir = path.join("subDir").mkdirSync();
    const file = dir.join("file.txt").writeSync("text");
    const subDir = dir.join("subDir").mkdirSync();
    subDir.join("test").writeSync("");
    assert(dir.ensureDirSync().isDirSync());
    assert(file.existsSync());
    assert(subDir.existsSync());
    assert(subDir.join("sub/sub").ensureDirSync().isDirSync());
  });
});

test("ensureFile", async () => {
  await withTempDir(async (path) => {
    const dir = path.join("subDir");
    const file = dir.join("file.txt");
    assert((await file.ensureFile()).isFileSync());
    assert(dir.join("sub.txt").ensureFileSync().isFileSync());
  });
});

test("copy", async () => {
  // file
  await withTempDir(async () => {
    const path = new Path("file.txt").writeSync("text");
    const newPath = await path.copy("other.txt");
    assert(path.existsSync());
    assert(newPath.existsSync());
    assertEquals(newPath.readTextSync(), "text");
    const newPath2 = path.copySync("other2.txt");
    assert(newPath2.existsSync());
    assertEquals(newPath2.readTextSync(), "text");
  });
  // directory
  await withTempDir(async () => {
    const dir = new Path("dir").mkdirSync();
    dir.join("file.txt").writeSync("text");
    const dir2 = new Path("dir2");
    await dir.copy(dir2);
    assertEquals(dir2.join("file.txt").readTextSync(), "text");
    await assertRejects(() => dir.copy(dir2));
    assertEquals(dir2.join("file.txt").readTextSync(), "text");
    dir.join("file.txt").writeSync("text2");
    await dir.copy(dir2, { overwrite: true });
    assertEquals(dir2.join("file.txt").readTextSync(), "text2");
  });
});

test("copyToDir", async () => {
  await withTempDir(async () => {
    const path = new Path("file.txt")
      .writeSync("text");
    const dir = new Path("dir").mkdirSync();
    const newPath = await path.copyToDir(dir);
    assert(path.existsSync());
    assert(newPath.existsSync());
    assertEquals(dir.join("file.txt").toString(), newPath.toString());
    assertEquals(newPath.readTextSync(), "text");
    const dir2 = new Path("dir2").mkdirSync();
    const newPath2 = path.copyToDirSync(dir2);
    assert(newPath2.existsSync());
    assertEquals(newPath2.readTextSync(), "text");
    assertEquals(newPath2.toString(), dir2.join("file.txt").toString());
  });
});

test("rename", async () => {
  await withTempDir(async () => {
    const path = new Path("file.txt").writeSync("");
    const newPath = path.renameSync("other.txt");
    assert(!path.existsSync());
    assert(newPath.existsSync());
    path.writeSync("");
    const newPath2 = await path.rename("other2.txt");
    assert(!path.existsSync());
    assert(newPath2.existsSync());
  });
});

test("renameToDir", async () => {
  await withTempDir(async () => {
    const path = new Path("file.txt")
      .writeSync("text");
    const dir = new Path("dir").mkdirSync();
    const newPath = await path.renameToDir(dir);
    assert(!path.existsSync());
    assert(newPath.existsSync());
    assertEquals(dir.join("file.txt").toString(), newPath.toString());
    assertEquals(newPath.readTextSync(), "text");
    const dir2 = new Path("dir2").mkdirSync();
    const newPath2 = newPath.renameToDirSync(dir2);
    assert(!newPath.existsSync());
    assert(newPath2.existsSync());
    assertEquals(newPath2.readTextSync(), "text");
    assertEquals(newPath2.toString(), dir2.join("file.txt").toString());

    // now try a directory
    await dir2.renameToDir(dir);
    assert(dir.join("dir2").join("file.txt").existsSync());

    // try a directory sync
    const subDir = dir.join("subdir");
    subDir.mkdirSync();
    dir.join("dir2").renameToDirSync(subDir);
    assert(subDir.join("dir2").join("file.txt").existsSync());
  });
});

test("pipeTo", async () => {
  await withTempDir(async () => {
    const largeText = "asdf".repeat(100_000);
    const textFile = new Path("file.txt").writeSync(largeText);
    const otherFilePath = textFile.parentOrThrow().join("other.txt");
    const otherFile = otherFilePath.openSync({ write: true, create: true });
    await textFile.pipeTo(otherFile.writable);
    assertEquals(otherFilePath.readTextSync(), largeText);
  });
});

test("instanceof check", () => {
  class OtherPath {
    // should match because of this
    private static instanceofSymbol = Symbol.for("@david/path.Path");

    // deno-lint-ignore no-explicit-any
    static [Symbol.hasInstance](instance: any) {
      return instance?.constructor?.instanceofSymbol ===
        OtherPath.instanceofSymbol;
    }
  }

  assert(new Path("test") instanceof Path);
  assert(!(new URL("https://example.com") instanceof Path));
  assert(new OtherPath() instanceof Path);
  assert(new Path("test") instanceof OtherPath);
});

test("toFileUrl", () => {
  const path = new Path(import.meta.url);
  assertEquals(path.toString(), fileURLToPath(import.meta.url));
  assertEquals(path.toFileUrl(), new URL(import.meta.url));
});

test("append", async () => {
  await withTempDir(async (path) => {
    const file = path.join("file.txt");
    await file.append(new TextEncoder().encode("1\n"));
    file.appendSync(new TextEncoder().encode("2\n"));
    await file.append("3\n");
    file.appendSync("4\n");
    assertEquals(file.readTextSync(), "1\n2\n3\n4\n");
  });
});

test("open with create but no truncate preserves existing content", async () => {
  await withTempDir(async () => {
    const path = new Path("file.txt").writeSync("hello");
    // { write: true, create: true } without truncate — should NOT truncate
    const file = await path.open({ write: true, create: true });
    await file.write("hi");
    file.close();
    // "hi" overwrites first 2 bytes, "llo" preserved
    assertEquals(path.readTextSync(), "hillo");
  });
});

test("open with create on missing file creates without truncate", async () => {
  await withTempDir(() => {
    const path = new Path("new.txt");
    const file = path.openSync({ write: true, create: true });
    file.writeSync("fresh");
    file.close();
    assertEquals(path.readTextSync(), "fresh");
  });
});

test("open with truncate truncates existing file", async () => {
  await withTempDir(() => {
    const path = new Path("file.txt").writeSync("hello");
    const file = path.openSync({ write: true, create: true, truncate: true });
    file.writeSync("hi");
    file.close();
    assertEquals(path.readTextSync(), "hi");
  });
});

test("open read+write roundtrip", async () => {
  await withTempDir(() => {
    const path = new Path("file.txt").writeSync("abcdef");
    const file = path.openSync({ read: true, write: true });
    file.writeSync("XYZ");
    file.close();
    assertEquals(path.readTextSync(), "XYZdef");
  });
});

test("write honors AbortSignal", async () => {
  await withTempDir(async () => {
    const path = new Path("file.txt");
    const controller = new AbortController();
    controller.abort(new Error("aborted-by-test"));
    await assertRejects(
      () =>
        path.write(new TextEncoder().encode("x"), {
          signal: controller.signal,
        }),
      Error,
      "aborted-by-test",
    );
    assertThrows(
      () =>
        path.writeSync(new TextEncoder().encode("x"), {
          signal: controller.signal,
        }),
      Error,
      "aborted-by-test",
    );
  });
});

test("append honors AbortSignal", async () => {
  await withTempDir(async () => {
    const path = new Path("file.txt").writeSync("start");
    const controller = new AbortController();
    controller.abort(new Error("aborted-by-test"));
    await assertRejects(
      () =>
        path.append(new TextEncoder().encode("x"), {
          signal: controller.signal,
        }),
      Error,
      "aborted-by-test",
    );
    // file content unchanged
    assertEquals(path.readTextSync(), "start");
  });
});

test("readBytes honors AbortSignal", async () => {
  await withTempDir(async () => {
    const path = new Path("file.txt").writeSync("data");
    const controller = new AbortController();
    controller.abort(new Error("aborted-by-test"));
    await assertRejects(
      () => path.readBytes({ signal: controller.signal }),
      Error,
    );
    await assertRejects(
      () => path.readText({ signal: controller.signal }),
      Error,
    );
  });
});

test("mkdir honors mode", async () => {
  if (isWindows) return; // POSIX permissions are not meaningful on Windows
  await withTempDir(async (tempDir) => {
    const dir = tempDir.join("restricted");
    await dir.mkdir({ mode: 0o700 });
    const info = dir.statSync()!;
    // mask with 0o777 since mode also encodes file type bits
    assertEquals(info.mode & 0o777, 0o700);
    const dir2 = tempDir.join("restricted2");
    dir2.mkdirSync({ mode: 0o750 });
    assertEquals(dir2.statSync()!.mode & 0o777, 0o750);
  });
});

test("open honors mode when creating", async () => {
  if (isWindows) return;
  await withTempDir((tempDir) => {
    const path = tempDir.join("perms.txt");
    const file = path.openSync({
      write: true,
      create: true,
      mode: 0o640,
    });
    file.close();
    assertEquals(path.statSync()!.mode & 0o777, 0o640);
  });
});
