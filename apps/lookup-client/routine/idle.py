"""Free Quick Idle for a connected session. Online idle income is not claimed here.

Live on 11 Nov 2026: every QueryPlayerDataReq (4005) the scan sends settles the idle time since the
previous settlement as offline income (`offline_idle_info`) and resets the online pending count
(OnlineIdleRewardPreReq 4087) to 0. Claiming online intervals (4089) for the same window could pay
it twice, so the job never sends 4089; the scan reports what it settled instead.

Quick Idle (AdveIncomeDialog.RefreshFastIdleUi, SEA 0.0.163): free while today's free count is below
STAGE_FAST_IDLE_FREE_TIME_BASE; otherwise the same request spends a ticket or diamonds.
"""

FAST = 4095


class IdleError(Exception):
    pass


class IdleIncome:
    def __init__(self, rules):
        self.fast_free = rules['idle']['fastIdleFree']
        self.fast_sent = 0           # Quick Idles sent this session, whatever the scan says afterwards

    def plan(self, data, opened, steps):
        from routine.planner import Step, digest
        free_used = data.get('daily_fast_idle_free_times', 0)
        paid_used = data.get('daily_fast_idle_times', 0)
        if opened(901) and type(free_used) is int and type(paid_used) is int and free_used < self.fast_free and self.fast_sent < self.fast_free:
            key = 'idle:4095'
            steps[key] = Step('idle', 'Free Quick Idle',
                              f'{self.fast_free - free_used} free Quick Idle left today. Sent only while the free allowance '
                              'remains; the reply must show the free counter moved and no paid one was used.',
                              FAST, {}, key, digest(['fast', free_used, paid_used]), auto_group='idle',
                              idle={'type': 'fast', 'freeBefore': free_used, 'paidBefore': paid_used})

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
