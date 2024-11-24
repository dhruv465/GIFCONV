// VideoTrimmer.jsx
import React, { useState, useEffect, useRef } from 'react';
import ReactPlayer from 'react-player';
import { Scissors } from 'lucide-react';

const VideoTrimmer = ({ file, youtubeUrl, onTrimPoints }) => {
  const [duration, setDuration] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(0);
  const [isInitialized, setIsInitialized] = useState(false);
  const playerRef = useRef(null);

  useEffect(() => {
    if (duration > 0 && !isInitialized) {
      setEndTime(duration);
      setIsInitialized(true);
      onTrimPoints(0, duration);
    }
  }, [duration, isInitialized, onTrimPoints]);

  const handleDuration = (duration) => {
    setDuration(duration);
  };

  const formatTime = (time) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    const milliseconds = Math.floor((time % 1) * 100);
    return `${minutes}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`;
  };

  const handleTimeChange = (type, value) => {
    const newTime = parseFloat(value);
    
    if (type === 'start') {
      const newStartTime = Math.min(newTime, endTime - 0.1);
      setStartTime(newStartTime);
      onTrimPoints(newStartTime, endTime);
    } else {
      const newEndTime = Math.max(newTime, startTime + 0.1);
      setEndTime(newEndTime);
      onTrimPoints(startTime, newEndTime);
    }
  };

  const handleSeek = (time) => {
    if (playerRef.current) {
      playerRef.current.seekTo(time, 'seconds');
    }
  };

  const videoUrl = file ? URL.createObjectURL(file) : youtubeUrl;

  if (!videoUrl) return null;

  return (
    <div className="mt-8 bg-white rounded-xl p-6 shadow-lg">
      <div className="flex items-center gap-2 mb-4">
        <Scissors className="w-5 h-5 text-blue-500" />
        <h3 className="text-lg font-semibold">Trim Video</h3>
      </div>

      <div className="aspect-video bg-black rounded-lg overflow-hidden">
        <ReactPlayer
          ref={playerRef}
          url={videoUrl}
          width="100%"
          height="100%"
          controls
          onDuration={handleDuration}
        />
      </div>

      <div className="mt-6 space-y-4">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Start Time ({formatTime(startTime)})
            </label>
            <input
              type="range"
              min="0"
              max={duration}
              step="0.01"
              value={startTime}
              onChange={(e) => handleTimeChange('start', e.target.value)}
              onClick={() => handleSeek(startTime)}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              End Time ({formatTime(endTime)})
            </label>
            <input
              type="range"
              min="0"
              max={duration}
              step="0.01"
              value={endTime}
              onChange={(e) => handleTimeChange('end', e.target.value)}
              onClick={() => handleSeek(endTime)}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
          </div>
        </div>
        <div className="text-sm text-gray-500 flex justify-between items-center">
          <span>Selected Duration: {formatTime(endTime - startTime)}</span>
          <div className="space-x-2">
            <button
              onClick={() => handleSeek(startTime)}
              className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded transition-colors"
            >
              Preview Start
            </button>
            <button
              onClick={() => handleSeek(endTime)}
              className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded transition-colors"
            >
              Preview End
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoTrimmer;