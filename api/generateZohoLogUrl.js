import axios from 'axios';

export default async function handler(req, res) {
  const {
    projectId,
    taskName,
    logDate,
    totalHour,
    note,
    billStatus,
    tasks,
    accessToken
  } = req.body;

  // تحقق من المدخلات
  if (!projectId || !taskName || !logDate || !totalHour || !billStatus || !Array.isArray(tasks) || !accessToken) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    // تطابق اسم التسك
    const matchedTask = tasks.find(task =>
      task.name?.toLowerCase() === taskName.toLowerCase()
    );

    if (!matchedTask) {
      return res.status(404).json({ error: "Task name not found in tasks list" });
    }

    const taskId = matchedTask.taskId || matchedTask.id_string;
    const ownerId = matchedTask.ownerId || matchedTask.details?.owners?.[0]?.id;

    if (!ownerId) {
      return res.status(400).json({ error: "ownerId not found in matched task" });
    }

    // بناء رابط Zoho كـ Query Params
    const baseUrl = `https://projectsapi.zoho.com/restapi/portal/alnafithait/projects/${projectId}/tasks/${taskId}/logs/`;
    const queryString = `date=${logDate}&owner=${ownerId}&bill_status=${billStatus}&hours=${totalHour}&notes=${encodeURIComponent(note || "")}`;
    const fullUrl = `${baseUrl}?${queryString}`;

    // إرسال الطلب
    const response = await axios.post(fullUrl, null, {
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    // نجاح
    return res.status(200).json({
      message: `✅ تم تسجيل الساعات بنجاح\n🗓️ التاريخ: ${logDate}\n🕒 المدة: ${totalHour}\n📌 التسك: "${taskName}"`
    });

  } catch (error) {
    console.error(error.response?.data || error.message);
    return res.status(500).json({
      error: error.response?.data || "Unknown error occurred while logging hours"
    });
  }
}
