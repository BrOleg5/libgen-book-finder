const assert = require("assert");
require("../lib/libgen.js");
require("../lib/settings.js");
const G = globalThis.LibGen;
const S = globalThis.LibGenSettings;

assert.strictEqual(G.inferFamily("libgen.is"), "classic");
assert.strictEqual(G.inferFamily("https://libgen.li/"), "li");
assert.strictEqual(G.buildSearchUrl("https://libgen.li", "li", { kind: "isbn", value: "9780306406157" }), "https://libgen.li/index.php?req=9780306406157");
assert.strictEqual(G.buildSearchUrl("https://libgen.li", "li", { kind: "doi", value: "10.1000/a" }), "https://libgen.li/index.php?req=10.1000%2Fa");
assert.strictEqual(G.buildSearchUrl("https://libgen.li", "li", { kind: "text", value: "A & B" }), "https://libgen.li/index.php?req=A%20%26%20B");
assert.strictEqual(G.buildSearchUrl("https://libgen.is", "classic", { kind: "isbn", value: "9780306406157" }), "https://libgen.is/search.php?req=9780306406157&column=identifier&res=100");
assert.strictEqual(G.buildSearchUrl("https://libgen.is", "classic", { kind: "doi", value: "10.1000/a" }), "https://libgen.is/scimag/?q=10.1000%2Fa");
assert.strictEqual(G.buildSearchUrl("https://libgen.is", "classic", { kind: "text", value: "Book" }), "https://libgen.is/search.php?req=Book&column=def&res=100");
assert.deepStrictEqual(S.sanitizeMirrorList(["libgen.is classic"]), [{ host: "libgen.is", family: "classic" }]);
assert.deepStrictEqual(S.sanitizeMirrorList(["example.test"]), [{ host: "example.test", family: "li" }]);

console.log("libgen tests passed");
