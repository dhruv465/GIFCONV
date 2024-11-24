require('dotenv').config();
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const { SpeechClient } = require('@google-cloud/speech');
const cors = require('cors');

const app = express();

// Enable CORS and JSON parsing
app.use(cors()); // Allow all origins

app.use(express.json());

app.get("/", (req, res) => {
  res.send("Hello from Node.js on Vercel!");
});

// Catch-all for undefined routes
app.use((req, res) => {
  res.status(404).send("Route not found");
});
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

// Helper function to extract audio from video
const extractAudio = (videoPath, startTime, duration, outputAudioPath) => {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .setStartTime(startTime)
      .setDuration(duration)
      .audioCodec('libmp3lame')
      .audioBitrate('128k')
      .output(outputAudioPath)
      .on('end', () => resolve(outputAudioPath))
      .on('error', (err) => reject(err))
      .run();
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

// Helper function to add subtitles to GIF
const addSubtitlesToGIF = (gifPath, transcription, outputPath) => {
  return new Promise((resolve, reject) => {
    const filter = `drawtext=text='${transcription}':fontcolor=white:fontsize=20:x=(w-text_w)/2:y=h-(text_h*2):box=1:boxcolor=black@0.5:boxborderw=5`;
    ffmpeg(gifPath)
      .outputOptions('-vf', filter)
      .save(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', reject);
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

    // Extract audio from the video
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

    // Generate GIF from the video
    const tempGifPath = path.join(outputDir, `temp_${Date.now()}.gif`);
    await new Promise((resolve, reject) => {
      ffmpeg(tempFilePath)
        .setStartTime(startTime)
        .setDuration(duration)
        .outputOptions('-vf', 'fps=10,scale=2160:-1:flags=lanczos')
        .toFormat('gif')
        .save(tempGifPath)
        .on('end', resolve)
        .on('error', reject);
    });

    // Add subtitles to the GIF
    if (transcription) {
      await addSubtitlesToGIF(tempGifPath, transcription, outputPath);
    } else {
      // If no transcription, just rename the temp GIF
      fs.renameSync(tempGifPath, outputPath);
    }

    // Clean up temporary files
    if (tempFilePath && fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    if (outputAudioPath && fs.existsSync(outputAudioPath)) fs.unlinkSync(outputAudioPath);
    if (tempGifPath && fs.existsSync(tempGifPath)) fs.unlinkSync(tempGifPath);

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

// Start the server
const PORT = process.env.PORT || 3000; // Let Vercel choose the port
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
