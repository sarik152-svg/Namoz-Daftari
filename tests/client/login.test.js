const { loadClient } = require("./harness");

module.exports = {
  "login screen lists names fetched from the server"(assert) {
    const client = loadClient({ expose: ["loginScreen"] });
    client.setState({ members: [], data: {}, me: null, token: "" });
    const html = client.loginScreen();
    assert.ok(html.includes("Kim ekanligingizni tanlang"), "expected the name picker");
  },

  "the app still calls the public name list"(assert) {
    const { clientSource } = require("./harness");
    assert.ok(clientSource().includes('api("/auth/members")'));
  },
};
