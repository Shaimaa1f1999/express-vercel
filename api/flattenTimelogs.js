export default function handler(req, res) {
  const input = req.body;
  const timelogDates = input?.timelogs?.date || [];

  const result = [];

  // 🛠 نحول selectdate إلى كائن تاريخ مضبوط
  const [month, day, year] = input?.selectdate.split("/"); // لو تاريخك جاي كـ MM/DD/YYYY
  const startDate = new Date(`${year}-${month}-${day}`);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 6); // أسبوع بعد البداية

  timelogDates.forEach(day => {
    const [dMonth, dDay, dYear] = day.date.split("-");
    const isoDateString = `${dYear}-${dMonth}-${dDay}`;
    const dateObj = new Date(isoDateString);

    const dayOfWeek = dateObj.getDay(); // 5 = جمعة, 6 = سبت

    // نتجاهل الجمعة والسبت وخارج النطاق
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
