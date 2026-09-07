import { mat4, vec3 } from 'gl-matrix'
import './style.css'
import pyramidShader from './shaders/pyramid.wgsl?raw'
import fullscreenBgShader from './shaders/bg.wgsl?raw'
import { generatePyramidData } from './utils/genPyramidData'
import { paramConfigs, type ShaderParamsStore } from './config'
import { createStore } from './store'
import { checkWebGPUSupport, initControlsPanel } from './ui'
import { updateTextTexture } from './utils/textRender'
import { UNIFORM_BUFFER_SIZE, UNIFORM_OFFSETS } from './utils/uniformLayour'

function showUnsupportedOverlay() {
  const fallbackOverlay = document.getElementById('no-webgpu-overlay')
  if (fallbackOverlay) fallbackOverlay.classList.remove('hidden')
}

// Core WebGPU Setup
async function init() {
  if (!checkWebGPUSupport()) return

  const store = createStore<ShaderParamsStore>()
  paramConfigs.forEach((cfg) => {
    store[cfg.name] = cfg.defaultValue
  })

  initControlsPanel(store, paramConfigs)

  const canvas = document.getElementById('webgpu-canvas') as HTMLCanvasElement

  const adapter = await navigator.gpu.requestAdapter()
  if (!adapter) {
    showUnsupportedOverlay()
    return
  }

  const device = await adapter.requestDevice()

  device.lost.then((info) => {
    console.error(
      `WebGPU device lost (${info.reason ?? 'unknown'}): ${info.message}`,
    )
    stopLoop()
    if (info.reason !== 'destroyed') {
      showUnsupportedOverlay()
    }
  })

  const context = canvas.getContext('webgpu') as GPUCanvasContext
  const presentationFormat = navigator.gpu.getPreferredCanvasFormat()

  context.configure({
    device,
    format: presentationFormat,
    alphaMode: 'premultiplied',
  })

  const getDevicePixelRatio = () => Math.min(window.devicePixelRatio ?? 1)

  let depthTexture = device.createTexture({
    size: [1, 1],
    format: 'depth24plus',
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  })

  let bgTexture = device.createTexture({
    size: [1, 1, 1],
    format: 'rgba8unorm',
    usage:
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.RENDER_ATTACHMENT,
  })

  let isHovered = false

  const bgSampler = device.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
  })

  const { positions, normals } = generatePyramidData()

  const posBuffer = device.createBuffer({
    size: positions.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    mappedAtCreation: true,
  })
  new Float32Array(posBuffer.getMappedRange()).set(positions)
  posBuffer.unmap()

  const normalBuffer = device.createBuffer({
    size: normals.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    mappedAtCreation: true,
  })
  new Float32Array(normalBuffer.getMappedRange()).set(normals)
  normalBuffer.unmap()

  const pyramidUniformBuffer = device.createBuffer({
    size: UNIFORM_BUFFER_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })

  const bgPipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module: device.createShaderModule({ code: fullscreenBgShader }),
      entryPoint: 'vs_main',
    },
    fragment: {
      module: device.createShaderModule({ code: fullscreenBgShader }),
      entryPoint: 'fs_main',
      targets: [{ format: presentationFormat }],
    },
    primitive: { topology: 'triangle-list' },
    depthStencil: {
      depthWriteEnabled: true,
      depthCompare: 'less-equal',
      format: 'depth24plus',
    },
  })

  const pyramidPipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module: device.createShaderModule({ code: pyramidShader }),
      entryPoint: 'vs_main',
      buffers: [
        {
          arrayStride: 12,
          attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }],
        },
        {
          arrayStride: 12,
          attributes: [{ shaderLocation: 1, offset: 0, format: 'float32x3' }],
        },
      ],
    },
    fragment: {
      module: device.createShaderModule({ code: pyramidShader }),
      entryPoint: 'fs_main',
      targets: [{ format: presentationFormat }],
    },
    primitive: { topology: 'triangle-list', cullMode: 'back' },
    depthStencil: {
      depthWriteEnabled: true,
      depthCompare: 'less',
      format: 'depth24plus',
    },
  })

  let bgBindGroup: GPUBindGroup
  let pyramidBindGroup: GPUBindGroup

  function updateBindGroups() {
    bgBindGroup = device.createBindGroup({
      layout: bgPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: bgTexture.createView() },
        { binding: 1, resource: bgSampler },
      ],
    })

    pyramidBindGroup = device.createBindGroup({
      layout: pyramidPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: pyramidUniformBuffer } },
        { binding: 1, resource: bgTexture.createView() },
        { binding: 2, resource: bgSampler },
      ],
    })
  }

  // Interaction Events
  const hoverLink = document.getElementById('hover-link') as HTMLAnchorElement
  hoverLink.addEventListener('mouseenter', () => {
    isHovered = true
    updateTextTexture(device, bgTexture, canvas.width, canvas.height, isHovered)
  })
  hoverLink.addEventListener('mouseleave', () => {
    isHovered = false
    updateTextTexture(device, bgTexture, canvas.width, canvas.height, isHovered)
  })

  // Camera Configuration
  const projectionMatrix = mat4.create()
  const depthZO = mat4.fromValues(
    1,
    0,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    0,
    0.5,
    0,
    0,
    0,
    0.5,
    1,
  )

  const viewMatrix = mat4.create()
  const cameraPos = vec3.fromValues(0, 0, 4)
  mat4.lookAt(
    viewMatrix,
    cameraPos,
    vec3.fromValues(0, 0, 0),
    vec3.fromValues(0, 1, 0),
  )

  const viewProjMatrix = mat4.create()

  function handleResize() {
    const dpr = getDevicePixelRatio()
    canvas.width = Math.max(1, Math.floor(window.innerWidth * dpr))
    canvas.height = Math.max(1, Math.floor(window.innerHeight * dpr))
    canvas.style.width = `${window.innerWidth}px`
    canvas.style.height = `${window.innerHeight}px`

    bgTexture.destroy()
    bgTexture = device.createTexture({
      size: [canvas.width, canvas.height, 1],
      format: 'rgba8unorm',
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    })
    updateTextTexture(device, bgTexture, canvas.width, canvas.height, isHovered)

    depthTexture.destroy()
    depthTexture = device.createTexture({
      size: [canvas.width, canvas.height],
      format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    })

    updateBindGroups()

    mat4.perspective(
      projectionMatrix,
      Math.PI / 4,
      canvas.width / canvas.height,
      0.1,
      100.0,
    )
    mat4.multiply(projectionMatrix, depthZO, projectionMatrix)
    mat4.multiply(viewProjMatrix, projectionMatrix, viewMatrix)
  }

  let resizeTimeout: ReturnType<typeof setTimeout> | undefined
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout)
    resizeTimeout = setTimeout(handleResize, 100)
  })
  handleResize()

  let angle = 0
  const modelMatrix = mat4.create()
  let animationFrameId: number | null = null

  function frame() {
    animationFrameId = requestAnimationFrame(frame)

    angle = (angle - store.spin_speed) % (Math.PI * 2)

    mat4.identity(modelMatrix)
    mat4.rotateX(modelMatrix, modelMatrix, store.tilt_x)
    mat4.rotateY(modelMatrix, modelMatrix, angle)
    mat4.scale(
      modelMatrix,
      modelMatrix,
      vec3.fromValues(store.size, store.size, store.size),
    )

    device.queue.writeBuffer(
      pyramidUniformBuffer,
      UNIFORM_OFFSETS.MODEL,
      new Float32Array(modelMatrix as Float32Array),
    )
    device.queue.writeBuffer(
      pyramidUniformBuffer,
      UNIFORM_OFFSETS.VIEW_PROJ,
      new Float32Array(viewProjMatrix as Float32Array),
    )
    device.queue.writeBuffer(
      pyramidUniformBuffer,
      UNIFORM_OFFSETS.CAMERA_POS,
      new Float32Array([...cameraPos, 1.0]),
    )
    device.queue.writeBuffer(
      pyramidUniformBuffer,
      UNIFORM_OFFSETS.RESOLUTION,
      new Float32Array([canvas.width, canvas.height, 0, 0]),
    )
    // size, spin_speed, tilt_x handled by matrices
    const shaderParams = new Float32Array([
      store.ior,
      store.blur_base,
      store.blur_edge,
      store.distortion_base,
      store.distortion_edge,
      store.specular_intensity,
      store.specular_exponent,
      store.edge_glow,
      store.chromatic_aberration,
      0.0, // pad1
      0.0, // pad2
      0.0, // pad3
    ])
    device.queue.writeBuffer(
      pyramidUniformBuffer,
      UNIFORM_OFFSETS.SHADER_PARAMS,
      shaderParams,
    )

    const commandEncoder = device.createCommandEncoder()
    const passEncoder = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: context.getCurrentTexture().createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 1.0 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
      depthStencilAttachment: {
        view: depthTexture.createView(),
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    })

    passEncoder.setPipeline(bgPipeline)
    passEncoder.setBindGroup(0, bgBindGroup)
    passEncoder.draw(3, 1, 0, 0)

    passEncoder.setPipeline(pyramidPipeline)
    passEncoder.setBindGroup(0, pyramidBindGroup)
    passEncoder.setVertexBuffer(0, posBuffer)
    passEncoder.setVertexBuffer(1, normalBuffer)
    passEncoder.draw(18, 1, 0, 0)

    passEncoder.end()
    device.queue.submit([commandEncoder.finish()])
  }

  function startLoop() {
    if (animationFrameId === null) frame()
  }

  function stopLoop() {
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId)
      animationFrameId = null
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopLoop()
    } else {
      startLoop()
    }
  })

  startLoop()
}

init()
