import { mat4, vec3 } from "gl-matrix";
import "./style.css";
import pyramidShader from "./shaders/pyramid.wgsl?raw";
import fullscreenBgShader from "./shaders/bg.wgsl?raw";

function generatePyramidData() {
  const w = 1.25; // Width & Depth
  const h = 1.35; // Height of the tip
  const b = -1; // Bottom base Y level

  const positions = new Float32Array([
    // Front face
    -w,
    b,
    w,
    w,
    b,
    w,
    0,
    h,
    0,
    // Right face
    w,
    b,
    w,
    w,
    b,
    -w,
    0,
    h,
    0,
    // Back face
    w,
    b,
    -w,
    -w,
    b,
    -w,
    0,
    h,
    0,
    // Left face
    -w,
    b,
    -w,
    -w,
    b,
    w,
    0,
    h,
    0,
    // Bottom faces
    -w,
    b,
    -w,
    w,
    b,
    -w,
    w,
    b,
    w,
    -w,
    b,
    -w,
    w,
    b,
    w,
    -w,
    b,
    w,
  ]);

  const normals = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 9) {
    const p0x = positions[i],
      p0y = positions[i + 1],
      p0z = positions[i + 2];
    const p1x = positions[i + 3],
      p1y = positions[i + 4],
      p1z = positions[i + 5];
    const p2x = positions[i + 6],
      p2y = positions[i + 7],
      p2z = positions[i + 8];

    const ux = p1x - p0x,
      uy = p1y - p0y,
      uz = p1z - p0z;
    const vx = p2x - p0x,
      vy = p2y - p0y,
      vz = p2z - p0z;

    let nx = uy * vz - uz * vy,
      ny = uz * vx - ux * vz,
      nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    nx /= len;
    ny /= len;
    nz /= len;

    for (let v = 0; v < 3; v++) {
      normals[i + v * 3] = nx;
      normals[i + v * 3 + 1] = ny;
      normals[i + v * 3 + 2] = nz;
    }
  }
  return { positions, normals };
}

// Global offscreen canvas for text rendering
const textCanvas = document.createElement("canvas");
const textCtx = textCanvas.getContext("2d")!;

// Re-draws the canvas and pushes it to the GPU texture
function updateTextTexture(
  device: GPUDevice,
  texture: GPUTexture,
  width: number,
  height: number,
  hovered: boolean,
) {
  textCanvas.width = width;
  textCanvas.height = height;

  // Background
  textCtx.fillStyle = "#000000";
  textCtx.fillRect(0, 0, width, height);

  // Text
  textCtx.fillStyle = "#ffffff";
  textCtx.font = '16px "Anonymous Pro", monospace';
  textCtx.textAlign = "center";
  textCtx.textBaseline = "middle";
  const text = "text";
  textCtx.fillText(text, width / 2, height / 2);

  // Draw the underline if hovered!
  if (hovered) {
    const metrics = textCtx.measureText(text);
    const textWidth = metrics.width;
    // Positioned roughly 45px below the middle vertical alignment
    textCtx.fillRect((width - textWidth) / 2, height / 2 + 8, textWidth, 1);
  }

  // Send updated canvas to the GPU
  device.queue.copyExternalImageToTexture(
    { source: textCanvas },
    { texture: texture },
    [width, height],
  );
}

// Core WebGPU Setup
async function init() {
  const canvas = document.getElementById("webgpu-canvas") as HTMLCanvasElement;
  if (!navigator.gpu) {
    alert("WebGPU is not supported on this browser.");
    return;
  }

  const adapter = await navigator.gpu.requestAdapter();
  const device = await adapter!.requestDevice();
  const context = canvas.getContext("webgpu") as GPUCanvasContext;
  const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  context.configure({
    device,
    format: presentationFormat,
    alphaMode: "premultiplied",
  });

  let depthTexture = device.createTexture({
    size: [canvas.width, canvas.height],
    format: "depth24plus",
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });

  let bgTexture = device.createTexture({
    size: [canvas.width, canvas.height, 1],
    format: "rgba8unorm",
    usage:
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.RENDER_ATTACHMENT,
  });

  // Initial draw (No hover)
  let isHovered = false;
  updateTextTexture(device, bgTexture, canvas.width, canvas.height, isHovered);

  const bgSampler = device.createSampler({
    magFilter: "linear",
    minFilter: "linear",
    addressModeU: "clamp-to-edge",
    addressModeV: "clamp-to-edge",
  });

  const { positions, normals } = generatePyramidData();

  const posBuffer = device.createBuffer({
    size: positions.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    mappedAtCreation: true,
  });
  new Float32Array(posBuffer.getMappedRange()).set(positions);
  posBuffer.unmap();

  const normalBuffer = device.createBuffer({
    size: normals.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    mappedAtCreation: true,
  });
  new Float32Array(normalBuffer.getMappedRange()).set(normals);
  normalBuffer.unmap();

  const pyramidUniformBuffer = device.createBuffer({
    size: 208,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const bgPipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: {
      module: device.createShaderModule({ code: fullscreenBgShader }),
      entryPoint: "vs_main",
    },
    fragment: {
      module: device.createShaderModule({ code: fullscreenBgShader }),
      entryPoint: "fs_main",
      targets: [{ format: presentationFormat }],
    },
    primitive: { topology: "triangle-list" },
    depthStencil: {
      depthWriteEnabled: true,
      depthCompare: "less-equal",
      format: "depth24plus",
    },
  });

  const pyramidPipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: {
      module: device.createShaderModule({ code: pyramidShader }),
      entryPoint: "vs_main",
      buffers: [
        {
          arrayStride: 12,
          attributes: [{ shaderLocation: 0, offset: 0, format: "float32x3" }],
        },
        {
          arrayStride: 12,
          attributes: [{ shaderLocation: 1, offset: 0, format: "float32x3" }],
        },
      ],
    },
    fragment: {
      module: device.createShaderModule({ code: pyramidShader }),
      entryPoint: "fs_main",
      targets: [{ format: presentationFormat }],
    },
    primitive: { topology: "triangle-list", cullMode: "back" },
    depthStencil: {
      depthWriteEnabled: true,
      depthCompare: "less",
      format: "depth24plus",
    },
  });

  let bgBindGroup: GPUBindGroup;
  let pyramidBindGroup: GPUBindGroup;

  function updateBindGroups() {
    bgBindGroup = device.createBindGroup({
      layout: bgPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: bgTexture.createView() },
        { binding: 1, resource: bgSampler },
      ],
    });

    pyramidBindGroup = device.createBindGroup({
      layout: pyramidPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: pyramidUniformBuffer } },
        { binding: 1, resource: bgTexture.createView() },
        { binding: 2, resource: bgSampler },
      ],
    });
  }
  updateBindGroups();

  // Interaction Events
  const hoverLink = document.getElementById("hover-link") as HTMLAnchorElement;
  hoverLink.addEventListener("mouseenter", () => {
    isHovered = true;
    updateTextTexture(
      device,
      bgTexture,
      canvas.width,
      canvas.height,
      isHovered,
    );
  });
  hoverLink.addEventListener("mouseleave", () => {
    isHovered = false;
    updateTextTexture(
      device,
      bgTexture,
      canvas.width,
      canvas.height,
      isHovered,
    );
  });

  // Camera Configuration
  const projectionMatrix = mat4.create();
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
  );

  const viewMatrix = mat4.create();
  const cameraPos = vec3.fromValues(0, 0, 4);
  mat4.lookAt(
    viewMatrix,
    cameraPos,
    vec3.fromValues(0, 0, 0),
    vec3.fromValues(0, 1, 0),
  );

  const viewProjMatrix = mat4.create();

  function handleResize() {
    canvas.width = Math.max(1, window.innerWidth);
    canvas.height = Math.max(1, window.innerHeight);

    bgTexture.destroy();
    bgTexture = device.createTexture({
      size: [canvas.width, canvas.height, 1],
      format: "rgba8unorm",
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });
    updateTextTexture(
      device,
      bgTexture,
      canvas.width,
      canvas.height,
      isHovered,
    );

    depthTexture.destroy();
    depthTexture = device.createTexture({
      size: [canvas.width, canvas.height],
      format: "depth24plus",
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });

    updateBindGroups();

    mat4.perspective(
      projectionMatrix,
      Math.PI / 4,
      canvas.width / canvas.height,
      0.1,
      100.0,
    );
    mat4.multiply(projectionMatrix, depthZO, projectionMatrix);
    mat4.multiply(viewProjMatrix, projectionMatrix, viewMatrix);
  }
  window.addEventListener("resize", handleResize);
  handleResize();

  let angle = 0;
  const modelMatrix = mat4.create();

  function frame() {
    angle = (angle - 0.015) % (Math.PI * 2);

    mat4.identity(modelMatrix);
    mat4.rotateX(modelMatrix, modelMatrix, Math.PI / 6);
    mat4.rotateY(modelMatrix, modelMatrix, angle);

    mat4.scale(modelMatrix, modelMatrix, vec3.fromValues(0.75, 0.75, 0.75));

    device.queue.writeBuffer(
      pyramidUniformBuffer,
      0,
      new Float32Array(modelMatrix as Float32Array),
    );
    device.queue.writeBuffer(
      pyramidUniformBuffer,
      64,
      new Float32Array(viewProjMatrix as Float32Array),
    );
    device.queue.writeBuffer(
      pyramidUniformBuffer,
      128,
      new Float32Array([...cameraPos, 1.0]),
    );
    device.queue.writeBuffer(
      pyramidUniformBuffer,
      144,
      new Float32Array([canvas.width, canvas.height, 0, 0]), // Includes the vec2 padding
    );

    // Reactive parameters start at byte offset 160
    const shaderParams = new Float32Array([
      1.5, // [0] ior
      0.0007, // [1] blur_base
      0.0025, // [2] blur_edge
      0.01, // [3] distortion_base
      0.025, // [4] distortion_edge
      0.8, // [5] specular_intensity
      64.0, // [6] specular_exponent
      0.3, // [7] edge_glow
      0.05, // [8] chromatic_aberration
      0.0, // [9] pad1
      0.0, // [10] pad2
      0.0, // [11] pad3
    ]);
    device.queue.writeBuffer(pyramidUniformBuffer, 160, shaderParams);

    const commandEncoder = device.createCommandEncoder();
    const passEncoder = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: context.getCurrentTexture().createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 1.0 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
      depthStencilAttachment: {
        view: depthTexture.createView(),
        depthClearValue: 1.0,
        depthLoadOp: "clear",
        depthStoreOp: "store",
      },
    });

    passEncoder.setPipeline(bgPipeline);
    passEncoder.setBindGroup(0, bgBindGroup);
    passEncoder.draw(3, 1, 0, 0);

    passEncoder.setPipeline(pyramidPipeline);
    passEncoder.setBindGroup(0, pyramidBindGroup);
    passEncoder.setVertexBuffer(0, posBuffer);
    passEncoder.setVertexBuffer(1, normalBuffer);
    passEncoder.draw(18, 1, 0, 0);

    passEncoder.end();
    device.queue.submit([commandEncoder.finish()]);

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

init();
