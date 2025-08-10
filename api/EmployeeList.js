// api/zohoCertsCsvPaged.js
// POST body: { url: "https://people.zoho.com/people/api/forms/.../getRecords", token: "...", limit: 100 }



export default async function handler(req, res) {
  try {
    const url   = req.body?.url;                      // base url بدون sIndex/limit
    const token = req.body?.token;                    // OAuth access_token
    const limit = Number(req.body?.limit ?? 100);     // 100 أو 200 حسب رغبتك
    if (!url || !token) {
      return res.status(400).json({ error: "url and token are required" });
    }



    // بسيط: إعادة المحاولة لو ضغط/429
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    async function fetchPage(sIndex, attempt = 1) {
      const u = `${url}${url.includes("?") ? "&" : "?"}sIndex=${sIndex}&limit=${limit}`;
      const r = await fetch(u, {
        headers: { Authorization: `Zoho-oauthtoken ${token}` },
      });
      if (r.status === 429 && attempt <= 3) {
        await sleep(1000 * attempt);
        return fetchPage(sIndex, attempt + 1);
      }
      if (!r.ok) {
        const txt = await r.text().catch(()=>"");
        throw new Error(`Fetch failed ${r.status}: ${txt || r.statusText}`);
      }
      return r.json();
    }



    // اجمع كل الصفحات
    let sIndex = 1;
    const all = [];
    while (true) {
      const data = await fetchPage(sIndex);
      const batch = data?.response?.result;
      if (!Array.isArray(batch) || batch.length === 0) break;
      all.push(...batch);
      if (batch.length < limit) break;      // أقل من الحد؟ وقف
      sIndex += limit;                      // انتقل للصفحة التالية
    }



    if (all.length === 0) {
      return res.status(200).send("RecordId\n"); // CSV فاضي مع هيدر واحد
    }



    // فلترة التعشيق وتحضير الصفوف
    const rows = [];
    const headerSet = new Set(["RecordId"]);
    for (const item of all) {
      if (!item || typeof item !== "object") continue;
      const recordId = Object.keys(item)[0];
      const arr = item[recordId] ?? [];
      const fields = Array.isArray(arr) ? (arr[0] ?? {}) : (arr || {});
      const row = { RecordId: recordId, ...fields };
      Object.keys(row).forEach(k => headerSet.add(k));
      rows.push(row);
    }



    // ترتيب أعمدة مفيد أولاً ثم الباقي أبجديًا
    const preferred = [
      "RecordId","Reference_Number","Training_Name","Type","Proof_of_Execution",
      "Proof_of_Execution_Document","Proof_of_Execution_Document_downloadUrl",
      "Compleation_Date","ApprovalStatus","ApprovalTime","Employee1","Employee1.ID",
      "Trainee","Trainee.ID","AddedTime","AddedBy","AddedBy.ID","ModifiedTime",
      "ModifiedBy","ModifiedBy.ID","CreatedTime","Zoho_ID","Description",
      "Training_Request","Training_Request.ID"
    ];
    const allHeaders = Array.from(headerSet);
    const rest = allHeaders.filter(h => !preferred.includes(h)).sort((a,b)=>a.localeCompare(b));
    const headers = [...preferred.filter(h => headerSet.has(h)), ...rest];



    // CSV
    const esc = (v) => {
      if (v === null || v === undefined) return "";
      const s = String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [];
    lines.push(headers.map(esc).join(","));
    for (const r of rows) lines.push(headers.map(h => esc(r[h])).join(","));
    const csv = lines.join("\r\n");



    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=certs.csv");
    return res.status(200).send(csv);
  } catch (e) {
    return res.status(500).json({ error: e?.message || "failed" });
  }
}
