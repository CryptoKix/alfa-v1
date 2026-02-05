#!/bin/bash
# Generate Python gRPC stubs from Yellowstone proto definitions.
# Usage: cd backend/proto && bash generate.sh
#
# Requires: pip install grpcio-tools

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUT_DIR="$SCRIPT_DIR/../generated"

mkdir -p "$OUT_DIR"

python3 -m grpc_tools.protoc \
    -I"$SCRIPT_DIR" \
    --python_out="$OUT_DIR" \
    --grpc_python_out="$OUT_DIR" \
    "$SCRIPT_DIR/solana-storage.proto" \
    "$SCRIPT_DIR/geyser.proto"

touch "$OUT_DIR/__init__.py"

# Fix imports to use package-relative paths (generated/ is a package)
sed -i 's/^import solana_storage_pb2/from generated import solana_storage_pb2/' "$OUT_DIR/geyser_pb2.py"
sed -i 's/^from solana_storage_pb2/from generated.solana_storage_pb2/' "$OUT_DIR/geyser_pb2.py"
sed -i 's/^import geyser_pb2/from generated import geyser_pb2/' "$OUT_DIR/geyser_pb2_grpc.py"

echo "Generated Python stubs in $OUT_DIR:"
ls -la "$OUT_DIR"/*.py
