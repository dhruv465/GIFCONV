import dotenv from 'dotenv';
import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { SpeechClient } from '@google-cloud/speech';
import cors from 'cors';

// ES modules fix for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();
const app = express();

// Initialize FFmpeg
const ffmpeg = new FFmpeg();
// Load FFmpeg
const ffmpegLoadPromise = (async () => {
  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.4/dist/umd';
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm')
  });
})();

// Enable CORS and JSON parsing
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cross-Origin-Opener-Policy', 'Cross-Origin-Embedder-Policy']
}));

app.use(express.json());

// Serve static files (for accessing generated GIFs)
app.use('/output', express.static(path.join('/tmp', 'output')));

// Setup multer for file uploads (use /tmp for temporary storage)
const upload = multer({ dest: '/tmp/uploads' });

// Create necessary directories in /tmp
const uploadDir = path.join('/tmp', 'uploads');
const outputDir = path.join('/tmp', 'output');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

// Google Cloud Speech-to-Text client
const speechClient = new SpeechClient();

// Helper function to extract audio from video using WebAssembly FFmpeg
const extractAudio = async (videoPath, startTime, duration, outputAudioPath) => {
  await ffmpegLoadPromise; // Ensure FFmpeg is loaded
  
  const inputData = await fetchFile(videoPath);
  const inputFileName = `input${path.extname(videoPath)}`;
  const outputFileName = 'output.mp3';
  
  await ffmpeg.writeFile(inputFileName, inputData);
  
  await ffmpeg.exec([
    '-i', inputFileName,
    '-ss', startTime.toString(),
    '-t', duration.toString(),
    '-vn',
    '-acodec', 'libmp3lame',
    '-ab', '128k',
    outputFileName
  ]);
  
  const audioData = await ffmpeg.readFile(outputFileName);
  fs.writeFileSync(outputAudioPath, audioData);
  
  // Cleanup
  await ffmpeg.deleteFile(inputFileName);
  await ffmpeg.deleteFile(outputFileName);
  
  return outputAudioPath;
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
const createGIF = async (videoPath, startTime, duration, transcription, outputPath) => {
  await ffmpegLoadPromise; // Ensure FFmpeg is loaded
  
  const inputData = await fetchFile(videoPath);
  const inputFileName = `input${path.extname(videoPath)}`;
  const outputFileName = 'output.gif';
  
  await ffmpeg.writeFile(inputFileName, inputData);
  
  const filterComplex = transcription
    ? `fps=10,scale=2160:-1:flags=lanczos,drawtext=text='${transcription}':fontcolor=white:fontsize=20:x=(w-text_w)/2:y=h-(text_h*2):box=1:boxcolor=black@0.5:boxborderw=5`
    : 'fps=10,scale=2160:-1:flags=lanczos';
  
  await ffmpeg.exec([
    '-i', inputFileName,
    '-ss', startTime.toString(),
    '-t', duration.toString(),
    '-vf', filterComplex,
    outputFileName
  ]);
  
  const gifData = await ffmpeg.readFile(outputFileName);
  fs.writeFileSync(outputPath, gifData);
  
  // Cleanup
  await ffmpeg.deleteFile(inputFileName);
  await ffmpeg.deleteFile(outputFileName);
  
  return outputPath;
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

    console.error('Error during processing:', err.message);
    res.status(500).json({ message: err.message || 'Error during processing' });
  }
});

app.get("/", (req, res) => {
  res.send("Hello from Node.js on Vercel!");
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