export default async function handler(req, res) {
  const { videoId, format } = req.body;

  const prompt = `Please provide a summary of the following video content in ${
    format === "markdown" ? "Markdown format" : "plain text"
  }:\n\n${transcription}`;

  try {
    const completion = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content:
            "You are a helpful assistant that summarizes video content. Format your response in Markdown with headings, bullet points, and emphasis where appropriate.",
        },
        { role: "user", content: prompt },
      ],
    });

    const summary = completion.data.choices[0].message.content;

    // Validate that we actually got a response
    if (!summary) {
      return res.status(500).json({ error: "Couldn't generate summary" });
    }

    return res.status(200).json({ summary });
  } catch (error) {
    console.error("Error generating summary:", error);
    return res.status(500).json({ error: error.message });
  }
}
