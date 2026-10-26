import os
import sys
import unittest
from datetime import datetime
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))
from creneau import decide  # noqa: E402

ZH = ZoneInfo("Europe/Zurich")


def at(h, m):
    return datetime(2026, 11, 5, h, m, tzinfo=ZH)


class CreneauTest(unittest.TestCase):
    def test_journee_toutes_les_5_minutes(self):
        for h, m in [(8, 0), (8, 35), (15, 20), (21, 55)]:
            self.assertTrue(decide(at(h, m))[0], (h, m))

    def test_nuit_une_fois_par_heure(self):
        self.assertTrue(decide(at(22, 0))[0])
        self.assertTrue(decide(at(2, 3))[0])
        self.assertFalse(decide(at(2, 35))[0])
        self.assertFalse(decide(at(7, 55))[0])
        self.assertFalse(decide(at(22, 30))[0])

    def test_lancement_manuel_toujours_permis(self):
        self.assertTrue(decide(at(2, 35), forced=True)[0])

    def test_entretien_une_fois_par_nuit(self):
        self.assertTrue(decide(at(3, 0))[1])
        self.assertFalse(decide(at(3, 30))[1])
        self.assertFalse(decide(at(12, 0))[1])


if __name__ == "__main__":
    unittest.main()
