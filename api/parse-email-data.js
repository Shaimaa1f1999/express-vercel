export default function handler(req, res) {
    try {
        const email = req.body.email;

        if (!email) {
            return res.status(400).json({ error: "Email object missing" });
        }

    
        const senderName = email?.From?.EmailAddress?.Name || "";
        const senderEmail = email?.From?.EmailAddress?.Address || "";
        const sentDate = email?.ReceivedDateTime || "";
        const emailBody = email?.Body || "";

       
        const extractValue = (label) => {
            const regex = new RegExp(`${label}\\s*[:\\-]?\\s*(\\S+)`, "i");
            const match = emailBody.match(regex);
            return match ? match[1] : "";
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
