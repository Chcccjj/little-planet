import { lockDocumentScroll } from './core/scrollLock'
import { isWebGLAvailable, showWebGLFallback } from './scene/webglFallback'

lockDocumentScroll()

const container = document.querySelector<HTMLElement>('#app')
if (!container) throw new Error('Missing #app')

if (!isWebGLAvailable()) {
  showWebGLFallback(container)
} else {
  // three and the scene graph load after the WebGL check, so a browser
  // without a context never downloads the renderer.
  void import('./boot')
    .then(({ boot }) => {
      boot(container)
    })
    .catch((error: unknown) => {
      console.error(error)
      showWebGLFallback(container)
    })
}
