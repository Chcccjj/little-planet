/**
 * The page is the game. Block scroll, pinch-zoom, and the keys browsers use
 * to nudge the document. Camera zoom still listens on the canvas itself.
 */
export function lockDocumentScroll(): void {
  const prevent = (event: Event) => {
    event.preventDefault()
  }
  document.addEventListener('touchmove', prevent, { passive: false })
  document.addEventListener('gesturestart', prevent)
  window.addEventListener('wheel', prevent, { passive: false })
  window.addEventListener('keydown', (event) => {
    if (event.code === 'Space' || event.code.startsWith('Arrow')) event.preventDefault()
  })
}
