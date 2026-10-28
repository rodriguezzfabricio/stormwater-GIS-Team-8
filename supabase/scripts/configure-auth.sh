#!/usr/bin/env bash
# Change Supabase Auth settings for the team project through the Management API.
# Prints the non-secret settings before and after; never prints the access token
# or the Google client secret (both go to curl through 0600 temp files).
set -euo pipefail

REF=fsrsldketzmcjyvjueki
API="https://api.supabase.com/v1/projects/$REF/config/auth"
SITE_URL="http://localhost:3000"
REDIRECTS=("http://localhost:3000/**" "http://localhost:5500/auth-test.html" "http://localhost:5500/**")
HOOK_URI="pg-functions://postgres/public/hook_restrict_umbc_signup"

usage() {
  cat <<EOF
Usage: ${0##*/} <mode> [args]

  google <client.json>  enable Google sign-in from a Google OAuth client JSON,
                        set the site URL, merge the localhost redirect URLs
  redirects             only merge the redirect URLs (no client JSON needed)
  hook                enable the before-user-created hook (@umbc.edu only);
                        public.hook_restrict_umbc_signup must already exist,
                        or every sign-up fails
  hook-off              disable the hook (rollback)

Project: $REF
Token:   \$SUPABASE_ACCESS_TOKEN, else the Supabase CLI login (supabase login)
Needs:   bash, curl, jq
EOF
}

die() { echo "error: $*" >&2; exit 1; }

mode=${1:-}
case $mode in
  google) [[ $# -eq 2 ]] || { usage >&2; exit 2; } ;;
  redirects | hook | hook-off) [[ $# -eq 1 ]] || { usage >&2; exit 2; } ;;
  -h | --help) usage; exit 0 ;;
  *) usage >&2; exit 2 ;;
esac

for cmd in curl jq; do
  command -v "$cmd" >/dev/null 2>&1 || die "$cmd is required but not installed"
done

if [[ $mode == google ]]; then
  client=$2
  [[ -f $client ]] || die "client JSON not found: $client"
  jq -e '(.web // .installed)
         | (.client_id | type == "string" and length > 0)
           and (.client_secret | type == "string" and length > 0)' \
    "$client" >/dev/null 2>&1 \
    || die "$client is unreadable or has no client_id/client_secret under \"web\" or \"installed\""
fi

umask 077
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# Token order matches the Supabase CLI: env var, then the keychain entry
# (service "Supabase CLI", account = profile name), then ~/.supabase/access-token.
# macOS keychain only. go-keyring may store the value base64- or hex-encoded.
get_token() {
  local t=${SUPABASE_ACCESS_TOKEN:-} acct
  if [[ -z $t ]] && command -v security >/dev/null 2>&1; then
    for acct in supabase access-token; do # current profile, then legacy key
      t=$(security find-generic-password -s "Supabase CLI" -a "$acct" -w 2>/dev/null || true)
      if [[ -n $t ]]; then break; fi
    done
  fi
  if [[ -z $t && -r $HOME/.supabase/access-token ]]; then
    t=$(<"$HOME/.supabase/access-token")
  fi
  case $t in
    go-keyring-base64:*)
      t=$(printf %s "${t#go-keyring-base64:}" | base64 -d) || die "could not decode the CLI keychain token" ;;
    go-keyring-encoded:*)
      t=$(printf %s "${t#go-keyring-encoded:}" | xxd -r -p) || die "could not decode the CLI keychain token" ;;
  esac
  t=${t//[[:space:]]/}
  [[ -n $t ]] || die "no Supabase access token found. Run 'supabase login' or export SUPABASE_ACCESS_TOKEN (https://supabase.com/dashboard/account/tokens)."
  # curl reads the header from a file, so the token never appears in argv.
  printf 'header = "Authorization: Bearer %s"\n' "$t" >"$tmp/curl.cfg"
}

# api GET|PATCH [body-file]: response body lands in $tmp/resp; dies on non-2xx.
api() {
  local method=$1 code msg
  local args=(-sS --max-time 30 -K "$tmp/curl.cfg" -X "$method" -o "$tmp/resp"
    -w '%{http_code}' -H 'Content-Type: application/json')
  if [[ -n ${2:-} ]]; then args+=(--data-binary "@$2"); fi
  code=$(curl "${args[@]}" "$API") || die "request to the Management API failed (network?)"
  if [[ $code != 2* ]]; then
    msg=$(jq -r '(.message // .error // empty) | tostring' "$tmp/resp" 2>/dev/null || true)
    [[ $code == 401 ]] && msg="${msg:+$msg. }Check the token (supabase login, or SUPABASE_ACCESS_TOKEN)."
    die "HTTP $code: ${msg:-no message in response}"
  fi
}

# Print the non-secret settings from the last response.
show() {
  jq -r '{site_url, uri_allow_list, external_google_enabled, external_google_client_id,
          hook_before_user_created_enabled, hook_before_user_created_uri}
         | to_entries[] | "  \(.key): \(.value)"' "$tmp/resp"
}

get_token

echo "Project $REF, mode: $mode"
echo "Before:"
api GET
show

# Keep existing redirect URLs; append ours; drop blanks and duplicates.
merged_redirects() {
  local current
  current=$(jq -r '.uri_allow_list // ""' "$tmp/resp")
  jq -nr --arg cur "$current" '
    reduce (($cur | split(",") | map(gsub("^\\s+|\\s+$"; ""))) + $ARGS.positional)[] as $u
      ([]; if $u == "" or any(.[]; . == $u) then . else . + [$u] end)
    | join(",")' --args "${REDIRECTS[@]}"
}

case $mode in
  google)
    allow=$(merged_redirects)
    # The secret goes straight from the client JSON into the body file.
    jq --arg site "$SITE_URL" --arg allow "$allow" '(.web // .installed) as $c | {
        external_google_enabled: true,
        external_google_client_id: $c.client_id,
        external_google_secret: $c.client_secret,
        site_url: $site,
        uri_allow_list: $allow}' "$client" >"$tmp/body.json"
    ;;
  redirects)
    jq -n --arg allow "$(merged_redirects)" '{uri_allow_list: $allow}' >"$tmp/body.json"
    ;;
  hook)
    jq -n --arg uri "$HOOK_URI" '{
        hook_before_user_created_enabled: true,
        hook_before_user_created_uri: $uri}' >"$tmp/body.json"
    ;;
  hook-off)
    jq -n '{hook_before_user_created_enabled: false}' >"$tmp/body.json"
    ;;
esac

api PATCH "$tmp/body.json"

echo "After:"
api GET
show
