const masterTl = gsap.timeline()

const renderer = new PIXI.autoDetectRenderer({
    width: 700,
    height: 500,
    antialias: true,
    transparent: false,
    preserveDrawingBuffer: true,

});

let advanceVideoFrame;
let resources = [];
let start = document.getElementById("start");

void async function () {
    // SET UP STAGE AND SPRITES 
    var stage = new PIXI.Container();

    const rect = new PIXI.Graphics().beginFill(0xff0000).drawRect(0, 0, 100, 100).endFill();
    const rectSprite = new PIXI.Sprite(renderer.generateTexture(rect))
    stage.addChild(rectSprite);
    const circle = new PIXI.Graphics().beginFill(0x00ff00).drawCircle(120, 120, 100).endFill();
    const circleSprite = new PIXI.Sprite(renderer.generateTexture(circle))
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
    const roundedSprite = new PIXI.Sprite(renderer.generateTexture(rounded))
    stage.addChild(roundedSprite);
    Object.assign(roundedSprite, {
        id: "29"
    })
    resources.push(roundedSprite)
    roundedSprite.x = 200
    roundedSprite.y = 200
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

            console.log(loader);
            console.error(
                `resource with that id not found ${slideAnimation.objectId}`
            );
            continue;
        }

        if (resource && !resource.renderable) {
            resource.renderable = true;
            resource.visible = true
        }
        const tl = gsap.timeline()
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
        masterTl.add(tl, startTime)
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
        const dataUrl = canv.toDataURL('image/png');
        console.log('capture frame ', index,);
        index++
        dataUrls.push(dataUrl)
    }

    /**
     * 
     * @param {Timeline} animation 
     * @param {Number} fps 
     *  this function steps through animations (and videos, if there is one currently playing) 
     *  frame by frame, capturing each frame in the process
     */
    const advanceAnimationFrame = (animation, fps) => {
        const update = async function () {
            if (animation.progress() === 1) {
                // end animaiton
                return
            }
            renderer.render(stage);
            seekAndCaptureFrame(renderer.view) // we call this before advancing so we get to capture firat frame
            if (advanceVideoFrame) {
                // check if there's a video currently playing and advance it by a frame
                await advanceVideoFrame();
            }
            // advance the animation frame by seeking to the new time after capturing is done
            const newTime = animation._time + 1 / fps
            animation.time(newTime)
            await update();
        }
        animation.pause()
        void update()
    }

    masterTl.pause()

    start.onclick = async () => {
        advanceAnimationFrame(masterTl, 25)
    }
    masterTl.eventCallback('onComplete', () => {
        console.log('animaiton done!');
        // send the data to BE when video has ended and we've captured all frames
        console.log('data', dataUrls);
        window.alert('do you want to download output?')
        axios.post('http://localhost:7200/save-canvas', { dataUrls }, {
            headers: { 'Content-Type': 'application/json', },
            responseType: 'blob'
        }).then(response => {
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', 'output.mp4');
            document.body.appendChild(link);
            link.click();
        })
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
            await ctx.drawImage(video, 0, 0, canv.width, canv.height); // draw the video frame to the canvas
            const dataUrl = canv.toDataURL('png');
            const base = await new PIXI.BaseTexture(dataUrl)
            const newTexture = await new PIXI.Texture(base);
            res.texture = newTexture;
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

