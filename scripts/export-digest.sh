#!/usr/bin/env bash
# Usage: [LANE_MARKER=''] [EXPORT_PORT=18787] scripts/export-digest.sh /absolute/path/index.html
# The parent directory must exist outside this checkout. Existing output is replaced
# only after a successful fetch. An explicit empty marker overrides the private .env.
set -euo pipefail
umask 077

fail() { printf '%s\n' "$1" >&2; exit 1; }
[[ $# == 1 ]] || fail 'Usage: export-digest.sh /absolute/output/path.html'
repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
cd -- "$repo"
command -v node >/dev/null || fail 'Node.js is required.'
command -v curl >/dev/null || fail 'curl is required.'
port=${EXPORT_PORT:-18787}
[[ $port =~ ^[0-9]+$ && ${#port} -le 5 ]] || fail 'EXPORT_PORT must be an integer from 1 to 65535.'
(( 10#$port >= 1 && 10#$port <= 65535 )) || fail 'EXPORT_PORT must be an integer from 1 to 65535.'
port=$((10#$port))

output=$(node --input-type=module - "$1" "$repo" <<'NODE'
import { realpathSync, lstatSync } from 'node:fs';
import { isAbsolute, dirname, basename, join, relative, sep } from 'node:path';
const [requested, repo] = process.argv.slice(2);
try {
  if (!isAbsolute(requested)) throw new Error();
  const output = join(realpathSync(dirname(requested)), basename(requested));
  const rel = relative(repo, output);
  if (rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel))) throw new Error();
  try { if (!lstatSync(output).isFile()) throw new Error(); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  process.stdout.write(output);
} catch {
  console.error('Output must be an absolute file path outside the checkout, with an existing parent and no destination symlink.');
  process.exit(1);
}
NODE
)

# Refuse an occupied port so we cannot accidentally export another running rig.
node --input-type=module - "$port" <<'NODE'
import { createServer } from 'node:net';
const server = createServer();
server.on('error', () => { console.error('Export port is unavailable.'); process.exit(1); });
server.listen({ host: '127.0.0.1', port: Number(process.argv[2]), exclusive: true }, () => server.close());
NODE

server_pid=''
partial=''
cleanup() {
  if [[ -n $server_pid ]]; then
    kill -TERM "$server_pid" 2>/dev/null || true
    wait "$server_pid" 2>/dev/null || true
  fi
  [[ -z $partial ]] || rm -f -- "$partial"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# Launch the server directly so the trapped PID belongs to Node itself.
# Suppress server logs: they may contain private lane data.
HOST=127.0.0.1 PORT="$port" node --import tsx --env-file-if-exists=.env src/server.ts >/dev/null 2>&1 &
server_pid=$!

ready=false
for ((attempt=0; attempt<100; attempt++)); do
  kill -0 "$server_pid" 2>/dev/null || fail 'Rig exited before export; server output was suppressed to protect lane data.'
  if curl --silent --fail --max-time 1 --output /dev/null "http://127.0.0.1:$port/health"; then
    ready=true
    break
  fi
  sleep 0.1
done
[[ $ready == true ]] || fail 'Timed out waiting for the local rig.'

partial=$(mktemp "$(dirname -- "$output")/.digest-export.XXXXXX")
curl --silent --show-error --fail --max-time 30 \
  --output "$partial" "http://127.0.0.1:$port/digest/2026-10-28"
kill -0 "$server_pid" 2>/dev/null || fail 'Rig exited during export.'
mv -f -- "$partial" "$output"
partial=''
printf '%s\n' 'Digest exported successfully.'
