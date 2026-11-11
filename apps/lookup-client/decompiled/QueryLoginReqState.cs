using System;
using System.Diagnostics;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using Cysharp.Threading.Tasks;
using Cysharp.Threading.Tasks.CompilerServices;
using Google.Protobuf;
using Proto;
using TEngine;

namespace GameLogic;

public class QueryLoginReqState : BaseLoginState
{
	[StructLayout(LayoutKind.Auto)]
	[CompilerGenerated]
	private struct _003COnServerMaintenanceAsync_003Ed__2 : IAsyncStateMachine
	{
		public int _003C_003E1__state;

		public AsyncUniTaskVoidMethodBuilder _003C_003Et__builder;

		public QueryLoginReqState _003C_003E4__this;

		public IFsm<LoginView> fsm;

		private Awaiter _003C_003Eu__1;

		private void MoveNext()
		{
			//IL_0053: Unknown result type (might be due to invalid IL or missing references)
			//IL_0058: Unknown result type (might be due to invalid IL or missing references)
			//IL_005f: Unknown result type (might be due to invalid IL or missing references)
			//IL_001a: Unknown result type (might be due to invalid IL or missing references)
			//IL_001f: Unknown result type (might be due to invalid IL or missing references)
			//IL_0023: Unknown result type (might be due to invalid IL or missing references)
			//IL_0028: Unknown result type (might be due to invalid IL or missing references)
			//IL_003c: Unknown result type (might be due to invalid IL or missing references)
			//IL_003d: Unknown result type (might be due to invalid IL or missing references)
			int num = _003C_003E1__state;
			QueryLoginReqState queryLoginReqState = _003C_003E4__this;
			try
			{
				Awaiter val2;
				if (num != 0)
				{
					UniTask val = ServerMaintenanceNoticeHelper.ShowAsync();
					val2 = ((UniTask)(ref val)).GetAwaiter();
					if (!((Awaiter)(ref val2)).IsCompleted)
					{
						num = (_003C_003E1__state = 0);
						_003C_003Eu__1 = val2;
						((AsyncUniTaskVoidMethodBuilder)(ref _003C_003Et__builder)).AwaitUnsafeOnCompleted<Awaiter, _003COnServerMaintenanceAsync_003Ed__2>(ref val2, ref this);
						return;
					}
				}
				else
				{
					val2 = _003C_003Eu__1;
					_003C_003Eu__1 = default(Awaiter);
					num = (_003C_003E1__state = -1);
				}
				((Awaiter)(ref val2)).GetResult();
				((FsmState<LoginView>)queryLoginReqState).ChangeState<LoginErrorState>(fsm);
			}
			catch (Exception exception)
			{
				_003C_003E1__state = -2;
				((AsyncUniTaskVoidMethodBuilder)(ref _003C_003Et__builder)).SetException(exception);
				return;
			}
			_003C_003E1__state = -2;
			((AsyncUniTaskVoidMethodBuilder)(ref _003C_003Et__builder)).SetResult();
		}

		void IAsyncStateMachine.MoveNext()
		{
			//ILSpy generated this explicit interface implementation from .override directive in MoveNext
			this.MoveNext();
		}

		[DebuggerHidden]
		private void SetStateMachine(IAsyncStateMachine stateMachine)
		{
			((AsyncUniTaskVoidMethodBuilder)(ref _003C_003Et__builder)).SetStateMachine(stateMachine);
		}

		void IAsyncStateMachine.SetStateMachine(IAsyncStateMachine stateMachine)
		{
			//ILSpy generated this explicit interface implementation from .override directive in SetStateMachine
			this.SetStateMachine(stateMachine);
		}
	}

	protected override void OnEnter(IFsm<LoginView> fsm)
	{
		base.OnEnter(fsm);
		base.NetEventMgr.AddMessageEvent(4002, delegate(IMessage recvPkg, IMessage sendPkg)
		{
			fsm.Owner.ConsumeLoginAfterRoleAlreadyExists();
			if (recvPkg is LoginRes loginRes)
			{
				GameModule.Model.LoginModel.Token = loginRes.Token;
				GameModule.Model.ServerModel.SyncServerTime(loginRes.Timestamp, loginRes.TimeZoneOffset);
			}
			Singleton<UIModule>.Instance.ShowLoginLoading(10);
			((FsmState<LoginView>)this).ChangeState<QueryPlayerDataState>(fsm);
		});
		base.NetEventMgr.AddHeadStatusErrorEvent(delegate(PacketHead head)
		{
			//IL_0195: Unknown result type (might be due to invalid IL or missing references)
			//IL_019a: Unknown result type (might be due to invalid IL or missing references)
			Log.Error($"[QueryLoginReqState] OnHeadStatusError: {head.Command} , {head.Status}");
			if (head.Status == 10203)
			{
				if (fsm.Owner.ConsumeLoginAfterRoleAlreadyExists())
				{
					Log.Error("[QueryLoginReqState] CreateCharacter 返回 10204 已存在，但 LoginReq 仍返回 10203 未创角，停止创角死循环");
					Log.Error($"[QueryLoginReqState] accountId={Singleton<SdkManager>.Instance.GetAccountId()}, serverId={GameModule.Model.ServerModel.CurServerId}, token={Singleton<SdkManager>.Instance.GetToken()}");
					fsm.Owner.ClearReconnectCreateRoleFlow();
					Singleton<UIModule>.Instance.OpenToast(LangCfg.GetLang("login_role_exists_but_login_failed"));
					((FsmState<LoginView>)this).ChangeState<LoginErrorState>(fsm);
				}
				else
				{
					((FsmState<LoginView>)this).ChangeState<WaitCreateRoleState>(fsm);
				}
			}
			else if (head.Status == 10101)
			{
				string text = LangCfg.GetLang($"server_{head.Status}");
				if (text.StartsWith("[lang error]:", StringComparison.Ordinal))
				{
					text = $"服务器报错：{head.Status}";
				}
				GameModule.UI.OpenSystemDialog(EnumDialog.SystemAlert, SystemDialogPriority.Normal, excludeSame: false, new AlertData
				{
					msg = text,
					title = LangCfg.GetLang("net_alert_title"),
					isShowCancelBtn = false,
					closeOnMaskClick = false,
					okCallback = delegate
					{
						((FsmState<LoginView>)this).ChangeState<LoginErrorState>(fsm);
					}
				});
			}
			else if (head.Status == 10100)
			{
				UniTaskVoid val = OnServerMaintenanceAsync(fsm);
				((UniTaskVoid)(ref val)).Forget();
			}
			else
			{
				string text2 = LangCfg.GetLang($"server_{head.Status}");
				if (text2.StartsWith("[lang error]:", StringComparison.Ordinal))
				{
					text2 = $"服务器报错：{head.Status}";
				}
				Singleton<UIModule>.Instance.OpenToast(text2);
				((FsmState<LoginView>)this).ChangeState<LoginErrorState>(fsm);
			}
		});
		LoginReq msg = new LoginReq
		{
			ServerId = GameModule.Model.ServerModel.CurServerId,
			LoginInfo = new LoginInfo
			{
				Token = Singleton<SdkManager>.Instance.GetToken(),
				AccountId = Singleton<SdkManager>.Instance.GetAccountId(),
				SdkPlatform = SdkPlatform.SdkPlatform
			}
		};
		GameModule.Net.GameWebSocket.SendMessage(ProtoCmd.LoginReq, (IMessage)(object)msg);
	}

	protected override void OnLeave(IFsm<LoginView> fsm, bool isShutdown)
	{
		base.OnLeave(fsm, isShutdown);
	}

	[AsyncStateMachine(typeof(_003COnServerMaintenanceAsync_003Ed__2))]
	private UniTaskVoid OnServerMaintenanceAsync(IFsm<LoginView> fsm)
	{
		//IL_0002: Unknown result type (might be due to invalid IL or missing references)
		//IL_0007: Unknown result type (might be due to invalid IL or missing references)
		//IL_0039: Unknown result type (might be due to invalid IL or missing references)
		_003COnServerMaintenanceAsync_003Ed__2 _003COnServerMaintenanceAsync_003Ed__ = default(_003COnServerMaintenanceAsync_003Ed__2);
		_003COnServerMaintenanceAsync_003Ed__._003C_003Et__builder = AsyncUniTaskVoidMethodBuilder.Create();
		_003COnServerMaintenanceAsync_003Ed__._003C_003E4__this = this;
		_003COnServerMaintenanceAsync_003Ed__.fsm = fsm;
		_003COnServerMaintenanceAsync_003Ed__._003C_003E1__state = -1;
		((AsyncUniTaskVoidMethodBuilder)(ref _003COnServerMaintenanceAsync_003Ed__._003C_003Et__builder)).Start<_003COnServerMaintenanceAsync_003Ed__2>(ref _003COnServerMaintenanceAsync_003Ed__);
		return ((AsyncUniTaskVoidMethodBuilder)(ref _003COnServerMaintenanceAsync_003Ed__._003C_003Et__builder)).Task;
	}
}
