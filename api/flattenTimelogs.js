export default function handler(req, res) {
  const input = req.body;
  const timelogDates = input?.timelogs?.date || [];

  const result = [];

  // التاريخ اللي حددته المستخدم (مثلاً "2025-06-18")
  const startDate = new Date(input?.selectdate);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 6); // نضيف 6 أيام قدام

  timelogDates.forEach(day => {
    const [month, dayNum, year] = day.date.split("-");
    const isoDateString = `${year}-${month}-${dayNum}`;
    const dateObj = new Date(isoDateString);

    const dayOfWeek = dateObj.getDay(); // 0 = أحد, ..., 6 = سبت

    // نتجاهل التواريخ قبل startDate أو بعد endDate أو الجمعة/السبت
    if (dateObj < startDate || dateObj > endDate || dayOfWeek === 5 || dayOfWeek === 6) return;

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

  result.sort((a, b) => new Date(a.date) - new Date(b.date));

  res.status(200).json(result);
}
