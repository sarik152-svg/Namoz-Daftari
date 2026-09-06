/* Adding a small child. They will never log in — a four-year-old has no use for a
   login and a PIN — so the parent types a name and nothing else. */
const { loadClient } = require("./harness");

const OTA = { id: "sardor", name: "Sardor Valixanov", city: "Toshkent",
  lat: 41.2995, lng: 69.2401, tz: 5, asr: 2, fa: 18, ia: 18 };
const OILA = { id: 2, name: "Oilam", kind: "family", owner_id: "sardor",
  week_goal: 25, bonus_easy: 20, bonus_mid: 50, bonus_hard: 100 };
const blank = () => ({ days: {}, bonuses: [], tasks: [], books: [], places: [] });

function client(members = [OTA]) {
  const loaded = loadClient({
    at: "2026-09-06T07:00:00Z",
    routes: {
      "/circles/2/members": { member: { id: "aziz", name: "Aziz", city: "Toshkent",
        lat: 41.3, lng: 69.2, tz: 5, asr: 2, fa: 18, ia: 18, is_child: false },
        pin: "4821" },
      "/members/aziz/child": { ok: true },
      "/circles/2/roster": { members: [] },
      "/state?circle=2": { members: [], data: {}, calls: [], khatm: null,
        duels: [], deeds: [], rewards: [], skills: [] },
      "/circles": { circles: [OILA] },
    },
  });
  loaded.setState({
    members, data: Object.fromEntries(members.map(m => [m.id, blank()])),
    me: "sardor", date: "2026-09-06", token: "tok", isAdmin: false, circleId: 2,
    circles: [OILA], deeds: [], rewards: [], skills: [], duels: [],
  });
  return loaded;
}

module.exports = {
  async "a family with no children says so instead of showing nothing"(assert) {
    const c = client();
    await c.A.go("app");
    assert.ok(c.html.includes("Bolalar"), "the panel must not vanish silently");
    assert.ok(c.html.includes("Farzand qo'shing") || c.html.includes("farzand qo'shilmagan"),
      "it should say what is missing: " + c.html.slice(0, 0));
  },

  async "the settings offer to add a child with just a name"(assert) {
    const c = client();
    await c.A.go("sync");
    assert.ok(c.html.includes("A.addChild()"), "expected a one-field way in");
  },

  async "adding one makes the account and turns children's mode on"(assert) {
    const c = client();
    c.setPrompt("Aziz");
    await c.A.addChild();
    const made = c.calls.find(x => x.path === "/circles/2/members");
    assert.ok(made, "expected the member to be created");
    assert.strictEqual(made.body.new_member.name, "Aziz");
    assert.ok(/^[0-9]{4}$/.test(made.body.new_member.pin), "a PIN is made, not asked for");
    assert.strictEqual(made.body.new_member.city, "Toshkent", "the parent's city");

    const flagged = c.calls.find(x => x.path === "/members/aziz/child");
    assert.ok(flagged, "and children's mode set straight away");
    assert.strictEqual(flagged.body.is_child, true);
  },

  async "an empty name adds nobody"(assert) {
    const c = client();
    c.setPrompt("   ");
    await c.A.addChild();
    assert.ok(!c.calls.some(x => x.path === "/circles/2/members"));
  },
};
