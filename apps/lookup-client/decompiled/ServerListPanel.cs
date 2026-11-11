using System;
using System.Collections.Generic;
using FairyGUI;
using FguiExport.LoginView;
using Proto;

namespace GameLogic;

public class ServerListPanel : FGUI_ServerListPanel
{
	private const int RangeSize = 10;

	private const int ServerIndexMod = 1000;

	private readonly Dictionary<int, List<Proto.ServerInfo>> rangeServerMap = new Dictionary<int, List<Proto.ServerInfo>>();

	private readonly List<int> rangeKeys = new List<int>();

	private List<Proto.ServerInfo> currentRangeServers = new List<Proto.ServerInfo>();

	private Action<Proto.ServerInfo> onServerSelected;

	public override void OnConstructed()
	{
		//IL_0018: Unknown result type (might be due to invalid IL or missing references)
		//IL_0022: Expected O, but got Unknown
		//IL_0034: Unknown result type (might be due to invalid IL or missing references)
		//IL_003e: Expected O, but got Unknown
		base.OnConstructed();
		m_rangeList.onClickItem.Add(new EventCallback1(OnRangeClick));
		m_serverList.onClickItem.Add(new EventCallback1(OnServerClick));
	}

	public void SetSelectCallback(Action<Proto.ServerInfo> callback)
	{
		onServerSelected = callback;
	}

	public void RefreshServers()
	{
		BuildServerRangeData();
		m_rangeList.numItems = rangeKeys.Count;
		for (int i = 0; i < rangeKeys.Count; i++)
		{
			int rangeStart = rangeKeys[i];
			GButton asButton = ((GComponent)m_rangeList).GetChildAt(i).asButton;
			FillRangeItem(asButton, rangeStart);
		}
		if (rangeKeys.Count == 0)
		{
			currentRangeServers = new List<Proto.ServerInfo>();
		}
		else
		{
			int num = rangeKeys[0];
			int selectedIndex = 0;
			for (int j = 1; j < rangeKeys.Count; j++)
			{
				if (rangeKeys[j] > num)
				{
					num = rangeKeys[j];
					selectedIndex = j;
				}
			}
			m_rangeList.selectedIndex = selectedIndex;
			currentRangeServers = rangeServerMap[num];
		}
		RefreshRangeServerList();
	}

	private void OnRangeClick(EventContext context)
	{
		if (context == null)
		{
			return;
		}
		object data = context.data;
		GObject val = (GObject)((data is GObject) ? data : null);
		if (val == null)
		{
			return;
		}
		int childIndex = ((GComponent)m_rangeList).GetChildIndex(val);
		if (childIndex >= 0 && childIndex < rangeKeys.Count)
		{
			int key = rangeKeys[childIndex];
			if (rangeServerMap.TryGetValue(key, out var value))
			{
				currentRangeServers = value;
				m_rangeList.selectedIndex = childIndex;
				RefreshRangeServerList();
			}
		}
	}

	private void OnServerClick(EventContext context)
	{
		if (context == null)
		{
			return;
		}
		object data = context.data;
		GObject val = (GObject)((data is GObject) ? data : null);
		if (val != null)
		{
			int childIndex = ((GComponent)m_serverList).GetChildIndex(val);
			if (childIndex >= 0 && childIndex < currentRangeServers.Count && onServerSelected != null)
			{
				onServerSelected(currentRangeServers[childIndex]);
			}
		}
	}

	private void BuildServerRangeData()
	{
		rangeServerMap.Clear();
		rangeKeys.Clear();
		IReadOnlyList<Proto.ServerInfo> allServers = GameModule.Model.ServerModel.AllServers;
		for (int i = 0; i < allServers.Count; i++)
		{
			Proto.ServerInfo serverInfo = allServers[i];
			int rangeStart = GetRangeStart(GetServerIdx(serverInfo.ServerId));
			if (!rangeServerMap.TryGetValue(rangeStart, out var value))
			{
				value = new List<Proto.ServerInfo>();
				rangeServerMap.Add(rangeStart, value);
			}
			value.Add(serverInfo);
		}
		foreach (KeyValuePair<int, List<Proto.ServerInfo>> item in rangeServerMap)
		{
			item.Value.Sort((Proto.ServerInfo left, Proto.ServerInfo right) => GetServerIdx(right.ServerId).CompareTo(GetServerIdx(left.ServerId)));
			rangeKeys.Add(item.Key);
		}
		rangeKeys.Sort((int left, int right) => right.CompareTo(left));
	}

	private void FillRangeItem(GButton item, int rangeStart)
	{
		int num = NormalizeServerIdx(rangeStart);
		int num2 = num + 10 - 1;
		((GObject)((GComponent)item).GetChild("title").asTextField).text = LangCfg.GetLang("server_list_range_fmt", num, num2);
	}

	private void RefreshRangeServerList()
	{
		m_serverList.numItems = currentRangeServers.Count;
		for (int i = 0; i < currentRangeServers.Count; i++)
		{
			Proto.ServerInfo server = currentRangeServers[i];
			ServerPanelItemHelper.FillServerItem(((GComponent)m_serverList).GetChildAt(i).asButton, server);
		}
	}

	private static int GetRangeStart(int serverIdx)
	{
		if (serverIdx <= 0)
		{
			return 1;
		}
		return (int)((long)((serverIdx - 1) / 10) * 10L + 1);
	}

	private static int GetServerIdx(long serverId)
	{
		int num = (int)(serverId % 1000);
		if (num <= 0)
		{
			return 1;
		}
		return num;
	}

	private static int NormalizeServerIdx(int idx)
	{
		if (idx <= 0)
		{
			return 1;
		}
		if (idx <= 1000)
		{
			return idx;
		}
		return (idx - 1) % 1000 + 1;
	}
}
