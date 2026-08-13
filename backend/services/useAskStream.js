// In your React component — useAskStream.js hook

async function askStream(documentId, question, onToken, onCitations, onDone, onError) {
  // fetch() works for SSE — we read the response body as a stream
  const response = await fetch("/ask-stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ documentId, question })
  });

  if (!response.ok) {
    onError("Request failed");
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    // SSE events are separated by double newlines
    const events = buffer.split("\n\n");
    buffer = events.pop();
    // Keep the last incomplete event in the buffer

    for (const event of events) {
      if (!event.startsWith("data: ")) continue;
      const jsonStr = event.slice(6);  // remove "data: " prefix
      try {
        const data = JSON.parse(jsonStr);
        if (data.type === "token") onToken(data.text);
        if (data.type === "citations") onCitations(data.citations);
        if (data.type === "done") onDone();
        if (data.type === "error") onError(data.message);
      } catch {
        // Malformed event — ignore and continue
      }
    }
  }
}

// Usage in a React component:
// askStream(
//   documentId,
//   question,
//   (token) => setAnswer(prev => prev + token),    // append each token
//   (citations) => setCitations(citations),         // set citations when done
//   () => setLoading(false),                        // hide loading indicator
//   (err) => setError(err)                          // show error state
// );