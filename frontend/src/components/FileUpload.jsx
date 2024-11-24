// FileUpload.jsx
import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileVideo } from 'lucide-react';

const FileUpload = ({ onFileSelect }) => {
  const onDrop = useCallback((acceptedFiles) => {
    if (acceptedFiles.length > 0) {
      onFileSelect(acceptedFiles[0]);
    }
  }, [onFileSelect]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'video/*': ['.mp4', '.mov', '.avi', '.webm']
    },
    maxFiles: 1
  });

  return (
    <div
      {...getRootProps()}
      className={`relative w-full h-64 border-2 border-dashed rounded-xl transition-colors duration-200 ease-in-out cursor-pointer
        ${isDragActive 
          ? 'border-blue-500 bg-blue-50' 
          : 'border-gray-300 hover:border-blue-400 bg-gray-50 hover:bg-gray-100'
        }`}
    >
      <input {...getInputProps()} />
      <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
        {isDragActive ? (
          <Upload className="w-12 h-12 mb-4 text-blue-500 animate-bounce" />
        ) : (
          <FileVideo className="w-12 h-12 mb-4 text-gray-400" />
        )}
        <p className="text-lg font-medium text-gray-700">
          {isDragActive ? 'Drop your video here' : 'Drag & drop your video here'}
        </p>
        <p className="mt-2 text-sm text-gray-500">
          or click to select a file
        </p>
        <p className="mt-1 text-xs text-gray-400">
          Supported formats: MP4, MOV, AVI, WebM
        </p>
      </div>
    </div>
  );
};

export default FileUpload;