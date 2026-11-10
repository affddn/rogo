package device

import "testing"

func TestParseTopActivity(t *testing.T) {
	for line, want := range map[string]string{
		"    topResumedActivity=ActivityRecord{b8890ef u0 com.ggv.rogosea.aos/com.google.android.gms.ads.AdActivity t33}": "com.ggv.rogosea.aos/com.google.android.gms.ads.AdActivity",
		"topResumedActivity=ActivityRecord{1c2 u0 com.ggv.rogosea.aos/com.ug.sdk.bridge.unity.UGUnityActivity t33}":       "com.ggv.rogosea.aos/com.ug.sdk.bridge.unity.UGUnityActivity",
		"": "",
	} {
		if got := parseTopActivity(line); got != want {
			t.Errorf("%q: got %q, want %q", line, got, want)
		}
	}
}
