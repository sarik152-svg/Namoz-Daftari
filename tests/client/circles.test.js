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
  async "an owner can close a family opened by mistake"(assert) {
    /* Two families with the same name is how this arrived: opened twice, and with
       no way to undo it the spare one sat in the switcher forever. */
    let listed = 0;
    const client = boot({
      "/auth/me": { member_id: "sardor", is_admin: false },
      "/circles": () => {
        listed += 1;
        const oilalar = listed > 1 ? [] : [
          { id: 2, name: "Ismailovlar", kind: "family", owner_id: "sardor", week_goal: 20 },
        ];
        return { circles: [
          { id: 1, name: "Do'stlar", kind: "friends", owner_id: "sardor", week_goal: 25 },
          ...oilalar,
        ] };
      },
      "/state?circle=1": state(SARDOR),
      "/state?circle=2": state(SARDOR, AYOL),
      "/circles/1/roster": { members: [] },
      "/circles/2/roster": { members: [] },
      "/circles/2": { ok: true, stranded: ["Zuhra Ismoilova"] },
    });
    await client.A.boot();
    await client.A.go("sync");
    assert.ok(client.html.includes("A.deleteFamily(2)"), "expected a way to close it");

    await client.A.deleteFamily(2);
    const sent = client.calls.find(x => x.method === "DELETE" && x.path === "/circles/2");
    assert.ok(sent, "expected the family to be deleted on the server");
    assert.ok(listed > 1, "the circle list must be re-read afterwards");
    assert.ok(!client.html.includes("A.deleteFamily(2)"), "the closed family must be gone");
    assert.ok(client.html.includes("Zuhra"), "whoever is left circle-less must be named");
  },

  async "the friends circle carries no close button"(assert) {
    const client = boot({
      "/auth/me": { member_id: "sardor", is_admin: false },
      "/circles": { circles: [
        { id: 1, name: "Do'stlar", kind: "friends", owner_id: "sardor", week_goal: 25 },
      ] },
      "/state?circle=1": state(SARDOR),
      "/circles/1/roster": { members: [] },
    });
    await client.A.boot();
    await client.A.go("sync");
    assert.ok(!client.html.includes("A.deleteFamily("), "friends is everybody's circle");
  },

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
