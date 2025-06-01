const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

app.post('/', async (req, res) => {
  const { email, token, projects } = req.body;
  const filteredProjects = [];

  for (const project of projects) {
    const url = project.link?.user?.url;
    if (!url) continue;

    try {
      const response = await axios.get(url, {
        headers: {
          Authorization: `Zoho-oauthtoken ${token}`
        }
      });

      const users = response.data;

      const match = users.some(user =>
        (typeof user === 'string' && user.includes(email)) ||
        (typeof user === 'object' && user.email?.includes(email))
      );

      if (match) filteredProjects.push(project);
    } catch (error) {
      console.error(`Error fetching from ${url}:`, error.message);
    }
  }

  res.json({ email, projects: filteredProjects });
});

module.exports = app;
