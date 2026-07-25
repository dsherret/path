import { build, emptyDir } from "@deno/dnt";
import * as esbuild from "esbuild";

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
  skipSourceOutput: true,
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
    await bundleIntoSingleFile();
  },
});

// bundles the esm output into a single mod.js so the published
// package doesn't ship the jsr.io deps as many small files
async function bundleIntoSingleFile() {
  // dnt rewrites `globalThis` to a merge proxy even with no shims,
  // so replace it with a passthrough before bundling
  await Deno.writeTextFile(
    "npm/esm/_dnt.shims.js",
    "export const dntGlobalThis = globalThis;\n",
  );
  const bundle = await esbuild.build({
    entryPoints: ["npm/esm/mod.js"],
    bundle: true,
    format: "esm",
    platform: "neutral",
    external: ["node:*"],
    write: false,
  });
  await esbuild.stop();
  await Deno.remove("npm/esm/deps", { recursive: true });
  for await (const entry of Deno.readDir("npm/esm")) {
    if (entry.isFile && entry.name.endsWith(".js") && entry.name !== "mod.js") {
      await Deno.remove(`npm/esm/${entry.name}`);
    }
  }
  // nothing references the shim types, so don't ship them
  await Deno.remove("npm/esm/_dnt.shims.d.ts");
  await Deno.writeTextFile("npm/esm/mod.js", bundle.outputFiles[0].text);
}
