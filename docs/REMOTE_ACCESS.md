# Remote Access

Use Tailscale when you need Sandpilot away from your home or office network.

Sandpilot should still keep the daemon bound to `127.0.0.1` on the Mac mini. Tailscale gives your laptop a private route to SSH into the Mac mini, then the existing SSH tunnel forwards local `127.0.0.1:7349` to the daemon.

## Recommended Setup

1. Install Tailscale on the Mac mini and on the machine where you run your editor or agent.
2. Sign both devices into the same Tailnet.
3. On your laptop, find the Mac mini's Tailnet address:

   ```bash
   tailscale status
   ```

   Use either the Mac mini's MagicDNS name or its `100.x.y.z` Tailscale IP.

4. Save that SSH target for Sandpilot:

   ```bash
   sandpilot-tunnel --set nova@<mac-mini-tailnet-name-or-100.x-ip>
   ```

If you installed the Homebrew CLI instead of the standard macOS app, start Sandpilot's userspace Tailscale daemon first:

```bash
sandpilot-tailscale start
sandpilot-tailscale login sandpilot-client
```

This uses a user LaunchAgent and does not require sudo.

5. Test SSH over Tailscale:

   ```bash
   ssh nova@<mac-mini-tailnet-name-or-100.x-ip> 'hostname'
   ```

6. Start the Sandpilot tunnel:

   ```bash
   sandpilot-tunnel
   ```

7. Verify the local tunnel:

   ```bash
   curl -fsS http://127.0.0.1:7349/health
   ```

Agent commands do not change after this. They still talk to `http://127.0.0.1:7349` locally:

```bash
sandpilot run "your task" --cwd . --apply --detach
```

## If You Re-run Setup Remotely

Run setup with the Tailnet target instead of the LAN `.local` target:

```bash
bun run src/cli/index.ts setup nova@<mac-mini-tailnet-name-or-100.x-ip>
```

Setup saves that target into `~/.sandpilot/remote`, so future `sandpilot-tunnel` runs use it automatically.

## Why Not Expose The Daemon Publicly?

Do not port-forward `7349` from your router, and do not bind the daemon to `0.0.0.0`.

Sandpilot's daemon is intentionally local-only. Remote access should go through SSH over Tailscale so access still requires:

- your Tailnet identity,
- SSH access to the Mac mini,
- the Sandpilot bearer token.

## Cloudflare Tunnel Alternative

Cloudflare Tunnel can publish SSH or internal TCP services, but it is more setup than Sandpilot needs for one Mac mini. Use it only if you already run Cloudflare Zero Trust and want identity policies there. Otherwise, Tailscale plus normal SSH is simpler.
