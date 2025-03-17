export const fetchSummary = async (videoId) => {
  try {
    const response = await fetch("/api/summary", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        videoId,
        format: "markdown", // Request markdown formatted response
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to fetch summary");
    }

    return await response.json();
  } catch (error) {
    console.error("Error fetching summary:", error);
    throw error;
  }
};
