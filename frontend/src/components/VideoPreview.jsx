import React, { useRef, useEffect } from 'react';

interface VideoPreviewProps {
  file: File | null;
}

export default function VideoPreview({ file }: VideoPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (file && videoRef.current) {
      videoRef.current.src = URL.createObjectURL(file);
    }
    return () => {
      if (videoRef.current?.src) {
        URL.revokeObjectURL(videoRef.current.src);
      }
    };
  }, [file]);

  if (!file) return null;

  return (
    <div className="w-full max-w-2xl mx-auto mt-8">
      <div className="relative aspect-video rounded-lg overflow-hidden bg-black">
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-contain"
          controls
          playsInline
        />
      </div>
      <div className="mt-4 px-4">
        <p className="text-sm text-gray-500">
          File: {file.name}
        </p>
        <p className="text-sm text-gray-500">
          Size: {(file.size / (1024 * 1024)).toFixed(2)} MB
        </p>
      </div>
    </div>
  );
}