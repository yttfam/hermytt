#!/bin/bash
set -e

TARGET="x86_64-unknown-linux-musl"
HOST="cali@mista"
SSH_KEY="$HOME/.ssh/cali_net_rsa"
REMOTE_DIR="/opt/hermytt"
TARGET_DIR="$HOME/Developer/perso/ttyfam/target"

echo "Building for $TARGET..."
CARGO_TARGET_X86_64_UNKNOWN_LINUX_MUSL_LINKER=x86_64-linux-musl-gcc \
cargo build --release --target "$TARGET" -p hermytt-server -p pyttch-bridge

echo "Deploying hermytt to $HOST..."
scp -i "$SSH_KEY" "$TARGET_DIR/$TARGET/release/hermytt-server" "$HOST:$REMOTE_DIR/hermytt-server.new"
ssh -i "$SSH_KEY" "$HOST" "mv $REMOTE_DIR/hermytt-server.new $REMOTE_DIR/hermytt-server && sudo systemctl restart hermytt"

echo "Deploying pyttch-bridge to $HOST..."
ssh -i "$SSH_KEY" "$HOST" "sudo mkdir -p /opt/pyttch-bridge /etc/pyttch-bridge && sudo chown cali /opt/pyttch-bridge && sudo chown -R cali:cali /etc/pyttch-bridge"
scp -i "$SSH_KEY" "$TARGET_DIR/$TARGET/release/pyttch-bridge" "$HOST:/opt/pyttch-bridge/pyttch-bridge.new"
scp -i "$SSH_KEY" "$(dirname "$0")/pyttch-bridge/config.example.toml" "$HOST:/tmp/pyttch-bridge.example.toml"
ssh -i "$SSH_KEY" "$HOST" "mv /opt/pyttch-bridge/pyttch-bridge.new /opt/pyttch-bridge/pyttch-bridge && chmod +x /opt/pyttch-bridge/pyttch-bridge && sudo cp /tmp/pyttch-bridge.example.toml /etc/pyttch-bridge/config.example.toml"

# Install systemd unit if not present. Don't auto-enable — needs config first.
ssh -i "$SSH_KEY" "$HOST" "sudo tee /etc/systemd/system/pyttch-bridge.service > /dev/null << 'EOF'
[Unit]
Description=pyttch-bridge — stateless Telegram <-> apytti router
After=hermytt.service network-online.target
Wants=network-online.target

[Service]
Type=simple
User=cali
ExecStart=/opt/pyttch-bridge/pyttch-bridge --config /etc/pyttch-bridge/config.toml
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload"

# Restart if already configured. Otherwise leave inactive — ops will start manually after editing config.
ssh -i "$SSH_KEY" "$HOST" "if [ -f /etc/pyttch-bridge/config.toml ] && sudo systemctl is-enabled pyttch-bridge >/dev/null 2>&1; then sudo systemctl restart pyttch-bridge; fi"

echo "Verifying..."
sleep 2
ssh -i "$SSH_KEY" "$HOST" "sudo systemctl is-active hermytt"
ssh -i "$SSH_KEY" "$HOST" "sudo systemctl is-active pyttch-bridge 2>/dev/null || echo 'pyttch-bridge: inactive (configure /etc/pyttch-bridge/config.toml then: sudo systemctl enable --now pyttch-bridge)'"
echo "Done."
