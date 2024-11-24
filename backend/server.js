import dotenv from 'dotenv';
import express from 'express';
import multer from 'multer';
import cors from 'cors';
import { v2 as cloudinary } from 'cloudinary';
import { SpeechClient } from '@google-cloud/speech';
import streamifier from 'streamifier';

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
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  }
});

// Initialize Google Cloud Speech Client
const speechClient = new SpeechClient({
  credentials: JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS)
});

// Helper function to upload buffer to Cloudinary
const uploadToCloudinary = (buffer, options = {}) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: 'video',
        folder: 'video-uploads',
        ...options
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );

    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
};

// Helper function to generate GIF with Cloudinary
const createGIF = async (publicId, startTime, duration, text = null) => {
  try {
    const transformations = [
      { start_offset: startTime },
      { duration: duration },
      { format: 'gif' },
      { video_sampling: 10 }, // Adjust frame rate
      { width: 500 }, // Adjust width as needed
      { quality: 'auto' }
    ];

    if (text) {
      transformations.push({
        overlay: {
          font_family: 'Arial',
          font_size: 24,
          text: text
        },
        color: '#FFFFFF',
        background: 'rgba(0,0,0,0.5)',
        gravity: 'south',
        y: 20
      });
    }

    const url = cloudinary.url(publicId, {
      resource_type: 'video',
      transformation: transformations
    });

    return url;
  } catch (error) {
    console.error('Error creating GIF:', error);
    throw new Error('Failed to create GIF');
  }
};

// Helper function to extract and transcribe audio
const getTranscription = async (videoUrl, startTime, duration) => {
  try {
    // Get audio URL from Cloudinary
    const audioUrl = cloudinary.url(videoUrl.split('/').pop().split('.')[0], {
      resource_type: 'video',
      format: 'mp3',
      start_offset: startTime,
      duration: duration
    });

    // Download audio content
    const audioResponse = await fetch(audioUrl);
    const audioBuffer = await audioResponse.arrayBuffer();

    // Convert audio to base64 for Google Speech-to-Text
    const audioContent = Buffer.from(audioBuffer).toString('base64');

    const request = {
      audio: { content: audioContent },
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
  } catch (error) {
    console.error('Transcription error:', error);
    return null;
  }
};

// Main conversion endpoint
app.post('/convert', upload.single('video'), async (req, res) => {
  try {
    // Validate request
    if (!req.file) {
      return res.status(400).json({ error: 'No video file uploaded' });
    }

    const startTime = parseFloat(req.body.startTime) || 0;
    const endTime = parseFloat(req.body.endTime);
    
    if (isNaN(endTime) || endTime <= startTime) {
      return res.status(400).json({ error: 'Invalid time range' });
    }

    const duration = endTime - startTime;

    // Upload video to Cloudinary
    console.log('Uploading video to Cloudinary...');
    const uploadResult = await uploadToCloudinary(req.file.buffer);

    // Get transcription if needed
    let transcription = null;
    if (req.body.includeSubtitles === 'true') {
      console.log('Getting transcription...');
      transcription = await getTranscription(uploadResult.secure_url, startTime, duration);
    }

    // Create GIF
    console.log('Creating GIF...');
    const gifUrl = await createGIF(
      uploadResult.public_id,
      startTime,
      duration,
      transcription
    );

    // Return results
    res.json({
      success: true,
      gifUrl,
      transcription,
      metadata: {
        duration,
        startTime,
        endTime,
        originalSize: req.file.size
      }
    });

  } catch (error) {
    console.error('Conversion error:', error);
    res.status(500).json({
      error: 'Conversion failed',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString()
  });
});

// Root endpoint
app.get("/", (req, res) => {
  res.send("GIF Converter API is running!");
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Something broke!',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;