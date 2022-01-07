import * as PIXI from 'pixi.js';
import { gsap } from 'gsap';
import { PixiPlugin } from 'gsap/PixiPlugin';
import { CanvasRecorder } from './capture-canvas';
import {
  AnimationInstructions,
  Image,
  ImageSize,
  LockAR,
  CroppedVideo,
  ReplaceableImage,
  SizeMode,
  Slide,
  Sprite,
  TransitionKeys,
  Transitions,
  TransitionValues,
  CaptionText,
  Caption,
} from './types';
import { Color } from './utils';
import type { ImageSizeType } from './types';
import { diffJSON } from './obj_comparison';
import {
  prepareObjectForKeyframeComparison,
  transitionImage,
  applyImageProperties,
  getTransitionFragmentShader,
  calculateAspectRatioFit,
  fillTextureSprite,
  applyCaptionProperties,
  playIfVideo,
  getVideoTagFromResource,
  isUserUploadedVideo,
  loadFont,
} from './pixi_helpers';
import _ from 'lodash';
import { LoaderResource } from 'pixi.js';
import { DEBUG_MODE, SLIDE_NUMBER_START, SLIDE_NUMBER_END } from './debugConstants';

const ANIMATABLE_PROPERTIES = ['zoomX', 'zoomY', 'offsetX', 'offsetY', 'tiltV', 'tiltH', 'rotation', 'blur'];
const FPS: number = 24;
const WEBM_FILENAME: string = 'test_video';
const GAP_THRESHOLD_BETWEEN_ANIMATIONS = 10; // in milliseconds

// const this.masterTimeline = gsap.timeline({ paused: true });

export async function loadJsonImageData(taskId: string): Promise<ImageSizeType> {
  return new Promise((resolve) => {
    let jsonPath = `/tasks/${taskId}/image-sizes.json`;
    const jsonLoader = new PIXI.Loader();
    jsonLoader.add('imageSizes', jsonPath);
    jsonLoader.onError.add((err: any, _loader: PIXI.Loader, resource: any) => {
      resolve({});
      console.error('Error loading image-sizes.json: ' + err.message + '\nURL : ' + resource.url);
    });
    jsonLoader.load((_loader, resources) => {
      const data = (resources as any).imageSizes.data;
      if (data) {
        for (const item of data) {
          ImageSize[item.name] = { width: item.width, height: item.height };
        }
      }
      resolve(ImageSize);
    });
  });
}
export class Animation {
  recording: boolean;
  app;
  renderer;
  stage;
  loader;
  resources: any[];
  masks: any[];
  ctx: HTMLCanvasElement | null = null;
  canvasRecorder: CanvasRecorder;
  croppedVideos: CroppedVideo[] = [];
  currentSlide: Slide | null = null;
  slideStartTime: number | null = null;
  currentSlideIndex: number | null = null;
  slidesInfo: {
    name: string;
    x?: number;
    x1?: number;
    y?: number;
    y1?: number;
    angle?: number;
    slideIndex: number;
    path: string;
  }[] = [];
  timelineFunctions: any[] = [];
  masterTimeline: gsap.core.Timeline;
  /*
   * logs every 'delta' seconds.
   * */
  logCheckpoints: boolean[] = [];
  loggingDeltaSeconds: number = 30;

  skipLoadingItems: { orig: LoaderResource; id: string }[] = [];

  constructor() {
    this.parsePshAndBuildScene = this.parsePshAndBuildScene.bind(this);
    this.findMaskTargetObjectId = this.findMaskTargetObjectId.bind(this);
    this.animateReplaceableImages = this.animateReplaceableImages.bind(this);
    this.clearStage = this.clearStage.bind(this);
    this.frameHandler = this.frameHandler.bind(this);
    this.setRendererSize = this.setRendererSize.bind(this);
    this.setCroppedVideos = this.setCroppedVideos.bind(this);
    this.getCroppedVideo = this.getCroppedVideo.bind(this);
    this.needToAdd = this.needToAdd.bind(this);
    this.getGapsToFillWithUserVideo = this.getGapsToFillWithUserVideo.bind(this);
    this.captureAndSaveCanvas = this.captureAndSaveCanvas.bind(this);
    this.timelineGetter = this.timelineGetter.bind(this);
    this.recording = false;
    this.app = new PIXI.Application();
    this.renderer = PIXI.autoDetectRenderer({
      width: 256,
      height: 256,
      antialias: true,
      transparent: false,
    });

    this.renderer.autoDensity = false;
    this.stage = new PIXI.Container();
    this.loader = this.app.loader;
    this.masterTimeline = this.timelineGetter();
    this.app.loader.onError.add((err: any, _loader: PIXI.Loader, resource: any) => {
      console.error('Unable to load name : ' + resource.name + ', url : ' + resource.url);
      console.error('Error:', err.message);
    });

    this.app.ticker.stop();
    this.resources = [];
    this.masks = [];

    gsap.registerPlugin(PixiPlugin);
    PixiPlugin.registerPIXI(PIXI);

    document.body.appendChild(this.renderer.view);

    this.canvasRecorder = new CanvasRecorder(this.renderer.view, WEBM_FILENAME, FPS);

    gsap.ticker.fps(FPS);

    // Compensate high load on CPU while rendering
    // If 60ms or more elapses between 2 ticks then adjust gsap timeline
    // to make it act like only 60ms elapsed
    // 1000ms / 24fps ~ 42ms
    // we use 60ms to be safe
    gsap.ticker.lagSmoothing(60, 60);

    // using gsap ticker handler instead of requestAnimationFrame
    gsap.ticker.add(this.frameHandler);
  }

  setCroppedVideos(videos: CroppedVideo[]) {
    this.croppedVideos = videos;
  }

  getCroppedVideo(name: string, fallbackValue: string) {
    if (this.croppedVideos.findIndex((v) => v.name === name) > -1) {
      return this.croppedVideos[this.croppedVideos.findIndex((v) => v.name === name)].croppedName;
    } else {
      return fallbackValue;
    }
  }

  async parsePshAndBuildScene(psh: AnimationInstructions, width: number, height: number, taskId: string) {
    this.clearStage();
    this.recording = false;
    this.setRendererSize(this.renderer, width, height);

    // cells are equal to slides
    // const totalVideoTime = psh.cell.reduce((a, b) => {
    //   if (b.transId) {
    //     return a + Number(b.time) + Number(b.transTime);
    //   }
    //
    //   return a + Number(b.time);
    // }, 0);
    // first preload images - @TODO: could be required to put a loader here
    for (const cell of psh.cell) {
      // filter video for now - reverse because background is in back
      cell.images = cell.images.reverse().filter((o) => Number(o.isAdjustmentLayer) !== 1);
      for (const cellImage of cell.images) {
        // add to scene
        if (!this.loader.resources.hasOwnProperty('image') && cellImage.objectId) {
          if (cellImage.image) {
            // pixi doesn't load .avi and .mov files that are built into some templates
            // we have to ignore that videos for now
            // eventually those videos should be reencoded to .mp4 and packed back into template's .zip file
            // user uploaded .mov files are already reencoded in engine during cropping
            if (cellImage.image.search(/(.avi|.mov)$/) > -1) {
              continue;
            }

            let imageLink = cellImage.image;
            const whImage = ImageSize[String(cellImage.name)];
            if (whImage && !cellImage.image.includes('tasks/')) {
              if (Number(cellImage.isVideo) === 1) {
                imageLink = this.getCroppedVideo(String(cellImage.name), cellImage.image);
              } else {
                let imageLinkUrl = new URL('https://sinapis.imgix.net/');
                imageLinkUrl.pathname = cellImage.image;

                imageLinkUrl.searchParams.append('w', whImage.width.toString());
                imageLinkUrl.searchParams.append('h', whImage.height.toString());
                imageLinkUrl.searchParams.append('crop', 'faces');
                imageLinkUrl.searchParams.append('fit', 'crop');
                imageLink = imageLinkUrl.href;
              }
            } else {
              if (cellImage.image?.includes('users/')) {
                console.log(`Image ${cellImage.name} not found in image-sizes.json using without size`);
                let imageLinkUrl = new URL('https://sinapis.imgix.net/');
                imageLinkUrl.pathname = cellImage.image;
                imageLinkUrl.searchParams.append('crop', 'faces');
                imageLinkUrl.searchParams.append('fit', 'crop');
                imageLink = imageLinkUrl.href;
              }
            }
            console.log(
              `try to load ${cellImage.isVideo ? 'VIDEO' : 'IMAGE'} ${cellImage.name} ID: ${
                cellImage.objectId
              } from: ${imageLink}`
            );
            if (this.needToAdd('image' + cellImage.objectId, imageLink)) {
              this.loader.add('image' + cellImage.objectId, imageLink, {
                loadType:
                  Number(cellImage.isVideo) === 1
                    ? PIXI.LoaderResource.LOAD_TYPE.VIDEO
                    : PIXI.LoaderResource.LOAD_TYPE.IMAGE,
              });
            }
          }
        }
      }
    }
    //add image for displacement filter
    this.loader.add('displacement', 'image/displacement.jpg');
    await new Promise((resolve) => {
      this.loader.load((_loader, _resource) => {
        PIXI.utils.clearTextureCache();
        console.log('all resources loaded');
        resolve(null);
      });
    });
    for (const item of this.skipLoadingItems) {
      this.loader.resources[item.id] = item.orig;
    }
    const animationTimeline: Slide[] = [];
    const replaceableImages: ReplaceableImage[] = [];

    let cellCounter = 0;
    for (const cell of psh.cell) {
      let slide: Slide = {
        slide: true,
        duration: Number(cell.time),
        animations: [],
        images: cell.images,
        caption: cell.caption,
      };
      animationTimeline.push(slide);
      for (const cellImage of cell.images) {
        // first check for in animations on images
        if (
          Number(cellImage.useTransitionIn) === 1 &&
          cellImage.transitionInId &&
          Number(cellImage.isMaskingLayer) !== 1 &&
          !cellImage.isVideo &&
          !cellImage.caption
        ) {
          slide.animations!.push({
            isTransitionIn: true,
            transitionId: cellImage.transitionInId,
            objectId: cellImage.objectId,
            gradient: cellImage.gradient,
            sizeMode: cellImage.sizeMode,
            lockAR: Number(cellImage.keyframes[0].lockAR),
            duration: isNaN(Number(cellImage.transitionInDuration)) ? 0 : Number(cellImage.transitionInDuration),
            timestamp: cellImage.keyframes[0].timestamp
              ? (Number(cellImage.keyframes[0].timestamp) / 10000) * slide.duration
              : 0,
          });
        }

        let keyframeDifferences = [];
        let k = 0;
        let keyframesLength = cellImage.keyframes.length;
        for (const keyframe of cellImage.keyframes) {
          if (k !== keyframesLength - 1 && !cellImage.caption) {
            keyframeDifferences.push({
              frame: keyframe,
              nextFrame: cellImage.keyframes[k + 1],
              diff: diffJSON(
                prepareObjectForKeyframeComparison(keyframe),
                prepareObjectForKeyframeComparison(cellImage.keyframes[k + 1])
              ),
              objectId: cellImage.objectId,
            });
          }
          k++;
        }
        if (
          keyframesLength > 0 &&
          Number(cellImage.replaceableTemplate) === 1 &&
          (cellImage.name as string).indexOf('Vignette') < 0 &&
          (cellImage.name as string).indexOf('Solid') < 0 &&
          (cellImage.name as string).indexOf('Gradient') < 0 &&
          !cellImage.hasOwnProperty('isMask') &&
          !cellImage.caption &&
          !cellImage.isVideo
        ) {
          replaceableImages.push({
            imageId: cellImage.objectId,
            startTime: (slide.duration * (cellImage.keyframes[0].timestamp || 0)) / 10000,
          });
        }

        keyframeDifferences.forEach((keyframeDiff) => {
          let animationPairs = this.getAnimationPairs(keyframeDiff);
          if (animationPairs.length) {
            animationPairs.forEach((int) => {
              if (keyframeDiff.diff[int]) {
                let toValue = _.isNumber(keyframeDiff.diff[int].with)
                  ? Number(keyframeDiff.diff[int].with)
                  : keyframeDiff.diff[int].with;
                let fromValue =
                  (_.isNumber(keyframeDiff.diff[int].base)
                    ? Number(keyframeDiff.diff[int].base)
                    : keyframeDiff.diff[int].base) || 0;
                if (int === 'tiltV' && !toValue) toValue = 0;
                if (int === 'blur') {
                  int = 'alpha';
                  fromValue = 0;
                  if (!toValue) {
                    toValue = 1;
                  }
                }
                if (typeof toValue !== 'undefined') {
                  slide.animations!.push({
                    property: int,
                    from: fromValue,
                    to: toValue,
                    duration: keyframeDiff.nextFrame.timestamp
                      ? (Number(keyframeDiff.nextFrame.timestamp - (keyframeDiff.frame.timestamp || 0)) / 10000) *
                        slide.duration
                      : 0,
                    objectId: keyframeDiff.objectId,
                    gradient: cellImage.gradient,
                    sizeMode: cellImage.sizeMode,
                    lockAR: Number(cellImage.keyframes[0].lockAR),
                    timestamp: keyframeDiff.frame.timestamp
                      ? (Number(keyframeDiff.frame.timestamp) / 10000) * slide.duration
                      : 0,
                  });
                }
              }
            });
          }
        });
        if (cellImage.isVideo) {
          cellImage.playVideoLater = true;
        }
        if (
          Number(cellImage.useTransitionOut) === 1 &&
          cellImage.transitionOutId &&
          cellImage.transitionOutDuration &&
          !cellImage.caption
        ) {
          slide.animations!.push({
            isTransitionOut: true,
            transitionId: cellImage.transitionOutId,
            objectId: cellImage.objectId,
            gradient: cellImage.gradient,
            sizeMode: cellImage.sizeMode,
            duration: Number(cellImage.transitionOutDuration),
            timestamp: (Number(cellImage.keyframes[cellImage.keyframes.length - 1].timestamp) / 10000) * slide.duration,
          });
        }
      }
      if (cell.caption) {
        for (const cellCaption of cell.caption) {
          if (cellCaption.flyInDuration && cellCaption.flyOutDuration) {
            slide.animations!.push({
              isCaption: true,
              internalId: cellCaption.internalId,
              flyInDuration: cellCaption.flyInDuration,
              flyOutDuration: cellCaption.flyOutDuration,
              duration:
                ((Number(cellCaption.keyframes[cellCaption.keyframes.length - 1].timestamp) -
                  Number(cellCaption.keyframes[0].timestamp || 0)) /
                  10000) *
                slide.duration,
              timestamp: (Number(cellCaption.keyframes[0].timestamp || 0) / 10000) * slide.duration,
            });
          }
        }
      }
      // @TODO: reactivate
      if (cell.transId) {
        const transitionTimeStamp: number = animationTimeline.reduce((value: number, item: Slide) => {
          return value + item.duration;
        }, 0);
        animationTimeline.push({
          transition: true,
          type: Transitions[Number(cell.transId) as TransitionKeys],
          duration: Number(cell.transTime),
          between:
            cellCounter !== psh.cell.length - 1
              ? [cell.images[0].objectId, psh.cell[cellCounter + 1].images[0].objectId]
              : [cell.images[0].objectId, null],
          timestamp: transitionTimeStamp,
        });
      }
      cellCounter++;
    }
    console.log('timeline', animationTimeline);

    this.triggerDownloadText('animation_timeline.json', JSON.stringify(animationTimeline));

    console.log('loading caption fonts...');

    // extract all fonts from captions and load them before executing animation timeline
    const slideCaptionFonts = animationTimeline
      .filter((slide) => slide.slide && !!slide.caption)
      .map((slide) => slide.caption!.map((caption) => caption.logFont.lfFaceName));

    const uniqueSlideCaptionFonts = _.uniq(_.flatten(slideCaptionFonts));

    // uniqueSlideCaptionFonts.forEach(async (font) => {
    // });
    for (const font of uniqueSlideCaptionFonts) {
      await loadFont(font, taskId);
    }
    console.log('loading fonts done');

    this.canvasRecorder.startRecording();
    this.recording = true;
    // execute animation timeline
    // the below implementation is to allow animating just one slide or a range of slides for easy debugging
    const debugMode = DEBUG_MODE;
    const slideNoStart = SLIDE_NUMBER_START;
    const slideNoEnd = SLIDE_NUMBER_END || slideNoStart + 1;
    const initializer = slideNoStart;
    const limit = debugMode ? slideNoEnd : animationTimeline.length;
    for (let i = initializer; i < limit; i++) {
      if (i > 4) {
        console.log('should break', this.timelineFunctions, i);
        break;
      }
      this.timelineFunctions.push(async () => {
        const animationTl = this.timelineGetter();
        const animation = animationTimeline[i];
        // we set the currentSlide variable to the current animation so we can use it in frameHandler function below
        this.currentSlide = animation;
        this.currentSlideIndex = i;
        if (!animation.transition) {
          // setup slide assets
          let showLater: { item: Sprite; parent: Image }[] = [];
          for (let index = 0; index < animation.images!.length; index++) {
            const cellImage = animation.images![index];
            if (
              this.loader.resources.hasOwnProperty('image' + cellImage.objectId) &&
              !cellImage.hasOwnProperty('gradient') &&
              !cellImage.hasOwnProperty('isMask')
            ) {
              let image = new PIXI.Sprite(this.loader.resources['image' + cellImage.objectId].texture) as Sprite;
              Object.assign(image, {
                id: cellImage.objectId,
              });
              image.anchor.set(0.5);
              image.renderable = false;
              image.isReplaceable = !!Number(cellImage.replaceableTemplate);
              if (Number(cellImage.isVideo) === 1) {
                let imageLink = this.getCroppedVideo(String(cellImage.name), cellImage.image);
                const videoTexture = await PIXI.Texture.fromURL(imageLink);
                const videoSource: HTMLMediaElement = (videoTexture.baseTexture
                  .resource as PIXI.resources.VideoResource).source as HTMLMediaElement;
                if (Number(cellImage.loopVideo) === 1) {
                  videoSource.loop = true;

                  /*
                   * We have to lower the playback rate so the video won't "go away" from the
                   * frame we set it to.
                   * See this.frameHandler function for more details.
                   * */
                  videoSource.playbackRate = 0.1;
                }

                image = new PIXI.Sprite(videoTexture) as Sprite;
                image.id = cellImage.objectId;
                image.duration = videoSource.duration;
                image.originalName = cellImage.image;
                image.anchor.set(0.5);
                image.renderable = false;
                await applyImageProperties(image, cellImage, this.renderer);
                this.resources.push(image);
                image.visible = false;
                showLater.push({ item: image, parent: cellImage });
                if (cellImage.playVideoLater) {
                  //need to start video during animation
                  videoSource.pause();
                }
              }
              if (animation.slide && animation.animations?.length) {
                if (animation.animations.findIndex((anim) => anim.objectId === cellImage.objectId) === -1) {
                  // add right away
                  image.renderable = true;
                }
              }

              await applyImageProperties(image, cellImage, this.renderer);
              let maskIndex = this.masks.findIndex((mask) => mask.targetObjectId === cellImage.objectId);
              if (maskIndex !== -1) {
                const mask = this.masks[maskIndex];
                mask.mask = image;
                this.stage.addChild(mask);
                image.hasMask = true;
                this.resources.push(mask);
              } else {
                if (Number(cellImage.isMaskingLayer) === 1) {
                  if (cellImage.hasOwnProperty('maskLayerCount')) {
                    image.visible = false;
                    showLater.push({ item: image, parent: cellImage });
                    for (let i = 0; i < Number(cellImage.maskLayerCount); i++) {
                      const objectIdToMask = animation.images![index - (i + 1)].objectId;
                      if (objectIdToMask) {
                        const objectToMask = this.resources.find((r) => r.id === objectIdToMask);
                        if (Number(cellImage.isVideo) === 1) {
                          objectToMask.mask = image;
                        } else {
                          image.texture = fillTextureSprite(
                            new PIXI.Sprite(this.loader.resources['image' + cellImage.objectId].texture) as Sprite,
                            this.renderer
                          );
                          objectToMask.mask = image;
                        }
                      }
                    }
                  }
                }
              }
              this.stage.addChild(image);
              this.resources.push(image);
            } else if (cellImage.hasOwnProperty('gradient') || cellImage.hasOwnProperty('isMask')) {
              // @TODO: implement gradient masks
              let mask = new PIXI.Sprite(
                cellImage.hasOwnProperty('image')
                  ? this.loader.resources['image' + cellImage.objectId].texture
                  : PIXI.Texture.WHITE
              ) as Sprite;
              Object.assign(mask, {
                id: cellImage.objectId,
                targetObjectId: this.findMaskTargetObjectId(psh, cellImage.objectId),
              });
              if (
                (cellImage.name as string).indexOf('Solid') !== -1 ||
                (cellImage.name as string).indexOf('Vignette') !== -1 ||
                (cellImage.name as string).indexOf('Gradient') !== -1
              ) {
                // solid color mask
                let color = cellImage.gradient?.colormap?.[0].color;
                if (!color || Number(color) === -1) {
                  color = 0xffffff;
                }
                mask.tint = new Color(color).toHex().hex;
                mask.targetObjectId = animation.images?.[Math.max(index - 1, 0)].objectId;
                if ((cellImage.name as string).indexOf('Solid') !== -1 && !cellImage.hasOwnProperty('isMask')) {
                  //show later only if solid is not mask
                  mask.visible = false;
                  showLater.push({ item: mask, parent: cellImage });
                }
              } else {
                // TODO: add missing implementation
              }
              mask.anchor.set(0.5);
              await applyImageProperties(mask, cellImage, this.renderer);

              this.resources.push(mask);
              let image = this.resources.find((o) => o.id === animation.images?.[Math.max(index - 1, 0)].objectId);
              if (Number(cellImage?.isMaskingLayer) === 1) {
                mask.visible = false;
                showLater.push({ item: mask, parent: cellImage });
                mask.renderable = true;
                this.stage.addChild(mask);
                if (cellImage.hasOwnProperty('maskLayerCount')) {
                  for (let i = 0; i < Number(cellImage.maskLayerCount); i++) {
                    const objectIdToMask = animation.images![index - (i + 1)].objectId;
                    if (objectIdToMask) {
                      const objectToMask = this.resources.find((r) => r.id === objectIdToMask);
                      objectToMask.mask = mask;
                      objectToMask.hasMask = true;
                    }
                  }
                } else {
                  image.mask = mask;
                  image.hasMask = true;
                }
              } else if (
                animation.images?.length &&
                index !== animation.images.length - 1 &&
                Number(animation.images?.[index + 1].isMaskingLayer) === 1
              ) {
                this.masks.push(mask);
                mask.targetObjectId = animation.images?.[index + 1].objectId;
              } else {
                // it's not a mask
                this.stage.addChild(mask);
              }
            } else if (cellImage.caption) {
              await this.addCaptionToStage(cellImage.caption);
            }
          }
          for (let item of showLater) {
            item.item.visible = true;
            if (item.parent.playVideoLater) {
              //if video, then show it when it playing in 'run animations'
              item.item.visible = false;
            }
          }
          if (animation.caption) {
            for (const textItem of animation.caption) {
              await this.addCaptionToStage(textItem);
            }
          }
          if (animation.slide && animation.animations?.length) {
            this.animateReplaceableImages(replaceableImages);

            const animationsOfVideoFile: {
              id: string;
              start: number;
              duration: number;
              type?: string;
            }[] = [];

            // const promises = [];

            for (const slideAnimation of animation.animations) {
              const resource = this.resources.find((o) => o.id === slideAnimation.objectId);

              if (
                resource &&
                !(slideAnimation.isTransitionIn || slideAnimation.isTransitionOut) &&
                isUserUploadedVideo(resource)
              ) {
                animationsOfVideoFile.push({
                  id: resource.id,
                  start: slideAnimation.timestamp ? Number(slideAnimation.timestamp) : 0,
                  duration: Number(slideAnimation.duration),
                  type: slideAnimation?.property?.toLowerCase(),
                });
              }
            }

            const gapsToFillWithUserVideo = this.getGapsToFillWithUserVideo(animationsOfVideoFile);

            for (const slideAnimation of animation.animations) {
              let resource = this.resources.find(
                (o) => o.id === slideAnimation.objectId || o.id === slideAnimation.internalId
              );
              if (!resource) {
                console.error(`Could not find asset with id of ${slideAnimation.objectId}`);
                continue;
              }
              gapsToFillWithUserVideo.forEach((gap) => {
                const currentStart = slideAnimation.timestamp ? Number(slideAnimation.timestamp) : 0;
                if (currentStart > gap.start) {
                  slideAnimation.timestamp = currentStart + gap.restOfVideoDuration * 1000;
                }
              });
              if (slideAnimation.isTransitionIn || slideAnimation.isTransitionOut) {
                if (!slideAnimation.transitionId)
                  throw new Error(`Missing transition ID for slide animation ${slideAnimation.objectId}`);
                const timeline = transitionImage(
                  resource,
                  slideAnimation.transitionId,
                  slideAnimation.duration,
                  this.loader,
                  slideAnimation.isTransitionIn ? 'in' : 'out'
                );
                // promises.push(transitionPromise);
                animationTl.add(timeline, slideAnimation.timestamp ? slideAnimation.timestamp / 1000 : 0);
              } else {
                if (resource && !resource.renderable) {
                  // check if there is an IN animation. Allow it to set renderable
                  if (animation.slide && animation.animations?.length) {
                    const animIndex = animation.animations.findIndex(
                      (anim) => anim.objectId === slideAnimation.objectId
                    );
                    if (animIndex !== -1 && !animation.animations[animIndex].isTransitionIn) {
                      resource.renderable = !resource.isMask;
                    }
                  } else {
                    resource.renderable = true;
                  }
                }
                let ratio: { width: number; height: number } | null = null;
                const isRotation = resource.anchor.x === 1 && resource.anchor.y === 0;
                if (slideAnimation.property && !slideAnimation.isCaption) {
                  const timeline = gsap.timeline({
                    paused: true,
                    defaults: {
                      duration: Number(slideAnimation.duration) / 1000,
                      onStart: (res) => {
                        playIfVideo(res);
                      },
                      onStartParams: [resource],
                    },
                  });

                  switch (slideAnimation?.property?.toLowerCase()) {
                    case 'offsetx':
                      {
                        const from = Number(slideAnimation.from) / 10000;
                        const to = Number(slideAnimation.to) / 10000;
                        timeline.fromTo(
                          resource,
                          {
                            x: isRotation
                              ? this.renderer.width / 2 + this.renderer.width * from + resource.width / 2
                              : this.renderer.width / 2 + this.renderer.width * from,
                          },
                          {
                            x: isRotation
                              ? this.renderer.width / 2 + this.renderer.width * to + resource.width / 2
                              : this.renderer.width / 2 + this.renderer.width * to,
                          }
                        );
                      }
                      break;
                    case 'offsety':
                      const from = Number(slideAnimation.from) / 10000;
                      const to = Number(slideAnimation.to) / 10000;
                      timeline.fromTo(
                        resource,
                        {
                          y: isRotation
                            ? this.renderer.height / 2 + this.renderer.height * from - resource.height / 2
                            : this.renderer.height / 2 + this.renderer.height * from,
                        },
                        {
                          y: isRotation
                            ? this.renderer.height / 2 + this.renderer.height * to - resource.height / 2
                            : this.renderer.height / 2 + this.renderer.height * to,
                        }
                      );
                      break;
                    case 'zoomx':
                      ratio = calculateAspectRatioFit(
                        resource.originalWidth,
                        resource.originalHeight,
                        this.renderer.width,
                        this.renderer.height
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
                        endWidth = this.renderer.width * scaleX;
                      }
                      let delayzoomx = slideAnimation.timestamp ? slideAnimation.timestamp / 1000 : 0;
                      if (delayzoomx > 0) resource.alpha = 0; //if start animation not immediately then hide the resource
                      timeline.to(resource, {
                        width: endWidth,
                        onStart: (res) => {
                          res.alpha = 1;
                          playIfVideo(res);
                        },
                      });

                      break;
                    case 'zoomy':
                      ratio = calculateAspectRatioFit(
                        resource.originalWidth,
                        resource.originalHeight,
                        this.renderer.width,
                        this.renderer.height
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
                        endHeight = this.renderer.height * scaleY;
                      }
                      let delayzoomy = slideAnimation.timestamp ? slideAnimation.timestamp / 1000 : 0;
                      if (delayzoomy > 0) resource.alpha = 0; //if start animation not immediately then hide the resource
                      timeline.to(resource, {
                        height: endHeight,

                        onStart: (res) => {
                          res.alpha = 1;
                          playIfVideo(res);
                        },
                      });

                      break;
                    case 'rotation':
                      timeline.to(resource, {
                        angle: Number(slideAnimation.to) / 1000,
                      });

                      break;
                    default:
                      //this is used to start a video/image that does not contain different keyframes
                      timeline.to(resource, {
                        alpha: 1,
                        visible: true,
                        onStart: (res) => {
                          res.alpha = 1;
                          playIfVideo(res);
                        },
                      });
                  }
                  animationTl.add(timeline, slideAnimation.timestamp ? slideAnimation.timestamp / 1000 : 0);
                }
                if (slideAnimation.isCaption) {
                  const timeline = this.timelineGetter();
                  resource = this.resources.find((o) => o.id === slideAnimation.internalId);
                  resource.alpha = 0;
                  const endText = Number(slideAnimation.duration) / 1000;
                  timeline
                    .to(
                      resource,
                      {
                        duration: Number(slideAnimation.flyInDuration) / 1000,
                        alpha: 1,
                        visible: true,
                      },
                      0
                    )
                    .to(
                      resource,
                      {
                        duration: Number(slideAnimation.flyOutDuration) / 1000,
                        alpha: 0,
                        visible: false,
                      },
                      endText
                    );
                  animationTl.add(timeline, (slideAnimation?.timestamp || 0) / 1000);
                }
              }
            }

            for (const item of gapsToFillWithUserVideo) {
              const timeline = this.timelineGetter();
              const resource = this.resources.find((o) => o.id === item.id);
              timeline.to(resource, {
                duration: item.restOfVideoDuration,
              });
              animationTl.add(timeline, (item.start + item.duration) / 1000);
            }
          } else {
            //if the slide without animation. Just show elements
            for (const resource of this.resources) {
              resource.renderable = !resource.isMask;
              playIfVideo(resource);
            }
            const timeline = this.timelineGetter();
            timeline.to(this.resources[0], {
              duration: 0,
            });
            animationTl.add(timeline, (animation.timestamp || animation.duration) / 1000);
          }
        } else {
          if (animation.type) {
            if (!this.recording) {
              this.canvasRecorder.startRecording();
              this.recording = true;
            }
            const timeline = gsap.timeline({
              defaults: {
                duration: Number(animation.duration) / 1000,
                alpha: 0,
              },
              paused: true,
            });
            switch (animation.type.toLowerCase()) {
              case 'fadeout':
                // const promises =
                for (const obj of this.resources) {
                  if (obj.children.length) {
                    timeline.to([...obj.children], {}, 0).to(obj, {}, 0);
                  }

                  // reduced the duration and increased the alpha value just so a current slide doesn't fadeout completely before a new one comes in
                  timeline.to(
                    obj,
                    {
                      duration: 0.3,
                      alpha: 0.3,
                    },
                    0
                  );
                }
                animationTl.add(timeline);
                break;
              case 'windowslice':
                const betweenObjects = animation?.between?.map((item) => {
                  return item
                    ? this.loader.resources['image' + item]
                    : {
                        texture: PIXI.Texture.WHITE,
                      };
                });

                if (betweenObjects?.length) {
                  let from = this.resources.find((obj) => obj.id === animation.between?.[0]);
                  let uniforms: any = {
                    smoothness: 0.9,
                    progress: 0,
                  };
                  betweenObjects.forEach((obj, i) => {
                    uniforms['uTexture' + (i + 1)] = obj.texture;
                  });
                  let filter = new PIXI.Filter(
                    undefined,
                    getTransitionFragmentShader(animation.type as TransitionValues, betweenObjects.length),
                    uniforms
                  );
                  filter.apply = function (filterManager, input, output, clear) {
                    let matrix = new PIXI.Matrix();
                    this.uniforms.mappedMatrix = (filterManager as any).calculateNormalizedScreenSpaceMatrix(matrix);

                    PIXI.Filter.prototype.apply.call(this, filterManager, input, output, clear);
                  };
                  from.filters = [filter];
                  timeline.to(filter.uniforms, {
                    duration: Number(animation.duration) / 1000,
                    progress: 1,
                    alpha: 1,
                  });
                }
                animationTl.add(timeline);
                break;
            }
          }
        }
        // masterTimeline.add(animationTl);
        const timestamp = animation.timestamp
          ? animation.timestamp
          : (animationTimeline[i - 1]?.timestamp || 0) + (animationTimeline[i - 1]?.duration || 0);
        return [animationTl, timestamp / 1000];
      });
    }

    console.log('timeline functions', this.timelineFunctions);

    for (const fn of this.timelineFunctions) {
      const [tl, time] = await fn();
      console.log(time, typeof time);

      console.log('timeline', tl, tl.getChildren(true, false, true), time);

      for (const child of tl.getChildren(true, false, true)) {
        child.play();
        console.log('all children', child);
      }
      this.masterTimeline.add(tl.play(), time);
    }
    console.log('master timeline 1', this.masterTimeline, this.masterTimeline.getChildren(false, false, true));

    await new Promise((resolve) => {
      console.log('about to play');

      this.masterTimeline.play();
      console.log('master timeline 2', this.masterTimeline, this.masterTimeline.getChildren(false, false, true));

      this.masterTimeline.eventCallback('onStart', () => console.log('I started playing oooo'));
      this.masterTimeline.eventCallback('onComplete', resolve);
    });

    let userVideosTimeline: { name: string; start: number; duration: number }[] = this.resources
      .filter((r) => !!getVideoTagFromResource(r))
      .map((r) => ({
        name: r.originalName,
        start: r.startTime ? parseFloat(r.startTime.toFixed(2)) : 0,
        duration: r.duration,
      }));

    console.log('user_videos_timeline: ', userVideosTimeline);
    this.triggerDownloadText('user_videos_timeline.json', JSON.stringify(userVideosTimeline, null, 2));
    this.triggerDownloadText('slides_coordinates.json', JSON.stringify(this.slidesInfo, null, 2));
    this.canvasRecorder.stopRecording();
    this.canvasRecorder.download();
  }
  async addCaptionToStage(textItem: Caption) {
    textItem.text = textItem.text.replace(/(")+/g, '').replace(/(?:\\r\\n|\\r|\\n)/g, '\n');
    const txt = new PIXI.Text(textItem.text) as CaptionText;
    await applyCaptionProperties(txt, textItem, this.renderer);
    txt.id = textItem.internalId;
    txt.renderable = false;
    txt.visible = false;
    this.stage.addChild(txt);
    this.resources.push(txt);
  }
  getGapsToFillWithUserVideo(
    animationsOfVideoFile: {
      id: string;
      start: number;
      duration: number;
      type?: string | undefined;
    }[]
  ) {
    let gapFound: { [key: string]: boolean } = {};
    let accumulatedDuration = 0;
    return (
      animationsOfVideoFile
        // remove duplicates by ignoring animation type
        .filter(
          (_item, index, arr) =>
            index === 0 || !(arr[index - 1].start === arr[index].start && arr[index - 1].id === arr[index].id)
        )
        // accumulate duration
        .map((item, index, arr) => {
          if (index === 0 || arr[index - 1].id !== arr[index].id) {
            accumulatedDuration = 0;
          } else {
            accumulatedDuration += arr[index - 1].duration;
          }
          return {
            id: item.id,
            start: item.start,
            duration: item.duration,
            accumulatedDuration: accumulatedDuration,
            restOfVideoDuration: 0,
          };
        })
        // find gaps between animations.
        // If there is no gap then return end of animations
        .filter((item, index, arr) => {
          if (
            index === arr.length - 1 ||
            arr[index].id !== arr[index + 1].id ||
            Math.abs(arr[index].start + arr[index].duration - arr[index + 1].start) > GAP_THRESHOLD_BETWEEN_ANIMATIONS
          ) {
            if (!gapFound[item.id]) {
              gapFound[item.id] = true;
              return true;
            }
          }
          return false;
        })
        // get number of seconds to wait till video ends
        .map((item) => {
          const resource = this.resources.find((o) => o.id === item.id);
          const videoTag = getVideoTagFromResource(resource);
          let restOfVideoDuration = 0;
          if (videoTag && videoTag.duration > item.accumulatedDuration / 1000) {
            restOfVideoDuration = videoTag.duration - item.accumulatedDuration / 1000;
          }
          return {
            id: item.id,
            start: item.start,
            duration: item.duration,
            restOfVideoDuration: restOfVideoDuration,
          };
        })
    );
  }
  getAnimationPairs(keyframeDiff: any) {
    let animationPairs = _.intersection(ANIMATABLE_PROPERTIES, Object.keys(keyframeDiff.diff));
    if (!animationPairs.length) {
      // for a picture that does not contain a change animation,
      // we need to add a fake timeSegment change so that the picture
      // starts at the right moment in the timeline animation
      animationPairs = ['timeSegment', 'timeSegment'];
    }
    return animationPairs;
  }

  needToAdd(id: string, imageLink: string) {
    let need = true;
    for (const key in this.loader.resources) {
      const item = this.loader.resources[key];
      if (item.url === imageLink || item.name === id) {
        need = false;
        this.skipLoadingItems.push({ orig: item, id: id });
      }
    }
    return need;
  }

  triggerDownloadText(filename: string, text: string) {
    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
    element.setAttribute('download', filename);

    element.style.display = 'none';
    document.body.appendChild(element);

    element.click();

    document.body.removeChild(element);
  }
  animateReplaceableImages(replaceableImages: ReplaceableImage[]) {
    //show replaceable images on time
    for (const objImage of replaceableImages) {
      const img = this.resources.find((r) => r.id === objImage.imageId);
      if (img) {
        img.visible = false;
        gsap.set(img, { visible: true, delay: Number(objImage.startTime) / 1000 });
      }
    }
  }

  findMaskTargetObjectId(psh: AnimationInstructions, maskId: string) {
    let objectId = '';
    for (let cell of psh.cell) {
      let i = 0;
      for (let image of cell.images) {
        if (image.objectId === maskId && cell.images[i - 1]) {
          objectId = cell.images[i - 1].objectId;
          break;
        }
        i++;
      }
    }
    return objectId;
  }

  clearStage() {
    this.loader.reset();
    for (let i = this.stage.children.length - 1; i >= 0; i--) {
      this.stage.removeChild(this.stage.children[i]);
    }
  }

  captureAndSaveCanvas(name: string): void {
    const dataUrl = this.renderer.view.toDataURL('png');
    const anchorEl = document.createElement('a');
    anchorEl.href = dataUrl;
    anchorEl.download = name;
    anchorEl.style.display = 'none';
    document.body.appendChild(anchorEl);
    anchorEl.click();
    document.body.removeChild(anchorEl);

    console.log(name, ' capture done');
  }
  stopFrame: number = -1;

  frameHandler(time: number, _delta: number, frame: number) {
    // Pixi
    this.renderer.render(this.stage);

    this.resources.forEach((resource) => {
      const videoTag = getVideoTagFromResource(resource);
      if (videoTag && resource.visible) {
        if (!resource.startTime) {
          resource.startTime = time;
          console.log(`started: ${resource.id} at: ${time}`);
        }
        /**
         * We slow down the video to sync with the recorder by setting its playback rate
         * to equal the speed at which the animation is being recorded
         */
        videoTag.playbackRate = computePlaybackRate(
          time,
          (currentTime - this.canvasRecorder.getRecordStartedTime()) / 1000
        );
      }
    });

    if (this.currentSlide && this.currentSlideIndex !== null) {
      if (!this.slideStartTime) {
        this.slideStartTime = time;
      } else {
        /**
         * number of seconds from start of a slide to take screenshot
         */
        const SNAPSHOT_TIME = 3;
        if (time >= this.slideStartTime + SNAPSHOT_TIME) {
          // find the resource from resources array which is currently visible and as same object id as currentSlide's id
          const resource = this.resources.find(
            (res) =>
              this.currentSlide?.images?.find((image) => image.objectId === res.id) && res.visible && res.isReplaceable
          );
          const name = `slide_${this.currentSlideIndex / 2}`;
          // if it's a replaceable image, we get the coordinates and calculate position
          if (resource) {
            const getter = this.gsapPropertyGetter(resource);
            // anchor is set to 0.5 ( meaning the center of the resource is at the top left of renderer), so we have to consider that when calculating positions
            let x = (getter('x') as number) - resource.width * 0.5;
            let y = (getter('y') as number) - resource.height * 0.5;
            const left = (x / this.renderer.width) * 100;
            const right = ((x + resource.width) / this.renderer.width) * 100;
            const top = (y / this.renderer.height) * 100;
            const bottom = ((y + resource.height) / this.renderer.height) * 100;
            const coordinates = {
              name,
              x: top,
              y: bottom,
              x1: left,
              y1: right,
              angle: getter('angle') as number,
              slideIndex: this.currentSlideIndex / 2,
              path: `${name}.png`,
            };
            this.slidesInfo.push(coordinates);
          } else {
            const slideInfo = {
              name,
              path: `${name}.png`,
              slideIndex: this.currentSlideIndex / 2,
            };
            this.slidesInfo.push(slideInfo);
          }
          this.captureAndSaveCanvas(name);
          // we set these values to null again to indicate we're done taking screenshots for that particulr slide
          this.slideStartTime = null;
          this.currentSlide = null;
          this.currentSlideIndex = null;
        }
      }
    }
    // logs every 'delta' seconds, writing how many seconds of video is recorded
    // need to use special _oldGetTime function, since usual getTime function is modified by CCapture
    // @ts-ignore
    const currentTime = new Date()._oldGetTime();
    const delta = Math.trunc((currentTime - this.canvasRecorder.getRecordStartedTime()) / 1000);
    const logCheckpoint = Math.trunc(delta / this.loggingDeltaSeconds);

    if (logCheckpoint > 0 && !this.logCheckpoints[logCheckpoint]) {
      console.log(`${delta} seconds passed, ${Math.trunc(time)} seconds of video recorded.`);
      console.log(
        '[VIDEO PLAYBACK RATE] :',
        computePlaybackRate(time, (currentTime - this.canvasRecorder.getRecordStartedTime()) / 1000)
      );
      this.logCheckpoints[logCheckpoint] = true;
    }

    if (this.stopFrame === frame) {
      this.recording = false;
      this.canvasRecorder.stopRecording();
    }
    if (this.recording) {
      // CCapture
      this.canvasRecorder.capture();
    }
  }
  timelineGetter() {
    return gsap.timeline({ paused: true });
  }
  gsapPropertyGetter(resource: any) {
    return gsap.getProperty(resource);
  }
  setRendererSize(renderer: PIXI.Renderer, width: number, height: number) {
    renderer.resize(width, height);
  }
}

const computePlaybackRate = (time: number, delta: number) => {
  /**
   * 0.0625 is the minimum value for a video playbackRate hence 
     if by chance the ratio is lesser than this value, we set it to the value.
   */
  return time / delta >= 0.0625 ? time / delta : 0.0625;
};
