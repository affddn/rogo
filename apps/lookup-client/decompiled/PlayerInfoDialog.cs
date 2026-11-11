using System;
using FairyGUI;
using FguiExport.Player;
using Google.Protobuf;
using Proto;
using TEngine;

namespace GameLogic;

public class PlayerInfoDialog : FGUI_PlayerInfoDialog
{
	private long _targetPlayerId;

	private PlayerInfoPanel _infoPanel;

	private PlayerAttrPanel _attrPanel;

	private PlayerDetailInfo _cachedDetailInfo;

	private PlayerRelation _cachedRelation;

	public override void OnInit()
	{
		//IL_0018: Unknown result type (might be due to invalid IL or missing references)
		//IL_0022: Expected O, but got Unknown
		base.OnInit();
		m_tabGroup.onClickItem.Add(new EventCallback1(OnClickTab));
		m_viewPage.selectedIndex = 0;
		m_tabGroup.selectedIndex = 0;
		LoadCurrentPage();
		base.GameEventMgrInst.AddEvent<PlayerDetailInfoEventData>(390004, (Action<PlayerDetailInfoEventData>)OnPlayerDetailInfoRefreshed);
		base.GameEventMgrInst.AddEvent(390000, (Action)OnFriendModelRelationChanged);
		base.GameEventMgrInst.AddEvent(390003, (Action)OnFriendModelRelationChanged);
		RequestDetailByUIData(base.UIData);
	}

	public override void OnUIDataChanged(IUIData oldData, IUIData newData)
	{
		base.OnUIDataChanged(oldData, newData);
	}

	public override void OnCallDispose()
	{
		RankDialog.NotifyPlayerInfoDialogClosed();
		base.OnCallDispose();
	}

	public override void OnDispose()
	{
		//IL_001a: Unknown result type (might be due to invalid IL or missing references)
		//IL_0024: Expected O, but got Unknown
		if (m_tabGroup != null)
		{
			m_tabGroup.onClickItem.Remove(new EventCallback1(OnClickTab));
		}
		_infoPanel = null;
		_attrPanel = null;
		_targetPlayerId = 0L;
		_cachedDetailInfo = null;
		_cachedRelation = null;
		base.OnDispose();
	}

	private void RequestDetailByUIData(IUIData uiData)
	{
		_targetPlayerId = ParseTargetPlayerId(uiData);
		if (_targetPlayerId <= 0)
		{
			Log.Error($"目标玩家ID无效: {_targetPlayerId}");
			return;
		}
		if (_infoPanel != null)
		{
			_infoPanel.SetTargetPlayerId(_targetPlayerId);
		}
		QueryTargetPlayerDetail(_targetPlayerId);
	}

	private void OnClickTab(EventContext context)
	{
		object data = context.data;
		GButton val = (GButton)((data is GButton) ? data : null);
		if (val != null)
		{
			int childIndex = ((GComponent)m_tabGroup).GetChildIndex((GObject)(object)val);
			if (childIndex >= 0)
			{
				m_tabGroup.selectedIndex = childIndex;
				m_viewPage.selectedIndex = childIndex;
				LoadCurrentPage();
			}
		}
	}

	private void LoadCurrentPage()
	{
		if (m_viewPage.selectedIndex == 0)
		{
			m_contentLoader.url = "ui://9lts0ehtbeeejk";
			_infoPanel = m_contentLoader.component as PlayerInfoPanel;
			_attrPanel = null;
			if (_infoPanel != null)
			{
				_infoPanel.SetActionCallbacks(OnClickCopyPlayerId, OnClickChat);
				_infoPanel.SetTargetPlayerId(_targetPlayerId);
				ApplyCachedPlayerInfo();
			}
		}
		else
		{
			m_contentLoader.url = "ui://9lts0ehtn2r60";
			_infoPanel = null;
			_attrPanel = m_contentLoader.component as PlayerAttrPanel;
			ApplyCachedPlayerInfo();
		}
	}

	private void QueryTargetPlayerDetail(long playerId)
	{
		if (PlayerUtils.ShouldSkipPlayerDetailQuery(playerId))
		{
			SyncCachedRelationFromFriendModel();
			ApplyCachedPlayerInfo();
		}
		else
		{
			QueryPlayerDetailInfoReq msg = new QueryPlayerDetailInfoReq
			{
				PlayerId = playerId
			};
			GameModule.Net.GameWebSocket.SendMessage(ProtoCmd.QueryPlayerDetailInfoReq, (IMessage)(object)msg);
		}
	}

	private void OnPlayerDetailInfoRefreshed(PlayerDetailInfoEventData data)
	{
		if (data != null && data.PlayerId == _targetPlayerId)
		{
			_cachedRelation = data.Relation;
			_cachedDetailInfo = data.PlayerDetailInfo;
			ApplyCachedPlayerInfo();
		}
	}

	private void OnFriendModelRelationChanged()
	{
		if (_targetPlayerId > 0)
		{
			SyncCachedRelationFromFriendModel();
			ApplyCachedPlayerInfo();
		}
	}

	private void SyncCachedRelationFromFriendModel()
	{
		if (_targetPlayerId > 0)
		{
			FriendModel friendModel = GameModule.Model.FriendModel;
			if (_cachedRelation == null)
			{
				_cachedRelation = new PlayerRelation();
			}
			_cachedRelation.IsFriend = friendModel.IsFriend(_targetPlayerId);
			_cachedRelation.IsBlacklist = friendModel.IsBlacklisted(_targetPlayerId);
		}
	}

	private void ApplyCachedPlayerInfo()
	{
		if (_infoPanel != null)
		{
			_infoPanel.SetRelation(_cachedRelation);
			_infoPanel.SetPlayerDetail(_cachedDetailInfo);
		}
		if (_attrPanel != null)
		{
			_attrPanel.SetPlayerDetail(_cachedDetailInfo);
		}
	}

	private void OnClickChat()
	{
		if (_targetPlayerId > 0 && Singleton<FunctionManager>.Instance.IsFunctionOpen(11))
		{
			string privateTargetName = string.Empty;
			if (_cachedDetailInfo != null && _cachedDetailInfo.PlayerInfo != null)
			{
				privateTargetName = _cachedDetailInfo.PlayerInfo.Nickname;
			}
			SimplePlayer privateTargetSimplePlayer = _cachedDetailInfo?.PlayerInfo?.Clone();
			GameModule.UI.OpenDialog(EnumDialog.ChatDialog, new NormalUIData
			{
				data = new ChatDialog.ChatDialogOpenData
				{
					OpenInvitePage = false,
					ChannelType = ChatType.Private,
					PrivateTargetPlayerId = _targetPlayerId,
					PrivateTargetName = privateTargetName,
					PrivateTargetSimplePlayer = privateTargetSimplePlayer
				}
			});
		}
	}

	private void OnClickCopyPlayerId()
	{
		_ = _targetPlayerId;
		_ = 0;
	}

	private static long ParseTargetPlayerId(IUIData uiData)
	{
		if (!(uiData is NormalUIData { data: not null, data: var data } normalUIData))
		{
			return 0L;
		}
		if (data is long)
		{
			return (long)data;
		}
		if (normalUIData.data is int num)
		{
			return num;
		}
		return 0L;
	}
}
