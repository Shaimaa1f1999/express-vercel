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
      // لو طلع لك مستقبلاً روابط Contacts وما عندك سكوبها بيرجع فاضي (401/HTML)
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

  // نفّذ الطلب
  const r = await fetch(requestUrl, { headers: { Authorization: `Zoho-oauthtoken ${token}` } }).catch(() => null);
  if (!r || !r.ok) return "";

  // لازم يكون الرد صورة فعلًا
  const ctHeader = r.headers.get("content-type") || "";
  const mime = ctHeader.split(";")[0].trim().toLowerCase().replace("image/jpg", "image/jpeg");
  if (!mime.startsWith("image/")) return ""; // HTML login أو غيره

  // Base64 بسطر واحد وبنفس النوع
  const ab  = await r.arrayBuffer();
  if (!ab || ab.byteLength === 0) return "";
  const b64 = Buffer.from(ab).toString("base64").replace(/\r?\n/g, "");
  return `data:${mime};base64,${b64}`;
}
