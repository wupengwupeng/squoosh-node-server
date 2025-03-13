// const { ImagePool } = require('@squoosh/lib'); // Doesn't work due to bug in package.json (https://github.com/GoogleChromeLabs/squoosh/issues/1034)
const { ImagePool } = require("@squoosh/lib/build/index.js"); // Work around
const ExifTool = require("exiftool-vendored").exiftool;
const fs = require("fs");
const path = require("path");

const cors = require("cors");
const express = require("express");
const multer = require("multer");

const RAW_IMAGES_FOLDER = `${__dirname}/raw-images/`;
const CONVERTED_IMAGES_FOLDER = `${__dirname}/converted-images/`;

async function convertImage(inputFilname, outputFilname) {
  const inputPath = `${RAW_IMAGES_FOLDER}${inputFilname}`;
  const outputPath = `${CONVERTED_IMAGES_FOLDER}${outputFilname}`;

  console.time("convertImage");
  const imagePool = new ImagePool();
  const image = imagePool.ingestImage(inputPath);
  await image.decoded; //Wait until the image is decoded before running preprocessor
  console.info("\nImage Decoding Complete");

  // Pre-process
  const preprocessOptions = {
    resize: {
      enabled: true,
      width: 1080,
    },
  };
  await image.preprocess(preprocessOptions);
  console.info("Image Pre-Processing Complete");

  // Encode
  const encodeOptions = {
    mozjpeg: {
      quality: 85,
    },
  };
  await image.encode(encodeOptions);
  console.info("Image Encoding Complete");

  const rawEncodedImage = (await image.encodedWith.mozjpeg).binary;

  //await fs.writeFile(outputPath, rawEncodedImage);
  await fs.writeFileSync(outputPath, rawEncodedImage);
  console.info("Image Conversion Complete");

  await imagePool.close();
  console.info("Image Pool Closed");
  console.timeEnd("convertImage");

  const { FileSize: FileSizeBefore, ImageSize: ImageSizeBefore } =
    await ExifTool.read(inputPath);
  console.log(
    `\nBefore - File Size: ${FileSizeBefore}, Image Size: ${ImageSizeBefore}`
  );

  const { FileSize: FileSizeAfter, ImageSize: After } = await ExifTool.read(
    outputPath
  );
  console.log(`After - File Size: ${FileSizeAfter}, Image Size: ${After}\n`);

  // 删除本地上传的资源
  fs.unlinkSync(inputPath);
  return {
    FileSizeBefore,
    ImageSizeBefore,
    FileSizeAfter,
    After,
  };
}

// (async () => {
//   await convertImage("行驶证.jpg", "行驶证.jpg");
// })();

const app = express();
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*"); // 允许所有来源
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS"); // 允许的请求方法
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization"); // 允许的请求头
  if (req.method === "OPTIONS") {
    return res.sendStatus(204); // 预检请求（OPTIONS）直接返回 204
  }
  next();
});
app.use(
  cors({
    origin: "*",
    optionsSuccessStatus: 204,
  })
);

const storage = multer.diskStorage({
  // 文件存储的位置
  destination: function (req, file, cb) {
    cb(null, __dirname + "/raw-images");
  },
  // 文件重命名
  filename: function (req, file, cb) {
    console.log(file);
    let timeStamp = new Date().getTime();
    cb(null, timeStamp + "." + file.originalname.split(".")[1]);
    // cb(null, file.fieldname + '.jpg');
  },
});
const upload = multer({ storage: storage });

app.post("/api/upload", upload.single("image"), async (req, res) => {
  // 保存压缩后的图片到存储（如 S3、本地文件夹等）
  console.log("Received compressed image:", req.file);
  const fileName = req.file.filename;
  const { FileSizeBefore, ImageSizeBefore, FileSizeAfter, After } =
    await convertImage(fileName, fileName);

  res.json({
    url: `/images/${req.file.filename}`,
    FileSizeBefore,
    ImageSizeBefore,
    FileSizeAfter,
    After,
  });
});

app.get("/api/upload/get", (req, res) => {
  res.json({ message: "成功" });
});

// 启动服务器
const PORT = 3000;
app.use("/images", express.static(path.join(__dirname, "converted-images"))); //自带  托管静态文件
app.listen(PORT, () => {
  console.log("您正在监听", `http://localhost:3000`);
});
