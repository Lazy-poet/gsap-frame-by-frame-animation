let renderer = new PIXI.autoDetectRenderer({
    width: 700,
    height: 500,
    // antialias: true,
    preserveDrawingBuffer: true,
    transparency: 'notMultiplied',
    backgroundColor: 0x0000ff
});
const FPS = 25
const masterTimeline = gsap.timeline({ paused: true })
const app = new PIXI.Application();
const canvasRecorder = new CanvasRecorder(renderer.view, 'output.webm', 25)

gsap.registerPlugin(PixiPlugin);

PixiPlugin.registerPIXI(PIXI);

const stage = new PIXI.Container();
renderer._backgroundColorRgba[3] = 1.0;
document.body.appendChild(renderer.view)

const graphics = new PIXI.Graphics().beginFill(0x00ff00).drawRect(0, 0, 200, 200).endFill();
const graphicsSprite = new PIXI.Sprite(renderer.generateTexture(graphics));
let start = document.getElementById("start");

start.onclick = () => {
    console.log('clicked')
    const tl = transitionImage(graphicsSprite,);
    tl.to(graphicsSprite, { x: 200, duration: 5, }, '<1').to(graphicsSprite, { y: 100, duration: 4 });
    tl.play()

    // graphicsSprite.x = 60

}
const animate = () => {
    renderer.render(stage);
}
app.ticker.add(animate)
stage.addChild(graphicsSprite);



const transitionImage = (sprite, type = 'in', imageCount = 2) => {
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
    baseFragmentShader = baseFragmentShader
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
    const uniforms = {
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
    uniforms.scale = { x: 1, y: 1 };
    uniforms.count = 25;
    uniforms.isVerticalFromTop = true;
    const filter = new PIXI.Filter(undefined, baseFragmentShader, uniforms);
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
    sprite.filters = [filter];
    const timeline = gsap.timeline({ paused: true })
    timeline.to(filter.uniforms, {
        progress: type === 'in' ? 1 : 0,
        duration: 3,
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
let rendererDestroyed = false;
const renderFrame = async () => {
    if (rendererDestroyed) {
        //wait for new renderer to be created before continuing animation
        renderer = createRenderer(700, 500, contextLossEventListener);
        canvasRecorder.setCanvas(renderer.view);
        rendererDestroyed = false;
    }
    // render stage into currently active renderer
    renderer.render(stage);
    const newTime = masterTimeline.time() + 1 / FPS;
    // capture the canvas on every call of the function
    canvasRecorder.capture();
    masterTimeline.time(newTime); // advance animation by a frame
};

const createRenderer = (width, height, contextLossEventListener) => {
    // check for previous renderer and remove it from the dom
    const prevRenderer = document.getElementById(`renderer`);
    if (prevRenderer) {
        document.body.removeChild(prevRenderer);
    }

    const renderer = PIXI.autoDetectRenderer({
        width,
        height,
        antialias: true,
        transparent: false,
        preserveDrawingBuffer: true,
        autoDensity: false,
    });
    renderer.view.id = `renderer`;
    renderer.view.addEventListener('webglcontextlost', contextLossEventListener);
    document.body.appendChild(renderer.view);
    return renderer;
};

const contextLossEventListener = (event) => {
    // tell webgl we are handling context loss ourselves by preventing default
    event.preventDefault();
    console.warn('WEBGL context has been lost. Switching renderer to continue animation---');
};
