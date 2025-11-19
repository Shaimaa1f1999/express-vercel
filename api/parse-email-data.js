export default function handler(req, res) {
    try {
        const email = req.body.email;

        if (!email) {
            return res.status(400).json({ error: "Email object missing" });
        }

        // النص الكامل (HTML أو Text)
        const emailBody =
            email?.body?.content ||
            email?.uniqueBody?.content ||
            email?.bodyPreview ||
            email?.body ||
            "";

        // الإيميل فقط لو موجود
        const senderEmail =
            email?.from?.emailAddress?.address ||
            email?.sender?.emailAddress?.address ||
            "";

        // الاسم: لو عندنا إيميل من الأساس ما نحتاج اسم
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

        // دالة استخراج قيم بدون قصّ أو تحويل
        const extractValue = (label) => {
            const patterns = [
                `${label}\\s*[:\\-]?\\s*(.+)`,      // AccountId: 55521
                `${label}\\s*=\\s*(.+)`,           // AccountId=55521
                `${label}\\s+(.+)`                 // AccountId 55521
            ];

            for (const p of patterns) {
                const regex = new RegExp(p, "i");
                const match = emailBody.match(regex);
                if (match) {
                    // يرجّع القيمة كاملة بدون قص
                    return match[1].trim();
                }
            }

            return "";
        };

        const accountId = extractValue("AccountId");
        const amount = extractValue("Amount");   // يرجّع كامل حتى لو فيه فاصلة طويلة

        return res.status(200).json({
            status: "success",
            data: {
                senderEmail,
                senderName,
                sentDate,
                accountId,
                amount,
                emailBody
            }
        });

    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
