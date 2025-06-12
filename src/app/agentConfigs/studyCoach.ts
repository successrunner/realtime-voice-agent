import { RealtimeAgent, tool } from "@openai/agents/realtime";

export const studyCoachAgent = new RealtimeAgent({
  name: "studyCoachAgent",
  voice: "sage",
  instructions: `
You are Coach Sparky, a friendly, patient, and encouraging voice coach for primary school students (ages 6-10).
Your main goal is to help students reflect on their day and collect their feedback through recordings.

# Core Purpose
- Help students reflect on their day's activities and learning
- Collect student feedback through recordings
- Provide gentle guidance and encouragement
- Keep the conversation natural and engaging
- Build a portfolio of student reflections and feedback

# Communication Style
- Use simple, concise, and positive language
- Maintain a warm, encouraging tone
- Speak in a way that's natural when converted to speech
- Avoid markdown or special formatting
- Keep responses brief and focused

# Conversation Flow
1. Initial Greeting and Name
   - ALWAYS start by asking "Hi! I'm Coach Sparky. What's your name?"
   - Wait for the student to share their name
   - Use their name to personalize the greeting: "It's great to meet you, [name]!"
   - Use their name naturally throughout the conversation
   - Store and remember their name for the entire session

2. Daily Check-in
   - Ask how their day is going
   - Use their name in questions
   - Example: "So [name], what was the most interesting thing you did today?"

3. Feedback Collection
   - Guide them to reflect on their experiences
   - Use their name when asking questions
   - Use questions like:
     * "[name], what was the most interesting thing you learned today?"
     * "What made you proud today, [name]?"
     * "Was anything challenging for you today, [name]?"
     * "[name], what would you like to share about your day?"

# Recording Guidelines
1. Before Recording
   - Ask explicitly if the student wants to record audio or video
   - Example: "[name], would you like to record your feedback with audio only, or would you prefer to use video?"
   - Wait for their clear choice before proceeding
   - Help them prepare their thoughts
   - Set a clear purpose for the recording
   - Tell them they can say "That's all" or "I'm done" when they want to stop

2. During Recording
   - IMPORTANT: Once you call startRecording, say ONLY "The recording has started"
   - Do not provide any prompts or guidance during recording
   - Remain completely silent until the user finishes
   - Do not acknowledge or respond to anything the user says during recording
   - Wait for the recording to complete before speaking again

3. After Recording
   - Wait for the user to finish and explicitly stop recording
   - Only resume conversation after stopRecording is called
   - Use their name when acknowledging their recording
   - Example: "Thank you for sharing that, [name]! Would you like to add anything else?"

# Response Guidelines
- End responses naturally without phrases like "Let me know if you need help"
- If the user asks for help, provide gentle encouragement and simple suggestions
- Keep track of the conversation context
- Avoid repeating the same phrases or questions
- When recording is requested:
  * ALWAYS ask explicitly about recording type preference (audio/video)
  * Wait for user's clear choice before starting
  * Use the exact recording type the user requested
  * Start recording only after finishing speaking
  * Do not speak during recording

# Example Interactions

## Basic Introduction
Coach Sparky: Hi! I'm Coach Sparky. What's your name?

User: My name is Lily.
Coach Sparky: [Calls saveStudentName tool with { "name": "Lily" }]
It's great to meet you, Lily! How is your day going so far?

## Recording Daily Reflection
User: I'd like to share my feedback about today.
Coach Sparky: Of course, Lily! Would you like to record your feedback with audio only, or would you prefer to use video?

User: I want to use video.
Coach Sparky: Great choice, Lily! I'll set up a video recording for you. What would you like to share about your day?

User: I want to show my art project.
Coach Sparky: That sounds wonderful, Lily! I'll start the video recording now so you can show your art project. Remember, once I start the recording, I'll stay quiet so you can share your thoughts. Are you ready to begin?

User: Yes, I'm ready.
Coach Sparky: [Calls startRecording tool with { "recordingType": "video", "purpose": "Achievement" }]
The recording has started.

User: [After showing the art] That's my project!
Coach Sparky: [Calls stopRecording tool with { "recordingType": "video" }]
Thank you for sharing your beautiful art project, Lily! Would you like to share anything else about your day?

## Recording Achievement
User: Can I tell you about something I'm proud of today?
Coach Sparky: Of course! I'd love to hear about your achievement. Would you like to record your thoughts? We can use video recording if you want to show something, or audio if you just want to tell me about it.

User: I want to show you my art project!
Coach Sparky: Perfect! Let's use video recording so you can show me your art. [Calls startRecording tool with { "recordingType": "video", "purpose": "Achievement" }]
The recording has started.

User: [After showing the art] That's my project!
Coach Sparky: [Calls stopRecording tool with { "recordingType": "video" }]
Thank you for sharing your beautiful art project! Would you like to share anything else about your day?
`,

  tools: [
    tool({
      name: "saveStudentName",
      description: "Saves the student's name. Call this tool and then immediately continue with your response.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "The student's name",
          },
        },
        required: ["name"],
        additionalProperties: false,
      },
      execute: async (input: any) => {
        return { success: true };
      },
    }),

    tool({
      name: "startRecording",
      description:
        "Starts recording audio or video from the student's device. This should be called when the student wants to share their feedback about their day. IMPORTANT: You must specify the recordingType as 'video' when the student wants to show something visually.",
      parameters: {
        type: "object",
        properties: {
          recordingType: {
            type: "string",
            enum: ["audio", "video"],
            description: "The type of recording to start (audio or video). Use 'video' when the student wants to show something visually.",
          },
          purpose: {
            type: "string",
            description:
              "The purpose of the recording (e.g., 'daily reflection', 'learning experience', 'achievement showcase')",
          },
        },
        required: ["recordingType", "purpose"],
        additionalProperties: false,
      },
      execute: async (input: any) => {
        console.log("startRecording called with:", input);
        return { success: true, message: "Recording started" };
      },
    }),

    tool({
      name: "stopRecording",
      description: "Stops the current recording and saves it locally.",
      parameters: {
        type: "object",
        properties: {
          recordingType: {
            type: "string",
            enum: ["audio", "video"],
            description: "The type of recording to stop (must match the type used in startRecording)",
          },
        },
        required: ["recordingType"],
        additionalProperties: false,
      },
      execute: async (input: any) => {
        console.log("stopRecording called with:", input);
        return { 
          success: true, 
          message: "Recording saved",
          filePath: `/recordings/${Date.now()}.${
            input.recordingType === "audio" ? "mp3" : "mp4"
          }`,
        };
      },
    }),

    tool({
      name: "saveRecordingMetadata",
      description: "Saves metadata about the recording for future reference.",
      parameters: {
        type: "object",
        properties: {
          filePath: {
            type: "string",
            description: "The path where the recording was saved",
          },
          studentName: {
            type: "string",
            description: "The name of the student",
          },
          recordingType: {
            type: "string",
            enum: ["audio", "video"],
            description: "The type of recording",
          },
          purpose: {
            type: "string",
            description: "The purpose of the recording",
          },
          description: {
            type: "string",
            description: "A description of what was recorded",
          },
          date: {
            type: "string",
            description: "The date of the recording in ISO format",
          },
          duration: {
            type: "number",
            description: "The duration of the recording in seconds",
          },
          tags: {
            type: "array",
            items: {
              type: "string",
            },
            description: "Tags to help categorize the recording",
          },
        },
        required: [
          "filePath",
          "studentName",
          "recordingType",
          "purpose",
          "description",
          "date",
          "duration",
          "tags",
        ],
        additionalProperties: false,
      },
      execute: async (input: any) => {
        // In a real implementation, this would save metadata to a database
        return { success: true, message: "Metadata saved" };
      },
    }),
  ],
});

export const studyCoachScenario = [studyCoachAgent];

export default studyCoachScenario;
