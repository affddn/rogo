package vmos

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// Vector from the VMOS signing docs (server/example.html).
func TestSignMatchesDocumentedExample(t *testing.T) {
	got := Sign("9cucpjoyn4xxmkhj3q9el3ce", "1747555200", "/vcpcloud/api/padApi/padInfo", `{"padCode":"AC32010601132"}`)
	if want := "483a4999d303307ef1b8b078b51e03fa0556547729c8a3c1470d2caf63e5f350"; got != want {
		t.Fatalf("sign = %s, want %s", got, want)
	}
}

func TestParseCommand(t *testing.T) {
	cases := map[string]Forward{
		"ssh -oStrictHostKeyChecking=accept-new s@129.227.56.194 -p 1824 -L 61644:localhost:1 -Nf": {
			User: "s", Host: "129.227.56.194", Port: 1824, Remote: "localhost:1"},
		"ssh -oHostKeyAlgorithms=+ssh-rsa 10.255.3.2_001_1736922765389@156.59.80.166 -p 1824 -L 8572:adb-proxy:53728 -Nf": {
			User: "10.255.3.2_001_1736922765389", Host: "156.59.80.166", Port: 1824, Remote: "adb-proxy:53728"},
	}
	for cmd, want := range cases {
		got, err := ParseCommand(cmd)
		if err != nil || got != want {
			t.Errorf("ParseCommand(%q) = %+v, %v; want %+v", cmd, got, err, want)
		}
	}
	if _, err := ParseCommand("adb connect localhost:5555"); err == nil {
		t.Error("non-ssh command parsed")
	}
}

func TestADBInfoSignsAndDecodes(t *testing.T) {
	now := time.Unix(1747555200, 0)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		if r.Header.Get("X-Access-Key") != "ak" || r.Header.Get("X-Timestamp") != "1747555200" ||
			r.Header.Get("X-Sign") != Sign("sk", "1747555200", r.URL.Path, string(body)) {
			json.NewEncoder(w).Encode(map[string]any{"code": 2019, "msg": "bad sign"})
			return
		}
		var in map[string]any
		_ = json.Unmarshal(body, &in)
		if in["padCode"] != "APP6AL9EDCDYK2NE" || in["expireMinutes"].(float64) != 10080 {
			t.Errorf("unexpected body %s", body)
		}
		json.NewEncoder(w).Encode(map[string]any{"code": 200, "msg": "success", "data": map[string]any{
			"padCode": "APP6AL9EDCDYK2NE", "enable": true, "key": "k==", "expireTime": "2026-11-10 17:26:07",
			"command": "ssh s@129.227.56.194 -p 1824 -L 61644:localhost:1 -Nf"}})
	}))
	defer srv.Close()
	c := NewClient("ak", "sk")
	c.BaseURL, c.now = srv.URL, func() time.Time { return now }
	a, err := c.ADBInfo(context.Background(), "APP6AL9EDCDYK2NE", 30*24*time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	exp, err := a.Expires()
	if err != nil || exp.UTC() != time.Date(2026, 11, 10, 9, 26, 7, 0, time.UTC) {
		t.Fatalf("expires %v %v", exp, err)
	}
}

func TestCloseADBDisablesTheTunnel(t *testing.T) {
	var got map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(body, &got)
		json.NewEncoder(w).Encode(map[string]any{"code": 200, "msg": "success"})
	}))
	defer srv.Close()
	c := NewClient("ak", "sk")
	c.BaseURL = srv.URL
	if err := c.CloseADB(context.Background(), "APP6AL9EDCDYK2NE"); err != nil {
		t.Fatal(err)
	}
	if got["padCode"] != "APP6AL9EDCDYK2NE" || got["enable"] != false {
		t.Fatalf("close sent %v", got)
	}
}
