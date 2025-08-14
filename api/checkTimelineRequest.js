// api/zohoCertsCsvPaged.js
// POST body: { 
//   url:"https://people.zoho.com/people/api/forms/.../getRecords", 
//   token:"...", 
//   limit:100, 
//   fileName:"export.csv",
//   photoField:"Photo"           // اسم العمود اللي فيه رابط viewEmployeePhoto (اختياري)
// }

export default async function handler(req, res) {
  try {
    const url       = req.body?.url;                   // base url بدون sIndex/limit
    const token     = req.body?.token;                 // OAuth access_token
    const limit     = Number(req.body?.limit ?? 100);  // 100 أو 200
    const fileName  = req.body?.fileName ?? "export.csv";
    const photoField= req.body?.photoField ?? "Photo"; // العمود المصدر للصورة
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

    // —— إضافة عمود صورة كـ Data URI ——
    // 1) حضّري الهيدر
    headerSet.add("PhotoDataUri");       // العمود الجديد للعرض في Power BI
    const headers = Array.from(headerSet);

    // 2) دالة تسحب الصورة وترجع data URI  (مع Content-Type الصحيح)
    async function fetchPhotoDataUri(photoUrl) {
      if (!photoUrl || typeof photoUrl !== "string") return "";
      // استخرج filename=... سواء كان URL صالح أو نص
      let filename = "";
      try {
        const u = new URL(photoUrl);
        filename = u.searchParams.get("filename") || "";
      } catch {
        const i = photoUrl.indexOf("filename=");
        if (i >= 0) filename = photoUrl.substring(i + "filename=".length);
      }
      if (!filename) return "";

      const r = await fetch(
        `https://people.zoho.com/api/viewEmployeePhoto?filename=${encodeURIComponent(filename)}`,
        { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
      );
      if (!r.ok) return ""; // لا توقف التصدير بسبب صورة فاشلة

      const ct = r.headers.get("content-type") || "image/jpeg";
      const ab = await r.arrayBuffer();
      const b64 = Buffer.from(ab).toString("base64");
      // رجّع Data URI صالح للعرض في Power BI
      return `data:${ct};base64,${b64}`;
    }

    // 3) لمّا نكتب CSV، نحقن PhotoDataUri لكل صف
    const esc = (v) => {
      if (v === null || v === undefined) return "";
      const s = String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const lines = [];
    lines.push(headers.map(esc).join(","));

    // حدّ توازي بسيط عشان ما ينقطع بسبب Rate Limits
    const CONCURRENCY = 5;
    let idx = 0;

    async function processRow(row) {
      // ابني نسخة قابلة للكتابة
      const out = { ...row };

      // جهّز الـ Data URI
      const photoUrl = row[photoField];
      out.PhotoDataUri = await fetchPhotoDataUri(photoUrl);

      // اكتب السطر
      lines.push(headers.map(h => esc(out[h])).join(","));
    }

    async function runPool() {
      const tasks = [];
      while (idx < rows.length && tasks.length < CONCURRENCY) {
        tasks.push(processRow(rows[idx++]));
      }
      if (tasks.length === 0) return;
      await Promise.all(tasks);
      return runPool();
    }
    await runPool();

    const csv = lines.join("\r\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=${fileName}`);
    return res.status(200).send(csv);

  } catch (e) {
    return res.status(500).json({ error: e?.message || "failed" });
  }
}
