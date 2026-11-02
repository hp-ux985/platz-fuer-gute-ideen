const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const root = path.resolve(__dirname, "../..");
const script = fs.readFileSync(path.join(root, "site/booking-demo.js"), "utf8");
const html = fs.readFileSync(path.join(root, "site/index.html"), "utf8");

class Element {
  constructor(type = "text") {
    this.type = type;
    this._value = "";
    this.checked = false;
    this.files = [];
    this.disabled = true;
    this.hidden = false;
    this.textContent = "";
    this.dataset = {};
    this.listeners = new Map();
  }

  get value() {
    return this._value;
  }

  set value(value) {
    this._value = value;
    if (this.type === "file" && value === "") this.files = [];
  }

  addEventListener(name, callback) {
    this.listeners.set(name, callback);
  }

  async emit(name) {
    const callback = this.listeners.get(name);
    if (callback) await callback({ target: this });
  }

  removeAttribute(name) {
    delete this[name];
  }

  scrollIntoView() {
    this.scrolled = true;
  }

  focus() {
    this.focused = true;
  }
}

function makePage({ createImageBitmap = async () => ({ close() {} }) } = {}) {
  const elements = new Map();
  const ids = [
    "ad-draft-form", "slot", "duration", "ad-image", "create-preview",
    "reset-draft", "form-message", "quote-total", "preview-image",
    "preview-image-wrap", "ad-title", "ad-copy", "target-url",
    "policy-accept", "preview-title", "preview-copy", "preview-target",
    "ad-preview",
  ];
  for (const id of ids) {
    const type = id === "slot" || id === "duration" ? "select" :
      id === "ad-image" ? "file" : id === "policy-accept" ? "checkbox" : "text";
    elements.set(id, new Element(type));
  }
  const formFields = ["slot", "duration", "ad-image", "ad-title", "ad-copy", "target-url", "policy-accept"]
    .map((id) => elements.get(id));
  elements.get("ad-draft-form").querySelectorAll = () => formFields;

  const document = { getElementById: (id) => elements.get(id) || null };
  const revokedUrls = [];
  let objectUrlNumber = 0;
  class BrowserURL extends URL {}
  BrowserURL.createObjectURL = () => `blob:test-${++objectUrlNumber}`;
  BrowserURL.revokeObjectURL = (url) => revokedUrls.push(url);
  const window = { addEventListener() {} };
  vm.runInNewContext(script, { document, URL: BrowserURL, createImageBitmap, window });
  return { elements, revokedUrls };
}

function setValidFields(elements) {
  elements.get("slot").value = "klein";
  elements.get("duration").value = "7";
  elements.get("ad-title").value = "Lokaler Test";
  elements.get("ad-copy").value = "Nur Vorschau";
  elements.get("target-url").value = "https://example.com/angebot";
  elements.get("policy-accept").checked = true;
}

test("all configured price combinations are displayed as test assumptions", async (t) => {
  const prices = [
    ["klein", "7", "3,00"], ["klein", "30", "10,00"],
    ["gross", "7", "6,00"], ["gross", "30", "20,00"],
  ];
  for (const [slot, duration, amount] of prices) {
    await t.test(`${slot}, ${duration} days`, async () => {
      const { elements } = makePage();
      elements.get("slot").value = slot;
      elements.get("duration").value = duration;
      await elements.get("slot").emit("change");
      const quote = elements.get("quote-total").textContent;
      assert.match(quote, new RegExp(amount.replace(",", ",")));
      assert.match(quote, /Testannahme/);
    });
  }
});

test("valid data updates the preview as text without submitting", async () => {
  const { elements } = makePage();
  setValidFields(elements);
  elements.get("ad-title").value = "<img src=x onerror=alert(1)>";
  await elements.get("create-preview").emit("click");
  assert.equal(elements.get("preview-title").textContent, "<img src=x onerror=alert(1)>");
  assert.equal(elements.get("preview-copy").textContent, "Nur Vorschau");
  assert.equal(elements.get("preview-target").textContent, "https://example.com/angebot");
  assert.match(elements.get("form-message").textContent, /nichts gesendet, gespeichert oder gebucht/);
  assert.equal(elements.get("form-message").dataset.kind, "success");
  assert.equal(elements.get("ad-preview").scrolled, true);
});

test("invalid fields and non-public URLs do not update the preview", async (t) => {
  const cases = [
    ["missing slot", (e) => { e.get("slot").value = ""; }],
    ["empty title", (e) => { e.get("ad-title").value = "  "; }],
    ["javascript URL", (e) => { e.get("target-url").value = "javascript:alert(1)"; }],
    ["localhost URL", (e) => { e.get("target-url").value = "http://localhost/private"; }],
    ["URL credentials", (e) => { e.get("target-url").value = "https://user:pass@example.com/"; }],
    ["policy not accepted", (e) => { e.get("policy-accept").checked = false; }],
  ];
  for (const [label, change] of cases) {
    await t.test(label, async () => {
      const { elements } = makePage();
      setValidFields(elements);
      change(elements);
      await elements.get("create-preview").emit("click");
      assert.notEqual(elements.get("preview-title").textContent, "Lokaler Test");
      assert.notEqual(elements.get("form-message").textContent, "");
    });
  }
});

test("image type, size, and decode validation are enforced locally", async (t) => {
  await t.test("valid image remains local and can be previewed", async () => {
    const { elements } = makePage();
    setValidFields(elements);
    const file = { type: "image/png", size: 100 };
    elements.get("ad-image").files = [file];
    await elements.get("ad-image").emit("change");
    assert.equal(elements.get("preview-image-wrap").hidden, false);
    await elements.get("create-preview").emit("click");
    assert.match(elements.get("form-message").textContent, /nichts gesendet/);
  });

  await t.test("unsupported type and oversized image are rejected", async () => {
    for (const file of [
      { type: "image/svg+xml", size: 100 },
      { type: "image/png", size: 1_000_001 },
    ]) {
      const { elements } = makePage();
      elements.get("ad-image").files = [file];
      await elements.get("ad-image").emit("change");
      assert.equal(elements.get("ad-image").value, "");
      assert.notEqual(elements.get("form-message").textContent, "");
    }
  });

  await t.test("unreadable image is rejected", async () => {
    const { elements } = makePage({ createImageBitmap: async () => { throw new Error("decode failed"); } });
    elements.get("ad-image").files = [{ type: "image/png", size: 100 }];
    await elements.get("ad-image").emit("change");
    assert.equal(elements.get("ad-image").value, "");
    assert.match(elements.get("form-message").textContent, /kein lesbares Bild/);
  });
});

test("reset clears preview and input state and revokes temporary image URLs", async () => {
  const { elements, revokedUrls } = makePage();
  setValidFields(elements);
  elements.get("ad-title").value = "Vorher";
  elements.get("ad-image").files = [{ type: "image/webp", size: 50 }];
  await elements.get("ad-image").emit("change");
  await elements.get("create-preview").emit("click");
  await elements.get("reset-draft").emit("click");
  assert.equal(elements.get("ad-title").value, "");
  assert.equal(elements.get("policy-accept").checked, false);
  assert.equal(elements.get("ad-image").files.length, 0);
  assert.equal(elements.get("preview-image-wrap").hidden, true);
  assert.equal(elements.get("preview-title").textContent, "Dein Titel erscheint hier");
  assert.ok(revokedUrls.includes("blob:test-1"));
  assert.equal(elements.get("slot").focused, true);
});

test("validation feedback is explicit and leaves the previous preview unchanged", async (t) => {
  const cases = [
    ["missing slot", (e) => { e.get("slot").value = ""; }, /g?ltige Musterfl?che und Laufzeit/],
    ["too-long title", (e) => { e.get("ad-title").value = "x".repeat(61); }, /Titel \(1?60 Zeichen\)/],
    ["invalid URL", (e) => { e.get("target-url").value = "javascript:alert(1)"; }, /?ffentliche HTTP\(S\)-Zieladresse/],
    ["policy not accepted", (e) => { e.get("policy-accept").checked = false; }, /Werberichtlinien best?tigen/],
  ];
  for (const [label, change, expectedMessage] of cases) {
    await t.test(label, async () => {
      const { elements } = makePage();
      setValidFields(elements);
      elements.get("preview-title").textContent = "Vorherige Vorschau";
      change(elements);
      await elements.get("create-preview").emit("click");
      assert.match(elements.get("form-message").textContent, expectedMessage);
      assert.equal(elements.get("form-message").dataset.kind, "error");
      assert.equal(elements.get("preview-title").textContent, "Vorherige Vorschau");
    });
  }
});

test("clearing a price selection removes a stale quote", async () => {
  const { elements } = makePage();
  elements.get("slot").value = "klein";
  elements.get("duration").value = "7";
  await elements.get("slot").emit("change");
  assert.match(elements.get("quote-total").textContent, /3,00/);
  elements.get("slot").value = "";
  await elements.get("slot").emit("change");
  assert.equal(elements.get("quote-total").textContent, "Noch nicht berechnet");
});
test("static page has no outbound submission or persistent browser storage code", () => {
  assert.doesNotMatch(html, /<form\b/i);
  assert.doesNotMatch(script, /\b(fetch|XMLHttpRequest|sendBeacon|localStorage|sessionStorage)\b/);
});