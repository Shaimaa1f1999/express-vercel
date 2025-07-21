export default async function handler(req, res) {
  const posts = req.body.posts;

  if (!Array.isArray(posts) || posts.length === 0) {
    return res.status(400).json({ error: 'No posts received' });
  }

  // Sort posts by createdDateTime DESC to get the latest one
  const sortedPosts = posts.sort((a, b) =>
    new Date(b.createdDateTime) - new Date(a.createdDateTime)
  );
  const lastPost = sortedPosts[0];

  const teamId = lastPost?.teamId;
  const channelId = lastPost?.channelIdentity?.channelId;
  const messageId = lastPost?.id;

  if (!teamId || !channelId || !messageId) {
    return res.status(400).json({ error: 'Missing identifiers in last post' });
  }

  // 🧠 Get replies from MS Teams API (or mocked for now)
  const replies = await fetch(`https://graph.microsoft.com/v1.0/teams/${teamId}/channels/${channelId}/messages/${messageId}/replies`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${process.env.GRAPH_TOKEN}`, // inject token securely
      "Content-Type": "application/json"
    }
  });

  const repliesData = await replies.json();
  const repliesList = repliesData.value || [];

  if (repliesList.length === 0) {
    return res.status(200).json([]); // No replies, no action
  }

  // Get the latest reply
  const lastReply = repliesList[repliesList.length - 1];
  const lastReplyText = lastReply.body?.content?.toLowerCase() || "";

  const keywords = ["هات التايم لاين", "give me timeline", "تايم لاين"];
  const foundKeyword = keywords.some(keyword => lastReplyText.includes(keyword));

  if (!foundKeyword) {
    return res.status(200).json([]); // No match, no action
  }

  // 🛠️ If matched, prepare reply
  const now = new Date();
  const reply = `🕒 Timeline as of ${now.toLocaleString('en-GB')}:\n- Event A\n- Event B\n- Event C`;

  return res.status(200).json([
    {
      teamId,
      channelId,
      messageId,
      reply
    }
  ]);
}
