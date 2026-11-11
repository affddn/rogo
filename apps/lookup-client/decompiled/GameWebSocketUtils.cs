using System;
using Cysharp.Threading.Tasks;
using Proto;

namespace GameLogic;

public static class GameWebSocketUtils
{
	private static PLAYER_KICK_REASON? _pendingPlayerKickReason;

	public static void OnPlayerKickNotify(PlayerKickNotify notify)
	{
		if (notify != null && notify.Reason != PLAYER_KICK_REASON.None)
		{
			if (GameModule.UI.CurrentView is FightView)
			{
				_pendingPlayerKickReason = notify.Reason;
			}
			else
			{
				ExecutePlayerKickByNotify(notify.Reason);
			}
		}
	}

	public static void TryExecutePendingPlayerKick()
	{
		if (_pendingPlayerKickReason.HasValue)
		{
			PLAYER_KICK_REASON value = _pendingPlayerKickReason.Value;
			_pendingPlayerKickReason = null;
			ExecutePlayerKickByNotify(value);
		}
	}

	public static bool TryHandleKickByCloseCode(GameWebSocket socket, int closeCode)
	{
		switch (closeCode)
		{
		case 4001:
			ShowKickAlert("kick_by_other_device", socket);
			return true;
		case 4002:
			ShowKickAlert("kick_by_server_closed", socket);
			return true;
		case 4003:
			ShowKickAlert("kick_by_forbidden", socket);
			return true;
		case 4004:
			ShowKickRestartAppAlert("login_client_version_outdated", socket);
			return true;
		case 4005:
			ShowKickAlert("kick_by_auth_timeout", socket);
			return true;
		case 4006:
			ShowKickAlert("kick_by_data_changed", socket);
			return true;
		default:
			return false;
		}
	}

	private static void ExecutePlayerKickByNotify(PLAYER_KICK_REASON reason)
	{
		ShowKickUiByNotifyReason(reason);
	}

	private static void ShowKickUiByNotifyReason(PLAYER_KICK_REASON reason)
	{
		switch (reason)
		{
		case PLAYER_KICK_REASON.NewVersion:
			ShowKickRestartAppAlert("login_client_version_outdated");
			break;
		case PLAYER_KICK_REASON.DataChanged:
			ShowKickAlert("kick_by_data_changed");
			break;
		default:
			ShowKickAlert("kick_by_server_closed");
			break;
		}
	}

	private static void DisconnectWebSocketForKick(GameWebSocket socket)
	{
		socket.DisableReConnect = true;
		socket.ClearPendingSendMessages();
		socket.Close();
	}

	public static void ShowDefaultDisconnectAlert(Action onConfirmReconnect)
	{
		GameModule.UI.OpenSystemDialog(EnumDialog.SystemAlert, SystemDialogPriority.NetError, excludeSame: true, new AlertData
		{
			msg = LangCfg.GetLang("net_disconnected"),
			title = LangCfg.GetLang("net_alert_title"),
			isShowCancelBtn = false,
			closeOnMaskClick = false,
			okCallback = delegate
			{
				onConfirmReconnect?.Invoke();
			}
		});
	}

	private static void ConfirmKickBackToLogin()
	{
		//IL_000a: Unknown result type (might be due to invalid IL or missing references)
		//IL_000f: Unknown result type (might be due to invalid IL or missing references)
		Singleton<SdkManager>.Instance.ClearLoginState();
		UniTaskVoid val = GameApp.Restart();
		((UniTaskVoid)(ref val)).Forget();
	}

	private static void ConfirmKickRestartApp()
	{
		Singleton<SdkManager>.Instance.ClearLoginState();
		GameApp.RestartApp();
	}

	public static void ShowKickAlert(string langKey, GameWebSocket socket = null)
	{
		DisconnectWebSocketForKick(socket ?? GameModule.Net.GameWebSocket);
		GameModule.UI.OpenSystemDialog(EnumDialog.SystemAlert, SystemDialogPriority.NetError, excludeSame: true, new AlertData
		{
			msg = LangCfg.GetLang(langKey),
			title = LangCfg.GetLang("net_alert_title"),
			isShowCancelBtn = false,
			closeOnMaskClick = false,
			okCallback = delegate
			{
				ConfirmKickBackToLogin();
			}
		});
	}

	public static void ShowKickRestartAppAlert(string langKey, GameWebSocket socket = null)
	{
		DisconnectWebSocketForKick(socket ?? GameModule.Net.GameWebSocket);
		GameModule.UI.OpenSystemDialog(EnumDialog.SystemAlert, SystemDialogPriority.NetError, excludeSame: true, new AlertData
		{
			msg = LangCfg.GetLang(langKey),
			title = LangCfg.GetLang("net_alert_title"),
			isShowCancelBtn = false,
			isShowOkBtn = true,
			closeOnMaskClick = false,
			okCallback = delegate
			{
				ConfirmKickRestartApp();
			}
		});
	}

	public static void ShowLoginTokenExpiredDialog(GameWebSocket socket)
	{
		socket.Close();
		GameModule.UI.OpenSystemDialog(EnumDialog.SystemAlert, SystemDialogPriority.NetError, excludeSame: true, new AlertData
		{
			msg = LangCfg.GetLang("login_token_expired_restart"),
			title = LangCfg.GetLang("net_alert_title"),
			isShowCancelBtn = false,
			closeOnMaskClick = false,
			okCallback = delegate
			{
				ConfirmKickBackToLogin();
			}
		});
	}
}
