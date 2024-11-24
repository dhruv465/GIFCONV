import dotenv from 'dotenv';
import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import { v2 as cloudinary } from 'cloudinary';
import { SpeechClient } from '@google-cloud/speech';
import streamifier from 'streamifier';

// ES modules fix for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const app = express();

// Enable CORS and JSON parsing
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Configure multer for memory storage instead of disk
const upload = multer({ storage: multer.memoryStorage() });

// Google Cloud Speech-to-Text client
const speechClient = new SpeechClient();

// Helper function to upload to Cloudinary
const uploadToCloudinary = (buffer) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: 'video',
        folder: 'video-uploads'
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );

    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
};

// Helper function to create GIF using Cloudinary
const createGIFWithCloudinary = async (publicId, startTime, duration, transcription) => {
  const transformations = [
    { start_offset: startTime, end_offset: startTime + duration },
    { width: 2160 },
    { format: 'gif' }
  ];

  if (transcription) {
    transformations.push({
      overlay: {
        font_family: 'Arial',
        font_size: 20,
        font_weight: 'bold',
        text: transcription,
        color: 'white'
      },
      gravity: 'south',
      y: 20
    });
  }

  return cloudinary.url(publicId, {
    resource_type: 'video',
    transformation: transformations
  });
};

// Helper function to transcribe audio using Google Cloud Speech-to-Text
const transcribeAudio = async (audioContent) => {
  const request = {
    audio: {
      content: audioContent.toString('base64'),
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

// Route for converting uploaded video to GIF
app.post('/convert', upload.single('video'), async (req, res) => {
  const { startTime, endTime } = req.body;

  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No video file uploaded' });
    }

    if (!startTime || !endTime || endTime <= startTime) {
      return res.status(400).json({ message: 'Invalid start or end time' });
    }

    const duration = endTime - startTime;

    // Upload video to Cloudinary
    console.log('Uploading to Cloudinary...');
    const uploadResult = await uploadToCloudinary(req.file.buffer);
    
    // Get audio for transcription using Cloudinary's audio extraction
    const audioUrl = cloudinary.url(uploadResult.public_id, {
      resource_type: 'video',
      format: 'mp3',
      start_offset: startTime,
      end_offset: startTime + duration
    });

    // Fetch audio content for transcription
    const audioResponse = await fetch(audioUrl);
    const audioBuffer = await audioResponse.arrayBuffer();
    
    // Get transcription
    let transcription = null;
    try {
      transcription = await transcribeAudio(Buffer.from(audioBuffer));
    } catch (transcribeError) {
      console.warn('Transcription failed:', transcribeError.message);
    }

    // Create GIF URL with Cloudinary
    const gifUrl = await createGIFWithCloudinary(
      uploadResult.public_id,
      startTime,
      duration,
      transcription
    );

    res.json({
      gifUrl,
      transcription,
    });

  } catch (err) {
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