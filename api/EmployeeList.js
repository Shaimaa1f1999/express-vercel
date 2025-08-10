// api/zohoCertsCsvPaged.js
// POST body: { url:"https://people.zoho.com/people/api/forms/.../getRecords", token:"...", limit:100, fileName:"export.csv" }

export default async function handler(req, res) {
  try {
    const url      = req.body?.url;                   // base url بدون sIndex/limit
    const token    = req.body?.token;                 // OAuth access_token
    const limit    = Number(req.body?.limit ?? 100);  // 100 أو 200
    const fileName = req.body?.fileName ?? "export.csv";
    if (!url || !token) return res.status(400).json({ error: "url and token are required" });

    // إعادة المحاولة لو 429
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    async function fetchPage(sIndex, attempt = 1) {
      const u = `${url}${url.includes("?") ? "&" : "?"}sIndex=${sIndex}&limit=${limit}`;
      const r = await fetch(u, { headers: { Authorization: `Zoho-oauthtoken ${token}` } });
      if (r.status === 429 && attempt <= 3) { await sleep(1000 * attempt); return fetchPage(sIndex, attempt + 1); }
      if (!r.ok) { const txt = await r.text().catch(()=>""); throw new Error(`Fetch failed ${r.status}: ${txt || r.statusText}`); }
      return r.json();
    }

    // تجميع الصفحات
    let sIndex = Number(req.body?.start ?? 0); // ابدأ من 0
    const all = [];
    while (true) {
      const data  = await fetchPage(sIndex);
      const batch = data?.response?.result;
      if (!Array.isArray(batch) || batch.length === 0) break;
      all.push(...batch);
      if (batch.length < limit) break;
      sIndex += limit;
    }

    if (all.length === 0) return res.status(200).send("RecordId\n"); // CSV فاضي

    // تسطيح بسيط + بناء الهيدر (بدون أي ترتيب خاص)
    const rows = [];
    const headerSet = new Set(["RecordId"]);
    for (const item of all) {
      if (!item || typeof item !== "object") continue;
      const recordId = Object.keys(item)[0];
      const arr      = item[recordId] ?? [];
      const fields   = Array.isArray(arr) ? (arr[0] ?? {}) : (arr || {});
      const row      = { RecordId: recordId, ...fields };
      Object.keys(row).forEach(k => headerSet.add(k));
      rows.push(row);
    }

    // لا preferred، لا sort
    const headers = Array.from(headerSet);

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
    res.setHeader("Content-Disposition", `attachment; filename=${fileName}`);
    return res.status(200).send(csv);
  } catch (e) {
    return res.status(500).json({ error: e?.message || "failed" });
  }
}
