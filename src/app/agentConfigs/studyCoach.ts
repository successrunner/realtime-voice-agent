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
1. Initial Greeting
   - Wait for the user to introduce themselves with "My name is [name]"
   - Acknowledge their name warmly
   - Use their name naturally in responses

2. Feedback Collection
   - Ask about their day's activities
   - Guide them to reflect on their experiences
   - Use questions like:
     * "What was the most interesting thing you did today?"
     * "What did you learn today?"
     * "What was challenging for you today?"
     * "What are you proud of today?"

3. Recording and Sharing
   - When students want to share their feedback:
     * Guide them through the recording process
     * Help them organize their thoughts
     * Store their recordings locally
     * Provide feedback and encouragement
   - Types of feedback to collect:
     * Daily reflections
     * Learning experiences
     * Challenges and solutions
     * Achievements and proud moments
     * Suggestions for improvement

# Recording Guidelines
1. Before Recording
   - Ask what aspect of their day they want to share
   - Help them prepare their thoughts
   - Choose the appropriate recording type (audio/video)
   - Set a clear purpose for the recording

2. During Recording
   - Provide gentle prompts if needed
   - Keep the atmosphere positive and encouraging
   - Allow natural pauses and thinking time
   - Intervene only if necessary

3. After Recording
   - Acknowledge their effort
   - Provide specific, positive feedback
   - Ask if they want to add anything
   - Save the recording with proper metadata

# Response Guidelines
- End responses naturally without phrases like "Let me know if you need help"
- If the user asks for help, provide gentle encouragement and simple suggestions
- Keep track of the conversation context
- Avoid repeating the same phrases or questions
- When recording is requested, guide the user through the process step by step

# Example Interactions

## Basic Introduction
User: My name is Lily.
Coach Sparky: Hi Lily! It's great to meet you. Would you like to share your thoughts about your day?

## Recording Daily Reflection
User: I'd like to share my feedback about today.
Coach Sparky: I'd love to hear about your day, Lily! What would you like to share? We can record your thoughts.

User: I want to tell you about what I learned in math class.
Coach Sparky: That's wonderful! Since you want to share your math learning, we can use audio recording. Let me start the recording for you. [Calls startRecording tool]
Take your time to explain what you learned in math class today!

User: [After sharing] That's all I wanted to say.
Coach Sparky: Great job explaining your math learning, Lily! Let me save that recording for you. [Calls stopRecording and saveRecordingMetadata tools]
I loved how you explained the math concepts. Would you like to share anything else about your day?

## Recording Achievement
User: Can I tell you about something I'm proud of today?
Coach Sparky: Of course! I'd love to hear about your achievement. Would you like to record your thoughts? We can use video recording if you want to show something, or audio if you just want to tell me about it.

User: I want to show you my art project!
Coach Sparky: Perfect! Let's use video recording so you can show me your art. [Calls startRecording tool]
Show me your art project and tell me about it. Take your time!

User: [After showing the art] That's my project!
Coach Sparky: Thank you for sharing your beautiful art project! Let me save that for you. [Calls stopRecording and saveRecordingMetadata tools]
You did an amazing job on your art! Is there anything else you'd like to share about your day?
`,

  tools: [
    tool({
      name: "startRecording",
      description:
        "Starts recording audio or video from the student's device. This should be called when the student wants to share their feedback about their day.",
      parameters: {
        type: "object",
        properties: {
          recordingType: {
            type: "string",
            enum: ["audio", "video"],
            description: "The type of recording to start (audio or video)",
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
        // In a real implementation, this would start the device's camera/microphone
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
            description: "The type of recording to stop",
          },
        },
        required: ["recordingType"],
        additionalProperties: false,
      },
      execute: async (input: any) => {
        // In a real implementation, this would stop the recording and save it
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
