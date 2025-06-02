export default function handler(req, res) {
  const { projects, targetProjectName } = req.body;

  const project = projects.find(p => p.projectName === targetProjectName);

  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }

  return res.status(200).json({
    name: project.projectName,
    manager: project.projectManager,
    startDate: project.startDate,
    endDate: project.endDate,
    status: project.status,
    technologies: project.technologies,
    description: project.description,
  });
}
