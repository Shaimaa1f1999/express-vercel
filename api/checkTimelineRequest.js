export default async function handler(req, res) {
  const { posts } = req.body;

  // فلترة فقط الرسائل العادية
  const messagePosts = posts
    .filter(post => post.messageType === 'message')
    .sort((a, b) => new Date(b.createdDateTime) - new Date(a.createdDateTime));

  if (messagePosts.length === 0) {
    return res.status(200).json({ status: 'no_posts_found' });
  }

  const lastPost = messagePosts[0];

  const teamId = lastPost.channelIdentity?.teamId;
  const channelId = lastPost.channelIdentity?.channelId;
  const messageId = lastPost.id;

  const repliesEndpoint = `https://graph.microsoft.com/v1.0/teams/${teamId}/channels/${channelId}/messages/${messageId}/replies`;

  const token = process.env.GRAPH_TOKEN;

  let replyData;
  try {
    const response = await fetch(repliesEndpoint, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (response.status === 401) {
      return res.status(200).json({ status: 'unauthorized', error: 'Invalid or expired token' });
    }

    replyData = await response.json();

    if (!Array.isArray(replyData?.value)) {
      return res.status(200).json({ status: 'invalid_response', data: replyData });
    }
  } catch (error) {
    return res.status(500).json({ status: 'fetch_error', error: error.message });
  }

  const replies = replyData.value;

  const keywords = ['timeline', 'تايم لاين', 'give me timeline'];
  const lastReplyText = replies
    .sort((a, b) => new Date(b.createdDateTime) - new Date(a.createdDateTime))
    ?.at(0)?.body?.content?.toLowerCase() || '';

  const foundKeyword = keywords.some(keyword => lastReplyText.includes(keyword));

  if (!foundKeyword) {
    return res.status(200).json({ status: 'no_keyword_triggered' });
  }

  // ⏱ Formatting utils
  const formatTimeKSA = (isoDate) => {
    const date = new Date(isoDate);
    return date.toLocaleTimeString('en-GB', {
      timeZone: 'Asia/Riyadh',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDateOnlyKSA = (isoDate) => {
    const date = new Date(isoDate);
    return date.toLocaleDateString('en-GB', {
      timeZone: 'Asia/Riyadh',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const formatFullDateHeader = (isoDate) => {
    const date = new Date(isoDate);
    return date.toLocaleDateString('en-GB', {
      timeZone: 'Asia/Riyadh',
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  // 🧠 Build timeline
  const timelineLines = replies
    .filter(r => r?.body?.content)
    .sort((a, b) => new Date(a.createdDateTime) - new Date(b.createdDateTime))
    .map(reply => {
      const time = formatTimeKSA(reply.createdDateTime);
      const date = formatDateOnlyKSA(reply.createdDateTime);
      const content = reply.body.content
        .replace(/<\/?[^>]+(>|$)/g, '') // remove HTML tags
        .replace(/\n/g, ' ')
        .trim();
      return `• ${time} KSA – ${content}\n  📅 ${date}`;
    });

  const reply = `🕓 **Incident Timeline**\n**${formatFullDateHeader(replies[0]?.createdDateTime)}**\n\n${timelineLines.join('\n\n')}`;

  return res.status(200).json([
    {
      teamId,
      channelId,
      messageId,
      reply
    }
  ]);
}
