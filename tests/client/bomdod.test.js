const { loadClient } = require("./harness");

const MEMBER = {
  id: "sardor", name: "Sardor Valixanov", city: "Toshkent",
  lat: 41.2995, lng: 69.2401, tz: 5, asr: 2, fa: 18, ia: 18,
};

function client(at = "2026-08-23T09:00:00Z") {
  const c = loadClient({
    at,
    expose: ["belgiBall", "score", "BOMDOD_HOME", "BOMDOD_QAZO", "BOMDOD_MISS"],
  });
  c.setState({ members: [MEMBER], data: { sardor: { days: {} } }, me: "sardor", date: "2026-08-23" });
  return c;
}

module.exports = {
  "bomdod eski shkalada uyda 1, jamoatda 1.5 ball": (assert) => {
    const c = client();
    const p = { k: "bomdod" };
    assert.strictEqual(c.belgiBall(MEMBER, p, {}, "ontime", "2026-10-01"), 1);
    assert.strictEqual(c.belgiBall(MEMBER, p, { j: true }, "ontime", "2026-10-01"), 1.5);
  },

  "bomdod qazo -0.25 va o'tkazib yuborish -1": (assert) => {
    const c = client();
    const p = { k: "bomdod" };
    assert.strictEqual(c.belgiBall(MEMBER, p, {}, "qazo", "2026-10-01"), -0.25);
    assert.strictEqual(c.belgiBall(MEMBER, p, {}, "missed", "2026-10-01"), -1);
  },

  "old bomdod days keep the old scale": (assert) => {
    const c = client();
    const p = { k: "bomdod" };
    assert.strictEqual(c.belgiBall(MEMBER, p, {}, "ontime", "2026-09-29"), 1);
    assert.strictEqual(c.belgiBall(MEMBER, p, {}, "qazo", "2026-09-29"), -0.25);
    assert.strictEqual(c.belgiBall(MEMBER, p, {}, "missed", "2026-09-29"), -1);
  },

  "bomdod qarzi score hisobida alohida yuradi": (assert) => {
    const c = client("2026-10-02T09:00:00Z");
    const day = { peshin: { s: "ontime" }, asr: { s: "ontime" }, shom: { s: "ontime" }, xufton: { s: "ontime" } };
    c.setState({ data: { sardor: { days: { "2026-10-01": day } } } });
    assert.strictEqual(c.score(c.__me(), MEMBER).debt, 1);
  },
};
