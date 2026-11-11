import io
import unittest
from contextlib import redirect_stdout, redirect_stderr
from unittest.mock import Mock
from run_operations import OperationError, run

STEP = {"command": 4651, "payload": {}}


class RecipeTests(unittest.TestCase):
    def setUp(self):
        self.events = []
        self.write = False
        self.fail = False
        self.guide = Mock()
        self.guide.post.side_effect = self.post

    def post(self, op, **fields):
        self.events.append((op, fields))
        if op == "gateway.prepare":
            return {"ticket": "review", "result": {"command": fields["command"], "request": "ExampleReq",
                    "effect": "change" if self.write else "read", "normalized": {},
                    "requiresConfirmation": self.write}}
        if op == "character.sync":
            return {"character": {"name": "Example", "serverId": "1"}}
        if op == "gateway.execute":
            if self.fail:
                raise OperationError("Lost session")
            return {"result": {"command": fields["command"], "reply": 4652, "status": 0}}
        return {}

    def exercise(self, **opts):
        with redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
            run(self.guide, [STEP, STEP], delay=lambda s: None, **opts)

    def test_dry_run_never_syncs_or_executes(self):
        self.exercise()
        self.assertEqual([k for k, _ in self.events], ["gateway.prepare"] * 2)

    def test_writes_require_review_before_login(self):
        self.write = True
        with self.assertRaises(OperationError):
            self.exercise(live=True)
        self.assertEqual([k for k, _ in self.events], ["gateway.prepare"])

    def test_stops_at_first_uncertain_result_and_disconnects(self):
        self.fail = True
        with self.assertRaises(OperationError):
            self.exercise(live=True)
        self.assertEqual([k for k, _ in self.events].count("gateway.execute"), 1)
        self.assertEqual(self.events[-1][0], "session.disconnect")

    def test_tickets_and_single_login(self):
        self.write = True
        self.exercise(live=True, interactive=True, ask=lambda q: "ExampleReq")
        sends = [f for k, f in self.events if k == "gateway.execute"]
        self.assertEqual([k for k, _ in self.events].count("character.sync"), 1)
        self.assertEqual(sends, [{**STEP, "ticket": "review", "confirm": "ExampleReq"}] * 2)
        self.assertEqual(self.events[-1][0], "session.disconnect")


if __name__ == "__main__":
    unittest.main()
