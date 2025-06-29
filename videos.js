const net = require('net')
const fs = require('fs')
const express = require('express')
const bodyParser = require('body-parser')
const child_process = require('child_process')

const SOCKET_PATH = '/tmp/mpv-socket' // adjust if on Windows
const PORT = 3000

let mpv

const VIDEOS_BASE_PATH = '/Volumes/S_Drive/ambient-DRIVE'

const VIDEOS = {
  Waterfall: 'waterfall-output.mp4',
  Train_Montenegro: 'tr-output.mp4',
  Train_Norway: 'tr-winter.mp4',
  Train_Japan_Winter: 'jp-train-output.mp4',
  Train_Japan_Summer: 'jp-train.webm',
  Cosmos: 'cosmos-output.mp4',
  Aquarium: 'aquarium-output.mp4',
  Beach: 'beach-output.mp4',
  Jungle: 'junge-rain.mp4',
}

// ----------------- MPV Functions ------------------

function connectToMPV() {
  return new Promise((resolve, reject) => {
    const client = net.createConnection(SOCKET_PATH, () => {
      console.log('Connected to MPV socket')
      mpv = client
      resolve(client)
    })
    client.on('error', reject)
  })
}

async function createMPVInstance() {
  return new Promise((resolve, reject) => {
    const process = child_process.spawn('mpv', [
      `--idle=yes`,
      `--input-ipc-server=${SOCKET_PATH}`,
      '--save-position-on-quit',
      '--screen=1',
      '--fs=yes',
    ])
    process.stdout.on('data', (data) => {
      console.log(`stdout: ${data}`)
    })
    process.stderr.on('data', (data) => {
      console.error(`stderr: ${data}`)
    })
    resolve(process)
  })
}

function sendMPVCommand(command) {
  const msg = JSON.stringify({ command }) + '\n'
  mpv.write(msg)
}

function fadeToBlack(duration = 1.0) {
  sendMPVCommand(['vf', 'add', `fade=out:0:${Math.floor(duration * 60)}:0:0:0`])
  return new Promise((resolve) => setTimeout(resolve, (duration + 2) * 1000))
}

function fadeFromBlack(duration = 1.0) {
  sendMPVCommand(['vf', 'clr', ''])
  sendMPVCommand(['vf', 'add', `fade=in:0:${Math.floor(duration * 60)}:0:0:0`])
  return new Promise((resolve) => setTimeout(resolve, (duration + 2) * 1000))
}

async function playVideo(path) {
  sendMPVCommand(['loadfile', path, 'replace'])
  return new Promise((resolve) => setTimeout(resolve, 500))
}

async function transitionToVideo(newPath, fadeDuration = 1.0) {
  console.log(`Transitioning to ${newPath}`)
  await fadeToBlack(fadeDuration)
  console.log('faded to black')
  await playVideo(newPath)
  console.log('fade from black')
  await fadeFromBlack(fadeDuration)
  console.log('faded back in')
}

// ----------------- HTTP Server ------------------

async function startServer() {
  const app = express()
  app.use(bodyParser.json())

  app.post('/play', async (req, res) => {
    const { video } = req.body

    if (!video || typeof video !== 'string') {
      return res.status(400).send({ error: 'Invalid video path' })
    }

    const isVideoFile = fs.existsSync(video)

    const isVideoKey = Object.keys(VIDEOS).includes(video)

    if (!isVideoFile && !isVideoKey) {
      return res
        .status(404)
        .send({ error: `Video ${isVideoFile ? 'file' : 'key'} not found.` })
    }

    try {
      if (isVideoFile) {
        await transitionToVideo(video)
      } else if (isVideoKey) {
        await transitionToVideo(`${VIDEOS_BASE_PATH}/${VIDEOS[video]}`)
      }
      res.send({ status: 'ok', message: `Playing ${video}` })
    } catch (err) {
      console.error(err)
      res.status(500).send({ error: 'Failed to transition video' })
    }
  })

  app.listen(PORT, () => {
    console.log(`HTTP server listening on port ${PORT}`)
  })
}

// ----------------- Entry Point ------------------

;(async () => {
  if (!fs.existsSync(SOCKET_PATH)) {
    console.error('MPV socket not found. Start mpv with:')
    console.error(`mpv --idle=yes --input-ipc-server=${SOCKET_PATH}`)
    process.exit(1)
  }

  try {
    await createMPVInstance()
    setTimeout(async () => {
      await connectToMPV()
    }, 1000)
  } catch (e) {
    console.error(e)
  }

  await startServer()

  // Optional: Start with an initial video
  // await playVideo('intro.mp4');
})()
