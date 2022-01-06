import { path as pathToFfmpeg } from "@ffmpeg-installer/ffmpeg";
import ffmpeg from "fluent-ffmpeg";
import path from "path";
ffmpeg.setFfmpegPath(pathToFfmpeg);

const command = ffmpeg();
export default () =>
  new Promise<string>((resolve, reject) => {
    command
      .addInput(path.join(__dirname, "../frames/frame%03d.png")) //frame%03d suggests to ffmpeg that we're matching the text 'frame'
      // followed by sequential 3-digit numbers
      .on("start", () => console.log("conversion started"))
      .on("progress", (data) => console.log("in progress", data))
      .on("end", () => {
        console.log("conversion done");
        resolve("done");
      })
      .on("error", (e) => {
        console.log("error is", e.message);
        reject(e.message);
      })
      .inputOptions(["-framerate 25"])
      .outputOptions(["-c:v libx264", "-r 25", "-pix_fmt yuv420p"])
      .output("./output.mp4")
      .run();
  });
 