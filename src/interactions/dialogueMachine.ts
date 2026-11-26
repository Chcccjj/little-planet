export const DIALOGUE_CPS = 26

export interface DialogueMachine {
  pages: readonly string[]
  page: number
  shown: number
  carry: number
  open: boolean
}

export function createDialogueMachine(): DialogueMachine {
  return { pages: [], page: 0, shown: 0, carry: 0, open: false }
}

export function dialogueTyping(state: DialogueMachine): boolean {
  return state.open && state.shown < (state.pages[state.page]?.length ?? 0)
}

export function dialogueLine(state: DialogueMachine): string {
  return state.pages[state.page] ?? ''
}

export function openDialogue(state: DialogueMachine, pages: readonly string[]): void {
  if (pages.length === 0) return
  state.pages = pages
  state.page = 0
  state.shown = 0
  state.carry = 0
  state.open = true
}

/** Finish the current sentence, then turn the page, then close. */
export function advanceDialogue(state: DialogueMachine): void {
  if (!state.open) return
  const line = state.pages[state.page] ?? ''
  if (state.shown < line.length) {
    state.shown = line.length
    state.carry = 0
    return
  }
  if (state.page < state.pages.length - 1) {
    state.page += 1
    state.shown = 0
    state.carry = 0
    return
  }
  state.open = false
  state.pages = []
  state.page = 0
  state.shown = 0
}

export function closeDialogue(state: DialogueMachine): void {
  if (!state.open) return
  state.open = false
  state.pages = []
  state.page = 0
  state.shown = 0
  state.carry = 0
}

/** Reveal characters. Returns true when the visible text changed. */
export function tickDialogue(state: DialogueMachine, dt: number, cps = DIALOGUE_CPS): boolean {
  if (!dialogueTyping(state)) return false
  const line = state.pages[state.page] ?? ''
  state.carry += dt * cps
  const step = Math.floor(state.carry)
  if (step <= 0) return false
  state.carry -= step
  state.shown = Math.min(line.length, state.shown + step)
  return true
}
