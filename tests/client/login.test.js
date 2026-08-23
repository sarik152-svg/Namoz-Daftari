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

  "state is fetched for the selected circle"(assert) {
    const source = clientSource();
    assert.ok(source.includes('api("/circles")'), "expected the circle list to be loaded");
    assert.ok(/\/state\?circle=/.test(source), "expected state to be circle-scoped");
  },

  "the switcher is hidden until there is more than one circle"(assert) {
    const client = loadClient({ expose: ["circleSwitcher"] });
    client.setState({ members: [], data: {}, me: "sardor", token: "tok" });
    assert.strictEqual(client.circleSwitcher([]), "");
    assert.strictEqual(client.circleSwitcher([{ id: 1, name: "Do'stlar" }]), "");
    assert.ok(client.circleSwitcher([
      { id: 1, name: "Do'stlar" }, { id: 2, name: "Oila" },
    ]).includes("Oila"));
  },
};
