export default function handler(req, res) {
  const { projects, targetProjectName } = req.body;

  const matched = projects.find(
    (p) => p.projectName.trim().toLowerCase() === targetProjectName.trim().toLowerCase()
  );

  if (!matched) {
    return res.status(404).json({ message: "Project not found" });
  }

  return res.status(200).json({
    projectName: matched.projectName,
    manager: matched.manager,
    startDate: matched.startDate,
    endDate: matched.endDate,
    status: matched.status,
    id_string: matched.id_string
  });
}
