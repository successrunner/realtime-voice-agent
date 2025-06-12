import { Dropbox } from "dropbox";

// Initialize Dropbox client
const dropbox = new Dropbox({
  accessToken: process.env.NEXT_PUBLIC_DROPBOX_ACCESS_TOKEN,
});

/**
 * Formats the filename for the recording
 * @param studentName - The name of the student
 * @param recordingType - The type of recording (audio/video)
 * @param purpose - The purpose of the recording
 * @returns Formatted filename
 */
export const formatRecordingFilename = (
  studentName: string,
  recordingType: "audio" | "video",
  purpose: string
): string => {
  const date = new Date();
  const formattedDate = date.toISOString().split("T")[0]; // YYYY-MM-DD
  const formattedTime = date
    .toISOString()
    .split("T")[1]
    .split(".")[0]
    .replace(/:/g, "-"); // HH-MM-SS
  const sanitizedName = studentName.replace(/[^a-zA-Z0-9]/g, "_");
  const sanitizedPurpose = purpose.replace(/[^a-zA-Z0-9]/g, "_");

  return `${sanitizedName}/${formattedDate}/${sanitizedName}_${sanitizedPurpose}_${formattedTime}.${
    recordingType === "audio" ? "mp3" : "mp4"
  }`;
};

/**
 * Uploads a recording file to Dropbox
 * @param file - The file blob to upload
 * @param studentName - The name of the student
 * @param recordingType - The type of recording (audio/video)
 * @param purpose - The purpose of the recording
 * @returns The Dropbox file path and shared URL
 */
export const uploadRecordingToDropbox = async (
  file: Blob,
  studentName: string,
  recordingType: "audio" | "video",
  purpose: string
): Promise<{ path: string; sharedUrl: string }> => {
  try {
    const filename = formatRecordingFilename(
      studentName,
      recordingType,
      purpose
    );
    const path = `/students-recordings/${filename}`;

    // Upload the file
    const response = await dropbox.filesUpload({
      path,
      contents: file,
      mode: { ".tag": "overwrite" },
    });

    // Create a shared link
    const shareResponse = await dropbox.sharingCreateSharedLinkWithSettings({
      path: response.result.path_display || "",
      settings: {
        requested_visibility: { ".tag": "public" },
      },
    });

    return {
      path: response.result.path_display || "",
      sharedUrl: shareResponse.result.url
    };
  } catch (error) {
    console.error("Error uploading to Dropbox:", error);
    throw error;
  }
};
