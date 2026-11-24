const canvas = document.getElementById("glcanvas");
const gl = canvas.getContext("webgl2");

if (!gl) {
  alert("WebGL2 is not supported in this browser.");
}

// ==========================================
// 1. SHADERS
// ==========================================

const quadVertSource = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

// Heavy 2-Pass Separable Gaussian Blur (33-tap effective kernel per pass)
const mainFragSource = `#version 300 es
precision highp float;

uniform float iTime;
uniform vec2 iResolution;
uniform sampler2D BlurredCoverArt;

out vec4 fragColor;

const vec2 rotateCenter = vec2(0.5, 0.5);

vec2 RotateAroundCenter(vec2 point, float angle) {
  vec2 offset = point - rotateCenter;
  float s = sin(angle);
  float c = cos(angle);
  mat2 rot = mat2(c, -s, s, c);
  return rotateCenter + (rot * offset);
}

// Zoom into the center 55% of the photo so the subject (the blue box) dominates
// and outer background walls/tables stay mostly out of frame
vec3 sampleRotatedCover(vec2 offset, float radius, float angle) {
  vec2 uv = ((offset / radius) * 0.45) + 0.5;
  uv = RotateAroundCenter(uv, angle);
  return texture(BlurredCoverArt, uv).rgb;
}

float getChroma(vec3 c) {
  return max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
}

// Favor colorful pixels (blues/oranges) over dull gray/tan background pixels
vec3 blendChromaWeighted(vec3 base, vec3 orb, float mask) {
  float orbChroma = getChroma(orb);
  // Colorful pixels get full opacity; dull gray/beige pixels get dialed down
  float chromaWeight = mix(0.35, 1.0, smoothstep(0.05, 0.30, orbChroma));
  return mix(base, orb, mask * chromaWeight);
}

// Deepen rich colors without tinting neutral highlights
vec3 gradeSubjectFocus(vec3 color, float saturation, float contrast) {
  // Lower midpoint (0.38) lifts rich midtones on dark subjects like mahogany/cobalt
  color = clamp((color - 0.38) * contrast + 0.38, 0.0, 1.0);

  // Vibrance boost on colored areas
  float chroma = getChroma(color);
  float lum = dot(color, vec3(0.2126, 0.7152, 0.0722));
  float adaptiveSat = mix(1.0, saturation, smoothstep(0.03, 0.25, chroma));
  color = mix(vec3(lum), color, adaptiveSat);

  // Gentle shadow warmth & highlight roll-off so browns stay rich mahogany/amber
  color = pow(max(color, vec3(0.0)), vec3(0.93, 0.97, 1.03));
  color = color / (1.0 + color * 0.15);

  return clamp(color, 0.0, 1.0);
}

void main() {
  float largestAxis = max(iResolution.x, iResolution.y);
  bool isLandscape = iResolution.x > iResolution.y;

  // 1. Base background
  vec2 bgOrigin = iResolution.xy * 0.5;
  float bgRadius = largestAxis * 0.8;
  vec3 col = sampleRotatedCover(gl_FragCoord.xy - bgOrigin, bgRadius, iTime * -0.15);

  // 2. Center orb
  vec2 centerOrigin = iResolution.xy * 0.5 + vec2(sin(iTime * 0.2), cos(iTime * 0.17)) * (largestAxis * 0.12);
  float centerRadius = largestAxis * (isLandscape ? 0.6 : 0.5);
  vec2 centerOffset = gl_FragCoord.xy - centerOrigin;
  float centerMask = (1.0 - smoothstep(centerRadius * 0.1, centerRadius, length(centerOffset))) * 0.9;
  if (centerMask > 0.0) {
    vec3 orbCol = sampleRotatedCover(centerOffset, centerRadius, iTime * 0.25);
    col = blendChromaWeighted(col, orbCol, centerMask);
  }

  // 3. Top-Left orb
  vec2 leftOrigin = vec2(iResolution.x * 0.15, iResolution.y * 0.85);
  float leftRadius = largestAxis * 0.6;
  vec2 leftOffset = gl_FragCoord.xy - leftOrigin;
  float leftMask = (1.0 - smoothstep(leftRadius * 0.1, leftRadius, length(leftOffset))) * 0.9;
  if (leftMask > 0.0) {
    vec3 orbCol = sampleRotatedCover(leftOffset, leftRadius, iTime * 0.3 + 1.8);
    col = blendChromaWeighted(col, orbCol, leftMask);
  }

  // 4. Bottom-Right orb
  vec2 rightOrigin = vec2(iResolution.x * 0.85, iResolution.y * 0.15);
  float rightRadius = largestAxis * (isLandscape ? 0.55 : 0.45);
  vec2 rightOffset = gl_FragCoord.xy - rightOrigin;
  float rightMask = (1.0 - smoothstep(rightRadius * 0.1, rightRadius, length(rightOffset))) * 0.9;
  if (rightMask > 0.0) {
    vec3 orbCol = sampleRotatedCover(rightOffset, rightRadius, iTime * -0.28 + 3.5);
    col = blendChromaWeighted(col, orbCol, rightMask);
  }

  // Rich cobalt/navy tones with clean highlight protection
  col = gradeSubjectFocus(col, 1.45, 1.4);

  fragColor = vec4(col, 1.0);
}
`;

// Main Fluid Circles Shader (with soft feathered edges & saturation boost)
// Main Fluid Circles Shader (distinct color pockets + contrast)
const mainFragSource = `#version 300 es
precision highp float;

uniform float iTime;
uniform vec2 iResolution;
uniform sampler2D BlurredCoverArt;

out vec4 fragColor;

const vec2 rotateCenter = vec2(0.5, 0.5);

vec2 RotateAroundCenter(vec2 point, float angle) {
  vec2 offset = point - rotateCenter;
  float s = sin(angle);
  float c = cos(angle);
  mat2 rot = mat2(c, -s, s, c);
  return rotateCenter + (rot * offset);
}

// Sample the full cover art range (0.85 keeps all edge colors in play without corner streaking)
vec3 sampleRotatedCover(vec2 offset, float radius, float angle) {
  vec2 uv = ((offset / radius) * 0.85) + 0.5;
  uv = RotateAroundCenter(uv, angle);
  return texture(BlurredCoverArt, uv).rgb;
}

// Boost contrast & vibrance so darks stay deep and accent colors stand out
vec3 gradeColor(vec3 color, float saturation, float contrast) {
  // S-curve contrast around midpoint 0.5
  color = clamp((color - 0.5) * contrast + 0.5, 0.0, 1.0);
  // Vibrance/saturation boost
  float lum = dot(color, vec3(0.2126, 0.7152, 0.0722));
  return mix(vec3(lum), color, saturation);
}

void main() {
  float largestAxis = max(iResolution.x, iResolution.y);
  bool isLandscape = iResolution.x > iResolution.y;

  // 1. Base background (tighter radius = more color variation across screen)
  vec2 bgOrigin = iResolution.xy * 0.5;
  float bgRadius = largestAxis * 0.75;
  vec3 col = sampleRotatedCover(gl_FragCoord.xy - bgOrigin, bgRadius, iTime * -0.15);

  // 2. Center orb (slightly off-center drift so it doesn't sit static)
  vec2 centerOrigin = iResolution.xy * 0.5 + vec2(sin(iTime * 0.2), cos(iTime * 0.17)) * (largestAxis * 0.12);
  float centerRadius = largestAxis * (isLandscape ? 0.55 : 0.45);
  vec2 centerOffset = gl_FragCoord.xy - centerOrigin;
  float centerMask = 1.0 - smoothstep(centerRadius * 0.1, centerRadius, length(centerOffset));
  if (centerMask > 0.0) {
    vec3 orbCol = sampleRotatedCover(centerOffset, centerRadius, iTime * 0.25);
    col = mix(col, orbCol, centerMask * 0.85);
  }

  // 3. Top-Left orb
  vec2 leftOrigin = vec2(iResolution.x * 0.15, iResolution.y * 0.85);
  float leftRadius = largestAxis * 0.55;
  vec2 leftOffset = gl_FragCoord.xy - leftOrigin;
  float leftMask = 1.0 - smoothstep(leftRadius * 0.1, leftRadius, length(leftOffset));
  if (leftMask > 0.0) {
    vec3 orbCol = sampleRotatedCover(leftOffset, leftRadius, iTime * 0.3 + 1.8);
    col = mix(col, orbCol, leftMask * 0.85);
  }

  // 4. Bottom-Right orb
  vec2 rightOrigin = vec2(iResolution.x * 0.85, iResolution.y * 0.15);
  float rightRadius = largestAxis * (isLandscape ? 0.5 : 0.45);
  vec2 rightOffset = gl_FragCoord.xy - rightOrigin;
  float rightMask = 1.0 - smoothstep(rightRadius * 0.1, rightRadius, length(rightOffset));
  if (rightMask > 0.0) {
    vec3 orbCol = sampleRotatedCover(rightOffset, rightRadius, iTime * -0.28 + 3.5);
    col = mix(col, orbCol, rightMask * 0.85);
  }

  // Keep dark shadows deep and secondary colors vivid
  col = gradeColor(col, 1.35, 1.35);

  fragColor = vec4(col, 1.0);
}
`;

// ==========================================
// 2. PROGRAM & GEOMETRY SETUP
// ==========================================

function compileShader(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error("Shader compile error:", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(vertSrc, fragSrc) {
  const prog = gl.createProgram();
  gl.attachShader(prog, compileShader(gl.VERTEX_SHADER, vertSrc));
  gl.attachShader(prog, compileShader(gl.FRAGMENT_SHADER, fragSrc));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error("Program link error:", gl.getProgramInfoLog(prog));
  }
  return prog;
}

const blurProgram = createProgram(quadVertSource, gaussianBlurFragSource);
const mainProgram = createProgram(quadVertSource, mainFragSource);

const vao = gl.createVertexArray();
gl.bindVertexArray(vao);

const posBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
gl.bufferData(
  gl.ARRAY_BUFFER,
  new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
  gl.STATIC_DRAW
);

const posLoc = gl.getAttribLocation(mainProgram, "a_position");
gl.enableVertexAttribArray(posLoc);
gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

// ==========================================
// 3. MULTI-PASS GAUSSIAN BLUR PIPELINE
// ==========================================

function createFBO(width, height) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  return { fbo, tex, width, height };
}

function generateHeavyGaussianBlur(sourceTex, passes = 3, radius = 2.5) {
  const size = 256; // Compact resolution eliminates banding & boosts blur radius
  const ping = createFBO(size, size);
  const pong = createFBO(size, size);

  gl.bindVertexArray(vao);
  gl.useProgram(blurProgram);
  gl.activeTexture(gl.TEXTURE0);
  gl.uniform1i(gl.getUniformLocation(blurProgram, "u_tex"), 0);
  gl.uniform1f(gl.getUniformLocation(blurProgram, "u_radius"), radius);

  const dirLoc = gl.getUniformLocation(blurProgram, "u_direction");
  let inputTex = sourceTex;

  for (let i = 0; i < passes; i++) {
    // Horizontal pass -> ping
    gl.bindFramebuffer(gl.FRAMEBUFFER, ping.fbo);
    gl.viewport(0, 0, size, size);
    gl.bindTexture(gl.TEXTURE_2D, inputTex);
    gl.uniform2f(dirLoc, 1.0 / size, 0.0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // Vertical pass -> pong
    gl.bindFramebuffer(gl.FRAMEBUFFER, pong.fbo);
    gl.viewport(0, 0, size, size);
    gl.bindTexture(gl.TEXTURE_2D, ping.tex);
    gl.uniform2f(dirLoc, 0.0, 1.0 / size);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    inputTex = pong.tex;
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.deleteFramebuffer(ping.fbo);
  gl.deleteTexture(ping.tex);
  gl.deleteFramebuffer(pong.fbo);

  return pong.tex;
}

// ==========================================
// 4. LOAD & BLUR COVER ART
// ==========================================

let blurredCoverTexture = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, blurredCoverTexture);
gl.texImage2D(
  gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0,
  gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([15, 15, 20, 255])
);

function loadAndBlurCover(url) {
  const rawTex = gl.createTexture();
  const image = new Image();
  image.crossOrigin = "anonymous";

  image.onload = () => {
    gl.bindTexture(gl.TEXTURE_2D, rawTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    const newBlurred = generateHeavyGaussianBlur(rawTex, 3, 2.5);
    gl.deleteTexture(blurredCoverTexture);
    gl.deleteTexture(rawTex);
    blurredCoverTexture = newBlurred;
  };

  image.src = url;
}

loadAndBlurCover("img/pinch.jpg");

// ==========================================
// 5. MAIN RENDER LOOP
// ==========================================

const resLoc = gl.getUniformLocation(mainProgram, "iResolution");
const timeLoc = gl.getUniformLocation(mainProgram, "iTime");
const texLoc = gl.getUniformLocation(mainProgram, "BlurredCoverArt");

function resize() {
  const dpr = window.devicePixelRatio || 1;
  const width = Math.floor(canvas.clientWidth * dpr);
  const height = Math.floor(canvas.clientHeight * dpr);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function render(now) {
  resize();

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.useProgram(mainProgram);
  gl.bindVertexArray(vao);

  gl.uniform2f(resLoc, canvas.width, canvas.height);
  gl.uniform1f(timeLoc, now * 0.001);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, blurredCoverTexture);
  gl.uniform1i(texLoc, 0);

  gl.drawArrays(gl.TRIANGLES, 0, 6);
  requestAnimationFrame(render);
}

requestAnimationFrame(render);
