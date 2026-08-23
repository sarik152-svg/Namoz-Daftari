/* Runs every *.test.js in this directory. Each file exports an object of
   name -> function; a throw is a failure. No framework, because the whole suite
   is a few dozen assertions and a dependency would outweigh them. */
const fs = require("fs");
const path = require("path");

const assert = require("assert");
let passed = 0;
const failures = [];

async function main() {
  for (const file of fs.readdirSync(__dirname).filter(f => f.endsWith(".test.js")).sort()) {
    const suite = require(path.join(__dirname, file));
    for (const [name, run] of Object.entries(suite)) {
      try {
        await run(assert);
        passed += 1;
        console.log(`  ok  ${file} · ${name}`);
      } catch (error) {
        failures.push({ file, name, error });
        console.log(`FAIL  ${file} · ${name}`);
        console.log(`      ${error.message}`);
      }
    }
  }
  console.log(`\n${passed} passed, ${failures.length} failed`);
  process.exit(failures.length ? 1 : 0);
}

main();
