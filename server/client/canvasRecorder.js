class CanvasRecorder {
  startRecording() {
    this._recorder.start();
    this.recordStarted = new Date().getTime();
  }

  stopRecording() {
    this._recorder.stop();
  }

  capture() {
    this._recorder.capture(this._canvas);
  }

  getRecordStartedTime() {
    return this.recordStarted;
  }

  download = () => {
    this._recorder.save();
  };

  getTiming = () => {
    this._recorder.getTiming();
  };
  _canvas;
  _recorder;
  recordStarted;
  setCanvas = (canvas) => {
    this._canvas = canvas
  }
  constructor(canvas, fileName, fps) {
    this._canvas = canvas;
    console.log('framerate', fps);
    this._recorder = new CCapture({
      verbose: false,
      format: "webm",
      framerate: fps,
      name: fileName,

      // we can limit the time for dev purposes
      // so we won't wait till the end of the video
      // timeLimit: 10,
    });

    this.recordStarted = new Date().getTime();

    this.capture = this.capture.bind(this);
    this.download = this.download.bind(this);
    this.startRecording = this.startRecording.bind(this);
    this.stopRecording = this.stopRecording.bind(this);
    this.getRecordStartedTime = this.getRecordStartedTime.bind(this);
    this.getTiming = this.getTiming.bind(this);
  }
}

class MediaStreamRecorder {
  // recordedChunks: any[] = []
  startRecording() {
    this.start();
    // this.recordStarted = new Date().getTime();
    // console.log("[RECORDED CHUNKS]: ", this._recordedChunks)
  }

  stopRecording() {
    this._recorder.stop();
  }

  capture() {
    this.captureCanvas();
  }

  getRecordStartedTime() {
    return this.recordStarted;
  }

  download = () => {
    // this._recorder.save();
    var blob = new Blob(this._recordedChunks, {
      type: "video/webm",
    });
    var url = window.URL.createObjectURL(blob);
    var a = document.createElement("a");
    document.body.appendChild(a);
    a.style.display = "display: none";
    a.href = url;
    a.download = `${this.fileName}.webm`;
    a.click();
    return url;
    // window.URL.revokeObjectURL(url);
  };

  _canvas;
  _recorder;
  recordStarted;
  start;
  _recordedChunks;
  fileName;

  constructor(_canvas, fileName, fps) {
    this._canvas = _canvas;
    this.fileName = fileName;
    console.log('canvas is', _canvas)
    const stream = _canvas.captureStream(fps);
    this._recordedChunks = [];

    this.start = () => {
      let options = { mimeType: "video/webm" };
      try {
        this._recorder = new MediaRecorder(stream, options);
      } catch (e0) {
        console.log("Unable to create MediaRecorder with options Object: ", e0);
        try {
          options = { mimeType: "video/webm,codecs=vp9" };
          this._recorder = new MediaRecorder(stream, options);
        } catch (e1) {
          console.log(
            "Unable to create MediaRecorder with options Object: ",
            e1
          );
          try {
            options = { mimeType: "video/vp8" }; // Chrome 47
            this._recorder = new MediaRecorder(stream, options);
          } catch (e2) {
            console.error("Exception while creating MediaRecorder:", e2);
            return;
          }
        }
      }
      console.log(
        "Created MediaRecorder",
        this._recorder,
        "with options",
        options
      );
      this._recorder.onstop = (event) => {
        console.log("Recorder stopped: ", event);
        const superBuffer = new Blob(this._recordedChunks, {
          type: "video/webm",
        });
        const src = window.URL.createObjectURL(superBuffer);
        console.log("[DOWNLOAD URL]: ", src, fileName);
      };

      this._recorder.start(1000 / fps); // collect 100ms of data
      console.log("MediaRecorder started", this._recorder);
    };

    this.captureCanvas = () => {
      this._recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          this._recordedChunks.push(e.data);
        } else {
          console.log("EMPTY EVENT DATA");
        }
      };
    };

    this.recordStarted = new Date().getTime();

    this.capture = this.capture.bind(this);
    this.download = this.download.bind(this);
    this.startRecording = this.startRecording.bind(this);
    this.stopRecording = this.stopRecording.bind(this);
    this.getRecordStartedTime = this.getRecordStartedTime.bind(this);
  }
}
