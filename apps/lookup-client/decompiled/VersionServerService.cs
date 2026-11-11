using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using System.Threading;
using Cysharp.Threading.Tasks;
using Cysharp.Threading.Tasks.CompilerServices;
using Google.Protobuf;
using Launcher;
using Launcher.HotUpdate;
using Proto;
using TEngine;

namespace GameLogic;

public static class VersionServerService
{
	[StructLayout(LayoutKind.Auto)]
	[CompilerGenerated]
	private struct _003CFetchClientParamsAsync_003Ed__12 : IAsyncStateMachine
	{
		public int _003C_003E1__state;

		public AsyncUniTaskMethodBuilder _003C_003Et__builder;

		private string _003Curl_003E5__2;

		private Awaiter<byte[]> _003C_003Eu__1;

		private void MoveNext()
		{
			//IL_00af: Unknown result type (might be due to invalid IL or missing references)
			//IL_00b4: Unknown result type (might be due to invalid IL or missing references)
			//IL_00bc: Unknown result type (might be due to invalid IL or missing references)
			//IL_0071: Unknown result type (might be due to invalid IL or missing references)
			//IL_0076: Unknown result type (might be due to invalid IL or missing references)
			//IL_007a: Unknown result type (might be due to invalid IL or missing references)
			//IL_007f: Unknown result type (might be due to invalid IL or missing references)
			//IL_0094: Unknown result type (might be due to invalid IL or missing references)
			//IL_0096: Unknown result type (might be due to invalid IL or missing references)
			int num = _003C_003E1__state;
			try
			{
				if (num == 0)
				{
					goto IL_004b;
				}
				ClearClientParams();
				string versionServerUrl = GetVersionServerUrl();
				string platformName = default(string);
				if (!string.IsNullOrEmpty(versionServerUrl))
				{
					_003Curl_003E5__2 = versionServerUrl.TrimEnd('/') + "/client_params";
					platformName = UpdateSetting.GetPlatformName();
					goto IL_004b;
				}
				Log.Error("[VersionServerService] FetchClientParamsAsync: Version服URL为空");
				goto end_IL_0007;
				IL_004b:
				try
				{
					Awaiter<byte[]> val;
					if (num != 0)
					{
						QueryClientParamsReq queryClientParamsReq = new QueryClientParamsReq
						{
							Platform = platformName
						};
						val = Http.PostBinary(_003Curl_003E5__2, MessageExtensions.ToByteArray((IMessage)(object)queryClientParamsReq), "application/x-protobuf", 15f).GetAwaiter();
						if (!val.IsCompleted)
						{
							num = (_003C_003E1__state = 0);
							_003C_003Eu__1 = val;
							((AsyncUniTaskMethodBuilder)(ref _003C_003Et__builder)).AwaitUnsafeOnCompleted<Awaiter<byte[]>, _003CFetchClientParamsAsync_003Ed__12>(ref val, ref this);
							return;
						}
					}
					else
					{
						val = _003C_003Eu__1;
						_003C_003Eu__1 = default(Awaiter<byte[]>);
						num = (_003C_003E1__state = -1);
					}
					byte[] result = val.GetResult();
					if (result == null || result.Length == 0)
					{
						Log.Error("[VersionServerService] FetchClientParamsAsync: 响应为空");
						ProbeVersionServerOnNetworkError();
					}
					else
					{
						QueryClientParamsRes queryClientParamsRes = QueryClientParamsRes.Parser.ParseFrom(result);
						if (queryClientParamsRes.Params == null)
						{
							Log.Error("[VersionServerService] FetchClientParamsAsync: 响应缺少 Params");
						}
						else
						{
							SaveClientParams(queryClientParamsRes.Params);
						}
					}
				}
				catch (Exception ex)
				{
					ClearClientParams();
					Log.Error("[VersionServerService] FetchClientParamsAsync: 请求异常 url=" + _003Curl_003E5__2 + " - " + ex.Message);
					ProbeVersionServerOnNetworkError();
				}
				end_IL_0007:;
			}
			catch (Exception exception)
			{
				_003C_003E1__state = -2;
				_003Curl_003E5__2 = null;
				((AsyncUniTaskMethodBuilder)(ref _003C_003Et__builder)).SetException(exception);
				return;
			}
			_003C_003E1__state = -2;
			_003Curl_003E5__2 = null;
			((AsyncUniTaskMethodBuilder)(ref _003C_003Et__builder)).SetResult();
		}

		void IAsyncStateMachine.MoveNext()
		{
			//ILSpy generated this explicit interface implementation from .override directive in MoveNext
			this.MoveNext();
		}

		[DebuggerHidden]
		private void SetStateMachine(IAsyncStateMachine stateMachine)
		{
			((AsyncUniTaskMethodBuilder)(ref _003C_003Et__builder)).SetStateMachine(stateMachine);
		}

		void IAsyncStateMachine.SetStateMachine(IAsyncStateMachine stateMachine)
		{
			//ILSpy generated this explicit interface implementation from .override directive in SetStateMachine
			this.SetStateMachine(stateMachine);
		}
	}

	[StructLayout(LayoutKind.Auto)]
	[CompilerGenerated]
	private struct _003CQueryClientVersionAsync_003Ed__10 : IAsyncStateMachine
	{
		public int _003C_003E1__state;

		public AsyncUniTaskMethodBuilder<QueryClientVersionRes> _003C_003Et__builder;

		public CancellationToken ct;

		private Awaiter<QueryClientVersionRes> _003C_003Eu__1;

		private void MoveNext()
		{
			//IL_0068: Unknown result type (might be due to invalid IL or missing references)
			//IL_006d: Unknown result type (might be due to invalid IL or missing references)
			//IL_0075: Unknown result type (might be due to invalid IL or missing references)
			//IL_002d: Unknown result type (might be due to invalid IL or missing references)
			//IL_0032: Unknown result type (might be due to invalid IL or missing references)
			//IL_0036: Unknown result type (might be due to invalid IL or missing references)
			//IL_003b: Unknown result type (might be due to invalid IL or missing references)
			//IL_0050: Unknown result type (might be due to invalid IL or missing references)
			//IL_0052: Unknown result type (might be due to invalid IL or missing references)
			int num = _003C_003E1__state;
			QueryClientVersionRes result;
			try
			{
				Awaiter<QueryClientVersionRes> val;
				if (num != 0)
				{
					string localVersion = HotUpdatePackageReplaceGuard.ResolveStartVersion();
					string envString = PackageEnvService.GetEnvString("OctopusChannelId", "");
					val = QueryClientVersionByUrlAsync(GetVersionServerUrl(), envString, localVersion, ct).GetAwaiter();
					if (!val.IsCompleted)
					{
						num = (_003C_003E1__state = 0);
						_003C_003Eu__1 = val;
						_003C_003Et__builder.AwaitUnsafeOnCompleted<Awaiter<QueryClientVersionRes>, _003CQueryClientVersionAsync_003Ed__10>(ref val, ref this);
						return;
					}
				}
				else
				{
					val = _003C_003Eu__1;
					_003C_003Eu__1 = default(Awaiter<QueryClientVersionRes>);
					num = (_003C_003E1__state = -1);
				}
				result = val.GetResult();
			}
			catch (Exception exception)
			{
				_003C_003E1__state = -2;
				_003C_003Et__builder.SetException(exception);
				return;
			}
			_003C_003E1__state = -2;
			_003C_003Et__builder.SetResult(result);
		}

		void IAsyncStateMachine.MoveNext()
		{
			//ILSpy generated this explicit interface implementation from .override directive in MoveNext
			this.MoveNext();
		}

		[DebuggerHidden]
		private void SetStateMachine(IAsyncStateMachine stateMachine)
		{
			_003C_003Et__builder.SetStateMachine(stateMachine);
		}

		void IAsyncStateMachine.SetStateMachine(IAsyncStateMachine stateMachine)
		{
			//ILSpy generated this explicit interface implementation from .override directive in SetStateMachine
			this.SetStateMachine(stateMachine);
		}
	}

	[StructLayout(LayoutKind.Auto)]
	[CompilerGenerated]
	private struct _003CQueryClientVersionByUrlAsync_003Ed__11 : IAsyncStateMachine
	{
		public int _003C_003E1__state;

		public AsyncUniTaskMethodBuilder<QueryClientVersionRes> _003C_003Et__builder;

		public string baseUrl;

		public string localVersion;

		public string channelKey;

		private string _003Curl_003E5__2;

		private Awaiter<byte[]> _003C_003Eu__1;

		private void MoveNext()
		{
			//IL_00c8: Unknown result type (might be due to invalid IL or missing references)
			//IL_00cd: Unknown result type (might be due to invalid IL or missing references)
			//IL_00d5: Unknown result type (might be due to invalid IL or missing references)
			//IL_008a: Unknown result type (might be due to invalid IL or missing references)
			//IL_008f: Unknown result type (might be due to invalid IL or missing references)
			//IL_0093: Unknown result type (might be due to invalid IL or missing references)
			//IL_0098: Unknown result type (might be due to invalid IL or missing references)
			//IL_00ad: Unknown result type (might be due to invalid IL or missing references)
			//IL_00af: Unknown result type (might be due to invalid IL or missing references)
			int num = _003C_003E1__state;
			QueryClientVersionRes result;
			try
			{
				if (num == 0)
				{
					goto IL_004c;
				}
				string platformName = default(string);
				if (!string.IsNullOrEmpty(baseUrl))
				{
					_003Curl_003E5__2 = baseUrl.TrimEnd('/') + "/client_version";
					platformName = UpdateSetting.GetPlatformName();
					goto IL_004c;
				}
				Log.Error("[VersionServerService] QueryClientVersionByUrlAsync: Version服URL为空");
				result = null;
				goto end_IL_0007;
				IL_004c:
				try
				{
					Awaiter<byte[]> val;
					if (num != 0)
					{
						byte[] array = MessageExtensions.ToByteArray((IMessage)(object)new QueryClientVersionReq
						{
							Platform = platformName,
							LocalVersion = localVersion,
							ChannelKey = channelKey
						});
						val = Http.PostBinary(_003Curl_003E5__2, array, "application/x-protobuf", 15f).GetAwaiter();
						if (!val.IsCompleted)
						{
							num = (_003C_003E1__state = 0);
							_003C_003Eu__1 = val;
							_003C_003Et__builder.AwaitUnsafeOnCompleted<Awaiter<byte[]>, _003CQueryClientVersionByUrlAsync_003Ed__11>(ref val, ref this);
							return;
						}
					}
					else
					{
						val = _003C_003Eu__1;
						_003C_003Eu__1 = default(Awaiter<byte[]>);
						num = (_003C_003E1__state = -1);
					}
					byte[] result2 = val.GetResult();
					if (result2 == null || result2.Length == 0)
					{
						Log.Error("[VersionServerService] QueryClientVersionAsync: 响应为空");
						ProbeVersionServerOnNetworkError();
						result = null;
					}
					else
					{
						QueryClientVersionRes queryClientVersionRes = QueryClientVersionRes.Parser.ParseFrom(result2);
						if (queryClientVersionRes.VersionInfo != null && !string.IsNullOrEmpty(queryClientVersionRes.VersionInfo.Version))
						{
							_ = queryClientVersionRes.VersionInfo.Version;
						}
						result = queryClientVersionRes;
					}
				}
				catch (Exception ex)
				{
					Log.Error("[VersionServerService] QueryClientVersionAsync: 请求异常 url=" + _003Curl_003E5__2 + " - " + ex.Message);
					ProbeVersionServerOnNetworkError();
					result = null;
				}
				end_IL_0007:;
			}
			catch (Exception exception)
			{
				_003C_003E1__state = -2;
				_003Curl_003E5__2 = null;
				_003C_003Et__builder.SetException(exception);
				return;
			}
			_003C_003E1__state = -2;
			_003Curl_003E5__2 = null;
			_003C_003Et__builder.SetResult(result);
		}

		void IAsyncStateMachine.MoveNext()
		{
			//ILSpy generated this explicit interface implementation from .override directive in MoveNext
			this.MoveNext();
		}

		[DebuggerHidden]
		private void SetStateMachine(IAsyncStateMachine stateMachine)
		{
			_003C_003Et__builder.SetStateMachine(stateMachine);
		}

		void IAsyncStateMachine.SetStateMachine(IAsyncStateMachine stateMachine)
		{
			//ILSpy generated this explicit interface implementation from .override directive in SetStateMachine
			this.SetStateMachine(stateMachine);
		}
	}

	[StructLayout(LayoutKind.Auto)]
	[CompilerGenerated]
	private struct _003CQueryGameNoticeAsync_003Ed__27 : IAsyncStateMachine
	{
		public int _003C_003E1__state;

		public AsyncUniTaskMethodBuilder<GameNoticeRes> _003C_003Et__builder;

		private string _003Curl_003E5__2;

		private Awaiter<byte[]> _003C_003Eu__1;

		private void MoveNext()
		{
			//IL_00aa: Unknown result type (might be due to invalid IL or missing references)
			//IL_00af: Unknown result type (might be due to invalid IL or missing references)
			//IL_00b7: Unknown result type (might be due to invalid IL or missing references)
			//IL_006c: Unknown result type (might be due to invalid IL or missing references)
			//IL_0071: Unknown result type (might be due to invalid IL or missing references)
			//IL_0075: Unknown result type (might be due to invalid IL or missing references)
			//IL_007a: Unknown result type (might be due to invalid IL or missing references)
			//IL_008f: Unknown result type (might be due to invalid IL or missing references)
			//IL_0091: Unknown result type (might be due to invalid IL or missing references)
			int num = _003C_003E1__state;
			GameNoticeRes result;
			try
			{
				if (num == 0)
				{
					goto IL_0042;
				}
				string versionServerUrl = GetVersionServerUrl();
				if (!string.IsNullOrEmpty(versionServerUrl))
				{
					_003Curl_003E5__2 = versionServerUrl.TrimEnd('/') + "/game_notice";
					goto IL_0042;
				}
				Log.Error("[VersionServerService] QueryGameNoticeAsync: Version服URL获取失败");
				result = null;
				goto end_IL_0007;
				IL_0042:
				try
				{
					Awaiter<byte[]> val;
					if (num != 0)
					{
						byte[] array = MessageExtensions.ToByteArray((IMessage)(object)new GameNoticeReq
						{
							Lang = GetRequestLang()
						});
						val = Http.PostBinary(_003Curl_003E5__2, array, "application/x-protobuf", 5f).GetAwaiter();
						if (!val.IsCompleted)
						{
							num = (_003C_003E1__state = 0);
							_003C_003Eu__1 = val;
							_003C_003Et__builder.AwaitUnsafeOnCompleted<Awaiter<byte[]>, _003CQueryGameNoticeAsync_003Ed__27>(ref val, ref this);
							return;
						}
					}
					else
					{
						val = _003C_003Eu__1;
						_003C_003Eu__1 = default(Awaiter<byte[]>);
						num = (_003C_003E1__state = -1);
					}
					byte[] result2 = val.GetResult();
					if (result2 == null || result2.Length == 0)
					{
						Log.Error("[VersionServerService] QueryGameNoticeAsync: 响应为空");
						ProbeVersionServerOnNetworkError();
						result = null;
					}
					else
					{
						result = GameNoticeRes.Parser.ParseFrom(result2);
					}
				}
				catch (Exception ex)
				{
					Log.Error("[VersionServerService] QueryGameNoticeAsync: 请求异常 url=" + _003Curl_003E5__2 + " - " + ex.Message);
					ProbeVersionServerOnNetworkError();
					result = null;
				}
				end_IL_0007:;
			}
			catch (Exception exception)
			{
				_003C_003E1__state = -2;
				_003Curl_003E5__2 = null;
				_003C_003Et__builder.SetException(exception);
				return;
			}
			_003C_003E1__state = -2;
			_003Curl_003E5__2 = null;
			_003C_003Et__builder.SetResult(result);
		}

		void IAsyncStateMachine.MoveNext()
		{
			//ILSpy generated this explicit interface implementation from .override directive in MoveNext
			this.MoveNext();
		}

		[DebuggerHidden]
		private void SetStateMachine(IAsyncStateMachine stateMachine)
		{
			_003C_003Et__builder.SetStateMachine(stateMachine);
		}

		void IAsyncStateMachine.SetStateMachine(IAsyncStateMachine stateMachine)
		{
			//ILSpy generated this explicit interface implementation from .override directive in SetStateMachine
			this.SetStateMachine(stateMachine);
		}
	}

	[StructLayout(LayoutKind.Auto)]
	[CompilerGenerated]
	private struct _003CQueryGameNoticeVersionAsync_003Ed__26 : IAsyncStateMachine
	{
		public int _003C_003E1__state;

		public AsyncUniTaskMethodBuilder<QueryGameNoticeVersionRes> _003C_003Et__builder;

		private string _003Curl_003E5__2;

		private Awaiter<byte[]> _003C_003Eu__1;

		private void MoveNext()
		{
			//IL_009f: Unknown result type (might be due to invalid IL or missing references)
			//IL_00a4: Unknown result type (might be due to invalid IL or missing references)
			//IL_00ac: Unknown result type (might be due to invalid IL or missing references)
			//IL_0061: Unknown result type (might be due to invalid IL or missing references)
			//IL_0066: Unknown result type (might be due to invalid IL or missing references)
			//IL_006a: Unknown result type (might be due to invalid IL or missing references)
			//IL_006f: Unknown result type (might be due to invalid IL or missing references)
			//IL_0084: Unknown result type (might be due to invalid IL or missing references)
			//IL_0086: Unknown result type (might be due to invalid IL or missing references)
			int num = _003C_003E1__state;
			QueryGameNoticeVersionRes result;
			try
			{
				if (num == 0)
				{
					goto IL_0042;
				}
				string versionServerUrl = GetVersionServerUrl();
				if (!string.IsNullOrEmpty(versionServerUrl))
				{
					_003Curl_003E5__2 = versionServerUrl.TrimEnd('/') + "/game_notice_version";
					goto IL_0042;
				}
				Log.Error("[VersionServerService] QueryGameNoticeVersionAsync: Version服URL获取失败");
				result = null;
				goto end_IL_0007;
				IL_0042:
				try
				{
					Awaiter<byte[]> val;
					if (num != 0)
					{
						byte[] array = MessageExtensions.ToByteArray((IMessage)(object)new QueryGameNoticeVersionReq());
						val = Http.PostBinary(_003Curl_003E5__2, array, "application/x-protobuf", 5f).GetAwaiter();
						if (!val.IsCompleted)
						{
							num = (_003C_003E1__state = 0);
							_003C_003Eu__1 = val;
							_003C_003Et__builder.AwaitUnsafeOnCompleted<Awaiter<byte[]>, _003CQueryGameNoticeVersionAsync_003Ed__26>(ref val, ref this);
							return;
						}
					}
					else
					{
						val = _003C_003Eu__1;
						_003C_003Eu__1 = default(Awaiter<byte[]>);
						num = (_003C_003E1__state = -1);
					}
					byte[] result2 = val.GetResult();
					if (result2 == null || result2.Length == 0)
					{
						Log.Error("[VersionServerService] QueryGameNoticeVersionAsync: 响应为空");
						ProbeVersionServerOnNetworkError();
						result = null;
					}
					else
					{
						result = QueryGameNoticeVersionRes.Parser.ParseFrom(result2);
					}
				}
				catch (Exception ex)
				{
					Log.Error("[VersionServerService] QueryGameNoticeVersionAsync: 请求异常 url=" + _003Curl_003E5__2 + " - " + ex.Message);
					ProbeVersionServerOnNetworkError();
					result = null;
				}
				end_IL_0007:;
			}
			catch (Exception exception)
			{
				_003C_003E1__state = -2;
				_003Curl_003E5__2 = null;
				_003C_003Et__builder.SetException(exception);
				return;
			}
			_003C_003E1__state = -2;
			_003Curl_003E5__2 = null;
			_003C_003Et__builder.SetResult(result);
		}

		void IAsyncStateMachine.MoveNext()
		{
			//ILSpy generated this explicit interface implementation from .override directive in MoveNext
			this.MoveNext();
		}

		[DebuggerHidden]
		private void SetStateMachine(IAsyncStateMachine stateMachine)
		{
			_003C_003Et__builder.SetStateMachine(stateMachine);
		}

		void IAsyncStateMachine.SetStateMachine(IAsyncStateMachine stateMachine)
		{
			//ILSpy generated this explicit interface implementation from .override directive in SetStateMachine
			this.SetStateMachine(stateMachine);
		}
	}

	[StructLayout(LayoutKind.Auto)]
	[CompilerGenerated]
	private struct _003CQueryPreEnvAsync_003Ed__21 : IAsyncStateMachine
	{
		public int _003C_003E1__state;

		public AsyncUniTaskMethodBuilder<QueryPreEnvRes> _003C_003Et__builder;

		private string _003Curl_003E5__2;

		private Awaiter<byte[]> _003C_003Eu__1;

		private void MoveNext()
		{
			//IL_00d3: Unknown result type (might be due to invalid IL or missing references)
			//IL_00d8: Unknown result type (might be due to invalid IL or missing references)
			//IL_00e0: Unknown result type (might be due to invalid IL or missing references)
			//IL_0095: Unknown result type (might be due to invalid IL or missing references)
			//IL_009a: Unknown result type (might be due to invalid IL or missing references)
			//IL_009e: Unknown result type (might be due to invalid IL or missing references)
			//IL_00a3: Unknown result type (might be due to invalid IL or missing references)
			//IL_00b8: Unknown result type (might be due to invalid IL or missing references)
			//IL_00ba: Unknown result type (might be due to invalid IL or missing references)
			int num = _003C_003E1__state;
			QueryPreEnvRes result;
			try
			{
				if (num == 0)
				{
					goto IL_0065;
				}
				string envString = PackageEnvService.GetEnvString((EnumPackageEnv)0, "VersionURL", "");
				string platformName = default(string);
				string envString2 = default(string);
				if (!string.IsNullOrEmpty(envString))
				{
					_003Curl_003E5__2 = envString.TrimEnd('/') + "/pre_env";
					platformName = UpdateSetting.GetPlatformName();
					envString2 = PackageEnvService.GetEnvString((EnumPackageEnv)0, "OctopusChannelId", "");
					goto IL_0065;
				}
				Log.Error("[VersionServerService] QueryPreEnvAsync: Release VersionURL 为空");
				result = null;
				goto end_IL_0007;
				IL_0065:
				try
				{
					Awaiter<byte[]> val;
					if (num != 0)
					{
						byte[] array = MessageExtensions.ToByteArray((IMessage)(object)new QueryPreEnvReq
						{
							Platform = platformName,
							ChannelKey = envString2
						});
						val = Http.PostBinary(_003Curl_003E5__2, array, "application/x-protobuf", 15f).GetAwaiter();
						if (!val.IsCompleted)
						{
							num = (_003C_003E1__state = 0);
							_003C_003Eu__1 = val;
							_003C_003Et__builder.AwaitUnsafeOnCompleted<Awaiter<byte[]>, _003CQueryPreEnvAsync_003Ed__21>(ref val, ref this);
							return;
						}
					}
					else
					{
						val = _003C_003Eu__1;
						_003C_003Eu__1 = default(Awaiter<byte[]>);
						num = (_003C_003E1__state = -1);
					}
					byte[] result2 = val.GetResult();
					if (result2 == null || result2.Length == 0)
					{
						Log.Error("[VersionServerService] QueryPreEnvAsync: 响应为空");
						ProbeVersionServerOnNetworkError();
						result = null;
					}
					else
					{
						QueryPreEnvRes queryPreEnvRes = QueryPreEnvRes.Parser.ParseFrom(result2);
						result = ((!string.IsNullOrEmpty(queryPreEnvRes.PreVersionUrl)) ? queryPreEnvRes : null);
					}
				}
				catch (Exception ex)
				{
					Log.Error("[VersionServerService] QueryPreEnvAsync: 请求异常 url=" + _003Curl_003E5__2 + " - " + ex.Message);
					ProbeVersionServerOnNetworkError();
					result = null;
				}
				end_IL_0007:;
			}
			catch (Exception exception)
			{
				_003C_003E1__state = -2;
				_003Curl_003E5__2 = null;
				_003C_003Et__builder.SetException(exception);
				return;
			}
			_003C_003E1__state = -2;
			_003Curl_003E5__2 = null;
			_003C_003Et__builder.SetResult(result);
		}

		void IAsyncStateMachine.MoveNext()
		{
			//ILSpy generated this explicit interface implementation from .override directive in MoveNext
			this.MoveNext();
		}

		[DebuggerHidden]
		private void SetStateMachine(IAsyncStateMachine stateMachine)
		{
			_003C_003Et__builder.SetStateMachine(stateMachine);
		}

		void IAsyncStateMachine.SetStateMachine(IAsyncStateMachine stateMachine)
		{
			//ILSpy generated this explicit interface implementation from .override directive in SetStateMachine
			this.SetStateMachine(stateMachine);
		}
	}

	[StructLayout(LayoutKind.Auto)]
	[CompilerGenerated]
	private struct _003CQueryRecommendServersAsync_003Ed__22 : IAsyncStateMachine
	{
		public int _003C_003E1__state;

		public AsyncUniTaskMethodBuilder<QueryRecommendServerListRes> _003C_003Et__builder;

		public string accountId;

		private string _003Curl_003E5__2;

		private Awaiter<byte[]> _003C_003Eu__1;

		private void MoveNext()
		{
			//IL_00c3: Unknown result type (might be due to invalid IL or missing references)
			//IL_00c8: Unknown result type (might be due to invalid IL or missing references)
			//IL_00d0: Unknown result type (might be due to invalid IL or missing references)
			//IL_0085: Unknown result type (might be due to invalid IL or missing references)
			//IL_008a: Unknown result type (might be due to invalid IL or missing references)
			//IL_008e: Unknown result type (might be due to invalid IL or missing references)
			//IL_0093: Unknown result type (might be due to invalid IL or missing references)
			//IL_00a8: Unknown result type (might be due to invalid IL or missing references)
			//IL_00aa: Unknown result type (might be due to invalid IL or missing references)
			int num = _003C_003E1__state;
			QueryRecommendServerListRes result;
			try
			{
				if (num == 0)
				{
					goto IL_003b;
				}
				string versionServerUrl = GetVersionServerUrl();
				if (!string.IsNullOrEmpty(versionServerUrl))
				{
					_003Curl_003E5__2 = versionServerUrl + "/recommend_servers";
					goto IL_003b;
				}
				Log.Error("[VersionServerService] QueryRecommendServersAsync: Version服URL获取失败");
				result = null;
				goto end_IL_0007;
				IL_003b:
				try
				{
					Awaiter<byte[]> val;
					if (num != 0)
					{
						QueryRecommendServerListReq queryRecommendServerListReq = new QueryRecommendServerListReq
						{
							Lang = GetRequestLang()
						};
						if (!string.IsNullOrEmpty(accountId))
						{
							queryRecommendServerListReq.AccountId = accountId;
						}
						byte[] array = MessageExtensions.ToByteArray((IMessage)(object)queryRecommendServerListReq);
						val = Http.PostBinary(_003Curl_003E5__2, array, "application/x-protobuf", 5f).GetAwaiter();
						if (!val.IsCompleted)
						{
							num = (_003C_003E1__state = 0);
							_003C_003Eu__1 = val;
							_003C_003Et__builder.AwaitUnsafeOnCompleted<Awaiter<byte[]>, _003CQueryRecommendServersAsync_003Ed__22>(ref val, ref this);
							return;
						}
					}
					else
					{
						val = _003C_003Eu__1;
						_003C_003Eu__1 = default(Awaiter<byte[]>);
						num = (_003C_003E1__state = -1);
					}
					byte[] result2 = val.GetResult();
					if (result2 == null || result2.Length == 0)
					{
						Log.Error("[VersionServerService] QueryRecommendServersAsync: 响应为空");
						ProbeVersionServerOnNetworkError();
						result = null;
					}
					else
					{
						result = QueryRecommendServerListRes.Parser.ParseFrom(result2);
					}
				}
				catch (Exception ex)
				{
					Log.Error("[VersionServerService] QueryRecommendServersAsync: 请求异常 url=" + _003Curl_003E5__2 + " - " + ex.Message);
					ProbeVersionServerOnNetworkError();
					result = null;
				}
				end_IL_0007:;
			}
			catch (Exception exception)
			{
				_003C_003E1__state = -2;
				_003Curl_003E5__2 = null;
				_003C_003Et__builder.SetException(exception);
				return;
			}
			_003C_003E1__state = -2;
			_003Curl_003E5__2 = null;
			_003C_003Et__builder.SetResult(result);
		}

		void IAsyncStateMachine.MoveNext()
		{
			//ILSpy generated this explicit interface implementation from .override directive in MoveNext
			this.MoveNext();
		}

		[DebuggerHidden]
		private void SetStateMachine(IAsyncStateMachine stateMachine)
		{
			_003C_003Et__builder.SetStateMachine(stateMachine);
		}

		void IAsyncStateMachine.SetStateMachine(IAsyncStateMachine stateMachine)
		{
			//ILSpy generated this explicit interface implementation from .override directive in SetStateMachine
			this.SetStateMachine(stateMachine);
		}
	}

	[StructLayout(LayoutKind.Auto)]
	[CompilerGenerated]
	private struct _003CQueryServerListAsync_003Ed__23 : IAsyncStateMachine
	{
		public int _003C_003E1__state;

		public AsyncUniTaskMethodBuilder<QueryServerListRes> _003C_003Et__builder;

		public string accountId;

		private string _003Curl_003E5__2;

		private Awaiter<byte[]> _003C_003Eu__1;

		private void MoveNext()
		{
			//IL_00c3: Unknown result type (might be due to invalid IL or missing references)
			//IL_00c8: Unknown result type (might be due to invalid IL or missing references)
			//IL_00d0: Unknown result type (might be due to invalid IL or missing references)
			//IL_0085: Unknown result type (might be due to invalid IL or missing references)
			//IL_008a: Unknown result type (might be due to invalid IL or missing references)
			//IL_008e: Unknown result type (might be due to invalid IL or missing references)
			//IL_0093: Unknown result type (might be due to invalid IL or missing references)
			//IL_00a8: Unknown result type (might be due to invalid IL or missing references)
			//IL_00aa: Unknown result type (might be due to invalid IL or missing references)
			int num = _003C_003E1__state;
			QueryServerListRes result;
			try
			{
				if (num == 0)
				{
					goto IL_003b;
				}
				string versionServerUrl = GetVersionServerUrl();
				if (!string.IsNullOrEmpty(versionServerUrl))
				{
					_003Curl_003E5__2 = versionServerUrl + "/server_list";
					goto IL_003b;
				}
				Log.Error("[VersionServerService] QueryServerListAsync: Version服URL获取失败");
				result = null;
				goto end_IL_0007;
				IL_003b:
				try
				{
					Awaiter<byte[]> val;
					if (num != 0)
					{
						QueryServerListReq queryServerListReq = new QueryServerListReq
						{
							Lang = GetRequestLang()
						};
						if (!string.IsNullOrEmpty(accountId))
						{
							queryServerListReq.AccountId = accountId;
						}
						byte[] array = MessageExtensions.ToByteArray((IMessage)(object)queryServerListReq);
						val = Http.PostBinary(_003Curl_003E5__2, array, "application/x-protobuf", 5f).GetAwaiter();
						if (!val.IsCompleted)
						{
							num = (_003C_003E1__state = 0);
							_003C_003Eu__1 = val;
							_003C_003Et__builder.AwaitUnsafeOnCompleted<Awaiter<byte[]>, _003CQueryServerListAsync_003Ed__23>(ref val, ref this);
							return;
						}
					}
					else
					{
						val = _003C_003Eu__1;
						_003C_003Eu__1 = default(Awaiter<byte[]>);
						num = (_003C_003E1__state = -1);
					}
					byte[] result2 = val.GetResult();
					if (result2 == null || result2.Length == 0)
					{
						Log.Error("[VersionServerService] QueryServerListAsync: 响应为空");
						ProbeVersionServerOnNetworkError();
						result = null;
					}
					else
					{
						QueryRecommendServerListRes queryRecommendServerListRes = QueryRecommendServerListRes.Parser.ParseFrom(result2);
						QueryServerListRes queryServerListRes = new QueryServerListRes();
						IEnumerator<Proto.ServerInfo> enumerator = queryRecommendServerListRes.Servers.GetEnumerator();
						try
						{
							while (enumerator.MoveNext())
							{
								Proto.ServerInfo current = enumerator.Current;
								queryServerListRes.Servers.Add(current);
							}
						}
						finally
						{
							if (num < 0)
							{
								enumerator?.Dispose();
							}
						}
						IEnumerator<AccountHistoryInfo> enumerator2 = queryRecommendServerListRes.HistoryAccounts.GetEnumerator();
						try
						{
							while (enumerator2.MoveNext())
							{
								AccountHistoryInfo current2 = enumerator2.Current;
								queryServerListRes.HistoryAccounts.Add(current2);
							}
						}
						finally
						{
							if (num < 0)
							{
								enumerator2?.Dispose();
							}
						}
						result = queryServerListRes;
					}
				}
				catch (Exception ex)
				{
					Log.Error("[VersionServerService] QueryServerListAsync: 请求异常 url=" + _003Curl_003E5__2 + " - " + ex.Message);
					ProbeVersionServerOnNetworkError();
					result = null;
				}
				end_IL_0007:;
			}
			catch (Exception exception)
			{
				_003C_003E1__state = -2;
				_003Curl_003E5__2 = null;
				_003C_003Et__builder.SetException(exception);
				return;
			}
			_003C_003E1__state = -2;
			_003Curl_003E5__2 = null;
			_003C_003Et__builder.SetResult(result);
		}

		void IAsyncStateMachine.MoveNext()
		{
			//ILSpy generated this explicit interface implementation from .override directive in MoveNext
			this.MoveNext();
		}

		[DebuggerHidden]
		private void SetStateMachine(IAsyncStateMachine stateMachine)
		{
			_003C_003Et__builder.SetStateMachine(stateMachine);
		}

		void IAsyncStateMachine.SetStateMachine(IAsyncStateMachine stateMachine)
		{
			//ILSpy generated this explicit interface implementation from .override directive in SetStateMachine
			this.SetStateMachine(stateMachine);
		}
	}

	[StructLayout(LayoutKind.Auto)]
	[CompilerGenerated]
	private struct _003CQueryServerMaintenNoticeAsync_003Ed__25 : IAsyncStateMachine
	{
		public int _003C_003E1__state;

		public AsyncUniTaskMethodBuilder<QueryServerMaintenNoticeRes> _003C_003Et__builder;

		private string _003Curl_003E5__2;

		private Awaiter<byte[]> _003C_003Eu__1;

		private void MoveNext()
		{
			//IL_00aa: Unknown result type (might be due to invalid IL or missing references)
			//IL_00af: Unknown result type (might be due to invalid IL or missing references)
			//IL_00b7: Unknown result type (might be due to invalid IL or missing references)
			//IL_006c: Unknown result type (might be due to invalid IL or missing references)
			//IL_0071: Unknown result type (might be due to invalid IL or missing references)
			//IL_0075: Unknown result type (might be due to invalid IL or missing references)
			//IL_007a: Unknown result type (might be due to invalid IL or missing references)
			//IL_008f: Unknown result type (might be due to invalid IL or missing references)
			//IL_0091: Unknown result type (might be due to invalid IL or missing references)
			int num = _003C_003E1__state;
			QueryServerMaintenNoticeRes result;
			try
			{
				if (num == 0)
				{
					goto IL_0042;
				}
				string versionServerUrl = GetVersionServerUrl();
				if (!string.IsNullOrEmpty(versionServerUrl))
				{
					_003Curl_003E5__2 = versionServerUrl.TrimEnd('/') + "/server_mainten_notice";
					goto IL_0042;
				}
				Log.Error("[VersionServerService] QueryServerMaintenNoticeAsync: Version服URL获取失败");
				result = null;
				goto end_IL_0007;
				IL_0042:
				try
				{
					Awaiter<byte[]> val;
					if (num != 0)
					{
						byte[] array = MessageExtensions.ToByteArray((IMessage)(object)new QueryServerMaintenNoticeReq
						{
							Lang = GetRequestLang()
						});
						val = Http.PostBinary(_003Curl_003E5__2, array, "application/x-protobuf", 5f).GetAwaiter();
						if (!val.IsCompleted)
						{
							num = (_003C_003E1__state = 0);
							_003C_003Eu__1 = val;
							_003C_003Et__builder.AwaitUnsafeOnCompleted<Awaiter<byte[]>, _003CQueryServerMaintenNoticeAsync_003Ed__25>(ref val, ref this);
							return;
						}
					}
					else
					{
						val = _003C_003Eu__1;
						_003C_003Eu__1 = default(Awaiter<byte[]>);
						num = (_003C_003E1__state = -1);
					}
					byte[] result2 = val.GetResult();
					if (result2 == null || result2.Length == 0)
					{
						Log.Error("[VersionServerService] QueryServerMaintenNoticeAsync: 响应为空");
						ProbeVersionServerOnNetworkError();
						result = null;
					}
					else
					{
						QueryServerMaintenNoticeRes queryServerMaintenNoticeRes = QueryServerMaintenNoticeRes.Parser.ParseFrom(result2);
						_ = queryServerMaintenNoticeRes.Notice?.Title;
						result = queryServerMaintenNoticeRes;
					}
				}
				catch (Exception ex)
				{
					Log.Error("[VersionServerService] QueryServerMaintenNoticeAsync: 请求异常 url=" + _003Curl_003E5__2 + " - " + ex.Message);
					ProbeVersionServerOnNetworkError();
					result = null;
				}
				end_IL_0007:;
			}
			catch (Exception exception)
			{
				_003C_003E1__state = -2;
				_003Curl_003E5__2 = null;
				_003C_003Et__builder.SetException(exception);
				return;
			}
			_003C_003E1__state = -2;
			_003Curl_003E5__2 = null;
			_003C_003Et__builder.SetResult(result);
		}

		void IAsyncStateMachine.MoveNext()
		{
			//ILSpy generated this explicit interface implementation from .override directive in MoveNext
			this.MoveNext();
		}

		[DebuggerHidden]
		private void SetStateMachine(IAsyncStateMachine stateMachine)
		{
			_003C_003Et__builder.SetStateMachine(stateMachine);
		}

		void IAsyncStateMachine.SetStateMachine(IAsyncStateMachine stateMachine)
		{
			//ILSpy generated this explicit interface implementation from .override directive in SetStateMachine
			this.SetStateMachine(stateMachine);
		}
	}

	[StructLayout(LayoutKind.Auto)]
	[CompilerGenerated]
	private struct _003CQueryServerStatusAsync_003Ed__24 : IAsyncStateMachine
	{
		public int _003C_003E1__state;

		public AsyncUniTaskMethodBuilder<QueryServerInfoRes> _003C_003Et__builder;

		public long serverId;

		public string accountId;

		private string _003Curl_003E5__2;

		private Awaiter<byte[]> _003C_003Eu__1;

		private void MoveNext()
		{
			//IL_00cf: Unknown result type (might be due to invalid IL or missing references)
			//IL_00d4: Unknown result type (might be due to invalid IL or missing references)
			//IL_00dc: Unknown result type (might be due to invalid IL or missing references)
			//IL_0091: Unknown result type (might be due to invalid IL or missing references)
			//IL_0096: Unknown result type (might be due to invalid IL or missing references)
			//IL_009a: Unknown result type (might be due to invalid IL or missing references)
			//IL_009f: Unknown result type (might be due to invalid IL or missing references)
			//IL_00b4: Unknown result type (might be due to invalid IL or missing references)
			//IL_00b6: Unknown result type (might be due to invalid IL or missing references)
			int num = _003C_003E1__state;
			QueryServerInfoRes result;
			try
			{
				if (num == 0)
				{
					goto IL_003b;
				}
				string versionServerUrl = GetVersionServerUrl();
				if (!string.IsNullOrEmpty(versionServerUrl))
				{
					_003Curl_003E5__2 = versionServerUrl + "/server_status";
					goto IL_003b;
				}
				Log.Error("[VersionServerService] QueryServerStatusAsync: Version服URL获取失败");
				result = null;
				goto end_IL_0007;
				IL_003b:
				try
				{
					Awaiter<byte[]> val;
					if (num != 0)
					{
						QueryServerInfoReq queryServerInfoReq = new QueryServerInfoReq
						{
							ServerId = serverId,
							Lang = GetRequestLang()
						};
						if (!string.IsNullOrEmpty(accountId))
						{
							queryServerInfoReq.AccountId = accountId;
						}
						byte[] array = MessageExtensions.ToByteArray((IMessage)(object)queryServerInfoReq);
						val = Http.PostBinary(_003Curl_003E5__2, array, "application/x-protobuf", 5f).GetAwaiter();
						if (!val.IsCompleted)
						{
							num = (_003C_003E1__state = 0);
							_003C_003Eu__1 = val;
							_003C_003Et__builder.AwaitUnsafeOnCompleted<Awaiter<byte[]>, _003CQueryServerStatusAsync_003Ed__24>(ref val, ref this);
							return;
						}
					}
					else
					{
						val = _003C_003Eu__1;
						_003C_003Eu__1 = default(Awaiter<byte[]>);
						num = (_003C_003E1__state = -1);
					}
					byte[] result2 = val.GetResult();
					if (result2 == null || result2.Length == 0)
					{
						Log.Error("[VersionServerService] QueryServerStatusAsync: 响应为空");
						ProbeVersionServerOnNetworkError();
						result = null;
					}
					else
					{
						QueryServerInfoRes queryServerInfoRes = QueryServerInfoRes.Parser.ParseFrom(result2);
						if (queryServerInfoRes.Server != null)
						{
							_ = queryServerInfoRes.Server.ServerName;
						}
						if (queryServerInfoRes.HistoryAccount != null)
						{
							_ = $"historyAccount.playerId={queryServerInfoRes.HistoryAccount.PlayerId}";
						}
						result = queryServerInfoRes;
					}
				}
				catch (Exception ex)
				{
					Log.Error("[VersionServerService] QueryServerStatusAsync: 请求异常 url=" + _003Curl_003E5__2 + " - " + ex.Message);
					ProbeVersionServerOnNetworkError();
					result = null;
				}
				end_IL_0007:;
			}
			catch (Exception exception)
			{
				_003C_003E1__state = -2;
				_003Curl_003E5__2 = null;
				_003C_003Et__builder.SetException(exception);
				return;
			}
			_003C_003E1__state = -2;
			_003Curl_003E5__2 = null;
			_003C_003Et__builder.SetResult(result);
		}

		void IAsyncStateMachine.MoveNext()
		{
			//ILSpy generated this explicit interface implementation from .override directive in MoveNext
			this.MoveNext();
		}

		[DebuggerHidden]
		private void SetStateMachine(IAsyncStateMachine stateMachine)
		{
			_003C_003Et__builder.SetStateMachine(stateMachine);
		}

		void IAsyncStateMachine.SetStateMachine(IAsyncStateMachine stateMachine)
		{
			//ILSpy generated this explicit interface implementation from .override directive in SetStateMachine
			this.SetStateMachine(stateMachine);
		}
	}

	[StructLayout(LayoutKind.Auto)]
	[CompilerGenerated]
	private struct _003CVerifyGmPasswordAsync_003Ed__28 : IAsyncStateMachine
	{
		public int _003C_003E1__state;

		public AsyncUniTaskMethodBuilder<VerifyGmPasswordResult> _003C_003Et__builder;

		public string password;

		private string _003Curl_003E5__2;

		private Awaiter<byte[]> _003C_003Eu__1;

		private void MoveNext()
		{
			//IL_00b8: Unknown result type (might be due to invalid IL or missing references)
			//IL_00bd: Unknown result type (might be due to invalid IL or missing references)
			//IL_00c5: Unknown result type (might be due to invalid IL or missing references)
			//IL_007a: Unknown result type (might be due to invalid IL or missing references)
			//IL_007f: Unknown result type (might be due to invalid IL or missing references)
			//IL_0083: Unknown result type (might be due to invalid IL or missing references)
			//IL_0088: Unknown result type (might be due to invalid IL or missing references)
			//IL_009d: Unknown result type (might be due to invalid IL or missing references)
			//IL_009f: Unknown result type (might be due to invalid IL or missing references)
			int num = _003C_003E1__state;
			VerifyGmPasswordResult result;
			try
			{
				if (num == 0)
				{
					goto IL_0046;
				}
				string versionServerUrl = GetVersionServerUrl();
				if (!string.IsNullOrEmpty(versionServerUrl))
				{
					_003Curl_003E5__2 = versionServerUrl.TrimEnd('/') + "/verify_gm_password";
					goto IL_0046;
				}
				Log.Error("[VersionServerService] VerifyGmPasswordAsync: Version服URL获取失败");
				result = VerifyGmPasswordResult.FailNetwork();
				goto end_IL_0007;
				IL_0046:
				try
				{
					Awaiter<byte[]> val;
					if (num != 0)
					{
						byte[] array = MessageExtensions.ToByteArray((IMessage)(object)new VerifyGmPasswordReq
						{
							Password = (password ?? string.Empty)
						});
						val = Http.PostBinary(_003Curl_003E5__2, array, "application/x-protobuf", 5f).GetAwaiter();
						if (!val.IsCompleted)
						{
							num = (_003C_003E1__state = 0);
							_003C_003Eu__1 = val;
							_003C_003Et__builder.AwaitUnsafeOnCompleted<Awaiter<byte[]>, _003CVerifyGmPasswordAsync_003Ed__28>(ref val, ref this);
							return;
						}
					}
					else
					{
						val = _003C_003Eu__1;
						_003C_003Eu__1 = default(Awaiter<byte[]>);
						num = (_003C_003E1__state = -1);
					}
					byte[] result2 = val.GetResult();
					if (result2 == null)
					{
						Log.Error("[VersionServerService] VerifyGmPasswordAsync: 请求超时或被取消");
						ProbeVersionServerOnNetworkError();
						result = VerifyGmPasswordResult.FailNetwork();
					}
					else if (result2.Length == 0)
					{
						result = VerifyGmPasswordResult.Ok();
					}
					else
					{
						HttpResPacket httpResPacket = HttpResPacket.Parser.ParseFrom(result2);
						if (!string.IsNullOrEmpty(httpResPacket.Status) && httpResPacket.Status != "0")
						{
							int.TryParse(httpResPacket.Status, out var result3);
							result = VerifyGmPasswordResult.Fail(result3);
						}
						else
						{
							result = VerifyGmPasswordResult.Ok();
						}
					}
				}
				catch (Exception ex)
				{
					Log.Error("[VersionServerService] VerifyGmPasswordAsync: 请求异常 url=" + _003Curl_003E5__2 + " - " + ex.Message);
					ProbeVersionServerOnNetworkError();
					result = VerifyGmPasswordResult.FailNetwork();
				}
				end_IL_0007:;
			}
			catch (Exception exception)
			{
				_003C_003E1__state = -2;
				_003Curl_003E5__2 = null;
				_003C_003Et__builder.SetException(exception);
				return;
			}
			_003C_003E1__state = -2;
			_003Curl_003E5__2 = null;
			_003C_003Et__builder.SetResult(result);
		}

		void IAsyncStateMachine.MoveNext()
		{
			//ILSpy generated this explicit interface implementation from .override directive in MoveNext
			this.MoveNext();
		}

		[DebuggerHidden]
		private void SetStateMachine(IAsyncStateMachine stateMachine)
		{
			_003C_003Et__builder.SetStateMachine(stateMachine);
		}

		void IAsyncStateMachine.SetStateMachine(IAsyncStateMachine stateMachine)
		{
			//ILSpy generated this explicit interface implementation from .override directive in SetStateMachine
			this.SetStateMachine(stateMachine);
		}
	}

	private static readonly Dictionary<string, string> ClientStringParams = new Dictionary<string, string>();

	private static readonly Dictionary<string, ulong> ClientIntParams = new Dictionary<string, ulong>();

	private static readonly Dictionary<string, bool> ClientBoolParams = new Dictionary<string, bool>();

	public static bool HasClientParams { get; private set; }

	private static string GetRequestLang()
	{
		return GameApp.GetGameLanguage();
	}

	private static string GetVersionServerUrl()
	{
		string text = ServerEnv.ResolveLocalVersionUrl();
		if (string.IsNullOrEmpty(text))
		{
			Log.Error("[VersionServerService] GetVersionServerUrl: PackageEnv VersionURL 为空");
			return null;
		}
		return text;
	}

	private static void ProbeVersionServerOnNetworkError()
	{
		string versionServerUrl = GetVersionServerUrl();
		if (!string.IsNullOrEmpty(versionServerUrl))
		{
			BaseWebSocket.TryProbeNetworkQuality(versionServerUrl);
		}
	}

	[AsyncStateMachine(typeof(_003CQueryClientVersionAsync_003Ed__10))]
	public static UniTask<QueryClientVersionRes> QueryClientVersionAsync(CancellationToken ct = default(CancellationToken))
	{
		//IL_0002: Unknown result type (might be due to invalid IL or missing references)
		//IL_0007: Unknown result type (might be due to invalid IL or missing references)
		//IL_0031: Unknown result type (might be due to invalid IL or missing references)
		_003CQueryClientVersionAsync_003Ed__10 _003CQueryClientVersionAsync_003Ed__ = default(_003CQueryClientVersionAsync_003Ed__10);
		_003CQueryClientVersionAsync_003Ed__._003C_003Et__builder = AsyncUniTaskMethodBuilder<QueryClientVersionRes>.Create();
		_003CQueryClientVersionAsync_003Ed__.ct = ct;
		_003CQueryClientVersionAsync_003Ed__._003C_003E1__state = -1;
		_003CQueryClientVersionAsync_003Ed__._003C_003Et__builder.Start<_003CQueryClientVersionAsync_003Ed__10>(ref _003CQueryClientVersionAsync_003Ed__);
		return _003CQueryClientVersionAsync_003Ed__._003C_003Et__builder.Task;
	}

	[AsyncStateMachine(typeof(_003CQueryClientVersionByUrlAsync_003Ed__11))]
	public static UniTask<QueryClientVersionRes> QueryClientVersionByUrlAsync(string baseUrl, string channelKey, string localVersion, CancellationToken ct = default(CancellationToken))
	{
		//IL_0002: Unknown result type (might be due to invalid IL or missing references)
		//IL_0007: Unknown result type (might be due to invalid IL or missing references)
		//IL_0041: Unknown result type (might be due to invalid IL or missing references)
		_003CQueryClientVersionByUrlAsync_003Ed__11 _003CQueryClientVersionByUrlAsync_003Ed__ = default(_003CQueryClientVersionByUrlAsync_003Ed__11);
		_003CQueryClientVersionByUrlAsync_003Ed__._003C_003Et__builder = AsyncUniTaskMethodBuilder<QueryClientVersionRes>.Create();
		_003CQueryClientVersionByUrlAsync_003Ed__.baseUrl = baseUrl;
		_003CQueryClientVersionByUrlAsync_003Ed__.channelKey = channelKey;
		_003CQueryClientVersionByUrlAsync_003Ed__.localVersion = localVersion;
		_003CQueryClientVersionByUrlAsync_003Ed__._003C_003E1__state = -1;
		_003CQueryClientVersionByUrlAsync_003Ed__._003C_003Et__builder.Start<_003CQueryClientVersionByUrlAsync_003Ed__11>(ref _003CQueryClientVersionByUrlAsync_003Ed__);
		return _003CQueryClientVersionByUrlAsync_003Ed__._003C_003Et__builder.Task;
	}

	[AsyncStateMachine(typeof(_003CFetchClientParamsAsync_003Ed__12))]
	public static UniTask FetchClientParamsAsync()
	{
		//IL_0002: Unknown result type (might be due to invalid IL or missing references)
		//IL_0007: Unknown result type (might be due to invalid IL or missing references)
		//IL_0029: Unknown result type (might be due to invalid IL or missing references)
		_003CFetchClientParamsAsync_003Ed__12 _003CFetchClientParamsAsync_003Ed__ = default(_003CFetchClientParamsAsync_003Ed__12);
		_003CFetchClientParamsAsync_003Ed__._003C_003Et__builder = AsyncUniTaskMethodBuilder.Create();
		_003CFetchClientParamsAsync_003Ed__._003C_003E1__state = -1;
		((AsyncUniTaskMethodBuilder)(ref _003CFetchClientParamsAsync_003Ed__._003C_003Et__builder)).Start<_003CFetchClientParamsAsync_003Ed__12>(ref _003CFetchClientParamsAsync_003Ed__);
		return ((AsyncUniTaskMethodBuilder)(ref _003CFetchClientParamsAsync_003Ed__._003C_003Et__builder)).Task;
	}

	public static bool TryGetStringParam(string key, out string value)
	{
		if (string.IsNullOrEmpty(key))
		{
			value = null;
			return false;
		}
		return ClientStringParams.TryGetValue(key, out value);
	}

	public static string GetStringParam(string key, string defaultValue = "")
	{
		if (TryGetStringParam(key, out var value))
		{
			return value;
		}
		return defaultValue;
	}

	public static bool TryGetIntParam(string key, out ulong value)
	{
		if (string.IsNullOrEmpty(key))
		{
			value = 0uL;
			return false;
		}
		return ClientIntParams.TryGetValue(key, out value);
	}

	public static ulong GetIntParam(string key, ulong defaultValue = 0uL)
	{
		if (TryGetIntParam(key, out var value))
		{
			return value;
		}
		return defaultValue;
	}

	public static bool TryGetBoolParam(string key, out bool value)
	{
		if (string.IsNullOrEmpty(key))
		{
			value = false;
			return false;
		}
		return ClientBoolParams.TryGetValue(key, out value);
	}

	public static bool GetBoolParam(string key, bool defaultValue = false)
	{
		if (TryGetBoolParam(key, out var value))
		{
			return value;
		}
		return defaultValue;
	}

	private static void ClearClientParams()
	{
		ClientStringParams.Clear();
		ClientIntParams.Clear();
		ClientBoolParams.Clear();
		HasClientParams = false;
	}

	private static void SaveClientParams(ClientParams source)
	{
		ClearClientParams();
		for (int i = 0; i < source.StringParams.Count; i++)
		{
			ClientStringParams clientStringParams = source.StringParams[i];
			if (clientStringParams != null && !string.IsNullOrEmpty(clientStringParams.Key))
			{
				ClientStringParams[clientStringParams.Key] = clientStringParams.Value;
			}
		}
		for (int j = 0; j < source.IntParams.Count; j++)
		{
			ClientIntParams clientIntParams = source.IntParams[j];
			if (clientIntParams != null && !string.IsNullOrEmpty(clientIntParams.Key))
			{
				ClientIntParams[clientIntParams.Key] = clientIntParams.Value;
			}
		}
		for (int k = 0; k < source.BoolParams.Count; k++)
		{
			ClientBoolParams clientBoolParams = source.BoolParams[k];
			if (clientBoolParams != null && !string.IsNullOrEmpty(clientBoolParams.Key))
			{
				ClientBoolParams[clientBoolParams.Key] = clientBoolParams.Value;
			}
		}
		HasClientParams = true;
	}

	[AsyncStateMachine(typeof(_003CQueryPreEnvAsync_003Ed__21))]
	public static UniTask<QueryPreEnvRes> QueryPreEnvAsync(CancellationToken ct = default(CancellationToken))
	{
		//IL_0002: Unknown result type (might be due to invalid IL or missing references)
		//IL_0007: Unknown result type (might be due to invalid IL or missing references)
		//IL_0029: Unknown result type (might be due to invalid IL or missing references)
		_003CQueryPreEnvAsync_003Ed__21 _003CQueryPreEnvAsync_003Ed__ = default(_003CQueryPreEnvAsync_003Ed__21);
		_003CQueryPreEnvAsync_003Ed__._003C_003Et__builder = AsyncUniTaskMethodBuilder<QueryPreEnvRes>.Create();
		_003CQueryPreEnvAsync_003Ed__._003C_003E1__state = -1;
		_003CQueryPreEnvAsync_003Ed__._003C_003Et__builder.Start<_003CQueryPreEnvAsync_003Ed__21>(ref _003CQueryPreEnvAsync_003Ed__);
		return _003CQueryPreEnvAsync_003Ed__._003C_003Et__builder.Task;
	}

	[AsyncStateMachine(typeof(_003CQueryRecommendServersAsync_003Ed__22))]
	public static UniTask<QueryRecommendServerListRes> QueryRecommendServersAsync(string accountId = null, CancellationToken ct = default(CancellationToken))
	{
		//IL_0002: Unknown result type (might be due to invalid IL or missing references)
		//IL_0007: Unknown result type (might be due to invalid IL or missing references)
		//IL_0031: Unknown result type (might be due to invalid IL or missing references)
		_003CQueryRecommendServersAsync_003Ed__22 _003CQueryRecommendServersAsync_003Ed__ = default(_003CQueryRecommendServersAsync_003Ed__22);
		_003CQueryRecommendServersAsync_003Ed__._003C_003Et__builder = AsyncUniTaskMethodBuilder<QueryRecommendServerListRes>.Create();
		_003CQueryRecommendServersAsync_003Ed__.accountId = accountId;
		_003CQueryRecommendServersAsync_003Ed__._003C_003E1__state = -1;
		_003CQueryRecommendServersAsync_003Ed__._003C_003Et__builder.Start<_003CQueryRecommendServersAsync_003Ed__22>(ref _003CQueryRecommendServersAsync_003Ed__);
		return _003CQueryRecommendServersAsync_003Ed__._003C_003Et__builder.Task;
	}

	[AsyncStateMachine(typeof(_003CQueryServerListAsync_003Ed__23))]
	public static UniTask<QueryServerListRes> QueryServerListAsync(string accountId = null, CancellationToken ct = default(CancellationToken))
	{
		//IL_0002: Unknown result type (might be due to invalid IL or missing references)
		//IL_0007: Unknown result type (might be due to invalid IL or missing references)
		//IL_0031: Unknown result type (might be due to invalid IL or missing references)
		_003CQueryServerListAsync_003Ed__23 _003CQueryServerListAsync_003Ed__ = default(_003CQueryServerListAsync_003Ed__23);
		_003CQueryServerListAsync_003Ed__._003C_003Et__builder = AsyncUniTaskMethodBuilder<QueryServerListRes>.Create();
		_003CQueryServerListAsync_003Ed__.accountId = accountId;
		_003CQueryServerListAsync_003Ed__._003C_003E1__state = -1;
		_003CQueryServerListAsync_003Ed__._003C_003Et__builder.Start<_003CQueryServerListAsync_003Ed__23>(ref _003CQueryServerListAsync_003Ed__);
		return _003CQueryServerListAsync_003Ed__._003C_003Et__builder.Task;
	}

	[AsyncStateMachine(typeof(_003CQueryServerStatusAsync_003Ed__24))]
	public static UniTask<QueryServerInfoRes> QueryServerStatusAsync(long serverId, string accountId = null, CancellationToken ct = default(CancellationToken))
	{
		//IL_0002: Unknown result type (might be due to invalid IL or missing references)
		//IL_0007: Unknown result type (might be due to invalid IL or missing references)
		//IL_0039: Unknown result type (might be due to invalid IL or missing references)
		_003CQueryServerStatusAsync_003Ed__24 _003CQueryServerStatusAsync_003Ed__ = default(_003CQueryServerStatusAsync_003Ed__24);
		_003CQueryServerStatusAsync_003Ed__._003C_003Et__builder = AsyncUniTaskMethodBuilder<QueryServerInfoRes>.Create();
		_003CQueryServerStatusAsync_003Ed__.serverId = serverId;
		_003CQueryServerStatusAsync_003Ed__.accountId = accountId;
		_003CQueryServerStatusAsync_003Ed__._003C_003E1__state = -1;
		_003CQueryServerStatusAsync_003Ed__._003C_003Et__builder.Start<_003CQueryServerStatusAsync_003Ed__24>(ref _003CQueryServerStatusAsync_003Ed__);
		return _003CQueryServerStatusAsync_003Ed__._003C_003Et__builder.Task;
	}

	[AsyncStateMachine(typeof(_003CQueryServerMaintenNoticeAsync_003Ed__25))]
	public static UniTask<QueryServerMaintenNoticeRes> QueryServerMaintenNoticeAsync(CancellationToken ct = default(CancellationToken))
	{
		//IL_0002: Unknown result type (might be due to invalid IL or missing references)
		//IL_0007: Unknown result type (might be due to invalid IL or missing references)
		//IL_0029: Unknown result type (might be due to invalid IL or missing references)
		_003CQueryServerMaintenNoticeAsync_003Ed__25 _003CQueryServerMaintenNoticeAsync_003Ed__ = default(_003CQueryServerMaintenNoticeAsync_003Ed__25);
		_003CQueryServerMaintenNoticeAsync_003Ed__._003C_003Et__builder = AsyncUniTaskMethodBuilder<QueryServerMaintenNoticeRes>.Create();
		_003CQueryServerMaintenNoticeAsync_003Ed__._003C_003E1__state = -1;
		_003CQueryServerMaintenNoticeAsync_003Ed__._003C_003Et__builder.Start<_003CQueryServerMaintenNoticeAsync_003Ed__25>(ref _003CQueryServerMaintenNoticeAsync_003Ed__);
		return _003CQueryServerMaintenNoticeAsync_003Ed__._003C_003Et__builder.Task;
	}

	[AsyncStateMachine(typeof(_003CQueryGameNoticeVersionAsync_003Ed__26))]
	public static UniTask<QueryGameNoticeVersionRes> QueryGameNoticeVersionAsync(CancellationToken ct = default(CancellationToken))
	{
		//IL_0002: Unknown result type (might be due to invalid IL or missing references)
		//IL_0007: Unknown result type (might be due to invalid IL or missing references)
		//IL_0029: Unknown result type (might be due to invalid IL or missing references)
		_003CQueryGameNoticeVersionAsync_003Ed__26 _003CQueryGameNoticeVersionAsync_003Ed__ = default(_003CQueryGameNoticeVersionAsync_003Ed__26);
		_003CQueryGameNoticeVersionAsync_003Ed__._003C_003Et__builder = AsyncUniTaskMethodBuilder<QueryGameNoticeVersionRes>.Create();
		_003CQueryGameNoticeVersionAsync_003Ed__._003C_003E1__state = -1;
		_003CQueryGameNoticeVersionAsync_003Ed__._003C_003Et__builder.Start<_003CQueryGameNoticeVersionAsync_003Ed__26>(ref _003CQueryGameNoticeVersionAsync_003Ed__);
		return _003CQueryGameNoticeVersionAsync_003Ed__._003C_003Et__builder.Task;
	}

	[AsyncStateMachine(typeof(_003CQueryGameNoticeAsync_003Ed__27))]
	public static UniTask<GameNoticeRes> QueryGameNoticeAsync(CancellationToken ct = default(CancellationToken))
	{
		//IL_0002: Unknown result type (might be due to invalid IL or missing references)
		//IL_0007: Unknown result type (might be due to invalid IL or missing references)
		//IL_0029: Unknown result type (might be due to invalid IL or missing references)
		_003CQueryGameNoticeAsync_003Ed__27 _003CQueryGameNoticeAsync_003Ed__ = default(_003CQueryGameNoticeAsync_003Ed__27);
		_003CQueryGameNoticeAsync_003Ed__._003C_003Et__builder = AsyncUniTaskMethodBuilder<GameNoticeRes>.Create();
		_003CQueryGameNoticeAsync_003Ed__._003C_003E1__state = -1;
		_003CQueryGameNoticeAsync_003Ed__._003C_003Et__builder.Start<_003CQueryGameNoticeAsync_003Ed__27>(ref _003CQueryGameNoticeAsync_003Ed__);
		return _003CQueryGameNoticeAsync_003Ed__._003C_003Et__builder.Task;
	}

	[AsyncStateMachine(typeof(_003CVerifyGmPasswordAsync_003Ed__28))]
	public static UniTask<VerifyGmPasswordResult> VerifyGmPasswordAsync(string password, CancellationToken ct = default(CancellationToken))
	{
		//IL_0002: Unknown result type (might be due to invalid IL or missing references)
		//IL_0007: Unknown result type (might be due to invalid IL or missing references)
		//IL_0031: Unknown result type (might be due to invalid IL or missing references)
		_003CVerifyGmPasswordAsync_003Ed__28 _003CVerifyGmPasswordAsync_003Ed__ = default(_003CVerifyGmPasswordAsync_003Ed__28);
		_003CVerifyGmPasswordAsync_003Ed__._003C_003Et__builder = AsyncUniTaskMethodBuilder<VerifyGmPasswordResult>.Create();
		_003CVerifyGmPasswordAsync_003Ed__.password = password;
		_003CVerifyGmPasswordAsync_003Ed__._003C_003E1__state = -1;
		_003CVerifyGmPasswordAsync_003Ed__._003C_003Et__builder.Start<_003CVerifyGmPasswordAsync_003Ed__28>(ref _003CVerifyGmPasswordAsync_003Ed__);
		return _003CVerifyGmPasswordAsync_003Ed__._003C_003Et__builder.Task;
	}
}
