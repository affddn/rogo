using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using OctopusSDK.bean;
using UG;

namespace GameLogic;

public interface ISdk
{
	LoginResult GetLoginResult();

	string GetToken();

	string GetAccountId();

	string GetChannelUserId();

	string GetUserName();

	UGAccountType GetAccountType();

	bool IsGuestLogin();

	void Init();

	void Login(Action successCallback);

	void Logout();

	void ClearLoginState();

	void DeleteAccount();

	void ShowUserCenter();

	void ShowCustomServiceCenter();

	void ShowReviewFlow();

	void OpenWebViewForUrl(string url);

	void Pay(UGOrder order, Action<UGOrder> onPaySuccess, Action<string> onPayFailed);

	void SubmitEnterGame();

	void SubmitCreateRole();

	void SubmitLevelUp();

	void SubmitExitGame();

	void SubmitEventData(string eventName, Dictionary<string, object> data = null);

	void SubmitEventData(TrackEvent trackEvent, Dictionary<string, object> data = null);

	void TrackOctopus(string eventName, Dictionary<string, object> data = null);

	Task<VersionDetailResult> CheckVersion(string versionKey = "dev", string version = null);

	Task<NoticeLoginV2Result> GetNotice();

	Task<AreaServerResult> GetServerList();

	void FetchProducts();

	UGProduct GetProduct(string productId);

	int GetProductPrice(string productId);

	void UpdateRoleInfo(UGSdkRoleDataChangeType type, string roleId, string roleName, string roleLevel, string serverId = "1001", string serverName = "dev-1");

	void LoadAd(AdType type);

	void LoadAllAds();

	void ShowAd(AdType type, OnAdPlayComplete onAdPlayComplete);

	void Translate(string text, Action<TranslateResult> onSuccess, Action<string> onFailed);

	void ReportWarning(string message, Dictionary<string, object> extra = null);

	void ReportError(string message, Dictionary<string, object> extra = null);

	void ReportException(string message, string stackTrace = null, Dictionary<string, object> extra = null);

	void SetOnPushMessageCallback(Action<string> onPushMessageResult);
}
