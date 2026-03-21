# Vault Access for Agents

## Environment

These should be in your env (set in `~/.zshenv`):
```
VAULT_ADDR=http://10.10.0.3:8200
VAULT_TOKEN=<agent readonly token>
```

## Reading a Secret

```bash
# From bash tool
curl -s -H "X-Vault-Token: $VAULT_TOKEN" $VAULT_ADDR/v1/secret/data/infra/mqtt | jq -r '.data.data'

# Result:
# {"password":"...","user":"mqtt"}
```

## Available Secrets

All under `secret/data/infra/`:

| Path | Keys |
|------|------|
| `infra/default` | `password` |
| `infra/mqtt` | `user`, `password` |
| `infra/telegram` | `command_bot`, `log_bot`, `claudecli_bot`, `chat_id` |
| `infra/hass` | `token` |
| `infra/opnsense` | `api_key`, `api_secret` |
| `infra/grafana` | `user`, `password` |
| `infra/huggingface` | `token` |
| `infra/unifi-ap` | `user`, `password` |
| `infra/smb-hass` | `user`, `password` |
| `infra/wireguard-gre` | `server_privkey`, `server_pubkey`, `phone_privkey`, `laptop_privkey` |

## Important

- The API path is `secret/data/infra/<name>` (note the `data` segment — KV v2 requires it)
- Response is nested: `.data.data.fieldname`
- This token is READ-ONLY — cannot write, cannot unseal, cannot admin
- If Vault is sealed (after mista reboot), secrets are unavailable until manually unsealed

## Quick Test

```bash
curl -s -H "X-Vault-Token: $VAULT_TOKEN" $VAULT_ADDR/v1/secret/data/infra/mqtt
```

If you get `permission denied`, check that `$VAULT_TOKEN` is set in your env.
If you get `connection refused`, Vault might be sealed — not your problem, tell Cali.
