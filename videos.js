const net = require("net");
const fs = require("fs");
const express = require("express");
const bodyParser = require("body-parser");
const child_process = require("child_process");

const SOCKET_PATH = "/tmp/mpv-socket"; // adjust if on Windows
const PORT = 3000;

let mpv;

const VIDEOS_BASE_PATH = "/Volumes/S_Drive/ambient-DRIVE";

const VIDEOS = {
  Waterfall: "waterfall-output.mp4",
  Train_Montenegro: "tr-output.mp4",
  Train_Norway: "tr-winter.mp4",
  Train_Japan_Winter: "jp-train-output-2.mp4",
  Train_Japan_Summer: "jp-train-output.mp4",
  Cosmos: "cosmos-output.mp4",
  Aquarium: "aquarium-output.mp4",
  Beach: "beach-output.mp4",
  Jungle: "rain-output-2.mp4",
  Cliff: "sr-output.mp4",
  Lake: "lake-output.mp4",
  Plane: "plane-output.mp4",
  Forest_River: "forest-river-output.mp4",
  Meadow: "meadow3-output.mp4",
  Lake: "lake2-output.mp4",
};

// ----------------- MPV Functions ------------------

function connectToMPV() {
  return new Promise((resolve, reject) => {
    const client = net.createConnection(SOCKET_PATH, () => {
      console.log("Connected to MPV socket");
      mpv = client;
      resolve(client);
    });
    client.on("error", reject);
  });
}

async function createMPVInstance() {
  return new Promise((resolve, reject) => {
    const process = child_process.spawn("mpv", [
      `--idle=yes`,
      `--input-ipc-server=${SOCKET_PATH}`,
      "--save-position-on-quit",
      "--screen=1",
      "--fs=yes",
      "--cache=yes",
      "--cache-secs=20",
      "--loop",
    ]);
    process.stdout.on("data", (data) => {
      console.log(`stdout: ${data}`);
    });
    process.stderr.on("data", (data) => {
      console.error(`stderr: ${data}`);
    });
    resolve(process);
  });
}

function sendMPVCommand(command) {
  const msg = JSON.stringify({ command }) + "\n";
  mpv.write(msg);
}

// Combined fade out for video + audio
async function fadeOutAll(duration = 1.0) {
  sendMPVCommand(["af", "add", `afade=out:0:${duration}`]);
  sendMPVCommand([
    "vf",
    "add",
    `fade=out:0:${Math.floor(duration * 60)}:0:0:0`,
  ]);
  return new Promise((resolve) => setTimeout(resolve, (duration + 0.2) * 1000));
}

// Combined fade in for video + audio
async function fadeInAll(duration = 1.0) {
  // Clear previous filters
  sendMPVCommand(["vf", "clr", ""]);
  sendMPVCommand(["af", "clr", ""]);

  sendMPVCommand(["af", "add", `afade=in:0:${duration}`]);
  sendMPVCommand(["vf", "add", `fade=in:0:${Math.floor(duration * 60)}:0:0:0`]);
  return new Promise((resolve) => setTimeout(resolve, (duration + 0.2) * 1000));
}

async function playVideo(path) {
  sendMPVCommand(["loadfile", path, "replace"]);
  return new Promise((resolve) => setTimeout(resolve, 500));
}

async function transitionToVideo(newPath, fadeDuration = 1.0) {
  console.log(`Transitioning to ${newPath}`);

  await fadeOutAll(fadeDuration);
  console.log("Faded out video and audio");

  await playVideo(newPath);
  console.log("Loaded new video");

  await fadeInAll(fadeDuration);
  console.log("Faded in video and audio");
}

// ----------------- HTTP Server ------------------

async function startServer() {
  const app = express();
  app.use(bodyParser.json());

  app.post("/play", async (req, res) => {
    const { video } = req.body;

    console.log("video input received:", video)

    if (!video || typeof video !== "string") {
      return res.status(400).send({ error: "Invalid video name" });
    }

    const videoPath = VIDEOS[video];
    if (!videoPath) {
      return res.status(404).send({ error: "Video not found" });
    }

    await transitionToVideo(`${VIDEOS_BASE_PATH}/${videoPath}`);
    res.send({ status: "Playing", video });
  });

  app.listen(PORT, async () => {
    console.log(`Server running on port ${PORT}`);
    await createMPVInstance();
    await connectToMPV();
  });
}

startServer();
