// /api/zohoCertsCsv.js
export default async function handler(req, res) {
  try {
    // يقبل أي شكل: { body:{response:{result}} } أو {response:{result}} أو {result} أو المصفوفة نفسها
    const R =
      req.body?.body?.response?.result ??
      req.body?.response?.result ??
      req.body?.result ??
      req.body;

    if (!Array.isArray(R) || R.length === 0) {
      return res.status(400).json({ error: "No data (result[]) in request body" });
    }

    // فضّي التعشيق: { "<recordId>": [ {fields...} ] }
    const rows = [];
    const headerSet = new Set(["RecordId"]); // نبدأ بـ RecordId دايمًا

    for (const item of R) {
      if (!item || typeof item !== "object") continue;
      const recordId = Object.keys(item)[0];
      const arr = item[recordId] ?? [];
      const fields = Array.isArray(arr) ? (arr[0] ?? {}) : (arr || {});
      const row = { RecordId: recordId, ...fields };

      // اجمع كل الأعمدة
      Object.keys(row).forEach(k => headerSet.add(k));
      rows.push(row);
    }

    // رتّب الأعمدة: أولويات مفيدة ثم الباقي أبجديًا
    const preferred = [
      "RecordId","Reference_Number","AddedBy","AddedTime",

      "ModifiedBy","ModifiedTime","Employee1",

      "Compleation_Date","Training_Name","Description","Type",

      "Proof_of_Execution_Document","Proof_of_Execution",

      "Training_Request","Employee1.ID","ApprovalStatus","ApprovalTime","Proof_of_Execution_Document_downloadUrl",

      "Trainee","Trainee.ID","AddedBy.ID","ModifiedBy.ID","CreatedTime","Zoho_ID","Training_Request.ID"
    ];
    const all = Array.from(headerSet);
    const rest = all.filter(h => !preferred.includes(h)).sort((a,b)=>a.localeCompare(b));
    const headers = [...preferred.filter(h => headerSet.has(h)), ...rest];

    // CSV
    const esc = v => {
      if (v === null || v === undefined) return "";
      const s = String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [];
    lines.push(headers.map(esc).join(","));
    for (const r of rows) {
      lines.push(headers.map(h => esc(r[h])).join(","));
    }
    const csv = lines.join("\r\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=certs.csv");
    return res.status(200).send(csv);
  } catch (e) {
    return res.status(500).json({ error: e?.message || "failed" });
  }
}
