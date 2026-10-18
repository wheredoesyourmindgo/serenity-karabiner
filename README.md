# serenity-karabiner

The [Serenity](https://www.serenity-layout.fyi/software) layout for any Mac keyboard, laptop included, as a [Karabiner-Elements](https://karabiner-elements.pqrs.org) rules file.

## Install

With Karabiner-Elements installed, open this link:

**[Import Serenity into Karabiner-Elements](karabiner://karabiner/assets/complex_modifications/import?url=https%3A%2F%2Fraw.githubusercontent.com%2Fwheredoesyourmindgo%2Fserenity-karabiner%2Fmain%2Fserenity.json)**

(GitHub doesn't make `karabiner://` links clickable. Use the button at [serenity-layout.fyi/software](https://www.serenity-layout.fyi/software), or paste the link into Safari.)

Karabiner asks to import the rules. Click **Import**, then **Enable All** next to **Serenity**.

Or by hand:

```sh
curl -fsSL --create-dirs -o ~/.config/karabiner/assets/complex_modifications/serenity.json \
  https://raw.githubusercontent.com/wheredoesyourmindgo/serenity-karabiner/main/serenity.json
```

Then go to Karabiner-Elements → **Complex Modifications** → **Add predefined rule** → **Serenity** → **Enable All**.

**Rule order matters.** Karabiner gives rules higher in the list priority, and the Fn layer has to come before **Serenity: Layout**. **Enable All** keeps the order right. If you enable rules one at a time, keep **Serenity: Layout** at the bottom.

Every rule's name starts with **Serenity:**, so you can tell them apart from your own. To update, remove the Serenity rules and import again. The rules leave your other Karabiner settings, devices and rules alone.

## What's inside

All rules apply only to Apple keyboards (vendor ID `1452`).

- **Layout:** the Serenity letters and punctuation on the alpha keys
- **Spacebar:** tap for Space, hold for Fn
- **Fn+G** latches the Fn layer on; **G** or **Caps Lock** releases it
- **Fn+A/S/D/F:** Control / Option / Command / Shift
- **Fn+Z/X/C/V/B:** Undo / Cut / Copy / Paste / Redo
- **Fn+J/K/L/;:** arrow keys
- **Fn+M/Comma/Period/Slash:** Home / Page Down / Page Up / End
- **Fn+Q–P:** 1–0
- **Fn+H:** select word (hold to select line)
- **Fn+N:** Caps Lock
- **Fn + number row:** F1–F12
- **Caps Lock ↔ Escape** swap
- **Right Shift:** tap for Enter, hold for Shift

### Lock screen

Most rules turn off while the screen is locked, so you can type your password in QWERTY. Karabiner can't tell when the screen is locked by itself. The [Hammerspoon snippet](https://www.serenity-layout.fyi/extras) sets the `is_lock_screen` variable for it. Without the snippet, the rules work but stay on at the lock screen too.

## Development

`serenity.json` is generated. Edit [`build.ts`](build.ts), then:

```sh
npm run build   # regenerate serenity.json (Node 24+, no dependencies)
npm run lint    # validate with Karabiner's own linter (needs Karabiner-Elements installed)
```

Commit both files. CI runs `npm run check`, which fails if `serenity.json` doesn't match `build.ts`. The install link reads `serenity.json` from `main`, so a push goes straight to users.

## License

MIT
