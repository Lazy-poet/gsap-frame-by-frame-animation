import * as PIXI from 'pixi.js';
import { gsap } from 'gsap';
import { AdjustmentFilter } from '@pixi/filter-adjustment';
import { OutlineFilter } from '@pixi/filter-outline';
import { DropShadowFilter } from '@pixi/filter-drop-shadow';
import {
  AlignCaptionHorizontal,
  AlignCaptionVertical,
  Caption,
  Gradient,
  GrandientType,
  VignetteType,
  Image,
  LockAR,
  MaskChannel,
  Resolution,
  SizeMode,
  Sprite,
  TransitionValues,
  Uniform,
} from './types';
import { Color, getGradient } from './utils';
import { ColorReplaceFilter } from '@pixi/filter-color-replace';
import { Rectangle } from 'pixi.js';

const OBJECT_TRANSITIONS: Record<string, TransitionValues> = {
  '126': 'angular',
  '149': 'displacementwipe',
  '150': 'displacementin',
  '151': 'displacementin',
  '204': 'windowslice',
  '205': 'windowslice',
  '207': 'windowslice',
  '334': 'scalein',
  '335': 'fadein',
  '336': 'rotatein',
  '384': 'wipein',
  '113': 'wipehorizontalopen',
};

export function prepareObjectForKeyframeComparison(keyframe: object) {
  let modified = JSON.parse(JSON.stringify(keyframe));
  if (!modified.hasOwnProperty('offsetX')) {
    modified['offsetX'] = '0';
  }
  if (!modified.hasOwnProperty('offsetY')) {
    modified['offsetY'] = '0';
  }

  if (!keyframe.hasOwnProperty('rotation')) {
    modified['rotation'] = '0';
  }

  return modified;
}

function calculateResolutionForShaderDisplacement(image: Sprite, renderer: PIXI.Renderer): Resolution {
  const imageAspect = image.height / image.width;
  let a1;
  let a2;
  if (renderer.height / renderer.width > imageAspect) {
    a1 = (renderer.width / renderer.height) * imageAspect;
    a2 = 1;
  } else {
    a1 = 1;
    a2 = renderer.height / renderer.width / imageAspect;
  }

  return {
    type: 'vec4',
    value: [renderer.width, renderer.height, a1, a2],
  };
}

export let renderer = PIXI.autoDetectRenderer({
  width: 256,
  height: 256,
  antialias: true,
  transparent: false,
});
renderer.autoDensity = false;

export function getTransitionFragmentShader(transition: TransitionValues, imageCount: number) {
  var baseFragmentShader = `
        precision mediump float;
        uniform float smoothness;
        uniform float progress;
        uniform mat3 mappedMatrix;
        uniform mat3 outputMatrix;
        varying vec2 vTextureCoord;
        uniform bool fromNothing;
        uniform bool toNothing;
        vec4 outputFrame;

        vec4 getColor(vec2 uv, sampler2D tex) {
          return texture2D(tex, uv);
        }

        ##IMAGE_VARS##

        ##VARIABLES##

        ##PLACEHOLDER##

        void main() {
          vec3 map = (outputMatrix * vec3(vTextureCoord, 1));
          vec2 uvMap = map.xy;
          gl_FragColor = transition(uvMap);
        }
    `;

  var imageVars = ``;
  for (var i = 0; i < imageCount; i++) {
    var imageBaseName = 'uTexture' + (i + 1);
    imageVars += 'uniform sampler2D ' + imageBaseName + ';\n';
  }

  baseFragmentShader = baseFragmentShader.replace('##IMAGE_VARS##', imageVars);

  switch (transition) {
    case 'fadeout':
    case 'fadein':
    case 'rotatein':
    case 'wipein':
    case 'scalein':
      throw new Error('Not implemented');
    case 'windowslice':
      return baseFragmentShader
        .replace(
          '##VARIABLES##',
          `
                uniform float count;
                uniform sampler2D uSampler;
                uniform bool isVerticalFromTop;
            `
        )
        .replace(
          '##PLACEHOLDER##',
          `
                vec4 transition (vec2 p) {
                    float pr = smoothstep(-smoothness, 0.0, p.x - progress * (1.0 + smoothness));
                    float s = step(pr, fract(count * p.x));
                    
                    if (isVerticalFromTop) {
                      pr = smoothstep(-smoothness, 0.0, p.y - progress * (1.0 + smoothness));
                      s = step(pr, fract(count * p.y));
                    }

                    vec4 color1 = vec4(0, 0, 0, 0);
                    if (fromNothing) {
                      color1 = vec4(0, 0, 0, 0);
                    } else {
                      color1 = texture2D(uTexture1, p);
                    }
                    if (toNothing) {
                      color1 = texture2D(uSampler, vTextureCoord);
                    } else {
                      color1 = vec4(0, 0, 0, 0);
                    }
                    vec4 color2 = texture2D(uSampler, vTextureCoord);
                    if (toNothing) {
                      color2 = vec4(0, 0, 0, 0);
                    }
                    
                    if (toNothing) {
                      return mix(
                        color2,
                        color1,
                        s
                      );
                    }
                    if (fromNothing) {
                      return mix(
                          color1,
                          color2,
                          s
                      );
                    }
                }
            `
        );
    case 'circleopen':
      return baseFragmentShader
        .replace(
          '##VARIABLES##',
          `
                const bool opening = true;
                const vec2 center = vec2(0.5, 0.5);
                const float SQRT_2 = 1.414213562373;
            `
        )
        .replace(
          '##PLACEHOLDER##',
          `
              vec4 transition (vec2 uv) {
                float x = opening ? progress : 1.-progress;
                float m = smoothstep(-smoothness, 0.0, SQRT_2*distance(center, uv) - x*(1.+smoothness));
                return mix(getColor(uv,uTexture1), getColor(uv,uTexture2), opening ? 1.-m : m);
              }
            `
        );
    case 'displacementin':
      return baseFragmentShader
        .replace(
          '##VARIABLES##',
          `
                uniform float scales; // = 4.0
                uniform sampler2D uSampler;
                uniform float seed; // = 12.9898
                float random(vec2 co)
                {
                    highp float a = seed;
                    highp float b = 78.233;
                    highp float c = 43758.5453;
                    highp float dt= dot(co.xy ,vec2(a,b));
                    highp float sn= mod(dt,3.14);
                    return fract(sin(sn) * c);
                }
                float noise (in vec2 st) {
                    vec2 i = floor(st);
                    vec2 f = fract(st);
                
                    // Four corners in 2D of a tile
                    float a = random(i);
                    float b = random(i + vec2(1.0, 0.0));
                    float c = random(i + vec2(0.0, 1.0));
                    float d = random(i + vec2(1.0, 1.0));
                
                    // Smooth Interpolation
                
                    // Cubic Hermine Curve.  Same as SmoothStep()
                    vec2 u = f*f*(3.0-2.0*f);
                    // u = smoothstep(0.,1.,f);
                
                    // Mix 4 coorners porcentages
                    return mix(a, b, u.x) +
                            (c - a)* u.y * (1.0 - u.x) +
                            (d - b) * u.x * u.y;
                }
            `
        )
        .replace(
          '##PLACEHOLDER##',
          `
              vec4 transition (vec2 uv) {
                  vec4 color1 = vec4(0, 0, 0, 0);
                  if (fromNothing) {
                    color1 = vec4(0, 0, 0, 0);
                  } else {
                    color1 = texture2D(uTexture1, uv);
                  }
                  if (toNothing) {
                    color1 = texture2D(uSampler, vTextureCoord);
                  } else {
                    color1 = vec4(0, 0, 0, 0);
                  }
                  vec4 color2 = texture2D(uSampler, vTextureCoord);
                  if (toNothing) {
                    color2 = vec4(0, 0, 0, 0);
                  }
                  vec4 to = getColor(vTextureCoord, uSampler);
                  float n = noise(uv * scales);
                  
                  float p = mix(-smoothness, 1.0 + smoothness, progress);
                  float lower = p - smoothness;
                  float higher = p + smoothness;
                  
                  float q = smoothstep(lower, higher, n);
                  
                  if (toNothing) {
                    return mix(
                        color2,
                        color1,
                        1.0 - q
                      );
                  }
                  if (fromNothing) {
                    return mix(
                        color1,
                        color2,
                        1.0 - q
                      );
                  }
                }
            `
        );
    case 'directionalwipe':
      return baseFragmentShader
        .replace(
          '##VARIABLES##',
          `
                const vec2 direction = vec2(1.0, -1.0);
                const vec2 center = vec2(0.5, 0.5);
            `
        )
        .replace(
          '##PLACEHOLDER##',
          `
               vec4 transition (vec2 uv) {
                    vec2 v = normalize(direction);
                    v /= abs(v.x)+abs(v.y);
                    float d = v.x * center.x + v.y * center.y;
                    float m =
                    (1.0-step(progress, 0.0)) * // there is something wrong with our formula that makes m not equals 0.0 with progress is 0.0
                    (1.0 - smoothstep(-smoothness, 0.0, v.x * uv.x + v.y * uv.y - (d-0.5+progress*(1.+smoothness))));
                    return mix(getColor(uv, uTexture1), getColor(uv, uTexture2), m);
              }
            `
        );
    case 'angular':
      return baseFragmentShader
        .replace(
          '##VARIABLES##',
          `
            #define PI 3.141592653589
            uniform float startingAngle;
            uniform sampler2D uSampler;
          `
        )
        .replace(
          '##PLACEHOLDER##',
          `
            vec4 transition (vec2 uv) {
              float offset = startingAngle * PI / 180.0;
              float angle = atan(uv.y - 0.5, uv.x - 0.5) + offset;
              float normalizedAngle = (angle + PI) / (2.0 * PI);
              
              normalizedAngle = normalizedAngle - floor(normalizedAngle);

              vec4 colorOne = vec4(0, 0, 0, 0);
              if (fromNothing) {
                colorOne = vec4(0, 0, 0, 0);
              } else {
                colorOne = getColor(uv, uTexture1);
              }

              return mix(
                colorOne,
                getColor(vTextureCoord,uSampler),
                step(normalizedAngle, progress)
              );
            }
          `
        );
    case 'doorway':
      return baseFragmentShader
        .replace(
          '##VARIABLES##',
          `
                const float reflection = float(1);
                const float perspective = float(0);
                const float depth = float(1);
                
                const vec4 black = vec4(0.0, 0.0, 0.0, 1.0);
                const vec2 boundMin = vec2(0.0, 0.0);
                const vec2 boundMax = vec2(1.0, 1.0);
            `
        )
        .replace(
          '##PLACEHOLDER##',
          `
              bool inBounds (vec2 p) {
                return all(lessThan(boundMin, p)) && all(lessThan(p, boundMax));
              }
              
              vec2 project (vec2 p) {
                return p * vec2(1.0, -1.2) + vec2(0.0, -0.02);
              }
              
              vec4 bgColor (vec2 p, vec2 pto) {
                vec4 c = black;
                pto = project(pto);
                if (inBounds(pto)) {
                  c += mix(black, getColor(pto, uTexture2), reflection * mix(1.0, 0.0, pto.y));
                }
                return c;
              }
              
              
              vec4 transition (vec2 p) {
                vec2 pfr = vec2(-1.), pto = vec2(-1.);
                float middleSlit = 2.0 * abs(p.x-0.5) - progress;
                if (middleSlit > 0.0) {
                  pfr = p + (p.x > 0.5 ? -1.0 : 1.0) * vec2(0.5*progress, 0.0);
                  float d = 1.0/(1.0+perspective*progress*(1.0-middleSlit));
                  pfr.y -= d/2.;
                  pfr.y *= d;
                  pfr.y += d/2.;
                }
                float size = mix(1.0, depth, 1.-progress);
                pto = (p + vec2(-0.5, -0.5)) * vec2(size, size) + vec2(0.5, 0.5);
                if (inBounds(pfr)) {
                  return getColor(pfr, uTexture1);
                }
                else if (inBounds(pto)) {
                  return getColor(pto, uTexture2);
                }
                else {
                  return bgColor(p, pto);
                }
              }
            `
        );
    case 'displacementwipe':
      return baseFragmentShader
        .replace(
          '##VARIABLES##',
          `
                uniform float time;
                uniform float width;
                uniform float scaleX;
                uniform float scaleY;
                uniform sampler2D displacement;
                uniform sampler2D uSampler;
                uniform vec4 resolution;
                uniform float angle;
                uniform mat2 rotation;
                uniform vec4 inputClamp;
                uniform highp vec4 inputSize;
                uniform vec2 scale;
            `
        )
        .replace(
          '##PLACEHOLDER##',
          `
                vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
                vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
                vec4 fade(vec4 t) {return t*t*t*(t*(t*6.0-15.0)+10.0);}
                float cnoise(vec4 P){
                  ;
                  vec4 Pi0 = floor(P); // Integer part for indexing
                  vec4 Pi1 = Pi0 + 1.0; // Integer part + 1
                  Pi0 = mod(Pi0, 289.0);
                  Pi1 = mod(Pi1, 289.0);
                  vec4 Pf0 = fract(P); // Fractional part for interpolation
                  vec4 Pf1 = Pf0 - 1.0; // Fractional part - 1.0
                  vec4 ix = vec4(Pi0.x, Pi1.x, Pi0.x, Pi1.x);
                  vec4 iy = vec4(Pi0.yy, Pi1.yy);
                  vec4 iz0 = vec4(Pi0.zzzz);
                  vec4 iz1 = vec4(Pi1.zzzz);
                  vec4 iw0 = vec4(Pi0.wwww);
                  vec4 iw1 = vec4(Pi1.wwww);
                  vec4 ixy = permute(permute(ix) + iy);
                  vec4 ixy0 = permute(ixy + iz0);
                  vec4 ixy1 = permute(ixy + iz1);
                  vec4 ixy00 = permute(ixy0 + iw0);
                  vec4 ixy01 = permute(ixy0 + iw1);
                  vec4 ixy10 = permute(ixy1 + iw0);
                  vec4 ixy11 = permute(ixy1 + iw1);
                  vec4 gx00 = ixy00 / 7.0;
                  vec4 gy00 = floor(gx00) / 7.0;
                  vec4 gz00 = floor(gy00) / 6.0;
                  gx00 = fract(gx00) - 0.5;
                  gy00 = fract(gy00) - 0.5;
                  gz00 = fract(gz00) - 0.5;
                  vec4 gw00 = vec4(0.75) - abs(gx00) - abs(gy00) - abs(gz00);
                  vec4 sw00 = step(gw00, vec4(0.0));
                  gx00 -= sw00 * (step(0.0, gx00) - 0.5);
                  gy00 -= sw00 * (step(0.0, gy00) - 0.5);
                  vec4 gx01 = ixy01 / 7.0;
                  vec4 gy01 = floor(gx01) / 7.0;
                  vec4 gz01 = floor(gy01) / 6.0;
                  gx01 = fract(gx01) - 0.5;
                  gy01 = fract(gy01) - 0.5;
                  gz01 = fract(gz01) - 0.5;
                  vec4 gw01 = vec4(0.75) - abs(gx01) - abs(gy01) - abs(gz01);
                  vec4 sw01 = step(gw01, vec4(0.0));
                  gx01 -= sw01 * (step(0.0, gx01) - 0.5);
                  gy01 -= sw01 * (step(0.0, gy01) - 0.5);
                  vec4 gx10 = ixy10 / 7.0;
                  vec4 gy10 = floor(gx10) / 7.0;
                  vec4 gz10 = floor(gy10) / 6.0;
                  gx10 = fract(gx10) - 0.5;
                  gy10 = fract(gy10) - 0.5;
                  gz10 = fract(gz10) - 0.5;
                  vec4 gw10 = vec4(0.75) - abs(gx10) - abs(gy10) - abs(gz10);
                  vec4 sw10 = step(gw10, vec4(0.0));
                  gx10 -= sw10 * (step(0.0, gx10) - 0.5);
                  gy10 -= sw10 * (step(0.0, gy10) - 0.5);
                  vec4 gx11 = ixy11 / 7.0;
                  vec4 gy11 = floor(gx11) / 7.0;
                  vec4 gz11 = floor(gy11) / 6.0;
                  gx11 = fract(gx11) - 0.5;
                  gy11 = fract(gy11) - 0.5;
                  gz11 = fract(gz11) - 0.5;
                  vec4 gw11 = vec4(0.75) - abs(gx11) - abs(gy11) - abs(gz11);
                  vec4 sw11 = step(gw11, vec4(0.0));
                  gx11 -= sw11 * (step(0.0, gx11) - 0.5);
                  gy11 -= sw11 * (step(0.0, gy11) - 0.5);
                  vec4 g0000 = vec4(gx00.x,gy00.x,gz00.x,gw00.x);
                  vec4 g1000 = vec4(gx00.y,gy00.y,gz00.y,gw00.y);
                  vec4 g0100 = vec4(gx00.z,gy00.z,gz00.z,gw00.z);
                  vec4 g1100 = vec4(gx00.w,gy00.w,gz00.w,gw00.w);
                  vec4 g0010 = vec4(gx10.x,gy10.x,gz10.x,gw10.x);
                  vec4 g1010 = vec4(gx10.y,gy10.y,gz10.y,gw10.y);
                  vec4 g0110 = vec4(gx10.z,gy10.z,gz10.z,gw10.z);
                  vec4 g1110 = vec4(gx10.w,gy10.w,gz10.w,gw10.w);
                  vec4 g0001 = vec4(gx01.x,gy01.x,gz01.x,gw01.x);
                  vec4 g1001 = vec4(gx01.y,gy01.y,gz01.y,gw01.y);
                  vec4 g0101 = vec4(gx01.z,gy01.z,gz01.z,gw01.z);
                  vec4 g1101 = vec4(gx01.w,gy01.w,gz01.w,gw01.w);
                  vec4 g0011 = vec4(gx11.x,gy11.x,gz11.x,gw11.x);
                  vec4 g1011 = vec4(gx11.y,gy11.y,gz11.y,gw11.y);
                  vec4 g0111 = vec4(gx11.z,gy11.z,gz11.z,gw11.z);
                  vec4 g1111 = vec4(gx11.w,gy11.w,gz11.w,gw11.w);
                  vec4 norm00 = taylorInvSqrt(vec4(dot(g0000, g0000), dot(g0100, g0100), dot(g1000, g1000), dot(g1100, g1100)));
                  g0000 *= norm00.x;
                  g0100 *= norm00.y;
                  g1000 *= norm00.z;
                  g1100 *= norm00.w;
                  vec4 norm01 = taylorInvSqrt(vec4(dot(g0001, g0001), dot(g0101, g0101), dot(g1001, g1001), dot(g1101, g1101)));
                  g0001 *= norm01.x;
                  g0101 *= norm01.y;
                  g1001 *= norm01.z;
                  g1101 *= norm01.w;
                  vec4 norm10 = taylorInvSqrt(vec4(dot(g0010, g0010), dot(g0110, g0110), dot(g1010, g1010), dot(g1110, g1110)));
                  g0010 *= norm10.x;
                  g0110 *= norm10.y;
                  g1010 *= norm10.z;
                  g1110 *= norm10.w;
                  vec4 norm11 = taylorInvSqrt(vec4(dot(g0011, g0011), dot(g0111, g0111), dot(g1011, g1011), dot(g1111, g1111)));
                  g0011 *= norm11.x;
                  g0111 *= norm11.y;
                  g1011 *= norm11.z;
                  g1111 *= norm11.w;
                  float n0000 = dot(g0000, Pf0);
                  float n1000 = dot(g1000, vec4(Pf1.x, Pf0.yzw));
                  float n0100 = dot(g0100, vec4(Pf0.x, Pf1.y, Pf0.zw));
                  float n1100 = dot(g1100, vec4(Pf1.xy, Pf0.zw));
                  float n0010 = dot(g0010, vec4(Pf0.xy, Pf1.z, Pf0.w));
                  float n1010 = dot(g1010, vec4(Pf1.x, Pf0.y, Pf1.z, Pf0.w));
                  float n0110 = dot(g0110, vec4(Pf0.x, Pf1.yz, Pf0.w));
                  float n1110 = dot(g1110, vec4(Pf1.xyz, Pf0.w));
                  float n0001 = dot(g0001, vec4(Pf0.xyz, Pf1.w));
                  float n1001 = dot(g1001, vec4(Pf1.x, Pf0.yz, Pf1.w));
                  float n0101 = dot(g0101, vec4(Pf0.x, Pf1.y, Pf0.z, Pf1.w));
                  float n1101 = dot(g1101, vec4(Pf1.xy, Pf0.z, Pf1.w));
                  float n0011 = dot(g0011, vec4(Pf0.xy, Pf1.zw));
                  float n1011 = dot(g1011, vec4(Pf1.x, Pf0.y, Pf1.zw));
                  float n0111 = dot(g0111, vec4(Pf0.x, Pf1.yzw));
                  float n1111 = dot(g1111, Pf1);
                  vec4 fade_xyzw = fade(Pf0);
                  vec4 n_0w = mix(vec4(n0000, n1000, n0100, n1100), vec4(n0001, n1001, n0101, n1101), fade_xyzw.w);
                  vec4 n_1w = mix(vec4(n0010, n1010, n0110, n1110), vec4(n0011, n1011, n0111, n1111), fade_xyzw.w);
                  vec4 n_zw = mix(n_0w, n_1w, fade_xyzw.z);
                  vec2 n_yzw = mix(n_zw.xy, n_zw.zw, fade_xyzw.y);
                  float n_xyzw = mix(n_yzw.x, n_yzw.y, fade_xyzw.x);
                  return 2.2 * n_xyzw;
                }
                float map(float value, float min1, float max1, float min2, float max2) {
                  return min2 + (value - min1) * (max2 - min2) / (max1 - min1);
                }
                float parabola( float x, float k ) {
                  return pow( 4. * x * ( 1. - x ), k );
                }
                mat2 rotate(float a) {
                  float s = sin(a);
                  float c = cos(a);
                  return mat2(c, -s, s, c);
                }

                vec4 transition (vec2 p) {

                  vec2 vFilterCoord = (outputMatrix * vec3(vTextureCoord, 1.0)).xy;
                  vec4 map =  texture2D(displacement, vFilterCoord);
                  map -= 0.5;
                  map.xy = scale * inputSize.zw * (rotation * map.xy);
                  float dt = parabola(progress,1.);
                  float border = 1.;
                  vec2 newUV = p;
                  vec4 color1 = vec4(0, 0, 0, 0);
                  if (fromNothing) {
                    color1 = vec4(0, 0, 0, 0);
                  } else {
                    color1 = texture2D(uTexture1, newUV);
                  }
                  if (toNothing) {
                    color1 = texture2D(uSampler, vTextureCoord);
                  } else {
                    color1 = vec4(0, 0, 0, 0);
                  }
                  vec4 color2 = texture2D(uSampler, vTextureCoord);
                  if (toNothing) {
                    color2 = vec4(0, 0, 0, 0);
                  }
                  vec2 displacementUV = vec2(map.x*scaleX,map.y*scaleY);
                  vec4 d = texture2D(displacement, displacementUV);
                  float realnoise = 0.5*(cnoise(vec4(newUV.x*scaleX  + 0.*time/3., newUV.y*scaleY,0.*time/3.,0.)) +1.);
                  float w = width*dt;
                  float maskvalue = smoothstep(1. - w,1., 1. - p.y + mix(-w/2., 1. - w/2., progress));
                  float maskvalue0 = smoothstep(1.,1.,1. - p.y + progress);
                  float mask = maskvalue + maskvalue*realnoise;
                  float final = smoothstep(border,border+0.01,mask);

                  return mix(color1, color2, final);
                }
            `
        );
    case 'wipehorizontalopen':
      return baseFragmentShader
        .replace(
          '##VARIABLES##',
          `
                uniform float count;
                uniform sampler2D uSampler;
                uniform bool isVerticalFromTop;
            `
        )
        .replace(
          '##PLACEHOLDER##',
          `
                vec4 transition (vec2 p) {
                    float pr = smoothstep(-smoothness, 0.0, p.x - progress * (1.0 + smoothness));
                    float s = step(pr, fract(count * p.x));
                    
                    if (isVerticalFromTop) {
                      pr = smoothstep(-smoothness, 0.0, p.y - progress * (1.0 + smoothness));
                      s = step(pr, fract(count * p.y));
                    }

                    vec4 color1 = vec4(0, 0, 0, 0);
                    if (fromNothing) {
                      color1 = vec4(0, 0, 0, 0);
                    } else {
                      color1 = texture2D(uTexture1, p);
                    }
                    if (toNothing) {
                      color1 = texture2D(uSampler, vTextureCoord);
                    } else {
                      color1 = vec4(0, 0, 0, 0);
                    }
                    vec4 color2 = texture2D(uSampler, vTextureCoord);
                    if (toNothing) {
                      color2 = vec4(0, 0, 0, 0);
                    }
                    
                    if (toNothing) {
                      return mix(
                        color2,
                        color1,
                        s
                      );
                    }
                    if (fromNothing) {
                      return mix(
                          color1,
                          color2,
                          s
                      );
                    }
                }
            `
        );
  }
}

function getDominantImageColor(sprite: Sprite, renderer: PIXI.Renderer) {
  var helperCanvas = document.createElement('canvas');
  helperCanvas.style.position = 'absolute';
  helperCanvas.style.top = '-10000px';
  helperCanvas.style.left = '-10000px';
  helperCanvas.width = 1;
  helperCanvas.height = 1;
  document.body.appendChild(helperCanvas);

  var ctx = helperCanvas.getContext('2d');
  if (!ctx) throw new Error('2d canvas context is null');

  ctx.imageSmoothingEnabled = true;

  var renderTexture = PIXI.RenderTexture.create({
    width: renderer.width,
    height: renderer.height,
  });
  renderer.render(sprite, renderTexture);
  var spriteCanvas = renderer.extract.canvas(renderTexture);
  ctx.drawImage(spriteCanvas, 0, 0, 1, 1);
  var data = ctx.getImageData(0, 0, 1, 1);

  return data;
}

// colorToReplace when null = dominant color in the image
// colorToReplaceWith when null = make transparent
export function replaceSpriteColor(
  sprite: Sprite,
  renderer: PIXI.Renderer,
  colorToReplace = null,
  colorToReplaceWith = null
) {
  if (!colorToReplace && !colorToReplaceWith) {
    // replace dominant color with transparent
    console.log('dominant color', getDominantImageColor(sprite, renderer));
  }
}

export async function loadFont(fontName: string, taskId: string) {
  const userFont = new FontFace(fontName, `url(tasks/${taskId}/${encodeURIComponent(fontName)}.ttf)`, {});
  await new Promise((resolve) => {
    userFont
      .load()
      .then((font) => {
        document.fonts.add(font);
        console.log(`font' ${fontName} loaded`);
        resolve(null);
      })
      .catch((e) => {
        console.log(`failed to load font ${fontName}`, e.message);
        resolve(null);
      });
  });
}

export async function applyCaptionProperties(captionitem: PIXI.Text, textItem: Caption, renderer: PIXI.Renderer) {
  await new Promise<void>((resolve) => {
    const scaleFont = 1.75;
    const pixifontsize = (textItem.logFont.lfHeight * scaleFont) / 100;
    const styletext = new PIXI.TextStyle({
      fontFamily: textItem.logFont.lfFaceName,
      fontSize: pixifontsize + 'px',
      fontWeight: String(textItem.logFont.lfWeight),
      fill: new Color(textItem.color).toHex().hex,
      align: textItem.just ? AlignCaptionHorizontal[textItem.just] : 'left',
      textBaseline: 'bottom', //bottom - to align text to baseline like in Proshow
      stroke: new Color(textItem.outlineColor).toHex().hex || '#000000',
      strokeThickness: Number(textItem.outline) || 0,
      dropShadow: Boolean(textItem.shadow),
      dropShadowAlpha: textItem.shadowOpacity / 255 || 1,
      lineHeight: pixifontsize,
      wordWrap: true,
      wordWrapWidth: renderer.width,
    });
    if (textItem.just === AlignCaptionHorizontal.fill) styletext.align = 'left'; //for fill align
    captionitem.style = styletext;
    captionitem.alpha = textItem.opacity / 255;
    captionitem.x = (renderer.width * textItem.r.left) / 10000 - getShiftTextHorizontal(captionitem, textItem.just);
    captionitem.y = (renderer.height * textItem.r.top) / 10000 - getShiftTextVertical(captionitem, textItem.vJust);
    resolve();
  });
}

export async function applyImageProperties(
  sprite: Sprite,
  cellImage: Image,
  renderer: PIXI.Renderer,
  ignoreScale = false
) {
  //if image is hidden in PSH, then full hidden it in animation
  if (cellImage.imageEnable === undefined) {
    sprite.renderable = false;
    sprite.visible = false;
    sprite.alpha = 0;
    return;
  }

  await new Promise<void>((resolve) => {
    Object.keys(cellImage)
      .filter((key) => key !== 'keyframes')
      .forEach((rootProperty) => {
        if (rootProperty.toLowerCase() === 'sizemode') {
          if (Number(cellImage.sizeMode) === SizeMode.FILL_FRAME) {
            sprite.width = renderer.width;
            sprite.scale.set(sprite.scale.x);
            sprite.position.set(sprite.width / 2, sprite.height / 2);
          }
        }
      });
    //crop
    if (cellImage.useCropping && (cellImage.name as string).indexOf('Vignette') === -1) {
      sprite.texture = cropTextureSprite(
        sprite,
        Number(cellImage.cropX1),
        Number(cellImage.cropY1),
        Number(cellImage.cropX2),
        Number(cellImage.cropY2)
      );
    }
    //image mirroring
    if (cellImage.hasOwnProperty('flipHorz')) {
      sprite.scale.x *= -1;
    }
    if (cellImage.hasOwnProperty('flipVert')) {
      sprite.scale.y *= -1;
    }
    //
    sprite.originalWidth = sprite.width;
    sprite.originalHeight = sprite.height;
    if (cellImage.hasOwnProperty('keyframes') && cellImage.keyframes.length) {
      const firstFrame = cellImage.keyframes[0];
      const secondFrame = cellImage.keyframes[1];
      if (firstFrame.hasOwnProperty('zoomX') && firstFrame.hasOwnProperty('zoomY') && !ignoreScale) {
        if (cellImage.useGradient) {
          // @TODO: implement gradient for other positions p0x and p0y
          if (cellImage.gradient && Number(cellImage.gradient.type) === GrandientType.RECTANGULAR) {
            sprite.texture = renderer.generateTexture(
              drawGradientBox(cellImage.gradient),
              PIXI.SCALE_MODES.LINEAR,
              window.devicePixelRatio || 1
            );
          }
        }
        let ratio = calculateAspectRatioFit(
          sprite.width,
          sprite.height,
          renderer.width,
          renderer.height,
          Number(cellImage.sizeMode)
        );
        const scaleX = Number(firstFrame.zoomX) / 10000;
        const scaleY = Number(firstFrame.zoomY) / 10000;
        if (
          cellImage.gradient ||
          !(Number(firstFrame.lockAR) === LockAR.LOCK_SCALE || Number(cellImage.sizeMode) === SizeMode.FIT_TO_FRAME)
        ) {
          sprite.width = renderer.width * scaleX;
          sprite.height = renderer.height * scaleY;
        } else {
          sprite.width = ratio.width * scaleX;
          sprite.height = ratio.height * scaleY;
        }
      }
      //necessary after set size
      if (cellImage.useVignette) {
        if ((cellImage.name as string).indexOf('Solid') !== -1 && (cellImage.vignette as any).shape) {
          //only for solid ellipse
          const graphics = new PIXI.Graphics();
          graphics.beginFill(0xffffff);
          graphics.drawEllipse(0, 0, sprite.width / 2, sprite.height / 2);
          graphics.endFill();
          sprite.texture = renderer.generateTexture(graphics, PIXI.SCALE_MODES.LINEAR, 1);
        } else {
          if (cellImage.vignette?.type) {
            let vignetteType: VignetteType = +cellImage.vignette.type;
            // make a new container for the sprites
            const spritesContainer = new PIXI.Container();
            // making a copy of the old sprite because directly modifying the existing sprite's texture made it distorted
            const existingSpriteCopy = new PIXI.Sprite(sprite.texture);
            existingSpriteCopy.height = sprite.height;
            existingSpriteCopy.width = sprite.width;
            existingSpriteCopy.position = sprite.position;
            spritesContainer.addChild(existingSpriteCopy);
            /**
             * vignette size from psh is 1000- which translates to 10% of image height which means our border has to be 5% thick on both sides
             * We calculate by getting a percent of vignetteSize from psh, multiplying it by a percent of the image height and then halving the result.
             */
            const vignetteThicknessInPixels = 0.5 * 0.01 * cellImage.vignette.vignetteSize * sprite.height * 0.01;

            // for uniformity, we make the outermost radius equal to the thickness
            const outerRadius = vignetteThicknessInPixels;

            /** PIXI might be having a bug whereby when a border is drawn in steps of 1px, some lines are missing,
             * So I used a border-step of 1.5px(which is the closest to 1px that works)
             * bug number #11838
             */
            const currentLineThicknessInPixels = 1.5;

            let thicknessDrawn = 0;

            while (thicknessDrawn <= vignetteThicknessInPixels) {
              const gradientColor = getGradient(
                (thicknessDrawn / vignetteThicknessInPixels) * 100,
                cellImage.vignette['colormap']
              );
              const solidAlpha = 1 - (1 / vignetteThicknessInPixels) * thicknessDrawn; // for solid vignette, we draw the lines with a fading effect by reducing the alpha

              // if type is 1, then we use the specified vignette color, otherwise we build and use the gradient from the color map
              const color =
                vignetteType === VignetteType.SOLID
                  ? new Color(cellImage.vignette['color']).toHex().hex
                  : gradientColor.hex;
              const alpha = vignetteType === VignetteType.SOLID ? solidAlpha : gradientColor.alpha;
              let innerRadius = outerRadius - thicknessDrawn;
              /**
               * we dont want image corners shooting beyond  borders so we make sure gradient borders extend beyong image's corners by a quarter of the border thickness
               * this accomoadates for the border radius
               */
              const rectWidth = sprite.width - thicknessDrawn * 2;
              const rectHeight = sprite.height - thicknessDrawn * 2;

              /**
               * being drawing a 2px bordered rounded rectangle to complete each step,
               * using the gradient color gotten form the getGradient function
               */
              const borderGraphics = new PIXI.Graphics()
                .beginFill(0xffffff, 0)
                .lineStyle(currentLineThicknessInPixels, color, alpha)
                .drawRoundedRect(0, 0, rectWidth, rectHeight, innerRadius)
                .endFill();

              const graphicsTexture = renderer.generateTexture(
                borderGraphics,
                PIXI.SCALE_MODES.LINEAR,
                window.devicePixelRatio || 1
              );

              const graphicsSprite = new PIXI.Sprite(graphicsTexture);
              graphicsSprite.x = sprite.x + thicknessDrawn;
              graphicsSprite.y = sprite.y + thicknessDrawn;
              // we add each drawn bordered-ractangle sprite to the container
              spritesContainer.addChild(graphicsSprite);
              // incrementing the thickness drawn by a value lesser than the actual thickness drawn just to make them overlap and cover for spaces
              thicknessDrawn += 1;
            }
            existingSpriteCopy.mask = new PIXI.Graphics()
              .beginFill()
              .drawRoundedRect(sprite.x, sprite.y, sprite.width, sprite.height, outerRadius)
              .endFill();

            const containerTexture = renderer.generateTexture(spritesContainer, PIXI.SCALE_MODES.LINEAR, 1);
            // we finally set the original sprite's texture to this new container's texture
            sprite.texture = containerTexture;
          }
        }
      }
      if (firstFrame.hasOwnProperty('offsetX') || firstFrame.hasOwnProperty('offsetY')) {
        let offsetX = firstFrame.hasOwnProperty('offsetX') ? Number(firstFrame.offsetX) / 10000 : 0;
        let offsetY = firstFrame.hasOwnProperty('offsetY') ? Number(firstFrame.offsetY) / 10000 : 0;
        sprite.position.set(
          renderer.width / 2 + renderer.width * offsetX,
          renderer.height / 2 + renderer.height * offsetY
        );
      } else {
        sprite.position.set(renderer.width / 2, renderer.height / 2);
      }
      //rotation
      if (firstFrame.hasOwnProperty('rotation') && firstFrame.rotation) {
        const anchorX = 0.5;
        const anchorY = 0.5;
        sprite.anchor.set(anchorX, anchorY);
        const angle = ((Number(firstFrame.rotation) / 1000) * Math.PI) / 180;

        if (firstFrame.hasOwnProperty('rotateCenterY') && firstFrame.rotateCenterY) {
          sprite.anchor.x = 1;
          if (firstFrame.rotateCenterX) {
            sprite.anchor.x = firstFrame.rotateCenterX / 10000;
          }
          if (firstFrame.hasOwnProperty('rotateCenterX') && firstFrame.rotateCenterX) {
            sprite.anchor.y = -firstFrame.rotateCenterY / 10000;
          } else {
            sprite.anchor.y = firstFrame.rotateCenterY / 10000;
          }
        }

        sprite.rotation = angle;

        if (
          !secondFrame.rotation &&
          !(secondFrame.offsetX || secondFrame.offsetY) &&
          !(secondFrame.zoomX || secondFrame.zoomY)
        ) {
          sprite.anchor.set(1, 0);
          sprite.position.set(sprite.position.x + sprite.width / 2, sprite.position.y - sprite.height / 2);
        }
      }
      if (cellImage.hasOwnProperty('useTransitionIn') && cellImage.transitionInId) {
        sprite.renderable = false;
      }
      sprite.filters = [];
      if (cellImage.brightness) {
        const filter_brightness = Number(cellImage.brightness) / 1000;
        if (filter_brightness > 0) {
          const calc_brightness = 1 + 0.4 * filter_brightness; //1.4 is max value of rgb pixi
          sprite.filters.push(
            new AdjustmentFilter({
              red: calc_brightness,
              green: calc_brightness,
              blue: calc_brightness,
              contrast: 1 - filter_brightness * 0.6, //contrast from 1 to 0.6, depends from brightness
              saturation: 1 + filter_brightness * 0.2, //need a little saturation here
            })
          );
        } else {
          sprite.filters.push(
            new AdjustmentFilter({
              gamma: 1 - Math.abs(filter_brightness),
            })
          );
        }
      }

      if (cellImage.blackPoint) {
        let filter_black = Number(cellImage.blackPoint) / 1000;
        if (filter_black > 0) {
          sprite.filters.push(
            new AdjustmentFilter({
              brightness: 1 + filter_black,
              contrast: 1 - filter_black,
            })
          );
        } else {
          sprite.filters.push(
            new AdjustmentFilter({
              gamma: 1 - Math.abs(filter_black * 0.65),
            })
          );
        }
      }

      if (cellImage.whitePoint) {
        let filter_white = Number(cellImage.whitePoint) / 1000;
        if (filter_white > 0) {
          sprite.filters.push(
            new AdjustmentFilter({
              gamma: 1 + filter_white,
              red: 1 + Math.abs(filter_white * 0.4),
              green: 1 + Math.abs(filter_white * 0.4),
              blue: 1 + Math.abs(filter_white * 0.4),
            })
          );
        } else {
          sprite.filters.push(
            new AdjustmentFilter({
              red: 1 - Math.abs(filter_white),
              green: 1 - Math.abs(filter_white),
              blue: 1 - Math.abs(filter_white),
            })
          );
        }
      }

      if (cellImage.maskChannel === MaskChannel.GRAYSCALE) {
        sprite.filters.push(new AdjustmentFilter({ saturation: 0 }));
      }

      if (Number(cellImage.shadow) === 1) {
        const shadow = new DropShadowFilter();
        shadow.color = cellImage.shadowColor ? new Color(+cellImage.shadowColor).toHexNumber() : 0x000000;
        shadow.alpha = cellImage.shadowOpacity / 255;
        shadow.distance = +cellImage.shadowSize / 10;
        sprite.filters.push(shadow);
      }

      if (cellImage.outline && +cellImage.outline === 1 && cellImage.outlineSize && cellImage.outlineColor) {
        const grapics = new PIXI.Graphics();
        grapics.lineStyle(5, 0xffffff, 1);
        const outlineColor = new Color(+cellImage.outlineColor);
        sprite.filters.push(new OutlineFilter(+cellImage.outlineSize / 10, outlineColor.toHexNumber()));
        const rect = new PIXI.Rectangle(0, 0, window.innerWidth, window.innerHeight);
        sprite.filterArea = rect;
      }

      //opacity parameter
      if (Number(cellImage.transparency) || Number(firstFrame.transparency)) {
        const alpha = 1 - Number(cellImage.transparency || firstFrame.transparency) / 255;
        sprite.alpha = alpha;
      }
      //colorize
      if (Number(cellImage.colorize) === 1 || Number(firstFrame.colorize) === 1) {
        sprite.filters = [];
        sprite.hasColorize = true;
        let color = new Color(Number(cellImage.colorize ? cellImage.colorizeColor : firstFrame.colorizeColor));
        const colorizeStrength =
          Number(cellImage.colorize ? cellImage.colorizeStrength : firstFrame.colorizeStrength) / 10000;
        sprite.colorizeColor = [color.red / 255, color.green / 255, color.blue / 255, 1];
        //replacing black with the target color. In proshow, colorize black background always repeats the color of colorize.
        sprite.filters.push(new ColorReplaceFilter(0x000000, color.toHexNumber(), 0.1));
        gsap.set(sprite, {
          pixi: {
            colorize: color.toHexNumber(),
            colorizeAmount: colorizeStrength,
            contrast: 1.2,
            saturation: 0.6,
            brightness: 1.5,
            combineCMF: true,
          },
        });
      } else {
        sprite.hasColorize = false;
      }

      if (cellImage.hasOwnProperty('useChromaKeying')) {
        sprite.filters.push(
          new ColorReplaceFilter(
            new Color(Number(cellImage.chromaKeyColor)).toHexNumber(),
            0x0fd562 //this is chromakey color - green
          )
        );
        sprite.filters.push(getChromaKeyFilter());
      }

      if (cellImage.hasOwnProperty('hue')) {
        sprite.filters.push(getHueFilter(Number(cellImage.hue)));
        sprite.filters.push(
          new AdjustmentFilter({
            gamma: 0.3,
          })
        );
      }
    }
    resolve();
  });
}

export function calculateAspectRatioFit(
  srcWidth: number,
  srcHeight: number,
  maxWidth: number,
  maxHeight: number,
  sizeMode: number = SizeMode.NULL
) {
  let ratio = Math.min(maxWidth / srcWidth, maxHeight / srcHeight);
  //fill frame size has other logic
  if (sizeMode === SizeMode.FILL_FRAME) {
    ratio = maxWidth / srcWidth;
  }
  return { width: srcWidth * ratio, height: srcHeight * ratio };
}

export function transitionImage(
  sprite: Sprite,
  transitionId: string,
  transitionDuration: number,
  loader: PIXI.Loader,
  type: 'in' | 'out'
): gsap.core.Timeline {
  const timeline = gsap.timeline({ paused: true });
  const transition = OBJECT_TRANSITIONS[Number(transitionId)];
  if (!transition) {
    timeline.set(sprite, {
      renderable: true,
      duration: Number(transitionDuration),
      onStart: () => {
        sprite.renderable = true;
      },
    });
    return timeline;
  }
  const duration = transitionDuration;

  const uniforms: Uniform = {
    smoothness: 0.9,
    progress: type === 'in' ? 0 : 1,
    fromNothing: type === 'in',
    toNothing: type !== 'in',
    uTexture1: type === 'in' ? PIXI.Texture.WHITE : sprite.texture,
    uTexture2: type === 'in' ? sprite.texture : PIXI.Texture.WHITE,
    hasMask: typeof sprite.hasMask === 'undefined' ? false : sprite.hasMask,
    maskTexture: typeof sprite.maskTexture === 'undefined' ? PIXI.Texture.EMPTY : sprite.maskTexture,
    hasColorize: typeof sprite.hasColor === 'undefined' ? false : sprite.hasColorize,
    colorizeColor: typeof sprite.colorizeColor === 'undefined' ? [0, 0, 0, 0] : sprite.colorizeColor,
    rotation: [Math.sin((sprite.angle * Math.PI) / 180), Math.cos((sprite.angle * Math.PI) / 180)],
  };

  switch (transition) {
    case 'angular':
      uniforms.startingAngle = 270;
      uniforms.scale = { x: 1, y: 1 };
      uniforms.rotation = [1, 1, 1, 1];
      break;
    case 'wipehorizontalopen':
      uniforms.scale = { x: 1, y: 1 };
      uniforms.count = 25;
      uniforms.isVerticalFromTop = true;
      break;
    case 'displacementwipe':
      uniforms.time = 0;
      uniforms.displacement = loader.resources['displacement'].texture;
      uniforms.width = 0.5;
      uniforms.scaleX = 40;
      uniforms.scaleY = 40;
      uniforms.scale = { x: 1, y: 1 };
      uniforms['resolution'] = calculateResolutionForShaderDisplacement(sprite, renderer);
      uniforms.angle = sprite.angle * (Math.PI / 180);
      uniforms.rotation = [1, 1, 1, 1];
      break;
    case 'displacementin':
      uniforms.scale = { x: 1, y: 1 };
      uniforms.scales = Number(transitionId) === 150 ? 12 : 5;
      uniforms.smoothness = 0.02;
      uniforms.seed = 12.9898;
      break;
    case 'windowslice':
      uniforms.scale = { x: 1, y: 1 };
      uniforms.count = 25;
      uniforms.isVerticalFromTop = true;
      break;
  }

  const filter = new PIXI.Filter(undefined, getTransitionFragmentShader(transition, 2), uniforms);

  if (
    transition === 'displacementwipe' ||
    transition === 'angular' ||
    transition === 'displacementin' ||
    transition === 'windowslice' ||
    transition === 'wipehorizontalopen'
  ) {
    filter.apply = function (filterManager, input, output, clearMode) {
      // fill maskMatrix with _normalized sprite texture coords_
      this.uniforms.outputMatrix = filterManager.calculateSpriteMatrix(new PIXI.Matrix(), sprite);
      this.uniforms.scale.x = sprite.scale.x;
      this.uniforms.scale.y = sprite.scale.y;

      // Extract rotation from world transform
      const wt = sprite.worldTransform;
      const lenX = Math.sqrt(wt.a * wt.a + wt.b * wt.b);
      const lenY = Math.sqrt(wt.c * wt.c + wt.d * wt.d);

      if (lenX !== 0 && lenY !== 0) {
        this.uniforms.rotation[0] = wt.a / lenX;
        this.uniforms.rotation[1] = wt.b / lenX;
        this.uniforms.rotation[2] = wt.c / lenY;
        this.uniforms.rotation[3] = wt.d / lenY;
      }
      // draw the filter...
      filterManager.applyFilter(this, input, output, clearMode);
    };
  }
  if (sprite.filters && sprite.filters.length) {
    sprite.filters = sprite.filters.concat([filter]);
  } else {
    sprite.filters = [filter];
  }

  timeline.to(filter.uniforms, {
    duration: Number(duration) / 1000,
    progress: type === 'in' ? 1 : 0,
    onUpdate: () => {
      if (uniforms.time) {
        uniforms.time += 0.05;
      }
      if (!sprite.renderable) {
        sprite.renderable = true;
      }
    },
  });
  return timeline;
}

function getShiftTextVertical(txt: PIXI.Text, just: number | undefined) {
  // Pixi alignment is done within the bounds of the text. And in the proshow within the whole stage
  // the text offset is required for alignment. In pixi, the point 0:0 of the text is left-top.
  let shift = 0;
  if (just) {
    if (Number(just) === AlignCaptionVertical.bottom) {
      shift = txt.height;
    }
  } else {
    shift = txt.height / 2;
  }
  return shift;
}

function getShiftTextHorizontal(txt: PIXI.Text, just: number | undefined) {
  // Pixi alignment is done within the bounds of the text. And in the proshow within the whole stage
  // the text offset is required for alignment. In pixi, the point 0:0 of the text is left-top.
  let shift = 0;
  if (just) {
    if (Number(just) === AlignCaptionHorizontal.fill) just = AlignCaptionHorizontal.center; // for fill align. need to center, like proshow
    shift = txt.width / just;
  }
  return shift;
}

export function getVideoTagFromResource(resource: Sprite): HTMLVideoElement | undefined {
  const source = (resource.texture.baseTexture.resource as any)?.source as HTMLVideoElement;
  return source && source.tagName === 'VIDEO' ? source : undefined;
}

export function playIfVideo(resource: Sprite) {
  console.log('resource is', resource);

  const source = getVideoTagFromResource(resource);
  if (source && source.paused) {
    resource.visible = true;
    source.play();
  }
}

export function isUserUploadedVideo(res: Sprite) {
  return getVideoTagFromResource(res) && res.originalName.includes('users/');
}

export function stopVideo(resource: any) {
  const source = (resource.texture.baseTexture.resource as any)?.source;
  if (source && source.tagName === 'VIDEO') {
    source.pause();
  }
}

export function getScaleTilt(deg: number) {
  const degnorm = Math.abs(deg / 1000);
  if (degnorm <= 90) return 1 - degnorm / 90;
  if (degnorm <= 180) return 1 - (180 - degnorm) / 90;
  if (degnorm <= 270) return (270 - degnorm) / 90;
  return 1 - (360 - degnorm) / 90;
}

export function cropTextureSprite(source: Sprite, X1: number, Y1: number, X2: number, Y2: number) {
  const cropX1 = (source.width * (X1 || 0)) / 10000;
  const cropY1 = (source.height * (Y1 || 0)) / 10000;
  const cropX2 = (source.width * (X2 || 0)) / 10000;
  const cropY2 = (source.height * (Y2 || 0)) / 10000;
  //
  return new PIXI.Texture(source.texture.baseTexture, new Rectangle(cropX1, cropY1, cropX2 - cropX1, cropY2 - cropY1));
}

export function fillTextureSprite(source: Sprite, renderer: PIXI.Renderer) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2d canvas context is null');
  canvas.width = source.width;
  canvas.height = source.height;
  // specific color is not important for the mask
  context.fillStyle = '#FFFFFF';
  context.fillRect(0, 0, source.width, source.height);
  // The globalCompositeOperation property sets / returns how the original (new) image is drawn
  // on the target (existing) image. The target image is displayed inside the source image.
  // This displays only that part of the target image that is within the boundaries of the original image.
  // The original image itself becomes transparent
  context.globalCompositeOperation = 'destination-in';
  const renderTexture = PIXI.RenderTexture.create({
    width: canvas.width,
    height: canvas.height,
  });
  renderer.render(source, renderTexture);
  const spriteCanvas = renderer.extract.canvas(renderTexture);
  context.drawImage(spriteCanvas, 0, 0);

  const baseTexture = new PIXI.BaseTexture(canvas);
  return new PIXI.Texture(baseTexture);
}

/**
 * @filter           Hue / Saturation
 * @description      Provides rotational hue and multiplicative saturation control. RGB color space
 *                   can be imagined as a cube where the axes are the red, green, and blue color
 *                   values. Hue changing works by rotating the color vector around the grayscale
 *                   line, which is the straight line from black (0, 0, 0) to white (1, 1, 1).
 *                   Saturation is implemented by scaling all color channel values either toward
 *                   or away from the average color channel value.
 * @param hueapp        -1 to 1 (-1 is 180 degree rotation in the negative direction, 0 is no change,
 *                   and 1 is 180 degree rotation in the positive direction)
 * @param saturation -1 to 1 (-1 is solid gray, 0 is no change, and 1 is maximum contrast)
 */
function getHueFilter(hueapp: number) {
  let hue = hueapp;
  //range hue in proshow 0->2000; 0->1000 is 0->-180
  if (hueapp <= 1000) {
    hue = (hueapp / 1000) * -1;
  } else {
    hue = (2000 - hueapp) / 1000;
  }
  const fragmentShader = `
        uniform sampler2D uSampler;
        uniform float hue;
        uniform float saturation;
        varying vec2 vTextureCoord;
        void main() {
            vec4 color = texture2D(uSampler, vTextureCoord);
            
            /* hue adjustment, wolfram alpha: RotationTransform[angle, {1, 1, 1}][{x, y, z}] */
            float angle = hue * 3.14159265;
            float s = sin(angle), c = cos(angle);
            vec3 weights = (vec3(2.0 * c, -sqrt(3.0) * s - c, sqrt(3.0) * s - c) + 1.0) / 3.0;
            float len = length(color.rgb);
            color.rgb = vec3(
                dot(color.rgb, weights.xyz),
                dot(color.rgb, weights.zxy),
                dot(color.rgb, weights.yzx)
            );
            
            /* saturation adjustment */
            float average = (color.r + color.g + color.b) / 3.0;
            if (saturation > 0.0) {
                color.rgb += (average - color.rgb) * (1.0 - 1.0 / (1.001 - saturation));
            } else {
                color.rgb += (average - color.rgb) * (-saturation);
            }
            
            gl_FragColor = color;
        }
    `;

  return new PIXI.Filter(undefined, fragmentShader, {
    hue,
    saturation: 0,
  });
}

function getChromaKeyFilter() {
  let frag = `
      varying vec2 vTextureCoord;
      uniform sampler2D uSampler;
      
      void main(void)
      {
         vec4 fg = texture2D(uSampler, vTextureCoord);
         vec4 bg;
         float maxrb = max( fg.r, fg.b );
         float k = clamp( (fg.g-maxrb)*5.0, 0.0, 1.0 );
         
         gl_FragColor = vec4( mix(fg, bg, k) );
      }
    `;

  return new PIXI.Filter(undefined, frag);
}

function drawGradientBox(gradient: Gradient): PIXI.Graphics {
  const graphics = new PIXI.Graphics();
  if (gradient.colormap) {
    let curcolor = Math.abs(1 + Number(gradient.colormap[0].color));
    graphics.beginFill(new Color(curcolor).toHexNumber());
    graphics.drawRect(0, 0, Number(gradient.defaultResX), Number(gradient.defaultResY));
    for (const col of gradient.colormap) {
      const nextcolor = Math.abs(1 + Number(col.color));
      if (nextcolor !== curcolor) {
        const halfBox = (Number(gradient.defaultResX) / 2) * (Number(col.index) / 10000);
        const color = new Color(nextcolor).toHexNumber();
        graphics.beginFill(color);
        graphics.drawRect(
          Number(gradient.defaultResX) / 2 - halfBox,
          Number(gradient.defaultResY) / 2 - halfBox,
          halfBox * 2,
          halfBox * 2
        );
        curcolor = nextcolor;
      }
    }
    graphics.endFill();
  }
  return graphics;
}
