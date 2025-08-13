// api/zohoCertsCsvPaged.js
// POST body: { url: "https://people.zoho.com/people/api/forms/.../getRecords", token: "...", limit: 100 }

export default async function handler(req, res) {
  try {
    const url   = req.body?.url;                      // base url بدون sIndex/limit
    const token = req.body?.token;                    // OAuth access_token
    const limit = Number(req.body?.limit ?? 100);     // 100 أو 200 حسب رغبتك
    if (!url || !token) {
      return res.status(400).json({ error: "url and token are required" });
    }

    // إعادة المحاولة لو 429
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
      if (batch.length < limit) break;      // آخر صفحة
      sIndex += limit;                      // الصفحة التالية
    }

    // الأعمدة المطلوبة فقط (وبهذا الترتيب)
    const wantedHeaders = [
      "EmailID",
      "Department",
      "Employeestatus",
      "Full_Name",
      "Reporting_To.MailID",
      "Designation",
      "FirstName",
      "Reporting_To",
      "Profession.ID",
      "Profession",
      "LastName",
      "EmployeeID",
      "Full_Name_AR"
    ];

    if (all.length === 0) {
      return sendCsv(res, wantedHeaders, []); // هيدر فقط
    }

    // دالة: طابق المفتاح كما هو (بدون تعشيق)، case-insensitive على المستوى الأول فقط
    function getKeyCaseInsensitive(obj, key) {
      if (!obj || typeof obj !== "object") return undefined;
      const target = String(key).toLowerCase();
      const match  = Object.keys(obj).find(k => k.toLowerCase() === target);
      if (!match) return undefined;
      let v = obj[match];
      if (Array.isArray(v)) v = v[0]; // Zoho أحيانًا يرجّع Array
      return v;
    }

    // دالة: نزبط القيمة للـ CSV
    function coerceVal(v) {
      if (v == null) return "";
      if (Array.isArray(v)) return v.map(x => coerceVal(x)).join(" | ");
      if (typeof v === "object") {
        const keys = Object.keys(v);
        const has  = (k) => keys.some(x => x.toLowerCase() === k.toLowerCase());
        const pick = (k) => v[keys.find(x => x.toLowerCase() === k.toLowerCase())];
        if (has("displayValue")) return String(pick("displayValue") ?? "");
        if (has("name"))         return String(pick("name") ?? "");
        if (has("MailID"))       return String(pick("MailID") ?? "");
        if (has("ID"))           return String(pick("ID") ?? "");
        if (has("id"))           return String(pick("id") ?? "");
        try { return JSON.stringify(v); } catch { return String(v); }
      }
      return String(v);
    }

    // نبني صفوف فيها فقط الأعمدة المطلوبة (بدون أي تعشيق)
    const rows = [];
    for (const item of all) {
      if (!item || typeof item !== "object") continue;
      const recordIdKey = Object.keys(item)[0];           // غالباً RecordId
      const arr    = item[recordIdKey] ?? [];
      const fields = Array.isArray(arr) ? (arr[0] ?? {}) : (arr || {});
      const row = {};
      for (const col of wantedHeaders) {
        row[col] = coerceVal(getKeyCaseInsensitive(fields, col));
      }
      rows.push(row);
    }

    return sendCsv(res, wantedHeaders, rows);

  } catch (e) {
    return res.status(500).json({ error: e?.message || "failed" });
  }
}

// ===== helpers =====
function sendCsv(res, headers, rows) {
  const esc = (v) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [];
  lines.push(headers.map(esc).join(",")); // الهيدر بالترتيب المطلوب
  for (const r of rows) lines.push(headers.map(h => esc(r[h])).join(","));
  const csv = lines.join("\r\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=people_selected.csv");
  return res.status(200).send(csv);
}
