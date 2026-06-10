/**
 * Friendly labels for `KeyboardEvent.code` values. Codes are
 * layout-independent (physical keys), which is what you want for a
 * hold-to-talk bind; labels are what we show the user.
 */
const SPECIAL_LABELS: Record<string, string> = {
  Space: "Space",
  Enter: "Enter",
  Tab: "Tab",
  Backquote: "`",
  Backslash: "\\",
  BracketLeft: "[",
  BracketRight: "]",
  Comma: ",",
  Period: ".",
  Quote: "'",
  Semicolon: ";",
  Slash: "/",
  Minus: "-",
  Equal: "=",
  CapsLock: "Caps Lock",
  ShiftLeft: "Left Shift",
  ShiftRight: "Right Shift",
  ControlLeft: "Left Ctrl",
  ControlRight: "Right Ctrl",
  AltLeft: "Left Alt",
  AltRight: "Right Alt",
  MetaLeft: "Left Cmd",
  MetaRight: "Right Cmd",
  ArrowUp: "Up Arrow",
  ArrowDown: "Down Arrow",
  ArrowLeft: "Left Arrow",
  ArrowRight: "Right Arrow",
};

export function formatKeyCode(code: string): string {
  const special = SPECIAL_LABELS[code];
  if (special) {
    return special;
  }

  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) {
    return letter[1];
  }

  const digit = /^(?:Digit|Numpad)(\d)$/.exec(code);
  if (digit) {
    return digit[1];
  }

  if (/^F\d{1,2}$/.test(code)) {
    return code;
  }

  // Fallback: split camel case ("PageDown" → "Page Down").
  return code.replaceAll(/([a-z])([A-Z])/g, "$1 $2");
}

/** Escape stays the cancel key in both the recorder and the lesson room. */
export function isRecordableKey(code: string): boolean {
  return code !== "Escape";
}
