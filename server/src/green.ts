import { Router } from "express";
import { createCanvas, loadImage } from "canvas";
const router = Router();

router.get("/filter", async (req, res) => {
  try {
    console.log("entered");
    // console.log(req.body.bg.values());
    const background =
      "https://sinapis.imgix.net/36672be2-cdb0-41c7-bc25-255dbc1cbf9f";
    const img =
      "https://sinapis.imgix.net/users/2inYwvkWKTbTaENRKkO1hNPsMjo1/813c6dde-27e1-452c-9f14-33a228caf410.jpg";
    const bg = await loadImage(background);
    const image = await loadImage(img);
    const imgCanvas = createCanvas(image.width, image.height);
    const bgCanvas = createCanvas(bg.width, bg.height);
    const ctx = bgCanvas.getContext("2d");
    ctx.drawImage(bg, 0, 0);
    const imageData = ctx.getImageData(0, 0, bgCanvas.width, bgCanvas.height);
    const { data } = imageData;
    for (let i = 0; i < data.length; i += 4) {
      let red = data[i];
      let green = data[i + 1];
      let blue = data[i + 2];
      if (green > blue + red) {
        data[i] = 0;
        data[i + 1] = 0;
        data[i + 2] = 0;
      }
    }
    ctx.putImageData(imageData, 0, 0);
    res.send(bgCanvas.toDataURL("image/png"));
  } catch (e) {
    console.log(e);
  }
});

export default router;
