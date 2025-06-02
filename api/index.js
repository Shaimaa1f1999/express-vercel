const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.post('/', async (req, res) => {
  const { email, token, projects } = req.body;
  const portal = "alnafithait";
  const filteredProjects = [];

  for (const project of projects) {
    const url = project.url;
    const projectId = project.id_string;
    const projectName = project.name;
    if (!url || !projectId) continue;

    try {
      const response = await axios.get(url, {
        headers: {
          Authorization: `Zoho-oauthtoken ${token}`
        }
      });

      const users = response.data?.users ?? [];

      const match = users.find(user =>
        typeof user === 'object' &&
        user.email?.toLowerCase() === email.toLowerCase()
      );

      if (match) {
        const userId = match.id;
        const logsURL = `https://projectsapi.zoho.com/restapi/portal/${portal}/projects/${projectId}/logs/?user=${userId}`;
        filteredProjects.push({
          name: projectName,
          projectId,
          userId,
          logsURL
        });
      }

    } catch (error) {
      console.error(`Error fetching from ${url}:`, error.message);
    }
  }

  res.json({ email, logs: filteredProjects });
});

module.exports = app;
