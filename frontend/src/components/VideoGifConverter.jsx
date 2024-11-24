// VideoGifConverter.jsx
import React, { useState } from "react";
import { Video, Wand2 } from "lucide-react";
import FileUpload from "./FileUpload";
import VideoTrimmer from "./VideoTrimmer";

const VideoGifConverter = () => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [youtubeUrl, setYoutubeUrl] = useState(null);
  const [gifUrl, setGifUrl] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [trimPoints, setTrimPoints] = useState({ start: 0, end: 5 }); // Default 5 seconds for GIF

  const handleFileSelect = (file) => {
    setSelectedFile(file);
    setYoutubeUrl(null);
    setGifUrl(null);
  };

  const handleTrimPoints = (start, end) => {
    setTrimPoints({ start, end });
  };

  const handleConvert = async () => {
    if (!selectedFile && !youtubeUrl) return;

    setIsProcessing(true);
    const formData = new FormData();

    if (selectedFile) {
      formData.append("video", selectedFile);
    } else if (youtubeUrl) {
      formData.append("youtubeUrl", youtubeUrl);
    }

    formData.append("startTime", trimPoints.start.toString());
    formData.append("endTime", trimPoints.end.toString());

    try {
      const response = await fetch("https://gifconv.onrender.com/convert", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();

      if (response.ok) {
        setGifUrl(`https://gifconv.onrender.com${data.gifUrl}`);
      } else {
        alert(data.message || "Error processing video");
      }
    } catch (error) {
      console.error("Conversion failed:", error);
      alert("Failed to convert video");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12">
            <div className="flex items-center justify-center mb-4">
              <Video className="w-12 h-12 text-indigo-600" />
            </div>
            <h1 className="text-4xl font-bold text-gray-900 mb-4">
              Video to GIF Converter
            </h1>
            <p className="text-lg text-gray-600">
              Transform your videos into high-quality GIFs
            </p>
          </div>

          <div className="space-y-8">
            {/* File Upload Section */}
            <div className="bg-white rounded-xl p-6 shadow-lg">
              <div className="space-y-6">
                <FileUpload onFileSelect={handleFileSelect} />
              </div>
            </div>

            {/* Video Trimmer */}
            {(selectedFile || youtubeUrl) && (
              <VideoTrimmer
                file={selectedFile}
                youtubeUrl={youtubeUrl}
                onTrimPoints={handleTrimPoints}
              />
            )}

            {/* Convert Button */}
            {(selectedFile || youtubeUrl) && (
              <div className="flex justify-center">
                <button
                  onClick={handleConvert}
                  disabled={isProcessing}
                  className="flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg hover:from-blue-600 hover:to-indigo-700 transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Wand2 className="w-5 h-5" />
                  {isProcessing ? "Converting..." : "Convert to GIF"}
                </button>
              </div>
            )}

            {/* Generated GIF Display */}
            {gifUrl && (
              <div className="bg-white rounded-xl p-6 shadow-lg">
                <h3 className="text-lg font-semibold mb-4">
                  Your Generated GIF
                </h3>
                <div className="aspect-video bg-gray-100 rounded-lg overflow-hidden">
                  <img
                    src={gifUrl}
                    alt="Generated GIF"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="mt-4 flex justify-end">
                  <a
                    href={gifUrl}
                    download="converted.gif"
                    className="flex items-center gap-2 px-6 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                  >
                    Download GIF
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoGifConverter;
