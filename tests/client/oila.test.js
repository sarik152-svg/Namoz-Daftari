/* Stage three: the four things a family gets that a group of friends does not.
   Each one is driven through the app rather than read out of the source, because
   these features are all conditional — on the circle being a family, on a prayer
   window being open, on somebody being a child — and a condition that is wrong
   still renders perfectly valid HTML. */
const { loadClient } = require("./harness");

const ADULT = {
  id: "sardor", name: "Sardor Valixanov", city: "Toshkent",
  lat: 41.2995, lng: 69.2401, tz: 5, asr: 2, fa: 18, ia: 18, is_child: false,
};
const CHILD = {
  id: "aziz", name: "Aziz Valixanov", city: "Toshkent",
  lat: 41.2995, lng: 69.2401, tz: 5, asr: 2, fa: 18, ia: 18, is_child: true,
};
const FAMILY = {
  id: 2, name: "Valixanovlar", kind: "family", owner_id: "sardor", week_goal: 1,
};
const FRIENDS = {
  id: 1, name: "Do'stlar", kind: "friends", owner_id: "sardor", week_goal: 25,
};

const blank = () => ({ days: {}, bonuses: [], tasks: [], books: [], places: [] });
const prayed = () => ({
  ...blank(),
  days: {
    "2026-08-22": {
      bomdod: { s: "ontime", t: "04:10" }, peshin: { s: "ontime", t: "13:00" },
      asr: { s: "ontime", t: "17:30" }, shom: { s: "ontime", t: "19:20" },
      xufton: { s: "ontime", t: "20:40" },
    },
  },
});

function state(members, data = {}, extra = {}) {
  return {
    members,
    data: Object.fromEntries(members.map(m => [m.id, data[m.id] || blank()])),
    ...extra,
  };
}

function boot(routes, who = "sardor") {
  const client = loadClient({ routes });
  client.setState({
    members: [], data: {}, me: null, date: "2026-08-22",
    token: "tok", isAdmin: false,
  });
  client.__who = who;
  return client;
}

const family = (body, who = "sardor") => ({
  "/auth/me": { member_id: who, is_admin: false },
  "/circles": { circles: [FAMILY] },
  "/circles/2/roster": { members: [] },
  "/state?circle=2": body,
});

module.exports = {
  async "a child is shown stars, never a debt"(assert) {
    const client = boot(family(state([ADULT, CHILD]), "aziz"), "aziz");
    await client.A.boot();

    assert.ok(client.html.includes("Yulduzchalar"), "stars replace the debt tile");
    assert.ok(!client.html.includes("Umumiy qarz"), "a child is never in debt");
  },

  async "a child is not sent to do penalty work"(assert) {
    const client = boot(family(state([ADULT, CHILD]), "aziz"), "aziz");
    await client.A.boot();

    client.A.setTab("sunnat");
    assert.ok(
      !client.html.includes("Ball va vazifa"),
      "the penalty work is what frightens a child off the app"
    );
    assert.ok(client.html.includes("Kunning sunnati"), "the sunnah itself stays");
  },

  async "an adult still gets the debt tile and the penalty work"(assert) {
    const client = boot(family(state([ADULT, CHILD])));
    await client.A.boot();

    assert.ok(!client.html.includes("Yulduzchalar"));
    client.A.setTab("sunnat");
    assert.ok(client.html.includes("Ball va vazifa"));
  },

  async "a child cannot cost the family its weekly badge"(assert) {
    /* The adult has met a goal of one. The child has prayed nothing. If children
       counted, the all-or-nothing rule would deny the badge to everybody. */
    const client = boot(family(state([ADULT, CHILD], { sardor: prayed() })));
    await client.A.boot();
    client.A.setTab("nishon");

    assert.ok(client.html.includes("Nishon olindi"), "the badge should be won");
    assert.ok(
      client.html.includes("Bolalar nishonni to'smaydi"),
      "and the child should still be shown, with stars"
    );
  },

  async "praying together is offered in a family"(assert) {
    const client = boot(family(state([ADULT, CHILD])));
    await client.A.boot();

    assert.ok(
      client.html.includes("A.callJamoat('peshin'"),
      "peshin is the open window at this hour, so that is the row that offers it"
    );
  },

  async "praying together is not offered to friends in other cities"(assert) {
    const client = boot({
      "/auth/me": { member_id: "sardor", is_admin: false },
      "/circles": { circles: [FRIENDS] },
      "/circles/1/roster": { members: [] },
      "/state?circle=1": state([ADULT]),
    });
    await client.A.boot();
    assert.ok(!client.html.includes("A.callJamoat("), "friends cannot share a room");

    /* Each family feature lives on a different tab, so each tab has to be looked at.
       Checking only the one the app opens on would pass no matter what the others do. */
    client.A.setTab("book");
    assert.ok(!client.html.includes("Oilaviy xatm"), "nor a family khatm");
    assert.ok(!client.html.includes("A.startKhatm()"), "not even the offer of one");
    assert.ok(client.html.includes("Umumiy daftar"), "the ordinary book page is intact");

    client.A.setTab("stats");
    assert.ok(!client.html.includes("Namoz tahlili"), "nor the family-only analysis");
    assert.ok(client.html.includes("Taqqoslash"), "the ordinary ranking is intact");
  },

  async "calling the family to prayer records the call, not anyone's prayer"(assert) {
    const client = boot({
      ...family(state([ADULT, CHILD])),
      "/circles/2/jamoat": { day: "2026-08-22", prayer: "peshin", caller_id: "sardor" },
    });
    await client.A.boot();
    await client.A.callJamoat("peshin", "2026-08-22");

    const sent = client.calls.filter(c => c.path === "/circles/2/jamoat");
    assert.strictEqual(sent.length, 1);
    assert.deepStrictEqual(sent[0].body, { day: "2026-08-22", prayer: "peshin" });
    assert.ok(
      !client.calls.some(c => c.method === "PUT"),
      "nobody's day may be written by a call — each person still marks their own"
    );
  },

  async "a standing call is shown to the rest of the family"(assert) {
    const client = boot(family(state(
      [ADULT, CHILD], {},
      { calls: [{ day: "2026-08-22", prayer: "peshin", caller_id: "sardor" }] }
    ), "aziz"), "aziz");
    await client.A.boot();

    assert.ok(client.html.includes("Peshin namoziga chaqirdi"), "expected the banner");
    assert.ok(client.html.includes("Sardor"), "and who called it");
  },

  async "a call for a window that has closed is not shown"(assert) {
    const client = boot(family(state(
      [ADULT, CHILD], {},
      { calls: [{ day: "2026-08-22", prayer: "bomdod", caller_id: "sardor" }] }
    ), "aziz"), "aziz");
    await client.A.boot();

    assert.ok(
      !client.html.includes("namoziga chaqirdi"),
      "bomdod is long past at this hour; the invitation is stale"
    );
  },

  async "a family with no khatm is offered one"(assert) {
    const client = boot(family(state([ADULT, CHILD])));
    await client.A.boot();
    client.A.setTab("book");

    assert.ok(client.html.includes("A.startKhatm()"), "expected the start button");
    assert.ok(!client.html.includes("A.takeJuz("), "there is nothing to take yet");
  },

  async "a free juz can be taken and a read one cannot"(assert) {
    const khatm = {
      id: 5, name: "Ramazon xatmi", started: "2026-08-01", finished: null,
      juz: [
        { juz: 1, member_id: "sardor", done: true },
        { juz: 2, member_id: "aziz", done: false },
        { juz: 3, member_id: "sardor", done: false },
      ],
    };
    const client = boot({
      ...family(state([ADULT, CHILD], {}, { khatm })),
      "/circles/2/khatm/5/juz/4": { ok: true },
    });
    await client.A.boot();
    client.A.setTab("book");

    assert.ok(client.html.includes("1/30"), "one of thirty has been read");
    assert.ok(client.html.includes("A.takeJuz(4)"), "4 is free, so it is tappable");
    assert.ok(!client.html.includes("A.takeJuz(1)"), "1 is read");
    assert.ok(!client.html.includes("A.takeJuz(2)"), "2 belongs to somebody else");
    assert.ok(client.html.includes("A.doneJuz(3)"), "3 is mine and unread");
    assert.ok(!client.html.includes("A.doneJuz(2)"), "I cannot finish another's juz");

    await client.A.takeJuz(4);
    const sent = client.calls.filter(c => c.path === "/circles/2/khatm/5/juz/4");
    assert.deepStrictEqual(sent.map(c => c.method), ["POST"]);
  },

  async "the family prayer analysis says which prayer is being missed"(assert) {
    const missing = {
      ...blank(),
      days: {
        "2026-08-19": { peshin: { s: "ontime", t: "13:05" } },
        "2026-08-20": { peshin: { s: "ontime", t: "13:05" } },
      },
    };
    const client = boot(family(state([ADULT], { sardor: missing })));
    await client.A.boot();
    client.A.setTab("stats");

    assert.ok(client.html.includes("Namoz tahlili"), "the section should be there");
    assert.ok(
      client.html.includes("Oilada eng og'iri"),
      "and it should name the prayer the family is losing"
    );
    assert.ok(client.html.includes("Bomdod"), "bomdod went unmarked on closed days");
  },
};
