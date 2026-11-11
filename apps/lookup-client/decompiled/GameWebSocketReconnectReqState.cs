using FairyGUI;
using Google.Protobuf;
using Launcher;
using Proto;
using TEngine;
using UnityWebSocket;

namespace GameLogic;

public class GameWebSocketReconnectReqState : BaseGameWebSocketState
{
	private int reConnectReqCount;

	protected override void Reset()
	{
		//IL_0013: Unknown result type (might be due to invalid IL or missing references)
		//IL_001d: Expected O, but got Unknown
		reConnectReqCount = 0;
		Timers.inst.Remove(new TimerCallback(SendReConnectReq));
		base.Reset();
	}

	protected override void OnEnter(IFsm<GameWebSocket> fsm)
	{
		//IL_006b: Unknown result type (might be due to invalid IL or missing references)
		//IL_0075: Expected O, but got Unknown
		base.OnEnter(fsm);
		base.NetEventMgrInst.AddEvent<IMessage, IMessage>(4024, OnReConnectRes);
		base.NetEventMgrInst.AddHeadStatusErrorEvent(OnHeadStatusError);
		base.NetEventMgrInst.AddEvent<BaseWebSocket, CloseEventArgs>(2, OnWebSocketClosed);
		SendReConnectReq(null);
		Timers.inst.Add(5f, 2, new TimerCallback(SendReConnectReq));
	}

	private void SendReConnectReq(object param)
	{
		reConnectReqCount++;
		if (reConnectReqCount >= 3)
		{
			OnReconnectFail();
			return;
		}
		GameModule.Net.GameWebSocket.SendMessage(ProtoCmd.ReConnectReq, (IMessage)(object)new ReConnectReq
		{
			Token = GameModule.Model.LoginModel.Token
		});
	}

	private void OnHeadStatusError(PacketHead head)
	{
		//IL_002b: Unknown result type (might be due to invalid IL or missing references)
		//IL_0035: Expected O, but got Unknown
		if (head.Status == 10102)
		{
			base.FsmInst.Owner.DisableReConnect = true;
			Timers.inst.Remove(new TimerCallback(SendReConnectReq));
			Singleton<LayerManager>.Instance.NetLayer.HideConnectionWait();
			GameWebSocketUtils.ShowLoginTokenExpiredDialog(base.FsmInst.Owner);
			((FsmState<GameWebSocket>)this).ChangeState<GameWebSocketClosedState>(base.FsmInst);
		}
	}

	private void OnReConnectRes(IMessage recvPkg, IMessage sendPkg)
	{
		//IL_000c: Unknown result type (might be due to invalid IL or missing references)
		//IL_0016: Expected O, but got Unknown
		Timers.inst.Remove(new TimerCallback(SendReConnectReq));
		if (recvPkg is ReConnectRes reConnectRes)
		{
			GameModule.Model.ServerModel.SyncServerTime(reConnectRes.Timestamp, reConnectRes.TimeZoneOffset);
			GameModule.Model.EliteMonsterSummonModel.OnChange(reConnectRes.EquipSummon);
		}
		long playerId = GameModule.Model.LoginModel.PlayerId;
		if (playerId > 0)
		{
			AceSdk.NotifyUserLogin((int)Singleton<SdkManager>.Instance.GetAccountType(), playerId.ToString(), string.Empty);
		}
		Singleton<LayerManager>.Instance.NetLayer.HideConnectionWait();
		((FsmState<GameWebSocket>)this).ChangeState<GameWebSocketConnectedState>(base.FsmInst);
	}

	private void OnWebSocketClosed(BaseWebSocket webSocket, CloseEventArgs e)
	{
		if (!base.FsmInst.Owner.DisableReConnect && !OnReceiveCloseCode(e))
		{
			((FsmState<GameWebSocket>)this).ChangeState<GameWebSocketReconnectState>(base.FsmInst);
		}
	}

	private void OnReconnectFail()
	{
		base.FsmInst.Owner.ClearPendingSendMessages();
		Singleton<LayerManager>.Instance.NetLayer.HideConnectionWait();
		base.FsmInst.Owner.Close();
		((FsmState<GameWebSocket>)this).ChangeState<GameWebSocketClosedState>(base.FsmInst);
	}
}
