const assert = require("assert");
require("../lib/isbn.js");
const I = globalThis.LibGenIsbn;

assert.strictEqual(I.normalizeIsbn("978-0-306-40615-7"), "9780306406157");
assert.strictEqual(I.normalizeIsbn("0-306-40615-2"), "9780306406157");
assert.strictEqual(I.normalizeIsbn("978-0-306-40615-8"), null);
assert.deepStrictEqual(I.extractAllIsbns("ISBN-13 \u200f : \u200e 978-0-306-40615-7"), ["9780306406157"]);
assert.deepStrictEqual(I.extractAllIsbns("code 0306406152 should not be treated as an ISBN"), []);
assert.deepStrictEqual(I.extractAllIsbns("ISBN: 0306406152"), ["9780306406157"]);
assert.deepStrictEqual(I.extractAllIsbns("x97803064061570y"), []);
assert.strictEqual(I.extractIsbnFromUrl("https://amazon.com/dp/0306406152"), "9780306406157");
assert.strictEqual(I.extractIsbnFromUrl("https://amazon.com/dp/B09ABCDE12"), null);
assert.strictEqual(I.extractIsbnFromUrl("https://books.google.test/?vid=ISBN9780306406157"), "9780306406157");
assert.strictEqual(I.isbnFromDoi("10.1007/978-0-306-40615-7_3"), "9780306406157");
assert.strictEqual(I.isbnFromDoi("10.1007/978-3-030-12345-6_3"), null);

let picked = I.choosePrimaryQuery({ metadataIsbns: ["9780306406157"], metadataDois: ["10.1000/x"] });
assert.deepStrictEqual(picked.primary, { kind: "isbn", value: "9780306406157" });
picked = I.choosePrimaryQuery({ metadataDois: ["10.1007/978-0-306-40615-7_3"] });
assert.deepStrictEqual(picked.primary, { kind: "isbn", value: "9780306406157" });
picked = I.choosePrimaryQuery({ pageIsbns: ["9780306406157", "9780131103627"] });
assert.strictEqual(picked.primary, null);
picked = I.choosePrimaryQuery({ pageDois: ["10.1038/nature12373"] });
assert.deepStrictEqual(picked.primary, { kind: "doi", value: "10.1038/nature12373" });
picked = I.choosePrimaryQuery({ isBookPage: true, title: "The Book" });
assert.deepStrictEqual(picked.primary, { kind: "text", value: "The Book" });

console.log("isbn tests passed");
