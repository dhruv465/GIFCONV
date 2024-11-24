# **Video to GIF Converter with Audio Transcription**

This project processes video files to generate high-quality GIFs with optional subtitles from transcriptions. It extracts specific segments of a video, converts them into GIFs, transcribes audio using Google Cloud Speech-to-Text API, and overlays subtitles.

---

## **Features**
- Extracts specific segments of video files.
- Converts videos into high-quality GIFs.
- Transcribes audio segments using Google Cloud Speech-to-Text.
- Overlays transcriptions as subtitles on the generated GIFs.
- Supports HD GIF generation with customizable settings.

---

## **Prerequisites**
Before setting up the project, ensure you have the following installed:

1. **Node.js** (v14 or higher)
2. **FFmpeg** (for video and audio processing)
   - Install FFmpeg using:
     - **Linux:** `sudo apt update && sudo apt install ffmpeg`
     - **Mac:** `brew install ffmpeg`
     - **Windows:** [Download FFmpeg](https://ffmpeg.org/download.html) and add it to your system's PATH.
3. **Google Cloud Platform (GCP) Account**
   - Enable the **Speech-to-Text API** in your GCP project.
   - Download your **service account key** in JSON format.

---

## **Setup Instructions**

### **Step 1: Clone the Repository**
```bash
git clone https://github.com/dhruv465/GIFCONV.git
cd frontend
cd backend
```

### **Step 2: Install Dependencies**
Install the necessary packages using:
```bash
npm install
```

### **Step 3: Configure Environment Variables**
1. Create a `.env` file in the backend directory:
   ```bash
   touch .env
   ```
2. Add the following variables to `.env`:
   ```env
   GOOGLE_APPLICATION_CREDENTIALS=/path/to/your/service-account-key.json
   PORT=5000
   ```

   Replace `/path/to/your/service-account-key.json` with the absolute path to your Google Cloud service account key.
