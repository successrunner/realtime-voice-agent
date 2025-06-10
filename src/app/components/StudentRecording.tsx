import React, { useState, useRef, useEffect } from 'react';
import { useTranscript } from '@/app/contexts/TranscriptContext';

interface StudentRecordingProps {
  studentName: string;
  onRecordingComplete: (metadata: {
    filePath: string;
    studentName: string;
    recordingType: 'audio' | 'video';
    purpose: string;
    description: string;
    date: string;
    duration: number;
    tags: string[];
  }) => void;
}

export const StudentRecording: React.FC<StudentRecordingProps> = ({
  studentName,
  onRecordingComplete,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingType, setRecordingType] = useState<'audio' | 'video'>('audio');
  const [purpose, setPurpose] = useState('');
  const [description, setDescription] = useState('');
  const [duration, setDuration] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const { addTranscriptBreadcrumb } = useTranscript();

  const startRecording = async () => {
    try {
      const constraints = {
        audio: true,
        video: recordingType === 'video',
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: recordingType === 'audio' ? 'audio/mp3' : 'video/mp4',
        });
        const url = URL.createObjectURL(blob);
        const filePath = `/recordings/${Date.now()}.${
          recordingType === 'audio' ? 'mp3' : 'mp4'
        }`;

        // Save the recording metadata
        onRecordingComplete({
          filePath,
          studentName,
          recordingType,
          purpose,
          description,
          date: new Date().toISOString(),
          duration,
          tags,
        });

        // Log the recording event
        addTranscriptBreadcrumb('Recording saved', {
          type: recordingType,
          purpose,
          duration,
        });

        // Clean up
        URL.revokeObjectURL(url);
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      startTimeRef.current = Date.now();
      
      // Start duration timer
      timerRef.current = setInterval(() => {
        setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);

      addTranscriptBreadcrumb('Recording started', {
        type: recordingType,
        purpose,
      });
    } catch (error) {
      console.error('Error starting recording:', error);
      addTranscriptBreadcrumb('Recording error', { error });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      
      // Stop duration timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }
  };

  const handleTagChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const tagInput = e.target.value;
    if (tagInput.includes(',')) {
      const newTags = tagInput
        .split(',')
        .map(tag => tag.trim())
        .filter(tag => tag && !tags.includes(tag));
      setTags([...tags, ...newTags]);
      e.target.value = '';
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  return (
    <div className="p-4 bg-white rounded-lg shadow">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Recording Type
          </label>
          <select
            value={recordingType}
            onChange={(e) => setRecordingType(e.target.value as 'audio' | 'video')}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            disabled={isRecording}
          >
            <option value="audio">Audio</option>
            <option value="video">Video</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Purpose
          </label>
          <input
            type="text"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="e.g., work presentation, progress reflection"
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            disabled={isRecording}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what will be recorded"
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
            placeholder="Add tags..."
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

        <div className="flex justify-center space-x-4">
          {!isRecording ? (
            <button
              onClick={startRecording}
              disabled={!purpose || !description}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-gray-400"
            >
              Start Recording
            </button>
          ) : (
            <button
              onClick={stopRecording}
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