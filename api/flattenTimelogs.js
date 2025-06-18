export default function handler(req, res) {
  const input = req.body;
  const timelogDates = input?.timelogs?.date || [];

  const result = [];

  // التاريخ اللي حدده المستخدم (بداية الفلترة)
  const startDate = new Date(input?.selectdate + "T00:00:00");

  timelogDates.forEach(day => {
    if (!day?.date) return;

    // صيغة التاريخ جايه MM-DD-YYYY من Zoho
    const [mm, dd, yyyy] = day.date.split("-");
    const isoDateString = `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
    const dateObj = new Date(isoDateString + "T00:00:00");

    // نفلتر: فقط التواريخ من startDate وفوق
    if (dateObj.toDateString() < startDate.toDateString()) return;

    const total_hours = day.total_hours;

    (day.tasklogs || []).forEach(log => {
      result.push({
        date: isoDateString,
        name: log?.task?.name || '',
        total_hours,
        approval_status: log?.approval_status || ''
      });
    });
  });

  // ترتيب حسب التاريخ
  result.sort((a, b) => new Date(a.date) - new Date(b.date));

  res.status(200).json(result);
}
