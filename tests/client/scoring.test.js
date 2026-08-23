const { loadClient } = require("./harness");

module.exports = {
  "loads the browser app"(assert) {
    const client = loadClient({ expose: ["PRAYERS"] });
    assert.strictEqual(client.PRAYERS.length, 6);
  },
};
