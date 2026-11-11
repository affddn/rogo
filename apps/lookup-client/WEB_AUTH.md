# Can the web guide sign in from scratch?

**Not verified for our origin.** Gravity offers Google sign-in for its own SEA
top-up site. That is not evidence that our React app can receive an Octopus
game session. Connect Rogo uses a fresh **VMOS-issued** session instead; see
[session extraction and gateway verification](FINDINGS.md#extract-a-session-from-your-own-vmos-sign-in).

### What we actually tested (10 Nov 2026)

- **Publisher web sign-in entry:** opened the [SEA Official Top-up Center](https://rogotopup.gnjoyglobal.com/sea/topup)
  in a new signed-out Chrome profile and clicked its Google icon. The store's
  `/api/oauth/render/19/google` led to Google's authorization-code flow. The
  request specified `redirect_uri=https://rogotopup.gnjoyglobal.com/redirect`,
  scopes `openid email profile`, and a state parameter. There was no PKCE
  challenge on that observed request. The test intercepted navigation **before
  consent**: no account selected, code obtained, purchase initiated, or game
  token requested. This confirms which callback the storefront uses, not its
  server's internal token handling.
- **Octopus network policy:** one unauthenticated CORS `OPTIONS` request to the
  SEA `/account/login/v2` endpoint with origin `http://127.0.0.1:5174` got HTTP
  200, reflected that origin, and allowed POST and the `content-type` header.
  No login POST was made in that test. Preflight allows a browser to send a
  request; it does not issue a valid SDK credential or waive request signing.
- **Game transport:** a separate clean-Chrome probe from that origin could
  read the version service's public realm-discovery response and open the
  realm's WebSocket (101). No authenticated game message was sent from that
  browser. The [verified standalone gateway login](FINDINGS.md#check-one-game-login)
  started with a publisher session from the official Android app.

### What's missing

The [SEA client's callback](decompiled/UGSdkImp.cs#L449) receives the native
UG SDK's user ID/token. Its [Octopus exchange](decompiled/UGSdkImp.cs#L688)
uses those values in the publisher-signed request; the resulting Octopus
`profileId` and `token` are the gateway credentials. A Google ID token for
**our** web client is a different credential, with an audience that must
match its intended client. [Google's token verification guide](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token)
and [redirect URI requirements](https://developers.google.com/identity/protocols/oauth2/web-server#redirect-uri-validation)
explain why registering a guide login or swapping the store's return URL isn't
a substitute for a publisher exchange.

The public pages and local client inspected here did **not** establish a
developer registration, game scope, or consent callback that returns an
Octopus game session to the guide. This is not a claim that no partner API
exists. A server-side proxy also would not solve issuance.

### What would complete a browser-only test

Obtain a publisher-registered client and redirect for an origin we control,
and a documented, permitted game-session grant (or read-only character API).
With a test account, complete interactive consent on the publisher/Google
origin, verify the callback as documented (including state, PKCE or nonce
where applicable), and exchange the result using the registered backend.
For a **game session** grant, verify the correlated `4002` response and the
signed-in character snapshot, not just a Google identity or storefront cookie.
Until then, use Connect Rogo; don't paste tokens into the browser, reuse the
store's OAuth client identity or ship APK signing secrets.
