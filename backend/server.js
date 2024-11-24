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

// Configure multer with improved error handling
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  }
}).single('video');

// Initialize Google Cloud Speech Client with error handling
let speechClient;
try {
  speechClient = new SpeechClient({
    credentials: JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS)
  });
} catch (error) {
  console.error('Failed to initialize Speech Client:', error);
}

// Helper function to upload buffer to Cloudinary with timeout
const uploadToCloudinary = (buffer, options = {}) => {
  return new Promise((resolve, reject) => {
    const uploadTimeout = setTimeout(() => {
      reject(new Error('Upload timeout'));
    }, 30000); // 30 second timeout

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: 'video',
        folder: 'video-uploads',
        ...options
      },
      (error, result) => {
        clearTimeout(uploadTimeout);
        if (error) reject(error);
        else resolve(result);
      }
    );

    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
};

// Improved GIF creation with error handling and optimization
const createGIF = async (publicId, startTime, duration, text = null) => {
  try {
    const transformations = [
      { start_offset: startTime },
      { duration: duration },
      { format: 'gif' },
      { video_sampling: 10 },
      { width: 500 },
      { quality: 'auto' },
      { fetch_format: 'auto' },
      { flags: 'optimize' }
    ];

    if (text) {
      // Split long text into multiple lines
      const words = text.split(' ');
      let lines = [];
      let currentLine = '';
      
      words.forEach(word => {
        if ((currentLine + word).length > 30) {
          lines.push(currentLine.trim());
          currentLine = word + ' ';
        } else {
          currentLine += word + ' ';
        }
      });
      lines.push(currentLine.trim());

      transformations.push({
        overlay: {
          font_family: 'Arial',
          font_size: 24,
          text: lines.join('\n')
        },
        color: '#FFFFFF',
        background: 'rgba(0,0,0,0.7)',
        gravity: 'south',
        y: 20
      });
    }

    return cloudinary.url(publicId, {
      resource_type: 'video',
      transformation: transformations
    });
  } catch (error) {
    console.error('Error creating GIF:', error);
    throw new Error('Failed to create GIF');
  }
};

// Improved transcription function with retry mechanism
const getTranscription = async (videoUrl, startTime, duration, retries = 2) => {
  for (let i = 0; i <= retries; i++) {
    try {
      const audioUrl = cloudinary.url(videoUrl.split('/').pop().split('.')[0], {
        resource_type: 'video',
        format: 'mp3',
        start_offset: startTime,
        duration: duration,
        audio_codec: 'mp3'
      });

      const audioResponse = await fetch(audioUrl);
      if (!audioResponse.ok) throw new Error('Failed to fetch audio');
      
      const audioBuffer = await audioResponse.arrayBuffer();
      const audioContent = Buffer.from(audioBuffer).toString('base64');

      const request = {
        audio: { content: audioContent },
        config: {
          encoding: 'MP3',
          sampleRateHertz: 16000,
          languageCode: 'en-US',
          enableAutomaticPunctuation: true,
          model: 'default'
        },
      };

      const [response] = await speechClient.recognize(request);
      return response.results
        .map(result => result.alternatives[0].transcript)
        .join(' ');
    } catch (error) {
      if (i === retries) {
        console.error('Transcription failed after retries:', error);
        return null;
      }
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
};

// Main conversion endpoint with improved error handling
app.post('/convert', (req, res) => {
  upload(req, res, async (err) => {
    try {
      if (err) {
        return res.status(400).json({ 
          error: 'Upload failed', 
          message: err.message 
        });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'No video file uploaded' });
      }

      const startTime = parseFloat(req.body.startTime) || 0;
      const endTime = parseFloat(req.body.endTime);
      
      if (isNaN(endTime) || endTime <= startTime) {
        return res.status(400).json({ error: 'Invalid time range' });
      }

      const duration = endTime - startTime;

      console.log('Uploading video to Cloudinary...');
      const uploadResult = await uploadToCloudinary(req.file.buffer);

      let transcription = null;
      if (req.body.includeSubtitles === 'true' && speechClient) {
        console.log('Getting transcription...');
        transcription = await getTranscription(uploadResult.secure_url, startTime, duration);
      }

      console.log('Creating GIF...');
      const gifUrl = await createGIF(
        uploadResult.public_id,
        startTime,
        duration,
        transcription
      );

      res.json({
        success: true,
        gifUrl,
        transcription,
        metadata: {
          duration,
          startTime,
          endTime,
          originalSize: req.file.size,
          processedAt: new Date().toISOString()
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
});

// Health check endpoint with enhanced information
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    services: {
      cloudinary: !!cloudinary.config().cloud_name,
      speechToText: !!speechClient
    }
  });
});

app.get("/", (req, res) => {
  res.send("GIF Converter API is running!");
});

// Enhanced error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Something broke!',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;