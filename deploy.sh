#!/bin/bash
set -e

TARGET="x86_64-unknown-linux-musl"
HOST="cali@mista"
SSH_KEY="$HOME/.ssh/cali_net_rsa"
REMOTE_DIR="/opt/hermytt"

echo "Building for $TARGET..."
CARGO_TARGET_X86_64_UNKNOWN_LINUX_MUSL_LINKER=x86_64-linux-musl-gcc \
cargo build --release --target "$TARGET"

echo "Deploying to $HOST..."
scp -i "$SSH_KEY" "target/$TARGET/release/hermytt-server" "$HOST:$REMOTE_DIR/hermytt-server.new"
ssh -i "$SSH_KEY" "$HOST" "mv $REMOTE_DIR/hermytt-server.new $REMOTE_DIR/hermytt-server && sudo systemctl restart hermytt"

echo "Verifying..."
sleep 2
ssh -i "$SSH_KEY" "$HOST" "sudo systemctl is-active hermytt"
echo "Done."
