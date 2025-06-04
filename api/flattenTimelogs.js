const express = require('express');
const app = express();
app.use(express.json());

app.post('/flattenTimelogs', (req, res) => {
  const input = req.body;
  const timelogDates = input?.body?.timelogs?.date || [];

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

  res.json(result);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));
