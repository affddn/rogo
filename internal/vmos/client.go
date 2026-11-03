// Package vmos talks to the VMOS Cloud OpenAPI and keeps an adb tunnel open
// to a cloud phone without the ssh binary or a password prompt.
package vmos

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"time"
)

const BaseURL = "https://api.vmoscloud.com"

// Client signs requests with the account's API key pair (console:
// Developer -> API).
type Client struct {
	AccessKey string
	SecretKey string
	BaseURL   string
	HTTP      *http.Client
	now       func() time.Time
}

func NewClient(ak, sk string) *Client {
	return &Client{AccessKey: ak, SecretKey: sk, BaseURL: BaseURL, HTTP: &http.Client{Timeout: 30 * time.Second}, now: time.Now}
}

// Sign implements the V2 scheme: lowercase hex SHA-256 of SK + ts + path + body.
func Sign(sk, ts, path, body string) string {
	sum := sha256.Sum256([]byte(sk + ts + path + body))
	return hex.EncodeToString(sum[:])
}

type envelope struct {
	Code int             `json:"code"`
	Msg  string          `json:"msg"`
	Data json.RawMessage `json:"data"`
}

func (c *Client) post(ctx context.Context, path string, in, out any) error {
	body, err := json.Marshal(in)
	if err != nil {
		return err
	}
	ts := strconv.FormatInt(c.now().Unix(), 10)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.BaseURL+path, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("X-Access-Key", c.AccessKey)
	req.Header.Set("X-Timestamp", ts)
	req.Header.Set("X-Sign", Sign(c.SecretKey, ts, path, string(body)))
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}
	var env envelope
	if err := json.Unmarshal(raw, &env); err != nil {
		return fmt.Errorf("%s: HTTP %d: %.200s", path, resp.StatusCode, raw)
	}
	if env.Code != 200 {
		return fmt.Errorf("%s: code %d: %s", path, env.Code, env.Msg)
	}
	if out != nil {
		return json.Unmarshal(env.Data, out)
	}
	return nil
}

// ADB is a cloud phone's adb tunnel: an ssh port-forward guarded by Key.
type ADB struct {
	PadCode    string `json:"padCode"`
	Command    string `json:"command"`
	Key        string `json:"key"`
	ExpireTime string `json:"expireTime"`
	Enable     bool   `json:"enable"`
}

// Expires parses ExpireTime, which the API gives in the server's GMT+8 clock.
func (a ADB) Expires() (time.Time, error) {
	return time.ParseInLocation("2006-01-02 15:04:05", a.ExpireTime, time.FixedZone("GMT+8", 8*3600))
}

// EnableADB turns on the instance's adb service (needed once per instance).
func (c *Client) EnableADB(ctx context.Context, padCode string) error {
	return c.post(ctx, "/vcpcloud/api/padApi/openOnlineAdb",
		map[string]any{"padCodes": []string{padCode}, "openStatus": 1}, nil)
}

// ADBInfo opens (or extends) the adb tunnel for valid minutes, 1440..10080.
func (c *Client) ADBInfo(ctx context.Context, padCode string, valid time.Duration) (*ADB, error) {
	mins := min(max(int(valid.Minutes()), 1440), 10080)
	var a ADB
	err := c.post(ctx, "/vcpcloud/api/padApi/adb",
		map[string]any{"padCode": padCode, "enable": true, "expireMinutes": mins}, &a)
	if err != nil {
		return nil, err
	}
	if a.Key == "" || a.Command == "" {
		if err := c.EnableADB(ctx, padCode); err != nil {
			return nil, fmt.Errorf("enable adb: %w", err)
		}
		if err := c.post(ctx, "/vcpcloud/api/padApi/adb",
			map[string]any{"padCode": padCode, "enable": true, "expireMinutes": mins}, &a); err != nil {
			return nil, err
		}
	}
	if a.Key == "" || a.Command == "" {
		return nil, fmt.Errorf("adb info for %s incomplete", padCode)
	}
	return &a, nil
}
