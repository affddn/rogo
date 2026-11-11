using System;
using System.Collections.Generic;
using FairyGUI;
using FguiExport.Friend;
using Google.Protobuf;
using Proto;
using TEngine;

namespace GameLogic;

public class FriendAddPage : FGUI_FriendAddPage
{
	private const int SubPageRecommend = 0;

	private const int SubPageRequest = 1;

	private readonly List<FriendCommonInfo> _displayAddList = new List<FriendCommonInfo>();

	private readonly List<FriendRequest> _displayRequestList = new List<FriendRequest>();

	private int _subPageIndex;

	public override void OnConstructed()
	{
		base.OnConstructed();
		InitSubTabs();
		InitSearchBar();
		InitLists();
		InitButtons();
		RegisterFriendRequestSubTabRedDot();
		base.GameEventMgrInst.AddEvent(390002, (Action)OnRecommendRefreshed);
		base.GameEventMgrInst.AddEvent(390001, (Action)OnRequestRefreshed);
		base.GameEventMgrInst.AddEvent(390000, (Action)OnFriendListRefreshed);
		int index = ((Singleton<RedDotManager>.Instance.GetRedDotCnt("root/basefunscombo/friend/request") > 0) ? 1 : 0);
		SwitchSubPage(index);
		RefreshFriendCount();
	}

	public override void OnDispose()
	{
		//IL_0029: Unknown result type (might be due to invalid IL or missing references)
		//IL_0033: Expected O, but got Unknown
		//IL_00b1: Unknown result type (might be due to invalid IL or missing references)
		//IL_00bb: Expected O, but got Unknown
		//IL_005f: Unknown result type (might be due to invalid IL or missing references)
		//IL_0069: Expected O, but got Unknown
		//IL_008d: Unknown result type (might be due to invalid IL or missing references)
		//IL_0097: Expected O, but got Unknown
		Singleton<RedDotManager>.Instance.RemoveRedDot("root/basefunscombo/friend/request");
		if (m_subTabGroup != null)
		{
			m_subTabGroup.onClickItem.Remove(new EventCallback1(OnSubTabClick));
		}
		if (m_searchBar != null)
		{
			if (m_searchBar.m_searchBtn != null)
			{
				((GObject)m_searchBar.m_searchBtn).onClick.Remove(new EventCallback0(OnSearchBtnClick));
			}
			if (m_searchBar.m_clearBtn != null)
			{
				((GObject)m_searchBar.m_clearBtn).onClick.Remove(new EventCallback0(OnClearSearchBtnClick));
			}
		}
		if (m_refreshBatchBtn != null)
		{
			((GObject)m_refreshBatchBtn).onClick.Remove(new EventCallback0(OnRefreshBatchBtnClick));
		}
		base.OnDispose();
	}

	private void InitSubTabs()
	{
		//IL_0033: Unknown result type (might be due to invalid IL or missing references)
		//IL_003d: Expected O, but got Unknown
		if (m_subTabGroup != null)
		{
			m_subTabGroup.numItems = 2;
			m_subTabGroup.selectedIndex = 0;
			m_subTabGroup.onClickItem.Add(new EventCallback1(OnSubTabClick));
		}
	}

	private void InitSearchBar()
	{
		//IL_002d: Unknown result type (might be due to invalid IL or missing references)
		//IL_0037: Expected O, but got Unknown
		//IL_005b: Unknown result type (might be due to invalid IL or missing references)
		//IL_0065: Expected O, but got Unknown
		if (m_searchBar != null)
		{
			if (m_searchBar.m_searchBtn != null)
			{
				((GObject)m_searchBar.m_searchBtn).onClick.Add(new EventCallback0(OnSearchBtnClick));
			}
			if (m_searchBar.m_clearBtn != null)
			{
				((GObject)m_searchBar.m_clearBtn).onClick.Add(new EventCallback0(OnClearSearchBtnClick));
			}
		}
	}

	private void InitLists()
	{
		//IL_0020: Unknown result type (might be due to invalid IL or missing references)
		//IL_002a: Expected O, but got Unknown
		//IL_004a: Unknown result type (might be due to invalid IL or missing references)
		//IL_0054: Expected O, but got Unknown
		if (m_addFindList != null)
		{
			m_addFindList.SetVirtual();
			m_addFindList.itemRenderer = new ListItemRenderer(RenderAddItem);
		}
		if (m_requestList != null)
		{
			m_requestList.SetVirtual();
			m_requestList.itemRenderer = new ListItemRenderer(RenderRequestItem);
		}
	}

	private void InitButtons()
	{
		//IL_001a: Unknown result type (might be due to invalid IL or missing references)
		//IL_0024: Expected O, but got Unknown
		if (m_refreshBatchBtn != null)
		{
			((GObject)m_refreshBatchBtn).onClick.Add(new EventCallback0(OnRefreshBatchBtnClick));
		}
	}

	private void RegisterFriendRequestSubTabRedDot()
	{
		if (m_subTabGroup != null && m_subTabGroup.numItems > 1)
		{
			GObject childAt = ((GComponent)m_subTabGroup).GetChildAt(1);
			GComponent val = ((childAt != null) ? childAt.asCom : null);
			if (val != null)
			{
				FriendUtils.EnsureFriendTabRedDotChild(val);
				Singleton<RedDotManager>.Instance.RegisterRedDot("root/basefunscombo/friend/request", val);
			}
		}
	}

	private void OnSubTabClick(EventContext context)
	{
		object obj = context?.data;
		GButton val = (GButton)((obj is GButton) ? obj : null);
		if (val != null)
		{
			int childIndex = ((GComponent)m_subTabGroup).GetChildIndex((GObject)(object)val);
			if (childIndex != _subPageIndex)
			{
				SwitchSubPage(childIndex);
			}
		}
	}

	private void SwitchSubPage(int index)
	{
		if (index == 0 || index == 1)
		{
			_subPageIndex = index;
			if (m_subTabGroup != null)
			{
				m_subTabGroup.selectedIndex = index;
			}
			if (m_subPage != null)
			{
				m_subPage.selectedIndex = index;
			}
			if (_subPageIndex == 0)
			{
				RequestRecommendOrSearch();
				RefreshAddList();
			}
			else
			{
				GameModule.Model.FriendModel.MarkFriendRequestPageViewed();
				RequestFriendRequests();
				RefreshRequestList();
			}
		}
	}

	private void OnSearchBtnClick()
	{
		RequestRecommendOrSearch();
	}

	private void OnClearSearchBtnClick()
	{
		if (m_searchBar?.m_searchInput != null)
		{
			((GObject)m_searchBar.m_searchInput).text = string.Empty;
		}
		GameModule.Model.FriendModel.ClearSearchResults();
		if (_subPageIndex == 0)
		{
			RequestRecommendFriends();
		}
	}

	private void OnRefreshBatchBtnClick()
	{
		if (_subPageIndex == 0)
		{
			RequestRecommendFriends();
			return;
		}
		List<FriendRequest> friendRequests = GameModule.Model.FriendModel.GetFriendRequests();
		if (friendRequests.Count == 0)
		{
			GameModule.UI.OpenToast(LangCfg.GetLang("friend_request_empty"));
			return;
		}
		HandleFriendRequestReq handleFriendRequestReq = new HandleFriendRequestReq
		{
			HandleType = 1u
		};
		for (int i = 0; i < friendRequests.Count; i++)
		{
			long valueOrDefault = (friendRequests[i]?.Player?.PlayerId).GetValueOrDefault();
			if (valueOrDefault > 0)
			{
				handleFriendRequestReq.RequestIds.Add(valueOrDefault);
			}
		}
		GameModule.Net.GameWebSocket.SendMessage(ProtoCmd.HandleFriendRequestReq, (IMessage)(object)handleFriendRequestReq);
	}

	private void RequestRecommendOrSearch()
	{
		FGUI_FriendSearchBar searchBar = m_searchBar;
		object obj;
		if (searchBar == null)
		{
			obj = null;
		}
		else
		{
			GTextInput searchInput = searchBar.m_searchInput;
			obj = ((searchInput == null) ? null : ((GObject)searchInput).text?.Trim());
		}
		if (obj == null)
		{
			obj = string.Empty;
		}
		string text = (string)obj;
		if (string.IsNullOrEmpty(text))
		{
			RequestRecommendFriends();
			return;
		}
		SearchFriendReq searchFriendReq = new SearchFriendReq();
		if (long.TryParse(text, out var result))
		{
			searchFriendReq.PlayerId = result;
		}
		else
		{
			searchFriendReq.Nickname = text;
		}
		GameModule.Net.GameWebSocket.SendMessage(ProtoCmd.SearchFriendReq, (IMessage)(object)searchFriendReq);
	}

	private void RequestRecommendFriends()
	{
		GameModule.Net.GameWebSocket.SendMessage(ProtoCmd.GetRecommendFriendsReq, (IMessage)(object)new GetRecommendFriendsReq());
	}

	private void RequestFriendRequests()
	{
		GameModule.Net.GameWebSocket.SendMessage(ProtoCmd.GetFriendRequestListReq, (IMessage)(object)new GetFriendRequestListReq());
	}

	private void OnRecommendRefreshed()
	{
		if (_subPageIndex == 0)
		{
			RefreshAddList();
		}
	}

	private void OnRequestRefreshed()
	{
		if (_subPageIndex == 1)
		{
			RefreshRequestList();
		}
	}

	private void OnFriendListRefreshed()
	{
		RefreshFriendCount();
		if (_subPageIndex == 0)
		{
			RefreshAddList();
		}
	}

	private void RefreshFriendCount()
	{
		if (m_friendCountTxt != null)
		{
			int count = GameModule.Model.FriendModel.GetFriends().Count;
			((GObject)m_friendCountTxt).text = LangCfg.GetLang("friend_count_fmt", count);
		}
	}

	private void RefreshAddList()
	{
		_displayAddList.Clear();
		FriendModel friendModel = GameModule.Model.FriendModel;
		FGUI_FriendSearchBar searchBar = m_searchBar;
		object obj;
		if (searchBar == null)
		{
			obj = null;
		}
		else
		{
			GTextInput searchInput = searchBar.m_searchInput;
			obj = ((searchInput == null) ? null : ((GObject)searchInput).text?.Trim());
		}
		if (obj == null)
		{
			obj = string.Empty;
		}
		List<FriendCommonInfo> list = (string.IsNullOrEmpty((string?)obj) ? friendModel.GetRecommendFriends() : friendModel.GetSearchResults());
		for (int i = 0; i < list.Count; i++)
		{
			if (list[i]?.BaseInfo != null)
			{
				_displayAddList.Add(list[i]);
			}
		}
		if (m_addFindList != null)
		{
			m_addFindList.numItems = _displayAddList.Count;
		}
		m_isAddFindDefault.selectedIndex = ((_displayAddList.Count == 0) ? 1 : 0);
	}

	private void RefreshRequestList()
	{
		_displayRequestList.Clear();
		List<FriendRequest> friendRequests = GameModule.Model.FriendModel.GetFriendRequests();
		for (int i = 0; i < friendRequests.Count; i++)
		{
			if (friendRequests[i]?.Player != null)
			{
				_displayRequestList.Add(friendRequests[i]);
			}
		}
		if (m_requestList != null)
		{
			m_requestList.numItems = _displayRequestList.Count;
		}
		m_isRequestDefault.selectedIndex = ((_displayRequestList.Count == 0) ? 1 : 0);
	}

	private void RenderAddItem(int index, GObject obj)
	{
		if (index >= 0 && index < _displayAddList.Count)
		{
			if (!(obj is FriendAddItem friendAddItem))
			{
				Log.Error($"FriendAddPage.RenderAddItem() item 为空 index={index}");
				return;
			}
			FriendCommonInfo friendCommonInfo = _displayAddList[index];
			long valueOrDefault = (friendCommonInfo?.BaseInfo?.PlayerId).GetValueOrDefault();
			FriendModel friendModel = GameModule.Model.FriendModel;
			bool canAdd = valueOrDefault > 0 && !friendModel.IsFriend(valueOrDefault) && !friendModel.IsBlacklisted(valueOrDefault);
			friendAddItem.UpdateData(friendCommonInfo, canAdd, OnAddFriendClick);
		}
	}

	private void RenderRequestItem(int index, GObject obj)
	{
		if (index >= 0 && index < _displayRequestList.Count)
		{
			if (!(obj is FriendRequestItem friendRequestItem))
			{
				Log.Error($"FriendAddPage.RenderRequestItem() item 为空 index={index}");
			}
			else
			{
				friendRequestItem.UpdateData(_displayRequestList[index], OnHandleRequestClick);
			}
		}
	}

	private void OnAddFriendClick(long playerId)
	{
		if (playerId > 0)
		{
			SendFriendRequestReq msg = new SendFriendRequestReq
			{
				TargetPlayerId = playerId
			};
			GameModule.Net.GameWebSocket.SendMessage(ProtoCmd.SendFriendRequestReq, (IMessage)(object)msg);
		}
	}

	private void OnHandleRequestClick(long playerId, uint handleType)
	{
		if (playerId > 0)
		{
			HandleFriendRequestReq handleFriendRequestReq = new HandleFriendRequestReq
			{
				HandleType = handleType
			};
			handleFriendRequestReq.RequestIds.Add(playerId);
			GameModule.Net.GameWebSocket.SendMessage(ProtoCmd.HandleFriendRequestReq, (IMessage)(object)handleFriendRequestReq);
		}
	}
}
