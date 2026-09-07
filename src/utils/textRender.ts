const TEXT = 'https://github.com/kifrud/wgput'

const textCanvas = document.createElement('canvas')
const textCtx = textCanvas.getContext('2d')!

export function updateTextTexture(
  device: GPUDevice,
  texture: GPUTexture,
  width: number,
  height: number,
  hovered: boolean,
) {
  textCanvas.width = width
  textCanvas.height = height

  // Background
  textCtx.fillStyle = '#000000'
  textCtx.fillRect(0, 0, width, height)

  // Text
  textCtx.fillStyle = '#ffffff'
  textCtx.font = `1rem "Anonymous Pro", monospace`
  textCtx.textAlign = 'center'
  textCtx.textBaseline = 'middle'
  textCtx.fillText(TEXT, width / 2, height / 2)

  if (hovered) {
    const metrics = textCtx.measureText(TEXT)
    const textWidth = metrics.width

    textCtx.fillRect((width - textWidth) / 2, height / 2 + 8, textWidth, 1)
  }

  // Send updated canvas to the GPU
  device.queue.copyExternalImageToTexture({ source: textCanvas }, { texture }, [
    width,
    height,
  ])
}
