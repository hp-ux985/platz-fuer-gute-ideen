(() => {
  "use strict";

  const prices = {
    klein: { 7: 300, 30: 1000 },
    gross: { 7: 600, 30: 2000 },
  };
  const form = document.getElementById("ad-draft-form");
  if (!form) return;

  const slot = document.getElementById("slot");
  const duration = document.getElementById("duration");
  const imageInput = document.getElementById("ad-image");
  const message = document.getElementById("form-message");
  const quote = document.getElementById("quote-total");
  const image = document.getElementById("preview-image");
  const imageWrap = document.getElementById("preview-image-wrap");
  let imageObjectUrl = null;

  function setMessage(text, kind = "error") {
    message.textContent = text;
    message.dataset.kind = kind;
  }

  function updateQuote() {
    const cents = prices[slot.value]?.[Number(duration.value)];
    quote.textContent = Number.isInteger(cents)
      ? `${(cents / 100).toLocaleString("de-DE", {
          style: "currency",
          currency: "EUR",
        })} · Testannahme`
      : "Noch nicht berechnet";
  }

  function validPublicHttpUrl(rawValue) {
    try {
      const url = new URL(rawValue);
      if (!["http:", "https:"].includes(url.protocol)) return false;
      if (url.username || url.password) return false;
      const host = url.hostname.toLowerCase().replace(/\.$/, "");
      if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
        return false;
      }
      const ipv4 = host.split(".").map(Number);
      if (ipv4.length === 4 && ipv4.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) {
        const [first, second] = ipv4;
        if (
          first === 0 ||
          first === 10 ||
          first === 127 ||
          first >= 224 ||
          (first === 100 && second >= 64 && second <= 127) ||
          (first === 169 && second === 254) ||
          (first === 172 && second >= 16 && second <= 31) ||
          (first === 192 && second === 168) ||
          (first === 192 && second === 0) ||
          (first === 198 && (second === 18 || second === 19 || second === 51)) ||
          (first === 203 && second === 0)
        ) {
          return false;
        }
      }
      const ipv6 = host.replace(/^\[|\]$/g, "");
      if (
        ipv6 === "::" ||
        ipv6 === "::1" ||
        /^f[cd]/.test(ipv6) ||
        /^fe[89ab]/.test(ipv6) ||
        /^ff/.test(ipv6)
      ) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  slot.addEventListener("change", updateQuote);
  duration.addEventListener("change", updateQuote);

  imageInput.addEventListener("change", () => {
    const file = imageInput.files?.[0];
    if (imageObjectUrl) {
      URL.revokeObjectURL(imageObjectUrl);
      imageObjectUrl = null;
    }
    image.removeAttribute("src");
    imageWrap.hidden = true;
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      imageInput.value = "";
      setMessage("Bitte ein PNG-, JPEG- oder WebP-Bild auswählen.");
      return;
    }
    if (file.size > 1_000_000) {
      imageInput.value = "";
      setMessage("Das Bild darf höchstens 1 MB groß sein.");
      return;
    }
    imageObjectUrl = URL.createObjectURL(file);
    image.src = imageObjectUrl;
    imageWrap.hidden = false;
    setMessage("");
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    updateQuote();
    const title = document.getElementById("ad-title").value.trim();
    const copy = document.getElementById("ad-copy").value.trim();
    const target = document.getElementById("target-url").value.trim();
    const file = imageInput.files?.[0];
    if (!prices[slot.value]?.[Number(duration.value)]) {
      setMessage("Bitte eine gültige Musterfläche und Laufzeit auswählen.");
      return;
    }
    if (!title || title.length > 60 || copy.length > 180) {
      setMessage("Bitte einen Titel (1–60 Zeichen) und höchstens 180 Textzeichen eingeben.");
      return;
    }
    if (!validPublicHttpUrl(target)) {
      setMessage("Bitte eine öffentliche HTTP(S)-Zieladresse ohne Zugangsdaten eingeben.");
      return;
    }
    if (!document.getElementById("policy-accept").checked) {
      setMessage("Bitte die Werberichtlinien bestätigen, um die lokale Vorschau zu erstellen.");
      return;
    }
    if (
      file &&
      (!["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
        file.size > 1_000_000)
    ) {
      setMessage("Das Bild muss PNG, JPEG oder WebP sein und darf höchstens 1 MB groß sein.");
      return;
    }

    document.getElementById("preview-title").textContent = title;
    document.getElementById("preview-copy").textContent =
      copy || "Kein zusätzlicher Anzeigentext.";
    document.getElementById("preview-target").textContent = target;
    setMessage(
      "Lokale Vorschau aktualisiert. Es wurde nichts gesendet, gespeichert oder gebucht.",
      "success",
    );
    document.getElementById("ad-preview").scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  });

  window.addEventListener("pagehide", () => {
    if (imageObjectUrl) URL.revokeObjectURL(imageObjectUrl);
  });
})();
