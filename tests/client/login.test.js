const { loadClient, clientSource } = require("./harness");

module.exports = {
  "the public name list is no longer requested"(assert) {
    assert.ok(!clientSource().includes('api("/auth/members")'));
  },

  "the login screen asks for a login and a PIN"(assert) {
    const client = loadClient({ expose: ["loginScreen"] });
    client.setState({ members: [], data: {}, me: null, token: "" });
    const html = client.loginScreen();
    assert.ok(html.includes('id="lg_id"'), "expected a login field");
    assert.ok(html.includes('id="lg_pin"'), "expected a PIN field");
    assert.ok(!html.includes("A.pickLogin"), "the name picker should be gone");
  },
};
