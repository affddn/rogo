using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Cysharp.Threading.Tasks;
using Launcher;
using Newtonsoft.Json;
using OctopusSDK;
using OctopusSDK.Analytics;
using OctopusSDK.Log;
using OctopusSDK.bean;
using TEngine;
using UG;
using UnityEngine;

namespace GameLogic;

public class UGSdkImp : ISdk
{
	private enum AdLoadStatus
	{
		None,
		Loading,
		Loaded
	}

	private sealed class UGWebRoleData : UGRoleData
	{
		public string accountID { get; set; }

		public string channelID { get; set; }

		public string loginName { get; set; }

		public string ugsdk_id { get; set; }
	}

	public Action<string> OnSdkFailed;

	private string _octopusHost = string.Empty;

	public Action OnLoginSuccess;

	public Action OnLogout;

	private bool _isSwitchingAccount;

	private bool _isOctopusLoggingIn;

	private bool _hasEnteredGame;

	private const int OctopusLoginTimeoutMs = 15000;

	public LoginResult loginResult;

	public UGLoginResult ugLoginResult;

	private int _fetchProductsRetryTimerId = -1;

	private int _fetchProductsRetryAttempt;

	private const float FetchProductsRetryBaseDelaySec = 2f;

	private const float FetchProductsRetryMaxDelaySec = 60f;

	private const int FetchProductsMaxRetries = 10;

	private const int SdkTrackMaxRetries = 3;

	private const int SdkTrackRetryIntervalMs = 2000;

	private readonly Dictionary<string, AdLoadStatus> adLoadStatusMap = new Dictionary<string, AdLoadStatus>();

	private AdType pendingShowAdType;

	private AdType playingAdType;

	private OnAdPlayComplete onAdPlayComplete;

	private AdType _adSessionType;

	private bool _adRewardReceived;

	private string _adSessionUid = string.Empty;

	private int _preloadTimerId = -1;

	private AdType _preloadPendingType;

	private const float PreloadDelayAfterCloseSec = 2f;

	private const float AdLoadTimeoutSec = 30f;

	private int _adLoadTimeoutTimerId = -1;

	private string _adLoadTimeoutUnitId;

	public bool IsPush { get; private set; } = true;

	public bool IsOtherPush { get; private set; } = true;

	public string FcmToken { get; private set; } = string.Empty;

	public string ChannelId { get; private set; } = "0";

	public AreaServerResult AreaServerResult { get; set; }

	public List<UGProduct> Products { get; } = new List<UGProduct>();

	public void Init()
	{
		ChannelId = PackageEnvService.GetEnvString("OctopusChannelId", "");
		_octopusHost = PackageEnvService.GetEnvString("OctopusHost", "");
		RegisterCallbacks();
		OctopusLogReportCapture.TryStart();
		OctopusLogReportCapture.SetPhaseInitGame();
	}

	public LoginResult GetLoginResult()
	{
		return loginResult;
	}

	public string GetToken()
	{
		return loginResult?.token ?? string.Empty;
	}

	public string GetAccountId()
	{
		return loginResult?.profileId ?? string.Empty;
	}

	public string GetChannelUserId()
	{
		return loginResult?.channelUserId ?? string.Empty;
	}

	public string GetUserName()
	{
		if (loginResult == null)
		{
			return string.Empty;
		}
		if (!string.IsNullOrEmpty(loginResult.channelNickname))
		{
			return loginResult.channelNickname;
		}
		if (!string.IsNullOrEmpty(loginResult.channelUsername))
		{
			return loginResult.channelUsername;
		}
		return loginResult.channelUserId ?? string.Empty;
	}

	public UGAccountType GetAccountType()
	{
		if (ugLoginResult == null || string.IsNullOrEmpty(ugLoginResult.accountType))
		{
			return UGAccountType.Unknown;
		}
		if (int.TryParse(ugLoginResult.accountType, out var result) && Enum.IsDefined(typeof(UGAccountType), result))
		{
			return (UGAccountType)result;
		}
		return UGAccountType.Unknown;
	}

	public bool IsGuestLogin()
	{
		return GetAccountType() == UGAccountType.Guest;
	}

	private void RegisterCallbacks()
	{
		UGSDKInterface instance = UGSDKInterface.Instance;
		instance.OnLoginSuc = (Action<UGLoginResult>)Delegate.Remove(instance.OnLoginSuc, new Action<UGLoginResult>(OnUgSdkLoginSuccess));
		instance.OnLoginSuc = (Action<UGLoginResult>)Delegate.Combine(instance.OnLoginSuc, new Action<UGLoginResult>(OnUgSdkLoginSuccess));
		instance.OnLoginFailed = (Action<string, string>)Delegate.Remove(instance.OnLoginFailed, new Action<string, string>(OnUgLoginFailed));
		instance.OnLoginFailed = (Action<string, string>)Delegate.Combine(instance.OnLoginFailed, new Action<string, string>(OnUgLoginFailed));
		instance.OnLogout = (Action)Delegate.Remove(instance.OnLogout, new Action(OnUgLogout));
		instance.OnLogout = (Action)Delegate.Combine(instance.OnLogout, new Action(OnUgLogout));
		UGSDK.SetOnSwitchAccount((Action<UGLoginResult>)OnUgSwitchAccount);
		UGSDK.SetOnVisitorUpgrade((Action<UGLoginResult>)OnUgVisitorUpgrade);
		UGSDK.SetOnFcmToken((Action<string, bool, bool>)OnPushInfo);
		UGSDK.SetOnFetchProducted((Action<List<UGProduct>>)OnFetchProducts);
		UGSDK.SetOnProductsFetchFailed((Action<string>)OnProductsFetchFailed);
		UGSDK.SetOnAdReulst((Action<UGAdMobData>)OnAdCallback);
	}

	private void OnUgLogout()
	{
		ClearLocalLoginCache();
		OnLogout?.Invoke();
	}

	public void ClearLoginState()
	{
		ClearLocalLoginCache();
		UGSDK.Logout();
	}

	private void ClearLocalLoginCache()
	{
		loginResult = null;
		ugLoginResult = null;
		OnLoginSuccess = null;
		UGSDK.roleData.uid = string.Empty;
		_hasEnteredGame = false;
	}

	public void DeleteAccount()
	{
		UGSDK.DeleteAccount();
	}

	public void ShowUserCenter()
	{
		UGSDK.ShowUserCenter();
	}

	public void ShowCustomServiceCenter()
	{
		UGSDK.ShowCustomServiceCenter(UGSDK.roleData);
	}

	public void ShowReviewFlow()
	{
		try
		{
			UGSDK.ShowReviewFlow();
		}
		catch (Exception ex)
		{
			Log.Error("[UGSDK] ShowReviewFlow 异常: " + ex.Message);
		}
	}

	public void OpenWebViewForUrl(string url)
	{
		//IL_0000: Unknown result type (might be due to invalid IL or missing references)
		//IL_0006: Expected O, but got Unknown
		UGWebOption val = new UGWebOption();
		val.isTransparent = false;
		FillWebRoleGaps();
		UGRoleData val2 = BuildWebRoleData();
		UGSDK.OpenWebViewForUrl(url, val2, val);
	}

	public void Login(Action successCallback)
	{
		if (_isSwitchingAccount)
		{
			return;
		}
		OnLoginSuccess = successCallback;
		if (loginResult != null)
		{
			if (OnLoginSuccess != null)
			{
				OnLoginSuccess();
			}
		}
		else if (HasValidUgLoginResult())
		{
			if (!_isOctopusLoggingIn)
			{
				RetryOctopusLoginAsync();
			}
		}
		else
		{
			UGSDK.Login();
		}
	}

	private bool HasValidUgLoginResult()
	{
		if (ugLoginResult != null && !string.IsNullOrEmpty(ugLoginResult.userID))
		{
			return !string.IsNullOrEmpty(ugLoginResult.token);
		}
		return false;
	}

	private async void RetryOctopusLoginAsync()
	{
		if (!HasValidUgLoginResult())
		{
			Log.Error("[UGSDK] RetryOctopusLoginAsync: ugLoginResult 无效");
			OnUgLoginFailed("-1", "Octopus login retry skipped: invalid ugLoginResult");
		}
		else
		{
			UGSDK.roleData.uid = ugLoginResult.userID;
			ApplyFcmTokenFromLoginResult(ugLoginResult);
			await CompleteOctopusLoginAsync(ugLoginResult.userID, ugLoginResult.token);
		}
	}

	public void Logout()
	{
		UGSDK.Logout();
	}

	public void SubmitEnterGame()
	{
		OctopusLogReportCapture.SetPhaseGame();
		UGSDK.UGSubmitEnterGame();
		string text = JsonConvert.SerializeObject((object)UGSDK.roleData);
		SyncRoleAnalyticsAttrs(UGSDK.roleData.roleID, UGSDK.roleData.roleName);
		SetDistinctId(UGSDK.roleData.roleID);
		OctopusLog.Debug("UGSDK: 提交数据 " + text, (Dictionary<string, object>)null);
		_hasEnteredGame = true;
		SdkTrackHelper.AttachPushMessageHandler((Action<string>)OnPushMessageResult);
		if (!string.IsNullOrEmpty(_octopusHost))
		{
			UGSDK.StartHttpConfig(_octopusHost);
			UGSDK.StartMTRConfig(_octopusHost);
		}
	}

	public void Share(string imagePath, UGShareChannel channel = (UGShareChannel)0, string desc = null)
	{
		//IL_0000: Unknown result type (might be due to invalid IL or missing references)
		//IL_0005: Unknown result type (might be due to invalid IL or missing references)
		//IL_0006: Unknown result type (might be due to invalid IL or missing references)
		//IL_000c: Unknown result type (might be due to invalid IL or missing references)
		//IL_0013: Unknown result type (might be due to invalid IL or missing references)
		//IL_001a: Unknown result type (might be due to invalid IL or missing references)
		//IL_004e: Expected O, but got Unknown
		UGSDK.ShareContent(new UGShareData
		{
			shareChannel = channel,
			contentType = (UGShareType)1,
			imagePath = imagePath,
			desc = (desc ?? string.Empty)
		}, (Action<bool>)delegate
		{
		});
	}

	public void Pay(UGOrder order, Action<UGOrder> onPaySuccess = null, Action<string> onPayFailed = null)
	{
		UGSDKInterface sdk = UGSDKInterface.Instance;
		sdk.OnPaySuc = null;
		sdk.OnPayFailed = null;
		UGSDK.Pay(order, (Action<UGOrder>)OnSuccess, (Action<string>)OnFailed);
		void OnFailed(string msg)
		{
			sdk.OnPaySuc = null;
			sdk.OnPayFailed = null;
			onPayFailed?.Invoke(msg);
		}
		void OnSuccess(UGOrder paidOrder)
		{
			sdk.OnPaySuc = null;
			sdk.OnPayFailed = null;
			onPaySuccess?.Invoke(paidOrder);
		}
	}

	public void SubmitCreateRole()
	{
		JsonConvert.SerializeObject((object)UGSDK.roleData);
		UGSDK.UGSubmitCreateRole();
	}

	public void SubmitLevelUp()
	{
		JsonConvert.SerializeObject((object)UGSDK.roleData);
		UGSDK.UGSubmitLevelUP();
	}

	public void SubmitExitGame()
	{
		UGSDK.UGSubmitExitGame();
	}

	public void SubmitEventData(string eventName, Dictionary<string, object> data = null)
	{
		if (!string.IsNullOrEmpty(eventName))
		{
			Dictionary<string, object> dictionary = data ?? new Dictionary<string, object>();
			UGSDK.UGSubmitEventData(eventName, dictionary);
		}
	}

	public void SubmitEventData(TrackEvent trackEvent, Dictionary<string, object> data = null)
	{
		SubmitEventData(trackEvent.ToString(), data);
	}

	public void SetAnalyticsGlobalAttr(string key, object value)
	{
		AnalyticsConfig.AnalyticsGlobalAttrDict[key] = value;
	}

	public void TrackOctopus(string eventName, Dictionary<string, object> data = null)
	{
		if (!string.IsNullOrEmpty(eventName))
		{
			OctopusAnalytics.Track(eventName, data);
		}
	}

	public void SetDistinctId(string distinctId)
	{
		AnalyticsConfig.SetDistinctId(distinctId);
	}

	private void SyncRoleAnalyticsAttrs(string roleId, string roleName)
	{
		if (!string.IsNullOrEmpty(roleId))
		{
			SetAnalyticsGlobalAttr("roleID", roleId);
			LogConfig.LogGlobalAttrDict["roleID"] = roleId;
			LogConfig.SetRoleId(roleId);
		}
		if (!string.IsNullOrEmpty(roleName))
		{
			LogConfig.SetRoleName(roleName);
		}
	}

	private void SyncAccountLogAttr(string profileId)
	{
		if (!string.IsNullOrEmpty(profileId))
		{
			LogConfig.LogGlobalAttrDict["AccountId"] = profileId;
		}
	}

	public void UpdateRoleInfo(UGSdkRoleDataChangeType type, string roleId, string roleName, string roleLevel, string serverId = "1001", string serverName = "dev-1")
	{
		UGSDK.roleData.type = (int)type;
		UGSDK.roleData.roleID = roleId;
		UGSDK.roleData.roleName = roleName;
		UGSDK.roleData.roleLevel = roleLevel;
		UGSDK.roleData.serverID = serverId;
		UGSDK.roleData.serverName = serverName;
		UGSDK.roleData.vip = "0";
		PlayerInfoData playerInfoData = GameModule.Model.LoginModel.PlayerInfoData;
		if (playerInfoData != null && playerInfoData.PlayerCreateTime > 0)
		{
			UGSDK.roleData.createTime = playerInfoData.PlayerCreateTime;
		}
	}

	private async void OnUgSdkLoginSuccess(UGLoginResult result)
	{
		if (!_isSwitchingAccount && !_isOctopusLoggingIn)
		{
			UGSDK.roleData.uid = result.userID;
			ugLoginResult = result;
			ApplyFcmTokenFromLoginResult(result);
			await CompleteOctopusLoginAsync(result.userID, result.token);
		}
	}

	private async Task CompleteOctopusLoginAsync(string userId, string token)
	{
		_isOctopusLoggingIn = true;
		try
		{
			loginResult = await OctopusUgLogin(userId, token);
			LogConfig.SetChannaId(ChannelId);
			if (loginResult != null)
			{
				SetDistinctId(loginResult.profileId);
				SyncAccountLogAttr(loginResult.profileId);
				if (OnLoginSuccess != null)
				{
					OnLoginSuccess();
				}
				UpdatePushToken();
			}
			else
			{
				Log.Error("UGSDK Octopus 登录失败");
				OnUgLoginFailed("-1", "Octopus login failed");
			}
		}
		finally
		{
			_isOctopusLoggingIn = false;
		}
	}

	private void OnUgLoginFailed(string code, string msg)
	{
		Log.Error("UGSDK 登录失败: " + code + ", " + msg);
		GameModule.UI.HideLoginLoading();
		Action retryCallback = OnLoginSuccess;
		GameModule.UI.OpenSystemDialog(EnumDialog.SystemAlert, SystemDialogPriority.NetError, excludeSame: true, new AlertData
		{
			title = LangCfg.GetLang("net_alert_title"),
			msg = LangCfg.GetLang("ug_sdk_login_failed"),
			isShowCancelBtn = false,
			closeOnMaskClick = false,
			okCallback = delegate
			{
				Login(retryCallback);
			}
		});
	}

	private async void OnUgSwitchAccount(UGLoginResult result)
	{
		if (result == null)
		{
			Log.Error("UGSDK 切换账号失败: result 为空");
			return;
		}
		_isSwitchingAccount = true;
		OnLoginSuccess = null;
		loginResult = null;
		ugLoginResult = result;
		UGSDK.roleData.uid = result.userID;
		ApplyFcmTokenFromLoginResult(result);
		try
		{
			loginResult = await OctopusUgLogin(result.userID, result.token);
			if (loginResult != null)
			{
				LogConfig.SetChannaId(ChannelId);
				SetDistinctId(loginResult.profileId);
				SyncAccountLogAttr(loginResult.profileId);
				UpdatePushToken();
				if (GameModule.UI.CurrentView is LoginView loginView)
				{
					loginView.OnUGSdkSwitchAccountSuccess();
					return;
				}
				UniTaskVoid val = GameApp.Restart();
				((UniTaskVoid)(ref val)).Forget();
			}
			else
			{
				Log.Error("UGSDK 切换账号后 Octopus 登录失败");
				OnUgLoginFailed("-1", "Octopus login failed");
			}
		}
		finally
		{
			_isSwitchingAccount = false;
		}
	}

	private void OnUgVisitorUpgrade(UGLoginResult result)
	{
		ugLoginResult = result;
		UGSDK.roleData.uid = result.userID;
		ApplyFcmTokenFromLoginResult(result);
	}

	public void FetchProducts()
	{
		ResetFetchProductsRetry();
		UGSDK.FetchProducts((Action<List<UGProduct>>)null, (Action<string>)null);
	}

	private void ScheduleFetchProductsRetry(string failReason)
	{
		//IL_0053: Unknown result type (might be due to invalid IL or missing references)
		//IL_0065: Expected O, but got Unknown
		if (_fetchProductsRetryAttempt < 10)
		{
			float num = Math.Min(2f * (float)Math.Pow(2.0, _fetchProductsRetryAttempt), 60f);
			_fetchProductsRetryAttempt++;
			CancelFetchProductsRetryTimer();
			_fetchProductsRetryTimerId = GameModule.Timer.AddTimer((TimerHandler)delegate
			{
				_fetchProductsRetryTimerId = -1;
				UGSDK.FetchProducts((Action<List<UGProduct>>)null, (Action<string>)null);
			}, num, false, false, Array.Empty<object>());
		}
	}

	private void CancelFetchProductsRetryTimer()
	{
		if (_fetchProductsRetryTimerId != -1)
		{
			GameModule.Timer.RemoveTimer(_fetchProductsRetryTimerId);
			_fetchProductsRetryTimerId = -1;
		}
	}

	private void ResetFetchProductsRetry()
	{
		CancelFetchProductsRetryTimer();
		_fetchProductsRetryAttempt = 0;
	}

	public UGProduct GetProduct(string productId)
	{
		if (string.IsNullOrEmpty(productId) || Products.Count == 0)
		{
			return null;
		}
		foreach (UGProduct product in Products)
		{
			if (product.localProductID == productId || product.platformProductID == productId)
			{
				return product;
			}
		}
		return null;
	}

	public int GetProductPrice(string productId)
	{
		return GetProduct(productId)?.price ?? 0;
	}

	private void OnFetchProducts(List<UGProduct> products)
	{
		Products.Clear();
		if (products != null && products.Count > 0)
		{
			Products.AddRange(products);
			ResetFetchProductsRetry();
		}
	}

	private void OnProductsFetchFailed(string fail)
	{
		ScheduleFetchProductsRetry(fail);
	}

	private void OnPushInfo(string fcmToken, bool isPush, bool isOtherPush)
	{
		FcmToken = fcmToken;
		IsPush = isPush;
		IsOtherPush = isOtherPush;
		string.IsNullOrEmpty(fcmToken);
		if (loginResult != null)
		{
			UpdatePushToken();
		}
	}

	private void OnPushMessageResult(string message)
	{
		if (string.IsNullOrEmpty(message) || !_hasEnteredGame)
		{
			return;
		}
		try
		{
			Dictionary<string, object> dictionary = JsonConvert.DeserializeObject<Dictionary<string, object>>(message);
			Dictionary<string, object> dictionary2 = new Dictionary<string, object>();
			if (dictionary != null)
			{
				dictionary2["message_key"] = GetString(dictionary, "message_key");
				dictionary2["message_id"] = GetString(dictionary, "message_id");
				dictionary2["device_id"] = GetString(dictionary, "device_id");
				dictionary2["afid"] = GetString(dictionary, "afid");
				dictionary2["gaid"] = GetString(dictionary, "gaid");
				UGRoleData roleData = UGSDK.roleData;
				dictionary2["uid"] = ((roleData != null) ? roleData.roleID : null) ?? string.Empty;
			}
			dictionary2["account_id"] = GetAccountId();
			TrackOctopus("PushClick", dictionary2);
		}
		catch (Exception ex)
		{
			Log.Error("[UGSDK] OnPushMessageResult parse error: " + ex.Message);
		}
	}

	private static string GetString(Dictionary<string, object> msg, string key)
	{
		if (!msg.TryGetValue(key, out var value) || value == null)
		{
			return string.Empty;
		}
		return value.ToString();
	}

	public void SetOnPushMessageCallback(Action<string> onPushMessageResult)
	{
		if (onPushMessageResult != null)
		{
			UGSDK.SetOnPushMessageResult(onPushMessageResult);
		}
	}

	private async Task<LoginResult> OctopusUgLogin(string uid, string token)
	{
		TaskCompletionSource<LoginResult> tcs = new TaskCompletionSource<LoginResult>();
		LoginGaSdkRequest val = new LoginGaSdkRequest
		{
			ChannelId = ChannelId,
			Uid = uid,
			Token = token
		};
		((BaseRequest<LoginResult>)val).SuccessCallback = delegate(string s, LoginResult result)
		{
			OctopusLog.Debug("UGSDK: Octopus 登录成功 " + s, (Dictionary<string, object>)null);
			tcs.TrySetResult(result);
		};
		LoginGaSdkRequest loginRequest = val;
		((BaseRequest<LoginResult>)(object)loginRequest).ErrorCodeCallback = delegate(int errCode)
		{
			Log.Error($"[UGSDK] OctopusUgLogin ErrorCodeCallback errCode:{errCode}, errorMsg:{((BaseRequest<LoginResult>)(object)loginRequest).errorMsg}");
			OctopusLog.Debug(((BaseRequest<LoginResult>)(object)loginRequest).errorMsg, (Dictionary<string, object>)null);
			if (OnSdkFailed != null)
			{
				OnSdkFailed(((BaseRequest<LoginResult>)(object)loginRequest).errorMsg);
			}
			tcs.TrySetResult(null);
		};
		((BaseRequest<LoginResult>)(object)loginRequest).ExCallback = delegate(int errCode, string msg)
		{
			Log.Error($"[UGSDK] OctopusUgLogin ExCallback errCode:{errCode}, msg:{msg}");
			OctopusLog.Debug($"OctopusSDK 登录失败: {errCode},{msg}", (Dictionary<string, object>)null);
			if (OnSdkFailed != null)
			{
				OnSdkFailed(msg);
			}
			tcs.TrySetResult(null);
		};
		((BaseRequest<LoginResult>)(object)loginRequest).Execute();
		Task delayTask = Task.Delay(15000);
		if (await Task.WhenAny(new Task[2] { tcs.Task, delayTask }) == delayTask)
		{
			Log.Error($"[UGSDK] OctopusUgLogin timeout after {15000}ms");
			if (OnSdkFailed != null)
			{
				OnSdkFailed("Octopus login timeout");
			}
			tcs.TrySetResult(null);
			return null;
		}
		return await tcs.Task;
	}

	public Task<AreaServerResult> GetServerList()
	{
		return GetServerListWithRetryAsync();
	}

	public Task<NoticeLoginV2Result> GetNotice()
	{
		return GetNoticeWithRetryAsync();
	}

	public Task<VersionDetailResult> CheckVersion(string versionKey = "dev", string version = null)
	{
		return CheckVersionWithRetryAsync(versionKey, version);
	}

	private async Task<AreaServerResult> GetServerListWithRetryAsync()
	{
		for (int attempt = 0; attempt < 3; attempt++)
		{
			AreaServerResult val = await RequestServerListOnceAsync();
			if (val != null)
			{
				return val;
			}
			if (attempt < 2)
			{
				await Task.Delay(2000);
			}
		}
		return null;
	}

	private Task<AreaServerResult> RequestServerListOnceAsync()
	{
		//IL_0018: Unknown result type (might be due to invalid IL or missing references)
		//IL_001d: Unknown result type (might be due to invalid IL or missing references)
		//IL_0024: Unknown result type (might be due to invalid IL or missing references)
		//IL_0036: Expected O, but got Unknown
		//IL_0036: Unknown result type (might be due to invalid IL or missing references)
		//IL_0048: Expected O, but got Unknown
		//IL_0048: Unknown result type (might be due to invalid IL or missing references)
		//IL_005a: Expected O, but got Unknown
		//IL_005f: Expected O, but got Unknown
		TaskCompletionSource<AreaServerResult> tcs = new TaskCompletionSource<AreaServerResult>();
		NewAreaServerListRequest val = new NewAreaServerListRequest
		{
			allServerFlag = true
		};
		((BaseRequest<AreaServerResult>)val).ExCallback = delegate(int code, string msg)
		{
			OctopusLog.Debug(msg, (Dictionary<string, object>)null);
			Log.Error($"OctopusSDK 获取服务器列表失败: {code},{msg}");
			OnSdkFailed?.Invoke(msg);
			tcs.TrySetResult(null);
		};
		((BaseRequest<AreaServerResult>)val).SuccessCallback = delegate(string s, AreaServerResult result)
		{
			AreaServerResult = result;
			tcs.TrySetResult(result);
		};
		((BaseRequest<AreaServerResult>)val).ErrorCodeCallback = delegate(int errCode)
		{
			Log.Error($"UGSDK GetServerList 出错: {errCode}");
			OnSdkFailed?.Invoke("获取服务器列表异常");
			tcs.TrySetResult(null);
		};
		((BaseRequest<AreaServerResult>)val).Execute();
		return tcs.Task;
	}

	private async Task<NoticeLoginV2Result> GetNoticeWithRetryAsync()
	{
		for (int attempt = 0; attempt < 3; attempt++)
		{
			NoticeLoginV2Result val = await RequestNoticeOnceAsync();
			if (val != null)
			{
				return val;
			}
			if (attempt < 2)
			{
				await Task.Delay(2000);
			}
		}
		return null;
	}

	private Task<NoticeLoginV2Result> RequestNoticeOnceAsync()
	{
		//IL_0019: Unknown result type (might be due to invalid IL or missing references)
		//IL_001e: Unknown result type (might be due to invalid IL or missing references)
		//IL_002a: Unknown result type (might be due to invalid IL or missing references)
		//IL_003c: Expected O, but got Unknown
		//IL_0041: Expected O, but got Unknown
		TaskCompletionSource<NoticeLoginV2Result> tcs = new TaskCompletionSource<NoticeLoginV2Result>();
		NoticeLoginV2Request val = new NoticeLoginV2Request
		{
			ChannelId = ChannelId
		};
		((BaseRequest<NoticeLoginV2Result>)val).SuccessCallback = delegate(string s, NoticeLoginV2Result result)
		{
			tcs.TrySetResult(result);
		};
		NoticeLoginV2Request request = val;
		((BaseRequest<NoticeLoginV2Result>)(object)request).ExCallback = delegate
		{
			OnSdkFailed?.Invoke(((BaseRequest<NoticeLoginV2Result>)(object)request).errorMsg);
			tcs.TrySetResult(null);
		};
		((BaseRequest<NoticeLoginV2Result>)(object)request).ErrorCodeCallback = delegate
		{
			OnSdkFailed?.Invoke("公告获取异常");
			tcs.TrySetResult(null);
		};
		((BaseRequest<NoticeLoginV2Result>)(object)request).Execute();
		return tcs.Task;
	}

	private async Task<VersionDetailResult> CheckVersionWithRetryAsync(string versionKey, string version)
	{
		for (int attempt = 0; attempt < 3; attempt++)
		{
			VersionDetailResult val = await RequestCheckVersionOnceAsync(versionKey, version);
			if (val != null)
			{
				return val;
			}
			if (attempt < 2)
			{
				await Task.Delay(2000);
			}
		}
		return null;
	}

	private Task<VersionDetailResult> RequestCheckVersionOnceAsync(string versionKey, string version)
	{
		//IL_001f: Unknown result type (might be due to invalid IL or missing references)
		//IL_0024: Unknown result type (might be due to invalid IL or missing references)
		//IL_002b: Unknown result type (might be due to invalid IL or missing references)
		//IL_0032: Unknown result type (might be due to invalid IL or missing references)
		//IL_0042: Unknown result type (might be due to invalid IL or missing references)
		//IL_0054: Expected O, but got Unknown
		//IL_0054: Unknown result type (might be due to invalid IL or missing references)
		//IL_0066: Expected O, but got Unknown
		//IL_006b: Expected O, but got Unknown
		TaskCompletionSource<VersionDetailResult> tcs = new TaskCompletionSource<VersionDetailResult>();
		string device = "Android";
		VersionDetailRequest val = new VersionDetailRequest
		{
			Key = versionKey,
			Device = device,
			Version = (version ?? Application.version)
		};
		((BaseRequest<VersionDetailResult>)val).ExCallback = delegate(int errCode, string errorMsg)
		{
			OnSdkFailed?.Invoke(errorMsg);
			tcs.TrySetResult(null);
		};
		((BaseRequest<VersionDetailResult>)val).SuccessCallback = delegate(string s, VersionDetailResult result)
		{
			tcs.TrySetResult(result);
		};
		VersionDetailRequest request = val;
		((BaseRequest<VersionDetailResult>)(object)request).ErrorCodeCallback = delegate
		{
			OnSdkFailed?.Invoke(((BaseRequest<VersionDetailResult>)(object)request).errorMsg);
			tcs.TrySetResult(null);
		};
		((BaseRequest<VersionDetailResult>)(object)request).Execute();
		return tcs.Task;
	}

	public void Translate(string text, Action<TranslateResult> onSuccess, Action<string> onFailed)
	{
		//IL_0032: Unknown result type (might be due to invalid IL or missing references)
		//IL_0037: Unknown result type (might be due to invalid IL or missing references)
		//IL_003e: Unknown result type (might be due to invalid IL or missing references)
		//IL_004e: Unknown result type (might be due to invalid IL or missing references)
		//IL_0060: Expected O, but got Unknown
		//IL_0060: Unknown result type (might be due to invalid IL or missing references)
		//IL_0072: Expected O, but got Unknown
		//IL_0072: Unknown result type (might be due to invalid IL or missing references)
		//IL_0084: Expected O, but got Unknown
		//IL_0089: Expected O, but got Unknown
		if (string.IsNullOrEmpty(text))
		{
			onFailed?.Invoke("empty text");
			return;
		}
		TranslateRequest val = new TranslateRequest
		{
			text = text,
			target = GameLanguage.ToTranslateTargetCode(LocalStorage.GetGameLanguageCode())
		};
		((BaseRequest<TranslateResult>)val).SuccessCallback = delegate(string raw, TranslateResult result)
		{
			if (result == null || string.IsNullOrEmpty(result.text))
			{
				onFailed?.Invoke("empty result");
			}
			else
			{
				onSuccess?.Invoke(result);
			}
		};
		((BaseRequest<TranslateResult>)val).ExCallback = delegate(int code, string msg)
		{
			onFailed?.Invoke(msg);
		};
		((BaseRequest<TranslateResult>)val).ErrorCodeCallback = delegate(int err)
		{
			onFailed?.Invoke(err.ToString());
		};
		((BaseRequest<TranslateResult>)val).Execute();
	}

	private void ApplyFcmTokenFromLoginResult(UGLoginResult result)
	{
		if (result != null && !string.IsNullOrEmpty(result.fcmToken))
		{
			FcmToken = result.fcmToken;
		}
	}

	private void UpdatePushToken()
	{
		//IL_0028: Unknown result type (might be due to invalid IL or missing references)
		//IL_002d: Unknown result type (might be due to invalid IL or missing references)
		//IL_0042: Unknown result type (might be due to invalid IL or missing references)
		//IL_004e: Unknown result type (might be due to invalid IL or missing references)
		//IL_0073: Expected O, but got Unknown
		//IL_0078: Expected O, but got Unknown
		if (string.IsNullOrEmpty(FcmToken))
		{
			OctopusLog.Error("UGSDK FCMToken is empty", (Dictionary<string, object>)null);
			return;
		}
		PushTokenRequest val = new PushTokenRequest
		{
			language = RogBuildParams.GetString("OctopusLanguage", "cn"),
			pushToken = FcmToken
		};
		((BaseRequest<EmptyResult>)val).SuccessCallback = delegate
		{
		};
		PushTokenRequest request = val;
		if (UGSDK.IsRegionKr)
		{
			request.allPush = IsPush;
			request.adPush = IsPush;
			request.nightPush = IsOtherPush;
		}
		((BaseRequest<EmptyResult>)(object)request).ExCallback = delegate(int errCode, string errorMsg)
		{
			Log.Error($"UGSDK Firebase token 上传失败: {errCode}");
			OnSdkFailed?.Invoke(errorMsg);
		};
		((BaseRequest<EmptyResult>)(object)request).ErrorCodeCallback = delegate(int errCode)
		{
			Log.Error($"UGSDK Firebase token 上传失败: {errCode}");
			OnSdkFailed?.Invoke(((BaseRequest<EmptyResult>)(object)request).errorMsg);
		};
		((BaseRequest<EmptyResult>)(object)request).Execute();
	}

	private static string GetAdUnitId(AdType type)
	{
		return AdId.GetAdId(type);
	}

	private static AdType ParseAdTypeFromData(UGAdMobData data)
	{
		if (data.adParams != null && data.adParams.TryGetValue("adType", out var value) && Enum.TryParse<AdType>(value, out var result))
		{
			return result;
		}
		return AdType.None;
	}

	private AdLoadStatus GetAdLoadStatus(string adUnitId)
	{
		if (!adLoadStatusMap.TryGetValue(adUnitId, out var value))
		{
			return AdLoadStatus.None;
		}
		return value;
	}

	private void SetAdLoadStatus(string adUnitId, AdLoadStatus status)
	{
		AdLoadStatus adLoadStatus = GetAdLoadStatus(adUnitId);
		if (status == AdLoadStatus.None)
		{
			adLoadStatusMap.Remove(adUnitId);
		}
		else
		{
			adLoadStatusMap[adUnitId] = status;
		}
		if (adLoadStatus == AdLoadStatus.Loading && status != AdLoadStatus.Loading)
		{
			CancelAdLoadTimeout();
		}
		if (status == AdLoadStatus.Loading && adLoadStatus != AdLoadStatus.Loading)
		{
			ScheduleAdLoadTimeout(adUnitId);
		}
	}

	private void CancelAdLoadTimeout()
	{
		if (_adLoadTimeoutTimerId >= 0)
		{
			GameModule.Timer.RemoveTimer(_adLoadTimeoutTimerId);
			_adLoadTimeoutTimerId = -1;
		}
		_adLoadTimeoutUnitId = null;
	}

	private void ScheduleAdLoadTimeout(string adUnitId)
	{
		//IL_001a: Unknown result type (might be due to invalid IL or missing references)
		//IL_0030: Expected O, but got Unknown
		CancelAdLoadTimeout();
		_adLoadTimeoutUnitId = adUnitId;
		_adLoadTimeoutTimerId = GameModule.Timer.AddTimer((TimerHandler)delegate
		{
			OnAdLoadTimeout();
		}, 30f, false, false, Array.Empty<object>());
	}

	private void OnAdLoadTimeout()
	{
		_adLoadTimeoutTimerId = -1;
		string adLoadTimeoutUnitId = _adLoadTimeoutUnitId;
		_adLoadTimeoutUnitId = null;
		if (!string.IsNullOrEmpty(adLoadTimeoutUnitId) && GetAdLoadStatus(adLoadTimeoutUnitId) == AdLoadStatus.Loading)
		{
			AdType adType = pendingShowAdType;
			SetAdLoadStatus(adLoadTimeoutUnitId, AdLoadStatus.None);
			if (adType != AdType.None && !(GetAdUnitId(adType) != adLoadTimeoutUnitId))
			{
				playingAdType = adType;
				pendingShowAdType = AdType.None;
				UGSDK.ShowAd(CreateRewardAdData(adType, withAdTypeParam: true));
			}
		}
	}

	private void CancelPreloadTimer()
	{
		if (_preloadTimerId >= 0)
		{
			GameModule.Timer.RemoveTimer(_preloadTimerId);
			_preloadTimerId = -1;
		}
		_preloadPendingType = AdType.None;
	}

	private void SchedulePreloadAfterClose(AdType type)
	{
		//IL_001e: Unknown result type (might be due to invalid IL or missing references)
		//IL_0034: Expected O, but got Unknown
		CancelPreloadTimer();
		if (type != AdType.None)
		{
			_preloadPendingType = type;
			_preloadTimerId = GameModule.Timer.AddTimer((TimerHandler)delegate
			{
				_preloadTimerId = -1;
				AdType preloadPendingType = _preloadPendingType;
				_preloadPendingType = AdType.None;
				PreloadAd(preloadPendingType);
			}, 2f, false, false, Array.Empty<object>());
		}
	}

	private void PreloadAd(AdType type)
	{
		if (type != AdType.None)
		{
			LoadAd(type);
		}
	}

	private static UGAdMobData CreateRewardAdData(AdType type, bool withAdTypeParam)
	{
		//IL_0000: Unknown result type (might be due to invalid IL or missing references)
		//IL_0005: Unknown result type (might be due to invalid IL or missing references)
		//IL_0007: Unknown result type (might be due to invalid IL or missing references)
		//IL_000c: Unknown result type (might be due to invalid IL or missing references)
		//IL_0019: Expected O, but got Unknown
		UGAdMobData val = new UGAdMobData
		{
			adType = (UGAdMobType)3,
			adUnitId = GetAdUnitId(type)
		};
		if (withAdTypeParam)
		{
			val.adParams = new Dictionary<string, string> {
			{
				"adType",
				type.ToString()
			} };
		}
		return val;
	}

	public void LoadAd(AdType type)
	{
		if (type != AdType.None)
		{
			string adUnitId = GetAdUnitId(type);
			AdLoadStatus adLoadStatus = GetAdLoadStatus(adUnitId);
			if (adLoadStatus != AdLoadStatus.Loading && adLoadStatus != AdLoadStatus.Loaded)
			{
				SetAdLoadStatus(adUnitId, AdLoadStatus.Loading);
				UGSDK.LoadAd(CreateRewardAdData(type, withAdTypeParam: false));
			}
		}
	}

	public void LoadAllAds()
	{
		HashSet<string> hashSet = new HashSet<string>();
		foreach (AdType value in Enum.GetValues(typeof(AdType)))
		{
			if (value != AdType.None)
			{
				string adUnitId = GetAdUnitId(value);
				if (hashSet.Add(adUnitId))
				{
					LoadAd(value);
				}
			}
		}
	}

	public void ShowAd(AdType type, OnAdPlayComplete onAdPlayComplete)
	{
		if (type == AdType.None)
		{
			onAdPlayComplete?.Invoke(AdType.None);
			return;
		}
		TrackAdEvent(TrackEvent.af_adbuttonclick, type);
		TrackAdEvent(TrackEvent.af_ad_request, type);
		this.onAdPlayComplete = onAdPlayComplete;
		string adUnitId = GetAdUnitId(type);
		switch (GetAdLoadStatus(adUnitId))
		{
		case AdLoadStatus.Loaded:
			PlayLoadedAd(type);
			return;
		case AdLoadStatus.Loading:
			pendingShowAdType = type;
			return;
		}
		pendingShowAdType = type;
		SetAdLoadStatus(adUnitId, AdLoadStatus.Loading);
		UGSDK.LoadAd(CreateRewardAdData(type, withAdTypeParam: true));
	}

	private void PlayLoadedAd(AdType type)
	{
		string adUnitId = GetAdUnitId(type);
		if (GetAdLoadStatus(adUnitId) != AdLoadStatus.Loaded)
		{
			NotifyAdPlayComplete(AdType.None);
			return;
		}
		playingAdType = type;
		pendingShowAdType = AdType.None;
		SetAdLoadStatus(adUnitId, AdLoadStatus.None);
		UGSDK.ShowAd(CreateRewardAdData(type, withAdTypeParam: true));
	}

	private void NotifyAdPlayComplete(AdType type)
	{
		OnAdPlayComplete obj = onAdPlayComplete;
		onAdPlayComplete = null;
		obj?.Invoke(type);
	}

	private void ResetAdPlayState()
	{
		playingAdType = AdType.None;
		pendingShowAdType = AdType.None;
		_adSessionType = AdType.None;
		_adRewardReceived = false;
		_adSessionUid = string.Empty;
	}

	private void ClearAdSession()
	{
		playingAdType = AdType.None;
		_adSessionType = AdType.None;
		_adRewardReceived = false;
		_adSessionUid = string.Empty;
	}

	private AdType ResolveTrackAdType(UGAdMobData data)
	{
		if (playingAdType != AdType.None)
		{
			return playingAdType;
		}
		if (pendingShowAdType != AdType.None)
		{
			return pendingShowAdType;
		}
		if (_adSessionType != AdType.None)
		{
			return _adSessionType;
		}
		return ParseAdTypeFromData(data);
	}

	private void TrackAdEvent(TrackEvent trackEvent, AdType position, UGAdMobData data = null)
	{
		if (position != AdType.None)
		{
			string adId = ((!string.IsNullOrEmpty(data?.adUnitId)) ? data.adUnitId : GetAdUnitId(position));
			string adUid = ((!string.IsNullOrEmpty(data?.responseId)) ? data.responseId : _adSessionUid);
			TrackHelper.Track(trackEvent, TrackEventParams.BuildAdTrack(position, adId, adUid));
		}
	}

	private void OnAdCallback(UGAdMobData data)
	{
		//IL_0001: Unknown result type (might be due to invalid IL or missing references)
		//IL_0006: Unknown result type (might be due to invalid IL or missing references)
		//IL_0007: Unknown result type (might be due to invalid IL or missing references)
		//IL_0009: Unknown result type (might be due to invalid IL or missing references)
		//IL_0027: Expected I4, but got Unknown
		UGAdMobResult result = data.result;
		switch (result - 1)
		{
		case 0:
			OnAdFailed(data);
			break;
		case 1:
			OnAdLoaded(data);
			break;
		case 2:
			OnAdShowed(data);
			break;
		case 3:
			OnAdClosed(data);
			break;
		case 4:
			OnAdRewarded(data);
			break;
		case 5:
			OnAdClicked(data);
			break;
		}
	}

	private void OnAdFailed(UGAdMobData data)
	{
		Log.Error("UGSDK AdCallback Failed adUnitId=" + data.adUnitId);
		AdType position = ResolveTrackAdType(data);
		if (GetAdLoadStatus(data.adUnitId) == AdLoadStatus.Loading || (pendingShowAdType != AdType.None && playingAdType == AdType.None))
		{
			TrackAdEvent(TrackEvent.af_ad_load_failed, position, data);
		}
		SetAdLoadStatus(data.adUnitId, AdLoadStatus.None);
		bool num = onAdPlayComplete != null && (pendingShowAdType != AdType.None || playingAdType != AdType.None);
		ResetAdPlayState();
		if (num)
		{
			NotifyAdPlayComplete(AdType.None);
		}
	}

	private void OnAdLoaded(UGAdMobData data)
	{
		SetAdLoadStatus(data.adUnitId, AdLoadStatus.Loaded);
		if (!string.IsNullOrEmpty(data.responseId))
		{
			_adSessionUid = data.responseId;
		}
		AdType adType = pendingShowAdType;
		if (adType == AdType.None)
		{
			adType = ParseAdTypeFromData(data);
		}
		if (adType != AdType.None && !(GetAdUnitId(adType) != data.adUnitId))
		{
			pendingShowAdType = AdType.None;
			PlayLoadedAd(adType);
		}
	}

	private void OnAdShowed(UGAdMobData data)
	{
		if (playingAdType == AdType.None)
		{
			playingAdType = ParseAdTypeFromData(data);
		}
		_adSessionType = playingAdType;
		_adRewardReceived = false;
		if (!string.IsNullOrEmpty(data.responseId))
		{
			_adSessionUid = data.responseId;
		}
		TrackAdEvent(TrackEvent.af_ad_impression, ResolveTrackAdType(data), data);
	}

	private void OnAdClicked(UGAdMobData data)
	{
		if (!string.IsNullOrEmpty(data.responseId))
		{
			_adSessionUid = data.responseId;
		}
	}

	private void OnAdClosed(UGAdMobData data)
	{
		AdType type = ((_adSessionType != AdType.None) ? _adSessionType : ((playingAdType != AdType.None) ? playingAdType : ParseAdTypeFromData(data)));
		SetAdLoadStatus(data.adUnitId, AdLoadStatus.None);
		if (!_adRewardReceived && playingAdType != AdType.None)
		{
			NotifyAdPlayComplete(AdType.None);
		}
		ClearAdSession();
		SchedulePreloadAfterClose(type);
	}

	private void OnAdRewarded(UGAdMobData data)
	{
		if (!_adRewardReceived)
		{
			AdType adType = (_adSessionType = ((playingAdType != AdType.None) ? playingAdType : ParseAdTypeFromData(data)));
			_adRewardReceived = true;
			if (!string.IsNullOrEmpty(data.responseId))
			{
				_adSessionUid = data.responseId;
			}
			if (adType != AdType.None)
			{
				string adId = ((!string.IsNullOrEmpty(data?.responseId)) ? data.responseId : _adSessionUid);
				OctopusTrackHelper.TrackADClick(adType, adId);
			}
			NotifyAdPlayComplete(adType);
		}
	}

	public void ReportWarning(string message, Dictionary<string, object> extra = null)
	{
		OctopusLogReportCapture.ReportWarning(message, extra);
	}

	public void ReportError(string message, Dictionary<string, object> extra = null)
	{
		OctopusLogReportCapture.ReportError(message, extra);
	}

	public void ReportException(string message, string stackTrace = null, Dictionary<string, object> extra = null)
	{
		OctopusLogReportCapture.ReportException(message, stackTrace, extra);
	}

	private void FillWebRoleGaps()
	{
		UGRoleData roleData = UGSDK.roleData;
		if (string.IsNullOrEmpty(roleData.uid))
		{
			UGLoginResult obj = ugLoginResult;
			if (!string.IsNullOrEmpty((obj != null) ? obj.userID : null))
			{
				roleData.uid = ugLoginResult.userID;
			}
		}
		if (roleData.createTime <= 0)
		{
			PlayerInfoData playerInfoData = GameModule.Model.LoginModel.PlayerInfoData;
			if (playerInfoData != null && playerInfoData.PlayerCreateTime > 0)
			{
				roleData.createTime = playerInfoData.PlayerCreateTime;
			}
		}
	}

	private UGRoleData BuildWebRoleData()
	{
		UGRoleData roleData = UGSDK.roleData;
		string accountId = GetAccountId();
		string text = ((!string.IsNullOrEmpty(loginResult?.channelId)) ? loginResult.channelId : ChannelId);
		UGLoginResult obj = ugLoginResult;
		string text2 = ((obj != null) ? obj.loginName : null);
		if (string.IsNullOrEmpty(text2))
		{
			UGLoginResult obj2 = ugLoginResult;
			text2 = ((obj2 != null) ? obj2.username : null);
		}
		if (string.IsNullOrEmpty(text2))
		{
			text2 = GetUserName();
		}
		UGLoginResult obj3 = ugLoginResult;
		string text3 = ((!string.IsNullOrEmpty((obj3 != null) ? obj3.userID : null)) ? ugLoginResult.userID : roleData.uid);
		roleData.extraData = JsonConvert.SerializeObject((object)new Dictionary<string, string>
		{
			["accountId"] = accountId ?? string.Empty,
			["channelId"] = text ?? string.Empty,
			["loginName"] = text2 ?? string.Empty,
			["ugsdkId"] = text3 ?? string.Empty
		});
		UGWebRoleData uGWebRoleData = new UGWebRoleData();
		((UGRoleData)uGWebRoleData).type = roleData.type;
		((UGRoleData)uGWebRoleData).uid = roleData.uid;
		((UGRoleData)uGWebRoleData).roleID = roleData.roleID;
		((UGRoleData)uGWebRoleData).roleName = roleData.roleName;
		((UGRoleData)uGWebRoleData).roleLevel = roleData.roleLevel;
		((UGRoleData)uGWebRoleData).serverID = roleData.serverID;
		((UGRoleData)uGWebRoleData).serverName = roleData.serverName;
		((UGRoleData)uGWebRoleData).vip = roleData.vip;
		((UGRoleData)uGWebRoleData).createTime = roleData.createTime;
		((UGRoleData)uGWebRoleData).extraData = roleData.extraData;
		uGWebRoleData.accountID = accountId;
		uGWebRoleData.channelID = text;
		uGWebRoleData.loginName = text2;
		uGWebRoleData.ugsdk_id = text3;
		return (UGRoleData)(object)uGWebRoleData;
	}
}
