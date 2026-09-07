export interface ParamConfig {
  name: string
  min: number
  max: number
  step: number
  defaultValue: number
}

export const paramConfigs: ParamConfig[] = [
  { name: 'ior', min: 1.0, max: 3.0, step: 0.01, defaultValue: 1.5 },
  {
    name: 'blur_base',
    min: 0.0,
    max: 0.02,
    step: 0.0001,
    defaultValue: 0.0007,
  },
  {
    name: 'blur_edge',
    min: 0.0,
    max: 0.05,
    step: 0.0001,
    defaultValue: 0.0025,
  },
  {
    name: 'distortion_base',
    min: 0.0,
    max: 0.2,
    step: 0.001,
    defaultValue: 0.01,
  },
  {
    name: 'distortion_edge',
    min: 0.0,
    max: 0.2,
    step: 0.001,
    defaultValue: 0.025,
  },
  {
    name: 'specular_intensity',
    min: 0.0,
    max: 3.0,
    step: 0.01,
    defaultValue: 0.8,
  },
  {
    name: 'specular_exponent',
    min: 1.0,
    max: 128.0,
    step: 1.0,
    defaultValue: 64.0,
  },
  { name: 'edge_glow', min: 0.0, max: 2.0, step: 0.01, defaultValue: 0.3 },
  {
    name: 'chromatic_aberration',
    min: 0.0,
    max: 0.2,
    step: 0.001,
    defaultValue: 0.05,
  },
  { name: 'size', min: 0.1, max: 3.0, step: 0.01, defaultValue: 0.75 },
  { name: 'spin_speed', min: -0.1, max: 0.1, step: 0.001, defaultValue: 0.015 },
  { name: 'tilt_x', min: -3.14, max: 3.14, step: 0.01, defaultValue: 0.523 },
]

export type ShaderParamsStore = Record<string, number>
