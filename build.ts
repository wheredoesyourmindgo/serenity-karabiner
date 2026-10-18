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
type Condition =
  | {type: 'variable_if'; name: string; value: number}
  | {type: 'device_if'; identifiers: {description: string; vendor_id: number}[]}
type FromModifiers = {mandatory?: Modifier[]; optional?: Modifier[]}
type Manipulator = {
  type: 'basic'
  from: {key_code: KeyCode; modifiers?: FromModifiers}
  to?: ToEvent[]
  to_if_alone?: ToEvent[]
  to_if_held_down?: ToEvent[]
  to_after_key_up?: ToEvent[]
  to_delayed_action?: {to_if_canceled: ToEvent[]}
  parameters?: Record<string, number>
  conditions: Condition[]
}
type Rule = {description: string; manipulators: Manipulator[]}

const OUTPUT = new URL('./serenity.json', import.meta.url)

// --- Conditions ---------------------------------------------------------------

const appleKeyboards: Condition = {
  type: 'device_if',
  identifiers: [{description: 'All Apple Devices', vendor_id: 1452}]
}
// Set by the Hammerspoon snippet at serenity-layout.fyi/extras, so typing a
// password on the lock screen isn't remapped. Unset reads as 0.
const unlocked: Condition = {type: 'variable_if', name: 'is_lock_screen', value: 0}
// Fn+G latches the Fn layer on; G or Caps Lock releases it.
const fnLatched: Condition = {type: 'variable_if', name: 'fn_toggle_on', value: 1}
const fnUnlatched: Condition = {type: 'variable_if', name: 'fn_toggle_on', value: 0}

// --- Helpers ------------------------------------------------------------------

const key = (key_code: KeyCode, ...modifiers: Modifier[]): ToEvent =>
  modifiers.length ? {key_code, modifiers} : {key_code}

const setFnLatch = (value: number): ToEvent => ({set_variable: {name: 'fn_toggle_on', value}})

// Caps Lock needs a held press, then vk_none so the release registers.
const capsLock: ToEvent[] = [{hold_down_milliseconds: 100, key_code: 'caps_lock'}, {key_code: 'vk_none'}]

const rule = (description: string, manipulators: Manipulator[]): Rule => ({
  description: `${description} 🕊️`,
  manipulators
})

/** A plain remap on Apple keyboards while the screen is unlocked. */
const remap = (
  from: KeyCode,
  fields: Omit<Manipulator, 'type' | 'from' | 'conditions'>,
  modifiers: FromModifiers = {optional: ['any']}
): Manipulator => ({type: 'basic', from: {key_code: from, modifiers}, ...fields, conditions: [unlocked, appleKeyboards]})

/**
 * A Fn-layer key: Fn+`from` sends `to`, and so does `from` alone while the
 * layer is latched with Fn+G. `mandatory` lists modifiers needed besides Fn.
 */
function fnLayer(
  from: KeyCode,
  to: ToEvent[],
  {mandatory = [], optional = ['any'], ...fields}: FromModifiers & Omit<Manipulator, 'type' | 'from' | 'conditions'> = {}
): Manipulator[] {
  return [
    {
      type: 'basic',
      from: {key_code: from, modifiers: {mandatory: ['fn', ...mandatory], optional}},
      to,
      ...fields,
      conditions: [unlocked, appleKeyboards]
    },
    {
      type: 'basic',
      from: mandatory.length ? {key_code: from, modifiers: {mandatory, optional}} : {key_code: from},
      to,
      ...fields,
      conditions: [fnLatched, unlocked, appleKeyboards]
    }
  ]
}

const fnLayerMap = (pairs: [KeyCode, ToEvent][]) => pairs.flatMap(([from, to]) => fnLayer(from, [to]))

// --- Serenity layout ----------------------------------------------------------

// Physical (QWERTY) key → the key it types, row by row as on the keyboard.
const serenityLayout: Record<KeyCode, KeyCode>[] = [
  {hyphen: 'open_bracket', equal_sign: 'close_bracket'},
  {q: 'q', w: 'l', e: 'd', r: 'w', t: 'v', y: 'j', u: 'f', i: 'o', o: 'u', p: 'hyphen', open_bracket: 'equal_sign', close_bracket: 'slash', backslash: 'backslash'},
  {a: 'r', s: 'n', d: 't', f: 's', g: 'g', h: 'y', j: 'h', k: 'e', l: 'a', semicolon: 'i', quote: 'semicolon'},
  {z: 'x', x: 'z', c: 'm', v: 'c', b: 'b', n: 'k', m: 'p', comma: 'quote', period: 'comma', slash: 'period'}
]

// --- Rules --------------------------------------------------------------------

const rules: Rule[] = [
  rule('Latch the Fn layer with Fn+G (release with G or Caps Lock) on Apple Devices', [
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
      to: [setFnLatch(0)],
      conditions: [fnLatched, unlocked, appleKeyboards]
    }
  ]),

  rule('Spacebar: tap for Space, hold for Fn on Apple Devices', [
    remap(
      'spacebar',
      {
        to_delayed_action: {to_if_canceled: [key('spacebar')]},
        to_if_alone: [{key_code: 'spacebar', halt: true}],
        to_if_held_down: [{key_code: 'fn', halt: true}],
        parameters: {
          'basic.to_if_alone_timeout_milliseconds': 190,
          'basic.to_if_held_down_threshold_milliseconds': 190
        }
      },
      {optional: ['command', 'control', 'option', 'shift', 'caps_lock']}
    )
  ]),

  rule('Map Fn+Spacebar to Spacebar on Apple Devices', fnLayer('spacebar', [key('spacebar')])),

  rule('Right Shift: tap for Enter, hold for Shift', [
    remap('right_shift', {
      to: [key('right_shift')],
      to_after_key_up: [key('right_shift')],
      to_if_alone: [key('return_or_enter')],
      to_if_held_down: [key('right_shift')]
    })
  ]),

  rule('Swap Caps Lock and Escape', [
    remap('caps_lock', {to: [key('escape')]}),
    remap('escape', {to: capsLock})
  ]),

  rule(
    'Map Fn+A/S/D/F to Control/Option/Command/Shift on Apple Devices',
    fnLayerMap([
      ['a', key('left_control', 'fn')],
      ['s', key('left_option', 'fn')],
      ['d', key('left_command', 'fn')],
      ['f', key('left_shift', 'fn')]
    ])
  ),

  rule(
    'Map Fn+Z/X/C/V/B to Undo/Cut/Copy/Paste/Redo on Apple Devices',
    fnLayerMap([
      ['z', key('z', 'left_command')],
      ['x', key('x', 'left_command')],
      ['c', key('c', 'left_command')],
      ['v', key('v', 'left_command')],
      ['b', key('z', 'left_command', 'left_shift')]
    ])
  ),

  rule(
    'Map Fn+J/K/L/; to Arrow Keys on Apple Devices',
    fnLayerMap([
      ['j', key('left_arrow')],
      ['k', key('down_arrow')],
      ['l', key('up_arrow')],
      ['semicolon', key('right_arrow')]
    ])
  ),

  rule(
    'Map Fn+M/Comma/Period/Slash to Home/Page Down/Page Up/End on Apple Devices',
    fnLayerMap([
      ['m', key('home')],
      ['comma', key('page_down')],
      ['period', key('page_up')],
      ['slash', key('end')]
    ])
  ),

  rule(
    'Map Fn+Q–P to 1–0 on Apple Devices',
    fnLayerMap(['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'].map((from, i) => [from, key(String((i + 1) % 10))]))
  ),

  rule('Map Fn+N to Caps Lock, and Delete keys under Fn, on Apple Devices', [
    ...fnLayer('n', capsLock),
    ...fnLayer('delete_or_backspace', [key('delete_or_backspace')], {optional: ['control', 'command', 'option']}),
    ...fnLayer('delete_or_backspace', [key('delete_forward')], {mandatory: ['shift'], optional: ['control', 'option']}),
    ...fnLayer('delete_or_backspace', [key('k', 'left_control')], {
      mandatory: ['shift', 'command'],
      optional: ['control', 'option']
    })
  ]),

  rule(
    'Map Fn+H to Select Word (hold for Select Line) on Apple Devices',
    fnLayer('h', [key('right_arrow'), key('left_arrow', 'left_option'), key('right_arrow', 'left_option', 'left_shift')], {
      to_if_held_down: [
        key('right_arrow'),
        key('left_arrow', 'left_command'),
        key('right_arrow', 'left_command', 'left_shift')
      ]
    })
  ),

  // No lock-screen condition, so these also work on the lock screen.
  rule(
    'Map Fn+Number Row to F1–F12 on Apple Devices',
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'hyphen', 'equal_sign'].map((from, i) => ({
      type: 'basic' as const,
      from: {key_code: from, modifiers: {mandatory: ['fn'], optional: ['any']}},
      to: [key(`f${i + 1}`)],
      conditions: [appleKeyboards]
    }))
  ),

  rule('Map Serenity layout', [
    remap('delete_or_backspace', {to: [key('delete_forward')]}, {mandatory: ['shift'], optional: ['control', 'option']}),
    remap(
      'delete_or_backspace',
      {to: [key('k', 'left_control')]},
      {mandatory: ['shift', 'command'], optional: ['control', 'option']}
    ),
    ...serenityLayout.flatMap((row) => Object.entries(row).map(([from, to]) => remap(from, {to: [key(to)]})))
  ])
]

// --- Output -------------------------------------------------------------------

const json = JSON.stringify({title: 'Serenity 🕊️', rules}, null, 2) + '\n'

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
