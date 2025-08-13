// api/zohoCertsCsvPaged.js
// POST body: { url: "https://people.zoho.com/people/api/forms/.../getRecords", token: "...", limit: 100 }

export default async function handler(req, res) {
  try {
    const url   = req.body?.url;
    const token = req.body?.token;
    const limit = Number(req.body?.limit ?? 100);
    if (!url || !token) {
      return res.status(400).json({ error: "url and token are required" });
    }

    // إعادة المحاولة البسيطة لو 429
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
      if (batch.length < limit) break;
      sIndex += limit;
    }

    // لو فاضي
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
      return sendCsv(res, wantedHeaders, []); // CSV فاضي مع الهيدر المطلوب
    }

    // util: جلب قيمة مسار dot-case مع تجاهل حالة الأحرف
    function getPathCaseInsensitive(obj, path) {
      if (!obj || typeof obj !== "object") return undefined;
      const segs = String(path).split(".");
      let cur = obj;
      for (const seg of segs) {
        if (cur == null) return undefined;
        const lc = seg.toLowerCase();
        const matchKey = Object.keys(cur).find(k => k.toLowerCase() === lc);
        if (!matchKey) return undefined;
        cur = cur[matchKey];
        // لو كان array ونبغى أول عنصر (زوشو أحياناً يرجّع مصفوفة)
        if (Array.isArray(cur)) cur = cur[0];
      }
      return cur;
    }

    // util: تحويل القيمة لنص مناسب للـ CSV
    function coerceVal(v) {
      if (v == null) return "";
      if (Array.isArray(v)) {
        // حوّل العناصر لنصوص مفهومة
        return v.map(x => coerceVal(x)).join(" | ");
      }
      if (typeof v === "object") {
        // قيم شائعة في Zoho: displayValue / name / MailID / ID
        const keys = Object.keys(v);
        const has = (k) => keys.some(x => x.toLowerCase() === k.toLowerCase());
        const pick = (k) => v[keys.find(x => x.toLowerCase() === k.toLowerCase())];

        if (has("displayValue")) return String(pick("displayValue") ?? "");
        if (has("name"))         return String(pick("name") ?? "");
        if (has("MailID"))       return String(pick("MailID") ?? "");
        if (has("ID"))           return String(pick("ID") ?? "");
        if (has("id"))           return String(pick("id") ?? "");
        // آخر حل: JSON مضغوط
        try { return JSON.stringify(v); } catch { return String(v); }
      }
      return String(v);
    }

    // حضّر الصفوف: فكّ هيكلة استجابة Zoho بالشكل المستخدم عندك
    const rawRows = [];
    for (const item of all) {
      if (!item || typeof item !== "object") continue;
      const recordId = Object.keys(item)[0]; // نفس منطقك السابق
      const arr = item[recordId] ?? [];
      const fields = Array.isArray(arr) ? (arr[0] ?? {}) : (arr || {});
      rawRows.push(fields);
    }

    // بِنِ قيم الأعمدة المطلوبة فقط + إزالة تكرارات محتملة (case-insensitive)
    const seen = new Set();
    const rows = [];
    for (const rec of rawRows) {
      const row = {};
      for (const colPath of wantedHeaders) {
        const val = getPathCaseInsensitive(rec, colPath);
        row[colPath] = coerceVal(val);
      }

      // مفتاح التكرار: EmployeeID > EmailID > Full_Name (كلها lower-case)
      const dedupeKey = [
        row["EmployeeID"] || "",
        row["EmailID"] || "",
        row["Full_Name"] || ""
      ].join("|").toLowerCase();

      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      rows.push(row);
    }

    // أرسل CSV
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
  lines.push(headers.map(esc).join(","));
  for (const r of rows) {
    lines.push(headers.map(h => esc(r[h])).join(","));
  }
  const csv = lines.join("\r\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=people_selected.csv");
  return res.status(200).send(csv);
}
