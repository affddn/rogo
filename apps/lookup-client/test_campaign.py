"""Offline replay and workflow checks; no devices, sessions, or gateway traffic."""
import base64
import io
import json
import os
import unittest
from contextlib import redirect_stdout
from unittest.mock import Mock, patch

from campaign import PROBE, REPLAY, VERSION, run_campaign, simulate, CampaignError
from gateway_ops import ALL_REFLECTIONS, handle
from wire_probe import load_schema, msg


class CampaignTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pool = load_schema(os.getenv("ILSPYCMD","ilspycmd"), ALL_REFLECTIONS)
        cls.viewer, raw = PROBE.read_bytes().splitlines()
        cls.wire = base64.b64decode(raw)

    def new_channel(self):
        channel = Mock(current_stage=101,player_id=int(self.viewer))
        self.start = msg(self.pool, "StageFightRes").FromString(self.wire)
        channel.exchange.side_effect = [self.start, msg(self.pool,"StageFightCompleteRes")(fight_result=False,stage={"curr_stage":101})]
        return channel

    def test_rejects_wrong_stage_no_confirmation_and_caller_supplied_results(self):
        for payload, confirm in (({"stage_entry":102},"campaign.retry"),({"stage_entry":101},None),({"stage_entry":101,"won":True},"campaign.retry")):
            ch = self.new_channel()
            out = io.StringIO()
            with redirect_stdout(out):
                handle(json.dumps({"mode":"execute","command":-5001,"id":"local","payload":payload,"confirm":confirm}),self.pool,ch)
            self.assertFalse(json.loads(out.getvalue())["ok"])
            ch.exchange.assert_not_called()

    def test_no_start_if_engine_not_ready(self):
        ch=self.new_channel()
        with patch("campaign.preflight",side_effect=CampaignError("replay_unavailable")), self.assertRaises(CampaignError):
            run_campaign(self.pool,ch,101)
        ch.exchange.assert_not_called()

    def test_no_settle_if_build_changes_or_simulation_fails(self):
        for wrong in (True,False):
            ch=self.new_channel()
            if wrong: self.start.fight_arg.clientGitVersion="different"
            with patch("campaign.preflight"), patch("campaign.simulate",side_effect=CampaignError("replay_failed")), self.assertRaises(CampaignError):
                run_campaign(self.pool,ch,101)
            self.assertEqual(ch.exchange.call_count,1)
            self.assertEqual(ch.current_stage,0)

    @unittest.skipUnless((REPLAY/"host/CampaignReplay.dll").is_file(), "build the local replay host first")
    def test_real_offline_engine_and_correlated_settlement(self):
        ch = self.new_channel()
        # The official client leaves CurrStage unchanged on a loss. Proto3 may omit Stage.
        ch.exchange.side_effect = [self.start, msg(self.pool,"StageFightCompleteRes")(fight_result=False)]
        result = run_campaign(self.pool,ch,101)
        self.assertEqual([c.args[0] for c in ch.exchange.call_args_list],[5001,5003])
        settlement=ch.exchange.call_args_list[-1].args[1]
        again=simulate(self.pool,self.wire,int(self.viewer))
        self.assertEqual(settlement.fight_result,again)
        self.assertEqual(settlement.fight_id,self.start.fight_id)
        self.assertEqual(settlement.fight_result.clientGitVersion,VERSION)
        self.assertGreater(settlement.fight_result.max_tick,0)
        self.assertTrue(settlement.fight_result.result_info)
        self.assertFalse(result.fight_result)  # server's reply, not the locally predicted win
        self.assertEqual(ch.current_stage,101)

if __name__ == "__main__":
    unittest.main()
