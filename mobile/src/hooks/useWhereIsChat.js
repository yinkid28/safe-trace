import { useState, useCallback, useRef } from "react";
import { formatLastSeen } from "../utils/formatTime";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "openai/gpt-oss-20b";

/**
 * Build a system prompt that gives the LLM full context about family members
 * and safe zones so it can answer natural language "where is" questions.
 */
function buildSystemPrompt(members, safeZones) {
  let prompt =
    "You are SafeTrace, a family safety assistant. Answer questions about family members' " +
    "whereabouts concisely and conversationally based ONLY on the data provided below. " +
    "If the data doesn't contain enough information to answer, say so honestly. " +
    "Never invent locations or statuses.\n\n";

  if (members.length === 0) {
    prompt += "FAMILY MEMBERS: None registered yet.\n";
  } else {
    prompt += "FAMILY MEMBERS:\n";
    for (const m of members) {
      const status = m.phoneStatus === "online" ? "Online" : "Offline";
      const lastSeen = formatLastSeen(m.lastSeen);
      let location = "No location data";
      let speed = "Unknown";

      if (m.lastLocation) {
        location = `${m.lastLocation.lat.toFixed(4)}, ${m.lastLocation.lng.toFixed(4)}`;
        speed =
          m.lastLocation.speed != null
            ? `${Math.round(m.lastLocation.speed * 3.6)} km/h`
            : "Unknown";
      }

      prompt += `- ${m.name}: Status=${status}, Location=${location}, Speed=${speed}, Last seen=${lastSeen}\n`;
    }
  }

  if (safeZones.length > 0) {
    prompt += "\nSAFE ZONES:\n";
    for (const z of safeZones) {
      prompt += `- ${z.label}: ${z.lat.toFixed(4)}, ${z.lng.toFixed(4)}\n`;
    }
  }

  return prompt;
}

/**
 * Hook for multi-turn "Where is...?" chat via Groq LLM.
 *
 * @param {Array} members  - Family member objects from useFamilyMembers
 * @param {Array} safeZones - User's safe zone objects
 * @returns {{ messages: Array, loading: boolean, error: string|null, askQuestion: (q: string) => Promise<void>, clearChat: () => void }}
 */
export function useWhereIsChat(members, safeZones) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // Keep a ref of messages so the callback always has the latest list
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const askQuestion = useCallback(
    async (question) => {
      const apiKey = import.meta.env.VITE_GROQ_API_KEY;
      if (!apiKey) {
        setError("Groq API key not configured. Add VITE_GROQ_API_KEY to your .env file.");
        return;
      }

      const userMessage = { role: "user", content: question };
      const updatedMessages = [...messagesRef.current, userMessage];
      setMessages(updatedMessages);
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(GROQ_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: GROQ_MODEL,
            messages: [
              { role: "system", content: buildSystemPrompt(members, safeZones) },
              ...updatedMessages,
            ],
            temperature: 0.3,
            max_tokens: 512,
          }),
        });

        if (!res.ok) {
          const body = await res.text();
          throw new Error(`Groq API error (${res.status}): ${body}`);
        }

        const data = await res.json();
        const answer = data.choices?.[0]?.message?.content?.trim();
        if (!answer) {
          throw new Error("No response received from the AI.");
        }

        const assistantMessage = { role: "assistant", content: answer };
        setMessages((prev) => [...prev, assistantMessage]);
      } catch (err) {
        setError(err.message || "Failed to get a response. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [members, safeZones]
  );

  const clearChat = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return { messages, loading, error, askQuestion, clearChat };
}
