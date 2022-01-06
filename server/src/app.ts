import createError, { HttpError } from "http-errors";
import express, { Request, Response, NextFunction } from "express";
import path from "path";
import cookieParser from "cookie-parser";
import logger from "morgan";
import fs from "fs";
import cors from "cors";
import command from "./ffmpeg";

var app = express();
app.use(cors());
// view engine setup
app.use(express.static(path.join(__dirname, "../client")));

app.use(logger("dev"));
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));
app.use(function (req, res, next) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS, PUT, PATCH, DELETE"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-Requested-With,content-type"
  );
  res.setHeader("Access-Control-Allow-Credentials", "true");

  next();
});
app.get('/', (req, res) => {
  res.render('index')
})

app.post("/save-canvas", async (req: Request, res: Response) => {
  try {
    const { dataUrls } = req.body;
    const decodeBase64Image = (dataString: string) => {
      var matches = dataString.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/),
        response = {} as { data: Buffer };
      if (!matches || matches.length !== 3) {
        throw new Error("Invalid input string");
      }
      response.data = Buffer.from(matches?.[2], "base64");
      return response;
    };
    await Promise.all(
      dataUrls.map(async (url: string, idx: number) => {
        try {
          const response = decodeBase64Image(url);
          if (response) {
            const { data } = response;
            /**
             * naming pattern of files is really important in order to allow ffmpeg pick the images sequentially
             */
            const index =
              idx < 10 ? `00${idx}` : idx < 100 ? `0${idx}` : `${idx}`;
            await saveImageFile(`frame${index}`, data);
          }
        } catch (e: any) {
          console.log(e.message);
        }
      })
    );
    await command();
    // fs.rmSync(path.join(__dirname, "../frames/"), { recursive: true, force: true });
    return res.download(path.join(__dirname, "../output.mp4"), 'output.mp4');
    // res.status(200).send('done')
  } catch (err: any) {
    return res.status(500).send(`an error occured: ${err.message}`);
  }
});
const saveImageFile = (filename: string, data: Buffer) => {
  const folder = path.join(__dirname, "../frames/");
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder);
  }
  const pathname = path.join(folder, `${filename}.png`);
  return new Promise<null>((resolve, reject) => {
    fs.writeFile(pathname, data, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve(null);
      }
    });
  });
};
// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

// error handler
app.use(function (
  err: HttpError,
  req: Request,
  res: Response,
  next: NextFunction
) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get("env") === "development" ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render("error");
});

export default app;
