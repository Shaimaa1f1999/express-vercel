export default function handler(req, res) {
    try {
        const email = req.body.email;

        if (!email) {
            return res.status(400).json({ error: "Email object missing" });
        }

        // الجسم الكامل (HTML أو Text)
        const emailBody =
            email?.body?.content ||
            email?.bodyPreview ||
            "";


        // اسم ورقم المرسل
        const senderName =
            email?.from?.emailAddress?.name ||
            email?.sender?.emailAddress?.name ||
            "";

        const senderEmail =
            email?.from?.emailAddress?.address ||
            email?.sender?.emailAddress?.address ||
            "";

        const sentDate =
            email?.receivedDateTime ||
            email?.createdDateTime ||
            "";

        // دالة استخراج أي قيمة بعد أي label
        const extractValue = (label) => {
            const patterns = [
                `${label}\\s*[:\\-]?\\s*([A-Za-z0-9._-]+)`,
                `${label}\\s*=\\s*([A-Za-z0-9._-]+)`,
                `${label}\\s+([A-Za-z0-9._-]+)`
            ];

            for (const p of patterns) {
                const regex = new RegExp(p, "i");
                const match = emailBody.match(regex);
                if (match) return match[1];
            }

            return "";
        };

        const accountId = extractValue("AccountId");
        const amount = extractValue("Amount");

        return res.status(200).json({
            status: "success",
            data: {
                senderName,
                senderEmail,
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
