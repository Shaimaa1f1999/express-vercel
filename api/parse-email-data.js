export default function handler(req, res) {
  try {
    const email = req.body.email || {};

    // Body
    const body = email.Body || "";

    // Sender info
    const senderName =
      email.From?.EmailAddress?.Name?.trim() || "";
    const senderEmail =
      email.From?.EmailAddress?.Address?.trim() || "";

    // Date
    const sentDate = email.ReceivedDateTime || "";

    // Extract AccountId
    const accountIdMatch = body.match(/AccountId\s*[:\-]?\s*(\d+)/i);
    const accountId = accountIdMatch ? accountIdMatch[1] : "";

    // Extract full Amount with decimals & commas
    const amountRegex = /Amount\s*[:\-]?\s*([\d.,]+)/i;
    const amountMatch = body.match(amountRegex);

    // Clean amount: remove commas فقط وخلّي النقاط
    const amount = amountMatch
      ? amountMatch[1].replace(/,/g, "")
      : "";

    return res.status(200).json({
      status: "success",
      data: {
        senderName,
        senderEmail,
        sentDate,
        accountId,
        amount,
        emailBody: body
      }
    });

  } catch (err) {
    return res.status(500).json({
      status: "error",
      message: err.message
    });
  }
}
