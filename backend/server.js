import dotenv from 'dotenv';
dotenv.config();

import { GoogleAuth } from 'google-auth-library';
import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import ffprobePath from 'ffprobe-static';
import { SpeechClient } from '@google-cloud/speech';
import cors from 'cors';
import os from 'os'; // For temporary file path

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create a temporary credentials file from Base64 content
const setupGoogleCredentials = () => {
  const base64Content = process.env.GOOGLE_CREDENTIALS_BASE64;
  if (!base64Content) {
    throw new Error('GOOGLE_CREDENTIALS_BASE64 environment variable is not set');
  }

  const tempFilePath = path.join(os.tmpdir(), 'google-credentials.json');
  fs.writeFileSync(tempFilePath, Buffer.from(base64Content, 'base64'));

  process.env.GOOGLE_APPLICATION_CREDENTIALS = tempFilePath;
  console.log('Google Application Credentials file created at:', tempFilePath);

  return tempFilePath;
};

// Call this early in the setup
let tempCredentialsFile;
try {
  tempCredentialsFile = setupGoogleCredentials();
} catch (error) {
  console.error('Failed to set up Google credentials:', error);
  process.exit(1); // Exit if credentials setup fails
}

// FFmpeg setup
const ffmpegSetup = () => {
  ffmpeg.setFfmpegPath(ffmpegPath);
  ffmpeg.setFfprobePath(ffprobePath.path);
  console.log('FFmpeg and FFprobe paths set successfully:', { ffmpegPath, ffprobePath: ffprobePath.path });
};
ffmpegSetup();

const app = express();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use('/output', express.static(path.join('/tmp', 'output')));

const upload = multer({ dest: '/tmp/uploads' });
const uploadDir = path.join('/tmp', 'uploads');
const outputDir = path.join('/tmp', 'output');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

const speechClient = new SpeechClient();

const extractAudio = (videoPath, startTime, duration, outputAudioPath) => {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .setStartTime(startTime)
      .setDuration(duration)
      .toFormat('mp3')
      .audioCodec('libmp3lame')
      .audioBitrate('128k')
      .on('end', () => resolve(outputAudioPath))
      .on('error', reject)
      .save(outputAudioPath);
  });
};

const transcribeAudio = async (audioFilePath) => {
  const audioBuffer = fs.readFileSync(audioFilePath);
  const audioBytes = audioBuffer.toString('base64');

  const request = {
    audio: {
      content: audioBytes,
    },
    config: {
      encoding: 'MP3',
      sampleRateHertz: 16000,
      languageCode: 'en-US',
    },
  };

  const [response] = await speechClient.recognize(request);
  return response.results
    .map(result => result.alternatives[0].transcript)
    .join(' ');
};

const createGIF = (videoPath, startTime, duration, transcription, outputPath) => {
  return new Promise((resolve, reject) => {
    const command = ffmpeg(videoPath)
      .setStartTime(startTime)
      .setDuration(duration)
      .fps(10)
      .size('2160x?')
      .toFormat('gif');

    if (transcription) {
      command.videoFilters({
        filter: 'drawtext',
        options: {
          text: transcription,
          fontcolor: 'white',
          fontsize: 20,
          x: '(w-text_w)/2',
          y: 'h-(text_h*2)',
          box: 1,
          boxcolor: 'black@0.5',
          boxborderw: 5,
        },
      });
    }

    command
      .on('end', () => resolve(outputPath))
      .on('error', reject)
      .save(outputPath);
  });
};

app.post('/convert', upload.single('video'), async (req, res) => {
  const { startTime, endTime } = req.body;
  if (!req.file) return res.status(400).json({ message: 'No video file uploaded' });
  if (!startTime || !endTime || endTime <= startTime) {
    return res.status(400).json({ message: 'Invalid start or end time' });
  }

  const tempFilePath = req.file.path;
  const duration = endTime - startTime;
  const outputFilename = `output_${Date.now()}.gif`;
  const outputPath = path.join(outputDir, outputFilename);
  const audioFilename = `audio_${Date.now()}.mp3`;
  const outputAudioPath = path.join(outputDir, audioFilename);

  try {
    await extractAudio(tempFilePath, startTime, duration, outputAudioPath);
    const transcription = await transcribeAudio(outputAudioPath);
    await createGIF(tempFilePath, startTime, duration, transcription, outputPath);
    fs.unlinkSync(tempFilePath);
    fs.unlinkSync(outputAudioPath);

    res.json({ gifUrl: `/output/${outputFilename}`, transcription });
  } catch (err) {
    fs.unlinkSync(tempFilePath);
    if (fs.existsSync(outputAudioPath)) fs.unlinkSync(outputAudioPath);
    res.status(500).json({ message: err.message });
  }
});

app.get("/", (req, res) => res.send("Server is running!"));
app.use((req, res) => res.status(404).send("Route not found"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
