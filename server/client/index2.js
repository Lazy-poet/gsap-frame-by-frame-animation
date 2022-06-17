const masterTl = gsap.timeline()
const renderer = new PIXI.autoDetectRenderer({
    width: 700,
    height: 500,
    antialias: true,
    preserveDrawingBuffer: true,

});
let displacement;
var app = new PIXI.Application()
// const renderer = app.renderer
const ticker = app.ticker
ticker.autoStart = false;
ticker.stop();
gsap.registerPlugin(PixiPlugin);
PixiPlugin.registerPIXI(PIXI);
let advanceVideoFrame;
let resources = [];
let start = document.getElementById("start");

void async function () {
    // SET UP STAGE AND SPRITES 
    var stage = new PIXI.Container();

    const rect = new PIXI.Graphics().beginFill(0xff0000).drawRect(0, 0, 100, 100).endFill();
    const rectSprite = new PIXI.Sprite(renderer.generateTexture(rect))
    // stage.addChild(rectSprite);
    const circle = new PIXI.Graphics().beginFill(0x00ff00).drawCircle(120, 120, 100).endFill();
    const circleSprite = new PIXI.Sprite(renderer.generateTexture(circle))
    circleSprite.x = 400
    circleSprite.y = 400
    // stage.addChild(circleSprite);
    const london = await PIXI.Texture.fromURL('./londonHOHO.jpg');
    displacement = await PIXI.Texture.fromURL('./displacement.jpg');
    london.width = 400
    london.height = 300
    const londonSprite = new PIXI.Sprite(london)
    circleSprite.x = 400
    circleSprite.y = 100
    stage.addChild(londonSprite);
    Object.assign(rectSprite, {
        id: "27"
    })
    resources.push(rectSprite)
    Object.assign(circleSprite, {
        id: "28.5"
    })
    resources.push(circleSprite)

    const rounded = new PIXI.Graphics().beginFill(0x0000ff).drawRoundedRect(300, 300, 100, 100, 20).endFill();
    const roundedSprite = new PIXI.Sprite(renderer.generateTexture(rounded))
    // stage.addChild(roundedSprite);
    Object.assign(roundedSprite, {
        // id: "29"
    })
    resources.push(roundedSprite)
    roundedSprite.x = 200
    roundedSprite.y = 200
    // let sprite1 = new PIXI.Sprite(PIXI.Texture.from("assets/sampleimg1.png"));

    // sprite1.anchor.set(0.5);
    // sprite1.width = sprite1.height = 400;
    // sprite1.x = 250;
    // sprite1.y = 250;
    // sprite1.renderable = false;
    // Object.assign(sprite1, {
    //     // id: "28",
    // });
    // sprite1.name = "image";
    // stage.addChild(sprite1);
    // resources = [...resources, sprite1];
    console.log("first resource", resources);
    let videoEl = "./testing.mp4";
    // let videoResource;
    let recording = false;
    let video;
    var videoTexture = await PIXI.Texture.fromURL(videoEl);
    videoResource = videoTexture.baseTexture.resource.source;
    video = new PIXI.Sprite(videoTexture);
    video.scale.set(0.75, 0.75);
    video.x = renderer.width / 4;
    video.y = renderer.height / 2;
    video.width = video.height = 300
    video.anchor.set(0.5, 0.5);
    video.visible = false;
    video.renderable = false;
    videoResource.pause();
    Object.assign(video, {
        id: "30",
        isVideo: true,
        duration: videoResource.duration
    });
    resources.push(video);

    // stage.addChild(video);
    const shadow = new PIXI.filters.DropShadowFilter();
    shadow.color = 0x000000;
    shadow.distance = 10;
    shadow.alpha = 0.2;
    video.filters = [new PIXI.filters.OutlineFilter(20, 0xff0000), shadow]

    // SECTION: GSAP SETUP & ANIMATION
    gsap.registerPlugin(PixiPlugin);
    PixiPlugin.registerPIXI(PIXI);
    const promises = [];
    for (const slideAnimation of animInstructions) {
        let resource = resources.find(
            (res) => res.id === slideAnimation.objectId
        );
        if (!resource) {
            console.log(resources);

            // console.log(loader);
            console.error(
                `resource with that id not found ${slideAnimation.objectId}`
            );
            continue;
        }
        resource.alpha = 0
        if (resource && !resource.renderable) {
            resource.renderable = true;
            resource.visible = true
        }
        const tl = gsap.timeline({ paused: true })
        const isRotation = resource.anchor.x === 1 && resource.anchor.y === 0;
        const startTime = slideAnimation.timestamp
            ? slideAnimation.timestamp / 1000
            : 0;
        // console.log('property', slideAnimation.property.toLowerCase())
        switch (slideAnimation.property.toLowerCase()) {
            case "offsetx":
                promises.push(
                    new Promise((resolve) => {
                        const from = Number(slideAnimation.from) / 10000;
                        const to = Number(slideAnimation.to) / 10000;
                        tl.fromTo(
                            resource,
                            {
                                x: isRotation
                                    ? renderer.width / 2 +
                                    renderer.width * from +
                                    resource.width / 2
                                    : renderer.width / 2 + renderer.width * from,
                            },
                            {
                                duration: Number(slideAnimation.duration) / 1000,
                                x: isRotation
                                    ? renderer.width / 2 +
                                    renderer.width * to +
                                    resource.width / 2
                                    : renderer.width / 2 + renderer.width * to,
                                onComplete: () => {
                                    resolve(null);
                                },
                                onStart: (res) => {
                                    playIfVideo(res);
                                },
                                onStartParams: [resource],
                                onUpdate: (res) => {
                                    seekIfVideo(res)
                                },
                                onUpdateParams: [resource]
                            }
                        );
                    })
                );
                break;
            case "offsety":
                promises.push(
                    new Promise((resolve) => {
                        const from = Number(slideAnimation.from) / 10000;
                        const to = Number(slideAnimation.to) / 10000;
                        tl.fromTo(
                            resource,
                            {
                                y: isRotation
                                    ? renderer.height / 2 +
                                    renderer.height * from -
                                    resource.height / 2
                                    : renderer.height / 2 + renderer.height * from,
                            },
                            {
                                duration: Number(slideAnimation.duration) / 1000,
                                // delay: slideAnimation.timestamp
                                //   ? slideAnimation.timestamp / 1000
                                //   : 0,
                                y: isRotation
                                    ? renderer.height / 2 +
                                    renderer.height * to -
                                    resource.height / 2
                                    : renderer.height / 2 + renderer.height * to,
                                onComplete: () => {
                                    resolve(null);
                                },
                                onStart: (res) => {
                                    playIfVideo(res);
                                },
                                onStartParams: [resource],
                                onUpdate: (res) => {
                                    seekIfVideo(res)
                                },
                                onUpdateParams: [resource]
                            }
                        );
                    })
                );
                break;
            case "zoomx":
                ratio = calculateAspectRatioFit(
                    resource.originalWidth,
                    resource.originalHeight,
                    renderer.width,
                    renderer.height
                );
                const scaleX = Number(slideAnimation.to) / 10000;
                let endWidth = ratio?.width * scaleX;
                if (
                    slideAnimation.gradient ||
                    !(
                        Number(slideAnimation.lockAR) === LockAR.LOCK_SCALE ||
                        Number(slideAnimation.sizeMode) === SizeMode.FIT_TO_FRAME
                    )
                ) {
                    endWidth = renderer.width * scaleX;
                }
                let delayzoomx = slideAnimation.timestamp
                    ? slideAnimation.timestamp / 1000
                    : 0;

                console.log('delay issss', delayzoomx)
                //if (delayzoomx > 0) { resource.alpha = 0 }; //if start animation not immediately then hide the resource
                promises.push(
                    new Promise((resolve) => {
                        tl.to(resource, {
                            duration: Number(slideAnimation.duration) / 1000,
                            // delay: delayzoomx,
                            width: endWidth,
                            onComplete: () => {
                                resolve(null);
                            },
                            onStart: (res) => {
                                res.alpha = 1;
                                playIfVideo(res);
                            },
                            onStartParams: [resource],
                            onUpdate: (res) => {
                                seekIfVideo(res)
                            },
                            onUpdateParams: [resource]
                        });
                    })
                );
                break;
            case "zoomy":
                ratio = calculateAspectRatioFit(
                    resource.originalWidth,
                    resource.originalHeight,
                    renderer.width,
                    renderer.height
                );
                const scaleY = Number(slideAnimation.to) / 10000;
                let endHeight = ratio?.height * scaleY;
                if (
                    slideAnimation.gradient ||
                    !(
                        Number(slideAnimation.lockAR) === LockAR.LOCK_SCALE ||
                        Number(slideAnimation.sizeMode) === SizeMode.FIT_TO_FRAME
                    )
                ) {
                    endHeight = renderer.height * scaleY;
                }
                let delayzoomy = slideAnimation.timestamp
                    ? slideAnimation.timestamp / 1000
                    : 0;
                // if (delayzoomy > 0) resource.alpha = 0; //if start animation not immediately then hide the resource
                console.log('delay', delayzoomy)
                promises.push(
                    new Promise((resolve) => {
                        tl.to(resource, {
                            duration: Number(slideAnimation.duration) / 1000,
                            // delay: delayzoomy,
                            height: endHeight,
                            onComplete: () => {
                                resolve(null);
                            },
                            onStart: (res) => {
                                res.alpha = 1;
                                playIfVideo(res);
                            },
                            onStartParams: [resource],
                            onUpdate: (res) => {
                                seekIfVideo(res)
                            },
                            onUpdateParams: [resource]
                        });
                    })
                );
                break;
            case "rotation":
                promises.push(
                    new Promise((resolve) => {
                        tl.to(resource, {
                            duration: Number(slideAnimation.duration) / 1000,
                            // delay: slideAnimation.timestamp
                            //   ? slideAnimation.timestamp / 1000
                            //   : 0,
                            angle: Number(slideAnimation.to) / 1000,
                            onComplete: () => {
                                resolve(null);
                            },
                            onStart: (res) => {
                                playIfVideo(res);
                            },
                            onStartParams: [resource],
                            onUpdate: (res) => {
                                seekIfVideo(res)
                            },
                            onUpdateParams: [resource]
                        });
                    })
                );
                break;
            default:
                //this is used to start a video/image that does not contain different keyframes
                promises.push(
                    new Promise((resolve) => {
                        tl.to(resource, {
                            duration: Number(slideAnimation.duration) / 1000,
                            // delay: slideAnimation.timestamp
                            //   ? slideAnimation.timestamp / 1000
                            //   : 0,
                            // alpha: 1,
                            onComplete: () => {
                                resolve(null);
                            },
                            onStart: function (res) {
                                console.log('this timeline', this)
                                // res.alpha = 1;
                                playIfVideo(res);
                            },
                            onStartParams: [resource],
                            onUpdate: (res) => {
                                seekIfVideo(res)
                            },
                            onUpdateParams: [resource]
                        });
                    })
                );
        }
        if (!resource.alpha) {
            if (!slideAnimation.timestamp) {
                tl.to(resource, { duration: 3, alpha: 1, visible: true }, 0);
            } else {
                tl.to(
                    resource,
                    { duration: 3, alpha: 1, visible: true },
                    Number(slideAnimation.timestamp) / 1000
                );
            }
        }
        // masterTl.add(tl.play(), startTime)
    }

    // const tl = gsap.timeline({ paused: true });
    // circleSprite.alpha = 0;
    // circleSprite.visible = false
    // tl.to(circleSprite, { alpha: 1, duration: 2, visible: true });
    const tl = transitionImage(londonSprite, 'in');
    masterTl.add(tl.play(), 0)
    const dataUrls = []
    let index = 0;
    /**
     * 
     * @param {HTMLCanvasElement} canv current canvas object whose data we're capturing
     * @returns void
     * captures current data on the canvas and puhses to an array
     */
    const seekAndCaptureFrame = (canv) => {
        const dataUrl = canv.toDataURL('image/png');
        console.log('capture frame ', index,);
        index++
        return dataUrl
    }
    const recorder = new CanvasRecorder(renderer.view, 'output.webm', 25)

    /**
     * 
     * @param {Timeline} animation 
     * @param {Number} fps 
     *  this function steps through animations (and videos, if there is one currently playing) 
     *  frame by frame, capturing each frame in the process
     */
    recorder.startRecording()
    // app.ticker.stop()
    const advanceAnimationFrame = (animation, fps) => {
        let idx = 0;
        const taskId = uuid.v4();
        const update = async function () {

            renderer.render(stage);
            const data = seekAndCaptureFrame(renderer.view) // we call this before advancing so we get to capture firat frame
            recorder.capture()
            if (advanceVideoFrame) {
                // check if there's a video currently playing and advance it by a frame
                await advanceVideoFrame();
            }
            /**
      * naming pattern of files is really important in order to allow ffmpeg pick the images sequentially
      */
            const index =
                idx < 10 ? `00${idx}` : idx < 100 ? `0${idx}` : `${idx}`;
            const newTime = animation._time + 1 / fps
            const isComplete = newTime > animation._dur && animation.progress() === 1
            // await sendFrameToServer(taskId, index, data, isComplete)
            // advance the animation frame by seeking to the new time after capturing is done
            animation.time(newTime)
            idx++
            if (isComplete) {
                // end animaiton
                recorder.stopRecording();
                return
            }
            await asyncCaller(update)
        }
        animation.pause()
        void update()
    }
    console.log('recorder is', recorder)
    async function asyncCaller(cb) {
        await cb()
    }
    masterTl.pause()
    const sendFrameToServer = async (taskId, frame, data, isComplete = false) => {
        try {
            const response = await axios.post('http://localhost:7200/save-canvas', { taskId, frame, dataUrl: data, isComplete }, {
                headers: { 'Content-Type': 'application/json', },
                responseType: 'blob'
            })
            if (isComplete) {
                const url = window.URL.createObjectURL(new Blob([response.data]));
                const link = document.createElement('a');
                link.href = url;
                link.setAttribute('download', 'output.mp4');
                document.body.appendChild(link);
                link.click();
            }
        } catch (e) {
            console.log(e.message)
        }
    }
    let startTime = 0;
    let sprite1 = new PIXI.Sprite(PIXI.Texture.from("./IMG_7842.jpg"));

    // sprite1.anchor.set(0.5);
    sprite1.width = sprite1.height = 400;
    sprite1.x = 250;
    sprite1.y = 250;
    sprite1.renderable = true;
    Object.assign(sprite1, {
        // id: "28",
    });
    sprite1.name = "image";
    stage.addChild(sprite1);
    start.onclick = async () => {
        startTime = performance.now()
        start.disabled = true
        advanceAnimationFrame(masterTl, 25);
    }
    masterTl.eventCallback('onComplete', () => {
        console.log(`animation took ${performance.now() - startTime}ms`)
    })
}()

function getVideoTagFromResource(resource) {
    const source = resource.texture.baseTexture.resource?.source;
    return source && source.tagName === "VIDEO" ? source : undefined;
}

function seekIfVideo(resource) {
}


async function playIfVideo(res) {
    const vid = getVideoTagFromResource(res);
    if (vid) {
        const canv = document.createElement('canvas');
        // creating a new video element offscreen from videoResource so we can seek successfully
        const video = document.createElement('video');
        video.src = vid.children[0].src
        document.body.appendChild(canv);
        document.body.appendChild(video);
        canv.width = vid.videoWidth;
        canv.height = vid.videoHeight;
        video.style.display = vid.style.display = canv.style.display = 'none'
        const ctx = canv.getContext('2d');
        let i = 1;
        advanceVideoFrame = () => new Promise(async (resolve) => {
            if (video.currentTime >= vid.duration) {
                video.onseeked = null;
                advanceVideoFrame = null
                console.log(i, ' video frames captured');
                resolve()
            }
            // added this check so we only change resource  onlyif video has been seeked at least once to prevent that initial flickering
            if (vid.currentTime > 1 / 25) {
                await ctx.drawImage(video, 0, 0, canv.width, canv.height); // draw the video frame to the canvas
                const dataUrl = canv.toDataURL('png');
                const base = await new PIXI.BaseTexture(dataUrl)
                const newTexture = await new PIXI.Texture(base);
                res.texture = newTexture;
            }
            const currentTime = Math.min(vid.duration, video.currentTime + 1 / 25)
            video.currentTime = currentTime;
            vid.currentTime = currentTime;
            vid.onseeked = () => {
                resolve(null)
                i++
            }
        })
    }
}
const canvasDiv = document.getElementById("canvas")
canvasDiv.appendChild(renderer.view);

// function loadImage(url, width, height) {
//     return new Promise((resolve) => {
//         let img = new Image(width, height);
//         img.src = url;
//         img.onload = () => {
//             resolve(img);
//         };

//         // img.onerror = () => resolve('failed to load image');

//         img.crossOrigin = 'Anonymous';
//     });
// }
// const send = document.getElementById("send");
// let bgImg;
// let userImg;
// send.onclick = () => {
//     const img = await loadImage()
// }
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

function calculateResolutionForShaderDisplacement(image, renderer) {
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