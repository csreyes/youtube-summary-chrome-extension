// background.js (Service Worker)

// Add debugging
console.log("[YouTube AI Summarizer] Background service worker started: test");

// Default configuration
const DEFAULT_CONFIG = {
  apiKey: process.env.OPENROUTER_API_KEY || "", // Use environment variable as default
  apiEndpoint: "https://openrouter.ai/api/v1/chat/completions",
  model: "anthropic/claude-3.7-sonnet", // Default for options page
  promptTemplate:
    "Please provide a concise summary of the following YouTube video transcript. Focus on the main points, key insights, and important details.\n\nVideo Title: {{title}}\nChannel: {{channel}}\nTranscript:\n{{transcript}}",
};

// Model constants
const SUMMARY_MODEL = "anthropic/claude-3.7-sonnet"; // Used for initial summaries
const CHAT_MODEL = "google/gemini-2.0-flash-001"; // Used for follow-up chat messages

// Track tabs with active content scripts
const activeContentScriptTabs = new Set();

// Track active streams to enable cancellation
const activeStreams = new Map();

// Store transcripts for reference in chat
const videoTranscripts = new Map();

// For testing - provides a sample summary if no API key is set
function getTestSummary(videoTitle, channelName, transcriptLength) {
  console.log(
    "[YouTube AI Summarizer] Using test summary as no API key is configured"
  );
  return `# Summary of "${videoTitle}" by ${channelName}

This video discusses important concepts around the given topic. The speaker covers several key points:

## Main Points:
- The transcript was successfully extracted (${transcriptLength} characters)
- This is a placeholder summary since no API key is configured
- To get real summaries, please configure your API key in the extension options

## How to Configure:
1. Click on the extension icon
2. Select "Options"
3. Enter your OpenAI API key
4. Save the settings

Once configured, you'll get real AI-generated summaries instead of this placeholder.`;
}

// Function to safely send messages to tabs - handles any errors gracefully
async function safeSendTabMessage(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (e) {
    console.log(
      `[YouTube AI Summarizer] Error sending message to tab ${tabId}:`,
      e.message
    );
    return null;
  }
}

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log(
    "[YouTube AI Summarizer] Background received message:",
    message.type,
    sender.tab ? `from tab ${sender.tab.id}` : "from extension"
  );

  if (message.type === "SUMMARIZE") {
    console.log("[YouTube AI Summarizer] Handling summarize request");
    // Store the transcript for later chat reference
    if (sender.tab && message.payload.text) {
      videoTranscripts.set(sender.tab.id, message.payload.text);
      console.log(
        `[YouTube AI Summarizer] Stored transcript for tab ${sender.tab.id}, length: ${message.payload.text.length}`
      );
    }

    // Don't use sendResponse here since we're handling things asynchronously
    handleSummarizeRequest(message.payload, sender.tab.id).catch((error) =>
      console.error(
        "[YouTube AI Summarizer] Error in summarize handler:",
        error
      )
    );

    // No need to return true - we're not using sendResponse
    return false;
  }

  if (message.type === "CHAT_MESSAGE") {
    console.log("[YouTube AI Summarizer] Handling chat message request");

    // Handle the chat message with streaming
    handleChatMessage(message.payload, sender.tab.id).catch((error) =>
      console.error(
        "[YouTube AI Summarizer] Error in chat message handler:",
        error
      )
    );

    return false;
  }

  if (message.type === "CANCEL_STREAM") {
    console.log("[YouTube AI Summarizer] Handling stream cancellation request");

    const tabStreamKey = `${sender.tab.id}-${message.payload?.responseId}`;
    if (activeStreams.has(tabStreamKey)) {
      try {
        activeStreams.get(tabStreamKey).abort();
        console.log(`[YouTube AI Summarizer] Stream ${tabStreamKey} cancelled`);
        activeStreams.delete(tabStreamKey);
      } catch (err) {
        console.error(
          `[YouTube AI Summarizer] Error cancelling stream: ${err.message}`
        );
      }
    }

    return false;
  }

  if (message.type === "CONTENT_SCRIPT_READY" && sender.tab) {
    console.log(
      "[YouTube AI Summarizer] Content script ready in tab",
      sender.tab.id
    );
    // Remember this tab has an active content script
    activeContentScriptTabs.add(sender.tab.id);

    // Forward the ready state to the popup if it's open
    try {
      chrome.runtime
        .sendMessage({
          type: "CONTENT_SCRIPT_READY",
          tabId: sender.tab.id,
        })
        .catch((error) => {
          // Popup might not be open, which is fine
          console.log(
            "[YouTube AI Summarizer] Could not forward ready state (expected if popup not open)"
          );
        });
    } catch (e) {
      // This is expected if no popup is listening
      console.log(
        "[YouTube AI Summarizer] Could not forward ready state (expected if popup not open)"
      );
    }

    return false;
  }

  // Default - don't keep channel open
  return false;
});

// Listen for tab updates to track active content scripts
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // If the tab is completely loaded and it's a YouTube video
  if (
    changeInfo.status === "complete" &&
    tab.url &&
    tab.url.includes("youtube.com/watch")
  ) {
    console.log("[YouTube AI Summarizer] YouTube tab updated:", tabId);
  }
});

// When a tab is closed, remove it from our tracking
chrome.tabs.onRemoved.addListener((tabId) => {
  if (activeContentScriptTabs.has(tabId)) {
    console.log("[YouTube AI Summarizer] Removing tab from tracking:", tabId);
    activeContentScriptTabs.delete(tabId);
  }
});

// Handle chat messages with streaming responses
async function handleChatMessage(payload, tabId) {
  console.log(`[Background] Processing chat message request for tab ${tabId}`);

  try {
    // Get the API key and endpoint from storage
    const { apiKey, apiEndpoint, temperature } = await getConfig();

    if (!apiKey) {
      console.error("[Background] API key not configured");
      await safeSendTabMessage(tabId, {
        action: "display_summary",
        type: "STREAM_CHUNK",
        responseId: payload.responseId,
        text: "Error: Please configure your API key in the extension options",
      });
      return;
    }

    // Get the full transcript if available
    const fullTranscript = videoTranscripts.get(tabId) || "";

    // Create transcriptContext from the conversation history
    let transcriptContext = "";
    if (payload.history && payload.history.length > 0) {
      // Find the first assistant message, which should be the summary
      const summaryMessage = payload.history.find(
        (msg) => msg.role === "assistant"
      );
      if (summaryMessage) {
        transcriptContext = summaryMessage.content;
      }
    }

    // Prepare the conversation history
    // Filter out the initial summary message to keep context more focused on the conversation
    const chatHistory = payload.history
      ? payload.history.filter(
          (msg, index) => !(msg.role === "assistant" && index === 0)
        )
      : [];

    // Add system message as the first message
    const messages = [
      {
        role: "system",
        content: `You are a helpful assistant that answers questions about YouTube videos. 
You have access to the transcript summary and full transcript of the video "${
          payload.metadata?.title
        }" by ${payload.metadata?.channel}.

Here is the transcript summary to help you understand what the video is about:
${transcriptContext}

${
  fullTranscript.length > 0
    ? `\nHere is the full transcript of the video for detailed reference:\n${fullTranscript.substring(
        0,
        14000
      )}`
    : ""
}

Be helpful, accurate, and conversational. If asked about timestamps or specific parts of the video, try to include any relevant timestamps from the transcript in your response. The timestamps in the transcript are in the format MM:SS or HH:MM:SS and can be important for reference.

If you don't know the answer to a question based on the transcript or summary provided, be honest and say you don't have that information rather than making up an answer.

Format your responses using Markdown for better readability. Use headings, bullet points, bold, and other Markdown formatting when appropriate.`,
      },
    ];

    // Add existing conversation history
    messages.push(...chatHistory);

    // Create controller for stream cancellation
    const controller = new AbortController();
    const signal = controller.signal;

    // Store the controller for potential cancellation
    const tabStreamKey = `${tabId}-${payload.responseId}`;
    activeStreams.set(tabStreamKey, controller);

    // Make streaming request to OpenRouter
    console.log(
      "[Background] Making streaming chat request to OpenRouter API using Gemini 2.0"
    );
    const response = await fetch(apiEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey.trim().replace(/"/g, "")}`,
        "HTTP-Referer": "https://youtube-summarizer-extension.com", // Required by OpenRouter
        "X-Title": "YouTube AI Summarizer", // Required by OpenRouter
      },
      body: JSON.stringify({
        model: CHAT_MODEL, // Always use Gemini for chat
        messages: messages,
        temperature: temperature || 0.7,
        stream: true, // Enable streaming
      }),
      signal: signal, // For cancellation
    });

    if (!response.ok) {
      let errorMsg = `API request failed: ${response.status} ${response.statusText}`;
      try {
        const errorData = await response.json();
        errorMsg += ` - ${
          errorData.error?.message || JSON.stringify(errorData)
        }`;
      } catch (e) {
        // Ignore JSON parsing errors
      }

      console.error("[Background] API request failed:", errorMsg);

      await safeSendTabMessage(tabId, {
        action: "display_summary",
        type: "STREAM_CHUNK",
        responseId: payload.responseId,
        text: `Error: ${errorMsg}`,
      });

      return;
    }

    // Process the stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let fullResponse = "";

    console.log("[Background] Processing streaming response");

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          console.log("[Background] Stream complete");
          break;
        }

        // Decode the chunk
        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;

        // Process complete lines from buffer
        let lines = buffer.split("\n");
        buffer = lines.pop(); // Keep the last incomplete line in the buffer

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine || trimmedLine === "") continue;

          if (trimmedLine.startsWith("data: ")) {
            const data = trimmedLine.slice(6);

            // Check for end of stream
            if (data === "[DONE]") {
              console.log("[Background] Stream end marker received");
              break;
            }

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices[0]?.delta?.content;

              if (content) {
                // Send the content chunk to the content script
                await safeSendTabMessage(tabId, {
                  action: "display_summary",
                  type: "STREAM_CHUNK",
                  responseId: payload.responseId,
                  text: content,
                  isAppend: true,
                });

                // Add to full response
                fullResponse += content;
              }
            } catch (e) {
              console.log(
                "[Background] Error parsing JSON from stream:",
                e.message
              );
              // Skip any invalid JSON - could be comment lines from SSE
            }
          }
        }
      }

      // Send the full response as a final message in case we need it later
      await safeSendTabMessage(tabId, {
        action: "display_summary",
        type: "STREAM_COMPLETE",
        responseId: payload.responseId,
        text: fullResponse,
      });
    } catch (error) {
      // Check if this was an abort error from cancellation
      if (error.name === "AbortError") {
        console.log("[Background] Stream was cancelled");

        await safeSendTabMessage(tabId, {
          action: "display_summary",
          type: "STREAM_CANCELLED",
          responseId: payload.responseId,
        });
      } else {
        // Some other error occurred during streaming
        console.error("[Background] Error during streaming:", error);

        await safeSendTabMessage(tabId, {
          action: "display_summary",
          type: "STREAM_CHUNK",
          responseId: payload.responseId,
          text: `Error during streaming: ${error.message}`,
        });
      }
    } finally {
      // Clean up the stream reference
      if (activeStreams.has(tabStreamKey)) {
        activeStreams.delete(tabStreamKey);
      }
    }
  } catch (error) {
    console.error("[Background] Error in chat handler:", error);

    await safeSendTabMessage(tabId, {
      action: "display_summary",
      type: "STREAM_CHUNK",
      responseId: payload.responseId,
      text: `Error: ${error.message || "Unknown error occurred"}`,
    });
  }
}

// Handle summarize requests by getting user config and calling the API
async function handleSummarizeRequest(payload, tabId) {
  console.log(`[Background] Processing summarize request for tab ${tabId}`);

  try {
    // Validate that we have a proper transcript
    if (
      !payload.text ||
      payload.text.trim().length < 100 ||
      payload.text.includes("[]")
    ) {
      console.error(
        "[Background] Invalid transcript received:",
        payload.text?.substring(0, 100)
      );
      await notifyError(
        tabId,
        "Could not extract valid transcript. Please make sure the video has captions and try again."
      );
      return;
    }

    // Get the API key and endpoint from storage
    const { apiKey, apiEndpoint, temperature } = await getConfig();

    if (!apiKey) {
      console.error("[Background] API key not configured");
      await notifyError(
        tabId,
        "Please configure your API key in the extension options"
      );
      return;
    }

    // Create summary response ID
    const summaryResponseId = "summary-" + Date.now();

    // Tell content script we're starting a streaming summary
    await safeSendTabMessage(tabId, {
      action: "display_summary",
      type: "SUMMARY_LOADING",
      responseId: summaryResponseId,
      text: "Generating summary with Claude 3.7...",
    });

    // Create controller for stream cancellation
    const controller = new AbortController();
    const signal = controller.signal;

    // Store the controller for potential cancellation
    const tabStreamKey = `${tabId}-${summaryResponseId}`;
    activeStreams.set(tabStreamKey, controller);

    // Send the summarization request to the OpenRouter API
    console.log(
      "[Background] Making streaming summary request to OpenRouter API using Claude 3.7"
    );
    const response = await fetch(apiEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey.trim().replace(/"/g, "")}`,
        "HTTP-Referer": "https://youtube-summarizer-extension.com", // Required by OpenRouter
        "X-Title": "YouTube AI Summarizer", // Required by OpenRouter
      },
      body: JSON.stringify({
        model: SUMMARY_MODEL, // Always use Claude 3.7 for initial summaries
        messages: [
          {
            role: "system",
            content:
              "You are a helpful assistant that creates structured summaries of YouTube video transcripts. You should identify key sections, important points, and include meaningful timestamps from the transcript whenever possible. Be thorough in your explanations and don't be afraid to go into detail. When specific tactics, strategies or technical concepts are mentioned, explain them clearly so they're understandable. Format your response in Markdown for better readability.",
          },
          {
            role: "user",
            content: `Please analyze this YouTube video transcript and create a detailed summary that covers:

1. A thorough overview of what the video is about
2. Key sections/chapters with their main points
3. Important timestamps and what happens at those points
4. Main takeaways from the video

Include timestamps whenever possible (in MM:SS or HH:MM:SS format). If a timestamp isn't mentioned for a specific point, that's fine.

Be thorough and detailed in your explanations. When the video mentions specific tactics or methods, don't just name them - explain how they work and why they're important.

Here's the transcript:

${payload.text}

Format your response in clear Markdown with:
- Use # for main headings
- Use ## for subheadings
- Use bullet points for lists
- Use **bold** for emphasis
- Maintain proper spacing between sections for readability`,
          },
        ],
        temperature: temperature || 0.3, // Use a lower temperature for more focused summaries
        stream: true, // Enable streaming for summary
      }),
      signal: signal, // For cancellation
    });

    if (!response.ok) {
      let errorMsg = `API request failed: ${response.status} ${response.statusText}`;
      try {
        const errorData = await response.json();
        errorMsg += ` - ${
          errorData.error?.message || JSON.stringify(errorData)
        }`;
      } catch (e) {
        // Ignore JSON parsing errors
      }

      console.error("[Background] API request failed:", errorMsg);
      await notifyError(tabId, errorMsg);
      return;
    }

    // Process the stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let fullResponse = "";

    console.log("[Background] Processing streaming summary response");

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          console.log("[Background] Stream complete");
          break;
        }

        // Decode the chunk
        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;

        // Process complete lines from buffer
        let lines = buffer.split("\n");
        buffer = lines.pop(); // Keep the last incomplete line in the buffer

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine || trimmedLine === "") continue;

          if (trimmedLine.startsWith("data: ")) {
            const data = trimmedLine.slice(6);

            // Check for end of stream
            if (data === "[DONE]") {
              console.log("[Background] Stream end marker received");
              break;
            }

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices[0]?.delta?.content;

              if (content) {
                // Send the content chunk to the content script
                await safeSendTabMessage(tabId, {
                  action: "display_summary",
                  type: "SUMMARY_CHUNK",
                  responseId: summaryResponseId,
                  text: content,
                  isAppend: true,
                });

                // Add to full response
                fullResponse += content;
              }
            } catch (e) {
              console.log(
                "[Background] Error parsing JSON from stream:",
                e.message
              );
              // Skip any invalid JSON - could be comment lines from SSE
            }
          }
        }
      }

      // Send the full response as a final message
      if (fullResponse.length > 0) {
        console.log(
          "[Background] Summary stream complete, sending full summary of length:",
          fullResponse.length
        );

        // Send the complete summary
        chrome.tabs.sendMessage(tabId, {
          action: "display_summary",
          type: "SUMMARY_RESULT",
          summary: fullResponse,
        });
      } else {
        console.error("[Background] Empty summary generated");
        await notifyError(
          tabId,
          "Failed to generate summary: Empty response received"
        );
      }
    } catch (error) {
      // Check if this was an abort error from cancellation
      if (error.name === "AbortError") {
        console.log("[Background] Summary stream was cancelled");
        await notifyError(tabId, "Summary generation cancelled");
      } else {
        // Some other error occurred during streaming
        console.error("[Background] Error during summary streaming:", error);
        await notifyError(
          tabId,
          `Error during summary streaming: ${error.message}`
        );
      }
    } finally {
      // Clean up the stream reference
      if (activeStreams.has(tabStreamKey)) {
        activeStreams.delete(tabStreamKey);
      }
    }
  } catch (error) {
    console.error("[Background] Error during summarization:", error);
    await notifyError(tabId, `Error: ${error.message}`);
  }
}

// Get user configuration from storage, with fallbacks to defaults
async function getUserConfig() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(
      {
        apiKey: process.env.OPENROUTER_API_KEY || "", // Use environment variable as default
        apiEndpoint: "https://openrouter.ai/api/v1/chat/completions",
        model: "google/gemini-2.0-flash-001",
        promptTemplate:
          "Please provide a concise summary of the following YouTube video transcript. Focus on the main points, key insights, and important details.\n\nVideo Title: {{title}}\nChannel: {{channel}}\nTranscript:\n{{transcript}}",
      },
      (items) => {
        resolve(items);
      }
    );
  });
}

// Replace template variables in the prompt template
function createPromptFromTemplate(template, data) {
  let prompt = template;

  // Replace each template variable with its value
  Object.keys(data).forEach((key) => {
    const placeholder = `{{${key}}}`;
    prompt = prompt.replace(new RegExp(placeholder, "g"), data[key]);
  });

  console.log(
    "[YouTube AI Summarizer] Created prompt with length:",
    prompt.length
  );
  return prompt;
}

// Call the LLM API with the prompt (used for non-streaming API calls)
async function callLlmApi(prompt, config) {
  try {
    console.log(
      "[YouTube AI Summarizer] Preparing API request to:",
      config.apiEndpoint
    );
    // OpenRouter request format
    const requestData = {
      model: SUMMARY_MODEL, // Use Claude 3.7 for fallback non-streaming summaries
      messages: [
        {
          role: "system",
          content:
            "You are a helpful assistant that creates structured summaries of YouTube video transcripts. You should identify key sections, important points, and include meaningful timestamps from the transcript whenever possible. Format your response using Markdown to ensure excellent readability with headings, bullet points, and proper formatting.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.3, // Use a lower temperature for more focused summaries
      stream: false, // Disable streaming to ensure we get a complete response
    };

    // Make the API request
    console.log("[YouTube AI Summarizer] Sending API request");
    const response = await fetch(config.apiEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey.trim().replace(/"/g, "")}`,
        "HTTP-Referer": "https://youtube-summarizer-extension.com", // Required by OpenRouter
        "X-Title": "YouTube AI Summarizer", // Required by OpenRouter
      },
      body: JSON.stringify(requestData),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error(
        "[YouTube AI Summarizer] API error response:",
        response.status,
        errorData
      );
      throw new Error(
        errorData.error?.message ||
          `API request failed with status ${response.status}`
      );
    }

    const data = await response.json();
    console.log("[YouTube AI Summarizer] API response received");

    // Check for content filter
    if (data.choices?.[0]?.finish_reason === "content_filter") {
      console.error(
        "[YouTube AI Summarizer] Content filter triggered in API response"
      );
      throw new Error("Content filter triggered. Unable to generate summary.");
    }

    // Extract the summary text from the response
    const summaryText =
      data.choices?.[0]?.message?.content || "No summary was generated.";

    // Validate response
    if (!summaryText || summaryText.length < 20) {
      console.error(
        "[YouTube AI Summarizer] Summary too short or empty:",
        summaryText
      );
      throw new Error(
        "Generated summary was too short or empty. Please try again."
      );
    }

    console.log(
      "[YouTube AI Summarizer] Summary extracted, length:",
      summaryText.length
    );

    return summaryText;
  } catch (error) {
    console.error("[YouTube AI Summarizer] LLM API error:", error);
    throw new Error(`Failed to get summary: ${error.message}`);
  }
}

// Send an error message back to the content script
async function notifyError(tabId, errorMessage) {
  console.error("[YouTube AI Summarizer] Error notification:", errorMessage);
  await safeSendTabMessage(tabId, {
    type: "SUMMARY_RESULT",
    summary: `Error: ${errorMessage}`,
  });
}

// Set up initial configuration when extension is installed
chrome.runtime.onInstalled.addListener(({ reason }) => {
  console.log("[YouTube AI Summarizer] Extension installed, reason:", reason);
  if (reason === "install") {
    // Set default configuration
    chrome.storage.sync.set(DEFAULT_CONFIG, () => {
      console.log("[YouTube AI Summarizer] Default configuration set");

      // Open options page for initial setup
      chrome.runtime.openOptionsPage();
    });
  }
});

// Add this function to the background.js file if it's missing
function getConfig() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(
      {
        apiKey: process.env.OPENROUTER_API_KEY || "", // Use environment variable as default
        apiEndpoint: "https://openrouter.ai/api/v1/chat/completions",
        model: "google/gemini-2.0-flash-001",
        maxTokens: 1000,
        temperature: 0.3,
      },
      (items) => {
        resolve(items);
      }
    );
  });
}
