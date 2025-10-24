

# serenity-karabiner

A **minimal Karabiner-Elements config** that includes only the **Serenity (🕊️)** rules—clean, portable, and easy to merge with your setup.

## What’s inside

- Spacebar: **tap = Space**, **hold = Fn** (Apple devices) 🕊️  
- Fn + **J/K/L/;** → Arrow keys 🕊️  
- Fn + **M/Comma/Period/Slash** → **Home / PgDn / PgUp / End** 🕊️  
- Fn + **Q–P** → **1–0** 🕊️  
- **Caps ↔ Esc** swap 🕊️  
- **Right Shift**: hold = Shift, tap = Enter 🕊️  
- Fn + **Z/X/C/V/B** → **Undo/Cut/Copy/Paste/Redo** 🕊️  
- Fn + **A/S/D/F** → **Ctrl/Option/Command/Shift** (with Fn) 🕊️  
- Fn + **number row** → **F1–F12** 🕊️  
- Plus a focused **Serenity layout** remap block 🕊️

> All rules are filtered by descriptions containing the dove emoji (🕊️).

## Quick start

### Option A — Use this repo’s JSON directly
1. Copy `karabiner_serenity.json` to:
   ```bash
   ~/.config/karabiner/karabiner_serenity.json
   ```
2. In Karabiner-Elements → **Complex Modifications** → **Add rule** → **Import from file** and load it.  
3. Enable the rules you want.

### Option B — Extract only 🕊️ rules from your current config
If you already have a large `karabiner.json` and want a clean Serenity-only file:

```bash
# Single profile
jq '{profiles: [{complex_modifications: {rules: [.profiles[0].complex_modifications.rules[] | select(.description | contains("🕊️"))]}}]}' \
~/.config/karabiner/karabiner.json \
> ~/.config/karabiner/karabiner_serenity.json
```

```bash
# All profiles (keeps a Serenity-only ruleset per profile)
jq '{profiles: [.profiles[] | {complex_modifications: {rules: [.complex_modifications.rules[] | select(.description | contains("🕊️"))]}}]}' \
~/.config/karabiner/karabiner.json \
> ~/.config/karabiner/karabiner_serenity.json
```

Then import `karabiner_serenity.json` in Karabiner-Elements.

## Why “partial” config?

This file intentionally includes **only** Serenity rules so it won’t overwrite your other Karabiner settings (devices, parameters, other rules). Use it as a **snippet** you can import or merge.

## Tips

- Need to **preserve devices/parameters** too? Build a richer output with `jq` by copying those keys from your base config alongside the filtered rules.
- After changes:
  ```bash
  karabiner_cli --reloadxml
  ```

## Compatibility

- macOS with Karabiner-Elements (latest)  
- Fn mappings and some conditions target **Apple keyboards** (vendor_id `1452`)

## License

MIT—use freely.
