export default async function handler(req, res) {
  const { posts } = req.body;

  // فقط نشتغل على نوع message (نتجاهل systemEventMessage)
  const messagePosts = posts
    .filter(post => post.messageType === 'message')
    .sort((a, b) => new Date(b.createdDateTime) - new Date(a.createdDateTime));

  if (messagePosts.length === 0) {
    return res.status(200).json([]); // ما فيه بوستات حقيقية
  }

  const lastPost = messagePosts[0];

  const teamId = lastPost.channelIdentity?.teamId;
  const channelId = lastPost.channelIdentity?.channelId;
  const messageId = lastPost.id;

  // الآن نحاول نجيب الردود
  const repliesEndpoint = `https://graph.microsoft.com/v1.0/teams/${teamId}/channels/${channelId}/messages/${messageId}/replies`;

  // ملاحظة: لازم تكون عندك authorization token هنا
  const token = process.env.GRAPH_TOKEN; // عطه في Vercel environment variable

  const response = await fetch(repliesEndpoint, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  const replyData = await response.json();
  const replies = replyData?.value || [];

  // فلترة على الكلمات
  const keywords = ['timeline', 'تايم لاين', 'give me timeline'];

  const lastReplyText = replies
    .sort((a, b) => new Date(b.createdDateTime) - new Date(a.createdDateTime))
    ?.at(0)?.body?.content?.toLowerCase() || '';

  const foundKeyword = keywords.some(keyword => lastReplyText.includes(keyword));

  if (!foundKeyword) {
    return res.status(200).json([]); // No trigger
  }

  // ✅ رجع التايم لاين
  const now = new Date();
  const reply = `🕓 Timeline as of ${now.toLocaleString('en-GB')}:\n- Event 1\n- Event 2\n- ...`;

  return res.status(200).json([
    {
      teamId,
      channelId,
      messageId,
      reply
    }
  ]);
}
