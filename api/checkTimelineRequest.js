// api/zohoCertsCsvPaged.js
// POST body: {
//   url:"https://people.zoho.com/people/api/forms/.../getRecords",
//   token:"...",
//   limit:100,
//   fileName:"export.csv",
//   photoField:"Photo",      // (اختياري) اسم حقل رابط الصورة
//   emailField:"EmailID"     // (اختياري) اسم حقل الإيميل
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

    // ——— helpers ———
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    async function fetchPage(sIndex, attempt = 1) {
      const u = `${url}${url.includes("?") ? "&" : "?"}sIndex=${sIndex}&limit=${limit}`;
      const r = await fetch(u, { headers: { Authorization: `Zoho-oauthtoken ${token}` } });
      if (r.status === 429 && attempt <= 3) { await sleep(1000 * attempt); return fetchPage(sIndex, attempt + 1); }
      if (!r.ok) { const txt = await r.text().catch(()=>""); throw new Error(`Fetch failed ${r.status}: ${txt || r.statusText}`); }
      return r.json();
    }
    const esc = (v) => {
      if (v === null || v === undefined) return "";
      const s = String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };

    // ——— اجلب كل الصفحات وفلّط السجلات ———
    let sIndex = Number(req.body?.start ?? 0);
    const rows = [];
    while (true) {
      const data  = await fetchPage(sIndex);
      const batch = data?.response?.result;
      if (!Array.isArray(batch) || batch.length === 0) break;

      for (const item of batch) {
        if (!item || typeof item !== "object") continue;
        const recordId = Object.keys(item)[0];
        const arr      = item[recordId] ?? [];
        const fields   = Array.isArray(arr) ? (arr[0] ?? {}) : (arr || {});
        rows.push({ RecordId: recordId, ...fields });
      }
      if (batch.length < limit) break;
      sIndex += limit;
    }

    // لو فاضي رجّع الهيدر فقط
    if (rows.length === 0) {
      const emptyCsv = "EmailID,PhotoDataUri\r\n";
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename=${fileName}`);
      return res.status(200).send(emptyCsv);
    }

    // ——— جلب الصورة وإرجاع Data URI (يدعم people + contacts) ———
async function fetchPhotoDataUri(photoUrl) {
  if (!photoUrl || typeof photoUrl !== "string") return "";

  let requestUrl = "";
  try {
    const u = new URL(photoUrl);

    if (u.hostname.includes("people.zoho.com") && u.pathname.includes("/api/viewEmployeePhoto")) {
      const filename = u.searchParams.get("filename") || "";
      if (!filename) return "";
      requestUrl = `https://people.zoho.com/api/viewEmployeePhoto?filename=${encodeURIComponent(filename)}`;
    } else if (u.hostname.includes("contacts.zoho.com") && u.pathname.includes("/file")) {
      // نحاول نشيل &fs=thumb عشان نجيب الأصل
      let fullUrl = u.toString().replace(/([&?])fs=thumb/, "$1fs=original");
      requestUrl = fullUrl;
    } else {
      const i = photoUrl.indexOf("filename=");
      if (i >= 0) {
        const filename = photoUrl.substring(i + "filename=".length);
        requestUrl = `https://people.zoho.com/api/viewEmployeePhoto?filename=${encodeURIComponent(filename)}`;
      } else {
        return "";
      }
    }
  } catch {
    const i = photoUrl.indexOf("filename=");
    if (i >= 0) {
      const filename = photoUrl.substring(i + "filename=".length);
      requestUrl = `https://people.zoho.com/api/viewEmployeePhoto?filename=${encodeURIComponent(filename)}`;
    } else {
      return "";
    }
  }

  const r = await fetch(requestUrl, { headers: { Authorization: `Zoho-oauthtoken ${token}` } });
  if (!r.ok) return "";

  // قراءة البيانات
  const ab  = await r.arrayBuffer();
  if (!ab || ab.byteLength === 0) return "";

  // محاولة كشف النوع إذا ما كان موجود أو كان application/octet-stream
  let mime = (r.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!mime || mime === "application/octet-stream") {
    const b = new Uint8Array(ab);
    if (b[0] === 0xFF && b[1] === 0xD8) mime = "image/jpeg";
    else if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) mime = "image/png";
    else mime = "image/jpeg";
  }

  if (!mime.startsWith("image/")) return "";

  const b64 = Buffer.from(ab).toString("base64").replace(/\r?\n/g, "");
  return `data:${mime};base64,${b64}`;
}


    // ——— ابني CSV بعمودين فقط ———
    const headers = ["EmailID", "PhotoDataUri"];
    const lines = [];
    lines.push(headers.map(esc).join(","));

    const CONCURRENCY = 5;
    let idx = 0;

    async function processRow(row) {
      const email = row[emailField] ?? "";
      const photo = row[photoField] ?? "";
      const uri   = await fetchPhotoDataUri(photo);
      lines.push([esc(email), esc(uri)].join(","));
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
