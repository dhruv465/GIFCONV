import dotenv from 'dotenv';
import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ffmpeg from 'fluent-ffmpeg';
import { SpeechClient } from '@google-cloud/speech';
import cors from 'cors';

// ES modules fix for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Set FFmpeg path for Vercel environment
const ffmpegSetup = () => {
  // For Vercel environment
  if (process.env.VERCEL) {
    // FFmpeg binaries should be in the project root under 'ffmpeg-static'
    const ffmpegPath = path.join(process.cwd(), 'ffmpeg-static/ffmpeg');
    const ffprobePath = path.join(process.cwd(), 'ffmpeg-static/ffprobe');
    
    if (fs.existsSync(ffmpegPath) && fs.existsSync(ffprobePath)) {
      ffmpeg.setFfmpegPath(ffmpegPath);
      ffmpeg.setFfprobePath(ffprobePath);
      console.log('FFmpeg paths set successfully:', { ffmpegPath, ffprobePath });
    } else {
      console.error('FFmpeg binaries not found in expected location');
    }
  } else {
    // For local development, assuming FFmpeg is installed globally
    try {
      const ffmpegPath = require('ffmpeg-static');
      const ffprobePath = require('ffprobe-static').path;
      ffmpeg.setFfmpegPath(ffmpegPath);
      ffmpeg.setFfprobePath(ffprobePath);
      console.log('FFmpeg paths set from node modules');
    } catch (error) {
      console.error('Error setting FFmpeg paths:', error);
    }
  }
};

// Initialize FFmpeg paths
ffmpegSetup();

dotenv.config();
const app = express();

// Enable CORS and JSON parsing
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Serve static files (for accessing generated GIFs)
app.use('/output', express.static(path.join('/tmp', 'output')));

// Setup multer for file uploads (use /tmp for temporary storage)
const upload = multer({ dest: '/tmp/uploads' });

// Create necessary directories in /tmp
const uploadDir = path.join('/tmp', 'uploads');
const outputDir = path.join('/tmp', 'output');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

// Google Cloud Speech-to-Text client
const speechClient = new SpeechClient();

// Helper function to extract audio from video
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

// Helper function to transcribe audio using Google Cloud Speech-to-Text
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

  try {
    const [response] = await speechClient.recognize(request);
    const transcription = response.results
      .map((result) => result.alternatives[0].transcript)
      .join(' ');
    console.log('Transcription received:', transcription);
    return transcription;
  } catch (err) {
    console.error('Error transcribing audio:', err);
    throw new Error('Failed to transcribe audio');
  }
};

// Helper function to create GIF with subtitles
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
          boxborderw: 5
        }
      });
    }
    
    command
      .on('end', () => resolve(outputPath))
      .on('error', reject)
      .save(outputPath);
  });
};

// Route for converting uploaded video to GIF
app.post('/convert', upload.single('video'), async (req, res) => {
  const { startTime, endTime } = req.body;
  let tempFilePath = null;
  let outputAudioPath = null;

  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No video file uploaded' });
    }

    if (!startTime || !endTime || endTime <= startTime) {
      return res.status(400).json({ message: 'Invalid start or end time' });
    }

    tempFilePath = req.file.path;
    const duration = endTime - startTime;
    const outputFilename = `output_${Date.now()}.gif`;
    const outputPath = path.join(outputDir, outputFilename);
    const audioFilename = `audio_${Date.now()}.mp3`;
    outputAudioPath = path.join(outputDir, audioFilename);

    console.log('Processing video:', {
      tempFilePath,
      startTime,
      duration,
      outputPath,
      outputAudioPath
    });

    // Extract audio and get transcription
    await extractAudio(tempFilePath, startTime, duration, outputAudioPath);
    
    let transcription = null;
    try {
      if (fs.existsSync(outputAudioPath) && fs.statSync(outputAudioPath).size > 0) {
        console.log('Audio file extracted successfully:', {
          path: outputAudioPath,
          size: fs.statSync(outputAudioPath).size,
        });
        transcription = await transcribeAudio(outputAudioPath);
      } else {
        console.error('Audio file is missing or empty');
      }
    } catch (transcribeError) {
      console.warn('Transcription failed:', transcribeError.message);
    }

    // Create GIF with optional subtitles
    await createGIF(tempFilePath, startTime, duration, transcription, outputPath);

    // Clean up temporary files
    if (tempFilePath && fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    if (outputAudioPath && fs.existsSync(outputAudioPath)) fs.unlinkSync(outputAudioPath);

    res.json({
      gifUrl: `/output/${outputFilename}`,
      transcription: transcription,
    });
  } catch (err) {
    // Clean up files in case of an error
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch (cleanupError) {
        console.error('Error cleaning up temp file:', cleanupError);
      }
    }
    if (outputAudioPath && fs.existsSync(outputAudioPath)) {
      try {
        fs.unlinkSync(outputAudioPath);
      } catch (cleanupError) {
        console.error('Error cleaning up audio file:', cleanupError);
      }
    }

    console.error('Error during processing:', err);
    res.status(500).json({ message: err.message || 'Error during processing' });
  }
});

// Health check endpoint
app.get("/", (req, res) => {
  res.send("Server is running!");
});

// Catch-all for undefined routes
app.use((req, res) => {
  res.status(404).send("Route not found");
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});