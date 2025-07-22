export default async function handler(req, res) {
  try {
    console.log("body:", req.body); // هذا هو السطر اللي أضفناه

    const posts = req.body.posts;

    if (!posts || !Array.isArray(posts) || posts.length === 0) {
      return res.status(400).json({ error: "No posts found in request body" });
    }

    // فلترة فقط الرسائل العادية (مو system events)
    const messages = posts.filter(p => p.messageType === "message");

    if (messages.length === 0) {
      return res.status(200).json({ message: "No message-type posts found" });
    }

    // ترتيبهم حسب الوقت تنازلي
    messages.sort((a, b) => new Date(b.createdDateTime) - new Date(a.createdDateTime));

    // أخذ أحدث بوست
    const latest = messages[0];

    const result = {
      author: latest?.from?.user?.displayName || "Unknown",
      content: latest?.body?.content || "",
      createdAt: latest?.createdDateTime,
      link: latest?.webUrl,
      subject: latest?.subject || "(no subject)"
    };

    return res.status(200).json(result);

  } catch (err) {
    console.error("Error in checkTimelineRequest:", err);
    return res.status(500).json({ error: "Server error" });
  }
}
