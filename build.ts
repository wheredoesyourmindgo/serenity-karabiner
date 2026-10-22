// Generates serenity.json, the Karabiner-Elements rules file for Serenity.
//
//   node build.ts          write serenity.json
//   node build.ts --check  fail if serenity.json is out of date (used by CI)
//
// Edit this file, never serenity.json. Karabiner gives earlier rules (and earlier
// manipulators within a rule) priority, so the Fn layer comes before the layout remap.

import {readFileSync, writeFileSync} from 'node:fs'

type KeyCode = string
type Modifier = string
type ToEvent =
  | {key_code: KeyCode; modifiers?: Modifier[]; halt?: boolean; hold_down_milliseconds?: number}
  | {set_variable: {name: string; value: number}}
  | {consumer_key_code: string}
  | {apple_vendor_keyboard_key_code: string}
  | {generic_desktop: string}
  | {sticky_modifier: Record<Modifier, 'on' | 'off' | 'toggle'>}
type Condition =
  | {type: 'variable_if' | 'variable_unless'; name: string; value: number}
  | {type: 'device_if'; identifiers: {description: string; vendor_id?: number; is_built_in_keyboard?: boolean}[]}
type FromModifiers = {mandatory?: Modifier[]; optional?: Modifier[]}
type Manipulator = {
  type: 'basic'
  from: {key_code: KeyCode; modifiers?: FromModifiers}
  to?: ToEvent[]
  to_if_alone?: ToEvent[]
  to_if_held_down?: ToEvent[]
  to_after_key_up?: ToEvent[]
  to_delayed_action?: {to_if_invoked?: ToEvent[]; to_if_canceled?: ToEvent[]}
  parameters?: Record<string, number>
  conditions: Condition[]
}
type Rule = {description: string; manipulators: Manipulator[]}
type Fields = Omit<Manipulator, 'type' | 'from' | 'conditions'> & {
  keepsSelectWord?: boolean
  keepsCapsWord?: boolean
}

const OUTPUT = new URL('./serenity.json', import.meta.url)

// --- Conditions ---------------------------------------------------------------

// Apple keyboards only, so QMK and other third-party boards (which report their own vendor IDs)
// pass through untouched. Apple is 1452 over USB and built in, but 76 over Bluetooth.
const appleKeyboards: Condition = {
  type: 'device_if',
  identifiers: [
    {description: 'Apple keyboards over USB and built in', vendor_id: 1452},
    {description: 'Apple keyboards over Bluetooth', vendor_id: 76},
    {description: 'Any built-in keyboard', is_built_in_keyboard: true}
  ]
}
// Set by the Hammerspoon snippet at serenity-layout.fyi/extras, so typing a
// password on the lock screen isn't remapped. Unset reads as 0.
const unlocked: Condition = {type: 'variable_if', name: 'is_lock_screen', value: 0}
// Fn+G latches the Fn layer on; G or Caps Lock releases it.
const fnLatched: Condition = {type: 'variable_if', name: 'fn_toggle_on', value: 1}
const fnUnlatched: Condition = {type: 'variable_if', name: 'fn_toggle_on', value: 0}
// Fn+H's selection: 0 none, 1 words, 2 lines. While it's set, Fn+H extends it.
const selectingWords: Condition = {type: 'variable_if', name: 'select_word', value: 1}
const selectingLines: Condition = {type: 'variable_if', name: 'select_word', value: 2}
const selecting: Condition = {type: 'variable_unless', name: 'select_word', value: 0}
// Caps Word, as in the firmware: double-tap Left Shift to type the next word in capitals.
const capsWording: Condition = {type: 'variable_if', name: 'caps_word', value: 1}
// Left Shift was just tapped alone, so another tap now turns Caps Word on.
const shiftTapped: Condition = {type: 'variable_if', name: 'left_shift_tapped', value: 1}

// --- Helpers ------------------------------------------------------------------

const key = (key_code: KeyCode, ...modifiers: Modifier[]): ToEvent =>
  modifiers.length ? {key_code, modifiers} : {key_code}

const setFnLatch = (value: number): ToEvent => ({set_variable: {name: 'fn_toggle_on', value}})
const setSelectWord = (value: number): ToEvent => ({set_variable: {name: 'select_word', value}})
const setCapsWord = (value: number): ToEvent => ({set_variable: {name: 'caps_word', value}})
const setShiftTapped = (value: number): ToEvent => ({set_variable: {name: 'left_shift_tapped', value}})

// Like the firmware's Select Word, a selection ends when any other key is
// pressed, so every remap below sends this unless it's a modifier or layer key
// (`keepsSelectWord`). Karabiner's to_delayed_action can't do it: the next Fn+H
// cancels it too, which would end the selection before Fn+H checks it.
const endSelectWord = setSelectWord(0)
// Caps Word ends the same way, except on the keys that can be part of a word: letters and
// `-` (handled in its own rule, ahead of these), digits and Backspace (`keepsCapsWord`).
const endCapsWord = setCapsWord(0)
const endingWordModes = (
  to: ToEvent[] | undefined,
  {keepsSelectWord = false, keepsCapsWord = false}: Pick<Fields, 'keepsSelectWord' | 'keepsCapsWord'>
) => {
  if (!to || keepsSelectWord) return to
  return keepsCapsWord ? [endSelectWord, ...to] : [endSelectWord, endCapsWord, ...to]
}

// Caps Lock needs a held press, then vk_none so the release registers.
const capsLock: ToEvent[] = [{hold_down_milliseconds: 100, key_code: 'caps_lock'}, {key_code: 'vk_none'}]

const rule = (description: string, manipulators: Manipulator[]): Rule => ({
  description: `Serenity: ${description}`,
  manipulators
})

/** A plain remap on Apple keyboards while the screen is unlocked. */
const remap = (
  from: KeyCode,
  {keepsSelectWord, keepsCapsWord, ...fields}: Fields,
  modifiers: FromModifiers = {optional: ['any']}
): Manipulator => ({
  type: 'basic',
  from: {key_code: from, modifiers},
  ...fields,
  to: endingWordModes(fields.to, {keepsSelectWord, keepsCapsWord}),
  conditions: [unlocked, appleKeyboards]
})

/**
 * A Fn-layer key: Fn+`from` sends `to`, and so does `from` alone while the
 * layer is latched with Fn+G. `mandatory` lists modifiers needed besides Fn.
 */
function fnLayer(
  from: KeyCode,
  to: ToEvent[],
  {
    mandatory = [],
    optional = ['any'],
    keepsSelectWord,
    keepsCapsWord,
    conditions = [],
    ...fields
  }: FromModifiers & Fields & {conditions?: Condition[]} = {}
): Manipulator[] {
  const events = endingWordModes(to, {keepsSelectWord, keepsCapsWord})
  return [
    {
      type: 'basic',
      from: {key_code: from, modifiers: {mandatory: ['fn', ...mandatory], optional}},
      to: events,
      ...fields,
      conditions: [...conditions, unlocked, appleKeyboards]
    },
    {
      type: 'basic',
      from: mandatory.length ? {key_code: from, modifiers: {mandatory, optional}} : {key_code: from},
      to: events,
      ...fields,
      conditions: [...conditions, fnLatched, unlocked, appleKeyboards]
    }
  ]
}

const fnLayerMap = (pairs: [KeyCode, ToEvent][], fields: Fields = {}) =>
  pairs.flatMap(([from, to]) => fnLayer(from, [to], fields))

/**
 * One Fn+H case of Select Word. `to` sets `select_word` first; the last event
 * is held, so holding Fn+H extends the selection with key repeat. The selection
 * also ends after 5 seconds without Fn+H, as in the firmware.
 */
const selectWord = (to: ToEvent[], fields: FromModifiers & Fields & {conditions?: Condition[]} = {}) =>
  fnLayer('h', to, {
    keepsSelectWord: true,
    to_delayed_action: {to_if_invoked: [endSelectWord]},
    parameters: {'basic.to_delayed_action_delay_milliseconds': 5000},
    ...fields
  })

// Each one-shot arms the right-hand modifier while the key holds the left-hand one, so using up
// the one-shot (which releases its modifier) can't end the hold. Karabiner only holds the last
// event in `to` while the key is down, so the held modifier goes last; the one-shot is just armed.
const oneShotModifiers: Modifier[] = ['right_control', 'right_option', 'right_command', 'right_shift']
// Releases every armed one-shot. Sent before a key, that key goes out without them.
const clearOneShots: ToEvent[] = oneShotModifiers.map((m) => ({sticky_modifier: {[m]: 'off'}}))

/**
 * A one-shot modifier on the Fn layer, like the firmware's Stackable One-Shot. The one-shot arms
 * the moment the key goes down, so keys chorded together all apply (no key waits to see whether
 * it was pressed alone). Held for 300 ms it's a plain modifier and disarms itself. If no other
 * key follows within 3 seconds, every armed one-shot clears.
 */
const oneShotMod = (from: KeyCode, held: Modifier, oneShot: Modifier) =>
  fnLayer(from, [{sticky_modifier: {[oneShot]: 'on'}}, key(held, 'fn')], {
    keepsSelectWord: true,
    // Karabiner releases `to` when to_if_held_down fires, so it presses the modifier again
    // (last, so it's held until key up).
    to_if_held_down: [{sticky_modifier: {[oneShot]: 'off'}}, key(held, 'fn')],
    to_delayed_action: {
      to_if_invoked: clearOneShots
    },
    parameters: {
      'basic.to_if_held_down_threshold_milliseconds': 300,
      'basic.to_delayed_action_delay_milliseconds': 3000
    }
  })

// --- Serenity layout ----------------------------------------------------------

// Physical (QWERTY) key → the key it types, row by row as on the keyboard.
const serenityLayout: Record<KeyCode, KeyCode>[] = [
  {hyphen: 'open_bracket', equal_sign: 'close_bracket'},
  {q: 'q', w: 'z', e: 'm', r: 'w', t: 'v', y: 'j', u: 'f', i: 'o', o: 'u', p: 'hyphen', open_bracket: 'equal_sign', close_bracket: 'slash', backslash: 'backslash'},
  {a: 'r', s: 'n', d: 't', f: 's', g: 'g', h: 'y', j: 'h', k: 'e', l: 'a', semicolon: 'i', quote: 'semicolon'},
  {z: 'x', x: 'l', c: 'd', v: 'c', b: 'b', n: 'k', m: 'p', comma: 'quote', period: 'comma', slash: 'period'}
]

// Keys no rule remaps that end Caps Word, as they can't be part of a word.
const passThroughEndingCapsWord: KeyCode[] = [
  ...['spacebar', 'return_or_enter', 'tab', 'delete_forward', 'grave_accent_and_tilde'],
  ...['left_arrow', 'right_arrow', 'up_arrow', 'down_arrow', 'home', 'end', 'page_up', 'page_down']
]

// --- Rules --------------------------------------------------------------------

const rules: Rule[] = [
  rule('Fn+G latches the Fn layer (G or Caps Lock releases it)', [
    {
      type: 'basic',
      from: {key_code: 'g', modifiers: {mandatory: ['fn'], optional: ['any']}},
      to: [setFnLatch(1)],
      conditions: [fnUnlatched, unlocked, appleKeyboards]
    },
    {
      type: 'basic',
      from: {key_code: 'g', modifiers: {optional: ['any']}},
      to: [setFnLatch(0)],
      conditions: [fnLatched, unlocked, appleKeyboards]
    },
    {
      type: 'basic',
      from: {key_code: 'caps_lock', modifiers: {optional: ['any']}},
      to: [...clearOneShots, setFnLatch(0)],
      conditions: [fnLatched, unlocked, appleKeyboards]
    }
  ]),

  // The bottom-left modifiers move one key right, so Fn lands on Left Command, beside the
  // spacebar, where the firmware's Num/Nav key is. They read Control, Option, Command, Fn
  // like the firmware's bottom row. Being modifiers, they hold with no tap/hold timing.
  rule(
    'Fn/Globe, Control, Option, Command → Control, Option, Command, Fn',
    [
      ['fn', 'left_control'],
      ['left_control', 'left_option'],
      ['left_option', 'left_command'],
      ['left_command', 'fn']
    ].map(([from, to]) => remap(from, {to: [key(to)], keepsSelectWord: true}))
  ),

  rule('Fn+Spacebar → Space', fnLayer('spacebar', [key('spacebar')])),

  rule('Right Shift → Enter on tap, Shift on hold', [
    remap('right_shift', {
      to: [key('right_shift')],
      to_after_key_up: [key('right_shift')],
      to_if_alone: [endSelectWord, endCapsWord, key('return_or_enter')],
      to_if_held_down: [key('right_shift')],
      keepsSelectWord: true
    })
  ]),

  // Escape clears armed one-shots first, as in the firmware, so a stray Fn+D then Escape
  // sends a plain Escape, not ⌘Escape. Held modifiers still apply.
  rule('Caps Lock ↔ Escape (Escape clears one-shot modifiers)', [
    remap('caps_lock', {to: [...clearOneShots, key('escape')]}),
    remap('escape', {to: capsLock})
  ]),

  rule(
    'Fn+A/S/D/F → Control/Option/Command/Shift (tap for one-shot)',
    [
      ...oneShotMod('a', 'left_control', 'right_control'),
      ...oneShotMod('s', 'left_option', 'right_option'),
      ...oneShotMod('d', 'left_command', 'right_command'),
      ...oneShotMod('f', 'left_shift', 'right_shift')
    ]
  ),

  rule(
    'Fn+Z/X/C/V/B → Undo/Cut/Copy/Paste/Redo',
    fnLayerMap([
      ['z', key('z', 'left_command')],
      ['x', key('x', 'left_command')],
      ['c', key('c', 'left_command')],
      ['v', key('v', 'left_command')],
      ['b', key('z', 'left_command', 'left_shift')]
    ])
  ),

  rule(
    'Fn+J/K/L/; → Arrow Keys',
    fnLayerMap([
      ['j', key('left_arrow')],
      ['k', key('down_arrow')],
      ['l', key('up_arrow')],
      ['semicolon', key('right_arrow')]
    ])
  ),

  rule(
    'Fn+M/Comma/Period/Slash → Home/Page Down/Page Up/End',
    fnLayerMap([
      ['m', key('home')],
      ['comma', key('page_down')],
      ['period', key('page_up')],
      ['slash', key('end')]
    ])
  ),

  rule(
    'Fn+Q–P → 1–0',
    fnLayerMap(
      ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'].map((from, i) => [from, key(String((i + 1) % 10))]),
      {keepsCapsWord: true}
    )
  ),

  rule('Fn+N → Caps Lock, Fn+Delete → Delete', [
    ...fnLayer('n', capsLock),
    ...fnLayer('delete_or_backspace', [key('delete_or_backspace')], {
      optional: ['control', 'command', 'option'],
      keepsCapsWord: true
    }),
    ...fnLayer('delete_or_backspace', [key('delete_forward')], {mandatory: ['shift'], optional: ['control', 'option']}),
    ...fnLayer('delete_or_backspace', [key('k', 'left_control')], {
      mandatory: ['shift', 'command'],
      optional: ['control', 'option']
    })
  ]),

  // getreuer's Select Word, as in the firmware: Fn+H selects the word, and
  // again extends to the next word; with Shift it selects lines instead.
  // Specific cases first: Karabiner uses the first manipulator that matches.
  rule('Fn+H → Select Word (with Shift, Select Line)', [
    // Extend down a line; on release, finish the selection at the line's end.
    ...selectWord([key('down_arrow', 'left_shift')], {
      mandatory: ['shift'],
      conditions: [selectingLines],
      to_after_key_up: [key('right_arrow', 'left_command', 'left_shift')]
    }),
    // From a word selection, extend to the end of the line.
    ...selectWord([setSelectWord(2), key('right_arrow', 'left_command', 'left_shift')], {
      mandatory: ['shift'],
      conditions: [selectingWords]
    }),
    ...selectWord([setSelectWord(2), key('left_arrow', 'left_command'), key('right_arrow', 'left_command', 'left_shift')], {
      mandatory: ['shift']
    }),
    ...selectWord([setSelectWord(1), key('right_arrow', 'left_option', 'left_shift')], {conditions: [selecting]}),
    ...selectWord([
      setSelectWord(1),
      key('right_arrow', 'left_option'),
      key('left_arrow', 'left_option'),
      key('right_arrow', 'left_option', 'left_shift')
    ])
  ]),

  // Everything moves down a row: Fn+top row already gives F1–F12, so Fn+number row gives
  // what the top row does without Fn. Sent as the media keys themselves, so it doesn't
  // depend on macOS's "Use F1, F2, etc. keys as standard function keys" setting.
  rule(
    'Fn+Number Row → Top Row Media Keys',
    fnLayerMap([
      ['1', {consumer_key_code: 'display_brightness_decrement'}],
      ['2', {consumer_key_code: 'display_brightness_increment'}],
      ['3', {apple_vendor_keyboard_key_code: 'mission_control'}],
      ['4', {apple_vendor_keyboard_key_code: 'spotlight'}],
      ['5', {consumer_key_code: 'dictation'}],
      ['6', {generic_desktop: 'do_not_disturb'}], // macOS 14 and later
      ['7', {consumer_key_code: 'rewind'}],
      ['8', {consumer_key_code: 'play_or_pause'}],
      ['9', {consumer_key_code: 'fast_forward'}],
      ['0', {consumer_key_code: 'mute'}],
      ['hyphen', {consumer_key_code: 'volume_decrement'}],
      ['equal_sign', {consumer_key_code: 'volume_increment'}]
    ])
  ),

  // Caps Word, as in the firmware: double-tap Left Shift and the next word comes out in
  // capitals, `-` as `_`. Digits and Backspace keep it going; any other key ends it, and so
  // does Left Shift. After the Fn layer, so a latched Fn layer still wins; before Layout,
  // which would otherwise type the letters. The double tap follows Karabiner's own example:
  // the second-tap check first, then the tap that arms it for 300 ms.
  rule('Double-tap Left Shift → Caps Word', [
    {
      type: 'basic',
      from: {key_code: 'left_shift', modifiers: {optional: ['any']}},
      to: [endCapsWord, key('left_shift')],
      conditions: [capsWording, unlocked, appleKeyboards]
    },
    {
      type: 'basic',
      from: {key_code: 'left_shift', modifiers: {optional: ['any']}},
      to: [setShiftTapped(0), setCapsWord(1)],
      conditions: [shiftTapped, unlocked, appleKeyboards]
    },
    {
      type: 'basic',
      from: {key_code: 'left_shift', modifiers: {optional: ['any']}},
      to: [setShiftTapped(1), key('left_shift')],
      to_delayed_action: {to_if_invoked: [setShiftTapped(0)], to_if_canceled: [setShiftTapped(0)]},
      parameters: {'basic.to_delayed_action_delay_milliseconds': 300},
      conditions: [unlocked, appleKeyboards]
    },
    ...serenityLayout
      .flatMap((row) => Object.entries(row))
      .filter(([, to]) => /^[a-z]$/.test(to) || to === 'hyphen')
      .map(([from, to]) => ({
        type: 'basic' as const,
        from: {key_code: from, modifiers: {optional: ['shift', 'caps_lock']}},
        to: [endSelectWord, key(to, 'left_shift')],
        conditions: [capsWording, unlocked, appleKeyboards]
      }))
  ]),

  rule('Layout', [
    remap('delete_or_backspace', {to: [key('delete_forward')]}, {mandatory: ['shift'], optional: ['control', 'option']}),
    remap(
      'delete_or_backspace',
      {to: [key('k', 'left_control')]},
      {mandatory: ['shift', 'command'], optional: ['control', 'option']}
    ),
    ...serenityLayout.flatMap((row) => Object.entries(row).map(([from, to]) => remap(from, {to: [key(to)]})))
  ]),

  // Keys no rule above remaps, passed through unchanged, so they end a selection
  // or Caps Word too. Only active while one is on. Digits and Backspace can be
  // part of a word, so they only end a selection.
  rule('Other keys end Select Word and Caps Word', [
    ...passThroughEndingCapsWord.flatMap((from) => [
      {
        type: 'basic' as const,
        from: {key_code: from, modifiers: {optional: ['any']}},
        to: [endSelectWord, endCapsWord, key(from)],
        conditions: [selecting, appleKeyboards]
      },
      {
        type: 'basic' as const,
        from: {key_code: from, modifiers: {optional: ['any']}},
        to: [endCapsWord, key(from)],
        conditions: [capsWording, appleKeyboards]
      }
    ]),
    ...['delete_or_backspace', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map((from) => ({
      type: 'basic' as const,
      from: {key_code: from, modifiers: {optional: ['any']}},
      to: [endSelectWord, key(from)],
      conditions: [selecting, appleKeyboards]
    }))
  ])
]

// --- Output -------------------------------------------------------------------

const json = JSON.stringify({title: 'Serenity', rules}, null, 2) + '\n'

if (process.argv.includes('--check')) {
  let current = ''
  try {
    current = readFileSync(OUTPUT, 'utf8')
  } catch {}
  if (current !== json) {
    console.error('serenity.json is out of date. Run `node build.ts` and commit the result.')
    process.exit(1)
  }
  console.log('serenity.json is up to date.')
} else {
  writeFileSync(OUTPUT, json)
  console.log(`Wrote serenity.json (${rules.length} rules).`)
}
