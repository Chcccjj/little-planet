export interface ScreenRect {
  left: number
  top: number
  width: number
  height: number
}

/** Pointer position inside a canvas rectangle, in normalized device coordinates. */
export function clientToNdc(clientX: number, clientY: number, rect: ScreenRect): { x: number; y: number } {
  return {
    x: ((clientX - rect.left) / rect.width) * 2 - 1,
    y: -((clientY - rect.top) / rect.height) * 2 + 1,
  }
}

/** Inverse of `clientToNdc`. `y` grows downward, matching pointer coordinates. */
export function ndcToClient(ndcX: number, ndcY: number, rect: ScreenRect): { x: number; y: number } {
  return {
    x: rect.left + (ndcX * 0.5 + 0.5) * rect.width,
    y: rect.top + (-ndcY * 0.5 + 0.5) * rect.height,
  }
}
