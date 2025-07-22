export default async function handler(req, res) {
  try {
    console.log("✅ Received body:", req.body);

    const posts = req.body.posts;

    if (!posts || !Array.isArray(posts) || posts.length === 0) {
      console.log("❌ No posts or invalid format");
      return res.status(400).json({ error: "No posts found in request body" });
    }

    // فلترة فقط الرسائل العادية
    const messages = posts.filter(p => p.messageType === "message");
    console.log("📝 Filtered messages:", messages);

    if (messages.length === 0) {
      console.log("⚠️ No message-type posts found");
      return res.status(200).json({ message: "No message-type posts found" });
    }

    // ترتيب حسب الوقت
    messages.sort((a, b) => new Date(b.createdDateTime) - new Date(a.createdDateTime));
    console.log("📅 Sorted messages:", messages.map(m => m.createdDateTime));

    const latest = messages[0];
    console.log("🔥 Latest message:", latest);

    const result = {
      author: latest?.from?.user?.displayName || "Unknown",
      content: latest?.body?.content || "",
      createdAt: latest?.createdDateTime,
      link: latest?.webUrl,
      subject: latest?.subject || "(no subject)"
    };

    console.log("✅ Final result:", result);
    return res.status(200).json(result);

  } catch (err) {
    console.error("💥 Error in checkTimelineRequest:", err);
    return res.status(500).json({ error: "Server error" });
  }
}
