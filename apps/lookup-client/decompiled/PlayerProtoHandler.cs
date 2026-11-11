using System.Collections.Generic;
using Google.Protobuf;
using Proto;
using TEngine;

namespace GameLogic;

public class PlayerProtoHandler : Singleton<PlayerProtoHandler>
{
	private NetEventMgr _netEventMgr;

	protected override void OnInit()
	{
		base.OnInit();
		_netEventMgr = new NetEventMgr();
		_netEventMgr.AddMessageEvent(4012, OnChangeNicknameRes);
		_netEventMgr.AddMessageEvent(4014, OnQueryPlayerDetailInfoRes);
		_netEventMgr.AddMessageEvent(4094, OnSetPlayerAvatarRes);
		_netEventMgr.AddMessageEvent(4120, OnSetPlayerHeadFrameRes);
		_netEventMgr.AddMessageEvent(4118, OnGetPlayerHeadFrameInfoRes);
		_netEventMgr.AddMessageEvent(4122, OnUnlockPlayerHeadFrameRes);
		_netEventMgr.AddMessageEvent(4022, OnSetGuideInfoRes);
		_netEventMgr.AddMessageEvent(4180, OnGetExchangeCodePrizesRes);
		_netEventMgr.AddMessageEvent(8070, OnPlayerKickNotify);
		_netEventMgr.AddMessageEvent(4680, OnBatchQueryPlayerOnlineStatusRes);
		_netEventMgr.AddMessageEvent(4724, OnGetPushSettingsRes);
		_netEventMgr.AddMessageEvent(4726, OnSetPushSettingsRes);
		_netEventMgr.AddHeadStatusErrorEvent(OnHeadStatusError);
	}

	public void Clear()
	{
		if (_netEventMgr != null)
		{
			_netEventMgr.Clear();
			_netEventMgr = null;
		}
	}

	private void OnQueryPlayerDetailInfoRes(IMessage recvPkg, IMessage sendPkg)
	{
		if (!(recvPkg is QueryPlayerDetailInfoRes queryPlayerDetailInfoRes))
		{
			Log.Error("PlayerProtoHandler.OnQueryPlayerDetailInfoRes() res 为空");
			return;
		}
		long num = 0L;
		if (sendPkg is QueryPlayerDetailInfoReq queryPlayerDetailInfoReq)
		{
			num = queryPlayerDetailInfoReq.PlayerId;
		}
		if (num <= 0 && queryPlayerDetailInfoRes.PlayerDetailInfo != null && queryPlayerDetailInfoRes.PlayerDetailInfo.PlayerInfo != null)
		{
			num = queryPlayerDetailInfoRes.PlayerDetailInfo.PlayerInfo.PlayerId;
		}
		if (num > 0 && queryPlayerDetailInfoRes.PlayerDetailInfo != null && queryPlayerDetailInfoRes.PlayerDetailInfo.PlayerInfo != null && GameModule.Model.ChatModel.HasLocalPrivateChatForPeer(num))
		{
			GameModule.Model.ChatModel.MergePrivatePeerSnapshotFromSimplePlayer(num, queryPlayerDetailInfoRes.PlayerDetailInfo.PlayerInfo);
		}
		GameEvent.Send<PlayerDetailInfoEventData>(390004, new PlayerDetailInfoEventData
		{
			PlayerId = num,
			PlayerDetailInfo = queryPlayerDetailInfoRes.PlayerDetailInfo,
			Relation = queryPlayerDetailInfoRes.Relation
		});
	}

	private void OnSetPlayerAvatarRes(IMessage recvPkg, IMessage sendPkg)
	{
		if (!(recvPkg is SetPlayerAvatarRes setPlayerAvatarRes))
		{
			Log.Error("PlayerProtoHandler.OnSetPlayerAvatarRes() res 为空");
		}
		else
		{
			GameModule.Model.LoginModel.PlayerInfoData.UpdateAvatar(setPlayerAvatarRes.Avatar);
		}
	}

	private void OnSetPlayerHeadFrameRes(IMessage recvPkg, IMessage sendPkg)
	{
		if (!(recvPkg is SetPlayerHeadFrameRes setPlayerHeadFrameRes))
		{
			Log.Error("PlayerProtoHandler.OnSetPlayerHeadFrameRes() res 为空");
		}
		else
		{
			GameModule.Model.LoginModel.PlayerInfoData.UpdateHeadFrame(setPlayerHeadFrameRes.HeadFrame);
		}
	}

	public void SendGetPlayerHeadFrameInfo()
	{
		GameModule.Net.GameWebSocket.SendMessage(ProtoCmd.GetPlayerHeadFrameInfoReq, (IMessage)(object)new GetPlayerHeadFrameInfoReq());
	}

	public void SendUnlockPlayerHeadFrame(uint headFrameEntry)
	{
		UnlockPlayerHeadFrameReq msg = new UnlockPlayerHeadFrameReq
		{
			HeadFrame = headFrameEntry
		};
		GameModule.Net.GameWebSocket.SendMessage(ProtoCmd.UnlockPlayerHeadFrameReq, (IMessage)(object)msg);
	}

	private void OnGetPlayerHeadFrameInfoRes(IMessage recvPkg, IMessage sendPkg)
	{
		if (!(recvPkg is GetPlayerHeadFrameInfoRes getPlayerHeadFrameInfoRes))
		{
			Log.Error("PlayerProtoHandler.OnGetPlayerHeadFrameInfoRes() res 为空");
		}
		else
		{
			GameModule.Model.HeadFrameModel.ApplyHeadFrames((IList<Proto.AvatarInfo>)getPlayerHeadFrameInfoRes.HeadFrames);
		}
	}

	private void OnUnlockPlayerHeadFrameRes(IMessage recvPkg, IMessage sendPkg)
	{
		if (!(recvPkg is UnlockPlayerHeadFrameRes unlockPlayerHeadFrameRes))
		{
			Log.Error("PlayerProtoHandler.OnUnlockPlayerHeadFrameRes() res 为空");
			return;
		}
		GameModule.Model.HeadFrameModel.ApplyUnlock((unlockPlayerHeadFrameRes.HeadFrame != null) ? unlockPlayerHeadFrameRes.HeadFrame.Entry : 0u);
		GameModule.UI.OpenToast(LangCfg.GetLang("player_head_frame_unlock_success"));
	}

	private void OnSetGuideInfoRes(IMessage recvPkg, IMessage sendPkg)
	{
		if (!(recvPkg is SetGuideInfoRes))
		{
			Log.Error("PlayerProtoHandler.OnSetGuideInfoRes() res 为空");
		}
		else if (sendPkg is SetGuideInfoReq setGuideInfoReq)
		{
			GameModule.Model.LoginModel.PlayerInfoData.UpdateGuideInfos(setGuideInfoReq.GuideInfos);
		}
	}

	private void OnChangeNicknameRes(IMessage recvPkg, IMessage sendPkg)
	{
		if (!(recvPkg is ChangeNicknameRes changeNicknameRes))
		{
			Log.Error("PlayerProtoHandler.OnChangeNicknameRes() res 为空");
			GameModule.UI.OpenToast(LangCfg.GetLang("client_10097"));
			return;
		}
		GameModule.UI.OpenToast(LangCfg.GetLang("client_10098"));
		PlayerInfoData playerInfoData = GameModule.Model.LoginModel.PlayerInfoData;
		int gender = playerInfoData.Gender;
		int gender2 = changeNicknameRes.Gender;
		string nickname = playerInfoData.Nickname;
		playerInfoData.ApplyNicknameAndGender(changeNicknameRes.NewNickName, gender2, changeNicknameRes.ChangeCount);
		if (gender != gender2 || nickname != playerInfoData.Nickname)
		{
			GameEvent.Send(200504);
		}
	}

	private void OnGetExchangeCodePrizesRes(IMessage recvPkg, IMessage sendPkg)
	{
		if (!(recvPkg is GetExchangeCodePrizesRes getExchangeCodePrizesRes))
		{
			Log.Error("PlayerProtoHandler.OnGetExchangeCodePrizesRes() res 为空");
			return;
		}
		if (getExchangeCodePrizesRes.Reward != null)
		{
			RewardUtils.ShowCommonRewardsDialog(getExchangeCodePrizesRes.Reward);
		}
		GameModule.UI.CloseDialog(EnumDialog.ExchangeCodeDialog);
	}

	private void OnPlayerKickNotify(IMessage recvPkg, IMessage sendPkg)
	{
		if (!(recvPkg is PlayerKickNotify notify))
		{
			Log.Error("PlayerProtoHandler.OnPlayerKickNotify() notify 为空");
		}
		else
		{
			GameWebSocketUtils.OnPlayerKickNotify(notify);
		}
	}

	private void OnBatchQueryPlayerOnlineStatusRes(IMessage recvPkg, IMessage sendPkg)
	{
		if (!(recvPkg is BatchQueryPlayerOnlineStatusRes batchQueryPlayerOnlineStatusRes))
		{
			Log.Error("PlayerProtoHandler.OnBatchQueryPlayerOnlineStatusRes() res 为空");
			return;
		}
		GameModule.Model.ChatModel.ApplyPrivatePeerOnlineStatus((IEnumerable<PlayerOnlineStatusInfo>)batchQueryPlayerOnlineStatusRes.Players);
		GameEvent.Send(360006);
	}

	private void OnGetPushSettingsRes(IMessage recvPkg, IMessage sendPkg)
	{
		if (!(recvPkg is GetPushSettingsRes getPushSettingsRes))
		{
			Log.Error("PlayerProtoHandler.OnGetPushSettingsRes() res 为空");
			return;
		}
		if (getPushSettingsRes.Settings == null)
		{
			Log.Error("PlayerProtoHandler.OnGetPushSettingsRes() settings 为空");
			return;
		}
		GameModule.Model.LoginModel.ApplyPushSettings(getPushSettingsRes.Settings);
		GameEvent.Send(100019);
	}

	private void OnSetPushSettingsRes(IMessage recvPkg, IMessage sendPkg)
	{
		if (!(recvPkg is SetPushSettingsRes setPushSettingsRes))
		{
			Log.Error("PlayerProtoHandler.OnSetPushSettingsRes() res 为空");
			return;
		}
		if (setPushSettingsRes.Settings == null)
		{
			Log.Error("PlayerProtoHandler.OnSetPushSettingsRes() settings 为空");
			return;
		}
		GameModule.Model.LoginModel.ApplyPushSettings(setPushSettingsRes.Settings);
		GameEvent.Send(100019);
	}

	private void OnHeadStatusError(PacketHead head)
	{
		if (head.Command == 4726)
		{
			GameEvent.Send(100019);
		}
	}
}
