export default function handler(req, res) {
  const input = req.body;
  const timelogDates = input?.timelogs?.date || [];

  const result = [];

  timelogDates.forEach(day => {
    const date = day.date;
    const total_hours = day.total_hours;

    (day.tasklogs || []).forEach(log => {
      result.push({
        date,
        name: log?.task?.name || '',
        total_hours,
        approval_status: log?.approval_status || ''
      });
    });
  });

  res.status(200).json(result);
}
