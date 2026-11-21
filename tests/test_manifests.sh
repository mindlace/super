#!/bin/sh
# Structural checks for the marketplace and plugin manifests.
set -eu
root="$(cd "$(dirname "$0")/.." && pwd)"
fail() { echo "FAIL: $1"; exit 1; }

m="$root/.claude-plugin/marketplace.json"
test -f "$m" || fail "marketplace.json missing"
python3 - "$root" <<'PY' || exit 1
import json, sys
from pathlib import Path
root = Path(sys.argv[1])
m = json.loads((root / ".claude-plugin/marketplace.json").read_text())
def fail(msg):
    print("FAIL: " + msg); sys.exit(1)
if m.get("name") != "super": fail("marketplace name must be 'super'")
if not m.get("owner", {}).get("name"): fail("owner.name required")
names = [p["name"] for p in m.get("plugins", [])]
if names != ["supersonic", "superpowers-jev", "superpowers-html", "superpowers-reader"]: fail("plugins must be supersonic, superpowers-jev, superpowers-html, superpowers-reader; got %r" % names)
for p in m["plugins"]:
    src = p.get("source", "")
    if not src.startswith("./") or ".." in src: fail("source must be ./relative: %r" % src)
    pj = root / src / ".claude-plugin/plugin.json"
    if not pj.is_file(): fail("missing %s" % pj)
    if json.loads(pj.read_text()).get("name") != p["name"]: fail("plugin.json name != marketplace entry %s" % p["name"])
PY
if command -v claude >/dev/null 2>&1; then
  claude plugin validate "$root" >/dev/null 2>&1 || fail "claude plugin validate $root"
  for p in supersonic superpowers-jev superpowers-html superpowers-reader; do
    claude plugin validate "$root/plugins/$p" >/dev/null 2>&1 || fail "claude plugin validate plugins/$p"
  done
fi
grep -q 'eol=lf' "$root/.gitattributes" || fail ".gitattributes must force LF"
grep -qx '.superpowers/' "$root/.gitignore" || fail ".gitignore must ignore .superpowers/"
readme="$root/README.md"
grep -q 'subagentPromptCacheTtl' "$readme" || fail "README must document subagentPromptCacheTtl"
grep -q '^## Requirements' "$readme" || fail "README needs a Requirements section"
grep -q 'claude --bg' "$readme" || fail "README must mention claude --bg"
grep -q 'install superpowers-reader@super' "$readme" || fail "README must give the reader's install line"
if grep -rIl -e 'operator subagents' "$root/plugins/supersonic" "$root/.claude-plugin" "$readme" >/dev/null 2>&1; then
  fail "stale wording 'operator subagents'"
fi
jev_n=$(ls "$root"/plugins/superpowers-jev/questions/*.json | wc -l | tr -d ' ')
grep -q "at $jev_n decision points" "$readme" || fail "README Jev count must be $jev_n"
echo "PASS: manifests"
