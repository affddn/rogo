---- MODULE ProgressionJob ----
\* Model of the bridge progression job: progression.ts `reduce` plus the job runner and the
\* bridge lock. Each job action below is one reducer event; progression.tla.test.ts checks the
\* real reducer's traces against this module, so keep the two in step.
\*
\* Abstraction: three builds <<line, spec>> (line 1 has two specs, line 2 one). Only the
\* environment raises power: `pw` counts power bands (each a rise of at least
\* LEVER_REARM_PERCENT, which re-arms build-change levers) and `nudge` counts smaller rises (claims),
\* which change the fight fingerprint but not the band. A fight's fingerprint is
\* <<build, pw, nudge, rebuilt[build]>>. Claims/offers/stat
\* allocations are "chores", daily sweeps and mode fights are "dailies"; both are finite.
\* Check* constants switch individual guards off so tests can show the properties are not vacuous.
EXTENDS Integers, FiniteSets

\* Faults bounds how many rejections/skips/failed reads the environment may produce in a run.
CONSTANTS NStages, MaxPw, MaxNudge, MaxRej, Chores, Dailies, Faults,
          CheckTried, CheckStop, CheckRisen, CheckResetOnce, CheckLock

Lines == {1, 2}
Builds == {<<1, 1>>, <<1, 2>>, <<2, 1>>}
NoBuild == <<0, 0>>
Default(l) == <<l, 1>>
Done == NStages + 1
InFlight == {"scanning", "preparing", "executing"}
\* Step keys are <<kind, line, spec>> triples (spec 0 for a class line, stage for the campaign).
Key(kind, b) == <<kind, b[1], b[2]>>
ClassKey(l) == <<"class", l, 0>>
LeverKeys == {Key("rebuild", b) : b \in Builds} \cup {Key("spec", b) : b \in Builds}
             \cup {ClassKey(l) : l \in Lines}
NoPlan == <<"none", <<>>>>

VARIABLES
  phase, plan, stopReq, uncertain,                       \* job control
  jstage, expected, stall, stallId, origin, basis,       \* job memory
  tried, pulled, resets, blocked, rej,
  stage, build, pw, nudge, rebuilt, chores, dailies,     \* game and bridge
  interactive, meddled, faults,
  bad                                                    \* flags raised when a property breaks

job == <<phase, plan, stopReq, uncertain, jstage, expected, stall, stallId, origin, basis,
         tried, pulled, resets, blocked, rej>>
game == <<stage, build, pw, nudge, rebuilt, chores, dailies, interactive, meddled, faults>>
ghost == <<bad>>
vars == <<job, game, ghost>>

FP == <<build, pw, nudge, rebuilt[build]>>

Init ==
  /\ phase = "idle" /\ plan = NoPlan /\ stopReq = FALSE /\ uncertain = FALSE
  /\ jstage = 0 /\ expected = NoBuild /\ stall = 0 /\ stallId = 0 /\ origin = NoBuild /\ basis = -1
  /\ tried = {} /\ pulled = [k \in LeverKeys |-> -1] /\ resets = {} /\ blocked = {} /\ rej = 0
  /\ stage = 1 /\ build = <<1, 1>> /\ pw = 0 /\ nudge = 0 /\ rebuilt = [b \in Builds |-> FALSE]
  /\ chores = Chores /\ dailies = Dailies /\ interactive = FALSE /\ meddled = FALSE /\ faults = 0
  /\ bad = {}

StopJob == phase' = "stopped" /\ plan' = NoPlan
\* After a confirmed or rejected action the job rescans, unless a stop was requested meanwhile.
Continue == IF stopReq THEN StopJob ELSE phase' = "scanning" /\ plan' = NoPlan

\* ---- What a scan updates before choosing (onScanned) ----
Mismatch == expected # NoBuild /\ build # expected
NewStage == stage # jstage
St1 == IF NewStage THEN 0 ELSE stall
Tr1 == IF NewStage THEN {} ELSE tried
Pl1 == IF NewStage THEN [k \in LeverKeys |-> -1] ELSE pulled
Or1 == IF NewStage THEN NoBuild ELSE origin
Bs1 == IF St1 = 0 THEN -1 ELSE IF build = Or1 THEN pw ELSE basis
Exp1 == IF expected = NoBuild THEN build ELSE expected

Open(k) == k \notin blocked
LeverOK(pl, bs, k) == IF CheckRisen THEN pl[k] < bs ELSE TRUE
SpecLever(b, or, pl, bs) ==
  b[1] = build[1] /\ b # build /\ b # or /\ Open(Key("spec", b)) /\ LeverOK(pl, bs, Key("spec", b))
ClassLever(l, or, pl, bs) ==
  l # build[1] /\ l # or[1] /\ Open(ClassKey(l)) /\ LeverOK(pl, bs, ClassKey(l))
RevertKey(or) == IF build[1] # or[1] THEN ClassKey(or[1]) ELSE Key("spec", or)

\* The ladder, in the order `choose` applies it.
Choice(st, tr, pl, or, bs) ==
  IF chores > 0 THEN <<"chore", <<>>>>
  ELSE IF stage <= NStages /\ Open(<<"campaign", stage, 0>>) /\ (~CheckTried \/ <<stage, FP>> \notin tr)
    THEN <<"campaign", <<stage, FP>>>>
  ELSE IF st # 0 /\ (~CheckResetOnce \/ <<st, build>> \notin resets) /\ ~rebuilt[build]
          /\ Open(Key("rebuild", build)) /\ LeverOK(pl, bs, Key("rebuild", build))
    THEN <<"lever", Key("rebuild", build)>>
  ELSE IF st # 0 /\ \E b \in Builds : SpecLever(b, or, pl, bs)
    THEN <<"lever", Key("spec", CHOOSE b \in Builds : SpecLever(b, or, pl, bs))>>
  ELSE IF st # 0 /\ \E l \in Lines : ClassLever(l, or, pl, bs)
    THEN <<"lever", ClassKey(CHOOSE l \in Lines : ClassLever(l, or, pl, bs))>>
  ELSE IF st # 0 /\ build # or /\ Open(RevertKey(or))
    THEN <<"revert", RevertKey(or)>>
  ELSE IF dailies > 0 THEN <<"daily", <<>>>>
  ELSE NoPlan

StepKey(p) ==
  IF p[1] = "campaign" THEN <<"campaign", p[2][1], 0>>
  ELSE IF p[1] \in {"lever", "revert"} THEN p[2] ELSE <<"other", 0, 0>>

\* ---- Bridge and environment ----
Start ==
  /\ phase = "idle" /\ (CheckLock => ~interactive) /\ phase' = "scanning"
  /\ UNCHANGED <<plan, stopReq, uncertain, jstage, expected, stall, stallId, origin, basis,
                 tried, pulled, resets, blocked, rej, game, ghost>>
InteractiveBegin ==
  /\ ~interactive /\ (CheckLock => phase \in {"idle", "stopped"})
  /\ interactive' = TRUE
  /\ UNCHANGED <<job, stage, build, pw, nudge, rebuilt, chores, dailies, meddled, faults, ghost>>
InteractiveEnd ==
  /\ interactive /\ interactive' = FALSE
  /\ UNCHANGED <<job, stage, build, pw, nudge, rebuilt, chores, dailies, meddled, faults, ghost>>
RequestStop ==
  /\ phase \notin {"idle", "stopped"} /\ ~stopReq /\ stopReq' = TRUE
  /\ IF phase = "waiting" THEN StopJob ELSE UNCHANGED <<phase, plan>>
  /\ UNCHANGED <<uncertain, jstage, expected, stall, stallId, origin, basis,
                 tried, pulled, resets, blocked, rej, game, ghost>>
SessionEnd ==
  /\ phase \notin {"idle", "stopped"} /\ StopJob
  /\ uncertain' = (uncertain \/ phase = "executing")
  /\ UNCHANGED <<stopReq, jstage, expected, stall, stallId, origin, basis,
                 tried, pulled, resets, blocked, rej, game, ghost>>
\* Level/power rises from outside the ladder; new points can make a rebuild worthwhile again.
\* The job only observes power when a scan is answered, so raising it while a scan is pending
\* or while waiting covers every change it can see.
Progress ==
  /\ phase \in {"idle", "scanning", "waiting"} /\ pw < MaxPw /\ pw' = pw + 1 /\ rebuilt' \in {rebuilt, [b \in Builds |-> FALSE]}
  /\ UNCHANGED <<job, stage, build, nudge, chores, dailies, interactive, meddled, faults, ghost>>
\* A small rise (e.g. a claimed reward): new fingerprint, same band.
Nudge ==
  /\ phase \in {"idle", "scanning", "waiting"} /\ nudge < MaxNudge /\ nudge' = nudge + 1
  /\ UNCHANGED <<job, stage, build, pw, rebuilt, chores, dailies, interactive, meddled, faults, ghost>>
\* Another client changes the class while the job waits.
Meddle ==
  /\ ~meddled /\ phase = "waiting" /\ meddled' = TRUE /\ build' \in Builds \ {build}
  /\ UNCHANGED <<job, stage, pw, nudge, rebuilt, chores, dailies, interactive, faults, ghost>>

\* ---- Job: scanned ----
ScanMismatch ==
  /\ phase = "scanning" /\ Mismatch /\ StopJob
  /\ UNCHANGED <<stopReq, uncertain, jstage, expected, stall, stallId, origin, basis,
                 tried, pulled, resets, blocked, rej, game, ghost>>
ScanStopped ==
  /\ phase = "scanning" /\ ~Mismatch /\ stopReq /\ StopJob /\ expected' = Exp1
  /\ UNCHANGED <<stopReq, uncertain, jstage, stall, stallId, origin, basis,
                 tried, pulled, resets, blocked, rej, game, ghost>>
ScanDecide ==
  /\ phase = "scanning" /\ ~Mismatch /\ ~stopReq
  /\ LET ch == Choice(St1, Tr1, Pl1, Or1, Bs1) IN
       /\ IF ch = NoPlan THEN phase' = "waiting" ELSE phase' = "preparing"
       /\ plan' = ch
  /\ jstage' = stage /\ stall' = St1 /\ tried' = Tr1 /\ pulled' = Pl1 /\ origin' = Or1
  /\ basis' = Bs1 /\ expected' = Exp1
  /\ resets' = IF St1 = 0 THEN {} ELSE resets
  /\ UNCHANGED <<stopReq, uncertain, stallId, blocked, rej, game, ghost>>
\* A read that failed without ending the session: count it, then wait and rescan.
ScanFail ==
  /\ faults < Faults /\ faults' = faults + 1 /\ phase = "scanning" /\ rej' = rej + 1
  /\ IF rej + 1 >= MaxRej \/ stopReq THEN StopJob ELSE phase' = "waiting" /\ plan' = NoPlan
  /\ UNCHANGED <<stopReq, uncertain, jstage, expected, stall, stallId, origin, basis,
                 tried, pulled, resets, blocked, stage, build, pw, nudge, rebuilt, chores, dailies, interactive, meddled, ghost>>

\* ---- Job: prepared (the last point before anything is sent) ----
\* Stages only increase and pw never falls, so `tried` (pruned per stage) and `pulled` (last
\* basis per lever) are complete histories for the duplicate checks below.
Flag(cond, name) == IF cond THEN {name} ELSE {}
IsRebuild(p) == p[1] = "lever" /\ p[2][1] = "rebuild"
PrepareOk ==
  /\ phase = "preparing"
  /\ IF CheckStop /\ stopReq
     THEN StopJob /\ UNCHANGED <<tried, pulled, resets, bad>>
     ELSE
       /\ phase' = "executing" /\ plan' = plan
       /\ tried' = IF plan[1] = "campaign" THEN tried \cup {plan[2]} ELSE tried
       /\ pulled' = IF plan[1] = "lever" THEN [pulled EXCEPT ![plan[2]] = basis] ELSE pulled
       /\ resets' = IF IsRebuild(plan) THEN resets \cup {<<stall, build>>} ELSE resets
       /\ bad' = bad \cup Flag(stopReq \/ uncertain, "sentAfterStop")
                     \cup Flag(plan[1] = "campaign" /\ plan[2] \in tried, "dupFight")
                     \cup Flag(plan[1] = "lever" /\ pulled[plan[2]] = basis, "dupLever")
                     \cup Flag(IsRebuild(plan) /\ <<stall, build>> \in resets, "dupReset")
  /\ UNCHANGED <<stopReq, uncertain, jstage, expected, stall, stallId, origin, basis, blocked, rej, game>>
\* Review failed before sending: never offer that step again this run.
PrepareFail ==
  /\ faults < Faults /\ faults' = faults + 1 /\ phase = "preparing"
  /\ blocked' = IF plan[1] \in {"chore", "daily"} THEN blocked ELSE blocked \cup {StepKey(plan)}
  /\ chores' = IF plan[1] = "chore" THEN chores - 1 ELSE chores
  /\ dailies' = IF plan[1] = "daily" THEN dailies - 1 ELSE dailies
  /\ rej' = rej + 1
  /\ IF rej + 1 >= MaxRej THEN StopJob ELSE Continue
  /\ UNCHANGED <<stopReq, uncertain, jstage, expected, stall, stallId, origin, basis,
                 tried, pulled, resets, stage, build, pw, nudge, rebuilt, interactive, meddled, ghost>>

\* The reviewed step no longer matched the scan: nothing sent, rescan.
PrepareChanged ==
  /\ faults < Faults /\ faults' = faults + 1 /\ phase = "preparing" /\ rej' = rej + 1
  /\ IF rej + 1 >= MaxRej THEN StopJob ELSE Continue
  /\ UNCHANGED <<stopReq, uncertain, jstage, expected, stall, stallId, origin, basis,
                 tried, pulled, resets, blocked, stage, build, pw, nudge, rebuilt, chores, dailies, interactive, meddled, ghost>>

\* ---- Job: executed (the environment picks the outcome) ----
Moved(p) ==
  IF p[1] \in {"lever", "revert"} /\ p[2][1] = "spec" THEN <<p[2][2], p[2][3]>>
  ELSE IF p[1] \in {"lever", "revert"} /\ p[2][1] = "class" THEN Default(p[2][2])
  ELSE build
ExecOk ==
  /\ phase = "executing" /\ plan[1] # "campaign"
  /\ build' = Moved(plan)
  /\ expected' = IF plan[1] \in {"lever", "revert"} /\ plan[2][1] # "rebuild" THEN Moved(plan) ELSE expected
  /\ rebuilt' = IF plan[1] = "lever" /\ plan[2][1] = "rebuild" THEN [rebuilt EXCEPT ![build] = TRUE] ELSE rebuilt
  /\ chores' = IF plan[1] = "chore" THEN chores - 1 ELSE chores
  /\ dailies' = IF plan[1] = "daily" THEN dailies - 1 ELSE dailies
  /\ rej' = 0 /\ Continue
  /\ UNCHANGED <<stopReq, uncertain, jstage, stall, stallId, origin, basis,
                 tried, pulled, resets, blocked, stage, pw, nudge, interactive, meddled, faults, ghost>>
ExecWin ==
  /\ phase = "executing" /\ plan[1] = "campaign" /\ stage' = stage + 1 /\ rej' = 0 /\ Continue
  /\ UNCHANGED <<stopReq, uncertain, jstage, expected, stall, stallId, origin, basis,
                 tried, pulled, resets, blocked, build, pw, nudge, rebuilt, chores, dailies,
                 interactive, meddled, faults, ghost>>
\* A defeat opens a stall on the build that fought, unless one is already open on this stage.
ExecLose ==
  /\ phase = "executing" /\ plan[1] = "campaign" /\ rej' = 0 /\ Continue
  /\ IF stall = 0
     THEN stallId' = stallId + 1 /\ stall' = stallId + 1 /\ origin' = expected
          /\ basis' = plan[2][2][2]
     ELSE UNCHANGED <<stall, stallId, origin, basis>>
  /\ UNCHANGED <<stopReq, uncertain, jstage, expected, tried, pulled, resets, blocked, game, ghost>>
ExecReject ==
  /\ faults < Faults /\ faults' = faults + 1 /\ phase = "executing"
  /\ blocked' = IF plan[1] \in {"lever", "revert"} THEN blocked \cup {plan[2]} ELSE blocked
  /\ chores' = IF plan[1] = "chore" THEN chores - 1 ELSE chores
  /\ dailies' = IF plan[1] = "daily" THEN dailies - 1 ELSE dailies
  /\ rej' = rej + 1
  /\ IF rej + 1 >= MaxRej THEN StopJob ELSE Continue
  /\ UNCHANGED <<stopReq, uncertain, jstage, expected, stall, stallId, origin, basis,
                 tried, pulled, resets, stage, build, pw, nudge, rebuilt, interactive, meddled, ghost>>
\* The worker refused the selection before sending (e.g. the scan expired).
ExecNotSent ==
  /\ faults < Faults /\ faults' = faults + 1 /\ phase = "executing"
  /\ blocked' = IF plan[1] \in {"chore", "daily"} THEN blocked ELSE blocked \cup {StepKey(plan)}
  /\ chores' = IF plan[1] = "chore" THEN chores - 1 ELSE chores
  /\ dailies' = IF plan[1] = "daily" THEN dailies - 1 ELSE dailies
  /\ rej' = rej + 1
  /\ IF rej + 1 >= MaxRej THEN StopJob ELSE Continue
  /\ UNCHANGED <<stopReq, uncertain, jstage, expected, stall, stallId, origin, basis,
                 tried, pulled, resets, stage, build, pw, nudge, rebuilt, interactive, meddled, ghost>>
\* Unknown outcome (timeout, lost connection, incomplete receipt): stop, never replay.
ExecUncertain ==
  /\ phase = "executing" /\ uncertain' = TRUE /\ StopJob
  /\ UNCHANGED <<stopReq, jstage, expected, stall, stallId, origin, basis,
                 tried, pulled, resets, blocked, rej, game, ghost>>

\* The helper skipped the step because eligibility changed after review.
ExecSkipped ==
  /\ faults < Faults /\ faults' = faults + 1 /\ phase = "executing"
  /\ chores' = IF plan[1] = "chore" THEN chores - 1 ELSE chores
  /\ dailies' = IF plan[1] = "daily" THEN dailies - 1 ELSE dailies
  /\ Continue
  /\ UNCHANGED <<stopReq, uncertain, jstage, expected, stall, stallId, origin, basis,
                 tried, pulled, resets, blocked, rej, stage, build, pw, nudge, rebuilt, interactive, meddled, ghost>>
\* The helper stopped the step itself (e.g. no local battle engine): stop without retrying.
ExecHalt ==
  /\ phase = "executing" /\ StopJob
  /\ UNCHANGED <<stopReq, uncertain, jstage, expected, stall, stallId, origin, basis,
                 tried, pulled, resets, blocked, rej, game, ghost>>

Woke ==
  /\ phase = "waiting" /\ phase' = "scanning" /\ plan' = NoPlan
  /\ UNCHANGED <<stopReq, uncertain, jstage, expected, stall, stallId, origin, basis,
                 tried, pulled, resets, blocked, rej, game, ghost>>

JobNext == ScanMismatch \/ ScanStopped \/ ScanDecide \/ ScanFail
           \/ PrepareOk \/ PrepareFail \/ PrepareChanged
           \/ ExecOk \/ ExecWin \/ ExecLose \/ ExecReject \/ ExecNotSent \/ ExecSkipped
           \/ ExecUncertain \/ ExecHalt \/ Woke
EnvNext == Start \/ InteractiveBegin \/ InteractiveEnd \/ RequestStop \/ SessionEnd
           \/ Progress \/ Nudge \/ Meddle
Next == JobNext \/ EnvNext
Spec == Init /\ [][Next]_vars /\ WF_vars(JobNext) /\ WF_vars(InteractiveEnd)

\* ---- Properties ----
OneInFlight == ~(interactive /\ phase \in InFlight)
NothingAfterStop == "sentAfterStop" \notin bad
NoRefight == "dupFight" \notin bad
\* Each lever at most once per (stage, power band).
LeverOncePerPower == "dupLever" \notin bad
ResetOncePerStall == "dupReset" \notin bad
UncertainStops == uncertain => phase = "stopped"
StoppedIsFinal == [][phase = "stopped" => phase' = "stopped"]_vars
\* No livelock of build changes: the job keeps returning to waiting (or has stopped).
Settles == []<>(phase \in {"idle", "waiting", "stopped"})
StopHonoured == stopReq ~> (phase = "stopped")
====
