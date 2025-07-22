export default async function handler(req, res) {
  try {
    const posts = req.body.posts;

    if (!posts || !Array.isArray(posts) || posts.length === 0) {
      return res.status(400).json({ error: "No posts found in request body" });
    }

    // نطبع كل بوست فيه messageType = "message"
    const messages = posts.filter(p => p.messageType === "message");

    const simplified = messages.map(p => ({
      id: p.id,
      content: p.body?.content,
      from: p.from?.user?.displayName,
      createdAt: p.createdDateTime
    }));

    console.log("📦 All messages with ID and content:");
    simplified.forEach(msg => {
      console.log(`🆔 ${msg.id}`);
      console.log(`👤 ${msg.from}`);
      console.log(`📅 ${msg.createdAt}`);
      console.log(`💬 ${msg.content}`);
      console.log("------------");
    });

    return res.status(200).json({ messages: simplified });

  } catch (err) {
    console.error("💥 Error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}
