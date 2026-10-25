import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from winter_challenge.scoring import (  # noqa: E402
    net_score,
    new_handicap,
    ranking_points,
    score_round,
    stableford_hole,
)


class ScoringTest(unittest.TestCase):
    def test_net_score_rend_des_coups_selon_l_index(self):
        self.assertEqual(net_score(5, 9, 9), 4)  # handicap = index : un coup rendu
        self.assertEqual(net_score(5, 9, 10), 5)  # index plus difficile : rien
        self.assertEqual(net_score(5, 20, 2), 3)  # deux coups rendus
        self.assertEqual(net_score(5, 38, 2), 2)  # trois coups rendus

    def test_net_score_handicap_plus(self):
        self.assertEqual(net_score(4, -11, 18), 5)  # un coup ajouté sur le trou le plus facile
        self.assertEqual(net_score(4, -11, 7), 4)

    def test_stableford_hole(self):
        self.assertEqual(stableford_hole(3, 5), 4)  # eagle
        self.assertEqual(stableford_hole(4, 4), 2)  # par
        self.assertEqual(stableford_hole(6, 4), 0)  # double-bogey
        self.assertEqual(stableford_hole(9, 4), 0)

    def test_ranking_points(self):
        self.assertEqual(ranking_points(18, 9), 100)
        self.assertEqual(ranking_points(19, 9), 110)
        self.assertEqual(ranking_points(36, 18), 100)
        self.assertEqual(ranking_points(0, 9), 30)  # minimum 30

    def test_new_handicap(self):
        self.assertEqual(new_handicap(9, 90), 10)
        self.assertEqual(new_handicap(9, 100), 9)
        self.assertEqual(new_handicap(9, 130), 6)

    def test_score_round_neuf_trous(self):
        pars = [4] * 18
        strokes = list(range(1, 19))
        scores = [4] * 9 + [0] * 9  # neuf pars, handicap 0 : 18 Stableford = 100 points
        res = score_round(scores, pars, strokes, 0)
        self.assertEqual(res.stableford_net, 18)
        self.assertEqual(res.points_net, 100)
        self.assertEqual(res.hcp_after, 0)


if __name__ == "__main__":
    unittest.main()
