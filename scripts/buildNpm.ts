import { build, emptyDir } from "@deno/dnt";

Deno.chdir(new URL("../", import.meta.url));

await emptyDir("./npm");

await build({
  entryPoints: ["./mod.ts"],
  outDir: "./npm",
  shims: {},
  test: false,
  compilerOptions: {
    stripInternal: false,
    skipLibCheck: false,
    lib: ["ESNext"],
    target: "ES2022",
  },
  scriptModule: false,
  declarationMap: false,
  package: {
    name: "@dsherret/path",
    // only used for publishing, so a placeholder is fine for local builds
    version: Deno.args[0] ?? "0.0.0",
    description: "Path class for JavaScript.",
    license: "MIT",
    repository: {
      type: "git",
      url: "git+https://github.com/dsherret/path.git",
    },
    keywords: [
      "path",
      "fs",
      "file",
      "filesystem",
      "directory",
    ],
    bugs: {
      url: "https://github.com/dsherret/path/issues",
    },
    devDependencies: {
      "@types/node": "^24.0.0",
    },
  },
  async postBuild() {
    Deno.copyFileSync("LICENSE", "npm/LICENSE");
    const readme = await Deno.readTextFile("README.md");
    await Deno.writeTextFile(
      "npm/README.md",
      readme.replaceAll('"@david/path"', '"@dsherret/path"'),
    );
  },
});
