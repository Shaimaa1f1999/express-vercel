// api/zohoCertsCsvPaged.js
// POST body: { 
//   url:"https://people.zoho.com/people/api/forms/.../getRecords",
//   token:"...",
//   limit:100,
//   fileName:"export.csv",
//   photoField:"Photo",       // اسم الحقل اللي فيه رابط viewEmployeePhoto (اختياري)
//   emailField:"EmailID"      // اسم حقل الإيميل (اختياري، الافتراضي EmailID)
// }

export default async function handler(req, res) {
  try {
    const url        = req.body?.url;
    const token      = req.body?.token;
    const limit      = Number(req.body?.limit ?? 100);
    const fileName   = req.body?.fileName ?? "export.csv";
    const photoField = req.body?.photoField ?? "Photo";
    const emailField = req.body?.emailField ?? "EmailID";
    if (!url || !token) return res.status(400).json({ error: "url and token are required" });

    // retry 429
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    async function fetchPage(sIndex, attempt = 1) {
      const u = `${url}${url.includes("?") ? "&" : "?"}sIndex=${sIndex}&limit=${limit}`;
      const r = await fetch(u, { headers: { Authorization: `Zoho-oauthtoken ${token}` } });
      if (r.status === 429 && attempt <= 3) { await sleep(1000 * attempt); return fetchPage(sIndex, attempt + 1); }
      if (!r.ok) { const txt = await r.text().catch(()=>""); throw new Error(`Fetch failed ${r.status}: ${txt || r.statusText}`); }
      return r.json();
    }

    // جمع كل الصفحات
    let sIndex = Number(req.body?.start ?? 0);
    const flatRows = [];
    while (true) {
      const data  = await fetchPage(sIndex);
      const batch = data?.response?.result;
      if (!Array.isArray(batch) || batch.length === 0) break;
      for (const item of batch) {
        if (!item || typeof item !== "object") continue;
        const recordId = Object.keys(item)[0];
        const arr      = item[recordId] ?? [];
        const fields   = Array.isArray(arr) ? (arr[0] ?? {}) : (arr || {});
        flatRows.push({ RecordId: recordId, ...fields });
      }
      if (batch.length < limit) break;
      sIndex += limit;
    }

    // لو ما فيه بيانات: رجّع هيدر العمودين فقط
    if (flatRows.length === 0) {
      const emptyCsv = "EmailID,PhotoDataUri\r\n";
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename=${fileName}`);
      return res.status(200).send(emptyCsv);
    }

    // دالة تجيب الصورة وترجعها Data URI (image/jpeg فقط)
    async function fetchPhotoDataUri(photoUrl) {
      if (!photoUrl || typeof photoUrl !== "string") return "";
      // استخرج filename
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
      if (!r.ok) return "";

      // وحّد الـMIME إلى image/jpeg وخلّي السلسلة سطر واحد
      const ab  = await r.arrayBuffer();
      const b64 = Buffer.from(ab).toString("base64").replace(/\r?\n/g, "");
      return `data:image/jpeg;base64,${b64}`;
    }

    // CSV helpers
    const esc = (v) => {
      if (v === null || v === undefined) return "";
      const s = String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const headers = ["EmailID", "PhotoDataUri"];
    const lines = [];
    lines.push(headers.map(esc).join(","));

    // حد توازي بسيط
    const CONCURRENCY = 5;
    let idx = 0;

    async function processRow(row) {
      const email = row[emailField] ?? "";        // خذ الإيميل من الحقل المحدد
      const uri   = await fetchPhotoDataUri(row[photoField]);
      lines.push([esc(email), esc(uri)].join(","));
    }

    async function runPool() {
      const tasks = [];
      while (idx < flatRows.length && tasks.length < CONCURRENCY) {
        tasks.push(processRow(flatRows[idx++]));
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
