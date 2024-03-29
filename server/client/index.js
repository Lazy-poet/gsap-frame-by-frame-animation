const masterTl = gsap.timeline()
let renderer = new PIXI.autoDetectRenderer({
    width: 700,
    height: 500,
    antialias: true,
    preserveDrawingBuffer: true,
    // transparency: 'notMultiplied'

});
let activeRenderIndex = 0;
const renderers = [renderer]
const renderTexture = PIXI.RenderTexture.create({ width: 700, height: 500 })
// const sp = new P
let advanceVideoFrame;
let resources = [];
let start = document.getElementById("start");
let globalIndex = 0;
var stage = new PIXI.Container();
let pauseAnimation = false;
const recorder = new CanvasRecorder(renderer.view, 'output.webm', 25)
let createSprites;
void async function () {
    // SET UP STAGE AND SPRITES 
    stage.addChild(new PIXI.Sprite(renderTexture));
    createSprites = () => {
        const rect = new PIXI.Graphics().beginFill(0xff0000).drawRect(0, 0, 100, 100).endFill();
        const rectSprite = new PIXI.Sprite(renderers[activeRenderIndex].generateTexture(rect))
        stage.addChild(rectSprite);
        const circle = new PIXI.Graphics().beginFill(0x00ff00).drawCircle(120, 120, 100).endFill();
        const circleSprite = new PIXI.Sprite(renderers[activeRenderIndex].generateTexture(circle))
        circleSprite.x = 400
        circleSprite.y = 400
        stage.addChild(circleSprite);
        Object.assign(rectSprite, {
            id: "27"
        })
        resources.push(rectSprite)
        Object.assign(circleSprite, {
            id: "28"
        })
        resources.push(circleSprite)

        const rounded = new PIXI.Graphics().beginFill(0x0000ff).drawRoundedRect(300, 300, 100, 100, 20).endFill();
        const roundedSprite = new PIXI.Sprite(renderers[activeRenderIndex].generateTexture(rounded))
        stage.addChild(roundedSprite);
        Object.assign(roundedSprite, {
            id: "29"
        })
        resources.push(roundedSprite)
        roundedSprite.x = 200
        roundedSprite.y = 200
    }
    createSprites()
    let sprite1 = new PIXI.Sprite(PIXI.Texture.from("assets/sampleimg1.png"));

    sprite1.anchor.set(0.5);
    sprite1.width = sprite1.height = 400;
    sprite1.x = 250;
    sprite1.y = 250;
    sprite1.renderable = false;
    Object.assign(sprite1, {
        id: "28",
    });
    sprite1.name = "image";
    // stage.addChild(sprite1);
    resources = [...resources, sprite1];
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

    stage.addChild(video);
    const shadow = new PIXI.filters.DropShadowFilter();
    shadow.color = 0x000000;
    shadow.distance = 10;
    shadow.alpha = 0.2;
    // video.filters = [new PIXI.filters.OutlineFilter(20, 0xff0000), shadow]

    // SECTION: GSAP SETUP & ANIMATION
    gsap.registerPlugin(PixiPlugin);

    PixiPlugin.registerPIXI(PIXI);
    const promises = [];
    for (const slideAnimation of animInstructions) {
        let resource = resources.find(
            (res) => res.id === slideAnimation.objectId
        );
        if (!resource) {
            // console.log(resources);
            console.error(
                `resource with that id not found ${slideAnimation.objectId}`
            );
            continue;
        }

        if (resource && !resource.renderable) {
            resource.renderable = true;
            resource.visible = false;
            resource.alpha = false;
        }
        const tl = gsap.timeline({ paused: true })
        tl.to(resource, { alpha: 1, visible: true, duration: 2 }, '>')
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
                            alpha: 1,
                            onComplete: () => {
                                resolve(null);
                            },
                            onStart: function (res) {
                                console.log('this timeline', this)
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
        }
        masterTl.add(tl.play(), startTime)
    }
    const dataUrls = []
    let index = 0;
    /**
     * 
     * @param {HTMLCanvasElement} canv current canvas object whose data we're capturing
     * @returns void
     * captures current data on the canvas and puhses to an array
     */
    const seekAndCaptureFrame = (canv) => {
        // const canvas = renderers[activeRenderIndex].extract.canvas(renderTexture);
        // const dataUrl = renderers[activeRenderIndex].view.toDataURL('image/png')
        // const dataUrl = canv.toDataURL('image/png');
        // console.log('capture frame ', index,);
        // index++
        // return dataUrl
        return ''
    }

    /**
     * 
     * @param {Timeline} animation 
     * @param {Number} fps 
     *  this function steps through animations (and videos, if there is one currently playing) 
     *  frame by frame, capturing each frame in the process
     */
    recorder.startRecording()
    const advanceAnimationFrame = async (animation, fps) => {
        let idx = 0;
        const taskId = uuid.v4();
        const update = async function () {
            renderers[activeRenderIndex].render(stage);
            renderers[activeRenderIndex].render(stage, renderTexture);
            const data = seekAndCaptureFrame(renderers[activeRenderIndex].view) // we call this before advancing so we get to capture firat frame
            if (!pauseAnimation) {
                recorder.capture()
                if (advanceVideoFrame) {
                    // check if there's a video currently playing and advance it by a frame
                    await advanceVideoFrame();
                }
                /**
          * naming pattern of files is really important in order to allow ffmpeg pick the images sequentially
          */
                const index =
                    idx < 10 ? `000${idx}` : idx < 100 ? `00${idx}` : idx < 1000 ? `0${idx}` : `${idx}`;
                const newTime = animation._time + 1 / fps
                const isComplete = newTime > animation._dur && animation.progress() === 1
                // advance the animation frame by seeking to the new time after capturing is done
                await sendFrameToServer(taskId, index, data, isComplete)
                animation.time(newTime)
                idx++
                globalIndex++
                if (newTime === 5) {
                    console.log('about to lose context')
                    const simulateWebGLContextLoss = () => {
                        // 
                        // simulate loss of WebGL context, for the purposes
                        // of improving user experience when the browser is 
                        // overwhelmed
                        //
                        const canvas = document.getElementById("renderer");
                        console.log('canvases', canvas)
                        if (canvas) {
                            setTimeout(() => {
                                const webgl2Context = canvas.getContext("webgl2", {});
                                if (webgl2Context) {
                                    console.log(`losing webgl2 context...`);
                                    webgl2Context.getExtension('WEBGL_lose_context').loseContext();
                                }
                                else {
                                    const webglContext = canvas.getContext("webgl", {});
                                    if (webglContext) {
                                        console.log(`losing webgl context...`);
                                        webglContext.getExtension('WEBGL_lose_context').loseContext();
                                    }
                                }
                            }, 0);
                        }
                    }
                    // simulateWebGLContextLoss()
                }
            } else {
                console.log('animation paused')
            }
            // if (isComplete) {
            //     // end animaiton
            //     recorder.stopRecording();
            //     return
            // }
            // await asyncCaller(update)
        }
        animation.pause()
        // void update()
        while (masterTl.progress() < 1) {
            await update()
        }
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
const activeCanvasContexts = []
function destroyCanvasContext(id) {
    const context = activeCanvasContexts.find((ctx) => ctx.canvas.id === id);
    if (context) {
        console.log('context found', context);
        context.clearRect(0, 0, context.canvas.width, context.canvas.height);
        document.body.removeChild(context.canvas);
    }
}
function addCanvasWebGLContextLossEventListener() {
    // const canvas = document.getElementsById("renderer");
    // if (canvas) {
    renderer.view.addEventListener('webglcontextlost', async (event) => {
        event.preventDefault();
        pauseAnimation = true
        let sprite1 = new PIXI.Sprite(PIXI.Texture.from("assets/sampleimg1.png"));
        await new Promise((resolve, reject) => {
            createSprites();
            console.log('children', stage.children)
            const newrenderer = new PIXI.autoDetectRenderer({
                width: 700,
                height: 500,
                antialias: true,
                preserveDrawingBuffer: true,
                // transparency: 'notMultiplied'

            });
            // const canvasDiv = document.getElementById("canvas")
            renderers.push(newrenderer)
            canvasDiv.appendChild(newrenderer.view);
            recorder.setCanvas(newrenderer.view);
            activeRenderIndex++;
            setTimeout(resolve, 900)
        })
        pauseAnimation = false
        console.log('animation played ')
    });

    console.log('listener added')
    // }
}

function removeCanvasWebGLContextLossEventListener() {
    const canvas = document.getElementsById("renderer");
    if (canvas) {
        canvas.addEventListener('webglcontextlost', (event) => {
            window.location.reload();
        });
    }
}
async function playIfVideo(res) {
    const vid = getVideoTagFromResource(res);
    if (vid) {
        const canv = document.createElement('canvas');
        canv.setAttribute('id', res.id)
        // creating a new video element offscreen from videoResource so we can seek successfully
        const video = document.createElement('video');
        video.src = vid.children[0].src
        document.body.appendChild(canv);
        document.body.appendChild(video);
        canv.width = vid.videoWidth;
        canv.height = vid.videoHeight;
        video.style.display = vid.style.display = 'none'
        const ctx = canv.getContext('2d');
        activeCanvasContexts.push(ctx)
        let i = 1;
        let baseVideoTextureSwapped = false;

        advanceVideoFrame = () => new Promise(async (resolve) => {
            if (video.currentTime >= vid.duration) {
                video.onseeked = null;
                //destroy and remove canvas
                // ctx.clearRect(0, 0, canv.width, canv.height);
                // document.body.removeChild(canv)
                destroyCanvasContext(res.id)
                // canvas.destroy()
                advanceVideoFrame = null
                console.log(i, ' video frames captured');
                resolve()
            }
            // added this check so we only change resource  onlyif video has been seeked at least once to prevent that initial flickering
            const currentTime = Math.min(vid.duration, video.currentTime + 1 / 25)
            console.log('ctime', currentTime)
            video.currentTime = currentTime;
            vid.currentTime = currentTime;
            vid.onseeked = async () => {
                // if (vid.currentTime > 1 / 25) {
                await ctx.drawImage(video, 0, 0, canv.width, canv.height); // draw the video frame to the canvas
                const dataUrl = canv.toDataURL('png');
                const base = await new PIXI.BaseTexture(dataUrl)
                const newTexture = await new PIXI.Texture(base);
                if (baseVideoTextureSwapped) {
                    res.texture.destroy(true);
                    console.log('texture destroyed')
                }
                // console.log(res, 'res 1', i)

                gsap.set(res, {
                    pixi: { texture: newTexture }, onComplete: () => {
                        if (!baseVideoTextureSwapped) {
                            baseVideoTextureSwapped = true;
                        }
                    },
                })
                // res.texture = newTexture;
                // }
                i++
                resolve()
            }
        })
    }
}
const canvasDiv = document.getElementById("canvas")
canvasDiv.appendChild(renderer.view);
renderer.view.setAttribute('id', 'renderer')
addCanvasWebGLContextLossEventListener()

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