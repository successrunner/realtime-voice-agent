import React, { useState } from 'react';
import { StudentRecording } from './StudentRecording';
import { useTranscript } from '@/app/contexts/TranscriptContext';

export default function StudyCoach() {
  const [studentName, setStudentName] = useState<string>('');
  const { addTranscriptBreadcrumb } = useTranscript();

  const handleRecordingComplete = (metadata: {
    filePath: string;
    duration: number;
    type: "audio" | "video";
  }) => {
    addTranscriptBreadcrumb('Recording completed', metadata);
  };

  return (
    <div className="flex flex-col h-full">
      <StudentRecording
        studentName={studentName || 'Anonymous'}
        sessionType="study-session"
        onRecordingComplete={handleRecordingComplete}
        autoDownload={false}
      />
    </div>
  );
} 