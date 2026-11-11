"""Export the small subset of pinned SEA tables used for reward eligibility from stage-extract's tables."""
import argparse
import json
import re
from pathlib import Path

def build(tables, variables):
    def load(name):
        return json.loads((tables / (name + ".json")).read_text())
    lang = {r["Id"]:r["Text"] for r in load("lang_en") if r.get("Text")}
    var = variables.read_text()
    def thresholds(name):
        block = re.search(r"\b"+name+r" \{ get; set; \} = new List<List<int>>\s*\{(.*?)\n\s*\};",var,re.S)
        return [int(v) for v in re.findall(r"new List<int> \{ (\d+),",block[1])]
    items={str(r["Entry"]):lang.get(r.get("Name"),str(r["Entry"])) for r in load("item_info")}
    def task(r):
        name = lang.get(r.get("Des"), "Task " + str(r['Entry']))
        args=list(r.get('desArg',[]))
        pos={506:0,511:1}.get(r.get('TriggerType'))
        if pos is not None and pos<len(args): args[pos]=items.get(str(args[pos]),args[pos])
        for i,v in enumerate(args,1):
            name=name.replace("%{"+str(i)+"}",str(v))
        return [r["Kind"],r["Progress"],name,r.get("Group",0)]
    return {
        'jobLevels':{r['Entry']:r['UnlockJoblevel'] for r in load('jobLevel_info')},
        'specUnlock':{r['Build']:r.get('UnlockJoblevelEntry',0) for r in load('career_spec')},
        'questDeadlines':{r['Entry']:r.get('DeadLine',0) for r in load('time_limited_quest')},
        'treasure':{r['Entry']:[v[0] for v in json.loads(r['ProgressReward']) if len(v)>=4] for r in load('treasure_info') if r.get('ProgressReward')},
        'tasks':{r['Entry']:task(r) for r in load('task_info')},
        'events':{r['Entry']:max(1,r['Progress']) for r in load('event_task_info')},
        'weapons':{r['TaskEntry']:r['Entry'] for r in load('weapon_achievement')},
        'cards':{r['Entry']:r['ReqTotalStar'] for r in load('card_collection_bonus')},
        'legacy':{r['Entry']:r['ReqTotalStar'] for r in load('legacy_collection_bonus')},
        'guildScore':{r['Entry']:r['TotalScore'] for r in load('guild_boss_score_reward')},
        'functions':{r['Entry']:[r.get('CanOpen',0),r.get('UnlockBaselevel',0),r.get('UnlockStage',0),r.get('UnlockJoblevel',0),r.get('UnlockCreateDate',0),r.get('UnlockMainTask',0),bool(r.get('PreviewReward')),lang.get(r.get('Name'),str(r['Entry']))] for r in load('function_info')},
        'bp':[[r['Entry'],r['BpEntry'],r['Level']] for r in load('bp_reward_info')],
        'bpEntitlements':{r['Entry']:json.loads(r['RechargeId']) if isinstance(r['RechargeId'],str) else r['RechargeId'] for r in load('bp_info')},
        'signins':[[r['Entry'],r['SigninEntry'],r['Level']] for r in load('signin_awards_info')],
        'firstRecharge':{r['Entry']:len(r.get('reward',[])) for r in load('first_recharge_gift_info')},
        'score':{k:thresholds(v) for k,v in [('daily','TASK_DAILY_REWARD'),('weekly','TASK_WEEKLY_REWARD'),('guild','GUILD_TASK_PROGRESS_REWARD'),('carnival','CARNIVAL_TASK_PROGRESS_REWARD'),('film','FILM_SUMMON_PROGRESS_REWARD')]},
        'mvpBonus':{r['Entry']:r.get('EfMvpSweepTimes',0) for r in load('monthly_card_info')},
        # AdveIncomeDialog: a Quick Idle is free while today's free count is below this base
        # (plus a monthly-card bonus the job ignores, so it never assumes a free one too many).
        'idle':{'fastIdleFree':int(re.search(r"\bSTAGE_FAST_IDLE_FREE_TIME_BASE \{ get; set; \} = (-?\d+);",var)[1])},
    }
if __name__ == '__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('tables',type=Path);p.add_argument('variables',type=Path);a=p.parse_args()
    Path(__file__).with_name('rules.json').write_text(json.dumps(build(a.tables,a.variables),separators=(',',':'),ensure_ascii=False)+'\n')
