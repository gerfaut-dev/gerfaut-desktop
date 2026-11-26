// The wallet icons drawn for this app, in Lucide's grammar: a 24 unit
// box, stroked at 1.5 with round caps and joins, never filled, so
// lucide-react renders them like any of its own. The same drawings as
// the mobile app's, each written out as SVG elements.

import type { IconNode } from "lucide-react";

/** Each drawn icon: what it is called, and its Lucide icon node. */
export const DRAWN_WALLET_ICONS = {
  swivel_key: {
    label: "Swivel key",
    node: [
      ["rect", { x: "2", y: "12", width: "20", height: "8", rx: "2", key: "swivel_key-0" }],
      ["circle", { cx: "6", cy: "16", r: "1", key: "swivel_key-1" }],
      ["path", { d: "M11 16h6", key: "swivel_key-2" }],
      ["path", { d: "M4.5 12 12.6 6a1.5 1.5 0 0 1 2.1.3l.5.7a1.5 1.5 0 0 1-.3 2.1L10.5 12", key: "swivel_key-3" }],
    ],
  },
  slim_stick: {
    label: "Slim stick",
    node: [
      ["rect", { x: "2", y: "8.5", width: "20", height: "7", rx: "3.5", key: "slim_stick-0" }],
      ["path", { d: "M6.5 12h7", key: "slim_stick-1" }],
      ["path", { d: "M17.5 12h.01", key: "slim_stick-2" }],
    ],
  },
  usb_stick: {
    label: "USB stick",
    node: [
      ["rect", { x: "2", y: "7.5", width: "15", height: "9", rx: "3", key: "usb_stick-0" }],
      ["path", { d: "M17 10.5h3.5a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1H17", key: "usb_stick-1" }],
      ["path", { d: "M6 12h7", key: "usb_stick-2" }],
    ],
  },
  two_button_device: {
    label: "Two-button device",
    node: [
      ["rect", { x: "6.5", y: "2", width: "11", height: "20", rx: "2", key: "two_button_device-0" }],
      ["rect", { x: "9.5", y: "5", width: "5", height: "4", rx: "1", key: "two_button_device-1" }],
      ["path", { d: "M10 16h.01", key: "two_button_device-2" }],
      ["path", { d: "M14 16h.01", key: "two_button_device-3" }],
    ],
  },
  square_touchscreen: {
    label: "Square touchscreen",
    node: [
      ["rect", { x: "5", y: "2", width: "14", height: "20", rx: "2", key: "square_touchscreen-0" }],
      ["rect", { x: "8", y: "5", width: "8", height: "8", rx: "1", key: "square_touchscreen-1" }],
    ],
  },
  wheel_device: {
    label: "Scroll wheel device",
    node: [
      ["rect", { x: "2", y: "8", width: "20", height: "10", rx: "2", key: "wheel_device-0" }],
      ["rect", { x: "5", y: "11", width: "9", height: "4", rx: "1", key: "wheel_device-1" }],
      ["path", { d: "M15 8a2.5 2.5 0 0 1 5 0", key: "wheel_device-2" }],
      ["path", { d: "M18 13h.01", key: "wheel_device-3" }],
    ],
  },
  pocket_screen: {
    label: "Pocket screen",
    node: [
      ["rect", { x: "2", y: "5", width: "20", height: "14", rx: "2", key: "pocket_screen-0" }],
      ["rect", { x: "5", y: "8", width: "11", height: "8", rx: "1", key: "pocket_screen-1" }],
      ["path", { d: "M19 12h.01", key: "pocket_screen-2" }],
    ],
  },
  wide_screen_bar: {
    label: "Wide screen bar",
    node: [
      ["rect", { x: "2", y: "7", width: "20", height: "10", rx: "2", key: "wide_screen_bar-0" }],
      ["rect", { x: "5", y: "10", width: "9", height: "4", rx: "1", key: "wide_screen_bar-1" }],
      ["circle", { cx: "18", cy: "12", r: "1.5", key: "wide_screen_bar-2" }],
    ],
  },
  curved_slate: {
    label: "Curved slate",
    node: [
      ["path", { d: "M11 2h6a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2h-6C7.5 22 5 17.5 5 12S7.5 2 11 2z", key: "curved_slate-0" }],
      ["path", { d: "M11 5h5v14h-5", key: "curved_slate-1" }],
    ],
  },
  framed_slate: {
    label: "Framed slate",
    node: [
      ["rect", { x: "3.5", y: "3", width: "17", height: "18", rx: "3", key: "framed_slate-0" }],
      ["rect", { x: "7", y: "6.5", width: "10", height: "11", rx: "1", key: "framed_slate-1" }],
    ],
  },
  keypad_bar: {
    label: "Keypad bar",
    node: [
      ["rect", { x: "7", y: "2", width: "10", height: "20", rx: "2", key: "keypad_bar-0" }],
      ["rect", { x: "10", y: "5", width: "4", height: "4", rx: "1", key: "keypad_bar-1" }],
      ["path", { d: "M10.5 13h.01", key: "keypad_bar-2" }],
      ["path", { d: "M13.5 13h.01", key: "keypad_bar-3" }],
      ["path", { d: "M10.5 16h.01", key: "keypad_bar-4" }],
      ["path", { d: "M13.5 16h.01", key: "keypad_bar-5" }],
      ["path", { d: "M10.5 19h.01", key: "keypad_bar-6" }],
      ["path", { d: "M13.5 19h.01", key: "keypad_bar-7" }],
    ],
  },
  calculator: {
    label: "Calculator",
    node: [
      ["rect", { x: "5", y: "2", width: "14", height: "20", rx: "2", key: "calculator-0" }],
      ["rect", { x: "8", y: "5", width: "8", height: "3", rx: "1", key: "calculator-1" }],
      ["path", { d: "M9 12h.01", key: "calculator-2" }],
      ["path", { d: "M12 12h.01", key: "calculator-3" }],
      ["path", { d: "M15 12h.01", key: "calculator-4" }],
      ["path", { d: "M9 15h.01", key: "calculator-5" }],
      ["path", { d: "M12 15h.01", key: "calculator-6" }],
      ["path", { d: "M15 15h.01", key: "calculator-7" }],
      ["path", { d: "M9 18h.01", key: "calculator-8" }],
      ["path", { d: "M12 18h.01", key: "calculator-9" }],
      ["path", { d: "M15 18h.01", key: "calculator-10" }],
    ],
  },
  keyboard_device: {
    label: "Keyboard device",
    node: [
      ["rect", { x: "2", y: "4", width: "20", height: "16", rx: "2", key: "keyboard_device-0" }],
      ["rect", { x: "5", y: "7", width: "14", height: "4", rx: "1", key: "keyboard_device-1" }],
      ["path", { d: "M6 14h.01", key: "keyboard_device-2" }],
      ["path", { d: "M9 14h.01", key: "keyboard_device-3" }],
      ["path", { d: "M12 14h.01", key: "keyboard_device-4" }],
      ["path", { d: "M15 14h.01", key: "keyboard_device-5" }],
      ["path", { d: "M18 14h.01", key: "keyboard_device-6" }],
      ["path", { d: "M8 17h8", key: "keyboard_device-7" }],
    ],
  },
  touch_phone: {
    label: "Touch phone",
    node: [
      ["rect", { x: "6", y: "2", width: "12", height: "20", rx: "2", key: "touch_phone-0" }],
      ["rect", { x: "9", y: "5", width: "6", height: "10", rx: "1", key: "touch_phone-1" }],
      ["path", { d: "M10.5 18.5h3", key: "touch_phone-2" }],
    ],
  },
  air_gapped_phone: {
    label: "Air-gapped phone",
    node: [
      ["rect", { x: "5.5", y: "2", width: "13", height: "20", rx: "2", key: "air_gapped_phone-0" }],
      ["rect", { x: "8.5", y: "6", width: "3.5", height: "3.5", rx: "1", key: "air_gapped_phone-1" }],
      ["rect", { x: "8.5", y: "13.5", width: "3.5", height: "3.5", rx: "1", key: "air_gapped_phone-2" }],
      ["path", { d: "M15 7.75h.01", key: "air_gapped_phone-3" }],
      ["path", { d: "M15 15.25h.01", key: "air_gapped_phone-4" }],
    ],
  },
  screen_card: {
    label: "Screen card",
    node: [
      ["rect", { x: "2", y: "5.5", width: "20", height: "13", rx: "2", key: "screen_card-0" }],
      ["rect", { x: "5", y: "8.5", width: "7", height: "7", rx: "1", key: "screen_card-1" }],
      ["path", { d: "M16 12h.01", key: "screen_card-2" }],
      ["path", { d: "M19 12h.01", key: "screen_card-3" }],
    ],
  },
  nfc_card: {
    label: "NFC card",
    node: [
      ["rect", { x: "2", y: "5.5", width: "20", height: "13", rx: "2", key: "nfc_card-0" }],
      ["path", { d: "M13 10a3 3 0 0 1 0 4", key: "nfc_card-1" }],
      ["path", { d: "M15.5 8.5a5 5 0 0 1 0 7", key: "nfc_card-2" }],
    ],
  },
  chip_card: {
    label: "Chip card",
    node: [
      ["rect", { x: "2", y: "5.5", width: "20", height: "13", rx: "2", key: "chip_card-0" }],
      ["rect", { x: "5", y: "8.5", width: "7", height: "7", rx: "1.5", key: "chip_card-1" }],
      ["path", { d: "M5 12h7", key: "chip_card-2" }],
    ],
  },
  card_set: {
    label: "Card set",
    node: [
      ["rect", { x: "2", y: "9", width: "16", height: "11", rx: "2", key: "card_set-0" }],
      ["path", { d: "M6 9V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2", key: "card_set-1" }],
      ["path", { d: "M8 12.5a2.5 2.5 0 0 1 0 4", key: "card_set-2" }],
      ["path", { d: "M10.5 11a5 5 0 0 1 0 7", key: "card_set-3" }],
    ],
  },
  device_with_cards: {
    label: "Device and cards",
    node: [
      ["path", { d: "M11 15H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3", key: "device_with_cards-0" }],
      ["path", { d: "M5.5 7a2.5 2.5 0 0 1 0 4", key: "device_with_cards-1" }],
      ["rect", { x: "13", y: "9", width: "9", height: "13", rx: "2", key: "device_with_cards-2" }],
      ["rect", { x: "15.5", y: "11.5", width: "4", height: "3.5", rx: "1", key: "device_with_cards-3" }],
      ["path", { d: "M17.5 18.5h.01", key: "device_with_cards-4" }],
    ],
  },
  nfc_paddle: {
    label: "NFC paddle",
    node: [
      ["circle", { cx: "8.5", cy: "12", r: "6.5", key: "nfc_paddle-0" }],
      ["path", { d: "M13.5 8H20a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-6.5", key: "nfc_paddle-1" }],
      ["rect", { x: "16", y: "10.5", width: "4", height: "3", rx: "1", key: "nfc_paddle-2" }],
      ["path", { d: "M7 10.5a2 2 0 0 1 0 3", key: "nfc_paddle-3" }],
      ["path", { d: "M9.5 9a4.5 4.5 0 0 1 0 6", key: "nfc_paddle-4" }],
    ],
  },
  fingerprint_pebble: {
    label: "Fingerprint pebble",
    node: [
      ["rect", { x: "3", y: "3", width: "18", height: "18", rx: "7", key: "fingerprint_pebble-0" }],
      ["path", { d: "M9.5 15a3 3 0 1 1 5 0", key: "fingerprint_pebble-1" }],
      ["path", { d: "M7.5 14.5a5 5 0 1 1 9 0", key: "fingerprint_pebble-2" }],
      ["path", { d: "M12 12.5v3", key: "fingerprint_pebble-3" }],
    ],
  },
  camera_stick: {
    label: "Camera stick",
    node: [
      ["rect", { x: "6", y: "2", width: "12", height: "20", rx: "2.5", key: "camera_stick-0" }],
      ["circle", { cx: "12", cy: "7", r: "2.5", key: "camera_stick-1" }],
      ["path", { d: "M12 7h.01", key: "camera_stick-2" }],
      ["rect", { x: "9", y: "12", width: "6", height: "7", rx: "1", key: "camera_stick-3" }],
    ],
  },
  joystick_board: {
    label: "Joystick board",
    node: [
      ["rect", { x: "2", y: "5", width: "20", height: "14", rx: "1", key: "joystick_board-0" }],
      ["path", { d: "M6 10.5v3M4.5 12h3", key: "joystick_board-1" }],
      ["rect", { x: "10", y: "8", width: "6", height: "8", rx: "1", key: "joystick_board-2" }],
      ["path", { d: "M19 9h.01", key: "joystick_board-3" }],
      ["path", { d: "M19 12h.01", key: "joystick_board-4" }],
      ["path", { d: "M19 15h.01", key: "joystick_board-5" }],
    ],
  },
  scanner_board: {
    label: "Scanner board",
    node: [
      ["rect", { x: "5", y: "7", width: "14", height: "15", rx: "1.5", key: "scanner_board-0" }],
      ["path", { d: "M8.5 7V4a1.5 1.5 0 0 1 1.5-1.5h4A1.5 1.5 0 0 1 15.5 4v3", key: "scanner_board-1" }],
      ["path", { d: "M10.5 4.75h3", key: "scanner_board-2" }],
      ["rect", { x: "8", y: "10", width: "8", height: "9", rx: "1", key: "scanner_board-3" }],
    ],
  },
} as const satisfies Record<string, { label: string; node: IconNode }>;

/** The id of a drawn icon, as the core stores it. */
export type DrawnWalletIconId = keyof typeof DRAWN_WALLET_ICONS;
