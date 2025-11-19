export default function handler(req, res) {
    try {
        const email = req.body.email;

        if (!email) {
            return res.status(400).json({ error: "Email object missing" });
        }

        const emailBody =
            email?.body?.content ||
            email?.uniqueBody?.content ||
            email?.bodyPreview ||
            email?.body ||
            "";

        const senderEmail =
            email?.from?.emailAddress?.address ||
            email?.sender?.emailAddress?.address ||
            email?.from ||
            "";

        const senderName = senderEmail
            ? ""
            : (
                email?.from?.emailAddress?.name ||
                email?.sender?.emailAddress?.name ||
                ""
              );

        const sentDate =
            email?.receivedDateTime ||
            email?.createdDateTime ||
            "";

        // نجيب كل الـ AccountId
        const accountRegex = /AccountId\s*[:=\-]?\s*(.+)/gi;
        const amountRegex  = /Amount\s*[:=\-]?\s*(.+)/gi;

        const accountMatches = [...emailBody.matchAll(accountRegex)];
        const amountMatches  = [...emailBody.matchAll(amountRegex)];

        const records = [];

        for (let i = 0; i < accountMatches.length; i++) {
            records.push({
                accountId: accountMatches[i][1].trim(),
                amount: amountMatches[i] ? amountMatches[i][1].trim() : ""
            });
        }

        return res.status(200).json({
            status: "success",
            data: {
                senderEmail,
                senderName,
                sentDate,
                records,      // ← هنا كل النتائج
                emailBody
            }
        });

    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
