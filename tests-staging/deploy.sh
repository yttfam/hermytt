#!/bin/bash
set -e

# Deploy hermytt + shytti + grytti to staging box for integration tests.
# Usage: ./tests-staging/deploy.sh

SSH_KEY="$HOME/.ssh/cali_net_rsa"
HOST="cali@10.10.0.14"
SSH="ssh -i $SSH_KEY $HOST"
SCP="scp -i $SSH_KEY"
TARGET="x86_64-unknown-linux-musl"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"

echo "=== Building all binaries ==="
cd "$ROOT"
CARGO_TARGET_X86_64_UNKNOWN_LINUX_MUSL_LINKER=x86_64-linux-musl-gcc \
  cargo build --release --target "$TARGET"

SHYTTI_DIR="$HOME/Developer/perso/shytti"
GRYTTI_DIR="$HOME/Developer/perso/grytti"

# Build shytti + grytti if their source dirs exist
if [ -d "$SHYTTI_DIR" ]; then
  echo "building shytti..."
  cd "$SHYTTI_DIR"
  CARGO_TARGET_X86_64_UNKNOWN_LINUX_MUSL_LINKER=x86_64-linux-musl-gcc \
    cargo build --release --target "$TARGET"
fi

if [ -d "$GRYTTI_DIR" ]; then
  echo "building grytti..."
  cd "$GRYTTI_DIR"
  CARGO_TARGET_X86_64_UNKNOWN_LINUX_MUSL_LINKER=x86_64-linux-musl-gcc \
    cargo build --release --target "$TARGET"
fi

cd "$ROOT"

echo "=== Creating directories on staging ==="
$SSH "sudo mkdir -p /opt/hermytt/recordings /opt/shytti /opt/grytti && sudo chown -R cali /opt/hermytt /opt/shytti /opt/grytti"

echo "=== Stopping existing services ==="
$SSH "sudo systemctl stop hermytt-staging shytti-staging grytti-staging 2>/dev/null || true"

echo "=== Uploading binaries + configs ==="
$SCP "target/$TARGET/release/hermytt-server" "$HOST:/opt/hermytt/hermytt-server"
$SCP "$SHYTTI_DIR/target/$TARGET/release/shytti" "$HOST:/opt/shytti/shytti"
$SCP "$GRYTTI_DIR/target/$TARGET/release/grytti" "$HOST:/opt/grytti/grytti"
$SCP "$SCRIPT_DIR/staging.toml" "$HOST:/opt/hermytt/hermytt.toml"
$SCP "$SCRIPT_DIR/shytti.toml" "$HOST:/opt/shytti/shytti.toml"
$SCP "$SCRIPT_DIR/grytti.toml" "$HOST:/opt/grytti/grytti.toml"

$SSH "chmod +x /opt/hermytt/hermytt-server /opt/shytti/shytti /opt/grytti/grytti"

echo "=== Installing systemd services ==="
$SSH 'sudo tee /etc/systemd/system/hermytt-staging.service > /dev/null << EOF
[Unit]
Description=hermytt staging
After=network.target

[Service]
Type=simple
User=cali
ExecStart=/opt/hermytt/hermytt-server start -c /opt/hermytt/hermytt.toml -b 0.0.0.0
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
EOF'

$SSH 'sudo tee /etc/systemd/system/shytti-staging.service > /dev/null << EOF
[Unit]
Description=shytti staging
After=hermytt-staging.service
Requires=hermytt-staging.service

[Service]
Type=simple
User=cali
ExecStart=/opt/shytti/shytti daemon -c /opt/shytti/shytti.toml
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
EOF'

$SSH 'sudo tee /etc/systemd/system/grytti-staging.service > /dev/null << EOF
[Unit]
Description=grytti staging
After=hermytt-staging.service
Requires=hermytt-staging.service

[Service]
Type=simple
User=cali
ExecStart=/opt/grytti/grytti /opt/grytti/grytti.toml
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
EOF'

$SSH "sudo systemctl daemon-reload"

echo "=== Starting services ==="
$SSH "sudo systemctl enable hermytt-staging shytti-staging grytti-staging"
$SSH "sudo systemctl start hermytt-staging"
sleep 3
$SSH "sudo systemctl start shytti-staging"
sleep 2
$SSH "sudo systemctl start grytti-staging"
sleep 3

echo "=== Verifying ==="
$SSH "sudo systemctl is-active hermytt-staging shytti-staging grytti-staging"

echo ""
echo "=== Staging deployed ==="
echo "hermytt: http://10.10.0.14:7777"
echo "shytti:  local Mode 1 on staging"
echo "grytti:  http://10.10.0.14:7780"
