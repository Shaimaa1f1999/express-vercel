async function fetchPhotoDataUri(photoUrl) {
  if (!photoUrl || typeof photoUrl !== "string") return "";

  // حدّد الـendpoint ونختار التوكن المناسب حسب الدومين
  let requestUrl = "";
  let useToken = token; // الافتراضي: توكن Zoho People

  try {
    const u = new URL(photoUrl);

    if (u.hostname.includes("people.zoho.com") && u.pathname.includes("/api/viewEmployeePhoto")) {
      const filename = u.searchParams.get("filename") || "";
      if (!filename) return "";
      requestUrl = `https://people.zoho.com/api/viewEmployeePhoto?filename=${encodeURIComponent(filename)}`;
      useToken = token; // People
    } else if (u.hostname.includes("contacts.zoho.com") && u.pathname.includes("/file")) {
      requestUrl = u.toString();             // Contacts رابط كما هو (thumb أو الأصل)
      useToken = contactsToken || token;     // جرّب contactsToken، وإلا جرّب نفس token (يمكن يكون شامل)
    } else {
      // fallback: نص يحتوي filename=
      const i = photoUrl.indexOf("filename=");
      if (i >= 0) {
        const filename = photoUrl.substring(i + "filename=".length);
        requestUrl = `https://people.zoho.com/api/viewEmployeePhoto?filename=${encodeURIComponent(filename)}`;
        useToken = token;
      } else {
        return "";
      }
    }
  } catch {
    // مش URL كامل → جرّب استخراج filename=
    const i = photoUrl.indexOf("filename=");
    if (i >= 0) {
      const filename = photoUrl.substring(i + "filename=".length);
      requestUrl = `https://people.zoho.com/api/viewEmployeePhoto?filename=${encodeURIComponent(filename)}`;
      useToken = token;
    } else {
      return "";
    }
  }

  // ما عندنا توكن صالح لِـ Contacts
  if (!useToken) return "";

  // نفّذ الطلب
  const r = await fetch(requestUrl, {
    headers: { Authorization: `Zoho-oauthtoken ${useToken}` }
  }).catch(() => null);

  if (!r || !r.ok) return ""; // 401/403/شبكة… → تجاهل

  // تأكد أن الرد صورة فعلاً (مو HTML لوج إن)
  const ctHeader = r.headers.get("content-type") || "";
  const mime = ctHeader.split(";")[0].trim().toLowerCase().replace("image/jpg", "image/jpeg");
  if (!mime.startsWith("image/")) return "";

  // Base64 سطر واحد
  const ab  = await r.arrayBuffer();
  if (!ab || ab.byteLength === 0) return "";
  const b64 = Buffer.from(ab).toString("base64").replace(/\r?\n/g, "");

  return `data:${mime};base64,${b64}`;
}
