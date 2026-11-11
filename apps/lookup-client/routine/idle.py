"""Idle income for a connected session, mirroring the official client's battery-saving mode.

FightRewardModel (SEA 0.0.163): the idle scene refreshes OnlineIdleRewardPreReq (4087) every 15 s,
and every kill tick calls TryGetOnlineReward. In battery-saving mode no fight runs:
BatterySavingRewardController credits StageInfoCfg.BatterySavingMob kills every
BATTERY_SAVING_KILL_MOB_INTERVAL seconds. When the pending count allows, one OnlineIdleRewardReq
(4089) carries up to four intervals and every kill counted since the last claim.

Elapsed time is this session's monotonic clock; the browser and the job never supply it.
"""
import math
import time

PRE_REFRESH = 15  # FightRewardModel.OnlineRewardStart: RefreshOnlineRewardPreCount every 15 s
ONLINE = 4089
FAST = 4095


class IdleError(Exception):
    pass


def reward_times(pre):
    """FightRewardModel.TryGetOnlineRewardCount: uint division first, then CeilToInt, at most 4."""
    if pre > 1:
        return min(4, math.ceil(float(pre // 2)))
    return 1 if pre >= 1 else 0


def check(routine, command, payload):
    # The payload is computed here, so policy/schema validation runs on what is actually sent.
    if routine.validate:
        routine.validate(routine.pool, {'mode': 'execute', 'command': command, 'payload': payload,
                                        'confirm': routine.actions[command]['request']['name']})


class IdleIncome:
    def __init__(self, rules, clock=time.monotonic):
        self.clock = clock
        idle = rules['idle']
        # BatterySavingRewardController.StartMobTimer: a non-positive interval falls back to 15 s.
        self.interval = idle['killInterval'] if idle['killInterval'] > 0 else 15
        self.stage_mob = idle['stageMob']
        self.fast_free = idle['fastIdleFree']
        self.started = clock()
        self.ticks_used = 0          # timer ticks whose kills were already sent
        self.mob = None              # lowest BatterySavingMob seen since the last claim
        self.last_read = None        # last 4087
        self.reads = 0
        self.claims = 0
        self.fast_sent = 0           # Quick Idles sent this session, whatever the scan says afterwards

    def ticks(self):
        return int((self.clock() - self.started) // self.interval)

    def observe(self, stage):
        mob = int(self.stage_mob.get(str(stage), 0) or 0)
        self.mob = mob if self.mob is None else min(self.mob, mob)
        return mob

    def due(self):
        """A read may be sent: one per 15 s, and only when at least one new kill tick has passed."""
        fresh = self.last_read is None or self.clock() - self.last_read >= PRE_REFRESH
        return fresh and self.ticks() > self.ticks_used and (self.mob or 0) > 0

    def plan(self, data, opened, steps):
        from routine.planner import Step, digest
        stage = int(data.get('stage', {}).get('curr_stage') or 0)
        mob = self.observe(stage)
        if stage and mob > 0 and self.due():
            new = self.ticks() - self.ticks_used
            key = 'idle:4089'
            # Changes after every read or claim, so a later, newly due claim is never mistaken for this one.
            proof = digest(['online', self.reads, self.claims])
            steps[key] = Step('idle', 'Collect idle income',
                              f'Mirrors battery-saving mode: {self.mob} kills per {self.interval} s at this stage, '
                              f'{new} tick(s) since the last claim. Reads the pending count first; nothing is sent if none is due.',
                              ONLINE, {}, key, proof, auto_group='idle', idle={'type': 'online', 'ticks': new})
        free_used = data.get('daily_fast_idle_free_times', 0)
        paid_used = data.get('daily_fast_idle_times', 0)
        if opened(901) and type(free_used) is int and type(paid_used) is int and free_used < self.fast_free and self.fast_sent < self.fast_free:
            key = 'idle:4095'
            steps[key] = Step('idle', 'Free Quick Idle',
                              f'{self.fast_free - free_used} free Quick Idle left today. Sent only while the free allowance '
                              'remains; the reply must show the free counter moved and no paid one was used.',
                              FAST, {}, key, digest(['fast', free_used, paid_used]), auto_group='idle',
                              idle={'type': 'fast', 'freeBefore': free_used, 'paidBefore': paid_used})

    def run_online(self, routine, receipt):
        """At most one 4087 and one 4089. Returns the 4089 reply, or None when nothing was due."""
        check(routine, 4087, {})
        pre = routine.call(4087, {}).total_reward_times
        self.last_read = self.clock()
        self.reads += 1
        receipt['substeps'] = [{'command': 4087, 'reply': 4088, 'status': 'confirmed'}]
        times = reward_times(pre)
        new = self.ticks() - self.ticks_used
        mob = self.mob or 0
        if times <= 0 or new <= 0 or mob <= 0:
            receipt['note'] = 'No idle reward interval is pending yet; nothing claimed.'
            return None
        kills = mob * new
        # Spend the ticks before sending: an uncertain reply never re-credits the same kills.
        self.ticks_used += new
        self.claims += 1
        self.mob = None
        payload = {'get_reward_times': times, 'kill_num': kills}
        check(routine, ONLINE, payload)
        reply = routine.call(ONLINE, payload)
        receipt['substeps'].append({'command': ONLINE, 'reply': 4090, 'status': 'confirmed'})
        receipt['idle'] = {'times': times, 'kills': kills, 'pending': pre}
        return reply

    def reserve_fast(self):
        # Counted before sending: a misread free counter can never lead to a second, paid Quick Idle.
        if self.fast_sent >= self.fast_free:
            raise IdleError('A Quick Idle was already sent in this session. Nothing was sent.')
        self.fast_sent += 1

    def verify_fast(self, row, reply, receipt):
        before = row.idle
        free, paid = reply.get('daily_fast_idle_free_times', 0), reply.get('daily_fast_idle_times', 0)
        receipt['idle'] = {'freeUsed': free, 'paidUsed': paid}
        if free != before['freeBefore'] + 1 or paid != before['paidBefore']:
            raise IdleError('Quick Idle reply did not show the free allowance being used. Inspect the game; nothing else will be sent.')
