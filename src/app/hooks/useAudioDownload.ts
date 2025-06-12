import { useRef } from "react";
import { convertWebMBlobToWav } from "../lib/audioUtils";

function useAudioDownload() {
  // Ref to store the MediaRecorder instance.
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  // Ref to collect all recorded Blob chunks.
  const recordedChunksRef = useRef<Blob[]>([]);
  // Ref to track if we're recording video
  const isVideoRecordingRef = useRef<boolean>(false);

  /**
   * Starts recording by combining the provided stream with
   * the microphone audio if needed.
   * @param stream - The MediaStream to record (may include video).
   */
  const startRecording = async (stream: MediaStream) => {
    // Check if this is a video recording
    isVideoRecordingRef.current = stream.getVideoTracks().length > 0;
    
    const options = {
      mimeType: isVideoRecordingRef.current ? "video/webm" : "audio/webm"
    };

    try {
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };
      // Start recording without a timeslice.
      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
    } catch (err) {
      console.error("Error starting MediaRecorder:", err);
    }
  };

  /**
   * Stops the MediaRecorder, if active.
   */
  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      // Request any final data before stopping.
      mediaRecorderRef.current.requestData();
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
  };

  /**
   * Initiates download of the recording.
   * For audio, converts from WebM to WAV.
   * For video, keeps as WebM.
   */
  const downloadRecording = async () => {
    // If recording is still active, request the latest chunk.
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      // Request the current data.
      mediaRecorderRef.current.requestData();
      // Allow a short delay for ondataavailable to fire.
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    if (recordedChunksRef.current.length === 0) {
      console.warn("No recorded chunks found to download.");
      return;
    }
    
    try {
      let finalBlob: Blob;
      let extension: string;
      
      if (isVideoRecordingRef.current) {
        // For video, keep as WebM
        finalBlob = new Blob(recordedChunksRef.current, { type: "video/webm" });
        extension = "webm";
      } else {
        // For audio, convert to WAV
        const webmBlob = new Blob(recordedChunksRef.current, { type: "audio/webm" });
        finalBlob = await convertWebMBlobToWav(webmBlob);
        extension = "wav";
      }

      const url = URL.createObjectURL(finalBlob);

      // Generate a formatted datetime string (replace characters not allowed in filenames).
      const now = new Date().toISOString().replace(/[:.]/g, "-");

      // Create an invisible anchor element and trigger the download.
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = url;
      a.download = `realtime_agents_recording_${now}.${extension}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      // Clean up the blob URL after a short delay.
      setTimeout(() => URL.revokeObjectURL(url), 100);
    } catch (err) {
      console.error("Error processing recording:", err);
    }
  };

  return { startRecording, stopRecording, downloadRecording };
}

export default useAudioDownload; 