using System;
using System.Collections.Generic;
using Google.Protobuf;
using Proto;
using UnityEngine;

namespace GameLogic;

public class GameWebSocket : BaseWebSocket
{
	private readonly List<PendingSendMessage> pendingSendMessages = new List<PendingSendMessage>();

	private bool _disableReConnect;

	public bool DisableReConnect
	{
		get
		{
			return _disableReConnect;
		}
		set
		{
			_disableReConnect = value;
			if (value)
			{
				ClearPendingSendMessages();
			}
		}
	}

	public float LastHeartbeatSendTime { get; private set; }

	public float LastHeartbeatRtt { get; internal set; }

	public GameWebSocket()
		: base(WebSocketType.Gateway)
	{
	}

	public new void SendMessage(ProtoCmd cmd, IMessage msg, bool ignoreRateLimit = false)
	{
		if (ShouldCacheSend(cmd))
		{
			EnqueuePendingSend(cmd, msg, ignoreRateLimit);
		}
		else
		{
			base.SendMessage(cmd, msg, ignoreRateLimit);
		}
	}

	public void FlushPendingSendMessages()
	{
		if (pendingSendMessages.Count == 0)
		{
			return;
		}
		foreach (PendingSendMessage pendingSendMessage in pendingSendMessages)
		{
			base.SendMessage(pendingSendMessage.Cmd, pendingSendMessage.Message, pendingSendMessage.IgnoreRateLimit);
		}
		pendingSendMessages.Clear();
	}

	public void ClearPendingSendMessages()
	{
		if (pendingSendMessages.Count != 0)
		{
			pendingSendMessages.Clear();
		}
	}

	private void EnqueuePendingSend(ProtoCmd cmd, IMessage msg, bool ignoreRateLimit)
	{
		pendingSendMessages.RemoveAll((PendingSendMessage p) => p.Cmd == cmd);
		pendingSendMessages.Add(new PendingSendMessage(cmd, msg, ignoreRateLimit));
	}

	public override void SendPing()
	{
		HeartbeatReq msg = new HeartbeatReq
		{
			Time = (uint)DateTimeOffset.UtcNow.ToUnixTimeSeconds()
		};
		LastHeartbeatSendTime = Time.realtimeSinceStartup;
		SendMessage(ProtoCmd.HeartbeatReq, (IMessage)(object)msg);
	}

	private bool ShouldCacheSend(ProtoCmd cmd)
	{
		//IL_0010: Unknown result type (might be due to invalid IL or missing references)
		//IL_0016: Invalid comparison between Unknown and I4
		if (!GameModule.Net.IsCacheableSendCmd(cmd))
		{
			return false;
		}
		if ((int)base.WebSocketState != 1)
		{
			return true;
		}
		if (!GameModule.Fsm.HasFsm<GameWebSocket>())
		{
			return false;
		}
		return !(GameModule.Fsm.GetFsm<GameWebSocket>().CurrentState is GameWebSocketConnectedState);
	}
}
