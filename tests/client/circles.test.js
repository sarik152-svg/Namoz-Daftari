/* These drive the app the way a phone does — boot it, tap things, read what got
   rendered — rather than searching the source for strings. Two bugs shipped past a
   suite that only searched for strings: a member in no circle got a blank page, and
   the circle switcher threw before it ever fetched. Both are asserted here. */
const { loadClient } = require("./harness");

const SARDOR = {
  id: "sardor", name: "Sardor Valixanov", city: "Toshkent",
  lat: 41.2995, lng: 69.2401, tz: 5, asr: 2, fa: 18, ia: 18,
};
const AYOL = {
  id: "zuhra", name: "Zuhra Ismoilova", city: "Toshkent",
  lat: 41.2995, lng: 69.2401, tz: 5, asr: 2, fa: 18, ia: 18,
};
const blank = () => ({ days: {}, bonuses: [], tasks: [], books: [], places: [] });
const state = (...members) => ({
  members,
  data: Object.fromEntries(members.map(m => [m.id, blank()])),
});

function boot(routes) {
  const client = loadClient({ routes });
  client.setState({
    members: [], data: {}, me: null, date: "2026-08-22",
    token: "tok", isAdmin: false,
  });
  return client;
}

module.exports = {
  async "a member in no circle gets a way out, not a blank page"(assert) {
    const client = boot({
      "/auth/me": { member_id: "sardor", is_admin: false },
      "/circles": { circles: [] },
      "/state": { __status: 404, error: { code: "no_circle", message: "yo'q" } },
    });
    await client.A.boot();

    assert.ok(client.html.length > 0, "the page must not be left empty");
    assert.ok(client.html.includes("Doira topilmadi"), "expected an explanation");
    assert.ok(client.html.includes("A.logout()"), "expected a way out");
  },

  async "switching circle fetches that circle before drawing it"(assert) {
    const client = boot({
      "/auth/me": { member_id: "sardor", is_admin: false },
      "/circles": { circles: [
        { id: 1, name: "Do'stlar", kind: "friends", owner_id: "sardor", week_goal: 25 },
        { id: 2, name: "Oila", kind: "family", owner_id: "sardor", week_goal: 20 },
      ] },
      "/state?circle=1": state(SARDOR),
      "/state?circle=2": state(SARDOR, AYOL),
    });
    await client.A.boot();
    /* Names are HTML-escaped on the way out, so match the handler, not the text. */
    assert.ok(client.html.includes("A.setCircle(2)"), "the switcher should be showing");

    const before = client.renders.length;
    await client.A.setCircle(2);

    const asked = client.calls.filter(c => c.path === "/state?circle=2");
    assert.strictEqual(asked.length, 1, "setCircle must fetch the circle it switches to");
    assert.ok(client.html.length > 0, "the page must not be left empty after switching");
    assert.ok(!client.html.includes("Doira topilmadi"), "the switch should have loaded");

    /* Emptying data and drawing before fetching flashed the "no circle" screen on
       every switch. Fetch first: no screen painted during the switch may be it. */
    const during = client.renders.slice(before);
    assert.ok(during.length > 0, "switching should have drawn something");
    assert.ok(
      !during.some(html => html.includes("Doira topilmadi")),
      "the no-circle screen must never flash while switching"
    );
  },

  async "one circle draws the app and hides the switcher"(assert) {
    const client = boot({
      "/auth/me": { member_id: "sardor", is_admin: false },
      "/circles": { circles: [
        { id: 1, name: "Do'stlar", kind: "friends", owner_id: "sardor", week_goal: 25 },
      ] },
      "/state?circle=1": state(SARDOR),
    });
    await client.A.boot();

    assert.ok(client.html.includes("Bugun"), "expected the normal app");
    assert.ok(!client.html.includes("Doira topilmadi"), "the guard must not fire here");
    assert.ok(!client.html.includes("A.setCircle("), "one circle needs no switcher");
  },

  async "state is never requested for a circle that was not chosen"(assert) {
    const client = boot({
      "/auth/me": { member_id: "sardor", is_admin: false },
      "/circles": { circles: [
        { id: 7, name: "Do'stlar", kind: "friends", owner_id: "sardor", week_goal: 25 },
      ] },
      "/state?circle=7": state(SARDOR),
    });
    await client.A.boot();

    const stateCalls = client.calls.filter(c => c.path.startsWith("/state"));
    assert.deepStrictEqual(
      stateCalls.map(c => c.path), ["/state?circle=7"],
      "the client should ask for its own circle by id"
    );
  },
};
