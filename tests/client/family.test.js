/* Stage two: a person opens their own family, puts people in it, and sees that
   circle's numbers. These boot the app and tap the buttons, because the two bugs
   that shipped past the previous suite were both in code that only ran when
   something was actually clicked. */
const { loadClient } = require("./harness");

const SARDOR = {
  id: "sardor", name: "Sardor Valixanov", city: "Toshkent",
  lat: 41.2995, lng: 69.2401, tz: 5, asr: 2, fa: 18, ia: 18,
};
const ZUHRA = {
  id: "zuhra", name: "Zuhra Ismoilova", city: "Toshkent",
  lat: 41.2995, lng: 69.2401, tz: 5, asr: 2, fa: 18, ia: 18,
};
const FRIENDS = {
  id: 1, name: "Do'stlar", kind: "friends", owner_id: "sardor", week_goal: 25,
};
const FAMILY = {
  id: 2, name: "Valixanovlar", kind: "family", owner_id: "sardor", week_goal: 12,
};

const blank = () => ({ days: {}, bonuses: [], tasks: [], books: [], places: [] });
const state = (...members) => ({
  members,
  data: Object.fromEntries(members.map(m => [m.id, blank()])),
});

/* `/circles` answers a GET with the list and a POST with the circle just made, so
   one route has to know which it is being asked. */
function circleRoute(list, made) {
  return (options) => {
    if (options && options.method === "POST") {
      list.push(made);
      return made;
    }
    return { circles: list.slice() };
  };
}

function boot(routes) {
  const client = loadClient({ routes });
  client.setState({
    members: [], data: {}, me: null, date: "2026-08-22",
    token: "tok", isAdmin: false,
  });
  return client;
}

const posts = (client, path) =>
  client.calls.filter(c => c.path === path && c.method === "POST");

module.exports = {
  async "opening a family creates it and switches to it"(assert) {
    const list = [FRIENDS];
    const client = boot({
      "/auth/me": { member_id: "sardor", is_admin: false },
      "/circles": circleRoute(list, FAMILY),
      "/circles/1/roster": { members: [] },
      "/circles/2/roster": { members: [] },
      "/state?circle=1": state(SARDOR),
      "/state?circle=2": state(SARDOR),
    });
    await client.A.boot();
    await client.A.go("sync");

    client.setFields({ fam_name: "Valixanovlar" });
    await client.A.createFamily();

    const made = posts(client, "/circles");
    assert.strictEqual(made.length, 1, "the family should have been created once");
    assert.strictEqual(made[0].body.name, "Valixanovlar");
    assert.ok(
      client.calls.some(c => c.path === "/state?circle=2"),
      "the new family should have been opened, not just created"
    );
  },

  async "a family with no name is refused before the request goes out"(assert) {
    const client = boot({
      "/auth/me": { member_id: "sardor", is_admin: false },
      "/circles": { circles: [FRIENDS] },
      "/circles/1/roster": { members: [] },
      "/state?circle=1": state(SARDOR),
    });
    await client.A.boot();
    await client.A.go("sync");

    client.setFields({ fam_name: "   " });
    await client.A.createFamily();

    assert.strictEqual(posts(client, "/circles").length, 0, "nothing should be sent");
    assert.ok(client.html.includes("Oila nomini yozing"), "expected a reason on screen");
  },

  async "the weekly team goal is the one the circle carries"(assert) {
    /* The friends group holds each other to 25. A family with children holds itself
       to 12, and the badge has to say 12 or the number is decorative. */
    const client = boot({
      "/auth/me": { member_id: "sardor", is_admin: false },
      "/circles": { circles: [FRIENDS, FAMILY] },
      "/circles/2/roster": { members: [] },
      "/state?circle=1": state(SARDOR),
      "/state?circle=2": state(SARDOR, ZUHRA),
    });
    await client.A.boot();
    await client.A.setCircle(2);
    client.A.setTab("nishon");

    assert.ok(
      client.html.includes("12 ta namozni vaqtida o'qisa"),
      "the weekly badge should ask for the family's own number"
    );
    assert.ok(
      !client.html.includes("25 ta namozni vaqtida o'qisa"),
      "the friends group's number must not leak into the family"
    );
    assert.ok(client.html.includes("0 / 12"), "and the progress bar should agree");
  },

  async "adding a new person goes through the circle, never through /members"(assert) {
    const client = boot({
      "/auth/me": { member_id: "sardor", is_admin: false },
      "/circles": { circles: [FAMILY] },
      "/circles/2/roster": { members: [] },
      "/circles/2/members": { member: { ...ZUHRA, id: "zuhra2" }, pin: "4821" },
      "/state?circle=2": state(SARDOR),
    });
    await client.A.boot();
    await client.A.go("add");
    client.setFields({
      f_name: "Zuhra Ismoilova", f_id: "", f_sel: "0", f_tz: "5", f_pin: "4821",
    });
    client.field("query:[name=f_asr]:checked").value = "2";
    await client.A.addMember();

    const sent = posts(client, "/circles/2/members");
    assert.strictEqual(sent.length, 1, "expected one add");
    assert.strictEqual(sent[0].body.new_member.id, "zuhra", "login built from the name");
    assert.strictEqual(sent[0].body.new_member.pin, "4821");
    assert.ok(
      !client.calls.some(c => c.path === "/members"),
      "creating outside a circle is the dead end this replaced"
    );
  },

  async "the login shown is the one the server settled on"(assert) {
    /* `zuhra` was taken, so the server answered `zuhra2`. Reading the login back off
       the request would tell the owner a login that cannot log in. */
    const client = boot({
      "/auth/me": { member_id: "sardor", is_admin: false },
      "/circles": { circles: [FAMILY] },
      "/circles/2/roster": { members: [] },
      "/circles/2/members": { member: { ...ZUHRA, id: "zuhra2" }, pin: "4821" },
      "/state?circle=2": state(SARDOR),
    });
    await client.A.boot();
    await client.A.go("add");
    client.setFields({
      f_name: "Zuhra Ismoilova", f_id: "", f_sel: "0", f_tz: "5", f_pin: "4821",
    });
    client.field("query:[name=f_asr]:checked").value = "2";
    await client.A.addMember();

    const said = client.alerts.join("\n");
    assert.ok(said.includes("zuhra2"), `expected the chosen login, got: ${said}`);
    assert.ok(said.includes("4821"), "the PIN has to be read out too");
  },

  async "an existing login joins without creating an account"(assert) {
    const client = boot({
      "/auth/me": { member_id: "sardor", is_admin: false },
      "/circles": { circles: [FAMILY] },
      "/circles/2/roster": { members: [] },
      "/circles/2/members": { member: ZUHRA },
      "/state?circle=2": state(SARDOR),
    });
    await client.A.boot();
    await client.A.go("add");
    client.A.setAddMode("old");
    client.setFields({ f_login: "  Zuhra  " });
    await client.A.addExisting();

    const sent = posts(client, "/circles/2/members");
    assert.strictEqual(sent.length, 1);
    assert.deepStrictEqual(sent[0].body, { member_id: "zuhra" }, "trimmed and lowercased");
  },

  async "taking someone out of a circle does not delete them"(assert) {
    const client = boot({
      "/auth/me": { member_id: "sardor", is_admin: false },
      "/circles": { circles: [FAMILY] },
      "/circles/2/roster": { members: [] },
      "/circles/2/members/zuhra": { ok: true },
      "/state?circle=2": state(SARDOR),
    });
    await client.A.boot();
    client.setConfirm(true);
    await client.A.dropMember("zuhra");

    const gone = client.calls.filter(c => c.method === "DELETE");
    assert.deepStrictEqual(
      gone.map(c => c.path), ["/circles/2/members/zuhra"],
      "only the membership should be deleted"
    );
    assert.ok(
      client.confirms.some(q => q.includes("Yozuvlari o'chmaydi")),
      "the warning should say the records survive"
    );
  },

  async "a member who does not own the circle is offered no management"(assert) {
    const client = boot({
      "/auth/me": { member_id: "zuhra", is_admin: false },
      "/circles": { circles: [{ ...FAMILY, owner_id: "sardor" }] },
      "/state?circle=2": state(SARDOR, ZUHRA),
    });
    await client.A.boot();
    await client.A.go("sync");

    assert.ok(!client.html.includes("A.saveCircle()"), "settings are the owner's");
    assert.ok(!client.html.includes("A.dropMember("), "so is removing people");
    assert.ok(!client.html.includes("A.resetPin("), "and resetting PINs");
    assert.ok(client.html.includes("A.createFamily()"), "but anyone may open their own");
  },

  async "switching circles does not leave the other circle's PINs on screen"(assert) {
    const client = boot({
      "/auth/me": { member_id: "sardor", is_admin: false },
      "/circles": { circles: [FRIENDS, FAMILY] },
      "/circles/1/roster": { members: [{ ...ZUHRA, pin: "1111" }] },
      "/circles/2/roster": { members: [{ ...ZUHRA, pin: "2222" }] },
      "/state?circle=1": state(SARDOR),
      "/state?circle=2": state(SARDOR),
    });
    await client.A.boot();
    await client.A.go("sync");
    assert.ok(client.html.includes("1111"), "the friends circle's PIN should be up");

    await client.A.setCircle(2);
    assert.ok(!client.html.includes("1111"), "the other circle's PIN must be gone");
    assert.ok(client.html.includes("2222"), "and this circle's should have loaded");
  },

  async "the roster is never fetched for a circle you do not own"(assert) {
    const client = boot({
      "/auth/me": { member_id: "zuhra", is_admin: false },
      "/circles": { circles: [{ ...FAMILY, owner_id: "sardor" }] },
      "/state?circle=2": state(SARDOR, ZUHRA),
    });
    await client.A.boot();
    await client.A.go("sync");

    assert.ok(
      !client.calls.some(c => c.path.includes("/roster")),
      "asking would only earn a 403"
    );
  },
};
