import React, { useState, useRef, useEffect } from "react";
import { useTranscript } from "@/app/contexts/TranscriptContext";
import { uploadRecordingToDropbox } from "@/app/lib/dropboxUtils";

interface StudentRecordingProps {
  studentName: string;
  onRecordingComplete: (metadata: {
    filePath: string;
    studentName: string;
    recordingType: "audio" | "video";
    purpose: string;
    description: string;
    date: string;
    duration: number;
    tags: string[];
    dropboxPath?: string;
    sharedUrl?: string;
  }) => void;
  autoDownload?: boolean;
  autoStart?: boolean;
  autoStop?: boolean;
  initialRecordingType?: "audio" | "video";
  initialPurpose?: string;
  initialDescription?: string;
}

export const StudentRecording: React.FC<StudentRecordingProps> = ({
  studentName,
  onRecordingComplete,
  autoDownload = true,
  autoStart = false,
  autoStop = false,
  initialRecordingType = "audio",
  initialPurpose = "Daily Reflection",
  initialDescription = "Student feedback recording",
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingType, setRecordingType] = useState<"audio" | "video">(
    initialRecordingType
  );
  const [purpose, setPurpose] = useState(initialPurpose);
  const [description, setDescription] = useState(initialDescription);
  const [duration, setDuration] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const { addTranscriptBreadcrumb } = useTranscript();

  const feedbackPurposes = [
    "Daily Reflection",
    "Learning Experience",
    "Challenge & Solution",
    "Achievement",
    "Improvement Suggestion",
  ];

  const startRecording = async () => {
    try {
      const constraints = {
        audio: true,
        video: recordingType === "video",
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      // Set up MediaRecorder with proper MIME type
      const mimeType = recordingType === "audio" ? "audio/webm" : "video/webm";
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      // Clear previous chunks
      chunksRef.current = [];

      // Set up event handlers
      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        if (chunksRef.current.length === 0) {
          console.warn("No recorded chunks found");
          return;
        }

        setIsUploading(true);
        setUploadError(null);
        setUploadSuccess(false);

        try {
          // Create the recording blob
          const mimeType = recordingType === "audio" ? "audio/mp3" : "video/mp4";
          const recordingBlob = new Blob(chunksRef.current, { type: mimeType });

          // Create a local download URL
          const downloadUrl = URL.createObjectURL(recordingBlob);

          // Format the local filename
          const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
          const localFilename = `${studentName}_${purpose}_${timestamp}.${
            recordingType === "audio" ? "mp3" : "mp4"
          }`;

          // Trigger local download if autoDownload is enabled
          if (autoDownload) {
            const a = document.createElement("a");
            a.href = downloadUrl;
            a.download = localFilename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(downloadUrl);
            addTranscriptBreadcrumb("Recording downloaded locally", { filename: localFilename });
          }

          // Upload to Dropbox
          const { path: dropboxPath, sharedUrl } = await uploadRecordingToDropbox(
            recordingBlob,
            studentName,
            recordingType,
            purpose
          );

          // Create metadata
          const metadata = {
            filePath: dropboxPath,
            studentName,
            recordingType,
            purpose,
            description,
            date: new Date().toISOString(),
            duration,
            tags,
            dropboxPath,
            sharedUrl
          };

          // Notify parent component
          onRecordingComplete(metadata);
          addTranscriptBreadcrumb("Recording saved to Dropbox", {
            path: dropboxPath,
            url: sharedUrl
          });

          setUploadSuccess(true);

          // Clean up
          chunksRef.current = [];
          if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
          }
        } catch (error) {
          console.error("Error handling recording:", error);
          setUploadError("Failed to save recording. Please try again.");
          addTranscriptBreadcrumb("Failed to save recording", { error });
        } finally {
          setIsUploading(false);
        }
      };

      // Start recording with timeslice to get data periodically
      mediaRecorder.start(1000); // Get data every second
      setIsRecording(true);
      startTimeRef.current = Date.now();

      // Start duration timer
      timerRef.current = setInterval(() => {
        setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);

      addTranscriptBreadcrumb("Recording started", {
        type: recordingType,
        purpose,
      });
    } catch (error) {
      console.error("Error starting recording:", error);
      addTranscriptBreadcrumb("Recording error", { error });
    }
  };

  const stopRecording = () => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === "recording"
    ) {
      // Request any final data
      mediaRecorderRef.current.requestData();
      // Stop the recording
      mediaRecorderRef.current.stop();
      setIsRecording(false);

      // Stop duration timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }
  };

  const downloadRecording = (url: string) => {
    try {
      const a = document.createElement("a");
      a.href = url;
      a.download = `${studentName}_${purpose}_${new Date().toISOString()}.${
        recordingType === "audio" ? "mp3" : "mp4"
      }`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      addTranscriptBreadcrumb("Recording downloaded successfully");
    } catch (error) {
      console.error("Error downloading recording:", error);
      addTranscriptBreadcrumb("Failed to download recording", { error });
    }
  };

  const handleTagChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const tagInput = e.target.value;
    if (tagInput.includes(",")) {
      const newTags = tagInput
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag && !tags.includes(tag));
      setTags([...tags, ...newTags]);
      e.target.value = "";
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter((tag) => tag !== tagToRemove));
  };

  useEffect(() => {
    if (autoStart && !isRecording) {
      startRecording();
    }
  }, [autoStart]);

  useEffect(() => {
    if (autoStop && isRecording) {
      console.log("Auto-stopping recording...");
      stopRecording();
    }
  }, [autoStop]);

  // Add a new effect to handle recording state changes
  useEffect(() => {
    if (!isRecording) {
      // Clean up the media stream when recording stops
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [isRecording]);

  // Add cleanup effect
  useEffect(() => {
    return () => {
      // Clean up on unmount
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state === "recording"
      ) {
        mediaRecorderRef.current.stop();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (uploadError) {
        console.error("Upload error:", uploadError);
      }
    };
  }, [uploadError]);

  return (
    <div className="p-4 bg-white rounded-lg shadow">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Recording Type
          </label>
          <select
            value={recordingType}
            onChange={(e) =>
              setRecordingType(e.target.value as "audio" | "video")
            }
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            disabled={isRecording}
          >
            <option value="audio">Audio</option>
            <option value="video">Video</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Feedback Type
          </label>
          <select
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            disabled={isRecording}
          >
            <option value="">Select feedback type...</option>
            {feedbackPurposes.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what you want to share about your day..."
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            disabled={isRecording}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Tags (comma-separated)
          </label>
          <input
            type="text"
            onChange={handleTagChange}
            placeholder="Add tags (e.g., math, art, reading)..."
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            disabled={isRecording}
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center px-2 py-1 rounded-full text-sm font-medium bg-indigo-100 text-indigo-800"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  className="ml-1 inline-flex items-center p-0.5 rounded-full text-indigo-400 hover:bg-indigo-200 hover:text-indigo-500"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>

        {isRecording && (
          <div className="text-center text-lg font-medium text-indigo-600">
            Recording: {duration} seconds
          </div>
        )}

        {isUploading && (
          <div className="text-center p-4 bg-blue-50 rounded-lg">
            <div className="flex items-center justify-center space-x-2">
              <svg className="animate-spin h-5 w-5 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span className="text-blue-700">Uploading to Dropbox...</span>
            </div>
          </div>
        )}

        {uploadError && (
          <div className="text-center p-4 bg-red-50 rounded-lg">
            <span className="text-red-700">{uploadError}</span>
          </div>
        )}

        {uploadSuccess && (
          <div className="text-center p-4 bg-green-50 rounded-lg">
            <div className="flex items-center justify-center space-x-2">
              <svg className="h-5 w-5 text-green-600" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span className="text-green-700">Successfully uploaded to Dropbox!</span>
            </div>
          </div>
        )}

        <div className="flex justify-center">
          {!isRecording ? (
            <button
              onClick={startRecording}
              disabled={!purpose || !description || isUploading}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-gray-400"
            >
              Start Recording
            </button>
          ) : (
            <button
              onClick={stopRecording}
              disabled={isUploading}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
            >
              Stop Recording
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default StudentRecording;
