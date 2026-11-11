using System.Collections.Generic;
using Google.Protobuf;
using Launcher;
using Proto;
using TEngine;
using UnityEngine;
using UnityWebSocket;

namespace GameLogic;

public class BaseWebSocket
{
	private Dictionary<ProtoCmd, float> lastSendTimes = new Dictionary<ProtoCmd, float>();

	private readonly WebSocketType type;

	private IWebSocket webSocketInst;

	private string url = "";

	private readonly List<string> connectUrls = new List<string>();

	private int connectUrlIndex;

	private bool isConnecting;

	private object lastFailoverSender;

	private CloseEventArgs closeArgs;

	private int seq;

	private Dictionary<int, IMessage> inflightPackets = new Dictionary<int, IMessage>();

	public WebSocketType Type => type;

	public IWebSocket WebSocketInst => webSocketInst;

	public string URL => url;

	public CloseEventArgs CloseArgs => closeArgs;

	public WebSocketState WebSocketState
	{
		get
		{
			//IL_0010: Unknown result type (might be due to invalid IL or missing references)
			IWebSocket obj = webSocketInst;
			if (obj == null)
			{
				return (WebSocketState)1000;
			}
			return obj.ReadyState;
		}
	}

	private int Seq
	{
		get
		{
			if (seq == 0)
			{
				seq = Random.Range(1, 999);
				if (seq % 2 == 0)
				{
					seq++;
				}
			}
			seq += 2;
			return seq;
		}
	}

	public BaseWebSocket(WebSocketType type)
	{
		this.type = type;
	}

	public void Connect(string url)
	{
		Connect(new List<string> { url });
	}

	public void Connect(IList<string> urls)
	{
		connectUrls.Clear();
		if (urls != null)
		{
			for (int i = 0; i < urls.Count; i++)
			{
				if (!string.IsNullOrEmpty(urls[i]))
				{
					connectUrls.Add(urls[i]);
				}
			}
		}
		if (connectUrls.Count == 0)
		{
			Log.Error($"[WebSocket {type}] Connect: urls is empty");
			return;
		}
		connectUrlIndex = 0;
		url = connectUrls[0];
		isConnecting = true;
		lastFailoverSender = null;
		ConnectInternel();
	}

	public void ReConnect()
	{
		if (connectUrls.Count > 0)
		{
			connectUrlIndex = 0;
			url = connectUrls[0];
			isConnecting = true;
			lastFailoverSender = null;
		}
		else if (!string.IsNullOrEmpty(url))
		{
			isConnecting = true;
			lastFailoverSender = null;
		}
		ConnectInternel();
	}

	public List<string> GetConnectUrls()
	{
		if (connectUrls.Count > 0)
		{
			return new List<string>(connectUrls);
		}
		if (!string.IsNullOrEmpty(url))
		{
			return new List<string> { url };
		}
		return new List<string>();
	}

	public void ReplaceConnectUrls(IList<string> urls)
	{
		connectUrls.Clear();
		if (urls != null)
		{
			for (int i = 0; i < urls.Count; i++)
			{
				if (!string.IsNullOrEmpty(urls[i]))
				{
					connectUrls.Add(urls[i]);
				}
			}
		}
		connectUrlIndex = 0;
		if (connectUrls.Count > 0)
		{
			url = connectUrls[0];
		}
	}

	public void Close()
	{
		isConnecting = false;
		CloseInternal();
	}

	public void SendMessage(ProtoCmd cmd, IMessage msg, bool ignoreRateLimit = false)
	{
		if (webSocketInst == null)
		{
			Log.Error($"[WebSocket {type}] SendMessage: WebSocket is not connected");
			Singleton<ToastManager>.Instance.ShowSimpleToast(LangCfg.GetLang("websocket_not_connected"));
			return;
		}
		if (!ignoreRateLimit)
		{
			float time = Time.time;
			if (lastSendTimes.TryGetValue(cmd, out var value))
			{
				_ = time - value;
				_ = 0.2f;
			}
			lastSendTimes[cmd] = time;
		}
		ByteString body = MessageExtensions.ToByteString(msg);
		PacketHead packetHead = new PacketHead
		{
			Command = (uint)cmd,
			Service = 2u,
			Seq = (uint)Seq,
			Refer = (uint)GameModule.Model.LoginModel.PlayerId
		};
		Packet packet = new Packet
		{
			Head = packetHead,
			Body = body
		};
		byte[] array = MessageExtensions.ToByteArray((IMessage)(object)packet);
		webSocketInst.SendAsync(array);
		inflightPackets.Add((int)packetHead.Seq, msg);
		NetEvent.Send(4, this, packet);
	}

	public void OnReceiveMessage(PacketHead head, IMessage resPackage, IMessage sendPacket)
	{
		NetEvent.Send<IMessage, IMessage>((int)head.Command, resPackage, sendPacket);
	}

	public void OnResWithStatusError(PacketHead head, IMessage sendPacket)
	{
		NetEvent.Send(8, head);
	}

	public void OnSocketTimeout()
	{
	}

	private void ParseReceivePackage(byte[] data)
	{
		Packet packet = Packet.Parser.ParseFrom(data);
		PacketHead head = packet.Head;
		NetEvent.Send(6, this, (int)head.Command);
		if (!ProtoParserRegister.Parsers.TryGetValue((int)head.Command, out var value))
		{
			Log.Error($"[WebSocket {type}] ParseReceivePackage: URL:{URL} Command:{head.Command} Parser is null");
			return;
		}
		if (inflightPackets.TryGetValue((int)(head.Seq - 1), out var value2))
		{
			inflightPackets.Remove((int)(head.Seq - 1));
		}
		if (head.Status != 0)
		{
			OnResWithStatusError(head, value2);
			return;
		}
		IMessage resPackage = value(packet.Body);
		OnReceiveMessage(head, resPackage, value2);
	}

	private void ConnectInternel()
	{
		//IL_0015: Unknown result type (might be due to invalid IL or missing references)
		//IL_001f: Expected O, but got Unknown
		if (webSocketInst != null)
		{
			ClearWebSocket();
		}
		webSocketInst = (IWebSocket)new WebSocket(url);
		webSocketInst.OnOpen += OnOpen;
		webSocketInst.OnClose += OnClose;
		webSocketInst.OnError += OnError;
		webSocketInst.OnMessage += OnMessage;
		webSocketInst.ConnectAsync();
	}

	private void CloseInternal()
	{
		//IL_000e: Unknown result type (might be due to invalid IL or missing references)
		//IL_0014: Invalid comparison between Unknown and I4
		//IL_001c: Unknown result type (might be due to invalid IL or missing references)
		//IL_0022: Invalid comparison between Unknown and I4
		//IL_003e: Unknown result type (might be due to invalid IL or missing references)
		//IL_0048: Expected O, but got Unknown
		if (webSocketInst == null || (int)webSocketInst.ReadyState == 2 || (int)webSocketInst.ReadyState == 3)
		{
			webSocketInst = null;
			return;
		}
		ClearWebSocket();
		OnClose(this, new CloseEventArgs((CloseStatusCode)1000, "initiative Close"));
	}

	private void ClearWebSocket()
	{
		//IL_006b: Unknown result type (might be due to invalid IL or missing references)
		//IL_0071: Invalid comparison between Unknown and I4
		//IL_0079: Unknown result type (might be due to invalid IL or missing references)
		if (webSocketInst != null)
		{
			webSocketInst.OnOpen -= OnOpen;
			webSocketInst.OnClose -= OnClose;
			webSocketInst.OnError -= OnError;
			webSocketInst.OnMessage -= OnMessage;
			if ((int)webSocketInst.ReadyState == 1 || (int)webSocketInst.ReadyState == 0)
			{
				webSocketInst.CloseAsync();
			}
			webSocketInst = null;
		}
	}

	private void ClearWebSocketCloseReason()
	{
		closeArgs = null;
	}

	private void OnOpen(object sender, OpenEventArgs e)
	{
		if (webSocketInst == null || sender == webSocketInst)
		{
			isConnecting = false;
			lastFailoverSender = null;
			ClearWebSocketCloseReason();
			NetEvent.Send(1, this);
		}
	}

	private void OnClose(object sender, CloseEventArgs e)
	{
		if (webSocketInst == null || sender == webSocketInst)
		{
			if (!isConnecting && !ShouldSkipNetworkQualityProbe(e))
			{
				TryProbeNetworkQuality();
			}
			if (!TryFailoverOnConnectFailure(sender, "OnClose"))
			{
				closeArgs = e;
				ClearWebSocket();
				NetEvent.Send<BaseWebSocket, CloseEventArgs>(2, this, e);
			}
		}
	}

	private void OnError(object sender, ErrorEventArgs e)
	{
		if (webSocketInst == null || sender == webSocketInst)
		{
			string arg = ((e.Exception != null) ? e.Exception.ToString() : e.Message);
			Log.Error($"[WebSocket {type}] OnError: URL:{URL} Error:{arg}");
			if (!isConnecting)
			{
				TryProbeNetworkQuality();
			}
			if (!TryFailoverOnConnectFailure(sender, "OnError"))
			{
				NetEvent.Send<BaseWebSocket, ErrorEventArgs>(3, this, e);
			}
		}
	}

	private bool TryFailoverOnConnectFailure(object sender, string fromEvent)
	{
		if (!isConnecting)
		{
			return false;
		}
		if (lastFailoverSender != null && sender == lastFailoverSender)
		{
			return true;
		}
		lastFailoverSender = sender;
		_ = connectUrlIndex;
		TryProbeNetworkQuality();
		return TryConnectNextUrl();
	}

	private bool TryConnectNextUrl()
	{
		if (!isConnecting || connectUrls.Count == 0)
		{
			return false;
		}
		connectUrlIndex++;
		if (connectUrlIndex >= connectUrls.Count)
		{
			isConnecting = false;
			Log.Error(string.Format("[WebSocket {0}] all domains failed, count={1}, domains=[{2}]", type, connectUrls.Count, string.Join(", ", connectUrls)));
			return false;
		}
		url = connectUrls[connectUrlIndex];
		ConnectInternel();
		return true;
	}

	private void OnMessage(object sender, MessageEventArgs e)
	{
		NetEvent.Send(5, this);
		ParseReceivePackage(e.RawData);
	}

	public virtual void SendPing()
	{
	}

	public void TryProbeNetworkQuality()
	{
		TryProbeNetworkQuality(url);
	}

	public static void TryProbeNetworkQuality(string probeUrl)
	{
		SdkTrackHelper.TryProbeNetworkQuality(probeUrl);
	}

	private static bool ShouldSkipNetworkQualityProbe(CloseEventArgs closeArgs)
	{
		//IL_0006: Unknown result type (might be due to invalid IL or missing references)
		//IL_0010: Invalid comparison between Unknown and I4
		if (closeArgs == null)
		{
			return false;
		}
		if ((int)closeArgs.StatusCode == 1000)
		{
			return true;
		}
		return closeArgs.Code > 4000;
	}
}
