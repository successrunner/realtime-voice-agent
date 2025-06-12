"use client";

import React, { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { v4 as uuidv4 } from "uuid";

// UI components
import Transcript from "./components/Transcript";
import BottomToolbar from "./components/BottomToolbar";
import StudentRecording from "./components/StudentRecording";

// Types
import { SessionStatus, TranscriptItem } from "@/app/types";
import type { RealtimeAgent } from "@openai/agents/realtime";

// Context providers & hooks
import { useTranscript } from "@/app/contexts/TranscriptContext";
import { useEvent } from "@/app/contexts/EventContext";

// Utilities
import { RealtimeClient } from "@/app/agentConfigs/realtimeClient";

// Agent configs
import { allAgentSets, defaultAgentSetKey } from "@/app/agentConfigs";

import { studyCoachScenario } from "./agentConfigs/studyCoach";

const sdkScenarioMap: Record<string, RealtimeAgent[]> = {
  studyCoach: studyCoachScenario,
};

export default function App() {
  const searchParams = useSearchParams()!;

  // Use urlCodec directly from URL search params (default: "opus")
  const urlCodec = searchParams.get("codec") || "opus";

  const {
    transcriptItems,
    addTranscriptMessage,
    addTranscriptBreadcrumb,
    updateTranscriptMessage,
    updateTranscriptItem,
  } = useTranscript();

  // Keep a mutable reference to the latest transcriptItems so that streaming
  // callbacks registered once during setup always have access to up-to-date
  // data without being re-registered on every render.
  const transcriptItemsRef = useRef<TranscriptItem[]>(transcriptItems);
  useEffect(() => {
    transcriptItemsRef.current = transcriptItems;
  }, [transcriptItems]);
  const { logClientEvent, logServerEvent, logHistoryItem } = useEvent();

  const [selectedAgentName, setSelectedAgentName] = useState<string>("");
  const [selectedAgentConfigSet, setSelectedAgentConfigSet] = useState<
    RealtimeAgent[] | null
  >(null);

  const audioElementRef = useRef<HTMLAudioElement | null>(null);

  const sdkAudioElement = React.useMemo(() => {
    if (typeof window === "undefined") return undefined;
    const el = document.createElement("audio");
    el.autoplay = true;
    el.style.display = "none";
    document.body.appendChild(el);
    return el;
  }, []);

  // Attach SDK audio element once it exists (after first render in browser)
  useEffect(() => {
    if (sdkAudioElement && !audioElementRef.current) {
      audioElementRef.current = sdkAudioElement;
    }
  }, [sdkAudioElement]);

  const sdkClientRef = useRef<RealtimeClient | null>(null);
  const loggedFunctionCallsRef = useRef<Set<string>>(new Set());
  const [sessionStatus, setSessionStatus] =
    useState<SessionStatus>("DISCONNECTED");

  const [isEventsPaneExpanded, setIsEventsPaneExpanded] =
    useState<boolean>(true);
  const [userText, setUserText] = useState<string>("");
  const [isPTTActive, setIsPTTActive] = useState<boolean>(false);
  const [isPTTUserSpeaking, setIsPTTUserSpeaking] = useState<boolean>(false);
  const [isAudioPlaybackEnabled, setIsAudioPlaybackEnabled] = useState<boolean>(
    () => {
      if (typeof window === "undefined") return true;
      const stored = localStorage.getItem("audioPlaybackEnabled");
      return stored ? stored === "true" : true;
    }
  );

  const [showRecordingPanel, setShowRecordingPanel] = useState(false);
  const [currentStudentName, setCurrentStudentName] = useState("");

  const [recordingConfig, setRecordingConfig] = useState({
    autoStart: false,
    autoStop: false,
    recordingType: "audio" as "audio" | "video",
    purpose: "Daily Reflection",
    description: "Student feedback recording",
    isRecording: false,
    isProcessing: false,
  });

  const sendClientEvent = (eventObj: any, eventNameSuffix = "") => {
    if (!sdkClientRef.current) {
      console.error("SDK client not available", eventObj);
      return;
    }

    try {
      sdkClientRef.current.sendEvent(eventObj);
    } catch (err) {
      console.error("Failed to send via SDK", err);
    }
  };

  useEffect(() => {
    let finalAgentConfig = searchParams.get("agentConfig");
    if (!finalAgentConfig || !allAgentSets[finalAgentConfig]) {
      finalAgentConfig = defaultAgentSetKey;
      const url = new URL(window.location.toString());
      url.searchParams.set("agentConfig", finalAgentConfig);
      window.location.replace(url.toString());
      return;
    }

    const agents = allAgentSets[finalAgentConfig];
    const agentKeyToUse = agents[0]?.name || "";

    setSelectedAgentName(agentKeyToUse);
    setSelectedAgentConfigSet(agents);
  }, [searchParams]);

  useEffect(() => {
    if (selectedAgentName && sessionStatus === "DISCONNECTED") {
      connectToRealtime();
    }
  }, [selectedAgentName]);

  useEffect(() => {
    if (
      sessionStatus === "CONNECTED" &&
      selectedAgentConfigSet &&
      selectedAgentName
    ) {
      const currentAgent = selectedAgentConfigSet.find(
        (a) => a.name === selectedAgentName
      );
      addTranscriptBreadcrumb(`Agent: ${selectedAgentName}`, currentAgent);
      updateSession(true);
    }
  }, [selectedAgentConfigSet, selectedAgentName, sessionStatus]);

  useEffect(() => {
    if (sessionStatus === "CONNECTED") {
      console.log(
        `updatingSession, isPTTACtive=${isPTTActive} sessionStatus=${sessionStatus}`
      );
      updateSession();
    }
  }, [isPTTActive]);

  const fetchEphemeralKey = async (): Promise<string | null> => {
    logClientEvent({ url: "/session" }, "fetch_session_token_request");
    const tokenResponse = await fetch("/api/session");
    const data = await tokenResponse.json();
    logServerEvent(data, "fetch_session_token_response");

    if (!data.client_secret?.value) {
      logClientEvent(data, "error.no_ephemeral_key");
      console.error("No ephemeral key provided by the server");
      setSessionStatus("DISCONNECTED");
      return null;
    }

    return data.client_secret.value;
  };

  const connectToRealtime = async () => {
    const agentSetKey = searchParams.get("agentConfig") || "default";
    if (sdkScenarioMap[agentSetKey]) {
      // Use new SDK path
      if (sessionStatus !== "DISCONNECTED") return;
      setSessionStatus("CONNECTING");

      try {
        const EPHEMERAL_KEY = await fetchEphemeralKey();
        if (!EPHEMERAL_KEY) return;

        // Ensure the selectedAgentName is first so that it becomes the root
        const reorderedAgents = [...sdkScenarioMap[agentSetKey]];
        const idx = reorderedAgents.findIndex(
          (a) => a.name === selectedAgentName
        );
        if (idx > 0) {
          const [agent] = reorderedAgents.splice(idx, 1);
          reorderedAgents.unshift(agent);
        }

        const client = new RealtimeClient({
          getEphemeralKey: async () => EPHEMERAL_KEY,
          initialAgents: reorderedAgents,
          audioElement: sdkAudioElement,
          extraContext: {
            addTranscriptBreadcrumb,
          },
        } as any);

        sdkClientRef.current = client;

        client.on("connection_change", (status) => {
          if (status === "connected") setSessionStatus("CONNECTED");
          else if (status === "connecting") setSessionStatus("CONNECTING");
          else setSessionStatus("DISCONNECTED");
        });

        client.on("message", (ev) => {
          logServerEvent(ev);

          // --- Realtime streaming handling ---------------------------------
          // The Realtime transport emits granular *delta* events while the
          // assistant is speaking or while the user's audio is still being
          // transcribed. Those events were previously only logged which made
          // the UI update only once when the final conversation.item.* event
          // arrived – effectively disabling streaming. We now listen for the
          // delta events and update the transcript as they arrive so that
          // 1) assistant messages stream token-by-token, and
          // 2) the user sees a live "Transcribing…" placeholder while we are
          //    still converting their speech to text.

          // NOTE: The exact payloads are still evolving.  We intentionally
          // access properties defensively to avoid runtime crashes if fields
          // are renamed or missing.

          try {
            // Guardrail trip event – mark last assistant message as FAIL
            if (ev.type === "guardrail_tripped") {
              const lastAssistant = [...transcriptItemsRef.current]
                .reverse()
                .find((i) => i.role === "assistant");

              if (lastAssistant) {
                updateTranscriptItem(lastAssistant.itemId, {
                  guardrailResult: {
                    status: "DONE",
                    category: "OFF_BRAND",
                    rationale: "Guardrail triggered",
                    testText: "",
                  },
                } as any);
              }
              return;
            }

            // Response finished – if we still have Pending guardrail mark as
            // Pass. This event fires once per assistant turn.
            if (ev.type === "response.done") {
              const lastAssistant = [...transcriptItemsRef.current]
                .reverse()
                .find((i) => i.role === "assistant");

              if (lastAssistant) {
                const existing: any = (lastAssistant as any).guardrailResult;
                if (!existing || existing.status === "IN_PROGRESS") {
                  updateTranscriptItem(lastAssistant.itemId, {
                    guardrailResult: {
                      status: "DONE",
                      category: "NONE",
                      rationale: "",
                    },
                  } as any);
                }
              }
              // continue processing other logic if needed
            }
            // Assistant text (or audio-to-text) streaming
            if (
              ev.type === "response.text.delta" ||
              ev.type === "response.audio_transcript.delta"
            ) {
              const itemId: string | undefined =
                (ev as any).item_id ?? (ev as any).itemId;
              const delta: string | undefined =
                (ev as any).delta ?? (ev as any).text;
              if (!itemId || !delta) return;

              // Ensure a transcript message exists for this assistant item.
              if (
                !transcriptItemsRef.current.some((t) => t.itemId === itemId)
              ) {
                addTranscriptMessage(itemId, "assistant", "");
                updateTranscriptItem(itemId, {
                  guardrailResult: {
                    status: "IN_PROGRESS",
                  },
                } as any);
              }

              // Append the latest delta so the UI streams.
              updateTranscriptMessage(itemId, delta, true);
              updateTranscriptItem(itemId, { status: "IN_PROGRESS" });
              return;
            }

            // Live user transcription streaming
            if (ev.type === "conversation.input_audio_transcription.delta") {
              const itemId: string | undefined =
                (ev as any).item_id ?? (ev as any).itemId;
              const delta: string | undefined =
                (ev as any).delta ?? (ev as any).text;
              if (!itemId || typeof delta !== "string") return;

              // If this is the very first chunk, create a hidden user message
              // so that we can surface "Transcribing…" immediately.
              if (
                !transcriptItemsRef.current.some((t) => t.itemId === itemId)
              ) {
                addTranscriptMessage(itemId, "user", "Transcribing…");
              }

              updateTranscriptMessage(itemId, delta, true);
              updateTranscriptItem(itemId, { status: "IN_PROGRESS" });
            }

            // Detect start of a new user speech segment when VAD kicks in.
            if (ev.type === "input_audio_buffer.speech_started") {
              const itemId: string | undefined = (ev as any).item_id;
              if (!itemId) return;

              const exists = transcriptItemsRef.current.some(
                (t) => t.itemId === itemId
              );
              if (!exists) {
                addTranscriptMessage(itemId, "user", "Transcribing…");
                updateTranscriptItem(itemId, { status: "IN_PROGRESS" });
              }
            }

            // Final transcript once Whisper finishes
            if (
              ev.type ===
              "conversation.item.input_audio_transcription.completed"
            ) {
              const itemId: string | undefined = (ev as any).item_id;
              const transcriptText: string | undefined = (ev as any).transcript;
              if (!itemId || typeof transcriptText !== "string") return;

              const exists = transcriptItemsRef.current.some(
                (t) => t.itemId === itemId
              );
              if (!exists) {
                addTranscriptMessage(itemId, "user", transcriptText.trim());
              } else {
                // Replace placeholder / delta text with final transcript
                updateTranscriptMessage(itemId, transcriptText.trim(), false);
              }
              updateTranscriptItem(itemId, { status: "DONE" });
            }

            // Assistant streaming tokens or transcript
            if (
              ev.type === "response.text.delta" ||
              ev.type === "response.audio_transcript.delta"
            ) {
              const responseId: string | undefined =
                (ev as any).response_id ?? (ev as any).responseId;
              const delta: string | undefined =
                (ev as any).delta ?? (ev as any).text;
              if (!responseId || typeof delta !== "string") return;

              // We'll use responseId as part of itemId to make it deterministic.
              const itemId = `assistant-${responseId}`;

              if (
                !transcriptItemsRef.current.some((t) => t.itemId === itemId)
              ) {
                addTranscriptMessage(itemId, "assistant", "");
              }

              updateTranscriptMessage(itemId, delta, true);
              updateTranscriptItem(itemId, { status: "IN_PROGRESS" });
            }
          } catch (err) {
            // Streaming is best-effort – never break the session because of it.
            console.warn("streaming-ui error", err);
          }
        });

        client.on("history_added", (item) => {
          logHistoryItem(item);

          // Update the transcript view
          if (item.type === "message") {
            const textContent = (item.content || [])
              .map((c: any) => {
                if (c.type === "text") return c.text;
                if (c.type === "input_text") return c.text;
                if (c.type === "input_audio") return c.transcript ?? "";
                if (c.type === "audio") return c.transcript ?? "";
                return "";
              })
              .join(" ")
              .trim();

            if (!textContent) return;

            const role = item.role as "user" | "assistant";

            // No PTT placeholder logic needed

            const exists = transcriptItemsRef.current.some(
              (t) => t.itemId === item.itemId
            );

            if (!exists) {
              addTranscriptMessage(item.itemId, role, textContent, false);
              if (role === "assistant") {
                updateTranscriptItem(item.itemId, {
                  guardrailResult: {
                    status: "IN_PROGRESS",
                  },
                } as any);
              }
            } else {
              updateTranscriptMessage(item.itemId, textContent, false);
            }

            // After assistant message completes, add default guardrail PASS if none present.
            if (role === "assistant" && (item as any).status === "completed") {
              const current = transcriptItemsRef.current.find(
                (t) => t.itemId === item.itemId
              );
              const existing = (current as any)?.guardrailResult;
              if (existing && existing.status !== "IN_PROGRESS") {
                // already final (e.g., FAIL) – leave as is.
              } else {
                updateTranscriptItem(item.itemId, {
                  guardrailResult: {
                    status: "DONE",
                    category: "NONE",
                    rationale: "",
                  },
                } as any);
              }
            }

            if ("status" in item) {
              updateTranscriptItem(item.itemId, {
                status:
                  (item as any).status === "completed" ? "DONE" : "IN_PROGRESS",
              });
            }
          }

          // Surface function / hand-off calls as breadcrumbs
          if (item.type === "function_call") {
            const title = `Tool call: ${(item as any).name}`;

            if (!loggedFunctionCallsRef.current.has(item.itemId)) {
              addTranscriptBreadcrumb(title, {
                arguments: (item as any).arguments,
              });
              loggedFunctionCallsRef.current.add(item.itemId);

              // If this looks like a handoff (transfer_to_*), switch active
              // agent so subsequent session updates & breadcrumbs reflect the
              // new agent. The Realtime SDK already updated the session on
              // the backend; this only affects the UI state.
              const toolName: string = (item as any).name ?? "";
              const handoffMatch = toolName.match(/^transfer_to_(.+)$/);
              if (handoffMatch) {
                const newAgentKey = handoffMatch[1];

                // Find agent whose name matches (case-insensitive)
                const candidate = selectedAgentConfigSet?.find(
                  (a) => a.name.toLowerCase() === newAgentKey.toLowerCase()
                );
                if (candidate && candidate.name !== selectedAgentName) {
                  setSelectedAgentName(candidate.name);
                }
              }
            }
            return;
          }
        });

        // Handle continuous updates for existing items so streaming assistant
        // speech shows up while in_progress.
        client.on("history_updated", (history) => {
          history.forEach((item: any) => {
            if (item.type === "function_call") {
              // Update breadcrumb data (e.g., add output) once we have more info.

              if (!loggedFunctionCallsRef.current.has(item.itemId)) {
                addTranscriptBreadcrumb(`Tool call: ${(item as any).name}`, {
                  arguments: (item as any).arguments,
                  output: (item as any).output,
                });
                loggedFunctionCallsRef.current.add(item.itemId);

                const toolName: string = (item as any).name ?? "";
                const handoffMatch = toolName.match(/^transfer_to_(.+)$/);
                if (handoffMatch) {
                  const newAgentKey = handoffMatch[1];
                  const candidate = selectedAgentConfigSet?.find(
                    (a) => a.name.toLowerCase() === newAgentKey.toLowerCase()
                  );
                  if (candidate && candidate.name !== selectedAgentName) {
                    setSelectedAgentName(candidate.name);
                  }
                }
              }

              return;
            }

            if (item.type !== "message") return;

            const textContent = (item.content || [])
              .map((c: any) => {
                if (c.type === "text") return c.text;
                if (c.type === "input_text") return c.text;
                if (c.type === "input_audio") return c.transcript ?? "";
                if (c.type === "audio") return c.transcript ?? "";
                return "";
              })
              .join(" ")
              .trim();

            const role = item.role as "user" | "assistant";

            if (!textContent) return;

            const exists = transcriptItemsRef.current.some(
              (t) => t.itemId === item.itemId
            );
            if (!exists) {
              addTranscriptMessage(item.itemId, role, textContent, false);
              if (role === "assistant") {
                updateTranscriptItem(item.itemId, {
                  guardrailResult: {
                    status: "IN_PROGRESS",
                  },
                } as any);
              }
            } else {
              updateTranscriptMessage(item.itemId, textContent, false);
            }

            if ("status" in item) {
              updateTranscriptItem(item.itemId, {
                status:
                  (item as any).status === "completed" ? "DONE" : "IN_PROGRESS",
              });
            }
          });
        });

        await client.connect();
      } catch (err) {
        console.error("Error connecting via SDK:", err);
        setSessionStatus("DISCONNECTED");
      }
      return;
    }
  };

  const disconnectFromRealtime = () => {
    if (sdkClientRef.current) {
      sdkClientRef.current.disconnect();
      sdkClientRef.current = null;
    }
    setSessionStatus("DISCONNECTED");
    setIsPTTUserSpeaking(false);

    logClientEvent({}, "disconnected");
  };

  const sendSimulatedUserMessage = (text: string) => {
    const id = uuidv4().slice(0, 32);
    addTranscriptMessage(id, "user", text, true);

    sendClientEvent(
      {
        type: "conversation.item.create",
        item: {
          id,
          type: "message",
          role: "user",
          content: [{ type: "input_text", text }],
        },
      },
      "(simulated user text message)"
    );
    sendClientEvent(
      { type: "response.create" },
      "(trigger response after simulated user text message)"
    );
  };

  const updateSession = (shouldTriggerResponse: boolean = false) => {
    // In SDK scenarios RealtimeClient manages session config automatically.
    if (sdkClientRef.current) {
      if (shouldTriggerResponse) {
        sendSimulatedUserMessage("hi");
      }

      // Reflect Push-to-Talk UI state by (de)activating server VAD on the
      // backend. The Realtime SDK supports live session updates via the
      // `session.update` event.
      const client = sdkClientRef.current;
      if (client) {
        const turnDetection = isPTTActive
          ? null
          : {
              type: "server_vad",
              threshold: 0.9,
              prefix_padding_ms: 300,
              silence_duration_ms: 500,
              create_response: true,
            };
        try {
          client.sendEvent({
            type: "session.update",
            session: {
              turn_detection: turnDetection,
            },
          });
        } catch (err) {
          console.warn("Failed to update session", err);
        }
      }
      return;
    }
  };

  const cancelAssistantSpeech = async () => {
    // Interrupts server response and clears local audio.
    if (sdkClientRef.current) {
      try {
        sdkClientRef.current.interrupt();
      } catch (err) {
        console.error("Failed to interrupt", err);
      }
    }
  };

  const handleSendTextMessage = () => {
    if (!userText.trim()) return;
    cancelAssistantSpeech();

    if (!sdkClientRef.current) {
      console.error("SDK client not available");
      return;
    }

    try {
      sdkClientRef.current.sendUserText(userText.trim());
    } catch (err) {
      console.error("Failed to send via SDK", err);
    }

    setUserText("");
  };

  const handleTalkButtonDown = () => {
    if (sessionStatus !== "CONNECTED" || sdkClientRef.current == null) return;
    cancelAssistantSpeech();

    setIsPTTUserSpeaking(true);
    sendClientEvent({ type: "input_audio_buffer.clear" }, "clear PTT buffer");

    // No placeholder; we'll rely on server transcript once ready.
  };

  const handleTalkButtonUp = () => {
    if (
      sessionStatus !== "CONNECTED" ||
      sdkClientRef.current == null ||
      !isPTTUserSpeaking
    )
      return;

    setIsPTTUserSpeaking(false);
    sendClientEvent({ type: "input_audio_buffer.commit" }, "commit PTT");
    sendClientEvent({ type: "response.create" }, "trigger response PTT");
  };

  const onToggleConnection = () => {
    if (sessionStatus === "CONNECTED" || sessionStatus === "CONNECTING") {
      disconnectFromRealtime();
      setSessionStatus("DISCONNECTED");
    } else {
      connectToRealtime();
    }
  };

  // Instead of using setCodec, we update the URL and refresh the page when codec changes
  const handleCodecChange = (newCodec: string) => {
    const url = new URL(window.location.toString());
    url.searchParams.set("codec", newCodec);
    window.location.replace(url.toString());
  };

  useEffect(() => {
    const storedPushToTalkUI = localStorage.getItem("pushToTalkUI");
    if (storedPushToTalkUI) {
      setIsPTTActive(storedPushToTalkUI === "true");
    }
    const storedLogsExpanded = localStorage.getItem("logsExpanded");
    if (storedLogsExpanded) {
      setIsEventsPaneExpanded(storedLogsExpanded === "true");
    }
    const storedAudioPlaybackEnabled = localStorage.getItem(
      "audioPlaybackEnabled"
    );
    if (storedAudioPlaybackEnabled) {
      setIsAudioPlaybackEnabled(storedAudioPlaybackEnabled === "true");
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("pushToTalkUI", isPTTActive.toString());
  }, [isPTTActive]);

  useEffect(() => {
    localStorage.setItem("logsExpanded", isEventsPaneExpanded.toString());
  }, [isEventsPaneExpanded]);

  useEffect(() => {
    localStorage.setItem(
      "audioPlaybackEnabled",
      isAudioPlaybackEnabled.toString()
    );
  }, [isAudioPlaybackEnabled]);

  useEffect(() => {
    if (audioElementRef.current) {
      if (isAudioPlaybackEnabled) {
        audioElementRef.current.muted = false;
        audioElementRef.current.play().catch((err) => {
          console.warn("Autoplay may be blocked by browser:", err);
        });
      } else {
        // Mute and pause to avoid brief audio blips before pause takes effect.
        audioElementRef.current.muted = true;
        audioElementRef.current.pause();
      }
    }

    // Toggle server-side audio stream mute so bandwidth is saved when the
    // user disables playback. Only supported when using the SDK path.
    if (sdkClientRef.current) {
      try {
        sdkClientRef.current.mute(!isAudioPlaybackEnabled);
      } catch (err) {
        console.warn("Failed to toggle SDK mute", err);
      }
    }
  }, [isAudioPlaybackEnabled]);

  // Ensure mute state is propagated to transport right after we connect or
  // whenever the SDK client reference becomes available.
  useEffect(() => {
    if (sessionStatus === "CONNECTED" && sdkClientRef.current) {
      try {
        sdkClientRef.current.mute(!isAudioPlaybackEnabled);
      } catch (err) {
        console.warn("mute sync after connect failed", err);
      }
    }
  }, [sessionStatus, isAudioPlaybackEnabled]);

  const handleRecordingComplete = async (metadata: any) => {
    // Save the recording metadata
    addTranscriptBreadcrumb("Recording metadata saved", metadata);

    // Update recording status
    setRecordingConfig((prev) => ({
      ...prev,
      isRecording: false,
      isProcessing: false,
    }));

    // Automatically download the recording
    try {
      addTranscriptBreadcrumb("Recording downloaded automatically", metadata);
    } catch (error) {
      console.error("Failed to download recording:", error);
      addTranscriptBreadcrumb("Failed to download recording", { error });
    }
  };

  // Handle tool calls
  const handleToolCall = async (item: any) => {
    if (item.type === "function_call") {
      const toolName = (item as any).name;
      console.log("Tool call received:", item);

      let args;
      try {
        // Parse the arguments string into an object
        args =
          typeof item.arguments === "string"
            ? JSON.parse(item.arguments)
            : item.arguments;
        console.log("Parsed arguments:", args);
      } catch (err) {
        console.error("Failed to parse tool arguments:", err);
        console.log("Raw arguments:", item.arguments);
        args = {};
      }

      // Handle recording-related tool calls
      if (toolName === "startRecording") {
        const recordingType = args.recordingType || "audio";
        const purpose = args.purpose || "Daily Reflection";
        const description = args.description || "Student feedback recording";

        // First, interrupt any ongoing speech
        await cancelAssistantSpeech();

        // Wait a longer moment for the speech to fully stop
        await new Promise((resolve) => setTimeout(resolve, 3000));

        // Show the recording panel and update config
        setShowRecordingPanel(true);
        setCurrentStudentName(currentStudentName || "Student");
        setRecordingConfig({
          autoStart: true,
          autoStop: false,
          recordingType,
          purpose,
          description,
          isRecording: true,
          isProcessing: false,
        });

        // Mute the agent after the message to prevent further speech
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } else if (toolName === "saveStudentName") {
        // Save the student's name when provided
        const studentName = args.name;
        if (studentName) {
          setCurrentStudentName(studentName);
          // Just log the event, don't send additional events that might interrupt the flow
          logClientEvent({ 
            type: "student.name.saved", 
            studentName 
          });
        }
      } else if (toolName === "stopRecording") {
        // Stop the recording
        setShowRecordingPanel(false);
        setRecordingConfig((prev) => ({
          ...prev,
          autoStart: false,
          autoStop: true,
          isRecording: false,
          isProcessing: true,
        }));
        // Log the stop event silently
        logClientEvent({ type: "recording.stopped" });
      }

      // Log tool calls silently
      if (!loggedFunctionCallsRef.current.has(item.itemId)) {
        logClientEvent({ type: "tool.call", name: toolName, arguments: args });
        loggedFunctionCallsRef.current.add(item.itemId);
      }
    }
  };

  // Add this new effect to handle tool calls
  useEffect(() => {
    if (!sdkClientRef.current) return;

    // Listen for new tool calls
    sdkClientRef.current.on("history_added", handleToolCall);

    return () => {
      if (sdkClientRef.current) {
        sdkClientRef.current.off("history_added", handleToolCall);
      }
    };
  }, [sdkClientRef.current]);

  return (
    <div className="text-base flex flex-col h-screen bg-gray-100 text-gray-800 relative">
      <div className="flex-none">
        <div className="bg-white border-b">
          <div className="px-4 py-2 flex items-center justify-between">
            <div className="flex items-center space-x-4">
              {/* ... existing header content ... */}
            </div>
            {recordingConfig.isRecording && (
              <div className="flex items-center space-x-2 text-red-600">
                <div className="animate-pulse">●</div>
                <span>Recording in progress...</span>
              </div>
            )}
            {recordingConfig.isProcessing && (
              <div className="flex items-center space-x-2 text-blue-600">
                <div className="animate-spin">⟳</div>
                <span>Processing recording...</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-1 gap-2 overflow-hidden relative">
        <Transcript
          userText={userText}
          setUserText={setUserText}
          onSendMessage={handleSendTextMessage}
          canSend={
            sessionStatus === "CONNECTED" && sdkClientRef.current != null
          }
        />

        {showRecordingPanel && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-4 rounded-lg w-full max-w-md">
              <StudentRecording
                studentName={currentStudentName}
                onRecordingComplete={handleRecordingComplete}
                autoDownload={true}
                autoStart={recordingConfig.autoStart}
                autoStop={recordingConfig.autoStop}
                initialRecordingType={recordingConfig.recordingType}
                initialPurpose={recordingConfig.purpose}
                initialDescription={recordingConfig.description}
              />
            </div>
          </div>
        )}
      </div>

      <BottomToolbar
        sessionStatus={sessionStatus}
        onToggleConnection={onToggleConnection}
        isPTTActive={isPTTActive}
        setIsPTTActive={setIsPTTActive}
        isPTTUserSpeaking={isPTTUserSpeaking}
        handleTalkButtonDown={handleTalkButtonDown}
        handleTalkButtonUp={handleTalkButtonUp}
        isEventsPaneExpanded={isEventsPaneExpanded}
        setIsEventsPaneExpanded={setIsEventsPaneExpanded}
        isAudioPlaybackEnabled={isAudioPlaybackEnabled}
        setIsAudioPlaybackEnabled={setIsAudioPlaybackEnabled}
        codec={urlCodec}
        onCodecChange={handleCodecChange}
        onToggleRecordingPanel={() =>
          setShowRecordingPanel(!showRecordingPanel)
        }
      />
    </div>
  );
}
