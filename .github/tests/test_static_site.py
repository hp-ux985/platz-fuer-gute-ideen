from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[2]
SITE = ROOT / "site"
VOID_TAGS = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}


class SiteParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ids = []
        self.labels = []
        self.controls = []
        self.fragments = []
        self.buttons = []
        self.scripts = []
        self.stylesheets = []
        self.forms = 0
        self.landmarks = set()
        self.nav_labels = []
        self.skip_links = []
        self.status_regions = []
        self.live_quote = False
        self.images_without_alt = []
        self.document_language = None
        self.h1_count = 0
        self.stack = []

    def handle_starttag(self, tag, raw_attrs):
        attrs = dict(raw_attrs)
        if tag == "html":
            self.document_language = attrs.get("lang")
        if tag in {"header", "main", "footer", "nav"}:
            self.landmarks.add(tag)
        if tag == "nav":
            self.nav_labels.append(attrs.get("aria-label"))
        if tag == "a" and "skip-link" in attrs.get("class", "").split():
            self.skip_links.append(attrs.get("href"))
        if tag == "h1":
            self.h1_count += 1
        if tag in {"input", "select", "textarea"}:
            self.controls.append(attrs)
        if tag == "label" and "for" in attrs:
            self.labels.append(attrs["for"])
        if tag == "a" and attrs.get("href", "").startswith("#"):
            self.fragments.append(attrs["href"][1:])
        if tag == "button":
            self.buttons.append(attrs.get("type"))
        if tag == "script" and "src" in attrs:
            self.scripts.append(attrs["src"])
        if tag == "link" and "stylesheet" in attrs.get("rel", "").split():
            self.stylesheets.append(attrs.get("href"))
        if tag == "form":
            self.forms += 1
        if attrs.get("role") == "status" and attrs.get("aria-live") == "polite":
            self.status_regions.append(attrs)
        if tag == "img" and "alt" not in attrs:
            self.images_without_alt.append(attrs)
        if attrs.get("id") == "quote-total" and any(
            region.get("aria-live") == "polite" for region in self.stack
        ):
            self.live_quote = True
        if "id" in attrs:
            self.ids.append(attrs["id"])
        if tag not in VOID_TAGS:
            self.stack.append({"__tag": tag, **attrs})

    def handle_endtag(self, tag):
        for index in range(len(self.stack) - 1, -1, -1):
            if self.stack[index].get("__tag") == tag:
                self.stack = self.stack[:index]
                break


class StaticSiteHtmlTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = (SITE / "index.html").read_text(encoding="utf-8")
        cls.styles = (SITE / "styles.css").read_text(encoding="utf-8")
        cls.parser = SiteParser()
        cls.parser.feed(cls.source)

    def test_ids_are_unique_and_local_references_resolve(self):
        duplicates = [value for value, count in Counter(self.parser.ids).items() if count > 1]
        self.assertEqual(duplicates, [])
        available_ids = set(self.parser.ids)
        self.assertTrue(all(label in available_ids for label in self.parser.labels))
        self.assertTrue(all(fragment in available_ids for fragment in self.parser.fragments))

    def test_local_demo_has_no_submitting_form_or_implicit_submit_button(self):
        self.assertEqual(self.parser.forms, 0)
        self.assertTrue(self.parser.buttons)
        self.assertTrue(all(button_type == "button" for button_type in self.parser.buttons))
        self.assertIn("booking-demo.js", self.parser.scripts)
        self.assertIn("styles.css", self.parser.stylesheets)

    def test_accessible_document_structure_and_form_labels(self):
        self.assertEqual(self.parser.document_language, "de")
        self.assertEqual(self.parser.h1_count, 1)
        self.assertTrue({"header", "main", "nav", "footer"}.issubset(self.parser.landmarks))
        self.assertTrue(self.parser.nav_labels)
        self.assertTrue(all(label for label in self.parser.nav_labels))
        self.assertEqual(self.parser.skip_links, ["#inhalt"])
        labelled_controls = set(self.parser.labels)
        for control in self.parser.controls:
            self.assertTrue(
                control.get("id") in labelled_controls
                or control.get("aria-label")
                or control.get("aria-labelledby"),
                f"Unlabelled form control: {control}",
            )
        self.assertEqual(self.parser.images_without_alt, [])

    def test_dynamic_feedback_is_announced_and_css_supports_keyboard_and_small_screens(self):
        self.assertTrue(
            any(region.get("id") == "form-message" for region in self.parser.status_regions)
        )
        self.assertTrue(self.parser.live_quote)
        self.assertIn(":focus-visible", self.styles)
        self.assertIn("#ad-draft-form button:focus-visible", self.styles)
        self.assertIn("@media (max-width: 760px)", self.styles)
        self.assertIn("@media (max-width: 380px)", self.styles)
        self.assertIn("@media (prefers-reduced-motion: reduce)", self.styles)
        self.assertIn("scroll-behavior: auto", self.styles)


if __name__ == "__main__":
    unittest.main()