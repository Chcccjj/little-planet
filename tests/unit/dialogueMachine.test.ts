import { describe, expect, it } from 'vitest'
import {
  advanceDialogue,
  closeDialogue,
  createDialogueMachine,
  dialogueLine,
  dialogueTyping,
  openDialogue,
  tickDialogue,
} from '../../src/interactions/dialogueMachine'
import { exceedsTapSlop } from '../../src/interactions/tapMath'

describe('dialogueMachine', () => {
  const pages = ['玫瑰', '玻璃罩']

  it('types a page, finishes it, turns, then closes', () => {
    const state = createDialogueMachine()
    openDialogue(state, [])
    expect(state.open).toBe(false)

    openDialogue(state, pages)
    expect(state.open).toBe(true)
    expect(dialogueTyping(state)).toBe(true)
    expect(tickDialogue(state, 0.01)).toBe(false)
    expect(tickDialogue(state, 0.04)).toBe(true)
    expect(state.shown).toBeGreaterThan(0)
    expect(state.shown).toBeLessThan(pages[0].length)

    advanceDialogue(state)
    expect(dialogueLine(state)).toBe('玫瑰')
    expect(dialogueTyping(state)).toBe(false)

    advanceDialogue(state)
    expect(state.page).toBe(1)
    expect(state.shown).toBe(0)
    expect(dialogueLine(state)).toBe('玻璃罩')

    advanceDialogue(state)
    expect(dialogueTyping(state)).toBe(false)
    expect(state.page).toBe(1)
    advanceDialogue(state)
    expect(state.open).toBe(false)
  })

  it('close drops the page without waiting for the last sentence', () => {
    const state = createDialogueMachine()
    openDialogue(state, pages)
    tickDialogue(state, 1)
    closeDialogue(state)
    expect(state.open).toBe(false)
    expect(state.pages).toEqual([])
    expect(state.carry).toBe(0)
    closeDialogue(state)
    expect(state.open).toBe(false)
  })
})

describe('exceedsTapSlop', () => {
  it('treats a 16px landing as a tap and anything past that as a drag', () => {
    expect(exceedsTapSlop(0, 0)).toBe(false)
    expect(exceedsTapSlop(16, 0)).toBe(false)
    expect(exceedsTapSlop(0, 16.01)).toBe(true)
    expect(exceedsTapSlop(12, 12)).toBe(true)
  })
})
