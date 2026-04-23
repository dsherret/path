# @david/path

[![JSR](https://jsr.io/badges/@david/path)](https://jsr.io/@david/path)

Path class for JavaScript.

- [Docs](https://jsr.io/@david/path/doc/~/Path)

## Setup

```
deno add @david/path
```

## Example

```ts
import { path } from "@david/path";

const srcDir = path("src");

console.log(srcDir.existsSync());

const dataFile = srcDir.join("data.txt");
dataFile.writeTextSync("Hello there!");
```

Alternatively you can construct the `Path` class directly:

```ts
import { Path } from "@david/path";

const srcDir = new Path("src");
```

## Road to 1.0

I would like to stabilize this, but first I want to get more feedback on it.
