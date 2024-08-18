# @david/path

[![JSR](https://jsr.io/badges/@david/path)](https://jsr.io/@david/path)

Path class for JavaScript built on top of [@std/path](https://jsr.io/@std/path)
and [@std/fs](https://jsr.io/@std/fs).

- [Docs](https://jsr.io/@david/path/doc/~/Path)

## Setup

```
deno add @david/path
```

## Example

```ts
import { Path } from "@david/path";

const srcDir = new Path("src");

console.log(srcDir.existsSync());

const dataFile = srcDir.join("data.txt");
dataFile.writeTextSync("Hello there!");
```

## Road to 1.0

I would like to stabilize this to 1.0, but first I want to get more feedback on
it.
