struct Uniforms {
    model: mat4x4<f32>,
    view_proj: mat4x4<f32>,
    camera_pos: vec4<f32>,
    resolution: vec2<f32>,
    padding: vec2<f32>,
    ior: f32,
    blur_base: f32,
    blur_edge: f32,
    distortion_base: f32,
    distortion_edge: f32,
    specular_intensity: f32,
    specular_exponent: f32,
    edge_glow: f32,
    chromatic_aberration: f32,
    pad1: f32,
    pad2: f32,
    pad3: f32,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var bg_texture: texture_2d<f32>;
@group(0) @binding(2) var bg_sampler: sampler;

struct VertexInput {
    @location(0) position: vec3<f32>,
    @location(1) normal: vec3<f32>,
};

struct VertexOutput {
    @builtin(position) clip_pos: vec4<f32>,
    @location(0) world_pos: vec3<f32>,
    @location(1) normal: vec3<f32>,
};

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
    var out: VertexOutput;
    let world_pos = uniforms.model * vec4<f32>(in.position, 1.0);
    out.world_pos = world_pos.xyz;
    out.clip_pos = uniforms.view_proj * world_pos;
    out.normal = (uniforms.model * vec4<f32>(in.normal, 0.0)).xyz;
    return out;
}

// HELPER: Safely handle Total Internal Reflection (TIR)
fn safe_refract(i: vec3<f32>, n: vec3<f32>, eta: f32) -> vec3<f32> {
    let r = refract(i, n, eta);
    if dot(r, r) < 0.01 {
        return reflect(i, n);
    }
    return r;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let normal = normalize(in.normal);
    let view_dir = normalize(in.world_pos - uniforms.camera_pos.xyz);
    let cos_theta = max(dot(-view_dir, normal), 0.0);

    // FRESNEL EFFECT
    let r0 = pow((1.0 - uniforms.ior) / (1.0 + uniforms.ior), 2.0);
    let reflectance = r0 + (1.0 - r0) * pow(1.0 - cos_theta, 5.0);

    // CHROMATIC ABERRATION (Now using your reactive variable)
    let ior_r = uniforms.ior - uniforms.chromatic_aberration;
    let ior_g = uniforms.ior;
    let ior_b = uniforms.ior + uniforms.chromatic_aberration;

    let refract_r = safe_refract(view_dir, normal, 1.0 / ior_r);
    let refract_g = safe_refract(view_dir, normal, 1.0 / ior_g);
    let refract_b = safe_refract(view_dir, normal, 1.0 / ior_b);

    let screen_uv = in.clip_pos.xy / uniforms.resolution;
    let edge_factor = pow(1.0 - cos_theta, 3.0);
    let distortion = uniforms.distortion_base + (edge_factor * uniforms.distortion_edge);

    let offset_r = vec2<f32>(refract_r.x, -refract_r.y) * distortion;
    let offset_g = vec2<f32>(refract_g.x, -refract_g.y) * distortion;
    let offset_b = vec2<f32>(refract_b.x, -refract_b.y) * distortion;

    // VOGEL SPIRAL BLUR
    let blur_radius = uniforms.blur_base + (edge_factor * uniforms.blur_edge);
    const GOLDEN_ANGLE: f32 = 2.39996323;
    const TAPS: f32 = 32.0;

    var refracted_color = vec3<f32>(0.0);

    for (var i = 0u; i < 32u; i = i + 1u) {
        let fi = f32(i);
        let r = sqrt(fi + 0.5) / sqrt(TAPS);
        let theta = fi * GOLDEN_ANGLE;
        let blur_offset = vec2<f32>(cos(theta), sin(theta)) * blur_radius * r;

        let uv_r = clamp(screen_uv + offset_r + blur_offset, vec2<f32>(0.0), vec2<f32>(1.0));
        let uv_g = clamp(screen_uv + offset_g + blur_offset, vec2<f32>(0.0), vec2<f32>(1.0));
        let uv_b = clamp(screen_uv + offset_b + blur_offset, vec2<f32>(0.0), vec2<f32>(1.0));

        refracted_color.r += textureSampleLevel(bg_texture, bg_sampler, uv_r, 0.0).r;
        refracted_color.g += textureSampleLevel(bg_texture, bg_sampler, uv_g, 0.0).g;
        refracted_color.b += textureSampleLevel(bg_texture, bg_sampler, uv_b, 0.0).b;
    }
    refracted_color /= TAPS;

    // LIGHTING
    let light_dir = normalize(vec3<f32>(0.5, 1.0, 0.8));
    let half_vec = normalize(light_dir - view_dir);
    let spec_angle = max(dot(normal, half_vec), 0.0);

    let specular = pow(spec_angle, uniforms.specular_exponent) * uniforms.specular_intensity;

    // WIDER, MORE VISIBLE RIM LIGHTING
    // Lowered the exponent from 3.0 to 1.5 so the light wraps around the edge more
    let rim_width = pow(1.0 - cos_theta, 1.5);
    let edge_glow_color = vec3<f32>(1.0) * rim_width * uniforms.edge_glow;

    // Mix
    let final_color = mix(refracted_color, vec3<f32>(1.0), reflectance * 0.3) + vec3<f32>(specular) + edge_glow_color;

    return vec4<f32>(final_color, 1.0);
}