using System.Globalization;
using Google.Protobuf;
using Cross.Fight;
using excelConfig;
using Proto;

// The only live input is the worker's correlated 5002 packet, never a browser-supplied report.
sealed class Tables(string root) : IConfigBytesReader {
    public byte[] GetBytesByName(string folder, string table, string sub) =>
        File.ReadAllBytes(Path.Combine(root, folder, table + ".bytes"));
}

static class Campaign {
    static AttrMatrix Matrix(AttrInfo info) {
        if (info == null || info.Attrs.Count == 0) throw new InvalidDataException("missing attributes");
        var matrix = new AttrMatrix(0);
        foreach (var (key, value) in info.Attrs)
            matrix.GetAttrOne((AttributeType)key).AddSource((float)value);
        return matrix;
    }

    static FightReportSkill Skill(CareerBuildSkill s) => new() { SkillEntry = (int)s.Entry, SkillLevel = (int)s.Level };

    static FightReportTeam Team(FightTeamInfo wire, ExcelConfigManagerPb cfg, ulong playerId) {
        var p = wire.Leader;
        int career = (int)p.CareerEntry, build = (int)p.CareerBuild, gender = (int)p.Gender;
        var soldiers = career > 0 && build > 0
            ? cfg.FightSoldier.GetCfgArrBy_Career_Spec(cfg.CareerInfo.GetCfgByPk(career).CareerKind, cfg.CareerSpec.GetCfgByPk(build).Build)
            : cfg.FightSoldier.GetCfgArrBy_Career(Variables.Instance.PLAYER_INIT_CAREER);
        var skills = new List<FightReportSkill> { new() { SkillEntry = soldiers.First().Skills.First(), SkillLevel = 1 } };
        skills.AddRange(p.Skills.Select(Skill));
        var av = p.AvaterInfo;
        var art = new FightSoldierAvatarData {
            clothesEntry = (int)(av?.HeroAvatarEntry ?? p.ClothEntry), weaponEntry = (int)(av?.WeaponAvatarEntry ?? p.WeaponEntry),
            headEntry = (int)(av?.HeadAvatarEntry ?? 0), faceEntry = (int)(av?.FaceAvatarEntry ?? 0),
            backEntry = (int)(av?.BackAvatarEntry ?? 0), mouthEntry = (int)(av?.MouthAvatarEntry ?? 0)
        };
        List<int> Res(int entry, int kind) => entry == 0 || cfg.AvatarNewInfo.GetCfgByPk(entry) == null ? null :
            (cfg.AvatarResInfo.GetCfgByPks(entry, kind) ?? cfg.AvatarResInfo.GetCfgByPks(entry, 0))?.Res;
        List<int> Ornaments(int entry) => Res(entry, 0)?.Take(2).Where(x => x > 0).ToList();
        art.clothesResEntry = Res(art.clothesEntry, build)?.ElementAtOrDefault(gender) ?? 0;
        art.weaponResEntry = Res(art.weaponEntry, build)?.ElementAtOrDefault(gender) ?? 0;
        art.headResEntry = Ornaments(art.headEntry); art.faceResEntry = Ornaments(art.faceEntry);
        art.mouthResEntry = Ornaments(art.mouthEntry); art.backResEntry = Ornaments(art.backEntry);
        var leader = new FightReportLeader {
            Nickname = p.Name, Level = (int)p.Level, Icon = p.Icon, AttrMatrix = Matrix(p.AttrInfo),
            SoldierData = new FightSoldierData { Gender = gender, CareerEntry = career, CareerSpecEntry = build, WeaponQuality = p.Weapon, avatarData = art },
            SkillList = skills, BrandList = p.Brands.Select(v => checked((int)v)).ToList()
        };
        var pet = wire.Pet;
        return new FightReportTeam { Leader = leader, IsMainTeam = p.Entry == playerId,
            Pet = pet == null || pet.Entry == 0 ? null : new FightReportPet {
                SoldierEntry = cfg.PetInfo.GetCfgByPk((int)pet.Entry).FightSoldierPet,
                AttrMatrix = Matrix(pet.AttrInfo), SkillList = pet.Skills.Select(Skill).ToList()
            }
        };
    }

    static IMessage Play(StageFightRes start, ulong player, string root, FightStageType mode) {
        var arg = start.FightArg;
        if (arg == null || string.IsNullOrEmpty(start.FightId)) throw new InvalidDataException();
        var share = FightLogicShare.Instance;
        var cfg = share.ConfigMgr = new ExcelConfigManagerPb(new Tables(root));
        share.FightMapsLoader = scene => File.ReadAllText(Path.Combine(root, "maps", scene + ".json"));
        var report = new Cross.Fight.FightReport { FightId = start.FightId, Seed = arg.Seed,
            StageType = mode, StageEntry = (int)arg.StageEntry, StageRound = arg.StageRound,
            AttackTeamList = arg.Acks.Select(t => Team(t, cfg, player)).ToList() };
        if (report.AttackTeamList.Count(t => t.IsMainTeam) != 1 || FightReportUtils.ValidateFightReport_SceneData(report) != null)
            throw new InvalidDataException("invalid initial state");
        // Same deterministic simulation as the client, with no manual dodge/other options.
        foreach (var team in report.AttackTeamList) FightReportUtils.InitSoldierData(team.Leader.SoldierData);
        var logic = share.CreateFightLogic(1, report);
        try {
            uint phases = 0;
            if (mode == FightStageType.GuildBoss) {
                var chest = cfg.GuildBossStageInfo.GetCfgByPk(report.StageEntry).ChestCount ?? "";
                int max = chest.Split(new[]{',','|',';','[',']'},StringSplitOptions.RemoveEmptyEntries).Count(v=>int.TryParse(v.Trim(),out _));
                logic.Event.Add<FightDeadSoldierData>(FightLogicEvent.DeadSoldier, report, dead => {
                    if (dead.Targeter.HasSafe<BossCompFL>() && phases < max) phases++;
                });
            }
            logic.Start();
            while (logic.CanTick() && logic.Tick < FightLogicConst.Fps * 180) logic.OnTick();
            if (!logic.IsEnd || logic.CanTick()) throw new InvalidDataException("incomplete fight");
            var s = FightReportReplayRunner.ComputeFightStatistic(logic);
            if (s.Result != logic.IsWin || s.MaxTick == 0 || s.FightId != start.FightId) throw new InvalidDataException();
            var damage = "0";
            if (mode is FightStageType.WorldBoss or FightStageType.GuildBoss) {
                double total=logic.Actors.MainLeaderEntity.GetSafe<SoldierCompFL>().DamageTotalTargetBoss.AsDoubleRounded;
                var pet=logic.Actors.MainTeamEntity.GetSafe<FightTeamCompFL>().PetEntity;
                if (pet.HasValue && pet.Value.IsAliveSafe()) total+=pet.Value.GetSafe<SoldierCompFL>().DamageTotalTargetBoss.AsDoubleRounded;
                damage=Math.Round(total).ToString(CultureInfo.InvariantCulture);
            }
            var stat = new FightStatistic { Result = logic.IsWin, FightId = s.FightId, FightTime = s.FightTime, MaxTick = s.MaxTick,
                KillMonsterCount = s.KillMonsterCount, RemainHp = long.Parse(s.RemainHp, CultureInfo.InvariantCulture),
                TotalHp = long.Parse(s.TotalHp, CultureInfo.InvariantCulture), ResultInfo = s.ResultInfo, Damage = damage,
                ClientGitVersion = s.ClientGitVersion, ClientVersion = "1.0.8.2" };
            if (mode == FightStageType.GuildBoss) {
                stat.Score=GuildBossStageAdapterFL.CalcFightScore(logic);
                var settlement=new GuildBossFightCompleteReq { FightId=start.FightId,GuildBossEntry=(uint)report.StageEntry,FightResult=stat,PassStageCount=phases };
                GuildBossStageAdapterFL.FillStageDamages(logic,settlement.StageDamages);
                return settlement;
            }
            return stat;
        } finally { share.DisposeFightLogic(1); }
    }

    static int Main(string[] args) {
        var output = Console.Out;
        Console.SetOut(TextWriter.Null); // engine logs may contain player data
        try {
            if (args.Length != 2 || !int.TryParse(args[1],out int mode) || mode is not (2 or 3 or 4 or 5 or 6 or 7 or 8 or 9)) return 2;
            ulong viewer = ulong.Parse(Console.ReadLine()!, CultureInfo.InvariantCulture);
            var start = new StageFightRes();
            start.MergeFrom(new CodedInputStream(Convert.FromBase64String(Console.ReadLine()!)));
            output.WriteLine(Convert.ToBase64String(Play(start, viewer, args[0],(FightStageType)mode).ToByteArray()));
            return 0;
        } catch (Exception e) {
            Console.Error.WriteLine("Campaign replay failed: " + e.GetType().Name);
            return 1;
        }
    }
}
