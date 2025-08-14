// api/zohoCertsCsvPaged.js
// POST body: {
//   url:"https://people.zoho.com/people/api/forms/employee/getRecords?",
//   token:"...",
//   limit:100,
//   fileName:"export.csv"
//   // ما تحتاج تمرر photoField - الكود يلقطه تلقائيًا
//   // تقدر تمرر emailField لو اسم الإيميل مو EmailID
// }

export default async function handler(req, res) {
  try {
    const url        = req.body?.url;
    const token      = req.body?.token;
    const limit      = Number(req.body?.limit ?? 100);
    const fileName   = req.body?.fileName ?? "export.csv";
    const emailField = req.body?.emailField ?? "EmailID";
    if (!url || !token) return res.status(400).json({ error: "url and token are required" });

    // --- helpers ---
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const esc = (v) => {
      if (v === null || v === undefined) return "";
      const s = String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };

    async function fetchPage(sIndex, attempt = 1) {
      const u = `${url}${url.includes("?") ? "&" : "?"}sIndex=${sIndex}&limit=${limit}`;
      const r = await fetch(u, { headers: { Authorization: `Zoho-oauthtoken ${token}` } });
      if (r.status === 429 && attempt <= 3) { await sleep(1000 * attempt); return fetchPage(sIndex, attempt + 1); }
      if (!r.ok) { const txt = await r.text().catch(()=>""); throw new Error(`Fetch failed ${r.status}: ${txt || r.statusText}`); }
      return r.json();
    }

    // يلتقط أول رابط صورة صالح من الصف (People أو Contacts)
    function pickPhotoUrl(row) {
      // مرشحات بالقيمة أولاً (أضمن)
      for (const [k, v] of Object.entries(row)) {
        if (typeof v !== "string") continue;
        const val = v.toLowerCase();
        if (val.includes("zoho.com")) {
          if (val.includes("/api/viewemployeephoto") || val.includes("/file?")) return v;
        }
      }
      // وبالأسماء ثانياً (لو الرابط مو كامل)
      const candidates = Object.keys(row).filter(k => /photo|image|avatar|pic/i.test(k));
      for (const k of candidates) {
        const v = row[k];
        if (typeof v === "string" && v) return v;
      }
      return "";
    }

    // يخمّن نوع الصورة لو السيرفر رجّع octet-stream
    function sniffMime(buf) {
      if (!buf || buf.byteLength < 12) return "image/jpeg";
      const b = new Uint8Array(buf);
      // JPEG: FF D8 FF
      if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return "image/jpeg";
      // PNG: 89 50 4E 47
      if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return "image/png";
      // WEBP: RIFF....WEBP
      if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
          b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
      return "image/jpeg";
    }

    async function fetchPhotoDataUri(photoUrl) {
      if (!photoUrl || typeof photoUrl !== "string") return "";

      // حدد الـendpoint
      let requestUrl = "";
      try {
        const u = new URL(photoUrl);
        if (u.hostname.includes("people.zoho.com") && u.pathname.includes("/api/viewEmployeePhoto")) {
          const filename = u.searchParams.get("filename") || "";
          if (!filename) return "";
          requestUrl = `https://people.zoho.com/api/viewEmployeePhoto?filename=${encodeURIComponent(filename)}`;
        } else if (u.hostname.includes("contacts.zoho.com") && u.pathname.includes("/file")) {
          // بدون سكوب Contacts بيرجع 401/HTML → بنرجّع فاضي
          requestUrl = u.toString();
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

      // نفّذ الطلب مع retry بسيط (429/شبكة)
      let r = null, attempt = 1;
      while (attempt <= 3) {
        r = await fetch(requestUrl, { headers: { Authorization: `Zoho-oauthtoken ${token}` } }).catch(() => null);
        if (r && (r.ok || r.status !== 429)) break;
        await sleep(500 * attempt++);
      }
      if (!r || !r.ok) return "";

      // لازم يكون الرد صورة
      let mime = (r.headers.get("content-type") || "").split(";")[0].trim().toLowerCase().replace("image/jpg", "image/jpeg");
      const ab = await r.arrayBuffer();
      if (!ab || ab.byteLength === 0) return "";
      if (!mime || mime === "application/octet-stream") mime = sniffMime(ab);
      if (!mime.startsWith("image/")) return "";

      const b64 = Buffer.from(ab).toString("base64").replace(/\r?\n/g, "");
      return `data:${mime};base6
