ROOT := $(abspath .)

.PHONY: build test linux install-mac uninstall-mac logs

build:
	go build -o bin/rgo ./cmd/rgo

test:
	go vet ./... && go test ./...

# static binary for an arm64 VPS (Oracle Ampere, Hetzner CAX, Graviton)
linux:
	CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -trimpath -ldflags='-s -w' -o bin/rgo-linux-arm64 ./cmd/rgo

install-mac: build
	mkdir -p data captures ~/Library/LaunchAgents
	sed 's#__ROOT__#$(ROOT)#g' deploy/com.affddn.rgo.plist > ~/Library/LaunchAgents/com.affddn.rgo.plist
	launchctl bootout gui/$$(id -u)/com.affddn.rgo 2>/dev/null || true
	launchctl bootstrap gui/$$(id -u) ~/Library/LaunchAgents/com.affddn.rgo.plist

uninstall-mac:
	launchctl bootout gui/$$(id -u)/com.affddn.rgo 2>/dev/null || true
	rm -f ~/Library/LaunchAgents/com.affddn.rgo.plist

logs:
	tail -f captures/run.log
