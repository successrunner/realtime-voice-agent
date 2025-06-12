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
 * @returns The Dropbox file path
 */
export const uploadRecordingToDropbox = async (
  file: Blob,
  studentName: string,
  recordingType: "audio" | "video",
  purpose: string
): Promise<string> => {
  try {
    const filename = formatRecordingFilename(
      studentName,
      recordingType,
      purpose
    );
    const path = `/recordings/${filename}`;

    // Upload the file
    const response = await dropbox.filesUpload({
      path,
      contents: file,
      mode: { ".tag": "overwrite" },
    });

    // Create a shared link
    const shareResponse = await dropbox.sharingCreateSharedLink({
      path: response.result.path_display || "",
    });

    console.log("File uploaded successfully:", shareResponse.result.url);
    return response.result.path_display || "";
  } catch (error) {
    console.error("Error uploading to Dropbox:", error);
    throw error;
  }
};
