const express = require('express');
const app = express();

app.use(express.json());

app.post('/', (req, res) => {
  const { email, projects } = req.body;
  const filteredProjects = projects.filter(project => {
    const userUrl = project.link?.user?.url || '';
    return userUrl.includes(email);
  });
  res.json({ email, projects: filteredProjects });
});

module.exports = app;

