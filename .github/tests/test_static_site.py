from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[2]
SITE = ROOT / "site"


class SiteParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ids = []
        self.labels = []
        self.fragments = []
        self.buttons = []
        self.scripts = []
        self.stylesheets = []
        self.forms = 0

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if "id" in attrs:
            self.ids.append(attrs["id"])
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


class StaticSiteHtmlTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = (SITE / "index.html").read_text(encoding="utf-8")
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


if __name__ == "__main__":
    unittest.main()