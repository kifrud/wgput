export function generatePyramidData() {
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
